/* =========================================================================
   MBL season page (#/mbl): everything about the current Major Basketball
   League season (men) on one page — the countdown or next game, the season's
   route by weekend, games, standings, teams and rosters (flip cards with the
   MBL career on the back), a height lineup, leaders, the records (single-game
   bests, big nights and streaks, this season or all-time, local or import),
   the milestone watch and the analysis (who scores and how, efficiency,
   rebounds, turnovers, free throws, discipline, players' volume and efficiency).
   The season is the newest MBL men's competition in the database; the header
   tab is named after it (MBL 2026/27). Built from what the page already holds:
   fixtures, standings rows, season lines and rosters. All names carry an mb-
   prefix; the module keeps its helpers to itself (one global: MB).
   ========================================================================= */
const MB = (() => {
  const SER = 'Major Basketball League';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const SHORT = {'NS Matrix Deers': 'NS Matrix', 'Penang Sunrise Youngsters': 'Penang', 'Johor Southern Tigers': 'Johor',
    'Selangor Hornbills': 'Selangor', 'Sarawak Cola Warriors': 'Sarawak', 'Putrajaya Parkcity Heat': 'Putrajaya', 'KL Titans': 'KL Titans',
    'Pegasus Sports': 'Pegasus', 'Singapore Adroit': 'Adroit', 'UCSI Rising Star': 'UCSI'};
  // each club's colour, read once from its crest (the main hue of its saturated pixels)
  const HUE = {'NS Matrix Deers': 45, 'KL Titans': 122, 'Penang Sunrise Youngsters': 4, 'Johor Southern Tigers': 216, 'Selangor Hornbills': 16,
    'Sarawak Cola Warriors': 30, 'Putrajaya Parkcity Heat': 20};
  const CITY = {PJ: 'Petaling Jaya', Johor: 'Johor Bahru'};
  const NAT = {MAS: 'Malaysia', USA: 'United States', BRA: 'Brazil', SWE: 'Sweden', UKR: 'Ukraine', GBR: 'Great Britain', ESP: 'Spain', AUS: 'Australia',
    PHI: 'Philippines', SGP: 'Singapore', TPE: 'Chinese Taipei', JPN: 'Japan', CHN: 'China', INA: 'Indonesia', NGR: 'Nigeria', SEN: 'Senegal',
    NZL: 'New Zealand', SSD: 'South Sudan', SUD: 'Sudan', RUS: 'Russia', BUL: 'Bulgaria', KEN: 'Kenya', ZIM: 'Zimbabwe', BOT: 'Botswana',
    COD: 'DR Congo', THA: 'Thailand', VIE: 'Vietnam', BRU: 'Brunei', HKG: 'Hong Kong'};
  const ST = {team: null, show: 'all', sort: 'num', sel: null, lead: null, mk: 'all', mh: 3, rs: null, rw: 'all', rb: null, rk: 'tpm', rm: 'best', rx: null, rswap: false, at: null, sec: 'mb-over', leg: null};
  let S = null, cdTimer = null, cdPrev = [], bound = false, JUMP = false;

  /* ---------- the season and its pieces ---------- */
  const mblComps = () => COMPS.filter(c => c.series === SER && c.gender !== 'Women').sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  function season() {
    const all = mblComps(), c = all[all.length - 1];
    if (!c) return null;
    const y = +c.year || +(c.start || '').slice(0, 4);
    const prev = all.filter(x => x !== c);
    const teams = (c.teams || []).map(tid => {
      const name = TEAMS[tid] || tid;
      const roster = ((c.roster || {})[tid] || []).map(r => Object.assign({}, r, {pid: r.pid}));
      return {tid, name, hue: hue(name), roster};
    });
    return {c, cid: c.id, y, title: `${y}/${String((y + 1) % 100).padStart(2, '0')}`, prev, teams, games: c.games || []};
  }
  function hue(n) { if (HUE[n] != null) return HUE[n]; let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
  const team = n => S.teams.find(t => t.name === n);
  const players = () => S.teams.flatMap(t => t.roster.map(p => Object.assign({team: t.name}, p)));
  const tipAt = g => new Date(g.date + 'T' + to24(g.time) + ':00+08:00');
  const done = g => g.st === 'COMPLETE' && g.hs != null && g.as != null;
  const phaseOf = g => (S.c.phase || {})[g.mid];
  function to24(t) { const x = /(\d+):(\d+)\s*([AP]M)?/i.exec(t || ''); if (!x) return '00:00'; let h = +x[1]; if (x[3]) h = h % 12 + (/p/i.test(x[3]) ? 12 : 0); return String(h).padStart(2, '0') + ':' + x[2]; }
  const hm = t => { let [h, m] = to24(t).split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; };
  const dm = iso => { const [, m, d] = iso.split('-'); return +d + ' ' + MON[+m - 1]; };
  const dlong = iso => { const x = new Date(iso + 'T12:00:00+08:00'); return DOW[x.getUTCDay()] + ' ' + dm(iso); };
  const range = (a, b) => { const [ya, ma, da] = a.split('-'), [yb, mb, db] = b.split('-');
    return ma === mb && ya === yb ? `${+da}–${+db} ${MON[+mb - 1]}` : `${+da} ${MON[+ma - 1]} – ${+db} ${MON[+mb - 1]}`; };
  const city = v => { const c = (v || '').includes(',') ? v.split(',').pop().trim() : (v || ''); return CITY[c] || c; };
  const short = n => SHORT[n] || n;
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const logo = n => teamLogo(n);
  const crestI = (n, sz) => { const l = logo(n); return l ? `<img class="mb-crest${crestPlate(n)}" src="${l}" alt="" width="${sz}" height="${sz}" loading="lazy" decoding="async">` : `<span class="mb-crest mb-crest-x" style="width:${sz}px;height:${sz}px;background:${teamColor(n)}"></span>`; };
  const face = (pid, name) => { const av = (DB.avatars || {})[pid] || PHOTOS[pid]; return av ? `<img src="${av}" alt="" loading="lazy" decoding="async">` : esc(initials(name || personName(pid))); };
  const flag = (c, w) => { const f = (DB.natflags || {})[c]; return f ? `<img class="mb-flag" src="${f}" alt="${esc(NAT[c] || c)}" width="${w}" height="${Math.round(w * .75)}" loading="lazy" decoding="async">` : (c ? `<span class="mb-flag mb-flag-x">${esc(c)}</span>` : ''); };
  const imp = p => !!(p.nat && p.nat !== 'MAS');
  const per = (o, k) => o && o.g ? (o[k] || 0) / o.g : 0;

  // weekends: games no more than two days apart travel together
  function legs() {
    const gs = [...S.games].sort((a, b) => tipAt(a) - tipAt(b)), out = [];
    gs.forEach(g => {
      const L = out[out.length - 1];
      if (L && (new Date(g.date) - new Date(L.to)) / 864e5 <= 2) { L.games.push(g); L.to = g.date; }
      else out.push({games: [g], from: g.date, to: g.date});
    });
    out.forEach((L, i) => { L.i = i + 1; L.cities = [...new Set(L.games.map(g => city(g.venue)))]; });
    return out;
  }
  function standings() {
    const R = {};
    S.teams.forEach(t => R[t.name] = {team: t.name, gp: 0, w: 0, l: 0, pf: 0, pa: 0, res: []});
    [...S.games].sort((a, b) => tipAt(a) - tipAt(b)).forEach(g => {
      if (!done(g) || phaseOf(g) || !R[g.h] || !R[g.a]) return;
      const hw = +g.hs > +g.as;
      [[g.h, +g.hs, +g.as, hw], [g.a, +g.as, +g.hs, !hw]].forEach(([n, f, a, w]) => { const r = R[n]; r.gp++; r[w ? 'w' : 'l']++; r.pf += f; r.pa += a; r.res.push(w ? 'w' : 'l'); });
    });
    const rows = Object.values(R).map(r => Object.assign(r, {pct: r.gp ? r.w / r.gp : 0, diff: r.pf - r.pa}));
    rows.sort((a, b) => b.pct - a.pct || b.diff - a.diff || b.w - a.w || a.team.localeCompare(b.team));
    const top = rows[0];
    rows.forEach(r => r.gb = ((top.w - r.w) + (r.l - top.l)) / 2);
    return rows;
  }
  // this season's lines, and every MBL season's added up (this one included)
  const seasonLine = pid => (S.c.players || []).find(r => r.pid === pid && r.g);
  let CAR = null;
  function careers() {
    if (CAR) return CAR;
    CAR = {};
    mblComps().forEach(c => (c.players || []).forEach(r => {
      if (!r.g) return;
      const o = CAR[r.pid] = CAR[r.pid] || {g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0, n: 0};
      o.n++; ['g', 'pts', 'reb', 'ast', 'stl', 'blk', 'tpm'].forEach(k => { o[k] += +r[k] || 0; });
    }));
    return CAR;
  }
  const career = pid => careers()[pid] || null;

  /* ---------- hero ---------- */
  function hero() {
    const ps = players(), gs = [...S.games].sort((a, b) => tipAt(a) - tipAt(b));
    const [a, b] = S.title.split('/');
    const nDone = gs.filter(done).length, mark = COMPLOGOS['mbl-mark'] || COMPLOGOS.mbl;
    return `<section class="mb-hero" aria-label="Season">
      <svg class="mb-court" viewBox="0 0 640 460" aria-hidden="true"><line x1="40" y1="20" x2="600" y2="20"/><line x1="40" y1="20" x2="40" y2="440"/><line x1="600" y1="20" x2="600" y2="440"/><path d="M70 20 V110 A250 250 0 0 0 570 110 V20"/><path d="M250 20 V230 H390 V20"/><circle cx="320" cy="230" r="60"/><circle cx="320" cy="62" r="12"/><path d="M220 440 A100 100 0 0 1 420 440"/></svg>
      <div class="mb-hero-in"><div>
        <div class="mb-brand">${mark ? `<img src="${mark}" alt="MBL" width="110" height="45">` : ''}<span class="mb-eye">Major Basketball League<br><em>Season ${esc(S.title)}</em></span></div>
        <h1 class="mb-title"><span>MBL</span><span class="mb-yr">${esc(a)}<em>/</em>${esc(b)}</span></h1>
        ${gs.length ? `<div class="mb-dates"><b>${range(gs[0].date, gs[gs.length - 1].date)} ${gs[gs.length - 1].date.slice(0, 4)}</b> · ${nDone ? `${nDone} of ${gs.length} games played` : 'Regular season'}</div>` : ''}
        <div class="mb-crests">${S.teams.map((t, i) => `<a href="#mb-teams" data-mbteam="${esc(t.name)}" style="--h:${t.hue};animation-delay:${.15 + i * .06}s" aria-label="${esc(t.name)}">${logo(t.name) ? `<img src="${logo(t.name)}" alt="">` : ''}</a>`).join('')}</div>
        <div class="mb-facts">
          <div><b>${S.teams.length}</b><span>Teams</span></div><div><b>${gs.length}</b><span>Games</span></div><div><b>${ps.length}</b><span>Players</span></div>
          <div><b>${ps.filter(imp).length}</b><span>Imports</span></div><div><b>${new Set(gs.map(g => g.venue)).size}</b><span>Venues</span></div>
        </div></div>
        <div class="mb-next" id="mb-next">${nextCard()}</div>
      </div>
      <div class="mb-tour"><div class="mb-tour-sc" tabindex="0" role="region" aria-label="Season route by weekend"><div class="mb-tour-in" id="mb-tour"></div></div></div>
    </section>`;
  }
  function nextGame() {
    const gs = [...S.games].sort((a, b) => tipAt(a) - tipAt(b)), now = new Date();
    const live = gs.find(g => !done(g) && tipAt(g) <= now && now - tipAt(g) < 2.5 * 36e5);
    const nxt = live || gs.find(g => !done(g) && tipAt(g) > now);
    return {live, nxt, last: [...gs].reverse().find(done), any: gs.some(done)};
  }
  function nextCard() {
    const {live, nxt, last, any} = nextGame(), g = nxt || last;
    if (!g) return '';
    const label = live ? 'Live now' : !nxt ? 'Final game' : !any ? 'Opening night' : 'Next game';
    const ph = phaseOf(g), f = done(g);
    const side = n => `<div class="mb-tm"><i>${logo(n) ? `<img src="${logo(n)}" alt="">` : ''}</i>${esc(n)}</div>`;
    const href = f ? `#/c/${S.cid}/box/${g.mid}` : `#/watch/${g.mid}`;
    return `<div class="mb-nt"><span>${label}</span><em>${ph ? esc(ph.r + ' · G' + ph.g) : dlong(g.date) + ' · ' + hm(g.time)}</em></div>
      <div class="mb-mu">${side(g.h)}${nxt && !live ? '<span class="mb-vs">VS</span>' : `<span class="mb-sc">${g.hs ?? 0}<s>–</s>${g.as ?? 0}</span>`}${side(g.a)}</div>
      ${nxt && !live ? `<div class="mb-cd" id="mb-cd" aria-label="Time to tip-off">${['DAYS', 'HRS', 'MIN', 'SEC'].map(u => `<div><b><span>–</span></b><small>${u}</small></div>`).join('')}</div>` : ''}
      <div class="mb-where"><span>${esc(g.venue || '')}</span></div>
      <a class="mb-go" href="${href}">${live ? 'Follow live' : f ? 'Box score' : 'Live stats screen'}</a>`;
  }
  function tick() {
    const el = document.getElementById('mb-cd'), {nxt, live} = nextGame();
    if (!el || !nxt || live) return;
    const s = Math.max(0, Math.floor((tipAt(nxt) - new Date()) / 1000));
    if (!s) { document.getElementById('mb-next').innerHTML = nextCard(); cdPrev = []; return; }
    const v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60].map(x => String(x).padStart(2, '0'));
    el.querySelectorAll('b').forEach((b, i) => { if (cdPrev[i] !== v[i]) b.innerHTML = `<span class="${cdPrev.length ? 'mb-roll' : ''}">${v[i]}</span>`; });
    cdPrev = v;
  }
  function tour() {
    const box = document.getElementById('mb-tour');
    if (!box || !S.games.length) return;
    const L = legs(), W = Math.max(760, box.parentElement.clientWidth);
    const t0 = new Date(L[0].from + 'T00:00:00+08:00') - 864e5, t1 = new Date(L[L.length - 1].to + 'T23:59:00+08:00');
    const x = t => 44 + (t - t0) / (t1 - t0) * (W - 170);
    let right = -1e9;
    const now = new Date();
    const html = L.map(l => {
      const left = Math.max(x(new Date(l.from + 'T00:00:00+08:00')), right + 14);
      right = left + Math.max(96, l.games.length * 16, l.cities.join(' · ').length * 6.6, (range(l.from, l.to) + ' · ' + l.games.length + ' games').length * 5.9);   // the widest of the dots, the city and the dates line
      l.left = left;
      return `<div class="mb-lg" style="left:${left}px"><b>${esc(l.cities.join(' · '))}</b><small>${range(l.from, l.to)} · ${l.games.length} games</small>
        <div class="mb-dots">${l.games.map(g => `<i class="${done(g) ? 'on' : ''} ${phaseOf(g) ? 'po' : ''}" title="${esc(short(g.h) + ' v ' + short(g.a))}"></i>`).join('')}</div></div>`;
    }).join('');
    const all = L.flatMap(l => l.games.map((g, i) => ({g, px: l.left + i * 16 + 6})));
    const past = all.filter(o => tipAt(o.g) <= now), fut = all.filter(o => tipAt(o.g) > now);
    const nx = !past.length ? Math.max(22, all[0].px - 26) : !fut.length ? all[all.length - 1].px + 10 : (past[past.length - 1].px + fut[0].px) / 2;
    box.style.width = W + 'px';
    box.innerHTML = `<div class="mb-rail"></div><div class="mb-fill" id="mb-tfill"></div>${html}<div class="mb-now" id="mb-tnow" style="left:0"><span>TODAY</span></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const f = document.getElementById('mb-tfill'), n = document.getElementById('mb-tnow');
      if (f) f.style.width = nx + 'px'; if (n) n.style.left = nx + 'px';
    }));
  }

  /* ---------- controls ---------- */
  const seg = (id, opts, cur, label) => `<div class="mb-seg" id="${id}" role="group" aria-label="${label}">${opts.map(([v, t, dis]) => `<button type="button" data-v="${v}" aria-pressed="${String(cur) === String(v)}"${dis ? ' disabled' : ''}>${t}</button>`).join('')}<span class="mb-ind"></span></div>`;
  function segInd() {
    document.querySelectorAll('.mb-seg').forEach(s => {
      const on = s.querySelector('[aria-pressed="true"]'), ind = s.querySelector('.mb-ind');
      if (on && ind) { ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft}px)`; }
    });
  }

  /* ---------- games ---------- */
  function games() {
    const nRes = S.games.filter(done).length, now = new Date();
    return `<div class="mb-sh"><h2>Games</h2><span class="mb-sub">${nRes} of ${S.games.length} played</span>
      <div class="mb-tools">${seg('mb-gshow', [['all', 'All'], ['res', 'Results', !nRes], ['up', 'Upcoming']], ST.show, 'Show')}
        <div class="mb-tf" role="group" aria-label="Team"><button type="button" data-mbtf="" aria-pressed="${!ST.team}">All</button>${S.teams.map(t => `<button type="button" class="t" data-mbtf="${esc(t.name)}" style="--h:${t.hue}" aria-pressed="${ST.team === t.name}" title="${esc(t.name)}" aria-label="${esc(t.name)}">${logo(t.name) ? `<img src="${logo(t.name)}" alt="">` : esc(short(t.name))}</button>`).join('')}</div></div></div>
      ${(() => { const L = legs(); if (ST.leg == null || !L.some(l => l.i === ST.leg)) { const c = L.find(l => l.games.some(g => !done(g))) || L[L.length - 1]; ST.leg = c ? c.i : 1; }
        return `<div class="mb-legchips" role="group" aria-label="Weekend">${L.map(l => `<button type="button" data-mbleg="${l.i}" aria-pressed="${ST.leg === l.i}"><b>Weekend ${l.i}</b><small>${range(l.from, l.to)}</small></button>`).join('')}</div>`; })()}
      <div class="mb-legs">${legs().map(l => {
        const gs = l.games.filter(g => ST.show === 'all' || phone() || (ST.show === 'res') === done(g));
        if (!gs.length) return '';
        const hasT = !ST.team || gs.some(g => g.h === ST.team || g.a === ST.team);
        const cur = new Date(l.from + 'T00:00:00+08:00') <= now && now <= new Date(l.to + 'T23:59:00+08:00');
        const days = {};
        gs.forEach(g => (days[g.date] = days[g.date] || []).push(g));
        return `<article class="mb-leg${hasT ? '' : ' dim'}${ST.leg === l.i ? ' cur' : ''}" data-leg="${l.i}"><div class="mb-leg-h"><div><span>Weekend ${l.i}</span><b>${esc(l.cities.join(' · '))}</b></div><em>${cur ? '<i>This weekend</i>' : range(l.from, l.to)}</em></div>
          ${Object.entries(days).map(([d, gg]) => `<div class="mb-day">${dlong(d)}</div>${gg.map(gameRow).join('')}`).join('')}</article>`;
      }).join('')}</div>`;
  }
  function gameRow(g) {
    const f = done(g), hw = f && +g.hs > +g.as, ph = phaseOf(g);
    const on = ST.team && (g.h === ST.team || g.a === ST.team);
    return `<a class="mb-gm${ST.team ? (on ? ' hit' : ' fade') : ''}" href="${f ? `#/c/${S.cid}/box/${g.mid}` : `#/watch/${g.mid}`}" style="--h:${ST.team ? hue(ST.team) : 250}" title="${esc(g.venue || '')}">
      <span class="s${hw ? ' w' : ''}"><span>${esc(short(g.h))}</span>${crestI(g.h, 22)}</span>
      <span class="m${f ? '' : ' up'}">${ph ? `<small>${esc(ph.r.replace('Semi-final', 'Semi'))} G${ph.g}</small>` : ''}${f ? `${g.hs}–${g.as}` : hm(g.time)}</span>
      <span class="s${f && !hw ? ' w' : ''}">${crestI(g.a, 22)}<span>${esc(short(g.a))}</span></span></a>`;
  }

  /* ---------- standings ---------- */
  function stand() {
    const rows = standings(), mx = Math.max(1, ...rows.map(r => Math.abs(r.diff)));
    const pc = S.prev[S.prev.length - 1];
    const prev = n => { const s = pc && (pc.stand || []).find(x => x.team === n); return s ? (pc.champ === n ? `<b>Champion</b> · ${s.w}–${s.l}` : `<b>${ord(s.pos)}</b> · ${s.w}–${s.l}`) : ''; };
    return `<div class="mb-sh"><h2>Standings</h2><span class="mb-sub">Regular season</span></div>
      <div class="mb-card mb-stw"><table class="mb-st"><thead><tr><th>#</th><th>Team</th><th>GP</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>PF</th><th>PA</th><th>DIFF</th><th>Last 5</th>${pc ? `<th>MBL ${pc.year}</th>` : ''}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr style="animation-delay:${i * .05}s"><td class="pos">${r.gp ? i + 1 : '–'}</td>
        <td class="tm">${crestI(r.team, 26)}<a href="#mb-teams" data-mbteam="${esc(r.team)}">${esc(r.team)}</a></td>
        <td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td><td>${r.gp ? r.pct.toFixed(3).replace(/^0/, '') : '–'}</td><td>${r.gp && r.gb ? r.gb.toFixed(1).replace('.0', '') : '–'}</td>
        <td>${r.pf}</td><td>${r.pa}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}<span class="mb-dbar" aria-hidden="true"><i style="width:${r.diff < 0 ? -r.diff / mx * 44 : 0}px"></i><i style="width:${r.diff > 0 ? r.diff / mx * 44 : 0}px"></i></span></td>
        <td><span class="mb-l5">${[...r.res.slice(-5), ...Array(Math.max(0, 5 - r.res.length)).fill('')].map(x => `<i class="${x}">${x ? x.toUpperCase() : '·'}</i>`).join('')}</span></td>
        ${pc ? `<td class="prev">${prev(r.team)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- teams: tiles, flip cards, height lineup ---------- */
  const POS = {PG: 1, G: 2, SG: 3, GF: 4, SF: 5, F: 6, PF: 7, FC: 8, C: 9};
  function teams() {
    if (!ST.sel || !team(ST.sel)) ST.sel = S.teams[0] && S.teams[0].name;
    const yrs = S.prev.slice(-3);
    return `<div class="mb-sh"><h2>Teams</h2><span class="mb-sub">${players().length} players</span></div>
      <div class="mb-tiles" role="group" aria-label="Team">${S.teams.map(t => {
        const r = t.roster, hs = r.filter(p => +p.ht), as = r.filter(p => +p.age);
        const age = as.reduce((s, p) => s + +p.age, 0) / Math.max(1, as.length), ht = hs.reduce((s, p) => s + +p.ht, 0) / Math.max(1, hs.length);
        return `<button type="button" class="mb-tile" data-mbteam="${esc(t.name)}" style="--h:${t.hue}" aria-pressed="${ST.sel === t.name}">
          <span class="cr">${logo(t.name) ? `<img src="${logo(t.name)}" alt="">` : ''}</span><b>${esc(t.name)}</b>
          <span class="meta"><span><b>${r.length}</b> players</span><span><b>${r.filter(imp).length}</b> imports</span><span><b>${age.toFixed(1)}</b> avg age</span><span><b>${Math.round(ht)}</b> cm avg</span></span>
          <span class="hist">${yrs.map(c => { const s = (c.stand || []).find(x => x.team === t.name), y = String(c.year).slice(2);
            return s ? `<i class="${c.champ === t.name ? 'ch' : ''}" title="MBL ${c.year}: ${c.champ === t.name ? 'champion' : ord(s.pos)}, ${s.w}–${s.l}">’${y} ${c.champ === t.name ? '★' : ord(s.pos)}</i>` : `<i class="na" title="Not in MBL ${c.year}">’${y} –</i>`; }).join('')}</span>
        </button>`; }).join('')}</div>
      <div id="mb-roster">${roster()}</div>
      <div class="mb-card mb-hlc" id="mb-heights">${heights()}</div>`;
  }
  function roster() {
    const t = team(ST.sel);
    if (!t) return '';
    const sorters = {num: (a, b) => (+a.num || 0) - (+b.num || 0), pos: (a, b) => (POS[a.pos] || 5) - (POS[b.pos] || 5) || (+a.num - +b.num),
      ht: (a, b) => (+b.ht || 0) - (+a.ht || 0), age: (a, b) => (+b.age || 0) - (+a.age || 0)};
    const ros = [...t.roster].sort(sorters[ST.sort]);
    return `<div class="mb-rhead">${crestI(t.name, 34)}<b>${esc(t.name)}</b><span class="mb-sub">${ros.length} players</span>
        <div class="mb-tools">${seg('mb-rsort', [['num', 'No.'], ['pos', 'Position'], ['ht', 'Height'], ['age', 'Age']], ST.sort, 'Sort')}</div></div>
      <div class="mb-ros">${ros.map((p, i) => {
        const c = career(p.pid), name = personName(p.pid);
        const back = c ? `<span class="bk-h"><span>MBL career</span><em>${c.n} season${c.n > 1 ? 's' : ''} · ${c.g} GP</em></span>
            <span class="bk-big"><b>${per(c, 'pts').toFixed(1)}</b><small>PTS<br>per game</small></span>
            <span class="bk-g">${[['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tpm', '3PM']].map(([k, l]) => `<span><b>${per(c, k).toFixed(1)}</b><small>${l}</small></span>`).join('')}</span>
            <span class="bk-f">${c.pts} career points</span>`
          : !imp(p) ? `<span class="bk-rk"><b>ROOKIE</b><small>First MBL season</small></span>`
          : `<span class="bk-rk imp">${flag(p.nat, 44)}<b>IMPORT</b><small>${esc(NAT[p.nat] || p.nat)} · first MBL season</small></span>`;
        return `<a class="mb-pc" href="#/p/${esc(p.pid)}" style="animation-delay:${Math.min(i, 16) * .025}s;--h:${t.hue}" aria-label="${esc(name)}">
          <span class="pc-in">
            <span class="fc fr"><span class="no">${esc(p.num)}</span><span class="ph">${face(p.pid, name)}</span><span class="nm">${esc(name)}</span>
              <span class="meta">${[['HT', +p.ht ? p.ht + '<small>cm</small>' : '–'], ['POS', esc(p.pos || '–')], ['AGE', p.age || '–']].map(([l, v]) => `<span><small>${l}</small><b>${v}</b></span>`).join('')}
                <span class="fl" title="${esc(NAT[p.nat] || p.nat || '')}">${flag(p.nat, 26)}</span></span></span>
            <span class="fc bk"><span class="no">${esc(p.num)}</span>${back}</span>
          </span></a>`; }).join('')}</div>`;
  }
  // the selected team as figures standing on one floor at true scale, tallest first; beside it every team's average
  function heights() {
    const t = team(ST.sel);
    if (!t) return '';
    const ros = t.roster.filter(p => +p.ht).sort((a, b) => b.ht - a.ht);
    if (!ros.length) return '';
    const FW = 46, X0 = 16, k = 1.45, floor = 232 * k, W = X0 + ros.length * FW + 70, top = floor - 216 * k;
    const y = cm => floor - cm * k, mean = ros.reduce((s, p) => s + +p.ht, 0) / ros.length;
    const grad = (id, l1, c1, l2, c2) => `<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="oklch(${l1}% ${c1} ${t.hue})"/><stop offset="1" stop-color="oklch(${l2}% ${c2} ${t.hue})"/></linearGradient>`;
    let g = `<defs>${grad('mbfg', 74, .12, 50, .14)}${grad('mbfs', 46, .12, 34, .09)}${grad('mbfi', 84, .05, 64, .07)}${grad('mbfis', 62, .06, 50, .05)}
      <linearGradient id="mbfl" x1="0" x2="1"><stop offset="0" stop-color="var(--border)" stop-opacity="0"/><stop offset=".08" stop-color="var(--border)"/><stop offset=".92" stop-color="var(--border)"/><stop offset="1" stop-color="var(--border)" stop-opacity="0"/></linearGradient></defs>`;
    g += `<line class="ax" x1="${X0 - 8}" x2="${W - 64}" y1="${y(200)}" y2="${y(200)}"/><text x="${W - 60}" y="${y(200) + 4}">2.00 m</text>`;
    ros.forEach((p, i) => {
      const h = p.ht * k, cx = X0 + i * FW + FW / 2, hy = floor - h, im = imp(p), f = im ? 'mbfi' : 'mbfg', fs = im ? 'mbfis' : 'mbfs';
      const hr = h * .062, sy = hy + h * .145, tw = Math.min(FW - 14, h * .2), ty = hy + h * .5, lw = tw * .42, aw = Math.max(4, tw * .2);
      const nf = (DB.natflags || {})[p.nat];
      g += `<g class="fig" data-mbtip="${esc(personName(p.pid))} · ${p.ht} cm${im ? ' · ' + esc(NAT[p.nat] || p.nat) : ''}" style="animation-delay:${i * .045}s;transform-origin:${cx}px ${floor}px">
        <circle cx="${cx}" cy="${hy + hr}" r="${hr}" fill="url(#${f})"/>
        <rect x="${cx - tw / 2 - aw - 1.5}" y="${sy + 3}" width="${aw}" height="${h * .34}" rx="${aw / 2}" fill="url(#${f})" opacity=".85"/>
        <rect x="${cx + tw / 2 + 1.5}" y="${sy + 3}" width="${aw}" height="${h * .34}" rx="${aw / 2}" fill="url(#${f})" opacity=".85"/>
        <path d="M${cx - tw / 2} ${sy + 8} q0 -8 8 -8 h${tw - 16} q8 0 8 8 v${ty - sy - 8} h-${tw}z" fill="url(#${f})"/>
        <rect x="${cx - lw - 1}" y="${ty}" width="${lw}" height="${floor - ty}" rx="${lw / 2.2}" fill="url(#${f})"/>
        <rect x="${cx + 1}" y="${ty}" width="${lw}" height="${floor - ty}" rx="${lw / 2.2}" fill="url(#${f})"/>
        <rect x="${cx - tw / 2}" y="${ty - 2}" width="${tw}" height="${h * .13}" rx="3" fill="url(#${fs})"/>
        <text class="jn" x="${cx}" y="${sy + h * .16}" text-anchor="middle">${esc(p.num)}</text>
        <text class="cm" x="${cx}" y="${floor + 19}" text-anchor="middle">${p.ht}</text>
        ${im && nf ? `<image href="${nf}" x="${cx - 9}" y="${floor + 25}" width="18" height="13.5" preserveAspectRatio="none" class="imf"/>` : ''}</g>`;
    });
    g += `<rect x="${X0 - 8}" y="${floor}" width="${W - X0 - 56}" height="3" rx="1.5" fill="url(#mbfl)"/>
      <line class="avg" x1="${X0 - 8}" x2="${W - 64}" y1="${y(mean)}" y2="${y(mean)}"/><text class="avt" x="${W - 60}" y="${y(mean) + 4}">Avg ${mean.toFixed(1)}</text>`;
    const avg = S.teams.map(x => { const r = x.roster.filter(p => +p.ht); return r.length ? {t: x, a: r.reduce((s, p) => s + +p.ht, 0) / r.length, top: r.reduce((m, p) => +p.ht > +m.ht ? p : m, r[0])} : null; }).filter(Boolean).sort((a, b) => b.a - a.a);
    const lo = Math.floor(Math.min(...avg.map(a => a.a))) - 3, hi = Math.ceil(Math.max(...avg.map(a => a.a))) + 1;
    return `<div class="hl-main"><h3>Height lineup <span>${crestI(t.name, 18)} ${esc(t.name)} · tallest to shortest</span><span class="lgd"><i style="--h:${t.hue}"></i>Local<i class="o" style="--h:${t.hue}"></i>Import</span></h3>
        <div class="hl-sc" tabindex="0" role="region" aria-label="Height lineup"><svg class="hl" viewBox="0 ${top - 8} ${W} ${floor - top + 46}" style="min-width:${Math.min(W, 620)}px" role="img" aria-label="${esc(t.name)} players by height">${g}</svg></div></div>
      <div class="hl-side"><h3>Average height</h3>${avg.map((a, i) => `<button type="button" class="av" data-mbteam="${esc(a.t.name)}" aria-pressed="${a.t.name === t.name}" style="--h:${a.t.hue}">
        <span class="r">${i + 1}</span>${crestI(a.t.name, 24)}<span class="n"><b>${esc(short(a.t.name))}</b><span class="bar"><i style="--w:${((a.a - lo) / (hi - lo) * 100).toFixed(0)}%"></i></span><small>Tallest: ${esc(personName(a.top.pid))}, ${a.top.ht}</small></span><span class="v">${a.a.toFixed(1)}<small>cm</small></span></button>`).join('')}</div>`;
  }

  /* ---------- stats ---------- */
  const CATS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', '3-pointers']];
  function stats() {
    const pl = players(), on = new Map(pl.map(p => [p.pid, p]));
    const season = (S.c.players || []).filter(r => r.g && on.has(r.pid));
    const has = season.length > 0;
    if (!ST.lead || !has) ST.lead = has ? (ST.lead || 'season') : 'career';
    let rows, note;
    if (ST.lead === 'season') {
      const gmax = Math.max(1, ...standings().map(r => r.gp)), min = Math.max(1, Math.ceil(gmax * .4));
      rows = season.filter(r => r.g >= min).map(r => ({pid: r.pid, team: on.get(r.pid).team, line: r}));
      note = `Per game · min ${min} GP`;
    } else {
      rows = pl.filter(p => career(p.pid) && career(p.pid).g >= 10).map(p => ({pid: p.pid, team: p.team, line: career(p.pid)}));
      note = 'MBL career per game · min 10 GP';
    }
    return `<div class="mb-sh"><h2>Stats</h2><span class="mb-sub">${note}</span><div class="mb-tools">${seg('mb-lseg', [['season', 'This season', !has], ['career', 'MBL career']], ST.lead, 'Leaders')}</div></div>
      <div class="mb-lead">${CATS.map(([k, l]) => {
        const top = rows.map(x => Object.assign({v: per(x.line, k)}, x)).sort((a, b) => b.v - a.v).slice(0, 5), mx = top.length ? top[0].v || 1 : 1;
        return `<section class="mb-card mb-lb"><h3>${l}<small>${k.toUpperCase()}</small></h3>${top.map((x, i) => `<a class="mb-lr" href="#/p/${esc(x.pid)}" style="--h:${hue(x.team)}">
          <span class="r">${i + 1}</span><span class="ph">${face(x.pid)}</span>
          <span class="n"><b>${logo(x.team) ? `<img src="${logo(x.team)}" alt="">` : ''}<span>${esc(personName(x.pid))}</span></b><span class="bar"><i style="--w:${(x.v / mx * 100).toFixed(1)}%;animation-delay:${i * .07}s"></i></span></span>
          <span class="v">${x.v.toFixed(1)}</span></a>`).join('')}</section>`; }).join('')}</div>`;
  }

  /* ---------- milestone watch ---------- */
  const MK = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['g', 'Games']];
  function milestones() {
    const out = [], now = new Date();
    S.teams.forEach(t => {
      const sched = S.games.filter(g => (g.h === t.name || g.a === t.name) && !done(g) && tipAt(g) > now).sort((a, b) => tipAt(a) - tipAt(b));
      t.roster.forEach(p => {
        if (p.nat !== 'MAS') return;
        const c = career(p.pid); if (!c || !c.g) return;
        MK.forEach(([k, lab]) => {
          const v = c[k], nxt = (Math.floor(v / 50) + 1) * 50, rate = k === 'g' ? 1 : v / c.g;
          if (rate <= 0) return;
          const need = nxt - v, gm = Math.max(1, Math.ceil(need / rate));
          out.push({p, team: t.name, k, lab, v, next: nxt, need, gm, rate, at: sched[gm - 1] || null});
        });
      });
    });
    return out.sort((a, b) => a.gm - b.gm || a.need / a.rate - b.need / b.rate);
  }
  function miles() {
    const all = milestones(), inH = m => m.gm <= ST.mh;
    const list = all.filter(m => (ST.mk === 'all' || m.k === ST.mk) && inH(m));
    const cnt = k => all.filter(m => (k === 'all' || m.k === k) && inH(m)).length;
    return `<div class="mb-sh"><h2>Milestone watch</h2><span class="mb-sub">Malaysian players · every 50 in the MBL</span>
        <div class="mb-tools">${seg('mb-mh', [['1', 'Next game'], ['3', 'Within 3'], ['99', 'This season']], ST.mh, 'Within')}</div></div>
      <div class="mb-mchips" role="group" aria-label="Stat">${[['all', 'All'], ...MK].map(([k, l]) => `<button type="button" class="mb-mchip" data-mbmk="${k}" aria-pressed="${ST.mk === k}">${l}<em>${cnt(k)}</em></button>`).join('')}</div>
      <div class="mb-mgrid">${list.slice(0, 24).map((m, i) => {
        const frac = (m.v - (m.next - 50)) / 50, R = 33, C = 2 * Math.PI * R, h = hue(m.team);
        const steps = Math.min(m.next / 50, 16), from = m.next / 50 - steps;
        const at = m.at ? `${dlong(m.at.date)} · ${m.at.h === m.team ? 'v ' + short(m.at.a) : '@ ' + short(m.at.h)}` : 'After this season';
        return `<a class="mb-mc" href="#/p/${esc(m.p.pid)}" style="--h:${h};animation-delay:${Math.min(i, 12) * .04}s">
          <span class="ring"><svg viewBox="0 0 76 76" aria-hidden="true"><defs><linearGradient id="mbrg${i}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="oklch(78% 0.13 ${h})"/><stop offset="1" stop-color="oklch(56% 0.15 ${h})"/></linearGradient></defs>
            <circle cx="38" cy="38" r="${R}" class="trk"/><circle cx="38" cy="38" r="${R}" class="arc" stroke="url(#mbrg${i})" style="--c:${C.toFixed(1)};--o:${(C * (1 - frac)).toFixed(1)}"/></svg>
            <span class="ph">${face(m.p.pid)}</span></span>
          <span class="mi"><b>${esc(personName(m.p.pid))}</b><small>${crestI(m.team, 14)} ${esc(short(m.team))}</small>
            <span class="mv"><em>${m.v}</em> → <strong>${m.next}</strong> ${m.lab.toLowerCase()}</span>
            <span class="lad" aria-hidden="true">${Array.from({length: steps}, (_, j) => `<i class="${j < steps - 1 ? 'on' : 'nx'}" title="${(from + j + 1) * 50}"></i>`).join('')}</span></span>
          <span class="mg"><b>${m.need}</b><small>to go</small></span>
          <span class="eta">${m.gm === 1 ? 'Next game' : 'In ~' + m.gm + ' games'}<span>${esc(at)}</span></span></a>`; }).join('') || '<div class="mb-empty">Nothing in reach for this pick</div>'}</div>`;
  }

  /* ---------- records: single-game bests, big nights and streaks, from the box scores ---------- */
  // The 2023 rosters carry no nationality: these are the Malaysians among that season's players;
  // anyone else with no nationality on any roster counts as an import.
  const MR_LOCAL = {'2105612': 1, '54872': 1, '2252635': 1, '2302708': 1, '346957': 1};
  const MR_CATS = [['pts', 'Points', 'PTS'], ['reb', 'Rebounds', 'REB'], ['ast', 'Assists', 'AST'], ['blk', 'Blocks', 'BLK'], ['stl', 'Steals', 'STL'], ['tpm', '3-pointers made', '3PM']];
  const MR_FIVE = ['pts', 'reb', 'ast', 'stl', 'blk'];
  const MR_SHOW = 10, MR_LONG = 25;   // single-game bests: ten on the card, twenty-five when opened
  const mrN = (x, n) => MR_FIVE.filter(k => x[k] >= n);
  const MR_BIG = [['td', 'Triple-double', x => mrN(x, 10).length >= 3, 10], ['d20', '20–20', x => mrN(x, 20).length >= 2, 20], ['d15', '15–15', x => mrN(x, 15).length >= 2, 15]];
  const MR_STK = [['tpm', 'Made a three', x => x.tpm >= 1], ['p20', '20+ points', x => x.pts >= 20], ['p10', 'Double figures', x => x.pts >= 10],
    ['r10', '10+ rebounds', x => x.reb >= 10], ['dd', 'Double-double', x => mrN(x, 10).length >= 2], ['blk', 'Blocked a shot', x => x.blk >= 1]];
  let MRL = null, MRNAT = null;
  function mrNat(pid) {
    if (!MRNAT) {
      MRNAT = {};
      [...COMPS].sort((a, b) => (a.start || String(a.year)).localeCompare(b.start || String(b.year)))
        .forEach(c => Object.values(c.roster || {}).forEach(rows => (rows || []).forEach(r => { if (r.nat) MRNAT[PALIAS[r.pid] || r.pid] = r.nat; })));
    }
    return MRNAT[pid] || (MR_LOCAL[pid] ? 'MAS' : '');
  }
  const mrImp = pid => mrNat(pid) !== 'MAS';
  // every MBL men's line with minutes, oldest first
  function mrLines() {
    if (MRL) return MRL;
    const out = [];
    mblComps().forEach(c => (c.games || []).forEach(g => {
      if (!done(g)) return;
      const b = getBox(g.mid); if (!b) return;
      const hw = +g.hs > +g.as, t0 = +tipAt(g);
      b.p.forEach(r => {
        if (!r.pid) return;
        const home = r.team === g.h;
        const x = {pid: PALIAS[r.pid] || r.pid, cid: c.id, cur: c.id === S.cid, y: +c.year, mid: g.mid, d: g.date, tm: t0, t: r.team, o: home ? g.a : g.h,
          w: home ? hw : !hw, sc: home ? `${g.hs}–${g.as}` : `${g.as}–${g.hs}`,
          pts: +r.pts || 0, reb: (+r.oreb || 0) + (+r.dreb || 0), ast: +r.ast || 0, stl: +r.stl || 0, blk: +r.blk || 0, tpm: +r.tpm || 0};
        if (!(minsToNum(r.min) > 0) && !(x.pts || x.reb || x.ast || x.stl || x.blk || +r.fga)) return;   // a DNP line
        out.push(x);
      });
    }));
    out.sort((a, b) => a.tm - b.tm || (a.mid < b.mid ? -1 : 1));
    return (MRL = out);
  }
  const mrKeep = x => (ST.rs === 'all' || x.cur) && (ST.rw === 'all' || (ST.rw === 'imp') === mrImp(x.pid));
  const mrYr = y => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
  const mrRank = (L, f) => L.map(x => 1 + L.filter(z => f(z) > f(x)).length);
  const mrFace = pid => `<span class="mr-ph">${face(pid)}</span>`;
  const mrFlag = pid => { const n = mrNat(pid); return n && n !== 'MAS' && (DB.natflags || {})[n] ? `<img class="mr-fl" src="${DB.natflags[n]}" alt="${esc(NAT[n] || n)}" title="${esc(NAT[n] || n)}" width="16" height="12">` : ''; };
  const mrNew = x => ST.rs === 'all' && x.cur ? `<span class="mr-new" title="This season">${esc(S.title.replace(/^20/, ''))}</span>` : '';
  const mrCr = (n, cls) => logo(n) ? `<img${cls ? ` class="${cls}"` : ''} src="${logo(n)}" alt="" width="16" height="16">` : '';
  const mrSpan = (a, z) => a === z ? mrDate(a) : `${a.slice(0, 4) === z.slice(0, 4) ? mrDate(a).slice(0, -5) : mrDate(a)} – ${mrDate(z)}`;
  const mrDate = iso => { const [y, m, d] = iso.split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };

  function mrSingle(L) {
    return MR_CATS.map(([k, lab, tag], ci) => {
      const top = L.filter(x => x[k] > 0).sort((a, b) => b[k] - a[k] || a.tm - b.tm).slice(0, MR_LONG), rk = mrRank(top, x => x[k]), t = top[0];
      if (!t) return `<section class="mb-card mr-c" style="animation-delay:${ci * .05}s"><header><b>${lab}</b><em>${tag}</em></header><div class="mr-none">No game yet</div></section>`;
      return `<section class="mb-card mr-c" style="--h:${hue(t.t)};animation-delay:${ci * .05}s"><header><b>${lab}</b><em>${tag} · one game</em></header>
        <a class="mr-top" href="#/c/${t.cid}/box/${t.mid}" aria-label="${esc(personName(t.pid))}, ${t[k]} ${lab.toLowerCase()}, box score">${mrFace(t.pid)}
          <span class="who"><b>${esc(personName(t.pid))}</b><small>${mrCr(t.t)}${esc(short(t.t))} ${mrFlag(t.pid)}${mrNew(t)}</small><small>v ${esc(short(t.o))} · ${mrDate(t.d)} · ${t.w ? 'W' : 'L'} ${t.sc}</small></span>
          <span class="mr-big" data-cu="${t[k]}">${t[k]}</span></a>
        ${top.slice(1).map((x, i) => `<a class="mr-r${i + 1 >= MR_SHOW ? ' x' : ''}" href="#/p/${esc(x.pid)}"><span class="rk">${rk[i + 1]}</span>${mrFace(x.pid)}
          <span class="n"><b><span>${esc(personName(x.pid))}</span>${mrFlag(x.pid)}${mrNew(x)}</b><small>${esc(short(x.t))} v ${esc(short(x.o))} · ${mrDate(x.d)}</small></span><span class="v">${x[k]}</span></a>`).join('')}
        ${top.length > MR_SHOW ? `<button type="button" class="mr-more" data-mrc aria-expanded="false">Show top ${top.length}</button>` : ''}
      </section>`;
    }).join('');
  }

  function mrBig(L) {
    const cnt = Object.fromEntries(MR_BIG.map(([k, , f]) => [k, L.filter(f).length]));
    if (!ST.rb || (!cnt[ST.rb] && Object.values(cnt).some(Boolean))) ST.rb = (MR_BIG.find(([k]) => cnt[k]) || MR_BIG[0])[0];
    const [, lab, f, th] = MR_BIG.find(([k]) => k === ST.rb);
    const list = L.filter(f).sort((a, b) => b.tm - a.tm), open = ST.rx === 'big', show = open ? list : list.slice(0, 6);
    return `<div class="mr-ph2"><h3>Big nights</h3><span>${ST.rb === 'td' ? '10 or more in three of PTS, REB, AST, STL, BLK' : `${th} or more in two of PTS, REB, AST, STL, BLK`}</span></div>
      <div class="mb-mchips" role="group" aria-label="Kind">${MR_BIG.map(([k, l]) => `<button type="button" class="mb-mchip" data-mrb="${k}" aria-pressed="${ST.rb === k}">${l}<em>${cnt[k]}</em></button>`).join('')}</div>
      <div class="mr-list">${show.map((x, i) => {
        const [y, m, d] = x.d.split('-');
        return `<a class="mr-g" href="#/c/${x.cid}/box/${x.mid}" style="--h:${hue(x.t)};animation-delay:${Math.min(i, 8) * .04}s">
          <span class="mr-dt"><b>${+d}</b><small>${MON[+m - 1]} ’${y.slice(2)}</small></span>${mrFace(x.pid)}
          <span class="who"><span class="nm"><span>${esc(personName(x.pid))}</span>${mrFlag(x.pid)}${mrNew(x)}</span><span class="sub">${mrCr(x.t)}${esc(short(x.t))} · <span class="res ${x.w ? 'w' : 'l'}">${x.w ? 'W' : 'L'} ${x.sc}</span> v ${esc(short(x.o))}</span></span>
          <span class="mr-pls">${MR_FIVE.filter(k => x[k] >= th || (k !== 'stl' && k !== 'blk')).map(k => `<span class="mr-pl${x[k] >= th ? ' on' : ''}"><b>${x[k]}</b><small>${k.toUpperCase()}</small></span>`).join('')}</span></a>`; }).join('')
        || `<div class="mr-none">No ${lab.toLowerCase()} ${ST.rs === 'all' ? 'in the MBL' : 'this season'} yet${ST.rw === 'all' ? '' : ' by ' + (ST.rw === 'imp' ? 'an import' : 'a local player')}.</div>`}</div>
      ${list.length > 6 ? `<button type="button" class="mr-more" data-mrx="big">${open ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}`;
  }

  // a run counts the games a player played, one after another; a game he sat out neither adds nor breaks it
  function mrRuns(L, test) {
    const by = {};
    L.forEach(x => (by[x.pid] = by[x.pid] || []).push(x));
    const out = [];
    Object.entries(by).forEach(([pid, G]) => {
      let run = [], best = [];
      G.forEach(x => { if (test(x)) { run.push(x); if (run.length > best.length) best = run; } else run = []; });
      const live = run.length && G[G.length - 1].cur ? run : [];
      out.push({pid, best, live, t: G[G.length - 1].t});
    });
    return out;
  }
  function mrStreaks(L) {
    if (!ST.rk) ST.rk = 'tpm';
    const [, lab, test] = MR_STK.find(([k]) => k === ST.rk), runs = mrRuns(L, test), act = ST.rm === 'live';
    const rows = runs.map(r => Object.assign({run: act ? r.live : r.best}, r)).filter(r => r.run.length >= 2)
      .sort((a, b) => b.run.length - a.run.length || b.run[b.run.length - 1].tm - a.run[a.run.length - 1].tm);
    const rk = mrRank(rows, r => r.run.length), open = ST.rx === 'stk', show = open ? rows.slice(0, 25) : rows.slice(0, 7);
    const nextOf = t => S.games.filter(g => !done(g) && (g.h === t || g.a === t) && tipAt(g) > new Date()).sort((a, b) => tipAt(a) - tipAt(b))[0];
    return `<div class="mr-ph2"><h3>Streaks</h3><span>Games in a row, counting only games played</span></div>
      <div class="mr-tabs"><div class="mb-mchips" role="group" aria-label="Streak">${MR_STK.map(([k, l]) => `<button type="button" class="mb-mchip" data-mrk="${k}" aria-pressed="${ST.rk === k}">${l}</button>`).join('')}</div>
        ${seg('mr-mode', [['best', 'Longest'], ['live', 'Active now', ST.rs !== 'all' && !L.length]], ST.rm, 'Streaks')}</div>
      <div class="mr-list">${show.map((r, i) => {
        const a = r.run[0], z = r.run[r.run.length - 1], on = !!r.live.length && r.live[r.live.length - 1] === z;
        const n = r.run.length, cap = 34, nx = on ? nextOf(r.t) : null;
        return `<a class="mr-s" href="#/p/${esc(r.pid)}" style="--h:${hue(z.t)};animation-delay:${Math.min(i, 8) * .04}s">
          <span class="rk">${rk[i]}</span>${mrFace(r.pid)}
          <span class="mid"><span class="nm">${mrCr(z.t, 'cr')}<span>${esc(personName(r.pid))}</span>${mrFlag(r.pid)}${on ? '<span class="mr-act">ACTIVE</span>' : ''}</span>
            <span class="mr-bd" aria-hidden="true">${Array.from({length: Math.min(n, cap)}, (_, j) => `<i style="animation-delay:${(.15 + j * .018).toFixed(3)}s"></i>`).join('')}${n > cap ? `<em>+${n - cap}</em>` : ''}${on ? '<i class="nx"></i>' : ''}</span>
          <span class="when">${mrSpan(a.d, z.d)}${on ? (nx ? ` · next game ${dlong(nx.date)}` : ' · still going') : ''}</span></span>
          <span class="len"><b data-cu="${n}">${n}</b><small>games</small></span></a>`; }).join('')
        || `<div class="mr-none">${act ? `No active ${lab.toLowerCase()} streak of 2 games or more.` : `No streak of 2 games or more yet.`}</div>`}</div>
      ${rows.length > 7 ? `<button type="button" class="mr-more" data-mrx="stk">${open ? 'Show fewer' : `Show top ${Math.min(25, rows.length)}`}</button>` : ''}`;
  }

  function records() {
    const has = typeof HS === 'undefined' || HS.hasBoxes();
    const all = has ? mrLines() : [], nCur = new Set(all.filter(x => x.cur).map(x => x.mid)).size;
    if (!ST.rs && has) ST.rs = nCur ? 'season' : 'all';
    const L = all.filter(mrKeep), nG = new Set(L.map(x => x.mid)).size;
    const yrs = [...new Set(all.map(x => x.y))];
    const note = !has ? 'Loading the box scores…' : ST.rs === 'all' ? `${nG} games · ${yrs.length} seasons (${mrYr(Math.min(...yrs)).slice(0, 4)}–${S.title.replace(/^20/, '’')})` : `${nG} game${nG === 1 ? '' : 's'} this season`;
    return `<div class="mb-sh"><h2>Records</h2><span class="mb-sub">${note}</span>
        <div class="mb-tools">${seg('mr-scope', [['season', 'This season', has && !nCur], ['all', 'All-time MBL']], ST.rs || 'season', 'Seasons')}${seg('mr-who', [['all', 'All players'], ['loc', 'Local'], ['imp', 'Import']], ST.rw, 'Players')}</div></div>
      <div class="mr-body${ST.rswap ? ' swap' : ''}" id="mr-body">${has ? `<div class="mr-grid">${mrSingle(L)}</div>
        <div class="mr-low"><section class="mb-card mr-pane" id="mr-big">${mrBig(L)}</section><section class="mb-card mr-pane" id="mr-stk" style="animation-delay:.06s">${mrStreaks(L)}</section></div>`
        : '<div class="mb-empty">The records appear once the box scores are in</div>'}</div>`;
  }
  // after a draw: the record numbers count up from zero
  function mrCount(root) {
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...root.querySelectorAll('[data-cu]')], t0 = performance.now();
    if (!els.length) return;
    const step = t => { const k = Math.min(1, (t - t0) / 800), e = 1 - Math.pow(1 - k, 3);
      els.forEach(el => { el.textContent = k < 1 ? Math.round(+el.dataset.cu * e) : el.dataset.cu; });
      if (k < 1 && els[0].isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* ---------- analysis: team and player trends of this season, from the box scores and play-by-play ---------- */
  const MA_K = ['pts', 'fgm', 'fga', 'twopm', 'twopa', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf'];
  const maR = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
  const maPct = v => maR(v * 100, 1) + '%';
  // fouls by kind come from the competition's play-by-play file (pbp/<cid>.js, loaded on demand): [mid, team, name, kind, pid]
  const MA_FOUL = /^(Personal foul|Offensive foul|Technical|Bench technical|Flagrant foul|Disruptive foul|Unsportsmanlike|Disqualifying)/;
  let MAF = null, maWait = null;
  function maFouls() {
    if (MAF) return MAF;
    const data = typeof PBP_DATA !== 'undefined' && PBP_DATA[S.cid];
    if (!data) return null;
    const out = [];
    S.games.forEach(g => {
      const rec = done(g) && data.G[g.mid]; if (!rec) return;
      const b = getBox(g.mid), byNum = {};
      (b && b.p || []).forEach(l => { if (l.pid && l.num != null && l.num !== '') byNum[l.team + ':' + l.num] = PALIAS[l.pid] || l.pid; });
      rec.e.forEach(e => {
        const kind = String(data.A[e[4]] || '').trim(); if (!MA_FOUL.test(kind)) return;
        const team = e[1] === 1 ? rec.h : e[1] === 2 ? rec.a : ''; if (!team) return;
        const pl = data.P[e[3]] || ['', ''];
        out.push([g.mid, team, pl[1], kind, byNum[team + ':' + pl[0]] || null]);
      });
    });
    return (MAF = out);
  }
  let MA = null;
  function maModel() {
    if (MA) return MA;
    const T = {}, P = {};
    S.teams.forEach(t => { T[t.name] = {name: t.name, g: 0, w: 0, l: 0, opp: 0, loc: 0, imp: 0, poss: 0, oposs: 0, ooreb: 0, odreb: 0,
      f: {pf: 0, off: 0, tech: 0, bench: 0, flag: 0, dis: 0}}; MA_K.forEach(k => { T[t.name][k] = 0; }); });
    const imp = {};
    S.teams.forEach(t => t.roster.forEach(p => { imp[p.pid] = !!(p.nat && p.nat !== 'MAS'); }));
    let nG = 0;
    S.games.forEach(g => {
      if (!done(g)) return;
      const b = getBox(g.mid); if (!b) return;
      nG++;
      const side = {};
      [g.h, g.a].forEach(n => { side[n] = {}; MA_K.forEach(k => { side[n][k] = 0; }); });
      b.p.forEach(r => {
        const s = side[r.team]; if (!s || !r.pid) return;
        const pid = PALIAS[r.pid] || r.pid, n = k => +r[k] || 0;
        MA_K.forEach(k => { s[k] += n(k); });
        if (T[r.team]) T[r.team][imp[pid] ? 'imp' : 'loc'] += n('pts');
        if (!(minsToNum(r.min) > 0)) return;
        const q = P[pid] = P[pid] || {pid, t: r.team, g: 0, min: 0, pts: 0, fga: 0, fta: 0, twopm: 0, tpm: 0, ftm: 0, reb: 0, ast: 0};
        q.t = r.team; q.g++; q.min += minsToNum(r.min); q.pts += n('pts'); q.fga += n('fga'); q.fta += n('fta'); q.twopm += n('twopm'); q.tpm += n('tpm'); q.ftm += n('ftm');
        q.reb += n('oreb') + n('dreb'); q.ast += n('ast');
      });
      const poss = s => s.fga - s.oreb + s.tov + .44 * s.fta;
      [[g.h, g.a], [g.a, g.h]].forEach(([me, op]) => {
        const t = T[me]; if (!t) return;
        const a = side[me], o = side[op];
        t.g++; MA_K.forEach(k => { t[k] += a[k]; });
        t.opp += o.pts; t.poss += poss(a); t.oposs += poss(o); t.ooreb += o.oreb; t.odreb += o.dreb;
        t[a.pts > o.pts ? 'w' : 'l']++;
      });
    });
    // fouls by kind, from the play-by-play (side 1 is the home team)
    const techs = {};
    const fl = maFouls();
    (fl || []).forEach(([mid, team, name, kind, pid]) => {
      const t = T[team]; if (!t) return;
      const k = /^Technical/.test(kind) ? 'tech' : /^Bench technical/.test(kind) ? 'bench' : /^Flagrant/.test(kind) ? 'flag'
        : /^Disruptive/.test(kind) ? 'dis' : /^Offensive/.test(kind) ? 'off' : 'pf';
      t.f[k]++;
      if (k === 'tech' || k === 'flag' || k === 'dis') { const key = team + '|' + (pid || name), x = techs[key] = techs[key] || {team, name, pid, tech: 0, flag: 0, dis: 0}; x[k]++; }
    });
    const teams = Object.values(T).filter(t => t.g);
    teams.forEach(t => { t.ortg = t.poss ? t.pts / t.poss * 100 : 0; t.drtg = t.oposs ? t.opp / t.oposs * 100 : 0; t.pace = (t.poss + t.oposs) / 2 / Math.max(1, t.g); });
    const L = teams.reduce((a, t) => { ['pts', 'poss', 'ftm', 'fta', 'tov', 'g', 'loc', 'imp'].forEach(k => { a[k] = (a[k] || 0) + t[k]; }); return a; }, {});
    return (MA = {teams, P: Object.values(P), techs: Object.values(techs), fouls: !!fl, nG, L, ortg: L.poss ? L.pts / L.poss * 100 : 0});
  }
  const maT = n => S.teams.find(t => t.name === n);
  const maCrest = (n, sz) => logo(n) ? `<img src="${logo(n)}" alt="" width="${sz}" height="${sz}">` : '';
  const maOn = n => ST.at && ST.at === n ? ' on' : '';
  const maDim = () => ST.at ? ' data-dim="1"' : '';

  function maDonut(name, loc, imp, big) {
    const tot = loc + imp || 1, R = big ? 50 : 42, C = 2 * Math.PI * R, gap = 2.5, li = loc / tot * C, ii = imp / tot * C, sz = (R + 12) * 2;
    const tip = `${name ? name : 'Whole league'}\nLocal ${loc} pts (${maPct(loc / tot)})\nImport ${imp} pts (${maPct(imp / tot)})`;
    return `<div class="ma-dn${big ? ' lg' : ''}${name ? ' ma-t' + maOn(name) : ''}" data-tip="${esc(tip)}">
      <svg viewBox="0 0 ${sz} ${sz}" role="img" aria-label="${esc(tip.replace(/\n/g, ', '))}"><g transform="rotate(-90 ${sz / 2} ${sz / 2})">
        <circle class="seg a" cx="${sz / 2}" cy="${sz / 2}" r="${R}" stroke="var(--ma-2)" stroke-dasharray="${Math.max(0, ii - gap).toFixed(1)} ${C.toFixed(1)}"/>
        <circle class="seg a" cx="${sz / 2}" cy="${sz / 2}" r="${R}" stroke="var(--ma-1)" stroke-dasharray="${Math.max(0, li - gap).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-ii).toFixed(1)}" style="animation-delay:.15s"/></g>
        <text class="pc" x="50%" y="${sz / 2 + 3}" text-anchor="middle">${Math.round(imp / tot * 100)}%</text><text class="pl" x="50%" y="${sz / 2 + 17}" text-anchor="middle">IMPORT</text></svg>
      <b>${name ? maCrest(name, 18) + esc(short(name)) : 'MBL ' + esc(S.title.replace(/^20/, ''))}</b><small>${Math.round(loc / tot * 100)}% local</small></div>`;
  }
  function maWho(m) {
    const ts = [...m.teams].sort((a, b) => b.imp / (b.imp + b.loc) - a.imp / (a.imp + a.loc)), hi = ts[0], lo = ts[ts.length - 1], sh = t => Math.round(t.imp / (t.imp + t.loc) * 100);
    return `<div class="ma-h"><h3>Who scores</h3><span>Points by local and import players</span><span class="ma-lg"><span><i style="background:var(--ma-1)"></i>Local</span><span><i style="background:var(--ma-2)"></i>Import</span></span></div>
      <p class="ma-kick">Imports have scored <b>${Math.round(m.L.imp / (m.L.imp + m.L.loc) * 100)}%</b> of the league's points. <b>${esc(short(hi.name))}</b> lean on them most (${sh(hi)}%), <b>${esc(short(lo.name))}</b> least (${sh(lo)}%).</p>
      <div class="ma-donuts">${maDonut('', m.L.loc, m.L.imp, 1)}${ts.map(t => maDonut(t.name, t.loc, t.imp)).join('')}</div>`;
  }
  // one row per team: crest, then a bar of segments, then the value
  function maRow(t, i, segs, val, sub, rk, extra) {
    return `<div class="ma-row ma-t${maOn(t.name)}"><span class="rk">${rk != null ? rk : ''}</span><span class="tm">${maCrest(t.name, 22)}<span>${esc(short(t.name))}</span>${extra || ''}</span>
      <div class="ma-track">${segs}</div><span class="v">${val}${sub ? `<small>${sub}</small>` : ''}</span></div>`;
  }
  const maSeg = (w, col, label, tip, i) => w > 0 ? `<span class="ma-seg" style="width:${w.toFixed(2)}%;background:${col};animation-delay:${(i * .06).toFixed(2)}s" data-tip="${esc(tip)}">${w >= 13 ? label : ''}</span>` : '';
  function maHow(m) {
    const ts = [...m.teams].sort((a, b) => b.pts / b.g - a.pts / a.g);
    const rows = ts.map((t, i) => {
      const p2 = t.twopm * 2, p3 = t.tpm * 3, ft = t.ftm, all = p2 + p3 + ft || 1;
      return maRow(t, i, maSeg(p2 / all * 100, 'var(--ma-1)', maPct(p2 / all).replace(/\.\d/, ''), `${t.name}\n2PT ${p2} pts · ${maPct(p2 / all)}\n${t.twopm}/${t.twopa} (${maPct(t.twopm / (t.twopa || 1))})`, i)
        + maSeg(p3 / all * 100, 'var(--ma-2)', maPct(p3 / all).replace(/\.\d/, ''), `${t.name}\n3PT ${p3} pts · ${maPct(p3 / all)}\n${t.tpm}/${t.tpa} (${maPct(t.tpm / (t.tpa || 1))})`, i)
        + maSeg(ft / all * 100, 'var(--ma-3)', maPct(ft / all).replace(/\.\d/, ''), `${t.name}\nFree throws ${ft} pts · ${maPct(ft / all)}\n${t.ftm}/${t.fta} (${maPct(t.ftm / (t.fta || 1))})`, i),
        maR(t.pts / t.g), 'PPG', i + 1);
    }).join('');
    const b3 = [...m.teams].sort((a, b) => b.tpm * 3 / b.pts - a.tpm * 3 / a.pts)[0];
    return `<div class="ma-h"><h3>How they score</h3><span>Share of points</span><span class="ma-lg"><span><i style="background:var(--ma-1)"></i>2PT</span><span><i style="background:var(--ma-2)"></i>3PT</span><span><i style="background:var(--ma-3)"></i>Free throw</span></span></div>
      <p class="ma-kick"><b>${esc(short(b3.name))}</b> get the most from deep: ${maPct(b3.tpm * 3 / b3.pts)} of their points are threes.</p>
      <div class="ma-rows">${rows}</div>`;
  }
  function maEff(m) {
    const W = 560, H = 340, pl = 56, pr = 16, pt = 18, pb = 40;
    const xs = m.teams.map(t => t.ortg), ys = m.teams.map(t => t.drtg);
    const lo = Math.floor(Math.min(...xs, ...ys) - 4), hi = Math.ceil(Math.max(...xs, ...ys) + 4);
    const x = v => pl + (v - lo) / (hi - lo) * (W - pl - pr), y = v => pt + (v - lo) / (hi - lo) * (H - pt - pb);   // lower DRtg sits higher
    const step = (hi - lo) > 24 ? 10 : 5, ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    let g = ticks.map(v => `<line class="gl" x1="${x(v)}" x2="${x(v)}" y1="${pt}" y2="${H - pb}"/><text class="tx" x="${x(v)}" y="${H - pb + 16}" text-anchor="middle">${v}</text>
      <line class="gl" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="tx" x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    g += `<line class="av" x1="${x(m.ortg)}" x2="${x(m.ortg)}" y1="${pt}" y2="${H - pb}"/><line class="av" x1="${pl}" x2="${W - pr}" y1="${y(m.ortg)}" y2="${y(m.ortg)}"/>
      <text class="qd" x="${W - pr - 4}" y="${pt + 12}" text-anchor="end">Good O · Good D</text><text class="qd" x="${pl + 6}" y="${pt + 12}">Defence first</text>
      <text class="qd" x="${W - pr - 4}" y="${H - pb - 8}" text-anchor="end">Outscore them</text><text class="qd" x="${pl + 6}" y="${H - pb - 8}">Struggling</text>
      <text class="tx" x="${(pl + W - pr) / 2}" y="${H - 4}" text-anchor="middle">Offensive rating · points scored per 100 possessions →</text>
      <text class="tx" transform="translate(11 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle">Defensive rating · allowed per 100 (↑ better)</text>`;
    g += m.teams.map((t, i) => { const cx = x(t.ortg), cy = y(t.drtg), l = logo(t.name);
      return `<g class="ma-dot${maOn(t.name)}" style="animation-delay:${(.1 + i * .07).toFixed(2)}s" data-tip="${esc(`${t.name}  ${t.w}–${t.l}\nOffensive rating ${maR(t.ortg)}\nDefensive rating ${maR(t.drtg)}\nNet ${t.ortg - t.drtg >= 0 ? '+' : ''}${maR(t.ortg - t.drtg)} · pace ${maR(t.pace)}`)}">
        <circle class="ring" cx="${cx}" cy="${cy}" r="17"/>${l ? `<image href="${l}" x="${cx - 12}" y="${cy - 12}" width="24" height="24"/>` : ''}
        <text class="nm" x="${cx}" y="${cy + 31}" text-anchor="middle">${esc(short(t.name))}</text></g>`; }).join('');
    const best = [...m.teams].sort((a, b) => (b.ortg - b.drtg) - (a.ortg - a.drtg))[0];
    return `<div class="ma-h"><h3>Efficiency</h3><span>Points per 100 possessions</span></div>
      <p class="ma-kick">League average ${maR(m.ortg)} (dashed). Best net rating: <b>${esc(short(best.name))}</b>, ${best.ortg - best.drtg >= 0 ? '+' : ''}${maR(best.ortg - best.drtg)}.</p>
      <div class="ma-sc"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Offensive against defensive rating by team">${g}</svg></div>`;
  }
  function maGlass(m) {
    const ts = [...m.teams].sort((a, b) => (b.oreb + b.dreb) / b.g - (a.oreb + a.dreb) / a.g), mx = Math.max(...ts.map(t => (t.oreb + t.dreb) / t.g));
    const rows = ts.map((t, i) => { const d = t.dreb / t.g, o = t.oreb / t.g, op = t.oreb / ((t.oreb + t.odreb) || 1);
      return maRow(t, i, maSeg(d / mx * 100, 'var(--ma-1)', maR(d), `${t.name}\nDefensive ${maR(d)} per game\nDREB% ${maPct(t.dreb / ((t.dreb + t.ooreb) || 1))}`, i)
        + maSeg(o / mx * 100, 'var(--ma-2)', maR(o), `${t.name}\nOffensive ${maR(o)} per game\nOREB% ${maPct(op)} of their misses`, i), maR(d + o), 'RPG', i + 1); }).join('');
    const bo = [...m.teams].sort((a, b) => b.oreb / (b.oreb + b.odreb) - a.oreb / (a.oreb + a.odreb))[0];
    return `<div class="ma-h"><h3>Rebounds</h3><span>Per game</span><span class="ma-lg"><span><i style="background:var(--ma-1)"></i>Defensive</span><span><i style="background:var(--ma-2)"></i>Offensive</span></span></div>
      <p class="ma-kick"><b>${esc(short(bo.name))}</b> win back the most of their own misses: ${maPct(bo.oreb / (bo.oreb + bo.odreb))}.</p>
      <div class="ma-rows">${rows}</div>`;
  }
  function maTov(m) {
    const ts = [...m.teams].sort((a, b) => a.tov / a.g - b.tov / b.g), mx = Math.max(...ts.map(t => t.tov / t.g)), av = m.L.tov / m.L.g;
    const rows = ts.map((t, i) => maRow(t, i, `<span class="ma-seg" style="width:${(t.tov / t.g / mx * 100).toFixed(1)}%;background:var(--ma-1);animation-delay:${(i * .06).toFixed(2)}s" data-tip="${esc(`${t.name}\n${maR(t.tov / t.g)} turnovers per game\n${t.ast} assists · AST/TO ${maR(t.ast / (t.tov || 1), 2)}\nTOV% ${maPct(t.tov / (t.poss || 1))} of possessions`)}"></span><span class="avg" style="left:${(av / mx * 100).toFixed(1)}%"></span>`,
      maR(t.tov / t.g), `AST/TO ${maR(t.ast / (t.tov || 1), 2)}`, i + 1)).join('');
    const ba = [...m.teams].sort((a, b) => b.ast / (b.tov || 1) - a.ast / (a.tov || 1))[0];
    return `<div class="ma-h"><h3>Ball security</h3><span>Turnovers per game · fewest first</span><span class="ma-lg"><span><i style="background:var(--text);opacity:.55;width:2px"></i>League average ${maR(av)}</span></span></div>
      <p class="ma-kick"><b>${esc(short(ts[0].name))}</b> give the ball away least, ${maR(ts[0].tov / ts[0].g)} a game. Best assist-to-turnover: <b>${esc(short(ba.name))}</b>, ${maR(ba.ast / (ba.tov || 1), 2)}.</p>
      <div class="ma-rows">${rows}</div>`;
  }
  function maFt(m) {
    const ts = [...m.teams].sort((a, b) => b.ftm / (b.fta || 1) - a.ftm / (a.fta || 1)), av = m.L.ftm / (m.L.fta || 1);
    const rows = ts.map((t, i) => { const p = t.ftm / (t.fta || 1);
      return maRow(t, i, `<span class="ma-seg" style="width:${(p * 100).toFixed(1)}%;background:var(--ma-3);animation-delay:${(i * .06).toFixed(2)}s" data-tip="${esc(`${t.name}\n${t.ftm}/${t.fta} free throws · ${maPct(p)}\n${maR(t.fta / t.g)} attempts per game`)}"></span><span class="avg" style="left:${(av * 100).toFixed(1)}%"></span>`,
        maPct(p), `${maR(t.fta / t.g)} FTA/G`, i + 1); }).join('');
    return `<div class="ma-h"><h3>Free throws</h3><span>Made of attempted</span><span class="ma-lg"><span><i style="background:var(--text);opacity:.55;width:2px"></i>League ${maPct(av)}</span></span></div>
      <div class="ma-rows">${rows}</div>`;
  }
  // a name in the play-by-play ("Lim Jun Wei Lim") to the player on that team's roster with the most words in common
  function maPid(team, name) {
    const t = maT(team), w = new Set(String(name).toUpperCase().split(/[\s,]+/).filter(Boolean));
    let best = null, n = 1;
    (t ? t.roster : []).forEach(p => { const k = personName(p.pid).toUpperCase().split(/[\s,]+/).filter(x => w.has(x)).length; if (k > n) { n = k; best = p.pid; } });
    return best;
  }
  function maDisc(m) {
    const ts = [...m.teams].sort((a, b) => (a.f.pf + a.f.off) / a.g - (b.f.pf + b.f.off) / b.g);
    const pill = (v, hot) => `<span class="ma-pill${v && hot ? ' hot' : ''}">${v}</span>`;
    const rows = ts.map(t => `<tr class="ma-t${maOn(t.name)}"><td><span class="tm">${maCrest(t.name, 20)}${esc(short(t.name))}</span></td><td><b>${maR((t.f.pf + t.f.off + t.f.tech + t.f.flag + t.f.dis) / t.g)}</b></td>
      <td>${pill(t.f.off)}</td><td>${pill(t.f.tech + t.f.bench, 1)}</td><td>${pill(t.f.dis, 1)}</td><td>${pill(t.f.flag, 1)}</td></tr>`).join('');
    if (!m.fouls) return `<div class="ma-h"><h3>Discipline</h3><span>Fouls from the play-by-play</span></div><div class="ma-note">${typeof PBP_ST !== 'undefined' && PBP_ST[S.cid] === 'error' ? 'The play-by-play could not be loaded.' : 'Loading the play-by-play…'}</div>`;
    const who = m.techs.map(x => Object.assign({}, x, {pid: x.pid || maPid(x.team, x.name)})).sort((a, b) => (b.tech + b.flag * 2 + b.dis) - (a.tech + a.flag * 2 + a.dis));
    return `<div class="ma-h"><h3>Discipline</h3><span>Fouls from the play-by-play</span></div>
      <div class="ma-tw"><table class="ma-tbl"><thead><tr><th>Team</th><th>Fouls/G</th><th title="Offensive fouls">Offensive</th><th title="Technical fouls, players and bench">Technical</th><th title="Disruptive fouls">Disruptive</th><th title="Flagrant fouls">Flagrant</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${who.length ? `<div class="ma-who"><h4>Players on the sheet</h4>${who.slice(0, 6).map(x => `<div class="ma-pr ma-t${maOn(x.team)}"><span class="ma-ph">${x.pid ? face(x.pid) : esc(initials(x.name))}</span>
        <span class="n"><b>${esc(x.pid ? personName(x.pid) : x.name)}</b><small>${esc(short(x.team))}</small></span>
        <span>${[x.tech ? `${x.tech} T` : '', x.dis ? `${x.dis} D` : '', x.flag ? `${x.flag} F` : ''].filter(Boolean).map(v => `<span class="ma-pill hot">${v}</span>`).join(' ')}</span></div>`).join('')}</div>` : ''}
      <div class="ma-note">T technical · D disruptive · F flagrant</div>`;
  }
  // players: scoring volume against efficiency (true shooting)
  function maScorers(m) {
    const ps = m.P.filter(p => p.g >= Math.max(2, Math.ceil(m.nG / S.teams.length * .4)) && p.fga + .44 * p.fta >= 15);
    const ts = p => p.pts / (2 * (p.fga + .44 * p.fta));
    const W = 560, H = 320, pl = 56, pr = 16, pt = 14, pb = 40;
    const xv = ps.map(p => p.pts / p.g), yv = ps.map(ts);
    const x0 = 0, x1 = Math.ceil((Math.max(...xv, 10) + 2) / 5) * 5, y0 = Math.floor(Math.min(...yv, .4) * 20) / 20, y1 = Math.ceil(Math.max(...yv, .65) * 20) / 20;
    const x = v => pl + (v - x0) / (x1 - x0) * (W - pl - pr), y = v => H - pb - (v - y0) / (y1 - y0) * (H - pt - pb);
    let g = '';
    for (let v = 0; v <= x1; v += 5) g += `<line class="gl" x1="${x(v)}" x2="${x(v)}" y1="${pt}" y2="${H - pb}"/><text class="tx" x="${x(v)}" y="${H - pb + 16}" text-anchor="middle">${v}</text>`;
    for (let v = y0; v <= y1 + 1e-9; v += .05) g += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="tx" x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
    g += `<text class="tx" x="${(pl + W - pr) / 2}" y="${H - 4}" text-anchor="middle">Points per game →</text><text class="tx" transform="translate(11 ${(pt + H - pb) / 2}) rotate(-90)" text-anchor="middle">True shooting %</text>`;
    const placed = [], last = n => personName(n).split(/[ ,]+/).filter(w => !/^(jr|sr|ii|iii|iv)$/i.test(w)).slice(-1)[0] || '';
    // a label goes right of its dot, or below, left or above it: wherever it does not cover another label
    const spot = (cx, cy, txt) => { const w = txt.length * 6.4 + 4; for (const [dx, dy, a] of [[10, 4, 'start'], [10, 16, 'start'], [-10, 4, 'end'], [10, -8, 'start'], [-10, 16, 'end'], [-10, -8, 'end']]) {
        const x0 = a === 'start' ? cx + dx : cx + dx - w, bx = [x0, cy + dy - 10, x0 + w, cy + dy + 2];
        if (bx[2] > W - 2 || bx[0] < pl) continue;
        if (!placed.some(q => q[0] < bx[2] && bx[0] < q[2] && q[1] < bx[3] && bx[1] < q[3])) { placed.push(bx); return `<text class="nm" x="${cx + dx}" y="${cy + dy}" text-anchor="${a}">${esc(txt)}</text>`; } }
      return ''; };
    const lab = new Set([...ps].sort((a, b) => b.pts / b.g - a.pts / a.g).slice(0, 5).concat([...ps].sort((a, b) => ts(b) - ts(a)).slice(0, 2)).map(p => p.pid));
    ps.sort((a, b) => b.pts / b.g - a.pts / a.g);
    ps.forEach(p => { const cx = x(p.pts / p.g), cy = y(ts(p)); placed.push([cx - 7, cy - 7, cx + 7, cy + 7]); });   // labels keep off the dots too
    g += ps.map((p, i) => { const im = maT(p.t) && (maT(p.t).roster.find(r => r.pid === p.pid) || {}).nat !== 'MAS', cx = x(p.pts / p.g), cy = y(ts(p));
      return `<g class="ma-dot${maOn(p.t)}" style="animation-delay:${(.1 + Math.min(i, 30) * .02).toFixed(2)}s" data-tip="${esc(`${personName(p.pid)} · ${short(p.t)}\n${maR(p.pts / p.g)} PPG in ${p.g} games\nTS ${maPct(ts(p))} · ${p.tpm} threes`)}">
        <circle cx="${cx}" cy="${cy}" r="6.5" fill="${im ? 'var(--ma-2)' : 'var(--ma-1)'}" stroke="var(--surface)" stroke-width="2"/>
        ${lab.has(p.pid) ? spot(cx, cy, last(p.pid)) : ''}</g>`; }).join('');
    return `<div class="ma-h"><h3>Volume and efficiency</h3><span>${ps.length} players with enough shots</span><span class="ma-lg"><span><i style="background:var(--ma-1);border-radius:50%"></i>Local</span><span><i style="background:var(--ma-2);border-radius:50%"></i>Import</span></span></div>
      <div class="ma-sc"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points per game against true shooting percentage">${g}</svg></div>`;
  }
  function maProfile(m) {
    const ps = [...m.P].filter(p => p.g >= 2).sort((a, b) => b.pts / b.g - a.pts / a.g).slice(0, 8);
    const rows = ps.map((p, i) => { const p2 = p.twopm * 2, p3 = p.tpm * 3, ft = p.ftm, all = p2 + p3 + ft || 1;
      return `<a class="ma-row ma-prow ma-t${maOn(p.t)}" href="#/p/${esc(p.pid)}"><span class="rk">${i + 1}</span><span class="tm"><span class="ma-ph">${face(p.pid)}</span><span>${esc(personName(p.pid))}</span></span>
        <div class="ma-track">${maSeg(p2 / all * 100, 'var(--ma-1)', Math.round(p2 / all * 100) + '%', `${personName(p.pid)}\n2PT ${p2} pts`, i)}${maSeg(p3 / all * 100, 'var(--ma-2)', Math.round(p3 / all * 100) + '%', `${personName(p.pid)}\n3PT ${p3} pts (${p.tpm} made)`, i)}${maSeg(ft / all * 100, 'var(--ma-3)', Math.round(ft / all * 100) + '%', `${personName(p.pid)}\nFree throws ${ft} pts`, i)}</div>
        <span class="v">${maR(p.pts / p.g)}<small>PPG</small></span></a>`; }).join('');
    return `<div class="ma-h"><h3>Top scorers' diet</h3><span>Share of each player's points</span><span class="ma-lg"><span><i style="background:var(--ma-1)"></i>2PT</span><span><i style="background:var(--ma-2)"></i>3PT</span><span><i style="background:var(--ma-3)"></i>FT</span></span></div>
      <div class="ma-rows">${rows}</div>`;
  }
  function analysis() {
    const has = typeof HS === 'undefined' || HS.hasBoxes(), m = has ? maModel() : null;
    const head = `<div class="mb-sh"><h2>Analysis</h2><span class="mb-sub">${m ? `${m.nG} game${m.nG === 1 ? '' : 's'} this season · teams and players` : 'Loading the box scores…'}</span>
      <div class="mb-tools"><div class="mb-tf" role="group" aria-label="Highlight a team"><button type="button" data-mat="" aria-pressed="${!ST.at}">All</button>${S.teams.map(t => `<button type="button" class="t" data-mat="${esc(t.name)}" style="--h:${t.hue}" aria-pressed="${ST.at === t.name}" title="${esc(t.name)}" aria-label="${esc(t.name)}">${logo(t.name) ? `<img src="${logo(t.name)}" alt="">` : esc(short(t.name))}</button>`).join('')}</div></div></div>`;
    if (!m || !m.nG) return head + `<div class="mb-empty">${m ? 'The analysis starts after the first game' : 'The analysis appears once the box scores are in'}</div>`;
    const card = (html, cls, i) => `<section class="mb-card ma-c${cls ? ' ' + cls : ''}"${maDim()} style="animation-delay:${(i * .05).toFixed(2)}s">${html}</section>`;
    return head + `<div class="ma-grid">${card(maWho(m), 'wide', 0)}${card(maHow(m), '', 1)}${card(maEff(m), '', 2)}${card(maGlass(m), '', 3)}${card(maTov(m), '', 4)}${card(maFt(m), '', 5)}${card(maDisc(m), '', 6)}</div>
      <div class="mb-sh" style="margin-top:10px"><h2 style="font-size:20px">Players</h2><span class="mb-sub">Everyone with minutes this season</span></div>
      <div class="ma-grid">${card(maScorers(m), '', 7)}${card(maProfile(m), '', 8)}</div>`;
  }

  /* ---------- page ---------- */
  /* ---------- the page is tabs (update-109): one section at a time, the tab in the address (/mbl/players/) ---------- */
  const TABS = [['mb-over', 'Overview', ''], ['mb-games', 'Games', 'games'], ['mb-stand', 'Standings', 'standings'], ['mb-stats', 'Leaders', 'leaders'],
    ['mb-teams', 'Teams', 'teams'], ['mb-players', 'Players', 'players'], ['mb-rec', 'Records', 'records'], ['mb-miles', 'Milestones', 'milestones'], ['mb-ana', 'Analysis', 'analysis']];
  function tabFromUrl() {
    const m = /^#\/mbl\/([a-z]+)/.exec(typeof HS !== 'undefined' ? HS.hash() : '');
    const t = m && TABS.find(x => x[2] === m[1]);
    ST.sec = t ? t[0] : 'mb-over';
  }
  function tabToUrl() {
    if (typeof HS === 'undefined' || !HS.PATHS || !/^#\/mbl\b/.test(HS.hash())) return;
    const t = TABS.find(x => x[0] === ST.sec), slug = t ? t[2] : '';
    try { history.replaceState(history.state, '', HS.url('mbl' + (slug ? '/' + slug : ''))); } catch (e) {}
    if (typeof hsApplyMeta === 'function') { try { hsApplyMeta(HS.hash()); } catch (e) {} }
  }
  const more = (id, l) => `<a class="mbo-more" href="#${id}">${l}<span aria-hidden="true">→</span></a>`;

  /* ---------- overview: the season at a glance ---------- */
  function overview() {
    const gs = [...S.games].sort((a, b) => tipAt(a) - tipAt(b)), fin = gs.filter(done);
    const tot = fin.reduce((a, g) => a + +g.hs + +g.as, 0);
    const close = fin.filter(g => Math.abs(g.hs - g.as) <= 5).length;
    const big = fin.slice().sort((a, b) => Math.abs(b.hs - b.as) - Math.abs(a.hs - a.as))[0];
    const high = fin.slice().sort((a, b) => (+b.hs + +b.as) - (+a.hs + +a.as))[0];
    const wl = g => +g.hs > +g.as ? [g.h, g.hs, g.a, g.as] : [g.a, g.as, g.h, g.hs];
    const tile = (k, v, sub, tip) => `<div class="mbo-tile"><span class="k"${tip ? ` data-imtip="${esc(tip)}"` : ''}>${k}</span><b>${v}</b><span class="s">${sub}</span></div>`;
    const tiles = fin.length ? `<div class="mbo-tiles">
      ${tile('Points per game', (tot / fin.length / 2).toFixed(1), `per team, ${fin.length} game${fin.length === 1 ? '' : 's'}`)}
      ${tile('Close games', `${close}<small>/${fin.length}</small>`, 'decided by 5 or fewer')}
      ${big ? (() => { const [w, ws, l, ls] = wl(big); return tile('Biggest win', '+' + (ws - ls), `${esc(short(w))} ${ws}–${ls} ${esc(short(l))}`); })() : ''}
      ${high ? (() => { const [w, ws, l, ls] = wl(high); return tile('Highest scoring', +ws + +ls, `${esc(short(w))} ${ws}–${ls} ${esc(short(l))}`); })() : ''}</div>` : '';
    const rows = standings();
    const table = `<section class="mb-card mbo-card"><header><h2>Standings</h2>${more('mb-stand', 'Full standings')}</header>
      <table class="mbo-st"><thead><tr><th>#</th><th class="l">Team</th><th>W</th><th>L</th><th>Diff</th><th class="l f">Last 5</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td class="pos">${r.gp ? i + 1 : '–'}</td><td class="l tm">${crestI(r.team, 24)}<a href="#mb-teams" data-mbteam="${esc(r.team)}">${esc(r.team)}</a></td><td>${r.w}</td><td>${r.l}</td>
        <td class="${r.diff > 0 ? 'pos-d' : r.diff < 0 ? 'neg-d' : ''}">${r.diff > 0 ? '+' : ''}${r.diff}</td><td class="l f"><span class="mb-l5">${r.res.slice(-5).map(x => `<i class="${x}">${x.toUpperCase()}</i>`).join('')}</span></td></tr>`).join('')}</tbody></table></section>`;
    const up = gs.filter(g => !done(g)).slice(0, 4), last = fin.slice(-4).reverse();
    const list = (h, id, l, arr) => arr.length ? `<section class="mb-card mbo-card"><header><h2>${h}</h2>${more(id, l)}</header><div class="mbo-gms">${arr.map(g => `<div class="mbo-g"><div class="mbo-d">${dlong(g.date)}${done(g) ? ' · Final' : ' · ' + hm(g.time)}</div>${gameRow(g)}</div>`).join('')}</div></section>` : '';
    const on = new Map(players().map(p => [p.pid, p])), season = (S.c.players || []).filter(r => r.g && on.has(r.pid));
    const gmax = Math.max(1, ...rows.map(r => r.gp)), min = Math.max(1, Math.ceil(gmax * .4));
    const lead = season.length ? [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists']].map(([k, l]) => {
      const top = season.filter(r => r.g >= min).map(r => ({r, v: per(r, k)})).sort((a, b) => b.v - a.v).slice(0, 3);
      return `<div class="mbo-lc"><h3>${l} per game</h3>${top.map(({r, v}, i) => `<a class="mbo-lr" href="#/p/${esc(r.pid)}"><span class="ph">${face(r.pid)}</span><span class="n"><b>${esc(personName(r.pid))}</b><small>${crestI(on.get(r.pid).team, 14)}${esc(short(on.get(r.pid).team))}</small></span><span class="v">${v.toFixed(1)}</span></a>`).join('')}</div>`; }).join('') : '';
    return `<div class="mb-sh"><h2>Overview</h2><span class="mb-sub">${fin.length} of ${gs.length} games played</span></div>${tiles}
      <div class="mbo-grid"><div class="mbo-main">${table}${list('Next up', 'mb-games', 'All games', up)}${list('Latest results', 'mb-games', 'All results', last)}</div>
      ${lead ? `<aside class="mb-card mbo-card mbo-lead"><header><h2>Leaders</h2>${more('mb-stats', 'All categories')}</header>${lead}<p class="mbo-note">This season · at least ${min} game${min === 1 ? '' : 's'}</p></aside>` : ''}</div>`;
  }

  /* ---------- players: every line of the season, four views (the competition's own table, app4_players.js) ---------- */
  function playersTab() {
    const n = (S.c.players || []).filter(r => r.g).length;
    return `<div class="mb-sh"><h2>Players</h2><span class="mb-sub">${n} players · switch between Per game, Totals, Shooting and Advanced</span></div>
      <div id="players-body" class="mbo-players" data-cid="${esc(S.cid)}">${typeof compPlayersTable === 'function' ? compPlayersTable(S.cid) : ''}</div>`;
  }

  function render() {
    S = season(); CAR = null; MRL = null; ST.rswap = false; MA = null; MAF = null;
    if (!S) return '<div class="page"><h1 class="page-title">MBL</h1><p>No MBL season in the database.</p></div>';
    tabFromUrl(); JUMP = ST.sec !== 'mb-over';
    return `<div class="mb-page tabs">${hero()}
      <nav class="mb-snav" aria-label="Season sections"><div class="mb-snav-in"><span class="mb-snav-logo">${COMPLOGOS['mbl-mark'] ? `<img src="${COMPLOGOS['mbl-mark']}" alt="MBL" width="54" height="22">` : ''}<b>${esc(S.title.replace(/^20/, ''))}</b></span><span class="mb-pill"></span>
        ${TABS.map(([id, l]) => `<a href="#${id}"${ST.sec === id ? ' class="on" aria-current="page"' : ''}>${l}${id === 'mb-games' ? `<small>${S.games.length}</small>` : id === 'mb-players' ? `<small>${(S.c.players || []).filter(r => r.g).length}</small>` : ''}</a>`).join('')}</div></nav>
      <div class="mb-wrap">
        <section class="mb-sec${ST.sec === 'mb-over' ? ' on' : ''}" id="mb-over">${overview()}</section>
        <section class="mb-sec" id="mb-games">${games()}</section>
        <section class="mb-sec" id="mb-stand">${stand()}</section>
        <section class="mb-sec" id="mb-teams">${teams()}</section>
        <section class="mb-sec" id="mb-players">${playersTab()}</section>
        <section class="mb-sec" id="mb-stats">${stats()}</section>
        <section class="mb-sec" id="mb-rec">${records()}</section>
        <section class="mb-sec" id="mb-miles">${miles()}</section>
        <section class="mb-sec" id="mb-ana">${analysis()}</section>
      </div><div class="mb-tip" id="mb-tip" aria-hidden="true"></div><div class="ma-tip" id="ma-tip" aria-hidden="true"></div></div>`;
  }
  const paint = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; segInd(); };
  function mrPaint() { ST.rswap = true; paint('mb-rec', records()); mrCount(document.getElementById('mb-rec')); }
  function mrPane(id, f) { const el = document.getElementById(id); if (!el) return; el.innerHTML = f(mrLines().filter(mrKeep)); segInd(); mrCount(el); }
  const phone = () => typeof PH !== 'undefined' && PH.on();
  // on a phone the sections are tabs: one is shown at a time
  function phSections() {
    const pg = document.querySelector('.mb-page'); if (!pg) return;
    pg.classList.toggle('ph', phone());
    pg.querySelectorAll('.mb-wrap > .mb-sec').forEach(s => s.classList.toggle('on', s.id === ST.sec));
    pg.querySelectorAll('.mb-snav a').forEach(a => { const on = a.getAttribute('href') === '#' + ST.sec; if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function spy() {
    const links = [...document.querySelectorAll('.mb-snav a')];
    if (!links.length) return;
    const cur = links.find(a => a.getAttribute('href') === '#' + ST.sec) || links[0];
    links.forEach(a => a.classList.toggle('on', a === cur));
    const pill = document.querySelector('.mb-pill');
    if (pill) { pill.style.width = cur.offsetWidth + 'px'; pill.style.transform = `translateX(${cur.offsetLeft}px)`; }
  }
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('click', e => {
      if (!document.querySelector('.mb-page')) return;
      const snav = e.target.closest('.mb-snav a, .mb-crests a, a[href^="#mb-"]');
      if (snav && !e.target.closest('[data-mbteam]')) {
        e.preventDefault();
        const id = snav.getAttribute('href').slice(1), s = document.getElementById(id);
        if (s && s.classList.contains('mb-sec')) {
          ST.sec = id; phSections(); spy(); segInd(); tabToUrl();
          const bar = document.querySelector('.mb-snav'), y = bar ? bar.getBoundingClientRect().top + scrollY - (phone() ? 58 : 64) : 0;
          if (scrollY > y) scrollTo({top: y, behavior: 'auto'});
          if (id === 'mb-teams') tour();
          return;
        }
        if (s) s.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        return;
      }
      const lg = e.target.closest('[data-mbleg]');
      if (lg) { ST.leg = +lg.dataset.mbleg; paint('mb-games', games()); const c = document.querySelector(`[data-mbleg="${ST.leg}"]`); if (c) c.scrollIntoView({block: 'nearest', inline: 'center'}); return; }
      const tf = e.target.closest('[data-mbtf]');
      if (tf) { ST.team = tf.dataset.mbtf || null; paint('mb-games', games()); return; }
      const sg = e.target.closest('.mb-seg button');
      if (sg && !sg.disabled) {
        const id = sg.parentElement.id, v = sg.dataset.v;
        if (id === 'mb-gshow') { ST.show = v; paint('mb-games', games()); }
        if (id === 'mb-rsort') { ST.sort = v; paint('mb-roster', roster()); }
        if (id === 'mb-lseg') { ST.lead = v; paint('mb-stats', stats()); }
        if (id === 'mb-mh') { ST.mh = +v; paint('mb-miles', miles()); }
        if (id === 'mr-scope' && v !== ST.rs) { ST.rs = v; ST.rx = null; mrPaint(); }
        if (id === 'mr-who' && v !== ST.rw) { ST.rw = v; ST.rx = null; mrPaint(); }
        if (id === 'mr-mode' && v !== ST.rm) { ST.rm = v; ST.rx = null; mrPane('mr-stk', mrStreaks); }
        return;
      }
      const mc = e.target.closest('[data-mrc]');
      if (mc) { const c = mc.closest('.mr-c'), op = !c.classList.contains('open'); c.classList.toggle('open', op); mc.setAttribute('aria-expanded', op);
        mc.textContent = op ? 'Show top ' + MR_SHOW : 'Show top ' + (c.querySelectorAll('.mr-r').length + 1);
        if (!op && c.getBoundingClientRect().top < 0) c.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); return; }
      const at = e.target.closest('[data-mat]');
      if (at) { ST.at = at.dataset.mat || null; paint('mb-ana', analysis()); return; }
      const rb = e.target.closest('[data-mrb]');
      if (rb) { ST.rb = rb.dataset.mrb; ST.rx = null; mrPane('mr-big', mrBig); return; }
      const rk = e.target.closest('[data-mrk]');
      if (rk) { ST.rk = rk.dataset.mrk; ST.rx = null; mrPane('mr-stk', mrStreaks); return; }
      const rx = e.target.closest('[data-mrx]');
      if (rx) { const w = rx.dataset.mrx; ST.rx = ST.rx === w ? null : w; mrPane(w === 'big' ? 'mr-big' : 'mr-stk', w === 'big' ? mrBig : mrStreaks); return; }
      const mk = e.target.closest('[data-mbmk]');
      if (mk) { ST.mk = mk.dataset.mbmk; paint('mb-miles', miles()); return; }
      const tm = e.target.closest('[data-mbteam]');
      if (tm) {
        e.preventDefault();
        ST.sel = tm.dataset.mbteam;
        document.querySelectorAll('.mb-tile').forEach(b => b.setAttribute('aria-pressed', b.dataset.mbteam === ST.sel));
        paint('mb-roster', roster()); paint('mb-heights', heights());
        if (tm.tagName === 'A') { ST.sec = 'mb-teams'; phSections(); spy(); tour(); tabToUrl();
          const bar = document.querySelector('.mb-snav'), y = bar ? bar.getBoundingClientRect().top + scrollY - (phone() ? 58 : 64) : 0;
          scrollTo({top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }
        return;
      }
      // a touch screen has no hover: the first tap turns the card over, the second opens the profile
      const pc = e.target.closest('.mb-pc');
      if (pc && matchMedia('(hover: none)').matches && !pc.classList.contains('flip')) {
        e.preventDefault(); document.querySelectorAll('.mb-pc.flip').forEach(x => x.classList.remove('flip')); pc.classList.add('flip');
      }
    });
    document.addEventListener('mousemove', e => {
      const mt = document.getElementById('ma-tip'), mx = e.target.closest && e.target.closest('[data-tip]');
      if (mt) { if (mx && mx.closest('#mb-ana')) { mt.textContent = mx.dataset.tip; mt.classList.add('on');
        mt.style.left = Math.min(innerWidth - mt.offsetWidth - 10, e.clientX + 14) + 'px'; mt.style.top = Math.max(8, e.clientY - mt.offsetHeight - 12) + 'px'; } else mt.classList.remove('on'); }
      const tip = document.getElementById('mb-tip'); if (!tip) return;
      const t = e.target.closest && e.target.closest('[data-mbtip]');
      if (!t) { tip.classList.remove('on'); return; }
      tip.textContent = t.dataset.mbtip; tip.style.left = e.clientX + 12 + 'px'; tip.style.top = e.clientY - 34 + 'px'; tip.classList.add('on');
    });
    addEventListener('scroll', () => { if (document.querySelector('.mb-page')) requestAnimationFrame(spy); }, {passive: true});
    let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (document.querySelector('.mb-page')) { phSections(); tour(); segInd(); spy(); } }, 150); });
  }
  function maLoad() {
    if (typeof ensurePbp !== 'function' || !S || MAF || (typeof HS !== 'undefined' && !HS.hasBoxes())) return;
    ensurePbp(S.cid);
    clearInterval(maWait);
    maWait = setInterval(() => {
      if (!document.getElementById('mb-ana')) { clearInterval(maWait); return; }
      if (PBP_ST[S.cid] === 'loading') return;
      clearInterval(maWait); MA = null; paint('mb-ana', analysis());
    }, 300);
  }
  function after() {
    clearInterval(cdTimer); cdPrev = [];
    if (!document.querySelector('.mb-page')) return;
    if (!S) S = season();
    bind();
    const nx = document.getElementById('mb-next'); if (nx) nx.innerHTML = nextCard();
    phSections(); tour(); segInd(); spy(); maLoad();
    const lc = document.querySelector('[data-mbleg][aria-pressed="true"]'); if (lc && phone()) lc.parentElement.scrollLeft = lc.offsetLeft - 16;
    if (document.getElementById('mb-cd')) { tick(); cdTimer = setInterval(tick, 1000); }
    // opened at a tab's own address (/mbl/players/): start at the tab, not the season header
    if (JUMP) { JUMP = false; const bar = document.querySelector('.mb-snav');
      if (bar) requestAnimationFrame(() => scrollTo({top: bar.getBoundingClientRect().top + scrollY - (phone() ? 58 : 64), behavior: 'auto'})); }
  }
  // the header tab is named after the season: MBL 2026/27
  function tabLabel() { const s = season(); return s ? 'MBL ' + s.title : 'MBL'; }
  return {render, after, tabLabel};
})();
function renderMbl() { return MB.render(); }
function mblAfterRender() { MB.after(); }
