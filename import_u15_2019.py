#!/usr/bin/env python3
"""National U15 Championship 2019 (Lum Mun Chak Cup), boys and girls, 25 Nov - 1 Dec 2019.

The portal publishes every game of this championship under /match/<mid>/ but does not
list the competition itself (no competition id, no standings, leaders or player pages),
so it is built here from the 83 box scores and play-by-plays, the way the FIBA events are
(import_fibalive.py): into data/manual_comps.json, which a portal sync never overwrites.

Input: data/u15_2019_raw.json - {mid: {box: {hdr, dt, vtail, home, away}, pbp: [...]}}
       read in the browser from hosted.dcd.shared.geniussports.com/MABA/en/match/<mid>/
       {boxscore, playbyplay}, parsed exactly like autosync/source.py box() and pbp().
Writes: the two competitions into data/manual_comps.json, the play-by-play into
        data/pbp_raw/<mid>.json.

Players keep the source's own person id. 162 of the 360 already had a profile under that
same id; the other 198 are new. No merge is made: no new id has a 100% match elsewhere.
"""
import json, os, re, sys
from collections import defaultdict

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')
sys.path.insert(0, os.path.join(R, 'autosync'))
from sync import box_lines          # noqa: E402  (raises if a box does not add up)

RAW = json.load(open(os.path.join(D, 'u15_2019_raw.json')))

# Round of every game, from the organiser's fixture list (codes: BA = boys group A,
# BX/BY = boys quarter-final groups, B9-12 = boys classification 9-12, ...).
# The five links the list had broken (1457695/0..4) are 1457682/88/96, 1457704/12,
# identified by the teams and tip-off time on each game's own page.
ROUND = {
    '1457679': 'BA', '1457703': 'GA', '1457684': 'BB', '1457706': 'GB', '1457685': 'BB', '1457707': 'GB',
    '1457689': 'BC', '1457708': 'GC', '1457699': 'BD', '1457710': 'GC', '1457700': 'BD', '1457711': 'GD',
    '1457692': 'BC', '1457680': 'BA', '1457695': 'BC', '1457713': 'GC', '1457681': 'BA', '1457716': 'GC',
    '1457701': 'BD', '1457714': 'GD', '1457702': 'BD', '1457709': 'GB', '1457687': 'BB',
    '1457712': 'GB', '1457688': 'BB', '1457704': 'GA', '1457696': 'BC', '1457682': 'BA',
    '1457690': 'BD', '1457719': 'GC', '1457693': 'BD', '1457705': 'GA', '1457691': 'BB', '1457715': 'GB',
    '1457683': 'BA', '1457718': 'GB', '1457697': 'BC', '1457720': 'GC', '1457717': 'GD', '1457698': 'BC',
    '1457694': 'BB', '1457686': 'BA',
    '1457745': 'B13-16', '1457749': 'B13-16', '1457752': 'B9-12', '1457754': 'B9-12',
    '1457721': 'GX', '1457722': 'GY', '1457723': 'GX', '1457724': 'GY', '1457733': 'BX', '1457741': 'BY',
    '1457735': 'BX', '1457743': 'BY',
    '1457727': 'G9-12', '1457756': 'B15/16', '1457725': 'GX', '1457730': 'G9-12', '1457726': 'GY',
    '1457728': 'GX', '1457731': 'GY', '1457737': 'BX', '1457746': 'BY', '1457739': 'BX', '1457750': 'BY',
    '1457732': 'G13/14', '1457757': 'B13/14', '1457734': 'G11/12', '1457758': 'B11/12', '1457736': 'G9/10',
    '1457759': 'B9/10', '1457738': 'GSF', '1457740': 'GSF', '1457760': 'BSF', '1457761': 'BSF',
    '1457747': 'B7/8', '1457742': 'G7/8', '1457751': 'B5/6', '1457744': 'G5/6', '1457753': 'B3/4',
    '1457748': 'G3/4', '1457729': 'GFinal', '1457755': 'BFinal',
}
assert len(ROUND) == 83 and set(ROUND) == set(RAW), set(RAW) ^ set(ROUND)


