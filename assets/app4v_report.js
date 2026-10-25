/* =========================================================================
   Report — a player profile tab (#/p/<pid>/report): a development report
   written from his numbers, nothing typed by hand per player. It compares the
   player with himself: his own numbers event by event and, above all, in the
   same competition year after year. How he ranks against other players is
   one note near the end (rpAgainst).

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
    impact: `box plus-minus ${sgn(t.bpm, rpF1(t.bpm))}`,
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

/* =========================================================================
   The development report: the player against himself. Every event is one
   point in his own story; the comparisons that carry the report are his own
   numbers then and now, and above all the same competition year after year,
   where the field is the same kind of field. How he ranks against other
   players is kept to one note near the end.
   ========================================================================= */
const RP_MIN_EVENT = 60;          // minutes in an event before its rates are read at all
// the numbers the report follows. better: +1 when higher is better, -1 when lower is, 0 when it is style, not quality
const RP_STATS = [
  {k: 'pts40', n: 'Points per 40', s: 'PTS/40', better: 1, thr: 3, fmt: v => v.toFixed(1),
    get: r => r.pts / r.min * 40},
  {k: 'ts', n: 'True shooting', s: 'TS%', better: 1, thr: 4, fmt: v => v.toFixed(1) + '%', ok: r => r.fga + r.fta >= 25,
    get: r => r.ts},
  {k: 'tp', n: 'Three-point %', s: '3P%', better: 1, thr: 5, fmt: v => v.toFixed(1) + '%', ok: r => r.tpa >= 12,
    get: r => r.tpa ? 100 * r.tpm / r.tpa : null, cnt: r => `${r.tpm}/${r.tpa}`},
  {k: 'tpr', n: 'Threes per shot', s: '3PA share', better: 0, thr: 8, fmt: v => Math.round(v) + '%', ok: r => r.fga >= 25,
    get: r => r.fga ? 100 * r.tpa / r.fga : null},
  {k: 'ft', n: 'Free-throw %', s: 'FT%', better: 1, thr: 8, fmt: v => v.toFixed(0) + '%', ok: r => r.fta >= 10,
    get: r => r.fta ? 100 * r.ftm / r.fta : null, cnt: r => `${r.ftm}/${r.fta}`},
  {k: 'ast40', n: 'Assists per 40', s: 'AST/40', better: 1, thr: 1, fmt: v => v.toFixed(1),
    get: r => r.ast / r.min * 40},
  {k: 'tov', n: 'Turnover rate', s: 'TOV%', better: -1, thr: 3, fmt: v => v.toFixed(1) + '%', ok: r => r.topct != null,
    get: r => r.topct},
  {k: 'reb40', n: 'Rebounds per 40', s: 'REB/40', better: 1, thr: 1.5, fmt: v => v.toFixed(1),
    get: r => r.reb / r.min * 40},
  {k: 'stl40', n: 'Steals per 40', s: 'STL/40', better: 1, thr: 0.7, fmt: v => v.toFixed(1),
    get: r => r.stl / r.min * 40},
  {k: 'mpg', n: 'Minutes a game', s: 'MPG', better: 0, thr: 4, fmt: v => v.toFixed(1),
    get: r => r.mpg},
];
const RP_TREND = ['pts40', 'ts', 'tp', 'ast40', 'tov', 'reb40'];       // the small charts
const RP_PAIR = ['pts40', 'ts', 'tp', 'tpr', 'ft', 'ast40', 'tov', 'reb40', 'stl40', 'mpg'];
const rpStat = k => RP_STATS.find(s => s.k === k);
// a number of his in one event, or null when the event is too small to read it
function rpVal(r, s) {
  if (!r || r.min < RP_MIN_EVENT || (s.ok && !s.ok(r))) return null;
  const v = s.get(r);
  return v == null || isNaN(v) ? null : v;
}
// totals back from the per-game line, for the rates
function rpTotals(r) {
  return Object.assign(r, {pts: r.ppg * r.g, reb: r.rpg * r.g, ast: r.apg * r.g, stl: r.spg * r.g, blk: r.bpg * r.g, tov: r.tpg * r.g});
}
const rpArrow = (d, s) => { const good = s.better === 0 ? 0 : Math.sign(d) * s.better;
  return `<span class="rp-d ${good > 0 ? 'up' : good < 0 ? 'down' : 'flat'}">${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${s.fmt(Math.abs(d)).replace('%', '')}${/%$/.test(s.fmt(1)) ? ' pts' : ''}</span>`; };

/* What changed, read only from his own numbers: for every competition he has played more than once
   (the same kind of field each time), the change from his first edition to his latest, stat by stat. */
