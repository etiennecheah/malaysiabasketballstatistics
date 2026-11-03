/* =========================================================================
   Tools › Stat Line Shift, approved from the prototype (3 Nov 2026).

   One player's stat line in every combination of the teammates you pick:
   his own points, shots, passes and so on, counted only in the stretches with
   those teammates on or off the floor. Modelled on databallr's Stat Line Shift
   Combos, with per 30 minutes instead of per 36 (a FIBA game is 40 minutes)
   and the "read with care" note at 25 minutes instead of 50 (user decisions).
   Men's Agong Cup and men's MBL only, the same editions as WOWY.

   Data: stats/lv/<cid>.js (every stint, both fives and both teams' counters,
   shared with WOWY and Compare › Lineups) and stats/sp/<cid>.js (each player's
   own counters per stint, from build_lineups.py), joined stint by stint.

   Route: #/shift. The choices live in the address; a change repaints #sl-root.
   ========================================================================= */
const SL_X = WY_X;
const SL_P = { fgm: 0, fga: 1, tpm: 2, tpa: 3, ftm: 4, fta: 5, oreb: 6, dreb: 7, ast: 8, tov: 9, stl: 10, blk: 11, pf: 12, pfd: 13, pts: 14 };
const SL = { ser: 'mbl', from: 0, to: 0, team: '', phase: 'all', view: 'combos', tab: 'Overview', unit: 'p100', main: null, mates: [],
  colL: null, colR: null, menu: null, pivot: null, sort: null, card: {}, sp: {}, spLoad: {}, prep: {}, prev: {}, booted: false, urlPlayers: false };
function SLS_PUT(cid, d) { SL.sp[cid] = d; }

/* ---- the stats: k = count (scaled by the unit), pct, ratio or team (never scaled) ---- */
const slDiv = (a, b) => b > 0 ? a / b : null;
const slPoss = v => v[SL_X.fga] + 0.44 * v[SL_X.fta] - v[SL_X.oreb] - v[SL_X.toreb] + v[SL_X.tov] + v[SL_X.ttov];
const SL_STATS = (() => {
  const P = SL_P, X = SL_X;
  return {
    USG: { k: 'pct', f: A => slDiv(A.p[P.fga] + 0.44 * A.p[P.fta] + A.p[P.tov], A.v[X.fga] + 0.44 * A.v[X.fta] + A.v[X.tov] + A.v[X.ttov]) },
    PTS: { k: 'count', f: A => A.p[P.pts] },
    'TS%': { k: 'pct', f: A => slDiv(A.p[P.pts], 2 * (A.p[P.fga] + 0.44 * A.p[P.fta])) },
    FTA: { k: 'count', f: A => A.p[P.fta] },
    FGM: { k: 'count', f: A => A.p[P.fgm] },
    FGA: { k: 'count', f: A => A.p[P.fga] },
    '3PM': { k: 'count', f: A => A.p[P.tpm] },
    '3PA': { k: 'count', f: A => A.p[P.tpa] },
    FTM: { k: 'count', f: A => A.p[P.ftm] },
    AST: { k: 'count', f: A => A.p[P.ast] },
    REB: { k: 'count', f: A => A.p[P.oreb] + A.p[P.dreb] },
    TOV: { k: 'count', f: A => A.p[P.tov] },
    'AST/TO': { k: 'ratio', d: 2, f: A => slDiv(A.p[P.ast], A.p[P.tov]) },
    OREB: { k: 'count', f: A => A.p[P.oreb] },
    DREB: { k: 'count', f: A => A.p[P.dreb] },
    STL: { k: 'count', f: A => A.p[P.stl] },
    BLK: { k: 'count', f: A => A.p[P.blk] },
    PF: { k: 'count', f: A => A.p[P.pf] },
    '3P%': { k: 'pct', f: A => slDiv(A.p[P.tpm], A.p[P.tpa]) },
    'FG%': { k: 'pct', f: A => slDiv(A.p[P.fgm], A.p[P.fga]) },
    '2P%': { k: 'pct', f: A => slDiv(A.p[P.fgm] - A.p[P.tpm], A.p[P.fga] - A.p[P.tpa]) },
    'FT%': { k: 'pct', f: A => slDiv(A.p[P.ftm], A.p[P.fta]) },
    'eFG%': { k: 'pct', f: A => slDiv(A.p[P.fgm] + 0.5 * A.p[P.tpm], A.p[P.fga]) },
    '2PA': { k: 'count', f: A => A.p[P.fga] - A.p[P.tpa] },
    '3PAr': { k: 'pct', f: A => slDiv(A.p[P.tpa], A.p[P.fga]) },
    FTr: { k: 'pct', f: A => slDiv(A.p[P.fta], A.p[P.fga]) },
    ORTG: { k: 'team', f: A => slDiv(100 * A.pts, slPoss(A.v)) },
    DRTG: { k: 'team', f: A => slDiv(100 * A.opp, slPoss(A.o)) },
    NET: { k: 'team', sg: 1, f: A => { const o = slDiv(100 * A.pts, slPoss(A.v)), d = slDiv(100 * A.opp, slPoss(A.o)); return o == null || d == null ? null : o - d; } },
    PACE: { k: 'team', f: A => slDiv((slPoss(A.v) + slPoss(A.o)) / 2 * 40, A.sec / 60) },
    'Team TS%': { k: 'team', lab: 'TS%', f: A => slDiv(100 * A.pts, 2 * (A.v[X.fga] + 0.44 * A.v[X.fta])) },
    'TOV%': { k: 'team', f: A => slDiv(100 * (A.v[X.tov] + A.v[X.ttov]), slPoss(A.v)) },
    'OREB%': { k: 'team', f: A => slDiv(100 * A.v[X.oreb], A.v[X.oreb] + A.o[X.dreb]) },
    'FT/FGA': { k: 'team', f: A => slDiv(100 * A.v[X.ftm], A.v[X.fga]) },
    'PTS%': { k: 'pct', f: A => slDiv(A.p[P.pts], A.pts) },
    '+/-': { k: 'count', sg: 1, f: A => A.pts - A.opp },
    'Team +/-': { k: 'team', sg: 1, d: 0, lab: '+/-', f: A => A.pts - A.opp }
  };
})();
const SL_TABS = {
  Overview: null,
  Scoring: ['PTS', 'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA', 'TS%', 'USG'],
  Playmaking: ['AST', 'TOV', 'AST/TO', 'REB', 'OREB', 'DREB', 'STL', 'BLK', 'PF'],
  Shooting: ['FG%', '2P%', '3P%', 'FT%', 'eFG%', 'TS%', '2PA', '3PA', '3PAr', 'FTr'],
  Team: ['ORTG', 'DRTG', 'NET', 'Team +/-', 'PACE', 'Team TS%', 'TOV%', 'OREB%', 'FT/FGA', 'PTS%']
};
const SL_DEF = ['USG', 'PTS', 'AST', 'REB', 'TOV', 'TS%', 'FTA', '3P%', '+/-'];
const SL_GROUPS = { Scoring: ['USG', 'PTS', 'TS%', 'FTA', 'FGM', 'FGA', '3PM', '3PA', 'FTM'], Playmaking: ['AST', 'REB', 'TOV', 'AST/TO', 'OREB', 'DREB', 'STL', 'BLK', 'PF'],
  Shooting: ['3P%', 'FG%', '2P%', 'FT%', 'eFG%', '2PA', '3PAr', 'FTr'], 'On court': ['ORTG', 'DRTG', 'NET', 'PACE', 'Team TS%', 'TOV%', 'OREB%', 'FT/FGA', 'PTS%', '+/-'] };
