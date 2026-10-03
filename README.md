# HoopStatsMY

Malaysian basketball statistics: https://etiennecheah.github.io/malaysiabasketballstatistics/

This repository holds what the site is built from and the job that keeps it up to date.

| Path | What it is |
|---|---|
| `data/` | The database: fixtures, standings and leaders (`backbone.json`), season lines (`persons.json`), box scores (`boxscores.json`), raw play-by-play (`pbp_raw/`), logos, portraits and the hand-kept files (national caps, honours, merges, imports). |
| `assets/` | The site's scripts and stylesheet. |
| `build_*.py` | The build: `build_data` → `build_lineups` → `build_bpm` → `build_pbp` → `build_stats` → `build_site` produce one `index.html`, `pbp/<competition>.js` and, for the Stats pages (Lineups, Clutch), `stats/lu/<competition>.js` and `stats/cl/<competition>.js`. |
| `autosync/` | The automatic sync: reads the public MABA competition pages on Genius Sports, applies new results with checks, rebuilds and publishes. |
| `.github/workflows/sync.yml` | Runs it. |
| `data/news.json` | The News page. To add an item, edit this file on GitHub (pencil icon) and commit: copy an existing entry, change the date, type, player, team and text. The site rebuilds itself in about three minutes. A signing makes that team the player's newest team on his card and profile. |
| `inbox/` | Drop a `.tar.gz` / `.tar.xz` bundle here to change files in the repository; the workflow unpacks it and removes it. |

## How the site updates

The `sync` workflow starts every half hour and usually ends within seconds. When a game is close it stays on,
checks the competition's schedule page every 90 seconds from an hour after tip-off, and when the game turns final it

1. reads the box score, play-by-play, standings, leaders and the players' season lines,
2. checks them (box totals equal the scoreboard, the play-by-play reaches the final score, nothing disappears),
3. rebuilds the site and opens it in a browser to check it,
4. commits the data and publishes the site.

If any check fails nothing is committed or published and the run is marked failed.
`autosync/state.json` keeps what is still waited for (a late play-by-play, a failed check) and a short log.

The site is published by the workflow (Settings → Pages → Source: GitHub Actions); there is no `index.html` in the repository.
To rebuild and publish by hand: Actions → sync → Run workflow → tick "force".

Data source: the public competition pages MABA publishes through Genius Sports
(`hosted.dcd.shared.geniussports.com/maba`). The sync identifies itself, waits between requests and only
reads competitions that are being played.