function rpDevelop(rows) {
  const tiers = {};
  rows.filter(r => r.min >= RP_MIN_EVENT).forEach(r => (tiers[r.tier] = tiers[r.tier] || []).push(r));
  const reps = Object.values(tiers).filter(l => l.length >= 2).map(l => l.sort((a, b) => a.t - b.t));
  const out = RP_STATS.map(s => {
    const ch = reps.map(l => {
      const ok = l.filter(r => rpVal(r, s) != null); if (ok.length < 2) return null;
      const a = ok[0], b = ok[ok.length - 1];
      return {a, b, d: rpVal(b, s) - rpVal(a, s)};
    }).filter(Boolean);
    const up = ch.filter(c => c.d * (s.better || 1) >= s.thr), down = ch.filter(c => c.d * (s.better || 1) <= -s.thr);
    const best = [...ch].sort((p, q) => q.d * (s.better || 1) - p.d * (s.better || 1));
    return {s, ch, up, down, best: best[0], worst: best[best.length - 1], net: ch.reduce((t, c) => t + c.d * (s.better || 1) / s.thr, 0)};
  });
  return {reps, out};
}
// the pair the "then and now" card compares: the competition he has played over the longest span
function rpPairs(dev) {
  const reps = [...dev.reps].sort((a, b) => (b[b.length - 1].t - b[0].t) - (a[a.length - 1].t - a[0].t) || b[b.length - 1].t - a[a.length - 1].t);
  const out = [];
  if (reps[0]) out.push({a: reps[0][0], b: reps[0][reps[0].length - 1], why: 'the competition he has played over the longest span'});
  // and the latest repeat at his highest level, when that is a different one
  const lvl = ['Senior', 'Development', 'Youth'].find(c => reps.some(l => l[0].cat === c));
  const top = reps.filter(l => l[0].cat === lvl).sort((a, b) => b[b.length - 1].t - a[a.length - 1].t)[0];
  if (top && top !== reps[0]) out.push({a: top[top.length - 2], b: top[top.length - 1], why: 'his latest year to year at the highest level he has played'});
  return out;
}

