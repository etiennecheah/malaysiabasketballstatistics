#!/usr/bin/env python3
"""Collapse duplicate person records before anything is aggregated.

The source mints a person id per registration, so one player can hold several —
a name typed surname-first one year and given-name-first the next, a misspelling,
an English forename added, a `Bin` inserted. Left alone each id becomes its own
profile with its own career, which is exactly the thing this site exists not to do.

`data/merges.json` lists the groups a human has checked. Applying them here, on
the raw scrape, means every consumer downstream — career totals, the tier split,
the box scores, BPM — sees one player without knowing a merge happened.

A group is only safe when its members' competitions are disjoint: two records for
the same player in one competition would have to have their stat lines summed and
their rates recomputed, and nothing here does that. So a collision raises instead
of silently double-counting or dropping a line.
"""
import json
import os

# canonical ids whose group was confirmed although two of its records sit in one
# competition (the source registered the same player twice for one event): there
# the two stat lines are dropped and build_data rebuilds one from the box scores
REBUILD = set()


def load(d):
    """-> (alias pid -> canonical pid, canonical pid -> display name override)."""
    path = os.path.join(d, 'merges.json')
    if not os.path.exists(path):
        return {}, {}
    doc = json.load(open(path))
    pidmap, names = {}, {}
    for g in doc.get('groups', []):
        canon = g['canonical']
        if canon in pidmap:
            raise AssertionError('%s is canonical in one group and an alias in another' % canon)
        for a in g['aliases']:
            if a == canon:
                raise AssertionError('%s lists itself as an alias' % canon)
            if a in pidmap:
                raise AssertionError('%s is an alias in two groups' % a)
            pidmap[a] = canon
        if g.get('name'):
            names[canon] = g['name']
        if g.get('rebuild'):
            REBUILD.add(canon)
    # an alias must not itself be someone else's canonical
    for a, c in pidmap.items():
        if a in {v for v in pidmap.values()}:
            raise AssertionError('%s is both an alias and a canonical id' % a)
    return pidmap, names


def apply(bb, persons, boxes, pidmap, names):
    """Rewrite backbone, stat lines and box scores in place. Returns a report dict."""
    if not pidmap:
        return {'groups': 0, 'records': 0, 'lines': 0, 'box_lines': 0, 'roster_rows': 0}
    m = lambda p: pidmap.get(p, p)

    reg = bb['personReg']
    for a, c in pidmap.items():
        reg.pop(a, None)
        if c not in reg:
            raise AssertionError('canonical id %s is not in the person registry' % c)
    for c, nm in names.items():
        reg[c] = nm

    lines = rows = 0
    for comp in bb['comps']:
        seen = set()
        players = []
        for p in comp['players']:
            q = m(p)
            if q in seen:
                if q in REBUILD:
                    lines += 1
                    continue
                raise AssertionError('merge collides in competition %s: two records for %s'
                                     % (comp['id'], q))
            seen.add(q)
            players.append(q)
            lines += p != q
        comp['players'] = players

        roster = []
        for tid, rs in comp['roster']:
            byp, out = {}, []
            for r in rs:
                q = m(r[0])
                rows += r[0] != q
                r = [q] + list(r[1:])
                if q in byp:
                    # keep whichever registration carried the fuller bio
                    old = byp[q]
                    if sum(1 for x in r if x) > sum(1 for x in old if x):
                        out[out.index(old)] = r
                        byp[q] = r
                    continue
                byp[q] = r
                out.append(r)
            roster.append([tid, out])
        comp['roster'] = roster

        # the competition's own leaders boards name players by person id too
        for cat in comp.get('lead') or []:
            cat[1] = [[m(r[0])] + list(r[1:]) for r in cat[1]]

    for k in [k for k in persons if k.split(':', 1)[1] in pidmap]:
        cid, pid = k.split(':', 1)
        nk = cid + ':' + m(pid)
        if nk in persons:
            if m(pid) in REBUILD:
                # one player, two lines in one competition: neither is the whole season
                persons.pop(k); persons.pop(nk)
                continue
            raise AssertionError('merge collides on stat line %s' % nk)
        persons[nk] = persons.pop(k)

    played = lambda ln: str(ln.get('min') or '') not in ('', '0:00', '00:00')
    box = 0
    for mid, b in boxes.items():
        seen = {}
        keep = []
        for line in b.get('p', []):
            p = line.get('pid')
            if not p:
                keep.append(line)
                continue
            q = m(p)
            if q != p:
                line['pid'] = q
                box += 1
            key = (q, line.get('team'))
            if key in seen:
                # a player registered twice for one event is listed twice in its box scores;
                # for a confirmed "rebuild" group the line where he did not play is dropped
                old = seen[key]
                if q in REBUILD and not (played(old) and played(line)):
                    if played(line):
                        keep[keep.index(old)] = line
                        seen[key] = line
                    continue
                raise AssertionError('merge collides in game %s: two lines for %s' % (mid, q))
            seen[key] = line
            keep.append(line)
        if len(keep) != len(b.get('p', [])):
            b['p'] = keep

    return {'groups': len(set(pidmap.values())), 'records': len(pidmap),
            'lines': lines, 'box_lines': box, 'roster_rows': rows}
