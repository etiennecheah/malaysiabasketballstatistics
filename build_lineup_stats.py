#!/usr/bin/env python3
"""Lineup tables: the box score of every five that shared the floor.

Input: data/stints_full.json (build_lineups.py) - every stint of every game whose
lineups could be rebuilt exactly (five a side in every period), with the points
and the box-score events that happened inside it, for both sides.

A lineup row is one team's five and everything that happened while exactly those
five were on court together in one competition: seconds, the games it appeared
in, its own counters and its opponents'. Rows for four, three or two players are
not stored: they are sums of the five-man rows that contain those players, which
the page works out when asked (minutes and events add; games are a union).

Checked against the published box scores on every run: a team's stints, added up,
must give back the team's box-score line.

Output: data/lineup_stats.json
  {meta, comps: {cid: {teams: [name], players: [[pid, name]], games: [mid],
                       rows: [[team, [p1..p5], seconds, [game idx], own[18], opp[18]]]}}}
  own/opp = points followed by the counters in build_lineups.BX.

Run: python3 build_lineup_stats.py     (after build_lineups.py)
"""
import json, os, collections
from build_lineups import BX

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
CHECK = ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'tov', 'stl', 'blk', 'pf']


def main():
    db = json.load(open(os.path.join(D, 'site_data.json')))
    SF = json.load(open(os.path.join(D, 'stints_full.json')))
    bk = db['bkeys']
    G = {g['mid']: (c['id'], g) for c in db['comps'] for g in c['games']}
    label = {c['id']: c['label'] for c in db['comps']}
    n_games = {c['id']: sum(1 for g in c['games'] if g['st'] == 'COMPLETE') for c in db['comps']}

    # ---- validation: stints add up to the box score ------------------------
    exact, absd, tot, n, all_ok, pts_ok = collections.Counter(), collections.Counter(), collections.Counter(), 0, 0, 0
    for mid, v in SF.items():
        _, g = G[mid]
        box = db['boxes'][mid]
        bt = [collections.Counter(), collections.Counter()]
        for row in box['p']:
            r = {bk[i]: row[i] for i in range(min(len(row), len(bk)))}
            ti = r.get('ti', -1)
            if ti is None or ti < 0:
                continue
            tn = box['t'][ti]
            t = 0 if tn == g['h'] else 1 if tn == g['a'] else None
            if t is None:
                continue
            for k in CHECK + ['pts']:
                try:
                    bt[t][k] += float(r.get(k) or 0)
                except (TypeError, ValueError):
                    pass
        st = [collections.Counter(), collections.Counter()]
        for s in v['st']:
            for i in (0, 1):
                st[i]['pts'] += s[4][i]
                for k, x in zip(BX, s[5][i]):
                    st[i][k] += x
        for i in (0, 1):
            n += 1
            ok = True
            for k in CHECK:
                d = st[i][k] - bt[i][k]
                exact[k] += d == 0; absd[k] += abs(d); tot[k] += bt[i][k]
                ok = ok and d == 0
            all_ok += ok
            pts_ok += st[i]['pts'] == bt[i]['pts']

    # ---- aggregate ---------------------------------------------------------
    comps = {}
    kept, lost = collections.Counter(), collections.Counter()
    for mid, v in SF.items():
        cid, g = G[mid]
        C = comps.setdefault(cid, {'teams': [], 'pl': {}, 'games': [], 'rows': {}})
        gi = len(C['games'])
        C['games'].append(mid)
        for side, tn in ((0, g['h']), (1, g['a'])):
            if tn not in C['teams']:
                C['teams'].append(tn)
            ti = C['teams'].index(tn)
            # A substitution is logged as an "out" and an "in"; a free throw logged
            # between the two lands in a zero-second stint with four on court. It is
            # carried to the five that completes the change. A stint that runs on the
            # clock with four or six on court is a substitution the feed never logged:
            # nobody can say who the five were, so it is left out and counted in `lost`.
            carry = None
            for s in v['st']:
                five = tuple(s[2 + side])
                own = [s[4][side]] + list(s[5][side])
                opp = [s[4][1 - side]] + list(s[5][1 - side])
                if len(five) != 5:
                    if s[1] == 0:
                        if carry is None:
                            carry = [[0] * len(own), [0] * len(opp)]
                        carry = [[a + b for a, b in zip(carry[0], own)], [a + b for a, b in zip(carry[1], opp)]]
                    else:
                        lost['sec'] += s[1]; lost['pts'] += own[0]
                    continue
                if carry:
                    own = [a + b for a, b in zip(own, carry[0])]
                    opp = [a + b for a, b in zip(opp, carry[1])]
                    carry = None
                key = (ti, five)
                R = C['rows'].get(key)
                if R is None:
                    R = C['rows'][key] = [0, set(), [0] * (1 + len(BX)), [0] * (1 + len(BX))]
                R[0] += s[1]
                R[1].add(gi)
                kept['sec'] += s[1]; kept['pts'] += own[0]
                for j, x in enumerate(own):
                    R[2][j] += x
                for j, x in enumerate(opp):
                    R[3][j] += x
            if carry:
                lost['pts'] += carry[0][0]

    out = {}
    n_rows = 0
    for cid, C in comps.items():
        ids = sorted({p for (_, five) in C['rows'] for p in five})
        idx = {p: i for i, p in enumerate(ids)}
        players = [[p, (p[1:] if p.startswith('?') else db['persons'].get(p, 'Unknown player'))] for p in ids]
        rows = [[ti, [idx[p] for p in five], R[0], sorted(R[1]), R[2], R[3]]
                for (ti, five), R in C['rows'].items() if R[0] > 0 or any(R[2]) or any(R[3])]
        rows.sort(key=lambda r: -r[2])
        out[cid] = {'label': label[cid], 'teams': C['teams'], 'players': players, 'games': C['games'],
                    'done': n_games[cid], 'rows': rows}
        n_rows += len(rows)

    meta = {'bx': ['pts'] + BX, 'games': len(SF), 'team_games': n, 'all_exact': round(all_ok / n, 4),
            'pts_exact': round(pts_ok / n, 4),
            'exact': {k: round(exact[k] / n, 4) for k in CHECK},
            'gap': {k: round(absd[k] / max(tot[k], 1), 5) for k in CHECK},
            'in_fives': {'sec': round(kept['sec'] / max(kept['sec'] + lost['sec'], 1), 5),
                         'pts': round(kept['pts'] / max(kept['pts'] + lost['pts'], 1), 5)}}
    json.dump({'meta': meta, 'comps': out}, open(os.path.join(D, 'lineup_stats.json'), 'w'), separators=(',', ':'))
    print('lineup rows: %d five-man lineups in %d competitions, %d games' % (n_rows, len(out), len(SF)))
    print('box-score check over %d team-games: points exact %.1f%% | every counter exact %.1f%%'
          % (n, 100 * pts_ok / n, 100 * all_ok / n))
    print('  ' + ' | '.join('%s %.1f%%' % (k, 100 * exact[k] / n) for k in CHECK))
    print('  inside a known five: %.3f%% of minutes, %.3f%% of points | %.2f MB'
          % (100 * meta['in_fives']['sec'], 100 * meta['in_fives']['pts'],
             os.path.getsize(os.path.join(D, 'lineup_stats.json')) / 1024 / 1024))


if __name__ == '__main__':
    main()
