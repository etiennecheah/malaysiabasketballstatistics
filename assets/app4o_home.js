/* =========================================================================
   Home — the front door.

   Its job is to give a visitor a reason to stay and a next click: the games box
   at the top (what is on or next, with a countdown, and the latest results — the
   site's only list of games since update-51), who starred lately, one
   player worth meeting, a piece of history from this date, and the doors into
   the rest of the site. Every number here comes from the database; nothing is
   invented, and anything that needs the live feed sits in #live-home and
   #lv-hero-side, which app4n_live.js repaints on its own.
   ========================================================================= */

const HM = { spot: null, cache: {} };
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
function hmRowName(row) { return PERSONS[row[BX('pid')]] || row[BX('name')] || ''; }

/* the best line in one box score */
function hmStar(mid) {
  const raw = BOX_RAW[mid]; if (!raw) return null;
  const P = BX('pts');
  let best = null;
  raw.p.forEach(r => { if (r[BX('pid')] && (!best || (r[P] || 0) > (best[P] || 0))) best = r; });
  return best;
}
function hmLine(r) {
  const reb = (r[BX('oreb')] || 0) + (r[BX('dreb')] || 0);
  const parts = [`<b>${r[BX('pts')] || 0}</b> PTS`];
  if (reb >= 5) parts.push(reb + ' REB');
  if ((r[BX('ast')] || 0) >= 4) parts.push(r[BX('ast')] + ' AST');
  return parts.join(' · ');
}

/* big single-game scoring lines among the most recent four weeks of games */
function hmBigNights(n) {
  const done = hmCompleted(); if (!done.length) return [];
  const newest = liveStart(done[0]), cut = newest - 28 * HM_DAY;
  const out = [];
  done.forEach(g => {
    if ((liveStart(g) || 0) < cut || !BOX_RAW[g.mid]) return;
    const raw = BOX_RAW[g.mid];
    raw.p.forEach(r => { if (r[BX('pid')]) out.push({ r, g, team: raw.t[r[BX('ti')]] || '' }); });
  });
  out.sort((a, b) => (b.r[BX('pts')] || 0) - (a.r[BX('pts')] || 0) || (b.r[BX('eff')] || 0) - (a.r[BX('eff')] || 0));
  const seen = {}, top = [];
  for (const x of out) { const pid = x.r[BX('pid')]; if (seen[pid]) continue; seen[pid] = 1; top.push(x); if (top.length === n) break; }
  return top;
}

/* the most points anyone has scored in one game in this database */
function hmRecords(n) {
  if (HM.cache.rec) return HM.cache.rec;
  const out = [], P = BX('pts');
  Object.keys(BOX_RAW).forEach(mid => {
    const raw = BOX_RAW[mid], g = GAME_BY_MID[mid]; if (!g) return;
    raw.p.forEach(r => { if (r[BX('pid')] && (r[P] || 0) >= 35) out.push({ r, g, team: raw.t[r[BX('ti')]] || '' }); });
  });
  out.sort((a, b) => b.r[P] - a.r[P] || (liveStart(b.g) || 0) - (liveStart(a.g) || 0));
  const seen = {}, top = [];
  for (const x of out) { const pid = x.r[BX('pid')]; if (seen[pid]) continue; seen[pid] = 1; top.push(x); if (top.length === n) break; }
  return (HM.cache.rec = top);
}

/* the standout individual lines played on today's date in earlier years (Malaysian calendar);
   if that date has too few, the three days either side of it */
