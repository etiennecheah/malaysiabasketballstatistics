#!/usr/bin/env python3
"""The Shot map tab on player profiles: one data file per competition.

Input: data/shots/<match id>.json, written by the sync from each game's shot chart page
(autosync/source.py shots()): {"cid": ..., "s": [[period, pid, team id, top %, left %,
three 0/1, shot type, made 0/1], ...]}. The chart is a picture of the whole court, so a
shot at the far basket is turned round first; then every shot is put in metres from the
rim it was taken at:

    x   across the court, + = the shooter's right as he faces the basket
    y   from the rim towards half court

Output:
  stats/sh/<cid>.js       SHOTS_PUT('<cid>', {Z, G, T, M, P, n, g}), pulled in by the profile tab
      Z  the competition's makes and attempts per zone       {zone: [attempts, makes]}
      G  the competition's shots on a 0.5 m grid             "i,j,attempts,makes;..."
      T  shot types, M match ids (indexed from P)
      P  each player's shots                                 {pid: [[x, y, made, three, type, match, period]]}
  data/shots_index.json   {cid: {pid: attempts}}, embedded by build_site.py, so a profile
                          knows whether to offer the tab before any file is loaded

The zones match assets/app4u_shots.js (zoneOf) exactly.
Run: python3 build_shots.py     (after build_data.py, before build_site.py)
"""
import glob, json, math, os, shutil

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')
OUT = os.path.join(R, 'stats', 'sh')
RIM = 1.575            # rim centre, metres from the baseline (FIBA)


def place(top, left):
    """Chart percentages -> (x, y) in metres from the rim the shot was taken at."""
    if left < 50:
        d, yi = left / 100 * 28, top / 100 * 15
    else:                                          # the far basket: turn the court round
        d, yi = 28 - left / 100 * 28, 15 - top / 100 * 15
    return 7.5 - yi, d - RIM


def zone(x, y, three):
    d, side = y + RIM, 'L' if x < 0 else 'R'
    if three:
        if d <= 3.13:                              # the straight part of the line (2.99 m) plus half a chart step
            return 'C3' + side
        return 'T3' if abs(x) <= 2.45 else 'W3' + side
    if abs(x) <= 2.45 and d <= 5.8:
        return 'PT'
    return 'MC' if abs(x) <= 2.45 else 'M' + side


def main():
    site = json.load(open(os.path.join(D, 'site_data.json')))
    alias = site.get('palias', {})
    comps = {c['id']: c for c in site['comps']}
    by = {}
    for f in sorted(glob.glob(os.path.join(D, 'shots', '*.json'))):
        mid = os.path.basename(f)[:-5]
        g = json.load(open(f))
        if g.get('cid') in comps:
            by.setdefault(g['cid'], []).append((mid, g['s']))
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    index, total = {}, 0
    for cid, games in sorted(by.items()):
        Z, grid, P, T, M = {}, {}, {}, [], []
        for mid, rows in games:
            for per, pid, tn, top, left, three, typ, made in rows:
                x, y = place(float(top), float(left))
                z = zone(x, y, three)
                a = Z.setdefault(z, [0, 0]); a[0] += 1; a[1] += made
                k = '%d,%d' % (math.floor((x + 7.5) / 0.5), math.floor((y + RIM) / 0.5))
                a = grid.setdefault(k, [0, 0]); a[0] += 1; a[1] += made
                if not pid:
                    continue
                pid = alias.get(pid, pid)
                if typ not in T:
                    T.append(typ)
                if mid not in M:
                    M.append(mid)
                P.setdefault(pid, []).append([round(x, 2), round(y, 2), made, three, T.index(typ), M.index(mid), per])
        n = sum(a[0] for a in Z.values())
        total += n
        data = {'Z': Z, 'G': ';'.join(k + ',%d,%d' % tuple(v) for k, v in sorted(grid.items())), 'T': T, 'M': M, 'P': P,
                'n': n, 'g': len(games)}
        with open(os.path.join(OUT, cid + '.js'), 'w') as f:
            f.write('SHOTS_PUT(%s,%s);' % (json.dumps(cid), json.dumps(data, separators=(',', ':'))))
        index[cid] = {pid: len(v) for pid, v in P.items()}
    json.dump(index, open(os.path.join(D, 'shots_index.json'), 'w'), separators=(',', ':'))
    print('shots: %d attempts in %d games of %d competition(s), %d players with a shot map'
          % (total, sum(len(v) for v in by.values()), len(by), len({p for v in index.values() for p in v})))


if __name__ == '__main__':
    main()
