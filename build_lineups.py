#!/usr/bin/env python3
"""Who was on the floor: lineups rebuilt from the play-by-play, on/off ratings,
and each game's average lead (which feeds BPM's lead adjustment).

The feed logs every substitution, so the five on court can be followed through a
game. Three things make that less simple than it sounds, each handled below:

  * A period's starters are never announced. A player is a starter when his first
    event of the period is anything but "Substitution in".
  * A starter who does nothing before being subbed out still shows up (his sub-out
    is an event), but one who plays the WHOLE period without touching the ball, a
    rebound or a foul never appears at all. When a side is short of five, the gap
    is filled from the box score: the player on that team who was not seen in the
    period and whose published minutes the rebuild leaves most unaccounted for.
  * Several events share one clock reading (a foul, two free throws and a
    substitution all at 04:12). Scoring at a clock reading is credited to the five
    on court BEFORE that reading's substitutions — the order the source's own
    plus/minus uses (tested both ways against every box score line; see RULE).

Every game is checked against its box score: each player's rebuilt minutes and
plus/minus against the published ones. A game whose lineups cannot be made to
hold exactly five a side in every period is left out of on/off (it still counts
for the average lead, which needs only the score).

Output: data/lineups.json — {meta, lead:{mid: avg lead, home view}, onoff:{cid:{pid:[...]}}}
and data/stints.json (every stint of every game, for later lineup work).
"""
import json, os, glob, collections, math, sys
import numpy as np

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')
sys.path.insert(0, R)
from build_pbp import chron                     # the same chronological repair the page uses
from build_bpm import mins                      # box-score minutes parser

BENCH_ONLY = {'Technical foul', 'Bench technical', 'Coach technical', 'Coach disqualifying'}
RULE = 'as-logged'   # scoring at a clock reading goes to the lineup before that reading's subs
BOOT = 600
MIN_ON_SEC = 60 * 30   # on/off is published for 30+ minutes on court in a competition


def secs(c):
    p = str(c).split(':')
    return int(p[0]) * 60 + int(p[1])


def norm(n):
    return ' '.join(sorted(''.join(ch if ch.isalnum() else ' ' for ch in str(n).lower()).split()))


def classify(a):
    """(fga, fta, oreb, tov) contribution of one event — the inputs to the standard
    possession estimate, counted inside each stint."""
    if a.startswith('2pt') or a.startswith('3pt') or a == 'made':
        return 1, 0, 0, 0
    if a.startswith('Free throw'):
        return 0, 1, 0, 0
    if a == 'Offensive rebound':
        return 0, 0, 1, 0
    if a.startswith('Turnover'):
        return 0, 0, 0, 1
    return 0, 0, 0, 0


# Box-score counters kept per stint and side, for the lineup tables
# (build_lineup_stats.py). Rebounds and turnovers with no player named are the
# team's (ball out of bounds, shot clock): they are kept apart, because a box
# score's player lines do not carry them but a possession count needs them.
BX = ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'tov', 'stl', 'blk', 'pf', 'pfd',
      'toreb', 'tdreb', 'ttov']
BXI = {k: i for i, k in enumerate(BX)}
FOULS = {'Personal foul', 'Offensive foul', 'Unsportsmanlike foul', 'Technical foul', 'Disqualifying foul'}


def box_counts(e):
    """The box-score counters one feed event adds for its own team."""
    a = ' '.join(str(e[6]).split())
    who = bool(e[5])
    made = a.endswith('made')
    if not a:
        # A row with a player and no text is a shot the feed could not describe (a
        # tip-in, almost always missed). Counting it takes field-goal attempts from
        # 56% to 99.9% of team-games agreeing exactly with the box score. A blank
        # row with no player is a dead-ball team rebound between free throws.
        kind = e[7] if len(e) > 7 else '2pt'
        if not who or kind not in ('2pt', '3pt'):
            return []
        hit = len(e) > 8 and e[8] == 1
        return ['fga'] + (['fgm'] if hit else []) + ((['tpa'] + (['tpm'] if hit else [])) if kind == '3pt' else [])
    if a.startswith('2pt') or a.startswith('3pt') or a == 'made':
        three = a.startswith('3pt') or (a == 'made' and len(e) > 7 and e[7] == '3pt')
        out = ['fga'] + (['fgm'] if made else [])
        if three:
            out += ['tpa'] + (['tpm'] if made else [])
        return out
    if a.startswith('Free throw'):
        return ['fta'] + (['ftm'] if made else [])
    if a == 'Offensive rebound':
        return ['oreb' if who else 'toreb']
    if a == 'Defensive rebound':
        return ['dreb' if who else 'tdreb']
    if a == 'Assist':
        return ['ast']
    if a.startswith('Turnover'):
        return ['tov' if who else 'ttov']
    if a == 'Steal':
        return ['stl']
    if a == 'Block':
        return ['blk']
    if a in FOULS:
        return ['pf']
    if a == 'Foul on':
        return ['pfd']
    return []


