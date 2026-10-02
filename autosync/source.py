"""Read the public MABA competition pages on Genius Sports.

Everything here is a plain HTTP GET of a page anyone can open in a browser, followed
by reading the same elements the earlier browser-side sync read (scrape_comp.js):

  fixtures(html)      schedule page      -> [[mid, status, dt, venue, home, hs, away, as]]
  box(html)           box score page     -> {home: {players, totals}, away: {...}}
  pbp(html)           play-by-play page  -> [[period, team 0/1/2, "MM:SS", score, num, name, action]]
  leaders(html)       leaders page       -> [{cat, rows: [{pid, name, v}]}]
  pstats(html)        player statistics  -> (heads, rows)
  standings pages     every phase x pool -> {phases, tables: [{phase, pool, poolName, heads, rows}]}

The fetcher identifies itself, waits between requests and never runs more than a
few at once: the source is someone else's server.
"""
import gzip, os, re, threading, time, urllib.error, urllib.parse, urllib.request

from bs4 import BeautifulSoup

HOST = 'https://hosted.dcd.shared.geniussports.com'
BASE = HOST + '/maba/en/competition/'
UA = 'HoopStatsMY-sync/1.0 (+https://etiennecheah.github.io/malaysiabasketballstatistics/)'
GAP = 0.6            # seconds between two requests leaving the same worker
_last = threading.local()


class SourceError(Exception):
    pass


def _saved(url, folder):
    """Test mode: read a page saved earlier instead of asking the source (HOOPSTATS_PAGES=<folder>)."""
    k = url.replace(BASE, '')
    name = (k.split('/')[0] + '_std_' if '/standings?' in k else '') + re.sub(r'[^A-Za-z0-9._-]+', '_', k)
    p = os.path.join(folder, re.sub(r'[^A-Za-z0-9._-]+', '_', name) + '.html')
    if not os.path.exists(p):
        raise SourceError('no saved page for ' + k)
    return open(p, encoding='utf-8').read()


def get(url, tries=3, timeout=75):
    """One page as text. Retries a failed request; raises SourceError when it stays failed."""
    if os.environ.get('HOOPSTATS_PAGES'):
        return _saved(url, os.environ['HOOPSTATS_PAGES'])
    url = urllib.parse.quote(url, safe=':/?&=%')
    err = None
    for k in range(tries):
        wait = GAP - (time.time() - getattr(_last, 't', 0))
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip',
                                                       'Accept': 'text/html'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    raw = gzip.decompress(raw)
                _last.t = time.time()
                return raw.decode('utf-8', 'replace')
        except (urllib.error.URLError, OSError, EOFError) as e:
            err = e
            _last.t = time.time()
            time.sleep(2 + 3 * k)
    raise SourceError('%s: %s' % (url, err))


def soup(html):
    # html5lib builds the tree a browser builds, which is what the selectors below were written against
    return BeautifulSoup(html, 'html5lib')


def _t(el):
    return el.get_text().strip() if el is not None else ''


def _q(el, sel):
    return _t(el.select_one(sel))


# ---- schedule -------------------------------------------------------------------
def fixtures(html):
    out = []
    for w in soup(html).select('div.match-wrap'):
        cls = ' '.join(w.get('class') or [])
        m = re.search(r'STATUS_(\w+)', cls)
        out.append([(w.get('id') or '').replace('extfix_', ''), m.group(1) if m else None,
                    _q(w, '.match-time span'), _q(w, '.venuename'),
                    _q(w, '.home-team .team-name-full'), _q(w, '.homescore .fake-cell'),
                    _q(w, '.away-team .team-name-full'), _q(w, '.awayscore .fake-cell')])
    return out


# ---- box score ------------------------------------------------------------------
def _pid(a):
    m = re.search(r'person/(\d+)', (a.get('href') or '') if a is not None else '')
    return m.group(1) if m else ''


def _cells(tr):
    return [c.get_text().strip() for c in tr.find_all(['td', 'th'], recursive=False)]


def box(html):
    T = []
    for t in soup(html).select('table')[:2]:
        players = []
        for r in t.select('tbody tr'):
            c = _cells(r)
            if len(c) >= 25:
                players.append({'pid': _pid(r.select_one('a[href*="/person/"]')), 'c': c})
        tot = [_cells(r) for r in t.select('tfoot tr')]
        T.append({'players': players, 'totals': tot[0] if tot else None})
    if len(T) < 2:
        return None
    return {'home': T[0], 'away': T[1]}


