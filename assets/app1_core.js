/* =========================================================================
   HOOPSTATS MY — Malaysia Basketball Database
   Multi-competition statistics site. Every figure below is scraped from the
   MABA / Genius Sports competition portal
   (hosted.dcd.shared.geniussports.com/maba) — 72 competitions, their teams,
   standings, fixtures, results, leaders boards, rosters and per-player
   statistics. Nothing is estimated: where the source publishes no value, the
   UI shows "—" and says so. Where the source publishes a column that is empty
   for every player (AS%, BLK%, REB%, ST%, Poss), that column is omitted
   rather than shown as a fabricated zero.

   Players are identified by the source's own global person id, so a player
   who appears in several competitions is one person here, with a career
   record spanning all of them.
   ========================================================================= */

/* ---------------------------- indexes ---------------------------- */
const COMPS = DB.comps;
const TEAMS = DB.teams;
const PERSONS = DB.persons;
// person id -> data URI portrait, embedded at build time from data/photos/<pid>.*
const PHOTOS = DB.photos || {};
const COMPLOGOS = DB.complogos || {};
/* ids the source published twice for one player, folded onto the survivor */
const PALIAS = DB.palias || {};
// Box scores ship as {t:[team names], p:[schema-ordered arrays]}; hydrate lazily,
// because most sessions only ever open a handful of the ~2,000 games.
const BOX_RAW = DB.boxes || {};
const BKEYS = DB.bkeys || [];
const BOX_CACHE = {};
const BOXES = {
  hasOwnProperty: mid => Object.prototype.hasOwnProperty.call(BOX_RAW, mid),
};
function getBox(mid) {
  if (BOX_CACHE[mid]) return BOX_CACHE[mid];
  const raw = BOX_RAW[mid];
  if (!raw) return null;
  const out = { p: raw.p.map(row => {
    const o = {};
    for (let i = 0; i < BKEYS.length && i < row.length; i++) {
      const v = row[i];
      if (v !== null && v !== undefined && v !== '') o[BKEYS[i]] = v;
    }
    o.team = (o.ti !== undefined && o.ti >= 0) ? raw.t[o.ti] : '';
    return o;
  }) };
  BOX_CACHE[mid] = out;
  return out;
}

const COMP_BY_ID = {};
COMPS.forEach(c => { COMP_BY_ID[c.id] = c; });

// Player stat lines ship as schema-ordered arrays (DB.pkeys) to keep the payload
// small; hydrate them into objects once at load. A missing value stays missing —
// it is never turned into a zero.
const PKEYS = DB.pkeys;
function hydrateLine(row) {
  const o = {};
  for (let i = 0; i < PKEYS.length && i < row.length; i++) {
    const v = row[i];
    if (v !== null && v !== undefined && v !== '') o[PKEYS[i]] = v;
  }
  return o;
}
COMPS.forEach(c => {
  c.players = c.players.map(hydrateLine);
  // regular season / playoffs, where the playoff games are known (built from box scores)
  if (c.split) { c.split.rs = c.split.rs.map(hydrateLine); c.split.po = c.split.po.map(hydrateLine); }
});
/* Season phase for a competition with known playoffs: 'rs' (regular season, the
   default), 'po' (playoffs) or 'all' (the published season line). Shared by the
   Players and Leaders pages. */
const PHASE = {};
const PHASES = [['rs', 'Regular season'], ['po', 'Playoffs'], ['all', 'All games']];
function phaseOf(c) { return c.split ? (PHASE[c.id] || 'rs') : 'all'; }
function phaseLines(c, ph) { return c.split && ph !== 'all' ? c.split[ph] : c.players; }
function phaseSeg(c) {
  if (!c.split) return '';
  const ph = phaseOf(c);
  return `<span class="seg phase-seg">${PHASES.map(([k, l]) => `<button class="seg-btn ${ph === k ? 'seg-on' : ''}" data-phase="${k}" data-phasecid="${c.id}">${l}</button>`).join('')}</span>`;
}
// "Semi-final 1 · Game 2" for a playoff game, '' otherwise
function phaseLabel(c, mid) {
  const p = c && c.phase && c.phase[mid];
  if (!p) return '';
  return p.r + (p.r === 'Semi-final' ? ' ' + p.n : '') + ' · Game ' + p.g;
}

