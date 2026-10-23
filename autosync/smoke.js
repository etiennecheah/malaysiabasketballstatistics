// Open the freshly built site in a real browser before it is published.
//   node smoke.js <site directory (public/ or _site/)> [<cid>:<mid> ...]
// The directory is served the way GitHub Pages serves it (pages at their own paths under
// the base, 404.html for the rest). Fails (exit 1) on any script error, if Home or its games box
// does not render, if a page written for search engines is missing or wrong, or if a newly
// synced game does not show as final with its box score.
let pw;
try { pw = require('playwright-core'); } catch (e) { pw = require('playwright'); }
const path = require('path'), fs = require('fs'), http = require('http');

function serve(root, base) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain' };
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    const send = (f, code) => { r.writeHead(code, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); };
    if (u.indexOf(base) !== 0) { r.writeHead(404); r.end(); return; }
    let f = path.join(root, u.slice(base.length));
    if (!path.resolve(f).startsWith(path.resolve(root))) { r.writeHead(403); r.end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!u.endsWith('/')) { r.writeHead(301, { location: u + '/' }); r.end(); return; }
      f = path.join(f, 'index.html');
    }
    if (fs.existsSync(f)) send(f, 200); else send(path.join(root, '404.html'), 404);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

(async () => {
  let root = path.resolve(process.argv[2]);
  if (/\.html$/.test(root)) root = path.dirname(root);
  const games = process.argv.slice(3).map(x => x.split(':'));
  const errors = [];
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const base = (indexHtml.match(/<meta name="hs-base" content="([^"]*)"/) || [])[1] || '/';
  // the files written for search engines and link previews
  for (const f of ['404.html', 'sitemap.xml', 'robots.txt', 'og.png']) if (!fs.existsSync(path.join(root, f))) errors.push(f + ' is missing');
  const sm = fs.existsSync(path.join(root, 'sitemap.xml')) ? (fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length : 0;
  if (sm < 1000) errors.push('the sitemap lists only ' + sm + ' pages');
  if (!/<link rel="canonical"/.test(indexHtml) || !/og:image/.test(indexHtml)) errors.push('Home has no canonical link or preview image');
  const srv = await serve(root, base);
  const origin = 'http://127.0.0.1:' + srv.address().port;
  const exe = process.env.CHROME_PATH || process.env.CHROME_BIN;
  const launch = exe ? { executablePath: exe } : { channel: 'chrome' };
  const browser = await pw.chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // past the password screen (data/site_config.json gate_sha256), as a visitor who has entered it
  let gate = '';
  try { gate = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'site_config.json'), 'utf8')).gate_sha256 || ''; } catch (e) {}
  if (gate) await page.addInitScript(h => { try { localStorage.setItem('hs-gate', h); } catch (e) {} }, gate);
  page.on('pageerror', e => errors.push('script error on ' + page.url().replace(origin, '') + ': ' + e.message));
  // the site alone, as built: fonts, sign-in and the live relay are left out of the check
  await page.route('**/*', r => (r.request().url().startsWith(origin) ? r.continue() : r.abort()));
  const go = async h => { await page.evaluate(x => HS.go('#' + x), h); await page.waitForTimeout(250); };
  const ready = () => page.waitForFunction(() => typeof HS !== 'undefined' && typeof COMPS !== 'undefined', null, { timeout: 30000 });

  // a player's page opened at its own address: the file names the player, and the app draws the same page
  const pids = fs.existsSync(path.join(root, 'p')) ? fs.readdirSync(path.join(root, 'p')) : [];
  if (pids.length < 1000) errors.push('only ' + pids.length + ' player pages were written');
  else {
    const pid = pids[Math.floor(pids.length / 2)];
    const file = fs.readFileSync(path.join(root, 'p', pid, 'index.html'), 'utf8');
    await page.goto(origin + base + 'p/' + pid + '/', { waitUntil: 'load' });
    await ready();
    await page.waitForTimeout(300);
    const pv = await page.evaluate(id => ({ name: personName(id), title: document.title, at: HS.hash() }), pid);
    if (!file.includes('<title>' + pv.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')) ) errors.push('page file for player ' + pid + ' does not carry the player\'s name in its title');
    if (pv.at !== '#/p/' + pid || !pv.title.startsWith(pv.name)) errors.push('player ' + pid + ' at its own address: the app shows ' + pv.at + ' / ' + pv.title);
  }

  await page.goto(origin + base, { waitUntil: 'load' });
  await ready();
  await page.waitForTimeout(800);
  const home = await page.evaluate(() => ({
    title: (document.querySelector('#hm-games') || {}).textContent || '',
    tiles: document.querySelectorAll('#hm-games .hmg-res .hmg-row').length,
    comps: typeof COMPS !== 'undefined' ? COMPS.length : 0,
    faces: typeof DB !== 'undefined' ? Object.keys(DB.photos || {}).filter(k => !(DB.avatars && DB.avatars[k])).length : -1,
    photos: typeof DB !== 'undefined' ? Object.keys(DB.photos || {}).length : 0,
  }));
  if (!home.title) errors.push('Home did not render');
  if (!home.tiles) errors.push('Home games box shows no results');
  if (home.comps < 70) errors.push('only ' + home.comps + ' competitions in the page data');
  if (home.faces !== 0) errors.push(home.faces + ' of ' + home.photos + ' portraits have no face crop for the small avatar discs');

  // every tab of a player profile: a tab that throws would otherwise open to a blank page
  const tabPid = await page.evaluate(() => Object.keys(DB.photos || {}).find(id => PERSONS[id]) || Object.keys(PERSONS)[0]);
  for (const t of ['', '/stats', '/log', '/adv', '/splits', '/report']) {
    await go('/p/' + tabPid + t);
    const ok = await page.evaluate(() => !!document.querySelector('.pv-hero') && document.body.innerText.length > 500);
    if (!ok) errors.push('player ' + tabPid + ' tab ' + (t || '/overview') + ' did not render');
  }

  // Compare › Lineups pulls one file per competition from stats/lv/: the tables must fill
  await go('/compare/lineups');
  await page.waitForFunction(() => document.querySelectorAll('.cl-row').length || document.querySelector('.cl-msg'), null, { timeout: 15000 }).catch(() => {});
  const clRows = await page.evaluate(() => document.querySelectorAll('.cl-row').length);
  if (!clRows) errors.push('Compare › Lineups shows no lineups');

  await go('/players');
  const pcards = await page.evaluate(() => document.querySelectorAll('.pcard').length);
  if (!pcards) errors.push('Players page shows no players');

  // the Stats pages pull one file per competition from stats/: both must fill their tables
  for (const [route, body] of [['/stats/lineups', 'st-lu-tbody'], ['/stats/clutch', 'st-cl-tbody']]) {
    await go(route);
    let rows = 0;
    for (let i = 0; i < 40 && !rows; i++) {
      rows = await page.evaluate(id => { const t = document.getElementById(id); return t && !t.querySelector('.st-empty') ? t.querySelectorAll('tr').length : 0; }, body);
      if (!rows) await page.waitForTimeout(150);
    }
    if (!rows) errors.push('Stats page ' + route + ' did not fill its table');
  }

  // the Shot map tab, where any competition has shot charts: it loads its file and draws the court
  const shotPid = await page.evaluate(() => String(DB.shotIdx || '').split(',').filter(p => p && PERSONS[p])[0] || null);
  if (shotPid) {
    await go('/p/' + shotPid + '/shots');
    let ok = false;
    for (let i = 0; i < 80 && !ok; i++) {           // a career map loads his file and every event's averages
      ok = await page.evaluate(() => !!(document.getElementById('sm-cv') || document.querySelector('#sm-3d canvas')) && document.querySelectorAll('.sm-zrow').length > 0);
      if (!ok) await page.waitForTimeout(150);
    }
    if (!ok) errors.push('Shot map tab for player ' + shotPid + ' did not draw');
  }

  // Milestones: the MBL leaders and the milestones reached, worked out from the box scores
  await go('/milestones');
  const ms = await page.evaluate(() => [document.querySelectorAll('.ms-lr').length, document.querySelectorAll('.ms-fi').length, document.querySelectorAll('.ms-ft').length]);
  if (!(ms[0] > 0 && ms[1] > 0 && ms[2] === 7)) errors.push('Milestones page did not fill (' + ms.join('/') + ')');

  // Records & Honours: the roll of honour and the record cards, worked out from the box scores
  await go('/records');
  const rh = await page.evaluate(() => [document.querySelectorAll('.rh-roll tbody tr').length, document.querySelectorAll('.rh-rc').length, document.querySelectorAll('.rh-hc').length]);
  if (!(rh[0] > 0 && rh[1] > 0 && rh[2] > 0)) errors.push('Records & Honours page did not fill (' + rh.join('/') + ')');

  // a game's Shot chart tab (box score page), where a finished game has a chart: both teams' toggles and the court
  const shotGame = await page.evaluate(() => { for (const c of COMPS) for (const g of c.games) if (typeof hasGameShots === 'function' && hasGameShots(c.id, g.mid)) return [c.id, g.mid]; return null; });
  if (shotGame) {
    await go('/c/' + shotGame[0] + '/shots/' + shotGame[1]);
    let ok = false;
    for (let i = 0; i < 80 && !ok; i++) {
      ok = await page.evaluate(() => document.querySelectorAll('.sg-team').length === 2 && !!(document.getElementById('sm-cv') || document.querySelector('#sm-3d canvas')) && document.querySelectorAll('.sm-zrow').length > 0);
      if (!ok) await page.waitForTimeout(150);
    }
    if (!ok) errors.push('Shot chart tab of game ' + shotGame[1] + ' did not draw');
  }

  for (const [cid, mid] of games) {
    await go('/c/' + cid + '/box/' + mid);
    const r = await page.evaluate(([cid, mid]) => {
      const c = COMP_BY_ID[cid], g = c && c.games.find(x => x.mid === mid);
      const b = typeof getBox === 'function' ? getBox(mid) : null;
      const text = document.getElementById('app').innerText;
      return { g: g && { st: g.st, h: g.h, a: g.a, hs: g.hs, as: g.as }, rows: b && b.p ? b.p.length : 0,
        tables: document.querySelectorAll('#app table').length,
        shows: !!g && text.includes(String(g.hs)) && text.includes(String(g.as)) };
    }, [cid, mid]);
    if (!r.g) errors.push(mid + ': game is not in the page data');
    else if (r.g.st !== 'COMPLETE') errors.push(mid + ': game is not final in the page data (' + r.g.st + ')');
    else if (r.rows < 10) errors.push(mid + ': box score has only ' + r.rows + ' player rows');
    else if (r.tables < 2 || !r.shows) errors.push(mid + ': box score page does not show the two teams\' tables and the final score');
    else console.log('game ' + mid + ': ' + r.g.h + ' ' + r.g.hs + '-' + r.g.as + ' ' + r.g.a + ', ' + r.rows + ' box rows');
    await go('/c/' + cid + '/schedule');
  }
  await browser.close();
  srv.close();
  console.log('page check: Home ' + home.tiles + ' results in the games box, ' + home.comps + ' competitions, Players ' + pcards + ' cards, ' + games.length + ' new game(s)');
  if (errors.length) { console.log('PAGE CHECK FAILED\n  ' + errors.join('\n  ')); process.exit(1); }
})().catch(e => { console.log('PAGE CHECK FAILED\n  ' + e.message); process.exit(1); });