let SL_OVER = SL_DEF.slice();
try { const s = JSON.parse(localStorage.getItem('hs-shift-stats') || 'null'); if (Array.isArray(s) && s.length && s.every(k => SL_STATS[k])) SL_OVER = s; } catch (e) {}
// per 30 minutes, not per 36: a FIBA game is 40 minutes (user decision)
const SL_UNITS = [['p100', 'Per 100'], ['p30', 'Per 30'], ['tot', 'Totals']];
const SL_ULONG = { p100: 'Stats per 100 possessions', p30: 'Stats per 30 minutes', tot: 'Totals' };
const SL_MIN_WARN = 25;   // minutes; databallr warns under 50, a tournament here is 5 to 12 games

function slValue(key, A, unit) {
  const s = SL_STATS[key]; if (!A || A.sec <= 0) return null;
  const raw = s.f(A); if (raw == null || !isFinite(raw)) return null;
  if (s.k === 'pct') return raw * 100;
  if (s.k === 'count') { const ps = slPoss(A.v); return unit === 'p100' ? (ps > 0 ? 100 * raw / ps : null) : unit === 'p30' ? 30 * raw / (A.sec / 60) : raw; }
  return raw;
}
function slFmt(key, v, unit, plain) {
  if (v == null) return '—';
  const s = SL_STATS[key], d = s.d != null ? s.d : (s.k === 'count' && unit === 'tot' ? 0 : 1);
  const n = Math.abs(v).toFixed(d), sign = s.sg && !plain ? (v > 0.0001 ? '+' : v < -0.0001 ? '−' : '') : v < 0 ? '−' : '';
  return sign + n + (s.k === 'pct' && !plain ? '%' : '');
}
const slZeroTxt = t => /^0(\.0+)?$/.test(t);
const slLabel = k => SL_STATS[k].lab || k;

