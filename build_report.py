#!/usr/bin/env python3
"""The Report tab on player profiles: one small file per player, the numbers the scouting report
is written from (assets/app4v_report.js writes the words in the browser).

For every competition a player has a line in:
  his line            per game, per 40 minutes, shooting, the advanced numbers (data/bpm.json)
  his ranks           for each skill, his place among the event's rotation players: [rank, field]
  his age             at the event's first day, and the field's median age and how many are younger

The ranks are counted inside one event only, among the players who played at least 40% of the
busiest player's games and 10 minutes a game (the event's "rotation"). Skills built from more than
one number (playmaking: assists per 40 and assist-to-turnover) rank the players on the mean of
their in-event percentiles for those numbers. A shooting rank counts only the players with five
attempts or more. Nothing is averaged across events here: the page scales each rank to a field
of 100 and blends those, by minutes, never the raw numbers.

Output: stats/rp/<pid>.js   REPORT_PUT('<pid>', {pos, ht, dob, rows: [...]})
Run: python3 build_report.py   (after build_data.py and build_bpm.py, before build_site.py)
"""
import datetime as dt, json, os, shutil, statistics

R = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(R, 'data')
OUT = os.path.join(R, 'stats', 'rp')

ADV = ['per', 'usg', 'ows', 'dws', 'ws', 'ws40', 'ortg', 'drtg', 'mp']
BPM = ['bpm', 'obpm', 'dbpm', 'lo', 'hi', 'vorp', 'padd', 'pos', 'role', 'poss']
LOWER = {'tov40', 'topct'}                     # fewer is better
SKILLS = {'scoring': ['pts40'], 'eff': ['ts'], 'three': ['tpp'], 'ft': ['ftp'], 'line': ['ftr'],
          'play': ['ast40', 'astto'], 'care': ['topct'], 'reb': ['orpct', 'drpct'],
          'def': ['stl40', 'blk40', 'dbpm'], 'impact': ['bpm']}
ABBR = {'Malaysia D-League': 'D-League', 'Major Basketball League': 'MBL', 'MABA/MATRIX 17 & Below': 'MATRIX',
        'MILO Lum Mun Chak Cup': 'Lum Mun Chak', 'Sukan Malaysia': 'SUKMA', 'Invitational': 'Invitational',
        'Selangor Basketball League': 'SBL', 'Sukan Selangor': 'SUKSES', 'MABA/MATRIX Cup': 'MATRIX Cup',
        'Schools Championship': 'Schools', 'NXT Championship': 'NXT', "Women's Basketball Alliance": 'WBA'}


def mins(m):
    if m in (None, ''):
        return 0.0
    if isinstance(m, (int, float)):
        return float(m)
    try:
        a = str(m).split(':')
        return int(a[0]) + int(a[1]) / 60
    except (ValueError, IndexError):
        return 0.0


def level(c):
    lv = c.get('level')
    if lv in ('U15', 'U16', 'U17', 'U18', 'Youth'):
        return 'Youth'
    if lv in ('U20', 'U23'):
        return 'Development'
    return 'Senior'


def short(c):
    s, lv = c.get('series') or c.get('name'), c.get('level')
    name = ABBR.get(s, s)
    if s == 'FIBA':
        name = 'FIBA %s' % lv
    elif lv and lv not in ('Open',) and lv not in name:
        name += ' ' + lv
    return '%s %s' % (name, c.get('year'))


def dob_of(x):
    try:
        m, d, y = (int(v) for v in str(x).split('/'))
        y += 2000 if y < 30 else 1900
        return dt.date(y, m, d)
    except (ValueError, TypeError):
        return None


def rows_of(c, K, B):
    """Every line in a competition with games and minutes, as the numbers the report uses."""
    adv, bpm = B.get('adv', {}).get(c['id'], {}), B.get('bpm', {}).get(c['id'], {})
    out = {}
    for r in c.get('players') or []:
        d = dict(zip(K, r)) if isinstance(r, list) else dict(r)
        d = {k: d.get(k) for k in K}
        g, m = d.get('g') or 0, mins(d.get('min'))
        if not g or not m:
            continue
        num = lambda k: float(d.get(k) or 0)
        fga, fta, tpa = num('fga'), num('fta'), num('tpa')
        a = dict(zip(ADV, adv.get(d['pid']) or [None] * len(ADV)))
        b = dict(zip(BPM, bpm.get(d['pid']) or [None] * len(BPM)))
        x = {'pid': d['pid'], 'team': d.get('team'), 'g': int(g), 'min': m,
             'pts': num('pts'), 'reb': num('reb'), 'ast': num('ast'), 'stl': num('stl'), 'blk': num('blk'), 'tov': num('tov'),
             'fgm': int(num('fgm')), 'fga': int(fga), 'tpm': int(num('tpm')), 'tpa': int(tpa), 'ftm': int(num('ftm')), 'fta': int(fta),
             'ts': d.get('tspct'), 'topct': d.get('topct'), 'orpct': d.get('orpct'), 'drpct': d.get('drpct'),
             'per': a['per'], 'usg': a['usg'], 'bpm': b['bpm'], 'obpm': b['obpm'], 'dbpm': b['dbpm']}
        x['pts40'] = x['pts'] / m * 40
        x['ast40'], x['stl40'], x['blk40'] = x['ast'] / m * 40, x['stl'] / m * 40, x['blk'] / m * 40
        x['tpp'] = 100 * x['tpm'] / tpa if tpa >= 5 else None
        x['ftp'] = 100 * x['ftm'] / fta if fta >= 5 else None
        x['ftr'] = 100 * fta / fga if fga else None
        x['astto'] = x['ast'] / x['tov'] if x['tov'] else None
        prev = out.get(d['pid'])
        if prev is None or m > prev['min']:            # a player listed twice (two teams): his bigger line
            out[d['pid']] = x
    return list(out.values())


