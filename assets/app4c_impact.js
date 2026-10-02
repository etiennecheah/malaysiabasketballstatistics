/* =========================================================================
   IMPACT — the player profile's visualisation tab.

   The problem this tab exists to solve: a per-game average only means
   something next to the field that produced it. 14.3 points in a U17 cup and
   1.7 in the senior league are not comparable numbers, and no amount of
   charting makes them comparable. What IS comparable is a player's standing
   inside each competition he actually played in — so every figure here is a
   percentile within its own tier's player pool, never a cross-tier average.

   Three rules borrowed from the honest-sports-figure literature, applied
   everywhere on this tab:
     1. Period and denominator appear on every chart ("2022–2026 · 182 of 235
        players cleared the qualification threshold").
     2. Uncertainty is computed, never implied. Counting stats get a bootstrap
        interval over the player's own game lines; shooting percentages get a
        Wilson interval, because a 4-for-4 night is not 100% shooting.
     3. A sample too small to qualify for the pool is still shown — marked,
        with its interval drawn wide — because hiding it is its own kind of lie.

   Everything is drawn with positioned HTML rather than SVG: the text then
   stays at its real size at every viewport width, and the charts inherit the
   site's own colour tokens.
   ========================================================================= */

const IMPACT = { metric: 'pts', tier: null, table: false, expand: null,
                 rdEd: '', rdCmp: '' };

/* metric registry: how to sum it from a season line, how to read it off a box
   score line, and whether "more" is better. */
const IM_METRICS = [
  { k: 'pts',   label: 'Points',       unit: 'PTS/G', kind: 'count', sum: 'pts', box: l => l.pts },
  { k: 'reb',   label: 'Rebounds',     unit: 'REB/G', kind: 'count', sum: 'reb', box: l => boxReb(l) },
  { k: 'ast',   label: 'Assists',      unit: 'AST/G', kind: 'count', sum: 'ast', box: l => l.ast },
  { k: 'stl',   label: 'Steals',       unit: 'STL/G', kind: 'count', sum: 'stl', box: l => l.stl },
  { k: 'tov',   label: 'Turnovers',    unit: 'TOV/G', kind: 'count', sum: 'tov', box: l => l.tov, invert: true },
  { k: 'eff',   label: 'Efficiency',   unit: 'EFF/G', kind: 'count', sum: 'eff', box: l => l.eff },
  { k: 'fgpct', label: 'Field goals',  unit: 'FG%',   kind: 'rate',  made: 'fgm', att: 'fga', minAtt: 15 },
  { k: 'tppct', label: 'Three-point',  unit: '3P%',   kind: 'rate',  made: 'tpm', att: 'tpa', minAtt: 10 },
  { k: 'ftpct', label: 'Free throws',  unit: 'FT%',   kind: 'rate',  made: 'ftm', att: 'fta', minAtt: 10 },
];
const IM_BY_K = {};
IM_METRICS.forEach(m => { IM_BY_K[m.k] = m; });
const IM_SUMF = ['g', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga', 'tpm', 'tpa',
                 'ftm', 'fta', 'eff', 'tsa'];

/* ---- statistics ------------------------------------------------------- */

/* Mid-rank percentile: ties share the middle of the range they occupy, so a
   tier where 41% of players have zero blocks doesn't hand all of them "0th". */
function pctlIn(sorted, v) {
  const n = sorted.length;
  if (!n || !has(v)) return null;
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
  const below = lo;
  hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return (below + (lo - below) / 2) / n * 100;
}
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q, f = Math.floor(i), c = Math.ceil(i);
  return f === c ? sorted[f] : sorted[f] + (sorted[c] - sorted[f]) * (i - f);
}
/* Seeded so a re-render never reshuffles a chart under the reader's cursor. */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* Percentile bootstrap of the mean, over the player's own game lines. Scoring
   is heavily right-skewed at this level — one 30-point night moves a five-game
   average by six points — so a normal standard error would understate it. */