/* -------------------------------- the tab -------------------------------- */
const RP = {pid: null, metric: 'impact', R: null, trend: null};
function rpTab(pid) {
  const P = RP_DATA[pid];
  if (!P) {
    ensureReport(pid);
    return pvSec('Report', '', '', `<div class="card pv-card"><div class="empty-row"><span class="empty-dot"></span>${RP_ST[pid] === 'error' ? 'The report could not be loaded. Refresh the page to try again.' : 'Writing the report…'}</div></div>`);
  }
  if (RP.pid !== pid) { RP.pid = pid; RP.metric = 'impact'; }
  const R = RP.R = rpBuild(pid, P), W = R.W;
  R.rows.forEach(rpTotals);
  const rows = R.rows, read = rows.filter(r => r.min >= RP_MIN_EVENT);
  const dev = R.dev = rpDevelop(rows);
  const first = rows[0], latest = rows[rows.length - 1];
  const years = [...new Set(rows.map(r => r.y))];
  const sen = rows.find(r => r.cat === 'Senior');

  // --- the story so far
  const imp = dev.out.filter(o => o.s.better !== 0 && o.up.length && o.up.length > o.down.length).sort((a, b) => b.up.length - a.up.length || b.net - a.net);
  const dec = dev.out.filter(o => o.s.better !== 0 && o.down.length && o.down.length > o.up.length).sort((a, b) => b.down.length - a.down.length || a.net - b.net);
  const ex = (o, c) => `${esc(c.a.name)} ${rpCount(o.s, c.a)} → ${esc(c.b.name.replace(/.* (\d{4})$/, '$1'))} ${rpCount(o.s, c.b)}`;
  let story = rows.length === 1 ? `${W.He} has one event with box scores so far: ${esc(first.name)}${first.age != null ? `, at ${first.age}` : ''}.`
    : `${W.He} has ${rows.length} events with box scores over ${years.length} season${years.length === 1 ? '' : 's'}, from ${esc(first.name)}${first.age != null ? ` at ${first.age}` : ''} to ${esc(latest.name)}${latest.age != null ? ` at ${latest.age}` : ''}.`;
  if (sen && sen !== first) story += ` ${W.His} first senior event was ${esc(sen.name)}${sen.age != null ? `, at ${sen.age}` : ''}.`;
  if (imp[0]) story += ` The clearest improvement is ${W.his} ${imp[0].s.n.toLowerCase()}: better in ${rpOfN(imp[0].up.length, imp[0].ch.length)} competition${imp[0].ch.length === 1 ? '' : 's'} ${W.he} has played more than once (${ex(imp[0], imp[0].best)}).`;
  if (dec[0]) story += ` Gone the other way: ${W.his} ${dec[0].s.n.toLowerCase()} (${ex(dec[0], dec[0].worst)}).`;
  if (!dev.reps.length && rows.length > 1) story += ` ${W.He} has not yet played the same competition twice with enough minutes to compare, so the charts below show each event on its own.`;
  const ms = rpMilestones(R);
  const hero = `<section class="rp-card rp-verdict" aria-labelledby="rp-arch">
    <div><div class="rp-eyebrow">Development report · ${years[0]}–${years[years.length - 1]}</div>
      <h2 id="rp-arch">${esc(rpTitle(R, imp, dec))}</h2><p class="rp-head">${story}</p></div>
    <div class="rp-facts">${ms.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}</div>
  </section>`;

  // --- then and now
  const pairs = rpPairs(dev);
  const pairCard = p => {
    const cells = RP_PAIR.map(k => rpStat(k)).map(s => { const a = rpVal(p.a, s), b = rpVal(p.b, s);
      if (a == null && b == null) return '';
      return `<div class="rp-tn"><small>${s.s}</small><span class="v">${a == null ? '–' : s.fmt(a)}<i>→</i><b>${b == null ? '–' : s.fmt(b)}</b></span>${a != null && b != null ? rpArrow(b - a, s) : '<span class="rp-d flat">too few to compare</span>'}</div>`; }).join('');
    return `<div class="rp-pair"><div class="rp-pair-h"><b>${esc(p.a.name)}</b><i>→</i><b>${esc(p.b.name)}</b><span>${p.why.replace('he has', W.he + ' has').replace(/\bhis\b/, W.his)} · age ${p.a.age ?? '–'} → ${p.b.age ?? '–'} · ${p.a.g} → ${p.b.g} games</span></div><div class="rp-tns">${cells}</div></div>`;
  };
  const thenNow = `<section class="rp-card"><h2>Then and now</h2>
    <p class="rp-lede">${W.His} own numbers in the same competition, years apart: the same kind of field both times, so the change is ${W.his}. Arrows are coloured by whether the change helps (threes per shot and minutes are style and role, so they stay grey).</p>
    ${pairs.length ? pairs.map(pairCard).join('') : `<p class="rp-lede">${W.He} has not played the same competition twice yet. The year-by-year charts below still show every event ${W.he} has played.</p>`}
  </section>`;

  // --- what changed
  const chItem = (o, good) => {
    const c = good ? o.best : o.worst;
    const list = o.ch.map(x => `${esc(x.a.name.replace(/ \d{4}$/, ''))} ${x.a.y}→${x.b.y}: ${o.s.fmt(rpVal(x.a, o.s))} → ${o.s.fmt(rpVal(x.b, o.s))}`).join('; ');
    return `<div class="rp-item"><div class="rp-pc ${good ? 'up' : 'down'}">${good ? '▲' : '▼'}<small>${good ? o.up.length : o.down.length} OF ${o.ch.length}</small></div>
      <div class="rp-nm">${o.s.n}</div>
      <p>${good ? 'Better' : 'Worse'} in ${rpOfN(good ? o.up.length : o.down.length, o.ch.length)} competition${o.ch.length === 1 ? '' : 's'} ${W.he} has played more than once. Biggest change: ${esc(c.a.name)} ${rpCount(o.s, c.a)} → ${esc(c.b.name)} ${rpCount(o.s, c.b)}.<span class="rp-sub">${list}</span></p></div>`;
  };
  const changed = `<section class="rp-card"><h2>What has changed</h2>
    <p class="rp-lede">Each competition ${W.he} has played more than once, first edition against latest. A change counts when it is bigger than the normal swing for that number (for example 4 points of true shooting, 5 points of three-point percentage, one assist per 40 minutes).</p>
    <div class="rp-sw">
      <div><h3><i style="background:var(--rp-up)"></i>Improved</h3>${imp.slice(0, 4).map(o => chItem(o, true)).join('') || `<p class="rp-lede">No number has moved up clearly yet in the competitions ${W.he} has repeated.</p>`}</div>
      <div><h3><i style="background:var(--rp-down)"></i>Slipped</h3>${dec.slice(0, 4).map(o => chItem(o, false)).join('') || '<p class="rp-lede">Nothing has clearly gone backwards.</p>'}</div>
    </div></section>`;

  // --- year by year: his own numbers, event by event
  RP.trend = {rows: read};
  const trend = `<section class="rp-card"><h2>Year by year</h2>
    <p class="rp-lede">Every event ${W.he} has played, in order, on ${W.his} own scale. A line joins the editions of one competition (the same kind of field each time); the colour and shape give the level. A hollow point is an event too small to read that number with confidence. Levels are never averaged together.</p>
    <div class="rp-legend">${['Youth', 'Development', 'Senior'].map(c => `<span>${rpMarker(RP_LV[c].sh, 7, 7, 5, RP_LV[c].c, true)}${c}</span>`).join('')}</div>
    <div class="rp-trends">${RP_TREND.map(k => `<div class="rp-trend"><div class="rp-trend-h"><b>${rpStat(k).n}</b><span id="rp-tl-${k}"></span></div><div class="rp-chart"><svg id="rp-t-${k}" viewBox="0 0 300 150" role="img" aria-label="${rpStat(k).n}, event by event"></svg></div></div>`).join('')}<div class="rp-tip" id="rp-ttip"></div></div>
  </section>`;

  // --- same competition, year after year: the cleanest read
  const sameEv = dev.reps.length ? `<section class="rp-card"><h2>Same competition, year after year</h2>
    <p class="rp-lede">The cleanest read on development: the same competition, so the field is the same kind of field each time. Each change is against ${W.his} previous edition.</p>
    ${[...dev.reps].sort((a, b) => b[b.length - 1].t - a[a.length - 1].t).map(l => rpRepTable(l)).join('')}</section>` : '';

  const shots = rpShotsDev(R);
  const bests = rpBests(R);
  return pvSec('Report', 'Development · ' + rows.length + ' events', '',
    `<div class="rp">${hero}${thenNow}${changed}${trend}${sameEv}${shots}${bests}${rpNotesDev(R, imp, dec)}${rpAgainst(R)}
    <section class="rp-card"><details><summary>Every event behind the report</summary>${rpTable(R)}</details>
    <details class="rp-method"><summary>How the report is built</summary>
      <p>The report compares ${W.him} with ${W.him}self. Rates (per 40 minutes, per shot, per possession) are read from each event on its own, and only from an event where ${W.he} played ${RP_MIN_EVENT} minutes or more; percentages need enough attempts (12 threes, 10 free throws, 25 shots for true shooting). Numbers from events of different levels are shown side by side, never averaged together.</p>
      <p>"What has changed" looks at each competition ${W.he} has played more than once and compares ${W.his} first edition with ${W.his} latest. A change counts when it is bigger than the usual swing for that number: 3 points per 40, 4 points of true shooting, 5 of three-point percentage, 8 of free-throw percentage, 1 assist or 1.5 rebounds per 40, 3 points of turnover rate, 0.7 steals per 40.</p>
      <p>The one comparison with other players, near the end, ranks ${W.him} inside each event among its rotation players (40% of the games and 10 minutes a game). Shot charts start with the 2026 competitions.</p>
    </details></section></div>`);
}
const rpOfN = (a, n) => n === 1 ? 'the one' : a === n ? `all ${n}` : `${a} of the ${n}`;
function rpCount(s, r) {
  const v = rpVal(r, s); if (v == null) return '–';
  return s.cnt ? `${s.cnt(r)} (${s.fmt(v)})` : s.fmt(v);
}
// a short title from his own trajectory
function rpTitle(R, imp, dec) {
  const n = R.rows.length, lv = [...new Set(R.rows.map(r => r.cat))];
  const climb = lv.includes('Senior') && (lv.includes('Youth') || lv.includes('Development'));
  if (n === 1) return 'One event so far';
  if (!R.dev.reps.length) return 'Early days';
  if (imp.length && !dec.length) return climb ? 'Rising through the levels' : 'On the way up';
  if (imp.length > dec.length) return climb ? 'Climbing, with work still to do' : 'Improving, with work still to do';
  if (dec.length > imp.length) return 'A harder stretch';
  return climb ? 'Holding steady through the levels' : 'Holding steady';
}
function rpMilestones(R) {
  const rows = R.rows, read = rows.filter(r => r.min >= RP_MIN_EVENT), F = [];
  const lvls = ['Youth', 'Development', 'Senior'].filter(c => rows.some(r => r.cat === c));
  F.push(['Levels played', lvls.join(' → ') || '–']);
  const nat = rows.filter(r => /^FIBA/.test(r.name));
  if (nat.length) F.push(['Malaysia (FIBA)', nat.map(r => esc(r.name)).join(', ')]);
  const top = (k, lab) => { const s = rpStat(k), c = read.filter(r => rpVal(r, s) != null).sort((a, b) => rpVal(b, s) - rpVal(a, s))[0]; if (c) F.push([lab, `${rpCount(s, c)} · ${esc(c.name)}`]); };
  const pg = read.length ? [...read].sort((a, b) => b.ppg - a.ppg)[0] : null;
  if (pg) F.push(['Most points a game', `${rpF1(pg.ppg)} · ${esc(pg.name)}`]);
  top('ts', 'Best true shooting');
  const m0 = read[0], m1 = read[read.length - 1];
  if (m0 && m1 && m0 !== m1) F.push(['Minutes a game', `${rpF1(m0.mpg)} → ${rpF1(m1.mpg)}`]);
  F.push(['Games with box scores', `${rows.reduce((a, r) => a + r.g, 0)} in ${rows.length} events`]);
  return F;
}
// one competition he has played more than once: each edition, with the change from the one before
function rpRepTable(l) {
  const cols = ['pts40', 'ts', 'tp', 'tpr', 'ast40', 'tov', 'reb40', 'mpg'].map(rpStat);
  return `<div class="rp-rep"><h3>${esc(l[0].name.replace(/ \d{4}$/, ''))}</h3><div class="rp-ev"><table><thead><tr><th>Year</th><th>Team</th><th>Age</th><th>G</th>${cols.map(s => `<th>${s.s}</th>`).join('')}</tr></thead><tbody>` +
    l.map((r, i) => `<tr><td>${r.y}</td><td>${esc(r.team || '')}</td><td>${r.age ?? '–'}</td><td>${r.g}</td>${cols.map(s => { const v = rpVal(r, s), pv = i ? rpVal(l[i - 1], s) : null;
      return `<td>${v == null ? '<span class="dim">–</span>' : (s.cnt ? `<span class="dim">${s.cnt(r)}</span> ` : '') + s.fmt(v)}${v != null && pv != null ? rpArrow(v - pv, s) : ''}</td>`; }).join('')}</tr>`).join('') +
    '</tbody></table></div></div>';
}
// career bests: his best event for each number, and his single-game highs
function rpBests(R) {
  const W = R.W, read = R.rows.filter(r => r.min >= RP_MIN_EVENT), cells = [];
  ['pts40', 'ts', 'tp', 'ft', 'ast40', 'reb40', 'stl40'].map(rpStat).forEach(s => {
    const c = read.filter(r => rpVal(r, s) != null).sort((a, b) => (rpVal(b, s) - rpVal(a, s)) * (s.better || 1))[0];
    if (c) cells.push(`<div class="rp-best"><small>${s.n}</small><b>${rpCount(s, c)}</b><span>${esc(c.name)}</span></div>`);
  });
  let hi = '';
  try {
    const H = typeof careerHighs === 'function' ? careerHighs(R.pid) : {};
    const lab = {pts: 'Points', reb: 'Rebounds', ast: 'Assists'};
    hi = Object.keys(lab).filter(k => H[k]).map(k => `<div class="rp-best"><small>${lab[k]} in a game</small><b>${H[k].v}</b><span>${esc(H[k].c.label || H[k].c.name)}${H[k].g.date ? ' · ' + fmtDateShort(H[k].g.date) : ''}</span></div>`).join('');
  } catch (e) { hi = ''; }
  if (!cells.length && !hi) return '';
  return `<section class="rp-card"><h2>Career bests</h2><p class="rp-lede">${W.His} best event for each number (events with enough minutes and attempts to count), and ${W.his} single-game highs from the box scores.</p>
    <div class="rp-bests">${hi}${cells.join('')}</div></section>`;
}

