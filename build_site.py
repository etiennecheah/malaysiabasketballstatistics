#!/usr/bin/env python3
"""Build the published site into public/: the app, its data and a page per player, competition, team and box score (prerender.js)."""
import re, json, os, io, sys, shutil, base64, hashlib, subprocess, urllib.parse

R = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(R, 'assets')
D = os.path.join(R, 'data')

PARTS = ['app0_router.js', 'app1_core.js', 'app2_nav.js', 'app3_comp.js', 'app3b_family.js', 'app4_players.js',
         'app4b_profile.js', 'app4c_impact.js', 'app4d_radar.js', 'app4e_compare.js',
         'app4f_bpm.js', 'app4g_formulas.js', 'app4h_videos.js', 'app4i_games.js',
         'app4j_match.js', 'app4k_teams.js', 'app4l_profile2.js', 'app4m_pathway.js', 'app4n_live.js', 'app4o_home.js', 'app4p_account.js', 'app4q_stats.js', 'app4r_news.js', 'app4s_watch.js', 'app4t_meta.js', 'app4u_shots.js', 'app4w_shot3d.js', 'app4x_cmpshots.js', 'app4v_report.js', 'app5_rest.js']

NEWS_TYPES = ('signing', 'transfer', 'departure', 'injury', 'return', 'retirement', 'national', 'other')



# the career path's short name for a competition (app4l_profile2.js pvShortKey + app1_core.js
# tierShort); hand-kept honours are written with it ("National U15", "Agong Cup", "MBL")
_PV_SHORT = {'MABA/MATRIX 17 & Below': 'National', 'MILO Lum Mun Chak Cup': 'National'}
_TIER_ABBR = {'Malaysia D-League': 'D-League', 'Major Basketball League': 'MBL',
              'MABA/MATRIX 17 & Below': 'MATRIX 17U', 'MILO Lum Mun Chak Cup': 'Lum Mun Chak',
              'MABA/MATRIX Cup': 'MATRIX Cup', 'Schools Championship': 'Schools',
              'NXT Championship': 'NXT', 'Sukan Malaysia': 'SUKMA', 'Sukan Selangor': 'SUKSES',
              "Women's Basketball Alliance": 'WMBA'}


def path_short(c):
    s, lvl = c.get('series') or '', c.get('level') or ''
    if s in _PV_SHORT:
        return _PV_SHORT[s] + (' ' + lvl if lvl and lvl != 'Open' else '')
    a = _TIER_ABBR.get(s, s)
    return a if lvl == 'Open' else a + ' ' + lvl


def honour_targets(payload):
    """person id -> [(year, short name, competition id, team)] for every line with games."""
    keys = payload['pkeys']
    gi = keys.index('g')
    out = {}
    for c in payload['comps']:
        sh = path_short(c)
        for r in c['players']:
            if len(r) > gi and r[gi]:
                out.setdefault(r[0], []).append((c.get('year'), sh, c['id'], r[1] or ''))
    return out


def link_honour(h, lines):
    """The competition a cid-less honour describes: same year, same short name, and the
    player's team there when the honour names one. Only an unambiguous match counts."""
    cand = [x for x in lines if x[0] == h.get('year') and x[1] == h.get('short')]
    if h.get('team') and len(cand) > 1:
        t = str(h['team']).strip().lower()
        cand = [x for x in cand if x[3].strip().lower() == t]
    return cand[0][2] if len(cand) == 1 else None