/* ---- the data ---- */
function slLoadSp(cid) {
  if (SL.sp[cid]) return true;
  if (SL.spLoad[cid] === 'loading') return false;
  SL.spLoad[cid] = 'loading';
  const s = document.createElement('script');
  s.src = HS.BASE + 'stats/sp/' + cid + '.js';
  s.onload = () => { SL.spLoad[cid] = SL.sp[cid] ? 'done' : 'error'; slPaint(); };
  s.onerror = () => { SL.spLoad[cid] = 'error'; slPaint(); };
  document.head.appendChild(s);
  return false;
}
const slSel = () => wyComps().filter(c => c.ser === SL.ser && c.year >= SL.from && c.year <= SL.to);
const slReady = () => slSel().every(c => CL.data[c.id] && SL.sp[c.id]);
const slFailed = () => slSel().some(c => CL.load[c.id] === 'error' || SL.spLoad[c.id] === 'error');
function slPrep(cid) {
  if (SL.prep[cid]) return SL.prep[cid];
  const d = CL.data[cid], sp = SL.sp[cid]; if (!d || !sp) return null;
  const pid = d.players.map(p => p[0]), c = COMP_BY_ID[cid] || {};
  const mapPP = o => { const r = {}; for (const k in o) r[pid[+k]] = o[k]; return r; };
  const games = d.games.map((g, gi) => {
    const pp = sp.games[gi] || [];
    return { mid: g.mid, h: wySlug(cid, g.h), a: wySlug(cid, g.a), po: g.po ? 1 : 0,
      st: g.st.map((s, si) => { const q = pp[si] || [{}, {}]; return [+s[0] || 0, s[1], s[2].map(i => pid[i]), s[3].map(i => pid[i]), s[4], s[5][0], s[5][1], mapPP(q[0]), mapPP(q[1])]; }) };
  });
  return (SL.prep[cid] = { cid, champ: c.champ ? wySlug(cid, c.champ) : '', games });
}
const slData = () => slSel().map(c => slPrep(c.id)).filter(Boolean);
function slTeamStints(fn) {
  slData().forEach(c => c.games.forEach(g => {
    if (SL.phase === 'rs' && g.po) return; if (SL.phase === 'po' && !g.po) return;
    const home = g.h === SL.team; if (!home && g.a !== SL.team) return;
    g.st.forEach(s => fn(s, home, g));   // zero-second stretches too: a free throw or a rebound between substitutions
  }));
}
const slZero = () => ({ sec: 0, pts: 0, opp: 0, v: new Array(17).fill(0), o: new Array(17).fill(0), p: new Array(15).fill(0), g: new Set() });
function slAdd(A, s, home, pid, g) {
  const v = home ? s[5] : s[6], o = home ? s[6] : s[5], pp = (home ? s[7] : s[8])[pid];
  A.sec += s[1]; A.pts += home ? s[4][0] : s[4][1]; A.opp += home ? s[4][1] : s[4][0]; A.g.add(g.mid);
  for (let i = 0; i < 17; i++) { A.v[i] += v[i]; A.o[i] += o[i]; }
  if (pp) for (let i = 0; i < 15; i++) A.p[i] += pp[i];
}
// one player's line in every on/off mix of his chosen teammates (bit i set = teammate i on)
function slCombos(pid, mates) {
  const acc = Array.from({ length: 1 << mates.length }, slZero), all = slZero();
  slTeamStints((s, home, g) => {
    const own = home ? s[2] : s[3]; if (!own.includes(pid)) return;
    let m = 0; mates.forEach((q, i) => { if (own.includes(q)) m |= 1 << i; });
    slAdd(acc[m], s, home, pid, g); slAdd(all, s, home, pid, g);
  });
  return { acc, all };
}
function slRoster() {
  const m = {}, gp = {};
  slTeamStints((s, home, g) => (home ? s[2] : s[3]).forEach(p => { m[p] = (m[p] || 0) + s[1]; (gp[p] = gp[p] || new Set()).add(g.mid); }));
  return Object.keys(m).filter(p => m[p] > 0).sort((a, b) => m[b] - m[a]).map(p => ({ p, min: m[p] / 60, g: gp[p].size }));
}
const slShort = p => wyShort(personName(p));
const slAnd = a => a.length <= 2 ? a.join(' + ') : a.slice(0, -1).join(', ') + ' + ' + a[a.length - 1];
function slColName(mates, m) {
  if (m === 'all') return 'All minutes';
  const on = mates.filter((q, i) => m & (1 << i)).map(slShort), off = mates.filter((q, i) => !(m & (1 << i))).map(slShort);
  return on.length && off.length ? `With ${slAnd(on)}, without ${slAnd(off)}` : on.length ? `With ${slAnd(on)}` : `Without ${slAnd(off)}`;
}