function hmOnThisDay(n) {
  const now = new Date(liveNow() + 8 * 3600e3), thisYear = now.getUTCFullYear();
  const want = (now.getUTCMonth() + 1 + '').padStart(2, '0') + '-' + (now.getUTCDate() + '').padStart(2, '0');
  const today = Date.UTC(thisYear, now.getUTCMonth(), now.getUTCDate());
  const done = hmCompleted().filter(g => +g.date.slice(0, 4) < thisYear && BOX_RAW[g.mid]);
  const lines = games => {
    const out = [];
    games.forEach(g => { const raw = BOX_RAW[g.mid]; raw.p.forEach(r => { if (r[BX('pid')]) out.push({ r, g, team: raw.t[r[BX('ti')]] || '' }); }); });
    // points first; efficiency breaks ties, so a 25-and-12 beats a quiet 25
    out.sort((x, y) => (y.r[BX('pts')] || 0) - (x.r[BX('pts')] || 0) || (y.r[BX('eff')] || 0) - (x.r[BX('eff')] || 0));
    const seen = {}, top = [];
    for (const x of out) { const pid = x.r[BX('pid')]; if (seen[pid]) continue; seen[pid] = 1; top.push(x); if (top.length === n) break; }
    return top;
  };
  let exact = true, top = lines(done.filter(g => g.date.slice(5) === want));
  if (top.length < Math.min(n, 3)) {
    exact = false;
    top = lines(done.filter(g => Math.abs(Date.UTC(thisYear, +g.date.slice(5, 7) - 1, +g.date.slice(8, 10)) - today) <= 3 * HM_DAY));
  }
  return { exact, top };
}

/* competitions still being played */
function hmInProgress() {
  return COMPS.filter(c => c.games.some(g => g.st !== 'COMPLETE' && g.st !== 'NOT_PLAYED') && c.games.some(g => g.st === 'COMPLETE'))
    .map(c => {
      const playable = c.games.filter(g => g.st !== 'NOT_PLAYED');
      const done = playable.filter(g => g.st === 'COMPLETE').length;
      const next = hmUpcoming().find(g => g.cid === c.id);
      const top = (c.stand || [])[0];
      return { c, done, total: playable.length, next, top };
    });
}

/* a player with a portrait, a new one each visit */
function hmSpotPool() {
  if (HM.cache.pool) return HM.cache.pool;
  return (HM.cache.pool = Object.keys(PHOTOS).filter(pid => PERSONS[pid] && (CAREER[pid] || []).some(x => hasStats(x.p))));
}
function hmPickSpot() {
  const pool = hmSpotPool(); if (!pool.length) return null;
  let pid;
  do { pid = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && pid === HM.spot);
  return (HM.spot = pid);
}

/* ---------------------------- sections ---------------------------- */
function renderHome() {
  if (!HM.spot) hmPickSpot();
  const prog = hmInProgress();
  return `<div class="hm">
    <section class="hm-hero">
      <div class="bloom" style="--team:${teamBloom((hmUpcoming()[0] || {}).h || '')}"><i class="b1"></i><i class="b2"></i></div><div class="grain"></div>
      <div class="hm-hero-in hmg" id="hm-games">${hmGamesInner()}</div>
    </section>

    <div id="live-home">${liveHomeInner()}</div>

    <div class="hm-two">${hmNights()}${hmProgress(prog)}</div>
    <div id="hm-spot">${hmSpotlight()}</div>
    <div class="hm-two">${hmHistory()}${hmRecordBoard()}</div>
    ${hmExplore()}
  </div>`;
}

function hmSecHead(t, link, label) {
  return `<div class="hm-sec-h"><h2>${t}</h2>${link ? `<a href="${link}">${label} →</a>` : ''}</div>`;
}

