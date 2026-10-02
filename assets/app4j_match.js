/* -------------------- Match detail: shared header + sub-tabs -------------------- */
/* One match now has three views — the box score, a FIBA-style play-by-play, and a
   computed team analysis. They share a header (crest · score · period breakdown)
   and a sub-tab bar. Play-by-play is scraped per game and only exists for games in
   DB.pbp; team analysis is computed from the box score, so it works for any game
   that has one. */

function matchGame(cid, mid) {
  const c = COMP_BY_ID[cid];
  return c ? c.games.find(x => x.mid === mid) : null;
}

/* Play-by-play is loaded per competition on demand. DB.pbpGames is the small list
   of match ids that have it; the compact data lives in pbp/<cid>.js, which calls
   pbpReg() when it arrives. */
const PBP_GAMES = new Set(DB.pbpGames || []);
const PBP_DATA = {};   // cid -> {P,A,G}
const PBP_ST = {};     // cid -> 'loading' | 'done' | 'error'
function hasPbp(mid) { return PBP_GAMES.has(mid); }
function pbpReg(cid, data) { PBP_DATA[cid] = data; PBP_ST[cid] = 'done'; }
function ensurePbp(cid) {
  if (PBP_ST[cid]) return;
  PBP_ST[cid] = 'loading';
  const s = document.createElement('script');
  s.src = 'pbp/' + cid + '.js';
  s.onload = () => { PBP_ST[cid] = PBP_DATA[cid] ? 'done' : 'error'; if (location.hash.indexOf('/pbp/') >= 0) softRoute(); };
  s.onerror = () => { PBP_ST[cid] = 'error'; if (location.hash.indexOf('/pbp/') >= 0) softRoute(); };
  document.head.appendChild(s);
}
function perLabel(p) {
  if (p === 'OT' || p === 'ot') return 'OT';
  const n = +p;
  return n >= 5 ? 'OT' + (n - 4) : 'Q' + p;
}
function fmtClk(clk) {
  if (!clk) return '';
  const p = String(clk).split(':');
  return p.length >= 2 ? p[0] + ':' + p[1] : clk;
}
function matchHead(cid, mid, tab) {
  const c = COMP_BY_ID[cid];
  const g = matchGame(cid, mid);
  const b = getBox(mid);
  const pbpOk = hasPbp(mid);
  const hasBox = !!(b && b.p && b.p.length);
  const periods = (b && b.periods && b.periods.length) ? b.periods : (DB.pbpPer && DB.pbpPer[mid]);
  const perTable = (periods && periods.length) ? `<div class="table-scroll"><table class="mper">
      <thead><tr><th class="left nosort">Team</th>${periods.map((p, i) => `<th class="nosort">${perLabel(String(i + 1))}</th>`).join('')}<th class="nosort" style="padding-right:20px;">Final</th></tr></thead>
      <tbody>
        <tr><td class="left"><div class="team">${crest(g.h)}${esc(g.h)}</div></td>${periods.map(p => `<td>${fmt0(p[0])}</td>`).join('')}<td style="padding-right:20px;font-weight:700;">${fmt0(g.hs)}</td></tr>
        <tr><td class="left"><div class="team">${crest(g.a)}${esc(g.a)}</div></td>${periods.map(p => `<td>${fmt0(p[1])}</td>`).join('')}<td style="padding-right:20px;font-weight:700;">${fmt0(g.as)}</td></tr>
      </tbody></table></div>` : '';
  const tabs = [['box', 'Box Score', hasBox], ['pbp', 'Play-by-play', pbpOk], ['manalysis', 'Team Analysis', hasBox]];
  const tabbar = `<div class="msub">${tabs.map(([k, l, ok]) =>
    `<a class="msub-t ${tab === k ? 'on' : ''} ${ok ? '' : 'msub-off'}" href="#/c/${cid}/${k}/${mid}">${l}</a>`).join('')}</div>`;
  return `<div class="page">
    <div class="crumb"><a href="#/c/${cid}/schedule">Games</a> / ${esc(g.h)} v ${esc(g.a)}</div>
    <div class="card mmatch">
      <div class="matchup-head">
        <div class="mside">${crest(g.h, 48)}<div><div class="m-name">${esc(g.h)}</div><div class="m-rec">${esc(fmtDate(g.date))}</div></div></div>
        <div class="m-mid"><div class="m-score">${fmt0(g.hs)} – ${fmt0(g.as)}</div><div class="m-status">${g.st === 'COMPLETE' ? (g.sb ? 'Final · score from the box score' : 'Final') : g.st === 'NOT_PLAYED' ? 'Not played' : esc(g.st)}</div>${phaseLabel(c, mid) ? `<div class="m-round"><span class="po-tag">${esc(phaseLabel(c, mid))}</span></div>` : ''}</div>
        <div class="mside right">${crest(g.a, 48)}<div><div class="m-name">${esc(g.a)}</div><div class="m-rec">${esc(g.venue || '')}</div></div></div>
      </div>
      ${perTable}
    </div>
    ${tabbar}`;
}

