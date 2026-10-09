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
import datetime, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import source                       # noqa: E402
from store import Store, Gate, tipoff, done, kept, D, MYT   # noqa: E402,F401
from statmap import to_line, SRC    # noqa: E402

WORKERS = 4                         # player pages fetched at once, at most


# ---- box scores ---------------------------------------------------------------------
CI = dict(num=0, name=1, min=2, pts=3, fgm=4, fga=5, twopm=7, twopa=8, tpm=10, tpa=11,
          ftm=13, fta=14, oreb=16, dreb=17, ast=18, pf=19, tov=20, stl=21, blk=22, pm=23, eff=24)


def box_lines(b, f):
    """A parsed box score -> the stored rows, or a Gate if it does not add up."""
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
            raise Gate('%s: %s players\' points add to %d, scoreboard says %s' % (mid, team, pts, score))
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
        rows = source.roster(fetch(B + 'team/' + tid + '/roster'))
        if not rows:
            continue
        got += 1
        held[tid] = [[r[0]] + r[2:9] for r in rows]
        for r in rows:
            preg.setdefault(r[0], flip_name(r[1]))
    c['roster'] = [[tid, held[tid]] for tid in c['teams'] if tid in held]
    if got < len(T):
        note('rosters published for %d of %d teams' % (got, len(T)))


def sync_comp(st, cid, lines='new', force=False, retry_box=(), retry_pbp=(), extra_pids=(), fetch=source.get, log=print):
    """Returns a dict: changed, new_games, box_missing, pbp_missing, pbp_found, notes.

    lines   'new'  season lines of the players in the newly completed games
            'all'  every player of the competition (the daily pass)
    force   read standings and leaders even when no game has finished
    retry_* match ids whose box score / play-by-play was not published last time
    extra_pids  players whose season line could not be read last time
    """
    c = st.comp(cid)
    B = source.BASE + cid + '/'
    res = dict(changed=False, new_games=[], box_missing=[], pbp_missing=[], pbp_found=[], lines_failed=[], notes=[])
    note = lambda s: (res['notes'].append(s), log('   ' + s))

    # ---- fixtures
    fx = source.fixtures(fetch(B + 'schedule'))
    ours = {g[0]: g for g in c['games']}
    theirs = {g[0]: g for g in fx}
    if not fx:
        raise Gate('the schedule page lists no fixtures')
    gone = [m for m in ours if m not in theirs]
    if gone:
        raise Gate('fixtures missing from the source page: ' + ', '.join(gone[:6]))
    undone = [m for m in ours if ours[m][1] == 'COMPLETE' and m not in st.not_played and not done(theirs[m])]
    if undone:
        raise Gate('games we hold as final are no longer final on the source: ' + ', '.join(undone[:6]))
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
        elif m in retry_box and m not in st.boxes:
            need_box.append(m)
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

    if not need_box and not need_pbp and not fx_changed and not force and lines != 'all' and not extra_pids:
        return res

    # ---- box scores and play-by-play of the games that need them
    by_mid = {g[0]: g for g in out}
    new_pids = set()
    for m in need_box:
        f = theirs[m]
        b = source.box(fetch(B + 'match/' + m + '/boxscore'))
        if b is None or not b['home']['players'] or not b['away']['players']:
            res['box_missing'].append(m)
            note('%s: finished %s-%s, box score not published yet' % (m, f[5], f[7]))
            continue
        rows = box_lines(b, f)
        st.boxes[m] = {'p': rows}
        by_mid[m][8] = 1
        res['new_games'].append(m)
        for r in rows:
            if r['pid']:
                new_pids.add(r['pid'])
                if r['pid'] not in st.bb['personReg']:
                    st.bb['personReg'][r['pid']] = r['name']
    for m in need_pbp:
        f = theirs[m]
        ev = source.pbp(fetch(B + 'match/' + m + '/playbyplay'))
        if pbp_ok(ev, f):
            st.pbp_new[m] = ev
            res['pbp_found'].append(m)
        else:
            res['pbp_missing'].append(m)
            note('%s: play-by-play %s' % (m, 'not published yet' if not ev else 'does not reach the final score yet'))
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
        new = stand_tables(source.standings(cid, fetch), known, len(c['teams']))
        if new:
            c['stand'] = new
        elif c['stand']:
            note('the source shows no standings table now: ours kept')

        # ---- leaders, with each category's #1
        L = source.leaders(fetch(B + 'leaders'))
        lead = [[b['cat'], [[r['pid'], r['v']] for r in b['rows'] if r.get('pid')]] for b in L if b['rows']]
        if lead and len(lead) * 2 >= len(c['lead']):
            c['lead'] = lead
        elif c['lead']:
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
    res['changed'] = bool(before != after or res['new_games'] or res['pbp_found'] or lines_changed)
    res['fx_changed'] = fx_changed
    res['lines_changed'] = lines_changed
    return res
