/* =========================================================================
   Home — the front door.

   Its job is to give a visitor a reason to stay and a next click: what is on
   (or next, with a countdown), what just happened and who starred in it, one
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
  const minY = Math.min.apply(null, COMPS.map(c => c.year).filter(Boolean));
  const games = COMPS.reduce((a, c) => a + c.nDone, 0);
  const prog = hmInProgress();
  return `<div class="hm">
    <section class="hm-hero">
      <div class="bloom" style="--team:${teamBloom((hmUpcoming()[0] || {}).h || '')}"><i class="b1"></i><i class="b2"></i></div><div class="grain"></div>
      <div class="hm-hero-in">
        <div class="hm-hero-copy">
          <div class="hm-eyebrow"><span class="hm-eyebrow-dot"></span>HoopStatsMY · since ${minY}</div>
          <h1 class="hm-title">Malaysia's game,<br><span>by the numbers.</span></h1>
          <p class="hm-lede">Box scores, season lines, titles and live games from Malaysian basketball — the age-group championships to the MBL — in one place.</p>
          <div class="hm-counts">
            <a href="#/competitions"><b>${COMPS.length}</b><span>competitions</span></a>
            <a href="#/players"><b>${Object.keys(PERSONS).length.toLocaleString()}</b><span>players</span></a>
            <a href="#/games"><b>${games.toLocaleString()}</b><span>games</span></a>
            <a href="#/games"><b>${Object.keys(BOX_RAW).length.toLocaleString()}</b><span>box scores</span></a>
          </div>
          <div class="hm-search">
            <label class="hm-sr" for="hm-q">Search players, teams and competitions</label>
            <input id="hm-q" type="search" autocomplete="off" placeholder="Find a player, a team or a competition…">
            <div class="hm-sug" id="hm-sug" role="listbox" hidden></div>
          </div>
          ${prog.length ? `<div class="hm-chips"><span>Being played now</span>${prog.map(x => `<a href="#/c/${x.c.id}">${esc(x.c.label || x.c.name)}</a>`).join('')}</div>` : ''}
        </div>
        <div class="hm-hero-side" id="lv-hero-side">${hmHeroSide()}</div>
      </div>
    </section>

    <div id="live-home">${liveHomeInner()}</div>

    ${hmResults()}
    <div class="hm-two">${hmNights()}${hmProgress(prog)}</div>
    <div id="hm-spot">${hmSpotlight()}</div>
    <div class="hm-two">${hmHistory()}${hmRecordBoard()}</div>
    ${hmVideos()}
    ${hmExplore()}
  </div>`;
}

/* right side of the hero: the live game, else the next tip-off with a countdown, else the last result */
function hmHeroSide() {
  const on = liveList('live')[0] || liveList('final')[0];
  if (on && on.data) {
    const d = on.data, [h, a] = d.teams, fin = d.status === 'final';
    return `<a class="hm-next hm-next-live" href="#/live/${on.g.mid}">
      <div class="hm-next-k">${fin ? '<span class="lv-tag lv-tag-fin">FINAL</span>' : '<span class="lv-tag"><span class="lv-dot"></span>LIVE</span>'}<span>${esc(liveCompName(on.g.cid))}</span></div>
      ${[h, a].map(t => `<div class="hm-next-team">${crest(t.name, 34)}<span>${esc(t.name)}</span><b>${t.score}</b></div>`).join('')}
      <div class="hm-next-foot"><span>${esc(liveClock(d))}</span><span>${fin ? 'Box score' : 'Follow the game'} →</span></div></a>`;
  }
  const g = hmUpcoming()[0];
  if (g) {
    return `<div class="hm-next">
      <div class="hm-next-k"><span>Next tip-off</span><span>${esc(liveCompName(g.cid))}</span></div>
      <div class="hm-next-team">${crest(g.h, 34)}<span>${esc(g.h)}</span></div>
      <div class="hm-next-vs">vs</div>
      <div class="hm-next-team">${crest(g.a, 34)}<span>${esc(g.a)}</span></div>
      <div class="hm-next-foot"><span>${esc(hmDate(g, true))} · ${esc(g.time)}</span><b data-countdown="${liveStart(g)}">${hmCountdown(liveStart(g) - liveNow())}</b></div>
    </div>`;
  }
  const r = hmCompleted()[0];
  return r ? `<a class="hm-next" href="#/c/${r.cid}/box/${r.mid}"><div class="hm-next-k"><span>Latest result</span><span>${esc(liveCompName(r.cid))}</span></div>
    <div class="hm-next-team">${crest(r.h, 34)}<span>${esc(r.h)}</span><b>${r.hs}</b></div>
    <div class="hm-next-team">${crest(r.a, 34)}<span>${esc(r.a)}</span><b>${r.as}</b></div>
    <div class="hm-next-foot"><span>${esc(hmDate(r))}</span><span>Box score →</span></div></a>` : '';
}

