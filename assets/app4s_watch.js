/* =========================================================================
   Watch page — #/watch/<mid>: the broadcast and the game's numbers on one screen.

     ┌──────────────────────────────┬──────────────┐
     │                              │ Team         │
     │  the game (YouTube)          │ statistics   │
     │                              │              │
     ├──────────────┬───────────────┼──────────────┤
     │ Players A    │ Players B     │ Play-by-play │
     └──────────────┴───────────────┴──────────────┘

   Which video belongs to which game is kept by hand in data/streams.json
   ({match id: YouTube link}); build_site.py turns the links into video ids
   (DB.streams). A game without a video still opens, with the numbers only.

   The numbers come from the live relay while the game is on (the same feed as
   the live game page, app4n_live.js — this page rides on its 30 s tick) and
   from the database once the game is in it: the box score, the quarter scores
   and the play-by-play file of the competition (pbp/<cid>.js, loaded on demand).

   Only the four stats panels are repainted on a tick. The video is never
   touched, so it keeps playing.
   ========================================================================= */

const STREAMS = DB.streams || {};
function watchStream(mid) { return STREAMS[mid] || null; }
/* a "Watch" link for the box-score header, the live page and Home's live cards */
function watchLink(mid, label, cls) {
  if (!watchStream(mid)) return '';
  return `<a class="${cls || 'm-watch'}" href="#/watch/${esc(mid)}"><svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>${esc(label || 'Watch with live stats')}</a>`;
}

/* A short name for a narrow column:
     "Chee Wei Lim" → "C.W. Lim"             (Chinese order: the surname is last)
     "Khai Chiek, John Wong" → "J. Wong"     (the English name after the comma)
     "Eman Ajmal Bin Jamal" → "E. Ajmal"     (a father's name after bin / binti / A/L / A/P is dropped,
     "Muhammad Zharif Mohd Nasir" → "M. Zharif"  and a name of four words or more is read the same way)
   "Bin" is also a Chinese given name ("Wen Bin Lok"), so it only counts after two words. */
function watchShort(name) {
  let s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.includes(',')) s = s.split(',').slice(1).join(' ').trim() || s.split(',')[0].trim();
  let w = s.split(' ').filter(Boolean);
  const cut = w.findIndex((x, i) => /^(A\/L|A\/P|S\/O|D\/O)$/i.test(x) || (i >= 2 && /^(Bin|Binti|Bt|Bte)$/i.test(x)));
  const given = cut > 0 || w.length >= 4;
  if (cut > 0) w = w.slice(0, cut);
  if (w.length < 2) return w[0] || '';
  if (given) return w[0][0].toUpperCase() + '. ' + w[1];
  return w.slice(0, -1).map(x => x[0].toUpperCase() + '.').join('') + ' ' + w[w.length - 1];
}
/* a team's short code: a short name as it is ("PDRM", "ATM"), a long one as the site abbreviates it */
function watchCode(name) {
  const n = String(name || '').trim();
  return n.length <= 5 && !/\s/.test(n) ? n.toUpperCase() : teamCode(n);
}
function watchFace(pid, name, side, big) {
  const src = pid && ((DB.avatars || {})[pid] || PHOTOS[pid]);
  const cls = 'wt-face wt-s' + side + (big ? ' wt-face-l' : '');
  return src ? `<span class="${cls}"><img src="${src}" alt=""></span>`
    : `<span class="${cls} wt-init">${esc(initials(watchShort(name).replace(/\./g, ' ')))}</span>`;
}

/* Timeouts a team may take in a game: 5 under FIBA rules (2 in the first half, 3 in the second),
   plus 1 for each overtime. The Selangor Basketball League's U20 plays with 7. */
const WATCH_TIMEOUTS = { '48654': 7 };
function watchTimeoutsAllowed(cid, ots) {
  const c = COMP_BY_ID[cid], nm = c ? (c.label || c.name || '') : '';
  const base = WATCH_TIMEOUTS[cid] || (/\bSBL\b|Selangor Basketball League/i.test(nm) && /\bU20\b/i.test(nm) ? 7 : 5);
  return base + (ots || 0);
}
/* a timeout charged to a team (a media or official timeout is nobody's) */
function watchIsTeamTimeout(text) { return /timeout/i.test(text) && !/media|tv|official|commercial/i.test(text); }

