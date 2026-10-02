#!/usr/bin/env python3
"""Compact per-competition play-by-play files for lazy loading.

Full play-by-play for every game is ~100 MB raw — too big to inline in the page
and over the artifact's 64 MB/version cap even split. So each completed game is
scraped once into data/pbp_raw/<mid>.json (the verbose 9-field event array the
browser extractor returns), and this step packs every game of a competition into
one compact file, pbp/<cid>.js, that the page pulls in on demand.

Compaction, per competition:
  - P: unique [num, name] player pairs -> events reference an index
  - A: unique action strings           -> events reference an index
  - events drop the redundant type flag and the scoring flag (a score change IS
    the scoring flag), and the clock loses its :00 hundredths
Each event becomes [periodInt, team(0/1/2), "MM:SS", playerIdx(-1 if none),
actionIdx, "h-a" score or ""]. That is ~3-4x smaller than the raw form.

The file calls pbpReg("<cid>", {...}); the loader in app4j_match.js injects it as
a <script> and re-renders when it arrives. data/pbp_games.json lists every mid
that now has play-by-play, and is folded into the payload so the UI knows which
games to offer it for and which competition file to load.
"""
import json, os, glob

R = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(R, 'data', 'pbp_raw')
OUT = os.path.join(R, 'pbp')
D = os.path.join(R, 'data')


def short_clk(c):
    if not c:
        return ''
    p = str(c).split(':')
    return p[0] + ':' + p[1] if len(p) >= 2 else c


def clk_secs(c):
    """Clock as seconds remaining in the period (higher = earlier), or None."""
    if not c:
        return None
    p = str(c).split(':')
    try:
        return int(p[0]) * 60 + int(p[1])
    except (ValueError, IndexError):
        return None


def chron(ev):
    """Put a game's events in true chronological order.

    The source DOM is *mostly* chronological but occasionally emits an amended
    event out of place (a late correction, a stray row after "Game end"). A stable
    sort by (period, clock-descending) fixes it without disturbing correctly
    ordered games. Neutral rows (no clock — game/period start & end) inherit the
    clock of the row before them so they stay beside their context; the opening
    row starts the period at its top."""
    out = []
    last = 9999
    prev_per = None
    for i, e in enumerate(ev):
        # a new period starts at its top: a clockless "Period start" row must not
        # inherit the previous period's final seconds, or it sorts to the bottom
        if e[0] != prev_per:
            last, prev_per = 9999, e[0]
        s = clk_secs(e[2])
        if s is None:
            s = last
        else:
            last = s
        try:
            per = int(e[0])
        except (ValueError, TypeError):
            per = 99          # overtime labelled non-numerically sorts last
        out.append((per, -s, i, e))
    out.sort(key=lambda x: (x[0], x[1], x[2]))
    return [x[3] for x in out]


def main():
    os.makedirs(OUT, exist_ok=True)
    site = json.load(open(os.path.join(D, 'site_data.json')))
    # Which competition a game belongs to comes from the fixture lists themselves.
    # The old static data/mid2cid.json was written once and silently dropped any
    # fixture added after it (SBL U20's 27 Sep 2026 playoff); it is only a fallback.
    mid2cid = {}
    mp = os.path.join(D, 'mid2cid.json')
    if os.path.exists(mp):
        mid2cid.update(json.load(open(mp)))
    game = {}
    for c in site['comps']:
        for g in c['games']:
            game[g['mid']] = g
            mid2cid[g['mid']] = c['id']

    by_comp = {}
    for f in glob.glob(os.path.join(RAW, '*.json')):
        mid = os.path.splitext(os.path.basename(f))[0]
        cid = mid2cid.get(mid)
        if not cid:
            print('!! no competition for mid', mid); continue
        by_comp.setdefault(cid, {})[mid] = json.load(open(f))

    covered = []
    periods = {}   # mid -> [[home,away] per period] — tiny, kept in the payload
    for cid, games in sorted(by_comp.items()):
        P, Pidx, A, Aidx, G = [], {}, [], {}, {}
        for mid, ev in games.items():
            ev = chron(ev)
            out = []
            last_sc = {}
            for e in ev:
                per, team, clk, sc, num, name, act = e[0], e[1], e[2], e[3], e[4], e[5], e[6]
                if sc:
                    last_sc[str(per)] = sc
                if name:
                    key = num + '\t' + name
                    if key not in Pidx:
                        Pidx[key] = len(P); P.append([num, name])
                    pi = Pidx[key]
                else:
                    pi = -1
                if act not in Aidx:
                    Aidx[act] = len(A); A.append(act)
                out.append([int(per) if str(per).isdigit() else per, team, short_clk(clk), pi, Aidx[act], sc or ''])
            g = game.get(mid, {})
            G[mid] = {'h': g.get('h', ''), 'a': g.get('a', ''), 'e': out}
            covered.append(mid)
            ph = pa = 0; prow = []
            for p in sorted(last_sc, key=lambda x: int(x) if x.isdigit() else 99):
                h, a = (int(v) for v in last_sc[p].split('-'))
                prow.append([h - ph, a - pa]); ph, pa = h, a
            if prow:
                periods[mid] = prow
        payload = json.dumps({'P': P, 'A': A, 'G': G}, separators=(',', ':'))
        with open(os.path.join(OUT, cid + '.js'), 'w') as fh:
            fh.write('pbpReg(' + json.dumps(cid) + ',' + payload + ')\n')
        kb = os.path.getsize(os.path.join(OUT, cid + '.js')) / 1024
        print('pbp/%s.js  %d game(s), %d players, %d actions  %.1f KB' % (cid, len(games), len(P), len(A), kb))

    json.dump(sorted(covered), open(os.path.join(D, 'pbp_games.json'), 'w'), separators=(',', ':'))
    json.dump(periods, open(os.path.join(D, 'pbp_periods.json'), 'w'), separators=(',', ':'))
    print('\n%d game(s) covered across %d competition file(s)' % (len(covered), len(by_comp)))


if __name__ == '__main__':
    main()
