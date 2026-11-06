/* =========================================================================
   Companion — /watch/<mid>/ for MBL men's games from the 2025-26 season on.

   From that season MBL's video is on its own subscription platform
   (majorleague.com.my and the MBL apps). It can't be embedded here, so for
   these games the Watch page has no video: fans watch on MBL and keep this
   screen beside it. Every other game keeps the Watch page (app4s_watch.js).

     ┌───────────────────────── scoreboard ─────────────────────────┐
     ├──────────────────── game flow  (lower third) ────────────────┤
     ├── Box score | Advanced | Shot chart ─────────────┬ team stats┤
     │                                                  │ play-by-  │
     └──────────────────────────────────────────────────┴ play ─────┘

   Look (v3, Nov 2026): black ground, hairlines instead of filled panels, square
   edges; team colours only as accents; orange (#FF6B1A) only for "now" — the
   live dot, the playhead, the latest shot; gold for a followed player.

   Data: the live relay (app4n_live.js) while the game is on, and once more
   after the buzzer (the relay still serves a finished game). Everything on
   the screen — runs, game flow, timeouts, lineups, on/off — is worked out here
   from the relay's players and its full list of plays (relay v2). If the relay
   has nothing, a finished game falls back to its saved box score.

   Two things decide what is drawn and when:
   - Delay: every relay answer is kept with the time it arrived, and the screen
     shows the newest one that is at least "delay" seconds old, so the numbers
     land with the MBL stream instead of before it.
   - Play-out: when an answer brings several new plays, they are played one at
     a time (CPN_STEP apart), so the score, the moment card and the feed move
     with the game rather than jumping. More than CPN_BURST at once (the first
     load, a tab that was asleep) are drawn straight away.
   ========================================================================= */

let CPN_FROM = '2025-06-01';          // MBL games on or after this date use the companion
const CPN_SERIES = 'Major Basketball League';
const CPN_STEP = 1700, CPN_BURST = 12;
const CPN_MBL_URL = 'https://www.majorleague.com.my/';

function isCompanionGame(g) {
  const c = g && COMP_BY_ID[g.cid];
  return !!c && c.series === CPN_SERIES && c.gender !== 'Women' && String(g.date || '') >= CPN_FROM;
}

function cpnLs(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch (e) { return null; }
  return null;
}

const CPN = {
  mid: null, snaps: [], cur: null, shown: 0, target: 0, lastStep: 0, timer: null, fetchedFinal: false,
  view: 'box', lteam: 0, sel: null, sortBy: null, filter: 'all', away: false, seen: 0, hov: null,
  follow: cpnLs('hs-cpn-follow') || null, delay: +(cpnLs('hs-cpn-delay') || 0) || 0,
  prevStats: {}, prevScore: null, prevPlays: 0, colors: {},
};

/* ---------------------------- small helpers ---------------------------- */
function cpnSecs(clock) { const m = String(clock || '').match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : 0; }
/* seconds since tip-off for a play (or the game clock): 10-minute quarters, 5-minute overtimes */
function cpnT(p) {
  const per = +p.period || 1, ot = /OVERTIME/i.test(p.periodType || '') || per > 4, rem = cpnSecs(p.clock);
  if (!ot) return (per - 1) * 600 + 600 - rem;
  const n = per > 4 ? per - 4 : per;
  return 2400 + (n - 1) * 300 + 300 - rem;
}
function cpnPer(p) { return livePeriod(p); }
function cpnClock(p) { return String(p.clock || '').replace(/^0(\d:)/, '$1').replace(/^(\d+:\d\d):\d\d$/, '$1'); }
function cpnFace(pid) { return pid && ((DB.avatars || {})[pid] || PHOTOS[pid]) || ''; }
function cpnInit(name) { return initials(watchShort(name).replace(/\./g, ' ')); }
function cpnSgn(v) { return (v > 0 ? '+' : '') + v; }
function cpnMmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

/* A team's colour, taken from its own logo (the most common strong colour), lightened so it
   reads on black. Cached per team; the site's generated colour until the logo has been read. */
function cpnColor(name) {
  if (CPN.colors[name]) return CPN.colors[name];
  const cached = cpnLs('hs-cpn-col2:' + name);
  if (cached) return (CPN.colors[name] = cached);
  const src = teamLogo(name);
  CPN.colors[name] = teamColor(name);
  if (src) {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
        const px = x.getImageData(0, 0, 32, 32).data, bins = {};
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 200) continue;
          const [h, s, l] = cpnHsl(px[i], px[i + 1], px[i + 2]);
          if (s < .35 || l < .18 || l > .85) continue;
          const b = Math.round(h / 30) % 12;
          (bins[b] = bins[b] || []).push([h, s, l]);
        }
        const best = Object.values(bins).sort((a, b) => b.length - a.length)[0];
        if (!best || best.length < 12) return;
        // a circular mean: reds sit either side of 0°/360°
        const sx = best.reduce((a, v) => a + Math.cos(v[0] * Math.PI / 180), 0), sy = best.reduce((a, v) => a + Math.sin(v[0] * Math.PI / 180), 0);
        const h = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
        const col = 'hsl(' + Math.round(h) + ' 78% 64%)';
        CPN.colors[name] = col; cpnLs('hs-cpn-col2:' + name, col);
        if (CPN.mid) cpnRender(true);
      } catch (e) { /* a logo from another host can't be read: keep the generated colour */ }
    };
    img.src = src;
  }
  return CPN.colors[name];
}
function cpnHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/* ---------------------------- data in ---------------------------- */
/* each relay answer, kept with the time it arrived (for the delay) */
function cpnOnTick() {
  if (!CPN.mid || !document.getElementById('cn')) return;
  const x = LIVE.games[CPN.mid];
  if (x && x.data && x.data.teams) cpnKeep(x.data);
  if (x && x.data && x.data.status === 'live') cpnShotsFetch(CPN.mid);   // the shot relay, at most every 12 s
  cpnLoop();
}
function cpnKeep(d) {
  const last = CPN.snaps[CPN.snaps.length - 1];
  if (last && last.d.relayedAt === d.relayedAt && (last.d.plays || []).length === (d.plays || []).length) return;
  CPN.snaps.push({ at: Date.now(), d });
  if (CPN.snaps.length > 40) CPN.snaps.splice(0, CPN.snaps.length - 40);
}
/* a game the relay is not polling (finished, or outside the tip-off window): ask it once */
function cpnFetchOnce(mid) {
  if (CPN.fetchedFinal) return;
  CPN.fetchedFinal = true;
  fetch(LIVE_RELAY + '/game/' + mid).then(r => r.ok ? r.json() : null).then(d => {
    if (d && d.teams && CPN.mid === mid) { cpnKeep(d); CPN.snaps[CPN.snaps.length - 1].at = 0; cpnLoop(); }
    else if (CPN.mid === mid) { CPN.noFeed = true; cpnRender(true); }
  }).catch(() => { if (CPN.mid === mid) { CPN.noFeed = true; cpnRender(true); } });
}
/* a finished game the relay can't give: its saved box score */
function cpnFromBox(g) {
  const b = getBox(g.mid);
  if (!b || !b.p || !b.p.length) return null;
  const per = (b.periods && b.periods.length ? b.periods : (DB.pbpPer && DB.pbpPer[g.mid])) || [];
  return { status: 'final', saved: true, period: 4, clock: '00:00', plays: [],
    teams: [g.h, g.a].map((name, i) => ({ name, score: i ? g.as : g.hs, fouls: null, q: per.map(p => p[i]),
      pl: b.p.filter(l => l.team === name).map(l => ({ no: l.num, name: l.name || personName(l.pid), pid: l.pid, on: 0, starter: 0, min: l.min || '0:00',
        pts: +l.pts || 0, reb: (+l.oreb || 0) + (+l.dreb || 0), oreb: +l.oreb || 0, ast: +l.ast || 0, stl: +l.stl || 0, blk: +l.blk || 0, tov: +l.tov || 0,
        pf: +l.pf || 0, pm: +l.pm || 0, fgm: +l.fgm || 0, fga: +l.fga || 0, tpm: +l.tpm || 0, tpa: +l.tpa || 0, ftm: +l.ftm || 0, fta: +l.fta || 0 })) })) };
}

/* the loop: once a second, pick what should be on screen and play new plays out one at a time */
function cpnLoop() {
  const root = document.getElementById('cn');
  if (!root || root.dataset.mid !== CPN.mid) { clearInterval(CPN.timer); CPN.timer = null; return; }
  const now = Date.now(), due = CPN.snaps.filter(s => s.at <= now - CPN.delay * 1000);
  const snap = due[due.length - 1] || null;
  CPN.waiting = !snap && CPN.snaps.length ? Math.ceil((CPN.snaps[0].at + CPN.delay * 1000 - now) / 1000) : 0;
  let changed = false;
  if (snap && snap !== CPN.cur) {
    const n = (snap.d.plays || []).length;
    if (!CPN.cur || n - CPN.shown > CPN_BURST || n < CPN.shown) { CPN.shown = n; CPN.instant = true; }
    else CPN.instant = false;
    CPN.cur = snap; CPN.target = n; changed = true;
  }
  if (CPN.cur && CPN.shown < CPN.target && now - CPN.lastStep >= CPN_STEP) {
    CPN.shown++; CPN.lastStep = now; CPN.instant = false; changed = true;
  }
  if (changed) cpnRender(false);
  else cpnFresh();
}

