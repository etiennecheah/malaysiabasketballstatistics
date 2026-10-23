/* =========================================================================
   Records & Honours (#/records): for each tournament category, the roll of
   honour (champions and the individual awards in data/honours.json), the most
   decorated, single-game / tournament / career records, the youngest and oldest
   players, team records and the 180 Club (50% FG, 40% 3P, 90% FT in one
   tournament). Worked out here from the box scores, season lines and rosters the
   page already holds; a new tournament counts the day its games are in.
   Categories: U15 (MILO Lum Mun Chak Cup) and U17 (MABA/MATRIX 17 & Below),
   U20 and U23 (Malaysia D-League; the 2022 open D-League counts as U23), MBL (men)
   and Agong Cup. Youth qualifying rounds that name no gender are left out.
   ========================================================================= */
const RH = {g: 'agong', lv: {youth: 'U17', dl: 'U23', mbl: 'MBL', agong: 'AGONG'}, gd: 'm', rec: 'single', cache: {}, anim: true};
const RH_GROUPS = [['youth', 'U15 & U17', ['U15', 'U17']], ['dl', 'U20 & U23', ['U20', 'U23']], ['mbl', 'MBL', ['MBL']], ['agong', 'Agong Cup', ['AGONG']]];
const RH_LV = {
  U15: {name: 'U15', test: c => c.series === 'MILO Lum Mun Chak Cup' && c.level === 'U15', cap: 16.5, oldest: false},
  U17: {name: 'U17', test: c => c.series === 'MABA/MATRIX 17 & Below' && c.level === 'U17', cap: 18.5, oldest: false},
  U20: {name: 'U20', test: c => c.series === 'Malaysia D-League' && c.level === 'U20', cap: 21.5},
  U23: {name: 'U23', test: c => c.series === 'Malaysia D-League' && (c.level === 'U23' || c.level === 'Open'), cap: 24.5},
  MBL: {name: 'MBL', test: c => c.series === 'Major Basketball League', men: true},
  AGONG: {name: 'Agong Cup', test: c => c.series === 'Agong Cup'},
};
const RH_AW = [['MVP', 'MVP', 1], ['Finals MVP', 'Finals MVP', 1], ['Top scorer', 'Top scorer'], ['Top rebounder', 'Top rebounder'], ['Top assist', 'Top assists'], ['Top steal', 'Top steals'],
  ['Top block', 'Top blocks'], ['DPOY', 'Defensive POY'], ['All-Star Team', 'All-Star'], ['Most promising tall talent', 'Tall talent']];
