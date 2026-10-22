# Page speed and search engines: real addresses and prerendered pages (update-31, 2026-10-15)

These are items 4 (speed) and 5 (search and sharing) from the launch-readiness list. The user's decisions:
- **Pages move to real paths.** For example `/p/2568859/` instead of `#/p/2568859`. Old `#/` links still work and are turned into paths.
- **The site stays on github.io for now.** The address is a setting.
- **Every page goes into search, minors included.** The pages written for search engines carry the same content as the site.

## What the build produces now (`build_site.py` → `public/`)
The old single `site.html` (15.7 MB, 6.0 MB gzipped) is gone. `public/` holds:
- **One HTML file per page,** written by `prerender.js`. That's 10,589 pages:
  - 5,940 players
  - each of the 101 competitions with five tabs
  - competition team pages
  - ~2,900 box scores
  - 196 club pages (`t/`)
  - 18 family pages (`cf/`)
  - the section pages
  - Each file holds the page exactly as the app draws it. `prerender.js` runs the real app code in Node's `vm`, with a stand-in for the browser, about 3 ms a page.
  - Each file also has its own `<title>`, meta description, canonical link, Open Graph and Twitter tags, and JSON-LD (Person, SportsEvent, SportsTeam).
- **`assets/app.<hash>.js`, `assets/style.<hash>.css`.**
- **`assets/db.<hash>.js`:** `var DB={…}`, about 2.26 MB gzipped.
- **`assets/db-more.<hash>.js`:** the ratings (`bpm`, `bpmMeta`, `adv`, `onoff`, `onoffMeta`, `pbpPer`), about 0.75 MB gzipped.
  - It is loaded after the first page is drawn. `HS.more()` merges it into `DB` and redraws the `p/`, `c/`, `compare`, `watch` and `stats` pages.
- **`img/<sha1>.webp`:** all logos, portraits, avatars, flags and competition marks as files. Before, they were base64 inside the page, about 2.6 MB that gzip couldn't shrink.
- **`404.html`:** the app with nothing drawn yet. GitHub Pages serves it for every address without a file of its own (a player's Stats tab, play-by-play, Compare with two players, `me`, `admin`), and the app draws the page from the address.
- **`sitemap.xml`** (every page), **`robots.txt`**, **`og.png`** (1200×630 default preview card), **`favicon.png`.**
- **Size:** about 183 MB raw for the HTML pages, but only about 12 MB of the gzipped Pages artifact (the rest of the artifact is 17 MB). The build takes about 40 s longer.

## Measured (simulated 4G: 10 Mbit/s, 150 ms latency, phone CPU ×4 slower)
| | old single file | new |
|---|---|---|
| Player page content visible | 8.1 s | **0.6 s** |
| App ready (interactive) | 8.2 s | **4.3 s** |
| Transferred | 5.7 MB | 3.2 MB (including the late ratings file) |

## Routing (`assets/app0_router.js`, first in `PARTS`)
- **`HS.hash()`** returns the current route in the old form (`#/p/123`), read from `location.pathname` minus the base. Everything else in the app still speaks in those strings.
- **`HS.go(route, replace)`** calls `pushState`, then `route()`. Every `location.hash = …` read and write in the app was rewritten to these two.
- **The base** comes from `<meta name="hs-base">`. A page opened from disk (`file://`) keeps hash routing.
- **Links:** a MutationObserver rewrites every `a[href^="#/"]` to its real path. A `window` click listener moves inside the site without a reload. It runs after the app's document-level handlers, and skips modifier-key clicks, `target`, files and anchors.
- **Legacy links:** `…/#/p/123` is replaced with `/p/123/` on load, and on `hashchange`.
- **Other paths:** `pbp/` and `stats/` scripts now load from `HS.BASE + …`.
- **Titles:** `assets/app4t_meta.js` `hsMeta(route)` gives the title, description, JSON-LD and the index flag. `route()` calls `hsApplyMeta()`, so the tab title follows the page. The prerender uses the same function.
- **Gotcha:** `HS`, `COMPS` and the rest are top-level `const`s in a classic script. They are globals but **not** `window` properties, so test with `typeof HS !== 'undefined'`.

## Settings
- **`data/site_config.json`:** `url` (the public address; canonical links, previews, the sitemap and `autosync/run.py`'s `SITE` all follow it) and `google_verification` (Search Console's HTML-tag method).
- **Moving to a custom domain:**
  1. Change `url`.
  2. Add the domain to `ACC_HOSTS` in `app4p_account.js` and to Firebase's authorised domains.
  3. Set up the domain in Pages.
- `robots.txt` only takes effect at a domain root. On github.io it has to be the user site, so until then submit the sitemap in Search Console by hand.

## Pipeline changes
- **`autosync/run.py`:**
  - `build()` copies `public/` into `_site/` (plus `pbp/`, `stats/`, `build.json`).
  - `smoke()` passes the directory.
  - `fingerprint()` now includes `prerender.js`.
- **`autosync/smoke.js`:**
  - It serves the directory like GitHub Pages: base path, directory index, a 301 redirect to the trailing slash, and the `404.html` fallback.
  - It checks that `404.html`, `sitemap.xml` (at least 1,000 URLs), `robots.txt` and `og.png` exist, and that Home has canonical and og tags.
  - It checks that at least 1,000 player files exist, and that a player page opened at its own address carries the name in its title and draws the same route.
  - Then come the old checks, with navigation through `HS.go`.
- **`.gitignore`:** `/public/`.

## Checks done before delivery
- `run.build()` and `run.smoke()` from `run.py` itself: 11,139 files; page check passed, including two box scores.
- Navigation test:
  - a link click without a reload, Back, a legacy `#/` link, the 404 fallback on `p/<pid>/stats/`, a row `onclick`, Lineups filling, play-by-play loading, search, no broken images;
  - 25 direct loads plus 152 in-app moves over the sitemap with 0 script errors; Advanced tab BPM/PER/WS after the ratings file arrives.
- All titles, descriptions and JSON-LD parsed. No "not found" titles. One duplicate description.

## Next steps, not done
- Move `boxes` (1.1 MB gzipped) out of the first load as well. `BOX_BY_PID` and the Home records are built at boot from it, so this needs those views to wait for it.
- Per-player preview images (portrait + headline numbers) instead of the single `og.png`.
- Search Console: verify the property, submit `sitemap.xml`.
