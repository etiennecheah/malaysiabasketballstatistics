#!/usr/bin/env python3
"""The Stats pages (Lineups and Clutch): one small data file per competition.

Runs the two calculations, then cuts their output into files the page pulls in
on demand, the same way it pulls in play-by-play:

  build_lineup_stats.py  -> data/lineup_stats.json  -> stats/lu/<cid>.js
  build_clutch.py        -> data/clutch.json        -> stats/cl/<cid>.js
  data/stints_full.json  -> stats/lv/<cid>.js   every rebuilt stint of a game, for the
                         Lineups mode of Compare (team against team, one competition,
                         LV_COMPS only)
  data/stats_index.json  the list of competitions each page offers, with the
                         checks shown in the glossary; build_site.py embeds it

A file is one call: STATS_PUT('lu' | 'cl', '<cid>', {...}); a Compare › Lineups file is
CMPL_PUT('<cid>', {...}).

Run: python3 build_stats.py     (after build_pbp.py, before build_site.py)
"""
import json, os, re, shutil

import build_lineup_stats, build_clutch

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')
OUT = os.path.join(R, 'stats')
# the competitions Compare › Lineups offers: the three MBL seasons and the 2026 Agong Cup
LV_COMPS = ['40226', '37621', '35104', '50247', '50248']
# Tools › WOWY (app4zd_wowy.js) reads the same files, for the men's Agong Cup and the men's MBL only
# (user decision, 3 Nov 2026): every edition of each that has rebuilt stints
def wowy_comps(comps):
    out = []
    for c in comps:
        if c['series'] == 'Agong Cup' and c.get('gender') == 'Men':
            out.append((c['id'], 'agm'))
        elif c['series'] == 'Major Basketball League' and c.get('gender') != 'Women':
            out.append((c['id'], 'mbl'))
    return out


def code(name):
    """A short code for a team that has none in the standings: initials, or the first three letters."""
    parts = [p for p in re.split(r'[^A-Za-z0-9]+', name) if p]
    if not parts:
        return '?'
    return (parts[0][:3] if len(parts) == 1 else ''.join(p[0] for p in parts)[:3]).upper()


def put(kind, cid, obj):
    p = os.path.join(OUT, kind, cid + '.js')
    # the Compare › Lineups files answer to their own page (app4y_cmplineups.js)
    # and Stat Line Shift's player counters to theirs (app4ze_shift.js)
    body = json.dumps(obj, separators=(',', ':'), ensure_ascii=False)
    call = "CMPL_PUT('%s',%s);\n" % (cid, body) if kind == 'lv' else "SLS_PUT('%s',%s);\n" % (cid, body) if kind == 'sp' \
        else "STATS_PUT('%s','%s',%s);\n" % (kind, cid, body)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(call)
    return os.path.getsize(p)


