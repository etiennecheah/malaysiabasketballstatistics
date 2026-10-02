/* =========================================================================
   Formulas — the site-level reference for every number on the site.

   The page exists because an abbreviation in a table header is not a
   definition, and a tooltip is gone the moment the cursor moves. Two rules
   shape it.

   1. Every entry says where the number comes from. Most of the advanced
      figures on this site are the source's own published columns, not
      arithmetic done here, and a reader deciding whether to trust a number
      needs to know which. So every row carries one of three provenance
      marks and the page opens by explaining them.
   2. A formula is written in the site's own field names, so a reader can
      check it against the detailed-statistics tab rather than against a
      textbook. Where the source does not publish its method, the entry says
      so instead of guessing at one.
   ========================================================================= */

const FX_SRC = {
  src: ['Published', 'Taken from the MABA / Genius Sports portal exactly as it publishes it. The site does not recompute these.'],
  calc: ['Computed here', 'Derived on this site from published counting totals. The formula is exactly what the code runs.'],
  model: ['Model', 'An estimate produced by a model, not an observation. It carries uncertainty and the site shows it.'],
};
const fxMark = k => `<span class="fx-mark fx-${k}" data-imtip="${esc(FX_SRC[k][1])}">${FX_SRC[k][0]}</span>`;

/* [abbreviation, full name, provenance, formula, note]
   A formula starting with '§' is a definition in words rather than arithmetic —
   it renders as prose. Setting "points per 100 possessions above an average
   player" in a monospace box would dress a sentence up as something checkable. */
