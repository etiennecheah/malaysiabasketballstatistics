#!/usr/bin/env python3
"""MSSM Under-18 2026 (Penang, 7-12 Jun 2026), boys and girls, from the CBL app.

CBL (cbl-app.org) scored both championships: "MSSM Penang U18 2026 (L)" (boys, 42 games) and
"(P)" (girls, 37 games). Every box score was read in the owner's browser on 15 Oct 2026 and kept
in data/mssm_u18_2026_raw.txt:

    L|<id6>|<TEAM>|<name>|<shirt>        a player (L boys, P girls; id6 = first 6 of CBL's user id)
    #BOX
    G|L|<game id8>|<UTC yyyy-mm-ddThh:mm>|<stage>|<HOME>|<AWAY>|<hs>|<as>|<period scores>
    H|<id6>|<shirt>|<starter 0/1>|pts,2pm,2pa,3pm,3pa,ftm,fta,reb,ast,stl,blk,tov,pf
    A|...                                 the away side; players who did not play are left out

CBL records no minutes and no offensive/defensive split of rebounds (all go in DREB here), and
its "field goals" are two-pointers only. Its Standings tab counts each team's knockout and
placing games instead of its group games, so the group tables are built here from the group
results. Players are matched to existing profiles in data/mssm_u18_2026_ids.json; the rest get
new ids 'cbl-<id6>'. Writes both competitions into data/manual_comps.json.

Usage: python3 import_mssm_u18.py
"""
import collections, datetime, json, os, re

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')

COMPS = {'L': ('mssm-u18-2026-boys', 'MSSM Under-18 Basketball Championship 2026 (Boys)', 'mssm26b'),
         'P': ('mssm-u18-2026-girls', 'MSSM Under-18 Basketball Championship 2026 (Girls)', 'mssm26g')}
TEAM = {'W.P. LABUAN U18': 'Labuan', 'W.P. KUALA LUMPUR': 'Kuala Lumpur', 'NEGERI SEMBILAN': 'Negeri Sembilan',
        'PULAU PINANG': 'Pulau Pinang'}
team = lambda t: TEAM.get(t, t.title())
# group-stage groups, as CBL lists them
GROUPS = {
    'L': {'A': ['JOHOR', 'PULAU PINANG', 'SARAWAK'], 'B': ['SELANGOR', 'PAHANG', 'KELANTAN', 'W.P. LABUAN U18'],
          'C': ['PERLIS', 'SABAH', 'W.P. KUALA LUMPUR', 'NEGERI SEMBILAN'], 'D': ['MELAKA', 'PERAK', 'TERENGGANU', 'KEDAH']},
    'P': {'A': ['SELANGOR', 'NEGERI SEMBILAN', 'MELAKA'], 'B': ['KEDAH', 'SABAH', 'JOHOR'],
          'C': ['PULAU PINANG', 'W.P. KUALA LUMPUR', 'PAHANG', 'PERLIS'], 'D': ['KELANTAN', 'TERENGGANU', 'PERAK', 'SARAWAK']},
}
STAGE = {'': 'Group {g}', '1-4': 'Quarter-final', '1-3': 'Semi-final', 'finals': 'Final', 'third_place': '3rd place',
         '5-8': '5th-8th place', '5-6': '5th place', '7-8': '7th place', '9-15': '9th-15th place', '9-12': '9th-12th place',
         '9-10': '9th place', '11-12': '11th place', '13-15': '13th-15th place', '13-14': '13th place',
         'quarterfinals': 'Quarter-final', 'semifinals': 'Semi-final', '3-4': '3rd place', '11 - 12': '11th place',
         'round_of_16': '11th-14th place'}
