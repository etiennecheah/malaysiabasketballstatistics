"""Bring one competition up to date from the source.

The same rules as the hand-run syncs (sync_all.py, sync_sbl_oct01.py; written up in
claude/competition-sync-method.md), made repeatable:

  fixtures     the schedule page, every fixture
  box scores   games newly completed (or whose score the source has since changed)
  play-by-play the same games; kept only when the final score appears in it
  standings    every phase and every pool
  leaders      every category, including its featured #1
  season lines /person/<pid>/statistics for the players of the new games (or everyone)

Nothing is written unless every check passes (Gate). The caller then rebuilds the
site and only publishes if the build and the page check pass too.
"""
import concurrent.futures as cf
import datetime, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import source                       # noqa: E402
import livestats                    # noqa: E402
from store import Store, Gate, tipoff, done, kept, D, MYT   # noqa: E402,F401
from statmap import to_line, SRC    # noqa: E402

WORKERS = 4                         # player pages fetched at once, at most


# ---- box scores ---------------------------------------------------------------------
CI = dict(num=0, name=1, min=2, pts=3, fgm=4, fga=5, twopm=7, twopa=8, tpm=10, tpa=11,
          ftm=13, fta=14, oreb=16, dreb=17, ast=18, pf=19, tov=20, stl=21, blk=22, pm=23, eff=24)


SHOTS_PER_RUN = 60  # shot chart pages read in one sync of a competition, at most
SUM_SLACK = 3      # points the source's own player rows may miss by when its totals row agrees with the scoreboard


def box_lines(b, f, warn=None):
    """A parsed box score -> the stored rows, or a Gate if it does not add up.

    The source sometimes credits a point or two to nobody: every player row is there and its
    totals row matches the scoreboard, but the players' points add to one less (2018 U17 Boys,
    886163: Negeri Sembilan 67 v 68). That is the source's own slip, not a page we misread, so
    it is kept as published and reported through `warn`; a bigger gap still stops the sync."""
    mid = f[0]
    lines = []
    for side, team, score in (('home', f[4], f[5]), ('away', f[6], f[7])):
        t = b[side]
        if not t['totals'] or len(t['totals']) < 4:
            raise Gate('%s: box score has no totals row' % mid)
        if t['totals'][3] != score:
            raise Gate('%s: box total %s is not the scoreboard\'s %s (%s)' % (mid, t['totals'][3], score, team))
        if len(t['players']) < 5:
            raise Gate('%s: only %d players listed for %s' % (mid, len(t['players']), team))
        pts = sum(int(p['c'][3] or 0) for p in t['players'] if (p['c'][3] or '0').lstrip('-').isdigit())
        if str(pts) != score:
            msg = '%s: %s players\' points add to %d, scoreboard says %s' % (mid, team, pts, score)
            if warn and score.isdigit() and abs(pts - int(score)) <= SUM_SLACK:
                warn(msg + ' (the source\'s totals row agrees with the scoreboard: kept as published)')
            else:
                raise Gate(msg)
        for pl in t['players']:
            cc = pl['c']
            line = {'pid': pl['pid'] or '', 'team': team, 'name': cc[1]}
            for k, i in CI.items():
                if k != 'name':
                    line[k] = cc[i].strip()
            lines.append(line)
    return lines


def pbp_ok(ev, f):
    return bool(ev) and any(e[3] == f[5] + '-' + f[7] for e in ev)


# ---- standings (sync_all.py, section 3) ------------------------------------------------
PHASE_RANK = [(r'prelim|normal|regular|group|pool|division|first|qualif', 0),
              (r'second|playoff', 1), (r'final|bracket|class', 2)]


def phase_rank(p):
    for pat, rk in PHASE_RANK:
        if re.search(pat, p or '', re.I):
            return rk
    return 0


def canon_cell(cell, known):
    """The source sometimes shortens a team in the standings ('HarimauHAR' for
    Putrajaya Harimau). Put the registered name back so the row links to its team."""
    if any(cell.startswith(k) for k in known):
        return cell
    for k in known:
        words = k.split()
        for i in range(1, len(words)):
            tail = ' '.join(words[i:])
            rest = cell[len(tail):]
            if cell.startswith(tail) and re.fullmatch(r'[A-Z0-9.]{0,6}', rest):
                return k + rest
    return cell


