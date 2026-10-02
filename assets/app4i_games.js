/* =========================================================================
   Games — every competition's fixtures on one date-led page.

   The site already has a schedule inside each competition. What it had no way
   to answer was "what was played that weekend", which crosses competitions: a
   Saturday in August 2026 can carry four of them at once.

   The data shapes the navigator. There are 2,200 dated games over 443 days
   spread across nine years — 41 months out of about 111. Basketball here is
   tournament-shaped, not a season that runs every week, so a strip of calendar
   days would land on an empty screen most of the time. The strip therefore
   lists only days that have games, the arrows step to the next day that has
   games rather than to tomorrow, and the month menu offers only months that
   have any. Nothing here can navigate you to nothing.

   It opens on the most recent day with games rather than on today, because
   this database is a stored snapshot and today is usually empty — unless a
   game is on, or about to be: then it opens on that day, and that game's card
   carries the live score and clock from the live layer (app4n_live.js).
   ========================================================================= */

const GAMES = { day: null, hide: false };

/* date -> [{c, g}], built once. Cheap: it is one pass over 2,201 fixtures. */
let G_INDEX = null;
function gameIndex() {
  if (G_INDEX) return G_INDEX;
  const byDay = {};
  COMPS.forEach(c => c.games.forEach(g => {
    if (!g.date) return;
    (byDay[g.date] = byDay[g.date] || []).push({ c: c, g: g });
  }));
  const days = Object.keys(byDay).sort();
  const months = [];
  days.forEach(d => { const m = d.slice(0, 7); if (months[months.length - 1] !== m) months.push(m); });
  // Opening day: the most recent one that actually has a result. The very last
  // date in the database is a fixture whose teams are still "TBD", and landing
  // a scoreboard on a placeholder is a poor first screen.
  let opening = days[days.length - 1];
  for (let i = days.length - 1; i >= 0; i--) {
    if (byDay[days[i]].some(r => r.g.st === 'COMPLETE')) { opening = days[i]; break; }
  }
  G_INDEX = { byDay: byDay, days: days, months: months, opening: opening };
  return G_INDEX;
}

const G_MON = ['January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December'];
const G_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function gDow(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return G_DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
function gMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return G_MON[m - 1] + ' ' + y;
}
function gLongDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return gDow(iso) + ' ' + d + ' ' + G_MON[m - 1].slice(0, 3) + ' ' + y;
}

/* What the live layer knows about a fixture the snapshot still lists as unplayed:
   {state: 'live' | 'final', d: the feed} once the relay has answered, {state: 'soon'}
   while the game is inside its tip-off window with nothing from the feed yet, or null.
   Every fixture list uses this (the Games cards here, the schedule rows of a competition),
   so a game that is being played never reads as "not played yet". */
function fixtureLive(g) {
  if (typeof LIVE === 'undefined' || !g || g.st === 'COMPLETE' || g.st === 'NOT_PLAYED') return null;
  const x = LIVE.games[g.mid];
  if (!x) return null;
  if (x.data && (x.state === 'live' || x.state === 'final')) return { state: x.state, d: x.data, at: x.at };
  return { state: 'soon', started: liveNow() >= (liveStart(g) || Infinity) };
}
/* the day the page opens on when the reader has not picked one */
function gDefaultDay(ix) {
  if (typeof liveCandidates === 'function') {
    const c = liveCandidates().find(g => ix.byDay[g.date]);
    if (c) return c.date;
  }
  return ix.opening;
}
function gDayLive(ix, day) { return (ix.byDay[day] || []).some(r => { const v = fixtureLive(r.g); return v && v.state === 'live'; }); }
function gSubLine(ix, day) {
  const rows = ix.byDay[day], latest = ix.days[ix.days.length - 1];
  const soon = rows.some(r => fixtureLive(r.g));
  return `${gLongDate(day)} · ${rows.length} game${rows.length === 1 ? '' : 's'}
      ${gDayLive(ix, day) ? '<em class="gnav-live">a game is being played now</em>'
        : soon ? '<em>a game is on today</em>'
        : day === ix.opening ? '<em>the most recent day with a result</em>'
        : day === latest ? '<em>the last date in the database</em>' : ''}`;
}
/* called by the live layer on every tick: repaint the cards the feed speaks for, the
   line under the navigator and the day strip's live mark, without moving the page */
function gamesLiveRefresh() {
  const sub = document.querySelector('.gnav-sub[data-gsub]');
  if (!sub) return;
  const ix = gameIndex(), day = sub.dataset.gsub;
  document.querySelectorAll('.gcard[data-gmid]').forEach(el => {
    const g = GAME_BY_MID[el.dataset.gmid];
    if (!g || g.st === 'COMPLETE' || !(fixtureLive(g) || el.dataset.glive)) return;
    const t = document.createElement('template');
    t.innerHTML = gameCard(COMP_BY_ID[g.cid], g).trim();
    el.replaceWith(t.content.firstChild);
  });
  sub.innerHTML = gSubLine(ix, day);
  document.querySelectorAll('.gday[data-gday]').forEach(b => b.classList.toggle('live', gDayLive(ix, b.dataset.gday)));
}

/* One fixture. Team names here run long — "Penang Sunrise Youngsters" — so the
   two sides stack rather than sitting either side of a centred score, which is
   also the shape the competition schedule already uses. */