# final placings from the final, the 3rd-place game and the placing games
FINAL = {
    'L': [(1, 'SELANGOR', 'Won the final'), (2, 'PERAK', 'Lost the final'), (3, 'JOHOR', 'Won the 3rd-place game'),
          (4, 'W.P. KUALA LUMPUR', 'Lost the 3rd-place game'), (5, 'SABAH', 'Won the 5th-place game'),
          (6, 'SARAWAK', 'Lost the 5th-place game'), (7, 'KELANTAN', 'Won the 7th-place game'),
          (8, 'KEDAH', 'Lost the 7th-place game'), (9, 'PAHANG', 'Won the 9th-place game'),
          (10, 'MELAKA', 'Lost the 9th-place game'), (11, 'PULAU PINANG', 'Won the 11th-place game (by forfeit)'),
          (12, 'NEGERI SEMBILAN', 'Lost the 11th-place game (forfeit)'), (13, 'PERLIS', 'Won both 13th-15th place games'),
          (14, 'W.P. LABUAN U18', 'Lost the 13th-place game'), (15, 'TERENGGANU', 'Lost the 13th-15th place game')],
    'P': [(1, 'SELANGOR', 'Won the final'), (2, 'PULAU PINANG', 'Lost the final'), (3, 'KEDAH', 'Won the 3rd-place game'),
          (4, 'JOHOR', 'Lost the 3rd-place game'), (5, 'W.P. KUALA LUMPUR', 'Won the 5th-place game'),
          (6, 'NEGERI SEMBILAN', 'Lost the 5th-place game'), (7, 'PERAK', 'Won the 7th-place game'),
          (8, 'SARAWAK', 'Lost the 7th-place game'), (9, 'SABAH', 'Won the 9th-place game'),
          (10, 'PAHANG', 'Lost the 9th-place game'), (11, 'TERENGGANU', 'Won the 11th-place game'),
          (12, 'MELAKA', 'Lost the 11th-place game'), (13, 'KELANTAN', 'Won the 13th-place game'),
          (14, 'PERLIS', 'Lost the 13th-place game')],
}
NOTE = ("Scored on the CBL app, which publishes box scores without minutes, without the offensive/defensive split of "
        "rebounds (all rebounds are shown as defensive here) and without players' dates of birth. CBL's own standings "
        "table counts each team's knockout and placing games, so the group tables here are built from the group "
        "results: 2 points a win, 1 a loss, teams level on points ordered by the games between them, then points "
        "difference. Final standings come from the final, the 3rd-place game and the placing games.")
NOTES = {'L': " Labuan v Terengganu was not played; Labuan, beaten in the 13th-place game, is 14th and Terengganu, "
              "beaten in the 13th-15th place game, 15th. Pulau Pinang's 20-0 over Negeri Sembilan (11th place) is a "
              "forfeit. In Labuan's 31-101 defeat to Selangor the players' points add to 48 for Labuan.",
         'P': " In two games the players' points do not add to the final score: Pahang v Pulau Pinang 55-72 "
              "(box 55-76) and Perak v Sarawak 18-12 (box 25-30)."}
