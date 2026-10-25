/* =========================================================================
   Addresses. Pages live at real paths under the site's base (/p/2568859/,
   /c/38534/standings/), so each one can be found by a search engine and shows
   its own preview when shared. The rest of the app still speaks in route
   strings of the old form ("#/p/2568859"): HS.hash() is the current route in
   that form, and HS.go() moves to one. Old "#/" links are turned into paths.
   The base comes from <meta name="hs-base">; a page opened from disk
   (file://) keeps the old hash addresses.
   ========================================================================= */
const HS = (() => {
  const meta = document.querySelector('meta[name="hs-base"]');
  const BASE = (meta && meta.getAttribute('content')) || '/';
  const PATHS = location.protocol !== 'file:';
  const BOOT_PATH = location.pathname;        // the page the server drew (its HTML is in #app until the app draws)

  // '#/p/1', '/p/1', 'p/1/' -> the route without its slashes at either end ('p/1')
  const clean = h => String(h || '').replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  function hash() {
    if (!PATHS) return location.hash || '#/';
    let p = location.pathname;
    p = p.indexOf(BASE) === 0 ? p.slice(BASE.length) : p.replace(/^\/+/, '');
    p = p.replace(/(^|\/)(index|404)\.html$/, '');
    return '#/' + clean(p);
  }
  function url(h) {
    const r = clean(h);
    return PATHS ? BASE + (r ? r + '/' : '') : '#/' + r;
  }
  function go(h, replace) {
    const u = url(h);
    if (!PATHS) { if (replace) location.replace(u); else location.hash = u; return; }
    if (!replace && u === location.pathname) return;          // as before: the same address changes nothing
    history[replace ? 'replaceState' : 'pushState'](null, '', u);
    route();
  }
  // links the app writes as href="#/…" get their real address, wherever they are added
  function fix(root) {
    if (root.matches && root.matches('a[href^="#/"]')) root.setAttribute('href', url(root.getAttribute('href')));
    if (root.querySelectorAll) root.querySelectorAll('a[href^="#/"]').forEach(a => a.setAttribute('href', url(a.getAttribute('href'))));
  }
  function start() {
    if (PATHS) {
      // an old link (…/#/p/123) becomes the page's address
      if (/^#\//.test(location.hash)) history.replaceState(null, '', url(location.hash));
      fix(document.body);
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) fix(n); })))
        .observe(document.body, { childList: true, subtree: true });
      window.addEventListener('popstate', route);
      window.addEventListener('hashchange', () => { if (/^#\//.test(location.hash)) go(location.hash, true); });
      // a click on a link inside the site moves without reloading. This listens on window, so it runs after
      // the app's own document-level handlers and leaves alone any click one of them has already taken.
      window.addEventListener('click', e => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
        const href = a.getAttribute('href');
        if (href.indexOf('#/') === 0) { e.preventDefault(); go(href); return; }
        const u = new URL(a.href, location.href);
        if (u.origin !== location.origin || u.pathname.indexOf(BASE) !== 0) return;
        if (/\.[a-z0-9]{2,5}$/i.test(u.pathname) && !/index\.html$/.test(u.pathname)) return;   // a file, not a page
        if (u.hash && u.pathname === location.pathname) return;                               // an anchor on this page
        e.preventDefault();
        go(u.pathname.slice(BASE.length));
      });
    } else {
      window.addEventListener('hashchange', route);
    }
    route();
    // after the first page: the box scores, then the ratings. One at a time, so on a slow line the
    // box scores (which most pages wait for) are not sharing it with the ratings
    if (boxesIn()) loadMore(); else loadBoxes();
  }
  const load = (src, onerror) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    if (onerror) s.onerror = onerror;
    document.head.appendChild(s);
  };
  // The box scores come in a file of their own right after the first page (DB.box -> boxes()). Home and
  // the directories never read them; any other page waits for them (route(): a page the server drew
  // stays on screen meanwhile) and is drawn when they arrive. A failed load is tried once more.
  let boxIn = false, boxTry = 0;
  const boxesIn = () => boxIn || !DB.box || typeof DB_BOX === 'object';
  function loadBoxes() {
    load(DB.box, () => { if (++boxTry < 2) setTimeout(loadBoxes, 1500); else loadMore(); });
  }
  function boxes(part) {
    if (boxIn) return;
    boxIn = true;
    if (typeof boxesArrived === 'function') boxesArrived(part);
    if (typeof softRoute === 'function' && document.getElementById('app')) softRoute();
    loadMore();
  }
  // The ratings (BPM, PER, Win Shares, on/off) and the play-by-play periods come in a second file after
  // the box scores; the pages that show them are drawn again when it arrives.
  let moreIn = false, moreAsked = false;
  function loadMore() {
    if (!DB.more || moreIn || moreAsked) return;
    moreAsked = true;
    load(DB.more);
  }
  function more(part) {
    Object.assign(DB, part);
    moreIn = true;
    if (typeof PV !== 'undefined') PV.data = null;
    if (/^#\/(p|c|compare|watch|stats)\//.test(hash()) && typeof softRoute === 'function') softRoute();
  }
  return { BASE, PATHS, BOOT_PATH, hash, url, go, start, more, boxes, hasBoxes: boxesIn, hasMore: () => moreIn || !DB.more };
})();
