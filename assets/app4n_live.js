/* =========================================================================
   Live layer — the Home tab, the live bar on every page and the live game
   page (#/live/<mid>).

   Everything else on the site is a stored snapshot. This part is not: while a
   game is on it asks the HoopStatsMY relay (a Cloudflare Worker, see
   relay/worker.js and claude/live-relay.md) for that game's score, clock,
   players and plays, which the relay takes from Genius Sports' LiveStats feed.

   Which games to ask about comes from the snapshot's own fixture list: a game
   still marked as not played whose tip-off is between 20 minutes from now and
   3.5 hours ago. Outside those windows the site never contacts the relay, and
   if the relay does not answer the page simply shows the saved data.

   Requests: every 30 s on Home and on a live game page, every 60 s elsewhere,
   and none while the tab is in the background (Cloudflare's free plan allows
   100,000 a day; see claude/live-game-feed.md).
   ========================================================================= */

const LIVE_RELAY = 'https://hoopstatsmy-live.etiennecheah26.workers.dev';
const LIVE_BEFORE = 20 * 60e3, LIVE_AFTER = 3.5 * 3600e3;
const LIVE = { games: {}, timer: null, last: 0, fails: 0, now: null };

/* tip-off as a timestamp: the fixture's date and time are Malaysian (UTC+8) */
function liveStart(g) {
  if (!g || !g.date) return null;
  const [y, m, d] = g.date.split('-').map(Number);
  const t = String(g.time || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!t) return null;
  let h = +t[1] % 12;
  if (t[3] && /pm/i.test(t[3])) h += 12;
  if (!t[3]) h = +t[1];
  return Date.UTC(y, m - 1, d, h - 8, +t[2]);
}
function liveNow() { return LIVE.now != null ? LIVE.now : Date.now(); }

/* the fixtures that could be on right now */
function liveCandidates() {
  const now = liveNow(), out = [];
  COMPS.forEach(c => c.games.forEach(g => {
    if (g.st === 'COMPLETE' || g.st === 'NOT_PLAYED') return;
    const s = liveStart(g);
    if (s != null && now >= s - LIVE_BEFORE && now <= s + LIVE_AFTER) out.push(g);
  }));
  return out.sort((a, b) => liveStart(a) - liveStart(b));
}

function liveFast() { return /^#\/(home|live\/)/.test(location.hash) || location.hash === '' || location.hash === '#/'; }

async function liveTick() {
  clearTimeout(LIVE.timer);
  if (document.hidden) return;                      // resumes on visibilitychange
  const cands = liveCandidates();
  const keep = {};
  await Promise.all(cands.map(async g => {
    const prev = LIVE.games[g.mid] || { g, state: 'pending', data: null, at: 0 };
    prev.g = g;
    try {
      const r = await fetch(LIVE_RELAY + '/game/' + g.mid);
      if (r.status === 404) { prev.state = prev.data ? prev.state : 'pending'; prev.err = 0; }
      else if (!r.ok) throw new Error('relay ' + r.status);
      else {
        const d = await r.json();
        prev.data = d; prev.at = Date.now(); prev.err = 0;
        prev.state = d.status === 'final' ? 'final' : d.status === 'live' ? 'live' : 'pending';
      }
    } catch (e) { prev.err = Date.now(); }
    keep[g.mid] = prev;
  }));
  LIVE.games = keep;
  LIVE.last = Date.now();
  liveRefresh();
  // nothing near tip-off: look again in 5 minutes, without any network request
  const wait = cands.length ? (liveFast() ? 30e3 : 60e3) : 5 * 60e3;
  LIVE.timer = setTimeout(liveTick, wait);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) liveTick(); });

function liveList(state) { return Object.values(LIVE.games).filter(x => !state || x.state === state); }
function liveErr() { const v = Object.values(LIVE.games); return v.length && v.every(x => x.err && !x.data); }