/* ---------------------------- one model, two sources ---------------------------- */
/* { g, status: live|final|pending, label, at, teams: [{name, score, q, pl, tot, fouls}] ×2, plays, playsState } */
function watchModel(mid) {
  const g = GAME_BY_MID[mid];
  if (!g) return null;
  const x = LIVE.games[mid];
  return x && x.data && x.data.teams ? watchFromLive(g, x) : watchFromSaved(g, x);
}

function watchSum(pl) {
  const o = {};
  ['pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta']
    .forEach(k => { o[k] = pl.reduce((a, p) => a + (+p[k] || 0), 0); });
  return o;
}

function watchFromLive(g, x) {
  const d = x.data;
  const nameOf = (t, i) => {
    const u = String(t.name || '').toUpperCase();
    return u === String(g.h).toUpperCase() ? g.h : u === String(g.a).toUpperCase() ? g.a : (t.name || (i ? g.a : g.h));
  };
  const teams = d.teams.map((t, i) => {
    const name = nameOf(t, i);
    const pl = (t.pl || []).map(p => ({
      no: p.no, name: p.name, pid: livePid(g.cid, t.name, p.no),
      pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, on: !!p.on && d.status !== 'final',
      played: p.min !== '0:00' || p.pts > 0, min: p.min,
    }));
    return { name, code: t.code, score: t.score, q: t.q || [], fouls: t.fouls, pl, tot: Object.assign(watchSum(t.pl || []), t.tot || {}) };
  });
  const shot = p => p.type === '2pt' || p.type === '3pt' || p.type === 'freethrow';
  const plays = (d.plays || [])
    .filter(p => p.type !== 'substitution' && p.type !== 'foulon' && p.type !== 'period')   // a divider marks each period
    .map(p => {
      const t = p.team === 1 ? teams[0] : p.team === 2 ? teams[1] : null;
      const txt = livePlayText(p);
      return { per: livePeriod(p), clock: String(p.clock || '').replace(/^0(\d:)/, '$1'), side: p.team || 0, team: t ? t.name : '',
        name: p.name || '', pid: t ? livePid(g.cid, d.teams[p.team - 1].name, p.no) : null,
        text: p.name ? txt : livePlayCap(txt), score: p.score ? p.score[0] + '–' + p.score[1] : '',
        scoring: !!(p.scoring && p.made && shot(p)) };
    });
  // team fouls this period come from the scorer; timeouts are counted off the plays (relay v2 sends them all)
  const ot = /OVERTIME/i.test(d.periodType || '') || d.inOT;
  const ots = ot ? (d.period > 4 ? d.period - 4 : d.period) : 0;
  const full = d.v >= 2;
  teams.forEach((t, i) => {
    t.tf = d.teams[i].fouls != null ? +d.teams[i].fouls : null;
    t.toUsed = full ? (d.plays || []).filter(p => p.team === i + 1 && p.type === 'timeout' && watchIsTeamTimeout('timeout ' + (p.sub || ''))).length : null;
  });
  const status = d.status === 'final' ? 'final' : d.status === 'live' ? 'live' : 'pending';
  return { g, status, label: status === 'pending' ? liveTip(g) : liveClock(d), at: x.at, teams, plays, playsState: 'ok', live: true,
    perNow: livePeriod(d), toAllowed: watchTimeoutsAllowed(g.cid, ots) };
}

