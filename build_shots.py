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
  stats/sh/<cid>.js       SHOTS_PUT('<cid>', {Z, G, n, g}): the event's averages, which every shot
                          of that event is measured against
      Z  makes and attempts per zone                         {zone: [attempts, makes]}
      G  every shot on a 0.5 m grid                          "i,j,attempts,makes;..."
      n, g  shots and games
  stats/shp/<pid>.js      SHOTP_PUT('<pid>', {T, M, E}): one player's shots in every event, so his
                          career map loads one file of his own plus the averages of his events
      T  shot types, M match ids (indexed from E)
      E  {cid: [[x, y, made, three, type, match, period], ...]}
  data/shots_index.json   "pid,pid,...": every player with a shot, embedded by build_site.py so a
                          profile knows whether to offer the tab before any file is loaded (kept to
                          a bare list: it rides in the main data file every page loads)

The zones match assets/app4u_shots.js (zoneOf) exactly.
Run: python3 build_shots.py     (after build_data.py, before build_site.py)
"""
import glob, json, math, os, shutil

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')
OUT = os.path.join(R, 'stats', 'sh')
OUTP = os.path.join(R, 'stats', 'shp')
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
    for d in (OUT, OUTP):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)
    total, players, per_comp = 0, {}, {}
    for cid, games in sorted(by.items()):
        Z, grid, P = {}, {}, {}
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
                pl = players.setdefault(pid, {'T': [], 'M': [], 'E': {}})
                if typ not in pl['T']:
                    pl['T'].append(typ)
                if mid not in pl['M']:
                    pl['M'].append(mid)
                pl['E'].setdefault(cid, []).append([round(x, 2), round(y, 2), made, three, pl['T'].index(typ), pl['M'].index(mid), per])
                P[pid] = P.get(pid, 0) + 1
        n = sum(a[0] for a in Z.values())
        total += n
        data = {'Z': Z, 'G': ';'.join(k + ',%d,%d' % tuple(v) for k, v in sorted(grid.items())), 'n': n, 'g': len(games)}
        with open(os.path.join(OUT, cid + '.js'), 'w') as f:
            f.write('SHOTS_PUT(%s,%s);' % (json.dumps(cid), json.dumps(data, separators=(',', ':'))))
        per_comp[cid] = len(P)
    for pid, pl in players.items():
        with open(os.path.join(OUTP, pid + '.js'), 'w') as f:
            f.write('SHOTP_PUT(%s,%s);' % (json.dumps(pid), json.dumps(pl, separators=(',', ':'))))
    json.dump(','.join(sorted(players)), open(os.path.join(D, 'shots_index.json'), 'w'))
    print('shots: %d attempts in %d games of %d competition(s), %d players with a shot map'
          % (total, sum(len(v) for v in by.values()), len(by), len(players)))


if __name__ == '__main__':
    main()