def per_len(p, E):
    try:
        if int(p) >= 5:
            return 300
    except ValueError:
        return 300
    mx = max([secs(e[2]) for e in E if e[2]] or [0])
    return 720 if mx > 600 else 600


def rebuild(ev, sides, rule=RULE, fill=None, log=None):
    """One game. sides[t] = {'num': {num: pid}, 'name': {norm: pid}} for t in 1, 2.
    Returns (stints, seconds per key, +/- per key, avg lead home, bad periods, seen).

    log, when a list is passed, receives the game as a timeline (build_clutch.py):
      ('T', period, from, to, home score, away score, home five, away five)   clock running
      ('E', period, clock, home score, away score, home five, away five,
            side, player key or None, box counters, points scored, action)     one event
    Clock values are seconds left in the period. An event carries the score as it
    stood when its clock reading began, so a basket and the assist logged after it
    share one score."""
    def key(t, num, name):
        # the name is the safer match (a jersey can differ between the feed and the
        # box score); the number breaks ties and covers spelling differences. The
        # feed writes jersey 0 as an empty number.
        pid = sides[t]['name'].get(norm(name)) if name else None
        if not pid:
            pid = sides[t]['num'].get(str(num) if num not in (None, '') else '0')
        return pid or ('?', t, num, name)

    ev = chron(ev)
    pers = collections.OrderedDict()
    for e in ev:
        pers.setdefault(str(e[0]), []).append(e)

    stints, sec, pm = [], collections.Counter(), collections.Counter()
    seen = {}
    bad = []
    sh = sa = 0
    lead_int = total = 0.0
    for p, E in pers.items():
        plen = per_len(p, E)
        first = collections.OrderedDict()
        seen[p] = set()
        for e in E:
            if e[1] in (1, 2) and e[5] and e[6] not in BENCH_ONLY:
                k = (e[1], key(e[1], e[4], e[5]))
                seen[p].add(k)
                first.setdefault(k, e[6])
        on = {1: set(), 2: set()}
        for (t, k), a in first.items():
            if a != 'Substitution in':
                on[t].add(k)
        if fill:
            for t in (1, 2):
                on[t] |= set(fill.get((p, t), ()))
        if len(on[1]) != 5 or len(on[2]) != 5:
            bad.append((p, len(on[1]), len(on[2])))

        # walk the period in clock groups. Rows with no clock ("Period start",
        # "Period end", "Game end") stay where the feed puts them: each run of them
        # is its own group. Filed under one shared key they all landed at the first
        # clockless row, so "Period end" - which carries the period's final score -
        # was read at the START of the period: the five on court then were credited
        # the whole period's scoring, and the first basket took it back from whoever
        # was on court by then (785 stints came out with negative points).
        groups = collections.OrderedDict()
        run, prev_clockless = 0, False
        for e in E:
            if e[2]:
                groups.setdefault(e[2], []).append(e)
                prev_clockless = False
            else:
                if not prev_clockless:
                    run += 1
                groups.setdefault(('no clock', run), []).append(e)
                prev_clockless = True
        last = plen
        cur = None

        def open_stint():
            return {'p': p, 's': 0, 'h': tuple(sorted(map(str, on[1]))), 'a': tuple(sorted(map(str, on[2]))),
                    'pts': [0, 0], 'fga': [0, 0], 'fta': [0, 0], 'oreb': [0, 0], 'tov': [0, 0],
                    'bx': [[0] * len(BX), [0] * len(BX)],
                    'on1': frozenset(on[1]), 'on2': frozenset(on[2])}
        cur = open_stint()
        for clk, G in groups.items():
            t_now = secs(clk) if isinstance(clk, str) else last
            if t_now <= last:
                d = last - t_now
                cur['s'] += d
                for s in (1, 2):
                    for k in on[s]:
                        sec[k] += d
                lead_int += (sh - sa) * d
                total += d
                if log is not None and d:
                    log.append(('T', p, last, t_now, sh, sa, frozenset(on[1]), frozenset(on[2])))
                last = t_now
            gsh, gsa = sh, sa
            subs = [e for e in G if e[6] in ('Substitution in', 'Substitution out')]
            rest = [e for e in G if e not in subs]
            order = rest + subs if rule == 'subs-last' else subs + rest if rule == 'subs-first' else G
            for e in order:
                a = e[6]
                if a in ('Substitution in', 'Substitution out') and e[1] in (1, 2):
                    k = key(e[1], e[4], e[5])
                    if cur['s'] or any(cur['pts']) or any(cur['fga']):
                        stints.append(cur)
                    elif any(cur['bx'][0]) or any(cur['bx'][1]):
                        # a zero-second stint that still holds a rebound, a foul or a
                        # missed free throw: on/off has always left these out, so they
                        # are flagged and kept only for the lineup tables
                        cur['z'] = True
                        stints.append(cur)
                    (on[e[1]].discard if a == 'Substitution out' else on[e[1]].add)(k)
                    cur = open_stint()
                    continue
                got, cts = 0, ()
                if e[1] in (1, 2):
                    f = classify(a)
                    i = e[1] - 1
                    cur['fga'][i] += f[0]; cur['fta'][i] += f[1]; cur['oreb'][i] += f[2]; cur['tov'][i] += f[3]
                    cts = box_counts(e)
                    for bk_ in cts:
                        cur['bx'][i][BXI[bk_]] += 1
                    # Points come from the made shot itself, not from the running score
                    # printed beside it. The two agree on every final score in the
                    # database, but the printed score is only as good as the row order:
                    # 43 games have a basket logged out of turn, where the printed
                    # score steps backwards and a difference of scores goes negative.
                    got = (3 if 'tpm' in cts else 2 if 'fgm' in cts else 0) + (1 if 'ftm' in cts else 0)
                if got:
                    dh, da = (got, 0) if e[1] == 1 else (0, got)
                    sh += dh; sa += da
                    cur['pts'][0] += dh; cur['pts'][1] += da
                    for k in on[1]: pm[k] += dh - da
                    for k in on[2]: pm[k] += da - dh
                if log is not None and e[1] in (1, 2):
                    log.append(('E', p, min(t_now, last), gsh, gsa, frozenset(on[1]), frozenset(on[2]), e[1],
                                key(e[1], e[4], e[5]) if e[5] else None, cts, got, a))
        if last > 0:
            cur['s'] += last
            for s in (1, 2):
                for k in on[s]:
                    sec[k] += last
            lead_int += (sh - sa) * last
            total += last
            if log is not None:
                log.append(('T', p, last, 0, sh, sa, frozenset(on[1]), frozenset(on[2])))
        stints.append(cur)
    lead = lead_int / total if total else 0.0
    return stints, sec, pm, lead, bad, seen