def load_news(payload):
    """data/news.json -> the News page's items, newest first. Each item's player is tied to
    his profile: by the pid given, or by looking the name up (same words in any order, so
    'Wee Yong Gan' finds 'Yong Gan Wee'). An item whose player is not found stays, without a card."""
    import re
    p = os.path.join(D, 'news.json')
    if not os.path.exists(p):
        return []
    try:
        raw = json.load(open(p, encoding='utf-8'))
    except ValueError as e:
        raise SystemExit('data/news.json is not valid JSON: %s' % e)
    items = raw.get('items', []) if isinstance(raw, dict) else raw
    persons, palias = payload['persons'], payload.get('palias') or {}
    words = lambda s: tuple(sorted(re.sub(r'[^a-z0-9 ]+', ' ', str(s).lower()).split()))
    by_words = {}
    for pid, name in persons.items():
        by_words.setdefault(words(name), []).append(pid)
    out, loose = [], []
    for i, it in enumerate(items):
        date = str(it.get('date') or '')
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) or not str(it.get('text') or '').strip():
            raise SystemExit('data/news.json item %d needs a date (YYYY-MM-DD) and a text' % (i + 1))
        o = {'date': date, 'type': it.get('type') if it.get('type') in NEWS_TYPES else 'other', 'text': str(it['text']).strip()}
        for k in ('name', 'to', 'from', 'league', 'note', 'link'):
            if str(it.get(k) or '').strip():
                o[k] = str(it[k]).strip()
        pid = str(it.get('pid') or '').strip()
        pid = palias.get(pid, pid)
        if pid not in persons:
            hit = by_words.get(words(it.get('name') or ''), [])
            pid = hit[0] if len(hit) == 1 else ''
        if pid:
            o['pid'] = pid
        else:
            loose.append(o.get('name') or o['text'][:40])
        out.append((date, -i, o))
    out.sort(key=lambda x: (x[0], x[1]), reverse=True)
    print('news: %d items, %d tied to a profile%s' % (len(out), len(out) - len(loose),
                                                      (' | not found: ' + '; '.join(loose)) if loose else ''))
    return [o for _, _, o in out]


YT_ID = re.compile(r'(?:youtu\.be/|youtube\.com/(?:live/|embed/|shorts/|watch\?(?:.*&)?v=))([A-Za-z0-9_-]{11})')


def load_streams(payload):
    """data/streams.json: {"games": {match id: YouTube link or video id}}. The Watch page
    (#/watch/<mid>) plays the video beside the game's statistics. A link that names no
    video stops the build with the reason; a match id the database does not hold yet is skipped until it does."""
    p = os.path.join(D, 'streams.json')
    if not os.path.exists(p):
        return {}
    games = json.load(open(p)).get('games', {})
    known = {g['mid'] for c in payload['comps'] for g in c['games']}
    out, waiting = {}, []
    for mid, link in games.items():
        link = str(link).strip()
        m = YT_ID.search(link)
        vid = m.group(1) if m else (link if re.fullmatch(r'[A-Za-z0-9_-]{11}', link) else None)
        if not vid:
            raise SystemExit('streams.json: %s: "%s" is not a YouTube link' % (mid, link))
        if str(mid) not in known:
            # a game added ahead of the sync (a final posted an hour before tip-off): kept in the file and
            # picked up by the first build after the sync reads the fixture; it must not stop the build
            waiting.append(str(mid))
            continue
        out[str(mid)] = vid
    print('streams: %d game(s) with a video%s' % (len(out), (' | not in the database yet: ' + ', '.join(waiting)) if waiting else ''))
    return out


