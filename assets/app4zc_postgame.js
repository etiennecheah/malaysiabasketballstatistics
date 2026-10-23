/* =========================================================================
   Post Game Report — a tab of the box score page (#/c/<cid>/postgame/<mid>).
   Six A4 pages worked out from the game's box score, play-by-play, lineups and
   shot chart: summary and key insights, game flow and runs, four factors and
   shot zones, key performers and box scores, advanced numbers and lineups, the
   top scorers' shots and scoring by quarter. "Download PDF" saves the same six
   pages as a PDF: html2canvas (served with the site under vendor/, fetched
   only on that click) draws each page, and pgPdf below writes the file, one
   JPEG per A4 page.
   Data (build_postgame.py): stats/pg/<mid>.js, one file per finished game with
   a play-by-play. Players carry their pid; names come from the site's people.
   The pages are paper: they keep their own light palette in either theme, in
   hex colours, because html2canvas cannot read oklch().
   ========================================================================= */
const PG_DATA = {}, PG_ST = {};
function PG_PUT(mid, d) { PG_DATA[mid] = d; }
function ensurePostgame(mid) {
  if (PG_ST[mid]) return;
  PG_ST[mid] = 'loading';
  const s = document.createElement('script');
  s.src = HS.BASE + 'stats/pg/' + mid + '.js';
  const done = ok => { PG_ST[mid] = ok && PG_DATA[mid] ? 'done' : 'error'; if (/\/postgame\/[^/]+$/.test(HS.hash())) softRoute(); };
  s.onload = () => done(true); s.onerror = () => done(false);
  document.head.appendChild(s);
}
// a finished game with a play-by-play has a report (a handful of odd feeds do not: the tab then says so)
function hasPostgame(cid, mid) {
  const g = matchGame(cid, mid);
  return !!g && g.st === 'COMPLETE' && !g.ff && hasPbp(mid) && PG_ST[mid] !== 'error';
}
const PG_ABBR = {'Negeri Sembilan': 'NS', Johor: 'JHR', Kedah: 'KDH', Selangor: 'SEL', Perak: 'PRK', Pahang: 'PHG', Kelantan: 'KTN', Terengganu: 'TRG',
  Melaka: 'MLK', Malacca: 'MLK', Sabah: 'SBH', Sarawak: 'SWK', Penang: 'PNG', 'Pulau Pinang': 'PNG', Perlis: 'PLS', 'Kuala Lumpur': 'KL', Putrajaya: 'PJY', Labuan: 'LBN'};
const pgAbbr = n => PG_ABBR[n] || teamCode(n);
// the crest as a plain image (never repainted), else the team's initials on a neutral plate
const pgCrest = n => {
  const l = teamLogo(n), f = !l && typeof flagOf === 'function' ? flagOf(n) : null;
  if (l || (f && FLAGS[f])) return `<img class="pg-crest${l ? '' : ' pg-crest-f'}" src="${l || FLAGS[f]}" alt="">`;
  return `<span class="pg-crest pg-crest-i">${esc(pgAbbr(n))}</span>`;
};
const HC = '#dca81c', AC = '#2c5dbd', HCI = '#935b00', ACI = '#1e4eac';

