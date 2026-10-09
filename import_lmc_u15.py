#!/usr/bin/env python3
"""Lum Mun Chak Cup (National U15) editions the MABA portal publishes game by game only.

The portal shows every game of these championships under /match/<mid>/ but does not list
the competitions themselves (no competition id, no standings, leaders or player pages), so
they are built here from the box scores and play-by-plays, the way the FIBA events are
(import_fibalive.py): into data/manual_comps.json, which a portal sync never overwrites.

  2019  28th MABA/MILO Lum Mun Chak Cup, 25 Nov - 1 Dec 2019, 83 games  (data/u15_2019_raw.json)
  2018  27th MABA/MILO Lum Mun Chak Cup, 28 Nov - 4 Dec 2018, 68 games  (data/u15_2018_raw.json)

Raw files: {mid: {box: {hdr, dt, vtail, home, away}, pbp: [...]}} read in the browser from
hosted.dcd.shared.geniussports.com/MABA/en/match/<mid>/{boxscore,playbyplay} and parsed exactly
like autosync/source.py box() and pbp(). Writes both boys' and girls' competitions of every
edition into data/manual_comps.json and the play-by-play into data/pbp_raw/<mid>.json.

Players keep the source's own person id; a player who already had a profile under that id
joins it. No merge is made here - see claude/u15-2019-import.md.

Usage: python3 import_lmc_u15.py            (every edition)
       python3 import_lmc_u15.py 2018       (one edition)
"""
import datetime, json, os, re, sys
from collections import defaultdict

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')
sys.path.insert(0, os.path.join(R, 'autosync'))
from sync import box_lines          # noqa: E402  (raises if a box does not add up)

NOTE = ("The source never published this championship's own pages (no standings, leaders or "
        "player statistics), only each game, so every table here is built from the results: "
        "2 points a win, 1 a loss. The organisers' tie-break is not published, so teams level on "
        "points are ordered by who went through to the next round, then by the games between them. "
        "The quarter-final groups count only their own games. Final standings come from the "
        "semi-finals, the final and the placing games.")

# Round of every game, from the organiser's fixture list. Codes: BA = boys group A, BX/BY =
# boys quarter-final groups, B9-12 = boys classification 9-12 first round, B9/10 = the game
# for 9th place, BSF = semi-final, ...
EDITIONS = {
    '2019': {
        'raw': 'u15_2019_raw.json', 'tag': 'lmc19',
        'comps': {
            'B': ('lmc-u15-2019-boys', '28th MABA/MILO Lum Mun Chak Cup 15 & Below National Basketball Championship 2019 (Boys)'),
            'G': ('lmc-u15-2019-girls', '28th MABA/MILO Lum Mun Chak Cup 15 & Below National Basketball Championship 2019 (Girls)'),
        },
        # The five links the user's list had broken (1457695/0..4) are 1457682/88/96, 1457704/12,
        # identified by the teams and tip-off time on each game's own page.
        'round': {
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
    },
        # (game, place of its winner, place of its loser)
        'places': [('Final', 1, 2), ('3/4', 3, 4), ('5/6', 5, 6), ('7/8', 7, 8), ('9/10', 9, 10),
                   ('11/12', 11, 12), ('13/14', 13, 14), ('15/16', 15, 16)],
        'notes': {'B': " In Group BB, Labuan went through to the quarter-finals ahead of Kedah, who finished "
                       "2–1 to Labuan's 1–2: the organisers' decision, which the results do not explain."},
    },
    '2018': {
        'raw': 'u15_2018_raw.json', 'tag': 'lmc18',
        'comps': {
            'B': ('lmc-u15-2018-boys', '27th MABA/MILO Lum Mun Chak Cup 15 & Below National Basketball Championship 2018 (Boys)'),
            'G': ('lmc-u15-2018-girls', '27th MABA/MILO Lum Mun Chak Cup 15 & Below National Basketball Championship 2018 (Girls)'),
        },
        'round': {
        '1058277': 'GC', '1058265': 'GB', '1058266': 'GB', '1058271': 'GA', '1058276': 'GD', '1058259': 'BC',
        '1058250': 'BA', '1058256': 'BB', '1058251': 'BA', '1058262': 'BD', '1058272': 'GA', '1058275': 'GD',
        '1058278': 'GC', '1058267': 'GB', '1058268': 'GB', '1058263': 'BD', '1058257': 'BB', '1058260': 'BC',
        '1058252': 'BA', '1058253': 'BA', '1058274': 'GD', '1058269': 'GB', '1058270': 'GB', '1058279': 'GC',
        '1058273': 'GA', '1058254': 'BA', '1058255': 'BA', '1058258': 'BB', '1058264': 'BD', '1058261': 'BC',
        '1061640': 'G9-12', '1061641': 'G9-12', '1061648': 'B9-12', '1061649': 'B9-12', '1061660': 'GX', '1061664': 'GY',
        '1061661': 'GX', '1061665': 'GY', '1061644': 'BX', '1061629': 'BY', '1061645': 'BX', '1061630': 'BY',
        '1061650': 'B11/12', '1061669': 'G11/12', '1061666': 'GY', '1061662': 'GX', '1061667': 'GY', '1061663': 'GX',
        '1061631': 'BY', '1061646': 'BX', '1061632': 'BY', '1061647': 'BX', '1061651': 'B12/13', '1061668': 'G12/13',
        '1061652': 'B9/10', '1061671': 'G9/10', '1061670': 'G7/8', '1061653': 'B7/8', '1061672': 'GSF', '1061673': 'GSF',
        '1061654': 'BSF', '1061655': 'BSF', '1061674': 'G5/6', '1061656': 'B5/6', '1061675': 'G3/4', '1061657': 'B3/4',
        '1061676': 'GFinal', '1061658': 'BFinal',
    },
        # 13 teams: the loser of the 11th-place game plays the 13th team for 12th
        'places': [('Final', 1, 2), ('3/4', 3, 4), ('5/6', 5, 6), ('7/8', 7, 8), ('9/10', 9, 10),
                   ('11/12', 11, None), ('12/13', 12, 13)],
        'notes': {},
    },
}

