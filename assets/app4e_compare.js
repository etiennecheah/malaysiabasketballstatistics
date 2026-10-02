/* =========================================================================
   COMPARE — two players, head to head.

   The rule that governs the rest of the site governs this page hardest: a
   per-game figure only means something next to the field that produced it, so
   two players are only ever set against each other inside a competition they
   BOTH played. The competition picker lists nothing else.

   When two players share no competition at all, the page says so rather than
   inventing a comparison, and falls back to the one reading that survives a
   change of field: where each of them ranks inside his own.
   ========================================================================= */

const COMPARE = { a: '', b: '', field: '', ed: '', mode: 'one', per: 'pg' };

/* the rows of the mirrored stat table, in the order they are read */
const CMP_ROWS = [
  { k: 'pts',   label: 'PPG' },
  { k: 'reb',   label: 'RPG' },
  { k: 'ast',   label: 'APG' },
  { k: 'stl',   label: 'SPG' },
  { k: 'blk',   label: 'BPG' },
  { k: 'tov',   label: 'TOV', low: true },
  { k: 'fgpct', label: 'FG%', pct: true },
  { k: 'tppct', label: '3P%', pct: true },
  { k: 'ftpct', label: 'FT%', pct: true },
  { k: 'eff',   label: 'EFF' },
  { k: 'pm',    label: '+/-', signed: true },
];
const CMP_SUMF = ['g', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga',
                  'tpm', 'tpa', 'ftm', 'fta', 'pm', 'eff'];

/* ---- what the two players have in common ------------------------------ */
function cmpOverlap(pa, pb) {
  const ta = playerTiers(pa), tb = playerTiers(pb);
  const keyB = {}; tb.forEach(t => { keyB[t.key] = t; });
  const shared = [];
  ta.forEach(t => {
    const o = keyB[t.key]; if (!o) return;
    const ids = {}; o.rows.forEach(r => { ids[r.c.id] = r; });
    const eds = t.rows.filter(r => ids[r.c.id]).map(r => ({ c: r.c, a: r.p, b: ids[r.c.id].p }));
    if (!eds.length) return;
    eds.sort((x, y) => (y.c.year || 0) - (x.c.year || 0));
    // the pooled row must mean what it says: only the seasons they both entered
    const sumA = {}, sumB = {};
    eds.forEach(e => CMP_SUMF.forEach(f => {
      if (has(e.a[f])) sumA[f] = (sumA[f] || 0) + Number(e.a[f]);
      if (has(e.b[f])) sumB[f] = (sumB[f] || 0) + Number(e.b[f]);
    }));
    shared.push({ key: t.key, label: t.label, short: tierShort(t.key), eds: eds,
                  totA: sumA, totB: sumB, games: (sumA.g || 0) + (sumB.g || 0),
                  lastYear: Math.max.apply(null, eds.map(e => e.c.year || 0)) });
  });
  shared.sort((x, y) => y.games - x.games);
  return { shared: shared, tiersA: ta, tiersB: tb };
}

/* every published game the two of them played on opposite benches */
const CMP_H2H = {};
function cmpMeetings(pa, pb) {
  const ck = pa + '|' + pb;
  if (CMP_H2H[ck]) return CMP_H2H[ck];
  const mine = {}; (BOX_BY_PID[pa] || []).forEach(m => { mine[m] = 1; });
  const out = [];
  (BOX_BY_PID[pb] || []).forEach(mid => {
    if (!mine[mid]) return;
    const g = GAME_BY_MID[mid]; if (!g || !has(g.hs) || !has(g.as)) return;
    const c = COMP_BY_ID[g.cid]; if (!c) return;
    const box = getBox(mid); if (!box) return;
    const la = box.p.find(x => x.pid === pa), lb = box.p.find(x => x.pid === pb);
    if (!la || !lb || !la.team || !lb.team || la.team === lb.team) return;
    const sa = la.team === g.h ? g.hs : g.as, sb = lb.team === g.h ? g.hs : g.as;
    out.push({ mid: mid, g: g, c: c, la: la, lb: lb, sa: sa, sb: sb, aw: sa > sb });
  });
  out.sort((x, y) => (x.g.date || '').localeCompare(y.g.date || ''));
  CMP_H2H[ck] = out;
  return out;
}
function cmpBoxTot(lines, side) {
  const t = { g: lines.length };
  lines.forEach(x => {
    const l = x[side];
    ['pts', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'eff', 'pm']
      .forEach(k => { if (has(l[k])) t[k] = (t[k] || 0) + Number(l[k]); });
    const r = boxReb(l); if (has(r)) t.reb = (t.reb || 0) + Number(r);
  });
  return t;
}

/* ---- rows ------------------------------------------------------------- */
function cmpRaw(tot, row) {
  if (row.pct) {
    const m = { fgpct: ['fgm', 'fga'], tppct: ['tpm', 'tpa'], ftpct: ['ftm', 'fta'] }[row.k];
    return tot[m[1]] ? (tot[m[0]] || 0) / tot[m[1]] * 100 : null;
  }
  return tot.g ? (Number(tot[row.k]) || 0) / tot.g : null;
}
function cmpFmt(v, row) {
  if (!has(v)) return '—';
  const n = Number(v).toFixed(1);
  return (row.signed && v > 0 ? '+' : '') + n + (row.pct ? '%' : '');
}
/* The mirrored row: two values leaning away from a shared centre, and in that
   centre the only number this page is really about — the gap. */