KEYS = ['pts', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf']
PF_KEYS = ['blkr', 'index', 'gmsc', 'fga', 'fgm', 'flson', 'pf', 'unsf', 'fta', 'ftm', 'gs', 'l', 'pa', 'min', 'offrat',
           'pfor', 'twocp', 'posspg', 'dreb', 'drpct', 'oreb', 'orpct', 'stpct', 'tpa', 'tpm', 'tsa', 'tspct', 'tov',
           'topct', 'twopa', 'twopm', 'w', 'pm', 'g', 'pts', 'ast', 'reb', 'stl', 'blk', 'eff']
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def nice(n):
    """CBL names as typed; all-lower or all-upper ones get capitals."""
    n = re.sub(r'\s+', ' ', n).strip()
    if n == n.lower() or n == n.upper():
        n = ' '.join(w[:1].upper() + w[1:].lower() for w in n.split(' '))
    return n


def when(utc):
    d = datetime.datetime.strptime(utc, '%Y-%m-%dT%H:%M') + datetime.timedelta(hours=8)
    return d.strftime('%b ') + str(d.day) + d.strftime(', %Y, ') + d.strftime('%I:%M %p').lstrip('0')


def table(members, games):
    rec = {t: [0, 0, 0, 0] for t in members}
    inner = [g for g in games if g['h'] in rec and g['a'] in rec]
    for g in inner:
        for t, f, x in ((g['h'], g['hs'], g['as']), (g['a'], g['as'], g['hs'])):
            rec[t][0] += f > x; rec[t][1] += f < x; rec[t][2] += f; rec[t][3] += x

    def h2h(ts):
        sub = {t: [0, 0] for t in ts}
        for g in inner:
            if g['h'] in sub and g['a'] in sub:
                sub[g['h']][0] += g['hs'] > g['as']; sub[g['a']][0] += g['as'] > g['hs']
                sub[g['h']][1] += g['hs'] - g['as']; sub[g['a']][1] += g['as'] - g['hs']
        return sub
    order = []
    for w in sorted({v[0] for v in rec.values()}, reverse=True):
        ts = [t for t in members if rec[t][0] == w]
        sub = h2h(ts)
        order += sorted(ts, key=lambda t: (-sub[t][0], -sub[t][1], -(rec[t][2] - rec[t][3]), -rec[t][2]))
    rows = []
    for i, t in enumerate(order, 1):
        w, l, f, a = rec[t]
        rows.append([str(i), '', team(t), str(w + l), str(w), str(l), str(f), str(a), str(f - a),
                     str(round(100 * w / (w + l))) if w + l else '0', str(2 * w + l)])
    return rows


def build():
    raw = open(os.path.join(D, 'mssm_u18_2026_raw.txt'), encoding='utf-8').read()
    head, box = raw.split('#BOX')
    idmap = json.load(open(os.path.join(D, 'mssm_u18_2026_ids.json')))
    same, ids = idmap['same'], idmap['ids']
    who = {}                                  # 'L'+id6 -> (team, name, shirt)
    for ln in head.strip().split('\n'):
        k, i6, t, n, num = ln.split('|')
        who[k + i6] = (t, nice(n), num)
    pid_of = lambda key: ids.get(same.get(key, key)) or 'cbl-' + same.get(key, key)[1:]

    M = json.load(open(os.path.join(D, 'manual_comps.json')))
    bb = json.load(open(os.path.join(D, 'backbone.json')))
    cids = {c[0] for c in COMPS.values()}
    M['comps'] = [c for c in M['comps'] if c['id'] not in cids]
    M['boxes'] = {k: v for k, v in M['boxes'].items() if not k.startswith('cbl-')}
    M['teamReg'] = {k: v for k, v in M['teamReg'].items() if not k.startswith(('mssm26b', 'mssm26g'))}
    M['persons'] = {k: v for k, v in M['persons'].items() if not k.startswith(tuple(c + ':' for c in cids))}
    M['personReg'] = {k: v for k, v in M['personReg'].items() if not k.startswith('cbl-')}

    games = {'L': [], 'P': []}
    cur = None
    for ln in box.strip().split('\n'):
        f = ln.split('|')
        if f[0] == 'G':
            k, g8, utc, stage, h, a, hs, as_, q = f[1:10] if len(f) > 9 else f[1:9] + ['']
            cur = {'k': k, 'mid': 'cbl-' + g8, 'utc': utc, 'stage': stage, 'h': h, 'a': a, 'hs': int(hs),
                   'as': int(as_), 'q': q, 'p': []}
            games[k].append(cur)
        else:
            side, i6, num, st, nums = f
            key = cur['k'] + i6
            v = dict(zip(KEYS, map(int, nums.split(','))))
            cur['p'].append({'key': key, 'side': side, 'num': num or who[key][2], 'st': int(st), **v})

    for k, (cid, name, tag) in COMPS.items():
        G = sorted(games[k], key=lambda g: (g['utc'], g['mid']))
        teams = sorted({g['h'] for g in G} | {g['a'] for g in G})
        tid = {t: '%s-%s' % (tag, slug(team(t))) for t in teams}
        M['teamReg'].update({tid[t]: team(t) for t in teams})
        grp_of = {t: g for g, ts in GROUPS[k].items() for t in ts}
        assert set(grp_of) == set(teams), set(grp_of) ^ set(teams)

        rows, tot, roster, players = [], collections.defaultdict(collections.Counter), collections.defaultdict(dict), []
        last_team = {}
        for g in G:
            label = STAGE[g['stage']].format(g=grp_of.get(g['h'], ''))
            rows.append([g['mid'], 'COMPLETE', when(g['utc']), label + ' · Penang', team(g['h']), str(g['hs']),
                         team(g['a']), str(g['as']), 1 if g['p'] else 0])
            if not g['p']:
                continue
            lines = []
            for p in g['p']:
                pid = pid_of(p['key'])
                t = g['h'] if p['side'] == 'H' else g['a']
                fgm, fga = p['twopm'] + p['tpm'], p['twopa'] + p['tpa']
                eff = (p['pts'] + p['reb'] + p['ast'] + p['stl'] + p['blk'] - (fga - fgm) - (p['fta'] - p['ftm']) - p['tov'])
                lines.append({'pid': pid, 'team': team(t), 'name': who[same.get(p['key'], p['key'])][1], 'num': p['num'],
                              'min': '', 'pts': str(p['pts']), 'fgm': str(fgm), 'fga': str(fga),
                              'twopm': str(p['twopm']), 'twopa': str(p['twopa']), 'tpm': str(p['tpm']), 'tpa': str(p['tpa']),
                              'ftm': str(p['ftm']), 'fta': str(p['fta']), 'oreb': '', 'dreb': str(p['reb']),
                              'ast': str(p['ast']), 'pf': str(p['pf']), 'tov': str(p['tov']), 'stl': str(p['stl']),
                              'blk': str(p['blk']), 'pm': '', 'eff': '%.1f' % eff})
                played = p['st'] or any(p[x] for x in KEYS)
                c = tot[pid]
                if played:
                    c['g'] += 1; c['gs'] += p['st']
                    mine, theirs = (g['hs'], g['as']) if p['side'] == 'H' else (g['as'], g['hs'])
                    c['w' if mine > theirs else 'l'] += 1
                    for x in KEYS:
                        c[x] += p[x]
                    c['fgm'] += fgm; c['fga'] += fga; c['eff'] += eff
                roster[t].setdefault(pid, p['num'])
                last_team[pid] = team(t)
                if pid not in players:
                    players.append(pid)
                if pid.startswith('cbl-') and pid not in bb['personReg']:
                    M['personReg'][pid] = who[same.get(p['key'], p['key'])][1]
            M['boxes'][g['mid']] = {'p': lines}

        # season lines in the source's tab format (team, then PF_KEYS)
        for pid in players:
            c = tot[pid]
            if not c['g']:
                continue
            tsa = c['fga'] + 0.44 * c['fta']
            d = {'fga': c['fga'], 'fgm': c['fgm'], 'pf': c['pf'], 'fta': c['fta'], 'ftm': c['ftm'], 'gs': c['gs'],
                 'l': c['l'], 'w': c['w'], 'dreb': c['reb'], 'tpa': c['tpa'], 'tpm': c['tpm'], 'tov': c['tov'],
                 'twopa': c['twopa'], 'twopm': c['twopm'], 'g': c['g'], 'pts': c['pts'], 'ast': c['ast'],
                 'reb': c['reb'], 'stl': c['stl'], 'blk': c['blk'], 'eff': round(c['eff'], 1),
                 'tsa': round(tsa, 1), 'tspct': round(c['pts'] / (2 * tsa) * 100, 1) if tsa else '',
                 'gmsc': round(c['pts'] + 0.4 * c['fgm'] - 0.7 * c['fga'] - 0.4 * (c['fta'] - c['ftm'])
                               + 0.3 * c['reb'] + c['stl'] + 0.7 * c['ast'] + 0.7 * c['blk'] - 0.4 * c['pf'] - c['tov'], 1)}
            fmt = lambda v: ('%g' % v) if isinstance(v, (int, float)) else (v or '')
            M['persons'][cid + ':' + pid] = '\t'.join([last_team[pid]] + [fmt(d.get(x, '')) for x in PF_KEYS])
        players = [p for p in players if tot[p]['g']]

        # leaders from the season lines (averages need 3 games)
        lead = []
        for cat, x, avg in (('Efficiency', 'eff', 0), ('Points', 'pts', 0), ('Average points', 'pts', 1),
                            ('Assists', 'ast', 0), ('Average assists', 'ast', 1), ('Total rebounds', 'reb', 0),
                            ('Average total rebounds', 'reb', 1), ('Blocks', 'blk', 0), ('Steals', 'stl', 0),
                            ('Average steals', 'stl', 1)):
            val = {p: (tot[p][x] / tot[p]['g'] if avg else tot[p][x]) for p in players if not avg or tot[p]['g'] >= 3}
            top = sorted(val, key=lambda p: (-val[p], p))[:10]
            lead.append([cat, [[p, '%.1f' % val[p] if (avg or x == 'eff') else '%d' % val[p]] for p in top]])

        group_games = [g for g in G if g['stage'] == '']
        stand = [['Group stage — Group %s' % gname,
                  ['Position', '', 'Team', 'GP', 'W', 'L', 'For', 'Agst', 'GD', '%won', 'Pts'],
                  table(GROUPS[k][gname], group_games)] for gname in sorted(GROUPS[k])]
        final = [[p, team(t), why] for p, t, why in FINAL[k]]
        assert sorted(t for _, t, _ in FINAL[k]) == teams
        M['comps'].append({
            'id': cid, 'name': name, 'teams': [tid[t] for t in teams], 'stand': stand, 'games': rows, 'lead': lead,
            'players': players,
            'roster': [[tid[t], [[p, n, '', '', '', '', '', ''] for p, n in sorted(roster[t].items(), key=lambda x: (len(x[1]), x[1]))]]
                       for t in teams],
            'final': final, 'standNote': NOTE + NOTES[k],
        })
        new = sum(1 for p in players if p.startswith('cbl-'))
        print('%s: %d games, %d teams, %d players (%d joined existing profiles, %d new), champion %s'
              % (cid, len(rows), len(teams), len(players), len(players) - new, new, final[0][1]))
    json.dump(M, open(os.path.join(D, 'manual_comps.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    build()
