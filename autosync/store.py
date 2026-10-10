"""The data files the sync reads and writes, and how a fixture row is read.
Standard library only: the every-half-hour check imports this and nothing heavier."""
import datetime, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
D = os.path.join(ROOT, 'data')
MYT = datetime.timezone(datetime.timedelta(hours=8))


class Gate(Exception):
    """A check failed: this competition is left exactly as it was."""


# ---- the three data files ---------------------------------------------------------
class Store:
    def __init__(self, d=D):
        self.d = d
        self.bb = json.load(open(os.path.join(d, 'backbone.json')))
        self.persons = json.load(open(os.path.join(d, 'persons.json')))
        self.boxes = json.load(open(os.path.join(d, 'boxscores.json')))
        npp = os.path.join(d, 'not_played.json')
        self.not_played = json.load(open(npp)) if os.path.exists(npp) else {}
        self.pbp_new = {}
        self.queued = self._queue(d)

    def _queue(self, d):
        """Competitions waiting to be imported (data/add_comps.json): the teams, rosters and
        names read by hand, with no fixtures. They join the backbone in memory here; the
        first sync of each reads everything else from the source, and its save makes the
        competition permanent. One already in the backbone is skipped."""
        qp = os.path.join(d, 'add_comps.json')
        self.recheck_box = {}
        if not os.path.exists(qp):
            return []
        q = json.load(open(qp))
        self.recheck_box = {k: v for k, v in q.get('recheck_box', {}).items() if not k.startswith('_')}
        have = {c['id'] for c in self.bb['comps']}
        added = []
        for c in q.get('comps', []):
            if c['id'] in have:
                continue
            self.bb['comps'].append(dict(c, games=[], stand=[], lead=[], players=[]))
            added.append(c['id'])
        if added:
            for k, v in q.get('teamReg', {}).items():
                self.bb['teamReg'].setdefault(k, v)
            for k, v in q.get('personReg', {}).items():
                self.bb['personReg'].setdefault(k, v)
        return added

    def comp(self, cid):
        return next(c for c in self.bb['comps'] if c['id'] == cid)

    def has_pbp(self, mid):
        return mid in self.pbp_new or os.path.exists(os.path.join(self.d, 'pbp_raw', mid + '.json'))

    def save(self):
        for name, obj in (('backbone.json', self.bb), ('persons.json', self.persons), ('boxscores.json', self.boxes)):
            tmp = os.path.join(self.d, name + '.tmp')
            with open(tmp, 'w') as f:
                json.dump(obj, f, separators=(',', ':'))
            os.replace(tmp, os.path.join(self.d, name))
        for mid, ev in self.pbp_new.items():
            with open(os.path.join(self.d, 'pbp_raw', mid + '.json'), 'w') as f:
                json.dump(ev, f, ensure_ascii=False, separators=(',', ':'))


# ---- fixture times ------------------------------------------------------------------
def tipoff(dt):
    """'Oct 2, 2026, 8:15 PM' (Malaysia time) -> seconds since the epoch, or None."""
    try:
        t = datetime.datetime.strptime((dt or '').strip(), '%b %d, %Y, %I:%M %p')
    except ValueError:
        return None
    return t.replace(tzinfo=MYT).timestamp()


def done(row):
    return row[1] == 'COMPLETE' and str(row[5]).isdigit() and str(row[7]).isdigit()


def kept(row):
    """What the site keeps of a source fixture row. A game that is not finished is kept
    as a plain fixture: its running score belongs to the live layer, not the snapshot."""
    m, st, dt, venue, h, hs, a, as_ = row[:8]
    if done(row):
        return [m, st, dt, venue, h, hs, a, as_]
    return [m, 'SCHEDULED', dt, venue, h, '', a, '']
