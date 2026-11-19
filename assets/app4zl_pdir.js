/* =========================================================================
   Players directory (#/players, update-110). The MBL season's top scorers
   first, as portrait cards; then everyone, one row each, with a search, a
   league, a season and a position filter and three orders (most games,
   points per game, A–Z). The numbers in a row are the player's MBL career
   when he has played in the MBL (the row says "MBL"), else every competition
   he played; a league or season filter scopes them to that instead. The full
   sortable table stays one click away (app4_players.js). One global: PDIR.
   ========================================================================= */
const PDIR = (() => {
  const MBL = 'Major Basketball League';
  const ST = { q: '', fam: '', year: '', pos: '', sort: 'g', n: 48 };
  let BASE = null;
  const POSN = { '': 'All', G: 'Guards', F: 'Forwards', C: 'Centres' };
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const sum = L => { const t = { g: 0, pts: 0, reb: 0, ast: 0 }; L.forEach(r => { ['g', 'pts', 'reb', 'ast'].forEach(k => { if (has(r.p[k])) t[k] += +r.p[k]; }); }); return t; };

  // every player with a line, once: his lines, his MBL lines, his latest team and position
  function base() {
    if (BASE) return BASE;
    BASE = Object.keys(CAREER).map(pid => {
      const all = CAREER[pid].filter(r => hasStats(r.p));
      if (!all.length) return null;
      const by = all.slice().sort((a, b) => (b.c.year || 0) - (a.c.year || 0) || String(b.c.start || '').localeCompare(String(a.c.start || '')));
      const recent = by.map(r => r.p.team).filter(Boolean);
      const nt = typeof newsTeam === 'function' ? newsTeam(pid) : null;
      const team = nt && nt.team ? nt.team : (recent.find(n => !stateSlug(n)) || recent[0] || '');
      const pos = String(latestPos(pid) || '').toUpperCase();
      const name = personName(pid);
      return { pid, name, key: name.toLowerCase(), all, mbl: all.filter(r => r.c.series === MBL), team, year: by[0].c.year || '', pos };
    }).filter(Boolean);
    return BASE;
  }
  function rows() {
    const q = ST.q.trim().toLowerCase(), toks = q.split(/\s+/).filter(Boolean);
    const scoped = !!(ST.fam || ST.year);
    const keep = r => (!ST.fam || r.c.series === ST.fam) && (!ST.year || String(r.c.year) === ST.year);
    let out = [];
    base().forEach(b => {
      if (toks.length && !toks.every(t => b.key.includes(t))) return;
      if (ST.pos && !b.pos.includes(ST.pos)) return;
      let L, scope;
      if (scoped) { L = b.all.filter(keep); if (!L.length) return; scope = ''; }
      else if (b.mbl.length) { L = b.mbl; scope = 'mbl'; }
      else { L = b.all; scope = 'all'; }
      const t = sum(L);
      out.push({ b, t, scope, ppg: t.g ? t.pts / t.g : 0 });
    });
    // points per game asks for a fair sample: 30% of the most games in view
    const minG = ST.sort === 'ppg' ? Math.max(1, Math.round(Math.max(1, ...out.map(r => r.t.g)) * .3)) : 0;
    if (minG) out = out.filter(r => r.t.g >= minG);
    const cmp = ST.sort === 'name' ? (a, b) => a.b.name.localeCompare(b.b.name)
      : ST.sort === 'ppg' ? (a, b) => b.ppg - a.ppg || b.t.g - a.t.g
      : (a, b) => b.t.g - a.t.g || b.t.pts - a.t.pts;
    // with no league or season picked, the MBL's players come first: their numbers are MBL numbers
    const grouped = !scoped && ST.sort !== 'name';
    out.sort((a, b) => (grouped ? (a.scope === 'mbl' ? 0 : 1) - (b.scope === 'mbl' ? 0 : 1) : 0) || cmp(a, b));
    return { out, minG, grouped };
  }
  const posName = p => (typeof PV_POS !== 'undefined' && PV_POS[p]) || p;
  function row(r, q) {
    const b = r.b, t = r.t, nm = esc(b.name);
    const hl = q ? nm.replace(new RegExp('(' + q.split(/\s+/).filter(Boolean).map(x => esc(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'), '<mark>$1</mark>') : nm;
    // the MBL's own mark (a cut-out, no plate) says these are MBL career numbers
    const mk = (typeof COMPLOGOS !== 'undefined' && (COMPLOGOS['mbl-mark'] || COMPLOGOS.mbl)) || '';
    const tag = r.scope === 'mbl' ? (mk ? `<span class="pd-tag mbl" title="MBL career numbers"><img src="${mk}" alt="MBL" width="44" height="18" loading="lazy" decoding="async"></span>` : '<span class="pd-tag mbl" title="MBL career numbers">MBL</span>') : r.scope === 'all' ? '<span class="pd-tag" title="Every competition he has played">All</span>' : '';
    return `<li><a class="pd-row" href="#/p/${b.pid}">${avatar(b.pid, b.name)}
      <span class="pd-n"><b>${hl}</b><span>${b.team ? teamMark(b.team) + `<span class="t">${esc(typeof pvCase === 'function' ? pvCase(b.team) : b.team)}</span>` : ''}${b.year ? `<span class="d"> · ${b.year}</span>` : ''}${b.pos ? `<span class="d p"> · ${esc(posName(b.pos))}</span>` : ''}</span></span>
      ${tag}<span class="pd-s"><b>${t.g}</b><small>G</small></span><span class="pd-s"><b>${t.g ? f1(r.ppg) : '–'}</b><small>PPG</small></span>
      <span class="pd-s x"><b>${t.g ? f1(t.reb / t.g) : '–'}</b><small>RPG</small></span><span class="pd-s x"><b>${t.g ? f1(t.ast / t.g) : '–'}</b><small>APG</small></span>
      <span class="pd-go" aria-hidden="true">›</span></a></li>`;
  }
  function results() {
    const { out, minG, grouped } = rows(), shown = out.slice(0, ST.n), q = ST.q.trim();
    const any = ST.q || ST.fam || ST.year || ST.pos;
    let html = '', grp = null;
    shown.forEach(r => {
      if (grouped && r.scope !== grp) {
        if (grp !== null) html += '</ul>';
        grp = r.scope;
        html += `<h3 class="pd-gh">${grp === 'mbl' ? 'Played in the MBL <span>numbers are their MBL career</span>' : 'Everyone else <span>numbers across every competition</span>'}</h3><ul class="pd-list">`;
      }
      html += row(r, q);
    });
    if (shown.length) html = (grouped ? '' : '<ul class="pd-list">') + html + '</ul>';
    return `<div class="pd-count"><b>${out.length.toLocaleString()}</b> ${out.length === 1 ? 'player' : 'players'}${minG > 1 ? ` · points per game needs ${minG} games` : ''}${!grouped && (ST.fam || ST.year) ? ` · numbers for ${esc([ST.fam, ST.year].filter(Boolean).join(' '))}` : ''}${any ? ' <button type="button" class="pd-reset" data-pd-reset>Clear filters</button>' : ''}</div>
      ${shown.length ? html + (out.length > ST.n ? `<div class="pd-more"><button type="button" class="pd-btn" data-pd-more>Show ${Math.min(48, out.length - ST.n)} more</button><span>${shown.length.toLocaleString()} of ${out.length.toLocaleString()}</span></div>` : '')
        : `<div class="pd-empty"><b>No players match</b><span>Try fewer filters, or search by surname only.</span><button type="button" class="pd-btn" data-pd-reset>Clear filters</button></div>`}`;
  }
  // the newest men's MBL season's top scorers with a portrait
  function featured() {
    const c = COMPS.filter(x => x.series === MBL && x.gender !== 'Women').sort((a, b) => String(a.start || '').localeCompare(String(b.start || ''))).pop();
    if (!c) return '';
    const L = (c.players || []).filter(r => r.g >= 2 && PHOTOS[r.pid]).map(r => ({ r, v: (+r.pts || 0) / r.g })).sort((a, b) => b.v - a.v).slice(0, 12);
    if (L.length < 4) return '';
    const title = typeof MB !== 'undefined' ? MB.tabLabel() : 'the MBL';
    return `<section class="pd-feat" aria-label="Top scorers in ${esc(title)}"><div class="pd-fh"><h2>Scoring the most in ${esc(title)}</h2>
        <span class="pd-arrows"><button type="button" class="pd-arw" data-pd-scroll="-1" aria-label="Scroll back">‹</button><button type="button" class="pd-arw" data-pd-scroll="1" aria-label="Scroll on">›</button></span></div>
      <div class="pd-frow" id="pd-frow">${L.map(({ r, v }, i) => `<a class="pd-fc" href="#/p/${r.pid}" style="--team:${teamBloom(r.team || '')};--i:${i}">
        <span class="pd-fpic"><img src="${PHOTOS[r.pid]}" alt="" loading="lazy" decoding="async"></span><span class="pd-fv">${f1(v)}<small>PPG</small></span>
        <span class="pd-ft"><b>${esc(personName(r.pid))}</b><span>${r.team ? teamMark(r.team) : ''}<span class="t">${esc(r.team || '')}</span></span></span></a>`).join('')}</div></section>`;
  }
  function tools() {
    const fams = [...new Set(COMPS.map(c => c.series))].sort((a, b) => (b === MBL) - (a === MBL) || a.localeCompare(b));
    const years = [...new Set(COMPS.map(c => c.year).filter(has))].sort((a, b) => b - a);
    return `<div class="pd-tools">
      <label class="pd-field">${typeof NAV_IC !== 'undefined' ? NAV_IC.search : ''}<input type="search" id="pd-q" placeholder="Search by name…" value="${esc(ST.q)}" autocomplete="off" spellcheck="false" aria-label="Search players by name"></label>
      <select class="pd-sel" id="pd-fam" data-pd="fam" aria-label="League"><option value="">Every league</option>${fams.map(f => `<option value="${esc(f)}"${ST.fam === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <select class="pd-sel" id="pd-year" data-pd="year" aria-label="Season"><option value="">Every season</option>${years.map(y => `<option${ST.year === String(y) ? ' selected' : ''}>${y}</option>`).join('')}</select>
      <div class="pd-seg" role="group" aria-label="Position">${Object.entries(POSN).map(([k, l]) => `<button type="button" data-pd-pos="${k}" aria-pressed="${ST.pos === k}">${l}</button>`).join('')}</div>
      <div class="pd-seg" role="group" aria-label="Order">${[['g', 'Most games'], ['ppg', 'Points per game'], ['name', 'A–Z']].map(([k, l]) => `<button type="button" data-pd-sort="${k}" aria-pressed="${ST.sort === k}">${l}</button>`).join('')}</div>
    </div>`;
  }
  function head(view) {
    const n = base().length, since = Math.min(...COMPS.map(c => +c.year).filter(Boolean));
    return `<header class="pd-head"><div><h1>Players</h1><p>${n.toLocaleString()} players with a box score since ${since}. Search, filter, or start with the MBL’s best.</p></div>
      <span class="pd-seg pd-view" role="group" aria-label="View"><button type="button" data-gview="list" aria-pressed="${view !== 'table'}">List</button><button type="button" data-gview="table" aria-pressed="${view === 'table'}">Full table</button></span></header>`;
  }
  function render() {
    return `<div class="page pd-page">${head('list')}${featured()}${tools()}<div id="pd-res" aria-live="polite">${results()}</div></div>`;
  }
  const refresh = () => { const el = document.getElementById('pd-res'); if (el) el.innerHTML = results(); };
  document.addEventListener('input', e => { if (e.target.id === 'pd-q') { ST.q = e.target.value; ST.n = 48; refresh(); } });
  document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.pd; if (k) { ST[k] = e.target.value; ST.n = 48; refresh(); } });
  document.addEventListener('click', e => {
    if (!document.querySelector('.pd-page')) return;
    const s = e.target.closest('[data-pd-sort]'), p = e.target.closest('[data-pd-pos]');
    if (s || p) { if (s) ST.sort = s.dataset.pdSort; if (p) ST.pos = p.dataset.pdPos; ST.n = 48;
      document.querySelectorAll(s ? '[data-pd-sort]' : '[data-pd-pos]').forEach(b => b.setAttribute('aria-pressed', b === (s || p))); refresh(); return; }
    if (e.target.closest('[data-pd-more]')) { ST.n += 48; refresh(); return; }
    if (e.target.closest('[data-pd-reset]')) { Object.assign(ST, { q: '', fam: '', year: '', pos: '', n: 48 });
      const q = document.getElementById('pd-q'); if (q) q.value = ''; ['pd-fam', 'pd-year'].forEach(id => { const x = document.getElementById(id); if (x) x.value = ''; });
      document.querySelectorAll('[data-pd-pos]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pdPos === '')); refresh(); return; }
    const a = e.target.closest('[data-pd-scroll]');
    if (a) { const r = document.getElementById('pd-frow'); if (r) r.scrollBy({ left: +a.dataset.pdScroll * r.clientWidth * .85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  });
  return { render, head };
})();
