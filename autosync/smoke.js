// Open the freshly built site in a real browser before it is published.
//   node smoke.js <path to index.html> [<cid>:<mid> ...]
// Fails (exit 1) on any script error, if Home or Games do not render, or if a newly
// synced game does not show as final with its box score.
let pw;
try { pw = require('playwright-core'); } catch (e) { pw = require('playwright'); }
const path = require('path');

(async () => {
  const file = path.resolve(process.argv[2]);
  const games = process.argv.slice(3).map(x => x.split(':'));
  const exe = process.env.CHROME_PATH || process.env.CHROME_BIN;
  const launch = exe ? { executablePath: exe } : { channel: 'chrome' };
  const browser = await pw.chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('script error on ' + (page.url().split('#')[1] || '/') + ': ' + e.message));
  // the page alone, as built: fonts, sign-in and the live relay are left out of the check
  await page.route('**/*', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(250); };

  await page.goto('file://' + file + '#/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const home = await page.evaluate(() => ({
    title: (document.querySelector('.hm-title') || {}).textContent || '',
    tiles: document.querySelectorAll('.hm-tile').length,
    comps: typeof COMPS !== 'undefined' ? COMPS.length : 0,
    faces: typeof DB !== 'undefined' ? Object.keys(DB.photos || {}).filter(k => !(DB.avatars && DB.avatars[k])).length : -1,
    photos: typeof DB !== 'undefined' ? Object.keys(DB.photos || {}).length : 0,
  }));
  if (!home.title) errors.push('Home did not render');
  if (!home.tiles) errors.push('Home shows no latest results');
  if (home.comps < 70) errors.push('only ' + home.comps + ' competitions in the page data');
  if (home.faces !== 0) errors.push(home.faces + ' of ' + home.photos + ' portraits have no face crop for the small avatar discs');

  await go('/games');
  const cards = await page.evaluate(() => document.querySelectorAll('.gcard').length);
  if (!cards) errors.push('Games page shows no game cards');

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
  console.log('page check: Home ' + home.tiles + ' result tiles, ' + home.comps + ' competitions, Games ' + cards + ' cards, Players ' + pcards + ' cards, ' + games.length + ' new game(s)');
  if (errors.length) { console.log('PAGE CHECK FAILED\n  ' + errors.join('\n  ')); process.exit(1); }
})().catch(e => { console.log('PAGE CHECK FAILED\n  ' + e.message); process.exit(1); });