/* ---- drawing ---- */
function slTween(scope) {
  if (wyReduce()) return;
  scope.querySelectorAll('[data-sk]').forEach(el => {
    const k = el.dataset.sk, to = el.dataset.sv === '' ? null : +el.dataset.sv, from = SL.prev[k]; SL.prev[k] = to;
    if (to == null || from == null || Math.abs(from - to) < 0.005) return;
    const key = el.dataset.ss, unit = SL.unit, t0 = performance.now();
    const step = now => { const t = Math.min(1, (now - t0) / 480), e = 1 - Math.pow(1 - t, 3); el.textContent = slFmt(key, from + (to - from) * e, unit); if (t < 1) requestAnimationFrame(step); };
    el.textContent = slFmt(key, from, unit); requestAnimationFrame(step);
  });
}
const slUnits = long => `<div class="sl-units" role="group" aria-label="Unit">${SL_UNITS.map(([k, l]) => `<button type="button" data-slunit="${k}" aria-pressed="${SL.unit === k}">${long && k === SL.unit ? SL_ULONG[k] : l}</button>`).join('')}</div>`;
function slCard(pid, mates, o) {
  const { acc, all } = slCombos(pid, mates), full = (1 << mates.length) - 1, get = c => c === 'all' ? all : acc[c];
  let L = o.L, R = o.R;
  if (L == null || (L !== 'all' && L > full)) L = mates.length ? full : 'all';
  if (R == null || (R !== 'all' && R > full)) R = mates.length ? 0 : 'all';
  const A = get(L), B = get(R), keys = SL.tab === 'Overview' ? SL_OVER : SL_TABS[SL.tab];
  const opts = ['all'].concat(Array.from({ length: full + 1 }, (_, i) => full - i)), mins = c => Math.round(get(c).sec / 60);
  const mini = c => c === 'all' ? '' : `<span class="sl-mini" aria-hidden="true">${mates.map((q, i) => `<span class="${c & (1 << i) ? '' : 'off'}">${wyDisc(q)}</span>`).join('')}</span>`;
  const col = (side, c) => `<div class="sl-colh ${side}"><button type="button" class="sl-colb" data-slcol="${side}" data-slcard="${o.id}" aria-haspopup="true" aria-expanded="${SL.menu === o.id + side}"><span class="t"><i></i>${esc(slColName(mates, c))}</span>${mini(c)}<small>${mins(c)} min</small></button>
    ${SL.menu === o.id + side ? `<div class="sl-menu" role="menu">${opts.map(v => `<button type="button" role="menuitem" data-slpick="${side}" data-slcard="${o.id}" data-v="${v}" aria-current="${v === c}"><span>${esc(slColName(mates, v))}</span><span>${mins(v)} min</span></button>`).join('')}</div>` : ''}</div>`;
  const rows = keys.map((k, i) => {
    const a = slValue(k, A, SL.unit), b = slValue(k, B, SL.unit), d = a != null && b != null ? Math.abs(a - b) : null;
    const big = d == null || slZeroTxt(slFmt(k, d, SL.unit, true)) ? '' : a > b ? 'L' : 'R';
    const bd = side => big === side ? `<span class="sl-bd ${side}">+${slFmt(k, d, SL.unit, true)}</span>` : '<span></span>';
    return `<div class="sl-row" style="--i:${i}">${bd('L')}<span class="v" data-sk="${o.id}L${k}" data-sv="${a == null ? '' : a}" data-ss="${esc(k)}">${slFmt(k, a, SL.unit)}</span><span class="k">${esc(slLabel(k))}</span><span class="v" data-sk="${o.id}R${k}" data-sv="${b == null ? '' : b}" data-ss="${esc(k)}">${slFmt(k, b, SL.unit)}</span>${bd('R')}</div>`;
  }).join('');
  const ti = Object.keys(SL_TABS).indexOf(SL.tab), yr = SL.from === SL.to ? SL.from : SL.from + '–' + SL.to;
  return `<article class="sl-shift" style="--i:${o.i || 0}">
    <div class="sl-top"><span class="lg">${WY_SER[SL.ser].toUpperCase()}</span><span class="yr">${yr}</span>
      <div class="sl-hero">${wyDisc(pid)}<span class="sl-mates">${mates.map(q => `<button type="button" data-slmain="${q}" title="Make ${esc(personName(q))} the main player" aria-label="Make ${esc(personName(q))} the main player">${wyDisc(q)}</button>`).join('')}</span></div>
      <h2><a href="#/p/${esc(pid)}">${esc(personName(pid))}</a></h2>${slUnits(true)}</div>
    <div class="sl-tabs" role="tablist" aria-label="Stat group">${Object.keys(SL_TABS).map(t => `<button type="button" role="tab" data-sltab="${t}" aria-selected="${SL.tab === t}">${t}</button>`).join('')}<span class="line" style="transform:translateX(${ti * 100}%)" aria-hidden="true"></span></div>
    <div class="sl-cols"><span></span>${col('L', L)}<span></span>${col('R', R)}<span></span></div>
    <div class="sl-rows">${rows}</div>
    ${Math.min(A.sec, B.sec) / 60 < SL_MIN_WARN ? `<p class="sl-warn">Under ${SL_MIN_WARN} minutes in a column: read with care.</p>` : ''}
    <div class="sl-foot"><span>${esc(wyTeamName(SL.team))}</span><span>${SL.phase === 'po' ? 'Playoffs' : SL.phase === 'rs' ? 'Regular season' : 'All games'} · ${all.g.size} ${all.g.size === 1 ? 'game' : 'games'}</span></div>
  </article>`;
}
function slTable() {
  const X0 = SL.pivot || SL.main, keys = SL_OVER, roster = slRoster(), sk = SL.sort;
  const rows = roster.filter(r => r.p !== X0).map(({ p }) => { const { acc } = slCombos(p, [X0]); return { p, wo: acc[0], w: acc[1] }; }).filter(r => r.w.sec > 0 || r.wo.sec > 0);
  const diff = (r, k) => { const a = slValue(k, r.wo, SL.unit), b = slValue(k, r.w, SL.unit); return a == null || b == null ? null : b - a; };
  rows.sort((a, b) => sk ? (diff(b, sk) ?? -1e9) - (diff(a, sk) ?? -1e9) : b.w.sec - a.w.sec);
  const parts = (r, k) => {
    const a = slValue(k, r.wo, SL.unit), b = slValue(k, r.w, SL.unit); let d = a == null || b == null ? null : b - a;
    if (d != null && slZeroTxt(slFmt(k, Math.abs(d), SL.unit, true))) d = 0;
    return { ab: `${slFmt(k, a, SL.unit)} → ${slFmt(k, b, SL.unit)}`, cls: d == null || d === 0 ? '' : d > 0 ? 'up' : 'down', d: d == null ? '—' : (d > 0 ? '+' : d < 0 ? '−' : '') + slFmt(k, Math.abs(d), SL.unit, true) };
  };
  // a table while every column fits; past that, one card per player: never a sideways scroll
  const root = document.getElementById('sl-stage'), asTable = (root ? root.clientWidth : 900) >= 230 + keys.length * 92;
  const who = r => `<div class="sl-tp">${wyDisc(r.p)}<span><button type="button" data-slpivot="${esc(r.p)}" title="Build the table around ${esc(personName(r.p))}">${esc(personName(r.p))}</button><small>${Math.round(r.wo.sec / 60)} min w/o → ${Math.round(r.w.sec / 60)} min with</small></span></div>`;
  const body = asTable
    ? `<table class="sl-tbl"><colgroup><col style="width:230px">${keys.map(() => '<col>').join('')}</colgroup><thead><tr><th scope="col"><button type="button" data-slsort="" aria-pressed="${!sk}">Player · min w/o → with</button></th>${keys.map(k => `<th scope="col"><button type="button" data-slsort="${esc(k)}" aria-pressed="${sk === k}" title="Sort by the change in ${esc(slLabel(k))}">${esc(slLabel(k))}</button></th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr style="--i:${Math.min(i, 14)}"><td>${who(r)}</td>${keys.map(k => { const c = parts(r, k); return `<td class="${sk === k ? 'foc' : ''}"><span class="sl-cell"><span class="ab">${c.ab}</span><b class="${c.cls}">${c.d}</b></span></td>`; }).join('')}</tr>`).join('')}</tbody></table>`
    : `<div class="sl-sortrow" role="group" aria-label="Sort by"><span>Sort</span><button type="button" data-slsort="" aria-pressed="${!sk}">Minutes with</button>${keys.map(k => `<button type="button" data-slsort="${esc(k)}" aria-pressed="${sk === k}">${esc(slLabel(k))}</button>`).join('')}</div>
      <div class="sl-tcards">${rows.map((r, i) => `<div class="sl-tc" style="--i:${Math.min(i, 14)}">${who(r)}<div class="sl-tcg">${keys.map(k => { const c = parts(r, k); return `<div class="${sk === k ? 'foc' : ''}"><span>${esc(slLabel(k))}</span><span class="ab">${c.ab}</span><b class="${c.cls}">${c.d}</b></div>`; }).join('')}</div></div>`).join('')}</div>`;
  return `<div class="sl-tcard">
    <div class="sl-tcard-h"><div class="sl-who">${wyDisc(X0)}<div><h2>${SL_ULONG[SL.unit]} without and with ${esc(personName(X0))}</h2><span>${esc(wyTeamName(SL.team))} · ${WY_SER[SL.ser]} ${SL.from === SL.to ? SL.from : SL.from + '–' + SL.to}</span></div></div>
      <div class="sl-tctl"><label class="wy-pick" style="height:34px"><span class="lab">PLAYER</span><select id="sl-pivot" aria-label="Player the table is built around">${roster.map(r => `<option value="${esc(r.p)}" ${r.p === X0 ? 'selected' : ''}>${esc(personName(r.p))}</option>`).join('')}</select></label>${slUnits(false)}</div></div>
    ${rows.length ? body : '<div class="wy-empty">No teammate shared the floor with him in these games.</div>'}
    <div class="sl-legend"><span>Each cell: without ${esc(slShort(X0))} → with him, and the change. <b class="up">Orange</b> went up with him, <b class="down">blue</b> went down.</span><span>Click a name to build the table around that player; click a column to sort by its change.</span></div>
  </div>`;
}