/* ------------------------- shot profile, event by event ------------------------- */
function rpShotsDev(R) {
  const pid = R.pid, W = R.W;
  if (typeof smHas !== 'function' || !smHas(pid)) return '';
  const wait = msg => `<section class="rp-card"><h2>Shooting, event by event</h2><p class="rp-lede">${msg}</p></section>`;
  if (!SHP_DATA[pid]) { ensurePlayerShots(pid); return wait(SHP_ST[pid] === 'error' ? 'The shot chart could not be loaded.' : 'Loading the shot chart…'); }
  const cids = smComps(pid).slice().reverse();      // oldest first
  const miss = cids.filter(c => !SH_DATA[c]);
  if (miss.length) { miss.forEach(ensureShots); return wait(miss.some(c => SH_ST[c] === 'error') ? 'The shot chart could not be loaded.' : 'Loading the shot chart…'); }
  const d = SHP_DATA[pid];
  const G = [['Paint', ['PT']], ['Mid-range', ['ML', 'MC', 'MR']], ['Corner 3', ['C3L', 'C3R']], ['Above-break 3', ['W3L', 'T3', 'W3R']]];
  const rows = cids.map(cid => {
    const S = d.E[cid], Z = {}; S.forEach(([x, y, m, t3]) => { const z = smZoneOf(x, y, t3); (Z[z] = Z[z] || [0, 0])[0]++; Z[z][1] += m; });
    const n = S.length, m = S.reduce((t, s) => t + s[2], 0);
    const exp = S.reduce((t, s) => { const z = smZoneOf(s[0], s[1], s[3]); return t + (SH_DATA[cid].LZ[z] || 0); }, 0) / (n || 1);
    return {cid, n, m, exp, g: G.map(([nm, zs]) => { const a = zs.reduce((t, z) => t + (Z[z] ? Z[z][0] : 0), 0), mm = zs.reduce((t, z) => t + (Z[z] ? Z[z][1] : 0), 0); return {a, m: mm}; })};
  });
  if (!rows.length) return '';
  const first = rows[0], last = rows[rows.length - 1];
  const B = [];
  if (rows.length > 1) {
    const share = (r, i) => 100 * r.g[i].a / (r.n || 1);
    const moves = G.map(([nm], i) => ({nm, d: share(last, i) - share(first, i)})).filter(x => Math.abs(x.d) >= 8).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    if (moves.length) B.push(`<b>Shot diet:</b> from ${esc(smShortRaw(first.cid))} to ${esc(smShortRaw(last.cid))}, ${moves.map(x => `${x.nm.toLowerCase()} ${x.d > 0 ? 'up' : 'down'} ${Math.round(Math.abs(x.d))} points of ${W.his} shots`).join(', ')}.`);
    const t3 = r => ({a: r.g[2].a + r.g[3].a, m: r.g[2].m + r.g[3].m});
    const a = t3(first), b = t3(last);
    if (a.a >= 8 && b.a >= 8) B.push(`<b>From three:</b> ${a.m}/${a.a} (${rpPct(a.m, a.a)}) at ${esc(smShortRaw(first.cid))}, ${b.m}/${b.a} (${rpPct(b.m, b.a)}) at ${esc(smShortRaw(last.cid))}.`);
  }
  const best = [...rows].filter(r => r.n >= 20).sort((p, q) => (q.m / q.n - q.exp) - (p.m / p.n - p.exp))[0];
  if (best && rows.length > 1) B.push(`<b>Best shooting event:</b> ${esc(smShortRaw(best.cid))}, ${best.m}/${best.n} where an average shooter in that event would make ${rpPct(best.exp * best.n, best.n)} from the same spots.`);
  const tbl = `<div class="rp-ev"><table><thead><tr><th>Event</th><th>FG</th><th>vs event</th>${G.map(([nm]) => `<th>${nm}</th>`).join('')}</tr></thead><tbody>` +
    [...rows].reverse().map(r => { const df = r.n ? r.m / r.n - r.exp : 0;
      return `<tr><td>${esc(smShortRaw(r.cid))}</td><td>${r.m}/${r.n} <span class="dim">${rpPct(r.m, r.n)}</span></td><td><span class="rp-d ${df > 0.02 ? 'up' : df < -0.02 ? 'down' : 'flat'}">${df >= 0 ? '+' : '−'}${Math.abs(df * 100).toFixed(1)} pts</span></td>${r.g.map(x => `<td>${x.m}/${x.a} <span class="dim">${Math.round(100 * x.a / (r.n || 1))}% of shots</span></td>`).join('')}</tr>`; }).join('') + '</tbody></table></div>';
  return `<section class="rp-card"><h2>Shooting, event by event</h2>
    <p class="rp-lede">From the shot charts: where ${W.his} shots came from in each event and how ${W.he} shot from there. "vs event" is ${W.his} FG% against an average shooter in the same event taking the same shots. <a href="#/p/${pid}/shots">Open the shot map</a></p>
    ${tbl}${B.length ? `<ul class="rp-bullets">${B.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}</section>`;
}

/* ------------------------------ notes ------------------------------ */
function rpNotesDev(R, imp, dec) {
  const W = R.W, N = [], dev = R.dev, o = k => dev.out.find(x => x.s.k === k);
  const line = (k, label) => {
    const x = o(k); if (!x || !x.ch.length) return null;
    const c = x.ch.map(c => `${esc(c.a.name.replace(/ \d{4}$/, ''))} ${c.a.y} ${rpCount(x.s, c.a)} → ${c.b.y} ${rpCount(x.s, c.b)}`).join('; ');
    return `${label}: ${c}.`;
  };
  const shoot = [line('ts', 'True shooting'), line('tp', 'Three-point'), line('ft', 'Free throws'), line('tpr', 'Threes per shot')].filter(Boolean);
  N.push(['Shooting', shoot.length ? shoot.join(' ') : `Not enough repeat events with shots to read ${W.his} shooting over time yet.`]);
  const play = [line('ast40', 'Assists per 40'), line('tov', 'Turnover rate')].filter(Boolean);
  N.push(['Playmaking', play.length ? play.join(' ') : 'No repeat event to compare yet.']);
  const db = [line('reb40', 'Rebounds per 40'), line('stl40', 'Steals per 40')].filter(Boolean);
  N.push(['Rebounding and defence', (db.length ? db.join(' ') : 'No repeat event to compare yet.') + ' Box scores only see steals, blocks and rebounds.']);
  const role = [line('mpg', 'Minutes a game'), line('pts40', 'Points per 40')].filter(Boolean);
  N.push(['Role', role.length ? role.join(' ') : 'No repeat event to compare yet.']);
  // age against the field: context for every number above
  const latest = R.rows[R.rows.length - 1];
  const younger = R.rows.filter(r => r.older != null && r.older <= -1.5);
  let ctx = latest.younger != null ? `At ${esc(latest.name)} ${W.he} was ${latest.age}, <b>${rpAgeVs(latest)}</b> of the players there. ` : '';
  if (younger.length) ctx += `${W.He} has played against fields at least 18 months older in ${younger.length} event${younger.length === 1 ? '' : 's'}, which makes those numbers harder to come by.`;
  if (ctx) N.push(['Age', ctx]);
  const focus = dec.slice(0, 2).map(x => x.s.n.toLowerCase());
  const keep = imp.slice(0, 2).map(x => x.s.n.toLowerCase());
  N.push(['What to work on', (focus.length ? `The numbers that have slipped: <b>${focus.join(' and ')}</b>. ` : '') + (keep.length ? `The ones to keep building: <b>${keep.join(' and ')}</b>.` : '') || 'Not enough repeat events yet to say.']);
  return `<section class="rp-card"><h2>Notes</h2><p class="rp-lede">Written from ${W.his} own numbers above, nothing typed by hand.</p>
    <div class="rp-notes">${N.map(([h, p]) => `<div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></section>`;
}

/* against other players: kept to one note, with the ranks one click away */
function rpAgainst(R) {
  const W = R.W;
  if (!R.graded.length) return `<aside class="rp-aside"><div class="rp-aside-i" aria-hidden="true">i</div><div><b>Against other players</b><p>${W.He} has no event yet with enough minutes to be ranked against the field.</p></div></aside>`;
  const top = R.strengths.find(x => !['ft', 'line'].includes(x.s.k)) || R.strengths[0];
  const gap = R.gaps[0], imp = R.prof.find(x => x.s.k === 'impact');
  const nowNoun = R.mainCat === 'Senior' ? 'senior events' : 'age-group events';
  let txt = `Measured against the other rotation players in ${W.his} recent ${nowNoun}, ${W.he} reads as a <b>${esc(R.arch.toLowerCase())}</b>`;
  txt += imp.now != null ? `, about ${rpOf100(imp.now)} for overall impact.` : '.';
  if (top) txt += ` ${W.His} strongest suit there is ${top.s.n.toLowerCase()} (about ${rpOf100(top.now)}: ${rpEvRanks(R.main, top.s, 2)})`;
  if (gap) txt += `${top ? '; ' : ' '}the weakest is ${gap.s.n.toLowerCase()} (about ${rpOf100(gap.now != null ? gap.now : gap.cat.Senior)})`;
  txt += top || gap ? '.' : '';
  const cats = ['Youth', 'Development', 'Senior'];
  const key = c => `<span class="rp-key" style="background:${RP_LV[c].c};${RP_LV[c].sh === 'circle' ? 'border-radius:50%' : RP_LV[c].sh === 'diamond' ? 'transform:rotate(45deg) scale(.8)' : ''}"></span>`;
  const tbl = `<div class="rp-htw"><table class="rp-ht"><thead><tr><th>Skill</th>${cats.map(c => `<th>${key(c)}${c}<br><span>${R.byCat[c].length} event${R.byCat[c].length === 1 ? '' : 's'}</span></th>`).join('')}<th>Last 12<br>months</th></tr></thead><tbody>` +
    R.prof.map(x => `<tr class="rp-hrow${x.s.k === RP.metric ? ' on' : ''}" data-rpk="${x.s.k}"><td><button type="button" data-rpm="${x.s.k}">${x.s.n}</button></td>${cats.map(c => x.cat[c] == null ? '<td class="na">–</td>' : `<td style="${rpCell(x.cat[c])}" title="${rpEvRanks(R.byCat[c], x.s, 8)}">#${rpPer100(x.cat[c])}</td>`).join('')}${x.now == null ? '<td class="na">–</td>' : `<td style="${rpCell(x.now)}" title="${rpEvRanks(R.main, x.s, 8)}">#${rpPer100(x.now)}</td>`}</tr>`).join('') + '</tbody></table></div>';
  return `<aside class="rp-aside"><div class="rp-aside-i" aria-hidden="true">i</div><div><b>Against other players</b><p>${txt}</p>
    <details class="rp-aside-more"><summary>Ranks at each level</summary>
      <p class="rp-lede">Where ${W.he} ranks among every 100 rotation players at each level: #1 is the best, #50 the middle of the field. Events of different sizes are scaled to 100. Pick a row to trace it.</p>
      <div class="rp-lvl"><div>${tbl}<div class="rp-scale" aria-hidden="true"><span>Near the bottom</span>${[0, 1, 2, 3, 4].map(b => `<i style="background:var(--rp-dv-${b})"></i>`).join('')}<span>Near the top</span></div></div>
      <div><div class="rp-chips" role="group" aria-label="Skill to trace">${RP_SKILLS.map(s => `<button type="button" data-rpm="${s.k}" aria-pressed="${s.k === RP.metric}">${s.n}</button>`).join('')}</div>
        <div class="rp-legend" id="rp-newest"></div><div class="rp-chart"><svg id="rp-arc" viewBox="0 0 640 290" role="img"></svg><div class="rp-tip" id="rp-tip"></div></div></div></div>
    </details></div></aside>`;
}

function rpTable(R) {
  const cols = ['pts40', 'ts', 'tp', 'ft', 'ast40', 'tov', 'reb40'].map(rpStat);
  return `<div class="rp-ev"><table><thead><tr><th>Event</th><th>Team</th><th>Level</th><th>Age</th><th>G</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th>${cols.map(s => `<th>${s.s}</th>`).join('')}</tr></thead><tbody>` +
    [...R.rows].reverse().map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.team || '')}</td><td>${r.cat}</td><td>${r.age ?? '–'}</td><td>${r.g}</td><td>${rpF1(r.mpg)}</td><td>${rpF1(r.ppg)}</td><td>${rpF1(r.rpg)}</td><td>${rpF1(r.apg)}</td>${cols.map(s => { const v = rpVal(r, s); return `<td>${v == null ? '<span class="dim">–</span>' : s.fmt(v)}</td>`; }).join('')}</tr>`).join('') +
    `</tbody></table></div><p class="rp-lede">– : fewer than ${RP_MIN_EVENT} minutes in the event, or too few attempts for that number.</p>`;
}

/* the small charts: one number each, every event in order, on his own scale */
function rpDrawTrends() {
  const T = RP.trend; if (!T) return;
  const tip = document.getElementById('rp-ttip');
  const all = RP.R.rows, t0 = Math.min(...all.map(r => r.t)), t1 = Math.max(...all.map(r => r.t)), span = Math.max(t1 - t0, RP_DAY);
  RP_TREND.forEach(k => {
    const svg = document.getElementById('rp-t-' + k); if (!svg) return;
    const s = rpStat(k);
    // a hollow point: an event with minutes but too few attempts for this number; it still shows, it does not join a line
    const pts = all.map(r => {
      const full = rpVal(r, s), raw = r.min > 0 ? s.get(r) : null;
      return full != null ? {r, v: full, small: false} : raw != null && !isNaN(raw) && (r.min >= 30) ? {r, v: raw, small: true} : null;
    }).filter(Boolean);
    const lab = document.getElementById('rp-tl-' + k);
    if (pts.length < 1) { svg.innerHTML = `<text x="150" y="80" text-anchor="middle" font-size="12" fill="var(--text-faint)">Not enough to chart</text>`; if (lab) lab.textContent = ''; return; }
    const W = 300, H = 150, L = 34, Rt = 10, Tp = 10, B = 22;
    let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
    const pad = Math.max((hi - lo) * 0.15, s.thr * 0.6); lo = Math.max(0, lo - pad); hi = hi + pad;
    const X = t => L + (W - L - Rt) * (span ? (t - t0) / span : 0.5), Y = v => Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo));
    let g = '';
    [lo, (lo + hi) / 2, hi].forEach((v, i) => { g += `<line x1="${L}" x2="${W - Rt}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)" stroke-width="1" ${i === 1 ? 'stroke-dasharray="2 4"' : ''}/><text x="${L - 5}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="var(--text-faint)">${s.fmt(v).replace('%', '')}</text>`; });
    const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear(), step = y1 - y0 > 5 ? 2 : 1;
    for (let y = y0; y <= y1 + 1; y += step) { const t = Date.UTC(y, 0, 1); if (t < t0 - 60 * RP_DAY || t > t1 + 30 * RP_DAY) continue; g += `<text x="${X(t)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${y}</text>`; }
    // a line joins the editions of one competition: that is the comparison that holds
    [...new Set(pts.map(p => p.r.tier))].forEach(tr => {
      const ps = pts.filter(p => p.r.tier === tr && !p.small); if (ps.length < 2) return;
      g += `<polyline fill="none" stroke="${RP_LV[ps[0].r.cat].c}" stroke-width="2" stroke-linejoin="round" points="${ps.map(p => X(p.r.t) + ',' + Y(p.v)).join(' ')}"/>`;
    });
    pts.forEach(p => { g += rpMarker(RP_LV[p.r.cat].sh, X(p.r.t), Y(p.v), 4.5, RP_LV[p.r.cat].c, false, p.small); });
    svg.innerHTML = g;
    const full = pts.filter(p => !p.small), a = full[0], b = full[full.length - 1];
    if (lab) lab.innerHTML = a && b && a !== b ? `${s.fmt(a.v)} → <b>${s.fmt(b.v)}</b>` : b ? `<b>${s.fmt(b.v)}</b>` : '';
    svg.onpointermove = e => {
      const bb = svg.getBoundingClientRect(), kx = W / bb.width, mx = (e.clientX - bb.left) * kx, my = (e.clientY - bb.top) * kx;
      let best = null, bd = 1e9; pts.forEach(p => { const dd = Math.hypot(X(p.r.t) - mx, Y(p.v) - my); if (dd < bd) { bd = dd; best = p; } });
      if (!best || bd > 30) { tip.classList.remove('on'); return; }
      const r = best.r, host = tip.parentElement.getBoundingClientRect();
      tip.innerHTML = `<div class="t1">${esc(r.name)}</div><div class="t0">${esc(r.team || '')} · ${r.cat}${r.age != null ? ' · age ' + r.age : ''} · ${r.g} games</div>
        <div class="rw"><span>${s.n}</span><b>${s.cnt ? s.cnt(r) + ' · ' : ''}${s.fmt(best.v)}</b></div>
        <div class="rw"><span>Line</span><b>${rpF1(r.ppg)} PTS · ${rpF1(r.rpg)} REB · ${rpF1(r.apg)} AST</b></div>
        ${best.small ? '<div class="rw"><span>Small sample</span><b>read with care</b></div>' : ''}`;
      const px = bb.left - host.left + X(r.t) / kx, py = bb.top - host.top + Y(best.v) / kx, tw = 250;
      tip.style.left = Math.max(0, Math.min(px + 12, host.width - tw)) + 'px'; tip.style.top = Math.max(0, py - 16) + 'px'; tip.classList.add('on');
    };
    svg.onpointerleave = () => tip.classList.remove('on');
  });
}

// "younger than 84%" or "older than 90%": whichever side most of the field is on
const rpAgeVs = r => r.younger >= 50 ? `older than ${r.younger}%` : `younger than ${100 - r.younger}%`;
function rpHonName(h, rows) {
  if (h.short) return h.short;
  const r = h.cid && rows.find(x => x.cid === h.cid);
  return r ? r.name.replace(/ \d{4}$/, '') : (h.comp || '');
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
function reportAfterRender() { if (document.getElementById('rp-t-pts40')) rpDrawTrends(); if (document.getElementById('rp-arc')) rpDrawArc(); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rpm]'); if (!b) return;
  RP.metric = b.dataset.rpm;
  document.querySelectorAll('.rp-hrow').forEach(tr => tr.classList.toggle('on', tr.dataset.rpk === RP.metric));
  document.querySelectorAll('.rp-chips [data-rpm]').forEach(x => x.setAttribute('aria-pressed', x.dataset.rpm === RP.metric));
  rpDrawArc();
});
