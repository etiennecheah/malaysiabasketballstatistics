#!/usr/bin/env python3
"""Transform scraped MABA/Genius Sports data into the site's compact data payload.

Inputs (data/):
  backbone.json  - competitions, teams, standings, schedule, leaders, rosters, player lists
  persons.json   - {"<cid>:<pid>": "tab-joined 41 detailed stat fields"}   (optional)
  boxscores.json - {"<mid>": {...}}                                        (optional)

Output: data/site_data.js  - `const DB = {...}` consumed by site.html
Nothing here invents values; missing inputs simply produce empty sections.
"""
import json, re, os, datetime, collections, statistics

import merges

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

PERSON_FIELDS = ['Team','BLKR','Index','Gm Sc','FGA','FGM','Fls On','Tot Fouls','Uns. Foul','FTA','FTM',
                 'GS','Losses','-','Mins','Off Rat','+','2CP','Poss PG','DEF','DR%','OFF','OR%','ST%',
                 '3PA','3PM','TSA','TS%','TO','TO%','2PA','2PM','Wins','+/-','G','PTS','AST','REB',
                 'STL','BLK','EFF']
# short keys used in the site payload, same order as PERSON_FIELDS[1:] (Team handled separately)
BOX_KEYS = ['pid', 'ti', 'num', 'min', 'pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa',
            'ftm', 'fta', 'oreb', 'dreb', 'ast', 'pf', 'tov', 'stl', 'blk', 'pm', 'eff', 'name']

PF_KEYS = ['blkr','index','gmsc','fga','fgm','flson','pf','unsf','fta','ftm','gs','l','pa','min','offrat',
           'pfor','twocp','posspg','dreb','drpct','oreb','orpct','stpct','tpa','tpm','tsa','tspct','tov',
           'topct','twopa','twopm','w','pm','g','pts','ast','reb','stl','blk','eff']

MONTHS = {m: i + 1 for i, m in enumerate(
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])}


def parse_dt(s):
    """'Sep 6, 2026, 6:00 PM' -> ('2026-09-06', '6:00 PM'). Returns (None, raw) if unparseable."""
    if not s:
        return None, ''
    m = re.match(r'([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{4})(?:,\s*(.+))?$', s.strip())
    if not m:
        return None, s.strip()
    mon, day, year, tm = m.group(1), int(m.group(2)), int(m.group(3)), (m.group(4) or '').strip()
    if mon not in MONTHS:
        return None, s.strip()
    return '%04d-%02d-%02d' % (year, MONTHS[mon], day), tm


def clock_minutes(tm):
    """'8:15 PM' -> 1215, for ordering games inside one day; unknown sorts first."""
    m = re.match(r'(\d{1,2}):(\d{2})\s*([AP]M)?', tm or '', re.I)
    if not m:
        return -1
    h, mi, ap = int(m.group(1)), int(m.group(2)), (m.group(3) or '').upper()
    if ap == 'PM' and h != 12:
        h += 12
    if ap == 'AM' and h == 12:
        h = 0
    return h * 60 + mi


# Champions the computed rule gets wrong, confirmed by the user. The 2024 Agong Cup
# (men) source never published the final's score, so the last scored game on the
# last day was a classification game (Sarawak v Selection Team) and the rule crowned
# Sarawak; Negeri Sembilan won it (the user: an eight-peat of Agong Cup titles).
CHAMP_OVERRIDE = {'39599': 'Negeri Sembilan'}

def champion(games, stand, groups, name=''):
    """Who won a finished competition, and how that was decided.

    A group-stage championship is decided by its final, not by any group table, so
    reading the champion off the first standings row credits whoever topped Group A.
    If more games were completed than the standings account for, knockout games
    exist and the winner of the last one is the champion. Otherwise a single table
    decides it. Several tables with no knockout decide nothing, so no champion.
    Two guards, both found by checking every computed champion against its last day:
      * a qualifying round feeds a championship and crowns nobody;
      * one game beyond the standings is only a final if it is between the table's
        top two — otherwise it is a round-robin game the standings failed to count
        (2019 International Invitation: 15 games, a six-team round robin).
    Returns (team, 'final' | 'table') or (None, None)."""
    if re.search(r'qualif', name, re.I):
        return None, None
    playable = [g for g in games if g['st'] != 'NOT_PLAYED']
    if not playable or any(g['st'] != 'COMPLETE' for g in playable):
        return None, None
    done = [g for g in playable if g['hs'] is not None and g['as'] is not None]
    if not done:
        return None, None
    in_tables = sum((r['gp'] or 0) for r in stand) / 2.0
    extra = len(done) - in_tables
    f = max(done, key=lambda g: (g['date'] or '', clock_minutes(g['time']), g['mid']))
    top2 = {r['team'].strip().lower() for r in stand if r.get('g', 0) == 0 and (r['pos'] or 99) <= 2}
    one_game_final = {f['h'].strip().lower(), f['a'].strip().lower()} == top2
    if extra > 1.5 or (extra > 0.5 and (one_game_final or len(groups) > 1)):
        if f['hs'] == f['as']:
            return None, None
        return (f['h'] if f['hs'] > f['as'] else f['a']), 'final'
    if len(groups) == 1 and stand:
        return stand[0]['team'], 'table'
    return None, None