def box_sides(db, bk, palias, box, g):
    """Who is who in one game: jersey and name -> person id per side, with each
    player's published seconds and plus/minus."""
    sides = {1: {'num': {}, 'name': {}}, 2: {'num': {}, 'name': {}}}
    bmin, bpm_ = {}, {}
    for row in box['p']:
        r = {bk[i]: row[i] for i in range(min(len(row), len(bk)))}
        ti = r.get('ti', -1)
        if ti is None or ti < 0 or not r.get('pid'):
            continue
        tn = box['t'][ti]
        t = 1 if tn == g['h'] else 2 if tn == g['a'] else 0
        if not t:
            continue
        pid = str(r['pid'])
        pid = palias.get(pid, pid)
        if r.get('num') not in (None, ''):
            sides[t]['num'][str(r['num'])] = pid
        nm = r.get('name') or db['persons'].get(pid) or db['persons'].get(str(r['pid']))
        if nm:
            sides[t]['name'][norm(nm)] = pid
        bmin[(t, pid)] = mins(r.get('min')) * 60
        if r.get('pm') not in (None, ''):
            bpm_[(t, pid)] = float(r['pm'])
    return sides, bmin, bpm_


def rebuild_filled(ev, sides, bmin, want_log=False):
    """rebuild(), then once more with the invisible starters filled in where a side
    was short of five. Returns (stints, sec, pm, lead, bad, seen, filled?, log)."""
    log = [] if want_log else None
    st, sec, pm, lead, bad, seen = rebuild(ev, sides, log=log)
    filled = False
    if bad:
        # fill each short side with the unseen player whose minutes are least explained
        fill = {}
        for p, n1, n2 in bad:
            for t, n in ((1, n1), (2, n2)):
                if n >= 5:
                    continue
                cands = []
                for (tt, pid), bs in bmin.items():
                    if tt != t or (t, pid) in seen.get(p, set()):
                        continue
                    deficit = bs - sec.get(pid, 0)
                    if deficit >= 0.5 * (300 if str(p).isdigit() and int(p) >= 5 else 600):
                        cands.append((deficit, pid))
                cands.sort(reverse=True)
                fill[(p, t)] = [pid for _, pid in cands[:5 - n]]
        log = [] if want_log else None
        st, sec, pm, lead, bad, seen = rebuild(ev, sides, fill=fill, log=log)
        filled = True
    return st, sec, pm, lead, bad, seen, filled, log