const FX_SECTIONS = [
  ['counting', 'The box score', 'Everything else on the site is built out of these. The source publishes them per game; a competition row is their sum.', [
    ['G', 'Games played', 'src', '', 'A game counts once the player appears in its box score, whatever the minutes.'],
    ['GS', 'Games started', 'src', '', 'Appearances in the starting five.'],
    ['MIN', 'Minutes played', 'src', '', 'Published as mm:ss per game and summed to a decimal total here.'],
    ['PTS', 'Points', 'src', 'PTS = 2×2PM + 3×3PM + FTM', 'Checked: the identity holds on all 51,543 box-score lines in the database.'],
    ['FGM / FGA', 'Field goals made / attempted', 'src', 'FGA = 2PA + 3PA', 'Every shot from the floor. Free throws are not field goals.'],
    ['2PM / 2PA', 'Two-point field goals', 'src', '', ''],
    ['3PM / 3PA', 'Three-point field goals', 'src', '', ''],
    ['FTM / FTA', 'Free throws', 'src', '', ''],
    ['OREB', 'Offensive rebounds', 'src', '', 'Rebounds of the player’s own team’s miss.'],
    ['DREB', 'Defensive rebounds', 'src', '', ''],
    ['REB', 'Total rebounds', 'src', 'REB = OREB + DREB', ''],
    ['AST', 'Assists', 'src', '', ''],
    ['TOV', 'Turnovers', 'src', '', ''],
    ['STL', 'Steals', 'src', '', ''],
    ['BLK', 'Blocks', 'src', '', 'Shots this player blocked.'],
    ['BLKR', 'Times blocked', 'src', '', 'The mirror of BLK: this player’s own shots that were blocked.'],
    ['PF', 'Personal fouls', 'src', '', ''],
    ['FLS ON', 'Fouls drawn', 'src', '', 'Fouls committed against this player.'],
    ['+/−', 'Plus / minus', 'src', '+/− = team points scored − conceded, while he was on the floor', 'Measured, not estimated — the source publishes it on every line. It describes the five players on court together, not this one alone.'],
  ]],

  ['pergame', 'Per game', 'A per-game figure is only meaningful inside one tier, because a tier is one standard of opposition.', [
    ['PPG', 'Points per game', 'calc', 'PPG = PTS ÷ G', ''],
    ['RPG', 'Rebounds per game', 'calc', 'RPG = REB ÷ G', ''],
    ['APG', 'Assists per game', 'calc', 'APG = AST ÷ G', ''],
    ['MPG', 'Minutes per game', 'calc', 'MPG = MIN ÷ G', ''],
  ]],

  ['shooting', 'Shooting', 'Each of these answers a different question, and they disagree on purpose.', [
    ['FG%', 'Field goal percentage', 'calc', 'FG% = FGM ÷ FGA × 100', 'Treats a three and a layup as the same event, which is why it flatters players who never shoot threes.'],
    ['2P%', 'Two-point percentage', 'calc', '2P% = 2PM ÷ 2PA × 100', ''],
    ['3P%', 'Three-point percentage', 'calc', '3P% = 3PM ÷ 3PA × 100', ''],
    ['FT%', 'Free throw percentage', 'calc', 'FT% = FTM ÷ FTA × 100', ''],
    ['eFG%', 'Effective field goal percentage', 'calc', 'eFG% = (FGM + 0.5 × 3PM) ÷ FGA × 100', 'FG% with a made three counted one and a half times a made two, because it is worth one and a half times as much. Ignores free throws.'],
    ['TSA', 'True shooting attempts', 'src', 'TSA = FGA + 0.44 × FTA', 'A count of scoring chances that charges trips to the line at the rate they end a possession. Checked against all 9,914 published rows: it matches exactly.'],
    ['TS%', 'True shooting percentage', 'src', 'TS% = PTS ÷ (2 × TSA) × 100', 'The one shooting number that counts twos, threes and free throws together. Recomputing it from the published TSA reproduces the published TS% to within 0.2 for a typical row; the gap only opens on players with a handful of attempts, where the portal’s rounding of TSA to one decimal dominates.'],
  ]],

  ['rates', 'Rate statistics', 'These divide by opportunity rather than by games, so a substitute and a starter can be compared. All three are the portal’s own columns — it does not publish the exact on-floor denominators it used, so the site shows them rather than recomputing them.', [
    ['OR%', 'Offensive rebound percentage', 'src', '§ the share of available offensive rebounds he took while on the floor', 'Available means his team’s misses that were rebounded by anyone while he was playing.'],
    ['DR%', 'Defensive rebound percentage', 'src', '§ the share of available defensive rebounds he took while on the floor', ''],
    ['TO%', 'Turnover percentage', 'src', '§ turnovers as a share of the possessions he used', 'A high TO% on a low-usage player is a different problem from the same number on a lead guard.'],
    ['A/TO', 'Assist-to-turnover ratio', 'calc', 'A/TO = AST ÷ TOV', 'Undefined when a player has no turnovers; the site shows a dash rather than infinity.'],
  ]],

  ['ratings', 'One-number ratings', 'Three different attempts to put a box-score line on a single scale. None of them adjusts for opposition, minutes or pace.', [
    ['EFF', 'Efficiency', 'src', 'EFF = (PTS + REB + AST + STL + BLK) − (FGA − FGM) − (FTA − FTM) − TOV', 'The portal’s own rating, and the one this formula reproduces exactly on 99.7% of box-score lines. It credits everything positive at face value, so it rewards volume: 30 minutes of average play outscores 12 minutes of good play.'],
    ['PIR', 'Performance index rating', 'src', 'PIR = (PTS + REB + AST + STL + BLK + FLS ON)\n      − (FGA − FGM) − (FTA − FTM) − TOV − BLKR − PF', 'FIBA’s valuation. Stricter than EFF — it also charges for fouling and for being blocked, and credits fouls drawn. That formula reproduces the published column exactly on 79% of season rows and within three points on almost all the rest, so the portal’s variant differs a little in what it charges; the published figure is what is shown.'],
    ['GmSc', 'Game score', 'src', 'GmSc = PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA − FTM)\n     + 0.7×OREB + 0.3×DREB + STL + 0.7×AST\n     + 0.7×BLK − 0.4×PF − TOV', 'Hollinger’s summary, weighted towards efficiency rather than volume — roughly calibrated so a 10 is an average starter’s night. <strong>Published as a season total here, not a per-game figure.</strong> The formula reproduces it within half a point on 94% of rows.'],
  ]],

  ['poss', 'Possessions and context', 'A possession is not counted by the source, so it is estimated. Everything per-100 on this site rests on this one estimate.', [
    ['POSS', 'Team possessions', 'calc', 'half(A) = FGA + 0.4×FTA − 1.07 × ORB/(ORB+opp DRB) × (FGA − FGM) + TOV\nPOSS = 0.5 × (half(team) + half(opponent))', 'Computed per game and summed — never from season totals. The offensive-rebound share inside it is a per-game quantity, and taking it on totals drifts by about 1.4 possessions a season.'],
    ['PACE', 'Pace', 'calc', 'PACE = POSS ÷ team minutes × 40', 'Possessions per 40 minutes. Two competitions with the same scoring can be playing entirely different games.'],
    ['LgORtg', 'League offensive rating', 'calc', 'LgORtg = all points ÷ all possessions × 100', 'What “average” means in one competition. It is not the same in any two.'],
    ['Pts/TSA', 'Points per true-shot attempt', 'calc', 'Pts/TSA = league points ÷ league TSA', 'The scoring-context baseline BPM is measured against.'],
  ]],

  ['bref', 'PER, usage and Win Shares', 'Basketball-Reference’s formulas, run one competition at a time — the league each figure is measured against is the competition it was earned in, never a blend. PER and usage are fixed formulas on the box score; Win Shares are built on Dean Oliver’s ratings and are a model. All of them are on the Advanced tab.', [
    ['PER', 'Player efficiency rating', 'calc', 'uPER = (1 ÷ MIN) × [ 3PM + ⅔×AST + (2 − factor × tmAST/tmFGM) × FGM\n    + FTM × ½ × (1 + (1 − tmAST/tmFGM) + ⅔ × tmAST/tmFGM)\n    − VOP×TOV − VOP×DRB%×(FGA − FGM) − VOP×0.44×(0.44 + 0.56×DRB%)×(FTA − FTM)\n    + VOP×(1 − DRB%)×DREB + VOP×DRB%×OREB + VOP×STL + VOP×DRB%×BLK\n    − PF × (lgFTM/lgPF − 0.44 × lgFTA/lgPF × VOP) ]\nfactor = ⅔ − (½ × lgAST/lgFGM) ÷ (2 × lgFGM/lgFTM)\nVOP = lgPTS ÷ (lgFGA − lgOREB + lgTOV + 0.44 × lgFTA)\nDRB% = lgDREB ÷ lgREB\nPER = uPER × (lgPACE ÷ tmPACE) × 15 ÷ lg average', 'Hollinger’s rating, from basketball-reference.com/about/per.html. Scaled per competition so its minute-weighted average is exactly 15. Across 8,907 rated player-competitions it correlates 0.91 with BPM — two independent formulas agreeing.'],
    ['USG%', 'Usage percentage', 'calc', 'USG% = 100 × (FGA + 0.44×FTA + TOV) × (tmMIN ÷ 5)\n       ÷ (MIN × (tmFGA + 0.44×tmFTA + tmTOV))', 'The share of his team’s possessions a player finished with a shot, a trip to the line or a turnover while he was on the floor. Five players split a team’s possessions, so an even share is 20; the median rated player here uses 19.0.'],
    ['ORtg', 'Offensive rating', 'model', '§ points produced ÷ possessions used × 100', 'Dean Oliver (basketball-reference.com/about/ratings.html). Credits a made shot partly to the passer when it was assisted, adds free throws and a share of offensive rebounds, and charges misses and turnovers. The apportioning is estimated, which is why it is marked as a model.'],
    ['DRtg', 'Defensive rating', 'model', 'DRtg = tmDRtg + 0.2 × (100 × opp. points per scoring possession × (1 − Stop%) − tmDRtg)', 'Oliver again: the team’s defensive rating, moved one-fifth of the way towards what the player’s own stops — steals, blocks, defensive rebounds and his share of forced misses and turnovers — imply. Lower is better.'],
    ['OWS', 'Offensive win shares', 'model', 'marginal offence = points produced − 0.92 × lgPTS/POSS × possessions used\npoints per win = 0.32 × lg points per game × tmPACE ÷ lgPACE\nOWS = marginal offence ÷ points per win', 'From basketball-reference.com/about/ws.html, priced in this competition’s own scoring and pace.'],
    ['DWS', 'Defensive win shares', 'model', 'marginal defence = (MIN ÷ tmMIN) × tm possessions × (1.08 × lgPTS/POSS − DRtg ÷ 100)\nDWS = marginal defence ÷ points per win', ''],
    ['WS', 'Win shares', 'model', 'WS = OWS + DWS', 'Built to add up to wins, so it can be checked: across 722 team-seasons, team Win Shares come to 97.6% of the wins actually recorded and correlate 0.83 with them. It is accurate in close leagues (MBL: within 12% of games played) and overshoots in blowout tournaments, because point margin is converted to wins in a straight line. Those competitions are flagged on the Advanced tab.'],
    ['WS/40', 'Win shares per 40 minutes', 'model', 'WS/40 = WS ÷ MIN × 40', 'Basketball-Reference’s WS/48 rescaled to a 40-minute FIBA game. The average player posts .100 — and the minute-weighted average across this database is exactly .100, as the construction requires.'],
  ]],

  ['impact', 'Estimated impact', 'The only tab on this site whose numbers are not observations. Read them as brackets, not positions — the full method is on any player’s Advanced tab.', [
    ['BPM', 'Box plus/minus', 'model', '§ points per 100 possessions above an average player in the same competition', 'BPM 2.0 (Daniel Myers). Box-score terms are weighted by the player’s estimated position, the shot terms by his offensive role, and every team’s players are then shifted by one constant so that Σ(BPM × minute share) × 5 equals the team’s schedule-adjusted rating.'],
    ['OBPM', 'Offensive box plus/minus', 'model', '', 'The offensive half of the same model.'],
    ['DBPM', 'Defensive box plus/minus', 'model', 'DBPM = BPM − OBPM', 'A residual. It carries everything the offensive half does not explain, which is why it is the softer of the two.'],
    ['VORP', 'Value over replacement player', 'model', 'VORP = (BPM + 2.0) × share of team minutes played', 'Turns the rate into a volume. −2.0 is the replacement level: what a freely available player is assumed to give.'],
    ['PTS ADDED', 'Points added', 'model', 'PTS ADDED = BPM × POSS ÷ 100', 'The same estimate in the unit the game is scored in: points over an average player, across every possession he was on the floor for.'],
    ['80% interval', 'Bootstrap interval', 'model', '§ the middle 80% of 600 resamples of the player’s own games', 'Eight in ten resamples of his season land inside it. The median interval here is 8.6 BPM points wide against a full spread of about −20 to +20, which is why the site never reports a bare rank.'],
    ['Rank band', 'Overlapping rank', 'model', '§ every player whose own 80% interval overlaps this one', 'Reported as “27th of 61, but overlaps 11th to 56th”. A seven-game tournament cannot tell sixth from third.'],
  ]],

  ['pctl', 'Percentiles and ranking', 'Used by the Impact tab, the radar and the per-season BPM ranking.', [
    ['Percentile', 'Mid-rank percentile', 'calc', 'pct = (players below + players tied ÷ 2) ÷ pool × 100', 'Ties share the middle of the range they occupy. Without that, a tier where 41% of players have no blocks would hand every one of them the 0th percentile.'],
    ['Qualified', 'Qualification threshold', 'calc', 'qmin = max(2, ⌈0.4 × games in the longest schedule⌉)', 'Below it a player is drawn on the chart but left out of the pool the percentile is measured against. Shooting percentages additionally need 15 field-goal (or 10 three-point / free-throw) attempts.'],
    ['Rated', 'BPM qualification', 'model', '§ the same games threshold, and at least 40 possessions', 'A rating below that is noise, not a small rating.'],
  ]],

  ['standings', 'Standings', '', [
    ['W / L', 'Wins and losses', 'src', '', ''],
    ['%Won', 'Win percentage', 'src', '%Won = W ÷ (W + L) × 100', ''],
    ['For / Agst', 'Points scored and conceded', 'src', '', ''],
    ['Diff', 'Point difference', 'src', 'Diff = For − Agst', ''],
    ['Pts', 'Standings points', 'src', '', 'The competition’s own table points — usually 2 for a win and 1 for a loss, but the site takes whatever the portal publishes.'],
  ]],
];