/* ---------------------------- the model ---------------------------- */
function cpnModel(g, d, k) {
  const c = COMP_BY_ID[g.cid];
  const nameOf = (t, i) => {
    const u = String(t.name || '').toUpperCase();
    return u === String(g.h).toUpperCase() ? g.h : u === String(g.a).toUpperCase() ? g.a : (t.name || (i ? g.a : g.h));
  };
  const T = d.teams.map((t, i) => ({ i, raw: t.name, name: nameOf(t, i), code: t.code || watchCode(nameOf(t, i)) }));
  const all = (d.plays || []).slice().reverse();                   // oldest first
  const n = Math.min(k == null ? all.length : k, all.length), vis = all.slice(0, n), done = n === all.length;
  const pidOf = (side, no) => livePid(g.cid, d.teams[side - 1] ? d.teams[side - 1].name : '', no) || null;

  // the score after every play, the lead over time, and every scoring play
  let sh = 0, sa = 0;
  const flow = [[0, 0]], scores = [];
  vis.forEach((p, i) => {
    const s = p.score || [sh, sa];
    if (+s[0] !== sh || +s[1] !== sa) {
      const side = +s[0] > sh ? 1 : 2, pts = side === 1 ? +s[0] - sh : +s[1] - sa;
      sh = +s[0]; sa = +s[1];
      const t = cpnT(p);
      scores.push({ t, side, pts, i, p });
      flow.push([t, sh - sa]);
    }
  });
  const fin = d.status === 'final' && done;
  // points by period for the plays shown so far (overtimes after the 4th)
  const qPlayed = [[], []];
  { let ph = 0, pa = 0;
    vis.forEach(p => {
      if (!p.score) return;
      const k = (/OVERTIME/i.test(p.periodType || '') && +p.period <= 4 ? +p.period + 4 : +p.period) - 1;
      for (const j of [0, 1]) { for (let x = qPlayed[j].length; x <= k; x++) qPlayed[j][x] = 0; }
      qPlayed[0][k] += +p.score[0] - ph; qPlayed[1][k] += +p.score[1] - pa; ph = +p.score[0]; pa = +p.score[1];
    }); }
  const score = done ? [d.teams[0].score, d.teams[1].score] : [sh, sa];
  const lastP = vis[vis.length - 1] || null;
  const clockSrc = done ? { period: d.period, periodType: d.periodType, clock: d.clock } : lastP || { period: 1, clock: '10:00' };
  const tNow = fin ? Math.max(2400, cpnT(clockSrc)) : cpnT(clockSrc);
  const perNow = (done ? +d.period : +(lastP || {}).period) || 1;
  const otNow = done ? (/OVERTIME/i.test(d.periodType || '') || d.inOT || perNow > 4) : /OVERTIME/i.test((lastP || {}).periodType || '') || perNow > 4;

  // runs: consecutive points by one side; 8 or more is a run
  const runs = [];
  let cur = null;
  scores.forEach(s => {
    if (cur && cur.side === s.side) { cur.pts += s.pts; cur.to = s; }
    else { if (cur && cur.pts >= 8) runs.push(cur); cur = { side: s.side, pts: s.pts, from: s, to: s }; }
  });
  const runNow = cur && cur.pts >= 8 ? cur : null;
  if (runNow) runs.push(Object.assign({ live: !fin }, runNow));
  const prevRun = runs.filter(r => r !== runNow && !r.live).slice(-1)[0];

  // lead: biggest each way, changes, time ahead
  const big = [0, 0], ahead = [0, 0];
  let changes = 0, sign = 0;
  flow.forEach(([t, v], i) => {
    if (v > big[0]) big[0] = v;
    if (-v > big[1]) big[1] = -v;
    const sg = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (sg && sign && sg !== sign) changes++;
    if (sg) sign = sg;
    const tEnd = i + 1 < flow.length ? flow[i + 1][0] : tNow;
    if (v > 0) ahead[0] += tEnd - t; else if (v < 0) ahead[1] += tEnd - t;
  });

  // team fouls this period and timeouts left (FIBA: 2 in the first half, 3 in the second with
  // no more than 2 in the last two minutes of the 4th, 1 in each overtime)
  const fouls = [0, 1].map(i => {
    if (d.saved) return null;
    if (done && d.teams[i].fouls != null) return +d.teams[i].fouls;
    return vis.filter(p => p.team === i + 1 && p.type === 'foul' && p.no && +p.period === perNow && (/OVERTIME/i.test(p.periodType || '') === !!otNow)).length;
  });
  const tos = vis.filter(p => p.type === 'timeout' && (p.team === 1 || p.team === 2) && !/media|tv|official|commercial/i.test(p.sub || ''));
  const phase = otNow ? 'ot' + perNow : perNow <= 2 ? 'h1' : 'h2';
  const allow = otNow ? 1 : perNow <= 2 ? 2 : 3;
  const timeouts = [0, 1].map(i => {
    const mine = tos.filter(p => p.team === i + 1);
    const inPhase = mine.filter(p => {
      const ot = /OVERTIME/i.test(p.periodType || '') || +p.period > 4;
      return otNow ? (ot && +p.period === perNow) : !ot && (phase === 'h1' ? +p.period <= 2 : +p.period >= 3);
    }).length;
    let left = Math.max(0, allow - inPhase);
    if (!otNow && perNow === 4 && 2400 - tNow <= 120) {
      const late = mine.filter(p => +p.period === 4 && cpnSecs(p.clock) <= 120 && !/OVERTIME/i.test(p.periodType || '')).length;
      left = Math.min(left, Math.max(0, 2 - late));
    }
    return { left, allow };
  });

  // players, with their ids for faces, names and profiles
  const teams = d.teams.map((t, i) => ({
    name: T[i].name, code: T[i].code, score: score[i], q: done ? t.q || [] : qPlayed[i], color: cpnColor(T[i].name), side: i + 1,
    fouls: fouls[i], to: timeouts[i],
    pl: (t.pl || []).map(p => ({
      no: p.no, name: p.name, pid: p.pid || pidOf(i + 1, p.no), on: !!p.on && !fin, starter: !!p.starter,
      played: p.min !== '0:00' && p.min !== '00:00' || p.pts > 0, min: p.min,
      pts: +p.pts || 0, reb: +p.reb || 0, oreb: +p.oreb || 0, ast: +p.ast || 0, stl: +p.stl || 0, blk: +p.blk || 0,
      tov: +p.tov || 0, pf: +p.pf || 0, pm: +p.pm || 0, fgm: +p.fgm || 0, fga: +p.fga || 0, tpm: +p.tpm || 0, tpa: +p.tpa || 0,
      ftm: +p.ftm || 0, fta: +p.fta || 0,
    })),
    tot: Object.assign(watchSum(t.pl || []), t.tot || {}),
  }));
  teams.forEach(t => t.pl.forEach(p => { p.short = watchShort(p.name) || p.name; }));

  // the play-by-play, newest first
  const shot = p => p.type === '2pt' || p.type === '3pt' || p.type === 'freethrow';
  const feed = vis.map((p, i) => ({ p, i })).filter(x => x.p.type !== 'substitution' && x.p.type !== 'foulon' && x.p.type !== 'period')
    .reverse().map(({ p, i }) => {
      const side = p.team === 1 || p.team === 2 ? p.team : 0, txt = livePlayText(p);
      return { i, side, per: cpnPer(p), clock: cpnClock(p), name: p.name || '', short: p.name ? watchShort(p.name) : '',
        pid: side ? pidOf(side, p.no) : null, text: p.name ? txt : livePlayCap(txt),
        score: p.score ? p.score[0] + '–' + p.score[1] : '', scoring: !!(p.scoring && p.made && shot(p)), team: side ? T[side - 1] : null };
    });

  // the moment: what the last play was, if it deserves the card
  let moment = null;
  if (lastP && !fin) {
    const side = lastP.team, tm = side ? T[side - 1] : null, ls = scores[scores.length - 1];
    const pid = side ? pidOf(side, lastP.no) : null;
    const pl = side ? teams[side - 1].pl.find(x => String(x.no) === String(lastP.no)) : null;
    const foulsBy = side && lastP.no ? vis.filter(p => p.type === 'foul' && p.team === side && String(p.no) === String(lastP.no)).length : 0;
    if (ls && ls.i === vis.length - 1) {
      let kicker = tm.name;
      if (runNow && runNow.side === side && runNow.to === ls) kicker = tm.code + ' ' + runNow.pts + '–0 run';
      else if (prevRun && prevRun.side !== side && scores[scores.length - 2] === prevRun.to) kicker = 'Ends ' + (/^(8|11|18)$/.test(String(prevRun.pts)) ? 'an ' : 'a ') + prevRun.pts + '–0 run';
      moment = { kind: 'score', side, pid, kicker, who: watchShort(lastP.name) || tm.name, what: livePlayText(lastP),
        big: '+' + ls.pts, line: pl ? pl.pts + ' PTS' + (pl.fga ? ' · ' + pl.fgm + '/' + pl.fga + ' FG' : '') : '' };
    } else if (lastP.type === 'timeout' && side) {
      moment = { kind: 'timeout', side, pid: null, kicker: tm.code, who: 'Timeout, ' + tm.name, what: score[side - 1] - score[2 - side] >= 0 ? 'Up ' + (score[side - 1] - score[2 - side]) : 'Down ' + (score[2 - side] - score[side - 1]),
        big: String(timeouts[side - 1].left), line: 'left' };
    } else if (lastP.type === 'foul' && side && foulsBy >= 5) {
      moment = { kind: 'out', side, pid, kicker: 'Fouled out', who: watchShort(lastP.name), what: 'Personal foul, his fifth', big: '5', line: 'fouls' };
    }
  }

  return { g, c, d, T, teams, score, fin, live: d.status === 'live' && !fin, done, n, all, vis, lastP, perNow, otNow, tNow,
    clock: fin ? 'Final' : lastP || done ? cpnClock(clockSrc) || '10:00' : '10:00', flow, scores, runs, runNow, prevRun, big, ahead, changes, feed, moment };
}

/* lineups and on/off, from the starters and every substitution (whole game so far) */
function cpnLineups(m) {
  const all = m.all, d = m.d;
  if (!all.length || !m.teams.every(t => t.pl.filter(p => p.starter).length === 5)) return null;
  const on = m.teams.map(t => new Set(t.pl.filter(p => p.starter).map(p => String(p.no))));
  const L = [{}, {}], OO = m.teams.map(t => { const o = {}; t.pl.forEach(p => { o[p.no] = { onS: 0, onPm: 0, offS: 0, offPm: 0 }; }); return o; });
  let tPrev = 0, sh = 0, sa = 0;
  const key = i => [...on[i]].sort((a, b) => a - b).join(',');
  const unit = i => L[i][key(i)] || (L[i][key(i)] = { nos: [...on[i]], secs: 0, pf: 0, pa: 0 });
  const close = t => {
    const dt = t - tPrev;
    if (dt <= 0) return;
    [0, 1].forEach(i => {
      if (on[i].size === 5) unit(i).secs += dt;
      Object.entries(OO[i]).forEach(([no, o]) => { if (on[i].has(String(no))) o.onS += dt; else o.offS += dt; });
    });
    tPrev = t;
  };
  all.forEach(p => {
    const t = cpnT(p);
    if (p.type === 'substitution' && (p.team === 1 || p.team === 2)) {
      close(t);
      const s = on[p.team - 1];
      if (p.sub === 'in') s.add(String(p.no)); else if (p.sub === 'out') s.delete(String(p.no));
      return;
    }
    const s = p.score || [sh, sa];
    if (+s[0] !== sh || +s[1] !== sa) {
      close(t);
      const dh = +s[0] - sh, da = +s[1] - sa;
      sh = +s[0]; sa = +s[1];
      [0, 1].forEach(i => {
        const mine = i ? da : dh, theirs = i ? dh : da;
        if (on[i].size === 5) { unit(i).pf += mine; unit(i).pa += theirs; }
        Object.entries(OO[i]).forEach(([no, o]) => { if (on[i].has(String(no))) o.onPm += mine - theirs; else o.offPm += mine - theirs; });
      });
    }
  });
  close(m.fin ? Math.max(tPrev, cpnT({ period: d.period, periodType: d.periodType, clock: d.clock })) : cpnT({ period: d.period, periodType: d.periodType, clock: d.clock }));
  return {
    units: L.map(u => Object.values(u).filter(x => x.secs >= 30).sort((a, b) => b.secs - a.secs).slice(0, 5)),
    now: on.map(s => [...s]), oo: OO,
  };
}

/* a player's season so far (this competition), or his last MBL season */
function cpnSeason(pid, cid) {
  if (!pid) return null;
  const lines = (CAREER[pid] || []).filter(x => x.c.series === CPN_SERIES && x.c.gender !== 'Women' && +x.p.g > 0)
    .sort((a, b) => (a.c.id === cid ? -1 : b.c.id === cid ? 1 : String(b.c.start || '').localeCompare(String(a.c.start || ''))));
  const x = lines[0];
  if (!x) return null;
  const p = x.p, g = +p.g;
  return { label: x.c.id === cid ? 'this season' : (x.c.year || String(x.c.start || '').slice(0, 4)) + ' season', g,
    pts: +p.pts / g, reb: +p.reb / g, ast: +p.ast / g, fg: +p.fga ? 100 * +p.fgm / +p.fga : null, ts: p.tspct != null ? +String(p.tspct).replace(',', '') : null };
}
function cpnBio(pid, cid) {
  const b = BIO[pid];
  if (!b) return null;
  return b[cid] || Object.values(b).sort((x, y) => String((COMP_BY_ID[y.cid] || {}).start || '').localeCompare(String((COMP_BY_ID[x.cid] || {}).start || '')))[0];
}

/* ---------------------------- shots ----------------------------
   Every shot with its spot on the floor, from the shot relay (hoopstatsmy-feed):
   GET /feed/<mid> → the LiveStats feed trimmed to teams, players, shots and plays,
   with an open CORS header and a 5 s edge cache. tm[k].shot[] = {pno, per, x, y, r,
   actionType, subType, actionNumber}; x runs along the court and y across it, both in
   % of the whole floor (the hosted chart's left and top); the play with the same
   actionNumber gives the clock. A finished game the relay can't give falls back to
   stats/shg/<mid>.js (build_shots.py: spots and results, no clocks).

   A shot is drawn once its play has been played out on this screen (same team,
   shirt, period, clock and result), so the chart keeps the same delay as the score. */
