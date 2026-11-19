/* =========================================================================
   Search: one box for everything on the site — players, teams, competitions,
   pages and stat terms. Opened by the search field in the header, the Search
   tab on a phone, "/" or Ctrl/⌘ K from any page. Before a key is pressed it
   offers the main pages, what this reader opened recently and the MBL's top
   scorers; then it ranks by how well the name matches, and among equal
   matches by how much the player has played. One global: HSQ.
   ========================================================================= */
const HSQ = (() => {
  const PAGES = [
    ['Today', 'Latest scores, what is on next, the newest signings', '#/', 'home', 'home today scores results fixtures schedule'],
    ['MBL', 'The Major Basketball League season: games, table, players', '#/mbl', 'ball', 'mbl major basketball league season table standings'],
    ['Players', 'Everyone with a box score, with filters', '#/players', 'players', 'players directory roster'],
    ['Competitions', 'Every league, cup and championship', '#/competitions', 'trophy', 'competitions leagues tournaments cups agong dleague'],
    ['Teams', 'Clubs, state sides and national teams', '#/teams', 'shield', 'teams clubs states'],
    ['Records & Honours', 'Single-game records, champions by year', '#/records', 'star', 'records honours champions mvp history best'],
    ['Milestones', 'Who is close to a career landmark', '#/milestones', 'flag', 'milestones landmarks career 1000 points'],
    ['Compare players', 'Two players side by side', '#/compare', 'compare', 'compare versus vs head to head players'],
    ['Compare lineups', "Two teams' fives against each other", '#/compare/lineups', 'swap', 'compare lineups fives'],
    ['Lineups', 'Groups of players on court together', '#/stats/lineups', 'lineup', 'lineups five units tools'],
    ['Clutch', 'Last five minutes, score within five', '#/stats/clutch', 'clock', 'clutch close late tools'],
    ['WOWY', 'A team with and without its players', '#/wowy', 'split', 'wowy on off with without tools'],
    ['Stat Line Shift', "One player's line with and without teammates", '#/shift', 'players', 'stat line shift with without tools'],
    ['Formulas', 'What every number means, and where it comes from', '#/formulas', 'book', 'formulas glossary help abbreviations meaning definitions'],
  ];
  const ic = k => typeof PH !== 'undefined' ? PH.ic(k) : '';
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hs-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hs-' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const plural = (n, w) => `${Number(n).toLocaleString()} ${n === 1 ? w : w + 's'}`;

  /* ---------- the index, built on first use ---------- */
  let IDX = null;
  function index() {
    if (IDX) return IDX;
    const players = Object.keys(PERSONS).map(pid => {
      const car = (CAREER[pid] || []).slice().sort((a, b) => (b.c.start || '').localeCompare(a.c.start || ''));
      const last = car[0];
      let team = last && last.p.team;
      if (!team && last) { const b = (BIO[pid] || {})[last.c.id]; team = b && TEAMS[b.tid]; }
      const g = car.reduce((s, x) => s + (+x.p.g || 0), 0);
      const name = PERSONS[pid], n = norm(name);
      return { pid, name, n, w: n.split(' '), team: team || '', year: last ? (last.c.year || (last.c.start || '').slice(0, 4)) : '', g, face: !!((DB.avatars || {})[pid] || PHOTOS[pid]) };
    }).filter(p => p.n);
    let teams = [];
    try { teams = (typeof teamIndex === 'function' ? teamIndex() : []).map(t => { const n = norm(t.name); return { t, n, w: n.split(' ') }; }); } catch (e) {}
    const comps = COMPS.map(c => { const nm = c.label || c.name, n = norm(nm + ' ' + (c.series || '') + ' ' + (c.year || '')); return { c, nm, n, w: n.split(' ') }; });
    return (IDX = { players, teams, comps });
  }
  function score(e, toks, q) {
    if (e.n === q) return 1000;
    if (e.n.startsWith(q)) return 500;
    let s = 0;
    for (const t of toks) {
      if (e.w.includes(t)) s += 60;
      else if (e.w.some(w => w.startsWith(t))) s += 40;
      else if (e.n.includes(t)) s += 12;
      else return 0;
    }
    return s;
  }
  function run(q0) {
    const q = norm(q0), toks = q.split(' ').filter(Boolean);
    if (!toks.length) return null;
    const I = index();
    const rank = (list, f) => list.map(e => [e, score(e, toks, q)]).filter(x => x[1] > 0).map(([e, s]) => [e, s + f(e)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const players = rank(I.players, p => Math.log2(p.g + 1) * 6 + (p.face ? 8 : 0) + (+p.year >= 2025 ? 6 : 0));
    const teams = rank(I.teams, e => Math.log2(e.t.played + 1) * 5);
    const comps = rank(I.comps, e => (+e.c.year || 2000) - 2000);
    const pages = PAGES.filter(p => toks.every(t => norm(p[0] + ' ' + p[4]).includes(t)));
    const raw = String(q0).trim().toUpperCase().replace(/\s+/g, '');
    let terms = Object.entries(STAT_GLOSS).filter(([k, v]) => { const w = norm(k + ' ' + v.split(' — ')[0]).split(' '); return toks.every(t => w.some(x => x.startsWith(t))); });
    const exact = Object.entries(STAT_GLOSS).find(([k]) => k.toUpperCase() === raw);
    if (exact) terms = [exact];
    const pageFirst = q.length > 2 && pages.some(p => norm(p[0]).startsWith(q));
    return { players, teams, comps, pages, terms, exact: !!exact, pageFirst };
  }

  /* ---------- the panel ---------- */
  let open = false, opener = null, sel = 0;
  const mlbComp = () => COMPS.filter(c => c.series === 'Major Basketball League' && c.gender !== 'Women').sort((a, b) => (a.start || '').localeCompare(b.start || '')).pop();
  const hl = (name, q) => {
    const toks = norm(q).split(' ').filter(Boolean);
    if (!toks.length) return esc(name);
    return esc(name).replace(new RegExp('\\b(' + toks.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'), '<mark>$1</mark>');
  };
  const pMeta = p => [p.team, p.year].filter(Boolean).join(' · ');
  const item = (id, href, rec, mark, title, sub) => `<div class="hsq-it" id="hsq-${id}" role="option" aria-selected="false" data-go="${esc(href)}"${rec ? ` data-rec="${esc(rec)}"` : ''}>${mark}<div class="hsq-tx"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div><span class="go" aria-hidden="true">→</span></div>`;
  const pageMark = i => `<span class="hsq-pm">${ic(i)}</span>`;
  function draw() {
    const box = document.getElementById('hsq'); if (!box) return;
    const inp = box.querySelector('input'), res = box.querySelector('.hsq-body');
    const q = inp.value.trim(), r = run(q);
    let n = 0; const id = () => n++;
    const grp = (title, rows, more) => rows.length ? `<div class="hsq-g" role="group" aria-label="${esc(title)}"><div class="hsq-gh">${esc(title)}${more || ''}</div>${rows.join('')}</div>` : '';
    if (!r) {
      const recent = store.get('recent', []).slice(0, 5);
      const c = mlbComp();
      const pop = c ? c.players.filter(p => (DB.avatars || {})[p.pid] || PHOTOS[p.pid]).slice().sort((a, b) => (b.pts || 0) - (a.pts || 0)).slice(0, 5) : [];
      res.innerHTML = `<div class="hsq-g"><div class="hsq-gh">Go to</div><div class="hsq-start">${PAGES.slice(0, 6).map(p => `<button type="button" class="hsq-it hsq-chip" id="hsq-${id()}" role="option" aria-selected="false" data-go="${p[2]}">${ic(p[3])}<span>${esc(p[0])}</span></button>`).join('')}</div></div>
        ${grp('Recent', recent.map(x => item(id(), x.h, '', x.k === 'p' ? avatar(x.id, x.t) : x.k === 't' ? crest(x.t, 34) : pageMark(x.i || 'trophy'), esc(x.t), esc(x.s || ''))), '<button type="button" class="hsq-clear" data-hsq-clear>Clear</button>')}
        ${grp(c ? 'Top scorers in the ' + (c.label || c.name) : '', pop.map(p => item(id(), '#/p/' + p.pid, ['p', p.pid, personName(p.pid), p.team].join('|'), avatar(p.pid), esc(personName(p.pid)), esc(p.team + ' · ' + plural(p.pts || 0, 'point'))))) }`;
    } else {
      const P = r.players.slice(0, 6).map(p => item(id(), '#/p/' + p.pid, ['p', p.pid, p.name, pMeta(p)].join('|'), avatar(p.pid, p.name), hl(p.name, q), esc([pMeta(p), p.g ? plural(p.g, 'game') : ''].filter(Boolean).join(' · '))));
      const T = r.teams.slice(0, 4).map(({ t }) => item(id(), '#/t/' + encodeURIComponent(t.slug), ['t', t.slug, t.name, 'Team'].join('|'), crest(t.name, 34), hl(t.name, q), esc(plural(t.nComps, 'competition') + (t.lastYear > 0 ? ' · last played ' + t.lastYear : ''))));
      const C = r.comps.slice(0, 4).map(({ c, nm }) => item(id(), '#/c/' + c.id, ['c', c.id, nm, 'Competition'].join('|'), `<span class="hsq-cm">${compCrest(c, 30)}</span>`, hl(nm, q), esc([c.year, c.nGames ? plural(c.nGames, 'game') : ''].filter(Boolean).join(' · '))));
      const G = r.pages.slice(0, 3).map(p => item(id(), p[2], '', pageMark(p[3]), esc(p[0]), esc(p[1])));
      const X = r.terms.slice(0, 3).map(([k, v]) => item(id(), '#/help/glossary/' + encodeURIComponent(k), 'x|' + k, `<span class="hsq-term${k.length > 4 ? ' sm' : ''}">${esc(k)}</span>`, esc(v.split(' — ')[0]), esc(v.split(' — ')[1] || '')));
      const total = P.length + T.length + C.length + G.length + X.length;
      const more = r.players.length > 6 ? `<a class="hsq-all" href="#/players" data-hsq-all="${esc(q)}">All ${r.players.length.toLocaleString()}</a>` : '';
      res.innerHTML = total
        ? (r.exact ? grp('Stat terms', X) : '') + (r.pageFirst ? grp('Pages', G) : '') + grp('Players', P, more) + grp('Teams', T) + grp('Competitions', C)
          + (r.pageFirst ? '' : grp('Pages', G)) + (r.exact ? '' : grp('Stat terms', X))
        : `<div class="hsq-empty"><b>Nothing matches “${esc(q)}”</b><span>Try a surname, a team (“Titans”), a competition (“Agong 2025”) or a stat (“TS%”).</span></div>`;
    }
    sel = 0; mark();
  }
  const items = () => [...document.querySelectorAll('#hsq [data-go]')];
  function mark() {
    const all = items(), inp = document.querySelector('#hsq input');
    all.forEach((el, i) => el.setAttribute('aria-selected', i === sel));
    const el = all[sel];
    if (el) { el.scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', el.id); } else inp.removeAttribute('aria-activedescendant');
  }
  function pick(el) {
    const href = el.dataset.go, rec = el.dataset.rec;
    if (rec && !rec.startsWith('x|')) {
      const [k, id, t, s] = rec.split('|');
      const list = store.get('recent', []).filter(x => x.h !== href);
      list.unshift({ k, id, t, s, h: href }); store.set('recent', list.slice(0, 8));
    }
    close(false);
    HS.go(href);
    if (rec && rec.startsWith('x|')) setTimeout(() => {   // a stat term: open Formulas filtered to it
      const f = document.getElementById('fx-q'); if (!f) return;
      f.value = rec.slice(2); f.dispatchEvent(new Event('input', { bubbles: true }));
    }, 80);
  }
  function show(prefill) {
    if (open) return;
    open = true; opener = document.activeElement;
    if (typeof PH !== 'undefined' && document.querySelector('.ph-sheet.on')) PH.sheet(false);
    const el = document.createElement('div');
    el.id = 'hsq-root';
    el.innerHTML = `<div class="hsq-veil" data-hsq-close></div>
      <div class="hsq" id="hsq" role="dialog" aria-modal="true" aria-label="Search">
        <div class="hsq-in">${ic('search')}<input type="search" id="hsq-q" autocomplete="off" spellcheck="false" enterkeyhint="go"
          placeholder="Player, team, competition or a stat like TS%" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="hsq-res" aria-autocomplete="list" value="${esc(prefill || '')}">
          <button type="button" class="hsq-x" data-hsq-close aria-label="Close search">Esc</button></div>
        <div class="hsq-body" id="hsq-res" role="listbox" aria-label="Results"></div>
        <div class="hsq-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span><span class="r">Press <kbd>/</kbd> on any page to search</span></div>
      </div>`;
    document.body.appendChild(el);
    document.documentElement.classList.add('hsq-lock');
    const inp = el.querySelector('input');
    draw();
    requestAnimationFrame(() => { el.classList.add('on'); inp.focus({ preventScroll: true }); });
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', e => {
      const n = items().length;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(n, 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + n) % Math.max(n, 1); mark(); }
      else if (e.key === 'Enter') { const it = items()[sel]; if (it) { e.preventDefault(); pick(it); } }
    });
    el.addEventListener('click', e => {
      if (e.target.closest('[data-hsq-close]')) { close(true); return; }
      if (e.target.closest('[data-hsq-clear]')) { store.set('recent', []); draw(); inp.focus(); return; }
      const all = e.target.closest('[data-hsq-all]');
      if (all) { e.preventDefault(); const q = all.dataset.hsqAll; close(false); HS.go('#/players'); setTimeout(() => { const f = document.getElementById('glob-q'); if (f) { f.value = q; f.dispatchEvent(new Event('input', { bubbles: true })); } }, 80); return; }
      const it = e.target.closest('[data-go]'); if (it) pick(it);
    });
    el.addEventListener('mousemove', e => { const it = e.target.closest('[data-go]'); if (it) { const i = items().indexOf(it); if (i >= 0 && i !== sel) { sel = i; mark(); } } });
  }
  function close(back) {
    const el = document.getElementById('hsq-root'); if (!el) return;
    open = false;
    el.classList.remove('on');
    document.documentElement.classList.remove('hsq-lock');
    setTimeout(() => el.remove(), 180);
    if (back && opener && opener.focus) opener.focus({ preventScroll: true });
  }
  const typing = t => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  document.addEventListener('keydown', e => {
    if (open) {
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') { e.preventDefault(); document.getElementById('hsq-q').focus(); }   // the field holds the focus; arrows move through results
      return;
    }
    if ((e.key === '/' && !typing(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      if (document.querySelector('.acc-ov, #acc-modal')) return;
      e.preventDefault(); show('');
    }
  });
  document.addEventListener('click', e => { const b = e.target.closest('[data-hs-search]'); if (b) { e.preventDefault(); show(''); } });
  return { show, close, run };
})();