def plausible(v, lo, hi):
    """A typed height or weight outside what a person can measure (a 255 cm guard,
    a 10 kg forward) is a data-entry slip on the source: shown as unknown instead."""
    return v if isinstance(v, (int, float)) and lo <= v <= hi else None


def _secs(m):
    try:
        a, b = str(m).split(':')
        return int(a) * 60 + int(b)
    except ValueError:
        return 0


def box_season_lines(cid, c, games, raw_boxes, persons):
    """Season lines rebuilt from the box scores, in the source's tab format, for the
    two cases where the source's own line is wrong:
      * the player has box-score minutes but no statistics page line at all (the
        source's player page failed or came back empty when the line was read);
      * the player played for two clubs in the competition and the source's line
        covers only one stint (a mid-season move, a loan for the playoffs).
    Counting stats are summed; shooting, game score, wins and losses are derived;
    rates that need the team's possessions are left blank. The line carries the
    club of the player's latest game. -> {pid: tab line}"""
    by_mid = {g['mid']: g for g in games if g['st'] == 'COMPLETE'}
    per = {}
    for mid, g in by_mid.items():
        for ln in raw_boxes.get(mid, {}).get('p', []):
            pid = ln.get('pid')
            if pid and _secs(ln.get('min')) > 0:
                per.setdefault(pid, []).append((g, ln))
    out = {}
    for pid in c['players']:
        apps = per.get(pid)
        if not apps:
            continue
        raw = persons.get(cid + ':' + pid)
        teams = {ln.get('team') for _, ln in apps}
        if raw is not None:
            vals = raw.split('\t')
            src_g = num(vals[1 + PF_KEYS.index('g')]) if len(vals) > 1 + PF_KEYS.index('g') else None
            if len(teams) < 2 or (src_g or 0) >= len(apps):
                continue
        apps.sort(key=lambda x: (x[0]['date'] or '', clock_minutes(x[0]['time']), x[0]['mid']))
        t = {k: 0 for k in ('fga', 'fgm', 'pf', 'fta', 'ftm', 'dreb', 'oreb', 'tpa', 'tpm', 'tov',
                            'twopa', 'twopm', 'pm', 'pts', 'ast', 'stl', 'blk', 'eff')}
        secs = w = l = 0
        for g, ln in apps:
            for k in t:
                v = num(ln.get(k, ''))
                t[k] += v if isinstance(v, (int, float)) else 0
            secs += _secs(ln.get('min'))
            mine, theirs = (g['hs'], g['as']) if ln.get('team') == g['h'] else (g['as'], g['hs'])
            if mine is not None and theirs is not None:
                w += mine > theirs
                l += mine < theirs
        t['reb'] = t['oreb'] + t['dreb']
        tsa = t['fga'] + 0.44 * t['fta']
        d = dict(t, g=len(apps), w=w, l=l, min='%d:%02d' % (secs // 60, secs % 60),
                 tsa=round(tsa, 1), tspct=round(t['pts'] / (2 * tsa) * 100, 1) if tsa else '',
                 gmsc=round(t['pts'] + 0.4 * t['fgm'] - 0.7 * t['fga'] - 0.4 * (t['fta'] - t['ftm'])
                            + 0.7 * t['oreb'] + 0.3 * t['dreb'] + t['stl'] + 0.7 * t['ast']
                            + 0.7 * t['blk'] - 0.4 * t['pf'] - t['tov'], 1))
        fmt = lambda v: ('%g' % v) if isinstance(v, (int, float)) else (v or '')
        out[pid] = '\t'.join([apps[-1][1].get('team') or ''] + [fmt(d.get(k, '')) for k in PF_KEYS])
    return out


def split_team_cell(cell, known):
    """Standings cell is 'Team NameCODE' concatenated. Recover the name using known team names."""
    cell = (cell or '').strip()
    best = ''
    for n in known:
        if cell.startswith(n) and len(n) > len(best):
            best = n
    if best:
        return best, cell[len(best):].strip()
    m = re.match(r'^(.*?)([A-Z0-9]{2,6})$', cell)
    if m and m.group(1).strip():
        return m.group(1).strip(), m.group(2)
    return cell, ''


def comp_meta(name, games):
    """Derive year / gender / age level / series from the competition name and its fixtures."""
    n = name
    low = n.lower()
    # The competition's own name is the authority on which season it is; fixture
    # dates only fill in when the name carries no year (some run across a new year).
    years = [int(y) for y in re.findall(r'(20\d{2})', n)]
    gdates = [g['date'] for g in games if g.get('date')]
    if years:
        year = years[0]
    elif gdates:
        yrs = collections.Counter(d[:4] for d in gdates)
        year = int(yrs.most_common(1)[0][0])
    else:
        year = None

    if re.search(r'\bwomen|\bwanita|perempuan|\bgirls?\b|\(girls\)|women', low):
        gender = 'Women'
    elif re.search(r'\bmen\b|\blelaki\b|\bboys?\b|\(boys\)|\bmale\b|for men', low):
        gender = 'Men'
    else:
        gender = 'Mixed / Unspecified'

    lvl = 'Open'
    if re.search(r'\bu18\b|under[- ]?18', low):
        lvl = 'U18'
    elif re.search(r'\bu16\b|under[- ]?16', low):
        lvl = 'U16'
    elif re.search(r'u23|under[- ]?23', low):
        lvl = 'U23'
    elif re.search(r'u20|under[- ]?20', low):
        lvl = 'U20'
    elif re.search(r'17\s*&\s*below|u17', low):
        lvl = 'U17'
    elif re.search(r'15\s*&\s*below|u15', low):
        lvl = 'U15'
    elif re.search(r'school|sekolah|nxt', low):
        lvl = 'Youth'

    if low.startswith('fiba'):
        series = 'FIBA'
    elif 'd-league' in low:
        series = 'Malaysia D-League'
    elif 'agong' in low:
        series = 'Agong Cup'
    elif 'lum mun chak' in low:
        series = 'MILO Lum Mun Chak Cup'
    elif 'matrix' in low and '17' in low:
        series = 'MABA/MATRIX 17 & Below'
    elif 'matrix cup' in low or 'matrix' in low:
        series = 'MABA/MATRIX Cup'
    elif 'sukan malaysia' in low:
        series = 'Sukan Malaysia'
    elif 'sukan selangor' in low or 'sukses' in low:
        series = 'Sukan Selangor'
    elif 'major basketball league' in low:
        series = 'Major Basketball League'
    elif 'invitation' in low or 'invitational' in low:
        series = 'Invitational'
    elif 'nxt' in low:
        series = 'NXT Championship'
    elif 'sekolah' in low or 'school' in low:
        series = 'Schools Championship'
    elif 'selangor basketball league' in low or ' sbl ' in low:
        series = 'Selangor Basketball League'
    elif 'heat challenge' in low:
        series = 'Heat Challenge Cup'
    elif 'basketball alliance' in low:
        series = "Women's Basketball Alliance"
    else:
        # No recognised series: fall back to the competition's own name, stripped
        # of its year, so a tier is never labelled with a meaningless "Other".
        series = re.sub(r'\s*20\d{2}\s*', ' ', n).strip(' -–') or n
    return year, gender, lvl, series


def num(s):
    """'12' -> 12, '12.5' -> 12.5, '' -> None. Keeps clock strings ('13:04') as-is."""
    if s is None:
        return None
    s = s.strip()
    if s == '' or s == '-':
        return None
    if re.match(r'^\d{1,3}:\d{2}$', s):
        return s
    try:
        f = float(s)
        return int(f) if f == int(f) and '.' not in s else f
    except ValueError:
        return s


def _img_dir(sub):
    """data/<sub>/<key>.<ext> -> {key: data URI}. External images can't be loaded
    by the published page, so any artwork has to travel inside the file itself."""
    import base64
    out = {}
    pdir = os.path.join(D, sub)
    if not os.path.isdir(pdir):
        return out
    for fn in sorted(os.listdir(pdir)):
        key, ext = os.path.splitext(fn)
        mime = {'.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.svg': 'image/svg+xml'}.get(ext.lower())
        if not mime:
            continue
        with open(os.path.join(pdir, fn), 'rb') as f:
            out[key] = 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())
    return out