const CPN_FEED = 'https://hoopstatsmy-feed.etiennecheah26.workers.dev';
const CPN_RIM = 1.575;
// FG% by spot over MBL 2024 (cid 40226, 37 games with charts): the zones view compares against it
const CPN_ZAVG = { pt: 50.7, mc: 25.3, mTop: 29.8, mBot: 29.8, cTop: 36.0, cBot: 36.0, t3: 29.2, wTop: 27.9, wBot: 27.9 };
const CPN_TYP = { jumpshot: 'Jump shot', layup: 'Layup', drivinglayup: 'Driving layup', pullupjumpshot: 'Pull-up jumper', floatingjumpshot: 'Floater', fadeaway: 'Fadeaway',
  reverselayup: 'Reverse layup', tipinlayup: 'Tip-in', stepbackjumpshot: 'Step-back jumper', dunk: 'Dunk', turnaroundjumpshot: 'Turnaround jumper', hookshot: 'Hook shot', alleyoop: 'Alley-oop' };

/* chart % → metres: x across (− / +), y from the rim the shot was taken at (as build_shots.py place()) */
function cpnPlace(top, left) {
  let d, yi;
  if (left < 50) { d = left / 100 * 28; yi = top / 100 * 15; } else { d = 28 - left / 100 * 28; yi = 15 - top / 100 * 15; }
  return [7.5 - yi, d - CPN_RIM];
}
function cpnShotsFetch(mid, force) {
  const now = Date.now();
  if (CPN.shotBusy || (!force && now - (CPN.shotAt || 0) < 12e3)) return;
  CPN.shotBusy = true; CPN.shotAt = now;
  fetch(CPN_FEED + '/feed/' + mid).then(r => r.ok ? r.json() : null).then(d => {
    CPN.shotBusy = false;
    if (CPN.mid !== mid) return;
    if (!d || !d.tm) { cpnShotsSaved(mid); return; }
    const clockOf = {};
    (d.pbp || []).forEach(a => { clockOf[a.actionNumber] = String(a.clock || '').slice(0, 5).replace(/^0(\d:)/, '$1'); });
    const out = [];
    ['1', '2'].forEach((k, i) => {
      const t = d.tm[k] || {};
      (t.shot || []).forEach(s => {
        const pl = (t.pl || {})[s.pno] || {}, xy = cpnPlace(+s.y, +s.x);
        out.push({ side: i + 1, no: String(pl.shirtNumber || ''), name: [pl.firstName, pl.familyName].filter(Boolean).join(' '), per: +s.per, x: xy[0], y: xy[1],
          made: s.r ? 1 : 0, three: s.actionType === '3pt' ? 1 : 0, typ: s.subType || '', clock: clockOf[s.actionNumber] || '', an: +s.actionNumber || 0 });
      });
    });
    out.sort((a, b) => a.an - b.an);
    CPN.shots = out; CPN.shotSrc = 'feed';
    if (CPN.view === 'shots' || CPN.shotsCount !== out.length) cpnRender(true);
  }).catch(() => { CPN.shotBusy = false; if (CPN.mid === mid && !CPN.shots) cpnShotsSaved(mid); });
}
function cpnShotsSaved(mid) {
  if (typeof ensureGameShots !== 'function') return;
  const d = SHG_DATA[mid];
  if (d) {
    const P = d.P || [];
    CPN.shots = d.s.map((s, i) => ({ side: s[7] + 1, pid: s[6] >= 0 ? P[s[6]] : null, no: '', name: s[6] >= 0 ? personName(P[s[6]]) : '', per: s[5], x: s[0], y: s[1],
      made: s[2], three: s[3], typ: (d.T || [])[s[4]] || '', clock: '', an: i }));
    CPN.shotSrc = 'saved'; cpnRender(true); return;
  }
  if (SHG_ST[mid] === 'error') return;
  ensureGameShots(mid);
  setTimeout(() => { if (CPN.mid === mid && !CPN.shots) cpnShotsSaved(mid); }, 800);
}

/* the shots this screen has reached, each with its spot on the drawing (0–1), its zone and its player */
function cpnShotList(m) {
  const raw = CPN.shots || [];
  if (!raw.length) return { all: [], latest: -1 };
  const live = m.all.length && CPN.shotSrc === 'feed';
  const key = (side, no, per, clock, made) => side + '|' + no + '|' + per + '|' + clock + '|' + made;
  const avail = {}, lastFga = {};
  if (live) m.vis.forEach((p, i) => {
    if ((p.type === '2pt' || p.type === '3pt') && (p.team === 1 || p.team === 2)) {
      const k = key(p.team, String(p.no), +p.period, cpnClock(p), p.made ? 1 : 0);
      avail[k] = (avail[k] || 0) + 1;
      if (i === m.vis.length - 1) lastFga.k = k;
    }
  });
  const pidOf = (side, no) => livePid(m.g.cid, m.d.teams[side - 1] ? m.d.teams[side - 1].name : '', no) || null;
  let latest = -1;
  const all = [];
  raw.forEach(s => {
    if (live) {
      const k = key(s.side, s.no, s.per, s.clock, s.made);
      if (!avail[k]) return;
      avail[k]--;
      if (k === lastFga.k && !avail[k]) latest = all.length;
    }
    const top = s.side === 1 ? s.x > 0 : s.x < 0, d = s.y + CPN_RIM, ax = Math.abs(s.x);
    let z;
    if (s.three) z = d <= 3.13 ? (top ? 'cTop' : 'cBot') : ax <= 2.45 ? 't3' : (top ? 'wTop' : 'wBot');
    else z = ax <= 2.45 && d <= 5.8 ? 'pt' : ax <= 2.45 ? 'mc' : (top ? 'mTop' : 'mBot');
    const cx = s.side === 1 ? (CPN_RIM + s.y) / 28 : (28 - CPN_RIM - s.y) / 28, cy = s.side === 1 ? (7.5 - s.x) / 15 : (7.5 + s.x) / 15;
    const pid = s.pid || (s.no ? pidOf(s.side, s.no) : null);
    all.push(Object.assign({}, s, { i: all.length, z, cx: Math.max(0, Math.min(1, cx)), cy: Math.max(0, Math.min(1, cy)), pid,
      short: pid ? watchShort(personName(pid)) : s.name ? watchShort(s.name) : '#' + s.no, dist: Math.sqrt(s.x * s.x + s.y * s.y) }));
  });
  if (CPN.lastLatest !== latest && latest >= 0 && CPN.view !== 'shots' && CPN.instant === false) CPN.unseen = (CPN.unseen || 0) + 1;
  CPN.lastLatest = latest;
  return { all, latest };
}

/* ---------------------------- the page ---------------------------- */
function renderCompanion(mid) {
  const g = GAME_BY_MID[mid];
  if (CPN.mid !== mid) {
    Object.assign(CPN, { mid, snaps: [], cur: null, shown: 0, target: 0, fetchedFinal: false, noFeed: false, prevStats: {}, prevScore: null,
      prevPlays: 0, sel: null, away: false, seen: 0, hov: null, sortBy: null, filter: 'all', shots: null, shotSrc: null, shotAt: 0, shotBusy: false,
      sTeam: 0, sPer: 0, sRes: 'all', sMode: 'dots', sPid: null, hs: null, unseen: 0, lastLatest: -1, view: cpnLs('hs-cpn-view') || 'box' });
  }
  if (g.st !== 'COMPLETE' && g.st !== 'NOT_PLAYED' && !LIVE.games[mid]) {
    LIVE.games[mid] = { g, state: 'pending', data: null, at: 0 };
    setTimeout(liveTick, 0);
  }
  if (LIVE.games[mid] && LIVE.games[mid].data) cpnKeep(LIVE.games[mid].data);
  setTimeout(cpnMount, 0);
  const c = COMP_BY_ID[g.cid];
  return `<div class="cn" id="cn" data-mid="${esc(mid)}">
    <div class="cn-sr" aria-live="polite" id="cn-say"></div>
    <header class="cn-top">
      <a class="cn-brand" href="#/" title="HoopStatsMY home"><svg width="18" height="18" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke="#FF6B1A" stroke-width="2.6"/><path d="M2 14h24M14 2v24M5.5 5.5c4 4 4 13 0 17M22.5 5.5c-4 4-4 13 0 17" fill="none" stroke="#FF6B1A" stroke-width="1.7"/></svg>HOOPSTATS MY</a>
      <span class="cn-rule" aria-hidden="true"></span>
      <span class="cn-crumb">${compCrest(c, 18)}<a href="#/c/${g.cid}">${esc(liveCompName(g.cid))}</a><span>${esc(g.h)} vs ${esc(g.a)}</span></span>
      <span class="cn-fresh" id="cn-fresh"></span>
      <span class="cn-delay"><span class="cn-lab" id="cn-dl">Delay</span><span class="cn-seg" role="group" aria-labelledby="cn-dl" id="cn-delay"></span></span>
      <button type="button" class="cn-icon" data-cn="fs" id="cn-fs" aria-label="Full screen" title="Full screen: hides the browser's tabs and address bar (Esc to leave)">${cpnFsIcon(false)}</button>
      <a class="cn-mbl" id="cn-mbl" href="${CPN_MBL_URL}" target="_blank" rel="noopener"><svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v16l14-8z" fill="currentColor"/></svg>Watch on MBL<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M9 5h10v10M19 5L6 18"/></svg></a>
    </header>
    <section class="cn-board" aria-label="Score">
      <div class="cn-score" id="cn-score">
        <div class="cn-side cn-side-h"><div class="cn-info" id="cn-info-0"></div><div class="cn-big cn-num" id="cn-big-0" aria-hidden="true"></div></div>
        <div class="cn-center" id="cn-center"></div>
        <div class="cn-side cn-side-a"><div class="cn-info" id="cn-info-1"></div><div class="cn-big cn-num" id="cn-big-1" aria-hidden="true"></div></div>
      </div>
      <div class="cn-flow" id="cn-flow"></div>
      <div id="cn-lt"></div>
    </section>
    <div class="cn-main">
      <main class="cn-body">
        <div class="cn-tabsrow"><div class="cn-tabs" role="tablist" aria-label="Game views" id="cn-tabs"></div><span class="cn-tabnote" id="cn-tabnote"></span></div>
        <div class="cn-pane" id="cn-pane"></div>
      </main>
      <aside class="cn-rail">
        <section class="cn-compare" id="cn-compare" aria-label="Team stats"></section>
        <section class="cn-plays" aria-label="Play-by-play">
          <div class="cn-ph"><h2>Play-by-play</h2><span class="cn-chips" role="group" aria-label="Show" id="cn-filters"></span></div>
          <div id="cn-run"></div>
          <div class="cn-feedwrap"><div id="cn-newpill"></div><ol class="cn-feed cn-scroll" id="cn-feed"></ol></div>
        </section>
      </aside>
    </div>
  </div>`;
}
function cpnFsIcon(on) {
  return on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
}