/* -------------------- Play-by-play (FIBA-style) -------------------- */
/* Names reach the page in two spellings ("Chong Kee, Damian Ghai" and "Damian Ghai
   Chong Kee"), so a name matches on its sorted set of words. */
function normName(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}
function renderPBP(cid, mid) {
  const g = matchGame(cid, mid);
  if (!g) return `<div class="page"><div class="card"><div class="note" style="border-top:none;">Game not found.</div></div></div>`;
  const head = matchHead(cid, mid, 'pbp');
  if (!hasPbp(mid)) return head + `<div class="card"><div class="empty-row"><span class="empty-dot"></span>Play-by-play for this game hasn't been captured yet — it's being rolled out competition by competition.</div></div></div>`;

  // the competition's compact file loads on demand; show a resting state while it arrives
  ensurePbp(cid);
  const data = PBP_DATA[cid];
  if (!data) {
    if (PBP_ST[cid] === 'error') return head + `<div class="card"><div class="empty-row"><span class="empty-dot"></span>Couldn't load the play-by-play for this competition.</div></div></div>`;
    return head + `<div class="card pbp-card"><div class="pbp-loading"><span class="pbp-spin"></span>Loading play-by-play…</div></div></div>`;
  }
  const rec = data.G[mid];
  if (!rec) return head + `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No play-by-play for this game.</div></div></div>`;
  const hc = teamColor(g.h), ac = teamColor(g.a);
  const pers = [...new Set(rec.e.map(e => String(e[0])))].sort((a, b) => (+a) - (+b));
  const tabbar = `<div class="pbp-tabs">
    <button class="pbp-tab on" data-pbpper="all">All</button>
    ${pers.map(p => `<button class="pbp-tab" data-pbpper="${esc(p)}">${perLabel(p)}</button>`).join('')}</div>`;
  // Who is who: the play-by-play names a player by [jersey, name]; the box score
  // carries the person id, so a player can link to their profile and, where the
  // site has a portrait, show it on a scoring card.
  const b = getBox(mid);
  const byNum = {}, byName = {};
  (b && b.p || []).forEach(l => {
    if (!l.pid) return;
    const side = l.team === g.h ? 1 : l.team === g.a ? 2 : 0;
    if (!side) return;
    if (l.num != null && l.num !== '') byNum[side + ':' + String(l.num)] = l.pid;
    const nm = l.name || personName(l.pid);
    if (nm) byName[side + ':' + normName(nm)] = l.pid;
  });
  const pidOf = (t, pl) => pl ? (byNum[t + ':' + String(pl[0])] || byName[t + ':' + normName(pl[1])] || null) : null;

  // "80-69": the scoring side's number carries the weight, as on FIBA's feed
  const scoreHtml = (run, t) => {
    const [h, a] = run.split('-');
    return t === 1 ? `<b>${esc(h)}</b> - ${esc(a)}` : t === 2 ? `${esc(h)} - <b>${esc(a)}</b>` : `${esc(h)} - ${esc(a)}`;
  };
  const who = (t, pl, pid) => {
    if (!pl) return '';
    const nm = pid ? `<a href="#/p/${pid}">${esc(pl[1])}</a>` : esc(pl[1]);
    return `${pl[0] ? `<span class="pbp-no">${esc(pl[0])}</span> ` : ''}<b class="pbp-nm">${nm}</b>`;
  };

  let run = '0-0', rh = 0, ra = 0;
  const rows = rec.e.map(e => {
    // compact event: [period, team, "MM:SS", playerIdx, actionIdx, "h-a"|""]
    const per = String(e[0]), t = e[1], clk = e[2], pi = e[3], act = data.A[e[4]] || '', sc = e[5];
    let pts = 0;
    if (sc) {
      const [h, a] = sc.split('-').map(Number);
      pts = t === 1 ? h - rh : t === 2 ? a - ra : 0;
      rh = h; ra = a; run = sc;
    }
    if (t === 0) {
      const big = /Game (start|end)|End of/i.test(act);
      return `<div class="pbprow pbp-neutral ${big ? 'big' : ''}" data-per="${esc(per)}"><span class="pbp-t">${esc(clk)}</span><span class="pbp-nb">${esc(act)}</span><span class="pbp-run">${scoreHtml(run, 0)}</span></div>`;
    }
    const pl = pi >= 0 ? data.P[pi] : null;   // [num, name]
    const side = t === 1 ? 'h' : 'a';
    const team = t === 1 ? g.h : g.a;
    const col = t === 1 ? hc : ac;
    const pid = pidOf(t, pl);
    if (sc && pts > 0) {
      // a scoring play gets the tall FIBA card: team panel with the clock, the
      // crest and the scorer's portrait (or their jersey number when there's none)
      const face = pid && PHOTOS[pid]
        ? `<a class="pbp-face" href="#/p/${pid}"><img src="${PHOTOS[pid]}" alt=""></a>`
        : (j => `<span class="pbp-jersey ${String(j).length > 2 ? 'long' : ''}">${esc(j)}</span>`)(pl && pl[0] ? pl[0] : (pl ? initials(pl[1]) : teamCode(team)));
      return `<div class="pbprow pbp-${side} pbp-big" data-per="${esc(per)}" style="--tc:${col}">
        <div class="pbp-side"><span class="pbp-t">${esc(clk)}</span><span class="pbp-crest">${crest(team, 22)}</span>${face}</div>
        <div class="pbp-main">
          <div class="pbp-who">${who(t, pl, pid) || esc(team)}</div>
          <div class="pbp-what"><span class="pbp-pts">+${pts}</span><span class="pbp-ac">${esc(act)}</span></div>
        </div>
        <span class="pbp-run on">${scoreHtml(run, t)}</span>
      </div>`;
    }
    const isSubOut = /Substitution out/i.test(act);
    return `<div class="pbprow pbp-${side}" data-per="${esc(per)}" style="--tc:${col}">
      <span class="pbp-t">${esc(clk)}</span>
      <span class="pbp-crest">${crest(team, 18)}</span>
      <span class="pbp-line">${who(t, pl, pid)} <span class="pbp-ac ${isSubOut ? 'sub-out' : ''}">${esc(act)}</span></span>
      <span class="pbp-run">${scoreHtml(run, 0)}</span>
    </div>`;
  }).join('');
  return head + `<div class="card pbp-card">${tabbar}<div class="pbpx" data-per="all">${rows}</div></div></div>`;
}