def main():
    css = open(os.path.join(A, 'style.css')).read()
    payload = json.load(open(os.path.join(D, 'site_data.json')))
    # BPM is computed from the finished payload (it needs the box scores and the
    # schedule), so it is folded in here rather than inside build_data.py
    bp = os.path.join(D, 'bpm.json')
    if os.path.exists(bp):
        b = json.load(open(bp))
        payload['bpm'], payload['bpmMeta'] = b['bpm'], b['meta']
        # PER / USG% / Win Shares, one row per rated player per competition:
        # [per, usg, ows, dws, ws, ws40, ortg, drtg, minutes]
        payload['adv'] = b.get('adv', {})
    # Play-by-play is NOT inlined (it is ~100 MB across all games). The payload
    # carries only the list of match ids that have it; the compact per-competition
    # file pbp/<cid>.js is pulled in on demand by the loader in app4j_match.js.
    pg = os.path.join(D, 'pbp_games.json')
    if os.path.exists(pg):
        payload['pbpGames'] = json.load(open(pg))
    pper = os.path.join(D, 'pbp_periods.json')
    if os.path.exists(pper):
        payload['pbpPer'] = json.load(open(pper))
    # On/off from the rebuilt lineups (build_lineups.py): per competition, per player
    # [on min, on net/100, off net/100, on-off, 80% lo, 80% hi, on-court +/-, games on,
    #  on possessions, share of the team's games with clean lineups]
    lp = os.path.join(D, 'lineups.json')
    if os.path.exists(lp):
        L = json.load(open(lp))
        payload['onoff'], payload['onoffMeta'] = L['onoff'], L['meta']
    # hand-kept honours (titles, MVPs, stat awards), keyed by person id
    hp = os.path.join(D, 'honours.json')
    if os.path.exists(hp):
        H = {}
        alias = payload.get('palias', {})
        linkable = honour_targets(payload)
        linked = 0
        for k, v in json.load(open(hp)).items():
            if k.startswith('_'):
                continue
            k = alias.get(k, k)          # an honour filed on a merged-away id follows the player
            dst = H.setdefault(k, [])
            for h in v:
                # an honour typed in before its competition was imported names no cid; once the
                # player's line for that event is in the database, the honour belongs to it, or the
                # career path shows the event twice (once as the honour, once as the stat line)
                if not h.get('cid'):
                    c = link_honour(h, linkable.get(k, []))
                    if c:
                        h = dict(h, cid=c)
                        linked += 1
                same = next((x for x in dst if (h.get('cid') and x.get('cid') == h.get('cid')) or
                             (not h.get('cid') and not x.get('cid') and x.get('year') == h.get('year') and x.get('short') == h.get('short'))), None)
                if same:
                    same['awards'] += [a for a in h['awards'] if a not in same['awards']]
                    same['champ'] = same.get('champ') or h.get('champ')
                else:
                    dst.append(dict(h))
            dst.sort(key=lambda x: -(x.get('year') or 0))
        payload['honours'] = H
        if linked:
            print('honours: %d linked to a competition now in the database' % linked)
    # people the user asked to add who have no competition in the database yet
    xp = os.path.join(D, 'extra_persons.json')
    if os.path.exists(xp):
        X = {k: v for k, v in json.load(open(xp)).items() if not k.startswith('_')}
        for pid, v in X.items():
            payload['persons'].setdefault(pid, v['name'])
        payload['extraPersons'] = X
    # hand-kept extras per player: hero badges and career moves outside the database
    pe = os.path.join(D, 'player_extras.json')
    if os.path.exists(pe):
        alias = payload.get('palias', {})
        payload['playerExtras'] = {alias.get(k, k): v for k, v in json.load(open(pe)).items() if not k.startswith('_')}
    # national-team caps from FIBA (fiba_match.py --write), one row per event, following merges
    nc = os.path.join(D, 'national_caps.json')
    if os.path.exists(nc):
        alias = payload.get('palias', {})
        caps = {}
        for k, rows in json.load(open(nc)).items():
            L = caps.setdefault(alias.get(k, k), [])
            for r in rows:
                if not any(x['y'] == r['y'] and x['e'] == r['e'] for x in L):
                    L.append(r)
        # caps from hand-imported FIBA competitions (import_fibalive.py)
        mcp = os.path.join(D, 'manual_comps.json')
        if os.path.exists(mcp):
            for k, rows in json.load(open(mcp)).get('caps', {}).items():
                L = caps.setdefault(alias.get(k, k), [])
                for r in rows:
                    if not any(x['y'] == r['y'] and x['e'] == r['e'] for x in L):
                        L.append(r)
                L.sort(key=lambda c: (-c['y'], c['e']))
        payload['caps'] = caps
    # SidelineHoopsMY uploads for the Videos grid (snapshot; the player streams the live playlist)
    vp = os.path.join(D, 'videos.json')
    if os.path.exists(vp):
        payload['videos'] = json.load(open(vp))
    # the Watch page: which YouTube video shows which game (data/streams.json, hand-kept)
    payload['streams'] = load_streams(payload)
    # the FIBA wordmark doubles as the competition mark for FIBA events
    if payload.get('logos', {}).get('fiba'):
        payload.setdefault('complogos', {})['fiba'] = payload['logos']['fiba']
    # the News page: signings, transfers, departures, injuries (data/news.json, hand-kept)
    payload['news'] = load_news(payload)
    # the Stats pages (Lineups, Clutch): which competitions each offers; the numbers load per competition
    # the Shot map tab: which players have shots in which competition; the shots load per competition
    shp = os.path.join(D, 'shots_index.json')
    if os.path.exists(shp):
        payload['shotIdx'] = json.load(open(shp))
    sp = os.path.join(D, 'stats_index.json')
    if os.path.exists(sp):
        payload['stats'] = json.load(open(sp))
    # Square head crops for the small avatar discs. avatars.py cuts them once (OpenCV finds the face)
    # and they are kept in data/avatars/, each named after the portrait it was cut from, so the
    # build itself needs no image libraries. A portrait without a crop is cut now if the libraries
    # are installed; where they are not, the build stops rather than publish badly framed faces
    # (which is what happened when the build first ran on GitHub, where OpenCV is not installed).
    import base64, hashlib
    photos = payload.get('photos', {})
    adir = os.path.join(D, 'avatars')
    av, todo = {}, {}
    for pid, uri in photos.items():
        p = os.path.join(adir, hashlib.sha1(uri.encode()).hexdigest()[:16] + '.webp')
        if os.path.exists(p):
            av[pid] = 'data:image/webp;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
        else:
            todo[pid] = (uri, p)
    if todo:
        try:
            import avatars
        except ImportError as e:
            raise SystemExit('avatars: %d portrait(s) have no face crop in data/avatars/ and one cannot be cut here (%s). '
                             'Run build_site.py where OpenCV and Pillow are installed, then add data/avatars/.' % (len(todo), e))
        os.makedirs(adir, exist_ok=True)
        made, nf = avatars.build({pid: u for pid, (u, p) in todo.items()})
        for pid, (u, p) in todo.items():
            with open(p, 'wb') as f:
                f.write(base64.b64decode(made[pid].split(',', 1)[1]))
        print('avatars: cut %d new face crops, %d faces found' % (len(made), nf))
        av = {pid: av.get(pid) or made[pid] for pid in photos}        # the portraits' order
    payload['avatars'] = av
    print('avatars: %d for %d portraits' % (len(av), len(photos)))
    write_site(payload, css)


