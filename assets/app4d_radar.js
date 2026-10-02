/* =========================================================================
   RADAR — the Impact tab's opening figure.

   Six basic box-score measures on one hexagon. The axes are percentiles
   inside whichever field is selected, never raw values: six statistics with
   six different units, and competitions of six different strengths, have no
   common scale otherwise. The 50-ring is the median player in that field, so
   the reading is geometric — outside the shaded zone is above the field,
   inside it is below.

   Two levels of field are offered, because they answer different questions.
   The tier pools every edition together (a bigger, steadier field); a single
   season re-ranks every axis inside that season's own entrants, which is the
   only way to see a year that stands apart from the rest of a career.
   ========================================================================= */

const RADAR_AXES = [
  { k: 'pts',   label: 'PTS', kind: 'count', sum: 'pts', box: l => l.pts },
  { k: 'reb',   label: 'REB', kind: 'count', sum: 'reb', box: l => boxReb(l) },
  { k: 'ast',   label: 'AST', kind: 'count', sum: 'ast', box: l => l.ast },
  { k: 'stl',   label: 'STL', kind: 'count', sum: 'stl', box: l => l.stl },
  { k: 'blk',   label: 'BLK', kind: 'count', sum: 'blk', box: l => l.blk },
  { k: 'fgpct', label: 'FG%', kind: 'rate',  made: 'fgm', att: 'fga', minAtt: 15 },
];
/* Not drawn on the hexagon, but pooled in the same pass so the compare page can
   rank turnovers, three-point and free-throw shooting and plus-minus as well. */
const RADAR_EXTRA = [
  { k: 'tov',   label: 'TOV', kind: 'count', sum: 'tov', low: true },
  { k: 'tppct', label: '3P%', kind: 'rate',  made: 'tpm', att: 'tpa', minAtt: 10 },
  { k: 'ftpct', label: 'FT%', kind: 'rate',  made: 'ftm', att: 'fta', minAtt: 10 },
  { k: 'pm',    label: '+/-', kind: 'count', sum: 'pm' },
  { k: 'eff',   label: 'EFF', kind: 'count', sum: 'eff' },
];
const RADAR_POOLED = RADAR_AXES.concat(RADAR_EXTRA);
const RD_SUMF = ['g', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'fgm', 'fga',
                 'tpm', 'tpa', 'ftm', 'fta', 'pm', 'eff'];

/* ---- fields ----------------------------------------------------------- */
/* A field is the set of players a figure is ranked against: either every
   edition of a tier, or one edition on its own. Both are built the same way
   and cached, because a nine-tier profile would otherwise rebuild them on
   every click. */
const RD_FIELD = {};
function radarField(scope) {
  const key = scope.type + ':' + scope.key;
  if (RD_FIELD[key]) return RD_FIELD[key];
  const comps = scope.type === 'tier'
    ? COMPS.filter(c => tierKey(c) === scope.key)
    : [COMP_BY_ID[scope.key]].filter(Boolean);
  const tgs = comps.map(c => c.tg || 0).filter(Boolean).sort((a, b) => a - b);
  const tg = tgs.length ? tgs[(tgs.length - 1) >> 1] : 0;
  const qmin = Math.max(2, Math.ceil(0.4 * tg));
  const agg = {};
  comps.forEach(c => c.players.forEach(p => {
    if (!hasStats(p)) return;
    const a = agg[p.pid] || (agg[p.pid] = {});
    RD_SUMF.forEach(f => { if (has(p[f])) a[f] = (a[f] || 0) + Number(p[f]); });
  }));
  const all = Object.values(agg);
  const qual = all.filter(a => (a.g || 0) >= qmin);
  /* The sorted value arrays are built on first use, not up front: a profile
     that only draws the hexagon never pays for the four extra measures the
     compare page ranks. */
  const f = { qmin: qmin, nAll: all.length, n: qual.length, comps: comps.length, qual: qual, m: {} };
  RD_FIELD[key] = f;
  return f;
}
function fieldVals(f, x) {
  if (f.m[x.k]) return f.m[x.k];
  const q = f.qual;
  const vals = x.kind === 'count'
    ? q.filter(a => a.g).map(a => (a[x.sum] || 0) / a.g)
    : q.filter(a => (a[x.att] || 0) >= x.minAtt).map(a => (a[x.made] || 0) / a[x.att] * 100);
  return (f.m[x.k] = vals.sort((p, r) => p - r));
}
const RD_EFF_M = { k: 'eff', kind: 'count', sum: 'eff' };

