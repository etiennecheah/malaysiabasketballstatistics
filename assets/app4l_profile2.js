/* =========================================================================
   Player profile, v2 layout (approved from the mockup, 2026-09-29).

   One focal point per screen: a full-width hero with the name, a row of details and
   four big numbers for one tier (honours moved to the overview, update-50), then five tabs — Overview, Stats, Game log,
   Advanced, Splits. The rule of the old page still holds everywhere: numbers
   are never averaged across tiers, and every high carries its tier.

   Honours come from two places: DB.honours (a hand-kept list per player —
   titles, MVPs and stat awards, including youth events the database never
   covered) and the competitions the database itself says the player's team
   won. A database title already in the list is not counted twice.
   ========================================================================= */

const PV = { pid: null, mode: 'pg', open: null, comp: null, split: null, data: null };
const PV_TABS = [['overview', 'Overview'], ['stats', 'Stats'], ['log', 'Game log'], ['adv', 'Advanced'], ['splits', 'Splits']];
const PV_OLD_TAB = { tiers: 'stats', detail: 'stats', impact: 'overview', bpm: 'adv' };
const PV_POS = { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Centre',
  G: 'Guard', F: 'Forward', 'G/F': 'Guard / forward', 'F/C': 'Forward / centre', 'F/G': 'Forward / guard', 'C/F': 'Centre / forward' };
const PV_NAT = { MAS: 'Malaysia', MYS: 'Malaysia', SGP: 'Singapore', SIN: 'Singapore', PHI: 'Philippines', PHL: 'Philippines',
  INA: 'Indonesia', IDN: 'Indonesia', THA: 'Thailand', CHN: 'China', TPE: 'Chinese Taipei', USA: 'United States',
  AUS: 'Australia', JPN: 'Japan', KOR: 'Korea', NGR: 'Nigeria', CAN: 'Canada', GBR: 'Great Britain', BRU: 'Brunei', VIE: 'Vietnam' };