/* ---- the page ---- */
function renderShift() {
  return `<div class="page sl-page">
    <div class="page-head"><div><h1 class="page-title">Stat line shift</h1>
      <div class="page-sub">One player’s stat line in every combination of the teammates you pick: how his scoring, passing and shooting move when they share the floor and when they don’t. Men’s Agong Cup and MBL.</div></div></div>
    <div id="sl-root" class="wy sl"></div></div>`;
}
function slShell() {
  const ys = wyYears(SL.ser), yo = ys.map(y => `<option value="${y}">${y}</option>`).join('');
  const seg = (id, items, cur, attr) => `<div class="wy-seg" id="${id}" role="group"><span class="wy-ind" aria-hidden="true"></span>${items.map(([k, l]) => `<button type="button" ${attr}="${k}" aria-pressed="${String(k) === String(cur)}">${l}</button>`).join('')}</div>`;
  return `
  <div class="wy-ctl">
    ${seg('sl-ser', Object.keys(WY_SER).filter(k => wyYears(k).length).map(k => [k, WY_SER[k]]), SL.ser, 'data-slser')}
    <div class="wy-pick"><label for="sl-from">FROM</label><select id="sl-from">${yo}</select><label for="sl-to">TO</label><select id="sl-to">${yo}</select></div>
    <div class="wy-pick"><label for="sl-team">TEAM</label><select id="sl-team"></select></div>
    <span id="sl-phasebox"></span>
  </div>
  <div class="wy-ctl">
    ${seg('sl-view', [['combos', 'Combos'], ['side', 'Side by side'], ['table', 'Table']], SL.view, 'data-slview')}
    <button type="button" class="wy-btn" id="sl-cust"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>Customize stats</button>
  </div>
  <div class="sl-layout ${SL.view === 'table' ? 'wide' : ''}" id="sl-layout">
    <aside class="sl-side" aria-label="Players"><div><h2>Players</h2><p>Pick the player whose line you want (<b>Main</b>) and up to four teammates. Every on/off mix of the teammates becomes a column you can choose.</p></div><div class="sl-roster" id="sl-roster"></div><button type="button" class="wy-chip sl-more" id="sl-more" hidden aria-controls="sl-roster"></button></aside>
    <div class="sl-stage" id="sl-stage"></div>
  </div>
  <details class="wy-how"><summary>How it’s calculated</summary><div class="wy-howg">
    <div><h3>Which minutes</h3><p>Every substitution in the play-by-play gives the five on the floor for each stretch of a game. A column adds up every stretch with the main player on the floor and the teammates on or off as it says. His own points, shots, rebounds and the rest are counted inside those stretches only, and add up to his box scores.</p></div>
    <div><h3>Per 100, per 30, totals</h3><p>Per 100 divides by the team’s possessions in those minutes (<code>FGA + 0.44 × FTA − OREB + TOV</code>), per 30 by his minutes: a game here is 40 minutes, not the NBA’s 48. USG% is his share of the team’s shots, free-throw trips and turnovers while he is on.</p></div>
    <div><h3>The Team tab</h3><p>ORTG and DRTG are points per 100 possessions for and against, PACE possessions per 40 minutes, PTS% his share of the team’s points. The badge sits on the bigger of the two numbers and says by how much.</p></div>
    <div><h3>Read with care</h3><p>A tournament is 5 to 12 games: under ${SL_MIN_WARN} minutes, a column can swing on one hot night.</p></div>
  </div></details>`;
}
function slFillTeams() {
  const sec = {};
  slData().forEach(c => c.games.forEach(g => g.st.forEach(s => { sec[g.h] = (sec[g.h] || 0) + s[1]; sec[g.a] = (sec[g.a] || 0) + s[1]; })));
  const L = Object.keys(sec).sort((a, b) => wyTeamName(a).localeCompare(wyTeamName(b)));
  if (!L.includes(SL.team)) { const last = slData().slice(-1)[0]; SL.team = last && L.includes(last.champ) ? last.champ : L[0] || ''; }
  const el = document.getElementById('sl-team');
  if (el) { el.innerHTML = L.map(t => `<option value="${esc(t)}">${esc(wyTeamName(t))}</option>`).join(''); el.value = SL.team; }
}
function slFillPhase() {
  const has = slData().some(c => c.games.some(g => g.po)), box = document.getElementById('sl-phasebox'); if (!box) return;
  if (!has) { SL.phase = 'all'; box.innerHTML = ''; return; }
  box.innerHTML = `<div class="wy-seg" id="sl-phase" role="group" aria-label="Season stage"><span class="wy-ind" aria-hidden="true"></span>${[['all', 'All games'], ['rs', 'Reg season'], ['po', 'Playoffs']].map(([k, l]) => `<button type="button" data-slphase="${k}" aria-pressed="${SL.phase === k}">${l}</button>`).join('')}</div>`;
}
function slDefaults() {
  const L = slRoster(), has = p => L.some(r => r.p === p);
  if (!SL.main || !has(SL.main)) { SL.main = L[0] ? L[0].p : null; SL.mates = L[1] ? [L[1].p] : []; }
  else SL.mates = SL.mates.filter(has).slice(0, 4);
  SL.colL = SL.colR = null; SL.pivot = null; SL.sort = null; SL.card = {};
}
function slFillRoster() {
  const el = document.getElementById('sl-roster'); if (!el) return;
  el.innerHTML = slRoster().map(({ p, min, g }) => {
    const isM = SL.main === p, isT = SL.mates.includes(p), full = SL.mates.length >= 4 && !isT && !isM;
    return `<div class="sl-rp ${isM ? 'main' : isT ? 'sel' : ''}">${wyDisc(p)}<span><b>${esc(personName(p))}</b><small>${g} ${g === 1 ? 'game' : 'games'} · ${Math.round(min)} min</small></span>
      <span class="sl-duo" role="group" aria-label="${esc(personName(p))}"><button type="button" class="m" data-slrm="${esc(p)}" aria-pressed="${isM}">Main</button><button type="button" class="t" data-slrt="${esc(p)}" aria-pressed="${isT}" aria-label="Teammate" ${full || isM ? 'disabled' : ''}>Mate</button></span></div>`;
  }).join('') || '<p class="wy-muted">No players in these games.</p>';
  // on a phone the list sits above the card: the first six, and the rest one tap away
  const n = el.children.length, more = document.getElementById('sl-more');
  el.classList.toggle('short', !SL.allRoster && n > 6);
  if (more) { more.hidden = n <= 6; more.textContent = SL.allRoster ? 'Show fewer players' : `Show all ${n} players`; more.setAttribute('aria-expanded', String(!!SL.allRoster)); }
}
function slStage(anim) {
  const st = document.getElementById('sl-stage'); if (!st) return;
  const lay = document.getElementById('sl-layout'); if (lay) lay.classList.toggle('wide', SL.view === 'table');
  if (!slReady()) { st.innerHTML = `<div class="sl-tcard"><div class="wy-empty">${slFailed() ? 'The play-by-play for these games did not load. Reload the page to try again.' : 'Loading the play-by-play…'}</div></div>`; return; }
  if (!SL.main) { st.innerHTML = '<div class="sl-tcard"><div class="wy-empty">No player has minutes in these games.</div></div>'; return; }
  if (SL.view === 'combos') st.innerHTML = slCard(SL.main, SL.mates, { id: 'c', L: SL.colL, R: SL.colR });
  else if (SL.view === 'side') { const all = [SL.main].concat(SL.mates); st.innerHTML = `<div class="sl-grid">${all.map((p, i) => slCard(p, all.filter(q => q !== p), Object.assign({ id: 's' + i, i }, SL.card['s' + i] || {}))).join('')}</div>`; }
  else st.innerHTML = slTable();
  st.classList.toggle('anim', !!anim); slTween(st); slToUrl();
}
function slIndicators() { ['sl-ser', 'sl-view', 'sl-phase'].forEach(id => wySlide(id, '[aria-pressed="true"]')); }
// everything, after a change of competition, years or team
function slPaint() {
  const root = document.getElementById('sl-root'); if (!root) return;
  if (!root.dataset.built) { root.innerHTML = slShell(); root.dataset.built = '1'; }
  const f = document.getElementById('sl-from'), t = document.getElementById('sl-to'); if (f) { f.value = SL.from; t.value = SL.to; }
  slSel().forEach(c => { wyLoad(c.id); slLoadSp(c.id); });
  if (slReady()) {
    const prev = SL.team; slFillTeams(); slFillPhase();
    if (!SL.booted || prev !== SL.team) { if (!SL.urlPlayers || prev !== SL.team) { SL.main = null; } SL.urlPlayers = false; SL.booted = true; }
    slDefaults(); slFillRoster();
  }
  slStage(true);
  requestAnimationFrame(slIndicators);
}

