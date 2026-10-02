#!/usr/bin/env python3
"""Box Plus/Minus 2.0, VORP and points added, for every competition in the database.

BPM rates a player against an average player *in a league*, so the league here is
one competition — never a blend of two. Method: Daniel Myers' BPM 2.0, published
at basketball-reference.com/about/bpm2.html. Three departures from the published
recipe, each measured rather than assumed (see claude/bpm-methodology.md):

  * team strength is the schedule-adjusted rating, not the raw net rating, so a
    team that beat a soft group is not credited for it;
  * the points-context baseline is this competition's own points per true-shot
    attempt, because the constant the regression used is not published;
  * the listed-position blend uses a position found anywhere in the database,
    since most competitions publish rosters without one.

Every rating carries an 80% bootstrap interval over the player's own games. In a
seven-game tournament that interval is wide, and hiding it would be dishonest.
"""
import json, os, math, collections
import numpy as np

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

BPM_POS = {'pts': (0.860, 0.860), 'tpm': (0.389, 0.389), 'ast': (0.580, 1.034),
           'tov': (-0.964, -0.964), 'oreb': (0.613, 0.181), 'dreb': (0.116, 0.181),
           'stl': (1.369, 1.008), 'blk': (1.327, 0.703), 'pf': (-0.367, -0.367)}
BPM_ROLE = {'fga': (-0.560, -0.780), 'fta': (-0.246, -0.343)}
OBPM_POS = {'pts': (0.605, 0.605), 'tpm': (0.477, 0.477), 'ast': (0.476, 0.476),
            'tov': (-0.579, -0.882), 'oreb': (0.606, 0.422), 'dreb': (-0.112, 0.103),
            'stl': (0.177, 0.294), 'blk': (0.725, 0.097), 'pf': (-0.439, -0.439)}
OBPM_ROLE = {'fga': (-0.330, -0.472), 'fta': (-0.145, -0.208)}
POS_CONST, ROLE_CONST = -0.818, -2.774
OPOS_CONST, OROLE_CONST = -1.698, -0.860
REPLACEMENT = -2.0
NUM = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb',
       'ast', 'pf', 'tov', 'stl', 'blk']
LISTED = {'PG': 1, 'SG': 2, 'SF': 3, 'PF': 4, 'C': 5, 'G': 1.5, 'F': 3.5,
          'PG/SG': 1.5, 'SG/SF': 2.5, 'SF/PF': 3.5, 'PF/C': 4.5, 'C/PF': 4.5, 'G/F': 2.5}
LEAD_EFFECT = 0.35   # pts/100 a team loses per point of lead (bpm2.html)
LEADS = None         # data/lineups.json teamLead, loaded in main()
RIDGE = 1.0       # one notional game against an average opponent, decided at 0-0
BOOT = 600        # resamples; the site's other intervals use the same count


def lerp(pair, x):
    return pair[0] + (pair[1] - pair[0]) * (x - 1.0) / 4.0


def mins(s):
    if not s or s == '-':
        return 0.0
    s = str(s)
    if ':' in s:
        m, _, sec = s.partition(':')
        try: return int(m) + int(sec) / 60.0
        except ValueError: return 0.0
    try: return float(s)
    except ValueError: return 0.0


def clamp(v, lo=1.0, hi=5.0):
    return lo if v < lo else (hi if v > hi else v)


def position_registry(db):
    """A player's listed position, taken from any roster in the database. Most
    competitions publish rosters with the position column empty, but a player who
    appears in six competitions usually has it filled in at least once."""
    reg = collections.defaultdict(collections.Counter)
    for c in db['comps']:
        for _tid, rows in (c.get('roster') or {}).items():
            for r in rows:
                v = LISTED.get((r.get('pos') or '').strip().upper())
                if v and r.get('pid'):
                    reg[r['pid']][v] += 1
    return {pid: cnt.most_common(1)[0][0] for pid, cnt in reg.items()}


