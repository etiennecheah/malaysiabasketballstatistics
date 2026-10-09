/* ----------------------- Teams (across every competition) ----------------------- */
/* Every distinct team in the database, aggregated across all competitions and shown
   under every competition category it has played in (user decision, 2026-09-29) — a
   state side appears under the national championships, the Agong Cup, the MATRIX Cup
   and SUKMA alike. Each card counts only that category's competitions. The MBL is the
   exception: its section is a fixed list of clubs (MBL_TEAMS). Cards follow the same
   dark-glass language as the player and competition cards. */

function teamName(tid) { const t = TEAMS[tid]; return typeof t === 'string' ? t : (t && t.name) || ''; }

// [key, section label, short chip label, dot colour]
const TEAM_CATS = [
  ['national', 'National Championships — U15 & U17', 'National U15/U17', '#c98a3b'],
  ['agong', 'Agong Cup', 'Agong Cup', '#d4a63a'],
  ['matrixcup', 'MABA/MATRIX Cup', 'MATRIX Cup', '#b8793a'],
  ['sukma', 'SUKMA — Sukan Malaysia', 'SUKMA', '#d97b53'],
  ['mbl', 'MBL — Major Basketball League', 'MBL', '#4a9eff'],
  ['wmbl', 'WMBL — Women\'s MBL', 'WMBL', '#e0668f'],
  ['wmba', 'WMBA — Women\'s Malaysia Basketball Alliance', 'WMBA', '#9bc53d'],
  ['u23', 'Malaysia D-League U23', 'D-League U23', '#33c17a'],
  ['u20', 'Malaysia D-League U20', 'D-League U20', '#5fcf9a'],
  ['sbl', 'SBL U20 — Selangor Basketball League', 'SBL U20', '#f0913a'],
  ['sukses', 'Sukan Selangor (SUKSES)', 'SUKSES', '#b07cd6'],
  ['dbc', 'DBC — Dream Ball Championship', 'DBC', '#e8b53d'],
  ['nxt', 'NXT Championship', 'NXT', '#6bd0c0'],
  ['fiba', 'FIBA — national-team events', 'FIBA', '#9aa3b2'],
  ['inv', 'Invitational & other tournaments', 'Invitational', '#7a9cff'],
];
const CAT_META = {};
TEAM_CATS.forEach(([k, label, short, dot]) => { CAT_META[k] = { label, short, dot }; });
/* The category a competition belongs to. D-League 2022 had no age groups; it is counted
   with the U23 (user decision). The women's MBL and the WMBL Invitational are the WMBL.
   The Women's Malaysia Basketball Alliance is its own category (user decision, 2026-10-02);
   it was filed under the invitationals before. */
function compCat(c) {
  const s = c.series, nm = c.name || '';
  if (s === 'MABA/MATRIX 17 & Below' || s === 'MILO Lum Mun Chak Cup') return 'national';
  if (s === 'Agong Cup') return 'agong';
  if (s === 'MABA/MATRIX Cup') return 'matrixcup';
  if (s === 'Sukan Malaysia') return 'sukma';
  if (s === 'Major Basketball League') return /women/i.test(nm) ? 'wmbl' : 'mbl';
  if (/\bWMBL\b/.test(nm)) return 'wmbl';
  if (s === 'Women\'s Basketball Alliance') return 'wmba';
  if (s === 'Malaysia D-League') return c.level === 'U20' ? 'u20' : 'u23';
  if (s === 'Selangor Basketball League') return 'sbl';
  if (s === 'Sukan Selangor') return 'sukses';
  if (s === 'Dream Ball Championship') return 'dbc';
  if (s === 'NXT Championship') return 'nxt';
  if (s === 'FIBA') return 'fiba';
  return 'inv';
}
function seriesCat(series) { return compCat({ series, name: '' }); }