/* repaint only the live parts, so the reader keeps their scroll position */
function liveRefresh() {
  const bar = document.getElementById('live-bar');
  if (bar) bar.innerHTML = liveBarInner();
  const home = document.getElementById('live-home');
  if (home) home.innerHTML = liveHomeInner();
  const side = document.getElementById('lv-hero-side');
  if (side && typeof hmHeroSide === 'function') side.innerHTML = hmHeroSide();
  const page = document.getElementById('live-game');
  if (page) page.innerHTML = liveGameInner(page.dataset.mid);
  // the fixture lists: the Games page and a competition's schedule
  if (typeof gamesLiveRefresh === 'function') gamesLiveRefresh();
  if (typeof scheduleLiveRefresh === 'function') scheduleLiveRefresh();
}

/* ---------------------------- formatting ---------------------------- */
function livePeriod(d) {
  if (!d) return '';
  const ot = /OVERTIME/i.test(d.periodType || '') || d.inOT;
  const n = ot ? (d.period > 4 ? d.period - 4 : d.period) : d.period;
  return ot ? 'OT' + (n > 1 ? n : '') : 'Q' + n;
}
function liveClock(d) {
  if (!d) return '';
  if (d.status === 'final') return 'Final';
  const last = (d.plays || [])[0];
  if (last && last.type === 'period' && last.sub === 'end') {
    return /OVERTIME/i.test(d.periodType || '') ? 'End of ' + livePeriod(d)
      : d.period === 2 ? 'Half-time' : 'End of ' + livePeriod(d);
  }
  const c = String(d.clock || '').replace(/^0(\d:)/, '$1');
  return livePeriod(d) + ' · ' + c;
}
function liveAgo(t) {
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? s + ' s ago' : Math.round(s / 60) + ' min ago';
}
function liveTip(g) {
  const s = liveStart(g); if (s == null) return '';
  const d = new Date(s + 8 * 3600e3);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return day + ' ' + d.getUTCDate() + ' ' + mon + ' · ' + g.time;
}
function liveCompName(cid) { const c = COMP_BY_ID[cid]; return c ? (c.label || c.name) : ''; }

/* a player in the feed → their profile, through the competition roster (team + shirt number) */
const LIVE_ROSTER = {};
function livePid(cid, team, no) {
  if (!no) return null;
  if (!LIVE_ROSTER[cid]) {
    const m = {}, c = COMP_BY_ID[cid];
    Object.entries((c && c.roster) || {}).forEach(([tid, rows]) => {
      const nm = String(TEAMS[tid] || '').toUpperCase();
      rows.forEach(r => { m[nm + '#' + r.num] = r.pid; });
    });
    LIVE_ROSTER[cid] = m;
  }
  return LIVE_ROSTER[cid][String(team || '').toUpperCase() + '#' + no] || null;
}
function livePlayer(cid, team, p) {
  const pid = livePid(cid, team, p.no);
  const n = esc(p.name || '');
  return pid && PERSONS[pid] ? `<a href="#/p/${pid}">${n}</a>` : n;
}

const LIVE_SUB = { jumpshot: 'jump shot', layup: 'layup', drivinglayup: 'driving layup', dunk: 'dunk',
  hookshot: 'hook shot', tipin: 'tip-in', alleyoop: 'alley-oop', fadeaway: 'fadeaway', floatingjumpshot: 'floater',
  pullupjumpshot: 'pull-up jumper', stepbackjumpshot: 'step-back jumper', turnaroundjumpshot: 'turnaround jumper',
  badpass: 'bad pass', ballhandling: 'ball handling', outofbounds: 'out of bounds', travel: 'travelling',
  offensive: 'offensive', defensive: 'defensive', personal: 'personal', technical: 'technical',
  unsportsmanlike: 'unsportsmanlike', disqualifying: 'disqualifying', shotclock: 'shot clock', '3sec': '3 seconds',
  '5sec': '5 seconds', '8sec': '8 seconds', doubledribble: 'double dribble', other: 'other' };