function cmpRows(getA, getB, opts) {
  const pct = opts && opts.pctl;
  return CMP_ROWS.map(row => {
    let a = getA(row), b = getB(row);
    const dp = pct ? 0 : 1;
    a = has(a) ? Number(Number(a).toFixed(dp)) : null;
    b = has(b) ? Number(Number(b).toFixed(dp)) : null;
    const max = pct ? 100 : (Math.max(Math.abs(a || 0), Math.abs(b || 0)) || 1);
    const better = (x, y) => (!pct && row.low) ? x < y : x > y;
    const aw = has(a) && has(b) && better(a, b), bw = has(a) && has(b) && better(b, a);
    const d = has(a) && has(b) ? a - b : null;
    const dTxt = d === null ? '' : (d === 0 ? 'level' : '+' + Math.abs(d).toFixed(dp));
    const show = v => !has(v) ? '—' : (pct ? rdOrd(v) : cmpFmt(v, row));
    const sub = (v, tot) => pct ? `<div class="sr-sub">${cmpFmt(v, row)}</div>` : '';
    return `<div class="sr">
      <div class="sr-v a ${aw ? 'win' : ''}">${show(a)}${pct ? sub(opts.rawA(row)) : ''}</div>
      <div class="sr-bar a ${aw ? '' : 'dim'}"><span style="width:${Math.abs(a || 0) / max * 100}%"></span></div>
      <div class="sr-mid"><div class="sr-k">${row.label}${row.low ? ' ↓' : ''}</div>
        <div class="sr-d ${d === null || d === 0 ? '' : (aw ? 'a' : 'b')}">${dTxt}</div></div>
      <div class="sr-bar b ${bw ? '' : 'dim'}"><span style="width:${Math.abs(b || 0) / max * 100}%"></span></div>
      <div class="sr-v b ${bw ? 'win' : ''}">${show(b)}${pct ? sub(opts.rawB(row)) : ''}</div>
    </div>`;
  }).join('');
}

/* ---- the tape: every measure the source publishes, grouped ------------
   One aggregate shape (T) feeds every row, whether it was built from the
   competition lines both men have in the selected field or from the box scores
   of the games they played against each other. A row that neither side has a
   value for is left out rather than printed as two dashes. */
const CMP_PER = [['pg', 'Per game'], ['p36', 'Per 36 min'], ['tot', 'Totals']];
const CMP_CNT = ['g', 'gs', 'w', 'l', 'pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'flson',
                 'fgm', 'fga', 'tpm', 'tpa', 'twopm', 'twopa', 'ftm', 'fta', 'pm', 'eff', 'tsa', 'gmsc'];

/* competition lines → T. Ratings are per competition, so pooled seasons are
   weighted: PER/USG/ORtg/DRtg by minutes, BPM by possessions; Win Shares add up. */
function cmpAgg(lines) {
  const T = { min: 0, _mp: 0, _per: 0, _usg: 0, _or: 0, _dr: 0, _bp: 0, _bpm: 0, ws: null };
  lines.forEach(({ c, p }) => {
    CMP_CNT.forEach(f => { if (has(p[f])) T[f] = (T[f] || 0) + Number(p[f]); });
    const m = minsToNum(p.min); if (m) T.min += m;
    const a = advRow(c.id, p.pid);
    if (a && a.mp) { T._mp += a.mp; T._per += a.per * a.mp; T._usg += a.usg * a.mp; T._or += a.ortg * a.mp; T._dr += a.drtg * a.mp; T.ws = (T.ws || 0) + a.ws; }
    const b = bpmRow(c.id, p.pid);
    if (b && b.poss) { T._bp += b.poss; T._bpm += b.bpm * b.poss; }
  });
  if (T._mp) { T.per = T._per / T._mp; T.usg = T._usg / T._mp; T.ortg = T._or / T._mp; T.drtg = T._dr / T._mp; T.ws40 = T.ws / T._mp * 40; }
  if (T._bp) T.bpm = T._bpm / T._bp;
  return T;
}
/* box-score lines (one side of every meeting) → the same T */
function cmpAggBox(meets, side) {
  const T = { g: meets.length, min: 0 };
  meets.forEach(x => {
    const l = x[side];
    ['pts', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'tpm', 'tpa', 'twopm', 'twopa', 'ftm', 'fta', 'eff', 'pm']
      .forEach(k => { if (has(l[k])) T[k] = (T[k] || 0) + Number(l[k]); });
    const r = boxReb(l); if (has(r)) T.reb = (T.reb || 0) + Number(r);
    const m = minsToNum(l.min); if (m) T.min += m;
    if (x.sa !== x.sb) { const won = side === 'la' ? x.aw : !x.aw; T[won ? 'w' : 'l'] = (T[won ? 'w' : 'l'] || 0) + 1; }
  });
  return T;
}

