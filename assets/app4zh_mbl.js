/* =========================================================================
   MBL season page (#/mbl): everything about the current Major Basketball
   League season (men) on one page — the countdown or next game, the season's
   route by weekend, games, standings, teams and rosters (flip cards with the
   MBL career on the back), a height lineup, leaders and the milestone watch.
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
    'Selangor Hornbills': 'Selangor', 'Sarawak Cola Warriors': 'Sarawak', 'Putrajaya Parkcity Heat': 'Putrajaya', 'KL Titans': 'KL Titans'};
  // each club's colour, read once from its crest (the main hue of its saturated pixels)
  const HUE = {'NS Matrix Deers': 45, 'KL Titans': 122, 'Penang Sunrise Youngsters': 4, 'Johor Southern Tigers': 216, 'Selangor Hornbills': 16,
    'Sarawak Cola Warriors': 30, 'Putrajaya Parkcity Heat': 20};
  const CITY = {PJ: 'Petaling Jaya', Johor: 'Johor Bahru'};
  const NAT = {MAS: 'Malaysia', USA: 'United States', BRA: 'Brazil', SWE: 'Sweden', UKR: 'Ukraine', GBR: 'Great Britain', ESP: 'Spain', AUS: 'Australia',
    PHI: 'Philippines', SGP: 'Singapore', TPE: 'Chinese Taipei', JPN: 'Japan', CHN: 'China', INA: 'Indonesia', NGR: 'Nigeria', SEN: 'Senegal',
    NZL: 'New Zealand', SSD: 'South Sudan', SUD: 'Sudan', RUS: 'Russia', BUL: 'Bulgaria', KEN: 'Kenya', ZIM: 'Zimbabwe', BOT: 'Botswana',
    COD: 'DR Congo', THA: 'Thailand', VIE: 'Vietnam', BRU: 'Brunei', HKG: 'Hong Kong'};
  const ST = {team: null, show: 'all', sort: 'num', sel: null, lead: null, mk: 'all', mh: 3};
  let S = null, cdTimer = null, cdPrev = [], bound = false;

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
      right = left + Math.max(96, l.games.length * 16, l.cities.join(' · ').length * 6.6);
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
      <div class="mb-legs">${legs().map(l => {
        const gs = l.games.filter(g => ST.show === 'all' || (ST.show === 'res') === done(g));
        if (!gs.length) return '';
        const hasT = !ST.team || gs.some(g => g.h === ST.team || g.a === ST.team);
        const cur = new Date(l.from + 'T00:00:00+08:00') <= now && now <= new Date(l.to + 'T23:59:00+08:00');
        const days = {};
        gs.forEach(g => (days[g.date] = days[g.date] || []).push(g));
        return `<article class="mb-leg${hasT ? '' : ' dim'}"><div class="mb-leg-h"><div><span>Weekend ${l.i}</span><b>${esc(l.cities.join(' · '))}</b></div><em>${cur ? '<i>This weekend</i>' : range(l.from, l.to)}</em></div>
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

  /* ---------- page ---------- */
  function render() {
    S = season(); CAR = null;
    if (!S) return '<div class="page"><h1 class="page-title">MBL</h1><p>No MBL season in the database.</p></div>';
    return `<div class="mb-page">${hero()}
      <nav class="mb-snav" aria-label="Page"><div class="mb-snav-in"><span class="mb-snav-logo">${COMPLOGOS['mbl-mark'] ? `<img src="${COMPLOGOS['mbl-mark']}" alt="MBL" width="54" height="22">` : ''}<b>${esc(S.title.replace(/^20/, ''))}</b></span><span class="mb-pill"></span>
        <a href="#mb-games">Games</a><a href="#mb-stand">Standings</a><a href="#mb-teams">Teams</a><a href="#mb-stats">Stats</a><a href="#mb-miles">Milestones</a></div></nav>
      <div class="mb-wrap">
        <section class="mb-sec" id="mb-games">${games()}</section>
        <section class="mb-sec" id="mb-stand">${stand()}</section>
        <section class="mb-sec" id="mb-teams">${teams()}</section>
        <section class="mb-sec" id="mb-stats">${stats()}</section>
        <section class="mb-sec" id="mb-miles">${miles()}</section>
      </div><div class="mb-tip" id="mb-tip" aria-hidden="true"></div></div>`;
  }
  const paint = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; segInd(); };
  function spy() {
    const links = [...document.querySelectorAll('.mb-snav a')];
    if (!links.length) return;
    let cur = links[0];
    links.forEach(a => { const s = document.getElementById(a.getAttribute('href').slice(1)); if (s && s.getBoundingClientRect().top < 140) cur = a; });
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
        const s = document.getElementById(snav.getAttribute('href').slice(1));
        if (s) s.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
        return;
      }
      const tf = e.target.closest('[data-mbtf]');
      if (tf) { ST.team = tf.dataset.mbtf || null; paint('mb-games', games()); return; }
      const sg = e.target.closest('.mb-seg button');
      if (sg && !sg.disabled) {
        const id = sg.parentElement.id, v = sg.dataset.v;
        if (id === 'mb-gshow') { ST.show = v; paint('mb-games', games()); }
        if (id === 'mb-rsort') { ST.sort = v; paint('mb-roster', roster()); }
        if (id === 'mb-lseg') { ST.lead = v; paint('mb-stats', stats()); }
        if (id === 'mb-mh') { ST.mh = +v; paint('mb-miles', miles()); }
        return;
      }
      const mk = e.target.closest('[data-mbmk]');
      if (mk) { ST.mk = mk.dataset.mbmk; paint('mb-miles', miles()); return; }
      const tm = e.target.closest('[data-mbteam]');
      if (tm) {
        e.preventDefault();
        ST.sel = tm.dataset.mbteam;
        document.querySelectorAll('.mb-tile').forEach(b => b.setAttribute('aria-pressed', b.dataset.mbteam === ST.sel));
        paint('mb-roster', roster()); paint('mb-heights', heights());
        if (tm.tagName === 'A') { const s = document.getElementById('mb-teams'); if (s) s.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }
        return;
      }
      // a touch screen has no hover: the first tap turns the card over, the second opens the profile
      const pc = e.target.closest('.mb-pc');
      if (pc && matchMedia('(hover: none)').matches && !pc.classList.contains('flip')) {
        e.preventDefault(); document.querySelectorAll('.mb-pc.flip').forEach(x => x.classList.remove('flip')); pc.classList.add('flip');
      }
    });
    document.addEventListener('mousemove', e => {
      const tip = document.getElementById('mb-tip'); if (!tip) return;
      const t = e.target.closest && e.target.closest('[data-mbtip]');
      if (!t) { tip.classList.remove('on'); return; }
      tip.textContent = t.dataset.mbtip; tip.style.left = e.clientX + 12 + 'px'; tip.style.top = e.clientY - 34 + 'px'; tip.classList.add('on');
    });
    addEventListener('scroll', () => { if (document.querySelector('.mb-page')) requestAnimationFrame(spy); }, {passive: true});
    let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (document.querySelector('.mb-page')) { tour(); segInd(); spy(); } }, 150); });
  }
  function after() {
    clearInterval(cdTimer); cdPrev = [];
    if (!document.querySelector('.mb-page')) return;
    if (!S) S = season();
    bind();
    const nx = document.getElementById('mb-next'); if (nx) nx.innerHTML = nextCard();
    tour(); segInd(); spy();
    if (document.getElementById('mb-cd')) { tick(); cdTimer = setInterval(tick, 1000); }
  }
  // the header tab is named after the season: MBL 2026/27
  function tabLabel() { const s = season(); return s ? 'MBL ' + s.title : 'MBL'; }
  return {render, after, tabLabel};
})();
function renderMbl() { return MB.render(); }
function mblAfterRender() { MB.after(); }