function liveSub(s) { return LIVE_SUB[s] || String(s || '').replace(/(\d)of(\d)/, '$1 of $2'); }
function livePlayText(a) {
  const t = a.type, s = a.sub;
  if (t === '2pt' || t === '3pt') return (t === '3pt' ? '3pt ' : '2pt ') + liveSub(s || 'shot') + (a.made ? ', made' : ', missed');
  if (t === 'freethrow') return 'Free throw ' + liveSub(s) + (a.made ? ', made' : ', missed');
  if (t === 'rebound') return (s ? liveSub(s) + ' rebound' : 'Rebound') + ((a.tags || []).includes('team') ? ' (team)' : '');
  if (t === 'turnover') return 'Turnover' + (s ? ' — ' + liveSub(s) : '');
  if (t === 'foul') return (s ? liveSub(s) + ' foul' : 'Foul');
  if (t === 'foulon') return 'Fouled';
  if (t === 'assist') return 'Assist';
  if (t === 'steal') return 'Steal';
  if (t === 'block') return 'Block';
  if (t === 'substitution') return s === 'in' ? 'Comes in' : 'Goes out';
  if (t === 'timeout') return 'Timeout';
  if (t === 'jumpball') return 'Jump ball' + (s ? ' — ' + liveSub(s) : '');
  if (t === 'period') return (s === 'start' ? 'Start of ' : 'End of ') + livePeriod(a);
  if (t === 'game') return s === 'start' ? 'Game starts' : 'Game ends';
  return (t || '') + (s ? ' — ' + liveSub(s) : '');
}
function livePlayCap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* leaders across both teams, or one team's */
function liveTop(d, n, team) {
  const all = [];
  d.teams.forEach((t, i) => { if (team == null || team === i) t.pl.forEach(p => all.push({ p, t, i })); });
  return all.filter(x => x.p.min !== '0:00' || x.p.pts).sort((a, b) => b.p.pts - a.p.pts || b.p.reb - a.p.reb).slice(0, n);
}

/* ---------------------------- the live bar ---------------------------- */
function liveBar() { return `<div id="live-bar">${liveBarInner()}</div>`; }
function liveBarInner() {
  const on = liveList('live');
  if (!on.length) return '';
  const x = on[0], d = x.data, [h, a] = d.teams;
  const more = on.length > 1 ? `<span class="lvb-more">+${on.length - 1} more</span>` : '';
  return `<a class="lvb" href="#/live/${x.g.mid}">
    <span class="lv-tag"><span class="lv-dot"></span>LIVE NOW</span>
    <span class="lvb-comp">${esc(liveCompName(x.g.cid))}</span>
    <span class="lvb-score">${esc(h.name)} <b>${h.score}–${a.score}</b> ${esc(a.name)}</span>
    <span class="lvb-clock">${esc(liveClock(d))}</span>${more}
    <span class="lvb-grow"></span>
    <span class="lvb-ago">Updated ${liveAgo(x.at)}</span>
    <span class="lvb-go">Follow the game →</span>
  </a>`;
}