/* -------------------- Team analysis (computed from the box score) -------------------- */
function teamAgg(lines) {
  const g = {};
  ['pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'tov', 'stl', 'blk', 'pf']
    .forEach(k => g[k] = lines.reduce((a, l) => a + (parseFloat(l[k]) || 0), 0));
  g.reb = g.oreb + g.dreb;
  return g;
}
function pct(n, d) { return d ? (n / d * 100) : null; }
function fourFactors(t, opp) {
  return {
    efg: pct(t.fgm + 0.5 * t.tpm, t.fga),
    tsp: pct(t.pts, 2 * (t.fga + 0.44 * t.fta)),
    tov: pct(t.tov, t.fga + 0.44 * t.fta + t.tov),
    oreb: pct(t.oreb, t.oreb + opp.dreb),
    ftr: pct(t.ftm, t.fga),
  };
}
function renderMatchAnalysis(cid, mid) {
  const g = matchGame(cid, mid);
  if (!g) return `<div class="page"><div class="card"><div class="note" style="border-top:none;">Game not found.</div></div></div>`;
  const head = matchHead(cid, mid, 'manalysis');
  const b = getBox(mid);
  if (!b || !b.p || !b.p.length) return head + `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No box score is published for this game, so there's nothing to analyse.</div></div></div>`;
  const H = teamAgg(b.p.filter(l => l.team === g.h));
  const A = teamAgg(b.p.filter(l => l.team === g.a));
  const hf = fourFactors(H, A), af = fourFactors(A, H);

  // A comparison row: two values sharing a split bar (home fills from the left).
  const bar = (hv, av, hi) => {
    const tot = (hv || 0) + (av || 0);
    const hp = tot ? (hv / tot * 100) : 50;
    const hwin = hi ? hv >= av : hv <= av;
    return `<div class="ta-bars"><div class="ta-bar h ${hwin ? 'win' : ''}" style="width:${hp}%"></div><div class="ta-bar a ${!hwin ? 'win' : ''}" style="width:${100 - hp}%"></div></div>`;
  };
  const row = (label, hv, av, dec, hi) => {
    const f = v => v == null ? '—' : (dec ? fmt1(v) : fmt0(v));
    return `<div class="ta-row"><span class="ta-h">${f(hv)}</span><span class="ta-lab">${esc(label)}</span><span class="ta-a">${f(av)}</span></div>${bar(hv, av, hi !== false)}`;
  };
  const prow = (label, hn, hd, an, ad) => {
    const hp = pct(hn, hd), ap = pct(an, ad);
    return `<div class="ta-row"><span class="ta-h">${hp == null ? '—' : fmt1(hp) + '%'} <small>${fmt0(hn)}/${fmt0(hd)}</small></span><span class="ta-lab">${esc(label)}</span><span class="ta-a"><small>${fmt0(an)}/${fmt0(ad)}</small> ${ap == null ? '—' : fmt1(ap) + '%'}</span></div>${bar(hp, ap, true)}`;
  };

  return head + `<div class="ta-teams">
      <div class="ta-team"><div class="team">${crest(g.h, 24)}${esc(g.h)}</div></div>
      <div class="ta-team right"><div class="team">${esc(g.a)}${crest(g.a, 24)}</div></div>
    </div>
    <div class="card ta-card">
      <div class="card-head">Four Factors <span class="ta-note">the four things that decide a basketball game</span></div>
      ${row('Effective FG%', hf.efg, af.efg, true)}
      ${row('Turnover %', hf.tov, af.tov, true, false)}
      ${row('Offensive rebound %', hf.oreb, af.oreb, true)}
      ${row('Free-throw rate', hf.ftr, af.ftr, true)}
      ${row('True shooting %', hf.tsp, af.tsp, true)}
    </div>
    <div class="card ta-card">
      <div class="card-head">Shooting</div>
      ${prow('Field goals', H.fgm, H.fga, A.fgm, A.fga)}
      ${prow('2-pointers', H.twopm, H.twopa, A.twopm, A.twopa)}
      ${prow('3-pointers', H.tpm, H.tpa, A.tpm, A.tpa)}
      ${prow('Free throws', H.ftm, H.fta, A.ftm, A.fta)}
    </div>
    <div class="card ta-card">
      <div class="card-head">Possession & the glass</div>
      ${row('Points', H.pts, A.pts)}
      ${row('Rebounds', H.reb, A.reb)}
      ${row('Offensive rebounds', H.oreb, A.oreb)}
      ${row('Assists', H.ast, A.ast)}
      ${row('Steals', H.stl, A.stl)}
      ${row('Blocks', H.blk, A.blk)}
      ${row('Turnovers', H.tov, A.tov, false, false)}
      ${row('Fouls', H.pf, A.pf, false, false)}
    </div>
    <div class="card"><div class="note" style="border-top:none;">Four Factors and shooting splits are computed from the published box score. Effective FG% credits a three as worth 1.5 twos; turnover and rebound rates are per possession; free-throw rate is free throws made per field-goal attempt. A filled bar marks the team ahead in that row.</div></div>
  </div>`;
}