function watchFromSaved(g, x) {
  const b = getBox(g.mid);
  const lines = (b && b.p) || [];
  const per = (b && b.periods && b.periods.length) ? b.periods : (DB.pbpPer && DB.pbpPer[g.mid]) || [];
  const teams = [g.h, g.a].map((name, i) => {
    const pl = lines.filter(l => l.team === name).map(l => ({
      no: l.num, name: l.name || personName(l.pid), pid: l.pid,
      pts: +l.pts || 0, reb: (+l.oreb || 0) + (+l.dreb || 0), ast: +l.ast || 0, stl: +l.stl || 0, blk: +l.blk || 0,
      oreb: +l.oreb || 0, tov: +l.tov || 0, pf: +l.pf || 0, fgm: +l.fgm || 0, fga: +l.fga || 0, tpm: +l.tpm || 0,
      tpa: +l.tpa || 0, ftm: +l.ftm || 0, fta: +l.fta || 0, min: l.min || '0:00', on: false,
      played: !!(l.min && l.min !== '0:00' && l.min !== '00:00') || (+l.pts > 0),
    }));
    return { name, score: i ? g.as : g.hs, q: per.map(p => p[i]), pl, tot: pl.length ? watchSum(pl) : null };
  });

  // the play-by-play: the competition's file loads on demand and repaints this page when it lands
  let plays = [], playsState = 'none', perNow = '', toAllowed = null;
  if (typeof hasPbp === 'function' && hasPbp(g.mid)) {
    ensurePbp(g.cid);
    const data = PBP_DATA[g.cid], rec = data && data.G[g.mid];
    playsState = rec ? 'ok' : PBP_ST[g.cid] === 'loading' ? 'loading' : 'none';
    if (rec) {
      const byNum = {}, byName = {};
      lines.forEach(l => {
        const side = l.team === g.h ? 1 : l.team === g.a ? 2 : 0;
        if (!side || !l.pid) return;
        if (l.num != null && l.num !== '') byNum[side + ':' + l.num] = l.pid;
        byName[side + ':' + normName(l.name || personName(l.pid))] = l.pid;
      });
      // the last period played, its team fouls, and every timeout each team took
      const maxPer = Math.max(...rec.e.map(e => +e[0] || 0));
      teams.forEach(t => { t.tf = 0; t.toUsed = 0; });
      rec.e.forEach(e => {
        const t = e[1], act = String(data.A[e[4]] || '');
        if (t !== 1 && t !== 2) return;
        if (watchIsTeamTimeout(act)) teams[t - 1].toUsed++;
        else if (+e[0] === maxPer && e[3] >= 0 && /foul/i.test(act) && !/^foul on/i.test(act.trim())) teams[t - 1].tf++;
      });
      perNow = perLabel(String(maxPer));
      toAllowed = watchTimeoutsAllowed(g.cid, maxPer > 4 ? maxPer - 4 : 0);
      let rh = 0, ra = 0;
      const srcName = {};      // the source's own spelling keeps "bin" / "A/L", which the short names need
      rec.e.forEach(e => {
        // compact event: [period, team, "MM:SS", playerIdx, actionIdx, "h-a"|""]
        const t = e[1], act = String(data.A[e[4]] || '').replace(/\s+/g, ' ').trim(), sc = e[5];
        let pts = 0;
        if (sc) {
          const [h, a] = sc.split('-').map(Number);
          pts = t === 1 ? h - rh : t === 2 ? a - ra : 0;
          rh = h; ra = a;
        }
        if (!act || /^(Substitution|Foul on|Possession arrow|Period (start|end)|Game start)/i.test(act)) return;
        const pl = e[3] >= 0 ? data.P[e[3]] : null;
        const pid = pl && t ? (byNum[t + ':' + pl[0]] || byName[t + ':' + normName(pl[1])] || null) : null;
        if (pid && pl[1]) srcName[pid] = pl[1];
        plays.push({ per: perLabel(String(e[0])), clock: String(fmtClk(e[2]) || '').replace(/^0(\d:)/, '$1'), side: t,
          team: t === 1 ? g.h : t === 2 ? g.a : '', name: pl ? pl[1] : '', pid,
          text: watchActText(act), score: rh + '–' + ra, scoring: pts > 0 });
      });
      plays.reverse();                                            // newest first, as on the live page
      teams.forEach(t => t.pl.forEach(p => { if (srcName[p.pid]) p.src = srcName[p.pid]; }));
      plays.forEach(p => { if (p.pid && srcName[p.pid]) p.name = srcName[p.pid]; });
    }
  }
  const fin = g.st === 'COMPLETE';
  const status = fin ? 'final' : 'pending';
  const label = fin ? (g.hs == null ? 'Final · score not published' : 'Final') : g.st === 'NOT_PLAYED' ? 'Not played'
    : (x && x.err ? 'Live feed not answering' : liveTip(g));
  return { g, status, label, at: 0, teams, plays, playsState, live: false, perNow, toAllowed };
}

