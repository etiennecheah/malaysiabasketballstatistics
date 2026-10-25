/* =========================================================================
   Compare › Lineups — two teams' lineups against each other, inside one
   competition (approved from the prototype, update-53).

   Only DB.stats.lv.comps are offered: the three MBL seasons and the 2026 Agong
   Cup. Each one's games live in stats/lv/<cid>.js (build_stats.py), every
   rebuilt stint with both fives, the points and both sides' box counters,
   pulled in when the competition is chosen. The page adds them up for the
   chosen pair of teams, games and group size (a 4-, 3- or 2-man group is the
   sum of every five that contains it, as on Stats › Lineups).

   Route: #/compare/lineups[/<cid>]. Everything else is page state (CL), and a
   change repaints #cl-root only, so the reader keeps their place.
   ========================================================================= */
const CL = { cid: null, pair: null, swap: false, game: 'all', size: 5, min: 60, open: null, tab: 'A',
  sort: { A: ['sec', -1], B: ['sec', -1] }, all: { A: false, B: false }, data: {}, load: {} };
const CL_BX = ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'tov', 'stl', 'blk', 'pf', 'pfd', 'toreb', 'tdreb', 'ttov'];
const CLI = Object.fromEntries(CL_BX.map((k, i) => [k, i]));
const clComps = () => ((DB.stats || {}).lv || {}).comps || [];
function CMPL_PUT(cid, d) { CL.data[cid] = d; }

function clLoad(cid) {
  if (CL.data[cid]) return 'done';
  if (CL.load[cid]) return CL.load[cid];
  CL.load[cid] = 'loading';
  const s = document.createElement('script');
  s.src = HS.BASE + 'stats/lv/' + cid + '.js';
  s.onload = () => { CL.load[cid] = CL.data[cid] ? 'done' : 'error'; clPaint(); };
  s.onerror = () => { CL.load[cid] = 'error'; clPaint(); };
  document.head.appendChild(s);
  return 'loading';
}

/* ---- the numbers ---- */
const clMin = s => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m + ':' + String(r).padStart(2, '0'); };
const clSg = v => sgn(v, v);
const clF1 = v => v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1);
const clPoss = c => c[CLI.fga] + 0.44 * c[CLI.fta] - c[CLI.oreb] - c[CLI.toreb] + c[CLI.tov] + c[CLI.ttov];
const clPmC = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';

// the pairs of teams that met in this competition: most meetings first, then the latest
function clPairs(d) {
  const P = {};
  d.games.forEach(g => { const k = [g.h, g.a].sort().join('|'); (P[k] = P[k] || []).push(g); });
  return Object.entries(P).map(([k, gs]) => ({ k, teams: k.split('|'), games: gs }))
    .sort((a, b) => b.games.length - a.games.length || (b.games[b.games.length - 1].date || '').localeCompare(a.games[a.games.length - 1].date || ''));
}