def num(s):
    try:
        return int(s)
    except (TypeError, ValueError):
        return 0


def stand_tables(raw, known, nteams):
    tabs = [t for t in raw['tables'] if t.get('rows')]
    order = {p: i for i, p in enumerate(raw['phases'])}
    tabs.sort(key=lambda t: (phase_rank(t['phase']), order.get(t['phase'], 0), num(t['pool'])))
    pools_in_phase = {}
    for t in tabs:
        pools_in_phase[t['phase']] = pools_in_phase.get(t['phase'], 0) + 1
    multi = len(tabs) > 1
    new = []
    for t in tabs:
        rows = t['rows']
        if any(len(r) < 10 for r in rows):
            raise Gate('standings row with %d columns' % min(len(r) for r in rows))
        padded = pools_in_phase[t['phase']] > 1 and len(rows) >= max(4, int(0.9 * nteams))
        if padded:
            rows = [r for r in rows if num(r[3]) > 0]
        if not rows:
            continue
        if padded:
            pts = [num(r[9]) for r in rows]
            if pts != sorted(pts, reverse=True):
                rows = sorted(rows, key=lambda r: (-num(r[9]), -num(r[4]), -num(r[8])))
        out = []
        for i, r in enumerate(rows):
            gp, w = num(r[3]), num(r[4])
            pct = str(round(w / gp * 100)) if gp else '0'
            pos = str(i + 1) if padded else r[0]
            out.append([pos, '', canon_cell(r[2], known), r[3], r[4], r[5], r[6], r[7], r[8], pct, r[9]])
        pool = t['poolName'] or ''
        if pool and re.fullmatch(r'[A-Z]{1,3}', pool):
            pool = 'Group ' + pool
        if multi:
            title = (t['phase'] + ' — ' + pool) if (t['phase'] and pool) else (pool or t['phase'] or 'Standings')
        else:
            title = t['phase'] or pool or 'Standings'
        new.append([title, ['Position', '', 'Team', 'GP', 'W', 'L', 'For', 'Agst', 'GD', '%won', 'Pts'], out])
    return new


def canon_team(team, known):
    """A season line's team as the competition registers it ('Harimau' -> 'Putrajaya Harimau')."""
    if team in known:
        return team
    hits = [k for k in known if k.endswith(' ' + team) or k.lower() == team.lower()]
    return hits[0] if len(hits) == 1 else team


# ---- one competition -------------------------------------------------------------------
def flip_name(n):
    """'Surname, Given[, English]' as the roster pages write it -> 'Given[, English] Surname',
    the order the box scores and the rest of the site use."""
    if ',' not in n:
        return n.strip()
    sur, rest = n.split(',', 1)
    return rest.strip() + ' ' + sur.strip()


def sync_rosters(st, c, B, fetch, note):
    """Teams page and every team's roster page. A team the source has added joins the
    competition; a roster page that comes back empty keeps the one we hold."""
    T = source.teams(fetch(B + 'teams'))
    if not T:
        note('the teams page lists no teams: ours kept')
        return
    reg, preg = st.bb['teamReg'], st.bb['personReg']
    for tid, name in T:
        reg.setdefault(tid, name)
        if tid not in c['teams']:
            c['teams'].append(tid)
    held = {tid: rows for tid, rows in c['roster']}
    got = 0
    for tid, name in T:
        try:
            rows = source.roster(fetch(B + 'team/' + tid + '/roster'))
        except source.SourceError:
            rows = []
        if not rows:
            continue
        got += 1
        held[tid] = [[r[0]] + r[2:9] for r in rows]
        for r in rows:
            preg.setdefault(r[0], flip_name(r[1]))
    c['roster'] = [[tid, held[tid]] for tid in c['teams'] if tid in held]
    if got < len(T):
        note('rosters published for %d of %d teams' % (got, len(T)))


# ---- the live feed as a second source for a finished game (livestats.py) -----------------
LS_FROM = 60 * 60            # a game is looked for on the live feed from an hour after tip-off
LS_UNTIL = 7 * 86400         # ... for a week