// the national age-group championships read better by what they are than by their sponsor names
const PV_SHORT = { 'MABA/MATRIX 17 & Below': 'National', 'MILO Lum Mun Chak Cup': 'National' };
function pvShortKey(k) { const [ser, lvl] = k.split('|'); return PV_SHORT[ser] ? PV_SHORT[ser] + (lvl && lvl !== 'Open' ? ' ' + lvl : '') : tierShort(k); }
const PV_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pvDay(iso, withYear) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return d + ' ' + PV_M[m - 1] + (withYear === false ? '' : ' ' + y);
}
function pvDob(s) {
  const x = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!x) return s || '';
  let y = +x[3]; if (y < 100) y += y > 30 ? 1900 : 2000;
  return +x[2] + ' ' + PV_M[+x[1] - 1] + ' ' + y;
}
const pvF1 = v => v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1);
const pvF0 = v => v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString();
const pvPc = (m, a) => a ? pvF1(m / a * 100) : '—';
const pvSg = v => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (Number.isInteger(v) ? v : pvF1(v));
const pvTs = p => { const d = (p.fga || 0) + 0.44 * (p.fta || 0); return d ? p.pts / (2 * d) * 100 : null; };
const pvMin = m => minsToNum(m) || 0;
function pvOrd(n) { n = Math.round(n); const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
const pvTop = gp => 'Top ' + Math.max(1, Math.ceil(100 - gp)) + '%';
// "JOHOR" -> "Johor"; names already in mixed case are left alone
const pvCase = s => s && /[A-Z]/.test(s) && s === s.toUpperCase() && s.length > 3 ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
const pvReb = l => (l.oreb || 0) + (l.dreb || 0);

/* ---- everything the page needs, worked out once per player ------------- */
function pvData(pid) {
  if (PV.data && PV.data.pid === pid) return PV.data;
  const rows = (CAREER[pid] || []).filter(r => hasStats(r.p) && r.p.g)
    .sort((a, b) => (b.c.year || 0) - (a.c.year || 0) || (b.c.start || '').localeCompare(a.c.start || ''));
  rows.forEach(r => { r.tk = tierKey(r.c); r.short = pvShortKey(r.tk); });
  const tiers = playerTiers(pid);
  tiers.forEach(t => {
    t.short = pvShortKey(t.key);
    try { t.rd = radarRead(pid, { type: 'tier', key: t.key }, t, false, { all: true }); } catch (e) { t.rd = null; }
    const withLogo = t.rows.map(r => compMark(r.c)).find(Boolean);
    t.logo = withLogo ? COMPLOGOS[withLogo] : null;
  });
  const log = [];
  (BOX_BY_PID[pid] || []).forEach(mid => {
    const g = GAME_BY_MID[mid]; if (!g) return;
    const b = getBox(mid); if (!b) return;
    const l = b.p.find(x => x.pid === pid); if (!l) return;
    const c = COMP_BY_ID[g.cid]; if (!c) return;
    const home = l.team === g.h;
    log.push({ mid, cid: g.cid, c, tk: tierKey(c), date: g.date || '', h: g.h, a: g.a, l,
      own: home ? g.hs : g.as, opp: home ? g.as : g.hs, win: (home ? g.hs : g.as) > (home ? g.as : g.hs),
      home, oppName: pvCase(home ? g.a : g.h), oppRaw: home ? g.a : g.h, min: pvMin(l.min), phase: phaseLabel(c, mid) });
  });
  log.sort((a, b) => b.date.localeCompare(a.date));
  const isTitle = r => !!(r.c.champ && r.p.team && r.c.champ.toLowerCase() === String(r.p.team).toLowerCase());
  // honours: the hand-kept list first, then any database title it does not already name
  // an honour marked pathOnly (a runner-up finish, a campus medal) is shown on the
  // career path and nowhere else: no hero pill, no honours card, no title count
  const allHon = ((DB.honours || {})[pid] || []).map(h => {
    const c = h.cid && COMP_BY_ID[h.cid];
    // a linked competition the database says this team won is a title even if the list does not say so
    const won = c && rows.some(r => r.c.id === c.id && isTitle(r));
    return Object.assign({ awards: [] }, h, c ? { tk: tierKey(c), year: h.year || c.year, short: h.short || pvShortKey(tierKey(c)), champ: !!(h.champ || won) } : {});
  });
  const hon = allHon.filter(h => !h.pathOnly), pathHon = allHon.filter(h => h.pathOnly);
  rows.filter(isTitle).forEach(r => {
    if (!hon.some(h => h.cid === r.c.id)) hon.push({ year: r.c.year, comp: r.c.label || r.c.name, short: r.short, team: r.p.team, champ: true, awards: [], cid: r.c.id, tk: r.tk });
  });
  // a verified player's approved honour changes: additions they asked for, and removals
  if (typeof accOverHon === 'function') accOverHon(pid, hon);
  hon.sort((a, b) => b.year - a.year);
  const bios = BIO[pid] || {};
  const bio0 = rows.map(r => bios[r.c.id]).find(Boolean) || Object.values(bios)[0] || {};
  // an approved birthday, height or weight replaces the source's
  // the position is the one registered in his latest competition that gives one (latestPos)
  const bio1 = Object.assign({}, bio0, latestPos(pid) ? { pos: latestPos(pid) } : {});
  const bio = typeof accOverBio === 'function' ? accOverBio(pid, bio1) : bio1;
  const extra = (DB.playerExtras || {})[pid] || {};
  // career steps outside the database: the hand-kept ones, plus a signing abroad reported in the News
  const moves = (extra.moves || []).slice();
  (typeof newsMoves === 'function' ? newsMoves(pid) : []).forEach(m => {
    if (!moves.some(x => x.year === m.year && String(x.team).toLowerCase() === m.team.toLowerCase())) moves.push(m);
  });
  // the team he is with now: the News (a signing is newer than any box score), else the hand-kept one
  const nt = typeof newsTeam === 'function' ? newsTeam(pid) : null;
  // titles grouped by competition: "8× Agong Cup", "2× MBL"
  const tg = {};
  hon.filter(h => h.champ).forEach(h => { const t = tg[h.short] || (tg[h.short] = { short: h.short, years: [] }); t.years.push(h.year); });
  const titles = Object.values(tg).map(t => Object.assign(t, { n: t.years.length, years: t.years.sort((a, b) => a - b) }))
    .sort((a, b) => b.n - a.n || Math.max(...b.years) - Math.max(...a.years));
  const years = rows.map(r => r.c.year).concat(allHon.map(h => h.year), moves.map(m => m.year)).filter(Boolean);
  PV.data = { pid, rows, tiers, log, hon, pathHon, isTitle, bio, titles, badges: extra.badges || [], moves, current: (nt && nt.team) || extra.current || '', span: years.length ? [Math.min(...years), Math.max(...years)] : null };
  return PV.data;
}
const pvHonOf = (d, r) => d.hon.find(h => h.cid === r.c.id);
// the team's crest when the site has one, else the event's own mark (FilBasket), else the team's colour disc
const PV_MEDAL = /^(Gold|Silver|Bronze) medal$/;
const pvMedalCls = a => { const m = String(a).match(PV_MEDAL); return m ? 'medal ' + m[1].toLowerCase() : ''; };
const pvTagCls = a => pvMedalCls(a) || (/MVP/.test(a) ? 'mvp' : 'aw');
// a medal honour carries a struck medal; otherwise the team's crest when the site has one,
// else the event's own mark (FilBasket), else the team's colour disc
const pvMark = (h, sz) => h.medal ? `<span class="pv-medal ${esc(h.medal)}" style="width:${sz}px;height:${sz}px" aria-hidden="true"></span>`
  : h.team && (teamLogo(h.team) || flagOf(h.team)) ? crest(h.team, sz) : h.mark ? crest(h.mark, sz) : h.team ? crest(h.team, sz) : '';

/* ---- hero -------------------------------------------------------------- */
function pvHero(pid, d, t) {
  const name = PERSONS[pid];
  // the two hero lines: a hand-kept override (player_extras "nameLines") wins over the split of the source name
  const nl = ((DB.playerExtras || {})[pid] || {}).nameLines;
  const parts = String(name).trim().split(/\s+/);
  const last = nl ? (nl[1] || '') : parts.length > 1 ? parts.pop() : '', first = nl ? nl[0] : parts.join(' ');
  const dbTeam = (d.rows[0] && d.rows[0].p.team) || ((DB.extraPersons || {})[pid] || {}).team || (d.hon[0] && d.hon[0].team) || '';
  // a hand-kept current club (player_extras "current") wins; the jersey number then belongs to the old club, so it is dropped
  const team = d.current || dbTeam;
  const moved = d.current && d.current.toLowerCase() !== String(dbTeam).toLowerCase();
  const b = moved ? Object.assign({}, d.bio, { num: null }) : d.bio;
  const pos = b.pos ? (PV_POS[b.pos] || b.pos) : '';
  // the details, one short row: age, height, weight, nationality, career span, caps
  const caps = pvCapsCount(pid).all;
  // age with the birthday beside it, height, weight, nationality, national caps
  const facts = [[b.age, 'yrs', b.dob ? pvDob(b.dob) : ''], [b.ht, 'cm'], [b.wt, 'kg'], [b.nat ? PV_NAT[b.nat] || b.nat : '', ''],
    [caps || '', caps === 1 ? 'national cap' : 'national caps']]
    .filter(x => has(x[0]) && x[0] !== '');
  // behind the portrait: the crest of the last MBL team he played for (none, nothing)
  const mblRow = d.rows.filter(r => /^Major Basketball League/i.test(r.c.name || '') && r.p.team)
    .sort((x, y) => (y.c.start || String(y.c.year || '')).localeCompare(x.c.start || String(x.c.year || '')))[0];
  const mblLogo = mblRow ? teamLogo(mblRow.p.team) : null;
  // a verified badge, the player's links and the claim button come from the accounts layer
  const ax = typeof accProfile === 'function' ? accProfile(pid) : {};
  let stats = '';
  if (t) {
    const m = (t.rd && t.rd.m) || {}, g = t.g;
    const pct = k => { const x = m[k]; if (!x || x.gp == null) return ''; return `<span class="p ${x.gp >= 75 ? '' : 'mid'}" data-imtip="${esc(pvOrd(x.gp) + ' percentile in the tier')}">${x.gp >= 75 ? pvTop(x.gp) : pvOrd(x.gp)}</span>`; };
    // points, then the player's two strongest of rebounds / assists / steals / blocks, then FG%
    const pool = [['reb', 'Rebounds', t.reb], ['ast', 'Assists', t.ast], ['stl', 'Steals', t.stl], ['blk', 'Blocks', t.blk]]
      .map(x => x.concat([(m[x[0]] && m[x[0]].gp) || 0])).sort((a, b) => b[3] - a[3]).slice(0, 2)
      .sort((a, b) => ['reb', 'ast', 'stl', 'blk'].indexOf(a[0]) - ['reb', 'ast', 'stl', 'blk'].indexOf(b[0]));
    const S = [['pts', 'Points', pvF1(t.pts / g)]].concat(pool.map(x => [x[0], x[1], pvF1(x[2] / g)])).concat([['fgpct', 'FG%', pvPc(t.fgm, t.fga)]]);
    stats = `<div class="pv-bar"><div class="pv-bar-in">
      <div class="pv-scope"><label for="pv-tier">Numbers for</label>
        <div class="pv-sel">${t.logo ? `<span class="pv-clogo"><img src="${t.logo}" alt=""></span>` : ''}
          <select id="pv-tier" data-herotier>${d.tiers.map(x => `<option value="${esc(x.key)}" ${x.key === t.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
        <div class="sub">${t.g} games · ${t.firstYear === t.lastYear ? t.lastYear : t.firstYear + '–' + t.lastYear}</div></div>
      ${S.map(([k, l, v]) => `<div class="pv-stat"><div class="v">${v}</div><div class="l">${l}</div>${pct(k)}</div>`).join('')}
    </div></div>`;
  } else {
    stats = `<div class="pv-bar"><div class="pv-bar-in"><div class="pv-scope"><div class="sub">No published statistical line in any competition yet.</div></div></div></div>`;
  }
  return `<section class="pv-hero" aria-label="Player summary">
    ${ax.claim ? `<div class="acc-claim-w">${ax.claim}</div>` : ''}
    <div class="pv-in">
      <div class="pv-id">
        <div class="pv-eyebrow">${team ? crest(team, 28) + `<b>${esc(pvCase(team))}</b>` : ''}<span>${[has(b.num) ? '#' + esc(b.num) : '', esc(pos)].filter(Boolean).join(' · ')}</span>${ax.badge || ''}</div>
        <h1 class="pv-name page-title"><span>${esc(first)}</span>${last ? `<span>${esc(last)}</span>` : ''}</h1>
        ${facts.length ? `<div class="pv-dets">${facts.map(([v, u, x]) => `<span><b>${esc(v)}</b>${u ? ' ' + u : ''}${x ? ` <i>(${esc(x)})</i>` : ''}</span>`).join('')}</div>` : ''}
        ${ax.links || ''}${ax.fav ? `<div class="acc-hero-act">${ax.fav}</div>` : ''}
      </div>
      <div class="pv-photo">${mblLogo ? `<img class="pv-mbl" src="${mblLogo}" alt="" title="${esc(pvCase(mblRow.p.team) + ' · ' + (mblRow.c.label || mblRow.c.name))}">` : ''}${PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="${esc(name)}">` : `<div class="pv-initials" title="Photo slot — awaiting a portrait">${initials(nl ? nl.join(' ') : name)}</div>`}</div>
    </div>
    ${stats}
  </section>`;
}

// a small engraved glyph for each hand-kept badge: a medal, a globe for an import
// contract abroad, a star for anything else
function pvBadgeIcon(b) {
  const t = String(b).toLowerCase();
  const p = /medal/.test(t)
    ? '<path d="M7 1h2.5L8 5.2 6.5 1H7zm2.5 0H12l-2.2 4.6L8.9 4z" /><circle cx="8" cy="10.5" r="4.5" /><path class="in" d="M8 8l.9 1.8 2 .3-1.45 1.4.35 2L8 12.5l-1.8 1 .35-2L5.1 10.1l2-.3z" />'
    : /import|abroad|overseas/.test(t)
    ? '<circle cx="8" cy="8" r="6.5" /><path class="in" d="M1.8 8h12.4M8 1.6c2 2 2 10.8 0 12.8M8 1.6c-2 2-2 10.8 0 12.8M2.8 4.6h10.4M2.8 11.4h10.4" fill="none" stroke-width="1" />'
    : '<path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5l-4.2 2.3 1-4.6L1.3 6l4.7-.5z" />';
  return `<svg class="pv-bi" viewBox="0 0 16 16" aria-hidden="true">${p}</svg>`;
}
const pvSec = (title, sub, right, body, cls) => `<section class="pv-sec ${cls || ''}"><div class="pv-sec-h"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}${right ? `<span class="r">${right}</span>` : ''}</div>${body}</section>`;

/* ---- overview ---------------------------------------------------------- */
/* Honours: one row per honour (titles, MVP, Finals MVP, medals, stat awards), each a
   line of team crest · competition · year, newest first. No row, no section. */
const PV_HON_ORDER = ['Champion', 'MVP', 'Finals MVP', 'Gold medal', 'Silver medal', 'Bronze medal', 'DPOY',
  'All-Tournament First Team', 'All-Star Team', 'Top scorer', 'Top rebounder', 'Top assist', 'Top steal', 'Top block', 'Most promising tall talent'];
function pvHonours(d) {
  const by = {};
  d.hon.forEach(h => [h.champ ? 'Champion' : null].concat(h.awards).filter(Boolean).forEach(a => (by[a] = by[a] || []).push(h)));
  const keys = Object.keys(by).sort((a, b) => (PV_HON_ORDER.indexOf(a) + 1 || 99) - (PV_HON_ORDER.indexOf(b) + 1 || 99));
  const mark = h => h.team ? crest(h.team, 22) : h.mark ? crest(h.mark, 22) : '';
  const rows = keys.map(k => {
    const L = by[k].slice().sort((a, b) => b.year - a.year);
    const name = k === 'Champion' ? (L.length > 1 ? 'Titles' : 'Title') : k;
    return `<div class="pv-hr ${/Champion|MVP|Gold/.test(k) ? 'gold' : ''}"><div class="pv-hr-h"><b>${L.length}</b><span>${esc(name)}</span></div>
      <ul>${L.map(h => `<li${h.team ? ` data-imtip="${esc(pvCase(h.team))}"` : ''}>${mark(h)}${h.cid ? `<a href="#/c/${h.cid}">${esc(h.short)}</a>` : `<span class="c">${esc(h.short)}</span>`}<span class="y">${h.year}</span></li>`).join('')}</ul></div>`;
  });
  // the hand-kept recognitions (player_extras "badges"): a line of their own, under the honours
  if (d.badges.length) rows.push(`<div class="pv-hr"><div class="pv-hr-h"><b>${d.badges.length}</b><span>Also</span></div>
      <ul>${d.badges.map(b => `<li>${pvBadgeIcon(b)}<span class="c">${esc(b)}</span></li>`).join('')}</ul></div>`);
  return rows.length ? `<div class="card pv-honours">${rows.join('')}</div>` : '';
}

/* Career path: the teams he played for, by level and year. One crest per team per level per
   year (its competitions are in the hover); a line through the highest club level each year.
   The crests sit on a knockout in the card's colour, so the line passes behind them. */
const PV_LANES = [['nat', 'Malaysia'], ['sen', 'Senior'], ['dev', 'Development'], ['youth', 'Youth']];
function pvLane(short, team) {
  if (/^malaysia\b/i.test(String(team || '')) || /FIBA|SEA Games|SEABA|ASEAN|Asia Cup|Olympic/i.test(short)) return 'nat';
  const u = String(short).match(/\bU(\d{2})\b/);
  if (u) return +u[1] <= 18 ? 'youth' : 'dev';
  if (/MSSM|school|SUKIPT|junior/i.test(short)) return 'youth';
  if (/D-League|universit|IPT|varsity/i.test(short)) return 'dev';
  return 'sen';
}
function pvPath(d, avail) {
  const ev = [];
  d.rows.forEach(r => { const h = pvHonOf(d, r), ph = d.pathHon.find(p => p.cid === r.c.id);
    ev.push({ year: r.c.year, short: r.short, team: r.p.team, cid: r.c.id, g: r.p.g, pts: r.p.pts, champ: d.isTitle(r) || !!(h && h.champ),
      awards: (h ? h.awards : []).concat(ph ? ph.awards : []), placing: ph && ph.placing }); });
  d.hon.concat(d.pathHon).filter(h => !h.cid || !d.rows.some(r => r.c.id === h.cid)).forEach(h =>
    ev.push({ year: h.year, short: h.short, team: h.team || h.mark || '', cid: h.cid, champ: h.champ, awards: h.awards, placing: h.placing }));
  d.moves.forEach(m => ev.push({ year: m.year, short: m.league, team: m.team, awards: [], abroad: true }));
  const E = ev.filter(e => e.year && e.team).map(e => Object.assign(e, { lane: e.abroad ? 'sen' : pvLane(e.short, e.team), key: teamLogoKey(e.team) || flagOf(e.team) || teamSlug(e.team) }));
  if (!E.length) return '';
  const lanes = PV_LANES.filter(([k]) => E.some(e => e.lane === k));
  const y0 = Math.min(...E.map(e => e.year)), y1 = Math.max(...E.map(e => e.year)), YRS = [];
  for (let y = y0; y <= y1; y++) YRS.push(y);
  const on = new Set(E.map(e => e.year));
  // a year without an event is a narrow gap, not a full column
  // as wide as the card when the career fits; wider (the card scrolls) when it does not
  const labW = 128, W = Math.max(avail || 1240, labW + YRS.reduce((a, y) => a + (on.has(y) ? 112 : 40), 0) + 28), LH = 76, top = 16, base = top + LH * lanes.length, H = base + 44;
  const wt = YRS.map(y => on.has(y) ? 1 : 0.36), u = (W - 16 - labW - 12) / wt.reduce((a, b) => a + b, 0), X = {}, WD = {};
  let acc = labW + 12; YRS.forEach((y, i) => { X[y] = acc + wt[i] * u / 2; WD[y] = wt[i] * u; acc += wt[i] * u; });
  const LY = k => top + LH * lanes.findIndex(l => l[0] === k) + LH / 2;
  const s = [];
  lanes.forEach(([k, l], i) => {
    if (i) s.push(`<line x1="${labW}" x2="${W - 16}" y1="${top + LH * i}" y2="${top + LH * i}" class="hair"/>`);
    s.push(`<text x="16" y="${LY(k) + 4}" class="ln">${l.toUpperCase()}</text>`);
  });
  s.push(`<line x1="${labW}" x2="${labW}" y1="${top}" y2="${base}" class="ax"/><line x1="${labW}" x2="${W - 16}" y1="${base}" y2="${base}" class="ax"/>`);
  YRS.forEach(y => {
    s.push(`<line x1="${X[y]}" x2="${X[y]}" y1="${base}" y2="${base + 6}" class="ax"/>`);
    if (on.has(y)) s.push(`<line x1="${X[y]}" x2="${X[y]}" y1="${top}" y2="${base}" class="grid"/>`);
    s.push(on.has(y) ? `<text x="${X[y]}" y="${base + 27}" class="yr">${y}</text>` : `<text x="${X[y]}" y="${base + 24}" class="gap">·</text>`);
  });
  // the club line: the highest level he played each year
  const RANK = { sen: 3, dev: 2, youth: 1 };
  const tops = YRS.filter(y => on.has(y)).map(y => { const L = E.filter(e => e.year === y && RANK[e.lane]).sort((a, b) => RANK[b.lane] - RANK[a.lane]);
    return L.length ? [X[y], LY(L[0].lane), y] : null; }).filter(Boolean);
  const seg = (a, b) => { const mx = (a[0] + b[0]) / 2; return `M${a[0]},${a[1]} C${mx},${a[1]} ${mx},${b[1]} ${b[0]},${b[1]}`; };
  if (tops.length > 1) {
    s.push(`<path d="${tops.slice(1).map((t, i) => seg(tops[i], t)).join(' ')}" class="line"/>`);
    // a break in the career reads as a break
    tops.slice(1).forEach((t, i) => { if (t[2] - tops[i][2] > 1) s.push(`<path d="${seg(tops[i], t)}" class="brk"/>`); });
  }
  // the crests
  const marks = [];
  YRS.forEach(y => lanes.forEach(([k]) => {
    const T = {}; E.filter(e => e.year === y && e.lane === k).forEach(e => (T[e.key] = T[e.key] || []).push(e));
    const L = Object.values(T).sort((a, b) => b.length - a.length), step = Math.min(50, (WD[y] - 8) / Math.max(1, L.length));
    L.forEach((g, i) => marks.push({ y, k, g, x: X[y] + (i - (L.length - 1) / 2) * step, cy: LY(k) }));
  }));
  marks.filter(m => m.k === 'nat').forEach(m => { const t = tops.find(t => t[2] === m.y); if (t) s.push(`<line x1="${m.x}" x2="${m.x}" y1="${m.cy + 20}" y2="${t[1] - 20}" class="drop"/>`); });
  marks.forEach(m => {
    const e0 = m.g[0], logo = teamLogo(e0.team), fl = !logo && flagOf(e0.team), plate = logo ? crestPlate(e0.team) : '';
    const tip = [pvCase(e0.team) + ' · ' + m.y].concat(m.g.map(e => e.short + (e.g ? ' · ' + e.g + ' games' : '') + (e.champ ? ' · champion' : '')
      + (e.awards.length ? ' · ' + e.awards.join(', ') : '') + (e.placing ? ' · ' + e.placing : '') + (e.abroad ? ' · signed' : ''))).join('\n');
    const w = fl ? 36 : 38, h = fl ? 18 : 38;
    let img;
    if (logo) img = (plate ? `<rect x="-21" y="-21" width="42" height="42" rx="9" class="${plate.trim() === 'crest-logo-dark' ? 'pl-d' : 'pl-l'}"/>` : '')
      + `<image href="${logo}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
    else if (fl) img = `<image href="${FLAGS[fl]}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/><rect x="${-w / 2 - .5}" y="${-h / 2 - .5}" width="${w + 1}" height="${h + 1}" rx="2" class="fl"/>`;
    else img = `<rect x="-17" y="-17" width="34" height="34" rx="8" fill="${teamColor(e0.team)}"/><text y="4.5" class="code">${esc(teamCode(e0.team))}</text>`;
    const cid = (m.g.find(e => e.cid) || {}).cid;
    const g = `<g class="mk" transform="translate(${m.x},${m.cy})" data-imtip="${esc(tip)}"><rect x="${-w / 2 - 5}" y="${-h / 2 - 5}" width="${w + 10}" height="${h + 10}" rx="9" class="ko"/>${img}</g>`;
    s.push(cid ? `<a href="#/c/${cid}" aria-label="${esc(e0.short + ' ' + m.y)}">${g}</a>` : g);
  });
  return `<div class="card pv-cpath"><div class="pv-cpath-s" data-pid="${d.pid}"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Career path: teams by level and year">${s.join('')}</svg></div></div>`;
}
// drawn once at the default width; redrawn to the card's own width once it is on screen
function pvPathFit() {
  document.querySelectorAll('.pv-cpath-s').forEach(x => {
    const w = x.clientWidth - 24, d = PV.data && PV.data.pid === x.dataset.pid ? PV.data : pvData(x.dataset.pid);
    if (d && w > 0 && Math.abs(w - (+x.dataset.w || 0)) > 4) {
      const t = document.createElement('div'); t.innerHTML = pvPath(d, w);
      const svg = t.querySelector('svg'); if (svg) { x.innerHTML = ''; x.appendChild(svg); x.dataset.w = w; }
    }
    x.scrollLeft = x.scrollWidth;
  });
}
let PV_FIT_T = null;
window.addEventListener('resize', () => { clearTimeout(PV_FIT_T); PV_FIT_T = setTimeout(pvPathFit, 150); });
function pvGames(d) {
  return `<div class="pv-games">${d.log.slice(0, 5).map(g => `<a class="gm" href="#/c/${g.cid}/box/${g.mid}"><span class="res ${g.win ? 'w' : 'l'}">${g.win ? 'W' : 'L'}</span>
    <div class="mid"><div class="o">${crest(g.oppRaw, 20)}<span>${g.home ? 'vs' : '@'} ${esc(g.oppName)}</span><span class="sc">${g.own}–${g.opp}</span></div>
      <div class="c">${pvDay(g.date)} · ${esc(pvShortKey(g.tk))}${g.phase ? ' · ' + esc(g.phase) : ''}</div></div>
    <div class="line"><span><b>${g.l.pts}</b>pts</span> <span>${pvReb(g.l)} reb</span> <span>${g.l.ast} ast</span></div></a>`).join('')}</div>`;
}
/* ---- national team: FIBA caps (fiba_match.py), youth and senior --------- */
// a cap is a game played for Malaysia in a FIBA event; events before ~2007 publish points only
const pvCapsOf = pid => (DB.caps || {})[pid] || [];
function pvCapsCount(pid) {
  const L = pvCapsOf(pid), n = lv => L.filter(c => c.lv === lv).reduce((a, c) => a + (c.gp || 0), 0);
  return { all: n('Youth') + n('Senior'), youth: n('Youth'), senior: n('Senior'), events: L.length };
}
function pvCaps(pid) {
  const L = pvCapsOf(pid);
  if (!L.length) return '';
  const K = ['pts', 'reb', 'ast', 'stl', 'blk'];
  const pg = (v, g) => v == null || !g ? '—' : pvF1(v / g);
  const block = lv => {
    const R = L.filter(c => c.lv === lv);
    if (!R.length) return '';
    const gp = R.reduce((a, c) => a + (c.gp || 0), 0);
    // per-game over the events that publish each stat
    const avg = k => { const W = R.filter(c => c[k] != null && c.gp); const g = W.reduce((a, c) => a + c.gp, 0); return g ? pvF1(W.reduce((a, c) => a + c[k], 0) / g) : '—'; };
    const head = `<tr class="pv-tier static"><td class="left" colspan="3"><span class="tl">${lv === 'Senior' ? 'Senior national team' : 'Youth national teams'}</span><span class="ts2">${gp} cap${gp === 1 ? '' : 's'} · ${R.length} event${R.length === 1 ? '' : 's'}</span></td><td>${gp}</td>${K.map(k => `<td>${avg(k)}</td>`).join('')}</tr>`;
    return head + R.map(c => `<tr><td class="left">${c.y}</td>
      <td class="left"><span class="pv-capev">${crest('FIBA', 18)}<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.short)}</a></span></td>
      <td class="left">${c.rank ? esc(c.rank) : '<span class="dim">—</span>'}</td>
      <td>${c.gp == null ? '—' : c.gp}</td>${K.map(k => `<td${c[k] != null ? ` data-imtip="${esc(k.toUpperCase() + ' total: ' + c[k])}"` : ''}>${pg(c[k], c.gp)}</td>`).join('')}</tr>`).join('');
  };
  const n = pvCapsCount(pid);
  return pvSec('National team', `${n.all} cap${n.all === 1 ? '' : 's'}${n.senior && n.youth ? ` · ${n.senior} senior, ${n.youth} youth` : ''} · from FIBA`, '',
    `<div class="card pv-card"><div class="table-scroll"><table class="pv-table pv-caps"><thead><tr><th class="left nosort">Year</th><th class="left nosort">Event</th><th class="left nosort">Malaysia finished</th><th class="nosort">Caps</th>${K.map(k => `<th class="nosort"${gloss(k === 'pts' ? 'PTS' : k === 'reb' ? 'REB' : k.toUpperCase())}>${k === 'pts' ? 'PTS' : k === 'reb' ? 'REB' : k.toUpperCase()}</th>`).join('')}</tr></thead>
      <tbody>${block('Senior')}${block('Youth')}</tbody></table></div></div>
     <div class="pv-note">Caps are games played for Malaysia at FIBA events, per game, from each event's FIBA statistics page. Events before about 2007 publish points only; their other columns show a dash. Hover a figure for the total.</div>`);
}
// the overview, kept short: honours, the career path, the latest games. The national-team
// table and the career highs live on the Stats tab and the Game log.
function pvOverview(pid, d) {
  const hon = pvHonours(d), path = pvPath(d);
  return (typeof accProfile === 'function' ? accProfile(pid).about : '')
    + (hon ? pvSec('Honours', '', '', hon) : '')
    + (path ? pvSec('Career path', '', '', path) : '')
    + (d.log.length ? pvSec('Latest games', '', `<a href="#/p/${pid}/log">Game log →</a>`, pvGames(d)) : '');
}

/* ---- stats ------------------------------------------------------------- */
const PV_COLS = {
  pg: [['G', p => p.g], ['MIN', p => pvF1(pvMin(p.min) / p.g)], ['PTS', p => pvF1(p.pts / p.g)], ['REB', p => pvF1(p.reb / p.g)], ['AST', p => pvF1(p.ast / p.g)],
       ['STL', p => pvF1(p.stl / p.g)], ['BLK', p => pvF1(p.blk / p.g)], ['TOV', p => pvF1(p.tov / p.g)], ['FG%', p => pvPc(p.fgm, p.fga)],
       ['3P%', p => pvPc(p.tpm, p.tpa)], ['FT%', p => pvPc(p.ftm, p.fta)], ['TS%', p => pvF1(pvTs(p))], ['EFF', p => pvF1(p.eff / p.g)]],
  tot: [['G', p => p.g], ['MIN', p => pvF0(pvMin(p.min))], ['PTS', p => p.pts], ['REB', p => p.reb], ['OREB', p => p.oreb], ['DREB', p => p.dreb], ['AST', p => p.ast],
        ['STL', p => p.stl], ['BLK', p => p.blk], ['TOV', p => p.tov], ['PF', p => p.pf], ['+/-', p => pvSg(p.pm)], ['EFF', p => p.eff]],
  sh: [['FGM–A', p => p.fgm + '–' + p.fga], ['FG%', p => pvPc(p.fgm, p.fga)], ['2PM–A', p => p.twopm + '–' + p.twopa], ['2P%', p => pvPc(p.twopm, p.twopa)],
       ['3PM–A', p => p.tpm + '–' + p.tpa], ['3P%', p => pvPc(p.tpm, p.tpa)], ['FTM–A', p => p.ftm + '–' + p.fta], ['FT%', p => pvPc(p.ftm, p.fta)],
       ['eFG%', p => p.fga ? pvF1((p.fgm + 0.5 * p.tpm) / p.fga * 100) : '—'], ['TS%', p => pvF1(pvTs(p))], ['3PA rate', p => pvPc(p.tpa, p.fga)], ['FTA rate', p => pvPc(p.fta, p.fga)]],
};
function pvSum(lines) {
  const o = { min: 0 }; const K = ['g', 'w', 'l', 'pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm', 'eff', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta'];
  lines.forEach(p => { K.forEach(k => { o[k] = (o[k] || 0) + (Number(p[k]) || 0); }); o.min += pvMin(p.min); });
  if (!o.reb) o.reb = o.oreb + o.dreb;
  return o;
}
const pvLine = p => Object.assign({}, p, { reb: has(p.reb) ? p.reb : (p.oreb || 0) + (p.dreb || 0) });
function pvCareer(pid, d) {
  const C = PV_COLS[PV.mode] || PV_COLS.pg;
  if (!PV.open) PV.open = new Set(d.tiers.slice(0, 2).map(t => t.key));
  const body = d.tiers.map(t => {
    const rs = d.rows.filter(r => r.tk === t.key), open = PV.open.has(t.key), tot = pvSum(rs.map(r => pvLine(r.p)));
    const head = `<tr class="pv-tier ${open ? 'open' : ''}" data-pvopen="${esc(t.key)}"><td class="left" colspan="3"><span class="car">▸</span><span class="tl">${esc(t.label)}</span><span class="ts2">${t.firstYear === t.lastYear ? t.lastYear : t.firstYear + '–' + t.lastYear} · ${rs.length} competition${rs.length > 1 ? 's' : ''}</span></td>${C.map(([, f]) => `<td>${f(tot)}</td>`).join('')}</tr>`;
    if (!open) return head;
    return head + rs.map(r => {
      const h = pvHonOf(d, r), win = d.isTitle(r) || (h && h.champ);
      const sub = r.c.split ? [['Regular season', phaseSplitLine(r.c, 'rs', pid, r.p.team)], ['Playoffs', phaseSplitLine(r.c, 'po', pid, r.p.team)]]
        .map(([n, p]) => p && p.g ? `<tr class="pv-sub"><td class="left"></td><td class="left"><span class="pv-tag ${n === 'Playoffs' ? 'po' : ''}">${n}</span></td><td></td>${C.map(([, f]) => `<td>${f(pvLine(p))}</td>`).join('')}</tr>` : '').join('') : '';
      return `<tr><td class="left">${r.c.year || ''}</td><td class="left"><a href="#/c/${r.c.id}">${esc(r.c.label || r.c.name)}</a>${win ? ' <span class="pv-tag gold">★ Champion</span>' : ''}${h ? h.awards.map(a => ` <span class="pv-tag ${pvTagCls(a)}">${esc(a)}</span>`).join('') : ''}</td>
        <td class="left"><span class="pv-teamc">${r.p.team ? crest(r.p.team, 18) + esc(pvCase(r.p.team)) : '—'}</span></td>${C.map(([, f]) => `<td>${f(pvLine(r.p))}</td>`).join('')}</tr>${sub}`;
    }).join('');
  }).join('');
  return pvSec('Career by competition', 'one line per tier; open a tier for its competitions',
    `<button class="pv-link" data-pvopenall="1">${PV.open.size === d.tiers.length ? 'Close all' : 'Open all'}</button><span class="seg">${[['pg', 'Per game'], ['tot', 'Totals'], ['sh', 'Shooting']].map(([k, l]) => `<button class="seg-btn ${PV.mode === k ? 'seg-on' : ''}" data-pvmode="${k}">${l}</button>`).join('')}</span>`,
    `<div class="card pv-card"><div class="table-scroll"><table class="pv-table"><thead><tr><th class="left nosort">Year</th><th class="left nosort">Competition</th><th class="left nosort">Team</th>${C.map(([h]) => `<th class="nosort"${gloss(h)}>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>
     <div class="pv-note">A tier's line adds its competitions together. There is no career per-game line across tiers.</div>`);
}
function pvRsPo(pid, d) {
  const split = d.rows.filter(r => r.c.split);
  const rs = pvSum(split.map(r => phaseSplitLine(r.c, 'rs', pid, r.p.team)).filter(Boolean).map(pvLine));
  const po = pvSum(split.map(r => phaseSplitLine(r.c, 'po', pid, r.p.team)).filter(Boolean).map(pvLine));
  if (!rs.g || !po.g) return '';
  const K = [['Games', p => p.g, 0], ['Minutes', p => p.min / p.g, 1], ['Points', p => p.pts / p.g, 1], ['Rebounds', p => p.reb / p.g, 1], ['Assists', p => p.ast / p.g, 1],
             ['Steals', p => p.stl / p.g, 1], ['Turnovers', p => p.tov / p.g, -1], ['FG%', p => p.fga ? p.fgm / p.fga * 100 : null, 1], ['3P%', p => p.tpa ? p.tpm / p.tpa * 100 : null, 1], ['TS%', p => pvTs(p), 1]];
  return pvSec('Regular season vs playoffs', esc(split.map(r => r.short + ' ' + r.c.year).join(' + ')) + ', per game', '',
    `<div class="card pv-card"><div class="pv-cmp"><div class="h">Regular season</div><div class="h"></div><div class="h r">Playoffs</div>
    ${K.map(([n, f, dir]) => { const a = f(rs), b = f(po), ba = dir && a != null && b != null && (dir > 0 ? a > b : a < b), bb = dir && a != null && b != null && !ba && a !== b;
      return `<div class="a"><b class="${ba ? 'better' : ''}">${dir === 0 ? a : pvF1(a)}</b></div><div class="k">${n}</div><div class="b"><b class="${bb ? 'better' : ''}">${dir === 0 ? b : pvF1(b)}</b></div>`; }).join('')}
    <div class="a"><b>${rs.w || 0}–${rs.l || 0}</b></div><div class="k">Team record</div><div class="b"><b>${po.w || 0}–${po.l || 0}</b></div></div></div>
    <div class="pv-note">Green marks the better side. Team record is wins and losses in the games played.</div>`);
}
function pvShots(t) {
  if (!t || !t.fga) return '';
  const a2 = t.twopa || 0, a3 = t.tpa || 0, ft = 0.44 * (t.fta || 0), s = a2 + a3 + ft, m = (t.rd && t.rd.m) || {};
  const segs = [['2-point attempts', a2, 'var(--accent)', pvPc(t.twopm, t.twopa)], ['3-point attempts', a3, 'oklch(66% 0.12 200)', pvPc(t.tpm, t.tpa)], ['Free-throw trips', ft, 'var(--pv-bar)', pvPc(t.ftm, t.fta)]];
  const pts = [['From 2', (t.twopm || 0) * 2], ['From 3', (t.tpm || 0) * 3], ['Free throws', t.ftm || 0]];
  return pvSec('Shot diet', esc(t.label), '', `<div class="card pv-card"><div class="pv-mix-l">Share of scoring attempts</div>
    <div class="pv-mix">${segs.map(([n, v, c]) => `<span style="width:${v / s * 100}%;background:${c}" title="${n}"></span>`).join('')}</div>
    <div class="pv-legend">${segs.map(([n, v, c, p]) => `<span><i style="background:${c}"></i>${n} ${pvF0(v / s * 100)}% · made ${p}%</span>`).join('')}</div>
    <table><thead><tr><th class="left nosort">Where the points came from</th><th class="nosort">Points</th><th class="nosort">Share</th></tr></thead><tbody>
    ${pts.map(([n, v]) => `<tr><td class="left">${n}</td><td>${v}</td><td>${t.pts ? pvF0(v / t.pts * 100) + '%' : '—'}</td></tr>`).join('')}</tbody></table>
    ${m.fgpct && m.fgpct.med != null ? `<div class="pv-note in">FG% ${pvF1(m.fgpct.v)} against a tier median of ${pvF1(m.fgpct.med)}${m.tppct && m.tppct.v != null ? `; 3P% ${pvF1(m.tppct.v)} against ${pvF1(m.tppct.med)}` : ''}.</div>` : ''}</div>`);
}
/* Club seasons abroad (data/player_extras.json "abroad"): lines copied by hand from the league's own
   player page, per game with the total on hover (a league that publishes only averages, per: "game",
   is shown as published). They sit apart from the database and never enter his tier lines or career numbers. */
function pvAbroad(pid) {
  const L = ((DB.playerExtras || {})[pid] || {}).abroad || [];
  if (!L.length) return '';
  const K = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TOV'], ['pf', 'PF']];
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const rows = L.map(r => { const g = r.g || 0, avg = r.per === 'game', mn = avg ? +r.min || 0 : pvMin(r.min);
    const cell = (v, h) => avg ? `<td>${v != null ? pvF1(v) : '—'}</td>` : `<td${v != null ? ` data-imtip="${esc(h + ' total: ' + v)}"` : ''}>${v != null && g ? pvF1(v / g) : '—'}</td>`;
    return `<tr><td class="left">${esc(r.year)}</td>
      <td class="left">${r.src ? `<a href="${esc(r.src)}" target="_blank" rel="noopener" title="${esc(r.name || r.comp)}">${esc(r.comp)}</a>` : esc(r.comp)}</td>
      <td class="left"><span class="pv-teamc">${r.team ? crest(r.team, 18) + esc(r.team) : '—'}</span></td>
      <td>${g || '—'}</td>${avg ? `<td>${mn ? pvF1(mn) : '—'}</td>` : `<td${mn ? ` data-imtip="${esc('MIN total: ' + r.min)}"` : ''}>${mn && g ? pvF1(mn / g) : '—'}</td>`}
      ${K.map(([k, h]) => cell(r[k], h)).join('')}
      <td>${r.fgp != null ? pvF1(r.fgp) : '—'}</td><td>${r.tpp != null ? pvF1(r.tpp) : '—'}</td><td>${r.ftp != null ? pvF1(r.ftp) : '—'}</td></tr>`; }).join('');
  const srcs = [...new Set(L.map(r => host(r.src)).filter(Boolean))];
  const g = L.reduce((t, r) => t + (r.g || 0), 0);
  return pvSec('Club seasons abroad', `${g} game${g === 1 ? '' : 's'} · ${L.length} season${L.length === 1 ? '' : 's'}${srcs.length ? ' · from ' + esc(srcs.join(', ')) : ''}`, '',
    `<div class="card pv-card"><div class="table-scroll"><table class="pv-table pv-caps"><thead><tr><th class="left nosort">Season</th><th class="left nosort">League</th><th class="left nosort">Team</th><th class="nosort">G</th><th class="nosort"${gloss('MIN')}>MIN</th>${K.map(([, h]) => `<th class="nosort"${gloss(h)}>${h}</th>`).join('')}<th class="nosort"${gloss('FG%')}>FG%</th><th class="nosort"${gloss('3P%')}>3P%</th><th class="nosort"${gloss('FT%')}>FT%</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
     <div class="pv-note">Per game, as the league publishes them; hover a figure for the total where the league gives totals. These games are outside the database, so they are not in his career lines above. A dash: the league's page leaves it blank.</div>`);
}
function pvStats(pid, d, t) {
  const ab = pvAbroad(pid);
  if (!d.tiers.length) return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No published statistical line in any competition in the database yet.</div></div>` + ab;
  const rp = pvRsPo(pid, d), sh = pvShots(t);
  return pvCareer(pid, d) + (rp || sh ? `<div class="pv-two ${rp && sh ? '' : 'one'}">${rp}${sh}</div>` : '') + ab + pvCaps(pid);
}

/* ---- game log ---------------------------------------------------------- */
function pvLog(pid, d) {
  if (!d.log.length) return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No box score covering this player has been published by the source.</div></div>`;
  const comps = []; d.log.forEach(g => { if (!comps.includes(g.cid)) comps.push(g.cid); });
  if (!PV.comp || !comps.includes(PV.comp)) PV.comp = comps[0];
  const G = d.log.filter(g => g.cid === PV.comp).slice().sort((a, b) => a.date.localeCompare(b.date));
  const c = COMP_BY_ID[PV.comp], n = G.length, sum = f => G.reduce((a, g) => a + (Number(f(g)) || 0), 0), avg = sum(g => g.l.pts) / n, w = G.filter(g => g.win).length;
  const hi = { pts: Math.max(...G.map(g => g.l.pts || 0)), reb: Math.max(...G.map(g => pvReb(g.l))), ast: Math.max(...G.map(g => g.l.ast || 0)), stl: Math.max(...G.map(g => g.l.stl || 0)), eff: Math.max(...G.map(g => g.l.eff || 0)) };
  const W = 1180, H = 170, L = 30, R = 8, T = 12, B = 14, max = Math.max(10, Math.ceil(Math.max(...G.map(g => g.l.pts || 0)) / 10) * 10);
  const x = i => L + (i + 0.5) * (W - L - R) / n, bw = Math.min(34, (W - L - R) / n - 5), y = v => T + (H - T - B) * (1 - v / max);
  const title = c && d.rows.find(r => r.c.id === c.id);
  return pvSec('Game log', 'one tab per competition, newest first', '', `<div class="card pv-card">
    <div class="pv-chips" role="tablist">${comps.map(id => { const cc = COMP_BY_ID[id], k = d.log.filter(g => g.cid === id).length, r = d.rows.find(x => x.c.id === id);
      return `<button class="pv-chip ${id === PV.comp ? 'on' : ''}" data-pvcomp="${id}" role="tab" aria-selected="${id === PV.comp}"><div class="t">${esc(pvShortKey(tierKey(cc)))} ${cc.year || ''}</div><div class="s">${k} game${k === 1 ? '' : 's'}${r && d.isTitle(r) ? ' · ★ champion' : ''}</div></button>`; }).join('')}</div>
    <div class="pv-lgsum"><div class="k first"><div class="t"><a href="#/c/${c.id}">${esc(c.label || c.name)}</a><small>${esc(pvCase(G[0].l.team || ''))}</small></div></div>
      <div class="k"><b>${w}–${n - w}</b><span>Record</span></div><div class="k"><b>${pvF1(avg)}</b><span>PPG</span></div>
      <div class="k"><b>${pvF1(sum(g => pvReb(g.l)) / n)}</b><span>RPG</span></div><div class="k"><b>${pvF1(sum(g => g.l.ast) / n)}</b><span>APG</span></div>
      <div class="k"><b>${pvF1(sum(g => g.min) / n)}</b><span>MPG</span></div></div>
    <div class="pv-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points in each game">
      ${[0, max / 2, max].map(v => `<line class="pv-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="pv-ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
      ${G.map((g, i) => `<rect x="${x(i) - bw / 2}" y="${y(g.l.pts || 0)}" width="${bw}" height="${Math.max(1, y(0) - y(g.l.pts || 0))}" rx="3" fill="${g.phase ? 'var(--accent-2)' : g.win ? 'var(--accent)' : 'var(--pv-bar)'}"
        data-imtip="${esc(pvDay(g.date) + '\n' + (g.home ? 'vs ' : '@ ') + g.oppName + ' · ' + (g.win ? 'W ' : 'L ') + g.own + '–' + g.opp + '\n' + (g.l.pts || 0) + ' pts · ' + pvReb(g.l) + ' reb · ' + (g.l.ast || 0) + ' ast' + (g.phase ? '\n' + g.phase : ''))}"/>`).join('')}
      <line x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--text-muted)" stroke-dasharray="4 4"/>
      <text class="pv-ax" x="${W - R}" y="${y(avg) - 5}" text-anchor="end" style="fill:var(--text-muted)">avg ${pvF1(avg)}</text>
    </svg></div>
    <div class="pv-legend"><span><i style="background:var(--accent)"></i>Win</span><span><i style="background:var(--pv-bar)"></i>Loss</span>${G.some(g => g.phase) ? '<span><i style="background:var(--accent-2)"></i>Playoff game</span>' : ''}<span>Bar height is points</span></div>
    <div class="table-scroll"><table class="pv-table"><thead><tr><th class="left nosort">Date</th><th class="left nosort">Opponent</th><th class="left nosort">Result</th>${['MIN', 'PTS', 'FG', '3P', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF', '+/-', 'EFF'].map(h => `<th class="nosort"${gloss(h)}>${h}</th>`).join('')}</tr></thead>
    <tbody>${G.slice().reverse().map(g => { const l = g.l, reb = pvReb(l), h = (k, v) => v === hi[k] && v > 0 ? 'pv-hi' : '';
      return `<tr class="clickable" onclick="HS.go('#/c/${g.cid}/box/${g.mid}')"><td class="left">${pvDay(g.date, false)}</td><td class="left"><span class="pv-teamc">${g.home ? 'vs' : '@'} ${crest(g.oppRaw, 18)}${esc(g.oppName)}</span></td>
      <td class="left"><span class="pv-wl ${g.win ? 'w' : 'l'}">${g.win ? 'W' : 'L'}</span>${g.own}–${g.opp}${g.phase ? ` <span class="pv-tag po">${esc(g.phase)}</span>` : ''}</td>
      <td>${Math.round(g.min)}</td><td class="${h('pts', l.pts)}">${fmt0(l.pts)}</td><td>${fmt0(l.fgm)}–${fmt0(l.fga)}</td><td>${fmt0(l.tpm)}–${fmt0(l.tpa)}</td><td>${fmt0(l.ftm)}–${fmt0(l.fta)}</td>
      <td class="${h('reb', reb)}">${reb}</td><td class="${h('ast', l.ast)}">${fmt0(l.ast)}</td><td class="${h('stl', l.stl)}">${fmt0(l.stl)}</td><td>${fmt0(l.blk)}</td><td>${fmt0(l.tov)}</td><td>${fmt0(l.pf)}</td><td>${fmtPM(l.pm)}</td><td class="${h('eff', l.eff)}">${fmt0(l.eff)}</td></tr>`; }).join('')}
    <tr class="pv-tot"><td class="left">Average</td><td class="left"></td><td class="left">${w}–${n - w}</td><td>${pvF1(sum(g => g.min) / n)}</td><td>${pvF1(avg)}</td>
      <td>${pvPc(sum(g => g.l.fgm), sum(g => g.l.fga))}%</td><td>${pvPc(sum(g => g.l.tpm), sum(g => g.l.tpa))}%</td><td>${pvPc(sum(g => g.l.ftm), sum(g => g.l.fta))}%</td>
      ${[g => pvReb(g.l), g => g.l.ast, g => g.l.stl, g => g.l.blk, g => g.l.tov, g => g.l.pf].map(f => `<td>${pvF1(sum(f) / n)}</td>`).join('')}
      <td>${pvSg(sum(g => g.l.pm))}</td><td>${pvF1(sum(g => g.l.eff) / n)}</td></tr></tbody></table></div>
    <div class="pv-note in">Blue figures are the best in this competition. Each row opens that game's box score${title && d.isTitle(title) ? '. ★ This competition was won.' : '.'}</div></div>`);
}

/* ---- advanced ---------------------------------------------------------- */
function pvRange(o, s) {
  const x = q => Math.max(0, Math.min(100, (q + s) / (2 * s) * 100)), dn = o.v < 0 ? 'dn' : '';
  return `<div class="pv-range" data-imtip="80% of resamples land between ${pvSg(Math.round(o.lo * 10) / 10)} and ${pvSg(Math.round(o.hi * 10) / 10)}. Scale −${s} to +${s}; the line is zero."><div class="z"></div><div class="sp ${dn}" style="left:${x(o.lo)}%;width:${Math.max(1, x(o.hi) - x(o.lo))}%"></div><div class="pt ${dn}" style="left:calc(${x(o.v)}% - 2px)"></div></div>`;
}
function pvAdv(pid, d, t) {
  let snap = '';
  if (t) {
    const rows = d.rows.filter(r => r.tk === t.key);
    const A = rows.map(r => ({ r, a: advRow(r.c.id, pid), b: bpmRow(r.c.id, pid), o: onoffRow(r.c.id, pid) }));
    const mp = A.reduce((s, x) => s + (x.a ? x.a.mp : 0), 0), w = k => mp ? A.reduce((s, x) => s + (x.a ? x.a[k] * x.a.mp : 0), 0) / mp : null;
    const bp = A.reduce((s, x) => s + (x.b ? x.b.poss : 0), 0), bpm = bp ? A.reduce((s, x) => s + (x.b ? x.b.bpm * x.b.poss : 0), 0) / bp : null;
    const op = A.reduce((s, x) => s + (x.o ? x.o.poss : 0), 0), od = op ? A.reduce((s, x) => s + (x.o ? x.o.d * x.o.poss : 0), 0) / op : null;
    const r1 = v => v == null ? null : Math.round(v * 10) / 10;
    snap = pvSec('Impact in ' + esc(t.label), 'weighted across the tier; change the tier in the header', `<a href="#/formulas">How these are worked out →</a>`, `<div class="pv-snap">
      <div><div class="l">BPM</div><div class="v ${bpm == null ? '' : bpm >= 0 ? 'pos' : 'neg'}">${pvSg(r1(bpm))}</div><div class="s">points per 100 possessions above an average player</div></div>
      <div><div class="l">PER</div><div class="v">${pvF1(w('per'))}</div><div class="s">15 is average</div></div>
      <div><div class="l">Win Shares</div><div class="v">${mp ? pvF1(A.reduce((s, x) => s + (x.a ? x.a.ws : 0), 0)) : '—'}</div><div class="s">${mp ? pvF1(w('usg')) + '% of team plays used' : 'not rated'}</div></div>
      <div><div class="l">On/off</div><div class="v ${od == null ? '' : od >= 0 ? 'pos' : 'neg'}">${pvSg(r1(od))}</div><div class="s">team net per 100, on minus off</div></div></div>`);
  }
  const rated = d.rows.filter(r => advRow(r.c.id, pid));
  const ratings = rated.length ? pvSec('Ratings by competition', 'models, with 80% ranges', '', `<div class="card pv-card"><div class="table-scroll"><table class="pv-table">
    <thead><tr><th class="left nosort">Year</th><th class="left nosort">Competition</th>${['MIN', 'PER', 'USG%', 'ORtg', 'DRtg', 'WS', 'WS/40', 'BPM'].map(h => `<th class="nosort"${gloss(h)}>${h}</th>`).join('')}<th class="left nosort" style="min-width:170px">BPM range</th><th class="nosort"${gloss('VORP')}>VORP</th><th class="nosort">Rank</th></tr></thead>
    <tbody>${d.tiers.map(tt => { const x = rated.filter(r => r.tk === tt.key); if (!x.length) return '';
      return `<tr class="pv-tier static"><td class="left" colspan="13"><span class="tl">${esc(tt.label)}</span></td></tr>` + x.map(r => { const a = advRow(r.c.id, pid), b = bpmRow(r.c.id, pid), st = bpmStanding(r.c.id, pid);
        return `<tr><td class="left">${r.c.year || ''}</td><td class="left"><a href="#/c/${r.c.id}">${esc(r.short)}</a>${d.isTitle(r) ? ' <span class="pv-tag gold">★ Champion</span>' : ''}</td><td>${pvF0(a.mp)}</td><td>${pvF1(a.per)}</td><td>${pvF1(a.usg)}</td><td>${pvF1(a.ortg)}</td><td>${pvF1(a.drtg)}</td>
          <td>${pvF1(a.ws)}</td><td>${has(a.ws40) ? Number(a.ws40).toFixed(3) : '—'}</td><td class="${b ? (b.bpm >= 0 ? 'pos' : 'neg') : ''}">${b ? pvSg(Math.round(b.bpm * 10) / 10) : '—'}</td>
          <td class="left">${b ? pvRange({ v: b.bpm, lo: b.lo, hi: b.hi }, 20) : ''}</td><td>${b ? pvF1(b.vorp) : '—'}</td><td>${st ? st.rank + ' <span class="pv-dim">of ' + st.n + '</span>' : '—'}</td></tr>`; }).join(''); }).join('')}
    </tbody></table></div><div class="pv-note in">The bar spans the middle 80% of resampled games; the scale runs −20 to +20 with zero in the middle. Rank is among players in that competition with enough possessions.</div></div>`) : '';
  const oo = d.rows.filter(r => onoffRow(r.c.id, pid));
  const onoff = oo.length ? pvSec('On/off', 'team net rating with the player on and off the floor', '', `<div class="card pv-card"><div class="table-scroll"><table class="pv-table">
    <thead><tr><th class="left nosort">Year</th><th class="left nosort">Competition</th><th class="nosort">G</th><th class="nosort">MIN</th><th class="nosort">On</th><th class="nosort">Off</th><th class="nosort">Diff</th><th class="left nosort" style="min-width:170px">Range</th><th class="nosort">+/-</th></tr></thead>
    <tbody>${oo.map(r => { const o = onoffRow(r.c.id, pid); return `<tr><td class="left">${r.c.year || ''}</td><td class="left">${esc(r.short)}</td><td>${o.g}</td><td>${pvF0(o.min)}</td><td>${pvSg(o.on)}</td><td>${pvSg(o.off)}</td>
      <td class="${o.d >= 0 ? 'pos' : 'neg'}">${pvSg(o.d)}</td><td class="left">${pvRange({ v: o.d, lo: o.lo, hi: o.hi }, 30)}</td><td>${pvSg(o.pm)}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="pv-note in">From lineups rebuilt out of the play-by-play. Scale −30 to +30. Small samples swing hard, which the width of each range shows.</div></div>`) : '';
  return snap + ratings + onoff || `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No advanced ratings: none of this player's competitions has enough box-score detail.</div></div>`;
}

/* ---- splits (inside one tier; no home/away: games are at shared venues) -- */
function pvSplits(pid, d) {
  const withLog = d.tiers.filter(t => d.log.some(g => g.tk === t.key));
  if (!withLog.length) return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>Splits need box scores, and none has been published for this player.</div></div>`;
  if (!PV.split || !withLog.some(t => t.key === PV.split)) PV.split = (withLog.find(t => t.key === heroTierFor(pid, d.tiers)) || withLog[0]).key;
  const G = d.log.filter(g => g.tk === PV.split);
  const line = gs => { const n = gs.length; if (!n) return null; const s = k => gs.reduce((a, g) => a + (Number(g.l[k]) || 0), 0);
    const fga = s('fga'), fta = s('fta'), den = fga + 0.44 * fta;
    return { n, w: gs.filter(g => g.win).length, min: gs.reduce((a, g) => a + g.min, 0) / n, pts: s('pts') / n, reb: gs.reduce((a, g) => a + pvReb(g.l), 0) / n, ast: s('ast') / n,
      stl: s('stl') / n, tov: s('tov') / n, fg: fga ? s('fgm') / fga * 100 : null, tp: s('tpa') ? s('tpm') / s('tpa') * 100 : null, ts: den ? s('pts') / (2 * den) * 100 : null, pm: s('pm') / n }; };
  const half = (() => { const byC = {}; G.forEach(g => (byC[g.cid] = byC[g.cid] || []).push(g)); const f = [], s = [];
    Object.values(byC).forEach(a => { a.sort((x, y) => x.date.localeCompare(y.date)); a.forEach((g, i) => (i < a.length / 2 ? f : s).push(g)); }); return [f, s]; })();
  const groups = [
    ['Result', [['Wins', G.filter(g => g.win)], ['Losses', G.filter(g => !g.win)]]],
    ['Minutes', [['30 or more', G.filter(g => g.min >= 30)], ['20 to 30', G.filter(g => g.min >= 20 && g.min < 30)], ['Under 20', G.filter(g => g.min < 20)]]],
    ['Margin', [['Won or lost by 10+', G.filter(g => Math.abs(g.own - g.opp) >= 10)], ['Within 10', G.filter(g => Math.abs(g.own - g.opp) < 10)]]],
    ['Season half', [['First half of each competition', half[0]], ['Second half', half[1]]]],
  ];
  const cells = x => `<td>${x.n}</td><td>${x.w}–${x.n - x.w}</td><td>${pvF1(x.min)}</td><td>${pvF1(x.pts)}</td><td>${pvF1(x.reb)}</td><td>${pvF1(x.ast)}</td><td>${pvF1(x.stl)}</td><td>${pvF1(x.tov)}</td><td>${pvF1(x.fg)}</td><td>${pvF1(x.tp)}</td><td>${pvF1(x.ts)}</td><td>${pvSg(Math.round(x.pm * 10) / 10)}</td>`;
  const seg = `<span class="seg">${withLog.map(t => `<button class="seg-btn ${t.key === PV.split ? 'seg-on' : ''}" data-pvsplit="${esc(t.key)}">${esc(t.short)}</button>`).join('')}</span>`;
  const tbl = pvSec('Splits', 'per game, inside one tier', seg, `<div class="card pv-card"><div class="table-scroll"><table class="pv-table">
    <thead><tr><th class="left nosort">Split</th>${['G', 'W–L', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'TOV', 'FG%', '3P%', 'TS%', '+/-'].map(h => `<th class="nosort">${h}</th>`).join('')}</tr></thead>
    <tbody><tr class="pv-tot"><td class="left">All ${G.length} games</td>${cells(line(G))}</tr>
    ${groups.map(([h, rows]) => `<tr class="pv-tier static"><td class="left" colspan="13">${h}</td></tr>` + rows.map(([n, gs]) => { const x = line(gs); return x ? `<tr><td class="left">${n}</td>${cells(x)}</tr>` : `<tr><td class="left">${n}</td><td colspan="12" class="left pv-dim">no games</td></tr>`; }).join('')).join('')}
    </tbody></table></div><div class="pv-note in">Every split stays inside the chosen tier. There is no home/away split: tournament games are played at shared venues.</div></div>`);
  const opp = {}; G.forEach(g => { (opp[g.oppName] = opp[g.oppName] || []).push(g); });
  const O = Object.entries(opp).filter(([, a]) => a.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const vs = pvSec('Against each opponent', 'met twice or more in this tier', '', `<div class="card pv-card"><div class="table-scroll"><table class="pv-table">
    <thead><tr><th class="left nosort">Opponent</th>${['G', 'W–L', 'PTS', 'REB', 'AST', 'TS%'].map(h => `<th class="nosort">${h}</th>`).join('')}<th class="nosort">Best</th></tr></thead><tbody>
    ${O.length ? O.map(([n, a]) => { const x = line(a), best = a.reduce((m, g) => (g.l.pts || 0) > (m.l.pts || 0) ? g : m);
      return `<tr><td class="left"><span class="pv-teamc">${crest(a[0].oppRaw, 18)}${esc(n)}</span></td><td>${x.n}</td><td>${x.w}–${x.n - x.w}</td><td>${pvF1(x.pts)}</td><td>${pvF1(x.reb)}</td><td>${pvF1(x.ast)}</td><td>${pvF1(x.ts)}</td><td class="pv-dim">${best.l.pts} pts, ${best.date.slice(0, 4)}</td></tr>`; }).join('')
      : '<tr><td class="left pv-dim" colspan="8">No opponent met twice in this tier.</td></tr>'}</tbody></table></div></div>`);
  return tbl + vs;
}

/* ---- page -------------------------------------------------------------- */
function renderPlayer(pid, tab) {
  if (PROFILE.pid !== pid) {
    PROFILE.pid = pid; PROFILE.heroTier = null;
    PV.pid = pid; PV.mode = 'pg'; PV.open = null; PV.comp = null; PV.split = null; PV.data = null;
  }
  const name = PERSONS[pid];
  if (!name) return `<div class="page"><div class="card"><div class="note" style="border-top:none;">Player not found.</div></div></div>`;
  tab = PV_OLD_TAB[tab] || tab;
  // the Shot map tab, for players with shots in a competition whose charts the sync reads
  let tabs = typeof smHas === 'function' && smHas(pid) ? PV_TABS.concat([['shots', 'Shot map']]) : PV_TABS;
  // the Report tab, for every player with a line that has minutes
  if (typeof rpHas === 'function' && rpHas(pid)) tabs = tabs.concat([['report', 'Report']]);
  if (!tabs.some(x => x[0] === tab)) tab = 'overview';
  const d = pvData(pid);
  const t = d.tiers.find(x => x.key === heroTierFor(pid, d.tiers)) || null;
  const body = tab === 'report' ? rpTab(pid) : tab === 'shots' ? smTab(pid) : tab === 'stats' ? pvStats(pid, d, t) : tab === 'log' ? pvLog(pid, d) : tab === 'adv' ? pvAdv(pid, d, t) : tab === 'splits' ? pvSplits(pid, d) : pvOverview(pid, d);
  return `<div class="pv">
    ${pvHero(pid, d, t)}
    <div class="page pv-page">
      <nav class="pv-tabs" role="tablist" aria-label="Player sections">${tabs.map(([k, l]) => `<a href="#/p/${pid}/${k}" class="${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}">${l}${k === 'log' && d.log.length ? `<span class="n">${d.log.length}</span>` : ''}</a>`).join('')}</nav>
      ${body}
    </div>
  </div>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-pvopen],[data-pvopenall],[data-pvmode],[data-pvcomp],[data-pvsplit]');
  if (!b) return;
  e.preventDefault();
  const d = PV.data;
  if (b.dataset.pvopen && PV.open) { const k = b.dataset.pvopen; PV.open.has(k) ? PV.open.delete(k) : PV.open.add(k); }
  if (b.dataset.pvopenall && d) PV.open = PV.open && PV.open.size === d.tiers.length ? new Set() : new Set(d.tiers.map(t => t.key));
  if (b.dataset.pvmode) PV.mode = b.dataset.pvmode;
  if (b.dataset.pvcomp) PV.comp = b.dataset.pvcomp;
  if (b.dataset.pvsplit) PV.split = b.dataset.pvsplit;
  softRoute();
});
