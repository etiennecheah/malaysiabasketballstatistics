/* =========================================================================
   Tools › Lineups (#/stats/lineups), in the look of the prototype's tool
   pages (update-113): a dark band with the competition and four headline
   numbers, the strip of tools, then the working surface.

   The numbers are the existing lineup engine in app4q_stats.js (STATS.LU):
   the same groups, views, per modes and filters. This file only draws them:
   - a chart of every lineup's offence against its defence, sized by
     minutes, coloured by net rating, with lines of equal net rating, and the
     first five rows of the table numbered on it;
   - the table, with faces and names, 25 rows at a time.
   Row and dot are linked: hover either and the other lights up.
   ========================================================================= */
const LUX = (() => {
  const $ = id => document.getElementById(id);
  const ST = () => STATS, L = () => STATS.LU, S = () => STATS.LU.S;
  const SHOW = { n: 25 };
  let SEEN = false, KEYS = [], PLOTTED = [];
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>';
  const TOOLS = [['#/stats/lineups', 'Lineups'], ['#/stats/clutch', 'Clutch'], ['#/wowy', 'WOWY'], ['#/shift', 'Stat Line Shift'],
    ['#/compare', 'Compare players'], ['#/compare/lineups', 'Compare lineups'], ['#/milestones', 'Milestones'], ['#/formulas', 'Formulas']];
  const SIZES = [[5, 'Fives'], [4, 'Fours'], [3, 'Threes'], [2, 'Pairs']];
  const MINS = [[0, 'Any'], [5, '5+ min'], [10, '10+'], [20, '20+'], [40, '40+']];
  const DEF_MIN = { 5: 10, 4: 15, 3: 20, 2: 30 };
  const f1 = v => v == null || !isFinite(v) ? '–' : (Math.round(v * 10) / 10).toFixed(1);
  const sg = v => v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v)).replace(/\.0$/, '');
  const mmss = m => { const s = Math.round(m * 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const seg = (attr, items, cur, label) => `<div class="lx-seg" role="group" aria-label="${esc(label)}">${items.map(([k, l]) => `<button type="button" data-${attr}="${k}" aria-pressed="${String(k) === String(cur)}">${l}</button>`).join('')}</div>`;

  /* ---------- the shell: drawn once per visit, filled by draw() ---------- */
  function render() {
    return `<div class="page lx-page" id="lx-root">
      <header class="lx-head"><div class="lx-in">
        <nav class="lx-crumbs" aria-label="Breadcrumb"><span>Tools</span><i>/</i><span>Lineups</span></nav>
        <div class="lx-top"><span class="lx-ic">${ICON}</span>
          <div class="lx-tt"><h1>Lineups</h1><p>Every five that shared the floor, and every four, three and two inside them, rebuilt from the play-by-play and rated per 100 possessions.</p></div>
          <div class="lx-comp"><label><span>Season</span><select id="lx-season" class="lx-sel"></select></label><label><span>Competition</span><select id="lx-comp" class="lx-sel"></select></label></div></div>
        <div class="lx-tiles" id="lx-tiles"></div>
      </div></header>
      <nav class="lx-strip" aria-label="Tools"><div class="lx-in">${TOOLS.map(([h, t]) => `<a href="${h}"${h === '#/stats/lineups' ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</div></nav>
      <div class="lx-in lx-body">
        <div class="lx-ctl">
          <div class="lx-row" id="lx-segs"></div>
          <div class="lx-row lx-sels">
            <label><span>With player</span><select id="lx-player" class="lx-sel"></select></label>
            <label><span>Games together</span><select id="lx-gp" class="lx-sel">${[1, 2, 3, 5, 8].map(n => `<option value="${n}">${n === 1 ? 'Any' : n + '+'}</option>`).join('')}</select></label>
            <label><span>Counts</span><select id="lx-mode" class="lx-sel"><option value="tot">Totals</option><option value="pg">Per game</option><option value="p40">Per 40 minutes</option><option value="p100">Per 100 possessions</option></select></label>
          </div>
          <div class="lx-chips" id="lx-teams" role="group" aria-label="Team"></div>
        </div>
        <section class="lx-card lx-chart" aria-label="Offence against defence"><div class="lx-ch">
          <div><h2>Offence against defence</h2><p id="lx-chsub"></p></div></div>
          <div class="lx-cb"><div class="lx-plot" id="lx-plot"></div><aside class="lx-key" id="lx-key"></aside></div></section>
        <div class="lx-th"><div><h2 id="lx-count"></h2><p id="lx-sorted"></p></div><div id="lx-views"></div></div>
        <section class="lx-card lx-tablecard"><div class="lx-scroll"><table class="lx-t"><thead id="lx-thead"></thead><tbody id="lx-tbody"></tbody></table></div>
          <div class="lx-foot"><span id="lx-cov"></span><span id="lx-more"></span></div></section>
        <details class="lx-card lx-how"><summary>How lineups are rebuilt, and what each column means</summary><div class="lx-howb"><p id="lx-gl-intro"></p><div class="lx-check" id="lx-check"></div><dl class="lx-gl" id="lx-gl"></dl></div></details>
      </div>
      <div class="lx-tip" id="lx-tip" role="tooltip" hidden></div>
    </div>`;
  }

  /* ---------- once per visit: fill the fixed selects, wire the events ---------- */
  function mount() {
    const s = S(); if (!s) return;
    const C = L().COMPS;
    if (!SEEN) { SEEN = true; const mbl = C.find(c => /Major Basketball League/.test(c.label) && !/Women/.test(c.label)); if (mbl && s.cid === C[0].id) { s.cid = mbl.id; s.season = mbl.year; } s.min = DEF_MIN[s.n]; s.page = 1; }
    $('lx-season').innerHTML = [...new Set(C.map(c => c.year))].sort((a, b) => b - a).map(y => `<option value="${y}"${y === s.season ? ' selected' : ''}>${y}</option>`).join('');
    fillComp();
    $('lx-mode').value = s.mode; $('lx-gp').value = String([1, 2, 3, 5, 8].includes(s.gp) ? s.gp : 1);
    const M = ST().IDX.lu.meta || {}, pc = v => v == null ? '–' : (v * 100).toFixed(1) + '%';
    $('lx-gl-intro').textContent = 'The scorer’s feed logs every substitution, so the five on court can be followed through a game and each shot, rebound, foul and point given to the players who were there. A row for four, three or two players adds up every five that contained them. Possessions are estimated from the box score, both sides averaged. Small samples swing wildly: under about 25 minutes, read the ratings with care.';
    $('lx-check').innerHTML = [[(M.games || 0).toLocaleString(), 'games with lineups rebuilt exactly, five a side in every period'], [(M.lineups || 0).toLocaleString(), `five-man lineups across ${C.length} competitions`],
      [pc(M.pts_exact), 'of team-games where the stints add back to the box-score points'], [pc(M.all_exact), 'where every counter matches the box score']].map(([b, t]) => `<div><b>${b}</b><span>${t}</span></div>`).join('');
    const root = $('lx-root');
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    root.addEventListener('pointerover', onOver);
    root.addEventListener('pointerout', onOut);
    draw();
  }
  function fillComp() {
    const s = S(), list = L().COMPS.filter(c => c.year === s.season);
    if (!list.some(c => c.id === s.cid)) s.cid = list[0].id;
    $('lx-comp').innerHTML = list.map(c => `<option value="${c.id}"${c.id === s.cid ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
  }
  function onChange(e) {
    const s = S(), t = e.target; let hit = true;
    if (t.id === 'lx-season') { s.season = +t.value; s.team = ''; s.player = ''; fillComp(); ST().setLast(s.cid); }
    else if (t.id === 'lx-comp') { s.cid = t.value; s.team = ''; s.player = ''; ST().setLast(s.cid); }
    else if (t.id === 'lx-player') s.player = t.value;
    else if (t.id === 'lx-gp') s.gp = +t.value;
    else if (t.id === 'lx-mode') s.mode = t.value;
    else hit = false;
    if (hit) { SHOW.n = 25; draw(); }
  }
  function onClick(e) {
    const s = S(), b = e.target.closest('button'); if (!b) { tapDot(e); return; }
    const d = b.dataset;
    if (d.lxN) { s.n = +d.lxN; s.min = DEF_MIN[s.n]; }
    else if (d.lxMin != null) s.min = +d.lxMin;
    else if (d.lxTeam != null) { s.team = d.lxTeam; s.player = ''; }
    else if (d.lxView) { s.view = d.lxView; const V = L().VIEWS[s.view]; if (!V.cols.some(x => x.key === s.sort)) { s.sort = 'min'; s.dir = -1; } }
    else if (d.lxSort) { const V = L().VIEWS[s.view], col = V.cols.find(x => x.key === d.lxSort); const k = col ? col.key : 'min'; if (s.sort === k) s.dir = -s.dir; else { s.sort = k; s.dir = col && col.low ? 1 : -1; } }
    else if (d.lxMore != null) { SHOW.n += 25; draw(true); return; }
    else return;
    SHOW.n = 25; draw();
  }

  /* ---------- dot and row light each other up; the tooltip ---------- */
  function light(k, on) {
    document.querySelectorAll(`#lx-root [data-lxk="${k}"]`).forEach(el => el.classList.toggle('hot', on));
    const plot = $('lx-plot'); if (plot) plot.classList.toggle('focus', on);
  }
  function tip(el, show) {
    const t = $('lx-tip'); if (!t) return;
    if (!show) { t.hidden = true; return; }
    const g = PLOTTED.find(x => x.key === el.dataset.lxk); if (!g) return;
    t.innerHTML = g.tip; t.hidden = false;
    const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    t.style.top = (r.top - h - 12 < 8 ? r.bottom + 12 : r.top - h - 12) + 'px';
  }
  function onOver(e) { const el = e.target.closest('[data-lxk]'); if (!el) return; light(el.dataset.lxk, true); if (el.matches('.lx-dot')) tip(el, true); }
  function onOut(e) { const el = e.target.closest('[data-lxk]'); if (!el) return; light(el.dataset.lxk, false); tip(el, false); }
  function tapDot(e) { const el = e.target.closest('.lx-dot'); if (el) tip(el, true); else tip(null, false); }
  window.addEventListener('scroll', () => { const t = $('lx-tip'); if (t) t.hidden = true; }, { passive: true });
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if ($('lx-root')) chart(); }, 150); });

  /* ---------- the numbers for the current filters ---------- */
  let CUR = null;
  function compute() {
    const s = S(), d = ST().DATA.lu[s.cid];
    if (!d) return null;
    const meas = L().measure, cur = L().current();
    const all5 = L().groups(s.cid, d, 5).map(r => ({ r, m: meas(r) }));
    // the competition as a whole: every five-man row, both sides
    const sum = k => { const a = new Array(18).fill(0); d.rows.forEach(row => row[k].forEach((v, i) => { a[i] += v; })); return a; };
    const lg = ST().teamMeasures(ST().side(sum(4)), ST().side(sum(5)), d.rows.reduce((a, r) => a + r[2], 0) / 60, 0);
    return { d, c: cur.c, rows: cur.rows, view: cur.view, col: cur.col, all5, lg };
  }
  const names = (d, r) => r.p.map(i => d.players[i]).sort((a, b) => ST().famOf(a[1]).localeCompare(ST().famOf(b[1])));
  const keyOf = r => r.ti + '|' + r.p.join(',');

  function draw(keepScroll) {
    const s = S(); if (!s || !$('lx-root')) return;
    const state = ST().load('lu', s.cid);
    $('lx-segs').innerHTML = seg('lx-n', SIZES, s.n, 'Lineup size') + seg('lx-min', MINS, s.min, 'Minimum minutes together');
    $('lx-mode').value = s.mode;
    CUR = compute();
    if (!CUR) {
      $('lx-tiles').innerHTML = [0, 1, 2, 3].map(() => '<div class="lx-tile"><span class="lx-sk"></span></div>').join('');
      $('lx-plot').innerHTML = `<div class="lx-wait">${state === 'error' ? 'This competition’s lineups could not be loaded. Check the connection and choose it again.' : 'Loading this competition…'}</div>`;
      $('lx-key').innerHTML = ''; $('lx-tbody').innerHTML = ''; $('lx-thead').innerHTML = ''; $('lx-teams').innerHTML = '';
      return;
    }
    const { d, c, rows, view, col, all5, lg } = CUR;
    // headline tiles
    const used = all5.slice().sort((a, b) => b.r.sec - a.r.sec)[0];
    const best = all5.filter(x => x.r.sec >= 15 * 60 && x.m.net != null).sort((a, b) => b.m.net - a.m.net)[0];
    $('lx-tiles').innerHTML = [
      ['Fives used', all5.length.toLocaleString(), `by ${d.teams.length} teams in ${c.games} games`],
      used ? ['Most-used five', mmss(used.r.sec / 60), `${esc(d.teams[used.r.ti][0])}, ${used.r.gp} game${used.r.gp === 1 ? '' : 's'}`] : null,
      best ? ['Best five, 15+ min', sg(best.m.net), `net rating · ${esc(d.teams[best.r.ti][0])}`, 'hl'] : null,
      ['Competition average', f1(lg.ortg), `points per 100 possessions · pace ${f1(lg.pace)}`]].filter(Boolean)
      .map(([k, v, x, cls]) => `<div class="lx-tile ${cls || ''}"><span class="k">${k}</span><span class="v">${v}</span><span class="x">${x}</span></div>`).join('');
    // teams and players
    const team = s.team === '' ? '' : +s.team;
    $('lx-teams').innerHTML = `<button type="button" class="lx-chip" data-lx-team="" aria-pressed="${s.team === ''}">Every team</button>`
      + d.teams.map((t, i) => [t[0], i]).sort((a, b) => a[0].localeCompare(b[0])).map(([n, i]) => `<button type="button" class="lx-chip" data-lx-team="${i}" aria-pressed="${team === i}">${crest(n, 20)}${esc(n)}</button>`).join('');
    const on = new Set(); d.rows.forEach(r => { if (team === '' || r[0] === team) r[1].forEach(i => on.add(i)); });
    if (s.player !== '' && !on.has(+s.player)) s.player = '';
    $('lx-player').innerHTML = `<option value="">${team === '' ? 'Any player' : 'Any player on this team'}</option>` + [...on].map(i => [d.players[i][1], i]).sort((a, b) => a[0].localeCompare(b[0])).map(([n, i]) => `<option value="${i}"${String(i) === String(s.player) ? ' selected' : ''}>${esc(n)}</option>`).join('');
    $('lx-mode').disabled = !!view.rate;
    // the table head
    $('lx-views').innerHTML = seg('lx-view', Object.keys(L().VIEWS).map(k => [k, L().VIEWS[k].name]), s.view, 'Columns shown');
    const word = { 5: 'five', 4: 'four', 3: 'three', 2: 'pair' }[s.n];
    $('lx-count').textContent = `${rows.length.toLocaleString()} ${word}${rows.length === 1 ? '' : 's'}`;
    $('lx-sorted').textContent = `Sorted by ${col.label}, ${s.dir < 0 ? 'high to low' : 'low to high'}. ${view.rate ? 'Rates per 100 possessions.' : { tot: 'Totals.', pg: 'Per game.', p40: 'Per 40 minutes together.', p100: 'Per 100 possessions.' }[s.mode]} The first five are numbered on the chart.`;
    $('lx-thead').innerHTML = `<tr><th class="lx-lu" scope="col"><button type="button" data-lx-sort="min">Lineup</button></th>${view.cols.map(x => `<th scope="col"${x.key === col.key ? ` aria-sort="${s.dir < 0 ? 'descending' : 'ascending'}"` : ''} data-imtip="${esc(x.title)}"><button type="button" data-lx-sort="${x.key}">${esc(x.label)}</button></th>`).join('')}</tr>`;
    KEYS = rows.slice(0, 5).map(keyOf);
    const shown = rows.slice(0, SHOW.n);
    $('lx-tbody').innerHTML = shown.length ? shown.map((r, k) => {
      const m = L().measure(r), nm = names(d, r), t = d.teams[r.ti][0];
      return `<tr data-lxk="${keyOf(r)}"${r.sec < 25 * 60 ? ' class="care"' : ''}><td class="lx-lu"><span class="lx-who">${k < 5 ? `<i class="lx-n${k === 0 ? ' one' : ''}">${k + 1}</i>` : '<i class="lx-n blank"></i>'}${crest(t, 22)}<span class="lx-avs">${nm.map(x => /^\d+$/.test(x[0]) ? avatar(x[0], x[1]) : `<span class="avatar">${esc(initials(x[1]))}</span>`).join('')}</span>
        <span class="lx-nm">${nm.map(x => /^\d+$/.test(x[0]) ? `<a href="#/p/${x[0]}" title="${esc(x[1])}">${esc(ST().short(x[1]))}</a>` : `<span title="${esc(x[1])}">${esc(ST().short(x[1]))}</span>`).join('<i>·</i>')}<small>${esc(t)}</small></span></span></td>
        ${view.cols.map(x => `<td${x.key === col.key ? ' class="on"' : ''}>${ST().fmt(x.get(m), x, s.mode)}</td>`).join('')}</tr>`;
    }).join('') : `<tr><td class="lx-empty" colspan="${view.cols.length + 1}">No lineup matches these filters. Lower the minimum minutes or games, or pick another team.</td></tr>`;
    $('lx-more').innerHTML = rows.length > SHOW.n ? `<button type="button" class="lx-btn" data-lx-more>Show ${Math.min(25, rows.length - SHOW.n)} more of ${rows.length.toLocaleString()}</button>` : '';
    $('lx-cov').textContent = `${c.label} · lineups rebuilt for ${c.games} of ${c.done} games`;
    $('lx-gl').innerHTML = view.cols.map(x => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.title)}</dd></div>`).join('');
    chart();
    if (!keepScroll) { const p = $('lx-plot'); if (p) p.scrollLeft = 0; }
  }

  /* ---------- the chart ---------- */
  function chart() {
    const host = $('lx-plot'); if (!host || !CUR) return;
    const { d, rows, lg } = CUR, s = S();
    const meas = L().measure;
    // what to plot: the most-used rows that pass the filters, with enough possessions to rate
    let P = rows.map(r => ({ r, m: meas(r) })).filter(x => x.m.ortg != null && x.m.drtg != null && x.m.poss >= 8);
    const first = new Set(KEYS);
    P = P.slice().sort((a, b) => b.r.sec - a.r.sec).slice(0, 70).concat(P.filter(x => first.has(keyOf(x.r)))).filter((x, i, A) => A.indexOf(x) === i);
    if (P.length < 2) { host.innerHTML = `<div class="lx-wait">Too few lineups with enough possessions to plot. Lower the minimum minutes.</div>`; $('lx-key').innerHTML = ''; $('lx-chsub').textContent = ''; return; }
    const phone = host.clientWidth < 560;
    const W = Math.max(300, host.clientWidth), H = phone ? Math.round(W * 1.02) : Math.round(Math.min(520, Math.max(380, W * .62)));
    const m = { l: phone ? 40 : 54, r: 16, t: 16, b: phone ? 44 : 50 };
    const vals = P.flatMap(x => [x.m.ortg, x.m.drtg]).concat([lg.ortg]);
    // the scale: from the 3rd to the 97th percentile, so one freak lineup does not squash the rest
    const sorted = vals.slice().sort((a, b) => a - b), q = p => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
    let lo = Math.floor((Math.min(q(.03), lg.ortg - 15) - 4) / 10) * 10, hi = Math.ceil((Math.max(q(.97), lg.ortg + 15) + 4) / 10) * 10;
    const step = hi - lo > 80 ? 20 : 10;
    const X = v => m.l + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (W - m.l - m.r);
    const Y = v => m.t + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (H - m.t - m.b);   // low DRtg (good defence) at the top
    const out = v => v < lo || v > hi;
    const maxSec = Math.max(...P.map(x => x.r.sec));
    const R = sec => (phone ? 3.5 : 4.5) + Math.sqrt(sec / maxSec) * (phone ? 10 : 14);
    const colour = net => { const k = Math.min(1, Math.abs(net) / 25), w = Math.round(22 + k * 78); return `color-mix(in oklab, ${net >= 0 ? 'var(--lx-pos)' : 'var(--lx-neg)'} ${w}%, var(--lx-mid))`; };
    // lines of equal net rating: DRtg = ORtg − k
    const iso = [-20, -10, 0, 10, 20].map(k => {
      const pts = []; [[lo, lo - k], [hi, hi - k], [lo + k, lo], [hi + k, hi]].forEach(([x, y]) => { if (x >= lo - 1e-9 && x <= hi + 1e-9 && y >= lo - 1e-9 && y <= hi + 1e-9) pts.push([x, y]); });
      const u = pts.filter((p, i) => pts.findIndex(o => Math.abs(o[0] - p[0]) < 1e-6 && Math.abs(o[1] - p[1]) < 1e-6) === i).sort((a, b) => a[0] - b[0]);
      if (u.length < 2) return '';
      const [a, b] = [u[0], u[u.length - 1]];
      const lx = X(b[0]), ly = Y(b[1]);
      return `<line class="${k === 0 ? 'iso0' : 'iso'}" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${lx}" y2="${ly}"/>`
        + `<text class="isol${k === 0 ? ' z' : ''}" x="${lx - 4}" y="${ly + (ly < m.t + 4 ? 14 : -6)}" text-anchor="end">${k === 0 ? 'Net 0' : (k > 0 ? '+' : '−') + Math.abs(k)}</text>`;
    }).join('');
    // the winning side of the net-0 line
    const winPoly = [[lo, lo], [hi, hi], [hi, lo]].map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
    const ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    // dots: biggest first so small ones stay on top; the numbered ones last
    const order = P.slice().sort((a, b) => (first.has(keyOf(a.r)) - first.has(keyOf(b.r))) || b.r.sec - a.r.sec);
    PLOTTED = P.map(x => { const nm = names(d, x.r).map(p => ST().short(p[1])).join(' · ');
      return { key: keyOf(x.r), tip: `<b>${esc(nm)}</b><span>${esc(d.teams[x.r.ti][0])} · ${mmss(x.r.sec / 60)} together · ${x.r.gp} game${x.r.gp === 1 ? '' : 's'}</span><span class="g"><em>Scored</em>${f1(x.m.ortg)}<em>Allowed</em>${f1(x.m.drtg)}<em>Net</em><b class="${x.m.net >= 0 ? 'p' : 'n'}">${sg(x.m.net)}</b></span><span>${f1(x.m.poss)} possessions · ${x.m.pm > 0 ? '+' : ''}${x.m.pm} points</span>` }; });
    const dot = x => { const k = keyOf(x.r), n = KEYS.indexOf(k), cx = X(x.m.ortg), cy = Y(x.m.drtg), r = R(x.r.sec), clip = out(x.m.ortg) || out(x.m.drtg);
      return `<g class="lx-dot${n >= 0 ? ' num' : ''}${clip ? ' clip' : ''}" data-lxk="${k}" tabindex="0" role="img" aria-label="${esc(names(d, x.r).map(p => p[1]).join(', '))}: net ${sg(x.m.net)}">
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" style="fill:${colour(x.m.net)}"/>
        ${n >= 0 ? `<circle class="badge${n === 0 ? ' one' : ''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${phone ? 9 : 10}"/><text class="bn${n === 0 ? ' one' : ''}" x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle">${n + 1}</text>` : ''}</g>`; };
    const corner = (x, y, anchor, t) => `<text class="qt" x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`;
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="Lineups: points scored per 100 possessions against points allowed">
      <polygon class="win" points="${winPoly}"/>
      ${ticks.map(v => `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><line class="g" y1="${m.t}" y2="${H - m.b}" x1="${X(v)}" x2="${X(v)}"/>
        <text class="t" x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text><text class="t" x="${X(v)}" y="${H - m.b + 18}" text-anchor="middle">${v}</text>`).join('')}
      ${iso}
      <line class="avg" x1="${X(lg.ortg)}" x2="${X(lg.ortg)}" y1="${m.t}" y2="${H - m.b}"/><line class="avg" x1="${m.l}" x2="${W - m.r}" y1="${Y(lg.ortg)}" y2="${Y(lg.ortg)}"/>
      ${corner(W - m.r - 8, m.t + 16, 'end', 'Scores and stops')}${corner(m.l + 8, H - m.b - 10, 'start', 'Struggles at both ends')}
      <text class="ax" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Points scored per 100 possessions →</text>
      <text class="ax" transform="translate(13 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">${phone ? '← Allowed per 100' : '← Points allowed per 100 · better defence up'}</text>
      ${order.map(dot).join('')}
    </svg>`;
    const team = s.team === '' ? 'every team' : d.teams[+s.team][0];
    $('lx-chsub').textContent = `${P.length} ${P.length === 1 ? 'lineup' : 'lineups'} from ${team}, the most-used first. Dashed lines: the competition average, ${f1(lg.ortg)} per 100.`;
    // the key: the five numbered lineups, then colour and size
    const top = KEYS.map(k => P.find(x => keyOf(x.r) === k)).filter(Boolean);
    const lab = sec => mmss(sec / 60);
    const s1 = Math.max(60, Math.round(maxSec / 4 / 60) * 60), s2 = maxSec;
    $('lx-key').innerHTML = `${top.length ? `<h3>Numbered on the chart</h3><ol class="lx-top5">${top.map((x, n) => `<li data-lxk="${keyOf(x.r)}"><i class="lx-n${n === 0 ? ' one' : ''}">${n + 1}</i><span class="nm">${crest(d.teams[x.r.ti][0], 18)}<b>${esc(names(d, x.r).map(p => ST().short(p[1]).split(' ').pop()).join(', '))}</b><small>${mmss(x.r.sec / 60)} · ${f1(x.m.ortg)} scored, ${f1(x.m.drtg)} allowed</small></span><span class="v ${x.m.net >= 0 ? 'p' : 'n'}">${sg(x.m.net)}</span></li>`).join('')}</ol>` : ''}
      <h3>Colour: net rating</h3><div class="lx-ramp"><span></span><div><small>−25</small><small>0</small><small>+25</small></div></div>
      <h3>Size: minutes together</h3><div class="lx-sizes"><span><i style="width:${2 * R(s1)}px;height:${2 * R(s1)}px"></i>${lab(s1)}</span><span><i style="width:${2 * R(s2)}px;height:${2 * R(s2)}px"></i>${lab(s2)}</span></div>
      <p class="lx-note">Above the solid diagonal a lineup outscored its opponents. Each faint line is 10 points per 100 more or less. Hover or tap a dot for its numbers.</p>`;
  }

  return { render, mount, draw };
})();
