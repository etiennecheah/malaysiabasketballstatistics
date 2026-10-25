/* =========================================================================
   Home — the front door.

   Two things: the games box at the top (what is on or next, with a countdown, and the
   latest results — the site's only list of games since update-51) and the doors into
   the rest of the site. Live games repaint #lv-hero-side (app4n_live.js).
   ========================================================================= */

const HM = { cache: {} };
const BX = k => BKEYS.indexOf(k);
const HM_DAY = 86400e3;

function hmCompleted() {
  if (HM.cache.done) return HM.cache.done;
  const rows = [];
  COMPS.forEach(c => c.games.forEach(g => { if (g.st === 'COMPLETE' && g.date) rows.push(g); }));
  rows.sort((a, b) => (liveStart(b) || 0) - (liveStart(a) || 0));
  return (HM.cache.done = rows);
}
function hmUpcoming() {
  const now = liveNow(), rows = [];
  COMPS.forEach(c => c.games.forEach(g => {
    if (g.st === 'COMPLETE' || g.st === 'NOT_PLAYED' || /to be determined/i.test(g.h + g.a)) return;
    const s = liveStart(g);
    if (s != null && s > now - LIVE_AFTER) rows.push(g);
  }));
  return rows.sort((a, b) => liveStart(a) - liveStart(b));
}
function hmDate(g, withDay) {
  const s = liveStart(g); if (s == null) return g.date || '';
  const d = new Date(s + 8 * 3600e3);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return (withDay ? day + ' ' : '') + d.getUTCDate() + ' ' + mon + (withDay ? '' : ' ' + d.getUTCFullYear());
}
function hmCountdown(ms) {
  if (ms <= 0) return 'any minute now';
  const d = Math.floor(ms / HM_DAY), h = Math.floor(ms % HM_DAY / 3600e3), m = Math.floor(ms % 3600e3 / 60e3);
  return 'in ' + (d ? d + ' d ' + h + ' h' : h ? h + ' h ' + m + ' min' : m + ' min');
}
/* ---------------------------- sections ---------------------------- */
function renderHome() {
  return `<div class="hm"><h1 class="sr-only">HoopStats MY: Malaysian basketball statistics</h1>
    <section class="hm-hero">
      <div class="bloom" style="--team:${teamBloom((hmUpcoming()[0] || {}).h || '')}"><i class="b1"></i><i class="b2"></i></div><div class="grain"></div>
      <div class="hm-hero-in hmg" id="hm-games">${hmGamesInner()}</div>
    </section>
    ${hmExplore()}
  </div>`;
}

function hmSecHead(t, link, label) {
  return `<div class="hm-sec-h"><h2>${t}</h2>${link ? `<a href="${link}">${label} →</a>` : ''}</div>`;
}

function hmExplore() {
  const items = [
    ['#/compare', 'Compare', 'Put any two players side by side, in a competition they both played.'],
    ['#/teams', 'Teams', 'Every club, state and national side — crests, rosters and records.'],
    ['#/formulas', 'Formulas', 'What every abbreviation means and where each number comes from.'],
  ];
  return `<section class="hm-sec">${hmSecHead('Explore', '', '')}
    <div class="hm-explore">${items.map(([h, t, d]) => `<a class="card hm-door" href="${h}"><b>${t}</b><span>${esc(d)}</span><i>→</i></a>`).join('')}</div></section>`;
}

/* ---------------------------- the games box (update-51) ----------------------------
   The top of Home is the site's only list of games now that the Games page is gone:
   Up next (the game being played, else the next tip-off with a countdown, then the
   fixtures after it) and Results (newest first, by competition, more on request).
   The featured card sits in #lv-hero-side, which the live layer repaints by itself. */