function hmSecHead(t, link, label) {
  return `<div class="hm-sec-h"><h2>${t}</h2>${link ? `<a href="${link}">${label} →</a>` : ''}</div>`;
}

function hmResults() {
  const rows = hmCompleted().slice(0, 6);
  if (!rows.length) return '';
  return `<section class="hm-sec">${hmSecHead('Latest results', '#/games', 'All games')}
    <div class="hm-res">${rows.map(g => {
      const star = hmStar(g.mid), hw = g.hs > g.as;
      const href = g.box ? `#/c/${g.cid}/box/${g.mid}` : `#/c/${g.cid}`;
      return `<a class="hm-tile" href="${href}">
        <div class="hm-tile-k"><span>${esc(liveCompName(g.cid))}</span><span>${esc(hmDate(g))}</span></div>
        <div class="hm-tile-team${hw ? ' hm-win' : ''}">${crest(g.h, 26)}<span>${esc(g.h)}</span><b>${g.hs}</b></div>
        <div class="hm-tile-team${hw ? '' : ' hm-win'}">${crest(g.a, 26)}<span>${esc(g.a)}</span><b>${g.as}</b></div>
        ${star ? `<div class="hm-tile-star">${avatar(star[BX('pid')])}<span><span class="hm-star-n">${esc(hmRowName(star))}</span><span class="hm-star-l">${hmLine(star)}</span></span></div>` : ''}
      </a>`;
    }).join('')}</div></section>`;
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
    }).join('')}</div>${hmComing()}</section>`;
}