/* ---------------------------- Home's live part ---------------------------- */
/* Home itself is app4o_home.js; this is the part that changes with the feed. */
function liveHomeInner() {
  const on = liveList('live'), done = liveList('final'), soon = liveList('pending');
  let html = '';
  if (on.length) html += `<div class="lv-head"><h2 class="lv-h">Live now</h2><span class="lv-sub">Score, clock, players and plays · every 30 s</span></div>` + on.map(liveCard).join('');
  else if (soon.length) html += `<div class="card lv-quiet"><span class="lv-dot lv-dot-idle"></span>${soon.map(x => `<b>${esc(x.g.h)}</b> vs <b>${esc(x.g.a)}</b>`).join(', ')} — tip-off ${esc(soon[0].g.time)}. The score shows here by itself once the game starts.</div>`;
  if (liveErr()) html += `<div class="card lv-quiet"><span class="lv-dot lv-dot-idle"></span>The live feed is not answering — the rest of the site is the saved data.</div>`;
  if (done.length) html += `<div class="lv-head"><h2 class="lv-h">Just finished</h2></div>` + done.map(liveCard).join('');
  if (on.length || done.length) html += `<div class="lv-notes">
    <div class="card lv-note"><div class="lv-note-k">When the buzzer goes</div><p>The LIVE tag turns into FINAL. Season stats,
      leaders, standings and BPM take the game in at the next update of the database.</p></div>
    <div class="card lv-note"><div class="lv-note-k">Games not scored live</div><p>Some competitions are keyed in after the game.
      Those never show as live here — they appear in the results once the database is updated.</p></div></div>`;
  return html;
}

function liveCard(x) {
  const d = x.data, g = x.g, [h, a] = d.teams, fin = d.status === 'final';
  const qn = Math.max(h.q.length, a.q.length, 4);
  const qh = Array.from({ length: qn }, (_, i) => `<th${i === qn - 1 && !fin ? ' class="lv-qnow"' : ''}>${i < 4 ? 'Q' + (i + 1) : 'OT' + (i > 4 ? i - 3 : '')}</th>`).join('');
  const qr = t => Array.from({ length: qn }, (_, i) => `<td>${t.q[i] != null ? t.q[i] : ''}</td>`).join('');
  const last = (d.plays || []).find(p => p.name);
  const lead = liveTop(d, 4);
  const pen = t => t.fouls >= 4 ? ' <span class="lv-pen">penalty</span>' : '';
  return `<article class="card lv-card${fin ? ' lv-fin' : ''}">
    <div class="lv-card-main">
      <div class="lv-card-top">${fin ? '<span class="lv-tag lv-tag-fin">FINAL</span>' : '<span class="lv-tag"><span class="lv-dot"></span>LIVE</span>'}
        <a href="#/c/${g.cid}">${esc(liveCompName(g.cid))}</a></div>
      <div class="lv-teams">
        ${[h, a].map((t, i) => `<div class="lv-team${(i === 0 ? h.score >= a.score : a.score >= h.score) ? ' lv-ahead' : ''}">
          ${crest(t.name, 30)}<span class="lv-tname">${esc(t.name)}</span><span class="lv-tscore">${t.score}</span></div>`).join('')}
      </div>
      <div class="lv-meta">
        <div><div class="lv-k">${fin ? 'Result' : 'Period · clock'}</div><div class="lv-v">${esc(liveClock(d))}</div></div>
        ${fin ? '' : `<div><div class="lv-k">Team fouls this quarter</div><div class="lv-v">${h.fouls} · ${a.fouls}</div><div class="lv-pens">${esc(h.code || '')}${pen(h)} · ${esc(a.code || '')}${pen(a)}</div></div>`}
      </div>
      <div class="table-wrap"><table class="lv-q"><thead><tr><th></th>${qh}</tr></thead>
        <tbody><tr><td>${esc(h.code || h.name)}</td>${qr(h)}</tr><tr><td>${esc(a.code || a.name)}</td>${qr(a)}</tr></tbody></table></div>
    </div>
    <div class="lv-card-side">
      ${last ? `<div class="lv-last"><div class="lv-k">${fin ? 'Last play' : 'Last play · ' + esc(livePeriod(last) + ' ' + String(last.clock || '').replace(/^0(\d:)/, '$1'))}</div>
        <p><b>${livePlayer(g.cid, d.teams[(last.team || 1) - 1].name, last)}</b> — ${esc(livePlayText(last))}</p></div>` : ''}
      <div class="lv-k lv-lead-k"><span>${fin ? 'Top scorers' : 'Leading so far'}</span><span>players ${liveAgo(x.at)}</span></div>
      <table class="lv-lead"><thead><tr><th></th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>
        ${lead.map(y => `<tr><td>${livePlayer(g.cid, y.t.name, y.p)} <span class="lv-code">${esc(y.t.code || '')}</span></td>
          <td class="lv-pts">${y.p.pts}</td><td>${y.p.reb}</td><td>${y.p.ast}</td></tr>`).join('')}
      </tbody></table>
      <a class="lv-follow" href="#/live/${g.mid}">${fin ? 'Box score and plays' : 'Follow the game'}</a>
    </div>
  </article>`;
}