HM.box = { show: 'up', comp: '', nRes: 40 };   // results drawn so far; more are drawn as the list nears its end
const HM_TBD = n => /^(to be (determined|decided|confirmed)|tbd|tba|tbc)$/i.test(String(n || '').trim());
const hmTeamName = n => HM_TBD(n) ? 'To be decided' : n;
const hmMark = (n, sz) => HM_TBD(n) ? `<span class="hmg-tbd" style="width:${sz}px;height:${sz}px"></span>` : crest(n, sz);
// every fixture still to come, the to-be-decided ones included (they show as such)
function hmFixtures() {
  const now = liveNow(), rows = [];
  COMPS.forEach(c => c.games.forEach(g => {
    if (g.st === 'COMPLETE' || g.st === 'NOT_PLAYED') return;
    const s = liveStart(g);
    if (s != null && s > now - LIVE_AFTER) rows.push(g);
  }));
  return rows.sort((a, b) => liveStart(a) - liveStart(b));
}
const hmDayKey = g => { const s = liveStart(g); return s == null ? g.date || '' : new Date(s + 8 * 3600e3).toISOString().slice(0, 10); };
const hmDayLabel = g => hmDate(g, true);
function hmCdBoxes(ms) {
  if (ms <= 0) return '<span class="hmg-soon"><i></i>Tip-off</span>';
  const d = Math.floor(ms / HM_DAY), h = Math.floor(ms % HM_DAY / 3600e3), m = Math.floor(ms % 3600e3 / 60e3);
  return [[d, 'Days'], [h, 'Hrs'], [m, 'Min']].map(([v, l]) => `<span><b>${String(v).padStart(2, '0')}</b>${l}</span>`).join('');
}
// the featured card: a live game, a game the feed has just finished, else the next tip-off
function hmHeroSide() {
  const on = liveList('live')[0] || liveList('final')[0];
  if (on && on.data) {
    const d = on.data, [h, a] = d.teams, fin = d.status === 'final', c = COMP_BY_ID[on.g.cid];
    return `<a class="hmg-feat hmg-feat-on" href="#/live/${on.g.mid}">
      <div class="hmg-feat-k">${c ? compCrest(c, 22) : ''}<span>${esc(liveCompName(on.g.cid))}</span>${fin ? '<em class="hmg-fin">Final</em>' : '<em class="hmg-live"><i></i>Live</em>'}</div>
      <div class="hmg-match">${[h, a].map((t, i) => `<div class="hmg-side${fin && t.score > [h, a][1 - i].score ? ' w' : ''}">${crest(t.name, 60)}<b>${esc(t.name)}</b><strong>${t.score}</strong></div>`).join('<div class="hmg-vs">–</div>')}</div>
      <div class="hmg-feat-f"><span>${esc(liveClock(d))}</span><span class="hmg-go">${fin ? 'Box score and plays' : 'Follow the game'} →</span></div></a>`;
  }
  const g = hmUpcoming()[0];
  if (!g) return `<div class="hmg-empty">No fixtures published yet. New games show here as soon as an organiser lists them.</div>`;
  const c = COMP_BY_ID[g.cid], s = liveStart(g);
  return `<a class="hmg-feat" href="#/c/${g.cid}/schedule">
    <div class="hmg-feat-k">${c ? compCrest(c, 22) : ''}<span>${esc(liveCompName(g.cid))}</span><em>Next game</em></div>
    <div class="hmg-match"><div class="hmg-side">${crest(g.h, 60)}<b>${esc(g.h)}</b></div><div class="hmg-vs">VS</div><div class="hmg-side">${crest(g.a, 60)}<b>${esc(g.a)}</b></div></div>
    <div class="hmg-feat-f"><span>${esc(hmDayLabel(g))}${g.time ? ' · ' + esc(g.time) : ''}${g.venue ? `<small>${esc(g.venue)}</small>` : ''}</span>
      <span class="hmg-cd" data-cdbox="${s}">${hmCdBoxes(s - liveNow())}</span></div></a>`;
}
function hmTeams(g, hs, as) {
  const done = hs != null, hw = done && +hs > +as, aw = done && +as > +hs;
  const t = (n, sc, w) => `<span class="hmg-tm${w ? ' w' : ''}${HM_TBD(n) ? ' tbd' : ''}">${hmMark(n, 22)}<span class="nm">${esc(hmTeamName(n))}</span>${done ? `<b>${sc == null ? '' : sc}</b>` : ''}</span>`;
  return `<span class="hmg-tms">${t(g.h, hs, hw)}${t(g.a, as, aw)}</span>`;
}
function hmByDay(list, row) {
  let last = '';
  return list.map(g => { const k = hmDayKey(g), head = k !== last ? `<div class="hmg-day">${esc(hmDayLabel(g))}</div>` : ''; last = k; return head + row(g); }).join('');
}
function hmGamesInner() {
  const B = HM.box, feat = (liveList('live')[0] || liveList('final')[0] || {}).g || hmUpcoming()[0];
  const later = hmFixtures().filter(g => !feat || g.mid !== feat.mid).filter(g => !(LIVE.games[g.mid] && LIVE.games[g.mid].data));
  const done = hmCompleted(), comps = [...new Set(done.slice(0, 400).map(g => g.cid))].map(id => COMP_BY_ID[id]).filter(Boolean)
    .sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name));
  const res = done.filter(g => !B.comp || g.cid === B.comp), shownRes = res.slice(0, B.nRes);
  const logo = cid => { const c = COMP_BY_ID[cid]; return c ? compCrest(c, 20) : ''; };
  return `<div class="hmg-head"><div class="hm-eyebrow"><span class="hm-eyebrow-dot"></span>HoopStatsMY · Games</div>
      <div class="hmg-tabs" role="group" aria-label="Show"><button data-hmshow="up" aria-pressed="${B.show === 'up'}">Upcoming</button><button data-hmshow="res" aria-pressed="${B.show === 'res'}">Results</button></div></div>
    <div class="hmg-cols" data-show="${B.show}">
      <section class="hmg-up" aria-label="Upcoming games">
        <div class="hmg-col-h"><h2>Up next</h2><span>${later.length + (feat ? 1 : 0)} fixture${later.length + (feat ? 1 : 0) === 1 ? '' : 's'}</span></div>
        <div id="lv-hero-side">${hmHeroSide()}</div>
        ${later.length ? `<div class="hmg-scroll${later.length > 3 ? ' more' : ''}" tabindex="0" aria-label="Later fixtures"><div class="hmg-list">${hmByDay(later, g => `<a class="hmg-row" href="#/c/${g.cid}/schedule">${hmTeams(g)}<span class="hmg-meta"><b>${esc(g.time || 'Time TBC')}</b>${logo(g.cid)}</span></a>`)}</div></div>` : ''}
      </section>
      <section class="hmg-res" aria-label="Results">
        <div class="hmg-col-h"><h2>Results</h2>
          <select class="hmg-sel" data-hmcomp aria-label="Competition"><option value="">All competitions</option>${comps.map(c => `<option value="${esc(c.id)}" ${c.id === B.comp ? 'selected' : ''}>${esc(c.label || c.name)}</option>`).join('')}</select></div>
        ${shownRes.length ? `<div class="hmg-scroll hmg-rs${res.length > 6 ? ' more' : ''}" tabindex="0" aria-label="Results">${hmResList(shownRes, res.length)}</div>`
          : '<div class="hmg-empty">No results yet.</div>'}
      </section>
    </div>`;
}
// the results, newest first; the list ends with a quiet note once every result is drawn
function hmResList(shown, total) {
  const logo = cid => { const c = COMP_BY_ID[cid]; return c ? compCrest(c, 20) : ''; };
  return `<div class="hmg-list">${hmByDay(shown, g => `<a class="hmg-row" href="${g.box ? `#/c/${g.cid}/box/${g.mid}` : `#/c/${g.cid}`}" title="${esc(liveCompName(g.cid))}">${hmTeams(g, g.hs, g.as)}<span class="hmg-meta"><b>${logo(g.cid)}${g.ff ? 'Forfeit' : 'Final'}</b><span class="${g.box ? 'hmg-box' : ''}">${g.box ? 'Box score →' : 'No box score'}</span></span></a>`)}</div>`
    + (shown.length >= total ? `<div class="hmg-end">${total.toLocaleString()} result${total === 1 ? '' : 's'} · that is all of them</div>` : '<div class="hmg-end">Loading more…</div>');
}
// a repaint keeps the place the reader had scrolled each list to
const hmBoxPaint = (keepRes = true) => {
  const el = document.getElementById('hm-games'); if (!el) return;
  const tops = [...el.querySelectorAll('.hmg-scroll')].map(s => [s.classList.contains('hmg-rs'), s.scrollTop]);
  el.innerHTML = hmGamesInner();
  el.querySelectorAll('.hmg-scroll').forEach(s => { const t = tops.find(x => x[0] === s.classList.contains('hmg-rs'));
    if (t && (keepRes || !t[0])) s.scrollTop = t[1]; hmScrollEnd(s); });
};
// the fade at the foot of a list goes once its last row is in view
const hmScrollEnd = el => el.classList.toggle('end', el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
document.addEventListener('scroll', e => {
  const s = e.target; if (!s.classList || !s.classList.contains('hmg-scroll')) return;
  hmScrollEnd(s);
  // near the end of the results: draw the next forty in place
  if (s.classList.contains('hmg-rs') && s.scrollTop + s.clientHeight >= s.scrollHeight - 300) {
    const B = HM.box, res = hmCompleted().filter(g => !B.comp || g.cid === B.comp);
    if (B.nRes < res.length) { B.nRes += 40; const top = s.scrollTop; s.innerHTML = hmResList(res.slice(0, B.nRes), res.length); s.scrollTop = top; }
  }
}, true);
document.addEventListener('click', e => {
  const sh = e.target.closest && e.target.closest('[data-hmshow]');
  if (sh) { HM.box.show = sh.dataset.hmshow; hmBoxPaint(); return; }
});
document.addEventListener('change', e => {
  if (!e.target.matches || !e.target.matches('[data-hmcomp]')) return;
  HM.box.comp = e.target.value; HM.box.nRes = 40; hmBoxPaint(false);
});

/* the countdown ticks while Home is open */
setInterval(() => {
  document.querySelectorAll('[data-countdown]').forEach(el => { el.textContent = hmCountdown(+el.dataset.countdown - liveNow()); });
  document.querySelectorAll('[data-cdbox]').forEach(el => { el.innerHTML = hmCdBoxes(+el.dataset.cdbox - liveNow()); });
}, 20e3);
