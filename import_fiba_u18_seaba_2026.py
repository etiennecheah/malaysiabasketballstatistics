"""FIBA U18 Asia Cup 2026 SEABA Qualifiers (Krabi, Thailand) -> data/manual_comps.json.

Malaysia's four games, copied from FIBA LiveStats (data/fibalive_u18_seaba_2026.txt):
  T|<mid>|<side>|<team>|<code>|<score>|<quarters>
  <side>|first|family|shirt|min|pts|fgm|fga|2pm|2pa|3pm|3pa|ftm|fta|oreb|dreb|ast|pf|tov|stl|blk|pm|starter|pos
Re-running replaces this competition's rows; nothing else is touched.
"""
import collections, json, os

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
CID = 'fiba-u18-seaba-2026'
NAME = 'FIBA U18 Asia Cup 2026 SEABA Qualifiers (Boys)'
CAP_E, CAP_SHORT, RANK = 'FIBA U18 Asia Cup 2026 SEABA Qualifiers', 'FIBA U18 SEABA Qualifiers', '3rd'
URL = 'https://fibalivestats.dcd.shared.geniussports.com/u/FASIA/%s/'
VENUE = 'Krabi, Thailand'
GAMES = {  # mid: (date, stage note)
    '2848082': ('Jun 10, 2026', ''),
    '2848084': ('Jun 12, 2026', ''),
    '2848086': ('Jun 13, 2026', 'Semi-final · '),
    '2848089': ('Jun 14, 2026', '3rd-place game · '),
}
TEAM_ID = {'MAS': 'fx-mas', 'LAO': 'fx-lao', 'INA': 'fx-ina', 'PHI': 'fx-phi'}
TEAM_NAME = {'fx-lao': 'Laos'}
# Malaysia players as LiveStats lists them (first|family) -> site profile
MAS = {
    'Kai Sheng|Teng': '1900668', 'Xian Yang, Isaac|Au': '2253396', 'Shao Zhe, Lucas|Chen': '2249317',
    'Kuan Yit|Lim': '2096724', 'Fatt Kam|Sing': '2096961', 'Jun Ming|Ong': '2786678', 'Yok Geng|Ong': '2786737',
    'Jian Wen, Kenwen|Lee': '2455705', 'Chong Han|Chow': '2249322', 'Yu Xiang|Tan': '2568859',
    'Soo Jie, Henrique|Chia': '2786714', 'Jing Hao|Tee': '2249324',
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
    return int(a) * 60 + int(b)          # LiveStats writes "9:60" for 10:00; this absorbs it


def clock(s):
    return '%d:%02d' % (s // 60, s % 60)


def parse():
    games, cur = collections.OrderedDict(), None
    for ln in open(os.path.join(D, 'fibalive_u18_seaba_2026.txt'), encoding='utf-8').read().strip().split('\n'):
        f = ln.split('|')
        if f[0] == 'T':
            _, mid, side, team, code, score, qs = f
            g = games.setdefault(mid, {'sides': {}})
            g['sides'][side] = cur = {'team': team, 'code': code, 'score': score, 'p': []}
        else:
            side, first, family = f[0], f[1], f[2]
            p = dict(zip(COLS, f[3:]))
            p['first'], p['family'] = first, family
            cur['p'].append(p)
    return games


def main():
    games = parse()
    M = json.load(open(os.path.join(D, 'manual_comps.json'), encoding='utf-8'))
    M['comps'] = [c for c in M['comps'] if c['id'] != CID]
    M['persons'] = {k: v for k, v in M['persons'].items() if not k.startswith(CID + ':')}
    for mid in GAMES:
        M['boxes'].pop(mid, None)
    for pid, rows in list(M['caps'].items()):
        M['caps'][pid] = [r for r in rows if r.get('e') != CAP_E]
        if not M['caps'][pid]:
            del M['caps'][pid]
    M['teamReg'].update(TEAM_NAME)

    rows, teams, tot, num, pos, players = [], ['fx-mas'], collections.defaultdict(collections.Counter), {}, {}, []
    for mid, g in games.items():
        h, a = g['sides']['1'], g['sides']['2']
        date, note = GAMES[mid]
        rows.append([mid, 'COMPLETE', date, note + VENUE, h['team'], h['score'], a['team'], a['score'], 1])
        for s in (h, a):
            t = TEAM_ID[s['code']]
            if t not in teams:
                teams.append(t)
        lines = []
        for side, s, o in (('1', h, a), ('2', a, h)):
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
                    pid = MAS[p['first'] + '|' + p['family']]
                    ln['pid'] = pid
                    num[pid], pos[pid] = p['num'], p['pos']
                    if pid not in players:
                        players.append(pid)
                    if sec or any(v.values()):
                        c = tot[pid]
                        c['g'] += 1; c['gs'] += int(p['st']); c['w' if won else 'l'] += 1; c['sec'] += sec
                        c['reb'] += reb; c['eff'] += eff
                        for k in NUM:
                            c[k] += v[k]
                else:
                    ln['name'] = ('%s %s' % (p['first'], p['family'])).strip()
                lines.append(ln)
        M['boxes'][mid] = {'p': lines}

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
            'y': 2026, 'e': CAP_E, 'short': CAP_SHORT, 'lv': 'Youth', 'rank': RANK, 'gp': c['g'],
            'pts': c['pts'], 'reb': c['reb'], 'ast': c['ast'], 'stl': c['stl'], 'blk': c['blk'],
            'min': c['sec'] // 60, 'url': URL % next(iter(GAMES))})

    lead = []
    for cat, k, avg in (('Average points', 'pts', 1), ('Average total rebounds', 'reb', 1),
                        ('Average assists', 'ast', 1), ('Efficiency', 'eff', 0)):
        val = {p: tot[p][k] / tot[p]['g'] if avg else tot[p][k] for p in players}
        top = sorted(val, key=lambda p: (-val[p], p))[:10]
        lead.append([cat, [[p, '%.1f' % val[p] if avg else '%d' % val[p]] for p in top]])

    M['comps'].append({
        'id': CID, 'name': NAME, 'teams': teams, 'stand': [], 'games': rows, 'lead': lead, 'players': players,
        'roster': [['fx-mas', [[p, num[p], '', '', '', '', pos[p], 'MAS'] for p in players]]],
        'src': 'FIBA LiveStats'})
    json.dump(M, open(os.path.join(D, 'manual_comps.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(CID, len(rows), 'games,', len(players), 'Malaysia players')
    for p in players:
        c = tot[p]
        print(' ', p, num[p], c['g'], 'gp', c['pts'], 'pts', c['reb'], 'reb', clock(c['sec']))


if __name__ == '__main__':
    main()