/* the database's action text: "3pt jump shot made" → "3pt jump shot, made"; a shot without "made" was missed */
function watchActText(act) {
  let s = act.charAt(0).toUpperCase() + act.slice(1);
  if (/\smade$/i.test(s)) return s.replace(/\s+made$/i, ', made');
  if (/^(2pt|3pt|free throw)/i.test(s)) return s + ', missed';
  return s;
}

/* ---------------------------- the page ---------------------------- */
function renderWatch(mid) {
  const g = GAME_BY_MID[mid];
  if (!g) {
    return `<div class="wt"><header class="wt-top">${watchBrand()}</header>
      <div class="wt-empty wt-empty-page">This game is not in the database. <a href="#/games">Browse the games</a>.</div></div>`;
  }
  // a game still to finish: ask the relay about it, whatever its tip-off time
  if (g.st !== 'COMPLETE' && g.st !== 'NOT_PLAYED' && !LIVE.games[mid]) {
    LIVE.games[mid] = { g, state: 'pending', data: null, at: 0 };
    setTimeout(liveTick, 0);
  }
  const m = watchModel(mid);
  const vid = watchStream(mid);
  const video = vid
    ? `<iframe src="https://www.youtube.com/embed/${esc(vid)}?rel=0&amp;modestbranding=1&amp;playsinline=1" title="${esc(g.h)} vs ${esc(g.a)} — video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`
    : `<div class="wt-novid"><div class="wt-novid-m">${crest(g.h, 40)}<span>${esc(g.h)}</span><i>vs</i><span>${esc(g.a)}</span>${crest(g.a, 40)}</div>
        <p>No broadcast is linked to this game yet. The numbers on this page still follow the game.</p></div>`;
  const other = g.st === 'COMPLETE' && getBox(mid) ? `<a href="#/c/${g.cid}/box/${mid}">Box score</a>` : `<a href="#/live/${mid}">Full live page</a>`;
  return `<div class="wt" id="wt" data-mid="${esc(mid)}">
    <header class="wt-top">
      ${watchBrand()}
      <span class="wt-crumb"><a href="#/c/${g.cid}">${esc(liveCompName(g.cid))}</a> · ${esc(g.h)} vs ${esc(g.a)}</span>
      <span id="wt-status">${watchStatus(m)}</span>
      <span class="wt-links">${other}</span>
    </header>
    <div class="wt-grid">
      <section class="wt-video" aria-label="Video">${video}</section>
      <div class="wt-players">
        <section class="wt-panel" id="wt-pa" aria-label="${esc(g.h)} player statistics">${watchPlayers(m, 0)}</section>
        <section class="wt-panel" id="wt-pb" aria-label="${esc(g.a)} player statistics">${watchPlayers(m, 1)}</section>
      </div>
      <div class="wt-side">
        <section class="wt-panel wt-team" id="wt-team" aria-label="Team statistics">${watchTeam(m)}</section>
        <section class="wt-panel wt-plays" id="wt-plays" aria-label="Play-by-play">${watchPlays(m)}</section>
      </div>
    </div>
  </div>`;
}
function watchBrand() {
  return `<a class="wt-brand" href="#/" title="HoopStatsMY home"><span class="wt-dot"></span>HOOPSTATS MY</a>`;
}
function watchStatus(m) {
  if (m.status === 'live') return `<span class="wt-tag wt-tag-live"><span class="wt-tag-d"></span>LIVE · ${esc(m.label)}</span>`;
  return `<span class="wt-tag">${esc(m.label)}</span>`;
}