function cpnMount() {
  const root = document.getElementById('cn');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  root.addEventListener('click', cpnClick);
  root.addEventListener('mousemove', e => {
    const ch = e.target.closest('#cn-chart');
    if (ch) {
      const r = ch.getBoundingClientRect(), x = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 240) / 240;
      if (x !== CPN.hov) { CPN.hov = x; cpnPaintFlow(); }
      return;
    }
    const dot = e.target.closest('[data-cn="shot"]');
    const hs = dot ? +dot.dataset.v : null;
    if (hs !== CPN.hs && (dot || e.target.closest('#cn-court'))) { CPN.hs = hs; cpnPaintTip(); }
  });
  root.addEventListener('mouseout', e => {
    if (e.target.closest && e.target.closest('#cn-chart') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#cn-chart'))) { CPN.hov = null; cpnPaintFlow(); }
    if (e.target.closest && e.target.closest('#cn-court') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#cn-court'))) { CPN.hs = null; cpnPaintTip(); }
  });
  root.addEventListener('focusin', e => { const dot = e.target.closest('[data-cn="shot"]'); if (dot) { CPN.hs = +dot.dataset.v; cpnPaintTip(); } });
  const feed = document.getElementById('cn-feed');
  feed.addEventListener('scroll', () => {
    const away = feed.scrollTop > 40;
    if (away && !CPN.away) { CPN.away = true; CPN.seen = CPN.shown; }
    else if (!away && CPN.away) { CPN.away = false; cpnPaintPill(); }
  });
  if (!cpnMount.fsWired) {
    cpnMount.fsWired = true;
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
      const b = document.getElementById('cn-fs'), on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (b) { b.innerHTML = cpnFsIcon(on); b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen'); }
    }));
  }
  const g = GAME_BY_MID[CPN.mid];
  if (g && (g.st === 'COMPLETE' || !liveCandidates().some(x => x.mid === g.mid))) cpnFetchOnce(g.mid);
  if (g) cpnShotsFetch(g.mid, true);
  clearInterval(CPN.timer);
  CPN.timer = setInterval(cpnLoop, 1000);
  cpnRender(true);
  cpnLoop();
}

function cpnClick(e) {
  const b = e.target.closest('[data-cn]');
  if (!b) return;
  const a = b.dataset.cn, v = b.dataset.v;
  if (a === 'fs') {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const go = el.requestFullscreen || el.webkitRequestFullscreen; if (go) { const r = go.call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } }
    return;
  }
  if (a === 'delay') { CPN.delay = +v; cpnLs('hs-cpn-delay', String(CPN.delay)); CPN.cur = null; cpnLoop(); cpnRender(true); return; }
  if (a === 'view') { CPN.view = v; cpnLs('hs-cpn-view', v); if (v === 'shots') CPN.unseen = 0; cpnRender(true); return; }
  if (a === 'sort') { CPN.sortBy = CPN.sortBy === v ? null : v; cpnRender(true); return; }
  if (a === 'filter') { CPN.filter = v; cpnRender(true); return; }
  if (a === 'lteam') { CPN.lteam = +v; cpnRender(true); return; }
  if (a === 'sel') { if (!v) return; CPN.sel = v; CPN.view = 'adv'; if (b.dataset.side) CPN.lteam = +b.dataset.side - 1; cpnRender(true); return; }
  if (a === 'follow') { CPN.follow = CPN.follow === v ? null : v; cpnLs('hs-cpn-follow', CPN.follow); cpnRender(true); return; }
  if (a === 'newplays') { const f = document.getElementById('cn-feed'); if (f) f.scrollTo({ top: 0, behavior: 'smooth' }); CPN.away = false; cpnPaintPill(); return; }
  if (a === 'sTeam') { CPN.sTeam = +v; CPN.hs = null; cpnRender(true); return; }
  if (a === 'sPer') { CPN.sPer = +v; CPN.hs = null; cpnRender(true); return; }
  if (a === 'sRes') { CPN.sRes = v; CPN.hs = null; cpnRender(true); return; }
  if (a === 'sMode') { CPN.sMode = v; CPN.hs = null; cpnRender(true); return; }
  if (a === 'sPid') { CPN.sPid = !v || CPN.sPid === v ? null : v; CPN.hs = null; cpnRender(true); return; }
  if (a === 'shot') { const s = (CPN_SHOTS.all || [])[+v]; if (s && s.pid) { CPN.sPid = CPN.sPid === s.pid ? null : s.pid; cpnRender(true); } }
}

/* ---------------------------- drawing ---------------------------- */
function cpnCurrentModel() {
  const g = GAME_BY_MID[CPN.mid];
  if (!g) return null;
  let d = CPN.cur ? CPN.cur.d : null;
  if (!d && CPN.noFeed) d = cpnFromBox(g);
  if (!d) return { g, c: COMP_BY_ID[g.cid], pre: true };
  return cpnModel(g, d, CPN.shown);
}

let CPN_LAST = null, CPN_SHOTS = { all: [], latest: -1 };
function cpnRender(force) {
  const root = document.getElementById('cn');
  if (!root) return;
  const m = cpnCurrentModel();
  if (!m) return;
  CPN_LAST = m;
  cpnFresh();
  cpnPaintDelay();
  if (m.pre) { cpnPaintPre(m); return; }
  const par = CPN.shown % 2, stepped = !CPN.instant && !force;
  CPN_SHOTS = cpnShotList(m);
  CPN.shotsCount = (CPN.shots || []).length;
  cpnPaintScore(m, stepped, par);
  cpnPaintFlow();
  cpnPaintMoment(m, stepped, par);
  cpnPaintTabs(m);
  const pane = document.getElementById('cn-pane'), was = pane.dataset.view;
  if (CPN.view === 'adv') pane.innerHTML = cpnAdvHtml(m);
  else if (CPN.view === 'shots') pane.innerHTML = cpnShotsHtml(m, stepped, par);
  else pane.innerHTML = cpnBoxHtml(m, stepped, par);
  pane.dataset.view = CPN.view;
  pane.classList.toggle('cn-enter', was !== CPN.view);
  document.getElementById('cn-compare').innerHTML = cpnCompareHtml(m);
  cpnPaintFeed(m, stepped, par);
  if (stepped && m.lastP) {
    const say = document.getElementById('cn-say');
    if (say) say.textContent = (m.lastP.name ? watchShort(m.lastP.name) + ', ' : '') + livePlayText(m.lastP) + '. ' + m.teams[0].name + ' ' + m.score[0] + ', ' + m.teams[1].name + ' ' + m.score[1] + '.';
  }
  m.teams.forEach((t, i) => t.pl.forEach(p => { CPN.prevStats[i + ':' + p.no] = { pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, fga: p.fga, tpa: p.tpa, pf: p.pf }; }));
  CPN.prevScore = m.score.slice();
}

function cpnFresh() {
  const el = document.getElementById('cn-fresh');
  if (!el) return;
  const g = GAME_BY_MID[CPN.mid], x = LIVE.games[CPN.mid], m = CPN_LAST;
  let text, live = false;
  if (m && m.fin) text = 'Final';
  else if (CPN.waiting > 0) text = 'Delay: first numbers in ' + CPN.waiting + ' s';
  else if (x && x.err && !(x && x.data)) text = 'Live feed not answering, retrying';
  else if (CPN.cur && CPN.cur.at) {
    const s = Math.max(0, Math.round((Date.now() - CPN.cur.at) / 1000));
    live = m && m.live;
    text = CPN.delay ? 'Delayed ' + CPN.delay + ' s' : 'Updated ' + (s < 5 ? 'just now' : s + ' s ago');
  } else text = g && g.st === 'COMPLETE' ? 'Loading the game' : 'Waiting for tip-off';
  el.innerHTML = (live ? '<span class="cn-live"><i></i>LIVE</span>' : '') + '<span>' + esc(text) + '</span>';
  el.title = 'The numbers refresh about every 15 seconds. Delay holds them back so they land with the MBL stream.';
  const mbl = document.getElementById('cn-mbl');
  if (mbl) mbl.hidden = !!(m && m.fin);
  if (m && m.pre && document.getElementById('cn-countdown')) document.getElementById('cn-countdown').textContent = cpnCountdown(m.g);
}
function cpnPaintDelay() {
  const el = document.getElementById('cn-delay');
  if (el) el.innerHTML = [[0, 'Off'], [15, '15 s'], [30, '30 s'], [45, '45 s']].map(([v, l]) =>
    `<button type="button" data-cn="delay" data-v="${v}" aria-pressed="${CPN.delay === v}"${CPN.delay === v ? ' class="on"' : ''}>${l}</button>`).join('');
}
function cpnCountdown(g) {
  const s = liveStart(g);
  if (s == null) return '';
  const left = Math.round((s - Date.now()) / 1000);
  if (left <= 0) return 'Tip-off any moment';
  const d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), mi = Math.floor(left % 3600 / 60), se = left % 60;
  return d ? d + 'd ' + h + 'h ' + mi + 'm' : (h ? h + 'h ' : '') + ('0' + mi).slice(-2) + ':' + ('0' + se).slice(-2);
}
function cpnSeg(act, items, cur, cls) {
  return `<span class="cn-seg${cls ? ' ' + cls : ''}" role="group">` + items.map(([v, l]) =>
    `<button type="button" data-cn="${act}" data-v="${esc(String(v))}" aria-pressed="${String(cur) === String(v)}"${String(cur) === String(v) ? ' class="on"' : ''}>${l}</button>`).join('') + '</span>';
}

/* before tip-off: the two teams, the countdown and the rosters */
function cpnPaintPre(m) {
  const g = m.g, c = m.c;
  [g.h, g.a].forEach((name, i) => {
    document.getElementById('cn-info-' + i).innerHTML = `${crest(name, 56)}<div class="cn-names"><span class="cn-code">${esc(watchCode(name))}</span><b>${esc(name)}</b></div>`;
    document.getElementById('cn-big-' + i).innerHTML = '';
  });
  document.getElementById('cn-center').innerHTML = `<span class="cn-per">${esc(liveTip(g))}</span><span class="cn-clock cn-num" id="cn-countdown">${esc(cpnCountdown(g))}</span><span class="cn-lead">${g.st === 'COMPLETE' ? 'Final' : 'until tip-off'}</span>`;
  document.getElementById('cn-flow').innerHTML = `<div class="cn-empty">The game flow draws itself from tip-off.</div>`;
  document.getElementById('cn-tabs').innerHTML = '<button type="button" role="tab" aria-selected="true" class="on">Rosters</button><span class="cn-tabbar" style="left:0;width:84px"></span>';
  document.getElementById('cn-tabnote').textContent = '';
  const tid = n => Object.keys(c.roster || {}).find(t => String(TEAMS[t] || '').toUpperCase() === String(n).toUpperCase());
  const roster = (name, i) => {
    const rows = ((c.roster || {})[tid(name)] || []).slice().sort((a, b) => +a.num - +b.num);
    return `<section class="cn-team${i ? '' : ' cn-team-l'}" aria-label="${esc(name)} roster"><div class="cn-teamh">${crest(name, 20)}<b>${esc(name.toUpperCase())}</b><i style="background:${cpnColor(name)}"></i></div>
      <div class="cn-scroll">${rows.length ? rows.map(r => `<div class="cn-rrow"><span class="cn-num cn-dim">${esc(r.num)}</span><span class="cn-who">${cpnFaceHtml(r.pid, personName(r.pid), 22)}
        <a href="#/p/${r.pid}">${esc(watchShort(personName(r.pid)))}</a></span><span class="cn-dim">${esc(r.pos || '')}</span><span class="cn-dim cn-num">${r.ht ? esc(r.ht) + ' cm' : ''}</span></div>`).join('')
        : '<div class="cn-empty">The roster is not published yet.</div>'}</div></section>`;
  };
  document.getElementById('cn-pane').innerHTML = `<div class="cn-two">${roster(g.h, 0)}${roster(g.a, 1)}</div>`;
  document.getElementById('cn-compare').innerHTML = '';
  document.getElementById('cn-filters').innerHTML = '';
  document.getElementById('cn-run').innerHTML = '';
  document.getElementById('cn-feed').innerHTML = `<li class="cn-empty">${CPN.noFeed && g.st === 'COMPLETE' ? 'No play-by-play is published for this game.' : 'Plays show here from tip-off.'}</li>`;
}

function cpnFaceHtml(pid, name, size, ring) {
  const src = cpnFace(pid), st = `width:${size}px;height:${size}px${ring ? ';box-shadow:0 0 0 1.5px ' + ring : ''}`;
  return src ? `<span class="cn-face" style="${st}"><img src="${src}" alt="" loading="lazy"></span>`
    : `<span class="cn-face cn-init" style="${st};font-size:${Math.round(size * .36)}px">${esc(cpnInit(name || '?'))}</span>`;
}