# ---- the published site ---------------------------------------------------------------
# public/ holds everything GitHub Pages serves: one HTML file per page (prerender.js), the
# app's script and stylesheet, the data in two script files and the images as files. The
# data, script and stylesheet names carry a hash of their content, so a browser can keep
# them and a new build is never mixed with an old one.
CONFIG = os.path.join(D, 'site_config.json')
MORE_KEYS = ('bpm', 'bpmMeta', 'adv', 'onoff', 'onoffMeta', 'pbpPer')   # loaded after the first page is drawn
IMG_KEYS = ('logos', 'photos', 'avatars', 'complogos', 'flags')
MIME_EXT = {'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/gif': 'gif'}


def site_config():
    cfg = json.load(open(CONFIG))
    url = cfg['url'].rstrip('/') + '/'
    return dict(cfg, url=url, base=urllib.parse.urlparse(url).path or '/')


def put(out, rel, content):
    full = os.path.join(out, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'wb') as f:
        f.write(content if isinstance(content, bytes) else content.encode('utf-8'))
    return len(content)


def hashed(out, base, stem, ext, content):
    h = hashlib.sha1(content.encode('utf-8')).hexdigest()[:10]
    rel = 'assets/%s.%s.%s' % (stem, h, ext)
    put(out, rel, content)
    return base + rel


def externalize_images(payload, out, base):
    """data: URIs in the payload become files under img/, named by their content."""
    n, size = 0, 0
    for key in IMG_KEYS:
        m = payload.get(key) or {}
        for k, uri in list(m.items()):
            if not isinstance(uri, str) or not uri.startswith('data:'):
                continue
            head, body = uri.split(',', 1)
            mime = head[5:].split(';')[0]
            raw = base64.b64decode(body) if ';base64' in head else urllib.parse.unquote_to_bytes(body)
            name = 'img/%s.%s' % (hashlib.sha1(raw).hexdigest()[:12], MIME_EXT.get(mime, 'bin'))
            if not os.path.exists(os.path.join(out, name)):
                size += put(out, name, raw)
                n += 1
            m[k] = base + name
    return n, size


