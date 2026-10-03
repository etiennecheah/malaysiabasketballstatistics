/* ---------------------------- shared stat column model ---------------------------- */
/* Every column is either a real published total, or a value computed from real
   published totals (per-game = total ÷ games; percentages = makes ÷ attempts).
   Nothing is estimated — a player with no published line shows "—" throughout. */
const TRAD_COLS = [
  ['g', 'G', p => p.g], ['minpg', 'MPG', p => pg(minsToNum(p.min), p.g)],
  ['pts', 'PTS', p => p.pts], ['ppg', 'PPG', p => pg(p.pts, p.g)],
  ['reb', 'REB', p => p.reb], ['rpg', 'RPG', p => pg(p.reb, p.g)],
  ['ast', 'AST', p => p.ast], ['apg', 'APG', p => pg(p.ast, p.g)],
  ['stl', 'STL', p => p.stl], ['blk', 'BLK', p => p.blk],
  ['tov', 'TOV', p => p.tov], ['pf', 'PF', p => p.pf],
];
const ADV_COLS = [
  ['fgpct', 'FG%', p => ratio(p.fgm, p.fga)], ['twoppct', '2P%', p => ratio(p.twopm, p.twopa)],
  ['tppct', '3P%', p => ratio(p.tpm, p.tpa)], ['ftpct', 'FT%', p => ratio(p.ftm, p.fta)],
  ['efg', 'eFG%', p => efgPct(p)], ['tspct', 'TS%', p => p.tspct],
  ['orpct', 'OR%', p => p.orpct], ['drpct', 'DR%', p => p.drpct],
  ['topct', 'TO%', p => p.topct], ['pm', '+/-', p => p.pm],
  ['eff', 'EFF', p => p.eff], ['index', 'PIR', p => p.index],
];
const ALL_COLS = TRAD_COLS.concat(ADV_COLS);
const COL_FN = {}; ALL_COLS.forEach(([k, l, f]) => { COL_FN[k] = f; });

const SORT = { comp: { key: 'pts', dir: 'desc' }, glob: { key: 'pts', dir: 'desc' } };
const PAGE = { glob: 0, q: '', cards: 1 };
let GVIEW = 'cards';   // the directory opens as cards; the table is one click away
const PAGE_SIZE = 60;
const CARD_PAGE = 24;

function sortRows(rows, st, get) {
  const dir = st.dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const va = get(a, st.key), vb = get(b, st.key);
    const na = has(va) ? Number(va) : -Infinity, nb = has(vb) ? Number(vb) : -Infinity;
    if (isNaN(na) && isNaN(nb)) return 0;
    return (na - nb) * dir;
  });
}
function arrow(st, k) { return st.key === k ? (st.dir === 'desc' ? ' ▼' : ' ▲') : ''; }

/* ---------------------------- Competition players ----------------------------
   One view at a time — Per game, Totals, Shooting, Advanced — so each fits the page
   without a sideways scroll on a desktop. The table sits in its own scroll box
   (header and player column pinned), so its horizontal bar is always on screen
   rather than under the last of 150 rows. Sorting and the name filter redraw the
   table in place and keep both scroll positions. */