function renderFormulas() {
  const secs = FX_SECTIONS.map(([id, title, intro, rows]) => `
    <div class="card fx-sec" data-fxsec="${id}">
      <div class="card-head">${esc(title)}</div>
      ${intro ? `<div class="fx-intro">${intro}</div>` : ''}
      <div class="fx-list">
        ${rows.map(([ab, name, prov, formula, note]) => `
          <div class="fx" data-fxq="${esc((ab + ' ' + name + ' ' + note).toLowerCase())}">
            <div class="fx-head">
              <span class="fx-ab">${ab}</span>
              <span class="fx-name">${esc(name)}</span>
              ${fxMark(prov)}
            </div>
            ${formula ? (formula[0] === '§'
              ? `<div class="fx-def">${esc(formula.slice(1).trim())}</div>`
              : `<div class="fx-f">${esc(formula)}</div>`) : ''}
            ${note ? `<div class="fx-note">${note}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`).join('');

  return `<div class="page">
    <div class="fx-hero">
      <h1 class="fx-title">Every number on this site</h1>
      <p class="fx-lede">What each abbreviation means, the formula behind it, and — the part that
        usually goes unsaid — whether it was published by the source or worked out here. Hover any
        column header anywhere on the site for the short version; this is the long one.</p>
      <div class="fx-keys">
        ${Object.keys(FX_SRC).map(k => `<div class="fx-key">${fxMark(k)}<span>${esc(FX_SRC[k][1])}</span></div>`).join('')}
      </div>
    </div>

    <div class="fx-bar">
      <input class="fx-q" id="fx-q" placeholder="Find a statistic…" autocomplete="off"
             aria-label="Filter the list of statistics">
      <div class="fx-jumps">${FX_SECTIONS.map(([id, title]) =>
        `<button class="chip chip-sm" data-fxjump="${id}">${esc(title)}</button>`).join('')}</div>
    </div>
    <div class="fx-empty" id="fx-empty" hidden>Nothing matches that. Try an abbreviation — <b>eFG%</b>, <b>VORP</b>, <b>TO%</b>.</div>

    <div class="fx-note-tier">
      <b>One rule governs all of them.</b> A <em>tier</em> is a series paired with an age group — Major
      Basketball League, or D-League U23, or MABA/MATRIX 17 &amp; Below. Totals add up across tiers;
      every per-game figure, percentage and percentile belongs to exactly one, because averaging a
      U15 national championship with a senior league produces a number that describes neither.
    </div>

    ${secs}

    <div class="card">
      <div class="card-head">Where the data comes from</div>
      <div class="pad">
        <p class="bpm-p">Every published figure on this site is scraped from the MABA / Genius Sports
          results portal: ${COMPS.length} competitions, ${Object.keys(PERSONS).length.toLocaleString()} players,
          every box score the portal has published. Nothing is edited, and nothing is filled in where the
          source is silent — a missing figure shows as a dash rather than a zero.</p>
        <p class="bpm-p">Two things on the site are <strong>not</strong> from the portal. Estimated impact
          (BPM, VORP, points added) is a model, and it says so on its own tab, beside its own interval.
          And duplicate person records — the same player registered twice under different spellings — are
          merged by hand, which changes whose career a figure belongs to but never the figure itself.</p>
      </div>
    </div>
  </div>`;
}