function gameCard(c, g) {
  const done = g.st === 'COMPLETE';
  const lv = fixtureLive(g);
  const live = !!lv && lv.state === 'live';          // being played now, per the live feed
  const over = !!lv && lv.state === 'final';         // finished, and not yet in the database
  // the snapshot's own "in progress" is only as fresh as the last update of the database
  const stale = !lv && g.st === 'IN_PROGRESS';
  const hsc = lv && lv.d ? lv.d.teams[0].score : g.hs, asc = lv && lv.d ? lv.d.teams[1].score : g.as;
  const shown = done || live || over || stale;
  const hide = GAMES.hide && shown;
  const fin = done || over;
  const hw = fin && !hide && hsc > asc, aw = fin && !hide && asc > hsc;
  const side = (name, score, win, lead) => `<div class="gc-team ${win ? 'win' : ''}${lead ? ' lead' : ''}">
      ${crest(name, 26)}<span class="gc-name">${esc(name)}</span>
      <span class="gc-score">${hide ? '·' : (shown ? fmt0(score) : '')}</span>
    </div>`;
  const status = live ? `<span class="lv-tag"><span class="lv-dot"></span>LIVE</span><span class="gc-clock">${esc(liveClock(lv.d))}</span>`
    : g.st === 'NOT_PLAYED' ? `<span data-imtip="${esc(g.np || 'Never played')}">Not played</span>`
    : fin ? (hide ? 'Played' : 'Final')
    : stale ? 'In progress at the last update'
    : (g.time ? esc(g.time) : 'Scheduled');
  const foot = live ? `<a class="gc-box gc-follow" href="#/live/${g.mid}">Follow the game →</a>`
    : over ? `<a class="gc-box" href="#/live/${g.mid}">Box score and plays →</a>`
    : done && g.box ? `<a class="gc-box" href="#/c/${c.id}/box/${g.mid}">Box score →</a>`
    : lv ? `<a class="gc-box" href="#/live/${g.mid}">${lv.started ? 'Waiting for the live score →' : 'Live score here from tip-off →'}</a>`
    : `<span class="gc-nobox">${done ? 'No box score published' : 'Not played yet'}</span>`;
  return `<div class="gcard${live ? ' gc-on' : ''}" data-gmid="${esc(g.mid)}"${lv ? ' data-glive="1"' : ''}>
    <div class="gc-top"><span class="gc-status ${live ? 'on' : ''}">${status}</span>
      ${g.venue ? `<span class="gc-venue">${esc(g.venue)}</span>` : ''}</div>
    ${side(g.h, hsc, hw, live && !hide && hsc > asc)}${side(g.a, asc, aw, live && !hide && asc > hsc)}
    <div class="gc-foot">${foot}</div>
  </div>`;
}

function renderGames() {
  const ix = gameIndex();
  const day = (GAMES.day && ix.byDay[GAMES.day]) ? GAMES.day : gDefaultDay(ix);
  const i = ix.days.indexOf(day);
  const prev = i > 0 ? ix.days[i - 1] : null;
  const next = i < ix.days.length - 1 ? ix.days[i + 1] : null;
  const ym = day.slice(0, 7);
  const inMonth = ix.days.filter(d => d.slice(0, 7) === ym);

  const strip = inMonth.map(d => {
    const n = ix.byDay[d].length;
    return `<button class="gday ${d === day ? 'on' : ''}${gDayLive(ix, d) ? ' live' : ''}" data-gday="${d}">
      <span class="gday-dow">${gDow(d)}</span><span class="gday-n">${+d.slice(8)}</span>
      <span class="gday-c">${n}</span></button>`;
  }).join('');

  const rows = ix.byDay[day];
  const groups = {};
  rows.forEach(r => { (groups[r.c.id] = groups[r.c.id] || { c: r.c, gs: [] }).gs.push(r.g); });
  const blocks = Object.values(groups)
    .sort((a, b) => (a.c.label || a.c.name).localeCompare(b.c.label || b.c.name))
    .map(x => `<div class="card">
      <div class="card-head">${compCrest(x.c, 26)}
        <a href="#/c/${x.c.id}/schedule">${esc(x.c.label || x.c.name)}</a>
        <span class="hint">${x.gs.length} game${x.gs.length === 1 ? '' : 's'}</span></div>
      <div class="gcard-grid">${x.gs.map(g => gameCard(x.c, g)).join('')}</div>
    </div>`).join('');

  const latest = ix.days[ix.days.length - 1];
  return `<div class="page">
    <div class="gnav">
      <div class="gnav-month">
        <select class="filter" data-gmonth aria-label="Month">
          ${ix.months.map(m => `<option value="${m}" ${m === ym ? 'selected' : ''}>${gMonthLabel(m)}</option>`).join('')}
        </select>
      </div>
      <div class="gnav-strip">
        <button class="gstep" data-gday="${prev || ''}" ${prev ? '' : 'disabled'}
          aria-label="Previous day with games">‹</button>
        <div class="gdays">${strip}</div>
        <button class="gstep" data-gday="${next || ''}" ${next ? '' : 'disabled'}
          aria-label="Next day with games">›</button>
      </div>
      <button class="gtoggle ${GAMES.hide ? 'on' : ''}" data-ghide="1" aria-pressed="${GAMES.hide}">
        <span>Hide scores</span><i></i>
      </button>
    </div>

    <div class="gnav-sub" data-gsub="${day}">${gSubLine(ix, day)}</div>

    ${blocks}

    <div class="note gnote">${ix.days.length.toLocaleString()} days carry games, from
      ${gLongDate(ix.days[0])} to ${gLongDate(latest)} — the arrows and the strip skip the days in
      between that have none, because basketball here runs as tournaments rather than a weekly season.
      Games are grouped by competition: four of them have run on one day.</div>
  </div>`;
}