# the 2018 source writes the state the old way; the site's Johor flag and team page use 'Johor'
SPELL = {'Johore': 'Johor'}

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
ORD = lambda n: '%d%s' % (n, {1: 'st', 2: 'nd', 3: 'rd'}.get(n if n < 20 else n % 10, 'th'))


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
    if '-' in r:
        return 'Classification %s, first round' % r.replace('-', '–')
    return '%s-place game' % ORD(int(r.split('/')[0]))      # 5/6 -> the game for 5th place


def parse_game(raw, mid):
    b = raw[mid]['box']
    m = re.match(r'(.*?) (\d+) Final .*?Period (.*?) (\d+) View', b['hdr'])
    home, hs, away, as_ = m.groups()
    vt = b['vtail'].strip()
    venue = vt.split(' %s %s AT ' % (away, as_))[0].strip()
    assert venue and ' AT ' not in venue, (mid, venue)
    return [mid, 'COMPLETE', b['dt'], venue, SPELL.get(home, home), hs, SPELL.get(away, away), as_]


def table(members, games, rnd, code, went):
    """Group table from the group's own games. FIBA order: 2 points a win, 1 a loss. Teams
    level on points are split first by who went through to the next round (the organisers'
    tie-break is not published, but the next round shows its outcome), then by the games
    between them (wins, then difference), then overall difference."""
    rec = {t: dict(w=0, l=0, pf=0, pa=0) for t in members}
    inner = [g for g in games if g[4] in members and g[6] in members and rnd[g[0]] == code]
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
    return rows


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