/* the scoreboard: names, team fouls, timeouts, the score (an odometer: each digit rolls), the clock and the quarters */
function cpnPaintScore(m, stepped, par) {
  m.teams.forEach((t, i) => {
    const f = t.fouls;
    const ticks = Array.from({ length: 5 }, (_, k) => `<i class="${f != null && k < f ? (f >= 4 ? 'b' : 'on') : ''}"></i>`).join('');
    const tos = Array.from({ length: t.to.allow }, (_, k) => `<i class="${(i ? k >= t.to.allow - t.to.left : k < t.to.left) ? 'on' : ''}"></i>`).join('');
    document.getElementById('cn-info-' + i).innerHTML = `${crest(t.name, 56)}<div class="cn-names"><span class="cn-code">${esc(t.code)}</span><b>${esc(t.name)}</b>
      <span class="cn-meta"><span class="cn-ticks" role="img" aria-label="${f == null ? 'Team fouls not known' : f + ' team fouls this ' + (m.otNow ? 'overtime' : 'quarter') + (f >= 4 ? ', in the bonus' : '')}"><span class="cn-lab">Fouls</span>${ticks}${f >= 4 ? '<span class="cn-bonus">Bonus</span>' : ''}</span>
      <span class="cn-ticks cn-tos" role="img" aria-label="${t.to.left} of ${t.to.allow} timeouts left in this ${m.otNow ? 'overtime' : 'half'}"><span class="cn-lab">T/O</span>${tos}</span></span></div>`;
    const big = document.getElementById('cn-big-' + i), digits = String(t.score).split('');
    big.style.setProperty('--tc', t.color);
    big.classList.toggle('lost', m.fin && t.score < m.score[1 - i]);
    big.setAttribute('aria-label', t.name + ' ' + t.score);
    if (big.children.length !== digits.length) {
      big.innerHTML = digits.map(() => '<span class="cn-dg"><span class="cn-odo">' + '0123456789'.split('').map(n => '<span>' + n + '</span>').join('') + '</span></span>').join('');
      big.querySelectorAll('.cn-odo').forEach(o => { o.style.transition = 'none'; });
      digits.forEach((n, k) => { big.children[k].firstChild.style.transform = 'translateY(-' + n + 'em)'; });
      void big.offsetWidth;
      big.querySelectorAll('.cn-odo').forEach(o => { o.style.transition = ''; });
    } else digits.forEach((n, k) => { big.children[k].firstChild.style.transform = 'translateY(-' + n + 'em)'; });
  });
  const [h, a] = m.teams, lead = m.score[0] - m.score[1];
  const qn = Math.max(4, h.q.length, a.q.length), ql = i => i < 4 ? 'Q' + (i + 1) : 'OT' + (i > 4 ? i - 3 : '');
  const qnow = m.fin ? -1 : (m.otNow ? 3 + (m.perNow > 4 ? m.perNow - 4 : m.perNow) : m.perNow - 1);
  const qrow = t => `<span class="cn-qt" style="color:${t.color}">${esc(t.code)}</span>` + Array.from({ length: qn }, (_, i) => `<span class="${i === qnow ? 'now' : ''}">${t.q[i] != null ? t.q[i] : ''}</span>`).join('') + `<b>${t.score}</b>`;
  let leadText = m.fin ? (lead ? (lead > 0 ? h.name : a.name) + ' win by ' + Math.abs(lead) : 'Tied') : lead === 0 ? 'Tied' : (lead > 0 ? h.code : a.code) + ' by ' + Math.abs(lead);
  const at = t => { let v = 0; m.flow.forEach(([ft, fv]) => { if (ft <= t) v = fv; }); return v; };
  const swing = m.fin ? 0 : at(m.tNow) - at(m.tNow - 300);
  if (Math.abs(swing) >= 4) leadText += ' · last 5 min ' + (swing > 0 ? h.code : a.code) + ' +' + Math.abs(swing);
  const per = m.fin ? (m.otNow ? 'After overtime' : 'Full time') : m.otNow ? 'Overtime' + (m.perNow > 5 ? ' ' + (m.perNow - 4) : '') : ['1st', '2nd', '3rd', '4th'][m.perNow - 1] + ' quarter';
  document.getElementById('cn-center').innerHTML = `<span class="cn-per">${esc(per)}</span><span class="cn-clock cn-num">${esc(m.clock)}</span>
    <span class="cn-lead" style="color:${lead > 0 && !m.fin ? h.color : lead < 0 && !m.fin ? a.color : '#F4F5F7'}">${esc(leadText)}</span>
    <div class="cn-q cn-num" role="table" aria-label="Score by quarter" style="--n:${qn}"><span></span>${Array.from({ length: qn }, (_, i) => `<span class="cn-qh">${ql(i)}</span>`).join('')}<span class="cn-qh">T</span>${qrow(h)}${qrow(a)}</div>`;
}

/* the lower third: the play that just happened, once */
function cpnPaintMoment(m, stepped, par) {
  const el = document.getElementById('cn-lt'), mo = m.moment;
  if (!stepped) { if (!mo) el.innerHTML = ''; return; }
  if (!mo) { el.innerHTML = ''; return; }
  const t = m.teams[mo.side - 1], face = cpnFace(mo.pid), fol = mo.pid && CPN.follow === mo.pid;
  el.innerHTML = `<div class="cn-lt cn-lt-${par}" style="--tc:${t.color}">
    <div class="cn-ltph">${face ? `<img class="cn-ltp-${par}" src="${face}" alt="">` : crest(t.name, 40)}</div>
    <div class="cn-ltx"><span class="cn-ltk">${fol ? 'Following · ' : ''}${esc(mo.kicker)}</span><b>${esc(mo.who)}</b><span>${esc(mo.what)}</span></div>
    <div class="cn-ltn"><b class="cn-num">${esc(mo.big)}</b><span class="cn-num">${esc(mo.line)}</span></div>
    <i class="cn-ltb-${par}"></i></div>`;
}

function cpnPaintFlow() {
  const el = document.getElementById('cn-flow'), m = CPN_LAST;
  if (!el || !m || m.pre) return;
  const end = Math.max(2400, m.tNow), W = 1200, X = t => (t / end * W).toFixed(1);
  const maxAbs = Math.max(14, ...m.flow.map(f => Math.abs(f[1]))), K = 27 / maxAbs;
  const step = sign => {
    let d = 'M0 30', py = 30;
    const pts = m.flow.concat([[m.tNow, m.flow[m.flow.length - 1][1]]]);
    pts.forEach(([t, v], i) => {
      const y = (30 - (sign ? (sign > 0 ? Math.max(0, v) : Math.min(0, v)) : v) * K).toFixed(1);
      d += (i ? ' L' + X(t) + ' ' + py : '') + ' L' + X(t) + ' ' + y; py = y;
    });
    return sign ? d + ' L' + X(m.tNow) + ' 30 Z' : d;
  };
  const [h, a] = m.teams;
  const qlines = [600, 1200, 1800].concat(end > 2400 ? Array.from({ length: Math.round((end - 2400) / 300) }, (_, i) => 2400 + i * 300) : [])
    .map(t => `<line x1="${X(t)}" y1="0" x2="${X(t)}" y2="60" stroke="rgba(255,255,255,.08)" vector-effect="non-scaling-stroke"/>`).join('');
  const tag = (t, label, col, tip) => `<span class="cn-ftag" title="${esc(tip)}" style="left:${(t / end * 100).toFixed(2)}%;color:${col}">${esc(label)}</span>`;
  const tags = m.runs.map(r => tag((r.from.t + r.to.t) / 2, r.pts + '–0', m.teams[r.side - 1].color, m.teams[r.side - 1].code + ' ' + r.pts + '–0 run'))
    .concat([0, 1].filter(i => m.big[i] >= 10).map(i => {
      const at = m.flow.find(f => (i ? -f[1] : f[1]) === m.big[i]);
      return tag(at ? at[0] : 0, '+' + m.big[i], m.teams[i].color, 'Biggest lead: ' + m.teams[i].code + ' by ' + m.big[i]);
    })).join('');
  let hov = '';
  if (CPN.hov != null && CPN.hov * end <= m.tNow) {
    const t = CPN.hov * end;
    let v = 0; m.flow.forEach(([ft, fv]) => { if (ft <= t) v = fv; });
    const q = t < 2400 ? 'Q' + Math.min(4, Math.floor(t / 600) + 1) : 'OT' + (Math.floor((t - 2400) / 300) + 1);
    const rem = t < 2400 ? 600 - (t - Math.min(3, Math.floor(t / 600)) * 600) : 300 - ((t - 2400) % 300);
    hov = `<i class="cn-hline" style="left:${(CPN.hov * 100).toFixed(2)}%"></i><span class="cn-hbox cn-num" style="${CPN.hov > .8 ? 'right:' + ((1 - CPN.hov) * 100 + .8).toFixed(2) + '%' : 'left:calc(' + (CPN.hov * 100).toFixed(2) + '% + 8px)'}"><b>${v === 0 ? 'Tied' : (v > 0 ? h.code : a.code) + ' +' + Math.abs(v)}</b><span>${q} ${cpnMmss(rem)}</span></span>`;
  }
  const aheadI = m.ahead[0] >= m.ahead[1] ? 0 : 1;
  el.innerHTML = `<div class="cn-flowh"><h2>Game flow</h2><span class="cn-key"><i style="background:${h.color}"></i>${esc(h.code)} ahead</span><span class="cn-key"><i style="background:${a.color}"></i>${esc(a.code)} ahead</span><span class="cn-grow"></span>
      <span>Biggest lead <b class="cn-num">${m.big[0] || m.big[1] ? (m.big[0] >= m.big[1] ? h.code + ' +' + m.big[0] : a.code + ' +' + m.big[1]) : '–'}</b></span>
      <span>Lead changes <b class="cn-num">${m.changes}</b></span>
      <span>Time ahead <b class="cn-num">${m.ahead[aheadI] ? m.teams[aheadI].code + ' ' + cpnMmss(m.ahead[aheadI]) : '–'}</b></span></div>
    <div class="cn-chart" id="cn-chart">
      <svg viewBox="0 0 ${W} 60" preserveAspectRatio="none" role="img" aria-label="Lead over the game: ${esc(h.name)} above the line, ${esc(a.name)} below">
        <line x1="0" y1="30" x2="${W}" y2="30" stroke="rgba(255,255,255,.18)" vector-effect="non-scaling-stroke"/>${qlines}
        <path d="${step(1)}" fill="${h.color}" fill-opacity=".55"/><path d="${step(-1)}" fill="${a.color}" fill-opacity=".55"/>
        <path d="${step(0)}" fill="none" stroke="#F4F5F7" stroke-opacity=".7" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
      </svg>${tags}<i class="cn-head" style="left:${(m.tNow / end * 100).toFixed(2)}%${m.fin ? ';opacity:0' : ''}"></i>${hov}
    </div>`;
}

function cpnPaintTabs(m) {
  const tabs = [['box', 'Box score', 92], ['adv', 'Advanced', 86], ['shots', 'Shot chart', 104]];
  let left = 0, bar = '';
  const el = document.getElementById('cn-tabs');
  const html = tabs.map(([v, l, w]) => {
    const on = CPN.view === v;
    if (on) bar = `left:${left}px;width:${w}px`;
    left += w + 8;
    const badge = v === 'shots' && !on && CPN.unseen ? `<span class="cn-badge cn-num">${CPN.unseen}</span>` : '';
    return `<button type="button" role="tab" data-cn="view" data-v="${v}" aria-selected="${on}" style="width:${w}px"${on ? ' class="on"' : ''}>${l}${badge}</button>`;
  }).join('');
  const old = el.querySelector('.cn-tabbar');
  el.innerHTML = html + `<span class="cn-tabbar" style="${old ? old.getAttribute('style') : bar}"></span>`;
  const nb = el.querySelector('.cn-tabbar');
  requestAnimationFrame(() => { nb.setAttribute('style', bar); });
  const all = CPN_SHOTS.all;
  document.getElementById('cn-tabnote').textContent = CPN.view === 'adv' ? (m.fin ? 'Full game' : 'Game so far') + ' · lineups from the substitutions'
    : CPN.view === 'shots' ? (all.length ? cpnShotsShown(all).length + ' of ' + all.length + ' shots shown' : '')
    : m.fin ? 'Final box score' : 'Live · tap a name for detail';
}