function clCrunch(d) {
  const pairs = clPairs(d), pair = pairs.find(p => p.k === CL.pair) || pairs[0];
  CL.pair = pair.k;
  // the side that won more of these games is shown first, unless the reader swapped them
  const wins = t => pair.games.filter(g => (g.h === t ? g.hs > g.as : g.as > g.hs)).length;
  let [A, B] = wins(pair.teams[1]) > wins(pair.teams[0]) ? [pair.teams[1], pair.teams[0]] : pair.teams;
  if (CL.swap) [A, B] = [B, A];
  if (CL.game !== 'all' && !pair.games.some(g => g.mid === CL.game)) CL.game = 'all';
  const gs = pair.games.filter(g => CL.game === 'all' || g.mid === CL.game);
  const side = { A: {}, B: {} }, starters = { A: [], B: [] }, tot = { A: { pts: 0, sec: 0 }, B: { pts: 0, sec: 0 } };
  const pid = i => d.players[i][0];
  const combos = (arr, k) => { const out = []; const rec = (i, cur) => { if (cur.length === k) { out.push(cur.slice()); return; } for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); } }; rec(0, []); return out; };
  gs.forEach(g => {
    const hA = g.h === A;
    g.st.forEach((s, si) => {
      const [, sec, h5, a5, pts, bx] = s;
      const fA = (hA ? h5 : a5).map(pid).sort(), fB = (hA ? a5 : h5).map(pid).sort();
      const pA = hA ? pts[0] : pts[1], pB = hA ? pts[1] : pts[0], bA = hA ? bx[0] : bx[1], bB = hA ? bx[1] : bx[0];
      if (si === 0) { starters.A.push(fA.join(',')); starters.B.push(fB.join(',')); }
      tot.A.pts += pA; tot.B.pts += pB; tot.A.sec += sec;
      [['A', fA, pA, pB, bA, bB, fB], ['B', fB, pB, pA, bB, bA, fA]].forEach(([sd, five, own, opp, ob, xb, other]) => {
        (CL.size === 5 ? [five] : combos(five, CL.size)).forEach(grp => {
          const k = grp.join(','), r = side[sd][k] || (side[sd][k] = { k, ids: grp, sec: 0, pts: 0, opp: 0, ob: Array(17).fill(0), xb: Array(17).fill(0), games: new Set(), vs: {} });
          r.sec += sec; r.pts += own; r.opp += opp; r.games.add(g.mid);
          for (let i = 0; i < 17; i++) { r.ob[i] += ob[i] || 0; r.xb[i] += xb[i] || 0; }
          if (CL.size === 5) { const v = r.vs[other.join(',')] || (r.vs[other.join(',')] = { sec: 0, pts: 0, opp: 0 }); v.sec += sec; v.pts += own; v.opp += opp; }
        });
      });
    });
  });
  const fin = o => Object.values(o).filter(r => r.sec > 0 || r.pts || r.opp).map(r => {
    const poss = (clPoss(r.ob) + clPoss(r.xb)) / 2;
    return Object.assign(r, { pm: r.pts - r.opp, poss, ortg: poss > 0 ? r.pts / poss * 100 : null, drtg: poss > 0 ? r.opp / poss * 100 : null,
      net: poss > 0 ? (r.pts - r.opp) / poss * 100 : null, g: r.games.size });
  });
  return { A, B, pairs, pair, gs, L: { A: fin(side.A), B: fin(side.B) }, starters, tot, d };
}

/* ---- the pieces ---- */
function clPlayer(X, id) {
  const p = X.d.players.find(x => x[0] === id) || [id, id, ''];
  return { id, name: PERSONS[id] || p[1], num: p[2] };
}
const clLast = n => { const x = String(n).split(',')[0].trim().split(/\s+/); return x.length > 1 ? x[x.length - 1] : x[0]; };
function clFace(X, id) {
  const p = clPlayer(X, id), av = (DB.avatars || {})[id];
  return `<span class="cl-face" title="${esc(p.name)}${p.num ? ' · #' + esc(p.num) : ''}">${av ? `<img src="${av}" alt="">` : esc(p.num || initials(p.name))}</span>`;
}
const clFaces = (X, ids) => `<span class="cl-faces">${ids.map(id => clFace(X, id)).join('')}</span>`;
const clNames = (X, ids) => ids.map(id => `<b>${esc(clLast(clPlayer(X, id).name))}</b>`).join(' · ');
function clGameName(X, g) {
  const c = COMP_BY_ID[CL.cid], ph = typeof phaseLabel === 'function' ? phaseLabel(c, g.mid) : '';
  if (ph) return ph;
  // a competition decided by a final (the Agong Cup): its last game is that final
  const last = c && c.champHow === 'final' && c.games.filter(x => x.st === 'COMPLETE').sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || '')).pop();
  if (last && last.mid === g.mid) return 'Final';
  return 'Game ' + (X.pair.games.indexOf(g) + 1);
}
const clDay = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return d + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]; };

function clBoard(X) {
  const sc = (g, t) => g.h === t ? g.hs : g.as;
  const wa = X.pair.games.filter(g => sc(g, X.A) > sc(g, X.B)).length, n = X.pair.games.length;
  const all = X.pair.games.reduce((t, g) => [t[0] + sc(g, X.A), t[1] + sc(g, X.B)], [0, 0]);
  const sA = X.tot.A.pts, sB = X.tot.B.pts;
  return `<div class="card cl-sb">
    <div class="cl-sb-top">
      <div class="cl-side">${crest(X.A, 60)}<div><b>${esc(X.A)}</b><span>${wa}–${n - wa}</span></div></div>
      <div class="cl-agg"><div class="n"><span class="${sA >= sB ? 'w' : 'l'}">${sA}</span><i>–</i><span class="${sB >= sA ? 'w' : 'l'}">${sB}</span></div>
        <small>${CL.game === 'all' ? (n > 1 ? 'all ' + n + ' games' : 'the game') : esc(clGameName(X, X.gs[0]))}</small>
        <button class="cl-swap" data-clswap title="Swap the two sides" aria-label="Swap the two sides">⇄</button></div>
      <div class="cl-side r">${crest(X.B, 60)}<div><b>${esc(X.B)}</b><span>${n - wa}–${wa}</span></div></div>
    </div>
    <div class="cl-gtabs" role="group" aria-label="Games">
      ${n > 1 ? `<button class="cl-gtab" data-clgame="all" aria-pressed="${CL.game === 'all'}"><span class="k">All ${n} games</span><span class="v">${all[0]}–${all[1]}</span></button>` : ''}
      ${X.pair.games.map(g => `<button class="cl-gtab" data-clgame="${esc(g.mid)}" aria-pressed="${CL.game === g.mid || n === 1}"><span class="k">${esc(clGameName(X, g))} · ${clDay(g.date)}</span><span class="v">${sc(g, X.A)}–${sc(g, X.B)}</span></button>`).join('')}
    </div></div>`;
}

