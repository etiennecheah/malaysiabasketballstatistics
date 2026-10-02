/* ---------------------------- Competition families ----------------------------
   The Competitions hub shows one card per competition *family* — "Malaysia D-League
   U23" holds 2022–2026, men and women — the way the Teams hub shows one card per
   team. A family page (#/cf/<key>) is the honour roll: every season's champion,
   MVP and Finals MVP where recorded, by division, then every edition's card.
   Families follow the team categories (compCat), with the national U15 and U17
   championships split apart and the schools championship given its own. */

// [key, name, short, section]
const CF_LIST = [
  ['mbl', 'Major Basketball League', 'MBL', 'senior'],
  ['wmbl', 'Women\'s MBL', 'WMBL', 'senior'],
  ['wmba', 'Women\'s Malaysia Basketball Alliance', 'WMBA', 'senior'],
  ['agong', 'Agong Cup', 'Agong Cup', 'senior'],
  ['matrixcup', 'MABA/MATRIX Cup', 'MATRIX Cup', 'senior'],
  ['sukma', 'SUKMA — Sukan Malaysia', 'SUKMA', 'games'],
  ['sukses', 'Sukan Selangor (SUKSES)', 'SUKSES', 'games'],
  ['u23', 'Malaysia D-League U23', 'D-League U23', 'dev'],
  ['u20', 'Malaysia D-League U20', 'D-League U20', 'dev'],
  ['sbl', 'Selangor Basketball League U20', 'SBL U20', 'dev'],
  ['u17', 'National U17 — MABA/MATRIX 17 & Below', 'National U17', 'youth'],
  ['u15', 'National U15 — MILO Lum Mun Chak Cup', 'National U15', 'youth'],
  ['nxt', 'NXT Championship', 'NXT', 'youth'],
  ['schools', 'Schools Championship', 'Schools', 'youth'],
  ['fiba', 'FIBA national-team events', 'FIBA', 'national'],
  ['dbc', 'Dream Ball Championship', 'DBC', 'other'],
  ['inv', 'Invitational & other tournaments', 'Invitational', 'other'],
];
const CF_SECTIONS = [['senior', 'Senior leagues & cups', '#d4a63a'], ['games', 'Multi-sport games', '#d97b53'],
  ['dev', 'Development leagues', '#33c17a'], ['youth', 'Youth & schools', '#c98a3b'], ['national', 'Malaysia national teams', '#9aa3b2'], ['other', 'Invitationals & other tournaments', '#7a9cff']];
const CF_META = {};
CF_LIST.forEach(([k, name, short, sec]) => { CF_META[k] = { key: k, name, short, sec }; });

function compFamily(c) {
  if (c.series === 'MABA/MATRIX 17 & Below') return 'u17';
  if (c.series === 'MILO Lum Mun Chak Cup') return 'u15';
  if (c.series === 'Schools Championship') return 'schools';
  return compCat(c);
}
const isQualifier = c => /qualif/i.test(c.name || '');
// a competition's division inside its family: the 2022 D-League had no age groups
// and is counted with the U23 (user decision), so it joins the U23 honour roll
function cfDiv(c) {
  const d = compDivision(c);
  return compFamily(c) === 'u23' && !d.age ? { sex: d.sex, age: 'U23' } : d;
}

let CF_INDEX = null;
function cfIndex() {
  if (CF_INDEX) return CF_INDEX;
  const by = {};
  COMPS.forEach(c => { const k = compFamily(c); (by[k] = by[k] || []).push(c); });
  CF_INDEX = CF_LIST.filter(([k]) => by[k]).map(([k]) => {
    const list = by[k].slice().sort((a, b) => (b.year || 0) - (a.year || 0) || divCmp(compDivision(a), compDivision(b)));
    const years = [...new Set(list.map(c => c.year).filter(Boolean))].sort((a, b) => a - b);
    return Object.assign({}, CF_META[k], { list, years, latest: list[0] });
  });
  return CF_INDEX;
}
const cfByKey = k => cfIndex().find(f => f.key === k);

