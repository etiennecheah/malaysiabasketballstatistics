# Scoring clips on player profiles (the Clips tab)

Added 26 Nov 2026, first game: Thailand 94-82 Malaysia (fiba-132590, FIBA Asia Cup 2029 Pre-Qualifiers). 35 clips,
one for every made two and three by Malaysia (78 of their 82 points; free throws are left out on purpose).

## What a visitor sees
A **Clips** tab on the profile of any player who has clips, after Shot map, with the number of clips beside it. It holds one
card per game, newest first: the result and the player's line (from the box score, linking to it), then a video player
with that game's baskets listed beside it in game order. Each row shows the shot (from FIBA's description: Three-pointer,
Layup, Driving layup, Floater, Fadeaway, Pull-up jumper, Hook shot, Jump shot, Under the basket), the quarter and clock,
tags (Fast break, Off a turnover, Second chance), +2 or +3, and the score right after, the player's team first. A click
plays it; "Play the next one" (on by default) runs through the game. On phones the list sits under the player.

## Where things are
- **Code (this repo):** `assets/app4l_profile2.js`, the section "Clips tab" at the end (PVC, PVC_HOME, pvcLoad, pvcTab,
  pvcPlay), and three lines in `renderPlayer`: `pvcLoad()` + the tab, the body (`tab === 'clips' ? pvcTab(pid, d)`),
  and the count in the tab bar. `assets/style.css`: the block "player profile: the Clips tab" at the end (`.pvc-*`).
- **Video and the clip list (not in this repo):** Cloudflare R2, bucket `hoopstats-clips` (APAC), served at
  `https://clips.hoopstats.my/` (custom domain on the hoopstats.my zone): `index.json` and `<mid>/<NNN>.mp4|.jpg`.
  Video is kept off GitHub Pages, which publishes at most 1 GB in all and about 100 GB of traffic a month; R2 has 10 GB
  free and no charge for traffic. A CORS rule on the bucket lets https://hoopstats.my, https://www.hoopstats.my and
  http://localhost:8431 (a local preview) read `index.json`; video and posters need none.

The index is fetched once, when the first profile is drawn in a browser (not in the prerender or page checks:
`navigator.webdriver`), and the page redraws when it arrives so the tab appears. If it cannot be read, nothing shows.

```
index.json = { games:   { <mid>: { cid, date, team: 'A'|'B' (FIBA side clipped), a, b (FIBA codes), sa, sb (final), src } },
               players: { <pid>: { <mid>: [ { f: '004', q, clk: '9:01', pts, shot, tags, sa, sb (score after), dur } ] } } }
```

## Adding a game
Nothing to do in this repo. The clips come from the HoopStatsMY Film Room on the owner's laptop: there,
`app/site_clips.py <session> <FIBA json or link> --team A|B --mid <site game id> --cid <comp> --date <YYYY-MM-DD>`
encodes the clips (720p, 30 fps, about 2.4 MB each), cuts the posters, adds the game to index.json and uploads all of
it to the bucket with Cloudflare's wrangler; the game is on the profiles when it finishes.

## Cleanup from the first attempt
The first packing put the clips in this repo under `assets/vendor/clips/` (split in six parts; parts 1 and 2 were
uploaded before the move to R2). The code no longer reads them: delete `assets/vendor/clips/` (and the uploaded
`update-scoring-clips-1-of-6` / `2-of-6` archives, if they sit in the repo as files) so the published site does not
carry them.