// person id -> [{c: competition, p: that competition's stat line}]
const CAREER = {};
// person id -> {cid: {tid, num, pos, ht, wt, dob, age, nat}}
const BIO = {};
COMPS.forEach(c => {
  c.players.forEach(p => {
    (CAREER[p.pid] = CAREER[p.pid] || []).push({ c: c, p: p });
  });
  Object.entries(c.roster || {}).forEach(([tid, rows]) => {
    rows.forEach(r => {
      if (!r.pid) return;
      (BIO[r.pid] = BIO[r.pid] || {})[c.id] = Object.assign({ tid: tid }, r);
      if (!CAREER[r.pid]) CAREER[r.pid] = [];
      if (!CAREER[r.pid].some(x => x.c.id === c.id)) CAREER[r.pid].push({ c: c, p: { pid: r.pid } });
    });
  });
});
const GAME_BY_MID = {};
COMPS.forEach(c => { c.games.forEach(g => { g.cid = c.id; GAME_BY_MID[g.mid] = g; }); });

// person id -> [match ids they have a box score line in. Built straight off the
// compact arrays (pid is column 0) so no box score needs hydrating to index it.
const BOX_BY_PID = {};
Object.keys(BOX_RAW).forEach(mid => {
  BOX_RAW[mid].p.forEach(row => {
    const pid = row[0];
    if (pid) (BOX_BY_PID[pid] = BOX_BY_PID[pid] || []).push(mid);
  });
});

// team name -> team id (names are unique enough in this source to key on)
const TID_BY_NAME = {};
Object.entries(TEAMS).forEach(([tid, n]) => { if (!(n in TID_BY_NAME)) TID_BY_NAME[n] = tid; });
// team id -> [competition ids]
const TEAM_COMPS = {};
COMPS.forEach(c => c.teams.forEach(t => { (TEAM_COMPS[t] = TEAM_COMPS[t] || []).push(c.id); }));

/* ---------------------------- helpers ---------------------------- */
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const has = v => v !== null && v !== undefined && v !== '';

/* ---- column glossary ---------------------------------------------------
   Every table on this site is a wall of three-letter abbreviations. The
   glossary is keyed on the label as rendered, so one entry serves every
   table that shows that column, and a header carries it as both a hover
   tooltip (the shared data-imtip layer) and an aria-label, so the full name
   reaches a screen reader instead of "PIR". */
