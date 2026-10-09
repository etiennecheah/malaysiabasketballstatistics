/* ---------------------------- Competitions hub ---------------------------- */
const FILTER = { year: '', series: '', gender: '', level: '', q: '' };

function uniqSorted(fn, numeric) {
  const s = [...new Set(COMPS.map(fn).filter(has))];
  return numeric ? s.sort((a, b) => b - a) : s.sort();
}
function filteredComps() {
  return COMPS.filter(c =>
    (!FILTER.year || String(c.year) === FILTER.year) &&
    (!FILTER.series || c.series === FILTER.series) &&
    (!FILTER.gender || c.gender === FILTER.gender) &&
    (!FILTER.level || c.level === FILTER.level) &&
    (!FILTER.q || (c.label||c.name).toLowerCase().includes(FILTER.q.toLowerCase()))
  ).sort((a, b) => (b.year || 0) - (a.year || 0) || a.series.localeCompare(b.series) || a.name.localeCompare(b.name));
}
function selectField(label, key, opts) {
  return `<div class="filter-field"><div class="filter-field-label">${esc(label)}</div>
    <select class="filter" data-filter="${key}">
      <option value="">All</option>
      ${opts.map(o => `<option value="${esc(o)}" ${FILTER[key] === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select></div>`;
}

/* A competition card, in the same dark-glass language as the player cards: the
   crest anchors it, the evidence strip carries teams / games / players, and the
   bloom takes a stable hue from the series so a family of competitions reads as
   one colour down the grid. */
function compCard(c) {
  const status = compStatus(c);
  // the champion comes from the final; a live competition has a leader only when
  // it is one table — with several groups there is no single leader to name
  const champ = status === 'Completed' ? c.champ : null;
  const leader = status === 'In progress' && c.groups.length === 1 && c.stand.length ? c.stand[0].team : null;
  const foot = status === 'Completed'
    ? `Completed · ${c.nGames} game${c.nGames === 1 ? '' : 's'}`
    : status === 'In progress'
      ? `In progress · ${compProgress(c)}`
      : `Scheduled · ${c.start ? 'starts ' + fmtDateShort(c.start) : 'not started'}`;
  const stat = (v, l) => `<span class="ccard-stat"><b>${v}</b><span>${l}</span></span>`;
  return `<a class="ccard" href="#/c/${c.id}">
    <div class="bloom" style="--team:${teamBloom(c.series)}"><i class="b1"></i><i class="b2"></i></div>
    <div class="grain"></div>
    <div class="ccard-in">
      <div class="ccard-body">
        <div class="ccard-crest">${compCrest(c, 62)}</div>
        <div class="ccard-main">
          <div class="ccard-eyebrow">${esc(c.gender.replace(' / Unspecified', ''))} · ${esc(c.level)}${c.year ? ' · ' + c.year : ''}</div>
          <div class="ccard-name">${esc(c.label || c.name)}</div>
          <span class="ccard-series">${esc(c.series)}</span>
          <div class="ccard-chips">
            <span class="ccard-chip">${esc(compRange(c))}</span>
            ${champ ? `<span class="ccard-chip ccard-chip-win">${crest(champ, 13)}${esc(champ)}</span>`
              : leader ? `<span class="ccard-chip">${crest(leader, 13)}Leading · ${esc(leader)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="ccard-ev">
        <div class="ccard-foot">${foot}</div>
        <div class="ccard-stats">
          ${stat(c.nTeams, 'Teams')}${stat(c.nGames, 'Games')}${stat(c.nPlayers, 'Players')}
        </div>
      </div>
    </div>
  </a>`;
}

function compSection(title, dot, items) {
  if (!items.length) return '';
  return `<div class="cat-head"><span class="cat-dot" style="background:${dot};"></span>
      <h2>${title}</h2><span class="cat-count">${items.length}</span><span class="cat-rule"></span></div>
    <div class="ccard-grid">${items.map(compCard).join('')}</div>`;
}

/* renderHub lives in app3b_family.js: one card per competition family */

/* ---------------------------- Competition dashboard ---------------------------- */
function compLeaderTop(c, cat) {
  const b = c.leaders.find(l => l.cat === cat);
  if (!b || !b.rows.length) return null;
  return b.rows[0];
}
/* One header for every page inside a competition: the mark on a white plate, the
   name, a line of facts, status and champion pills, then underline tabs with
   counts. The site bar above stays the site bar. */
function compTabs(c, active) {
  const B = '#/c/' + c.id;
  const T = [['dashboard', 'Overview', B, ''], ['standings', 'Standings', B + '/standings', ''],
             ['schedule', 'Games', B + '/schedule', c.nGames], ['teams', 'Teams', B + '/teams', c.nTeams],
             ['players', 'Players', B + '/players', c.nPlayers], ['leaders', 'Leaders', B + '/leaders', '']];
  return `<nav class="cx-tabs" aria-label="Competition sections">${T.map(([k, t, h, n]) =>
    `<a href="${h}" class="cx-tab ${active === k ? 'on' : ''}"${active === k ? ' aria-current="page"' : ''}>${esc(t)}${n ? `<span class="n">${fmt0(n)}</span>` : ''}</a>`).join('')}</nav>`;
}
function compHeader(c, active, title) {
  const facts = [compRange(c), c.nTeams + ' teams', c.nGames + ' games', c.nPlayers + ' players'];
  const st = compStatus(c);
  const stCls = st === 'Completed' ? 'done' : st === 'In progress' ? 'live' : 'sched';
  const fam = CF_META[compFamily(c)];
  return `<div class="cx-crumb"><a href="#/competitions">Competitions</a><span>/</span><a href="#/cf/${fam.key}">${esc(fam.short)}</a><span>/</span>${c.year || ''}${c.year ? ' · ' : ''}${esc(compDivision(c).sex)}</div>
    <div class="cx-head">
      ${compCrest(c, 56)}
      <div class="cx-id">
        <h1 class="page-title">${esc(title || c.label || c.name)}</h1>
        <div class="cx-sub">${title ? `<a href="#/c/${c.id}">${esc(c.label || c.name)}</a> · ` : ''}${facts.map(esc).join(' · ')}</div>
      </div>
      <div class="cx-pills">
        <span class="cx-pill ${stCls}"><i></i>${esc(st)}${st === 'In progress' ? ' · ' + (c.nDone < c.nGames ? c.nDone + '/' + c.nGames : compProgress(c)) : ''}</span>
        ${c.champ ? `<span class="cx-pill gold"><i></i>Champion · ${esc(c.champ)}</span>` : ''}
      </div>
    </div>
    ${compTabs(c, active)}`;
}

/* Playoff series, final first, from the games tagged with a round */
function compSeries(c) {
  if (!c.phase) return [];
  const by = {};
  c.games.forEach(g => {
    const p = c.phase[g.mid]; if (!p) return;
    const k = p.r + ' ' + p.n;
    const s = by[k] || (by[k] = { r: p.r, n: p.n, bo: p.bo || 0, wins: {}, games: 0 });
    if (g.st === 'COMPLETE') {
      s.games++;
      const w = g.hs > g.as ? g.h : g.a, l = g.hs > g.as ? g.a : g.h;
      s.wins[w] = (s.wins[w] || 0) + 1; s.wins[l] = s.wins[l] || 0;
    }
  });
  const rank = r => r === 'Final' ? 0 : /semi/i.test(r) ? 1 : /quarter/i.test(r) ? 2 : r === 'Playoffs' ? -1 : 3;
  return Object.values(by).sort((a, b) => rank(a.r) - rank(b.r) || a.n - b.n).map(s => {
    const t = Object.entries(s.wins).sort((a, b) => b[1] - a[1]);
    const multi = Object.values(by).filter(x => x.r === s.r).length > 1;
    // a best-of series is only won once one side has more than half the games
    const over = !s.bo || (t[0] && t[0][1] > s.bo / 2);
    const verb = over ? 'beat' : t[1] && t[0][1] === t[1][1] ? 'level with' : 'lead';
    return { name: s.r + (multi ? ' ' + s.n : ''), w: t[0] && t[0][0], l: t[1] && t[1][0], verb, bo: s.bo,
      score: t.length > 1 ? t[0][1] + '–' + t[1][1] : '' };
  });
}

/* Leaders on the overview: per-game boards. A split competition takes them from
   the chosen phase's box scores; everything else from the published boards. */
function dashBoards(c) {
  const ph = phaseOf(c);
  const boards = ph !== 'all' ? phaseLeaders(c, ph).boards : c.leaders;
  const teamOf = {}; c.players.forEach(p => { teamOf[p.pid] = p.team || ''; });
  const get = cat => { const b = boards.find(x => x.cat === cat); return b ? b.rows.map(r => ({ pid: r.pid, v: r.v, team: r.team || teamOf[r.pid] || '' })) : []; };
  return { ph, pts: get('Average points'), reb: get('Average total rebounds'), ast: get('Average assists'), eff: get('Efficiency') };
}
function dashLeaders(c) {
  const L = dashBoards(c);
  if (!L.pts.length && !L.reb.length) return '';
  const v = x => has(x) ? (typeof x === 'number' ? (Number.isInteger(x) ? x : x.toFixed(1)) : x) : '—';
  const main = L.pts.length ? L.pts : L.reb;
  const unit = L.pts.length ? 'PPG' : 'RPG';
  const others = [['Rebounds', L.reb, 'RPG'], ['Assists', L.ast, 'APG'], ['Efficiency', L.eff, 'total']].filter(x => x[1].length && x[1] !== main);
  return `<div class="card cx-card">
    <div class="card-head">${L.pts.length ? 'Scoring leaders' : 'Rebounding leaders'}${c.split ? `<span class="cx-right">${phaseSeg(c).replace(/<button[^>]*data-phase="all"[^>]*>[^<]*<\/button>/, '')}</span>` : `<a class="cx-right cx-more" href="#/c/${c.id}/leaders">All boards →</a>`}</div>
    <div class="cx-list">${main.slice(0, 5).map((r, i) => `<div class="cx-li">
      <span class="cx-r">${i + 1}</span>
      <div class="cx-who"><div class="cx-nm">${personLink(r.pid)}</div><div class="cx-tm">${r.team ? crest(r.team, 16) + esc(r.team) : ''}</div></div>
      <div class="cx-v">${v(r.v)}<small>${unit}</small></div></div>`).join('')}</div>
    ${others.length ? `<div class="cx-also">${others.map(([t, rows, u]) => `<div class="cx-also-i">
      <div class="cx-also-t">${t}</div><div class="cx-also-n">${personLink(rows[0].pid)}</div><div class="cx-also-v">${v(rows[0].v)} <small>${u}</small></div></div>`).join('')}</div>` : ''}
    <div class="note">${L.ph !== 'all' ? (L.ph === 'rs' ? 'Regular season' : 'Playoffs') + ', from the box scores; averages need half the most games anyone played.' : 'Per game, from the competition\'s own published leaders boards.'}</div>
  </div>`;
}

function renderCompDash(cid) {
  const c = COMP_BY_ID[cid];
  const done = c.games.filter(g => g.st === 'COMPLETE');
  const recent = done.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
  const upcoming = c.games.filter(isUpcoming).slice(0, 6);
  const topEff = compLeaderTop(c, 'Efficiency');
  // forfeits (20-0, nobody played) and finals the source left without a score are results, not scoring
  const scored = done.filter(g => !g.ff && g.hs != null && g.as != null);
  const biggest = scored.map(g => Object.assign({ m: Math.abs(g.hs - g.as) }, g))
    .sort((a, b) => b.m - a.m)[0];
  const ppg = scored.length ? scored.reduce((a, g) => a + g.hs + g.as, 0) / scored.length / 2 : null;
  const series = compSeries(c);
  const standCard = c.groups.length > 1 ? dashGroups(c) : c.stand.length ? `<div class="card cx-card">
      <div class="card-head">Standings<span class="hint">As published</span><a class="cx-right cx-more" href="#/c/${cid}/standings">Full table →</a></div>
      <div class="table-scroll"><table class="cx-table">
        <thead><tr><th class="left nosort"${gloss('#')}>#</th><th class="left nosort">Team</th><th class="nosort"${gloss('GP')}>GP</th><th class="nosort"${gloss('W')}>W</th><th class="nosort"${gloss('L')}>L</th><th class="nosort"${gloss('%Won')}>Win %</th><th class="nosort"${gloss('For')}>PF</th><th class="nosort"${gloss('Agst')}>PA</th><th class="nosort"${gloss('Diff')}>Diff</th></tr></thead>
        <tbody>${c.stand.slice(0, 10).map(r => `<tr class="${c.champ && r.team === c.champ ? 'cx-me' : ''}">
          <td class="left cx-rank">${fmt0(r.pos)}</td>
          <td class="left"><div class="team">${crest(r.team, 22)}${teamLinkC(cid, r.team)}</div></td>
          <td>${fmt0(r.gp)}</td><td>${fmt0(r.w)}</td><td>${fmt0(r.l)}</td><td>${has(r.pct) ? fmt1(r.pct) : r.gp ? fmt1(r.w / r.gp * 100) : '—'}</td>
          <td class="cx-dim">${fmt0(r.pf)}</td><td class="cx-dim">${fmt0(r.pa)}</td>
          <td class="${r.gd > 0 ? 'cx-plus' : r.gd < 0 ? 'cx-minus' : ''}">${fmtPM(r.gd)}</td></tr>`).join('')}</tbody>
      </table></div>
      ${c.champ && c.split ? `<div class="note">${esc(c.champ)} won the title through the playoffs. The table is the regular season as the league published it.</div>` : ''}
    </div>` : '';
  const results = `<div class="card cx-card">
      <div class="card-head">Latest results<a class="cx-right cx-more" href="#/c/${cid}/schedule">All ${fmt0(c.nGames)} games →</a></div>
      ${recent.length ? recent.map(g => gameRow(cid, g)).join('') : `<div class="empty-row"><span class="empty-dot"></span>No completed games published yet.</div>`}
    </div>`;
  const up = upcoming.length ? `<div class="card cx-card">
      <div class="card-head">Upcoming<span class="hint">${c.games.filter(isUpcoming).length} to play</span></div>
      ${upcoming.map(g => gameRow(cid, g)).join('')}
    </div>` : '';
  const po = series.length ? `<div class="card cx-card">
      <div class="card-head">Playoffs</div>
      <div class="cx-list">${series.map(s => `<div class="cx-li cx-series">
        <div class="cx-who"><div class="cx-nm">${esc(s.name)}</div><div class="cx-tm cx-tm-text">${s.w ? crest(s.w, 16) + ` <b>${esc(s.w)}</b> ${s.verb} ${esc(s.l || '')}` : 'Not played yet'}${s.bo ? ` <span class="cx-dim">· best of ${s.bo}</span>` : ''}</div></div>
        <div class="cx-v">${s.score}</div></div>`).join('')}</div>
    </div>` : '';
  const facts = [
    ['Games played', c.nDone + ' of ' + c.nGames],
    ['Points per team per game', ppg ? fmt1(ppg) : '—'],
    ['Biggest margin', biggest ? `+${biggest.m} <span class="cx-dim">${esc(biggest.hs > biggest.as ? biggest.h : biggest.a)}, ${fmtDateShort(biggest.date)}</span>` : '—'],
    ['Top efficiency, season total', topEff ? `${personLink(topEff.pid)} <span class="cx-dim">${fmt0(topEff.v)}</span>` : '—'],
    ['Series · level', esc(c.series) + ' · ' + esc(c.gender.replace(' / Unspecified', '')) + ' · ' + esc(c.level)],
  ];
  const factCard = `<div class="card cx-card">
      <div class="card-head">At a glance</div>
      <dl class="cx-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    </div>`;
  return `
  <div class="page cx-page">
    ${compHeader(c, 'dashboard')}
    <div class="cx-grid">
      <div class="cx-main">${standCard}${results}${up}</div>
      <div class="cx-side">${dashLeaders(c)}${po}${factCard}</div>
    </div>
  </div>`;
}

/* a finished result that is not an ordinary game: a forfeit, or a final with no score published */
function gameFlag(g) {
  if (g.ff) return '<span class="po-tag ff-tag" data-imtip="Awarded 20–0 by forfeit; nobody played">Forfeit</span>';
  if (g.st === 'COMPLETE' && g.hs == null) return '<span class="po-tag ff-tag" data-imtip="The source marks this game final but never published its score">Score not published</span>';
  return '';
}

function gameRow(cid, g) {
  // a game the live feed is following: its score and clock, and the row leads to the live page
  const lv = typeof fixtureLive === 'function' ? fixtureLive(g) : null;
  if (lv && lv.d) {
    const fin = lv.state === 'final', hs = lv.d.teams[0].score, as = lv.d.teams[1].score;
    const cls = (mine, theirs) => fin ? (mine > theirs ? 'win' : 'loss') : (mine > theirs ? 'win' : '');
    return `<div class="row clickable row-live" data-gmid="${esc(g.mid)}" onclick="location.hash='#/live/${g.mid}'">
    <div class="r-date"><div class="d1">${fmtDateShort(g.date)}</div><div>${g.date ? g.date.slice(0, 4) : ''}</div></div>
    <div class="team ${cls(hs, as)}">${crest(g.h)}<span class="name">${esc(g.h)}</span><span class="score">${fmt0(hs)}</span></div>
    <div class="team ${cls(as, hs)}">${crest(g.a)}<span class="name">${esc(g.a)}</span><span class="score">${fmt0(as)}</span></div>
    <div class="venue">${fin ? '<span class="lv-tag lv-tag-fin">FINAL</span>' : '<span class="lv-tag"><span class="lv-dot"></span>LIVE</span>'}
      <span class="row-clock">${fin ? '' : esc(liveClock(lv.d))}</span><span class="box-link">${fin ? 'Box score and plays' : 'Follow the game'} →</span></div>
  </div>`;
  }
  const complete = g.st === 'COMPLETE';
  const hw = complete && g.hs > g.as, aw = complete && g.as > g.hs;
  const clickable = complete && g.box;
  return `<div class="row ${clickable ? 'clickable' : ''}" data-gmid="${esc(g.mid)}" ${clickable ? `onclick="location.hash='#/c/${cid}/box/${g.mid}'"` : ''}>
    <div class="r-date"><div class="d1">${fmtDateShort(g.date)}</div><div>${g.date ? g.date.slice(0, 4) : ''}</div></div>
    <div class="team ${complete ? (hw ? 'win' : 'loss') : ''}">${crest(g.h)}<span class="name">${esc(g.h)}</span><span class="score">${complete ? fmt0(g.hs) : ''}</span></div>
    <div class="team ${complete ? (aw ? 'win' : 'loss') : ''}">${crest(g.a)}<span class="name">${esc(g.a)}</span><span class="score">${complete ? fmt0(g.as) : ''}</span></div>
    <div class="venue">${phaseLabel(COMP_BY_ID[cid], g.mid) || g.ff || (complete && g.hs == null) ? `<div class="po-line">${phaseLabel(COMP_BY_ID[cid], g.mid) ? `<span class="po-tag">${esc(phaseLabel(COMP_BY_ID[cid], g.mid))}</span> ` : ''}${gameFlag(g)}</div>` : ''}${esc(g.venue || '')}${clickable ? `<span class="box-link">${hasPbp(g.mid) ? 'Play-by-play' : 'Match'} →</span>`
      : g.st === 'NOT_PLAYED' ? `<span class="box-link np-flag" data-imtip="${esc(g.np || 'Never played')}">Not played</span>`
      : (complete ? '' : `<span class="box-link" style="color:var(--text-faint);font-weight:500;">${esc(g.time || 'Scheduled')}</span>`)}</div>
  </div>`;
}

/* the games of one competition the live feed is following, as a card above its results */
function schedLiveInner(cid) {
  const c = COMP_BY_ID[cid];
  if (!c || typeof fixtureLive !== 'function') return '';
  const rows = c.games.map(g => ({ g, v: fixtureLive(g) })).filter(x => x.v && x.v.d);
  if (!rows.length) return '';
  const on = rows.filter(x => x.v.state === 'live').length;
  return `<div class="card"><div class="card-head">${on ? 'Live now' : 'Just finished'}<span class="hint">${on ? 'score and clock from the live feed' : 'joins the results at the next update of the database'}</span></div>
    ${rows.map(x => gameRow(cid, x.g)).join('')}</div>`;
}
/* called by the live layer on every tick: repaint the schedule rows the feed speaks for */
function scheduleLiveRefresh() {
  if (typeof LIVE === 'undefined') return;
  const box = document.getElementById('sched-live');
  if (box) box.innerHTML = schedLiveInner(box.dataset.cid);
  document.querySelectorAll('.row[data-gmid]').forEach(el => {
    if (el.closest('#sched-live')) return;
    const g = GAME_BY_MID[el.dataset.gmid];
    if (!g || g.st === 'COMPLETE') return;
    const lv = fixtureLive(g);
    if (!(lv && lv.d) && !el.classList.contains('row-live')) return;
    const t = document.createElement('template');
    t.innerHTML = gameRow(g.cid, g).trim();
    el.replaceWith(t.content.firstChild);
  });
}

/* ---------------------------- Standings ---------------------------- */
/* The source publishes one table per phase and pool — a national championship's
   four groups are four pages — so a group title reads "Preliminary Round — Group
   BA". The phase heads a section; each group inside it is its own table. */
function groupParts(title) {
  const i = (title || '').indexOf(' — ');
  return i < 0 ? { phase: '', name: title || 'Standings' } : { phase: title.slice(0, i), name: title.slice(i + 3) };
}
function groupRows(c, gi) { return c.stand.filter(r => (r.g || 0) === gi); }

/* compact = a group card beside another: %Won (it is W ÷ GP) and the code pill go,
   so For / Agst / Diff / Pts stay on screen instead of behind a scroll */
function standTable(cid, rows, compact) {
  return `<div class="table-scroll"><table>
    <thead><tr><th class="nosort"${gloss('#')}>#</th><th class="left nosort">Team</th><th class="nosort"${gloss('GP')}>GP</th><th class="nosort"${gloss('W')}>W</th><th class="nosort"${gloss('L')}>L</th>
      ${compact ? '' : `<th class="nosort"${gloss('%Won')}>%Won</th>`}<th class="nosort"${gloss('For')}>For</th><th class="nosort"${gloss('Agst')}>Agst</th><th class="nosort"${gloss('Diff')}>Diff</th><th class="nosort" style="padding-right:20px;"${gloss('Pts')}>Pts</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${fmt0(r.pos)}</td>
      <td class="left"><div class="team">${crest(r.team)}${teamLinkC(cid, r.team)}${r.code && !compact ? `<span class="num-pill">${esc(r.code)}</span>` : ''}</div></td>
      <td>${fmt0(r.gp)}</td><td>${fmt0(r.w)}</td><td>${fmt0(r.l)}</td>${compact ? '' : `<td>${has(r.pct) ? fmt1(r.pct) : '—'}</td>`}
      <td>${fmt0(r.pf)}</td><td>${fmt0(r.pa)}</td><td>${fmtPM(r.gd)}</td><td style="padding-right:20px;font-weight:700;">${fmt0(r.pts)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderStandings(cid) {
  const c = COMP_BY_ID[cid];
  if (!c.stand.length) return page(c, 'Standings', `<div class="card"><div class="empty-row"><span class="empty-dot"></span>This competition's source page publishes no standings table.</div></div>`);
  const nSb = c.games.filter(g => g.sb).length;
  const fix = c.standFix || [];
  const note = `<div class="note">${fix.length
    ? `The source's table${fix.length > 1 ? 's' : ''} for ${fix.map(t => esc(groupParts(t).name || t)).join(' and ')} stopped updating before the group games were finished, so ${fix.length > 1 ? 'they are' : 'it is'} rebuilt here from the results: 2 points a win, 1 a loss, ordered by points and then points difference (head-to-head is not applied). ${nSb} game${nSb === 1 ? '' : 's'} had no published score; ${nSb === 1 ? 'its score is' : 'their scores are'} the sum of each team's points in the box score.${fix.length < c.groups.length ? ' Other tables are as published.' : ''}`
    : 'Standings exactly as published by the competition\'s own standings page — position, games played, win/loss, points for and against, difference, win percentage and competition points.'}${c.groups.length > 1 ? ` The source publishes each group on its own page; all ${c.groups.length} are shown here, in the order they were played. Knockout rounds publish no table — their results are under Games.` : ''}</div>`;
  if (c.groups.length <= 1) {
    return page(c, 'Standings', `<div class="card">${standTable(cid, c.stand)}${note}</div>`);
  }
  // one section per phase, each group a card of its own
  const phases = [];
  c.groups.forEach((t, gi) => {
    const p = groupParts(t);
    let ph = phases.find(x => x.phase === p.phase);
    if (!ph) phases.push(ph = { phase: p.phase, groups: [] });
    ph.groups.push({ gi, name: p.name });
  });
  // the source numbers some pools out of order (NXT's Group B is pool 1)
  phases.forEach(ph => ph.groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  return page(c, 'Standings', `
    ${c.champ ? `<div class="champ-line">${crest(c.champ, 22)}<span><b>${esc(c.champ)}</b> won the competition${c.champHow === 'final' ? ' — decided in the final, not by any group table' : ''}.</span></div>` : ''}
    ${phases.map(ph => `
      ${ph.phase ? `<div class="stand-phase">${esc(ph.phase)}<span>${ph.groups.length} group${ph.groups.length === 1 ? '' : 's'}</span></div>` : ''}
      <div class="stand-groups">
        ${ph.groups.map(g => `<div class="card stand-card">
          <div class="card-head">${esc(g.name)}<span class="hint">${groupRows(c, g.gi).length} teams</span></div>
          ${standTable(cid, groupRows(c, g.gi), true)}
        </div>`).join('')}
      </div>`).join('')}
    <div class="card" style="margin-top:4px;">${note}</div>`);
}

/* Dashboard: every group of the first phase, top rows only. The full tables,
   later rounds included, are one click away. */
function dashGroups(c) {
  const first = groupParts(c.groups[0]).phase;
  const shown = c.groups.map((t, gi) => ({ gi, p: groupParts(t) })).filter(x => x.p.phase === first)
    .sort((a, b) => a.p.name.localeCompare(b.p.name, undefined, { numeric: true }));
  const more = c.groups.length - shown.length;
  return `<div class="card">
    <div class="card-head">Standings<span class="hint">${first ? esc(first) + ' · ' : ''}${shown.length} groups${more ? ' · ' + more + ' more in later rounds' : ''}</span>
      <a href="#/c/${c.id}/standings" style="margin-left:auto;font-size:12px;font-weight:600;">Full standings →</a></div>
    <div class="dash-groups">${shown.map(x => `<div class="dash-group">
      <div class="dash-group-h">${esc(x.p.name)}</div>
      ${groupRows(c, x.gi).map(r => `<div class="dash-group-r">
        <span class="dgr-pos">${fmt0(r.pos)}</span>
        <span class="dgr-team">${crest(r.team, 16)}${teamLinkC(c.id, r.team)}</span>
        <span class="dgr-wl">${fmt0(r.w)}–${fmt0(r.l)}</span>
        <span class="dgr-gd">${fmtPM(r.gd)}</span>
      </div>`).join('')}
    </div>`).join('')}</div>
  </div>`;
}

function page(c, title, body, sub) {
  const key = { Standings: 'standings', Games: 'schedule', Teams: 'teams', Players: 'players', Leaders: 'leaders' }[title] || '';
  return `<div class="page cx-page">
    ${compHeader(c, key)}
    ${sub ? `<div class="cx-pagesub">${sub}</div>` : ''}
    ${body}
  </div>`;
}

/* ---------------------------- Schedule ---------------------------- */
function renderSchedule(cid, tab) {
  const c = COMP_BY_ID[cid];
  const done = c.games.filter(g => g.st === 'COMPLETE').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const up = c.games.filter(isUpcoming).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const dead = c.games.filter(g => g.st === 'NOT_PLAYED');
  const list = tab === 'upcoming' ? up : done;
  // Results opens first, and a game being played is not a result yet: without this it
  // would sit only under Upcoming, reading as a fixture, while the bar above says LIVE
  return page(c, 'Games', `
    ${tab !== 'upcoming' ? `<div id="sched-live" data-cid="${cid}">${schedLiveInner(cid)}</div>` : ''}
    <div class="card">
      <div class="card-head">${tab === 'upcoming' ? 'Upcoming fixtures' : 'Results'}<span class="hint">${list.length} game${list.length === 1 ? '' : 's'}</span>
        <span class="cx-right seg"><a class="seg-btn ${tab !== 'upcoming' ? 'seg-on' : ''}" href="#/c/${cid}/schedule/results">Results ${done.length}</a><a class="seg-btn ${tab === 'upcoming' ? 'seg-on' : ''}" href="#/c/${cid}/schedule/upcoming">Upcoming ${up.length}</a></span></div>
      ${list.length ? list.map(g => gameRow(cid, g)).join('')
      : `<div class="empty-row"><span class="empty-dot"></span>${tab === 'upcoming' ? 'No fixtures remain — every game in this competition has been played.' : 'No completed games published yet.'}</div>`}
      ${tab !== 'upcoming' ? `<div class="note">Games with a published box score are clickable. ${done.filter(g => g.box).length} of ${done.length} completed games have per-player detail on the source.</div>` : ''}
    </div>
    ${tab !== 'upcoming' && dead.length ? `<div class="card">
      <div class="card-head">Not played <span class="hint">${dead.length} fixture${dead.length === 1 ? '' : 's'}</span></div>
      ${dead.map(g => gameRow(cid, g)).join('')}
      <div class="note">Fixtures the source still lists but never finished. They are not counted as games of the competition, which is why it shows as completed.</div>
    </div>` : ''}`);
}

/* ---------------------------- Teams ---------------------------- */
function renderTeams(cid) {
  const c = COMP_BY_ID[cid];
  // a team's line summed across every group it played in
  const standByName = standTotals(c);
  const rows = c.teams.map(tid => ({ tid: tid, name: TEAMS[tid] || tid, s: standByName[TEAMS[tid]] }))
    .sort((a, b) => (a.s ? a.s.pos : 99) - (b.s ? b.s.pos : 99) || a.name.localeCompare(b.name));
  return page(c, 'Teams', `
    <div class="team-grid">
      ${rows.map(r => {
        const roster = (c.roster[r.tid] || []).length;
        return `<div class="team-card" onclick="location.hash='#/c/${cid}/team/${r.tid}'">
          <div class="team-card-head">${crest(r.name, 44)}
            <div><div class="team-card-name">${esc(r.name)}</div>
              <div class="team-card-rank">${r.s ? ordinal(r.s.pos) + ' · ' + r.s.w + '–' + r.s.l : 'No standings row'}</div></div>
          </div>
          <div class="team-card-stats">
            <div><b>${roster || '—'}</b> Players</div>
            <div><b>${r.s ? fmt0(r.s.gp) : '—'}</b> Games</div>
            <div style="margin-left:auto;"><b>${r.s ? fmtPM(r.s.gd) : '—'}</b> Diff</div>
          </div>
        </div>`;
      }).join('')}
    </div>`);
}
function ordinal(n) {
  if (!has(n)) return '—';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---------------------------- Team profile ---------------------------- */
function renderTeam(cid, tid, tab) {
  const c = COMP_BY_ID[cid];
  const name = TEAMS[tid] || tid;
  const roster = c.roster[tid] || [];
  const s = standTotals(c)[name];
  const games = c.games.filter(g => g.h === name || g.a === name);
  const statByPid = {}; c.players.forEach(p => { statByPid[p.pid] = p; });
  const rosterPids = new Set(roster.map(r => r.pid));
  // players credited to this team by their own stat line, even if absent from the roster page
  c.players.forEach(p => { if (p.team === name) rosterPids.add(p.pid); });
  const alsoIn = (TEAM_COMPS[tid] || []).filter(x => x !== cid);

  const tabs = [['roster', 'Roster'], ['results', 'Results']];
  const body = tab === 'results' ? teamResults(cid, name, games) : teamRoster(cid, [...rosterPids], roster, statByPid);
  return `<div class="page">
    <div class="crumb"><a href="#/c/${cid}/teams">Teams</a> / ${esc(name)}</div>
    <div class="header">
      ${crest(name, 72)}
      <div><div class="h-name">${esc(name)}</div>
        <div class="h-meta"><a href="#/c/${cid}">${esc(c.label || c.name)}</a>
          ${s ? `<span class="rank-pill">${ordinal(s.pos)} · ${s.w}–${s.l}</span>` : ''}
          <span>${rosterPids.size} players</span><span>${games.length} games</span></div>
      </div>
    </div>
    ${alsoIn.length ? `<div class="card" style="margin-bottom:16px;"><div class="note" style="border-top:none;">This club also appears in ${alsoIn.length} other competition${alsoIn.length === 1 ? '' : 's'} in this database: ${alsoIn.slice(0, 8).map(x => `<a href="#/c/${x}/team/${tid}">${esc(COMP_BY_ID[x].name)}</a>`).join(' · ')}${alsoIn.length > 8 ? ' …' : ''}</div></div>` : ''}
    <div class="toolbar"><div class="tabbar">
      ${tabs.map(([k, l]) => `<a href="#/c/${cid}/team/${tid}/${k}" class="tab ${tab === k ? 'tab-active' : ''}">${l}</a>`).join('')}
    </div></div>
    ${body}
  </div>`;
}

function teamRoster(cid, pids, roster, statByPid) {
  const bioByPid = {}; roster.forEach(r => { bioByPid[r.pid] = r; });
  const rows = pids.map(pid => ({ pid: pid, b: bioByPid[pid] || {}, p: statByPid[pid] || {} }))
    .sort((a, b) => (Number(a.b.num) || 999) - (Number(b.b.num) || 999) || personName(a.pid).localeCompare(personName(b.pid)));
  const anyStats = rows.some(r => hasStats(r.p));
  return `<div class="card">
    <div class="table-scroll"><table>
      <thead><tr><th class="left nosort">Player</th><th class="nosort"${gloss('#')}>#</th><th class="nosort"${gloss('Pos')}>Pos</th><th class="nosort"${gloss('Ht')}>Ht</th><th class="nosort"${gloss('Wt')}>Wt</th><th class="nosort">Age</th><th class="nosort"${gloss('Nat')}>Nat</th>
      ${anyStats ? `<th class="nosort"${gloss('G')}>G</th><th class="nosort"${gloss('PTS')}>PTS</th><th class="nosort"${gloss('PPG')}>PPG</th><th class="nosort"${gloss('RPG')}>RPG</th><th class="nosort" style="padding-right:20px;"${gloss('APG')}>APG</th>` : '<th class="nosort" style="padding-right:20px;"></th>'}</tr></thead>
      <tbody>${rows.map(r => {
        const p = r.p, b = r.b;
        return `<tr class="clickable" onclick="location.hash='#/p/${r.pid}'" style="cursor:pointer;">
          <td class="left"><div class="player-cell"><div class="avatar">${initials(personName(r.pid))}</div><div class="p-name">${esc(personName(r.pid))}</div></div></td>
          <td>${has(b.num) ? esc(b.num) : '—'}</td><td>${esc(b.pos || '—')}</td>
          <td>${has(b.ht) ? b.ht + ' cm' : '—'}</td><td>${has(b.wt) ? b.wt + ' kg' : '—'}</td>
          <td>${has(b.age) ? b.age : '—'}</td><td>${esc(b.nat || '—')}</td>
          ${anyStats ? `<td>${fmt0(p.g)}</td><td class="lead">${fmt0(p.pts)}</td><td>${fmt1(pg(p.pts, p.g))}</td><td>${fmt1(pg(p.reb, p.g))}</td><td style="padding-right:20px;">${fmt1(pg(p.ast, p.g))}</td>` : '<td style="padding-right:20px;"></td>'}
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="note">Bio columns come from the competition's published team roster page; blanks mean the source doesn't publish that field for this player. ${anyStats ? 'Per-game figures are computed from the player\'s own published season totals.' : 'No per-player statistics are published for this team in this competition yet.'}</div>
  </div>`;
}

function teamResults(cid, name, games) {
  const done = games.filter(g => g.st === 'COMPLETE').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const up = games.filter(isUpcoming);
  return `<div class="card">
    <div class="card-head">Results</div>
    ${done.length ? done.map(g => {
      const home = g.h === name, own = home ? g.hs : g.as, opp = home ? g.as : g.hs;
      const win = own > opp;
      return `<div class="row ${g.box ? 'clickable' : ''}" ${g.box ? `onclick="location.hash='#/c/${cid}/box/${g.mid}'"` : ''}>
        <div class="r-date"><div class="d1">${fmtDateShort(g.date)}</div><div>${g.date ? g.date.slice(0, 4) : ''}</div></div>
        <div class="team">${crest(home ? g.a : g.h)}<span class="name">${home ? '' : '@ '}${esc(home ? g.a : g.h)}</span></div>
        <div class="team"><span class="name ${win ? 'win-txt' : 'loss-txt'}">${win ? 'W' : 'L'} ${fmt0(own)}–${fmt0(opp)}</span></div>
        <div class="venue">${esc(g.venue || '')}${g.box ? '<span class="box-link">Box score →</span>' : ''}</div>
      </div>`;
    }).join('') : `<div class="empty-row"><span class="empty-dot"></span>No completed games.</div>`}
    ${up.length ? `<div class="card-head" style="border-top:1px solid var(--border);">Upcoming</div>${up.map(g => gameRow(cid, g)).join('')}` : ''}
  </div>`;
}