/* the box score: both teams side by side */
function cpnBoxHtml(m, stepped, par) {
  const K = ['pts', 'reb', 'ast', 'stl', 'blk'], sb = CPN.sortBy;
  const head = `<div class="cn-brow cn-browh"><span>#</span><span>Player</span>${K.map(k => `<button type="button" data-cn="sort" data-v="${k}" aria-sort="${sb === k ? 'descending' : 'none'}" title="Sort by ${k.toUpperCase()}"${sb === k ? ' class="on"' : ''}>${k.toUpperCase()}</button>`).join('')}<span>FG</span><span>3P</span><span>PF</span></div>`;
  const box = (t, i) => {
    const rows = t.pl.slice().sort((x, y) => (sb ? y[sb] - x[sb] : 0) || (y.on - x.on) || (y.played - x.played) || (y.pts - x.pts) || (y.fga - x.fga));
    return `<section class="cn-team${i ? '' : ' cn-team-l'}" aria-label="${esc(t.name)} players">
      <div class="cn-teamh">${crest(t.name, 20)}<b>${esc(t.name.toUpperCase())}</b><i style="background:${t.color}"></i>${sb ? '<button type="button" class="cn-link" data-cn="sort" data-v="' + sb + '">Reset sort</button>' : '<span class="cn-dim">On court first</span>'}</div>
      ${head}<div class="cn-scroll">${rows.map(p => {
        const prev = CPN.prevStats[i + ':' + p.no] || {}, fol = p.pid && CPN.follow === p.pid;
        const hot = k => stepped && prev[k] != null && prev[k] !== p[k] ? ' cn-fl-' + par : '';
        const cell = (v, k, extra) => `<span class="cn-num${v === 0 || v === '0/0' ? ' z' : ''}${extra || ''}${k ? hot(k) : ''}">${v}</span>`;
        return `<div class="cn-brow${p.played ? '' : ' dnp'}${fol ? ' fol' : ''}">
          <span class="cn-num cn-no"><i class="${p.on ? 'on' : ''}"></i>${esc(p.no)}</span>
          <span class="cn-who">${cpnFaceHtml(p.pid, p.name, 22)}<button type="button" class="cn-name" data-cn="sel" data-v="${esc(p.pid || '')}" data-side="${i + 1}" title="${esc(p.pid && PERSONS[p.pid] ? PERSONS[p.pid] : p.name)}"${p.pid ? '' : ' disabled'}>${esc(p.short)}</button>
            ${fol ? '<svg class="cn-star" width="11" height="11" viewBox="0 0 24 24" role="img" aria-label="Following"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>' : ''}
            ${p.pf >= 5 ? '<span class="cn-out">FOULED OUT</span>' : ''}</span>
          ${cell(p.pts, 'pts', ' b')}${cell(p.reb, 'reb')}${cell(p.ast, 'ast')}${cell(p.stl, 'stl')}${cell(p.blk, 'blk')}
          ${cell(p.fgm + '/' + p.fga, 'fga')}${cell(p.tpm + '/' + p.tpa, 'tpa')}${cell(p.pf, 'pf', p.pf >= 4 ? ' r' : '')}</div>`;
      }).join('')}
      <div class="cn-brow cn-btot"><span></span><span class="cn-lab">Team</span>${[t.tot.pts, t.tot.reb, t.tot.ast, t.tot.stl, t.tot.blk, t.tot.fgm + '/' + t.tot.fga, t.tot.tpm + '/' + t.tot.tpa, t.tot.pf].map(v => `<span class="cn-num">${v == null ? '' : v}</span>`).join('')}</div></div></section>`;
  };
  return `<div class="cn-two">${box(m.teams[0], 0)}${box(m.teams[1], 1)}</div>`;
}

function cpnAdvHtml(m) {
  const lu = cpnLineups(m), ti = CPN.lteam;
  const byNo = (i, no) => m.teams[i].pl.find(p => String(p.no) === String(no)) || { name: '#' + no, short: '#' + no };
  const stack = (i, nos, size) => `<span class="cn-stack">${nos.map(no => { const p = byNo(i, no); return cpnFaceHtml(p.pid, p.name, size).replace('class="cn-face', 'title="' + esc(p.short) + '" class="cn-face'); }).join('')}</span>`;
  let left;
  if (!lu) left = '<div class="cn-empty">Lineups show once the starting fives are in the feed.</div>';
  else {
    const maxPm = Math.max(8, ...lu.units[ti].map(u => Math.abs(u.pf - u.pa)));
    left = `<div class="cn-now">
        <div>${stack(0, lu.now[0], 30)}<span class="cn-dim">${esc(m.teams[0].code)} ${m.fin ? 'finished' : 'on court'}</span></div>
        <span class="cn-lab">${m.fin ? 'END' : 'NOW'}</span>
        <div class="r">${stack(1, lu.now[1], 30)}<span class="cn-dim">${esc(m.teams[1].code)} ${m.fin ? 'finished' : 'on court'}</span></div>
      </div>
      <div class="cn-lrow cn-lrowh"><span>Five</span><span>MIN</span><span>Score</span><span>+/−</span></div>
      <div class="cn-scroll">${lu.units[ti].map(u => {
        const pm = u.pf - u.pa, w = Math.round(Math.min(Math.abs(pm), maxPm) / maxPm * 100);
        return `<div class="cn-lrow"><span class="cn-lwho">${stack(ti, u.nos, 24)}<span class="cn-dim">${u.nos.map(no => esc(byNo(ti, no).short)).join(', ')}</span></span>
          <span class="cn-num">${cpnMmss(u.secs)}</span><span class="cn-num cn-sub">${u.pf}–${u.pa}</span>
          <span class="cn-pm"><span class="neg"><i style="width:${pm < 0 ? w : 0}%"></i></span><b class="cn-num ${pm > 0 ? 'up' : pm < 0 ? 'dn' : ''}">${cpnSgn(pm)}</b><span class="pos"><i style="width:${pm > 0 ? w : 0}%"></i></span></span></div>`;
      }).join('') || '<div class="cn-empty">No five has played 30 seconds together yet.</div>'}</div>`;
  }
  const played = [];
  m.teams.forEach((tt, i) => tt.pl.filter(p => p.played).sort((x, y) => y.pts - x.pts).forEach(p => played.push({ p, i })));
  if (!CPN.sel || !played.some(x => x.p.pid === CPN.sel)) CPN.sel = played.length ? (played.slice().sort((x, y) => y.p.pts - x.p.pts)[0].p.pid || null) : null;
  const pick = played.find(x => x.p.pid === CPN.sel) || played[0];
  let right = '<div class="cn-empty">Player details show once the game starts.</div>';
  if (pick) {
    const p = pick.p, i = pick.i, col = m.teams[i].color, bio = p.pid ? cpnBio(p.pid, m.g.cid) : null, ss = cpnSeason(p.pid, m.g.cid);
    const oo = lu && lu.oo[i][p.no], fol = p.pid && CPN.follow === p.pid;
    const full = p.pid && PERSONS[p.pid] ? PERSONS[p.pid] : p.name;
    const fullTxt = full.indexOf(',') > 0 ? full.split(',')[1].trim() + ' ' + full.split(',')[0].trim() : full;
    const bits = [m.teams[i].code + ' #' + p.no, bio && bio.pos, bio && bio.ht ? bio.ht + ' cm' : '', bio && bio.age ? bio.age + ' years old' : '', bio && bio.nat === 'MAS' ? 'Malaysia' : ''].filter(Boolean).join(' · ');
    const ooMax = oo ? Math.max(8, Math.abs(oo.onPm), Math.abs(oo.offPm)) : 8;
    const ooRow = (k, pm, s) => `<div class="cn-oo"><span class="cn-dim">${k}</span><span class="neg"><i style="width:${pm < 0 ? Math.round(Math.abs(pm) / ooMax * 100) : 0}%"></i></span><b class="cn-num ${pm > 0 ? 'up' : pm < 0 ? 'dn' : ''}">${cpnSgn(pm)}</b><span class="pos"><i style="width:${pm > 0 ? Math.round(pm / ooMax * 100) : 0}%"></i></span><span class="cn-dim cn-num">${cpnMmss(s)}</span></div>`;
    const fg = p.fga ? 100 * p.fgm / p.fga : 0, ts = p.fga + p.fta ? 100 * p.pts / (2 * (p.fga + .44 * p.fta)) : 0;
    const vs = ss ? [['Points', p.pts, ss.pts, 40, String(p.pts), ss.pts.toFixed(1)], ['Rebounds', p.reb, ss.reb, 16, String(p.reb), ss.reb.toFixed(1)], ['Assists', p.ast, ss.ast, 12, String(p.ast), ss.ast.toFixed(1)],
      ['FG%', fg, ss.fg || 0, 100, p.fga ? Math.round(fg) + '%' : '–', ss.fg != null ? Math.round(ss.fg) + '%' : '–'], ['TS%', ts, ss.ts || 0, 100, p.fga + p.fta ? Math.round(ts) + '%' : '–', ss.ts ? Math.round(ss.ts) + '%' : '–']] : [];
    right = `<div class="cn-pick cn-scroll" role="listbox" aria-label="Choose a player">${played.map(({ p: q, i: j }) => {
        const src = cpnFace(q.pid), on = q.pid && q.pid === CPN.sel;
        return `<button type="button" role="option" aria-selected="${!!on}" data-cn="sel" data-v="${esc(q.pid || '')}" title="${esc(q.short)} (${esc(m.teams[j].code)})" class="cn-chip${on ? ' on' : ''}" style="--tc:${m.teams[j].color}">${src ? `<img src="${src}" alt="">` : esc(cpnInit(q.name))}</button>`;
      }).join('')}</div>
      <div class="cn-card cn-scroll">
        <div class="cn-cardh">${cpnFaceHtml(p.pid, p.name, 64)}<div><b>${esc(fullTxt)}</b><span class="cn-dim">${esc(bits)}</span></div>
          ${p.pid ? `<button type="button" class="cn-follow${fol ? ' on' : ''}" data-cn="follow" data-v="${esc(p.pid)}" aria-pressed="${!!fol}"><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>${fol ? 'Following' : 'Follow'}</button><a class="cn-link" href="#/p/${p.pid}">Profile</a>` : ''}</div>
        <div class="cn-tiles">${[['PTS', p.pts], ['REB', p.reb], ['AST', p.ast], ['STL', p.stl], ['BLK', p.blk]].map(([k, v]) => `<div><b class="cn-num">${v}</b><span>${k}</span></div>`).join('')}</div>
        <div class="cn-small">${[['MIN', p.min], ['FG', p.fgm + '/' + p.fga], ['3P', p.tpm + '/' + p.tpa], ['FT', p.ftm + '/' + p.fta], ['OREB', p.oreb], ['TOV', p.tov], ['Fouls', p.pf], ['+/−', cpnSgn(p.pm)]]
          .map(([k, v]) => `<span><span class="cn-dim">${k}</span><b class="cn-num">${esc(String(v))}</b></span>`).join('')}</div>
        ${oo ? `<h3>On / off court</h3>${ooRow('On court', oo.onPm, oo.onS)}${ooRow('Off court', oo.offPm, oo.offS)}` : ''}
        <h3>${ss ? 'vs MBL average, ' + esc(ss.label) + ' · ' + ss.g + ' GP' : 'No MBL season line yet'}</h3>
        ${vs.map(r => `<div class="cn-vs"><span class="cn-dim">${r[0]}</span><span class="bars"><span><i style="width:${Math.min(100, Math.round(r[1] / r[3] * 100))}%;background:${col}"></i></span><span><i style="width:${Math.min(100, Math.round(r[2] / r[3] * 100))}%"></i></span></span><span class="cn-num"><b>${r[4]}</b><span class="cn-dim"> / ${r[5]}</span></span></div>`).join('')}
        ${vs.length ? `<span class="cn-vkey"><i style="background:${col}"></i>This game<i></i>Season average</span>` : ''}
      </div>`;
  }
  return `<div class="cn-adv">
    <section class="cn-lineups" aria-label="Lineup comparison"><div class="cn-sech"><h2>Lineups</h2><span class="cn-dim">30 s or more together</span><span class="cn-grow"></span>
      ${cpnSeg('lteam', m.teams.map((tt, i) => [i, crest(tt.name, 14) + esc(tt.code)]), ti, 'cn-seg-s')}</div>${left}</section>
    <section class="cn-player" aria-label="Player detail">${right}</section></div>`;
}

