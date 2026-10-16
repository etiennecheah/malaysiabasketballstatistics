/* =========================================================================
   Report — a player profile tab (#/p/<pid>/report): a scouting report written
   from his numbers. Nothing is typed by hand per player.

   The numbers come from stats/rp/<pid>.js (build_report.py): for every event
   he played, his line and his rank in each skill among that event's rotation
   players ("8th of 83"). Ranks from events of different sizes are scaled to a
   field of 100 ("about 17th of every 100") and only those are blended, by
   minutes; raw numbers are never averaged across events of different strength.
   The shot profile reads the Shot map's files (app4u_shots.js).
   ========================================================================= */
const RP_DATA = {}, RP_ST = {};
function REPORT_PUT(pid, d) { RP_DATA[pid] = d; }
function ensureReport(pid) {
  if (RP_ST[pid]) return;
  RP_ST[pid] = 'loading';
  const s = document.createElement('script');
  s.src = HS.BASE + 'stats/rp/' + pid + '.js';
  const done = ok => { RP_ST[pid] = ok && RP_DATA[pid] ? 'done' : 'error'; if (/\/report$/.test(HS.hash())) softRoute(); };
  s.onload = () => done(true); s.onerror = () => done(false);
  document.head.appendChild(s);
}
// every player with a line that has minutes gets the tab
function rpHas(pid) { return (CAREER[pid] || []).some(r => hasStats(r.p) && minsToNum(r.p.min) > 0); }