function bootCI(vals, seed, B) {
  const n = vals.length;
  if (n < 2) return null;
  B = B || 600;
  const rnd = mulberry32(seed), means = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += vals[(rnd() * n) | 0];
    means[b] = s / n;
  }
  const arr = Array.from(means).sort((a, b) => a - b);
  return [arr[Math.floor(0.025 * B)], arr[Math.min(B - 1, Math.ceil(0.975 * B))]];
}
/* Wilson score interval — the right interval for a made/attempted ratio. */
function wilsonCI(made, att) {
  if (!att) return null;
  const z = 1.96, p = made / att, d = 1 + z * z / att;
  const c = (p + z * z / (2 * att)) / d;
  const half = z * Math.sqrt(p * (1 - p) / att + z * z / (4 * att * att)) / d;
  return [Math.max(0, c - half) * 100, Math.min(1, c + half) * 100];
}

/* ---- reference pools -------------------------------------------------- */
/* A pool is every player's aggregate inside one tier, across all of that
   tier's editions. Qualification scales with the format: 40% of the median
   number of games a team plays there, never below 2 — a four-game group stage
   and a fourteen-game league cannot share one "minimum games" number. */
const IM_POOL = {};
function impactPool(k) {
  if (IM_POOL[k]) return IM_POOL[k];
  const comps = COMPS.filter(c => tierKey(c) === k);
  const tgs = comps.map(c => c.tg || 0).filter(Boolean).sort((a, b) => a - b);
  const tg = tgs.length ? tgs[(tgs.length - 1) >> 1] : 0;
  const qmin = Math.max(2, Math.ceil(0.4 * tg));
  const agg = {};
  comps.forEach(c => c.players.forEach(p => {
    if (!hasStats(p)) return;
    const a = agg[p.pid] || (agg[p.pid] = { pid: p.pid });
    IM_SUMF.forEach(f => { if (has(p[f])) a[f] = (a[f] || 0) + Number(p[f]); });
  }));
  const all = Object.values(agg);
  const qual = all.filter(a => (a.g || 0) >= qmin);
  const pool = { key: k, tg: tg, qmin: qmin, nAll: all.length, n: qual.length,
                 comps: comps.length, byMetric: {} };
  IM_METRICS.forEach(m => {
    let vals;
    if (m.kind === 'count') {
      vals = qual.map(a => (a.g ? (a[m.sum] || 0) / a.g : null)).filter(has);
    } else {
      vals = qual.filter(a => (a[m.att] || 0) >= m.minAtt)
                 .map(a => (a[m.made] || 0) / a[m.att] * 100);
    }
    vals.sort((x, y) => x - y);
    pool.byMetric[m.k] = vals;
  });
  const fgapg = qual.map(a => (a.g ? (a.fga || 0) / a.g : null)).filter(has).sort((x, y) => x - y);
  const ts = qual.filter(a => (a.fga || 0) + (a.fta || 0) >= 20)
                 .map(a => a.pts / (2 * (a.fga + 0.44 * a.fta)) * 100)
                 .filter(v => isFinite(v)).sort((x, y) => x - y);
  pool.shot = { fgapg: fgapg, ts: ts };
  IM_POOL[k] = pool;
  return pool;
}

/* The same idea one level down: the pool inside a single edition, used by the
   expanded per-competition rows. */
const IM_CPOOL = {};
function compPool(cid, mk) {
  const key = cid + '|' + mk;
  if (IM_CPOOL[key]) return IM_CPOOL[key];
  const c = COMP_BY_ID[cid], m = IM_BY_K[mk];
  const qmin = Math.max(2, Math.ceil(0.4 * (c.tg || 0)));
  let vals = [];
  c.players.forEach(p => {
    if (!hasStats(p) || (p.g || 0) < qmin) return;
    if (m.kind === 'count') { if (p.g) vals.push((Number(p[m.sum]) || 0) / p.g); }
    else if ((p[m.att] || 0) >= m.minAtt) vals.push((p[m.made] || 0) / p[m.att] * 100);
  });
  vals.sort((a, b) => a - b);
  IM_CPOOL[key] = { vals: vals, qmin: qmin };
  return IM_CPOOL[key];
}

/* ---- the player's own numbers ----------------------------------------- */
function imValue(t, m) {
  if (m.kind === 'count') return t.g ? (Number(t[m.sum]) || 0) / t.g : null;
  return t[m.att] ? (Number(t[m.made]) || 0) / t[m.att] * 100 : null;
}
/* Every published box-score line this player has inside one tier. */
const IM_LINES = {};
function tierLines(pid, k) {
  const ck = pid + '|' + k;
  if (IM_LINES[ck]) return IM_LINES[ck];
  const out = [];
  (BOX_BY_PID[pid] || []).forEach(mid => {
    const g = GAME_BY_MID[mid]; if (!g) return;
    const c = COMP_BY_ID[g.cid]; if (!c || tierKey(c) !== k) return;
    const b = getBox(mid); if (!b) return;
    const l = b.p.find(x => x.pid === pid); if (!l) return;
    out.push({ l: l, g: g, c: c });
  });
  out.sort((a, b) => (a.g.date || '').localeCompare(b.g.date || ''));
  IM_LINES[ck] = out;
  return out;
}