def write_site(payload, css):
    cfg = site_config()
    url, base = cfg['url'], cfg['base']
    out = os.path.join(R, 'public')
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    n_img, img_bytes = externalize_images(payload, out, base)
    more = {k: payload.pop(k) for k in MORE_KEYS if k in payload}
    more_url = hashed(out, base, 'db-more', 'js', 'HS.more(' + json.dumps(more, separators=(',', ':')) + ');')
    payload['more'] = more_url
    db = 'var DB=' + json.dumps(payload, separators=(',', ':')) + ';'
    db_url = hashed(out, base, 'db', 'js', db)
    js = '\n\n'.join(open(os.path.join(A, p)).read() for p in PARTS)
    js_url = hashed(out, base, 'app', 'js', js)
    css_url = hashed(out, base, 'style', 'css', css)
    for f in ('og.png', 'favicon.png'):
        if os.path.exists(os.path.join(A, f)):
            shutil.copy(os.path.join(A, f), os.path.join(out, f))
    # three.js for the 3D shot map, fetched by app4w_shot3d.js only when that view first opens
    # (the version is in the name, so it is cached for good)
    vendor = os.path.join(A, 'vendor')
    if os.path.isdir(vendor):
        shutil.copytree(vendor, os.path.join(out, 'vendor'))
    verify = ('<meta name="google-site-verification" content="%s">\n' % html_esc(cfg['google_verification'])) if cfg.get('google_verification') else ''
    # the password screen (site_config.json "gate_sha256": SHA-256 of the password; empty = an open site).
    # It hides the pages from casual visitors only: GitHub Pages still serves every file to anyone.
    g = (cfg.get('gate_sha256') or '').strip().lower()
    gate = (GATE_HEAD.replace('@HASH@', g), GATE_BODY) if g else ('', '')
    shell = SHELL.format(base=base, site=url, css=css_url, db=db_url, js=js_url, verify=verify, gatehead=gate[0], gatebody=gate[1])
    tmp = os.path.join(D, 'shell.tmp')
    open(tmp, 'w').write(shell)
    sh = subprocess.run(['node', os.path.join(R, 'prerender.js'), out, tmp, url,
                         os.path.join(out, db_url[len(base):]), os.path.join(out, js_url[len(base):])],
                        capture_output=True, text=True)
    os.remove(tmp)
    sys.stdout.write(sh.stdout)
    if sh.returncode:
        raise SystemExit('prerender failed:\n' + sh.stderr[-3000:])
    if sh.stderr.strip():
        print(sh.stderr.strip()[-2000:])
    first = len(db) + len(js) + len(css)
    print('site: %s  data %.2f MB (+%.2f MB after the first page), app %d kB, css %d kB, %d images (%.2f MB)'
          % (url, len(db) / 1048576, os.path.getsize(os.path.join(out, more_url[len(base):])) / 1048576,
             len(js) / 1024, len(css) / 1024, n_img, img_bytes / 1048576))


def html_esc(s):
    return str(s).replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


