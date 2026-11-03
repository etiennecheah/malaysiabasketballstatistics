/* =========================================================================
   Tools › WOWY ("with or without you"), approved from the prototype (3 Nov 2026).

   How a team played with each mix of chosen players on and off the floor:
   every on/off combination of up to five "combo" players, with any other
   player held on or off for every row, and 2- to 5-man lineup leaders.
   Modelled on databallr's WOWY Combos, without its Pad, Luck or expected
   (DARKO) columns. Men's Agong Cup and men's MBL only (user decision).

   The numbers come from the rebuilt stints in stats/lv/<cid>.js (build_stats.py):
   every stretch of a game with both fives, the points and each side's box
   counters. One file per edition, shared with Compare › Lineups (CMPL_PUT).

   Route: #/wowy. The choices live in the address (?s=&f=&t=&team=&p=…), so a
   view can be bookmarked or shared; a change repaints #wy-root only.
   ========================================================================= */
const WY_X = { fgm: 0, fga: 1, tpm: 2, tpa: 3, ftm: 4, fta: 5, oreb: 6, dreb: 7, ast: 8, tov: 9, stl: 10, blk: 11, pf: 12, pfd: 13, toreb: 14, tdreb: 15, ttov: 16 };
const WY_SER = { mbl: 'MBL', agm: 'Agong Cup' };
const WY_CLOCK = [['full', 'Full game'], ['h1', '1st half'], ['h2', '2nd half + OT'], ['q1', 'Q1'], ['q2', 'Q2'], ['q3', 'Q3'], ['q4', 'Q4'], ['ot', 'OT'], ['last5', 'Last 5 of Q4 + OT']];
const WY_VIEWS = [['overview', 'Overview'], ['offense', 'Offense'], ['defense', 'Defense'], ['expanded', 'Expanded']];
const WY_MODES = [['wowy', 'Combinations'], ['2', '2-man'], ['3', '3-man'], ['4', '4-man'], ['5', '5-man']];
const WY = { ser: 'mbl', from: 0, to: 0, team: '', mode: 'wowy', view: 'overview', combo: [], hold: {},
  phase: 'all', dFrom: '', dTo: '', clock: 'full', garbage: false, common: false, opp: 'all', tier: 'top', oppPick: new Set(), vs: {}, vsQ: '',
  scope: 'team', minMin: 20, openP: false, openF: false, prep: {}, slugs: null, names: null, rows: [], lg: null, prev: {}, booted: false };