function clTape(X) {
  const rows = s => X.L[s], most = s => rows(s).reduce((m, r) => Math.max(m, r.sec), 0);
  const best = s => { const r = rows(s).filter(r => r.sec >= 180).sort((p, q) => q.pm - p.pm)[0]; return r ? r.pm : null; };
  const poss = s => rows(s).reduce((t, r) => t + r.poss, 0);
  const ortg = s => { const p = poss(s); return p ? X.tot[s].pts / p * 100 : null; };
  const stPm = s => [...new Set(X.starters[s])].reduce((t, k) => { const r = rows(s).find(x => x.k === k); return t + (r ? r.pm : 0); }, 0);
  const L = [
    ['Lineups used', CL.size === 5 ? 'different fives' : 'different ' + CL.size + '-man groups', rows('A').length, rows('B').length, v => v, false],
    ['Most-used lineup', 'minutes together', most('A'), most('B'), clMin, true],
    ['Best lineup +/-', '3+ minutes together', best('A'), best('B'), v => v == null ? '—' : clSg(v), true],
    CL.size === 5 ? ['Starting five +/-', 'all its minutes', stPm('A'), stPm('B'), clSg, true] : null,
    CL.size === 5 ? ['Offensive rating', 'points per 100 poss.', ortg('A'), ortg('B'), clF1, true] : null,
  ].filter(Boolean);
  return `<div class="card cl-tape">${L.map(([k, sub, a, b, fmt, hi]) => {
    const an = a == null ? 0 : a, bn = b == null ? 0 : b, lo = Math.min(an, bn, 0), span = Math.max(an - lo, bn - lo, 1);
    return `<div class="cl-tr"><span class="va ${hi && a != null && an > bn ? 'win' : ''}">${fmt(a)}</span>
      <span class="ba"><u class="${hi && !(an > bn) ? 'dim' : ''}" style="width:${(an - lo) / span * 100}%"></u></span>
      <span class="lb">${k}<small>${sub}</small></span>
      <span class="bb"><u class="${hi && !(bn > an) ? 'dim' : ''}" style="width:${(bn - lo) / span * 100}%"></u></span>
      <span class="vb ${hi && b != null && bn > an ? 'win' : ''}">${fmt(b)}</span></div>`;
  }).join('')}</div>`;
}

function clStarts(X) {
  const card = s => {
    // one block per different five, naming the games it started
    const ks = X.starters[s], uniq = [...new Set(ks)];
    const groups = uniq.map(k => { const gi = ks.map((x, i) => x === k ? i : -1).filter(i => i >= 0);
      return [k, gi.length === ks.length && ks.length > 1 ? 'All ' + ks.length + ' games'
        : gi.length === 1 ? clGameName(X, X.gs[gi[0]]) + ' · ' + clDay(X.gs[gi[0]].date)
        : 'Started ' + gi.length + ' games: ' + gi.map(i => clDay(X.gs[i].date)).join(', ')]; })
      .sort((a, b) => ks.filter(x => x === b[0]).length - ks.filter(x => x === a[0]).length);
    return `<div class="card cl-stc cl-${s}"><div class="cl-stc-h">${crest(X[s], 22)}${esc(X[s])}</div>
      ${groups.map(([k, label]) => { const r = CL.size === 5 ? X.L[s].find(x => x.k === k) : null;
        return `<div class="cl-stg"><div class="cl-stg-k"><span>${esc(label)}</span>${r ? `<span><b>${clMin(r.sec)}</b> together · <b class="${clPmC(r.pm)}">${clSg(r.pm)}</b></span>` : ''}</div>
          <div class="cl-people">${k.split(',').map(id => { const p = clPlayer(X, id);
            return `<a class="cl-pp" href="${/^\d+$/.test(id) ? '#/p/' + id : '#/compare/lineups'}">${clFace(X, id)}<b>${esc(clLast(p.name))}</b><span>${p.num ? '#' + esc(p.num) : ''}</span></a>`; }).join('')}</div></div>`; }).join('')}
    </div>`;
  };
  return `<div class="cl-starts">${card('A')}${card('B')}</div>`;
}

