# Shot map tab on player profiles (update-32, layout in update-33, 2026-10-16)

This builds on `claude/shot-map-prototype.md` (Khoo Wei Lin) and `claude/fast-pages-seo.md`.

**The bundles are cumulative:**
- update-33 contains everything in update-32, which contains everything in update-31 (path URLs, prerendered pages).
- Upload update-33 on its own, plus update-30 (data) if it isn't in yet.
- **Latest:** update-44 (compare shot terrain, photo crops) contains updates 37–43. Upload it on its own.

## Layout (update-33, after the user approved the mockup artifact "Shot Map Layout Mockup")
- **Two columns:** `.sm` is a grid with `1.12fr` / `minmax(300px, 1fr)`.
- **Left column (`.sm-left`):**
  - The view switch, the court (smaller than before), game chips, legend, view note and the three tiles.
  - It is `position: sticky; top: 132px`, below the 60 px site bar and the sticky profile tabs, so the map stays in view while the right column scrolls.
- **Right column (`aside.sm-explain`), the explanation box, top to bottom:**
  1. **Selected zone** panel (`#sm-zone`, `smZonePanel()`): FGM/FGA, FG%, versus average and the competition average. `smSetZone()` refreshes it in place when the court or a zone row is hovered.
  2. **What stands out:** left vs right side of the floor (shots more than 0.75 m off the middle), then the automatic notes.
  3. **Zones:** the list, most attempts first.
  4. **"How to read this map":** a closed `<details>` with the source, zone rules and terrain method.
- **Under 900 px:** one column, with the map first and the explanation box after it. The left column is not sticky there.
- **Gotcha:** the site has a global `.row` style. The hover box rows are therefore `.sm-tr`, because `.row` gave them borders and padding.

## What it does
- Every player with shots in a listed competition gets a **Shot map** tab: `/p/<pid>/shots/`.
  - Listed competitions: `data/shot_comps.json`, now Agong Cup 2026 men 50247 and women 50248.
- **The tab has three views:**
  - **3D terrain:** height = shot frequency; colour = his smoothed FG% minus the competition's FG% at the same spot.
  - **Zones:** nine zones, each with made/attempted and coloured against the competition average for that zone.
  - **Every shot:** made and missed.
- **On the court:**
  - **Hover box:** zone, distance from the rim, FGM/FGA, FG%, competition average, the difference, and shots within 1 m.
  - **Terrain picking:** the hover reads through the 3D surface (ray march).
- **Controls and numbers:**
  - Game chips filter by game, and a competition picker appears when a player has more than one competition.
  - Tiles show FG%, expected FG% and the difference.
  - Automatic notes: best and coldest zone (at least 4 attempts), left vs right threes, paint, mid-range, overall.
- **View memory:** the chosen view is kept per browser (`localStorage hs-shotmap-view`).

## Data flow
1. **`autosync/source.py shots(html)`** parses `#shotchart span.sc_img` on `/match/<mid>/shotchart`.
   - Output row: `[period, pid, team id, top%, left%, three 0/1, type, made]`.
   - Only titles containing 2pt/3pt are kept; turnovers and fouls are drawn there too.
2. **`autosync/sync.py sync_comp`**, for a competition in `st.shot_comps`:
   - `need_shots` = finished games with a box score and no `data/shots/<mid>.json`, at most `SHOTS_PER_RUN = 25` per run.
   - It is checked before the early return, so it also catches up on games played before.
   - An empty chart is stored only two days after tip-off, since the chart may still be filled in.
   - Found games go in `res['shots_found']`, and `changed` becomes true.
3. **`store.py`** keeps `shots_new` and `has_shots()`, and `save()` writes `data/shots/<mid>.json` as `{cid, s: rows}`.
4. **`run.py`:**
   - `BUILD` gains `build_shots.py` before `build_site.py`.
   - The commit message says "shot charts of N games".
   - When the build fails, the new shot files are removed, the same way as new play-by-play files.
5. **`build_shots.py`** writes, per competition:
   - `stats/sh/<cid>.js`: `SHOTS_PUT(cid, {Z, G, T, M, P, n, g})`.
   - `data/shots_index.json`: `{cid: {pid: attempts}}`, which is gitignored.
   - `build_site.py` embeds the index as `DB.shotIdx`.
   - Merges are applied through `palias`.