const cmpCnt = (k, label, o) => Object.assign({ k, label, cnt: 1 }, o || {});
const cmpRatio = (k, label, num, den, o) => Object.assign({ k, label, calc: T => T[den] ? (T[num] || 0) / T[den] * 100 : null, pct: 1 }, o || {});
const CMP_GROUPS = [
  ['Scoring', [cmpCnt('pts', 'PTS'), cmpCnt('fgm', 'FGM'), cmpCnt('tpm', '3PM'), cmpCnt('ftm', 'FTM'), cmpCnt('fta', 'FTA', { neutral: 1 })]],
  ['Shooting', [cmpRatio('fgpct', 'FG%', 'fgm', 'fga'), cmpRatio('twopct', '2P%', 'twopm', 'twopa'), cmpRatio('tppct', '3P%', 'tpm', 'tpa'),
    cmpRatio('ftpct', 'FT%', 'ftm', 'fta'),
    { k: 'efg', label: 'eFG%', pct: 1, calc: T => T.fga ? ((T.fgm || 0) + 0.5 * (T.tpm || 0)) / T.fga * 100 : null },
    { k: 'ts', label: 'TS%', pct: 1, calc: T => { const d = T.tsa || ((T.fga || 0) + 0.44 * (T.fta || 0)); return d ? (T.pts || 0) / (2 * d) * 100 : null; } }]],
  ['Rebounding', [cmpCnt('oreb', 'OREB'), cmpCnt('dreb', 'DREB'), cmpCnt('reb', 'REB')]],
  ['Playmaking', [cmpCnt('ast', 'AST'), cmpCnt('tov', 'TOV', { low: 1 }),
    { k: 'ato', label: 'AST/TO', dp: 2, calc: T => T.tov ? (T.ast || 0) / T.tov : null }]],
  ['Defence', [cmpCnt('stl', 'STL'), cmpCnt('blk', 'BLK'), cmpCnt('pf', 'Fouls', { low: 1 }), cmpCnt('flson', 'Fouls drawn')]],
  ['Impact', [cmpCnt('eff', 'EFF'), cmpCnt('pm', '+/-', { signed: 1 }),
    cmpCnt('gmsc', 'Game Score'),
    { k: 'per', label: 'PER', calc: T => T.per },
    { k: 'bpm', label: 'BPM', signed: 1, calc: T => T.bpm },
    { k: 'ws', label: 'Win Shares', calc: T => T.ws },
    { k: 'ws40', label: 'WS / 40', dp: 3, calc: T => T.ws40 },
    { k: 'ortg', label: 'ORtg', calc: T => T.ortg },
    { k: 'drtg', label: 'DRtg', low: 1, calc: T => T.drtg },
    { k: 'usg', label: 'USG%', pct: 1, neutral: 1, calc: T => T.usg }]],
  ['Availability', [{ k: 'g', label: 'Games', dp: 0, neutral: 1, calc: T => T.g },
    { k: 'gs', label: 'Starts', dp: 0, neutral: 1, calc: T => T.gs },
    { k: 'mpg', label: 'Minutes', neutral: 1, calc: T => T.min && T.g ? T.min / T.g : null },
    { k: 'winp', label: 'Team win %', pct: 1, neutral: 1, calc: T => (T.w || T.l) ? (T.w || 0) / ((T.w || 0) + (T.l || 0)) * 100 : null }]],
];
const CMP_FULL = { PTS: 'Points', FGM: 'Field goals made', '3PM': 'Three-pointers made', FTM: 'Free throws made', FTA: 'Free throw attempts',
  'FG%': 'Field goal percentage', '2P%': 'Two-point percentage', '3P%': 'Three-point percentage', 'FT%': 'Free throw percentage',
  'eFG%': 'Effective field goal percentage — a three counts for 1.5 field goals', 'TS%': 'True shooting percentage — points per shooting possession, free throws included',
  OREB: 'Offensive rebounds', DREB: 'Defensive rebounds', REB: 'Total rebounds', AST: 'Assists', TOV: 'Turnovers (fewer is better)',
  'AST/TO': 'Assists per turnover', STL: 'Steals', BLK: 'Blocks', Fouls: 'Personal fouls (fewer is better)', 'Fouls drawn': 'Fouls drawn from opponents',
  EFF: 'Efficiency, the source\'s own index', '+/-': 'Point margin while on the floor', 'Game Score': 'Game Score — one number for a box-score line (the source publishes the season total)',
  PER: 'Player Efficiency Rating (league average 15)', BPM: 'Box Plus/Minus per 100 possessions', 'Win Shares': 'Win Shares, total',
  'WS / 40': 'Win Shares per 40 minutes', ORtg: 'Points produced per 100 possessions', DRtg: 'Points allowed per 100 possessions (lower is better)',
  'USG%': 'Share of team possessions used — a role, not a quality', Games: 'Games played', Starts: 'Games started', Minutes: 'Minutes per game',
  'Team win %': 'His team\'s record in the games he played' };

function cmpVal(T, row, per) {
  if (!T) return null;
  if (row.calc) { const v = row.calc(T); return has(v) && isFinite(v) ? v : null; }
  if (!has(T[row.k])) return null;
  if (per === 'tot') return T[row.k];
  if (per === 'p36') return T.min ? T[row.k] / T.min * 36 : null;
  return T.g ? T[row.k] / T.g : null;
}
function cmpShow(v, row, per) {
  if (!has(v)) return '—';
  const dp = has(row.dp) ? row.dp : (row.cnt && per === 'tot' ? 0 : 1);
  return (row.signed && v > 0 ? '+' : '') + Number(v).toFixed(dp) + (row.pct ? '%' : '');
}
/* Renders the groups and keeps score: how many decided measures each side leads,
   and where each one's widest relative edges are. */
function cmpTape(TA, TB, per, groups) {
  const out = { a: 0, b: 0, level: 0, edges: [], html: '', rows: 0, sec: {} };
  out.html = (groups || CMP_GROUPS).map(([title, rows]) => {
    let ga = 0, gb = 0;
    const body = rows.map(row => {
      const a = cmpVal(TA, row, per), b = cmpVal(TB, row, per);
      if (a === null && b === null) return '';
      const dp = has(row.dp) ? row.dp : (row.cnt && per === 'tot' ? 0 : 1);
      const ra = a === null ? null : Number(a.toFixed(dp)), rb = b === null ? null : Number(b.toFixed(dp));
      const both = ra !== null && rb !== null;
      const better = (x, y) => row.low ? x < y : x > y;
      const aw = both && !row.neutral && better(ra, rb), bw = both && !row.neutral && better(rb, ra);
      if (both && !row.neutral) { if (aw) { out.a++; ga++; } else if (bw) { out.b++; gb++; } else out.level++; }
      const max = Math.max(Math.abs(ra || 0), Math.abs(rb || 0)) || 1;
      const d = both ? Math.abs(ra - rb) : null;
      if ((aw || bw) && max) out.edges.push({ side: aw ? 'a' : 'b', label: row.label, rel: d / max,
        txt: (row.low ? '−' : '+') + d.toFixed(dp) });
      out.rows++;
      return `<div class="sr${row.neutral ? ' sr-n' : ''}">
        <div class="sr-v a ${aw ? 'win' : ''}">${cmpShow(ra, row, per)}</div>
        <div class="sr-bar a ${aw || row.neutral ? '' : 'dim'}"><span style="width:${Math.abs(ra || 0) / max * 100}%"></span></div>
        <div class="sr-mid"><div class="sr-k" title="${esc(CMP_FULL[row.label] || row.label)}">${row.label}${row.low ? ' ↓' : ''}</div>
          <div class="sr-d ${!both || row.neutral || d === 0 ? '' : (aw ? 'a' : 'b')}">${!both ? '' : row.neutral ? '' : d === 0 ? 'level' : '+' + d.toFixed(dp)}</div></div>
        <div class="sr-bar b ${bw || row.neutral ? '' : 'dim'}"><span style="width:${Math.abs(rb || 0) / max * 100}%"></span></div>
        <div class="sr-v b ${bw ? 'win' : ''}">${cmpShow(rb, row, per)}</div>
      </div>`;
    }).join('');
    if (!body) return '';
    const decided = ga + gb;
    return (out.sec[title] = `<section class="tp-g"><header class="tp-h"><span class="tp-s a ${ga > gb ? 'on' : ''}">${decided ? ga : ''}</span>
      <h3>${title}</h3><span class="tp-s b ${gb > ga ? 'on' : ''}">${decided ? gb : ''}</span></header>${body}</section>`);
  }).join('');
  out.edges.sort((x, y) => y.rel - x.rel);
  return out;
}