/* ---------- a performance: the pieces every leaderboard on Home shares ---------- */
function hmPerf(x) {
  const r = x.r, v = k => r[BX(k)] || 0;
  const reb = v('oreb') + v('dreb');
  const chips = [];
  if (reb) chips.push([reb, 'REB']);
  if (v('ast')) chips.push([v('ast'), 'AST']);
  if (v('stl') >= 3) chips.push([v('stl'), 'STL']);
  if (v('blk') >= 3) chips.push([v('blk'), 'BLK']);
  if (v('fga')) chips.push([v('fgm') + '/' + v('fga'), 'FG']);
  if (v('tpm') >= 3) chips.push([v('tpm'), '3PM']);
  const dd = [v('pts'), reb, v('ast'), v('stl'), v('blk')].filter(n => n >= 10).length;
  return { pid: r[BX('pid')], name: hmRowName(r), pts: v('pts'), chips, badge: dd >= 3 ? 'Triple-double' : dd === 2 ? 'Double-double' : '',
           opp: x.g.h === x.team ? x.g.a : x.g.h, team: x.team, g: x.g };
}
function hmAv(p, big) {
  return `<span class="hm-av${big ? ' hm-av-l' : ''}" style="--tc:${teamColor(p.team)}">${avatar(p.pid, p.name)}</span>`;
}
function hmChips(p, n) {
  return `<span class="hm-chips2">${p.badge ? `<span class="hm-chip2 hm-chip-dd">${p.badge}</span>` : ''}${p.chips.slice(0, n).map(([a, b]) => `<span class="hm-chip2"><b>${a}</b> ${b}</span>`).join('')}</span>`;
}
/* #1 is a feature card on its team's colour; the rest are soft rows */
function hmBoard(list, ctx) {
  if (!list.length) return '';
  const P = list.map(hmPerf), top = P[0], max = top.pts || 1;
  return `<div class="hm-board">
    <a class="hm-lead" href="#/p/${top.pid}" style="--tc:${teamBloom(top.team)}">
      <span class="hm-lead-glow" aria-hidden="true"></span>
      <span class="hm-lead-top"><span class="hm-rank1">1</span><span class="hm-lead-k">${ctx.leadLabel}</span></span>
      <span class="hm-lead-body">${hmAv(top, true)}
        <span class="hm-lead-who"><b>${esc(top.name)}</b>
          <span class="hm-lead-m">${crest(top.team, 18)}${esc(top.team)} <i>vs</i> ${esc(top.opp)}</span>
          <span class="hm-lead-m2">${ctx.meta(top)}</span></span>
        <span class="hm-lead-pts"><b>${top.pts}</b><span>PTS</span></span></span>
      ${hmChips(top, 5)}
    </a>
    <div class="hm-rest">${P.slice(1).map((p, i) => `
      <a class="hm-row" href="#/p/${p.pid}">
        <span class="hm-rank">${i + 2}</span>${hmAv(p)}
        <span class="hm-row-who"><b>${esc(p.name)}</b><span>${crest(p.team, 14)}${esc(p.team)} <i>vs</i> ${esc(p.opp)} · ${ctx.meta(p)}</span>
          ${hmChips(p, 3)}</span>
        <span class="hm-row-pts"><b>${p.pts}</b><span class="hm-row-bar"><i style="width:${Math.round(p.pts / max * 100)}%"></i></span></span>
      </a>`).join('')}</div>
  </div>`;
}

function hmNights() {
  const top = hmBigNights(6);
  if (!top.length) return '';
  return `<section class="hm-sec">${hmSecHead('Big nights', '', '')}
    <p class="hm-sec-sub">The best scoring games of the last four weeks in the database.</p>
    ${hmBoard(top, { leadLabel: 'Top scorer, last 4 weeks', meta: p => esc(hmDate(p.g)) })}</section>`;
}

function hmProgress(prog) {
  if (!prog.length) return '';
  return `<section class="hm-sec">${hmSecHead('Being played now', '#/competitions', 'All competitions')}
    <p class="hm-sec-sub">Competitions with games still to come.</p>
    <div class="hm-prog">${prog.map(x => {
      const pct = Math.round(x.done / Math.max(x.total, 1) * 100);
      return `<a class="card hm-comp" href="#/c/${x.c.id}">
        <div class="hm-comp-top">${compCrest(x.c, 34)}<b>${esc(x.c.label || x.c.name)}</b></div>
        <div class="hm-meter"><i style="width:${pct}%"></i></div>
        <div class="hm-comp-meta"><span>${x.done} of ${x.total} games played</span>${x.top ? `<span>Top: <b>${esc(x.top.team)}</b> ${x.top.w}–${x.top.l}</span>` : ''}</div>
        ${x.next ? `<div class="hm-comp-next">Next · ${esc(hmDate(x.next, true))}, ${esc(x.next.time)} · ${esc(x.next.h)} vs ${esc(x.next.a)}</div>` : ''}
      </a>`;
    }).join('')}</div></section>`;
}