def load_photos(pidmap=None, known=None):
    """Player portraits, keyed on the source's person id.

    A portrait is filed under every id the source published for that player, so
    merged-away ids are folded onto the survivor and any id the registry no longer
    knows is dropped rather than shipped as dead base64."""
    out = {}
    for pid, uri in _img_dir('photos').items():
        pid = (pidmap or {}).get(pid, pid)
        if known is not None and pid not in known:
            continue
        out[pid] = uri
    return out


def load_logos():
    """Club crests, keyed on the team-name slug the page computes at render time
    (lowercase, any bracketed squad suffix dropped, non-alphanumerics -> '-')."""
    return _img_dir('logos')


def load_complogos():
    """Governing-body marks, keyed on the body: MABA runs the Agong Cup and the
    U15 and U17 nationals, the Major Basketball League runs the MBL, its
    invitational and the D-League age groups. A competition outside both keeps
    its generated swatch rather than borrowing someone's logo."""
    return _img_dir('complogos')


def load_flags():
    """State flags, keyed on the state slug. The state-team competitions — the
    U17 and U15 nationals, the MATRIX and Agong Cups, SUKMA — field states rather
    than clubs, so the flag is the crest."""
    return _img_dir('flags')


# Old and alternate names of one club, mapped onto the name it goes by now. Applied
# to every exact team-name string in the output (fixtures, standings, box scores,
# player lines, champions, the team register) so the whole site shows one name.
# Decided by the user, 2026-09-29.
TEAM_RENAME = {
    'NS Matrix': 'NS Matrix Deers',                       # the club renamed itself
    'Sunrise Youngsters': 'Penang Sunrise Youngsters',
    'Penang Youngsters Basketball Club': 'Penang Sunrise Youngsters',
    'Penang Youngsters BC': 'Penang Sunrise Youngsters',
    'Parkcity Heat': 'Putrajaya Parkcity Heat',
    'Parkcity Heat Basketball Club': 'Putrajaya Parkcity Heat',
    'Johor Tiger': 'Johor Southern Tigers',
    'MBC': 'MBC Kirin',
    'Pegasus': 'Pegasus Sports',
    'Angkatan Tentera Malaysia': 'ATM',                   # the Armed Forces side
    'Putrajaya Harimau': 'Harimau',                       # the source's own newer name (D-League 2026 U23)
}
SKIP_RENAME = {'photos', 'logos', 'flags', 'complogos', 'persons', 'palias'}


