"""FIBA Asia Cup 2029 Pre-Qualifiers (senior men, 2026) -> data/manual_comps.json.

Malaysia's games. The three First Round games (Karisma Arena, Seremban, 28-31 Aug 2026) come with
full box scores, read from FIBA's public game pages (data/fiba_acpq2029_raw.json):
  rows "<shirt>|<name> [*] <pos>|<min>|<pts>|<fgm>/<fga> (..)|<2pm>/<2pa> (..)|<3pm>/<3pa> (..)|<ftm>/<fta> (..)|
        <oreb>|<dreb>|<reb>|<ast>|<pf>|<tov>|<stl>|<blk>|<+/->|<eff>"   ('-' is 0, '*' a starter)
The three Second Round games (Group F, MBank Arena, Ulaanbaatar, 26-29 Nov 2026) are fixtures; while
they are on, the live layer follows them through the relay's FIBA route (app4n_live.js, LIVE_FIBA).
Fixture ids are 'fiba-<FIBA game id>'. Re-running replaces this competition's rows; nothing else is touched.
"""
import collections, json, os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
CID = 'fiba-acpq-2029'
NAME = 'FIBA Asia Cup 2029 Pre-Qualifiers (Men)'
EVENT = 'fiba-asia-cup-2029-pre-qualifiers'
URL = 'https://www.fiba.basketball/en/events/' + EVENT
CAP_E, CAP_SHORT = 'FIBA Asia Cup 2029 Pre-Qualifiers', 'FIBA Asia Cup Pre-Qualifiers'
VENUE1 = 'Karisma Arena, Seremban'
VENUE2 = 'MBank Arena, Ulaanbaatar'
GAMES = {  # FIBA game id: (date and tip-off, Malaysia time, which is also local time in both venues; stage; venue)
    '134211': ('Aug 28, 2026, 7:00 PM', 'First Round · Group C · ', VENUE1),
    '134213': ('Aug 30, 2026, 7:00 PM', 'First Round · Group C · ', VENUE1),
    '134214': ('Aug 31, 2026, 7:00 PM', 'First Round · Group C · ', VENUE1),
    # read from the game page through the relay; FIBA's feed left three players' minutes at 0:00 (Lish, Biasumrit,
    # Te): theirs are the team's 200:00 less everyone else's official minutes, split as the substitutions show
    '132590': ('Nov 26, 2026, 4:00 PM', 'Second Round · Group F · ', 'MBank Arena, Ulaanbaatar'),
    # read from the game page (the box score and play-by-play it loads); FIBA's minutes add up to 200:00 a side
    '132592': ('Nov 27, 2026, 1:00 PM', 'Second Round · Group F · ', 'MBank Arena, Ulaanbaatar'),
}
FIXTURES = [  # Second Round, Group F: (FIBA game id, tip-off, home, away)
    ('132588', 'Nov 29, 2026, 7:00 PM', 'Mongolia', 'Malaysia'),
]
TEAM_ID = {'MAS': 'fx-mas', 'HKG': 'fx-hkg', 'SGP': 'fx-sgp', 'INA': 'fx-ina', 'THA': 'fx-tha', 'FIJ': 'fx-fij',
           'MGL': 'fx-mgl', 'VIE': 'fx-vie'}
TEAM_NAME = {'fx-hkg': 'Hong Kong, China', 'fx-fij': 'Fiji', 'fx-mgl': 'Mongolia'}
CODE = {'Malaysia': 'MAS', 'Hong Kong, China': 'HKG', 'Singapore': 'SGP', 'Indonesia': 'INA', 'Thailand': 'THA',
        'Fiji': 'FIJ', 'Mongolia': 'MGL', 'Vietnam': 'VIE'}
