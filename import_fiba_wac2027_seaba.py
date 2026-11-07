"""FIBA Women's Asia Cup 2027 Division B SEABA Qualifiers (Karisma Arena, Nov 2026) -> data/manual_comps.json.

Malaysia's games, copied from the FIBA box score sheets (data/fiba_wac2027_seaba.txt):
  G|<mid>|<date>|<venue>|<home-away per quarter, comma separated>
  T|<mid>|<side>|<team>|<code>|<score>
  <side>|<name>||shirt|min|pts|fgm|fga|2pm|2pa|3pm|3pa|ftm|fta|oreb|dreb|ast|pf|tov|stl|blk|pm|starter|pos
A game id is "fwac27-" + the sheet's Game No. (31509-A-A -> fwac27-31509AA).
Add the next game's lines to the extract and re-run: this competition's rows are replaced,
nothing else is touched.
"""
import collections, json, os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
CID = 'fiba-wac-2027-seaba'
NAME = "FIBA Women's Asia Cup 2027 Division B SEABA Qualifiers"
CAP_E, CAP_SHORT, CAP_Y, RANK = NAME, "FIBA Women's Asia Cup Div. B SEABA Qualifiers", 2026, ''
TEAM_ID = {'MAS': 'fx-mas', 'THA': 'fx-tha', 'INA': 'fx-ina', 'PHI': 'fx-phi', 'SGP': 'fx-sgp', 'VIE': 'fx-vie', 'LAO': 'fx-lao'}
# Malaysia players as the sheet prints them -> site profile
MAS = {
    'Sin Jie Tan': '2615636', 'Mun Yi Chia': '2786703', 'Mun Shuen Erica Ng': '2304356', 'Yan Ting Sandra Choe': '2786791',
    'Jing Zhe Lim': '1845670', 'Ky Lie Hiew': '27708', 'Suet Ying Foo': '1287260', 'Yin Yin Chong': '27497',
    'Khalidah Naim Binti Kamaludin': '1091469', 'Ler Yee Low': '2615599', 'Fook Yee Yap': '27500', 'Qiyi Emily Tan': '2786776',
}
COLS = ['num', 'min', 'pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'pf',
        'tov', 'stl', 'blk', 'pm', 'st', 'pos']
NUM = ['pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'pf', 'tov', 'stl',
       'blk', 'pm']
PF_KEYS = ['blkr', 'index', 'gmsc', 'fga', 'fgm', 'flson', 'pf', 'unsf', 'fta', 'ftm', 'gs', 'l', 'pa', 'min', 'offrat',
           'pfor', 'twocp', 'posspg', 'dreb', 'drpct', 'oreb', 'orpct', 'stpct', 'tpa', 'tpm', 'tsa', 'tspct', 'tov',
           'topct', 'twopa', 'twopm', 'w', 'pm', 'g', 'pts', 'ast', 'reb', 'stl', 'blk', 'eff']


def secs(m):
    a, b = m.split(':')
    return int(a) * 60 + int(b)