/* repaint the stats, never the video; each list keeps its scroll position */
function watchRefresh() {
  const root = document.getElementById('wt');
  if (!root) return;
  const m = watchModel(root.dataset.mid);
  if (!m) return;
  const put = (id, html) => {
    const el = document.getElementById(id);
    if (!el) return;
    const sc = el.querySelector('.wt-scroll'), top = sc ? sc.scrollTop : 0;
    el.innerHTML = html;
    const sc2 = el.querySelector('.wt-scroll');
    if (sc2 && top) sc2.scrollTop = top;
  };
  put('wt-status', watchStatus(m));
  put('wt-pa', watchPlayers(m, 0));
  put('wt-pb', watchPlayers(m, 1));
  put('wt-team', watchTeam(m));
  put('wt-plays', watchPlays(m));
}

/* Player statistics A / B: short name, PTS REB AST STL BLK; the team's best in each column in bold */
function watchPlayers(m, i) {
  const t = m.teams[i], side = i + 1;
  const head = `<header class="wt-ph">${crest(t.name, 24)}<b>${esc(t.name)}</b><span class="wt-ph-score wt-num${watchLeads(m, i) ? '' : ' wt-lo'}">${t.score != null ? t.score : ''}</span></header>`;
  if (!t.pl.length) {
    return head + `<div class="wt-empty">${m.status === 'pending' ? 'The players show here once the game starts.' : 'No box score is published for this game.'}</div>`;
  }
  const K = ['pts', 'reb', 'ast', 'stl', 'blk'];
  const best = K.map(k => Math.max(...t.pl.map(p => +p[k] || 0)));
  // while the game is on, the five on court come first
  const rows = t.pl.slice().sort((a, b) => (b.on - a.on) || (b.played - a.played) || (b.pts - a.pts) || (b.reb - a.reb) || (minsToNum(b.min) - minsToNum(a.min)));
  const full = p => p.pid && PERSONS[p.pid] ? PERSONS[p.pid] : p.name;
  return head + `<div class="wt-pt" role="table" aria-label="${esc(t.name)} players">
    <div class="wt-pr wt-phead" role="row"><span role="columnheader">Player</span>${['PTS', 'REB', 'AST', 'STL', 'BLK'].map(h => `<span role="columnheader">${h}</span>`).join('')}</div>
    <div class="wt-scroll">${rows.map(p => {
      const nm = esc(watchShort(p.src || p.name) || p.name || '');
      const link = p.pid && PERSONS[p.pid] ? `<a class="wt-nm" href="#/p/${p.pid}" title="${esc(full(p))}">${nm}</a>` : `<span class="wt-nm" title="${esc(full(p))}">${nm}</span>`;
      return `<div class="wt-pr${p.played ? '' : ' wt-dnp'}" role="row">
        <span class="wt-who" role="cell">${watchFace(p.pid, full(p), side)}<span class="wt-no wt-num">${esc(p.no != null ? p.no : '')}</span>${link}${p.on ? '<span class="wt-court" title="On court"></span>' : ''}</span>
        ${K.map((k, j) => { const v = +p[k] || 0; return `<span role="cell" class="wt-num ${v && v === best[j] ? 'wt-cb' : v ? 'wt-c' : 'wt-c0'}">${v}</span>`; }).join('')}
      </div>`;
    }).join('')}</div></div>`;
}
function watchLeads(m, i) {
  const a = m.teams[i].score, b = m.teams[1 - i].score;
  return a == null || b == null || a >= b;
}