const STAT_GLOSS = {
  // identity / context
  'Tier': 'Competition tier — a series paired with an age group. Figures are never averaged across tiers.',
  'Comps': 'Competitions the player entered inside this tier',
  'G': 'Games played',
  'GP': 'Games played',
  'MIN': 'Minutes played, total',
  'Mins': 'Minutes played, total',
  'MPG': 'Minutes per game',
  // counting
  'PTS': 'Points',
  'REB': 'Total rebounds — offensive plus defensive',
  'ORB': 'Offensive rebounds',
  'DRB': 'Defensive rebounds',
  'OR': 'Offensive rebounds',
  'DR': 'Defensive rebounds',
  'AST': 'Assists',
  'STL': 'Steals',
  'BLK': 'Blocks',
  'TOV': 'Turnovers',
  'PF': 'Personal fouls',
  // shooting
  'FG': 'Field goals made and attempted',
  '3P': 'Three-point field goals made and attempted',
  'FT': 'Free throws made and attempted',
  'FG%': 'Field goal percentage — all shots from the floor',
  '2P%': 'Two-point field goal percentage',
  '3P%': 'Three-point field goal percentage',
  'FT%': 'Free throw percentage',
  'eFG%': 'Effective field goal percentage — field goal percentage adjusted so a made three counts one and a half times a made two',
  'TS%': 'True shooting percentage — scoring efficiency counting twos, threes and free throws together. Published by the source.',
  // advanced
  'OR%': 'Offensive rebound percentage — the share of available offensive rebounds the player took while on the floor. Published by the source.',
  'DR%': 'Defensive rebound percentage — the share of available defensive rebounds the player took while on the floor. Published by the source.',
  'TO%': 'Turnover percentage — turnovers as a share of the possessions the player used. Published by the source.',
  'A/TO': 'Assist-to-turnover ratio — assists divided by turnovers',
  '+/-': 'Plus/minus — the team\'s points scored minus points conceded while the player was on the floor',
  'EFF': 'Efficiency — (points + rebounds + assists + steals + blocks) minus missed shots, missed free throws and turnovers. The source\'s own published rating.',
  'PIR': 'Performance index rating — FIBA\'s index of success, which also charges for fouls committed and shots blocked against. The source\'s own published rating.',
  'GmSc': 'Game score — Hollinger\'s single-number summary of a box-score line, weighted towards scoring efficiency',
  // standings
  'W': 'Wins', 'L': 'Losses',
  '%Won': 'Percentage of games won',
  'For': 'Points scored', 'Agst': 'Points conceded',
  'Diff': 'Points scored minus points conceded',
  'Pts': 'Standings points',
  // roster
  'Pos': 'Position', 'Ht': 'Height in centimetres', 'Wt': 'Weight in kilograms',
  'Nat': 'Nationality', '#': 'Shirt number',
  'PPG': 'Points per game', 'RPG': 'Rebounds per game', 'APG': 'Assists per game',
  // estimated impact
  'BPM': 'Box plus/minus — an estimate of the points per 100 possessions this player added over an average player in the same competition. A model, not a published figure.',
  'OBPM': 'Offensive box plus/minus — the offensive half of BPM',
  'DBPM': 'Defensive box plus/minus — BPM minus OBPM, so it carries everything the offensive half does not explain',
  'VORP': 'Value over replacement player — (BPM + 2.0) × the share of his team\'s minutes he played. Turns a rate into a volume.',
  'PTS ADDED': 'Points added — BPM × possessions ÷ 100. Points this player added over an average one, across every possession he was on the floor for.',
  // computed ratings (Basketball-Reference formulas, one competition = one league)
  'PER': 'Player efficiency rating — Hollinger\'s per-minute box-score rating, adjusted for pace and scaled so the average player in this competition is exactly 15. Computed here from box scores.',
  'USG%': 'Usage percentage — the share of his team\'s possessions a player used (shot, drew free throws or turned it over) while on the floor. 20 is an even share. Computed here.',
  'ORtg': 'Offensive rating — Dean Oliver\'s points produced per 100 possessions used. Computed here.',
  'DRtg': 'Defensive rating — Dean Oliver\'s estimate of points allowed per 100 opponent possessions while on the floor. Lower is better. Computed here.',
  'OWS': 'Offensive win shares — wins produced by his offence: points produced above 0.92 × the league\'s points per possession, priced in this competition\'s points per win. A model.',
  'DWS': 'Defensive win shares — wins produced by his defence, from his defensive rating against 1.08 × the league\'s points per possession. A model.',
  'WS': 'Win shares — offensive plus defensive win shares: an estimate of the team wins this player accounts for. A model.',
  'On': 'Team net rating with him on the floor: points scored minus points allowed per 100 possessions, from lineups rebuilt out of the play-by-play.',
  'Off': 'Team net rating with him on the bench, in the same games — the rest of the team\'s possessions.',
  'On−Off': 'On minus Off: how much better (or worse) his team was per 100 possessions with him on the floor. Measured, not modelled — but it rates the lineups he played in, not him alone, and it is noisy.',
  'WS/40': 'Win shares per 40 minutes — Basketball-Reference\'s WS/48 rescaled to a FIBA game. League average is 0.100. A model.',
};
/* Attributes for a table header: the hover tooltip plus the spoken name. */
function gloss(label) {
  const g = STAT_GLOSS[label];
  return g ? ` data-imtip="${esc(g)}" aria-label="${esc(g)}"` : '';
}

function fmt1(v) { return has(v) && typeof v === 'number' ? v.toFixed(1) : (has(v) ? v : '—'); }
function fmt0(v) { return has(v) ? (typeof v === 'number' ? String(Math.round(v)) : v) : '—'; }
function pct1(v) { return has(v) ? Number(v).toFixed(1) : '—'; }
function fmtPM(v) { return has(v) ? (v > 0 ? '+' + v : String(v)) : '—'; }
function slugName(n) { return String(n || '').trim(); }

// Per-game value derived from a real total and a real games-played count.
function pg(total, g) {
  if (!has(total) || !has(g) || !g) return null;
  return total / g;
}
function ratio(made, att) {
  if (!has(made) || !has(att) || !att) return null;
  return made / att * 100;
}
function efgPct(p) {
  if (!has(p.fgm) || !has(p.fga) || !p.fga) return null;
  return (p.fgm + 0.5 * (p.tpm || 0)) / p.fga * 100;
}
function minsToNum(m) {
  if (!has(m)) return null;
  if (typeof m === 'number') return m;
  const x = String(m).match(/^(\d+):(\d{2})$/);
  return x ? (+x[1] + (+x[2]) / 60) : (parseFloat(m) || null);
}
function hasStats(p) { return has(p.g) || has(p.pts); }