const RH_K = {pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK', tpm: '3PM', g: 'GAMES'};
const RH_NAME = {pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', tpm: 'Threes made', g: 'Games played'};
const RH_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rhDt = iso => { const [y, m, d] = String(iso || '').split('-'); return y ? `${+d} ${RH_MON[+m - 1]} ${y}` : ''; };
const rhN = v => Number(v) || 0;
// the category a competition counts as men's or women's in; MBL is men only, a mixed youth qualifier counts nowhere
const rhGender = (c, lv) => c.gender === 'Women' ? (RH_LV[lv].men ? null : 'w') : c.gender === 'Men' ? 'm' : (lv === 'MBL' ? 'm' : null);

// a player's date of birth: the value his rosters give most often ("m/d/yy")
let RH_DOB = null;
function rhDob(pid) {
  if (!RH_DOB) {
    const cnt = {};
    COMPS.forEach(c => Object.values(c.roster || {}).forEach(rows => (rows || []).forEach(r => {
      if (!r.dob) return; const p = PALIAS[r.pid] || r.pid, C = cnt[p] = cnt[p] || {}; C[r.dob] = (C[r.dob] || 0) + 1; })));
    RH_DOB = {};
    Object.entries(cnt).forEach(([p, C]) => {
      const v = Object.entries(C).sort((a, b) => b[1] - a[1])[0][0], m = /^(\d+)\/(\d+)\/(\d+)$/.exec(v); if (!m) return;
      let y = +m[3]; if (y < 100) y += y <= (new Date().getFullYear() % 100) ? 2000 : 1900;
      const t = Date.UTC(y, +m[1] - 1, +m[2]); if (!isNaN(t)) RH_DOB[p] = t;
    });
  }
  return RH_DOB[pid];
}

function rhModel(lv, gd) {
  const key = lv + '-' + gd;
  if (RH.cache[key] !== undefined) return RH.cache[key];
  const L = RH_LV[lv];
  const comps = COMPS.filter(c => L.test(c) && rhGender(c, lv) === gd).sort((a, b) => (a.start || String(a.year)).localeCompare(b.start || String(b.year)));
  if (!comps.length) return (RH.cache[key] = null);
  const games = [], teamg = [];
  comps.forEach(c => c.games.forEach(g => {
    if (g.st !== 'COMPLETE') return;
    const b = getBox(g.mid); if (!b) return;
    const hs = parseInt(g.hs, 10), as = parseInt(g.as, 10);
    if (!isNaN(hs) && !isNaN(as) && !g.ff) teamg.push({cid: c.id, mid: g.mid, d: g.date, h: g.h, a: g.a, hs, as, mar: Math.abs(hs - as), hi: Math.max(hs, as)});
    b.p.forEach(r => {
      if (!r.pid) return;
      const x = {pid: r.pid, cid: c.id, y: c.year, mid: g.mid, d: g.date, t: r.team, o: r.team === g.h ? g.a : g.h,
        pts: rhN(r.pts), reb: rhN(r.oreb) + rhN(r.dreb), ast: rhN(r.ast), stl: rhN(r.stl), blk: rhN(r.blk), tpm: rhN(r.tpm)};
      if (!(minsToNum(r.min) > 0) && !(x.pts || x.reb || x.ast || x.stl || x.blk || rhN(r.fga))) return;   // a DNP line
      games.push(x);
    });
  }));
  const top = (list, f, n = 5) => list.slice().sort((p, q) => f(q) - f(p) || String(p.d || '').localeCompare(String(q.d || ''))).slice(0, n);
  const single = {};
  ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'].forEach(k => { single[k] = top(games, x => x[k]).filter(x => x[k] > 0); });
  // tournament lines (the competition's own season lines)
  const seas = [];
  comps.forEach(c => (c.players || []).forEach(p => {
    const g = rhN(p.g); if (g < 1) return;
    seas.push({pid: PALIAS[p.pid] || p.pid, cid: c.id, y: c.year, t: p.team, g, pts: rhN(p.pts), reb: rhN(p.reb) || rhN(p.oreb) + rhN(p.dreb), ast: rhN(p.ast), stl: rhN(p.stl), blk: rhN(p.blk),
      fgm: rhN(p.fgm), fga: rhN(p.fga), tpm: rhN(p.tpm), tpa: rhN(p.tpa), ftm: rhN(p.ftm), fta: rhN(p.fta)});
  }));
  const season = {};
  ['pts', 'reb', 'ast', 'stl', 'blk'].forEach(k => { season[k] = top(seas.filter(x => x.g >= 3), x => x[k] / x.g).filter(x => x[k]).map(x => Object.assign({}, x, {v: Math.round(x[k] / x.g * 10) / 10, tot: x[k]})); });
  const car = {};
  seas.forEach(x => { const C = car[x.pid] = car[x.pid] || {pid: x.pid, g: 0, n: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0}; C.g += x.g; C.n++; C.t = x.t; ['pts', 'reb', 'ast', 'stl', 'blk'].forEach(k => { C[k] += x[k]; }); });
  const career = {};
  ['pts', 'reb', 'ast', 'stl', 'blk', 'g'].forEach(k => { career[k] = top(Object.values(car), x => x[k]).filter(x => x[k]).map(x => Object.assign({}, x, {v: x[k]})); });
  // the 180 Club: FG% + 3P% + FT%, from tournaments with 20 FGA, 10 3PA and 10 FTA
  const club = top(seas.filter(x => x.fga >= 20 && x.tpa >= 10 && x.fta >= 10).map(x => Object.assign({}, x, {fg: x.fgm / x.fga * 100, tp: x.tpm / x.tpa * 100, ft: x.ftm / x.fta * 100})), x => x.fg + x.tp + x.ft, 6)
    .map(x => Object.assign(x, {sum: x.fg + x.tp + x.ft, club: x.fg >= 50 && x.tp >= 40 && x.ft >= 90}));
  // ages on the day of a game; a roster birthday that puts a player past the age limit is a wrong date
  const seen = {};
  games.forEach(x => {
    const b = rhDob(x.pid); if (b == null) return;
    const a = (Date.parse(x.d) - b) / (365.2425 * 864e5);
    if (!(a >= 9 && a <= 55) || a > (L.cap || 99)) return;
    const S = seen[x.pid] = seen[x.pid] || {min: [a, x], max: [a, x]};
    if (a < S.min[0]) S.min = [a, x]; if (a > S.max[0]) S.max = [a, x];
  });
  const ageRow = ([a, x]) => { const y = Math.floor(a); return Object.assign({}, x, {yrs: y, days: Math.round((a - y) * 365.2425)}); };
  const young = Object.values(seen).sort((p, q) => p.min[0] - q.min[0]).slice(0, 5).map(s => ageRow(s.min));
  const old = L.oldest === false ? null : Object.values(seen).sort((p, q) => q.max[0] - p.max[0]).slice(0, 5).map(s => ageRow(s.max));
  const team = {hi: top(teamg, t => t.hi, 3), mar: top(teamg, t => t.mar, 3)};
  // the roll of honour, newest first
  const byCid = {};
  Object.entries(DB.honours || {}).forEach(([pid, L2]) => (L2 || []).forEach(h => { if (h.cid) (byCid[h.cid] = byCid[h.cid] || []).push(...(h.awards || []).map(a => ({pid, t: h.team || '', a}))); }));
  const awards = comps.slice().reverse().map(c => ({cid: c.id, y: c.year, champ: c.champ || '', aw: byCid[c.id] || []}));
  return (RH.cache[key] = {lv, gd, comps, years: comps.map(c => +c.year), single, season, career, club, young, old, team, awards,
    nGames: new Set(games.map(x => x.mid)).size, nPlayers: new Set(games.map(x => x.pid)).size});
}

/* ---------------------------------------------------------------- pieces */
const rhTeam = (t, extra) => `${t ? crest(t, 14) + `<span>${esc(t)}</span>` : ''}${extra ? `<span>${extra}</span>` : ''}`;
const rhWho = (pid, sub, big) => `<a class="rh-who${big ? ' lg' : ''}" href="#/p/${pid}">${avatar(pid)}<span><b>${esc(personName(pid))}</b><small>${sub || ''}</small></span></a>`;
const rhIn = i => RH.anim ? ` rh-in" style="--i:${i}` : '';

function rhHero(m) {
  const sp = m.single.pts[0], yg = m.young[0], od = m.old && m.old[0], ppg = m.season.pts[0];
  const cnt = {}; m.awards.forEach(t => t.aw.forEach(a => { if (a.a === 'MVP') cnt[a.pid] = (cnt[a.pid] || 0) + 1; }));
  const mvp = Object.entries(cnt).sort((p, q) => q[1] - p[1])[0];
  const c = [], card = (k, v, body) => c.push(`<div class="rh-hc${rhIn(c.length)}"><span class="k">${k}</span><span class="v">${v}</span>${body}</div>`);
  if (sp) card('Points in a game', `<b data-cu="${sp.pts}">${sp.pts}</b><span>PTS</span>`, rhWho(sp.pid, `<span>v ${esc(sp.o)} · ${sp.y}</span>`));
  if (ppg) card('Points per game', `<b data-cu="${ppg.v}" data-dec="1">${ppg.v.toFixed(1)}</b><span>PPG</span>`, rhWho(ppg.pid, `<span>${ppg.y} · ${ppg.g} games</span>`));
  if (mvp) card('Most MVPs', `<b data-cu="${mvp[1]}">${mvp[1]}</b><span>MVP</span>`, rhWho(mvp[0], `<span>${esc(m.awards.filter(t => t.aw.some(a => a.a === 'MVP' && a.pid === mvp[0])).map(t => t.y).sort().join(', '))}</span>`));
  if (yg) card('Youngest', `<b data-cu="${yg.yrs}">${yg.yrs}</b><em>y</em>${yg.days}<em>d</em>`, rhWho(yg.pid, `<span>${rhDt(yg.d)}</span>`));
  if (od) card('Oldest', `<b data-cu="${od.yrs}">${od.yrs}</b><em>y</em>${od.days}<em>d</em>`, rhWho(od.pid, `<span>${rhDt(od.d)}</span>`));
  return `<section class="rh-hero"><div class="rh-hero-h"><h2><i></i>${esc(RH_LV[m.lv].name)} · ${m.gd === 'm' ? 'Men' : 'Women'}</h2><small>${m.comps.length} tournaments · ${m.nGames} games · ${m.nPlayers.toLocaleString('en')} players</small></div>
    <div class="rh-heads n${c.length}">${c.join('')}</div></section>`;
}

function rhHonours(m) {
  const cols = RH_AW.filter(([a]) => m.awards.some(t => t.aw.some(x => x.a === a)));
  const cell = (t, a) => { const L = t.aw.filter(x => x.a === a); return L.length ? L.map(x => rhWho(x.pid, rhTeam(x.t))).join('') : '<span class="dash">—</span>'; };
  const rows = m.awards.map((t, i) => `<tr class="${rhIn(Math.min(i, 10)).replace(/^ /, '')}"><td class="yr"><a href="#/c/${t.cid}">${esc(t.y)}</a></td>
      <td><span class="rh-champ">${t.champ ? crest(t.champ, 22) + esc(t.champ) : '<span class="dash">—</span>'}</span></td>
      ${cols.map(([a, , g]) => `<td class="${g ? 'g' : ''}">${cell(t, a)}</td>`).join('')}</tr>`).join('');
  const tally = {}; m.awards.forEach(t => t.aw.forEach(x => { const T = tally[x.pid] = tally[x.pid] || {n: 0, mvp: 0, list: [], t: x.t}; T.n++; if (/MVP/.test(x.a)) T.mvp++; T.list.push(x.a); }));
  let rk = 0, prev = null;
  const deco = Object.entries(tally).sort((p, q) => q[1].n - p[1].n || q[1].mvp - p[1].mvp).slice(0, 8).map(([pid, T], i) => { if (T.n !== prev) { rk = i + 1; prev = T.n; }
    return `<div class="rh-dr${rhIn(i)}"><span class="rk">${rk}</span><div>${rhWho(pid, rhTeam(T.t))}<div class="rh-pips">${T.list.map(a => `<i class="${/MVP/.test(a) ? 'g' : 's'}" title="${esc(a)}"></i>`).join('')}</div></div><span class="n">${T.n}<small>${T.mvp ? T.mvp + ' MVP' : 'awards'}</small></span></div>`; }).join('');
  return `<div class="rh-honour">
    <section class="rh-card"><div class="rh-h"><h2>Roll of honour</h2></div>
      <div class="rh-roll"><table><thead><tr><th></th><th>Champion</th>${cols.map(([, l, g]) => `<th class="${g ? 'g' : ''}">${l}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>
    <section class="rh-card"><div class="rh-h"><h2>Most decorated</h2></div><div class="rh-deco">${deco || '<div class="rh-none">—</div>'}</div></section>
  </div>`;
}

function rhRecords(m) {
  const mode = RH.rec, set = mode === 'single' ? m.single : mode === 'season' ? m.season : m.career;
  const ks = mode === 'single' ? ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'] : mode === 'season' ? ['pts', 'reb', 'ast', 'stl', 'blk'] : ['pts', 'reb', 'ast', 'stl', 'blk', 'g'];
  const cards = ks.map((k, ci) => {
    const L = set[k] || []; if (!L.length) return '';
    const val = r => mode === 'single' ? r[k] : r.v, fmt = v => mode === 'season' ? v.toFixed(1) : v, max = val(L[0]) || 1, t = L[0];
    const ctx = mode === 'single' ? `<a href="#/c/${t.cid}/box/${t.mid}"><b>v ${esc(t.o)}</b> · ${rhDt(t.d)}</a>` : mode === 'season' ? `<a href="#/c/${t.cid}"><b>${t.y}</b> · ${t.g} games · ${t.tot} total</a>` : `<b>${t.n} tournaments</b> · ${t.g} games`;
    return `<section class="rh-card rh-rc${rhIn(ci)}"><div class="lb">${mode === 'season' ? RH_NAME[k] + ' per game' : RH_NAME[k]}<span>${mode === 'season' ? RH_K[k][0] + 'PG' : RH_K[k]}</span></div>
      <div class="rh-top1">${rhWho(t.pid, rhTeam(t.t), 1)}<span class="big" data-cu="${val(t)}"${mode === 'season' ? ' data-dec="1"' : ''}>${fmt(val(t))}</span><span class="ctx">${ctx}</span></div>
      ${L.slice(1).map((r, i) => `<a class="rh-rr" href="#/p/${r.pid}"><span class="rk">${i + 2}</span><span class="nm">${esc(personName(r.pid))}<small>${mode === 'career' ? '' : r.y}</small></span><span class="bar"><i style="width:${RH.anim ? 0 : (val(r) / max * 100).toFixed(1) + '%'}" data-w="${(val(r) / max * 100).toFixed(1)}%"></i></span><span class="v">${fmt(val(r))}</span></a>`).join('')}
    </section>`; }).join('');
  return `<section><div class="rh-h"><h2>Records</h2><div class="rh-seg" role="group" aria-label="Records">${[['single', 'Single game'], ['season', 'Tournament'], ['career', 'Career']].map(([k, l]) => `<button data-rhrec="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div></div>
    <div class="rh-rgrid">${cards}</div>${mode === 'season' ? '<div class="rh-qual">Minimum 3 games</div>' : ''}</section>`;
}

function rhLower(m) {
  const ages = L => L.length ? L.map((r, i) => `<div class="rh-ag ${i ? '' : 'first'}${rhIn(i)}">${rhWho(r.pid, rhTeam(r.t, r.y))}<a class="age" href="#/c/${r.cid}/box/${r.mid}">${r.yrs}<i>y</i>${r.days}<i>d</i><small>${rhDt(r.d)}</small></a></div>`).join('') : '<div class="rh-none">—</div>';
  const tg = (L, f) => L.map(g => { const hw = g.hs > g.as;
    return `<a class="rh-tg" href="#/c/${g.cid}/box/${g.mid}"><span class="ln ${hw ? 'w' : ''}">${crest(g.h, 16)}<span>${esc(g.h)}</span></span><span class="s ${hw ? '' : 'l'}">${g.hs}</span>
      <span class="ln ${hw ? '' : 'w'}">${crest(g.a, 16)}<span>${esc(g.a)}</span></span><span class="s ${hw ? 'l' : ''}">${g.as}</span><span class="d">${rhDt(g.d)} · ${f(g)}</span></a>`; }).join('');
  const n = m.club.filter(r => r.club).length;
  const club = m.club.length ? m.club.map((r, i) => `<div class="rh-cr ${r.club ? 'in' : ''}${rhIn(i)}">
      ${rhWho(r.pid, rhTeam(r.t, r.y + ' · ' + r.g + ' g'))}<span class="sum">${r.club ? '<span class="rh-180">180</span> ' : ''}${r.sum.toFixed(1)}<small>FG + 3P + FT</small></span>
      <div class="tri">${[['FG', r.fg, r.fgm + '/' + r.fga, 50], ['3P', r.tp, r.tpm + '/' + r.tpa, 40], ['FT', r.ft, r.ftm + '/' + r.fta, 90]].map(([l, p, s, th]) =>
        `<div class="tb"><div class="t"><span>${l} ${s}</span><b class="${p >= th ? 'ok' : ''}">${p.toFixed(1)}</b></div><div class="bar"><i class="${p >= th ? 'ok' : ''}" style="width:${RH.anim ? 0 : Math.min(100, p) + '%'}" data-w="${Math.min(100, p)}%"></i><u style="left:${th}%"></u></div></div>`).join('')}</div></div>`).join('') : '<div class="rh-none">—</div>';
  return `<div class="rh-lower ${m.old ? '' : 'noold'}">
    <section class="rh-card"><div class="rh-h"><h2>Youngest</h2></div>${ages(m.young)}</section>
    ${m.old ? `<section class="rh-card"><div class="rh-h"><h2>Oldest</h2></div>${ages(m.old)}</section>` : ''}
    <section class="rh-card rh-tm"><div class="rh-h"><h2>Team records</h2></div>
      <div><h3>Most points</h3>${tg(m.team.hi, g => g.hi + ' points')}</div>
      <div><h3>Biggest win</h3>${tg(m.team.mar, g => '+' + g.mar)}</div></section>
    <section class="rh-card rh-c180"><div class="rh-h"><h2>180 Club</h2><small>${n ? n + ' member' + (n > 1 ? 's' : '') : 'No member yet'}</small></div><div class="rh-club">${club}</div>
      <div class="rh-qual">50% FG · 40% 3P · 90% FT in one tournament · min. 20 FGA, 10 3PA, 10 FTA</div></section>
  </div>`;
}

/* ---------------------------------------------------------------- page */
function renderRecords() {
  RH.anim = true;
  // a category with nothing for this gender (the MBL for women) gives way to the Agong Cup
  if (!RH_GROUPS.find(x => x[0] === RH.g)[2].some(l => rhModel(l, RH.gd))) RH.g = 'agong';
  const cats = RH_GROUPS.map(([g, name, lvs]) => {
    const ms = lvs.map(l => rhModel(l, RH.gd)).filter(Boolean), yrs = ms.flatMap(m => m.years), n = ms.reduce((t, m) => t + m.comps.length, 0);
    return `<button class="rh-cat" data-rhg="${g}" aria-pressed="${RH.g === g}"${n ? '' : ' disabled'}><b>${name}</b><small>${n ? `${n} tournaments · ${Math.min(...yrs)}–${Math.max(...yrs)}` : '—'}</small></button>`; }).join('');
  const lvs = RH_GROUPS.find(x => x[0] === RH.g)[2];
  const sub = lvs.length > 1 ? `<div class="rh-sub"><div class="rh-seg" role="group" aria-label="Age group">${lvs.map(l => `<button data-rhlv="${l}" aria-pressed="${RH.lv[RH.g] === l}">${l}</button>`).join('')}</div></div>` : '';
  const m = rhModel(RH.lv[RH.g], RH.gd);
  const body = m ? `${rhHero(m)}${rhHonours(m)}<div id="rh-rec">${rhRecords(m)}</div>${rhLower(m)}` : `<div class="rh-card"><div class="rh-none">No tournament in this category yet</div></div>`;
  return `<div class="page rh-page">
    <div class="rh-head"><h1>Records &amp; Honours</h1>
      <div class="rh-seg" role="group" aria-label="Category"><button data-rhgd="m" aria-pressed="${RH.gd === 'm'}">Men</button><button data-rhgd="w" aria-pressed="${RH.gd === 'w'}">Women</button></div></div>
    <div class="rh-cats" role="group" aria-label="Tournament">${cats}</div>${sub}
    ${body}
  </div>`;
}
// after a draw: the numbers count up and the bars fill
function recordsAfterRender(root) {
  root = root || document.querySelector('.rh-page'); if (!root || !RH.anim) return;
  RH.anim = false;
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('[data-w]').forEach(i => { i.style.width = i.dataset.w; })));
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const els = [...root.querySelectorAll('[data-cu]')], t0 = performance.now();
  els.forEach(e => { e.dataset.fin = e.textContent; });
  const step = t => { const k = Math.min(1, (t - t0) / 850), e = 1 - Math.pow(1 - k, 3);
    els.forEach(el => { const v = +el.dataset.cu * e; el.textContent = k < 1 ? (el.dataset.dec ? v.toFixed(1) : Math.round(v)) : el.dataset.fin; });
    if (k < 1 && els[0] && els[0].isConnected) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-rhg],[data-rhlv],[data-rhgd],[data-rhrec]'); if (!b) return;
  if (b.dataset.rhrec) {
    if (b.dataset.rhrec === RH.rec) return;
    RH.rec = b.dataset.rhrec; RH.anim = true;
    const r = document.getElementById('rh-rec'), m = rhModel(RH.lv[RH.g], RH.gd);
    if (r && m) { r.innerHTML = rhRecords(m); recordsAfterRender(r); }
    return;
  }
  if (b.dataset.rhg) { if (b.dataset.rhg === RH.g) return; RH.g = b.dataset.rhg; }
  else if (b.dataset.rhlv) { if (b.dataset.rhlv === RH.lv[RH.g]) return; RH.lv[RH.g] = b.dataset.rhlv; }
  else { if (b.dataset.rhgd === RH.gd) return; RH.gd = b.dataset.rhgd; }
  softRoute();
});