/* each man's best single game inside the selected field */
function cmpHighs(pid, cids) {
  const ok = {}; cids.forEach(c => { ok[c] = 1; });
  const best = {};
  (BOX_BY_PID[pid] || []).forEach(mid => {
    const g = GAME_BY_MID[mid]; if (!g || !ok[g.cid]) return;
    const b = getBox(mid); if (!b) return;
    const l = b.p.find(x => x.pid === pid); if (!l) return;
    const vals = { pts: l.pts, reb: boxReb(l), ast: l.ast, stl: l.stl, blk: l.blk, tpm: l.tpm, eff: l.eff };
    Object.keys(vals).forEach(k => {
      const v = Number(vals[k]); if (!has(vals[k]) || isNaN(v)) return;
      if (!best[k] || v > best[k].v) best[k] = { v, g, opp: l.team === g.h ? g.a : g.h };
    });
  });
  return best;
}
function cmpHighRows(ha, hb) {
  return [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tpm', '3PM'], ['eff', 'EFF']].map(([k, label]) => {
    const a = ha[k], b = hb[k]; if (!a && !b) return '';
    const va = a ? a.v : null, vb = b ? b.v : null, max = Math.max(va || 0, vb || 0) || 1;
    const aw = a && b && va > vb, bw = a && b && vb > va;
    const sub = x => x ? `<div class="sr-sub">vs ${esc(x.opp)} · ${x.g.date ? x.g.date.slice(0, 4) : ''}</div>` : '';
    return `<div class="sr sr-hi">
      <div class="sr-v a ${aw ? 'win' : ''}">${a ? va : '—'}${sub(a)}</div>
      <div class="sr-bar a ${aw ? '' : 'dim'}"><span style="width:${(va || 0) / max * 100}%"></span></div>
      <div class="sr-mid"><div class="sr-k">${label}</div><div class="sr-d ${aw ? 'a' : bw ? 'b' : ''}">${a && b ? (va === vb ? 'level' : '+' + Math.abs(va - vb)) : ''}</div></div>
      <div class="sr-bar b ${bw ? '' : 'dim'}"><span style="width:${(vb || 0) / max * 100}%"></span></div>
      <div class="sr-v b ${bw ? 'win' : ''}">${b ? vb : '—'}${sub(b)}</div></div>`;
  }).join('');
}

/* ---- radar ------------------------------------------------------------ */
function cmpRadar(ra, rb, o) {
  o = o || {};
  const cx = 230, cy = 205, r = o.r || 118;
  let s = rdGrid(cx, cy, r);
  s += RADAR_AXES.map((_, i) => {
    const p = rdPt(cx, cy, r, i, 100);
    return `<line class="spoke" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"></line>`;
  }).join('');
  [25, 75].forEach(v => {
    s += `<text class="ring-lab" x="${cx + 5}" y="${(cy - r * v / 100 + 3.5).toFixed(1)}">${v}</text>`;
  });
  const ma = -Math.PI / 2 - Math.PI / 3, mr = r * 0.5 * Math.cos(Math.PI / 6);
  s += `<text class="med-lab" x="${(cx + Math.cos(ma) * mr).toFixed(1)}" y="${(cy + Math.sin(ma) * mr + 3.5).toFixed(1)}" text-anchor="middle">median</text>`;
  if (rb) s += `<polygon class="poly-b" points="${rdPoly(rdShape(rb.read, cx, cy, r))}"></polygon>`;
  if (ra) s += `<polygon class="poly" points="${rdPoly(rdShape(ra.read, cx, cy, r))}"></polygon>`;
  RADAR_AXES.forEach((x, i) => {
    [[rb, 'vtx-b'], [ra, 'vtx']].forEach(([side, cls]) => {
      if (!side) return;
      const d = side.read.m[x.k], p = rdPt(cx, cy, r, i, d.p);
      s += `<circle class="${cls}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" ${tipAttr([
        side.name, x.label + ' ' + rdFmt(d.v, x.k),
        d.rank ? '#' + d.rank + ' of ' + d.n + ' · ' + rdOrd(d.p) + ' percentile' : 'outside the ranked field'])}></circle>`;
    });
    const a = rdAng(i), lx = cx + Math.cos(a) * (r + 30), ly = cy + Math.sin(a) * (r + 30);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
    const dy = Math.sin(a) < -0.5 ? -12 : Math.sin(a) > 0.5 ? 4 : -4;
    s += `<text class="ax-name" x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}">${x.label}</text>`;
    if (ra) s += `<text class="ax-pct" x="${lx.toFixed(1)}" y="${(ly + dy + 14).toFixed(1)}" text-anchor="${anchor}">${rdOrd(ra.read.m[x.k].p)}</text>`;
    if (rb) s += `<text class="ax-pct-b" x="${lx.toFixed(1)}" y="${(ly + dy + (ra ? 27 : 14)).toFixed(1)}" text-anchor="${anchor}">${rdOrd(rb.read.m[x.k].p)}</text>`;
  });
  return `<svg viewBox="0 0 460 420" role="img" aria-label="${esc(o.alt || 'percentile radar')}">${s}</svg>`;
}