function titleCaseName(s) {
  return s.split(/\s+/).map(w => {
    if (/^[A-Z0-9]{1,4}$/.test(w)) return w;                 // short acronym / number, e.g. PDRM, ATM, 2
    if (w.toLowerCase() === 'x') return 'x';                 // partnership joiner
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}
// Among a team's name variants, prefer one that already carries mixed case; if every
// variant is shouted in caps, title-case the tidiest one.
function teamDisplayName(names) {
  const clean = [...names].map(n => n.trim().replace(/(?:\s|\()([12AB])\)?$/, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim());
  const mixed = clean.filter(n => /[a-z]/.test(n));
  if (mixed.length) return mixed.sort((a, b) => a.length - b.length)[0];
  return titleCaseName(clean.sort((a, b) => a.length - b.length)[0]);
}

/* A team that enters two squads appears as "Johor 1" / "Johor 2", "JOHOR" + "JOHOR 2",
   "Johor(1)", "Sarawak A" / "Sarawak B" or "KL Phoenix A" / "KL Phoenix B". Those are one
   team with a first and second squad. States number their squads (Team 1 / Team 2);
   clubs letter them (Team A / Team B), as the source does. */
const SQUAD_RE = /(?:\s|\()([12AB])\)?$/;
function squadNo(name) {
  const m = String(name || '').trim().match(SQUAD_RE);
  return m ? { '1': 1, '2': 2, 'A': 1, 'B': 2 }[m[1]] : null;
}
// a side that plays under another name in one competition but is the same team:
// the Federal Territory's SUKMA side is Kuala Lumpur (user decision, 2026-09-29)
const TEAM_KEY_ALIAS = { 'wilayah-persekutuan': 'kuala-lumpur' };
function teamKeyRaw(name) {
  const base = String(name || '').trim().replace(SQUAD_RE, '').trim();
  return stateSlug(base) || teamSlug(base);
}
function teamKey(name) { const k = teamKeyRaw(name); return TEAM_KEY_ALIAS[k] || k; }
function squadLabel(t, n) { return n ? 'Team ' + (t.state ? n : 'AB'[n - 1]) : 'One squad'; }
/* The MBL level holds exactly these clubs (user list, 2026-09-29). KL Titans has not
   played an MBL season yet but is joining; a club not on the list is placed by the
   rest of its record even if it once appeared in an MBL competition. */
const MBL_TEAMS = new Set(['ns-matrix-deers', 'johor-southern-tigers', 'penang-sunrise-youngsters', 'ucsi-rising-star',
  'putrajaya-parkcity-heat', 'sarawak-cola-warriors', 'pegasus-sports', 'singapore-adroit', 'kl-aseel', 'kl-titans']);

/* Division of a competition: Men / Women for open, U23 and U20 play; Boys / Girls
   for U17 and U15. Where the source leaves the gender unspecified (MATRIX Cup,
   qualifying rounds, invitationals) it is read off the rosters — who those players
   otherwise play with. */
let PID_SEX = null, DIV_CACHE = {};
function compDivision(c) {
  if (DIV_CACHE[c.id]) return DIV_CACHE[c.id];
  let sex = c.gender === 'Men' || c.gender === 'Women' ? c.gender : null;
  if (!sex) {
    if (!PID_SEX) {
      PID_SEX = {};
      COMPS.forEach(x => {
        if (x.gender !== 'Men' && x.gender !== 'Women') return;
        Object.values(x.roster || {}).forEach(rows => rows.forEach(r => {
          const o = PID_SEX[r.pid] || (PID_SEX[r.pid] = { Men: 0, Women: 0 }); o[x.gender]++;
        }));
      });
    }
    let m = 0, w = 0;
    Object.values(c.roster || {}).forEach(rows => rows.forEach(r => {
      const o = PID_SEX[r.pid]; if (!o) return;
      if (o.Men >= o.Women) m++; else w++;
    }));
    sex = w > m ? 'Women' : 'Men';
  }
  const lv = c.level || 'Open';
  const youth = lv === 'U18' || lv === 'U17' || lv === 'U16' || lv === 'U15' || lv === 'Youth';
  const out = { sex: youth ? (sex === 'Men' ? 'Boys' : 'Girls') : sex, age: (lv === 'Open' || lv === 'Youth') ? '' : lv };
  DIV_CACHE[c.id] = out;
  return out;
}
const DIV_SEXES = ['Men', 'Women', 'Boys', 'Girls'];
const DIV_AGE_ORDER = { '': 0, 'U23': 1, 'U20': 2, 'U18': 3, 'U17': 4, 'U16': 5, 'U15': 6 };
const DIV_COL = { Men: 'var(--d-men)', Women: 'var(--d-women)', Boys: 'var(--d-boys)', Girls: 'var(--d-girls)' };
const divCmp = (a, b) => DIV_SEXES.indexOf(a.sex) - DIV_SEXES.indexOf(b.sex) || (DIV_AGE_ORDER[a.age] || 0) - (DIV_AGE_ORDER[b.age] || 0);

let TEAM_INDEX = null;
function teamIndex() {
  if (TEAM_INDEX) return TEAM_INDEX;
  const by = {};
  COMPS.forEach(c => {
    const cat = compCat(c);
    const champ = c.champ ? String(c.champ).trim().toLowerCase() : null;
    const div = compDivision(c);
    const qual = /qualif/i.test(c.name || '');
    // every published result, per team name as the fixture list spells it
    const res = {};
    (c.games || []).forEach(g => {
      if (g.st !== 'COMPLETE' || g.hs == null || g.as == null) return;
      [[g.h, g.hs, g.as], [g.a, g.as, g.hs]].forEach(([nm, f, a]) => {
        if (!nm) return;
        const r = res[nm] || (res[nm] = { gp: 0, w: 0, l: 0, pf: 0, pa: 0 });
        r.gp++; if (f > a) r.w++; else if (f < a) r.l++;
        if (!g.ff) { r.pf += +f; r.pa += +a; }       // a forfeit's 20-0 is a result, not points
      });
    });
    (c.teams || []).forEach(tid => {
      const nm = teamName(tid);
      if (!nm) return;
      const slug = teamKey(nm);
      const t = by[slug] || (by[slug] = {
        slug, names: new Set(), series: new Set(), cats: new Set(), catGames: {}, apps: [],
        played: 0, w: 0, l: 0, pf: 0, pa: 0, titles: 0, years: new Set(),
        state: !!STATE_NAME[slug],
      });
      t.names.add(nm); t.series.add(c.series); t.cats.add(cat); if (c.year) t.years.add(c.year);
      const r = res[nm] || { gp: 0, w: 0, l: 0, pf: 0, pa: 0 };
      const won = !!champ && champ === String(nm).trim().toLowerCase();
      t.catGames[cat] = (t.catGames[cat] || 0) + r.gp;
      t.apps.push({ cid: c.id, tid, as: nm, year: c.year, series: c.series, cat, sex: div.sex, age: div.age,
        squad: squadNo(nm), qual, champ: won, played: r.gp, w: r.w, l: r.l, pf: r.pf, pa: r.pa });
      t.played += r.gp; t.w += r.w; t.l += r.l; t.pf += r.pf; t.pa += r.pa;
      if (won) t.titles++;
    });
  });
  const order = {}; TEAM_CATS.forEach(([k], i) => { order[k] = i; });
  TEAM_INDEX = Object.values(by).map(t => {
    t.name = STATE_NAME[t.slug] || teamDisplayName(t.names);
    // inside one division, once a Team 2 exists the unnumbered entries are Team 1
    // ("JOHOR" beside "JOHOR 2" is the first squad)
    const two = new Set(t.apps.filter(a => a.squad === 2).map(a => a.sex + '|' + a.age));
    t.apps.forEach(a => { if (!a.squad && two.has(a.sex + '|' + a.age)) a.squad = 1; });
    t.hasTeam2 = two.size > 0;
    if (MBL_TEAMS.has(t.slug)) t.cats.add('mbl'); else t.cats.delete('mbl');
    t.cat = MBL_TEAMS.has(t.slug) ? 'mbl'
      : ([...t.cats].sort((a, b) => (t.catGames[b] || 0) - (t.catGames[a] || 0) || order[a] - order[b])[0] || 'other');
    // names this team played under that are not its own (Wilayah Persekutuan for KL)
    t.aliases = {};
    t.apps.forEach(a => { if (TEAM_KEY_ALIAS[teamKeyRaw(a.as)] === t.slug) (t.aliases[a.as] = t.aliases[a.as] || new Set()).add(a.series); });
    t.nComps = t.apps.length;
    t.apps.sort((a, b) => (b.year || 0) - (a.year || 0) || divCmp(a, b) || (a.squad || 0) - (b.squad || 0));
    t.firstYear = Math.min(...[...t.years]); t.lastYear = Math.max(...[...t.years]);
    return t;
  });
  return TEAM_INDEX;
}
// old links (#/t/johor-1, #/t/johor-2) land on the merged team
function teamBySlug(slug) {
  const all = teamIndex();
  return all.find(t => t.slug === slug) || all.find(t => t.slug === teamKey(String(slug).replace(/-/g, ' ')));
}

/* Which teams a category section holds: everyone with a competition in it, except the
   MBL, which is the fixed list. */
function catMembers(list, cat) {
  return cat === 'mbl' ? list.filter(t => MBL_TEAMS.has(t.slug))
    : list.filter(t => t.apps.some(a => a.cat === cat));
}
function catApps(t, cat) { return t.apps.filter(a => a.cat === cat); }

/* One team's card inside one category: everything on it counts that category only. */
function teamCard(t, cat) {
  const apps = catApps(t, cat);
  const years = [...new Set(apps.map(a => a.year).filter(Boolean))].sort();
  const yrs = years.length ? (years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years[years.length - 1]}`) : 'upcoming';
  const titles = apps.filter(a => a.champ).length;
  const two = apps.some(a => a.squad === 2);
  const by = s => apps.filter(a => a.sex === s).length;
  const series = [...new Set(apps.map(a => a.series))];
  const n = apps.length;
  return `<a class="ccard" href="#/t/${encodeURIComponent(t.slug)}">
    <div class="bloom" style="--team:${teamBloom(t.name)}"><i class="b1"></i><i class="b2"></i></div>
    <div class="grain"></div>
    <div class="ccard-in">
      <div class="ccard-body">
        <div class="ccard-crest tcard-crest">${crest(t.name, 60)}</div>
        <div class="ccard-main">
          <div class="ccard-eyebrow">${esc(CAT_META[cat].short)} · ${yrs}</div>
          <div class="ccard-name">${esc(t.name)}</div>
          <span class="ccard-series">${t.state ? 'State team' + (two ? ' · fields a second squad' : '') : two ? 'Fields a second squad' : series.slice(0, 2).map(esc).join(' · ') || '—'}</span>
          <div class="ccard-chips">
            ${titles ? `<span class="ccard-chip ccard-chip-win">${titles} title${titles === 1 ? '' : 's'}</span>` : ''}
            ${two ? `<span class="ccard-chip ccard-chip-sq">${squadLabel(t, 1)} · ${squadLabel(t, 2)}</span>` : ''}
            ${cat === 'mbl' && !n ? '<span class="ccard-chip ccard-chip-sq">Joining the MBL</span>' : ''}
          </div>
        </div>
      </div>
      <div class="ccard-ev">
        ${t.state
          // state teams play across all four divisions, so the split is worth showing;
          // clubs mostly play one, so they get the plain count
          ? `<div class="ccard-foot"><b>${n}</b> competition${n === 1 ? '' : 's'}</div>
        <div class="tc-divs">
          ${DIV_SEXES.map(s => `<span class="tc-div ${by(s) ? '' : 'zero'}"><b>${by(s)}</b><span><i style="background:${DIV_COL[s]}"></i>${s}</span></span>`).join('')}
        </div>`
          : `<div class="ccard-foot">In ${esc(CAT_META[cat].short)}</div>
        <div class="tc-divs">
          <span class="tc-div ${n ? '' : 'zero'}"><b>${n}</b><span>Competition${n === 1 ? '' : 's'}</span></span>
          <span class="tc-div ${years.length ? '' : 'zero'}"><b>${years.length}</b><span>Season${years.length === 1 ? '' : 's'}</span></span>
        </div>`}
      </div>
    </div>
  </a>`;
}

function teamSection(catKey, items) {
  if (!items.length) return '';
  const m = CAT_META[catKey];
  // most-travelled first inside the category, then by name
  const games = t => catApps(t, catKey).reduce((a, x) => a + x.played, 0);
  const sorted = items.slice().sort((a, b) => catApps(b, catKey).length - catApps(a, catKey).length || games(b) - games(a) || a.name.localeCompare(b.name));
  return `<div class="cat-head" id="tcat-${catKey}"><span class="cat-dot" style="background:${m.dot};"></span>
      <h2>${esc(m.label)}</h2><span class="cat-count">${items.length}</span><span class="cat-rule"></span></div>
    <div class="ccard-grid">${sorted.map(t => teamCard(t, catKey)).join('')}</div>`;
}

const TEAMHUB = { q: '', cat: '' };
function renderTeamsHub() {
  const all = teamIndex();
  let list = all.slice();
  if (TEAMHUB.q) { const q = TEAMHUB.q.toLowerCase(); list = list.filter(t => t.name.toLowerCase().includes(q)); }
  const cats = TEAM_CATS.map(([k]) => k).filter(k => catMembers(all, k).length);
  const shown = TEAMHUB.cat ? [TEAMHUB.cat] : cats;
  const sections = shown.map(k => teamSection(k, catMembers(list, k))).join('');
  const nCards = shown.reduce((a, k) => a + catMembers(list, k).length, 0);

  return `
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Teams</h1>
        <div class="page-sub">Every team that has taken part in a Malaysian basketball competition on the MABA / Genius Sports portal, under every competition it has played in — a state side appears with the national championships, the Agong Cup and SUKMA alike. Each card counts that competition only.</div>
      </div>
      <div class="badge">${all.length} teams</div>
    </div>

    <div class="tiles">
      <div class="tile"><div class="tile-label">Teams</div><div class="tile-value">${all.length}</div><div class="tile-sub">across all competitions</div></div>
      <div class="tile"><div class="tile-label">Categories</div><div class="tile-value">${cats.length}</div><div class="tile-sub">National · Agong Cup · MBL · D-League · SBL …</div></div>
      <div class="tile"><div class="tile-label">State sides</div><div class="tile-value">${all.filter(t => t.state).length}</div><div class="tile-sub">with a second squad merged in</div></div>
      <div class="tile"><div class="tile-label">Games</div><div class="tile-value">${all.reduce((a, t) => a + t.played, 0).toLocaleString()}</div><div class="tile-sub">completed team-games</div></div>
    </div>

    <div class="filter-bar">
      <div class="filter-field"><div class="filter-field-label">Category</div>
        <select class="filter" data-teamcat>
          <option value="" ${TEAMHUB.cat === '' ? 'selected' : ''}>All categories</option>
          ${cats.map(k => `<option value="${k}" ${TEAMHUB.cat === k ? 'selected' : ''}>${esc(CAT_META[k].label)} (${catMembers(all, k).length})</option>`).join('')}
        </select></div>
      <div class="filter-field" style="flex:1;min-width:200px;">
        <div class="filter-field-label">Find a team</div>
        <input class="filter" id="team-q" value="${esc(TEAMHUB.q)}" placeholder="Type to filter by name…" style="width:100%;">
      </div>
    </div>

    ${nCards ? sections
      : `<div class="card"><div class="empty-row" style="border:none;"><span class="empty-dot"></span>No team matches those filters.</div></div>`}

    <div class="foot" style="padding:4px 2px 0;"><span>${list.length} of ${all.length} teams · ${nCards} cards</span><span>${TEAMHUB.cat ? CAT_META[TEAMHUB.cat].label : cats.length + ' categories'}</span></div>
  </div>`;
}

/* Global team profile — the team across every competition it has appeared in.
   Divisions first (Men / Women / Boys / Girls by age), each with a lane per squad
   and a season strip; then every appearance, grouped by season and filterable. */
const TEAMPG = { slug: null, sex: 'all', sq: 'all' };
function tpRec(list) {
  const w = list.reduce((a, x) => a + x.w, 0), l = list.reduce((a, x) => a + x.l, 0);
  return (w || l) ? `${w}–${l}` : '—';
}
function tpDivCard(t, d, yrs) {
  const squads = [...new Set(d.list.map(a => a.squad || 0))].sort();
  const series = [...new Set(d.list.map(a => a.series))];
  const titles = d.list.filter(a => a.champ);
  const lane = sq => {
    const L = d.list.filter(a => (a.squad || 0) === sq);
    const cells = yrs.map(y => {
      const here = L.filter(a => a.year === y);
      if (!here.length) return `<i data-imtip="${y}: did not enter"></i>`;
      const win = here.some(a => a.champ), qonly = here.every(a => a.qual);
      const tip = y + '\n' + here.map(a => { const c = COMP_BY_ID[a.cid];
        return `${c.label || c.name}${a.champ ? ' — champion' : ''}${a.qual ? ' (qualifying round)' : ''}: ${a.w}–${a.l}`; }).join('\n');
      return `<i class="${win ? 'win' : qonly ? 'q' : 'on'}" data-imtip="${esc(tip)}">${here.length > 1 ? here.length : ''}</i>`;
    }).join('');
    return `<div class="lane"><span class="sq sq-${sq}">${squadLabel(t, sq)}</span>
      <div class="strip" style="--n:${yrs.length}">${cells}</div>
      <div class="lane-rec">${tpRec(L)}<small>${L.length} comp${L.length === 1 ? '' : 's'}</small></div></div>`;
  };
  return `<div class="dv" style="--dc:${DIV_COL[d.sex]}">
    <div class="dv-head">
      <div>
        <div class="dv-tline"><span class="dv-title">${d.sex}</span>${d.age ? `<span class="dv-age">${d.age}</span>` : ''}</div>
        <div class="dv-series">${series.map(esc).join(' · ')}</div>
      </div>
      <div class="dv-count"><b>${d.list.length}</b><span>competition${d.list.length === 1 ? '' : 's'}</span></div>
    </div>
    <div class="dv-years"><span></span><div class="strip" style="--n:${yrs.length}">${yrs.map(y => `<i>'${String(y).slice(2)}</i>`).join('')}</div><span class="dv-yr-pad"></span></div>
    <div class="dv-lanes">${squads.map(lane).join('')}</div>
    <div class="dv-foot">${titles.length
      ? `<span class="t">★ ${titles.length} title${titles.length > 1 ? 's' : ''}</span><span>${titles.map(a => a.year + (a.squad === 2 ? ' (' + squadLabel(t, 2) + ')' : '')).join(' · ')}</span>`
      : '<span>No titles yet</span>'}</div>
  </div>`;
}
function renderTeamGlobal(slug) {
  const t = teamBySlug(slug);
  if (!t) return `<div class="page"><div class="page-head"><div><h1 class="page-title">Team not found</h1></div></div>
    <div class="card"><div class="empty-row"><span class="empty-dot"></span>Browse all teams from the <a href="#/teams">Teams</a> page.</div></div></div>`;
  if (TEAMPG.slug !== t.slug) { TEAMPG.slug = t.slug; TEAMPG.sex = 'all'; TEAMPG.sq = 'all'; }
  const a = t.apps;
  const yrs = []; for (let y = t.firstYear; y <= t.lastYear; y++) yrs.push(y);
  const g = {};
  a.forEach(x => { const k = x.sex + '|' + x.age; (g[k] = g[k] || { sex: x.sex, age: x.age, list: [] }).list.push(x); });
  const divs = Object.values(g).sort(divCmp);
  const t2 = a.filter(x => x.squad === 2).length;
  const names = [...t.names].sort();

  const rows = a.filter(x => (TEAMPG.sex === 'all' || x.sex === TEAMPG.sex) && (TEAMPG.sq === 'all' || String(x.squad || 1) === TEAMPG.sq));
  const byYear = {}; rows.forEach(x => { (byYear[x.year] = byYear[x.year] || []).push(x); });
  const body = Object.keys(byYear).sort((p, q) => q - p).map(y => {
    const L = byYear[y];
    return `<tr class="yr"><td class="left" colspan="${t.hasTeam2 ? 6 : 5}">${y}<small>${L.length} competition${L.length > 1 ? 's' : ''}</small></td></tr>` + L.map(x => {
      const c = COMP_BY_ID[x.cid];
      const alias = names.length > 1 && x.as !== t.name ? ` · listed as “${esc(x.as)}”` : '';
      return `<tr class="clickable" onclick="location.hash='#/c/${x.cid}/team/${x.tid}'" style="cursor:pointer;">
        <td class="left comp-cell tp-cn"><div class="player-cell">${compCrest(c, 26)}<div><div class="p-name">${esc(c.label || c.name)}</div><div class="p-team">${esc(x.series)}${alias}</div></div></div></td>
        <td class="left"><span class="dtag" style="--dc:${DIV_COL[x.sex]}"><i></i>${x.sex}${x.age ? ` <em>${x.age}</em>` : ''}</span></td>
        ${t.hasTeam2 ? `<td>${x.squad ? `<span class="sqp sqp-${x.squad}">${squadLabel(t, x.squad)}</span>` : '<span class="sqp-0">—</span>'}</td>` : ''}
        <td>${x.played || '—'}</td>
        <td>${(x.w || x.l) ? x.w + '–' + x.l : '—'}</td>
        <td style="padding-right:20px;">${x.champ ? '<span class="fin fin-win">Champion</span>' : x.qual ? '<span class="fin fin-q">Qualifier</span>' : '<span class="sqp-0">—</span>'}</td>
      </tr>`; }).join('');
  }).join('');
  const segSex = [['all', 'All'], ...DIV_SEXES.filter(s => a.some(x => x.sex === s)).map(s => [s, s])];
  const segSq = t2 ? [['all', 'Both'], ['1', squadLabel(t, 1)], ['2', squadLabel(t, 2)]] : [];
  const diff = t.pf - t.pa;
  return `
  <div class="page">
    <div class="page-head">
      <div class="comp-head">
        <span class="tcard-crest" style="width:52px;height:52px;">${crest(t.name, 46)}</span>
        <div>
          <h1 class="page-title">${esc(t.name)}</h1>
          <div class="page-sub">${t.state ? 'State team · ' : ''}${t.nComps} competition${t.nComps === 1 ? '' : 's'} · ${t.firstYear === t.lastYear ? t.firstYear : t.firstYear + '–' + t.lastYear}</div>
          <div class="tm-cats">${TEAM_CATS.filter(([k]) => k === 'mbl' ? MBL_TEAMS.has(t.slug) : t.apps.some(a => a.cat === k))
            .map(([k]) => `<span class="tm-cat"><i style="background:${CAT_META[k].dot}"></i>${esc(CAT_META[k].short)}</span>`).join('')}</div>
          ${Object.keys(t.aliases).length ? `<div class="tm-alias">${Object.entries(t.aliases).map(([n, ser]) =>
            `Played ${[...ser].map(esc).join(' and ')} as <b>${esc(n)}</b>`).join(' · ')}</div>` : ''}
          ${(t.state || t.hasTeam2) && names.length > 1 ? `<div class="tm-merged">Includes ${names.map(n => `<code>${esc(n)}</code>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="acc-team-act">${typeof accFavBtn === 'function' ? accFavBtn('t', t.slug, 'light') : ''}<div class="badge"><a href="#/teams" style="color:inherit;">← All teams</a></div></div>
    </div>

    <div class="tiles">
      <div class="tile"><div class="tile-label">Competitions</div><div class="tile-value">${t.nComps}</div><div class="tile-sub">across ${divs.length} division${divs.length === 1 ? '' : 's'}</div></div>
      <div class="tile"><div class="tile-label">Titles</div><div class="tile-value">${t.titles || '—'}</div><div class="tile-sub">competitions won</div></div>
      <div class="tile"><div class="tile-label">Record</div><div class="tile-value">${tpRec(a)}</div><div class="tile-sub">${t.played} games · ${fmtPM(diff)} points</div></div>
      ${t.state
        ? `<div class="tile"><div class="tile-label">Second squad</div><div class="tile-value">${t2 || '—'}</div><div class="tile-sub">${t2 ? 'competitions with a ' + squadLabel(t, 2) : 'always one squad'}</div></div>`
        : t.hasTeam2 ? `<div class="tile"><div class="tile-label">Second squad</div><div class="tile-value">${t2}</div><div class="tile-sub">competitions with a ${squadLabel(t, 2)}</div></div>`
        : `<div class="tile"><div class="tile-label">Seasons</div><div class="tile-value">${t.years.size}</div><div class="tile-sub">${t.firstYear === t.lastYear ? t.firstYear : t.firstYear + '–' + t.lastYear}</div></div>`}
    </div>

    <div class="cat-head"><h2>Divisions</h2><span class="cat-count">${divs.length}</span><span class="cat-rule"></span></div>
    <div class="dv-legend">
      <span><i class="lg-on"></i>entered that season</span>
      <span><i class="lg-win"></i>won it</span>
      ${a.some(x => x.qual) ? '<span><i class="lg-q"></i>qualifying round only</span>' : ''}
      <span>a number in a cell = more than one competition that season</span>
    </div>
    <div class="dv-grid">${divs.map(d => tpDivCard(t, d, yrs)).join('')}</div>

    <div class="card tp-apps">
      <div class="card-head">Every appearance</div>
      <div class="ap-filters">
        <span class="ap-f"><span class="lab">Division</span><span class="seg2">${segSex.map(([k, l]) => `<button data-tpsex="${k}" class="${TEAMPG.sex === k ? 'on' : ''}">${k !== 'all' ? `<i style="background:${DIV_COL[k]}"></i>` : ''}${l}</button>`).join('')}</span></span>
        ${segSq.length ? `<span class="ap-f"><span class="lab">Squad</span><span class="seg2">${segSq.map(([k, l]) => `<button data-tpsq="${k}" class="${TEAMPG.sq === k ? 'on' : ''}">${l}</button>`).join('')}</span></span>` : ''}
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th class="left nosort">Competition</th><th class="left nosort">Division</th>${t.hasTeam2 ? '<th class="nosort">Squad</th>' : ''}<th class="nosort">GP</th><th class="nosort">W–L</th><th class="nosort" style="padding-right:20px;">Finish</th></tr></thead>
        <tbody>${body || '<tr><td class="left" colspan="' + (t.hasTeam2 ? 6 : 5) + '">Nothing matches those filters.</td></tr>'}</tbody>
      </table></div>
      <div class="foot"><span>${rows.length} of ${t.nComps} competition${t.nComps === 1 ? '' : 's'}</span><span>W–L counted from every published result · click a row for that roster</span></div>
    </div>
  </div>`;
}
