/* ---------------------------- chrome ---------------------------- */
const SITE = 'HOOPSTATS MY';

function navShell(links, sub) {
  // which page of the Tools menu is open, so the menu can mark it
  const h = HS.hash();
  const statsPage = /^#\/stats/.test(h) ? (/^#\/stats\/clutch/.test(h) ? 'clutch' : 'lineups')
    : /^#\/compare\/lineups/.test(h) ? 'cmp-lineups' : /^#\/compare/.test(h) ? 'cmp-players' : '';
  return `
  <div class="nav">
    <div class="nav-left">
      <a href="#/" class="wordmark" style="color:#fff;"><span class="dot"></span>${SITE}</a>
      <div class="nav-links">${links}</div>
    </div>
    <div class="nav-right">
      <input class="search" id="global-search" placeholder="Search players, teams, competitions…" autocomplete="off">
      ${typeof accNav === 'function' ? accNav() : ''}
      <button class="theme-toggle" data-theme-toggle="1" title="Switch between the light and dark theme" aria-label="Switch theme">
        <span class="sun">☀</span><span class="moon">☾</span>
      </button>
    </div>
    ${typeof STATS !== 'undefined' ? STATS.navMenu(statsPage) : ''}
  </div>
  ${typeof liveBar === 'function' ? liveBar() : ''}
  ${sub}`;
}
function subnav(label, crumb, links) {
  return `<div class="subnav"><div class="subnav-inner">
    <div class="subnav-eyebrow"><span class="subnav-label">${esc(label)}</span>${crumb ? `<span class="subnav-sep">·</span>${crumb}` : ''}</div>
    ${links && links.length ? `<div class="subnav-links">${links.map(([h, t, a]) => `<a href="${h}" class="subnav-link ${a ? 'active' : ''}">${esc(t)}</a>`).join('')}</div>` : ''}
  </div></div>`;
}

function siteLinks(state) {
  return [['#/', 'Home', state === 'home' || state === 'live'],
          ['#/players', 'Players', state === 'global-players' || state === 'player'],
          ['#/competitions', 'Competitions', state === 'hub' || state === 'notfound' || state === 'comp' || state === 'cfam'],
          ['#/teams', 'Teams', state === 'teams-hub' || state === 'team-global'],
          ['stats', 'Tools', state === 'stats' || state === 'compare'],   // a button: it opens the Tools menu (Lineups, Clutch, Compare)
          ['#/formulas', 'Formulas', state === 'formulas']]
    .map(([h, t, a]) => h === 'stats' ? (typeof STATS !== 'undefined' ? STATS.navButton(a) : '')
      : `<a href="${h}" class="nav-link ${a ? 'active' : ''}">${esc(t)}</a>`).join('');
}

function renderNav(state, cid, tab) {
  // Site-level pages — everything that isn't inside one competition. The Teams hub
  // and a team's own page belong here too; left out, they fell through to the
  // competition bar with no competition behind it.
  if (!cid || state === 'hub' || state === 'global-players' || state === 'player' || state === 'compare'
      || state === 'formulas' || state === 'notfound'
      || state === 'teams-hub' || state === 'team-global' || state === 'cfam'
      || state === 'home' || state === 'live' || state === 'me' || state === 'stats') {
    const links = siteLinks(state);
    const label = state === 'stats' || state === 'compare' ? 'Tools' : state === 'formulas' ? 'Formulas'
      : (state === 'teams-hub' || state === 'team-global') ? 'Teams'
      : (state === 'global-players' || state === 'player') ? 'Players' : 'Competitions';
    const crumb = state === 'stats'
      ? '<span class="subnav-crumb" id="st-crumb"></span>'
      : state === 'compare'
      ? '<span class="subnav-crumb">Compare · two players, or two teams\' lineups, inside a competition they both played</span>'
      : state === 'formulas'
      ? '<span class="subnav-crumb">what every abbreviation means, and where the number comes from</span>'
      : `<span class="subnav-crumb">Malaysia basketball database · ${COMPS.length} competitions</span>`;
    // a player's page opens straight into its own full-width hero
    return navShell(links, state === 'player' || state === 'cfam' || state === 'home' || state === 'live' || state === 'me' ? '' : subnav(label, crumb, []));
  }
  // Competition-scoped pages: the site bar, with Competitions lit. The sections of
  // the competition are tabs in the page's own header (compHeader); a team or a
  // box score inside it keeps a crumb back to the competition.
  const c = COMP_BY_ID[cid];
  const links = siteLinks('comp');
  const inHeader = ['dashboard', 'standings', 'schedule', 'teams', 'players', 'leaders'].includes(state);
  return navShell(links, inHeader ? '' : subnav('Competitions', `<a href="#/c/${cid}" class="subnav-crumb subnav-crumb-link">${esc(c ? c.name : '')}</a>`, []));
}