const CPV = { view: 'pg', q: '' };
const n1 = v => has(v) && isFinite(v) ? Number(v).toFixed(1) : '—';
const n0 = v => has(v) && isFinite(v) ? String(Math.round(v)) : '—';
const pc = v => has(v) && isFinite(v) ? Number(v).toFixed(1) : '—';
const CP_VIEWS = {
  pg: { label: 'Per game', sort: 'ppg', cols: [
    ['g', 'G', p => p.g, n0], ['minpg', 'MIN', p => pg(minsToNum(p.min), p.g), n1],
    ['ppg', 'PTS', p => pg(p.pts, p.g), n1], ['rpg', 'REB', p => pg(p.reb, p.g), n1], ['apg', 'AST', p => pg(p.ast, p.g), n1],
    ['spg', 'STL', p => pg(p.stl, p.g), n1], ['bpg', 'BLK', p => pg(p.blk, p.g), n1], ['topg', 'TOV', p => pg(p.tov, p.g), n1],
    ['fgpct', 'FG%', p => ratio(p.fgm, p.fga), pc], ['tppct', '3P%', p => ratio(p.tpm, p.tpa), pc], ['ftpct', 'FT%', p => ratio(p.ftm, p.fta), pc],
    ['effpg', 'EFF', p => pg(p.eff, p.g), n1]] },
  tot: { label: 'Totals', sort: 'pts', cols: [
    ['g', 'G', p => p.g, n0], ['min', 'MIN', p => minsToNum(p.min), n0], ['pts', 'PTS', p => p.pts, n0],
    ['oreb', 'OREB', p => p.oreb, n0], ['dreb', 'DREB', p => p.dreb, n0], ['reb', 'REB', p => p.reb, n0], ['ast', 'AST', p => p.ast, n0],
    ['stl', 'STL', p => p.stl, n0], ['blk', 'BLK', p => p.blk, n0], ['tov', 'TOV', p => p.tov, n0], ['pf', 'PF', p => p.pf, n0],
    ['pm', '+/-', p => p.pm, v => fmtPM(v)], ['eff', 'EFF', p => p.eff, n0]] },
  sh: { label: 'Shooting', sort: 'fgm', cols: [
    ['fgm', 'FGM', p => p.fgm, n0], ['fga', 'FGA', p => p.fga, n0], ['fgpct', 'FG%', p => ratio(p.fgm, p.fga), pc],
    ['twopm', '2PM', p => p.twopm, n0], ['twopa', '2PA', p => p.twopa, n0], ['twoppct', '2P%', p => ratio(p.twopm, p.twopa), pc],
    ['tpm', '3PM', p => p.tpm, n0], ['tpa', '3PA', p => p.tpa, n0], ['tppct', '3P%', p => ratio(p.tpm, p.tpa), pc],
    ['ftm', 'FTM', p => p.ftm, n0], ['fta', 'FTA', p => p.fta, n0], ['ftpct', 'FT%', p => ratio(p.ftm, p.fta), pc],
    ['efg', 'eFG%', p => efgPct(p), pc], ['tspct', 'TS%', p => p.tspct, pc]] },
  adv: { label: 'Advanced', sort: 'eff', cols: [
    ['g', 'G', p => p.g, n0], ['tspct', 'TS%', p => p.tspct, pc], ['efg', 'eFG%', p => efgPct(p), pc],
    ['orpct', 'OR%', p => p.orpct, pc], ['drpct', 'DR%', p => p.drpct, pc], ['topct', 'TO%', p => p.topct, pc],
    ['per', 'PER', (p, c) => (advRow(c.id, p.pid) || {}).per, n1], ['usg', 'USG%', (p, c) => (advRow(c.id, p.pid) || {}).usg, n1],
    ['ws', 'WS', (p, c) => (advRow(c.id, p.pid) || {}).ws, n1], ['bpm', 'BPM', (p, c) => (bpmRow(c.id, p.pid) || {}).bpm, v => has(v) ? (v > 0 ? '+' : '') + Number(v).toFixed(1) : '—'],
    ['pm', '+/-', p => p.pm, v => fmtPM(v)], ['eff', 'EFF', p => p.eff, n0], ['index', 'PIR', p => p.index, n0]] },
};