const wyComps = () => ((DB.stats || {}).wy || {}).comps || [];
const wyYears = ser => [...new Set(wyComps().filter(c => c.ser === ser).map(c => c.year))].sort((a, b) => a - b);
const wySel = () => wyComps().filter(c => c.ser === WY.ser && c.year >= WY.from && c.year <= WY.to);
const wyReduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- teams: one slug per club or state across every edition (the Teams pages' own) ---- */
function wyTeamMaps() {
  if (WY.slugs) return;
  WY.slugs = {}; WY.names = {};
  const ids = new Set(wyComps().map(c => c.id));
  teamIndex().forEach(t => t.apps.forEach(a => { if (ids.has(String(a.cid))) { WY.slugs[a.cid + '|' + a.as] = t.slug; WY.names[t.slug] = t.name; } }));
}
const wySlug = (cid, name) => { wyTeamMaps(); return WY.slugs[cid + '|' + name] || 'x-' + String(name).toLowerCase(); };
const wyTeamName = slug => { wyTeamMaps(); return WY.names[slug] || String(slug || '').replace(/^x-/, ''); };

/* ---- the edition files ---- */
function wyLoad(cid) {
  if (CL.data[cid]) return true;
  if (CL.load[cid] === 'loading') return false;
  CL.load[cid] = 'loading';
  const s = document.createElement('script');
  s.src = HS.BASE + 'stats/lv/' + cid + '.js';
  s.onload = () => { CL.load[cid] = CL.data[cid] ? 'done' : 'error'; wyPaint(); };
  s.onerror = () => { CL.load[cid] = 'error'; wyPaint(); };
  document.head.appendChild(s);
  return false;
}
// each stint gets player ids, its start inside the period and the margin when it began
function wyPrep(cid) {
  if (WY.prep[cid]) return WY.prep[cid];
  const d = CL.data[cid]; if (!d) return null;
  wyTeamMaps();
  const pid = d.players.map(p => p[0]), c = COMP_BY_ID[cid] || {};
  const rank = {};
  (c.stand || []).forEach(r => { rank[wySlug(cid, r.team)] = r.pos; });
  const games = d.games.map(g => {
    const el = {}; let hs = 0, as = 0;
    const st = g.st.map(s => {
      const p = +s[0] || 0, x = [p, s[1], s[2].map(i => pid[i]), s[3].map(i => pid[i]), s[4], s[5][0], s[5][1]];
      x.t0 = el[p] || 0; el[p] = x.t0 + s[1]; x.m = hs - as; hs += s[4][0]; as += s[4][1];
      return x;
    });
    const hp = new Set(), ap = new Set();
    st.forEach(s => { s[2].forEach(p => hp.add(p)); s[3].forEach(p => ap.add(p)); });
    return { mid: g.mid, d: g.date || '', h: wySlug(cid, g.h), a: wySlug(cid, g.a), po: g.po ? 1 : 0, st, hp, ap };
  });
  return (WY.prep[cid] = { cid, champ: c.champ ? wySlug(cid, c.champ) : '', rank, games });
}
const wyReady = () => wySel().every(c => CL.data[c.id]);
const wyData = () => wySel().map(c => wyPrep(c.id)).filter(Boolean);
const wyTeamGames = cs => cs.flatMap(c => c.games.filter(g => g.h === WY.team || g.a === WY.team).map(g => ({ c, g, home: g.h === WY.team })));

/* ---- the numbers ---- */
const wyZero = () => ({ sec: 0, pts: 0, opp: 0, v: new Array(17).fill(0), o: new Array(17).fill(0), g: new Set(), mates: {} });
function wyAdd(A, s, home, w, mid) {
  const v = home ? s[5] : s[6], o = home ? s[6] : s[5];
  A.sec += s[1] * w; A.pts += (home ? s[4][0] : s[4][1]) * w; A.opp += (home ? s[4][1] : s[4][0]) * w;
  for (let i = 0; i < 17; i++) { A.v[i] += v[i] * w; A.o[i] += o[i] * w; }
  A.g.add(mid);
  (home ? s[2] : s[3]).forEach(p => { A.mates[p] = (A.mates[p] || 0) + s[1] * w; });
}
// possessions: the same estimate as Compare › Lineups, from each side's own counts
const wyPoss = v => v[WY_X.fga] + 0.44 * v[WY_X.fta] - v[WY_X.oreb] - v[WY_X.toreb] + v[WY_X.tov] + v[WY_X.ttov];
function wyLeague(cs) {
  const A = { sec: 0, pts: 0, v: new Array(17).fill(0) };
  cs.forEach(c => c.games.forEach(g => g.st.forEach(s => {
    A.sec += s[1]; A.pts += s[4][0] + s[4][1];
    for (let i = 0; i < 17; i++) A.v[i] += s[5][i] + s[6][i];
  })));
  const v = A.v, p = wyPoss(v), X = WY_X;
  return { rtg: 100 * A.pts / p, ts: 100 * A.pts / (2 * (v[X.fga] + 0.44 * v[X.fta])), tov: 100 * (v[X.tov] + v[X.ttov]) / p,
    orb: 100 * v[X.oreb] / (v[X.oreb] + v[X.dreb]), tp: v[X.tpm] / v[X.tpa], ppm: (p / 2) / (A.sec / 60) };
}
function wyMetrics(A) {
  const v = A.v, o = A.o, X = WY_X, po = wyPoss(v), pd = wyPoss(o);
  const r = (a, b) => b > 0 ? 100 * a / b : null;
  const off = po > 0 ? 100 * A.pts / po : null, def = pd > 0 ? 100 * A.opp / pd : null;
  return { min: A.sec / 60, po, pd, off, def, net: off != null && def != null ? off - def : null, pm: A.pts - A.opp, games: A.g.size,
    ts: r(A.pts, 2 * (v[X.fga] + 0.44 * v[X.fta])), tov: r(v[X.tov] + v[X.ttov], po), orb: r(v[X.oreb], v[X.oreb] + o[X.dreb]), tp: r(v[X.tpm], v[X.tpa]), tpa: v[X.tpa],
    ots: r(A.opp, 2 * (o[X.fga] + 0.44 * o[X.fta])), otov: r(o[X.tov] + o[X.ttov], pd), oorb: r(o[X.oreb], o[X.oreb] + v[X.dreb]), otp: r(o[X.tpm], o[X.tpa]), otpa: o[X.tpa] };
}

/* ---- filters ---- */
// the share of a stint inside the chosen part of the game (FIBA: four 10-minute quarters, 5-minute OT)
function wyClockW(s) {
  const p = s[0], a = s.t0, b = s.t0 + s[1];
  switch (WY.clock) {
    case 'h1': return p <= 2 ? 1 : 0;
    case 'h2': return p >= 3 ? 1 : 0;
    case 'q1': case 'q2': case 'q3': case 'q4': return p === +WY.clock[1] ? 1 : 0;
    case 'ot': return p >= 5 ? 1 : 0;
    case 'last5': if (p >= 5) return 1; if (p !== 4 || s[1] <= 0) return 0; return Math.max(0, Math.min(b, 600) - Math.max(a, 300)) / s[1];
    default: return 1;
  }
}
// garbage time: Cleaning the Glass's rule scaled to 10-minute quarters
function wyGarbage(s) {
  if (s[0] !== 4) return false;
  const rem = 600 - s.t0, m = Math.abs(s.m);
  return (rem > 450 && m >= 25) || (rem <= 450 && rem > 300 && m >= 20) || (rem <= 300 && m >= 10);
}
function wyTier(c, slug) {
  const n = Object.keys(c.rank).length, r = c.rank[slug]; if (!r || !n) return '';
  const k = Math.ceil(n / 3); return r <= k ? 'top' : r > n - k ? 'bot' : 'mid';
}
function wyGameOk(c, g, home) {
  if (WY.phase === 'rs' && g.po) return false;
  if (WY.phase === 'po' && !g.po) return false;
  if (WY.dFrom && g.d < WY.dFrom) return false;
  if (WY.dTo && g.d > WY.dTo) return false;
  const opp = home ? g.a : g.h;
  if (WY.opp === 'tier' && wyTier(c, opp) !== WY.tier) return false;
  if (WY.opp === 'pick' && WY.oppPick.size && !WY.oppPick.has(opp)) return false;
  if (WY.common && WY.mode === 'wowy' && WY.combo.length) { const own = home ? g.hp : g.ap; if (!WY.combo.every(p => own.has(p))) return false; }
  return true;
}
function wyStintOk(s, home) {
  const own = home ? s[2] : s[3], them = home ? s[3] : s[2];
  for (const p in WY.hold) if ((WY.hold[p] === 'on') !== own.includes(p)) return false;
  for (const p in WY.vs) if ((WY.vs[p] === 'on') !== them.includes(p)) return false;
  return !(WY.garbage && wyGarbage(s));
}
const wyNFilters = () => (WY.phase !== 'all') + !!(WY.dFrom || WY.dTo) + (WY.clock !== 'full') + WY.garbage + WY.common + (WY.opp !== 'all') + Object.keys(WY.vs).length + Object.keys(WY.hold).length;

/* ---- the rows ---- */
function wyCombos(arr, k) { const out = []; const rec = (i, cur) => { if (cur.length === k) { out.push(cur.slice()); return; } for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); } }; rec(0, []); return out; }
function wyCompute() {
  const cs = wyData(); WY.lg = wyLeague(cs);
  if (WY.mode === 'wowy') {
    const k = WY.combo.length, acc = Array.from({ length: 1 << k }, wyZero);
    wyTeamGames(cs).forEach(({ c, g, home }) => {
      if (!wyGameOk(c, g, home)) return;
      g.st.forEach(s => {
        if (s[1] <= 0 || !wyStintOk(s, home)) return;
        const w = wyClockW(s); if (!w) return;
        const own = home ? s[2] : s[3]; let m = 0;
        WY.combo.forEach((p, i) => { if (own.includes(p)) m |= 1 << i; });
        wyAdd(acc[m], s, home, w, g.mid);
      });
    });
    const full = (1 << k) - 1;
    WY.rows = acc.map((A, m) => ({ key: 'w' + m, A, on: WY.combo.map((p, i) => [p, !!(m & (1 << i))]), full: m === full }))
      .filter(r => r.A.sec >= 1).sort((a, b) => b.full - a.full || b.A.sec - a.A.sec);
  } else {
    const n = +WY.mode, map = {};
    cs.forEach(c => c.games.forEach(g => [true, false].forEach(home => {
      const slug = home ? g.h : g.a;
      if (WY.scope === 'team' && slug !== WY.team) return;
      if (!wyGameOk(c, g, home)) return;
      g.st.forEach(s => {
        if (s[1] <= 0 || !wyStintOk(s, home)) return;
        const w = wyClockW(s); if (!w) return;
        wyCombos((home ? s[2] : s[3]).slice().sort(), n).forEach(gp => {
          const k = slug + '|' + gp.join('.');
          const A = map[k] || (map[k] = Object.assign(wyZero(), { team: slug, gp }));
          wyAdd(A, s, home, w, g.mid);
        });
      });
    })));
    WY.rows = Object.entries(map).map(([k, A]) => ({ key: 'l' + k, A, team: A.team, on: A.gp.map(p => [p, true]) }))
      .filter(r => r.A.sec / 60 >= WY.minMin);
  }
  WY.rows.forEach(r => { r.M = wyMetrics(r.A); });
  if (WY.mode !== 'wowy') WY.rows = WY.rows.sort((a, b) => (b.M.net ?? -999) - (a.M.net ?? -999)).slice(0, 25);
}

