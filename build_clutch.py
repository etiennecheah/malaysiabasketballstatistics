#!/usr/bin/env python3
"""Clutch time: the last five minutes of the fourth quarter or of an overtime,
with the score within five points.

For every game whose lineups can be rebuilt exactly (the same games the lineup
tables use), the last five minutes of each period from the fourth on are written
out as a timeline: stretches of clock with the score and both fives, and every
event with the score as it stood when its clock reading began. Only the part
where the margin was five or fewer is kept. The page then cuts that timeline any
way the reader asks - last 2 minutes, within 3 points, behind or tied - and adds
it up per player or per team. Nothing is pre-added, so every filter combination
is exact rather than one of a fixed set.

Output: data/clutch.json
  {meta, comps: {cid: {label, teams: [name], players: [[pid, name, pos, birth year]],
     games: [{mid, date, h, a, hs, as, st: [[home starters], [away starters]],
              lu: [[[home five], [away five]], ...],
              rows: [[0, period, from, to, margin, lu]            clock, home margin
                     [1, period, clock, margin, lu, side, player, mask, pts, type]]}]}}}
  mask = bit i set when the event adds one to build_lineups.BX[i]; type 2/3 for a
  shot, 1 for a free throw, 0 otherwise. Clock values are seconds left in the period.

Run: python3 build_clutch.py     (after build_lineups.py)
"""
import json, os, glob, collections, re
from build_lineups import BX, BXI, box_sides, rebuild_filled, secs, box_counts
from build_pbp import chron
from build_bpm import position_registry

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
WINDOW = 300      # seconds: the widest clutch time offered
MAXDIFF = 5       # points: the widest margin offered


def pos_group(v):
    if v is None:
        return ''
    return 'G' if v <= 2.5 else 'F' if v < 4.5 else 'C'


def birth_year(dob):
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{2,4})$', str(dob or '').strip())
    if not m:
        return None
    y = int(m.group(3))
    return y if y > 100 else (2000 + y if y <= 30 else 1900 + y)