const RP_DAY = 864e5;
const rpOrd = n => { n = Math.round(n); const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const rpF1 = v => v == null || isNaN(v) ? '–' : (+v).toFixed(1);
const rpPct = (m, a) => a ? Math.round(100 * m / a) + '%' : '–';
const rpCap = s => s.charAt(0).toUpperCase() + s.slice(1);
const RP_LV = {Youth: {c: 'var(--rp-lv-y)', sh: 'circle'}, Development: {c: 'var(--rp-lv-d)', sh: 'square'}, Senior: {c: 'var(--rp-lv-s)', sh: 'diamond'}};
const RP_LV_NOUN = {Youth: 'youth events', Development: 'development leagues', Senior: 'senior events'};
const RP_POS = {PG: 'point guard', SG: 'shooting guard', G: 'guard', SF: 'wing', F: 'forward', PF: 'forward', C: 'centre'};
const RP_SKILLS = [
  {k: 'scoring', n: 'Scoring volume'},
  {k: 'eff', n: 'Scoring efficiency'},
  {k: 'three', n: 'Three-point shooting', att: 'tpa', minN: 20},
  {k: 'ft', n: 'Free-throw shooting', att: 'fta', minN: 12},
  {k: 'line', n: 'Getting to the line'},
  {k: 'play', n: 'Playmaking'},
  {k: 'care', n: 'Ball security'},
  {k: 'reb', n: 'Rebounding'},
  {k: 'def', n: 'Defensive activity'},
  {k: 'impact', n: 'Overall impact'},
];
const RP_AWARD_WORD = {play: 'assists', def: 'steals or blocks', scoring: 'scoring', reb: 'rebounds'};
const RP_AWARD_SKILL = {'Top assist': 'play', 'Top steal': 'def', 'Top block': 'def', 'Top scorer': 'scoring', 'Top rebound': 'reb'};
const rpBin = v => v == null ? -1 : v < 20 ? 0 : v < 40 ? 1 : v < 60 ? 2 : v < 80 ? 3 : 4;
const rpCell = v => { const b = rpBin(v); return b < 0 ? '' : `background:var(--rp-dv-${b});color:var(--rp-dvt-${b})`; };

/* ------------------------------ the engine ------------------------------ */
// his place in one event, as a position from 100 (the top) to 0 (the bottom)
const rpSp = (r, s) => { const k = r.rk && r.rk[s.k]; return k ? (k[1] > 1 ? 100 * (k[1] - k[0]) / (k[1] - 1) : 100) : null; };
const rpPer100 = v => Math.max(1, Math.min(100, Math.round(1 + (100 - v) * 0.99)));
const rpOf100 = v => `${rpOrd(rpPer100(v))} of every 100`;
const rpRk = (r, s) => { const k = r.rk && r.rk[s.k]; return k ? `${rpOrd(k[0])} of ${k[1]}` : '–'; };
const rpEvRanks = (rows, s, n = 3) => [...rows].reverse().filter(r => r.rk && r.rk[s.k]).slice(0, n).map(r => `${rpRk(r, s)} at ${esc(r.name)}`).join(', ');
const rpUsable = r => r.q && r.pool >= 20;
function rpBlend(rows, s) {
  let n = 0, d = 0, att = 0;
  rows.forEach(r => { const v = rpSp(r, s); if (v == null) return; const w = r.min * (r._w || 1); n += v * w; d += w; if (s.att) att += r[s.att]; });
  if (!d || (s.att && att < s.minN)) return null;
  return n / d;
}
function rpLine(rows) {
  const t = {g: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, topct: 0, orpct: 0, drpct: 0, bpm: 0, wt: {}};
  rows.forEach(r => {
    t.g += r.g; t.min += r.min;
    t.pts += r.ppg * r.g; t.reb += r.rpg * r.g; t.ast += r.apg * r.g; t.stl += r.spg * r.g; t.blk += r.bpg * r.g; t.tov += r.tpg * r.g;
    ['fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta'].forEach(k => t[k] += r[k]);
    ['topct', 'orpct', 'drpct', 'bpm'].forEach(k => { if (r[k] != null) { t[k] += r[k] * r.min; t.wt[k] = (t.wt[k] || 0) + r.min; } });
  });
  ['topct', 'orpct', 'drpct', 'bpm'].forEach(k => { t[k] = t.wt[k] ? t[k] / t.wt[k] : null; });
  t.ts = t.fga + t.fta ? 100 * t.pts / (2 * (t.fga + 0.44 * t.fta)) : null;
  return t;
}
function rpBuild(pid, P) {
  const rows = P.rows.map(r => Object.assign({}, r, {t: Date.parse(r.start)}));
  const graded = rows.filter(rpUsable);
  // "now" is his newest graded event: a player whose last season was years ago is read as of then
  const last = Math.max(...(graded.length ? graded : rows).map(r => r.t));
  const recent = graded.filter(r => r.t <= last && last - r.t <= 366 * RP_DAY).map(r => Object.assign(r, {_w: Math.pow(0.5, (last - r.t) / (183 * RP_DAY))}));
  const rSen = recent.filter(r => r.cat === 'Senior'), rDev = recent.filter(r => r.cat !== 'Senior');
  const main = rSen.length ? rSen : rDev, mainCat = rSen.length ? 'Senior' : 'Junior';
  const byCat = {}; ['Youth', 'Development', 'Senior'].forEach(c => byCat[c] = graded.filter(r => r.cat === c));
  const prof = RP_SKILLS.map(s => ({s, now: rpBlend(main, s), cat: Object.fromEntries(Object.keys(byCat).map(c => [c, rpBlend(byCat[c], s)]))}));
  const pv = k => prof.find(x => x.s.k === k).now ?? 50;
  const sc = pv('scoring'), pl = pv('play'), df = pv('def');
  const p2 = String(P.pos || '').toUpperCase().split(/[\/ -]/)[0];
  const pos = RP_POS[p2] || 'player';
  const arch = !main.length ? 'Not graded yet' : pl >= 75 && sc < 65 ? 'Pass-first ' + pos : sc >= 75 && pl < 65 ? 'Score-first ' + pos :
    sc >= 70 && pl >= 70 ? 'Scoring, playmaking ' + pos : df >= 65 ? 'Defence-first ' + pos : 'Rotation ' + pos;
  // a skill "has not travelled" when he ranks 25+ places (per 100) lower against seniors than at his best younger level
  const travel = prof.filter(x => x.s.k !== 'impact' && x.cat.Senior != null).map(x => {
    const lo = ['Youth', 'Development'].filter(c => x.cat[c] != null).sort((a, b) => x.cat[b] - x.cat[a])[0];
    return lo ? {x, from: lo, hi: x.cat[lo], drop: x.cat[lo] - x.cat.Senior} : null; }).filter(Boolean).sort((a, b) => b.drop - a.drop);
  const ranked = prof.filter(x => x.s.k !== 'impact' && x.now != null).sort((a, b) => b.now - a.now);
  const strengths = ranked.filter(x => x.now >= 65).slice(0, 4);
  const gaps = ranked.filter(x => x.now <= 45).reverse();
  travel.filter(t => t.drop >= 25 && !gaps.includes(t.x) && !strengths.includes(t.x)).forEach(t => gaps.push(t.x));
  const tiers = {}; graded.forEach(r => (tiers[r.tier] = tiers[r.tier] || []).push(r));
  const yoy = Object.values(tiers).filter(l => l.length >= 2).sort((a, b) => b[b.length - 1].t - a[a.length - 1].t);
  // he or she, from the competitions he played
  const women = rows.filter(r => (COMP_BY_ID[r.cid] || {}).gender === 'Women').length > rows.length / 2;
  const W = women ? {he: 'she', his: 'her', him: 'her', He: 'She', His: 'Her'} : {he: 'he', his: 'his', him: 'him', He: 'He', His: 'His'};
  return {pid, P, rows, graded, last, recent, main, mainCat, byCat, prof, arch, travel, strengths, gaps, yoy, W};
}

/* ----------------------------- the evidence ----------------------------- */
function rpEvidence(k, rows, W) {
  const t = rpLine(rows), g = t.g || 1;
  return {
    scoring: `${rpF1(t.pts / g)} PTS a game, ${rpF1(t.pts / t.min * 40)} per 40 minutes`,
    eff: `${rpF1(t.ts)}% true shooting on ${t.fga} shots and ${t.fta} free throws`,
    three: `${t.tpm}/${t.tpa} from three (${rpPct(t.tpm, t.tpa)})`,
    ft: `${t.ftm}/${t.fta} at the line (${rpPct(t.ftm, t.fta)})`,
    line: `${Math.round(100 * t.fta / (t.fga || 1))} free-throw attempts per 100 shots`,
    play: `${rpF1(t.ast / g)} AST a game, ${(t.ast / (t.tov || 1)).toFixed(1)} assists per turnover`,
    care: `turns it over on ${rpF1(t.topct)}% of the possessions ${W.he} uses`,
    reb: `${rpF1(t.reb / g)} REB a game; grabs ${rpF1(t.orpct)}% of offensive and ${rpF1(t.drpct)}% of defensive rebounds`,
    def: `${rpF1(t.stl / g)} STL and ${rpF1(t.blk / g)} BLK a game`,
    impact: `box plus-minus ${t.bpm > 0 ? '+' : ''}${rpF1(t.bpm)}`,
  }[k];
}
const rpEvNames = rows => { const n = rows.map(r => esc(r.name)); return n.length <= 3 ? n.join(', ') : n.slice(-3).join(', ') + ` and ${n.length - 3} more`; };
const rpGrade = v => v >= 85 ? 'Elite' : v >= 65 ? 'Strength' : v > 45 ? 'Average' : v > 30 ? 'Below average' : 'Weakness';
function rpMarker(sh, x, y, r, fill, wrap, hollow) {
  const st = hollow ? `fill="var(--surface)" stroke="${fill}" stroke-width="2"` : `fill="${fill}" stroke="var(--surface)" stroke-width="2"`;
  const m = sh === 'circle' ? `<circle cx="${x}" cy="${y}" r="${r}" ${st}/>` : sh === 'square' ? `<rect x="${x - r * .88}" y="${y - r * .88}" width="${r * 1.76}" height="${r * 1.76}" rx="1.5" ${st}/>` :
    `<path d="M${x} ${y - r * 1.2}L${x + r * 1.2} ${y}L${x} ${y + r * 1.2}L${x - r * 1.2} ${y}Z" ${st}/>`;
  return wrap ? `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${m}</svg>` : m;
}

/* -------------------------------- the tab -------------------------------- */
const RP = {pid: null, metric: 'impact', R: null};
function rpTab(pid) {
  const P = RP_DATA[pid];
  if (!P) {
    ensureReport(pid);
    return pvSec('Report', '', '', `<div class="card pv-card"><div class="empty-row"><span class="empty-dot"></span>${RP_ST[pid] === 'error' ? 'The report could not be loaded. Refresh the page to try again.' : 'Writing the report…'}</div></div>`);
  }
  if (RP.pid !== pid) { RP.pid = pid; RP.metric = 'impact'; }
  const R = RP.R = rpBuild(pid, P), W = R.W, rows = R.rows;
  if (!R.graded.length) {
    return pvSec('Report', '', '', `<div class="card pv-card rp-card"><p class="rp-lede">${W.He} has no event yet with enough minutes to be ranked: a report needs at least 40% of the busiest player's games and 10 minutes a game in an event with 20 or more such players.</p>${rpTable(R)}</div>`);
  }
  const latest = rows[rows.length - 1];
  const nowNoun = R.mainCat === 'Senior' ? 'senior events' : `${W.his} age group`;
  const top = R.strengths.find(x => !['ft', 'line'].includes(x.s.k)) || R.strengths[0];
  const tr = R.travel.find(t => t.drop >= 25 && t.x !== top);
  const gap = R.gaps.find(x => x !== (tr && tr.x));
  const imp = R.prof.find(x => x.s.k === 'impact');
  let head = top ? `${W.His} best tool is ${top.s.n.toLowerCase()}. Over the 12 months to ${esc(R.main[R.main.length - 1].name)}, ${W.he} ranks about ${rpOf100(top.now)} players in ${nowNoun} (${rpEvRanks(R.main, top.s, 2)}).`
    : `Nothing stands out yet at ${W.his} current level: no skill ranks inside the top 35 of every 100.`;
  if (tr) head += ` What has not travelled yet is ${W.his} ${tr.x.s.n.toLowerCase()}: about ${rpOrd(rpPer100(tr.hi))} of every 100 in ${RP_LV_NOUN[tr.from]}, but ${rpOrd(rpPer100(tr.x.cat.Senior))} of every 100 in senior ones.`;
  else if (gap) head += ` The main gap is ${gap.s.n.toLowerCase()} (about ${rpOf100(gap.now)}).`;
  const ageRow = [...rows].reverse().find(r => r.younger != null);
  const facts = [
    ['Overall impact, last 12 months', imp.now != null ? `About ${rpOf100(imp.now)}` : '–'],
    [`Overall impact at ${esc(latest.name)}`, rpRk(latest, imp.s)],
    ['Graded against', `${R.mainCat === 'Senior' ? 'Senior' : 'Age-group'} events: ${rpEvNames(R.main)}`],
    ageRow ? [`Age at ${esc(ageRow.name)}`, `${ageRow.age}; ${rpAgeVs(ageRow)} of the field`] : null,
    ['Games with box scores', `${rows.reduce((a, r) => a + r.g, 0)} in ${rows.length} events`],
  ].filter(Boolean);
  const verdict = `<section class="rp-card rp-verdict" aria-labelledby="rp-arch">
    <div><div class="rp-eyebrow">Scouting report · ${R.main.length} ${R.mainCat === 'Senior' ? 'senior ' : ''}event${R.main.length === 1 ? '' : 's'} in the last 12 months</div>
      <h2 id="rp-arch">${esc(R.arch)}</h2><p class="rp-head">${head}</p></div>
    <div class="rp-facts">${facts.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}</div>
  </section>`;

  // strengths and gaps
  const awards = {};
  ((DB.honours || {})[pid] || []).forEach(h => (h.awards || []).forEach(a => { const k = RP_AWARD_SKILL[a]; if (k) (awards[k] = awards[k] || []).push(h.year + ' ' + rpHonName(h, rows)); }));
  const tag = (x, good) => {
    const vals = ['Youth', 'Development', 'Senior'].map(c => x.cat[c]).filter(v => v != null);
    const t = R.travel.find(t => t.x === x);
    if (!good) return t && t.drop >= 25 ? `<span class="rp-tag">Was ${rpOrd(rpPer100(t.hi))} of 100 in ${RP_LV_NOUN[t.from]}</span>` : '';
    if (vals.length >= 2 && Math.min(...vals) >= 60) return '<span class="rp-tag">Holds at every level</span>';
    if (t && x.cat.Senior != null && -t.drop >= 15) return '<span class="rp-tag">Better against seniors</span>';
    return '';
  };
  const item = (x, kind) => {
    const v = x.now != null ? x.now : x.cat.Senior;
    const aw = awards[x.s.k] ? ` Led an event in ${RP_AWARD_WORD[x.s.k]} ${awards[x.s.k].length === 1 ? 'once' : awards[x.s.k].length + ' times'} (${esc(awards[x.s.k].join(', '))}).` : '';
    return `<div class="rp-item"><div class="rp-pc" style="${rpCell(v)}"><span class="rp-hash">#</span>${rpPer100(v)}<small>OF 100</small></div>
      <div class="rp-nm">${x.s.n}<span class="rp-tag">${rpGrade(v)}</span>${tag(x, kind === 's')}</div>
      <p>${rpCap(rpEvidence(x.s.k, R.main, W))} in ${rpEvNames(R.main)}. Ranked ${rpEvRanks(R.main, x.s)}.${aw}</p></div>`;
  };
  const sw = `<section class="rp-card"><h2>Strengths and gaps</h2>
    <p class="rp-lede">Graded against ${R.mainCat === 'Senior' ? 'senior events' : `${W.his} own age group`} over the last 12 months. Each one names the numbers behind it and whether it holds at every level.</p>
    <div class="rp-sw">
      <div><h3><i style="background:var(--rp-dv-4)"></i>What ${W.he} does well</h3>${R.strengths.map(x => item(x, 's')).join('') || '<p class="rp-lede">No skill ranks inside the top 35 of every 100 at this level yet.</p>'}</div>
      <div><h3><i style="background:var(--rp-dv-0)"></i>What holds ${W.him} back</h3>${R.gaps.slice(0, 4).map(x => item(x, 'w')).join('') || '<p class="rp-lede">Nothing ranks below the middle of the field.</p>'}</div>
    </div></section>`;

  // levels: the table, the chart and the same event year after year
  const cats = ['Youth', 'Development', 'Senior'];
  const key = c => `<span class="rp-key" style="background:${RP_LV[c].c};${RP_LV[c].sh === 'circle' ? 'border-radius:50%' : RP_LV[c].sh === 'diamond' ? 'transform:rotate(45deg) scale(.8)' : ''}"></span>`;
  const tbl = `<table class="rp-ht"><thead><tr><th>Skill</th>${cats.map(c => `<th>${key(c)}${c}<br><span>${R.byCat[c].length} event${R.byCat[c].length === 1 ? '' : 's'}</span></th>`).join('')}<th>Last 12<br>months</th></tr></thead><tbody>` +
    R.prof.map(x => `<tr class="rp-hrow${x.s.k === RP.metric ? ' on' : ''}" data-rpk="${x.s.k}"><td><button type="button" data-rpm="${x.s.k}">${x.s.n}</button></td>${cats.map(c => x.cat[c] == null ? '<td class="na">–</td>' : `<td style="${rpCell(x.cat[c])}" title="${rpEvRanks(R.byCat[c], x.s, 8)}">#${rpPer100(x.cat[c])}</td>`).join('')}${x.now == null ? '<td class="na">–</td>' : `<td style="${rpCell(x.now)}" title="${rpEvRanks(R.main, x.s, 8)}">#${rpPer100(x.now)}</td>`}</tr>`).join('') + '</tbody></table>';
  const impS = RP_SKILLS.find(s => s.k === 'impact');
  const yoy = R.yoy.map(l => {
    const nm = esc(l[0].name.replace(/ \d{4}$/, ''));
    const steps = l.map((r, i) => `${i ? '<span class="rp-arrow">→</span>' : ''}<span>${r.y} <b>${rpRk(r, impS)}</b></span>`).join(' ');
    const a = l[l.length - 2], b = l[l.length - 1], d = (rpSp(b, impS) ?? 0) - (rpSp(a, impS) ?? 0);
    return `<div class="rp-yrow"><div><b>${nm}</b><small>${d >= 0 ? 'Better' : 'Worse'} last time · TS ${rpF1(a.ts)}% → ${rpF1(b.ts)}%, ${rpF1(a.ppg)} → ${rpF1(b.ppg)} PTS</small></div><div class="rp-steps">${steps}</div></div>`;
  }).join('');
  const lv = `<section class="rp-card"><h2>How ${W.he} grades at each level</h2>
    <p class="rp-lede">Where ${W.he} ranks among every 100 rotation players at each level: #1 is the best, #50 the middle of the field, #100 the last. Events of different sizes are scaled to 100 and blended by minutes; hover a cell for ${W.his} actual rank in each event. Pick a row to trace it in the chart.</p>
    <div class="rp-lvl">
      <div><div class="rp-htw">${tbl}</div><div class="rp-scale" aria-hidden="true"><span>Near the bottom</span>${[0, 1, 2, 3, 4].map(b => `<i style="background:var(--rp-dv-${b})"></i>`).join('')}<span>Near the top</span></div></div>
      <div>
        <div class="rp-chips" role="group" aria-label="Skill to trace">${RP_SKILLS.map(s => `<button type="button" data-rpm="${s.k}" aria-pressed="${s.k === RP.metric}">${s.n}</button>`).join('')}</div>
        <div class="rp-legend">${cats.map(c => `<span>${rpMarker(RP_LV[c].sh, 7, 7, 5, RP_LV[c].c, true)}${c}</span>`).join('')}<span class="faint">Hollow: field under 20 players</span></div>
        <div class="rp-legend" id="rp-newest"></div>
        <div class="rp-chart"><svg id="rp-arc" viewBox="0 0 640 290" role="img"></svg><div class="rp-tip" id="rp-tip"></div></div>
      </div>
    </div>
    ${yoy ? `<div class="rp-yoy"><h3>Same event, year after year</h3><p class="rp-lede">The cleanest read on development: the same competition, so the field is comparable. ${W.His} overall-impact rank each time.</p>${yoy}</div>` : ''}
  </section>`;

  const shots = rpShots(R);
  return pvSec('Report', 'Written from the numbers · ' + rows.length + ' events', '',
    `<div class="rp">${verdict}${sw}${lv}${shots}${rpNotes(R)}
    <section class="rp-card"><details><summary>Every event behind the report</summary>${rpTable(R)}</details>
    <details class="rp-method"><summary>How the report is built</summary>
      <p>Ranks are counted inside each event, among the players who played at least 40% of the busiest player's games and 10 minutes a game (shooting ranks only count players with at least five attempts). Skills built from more than one stat, such as playmaking, rank the players on all of those stats together. A field of fewer than 20 players (the FIBA qualifiers, for example) is shown in the table but left out of the grades.</p>
      <p>Events have different sizes, so to blend them a rank is scaled to a field of 100: 8th of 83 becomes about 10th of every 100. Raw numbers are never averaged across events of different strength; only these scaled ranks are, weighted by minutes.</p>
      <p>"Last 12 months" runs back from ${W.his} newest graded event and weights each event by minutes, halving its weight every six months. A strength is a skill where ${W.he} ranks inside the top 35 of every 100 at the level ${W.he} plays now (senior when ${W.he} has senior minutes, otherwise ${W.his} age group); a gap is one outside the top 55, or one where ${W.he} ranks 25 places or more lower (per 100) against seniors than in youth or development events.</p>
      <p>The shot profile uses the shot chart of ${W.his} newest event that has one, compared with every shot in that event. Box scores only see steals, blocks and rebounds, so on-ball defence is not graded.</p>
    </details></section></div>`);
}
// "younger than 84%" or "older than 90%": whichever side most of the field is on
const rpAgeVs = r => r.younger >= 50 ? `older than ${r.younger}%` : `younger than ${100 - r.younger}%`;
function rpHonName(h, rows) {
  if (h.short) return h.short;
  const r = h.cid && rows.find(x => x.cid === h.cid);
  return r ? r.name.replace(/ \d{4}$/, '') : (h.comp || '');
}

/* ------------------------------ shot profile ----------------------------- */
const RP_ZN = {PT: 'Paint', ML: 'Left mid-range', MC: 'Top mid-range', MR: 'Right mid-range', C3L: 'Left corner three', C3R: 'Right corner three', W3L: 'Left wing three', T3: 'Top three', W3R: 'Right wing three'};
const RP_GROUPS = [['Paint', ['PT']], ['Mid-range', ['ML', 'MC', 'MR']], ['Corner three', ['C3L', 'C3R']], ['Above-the-break three', ['W3L', 'T3', 'W3R']]];
function rpShots(R) {
  const pid = R.pid, W = R.W;
  if (typeof smHas !== 'function' || !smHas(pid)) return '';
  const wait = msg => `<section class="rp-card"><h2>Shot profile</h2><p class="rp-lede">${msg}</p></section>`;
  if (!SHP_DATA[pid]) { ensurePlayerShots(pid); return wait(SHP_ST[pid] === 'error' ? 'The shot chart could not be loaded.' : 'Loading the shot chart…'); }
  const cid = smComps(pid)[0]; if (!cid) return '';
  if (!SH_DATA[cid]) { ensureShots(cid); return wait(SH_ST[cid] === 'error' ? 'The shot chart could not be loaded.' : 'Loading the shot chart…'); }
  const d = SHP_DATA[pid], S = d.E[cid], LZ = SH_DATA[cid].Z, T = d.T;
  const Z = {}; S.forEach(([x, y, m, t3]) => { const z = smZoneOf(x, y, t3); (Z[z] = Z[z] || [0, 0])[0]++; Z[z][1] += m; });
  const lz = z => LZ[z] || [0, 0];
  const n = S.length, N = Object.values(LZ).reduce((a, v) => a + v[0], 0);
  const games = new Set(S.map(s => s[5])).size;
  // the court: metres to svg, baseline at the top, 30 px a metre
  const k = 30, X = x => (x + 7.5) * k, Yd = dd => dd * k, D = 10;
  const arc = `M${X(-6.6)} 0 L${X(-6.6)} ${Yd(2.99)} A${6.75 * k} ${6.75 * k} 0 0 0 ${X(6.6)} ${Yd(2.99)} L${X(6.6)} 0 Z`;
  const fillOf = z => { const a = Z[z], l = lz(z); if (!a || a[0] < 3 || !l[0]) return 'url(#rp-hatch)'; const df = 100 * (a[1] / a[0] - l[1] / l[0]);
    return df <= -15 ? '#3d82db' : df <= -5 ? '#23406a' : df < 5 ? '#383a3f' : df < 15 ? '#6e2b2d' : '#e05555'; };
  const rect = (x0, x1, d0, d1) => `x="${X(x0)}" y="${Yd(d0)}" width="${(x1 - x0) * k}" height="${(d1 - d0) * k}"`;
  const regions = [
    ['W3L', rect(-7.5, -2.45, 0, D), 'out'], ['T3', rect(-2.45, 2.45, 0, D), 'out'], ['W3R', rect(2.45, 7.5, 0, D), 'out'],
    ['ML', rect(-7.5, -2.45, 0, D), 'in'], ['MR', rect(2.45, 7.5, 0, D), 'in'], ['MC', rect(-2.45, 2.45, 5.8, D), 'in'],
    ['PT', rect(-2.45, 2.45, 0, 5.8), ''], ['C3L', rect(-7.5, -6.6, 0, 3.13), ''], ['C3R', rect(6.6, 7.5, 0, 3.13), '']];
  const LBL = {PT: [0, 3.4], ML: [-5.1, 2.6], MR: [5.1, 2.6], MC: [0, 7.0], C3L: [-7.05, 1.5], C3R: [7.05, 1.5], W3L: [-5.6, 7.6], T3: [0, 9.0], W3R: [5.6, 7.6]};
  let g = `<defs><clipPath id="rp-cin"><path d="${arc}"/></clipPath><clipPath id="rp-cout"><path clip-rule="evenodd" d="M0 0H450V300H0Z ${arc}"/></clipPath>
    <pattern id="rp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#2a2f38"/><line x1="0" y1="0" x2="0" y2="6" stroke="#4a5160" stroke-width="2"/></pattern></defs>`;
  regions.forEach(([z, r, c]) => { g += `<rect ${r} fill="${fillOf(z)}" stroke="#0e1320" stroke-width="2" ${c ? `clip-path="url(#rp-c${c})"` : ''}><title>${RP_ZN[z]}: ${Z[z] ? Z[z][1] + '/' + Z[z][0] : '0/0'}</title></rect>`; });
  g += `<path d="${arc}" fill="none" stroke="#c9d2e3" stroke-width="1.5" opacity=".75"/><rect ${rect(-2.45, 2.45, 0, 5.8)} fill="none" stroke="#c9d2e3" stroke-width="1.5" opacity=".75"/>
    <circle cx="${X(0)}" cy="${Yd(1.575)}" r="${0.225 * k}" fill="none" stroke="#f0a35a" stroke-width="2"/><line x1="${X(-0.9)}" x2="${X(0.9)}" y1="${Yd(1.2)}" y2="${Yd(1.2)}" stroke="#c9d2e3" stroke-width="2"/>`;
  Object.entries(LBL).forEach(([z, [x, dd]]) => { const a = Z[z] || [0, 0], l = lz(z); if (!a[0] && z.startsWith('C3')) return;
    const small = z.startsWith('C3');
    g += `<text x="${X(x)}" y="${Yd(dd)}" text-anchor="middle" font-size="${small ? 11 : 14}" font-weight="700" fill="#fff" font-family="Archivo Narrow, Archivo, sans-serif">${a[1]}/${a[0]}</text>`;
    if (!small && a[0]) g += `<text x="${X(x)}" y="${Yd(dd) + 14}" text-anchor="middle" font-size="11" fill="#c9d2e3">${rpPct(a[1], a[0])} · event ${rpPct(l[1], l[0])}</text>`; });
  const grp = RP_GROUPS.map(([nm, zs]) => { const a = zs.reduce((s, z) => s + (Z[z] ? Z[z][0] : 0), 0), m = zs.reduce((s, z) => s + (Z[z] ? Z[z][1] : 0), 0);
    const la = zs.reduce((s, z) => s + lz(z)[0], 0), lm = zs.reduce((s, z) => s + lz(z)[1], 0); return {nm, a, m, sh: 100 * a / n, lsh: N ? 100 * la / N : 0, fg: a ? 100 * m / a : null, lfg: la ? 100 * lm / la : null}; });
  const mx = Math.max(1, ...grp.map(x => Math.max(x.sh, x.lsh)));
  const diet = `<table class="rp-diet"><thead><tr><th>Where ${W.his} shots come from</th><th>Share of shots<br><span>${W.him} · <em>event</em></span></th><th class="r">Made</th><th class="r">FG%</th><th class="r">Event</th></tr></thead><tbody>` +
    grp.map(x => `<tr><td>${x.nm}</td><td><div class="rp-bars"><i class="me" style="width:${x.sh / mx * 100}%"></i><i class="lg" style="width:${x.lsh / mx * 100}%"></i></div><span class="rp-mut">${Math.round(x.sh)}% · ${Math.round(x.lsh)}%</span></td><td class="r">${x.m}/${x.a}</td><td class="r"><b>${x.fg == null ? '–' : Math.round(x.fg) + '%'}</b></td><td class="r rp-mut">${x.lfg == null ? '–' : Math.round(x.lfg) + '%'}</td></tr>`).join('') + '</tbody></table>';
  const B = [];
  const more = grp.filter(x => x.sh - x.lsh >= 8).map(x => x.nm.toLowerCase()), less = grp.filter(x => x.lsh - x.sh >= 8).map(x => x.nm.toLowerCase());
  if (more.length || less.length) B.push(`<b>Shot diet:</b> ${more.length ? `takes more ${more.join(' and ')} shots than the event does` : ''}${more.length && less.length ? ', and ' : ''}${less.length ? `fewer ${less.join(' and ')} shots` : ''}.`);
  const zs = Object.keys(RP_ZN).filter(z => Z[z] && Z[z][0] >= 5 && lz(z)[0]).map(z => ({z, a: Z[z][0], m: Z[z][1], d: 100 * (Z[z][1] / Z[z][0] - lz(z)[1] / lz(z)[0])})).sort((a, b) => b.d - a.d);
  if (zs.length) { const h = zs[0]; if (h.d > 5) B.push(`<b>Hot spot:</b> ${RP_ZN[h.z].toLowerCase()}, ${h.m}/${h.a} against ${rpPct(lz(h.z)[1], lz(h.z)[0])} for the event.`);
    const c = zs[zs.length - 1]; if (c.d < -5 && c !== h) B.push(`<b>Cold spot:</b> ${RP_ZN[c.z].toLowerCase()}, ${c.m}/${c.a} against ${rpPct(lz(c.z)[1], lz(c.z)[0])}.`); }
  const three = grp[2].a + grp[3].a, threeM = grp[2].m + grp[3].m;
  if (three >= 5) B.push(`<b>From three:</b> ${threeM}/${three} (${rpPct(threeM, three)}); ${three >= n / 2 ? `more than half of ${W.his} shots` : Math.round(100 * three / n) + `% of ${W.his} shots`}.`);
  const od = S.filter(s => ['pullupjumpshot', 'stepbackjumpshot', 'turnaroundjumpshot', 'fadeaway', 'floatingjumpshot'].includes(T[s[4]]));
  const dr = S.filter(s => ['drivinglayup', 'eurostep', 'reverselayup'].includes(T[s[4]]));
  B.push(`<b>How ${W.he} gets them:</b> ${od.length} off-the-dribble jumpers (pull-ups, step-backs, floaters, turnarounds), ${od.filter(s => s[2]).length} made; ${dr.length} drives finished at the rim, ${dr.filter(s => s[2]).length} made.`);
  const mid = grp[1]; if (n >= 15 && mid.a <= Math.max(2, n * 0.06)) B.push(`<b>Skips the mid-range:</b> ${mid.a} of ${n} shots.`);
  R.shot = {n, od};
  return `<section class="rp-card"><h2>Shot profile</h2>
    <p class="rp-lede">${esc(smShortRaw(cid))} · ${n} shots in ${games} game${games === 1 ? '' : 's'}, set against all ${N.toLocaleString('en')} shots in the event. Small samples swing hard, so read the colour with the counts. <a href="#/p/${pid}/shots">Open the full shot map</a></p>
    <div class="rp-shots">
      <div class="rp-stage"><svg viewBox="0 0 450 300" role="img" aria-label="Shooting by zone">${g}</svg>
        <div class="rp-zkey"><span>Colder than the event</span>${['#3d82db', '#23406a', '#383a3f', '#6e2b2d', '#e05555'].map(c => `<i style="background:${c}"></i>`).join('')}<span>Hotter</span><span class="r">Hatched: under 3 shots</span></div></div>
      <div>${diet}<ul class="rp-bullets">${B.map(b => `<li>${b}</li>`).join('')}</ul></div>
    </div></section>`;
}

/* ------------------------------ scout notes ------------------------------ */
function rpNotes(R) {
  const N = [], W = R.W, t = rpLine(R.main), get = k => R.prof.find(x => x.s.k === k), o100 = v => v == null ? '–' : rpOrd(rpPer100(v)) + ' of 100';
  const latest = R.rows[R.rows.length - 1];
  const older = R.graded.filter(r => r.cat !== 'Senior' && r.older != null && r.older >= 1.5 && R.last - r.t <= 400 * RP_DAY);
  const younger = R.graded.filter(r => r.older != null && r.older <= -1.5);
  let ctx = '';
  if (latest.younger != null) ctx += `At ${esc(latest.name)} ${W.he} was ${latest.age}, <b>${rpAgeVs(latest)}</b> of the players there (median age ${rpF1(latest.fieldAge)}). `;
  if (younger.length >= 2) ctx += `${W.He} has played against fields at least 18 months older in ${younger.length} events; the widest gaps: ${[...younger].sort((a, b) => a.older - b.older).slice(0, 3).map(r => `${esc(r.name)} at ${r.age}, field median ${rpF1(r.fieldAge)}`).join('; ')}. `;
  if (older.length) ctx += `Read ${W.his} ${older.map(r => esc(r.name)).join(' and ')} numbers with care: ${W.he} was <b>${rpF1(older[0].older)} years older</b> than the median player.`;
  N.push(['Age and level', ctx || 'No age data for the field in these events.']);
  const sc = get('scoring'), ef = get('eff'), th = get('three'), ft = get('ft');
  N.push(['Scoring', `Against ${R.mainCat === 'Senior' ? 'senior teams' : `${W.his} age group`} over the last 12 months: <b>${rpEvidence('scoring', R.main, W)}</b> (about ${sc.now != null ? rpOf100(sc.now) : '–'}), ${rpF1(t.ts)}% true shooting (${o100(ef.now)}). ` +
    (th.now != null ? `From three ${W.he} is ${t.tpm}/${t.tpa} (${o100(th.now)}); ` : `Too few threes to grade (${t.tpm}/${t.tpa}); `) + (ft.now != null ? `at the line ${t.ftm}/${t.fta} (${o100(ft.now)}).` : `${t.ftm}/${t.fta} at the line.`) +
    (R.shot ? ` On the shot chart, ${R.shot.od.length} of ${W.his} ${R.shot.n} shots were off-the-dribble jumpers.` : '')]);
  const pl = get('play'), ca = get('care');
  N.push(['Playmaking', `${rpCap(rpEvidence('play', R.main, W))} (about ${pl.now != null ? rpOf100(pl.now) : '–'}). ${rpCap(rpEvidence('care', R.main, W))} (${o100(ca.now)} for ball security). ` +
    (pl.cat.Youth != null && pl.cat.Senior != null ? `As a youth player ${W.he} ranked about ${rpOrd(rpPer100(pl.cat.Youth))} of every 100 as a passer; at senior level ${rpOrd(rpPer100(pl.cat.Senior))}.` : '')]);
  const df = get('def'), rb = get('reb');
  N.push(['Defence and rebounding', `${rpCap(rpEvidence('def', R.main, W))} (about ${df.now != null ? rpOf100(df.now) : '–'} for defensive activity); ${rpEvidence('reb', R.main, W)} (${o100(rb.now)}).`]);
  const imp = RP_SKILLS.find(s => s.k === 'impact');
  const ch = R.yoy.map(l => ({a: l[l.length - 2], b: l[l.length - 1]})).map(x => Object.assign(x, {d: rpSp(x.b, imp) - rpSp(x.a, imp)})).filter(x => !isNaN(x.d) && R.last - x.b.t <= 3 * 366 * RP_DAY);
  const up = [...ch].sort((a, b) => b.d - a.d)[0], dn = [...ch].sort((a, b) => a.d - b.d)[0];
  let dev = '';
  if (up && up.d > 0) dev += `Biggest step forward: <b>${esc(up.a.name)} → ${up.b.y}</b>, overall-impact rank ${rpRk(up.a, imp)} → ${rpRk(up.b, imp)}, true shooting ${rpF1(up.a.ts)}% → ${rpF1(up.b.ts)}%. `;
  if (dn && dn.d < -10) dev += `Step back: ${esc(dn.a.name)} → ${dn.b.y}, ${rpRk(dn.a, imp)} → ${rpRk(dn.b, imp)}.`;
  N.push(['Development', dev || 'Not enough repeat events to compare yet.']);
  const focus = R.gaps.slice(0, 2).map(x => x.s.n.toLowerCase());
  const hon = ((DB.honours || {})[R.pid] || []).map(h => `${h.year} ${rpHonName(h, R.rows)}${h.champ ? ', champions' : ''}${h.awards && h.awards.length ? ': ' + h.awards.join(', ') : h.placing ? ': ' + h.placing : ''}${h.stat ? ' (' + h.stat + ')' : ''}`);
  N.push(['What to work on', (focus.length ? `The report points at <b>${focus.join(' and ')}</b>: the gaps that rank lowest at the level ${W.he} plays now, or that drop away against older players.` : `No clear gap at ${W.his} current level.`) +
    (hon.length ? `<span class="rp-hon">${hon.map(h => `<span>${esc(h)}</span>`).join('')}</span>` : '')]);
  return `<section class="rp-card"><h2>Scout notes</h2><p class="rp-lede">Written from the numbers above. Nothing here is typed by hand, so every profile gets a report as soon as it has box scores.</p>
    <div class="rp-notes">${N.map(([h, p]) => `<div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></section>`;
}

function rpTable(R) {
  const imp = RP_SKILLS.find(s => s.k === 'impact');
  return `<div class="rp-ev"><table><thead><tr><th>Event</th><th>Team</th><th>Level</th><th>Age</th><th>G</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th><th>TOV</th><th>FG</th><th>3P</th><th>FT</th><th>TS%</th><th>BPM</th><th>Impact rank</th><th>Field</th></tr></thead><tbody>` +
    [...R.rows].reverse().map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.team || '')}</td><td>${r.cat}</td><td>${r.age ?? '–'}</td><td>${r.g}</td><td>${rpF1(r.mpg)}</td><td>${rpF1(r.ppg)}</td><td>${rpF1(r.rpg)}</td><td>${rpF1(r.apg)}</td><td>${rpF1(r.tpg)}</td><td>${r.fgm}/${r.fga}</td><td>${r.tpm}/${r.tpa}</td><td>${r.ftm}/${r.fta}</td><td>${rpF1(r.ts)}</td><td>${r.bpm == null ? '–' : (r.bpm > 0 ? '+' : '') + rpF1(r.bpm)}</td><td class="${rpUsable(r) ? '' : 'dim'}">${rpRk(r, imp)}${rpUsable(r) ? '' : ' *'}</td><td>${r.pool}</td></tr>`).join('') +
    `</tbody></table></div><p class="rp-lede">* Not graded: a field under 20 rotation players, or below the minutes needed to be one of them.</p>`;
}

/* the development arc: one point per event, his rank for the chosen skill, scaled to a field of 100 */
function rpDrawArc() {
  const svg = document.getElementById('rp-arc'), R = RP.R; if (!svg || !R) return;
  const s = RP_SKILLS.find(x => x.k === RP.metric);
  const W = 640, H = 290, L = 34, Rt = 14, T = 12, B = 34;
  const pts = R.rows.filter(r => r.q).map(r => ({r, v: rpSp(r, s), small: r.pool < 20})).filter(p => p.v != null);
  const ts = R.rows.map(r => r.t), t0 = Math.min(...ts), t1 = Math.max(...ts), span = Math.max(t1 - t0, RP_DAY);
  const X = t => L + (W - L - Rt) * (t - t0) / span, Y = v => T + (H - T - B) * (1 - v / 100);
  let g = '';
  [1, 25, 50, 75, 100].forEach(rk => { const v = 100 - (rk - 1) / 0.99; g += `<line x1="${L}" x2="${W - Rt}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)" stroke-width="1" ${rk === 50 ? '' : 'stroke-dasharray="2 4"'}/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--text-faint)">#${rk}</text>`; });
  g += `<text x="${L + 4}" y="${Y(50) - 5}" font-size="11" fill="var(--text-faint)">middle of the field</text>`;
  const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
  for (let y = y0; y <= y1 + 1; y++) { const t = Date.UTC(y, 0, 1); if (t < t0 - 60 * RP_DAY || t > t1 + 30 * RP_DAY) continue; g += `<line x1="${X(t)}" x2="${X(t)}" y1="${H - B}" y2="${H - B + 5}" stroke="var(--text-faint)"/><text x="${X(t)}" y="${H - B + 18}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${y}</text>`; }
  ['Youth', 'Development', 'Senior'].forEach(c => {
    const ps = pts.filter(p => p.r.cat === c && !p.small); if (ps.length < 2) return;
    g += `<polyline fill="none" stroke="${RP_LV[c].c}" stroke-width="2" stroke-linejoin="round" points="${ps.map(p => X(p.r.t) + ',' + Y(p.v)).join(' ')}"/>`;
  });
  pts.forEach(p => { g += rpMarker(RP_LV[p.r.cat].sh, X(p.r.t), Y(p.v), 5.5, RP_LV[p.r.cat].c, false, p.small); });
  const lp = pts[pts.length - 1];
  const nw = document.getElementById('rp-newest'); if (nw) nw.innerHTML = lp ? `Newest: <b>${rpRk(lp.r, s)} at ${esc(lp.r.name)}</b>` : '';
  if (lp) g += `<circle cx="${X(lp.r.t)}" cy="${Y(lp.v)}" r="10" fill="none" stroke="var(--text)" stroke-width="1.5"/>`;
  svg.innerHTML = g;
  svg.setAttribute('aria-label', `${s.n}: rank per 100 players in each event over time`);
  const tip = document.getElementById('rp-tip');
  svg.onpointermove = e => {
    const bb = svg.getBoundingClientRect(), k = W / bb.width, mx = (e.clientX - bb.left) * k, my = (e.clientY - bb.top) * k;
    let best = null, bd = 1e9; pts.forEach(p => { const d = Math.hypot(X(p.r.t) - mx, Y(p.v) - my); if (d < bd) { bd = d; best = p; } });
    if (!best || bd > 40) { tip.classList.remove('on'); return; }
    const r = best.r;
    tip.innerHTML = `<div class="t1">${esc(r.name)}</div><div class="t0">${esc(r.team || '')} · ${r.cat}${r.age != null ? ' · age ' + r.age : ''}</div>
      <div class="rw"><span>${s.n}</span><b>${rpRk(r, s)}</b></div><div class="rw"><span>Per 100 players</span><b>about ${rpOrd(rpPer100(best.v))}</b></div>
      <div class="rw"><span>Line</span><b>${rpF1(r.ppg)} PTS · ${rpF1(r.rpg)} REB · ${rpF1(r.apg)} AST</b></div>
      <div class="rw"><span>Shooting</span><b>${r.fgm}/${r.fga} FG · ${r.tpm}/${r.tpa} 3P</b></div>
      <div class="rw"><span>Field</span><b>${r.pool} rotation players${best.small ? ' (too few to grade)' : ''}</b></div>`;
    const px = X(r.t) / k, py = Y(best.v) / k, tw = 250;
    tip.style.left = Math.max(0, Math.min(px + 14, bb.width - tw)) + 'px'; tip.style.top = Math.max(0, py - 20) + 'px'; tip.classList.add('on');
  };
  svg.onpointerleave = () => tip.classList.remove('on');
}
function reportAfterRender() { if (document.getElementById('rp-arc')) rpDrawArc(); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rpm]'); if (!b) return;
  RP.metric = b.dataset.rpm;
  document.querySelectorAll('.rp-hrow').forEach(tr => tr.classList.toggle('on', tr.dataset.rpk === RP.metric));
  document.querySelectorAll('.rp-chips [data-rpm]').forEach(x => x.setAttribute('aria-pressed', x.dataset.rpm === RP.metric));
  rpDrawArc();
});