// MVP and Finals MVP of each competition, from the hand-kept honours list
let CF_AWARDS = null;
function cfAwards(cid) {
  if (!CF_AWARDS) {
    CF_AWARDS = {};
    Object.entries(DB.honours || {}).forEach(([pid, L]) => L.forEach(h => {
      if (!h.cid) return;
      const o = CF_AWARDS[h.cid] || (CF_AWARDS[h.cid] = { mvp: [], fmvp: [] });
      if (h.awards.includes('MVP')) o.mvp.push({ pid, team: h.team });
      if (h.awards.includes('Finals MVP')) o.fmvp.push({ pid, team: h.team });
    }));
  }
  return CF_AWARDS[cid] || { mvp: [], fmvp: [] };
}

const cfYears = ys => !ys.length ? '—' : ys[0] === ys[ys.length - 1] ? String(ys[0]) : ys[0] + '–' + ys[ys.length - 1];
const cfSexes = f => DIV_SEXES.filter(s => f.list.some(c => compDivision(c).sex === s));
const cfTeamName = n => pvCase(String(n || '').trim());

/* the family card: same dark-glass shell as the team cards */
function cfCard(f) {
  const sexes = cfSexes(f);
  const ages = [...new Set(f.list.map(c => cfDiv(c).age).filter(Boolean))];
  const y = f.years[f.years.length - 1];
  // the newest season's champions, one chip per division
  const champs = f.list.filter(c => c.year === y && c.champ && !isQualifier(c) && compStatus(c) === 'Completed');
  const live = f.list.filter(c => compStatus(c) !== 'Completed' && !isQualifier(c)).length;
  const n = f.list.length;
  return `<a class="ccard" href="#/cf/${f.key}">
    <div class="bloom" style="--team:${teamBloom(f.latest.series)}"><i class="b1"></i><i class="b2"></i></div>
    <div class="grain"></div>
    <div class="ccard-in">
      <div class="ccard-body">
        <div class="ccard-crest">${compCrest(f.latest, 62)}</div>
        <div class="ccard-main">
          <div class="ccard-eyebrow">${sexes.join(' & ')}${ages.length === 1 ? ' · ' + ages[0] : ''} · ${cfYears(f.years)}</div>
          <div class="ccard-name">${esc(f.name)}</div>
          <span class="ccard-series">${f.years.length} season${f.years.length === 1 ? '' : 's'} · ${n} edition${n === 1 ? '' : 's'}</span>
          <div class="ccard-chips">
            ${live ? `<span class="ccard-chip ccard-chip-live"><i></i>${live === 1 ? 'In progress' : live + ' in progress'}</span>` : ''}
            ${champs.slice(0, 2).map(c => `<span class="ccard-chip ccard-chip-win">${crest(c.champ, 13)}${y}${sexes.length > 1 ? ' ' + compDivision(c).sex : ''} · ${esc(cfTeamName(c.champ))}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="ccard-ev">
        <div class="ccard-foot"><b>${n}</b> edition${n === 1 ? '' : 's'} · honour roll inside</div>
        <div class="tc-divs">
          ${sexes.map(s => `<span class="tc-div"><b>${f.list.filter(c => compDivision(c).sex === s).length}</b><span><i style="background:${DIV_COL[s]}"></i>${s}</span></span>`).join('')}
        </div>
      </div>
    </div>
  </a>`;
}

function cfPasses(c) {
  return (!FILTER.year || String(c.year) === FILTER.year) && (!FILTER.series || c.series === FILTER.series)
    && (!FILTER.gender || c.gender === FILTER.gender) && (!FILTER.level || c.level === FILTER.level)
    && (!FILTER.q || ((c.label || c.name) + ' ' + CF_META[compFamily(c)].name).toLowerCase().includes(FILTER.q.toLowerCase()));
}

function renderHub() {
  const fams = cfIndex();
  const shown = fams.filter(f => f.list.some(cfPasses));
  const ongoing = COMPS.filter(c => compStatus(c) !== 'Completed' && cfPasses(c))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));
  const totGames = COMPS.reduce((a, c) => a + c.nGames, 0);
  const totPlayers = Object.keys(PERSONS).length;
  const sections = CF_SECTIONS.map(([k, label, dot]) => {
    const L = shown.filter(f => f.sec === k);
    return L.length ? `<div class="cat-head"><span class="cat-dot" style="background:${dot};"></span>
      <h2>${esc(label)}</h2><span class="cat-count">${L.length}</span><span class="cat-rule"></span></div>
      <div class="ccard-grid">${L.map(cfCard).join('')}</div>` : '';
  }).join('');
  return `
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Competitions</h1>
        <div class="page-sub">Every Malaysian basketball competition on the MABA / Genius Sports portal, one card per competition. Open one for its honour roll — each season's champion, MVP and Finals MVP — and every edition's teams, fixtures, standings and statistics.</div>
      </div>
      <div class="badge">${fams.length} competitions · ${COMPS.length} editions</div>
    </div>

    <div class="tiles">
      <div class="tile"><div class="tile-label">Competitions</div><div class="tile-value">${fams.length}</div><div class="tile-sub">${COMPS.length} editions over ${uniqSorted(c => c.year, true).length} seasons</div></div>
      <div class="tile"><div class="tile-label">Games</div><div class="tile-value">${totGames.toLocaleString()}</div><div class="tile-sub">${COMPS.reduce((a, c) => a + c.nDone, 0).toLocaleString()} completed</div></div>
      <div class="tile"><div class="tile-label">Players</div><div class="tile-value">${totPlayers.toLocaleString()}</div><div class="tile-sub">${Object.values(CAREER).filter(v => v.length > 1).length.toLocaleString()} in more than one edition</div></div>
      <div class="tile"><div class="tile-label">Teams</div><div class="tile-value">${Object.keys(TEAMS).length}</div><div class="tile-sub">across all competitions</div></div>
    </div>

    <div class="filter-bar">
      ${selectField('Season', 'year', uniqSorted(c => c.year, true))}
      ${selectField('Category', 'gender', uniqSorted(c => c.gender))}
      ${selectField('Age group', 'level', uniqSorted(c => c.level))}
      <div class="filter-field" style="flex:1;min-width:200px;">
        <div class="filter-field-label">Find a competition</div>
        <input class="filter" id="comp-q" value="${esc(FILTER.q)}" placeholder="Type to filter by name…" style="width:100%;">
      </div>
    </div>

    ${ongoing.length ? `<div class="cat-head"><span class="cat-dot" style="background:#33c17a;"></span>
      <h2>Happening now</h2><span class="cat-count">${ongoing.length}</span><span class="cat-rule"></span></div>
      <div class="ccard-grid">${ongoing.map(compCard).join('')}</div>` : ''}
    ${shown.length ? sections
      : `<div class="card"><div class="empty-row" style="border:none;"><span class="empty-dot"></span>No competition matches those filters.</div></div>`}

    <div class="foot" style="padding:4px 2px 0;"><span>Showing ${shown.length} of ${fams.length} competitions</span><span>${ongoing.length} edition${ongoing.length === 1 ? '' : 's'} happening now</span></div>
  </div>`;
}

/* ---- the family page: honour roll, then every edition ---------------------- */
function cfWho(list) {
  if (!list.length) return '<span class="cf-none">—</span>';
  return list.map(x => `<div class="cf-who">${personLink(x.pid)}${x.team ? `<small>${crest(x.team, 14)}${esc(cfTeamName(x.team))}</small>` : ''}</div>`).join('');
}
function cfRoll(f, d, oneAge) {
  const L = f.list.filter(c => { const x = cfDiv(c); return x.sex === d.sex && x.age === d.age; });
  const main = L.filter(c => !isQualifier(c));
  const wins = {};
  main.forEach(c => { if (c.champ && compStatus(c) === 'Completed') { const k = cfTeamName(c.champ); wins[k] = (wins[k] || 0) + 1; } });
  const tally = Object.entries(wins).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const anyF = main.some(c => cfAwards(c.id).fmvp.length);
  // families of different events under one name (invitationals) name each edition
  const named = f.key === 'inv' || f.key === 'wmbl' || new Set(main.map(c => c.year)).size < main.length;
  const rows = main.map(c => {
    const st = compStatus(c), aw = cfAwards(c.id);
    const champ = st !== 'Completed' ? `<span class="cf-live"><i></i>${esc(st)}</span>`
      : c.champ ? `<span class="cf-champ">${crest(c.champ, 20)}<b>${esc(cfTeamName(c.champ))}</b></span>` : '<span class="cf-none">Not decided in the source</span>';
    return `<tr>
      <td class="left cf-yr"><a href="#/c/${c.id}" title="${esc(c.label || c.name)}">${c.year || '—'}</a>${named ? `<small>${esc(c.label || c.name)}</small>` : ''}</td>
      <td class="left">${champ}</td>
      <td class="left" data-l="MVP">${cfWho(aw.mvp)}</td>
      ${anyF ? `<td class="left" data-l="Finals MVP">${cfWho(aw.fmvp)}</td>` : ''}
    </tr>`;
  }).join('');
  const q = L.filter(isQualifier);
  return `<div class="card cf-roll" style="--dc:${DIV_COL[d.sex]}">
    <div class="cf-roll-head">
      <div class="cf-div"><i></i>${esc(d.sex)}${d.age && !oneAge ? ` <em>${esc(d.age)}</em>` : ''}</div>
      ${tally.length ? `<div class="cf-tally" aria-label="Titles by team">${tally.map(([t, n]) => `<span>${crest(t, 16)}${esc(t)}${n > 1 ? `<b>×${n}</b>` : ''}</span>`).join('')}</div>` : ''}
    </div>
    ${main.length ? `<div class="table-scroll"><table class="cf-table">
      <thead><tr><th class="left nosort">Season</th><th class="left nosort">Champion</th><th class="left nosort">MVP</th>${anyF ? '<th class="left nosort">Finals MVP</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>` : ''}
    ${q.length ? `<div class="cf-q">Qualifying round${q.length > 1 ? 's' : ''}: ${q.map(c => `<a href="#/c/${c.id}">${c.year}</a>`).join(' · ')}</div>` : ''}
  </div>`;
}
function renderFamily(key) {
  const f = cfByKey(key);
  if (!f) return renderNotFound(key);
  const g = {};
  f.list.forEach(c => { const d = cfDiv(c); g[d.sex + '|' + d.age] = d; });
  const divs = Object.values(g).sort(divCmp);
  // the age goes on a division's label only where the family holds more than one
  const oneAge = new Set(divs.map(d => d.age)).size === 1;
  const teams = new Set(), players = new Set();
  f.list.forEach(c => { (c.teams || []).forEach(t => teams.add(teamKey(teamName(t)))); c.players.forEach(p => players.add(p.pid)); });
  const games = f.list.reduce((a, c) => a + c.nGames, 0);
  const aw = f.list.reduce((a, c) => { const x = cfAwards(c.id); return a + x.mvp.length + x.fmvp.length; }, 0);
  return `<div class="page cf-page">
    <div class="cx-crumb"><a href="#/competitions">Competitions</a><span>/</span>${esc(f.short)}</div>
    <div class="cx-head">
      ${compCrest(f.latest, 56)}
      <div class="cx-id">
        <h1 class="page-title">${esc(f.name)}</h1>
        <div class="cx-sub">${cfYears(f.years)} · ${f.years.length} season${f.years.length === 1 ? '' : 's'} · ${f.list.length} edition${f.list.length === 1 ? '' : 's'} · ${cfSexes(f).join(' & ')}</div>
      </div>
    </div>

    <div class="tiles">
      <div class="tile"><div class="tile-label">Editions</div><div class="tile-value">${f.list.length}</div><div class="tile-sub">${divs.length} division${divs.length === 1 ? '' : 's'}</div></div>
      <div class="tile"><div class="tile-label">Teams</div><div class="tile-value">${teams.size}</div><div class="tile-sub">different teams</div></div>
      <div class="tile"><div class="tile-label">Players</div><div class="tile-value">${players.size.toLocaleString()}</div><div class="tile-sub">${games.toLocaleString()} games</div></div>
      <div class="tile"><div class="tile-label">Awards recorded</div><div class="tile-value">${aw || '—'}</div><div class="tile-sub">MVP and Finals MVP</div></div>
    </div>

    <div class="cat-head"><h2>Honour roll</h2><span class="cat-count">${divs.length}</span><span class="cat-rule"></span></div>
    <div class="cf-rolls">${divs.map(d => cfRoll(f, d, oneAge)).join('')}</div>
    <p class="cf-note">Champions are the database's own: the final's winner, or the top of the table where the competition had no final. MVP and Finals MVP appear where they have been recorded; a dash means none is on record yet.</p>

    <div class="cat-head"><h2>Every edition</h2><span class="cat-count">${f.list.length}</span><span class="cat-rule"></span></div>
    <div class="ccard-grid">${f.list.map(compCard).join('')}</div>
  </div>`;
}