function initials(n) {
  const parts = String(n || '').replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
// Deterministic colour for a team, derived from its name — the source's own
// crest images are on a host this page can't load, so teams get a coloured
// initials badge instead of invented artwork.
function teamColor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return 'oklch(52% 0.14 ' + h + ')';
}
/* Competition marks, most specific first.

   Two kinds sit in this list. A TOURNAMENT mark is the competition's own crest
   and says which competition this is; the two GOVERNING-BODY marks at the
   bottom — MABA and the Major Basketball League — say only who runs it, so
   they are the fallback and pick up nothing a tournament mark has already
   claimed. Anything still unmatched keeps its generated swatch, because
   putting a body's mark on a competition it doesn't run would be a claim this
   database cannot support.

   A mark whose artwork carries a year or an edition number on its face is
   pinned to that edition by `name` rather than matched on `series`: SUKMA XXII
   and the 2026 Li-Ning invitation each printed their own year, and the next
   edition would be wearing the wrong one. Marks with no date on them —
   MABA/MATRIX, SBL, DBC — match the whole series and carry forward. */
const COMP_MARKS = [
  ['fiba', { series: ['FIBA'] }],
  // the national U17 championship and the MATRIX Cup are separate competitions
  // with separate crests, though the source files both series under "MABA/MATRIX"
  ['u17',           { series: ['MABA/MATRIX 17 & Below'] }],
  ['maba-matrix',   { series: ['MABA/MATRIX Cup'] }],
  ['sbl',           { series: ['Selangor Basketball League'] }],
  ['dbc',           { series: ['Dream Ball Championship'] }],
  // the field itself is on the artwork (Japan, Malaysia and Chinese Taipei
  // flags under the title), so this one is pinned to the edition too
  ['selangor-intl', { name: /^2026 Selangor International Invitational/i }],
  ['lining-2026',   { name: /^Li-Ning\b.*\b2026\b/i }],
  ['sukma-xxii',    { name: /\bXXII\b.*\bSELANGOR\b/i }],
  // MABA keeps the Agong and Lum Mun Chak cups, plus its own international
  // invitation, which the series field files under the generic "Invitational"
  // with everyone else's
  ['maba', { series: ['Agong Cup', 'MILO Lum Mun Chak Cup'], name: /^MABA\b/i }],
  // the two invitationals the league itself ran, named rather than matched by
  // series: most "Invitational" competitions are not its
  // the D-League has its own mark (the artwork says U23; the league uses it for
  // the U20 division too). Listed ahead of the MBL mark, which stays its fallback.
  ['mbl-dleague', { series: ['Malaysia D-League'] }],
  ['mbl',  { series: ['Major Basketball League', 'Malaysia D-League'], name: /\b(W?MBL)\b/i }],
];
// Marks drawn mostly in white ink. The plate below is white, so these would be
// a blank square on it; they get a dark plate instead of being recoloured.
const COMP_MARK_DARK = { 'selangor-intl': 1 };
function compMark(c) {
  if (!c) return null;
  for (const [key, m] of COMP_MARKS) {
    if (!COMPLOGOS[key]) continue;
    if (m.series && m.series.indexOf(c.series) >= 0) return key;
    if (m.name && m.name.test(c.name || '')) return key;
  }
  return null;
}
/* The marks sit on a light plate: one is mostly white artwork, the other mostly
   navy, and a single plate is the only way both read on the same surface. */
function compCrest(c, size) {
  const key = compMark(c);
  const sz = size || 30;
  if (key) {
    const dark = COMP_MARK_DARK[key] ? ' comp-crest-dark' : '';
    return `<span class="comp-crest${dark}" style="width:${sz}px;height:${sz}px;"><img src="${COMPLOGOS[key]}" alt=""></span>`;
  }
  // no mark supplied: the series' initials, or the abbreviation it actually goes by
  const code = { 'Women\'s Basketball Alliance': 'WMBA' }[c.series] || teamCode(c.series);
  return `<span class="swatch crest" style="background-color:${teamColor(c.series)};width:${sz}px;height:${sz}px;font-size:${Math.round(sz * (code.length > 3 ? 0.25 : 0.3))}px;">${esc(code)}</span>`;
}

/* The same hash, at a fraction of the chroma: this colour is a tint washed
   across an obsidian panel, not a fill, and at full chroma it swamps it. */
