#!/usr/bin/env python3
"""The Post Game Report of a box score page: one file per game with play-by-play, the numbers
the report is drawn from (assets/app4zc_postgame.js lays out the pages, writes the insights and
makes the PDF in the browser).

For each game: both teams' lines and the four factors (possessions counted from the play-by-play
by build_lineups.py, inside data/stints.json; the box-score estimate where a game has no stints),
the score margin through the game, runs of unanswered points, lead changes, ties and time leading,
each player's hot stretch (most points inside four minutes) and points per quarter, the shot chart
by zone, every player's line with TS%, usage, assist and turnover rates and on-court net rating,
and every five that shared the court for two minutes or more.

Output: stats/pg/<mid>.js   PG_PUT('<mid>', {...})
Run: python3 build_postgame.py   (after build_lineups.py and build_stats.py, before build_site.py)
"""
import collections, json, math, os, re, shutil

R = os.path.dirname(os.path.abspath(__file__))
L = R + '/'
D = os.path.join(R, 'data')
OUT = os.path.join(R, 'stats', 'pg')
OPEN = {}

RIM=1.575

def place(top, left):
    if left < 50: d, yi = left/100*28, top/100*15
    else: d, yi = 28-left/100*28, 15-top/100*15
    return 7.5-yi, d-RIM

def zone5(x, y, three):
    d = y + RIM
    if three: return 'c3' if d <= 3.13 else 'ab3'
    if math.hypot(x, y) <= 1.6: return 'rim'
    if abs(x) <= 2.45 and d <= 5.8: return 'paint'
    return 'mid'

def clk(c):
    m = re.match(r'^(\d+):(\d+)', str(c or ''))
    return int(m.group(1))*60+int(m.group(2)) if m else None