def pct_fn(vals, k):
    """Percentile of one value among the field's values (ties share the middle)."""
    def f(v):
        below = sum(1 for q in vals if (q > v if k in LOWER else q < v))
        eq = sum(1 for q in vals if q == v)
        return 100.0 * (below + 0.5 * (eq - 1)) / max(1, len(vals) - 1)
    return f


def ranks(pool):
    """{pid: {skill: [rank, field]}} inside one event's rotation."""
    metrics = {k for ms in SKILLS.values() for k in ms}
    fns = {}
    for k in metrics:
        vals = [p[k] for p in pool if p[k] is not None]
        fns[k] = pct_fn(vals, k) if len(vals) >= 2 else None
    out = {p['pid']: {} for p in pool}
    for sk, ms in SKILLS.items():
        score = {}
        for p in pool:
            ps = [fns[k](p[k]) for k in ms if p[k] is not None and fns[k]]
            if ps and (len(ps) == len(ms) or len(ms) > 1):
                score[p['pid']] = sum(ps) / len(ps)
        if len(score) < 2:
            continue
        for pid, v in score.items():
            out[pid][sk] = [1 + sum(1 for w in score.values() if w > v + 1e-9), len(score)]
    return out


def main():
    s = json.load(open(os.path.join(D, 'site_data.json')))
    bp = os.path.join(D, 'bpm.json')
    B = json.load(open(bp)) if os.path.exists(bp) else {}
    K = s['pkeys']
    # dates of birth, from any roster that has one
    dob = {}
    for c in s['comps']:
        for rs in (c.get('roster') or {}).values():
            for x in rs:
                b = dob_of(x.get('dob'))
                if b and b.year > 1960:
                    dob.setdefault(x['pid'], (b, x))
    # position and height from the latest roster that gives them
    bio = {}
    for c in sorted(s['comps'], key=lambda c: c.get('start') or ''):
        for rs in (c.get('roster') or {}).values():
            for x in rs:
                e = bio.setdefault(x['pid'], {})
                if x.get('pos'):
                    e['pos'] = x['pos']
                if x.get('ht'):
                    e['ht'] = x['ht']
    out = {}
    for c in s['comps']:
        rs = rows_of(c, K, B)
        if not rs:
            continue
        start = c.get('start') or '%s-07-01' % c.get('year')
        try:
            day = dt.date.fromisoformat(start)
        except ValueError:
            day = dt.date(int(c.get('year') or 2000), 7, 1)
        maxg = max(r['g'] for r in rs)
        pool = [r for r in rs if r['g'] >= max(2, 0.4 * maxg) and r['min'] / r['g'] >= 10]
        rk = ranks(pool) if len(pool) >= 2 else {}
        inpool = {p['pid'] for p in pool}
        ages = []
        for t in (c.get('roster') or {}).values():
            for x in t:
                b = dob_of(x.get('dob'))
                if b and b.year > 1960 and (day - b).days > 3000:
                    ages.append((day - b).days / 365.25)
        field = statistics.median(ages) if len(ages) >= 10 else None
        for r in rs:
            g = r['g']
            row = {'cid': c['id'], 'name': short(c), 'full': c.get('label') or c.get('name'), 'y': c.get('year'), 'start': start,
                   'cat': level(c), 'tier': '%s|%s' % (c.get('series'), c.get('level')), 'team': r['team'], 'g': g,
                   'min': round(r['min'], 1), 'mpg': round(r['min'] / g, 1),
                   'ppg': round(r['pts'] / g, 1), 'rpg': round(r['reb'] / g, 1), 'apg': round(r['ast'] / g, 1),
                   'spg': round(r['stl'] / g, 1), 'bpg': round(r['blk'] / g, 1), 'tpg': round(r['tov'] / g, 1),
                   'fgm': r['fgm'], 'fga': r['fga'], 'tpm': r['tpm'], 'tpa': r['tpa'], 'ftm': r['ftm'], 'fta': r['fta'],
                   'pts40': round(r['pts40'], 1)}
            for k in ('ts', 'topct', 'orpct', 'drpct', 'usg', 'per', 'bpm', 'obpm', 'dbpm'):
                v = r.get(k)
                row[k] = round(float(v), 2) if isinstance(v, (int, float)) else None
            row['pool'], row['q'] = len(pool), r['pid'] in inpool
            row['rk'] = rk.get(r['pid'], {})
            b = dob.get(r['pid'])
            if b:
                a = (day - b[0]).days / 365.25
                row['age'] = day.year - b[0].year - ((day.month, day.day) < (b[0].month, b[0].day))
                if field is not None:
                    row['fieldAge'] = round(field, 1)
                    row['older'] = round(a - field, 1)
                    row['younger'] = round(100 * sum(1 for x in ages if x < a) / len(ages))
            out.setdefault(r['pid'], []).append(row)
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    for pid, rows in out.items():
        rows.sort(key=lambda r: (r['start'], r['cid']))
        meta = {'rows': rows}
        meta.update(bio.get(pid, {}))
        with open(os.path.join(OUT, pid + '.js'), 'w') as f:
            f.write('REPORT_PUT(%s,%s);' % (json.dumps(pid), json.dumps(meta, separators=(',', ':'), ensure_ascii=False)))
    graded = sum(1 for rows in out.values() if any(r['q'] and r['pool'] >= 20 for r in rows))
    print('report: %d players, %d with at least one graded event' % (len(out), graded))


if __name__ == '__main__':
    main()
