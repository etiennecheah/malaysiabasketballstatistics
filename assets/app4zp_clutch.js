/* =========================================================================
   Tools › Clutch (#/stats/clutch), in the tool-page look (update-117).

   The numbers are the existing clutch engine in app4q_stats.js (STATS.CL):
   the play-by-play timeline of the last minutes of every close game, added
   up under whatever filters are set. This file only draws it:
   - a dark band with the competition and four headline numbers;
   - quick switches for players or teams, the clutch window and the margin;
   - an Advanced filters panel with every other filter the engine knows
     (ahead or behind, quarter, outcome, team, opponent, position, starter or
     bench, minimum minutes and games, a name, and the counting unit), with
     removable chips for whatever is set;
   - the closers and the teams in clutch time, then the full table.
   ========================================================================= */
const CLX = (() => {
  const $ = id => document.getElementById(id);
  const ST = () => STATS, L = () => STATS.CL, S = () => STATS.CL.S;
  const SHOW = { n: 25 };
  let SEEN = false;
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"/></svg>';
  const TOOLS = [['#/stats/lineups', 'Lineups'], ['#/stats/clutch', 'Clutch'], ['#/wowy', 'WOWY'], ['#/shift', 'Stat Line Shift'],
    ['#/compare', 'Compare players'], ['#/compare/lineups', 'Compare lineups'], ['#/milestones', 'Milestones'], ['#/formulas', 'Formulas']];
  const WINDOWS = [[300, 'Last 5 min'], [180, '3 min'], [120, '2 min'], [60, '1 min'], [30, '30 sec']];
  const MARGINS = [[5, '≤ 5 pts'], [3, '≤ 3'], [1, '1 pt']];
  const f1 = v => v == null || !isFinite(v) ? '–' : (Math.round(v * 10) / 10).toFixed(1);
  const sg = v => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v));
  const mmss = m => { const s = Math.round(m * 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const seg = (attr, items, cur, label) => `<div class="lx-seg" role="group" aria-label="${esc(label)}">${items.map(([k, l]) => `<button type="button" data-${attr}="${k}" aria-pressed="${String(k) === String(cur)}">${l}</button>`).join('')}</div>`;
  const opt = (v, t, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(t)}</option>`;
  const face = (d, i) => { const p = d.players[i]; return /^\d+$/.test(p[0]) ? avatar(p[0], p[1]) : `<span class="avatar">${esc(initials(p[1]))}</span>`; };
  const pname = (d, i) => { const p = d.players[i]; return /^\d+$/.test(p[0]) ? `<a href="#/p/${p[0]}">${esc(p[1])}</a>` : esc(p[1]); };

  /* ---------- the shell ---------- */
  function render() {
    return `<div class="page lx-page clx-page" id="clx-root">
      <header class="lx-head clx-head"><div class="lx-in">
        <nav class="lx-crumbs" aria-label="Breadcrumb"><span>Tools</span><i>/</i><span>Clutch</span></nav>
        <div class="lx-top"><span class="lx-ic">${ICON}</span>
          <div class="lx-tt"><h1>Clutch</h1><p>The last five minutes of the fourth quarter or an overtime, with the score within five. Who takes the shots, who makes them, and who wins. Narrow it as far as the last ten seconds of a one-point game.</p></div>
          <div class="lx-comp"><label><span>Season</span><select id="clx-season" class="lx-sel"></select></label><label><span>Competition</span><select id="clx-comp" class="lx-sel"></select></label></div></div>
        <div class="lx-tiles" id="clx-tiles"></div>
      </div></header>
      <nav class="lx-strip" aria-label="Tools"><div class="lx-in">${TOOLS.map(([h, t]) => `<a href="${h}"${h === '#/stats/clutch' ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</div></nav>
      <div class="lx-in lx-body">
        <div class="lx-ctl">
          <div class="lx-row" id="clx-segs"></div>
          <div class="clx-filterbar"><button type="button" class="clx-advbtn" id="clx-advbtn" aria-expanded="false" aria-controls="clx-adv"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Advanced filters<em id="clx-nf" hidden></em><i class="chev" aria-hidden="true">▾</i></button><div class="clx-chips" id="clx-chips"></div></div>
          <div class="clx-fold" id="clx-adv"><div><div class="clx-panel">
            <div class="clx-grp"><h3>Game situation</h3><div class="clx-grid">
              <label><span>Clutch time</span><select id="clx-f-time" class="lx-sel">${Object.entries(L().TIME).sort((a, b) => b[0] - a[0]).map(([k, v]) => opt(k, v)).join('')}</select></label>
              <label><span>Point difference</span><select id="clx-f-diff" class="lx-sel">${[5, 4, 3, 2, 1].map(n => opt(n, n === 1 ? '1 point' : n + ' points or fewer')).join('')}</select></label>
              <label><span>Ahead or behind</span><select id="clx-f-ab" class="lx-sel">${opt('any', 'Ahead or behind') + opt('behind', 'Behind or tied') + opt('ahead', 'Ahead or tied')}</select></label>
              <label><span>Quarter</span><select id="clx-f-period" class="lx-sel">${opt('all', '4th quarter and overtime') + opt('q4', '4th quarter') + opt('ot', 'Overtime')}</select></label>
              <label><span>Outcome</span><select id="clx-f-outcome" class="lx-sel">${opt('all', 'Wins and losses') + opt('w', 'Wins') + opt('l', 'Losses')}</select></label>
            </div></div>
            <div class="clx-grp"><h3>Teams</h3><div class="clx-grid">
              <label><span>Team</span><select id="clx-f-team" class="lx-sel"></select></label>
              <label><span>Against</span><select id="clx-f-vs" class="lx-sel"></select></label>
            </div></div>
            <div class="clx-grp" id="clx-bio"><h3>Players</h3><div class="clx-grid">
              <label><span>Position</span><select id="clx-f-pos" class="lx-sel">${opt('', 'All positions') + opt('G', 'Guards') + opt('F', 'Forwards') + opt('C', 'Centres')}</select></label>
              <label><span>Starter or bench</span><select id="clx-f-start" class="lx-sel">${opt('all', 'Everyone') + opt('s', 'Starters') + opt('b', 'Bench')}</select></label>
              <label><span>Name contains</span><input type="search" id="clx-f-q" class="lx-sel clx-in" placeholder="Type a name" autocomplete="off"></label>
            </div></div>
            <div class="clx-grp"><h3>Sample and units</h3><div class="clx-grid">
              <label><span>Minimum clutch minutes</span><input type="number" id="clx-f-min" class="lx-sel clx-in" min="0" step="1" inputmode="numeric"></label>
              <label><span>Minimum clutch games</span><input type="number" id="clx-f-gp" class="lx-sel clx-in" min="1" step="1" inputmode="numeric"></label>
              <label><span>Counts</span><select id="clx-f-mode" class="lx-sel">${opt('tot', 'Totals') + opt('pg', 'Per game') + opt('p40', 'Per 40 minutes')}</select></label>
            </div></div>
            <div class="clx-pact"><button type="button" class="lx-btn" data-clx-clear="all">Clear all filters</button><span class="clx-hint" id="clx-hint"></span></div>
          </div></div></div>
        </div>
        <div class="clx-top" id="clx-top"></div>
        <div class="lx-th"><div><h2 id="clx-count"></h2><p id="clx-sorted"></p></div><div id="clx-views"></div></div>
        <section class="lx-card lx-tablecard"><div class="lx-scroll"><table class="lx-t clx-t"><thead id="clx-thead"></thead><tbody id="clx-tbody"></tbody></table></div>
          <div class="lx-foot"><span id="clx-cov"></span><span id="clx-more"></span></div></section>
        <details class="lx-card lx-how"><summary>How clutch time is counted, and what each column means</summary><div class="lx-howb"><p id="clx-gl-intro"></p><div class="lx-check" id="clx-check"></div><dl class="lx-gl" id="clx-gl"></dl></div></details>
      </div>
    </div>`;
  }

  /* ---------- once per visit ---------- */
  function mount() {
    const s = S(); if (!s) return;
    const C = L().COMPS;
    if (!SEEN) { SEEN = true; const mbl = C.find(c => /Major Basketball League/.test(c.label) && !/Women/.test(c.label)); if (mbl && s.cid === C[0].id) { s.cid = mbl.id; s.season = mbl.year; } }
    $('clx-season').innerHTML = [...new Set(C.map(c => c.year))].sort((a, b) => b - a).map(y => opt(y, y, y === s.season)).join('');
    fillComp(); syncInputs();
    const M = ST().IDX.cl.meta || {}, pc = v => v == null ? '–' : (v * 100).toFixed(1) + '%';
    $('clx-gl-intro').textContent = 'Clutch time is the last five minutes of the fourth quarter or of an overtime while the score is within five points; the filters narrow both. A play counts by the score when its clock reading began, so a basket and the assist logged after it stand or fall together. Ratings, shares and +/- use the rebuilt lineups: what the team and its opponents did while the player was on court. Clutch samples are small: a few possessions can move any rate a long way.';
    $('clx-check').innerHTML = [[(M.clutch_games || 0).toLocaleString(), `of ${(M.games || 0).toLocaleString()} rebuilt games reached clutch time`], [C.length, 'competitions with at least one clutch game'],
      [pc(M.pts_match), 'of clutch games where the points agree with a plain count from the feed'], [pc((ST().IDX.lu.meta || {}).pm_exact_c), 'of rebuilt +/- lines equal to the box score']].map(([b, t]) => `<div><b>${b}</b><span>${t}</span></div>`).join('');
    const root = $('clx-root');
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);
    draw();
  }
  function fillComp() {
    const s = S(), list = L().COMPS.filter(c => c.year === s.season);
    if (!list.some(c => c.id === s.cid)) s.cid = list[0].id;
    $('clx-comp').innerHTML = list.map(c => opt(c.id, c.label, c.id === s.cid)).join('');
  }
  const FIELDS = [['time', 'clx-f-time', 'n'], ['diff', 'clx-f-diff', 'n'], ['ab', 'clx-f-ab'], ['period', 'clx-f-period'], ['outcome', 'clx-f-outcome'], ['team', 'clx-f-team'], ['vs', 'clx-f-vs'],
    ['pos', 'clx-f-pos'], ['start', 'clx-f-start'], ['mode', 'clx-f-mode'], ['min', 'clx-f-min', 'n'], ['gp', 'clx-f-gp', 'n'], ['q', 'clx-f-q']];
  function syncInputs() { const s = S(); FIELDS.forEach(([k, id]) => { const e = $(id); if (e && document.activeElement !== e && e.value !== String(s[k])) e.value = s[k]; }); }
  const DEF = { time: 300, diff: 5, ab: 'any', period: 'all', outcome: 'all', team: '', vs: '', pos: '', start: 'all', min: 0, gp: 1, q: '' };
  function onChange(e) {
    const s = S(), t = e.target;
    if (t.id === 'clx-season') { s.season = +t.value; s.team = s.vs = ''; fillComp(); ST().setLast(s.cid); }
    else if (t.id === 'clx-comp') { s.cid = t.value; s.team = s.vs = ''; ST().setLast(s.cid); }
    else { const f = FIELDS.find(x => x[1] === t.id); if (!f || t.type === 'search' || t.type === 'number') return; s[f[0]] = f[2] ? +t.value : t.value; }
    SHOW.n = 25; draw();
  }
  let qT = 0;
  function onInput(e) {
    const s = S(), t = e.target;
    if (t.id === 'clx-f-q') { clearTimeout(qT); qT = setTimeout(() => { s.q = t.value.trim(); SHOW.n = 25; draw(); }, 180); }
    if (t.id === 'clx-f-min') { s.min = Math.max(0, +t.value || 0); SHOW.n = 25; draw(); }
    if (t.id === 'clx-f-gp') { s.gp = Math.max(1, +t.value || 1); SHOW.n = 25; draw(); }
  }
  function onClick(e) {
    const s = S(), b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (b.id === 'clx-advbtn') { const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', open); $('clx-adv').classList.toggle('open', open); return; }
    if (d.clxWho) { if (s.who === d.clxWho) return; s.who = d.clxWho; s.view = 'trad'; s.sort = 'pts'; s.dir = -1; }
    else if (d.clxTime) s.time = +d.clxTime;
    else if (d.clxDiff) s.diff = +d.clxDiff;
    else if (d.clxView) { s.view = d.clxView; const V = L().views()[s.view]; if (!V.cols.some(x => x.key === s.sort)) { s.sort = V.first || 'min'; s.dir = -1; } }
    else if (d.clxSort) { const V = L().views()[s.view], col = V.cols.find(x => x.key === d.clxSort); const k = col ? col.key : (V.first || 'min'); if (s.sort === k) s.dir = -s.dir; else { s.sort = k; s.dir = col && col.low ? 1 : -1; } }
    else if (d.clxClear) { if (d.clxClear === 'all') Object.assign(s, DEF); else s[d.clxClear] = DEF[d.clxClear]; syncInputs(); }
    else if (d.clxMore != null) { SHOW.n += 25; draw(); return; }
    else if (d.clxFocus) { const r = $('clx-tbody'); if (r) r.closest('section').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); return; }
    else return;
    SHOW.n = 25; draw();
  }

  /* ---------- drawing ---------- */
  function draw() {
    const s = S(); if (!s || !$('clx-root')) return;
    const state = ST().load('cl', s.cid);
    const cur = L().current(), { c, d, rows, view, col, isP, meas, V } = cur;
    const isPresetT = WINDOWS.some(w => w[0] === s.time), isPresetD = MARGINS.some(w => w[0] === s.diff);
    $('clx-segs').innerHTML = seg('clx-who', [['players', 'Players'], ['teams', 'Teams']], s.who, 'Rows show')
      + seg('clx-time', WINDOWS.concat(isPresetT ? [] : [[s.time, s.time >= 60 ? s.time / 60 + ' min' : s.time + ' sec']]), s.time, 'Clutch time')
      + seg('clx-diff', MARGINS.concat(isPresetD ? [] : [[s.diff, '≤ ' + s.diff]]), s.diff, 'Score within');
    syncInputs();
    // the chips for whatever the advanced panel has set
    const chips = [], chip = (k, l, v) => chips.push(`<span class="clx-chip">${l}: <b>${esc(v)}</b><button type="button" data-clx-clear="${k}" aria-label="Remove the ${esc(l)} filter">×</button></span>`);
    if (s.ab !== 'any') chip('ab', 'Score', s.ab === 'behind' ? 'Behind or tied' : 'Ahead or tied');
    if (s.period !== 'all') chip('period', 'Quarter', s.period === 'q4' ? '4th' : 'Overtime');
    if (s.outcome !== 'all') chip('outcome', 'Outcome', s.outcome === 'w' ? 'Wins' : 'Losses');
    if (d && s.team !== '') chip('team', 'Team', d.teams[+s.team][0]);
    if (d && s.vs !== '') chip('vs', 'Against', d.teams[+s.vs][0]);
    if (isP && s.pos !== '') chip('pos', 'Position', { G: 'Guards', F: 'Forwards', C: 'Centres' }[s.pos]);
    if (isP && s.start !== 'all') chip('start', 'Role', s.start === 's' ? 'Starters' : 'Bench');
    if (s.min > 0) chip('min', 'Minutes', s.min + '+');
    if (s.gp > 1) chip('gp', 'Games', s.gp + '+');
    if (s.q) chip('q', 'Name', s.q);
    $('clx-chips').innerHTML = chips.join('') + (chips.length > 1 ? `<button type="button" class="clx-clearall" data-clx-clear="all">Clear all</button>` : '');
    const nf = $('clx-nf'); nf.hidden = !chips.length; nf.textContent = chips.length;
    $('clx-bio').hidden = !isP;
    $('clx-f-mode').disabled = !!view.rate;
    $('clx-hint').textContent = view.rate ? 'Rates and percentages do not change with the counting unit.' : '';
    if (!d) {
      $('clx-tiles').innerHTML = [0, 1, 2, 3].map(() => '<div class="lx-tile"><span class="lx-sk"></span></div>').join('');
      $('clx-top').innerHTML = `<div class="lx-card lx-wait">${state === 'error' ? 'This competition’s clutch numbers could not be loaded. Check the connection and choose it again.' : 'Loading this competition…'}</div>`;
      $('clx-tbody').innerHTML = ''; $('clx-thead').innerHTML = '';
      $('clx-f-team').innerHTML = opt('', 'Every team', true); $('clx-f-vs').innerHTML = opt('', 'Every opponent', true);
      return;
    }
    const tOpts = (all, curv) => opt('', all, curv === '') + d.teams.map((t, i) => [t[0], i]).sort((a, b) => a[0].localeCompare(b[0])).map(([n, i]) => opt(i, n, String(i) === String(curv))).join('');
    $('clx-f-team').innerHTML = tOpts('Every team', s.team); $('clx-f-vs').innerHTML = tOpts('Every opponent', s.vs);
    // both sides of the tally, whatever the table shows
    const t = L().tally(d);
    const P = t.players.filter(r => r.gp > 0).map(r => ({ r, m: L().measure(r) })), T = t.teams.filter(r => r.gp > 0).map(r => ({ r, m: L().tmeasure(r) }));
    const closers = P.slice().sort((a, b) => b.m.me.pts - a.m.me.pts || b.m.pm - a.m.pm).slice(0, 5);
    const teams = T.slice().sort((a, b) => b.m.pm - a.m.pm);
    const ng = new Set(); t.teams.forEach(r => r.games.forEach(g => ng.add(g)));
    const clutchMin = t.teams.reduce((a, r) => a + r.sec, 0) / 2 / 60;
    const win = `${L().TIME[s.time].toLowerCase()}, within ${s.diff === 1 ? '1 point' : s.diff}`;
    $('clx-tiles').innerHTML = [
      ['Clutch games', `${ng.size}<small>/${c.rebuilt}</small>`, `reached clutch time: ${esc(win)}`],
      closers[0] ? ['The closer', closers[0].m.me.pts, `clutch points · ${esc(d.players[closers[0].r.pi][1])}`, 'hl'] : ['The closer', '–', 'nobody has scored under these filters'],
      teams[0] ? ['Best clutch team', sg(teams[0].m.pm), `${esc(d.teams[teams[0].r.ti][0])}, ${teams[0].r.w}–${teams[0].r.l} in those games`] : ['Best clutch team', '–', ''],
      ['Clutch minutes', mmss(clutchMin), `across ${esc(c.label)}`]]
      .map(([k, v, x, cls]) => `<div class="lx-tile ${cls || ''}"><span class="k">${k}</span><span class="v">${v}</span><span class="x">${x}</span></div>`).join('');
    // the closers and the teams
    const maxP = Math.max(1, ...closers.map(x => x.m.me.pts)), maxT = Math.max(1, ...teams.map(x => Math.abs(x.m.pm)));
    $('clx-top').innerHTML = closers.length || teams.length ? `
      <section class="lx-card clx-closers"><div class="lx-ch"><div><h2>The closers</h2><p>Most clutch points under these filters.</p></div></div>
        <ol>${closers.map((x, k) => { const me = x.m.me; return `<li style="--i:${k}"><span class="r">${k + 1}</span>${face(d, x.r.pi)}<span class="who"><b>${pname(d, x.r.pi)}</b><small>${esc(d.teams[x.r.ti][0])} · ${me.fgm}–${me.fga} FG · ${me.ftm}–${me.fta} FT</small><span class="clx-bar"><i style="width:${(me.pts / maxP * 100).toFixed(1)}%"></i></span></span><span class="v">${me.pts}<small>${sg(x.m.pm)} on court</small></span></li>`; }).join('') || '<li class="none">Nobody has scored under these filters.</li>'}</ol></section>
      <section class="lx-card clx-teams"><div class="lx-ch"><div><h2>Teams</h2><p>Points for minus against in clutch time.</p></div></div>
        <ol>${teams.map((x, k) => { const v = x.m.pm, w = Math.abs(v) / maxT * 50; return `<li style="--i:${k}">${crest(d.teams[x.r.ti][0], 26)}<span class="who"><b>${esc(d.teams[x.r.ti][0])}</b><small>${x.r.w}–${x.r.l} · ${mmss(x.r.min)} · ${x.m.o.pts}–${x.m.d.pts} pts</small></span><span class="clx-dv"><i class="${v >= 0 ? 'pos' : 'neg'}" style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${w.toFixed(1)}%"></i></span><span class="v ${v >= 0 ? 'pos' : 'neg'}">${sg(v)}</span></li>`; }).join('')}</ol></section>` : `<div class="lx-card lx-wait">No clutch time in ${esc(c.label)} matches these filters. Widen the window or the margin.</div>`;
    // the table
    $('clx-views').innerHTML = seg('clx-view', Object.keys(V).map(k => [k, V[k].name]), s.view, 'Columns shown');
    $('clx-count').textContent = `${rows.length.toLocaleString()} ${isP ? 'player' : 'team'}${rows.length === 1 ? '' : 's'}`;
    $('clx-sorted').textContent = `Sorted by ${col.label}, ${s.dir < 0 ? 'high to low' : 'low to high'}. ${view.rate ? 'Rates and shares.' : { tot: 'Totals.', pg: 'Per game.', p40: 'Per 40 clutch minutes.' }[s.mode]} Tap a column to sort by it.`;
    $('clx-thead').innerHTML = `<tr><th class="lx-lu" scope="col"><button type="button" data-clx-sort="${view.first || 'min'}">${isP ? 'Player' : 'Team'}</button></th>${view.cols.map(x => `<th scope="col"${x.key === col.key ? ` aria-sort="${s.dir < 0 ? 'descending' : 'ascending'}"` : ''} data-imtip="${esc(x.title)}"><button type="button" data-clx-sort="${x.key}">${esc(x.label)}</button></th>`).join('')}</tr>`;
    const shown = rows.slice(0, SHOW.n);
    $('clx-tbody').innerHTML = shown.length ? shown.map((r, k) => {
      const m = meas(r), tn = d.teams[r.ti][0];
      const lead = isP
        ? `<span class="lx-who"><i class="clx-rk">${k + 1}</i>${face(d, r.pi)}<span class="lx-nm"><b>${pname(d, r.pi)}</b><small>${esc(tn)}${d.players[r.pi][2] ? ' · ' + esc(d.players[r.pi][2]) : ''}${d.players[r.pi][3] ? ' · ' + (c.year - d.players[r.pi][3]) : ''}</small></span></span>`
        : `<span class="lx-who"><i class="clx-rk">${k + 1}</i>${crest(tn, 26)}<span class="lx-nm"><b>${esc(tn)}</b></span></span>`;
      return `<tr${r.min < 5 ? ' class="care"' : ''}><td class="lx-lu">${lead}</td>${view.cols.map(x => `<td${x.key === col.key ? ' class="on"' : ''}>${ST().fmt(x.get(m), x, s.mode)}</td>`).join('')}</tr>`;
    }).join('') : `<tr><td class="lx-empty" colspan="${view.cols.length + 1}">Nothing in this competition matches these filters. Widen the clutch time or the point difference, or clear a team or player filter.</td></tr>`;
    $('clx-more').innerHTML = rows.length > SHOW.n ? `<button type="button" class="lx-btn" data-clx-more>Show ${Math.min(25, rows.length - SHOW.n)} more of ${rows.length.toLocaleString()}</button>` : '';
    $('clx-cov').textContent = `${c.label} · ${c.games} of ${c.rebuilt} rebuilt games reached clutch time`;
    $('clx-gl').innerHTML = view.cols.map(x => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.title)}</dd></div>`).join('');
  }
  return { render, mount, draw };
})();