/* ---- pieces ----------------------------------------------------------- */
function cmpFace(pid, big) {
  const n = personName(pid);
  return PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="${esc(n)}">` : esc(initials(n));
}
function cmpBio(pid) {
  const bio = {}, bios = BIO[pid] || {};
  Object.values(bios).forEach(b => ['pos', 'ht', 'wt', 'dob', 'nat'].forEach(k => { if (has(b[k]) && !has(bio[k])) bio[k] = b[k]; }));
  const career = (CAREER[pid] || []).filter(r => hasStats(r.p));
  const recent = career.slice().sort((x, y) => (y.c.year || 0) - (x.c.year || 0)).map(r => r.p.team).filter(Boolean);
  bio.team = recent.find(n => !stateSlug(n)) || recent[0] || '';
  bio.comps = career.length;
  bio.games = career.reduce((n, r) => n + (Number(r.p.g) || 0), 0);
  bio.titles = playerTitles(pid);
  bio.nTitles = bio.titles.reduce((n, t) => n + t.n, 0);
  // a verified player's approved birthday, height or weight
  if (typeof accOverBio === 'function') accOverBio(pid, bio);
  const d = String(bio.dob || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (d) {
    const y = +d[3] < 100 ? (+d[3] <= 30 ? 2000 + +d[3] : 1900 + +d[3]) : +d[3];
    const now = new Date();
    bio.age = now.getFullYear() - y - ((now.getMonth() + 1 < +d[1] || (now.getMonth() + 1 === +d[1] && now.getDate() < +d[2])) ? 1 : 0);
  }
  return bio;
}
function cmpHero(pid, side, bio) {
  const n = personName(pid);
  return `<a class="cmp-hero ${side}" href="#/p/${pid}">
    <span class="vs-fig">${PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="">` : `<span class="vs-mono" aria-hidden="true">${esc(initials(n))}</span>`}</span>
    <span class="vs-who"><span class="cmp-name">${esc(n)}</span>
      <span class="vs-team">${bio.team ? teamMark(bio.team) : ''}<span>${esc(bio.team || 'no team published')}</span></span>
      ${bio.titles.length ? `<span class="vs-chips">${bio.titles.slice(0, 3).map(x => `<span>${esc(tierShort(x.key))}${x.n > 1 ? ' ×' + x.n : ''}</span>`).join('')}</span>` : ''}
    </span></a>`;
}
/* the stage: both men, the verdict between them, and the tale of the tape underneath */
function cmpStage(A, B, verdict) {
  const ba = cmpBio(A), bb = cmpBio(B);
  const row = (label, a, b, cmp) => {
    if (!has(a) && !has(b)) return '';
    const w = cmp && has(a) && has(b) && a !== b ? (cmp(a, b) ? 'a' : 'b') : '';
    return `<div class="vs-row"><span class="${w === 'a' ? 'on' : ''}">${has(a) ? a : '—'}</span><em>${label}</em><span class="${w === 'b' ? 'on' : ''}">${has(b) ? b : '—'}</span></div>`;
  };
  const more = (x, y) => x > y;
  return `<section class="vs">
    <div class="vs-glow" aria-hidden="true"></div><div class="grain"></div>
    <div class="vs-in">
      ${cmpHero(A, 'a', ba)}
      <div class="vs-mid">${verdict ? `<div class="vs-score"><b class="a">${verdict.a}</b><i>–</i><b class="b">${verdict.b}</b></div>
          <div class="vs-cap">measures led${verdict.level ? ' · ' + verdict.level + ' level' : ''}</div><div class="vs-cap2">${esc(verdict.label)}</div>`
        : `<div class="vs-vs">VS</div>`}
        <button class="cmp-swap" data-cmpswap="1">⇄ Swap sides</button>${typeof accCmpBtn === 'function' ? accCmpBtn(A, B) : ''}</div>
      ${cmpHero(B, 'b', bb)}
    </div>
    <div class="vs-tape">
      ${row('Position', esc(ba.pos || ''), esc(bb.pos || ''))}
      ${row('Age', ba.age, bb.age)}
      ${row('Height', has(ba.ht) ? ba.ht + ' cm' : null, has(bb.ht) ? bb.ht + ' cm' : null, (x, y) => parseFloat(x) > parseFloat(y))}
      ${row('Weight', has(ba.wt) ? ba.wt + ' kg' : null, has(bb.wt) ? bb.wt + ' kg' : null)}
      ${row('Competitions', ba.comps, bb.comps, more)}
      ${row('Career games', ba.games, bb.games, more)}
      ${row('Titles', ba.nTitles, bb.nTitles, more)}
    </div>
  </section>`;
}
function cmpPickChip(pid, side) {
  return `<div class="cmp-pick ${side}">
    <span class="cmp-pick-face">${cmpFace(pid)}</span>
    <span style="min-width:0;${side === 'b' ? 'text-align:right' : ''}">
      <span class="cmp-pick-name">${esc(personName(pid))}</span>
      <span class="cmp-pick-sub"> · ${(CAREER[pid] || []).filter(r => hasStats(r.p)).length} competitions</span></span>
    <button class="cmp-x" data-cmpclear="${side}" title="Choose another player">✕</button>
  </div>`;
}
function cmpSearchBox(side) {
  return `<div class="cmp-pick ${side} cmp-empty">
    <input class="cmp-input" id="cmp-in-${side}" data-cmpsearch="${side}" placeholder="Search a player…" autocomplete="off">
    <div class="cmp-results" id="cmp-res-${side}"></div>
  </div>`;
}

/* the margin of every meeting, oldest first */
function cmpMargins(meets, na, nb) {
  const top = Math.max.apply(null, meets.map(m => Math.abs(m.sa - m.sb))) || 1;
  const step = top > 30 ? 10 : 5, cap = Math.max(step, Math.ceil(top / step) * step);
  return `<div class="h2h-chart"><div class="h2h-plot"><span class="h2h-zero" style="top:50%"></span>
    ${meets.map(m => {
      const d = m.sa - m.sb, h = Math.abs(d) / cap * 50;
      return `<div class="h2h-g ${d > 0 ? 'a' : 'b'}" ${tipAttr([
        fmtDate(m.g.date) + ' · ' + (m.c.label || m.c.name),
        m.la.team + ' ' + m.sa + ' – ' + m.sb + ' ' + m.lb.team,
        na + ': ' + fmt0(m.la.pts) + 'p ' + fmt0(boxReb(m.la)) + 'r ' + fmt0(m.la.ast) + 'a',
        nb + ': ' + fmt0(m.lb.pts) + 'p ' + fmt0(boxReb(m.lb)) + 'r ' + fmt0(m.lb.ast) + 'a'])}>
        <i style="${d > 0 ? 'bottom:50%;height:' + h + '%' : 'top:50%;height:' + h + '%'}"></i></div>`;
    }).join('')}</div></div>
    <div class="h2h-side"><span>▲ above the line — <b>${esc(na)}</b>'s team won</span><span>±${cap} pts</span><span>▼ below — <b>${esc(nb)}</b>'s team won</span></div>
    <div class="h2h-axis"><span>${fmtDate(meets[0].g.date)}</span><span>${meets.length} meeting${meets.length > 1 ? 's' : ''}, oldest first</span><span>${fmtDate(meets[meets.length - 1].g.date)}</span></div>`;
}

/* the last few meetings, newest first, each man's line either side of the score */
function cmpRecent(meets) {
  const line = l => `<b>${fmt0(l.pts)}</b> pts · ${fmt0(boxReb(l))} reb · ${fmt0(l.ast)} ast`;
  return `<div class="mt-list">${meets.slice(-6).reverse().map(m => `
    <a class="mt-row" href="#/c/${m.c.id}/box/${m.mid}">
      <span class="mt-l a ${m.aw ? 'w' : ''}">${line(m.la)}</span>
      <span class="mt-mid"><span class="mt-sc"><span class="${m.aw ? 'w' : ''}">${esc(m.la.team)} ${m.sa}</span> – <span class="${m.aw ? '' : 'w'}">${m.sb} ${esc(m.lb.team)}</span></span>
        <span class="mt-when">${esc(fmtDate(m.g.date))} · ${esc(m.c.label || m.c.name)}</span></span>
      <span class="mt-l b ${m.aw ? '' : 'w'}">${line(m.lb)}</span>
    </a>`).join('')}</div>`;
}
function cmpEdges(tp, nameA, nameB) {
  const pick = side => tp.edges.filter(e => e.side === side).slice(0, 4);
  const box = (side, name) => { const e = pick(side);
    return `<div class="ed ${side}"><div class="ed-k">Where ${esc(name)} leads</div>
      <div class="ed-chips">${e.length ? e.map(x => `<span><b>${x.label}</b> ${x.txt}</span>`).join('') : '<span class="ed-none">No measure in this field</span>'}</div></div>`; };
  return `<div class="ed-row">${box('a', nameA)}${box('b', nameB)}</div>`;
}

/* ---- the page --------------------------------------------------------- */
function renderCompare() {
  const A = COMPARE.a, B = COMPARE.b;
  const head = `<div class="page-head"><div>
      <h1 class="page-title">Head to head</h1>
      <div class="page-sub">Two players side by side — inside a competition they both played, because a per-game figure only means something next to the field that produced it.</div>
    </div></div>`;

  if (!A || !B) {
    const pairs = cmpSuggestions();
    return `<div class="page cmp-page">${head}
      <div class="cmp-start">
        <div class="cmp-start-k">Pick two players</div>
        <div class="cmp-pickrow">
          ${A ? cmpPickChip(A, 'a') : cmpSearchBox('a')}
          <div><div class="cmp-vs">VS</div></div>
          ${B ? cmpPickChip(B, 'b') : cmpSearchBox('b')}
        </div>
        <div class="cmp-start-n">Type a name on each side, or open one of the rivalries below.</div>
      </div>
      <div class="cat-head"><h2>Most-played rivalries</h2><span class="cat-count">${pairs.length}</span><span class="cat-rule"></span></div>
      <div class="rcard-grid">${pairs.map(cmpRivalCard).join('')}</div>
      <div class="rcard-note">Two players count as having met when the source publishes a box score with both of them in it, on opposite teams. Pick a card to open the full head-to-head.</div>
    </div>`;
  }

  const ov = cmpOverlap(A, B);
  const shared = ov.shared;
  const nameA = personName(A), nameB = personName(B);
  const picks = `<div class="cmp-pickrow">
      ${cmpPickChip(A, 'a')}
      <div><div class="cmp-vs">VS</div></div>
      ${cmpPickChip(B, 'b')}
    </div>`;

  const meets = cmpMeetings(A, B);
  const h2hCard = meets.length ? (() => {
    const ta = cmpAggBox(meets, 'la'), tb = cmpAggBox(meets, 'lb');
    const wa = meets.filter(m => m.aw).length;
    const tp = cmpTape(ta, tb, 'pg');
    return `<div class="card cmp-card">
      <div class="card-head">When they met<span class="head-sub">every published game with the two of them on opposite benches</span></div>
      <div class="h2h-top">
        <div><div class="cmp-biglabel">Games ${esc(nameA.split(' ')[0])}'s teams won</div><div class="h2h-rec a">${wa}</div></div>
        <div class="cmp-biglabel" style="text-align:center">${meets.length} meeting${meets.length > 1 ? 's' : ''}<br>
          <span style="font-weight:400;text-transform:none;letter-spacing:0">across ${new Set(meets.map(m => m.c.id)).size} competition${new Set(meets.map(m => m.c.id)).size > 1 ? 's' : ''}</span></div>
        <div><div class="cmp-biglabel" style="text-align:right">Games ${esc(nameB.split(' ')[0])}'s teams won</div><div class="h2h-rec b">${meets.length - wa}</div></div>
      </div>
      ${cmpMargins(meets, nameA, nameB)}
      <div class="note" style="border-top:none;padding-bottom:4px;">Each bar is one meeting: height is the final margin, side is whose team won. Hover for the game.</div>
      <div class="rd-subhead">The latest meetings<span>each man's line either side of the final score — open a row for the box score</span></div>
      ${cmpRecent(meets)}
      <div class="rd-subhead">Their own numbers in those ${meets.length} meetings<span>same games, same nights — per game, from those box scores alone</span></div>
      <div class="tp tp-cols"><div>${['Scoring', 'Shooting', 'Rebounding'].map(k => tp.sec[k] || '').join('')}</div>
        <div>${['Playmaking', 'Defence', 'Impact', 'Availability'].map(k => tp.sec[k] || '').join('')}</div></div>
      <div class="note">In these meetings ${esc(nameA)} leads ${tp.a} measure${tp.a === 1 ? '' : 's'} and ${esc(nameB)} ${tp.b}. Ratings that need a whole competition (PER, BPM, Win Shares) cannot be computed from a handful of games and are left out here.</div>
    </div>`;
  })() : '';

  if (!shared.length) {
    /* No common competition. Rather than invent a comparison, the page says so
       and falls back to the one reading that survives a change of field. */
    const fa = ov.tiersA[0], fb = ov.tiersB[0];
    const ra = { name: nameA, read: radarRead(A, { type: 'tier', key: fa.key }, fa, true, { all: true }) };
    const rb = { name: nameB, read: radarRead(B, { type: 'tier', key: fb.key }, fb, true, { all: true }) };
    return `<div class="page cmp-page">${head}${picks}${cmpStage(A, B, null)}
      <div class="cmp-scope">
        <div class="fp-badge diff">No shared competition</div>
        <div class="fp-note" style="margin-top:8px;max-width:92ch;">${esc(nameA)} and ${esc(nameB)} have never appeared in the same competition, so there is no field that could hold both of their per-game figures. Putting those figures side by side would compare two different levels of opposition and call it a difference between two players — this page will not do that. What it can show is <b>where each of them stands inside his own strongest field</b>, on one 0–100 scale.</div>
      </div>
      <div class="card cmp-card">
        <div class="card-head">Each inside his own competition<span class="head-sub">percentile, the one scale that survives a change of field</span></div>
        <div class="cmp-duel">
          <div class="cmp-bigwrap a"><div class="cmp-biglabel">Efficiency per game</div><div class="cmp-big a">${fmt1(ra.read.eff)}</div>
            <div class="cmp-bigsub">${ra.read.g} games · #${ra.read.effRank} of ${ra.read.effPool}</div>
            <div class="cmp-bigsub">${esc(fa.label)}</div></div>
          <div class="cmp-biglabel" style="text-align:center">vs</div>
          <div class="cmp-bigwrap b"><div class="cmp-biglabel">Efficiency per game</div><div class="cmp-big b">${fmt1(rb.read.eff)}</div>
            <div class="cmp-bigsub">${rb.read.g} games · #${rb.read.effRank} of ${rb.read.effPool}</div>
            <div class="cmp-bigsub">${esc(fb.label)}</div></div>
        </div>
        <div style="padding:4px 20px 14px;max-width:620px;margin:0 auto;">${cmpRadar(ra, rb, { alt: 'both players, each against his own competition' })}</div>
        <div class="tp">${cmpRows(r => ra.read.m[r.k] ? ra.read.m[r.k].gp : null, r => rb.read.m[r.k] ? rb.read.m[r.k].gp : null,
                  { pctl: true, rawA: r => ra.read.m[r.k] && ra.read.m[r.k].v, rawB: r => rb.read.m[r.k] && rb.read.m[r.k].v })}</div>
        <div class="note">Each number is that player's percentile inside his own competition — ${esc(nameA)} against ${esc(fa.label)}, ${esc(nameB)} against ${esc(fb.label)} — with the raw per-game figure it came from in grey underneath. TOV is inverted (↓): a higher percentile means fewer turnovers. These are two separate standings placed next to each other, not one comparison.</div>
      </div>
      ${h2hCard}</div>`;
  }

  const f = shared.find(x => x.key === COMPARE.field) || shared[0];
  const ed = f.eds.find(e => e.c.id === COMPARE.ed);
  const scope = ed ? { type: 'ed', key: ed.c.id } : { type: 'tier', key: f.key };
  const totA = ed ? ed.a : f.totA, totB = ed ? ed.b : f.totB;
  const ra = { name: nameA, read: radarRead(A, scope, totA, true, { all: true }) };
  const rb = { name: nameB, read: radarRead(B, scope, totB, true, { all: true }) };
  const label = ed ? (ed.c.label || ed.c.name) : f.label;
  const eds = ed ? [ed] : f.eds;
  const TA = cmpAgg(eds.map(e => ({ c: e.c, p: e.a }))), TB = cmpAgg(eds.map(e => ({ c: e.c, p: e.b })));
  const per = CMP_PER.some(x => x[0] === COMPARE.per) ? COMPARE.per : 'pg';
  const tp = cmpTape(TA, TB, per);
  const cids = eds.map(e => e.c.id);
  const highs = cmpHighRows(cmpHighs(A, cids), cmpHighs(B, cids));
  const perLabel = CMP_PER.find(x => x[0] === per)[1].toLowerCase();

  return `<div class="page cmp-page">${head}${picks}
    ${cmpStage(A, B, { a: tp.a, b: tp.b, level: tp.level, label: label })}
    <div class="cmp-scope">
      <div class="cmp-scope-note">These two share <b>${shared.length} competition${shared.length > 1 ? 's' : ''}</b> and ${shared.reduce((n, x) => n + x.eds.length, 0)} seasons. Everything below is measured inside <b>${esc(label)}</b>${ed ? '' : `, pooled across only the ${f.eds.length} season${f.eds.length > 1 ? 's' : ''} they both entered`} — the same field of ${ra.read.pool} qualified players for both men.</div>
      <div class="cmp-ctl"><span class="cmp-ctl-label">Competition</span>
        <span class="chip-row" style="margin:0">${shared.map(x =>
          `<button class="chip ${x.key === f.key ? 'chip-on' : ''}" data-cmpfield="${esc(x.key)}">${esc(x.short)}</button>`).join('')}</span></div>
      <div class="cmp-ctl"><span class="cmp-ctl-label">Season</span>
        <span class="seg"><button class="seg-btn ${ed ? '' : 'seg-on'}" data-cmped="">Both careers here</button>
        ${f.eds.map(e => `<button class="seg-btn ${ed && ed.c.id === e.c.id ? 'seg-on' : ''}" data-cmped="${e.c.id}">${e.c.year || '—'}</button>`).join('')}</span></div>
    </div>
    ${cmpEdges(tp, nameA, nameB)}

    <div class="cmp-two">
    <div class="card cmp-card">
      <div class="card-head">The duel<span class="head-sub">six basic measures · percentile inside ${esc(label)}</span></div>
      <div class="cmp-duel">
        <div class="cmp-bigwrap a"><div class="cmp-biglabel">Efficiency per game</div><div class="cmp-big a">${fmt1(ra.read.eff)}</div>
          <div class="cmp-bigsub">${ra.read.g} games · #${ra.read.effRank} of ${ra.read.effPool}</div></div>
        <div class="seg" style="flex:none">
          <button class="seg-btn ${COMPARE.mode === 'one' ? 'seg-on' : ''}" data-cmpmode="one">One hexagon</button>
          <button class="seg-btn ${COMPARE.mode === 'two' ? 'seg-on' : ''}" data-cmpmode="two">Side by side</button></div>
        <div class="cmp-bigwrap b"><div class="cmp-biglabel">Efficiency per game</div><div class="cmp-big b">${fmt1(rb.read.eff)}</div>
          <div class="cmp-bigsub">${rb.read.g} games · #${rb.read.effRank} of ${rb.read.effPool}</div></div>
      </div>
      ${COMPARE.mode === 'one'
        ? `<div style="padding:4px 20px 14px;max-width:560px;margin:0 auto;">${cmpRadar(ra, rb, { alt: 'both players on one percentile radar' })}</div>`
        : `<div class="duo"><div><div class="duo-title a">${esc(nameA)}</div>${cmpRadar(ra, null, { r: 100 })}</div>
           <div><div class="duo-title b">${esc(nameB)}</div>${cmpRadar(null, rb, { r: 100 })}</div></div>`}
      <div class="rd-legend">
        <span class="key"><i class="k-p"></i>${esc(nameA)}</span>
        <span class="key"><i class="k-c" style="border-style:solid"></i>${esc(nameB)}</span>
        <span class="key"><i class="k-m"></i>Inside the shaded zone = below this competition's median</span>
      </div>
      <div class="note">Each axis is a percentile inside ${esc(label)}'s own field, so both shapes are drawn against one yardstick.</div>
    </div>
    ${highs ? `<div class="card cmp-card">
      <div class="card-head">Best single games<span class="head-sub">each man's highs inside ${esc(label)}</span></div>
      <div class="tp">${highs}</div>
      <div class="note">The most each of them has put up in one game in this field, with the opponent and year underneath. From the published box scores.</div>
    </div>` : ''}
    </div>

    <div class="card cmp-card">
      <div class="card-head tp-head"><span>Tale of the tape<span class="head-sub">${esc(label)} · ${tp.rows} measures · ${perLabel}</span></span>
        <span class="seg">${CMP_PER.map(([k, l]) => `<button class="seg-btn ${per === k ? 'seg-on' : ''}" data-cmpper="${k}">${l}</button>`).join('')}</span></div>
      <div class="tp tp-cols"><div>${['Scoring', 'Shooting', 'Rebounding', 'Playmaking'].map(k => tp.sec[k] || '').join('')}</div>
        <div>${['Impact', 'Defence', 'Availability'].map(k => tp.sec[k] || '').join('')}</div></div>
      <div class="note">The number in the middle of each row is the gap, coloured for whoever leads it; the two figures on each group's header count the measures each man leads in it. ↓ marks a measure where fewer is better. Percentages come from published makes and attempts, never averaged from other percentages. Per 36 minutes rescales the counting numbers by minutes played. PER, BPM and Win Shares are computed here per competition and pooled by minutes or possessions — estimates, like everywhere else on the site. Usage, attempts, games and minutes describe a role, so nobody "leads" them.</div>
    </div>
    ${h2hCard}</div>`;
}

/* the pairs who have met most often — computed once, lazily */
let CMP_SUGG = null;
/* One rivalry as a card: the two players facing each other across the meeting
   count, then what those meetings came to — games won and scoring in them. */
function cmpRivalCard(p) {
  const m = cmpMeetings(p.a, p.b);
  const na = personName(p.a), nb = personName(p.b);
  const wa = m.filter(x => x.aw).length, wb = m.length - wa;
  const ta = cmpBoxTot(m, 'la'), tb = cmpBoxTot(m, 'lb');
  const ppg = t => t.g && has(t.pts) ? fmt1(t.pts / t.g) : '—';
  // the team each played for most often in these games
  const mostTeam = side => { const c = {}; m.forEach(x => { const t = x[side].team; c[t] = (c[t] || 0) + 1; });
    return Object.keys(c).sort((x, y) => c[y] - c[x])[0] || ''; };
  const tA = mostTeam('la'), tB = mostTeam('lb');
  const last = m[m.length - 1];
  const fig = (pid, n) => PHOTOS[pid]
    ? `<img src="${PHOTOS[pid]}" alt="">`
    : `<span class="rcard-mono">${esc(initials(n))}</span>`;
  const n = m.length || p.n, share = n ? wa / n * 100 : 50;
  return `<a class="rcard" href="#/compare/${p.a}/${p.b}">
    <div class="bloom" style="--team:${teamBloom(tA)}"><i class="b1"></i><i class="b2"></i></div>
    <div class="rcard-in">
      <div class="rcard-stage">
        <div class="rcard-fig a">${fig(p.a, na)}</div>
        <div class="rcard-vs"><b>${n}</b><span>meetings</span></div>
        <div class="rcard-fig b">${fig(p.b, nb)}</div>
      </div>
      <div class="rcard-names">
        <div class="rcard-who a"><div class="rcard-name">${esc(na)}</div><div class="rcard-team">${teamMark(tA)}<span>${esc(tA)}</span></div></div>
        <div class="rcard-who b"><div class="rcard-name">${esc(nb)}</div><div class="rcard-team"><span>${esc(tB)}</span>${teamMark(tB)}</div></div>
      </div>
      <div class="rcard-ev">
        <div class="rcard-row"><b class="a">${wa}</b><span>team wins</span><b class="b">${wb}</b></div>
        <div class="rcard-bar"><i class="a" style="width:${share}%"></i><i class="b" style="width:${100 - share}%"></i></div>
        <div class="rcard-row small"><b>${ppg(ta)}</b><span>points per meeting</span><b>${ppg(tb)}</b></div>
      </div>
      ${last ? `<div class="rcard-foot">Last met ${esc(fmtDate(last.g.date))} · ${esc(last.c.label || last.c.name)}</div>` : ''}
    </div>
  </a>`;
}
function cmpSuggestions() {
  if (CMP_SUGG) return CMP_SUGG;
  const count = {};
  Object.keys(BOX_RAW).forEach(mid => {
    const raw = BOX_RAW[mid], byTeam = {};
    raw.p.forEach(row => {
      const ti = row[1];
      if (ti === null || ti === undefined || ti === '') return;
      // a line with no person link (FIBA opponents, a few portal rows) is nobody's rival
      if (!row[0]) return;
      (byTeam[ti] = byTeam[ti] || []).push(row[0]);
    });
    const ks = Object.keys(byTeam);
    if (ks.length !== 2) return;
    const a = byTeam[ks[0]], b = byTeam[ks[1]];
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      const k = a[i] < b[j] ? a[i] + '|' + b[j] : b[j] + '|' + a[i];
      count[k] = (count[k] || 0) + 1;
    }
  });
  CMP_SUGG = Object.keys(count).map(k => { const [a, b] = k.split('|');
    return { a: a, b: b, n: count[k] }; })
    .sort((x, y) => y.n - x.n).slice(0, 24)
    // rank on the meetings the head-to-head page will actually count (a box with
    // no final score doesn't), so a card's number and its place always agree
    .map(p => ({ a: p.a, b: p.b, n: cmpMeetings(p.a, p.b).length }))
    .sort((x, y) => y.n - x.n).slice(0, 9);
  return CMP_SUGG;
}