def main():
    db = json.load(open(os.path.join(D, 'site_data.json')))
    bk = db['bkeys']
    palias = db.get('palias') or {}
    G = {g['mid']: (c['id'], g) for c in db['comps'] for g in c['games']}
    raw = sorted(glob.glob(os.path.join(D, 'pbp_raw', '*.json')))

    lead_by_mid, final_by_mid = {}, {}
    games_out = {}     # mid -> {'cid','h','a','stints':[...]} for clean games
    chk = collections.Counter()
    min_err, pm_hit, pm_n = [], 0, 0
    for f in raw:
        mid = os.path.basename(f)[:-5]
        if mid not in G:
            continue
        cid, g = G[mid]
        box = db['boxes'].get(mid)
        ev = json.load(open(f))
        chk['games'] += 1
        if not box:
            chk['no_box'] += 1
            continue
        sides, bmin, bpm_ = box_sides(db, bk, palias, box, g)
        st, sec, pm, lead, bad, seen, filled, _ = rebuild_filled(ev, sides, bmin)
        chk['filled'] += int(filled)
        lead_by_mid[mid] = round(lead, 3)
        if g.get('hs') is not None and g.get('as') is not None:
            final_by_mid[mid] = g['hs'] - g['as']
        if bad:
            chk['unclean'] += 1
            continue
        chk['clean'] += 1
        # the source's own +/- is only a fair yardstick where it is internally
        # consistent: a team's five-man +/- must add up to five times the margin
        consistent = g.get('hs') is not None and all(
            abs(sum(v for (tt, _), v in bpm_.items() if tt == t) - 5 * sg * (g['hs'] - g['as'])) < 0.5
            for t, sg in ((1, 1), (2, -1)))
        chk['box_pm_consistent'] += int(consistent)
        for (t, pid), bs in bmin.items():
            if bs > 0:
                min_err.append(abs(sec.get(pid, 0) - bs) / 60)
            if (t, pid) in bpm_ and (sec.get(pid, 0) > 0 or bs > 0):
                hit = int(round(pm.get(pid, 0)) == int(bpm_[(t, pid)]))
                pm_n += 1; pm_hit += hit
                if consistent:
                    chk['pm_n_c'] += 1; chk['pm_hit_c'] += hit
        games_out[mid] = {'cid': cid, 'st': [s for s in st if not s.get('z')], 'stf': st}

    me = np.array(min_err) if min_err else np.zeros(1)
    print('games %(games)d | no box %(no_box)d | needed a starter filled %(filled)d | clean %(clean)d | unclean %(unclean)d' % chk)
    print('minutes: median err %.2f min, within 1 min %.1f%% | +/- exact %.1f%% of %d lines'
          % (np.median(me), 100 * (me <= 1).mean(), 100 * pm_hit / max(pm_n, 1), pm_n))
    print('box +/- internally consistent in %d of %d clean games; there the rebuild matches it exactly on %.1f%% of %d lines'
          % (chk['box_pm_consistent'], chk['clean'], 100 * chk['pm_hit_c'] / max(chk['pm_n_c'], 1), chk['pm_n_c']))

    # average lead ~ k x final margin, for games with no play-by-play
    x = np.array([final_by_mid[m] for m in lead_by_mid if m in final_by_mid], float)
    y = np.array([lead_by_mid[m] for m in lead_by_mid if m in final_by_mid], float)
    k = float((x * y).sum() / (x * x).sum()) if len(x) else 0.5
    r = float(np.corrcoef(x, y)[0, 1]) if len(x) > 2 else 0.0
    print('average lead = %.3f x final margin (r = %.3f, %d games)' % (k, r, len(x)))

    # ---- on/off per competition --------------------------------------------
    def poss(s, i):
        return s['fga'][i] + 0.44 * s['fta'][i] - s['oreb'][i] + s['tov'][i]

    rng = np.random.default_rng(20260929)
    onoff = {}
    by_comp = collections.defaultdict(list)
    for mid, v in games_out.items():
        by_comp[v['cid']].append(mid)
    comp_games = {c['id']: [g for g in c['games'] if g['st'] == 'COMPLETE'] for c in db['comps']}
    cov = {}
    for cid, mids in by_comp.items():
        # per team, per game: team totals, and per player his on-court share
        team_games = collections.defaultdict(list)      # team -> [mid]
        tot = {}                                        # (mid, team) -> [pf, pa, poss]
        on = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0, 0.0, 0.0, 0.0]))
        for mid in mids:
            _, g = G[mid]
            for t, tn in ((1, g['h']), (2, g['a'])):
                team_games[tn].append(mid)
                i, j = t - 1, 2 - t
                T = [0.0, 0.0, 0.0]
                for s in games_out[mid]['st']:
                    ps = 0.5 * (poss(s, i) + poss(s, j))
                    T[0] += s['pts'][i]; T[1] += s['pts'][j]; T[2] += ps
                    for k_ in (s['on1'] if t == 1 else s['on2']):
                        if isinstance(k_, tuple):
                            continue
                        o = on[(k_, tn)][mid]
                        o[0] += s['pts'][i]; o[1] += s['pts'][j]; o[2] += ps; o[3] += s['s']
                tot[(mid, tn)] = T
        n_done = collections.Counter(G[m][1]['h'] for m in mids) + collections.Counter(G[m][1]['a'] for m in mids)
        n_all = collections.Counter()
        for g in comp_games.get(cid, []):
            n_all[g['h']] += 1; n_all[g['a']] += 1
        cov[cid] = {tn: [n_done[tn], n_all[tn]] for tn in n_all}
        out = {}
        merged = collections.defaultdict(list)
        for (pid, tn), per_game in on.items():
            merged[pid].append((tn, per_game))
        # sorted, so the bootstrap draws land on the same player every build (set
        # iteration order used to shuffle them, and the 80% range moved between builds)
        for pid, lst in sorted(merged.items(), key=lambda kv: str(kv[0])):
            rows = []       # per team-game: on pf, pa, poss, off pf, pa, poss, sec
            for tn, per_game in sorted(lst, key=lambda x: x[0]):
                for mid in team_games[tn]:
                    T = tot[(mid, tn)]
                    o = per_game.get(mid, [0.0, 0.0, 0.0, 0.0])
                    rows.append([o[0], o[1], o[2], T[0] - o[0], T[1] - o[1], T[2] - o[2], o[3]])
            A = np.array(rows)
            S = A.sum(axis=0)
            if S[6] < MIN_ON_SEC or S[2] <= 0 or S[5] <= 0:
                continue
            on_net = (S[0] - S[1]) / S[2] * 100
            off_net = (S[3] - S[4]) / S[5] * 100
            pick = rng.integers(0, len(A), size=(BOOT, len(A)))
            B = A[pick].sum(axis=1)
            ok = (B[:, 2] > 0) & (B[:, 5] > 0)
            d = ((B[ok, 0] - B[ok, 1]) / B[ok, 2] - (B[ok, 3] - B[ok, 4]) / B[ok, 5]) * 100
            lo, hi = (float(np.percentile(d, 10)), float(np.percentile(d, 90))) if len(d) else (0.0, 0.0)
            games_on = int((A[:, 6] > 0).sum())
            teams = [tn for tn, _ in lst]
            done = sum(cov[cid][tn][0] for tn in teams)
            alln = sum(cov[cid][tn][1] for tn in teams)
            out[pid] = [round(S[6] / 60, 1), round(on_net, 1), round(off_net, 1), round(on_net - off_net, 1),
                        round(lo, 1), round(hi, 1), int(round(S[0] - S[1])), games_on,
                        round(S[2]), round(done / alln, 2) if alln else 0.0]
        onoff[cid] = out

    # the lead each team carried, per competition: measured where the play-by-play
    # exists, estimated from the final margin where it does not
    team_lead = {}
    for c in db['comps']:
        acc = collections.defaultdict(lambda: [0.0, 0, 0])
        for g in c['games']:
            if g['st'] != 'COMPLETE' or g.get('hs') is None or g.get('as') is None:
                continue
            L = lead_by_mid.get(g['mid'])
            measured = L is not None
            if not measured:
                L = k * (g['hs'] - g['as'])
            for tn, sgn in ((g['h'], 1), (g['a'], -1)):
                a = acc[tn]; a[0] += sgn * L; a[1] += 1; a[2] += int(measured)
        if acc:
            team_lead[c['id']] = {tn: [round(a[0] / a[1], 3), a[1], a[2]] for tn, a in acc.items()}

    meta = {'k': round(k, 4), 'r': round(r, 3), 'games': chk['games'], 'clean': chk['clean'],
            'filled': chk['filled'], 'unclean': chk['unclean'],
            'min_med': round(float(np.median(me)), 3), 'min_1': round(float((me <= 1).mean()), 4),
            'pm_exact': round(pm_hit / max(pm_n, 1), 4), 'pm_n': pm_n, 'rule': RULE,
            'pm_consistent_games': chk['box_pm_consistent'],
            'pm_exact_c': round(chk['pm_hit_c'] / max(chk['pm_n_c'], 1), 4),
            'min_on': MIN_ON_SEC // 60}
    json.dump({'meta': meta, 'lead': lead_by_mid, 'teamLead': team_lead, 'onoff': onoff, 'cov': cov},
              open(os.path.join(D, 'lineups.json'), 'w'), separators=(',', ':'))
    # full stint record, for later lineup work (not shipped to the page)
    json.dump({mid: [[s['p'], s['s'], s['h'], s['a'], s['pts'],
                      [round(poss(s, 0), 2), round(poss(s, 1), 2)]] for s in v['st'] if s['s'] or any(s['pts'])]
               for mid, v in games_out.items()},
              open(os.path.join(D, 'stints.json'), 'w'), separators=(',', ':'))
    # the same stints with their box-score counters and the on-court keys as lists,
    # for build_lineup_stats.py (a player the box score could not identify is
    # written as "?name")
    def keys(S):
        return sorted(k if not isinstance(k, tuple) else '?' + str(k[3] or k[2]) for k in S)
    json.dump({mid: {'cid': v['cid'], 'st': [[s['p'], s['s'], keys(s['on1']), keys(s['on2']), s['pts'], s['bx']]
                                             for s in v['stf']]}
               for mid, v in games_out.items()},
              open(os.path.join(D, 'stints_full.json'), 'w'), separators=(',', ':'))
    print('on/off rows: %d across %d competitions' % (sum(len(v) for v in onoff.values()), len(onoff)))


if __name__ == '__main__':
    main()