/* Competition rank: 1 + however many qualified players are strictly better.
   It is the figure people actually want; the percentile is what the geometry
   can draw. */
function rankIn(sorted, v) {
  if (!sorted.length || !has(v)) return null;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return sorted.length - lo + 1;
}

/* For a lower-is-better statistic the best rank belongs to the smallest value. */
function lowRankIn(sorted, v) {
  if (!sorted.length || !has(v)) return null;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
  return lo + 1;
}

/* ---- the player inside a field ---------------------------------------- */
function rdLines(pid, scope) {
  const ck = 'rd:' + pid + ':' + scope.type + ':' + scope.key;
  if (IM_LINES[ck]) return IM_LINES[ck];
  const out = [];
  (BOX_BY_PID[pid] || []).forEach(mid => {
    const g = GAME_BY_MID[mid]; if (!g) return;
    const c = COMP_BY_ID[g.cid]; if (!c) return;
    if (scope.type === 'tier' ? tierKey(c) !== scope.key : c.id !== scope.key) return;
    const b = getBox(mid); if (!b) return;
    const l = b.p.find(x => x.pid === pid); if (!l) return;
    out.push(l);
  });
  IM_LINES[ck] = out;
  return out;
}

/* totals -> one complete reading against a field. `withCI` is opt-in: the
   small multiples need only the point estimate, and 600 bootstrap resamples
   per axis per panel would be paid for nothing. */
function radarRead(pid, scope, tot, withCI, opts) {
  const f = radarField(scope), g = Number(tot.g) || 0;
  const out = { qmin: f.qmin, pool: f.n, poolAll: f.nAll, g: g,
                qualified: g >= f.qmin, m: {} };
  const effpg = g ? (Number(tot.eff) || 0) / g : null;
  const effVals = fieldVals(f, RD_EFF_M);
  out.eff = effpg;
  out.effRank = rankIn(effVals, effpg);
  out.effPool = effVals.length;
  const lines = withCI ? rdLines(pid, scope) : null;
  (opts && opts.all ? RADAR_POOLED : RADAR_AXES).forEach(x => {
    const v = x.kind === 'count'
      ? (g ? (Number(tot[x.sum]) || 0) / g : null)
      : (tot[x.att] ? (Number(tot[x.made]) || 0) / tot[x.att] * 100 : null);
    const sorted = fieldVals(f, x);
    let ci = null;
    if (withCI && !x.low && RADAR_AXES.indexOf(x) >= 0) {
      if (x.kind === 'rate') ci = wilsonCI(Number(tot[x.made]) || 0, Number(tot[x.att]) || 0);
      else {
        const vals = lines.map(l => x.box(l)).filter(has).map(Number);
        ci = bootCI(vals, seedOf(pid + scope.key + x.k), 600);
      }
    }
    const p = pctlIn(sorted, v);
    out.m[x.k] = { v: v, p: p, gp: has(p) ? (x.low ? 100 - p : p) : null,
                   rank: x.low ? lowRankIn(sorted, v) : rankIn(sorted, v), n: sorted.length,
                   med: sorted.length ? sorted[sorted.length >> 1] : null, ci: ci,
                   band: ci ? [pctlIn(sorted, ci[0]), pctlIn(sorted, ci[1])] : null };
  });
  return out;
}