/* ---------------------------- the shot chart ---------------------------- */
function cpnShotsShown(all) {
  return all.filter(s => (!CPN.sTeam || s.side === CPN.sTeam) && (!CPN.sPer || (CPN.sPer === 5 ? s.per > 4 : s.per === CPN.sPer)) && (CPN.sRes === 'all' || (CPN.sRes === 'made' ? s.made : !s.made)));
}
const CPN_COURT = `<g fill="none" stroke="rgba(255,255,255,.2)" stroke-width="5">
  <rect x="2.5" y="2.5" width="2795" height="1495"/><line x1="1400" y1="0" x2="1400" y2="1500"/><circle cx="1400" cy="750" r="180"/>
  <rect x="0" y="505" width="580" height="490"/><circle cx="580" cy="750" r="180"/><path d="M0 90 L299 90 A675 675 0 0 1 299 1410 L0 1410"/><path d="M157.5 625 A125 125 0 0 1 157.5 875"/>
  <line x1="120" y1="660" x2="120" y2="840" stroke="rgba(255,255,255,.5)" stroke-width="7"/><circle cx="157.5" cy="750" r="23" stroke="#FF6B1A" stroke-opacity=".8"/>
  <rect x="2220" y="505" width="580" height="490"/><circle cx="2220" cy="750" r="180"/><path d="M2800 90 L2501 90 A675 675 0 0 0 2501 1410 L2800 1410"/><path d="M2642.5 625 A125 125 0 0 0 2642.5 875"/>
  <line x1="2680" y1="660" x2="2680" y2="840" stroke="rgba(255,255,255,.5)" stroke-width="7"/><circle cx="2642.5" cy="750" r="23" stroke="#FF6B1A" stroke-opacity=".8"/></g>`;