def build_edition(M, bb, ed):
    E = EDITIONS[ed]
    raw = json.load(open(os.path.join(D, E['raw'])))
    rnd = E['round']
    assert set(rnd) == set(raw), set(raw) ^ set(rnd)
    ids = {c[0] for c in E['comps'].values()}
    M['comps'] = [c for c in M['comps'] if c['id'] not in ids]
    M['boxes'] = {k: v for k, v in M['boxes'].items() if k not in raw}
    M['teamReg'] = {k: v for k, v in M['teamReg'].items() if not k.startswith(E['tag'])}

    for sex, (cid, name) in E['comps'].items():
        when = lambda g: datetime.datetime.strptime(g[2], '%b %d, %Y, %I:%M %p')
        games = sorted((parse_game(raw, m) for m in raw if rnd[m][0] == sex), key=lambda g: (when(g), g[0]))
        lines_all, roster = [], defaultdict(dict)
        for g in games:
            rows = box_lines(raw[g[0]]['box'], g)          # raises on any mismatch
            M['boxes'][g[0]] = {'p': rows}
            lines_all += rows
            for r in rows:
                roster[r['team']].setdefault(r['pid'], r['num'])
                if r['pid'] not in bb['personReg']:
                    M['personReg'].setdefault(r['pid'], r['name'])
        teams = sorted({g[4] for g in games} | {g[6] for g in games})
        tid = {t: '%s%s-%s' % (E['tag'], sex.lower(), slug(t)) for t in teams}
        M['teamReg'].update({tid[t]: t for t in teams})

        by = {}
        for g in games:
            by.setdefault(rnd[g[0]][1:], []).append(g)
        # tables: first-round groups, then the quarter-final groups
        groups = defaultdict(set)
        for g in games:
            code = rnd[g[0]]
            if code[1:] in ('A', 'B', 'C', 'D', 'X', 'Y'):
                groups[code] |= {g[4], g[6]}
        stand = []
        for code in sorted(groups, key=lambda c: (c[1] in 'XY', c)):
            if code[1] in 'XY':      # semi-finalists, then the 5th-place game, then the 7th
                phase = 'Quarter-final groups'
                went = {t: 2 for g in by['SF'] for t in (g[4], g[6])}
                went.update({t: 1 for g in by['5/6'] for t in (g[4], g[6])})
            else:                    # went through to the quarter-final groups
                phase = 'First round'
                went = {t: 1 for c2 in groups if c2[1] in 'XY' for t in groups[c2]}
            stand.append(['%s — Group %s' % (phase, code),
                          ['Position', '', 'Team', 'GP', 'W', 'L', 'For', 'Agst', 'GD', '%won', 'Pts'],
                          table(groups[code], games, rnd, code, went)])

        # final placings from the final, the 3rd-place game and the placing games
        final = []
        for code, pw, pl in E['places']:
            if code not in by:
                continue
            (g,) = by[code]
            w, l = winner(g)
            what = 'final' if code == 'Final' else '%s-place game' % ORD(int(code.split('/')[0]))
            final.append([pw, w, 'Won the ' + what])
            if pl:
                final.append([pl, l, 'Lost the ' + what])
        final.sort()
        assert [p for p, _, _ in final] == list(range(1, len(teams) + 1)), final
        assert sorted(t for _, t, _ in final) == teams, (sorted(t for _, t, _ in final), teams)

        # the round goes in front of the venue, as the FIBA imports do
        rows = [[g[0], g[1], g[2], round_label(rnd[g[0]]) + ' · ' + g[3], g[4], g[5], g[6], g[7], 1] for g in games]
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
            'standNote': NOTE + E['notes'].get(sex, ''),
        })
        print('%s: %d games, %d teams, %d players, %d groups, champion %s'
              % (cid, len(rows), len(teams), len(players), len(stand), final[0][1]))

    os.makedirs(os.path.join(D, 'pbp_raw'), exist_ok=True)
    for mid, v in raw.items():
        b = parse_game(raw, mid)
        ev = v['pbp']
        assert ev and any(e[3] == b[5] + '-' + b[7] for e in ev), mid   # reaches the final score
        json.dump(ev, open(os.path.join(D, 'pbp_raw', mid + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('%s play-by-play: %d games' % (ed, len(raw)))


def build(eds):
    M = json.load(open(os.path.join(D, 'manual_comps.json')))
    bb = json.load(open(os.path.join(D, 'backbone.json')))
    for ed in eds:
        build_edition(M, bb, ed)
    json.dump(M, open(os.path.join(D, 'manual_comps.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    build(sys.argv[1:] or sorted(EDITIONS))