/* ---- the address ---- */
function slFromUrl() {
  const Y0 = wyYears(SL.ser);
  if (!location.search) { if (!Y0.includes(SL.from)) SL.from = SL.to = Y0[Y0.length - 1]; return; }
  const q = new URLSearchParams(location.search), ser = q.get('s');
  if (ser && WY_SER[ser] && wyYears(ser).length) SL.ser = ser;
  const Y = wyYears(SL.ser), f = +q.get('f'), t = +q.get('t');
  SL.from = Y.includes(f) ? f : Y[Y.length - 1];
  SL.to = Y.includes(t) && t >= SL.from ? t : SL.from;
  if (q.get('team')) SL.team = q.get('team');
  if (q.get('main')) { SL.main = q.get('main'); SL.mates = (q.get('mates') || '').split(',').filter(Boolean).slice(0, 4); SL.urlPlayers = true; }
  const v = q.get('v'); if (['combos', 'side', 'table'].includes(v)) SL.view = v;
  const tb = q.get('tab'); if (tb && SL_TABS.hasOwnProperty(tb)) SL.tab = tb;
  const u = q.get('u'); if (SL_UNITS.some(x => x[0] === u)) SL.unit = u;
  const ph = q.get('ph'); if (['rs', 'po'].includes(ph)) SL.phase = ph;
}
function slToUrl() {
  if (!document.getElementById('sl-root')) return;
  const q = new URLSearchParams();
  q.set('s', SL.ser); q.set('f', SL.from); q.set('t', SL.to);
  if (SL.team) q.set('team', SL.team);
  if (SL.main) q.set('main', SL.main);
  if (SL.mates.length) q.set('mates', SL.mates.join(','));
  if (SL.view !== 'combos') q.set('v', SL.view);
  if (SL.tab !== 'Overview') q.set('tab', SL.tab);
  if (SL.unit !== 'p100') q.set('u', SL.unit);
  if (SL.phase !== 'all') q.set('ph', SL.phase);
  const want = location.pathname + '?' + q.toString() + location.hash;
  if (want !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', want);
}

/* ---- customise the Overview ---- */
function slCustomize() {
  let dlg = document.getElementById('sl-dlg');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'sl-dlg'; dlg.className = 'sl-dlg'; dlg.setAttribute('aria-labelledby', 'sl-czt'); document.body.appendChild(dlg);
    dlg.addEventListener('click', e => {
      if (e.target === dlg || e.target.closest('[data-slcz="cancel"]')) { dlg.close(); return; }
      const b = e.target.closest('[data-slcz]'); if (!b) return;
      const ins = dlg.querySelectorAll('input[type=checkbox]');
      if (b.dataset.slcz === 'def') ins.forEach(i => { i.checked = SL_DEF.includes(i.value); });
      if (b.dataset.slcz === 'clear') ins.forEach(i => { i.checked = false; });
      if (b.dataset.slcz === 'save') {
        const picked = [...ins].filter(i => i.checked).map(i => i.value);
        SL_OVER = picked.length ? Object.values(SL_GROUPS).flat().filter(k => picked.includes(k)) : SL_DEF.slice();
        try { localStorage.setItem('hs-shift-stats', JSON.stringify(SL_OVER)); } catch (err) {}
        SL.tab = 'Overview'; SL.sort = null; dlg.close(); slStage(true);
      }
    });
  }
  dlg.innerHTML = `<div class="sl-cz"><h2 id="sl-czt">Customize stats</h2><p>Pick the stats on the Overview tab and in the table.</p>
    <div class="sl-czg">${Object.entries(SL_GROUPS).map(([g, ks]) => `<fieldset><legend>${g.toUpperCase()}</legend>${ks.map(k => `<label><input type="checkbox" value="${esc(k)}" ${SL_OVER.includes(k) ? 'checked' : ''}>${esc(slLabel(k))}</label>`).join('')}</fieldset>`).join('')}</div>
    <div class="sl-czb"><span><button type="button" class="wy-chip" data-slcz="def">Defaults</button><button type="button" class="wy-chip" data-slcz="clear">Clear all</button></span>
      <button type="button" class="wy-btn" data-slcz="cancel">Cancel</button><button type="button" class="wy-btn sl-primary" data-slcz="save">Save changes</button></div></div>`;
  dlg.showModal();
}

