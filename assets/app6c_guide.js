/* =========================================================================
   First visit. A reader who lands on Today for the first time is asked what
   they came for (the MBL, the latest scores, a player, every competition) and
   can take a four-stop tour: search, the sections, the explained numbers and
   their own page. Shown once (localStorage hs-seen); the ? in the header and
   "Welcome guide" in the More sheet bring it back. Never shown to automated
   browsers (the page checks and the prerender) unless ?welcome=1 asks.
   Also here: stat abbreviations explain themselves on a tap, not only on a
   hover. One global: HSG.
   ========================================================================= */
const HSG = (() => {
  const store = {
    get(k) { try { return localStorage.getItem('hs-' + k); } catch (e) { return '1'; } },   // storage blocked: never nag
    set(k, v) { try { localStorage.setItem('hs-' + k, v); } catch (e) {} },
  };
  const ic = k => typeof PH !== 'undefined' ? PH.ic(k) : '';
  let open = false, opener = null;

  function facts() {
    const done = COMPS.reduce((a, c) => a + (c.nDone || 0), 0);
    const years = COMPS.map(c => +c.year || +(c.start || '').slice(0, 4)).filter(Boolean);
    const first = Math.min(...years), last = Math.max(...years);
    return { games: done, players: Object.keys(PERSONS).length, comps: COMPS.length, first, seasons: last - first + 1 };
  }
  // a full court from above, in metres (28 × 15)
  const court = () => `<svg class="hsg-court" viewBox="-1 -1 30 17" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".06">
    <rect x="0" y="0" width="28" height="15"/><line x1="14" y1="0" x2="14" y2="15"/><circle cx="14" cy="7.5" r="1.8"/>
    ${[0, 1].map(s => { const x = s ? 28 : 0, d = s ? -1 : 1;
      return `<rect x="${s ? 22.2 : 0}" y="5.05" width="5.8" height="4.9"/><circle cx="${x + d * 5.8}" cy="7.5" r="1.8"/>
      <path d="M${x} .9 L${x + d * 2.99} .9 A6.75 6.75 0 0 ${s ? 0 : 1} ${x + d * 2.99} 14.1 L${x} 14.1"/><circle cx="${x + d * 1.575}" cy="7.5" r=".23"/><line x1="${x + d * 1.2}" y1="6.6" x2="${x + d * 1.2}" y2="8.4"/>`; }).join('')}</g></svg>`;

  function welcome(again) {
    if (open) return;
    store.set('seen', '1');
    open = true; opener = document.activeElement;
    const F = facts(), n = v => v.toLocaleString();
    const ts = STAT_GLOSS['TS%'];
    const el = document.createElement('div');
    el.id = 'hsg-root';
    el.innerHTML = `<div class="hsg-veil" data-hsg-close></div>
      <div class="hsg" role="dialog" aria-modal="true" aria-labelledby="hsg-t">
        <div class="hsg-hero">${court()}
          <div class="hsg-top"><span class="hsg-eye">${again ? 'HoopStatsMY guide' : 'Welcome to HoopStatsMY'}</span>
            <button type="button" class="hsg-x" data-hsg-close aria-label="Close">${ic('x')}</button></div>
          <h2 id="hsg-t" tabindex="-1">Every Malaysian basketball game, <em>in one place</em></h2>
          <p>Live scores, the MBL, every player's career and every competition since ${F.first}, straight from the organisers' own box scores.</p>
          <div class="hsg-facts"><div><b>${n(F.games)}</b><span>games</span></div><div><b>${n(F.players)}</b><span>players</span></div><div><b>${F.comps}</b><span>competitions</span></div><div><b>${F.seasons}</b><span>seasons</span></div></div>
        </div>
        <div class="hsg-body">
          <h3>What are you here for?</h3>
          <div class="hsg-intents">
            <button type="button" class="hsg-in" data-hsg-go="#/mbl"><span class="i">${ic('ball')}</span><b>Follow the MBL</b><span>Games, the table, every player this season</span></button>
            <button type="button" class="hsg-in" data-hsg-go="scores"><span class="i">${ic('clock')}</span><b>See the latest scores</b><span>Results and what is on next</span></button>
            <button type="button" class="hsg-in" data-hsg-go="search"><span class="i">${ic('search')}</span><b>Look up a player</b><span>Or find your own profile</span></button>
            <button type="button" class="hsg-in" data-hsg-go="#/competitions"><span class="i">${ic('trophy')}</span><b>Explore every competition</b><span>Agong Cup, D-League, youth, FIBA…</span></button>
          </div>
          <div class="hsg-foot"><span class="hsg-note">Dotted abbreviations explain themselves. Tap one to try: <button type="button" class="gl" data-imtip="${esc(ts)}">TS%</button> · <a href="#/formulas" data-hsg-link>every number explained</a></span>
            <span class="hsg-acts"><button type="button" class="hsg-btn ghost" data-hsg-close>Just browse</button><button type="button" class="hsg-btn ink" data-hsg-tour>Show me around</button></span></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.documentElement.classList.add('hsq-lock');
    requestAnimationFrame(() => { el.classList.add('on'); el.querySelector('#hsg-t').focus({ preventScroll: true }); });
    el.addEventListener('click', e => {
      if (e.target.closest('[data-hsg-close]')) { close(true); return; }
      if (e.target.closest('[data-hsg-link]')) { close(false); return; }
      if (e.target.closest('[data-hsg-tour]')) { close(false); tour(); return; }
      const b = e.target.closest('[data-hsg-go]'); if (!b) return;
      const t = b.dataset.hsgGo; close(false);
      if (t === 'search') HSQ.show('');
      else if (t === 'scores') { if (HS.hash() !== '#/') HS.go('#/'); setTimeout(() => { const g = document.getElementById('hm-games'); if (g) g.scrollIntoView({ block: 'start', behavior: RM() ? 'auto' : 'smooth' }); }, 120); }
      else HS.go(t);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      if (e.key === 'Tab') {   // keep the focus inside the dialog
        const f = [...el.querySelectorAll('button, a[href]')].filter(x => x.offsetParent);
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }
  function close(back) {
    const el = document.getElementById('hsg-root'); if (!el) return;
    open = false; el.classList.remove('on');
    document.documentElement.classList.remove('hsq-lock');
    if (typeof IM_TIP_EL !== 'undefined' && IM_TIP_EL) IM_TIP_EL.classList.remove('on');
    setTimeout(() => el.remove(), 220);
    if (back && opener && opener.focus) opener.focus({ preventScroll: true });
  }
  const RM = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- the tour ---------- */
  const STOPS = [
    { t: ['.nav .hs-sbtn', '.ph-find'], h: 'Search anything', p: 'A name, a team, a competition — or a stat like TS% to learn what it means. On a keyboard, press / on any page.' },
    { t: ['.nav-links', '.ph-bar'], h: 'Every section, one tap away', p: 'Today has the latest scores. MBL is this season. Players, Competitions, Teams and Records hold every game on record.' },
    { t: ['main th[data-imtip]', 'main .gl[data-imtip]'], h: 'Dotted means explained', p: 'Hover or tap a dotted abbreviation (PTS, TS%, +/-) and it says what it means. The ? in the header opens this guide again.' },
    { t: ['.nav .acc-in', '.nav .acc-chip'], h: 'Make it yours', p: 'Sign in with Google to keep the players you care about on your own page. Browsing never needs an account.' },
  ];
  const vis = sel => [...document.querySelectorAll(sel)].find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  function tour() {
    store.set('seen', '1');
    let i = 0;
    const L = document.createElement('div'); L.id = 'hsg-tour';
    L.innerHTML = '<div class="hsg-spot"></div><div class="hsg-coach" role="dialog" aria-modal="true" aria-live="polite"></div>';
    document.body.appendChild(L);
    const spot = L.querySelector('.hsg-spot'), card = L.querySelector('.hsg-coach');
    const show = () => {
      const s = STOPS[i], el = s && s.t.map(vis).find(Boolean);
      if (!s) return end();
      if (!el) { i++; return show(); }
      const r0 = el.getBoundingClientRect();
      if (r0.top < 70 || r0.bottom > innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect(), pad = 6;
        Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
        const last = !STOPS.slice(i + 1).some(x => x.t.map(vis).find(Boolean));
        card.innerHTML = `<div class="st">${i + 1} of ${STOPS.length}</div><h3>${s.h}</h3><p>${s.p}</p>
          <div class="row"><span class="dots">${STOPS.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</span>
          <span class="acts"><button type="button" class="hsg-btn ghost sm" data-t="end">${last ? 'Close' : 'Skip'}</button><button type="button" class="hsg-btn hl sm" data-t="next">${last ? 'Start exploring' : 'Next'}</button></span></div>`;
        const cw = card.offsetWidth, ch = card.offsetHeight;
        const x = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), innerWidth - cw - 12);
        let y = r.bottom + 16; if (y + ch > innerHeight - 12) y = Math.max(12, r.top - ch - 16);
        card.style.left = x + 'px'; card.style.top = y + 'px';
        card.querySelector('[data-t="next"]').focus({ preventScroll: true });
      });
    };
    const end = () => { L.remove(); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', show); };
    const next = () => { i++; show(); };
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); end(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    };
    card.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === 'next') next(); else end(); });
    L.querySelector('.hsg-spot').addEventListener('click', end);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', show);
    show();
  }

  /* ---------- first visit: on Today only, so a reader sent to one player's page goes straight to it ---------- */
  function maybe() {
    const force = /[?&]welcome=1\b/.test(location.search);
    if (!force && (store.get('seen') || navigator.webdriver || document.documentElement.classList.contains('hs-locked'))) return;
    if (HS.hash() !== '#/' && !force) return;
    setTimeout(() => { if (!open && !document.getElementById('hsq-root') && !document.querySelector('.acc-ov')) welcome(false); }, 900);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-hsg-open]'); if (!b) return;
    e.preventDefault(); if (typeof PH !== 'undefined') PH.sheet(false); welcome(true);
  });

  /* ---------- stat abbreviations on a touch screen ----------
     A tap on any explained header (sortable ones too: the sort still happens)
     or on an inline term shows its explanation for a few seconds. */
  let tipT = 0;
  document.addEventListener('click', e => {
    const el = e.target.closest ? e.target.closest('.gl[data-imtip], th[data-imtip]') : null;
    if (!el || typeof imTipMove !== 'function') return;
    const touch = e.pointerType === 'touch' || (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches);
    if (!el.classList.contains('gl') && !touch) return;
    const r = el.getBoundingClientRect(), txt = el.dataset.imtip;
    setTimeout(() => {   // after the header's own click (a sort redraws the table)
      imTipMove({ clientX: r.left + r.width / 2, clientY: r.bottom }, { dataset: { imtip: txt } });
      clearTimeout(tipT); tipT = setTimeout(() => { if (IM_TIP_EL) IM_TIP_EL.classList.remove('on'); }, 4500);
    }, 0);
  });
  return { welcome, tour, maybe };
})();
function hsgAfterRender() { HSG.maybe(); }