def _key(n):
    return frozenset(w for w in re.split(r'[\s,]+', (n or '').upper()) if w and w not in ('A/L', 'A/P', 'BIN', 'BINTI'))


def ls_due(st, g, now):
    """A fixture we do not hold as final, an hour or more after its tip-off."""
    t = tipoff(g[2])
    return g[1] != 'COMPLETE' and g[0] not in st.not_played and t is not None and t + LS_FROM <= now <= t + LS_UNTIL


def ls_pid_finder(st, c):
    """team name, shirt number, name -> the person id the database knows him by, or ''.
    In order: his line in this competition's box scores from the source, the competition's
    roster page (shirt number, with at least two name words agreeing), a name that only one
    person in the database has."""
    import merges
    pidmap, _ = merges.load(D)
    reg, treg = st.bb['personReg'], st.bb['teamReg']
    by_name, by_num, glob = {}, {}, {}
    for g in c['games']:
        b = st.boxes.get(g[0])
        if b and b.get('src') != 'ls':
            for p in b['p']:
                if p.get('pid'):
                    by_name[(p['team'].lower(), _key(p['name']))] = p['pid']
    for tid, rows in c['roster']:
        for r in rows:
            if r and r[0]:
                by_num[((treg.get(tid) or '').lower(), str(r[1]).lstrip('0') or '0')] = r[0]
    for pid, nm in reg.items():
        glob.setdefault(_key(nm), set()).add(pidmap.get(pid, pid))

    def find(team, no, name):
        tl, k = (team or '').lower(), _key(name)
        if (tl, k) in by_name:
            return by_name[(tl, k)]
        r = by_num.get((tl, str(no).lstrip('0') or '0'))
        if r and len(_key(reg.get(r, '')) & k) >= 2:
            return r
        g = glob.get(k, set())
        return next(iter(g)) if len(g) == 1 else ''
    return find


SHOTS_BATCH = 240   # shot chart pages one catch-up pass reads across all the competitions waiting, at most
SHOT_WORKERS = 3    # chart pages fetched at once in a catch-up pass


def shots_only(st, cid, limit=SHOTS_BATCH, fetch=None, log=print, now=None):
    """The shot charts of games already stored, for a competition put on data/shot_comps.json after
    its games were played (the catch-up pass in run.py). Reads the chart pages and nothing else:
    no schedule page, no fixtures, box scores, standings or lines, so the curated data of an old
    competition cannot move. Each chart is checked against the stored box score: the attempts it
    draws for each team should be the box score's FGA. A chart that is plainly another game, or
    half drawn, is not kept (noted, and read again on a later pass); a small gap is kept and noted."""
    now = now or time.time()
    fetch = fetch or source.get
    res = dict(changed=False, new_games=[], box_missing=[], pbp_missing=[], pbp_found=[], shots_found=[],
               lines_failed=[], notes=[], shots_bad=[])

    def note(msg):
        res['notes'].append(msg)
        log(msg)

    c = st.comp(cid)
    games = {g[0]: g for g in c['games']}
    todo = [m for m, g in games.items() if g[1] == 'COMPLETE' and m in st.boxes and m not in st.not_played
            and not st.has_shots(m)][:max(0, limit)]
    B = source.BASE + cid + '/'

    def one(m):
        try:
            return m, source.shots(fetch(B + 'match/' + m + '/shotchart')), None
        except source.SourceError as e:
            return m, None, e

    with cf.ThreadPoolExecutor(max_workers=SHOT_WORKERS) as ex:
        got = list(ex.map(one, todo))
    for m, rows, e in got:
        if e is not None:
            if getattr(e, 'status', None) == 404:        # the source has no chart page for this game: final
                st.shots_new[m] = {'cid': cid, 's': []}
                res['shots_found'].append(m)
                note('%s: no shot chart page (404): stored as empty' % m)
            else:
                note('%s: shot chart page failed (%s): tried again later' % (m, getattr(e, 'status', '') or 'error'))
            continue
        if not rows and now - (tipoff(games[m][2]) or 0) < 2 * 86400:
            continue                                        # a chart may still be drawn in the first days
        if rows:
            fga = {}
            for p in st.boxes[m].get('p', []):
                try:
                    fga[p['team']] = fga.get(p['team'], 0) + int(p.get('fga') or 0)
                except (TypeError, ValueError):
                    pass
            box_fga, drawn = sum(fga.values()), len(rows)
            if box_fga and abs(drawn - box_fga) > max(6, 0.25 * box_fga):
                res['shots_bad'].append(m)
                note('%s: shot chart draws %d attempts, the box score has %d FGA: not kept' % (m, drawn, box_fga))
                continue
            if box_fga and drawn != box_fga:
                note('%s: shot chart draws %d attempts, the box score has %d FGA' % (m, drawn, box_fga))
        st.shots_new[m] = {'cid': cid, 's': rows}
        res['shots_found'].append(m)
    res['read'] = len(todo)
    res['changed'] = bool(res['shots_found'])
    return res