# Malaysia's squad: FIBA person id -> site profile (canonical ids after data/merges.json)
MAS = {
    316248: '2092917',   # Jia Hao Hiew
    363835: '2778709',   # Michael Munnesvicky
    212178: '2371569',   # Yi Hou Wong
    357439: '2370342',   # Tychique Bosango
    389792: '2341474',   # Jin Yen Chin
    235851: '2302680',   # Jing Hung Lee
    235855: '1286737',   # Chee Wey Tan
    212179: '2252562',   # Chun Hong Ting
    419611: '107204',    # Ing Kun Tiong
    216401: '2778711',   # Maegen Mahadevan Suresh Mahadevan
    224468: '2371573',   # Wei Yong Ong (captain)
    389791: '2252605',   # Shu Wen, Jayson Lee
    # called up for the Second Round (Ulaanbaatar, Nov 2026)
    336361: '620479',    # Chee Wei Lim
    291083: '1845447',   # Zhen Jie Tem
    212177: '1957810',   # Khai Chiek, John Wong
    283223: '797690',    # Soon Kang Chong
    414629: '1885900',   # Yi Hang Te
    206408: '2371570',   # Zi Fueng Chang
}
# Called up for the Second Round window (Ulaanbaatar, 26-29 Nov 2026), not in the August squad: profile, shirt
# number (read off the team photos the owner supplied), position (as the site has it). They join the roster now,
# so the live pages link them by shirt number; once a game with them is imported, add their FIBA person ids to MAS.
CALLUPS = [('620479', '0', 'PG'), ('1845447', '7', 'SG'), ('1957810', '8', 'SF'), ('797690', '20', 'PF'),
           ('1885900', '21', 'SF'), ('2371570', '22', 'F')]
# Every First Round result of the two groups that feed Group F (FIBA's schedule page), for the tables
FIRST_ROUND = {
    'C': [('INA', 80, 'SGP', 54), ('MAS', 54, 'HKG', 77), ('HKG', 71, 'INA', 60), ('SGP', 56, 'MAS', 100),
          ('INA', 63, 'MAS', 77), ('HKG', 100, 'SGP', 59)],
    'D': [('THA', 94, 'FIJ', 59), ('MGL', 98, 'VIE', 64), ('VIE', 68, 'THA', 109), ('FIJ', 40, 'MGL', 102),
          ('THA', 69, 'MGL', 66), ('VIE', 57, 'FIJ', 69)],
}
GROUP_F = ['THA', 'HKG', 'MGL', 'MAS', 'INA', 'FIJ']   # FIBA's own order before the Second Round
# Second Round results in Group F as they come in (FIBA's schedule page), Malaysia's included
SECOND_ROUND = [('THA', 94, 'MAS', 82), ('FIJ', 65, 'HKG', 106), ('MGL', 72, 'INA', 64), ('MAS', 91, 'FIJ', 80)]
NAMES = {v: k for k, v in CODE.items()}
NUM = ['pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'pf', 'tov', 'stl',
       'blk', 'pm']
PF_KEYS = ['blkr', 'index', 'gmsc', 'fga', 'fgm', 'flson', 'pf', 'unsf', 'fta', 'ftm', 'gs', 'l', 'pa', 'min', 'offrat',
           'pfor', 'twocp', 'posspg', 'dreb', 'drpct', 'oreb', 'orpct', 'stpct', 'tpa', 'tpm', 'tsa', 'tspct', 'tov',
           'topct', 'twopa', 'twopm', 'w', 'pm', 'g', 'pts', 'ast', 'reb', 'stl', 'blk', 'eff']