# {{…}} are filled per page by prerender.js; {…} here, once per build
SHELL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{{{TITLE}}}}</title>
<meta name="description" content="{{{{DESC}}}}">
{{{{ROBOTS}}}}<link rel="canonical" href="{{{{URL}}}}">
<meta property="og:site_name" content="HoopStatsMY">
<meta property="og:type" content="website">
<meta property="og:title" content="{{{{OGTITLE}}}}">
<meta property="og:description" content="{{{{DESC}}}}">
<meta property="og:url" content="{{{{URL}}}}">
<meta property="og:image" content="{site}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="hs-base" content="{base}">
{verify}<link rel="icon" type="image/png" href="{base}favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Archivo+Narrow:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{css}">
<script>try{{var t=localStorage.getItem("hsmy-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}}catch(e){{}}</script>
{gatehead}<script defer src="{db}"></script>
<script defer src="{js}"></script>
{{{{LD}}}}
</head>
<body>
{gatebody}<div id="app">{{{{APP}}}}</div>
</body>
</html>
"""


# The password screen, written into every page. The check runs in <head> before anything is
# drawn: without the right token in this browser the page is hidden and the screen shown. The
# password is compared as a SHA-256 hash; a right answer is remembered in localStorage.
GATE_HEAD = """<script>(function(){var ok=false;try{ok=localStorage.getItem("hs-gate")==="@HASH@";}catch(e){}if(!ok)document.documentElement.className+=" hs-locked";window.HS_GATE="@HASH@";})();</script>
<style>#hs-gate{display:none}html.hs-locked body>#app{display:none!important}html.hs-locked,html.hs-locked body{overflow:hidden;background:#0b111c}
html.hs-locked #hs-gate{display:flex;position:fixed;inset:0;z-index:2147483647;align-items:center;justify-content:center;padding:24px 16px;color:#eef2f8;font-family:Archivo,system-ui,sans-serif;
background:radial-gradient(60% 80% at 0% 0%,rgba(77,147,234,.28),transparent 60%),radial-gradient(60% 80% at 100% 100%,rgba(240,146,76,.22),transparent 60%),#0b111c}
#hs-gate form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:12px;text-align:center}
#hs-gate .w{font:800 26px "Archivo Narrow",Archivo,system-ui,sans-serif;letter-spacing:.02em}#hs-gate .w i{display:inline-block;width:10px;height:10px;border-radius:2px;background:#f0924c;margin-right:8px;vertical-align:middle}
#hs-gate p{margin:0 0 6px;color:#9aa6bd;font-size:14px;line-height:1.5}
#hs-gate input{font:500 16px Archivo,system-ui,sans-serif;padding:12px 14px;border-radius:10px;border:1px solid rgba(140,160,200,.35);background:rgba(255,255,255,.06);color:#eef2f8;outline:none}
#hs-gate input:focus{border-color:#4d93ea;box-shadow:0 0 0 3px rgba(77,147,234,.3)}
#hs-gate button{font:700 15px Archivo,system-ui,sans-serif;padding:12px;border:0;border-radius:10px;background:#eef2f8;color:#0b111c;cursor:pointer}
#hs-gate button:focus-visible{outline:2px solid #4d93ea;outline-offset:2px}#hs-gate .e{min-height:20px;color:#ff8fa3;font-size:13px}</style>
"""
GATE_BODY = """<div id="hs-gate" role="dialog" aria-modal="true" aria-labelledby="hs-gate-t"><form id="hs-gate-f" autocomplete="off">
<div class="w" id="hs-gate-t"><i aria-hidden="true"></i>HOOPSTATS MY</div>
<p>This site is private for now. Enter the password to continue.</p>
<label for="hs-gate-p" style="position:absolute;left:-9999px">Password</label>
<input id="hs-gate-p" type="password" placeholder="Password" required autofocus>
<button type="submit">Enter</button><div class="e" id="hs-gate-e" aria-live="polite"></div></form></div>
<script>(function(){var f=document.getElementById("hs-gate-f");if(!f)return;f.addEventListener("submit",function(ev){ev.preventDefault();
var v=document.getElementById("hs-gate-p").value,e=document.getElementById("hs-gate-e");
if(!(window.crypto&&crypto.subtle)){e.textContent="This browser cannot check the password here.";return;}
crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)).then(function(b){var h=Array.prototype.map.call(new Uint8Array(b),function(x){return("0"+x.toString(16)).slice(-2);}).join("");
if(h===window.HS_GATE){try{localStorage.setItem("hs-gate",h);}catch(err){}document.documentElement.className=document.documentElement.className.replace(/\\bhs-locked\\b/g,"");}
else{e.textContent="That password is not right. Try again.";document.getElementById("hs-gate-p").select();}});});})();</script>
"""


if __name__ == '__main__':
    main()
