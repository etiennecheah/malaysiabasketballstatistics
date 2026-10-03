/* ---------------------------- News ----------------------------
   Player news: signings, transfers, departures, injuries. The items are hand-kept in
   data/news.json (DB.news, newest first); nothing here comes from the source.

   A signing or a transfer also says where the player is now, so it is the one place the
   site learns a move before a game is played: newsTeam(pid) gives that newest team, and
   the player card (Players, and beside each item here) and the profile header show it
   until the database has later games for him. */
const NEWS = DB.news || [];
const NEWS_TYPES = {
  signing: ['Signing', 'Signings'], transfer: ['Transfer', 'Transfers'], departure: ['Departure', 'Departures'],
  injury: ['Injury', 'Injuries'], return: ['Return', 'Returns'], retirement: ['Retirement', 'Retirements'],
  national: ['National team', 'National team'], other: ['News', 'Other'],
};
const NEWS_STATE = { type: '' };
const NEWS_MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function newsDate(iso) { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + NEWS_MON[m - 1].slice(0, 3) + ' ' + y; }

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
/* "Signed 22 Sep 2026" / "Left NS Matrix Deers" for the chip on a player card */
function newsTeamChip(pid) {
  const t = newsTeam(pid);
  if (!t) return '';
  return t.team ? 'Signed ' + newsDate(t.date) : 'Left ' + (t.left || 'his club') + ' · ' + newsDate(t.date);
}
/* a signing outside Malaysia is also a step on the career path (profile): { year, team, league } */
function newsMoves(pid) {
  return NEWS.filter(n => n.pid === pid && n.league && n.to && (n.type === 'signing' || n.type === 'transfer'))
    .map(n => ({ year: +n.date.slice(0, 4), team: n.to, league: n.league }));
}

function newsTeamHtml(name, league) {
  const t = typeof teamBySlug === 'function' ? teamBySlug(teamKey(name)) : null;
  const label = esc(name) + (league ? ` <span class="nw-league">${esc(league)}</span>` : '');
  return `<span class="nw-team">${crest(name, 22)}${t ? `<a href="#/t/${encodeURIComponent(t.slug)}">${label}</a>` : `<span>${label}</span>`}</span>`;
}
/* the item's text, with the player's name linked to his profile */
function newsText(n) {
  const text = esc(n.text);
  if (!n.pid || !n.name) return text;
  const name = esc(n.name), i = text.toLowerCase().indexOf(name.toLowerCase());
  if (i < 0) return text;
  return text.slice(0, i) + `<a href="#/p/${n.pid}">${text.slice(i, i + name.length)}</a>` + text.slice(i + name.length);
}
function newsItem(n) {
  const [, m, d] = n.date.split('-').map(Number);
  const T = NEWS_TYPES[n.type] || NEWS_TYPES.other;
  const move = n.from && n.to ? `${newsTeamHtml(n.from)}<span class="nw-arrow" aria-hidden="true">→</span>${newsTeamHtml(n.to, n.league)}`
    : n.to ? `<span class="nw-verb">Joins</span>${newsTeamHtml(n.to, n.league)}`
    : n.from ? `<span class="nw-verb">Leaves</span>${newsTeamHtml(n.from)}` : '';
  const card = n.pid && PERSONS[n.pid]
    ? playerCard({ pid: n.pid, name: personName(n.pid), nComps: (CAREER[n.pid] || []).filter(x => hasStats(x.p)).length })
    : '';
  return `<article class="nw-item${card ? '' : ' nw-solo'}">
    <div class="nw-when" aria-hidden="true"><b>${d}</b><span>${NEWS_MON[m - 1].slice(0, 3)}</span></div>
    <div class="nw-card">
      <div class="nw-top"><span class="nw-tag nw-t-${n.type}">${esc(T[0])}</span><time datetime="${n.date}">${newsDate(n.date)}</time></div>
      <h3 class="nw-head">${newsText(n)}</h3>
      ${move ? `<div class="nw-move">${move}</div>` : ''}
      ${n.note ? `<p class="nw-note">${esc(n.note)}</p>` : ''}
      ${n.link ? `<a class="nw-src" href="${esc(n.link)}" target="_blank" rel="noopener">Source ↗</a>` : ''}
    </div>
    ${card}
  </article>`;
}
function renderNews() {
  const counts = {};
  NEWS.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
  const types = Object.keys(NEWS_TYPES).filter(k => counts[k]);
  if (NEWS_STATE.type && !counts[NEWS_STATE.type]) NEWS_STATE.type = '';
  const list = NEWS.filter(n => !NEWS_STATE.type || n.type === NEWS_STATE.type);
  // newest first, under a heading per month
  const months = [];
  list.forEach(n => {
    const k = n.date.slice(0, 7);
    let g = months[months.length - 1];
    if (!g || g.k !== k) months.push(g = { k, items: [] });
    g.items.push(n);
  });
  const players = new Set(NEWS.filter(n => n.pid).map(n => n.pid)).size;
  const seg = types.length > 1 ? `<span class="seg nw-seg">
      <button class="seg-btn ${NEWS_STATE.type === '' ? 'seg-on' : ''}" data-nwtype="">All</button>
      ${types.map(k => `<button class="seg-btn ${NEWS_STATE.type === k ? 'seg-on' : ''}" data-nwtype="${k}">${esc(NEWS_TYPES[k][1])} <i>${counts[k]}</i></button>`).join('')}
    </span>` : '';
  return `<div class="page nw-page">
    <div class="dir-hero">
      <div class="bloom"><i class="b1"></i><i class="b2"></i></div>
      <div class="grain"></div>
      <div class="dir-hero-in">
        <h1 class="dir-hero-title">News</h1>
        <p class="dir-hero-sub">Who signed where, who left, who is out. Each item sits beside the player's card, and the card shows the team he is with now.</p>
      </div>
    </div>
    <div class="dir-bar">
      <div><span class="dir-count">${NEWS.length}</span> <span class="dir-count-l">item${NEWS.length === 1 ? '' : 's'} · ${players} player${players === 1 ? '' : 's'}${NEWS.length ? ' · latest ' + newsDate(NEWS[0].date) : ''}</span></div>
      ${seg}
    </div>
    ${months.length ? months.map(g => `<section class="nw-month">
      <h2 class="nw-month-h">${NEWS_MON[+g.k.slice(5) - 1]} ${g.k.slice(0, 4)}<span>${g.items.length} item${g.items.length === 1 ? '' : 's'}</span></h2>
      <div class="nw-feed">${g.items.map(newsItem).join('')}</div>
    </section>`).join('') : `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No news has been added yet.</div></div>`}
  </div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-nwtype]');
  if (!b) return;
  NEWS_STATE.type = b.dataset.nwtype;
  softRoute();
});