function clDetail(s, r, X) {
  const o = r.ob, x = r.xb, opp = s === 'A' ? 'B' : 'A';
  const reb = b => b[CLI.oreb] + b[CLI.dreb] + b[CLI.toreb] + b[CLI.tdreb], tov = b => b[CLI.tov] + b[CLI.ttov];
  const M = [
    ['Points', r.pts, r.opp, v => v],
    ['Off. rating', r.ortg, r.drtg, clF1],
    ['FG%', o[CLI.fga] ? o[CLI.fgm] / o[CLI.fga] : null, x[CLI.fga] ? x[CLI.fgm] / x[CLI.fga] : null, v => v == null ? '—' : Math.round(v * 100) + '%',
      [o[CLI.fgm] + '/' + o[CLI.fga], x[CLI.fgm] + '/' + x[CLI.fga]]],
    ['3PT made', o[CLI.tpm], x[CLI.tpm], v => v, [o[CLI.tpm] + '/' + o[CLI.tpa], x[CLI.tpm] + '/' + x[CLI.tpa]]],
    ['FT made', o[CLI.ftm], x[CLI.ftm], v => v, [o[CLI.ftm] + '/' + o[CLI.fta], x[CLI.ftm] + '/' + x[CLI.fta]]],
    ['Rebounds', reb(o), reb(x), v => v],
    ['Assists', o[CLI.ast], x[CLI.ast], v => v],
    ['Turnovers', tov(o), tov(x), v => v],
  ];
  const vs = CL.size === 5 ? Object.entries(r.vs).filter(([, v]) => v.sec > 0).sort((p, q) => q[1].sec - p[1].sec) : [];
  return `<div class="cl-det">
    <div class="cl-dh"><span>This ${CL.size === 5 ? 'five' : 'group'} · ${clF1(r.poss)} poss.</span><span>${esc(X[opp])}</span></div>
    <div class="cl-dl">${M.map(([k, a, b, fmt, raw]) => { const mx = Math.max(Math.abs(a || 0), Math.abs(b || 0), 1e-9);
      return `<div class="cl-dr"${raw ? ` data-imtip="${esc(k + ': ' + raw[0] + ' vs ' + raw[1])}"` : ''}><span class="o">${fmt(a)}</span><i class="l"><u style="width:${Math.max(0, a || 0) / mx * 100}%"></u></i><span class="k">${k}</span><i class="r"><u style="width:${Math.max(0, b || 0) / mx * 100}%"></u></i><span class="x">${fmt(b)}</span></div>`; }).join('')}</div>
    <div class="cl-plinks">${r.ids.map(id => /^\d+$/.test(id) ? `<a href="#/p/${id}">${esc(clPlayer(X, id).name)}</a>` : `<span>${esc(clPlayer(X, id).name)}</span>`).join('')}</div>
    ${vs.length ? `<div class="cl-dh" style="margin-top:14px"><span>Against these ${esc(X[opp])} fives</span><span>min · score</span></div>
      <div class="cl-faced cl-${opp}">${vs.map(([k, v]) => `<div class="cl-fr"><span class="cl-frw">${clFaces(X, k.split(','))}<span class="nm">${clNames(X, k.split(','))}</span></span><span>${clMin(v.sec)}</span><span class="${clPmC(v.pts - v.opp)}">${v.pts}–${v.opp}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

function clTable(s, X) {
  const rows0 = X.L[s].filter(r => r.sec >= CL.min), [key, dir] = CL.sort[s];
  const val = (r, k) => k === 'pm' ? r.pm : k === 'net' ? (r.sec >= 120 ? r.net : -1e9) : k === 'pts' ? r.pts - r.opp : r.sec;
  rows0.sort((p, q) => (val(q, key) - val(p, key)) * -dir || q.sec - p.sec);
  const rows = CL.all[s] ? rows0 : rows0.slice(0, 10), st = new Set(X.starters[s]);
  const h = (k, l, cls) => `<button data-clsort="${s}:${k}" class="${cls || ''}"${key === k ? ` aria-sort="${dir < 0 ? 'descending' : 'ascending'}"` : ''}>${l}</button>`;
  const what = CL.size === 5 ? 'lineup' : CL.size + '-man group';
  return `<div class="card cl-lt cl-${s}">
    <div class="cl-lt-h">${crest(X[s], 24)}<b>${esc(X[s])}</b><span>${rows0.length}${rows0.length !== X.L[s].length ? ' of ' + X.L[s].length : ''} ${what}s</span></div>
    <div class="cl-rows-h"><button>${CL.size === 5 ? 'Lineup' : 'Group'}</button>${h('sec', 'Min')}${h('pts', 'Score')}${h('pm', '+/-')}${h('net', 'Net', 'cl-c-net')}</div>
    ${rows.length ? rows.map(r => { const open = CL.open && CL.open.s === s && CL.open.k === r.k;
      return `<div class="cl-item${open ? ' open' : ''}"><button class="cl-row" data-clopen="${s}|${esc(r.k)}" aria-expanded="${open}">
        <span class="cl-who">${clFaces(X, r.ids)}<span class="cl-names">${clNames(X, r.ids)}${CL.size === 5 && st.has(r.k) ? '<span class="cl-tag">START</span>' : ''}${X.gs.length > 1 && r.g > 1 ? `<span class="cl-tag g">${r.g} GAMES</span>` : ''}</span></span>
        <span>${clMin(r.sec)}</span><span class="cl-sc">${r.pts}–${r.opp}</span><span class="cl-pm ${clPmC(r.pm)}">${clSg(r.pm)}</span>
        <span class="cl-net" title="${r.sec >= 120 ? 'Per 100 possessions' : 'Under 2 minutes together'}">${r.sec >= 120 ? clF1(r.net) : '—'}<i class="cl-chev"></i></span></button>
        ${open ? clDetail(s, r, X) : ''}</div>`; }).join('') : `<div class="cl-empty">No ${what} played ${clMin(CL.min)} or more together here.</div>`}
    ${rows0.length > 10 ? `<button class="cl-more" data-clall="${s}">${CL.all[s] ? 'Show the top 10' : 'Show all ' + rows0.length}</button>` : ''}
  </div>`;
}

function clInner() {
  const comps = clComps();
  if (!comps.length) return `<div class="card cl-msg">Lineup comparisons are not available in this build.</div>`;
  if (!CL.cid || !comps.some(c => c.id === CL.cid)) CL.cid = comps[0].id;
  const st = clLoad(CL.cid), d = CL.data[CL.cid];
  const bar = X => `<div class="cl-bar">
      <label class="cl-sel"><span>Competition</span><select data-clcomp>${comps.map(c => `<option value="${esc(c.id)}"${c.id === CL.cid ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
      ${X ? `<label class="cl-sel"><span>Matchup</span><select data-clpair>${X.pairs.map(p => `<option value="${esc(p.k)}"${p.k === CL.pair ? ' selected' : ''}>${esc(p.teams.join(' vs '))} · ${p.games.length} game${p.games.length > 1 ? 's' : ''}</option>`).join('')}</select></label>` : ''}
      <span class="cl-gap"></span>
      <div class="cl-seg" role="group" aria-label="Group size"><span>Group</span>${[5, 4, 3, 2].map(n => `<button data-clsize="${n}" aria-pressed="${CL.size === n}">${n}</button>`).join('')}</div>
      <div class="cl-seg" role="group" aria-label="Minutes together"><span>Min</span>${[[0, 'All'], [60, '1+'], [180, '3+']].map(([v, l]) => `<button data-clmin="${v}" aria-pressed="${CL.min === v}">${l}</button>`).join('')}</div>
    </div>`;
  if (!d) return bar(null) + `<div class="card cl-msg">${st === 'error' ? 'The lineup numbers for this competition could not be loaded. Check the connection and choose it again.' : 'Loading this competition…'}</div>`;
  if (!d.games.length) return bar(null) + `<div class="card cl-msg">No game of this competition could be rebuilt lineup by lineup.</div>`;
  const X = clCrunch(d), info = comps.find(c => c.id === CL.cid);
  const what = CL.size === 5 ? 'Lineups' : CL.size + '-man groups';
  return bar(X) + clBoard(X)
    + `<div class="cl-sh"><h2>Tale of the tape</h2><span class="sub">${what.toLowerCase()} in ${X.gs.length > 1 ? 'these ' + X.gs.length + ' games' : 'this game'} only</span></div>${clTape(X)}`
    + `<div class="cl-sh"><h2>Starting fives</h2></div>${clStarts(X)}`
    + `<div class="cl-sh"><h2>${what}</h2><span class="sub">tap a row for its numbers against the other side</span>
        <div class="cl-seg cl-tteam" role="group" aria-label="Team"><button data-cltab="A" aria-pressed="${CL.tab === 'A'}">${esc(X.A)}</button><button data-cltab="B" aria-pressed="${CL.tab === 'B'}">${esc(X.B)}</button></div></div>
      <div class="cl-tables" data-tab="${CL.tab}">${clTable('A', X)}${clTable('B', X)}</div>`
    + `<details class="cl-glos"><summary>How it is counted</summary><p>The five on court is rebuilt from the play-by-play substitutions, the same rebuild as Stats › Lineups. Only games of this competition between these two teams count, so every number is against this one opponent${info && info.games < info.played ? ` (${info.games} of the competition's ${info.played} played games could be rebuilt)` : ''}. <b>+/-</b> = points scored minus allowed while the group was on court. <b>Net</b> = +/- per 100 possessions, shown from 2 minutes together. Possessions = FGA + 0.44 × FTA − offensive rebounds + turnovers, team rebounds and turnovers included, averaged over both sides. A 4-, 3- or 2-man group adds up every five that contains it.</p></details>`;
}

function clPaint() {
  const el = document.getElementById('cl-root'); if (!el) return;
  const y = window.scrollY; el.innerHTML = clInner(); window.scrollTo(0, y);
}
// the mode switch on both Compare pages
const cmpModes = on => `<div class="cl-mode" role="group" aria-label="Compare"><a href="#/compare"${on === 'players' ? ' aria-current="page"' : ''}>Players</a><a href="#/compare/lineups"${on === 'lineups' ? ' aria-current="page"' : ''}>Lineups</a></div>`;
function renderCmpLineups(cid) {
  if (cid && clComps().some(c => c.id === cid) && cid !== CL.cid) { CL.cid = cid; CL.pair = null; CL.game = 'all'; CL.open = null; CL.swap = false; }
  return `<div class="page cl-page">
    <div class="page-head"><div><h1 class="page-title">Head to head</h1>
      <div class="page-sub">Two teams' lineups against each other, inside one competition: every five they put on the floor in the games between them.</div></div>${cmpModes('lineups')}</div>
    <div id="cl-root">${clInner()}</div></div>`;
}

document.addEventListener('click', e => {
  if (!e.target.closest || !document.getElementById('cl-root')) return;
  const t = e.target;
  const g = t.closest('[data-clgame]'); if (g) { CL.game = g.dataset.clgame; CL.open = null; clPaint(); return; }
  if (t.closest('[data-clswap]')) { CL.swap = !CL.swap; CL.open = null; CL.tab = 'A'; clPaint(); return; }
  const z = t.closest('[data-clsize]'); if (z) { CL.size = +z.dataset.clsize; CL.open = null; CL.all = { A: false, B: false }; clPaint(); return; }
  const m = t.closest('[data-clmin]'); if (m) { CL.min = +m.dataset.clmin; clPaint(); return; }
  const tb = t.closest('[data-cltab]'); if (tb) { CL.tab = tb.dataset.cltab; clPaint(); return; }
  const so = t.closest('[data-clsort]'); if (so) { const [s, k] = so.dataset.clsort.split(':'); const c = CL.sort[s]; CL.sort[s] = [k, c[0] === k ? -c[1] : -1]; clPaint(); return; }
  const op = t.closest('[data-clopen]'); if (op) { const i = op.dataset.clopen.indexOf('|'), s = op.dataset.clopen.slice(0, i), k = op.dataset.clopen.slice(i + 1);
    CL.open = CL.open && CL.open.s === s && CL.open.k === k ? null : { s, k }; clPaint(); return; }
  const al = t.closest('[data-clall]'); if (al) { CL.all[al.dataset.clall] = !CL.all[al.dataset.clall]; clPaint(); }
});
document.addEventListener('change', e => {
  if (!e.target.matches) return;
  if (e.target.matches('[data-clcomp]')) { CL.cid = e.target.value; CL.pair = null; CL.game = 'all'; CL.open = null; CL.swap = false; clPaint(); }
  else if (e.target.matches('[data-clpair]')) { CL.pair = e.target.value; CL.game = 'all'; CL.open = null; CL.swap = false; clPaint(); }
});
