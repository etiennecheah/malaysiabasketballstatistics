// Writes one HTML file per page of the site, so every player, competition, team and
// box score has a real address that search engines can read and that shows its own
// preview when shared. Each file holds the page exactly as the app draws it (the app
// itself is run here, in Node, with a stand-in for the browser), plus that page's
// title, description and structured data. The app replaces it with the live page
// once its scripts arrive.
//   node prerender.js <out dir> <shell template> <site url> <db.js> <app.js>
const fs = require('fs'), path = require('path'), vm = require('vm');
const [OUT, SHELL, SITE, DBJS, APPJS] = process.argv.slice(2);
const BASE = new URL(SITE).pathname.replace(/\/?$/, '/');
const shell = fs.readFileSync(SHELL, 'utf8');

// ---- a browser just big enough for the app to boot and draw pages into #app
function el() {
  return {
    innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, children: [], childNodes: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null }, hasAttribute() { return false },
    appendChild(x) { return x; }, removeChild() {}, insertAdjacentHTML() {}, remove() {}, focus() {}, blur() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, matches() { return false; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
  };
}
const app = el(), body = el(), head = el();
const baseMeta = { getAttribute: () => BASE };
const document = {
  getElementById: id => (id === 'app' ? app : null),
  querySelector: s => (s === 'meta[name="hs-base"]' ? baseMeta : null),
  querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  createElement: () => el(), createElementNS: () => el(), createTextNode: () => el(),
  documentElement: el(), body, head, title: '', cookie: '', readyState: 'complete', visibilityState: 'visible',
};
const SITE_U = new URL(SITE);
// the real host, so the parts of the page that depend on it (the sign-in button) are drawn as visitors will see them
const location = { protocol: 'https:', host: SITE_U.host, hostname: SITE_U.hostname, origin: SITE_U.origin, pathname: BASE, hash: '', search: '', href: SITE, replace() {}, reload() {} };
const store = () => ({ getItem: () => null, setItem() {}, removeItem() {} });
const ctx = {
  console, document, location, localStorage: store(), sessionStorage: store(),
  history: { pushState() {}, replaceState() {} },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, scrollTo() {}, scrollY: 0, innerWidth: 1280, innerHeight: 900,
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  navigator: { userAgent: 'prerender', language: 'en' }, fetch: () => new Promise(() => {}),
  performance: { now: () => Date.now() }, MutationObserver: class { observe() {} disconnect() {} },
  IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} }, ResizeObserver: class { observe() {} disconnect() {} },
  URL, URLSearchParams, Intl, Date, Math, JSON,
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(DBJS, 'utf8'), ctx, { filename: 'db.js' });
vm.runInContext(fs.readFileSync(APPJS, 'utf8') + '\n;this.__route = route; this.__meta = hsMeta;', ctx, { filename: 'app.js' });

// ---- every page that gets a file of its own
const routes = vm.runInContext(`(() => {
  const r = ['', 'players', 'competitions', 'teams', 'formulas', 'compare', 'privacy'];
  Object.keys(PERSONS).forEach(pid => { if (!PALIAS[pid]) r.push('p/' + pid); });
  COMPS.forEach(c => {
    r.push('c/' + c.id);
    ['standings', 'schedule', 'teams', 'players', 'leaders'].forEach(t => r.push('c/' + c.id + '/' + t));
    c.teams.forEach(tid => r.push('c/' + c.id + '/team/' + tid));
    c.games.forEach(g => { if (g.box && BOXES.hasOwnProperty(g.mid)) r.push('c/' + c.id + '/box/' + g.mid); });
  });
  teamIndex().forEach(t => r.push('t/' + t.slug));
  cfIndex().forEach(f => r.push('cf/' + f.key));
  return [...new Set(r)];
})()`, ctx);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlOf = r => BASE + (r ? r.split('/').map(encodeURIComponent).join('/') + '/' : '');
const absOf = r => new URL(urlOf(r), SITE).href;
const links = html => html.replace(/href="#\/([^"]*)"/g, (m, r) => 'href="' + urlOf(r.replace(/\/+$/, '').split('/').map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } }).join('/')) + '"');
function fill(t, m, html, r) {
  const ld = (m.ld || []).map(o => '<script type="application/ld+json">' + JSON.stringify(Object.assign({ url: absOf(r) }, o)).replace(/</g, '\\u003c') + '</script>').join('\n');
  return t.replace('{{TITLE}}', esc(m.title)).replace(/\{\{DESC\}\}/g, esc(m.desc)).replace('{{OGTITLE}}', esc(m.title.replace(/ \| HoopStatsMY$/, '')))
    .replace(/\{\{URL\}\}/g, esc(absOf(r))).replace('{{ROBOTS}}', m.index ? '' : '<meta name="robots" content="noindex">\n')
    .replace('{{LD}}', ld).replace('{{APP}}', () => html);
}

const t0 = Date.now(), sitemap = [];
let n = 0, bytes = 0, bad = 0;
for (const r of routes) {
  if (r && r.split('/').some(x => !x || x === '.' || x === '..' || /[\\\x00-\x1f]/.test(x))) { bad++; continue; }
  location.pathname = urlOf(r);
  let html, m;
  try {
    ctx.__route();
    html = links(app.innerHTML);
    m = ctx.__meta('#/' + r);
  } catch (e) {
    console.error('prerender: ' + (r || '/') + ': ' + e.message);
    bad++;
    continue;
  }
  const file = path.join(OUT, ...r.split('/').filter(Boolean), 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const page = fill(shell, m, html, r);
  fs.writeFileSync(file, page);
  n++; bytes += page.length;
  if (m.index) sitemap.push(absOf(r));
}
// any address without a file of its own (a player's Stats tab, a play-by-play, Compare with two players)
// gets the app with nothing drawn yet; the app draws the page from the address
fs.writeFileSync(path.join(OUT, '404.html'), fill(shell, { title: 'HoopStatsMY — Malaysia Basketball Database', desc: 'Malaysian basketball statistics.', index: false, ld: [] },
  '<div class="page"><div class="page-head"><div><h1 class="page-title">Loading…</h1></div></div></div>', '')
  .replace(/<link rel="canonical"[^>]*>\n?/, '').replace(/<meta property="og:url"[^>]*>\n?/, ''));
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemap.map(u => '<url><loc>' + esc(u) + '</loc></url>').join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + new URL('sitemap.xml', SITE).href + '\n');
console.log('prerender: %d pages (%d in the sitemap) in %ds, %s MB%s', n, sitemap.length, Math.round((Date.now() - t0) / 1000),
  (bytes / 1048576).toFixed(1), bad ? ', ' + bad + ' skipped' : '');
if (bad > 20) process.exit(1);