/* the next few fixtures after the one the hero is counting down to */
function hmComing() {
  const rows = hmUpcoming().filter(g => !LIVE.games[g.mid]).slice(1, 5);
  if (!rows.length) return '';
  return `<div class="hm-coming"><div class="hm-coming-k">Coming up</div>${rows.map(g => `
    <div class="hm-coming-r"><span class="hm-coming-d"><b>${esc(hmDate(g, true).split(' ').slice(1).join(' '))}</b><span>${esc(g.time)}</span></span>
      <span class="hm-coming-m"><span>${crest(g.h, 18)}${esc(g.h)}</span><span>${crest(g.a, 18)}${esc(g.a)}</span></span>
      <span class="hm-coming-in" data-countdown="${liveStart(g)}">${hmCountdown(liveStart(g) - liveNow())}</span></div>`).join('')}</div>`;
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

function hmVideos() {
  const V = (DB.videos && DB.videos.videos) || [];
  if (!V.length) return '';
  return `<section class="hm-sec">${hmSecHead('Watch', '#/videos', 'All ' + V.length + ' videos')}
    <div class="hm-vids">${V.slice(0, 4).map(v => {
      const [hook, ctx] = vidSplit(v.t);
      return `<a class="hm-vid" href="#/videos" data-hmvid="${esc(v.id)}">
        <span class="vid-thumb"><span class="vid-thumb-ph">${esc(hook)}</span>
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">
          <span class="vid-len">${esc(v.len || '')}</span><span class="hm-play" aria-hidden="true"></span></span>
        <span class="vid-hook">${esc(hook)}</span><span class="vid-ctx">${esc(ctx)}</span></a>`;
    }).join('')}</div></section>`;
}

function hmExplore() {
  const stages = 10;
  const items = [
    ['#/pathway', 'Pathway', `From the school court to the MBL — ${stages} stages, age by age.`],
    ['#/compare', 'Compare', 'Put any two players side by side, in a competition they both played.'],
    ['#/teams', 'Teams', 'Every club, state and national side — crests, rosters and records.'],
    ['#/formulas', 'Formulas', 'What every abbreviation means and where each number comes from.'],
  ];
  return `<section class="hm-sec">${hmSecHead('Explore', '', '')}
    <div class="hm-explore">${items.map(([h, t, d]) => `<a class="card hm-door" href="${h}"><b>${t}</b><span>${esc(d)}</span><i>→</i></a>`).join('')}</div></section>`;
}

/* ---------------------------- search with suggestions ---------------------------- */
function hmSuggest(q) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return [];
  const score = (n) => { const s = n.toLowerCase(); return s.startsWith(q) ? 0 : s.split(/[\s,]+/).some(w => w.startsWith(q)) ? 1 : s.includes(q) ? 2 : -1; };
  const ppl = [];
  Object.keys(PERSONS).forEach(pid => {
    const r = score(PERSONS[pid]); if (r < 0) return;
    ppl.push([r, -(CAREER[pid] || []).length, pid]);
  });
  ppl.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = ppl.slice(0, 6).map(([, , pid]) => ({ href: '#/p/' + pid, label: PERSONS[pid], kind: 'Player', pid }));
  const seenT = {};
  Object.keys(TEAMS).forEach(tid => {
    const n = TEAMS[tid], k = teamKey(n); if (seenT[k] || score(n) < 0 || out.length >= 9) return; seenT[k] = 1;
    out.push({ href: '#/t/' + encodeURIComponent(k), label: n, kind: 'Team', team: n });
  });
  COMPS.forEach(c => { if (out.length < 11 && score(c.label || c.name) >= 0) out.push({ href: '#/c/' + c.id, label: c.label || c.name, kind: 'Competition' }); });
  return out;
}
function hmDrawSug(list, sel) {
  const box = document.getElementById('hm-sug'); if (!box) return;
  box.hidden = !list.length;
  box.innerHTML = list.map((x, i) => `<a class="hm-sug-i${i === sel ? ' on' : ''}" href="${x.href}" role="option">
    ${x.pid ? avatar(x.pid) : x.team ? crest(x.team, 24) : '<span class="hm-sug-c">C</span>'}
    <span>${esc(x.label)}</span><em>${x.kind}</em></a>`).join('');
}
HM.sel = -1; HM.list = [];
document.addEventListener('input', e => {
  if (e.target.id !== 'hm-q') return;
  HM.list = hmSuggest(e.target.value); HM.sel = -1; hmDrawSug(HM.list, HM.sel);
});
document.addEventListener('keydown', e => {
  if (e.target.id !== 'hm-q' || !HM.list.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    HM.sel = (HM.sel + (e.key === 'ArrowDown' ? 1 : -1) + HM.list.length) % HM.list.length;
    hmDrawSug(HM.list, HM.sel);
  } else if (e.key === 'Enter') {
    location.hash = HM.list[Math.max(HM.sel, 0)].href;
  } else if (e.key === 'Escape') { HM.list = []; hmDrawSug([], -1); }
});
document.addEventListener('focusout', e => {
  if (e.target.id === 'hm-q') setTimeout(() => hmDrawSug([], -1), 180);
});
document.addEventListener('click', e => {
  const sh = e.target.closest && e.target.closest('#hm-shuffle');
  if (sh) { hmPickSpot(); const s = document.getElementById('hm-spot'); if (s) s.innerHTML = hmSpotlight(); return; }
  const v = e.target.closest && e.target.closest('[data-hmvid]');
  if (v) window.VID_PENDING = v.dataset.hmvid;
});
/* the countdown ticks while Home is open */
setInterval(() => {
  document.querySelectorAll('[data-countdown]').forEach(el => { el.textContent = hmCountdown(+el.dataset.countdown - liveNow()); });
}, 30e3);