function renderCompPlayers(cid) {
  const c = COMP_BY_ID[cid];
  return page(c, 'Players', `<div id="players-body">${compPlayersTable(cid)}</div>`);
}
function cpView() { return CP_VIEWS[CPV.view] || CP_VIEWS.pg; }
function compPlayersTable(cid) {
  const c = COMP_BY_ID[cid];
  const ph = phaseOf(c);
  const lines = phaseLines(c, ph);
  const withStats = lines.filter(hasStats).length;
  const V = cpView();
  if (!V.cols.some(x => x[0] === SORT.comp.key)) SORT.comp = { key: V.sort, dir: 'desc' };
  return `${c.split ? `<div class="phase-bar">${phaseSeg(c)}
      <span class="phase-note">${ph === 'rs' ? 'Regular season only — ' + (c.games.filter(g => g.st === 'COMPLETE' && !c.phase[g.mid]).length) + ' games'
        : ph === 'po' ? 'Playoffs only — ' + Object.keys(c.phase).length + ' games (' + phaseRounds(c) + ')'
        : 'Every game, as the source publishes the season line'}</span></div>` : ''}
  <div class="card cp-card">
    <div class="cp-bar">
      <span class="seg cp-views" role="tablist" aria-label="Columns">${Object.entries(CP_VIEWS).map(([k, v]) => `<button class="seg-btn ${CPV.view === k ? 'seg-on' : ''}" data-cpview="${k}" role="tab" aria-selected="${CPV.view === k}">${v.label}</button>`).join('')}</span>
      <input class="filter cp-q" id="cp-q" value="${esc(CPV.q)}" placeholder="Find a player or team…" autocomplete="off" aria-label="Find a player or team">
    </div>
    <div id="cp-table">${compPlayersGrid(cid)}</div>
    ${c.split && ph !== 'all' ? `<div class="note"><strong>${ph === 'rs' ? 'Regular season' : 'Playoffs'}</strong> lines are summed from this competition's box scores, one game at a time; the source publishes only the whole-season line. Totals and percentages are computed from those sums.</div>` : ''}
    <div class="note">${withStats} of ${c.nPlayers} players have a published statistical line; the rest appear on a roster with no statistics yet and show "—". Click a column to sort, click it again to reverse. Click a player for the full career.</div>
  </div>`;
}
function compPlayersGrid(cid) {
  const c = COMP_BY_ID[cid], V = cpView(), st = SORT.comp;
  const all = phaseLines(c, phaseOf(c));
  const q = CPV.q.trim().toLowerCase();
  const lines = q ? all.filter(p => (personName(p.pid) + ' ' + (p.team || '')).toLowerCase().includes(q)) : all;
  const col = V.cols.find(x => x[0] === st.key) || V.cols[0];
  const rows = sortRows(lines, st, p => col[2](p, c));
  const countTxt = (q ? rows.length + ' of ' + all.length : all.length) + ' players';
  return `<div class="table-scroll sticky-first cp-scroll"><table class="cp-table">
      <thead><tr>
        <th class="left cp-rk nosort">#</th><th class="left nosort">Player</th>
        ${V.cols.map(([k, l]) => `<th data-csort="${k}" class="${st.key === k ? 'cp-on' : ''}" aria-sort="${st.key === k ? (st.dir === 'desc' ? 'descending' : 'ascending') : 'none'}"${gloss(l)}>${l}<i class="cp-ar">${st.key === k ? (st.dir === 'desc' ? '▼' : '▲') : ''}</i></th>`).join('')}
      </tr></thead>
      <tbody>${rows.length ? rows.map((p, i) => {
        const nm = personName(p.pid);
        return `<tr class="clickable" onclick="location.hash='#/p/${p.pid}'">
          <td class="left cp-rk">${i + 1}</td>
          <td class="left"><div class="player-cell">${avatar(p.pid, nm)}
            <div><div class="p-name">${esc(nm)}</div><div class="p-team">${p.team ? teamMark(p.team) + esc(p.team) : '<span style="color:var(--text-faint);">no team published</span>'}</div></div></div></td>
          ${V.cols.map(([k, , f, fm]) => { const v = f(p, c);
            return `<td class="${st.key === k ? 'cp-on' : ''}${k === 'pm' || k === 'bpm' ? (has(v) && v > 0 ? ' pm-pos' : has(v) && v < 0 ? ' pm-neg' : '') : ''}">${fm(v)}</td>`; }).join('')}
        </tr>`; }).join('') : `<tr><td class="left" colspan="${V.cols.length + 2}" style="color:var(--text-faint);padding:22px 20px;">No player matches “${esc(CPV.q)}”.</td></tr>`}
      </tbody>
    </table></div>
    <div class="foot"><span id="cp-count-foot">${countTxt}</span><span>${V.label}${phaseOf(c) !== 'all' ? ' · ' + (phaseOf(c) === 'rs' ? 'regular season' : 'playoffs') : ''}</span></div>`;
}
/* redraw only the grid, keeping the reader where they were in both directions */
function cpRedraw(cid) {
  const box = document.querySelector('#cp-table .cp-scroll');
  const x = box ? box.scrollLeft : 0, y = box ? box.scrollTop : 0;
  const el = document.getElementById('cp-table');
  if (!el) return;
  el.innerHTML = compPlayersGrid(cid);
  const nb = el.querySelector('.cp-scroll');
  if (nb) { nb.scrollLeft = x; nb.scrollTop = y; }
}

/* ---------------------------- Global player directory ----------------------------
   The same rule as the player profile governs this table: per-game figures are
   only ever shown inside a single competition tier. With no tier selected the
   table shows totals only — sums stay meaningful across competitions, averages
   do not. Pick a tier and the whole table re-scopes to it, averages included. */
const GFILTER = { tier: '', series: '', yFrom: '', yTo: '', q: '' };

const GLOB_TOTAL_COLS = [
  ['comps', 'Comps', r => r.nComps], ['g', 'G', r => r.t.g], ['pts', 'PTS', r => r.t.pts],
  ['reb', 'REB', r => r.t.reb], ['ast', 'AST', r => r.t.ast],
  ['stl', 'STL', r => r.t.stl], ['blk', 'BLK', r => r.t.blk], ['eff', 'EFF', r => r.t.eff],
];
const GLOB_TIER_COLS = [
  ['comps', 'Comps', r => r.nComps], ['g', 'G', r => r.t.g],
  ['pts', 'PTS', r => r.t.pts], ['ppg', 'PPG', r => pg(r.t.pts, r.t.g)],
  ['reb', 'REB', r => r.t.reb], ['rpg', 'RPG', r => pg(r.t.reb, r.t.g)],
  ['ast', 'AST', r => r.t.ast], ['apg', 'APG', r => pg(r.t.ast, r.t.g)],
  ['stl', 'STL', r => r.t.stl], ['blk', 'BLK', r => r.t.blk],
  ['fgpct', 'FG%', r => ratio(r.t.fgm, r.t.fga)], ['tppct', '3P%', r => ratio(r.t.tpm, r.t.tpa)],
  ['ftpct', 'FT%', r => ratio(r.t.ftm, r.t.fta)], ['eff', 'EFF', r => r.t.eff],
];
function globCols() { return GFILTER.tier ? GLOB_TIER_COLS : GLOB_TOTAL_COLS; }

// every tier that exists in the database, for the filter dropdown
let TIER_OPTIONS = null;
function tierOptions() {
  if (TIER_OPTIONS) return TIER_OPTIONS;
  const seen = {};
  COMPS.forEach(c => { seen[tierKey(c)] = tierLabelFromKey(tierKey(c)); });
  TIER_OPTIONS = Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1]));
  return TIER_OPTIONS;
}

let GLOB_CACHE = null;
function globRows() {
  if (GLOB_CACHE) return GLOB_CACHE;
  const yF = GFILTER.yFrom ? +GFILTER.yFrom : -Infinity;
  const yT = GFILTER.yTo ? +GFILTER.yTo : Infinity;
  const matches = c =>
    (!GFILTER.tier || tierKey(c) === GFILTER.tier) &&
    (!GFILTER.series || c.series === GFILTER.series) &&
    (c.year === null || c.year === undefined || (c.year >= yF && c.year <= yT));

  const out = [];
  Object.keys(CAREER).forEach(pid => {
    const rows = CAREER[pid].filter(r => matches(r.c) && hasStats(r.p));
    if (!rows.length) return;
    const t = {};
    TIER_SUM.forEach(f => { rows.forEach(r => { if (has(r.p[f])) t[f] = (t[f] || 0) + Number(r.p[f]); }); });
    const last = rows.slice().sort((a, b) => (b.c.year || 0) - (a.c.year || 0))[0];
    out.push({ pid: pid, name: personName(pid), t: t, nComps: rows.length,
               lastTeam: last.p.team || '', lastYear: last.c.year });
  });
  GLOB_CACHE = out;
  return out;
}

function globFilterBar() {
  const years = [...new Set(COMPS.map(c => c.year).filter(has))].sort((a, b) => b - a);
  const seriesList = [...new Set(COMPS.map(c => c.series))].sort();
  const sel = (label, key, opts, cur) => `<div class="filter-field"><div class="filter-field-label">${esc(label)}</div>
    <select class="filter" data-gfilter="${key}">
      <option value="">All</option>
      ${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}
    </select></div>`;
  return `<div class="filter-bar" id="glob-filters">
    ${sel('Competition tier', 'tier', tierOptions(), GFILTER.tier)}
    ${sel('Series', 'series', seriesList.map(s => [s, s]), GFILTER.series)}
    ${sel('From season', 'yFrom', years.map(y => [y, y]), GFILTER.yFrom)}
    ${sel('To season', 'yTo', years.map(y => [y, y]), GFILTER.yTo)}
    <div class="filter-field" style="flex:1;min-width:200px;">
      <div class="filter-field-label">Search players</div>
      <input class="filter" id="glob-q" value="${esc(GFILTER.q)}" placeholder="Type a player's name…" style="width:100%;">
    </div>
  </div>`;
}

function renderGlobalPlayers() {
  return `<div class="page">
    <div class="dir-hero">
      <div class="bloom"><i class="b1"></i><i class="b2"></i></div>
      <div class="grain"></div>
      <div class="dir-hero-in">
        <h1 class="dir-hero-title">Player index</h1>
        <p class="dir-hero-sub">Every player the MABA / Genius Sports portal has published a line for, across all ${COMPS.length} competitions — matched on the source's own person identity, so one person is one card even across clubs, age groups and years. Where the source registered the same player twice under different spellings, the records are merged by hand.</p>
        <input class="dir-hero-search" id="glob-q-hero" value="${esc(GFILTER.q)}" placeholder="Search a player by name…" autocomplete="off">
      </div>
    </div>
    <div class="dir-bar">
      <div><span class="dir-count">${Object.keys(CAREER).length.toLocaleString()}</span> <span class="dir-count-l">players</span></div>
      <span class="seg">
        <button class="seg-btn ${GVIEW === 'cards' ? 'seg-on' : ''}" data-gview="cards">Cards</button>
        <button class="seg-btn ${GVIEW === 'table' ? 'seg-on' : ''}" data-gview="table">Table</button>
      </span>
    </div>
    ${globFilterBar()}
    <div id="glob-body">${GVIEW === 'cards' ? globCards() : globTable()}</div>
  </div>`;
}

/* ---- card view -------------------------------------------------------- */
/* One small card per player: who they are, what their teams won, and a
   three-figure line that always names the tier it belongs to — a per-game
   number with no competition attached is exactly what this site refuses to
   print. */
function playerCard(r) {
  const pid = r.pid;
  const bios = BIO[pid] || {};
  const bio = {};
  Object.values(bios).forEach(b => ['pos', 'ht', 'wt'].forEach(k => { if (has(b[k]) && !has(bio[k])) bio[k] = b[k]; }));
  const career = (CAREER[pid] || []).filter(x => hasStats(x.p));
  const yrs = career.map(x => x.c.year).filter(Boolean);
  const span = yrs.length ? (Math.min.apply(null, yrs) === Math.max.apply(null, yrs)
    ? String(Math.min.apply(null, yrs)) : Math.min.apply(null, yrs) + '–' + Math.max.apply(null, yrs)) : '—';

  /* The card shows the tier the player has actually played most — a browsing
     grid full of three-game MBL samples would compare nothing. The profile hero
     keeps its Major-Basketball-League-first default, where a selector sits next
     to it; here the tier and its game count are printed under the figures
     instead. Picking a tier in the filter bar overrides both. */
  const tiers = playerTiers(pid);
  const biggest = tiers.slice().sort((a, b) => (b.g || 0) - (a.g || 0))[0];
  const tk = GFILTER.tier && tiers.some(t => t.key === GFILTER.tier)
    ? GFILTER.tier : (biggest && biggest.key);
  const t = tiers.find(x => x.key === tk) || tiers[0];
  const titles = playerTitles(pid).slice(0, 4);

  /* One mark, one name. A club is preferred over a state: a player's club crest
     says more about him than the state he was selected for, and most of these
     players have both. A player who has only ever appeared for a state — never a
     club side — keeps his state flag, because that is all the source has. */
  const recent = career.slice().sort((a, b) => (b.c.year || 0) - (a.c.year || 0))
    .map(x => x.p.team).filter(Boolean);
  const dbLatest = recent.find(n => !stateSlug(n)) || recent[0] || '';
  // a signing or a departure in the News is newer than any box score: it names the team he is with now
  const nt = typeof newsTeam === 'function' ? newsTeam(pid) : null;
  const latest = nt ? nt.team : dbLatest;
  const teamLine = nt && !nt.team ? 'Free agent' : (latest || 'no team published');

  const stat = (v, l) => `<span class="pcard-stat"><b>${fmt1(v)}</b><span>${l}</span></span>`;
  /* The portraits are studio cut-outs, so the figure stands on the divider
     above the evidence zone rather than sitting inside a disc. Where the source
     has published none — 4,902 of 4,906 players — an oversized monogram takes
     the same corner instead. */
  return `<a class="pcard" href="#/p/${pid}">
    <div class="bloom" style="--team:${teamBloom(latest || dbLatest)}"><i class="b1"></i><i class="b2"></i></div>
    <div class="grain"></div>
    <div class="pcard-in">
      <div class="pcard-body">
        <div class="pcard-main">
          <div class="pcard-eyebrow">${esc(bio.pos || '—')} · ${span}</div>
          <div class="pcard-name">${esc(r.name)}</div>
          <div class="pcard-marks">${latest ? teamMark(latest) : ''}<span class="pcard-team">${esc(teamLine)}</span></div>
          <div class="pcard-chips">${nt ? `<span class="pcard-chip pcard-chip-new">${esc(newsTeamChip(pid))}</span>` : ''}${titles.length
            ? titles.map(x => `<span class="pcard-chip">${esc(tierShort(x.key))}${x.n > 1 ? ' ×' + x.n : ''}</span>`).join('')
            : `<span class="pcard-chip pcard-chip-none">${r.nComps} competition${r.nComps === 1 ? '' : 's'} · no title</span>`}</div>
        </div>
        ${PHOTOS[pid]
          ? `<div class="pcard-figure"><img src="${PHOTOS[pid]}" alt=""></div>`
          : `<span class="pcard-face" aria-hidden="true">${esc(initials(r.name))}</span>`}
      </div>
      ${t ? `<div class="pcard-ev">
        <div class="pcard-foot">${esc(tierShort(t.key))} · ${t.g} game${t.g === 1 ? '' : 's'}</div>
        <div class="pcard-stats">${stat(pg(t.pts, t.g), 'PTS')}${stat(pg(t.reb, t.g), 'REB')}${stat(pg(t.ast, t.g), 'AST')}</div>
      </div>`
      : `<div class="pcard-ev"><div class="pcard-foot">No published per-game line</div></div>`}
    </div>
  </a>`;
}

function globCards() {
  const st = SORT.glob;
  const cols = globCols();
  if (!cols.some(c => c[0] === st.key)) st.key = 'pts';
  let rows = globRows();
  if (GFILTER.q) { const q = GFILTER.q.toLowerCase(); rows = rows.filter(r => r.name.toLowerCase().includes(q)); }
  rows = sortRows(rows, st, (r, k) => { const c = cols.find(x => x[0] === k); return c ? c[2](r) : null; });
  // A face is the most identifying thing on a card, so the players the source has
  // published a portrait for lead the grid. Array.sort is stable, so within each
  // half the ranking below is untouched — this floats, it does not re-rank.
  const faces = rows.filter(r => PHOTOS[r.pid]).length;
  if (faces) rows = rows.sort((a, b) => (PHOTOS[b.pid] ? 1 : 0) - (PHOTOS[a.pid] ? 1 : 0));
  const total = rows.length;
  const shown = Math.min(PAGE.cards * CARD_PAGE, total);
  const view = rows.slice(0, shown);
  const tierName = GFILTER.tier ? tierLabelFromKey(GFILTER.tier) : null;
  const lead = faces
    ? ` The ${faces === 1 ? 'one player' : faces.toLocaleString() + ' players'} with a portrait lead the grid; everyone below them keeps that order.`
    : '';
  return `
    <div class="dir-note">${tierName
      ? `Ordered by total points in <strong>${esc(tierName)}</strong>, and every card's three figures are that player's per-game line in it.${lead}`
      : `Ordered by career points across every competition. Each card's three figures come from the single tier that player has played most, named under them — never an average across competitions. Pick a tier above to put every card in the same competition.${lead}`}</div>
    <div class="pcard-grid">${view.map(playerCard).join('')}</div>
    ${view.length ? '' : `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No player matches those filters.</div></div>`}
    <div class="dir-more">
      <span>${shown.toLocaleString()} of ${total.toLocaleString()} players</span>
      ${shown < total ? `<button class="chip" data-gmore="1">Load more players ↓</button>` : ''}
    </div>`;
}

function globTable() {
  const st = SORT.glob;
  const cols = globCols();
  if (!cols.some(c => c[0] === st.key)) st.key = 'pts';
  let rows = globRows();
  if (GFILTER.q) { const q = GFILTER.q.toLowerCase(); rows = rows.filter(r => r.name.toLowerCase().includes(q)); }
  rows = sortRows(rows, st, (r, k) => { const c = cols.find(x => x[0] === k); return c ? c[2](r) : null; });
  const total = rows.length;
  const start = Math.min(PAGE.glob * PAGE_SIZE, Math.max(0, total - 1));
  const view = rows.slice(start, start + PAGE_SIZE);
  const tierName = GFILTER.tier ? tierLabelFromKey(GFILTER.tier) : null;

  return `
  <div class="card">
    ${tierName
      ? `<div class="card-head" style="text-transform:none;font-size:13px;font-weight:500;color:var(--text-muted);">
           Scoped to <strong style="color:var(--text);">${esc(tierName)}</strong> — per-game and shooting columns are comparable within this tier.</div>`
      : `<div class="card-head" style="text-transform:none;font-size:13px;font-weight:500;color:var(--text-muted);">
           Totals across every competition. <strong style="color:var(--text);">Pick a competition tier above</strong> to see per-game and shooting figures.</div>`}
    <div class="table-scroll sticky-first"><table>
      <thead><tr>
        <th class="left">Player</th>
        ${cols.map(([k, l], i) => `<th data-gsort="${k}" ${i === cols.length - 1 ? 'style="padding-right:20px;"' : ''}${gloss(l)}>${l}${arrow(st, k)}</th>`).join('')}
      </tr></thead>
      <tbody>${view.map(r => `<tr class="clickable" onclick="location.hash='#/p/${r.pid}'" style="cursor:pointer;">
          <td class="left"><div class="player-cell">${avatar(r.pid, r.name)}
            <div><div class="p-name">${esc(r.name)}</div><div class="p-team">${r.lastTeam ? teamMark(r.lastTeam) + esc(r.lastTeam) : '<span style="color:var(--text-faint);">—</span>'}${r.lastYear ? ' · ' + r.lastYear : ''}</div></div></div></td>
          ${cols.map(([k, l, f], i) => {
            const v = f(r); const style = i === cols.length - 1 ? ' style="padding-right:20px;"' : '';
            if (k === 'comps') return `<td${style}><span class="num-pill">${v}</span></td>`;
            if (/pct/.test(k)) return `<td${style}>${has(v) ? pct1(v) : '—'}</td>`;
            if (/pg$/.test(k)) return `<td${style}>${fmt1(v)}</td>`;
            return `<td class="${k === 'pts' ? 'lead' : ''}"${style}>${v ? fmt0(v) : '—'}</td>`;
          }).join('')}
        </tr>`).join('')}
      ${view.length ? '' : `<tr><td colspan="${cols.length + 1}"><div class="empty-row" style="border:none;"><span class="empty-dot"></span>No player matches those filters.</div></td></tr>`}
      </tbody>
    </table></div>
    <div class="foot">
      <span>${total ? (start + 1).toLocaleString() + '–' + Math.min(start + PAGE_SIZE, total).toLocaleString() : 0} of ${total.toLocaleString()} players</span>
      <span>
        <button class="tab" data-gpage="prev" ${PAGE.glob === 0 ? 'disabled style="opacity:.4;cursor:default;"' : ''}>← Prev</button>
        <button class="tab" data-gpage="next" ${start + PAGE_SIZE >= total ? 'disabled style="opacity:.4;cursor:default;"' : ''}>Next →</button>
      </span>
    </div>
    <div class="note">Players are matched by the source's own person identifier, not by name, so one person is one row even across different clubs, age groups and years. ${tierName ? `Every figure here is confined to <strong>${esc(tierName)}</strong>, so the per-game and shooting columns compare like with like.` : 'With no tier selected only totals are shown — averaging a U15 championship together with a senior league would produce a number that means nothing.'}</div>
  </div>`;
}