/* ---- drawing helpers ---- */
const wyF1 = v => v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1);
const wySg = v => v == null || !isFinite(v) ? '—' : (v > 0.04 ? '+' : v < -0.04 ? '−' : '') + Math.abs(Math.round(v * 10) / 10).toFixed(1);
const wyShort = n => { const m = String(n).split(','); return m.length > 1 ? m[1].trim() : String(n); };
const wyCls = (d, hi) => d == null || !isFinite(d) || Math.abs(d) < 0.05 ? '' : (d > 0) === hi ? 'wy-good' : 'wy-bad';
function wyDisc(p) {
  const av = (DB.avatars || {})[p] || PHOTOS[p];
  return `<span class="wy-disc">${av ? `<img src="${av}" alt="" loading="lazy" decoding="async">` : esc(initials(wyShort(personName(p))))}</span>`;
}
const wyAvs = on => on.map(([p, o]) => `<span class="wy-av ${o ? 'on' : 'off'}" title="${esc(personName(p))} ${o ? 'on the floor' : 'off the floor'}">${wyDisc(p)}<span class="wy-tag" aria-hidden="true">OFF</span><small>${esc(wyShort(personName(p)))}</small><span class="sr-only">${o ? 'on' : 'off'}</span></span>`).join('');
function wyV(key, v, lg, hi, small) {
  const d = v == null ? null : v - lg;
  return `<td><span class="wy-v"><b data-wk="${key}" data-wv="${v == null ? '' : v}">${wyF1(v)}</b><span class="wy-d ${wyCls(d, hi)}">${wySg(d)}</span>${small ? `<span class="wy-s">${small}</span>` : ''}</span></td>`;
}
function wyNet(key, v) {
  const c = v == null ? '' : v > 0.05 ? 'wy-good' : v < -0.05 ? 'wy-bad' : '', w = v == null ? 0 : Math.min(50, Math.abs(v) / 30 * 50);
  return `<td><span class="wy-net"><b class="${c}" data-wk="${key}" data-wv="${v == null ? '' : v}" data-wsg="1">${wySg(v)}</b><span class="wy-nb" aria-hidden="true"><i class="${v != null && v < 0 ? 'neg' : 'pos'}" style="left:${v != null && v < 0 ? 50 - w : 50}%;width:${w}%"></i></span></span></td>`;
}