def main():
    build_lineup_stats.main()
    build_clutch.main()
    L = json.load(open(os.path.join(D, 'lineup_stats.json')))
    K = json.load(open(os.path.join(D, 'clutch.json')))
    LJ = json.load(open(os.path.join(D, 'lineups.json')))
    db = json.load(open(os.path.join(D, 'site_data.json')))
    info = {c['id']: c for c in db['comps']}

    def codes(cid, teams):
        known = {s['team']: s.get('code') for s in info[cid].get('stand', []) if s.get('code')}
        return [[t, known.get(t) or code(t)] for t in teams]

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(OUT, 'lu'))
    os.makedirs(os.path.join(OUT, 'cl'))
    os.makedirs(os.path.join(OUT, 'lv'))
    os.makedirs(os.path.join(OUT, 'sp'))

    lu, size = [], 0
    for cid, C in L['comps'].items():
        size += put('lu', cid, {'teams': codes(cid, C['teams']), 'players': C['players'], 'rows': C['rows']})
        lu.append({'id': cid, 'label': C['label'], 'year': info[cid]['year'], 'done': C['done'],
                   'games': len(C['games']), 'fives': len(C['rows'])})
    # newest season first, and inside a season the competition with the most games rebuilt
    lu.sort(key=lambda c: (-c['year'], -c['games'], c['label']))
    cl = []
    for cid, C in K['comps'].items():
        games = [{'h': g['h'], 'a': g['a'], 'hs': g['hs'], 'as': g['as'], 'st': g['st'], 'lu': g['lu'], 'rows': g['rows']}
                 for g in C['games']]
        size += put('cl', cid, {'teams': codes(cid, C['teams']), 'players': C['players'], 'games': games})
        cl.append({'id': cid, 'label': C['label'], 'year': info[cid]['year'],
                   'rebuilt': len(L['comps'][cid]['games']), 'games': len(games)})
    cl.sort(key=lambda c: (-c['year'], -c['games'], c['label']))

    # Compare › Lineups: per game, every stint with both fives (as player indexes), the
    # points and the box-score counters of each side; the page adds them up for any pair
    SF = json.load(open(os.path.join(D, 'stints_full.json')))
    # each player's own counters per stint (build_lineups.py), for Stat Line Shift
    spp = os.path.join(D, 'stints_pp.json')
    PPJ = json.load(open(spp)) if os.path.exists(spp) else {'keys': [], 'games': {}}
    PP, PPK = PPJ['games'], PPJ['keys']
    BOX = json.load(open(os.path.join(D, 'boxscores.json')))
    pal = db.get('palias', {})
    lv, wy = [], []
    WY = dict(wowy_comps(db['comps']))
    for cid in list(dict.fromkeys(LV_COMPS + list(WY))):
        c = info.get(cid)
        if not c:
            continue
        ids, num, games, spg = [], {}, [], []
        ix = {}
        def pi(p):
            if p not in ix:
                ix[p] = len(ids); ids.append(p)
            return ix[p]
        for g in sorted(c['games'], key=lambda g: (g.get('date') or '', g.get('time') or '')):
            if g['mid'] not in SF or g.get('st') != 'COMPLETE':
                continue
            for r in (BOX.get(g['mid']) or {}).get('p', []):
                if r.get('pid') and r.get('num') not in (None, ''):
                    num[pal.get(r['pid'], r['pid'])] = str(r['num'])
            st = [[s[0], s[1], [pi(k) for k in s[2]], [pi(k) for k in s[3]], s[4], s[5]] for s in SF[g['mid']]['st']]
            # each player's own counters per stint, in a file of their own (stats/sp/<cid>.js) so WOWY
            # and Compare › Lineups do not download them: one entry per stint, [home, away]
            if cid in WY:
                pp = PP.get(g['mid'])
                spg.append([[{str(pi(k)): v for k, v in h.items()}, {str(pi(k)): v for k, v in a.items()}] for h, a in pp]
                           if pp and len(pp) == len(st) else None)
            games.append({'mid': g['mid'], 'date': g.get('date', ''), 'h': g['h'], 'a': g['a'], 'hs': g['hs'], 'as': g['as'], 'st': st,
                          **({'po': 1} if g['mid'] in (c.get('phase') or {}) else {})})
        players = [[p, p[1:] if p.startswith('?') else db['persons'].get(p, 'Unknown player'), num.get(p, '')] for p in ids]
        size += put('lv', cid, {'players': players, 'games': games})
        if cid in WY:
            size += put('sp', cid, {'keys': PPK, 'games': spg})
        played = [g for g in c['games'] if g.get('st') == 'COMPLETE']
        if cid in LV_COMPS:
            lv.append({'id': cid, 'label': c.get('label') or c['name'], 'year': c['year'], 'games': len(games), 'played': len(played)})
        if cid in WY and games:
            wy.append({'id': cid, 'ser': WY[cid], 'label': c.get('label') or c['name'], 'year': c['year'], 'games': len(games), 'played': len(played)})

    index = {
        'lu': {'comps': lu, 'meta': {'games': L['meta']['games'], 'lineups': sum(c['fives'] for c in lu),
                                     'pts_exact': L['meta']['pts_exact'], 'all_exact': L['meta']['all_exact'],
                                     'pm_exact_c': LJ['meta']['pm_exact_c']}},
        'cl': {'comps': cl, 'meta': {'games': K['meta']['games'], 'clutch_games': K['meta']['clutch_games'],
                                     'pts_match': K['meta']['pts_match']}},
        'lv': {'comps': lv},
        'wy': {'comps': sorted(wy, key=lambda c: (c['ser'], c['year']))},
    }
    json.dump(index, open(os.path.join(D, 'stats_index.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    print('stats: %d lineup files, %d clutch files, %d compare-lineup files (%d for WOWY), %.2f MB in stats/ | opens on %s'
          % (len(lu), len(cl), len(lv), len(wy), size / 1e6, lu[0]['label'] if lu else '-'))


if __name__ == '__main__':
    main()