/* ---- geometry --------------------------------------------------------- */
const RD_N = RADAR_AXES.length;
function rdAng(i) { return -Math.PI / 2 + i * 2 * Math.PI / RD_N; }
function rdPt(cx, cy, r, i, v) {
  const a = rdAng(i), rad = r * Math.max(0, Math.min(100, v || 0)) / 100;
  return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
}
function rdPoly(pts) { return pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '); }
function rdRing(cx, cy, r, v) { return rdPoly(RADAR_AXES.map((_, i) => rdPt(cx, cy, r, i, v))); }
function rdShape(read, cx, cy, r) { return RADAR_AXES.map((x, i) => rdPt(cx, cy, r, i, read.m[x.k].p)); }
function rdBand(read, cx, cy, r, idx) {
  return RADAR_AXES.map((x, i) => {
    const b = read.m[x.k].band;
    return rdPt(cx, cy, r, i, (b && has(b[idx]) ? b[idx] : read.m[x.k].p));
  });
}
function rdGrid(cx, cy, r) {
  return `<polygon class="zone" points="${rdRing(cx, cy, r, 50)}"></polygon>`
    + [25, 75, 100].map(v => `<polygon class="ring" points="${rdRing(cx, cy, r, v)}"></polygon>`).join('')
    + `<polygon class="ring ring-med" points="${rdRing(cx, cy, r, 50)}"></polygon>`;
}
function rdFmt(v, k) { return !has(v) ? '—' : (k === 'fgpct' ? Number(v).toFixed(1) + '%' : Number(v).toFixed(1)); }
/* Mid-rank percentiles never actually reach 0 or 100 — best of 106 sits at
   99.5 — so the label is clamped rather than rounded into a figure claiming he
   beat himself. The exact standing is the rank printed beside it. */
function rdOrd(p) {
  if (!has(p)) return '—';
  const n = Math.max(1, Math.min(99, Math.round(p))), s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---- panel ------------------------------------------------------------ */
function rdScopeOf(pid, tiers) {
  // the same default the hero band uses, so the two never open on different tiers
  const tk = heroTierFor(pid, tiers);
  const t = tiers.find(x => x.key === tk);
  const ed = IMPACT.rdEd && t && t.rows.some(r => r.c.id === IMPACT.rdEd) ? IMPACT.rdEd : '';
  return { tier: t, ed: ed,
           scope: ed ? { type: 'ed', key: ed } : { type: 'tier', key: tk },
           tot: ed ? (t.rows.find(r => r.c.id === ed) || {}).p : t };
}

function playerRadar(pid, tiers) {
  if (!tiers.length) return '';
  const { tier, ed, scope, tot } = rdScopeOf(pid, tiers);
  if (!tier || !tot) return '';
  const read = radarRead(pid, scope, tot, true);
  const cmpKey = IMPACT.rdCmp || '';
  let cmpRead = null, cmpLabel = '';
  if (cmpKey) {
    const [kind, key] = cmpKey.split('~');
    if (kind === 'tier') {
      const ct = tiers.find(x => x.key === key);
      if (ct) { cmpRead = radarRead(pid, { type: 'tier', key: key }, ct, false); cmpLabel = ct.label; }
    } else {
      const row = tiers.reduce((a, t) => a || t.rows.find(r => r.c.id === key), null);
      if (row) { cmpRead = radarRead(pid, { type: 'ed', key: key }, row.p, false); cmpLabel = row.c.label || row.c.name; }
    }
  }
  const edRow = ed ? tier.rows.find(r => r.c.id === ed) : null;
  const label = edRow ? (edRow.c.label || edRow.c.name) : tier.label;
  const yrs = tier.firstYear === tier.lastYear ? tier.firstYear : tier.firstYear + '–' + tier.lastYear;
  const meta = edRow ? read.g + ' games · ' + (edRow.c.year || '') + ' edition'
    : read.g + ' games · ' + tier.nComps + ' edition' + (tier.nComps > 1 ? 's' : '') + ' · ' + yrs;

  /* main hexagon */
  const cx = 230, cy = 208, r = 124;
  let svg = rdGrid(cx, cy, r);
  svg += RADAR_AXES.map((_, i) => {
    const p = rdPt(cx, cy, r, i, 100);
    return `<line class="spoke" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"></line>`;
  }).join('');
  [25, 75].forEach(v => {
    svg += `<text class="ring-lab" x="${cx + 5}" y="${(cy - r * v / 100 + 3.5).toFixed(1)}">${v}</text>`;
  });
  const ma = -Math.PI / 2 - Math.PI / 3, mr = r * 0.5 * Math.cos(Math.PI / 6);
  svg += `<text class="med-lab" x="${(cx + Math.cos(ma) * mr).toFixed(1)}" y="${(cy + Math.sin(ma) * mr + 3.5).toFixed(1)}" text-anchor="middle">median</text>`;
  const lo = rdBand(read, cx, cy, r, 0), hi = rdBand(read, cx, cy, r, 1);
  svg += `<path class="ribbon" fill-rule="evenodd" d="M${rdPoly(hi).replace(/ /g, ' L')} Z M${rdPoly(lo).replace(/ /g, ' L')} Z"></path>`;
  if (cmpRead) svg += `<polygon class="poly-cmp" points="${rdPoly(rdShape(cmpRead, cx, cy, r))}"></polygon>`;
  svg += `<polygon class="poly" points="${rdPoly(rdShape(read, cx, cy, r))}"></polygon>`;
  RADAR_AXES.forEach((x, i) => {
    const d = read.m[x.k], p = rdPt(cx, cy, r, i, d.p);
    if (cmpRead) {
      const q = rdPt(cx, cy, r, i, cmpRead.m[x.k].p);
      svg += `<circle class="vtx-cmp" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="4"></circle>`;
    }
    const tip = [label, x.label + ' ' + rdFmt(d.v, x.k),
      d.rank ? 'Ranked ' + d.rank + ' of ' + d.n + ' (' + rdOrd(d.p) + ' percentile)' : 'Outside the ranked field',
      d.ci ? '95% interval ' + rdFmt(d.ci[0], x.k) + ' – ' + rdFmt(d.ci[1], x.k) : '',
      'Median here ' + rdFmt(d.med, x.k)].filter(Boolean);
    svg += `<circle class="vtx" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5.5" ${tipAttr(tip)}></circle>`;
    const a = rdAng(i), lx = cx + Math.cos(a) * (r + 28), ly = cy + Math.sin(a) * (r + 28);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
    const dy = Math.sin(a) < -0.5 ? -14 : Math.sin(a) > 0.5 ? 2 : -6;
    svg += `<text class="ax-name" x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}">${x.label}</text>`;
    svg += `<text class="ax-val" x="${lx.toFixed(1)}" y="${(ly + dy + 15).toFixed(1)}" text-anchor="${anchor}">${rdFmt(d.v, x.k)}</text>`;
    svg += `<text class="ax-pct" x="${lx.toFixed(1)}" y="${(ly + dy + 29).toFixed(1)}" text-anchor="${anchor}">${rdOrd(d.p)}</text>`;
  });

  /* readout */
  const rows = RADAR_AXES.map(x => {
    const d = read.m[x.k];
    return `<div class="rd-row">
      <div><div class="rd-k">${x.label}</div><div class="rd-raw">${rdFmt(d.v, x.k)}</div></div>
      <div class="rd-track"><span class="rd-fill" style="width:${Math.max(1, d.p || 0)}%"></span><span class="rd-med"></span></div>
      <div class="rd-num">${d.rank ? '#' + d.rank : '—'}<div class="rd-of">of ${d.n}</div>${
        cmpRead ? `<div class="rd-cmp">#${cmpRead.m[x.k].rank || '—'}</div>` : ''}</div>
    </div>`;
  }).join('');

  /* season control + comparison list */
  const seasons = tier.rows.slice().sort((a, b) => (b.c.year || 0) - (a.c.year || 0));
  /* "Whole tier" is the pooled field — which includes editions this player never
     entered, so it is not the same as the sum of the season buttons beside it. */
  const seg = `<button class="seg-btn ${ed ? '' : 'seg-on'}" data-rded="">Whole tier</button>`
    + seasons.map(rw => `<button class="seg-btn ${ed === rw.c.id ? 'seg-on' : ''}" data-rded="${rw.c.id}">${rw.c.year || '—'}</button>`).join('');
  const cmpOpts = ['<option value="">— none —</option>',
    '<optgroup label="Other tiers">' + tiers.filter(t => t.key !== tier.key)
      .map(t => `<option value="tier~${esc(t.key)}"${cmpKey === 'tier~' + t.key ? ' selected' : ''}>${esc(t.label)}</option>`).join('') + '</optgroup>',
    '<optgroup label="Single seasons">' + tiers.flatMap(t => t.rows).filter(rw => rw.c.id !== ed)
      .map(rw => `<option value="ed~${rw.c.id}"${cmpKey === 'ed~' + rw.c.id ? ' selected' : ''}>${esc(rw.c.label || rw.c.name)}</option>`).join('') + '</optgroup>'];

  /* small multiples: one per tier, then one per edition of the selected tier */
  const tierMinis = tiers.map(t => {
    const rr = radarRead(pid, { type: 'tier', key: t.key }, t, false);
    return `<button class="rd-sm" data-rdtier="${esc(t.key)}" aria-pressed="${t.key === tier.key && !ed}">
      <svg viewBox="0 0 100 100" aria-hidden="true">${rdGrid(50, 50, 40)}<polygon class="poly" points="${rdPoly(rdShape(rr, 50, 50, 40))}"></polygon></svg>
      <div class="rd-sm-name">${esc(tierShort(t.key))}</div>
      <div class="rd-sm-meta">${rr.g}G${rr.effRank ? ' · #' + rr.effRank + ' of ' + rr.effPool : ''}</div>
    </button>`;
  }).join('');
  const edMinis = seasons.length > 1 ? seasons.map(rw => {
    const rr = radarRead(pid, { type: 'ed', key: rw.c.id }, rw.p, false);
    return `<button class="rd-sm" data-rded="${rw.c.id}" aria-pressed="${ed === rw.c.id}">
      <svg viewBox="0 0 100 100" aria-hidden="true">${rdGrid(50, 50, 40)}<polygon class="poly" points="${rdPoly(rdShape(rr, 50, 50, 40))}"></polygon></svg>
      <div class="rd-sm-name">${rw.c.year || '—'}</div>
      <div class="rd-sm-meta">${rr.g}G${rr.effRank ? ' · #' + rr.effRank + ' of ' + rr.effPool : ''}</div>
    </button>`;
  }).join('') : '';

  return `<div class="card">
    <div class="card-head">Statistical shape
      <span class="head-sub">Six basic measures · ranked inside the selected field</span>
    </div>
    <div style="padding:16px 20px 0;">
      <div class="chip-row">${tiers.map(t =>
        `<button class="chip ${t.key === tier.key ? 'chip-on' : ''}" data-rdtier="${esc(t.key)}">${esc(tierShort(t.key))}</button>`).join('')}</div>
      <div class="rd-ctlrow"><span class="rd-ctllabel">Season</span><span class="seg">${seg}</span></div>
      ${tiers.length > 1 || seasons.length > 1 ? `<div class="rd-ctlrow"><span class="rd-ctllabel">Compare with</span>
        <select class="rd-select" data-rdcmp="">${cmpOpts.join('')}</select></div>` : ''}
    </div>
    <div class="rd-stage">
      <div class="rd-plot"><svg viewBox="0 0 460 424" role="img" aria-label="${esc(label)}: percentile radar across six basic statistics">${svg}</svg></div>
      <div class="rd-side">
        <div class="rd-tier">${esc(label)}</div>
        <div class="rd-meta">${esc(meta)}</div>
        <div class="rd-rankline"><b>#${read.effRank || '—'}</b> of ${read.effPool} overall<span> by efficiency · ${rdFmt(read.eff, 'eff')} EFF</span></div>
        ${cmpRead ? `<div class="rd-vs">vs ${esc(cmpLabel)} · ${cmpRead.g}G</div>` : ''}
        ${rows}
        <div class="rd-flag ${read.qualified ? 'ok' : ''}">${read.qualified
          ? `The ranked field is the ${read.pool} of ${read.poolAll} players here who cleared the ${read.qmin}-game threshold.`
          : `Only ${read.g} game${read.g === 1 ? '' : 's'} — below the ${read.qmin}-game threshold, so he is placed against the field rather than counted in it. The interval is drawn wide to say so.`}</div>
      </div>
    </div>
    <div class="rd-legend">
      <span class="key"><i class="k-p"></i>Selected field</span>
      <span class="key"><i class="k-r"></i>95% interval</span>
      ${cmpRead ? '<span class="key"><i class="k-c"></i>Comparison</span>' : ''}
      <span class="key"><i class="k-m"></i>Inside the shaded zone = below the median</span>
    </div>
    ${tiers.length > 1 ? `<div class="rd-subhead">Every tier<span>same six axes, same scale · click one to bring it forward</span></div>
      <div class="rd-smalls">${tierMinis}</div>` : ''}
    ${edMinis ? `<div class="rd-subhead">Season by season — ${esc(tier.label)}<span>each ranked inside that season's own field, not the pooled tier</span></div>
      <div class="rd-smalls">${edMinis}</div>` : ''}
    <div class="note">Each axis is this player's percentile inside the selected field, so six different units and competitions of different strength can share one shape; the number beside each axis is the raw per-game figure. Ranks are competition ranks among the players who cleared that field's games threshold — 40% of the median number of games a team plays there, never below 2. Intervals are a bootstrap over his own published game lines, except FG%, which uses a Wilson interval. Choosing one season re-ranks every axis inside that season's own entrants: a smaller field, and a wider interval to match.</div>
  </div>`;
}
