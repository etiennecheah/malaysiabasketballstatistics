/* =========================================================================
   Scout room and Scouting reports (2026-11).

   Both pages are assets/scout.html — the film-tagging tool — run in a frame of
   this app. The frame reads what it needs straight from here: DB (games,
   streams, portraits), getBox() for the rosters with shirt numbers,
   teamLogo / teamColor / teamCode / personName, and accB() for Firebase.

   - #/scout[/<mid>]      the tool, full window. The admin's "Save to HoopStatsMY"
                          writes scout/<mid> and the game's line in scoutIndex/all.
   - #/scouting[/<mid>]   the read-only reports: every scouted game added together
                          for one team, or one game. The frame grows to its
                          content, so the page scrolls like any other.

   Both are for the admin only (2026-11-05): the Tools menu lists them, and a game
   page links to them, only when the admin is signed in; anyone else who opens the
   address gets the sign-in / admin-only page. The Firestore rules enforce the same
   thing (scout/{mid} and scoutIndex/{id}: read and write by the admin only), so the
   data is not reachable around the page either (see claude/scout-room.md).
   ========================================================================= */
function scoutBase() {
  const m = document.querySelector('meta[name="hs-base"]');
  return (m && m.getAttribute('content')) || './';
}
function scoutSrc(view, mid) {
  const q = [];
  if (view) q.push('view=1');
  if (mid) q.push('mid=' + encodeURIComponent(mid));
  return scoutBase() + 'scout.html' + (q.length ? '?' + q.join('&') : '');
}
// a redraw of the same address (signing in, the ratings file arriving) must not reload the frame:
// the tool holds the film and the clip being trimmed in memory
function scoutFrameKept(src) {
  const f = document.querySelector('iframe.sc-frame');
  return !!f && f.getAttribute('src') === src;
}
// accB is a const in app4p_account.js, which a frame cannot reach as parent.accB; this declaration can
function scoutBackend() {
  return typeof accB === 'function' ? accB() : null;
}
function renderScoutRoom(mid) {
  return `<div class="sc-full"><iframe class="sc-frame" src="${esc(scoutSrc(false, mid))}" title="Scout room" allow="fullscreen; clipboard-write"></iframe></div>`;
}
function renderScouting(mid) {
  return `<div class="sc-view"><iframe class="sc-frame sc-auto" src="${esc(scoutSrc(true, mid))}" title="Scouting reports" allow="fullscreen; clipboard-write"></iframe></div>`;
}

/* ---- admin only ---------------------------------------------------------- */
function scoutAdmin() {
  return typeof ACC !== 'undefined' && ACC.on && ACC.state === 'in' && !!ACC.admin;
}
// what a visitor who is not the signed-in admin sees at #/scout or #/scouting
function scoutGate(title) {
  if (typeof ACC === 'undefined' || !ACC.on) return accGate(title, 'This page is for the HoopStatsMY admin and works on the live site only.');
  if (ACC.state === 'loading' || (ACC.state === 'out' && accFlag())) return accGate(title, 'Checking your account…');
  if (ACC.state !== 'in') return accGate(title, 'This page is for the HoopStatsMY admin only. Sign in with the admin account to open it.', `<button type="button" class="acc-btn big" data-acc="signin">Sign in</button>`);
  return accGate(title, 'This page is for the HoopStatsMY admin only.');
}
// the two entries at the foot of the Tools menu
function scoutMenu(cur) {
  if (!scoutAdmin()) return '';
  return `<span class="st-menu-sep" role="separator"></span>
      <a href="#/scouting"${cur === 'scouting' ? ' aria-current="page"' : ''}>Scouting reports<small>Admin · plays, shot types and shot maps tagged from game film</small></a>
      <a href="#/scout">Scout room<small>Admin · cut a game's film into plays and chart its shots</small></a>`;
}
// a game page: "Scout this game", and "Scouting report" once the game has been saved
let SCOUT_IDX = null, SCOUT_IDX_ASKED = false;
function scoutLoadIndex() {
  if (SCOUT_IDX_ASKED || !scoutAdmin()) return;
  SCOUT_IDX_ASKED = true;
  accB().get('scoutIndex', 'all').then(d => {
    SCOUT_IDX = (d && d.games) || {};
    if (/^#\/c\/[^/]+\/box\//.test(HS.hash()) && typeof softRoute === 'function') softRoute();
  }, () => { SCOUT_IDX = {}; });
}
function scoutGameLinks(mid, g) {
  if (!scoutAdmin() || !g || g.st !== 'COMPLETE' || !g.box) return '';
  scoutLoadIndex();
  const ic = '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v2H4zm0 6h10v2H4zm0 6h16v2H4z" fill="currentColor"/></svg>';
  return (SCOUT_IDX && SCOUT_IDX[mid] ? `<a class="m-watch" href="#/scouting/${esc(mid)}">${ic}Scouting report</a>` : '')
    + `<a class="m-watch" href="#/scout/${esc(mid)}">${ic}Scout this game</a>`;
}