function hmSpotlight() {
  const pid = HM.spot; if (!pid) return '';
  const name = personName(pid);
  const career = (CAREER[pid] || []).filter(x => hasStats(x.p));
  const recent = career.slice().sort((a, b) => (b.c.year || 0) - (a.c.year || 0)).map(x => x.p.team).filter(Boolean);
  const team = recent.find(n => !stateSlug(n)) || recent[0] || '';
  const tiers = playerTiers(pid);
  const t = tiers.slice().sort((a, b) => (b.g || 0) - (a.g || 0))[0];
  const titles = playerTitles(pid).slice(0, 5);
  const hi = careerHighs(pid).pts;
  const yrs = career.map(x => x.c.year).filter(Boolean);
  const span = yrs.length ? Math.min.apply(null, yrs) + (Math.max.apply(null, yrs) > Math.min.apply(null, yrs) ? '–' + Math.max.apply(null, yrs) : '') : '';
  const n = career.length;
  return `<section class="hm-spot">
    <div class="bloom" style="--team:${teamBloom(team)}"><i class="b1"></i><i class="b2"></i></div><div class="grain"></div>
    <div class="hm-spot-in">
      <div class="hm-spot-fig"><img src="${PHOTOS[pid]}" alt="${esc(name)}"></div>
      <div class="hm-spot-copy">
        <div class="hm-eyebrow"><span class="hm-eyebrow-dot"></span>Player spotlight</div>
        <h2 class="hm-spot-name">${esc(name)}</h2>
        <div class="hm-spot-team">${team ? teamMark(team) : ''}<span>${esc(team)}</span>${span ? `<span class="hm-spot-span">· ${span} · ${n} competition${n === 1 ? '' : 's'}</span>` : ''}</div>
        ${titles.length ? `<div class="hm-spot-chips">${titles.map(x => `<span>${esc(tierShort(x.key))}${x.n > 1 ? ' ×' + x.n : ''}</span>`).join('')}</div>` : ''}
        <div class="hm-spot-stats">
          ${t ? `<div><b>${fmt1(pg(t.pts, t.g))}</b><span>PTS · ${esc(tierShort(t.key))}</span></div>
          <div><b>${fmt1(pg(t.reb, t.g))}</b><span>REB</span></div><div><b>${fmt1(pg(t.ast, t.g))}</b><span>AST</span></div>` : ''}
          ${hi ? `<div><b>${hi.v}</b><span>Career high · vs ${esc(hi.g.h === hi.line.team ? hi.g.a : hi.g.h)}</span></div>` : ''}
        </div>
        <div class="hm-spot-act"><a class="hm-btn" href="#/p/${pid}">Open ${esc(name.split(' ')[0])}'s profile</a>
          <button type="button" class="hm-btn hm-btn-ghost" id="hm-shuffle">Show another player ↻</button></div>
      </div>
    </div>
  </section>`;
}

function hmHistory() {
  const o = hmOnThisDay(4);
  if (!o.top.length) return '';
  const now = new Date(liveNow() + 8 * 3600e3), thisYear = now.getUTCFullYear();
  const today = now.getUTCDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][now.getUTCMonth()];
  return `<section class="hm-sec">${hmSecHead(o.exact ? 'On this day' : 'This week, years ago', '', '')}
    <p class="hm-sec-sub">${o.exact ? 'Standout performances on ' + today + ' in earlier seasons.' : 'Standout performances within three days of ' + today + ' in earlier seasons.'}</p>
    <div class="hm-otd">${o.top.map(x => {
      const p = hmPerf(x), y = +x.g.date.slice(0, 4), ago = thisYear - y;
      return `<a class="hm-otd-c" href="#/p/${p.pid}" style="--tc:${teamBloom(p.team)}">
        <span class="hm-otd-y"><b>${y}</b><span>${ago} year${ago === 1 ? '' : 's'} ago${o.exact ? '' : ' · ' + esc(hmDate(x.g, true).replace(/^\w+ /, ''))}</span></span>
        <span class="hm-otd-p">${hmAv(p)}<span><b>${esc(p.name)}</b><span>${crest(p.team, 14)}${esc(p.team)}</span></span></span>
        <span class="hm-otd-s"><b>${p.pts}</b><span>PTS</span>${p.chips.slice(0, 2).map(([a, b]) => `<em><b>${a}</b> ${b}</em>`).join('')}</span>
        <span class="hm-otd-g">vs ${esc(p.opp)} · ${esc(liveCompName(x.g.cid))}</span>
      </a>`;
    }).join('')}</div></section>`;
}

