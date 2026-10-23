/* =========================================================================
   Page titles, descriptions and structured data, one function for every
   address. The build calls hsMeta() for each page it writes (prerender.js),
   and the app calls hsApplyMeta() after every move, so the tab title and the
   page's description always match what is on screen.
   ========================================================================= */
function hsMetaClip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/[\s,;·–—-]+\S*$/, '') + '…' : s;
}
function hsMetaNum(x) { return x === null || x === undefined || x === '' || isNaN(+x) ? null : +x; }
function hsMetaDate(g) {
  return g && g.date ? fmtDate(g.date) : '';
}
function hsMetaYears(c) {
  if (c.start && c.end && c.start.slice(0, 4) !== c.end.slice(0, 4)) return c.start.slice(0, 4) + '–' + c.end.slice(0, 4);
  return c.year ? String(c.year) : '';
}

/* hash: a route string ("#/p/123"). Returns {title, desc, ld (array), index (false = keep out of search)} */
function hsMeta(hash) {
  const SITE_NAME = 'HoopStatsMY';
  const parts = String(hash || '#/').replace(/^#/, '').split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
  const nComps = COMPS.length, nPlayers = Object.keys(PERSONS).length;
  const home = {
    title: SITE_NAME + ' — Malaysia Basketball Database',
    desc: 'Stats for Malaysian basketball: ' + nComps + ' competitions and ' + nPlayers.toLocaleString('en') +
      ' players — MBL, D-League, Agong Cup, national youth championships and FIBA youth events. Box scores, standings, leaders, career stats and honours.',
    ld: [], index: true,
  };
  const page = (title, desc, extra) => Object.assign({ title: title + ' | ' + SITE_NAME, desc: hsMetaClip(desc, 300), ld: [], index: true }, extra || {});
  const p0 = parts[0];
  if (!p0 || p0 === 'home') return home;

  if (p0 === 'p' && parts[1]) {
    const pid = PALIAS[parts[1]] || parts[1];
    if (!PERSONS[pid]) return page('Player not found', home.desc, { index: false });
    const name = personName(pid);
    const rows = (CAREER[pid] || []).filter(r => hasStats(r.p)).slice()
      .sort((a, b) => (b.c.end || b.c.start || String(b.c.year || '')).localeCompare(a.c.end || a.c.start || String(a.c.year || '')));
    const last = rows[0];
    const years = rows.map(r => r.c.year).filter(Boolean);
    const span = years.length ? (Math.min(...years) === Math.max(...years) ? String(years[0]) : Math.min(...years) + '–' + Math.max(...years)) : '';
    const team = last ? (last.p.team || '') : '';
    let line = '';
    if (last) {
      const g = hsMetaNum(last.p.g);
      const per = k => { const v = hsMetaNum(last.p[k]); return g && v !== null ? (v / g).toFixed(1) : null; };
      const bits = [['pts', 'PPG'], ['reb', 'RPG'], ['ast', 'APG']].map(([k, l]) => per(k) !== null ? per(k) + ' ' + l : null).filter(Boolean);
      if (bits.length) line = ' Latest: ' + bits.join(', ') + ' in ' + ((last.c.label || last.c.name) + (last.c.year && !String(last.c.label || last.c.name).includes(String(last.c.year)) ? ' ' + last.c.year : '')) + '.';
    }
    const hon = (DB.honours || {})[pid] || [];
    const nAw = hon.reduce((a, h) => a + (h.awards || []).filter(x => !/medal/i.test(x)).length, 0);
    const nTi = hon.filter(h => h.champ).length;
    const honTxt = nTi || nAw ? ' ' + [nTi ? nTi + ' title' + (nTi > 1 ? 's' : '') : '', nAw ? nAw + ' award' + (nAw > 1 ? 's' : '') : ''].filter(Boolean).join(', ') + '.' : '';
    const desc = name + (team ? ' (' + team + ')' : '') + ' — Malaysian basketball career stats' +
      (rows.length ? ': ' + rows.length + ' competition' + (rows.length > 1 ? 's' : '') + (span ? ', ' + span : '') + '.' : '.') +
      line + honTxt + ' Game logs, splits and advanced stats.';
    return page(name + ' — Stats & Career', desc, {
      ld: [{ '@context': 'https://schema.org', '@type': 'Person', name, ...(team ? { affiliation: { '@type': 'SportsTeam', name: team } } : {}) }],
    });
  }

  if (p0 === 'c' && parts[1]) {
    const c = COMP_BY_ID[parts[1]];
    if (!c) return page('Competition not found', home.desc, { index: false });
    const label = c.label || c.name;
    const yrs = hsMetaYears(c);
    const when = c.start ? fmtDate(c.start) + (c.end && c.end !== c.start ? ' – ' + fmtDate(c.end) : '') : yrs;
    const champ = c.champ ? ' Champion: ' + c.champ + '.' : '';
    const sub = parts[2] || '';
    if (sub === 'shots' && parts[3]) {
      const g = GAME_BY_MID[parts[3]];
      if (!g || g.cid !== c.id) return page('Shot chart', label, { index: false });
      const sc = (g.hs !== undefined && g.hs !== null && g.hs !== '') ? ' ' + g.hs + '–' + g.as + ' ' : ' v ';
      return page(g.h + sc + g.a + ' — Shot Chart', 'Every shot of ' + g.h + sc + g.a + ', ' + label + (g.date ? ', ' + hsMetaDate(g) : '') +
        ': 3D shot terrain, zones and every attempt, for each team and each player, against the event average.', { index: false });
    }
    if (sub === 'box' && parts[3]) {
      const g = GAME_BY_MID[parts[3]];
      if (!g || g.cid !== c.id) return page('Box score', label, { index: false });
      const sc = (g.hs !== undefined && g.hs !== null && g.hs !== '') ? ' ' + g.hs + '–' + g.as + ' ' : ' v ';
      const title = g.h + sc + g.a + ' — Box Score';
      const desc = g.h + sc + g.a + ', ' + label + (g.date ? ', ' + hsMetaDate(g) : '') + (g.venue ? ' at ' + g.venue : '') +
        '. Full box score: points, rebounds, assists, shooting and plus-minus for every player.';
      const ev = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: g.h + ' v ' + g.a, sport: 'Basketball',
        homeTeam: { '@type': 'SportsTeam', name: g.h }, awayTeam: { '@type': 'SportsTeam', name: g.a },
        superEvent: { '@type': 'SportsEvent', name: label } };
      if (g.date) ev.startDate = g.date;
      if (g.venue) ev.location = { '@type': 'Place', name: g.venue };
      return page(title, desc, { ld: [ev] });
    }
    if (sub === 'team' && parts[2 + 1]) {
      const tn = teamName(parts[3]) || 'Team';
      return page(tn + ' — ' + label, tn + ' in ' + label + ': roster, results and player stats.', {});
    }
    const tabs = { standings: 'Standings', schedule: 'Schedule & Results', teams: 'Teams', players: 'Player Stats', leaders: 'Leaders' };
    if (tabs[sub]) {
      return page(label + ' — ' + tabs[sub], label + (when ? ' (' + when + ')' : '') + ': ' + tabs[sub].toLowerCase() + '.' + champ +
        ' ' + c.nTeams + ' teams, ' + c.nGames + ' games.', {});
    }
    if (sub) return page(label, label, { index: false });
    const desc = label + (when ? ', ' + when : '') + ': ' + c.nTeams + ' teams, ' + c.nGames + ' games.' + champ +
      ' Standings, results, box scores, player stats and leaders.';
    return page(label + ' — Standings, Results & Stats', desc, {
      ld: [Object.assign({ '@context': 'https://schema.org', '@type': 'SportsEvent', name: label, sport: 'Basketball' },
        c.start ? { startDate: c.start } : {}, c.end ? { endDate: c.end } : {})],
    });
  }

  if (p0 === 't' && parts[1]) {
    const t = typeof teamBySlug === 'function' ? teamBySlug(parts[1]) : null;
    if (!t) return page('Team not found', home.desc, { index: false });
    const n = t.apps ? t.apps.length : 0;
    const span = t.firstYear ? (t.firstYear === t.lastYear ? ' in ' + t.firstYear : ', ' + t.firstYear + '–' + t.lastYear) : '';
    return page(t.name + ' — Team History & Stats', t.name + ': ' + n + ' competition' + (n === 1 ? '' : 's') + span +
      ' in Malaysian basketball. Every season, result and roster on ' + SITE_NAME + '.', {
      ld: [{ '@context': 'https://schema.org', '@type': 'SportsTeam', name: t.name, sport: 'Basketball' }],
    });
  }
  if (p0 === 'cf' && parts[1]) {
    const f = typeof CF_META !== 'undefined' ? CF_META[parts[1]] : null;
    if (!f) return page('Competition history', home.desc, { index: false });
    const n = f.name;
    return page(n, n + ': every edition in the database, with champions and records.', {});
  }
  const S = {
    players: ['Players', 'Search ' + nPlayers.toLocaleString('en') + ' Malaysian basketball players: career totals across every competition, filtered by level and year.'],
    competitions: ['Competitions', 'All ' + nComps + ' Malaysian basketball competitions in the database: MBL, D-League, Agong Cup, national youth championships, schools and FIBA youth events.'],
    teams: ['Teams', 'Every Malaysian basketball team and state side in the database, with their competitions, titles and rosters.'],
    milestones: ['MBL Milestones', 'Milestones of Malaysian players in the MBL: career and team totals every 50 points, rebounds, assists, steals, blocks and games, who is next, and single-game feats.'],
    records: ['Records & Honours', 'Records and honours in Malaysian basketball: champions and individual awards, single-game, tournament and career records, youngest and oldest players and the 180 Club, for U15, U17, U20, U23, the MBL and the Agong Cup.'],
    formulas: ['Formulas', 'How every statistic on ' + SITE_NAME + ' is calculated: shooting percentages, PER, usage, Win Shares and BPM.'],
    stats: ['Tools · Lineups and Clutch', 'Lineup and clutch statistics for Malaysian basketball competitions.'],
    privacy: ['Privacy & Site Rules', 'How ' + SITE_NAME + ' handles accounts, player profile claims and personal data, and the rules for using the site.'],
    compare: ['Compare Players', 'Compare two Malaysian basketball players side by side: career stats, peak seasons and head-to-head games.'],
  };
  if (S[p0]) return page(S[p0][0], S[p0][1], { index: p0 !== 'compare' || parts.length === 1 });
  return page('Malaysia Basketball Database', home.desc, { index: false });
}

/* the app moved: keep the tab title and the description in step */
function hsApplyMeta(hash) {
  let m;
  try { m = hsMeta(hash); } catch (e) { return; }
  document.title = m.title;
  const d = document.querySelector('meta[name="description"]');
  if (d) d.setAttribute('content', m.desc);
}
