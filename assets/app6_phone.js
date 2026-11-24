/* =========================================================================
   Phones. Below 700px the site keeps its pages but changes the frame:
   the header becomes one row (wordmark, search, account, theme), the page
   links move to a tab bar at the bottom of the screen (Today, MBL, Search,
   Players, More), and More opens a sheet with everything else. Pages that
   are long lists of sections (the MBL page) switch them with tabs instead
   of stacking them; see app4zh_mbl.js. One global: PH.
   ========================================================================= */
const PH = (() => {
  const MQ = '(max-width:700px)';
  // App mode: the site opened from a phone or iPad home screen (standalone), or
  // framed as an app (?app=1, with st/sb = status-bar and home-bar heights in px).
  // It adds html.app: no website chrome, the header runs under the status bar,
  // and wider screens (iPad) get a side rail in place of the header links.
  const APP = (() => {
    try {
      const r = document.documentElement;
      let q = new URLSearchParams(location.search);
      if (q.has('app')) { try { sessionStorage.setItem('hs-app', location.search); } catch (e) {} }
      else { let k = null; try { k = sessionStorage.getItem('hs-app'); } catch (e) {} if (k) q = new URLSearchParams(k); }
      // the Android app (a WebView) says so in its user agent
      const sa = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true || /\bHoopStatsMYApp\//.test(navigator.userAgent);
      if (!q.has('app') && !sa) return false;
      r.classList.add('app');
      for (const [k, v] of [['st', '--app-st'], ['sb', '--app-sb']]) { const n = parseFloat(q.get(k)); if (n >= 0 && n < 80) r.style.setProperty(v, n + 'px'); }
      return true;
    } catch (e) { return false; }
  })();
  const on = () => typeof matchMedia === 'function' && matchMedia(MQ).matches;
  const I = {
    home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    ball: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3.5 3.2 3.5 14.8 0 18M12 3c-3.5 3.2-3.5 14.8 0 18',
    players: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M15.5 3.6a3.5 3.5 0 0 1 0 6.8',
    trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
    more: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5.2-5.2',
    shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5',
    lineup: 'M5 20v-2a3 3 0 0 1 3-3h0M12 20v-3a3 3 0 0 1 3-3h1M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M15 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M19 20v-2a3 3 0 0 0-3-3',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    swap: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
    split: 'M4 12h16M12 4v16',
    compare: 'M7 4v16M17 4v16M3 8h8M13 16h8',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
    x: 'M6 6l12 12M18 6L6 18',
  };
  const ic = k => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${I[k]}"/></svg>`;
  // which tab of the bar a route belongs to
  function cur() {
    const h = typeof HS !== 'undefined' ? HS.hash() : location.hash || '#/';
    if (/^#\/(home)?$/.test(h) || /^#\/live\//.test(h)) return 'home';
    if (/^#\/mbl\b/.test(h) || /^#\/watch\//.test(h)) return 'mbl';
    if (/^#\/(players|p)\b/.test(h)) return 'players';
    if (/^#\/(competitions|c|cf)\b/.test(h)) return 'comps';
    if (/^#\/(teams|t)\b/.test(h)) return 'teams';
    if (/^#\/milestones\b/.test(h)) return 'miles';
    if (/^#\/records\b/.test(h)) return 'records';
    return 'more';
  }
  function bar() {
    const c = cur();
    const it = [['home', 'Today', '#/', 'home'], ['mbl', 'MBL', '#/mbl', 'ball'], ['search', 'Search', '', 'search'], ['players', 'Players', '#/players', 'players']];
    // Teams, Milestones and Records sit in More on a phone; the iPad rail shows them
    const x2 = [['comps', 'Leagues', '#/competitions', 'trophy'], ['teams', 'Teams', '#/teams', 'shield'], ['miles', 'Milestones', '#/milestones', 'flag'], ['records', 'Records', '#/records', 'star']];
    // Search is a button: it opens the search panel (app6b_search.js)
    const tab = ([k, l, h, i], x) => k === 'search'
      ? `<button type="button" class="ph-tab ph-find" data-hs-search aria-label="Search players, teams and competitions"><span class="i">${ic(i)}</span>${l}</button>`
      : `<a href="${h}" class="ph-tab${k === 'mbl' ? ' live' : ''}${x ? ' ph-x2' : ''}"${c === k ? ' aria-current="page"' : ''}><span class="i">${ic(i)}</span>${l}</a>`;
    const main = ['home', 'mbl', 'players'].includes(c);
    return `<nav class="ph-bar" aria-label="Main">${it.map(t => tab(t)).join('')}${x2.map(t => tab(t, 1)).join('')}
      <button type="button" class="ph-tab ph-more" data-ph="more" data-sub="${main ? '' : x2.some(t => t[0] === c) ? 'x2' : 'more'}" aria-haspopup="dialog" aria-expanded="false"${main ? '' : ' aria-current="page"'}><span class="i">${ic('more')}</span>More</button></nav>
      <div class="ph-veil" data-ph="close" hidden></div>
      <div class="ph-sheet" role="dialog" aria-modal="true" aria-label="More pages" hidden><div class="ph-grab" aria-hidden="true"></div>
        <div class="ph-sh"><h2>More</h2><button type="button" class="ph-x" data-ph="close" aria-label="Close">${ic('x')}</button></div>
        <div class="ph-grid">${[['#/competitions', 'Competitions', 'trophy'], ['#/teams', 'Teams', 'shield'], ['#/records', 'Records & Honours', 'star'], ['#/milestones', 'Milestones', 'flag'], ['#/formulas', 'Formulas', 'book']].map(([h, l, i]) => `<a href="${h}">${ic(i)}<span>${l}</span></a>`).join('')}</div>
        <h3>Tools</h3>
        <div class="ph-list">${[['#/compare', 'Compare players', 'Two players, inside a competition they both played', 'compare'], ['#/compare/lineups', 'Compare lineups', "Two teams' fives against each other", 'swap'],
          ['#/stats/lineups', 'Lineups', 'Groups of 5, 4, 3 or 2 players on court together', 'lineup'], ['#/stats/clutch', 'Clutch', 'Last five minutes, score within five', 'clock'],
          ['#/wowy', 'WOWY', 'A team with and without its players', 'split'], ['#/shift', 'Stat Line Shift', "One player's line with and without teammates", 'players']]
          .map(([h, l, s, i]) => `<a href="${h}">${ic(i)}<span><b>${l}</b><small>${s}</small></span></a>`).join('')}</div>
        <div class="ph-row"><button type="button" data-hsg-open>${ic('book')}Welcome guide</button><button type="button" data-theme-toggle="1">${ic('sun')}Light or dark</button></div></div>`;
  }
  function sheet(open, kb) {
    const s = document.querySelector('.ph-sheet'), v = document.querySelector('.ph-veil'), b = document.querySelector('[data-ph="more"]');
    if (!s) return;
    if (open) { s.hidden = false; v.hidden = false; requestAnimationFrame(() => { s.classList.add('on'); v.classList.add('on'); }); }
    else { s.classList.remove('on'); v.classList.remove('on'); setTimeout(() => { s.hidden = true; v.hidden = true; }, 280); }
    if (b) b.setAttribute('aria-expanded', open);
    document.documentElement.classList.toggle('ph-lock', !!open);
    if (open && kb) { const f = s.querySelector('a'); if (f) f.focus({preventScroll: true}); }
    else if (!open && b && kb) b.focus({preventScroll: true});
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ph="more"], [data-ph="close"]');
    if (b) { e.preventDefault(); sheet(b.dataset.ph === 'more', e.detail === 0); return; }
    if (e.target.closest('.ph-sheet a')) sheet(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.ph-sheet.on')) sheet(false, true); });
  // a swipe down on the sheet closes it
  let y0 = null;
  document.addEventListener('touchstart', e => { y0 = e.target.closest('.ph-sheet') ? e.touches[0].clientY : null; }, {passive: true});
  document.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) sheet(false); y0 = null; });
  function after() { document.documentElement.classList.remove('ph-lock'); tables(); }

  /* ---------- Wide tables on a phone ----------
     A stat table 600-1800px wide makes a phone reader scroll sideways for a
     long time. Below 700px (the CSS in the phone layer decides) each row
     becomes a card: who/when on top, then five key numbers, and a tap opens
     the rest. Sortable tables keep their headers as a row of sort chips.
     Short standings tables keep their table and drop low-value columns.
     Here we only label the cells (data-l, data-id) and mark the rows. */
  const CARDS = [['.pv-table', null], ['.cp-table', ['G', 'MIN', 'PTS', 'REB', 'AST']], ['.ms-tbl', null],
    ['.st-table', ['GP', 'MIN', 'PTS', '+/-', 'FG%']], ['.rh-roll table', 'all'], ['.wy-tbl', ['MIN', 'NET', 'OFF', 'DEF'], 1],
    ['.ros-table', ['#', 'Pos', 'PPG', 'RPG', 'APG']], ['.lx-t', ['MIN', 'PTS', '+/-', 'FG%', '3P%', 'REB', 'AST', 'TOV']]];
  const PRI = ['G', 'GP', 'Caps', 'W–L', 'PTS', 'REB', 'AST', 'MIN', 'PER', 'BPM', 'On', 'Off', 'Diff', '+/-'];
  const IDC = /(^|\s)(left|l|yr|st-left|st-lu|st-tm|st-tmh|cx-rank|cp-rk)(\s|$)/;
  // headings that name who or what a row is: always part of the card's title
  const IDL = /^(#|rk|rank|team|player|lineup|name|club|event|competition|season|opponent)$/i;
  const lab = th => (th.textContent || '').replace(/[▼▲↓↑]/g, '').replace(/\s+/g, ' ').trim();
  function cols(t) {
    const hr = t.tHead && t.tHead.rows[t.tHead.rows.length - 1];
    if (!hr) return null;
    const L = [], th = [];
    for (const c of hr.cells) for (let i = 0; i < (c.colSpan || 1); i++) { L.push(lab(c)); th.push(c); }
    return {L, th, hr};
  }
  function each(tr, f) { let ci = 0; for (const c of tr.cells) { f(c, ci); ci += c.colSpan || 1; } }
  function card(t, keys, nid, nk) {
    const C = cols(t); if (!C) return;
    const rows = [...t.tBodies].flatMap(b => [...b.rows]);
    // the same rows under new headings (a view switch), or a new count of key numbers: label them again
    const sig = C.L.join('|') + '#' + (nk || 0);
    if (t.dataset.phk && t.dataset.phk !== sig) rows.forEach(r => { delete r.dataset.phd; r.classList.remove('ph-xr', 'ph-open', 'ph-full'); r.removeAttribute('tabindex'); r.querySelectorAll('td.ph-br').forEach(x => x.remove()); });
    t.dataset.phk = sig;
    const fresh = rows.filter(r => !r.dataset.phd);
    if (!fresh.length && C.hr.dataset.phd) return;
    // which columns say who/when/where (the card's title) and which hold numbers
    const first = rows.find(r => r.cells.length >= C.L.length - 1) || rows[0];
    const id = C.L.map((l, i) => IDC.test(C.th[i].className) || (keys === 'all' && i < 2) || i < (nid || 0) || IDL.test(l));
    if (first) each(first, (c, ci) => { if (IDC.test(c.className)) id[ci] = true; });
    // a table that marks no who/what column: its first column is the card's title
    if (!id.some(Boolean)) id[0] = true;
    const stat = C.L.map((l, i) => i).filter(i => !id[i]);
    let key;
    if (keys === 'all' || stat.length <= (nk || (nid ? 4 : 6))) key = new Set(stat);
    else {
      const want = keys || PRI, pick = [], n = nk || (nid ? 4 : 5);
      for (const w of want) { const i = stat.find(j => C.L[j] === w); if (i != null && !pick.includes(i)) pick.push(i); if (pick.length === n) break; }
      for (const i of stat) { if (pick.length >= n) break; if (!pick.includes(i)) pick.push(i); }
      key = new Set(pick);
    }
    t.classList.add('ph-cards'); if (keys === 'all') t.classList.add('ph-names'); if (nid) t.classList.add('ph-four');
    if (t.querySelector('thead th[data-csort], thead th button[data-sort], thead th button[data-lx-sort]')) t.classList.add('ph-sort');
    C.hr.dataset.phd = '1';
    C.th.forEach((c, i) => { if (id[i]) c.dataset.id = ''; else c.removeAttribute('data-id'); });
    for (const r of fresh) {
      r.dataset.phd = '1';
      let more = false, n = 0;
      each(r, (c, ci) => {
        n++;
        if (id[ci] || (c.colSpan > 1 && ci < stat[0])) { c.dataset.id = ''; return; }
        c.dataset.l = C.L[ci] || '';
        // a long value or heading (a time span, "21/68 · 30.9%", "JST FGM-A") takes a double slot
        c.classList.toggle('ph-w', Math.max((c.textContent || '').trim().length, (C.L[ci] || '').length) > 7);
        const k = key.has(ci) || /(^|\s)(cp-on|st-sorted)(\s|$)/.test(c.className) || (c.classList.contains('on') && !!t.closest('.lx-scroll'));
        c.classList.toggle('ph-m', !k); if (!k) more = true;
      });
      if (n === 1) { r.classList.add('ph-full'); continue; }
      if (more && !r.classList.contains('pv-tier')) {
        r.classList.add('ph-xr'); r.tabIndex = 0; r.setAttribute('aria-expanded', 'false');
        const br = document.createElement('td'); br.className = 'ph-br'; br.setAttribute('aria-hidden', 'true'); r.appendChild(br);
      }
    }
  }
  function fit(t) {
    const C = cols(t); if (!C) return;
    if (!C.L.includes('Diff')) return;
    t.classList.add('ph-fit');
    C.th.forEach((c, i) => { c.dataset.l = C.L[i]; });
    for (const b of t.tBodies) for (const r of b.rows) if (!r.dataset.phd) { r.dataset.phd = '1'; each(r, (c, ci) => { c.dataset.l = C.L[ci] || ''; }); }
  }
  function tables() {
    if (on()) {
      const m = document.querySelector('main') || document.body;
      for (const [sel, keys, nid] of CARDS) m.querySelectorAll(sel).forEach(t => card(t, keys, nid));
      m.querySelectorAll('.cx-table, .table-scroll > table:not([class])').forEach(fit);
    }
    fitAll();
  }

  /* ---------- Any table that still does not fit (update-130) ----------
     Every width (it began with phones and tablets). The rule for the site: a data
     table shows all of its content inside its box, with no sideways scroll.
     A table wider than its box first gives up some padding (fx-t1), then
     some type size (fx-t2); if it still does not fit, its rows become cards,
     on a phone the phone's cards (five numbers a line), on a tablet or a
     laptop wider cards with eight numbers a line (tb-cards). A tap opens the rest. */
  // every width: the honour rolls and the lineup table are wider than a laptop's page too
  const fon = () => true;
  function boxOf(t) {
    for (let e = t.parentElement; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e).overflowX;
      if (o !== 'visible' || e.matches('main, .page, section, .card')) return e;
    }
    return t.parentElement || document.body;
  }
  // a table drawn as a block can scroll inside itself: its scrollWidth is what it needs
  const over = (t, b) => Math.max(t.getBoundingClientRect().width, t.scrollWidth) > b.clientWidth + 1 - (parseFloat(getComputedStyle(b).paddingLeft) || 0) - (parseFloat(getComputedStyle(b).paddingRight) || 0)
    || t.scrollWidth > t.clientWidth + 1;
  function cardSpec(t) { for (const [sel, keys, nid] of CARDS) if (t.matches(sel)) return [keys, nid]; return [null, 0]; }
  function fitOne(t, tab) {
    if (t.dataset.fx) {
      if (t.dataset.fx === 'cards') { const [k, nid] = cardSpec(t); card(t, k, nid, tab ? (nid ? 4 : 8) : 0); }
      return;
    }
    if (t.closest('svg, [data-nofit]') || !t.tHead || !t.tBodies.length || !t.offsetWidth) return;
    if (!tab && t.classList.contains('ph-cards')) { t.dataset.fx = 'ok'; return; }
    const b = boxOf(t);
    if (!b || !b.clientWidth) return;
    if (!over(t, b)) { t.dataset.fx = 'ok'; return; }
    t.classList.add('fx-t1');
    if (!over(t, b)) { t.dataset.fx = 't1'; return; }
    t.classList.add('fx-t2');
    if (!over(t, b)) { t.dataset.fx = 't2'; return; }
    t.classList.remove('fx-t1', 'fx-t2');
    const [k, nid] = cardSpec(t);
    t.dataset.fx = 'cards';
    t.classList.add('ph-cards', 'fx-cards');
    if (tab) t.classList.add('tb-cards');
    card(t, k, nid, tab ? (nid ? 4 : 8) : 0);
  }
  function fitAll() {
    if (!fon()) return;
    const m = document.querySelector('main') || document.body, tab = !on();
    m.querySelectorAll('table').forEach(t => fitOne(t, tab));
  }
  // a new width (a turned tablet, a resized window): every table is measured again
  let fw = typeof innerWidth === 'number' ? innerWidth : 0, fr = 0;
  function refit() {
    if (innerWidth === fw) return; fw = innerWidth;
    document.querySelectorAll('table[data-fx]').forEach(t => {
      if (t.dataset.fx === 'cards') t.classList.remove('fx-cards', 'tb-cards', ...(on() ? [] : ['ph-cards']));
      t.classList.remove('fx-t1', 'fx-t2'); delete t.dataset.fx;
    });
    tables();
  }
  addEventListener('resize', () => { clearTimeout(fr); fr = setTimeout(refit, 200); });
  // tabs and view switches show tables that were hidden: measure after a tap
  document.addEventListener('click', () => { clearTimeout(tq); tq = setTimeout(tables, 160); });
  if (typeof matchMedia === 'function') { const mq = matchMedia(MQ); (mq.addEventListener ? mq.addEventListener('change', tables) : mq.addListener(tables)); }
  let tq = 0;
  new MutationObserver(() => { clearTimeout(tq); tq = setTimeout(tables, 120); }).observe(document.documentElement, {childList: true, subtree: true});
  function flip(r) { const o = !r.classList.contains('ph-open'); r.classList.toggle('ph-open', o); r.setAttribute('aria-expanded', o); }
  document.addEventListener('click', e => {
    const r = e.target.closest('table.ph-cards tr.ph-xr');
    if (!r || !(on() || r.closest('table.tb-cards')) || e.target.closest('a, button, input, select, label, [data-pvopen]')) return;
    flip(r);
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('table.ph-cards tr.ph-xr') && (on() || e.target.closest('table.tb-cards'))) { e.preventDefault(); flip(e.target); }
  });
  return {on, bar, after, ic, sheet, app: APP, tables};
})();
function phAfterRender() { PH.after(); }