/* Team statistics: the score, the quarters and side-by-side bars */
function watchTeam(m) {
  const [h, a] = m.teams;
  const sb = `<div class="wt-sb">
      <div class="wt-sb-t">${crest(h.name, 40)}<span>${esc(h.name)}</span></div>
      <div class="wt-sb-mid">${h.score == null && a.score == null ? '<div class="wt-sb-score wt-sb-vs">vs</div>'
        : `<div class="wt-sb-score wt-num"><span class="${watchLeads(m, 0) ? '' : 'wt-lo'}">${h.score != null ? h.score : '–'}</span><i>–</i><span class="${watchLeads(m, 1) ? '' : 'wt-lo'}">${a.score != null ? a.score : '–'}</span></div>`}
        <div class="wt-sb-st${m.status === 'live' ? ' wt-live' : ''}">${esc(m.label)}</div></div>
      <div class="wt-sb-t">${crest(a.name, 40)}<span>${esc(a.name)}</span></div>
    </div>`;
  const qn = Math.max(h.q.length, a.q.length, 4);
  const ql = i => i < 4 ? 'Q' + (i + 1) : 'OT' + (i > 4 ? i - 3 : '');
  const qrow = t => `<div class="wt-qr"><span>${esc(watchCode(t.name))}</span>${Array.from({ length: qn }, (_, i) => `<span class="wt-num">${t.q[i] != null ? t.q[i] : ''}</span>`).join('')}<span class="wt-num wt-qt">${t.score != null ? t.score : ''}</span></div>`;
  const quarters = h.q.length || a.q.length ? `<div class="wt-q" style="--n:${qn + 1}"><div class="wt-qr wt-qh"><span></span>${Array.from({ length: qn }, (_, i) => `<span>${ql(i)}</span>`).join('')}<span>T</span></div>${qrow(h)}${qrow(a)}</div>` : '';

  const extra = quarters + watchFoulsTimeouts(m);
  const H = h.tot, A = a.tot;
  if (!H || !A) {
    return `<div class="wt-scroll wt-team-in"><h2 class="wt-h2">Team statistics</h2>${sb}${extra}
      <div class="wt-empty wt-empty-in">${m.status === 'pending' ? 'Team figures fill in once the game starts.' : 'No box score is published for this game.'}</div></div>`;
  }
  const pc = (x, y) => y ? Math.round(1000 * x / y) / 10 : 0;
  const rows = [
    ['Field goals', pc(H.fgm, H.fga), pc(A.fgm, A.fga), `${H.fgm}/${H.fga} · ${Math.round(pc(H.fgm, H.fga))}%`, `${A.fgm}/${A.fga} · ${Math.round(pc(A.fgm, A.fga))}%`],
    ['3-pointers', pc(H.tpm, H.tpa), pc(A.tpm, A.tpa), `${H.tpm}/${H.tpa} · ${Math.round(pc(H.tpm, H.tpa))}%`, `${A.tpm}/${A.tpa} · ${Math.round(pc(A.tpm, A.tpa))}%`],
    ['Free throws', pc(H.ftm, H.fta), pc(A.ftm, A.fta), `${H.ftm}/${H.fta} · ${Math.round(pc(H.ftm, H.fta))}%`, `${A.ftm}/${A.fta} · ${Math.round(pc(A.ftm, A.fta))}%`],
    ['Rebounds', H.reb, A.reb], ['Offensive rebounds', H.oreb, A.oreb], ['Assists', H.ast, A.ast],
    ['Steals', H.stl, A.stl], ['Blocks', H.blk, A.blk], ['Turnovers', H.tov, A.tov, null, null, true],
  ];
  // relay v2 adds the scorer's own team figures while a game is on
  [['Points in the paint', 'paint'], ['Fast-break points', 'fast'], ['Second-chance points', 'second'],
   ['Points off turnovers', 'offTov'], ['Bench points', 'bench'], ['Biggest lead', 'biggestLead']]
    .forEach(([l, k]) => { if (H[k] != null && A[k] != null) rows.push([l, +H[k], +A[k]]); });
  rows.push(['Fouls', H.pf, A.pf, null, null, true]);
  const bars = rows.map(([l, x, y, dx, dy, low]) => {
    const max = Math.max(x, y) || 1, hw = low ? x < y : x > y, aw = low ? y < x : y > x;
    return `<div class="wt-st"><div class="wt-st-top"><span class="wt-num${hw ? ' w' : ''}">${esc(dx != null ? dx : x)}</span><span class="l">${esc(l)}</span><span class="wt-num${aw ? ' w' : ''}">${esc(dy != null ? dy : y)}</span></div>
      <div class="wt-bar"><div><i class="h${hw || x === y ? '' : ' lo'}" style="width:${Math.round(x / max * 100)}%"></i></div><div><i class="a${aw || x === y ? '' : ' lo'}" style="width:${Math.round(y / max * 100)}%"></i></div></div></div>`;
  }).join('');
  return `<div class="wt-scroll wt-team-in"><h2 class="wt-h2">Team statistics</h2>${sb}${extra}
    <div class="wt-key"><span><i class="h"></i>${esc(h.name)}</span><span>${esc(a.name)}<i class="a"></i></span></div>
    <div class="wt-sts">${bars}</div></div>`;
}