def clock(s):
    return '%d:%02d' % (s // 60, s % 60)


def secs(m):
    a, b = m.split(':')
    return int(a) * 60 + int(b)


def n(x):
    return 0 if x in ('-', '') else int(x)


def line(row, roster):
    """One box-score row -> (shirt, fiba person id, starter, seconds or None for DNP, stats, position)."""
    f = row.split('|')
    no = f[0]
    pid = roster[no][3]
    ps = f[1].replace('*', ' ').split()[-1]
    if f[2] == 'Did Not Play':
        return no, pid, 0, None, {k: 0 for k in NUM}, ps
    st = 1 if ' * ' in f[1] + ' ' else 0
    fg, two, three, ft = [tuple(int(v) for v in x.split(' ')[0].split('/')) for x in f[4:8]]
    v = {'pts': n(f[3]), 'fgm': fg[0], 'fga': fg[1], 'twopm': two[0], 'twopa': two[1], 'tpm': three[0],
         'tpa': three[1], 'ftm': ft[0], 'fta': ft[1], 'oreb': n(f[8]), 'dreb': n(f[9]), 'ast': n(f[11]),
         'pf': n(f[12]), 'tov': n(f[13]), 'stl': n(f[14]), 'blk': n(f[15]), 'pm': n(f[16])}
    assert v['oreb'] + v['dreb'] == n(f[10]), row
    assert v['fgm'] == v['twopm'] + v['tpm'] and v['pts'] == 2 * v['twopm'] + 3 * v['tpm'] + v['ftm'], row
    return no, pid, st, secs(f[2]), v, ps


def table(title, teams, results, ranked=False):
    rec = {t: collections.Counter() for t in teams}
    for a, sa, b, sb in results:
        for t, f, g in ((a, sa, sb), (b, sb, sa)):
            if t in rec:
                rec[t]['gp'] += 1; rec[t]['w' if f > g else 'l'] += 1; rec[t]['for'] += f; rec[t]['agst'] += g
    if ranked:   # by points, then point difference; FIBA breaks real ties head to head
        teams = sorted(teams, key=lambda t: (-(2 * rec[t]['w'] + rec[t]['l']), -(rec[t]['for'] - rec[t]['agst']), teams.index(t)))
    rows = []
    for i, t in enumerate(teams):
        r = rec[t]
        rows.append([str(i + 1), '', NAMES[t], str(r['gp']), str(r['w']), str(r['l']), str(r['for']), str(r['agst']),
                     '%+d' % (r['for'] - r['agst']) if r['for'] != r['agst'] else '0',
                     str(round(100 * r['w'] / r['gp'])) if r['gp'] else '0', str(2 * r['w'] + r['l'])])
    return [title, ['Position', '', 'Team', 'GP', 'W', 'L', 'For', 'Agst', 'GD', '%won', 'Pts'], rows]


def main():
    R = json.load(open(os.path.join(D, 'fiba_acpq2029_raw.json'), encoding='utf-8'))
    M = json.load(open(os.path.join(D, 'manual_comps.json'), encoding='utf-8'))
    M['comps'] = [c for c in M['comps'] if c['id'] != CID]
    M['persons'] = {k: v for k, v in M['persons'].items() if not k.startswith(CID + ':')}
    for mid in list(M['boxes']):
        if mid.startswith('fiba-') and mid[5:] in GAMES:
            del M['boxes'][mid]
    for pid, rows in list(M['caps'].items()):
        M['caps'][pid] = [r for r in rows if r.get('e') != CAP_E]
        if not M['caps'][pid]:
            del M['caps'][pid]
    M['teamReg'].update(TEAM_NAME)

    mas_roster = {r[0]: r for r in R['mas_roster']}
    rows, teams, tot, num, pos, players, fid = [], ['fx-mas'], collections.defaultdict(collections.Counter), {}, {}, [], {}
    for g in R['games']:
        gid = g['id']
        date, note, venue = GAMES[gid]
        h, a = g['sides']
        mid = 'fiba-' + gid
        sc = {}
        lines = []
        for s, o in ((h, a), (a, h)):
            roster = mas_roster if s['roster'] == 'mas' else {r[0]: r for r in s['roster']}
            ls = [line(r, roster) for r in s['rows']]
            pts = sum(x[4]['pts'] for x in ls)
            assert pts == sum(s['q']), (gid, s['code'], pts, s['q'])
            sc[s['code']] = pts
            s['_lines'] = ls
        for s, o in ((h, a), (a, h)):
            mas = s['code'] == 'MAS'
            roster = mas_roster if s['roster'] == 'mas' else {r[0]: r for r in s['roster']}
            won = sc[s['code']] > sc[o['code']]
            t = TEAM_ID[s['code']]
            if t not in teams:
                teams.append(t)
            for no, fpid, st, sec, v, ps in s['_lines']:
                reb = v['oreb'] + v['dreb']
                eff = (v['pts'] + reb + v['ast'] + v['stl'] + v['blk'] - (v['fga'] - v['fgm'])
                       - (v['fta'] - v['ftm']) - v['tov'])
                ln = {k: str(v[k]) for k in NUM}
                ln.update({'pid': '', 'team': s['team'], 'num': no, 'min': clock(sec or 0), 'eff': '%.1f' % eff})
                if mas:
                    pid = MAS[fpid]
                    ln['pid'] = pid
                    num[pid], pos[pid], fid[pid] = no, ps, fpid
                    if pid not in players:
                        players.append(pid)
                    if sec:
                        c = tot[pid]
                        c['g'] += 1; c['gs'] += st; c['w' if won else 'l'] += 1; c['sec'] += sec
                        c['reb'] += reb; c['eff'] += eff
                        for k in NUM:
                            c[k] += v[k]
                else:
                    ln['name'] = ' '.join(x for x in roster[no][1:3] if x)
                lines.append(ln)
        rows.append([mid, 'COMPLETE', date, note + venue, h['team'], str(sc[h['code']]), a['team'],
                     str(sc[a['code']]), 1])
        M['boxes'][mid] = {'p': lines, 'periods': [[x, y] for x, y in zip(h['q'], a['q'])]}
    for gid, date, home, away in FIXTURES:
        for t in (home, away):
            if TEAM_ID[CODE[t]] not in teams:
                teams.append(TEAM_ID[CODE[t]])
        rows.append(['fiba-' + gid, 'SCHEDULED', date, 'Second Round · Group F · ' + VENUE2, home, '', away, '', 0])

    players = [p for p in players if tot[p]['g']]
    fmt = lambda x: ('%g' % x) if isinstance(x, (int, float)) else (x or '')
    for pid in players:
        c = tot[pid]
        tsa = c['fga'] + 0.44 * c['fta']
        d = {k: c[k] for k in ('fga', 'fgm', 'pf', 'fta', 'ftm', 'gs', 'l', 'w', 'dreb', 'oreb', 'tpa', 'tpm', 'tov',
                               'twopa', 'twopm', 'pm', 'g', 'pts', 'ast', 'reb', 'stl', 'blk', 'eff')}
        d.update({'min': clock(c['sec']), 'tsa': round(tsa, 1),
                  'tspct': round(c['pts'] / (2 * tsa) * 100, 1) if tsa else ''})
        M['persons'][CID + ':' + pid] = '\t'.join(['Malaysia'] + [fmt(d.get(k, '')) for k in PF_KEYS])
        M['caps'].setdefault(pid, []).append({
            'y': 2026, 'e': CAP_E, 'short': CAP_SHORT, 'lv': 'Senior', 'rank': '', 'gp': c['g'],
            'fid': str(fid[pid]), 'pts': c['pts'], 'reb': c['reb'], 'ast': c['ast'], 'stl': c['stl'], 'blk': c['blk'],
            'min': c['sec'] // 60, 'url': URL})

    lead = []
    for cat, k, avg in (('Average points', 'pts', 1), ('Average total rebounds', 'reb', 1),
                        ('Average assists', 'ast', 1), ('Efficiency', 'eff', 0)):
        val = {p: tot[p][k] / tot[p]['g'] if avg else tot[p][k] for p in players}
        top = sorted(val, key=lambda p: (-val[p], p))[:10]
        lead.append([cat, [[p, '%.1f' % val[p] if avg else '%d' % val[p]] for p in top]])

    stand = [table('Second Round · Group F (First Round records carried over)', GROUP_F,
                   FIRST_ROUND['C'] + FIRST_ROUND['D'] + SECOND_ROUND, ranked=True),
             table('First Round · Group C (final)', ['HKG', 'MAS', 'INA', 'SGP'], FIRST_ROUND['C'])]
    M['comps'].append({
        'id': CID, 'name': NAME, 'teams': teams, 'stand': stand, 'games': rows, 'lead': lead, 'players': players,
        'roster': [['fx-mas', [[p, num[p], '', '', '', '', pos[p], 'MAS'] for p in players]
                    + [[p, n, '', '', '', '', ps, 'MAS'] for p, n, ps in CALLUPS if p not in players]]],
        'src': 'FIBA (fiba.basketball)',
        'standNote': 'Worked out here from FIBA\'s results (2 points a win, 1 a loss), ordered by points then point '
                     'difference (FIBA breaks real ties head to head). Group F keeps every team\'s First Round games; '
                     'the top two of Groups E and F go through.',
    })
    json.dump(M, open(os.path.join(D, 'manual_comps.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(CID, len(rows), 'games,', len(players), 'Malaysia players')
    for p in players:
        c = tot[p]
        print(' ', p, num[p], pos[p], c['g'], 'gp', c['pts'], 'pts', c['reb'], 'reb', clock(c['sec']))


if __name__ == '__main__':
    main()