def adjusted_ratings(names, games, gposs, lg_ortg):
    """Offensive and defensive ratings adjusted for who each team actually played.

    Solves  points per 100 in a game  ~  off(scorer) - def(conceder) + league mean
    by least squares over every completed game, with a light ridge pulling both
    towards the league mean so a team with five games is not over-fitted."""
    n = len(names)
    idx = {nm: i for i, nm in enumerate(names)}
    rows, rhs = [], []
    for g in games:
        p = gposs.get(g['mid'])
        if not p or g['hs'] is None or g['as'] is None:
            continue
        if g['h'] not in idx or g['a'] not in idx:
            continue
        for scorer, conceder, pts in ((g['h'], g['a'], g['hs']), (g['a'], g['h'], g['as'])):
            # points per 100 in this game = league mean + scorer's offence
            #                                          + conceder's defensive weakness
            v = np.zeros(2 * n)
            v[idx[scorer]] = 1.0
            v[n + idx[conceder]] = 1.0
            rows.append(v)
            rhs.append(pts / p * 100 - lg_ortg)
    if not rows:
        return None
    # the two halves are identified only up to a constant (add c to every offence,
    # subtract it from every defence); the ridge pins that down by pulling both
    # towards the league mean, and with five or more games it barely shrinks
    A = np.vstack(rows + [np.sqrt(RIDGE) * np.eye(2 * n)])
    b = np.concatenate([np.array(rhs), np.zeros(2 * n)])
    sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    off, dfn = sol[:n], sol[n:]
    return {nm: (lg_ortg + off[i], lg_ortg + dfn[i]) for nm, i in idx.items()}


def dv(a, b):
    """Division that treats an empty denominator as 'no contribution', which is what
    every formula below means by it (a player with no free-throw attempts has no
    free-throw part, not an undefined one)."""
    return a / b if b else 0.0