/* One tier's complete standing on one metric: the raw figure, where it ranks,
   and how wide the interval around it is. */
function imStat(pid, t, m) {
  const pool = impactPool(t.key);
  const sorted = pool.byMetric[m.k] || [];
  const v = imValue(t, m);
  const qualified = m.kind === 'count'
    ? (t.g || 0) >= pool.qmin
    : ((t.g || 0) >= pool.qmin && (t[m.att] || 0) >= m.minAtt);
  let ci = null;
  if (m.kind === 'rate') {
    ci = wilsonCI(Number(t[m.made]) || 0, Number(t[m.att]) || 0);
  } else {
    const vals = tierLines(pid, t.key).map(x => m.box(x.l)).filter(has).map(Number);
    ci = bootCI(vals, seedOf(pid + t.key + m.k), 600);
  }
  const p = pctlIn(sorted, v);
  const band = ci ? [pctlIn(sorted, ci[0]), pctlIn(sorted, ci[1])] : null;
  return { v: v, p: p, ci: ci, band: band, pool: pool, sorted: sorted, qualified: qualified,
           rank: has(v) && sorted.length ? sorted.length - sorted.filter(x => x < v).length : null };
}

/* ---- rendering -------------------------------------------------------- */
function imPctl(p) { return has(p) ? Math.round(p) : '—'; }
function imOrdinal(p) {
  if (!has(p)) return '—';
  const n = Math.round(p), s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function imFmt(v, m) {
  if (!has(v)) return '—';
  return m.kind === 'rate' ? Number(v).toFixed(1) + '%' : Number(v).toFixed(1);
}
function tipAttr(lines) { return `data-imtip="${esc(lines.filter(Boolean).join('\n'))}"`; }

/* --- chart 1: percentile bars, one row per tier ------------------------ */
function imBars(pid, tiers, m) {
  const rows = tiers.map(t => ({ t: t, s: imStat(pid, t, m) }));
  const anyQ = rows.some(r => r.s.qualified);
  const body = rows.map(({ t, s }) => {
    const p = s.p, band = s.band;
    const lo = band && has(band[0]) ? Math.min(band[0], band[1]) : null;
    const hi = band && has(band[1]) ? Math.max(band[0], band[1]) : null;
    const wide = has(lo) && has(hi) && (hi - lo) > 45;
    const open = IMPACT.expand === t.key;
    const tip = [
      tierLabelFromKey(t.key),
      imFmt(s.v, m) + ' ' + m.unit + ' · ' + (t.g || 0) + ' games in ' + t.nComps + (t.nComps > 1 ? ' editions' : ' edition'),
      has(p) ? 'Ranks ' + s.rank + ' of ' + s.sorted.length + ' qualified players (' + imOrdinal(p) + ' percentile)' : 'Outside the qualified pool',
      s.ci ? '95% interval ' + imFmt(s.ci[0], m) + ' – ' + imFmt(s.ci[1], m) : null,
      s.qualified ? null : 'Below this tier’s ' + s.pool.qmin + '-game threshold — shown, but not counted in the pool',
    ];
    return `<div class="im-row ${open ? 'im-row-open' : ''}">
      <button class="im-label" data-imexpand="${esc(t.key)}" ${tipAttr(['Show each edition separately'])}>
        <span class="im-caret ${open ? 'open' : ''}">▸</span>
        <span class="im-label-txt">${esc(tierShort(t.key))}</span>
        <span class="im-n">${t.g || 0}G${t.nComps > 1 ? ' · ' + t.nComps + '×' : ''}</span>
      </button>
      <div class="im-track" ${tipAttr(tip)}>
        ${[25, 50, 75].map(x => `<span class="im-grid" style="left:${x}%"></span>`).join('')}
        ${has(lo) && has(hi) ? `<span class="im-ci" style="left:${lo}%;width:${Math.max(0.6, hi - lo)}%"></span>` : ''}
        ${has(p) ? `<span class="im-bar ${s.qualified ? '' : 'im-bar-small'}" style="width:${Math.max(0.8, p)}%"></span>
                    <span class="im-dot" style="left:${p}%"></span>` : `<span class="im-none">no qualified pool value</span>`}
      </div>
      <div class="im-val">${has(p) ? `<b>${imPctl(p)}</b><span>${imOrdinal(p).replace(/^\d+/, '')}</span>` : '<b>—</b>'}</div>
      <div class="im-raw">${imFmt(s.v, m)}<em>${m.unit}</em>${s.qualified ? '' : `<span class="im-flag" ${tipAttr(['Fewer than ' + s.pool.qmin + ' games (or ' + (m.minAtt || 0) + ' attempts) — kept on the chart, excluded from the pool'])}>small sample</span>`}${wide ? `<span class="im-flag im-flag-wide" ${tipAttr(['The 95% interval spans more than 45 percentile points — this figure cannot separate him from most of the field'])}>wide</span>` : ''}</div>
      ${open ? imSubRows(pid, t, m) : ''}
    </div>`;
  }).join('');

  const pool0 = impactPool(tiers[0].key);
  return `<div class="im-card">
    <div class="im-head">
      <div>
        <div class="im-title">${esc(m.label)} — percentile inside each competition tier</div>
        <div class="im-sub">Each bar is this player's rank among everyone who cleared that tier's qualification threshold, across every edition of it in the database. Bars are never compared to each other's raw figures — only to their own field.${m.invert ? ' <b>Turnovers are reversed: a longer bar means fewer turnovers.</b>' : ''}</div>
      </div>
    </div>
    <div class="im-legend">
      <span class="key"><i class="k-bar"></i>Percentile in tier</span>
      <span class="key"><i class="k-ci"></i>95% ${m.kind === 'rate' ? 'Wilson' : 'bootstrap'} interval, mapped onto the same scale</span>
      <span class="key"><i class="k-hatch"></i>Below the tier's games threshold</span>
    </div>
    <div class="im-rows">
      <div class="im-axis"><span style="left:0">0</span><span style="left:25%">25</span><span style="left:50%">median</span><span style="left:75%">75</span><span style="left:100%">100</span></div>
      ${body}
    </div>
    <div class="im-note">${anyQ ? '' : 'None of this player’s samples clears a qualification threshold, so every bar here is marked. '}Qualification is 40% of the median number of games a team plays in that competition, never below 2 — ${tiers.map(t => { const p = impactPool(t.key); return esc(tierShort(t.key)) + ' ' + p.qmin + 'G, pool ' + p.n + ' of ' + p.nAll; }).join(' · ')}.</div>
  </div>`;
}

/* Per-edition ticks: the same 0–100 scale, but ranked inside that single
   edition's field rather than the pooled tier. */
function imSubRows(pid, t, m) {
  return `<div class="im-subs">${t.rows.map(r => {
    const cp = compPool(r.c.id, m.k);
    const v = imValue(r.p, m);
    const p = pctlIn(cp.vals, v);
    const q = (r.p.g || 0) >= cp.qmin && (m.kind === 'count' || (r.p[m.att] || 0) >= m.minAtt);
    return `<div class="im-sub-row">
      <div class="im-sub-label">${esc((r.c.year || '') + (r.p.team ? ' · ' + r.p.team : ''))}</div>
      <div class="im-track im-track-sm" ${tipAttr([r.c.label || r.c.name,
        imFmt(v, m) + ' ' + m.unit + ' · ' + (r.p.g || 0) + ' games',
        has(p) ? imOrdinal(p) + ' percentile among ' + cp.vals.length + ' qualified in this edition' : 'No qualified field for this edition',
        q ? null : 'Below this edition’s ' + cp.qmin + '-game threshold'])}>
        ${[25, 50, 75].map(x => `<span class="im-grid" style="left:${x}%"></span>`).join('')}
        ${has(p) ? `<span class="im-dot im-dot-sm ${q ? '' : 'im-dot-open'}" style="left:${p}%"></span>` : ''}
      </div>
      <div class="im-val im-val-sm">${has(p) ? imPctl(p) : '—'}</div>
      <div class="im-raw im-raw-sm">${imFmt(v, m)}</div>
    </div>`;
  }).join('')}</div>`;
}

/* --- chart 2: one dot per game ----------------------------------------- */
function imDist(pid, tiers, m) {
  const dm = m.kind === 'count' ? m : IM_BY_K.pts;
  const series = tiers.map(t => {
    const vals = tierLines(pid, t.key).map(x => ({ v: Number(dm.box(x.l)), g: x.g, c: x.c }))
      .filter(x => has(x.v) && isFinite(x.v));
    const sorted = vals.map(x => x.v).sort((a, b) => a - b);
    const pool = impactPool(t.key);
    const leagueMed = quantile(pool.byMetric[dm.k] || [], 0.5);
    const mean = vals.length ? vals.reduce((a, x) => a + x.v, 0) / vals.length : null;
    return { t: t, vals: vals, med: quantile(sorted, 0.5), mean: mean, league: leagueMed };
  }).filter(s => s.vals.length);
  if (!series.length) {
    return `<div class="im-card"><div class="im-empty">The source publishes no per-game box score line for this player, so there is no game-level distribution to draw.</div></div>`;
  }
  const max = Math.max.apply(null, series.map(s => Math.max.apply(null, s.vals.map(x => x.v))));
  const step = max > 40 ? 10 : max > 20 ? 5 : max > 8 ? 2 : 1;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  return `<div class="im-card">
    <div class="im-head"><div>
      <div class="im-title">Every game, one dot — ${esc(dm.label.toLowerCase())} by tier</div>
      <div class="im-sub">This is the chart that shows whether an average is a steady level or the residue of one big night. ${m.kind === 'rate' ? '<b>Percentages have no meaningful per-game distribution at this sample size (a 1-for-1 game is not 100% shooting), so this panel stays on points.</b>' : ''}</div>
    </div></div>
    <div class="im-legend">
      <span class="key"><i class="k-dot"></i>One published game</span>
      <span class="key"><i class="k-mean"></i>His mean in that tier</span>
      <span class="key"><i class="k-league"></i>Median qualified player in that tier</span>
    </div>
    <div class="im-rows">
      ${series.map(s => {
        const seed = mulberry32(seedOf(pid + s.t.key + 'jit'));
        return `<div class="im-drow">
          <div class="im-label im-label-static"><span class="im-label-txt">${esc(tierShort(s.t.key))}</span><span class="im-n">${s.vals.length}G</span></div>
          <div class="im-strip">
            ${ticks.map(v => `<span class="im-grid" style="left:${v / top * 100}%"></span>`).join('')}
            ${has(s.league) ? `<span class="im-rule im-rule-league" style="left:${Math.min(100, s.league / top * 100)}%" ${tipAttr(['Median qualified player in ' + tierShort(s.t.key) + ': ' + s.league.toFixed(1) + ' ' + dm.unit])}></span>` : ''}
            ${has(s.mean) ? `<span class="im-rule im-rule-mean" style="left:${Math.min(100, s.mean / top * 100)}%" ${tipAttr(['His mean in ' + tierShort(s.t.key) + ': ' + s.mean.toFixed(1) + ' ' + dm.unit])}></span>` : ''}
            ${s.vals.map(x => `<span class="im-gdot" style="left:${Math.min(100, x.v / top * 100)}%;top:${18 + seed() * 58}%" ${tipAttr([fmtDate(x.g.date), esc(x.c.label || x.c.name), x.v + ' ' + dm.unit.replace('/G', '')])}></span>`).join('')}
          </div>
        </div>`;
      }).join('')}
      <div class="im-axis im-axis-bottom">${ticks.map(v => `<span style="left:${v / top * 100}%">${v}</span>`).join('')}</div>
    </div>
    <div class="im-note">Dots are vertically scattered only so they don't hide each other; vertical position carries no meaning. Only games the source publishes a box score line for appear here.</div>
  </div>`;
}

/* --- chart 3: volume against efficiency -------------------------------- */
function imShot(pid, tiers) {
  const pts = tiers.map(t => {
    const fga = t.fga || 0, fta = t.fta || 0;
    if (!t.g || fga + fta < 8) return null;
    const ts = t.pts / (2 * (fga + 0.44 * fta)) * 100;
    if (!isFinite(ts)) return null;
    return { t: t, x: fga / t.g, y: ts, att: fga + fta };
  }).filter(Boolean);
  if (!pts.length) {
    return `<div class="im-card"><div class="im-empty">Not enough published shooting volume to place this player on a volume-versus-efficiency plot.</div></div>`;
  }
  const sel = tiers.find(t => t.key === (IMPACT.tier || tiers[0].key)) || tiers[0];
  const pool = impactPool(sel.key).shot;
  const xs = pts.map(p => p.x).concat(pool.fgapg.length ? [quantile(pool.fgapg, 0.9)] : []);
  const xmax = Math.max(4, Math.ceil(Math.max.apply(null, xs) / 2) * 2);
  /* The y window is fitted to what is actually on the plot. A fixed 0–100%
     axis would squash every real Malaysian shooting season into the middle
     fifth of the panel and hide the differences the chart exists to show. */
  const ysAll = pts.map(p => p.y)
    .concat(pool.ts.length ? [quantile(pool.ts, 0.1), quantile(pool.ts, 0.9)] : []);
  const ymin = Math.max(0, Math.floor((Math.min.apply(null, ysAll) - 6) / 10) * 10);
  const ymax = Math.min(100, Math.ceil((Math.max.apply(null, ysAll) + 6) / 10) * 10);
  const X = v => Math.max(0, Math.min(100, v / xmax * 100));
  const Y = v => Math.max(0, Math.min(100, 100 - (v - ymin) / (ymax - ymin) * 100));
  const yticks = []; for (let v = ymin; v <= ymax + 0.001; v += (ymax - ymin) / 4) yticks.push(Math.round(v));
  const q = pool.fgapg.length && pool.ts.length ? {
    x1: X(quantile(pool.fgapg, 0.25)), x2: X(quantile(pool.fgapg, 0.75)),
    y1: Y(quantile(pool.ts, 0.75)), y2: Y(quantile(pool.ts, 0.25)),
    mx: X(quantile(pool.fgapg, 0.5)), my: Y(quantile(pool.ts, 0.5)),
  } : null;
  /* Greedy de-collision: labels sit to the right of their point unless that
     would land on one already placed, in which case they flip left, then step
     down. Nothing is dropped — an unreadable label is worse than a moved one. */
  const placed = [];
  pts.slice().sort((a, b) => Y(a.y) - Y(b.y) || X(a.x) - X(b.x)).forEach(p => {
    const px = X(p.x), py = Y(p.y);
    const cand = [[px, py, 'r'], [px, py, 'l'], [px, py + 6, 'r'], [px, py - 6, 'r'],
                  [px, py + 6, 'l'], [px, py - 6, 'l'], [px, py + 12, 'r'], [px, py - 12, 'r']];
    const label = tierShort(p.t.key);
    const w = 4 + label.length * 1.15;
    let pick = cand[0];
    for (const c of cand) {
      const l = c[2] === 'r' ? c[0] + 1.5 : c[0] - 1.5 - w;
      const clash = placed.some(o => Math.abs(o.y - c[1]) < 4.2 && l < o.r && l + w > o.l);
      if (!clash && l > -2 && l + w < 102) { pick = c; break; }
    }
    const l = pick[2] === 'r' ? pick[0] + 1.5 : pick[0] - 1.5 - w;
    placed.push({ p: p, x: pick[0], y: pick[1], side: pick[2], l: l, r: l + w, label: label,
                  px: px, py: py });
  });
  return `<div class="im-card">
    <div class="im-head"><div>
      <div class="im-title">Shot volume against true shooting</div>
      <div class="im-sub">A percentage on its own can't say whether a player is efficient or simply seldom shoots. The shaded box is the middle half of qualified players in <b>${esc(tierShort(sel.key))}</b> — ${pool.ts.length} players — with their medians as the crosshair.</div>
    </div></div>
    <div class="im-plot">
      <div class="im-plot-y">${yticks.map(v => `<span style="top:${Y(v)}%">${v}%</span>`).join('')}</div>
      <div class="im-plot-area">
        ${yticks.map(v => `<span class="im-hgrid" style="top:${Y(v)}%"></span>`).join('')}
        ${q ? `<span class="im-iqr" style="left:${q.x1}%;width:${Math.max(1, q.x2 - q.x1)}%;top:${q.y1}%;height:${Math.max(1, q.y2 - q.y1)}%"></span>
               <span class="im-cross-v" style="left:${q.mx}%"></span><span class="im-cross-h" style="top:${q.my}%"></span>` : ''}
        ${placed.map(o => `<span class="im-pt ${o.p.t.key === sel.key ? 'im-pt-on' : ''}" style="left:${o.px}%;top:${o.py}%" ${tipAttr([tierLabelFromKey(o.p.t.key), o.p.x.toFixed(1) + ' field-goal attempts per game', o.p.y.toFixed(1) + '% true shooting', o.p.t.g + ' games'])}></span>
          ${Math.abs(o.y - o.py) > 1 ? `<span class="im-leader" style="left:${o.px}%;top:${Math.min(o.py, o.y)}%;height:${Math.abs(o.y - o.py)}%"></span>` : ''}
          <span class="im-pt-label" style="${o.side === 'r' ? 'left:' + (o.px + 1.3) + '%' : 'right:' + (101.3 - o.px) + '%'};top:${o.y}%">${esc(o.label)}</span>`).join('')}
      </div>
      <div class="im-plot-x">${Array.from({ length: 5 }, (_, i) => i * xmax / 4).map(v => `<span style="left:${X(v)}%">${v % 1 ? v.toFixed(1) : v}</span>`).join('')}</div>
      <div class="im-plot-xlab">Field-goal attempts per game</div>
      <div class="im-plot-ylab">True shooting %</div>
    </div>
    <div class="im-note">True shooting is points ÷ (2 × (FGA + 0.44 × FTA)) — the source publishes no possession counts, so nothing pace-adjusted can be computed from this data. The reference box follows the tier selected in the panels above.</div>
  </div>`;
}

/* --- the numbers, as a table ------------------------------------------- */
function imTable(pid, tiers) {
  return `<div class="im-card">
    <div class="im-head"><div><div class="im-title">Every charted value, as a table</div>
      <div class="im-sub">Nothing on this tab exists only as a position or a colour.</div></div></div>
    <div class="table-scroll"><table>
      <thead><tr><th class="left nosort">Tier</th><th class="nosort">G</th>
        ${IM_METRICS.map(m => `<th class="nosort" colspan="2">${esc(m.unit)}</th>`).join('')}</tr>
        <tr><th class="left nosort"></th><th class="nosort"></th>
        ${IM_METRICS.map(() => '<th class="nosort im-th-sm">value</th><th class="nosort im-th-sm">pctl</th>').join('')}</tr></thead>
      <tbody>${tiers.map(t => `<tr>
        <td class="left">${esc(tierLabelFromKey(t.key))}</td><td>${t.g || 0}</td>
        ${IM_METRICS.map(m => {
          const s = imStat(pid, t, m);
          return `<td>${imFmt(s.v, m)}</td><td class="${s.qualified ? '' : 'im-td-small'}">${has(s.p) ? imPctl(s.p) : '—'}</td>`;
        }).join('')}
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="im-note">Percentiles in grey come from samples below their tier's qualification threshold.</div>
  </div>`;
}

/* --- the tab ----------------------------------------------------------- */
function playerImpact(pid, tiers) {
  if (!tiers.length) {
    return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>The source publishes no statistical line for this player, so there is nothing to place against a field.</div></div>`;
  }
  const m = IM_BY_K[IMPACT.metric] || IM_BY_K.pts;
  if (!IMPACT.tier || !tiers.some(t => t.key === IMPACT.tier)) IMPACT.tier = tiers[0].key;
  const single = tiers.length === 1;
  const bars = imBars(pid, tiers, m);
  const dist = imDist(pid, tiers, m);
  return `
  <div class="im-bar-row">
    <span class="im-bar-label">Metric</span>
    <span class="chip-row">${IM_METRICS.map(x => `<button class="chip ${x.k === m.k ? 'chip-on' : ''}" data-immetric="${x.k}">${esc(x.unit)}</button>`).join('')}</span>
    <button class="chip im-table-toggle ${IMPACT.table ? 'chip-on' : ''}" data-imtable="1">${IMPACT.table ? 'Hide table' : 'Table view'}</button>
  </div>
  <div class="im-intro">${single
    ? `This player appears in one competition tier, so there is no cross-tier comparison to make. What the data can say is where he ranked inside <b>${esc(tierLabelFromKey(tiers[0].key))}</b> — and inside each single season of it — and how steady he was game to game.`
    : `Nothing on this tab averages across the ${tiers.length} tiers below. Each figure is ranked inside its own competition's field, which is the only comparison this data supports.`}</div>
  ${playerRadar(pid, tiers)}
  ${single ? dist + bars : bars + dist}
  ${imShot(pid, tiers)}
  ${IMPACT.table ? imTable(pid, tiers) : ''}`;
}