function hmRecordBoard() {
  const top = hmRecords(5);
  if (!top.length) return '';
  return `<section class="hm-sec">${hmSecHead('Most points in one game', '#/players', 'All players')}
    <p class="hm-sec-sub">The biggest single-game scoring lines in the database, one per player.</p>
    ${hmBoard(top, { leadLabel: 'All-time record', meta: p => esc(liveCompName(p.g.cid)) + ' · ' + p.g.date.slice(0, 4) })}</section>`;
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
HM.box = { show: 'up', comp: '', nRes: 6 };
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
        ${shownRes.length ? `<div class="hmg-list">${hmByDay(shownRes, g => `<a class="hmg-row" href="${g.box ? `#/c/${g.cid}/box/${g.mid}` : `#/c/${g.cid}`}" title="${esc(liveCompName(g.cid))}">${hmTeams(g, g.hs, g.as)}<span class="hmg-meta"><b>${logo(g.cid)}${g.ff ? 'Forfeit' : 'Final'}</b><span class="${g.box ? 'hmg-box' : ''}">${g.box ? 'Box score →' : 'No box score'}</span></span></a>`)}</div>`
          : '<div class="hmg-empty">No results yet.</div>'}
        ${res.length > B.nRes ? `<button class="hmg-more" data-hmmore="res">Show more results</button>` : ''}
      </section>
    </div>`;
}
// a repaint keeps the place the reader had scrolled the fixtures to
const hmBoxPaint = () => {
  const el = document.getElementById('hm-games'); if (!el) return;
  const sc = el.querySelector('.hmg-scroll'), top = sc ? sc.scrollTop : 0;
  el.innerHTML = hmGamesInner();
  const sc2 = el.querySelector('.hmg-scroll'); if (sc2) { sc2.scrollTop = top; hmScrollEnd(sc2); }
};
// the fade at the foot of the fixtures list goes once the last one is in view
const hmScrollEnd = el => el.classList.toggle('end', el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
document.addEventListener('scroll', e => { if (e.target.classList && e.target.classList.contains('hmg-scroll')) hmScrollEnd(e.target); }, true);
document.addEventListener('click', e => {
  const sh = e.target.closest && e.target.closest('[data-hmshow]');
  if (sh) { HM.box.show = sh.dataset.hmshow; hmBoxPaint(); return; }
  const mo = e.target.closest && e.target.closest('[data-hmmore]');
  if (mo) { HM.box.nRes += 8; hmBoxPaint(); }
});
document.addEventListener('change', e => {
  if (!e.target.matches || !e.target.matches('[data-hmcomp]')) return;
  HM.box.comp = e.target.value; HM.box.nRes = 6; hmBoxPaint();
});

document.addEventListener('click', e => {
  const sh = e.target.closest && e.target.closest('#hm-shuffle');
  if (sh) { hmPickSpot(); const s = document.getElementById('hm-spot'); if (s) s.innerHTML = hmSpotlight(); return; }
});
/* the countdown ticks while Home is open */
setInterval(() => {
  document.querySelectorAll('[data-countdown]').forEach(el => { el.textContent = hmCountdown(+el.dataset.countdown - liveNow()); });
  document.querySelectorAll('[data-cdbox]').forEach(el => { el.innerHTML = hmCdBoxes(+el.dataset.cdbox - liveNow()); });
}, 20e3);
