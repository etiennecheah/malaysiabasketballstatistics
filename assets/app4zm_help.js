/* =========================================================================
   Help and the site footer (update-111).
   #/help            How to use HoopStatsMY: where everything lives, the
                     tools, accounts, and the questions people ask.
   #/help/glossary   What the numbers mean: every abbreviation on the site in
                     plain words (STAT_GLOSS), grouped; /help/glossary/<term>
                     opens on one term. The maths sits on the Formulas page.
   #/help/data       Where the data comes from: the source, what is worked out
                     here, how games arrive, merges and corrections.
   siteFooter()      the footer under every page: the mark, the numbers, three
                     columns of links and the date of the latest result.
   ========================================================================= */
const HELP = (() => {
  const n0 = v => Number(v).toLocaleString('en');
  function facts() {
    const games = COMPS.reduce((a, c) => a + (c.nGames || 0), 0);
    const years = COMPS.map(c => +c.year).filter(Boolean);
    let last = '';
    COMPS.forEach(c => c.games.forEach(g => { if (g.st === 'COMPLETE' && g.date > last) last = g.date; }));
    return { comps: COMPS.length, players: Object.keys(PERSONS).length, games, since: Math.min(...years), last };
  }
  const nav = cur => `<nav class="hp-nav" aria-label="Help">${[['help', 'How to use the site'], ['help/glossary', 'What the numbers mean'], ['help/data', 'Where the data comes from']]
    .map(([h, l]) => `<a href="#/${h}"${cur === h ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  const head = (title, sub, cur) => `<header class="hp-head"><h1>${title}</h1><p>${sub}</p>${nav(cur)}</header>`;
  const mbl = () => typeof MB !== 'undefined' ? MB.tabLabel() : 'MBL';

  /* ---------- how to use ---------- */
  function how() {
    const F = facts();
    const map = [['#/', 'Today', 'The latest results and what is on next, signings and moves, and the live scores when a game is on.'],
      ['#/mbl', mbl(), 'This season of the Major Basketball League in tabs: an overview, games by weekend, standings, leaders, teams and rosters, every player’s numbers, records, milestones and analysis.'],
      ['#/players', 'Players', `All ${n0(F.players)} players. Search a name, or filter by league, season and position. A player who has played in the MBL shows his MBL numbers.`],
      ['#/competitions', 'Competitions', `All ${F.comps} competitions since ${F.since}: the MBL, the Agong Cup, the D-League, state and national youth championships, schools and FIBA events.`],
      ['#/teams', 'Teams', 'Clubs, state sides and national teams, with their competitions, results and rosters.'],
      ['#/records', 'Records', 'Champions and awards by year, the best single games, seasons and careers, and the youngest and oldest players.']];
    const tools = [['#/compare', 'Compare players', 'Two players side by side, inside a competition they both played.'],
      ['#/compare/lineups', 'Compare lineups', 'Two teams’ fives against each other in one competition.'],
      ['#/stats/lineups', 'Lineups', 'Groups of 5, 4, 3 or 2 players on court together, from the play-by-play.'],
      ['#/stats/clutch', 'Clutch', 'The last five minutes with the score within five.'],
      ['#/wowy', 'WOWY', 'How a team played with and without each of its players.'],
      ['#/shift', 'Stat Line Shift', 'One player’s line with and without chosen teammates.'],
      ['#/milestones', 'Milestones', 'Who is close to a career landmark.'],
      ['#/formulas', 'Formulas', 'How every number is worked out.']];
    const faq = [['Is this live?', 'Yes. During a game the scores update on Today and on the game’s own screen, and the box score, standings and season numbers update by themselves a few minutes after the final buzzer.'],
      ['What do PTS, TS% and +/- mean?', 'Every abbreviation in a table has a dotted underline: hover over it, or tap it on a phone, and it says what it means. The full list is under What the numbers mean.'],
      ['Why do some games show only a score?', 'Some competitions published results without a box score. Those games show the score and nothing more; a gap is labelled, never filled in.'],
      ['I found my own profile. Something is wrong.', 'Sign in, open your profile and claim it. Once it is approved you can correct your details, and a wrong game or name is fixed at the source so the fix lasts.'],
      ['Does it work on my phone?', 'Yes. The sections sit in a bar at the bottom, tables turn into cards, and Search is one tap away. Add the site to your home screen and it opens like an app.']];
    return `<div class="page hp-page">${head('How to use HoopStatsMY', 'Two minutes to find your way around.', 'help')}
      <section class="hp-hero"><div><span class="hp-eye">The fastest way in</span><h2>Search finds anything</h2>
        <p>Players, teams, competitions, pages and stat terms. On a keyboard, press <kbd>/</kbd> on any page. On a phone, tap Search in the bar at the bottom.</p></div>
        <div class="hp-acts"><button type="button" class="hp-btn hl" data-hs-search>Try a search</button><button type="button" class="hp-btn" data-hsg-open>Show the welcome guide</button></div></section>
      <section class="hp-sec"><h2>Where everything lives</h2><div class="hp-grid">${map.map(([h, t, d]) => `<a class="hp-card" href="${h}"><b>${esc(t)}</b><span>${esc(d)}</span></a>`).join('')}</div></section>
      <section class="hp-sec"><h2>The tools</h2><p class="hp-lede">Under <b>Tools</b> in the header, or <b>More</b> on a phone.</p><div class="hp-grid sm">${tools.map(([h, t, d]) => `<a class="hp-card" href="${h}"><b>${esc(t)}</b><span>${esc(d)}</span></a>`).join('')}</div></section>
      <section class="hp-sec"><h2>Your own page</h2><div class="hp-prose"><p>Browsing never needs an account. <b>Sign in</b> with Google to keep the players you care about on <a href="#/me">My page</a>: tap <b>Add to my players</b> on any profile. A player can also claim his own profile and keep it right.</p></div></section>
      <section class="hp-sec"><h2>Questions people ask</h2><div class="hp-faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section></div>`;
  }

  /* ---------- what the numbers mean ---------- */
  const GROUPS = [['The box score', ['G', 'MIN', 'MPG', 'PTS', 'REB', 'OR', 'DR', 'AST', 'STL', 'BLK', 'TOV', 'PF', 'PPG', 'RPG', 'APG']],
    ['Shooting', ['FG', '3P', 'FT', 'FG%', '2P%', '3P%', 'FT%', 'eFG%', 'TS%']],
    ['Ratings the source publishes', ['EFF', 'PIR', '+/-', 'OR%', 'DR%', 'TO%', 'A/TO']],
    ['Worked out here', ['GmSc', 'PER', 'USG%', 'ORtg', 'DRtg', 'OWS', 'DWS', 'WS', 'BPM', 'OBPM', 'DBPM', 'VORP', 'PTS ADDED']],
    ['Standings', ['W', 'L', '%Won', 'For', 'Agst', 'Diff', 'Pts']]];
  function glossary(term) {
    const one = term && STAT_GLOSS[term] ? term : '';
    return `<div class="page hp-page">${head('What the numbers mean', 'Every abbreviation on HoopStatsMY, in plain words. How each one is worked out is on the <a href="#/formulas">Formulas</a> page.', 'help/glossary')}
      ${GROUPS.map(([h, ks]) => { const L = ks.filter(k => STAT_GLOSS[k]); return L.length ? `<section class="hp-sec"><h2>${h}</h2><div class="hp-gl">${L.map(k => {
        const [name, ...rest] = STAT_GLOSS[k].split(' — ');
        return `<div class="hp-gi${one === k ? ' on' : ''}" id="gl-${esc(k.replace(/[^A-Za-z0-9]+/g, '-'))}"><span class="k">${esc(k)}</span><div><b>${esc(name)}</b>${rest.length ? `<p>${esc(rest.join(' — ').replace(/^./, ch => ch.toUpperCase()))}</p>` : ''}</div></div>`; }).join('')}</div></section>` : ''; }).join('')}</div>`;
  }

  /* ---------- where the data comes from ---------- */
  function data() {
    const F = facts();
    return `<div class="page hp-page">${head('Where the data comes from', 'Official numbers, kept honest.', 'help/data')}
      <div class="hp-tiles"><div><b>${n0(F.games)}</b><span>fixtures</span></div><div><b>${n0(F.players)}</b><span>players</span></div><div><b>${F.comps}</b><span>competitions</span></div><div><b>${F.since}</b><span>first season</span></div></div>
      <div class="hp-prose">
        <h2>The source</h2><p>Every game comes from the organisers’ own records: the MABA / Genius Sports competition portal for Malaysian competitions, and FIBA’s game pages for national-team events. Every figure shown is the source’s own published value, or a total or percentage worked out from it.</p>
        <h2>Gaps stay gaps</h2><p>Where the source left something out, a game without a box score or a player without a line, the page says so. Nothing is estimated or filled in by hand.</p>
        <h2>What is worked out here</h2><p>Per-game averages, percentages and records are added up from the box scores. The player Advanced tab adds ratings the source does not publish: PER, usage, Win Shares and BPM, with the formulas on the <a href="#/formulas">Formulas</a> page. Win Shares and BPM are models, so their numbers are estimates, and the tab says so and shows their uncertainty.</p>
        <h2>How games arrive</h2><p>After each final buzzer the site reads the new box score, play-by-play, standings and season lines and publishes them a few minutes later. Live scores come straight from the scorer’s feed while a game is on.</p>
        <h2>One person, one profile</h2><p>The same player can appear under slightly different spellings across seasons. They are joined into one profile, and only when the match is certain.</p>
        <h2>Corrections</h2><p>Found a mistake in your own profile or a game? Sign in and claim your profile, and it is fixed at the source so the fix lasts.</p>
        ${F.last ? `<p class="hp-note">Latest result in the database: ${esc(fmtDate(F.last))}.</p>` : ''}
      </div></div>`;
  }

  function render(sub, term) {
    return sub === 'glossary' ? glossary(term) : sub === 'data' ? data() : how();
  }
  // a glossary opened on one term scrolls to it
  function after() {
    const el = document.querySelector('.hp-gi.on');
    if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 80);
  }

  /* ---------- the footer ---------- */
  function footer() {
    const F = facts();
    const col = (h, L) => `<div class="sf-col"><h2>${h}</h2>${L.map(([href, l]) => href ? `<a href="${href}">${esc(l)}</a>` : `<button type="button" data-hsg-open>${esc(l)}</button>`).join('')}</div>`;
    return `<footer class="site-foot"><div class="sf-in">
      <div class="sf-top">
        <div class="sf-brand"><a href="#/" class="sf-mark" aria-label="HoopStatsMY, home"><span class="dot"></span><span>HOOPSTATS</span><span class="wm-my">MY</span></a>
          <p>Every Malaysian basketball game on record since ${F.since}: ${n0(F.games)} games, ${n0(F.players)} players and ${F.comps} competitions, built from the organisers’ own box scores.</p></div>
        ${col('Follow the game', [['#/', 'Today'], ['#/mbl', mbl()], ['#/competitions', 'Every competition'], ['#/records', 'Records & honours']])}
        ${col('Look someone up', [['#/players', 'Players'], ['#/teams', 'Teams'], ['#/compare', 'Compare two players'], ['#/me', 'My players']])}
        ${col('Help', [['#/help', 'How to use HoopStatsMY'], ['#/help/glossary', 'What the numbers mean'], ['#/help/data', 'Where the data comes from'], ['', 'Show the welcome guide']])}
      </div>
      <div class="sf-bot"><span>© ${new Date().getFullYear()} HoopStatsMY${F.last ? ` · latest result ${esc(fmtDate(F.last))}` : ''} · <a href="#/privacy">Privacy &amp; site rules</a></span><span>Stats from MABA and Genius Sports competition data</span></div>
    </div></footer>`;
  }
  return { render, after, footer };
})();
function renderHelp(sub, term) { return HELP.render(sub, term); }
function hlpAfterRender() { HELP.after(); }
