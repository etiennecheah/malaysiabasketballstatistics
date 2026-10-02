#!/usr/bin/env python3
"""The watcher. One run of the `sync` workflow does, in order:

  1. If the published site was built from other inputs than the repository holds now
     (new code, new data, a bundle unpacked from inbox/), rebuild it and publish.
  2. Otherwise look at the fixture list. With a game near or under way it stays on,
     checking the competition's schedule page every 90 seconds from an hour after
     tip-off. When a game turns final it reads the box score, play-by-play, standings,
     leaders and season lines, rebuilds the site, checks it, commits the data and asks
     the workflow to publish. With nothing on, it ends within seconds.
  3. It tells the workflow whether to publish (deploy), whether to start a fresh run to
     keep watching (again) and whether something failed (fail).

Nothing is committed or published unless every check passes; a failure leaves both the
repository and the live site as they were.
"""
import datetime, hashlib, json, os, shutil, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ROOT)
from store import Store, Gate, tipoff, done, MYT   # noqa: E402

SITE = 'https://etiennecheah.github.io/malaysiabasketballstatistics/'
STATE = os.path.join(HERE, 'state.json')
OUT = os.path.join(ROOT, '_site')
BUILD = ['build_data.py', 'build_lineups.py', 'build_bpm.py', 'build_pbp.py', 'build_stats.py', 'build_site.py']

HOLD_BEFORE = 30 * 60        # a run that starts this close to tip-off stays on
POLL_FROM = 60 * 60          # no game ends sooner than an hour after tip-off
POLL_UNTIL = 4.5 * 3600      # after that it is "overdue" and looked at every half hour
OVERDUE_FOR = 48 * 3600
POLL_EVERY = 90
OVERDUE_EVERY = 25 * 60
RECENT = 3 * 86400           # a competition stays in the daily pass this long after its last game
DAILY_HOUR = 4               # the daily pass runs after 04:00 Malaysia time
BUDGET = int(os.environ.get('WATCH_SECONDS', 5 * 3600 + 600))
T0 = time.time()


def log(*a):
    print(datetime.datetime.now(MYT).strftime('%H:%M:%S'), *a, flush=True)


def sh(*cmd, check=True, cwd=ROOT, timeout=900):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode:
        raise RuntimeError('%s\n%s' % (' '.join(cmd), (r.stdout + r.stderr)[-2500:]))
    return r.stdout.strip()


def output(**kw):
    p = os.environ.get('GITHUB_OUTPUT')
    for k, v in kw.items():
        log('output %s=%s' % (k, v))
        if p:
            with open(p, 'a') as f:
                f.write('%s=%s\n' % (k, v))


# ---- state -------------------------------------------------------------------------
def load_state():
    s = json.load(open(STATE)) if os.path.exists(STATE) else {}
    for k in ('pending', 'daily', 'fail', 'lines_retry', 'overdue_at', 'full'):
        s.setdefault(k, {})
    s.setdefault('log', [])
    return s


def save_state(s):
    s['log'] = s['log'][-40:]
    with open(STATE, 'w') as f:
        json.dump(s, f, indent=1, sort_keys=True)
        f.write('\n')


def event(s, text):
    log(text)
    s['log'].append(datetime.datetime.now(MYT).strftime('%Y-%m-%d %H:%M') + '  ' + text)


# ---- what is due --------------------------------------------------------------------
def open_comps():
    """Competitions still being played although every listed fixture is finished
    (data/open_comps.json): the organiser has not published the next games yet."""
    p = os.path.join(ROOT, 'data', 'open_comps.json')
    return {k for k in (json.load(open(p)) if os.path.exists(p) else {}) if not k.startswith('_')}