def advanced_metrics(team, P, lg, games, thr):
    """PER, USG%, and Win Shares on a 40-minute basis, for one competition.

    Formulas are Basketball-Reference's (about/per.html, glossary USG%, about/ws.html)
    and, for Win Shares, Dean Oliver's offensive and defensive ratings
    (about/ratings.html). As with BPM the league is this one competition, so PER's
    average of 15 means "average for this field", and a Win Share is priced in this
    competition's own points per game and pace.

    Returns ({pid: [per, usg, ows, dws, ws, ws40, ortg, drtg, minutes]},
             league context, {team: (team WS, actual wins, games)})."""
    lg_fg, lg_ft, lg_fta = lg['fgm'], lg['ftm'], lg['fta']
    lg_trb = lg['oreb'] + lg['dreb']
    factor = 2.0 / 3.0 - dv(0.5 * dv(lg['ast'], lg_fg), 2.0 * dv(lg_fg, lg_ft))
    vop = dv(lg['pts'], lg['fga'] - lg['oreb'] + lg['tov'] + 0.44 * lg_fta)
    drbp = dv(lg_trb - lg['oreb'], lg_trb)
    pf_pen = dv(lg_ft, lg['pf']) - 0.44 * dv(lg_fta, lg['pf']) * vop
    lg_pace = dv(lg['poss'], lg['gmin']) * 40.0
    lg_ppp = dv(lg['pts'], lg['poss'])
    lg_ppg = dv(lg['pts'], lg['g'])          # points per team-game

    for nm, t in team.items():
        t['pace40'] = dv(t['poss'], t['gmin']) * 40.0
        # marginal points per win, scaled by how fast this team played
        t['mpw'] = 0.32 * lg_ppg * dv(t['pace40'], lg_pace)
        t['ft_sc'] = (1 - (1 - dv(t['ftm'], t['fta'])) ** 2) * t['fta'] * 0.4
        t['scposs'] = t['fgm'] + t['ft_sc']
        t['orbp'] = dv(t['oreb'], t['oreb'] + t['opp_dreb'])
        t['playp'] = dv(t['scposs'], t['fga'] + t['fta'] * 0.4 + t['tov'])
        w = (1 - t['orbp']) * t['playp']
        t['orbw'] = dv(w, w + t['orbp'] * (1 - t['playp']))
        t['defrtg'] = 100 * dv(t['opp_pts'], t['poss'])
        t['dorp'] = dv(t['opp_oreb'], t['opp_oreb'] + t['dreb'])
        t['dfgp'] = dv(t['opp_fgm'], t['opp_fga'])
        a = t['dfgp'] * (1 - t['dorp'])
        t['fmwt'] = dv(a, a + (1 - t['dfgp']) * t['dorp'])
        opp_sc = t['opp_fgm'] + (1 - (1 - dv(t['opp_ftm'], t['opp_fta'])) ** 2) * t['opp_fta'] * 0.4
        t['dpts_sc'] = dv(t['opp_pts'], opp_sc)

    raw = {}
    for key, p in P.items():
        t = team[key[1]]
        mp = p['mp']
        if mp <= 0:
            continue
        fgm, fga, tpm = p['fgm'], p['fga'], p['tpm']
        ftm, fta, pts = p['ftm'], p['fta'], p['pts']
        orb, drb, ast = p['oreb'], p['dreb'], p['ast']
        stl, blk, tov, pf = p['stl'], p['blk'], p['tov'], p['pf']
        trb = orb + drb

        # ---- PER (unadjusted, per minute) ----------------------------------
        ast_fg = dv(t['ast'], t['fgm'])
        uper = dv(1.0, mp) * (
            tpm + (2.0 / 3.0) * ast
            + (2 - factor * ast_fg) * fgm
            + ftm * 0.5 * (1 + (1 - ast_fg) + (2.0 / 3.0) * ast_fg)
            - vop * tov
            - vop * drbp * (fga - fgm)
            - vop * 0.44 * (0.44 + 0.56 * drbp) * (fta - ftm)
            + vop * (1 - drbp) * (trb - orb)
            + vop * drbp * orb
            + vop * stl
            + vop * drbp * blk
            - pf * pf_pen)
        aper = dv(lg_pace, t['pace40']) * uper

        # ---- usage ---------------------------------------------------------
        usg = 100 * dv((fga + 0.44 * fta + tov) * (t['mp'] / 5.0),
                       mp * (t['fga'] + 0.44 * t['fta'] + t['tov']))

        # ---- Oliver offensive rating: points produced, possessions used -----
        onfl = dv(mp, t['mp'] / 5.0)                    # share of team time on floor
        qast = (onfl * 1.14 * dv(t['ast'] - ast, t['fgm'])
                + dv(dv(t['ast'], t['mp']) * mp * 5 - ast,
                     dv(t['fgm'], t['mp']) * mp * 5 - fgm) * (1 - onfl))
        ft_rate = dv(pts - ftm, 2 * fga)
        fg_part = fgm * (1 - 0.5 * ft_rate * qast) if fga else 0.0
        ast_part = 0.5 * dv((t['pts'] - t['ftm']) - (pts - ftm), 2 * (t['fga'] - fga)) * ast
        ft_part = (1 - (1 - dv(ftm, fta)) ** 2) * 0.4 * fta
        orb_part = orb * t['orbw'] * t['playp']
        keep = 1 - dv(t['oreb'], t['scposs']) * t['orbw'] * t['playp']
        scposs = (fg_part + ast_part + ft_part) * keep + orb_part
        fgx = (fga - fgm) * (1 - 1.07 * t['orbp'])
        ftx = ((1 - dv(ftm, fta)) ** 2) * 0.4 * fta
        totposs = scposs + fgx + ftx + tov

        pp_fg = 2 * (fgm + 0.5 * tpm) * (1 - 0.5 * ft_rate * qast) if fga else 0.0
        pp_ast = (2 * dv(t['fgm'] - fgm + 0.5 * (t['tpm'] - tpm), t['fgm'] - fgm)
                  * 0.5 * dv((t['pts'] - t['ftm']) - (pts - ftm), 2 * (t['fga'] - fga)) * ast)
        pp_orb = orb * t['orbw'] * t['playp'] * dv(t['pts'], t['scposs'])
        pprod = (pp_fg + pp_ast + ftm) * keep + pp_orb
        ortg = 100 * dv(pprod, totposs)

        # ---- Oliver defensive rating ----------------------------------------
        stops1 = stl + blk * t['fmwt'] * (1 - 1.07 * t['dorp']) + drb * (1 - t['fmwt'])
        stops2 = ((dv(t['opp_fga'] - t['opp_fgm'] - t['blk'], t['mp']) * t['fmwt'] * (1 - 1.07 * t['dorp'])
                   + dv(t['opp_tov'] - t['stl'], t['mp'])) * mp
                  + dv(pf, t['pf']) * 0.4 * t['opp_fta'] * (1 - dv(t['opp_ftm'], t['opp_fta'])) ** 2)
        stopp = dv((stops1 + stops2) * t['opp_mp'], t['poss'] * mp)
        drtg = t['defrtg'] + 0.2 * (100 * t['dpts_sc'] * (1 - stopp) - t['defrtg'])

        # ---- Win Shares -------------------------------------------------------
        ows = dv(pprod - 0.92 * lg_ppp * totposs, t['mpw'])
        dws = dv(dv(mp, t['mp']) * t['poss'] * (1.08 * lg_ppp - drtg / 100.0), t['mpw'])

        raw[key] = {'mp': mp, 'g': p['g'], 'poss': p['poss'], 'aper': aper, 'usg': usg,
                    'ows': ows, 'dws': dws, 'ortg': ortg, 'drtg': drtg, 'totposs': totposs}

    # PER is scaled so the minute-weighted average of this competition is exactly 15
    tot_mp = sum(r['mp'] for r in raw.values())
    lg_aper = dv(sum(r['aper'] * r['mp'] for r in raw.values()), tot_mp)
    for r in raw.values():
        r['per'] = r['aper'] * dv(15.0, lg_aper)

    # one row per person (the few who changed team mid-competition are combined:
    # rates by minutes, the offensive rating by possessions used, shares summed)
    merged = collections.defaultdict(list)
    for (pid, _nm), r in raw.items():
        merged[pid].append(r)
    out = {}
    for pid, rs in merged.items():
        g = sum(r['g'] for r in rs)
        poss = sum(r['poss'] for r in rs)
        if g < thr or poss < 40:
            continue
        mp = sum(r['mp'] for r in rs)
        wm = lambda f: sum(r[f] * r['mp'] for r in rs) / mp
        tp = sum(r['totposs'] for r in rs)
        ows = sum(r['ows'] for r in rs)
        dws = sum(r['dws'] for r in rs)
        ortg = sum(r['ortg'] * r['totposs'] for r in rs) / tp if tp else 0.0
        out[pid] = [round(wm('per'), 1), round(wm('usg'), 1), round(ows, 2), round(dws, 2),
                    round(ows + dws, 2), round((ows + dws) / mp * 40.0, 3),
                    round(ortg, 1), round(wm('drtg'), 1), round(mp, 1)]

    # Win Shares are built to add up to wins. Check it against the games themselves.
    wins = collections.Counter()
    for g in games:
        if g['hs'] is None or g['as'] is None or g['hs'] == g['as']:
            continue
        wins[g['h'] if g['hs'] > g['as'] else g['a']] += 1
    team_ws = collections.Counter()
    for (pid, nm), r in raw.items():
        team_ws[nm] += r['ows'] + r['dws']
    check = {nm: (round(team_ws[nm], 2), wins.get(nm, 0), team[nm]['g']) for nm in team}

    # How far team Win Shares land from the wins actually recorded, as a share of
    # games played. Win Shares turn point margin into wins linearly, which holds for
    # close leagues and breaks in blowout tournaments; this is the per-competition
    # measure of how literally a Win Share can be read here.
    errs = sorted(abs(ws - w) / g for ws, w, g in check.values() if g)
    wsfit = round(errs[len(errs) // 2], 3) if errs else None

    ctx = {'factor': round(factor, 4), 'vop': round(vop, 4), 'drbp': round(drbp, 4),
           'lgaper': round(lg_aper, 5), 'ppp': round(lg_ppp, 4), 'ppg': round(lg_ppg, 1),
           'mpw': round(0.32 * lg_ppg, 2), 'pace': round(lg_pace, 1), 'wsfit': wsfit}
    return out, ctx, check


def compute(db, cid, posreg):
    comp = [c for c in db['comps'] if c['id'] == cid][0]
    bk = db['bkeys']
    games = [g for g in comp['games'] if g['st'] == 'COMPLETE' and g['mid'] in db['boxes']]
    if len(games) < 4:
        return None

    # ---- per-game team boxes and possessions ------------------------------
    gt = {}
    gposs, gmin = {}, {}
    for g in games:
        b = db['boxes'][g['mid']]
        sides = {}
        for row in b['p']:
            r = {bk[i]: row[i] for i in range(min(len(row), len(bk)))}
            mp = mins(r.get('min'))
            if mp <= 0:
                continue
            nm = b['t'][r['ti']] if r.get('ti', -1) >= 0 else ''
            d = sides.setdefault(nm, collections.Counter())
            d['mp'] += mp
            for k in NUM:
                d[k] += float(r.get(k) or 0)
        if len(sides) != 2:
            continue
        (na, a), (nb, o) = list(sides.items())

        def half(x, y):
            den = x['oreb'] + y['dreb']
            share = x['oreb'] / den if den else 0.0
            return x['fga'] + 0.4 * x['fta'] - 1.07 * share * (x['fga'] - x['fgm']) + x['tov']
        gposs[g['mid']] = 0.5 * (half(a, o) + half(o, a))
        gmin[g['mid']] = (a['mp'] + o['mp']) / 10.0
        gt[g['mid']] = {na: a, nb: o}

    if not gposs:
        return None

    # A competition where one side of the box scores carries no person ids (the
    # FIBA LiveStats imports: only Malaysia's games, opponents by name only) is not
    # rated. The league context would be one team's schedule, and the identity the
    # team adjustment enforces - players sum to their team's rating - cannot hold
    # for a team with no identified players.
    ident = set()
    for g in games:
        b = db['boxes'][g['mid']]
        for row in b['p']:
            r = {bk[i]: row[i] for i in range(min(len(row), len(bk)))}
            if r.get('pid') and mins(r.get('min')) > 0 and r.get('ti', -1) >= 0:
                ident.add(b['t'][r['ti']])
    if any(nm not in ident for sides in gt.values() for nm in sides):
        return None

    team = collections.defaultdict(collections.Counter)
    for mid, sides in gt.items():
        for nm, own in sides.items():
            opp = [v for k, v in sides.items() if k != nm][0]
            t = team[nm]
            t['poss'] += gposs[mid]; t['gmin'] += gmin[mid]; t['mp'] += own['mp']; t['g'] += 1
            t['opp_mp'] += opp['mp']
            for k in NUM:
                t[k] += own[k]; t['opp_' + k] += opp[k]

    lg = collections.Counter()
    for t in team.values():
        lg.update(t)
    lg_ortg = lg['pts'] / lg['poss'] * 100
    lg_tsa = lg['fga'] + 0.44 * lg['fta']
    lg_pts_tsa = lg['pts'] / lg_tsa

    names = sorted(team)
    adj = adjusted_ratings(names, games, gposs, lg_ortg) or {}
    tlead = (LEADS or {}).get(cid, {})
    for nm in names:
        t = team[nm]
        t['ortg'] = t['pts'] / t['poss'] * 100
        t['drtg'] = t['opp_pts'] / t['poss'] * 100
        t['net'] = t['ortg'] - t['drtg']
        t['aortg'], t['adrtg'] = adj.get(nm, (t['ortg'], t['drtg']))
        t['srs'] = t['aortg'] - t['adrtg']
        t['sos'] = t['srs'] - t['net']
        # lead adjustment (BPM 2.0): a team plays 0.35 pts/100 worse per point of
        # lead, half of it charged to each side, so the rating the players must sum
        # to is the schedule-adjusted one plus 0.175 x the team's average lead.
        # The average lead is measured from the play-by-play (time-weighted) where it
        # exists and estimated from the final margin where it does not.
        L = tlead.get(nm, [0.0, 0, 0])
        t['lead'], t['lead_meas'] = L[0], (L[2] / L[1] if L[1] else 0.0)
        t['lead_adj'] = LEAD_EFFECT / 2.0 * t['lead']
        t['arating'] = t['srs'] + t['lead_adj']
        t['tsa'] = t['fga'] + 0.44 * t['fta']
        t['pts_tsa'] = t['pts'] / t['tsa']
        t['ctx'] = lg_pts_tsa - t['pts_tsa']
        # points the team scored above a threshold efficiency 0.33 below its own
        t['thr'] = t['pts'] - t['tsa'] * (t['pts_tsa'] - 0.33)

    # ---- player season totals, and each player's own per-game lines --------
    # keyed on (person, team): three players in the whole database changed team
    # mid-competition, and a rating has to belong to the team it was earned at
    P = collections.defaultdict(collections.Counter)
    plines = collections.defaultdict(list)
    for g in games:
        if g['mid'] not in gposs:
            continue
        b = db['boxes'][g['mid']]
        for row in b['p']:
            r = {bk[i]: row[i] for i in range(min(len(row), len(bk)))}
            mp = mins(r.get('min'))
            pid = r.get('pid')
            if mp <= 0 or not pid:
                continue
            nm = b['t'][r['ti']] if r.get('ti', -1) >= 0 else ''
            key = (pid, nm)
            p = P[key]
            p['mp'] += mp; p['g'] += 1
            p['pm'] += float(r.get('pm') or 0)
            for k in NUM:
                p[k] += float(r.get(k) or 0)
            # minutes belonging to an identified person; a few box score lines
            # carry no person link, and their minutes cannot be shared out
            team[nm]['pmp'] += mp
            plines[key].append(([float(r.get(k) or 0) for k in NUM],
                                mp * gposs[g['mid']] / gmin[g['mid']]))

    for key, p in P.items():
        t = team[key[1]]
        p['poss'] = sum(x[1] for x in plines[key])
        p['mshare'] = p['mp'] / t['pmp'] if t['pmp'] else 0.0
        p['tsa'] = p['fga'] + 0.44 * p['fta']
        p['thr'] = p['pts'] - p['tsa'] * (t['pts_tsa'] - 0.33)

    # ---- position and offensive role --------------------------------------
    for key, p in P.items():
        t = team[key[1]]
        sh = lambda k: (p[k] / t[k]) if t[k] else 0.0
        den = t['oreb'] + t['dreb']
        trb = ((p['oreb'] + p['dreb']) / den) if den else 0.0
        pos = clamp(2.130 + 8.668 * trb - 2.486 * sh('stl') + 0.992 * sh('pf')
                    - 3.536 * sh('ast') + 1.667 * sh('blk'))
        listed = posreg.get(key[0])
        if listed:   # the published method: weighted with 50 minutes of listed position
            pos = (pos * p['mp'] + listed * 50.0) / (p['mp'] + 50.0)
        p['pos_raw'] = pos
        p['role_raw'] = clamp(6.00 - 6.642 * sh('ast')
                              - 8.544 * ((p['thr'] / t['thr']) if t['thr'] else 0.0))
    for nm in names:
        mem = [k for k in P if k[1] == nm]
        tw = sum(P[k]['mshare'] for k in mem)
        if not tw:
            continue
        for raw, fin in (('pos_raw', 'pos'), ('role_raw', 'role')):
            avg = sum(P[k][raw] * P[k]['mshare'] for k in mem) / tw
            for k in mem:
                P[k][fin] = clamp(P[k][raw] + (3.0 - avg))

    # ---- raw ratings -------------------------------------------------------
    def raw_of(p, per100, which):
        posmap, rolemap, pc, rc = which
        s = sum(lerp(pair, p['pos']) * per100[k] for k, pair in posmap.items())
        s += sum(lerp(pair, p['role']) * per100[k] for k, pair in rolemap.items())
        return s + (3.0 - p['pos']) * (pc / 2.0) + (3.0 - p['role']) * (rc / 2.0)
    TOT = (BPM_POS, BPM_ROLE, POS_CONST, ROLE_CONST)
    OFF = (OBPM_POS, OBPM_ROLE, OPOS_CONST, OROLE_CONST)

    for key, p in P.items():
        t = team[key[1]]
        per = {k: p[k] / p['poss'] * 100 for k in NUM} if p['poss'] else {k: 0.0 for k in NUM}
        per['pts'] += t['ctx'] * (per['fga'] + 0.44 * per['fta'])
        p['per100'] = per
        p['raw_bpm'] = raw_of(p, per, TOT)
        p['raw_obpm'] = raw_of(p, per, OFF)

    for nm in names:
        mem = [k for k in P if k[1] == nm]
        t = team[nm]
        wsum = lambda f: sum(P[k][f] * P[k]['mshare'] for k in mem)
        t['adj_bpm'] = t['arating'] / 5.0 - wsum('raw_bpm')
        # the lead effect is taken to fall evenly on offence and defence
        t['adj_obpm'] = (t['aortg'] - lg_ortg + t['lead_adj'] / 2.0) / 5.0 - wsum('raw_obpm')
        for k in mem:
            p = P[k]
            p['bpm'] = p['raw_bpm'] + t['adj_bpm']
            p['obpm'] = p['raw_obpm'] + t['adj_obpm']
            p['dbpm'] = p['bpm'] - p['obpm']
            p['vorp'] = (p['bpm'] - REPLACEMENT) * p['mshare']
            p['padd'] = p['bpm'] * p['poss'] / 100.0

    # ---- 80% bootstrap interval over the player's own games ----------------
    rng = np.random.default_rng(20260911)
    ipts, ifga, ifta = NUM.index('pts'), NUM.index('fga'), NUM.index('fta')
    for key, p in P.items():
        lines = plines[key]
        n = len(lines)
        if n < 2 or p['poss'] <= 0:
            p['lo'] = p['hi'] = p['bpm']
            continue
        stats = np.array([x[0] for x in lines], dtype=float)
        poss = np.array([x[1] for x in lines], dtype=float)
        pick = rng.integers(0, n, size=(BOOT, n))
        S = stats[pick].sum(axis=1)
        Q = poss[pick].sum(axis=1)
        Q[Q <= 0] = np.nan
        per = S / Q[:, None] * 100
        per[:, ipts] += team[key[1]]['ctx'] * (per[:, ifga] + 0.44 * per[:, ifta])
        tot = np.zeros(BOOT)
        for nk, pair in BPM_POS.items():
            tot += lerp(pair, p['pos']) * per[:, NUM.index(nk)]
        for nk, pair in BPM_ROLE.items():
            tot += lerp(pair, p['role']) * per[:, NUM.index(nk)]
        tot += (3.0 - p['pos']) * (POS_CONST / 2.0) + (3.0 - p['role']) * (ROLE_CONST / 2.0)
        tot += team[key[1]]['adj_bpm']
        tot = tot[~np.isnan(tot)]
        p['lo'], p['hi'] = float(np.percentile(tot, 10)), float(np.percentile(tot, 90))

    # the team adjustment exists to make this identity true; if it ever fails,
    # the possessions or the minute shares are wrong, not the coefficients
    for nm in names:
        mem = [k for k in P if k[1] == nm]
        got = sum(P[k]['bpm'] * P[k]['mshare'] for k in mem) * 5
        if abs(got - team[nm]['arating']) > 0.02:
            raise AssertionError('%s / %s: BPM sums to %.3f, lead-adjusted rating is %.3f'
                                 % (cid, nm, got, team[nm]['arating']))

    tg = comp.get('tg') or 0
    thr = max(2, math.ceil(0.4 * tg)) if tg else 2
    # one row per person: the three players who changed team mid-competition are
    # combined by possessions, since BPM is a rate
    merged = collections.defaultdict(list)
    for (pid, _nm), p in P.items():
        merged[pid].append(p)
    out = {}
    for pid, ps in merged.items():
        g = sum(p['g'] for p in ps)
        poss = sum(p['poss'] for p in ps)
        if g < thr or poss < 40:
            continue
        wavg = lambda f: sum(p[f] * p['poss'] for p in ps) / poss
        out[pid] = [round(wavg('bpm'), 2), round(wavg('obpm'), 2), round(wavg('dbpm'), 2),
                    round(wavg('lo'), 2), round(wavg('hi'), 2),
                    round(sum(p['vorp'] for p in ps), 3),
                    round(sum(p['padd'] for p in ps), 1),
                    round(wavg('pos'), 2), round(wavg('role'), 2), round(poss)]
    adv, actx, wscheck = advanced_metrics(team, P, lg, games, thr)
    sos = sorted(abs(team[nm]['sos']) for nm in names)
    meta = {'lgortg': round(lg_ortg, 1), 'adv': actx,
            'pace': round(lg['poss'] / lg['gmin'] * 40.0, 1),
            'ptstsa': round(lg_pts_tsa, 3),
            'thr': thr, 'n': len(out),
            'sos': round(sos[len(sos) // 2], 1) if sos else 0.0,
            'teams': {nm: [round(team[nm]['ortg'], 1), round(team[nm]['drtg'], 1),
                           round(team[nm]['net'], 1), round(team[nm]['srs'], 1),
                           round(team[nm]['sos'], 1), round(team[nm]['adj_bpm'], 2),
                           round(team[nm]['ctx'], 3), round(team[nm]['pace'] if 'pace' in team[nm]
                                 else team[nm]['poss'] / team[nm]['gmin'] * 40.0, 1),
                           round(team[nm]['lead'], 2), round(team[nm]['lead_adj'], 2),
                           round(team[nm]['lead_meas'], 2)]
                      for nm in names},
            'leadMeas': round(sum(team[nm]['lead_meas'] for nm in names) / len(names), 2) if names else 0.0}
    return out, meta, adv, wscheck


def main():
    global LEADS
    db = json.load(open(os.path.join(D, 'site_data.json')))
    lp = os.path.join(D, 'lineups.json')
    LEADS = json.load(open(lp)).get('teamLead', {}) if os.path.exists(lp) else {}
    print('average leads for %d competitions (run build_lineups.py first)' % len(LEADS))
    posreg = position_registry(db)
    print('listed positions known for %d players' % len(posreg))
    bpm, meta, adv, checks = {}, {}, {}, {}
    for c in db['comps']:
        r = compute(db, c['id'], posreg)
        if not r:
            continue
        bpm[c['id']], meta[c['id']], adv[c['id']], checks[c['id']] = r
    json.dump({'bpm': bpm, 'meta': meta, 'adv': adv}, open(os.path.join(D, 'bpm.json'), 'w'),
              separators=(',', ':'))
    json.dump(checks, open(os.path.join(D, 'ws_check.json'), 'w'), separators=(',', ':'))
    n = sum(len(v) for v in bpm.values())
    print('competitions rated %d | player ratings %d | advanced rows %d | %.2f MB'
          % (len(bpm), n, sum(len(v) for v in adv.values()),
             os.path.getsize(os.path.join(D, 'bpm.json')) / 1024 / 1024))
    big = sorted(meta.items(), key=lambda x: -x[1]['sos'])[:5]
    print('largest median |SOS|:', [(k, v['sos']) for k, v in big])


if __name__ == '__main__':
    main()