def round_label(code):
    r = code[1:]
    if len(r) == 1 and r in 'ABCD':
        return 'Group ' + code
    if r in ('X', 'Y'):
        return 'Quarter-final group ' + code
    if r == 'SF':
        return 'Semi-final'
    if r == 'Final':
        return 'Final'
    if r == '3/4':
        return '3rd-place game'
    if r in ('9-12', '13-16'):
        return 'Classification %s, first round' % r.replace('-', '–')
    n = int(r.split('/')[0])                            # 5/6 -> the game for 5th place
    return '%d%s-place game' % (n, {1: 'st', 2: 'nd', 3: 'rd'}.get(n if n < 20 else n % 10, 'th'))


COMPS = {
    'B': ('lmc-u15-2019-boys', '28th MABA/MILO Lum Mun Chak Cup 15 & Below National Basketball Championship 2019 (Boys)', 'b'),
    'G': ('lmc-u15-2019-girls', '28th MABA/MILO Lum Mun Chak Cup 15 & Below National Basketball Championship 2019 (Girls)', 'g'),
}

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def parse_game(mid):
    b = RAW[mid]['box']
    m = re.match(r'(.*?) (\d+) Final .*?Period (.*?) (\d+) View', b['hdr'])
    home, hs, away, as_ = m.groups()
    vt = b['vtail'].strip()
    venue = vt.split(' %s %s AT ' % (away, as_))[0].strip()
    assert venue in ('MABA Stadium, Kuala Lumpur', 'MABA Training Court'), (mid, venue)
    return [mid, 'COMPLETE', b['dt'], venue, home, hs, away, as_]


def table(members, games, codes, went=()):
    """Group table from the games between its members (a quarter-final group carries
    over the first-round game its members already played). FIBA order: 2 points a win,
    1 a loss. Teams level on points are split first by who went through to the next
    round (the organisers' tie-break is not published, but the next round shows its
    outcome), then by the games between them (wins, then difference)."""
    rec = {t: dict(w=0, l=0, pf=0, pa=0) for t in members}
    inner = [g for g in games if g[4] in members and g[6] in members and ROUND[g[0]] in codes]
    for g in inner:
        for t, f, x in ((g[4], int(g[5]), int(g[7])), (g[6], int(g[7]), int(g[5]))):
            r = rec[t]; r['pf'] += f; r['pa'] += x
            r['w' if f > x else 'l'] += 1
    for r in rec.values():
        r['pts'] = 2 * r['w'] + r['l']

    def h2h(t, tied):
        w = d = 0
        for g in inner:
            if g[4] in tied and g[6] in tied and t in (g[4], g[6]):
                f, x = (int(g[5]), int(g[7])) if g[4] == t else (int(g[7]), int(g[5]))
                w += f > x; d += f - x
        return w, d
    order = sorted(members, key=lambda t: -rec[t]['pts'])
    out, i = [], 0
    while i < len(order):
        tied = [t for t in order if rec[t]['pts'] == rec[order[i]]['pts']]
        tied.sort(key=lambda t: (-went.get(t, 0),) + tuple(-v for v in h2h(t, set(tied))) + (-(rec[t]['pf'] - rec[t]['pa']),))
        out += tied; i += len(tied)
    rows = []
    for pos, t in enumerate(out, 1):
        r = rec[t]; gp = r['w'] + r['l']
        rows.append([str(pos), '', t, str(gp), str(r['w']), str(r['l']), str(r['pf']), str(r['pa']),
                     str(r['pf'] - r['pa']), str(round(100 * r['w'] / gp)) if gp else '0', str(r['pts'])])
    return rows, len(inner)


def winner(g):
    return (g[4], g[6]) if int(g[5]) > int(g[7]) else (g[6], g[4])