/* ---------------------------- the live game page ---------------------------- */
function renderLiveGame(mid) {
  if (!LIVE.games[mid] && GAME_BY_MID[mid] && GAME_BY_MID[mid].st !== 'COMPLETE') {
    LIVE.games[mid] = { g: GAME_BY_MID[mid], state: 'pending', data: null, at: 0 };
    setTimeout(liveTick, 0);
  }
  return `<div class="page lv-page"><div id="live-game" data-mid="${esc(mid)}">${liveGameInner(mid)}</div></div>`;
}
function liveGameInner(mid) {
  const x = LIVE.games[mid], g = (x && x.g) || GAME_BY_MID[mid];
  if (!g) return `<div class="card lv-quiet">This game is not in the database.</div>`;
  if (g.st === 'COMPLETE' && !(x && x.data)) {
    return `<div class="card lv-quiet">This game has finished and is in the database —
      <a href="#/c/${g.cid}/box/${g.mid}">open its box score</a>.</div>`;
  }
  if (!x || !x.data) {
    return `<div class="lv-crumb"><a href="#/games">Games</a> › <a href="#/c/${g.cid}">${esc(liveCompName(g.cid))}</a></div>
      <div class="card lv-quiet"><span class="lv-dot lv-dot-idle"></span><b>${esc(g.h)}</b> vs <b>${esc(g.a)}</b> · ${esc(liveTip(g))}.
      ${x && x.err ? 'The live feed is not answering right now — this page keeps trying.' : 'Waiting for the game to start — this page fills in by itself.'}</div>`;
  }
  const d = x.data, [h, a] = d.teams, fin = d.status === 'final';
  const qn = Math.max(h.q.length, a.q.length, 4);
  const qh = Array.from({ length: qn }, (_, i) => `<th>${i < 4 ? 'Q' + (i + 1) : 'OT' + (i > 4 ? i - 3 : '')}</th>`).join('');
  const qr = t => Array.from({ length: qn }, (_, i) => `<td>${t.q[i] != null ? t.q[i] : ''}</td>`).join('') + `<td class="lv-qt">${t.score}</td>`;
  const pen = t => t.fouls >= 4 ? ' · penalty' : '';
  const plays = (d.plays || []).filter(p => p.type !== 'substitution' || p.name);
  let prev = null;
  return `<div class="lv-crumb"><a href="#/games">Games</a> › <a href="#/c/${g.cid}">${esc(liveCompName(g.cid))}</a> › ${esc(h.name)} vs ${esc(a.name)}</div>
  <section class="lv-stage">
    <div class="lv-stage-top">${fin ? '<span class="lv-tag lv-tag-fin">FINAL</span>' : '<span class="lv-tag"><span class="lv-dot"></span>LIVE</span>'}<span>${esc(liveCompName(g.cid))}</span></div>
    <div class="lv-board">
      <div class="lv-side lv-side-h">${crest(h.name, 44)}<div><div class="lv-bname">${esc(h.name)}</div>${fin ? '' : `<div class="lv-bfoul">${h.fouls} team fouls${pen(h)}</div>`}</div></div>
      <div class="lv-bmid"><div class="lv-bscore">${h.score}<span>–</span>${a.score}</div><div class="lv-bclock">${esc(liveClock(d))}</div></div>
      <div class="lv-side lv-side-a"><div><div class="lv-bname">${esc(a.name)}</div>${fin ? '' : `<div class="lv-bfoul">${a.fouls} team fouls${pen(a)}</div>`}</div>${crest(a.name, 44)}</div>
    </div>
    <div class="table-wrap lv-qwrap"><table class="lv-q lv-q-big"><thead><tr><th></th>${qh}<th>T</th></tr></thead>
      <tbody><tr><td>${esc(h.code || h.name)}</td>${qr(h)}</tr><tr><td>${esc(a.code || a.name)}</td>${qr(a)}</tr></tbody></table></div>
  </section>
  <div class="lv-fresh"><span><span class="lv-dot lv-dot-ok"></span>Score, clock, players and plays · <b>${liveAgo(x.at)}</b></span>
    <span class="lvb-grow"></span><span>${fin ? 'This game is over. It joins the season stats at the next update of the database.' : 'Updates by itself every 30 s — no need to reload'}</span></div>
  <div class="lv-cols">
    <section><h2 class="lv-h2">Play-by-play <span>newest first · last ${plays.length}</span></h2>
      <div class="card lv-plays">${plays.map(p => {
        const sc = p.scoring && p.made && (p.type === '2pt' || p.type === '3pt' || p.type === 'freethrow');
        const per = livePeriod(p);
        const head = per !== prev ? `<div class="lv-pper">${esc(per)}</div>` : '';
        prev = per;
        const tm = p.team === 1 ? h : p.team === 2 ? a : null;
        return head + `<div class="lv-play${sc ? ' lv-play-sc' : ''}${p.team === 2 ? ' lv-play-a' : ''}">
          <span class="lv-pclock">${esc(String(p.clock || '').replace(/^0(\d:)/, '$1'))}</span>
          <span class="lv-pteam">${tm ? esc(tm.code || '') : ''}</span>
          <span class="lv-ptext">${p.name ? `<b>${livePlayer(g.cid, tm ? tm.name : '', p)}</b> — ` : ''}${esc(p.name ? livePlayText(p) : livePlayCap(livePlayText(p)))}</span>
          <span class="lv-pscore">${sc ? p.score[0] + '–' + p.score[1] : ''}</span></div>`;
      }).join('')}</div></section>
    <section><h2 class="lv-h2">${fin ? 'Box score' : 'Live box score'}</h2>
      ${d.teams.map(t => `<div class="card lv-box"><div class="lv-box-h">${crest(t.name, 22)}<b>${esc(t.name)}</b><span>${t.score}</span></div>
        <div class="table-wrap"><table class="lv-boxt"><thead><tr><th>#</th><th class="lv-l">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3PT</th><th>FT</th><th>PF</th><th>+/-</th></tr></thead>
        <tbody>${t.pl.slice().sort((p, q) => q.pts - p.pts || (q.min > p.min ? 1 : -1)).map(p => `<tr class="${p.on && !fin ? 'lv-on' : ''}${p.min === '0:00' && !p.pts ? ' lv-dnp' : ''}">
          <td>${esc(p.no)}</td><td class="lv-l">${livePlayer(g.cid, t.name, p)}${p.on && !fin ? ' <span class="lv-court" title="On court">●</span>' : ''}</td>
          <td>${esc(p.min)}</td><td class="lv-pts">${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td>
          <td>${p.fgm}/${p.fga}</td><td>${p.tpm}/${p.tpa}</td><td>${p.ftm}/${p.fta}</td><td>${p.pf}</td><td>${p.pm > 0 ? '+' + p.pm : p.pm}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}
      <div class="note">Live figures come straight from Genius Sports' LiveStats feed through the HoopStatsMY relay and can
        change as the scorer corrects them. Season averages, leaders, standings and BPM don't move during a game.</div>
    </section>
  </div>`;
}

/* start once the page has drawn */
setTimeout(liveTick, 300);
