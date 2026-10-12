"""Genius Sports' LiveStats feed for one game, as a second source for a finished game.

The hosted competition pages (box score, play-by-play) are rendered from this same feed,
but they are cached for about ten minutes, take 8-25 s to render cold and often answer
HTTP 500; a box score can sit half filled in for hours. The feed itself
(fibalivestats.dcd.shared.geniussports.com/data/<match id>/data.json) is what the scorer's
table writes to, is complete the moment the game ends and answers in under a second.

    ended(d)            the feed has the 'game end' action
    score(d)            (team 1, team 2) points; team 1 is the home side
    box_rows(d, f, pid) box score lines in the shape box_lines() returns
    events(d)           play-by-play in the data/pbp_raw shape, oldest first

The feed carries no person ids. box_rows() takes a function that names the person for a
team and a player (see sync.ls_pid_finder); a player it cannot name is kept by name only,
as the box score of a player the source never registered is.
"""
import json

URL = 'https://fibalivestats.dcd.shared.geniussports.com/data/%s/data.json'


def load(mid, fetch):
    """The parsed feed, or None when there is none (403/404) or it cannot be read."""
    import source
    try:
        txt = fetch(URL % mid)
    except source.SourceError:
        return None
    try:
        d = json.loads(txt)
    except ValueError:
        return None
    return d if isinstance(d, dict) and d.get('tm') else None


def ended(d):
    return any(a.get('actionType') == 'game' and a.get('subType') == 'end' for a in d.get('pbp') or [])


def score(d):
    t = d.get('tm') or {}
    return int((t.get('1') or {}).get('score') or 0), int((t.get('2') or {}).get('score') or 0)


def full_name(o):
    return ' '.join(x for x in (o.get('firstName'), o.get('familyName')) if x).strip()