def leaders(lines):
    """Leader boards from the box scores, in the source's own category names."""
    T = defaultdict(lambda: defaultdict(float)); G = defaultdict(int)
    for ln in lines:
        if ln['min'] in ('', '0:00') or not ln['pid']:
            continue
        G[ln['pid']] += 1
        for k in ('pts', 'ast', 'stl', 'blk', 'tov', 'oreb', 'dreb'):
            T[ln['pid']][k] += float(ln[k] or 0)
        e = (float(ln['pts']) + float(ln['oreb']) + float(ln['dreb']) + float(ln['ast']) + float(ln['stl'])
             + float(ln['blk']) - (float(ln['fga']) - float(ln['fgm'])) - (float(ln['fta']) - float(ln['ftm']))
             - float(ln['tov']))
        T[ln['pid']]['eff'] += e
    for p in T:
        T[p]['reb'] = T[p]['oreb'] + T[p]['dreb']
    out = []
    for cat, k, avg in (('Efficiency', 'eff', 0), ('Points', 'pts', 0), ('Average points', 'pts', 1),
                        ('Assists', 'ast', 0), ('Average assists', 'ast', 1), ('Total rebounds', 'reb', 0),
                        ('Average total rebounds', 'reb', 1), ('Blocks', 'blk', 0), ('Average blocks', 'blk', 1),
                        ('Steals', 'stl', 0), ('Average steals', 'stl', 1)):
        val = {p: (T[p][k] / G[p] if avg else T[p][k]) for p in T if not avg or G[p] >= 3}
        top = sorted(val, key=lambda p: (-val[p], p))[:10]
        out.append([cat, [[p, '%.1f' % val[p] if (avg or k == 'eff') else '%d' % val[p]] for p in top]])
    return out


