/* =========================================================================
   Fixtures and the live layer. The Games page was removed in update-51: the games
   box at the top of Home (app4o_home.js) lists upcoming games and results now.
   What stays is the one helper every fixture list uses.
   ========================================================================= */

/* What the live layer knows about a fixture the snapshot still lists as unplayed:
   {state: 'live' | 'final', d: the feed} once the relay has answered, {state: 'soon'}
   while the game is inside its tip-off window with nothing from the feed yet, or null.
   Every fixture list uses this (the Games cards here, the schedule rows of a competition),
   so a game that is being played never reads as "not played yet". */
function fixtureLive(g) {
  if (typeof LIVE === 'undefined' || !g || g.st === 'COMPLETE' || g.st === 'NOT_PLAYED') return null;
  const x = LIVE.games[g.mid];
  if (!x) return null;
  if (x.data && (x.state === 'live' || x.state === 'final')) return { state: x.state, d: x.data, at: x.at };
  return { state: 'soon', started: liveNow() >= (liveStart(g) || Infinity) };
}