function teamBloom(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return 'oklch(58% 0.11 ' + h + ')';
}
function teamCode(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map(p => p[0]).join('').slice(0, 3).toUpperCase();
}
// Club crests supplied as artwork, embedded at build time from data/logos/<slug>.*
// A club whose crest hasn't been supplied keeps the coloured initials badge.
const LOGOS = DB.logos || {};
// State flags, for the competitions that field states rather than clubs — the
// U17 and U15 nationals, the MATRIX and Agong Cups, SUKMA. Matching is on the
// whole name, so "Johor" gets the flag and "Johor Southern Tigers" does not:
// the club is not the state side.
const FLAGS = DB.flags || {};
const STATE_ALIAS = {
  'johor': 'johor', 'kedah': 'kedah', 'kelantan': 'kelantan',
  'kuala lumpur': 'kuala-lumpur', 'wp kuala lumpur': 'kuala-lumpur', 'w p kuala lumpur': 'kuala-lumpur',
  'labuan': 'labuan', 'wp labuan': 'labuan', 'melaka': 'melaka', 'malacca': 'melaka',
  'negeri sembilan': 'negeri-sembilan', 'pahang': 'pahang',
  'penang': 'penang', 'pulau pinang': 'penang', 'perak': 'perak', 'perlis': 'perlis',
  'putrajaya': 'putrajaya', 'wp putrajaya': 'putrajaya', 'sabah': 'sabah',
  'sarawak': 'sarawak', 'selangor': 'selangor', 'terengganu': 'terengganu',
  // the combined federal-territories side SUKMA fields
  'wilayah persekutuan': 'wilayah-persekutuan',
};
const STATE_NAME = {
  'johor': 'Johor', 'kedah': 'Kedah', 'kelantan': 'Kelantan', 'kuala-lumpur': 'Kuala Lumpur',
  'labuan': 'Labuan', 'melaka': 'Melaka', 'negeri-sembilan': 'Negeri Sembilan', 'pahang': 'Pahang',
  'penang': 'Penang', 'perak': 'Perak', 'perlis': 'Perlis', 'putrajaya': 'Putrajaya',
  'sabah': 'Sabah', 'sarawak': 'Sarawak', 'selangor': 'Selangor', 'terengganu': 'Terengganu',
  'wilayah-persekutuan': 'Wilayah Persekutuan',
};
/* "Melaka 2" and "MALACCA" are the same state; a squad number or a bracketed
   suffix is dropped, and only an exact state name matches. */
function stateSlug(name) {
  const s = String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return STATE_ALIAS[s] || null;
}
function stateFlag(name) { const k = stateSlug(name); return k && FLAGS[k] ? k : null; }
/* The national side, senior or youth, under any of the names the sources use
   ("Malaysia", "Malaysia National Team", "Malaysia U18 Selection", "National U18
   Selection Team"), wears the Malaysian flag. Clubs that merely carry the word
   (Harimau Malaysia, Westports Malaysia Dragons) do not match: the name has to
   be the country, optionally followed by an age group, a gender or "selection". */
const NAT_RE = /^(?:malaysia|national)(?:-(?:national|team|selection|men|women|boys|girls|senior|youth|u\d+|3x3))*$/;
function natFlag(name) {
  const k = String(name || '').replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return FLAGS.malaysia && k !== 'national' && NAT_RE.test(k) ? 'malaysia' : null;
}
// the flag a name wears, state or national
function flagOf(name) { return stateFlag(name) || natFlag(name); }
function teamSlug(name) {
  return String(name || '')
    .replace(/\([^)]*\)/g, ' ')        // drop the squad suffix: "… (RED)" is the same club
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
/* A club appears under several names across seven seasons — a squad suffix, a
   sponsor prefix, a junior side. The slug already drops bracketed suffixes; this
   table covers the rest, and it only ever maps a name onto the club that name
   plainly belongs to. "NS Matrix" and "NS Matrix Deers" are the same club, on
   the user's word. */