def sync_comp(st, cid, lines='new', force=False, retry_box=(), retry_pbp=(), extra_pids=(), fetch=source.get, log=print, now=None):
    """Returns a dict: changed, new_games, box_missing, pbp_missing, pbp_found, notes.

    lines   'new'  season lines of the players in the newly completed games
            'all'  every player of the competition (the daily pass)
    force   read standings and leaders even when no game has finished
    retry_* match ids whose box score / play-by-play was not published last time
    extra_pids  players whose season line could not be read last time
    """
    c = st.comp(cid)
    B = source.BASE + cid + '/'
    res = dict(changed=False, new_games=[], box_missing=[], pbp_missing=[], pbp_found=[], shots_found=[], lines_failed=[], notes=[])
    note = lambda s: (res['notes'].append(s), log('   ' + s))

    now = time.time() if now is None else now
    # ---- fixtures
    try:
        fx = source.fixtures(fetch(B + 'schedule'))
        sched = True
    except source.SourceError:
        # the schedule page failing must not hide a game that has finished: its result, box score
        # and play-by-play are on the live feed. Without such a game the failure stands (retried)
        if not any(ls_due(st, g, now) for g in c['games']):
            raise
        fx = [list(g[:8]) for g in c['games']]
        sched = False
        note('the schedule page failed: games that should be over were looked for on the live feed')
    ours = {g[0]: g for g in c['games']}
    theirs = {g[0]: g for g in fx}
    if not fx:
        raise Gate('the schedule page lists no fixtures')
    # a game we hold as final from the live feed while the schedule page has not caught up yet
    for i, g in enumerate(fx):
        o = ours.get(g[0])
        if o and o[1] == 'COMPLETE' and not done(g) and (st.boxes.get(g[0]) or {}).get('src') == 'ls':
            fx[i] = theirs[g[0]] = list(o[:8])
    gone = [m for m in ours if m not in theirs]
    if gone:
        raise Gate('fixtures missing from the source page: ' + ', '.join(gone[:6]))
    undone = [m for m in ours if ours[m][1] == 'COMPLETE' and m not in st.not_played and not done(theirs[m])]
    if undone:
        raise Gate('games we hold as final are no longer final on the source: ' + ', '.join(undone[:6]))
    # a game the schedule page does not show as final (cached for ten minutes, or failing) an hour
    # or more after tip-off: the live feed says whether it is over, and with what score
    ls = {}
    for i, g in enumerate(fx):
        if done(g) or not ls_due(st, ours.get(g[0]) or ['', 'SCHEDULED'] + list(g[2:]), now):
            continue
        d = livestats.load(g[0], fetch)
        if not d or not livestats.ended(d):
            continue
        s1, s2 = livestats.score(d)
        t1 = (d['tm']['1'].get('name') or '').strip().lower()
        if t1 and t1 == (g[6] or '').strip().lower() and t1 != (g[4] or '').strip().lower():
            s1, s2 = s2, s1
        fx[i] = theirs[g[0]] = [g[0], 'COMPLETE', g[2], g[3], g[4], str(s1), g[6], str(s2)]
        ls[g[0]] = d
        note('%s: final %s-%s read from the live feed (the schedule page %s)'
             % (g[0], s1, s2, 'does not show it as final yet' if sched else 'failed'))
    odd = sorted({g[1] for g in fx if g[1] not in ('COMPLETE', 'SCHEDULED', 'IN_PROGRESS')} - {None})
    if odd:
        note('unfamiliar fixture status on the source: ' + ', '.join(odd))

    need_box = []
    for m, g in theirs.items():
        if not done(g) or m in st.not_played:
            continue
        o = ours.get(m)
        if o is None or o[1] != 'COMPLETE':
            need_box.append(m)                       # newly finished
        elif (o[5], o[7]) != (g[5], g[7]):
            need_box.append(m)                       # the source changed the score
            note('%s: score changed on the source %s-%s -> %s-%s' % (m, o[5], o[7], g[5], g[7]))
        elif m in retry_box and (m not in st.boxes or st.boxes[m].get('src') == 'ls'):
            need_box.append(m)                       # missing, or held from the live feed until the source has it
    need_pbp = list(need_box) + [m for m in retry_pbp if m in theirs and done(theirs[m]) and m not in need_box]

    out = []
    for g in fx:
        o = ours.get(g[0])
        k = kept(g)
        if g[0] in st.not_played and o:              # a fixture the source never finished stays as recorded
            out.append(o)
            continue
        k[3] = k[3] or (o[3] if o else '')
        out.append(k + [o[8] if o else 0])
    fx_changed = [g[0] for g in out if (ours.get(g[0]) or [None])[:8] != g[:8]]

    # shot charts, for the competitions listed in data/shot_comps.json: every finished game whose
    # chart is not stored yet (the first runs catch up on the games played before, a few at a time)
    need_shots = []
    if cid in st.shot_comps:
        need_shots = [m for m, g in theirs.items() if done(g) and m not in st.not_played and not st.has_shots(m)
                      and (m in need_box or m in st.boxes)][:SHOTS_PER_RUN]

    if not need_box and not need_pbp and not need_shots and not fx_changed and not force and lines != 'all' and not extra_pids:
        return res

    # ---- box scores and play-by-play of the games that need them
    by_mid = {g[0]: g for g in out}
    new_pids = set()
    find_pid = None

    def from_feed(m, f, why):
        # the box score from the live feed, held until the source's own box score can be read
        nonlocal find_pid
        d = ls.get(m) or livestats.load(m, fetch)
        if not d or not livestats.ended(d):
            return False
        ls[m] = d
        find_pid = find_pid or ls_pid_finder(st, c)
        try:
            rows = livestats.box_rows(d, f, find_pid)
        except ValueError as e:
            note(str(e))
            return False
        held = (st.boxes.get(m) or {}).get('src') == 'ls'
        st.boxes[m] = {'p': rows, 'src': 'ls'}
        by_mid[m][8] = 1
        if not held:
            res['new_games'].append(m)
        res['box_missing'].append(m)               # the source's own box score is still read later
        if not held:
            note('%s: box score taken from the live feed (%s)' % (m, why))
        return True

    for m in need_box:
        f = theirs[m]
        if m in ls and not sched:
            from_feed(m, f, 'the schedule page failed')
            continue
        try:
            b = source.box(fetch(B + 'match/' + m + '/boxscore'))
        except source.SourceError as e:
            if from_feed(m, f, 'the box score page failed'):
                continue
            # one page the source failed to serve (it answers 500 under load, most of all for
            # old games rendered cold) costs that game only: it is retried with the missing ones
            res['box_missing'].append(m)
            note('%s: box score page failed (%s): tried again later' % (m, getattr(e, 'status', '') or 'error'))
            continue
        if b is None or not b['home']['players'] or not b['away']['players']:
            if from_feed(m, f, 'the source has not published its box score'):
                continue
            res['box_missing'].append(m)
            note('%s: finished %s-%s, box score not published yet' % (m, f[5], f[7]))
            continue
        try:
            rows = box_lines(b, f, warn=note)
        except Gate as e:
            if from_feed(m, f, 'the source\'s box score is not complete: %s' % str(e).split(': ', 1)[-1]):
                continue
            # a box score that does not add up yet (the source still filling it in: two players listed
            # for a team, totals behind the scoreboard) costs that game only. Its result stands from the
            # fixture list and the box is read again with the missing ones, instead of the whole
            # competition, and every other finished game, waiting for it
            res['box_missing'].append(m)
            note('%s: box score not complete yet (%s): tried again later' % (m, str(e).split(': ', 1)[-1]))
            continue
        was_feed = (st.boxes.get(m) or {}).get('src') == 'ls'
        st.boxes[m] = {'p': rows}
        by_mid[m][8] = 1
        res['new_games'].append(m)
        if was_feed:
            note('%s: the source\'s box score replaces the one from the live feed' % m)
        for r in rows:
            if r['pid']:
                new_pids.add(r['pid'])
                if r['pid'] not in st.bb['personReg']:
                    st.bb['personReg'][r['pid']] = r['name']
    def pbp_from_feed(m, f):
        d = ls.get(m) or livestats.load(m, fetch)
        if not d or not livestats.ended(d):
            return False
        ls[m] = d
        ev = livestats.events(d)
        if not pbp_ok(ev, f):
            return False
        st.pbp_new[m] = ev
        res['pbp_found'].append(m)
        return True

    for m in need_pbp:
        f = theirs[m]
        if m in ls and not sched and pbp_from_feed(m, f):
            continue
        try:
            ev = source.pbp(fetch(B + 'match/' + m + '/playbyplay'))
        except source.SourceError as e:
            if pbp_from_feed(m, f):
                continue
            res['pbp_missing'].append(m)
            note('%s: play-by-play page failed (%s): tried again later' % (m, getattr(e, 'status', '') or 'error'))
            continue
        if pbp_ok(ev, f):
            st.pbp_new[m] = ev
            res['pbp_found'].append(m)
        elif pbp_from_feed(m, f):
            pass
        else:
            res['pbp_missing'].append(m)
            note('%s: play-by-play %s' % (m, 'not published yet' if not ev else 'does not reach the final score yet'))
    for m in need_shots:
        if m not in st.boxes:                        # its box score did not come in this time: its chart waits too
            continue
        try:
            rows = source.shots(fetch(B + 'match/' + m + '/shotchart'))
        except source.SourceError as e:
            note('%s: shot chart page failed (%s): tried again later' % (m, getattr(e, 'status', '') or 'error'))
            continue
        # an empty or half-drawn chart may still be filled in after the game (its attempts should be
        # the box score's FGA); two days on, it is taken as it is
        young = now - (tipoff(theirs[m][2]) or now) < 2 * 86400
        box_fga = sum(int(p.get('fga') or 0) for p in st.boxes[m].get('p', []) if str(p.get('fga') or '0').isdigit())
        if young and (not rows or (box_fga and abs(len(rows) - box_fga) > max(6, 0.25 * box_fga))):
            continue
        if rows and box_fga and len(rows) != box_fga:
            note('%s: shot chart draws %d attempts, the box score has %d FGA' % (m, len(rows), box_fga))
        st.shots_new[m] = {'cid': cid, 's': rows}
        res['shots_found'].append(m)
    for g in out:
        if g[1] == 'COMPLETE' and g[0] in st.boxes:
            g[8] = 1
    before = json.dumps([c['games'], c['stand'], c['lead'], c['players'], c['teams'], c['roster']], sort_keys=True)
    c['games'] = out

    # ---- teams and rosters, on the daily pass of a competition still being played (a
    # roster is often published only days before tip-off, and squads change during it)
    if force and any(g[1] != 'COMPLETE' and g[0] not in st.not_played for g in out):
        sync_rosters(st, c, B, fetch, note)

    # ---- standings, every phase and pool
    if need_box or force:
        known = [st.bb['teamReg'][t] for t in c['teams'] if t in st.bb['teamReg']]
        try:
            new = stand_tables(source.standings(cid, fetch), known, len(c['teams']))
        except source.SourceError:
            new = False
            note('the standings page failed: ours kept, read again with the next game')
        if new:
            c['stand'] = new
        elif new is not False and c['stand']:
            note('the source shows no standings table now: ours kept')

        # ---- leaders, with each category's #1
        try:
            L = source.leaders(fetch(B + 'leaders'))
        except source.SourceError:
            L = None
            note('the leaders page failed: ours kept')
        lead = [[b['cat'], [[r['pid'], r['v']] for r in b['rows'] if r.get('pid')]] for b in L or [] if b['rows']]
        if lead and len(lead) * 2 >= len(c['lead']):
            c['lead'] = lead
        elif L is not None and c['lead']:
            note('leaders page came back short (%d of %d categories): ours kept' % (len(lead), len(c['lead'])))

    # ---- published season lines
    lines_changed = 0
    if c.get('nolines'):
        # the source publishes no season lines for this competition (2022 MATRIX U17 Girls):
        # the build makes them from the box scores, so there is nothing to read or retry
        pids = set()
    elif lines == 'all':
        pids = set(c['players']) | {p['pid'] for g in out if g[0] in st.boxes for p in st.boxes[g[0]]['p'] if p.get('pid')}
    else:
        pids = set(new_pids) | set(extra_pids)
    if pids:
        want = c['name'].strip().lower()
        known = [st.bb['teamReg'][t] for t in c['teams'] if t in st.bb['teamReg']]

        def one(pid):
            return pid, source.pstats(fetch(B + 'person/' + pid + '/statistics'))
        # who took the floor in the games just read (a 0:00 line is a player who was only listed)
        played = {p['pid'] for m in res['new_games'] for p in st.boxes[m]['p']
                  if p.get('pid') and p.get('min') not in ('', '0:00', '00:00', None)}
        written, failed, absent, gone = set(), [], [], []
        with cf.ThreadPoolExecutor(WORKERS) as ex:
            futs = {ex.submit(one, p): p for p in sorted(pids)}
            for fu in cf.as_completed(futs):
                pid = futs[fu]
                try:
                    _, (heads, rows) = fu.result()
                except source.SourceError as e:
                    # The source answers 500 (or 404) for the statistics page of a player it has no
                    # line for - and, on a bad day, for some it had one for last week. Nothing is
                    # published for him now: whatever we hold is kept. It is a failure only for a
                    # player of the game just read, whose line has to move.
                    if getattr(e, 'status', None) in (404, 500) and pid not in played:
                        absent.append(pid)
                    else:
                        failed.append(pid)
                    continue
                if heads is None or not rows:
                    # no statistics table, or an empty one (only "Competition | Team")
                    (failed if pid in played else absent).append(pid)
                    continue
                miss = [k for k in list(SRC) + ['Team', 'Competition'] if k not in heads]
                if miss:
                    raise Gate('player %s: statistics page lost columns: %s' % (pid, ', '.join(miss[:5])))
                row = next((r for r in rows if r[0].strip().lower() == want), None) or (rows[0] if len(rows) == 1 else None)
                if row is None:
                    gone.append(pid)        # he has lines, but none for this competition: listed at 0:00 only
                    continue
                line = to_line(heads, row).split('\t')
                line[0] = canon_team(line[0], known)
                line = '\t'.join(line)
                if st.persons.get(cid + ':' + pid) != line:
                    lines_changed += 1
                st.persons[cid + ':' + pid] = line
                written.add(pid)
        held = [p for p in absent if (cid + ':' + p) in st.persons]
        if held:
            note('%d player page(s) not published by the source now: the lines we hold are kept' % len(held))
        if failed:
            res['lines_failed'] = sorted(failed)
            note('season lines not read for %d player(s): tried again next time' % len(failed))
        if lines == 'all' and not failed:
            # the source really publishes no line for him in this competition any more
            drop = [p for p in c['players'] if p in gone]
            if len(drop) > max(3, len(c['players']) // 20):
                raise Gate('%d of %d season lines would disappear' % (len(drop), len(c['players'])))
            for p in drop:
                st.persons.pop(cid + ':' + p, None)
            c['players'] = sorted((set(c['players']) - set(drop)) | written)
        else:
            c['players'] = sorted(set(c['players']) | written)

    after = json.dumps([c['games'], c['stand'], c['lead'], c['players'], c['teams'], c['roster']], sort_keys=True)
    res['changed'] = bool(before != after or res['new_games'] or res['pbp_found'] or res['shots_found'] or lines_changed)
    res['fx_changed'] = fx_changed
    res['lines_changed'] = lines_changed
    return res