def clock(s):
    return '%d:%02d' % (s // 60, s % 60)


def parse():
    games, cur = collections.OrderedDict(), None
    for ln in open(os.path.join(D, 'fiba_wac2027_seaba.txt'), encoding='utf-8').read().strip().split('\n'):
        f = ln.split('|')
        if f[0] == 'G':
            _, mid, date, venue, qs = f
            games[mid] = {'date': date, 'venue': venue, 'sides': {},
                          'periods': [[int(x) for x in q.split('-')] for q in qs.split(',')]}
        elif f[0] == 'T':
            _, mid, side, team, code, score = f
            games[mid]['sides'][side] = cur = {'team': team, 'code': code, 'score': score, 'p': []}
        else:
            p = dict(zip(COLS, f[3:]))
            p['name'] = (f[1] + ' ' + f[2]).strip()
            cur['p'].append(p)
    return games


def main():
    games = parse()
    M = json.load(open(os.path.join(D, 'manual_comps.json'), encoding='utf-8'))
    M['comps'] = [c for c in M['comps'] if c['id'] != CID]
    M['persons'] = {k: v for k, v in M['persons'].items() if not k.startswith(CID + ':')}
    for mid in list(M['boxes']):
        if mid.startswith('fwac27-'):
            del M['boxes'][mid]
    for pid, rows in list(M['caps'].items()):
        M['caps'][pid] = [r for r in rows if r.get('e') != CAP_E]
        if not M['caps'][pid]:
            del M['caps'][pid]

    rows, teams, tot, num, players = [], [], collections.defaultdict(collections.Counter), {}, []
    for mid, g in games.items():
        h, a = g['sides']['1'], g['sides']['2']
        rows.append([mid, 'COMPLETE', g['date'], g['venue'], h['team'], h['score'], a['team'], a['score'], 1])
        for s in (h, a):
            t = TEAM_ID[s['code']]
            if t not in teams:
                teams.append(t)
        lines = []
        for s, o in ((h, a), (a, h)):
            mas = s['code'] == 'MAS'
            won = int(s['score']) > int(o['score'])
            for p in s['p']:
                v = {k: int(p[k]) for k in NUM}
                sec = secs(p['min'])
                reb = v['oreb'] + v['dreb']
                eff = (v['pts'] + reb + v['ast'] + v['stl'] + v['blk'] - (v['fga'] - v['fgm'])
                       - (v['fta'] - v['ftm']) - v['tov'])
                ln = {k: str(v[k]) for k in NUM}
                ln.update({'pid': '', 'team': s['team'], 'num': p['num'], 'min': clock(sec), 'eff': '%.1f' % eff})
                if mas:
                    pid = MAS[p['name']]
                    ln['pid'] = pid
                    num[pid] = p['num']
                    if pid not in players:
                        players.append(pid)
                    if sec or any(v.values()):
                        c = tot[pid]
                        c['g'] += 1; c['gs'] += int(p['st']); c['w' if won else 'l'] += 1; c['sec'] += sec
                        c['reb'] += reb; c['eff'] += eff
                        for k in NUM:
                            c[k] += v[k]
                else:
                    ln['name'] = p['name']
                lines.append(ln)
        M['boxes'][mid] = {'p': lines, 'periods': g['periods']}

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
        # no url: FIBA has not published an event page for these qualifiers yet
        M['caps'].setdefault(pid, []).append({
            'y': CAP_Y, 'e': CAP_E, 'short': CAP_SHORT, 'lv': 'Senior', 'rank': RANK, 'gp': c['g'],
            'pts': c['pts'], 'reb': c['reb'], 'ast': c['ast'], 'stl': c['stl'], 'blk': c['blk'],
            'min': c['sec'] // 60, 'url': ''})

    lead = []
    for cat, k, avg in (('Average points', 'pts', 1), ('Average total rebounds', 'reb', 1),
                        ('Average assists', 'ast', 1), ('Efficiency', 'eff', 0)):
        val = {p: tot[p][k] / tot[p]['g'] if avg else tot[p][k] for p in players}
        top = sorted(val, key=lambda p: (-val[p], p))[:10]
        lead.append([cat, [[p, '%.1f' % val[p] if avg else '%d' % val[p]] for p in top]])

    M['comps'].append({
        'id': CID, 'name': NAME, 'teams': teams, 'stand': [], 'games': rows, 'lead': lead, 'players': players,
        'roster': [['fx-mas', [[p, num[p], '', '', '', '', '', 'MAS'] for p in players]]],
        'src': 'FIBA box score'})
    json.dump(M, open(os.path.join(D, 'manual_comps.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(CID, len(rows), 'games,', len(players), 'Malaysia players')
    for p in players:
        c = tot[p]
        print(' ', p, num[p], c['g'], 'gp', c['pts'], 'pts', c['reb'], 'reb', clock(c['sec']))


if __name__ == '__main__':
    main()