def _n(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return 0


def box_rows(d, f, pid_of):
    """Box score lines for fixture f ([mid, status, date, venue, home, hs, away, as, ...]).
    Team 1 of the feed is the home side; if the feed's scores only fit the other way round
    the sides are swapped. Raises ValueError when they fit neither way."""
    s1, s2 = score(d)
    hs, as_ = _n(f[5]), _n(f[7])
    if (s1, s2) == (hs, as_):
        sides = (('1', f[4]), ('2', f[6]))
    elif (s2, s1) == (hs, as_):
        sides = (('2', f[4]), ('1', f[6]))
    else:
        raise ValueError('%s: the live feed says %s-%s, the scoreboard %s-%s' % (f[0], s1, s2, f[5], f[7]))
    rows = []
    for k, team in sides:
        t = d['tm'][k]
        pts = 0
        for pno, p in sorted((t.get('pl') or {}).items(), key=lambda kv: _n(kv[0])):
            name = full_name(p)
            st = {
                'pts': _n(p.get('sPoints')), 'fgm': _n(p.get('sFieldGoalsMade')), 'fga': _n(p.get('sFieldGoalsAttempted')),
                'twopm': _n(p.get('sTwoPointersMade')), 'twopa': _n(p.get('sTwoPointersAttempted')),
                'tpm': _n(p.get('sThreePointersMade')), 'tpa': _n(p.get('sThreePointersAttempted')),
                'ftm': _n(p.get('sFreeThrowsMade')), 'fta': _n(p.get('sFreeThrowsAttempted')),
                'oreb': _n(p.get('sReboundsOffensive')), 'dreb': _n(p.get('sReboundsDefensive')),
                'ast': _n(p.get('sAssists')), 'pf': _n(p.get('sFoulsPersonal')), 'tov': _n(p.get('sTurnovers')),
                'stl': _n(p.get('sSteals')), 'blk': _n(p.get('sBlocks')), 'pm': _n(p.get('sPlusMinusPoints')),
            }
            pts += st['pts']
            # the hosted box score's last column: points + rebounds + assists + steals + blocks
            # - missed field goals - missed free throws - turnovers
            eff = (st['pts'] + st['oreb'] + st['dreb'] + st['ast'] + st['stl'] + st['blk']
                   - (st['fga'] - st['fgm']) - (st['fta'] - st['ftm']) - st['tov'])
            line = {'pid': pid_of(team, p.get('shirtNumber') or '', name) or '', 'team': team, 'name': name,
                    'num': str(p.get('shirtNumber') or ''), 'min': p.get('sMinutes') or '0:00'}
            for kk, v in st.items():
                line[kk] = str(v)
            line['eff'] = str(eff)
            rows.append(line)
        if pts != _n(t.get('score')):
            raise ValueError('%s: %s players\' points in the live feed add to %d, its score is %s' % (f[0], team, pts, t.get('score')))
    return rows


SHOT = {'jumpshot': 'jump shot', 'layup': 'lay up', 'drivinglayup': 'driving layup', 'hookshot': 'hookshot',
        'dunk': 'dunk', 'tipin': 'tip in', 'tipinlayup': 'tip in layup', 'alleyoop': 'alley oop',
        'fadeaway': 'fade away', 'floatingjumpshot': 'floating jump shot', 'pullupjumpshot': 'pull up jump shot',
        'stepbackjumpshot': 'step back jump shot', 'turnaroundjumpshot': 'turn around jump shot',
        'reverselayup': 'reverse layup', 'eurostep': 'euro step', 'putback': 'putback'}
TOV = {'badpass': 'bad pass', 'ballhandling': 'ball handling', 'outofbounds': 'out of bounds', 'travel': 'travel',
       'backcourt': 'backcourt', 'offensive': 'offensive', 'shotclock': 'Shot Clock Violation', '3sec': '3 seconds',
       '5sec': '5 seconds', '8sec': '8 seconds', 'doubledribble': 'double dribble', 'carrying': 'carrying',
       'other': 'other', 'lanevioloation': 'lane violation', 'laneviolation': 'lane violation'}
FOUL = {'personal': 'Personal foul', 'offensive': 'Offensive foul', 'technical': 'Technical foul',
        'unsportsmanlike': 'Unsportsmanlike foul', 'disqualifying': 'Disqualifying foul',
        'benchTechnical': 'Bench technical', 'coachTechnical': 'Coach technical',
        'coachDisqualifying': 'Coach disqualifying'}


def text(a):
    """The hosted play-by-play's wording for one feed action (what build_lineups.py reads)."""
    t, s, ok = a.get('actionType') or '', a.get('subType') or '', bool(a.get('success'))
    if t in ('2pt', '3pt'):
        return '%s %s%s' % (t, SHOT.get(s, s), '  made' if ok else '')
    if t == 'freethrow':
        fr = s.replace('of', ' of ') if 'of' in s else s
        return 'Free throw %s%s' % (fr, '  made' if ok else '')
    if t == 'rebound':
        if s.endswith('deadball'):
            return ''                            # the hosted page shows a dead-ball team rebound as a blank row
        return 'Offensive rebound' if s.startswith('offensive') else 'Defensive rebound'
    if t == 'turnover':
        return 'Turnover - ' + TOV.get(s, s)
    if t == 'foul':
        return FOUL.get(s, (s[:1].upper() + s[1:] + ' foul') if s else 'Personal foul')
    if t == 'foulon':
        return 'Foul on'
    if t == 'substitution':
        return 'Substitution in' if s == 'in' else 'Substitution out'
    if t == 'timeout':
        return 'Timeout - ' + (s or 'full')
    if t == 'jumpball':
        return {'won': 'jump ball - won', 'lost': 'jump ball - lost', 'heldball': 'Jump ball - held ball',
                'startperiod': 'Possession arrow - start period'}.get(s, 'Jump ball')
    if t in ('game', 'period'):
        return '%s %s' % ('Game' if t == 'game' else 'Period', 'start' if s == 'start' else 'end')
    if t in ('assist', 'steal', 'block'):
        return t.capitalize()
    return ' '.join(x for x in (t.capitalize(), s) if x)


def events(d):
    """The feed's play-by-play as data/pbp_raw rows, oldest first:
    [period, team 0|1|2, clock MM:SS, score 'h-a' on scoring plays, shirt no., name, text]."""
    out = []
    for a in sorted(d.get('pbp') or [], key=lambda a: _n(a.get('actionNumber'))):
        per = _n(a.get('period'))
        if 'OVER' in str(a.get('periodType') or '').upper() and per <= 4:
            per += 4
        t = a.get('actionType') or ''
        clockless = t in ('game', 'period') or (t == 'jumpball' and a.get('subType') == 'startperiod')
        scored = (t in ('2pt', '3pt', 'freethrow') and a.get('success')) or t in ('game', 'period')
        if t == 'jumpball' and a.get('subType') == 'startperiod':
            scored = True
        sc = '%s-%s' % (_n(a.get('s1')), _n(a.get('s2'))) if scored else ''
        who = bool(a.get('pno'))
        out.append([str(per), _n(a.get('tno')) if t not in ('game', 'period') and not (t == 'jumpball' and a.get('subType') == 'startperiod') else 0,
                    '' if clockless else str(a.get('gt') or '')[:5], sc,
                    str(a.get('shirtNumber') or '') if who else '', full_name(a) if who else '', text(a)])
    return out
