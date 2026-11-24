/* =========================================================================
   Today — the front door (update-115).

   A quiet page with one job: the games. A welcome at the top (a greeting for the
   time of day in Malaysia, the state of play, and a way into the tour), the next
   tip-off with a ticking countdown (or the games on now), then two lists side by
   side: what is coming up and the latest results. Nothing else.

   Live games repaint #lv-hero-side and #hm-upn by themselves (app4n_live.js).
   The welcome guide (app6c_guide.js) still opens on a first visit, and the
   "Take the tour" button in the welcome brings it back.
   ========================================================================= */

const HM = { cache: {} };
const BX = k => BKEYS.indexOf(k);
const HM_DAY = 86400e3;

function hmCompleted() {
  if (HM.cache.done) return HM.cache.done;
  const rows = [];
  COMPS.forEach(c => c.games.forEach(g => { if (g.st === 'COMPLETE' && g.date) rows.push(g); }));
  // a game with no tip-off time (a FIBA sheet, an old fixture list) sorts by its date, as if at noon
  const when = g => { const s = liveStart(g); if (s != null) return s; const [y, m, d] = g.date.split('-').map(Number); return Date.UTC(y, m - 1, d, 4) || 0; };
  rows.sort((a, b) => when(b) - when(a));
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
const HM_TBD = n => /^(to be (determined|decided|confirmed)|tbd|tba|tbc)$/i.test(String(n || '').trim());
const hmTeamName = n => HM_TBD(n) ? 'To be decided' : n;
const hmMark = (n, sz) => HM_TBD(n) ? `<span class="td-tbd" style="width:${sz}px;height:${sz}px"></span>` : crest(n, sz);
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
// "Today", "Tomorrow", "In 3 days" for a fixture; "Yesterday" for a result
function hmRel(g) {
  const k = hmDayKey(g); if (!k) return '';
  const today = new Date(liveNow() + 8 * 3600e3).toISOString().slice(0, 10);
  const n = Math.round((Date.parse(k) - Date.parse(today)) / HM_DAY);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : n > 1 && n < 7 ? 'In ' + n + ' days' : '';
}

/* ---------------------------- the page ---------------------------- */
HM.box = { show: 'up', nUp: 6, nRes: 8 };
function hmGreeting() {
  const h = new Date(liveNow() + 8 * 3600e3).getUTCHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function hmToday() {
  const d = new Date(liveNow() + 8 * 3600e3);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] + ', ' + d.getUTCDate() + ' '
    + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()];
}
// the line under the greeting: what is happening right now
function hmPulse() {
  const nLive = liveList('live').length;
  if (nLive) return `<button type="button" class="td-pill live" data-td-jump="lv-hero-side"><i></i>${nLive} game${nLive === 1 ? '' : 's'} live now</button>`;
  const g = hmUpcoming()[0];
  if (g) { const r = hmRel(g); return `<button type="button" class="td-pill" data-td-jump="lv-hero-side"><i></i>Next tip-off ${r ? r.toLowerCase() : esc(hmDayLabel(g))}${g.time ? ', ' + esc(g.time) : ''}</button>`; }
  return '';
}
const hmWords = (t, base) => t.split(' ').map((w, i) => `<span class="w" style="--d:${(base + i * 0.07).toFixed(2)}s">${w}</span>`).join(' ');
function renderHome() {
  return `<div class="td"><h1 class="sr-only">HoopStats MY: Malaysian basketball statistics</h1>
    ${typeof NTX !== 'undefined' ? NTX.render() : ''}
    <div class="td-feat-wrap" id="lv-hero-side">${hmHeroSide()}</div>
    <div class="td-games" id="hm-games">${hmGamesInner()}</div>
    ${hmHoopsLife()}
    ${hmHelp()}
  </div>`;
}
// above the guide box: HoopsLife MY, a Malaysian basketball career simulator (update-127).
// The player card is a picture of the idea, not data: a rating that fills, three attributes,
// and the road from youth basketball to the national team lighting up stop by stop.
function hmHoopsLife() {
  const road = ['U15', 'U18', 'D-League', 'MBL', 'Malaysia'];
  const attrs = [['Shooting', 82], ['Handles', 74], ['Defence', 69]];
  return `<section class="hlm" aria-labelledby="hlm-t">
    <div class="hlm-court" aria-hidden="true"></div>
    <div class="hlm-copy">
      <span class="hlm-eye"><i aria-hidden="true"></i>Play · Career simulator</span>
      <h2 id="hlm-t">Write your own <em>Malaysian basketball</em> career</h2>
      <p><b>HoopsLife MY</b> is a Malaysian basketball career simulator. Take a player from the youth courts toward the MBL and the national team, one season at a time.</p>
      <a class="hlm-go" href="https://hoopslifemy.com/" target="_blank" rel="noopener"><span>Play on hoopslifemy.com</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>
      <small class="hlm-note">Opens in a new tab · your place here stays put</small>
    </div>
    <div class="hlm-stage" aria-hidden="true">
      <div class="hlm-card">
        <div class="hlm-top">
          <span class="hlm-av"><svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="4"/><path d="M4.5 21c.9-4.3 3.9-6.6 7.5-6.6s6.6 2.3 7.5 6.6"/></svg></span>
          <span class="hlm-id"><b>Your player</b><small>PG · 17 · Malaysia</small></span>
          <span class="hlm-ovr"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18"/></svg><b class="n"></b><small>OVR</small></span>
        </div>
        <div class="hlm-attrs">${attrs.map(([k, v], i) => `<div style="--v:${v}%;--i:${i}"><span>${k}</span><i><b></b></i><em>${v}</em></div>`).join('')}</div>
        <div class="hlm-road"><span class="hlm-line"><b></b></span>${road.map((r, i) => `<span class="hlm-stop" style="--i:${i}"><i></i><small>${r}</small></span>`).join('')}</div>
      </div>
      <span class="hlm-ball"></span>
    </div>
  </section>`;
}
// the foot of Today: three things worth knowing, and the tour
function hmHelp() {
  const g = k => `<button type="button" class="gl" data-imtip="${esc((typeof STAT_GLOSS !== 'undefined' && STAT_GLOSS[k]) || k)}">${esc(k)}</button>`;
  return `<section class="td-help" aria-label="New to HoopStatsMY">
    <div class="td-help-h"><span class="td-eyebrow">New to HoopStatsMY?</span><h2>Three things worth knowing</h2></div>
    <ol class="td-tips">
      <li><b>Search finds anything</b><span>Players, teams, leagues, even stat terms. Press <kbd>/</kbd> or tap Search.</span></li>
      <li><b>Dotted words explain themselves</b><span>Hover or tap ${g('TS%')}, ${g('+/-')} or ${g('EFF')} to see what they mean.</span></li>
      <li><b>Compare any two players</b><span>Side by side, and head to head where they met. <a class="td-link" href="#/compare">Try it</a></span></li>
    </ol>
    <button type="button" class="td-tourbtn" data-td-tour><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>Take the 30-second tour</button>
  </section>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-td-tour]'); if (!b) return;
  if (typeof HSG !== 'undefined' && HSG.tour) HSG.tour();
});

/* ---------------------------- the spotlight: on now, or next ---------------------------- */
const HM_LV = { seen: new Set(), score: {} };
const hmLiveGames = () => [...liveList('live'), ...liveList('final')].filter(x => x.data)
  .sort((p, q) => (p.state === 'final') - (q.state === 'final') || (liveStart(p.g) || 0) - (liveStart(q.g) || 0));
// how far the game has run, 0–1, from the period and the clock (ten-minute quarters)
function hmLvProgress(d) {
  if (d.status === 'final') return 1;
  const m = String(d.clock || '').match(/(\d+):(\d{2})/), left = m ? +m[1] * 60 + +m[2] : 600;
  const ot = /OVERTIME/i.test(d.periodType || '') || d.inOT;
  return ot ? 1 : Math.max(0, Math.min(1, ((Math.min(d.period || 1, 4) - 1) * 600 + (600 - Math.min(600, left))) / 2400));
}
function hmLvScore(mid, i, v, at) {
  const k = mid + ':' + i, o = HM_LV.score[k];
  if (!o || o.at !== at) HM_LV.score[k] = { v, was: o ? o.v : null, at };
  const s = HM_LV.score[k];
  const roll = s.was != null && s.was !== v && at && Date.now() - at < 3000 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  return roll ? `<span class="lvc-roll"><b>${s.was}</b><b>${v}</b></span>` : String(v);
}
function hmLiveCard(x, i) {
  const d = x.data, [h, a] = d.teams, fin = d.status === 'final', c = COMP_BY_ID[x.g.cid], mid = x.g.mid;
  const first = !HM_LV.seen.has(mid); HM_LV.seen.add(mid);
  const hl = h.score > a.score, al = a.score > h.score;
  return `<a class="td-live${fin ? ' fin' : ''}${first ? ' in' : ''}" href="#/live/${mid}" style="--p:${hmLvProgress(d).toFixed(3)};--i:${i}">
    <div class="td-fk">${c ? compCrest(c, 20) : ''}<span>${esc(liveCompName(x.g.cid))}</span><em class="${fin ? 'fin' : 'on'}">${fin ? 'Final' : '<i></i>Live'}</em></div>
    <div class="td-lm">
      <div class="td-ls${hl ? ' lead' : ''}">${crest(h.name, 40)}<b>${esc(h.name)}</b><strong>${hmLvScore(mid, 0, h.score, x.at)}</strong></div>
      <div class="td-ls${al ? ' lead' : ''}">${crest(a.name, 40)}<b>${esc(a.name)}</b><strong>${hmLvScore(mid, 1, a.score, x.at)}</strong></div>
    </div>
    <div class="td-lf"><span>${esc(fin ? 'Final' : liveClock(d))}</span><span class="go">${fin ? 'Box score and plays' : 'Follow the game'}<i>→</i></span></div>
    ${fin ? '' : '<span class="td-lbar"><i></i></span>'}</a>`;
}
// "3 live · 7 games to come"
function hmUpCount(nLater, feat) {
  const nLive = liveList('live').length, n = nLater + Math.max(nLive, feat ? 1 : 0);
  return `${nLive ? `<em class="lvn">${nLive} live</em> · ` : ''}${n} to come`;
}
function hmUpCountNow() {
  const feat = (liveList('live')[0] || liveList('final')[0] || {}).g || hmUpcoming()[0];
  return hmUpCount(hmFixtures().filter(g => !feat || g.mid !== feat.mid).filter(g => !(LIVE.games[g.mid] && LIVE.games[g.mid].data)).length, feat);
}
function hmCdBoxes(ms) {
  if (ms <= 0) return '<span class="td-soon"><i></i>Tip-off</span>';
  const d = Math.floor(ms / HM_DAY), h = Math.floor(ms % HM_DAY / 3600e3), m = Math.floor(ms % 3600e3 / 60e3), s = Math.floor(ms % 60e3 / 1e3);
  return [[d, 'days'], [h, 'hrs'], [m, 'min'], [s, 'sec']].map(([v, l]) => `<span class="td-cu" data-u="${l}"><b>${String(v).padStart(2, '0')}</b><small>${l}</small></span>`).join('');
}
// the spotlight: the games on now, a game the feed has just finished, else the next tip-off
function hmHeroSide() {
  // the welcome's status line follows the live layer too
  setTimeout(() => { const p = document.getElementById('td-pulse'); if (p) p.innerHTML = hmPulse(); }, 0);
  const many = hmLiveGames();
  if (many.length) return `<div class="td-lives${many.length > 1 ? ' many' : ''}">${many.map(hmLiveCard).join('')}</div>`;
  const g = hmUpcoming()[0];
  if (!g) return `<div class="td-feat td-none"><b>No fixtures published yet</b><span>New games show here as soon as an organiser lists them.</span></div>`;
  const c = COMP_BY_ID[g.cid], s = liveStart(g), r = hmRel(g);
  const side = (n, cls) => `<div class="td-side ${cls}">${hmMark(n, 72)}<b>${esc(hmTeamName(n))}</b></div>`;
  return `<a class="td-feat" href="#/c/${g.cid}/schedule" style="--th:${teamBloom(g.h)};--ta:${teamBloom(g.a)}">
    <div class="td-fk">${c ? compCrest(c, 20) : ''}<span>${esc(liveCompName(g.cid))}</span><em>Next game${r ? ' · ' + r : ''}</em></div>
    <div class="td-match">${side(g.h, 'h')}<div class="td-vs"><span>vs</span></div>${side(g.a, 'a')}</div>
    <div class="td-ff"><span class="td-when"><b>${esc(hmDayLabel(g))}${g.time ? ' · ' + esc(g.time) : ''}</b>${g.venue ? `<small>${esc(g.venue)}</small>` : ''}</span>
      <span class="td-cd" data-cdbox="${s}" aria-label="Countdown to tip-off">${hmCdBoxes(s - liveNow())}</span></div></a>`;
}

/* ---------------------------- the two lists ---------------------------- */
function hmRow(g, done) {
  const c = COMP_BY_ID[g.cid], hs = done ? g.hs : null, as = done ? g.as : null;
  const hw = done && +hs > +as, aw = done && +as > +hs;
  const t = (n, sc, w) => `<span class="td-tm${w ? ' w' : ''}${HM_TBD(n) ? ' tbd' : ''}">${hmMark(n, 26)}<span class="nm">${esc(hmTeamName(n))}</span>${done ? `<b>${sc == null ? '' : sc}</b>` : ''}</span>`;
  const href = done ? (g.box ? `#/c/${g.cid}/box/${g.mid}` : `#/c/${g.cid}`) : `#/c/${g.cid}/schedule`;
  return `<a class="td-row" href="${href}" title="${esc(liveCompName(g.cid))}">
    ${done ? '' : `<span class="td-t"><b>${esc((g.time || 'TBC').replace(/\s?(AM|PM)$/i, ''))}</b><small>${esc(((g.time || '').match(/AM|PM/i) || [''])[0])}</small></span>`}
    <span class="td-tms">${t(g.h, hs, hw)}${t(g.a, as, aw)}</span>
    <span class="td-m">${done && g.ff ? '<small>Forfeit</small>' : ''}${c ? compCrest(c, 38) : ''}<i class="td-arr">→</i></span></a>`;
}
function hmByDay(list, done) {
  let last = '', k = 0;
  return list.map(g => {
    const key = hmDayKey(g), r = hmRel(g);
    const head = key !== last ? `<div class="td-day"><b>${esc(hmDayLabel(g))}</b>${r ? `<span>${r}</span>` : ''}</div>` : '';
    last = key;
    return head + hmRow(g, done).replace('class="td-row"', `class="td-row" style="--i:${Math.min(k++, 12)}"`);
  }).join('');
}
function hmGamesInner() {
  const B = HM.box, feat = (liveList('live')[0] || liveList('final')[0] || {}).g || hmUpcoming()[0];
  const later = hmFixtures().filter(g => !feat || g.mid !== feat.mid).filter(g => !(LIVE.games[g.mid] && LIVE.games[g.mid].data));
  const res = hmCompleted();
  const up = later.slice(0, B.nUp), rs = res.slice(0, B.nRes);
  return `<div class="td-switch" role="group" aria-label="Show"><button type="button" data-hmshow="up" aria-pressed="${B.show === 'up'}">Coming up</button><button type="button" data-hmshow="res" aria-pressed="${B.show === 'res'}">Latest results</button><span class="td-sw-ind" aria-hidden="true"></span></div>
    <div class="td-cols" data-show="${B.show}">
      <section class="td-col td-up" aria-label="Coming up">
        <header class="td-ch"><h2>Coming up</h2><span id="hm-upn">${hmUpCount(later.length, feat)}</span></header>
        ${up.length ? `<div class="td-list">${hmByDay(up, false)}</div>${later.length > up.length ? `<button type="button" class="td-more" data-hmmore="up">Show ${Math.min(8, later.length - up.length)} more<i>↓</i></button>` : ''}`
          : '<div class="td-empty">Nothing else is scheduled yet.</div>'}
      </section>
      <section class="td-col td-res hmg-res" aria-label="Latest results">
        <header class="td-ch"><h2>Latest results</h2><span>newest first</span></header>
        ${rs.length ? `<div class="td-list">${hmByDay(rs, true)}</div>${res.length > rs.length ? `<button type="button" class="td-more" data-hmmore="res">Show ${Math.min(10, res.length - rs.length)} more<i>↓</i></button>` : ''}`
          : '<div class="td-empty">No results yet.</div>'}
      </section>
    </div>`;
}
const hmBoxPaint = () => { const el = document.getElementById('hm-games'); if (el) { el.innerHTML = hmGamesInner(); el.classList.add('again'); } };
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-hmshow], [data-hmmore], [data-td-jump]'); if (!t) return;
  const d = t.dataset;
  if (d.hmshow) { HM.box.show = d.hmshow; const c = document.querySelector('.td-cols'); if (c) c.dataset.show = d.hmshow;
    document.querySelectorAll('[data-hmshow]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hmshow === d.hmshow))); return; }
  if (d.hmmore) { if (d.hmmore === 'up') HM.box.nUp += 8; else HM.box.nRes += 10; hmBoxPaint(); return; }
  if (d.tdJump) { e.preventDefault(); const el = document.getElementById(d.tdJump); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); }
});

/* the countdown ticks every second while Today is open; a digit that changes rolls in */
setInterval(() => {
  document.querySelectorAll('[data-countdown]').forEach(el => { el.textContent = hmCountdown(+el.dataset.countdown - liveNow()); });
  document.querySelectorAll('[data-cdbox]').forEach(el => {
    const tmp = document.createElement('span'); tmp.innerHTML = hmCdBoxes(+el.dataset.cdbox - liveNow());
    const now = el.querySelectorAll('.td-cu'), next = tmp.querySelectorAll('.td-cu');
    if (now.length !== next.length) { el.innerHTML = tmp.innerHTML; return; }
    next.forEach((n, i) => { const b = now[i].querySelector('b'), v = n.querySelector('b').textContent;
      if (b.textContent !== v) { b.textContent = v; now[i].classList.remove('tick'); void now[i].offsetWidth; now[i].classList.add('tick'); } });
  });
}, 1000);
