/* =========================================================================
   Player profile, v2 layout (approved from the mockup, 2026-09-29).

   One focal point per screen: a full-width hero with the name, honours and
   four big numbers for one tier, then five tabs — Overview, Stats, Game log,
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
  const bio = typeof accOverBio === 'function' ? accOverBio(pid, Object.assign({}, bio0)) : bio0;
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
const pvCount = (d, a) => d.hon.filter(h => h.awards.includes(a)).length;

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
  // honours pills: MVP and Finals MVP are counted apart, then titles, then stat awards
  const pill = (n, label, list, gold, star) => n ? `<span class="pv-title ${gold ? 'mvp' : pvMedalCls(label)}" data-imtip="${esc(label + '\n' + list.map(h => h.short + ' ' + h.year + (h.team ? ' · ' + pvCase(h.team) : '')).join('\n'))}">${star ? '<i>★</i>' : ''}${n > 1 || !star ? n + '× ' : ''}${esc(label)}<em>${star ? (n > 1 ? list.map(h => h.year).sort().join(', ').replace(/^(\d{4}).*(\d{4})$/, (m, a, b) => n > 3 ? a + '–' + b : m) : list[0].year) : (list.length > 1 ? 'latest ' : '') + esc(list[0].short) + ' ' + list[0].year}</em></span>` : '';
  const by = a => d.hon.filter(h => h.awards.includes(a));
  const ORDER = ['Gold medal', 'Silver medal', 'Bronze medal', 'DPOY', 'All-Tournament First Team', 'All-Star Team', 'Top scorer', 'Top rebounder', 'Top assist', 'Top steal', 'Top block', 'Most promising tall talent'];
  const statAwards = [...new Set(d.hon.flatMap(h => h.awards).filter(a => !/MVP/.test(a)))]
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const pills = pill(by('MVP').length, 'MVP', by('MVP'), true) + pill(by('Finals MVP').length, 'Finals MVP', by('Finals MVP'), true)
    + d.titles.map(t => { const L = d.hon.filter(h => h.champ && h.short === t.short); return pill(L.length, t.short + ' champion', L, false, true); }).join('')
    + statAwards.map(a => pill(by(a).length, a, by(a))).join('');
  const facts = [['Born', b.dob ? pvDob(b.dob) + (has(b.age) ? ` <span>(${b.age})</span>` : '') : ''], ['Height', has(b.ht) ? b.ht + ' cm' : ''],
    ['Weight', has(b.wt) ? b.wt + ' kg' : ''], ['Nationality', b.nat ? esc(PV_NAT[b.nat] || b.nat) : ''],
    ['Career', d.span ? (d.span[0] === d.span[1] ? d.span[0] : d.span[0] + '–' + d.span[1]) : ''],
    ['Played', d.rows.length ? d.rows.length + ' competition' + (d.rows.length === 1 ? '' : 's') + ' · ' + d.log.length + ' box scores' : ''],
    ['National caps', (n => n.all ? `${n.all}<span> ${n.senior && n.youth ? `(${n.senior} senior · ${n.youth} youth)` : n.senior ? 'senior' : 'youth'}</span>` : '')(pvCapsCount(pid))]].filter(x => x[1]);
  // a verified badge, the player's links and the claim button come from the accounts layer
  const ax = typeof accProfile === 'function' ? accProfile(pid) : {};
  let stats = '';
  if (t) {
    const m = (t.rd && t.rd.m) || {}, g = t.g;
    const pct = k => { const x = m[k]; if (!x || x.gp == null) return ''; return `<span class="p ${x.gp >= 75 ? '' : 'mid'}">${x.gp >= 75 ? pvTop(x.gp) : pvOrd(x.gp) + ' percentile'}</span>`; };
    // points, then the player's two strongest of rebounds / assists / steals / blocks, then FG%
    const pool = [['reb', 'Rebounds per game', t.reb], ['ast', 'Assists per game', t.ast], ['stl', 'Steals per game', t.stl], ['blk', 'Blocks per game', t.blk]]
      .map(x => x.concat([(m[x[0]] && m[x[0]].gp) || 0])).sort((a, b) => b[3] - a[3]).slice(0, 2)
      .sort((a, b) => ['reb', 'ast', 'stl', 'blk'].indexOf(a[0]) - ['reb', 'ast', 'stl', 'blk'].indexOf(b[0]));
    const S = [['pts', 'Points per game', pvF1(t.pts / g)]].concat(pool.map(x => [x[0], x[1], pvF1(x[2] / g)])).concat([['fgpct', 'Field goal %', pvPc(t.fgm, t.fga)]]);
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
    ${has(b.num) ? `<div class="pv-num" aria-hidden="true">${esc(b.num)}</div>` : ''}
    ${ax.claim ? `<div class="acc-claim-w">${ax.claim}</div>` : ''}
    <div class="pv-in">
      <div class="pv-id">
        <div class="pv-eyebrow">${team ? crest(team, 28) + `<b>${esc(pvCase(team))}</b>` : ''}<span>${[has(b.num) ? '#' + esc(b.num) : '', esc(pos)].filter(Boolean).join(' · ')}</span>${ax.badge || ''}</div>
        <h1 class="pv-name page-title"><span>${esc(first)}</span>${last ? `<span>${esc(last)}</span>` : ''}</h1>
        ${d.badges.length ? `<div class="pv-badges">${d.badges.map(b => `<span class="pv-badge">${pvBadgeIcon(b)}<span>${esc(b)}</span></span>`).join('')}</div>` : ''}
        ${pills ? `<div class="pv-titles">${pills}</div>` : ''}
        ${facts.length ? `<dl class="pv-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
        ${ax.links || ''}${ax.fav ? `<div class="acc-hero-act">${ax.fav}</div>` : ''}
      </div>
      <div class="pv-photo">${PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="${esc(name)}">` : `<div class="pv-initials" title="Photo slot — awaiting a portrait">${initials(nl ? nl.join(' ') : name)}</div>`}</div>
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
function pvInsights(d) {
  const names = { ast: ['assists', 'passer'], pts: ['points', 'scorer'], stl: ['steals', 'defender'], reb: ['rebounds', 'rebounder'] };
  let best = null;
  [100, 30].forEach(minPool => { if (best) return; d.tiers.forEach(t => {
    if (!t.rd || t.g < 5 || t.rd.pool < minPool) return;
    ['ast', 'pts', 'stl', 'reb'].forEach(k => { const x = t.rd.m[k];
      if (x && x.rank && (!best || x.rank < best.x.rank || (x.rank === best.x.rank && t.rd.pool > best.t.rd.pool))) best = { t, k, x }; }); }); });
  const cards = [];
  if (best && best.x.rank <= 10) {
    const also = ['ast', 'pts', 'stl', 'reb'].filter(k => k !== best.k && best.t.rd.m[k] && best.t.rd.m[k].rank <= 3);
    const topIn = d.tiers.filter(t => t.rd && t.rd.m[best.k] && t.rd.m[best.k].rank <= 5).length;
    const lastYr = best.t.lastYear;
    cards.push(`<div class="pv-ic lead"><div class="k">Best ranking · ${names[best.k][0]}</div><div class="big">#${best.x.rank}</div>
      <div class="t">${esc(best.t.label)}${best.t.firstYear === lastYr ? ', ' + lastYr : ''}</div>
      <div class="s">${pvF1(best.x.v)} ${names[best.k][0]} a game, ${pvOrd(best.x.rank)} of ${best.x.n} players in the tier${also.length ? '. Also ' + also.map(k => pvOrd(best.t.rd.m[k].rank) + ' in ' + names[k][0]).join(' and ') : ''}.${topIn > 1 ? ` Top five in ${names[best.k][0]} in ${topIn} different tiers.` : ''}</div></div>`);
  }
  if (d.hon.length) {
    const nC = d.hon.filter(h => h.champ).length, nM = pvCount(d, 'MVP'), nF = pvCount(d, 'Finals MVP');
    const tags = h => (h.champ ? '<span class="pv-tag gold">Champion</span>' : '') + h.awards.map(a => `<span class="pv-tag ${pvTagCls(a)}">${esc(a)}</span>`).join('');
    const pre = d.hon.filter(h => !h.cid);
    const withAw = d.hon.filter(h => h.awards.length);
    cards.push(`<div class="pv-ic gold"><div class="k">Honours</div><div class="big">${nC || d.hon.reduce((a, h) => a + h.awards.length, 0)}<span class="u">${nC ? 'title' + (nC === 1 ? '' : 's') : 'award' + (d.hon.reduce((a, h) => a + h.awards.length, 0) === 1 ? '' : 's')}</span></div>
      ${d.titles.length ? `<div class="pv-tbox">${d.titles.map(t => `<div data-imtip="${esc(t.short + ' champion\n' + t.years.join(', '))}"><b>${t.n}×</b><span>${esc(t.short)}</span><em>${t.years.length > 3 ? t.years[0] + '–' + t.years[t.years.length - 1] : t.years.join(', ')}</em></div>`).join('')}</div>` : ''}
      ${withAw.length ? `<div class="pv-hon">${withAw.map(h => `<div>${pvMark(h, 20)}<span class="hn">${h.cid ? `<a href="#/c/${h.cid}">${esc(h.short)}</a>` : esc(h.short)} <span class="dim">${h.year}</span></span><span class="ht">${tags(h)}</span></div>`).join('')}</div>` : ''}
      ${nM || nF || pre.length ? `<div class="s">${[nM ? nM + ' MVP' : '', nF ? nF + ' Finals MVP' : ''].filter(Boolean).join(' and ')}${nM || nF ? '. ' : ''}${pre.length ? `The ${[...new Set(pre.map(h => h.year))].sort().join(', ')} honours are from events the database does not cover.` : ''}</div>` : ''}</div>`);
  } else {
    cards.push(`<div class="pv-ic"><div class="k">Competitions</div><div class="big">${d.rows.length}</div>
      <div class="s">In ${d.tiers.length} tier${d.tiers.length === 1 ? '' : 's'}${d.span ? ', ' + d.span[0] + '–' + d.span[1] : ''}. No titles recorded yet.</div></div>`);
  }
  const hp = careerHighs(d.pid).pts;
  if (hp) {
    const g = d.log.find(x => x.mid === hp.g.mid);
    cards.push(`<div class="pv-ic"><div class="k">Career-high points</div><div class="big">${hp.v}</div>
      <div class="s">${g ? `${g.home ? 'vs' : '@'} ${esc(g.oppName)}, ${pvDay(g.date)}<br><a href="#/c/${g.cid}/box/${g.mid}">${esc(g.c.label || g.c.name)}</a> · ${g.l.ast} assists, ${g.l.eff} efficiency` : ''}</div></div>`);
  }
  return `<div class="pv-ins n${cards.length}">${cards.join('')}</div>`;
}
function pvPath(d) {
  const by = {};
  d.rows.forEach(r => { (by[r.c.year] = by[r.c.year] || []).push({ r }); });
  // hand-kept honours outside the database, and database ones whose competition has no stat line for the player
  d.hon.concat(d.pathHon).filter(h => !h.cid || !d.rows.some(r => r.c.id === h.cid)).forEach(h => { (by[h.year] = by[h.year] || []).push({ h }); });
  d.moves.forEach(m => { (by[m.year] = by[m.year] || []).push({ m }); });
  const ys = Object.keys(by).sort();
  // two events of one year can share a short name: a qualifying round and its finals
  // ("National U17" twice), or two invitationals. Name the qualifier as one, and give
  // any other pair the team the player was with, so neither reads as a repeated entry.
  const isQ = r => /qualif/i.test(r.c.name || '');
  const nShort = {}, nMain = {};
  d.rows.forEach(r => { const k = r.c.year + '|' + r.short; nShort[k] = (nShort[k] || 0) + 1; if (!isQ(r)) nMain[k] = (nMain[k] || 0) + 1; });
  const rowLabel = r => nShort[r.c.year + '|' + r.short] > 1 && isQ(r) ? r.short + ' qualifier' : r.short;
  const rowTeam = r => !isQ(r) && nMain[r.c.year + '|' + r.short] > 1 && r.p.team ? `<div class="tm">${esc(pvCase(r.p.team))}</div>` : '';
  const lines = (champ, awards, placing) => {
    const gold = [champ ? '★ Champion' : ''].concat(awards.filter(a => /MVP/.test(a)).map(a => '★ ' + a)).filter(Boolean);
    return (gold.length ? `<div class="st">${gold.join('<br>')}</div>` : '') + (placing ? `<div class="pl">◆ ${esc(placing)}</div>` : '') + awards.filter(a => !/MVP/.test(a)).map(a => pvMedalCls(a) ? `<div class="md ${pvMedalCls(a)}">● ${esc(a)}</div>` : `<div class="aw">${esc(a)}</div>`).join('');
  };
  const item = x => {
    if (x.m) return `<div class="it abroad">${crest(x.m.team, 18)}<span>${esc(x.m.team)}</span></div><div class="aw lg">↗ ${esc(x.m.league)} · signed</div>`;
    if (x.h) return `<div class="it ${x.h.champ ? 'win' : ''}" ${x.h.team ? `title="${esc(pvCase(x.h.team))}"` : ''}>${pvMark(x.h, 18)}<span>${x.h.cid ? `<a href="#/c/${x.h.cid}">${esc(x.h.short)}</a>` : esc(x.h.short)}</span></div>${x.h.pathOnly && x.h.team ? `<div class="tm">${esc(pvCase(x.h.team))}</div>` : ''}${lines(x.h.champ, x.h.awards, x.h.placing)}`;
    const r = x.r, h = pvHonOf(d, r), win = d.isTitle(r) || (h && h.champ);
    return `<a class="it ${win ? 'win' : ''}" href="#/c/${r.c.id}" title="${esc(r.c.label || r.c.name)}">${crest(r.p.team, 18)}<span>${esc(rowLabel(r))}</span></a>${rowTeam(r)}${lines(win, h ? h.awards : [])}`;
  };
  const rank = x => x.m ? 5 : x.h ? (x.h.champ ? 1 : 0) + x.h.awards.length : (d.isTitle(x.r) ? 1 : 0) + ((pvHonOf(d, x.r) || {}).awards || []).length;
  return `<div class="pv-path" style="--n:${ys.length}">${ys.map(y => { const pre = by[y].every(x => x.h || x.m) && !by[y].some(x => x.m);
    return `<div class="yr ${pre ? 'pre' : ''}"><h3>${y}</h3>${pre ? '<div class="pre-l">Honours only · before the database</div>' : ''}
      ${by[y].sort((a, b) => rank(b) - rank(a)).map(item).join('')}</div>`; }).join('')}</div>`;
}
function pvHighs(d) {
  const cats = [['Points', l => l.pts], ['Assists', l => l.ast], ['Rebounds', l => pvReb(l)], ['Steals', l => l.stl], ['Threes', l => l.tpm], ['Efficiency', l => l.eff]];
  return `<div class="pv-highs">${cats.map(([n, f]) => { let b = null;
    d.log.forEach(g => { const v = f(g.l); if (has(v) && (!b || v > b.v)) b = { v, g }; });
    return b ? `<a class="hs" href="#/c/${b.g.cid}/box/${b.g.mid}"><div class="v">${b.v}</div><div class="l">${n}</div><div class="s">${b.g.home ? 'vs' : '@'} ${esc(b.g.oppName)}<br>${pvDay(b.g.date)} · ${esc(pvShortKey(b.g.tk))}</div></a>`
      : `<div class="hs"><div class="v">—</div><div class="l">${n}</div><div class="s">No box score</div></div>`; }).join('')}</div>`;
}
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
function pvOverview(pid, d) {
  const nC = d.hon.filter(h => h.champ).length, nM = pvCount(d, 'MVP'), nF = pvCount(d, 'Finals MVP');
  const pathSub = [nC ? nC + ' title' + (nC === 1 ? '' : 's') : '', nM ? nM + ' MVP' : '', nF ? nF + ' Finals MVP' : ''].filter(Boolean).join(', ');
  return (typeof accProfile === 'function' ? accProfile(pid).about : '')
    + pvSec('At a glance', '', '', pvInsights(d))
    + pvSec('Career path', (pathSub ? pathSub + ' · ' : '') + (d.span ? (d.span[0] === d.span[1] ? d.span[0] : d.span[0] + '–' + d.span[1]) : ''), '', pvPath(d))
    + pvCaps(pid)
    + (d.log.length ? pvSec('Career highs', 'single game, from ' + d.log.length + ' box scores', '', pvHighs(d))
      + pvSec('Latest games', '', `<a href="#/p/${pid}/log">Game log →</a>`, pvGames(d)) : '');
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
function pvStats(pid, d, t) {
  if (!d.tiers.length) return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No published statistical line in any competition in the database yet.</div></div>`;
  const rp = pvRsPo(pid, d), sh = pvShots(t);
  return pvCareer(pid, d) + (rp || sh ? `<div class="pv-two ${rp && sh ? '' : 'one'}">${rp}${sh}</div>` : '') + pvCaps(pid);
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
      return `<tr class="clickable" onclick="location.hash='#/c/${g.cid}/box/${g.mid}'"><td class="left">${pvDay(g.date, false)}</td><td class="left"><span class="pv-teamc">${g.home ? 'vs' : '@'} ${crest(g.oppRaw, 18)}${esc(g.oppName)}</span></td>
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
  if (!PV_TABS.some(x => x[0] === tab)) tab = 'overview';
  const d = pvData(pid);
  const t = d.tiers.find(x => x.key === heroTierFor(pid, d.tiers)) || null;
  const body = tab === 'stats' ? pvStats(pid, d, t) : tab === 'log' ? pvLog(pid, d) : tab === 'adv' ? pvAdv(pid, d, t) : tab === 'splits' ? pvSplits(pid, d) : pvOverview(pid, d);
  return `<div class="pv">
    ${pvHero(pid, d, t)}
    <div class="page pv-page">
      <nav class="pv-tabs" role="tablist" aria-label="Player sections">${PV_TABS.map(([k, l]) => `<a href="#/p/${pid}/${k}" class="${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}">${l}${k === 'log' && d.log.length ? `<span class="n">${d.log.length}</span>` : ''}</a>`).join('')}</nav>
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