function cpnZoneSvg(f) {
  return `<rect class="cn-zf" x="0" y="505" width="580" height="490" fill="${f.pt}"/>
    <g clip-path="url(#cn-in3)"><rect class="cn-zf" x="580" y="505" width="820" height="490" fill="${f.mc}"/><rect class="cn-zf" x="0" y="0" width="1400" height="505" fill="${f.mTop}"/><rect class="cn-zf" x="0" y="995" width="1400" height="505" fill="${f.mBot}"/></g>
    <g mask="url(#cn-out3)"><rect class="cn-zf" x="0" y="0" width="313" height="505" fill="${f.cTop}"/><rect class="cn-zf" x="0" y="995" width="313" height="505" fill="${f.cBot}"/><rect class="cn-zf" x="313" y="0" width="1087" height="505" fill="${f.wTop}"/><rect class="cn-zf" x="313" y="995" width="1087" height="505" fill="${f.wBot}"/><rect class="cn-zf" x="0" y="505" width="1400" height="490" fill="${f.t3}"/></g>`;
}
function cpnShotsHtml(m, stepped, par) {
  const { all, latest } = CPN_SHOTS, [h, a] = m.teams, col = s => m.teams[s - 1].color;
  const g = m.g, maxPer = Math.max(4, ...all.map(s => s.per));
  const filters = `<div class="cn-sfilters">
      ${cpnSeg('sTeam', [[0, 'Both'], [1, esc(h.code)], [2, esc(a.code)]], CPN.sTeam)}
      ${cpnSeg('sPer', [[0, 'All'], [1, 'Q1'], [2, 'Q2'], [3, 'Q3'], [4, 'Q4']].concat(maxPer > 4 ? [[5, 'OT']] : []), CPN.sPer, 'cn-seg-s')}
      ${cpnSeg('sRes', [['all', 'All shots'], ['made', 'Made'], ['miss', 'Missed']], CPN.sRes, 'cn-seg-s')}
      ${CPN.sPid ? `<button type="button" class="cn-who-chip" data-cn="sPid" data-v="">${cpnFaceHtml(CPN.sPid, personName(CPN.sPid), 22)}${esc(watchShort(personName(CPN.sPid)))}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" role="img" aria-label="Clear player"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
      <span class="cn-grow"></span>${cpnSeg('sMode', [['dots', 'Shots'], ['zones', 'Zones']], CPN.sMode)}</div>`;
  if (!all.length) {
    const msg = CPN.shots ? 'No shots yet. They appear here as they are taken.' : CPN.shotSrc === null && g.st !== 'COMPLETE' ? 'Loading the shot chart.' : 'Loading the shot chart.';
    return `<div class="cn-shots">${filters}<div class="cn-empty">${msg}</div></div>`;
  }
  const shown = cpnShotsShown(all), inPer = s => !CPN.sPer || (CPN.sPer === 5 ? s.per > 4 : s.per === CPN.sPer);
  const fg = arr => { let mm = 0; arr.forEach(s => { mm += s.made; }); return [mm, arr.length]; };
  const fj = fg(all.filter(s => s.side === 1 && inPer(s))), fp = fg(all.filter(s => s.side === 2 && inPer(s)));
  let court;
  if (CPN.sMode === 'zones') {
    const ZK = Object.keys(CPN_ZAVG), Z = { 1: {}, 2: {} };
    [1, 2].forEach(sd => { ZK.forEach(k => { Z[sd][k] = [0, 0]; }); all.filter(s => s.side === sd && inPer(s) && (!CPN.sPid || s.pid === CPN.sPid)).forEach(s => { Z[sd][s.z][0] += s.made; Z[sd][s.z][1]++; }); });
    const on = sd => !CPN.sTeam || CPN.sTeam === sd;
    const fill = (sd, k) => {
      const z = Z[sd][k];
      if (!on(sd)) return 'transparent';
      if (z[1] < 2) return 'rgba(255,255,255,.025)';
      const diff = 100 * z[0] / z[1] - CPN_ZAVG[k], al = Math.min(Math.abs(diff), 25) / 25;
      return diff >= 0 ? 'rgba(242,163,58,' + (.12 + al * .53).toFixed(2) + ')' : 'rgba(96,130,182,' + (.1 + al * .45).toFixed(2) + ')';
    };
    const F = sd => { const o = {}; ZK.forEach(k => { o[k] = fill(sd, k); }); return o; };
    const POS = { pt: [10.4, 50], mc: [26, 50], mTop: [15, 18], mBot: [15, 82], cTop: [5.6, 3], cBot: [5.6, 97], t3: [41, 50], wTop: [33, 13], wBot: [33, 87] };
    const labels = [1, 2].filter(on).map(sd => ZK.filter(k => Z[sd][k][1]).map(k => {
      const z = Z[sd][k], p = POS[k], x = sd === 1 ? p[0] : 100 - p[0], corner = k === 'cTop' || k === 'cBot';
      return `<span class="cn-zl${corner ? ' c' : ''}" style="left:${x}%;top:${p[1]}%"><b class="cn-num">${Math.round(100 * z[0] / z[1])}%</b><span class="cn-num">${z[0]}/${z[1]}</span></span>`;
    }).join('')).join('');
    court = `<svg viewBox="0 0 2800 1500" aria-hidden="true"><defs><clipPath id="cn-in3"><path d="M0 90 L299 90 A675 675 0 0 1 299 1410 L0 1410 Z"/></clipPath>
        <mask id="cn-out3" maskUnits="userSpaceOnUse" x="0" y="0" width="1400" height="1500"><rect x="0" y="0" width="1400" height="1500" fill="#fff"/><path d="M0 90 L299 90 A675 675 0 0 1 299 1410 L0 1410 Z" fill="#000"/></mask></defs>
        <g>${cpnZoneSvg(F(1))}</g><g transform="translate(2800 0) scale(-1 1)">${cpnZoneSvg(F(2))}</g>
        <g stroke="#08090B" stroke-width="8"><line x1="0" y1="505" x2="2800" y2="505"/><line x1="0" y1="995" x2="2800" y2="995"/><line x1="313" y1="0" x2="313" y2="90"/><line x1="313" y1="1410" x2="313" y2="1500"/><line x1="2487" y1="0" x2="2487" y2="90"/><line x1="2487" y1="1410" x2="2487" y2="1500"/></g>
        ${CPN_COURT}</svg>${labels}`;
  } else {
    const dots = shown.map(s => {
      const dim = CPN.sPid && s.pid !== CPN.sPid, isNew = s.i === latest && stepped;
      const what = (s.three ? '3-pt ' : '2-pt ') + (CPN_TYP[s.typ] || s.typ || 'shot').toLowerCase();
      return `<button type="button" class="cn-dot${s.made ? ' m' : ''}${isNew ? ' cn-shot-' + par : ''}${dim ? ' dim' : ''}${s.i === latest ? ' new' : ''}" data-cn="shot" data-v="${s.i}"
        aria-label="${esc(s.short + ', ' + what + ', ' + (s.made ? 'made' : 'missed') + (s.clock ? ', ' + (s.per > 4 ? 'OT' : 'Q' + s.per) + ' ' + s.clock : ''))}" style="left:${(s.cx * 100).toFixed(2)}%;top:${(s.cy * 100).toFixed(2)}%;--tc:${col(s.side)}"></button>`;
    }).join('');
    let lat = '';
    const ls = all[latest];
    if (ls && shown.indexOf(ls) >= 0 && !m.fin) {
      const right = ls.cx > .7;
      lat = `<span class="cn-rip" style="left:${(ls.cx * 100).toFixed(2)}%;top:${(ls.cy * 100).toFixed(2)}%"></span>
        <span class="cn-stag${stepped ? ' cn-tag-' + par : ''}" style="--tx:${right ? 'calc(-100% - 14px)' : '14px'};left:${(ls.cx * 100).toFixed(2)}%;top:calc(${(ls.cy * 100).toFixed(2)}% - 11px)"><b>${esc(ls.short)}</b><span class="${ls.made ? '' : 'miss'}">${ls.three ? '3PT' : '2PT'} ${ls.made ? 'MADE' : 'MISS'}</span></span>`;
    }
    court = `<svg viewBox="0 0 2800 1500" aria-hidden="true">${CPN_COURT}</svg>${dots}${lat}<div id="cn-tip"></div>`;
  }
  const logo = (name, sz) => crest(name, sz);
  const courtBox = `<div class="cn-courtcol">
      <div class="cn-courth"><span>${logo(h.name, 18)}<b>${esc(h.code)}</b><span class="cn-atk">attack this basket</span> <span class="cn-num cn-sub">${fj[0]}/${fj[1]} FG</span></span>
        <span><span class="cn-num cn-sub">${fp[0]}/${fp[1]} FG</span> <span class="cn-atk">attack this basket</span><b>${esc(a.code)}</b>${logo(a.name, 18)}</span></div>
      <div class="cn-court" id="cn-court" role="img" aria-label="Shot chart: ${esc(h.name)} ${fj[0]} of ${fj[1]} on the left basket, ${esc(a.name)} ${fp[0]} of ${fp[1]} on the right">${court}</div>
      <div class="cn-legend">${CPN.sMode === 'zones'
        ? `<span>Colder<i class="cn-grad"></i>Hotter than the MBL 2024 average for that spot</span>`
        : `<span><i class="cn-lm"></i>Made</span><span><i class="cn-lx"></i>Missed</span><span><i class="cn-ll"></i>Latest shot</span>`}
        <span class="cn-grow"></span><span><i class="cn-src"></i>Shot locations from FIBA LiveStats${CPN.shotSrc === 'saved' ? ' (saved after the game)' : ''}</span></div></div>`;
  // the panel: splits for both teams, then the shooters
  const ts = (sd, f) => all.filter(s => s.side === sd && inPer(s) && (!f || f(s)));
  const SPL = [['Field goals', null], ['2-pointers', s => !s.three], ['In the paint', s => s.z === 'pt'], ['Mid-range', s => !s.three && s.z !== 'pt'], ['3-pointers', s => s.three]];
  const splits = SPL.map(([k, f]) => {
    const x = fg(ts(1, f)), y = fg(ts(2, f)), xp = x[1] ? 100 * x[0] / x[1] : -1, yp = y[1] ? 100 * y[0] / y[1] : -1;
    const v = (r, p, w) => `<span class="cn-num${w ? ' w' : ''}"><b>${r[1] ? Math.round(p) + '%' : '–'}</b><span>${r[0]}/${r[1]}</span></span>`;
    return `<div class="cn-split"><span>${k}</span>${v(x, xp, xp >= yp && xp >= 0)}${v(y, yp, yp >= xp && yp >= 0)}</div>`;
  }).join('');
  const byP = {};
  all.filter(s => inPer(s) && (!CPN.sTeam || s.side === CPN.sTeam)).forEach(s => { const k = s.pid || s.side + '#' + s.no; (byP[k] = byP[k] || []).push(s); });
  const shooters = Object.keys(byP).sort((x, y) => byP[y].length - byP[x].length || fg(byP[y])[0] - fg(byP[x])[0]).map(k => {
    const arr = byP[k], r = fg(arr), s0 = arr[0], on = CPN.sPid && CPN.sPid === s0.pid, fresh = arr.some(s => s.i === latest);
    return `<button type="button" class="cn-shooter${on ? ' on' : ''}${CPN.sPid && !on ? ' dim' : ''}${fresh ? ' fresh' : ''}" data-cn="sPid" data-v="${esc(s0.pid || '')}" aria-pressed="${!!on}"${s0.pid ? '' : ' disabled'}>
      ${cpnFaceHtml(s0.pid, s0.name || s0.short, 28, col(s0.side))}<span class="cn-shn"><b>${esc(s0.short)}</b><span class="cn-seq">${arr.map(s => `<i class="${s.made ? 'm' : ''}${s.i === latest ? ' new' : ''}" style="--tc:${col(s.side)}"></i>`).join('')}</span></span>
      <span class="cn-num cn-shr"><b>${r[0]}/${r[1]}</b><span>${Math.round(100 * r[0] / r[1])}%</span></span></button>`;
  }).join('');
  return `<div class="cn-shots">${filters}<div class="cn-sbody">${courtBox}
    <aside class="cn-spanel cn-scroll" aria-label="Shooting"><div class="cn-split cn-splith"><h2>Shooting</h2>${logo(h.name, 18)}${logo(a.name, 18)}</div>${splits}
      <h2 class="cn-h2gap">Shooters</h2>${shooters}</aside></div></div>`;
}
function cpnPaintTip() {
  const el = document.getElementById('cn-tip');
  if (!el) return;
  const s = CPN.hs != null ? CPN_SHOTS.all[CPN.hs] : null, m = CPN_LAST;
  document.querySelectorAll('.cn-dot.hov').forEach(d => d.classList.remove('hov'));
  if (!s || !m || m.pre) { el.innerHTML = ''; return; }
  const dot = document.querySelector('.cn-dot[data-v="' + s.i + '"]');
  if (dot) dot.classList.add('hov');
  const flip = s.cx > .62, below = s.cy < .3;
  el.innerHTML = `<div class="cn-tip" style="${flip ? 'right:calc(' + ((1 - s.cx) * 100).toFixed(2) + '% + 14px)' : 'left:calc(' + (s.cx * 100).toFixed(2) + '% + 14px)'};${below ? 'top:calc(' + (s.cy * 100).toFixed(2) + '% - 10px)' : 'bottom:calc(' + ((1 - s.cy) * 100).toFixed(2) + '% - 10px)'}">
    <div class="cn-tiph">${cpnFaceHtml(s.pid, s.name || s.short, 34)}<span><b>${esc(s.short)} · ${esc(m.teams[s.side - 1].code)}</b><span>${(s.three ? '3-pt ' : '2-pt ') + esc((CPN_TYP[s.typ] || s.typ || 'shot').toLowerCase())}</span></span></div>
    <div class="cn-tipf cn-num"><b style="color:${s.made ? m.teams[s.side - 1].color : '#8A909C'}">${s.made ? 'Made' : 'Missed'}</b><span>${s.per > 4 ? 'OT' + (s.per - 4) : 'Q' + s.per}${s.clock ? ' ' + esc(s.clock) : ''}</span><span>${s.dist.toFixed(1)} m</span></div></div>`;
}

/* team stats: both teams, a split bar under each line */
function cpnCompareHtml(m) {
  const [h, a] = m.teams, H = h.tot, A = a.tot;
  if (!H || !A) return '';
  const pc = (x, y) => y ? Math.round(100 * x / y) : 0;
  const rows = [['Field goals', pc(H.fgm, H.fga), pc(A.fgm, A.fga), `${H.fgm}/${H.fga}  ${pc(H.fgm, H.fga)}%`, `${pc(A.fgm, A.fga)}%  ${A.fgm}/${A.fga}`],
    ['3-pointers', pc(H.tpm, H.tpa), pc(A.tpm, A.tpa), `${H.tpm}/${H.tpa}  ${pc(H.tpm, H.tpa)}%`, `${pc(A.tpm, A.tpa)}%  ${A.tpm}/${A.tpa}`],
    ['Free throws', pc(H.ftm, H.fta), pc(A.ftm, A.fta), `${H.ftm}/${H.fta}  ${pc(H.ftm, H.fta)}%`, `${pc(A.ftm, A.fta)}%  ${A.ftm}/${A.fta}`],
    ['Rebounds', H.reb, A.reb], ['Assists', H.ast, A.ast], ['Steals', H.stl, A.stl], ['Turnovers', H.tov, A.tov, null, null, true]];
  [['In the paint', 'paint'], ['Fast break', 'fast'], ['Bench', 'bench']].forEach(([l, k]) => { if (H[k] != null && A[k] != null) rows.push([l, +H[k], +A[k]]); });
  return `<div class="cn-cmph">${crest(h.name, 16)}<h2>Team stats</h2>${crest(a.name, 16)}</div>${rows.map(([l, x, y, dx, dy, low]) => {
    const hw = low ? x < y : x > y, aw = low ? y < x : y > x, tot = (x + y) || 1;
    return `<div class="cn-cmp"><div><span class="cn-num${hw ? ' w' : ''}">${esc(String(dx != null ? dx : x))}</span><span class="cn-dim">${l}</span><span class="cn-num r${aw ? ' w' : ''}">${esc(String(dy != null ? dy : y))}</span></div>
      <div class="cn-cbar"><i style="width:${(x / tot * 100).toFixed(1)}%;background:${h.color};opacity:${hw || x === y ? 1 : .35}"></i><i style="width:${(y / tot * 100).toFixed(1)}%;background:${a.color};opacity:${aw || x === y ? 1 : .35}"></i></div></div>`;
  }).join('')}`;
}

function cpnPaintFeed(m, stepped, par) {
  const [h, a] = m.teams;
  document.getElementById('cn-filters').innerHTML = [['all', 'All'], ['h', h.code], ['a', a.code], ['scoring', 'Scoring']].map(([v, l]) =>
    `<button type="button" data-cn="filter" data-v="${v}" aria-pressed="${CPN.filter === v}"${CPN.filter === v ? ' class="on"' : ''}>${esc(l)}</button>`).join('');
  // the run banner: a run going on, or one just ended
  const r = m.runNow && !m.fin ? m.runNow : null, ended = !r && m.prevRun && m.scores.length && m.scores[m.scores.length - 1] !== m.prevRun.to && m.scores[m.scores.length - 2] === m.prevRun.to;
  let run = '';
  if (r || ended) {
    const x = r || m.prevRun, t = m.teams[x.side - 1];
    const top = {};
    m.scores.filter(s => s.t >= x.from.t && s.t <= x.to.t && s.side === x.side).forEach(s => { const k = s.p.name || ''; top[k] = (top[k] || 0) + s.pts; });
    const best = Object.entries(top).sort((p, q) => q[1] - p[1])[0];
    const ender = ended ? m.scores[m.scores.length - 1] : null;
    run = `<div class="cn-run${stepped ? ' cn-in-' + par : ''}"><b class="cn-num" style="color:${t.color}">${x.pts}–0</b><span><span class="cn-lab">${ended ? 'Run ended' : esc(t.code) + ' run'}</span>
      <span>${ended ? esc(watchShort(ender.p.name) || m.teams[ender.side - 1].code) + ' scores · ' + esc(t.code) + ' had ' + x.pts + ' straight' : (best && best[0] ? esc(watchShort(best[0])) + (best[1] === x.pts ? ' all ' + best[1] : ' ' + best[1]) + ' · ' : '') + 'since ' + esc(cpnPer(x.from.p) + ' ' + cpnClock(x.from.p))}</span></span></div>`;
  }
  document.getElementById('cn-run').innerHTML = run;
  let feed = m.feed;
  if (CPN.filter === 'scoring') feed = feed.filter(x => x.scoring);
  else if (CPN.filter === 'h' || CPN.filter === 'a') feed = feed.filter(x => x.side === (CPN.filter === 'h' ? 1 : 2));
  let prevPer = null;
  const ol = document.getElementById('cn-feed'), top = ol.scrollTop;
  ol.innerHTML = feed.length ? feed.slice(0, 400).map((x, j) => {
    const div = x.per !== prevPer ? `<li class="cn-per-row">${esc(x.per)}</li>` : '';
    prevPer = x.per;
    const col = x.team ? m.teams[x.side - 1].color : '#5E636E', fol = x.pid && CPN.follow === x.pid;
    const face = x.name ? cpnFaceHtml(x.pid, x.name, 26) : `<span class="cn-face cn-init" style="width:26px;height:26px">${x.team ? crest(x.team.name, 18) : ''}</span>`;
    const who = x.name ? `<button type="button" class="cn-name" data-cn="sel" data-v="${esc(x.pid || '')}" data-side="${x.side}"${x.pid ? '' : ' disabled'}><i style="background:${fol ? '#F5C451' : col}"></i>${esc(x.short)}</button>`
      : `<b><i style="background:${col}"></i>${esc(x.team ? x.team.name : x.text)}</b>`;
    return div + `<li class="cn-play${x.scoring ? ' sc' : ''}${fol ? ' fol' : ''}${stepped && j === 0 && CPN.filter === 'all' ? ' cn-in-' + par : ''}">
      <span class="cn-num cn-pt">${esc(x.clock)}</span>${face}<span class="cn-ptx">${who}${x.name || x.team ? `<span>${esc(x.text)}</span>` : ''}</span>
      <span class="cn-num cn-ps">${esc(x.score)}</span></li>`;
  }).join('') : '<li class="cn-empty">No plays yet.</li>';
  if (top) ol.scrollTop = top;
  cpnPaintPill();
}
function cpnPaintPill() {
  const el = document.getElementById('cn-newpill');
  if (!el) return;
  const n = CPN.away ? Math.max(0, CPN.shown - CPN.seen) : 0;
  el.innerHTML = n ? `<button type="button" class="cn-pill" data-cn="newplays">${n} new play${n === 1 ? '' : 's'} ↑</button>` : '';
}