def peek_slot(now):
    """Such a competition's schedule page is looked at for new fixtures every half hour
    from 18:00 to midnight Malaysia time and every two hours otherwise. Returns the
    number of the current slot when it is one to look in, else None."""
    slot = int(now // 1800)
    hour = datetime.datetime.fromtimestamp(now, MYT).hour
    return slot if (hour >= 18 or slot % 4 == 0) else None


def open_fixtures(st, c):
    return [g for g in c['games'] if g[1] != 'COMPLETE' and g[0] not in st.not_played]


def plan(st, state, now):
    """Which competitions need looking at now, and whether this run should stay on."""
    today = datetime.datetime.fromtimestamp(now, MYT)
    P = dict(due=[], overdue=[], daily=[], peek=[], hold=False, next=None)
    more = open_comps()
    for c in st.bb['comps']:
        cid = c['id']
        opens = open_fixtures(st, c)
        if cid in more and not opens:
            P['peek'].append(cid)
        tips = [t for t in (tipoff(g[2]) for g in opens) if t]
        if any(t + POLL_FROM <= now <= t + POLL_UNTIL for t in tips):
            P['due'].append(cid)
        if any(t - HOLD_BEFORE <= now <= t + POLL_UNTIL for t in tips):
            P['hold'] = True
        if any(t + POLL_UNTIL < now <= t + OVERDUE_FOR for t in tips):
            P['overdue'].append(cid)
        last = max([t for t in (tipoff(g[2]) for g in c['games'] if g[1] == 'COMPLETE') if t] or [0])
        if (opens or cid in more or now - last < RECENT) and today.hour >= DAILY_HOUR and \
                state['daily'].get(cid) != today.strftime('%Y-%m-%d'):
            # the old competitions whose only open fixtures the source never finished are not in here:
            # open_fixtures() leaves out everything listed in not_played.json
            P['daily'].append(cid)
    for mid, p in state['pending'].items():
        if now - p['since'] < 3 * 3600:
            P['hold'] = True
    return P


def pending_due(state, cid, now):
    box = [m for m, p in state['pending'].items() if p['cid'] == cid and p['kind'] == 'box' and now >= p['next']]
    pbp = [m for m, p in state['pending'].items() if p['cid'] == cid and p['kind'] == 'pbp' and now >= p['next']]
    return box, pbp


def note_pending(state, cid, res, now):
    for kind, key in (('box', 'box_missing'), ('pbp', 'pbp_missing')):
        for m in res[key]:
            p = state['pending'].setdefault(m, {'cid': cid, 'kind': kind, 'since': now})
            p['kind'] = kind
            age = now - p['since']
            p['next'] = now + (600 if age < 3 * 3600 else 3600 if age < 48 * 3600 else 86400)
    for m in res['new_games']:
        if m in state['pending'] and state['pending'][m]['kind'] == 'box' and m not in res['pbp_missing']:
            state['pending'].pop(m)
    for m in res['pbp_found']:
        state['pending'].pop(m, None)
    for m in [m for m, p in state['pending'].items() if now - p['since'] > 7 * 86400]:
        state['pending'].pop(m)
    if res['lines_failed']:
        n = state['lines_retry'].get(cid, {}).get('n', 0) + 1
        if n > 6:                                   # the daily pass re-reads every line anyway
            state['lines_retry'].pop(cid, None)
        else:
            state['lines_retry'][cid] = {'pids': res['lines_failed'], 'n': n, 'next': now + 600 * n}
    else:
        state['lines_retry'].pop(cid, None)


# ---- build, check, publish ------------------------------------------------------------
def pip_deps():
    try:
        import numpy, bs4, html5lib   # noqa: F401
        return
    except ImportError:
        pass
    pkgs = ['numpy', 'beautifulsoup4', 'html5lib']
    r = subprocess.run([sys.executable, '-m', 'pip', 'install', '-q'] + pkgs, capture_output=True, text=True)
    if r.returncode:
        sh(sys.executable, '-m', 'pip', 'install', '-q', '--break-system-packages', *pkgs)
    import site, importlib
    for p in site.getsitepackages() + [site.getusersitepackages()]:    # a user install made just now is not on the path yet
        if p not in sys.path:
            sys.path.append(p)
    importlib.invalidate_caches()


def fingerprint():
    """What the site is built from: every tracked file under assets/ and data/ plus the build scripts."""
    sh('git', 'add', '-A', 'data', 'assets')
    ls = sh('git', 'ls-files', '-s', '--', 'assets', 'data', '*.py')
    return hashlib.sha256(ls.encode()).hexdigest()[:20]


def published():
    try:
        req = urllib.request.Request(SITE + 'build.json?t=%d' % time.time(), headers={'User-Agent': 'HoopStatsMY-sync/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except Exception as e:           # no build.json yet, or the site is unreachable: build to be safe
        log('published build.json not readable: %s' % e)
        return None


def build(fp, why):
    pip_deps()
    t = time.time()
    for s in BUILD:
        sh(sys.executable, s, timeout=1200)
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    shutil.copy(os.path.join(ROOT, 'site.html'), os.path.join(OUT, 'index.html'))
    shutil.copytree(os.path.join(ROOT, 'pbp'), os.path.join(OUT, 'pbp'))
    shutil.copytree(os.path.join(ROOT, 'stats'), os.path.join(OUT, 'stats'))      # Lineups and Clutch, one file per competition
    json.dump({'inputs': fp, 'built': datetime.datetime.now(MYT).strftime('%Y-%m-%d %H:%M MYT'), 'why': why,
               'commit': sh('git', 'rev-parse', 'HEAD', check=False)},
              open(os.path.join(OUT, 'build.json'), 'w'))
    log('built in %ds: index.html %.1f MB' % (time.time() - t, os.path.getsize(os.path.join(OUT, 'index.html')) / 1e6))


def smoke(games=()):
    """Open the built page in a real browser: no script errors, Home and Games render,
    and each newly synced game shows its final score on its box score page."""
    env = dict(os.environ)
    mods = os.path.join(os.environ.get('RUNNER_TEMP', '/tmp'), 'smoke')
    if 'NODE_PATH' not in env:
        if not os.path.exists(os.path.join(mods, 'node_modules', 'playwright-core')):
            os.makedirs(mods, exist_ok=True)
            sh('npm', 'install', '--no-save', '--no-audit', '--no-fund', '--prefix', mods, 'playwright-core', timeout=300)
        env['NODE_PATH'] = os.path.join(mods, 'node_modules')
    r = subprocess.run(['node', os.path.join(HERE, 'smoke.js'), os.path.join(OUT, 'index.html')] + list(games),
                       cwd=ROOT, env=env, capture_output=True, text=True, timeout=300)
    log(r.stdout.strip())
    if r.returncode:
        raise RuntimeError('page check failed\n' + (r.stdout + r.stderr)[-2500:])


def remote_head():
    out = sh('git', 'ls-remote', 'origin', 'refs/heads/main', check=False)
    return out.split()[0] if out else None


def commit(msg, paths):
    sh('git', 'config', 'user.name', 'github-actions[bot]')
    sh('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    sh('git', 'add', '-A', *paths)
    if not sh('git', 'status', '--porcelain', '--', *paths):
        return False
    sh('git', 'commit', '-q', '-m', msg)
    sh('git', 'push', '-q', 'origin', 'HEAD:main')
    return True


def fail_note(state, key, msg, now, soft=False):
    """Record a failure and back off. soft = the source did not answer (try again soon);
    otherwise a check failed (try again later and later). True when the run should be
    marked failed, which is what makes GitHub send an email."""
    f = state['fail'].setdefault(key, {'n': 0})
    f['n'] += 1
    f['last'] = now
    f['msg'] = str(msg)[:600]
    f['next'] = now + (min(600, 60 * f['n']) if soft else min(6 * 3600, 300 * 2 ** min(f['n'], 7)))
    event(state, 'FAILED %s (%d): %s' % (key, f['n'], str(msg).splitlines()[0][:200]))
    return f['n'] == 5 if soft else (f['n'] == 1 or f['n'] % 12 == 0)


def full_lines_due(st, state, cid, now):
    """Every player's season line is re-read once after the latest game (the source corrects
    statistics afterwards) and otherwise once a week."""
    c = st.comp(cid)
    last = max([t for t in (tipoff(g[2]) for g in c['games'] if g[1] == 'COMPLETE') if t] or [0])
    got = state['full'].get(cid, 0)
    return got < last + POLL_FROM or now - got > 7 * 86400


# ---- the run --------------------------------------------------------------------------
def main():
    state = load_state()
    head = sh('git', 'rev-parse', 'HEAD')
    fp = fingerprint()
    force = os.environ.get('FORCE') == 'true'
    built = os.environ.get('BUILT') or ''
    failed = False

    # 1. is the published site behind the repository?
    pub = None if force else ({'inputs': built} if built else published())
    just = state.get('built') or {}
    if not force and (pub or {}).get('inputs') != fp and just.get('fp') == fp and time.time() - just.get('at', 0) < 1800:
        log('these inputs were built %d min ago: the publish is still on its way' % ((time.time() - just['at']) / 60))
        pub = {'inputs': fp}
    if force or pub is None or pub.get('inputs') != fp:
        f = state['fail'].get('build')
        if f and f.get('fp') == fp and not force:
            log('these inputs already failed to build: waiting for a change')
        else:
            try:
                build(fp, 'forced' if force else 'inputs changed' if pub else 'first build')
                smoke()
                state['fail'].pop('build', None)
                state['built'] = {'fp': fp, 'at': time.time()}
                save_state(state)
                commit('sync state', ['autosync/state.json'])
                output(deploy='true', again='true', built=fp, fail='false')
                return
            except Exception as e:
                failed = fail_note(state, 'build', e, time.time())
                state['fail']['build']['fp'] = fp
                print(str(e), file=sys.stderr)
                save_state(state)
                commit('sync state', ['autosync/state.json'])
                output(deploy='false', again='false', fail='true' if failed else 'false')
                return

    # 2. watch
    st = Store()
    last_poll, peeked, again, dirty = {}, {}, False, False
    while True:
        now = time.time()
        P = plan(st, state, now)
        todo = []                                   # (cid, kind)
        for cid in P['due']:
            if now - last_poll.get(cid, 0) >= POLL_EVERY:
                todo.append((cid, 'due'))
        for cid in P['overdue']:
            if cid not in P['due'] and now - max(last_poll.get(cid, 0), state['overdue_at'].get(cid, 0)) >= OVERDUE_EVERY:
                todo.append((cid, 'overdue'))
        slot = peek_slot(now)
        for cid in P['peek']:
            if slot is not None and peeked.get(cid) != slot and not any(t[0] == cid for t in todo):
                todo.append((cid, 'peek'))
                peeked[cid] = slot
        for cid in P['daily']:
            todo = [t for t in todo if t[0] != cid] + [(cid, 'daily')]
        for cid in {p['cid'] for p in state['pending'].values() if now >= p['next']} | \
                {k for k, v in state['lines_retry'].items() if now >= v['next']}:
            if not any(t[0] == cid for t in todo) and now - last_poll.get(cid, 0) >= 600:
                todo.append((cid, 'retry'))

        for cid, kind in todo:
            f = state['fail'].get(cid)
            if f and now < f.get('next', 0):
                continue
            last_poll[cid] = now
            c = st.comp(cid)
            pip_deps()
            import sync
            rb, rp = pending_due(state, cid, now)
            full = kind == 'daily' and full_lines_due(st, state, cid, now)
            try:
                res = sync.sync_comp(st, cid, lines='all' if full else 'new', force=(kind == 'daily'),
                                     retry_box=rb, retry_pbp=rp, extra_pids=state['lines_retry'].get(cid, {}).get('pids', ()),
                                     log=log)
            except (Gate, sync.source.SourceError) as e:
                failed = fail_note(state, cid, e, now, soft=isinstance(e, sync.source.SourceError)) or failed
                dirty = True
                st = Store()                         # drop whatever was half applied in memory
                continue
            if cid in state['fail']:
                state['fail'].pop(cid)
                dirty = True
            if full and not res['lines_failed']:
                state['full'][cid] = now
            if kind == 'overdue':
                state['overdue_at'][cid] = now
            if kind == 'daily':
                state['daily'][cid] = datetime.datetime.fromtimestamp(now, MYT).strftime('%Y-%m-%d')
                dirty = True
            before = json.dumps(state['pending'], sort_keys=True) + json.dumps(state['lines_retry'], sort_keys=True)
            note_pending(state, cid, res, now)
            dirty = dirty or before != json.dumps(state['pending'], sort_keys=True) + json.dumps(state['lines_retry'], sort_keys=True)
            if not res['changed']:
                if kind not in ('due', 'peek'):
                    log('%s %s: nothing new' % (kind, c['name']))
                continue

            # ---- something changed: write, rebuild, check, commit, publish
            games = {g[0]: g for g in c['games']}
            what = []
            for m in res['new_games']:
                g = games[m]
                what.append('%s %s-%s %s' % (g[4], g[5], g[7], g[6]))
            for m in res['pbp_found']:
                if m not in res['new_games']:
                    what.append('play-by-play of %s v %s' % (games[m][4], games[m][6]))
            if not what:
                what.append('fixtures, standings or season lines updated')
            msg = 'sync: %s — %s' % (c['name'], '; '.join(what))
            if remote_head() not in (None, head):
                log('the repository moved on while syncing: a fresh run starts over on the new version')
                output(deploy='false', again='true', fail='true' if failed else 'false')
                return
            try:
                st.save()
                fp2 = fingerprint()
                build(fp2, msg)
                smoke(['%s:%s' % (cid, m) for m in res['new_games']])
            except Exception as e:
                sh('git', 'reset', '-q', check=False)                    # unstage
                sh('git', 'checkout', '--', 'data', check=False)         # the three data files as committed
                for m in res['pbp_found']:                               # and the play-by-play files just written
                    if not sh('git', 'ls-files', '--', 'data/pbp_raw/%s.json' % m, check=False):
                        try:
                            os.remove(os.path.join(ROOT, 'data', 'pbp_raw', m + '.json'))
                        except OSError:
                            pass
                failed = fail_note(state, cid, e, now) or failed
                print(str(e), file=sys.stderr)
                save_state(state)
                commit('sync state', ['autosync/state.json'])
                output(deploy='false', again='true', fail='true' if failed else 'false')
                return
            state['fail'].pop(cid, None)
            state['built'] = {'fp': fp2, 'at': time.time()}
            event(state, msg + ('' if not res['notes'] else '  [' + '; '.join(res['notes']) + ']'))
            save_state(state)
            commit(msg, ['data', 'autosync/state.json'])
            output(deploy='true', again='true', built=fp2, fail='true' if failed else 'false')
            return

        if dirty:
            save_state(state)
        if not P['hold'] and not P['due']:
            log('nothing on: %d due, %d overdue, %d waiting for late data' % (len(P['due']), len(P['overdue']), len(state['pending'])))
            break
        if time.time() - T0 > BUDGET:
            again = True
            log('time budget used: handing over to a fresh run')
            break
        rh = remote_head()
        if rh and rh != head:
            again = True
            log('the repository changed: handing over to a fresh run')
            break
        time.sleep(30)

    if dirty:
        save_state(state)
        if remote_head() in (None, head):
            commit('sync state', ['autosync/state.json'])
    output(deploy='false', again='true' if again else 'false', fail='true' if failed else 'false')


if __name__ == '__main__':
    main()