function pgSheets(R, c) {
  const T = R.T, P = R.P, TN = [R.h, R.a];
  P.forEach(p => { if (!p.name) p.name = personName(p.pid); });
  const AB = [pgAbbr(R.h), pgAbbr(R.a)];
  if (AB[0] === AB[1]) { AB[0] = R.h.slice(0, 10); AB[1] = R.a.slice(0, 10); }
  const abbr = n => n === R.h ? AB[0] : n === R.a ? AB[1] : pgAbbr(n);
  const f1 = v => v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1);
  const f0 = v => v == null || !isFinite(v) ? '—' : Math.round(v);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = iso => { const [y, m, d] = iso.split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };
  const W = R.hs > R.as ? 0 : 1, Lz = 1 - W, sc = [R.hs, R.as];
  const QL = R.ql || 600, REG = 4 * QL;
  const per = t => { if (t >= REG) { const o = Math.floor((t - REG) / 300); return {p: 'OT' + (o + 1), c: 300 - (t - REG - o * 300)}; } const q = Math.min(3, Math.floor(t / QL)); return {p: 'Q' + (q + 1), c: QL - (t - q * QL)}; };
  const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const at = t => { const x = per(t); return `${x.p} ${clock(x.c)}`; };
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const nm = pid => (P.find(p => p.pid === pid) || {}).name || '';
  // "Wei Lin Khoo" -> "W.L. Khoo"; "Jia Yu, Ivan Chia" -> "I. Chia" (the western given name sits after the comma)
  const short = n => { n = String(n || '').trim(); if (n.includes(',')) n = n.split(',')[1].trim(); const w = n.split(/\s+/).filter(x => !/^(bin|binti|a\/l|a\/p)$/i.test(x)); if (w.length < 2) return n; return w.slice(0, -1).map(x => x[0].toUpperCase() + '.').join('') + ' ' + w[w.length - 1]; };
  const team = sd => `<span class="${sd ? 'pg-ac' : 'pg-hc'}">${esc(TN[sd])}</span>`;
  const compName = (c && (c.label || c.name)) || R.comp || `${R.series} ${R.year}`;
  const stage = R.stage || (c && typeof phaseLabel === 'function' ? phaseLabel(c, R.mid) : '') || '';
  const isFinal = /^(grand )?finals?$/i.test(stage);

  /* ---------------- insights, from the numbers ---------------- */
  const tw = T[W], tl = T[Lz];
  const qs = R.periods.map((q, i) => ({i, m: q[0] - q[1]}));
  const winQ = qs.slice().sort((a, b) => (W ? a.m - b.m : b.m - a.m)).filter(q => (W ? -q.m : q.m) > 0)[0];
  const cum = []; R.periods.reduce((a, q, i) => { const s = [a[0] + q[0], a[1] + q[1]]; cum[i] = s; return s; }, [0, 0]);
  const closing = R.runs.filter(r => r.side === W && r.end[0] === R.hs && r.end[1] === R.as)[0];
  const fgaGap = tw.fga - tl.fga;
  const ins = [], why = [];
  if (closing) ins.push(`<b>${esc(TN[W])}</b> broke a ${closing.start[0]}–${closing.start[1]} ${closing.start[0] === closing.start[1] ? 'tie' : 'game'} with a <b>${closing.pts}–0 closing run</b> over the last ${mmss(R.gmin * 60 - closing.t0)}, ${esc(nm(closing.top))} scoring ${closing.topPts} of them.`);
  if (winQ) { const q = winQ.i, b = q ? cum[q - 1] : [0, 0], m = Math.abs(winQ.m);
    ins.push(`<b>Q${q + 1} swing:</b> ${esc(TN[W])} won the quarter ${R.periods[q][W]}–${R.periods[q][Lz]}, turning ${b[0]}–${b[1]} into ${cum[q][0]}–${cum[q][1]}.`);
    why.push(`Won Q${q + 1} by ${m}${b[W] < b[Lz] ? `, erasing a ${b[Lz] - b[W]}-point deficit` : ''}.`); }
  if (fgaGap >= 6) {
    ins.push(tl.efg > tw.efg
      ? `${esc(TN[Lz])} shot better (${f1(tl.efg)} eFG% to ${f1(tw.efg)}) but took <b>${fgaGap} fewer shots</b>: ${f0(tl.tov)} turnovers (${f0(tw.stl)} ${abbr(TN[W])} steals) and ${f0(tw.oreb)} ${abbr(TN[W])} offensive rebounds.`
      : `${esc(TN[W])} out-shot ${esc(TN[Lz])} and took <b>${fgaGap} more shots</b>, from ${f0(tl.tov)} turnovers forced and ${f0(tw.oreb)} offensive rebounds.`);
    why.push(`Possession battle: ${f0(tw.fga)} field-goal attempts to ${f0(tl.fga)}, from ${f0(tl.tov - tw.tov)} more turnovers forced and ${f0(tw.oreb)} offensive rebounds.`); }
  if (tw.bench != null && tw.bench - tl.bench >= 10) ins.push(`<b>Bench points ${tw.bench}–${tl.bench}.</b> ${esc(TN[W])}'s reserves outscored ${esc(TN[Lz])}'s by ${tw.bench - tl.bench}.`);
  if (tw.fta - tl.fta >= 6) ins.push(`${esc(TN[W])} lived at the line: ${f0(tw.fta)} free throws to ${f0(tl.fta)}.`);
  const lr = R.runs.filter(r => r.side === Lz).sort((a, b) => b.pts - a.pts)[0];
  if (lr) ins.push(`${esc(TN[Lz])}'s best push was a ${lr.pts}–0 run (${at(lr.t0)}–${at(lr.t1)}) that cut ${lr.start[0]}–${lr.start[1]} to ${lr.end[0]}–${lr.end[1]}.`);
  if (closing) why.push(`Closed with ${closing.pts} unanswered points from ${closing.start[0]}–${closing.start[1]}.`);
  why.push(`Led for ${mmss(R.lead_t[W])} of ${R.gmin}:00; largest lead ${R.big[W]}.`);
  const sotg = fgaGap >= 6 ? {n: `${f0(tw.fga)}<span>vs</span>${f0(tl.fga)}`, t: `Field-goal attempts. ${esc(TN[Lz])} turned it over ${f0(tl.tov)} times and ${esc(TN[W])} grabbed ${f0(tw.oreb)} offensive boards: ${fgaGap} extra shots.`}
    : {n: `${f1(tw.ortg)}<span>vs</span>${f1(tl.ortg)}`, t: 'Points per 100 possessions.'};
  const headline = `${esc(TN[W])} beat ${esc(TN[Lz])} by ${Math.abs(R.hs - R.as)}${isFinal && R.champ === TN[W] ? ` to win the ${esc(R.series)} ${R.year}` : ''}.`;

  /* ---------------- page shell ---------------- */
  let pg = 0;
  const sheet = body => `<section class="pg-sheet" style="--pg-hc:${HC};--pg-ac:${AC};--pg-hcink:${HCI};--pg-acink:${ACI}"><div class="pg-top"><i></i><b>POST GAME REPORT</b><span>${esc(TN[0])} ${R.hs} – ${R.as} ${esc(TN[1])}</span></div>
    <div class="pg-body">${body}</div><div class="pg-foot"><span>HoopStatsMY · ${esc(compName)}${stage ? ' · ' + esc(stage) : ''} · ${dt(R.date)}</span><span>Page ${++pg}</span></div></section>`;
  const mirror = (rows) => `<div class="pg-mir">${rows.map(([k, a, b, hi, fmt, max]) => {
    const best = hi == null ? -1 : (hi ? (a > b ? 0 : b > a ? 1 : -1) : (a < b ? 0 : b < a ? 1 : -1)), M = max || Math.max(a, b) || 1;
    return `<div class="pg-mr"><span class="pg-v pg-l ${best === 0 ? 'pg-on' : ''}">${fmt(a)}</span><span class="pg-bar pg-l"><i class="${best === 1 ? 'pg-off' : ''}" style="width:${Math.min(100, a / M * 100)}%"></i></span><span class="pg-k">${k}</span><span class="pg-bar pg-r"><i class="${best === 0 ? 'pg-off' : ''}" style="width:${Math.min(100, b / M * 100)}%"></i></span><span class="pg-v ${best === 1 ? 'pg-on' : ''}">${fmt(b)}</span></div>`; }).join('')}</div>`;
  const thead = (cols) => `<thead><tr>${cols.map(c => `<th class="${c[1] ? 'pg-' + c[1] : ''}">${c[0]}</th>`).join('')}</tr></thead>`;

  /* ---------------- page 1: summary ---------------- */
  const quarters = `<table class="pg-q">${thead([['Team', 'l']].concat(R.periods.map((_, i) => [i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3)]), [['Final']]))}<tbody>
    ${[0, 1].map(sd => `<tr><td class="pg-l"><span class="pg-dot" style="background:${sd ? AC : HC}"></span>${esc(TN[sd])}</td>${R.periods.map(q => `<td class="${q[sd] > q[1 - sd] ? 'pg-win' : ''}">${q[sd]}</td>`).join('')}<td class="pg-b">${sc[sd]}</td></tr>`).join('')}
    <tr class="pg-tot"><td class="pg-l">Margin (${abbr(TN[0])})</td>${R.periods.map(q => `<td>${q[0] - q[1] > 0 ? '+' : ''}${q[0] - q[1]}</td>`).join('')}<td>${R.hs - R.as > 0 ? '+' : ''}${R.hs - R.as}</td></tr></tbody></table>`;
  const quick = mirror([['Poss', T[0].poss, T[1].poss, null, f1], ['ORtg', T[0].ortg, T[1].ortg, 1, f1, 140], ['DRtg', T[0].drtg, T[1].drtg, 0, f1, 140], ['eFG%', T[0].efg, T[1].efg, 1, f1, 80], ['TS%', T[0].ts, T[1].ts, 1, f1, 80],
    ['TOV%', T[0].tovp, T[1].tovp, 0, f1, 40], ['ORB%', T[0].orbp, T[1].orbp, 1, f1, 70], ['FT rate', T[0].ftr, T[1].ftr, 1, v => v.toFixed(2), 0.8]]);
  const p1 = sheet(`
    <div class="pg-hero"><div class="pg-match">
      <div class="pg-tm">${pgCrest(TN[0])}<span><small class="${W === 0 ? 'pg-w' : ''}">${W === 0 ? (isFinal && R.champ === TN[W] ? 'Champion' : 'Winner') : 'Home'}</small><b>${esc(TN[0])}</b></span></div>
      <div class="pg-sc"><span class="${W === 1 ? 'pg-l' : ''}">${R.hs}</span><em>–</em><span class="${W === 0 ? 'pg-l' : ''}">${R.as}</span></div>
      <div class="pg-tm pg-r"><span><small class="${W === 1 ? 'pg-w' : ''}">${W === 1 ? (isFinal && R.champ === TN[W] ? 'Champion' : 'Winner') : 'Away'}</small><b>${esc(TN[1])}</b></span>${pgCrest(TN[1])}</div></div>
      <div class="pg-meta">${stage ? `<span class="pg-stage">${esc(stage)}</span>` : ''}<span><b>${esc(compName)}</b></span><span>${dt(R.date)}${R.time ? ' · ' + esc(R.time) : ''}</span><span>${esc(R.venue || '')}</span><span>Pace ${f1(R.pace)}</span></div></div>
    <p class="pg-headline">${headline} <span>${esc(TN[W])} led for ${mmss(R.lead_t[W])} and by as many as ${R.big[W]}.</span></p>
    <div class="pg-two pg-w3"><div><h3>Score by quarter</h3>${quarters}</div><div><h3>Quick summary</h3>
      <div class="pg-mr" style="margin-bottom:2mm"><span class="pg-v pg-l pg-on pg-hc">${abbr(TN[0])}</span><span></span><span></span><span></span><span class="pg-v pg-on pg-ac">${abbr(TN[1])}</span></div>${quick}</div></div>
    <div class="pg-ins"><div class="pg-box"><h3>Key insights</h3><ul>${ins.slice(0, 5).map(x => `<li>${x}</li>`).join('')}</ul></div>
      <div class="pg-stack"><div class="pg-box pg-dark pg-sotg"><h3>Stat of the game</h3><div class="pg-n">${sotg.n}</div><p>${sotg.t}</p></div>
        <div class="pg-box"><h3>Why ${esc(TN[W])} won</h3><ul>${why.map(x => `<li>${x}</li>`).join('')}</ul></div></div></div>`);

  /* ---------------- page 2: game flow ---------------- */
  function flowSvg() {
    const Wd = 700, Ht = 250, pl = 30, pr = 8, pt = 22, pb = 24, end = R.gmin * 60;
    const mx = Math.max(R.big[0], R.big[1], 6) + 3, X = t => pl + t / end * (Wd - pl - pr), Y = m => pt + (mx - m) / (2 * mx) * (Ht - pt - pb), y0 = Y(0);
    let d = `M${X(0)},${Y(0)}`, prev = 0;
    R.flow.forEach(([t, m]) => { d += ` L${X(t).toFixed(1)},${Y(prev).toFixed(1)} L${X(t).toFixed(1)},${Y(m).toFixed(1)}`; prev = m; });
    d += ` L${X(end)},${Y(prev).toFixed(1)}`;
    const area = d + ` L${X(end)},${y0} L${X(0)},${y0} Z`;
    const qs = []; for (let i = 1; i < R.periods.length; i++) qs.push(i < 4 ? i * QL : REG + (i - 4) * 300);
    const ticks = []; for (let m = -Math.floor(mx / 5) * 5; m <= mx; m += 5) ticks.push(m);
    const runs = R.runs.map(r => { const up = r.side === 0, y = up ? pt - 4 : Ht - pb + 14, x0 = X(r.t0), x1 = Math.max(X(r.t1), x0 + 2);
      return `<rect x="${x0}" y="${up ? pt : Y(0)}" width="${x1 - x0}" height="${up ? Y(0) - pt : Ht - pb - Y(0)}" fill="${up ? HC : AC}" opacity=".10"/>
        <text x="${(x0 + x1) / 2}" y="${up ? pt - 7 : Ht - pb - 5}" text-anchor="middle" font-size="10" font-weight="700" fill="${up ? HCI : ACI}">${r.pts}–0 ${abbr(TN[r.side])}</text>`; }).join('');
    return `<svg viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Score margin through the game">
      <defs><clipPath id="up"><rect x="0" y="0" width="${Wd}" height="${y0}"/></clipPath><clipPath id="dn"><rect x="0" y="${y0}" width="${Wd}" height="${Ht}"/></clipPath></defs>
      ${ticks.map(m => `<line x1="${pl}" x2="${Wd - pr}" y1="${Y(m)}" y2="${Y(m)}" stroke="${m ? '#eef0f4' : '#9aa3b2'}" stroke-width="${m ? 1 : 1.2}"/><text x="${pl - 6}" y="${Y(m) + 3}" text-anchor="end" font-size="9" fill="#8a93a3">${m > 0 ? '+' + m : m}</text>`).join('')}
      ${qs.map(t => `<line x1="${X(t)}" x2="${X(t)}" y1="${pt}" y2="${Ht - pb}" stroke="#d5d9e1" stroke-dasharray="3 3"/>`).join('')}
      ${R.periods.map((_, i) => { const a = i < 4 ? i * QL : REG + (i - 4) * 300, b = i < 4 ? a + QL : a + 300; return `<text x="${(X(a) + X(b)) / 2}" y="${Ht - 6}" text-anchor="middle" font-size="10" fill="#8a93a3" font-weight="700">${i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3)}</text>`; }).join('')}
      ${runs}
      <path d="${area}" fill="${HC}" opacity=".55" clip-path="url(#up)"/><path d="${area}" fill="${AC}" opacity=".45" clip-path="url(#dn)"/>
      <path d="${d}" fill="none" stroke="#1d2433" stroke-width="1.6" stroke-linejoin="round"/>
      <text x="${pl + 4}" y="${pt + 11}" font-size="10" font-weight="700" fill="${HCI}">${esc(TN[0])} ahead</text><text x="${Wd - pr - 4}" y="${Ht - pb - 5}" text-anchor="end" font-size="10" font-weight="700" fill="${ACI}">${esc(TN[1])} ahead</text>
    </svg>`;
  }
  const fmtRun = r => `${r.start[0]}–${r.start[1]} → ${r.end[0]}–${r.end[1]}`;
  const p2 = sheet(`
    <div><h2 class="pg-sec">Game flow</h2>
    <div class="pg-chart"><div class="pg-legend"><span><span class="pg-dot" style="background:${HC}"></span>${esc(TN[0])} lead</span><span><span class="pg-dot" style="background:${AC}"></span>${esc(TN[1])} lead</span><span>Shaded bands: runs of 8–0 or more</span></div>${flowSvg()}</div></div>
    <div class="pg-tiles">
      <div class="pg-tile"><small>Largest lead</small><b><span class="pg-hc">${R.big[0]}</span> · <span class="pg-ac">${R.big[1]}</span></b><span>${abbr(TN[0])} · ${abbr(TN[1])}</span></div>
      <div class="pg-tile"><small>Time leading</small><b><span class="pg-hc">${mmss(R.lead_t[0])}</span></b><span>${abbr(TN[1])} ${mmss(R.lead_t[1])} · tied ${mmss(R.lead_t[2])}</span></div>
      <div class="pg-tile"><small>Lead changes</small><b>${R.lead_changes}</b><span>after the first score</span></div>
      <div class="pg-tile"><small>Times tied</small><b>${R.ties}</b><span>after tip-off</span></div>
      ${R.biggest ? `<div class="pg-tile"><small>Biggest run</small><b class="${R.biggest.side ? 'pg-ac' : 'pg-hc'}">${R.biggest.pts}–0</b><span>${abbr(TN[R.biggest.side])} · ${at(R.biggest.t0)}</span></div>` : ''}
    </div>
    ${R.runs.length ? `<div><h3>Runs (8–0 or more)</h3><table class="pg-runs">${thead([['Team', 'l'], ['Run'], ['When', 'l'], ['Score', 'l'], ['Led by', 'l']])}<tbody>
      ${R.runs.map(r => `<tr><td class="pg-l"><span class="pg-dot" style="background:${r.side ? AC : HC}"></span>${abbr(TN[r.side])}</td><td class="pg-b">${r.pts}–0</td><td class="pg-l">${at(r.t0)} – ${at(r.t1)}</td><td class="pg-l">${fmtRun(r)}</td><td class="pg-l">${r.top ? esc(nm(r.top)) + ' ' + r.topPts : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<div><h3>Runs (8–0 or more)</h3><p class="pg-note">Neither side scored eight unanswered points.</p></div>`}
    <div class="pg-two"><div><h3>Quarter by quarter</h3><table>${thead([['Quarter', 'l'], [abbr(TN[0])], [abbr(TN[1])], ['Margin'], ['Running', 'l']])}<tbody>
      ${R.periods.map((q, i) => `<tr><td class="pg-l">${i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3)}</td><td class="${q[0] > q[1] ? 'pg-win' : ''}">${q[0]}</td><td class="${q[1] > q[0] ? 'pg-win' : ''}">${q[1]}</td><td>${q[0] - q[1] > 0 ? '+' : ''}${q[0] - q[1]} ${q[0] === q[1] ? '' : abbr(TN[q[0] > q[1] ? 0 : 1])}</td><td class="pg-l">${cum[i][0]}–${cum[i][1]}</td></tr>`).join('')}</tbody></table></div>
    ${R.solo.length ? `<div><h3>Hot stretches · 6+ points inside four minutes</h3><table>${thead([['Player', 'l'], ['Team', 'l'], ['Pts'], ['From', 'l']])}<tbody>
      ${R.solo.map(x => `<tr><td class="pg-l">${esc(nm(x.pid))}</td><td class="pg-l"><span class="pg-dot" style="background:${x.side ? AC : HC}"></span>${abbr(TN[x.side])}</td><td class="pg-b">${x.pts}</td><td class="pg-l">${at(x.t0)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`);

  /* ---------------- page 3: four factors, comparison, shots ---------------- */
  const comp = [['Points', 'pts', 0, 1], ['Possessions', 'poss', 1, null], ['Offensive rating', 'ortg', 1, 1], ['Defensive rating', 'drtg', 1, 0], ['FG', null, 0, 1, t => `${f0(t.fgm)}/${f0(t.fga)} · ${f1(t.fgp)}%`, 'fgp'], ['3P', null, 0, 1, t => `${f0(t.tpm)}/${f0(t.tpa)} · ${f1(t.tpp)}%`, 'tpp'], ['FT', null, 0, 1, t => `${f0(t.ftm)}/${f0(t.fta)} · ${f1(t.ftp)}%`, 'ftp'],
    ['Offensive rebounds', 'oreb', 0, 1], ['Defensive rebounds', 'dreb', 0, 1], ['Assists', 'ast', 0, 1], ['Turnovers', 'tov', 0, 0], ['Steals', 'stl', 0, 1], ['Blocks', 'blk', 0, 1], ['Assist / turnover', 'asto', 2, 1], ['3PA rate', 'tpar', 1, null], ['Points in the paint', 'paint', 0, 1], ['Bench points', 'bench', 0, 1]];
  const cmpTable = `<table>${thead([['', 'l'], [abbr(TN[0])], [abbr(TN[1])]])}<tbody>${comp.filter(c => c[1] == null || T[0][c[1]] != null).map(([l, k, dp, hi, fn, kk]) => { const a = T[0][k || kk], b = T[1][k || kk], fm = fn || (v => dp === 2 ? v.toFixed(2) : dp ? f1(v) : f0(v));
    const w = hi == null || a === b ? -1 : (hi ? (a > b ? 0 : 1) : (a < b ? 0 : 1));
    return `<tr><td class="pg-l">${l}</td><td class="${w === 0 ? 'pg-win' : ''}">${fn ? fn(T[0]) : fm(a)}</td><td class="${w === 1 ? 'pg-win' : ''}">${fn ? fn(T[1]) : fm(b)}</td></tr>`; }).join('')}</tbody></table>`;
  const HAS_SH = !!(R.shots && R.shots.length && R.zones && R.zones.length === 2);
  const ZN = [['rim', 'Rim'], ['paint', 'Paint'], ['mid', 'Mid-range'], ['c3', 'Corner 3'], ['ab3', 'Above the break 3']];
  const zt = sd => { const z = R.zones[sd]; return ZN.map(([k]) => z[k] || [0, 0]); };
  const zoneTable = `<table>${thead([['Zone', 'l'], [abbr(TN[0]) + ' FGM/A'], ['FG%'], [abbr(TN[1]) + ' FGM/A'], ['FG%']])}<tbody>${ZN.map(([k, l], i) => { const a = zt(0)[i], b = zt(1)[i], pa = a[0] ? a[1] / a[0] * 100 : null, pb = b[0] ? b[1] / b[0] * 100 : null;
    return `<tr><td class="pg-l">${l}</td><td>${a[1]}/${a[0]}</td><td class="${pa != null && pb != null && pa > pb ? 'pg-win' : ''}">${f1(pa)}</td><td>${b[1]}/${b[0]}</td><td class="${pa != null && pb != null && pb > pa ? 'pg-win' : ''}">${f1(pb)}</td></tr>`; }).join('')}</tbody></table>`;
  function courtSvg(list, col) {
    const s = 20, Wd = 15 * s, Hm = 10.2, Ht = Hm * s, X = x => (x + 7.5) * s, Y = d => d * s, R3 = 6.75, a3 = Math.asin(6.6 / R3);
    let arc = ''; for (let k = 0; k <= 48; k++) { const a = -a3 + 2 * a3 * k / 48; arc += `${k ? 'L' : 'M'}${X(R3 * Math.sin(a)).toFixed(1)},${Y(1.575 + R3 * Math.cos(a)).toFixed(1)} `; }
    const ln = 'stroke="#8f8676" stroke-width="1.6" fill="none"';
    return `<svg viewBox="0 0 ${Wd} ${Ht}" aria-hidden="true">
      <rect x="${X(-2.45)}" y="0" width="${4.9 * s}" height="${5.8 * s}" ${ln}/><circle cx="${X(0)}" cy="${Y(5.8)}" r="${1.8 * s}" ${ln}/>
      <path d="M${X(-6.6)},0 L${X(-6.6)},${Y(1.575 + R3 * Math.cos(a3))} ${arc.replace(/^M/, 'L')} L${X(6.6)},0" ${ln}/>
      <path d="M${X(-1.25)},${Y(1.575)} A${1.25 * s},${1.25 * s} 0 0 0 ${X(1.25)},${Y(1.575)}" ${ln}/>
      <line x1="${X(-0.9)}" x2="${X(0.9)}" y1="${Y(1.2)}" y2="${Y(1.2)}" stroke="#5c5548" stroke-width="2.4"/><circle cx="${X(0)}" cy="${Y(1.575)}" r="${0.23 * s}" stroke="#d9762a" stroke-width="2" fill="none"/>
      ${list.filter(p => !p[2]).map(p => { const x = X(p[0]), y = Y(p[1] + 1.575); return `<path d="M${x - 3.6},${y - 3.6} L${x + 3.6},${y + 3.6} M${x + 3.6},${y - 3.6} L${x - 3.6},${y + 3.6}" stroke="#9a2f2f" stroke-width="1.7" opacity=".75"/>`; }).join('')}
      ${list.filter(p => p[2]).map(p => `<circle cx="${X(p[0])}" cy="${Y(p[1] + 1.575)}" r="4.6" fill="${col}" stroke="#1d2433" stroke-width="1"/>`).join('')}
    </svg>`;
  }
  const shotLine = list => { const m = list.filter(p => p[2]).length, t3 = list.filter(p => p[3]), m3 = t3.filter(p => p[2]).length; return `FG ${m}/${list.length} (${f1(list.length ? m / list.length * 100 : null)}%) · 3P ${m3}/${t3.length}`; };
  const z0 = HAS_SH ? R.zones[0] : {}, z1 = HAS_SH ? R.zones[1] : {}, inside = z => (z.rim || [0, 0])[0] + (z.paint || [0, 0])[0], insideM = z => (z.rim || [0, 0])[1] + (z.paint || [0, 0])[1];
  const shotIns = [
    `${esc(TN[inside(z0) >= inside(z1) ? 0 : 1])} attacked the paint more: ${inside(z0)} attempts (${f1(insideM(z0) / inside(z0) * 100)}%) to ${inside(z1)} (${f1(insideM(z1) / inside(z1) * 100)}%).`,
    `Threes were ${T[0].tpar > T[1].tpar ? esc(TN[0]) : esc(TN[1])}'s bigger weapon: ${f1(Math.max(T[0].tpar, T[1].tpar))}% of shots from deep against ${f1(Math.min(T[0].tpar, T[1].tpar))}%, at ${f1(T[0].tpar > T[1].tpar ? T[0].tpp : T[1].tpp)}% and ${f1(T[0].tpar > T[1].tpar ? T[1].tpp : T[0].tpp)}%.`];
  const p3 = sheet(`
    <div class="pg-two"><div><h2 class="pg-sec">Four factors</h2><div class="pg-mr" style="margin-bottom:2mm"><span class="pg-v pg-l pg-on pg-hc">${abbr(TN[0])}</span><span></span><span></span><span></span><span class="pg-v pg-on pg-ac">${abbr(TN[1])}</span></div>
      ${mirror([['eFG%', T[0].efg, T[1].efg, 1, f1, 80], ['TOV%', T[0].tovp, T[1].tovp, 0, f1, 40], ['ORB%', T[0].orbp, T[1].orbp, 1, f1, 70], ['FT rate', T[0].ftr, T[1].ftr, 1, v => v.toFixed(2), 0.8]])}
      <div class="pg-note">eFG% counts a three as 1.5 makes. TOV% is turnovers per 100 possessions. ORB% is the share of a team's misses it rebounded. FT rate is free-throw attempts per shot.</div>
      ${HAS_SH ? `<h2 class="pg-sec" style="margin-top:6mm">Shot zones</h2>${zoneTable}
      <div class="pg-box" style="margin-top:4mm"><h3>Shot insights</h3><ul>${shotIns.map(x => `<li>${x}</li>`).join('')}</ul></div>` : ''}</div>
      <div><h2 class="pg-sec">Team comparison</h2>${cmpTable}</div></div>
    ${HAS_SH ? `<div><h2 class="pg-sec">Shot charts</h2><div class="pg-courts">${[0, 1].map(sd => { const L = R.shots.filter(p => p[4] === sd); return `<div class="pg-court"><h4><span class="pg-dot" style="background:${sd ? AC : HC}"></span>${esc(TN[sd])}</h4>${courtSvg(L, sd ? AC : HC)}<p>${shotLine(L)} · filled = made, cross = missed</p></div>`; }).join('')}</div></div>` : ''}`);

  /* ---------------- page 4: players ---------------- */
  const pl = P.filter(p => p.min > 0);
  // a value the box score leaves blank (no TS% without a shot, no +/-) counts as nothing: a NaN in the
  // comparison would leave the order to chance and crown a scoreless player
  const nz = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const pick = (f, ok) => { let best = null, bv = -Infinity;
    pl.filter(ok || (() => true)).forEach(p => { const v = f(p); if (isFinite(v) && v > bv) { bv = v; best = p; } });
    return best; };
  const av = p => { const a = p.pid && ((DB.avatars || {})[p.pid] || PHOTOS[p.pid]); return `<span class="pg-av">${a ? `<img src="${a}" alt="">` : esc(short(p.name).split(/\s+/).map(w => w[0]).join('').slice(0, 2))}</span>`; };
  const line = p => `${f0(p.pts)} PTS · ${f0(p.reb)} REB · ${f0(p.ast)} AST`;
  const K = [['Top scorer', pick(p => nz(p.pts) + nz(p.ts) / 1000, p => nz(p.pts) > 0)], ['Most efficient', pick(p => p.ts, p => nz(p.fga) + 0.44 * nz(p.fta) >= 7)],
    ['Rebounds', pick(p => nz(p.reb) + nz(p.pts) / 1000, p => nz(p.reb) > 0)], ['Assists', pick(p => nz(p.ast) + nz(p.pts) / 1000, p => nz(p.ast) > 0)],
    ['Steals + blocks', pick(p => nz(p.stl) + nz(p.blk) + nz(p.pts) / 1000, p => nz(p.stl) + nz(p.blk) > 0)], ['Best +/-', pick(p => p.pm)]];
  const kv = (k, p) => k === 'Most efficient' ? `${f1(p.ts)} TS% · ${f0(p.pts)} PTS` : k === 'Steals + blocks' ? `${f0(p.stl)} STL · ${f0(p.blk)} BLK · ${f0(p.pts)} PTS` : k === 'Best +/-' ? `${p.pm > 0 ? '+' : ''}${f0(p.pm)} in ${mmss(p.min * 60)}` : line(p);
  const boxT = sd => { const L = P.filter(p => p.side === sd && p.min > 0).sort((a, b) => (b.start ? 1 : 0) - (a.start ? 1 : 0) || b.min - a.min), t = T[sd];
    return `<div class="pg-table-x"><table class="pg-boxsc">${thead([['<span class="pg-dot" style="background:' + (sd ? AC : HC) + '"></span>' + esc(TN[sd]), 'l'], ['MIN'], ['PTS'], ['FG'], ['3P'], ['FT'], ['OR'], ['DR'], ['REB'], ['AST'], ['STL'], ['BLK'], ['TOV'], ['PF'], ['+/-'], ['TS%']])}<tbody>
    ${L.map(p => `<tr><td class="pg-l pg-nm ${p.start ? 'pg-st' : ''}"><span>${esc(p.name)}</span></td><td>${p.min ? mmss(p.min * 60) : 'DNP'}</td><td class="pg-b">${f0(p.pts)}</td><td>${f0(p.fgm)}-${f0(p.fga)}</td><td>${f0(p.tpm)}-${f0(p.tpa)}</td><td>${f0(p.ftm)}-${f0(p.fta)}</td><td>${f0(p.oreb)}</td><td>${f0(p.dreb)}</td><td>${f0(p.reb)}</td><td>${f0(p.ast)}</td><td>${f0(p.stl)}</td><td>${f0(p.blk)}</td><td>${f0(p.tov)}</td><td>${f0(p.pf)}</td><td>${p.pm > 0 ? '+' : ''}${f0(p.pm)}</td><td>${f1(p.ts)}</td></tr>`).join('')}
    <tr class="pg-tot"><td class="pg-l">Team</td><td></td><td>${f0(t.pts)}</td><td>${f0(t.fgm)}-${f0(t.fga)}</td><td>${f0(t.tpm)}-${f0(t.tpa)}</td><td>${f0(t.ftm)}-${f0(t.fta)}</td><td>${f0(t.oreb)}</td><td>${f0(t.dreb)}</td><td>${f0(t.oreb + t.dreb)}</td><td>${f0(t.ast)}</td><td>${f0(t.stl)}</td><td>${f0(t.blk)}</td><td>${f0(t.tov)}</td><td>${f0(t.pf)}</td><td></td><td>${f1(t.ts)}</td></tr></tbody></table></div>`; };
  const dnp = [0, 1].map(sd => { const L = P.filter(p => p.side === sd && !(p.min > 0)); return L.length ? `${esc(abbr(TN[sd]))} ${L.map(p => esc(short(p.name))).join(', ')}` : ''; }).filter(Boolean).join('; ');
  const p4 = sheet(`
    <div><h2 class="pg-sec">Key performers</h2><div class="pg-kp">${K.filter(x => x[1]).map(([k, p]) => `<div class="pg-kc">${av(p)}<small>${k}</small><b>${esc(p.name)}</b><span><span class="pg-dot" style="background:${p.side ? AC : HC};width:6px;height:6px"></span>${kv(k, p)}</span></div>`).join('')}</div></div>
    <div><h2 class="pg-sec">Box score</h2>${boxT(0)}</div>
    <div>${boxT(1)}<div class="pg-note">● starter. TS% = points ÷ (2 × (FGA + 0.44 × FTA)). +/- is the score change while the player was on court.${dnp ? ' Did not play: ' + dnp + '.' : ''}</div></div>`);

  /* ---------------- page 5: advanced, lineups, top scorers ---------------- */
  const adv = pl.filter(p => p.min >= 10).sort((a, b) => b.min - a.min);
  const ch = v => v == null ? '—' : `<span class="pg-chip ${v >= 0 ? 'pg-p' : 'pg-n'}">${v > 0 ? '+' : ''}${f1(v)}</span>`;
  const advT = `<table>${thead([['Player', 'l'], ['Team', 'l'], ['MIN'], ['TS%'], ['USG%'], ['AST%'], ['TOV%'], ['On-court net']])}<tbody>${adv.map(p => `<tr><td class="pg-l">${esc(p.name)}</td><td class="pg-l"><span class="pg-dot" style="background:${p.side ? AC : HC};width:6px;height:6px"></span>${abbr(TN[p.side])}</td><td>${mmss(p.min * 60)}</td><td>${f1(p.ts)}</td><td>${f1(p.usg)}</td><td>${f1(p.astp)}</td><td>${f1(p.tovp)}</td><td>${ch(p.net)}</td></tr>`).join('')}</tbody></table>`;
  const luRows = sd => { const L = R.lineups.filter(l => l.side === sd).sort((a, b) => b.pm - a.pm || b.min - a.min), best = L.slice(0, 3), worst = L.filter(l => !best.includes(l) && l.pm < 0).slice(-2);
    return best.map(l => [l, 'Best']).concat(worst.map(l => [l, 'Worst'])); };
  const luT = `<table>${thead([['Team', 'l'], ['', 'l'], ['Five on court', 'l'], ['MIN'], ['Score'], ['+/-']])}<tbody>${[0, 1].map(sd => luRows(sd).map(([l, k]) =>
    `<tr><td class="pg-l"><span class="pg-dot" style="background:${sd ? AC : HC}"></span>${abbr(TN[sd])}</td><td class="pg-l" style="color:var(--pg-faint);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase">${k}</td><td class="pg-l">${l.five.map(pid => esc(short(nm(pid)))).join(' · ')}</td><td>${mmss(l.min * 60)}</td><td>${l.pf}–${l.pa}</td><td>${ch(l.pm)}</td></tr>`).join('')).join('')}</tbody></table>`;
  const top = [0, 1].map(sd => P.filter(p => p.side === sd && p.pid).sort((a, b) => b.pts - a.pts)[0]).filter(Boolean);
  const p5 = sheet(`
    <div><h2 class="pg-sec">Advanced · 10+ minutes</h2>${advT}<div class="pg-note">USG% = share of team plays used on court. AST% = share of teammates' baskets assisted on court. On-court net = points scored minus allowed per 100 possessions while on court.</div></div>
    ${R.lineups && R.lineups.length ? `<div><h2 class="pg-sec">Lineups · 2+ minutes together</h2>${luT}</div>` : ''}`);
  const p6 = sheet(`
    ${HAS_SH ? `<div><h2 class="pg-sec">Top scorers' shots</h2><div class="pg-courts">${top.map(p => { const L = R.shots.filter(s => s[5] === p.pid); return `<div class="pg-court"><h4><span class="pg-dot" style="background:${p.side ? AC : HC}"></span>${esc(p.name)} · ${abbr(TN[p.side])}</h4>${courtSvg(L, p.side ? AC : HC)}<p>${f0(p.pts)} PTS · ${shotLine(L)} · ${f1(p.ts)} TS%</p></div>`; }).join('')}</div></div>` : ''}
    <div><h2 class="pg-sec">Scoring by quarter</h2><div class="pg-two">${[0, 1].map(sd => { const L = P.filter(p => p.side === sd && p.pts > 0).sort((a, b) => b.pts - a.pts);
      return `<table>${thead([['<span class="pg-dot" style="background:' + (sd ? AC : HC) + '"></span>' + esc(TN[sd]), 'l']].concat(R.periods.map((_, i) => [i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3)]), [['PTS']]))}<tbody>
        ${L.map(p => { const q = R.qpts[p.pid] || []; return `<tr><td class="pg-l">${esc(short(p.name))}</td>${R.periods.map((_, i) => `<td style="${q[i] ? '' : 'color:var(--pg-faint)'}">${q[i] || '·'}</td>`).join('')}<td class="pg-b">${f0(p.pts)}</td></tr>`; }).join('')}
        <tr class="pg-tot"><td class="pg-l">Team</td>${R.periods.map(q => `<td>${q[sd]}</td>`).join('')}<td>${sc[sd]}</td></tr></tbody></table>`; }).join('')}</div></div>
    <div class="pg-box"><h3>How the numbers are worked out</h3><ul>
      <li><b>Possessions</b> = field-goal attempts + 0.44 × free-throw attempts − offensive rebounds + turnovers, counted from the play-by-play so team rebounds and team turnovers are included. Pace is possessions per 40 minutes.</li>
      <li><b>Offensive / defensive rating</b>: points scored / allowed per 100 possessions.</li>
      <li><b>Runs</b> are unanswered points; <b>hot stretches</b> are a player's most points inside any four minutes.</li>
      ${HAS_SH ? `<li><b>Shot zones</b> come from the organiser's shot chart: rim = within 1.6 m of the basket; paint = the rest of the key; corner 3 = within 3.1 m of the baseline.</li>` : ''}
      ${R.lineups && R.lineups.length ? '<li><b>Lineups</b> are worked out from the substitutions; +/- is the score while that five shared the court.</li>' : ''}
      <li>Source: the official box score, play-by-play${HAS_SH ? ' and shot chart' : ''} of this game, as published through Genius Sports.</li></ul></div>`);
  return p1 + p2 + p3 + p4 + p5 + p6;
}

let PG_HTML = {mid: null, html: '', pages: 6, p: null};
/* A page whose blocks outgrow A4 (a long bench, extra lineups) hands its last blocks to a
   continuation page. Measured off screen at the A4 width once the fonts are in, so the pages on
   screen are the pages in the PDF. */
function pgPaginate(html) {
  const host = document.createElement('div');
  host.className = 'pgr pgr-export'; host.setAttribute('aria-hidden', 'true'); host.innerHTML = html;
  document.body.appendChild(host);
  const probe = document.createElement('div'); probe.style.height = '297mm'; host.appendChild(probe);
  const LIM = probe.offsetHeight + 1; probe.remove();
  const sheets = [...host.querySelectorAll('.pg-sheet')];
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i]; let cont = null, n = 0;
    while (s.offsetHeight > LIM && n++ < 12) {
      const kids = [...s.querySelector('.pg-body').children];
      if (kids.length < 2) break;
      if (!cont) { cont = s.cloneNode(true); cont.querySelector('.pg-body').innerHTML = ''; s.after(cont); sheets.splice(i + 1, 0, cont); }
      cont.querySelector('.pg-body').prepend(kids[kids.length - 1]);
    }
  }
  sheets.forEach((s, i) => { const f = s.querySelector('.pg-foot span:last-child'); if (f) f.textContent = 'Page ' + (i + 1); });
  const out = host.innerHTML; host.remove();
  return {html: out, pages: sheets.length};
}
function pgPage(mid) {
  if (PG_HTML.mid !== mid) return Promise.resolve();
  if (!PG_HTML.p) PG_HTML.p = (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
    if (PG_HTML.mid !== mid) return;
    Object.assign(PG_HTML, pgPaginate(PG_HTML.html));
    const box = document.querySelector('.pgr-scroll .pgr'), n = document.getElementById('pgr-pages');
    if (box) box.innerHTML = PG_HTML.html;
    if (n) n.textContent = PG_HTML.pages;
  });
  return PG_HTML.p;
}
function renderMatchPostgame(cid, mid) {
  const g = matchGame(cid, mid);
  if (!g) return renderNotFound(cid);
  const head = matchHead(cid, mid, 'postgame');
  const wait = msg => head + `<div class="card"><div class="empty-row"><span class="empty-dot"></span>${msg}</div></div></div>`;
  if (g.st !== 'COMPLETE' || !hasPbp(mid)) return wait('The post game report is written once the game is final and its play-by-play is in.');
  if (!PG_DATA[mid]) {
    ensurePostgame(mid);
    return wait(PG_ST[mid] === 'error' ? 'There is no post game report for this game.' : 'Writing the report…');
  }
  if (PG_HTML.mid !== mid) {
    try { PG_HTML = {mid, html: pgSheets(PG_DATA[mid], COMP_BY_ID[cid]), pages: 6, p: null}; }
    catch (e) { console.error(e); return wait('The report for this game could not be drawn.'); }
  }
  setTimeout(() => pgPage(mid), 0);
  return head + `<div class="pgr-bar"><div><b>Post Game Report</b><span><span id="pgr-pages">${PG_HTML.pages}</span> A4 pages · ${esc(g.h)} v ${esc(g.a)}</span></div>
    <button type="button" class="pgr-dl" id="pgr-dl" data-pgdl="${mid}"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Download PDF</span></button></div>
    <div class="pgr-scroll"><div class="pgr">${PG_HTML.html}</div></div></div>`;
}

/* ---- the PDF: each page drawn by html2canvas at twice its size, one A4 page each ---- */
const pgScript = src => new Promise((ok, no) => {
  if (document.querySelector(`script[data-pgv="${src}"]`)) return ok();
  const s = document.createElement('script'); s.src = HS.BASE + 'vendor/' + src; s.async = true; s.dataset.pgv = src;
  s.onload = ok; s.onerror = () => { s.remove(); no(new Error('could not load ' + src)); };
  document.head.appendChild(s);
});
// html2canvas reads the page's own html and body backgrounds too, and cannot parse oklch(): for the
// moment of the capture they carry the same colour written as rgb (drawn once on a canvas to convert it)
function pgPlainGround() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', {willReadFrequently: true});
  const rgb = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return `rgba(${d[0]},${d[1]},${d[2]},${(d[3] / 255).toFixed(3)})`; };
  const els = [document.documentElement, document.body], was = els.map(e => e.style.backgroundColor);
  els.forEach(e => { const c = getComputedStyle(e).backgroundColor; if (!/^rgba?\(/.test(c)) e.style.backgroundColor = rgb(c); });
  return () => els.forEach((e, i) => { e.style.backgroundColor = was[i]; });
}
/* A PDF of whole-page pictures needs no library: one JPEG image per A4 page, drawn to the page
   width from the top. Strings are ASCII, the title UTF-16 (it carries an en dash). */
function pgPdf(pages, title) {
  const enc = new TextEncoder(), parts = [], offs = [];
  let size = 0;
  const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); size += b.length; };
  const obj = (n, body, stream) => {
    offs[n] = size;
    put(`${n} 0 obj\n${body}\n`);
    if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); }
    put('endobj\n');
  };
  const u16 = t => '<FEFF' + [...String(t)].map(ch => { const c = ch.codePointAt(0); return c > 0xffff ? '003F' : c.toString(16).toUpperCase().padStart(4, '0'); }).join('') + '>';
  const PW = 595.28, PH = 841.89, n = pages.length, info = 3 + n * 3;
  put('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');     // the second line marks the file as binary
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  pages.forEach((pg, i) => {
    const o = 3 + i * 3, w = PW * pg.fit, h = PW * pg.fit * pg.h / pg.w;
    const draw = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((PW - w) / 2).toFixed(2)} ${(PH - h).toFixed(2)} cm /Im0 Do Q`;
    obj(o, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${o + 2} 0 R >> >> /Contents ${o + 1} 0 R >>`);
    obj(o + 1, `<< /Length ${draw.length} >>`, enc.encode(draw));
    obj(o + 2, `<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpg.length} >>`, pg.jpg);
  });
  obj(info, `<< /Title ${u16(title)} /Creator (HoopStatsMY) /Producer (HoopStatsMY) >>`);
  const xref = size;
  put(`xref\n0 ${info + 1}\n0000000000 65535 f \n` + offs.slice(1).map(x => String(x).padStart(10, '0') + ' 00000 n \n').join(''));
  put(`trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, {type: 'application/pdf'});
}
const pgSave = (blob, name) => {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
};
const pgFile = s => String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
async function pgDownload(btn) {
  const mid = btn.dataset.pgdl, R = PG_DATA[mid];
  if (!R || btn.disabled) return;
  const label = btn.querySelector('span'), was = label.textContent;
  btn.disabled = true; label.textContent = 'Preparing…';
  // drawn off screen at the A4 width, so a phone saves the same pages a desktop does
  let host = null, restore = null;
  try {
    if (PG_HTML.mid !== mid) PG_HTML = {mid, html: pgSheets(R, COMP_BY_ID[R.cid]), pages: 6, p: null};
    await pgPage(mid);
    host = document.createElement('div');
    host.className = 'pgr pgr-export'; host.setAttribute('aria-hidden', 'true'); host.innerHTML = PG_HTML.html;
    document.body.appendChild(host);
    await pgScript('html2canvas.min.js');
    await Promise.all([...host.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    restore = pgPlainGround();
    const pages = [];
    const sheets = [...host.querySelectorAll('.pg-sheet')];
    for (let i = 0; i < sheets.length; i++) {
      label.textContent = `Page ${i + 1} of ${sheets.length}…`;
      const cv = await window.html2canvas(sheets[i], {scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, windowWidth: 1280});
      const h = 210 * cv.height / cv.width;
      const blob = await new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('page ' + (i + 1) + ' could not be drawn')), 'image/jpeg', 0.92));
      pages.push({w: cv.width, h: cv.height, fit: h > 297 ? 297 / h : 1, jpg: new Uint8Array(await blob.arrayBuffer())});
    }
    pgSave(pgPdf(pages, `Post Game Report · ${R.h} ${R.hs}–${R.as} ${R.a}`), `Post-Game-Report_${pgFile(R.h)}-v-${pgFile(R.a)}_${R.date}.pdf`);
    label.textContent = 'Saved';
  } catch (e) {
    console.error(e);
    label.textContent = 'Download failed · try again';
  } finally {
    if (restore) restore();
    if (host) host.remove();
    btn.disabled = false;
    setTimeout(() => { if (label.isConnected && label.textContent !== was) label.textContent = was; }, 2600);
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest ? e.target.closest('[data-pgdl]') : null;
  if (b) { e.preventDefault(); pgDownload(b); }
});
