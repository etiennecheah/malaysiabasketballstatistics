/* =========================================================================
   Companion — /watch/<mid>/ for MBL men's games from the 2025-26 season on.

   From that season MBL's video is on its own subscription platform
   (majorleague.com.my and the MBL apps). It can't be embedded here, so for
   these games the Watch page has no video: fans watch on MBL and keep this
   screen beside it. Every other game keeps the Watch page (app4s_watch.js).

     ┌───────────────────────── scoreboard ─────────────────────────┐
     ├───────────────────────── game flow ──────────────────────────┤
     ├──────────── players (Box score | Advanced) ─────┬── teams ───┤
     │                                                 │ play-by-   │
     └─────────────────────────────────────────────────┴── play ────┘

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
      else if (prevRun && prevRun.side !== side && scores[scores.length - 2] === prevRun.to) kicker = 'Ends a ' + prevRun.pts + '–0 run';
      moment = { kind: 'score', side, pid, kicker, who: watchShort(lastP.name) || tm.name, what: livePlayText(lastP),
        big: '+' + ls.pts, line: pl ? pl.pts + ' PTS' : '' };
    } else if (lastP.type === 'timeout' && side) {
      moment = { kind: 'timeout', side, pid: null, kicker: tm.name, who: 'Timeout', what: score[side - 1] - score[2 - side] >= 0 ? 'Up ' + (score[side - 1] - score[2 - side]) : 'Down ' + (score[2 - side] - score[side - 1]),
        big: String(timeouts[side - 1].left), line: timeouts[side - 1].left === 1 ? 'timeout left' : 'timeouts left' };
    } else if (lastP.type === 'foul' && side && foulsBy >= 5) {
      moment = { kind: 'out', side, pid, kicker: 'Fouled out', who: watchShort(lastP.name), what: livePlayText(lastP), big: '5', line: 'personal fouls' };
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

/* ---------------------------- the page ---------------------------- */
function renderCompanion(mid) {
  const g = GAME_BY_MID[mid];
  if (CPN.mid !== mid) {
    Object.assign(CPN, { mid, snaps: [], cur: null, shown: 0, target: 0, fetchedFinal: false, noFeed: false, prevStats: {}, prevScore: null,
      prevPlays: 0, sel: null, away: false, seen: 0, hov: null, view: 'box', sortBy: null, filter: 'all' });
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
      <a class="cn-brand" href="#/" title="HoopStatsMY home"><svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke="#F07A2E" stroke-width="2.5"/><path d="M2 14h24M14 2v24M5.5 5.5c4 4 4 13 0 17M22.5 5.5c-4 4-4 13 0 17" fill="none" stroke="#F07A2E" stroke-width="1.6"/></svg>HOOPSTATS MY</a>
      <span class="cn-crumb">${compCrest(c, 20)}<a href="#/c/${g.cid}">${esc(liveCompName(g.cid))}</a><span>${esc(g.h)} vs ${esc(g.a)}</span></span>
      <span class="cn-fresh" id="cn-fresh"></span>
      <span class="cn-delay"><span id="cn-dl">Delay</span><span class="cn-seg" role="group" aria-labelledby="cn-dl" id="cn-delay"></span></span>
      <button type="button" class="cn-btn" data-cp="fs" id="cn-fs" title="Hide the browser's tabs and address bar (Esc to leave)">${cpnFsIcon(false)}<span>Full screen</span></button>
      <a class="cn-mbl" id="cn-mbl" href="${CPN_MBL_URL}" target="_blank" rel="noopener"><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>Watch live on MBL<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 5h10v10M19 5L6 18"/></svg></a>
    </header>
    <div class="cn-grid">
      <section class="cn-score" id="cn-score" aria-label="Score"></section>
      <section class="cn-flow" id="cn-flow" aria-label="Game flow"></section>
      <section class="cn-players" aria-label="Players">
        <div class="cn-viewbar"><span class="cn-seg cn-seg-l" role="tablist" aria-label="Player statistics" id="cn-views"></span><span class="cn-viewnote" id="cn-viewnote"></span></div>
        <div class="cn-pbody" id="cn-pbody"></div>
      </section>
      <div class="cn-side">
        <section class="cn-panel cn-compare" id="cn-compare" aria-label="Team comparison"></section>
        <section class="cn-panel cn-plays" aria-label="Play-by-play">
          <div class="cn-ph"><h2>Play-by-play</h2><span class="cn-seg" role="group" aria-label="Show" id="cn-filters"></span></div>
          <div id="cn-run"></div>
          <div class="cn-feedwrap"><div id="cn-newpill"></div><ol class="cn-feed cn-scroll" id="cn-feed"></ol></div>
        </section>
      </div>
    </div>
  </div>`;
}
function cpnFsIcon(on) {
  return on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
}

function cpnMount() {
  const root = document.getElementById('cn');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  root.addEventListener('click', cpnClick);
  root.addEventListener('mousemove', e => {
    const ch = e.target.closest('#cn-chart');
    if (!ch) return;
    const r = ch.getBoundingClientRect(), x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    CPN.hov = x; cpnPaintFlow();
  });
  root.addEventListener('mouseleave', e => { if (e.target === root) { CPN.hov = null; cpnPaintFlow(); } }, true);
  root.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('#cn-chart') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#cn-chart'))) { CPN.hov = null; cpnPaintFlow(); } });
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
      if (b) b.innerHTML = cpnFsIcon(on) + '<span>' + (on ? 'Exit full screen' : 'Full screen') + '</span>';
    }));
  }
  const g = GAME_BY_MID[CPN.mid];
  if (g && (g.st === 'COMPLETE' || !liveCandidates().some(x => x.mid === g.mid))) cpnFetchOnce(g.mid);
  clearInterval(CPN.timer);
  CPN.timer = setInterval(cpnLoop, 1000);
  cpnRender(true);
  cpnLoop();
}

function cpnClick(e) {
  const b = e.target.closest('[data-cp]');
  if (!b) return;
  const a = b.dataset.cp, v = b.dataset.v;
  if (a === 'fs') {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const go = el.requestFullscreen || el.webkitRequestFullscreen; if (go) { const r = go.call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } }
    return;
  }
  if (a === 'delay') { CPN.delay = +v; cpnLs('hs-cpn-delay', String(CPN.delay)); CPN.cur = null; cpnLoop(); cpnRender(true); return; }
  if (a === 'view') { CPN.view = v; cpnRender(true); return; }
  if (a === 'sort') { CPN.sortBy = CPN.sortBy === v ? null : v; cpnRender(true); return; }
  if (a === 'filter') { CPN.filter = v; cpnRender(true); return; }
  if (a === 'lteam') { CPN.lteam = +v; cpnRender(true); return; }
  if (a === 'sel') { CPN.sel = v; CPN.view = 'adv'; if (b.dataset.side) CPN.lteam = +b.dataset.side - 1; cpnRender(true); return; }
  if (a === 'follow') { CPN.follow = CPN.follow === v ? null : v; cpnLs('hs-cpn-follow', CPN.follow); cpnRender(true); return; }
  if (a === 'newplays') { const f = document.getElementById('cn-feed'); if (f) f.scrollTo({ top: 0, behavior: 'smooth' }); CPN.away = false; cpnPaintPill(); }
}

/* ---------------------------- drawing ---------------------------- */
function cpnCurrentModel() {
  const g = GAME_BY_MID[CPN.mid];
  if (!g) return null;
  let d = CPN.cur ? CPN.cur.d : null;
  if (!d && (CPN.noFeed || (g.st === 'COMPLETE' && !CPN.snaps.length && CPN.fetchedFinal && CPN.noFeed))) d = cpnFromBox(g);
  if (!d) return { g, c: COMP_BY_ID[g.cid], pre: true };
  return cpnModel(g, d, CPN.shown);
}

let CPN_LAST = null;
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
  document.getElementById('cn-score').innerHTML = cpnScoreHtml(m, stepped, par);
  cpnPaintFlow();
  cpnPaintPlayers(m, stepped, par);
  document.getElementById('cn-compare').innerHTML = cpnCompareHtml(m);
  cpnPaintFeed(m, stepped, par);
  if (stepped && m.lastP) {
    const say = document.getElementById('cn-say');
    if (say) say.textContent = (m.lastP.name ? watchShort(m.lastP.name) + ', ' : '') + livePlayText(m.lastP) + '. ' + m.teams[0].name + ' ' + m.score[0] + ', ' + m.teams[1].name + ' ' + m.score[1] + '.';
  }
  CPN.prevScore = m.score.slice();
}

function cpnFresh() {
  const el = document.getElementById('cn-fresh');
  if (!el) return;
  const g = GAME_BY_MID[CPN.mid], x = LIVE.games[CPN.mid], m = CPN_LAST;
  let text, ring = '';
  if (m && m.fin) text = 'Final';
  else if (CPN.waiting > 0) text = 'Delay: first numbers in ' + CPN.waiting + ' s';
  else if (x && x.err && !(x && x.data)) text = 'Live feed not answering, retrying';
  else if (CPN.cur && CPN.cur.at) {
    const s = Math.max(0, Math.round((Date.now() - CPN.cur.at) / 1000));
    text = CPN.delay ? 'Delayed ' + CPN.delay + ' s' : 'Updated ' + (s < 5 ? 'just now' : s + ' s ago');
    ring = '<svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="rgba(148,163,190,.25)" stroke-width="2"/><circle cx="9" cy="9" r="7" fill="none" stroke="#F07A2E" stroke-width="2" stroke-dasharray="44" stroke-dashoffset="' + Math.min(44, s / 20 * 44).toFixed(1) + '" transform="rotate(-90 9 9)"/></svg>';
  } else text = g && g.st === 'COMPLETE' ? 'Loading the game' : 'Waiting for tip-off';
  el.innerHTML = ring + '<span>' + esc(text) + '</span>';
  el.title = 'The numbers refresh about every 15 seconds. Delay holds them back so they land with the MBL stream.';
  const mbl = document.getElementById('cn-mbl');
  if (mbl) mbl.hidden = !!(m && m.fin);
  if (m && m.pre && document.getElementById('cn-countdown')) document.getElementById('cn-countdown').textContent = cpnCountdown(m.g);
}
function cpnPaintDelay() {
  const el = document.getElementById('cn-delay');
  if (el) el.innerHTML = [[0, 'None'], [15, '15 s'], [30, '30 s'], [45, '45 s']].map(([v, l]) =>
    `<button type="button" data-cp="delay" data-v="${v}" aria-pressed="${CPN.delay === v}"${CPN.delay === v ? ' class="on"' : ''}>${l}</button>`).join('');
}
function cpnCountdown(g) {
  const s = liveStart(g);
  if (s == null) return '';
  const left = Math.round((s - Date.now()) / 1000);
  if (left <= 0) return 'Tip-off any moment';
  const d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), mi = Math.floor(left % 3600 / 60), se = left % 60;
  return d ? d + 'd ' + h + 'h ' + mi + 'm' : (h ? h + 'h ' : '') + ('0' + mi).slice(-2) + ':' + ('0' + se).slice(-2);
}

/* before tip-off: the two teams, the countdown and the rosters */
function cpnPaintPre(m) {
  const g = m.g, c = m.c;
  const side = (name, i) => `<div class="cn-team cn-team-${i ? 'a' : 'h'}" style="--tc:${cpnColor(name)}">
      ${crest(name, 64)}<div class="cn-tname"><b>${esc(name.toUpperCase())}</b></div></div>`;
  document.getElementById('cn-score').innerHTML = `${side(g.h, 0)}
    <div class="cn-mid"><span class="cn-per">${esc(liveTip(g))}</span><span class="cn-clock cn-num" id="cn-countdown">${esc(cpnCountdown(g))}</span><span class="cn-per">${g.st === 'COMPLETE' ? 'Final' : 'until tip-off'}</span></div>
    ${side(g.a, 1)}`;
  document.getElementById('cn-flow').innerHTML = `<div class="cn-empty">The game flow draws itself from tip-off.</div>`;
  document.getElementById('cn-views').innerHTML = '';
  document.getElementById('cn-viewnote').textContent = 'Rosters';
  const tid = n => Object.keys(c.roster || {}).find(t => String(TEAMS[t] || '').toUpperCase() === String(n).toUpperCase());
  const roster = (name, i) => {
    const rows = ((c.roster || {})[tid(name)] || []).slice().sort((a, b) => +a.num - +b.num);
    return `<section class="cn-panel cn-box" style="--tc:${cpnColor(name)}"><div class="cn-boxh">${crest(name, 22)}<b>${esc(name.toUpperCase())}</b></div>
      <div class="cn-scroll">${rows.length ? rows.map(r => `<div class="cn-row cn-row-r"><span class="cn-who">${cpnFaceHtml(r.pid, personName(r.pid), i + 1, 22)}<span class="cn-no cn-num">${esc(r.num)}</span>
        <a href="#/p/${r.pid}">${esc(watchShort(personName(r.pid)))}</a></span><span class="cn-dim">${esc(r.pos || '')}</span><span class="cn-dim cn-num">${r.ht ? esc(r.ht) + ' cm' : ''}</span></div>`).join('')
        : '<div class="cn-empty">The roster is not published yet.</div>'}</div></section>`;
  };
  document.getElementById('cn-pbody').innerHTML = `<div class="cn-two">${roster(g.h, 0)}${roster(g.a, 1)}</div>`;
  document.getElementById('cn-compare').innerHTML = '';
  document.getElementById('cn-filters').innerHTML = '';
  document.getElementById('cn-run').innerHTML = '';
  document.getElementById('cn-feed').innerHTML = `<li class="cn-empty">${CPN.noFeed ? 'No play-by-play is published for this game.' : 'Plays show here from tip-off.'}</li>`;
}

function cpnFaceHtml(pid, name, side, size) {
  const src = cpnFace(pid);
  return src ? `<span class="cn-face cn-s${side}" style="width:${size}px;height:${size}px"><img src="${src}" alt="" loading="lazy"></span>`
    : `<span class="cn-face cn-s${side} cn-init" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px">${esc(cpnInit(name || '?'))}</span>`;
}

function cpnScoreHtml(m, stepped, par) {
  const [h, a] = m.teams, prev = CPN.prevScore || m.score;
  const roll = i => stepped && m.score[i] !== prev[i] ? ' cn-roll-' + par : '';
  const pips = (t, right) => Array.from({ length: t.to.allow }, (_, i) => `<i class="${(right ? i >= t.to.allow - t.to.left : i < t.to.left) ? 'on' : ''}"></i>`).join('');
  const foulTags = (t, opp) => (t.fouls >= 4 ? `<span class="cn-tag cn-tag-b" title="${esc(opp.code)} shoot free throws on every foul">BONUS</span>` : t.fouls === 3 ? '<span class="cn-tag cn-tag-n">1 FOUL TO BONUS</span>' : '');
  const team = (t, i) => {
    const opp = m.teams[1 - i];
    const meta = `<span class="cn-meta">${i ? '' : `Team fouls <b class="cn-num">${t.fouls == null ? '–' : t.fouls}</b>${foulTags(t, opp)}`}
        <span class="cn-tos" role="img" aria-label="${t.to.left} of ${t.to.allow} timeouts left in this ${m.otNow ? 'overtime' : 'half'}">${i ? '' : 'Timeouts '}${pips(t, i)}${i ? ' Timeouts' : ''}</span>
        ${i ? `${foulTags(t, opp)}Team fouls <b class="cn-num">${t.fouls == null ? '–' : t.fouls}</b>` : ''}</span>`;
    return `<div class="cn-team cn-team-${i ? 'a' : 'h'}" style="--tc:${t.color}">
      ${crest(t.name, 64)}
      <div class="cn-tname"><b>${esc(t.name.toUpperCase())}</b>${meta}</div>
      <span class="cn-big cn-num"><span class="${roll(i).trim()}">${t.score}</span></span></div>`;
  };
  const qn = Math.max(4, h.q.length, a.q.length), ql = i => i < 4 ? 'Q' + (i + 1) : 'OT' + (i > 4 ? i - 3 : '');
  const qnow = m.fin ? -1 : (m.otNow ? 3 + (m.perNow > 4 ? m.perNow - 4 : m.perNow) : m.perNow - 1);
  const qrow = t => `<span class="cn-qt" style="color:${t.color}">${esc(t.code)}</span>` + Array.from({ length: qn }, (_, i) => `<span class="cn-num${i === qnow ? ' now' : ''}">${t.q[i] != null ? t.q[i] : ''}</span>`).join('');
  const lead = m.score[0] - m.score[1];
  const leadText = m.fin ? (lead ? (lead > 0 ? h.code : a.code) + ' win by ' + Math.abs(lead) : 'Tied') : lead === 0 ? 'Tied' : (lead > 0 ? h.code : a.code) + ' lead by ' + Math.abs(lead);
  // the swing over the last five minutes of play
  const at = t => { let v = 0; m.flow.forEach(([ft, fv]) => { if (ft <= t) v = fv; }); return v; };
  const swing = m.fin ? 0 : at(m.tNow) - at(m.tNow - 300);
  const per = m.fin ? (m.otNow ? 'After overtime' : 'Full time') : m.otNow ? 'Overtime' + (m.perNow > 5 ? ' ' + (m.perNow - 4) : '') : ['1st', '2nd', '3rd', '4th'][m.perNow - 1] + ' quarter';
  let card = '';
  const mo = m.moment;
  if (mo && stepped) {   // the card plays once, as the play lands; a repaint for a click doesn't bring it back
    const t = m.teams[mo.side - 1], face = cpnFace(mo.pid), fol = mo.pid && CPN.follow === mo.pid;
    card = `<div class="cn-moment cn-moment-${mo.side === 1 ? 'h' : 'a'}${stepped ? ' cn-wipe-' + (mo.side === 1 ? 'l' : 'r') + par : ''}" style="--tc:${t.color}">
      ${face ? `<img class="cn-mface${stepped ? ' cn-rise' + par : ''}" src="${face}" alt="">` : ''}
      <div class="cn-mtext"><span class="cn-mk">${fol ? 'Following · ' : ''}${esc(mo.kicker)}</span><b>${esc(mo.who)}</b><span>${esc(mo.what)}</span></div>
      <div class="cn-mbig"><b class="cn-num">${esc(mo.big)}</b><span class="cn-num">${esc(mo.line)}</span></div></div>`;
  }
  return `${team(h, 0)}
    <div class="cn-mid">
      ${m.live ? '<span class="cn-live"><i></i>LIVE</span>' : ''}
      <span class="cn-clock cn-num">${esc(m.clock)}</span><span class="cn-per">${esc(per)}</span>
      <span class="cn-leadrow"><span class="cn-lead" style="color:${lead > 0 ? h.color : lead < 0 ? a.color : '#F2F4F8'}">${esc(leadText)}</span>
      ${swing ? `<span class="cn-mom" title="Change in the lead over the last five minutes of play" style="--tc:${swing > 0 ? h.color : a.color}">Last 5 min: ${swing > 0 ? h.code : a.code} +${Math.abs(swing)}</span>` : ''}</span>
      <div class="cn-q" role="table" aria-label="Score by quarter" style="--n:${qn}"><span></span>${Array.from({ length: qn }, (_, i) => `<span class="cn-qh">${ql(i)}</span>`).join('')}${qrow(h)}${qrow(a)}</div>
    </div>
    ${team(a, 1)}${card}`;
}

function cpnPaintFlow() {
  const el = document.getElementById('cn-flow'), m = CPN_LAST;
  if (!el || !m || m.pre) return;
  const end = Math.max(2400, m.tNow, m.fin ? 0 : 2400), W = 1200, MID = 46;
  const maxAbs = Math.max(12, ...m.flow.map(f => Math.abs(f[1])));
  const K = 40 / maxAbs, x = t => (t / end * W).toFixed(1);
  const area = sign => {
    let d = 'M0 ' + MID, last = 0;
    m.flow.forEach(([t, v], i) => {
      const nxt = i + 1 < m.flow.length ? m.flow[i + 1][0] : m.tNow;
      const y = (MID - (sign > 0 ? Math.max(0, v) : Math.min(0, v)) * K).toFixed(1);
      d += ' L' + x(t) + ' ' + y + ' L' + x(nxt) + ' ' + y;
      last = nxt;
    });
    return d + ' L' + x(last) + ' ' + MID + ' Z';
  };
  const [h, a] = m.teams;
  const qlines = [600, 1200, 1800].concat(end > 2400 ? Array.from({ length: Math.round((end - 2400) / 300) }, (_, i) => 2400 + i * 300) : [])
    .map(t => `<line x1="${x(t)}" y1="0" x2="${x(t)}" y2="92" stroke="rgba(148,163,190,.14)"/>`).join('');
  const tag = (t, label, col, tip) => `<span class="cn-ftag" title="${esc(tip)}" style="left:${(t / end * 100).toFixed(2)}%;--tc:${col}">${esc(label)}</span>`;
  const tags = m.runs.map(r => tag((r.from.t + r.to.t) / 2, r.pts + '–0', m.teams[r.side - 1].color, m.teams[r.side - 1].code + ' ' + r.pts + '–0 run'))
    .concat([0, 1].filter(i => m.big[i] >= 10).map(i => {
      const at = m.flow.find(f => (i ? -f[1] : f[1]) === m.big[i]);
      return tag(at ? at[0] : 0, '+' + m.big[i], m.teams[i].color, 'Biggest lead: ' + m.teams[i].code + ' by ' + m.big[i]);
    })).join('');
  let hov = '';
  if (CPN.hov != null) {
    const t = CPN.hov * end;
    if (t <= m.tNow) {
      let v = 0; m.flow.forEach(([ft, fv]) => { if (ft <= t) v = fv; });
      const q = t < 2400 ? 'Q' + Math.min(4, Math.floor(t / 600) + 1) : 'OT' + (Math.floor((t - 2400) / 300) + 1);
      const rem = t < 2400 ? 600 - (t - Math.floor(t / 600) * 600) : 300 - ((t - 2400) % 300);
      hov = `<i class="cn-hline" style="left:${(CPN.hov * 100).toFixed(2)}%"></i><span class="cn-hbox cn-num" style="${CPN.hov > .8 ? 'right:' + ((1 - CPN.hov) * 100 + 1).toFixed(2) + '%' : 'left:calc(' + (CPN.hov * 100).toFixed(2) + '% + 8px)'}"><b>${v === 0 ? 'Tied' : (v > 0 ? h.code : a.code) + ' +' + Math.abs(v)}</b><span>${q} ${cpnMmss(rem)}</span></span>`;
    }
  }
  const leadTxt = i => m.big[i] ? m.teams[i].code + ' +' + m.big[i] : '–';
  const aheadI = m.ahead[0] >= m.ahead[1] ? 0 : 1;
  el.innerHTML = `<div class="cn-chartwrap">
      <div class="cn-chart" id="cn-chart">
        <svg viewBox="0 0 ${W} 92" preserveAspectRatio="none" role="img" aria-label="Lead over the game: ${esc(m.teams[0].name)} above the line, ${esc(m.teams[1].name)} below">
          <line x1="0" y1="${MID}" x2="${W}" y2="${MID}" stroke="rgba(148,163,190,.3)"/>${qlines}
          <path d="${area(1)}" fill="${h.color}" fill-opacity=".6"/><path d="${area(-1)}" fill="${a.color}" fill-opacity=".6"/>
        </svg>
        ${m.fin ? '' : `<i class="cn-head" style="left:${(m.tNow / end * 100).toFixed(2)}%"></i>`}${tags}${hov}
      </div>
      <div class="cn-qlabels"><span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span></div>
    </div>
    <div class="cn-fstats cn-num"><h2>Game flow</h2>
      <span>Time ahead</span><b>${m.ahead[aheadI] ? m.teams[aheadI].code + ' ' + cpnMmss(m.ahead[aheadI]) : '–'}</b>
      <span>Biggest lead</span><b>${m.big[0] >= m.big[1] ? leadTxt(0) : leadTxt(1)}</b>
      <span>Lead changes</span><b>${m.changes}</b>
      <span>${m.runNow && !m.fin ? 'Run now' : 'Best run'}</span><b>${(() => { const r = m.runNow && !m.fin ? m.runNow : m.runs.slice().sort((p, q) => q.pts - p.pts)[0]; return r ? m.teams[r.side - 1].code + ' ' + r.pts + '–0' : '–'; })()}</b>
    </div>`;
}

function cpnPaintPlayers(m, stepped, par) {
  document.getElementById('cn-views').innerHTML = [['box', 'Box score'], ['adv', 'Advanced']].map(([v, l]) =>
    `<button type="button" role="tab" data-cp="view" data-v="${v}" aria-selected="${CPN.view === v}"${CPN.view === v ? ' class="on"' : ''}>${l}</button>`).join('');
  document.getElementById('cn-viewnote').textContent = CPN.view === 'adv' ? (m.fin ? 'Full game' : 'Game so far') : '';
  const body = document.getElementById('cn-pbody');
  if (CPN.view === 'adv') { body.innerHTML = cpnAdvHtml(m); return; }
  const last = m.lastP, lastScorer = m.moment && m.moment.kind === 'score' ? m.moment.pid : null;
  const K = ['pts', 'reb', 'ast', 'stl', 'blk'];
  const sb = CPN.sortBy;
  const box = (t, i) => {
    const rows = t.pl.slice().sort((x, y) => (sb ? y[sb] - x[sb] : 0) || (y.on - x.on) || (y.played - x.played) || (y.pts - x.pts) || (y.reb - x.reb));
    return `<section class="cn-panel cn-box" style="--tc:${t.color}" aria-label="${esc(t.name)} players">
      <div class="cn-boxh">${crest(t.name, 22)}<b>${esc(t.name.toUpperCase())}</b>${sb ? '<button type="button" class="cn-link" data-cp="sort" data-v="' + sb + '">Back to on court first</button>' : '<span class="cn-dim">On court first</span>'}</div>
      <div class="cn-row cn-rowh"><span>Player</span>${K.map(k => `<button type="button" data-cp="sort" data-v="${k}" aria-sort="${sb === k ? 'descending' : 'none'}" title="Sort by ${k.toUpperCase()}"${sb === k ? ' class="on"' : ''}>${k.toUpperCase()}${sb === k ? ' ▾' : ''}</button>`).join('')}<span>Fouls</span></div>
      <div class="cn-scroll">${rows.map(p => {
        const prev = CPN.prevStats[i + ':' + p.no] || {};
        const fol = p.pid && CPN.follow === p.pid, just = stepped && lastScorer && p.pid === lastScorer;
        return `<div class="cn-row${p.on ? ' on' : ''}${p.played ? '' : ' dnp'}${fol ? ' fol' : ''}">
          <span class="cn-who">${cpnFaceHtml(p.pid, p.name, i + 1, 22)}<span class="cn-no cn-num">${esc(p.no)}</span>
            <button type="button" class="cn-name" data-cp="sel" data-v="${esc(p.pid || '')}" data-side="${i + 1}" title="${esc(p.pid && PERSONS[p.pid] ? PERSONS[p.pid] : p.name)}">${esc(p.short)}</button>
            ${fol ? '<svg class="cn-star" width="12" height="12" viewBox="0 0 24 24" role="img" aria-label="Following"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>' : ''}
            ${just && m.moment ? `<span class="cn-just">${esc(m.moment.big)}</span>` : ''}
            ${p.pf >= 5 ? '<span class="cn-out">FOULED OUT</span>' : ''}</span>
          ${K.map(k => `<span class="cn-num${p[k] ? '' : ' z'}${k === 'pts' ? ' b' : ''}${stepped && prev[k] != null && prev[k] !== p[k] ? ' cn-glow' + par : ''}">${p[k]}</span>`).join('')}
          <span class="cn-pf" role="img" aria-label="${p.pf} personal fouls">${[0, 1, 2, 3, 4].map(f => `<i class="${f < p.pf ? (p.pf >= 4 ? 'r' : 'y') : ''}"></i>`).join('')}</span></div>`;
      }).join('')}</div></section>`;
  };
  body.innerHTML = `<div class="cn-two">${box(m.teams[0], 0)}${box(m.teams[1], 1)}</div>`;
  m.teams.forEach((t, i) => t.pl.forEach(p => { CPN.prevStats[i + ':' + p.no] = { pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk }; }));
}

function cpnAdvHtml(m) {
  const lu = cpnLineups(m), t = m.teams[CPN.lteam], ti = CPN.lteam;
  const byNo = (i, no) => m.teams[i].pl.find(p => String(p.no) === String(no)) || { name: '#' + no, short: '#' + no };
  const stack = (i, nos, size) => `<span class="cn-stack">${nos.map(no => { const p = byNo(i, no); return cpnFaceHtml(p.pid, p.name, i + 1, size).replace('class="cn-face', 'title="' + esc(p.short) + '" class="cn-face'); }).join('')}</span>`;
  let left;
  if (!lu) left = '<div class="cn-empty">Lineups show once the starting fives are in the feed.</div>';
  else {
    const maxPm = Math.max(8, ...lu.units[ti].map(u => Math.abs(u.pf - u.pa)));
    const cur = m.fin ? null : lu.units.map((u, i) => u.find(x => x.nos.slice().sort().join() === lu.now[i].slice().sort().join()));
    left = `<div class="cn-onfloor">
        <div>${stack(0, lu.now[0], 30)}<span class="cn-dim">${cur && cur[0] ? cpnMmss(cur[0].secs) + ' together · ' + cur[0].pf + '–' + cur[0].pa : m.teams[0].code}</span></div>
        <b>${m.fin ? 'FINISHED' : 'ON COURT'}</b>
        <div class="r">${stack(1, lu.now[1], 30)}<span class="cn-dim">${cur && cur[1] ? cpnMmss(cur[1].secs) + ' together · ' + cur[1].pf + '–' + cur[1].pa : m.teams[1].code}</span></div>
      </div>
      <div class="cn-lrow cn-lrowh"><span>Top lineups</span><span>MIN</span><span>Score</span><span>+/−</span></div>
      <div class="cn-scroll">${lu.units[ti].map(u => {
        const pm = u.pf - u.pa, w = Math.round(Math.min(Math.abs(pm), maxPm) / maxPm * 100);
        return `<div class="cn-lrow"><span class="cn-lwho">${stack(ti, u.nos, 24)}<span class="cn-dim">${u.nos.map(no => esc(byNo(ti, no).short)).join(', ')}</span></span>
          <span class="cn-num">${cpnMmss(u.secs)}</span><span class="cn-num">${u.pf}–${u.pa}</span>
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
    const bits = ['#' + p.no, bio && bio.pos, bio && bio.ht ? bio.ht + ' cm' : '', bio && bio.age ? bio.age + ' years old' : '', bio && bio.nat === 'MAS' ? 'Malaysia' : ''].filter(Boolean).join(' · ');
    const ooMax = oo ? Math.max(8, Math.abs(oo.onPm), Math.abs(oo.offPm)) : 8;
    const ooRow = (k, pm, s) => `<div class="cn-oo"><span class="cn-dim">${k}</span><span class="neg"><i style="width:${pm < 0 ? Math.round(Math.abs(pm) / ooMax * 100) : 0}%"></i></span><b class="cn-num ${pm > 0 ? 'up' : pm < 0 ? 'dn' : ''}">${cpnSgn(pm)}</b><span class="pos"><i style="width:${pm > 0 ? Math.round(pm / ooMax * 100) : 0}%"></i></span><span class="cn-dim cn-num">${cpnMmss(s)}</span></div>`;
    const fg = p.fga ? 100 * p.fgm / p.fga : 0, ts = p.fga + p.fta ? 100 * p.pts / (2 * (p.fga + .44 * p.fta)) : 0;
    const vs = ss ? [['Points', p.pts, ss.pts, 40, String(p.pts), ss.pts.toFixed(1)], ['Rebounds', p.reb, ss.reb, 16, String(p.reb), ss.reb.toFixed(1)], ['Assists', p.ast, ss.ast, 12, String(p.ast), ss.ast.toFixed(1)],
      ['FG%', fg, ss.fg || 0, 100, p.fga ? Math.round(fg) + '%' : '–', ss.fg != null ? Math.round(ss.fg) + '%' : '–'], ['TS%', ts, ss.ts || 0, 100, p.fga + p.fta ? Math.round(ts) + '%' : '–', ss.ts ? Math.round(ss.ts) + '%' : '–']] : [];
    right = `<div class="cn-pick cn-scroll" role="listbox" aria-label="Choose a player">${played.map(({ p: q, i: j }) => {
        const src = cpnFace(q.pid), on = q.pid && q.pid === CPN.sel;
        return `<button type="button" role="option" aria-selected="${!!on}" data-cp="sel" data-v="${esc(q.pid || '')}" title="${esc(q.short)} (${esc(m.teams[j].code)})" class="cn-chip${on ? ' on' : ''}" style="--tc:${m.teams[j].color}">${src ? `<img src="${src}" alt="">` : esc(cpnInit(q.name))}</button>`;
      }).join('')}</div>
      <div class="cn-card cn-scroll">
        <div class="cn-cardh">${cpnFaceHtml(p.pid, p.name, i + 1, 76)}<div><b>${esc(fullTxt)}</b><span class="cn-dim">${esc(bits)}</span></div>
          ${p.pid ? `<button type="button" class="cn-follow${fol ? ' on' : ''}" data-cp="follow" data-v="${esc(p.pid)}" aria-pressed="${!!fol}"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>${fol ? 'Following' : 'Follow'}</button>` : ''}
          ${crest(m.teams[i].name, 34)}${p.pid ? `<a class="cn-link" href="#/p/${p.pid}">Profile</a>` : ''}</div>
        <div class="cn-tiles">${[['PTS', p.pts], ['REB', p.reb], ['AST', p.ast], ['STL', p.stl], ['BLK', p.blk]].map(([k, v]) => `<div><b class="cn-num">${v}</b><span>${k}</span></div>`).join('')}</div>
        <div class="cn-small">${[['MIN', p.min], ['FG', p.fgm + '/' + p.fga], ['3P', p.tpm + '/' + p.tpa], ['FT', p.ftm + '/' + p.fta], ['OREB', p.oreb], ['TOV', p.tov], ['Fouls', p.pf], ['+/−', cpnSgn(p.pm)]]
          .map(([k, v]) => `<span><span class="cn-dim">${k}</span><b class="cn-num">${esc(String(v))}</b></span>`).join('')}</div>
        ${oo ? `<h3>On / off court</h3>${ooRow('On court', oo.onPm, oo.onS)}${ooRow('Off court', oo.offPm, oo.offS)}` : ''}
        <h3>${ss ? 'vs. MBL average, ' + esc(ss.label) + ' · ' + ss.g + ' GP' : 'No MBL season line yet'}</h3>
        ${vs.map(r => `<div class="cn-vs"><span class="cn-dim">${r[0]}</span><span class="bars"><span><i style="width:${Math.min(100, Math.round(r[1] / r[3] * 100))}%;background:${col}"></i></span><span><i style="width:${Math.min(100, Math.round(r[2] / r[3] * 100))}%"></i></span></span><span class="cn-num"><b>${r[4]}</b><br><span class="cn-dim">${r[5]}</span></span></div>`).join('')}
        ${vs.length ? `<span class="cn-key"><i style="background:${col}"></i>This game<i></i>Season average</span>` : ''}
      </div>`;
  }
  return `<div class="cn-adv">
    <section class="cn-panel cn-lineups" aria-label="Lineup comparison"><div class="cn-ph"><h2>Lineup comparison</h2>
      <span class="cn-seg" role="group" aria-label="Team">${m.teams.map((tt, i) => `<button type="button" data-cp="lteam" data-v="${i}" aria-pressed="${ti === i}"${ti === i ? ' class="on"' : ''} style="--tc:${tt.color}">${crest(tt.name, 16)}${esc(tt.code)}</button>`).join('')}</span></div>${left}</section>
    <section class="cn-panel cn-player" aria-label="Player detail">${right}</section></div>`;
}

function cpnCompareHtml(m) {
  const [h, a] = m.teams, H = h.tot, A = a.tot;
  if (!H || !A) return '';
  const pc = (x, y) => y ? Math.round(100 * x / y) : 0;
  const rows = [['Field goals', pc(H.fgm, H.fga), pc(A.fgm, A.fga), `${H.fgm}/${H.fga} · ${pc(H.fgm, H.fga)}%`, `${A.fgm}/${A.fga} · ${pc(A.fgm, A.fga)}%`],
    ['3-pointers', pc(H.tpm, H.tpa), pc(A.tpm, A.tpa), `${H.tpm}/${H.tpa} · ${pc(H.tpm, H.tpa)}%`, `${A.tpm}/${A.tpa} · ${pc(A.tpm, A.tpa)}%`],
    ['Rebounds', H.reb, A.reb], ['Assists', H.ast, A.ast], ['Steals', H.stl, A.stl], ['Turnovers', H.tov, A.tov, null, null, true]];
  [['In the paint', 'paint'], ['Fast break', 'fast'], ['Bench', 'bench']].forEach(([l, k]) => { if (H[k] != null && A[k] != null) rows.push([l, +H[k], +A[k]]); });
  return `<h2>Team comparison</h2>${rows.map(([l, x, y, dx, dy, low]) => {
    const mx = Math.max(x, y) || 1, hw = low ? x < y : x > y, aw = low ? y < x : y > x;
    return `<div class="cn-cmp"><span class="cn-num${hw ? ' w' : ''}">${esc(String(dx != null ? dx : x))}</span><span class="bar l"><i style="width:${Math.round(x / mx * 100)}%;background:${h.color};opacity:${hw || x === y ? 1 : .4}"></i></span>
      <span class="cn-dim">${l}</span><span class="bar"><i style="width:${Math.round(y / mx * 100)}%;background:${a.color};opacity:${aw || x === y ? 1 : .4}"></i></span><span class="cn-num r${aw ? ' w' : ''}">${esc(String(dy != null ? dy : y))}</span></div>`;
  }).join('')}`;
}

function cpnPaintFeed(m, stepped, par) {
  const [h, a] = m.teams;
  document.getElementById('cn-filters').innerHTML = [['all', 'All'], ['h', h.code], ['a', a.code], ['scoring', 'Scoring']].map(([v, l]) =>
    `<button type="button" data-cp="filter" data-v="${v}" aria-pressed="${CPN.filter === v}"${CPN.filter === v ? ' class="on"' : ''}>${esc(l)}</button>`).join('');
  // the run banner: a run going on, or one just ended
  const r = m.runNow && !m.fin ? m.runNow : null, ended = !r && m.prevRun && m.scores.length && m.scores[m.scores.length - 1] !== m.prevRun.to && m.scores[m.scores.length - 2] === m.prevRun.to;
  let run = '';
  if (r || ended) {
    const x = r || m.prevRun, t = m.teams[x.side - 1];
    const top = {};
    m.scores.filter(s => s.t >= x.from.t && s.t <= x.to.t && s.side === x.side).forEach(s => { const k = s.p.name || ''; top[k] = (top[k] || 0) + s.pts; });
    const best = Object.entries(top).sort((p, q) => q[1] - p[1])[0];
    const ender = ended ? m.scores[m.scores.length - 1] : null;
    run = `<div class="cn-run${stepped ? ' cn-wipe-l' + par : ''}" style="--tc:${t.color}"><b class="cn-num">${x.pts}–0</b><span><b>${ended ? 'RUN ENDED' : esc(t.code) + ' RUN'}</b>
      <span>${ended ? esc(watchShort(ender.p.name) || m.teams[ender.side - 1].code) + ' ' + esc(livePlayText(ender.p)) : (best && best[0] ? esc(watchShort(best[0])) + (best[1] === x.pts ? ' all ' + best[1] : ' ' + best[1]) + ' · ' : '') + 'since ' + esc(cpnPer(x.from.p) + ' ' + cpnClock(x.from.p))}</span></span></div>`;
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
    const col = x.team ? m.teams[x.side - 1].color : '#5C6880', fol = x.pid && CPN.follow === x.pid;
    const face = x.name ? cpnFaceHtml(x.pid, x.name, x.side, 30) : `<span class="cn-face cn-init" style="width:30px;height:30px">${x.team ? crest(x.team.name, 22) : ''}</span>`;
    const who = x.name ? `<button type="button" class="cn-name" data-cp="sel" data-v="${esc(x.pid || '')}" data-side="${x.side}"${x.pid ? '' : ' disabled'}>${esc(x.short)}${x.team ? ' · ' + esc(x.team.code) : ''}</button>` : `<b>${esc(x.team ? x.team.name : x.text)}</b>`;
    return div + `<li class="cn-play${x.scoring ? ' sc' : ''}${fol ? ' fol' : ''}${stepped && j === 0 && CPN.filter === 'all' ? ' cn-drop' + par : ''}" style="--tc:${fol ? '#F5C451' : col}">
      <i class="bar"></i>${face}<span class="txt">${who}${x.name || x.team ? `<span>${esc(x.text)}</span>` : ''}</span>
      <span class="sc"><b class="cn-num">${esc(x.score)}</b><span class="cn-num">${esc(x.per + ' ' + x.clock)}</span></span></li>`;
  }).join('') : '<li class="cn-empty">No plays yet.</li>';
  if (top) ol.scrollTop = top;
  cpnPaintPill();
}
function cpnPaintPill() {
  const el = document.getElementById('cn-newpill');
  if (!el) return;
  const n = CPN.away ? Math.max(0, CPN.shown - CPN.seen) : 0;
  el.innerHTML = n ? `<button type="button" class="cn-pill" data-cp="newplays">${n} new play${n === 1 ? '' : 's'} ↑</button>` : '';
}