def build():
    M = json.load(open(os.path.join(D, 'manual_comps.json')))
    bb = json.load(open(os.path.join(D, 'backbone.json')))
    ids = {c[0] for c in COMPS.values()}
    M['comps'] = [c for c in M['comps'] if c['id'] not in ids]
    M['boxes'] = {k: v for k, v in M['boxes'].items() if k not in RAW}
    M['teamReg'] = {k: v for k, v in M['teamReg'].items() if not k.startswith('lmc19')}

    for sex, (cid, name, tag) in COMPS.items():
        mids = sorted((m for m in RAW if ROUND[m][0] == sex), key=lambda m: (parse_game(m)[2], m))
        games = [parse_game(m) for m in mids]
        # chronological, the way the source lists fixtures
        import datetime
        when = lambda g: datetime.datetime.strptime(g[2], '%b %d, %Y, %I:%M %p')
        games.sort(key=lambda g: (when(g), g[0]))
        lines_all, roster = [], defaultdict(dict)
        for g in games:
            rows = box_lines(RAW[g[0]]['box'], g)          # raises on any mismatch
            M['boxes'][g[0]] = {'p': rows}
            lines_all += rows
            for r in rows:
                roster[r['team']].setdefault(r['pid'], r['num'])
                if r['pid'] not in bb['personReg']:
                    M['personReg'].setdefault(r['pid'], r['name'])
        teams = sorted({g[4] for g in games} | {g[6] for g in games})
        tid = {t: 'lmc19%s-%s' % (tag, slug(t)) for t in teams}
        M['teamReg'].update({tid[t]: t for t in teams})

        by = {}
        for g in games:
            by.setdefault(ROUND[g[0]][1:], []).append(g)
        # tables: first-round groups, then the quarter-final groups
        groups = defaultdict(set)
        for g in games:
            code = ROUND[g[0]]
            if code[1:] in ('A', 'B', 'C', 'D', 'X', 'Y'):
                groups[code] |= {g[4], g[6]}
        stand, used = [], 0
        for code in sorted(groups, key=lambda c: (c[1] in 'XY', c)):
            phase = 'Quarter-final groups' if code[1] in 'XY' else 'First round'
            if code[1] in 'XY':      # semi-finalists, then the 5th-place game, then the 7th
                went = {t: 2 for g in by['SF'] for t in (g[4], g[6])}
                went.update({t: 1 for g in by['5/6'] for t in (g[4], g[6])})
            else:                    # the quarter-final groups
                went = {t: 1 for c2 in groups if c2[1] in 'XY' for t in groups[c2]}
            rows, n = table(groups[code], games, {code}, went)
            stand.append(['%s — Group %s' % (phase, code), ['Position', '', 'Team', 'GP', 'W', 'L', 'For', 'Agst', 'GD', '%won', 'Pts'], rows])

        # final placings from the knockout and classification games
        final = []
        def place(p, code, how_w, how_l):
            (g,) = by[code]
            w, l = winner(g)
            final.extend([[p, w, how_w], [p + 1, l, how_l]])
        place(1, 'Final', 'Won the final', 'Lost the final')
        place(3, '3/4', 'Won the 3rd-place game', 'Lost the 3rd-place game')
        place(5, '5/6', 'Won the 5th-place game', 'Lost the 5th-place game')
        place(7, '7/8', 'Won the 7th-place game', 'Lost the 7th-place game')
        place(9, '9/10', 'Won the 9th-place game', 'Lost the 9th-place game')
        place(11, '11/12', 'Won the 11th-place game', 'Lost the 11th-place game')
        place(13, '13/14', 'Won the 13th-place game', 'Lost the 13th-place game')
        if '15/16' in by:
            place(15, '15/16', 'Won the 15th-place game', 'Lost the 15th-place game')
        assert sorted(t for _, t, _ in final) == teams, (sorted(t for _, t, _ in final), teams)

        # the round goes in front of the venue, as the FIBA imports do
        rows = [[g[0], g[1], g[2], round_label(ROUND[g[0]]) + ' · ' + g[3], g[4], g[5], g[6], g[7], 1] for g in games]
        players = []
        for ln in lines_all:
            if ln['pid'] and ln['min'] not in ('', '0:00') and ln['pid'] not in players:
                players.append(ln['pid'])
        M['comps'].append({
            'id': cid, 'name': name, 'teams': [tid[t] for t in teams], 'stand': stand, 'games': rows,
            'lead': leaders(lines_all), 'players': players,
            'roster': [[tid[t], [[p, n, '', '', '', '', '', ''] for p, n in sorted(roster[t].items(), key=lambda x: (len(x[1]), x[1]))]]
                       for t in teams],
            'final': final,
            'standNote': ("The source never published this championship's own pages (no standings, leaders or "
                          "player statistics), only each game, so every table here is built from the results: "
                          "2 points a win, 1 a loss. The organisers' tie-break is not published, so teams level on "
                          "points are ordered by who went through to the next round, then by the games between them. "
                          "The quarter-final groups count only their own games. Final standings come from the "
                          "semi-finals, the final and the placing games."
                          + (" In Group BB, Labuan went through to the quarter-finals ahead of Kedah, who finished "
                             "2–1 to Labuan's 1–2: the organisers' decision, which the results do not explain."
                             if sex == 'B' else '')),
        })
        print('%s: %d games, %d teams, %d players, %d groups, champion %s'
              % (cid, len(rows), len(teams), len(players), len(stand), final[0][1]))

    json.dump(M, open(os.path.join(D, 'manual_comps.json'), 'w'), ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(D, 'pbp_raw'), exist_ok=True)
    for mid, v in RAW.items():
        b = parse_game(mid)
        ev = v['pbp']
        assert ev and any(e[3] == b[5] + '-' + b[7] for e in ev), mid   # reaches the final score
        json.dump(ev, open(os.path.join(D, 'pbp_raw', mid + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('play-by-play: %d games' % len(RAW))


if __name__ == '__main__':
    build()