# ---- play-by-play ---------------------------------------------------------------
def pbp(html):
    """Raw events in the data/pbp_raw format. Overtime periods carry class per_ot
    with per_1, per_2... and are stored as 5, 6..."""
    out = []
    for e in soup(html).select('#playbyplay .pbpa'):
        cl = ' '.join(e.get('class') or [])
        m = re.search(r'per_(\d+)', cl)
        per = int(m.group(1)) if m else 0
        if re.search(r'per_ot', cl):
            per += 4
        m = re.search(r'pbpt(\d)', cl)
        tm = int(m.group(1)) if m else 0
        sc = _t(e.select_one('.pbpsc'))
        clk = ''
        t = e.select_one('.pbp-time')
        if t is not None:
            c = BeautifulSoup(str(t), 'html.parser')
            for x in c.select('.pbpsc,.pbp-period'):
                x.extract()
            clk = c.get_text().strip()[:5]
        num = name = act = ''
        a = e.select_one('.pbp-action')
        if a is not None:
            c = BeautifulSoup(str(a), 'html.parser')
            s = c.select_one('strong')
            if s is not None:
                st = s.get_text().strip()
                m = re.match(r'^(\d+),\s*(.*)$', st, re.S)
                if m:
                    num, name = m.group(1), m.group(2)
                else:
                    name = st
                s.extract()
            act = re.sub(r'^\s*,\s*', '', c.get_text()).strip()
        out.append([str(per), tm, clk, sc, num, name, act])
    return out


# ---- leaders --------------------------------------------------------------------
def leaders(html):
    out = []
    for b in soup(html).select('.leader-block'):
        rows = []
        f = b.select_one('.leader-first')
        if f is not None and f.select_one('.leader-first-value') is not None and f.select_one('.ld-name a') is not None:
            v = BeautifulSoup(str(f.select_one('.leader-first-value')), 'html.parser')
            for x in v.select('.ld-statname'):
                x.extract()
            a = f.select_one('.ld-name a')
            rows.append({'pid': _pid(a), 'name': _t(a), 'v': v.get_text().strip()})
        for r in b.select('table tr'):
            td = r.find_all('td')
            if len(td) < 3:
                continue
            rows.append({'pid': _pid(td[0].find('a')), 'name': _t(td[0]), 'v': _t(td[-1])})
        out.append({'cat': _q(b, '.leader-header'), 'rows': rows})
    return out


# ---- a player's published season lines -------------------------------------------
def pstats(html):
    for t in soup(html).select('table'):
        heads = [_t(h) for h in t.select('th')]
        if 'Competition' in heads:
            rows = [_cells(r) for r in t.select('tbody tr') if r.find('td') is not None]
            return heads, rows
    return None, []


# ---- standings: every phase and every pool ----------------------------------------
def standings_page(html):
    """One standings page -> (links, table). links: [(href, text, pool number or '')]."""
    s = soup(html)
    links = []
    for a in s.select('.standings-widget a.menuoption'):
        href = a.get('href') or ''
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(href).query)
        links.append({'href': href, 'text': _t(a), 'phase': (q.get('phaseName') or [''])[0],
                      'pool': (q.get('poolNumber') or [''])[0],
                      'current': 'currentoption' in (a.get('class') or [])})
    t = s.select_one('.standings-widget table')
    heads, rows = [], []
    if t is not None:
        heads = [_t(h) for h in t.select('thead th')]
        rows = [_cells(r) for r in t.select('tbody tr') if r.find('td') is not None]
    return links, heads, rows


def standings(cid, fetch=get):
    """Crawl base page -> every phase -> every pool. The base page serves whichever
    phase/pool is currently selected, which is often not the first."""
    base = BASE + cid + '/standings'
    links, heads, rows = standings_page(fetch(base))
    phases = [l for l in links if not l['pool']]
    if not phases:                     # a competition with a single table and no menu
        return {'phases': [], 'tables': [{'phase': '', 'pool': '', 'poolName': '', 'heads': heads, 'rows': rows}]}
    tables = []
    for ph in phases:
        l2, h2, r2 = standings_page(fetch(ph['href']))
        pools = [l for l in l2 if l['pool'] and l['phase'] == ph['phase']]
        if not pools:
            tables.append({'phase': ph['text'], 'pool': '', 'poolName': '', 'heads': h2, 'rows': r2})
            continue
        for po in pools:
            _, h3, r3 = standings_page(fetch(po['href']))
            tables.append({'phase': ph['text'], 'pool': po['pool'], 'poolName': po['text'], 'heads': h3, 'rows': r3})
    return {'phases': [p['text'] for p in phases], 'tables': tables}