def main():
    db = json.load(open(os.path.join(D, 'site_data.json')))
    SF = json.load(open(os.path.join(D, 'stints_full.json')))
    bk = db['bkeys']
    palias = db.get('palias') or {}
    G = {g['mid']: (c['id'], g) for c in db['comps'] for g in c['games']}
    label = {c['id']: c['label'] for c in db['comps']}
    posreg = position_registry(db)
    born = {}
    for c in db['comps']:
        for rows in (c.get('roster') or {}).values():
            for r in rows:
                y = birth_year(r.get('dob'))
                if y and r.get('pid'):
                    born.setdefault(str(r['pid']), y)

    comps = {}
    n_games = n_clutch = n_rows = 0
    check = collections.Counter()
    for f in sorted(glob.glob(os.path.join(D, 'pbp_raw', '*.json'))):
        mid = os.path.basename(f)[:-5]
        if mid not in G or mid not in SF:          # SF holds exactly the cleanly rebuilt games
            continue
        cid, g = G[mid]
        if g.get('hs') is None or g.get('as') is None:
            continue
        ev = json.load(open(f))
        sides, bmin, _ = box_sides(db, bk, palias, db['boxes'][mid], g)
        st, sec, pm, lead, bad, seen, filled, log = rebuild_filled(ev, sides, bmin, want_log=True)
        if bad:
            continue
        n_games += 1
        C = comps.setdefault(cid, {'teams': [], 'pl': {}, 'games': []})

        def pidx(k):
            k = k if not isinstance(k, tuple) else '?' + str(k[3] or k[2])
            if k not in C['pl']:
                C['pl'][k] = len(C['pl'])
            return C['pl'][k]

        lus, lu_i, rows = [], {}, []

        def lu(on1, on2):
            key = (on1, on2)
            if key not in lu_i:
                lu_i[key] = len(lus)
                lus.append([sorted(pidx(k) for k in on1), sorted(pidx(k) for k in on2)])
            return lu_i[key]

        for r in log:
            p = r[1]
            if not str(p).isdigit() or int(p) < 4:
                continue
            p = int(p)
            if r[0] == 'T':
                _, _, t0, t1, sh, sa, on1, on2 = r
                a, b = min(t0, WINDOW), min(t1, WINDOW)
                if a <= b or abs(sh - sa) > MAXDIFF:
                    continue
                rows.append([0, p, a, b, sh - sa, lu(on1, on2)])
            else:
                _, _, t, sh, sa, on1, on2, side, k, counts, pts, act = r
                if t > WINDOW or abs(sh - sa) > MAXDIFF or (not counts and not pts):
                    continue
                mask = 0
                for c_ in counts:
                    mask |= 1 << BXI[c_]
                a_ = ' '.join(str(act).split())
                kind = 1 if a_.startswith('Free throw') else 3 if 'tpa' in counts else 2 if 'fga' in counts else 0
                rows.append([1, p, t, sh - sa, lu(on1, on2), side - 1, pidx(k) if k is not None else -1, mask, pts, kind])
        if not rows:
            continue
        n_clutch += 1
        n_rows += len(rows)
        for tn in (g['h'], g['a']):
            if tn not in C['teams']:
                C['teams'].append(tn)
        first = next((s for s in SF[mid]['st'] if str(s[0]) == '1'), None)
        starters = [[pidx(k) for k in first[2]], [pidx(k) for k in first[3]]] if first else [[], []]
        C['games'].append({'mid': mid, 'date': g.get('date') or '', 'h': C['teams'].index(g['h']), 'a': C['teams'].index(g['a']),
                           'hs': g['hs'], 'as': g['as'], 'st': starters, 'lu': lus, 'rows': rows})

        # ---- check: the same clutch points, counted the plain way from the feed ----
        # (no lineups involved: period, clock, and the score when the clock reading began)
        ref = [0, 0]
        sc = [0, 0]
        cur = None
        for e in chron(ev):
            grp = (str(e[0]), e[2])
            if grp != cur:
                cur, gm = grp, sc[0] - sc[1]
            if e[1] not in (1, 2):
                continue
            c_ = box_counts(e)
            got = (3 if 'tpm' in c_ else 2 if 'fgm' in c_ else 0) + (1 if 'ftm' in c_ else 0)
            if not got:
                continue
            sc[e[1] - 1] += got
            if str(e[0]).isdigit() and int(e[0]) >= 4 and e[2] and secs(e[2]) <= WINDOW and abs(gm) <= MAXDIFF:
                ref[e[1] - 1] += got
        got = [sum(r[8] for r in rows if r[0] == 1 and r[5] == i) for i in (0, 1)]
        check['games'] += 1
        check['pts_match'] += got == ref

    out = {}
    for cid, C in comps.items():
        if not C['games']:
            continue
        ids = sorted(C['pl'], key=lambda k: C['pl'][k])
        players = [[k, (k[1:] if k.startswith('?') else db['persons'].get(k, 'Unknown player')),
                    pos_group(posreg.get(k)), born.get(k)] for k in ids]
        C['games'].sort(key=lambda x: (x['date'], x['mid']))
        out[cid] = {'label': label[cid], 'teams': C['teams'], 'players': players, 'games': C['games']}
    meta = {'bx': BX, 'window': WINDOW, 'maxdiff': MAXDIFF, 'games': n_games, 'clutch_games': n_clutch,
            'check_games': check['games'], 'pts_match': round(check['pts_match'] / max(check['games'], 1), 4)}
    json.dump({'meta': meta, 'comps': out}, open(os.path.join(D, 'clutch.json'), 'w'), separators=(',', ':'))
    print('clutch: %d of %d rebuilt games reached clutch time (last 5:00 of Q4/OT within %d) in %d competitions | %d timeline rows'
          % (n_clutch, n_games, MAXDIFF, len(out), n_rows))
    print('  check against a plain count from the feed: clutch points per side match in %d of %d games (%.1f%%) | %.2f MB'
          % (check['pts_match'], check['games'], 100 * check['pts_match'] / max(check['games'], 1),
             os.path.getsize(os.path.join(D, 'clutch.json')) / 1024 / 1024))


if __name__ == '__main__':
    main()