function renderFooter() {
  return `<div class="footer-note">
    ${SITE} — a database of Malaysian basketball competitions. ${COMPS.length} competitions, ${Object.keys(PERSONS).length.toLocaleString()} players and ${COMPS.reduce((a, c) => a + c.nGames, 0).toLocaleString()} fixtures, all sourced from the MABA / Genius Sports competition portal. Every figure shown is the source's own published value or a total/percentage computed from it, and gaps in the source are labelled rather than filled in. The exception is the player Advanced tab, where PER, usage, Win Shares and BPM are computed here from box scores — Win Shares and BPM are models, their numbers are estimates, and the tab says so and shows their uncertainty.
  </div>`;
}

/* ---------------------------- router ---------------------------- */
/* Moving between the tabs of one player's profile keeps the reader where they are: the tab bar
   is sticky, so a reader below it lands with the bar still in place and the new tab's content
   starting just under it; a reader above it stays exactly where they were. Any other move
   (a new page, another player) starts at the top. */
let ROUTE_PID = null;
function pvKeepScroll(y) {
  const pg = document.querySelector('.pv-page'), nav = document.querySelector('.pv-tabs');
  if (!pg || !nav) return window.scrollTo(0, 0);
  const natural = pg.getBoundingClientRect().top + window.scrollY, stick = parseFloat(getComputedStyle(nav).top) || 0;
  window.scrollTo(0, Math.min(y, Math.max(0, natural - stick)));
}
function route() {
  const hash = HS.hash().replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
  const app = document.getElementById('app');
  const samePlayer = parts[0] === 'p' && !!parts[1] && ROUTE_PID === parts[1], keepY = window.scrollY;
  ROUTE_PID = parts[0] === 'p' ? parts[1] : null;
  CREST_CID = parts[0] === 'c' ? parts[1] : null;   // an edition's own crests (EDITION_LOGO)
  let state = 'hub', cid = null, tab = '', body = '';

  // A profile link minted before two duplicate records were merged still points at
  // the id that lost; send it to the survivor rather than showing "player not found".
  if (parts[0] === 'p' && PALIAS[parts[1]]) {
    parts[1] = PALIAS[parts[1]];
    HS.go('#/' + parts.map(encodeURIComponent).join('/'), true);
    return;
  }

  if (parts.length === 0 || parts[0] === 'home') {
    // Home is the front door: live games when there are any, otherwise what's next and what just happened
    state = 'home'; body = renderHome();
  } else if (parts[0] === 'live' && parts[1]) {
    state = 'live'; body = renderLiveGame(parts[1]);
  } else if (parts[0] === 'watch' && parts[1]) {
    // the Watch page fills the screen: the video and the game's numbers, no site bar or footer
    app.innerHTML = renderWatch(parts[1]);
    window.scrollTo(0, 0);
    return;
  } else if (parts[0] === 'me') {
    // My page, and a verified player's edit page; both private to the signed-in person
    state = 'me'; body = parts[1] === 'edit' ? renderMeEdit() : renderMe();
  } else if (parts[0] === 'admin') {
    state = 'me'; body = renderAdmin();
  } else if (parts[0] === 'privacy') {
    state = 'me'; body = renderPrivacy();
  } else if (parts[0] === 'players') {
    state = 'global-players'; body = renderGlobalPlayers();
  } else if (parts[0] === 'competitions') {
    state = 'hub'; body = renderHub();
  } else if (parts[0] === 'teams') {
    state = 'teams-hub'; body = renderTeamsHub();
  } else if (parts[0] === 't' && parts[1]) {
    state = 'team-global'; body = renderTeamGlobal(decodeURIComponent(parts[1]));
  } else if (parts[0] === 'stats') {
    // Stats: Lineups and Clutch, chosen from the menu under the Stats tab
    state = 'stats'; tab = parts[1] === 'clutch' ? 'clutch' : 'lineups'; body = renderStats(tab);
  } else if (parts[0] === 'cf' && parts[1]) {
    state = 'cfam'; body = renderFamily(parts[1]);
  } else if (parts[0] === 'formulas') {
    state = 'formulas'; body = renderFormulas();
  } else if (parts[0] === 'compare' && parts[1] === 'lineups') {
    // Compare › Lineups: two teams' fives against each other, in one competition
    state = 'compare'; body = renderCmpLineups(parts[2]);
  } else if (parts[0] === 'compare') {
    state = 'compare';
    COMPARE.a = parts[1] && PERSONS[parts[1]] ? parts[1] : '';
    COMPARE.b = parts[2] && PERSONS[parts[2]] ? parts[2] : '';
    body = renderCompare();
  } else if (parts[0] === 'p' && parts[1]) {
    state = 'player'; tab = parts[2] || 'overview'; body = renderPlayer(parts[1], tab);
  } else if (parts[0] === 'c' && parts[1] && COMP_BY_ID[parts[1]]) {
    cid = parts[1];
    const r = parts.slice(2);
    if (r.length === 0) { state = 'dashboard'; body = renderCompDash(cid); }
    else if (r[0] === 'standings') { state = 'standings'; body = renderStandings(cid); }
    else if (r[0] === 'schedule') { state = 'schedule'; tab = (r[1] === 'upcoming' ? 'upcoming' : 'results'); body = renderSchedule(cid, tab); }
    else if (r[0] === 'teams') { state = 'teams'; body = renderTeams(cid); }
    else if (r[0] === 'team' && r[1]) { state = 'teams'; tab = r[2] || 'roster'; body = renderTeam(cid, r[1], tab); }
    else if (r[0] === 'players') { state = 'players'; body = renderCompPlayers(cid); }
    else if (r[0] === 'leaders') { state = 'leaders'; body = renderLeaders(cid); }
    else if (r[0] === 'box' && r[1]) { state = 'schedule'; body = renderBox(cid, r[1]); }
    else if (r[0] === 'pbp' && r[1]) { state = 'schedule'; body = renderPBP(cid, r[1]); }
    else if (r[0] === 'manalysis' && r[1]) { state = 'schedule'; body = renderMatchAnalysis(cid, r[1]); }
    else { state = 'dashboard'; body = renderCompDash(cid); }
  } else if (parts[0] === 'c') {
    state = 'notfound'; body = renderNotFound(parts[1]);
  } else {
    body = renderHub();
  }

  app.innerHTML = renderNav(state, cid, tab) + body + renderFooter();
  if (samePlayer) pvKeepScroll(keepY); else window.scrollTo(0, 0);
  wireSearch();
  if (typeof afterRender === 'function') afterRender();
  if (typeof hsApplyMeta === 'function') hsApplyMeta(HS.hash());
}

function renderNotFound(id) {
  return `<div class="page">
    <div class="page-head"><div>
      <h1 class="page-title">Competition not found</h1>
      <div class="page-sub">"${esc(id || '')}" isn't a competition in this database.</div>
    </div></div>
    <div class="card"><div class="empty-row"><span class="empty-dot"></span>Browse all ${COMPS.length} competitions from the <a href="#/competitions">Competitions</a> page.</div></div>
  </div>`;
}

/* ---------------------------- search ---------------------------- */
function wireSearch() {
  const el = document.getElementById('global-search');
  if (!el) return;
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = el.value.trim().toLowerCase();
    if (!q) return;
    const pid = Object.keys(PERSONS).find(k => PERSONS[k].toLowerCase().includes(q));
    if (pid) { HS.go('#/p/' + pid); return; }
    const comp = COMPS.find(c => (c.label||c.name).toLowerCase().includes(q));
    if (comp) { HS.go('#/c/' + comp.id); return; }
    const tid = Object.keys(TEAMS).find(k => TEAMS[k].toLowerCase().includes(q));
    if (tid && TEAM_COMPS[tid]) { HS.go('#/c/' + TEAM_COMPS[tid][0] + '/team/' + tid); return; }
  });
}
