/* =========================================================================
   A team's page (#/t/<slug>, update-112), after the ideal prototype.
   A dark header (crest, name, competitions, all-time record, titles,
   follow and share), then three tabs, each with its own address:
     Overview  /t/<slug>/          the most recent competition (where the
               team stands, its record, the next game) and its squad, the
               trophy cabinet and the all-time top scorers. A national youth
               tournament shows the boys' and the girls' squads together.
     Results   /t/<slug>/results/  every game, competition by competition
     Players   /t/<slug>/players/  everyone who played for the team
   Results, Players and the top scorers are always one gender (division) at
   a time, and can be narrowed to one competition. The team itself comes from
   teamIndex() (app4k_teams.js). One global: TPG.
   ========================================================================= */
const TPG = (() => {
  const ST = { slug: null, tab: 'overview', sex: '', series: '', sort: 'pts', open: 6 };
  const TABS = [['overview', 'Overview'], ['results', 'Results'], ['players', 'Players']];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ordn = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const dShort = iso => { const [, m, d] = String(iso).split('-'); return +d + ' ' + MON[+m - 1]; };
  const dDay = iso => { const x = new Date(iso + 'T12:00:00+08:00'); return DOW[x.getUTCDay()] + ' ' + dShort(iso); };
  const startOf = c => c.start || (c.games || []).map(g => g.date).filter(Boolean).sort()[0] || String(c.year || '');
  const done = g => g.st === 'COMPLETE' && g.hs != null && g.as != null;
  // "Malaysia D-League 2026 - Men U20" -> "D-League · Men U20"
  const shortComp = c => String(c.label || c.name || '').replace(/\s*\b(19|20)\d\d\b\s*/g, ' ').replace(/Major Basketball League/, 'MBL')
    .replace(/Malaysia D-League/, 'D-League').replace(/Women's Malaysia Basketball Alliance/, 'WMBA').replace(/International/g, 'Intl')
    .replace(/\s+-\s+/g, ' · ').replace(/\s{2,}/g, ' ').trim();
  const divName = a => a.sex + (a.age ? ' ' + a.age : '');
  // a championship by its common name and the division: "Lum Mun Chak Cup · Boys U15"
  const SER = { 'MILO Lum Mun Chak Cup': 'Lum Mun Chak Cup', 'MABA/MATRIX 17 & Below': 'U17 Nationals', 'MSSM': 'MSSM', 'Agong Cup': 'Agong Cup', 'Sukan Malaysia': 'SUKMA',
    'MABA/MATRIX Cup': 'MATRIX Cup', 'Malaysia D-League': 'D-League', 'Selangor Basketball League': 'SBL', 'Dream Ball Championship': 'Dream Ball', 'Sukan Selangor': 'SUKSES' };
  const sqn = a => a.squad && ST.t2 ? ' · ' + squadLabel(teamBySlug(ST.slug), a.squad) : '';
  const nice = (c, a) => (SER[c.series] ? `${SER[c.series]} · ${divName(a)}${a.qual ? ' · qualifying' : ''}` : shortComp(c)) + sqn(a);
  const isNational = c => typeof compCat === 'function' && compCat(c) === 'national';
  const ICO = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/></svg>',
  };

  /* ---------- the team's competitions, newest first ---------- */
  function apps(t) {
    return t.apps.map(a => ({ a, c: COMP_BY_ID[a.cid] })).filter(x => x.c)
      .sort((p, q) => startOf(q.c).localeCompare(startOf(p.c)) || String(q.c.end || '').localeCompare(String(p.c.end || '')));
  }
  // the most recent competition; a national youth tournament brings its other half (boys and girls)
  function latest(t) {
    const L = apps(t); if (!L.length) return [];
    const top = L[0];
    if (!isNational(top.c)) return [top];
    // the other half: the newest edition of the same championship for the other sex (this season or the one before)
    const pair = L.filter(x => x !== top && isNational(x.c) && x.c.series === top.c.series && x.a.sex !== top.a.sex && (+top.c.year || 0) - (+x.c.year || 0) <= 1);
    return [top, ...pair.slice(0, 1)].sort((p, q) => (p.a.sex === 'Boys' ? 0 : 1) - (q.a.sex === 'Boys' ? 0 : 1));
  }
  const sexes = t => DIV_SEXES.filter(s => t.apps.some(a => a.sex === s));
  function mainSex(t) {
    const g = {}; t.apps.forEach(a => { g[a.sex] = (g[a.sex] || 0) + (a.played || 0) + .01; });
    return Object.entries(g).sort((p, q) => q[1] - p[1])[0][0];
  }
  const inView = x => x.a.sex === ST.sex && (!ST.series || x.c.series === ST.series);

  /* ---------- everyone who played for the team, inside the filters ---------- */
  function roster(t) {
    const by = {};
    apps(t).filter(inView).forEach(({ a, c }) => {
      (c.players || []).forEach(r => {
        if (r.team !== a.as || !r.g) return;
        const o = by[r.pid] || (by[r.pid] = { pid: r.pid, g: 0, pts: 0, reb: 0, ast: 0, y0: 9999, y1: 0, n: 0 });
        o.g += +r.g || 0; o.pts += +r.pts || 0; o.reb += +r.reb || 0; o.ast += +r.ast || 0; o.n++;
        if (c.year) { o.y0 = Math.min(o.y0, c.year); o.y1 = Math.max(o.y1, c.year); }
      });
    });
    return Object.values(by);
  }
  // the gender switch and the competition picker, shared by the three views
  function filters(t, id) {
    const L = apps(t).filter(x => x.a.sex === ST.sex);
    const ser = [...new Set(L.map(x => x.c.series))];
    return `<div class="tg-flt">
      <div class="tg-seg" role="group" aria-label="Division">${sexes(t).map(s => `<button type="button" data-tgsex="${s}" aria-pressed="${ST.sex === s}"><i style="background:${DIV_COL[s]}"></i>${s}</button>`).join('')}</div>
      ${ser.length > 1 ? `<label class="sr-only" for="${id}">Competition</label><select class="tg-sel" id="${id}" data-tgser aria-label="Competition"><option value="">Every competition</option>${ser.map(s => `<option value="${esc(s)}"${ST.series === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
    </div>`;
  }

  /* ---------- header ---------- */
  function head(t) {
    const L = apps(t), titles = t.apps.filter(a => a.champ).length;
    const rec = t.w || t.l ? `${t.w}–${t.l} all-time` : '';
    const alias = Object.keys(t.aliases || {}).length ? `<p class="tg-alias">${Object.entries(t.aliases).map(([n, ser]) => `Played ${[...ser].map(esc).join(' and ')} as <b>${esc(n)}</b>`).join(' · ')}</p>` : '';
    return `<header class="tg-head" style="--tc:${typeof teamBloom === 'function' ? teamBloom(t.name) : '#333'}"><div class="tg-head-in">
      <nav class="tg-crumb" aria-label="Breadcrumb"><a href="#/teams">Teams</a></nav>
      <div class="tg-id"><span class="tg-crest">${crest(t.name, 120)}</span>
        <div class="tg-txt"><h1>${esc(t.name)}</h1>
          <p class="tg-sub"><span>${L.length} competition${L.length === 1 ? '' : 's'} since ${t.firstYear}</span>${rec ? `<span>${rec}</span>` : ''}${titles ? `<span class="tg-titles">${ICO.trophy}${titles} title${titles === 1 ? '' : 's'}</span>` : ''}${t.state ? '<span>State team</span>' : ''}</p>
          ${alias}
          <div class="tg-acts">${typeof accFavBtn === 'function' ? accFavBtn('t', t.slug, 'tg-fav') : ''}<button type="button" class="tg-btn ghost" data-tgshare>${ICO.share}Share</button></div>
        </div></div></div></header>
      <nav class="tg-tabs" aria-label="Team sections"><div class="tg-tabs-in">${TABS.map(([k, l]) => `<a href="#tg-${k}" data-tgtab="${k}"${ST.tab === k ? ' aria-current="page"' : ''}>${l}${k === 'results' ? `<small>${t.played}</small>` : ''}</a>`).join('')}</div></nav>`;
  }

  /* ---------- overview ---------- */
  function seasonCard(t, { a, c }) {
    const row = (c.stand || []).find(s => s.team === a.as);
    const grp = row && row.g ? (c.stand || []).filter(s => s.g === row.g) : (c.stand || []);
    const mine = (c.games || []).filter(g => g.h === a.as || g.a === a.as);
    const next = mine.filter(g => !done(g) && g.st !== 'NOT_PLAYED').sort((p, q) => (p.date + p.time).localeCompare(q.date + q.time))[0];
    const fin = mine.filter(done), pf = fin.reduce((s, g) => s + (g.h === a.as ? +g.hs : +g.as), 0), pa = fin.reduce((s, g) => s + (g.h === a.as ? +g.as : +g.hs), 0);
    const finished = c.champ || (c.games || []).every(g => g.st !== 'SCHEDULED' && (done(g) || g.st === 'NOT_PLAYED'));
    const tile = (v, k, tip) => `<div><b>${v}</b><span${tip ? ` data-imtip="${esc(tip)}"` : ''}>${k}</span></div>`;
    const pos = a.champ ? tile('Champion', `${c.year}`) : row && row.pos ? tile(ordn(row.pos), `of ${grp.length} ${row.g ? 'in group ' + esc(row.g) : finished ? 'at the end' : 'in the table'}`) : '';
    const opp = next ? (next.h === a.as ? next.a : next.h) : '';
    return `<section class="tg-card tg-season">
      <header>${compCrest(c, 26)}<h2>${c.year || ''} ${esc(nice(c, a))}</h2>${SER[c.series] ? '' : `<span class="tg-div" style="--dc:${DIV_COL[a.sex]}"><i></i>${esc(divName(a))}</span>`}<a class="tg-more" href="#/c/${c.id}/team/${a.tid}">Competition page<span aria-hidden="true">→</span></a></header>
      <div class="tg-nums">${pos}${tile(fin.length ? `${a.w}–${a.l}` : '0–0', 'record')}${fin.length ? tile((pf - pa > 0 ? '+' : '') + (pf - pa), 'point difference', 'Points scored minus points conceded') : ''}</div>
      ${next ? `<a class="tg-next" href="#/c/${c.id}/schedule">${ICO.cal}<span>Next: <b>${next.h === a.as ? 'vs' : 'at'} ${esc(opp)}</b> · ${dDay(next.date)}${next.time ? ' · ' + esc(next.time) : ''}</span></a>` : ''}
    </section>`;
  }
  function squad(t, { a, c }) {
    const R = (c.roster || {})[a.tid] || [];
    const lines = {}; (c.players || []).forEach(r => { if (r.team === a.as) lines[r.pid] = r; });
    const seen = new Set(R.map(r => r.pid));
    const pids = R.map(r => ({ r, l: lines[r.pid] })).concat(Object.values(lines).filter(l => !seen.has(l.pid)).map(l => ({ r: { pid: l.pid }, l })));
    if (!pids.length) return '';
    const mins = l => l && l.min ? (typeof minsToNum === 'function' ? minsToNum(l.min) : parseFloat(l.min)) : -1;
    pids.sort((p, q) => mins(q.l) - mins(p.l) || (+(p.r.num) || 99) - (+(q.r.num) || 99));
    const posN = p => (typeof PV_POS !== 'undefined' && PV_POS[p]) || p || '';
    return `<section class="tg-sec"><div class="tg-sh"><h2>Squad · ${esc((SER[c.series] ? divName(a) : shortComp(c)) + sqn(a))} <span class="tg-yr">${c.year || ''} ${SER[c.series] ? esc(SER[c.series]) : ''}</span></h2><span class="tg-hint">${Object.keys(lines).length ? 'Most minutes first' : 'No games played yet'}</span></div>
      <div class="tg-squad">${pids.map(({ r, l }) => { const nm = personName(r.pid), g = l && l.g;
        return `<a class="tg-pc" href="#/p/${r.pid}">${r.num != null && r.num !== '' ? `<span class="no">#${esc(r.num)}</span>` : ''}${avatar(r.pid, nm)}<b>${esc(nm)}</b>
          <span class="m">${[posN(r.pos), r.nat && r.nat !== 'MAS' ? r.nat : ''].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</span>
          <span class="s">${g ? `<b>${f1((+l.pts || 0) / g)}</b> PPG · <b>${f1((+l.reb || 0) / g)}</b> RPG` : '<span class="na">No games yet</span>'}</span></a>`; }).join('')}</div></section>`;
  }
  function trophies(t) {
    const W = apps(t).filter(x => x.a.champ);
    return `<section class="tg-card tg-trophy"><header><h2>Trophy cabinet</h2></header>${W.length ? `<ul>${W.map(({ a, c }) => `<li><a href="#/c/${c.id}">${ICO.trophy}<b>${c.year || ''}</b> ${esc(nice(c, a))}</a></li>`).join('')}</ul>` : '<p class="tg-empty">No titles yet. Every competition it has entered is on the Results tab.</p>'}</section>`;
  }
  function topScorers(t) {
    const R = roster(t).sort((p, q) => q.pts - p.pts).slice(0, 8);
    return `<section class="tg-card tg-top" id="tg-top"><header><h2>All-time top scorers</h2><a class="tg-more" href="#tg-players" data-tgtab="players">Everyone<span aria-hidden="true">→</span></a></header>
      <div class="tg-pad">${filters(t, 'tg-ser-top')}</div>
      ${R.length ? `<ol>${R.map((x, i) => `<li><a href="#/p/${x.pid}"><span class="r">${i + 1}</span>${avatar(x.pid)}<span class="n"><b>${esc(personName(x.pid))}</b><small>${x.g} game${x.g === 1 ? '' : 's'}</small></span><span class="v"><b>${x.pts.toLocaleString()}</b><small>points</small></span></a></li>`).join('')}</ol>`
        : '<p class="tg-empty">No player numbers for this division.</p>'}</section>`;
  }
  function overview(t) {
    const cur = latest(t);
    const recent = apps(t).filter(x => x.a.sex === (cur[0] ? cur[0].a.sex : ST.sex)).flatMap(({ a, c }) => (c.games || []).filter(g => done(g) && (g.h === a.as || g.a === a.as)).map(g => ({ g, a, c })))
      .sort((p, q) => (q.g.date + q.g.time).localeCompare(p.g.date + p.g.time)).slice(0, 5);
    return `<div class="tg-grid"><div class="tg-main">
        ${cur.map(x => seasonCard(t, x)).join('')}
        ${cur.map(x => squad(t, x)).join('')}
        ${recent.length ? `<section class="tg-card"><header><h2>Latest results</h2><a class="tg-more" href="#tg-results" data-tgtab="results">All results<span aria-hidden="true">→</span></a></header><div class="tg-games">${recent.map(gameRow).join('')}</div></section>` : ''}
      </div><aside class="tg-side">${trophies(t)}${topScorers(t)}</aside></div>`;
  }

  /* ---------- results ---------- */
  function gameRow({ g, a, c }) {
    const home = g.h === a.as, opp = home ? g.a : g.h, f = done(g);
    const us = f ? +(home ? g.hs : g.as) : null, them = f ? +(home ? g.as : g.hs) : null;
    const wl = f ? (us > them ? 'w' : us < them ? 'l' : 'd') : '';
    const href = f && g.box ? `#/c/${c.id}/box/${g.mid}` : `#/c/${c.id}/schedule`;
    return `<a class="tg-g" href="${href}"><span class="d">${dShort(g.date)}<small>${String(g.date).slice(0, 4)}</small></span>
      <span class="o"><small>${home ? 'vs' : 'at'}</small>${crest(opp, 22)}<b>${esc(opp)}</b></span>
      ${f ? `<span class="sc ${wl}"><i>${wl.toUpperCase()}</i><b>${us}–${them}</b></span>` : g.st === 'NOT_PLAYED' ? '<span class="sc np">Not played</span>' : `<span class="sc up">${esc(g.time || 'TBC')}</span>`}</a>`;
  }
  function results(t) {
    const L = apps(t).filter(inView);
    const shown = L.slice(0, ST.open);
    return `${filters(t, 'tg-ser-res')}
      ${shown.map(({ a, c }) => {
        const G = (c.games || []).filter(g => g.h === a.as || g.a === a.as).sort((p, q) => (p.date + p.time).localeCompare(q.date + q.time));
        return `<section class="tg-card tg-comp"><header>${compCrest(c, 26)}<div class="tt"><h2><a href="#/c/${c.id}/team/${a.tid}">${c.year || ''} ${esc(nice(c, a))}</a></h2>
            <span>${esc(c.label || c.name)}${a.as !== t.name ? ` · listed as “${esc(a.as)}”` : ''}</span></div>
            <span class="rec">${a.champ ? '<span class="tg-champ">Champion</span>' : ''}${a.w || a.l ? `<b>${a.w}–${a.l}</b>` : ''}</span></header>
          ${G.length ? `<div class="tg-games">${G.map(g => gameRow({ g, a, c })).join('')}</div>` : '<p class="tg-empty">No fixtures published.</p>'}</section>`; }).join('')
        || '<p class="tg-empty tg-card">No competitions in this division.</p>'}
      ${L.length > ST.open ? `<div class="tg-moreb"><button type="button" class="tg-btn" data-tgopen>Show ${Math.min(6, L.length - ST.open)} older competition${Math.min(6, L.length - ST.open) === 1 ? '' : 's'}</button><span>${shown.length} of ${L.length}</span></div>` : ''}`;
  }

  /* ---------- players ---------- */
  function players(t) {
    const R = roster(t);
    const key = { pts: x => x.pts, g: x => x.g, ppg: x => x.g ? x.pts / x.g : 0, name: null }[ST.sort];
    const minG = ST.sort === 'ppg' ? Math.max(1, Math.round(Math.max(1, ...R.map(x => x.g)) * .2)) : 0;
    const L = R.filter(x => x.g >= minG).sort(key ? (p, q) => key(q) - key(p) || q.pts - p.pts : (p, q) => personName(p.pid).localeCompare(personName(q.pid)));
    return `${filters(t, 'tg-ser-pl')}
      <div class="tg-plbar"><span class="tg-count"><b>${L.length}</b> player${L.length === 1 ? '' : 's'}${minG > 1 ? ` · points per game needs ${minG} games` : ''}</span>
        <div class="tg-seg" role="group" aria-label="Order">${[['pts', 'Points'], ['g', 'Games'], ['ppg', 'Points per game'], ['name', 'A–Z']].map(([k, l]) => `<button type="button" data-tgsort="${k}" aria-pressed="${ST.sort === k}">${l}</button>`).join('')}</div></div>
      ${L.length ? `<ol class="tg-pl">${L.map((x, i) => `<li><a href="#/p/${x.pid}"><span class="r">${i + 1}</span>${avatar(x.pid)}<span class="n"><b>${esc(personName(x.pid))}</b><small>${x.y0 === x.y1 ? x.y0 : x.y0 + '–' + x.y1} · ${x.n} competition${x.n === 1 ? '' : 's'}</small></span>
        <span class="s g"><b>${x.g}</b><small>G</small></span><span class="s"><b>${x.pts.toLocaleString()}</b><small>PTS</small></span><span class="s"><b>${f1(x.pts / x.g)}</b><small>PPG</small></span><span class="s x"><b>${f1(x.reb / x.g)}</b><small>RPG</small></span><span class="s x"><b>${f1(x.ast / x.g)}</b><small>APG</small></span></a></li>`).join('')}</ol>`
        : '<p class="tg-empty tg-card">No player numbers for this division.</p>'}`;
  }

  /* ---------- the page ---------- */
  function render(slug, tab) {
    const t = teamBySlug(slug);
    if (!t) return null;
    if (ST.slug !== t.slug) Object.assign(ST, { slug: t.slug, sex: '', series: '', sort: 'pts', open: 6 });
    ST.t2 = !!t.hasTeam2;
    if (!ST.sex || !sexes(t).includes(ST.sex)) { const cur = latest(t); ST.sex = cur[0] ? cur[0].a.sex : mainSex(t); }
    ST.tab = TABS.some(x => x[0] === tab) ? tab : 'overview';
    return `<div class="tg-page">${head(t)}<div class="tg-wrap">
      <section class="tg-panel${ST.tab === 'overview' ? ' on' : ''}" id="tg-overview">${overview(t)}</section>
      <section class="tg-panel${ST.tab === 'results' ? ' on' : ''}" id="tg-results">${results(t)}</section>
      <section class="tg-panel${ST.tab === 'players' ? ' on' : ''}" id="tg-players">${players(t)}</section></div></div>`;
  }
  function paint() {
    const t = teamBySlug(ST.slug); if (!t) return;
    const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    put('tg-results', results(t)); put('tg-players', players(t));
    const top = document.getElementById('tg-top'); if (top) top.outerHTML = topScorers(t);
  }
  function show(tab) {
    ST.tab = tab;
    document.querySelectorAll('.tg-panel').forEach(p => p.classList.toggle('on', p.id === 'tg-' + tab));
    document.querySelectorAll('[data-tgtab]').forEach(a => { if (a.closest('.tg-tabs')) { if (a.dataset.tgtab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); } });
    try { if (HS.PATHS) history.replaceState(history.state, '', HS.url('t/' + ST.slug + (tab === 'overview' ? '' : '/' + tab))); } catch (e) {}
    const bar = document.querySelector('.tg-tabs');
    if (bar) { const y = bar.getBoundingClientRect().top + scrollY - (document.querySelector('.nav') || { offsetHeight: 60 }).offsetHeight; if (scrollY > y) scrollTo({ top: y, behavior: 'auto' }); }
  }
  document.addEventListener('click', e => {
    if (!document.querySelector('.tg-page')) return;
    const tb = e.target.closest('[data-tgtab]');
    if (tb) { e.preventDefault(); show(tb.dataset.tgtab); return; }
    const sx = e.target.closest('[data-tgsex]');
    if (sx) { ST.sex = sx.dataset.tgsex; ST.series = ''; ST.open = 6; paint(); return; }
    const so = e.target.closest('[data-tgsort]');
    if (so) { ST.sort = so.dataset.tgsort; paint(); return; }
    if (e.target.closest('[data-tgopen]')) { ST.open += 6; paint(); return; }
    if (e.target.closest('[data-tgshare]')) {
      const url = location.href.split('#')[0], title = document.title;
      if (navigator.share) navigator.share({ title, url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { const b = e.target.closest('[data-tgshare]'); const old = b.innerHTML; b.textContent = 'Link copied'; setTimeout(() => { b.innerHTML = old; }, 1600); }).catch(() => {});
    }
  });
  document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-tgser]')) { ST.series = e.target.value; ST.open = 6; paint(); } });
  return { render };
})();