/* ---- events ---- */
document.addEventListener('click', e => {
  if (!document.getElementById('sl-root')) return;
  const t = e.target.closest && e.target.closest('#sl-root button');
  if (!t) { if (SL.menu && !(e.target.closest && e.target.closest('.sl-menu'))) { SL.menu = null; slStage(); } return; }
  const d = t.dataset;
  if (d.slser) { if (d.slser === SL.ser) return; SL.ser = d.slser; const Y = wyYears(SL.ser); SL.from = SL.to = Y[Y.length - 1]; SL.team = ''; SL.main = null; SL.booted = false; SL.phase = 'all';
    document.querySelectorAll('#sl-ser button').forEach(b => b.setAttribute('aria-pressed', String(b === t)));
    const yo = Y.map(y => `<option value="${y}">${y}</option>`).join(''); document.getElementById('sl-from').innerHTML = yo; document.getElementById('sl-to').innerHTML = yo; slPaint(); return; }
  if (d.slview) { SL.view = d.slview; SL.menu = null; document.querySelectorAll('#sl-view button').forEach(b => b.setAttribute('aria-pressed', String(b === t))); slIndicators(); slStage(true); return; }
  if (d.slphase) { SL.phase = d.slphase; document.querySelectorAll('#sl-phase button').forEach(b => b.setAttribute('aria-pressed', String(b === t))); slIndicators(); slDefaults(); slFillRoster(); slStage(true); return; }
  if (t.id === 'sl-cust') { slCustomize(); return; }
  if (t.id === 'sl-more') { SL.allRoster = !SL.allRoster; slFillRoster(); return; }
  if (d.slrm) { const p = d.slrm; if (SL.main === p) return; const old = SL.main; SL.mates = SL.mates.filter(q => q !== p); if (old && SL.mates.length < 4) SL.mates.unshift(old); SL.main = p; SL.colL = SL.colR = null; SL.pivot = null; SL.card = {}; slFillRoster(); slStage(true); return; }
  if (d.slrt) { const p = d.slrt; SL.mates = SL.mates.includes(p) ? SL.mates.filter(q => q !== p) : SL.mates.concat(p).slice(0, 4); SL.colL = SL.colR = null; SL.card = {}; slFillRoster(); slStage(true); return; }
  if (d.slmain) { const p = d.slmain, old = SL.main; SL.mates = SL.mates.filter(q => q !== p).concat(old); SL.main = p; SL.colL = SL.colR = null; SL.card = {}; slFillRoster(); slStage(true); return; }
  if (d.slunit) { SL.unit = d.slunit; slStage(); return; }
  if (d.sltab) { SL.tab = d.sltab; slStage(); return; }
  if (d.slcol) { const id = d.slcard + d.slcol; SL.menu = SL.menu === id ? null : id; slStage(); const m = document.querySelector('.sl-menu button[aria-current="true"]'); if (m) m.focus(); return; }
  if (d.slpick) { const v = d.v === 'all' ? 'all' : +d.v; SL.menu = null;
    if (d.slcard === 'c') { if (d.slpick === 'L') SL.colL = v; else SL.colR = v; } else SL.card[d.slcard] = Object.assign(SL.card[d.slcard] || {}, { [d.slpick]: v });
    slStage(); return; }
  if (d.slsort != null) { SL.sort = d.slsort || null; slStage(); return; }
  if (d.slpivot) { SL.pivot = d.slpivot; SL.sort = null; slStage(true); return; }
  if (SL.menu && !t.closest('.sl-menu')) { SL.menu = null; slStage(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && SL.menu && document.getElementById('sl-root')) { SL.menu = null; slStage(); } });
document.addEventListener('change', e => {
  const id = e.target.id; if (!id || !/^sl-/.test(id)) return;
  if (id === 'sl-from' || id === 'sl-to') { const v = +e.target.value; if (id === 'sl-from') { SL.from = v; if (SL.to < v) SL.to = v; } else { SL.to = v; if (SL.from > v) SL.from = v; } slPaint(); return; }
  if (id === 'sl-team') { SL.team = e.target.value; SL.main = null; slDefaults(); slFillPhase(); slFillRoster(); slStage(true); requestAnimationFrame(slIndicators); return; }
  if (id === 'sl-pivot') { SL.pivot = e.target.value; SL.sort = null; slStage(true); }
});
let SL_RZ = 0;
addEventListener('resize', () => { if (!document.getElementById('sl-root')) return; slIndicators(); if (SL.view !== 'table') return; clearTimeout(SL_RZ); SL_RZ = setTimeout(() => slStage(), 150); });

// run by afterRender (app5_rest.js) whenever #/shift is drawn
function slAfterRender() {
  const root = document.getElementById('sl-root'); if (!root || root.dataset.built) return;
  if (!wyComps().length) { root.innerHTML = '<div class="wy-empty">No competition has lineup data yet.</div>'; return; }
  slFromUrl();
  slPaint();
}