const TEAM_LOGO_ALIAS = {
  // squad letters, partnership names and state prefixes that share one crest
  'ns-matrix': 'ns-matrix-deers', 'ns-matrix-deers-b': 'ns-matrix-deers',
  'parkcity-heat-basketball-club': 'parkcity-heat', 'putrajaya-parkcity-heat': 'parkcity-heat',
  'sunrise-youngsters': 'penang-sunrise-youngsters',
  'penang-youngsters-bc': 'penang-sunrise-youngsters',
  'penang-youngsters-basketball-club': 'penang-sunrise-youngsters',
  'kee-ming-holdings-basketball-club': 'kee-ming-basketball-club',
  'tsun-jin-high-school': 'tsun-jin',
  'gostrong-b': 'gostrong',
  // one EST Jersey club, several partnerships and squad letters; the Rising Star
  // partnership has its own crest, under either of the names it entered as
  'est-jersey-x-valuevest': 'est-jersey', 'selangor-est-jersey': 'est-jersey',
  'est-rising-star': 'est-jersey-x-rising-star',
  'mbc-rising-stars': 'mbc-rising-star',
  // the honours list spells the 2019 guests without the final letters
  'westsport-malaysia-dragon': 'westports-malaysia-dragons',
  // the association's own selection sides wear the MABA mark (user decision,
  // 2026-10-02): Agong Cup 2022-25 and the D-League 2024 and 2026 entries
  'selection-team': 'maba', 'u18-selection-team': 'maba',
  'maba-selection-team': 'maba', 'maba-u18-selection': 'maba',
  'selangor-dreaminder': 'dreaminder',
  'kl-phoenix-a': 'kl-phoenix', 'kl-phoenix-b': 'kl-phoenix',
  // the 2026 Selangor league lists Hornbills by bare name; its standings code
  // (KLH) says it is the KL club
  'hornbills': 'kl-hornbills',
  'orca-basketball-team': 'orca',
};
// the MABA mark doubles as a crest for the selection sides above; it is the same
// artwork the competitions use, not a second copy in the payload
if (COMPLOGOS.maba && !LOGOS.maba) LOGOS.maba = COMPLOGOS.maba;
// the key of the crest a name resolves to, through the alias table and squad letters
function teamLogoKey(name) {
  const k = teamSlug(name);
  // a squad letter or number ("The Twelve Barbary Lions A") shares the club's crest
  const base = k.replace(/-(?:a|b|1|2)$/, '');
  return [k, TEAM_LOGO_ALIAS[k], base, TEAM_LOGO_ALIAS[base]].find(x => x && LOGOS[x]) || null;
}
function teamLogo(name) { const k = teamLogoKey(name); return k ? LOGOS[k] : null; }
// crests drawn in white ink: they get a dark plate so light-theme rows don't swallow them
const TEAM_LOGO_DARK = { 'singapore-adroit': 1, 'est-jersey-x-rising-star': 1 };
// and the reverse: crests drawn in black or navy ink get a white plate, so the dark
// theme doesn't swallow them. Neither is ever repainted.
const TEAM_LOGO_LIGHT = { 'xiamen-university': 1, 'mkyc-dragons': 1, 'ucsi-rising-star': 1, 'australia-wah-chin-kings': 1,
  maba: 1 };   // its net is drawn in black
function crestPlate(name) {
  const k = teamLogoKey(name);
  return TEAM_LOGO_DARK[k] ? ' crest-logo-dark' : TEAM_LOGO_LIGHT[k] ? ' crest-logo-light' : '';
}
function crest(name, size) {
  const sz = size || 26;
  const logo = teamLogo(name);
  if (logo) {
    return `<img class="crest-logo${crestPlate(name)}" src="${logo}" alt="" style="width:${sz}px;height:${sz}px;">`;
  }
  const flag = flagOf(name);
  if (flag) {
    // flags are 2:1; they sit letterboxed inside the same square every other
    // crest occupies, so a column of badges still lines up
    return `<span class="crest-flag" style="width:${sz}px;height:${sz}px;"><img src="${FLAGS[flag]}" alt=""></span>`;
  }
  return `<span class="swatch crest" style="background-color:${teamColor(name)};width:${sz}px;height:${sz}px;font-size:${Math.round(sz * 0.36)}px;">${esc(teamCode(name))}</span>`;
}

/* Competitions a player's team finished first in, by tier. The source publishes
   no awards at all, so a title here means exactly one thing: their team topped
   that competition's own published standings. */
let TITLES = null;
function titleIndex() {
  if (TITLES) return TITLES;
  TITLES = {};
  COMPS.forEach(c => {
    // the champion is decided by the final where there is one, not by the first
    // row of the standings (which, with several groups, is only Group A's leader)
    if (!c.champ) return;
    const champ = String(c.champ).trim().toLowerCase();
    c.players.forEach(p => {
      if (!p.team || String(p.team).trim().toLowerCase() !== champ) return;
      const k = tierKey(c);
      const byPlayer = TITLES[p.pid] || (TITLES[p.pid] = {});
      byPlayer[k] = (byPlayer[k] || 0) + 1;
    });
  });
  return TITLES;
}
function playerTitles(pid) {
  const t = titleIndex()[pid];
  if (!t) return [];
  return Object.keys(t).map(k => ({ key: k, n: t[k] }))
    .sort((a, b) => b.n - a.n || tierShort(a.key).localeCompare(tierShort(b.key)));
}