def build(mid, s, pbp, shots, stints, periods):
    bk = {k: i for i, k in enumerate(s['bkeys'])}
    G = next(g for c in s['comps'] for g in c['games'] if g['mid'] == mid)
    C = next(c for c in s['comps'] if any(g['mid'] == mid for g in c['games']))
    box = s['boxes'][mid]; side_of = {}  # team name -> 0 home / 1 away
    for i, t in enumerate(box['t']): side_of[t] = 0 if t == G['h'] else 1
    def v(r, k):
        i = bk[k]; x = r[i] if i < len(r) else None
        return float(x) if isinstance(x, (int, float)) else 0.0
    def mins(r):
        m = re.match(r'^(\d+):(\d+)$', str(r[bk['min']] if bk['min'] < len(r) else ''))
        return int(m.group(1)) + int(m.group(2))/60 if m else 0.0
    P = []
    for r in box['p']:
        t = box['t'][r[1]]
        P.append(dict(pid=r[0], name=s['persons'].get(r[0]) or (r[bk['name']] if len(r) > bk['name'] else ''), num=r[bk['num']] if len(r) > bk['num'] else '',
                      side=side_of[t], min=mins(r), **{k: v(r, k) for k in ('pts','fgm','fga','tpm','tpa','ftm','fta','oreb','dreb','ast','tov','stl','blk','pf','pm')}))
    T = []
    for sd in (0, 1):
        ps = [p for p in P if p['side'] == sd]
        t = {k: sum(p[k] for p in ps) for k in ('pts','fgm','fga','tpm','tpa','ftm','fta','oreb','dreb','ast','tov','stl','blk','pf')}
        t['min'] = sum(p['min'] for p in ps)
        T.append(t)
    T[0]['pts'] = float(G['hs']); T[1]['pts'] = float(G['as'])
    nper = len(periods) if periods else 4
    # quarter length from the longest clock printed in regulation (10 minutes; some leagues play 12)
    cl = [clk(r[2]) for r in pbp if str(r[0]).isdigit() and int(r[0]) <= 4]
    ql = max(300, -(-max([x for x in cl if x is not None] or [600]) // 60) * 60)
    ql = 600 if 540 <= ql <= 600 else ql
    gmin = ql*4//60 + 5*max(0, nper-4)
    # possessions: counted from the play-by-play by the lineup build where there is one, else the box-score estimate
    poss = [sum(x[5][0] for x in stints), sum(x[5][1] for x in stints)] if stints else [0, 0]
    if min(poss) <= 0:
        poss = [t['fga'] - t['oreb'] + t['tov'] + 0.44*t['fta'] for t in T]
    if min(poss) <= 0:
        raise ValueError('no possessions')
    for sd, t in enumerate(T):
        o = T[1-sd]
        t['poss'] = poss[sd]
        t['ortg'] = 100*t['pts']/poss[sd]; t['drtg'] = 100*o['pts']/poss[1-sd]
        t['efg'] = 100*(t['fgm']+0.5*t['tpm'])/t['fga'] if t['fga'] else 0
        t['ts'] = 100*t['pts']/(2*(t['fga']+0.44*t['fta'])) if t['fga'] or t['fta'] else 0
        t['tovp'] = 100*t['tov']/poss[sd]
        t['orbp'] = 100*t['oreb']/(t['oreb']+o['dreb']) if t['oreb']+o['dreb'] else 0
        t['ftr'] = t['fta']/t['fga'] if t['fga'] else 0
        t['tpar'] = 100*t['tpa']/t['fga'] if t['fga'] else 0
        t['fgp'] = 100*t['fgm']/t['fga'] if t['fga'] else 0
        t['tpp'] = 100*t['tpm']/t['tpa'] if t['tpa'] else 0
        t['ftp'] = 100*t['ftm']/t['fta'] if t['fta'] else 0
        t['asto'] = t['ast']/t['tov'] if t['tov'] else t['ast']
    pace = (poss[0]+poss[1])/2*40/gmin
    # starters (the first five on court) and the bench
    starters = set(stints[0][2] + stints[0][3]) if stints else set()
    for sd, t in enumerate(T):
        t['bench'] = sum(p['pts'] for p in P if p['side'] == sd and p['pid'] not in starters) if starters else None
    # ---- play-by-play: scoring timeline, runs, leads
    num2pid = {(p['side'], str(p['num'])): p['pid'] for p in P}
    norm = lambda n: ' '.join(sorted(re.sub(r'[^a-z0-9 ]+', ' ', str(n).lower()).split()))
    name2pid = {(p['side'], norm(p['name'])): p['pid'] for p in P}
    def who_is(sd, num, nm):      # by shirt number, else by name (a number the feed leaves blank)
        return num2pid.get((sd, str(num).strip())) if str(num).strip() else None or name2pid.get((sd, norm(nm)))
    ev = []; last = (0, 0)
    for r in pbp:
        per, sd, c, sc, num, nm, act = r[:7]
        if not sc: continue
        m = re.match(r'^(\d+)-(\d+)$', sc)
        if not m: continue
        h, a = int(m.group(1)), int(m.group(2))
        if (h, a) == last: continue
        p = int(per); L_ = ql if p <= 4 else 300
        cs = clk(c)
        el = (p-1)*ql + ((L_ - cs) if cs is not None else 0) if p <= 4 else 4*ql + (p-5)*300 + (L_ - (cs or 0))
        who = 0 if h > last[0] else 1
        ev.append(dict(t=el, per=p, h=h, a=a, side=who, pts=(h-last[0]) if who == 0 else (a-last[1]), pid=(num2pid.get((who, str(num).strip())) if str(num).strip() else None) or name2pid.get((who, norm(nm))), name=nm, clock=c))
        last = (h, a)
    flow = [[0, 0]] + [[e['t'], e['h']-e['a']] for e in ev]
    qpts = collections.defaultdict(lambda: [0]*nper)          # a player's points in each period
    for e in ev:
        if e['pid'] and e['per'] <= nper: qpts[e['pid']][e['per']-1] += e['pts']
    lead_changes = 0; ties = 0; prev = 0; big = [0, 0]; lead_t = [0, 0, 0]; pt = 0; pm = 0
    for e in ev:
        mg = e['h']-e['a']
        if mg == 0: ties += 1
        if prev != 0 and mg != 0 and (mg > 0) != (prev > 0): lead_changes += 1
        if prev == 0 and mg != 0 and pm != 0 and (mg > 0) != (pm > 0): lead_changes += 1
        if mg != 0: pm = mg
        big[0] = max(big[0], mg); big[1] = max(big[1], -mg)
        lead_t[0 if prev > 0 else 1 if prev < 0 else 2] += e['t'] - pt; pt = e['t']; prev = mg
    lead_t[0 if prev > 0 else 1 if prev < 0 else 2] += gmin*60 - pt
    runs = []; cur = None
    for e in ev:
        if cur and cur['side'] == e['side']:
            cur['pts'] += e['pts']; cur['t1'] = e['t']; cur['end'] = (e['h'], e['a']); cur['by'][e['pid']] = cur['by'].get(e['pid'], 0) + e['pts']
        else:
            if cur: runs.append(cur)
            cur = dict(side=e['side'], pts=e['pts'], t0=e['t'], t1=e['t'], start=(e['h']-(e['pts'] if e['side'] == 0 else 0), e['a']-(e['pts'] if e['side'] == 1 else 0)), end=(e['h'], e['a']), by={e['pid']: e['pts']})
    if cur: runs.append(cur)
    # a team run: unanswered points, joining scores the other side answered with nothing (consecutive same-side events)
    team_runs = sorted([r for r in runs if r['pts'] >= 8], key=lambda r: r['t0'])
    biggest = max(runs, key=lambda r: (r['pts'], -r['t0'])) if runs else None
    # hot stretches: the most points a player scored inside any four minutes of game time (7 or more)
    byp = collections.defaultdict(list)
    for e in ev:
        if e['pid']: byp[e['pid']].append(e)
    solo = []
    for pid, L2 in byp.items():
        best = None
        for i in range(len(L2)):
            tot = 0
            for j in range(i, len(L2)):
                if L2[j]['t'] - L2[i]['t'] > 240: break
                tot += L2[j]['pts']
                if not best or tot > best['pts']: best = dict(pid=pid, side=L2[i]['side'], pts=tot, t0=L2[i]['t'], t1=L2[j]['t'])
        if best and best['pts'] >= 6: solo.append(best)
    solo.sort(key=lambda x: (-x['pts'], x['t0'])); solo = sorted(solo[:6], key=lambda x: x['t0'])
    qm = [[p[0], p[1]] for p in periods] if periods else []
    # ---- shots
    zones = [collections.defaultdict(lambda: [0, 0]) for _ in (0, 1)]; pts_paint = [0, 0]; S = []
    if shots:
        pal = s.get('palias', {})
        team_side = {}
        for per, pid, tn, top, left, three, typ, made in shots['s']:
            pid = pal.get(pid, pid)
            p = next((q for q in P if q['pid'] == pid), None)
            if p: team_side[tn] = p['side']
        for per, pid, tn, top, left, three, typ, made in shots['s']:
            pid = pal.get(pid, pid)
            sd = team_side.get(tn)
            if sd is None: continue
            x, y = place(float(top), float(left)); z = zone5(x, y, three)
            zones[sd][z][0] += 1; zones[sd][z][1] += made
            if made and not three and z in ('rim', 'paint'): pts_paint[sd] += 2
            S.append([round(x, 2), round(y, 2), made, three, sd, pid])
    for sd, t in enumerate(T):
        t['paint'] = pts_paint[sd] if shots else None
    # ---- players: efficiency, usage, on-court net rating
    on = collections.defaultdict(lambda: [0, 0, 0.0, 0.0, 0])   # pts for, against, poss for, poss against, seconds
    for per, sec, hf, af, pts, ps in (stints or []):
        for sd, five in ((0, hf), (1, af)):
            for pid in five:
                o = on[pid]; o[0] += pts[sd]; o[1] += pts[1-sd]; o[2] += ps[sd]; o[3] += ps[1-sd]; o[4] += sec
    for p in P:
        t = T[p['side']]; mp = p['min']
        p['reb'] = p['oreb']+p['dreb']
        p['ts'] = 100*p['pts']/(2*(p['fga']+0.44*p['fta'])) if p['fga']+p['fta'] else None
        p['usg'] = 100*((p['fga']+0.44*p['fta']+p['tov'])*(t['min']/5))/(mp*(t['fga']+0.44*t['fta']+t['tov'])) if mp else None
        den = (mp/(t['min']/5))*t['fgm'] - p['fgm'] if mp else 0
        p['astp'] = 100*p['ast']/den if den > 0 else None
        p['tovp'] = 100*p['tov']/(p['fga']+0.44*p['fta']+p['tov']) if p['fga']+p['fta']+p['tov'] else None
        o = on.get(p['pid'])
        p['net'] = 100*(o[0]/o[2] - o[1]/o[3]) if o and o[2] > 3 and o[3] > 3 else None
        p['start'] = p['pid'] in starters
    # lineups
    lu = collections.defaultdict(lambda: dict(sec=0, pf=0, pa=0, pof=0.0, poa=0.0))
    for per, sec, hf, af, pts, ps in (stints or []):
        for sd, five in ((0, hf), (1, af)):
            k = (sd, tuple(sorted(five))); x = lu[k]
            x['sec'] += sec; x['pf'] += pts[sd]; x['pa'] += pts[1-sd]; x['pof'] += ps[sd]; x['poa'] += ps[1-sd]
    lineups = []
    for (sd, five), x in lu.items():
        if x['sec'] < 120: continue
        lineups.append(dict(side=sd, five=list(five), min=x['sec']/60, pm=x['pf']-x['pa'], pf=x['pf'], pa=x['pa'],
                            net=100*(x['pf']/x['pof'] - x['pa']/x['poa']) if x['pof'] > 0 and x['poa'] > 0 else None))
    oc = OPEN
    ph = (C.get('phase') or {}).get(mid)
    stage = 'Final' if isinstance(oc.get(C['id']), dict) and oc[C['id']].get('final') == mid else (ph.get('r') if ph else '')
    return dict(mid=mid, cid=C['id'], stage=stage, champ=C.get('champ'), gender=C.get('gender'), series=C.get('series'), comp=C.get('label') or C['name'], year=C['year'], date=G['date'], time=G.get('time'), venue=G.get('venue'),
                h=G['h'], a=G['a'], hs=G['hs'], as_=G['as'], periods=qm, gmin=gmin, ql=ql, pace=pace,
                T=T, P=P, flow=flow, lead_changes=lead_changes, ties=ties, big=big, lead_t=lead_t,
                runs=[dict(side=r['side'], pts=r['pts'], t0=r['t0'], t1=r['t1'], start=r['start'], end=r['end'], top=max(r['by'].items(), key=lambda kv: kv[1])[0], topPts=max(r['by'].values())) for r in team_runs],
                biggest=dict(side=biggest['side'], pts=biggest['pts'], t0=biggest['t0'], t1=biggest['t1'], start=biggest['start'], end=biggest['end']) if biggest else None,
                solo=solo, qpts=dict(qpts), zones=[{k: v for k, v in z.items()} for z in zones], shots=S, lineups=lineups)


def compact(r):
    """Rounded, and the player names left to the page (it has every person); a line the
    source names no person for keeps its printed name."""
    rd = lambda v: round(v, 2) if isinstance(v, float) else v
    T = [{k: rd(v) for k, v in t.items()} for t in r['T']]
    P = []
    for p in r['P']:
        q = {k: rd(v) for k, v in p.items() if k not in ('name',) and v is not None}
        if not p['pid']: q['name'] = p['name']
        P.append(q)
    out = dict(r, T=T, P=P, pace=round(r['pace'], 1), lead_t=[round(x) for x in r['lead_t']],
               lineups=[dict(l, min=round(l['min'], 2), net=None if l['net'] is None else round(l['net'], 1)) for l in r['lineups']])
    out['as'] = out.pop('as_')
    return out


def main():
    global OPEN
    s = json.load(open(os.path.join(D, 'site_data.json')))
    stints = json.load(open(os.path.join(D, 'stints.json'))) if os.path.exists(os.path.join(D, 'stints.json')) else {}
    periods = json.load(open(os.path.join(D, 'pbp_periods.json'))) if os.path.exists(os.path.join(D, 'pbp_periods.json')) else {}
    op = os.path.join(D, 'open_comps.json')
    OPEN = json.load(open(op)) if os.path.exists(op) else {}
    games = {g['mid']: g for c in s['comps'] for g in c['games']}
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    n = skipped = 0
    for f in sorted(os.listdir(os.path.join(D, 'pbp_raw'))):
        mid = f[:-5]
        g = games.get(mid)
        if not g or g.get('st') != 'COMPLETE' or mid not in s['boxes']:
            skipped += 1
            continue
        pbp = json.load(open(os.path.join(D, 'pbp_raw', f)))
        shp = os.path.join(D, 'shots', mid + '.json')
        sh = json.load(open(shp)) if os.path.exists(shp) else None
        try:
            r = build(mid, s, pbp, sh if sh and sh.get('s') else None, stints.get(mid), periods.get(mid))
        except Exception as e:              # one odd game never stops the build: it just has no report
            print('postgame %s: %s' % (mid, e))
            skipped += 1
            continue
        with open(os.path.join(OUT, mid + '.js'), 'w') as fo:
            fo.write('PG_PUT(%s,%s);' % (json.dumps(mid), json.dumps(compact(r), ensure_ascii=False, separators=(',', ':'))))
        n += 1
    print('postgame: %d reports, %d games left out' % (n, skipped))


if __name__ == '__main__':
    main()