/* Team fouls in the current quarter (the last one, once the game is over) and timeouts left.
   From the fifth team foul of a quarter every defensive foul gives free throws: "penalty" shows from four. */
function watchFoulsTimeouts(m) {
  if (m.status === 'pending') return '';
  const [h, a] = m.teams, fin = m.status === 'final';
  const rows = [];
  if (h.tf != null && a.tf != null) {
    const f = (t, side) => {
      const pen = t.tf >= 4 ? `<span class="wt-pen" title="${fin ? 'In the penalty' : 'In the penalty: every defensive foul gives free throws'}">penalty</span>` : '';
      return side ? `<span class="wt-tfv">${pen}<b class="wt-num">${t.tf}</b></span>` : `<span class="wt-tfv"><b class="wt-num">${t.tf}</b>${pen}</span>`;
    };
    rows.push(`<div class="wt-tfr">${f(h, 0)}<span class="l">Team fouls · ${esc(m.perNow || '')}${fin ? ' (last quarter)' : ''}</span>${f(a, 1)}</div>`);
  }
  if (m.toAllowed && h.toUsed != null && a.toUsed != null) {
    const n = m.toAllowed;
    const o = (t, side) => {
      const left = Math.max(0, n - t.toUsed);
      const pips = Array.from({ length: n }, (_, i) => `<i class="${(side ? i : n - 1 - i) < left ? 'on' : ''}"></i>`).join('');
      const lab = `<span class="wt-pips" role="img" aria-label="${left} of ${n} timeouts left">${pips}</span>`;
      return side ? `<span class="wt-tfv"><b class="wt-num">${left}</b>${lab}</span>` : `<span class="wt-tfv">${lab}<b class="wt-num">${left}</b></span>`;
    };
    rows.push(`<div class="wt-tfr">${o(h, 0)}<span class="l">Timeouts left · of ${n}</span>${o(a, 1)}</div>`);
  }
  return rows.length ? `<div class="wt-tf">${rows.join('')}</div>` : '';
}

/* Play-by-play: newest first, a divider for each period */
function watchPlays(m) {
  const n = m.plays.length;
  const head = `<div class="wt-plh"><h2 class="wt-h2">Play-by-play</h2><span>${n ? 'newest first · ' + n + (n === 1 ? ' play' : ' plays') : ''}</span></div>`;
  if (!n) {
    const msg = m.playsState === 'loading' ? '<span class="pbp-spin"></span>Loading play-by-play…'
      : m.status === 'pending' ? 'Plays show here once the game starts.' : 'No play-by-play is published for this game.';
    return head + `<div class="wt-empty">${msg}</div>`;
  }
  let prev = null;
  return head + `<ol class="wt-scroll wt-pl">${m.plays.map(p => {
    const div = p.per !== prev ? `<li class="wt-per">${esc(p.per)}</li>` : '';
    prev = p.per;
    const short = watchShort(p.name);
    const face = p.name ? watchFace(p.pid, p.pid && PERSONS[p.pid] ? PERSONS[p.pid] : p.name, p.side || 1)
      : `<span class="wt-face wt-face-t">${p.team ? crest(p.team, 22) : ''}</span>`;
    const who = p.name ? `${esc(short)}${p.team ? ' · ' + esc(watchCode(p.team)) : ''}` : esc(p.team || p.text);
    const what = p.name || p.team ? p.text : '';
    return div + `<li class="wt-play${p.scoring ? ' wt-sc' : ''}">${face}
      <div class="wt-pd"><span class="wt-pw">${who}</span>${what ? `<span class="wt-pt2">${esc(what)}</span>` : ''}</div>
      <div class="wt-ps"><b class="wt-num">${esc(p.score)}</b><small class="wt-num">${esc(p.per + ' ' + p.clock)}</small></div></li>`;
  }).join('')}</ol>`;
}