/* A player's face where the site has one, initials where it doesn't. */
function avatar(pid, name) {
  const n = name || personName(pid);
  // a square head crop cut at build time (avatars.py) fits every portrait the same way
  const av = (DB.avatars || {})[pid];
  if (av) return `<span class="avatar avatar-face"><img src="${av}" alt=""></span>`;
  return PHOTOS[pid]
    ? `<span class="avatar avatar-img"><img src="${PHOTOS[pid]}" alt=""></span>`
    : `<span class="avatar">${esc(initials(n))}</span>`;
}
/* The mark beside a team name in a list: the club's crest, the state's flag,
   or the deterministic colour chip the site falls back to. */
function teamMark(name) {
  const logo = teamLogo(name);
  if (logo) return `<img class="p-mark${crestPlate(name)}" src="${logo}" alt="">`;
  const flag = flagOf(name);
  if (flag) return `<img class="p-mark p-mark-flag" src="${FLAGS[flag]}" alt="">`;
  return `<span class="p-sw" style="background:${teamColor(name)};"></span>`;
}

function personName(pid) { return PERSONS[pid] || 'Unknown player'; }
function personLink(pid, label) {
  return `<a href="#/p/${pid}">${esc(label || personName(pid))}</a>`;
}
function teamLinkC(cid, name) {
  const tid = TID_BY_NAME[name];
  if (!tid) return esc(name || '—');
  return `<a href="#/c/${cid}/team/${tid}" class="team-link">${esc(name)}</a>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return M[m - 1] + ' ' + d + ', ' + y;
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return M[m - 1] + ' ' + d;
}
function compRange(c) {
  if (!c.start) return '—';
  return c.start === c.end ? fmtDate(c.start) : fmtDate(c.start) + ' – ' + fmtDate(c.end);
}
/* A fixture still to be played. A not-played fixture — a placeholder whose teams
   were never decided, or a game the source left unfinished for years — is not. */
function isUpcoming(g) { return g.st !== 'COMPLETE' && g.st !== 'NOT_PLAYED'; }
/* One line per team, summed across every group it played in: a group stage and
   a second round are different games, so they add. `pos` and `g` are the team's
   first group, for ordering. */
const STAND_TOT = {};
function standTotals(c) {
  if (STAND_TOT[c.id]) return STAND_TOT[c.id];
  const by = {};
  (c.stand || []).forEach(r => {
    if (!r || !r.team) return;
    const t = by[r.team] || (by[r.team] = { team: r.team, code: r.code, pos: r.pos, g: r.g,
      gp: 0, w: 0, l: 0, pf: 0, pa: 0, gd: 0, pts: 0 });
    ['gp', 'w', 'l', 'pf', 'pa', 'gd', 'pts'].forEach(k => { t[k] += Number(r[k]) || 0; });
  });
  return (STAND_TOT[c.id] = by);
}
function compStatus(c) {
  if (c.nDone === 0) return 'Scheduled';
  if (c.nDone < c.nGames) return 'In progress';
  return 'Completed';
}

/* Career totals across every competition a person played in. Sums only real
   published totals; a competition with no published stat line contributes
   nothing rather than a zero. */
function careerTotals(pid) {
  const rows = (CAREER[pid] || []).filter(r => hasStats(r.p));
  const t = { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0,
              tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, eff: 0, min: 0, comps: rows.length };
  rows.forEach(r => {
    const p = r.p;
    ['g', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'tpm', 'tpa',
     'ftm', 'fta', 'oreb', 'dreb', 'eff'].forEach(k => { if (has(p[k])) t[k] += Number(p[k]); });
    const m = minsToNum(p.min); if (m) t.min += m;
  });
  return t;
}

/* ---------------------------- competition tiers ---------------------------- */
/* A "tier" is series × age group — the unit at which this site is willing to
   average. Numbers are never averaged across tiers, because a U15 championship
   and a senior league are not the same competition strength. Sums are still
   sums, so totals stay meaningful; only per-game and percentage figures are
   kept inside a tier. */
const MBL_SERIES = 'Major Basketball League';

function tierKey(c) { return c.series + '|' + c.level; }
function tierLabel(c) { return c.level === 'Open' ? c.series : c.series + ' ' + c.level; }
function tierLabelFromKey(k) {
  const [s, l] = k.split('|');
  return l === 'Open' ? s : s + ' ' + l;
}
function tierShort(k) {
  const [s, l] = k.split('|');
  const abbr = { 'Malaysia D-League': 'D-League', 'Major Basketball League': 'MBL',
                 'MABA/MATRIX 17 & Below': 'MATRIX 17U', 'MILO Lum Mun Chak Cup': 'Lum Mun Chak',
                 'MABA/MATRIX Cup': 'MATRIX Cup', 'Schools Championship': 'Schools',
                 'NXT Championship': 'NXT', 'Sukan Malaysia': 'SUKMA', 'Sukan Selangor': 'SUKSES',
                 'Women\'s Basketball Alliance': 'WMBA' }[s] || s;
  return l === 'Open' ? abbr : abbr + ' ' + l;
}

const TIER_SUM = ['g', 'pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf',
                  'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'twopm', 'twopa', 'eff',
                  'index', 'gs', 'w', 'l', 'pm', 'flson', 'blkr', 'tsa'];

/* Every tier a player has a published line in, newest first (Q9: ordered by
   time only — the site makes no judgement about which competition is stronger). */
function playerTiers(pid) {
  const groups = {};
  (CAREER[pid] || []).forEach(r => {
    if (!hasStats(r.p)) return;
    const k = tierKey(r.c);
    const t = groups[k] || (groups[k] = { key: k, label: tierLabelFromKey(k), rows: [],
      series: r.c.series, level: r.c.level, minTotal: 0, gmscSum: 0, gmscN: 0 });
    TIER_SUM.forEach(f => { if (has(r.p[f])) t[f] = (t[f] || 0) + Number(r.p[f]); });
    const m = minsToNum(r.p.min); if (m) t.minTotal += m;
    if (has(r.p.gmsc)) { t.gmscSum += Number(r.p.gmsc) * (r.p.g || 1); t.gmscN += (r.p.g || 1); }
    t.rows.push(r);
  });
  const out = Object.values(groups);
  out.forEach(t => {
    t.rows.sort((a, b) => (b.c.year || 0) - (a.c.year || 0) || a.c.name.localeCompare(b.c.name));
    t.lastYear = Math.max.apply(null, t.rows.map(r => r.c.year || 0));
    t.firstYear = Math.min.apply(null, t.rows.map(r => r.c.year || 9999));
    t.nComps = t.rows.length;
    t.teams = [...new Set(t.rows.map(r => r.p.team).filter(Boolean))];
    t.min = t.minTotal || null;
    t.gmsc = t.gmscN ? t.gmscSum / t.gmscN : null;
    // weighted rates, computed inside the tier only
    t.tspct = weightedRate(t.rows, 'tspct', 'tsa');
    t.orpct = weightedRate(t.rows, 'orpct', 'g');
    t.drpct = weightedRate(t.rows, 'drpct', 'g');
    t.topct = weightedRate(t.rows, 'topct', 'g');
  });
  out.sort((a, b) => b.lastYear - a.lastYear || b.g - a.g);
  return out;
}
function weightedRate(rows, field, weightField) {
  let num = 0, den = 0;
  rows.forEach(r => {
    const v = r.p[field], w = Number(r.p[weightField]);
    if (has(v) && w) { num += Number(v) * w; den += w; }
  });
  return den ? num / den : null;
}

/* The tier shown in the hero: Major Basketball League when the player has one
   (the user's editorial default), otherwise their most recent tier. The hero
   also carries a selector, so a three-game MBL sample can be switched away. */
function defaultTierKey(tiers) {
  const mbl = tiers.find(t => t.series === MBL_SERIES);
  return mbl ? mbl.key : (tiers[0] ? tiers[0].key : null);
}

/* Single-game career highs, straight from published box scores. Each carries
   the tier it happened in — a 38-point game in U15 is not a 38-point game in a
   senior league, and the badge is what stops the two being read as equal. */
const HIGH_CATS = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists']];
function careerHighs(pid) {
  const best = {};
  (BOX_BY_PID[pid] || []).forEach(mid => {
    const g = GAME_BY_MID[mid]; if (!g) return;
    const b = getBox(mid); if (!b) return;
    const line = b.p.find(x => x.pid === pid); if (!line) return;
    const c = COMP_BY_ID[g.cid]; if (!c) return;
    HIGH_CATS.forEach(([k]) => {
      const v = k === 'reb' ? boxReb(line) : line[k];
      if (!has(v)) return;
      const cur = best[k];
      // ties resolve to the more recent game
      if (!cur || v > cur.v || (v === cur.v && (g.date || '') > (cur.g.date || ''))) {
        best[k] = { v: v, g: g, c: c, line: line, tier: tierKey(c) };
      }
    });
  });
  return best;
}