6. **`assets/app4u_shots.js`:**
   - `smHas(pid)` decides whether the tab appears. `renderPlayer` concatenates `['shots','Shot map']` onto `PV_TABS`.
   - `smTab(pid)` loads the competition's file with `ensureShots` (a script tag) and redraws once it arrives.
   - `shotsAfterRender()`, called from `afterRender()`, draws the canvas and wires the pointer.
7. **CSS:** the "Shot map" block at the end of `style.css` (`sm-` classes, `--sm-up` / `--sm-down`).
8. **Smoke:** `smoke.js` opens the tab for the player with the most shots and fails if the court or the zone rows don't draw.

## Geometry (the same rules in build_shots.py and app4u_shots.js)
- **Placing a shot:**
  - Left half of the chart: `d = left/100*28`, `x = 7.5 − top/100*15`.
  - Right half: rotated 180° first.
  - Then `y = d − 1.575`.
- **Zones:**
  - 3PT corner: `d ≤ 3.13`.
  - Top of the arc: `|x| ≤ 2.45`; wings are the rest.
  - Paint: `|x| ≤ 2.45` and `d ≤ 5.8`.
  - Mid-range: middle, left or right.

## 3D terrain and replay (update-42, 2026-10-16)
- **Files:**
  - `assets/app4w_shot3d.js` draws the "3D terrain" view.
  - `assets/vendor/three.r128.min.js` is three.js r128 (MIT). `build_site.py` copies it to `public/vendor/`.
- **Loading:** the file loads only the first time someone opens the terrain view.
  - While it loads, the stage says "Loading the 3D map…".
  - If WebGL is off or the file fails, the tab falls back to the 2D canvas terrain (`smDrawTerrain`, unchanged).
- **One renderer per visit.** Its canvas is moved into each render of the tab (`sm3dMount` from `shotsAfterRender`), so scope and view changes never open new GL contexts.
- **The surface** is the 2D terrain's own:
  - `smSurfaces`, 0.25 m tiles, `SM_STOPS` colours, 5% threshold;
  - height 1.6 m × (density/peak)^2.2;
  - flat-shaded tiles with seams;
  - court lines draped on it, and the floor with a 1 m grid.
- **The hoop** stands at its real height and can be hidden.
- **Camera:** drag, wheel/pinch, pan and double-click, plus four presets (Broadcast, Baseline, Sideline, Top), auto-rotate and a Height slider.
- **Hover:** a draped 1 m ring with a dashed stem. The hover box is shared with the 2D maps (`smHover`). On phones, a tap reads the spot.
- **Zones:** clicking a zone row flies the camera there.
- **Replay bar** (under the stage):
  - Play, Pause, Resume and Replay; a slider; an event strip; speeds 1×, 2×, 4× (default) and 8×.
  - Order (`sm3dOrder`): games by date and tip-off, then by period, then by shot-chart order within the period.
  - Each shot is a ball on an arc. A make drops through the rim and the net flexes; a miss clips the front of the rim and bounces away. The spot shows a red dot or a blue cross for about 1.6 s.
  - As shots land, these rebuild: the terrain, the badge FG, the three tiles and the selected-zone panel (`smLive`). The zone list, notes and event rows keep the whole view.
  - A scope change resets the replay. Leaving the tab pauses it, and coming back offers Resume.
  - With reduced motion, shots appear without flights.
- **Every shot** (`smDrawHoop`) now draws the basket at its real height over the shots:
  - post, arm, and see-through board with the shooter's square;
  - orange rim, net, and the rim's shadow on the floor.
- **Zones:** unchanged.
- **Checked locally (Khoo, 277 shots, SwiftShader WebGL):**
  - render, hover, rotate, presets, zone fly-to;
  - play, pause, leave and come back to Resume, slider, scope reset;
  - Every shot with the hoop, and the Zones round trip;
  - the no-WebGL fallback to 2D, dark theme, and 390 px with no sideways scroll;
  - the Report tab, with no errors.
- **Also fixed:** the Event select no longer pushes the page wider than a phone.

## Compare page: shot terrain head to head (update-44, 2026-10-17)
- **Source:** the mockup "Shot Terrain Head to Head", after the NBA Index compare page.
- **File:** `assets/app4x_cmpshots.js`.
  - `cmpShotCard(A, B, fieldCids, label)` is called from `renderCompare()` (`app4e_compare.js`) in both branches: shared competition, and no shared competition.
  - `cmpShotsAfterRender()` is called from `afterRender()`.
  - The card is shown only when both players have shot charts (`smHas`).
