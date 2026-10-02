#!/usr/bin/env python3
"""The Stats pages (Lineups and Clutch): one small data file per competition.

Runs the two calculations, then cuts their output into files the page pulls in
on demand, the same way it pulls in play-by-play:

  build_lineup_stats.py  -> data/lineup_stats.json  -> stats/lu/<cid>.js
  build_clutch.py        -> data/clutch.json        -> stats/cl/<cid>.js
  data/stats_index.json  the list of competitions each page offers, with the
                         checks shown in the glossary; build_site.py embeds it

A file is one call: STATS_PUT('lu' | 'cl', '<cid>', {...}).

Run: python3 build_stats.py     (after build_pbp.py, before build_site.py)
"""
import json, os, re, shutil

import build_lineup_stats, build_clutch

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')
OUT = os.path.join(R, 'stats')


def code(name):
    """A short code for a team that has none in the standings: initials, or the first three letters."""
    parts = [p for p in re.split(r'[^A-Za-z0-9]+', name) if p]
    if not parts:
        return '?'
    return (parts[0][:3] if len(parts) == 1 else ''.join(p[0] for p in parts)[:3]).upper()


def put(kind, cid, obj):
    p = os.path.join(OUT, kind, cid + '.js')
    with open(p, 'w', encoding='utf-8') as f:
        f.write("STATS_PUT('%s','%s',%s);\n" % (kind, cid, json.dumps(obj, separators=(',', ':'), ensure_ascii=False)))
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

    index = {
        'lu': {'comps': lu, 'meta': {'games': L['meta']['games'], 'lineups': sum(c['fives'] for c in lu),
                                     'pts_exact': L['meta']['pts_exact'], 'all_exact': L['meta']['all_exact'],
                                     'pm_exact_c': LJ['meta']['pm_exact_c']}},
        'cl': {'comps': cl, 'meta': {'games': K['meta']['games'], 'clutch_games': K['meta']['clutch_games'],
                                     'pts_match': K['meta']['pts_match']}},
    }
    json.dump(index, open(os.path.join(D, 'stats_index.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
    print('stats: %d lineup files, %d clutch files, %.2f MB in stats/ | opens on %s'
          % (len(lu), len(cl), size / 1e6, lu[0]['label'] if lu else '-'))


if __name__ == '__main__':
    main()