/* ---- the page ---- */
function renderWowy() {
  return `<div class="page wy-page">
    <div class="page-head"><div><h1 class="page-title">With or without you</h1>
      <div class="page-sub">How a team played with each mix of its players on and off the floor, rebuilt from every substitution in the play-by-play. Men’s Agong Cup and MBL.</div></div></div>
    <div id="wy-root" class="wy"></div></div>`;
}
function wySegHtml(id, items, cur, attr) {
  return `<div class="wy-seg" id="${id}" role="group"><span class="wy-ind" aria-hidden="true"></span>${items.map(([k, l]) => `<button type="button" ${attr}="${k}" aria-pressed="${String(k) === String(cur)}">${l}</button>`).join('')}</div>`;
}
function wyShell() {
  const ys = wyYears(WY.ser), yo = ys.map(y => `<option value="${y}">${y}</option>`).join('');
  return `
  <div class="wy-ctl">
    ${wySegHtml('wy-ser', Object.keys(WY_SER).filter(k => wyYears(k).length).map(k => [k, WY_SER[k]]), WY.ser, 'data-wyser')}
    <div class="wy-pick"><label for="wy-from">FROM</label><select id="wy-from">${yo}</select><label for="wy-to">TO</label><select id="wy-to">${yo}</select></div>
    <div class="wy-pick"><label for="wy-team">TEAM</label><select id="wy-team"></select></div>
  </div>
  <div class="wy-ctl">
    ${wySegHtml('wy-mode', WY_MODES, WY.mode, 'data-wymode')}
    <button type="button" class="wy-btn" id="wy-bp" aria-expanded="${WY.openP}" aria-controls="wy-fp" ${WY.mode === 'wowy' ? '' : 'hidden'}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 5.2a3.3 3.3 0 0 1 0 6.1M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/></svg>Players <em id="wy-nc"></em></button>
    <button type="button" class="wy-btn" id="wy-bf" aria-expanded="${WY.openF}" aria-controls="wy-ff"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filters <em id="wy-nf" hidden></em></button>
    <span class="wy-lead" id="wy-lead"></span>
  </div>
  <div class="wy-fold ${WY.openP ? 'open' : ''}" id="wy-fp"><div><div class="wy-panel">
    <div><h2>Players</h2><p>Combo players become the columns of every row, split into each on/off mix (up to five). On and Off hold for every row: “On” keeps only minutes with that player on the floor.</p></div>
    <div class="wy-plist" id="wy-plist"></div></div></div></div>
  <div class="wy-fold ${WY.openF ? 'open' : ''}" id="wy-ff"><div><div class="wy-panel" id="wy-filters"></div></div></div>
  <div class="wy-bar"><div class="wy-tabs" role="tablist" aria-label="View">${WY_VIEWS.map(([k, l]) => `<button type="button" role="tab" data-wyview="${k}" aria-selected="${WY.view === k}">${l}</button>`).join('')}<span class="wy-line" aria-hidden="true"></span></div></div>
  <div class="wy-card"><div class="wy-card-h"><h2 id="wy-title"></h2><span id="wy-sub"></span></div>
    <div class="wy-scroll" id="wy-tblbox"><table class="wy-tbl" id="wy-tbl"></table></div>
    <div class="wy-foot"><span id="wy-note"></span><span id="wy-lg"></span></div></div>
  <details class="wy-how"><summary>How it’s calculated</summary><div class="wy-howg">
    <div><h3>The rows</h3><p>Every substitution in the play-by-play gives the five on the floor for each stretch of a game. A row adds up every stretch where the combo players are exactly on or off as shown. Minutes are game clock.</p></div>
    <div><h3>OFF, DEF and NET</h3><p><code>OFF = 100 × points ÷ possessions</code>, DEF the same for the opponent, <code>NET = OFF − DEF</code>. Possessions are estimated from each side’s own counts: <code>FGA + 0.44 × FTA − OREB + TOV</code>.</p></div>
    <div><h3>Shooting, turnovers, rebounds</h3><p><code>TS% = PTS ÷ (2 × (FGA + 0.44 × FTA))</code>, <code>TOV% = TOV ÷ possessions</code>, <code>ORB% = OREB ÷ (OREB + opponent DREB)</code>. The small number under each is the gap to the league average of the editions chosen.</p></div>
    <div><h3>Game clock and garbage time</h3><p>“Last 5 of Q4 + OT” counts only the part of each stretch after 5:00 left in the fourth. Garbage time starts a stretch in the fourth with a lead of 25+ and more than 7:30 left, 20+ with 7:30 to 5:00 left, or 10+ inside the last five minutes.</p></div>
    <div><h3>What it can’t tell you</h3><p>On/off shows how the team played across those minutes, not why. Teammates, opponents and a few hot shooting nights all sit inside the number, and a tournament is 5 to 12 games: read rows with few minutes with care.</p></div>
  </div></details>`;
}
function wyFillTeams() {
  const sec = {};
  wyData().forEach(c => c.games.forEach(g => g.st.forEach(s => { sec[g.h] = (sec[g.h] || 0) + s[1]; sec[g.a] = (sec[g.a] || 0) + s[1]; })));
  const L = Object.keys(sec).sort((a, b) => wyTeamName(a).localeCompare(wyTeamName(b)));
  if (!L.includes(WY.team)) { const last = wyData().slice(-1)[0]; WY.team = last && L.includes(last.champ) ? last.champ : L[0] || ''; }
  const el = document.getElementById('wy-team');
  if (el) { el.innerHTML = L.map(t => `<option value="${esc(t)}">${esc(wyTeamName(t))}</option>`).join(''); el.value = WY.team; }
}
function wyPlayerMins() {
  const m = {}, gp = {};
  wyTeamGames(wyData()).forEach(({ g, home }) => {
    g.st.forEach(s => (home ? s[2] : s[3]).forEach(p => { m[p] = (m[p] || 0) + s[1]; }));
    (home ? g.hp : g.ap).forEach(p => { gp[p] = (gp[p] || 0) + 1; });
  });
  return Object.keys(m).sort((a, b) => m[b] - m[a]).map(p => ({ p, min: m[p] / 60, g: gp[p] || 0 }));
}
function wyDefaultCombo() { WY.combo = wyPlayerMins().slice(0, 2).map(x => x.p); WY.hold = {}; }
function wyFillPlayers() {
  const el = document.getElementById('wy-plist'); if (!el) return;
  el.innerHTML = wyPlayerMins().map(({ p, min, g }) => {
    const c = WY.combo.includes(p), h = WY.hold[p], full = WY.combo.length >= 5 && !c;
    return `<div class="wy-pl">${wyDisc(p)}<span><b>${esc(personName(p))}</b><small>${g} ${g === 1 ? 'game' : 'games'} · ${Math.round(min)} min</small></span>
      <span class="wy-tri" role="group" aria-label="${esc(personName(p))}"><button type="button" class="c" data-wyp="${p}" data-st="combo" aria-pressed="${c}" ${full ? 'disabled' : ''}>Combo</button><button type="button" data-wyp="${p}" data-st="on" aria-pressed="${h === 'on'}">On</button><button type="button" data-wyp="${p}" data-st="off" aria-pressed="${h === 'off'}">Off</button></span></div>`;
  }).join('') || '<p class="wy-muted">No players in these games.</p>';
}
function wyFillFilters() {
  const el = document.getElementById('wy-filters'); if (!el) return;
  const cs = wyData(), hasPO = cs.some(c => c.games.some(g => g.po)), dates = cs.flatMap(c => c.games.map(g => g.d)).filter(Boolean).sort();
  const opps = [...new Set(wyTeamGames(cs).map(x => x.home ? x.g.a : x.g.h))].sort((a, b) => wyTeamName(a).localeCompare(wyTeamName(b)));
  const chip = (attr, k, l, on) => `<button type="button" class="wy-chip" ${attr}="${esc(k)}" aria-pressed="${on}">${l}</button>`;
  const m = {};
  wyTeamGames(cs).forEach(({ g, home }) => g.st.forEach(s => (home ? s[3] : s[2]).forEach(p => { m[p] = (m[p] || 0) + s[1]; })));
  const q = WY.vsQ.trim().toLowerCase();
  const OP = Object.keys(m).sort((a, b) => m[b] - m[a]).filter(p => !q || personName(p).toLowerCase().includes(q) || WY.vs[p]).slice(0, 18);
  el.innerHTML = `
    ${hasPO ? `<div class="wy-frow"><span>Season stage</span><div class="wy-chips">${[['all', 'All games'], ['rs', 'Regular season'], ['po', 'Playoffs']].map(([k, l]) => chip('data-wyph', k, l, WY.phase === k)).join('')}</div></div>` : ''}
    <div class="wy-frow"><span>Dates</span><div class="wy-dates"><input type="date" id="wy-df" min="${dates[0] || ''}" max="${dates[dates.length - 1] || ''}" value="${WY.dFrom}" aria-label="From date"><span class="wy-muted">to</span><input type="date" id="wy-dt" min="${dates[0] || ''}" max="${dates[dates.length - 1] || ''}" value="${WY.dTo}" aria-label="To date"><span class="wy-muted">inside the chosen editions</span></div></div>
    <div class="wy-frow"><span>Game clock</span><div class="wy-chips">${WY_CLOCK.map(([k, l]) => chip('data-wyck', k, l, WY.clock === k)).join('')}</div></div>
    <div class="wy-frow"><span>Possessions</span><div class="wy-chips wy-gap"><button type="button" class="wy-sw" data-wysw="garbage" aria-pressed="${WY.garbage}"><i></i>Exclude garbage time</button><button type="button" class="wy-sw" data-wysw="common" aria-pressed="${WY.common}"><i></i>Common games only</button></div></div>
    <div class="wy-frow"><span>Opponents</span><div class="wy-stack"><div class="wy-chips">${[['all', 'All teams'], ['tier', 'By tier'], ['pick', 'Pick teams']].map(([k, l]) => chip('data-wyop', k, l, WY.opp === k)).join('')}</div>
      ${WY.opp === 'tier' ? `<div class="wy-chips">${[['top', 'Top third'], ['mid', 'Middle third'], ['bot', 'Bottom third']].map(([k, l]) => chip('data-wyti', k, l, WY.tier === k)).join('')}<span class="wy-muted">by each edition’s final standings</span></div>` : ''}
      ${WY.opp === 'pick' ? `<div class="wy-chips">${opps.map(t => chip('data-wyot', t, esc(wyTeamName(t)), WY.oppPick.has(t))).join('')}</div>` : ''}</div></div>
    <div class="wy-frow"><span>Player vs player</span><div class="wy-stack"><div class="wy-dates"><input type="search" id="wy-vsq" placeholder="Find an opponent…" value="${esc(WY.vsQ)}" aria-label="Find an opponent"><span class="wy-muted">Hold an opponent on or off the floor for every row</span></div>
      <div class="wy-plist">${OP.map(p => `<div class="wy-pl wy-pl2"><span><b>${esc(personName(p))}</b><small>${Math.round(m[p] / 60)} min against ${esc(wyTeamName(WY.team))}</small></span><span class="wy-tri"><button type="button" data-wyvs="${p}" data-st="on" aria-pressed="${WY.vs[p] === 'on'}">On</button><button type="button" data-wyvs="${p}" data-st="off" aria-pressed="${WY.vs[p] === 'off'}">Off</button></span></div>`).join('')}</div></div></div>
    <div class="wy-chips"><button type="button" class="wy-chip" data-wyclear="1">Clear all filters</button></div>`;
}
function wyLeadCtl() {
  const el = document.getElementById('wy-lead'); if (!el) return;
  el.innerHTML = WY.mode === 'wowy' ? '' : `<span class="wy-chips"><button type="button" class="wy-chip" data-wysc="team" aria-pressed="${WY.scope === 'team'}">This team</button><button type="button" class="wy-chip" data-wysc="all" aria-pressed="${WY.scope === 'all'}">All teams</button></span>
    <label class="wy-muted wy-range">Min. minutes <input type="range" id="wy-min" min="0" max="120" step="5" value="${WY.minMin}"> <output id="wy-mino">${WY.minMin}</output></label>`;
}
function wySlide(id, sel) {
  const el = document.getElementById(id); if (!el) return;
  const b = el.querySelector(sel), ind = el.querySelector('.wy-ind, .wy-line'); if (!b || !ind) return;
  ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px)`;
}
function wyIndicators() { wySlide('wy-ser', '[aria-pressed="true"]'); wySlide('wy-mode', '[aria-pressed="true"]'); const t = document.querySelector('.wy-tabs'); if (t) { const b = t.querySelector('[aria-selected="true"]'), l = t.querySelector('.wy-line'); if (b && l) { l.style.width = b.offsetWidth + 'px'; l.style.transform = `translateX(${b.offsetLeft}px)`; } } }

function wyTable() {
  const tbl = document.getElementById('wy-tbl'); if (!tbl) return;
  if (!wyReady()) {
    tbl.innerHTML = `<tbody><tr class="wy-lgrow"><td><div class="wy-empty">${wySel().some(c => CL.load[c.id] === 'error') ? 'The play-by-play for these games did not load. Reload the page to try again.' : 'Loading the play-by-play…'}</div></td></tr></tbody>`;
    return;
  }
  wyCompute();
  const L = WY.lg, k3 = (v, a) => v == null ? '' : `3P% ${wyF1(v)} <span class="wy-att">(${Math.round(a)})</span>`;
  const cols = { overview: ['MIN', 'OFF', 'DEF', 'NET'], offense: ['MIN', 'OFF', 'TS%', 'TOV%', 'ORB%'], defense: ['MIN', 'DEF', 'OPP TS%', 'OPP TOV%', 'OPP ORB%'],
    expanded: ['MIN', 'OFF', 'DEF', 'NET', 'OFF TS%', 'OFF TOV%', 'OFF ORB%', 'DEF TS%', 'DEF TOV%', 'DEF ORB%'] }[WY.view];
  const head = `<thead><tr><th scope="col">${WY.mode !== 'wowy' && WY.scope === 'all' ? 'LINEUP · TEAM' : 'LINEUP'}</th>${cols.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead>`;
  const body = WY.rows.map((r, i) => {
    const M = r.M, k = r.key;
    const off = wyV(k + 'o', M.off, L.rtg, true, k3(M.tp, M.tpa)), def = wyV(k + 'd', M.def, L.rtg, false, k3(M.otp, M.otpa)), net = wyNet(k + 'n', M.net);
    const f = { ts: wyV(k + 'ts', M.ts, L.ts, true), tov: wyV(k + 'tv', M.tov, L.tov, false), orb: wyV(k + 'or', M.orb, L.orb, true),
      ots: wyV(k + 'ots', M.ots, L.ts, false), otov: wyV(k + 'otv', M.otov, L.tov, true), oorb: wyV(k + 'oor', M.oorb, L.orb, false) };
    const cells = { overview: off + def + net, offense: off + f.ts + f.tov + f.orb, defense: def + f.ots + f.otov + f.oorb,
      expanded: off + def + net + f.ts + f.tov + f.orb + f.ots + f.otov + f.oorb }[WY.view];
    const team = WY.mode !== 'wowy' && WY.scope === 'all' ? `<small class="wy-team">${esc(wyTeamName(r.team))}</small>` : '';
    const rank = WY.mode !== 'wowy' ? `<span class="wy-rk">${i + 1}</span>` : '';
    return `<tr style="--i:${Math.min(i, 14)}" data-wyrow="${i}"><td><div class="wy-lu">${rank}<button type="button" class="wy-lub" data-wyopen="${i}" aria-label="Full breakdown of this combination">${wyAvs(r.on)}</button></div>${team}</td>
      <td class="wy-min"><b data-wk="${k}m" data-wv="${M.min}" data-wd0="1">${Math.round(M.min)}</b><small>${M.games} ${M.games === 1 ? 'game' : 'games'}</small></td>${cells}</tr>`;
  }).join('');
  const lgc = { overview: [L.rtg, L.rtg, 0], offense: [L.rtg, L.ts, L.tov, L.orb], defense: [L.rtg, L.ts, L.tov, L.orb], expanded: [L.rtg, L.rtg, 0, L.ts, L.tov, L.orb, L.ts, L.tov, L.orb] }[WY.view];
  const lg = `<tr class="wy-lgrow"><td>League average</td><td></td>${lgc.map(v => `<td>${wyF1(v)}</td>`).join('')}</tr>`;
  const none = WY.mode === 'wowy' && !WY.combo.length ? 'Pick at least one combo player under Players.' : 'No minutes match these filters. Loosen one of them.';
  tbl.innerHTML = head + (WY.rows.length ? `<tbody>${body}</tbody><tbody>${lg}</tbody>` : `<tbody><tr class="wy-lgrow"><td colspan="${cols.length + 1}"><div class="wy-empty">${none}</div></td></tr></tbody>`);
  wyTween();
}
// numbers move from their last value to the new one
function wyTween() {
  const next = {}, red = wyReduce();
  document.querySelectorAll('#wy-tbl [data-wk]').forEach(el => {
    const k = el.dataset.wk, to = el.dataset.wv === '' ? null : +el.dataset.wv; next[k] = to;
    const from = WY.prev[k];
    if (red || to == null || from == null || Math.abs(from - to) < 0.05) return;
    const t0 = performance.now(), d0 = !!el.dataset.wd0, sg = !!el.dataset.wsg;
    const fmt = v => d0 ? String(Math.round(v)) : sg ? wySg(v) : wyF1(v);
    const step = now => { const t = Math.min(1, (now - t0) / 520), e = 1 - Math.pow(1 - t, 3); el.textContent = fmt(from + (to - from) * e); if (t < 1) requestAnimationFrame(step); };
    el.textContent = fmt(from); requestAnimationFrame(step);
  });
  WY.prev = next;
}
function wyHeads() {
  const ready = wyReady(), cs = wyData(), yr = WY.from === WY.to ? WY.from : WY.from + '–' + WY.to;
  const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  set('wy-title', WY.mode === 'wowy' ? `${wyTeamName(WY.team)} · on/off combinations` : `${WY.mode}-man lineups · ${WY.scope === 'all' ? 'all teams' : wyTeamName(WY.team)}`);
  const ng = !ready ? 0 : WY.mode === 'wowy' || WY.scope === 'team' ? new Set(wyTeamGames(cs).filter(x => wyGameOk(x.c, x.g, x.home)).map(x => x.g.mid)).size : cs.reduce((a, c) => a + c.games.length, 0);
  set('wy-sub', `${WY_SER[WY.ser]} ${yr}${ready ? ' · ' + ng + ' games' : ''} · ${WY_CLOCK.find(c => c[0] === WY.clock)[1]}${WY.garbage ? ' · no garbage time' : ''}`);
  set('wy-lg', ready && WY.lg ? `League ${yr}: OFF ${wyF1(WY.lg.rtg)} · TS% ${wyF1(WY.lg.ts)} · 3P% ${wyF1(WY.lg.tp * 100)} · ${wyF1(WY.lg.ppm * 40)} possessions per 40 minutes` : '');
  set('wy-note', WY.mode === 'wowy' ? 'Open a combination for its full breakdown.' : `Top 25 by NET, at least ${WY.minMin} minutes together.`);
  const nc = document.getElementById('wy-nc'); if (nc) nc.textContent = WY.combo.length;
  const nf = document.getElementById('wy-nf'), n = wyNFilters(); if (nf) { nf.hidden = !n; nf.textContent = n; }
}
// the whole tool, after a change of competition, years or team
function wyPaint() {
  const root = document.getElementById('wy-root'); if (!root) return;
  if (!root.dataset.built) { root.innerHTML = wyShell(); root.dataset.built = '1'; wyLeadCtl(); }
  const f = document.getElementById('wy-from'), t = document.getElementById('wy-to');
  if (f) { f.value = WY.from; t.value = WY.to; }
  wySel().forEach(c => wyLoad(c.id));
  if (wyReady()) {
    const prev = WY.team; wyFillTeams();
    // a new team gets its two busiest players; a shared link keeps the players it names
    if (!WY.booted || prev !== WY.team) { if (!WY.urlCombo || prev !== WY.team) wyDefaultCombo(); WY.urlCombo = false; WY.booted = true; }
    wyFillPlayers(); wyFillFilters();
  }
  wyRefresh();
  requestAnimationFrame(wyIndicators);
}
// the table and the headings only
function wyRefresh() { wyTable(); wyHeads(); wyToUrl(); }

/* ---- the address ---- */
function wyFromUrl() {
  const q = new URLSearchParams(location.search), ys = s => wyYears(s);
  const ser = q.get('s'); if (ser && WY_SER[ser] && ys(ser).length) WY.ser = ser;
  const Y = ys(WY.ser); if (!Y.length) return;
  if (!location.search) { if (!Y.includes(WY.from)) WY.from = WY.to = Y[Y.length - 1]; return; }
  const f = +q.get('f'), t = +q.get('t');
  WY.from = Y.includes(f) ? f : (WY.from && Y.includes(WY.from) ? WY.from : Y[Y.length - 1]);
  WY.to = Y.includes(t) && t >= WY.from ? t : (WY.to && Y.includes(WY.to) && WY.to >= WY.from ? WY.to : WY.from);
  if (q.get('team')) WY.team = q.get('team');
  if (q.get('p')) { WY.combo = q.get('p').split(',').filter(Boolean).slice(0, 5); WY.urlCombo = true; WY.booted = false; }
  WY.hold = {};
  (q.get('on') || '').split(',').filter(Boolean).forEach(p => { WY.hold[p] = 'on'; });
  (q.get('off') || '').split(',').filter(Boolean).forEach(p => { WY.hold[p] = 'off'; });
  const m = q.get('m'); if (m && WY_MODES.some(x => x[0] === m)) WY.mode = m;
  const v = q.get('v'); if (v && WY_VIEWS.some(x => x[0] === v)) WY.view = v;
  const ck = q.get('clock'); if (ck && WY_CLOCK.some(x => x[0] === ck)) WY.clock = ck;
  if (q.get('gt') === '0') WY.garbage = true;
}
function wyToUrl() {
  if (!document.getElementById('wy-root')) return;
  const q = new URLSearchParams();
  q.set('s', WY.ser); q.set('f', WY.from); q.set('t', WY.to);
  if (WY.team) q.set('team', WY.team);
  if (WY.mode === 'wowy' && WY.combo.length) q.set('p', WY.combo.join(','));
  const on = Object.keys(WY.hold).filter(p => WY.hold[p] === 'on'), off = Object.keys(WY.hold).filter(p => WY.hold[p] === 'off');
  if (on.length) q.set('on', on.join(','));
  if (off.length) q.set('off', off.join(','));
  if (WY.mode !== 'wowy') q.set('m', WY.mode);
  if (WY.view !== 'overview') q.set('v', WY.view);
  if (WY.clock !== 'full') q.set('clock', WY.clock);
  if (WY.garbage) q.set('gt', '0');
  const want = location.pathname + '?' + q.toString() + location.hash;
  if (want !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', want);
}

/* ---- one combination, in full ---- */
function wyDetail(r) {
  const M = r.M, L = WY.lg, A = r.A, yr = WY.from === WY.to ? WY.from : WY.from + '–' + WY.to;
  const kp = (lab, txt, d, hi) => `<div><span>${lab}</span><b>${txt}</b>${d == null ? '<em>&nbsp;</em>' : `<em class="${wyCls(d, hi)}">${wySg(d)}</em>`}</div>`;
  const g = (lab, v, lg, hi) => `<div><span>${lab}</span><b>${wyF1(v)}</b><em class="${wyCls(v == null ? null : v - lg, hi)}">${v == null ? '—' : wySg(v - lg)}</em></div>`;
  const inRow = new Set(r.on.filter(x => x[1]).map(x => x[0]));
  const mates = Object.entries(A.mates).map(([p, s]) => [p, s / A.sec]).filter(([p]) => !inRow.has(p) && !(WY.mode === 'wowy' && WY.combo.includes(p))).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const pc = (v, lg) => v == null ? '—' : wyF1(v) + '%';
  let dlg = document.getElementById('wy-dlg');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'wy-dlg'; dlg.className = 'wy-dlg'; dlg.setAttribute('aria-labelledby', 'wy-dtitle'); document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-wyclose]') || e.target.closest('a[href]')) dlg.close(); }); }
  dlg.innerHTML = `<div class="wy-sheet">
    <div class="wy-sh"><div class="wy-shtop"><span id="wy-dtitle">${esc(wyTeamName(WY.mode === 'wowy' ? WY.team : r.team))} · ${WY.mode === 'wowy' ? 'combination' : WY.mode + '-man lineup'} · ${WY_SER[WY.ser]} ${yr}</span><button type="button" data-wyclose="1" aria-label="Close">✕</button></div>
      <div class="wy-lu">${wyAvs(r.on)}</div>
      <div class="wy-kpis">${kp('MIN', Math.round(M.min))}${kp('NET', wySg(M.net))}${kp('OFF', wyF1(M.off), M.off - L.rtg, true)}${kp('DEF', wyF1(M.def), M.def - L.rtg, false)}${kp('O-3P%', pc(M.tp), M.tp == null ? null : M.tp - L.tp * 100, true)}${kp('D-3P%', pc(M.otp), M.otp == null ? null : M.otp - L.tp * 100, false)}</div></div>
    <div class="wy-shb">
      <div class="wy-ff"><div><h3>OFFENSIVE</h3><div class="wy-g">${g('TS%', M.ts, L.ts, true)}${g('TOV%', M.tov, L.tov, false)}${g('ORB%', M.orb, L.orb, true)}</div></div>
        <div><h3>DEFENSIVE</h3><div class="wy-g">${g('D-TS%', M.ots, L.ts, false)}${g('D-TOV%', M.otov, L.tov, true)}${g('D-ORB%', M.oorb, L.orb, false)}</div></div></div>
      <p class="wy-muted">${M.games} ${M.games === 1 ? 'game' : 'games'} · ${Math.round(M.po)} possessions on offence, ${Math.round(M.pd)} on defence · scoreboard ${M.pm > 0 ? '+' : M.pm < 0 ? '−' : ''}${Math.abs(Math.round(M.pm))} (${Math.round(A.pts)}–${Math.round(A.opp)})</p>
      ${mates.length ? `<div class="wy-share"><h3>WHO ELSE WAS ON THE FLOOR</h3>${mates.map(([p, f]) => `<div class="wy-r"><a href="#/p/${esc(p)}">${esc(personName(p))}</a><span><i data-w="${(f * 100).toFixed(1)}"></i></span><b>${Math.round(f * 100)}%</b></div>`).join('')}</div>` : ''}
    </div></div>`;
  dlg.showModal();
  requestAnimationFrame(() => requestAnimationFrame(() => dlg.querySelectorAll('.wy-share i').forEach(i => { i.style.width = i.dataset.w + '%'; })));
}

/* ---- events ---- */
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('#wy-root button'); if (!t) return;
  const d = t.dataset;
  if (d.wyser) { if (d.wyser === WY.ser) return; WY.ser = d.wyser; const Y = wyYears(WY.ser); WY.from = WY.to = Y[Y.length - 1]; WY.team = ''; WY.booted = false; WY.phase = 'all'; WY.dFrom = WY.dTo = ''; WY.vs = {}; WY.oppPick = new Set();
    document.querySelectorAll('#wy-ser button').forEach(b => b.setAttribute('aria-pressed', String(b === t)));
    const yo = Y.map(y => `<option value="${y}">${y}</option>`).join(''); document.getElementById('wy-from').innerHTML = yo; document.getElementById('wy-to').innerHTML = yo; wyPaint(); return; }
  if (d.wymode) { WY.mode = d.wymode; document.querySelectorAll('#wy-mode button').forEach(b => b.setAttribute('aria-pressed', String(b === t)));
    const bp = document.getElementById('wy-bp'); bp.hidden = WY.mode !== 'wowy'; if (WY.mode !== 'wowy') { WY.openP = false; bp.setAttribute('aria-expanded', 'false'); document.getElementById('wy-fp').classList.remove('open'); }
    wyLeadCtl(); wyRefresh(); requestAnimationFrame(wyIndicators); return; }
  if (t.id === 'wy-bp' || t.id === 'wy-bf') { const k = t.id === 'wy-bp' ? 'openP' : 'openF'; WY[k] = !WY[k]; t.setAttribute('aria-expanded', WY[k]); document.getElementById(t.id === 'wy-bp' ? 'wy-fp' : 'wy-ff').classList.toggle('open', WY[k]); return; }
  if (d.wyview) { WY.view = d.wyview; document.querySelectorAll('.wy-tabs [data-wyview]').forEach(b => b.setAttribute('aria-selected', String(b === t))); wyIndicators(); wyRefresh(); return; }
  if (d.wyp) { const p = d.wyp, st = d.st, was = WY.combo.includes(p) ? 'combo' : WY.hold[p] || '';
    WY.combo = WY.combo.filter(x => x !== p); delete WY.hold[p];
    if (was !== st) { if (st === 'combo') WY.combo.push(p); else WY.hold[p] = st; }
    wyFillPlayers(); wyRefresh(); return; }
  if (d.wysc) { WY.scope = d.wysc; wyLeadCtl(); wyRefresh(); return; }
  if (d.wyopen != null) { const r = WY.rows[+d.wyopen]; if (r) wyDetail(r); return; }
  let f = true;
  if (d.wyph) WY.phase = d.wyph;
  else if (d.wyck) WY.clock = d.wyck;
  else if (d.wyop) WY.opp = d.wyop;
  else if (d.wyti) WY.tier = d.wyti;
  else if (d.wyot) { WY.oppPick.has(d.wyot) ? WY.oppPick.delete(d.wyot) : WY.oppPick.add(d.wyot); }
  else if (d.wyvs) { WY.vs[d.wyvs] === d.st ? delete WY.vs[d.wyvs] : (WY.vs[d.wyvs] = d.st); }
  else if (d.wysw) WY[d.wysw] = !WY[d.wysw];
  else if (d.wyclear) { Object.assign(WY, { phase: 'all', dFrom: '', dTo: '', clock: 'full', garbage: false, common: false, opp: 'all', vs: {}, vsQ: '' }); WY.oppPick = new Set(); }
  else f = false;
  if (f) { wyFillFilters(); wyRefresh(); }
});
// a click anywhere on a row opens it, like the button inside it
document.addEventListener('click', e => {
  const tr = e.target.closest && e.target.closest('#wy-tbl tr[data-wyrow]');
  if (!tr || e.target.closest('button, a')) return;
  const r = WY.rows[+tr.dataset.wyrow]; if (r) wyDetail(r);
});
document.addEventListener('change', e => {
  const id = e.target.id; if (!id || !/^wy-/.test(id)) return;
  if (id === 'wy-from' || id === 'wy-to') {
    const v = +e.target.value;
    if (id === 'wy-from') { WY.from = v; if (WY.to < v) WY.to = v; } else { WY.to = v; if (WY.from > v) WY.from = v; }
    WY.dFrom = WY.dTo = ''; wyPaint(); return;
  }
  if (id === 'wy-team') { WY.team = e.target.value; WY.vs = {}; WY.oppPick = new Set(); wyDefaultCombo(); wyFillPlayers(); wyFillFilters(); wyRefresh(); return; }
  if (id === 'wy-df') WY.dFrom = e.target.value; else if (id === 'wy-dt') WY.dTo = e.target.value; else return;
  wyRefresh();
});
let WY_T = 0;
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'wy-min') { WY.minMin = +e.target.value; const o = document.getElementById('wy-mino'); if (o) o.textContent = WY.minMin; clearTimeout(WY_T); WY_T = setTimeout(wyRefresh, 80); }
  if (id === 'wy-vsq') { WY.vsQ = e.target.value; clearTimeout(WY_T); WY_T = setTimeout(() => { wyFillFilters(); const i = document.getElementById('wy-vsq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); }
});
addEventListener('resize', () => { if (document.getElementById('wy-root')) wyIndicators(); });

// run by afterRender (app5_rest.js) whenever #/wowy is drawn
function wyAfterRender() {
  const root = document.getElementById('wy-root'); if (!root || root.dataset.built) return;
  if (!wyComps().length) { root.innerHTML = '<div class="wy-empty">No competition has lineup data yet.</div>'; return; }
  wyFromUrl();
  wyPaint();
}