- **Scopes:**
  - The page's own competition (or season), which follows the Competition and Season chips.
  - "Every event both played".
  - "Career".
  - A chip shows only when both players have shots in it.
- **Overlay | Dual** (remembered in `localStorage hs-cmpshot-mode`):
  - Overlay draws both surfaces on one court.
  - Dual draws two courts with one shared camera, and the pointer marks the same spot on both.
  - The four camera presets (Broadcast, Baseline, Sideline, Top) are shared, and zone chips fly the camera.
  - A readout under the courts shows FGM, FGA, FG%, share and vs avg per player for the zone, and a zone table follows.
- **Height:** share of his own shots (density / attempts), on one scale for both: 1.8 m × (share/max)^1.5.
- **Colour:** blue for the left player and orange for the right. Each colour has a five-step lightness ramp by his FG% minus the average from that spot in the same event (`smLeagueSurf`).
- **Rendering:** two WebGL renderers (`CS.R1`, `CS.R2`) for the whole visit, with their canvases moved into each render. Three scenes: `OV` (both), `DA`, `DB`.
  - In Dual, canvas 1 shows `DA` and canvas 2 shows `DB`.
  - On narrow courts the camera stands further back (`csApply`).
- **three.js loading** (`app4w_shot3d.js`): `sm3dEnsure()` now only loads the library. The shot tab creates its renderer lazily in `sm3dMount()`. After the load, the page reroutes on `/shots` (terrain view) or `/compare/`.
- **Data loading:** `smLoad` in `app4u_shots.js` also reroutes on `/compare/`, so the players' `shp` files and the events' `sh` files fill the card when they arrive.

## Photo crops (update-44)
- The small face circles (`.avatar-img`, `.cmp-pick-face`, `.cmp-res-face`, `.cmp-sugg-face`) cropped the 296×340 cut-outs with `width/height 250%; left -75%; top -10%`. That showed only y ≈ 34–152, so the top of the head and the chin were cut off.
- **New CSS crop:** `width:135%; height:auto; left:50%; top:4%; transform:translateX(-50%)` gives the whole head, centred. It was checked on all 61 portraits: head centre x 143–155, top 0–3.
- **The Compare pick boxes and search results** now prefer the square head crop made at build time (`DB.avatars`, `img.sq`, like `avatar()` in app1_core.js). The CSS crop is the fallback.
- **Also fixed:** the Shot map tab's season switch (`.sm-seg`) pushed phones sideways for players with 5+ seasons. It now scrolls inside itself.

## Fix (update-43, 2026-10-16): "player 0"
- Some shot charts credit shots to a player "0" (team shots).
- `build_shots.py` put him in the index as the first id. The page check then tried his Shot map tab and failed: "Shot map tab for player 0 did not draw". From 18:57 that blocked every catch-up batch holding such a game.
- **Fix:**
  - `build_shots.py` keeps only ids the site lists as persons, after aliasing.
  - `smoke.js` picks the first indexed player who is a listed person.

## Open items from the skills review (2026-10-16)
- The user saved the **find-skills** skill.
- **Recommended skills:** vercel-labs web-design-guidelines and addyosmani accessibility. Optional: wshobson interaction-design.
- **Colour scale:** the heat map scale fails the dataviz validator (protan ΔE 3.8 between pink and grey; the two blues ΔE 8.3). Rebuild it as a diverging ramp that changes lightness, and put point values on the legend.
- **Small samples:** a player with few shots gets the same smoothing as one with many. The smoothing should adapt and show how sure it is.
- **3D view:** the peaks hide what's behind them.
- **Accessibility:** add a table/keyboard path for the court.
- **Mobile:** the Shot map tab is off-screen in the tab bar on phones.

## Status
- The update-32 bundle carries the shots of two men's games (2938169, 2938170). The sync catches up on the rest on GitHub, at most 25 games per run.
- **Tested locally:**
  - A simulated sync run.
  - `run.build()` and `run.smoke()`.
  - The tab: tab list, direct load, hover box, zones view, no tab for a player without shots, the new layout at 1360 px and 390 px.
- **To add a competition:** put its cid in `data/shot_comps.json`.