def rename_teams(out):
    n = [0]

    def walk(o):
        if isinstance(o, list):
            for i, x in enumerate(o):
                if isinstance(x, str) and x in TEAM_RENAME:
                    o[i] = TEAM_RENAME[x]; n[0] += 1
                else:
                    walk(x)
        elif isinstance(o, dict):
            for k in list(o):
                v = o[k]
                if isinstance(v, str) and v in TEAM_RENAME:
                    o[k] = TEAM_RENAME[v]; n[0] += 1
                else:
                    walk(v)
                if k in TEAM_RENAME:
                    o[TEAM_RENAME[k]] = o.pop(k); n[0] += 1
    for key, val in out.items():
        if key not in SKIP_RENAME:
            walk(val)
    return n[0]


def apply_playoffs(out):
    """Regular season vs playoffs, where the user has told us which games were the
    playoffs (data/playoffs.json: MBL 2023 and 2024). Each playoff game gets its round
    ("Semi-final 1 · Game 2"), and the competition gets two extra player tables built
    from the box scores — one for the regular season, one for the playoffs — in the same
    row format as the published season lines. The published line stays the "all games"
    line; box sums reproduce it on every counting stat except personal fouls (the
    source's season PF includes fouls its box score does not list)."""
    path = os.path.join(D, 'playoffs.json')
    if not os.path.exists(path):
        return 'playoffs: none defined'
    spec = json.load(open(path))
    pk = out['pkeys']
    bk = out['bkeys']
    done = []
    for c in out['comps']:
        sp = spec.get(c['id'])
        if not sp:
            continue
        phase = {}
        for se in sp['series']:
            bo = se.get('bo', sp.get('bo'))
            for i, mid in enumerate(se['games']):
                phase[mid] = {'r': se['round'], 'n': se['n'], 'g': i + 1, 'of': len(se['games']),
                              'm': ' vs '.join(se['teams']), **({'bo': bo} if bo else {})}
        # A playoff game the sync brought in before anyone told us its round: every game on or
        # after 'from' is a playoff game. Until it is listed in a series it is grouped with the
        # other unlisted games between the same two teams and called just "Playoffs".
        if sp.get('from'):
            auto = {}
            later = sorted((g for g in c['games'] if g['mid'] not in phase and (g.get('date') or '') >= sp['from']),
                           key=lambda g: (g['date'], clock_minutes(g['time']), g['mid']))
            for g in later:
                key = frozenset((g['h'], g['a']))
                a = auto.setdefault(key, {'n': len(auto) + 1, 'games': [], 'm': g['h'] + ' vs ' + g['a']})
                a['games'].append(g['mid'])
            for a in auto.values():
                for i, mid in enumerate(a['games']):
                    phase[mid] = {'r': 'Playoffs', 'n': a['n'], 'g': i + 1, 'of': len(a['games']), 'm': a['m'],
                                  **({'bo': sp['bo']} if sp.get('bo') else {})}
        c['phase'] = phase
        tables = {'rs': {}, 'po': {}}
        for g in c['games']:
            b = out['boxes'].get(g['mid'])
            if g['st'] != 'COMPLETE' or not b:
                continue
            side = 'po' if g['mid'] in phase else 'rs'
            for row in b['p']:
                r = {bk[i]: row[i] for i in range(min(len(row), len(bk)))}
                pid = r.get('pid')
                ti = r.get('ti')
                if not pid or ti is None or ti < 0:
                    continue
                team = b['t'][ti]
                m = _mins(r.get('min'))
                a = tables[side].setdefault((pid, team), collections.Counter())
                # a game counts when he was on the floor: minutes, or — where the box
                # score lost the minutes (0:00 beside a 29-point line) — any stat or +/-
                played = m > 0 or any(float(r.get(k) or 0) for k in (
                    'pts', 'fga', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm'))
                if played:
                    a['g'] += 1
                    mine, theirs = (g['hs'], g['as']) if team == g['h'] else (g['as'], g['hs'])
                    if mine is not None and theirs is not None:
                        a['w' if mine > theirs else 'l'] += 1
                a['secs'] += round(m * 60)
                for k in ('pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta',
                          'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm', 'eff'):
                    a[k] += float(r.get(k) or 0)
        split = {}
        for side, tab in tables.items():
            rows = []
            for (pid, team), a in tab.items():
                if not a['g']:
                    continue
                d = {k: int(a[k]) if float(a[k]).is_integer() else round(a[k], 1)
                     for k in ('pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta',
                               'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm', 'eff')}
                d.update(g=a['g'], w=a['w'], l=a['l'], reb=d['oreb'] + d['dreb'],
                         min='%d:%02d' % divmod(int(a['secs']), 60))
                d['tsa'] = round(d['fga'] + 0.44 * d['fta'], 1)
                d['tspct'] = round(d['pts'] / (2 * d['tsa']) * 100, 1) if d['tsa'] else None
                row = [pid, team] + [d.get(k) for k in pk[2:]]
                while len(row) > 2 and row[-1] is None:
                    row.pop()
                rows.append(row)
            split[side] = rows
        c['split'] = split
        # check: regular season + playoffs = the published season line
        pub = {r[0]: dict(zip(pk, r)) for r in c['players']}
        off = 0
        for pid, line in pub.items():
            got = collections.Counter()
            for side in ('rs', 'po'):
                for r in split[side]:
                    if r[0] == pid:
                        got.update({k: v for k, v in zip(pk, r) if k in ('g', 'pts', 'ast', 'reb', 'stl', 'blk', 'tov') and v})
            if any((line.get(k) or 0) != got[k] for k in ('g', 'pts', 'ast', 'reb', 'stl', 'blk', 'tov')):
                off += 1
        done.append('%s: %d playoff games, %d/%d players, %d not matching the published line'
                    % (c['id'], len(phase), len(split['rs']), len(split['po']), off))
    return 'playoffs: ' + ' | '.join(done)


def _mins(s):
    if not s or s == '-':
        return 0.0
    s = str(s)
    if ':' in s:
        m, _, sec = s.partition(':')
        try:
            return int(m) + int(sec) / 60.0
        except ValueError:
            return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def main():
    bb = json.load(open(os.path.join(D, 'backbone.json')))
    persons = {}
    pp = os.path.join(D, 'persons.json')
    if os.path.exists(pp):
        persons = json.load(open(pp))
    # fixtures the source never finished, each with the reason (see sync_all.py)
    npp = os.path.join(D, 'not_played.json')
    not_played = json.load(open(npp)) if os.path.exists(npp) else {}
    # competitions still being played although every listed fixture is finished (more games to come)
    opp = os.path.join(D, 'open_comps.json')
    open_comps = {k: v for k, v in (json.load(open(opp)) if os.path.exists(opp) else {}).items() if not k.startswith('_')}
    raw_boxes = {}
    bp = os.path.join(D, 'boxscores.json')
    if os.path.exists(bp):
        raw_boxes = json.load(open(bp))

    # Competitions imported by hand from outside the MABA portal (import_fibalive.py):
    # folded in here so a portal sync never overwrites them
    mcp = os.path.join(D, 'manual_comps.json')
    if os.path.exists(mcp):
        M = json.load(open(mcp))
        bb['teamReg'].update(M.get('teamReg', {}))
        for k, v in M.get('personReg', {}).items():
            bb['personReg'].setdefault(k, v)
        have = {c['id'] for c in bb['comps']}
        bb['comps'].extend(c for c in M.get('comps', []) if c['id'] not in have)
        persons.update(M.get('persons', {}))
        raw_boxes.update(M.get('boxes', {}))
        print('manual competitions: %d' % len(M.get('comps', [])))

    # Box scores and roster names recovered by hand after the competition was first read
    # (data/recovered.json). Whatever the portal sync holds for the same game or person wins.
    rp = os.path.join(D, 'recovered.json')
    played_anyway = {}
    if os.path.exists(rp):
        RC = json.load(open(rp))
        played_anyway = RC.get('played', {})
        nb = sum(1 for m, b in RC.get('boxes', {}).items() if raw_boxes.setdefault(m, b) is b)
        for k, v in RC.get('personReg', {}).items():
            bb['personReg'].setdefault(k, v)
        print('recovered: %d box scores, %d roster names' % (nb, len(RC.get('personReg', {}))))

    # Collapse the source's duplicate person records before anything is aggregated,
    # so career totals, the tier split, the box scores and BPM all see one player.
    pidmap, mnames = merges.load(D)
    rep = merges.apply(bb, persons, raw_boxes, pidmap, mnames)
    if pidmap:
        print('merged %d duplicate person records into %d players '
              '(%d stat lines, %d roster rows, %d box lines rekeyed)'
              % (rep['records'], rep['groups'], rep['lines'], rep['roster_rows'], rep['box_lines']))

    boxes = {}
    if raw_boxes:
        # Re-encode each box score as {t: [team names], p: [schema-ordered arrays]}
        # so ~49,000 player lines don't each repeat 22 key names and a team string.
        for mid, b in raw_boxes.items():
            teams = []
            for line in b.get('p', []):
                if line.get('team') and line['team'] not in teams:
                    teams.append(line['team'])
            rows = []
            for line in b.get('p', []):
                # a person id the source never registered has no profile to link to:
                # drop it and keep the printed name instead of showing "Unknown player"
                pid = line.get('pid') or ''
                if pid and pid not in bb['personReg']:
                    pid = ''
                row = [pid, teams.index(line['team']) if line.get('team') in teams else -1]
                for k in ['num', 'min', 'pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa',
                          'ftm', 'fta', 'oreb', 'dreb', 'ast', 'pf', 'tov', 'stl', 'blk', 'pm', 'eff']:
                    row.append(num(line.get(k, '')))
                # the name is only needed when the source gives no person link
                row.append('' if pid else (line.get('name') or ''))
                while len(row) > 2 and (row[-1] is None or row[-1] == ''):
                    row.pop()
                rows.append(row)
            if rows:
                boxes[mid] = {'t': teams, 'p': rows}

    team_reg = dict(bb['teamReg'])
    person_reg = dict(bb['personReg'])
    name_to_tid = {}
    for tid, nm in team_reg.items():
        name_to_tid.setdefault(nm, tid)

    comps_out = []
    box_line_log = []
    box_only = []
    for c in bb['comps']:
        cid = c['id']
        known = [team_reg[t] for t in c['teams'] if t in team_reg]

        games = []
        for g in c['games']:
            mid, status, dt, venue, h, hs, a, ascore, detail = g
            date, tm = parse_dt(dt)
            row = {'mid': mid, 'st': status, 'date': date, 'time': tm, 'venue': venue,
                   'h': h, 'hs': num(hs), 'a': a, 'as': num(ascore), 'box': detail}
            # A fixture the source never finished — a playoff placeholder whose teams
            # were never decided, or a game frozen mid-way for years — is kept and
            # labelled, but it is not a game still to be played.
            if mid in not_played:
                row['st'] = 'NOT_PLAYED'
                row['np'] = not_played[mid]
                # ... unless its box score exists after all (the source marked it final but left the
                # score off the fixture list): then it was played, and the score comes from the box
                # (listed in data/recovered.json "played", and only when that box has both teams)
                rb = raw_boxes.get(mid, {}).get('p', [])
                if mid in played_anyway and {ln.get('team') for ln in rb} == {h, a}:
                    row['st'] = 'COMPLETE'
                    row['box'] = 1
                    row.pop('np')
            # A finished game the source lists without a score (all 23 of the 2024
            # Agong Cup men's games but one) still has its box score. The players'
            # points add up to the team score in 2,143 of 2,146 games that do publish
            # one (the three misses are 20-0 forfeits), so the score is filled from
            # the box and flagged `sb` so the page can say where it came from.
            bx = boxes.get(mid)
            if row['st'] == 'COMPLETE' and row['hs'] is None and row['as'] is None and bx and len(bx['t']) == 2 \
                    and set(bx['t']) == {h, a}:
                tot = [0.0, 0.0]
                for line in bx['p']:
                    if line[1] in (0, 1) and len(line) > 4 and line[4] is not None:
                        tot[line[1]] += float(line[4])
                if tot[0] and tot[1]:
                    sc = {bx['t'][0]: tot[0], bx['t'][1]: tot[1]}
                    row['hs'], row['as'], row['sb'] = int(sc[h]), int(sc[a]), 1
            # A 20-0 result with nobody scoring in the box score (or no box score at
            # all) is a forfeit, not a game: flagged so pages label it and leave it out
            # of scoring averages and margins.
            if row['st'] == 'COMPLETE' and {row['hs'], row['as']} == {20, 0}:
                bxp = boxes.get(mid)
                if not bxp or not any((ln[4] or 0) for ln in bxp['p'] if len(ln) > 4):
                    row['ff'] = 1
            games.append(row)

        year, gender, lvl, series = comp_meta(c['name'], games)

        # Every group the competition publishes. The source serves one group per
        # page (phase x pool), so a championship with four groups is four tables;
        # each row carries the index of its group in `groups`.
        stand, groups = [], []
        for title, heads, rows in (c['stand'] or []):
            gi = len(groups)
            groups.append(title)
            for r in rows:
                nm, code = split_team_cell(r[2], known)
                stand.append({'pos': num(r[0]), 'team': nm, 'code': code, 'gp': num(r[3]),
                              'w': num(r[4]), 'l': num(r[5]), 'pf': num(r[6]), 'pa': num(r[7]),
                              'gd': num(r[8]), 'pct': num(r[9]), 'pts': num(r[10]), 'g': gi})
        # Where scores were filled from box scores, the source's group tables are the
        # ones that stopped updating (2024 Agong Cup men: Negeri Sembilan shown 0-0 after
        # four group wins). Rebuild a group from its own games when the published table
        # counts fewer games than its members played against each other: W, L, PF, PA,
        # 2 points a win and 1 a loss as the source awards them, ordered by points then
        # difference. Only competitions with box-filled scores are touched.
        stand_fix = []
        if any(g.get('sb') for g in games):
            for gi, title in enumerate(groups):
                rows = [r for r in stand if r['g'] == gi]
                members = {r['team'] for r in rows}
                inner = [g for g in games if g['st'] == 'COMPLETE' and g['hs'] is not None
                         and g['h'] in members and g['a'] in members]
                if sum((r['gp'] or 0) for r in rows) / 2.0 >= len(inner):
                    continue
                for r in rows:
                    t = r['team']; w = l = pf = pa = 0
                    for g in inner:
                        if t not in (g['h'], g['a']):
                            continue
                        f, x = (g['hs'], g['as']) if g['h'] == t else (g['as'], g['hs'])
                        pf += f; pa += x
                        if f > x: w += 1
                        else: l += 1
                    r.update(gp=w + l, w=w, l=l, pf=pf, pa=pa, gd=pf - pa,
                             pct=round(100.0 * w / (w + l), 1) if w + l else 0, pts=2 * w + l)
                rows.sort(key=lambda r: (-r['pts'], -r['gd']))
                for i, r in enumerate(rows):
                    r['pos'] = i + 1
                stand = [r for r in stand if r['g'] != gi] + rows
                stand_fix.append(title)
            stand.sort(key=lambda r: (r['g'], r['pos'] or 99))
        champ, champ_how = champion(games, stand, groups, c['name'])
        # an override the computed rule now agrees with keeps the rule's reason ('final')
        if c['id'] in CHAMP_OVERRIDE and champ != CHAMP_OVERRIDE[c['id']]:
            champ, champ_how = CHAMP_OVERRIDE[c['id']], 'confirmed'
        if c['id'] in open_comps:            # not over yet: the last game played is not a final
            champ, champ_how = None, None

        roster = {}
        for tid, rows in c['roster']:
            roster[tid] = [{'pid': r[0], 'num': r[1], 'dob': r[2], 'age': num(r[3]),
                            'ht': plausible(num(r[4]), 120, 235), 'wt': plausible(num(r[5]), 25, 200),
                            'pos': r[6], 'nat': r[7]} for r in rows]

        # Player stat lines, emitted as schema-ordered arrays (['pid','team'] + PF_KEYS)
        # so the 41 key names aren't repeated 9,424 times in the payload.
        players = []
        # a player with box-score minutes always gets a line: the source's statistics page is
        # empty for some seasons (2022 MATRIX U17) and for players whose page failed when read;
        # box_season_lines() then builds it from the box scores
        listed = set(c['players'])
        for g in games:
            if g['st'] != 'COMPLETE':
                continue
            for ln in raw_boxes.get(g['mid'], {}).get('p', []):
                p = ln.get('pid')
                if p and p not in listed and p in bb['personReg'] and _secs(ln.get('min')) > 0:
                    c['players'].append(p)
                    listed.add(p)
                    box_only.append((cid, p))
        from_box = box_season_lines(cid, c, games, raw_boxes, persons)
        if from_box:
            box_line_log.append((cid, sorted(from_box)))
        for pid in c['players']:
            row = [pid, ''] + [None] * len(PF_KEYS)
            raw = from_box.get(pid) or persons.get(cid + ':' + pid)
            if raw is not None:
                vals = raw.split('\t')
                row[1] = vals[0] if vals else ''
                for i in range(len(PF_KEYS)):
                    row[i + 2] = num(vals[i + 1]) if i + 1 < len(vals) else None
            while len(row) > 2 and row[-1] is None:
                row.pop()
            players.append(row)

        leaders = [{'cat': cat, 'rows': [{'pid': p, 'v': num(v)} for p, v in rows]}
                   for cat, rows in c['lead']]

        # Median games a team actually plays in this competition. It is what the
        # qualification threshold for the percentile pools is scaled from: a
        # four-game group stage and a fourteen-game league can't share one
        # "minimum games played" number. Standings games-played is the source's
        # own count; the fixture list is the fallback.
        tg_counts = [r['gp'] for r in stand if r.get('gp')]
        if not tg_counts:
            per_team = {}
            for g in games:
                if g['st'] != 'COMPLETE':
                    continue
                for nm in (g['h'], g['a']):
                    if nm:
                        per_team[nm] = per_team.get(nm, 0) + 1
            tg_counts = sorted(per_team.values())
        tg = int(statistics.median(tg_counts)) if tg_counts else 0

        dates = sorted(g['date'] for g in games if g['date'])
        # Some competitions repeat the same name across seasons (e.g. four
        # "Major Basketball League" entries); give those a season-qualified label.
        label = c['name'] if (year and str(year) in c['name']) or not year else '%s %d' % (c['name'], year)
        comps_out.append({
            'id': cid, 'name': c['name'], 'label': label, 'year': year, 'gender': gender, 'level': lvl,
            'series': series,
            'teams': c['teams'], 'stand': stand, 'groups': groups,
            'champ': champ, 'champHow': champ_how, **({'standFix': stand_fix} if stand_fix else {}),
            # hand-built competitions (manual_comps.json) can carry the final placings the
            # organisers announced and a note on how their group tables were made
            **({'final': c['final']} if c.get('final') else {}),
            **({'standNote': c['standNote']} if c.get('standNote') else {}),
            **({'open': open_comps[c['id']]} if c['id'] in open_comps else {}), 'games': games, 'roster': roster,
            'players': players, 'leaders': leaders,
            'start': dates[0] if dates else None, 'end': dates[-1] if dates else None,
            'nGames': sum(1 for g in games if g['st'] != 'NOT_PLAYED'),
            'nDone': sum(1 for g in games if g['st'] == 'COMPLETE'),
            'nNotPlayed': sum(1 for g in games if g['st'] == 'NOT_PLAYED'),
            'nTeams': len(c['teams']), 'nPlayers': len(players), 'tg': tg,
        })

    # teams referenced only in fixtures (source's team list is occasionally incomplete)
    for c in comps_out:
        for g in c['games']:
            for nm in (g['h'], g['a']):
                if nm and nm not in name_to_tid and nm.lower() != 'to be determined':
                    tid = 'x' + str(abs(hash(nm)) % 10 ** 8)
                    name_to_tid[nm] = tid
                    team_reg[tid] = nm

    if box_only:
        print('players with box-score minutes but no listed line: %d (%s)' % (
            len(box_only), ', '.join(sorted({c for c, _ in box_only}))))
    if box_line_log:
        print('season lines rebuilt from box scores: %s' % '; '.join(
            '%s %s' % (cid, ','.join(p) if len(p) <= 8 else '%d players' % len(p)) for cid, p in box_line_log))

    photos = load_photos(pidmap, set(person_reg))
    logos = load_logos()
    flags = load_flags()
    complogos = load_complogos()
    out = {'teams': team_reg, 'persons': person_reg, 'comps': comps_out, 'boxes': boxes,
           'pkeys': ['pid', 'team'] + PF_KEYS, 'bkeys': BOX_KEYS, 'photos': photos,
           # merged-away person ids, so a link minted before the merge still lands
           'palias': pidmap,
           'logos': logos, 'flags': flags, 'complogos': complogos}
    # one club, one name: the source keeps a team's old and alternate names, and
    # the user has said which ones are the same club (see TEAM_RENAME)
    renamed = rename_teams(out)
    print('team names canonicalised: %d strings rewritten' % renamed)
    print(apply_playoffs(out))
    os.makedirs(D, exist_ok=True)
    with open(os.path.join(D, 'site_data.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    size = os.path.getsize(os.path.join(D, 'site_data.json'))
    gi = (['pid', 'team'] + PF_KEYS).index('g')
    withdet = sum(1 for c in comps_out for p in c['players'] if len(p) > gi and p[gi] is not None)
    print('competitions %d | teams %d | persons %d | games %d | player-rows %d (detailed %d) | boxes %d'
          % (len(comps_out), len(team_reg), len(person_reg),
             sum(c['nGames'] for c in comps_out),
             sum(c['nPlayers'] for c in comps_out), withdet, len(boxes)))
    print('photos %d | site_data.json %.2f MB' % (len(photos), size / 1024 / 1024))


if __name__ == '__main__':
    main()
