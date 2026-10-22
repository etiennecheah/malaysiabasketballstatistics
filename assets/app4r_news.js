/* ---------------------------- Signings ----------------------------
   Player moves: signings, transfers, departures. The items are hand-kept in data/news.json
   (DB.news, newest first); nothing here comes from the source. The site no longer has a News
   page: the items only say where a player is now, before a game is played for the new club.
   newsTeam(pid) gives that newest team for the player card and the profile header, until the
   database has later games for him; newsMoves(pid) adds a signing abroad to the career path. */
const NEWS = DB.news || [];

/* Where the news says a player is now: { team, league, date, left }.
   Read oldest to newest: a signing or transfer puts him at the new team; a departure leaves
   him without one. Null when there is no news about him, or the database has caught up. */
let NEWS_TEAM = null;
function newsTeam(pid) {
  if (!NEWS_TEAM) {
    NEWS_TEAM = {};
    NEWS.slice().reverse().forEach(n => {
      if (!n.pid) return;
      if ((n.type === 'signing' || n.type === 'transfer') && n.to) NEWS_TEAM[n.pid] = { team: n.to, league: n.league || '', date: n.date, left: '' };
      else if (n.type === 'departure' || n.type === 'retirement') NEWS_TEAM[n.pid] = { team: '', league: '', date: n.date, left: n.from || '' };
    });
    // the database wins once it has him at a club in a competition that began after the item
    // (a state side does not count: a player signs for a club and still plays for his state)
    Object.keys(NEWS_TEAM).forEach(pid => {
      const later = (CAREER[pid] || []).some(x => x.p.team && !stateSlug(x.p.team) && (x.c.start || '') > NEWS_TEAM[pid].date);
      if (later) delete NEWS_TEAM[pid];
    });
  }
  return NEWS_TEAM[pid] || null;
}
/* a signing outside Malaysia is also a step on the career path (profile): { year, team, league } */
function newsMoves(pid) {
  return NEWS.filter(n => n.pid === pid && n.league && n.to && (n.type === 'signing' || n.type === 'transfer'))
    .map(n => ({ year: +n.date.slice(0, 4), team: n.to, league: n.league }));
}
