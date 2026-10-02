/* =========================================================================
   Player profile — organised by competition tier.

   The governing rule of this page: numbers are never averaged across
   competitions of different strength. A player's U15 championship and their
   senior-league season are separate rows, never one blended line. Totals are
   still totals and are shown as such; every per-game figure and every
   percentage on this page belongs to exactly one tier.
   ========================================================================= */

const PROFILE = { heroTier: null, statMode: 'pg', advMode: 'rate', logTier: '', openLog: null, openDetail: null };

/* ---- tier stat table -------------------------------------------------- */
/* By Tier carries the counting line only. Every rate, rating and model lives on
   the Advanced tab, so the two can never be read as one blended table. */
const TIER_MODES = [['pg', 'Per Game'], ['tot', 'Totals']];
const TIER_COLS = {
  pg: [['g', 'G', t => t.g], ['minpg', 'MPG', t => pg(t.min, t.g)],
       ['ppg', 'PTS', t => pg(t.pts, t.g)], ['rpg', 'REB', t => pg(t.reb, t.g)],
       ['orpg', 'ORB', t => pg(t.oreb, t.g)], ['drpg', 'DRB', t => pg(t.dreb, t.g)],
       ['apg', 'AST', t => pg(t.ast, t.g)], ['spg', 'STL', t => pg(t.stl, t.g)],
       ['bpg', 'BLK', t => pg(t.blk, t.g)], ['topg', 'TOV', t => pg(t.tov, t.g)],
       ['pfpg', 'PF', t => pg(t.pf, t.g)],
       ['fgpct', 'FG%', t => ratio(t.fgm, t.fga)], ['tppct', '3P%', t => ratio(t.tpm, t.tpa)],
       ['ftpct', 'FT%', t => ratio(t.ftm, t.fta)]],
  tot: [['g', 'G', t => t.g], ['min', 'MIN', t => t.min],
        ['pts', 'PTS', t => t.pts], ['reb', 'REB', t => t.reb], ['ast', 'AST', t => t.ast],
        ['stl', 'STL', t => t.stl], ['blk', 'BLK', t => t.blk], ['tov', 'TOV', t => t.tov],
        ['pf', 'PF', t => t.pf], ['fg', 'FG', t => t], ['tp', '3P', t => t], ['ft', 'FT', t => t],
        ['eff', 'EFF', t => t.eff]],
};
function tierCell(k, v, t) {
  if (k === 'fg') return has(t.fgm) ? t.fgm + '/' + t.fga : '—';
  if (k === 'tp') return has(t.tpm) ? t.tpm + '/' + t.tpa : '—';
  if (k === 'ft') return has(t.ftm) ? t.ftm + '/' + t.fta : '—';
  if (k === 'min') return has(v) ? Math.round(v).toLocaleString() : '—';
  if (k === 'pm') return fmtPM(v);
  if (k === 'ato') return has(v) ? Number(v).toFixed(2) : '—';
  if (/pct|efg/.test(k)) return has(v) ? pct1(v) : '—';
  if (['g', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'eff'].includes(k)) return fmt0(v);
  return fmt1(v);
}

/* A competition with known playoffs (MBL 2023, 2024) splits its row into the regular
   season and the playoffs, both summed from the box scores. */
function phaseSplitLine(c, ph, pid, team) {
  if (!c.split) return null;
  const L = c.split[ph].filter(p => p.pid === pid);
  return L.find(p => p.team === team) || L[0] || null;
}
function phaseSubRows(r, pid, cols) {
  if (!r.c.split) return '';
  return [['rs', 'Regular season'], ['po', 'Playoffs']].map(([ph, label]) => {
    const p = phaseSplitLine(r.c, ph, pid, r.p.team);
    const row = p ? Object.assign({}, p, { min: minsToNum(p.min) }) : null;
    return `<tr class="sub-row phase-row">
      <td class="left"><div style="padding-left:44px;"><span class="phase-tag phase-${ph}">${label}</span></div></td>
      <td>—</td>
      ${row ? cols.map(([k, l, f], i) => `<td ${i === cols.length - 1 ? 'style="padding-right:20px;"' : ''}>${tierCell(k, f(row), row)}</td>`).join('')
            : `<td class="left" colspan="${cols.length}" style="color:var(--text-faint);padding-right:20px;">Did not play in the ${ph === 'po' ? 'playoffs' : 'regular season'}</td>`}
    </tr>`;
  }).join('');
}

function tierTable(pid) {
  const tiers = playerTiers(pid);
  if (!tiers.length) {
    return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>The source publishes no statistical line for this player in any competition — only a roster entry. Nothing is estimated here.</div></div>`;
  }
  // a stale 'adv' from before the Advanced tab existed falls back to per game
  if (!TIER_COLS[PROFILE.statMode]) PROFILE.statMode = 'pg';
  const mode = PROFILE.statMode;
  const cols = TIER_COLS[mode];
  return `<div class="card">
    <div class="card-head">By competition tier
      <span class="seg" style="margin-left:auto;">
        ${TIER_MODES.map(([k, l]) => `<button class="seg-btn ${mode === k ? 'seg-on' : ''}" data-tmode="${k}">${l}</button>`).join('')}
      </span>
    </div>
    <div class="table-scroll"><table>
      <thead><tr>
        <th class="left nosort"${gloss('Tier')}>Tier</th>
        <th class="nosort"${gloss('Comps')}>Comps</th>
        ${cols.map(([k, l], i) => `<th class="nosort" ${i === cols.length - 1 ? 'style="padding-right:20px;"' : ''}${gloss(l)}>${l}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${tiers.map(t => {
          const small = t.g && t.g < 3;
          const open = PROFILE.openLog === 'tier:' + t.key;
          return `<tr class="clickable tier-row" data-tieropen="${esc(t.key)}">
            <td class="left">
              <div class="player-cell">
                <span class="tier-caret ${open ? 'open' : ''}">▸</span>
                <div>
                  <div class="p-name">${esc(t.label)}</div>
                  <div class="p-team">${t.firstYear === t.lastYear ? t.firstYear : t.firstYear + '–' + t.lastYear}${t.teams.length ? ' · ' + esc(t.teams.slice(0, 2).join(', ')) + (t.teams.length > 2 ? ' +' + (t.teams.length - 2) : '') : ''}</div>
                </div>
              </div>
            </td>
            <td>${t.nComps}${small ? ` <span class="small-n" title="Small sample">${t.g} game${t.g === 1 ? '' : 's'}</span>` : ''}</td>
            ${cols.map(([k, l, f], i) => `<td class="${k === 'ppg' || k === 'pts' ? 'lead' : ''}" ${i === cols.length - 1 ? 'style="padding-right:20px;"' : ''}>${tierCell(k, f(t), t)}</td>`).join('')}
          </tr>
          ${open ? t.rows.map(r => `<tr class="sub-row">
            <td class="left"><div style="padding-left:26px;"><a href="#/c/${r.c.id}/players">${esc(r.c.label || r.c.name)}</a>
              <div class="p-team">${r.c.year || ''}${r.p.team ? ' · ' + esc(r.p.team) : ''}</div></div></td>
            <td>—</td>
            ${cols.map(([k, l, f], i) => {
              const row = Object.assign({}, r.p, { min: minsToNum(r.p.min), gmsc: r.p.gmsc });
              return `<td ${i === cols.length - 1 ? 'style="padding-right:20px;"' : ''}>${tierCell(k, f(row), row)}</td>`;
            }).join('')}
          </tr>${phaseSubRows(r, pid, cols)}`).join('') : ''}`;
        }).join('')}
      </tbody>
    </table></div>
    <div class="note">One row per competition tier (series × age group), newest first — the site applies no strength ranking of its own. <strong>Figures are never averaged across tiers</strong>, because a youth championship and a senior league are not the same competition. Click a tier to see the individual competitions inside it. A tier with fewer than three games is flagged with its game count, since a per-game figure off one or two games says very little. Totals are the source's own published season totals; per-game and percentage columns are computed from them. Rates, ratings, PER, Win Shares and BPM are on the <a href="#/p/${pid}/adv">Advanced</a> tab. MBL 2023 and 2024 also split into <strong>regular season</strong> and <strong>playoffs</strong>, summed from the box scores (the two add up to the published season line).</div>
  </div>`;
}

/* ---- advanced ---------------------------------------------------------- */
/* One competition is one league. PER, USG% and Win Shares are computed per
   competition against that field (build_bpm.py), exactly as BPM is, and a tier
   row combines only its own competitions: rates and ratings weighted by minutes,
   win shares summed. The Efficiency view is the source's own published rates and
   indices, moved here from By Tier. */
const PADV_MODES = [['rate', 'Ratings'], ['eff', 'Efficiency']];
function advRow(cid, pid) {
  const c = (DB.adv || {})[cid];
  const r = c && c[pid];
  if (!r) return null;
  return { per: r[0], usg: r[1], ows: r[2], dws: r[3], ws: r[4], ws40: r[5], ortg: r[6], drtg: r[7], mp: r[8] };
}
function advCtx(cid) { const m = (DB.bpmMeta || {})[cid]; return (m && m.adv) || null; }
/* Win Shares turn point margin into wins in a straight line. Where results are
   lopsided the line overshoots, so a competition whose team Win Shares land a
   median of half its games or more from the recorded wins is flagged. */
const WS_LOOSE = 0.5;
function wsFit(cid) { const x = advCtx(cid); return x && x.wsfit != null ? x.wsfit : null; }
function wsLoose(cid) { const f = wsFit(cid); return f != null && f >= WS_LOOSE; }
function advAgg(rows) {
  const rs = rows.filter(x => x.a);
  if (!rs.length) return null;
  const mp = rs.reduce((s, x) => s + x.a.mp, 0);
  const wm = f => mp ? rs.reduce((s, x) => s + x.a[f] * x.a.mp, 0) / mp : null;
  const sum = f => rs.reduce((s, x) => s + x.a[f], 0);
  const ws = sum('ws');
  return { per: wm('per'), usg: wm('usg'), ortg: wm('ortg'), drtg: wm('drtg'),
           ows: sum('ows'), dws: sum('dws'), ws, ws40: mp ? ws / mp * 40 : null,
           mp, n: rs.length, loose: rs.some(x => wsLoose(x.c.id)) };
}
// a value that rounds to zero is written 0.0, never −0.0
const sgn1 = v => has(v) ? (v <= -0.05 ? '−' : '') + Math.abs(v).toFixed(1) : '—';
// Basketball-Reference writes WS/48 as .123; WS/40 follows it
const ws40Fmt = v => has(v) ? (v <= -0.0005 ? '−' : '') + Math.abs(v).toFixed(3).replace(/^0/, '') : '—';

const PADV_COLS = {
  rate: [['per', 'PER', a => a.per, fmt1], ['usg', 'USG%', a => a.usg, pct1],
         ['ortg', 'ORtg', a => a.ortg, fmt1], ['drtg', 'DRtg', a => a.drtg, fmt1],
         ['ows', 'OWS', a => a.ows, sgn1], ['dws', 'DWS', a => a.dws, sgn1],
         ['ws', 'WS', a => a.ws, sgn1], ['ws40', 'WS/40', a => a.ws40, ws40Fmt]],
  eff: [['g', 'G', t => t.g], ['minpg', 'MPG', t => pg(t.min, t.g)],
        ['effpg', 'EFF', t => pg(t.eff, t.g)], ['pir', 'PIR', t => pg(t.index, t.g)],
        ['gmsc', 'GmSc', t => t.gmsc], ['tspct', 'TS%', t => t.tspct],
        ['efg', 'eFG%', t => efgPct(t)], ['orpct', 'OR%', t => t.orpct],
        ['drpct', 'DR%', t => t.drpct], ['topct', 'TO%', t => t.topct],
        ['ato', 'A/TO', t => (has(t.ast) && t.tov) ? t.ast / t.tov : null],
        ['pm', '+/-', t => t.pm]],
};

function wsFlag(cid) {
  const f = wsFit(cid);
  return ` · <span class="bpm-flag" data-imtip="Win Shares turn point margin into wins in a straight line. Results here were lopsided enough that each team's Win Shares land a median of ${Math.round(f * 100)}% of its games away from the wins it actually recorded (in the MBL it is 12%). Read Win Shares here for who contributed more, not as a literal count of wins.">lopsided results</span>`;
}

function advTable(pid, tiers) {
  if (!PADV_COLS[PROFILE.advMode]) PROFILE.advMode = 'rate';
  const mode = PROFILE.advMode;
  const cols = PADV_COLS[mode];
  const rate = mode === 'rate';
  const last = i => i === cols.length - 1 ? ' style="padding-right:20px;"' : '';

  const body = tiers.map(t => {
    const rows = t.rows.map(r => ({ c: r.c, p: r.p, a: advRow(r.c.id, pid) }));
    const agg = advAgg(rows);
    const open = PROFILE.openLog === 'tier:' + t.key;
    const cells = rate
      ? `<td>${agg ? agg.n + ' / ' + t.nComps : '0 / ' + t.nComps}</td>
         <td>${agg ? Math.round(agg.mp).toLocaleString() : '—'}</td>
         ${cols.map(([k, l, f, fm], i) => `<td class="${k === 'per' ? 'lead' : ''}"${last(i)}>${agg ? fm(f(agg)) : '—'}</td>`).join('')}`
      : `<td>${t.nComps}${t.g && t.g < 3 ? ` <span class="small-n" title="Small sample">${t.g} game${t.g === 1 ? '' : 's'}</span>` : ''}</td>
         ${cols.map(([k, l, f], i) => `<td${last(i)}>${tierCell(k, f(t), t)}</td>`).join('')}`;
    const sub = !open ? '' : rows.map(r => {
      const label = `<td class="left"><div style="padding-left:26px;"><a href="#/c/${r.c.id}/players">${esc(r.c.label || r.c.name)}</a>
        <div class="p-team">${r.c.year || ''}${r.p.team ? ' · ' + esc(r.p.team) : ''}${rate && r.a && wsLoose(r.c.id) ? wsFlag(r.c.id) : ''}</div></div></td>`;
      if (rate) {
        const why = r.a ? '' : (bpmMeta(r.c.id) ? 'below the qualifying games or possessions' : 'no box scores published');
        return `<tr class="sub-row">${label}<td>—</td><td>${r.a ? Math.round(r.a.mp).toLocaleString() : '—'}</td>
          ${r.a ? cols.map(([k, l, f, fm], i) => `<td${last(i)}>${fm(f(r.a))}</td>`).join('')
                : `<td class="left" colspan="${cols.length}" style="color:var(--text-faint);padding-right:20px;">Not rated — ${why}</td>`}</tr>`;
      }
      const row = Object.assign({}, r.p, { min: minsToNum(r.p.min), gmsc: r.p.gmsc });
      return `<tr class="sub-row">${label}<td>—</td>${cols.map(([k, l, f], i) => `<td${last(i)}>${tierCell(k, f(row), row)}</td>`).join('')}</tr>`;
    }).join('');
    return `<tr class="clickable tier-row" data-tieropen="${esc(t.key)}">
      <td class="left"><div class="player-cell">
        <span class="tier-caret ${open ? 'open' : ''}">▸</span>
        <div><div class="p-name">${esc(t.label)}</div>
          <div class="p-team">${t.firstYear === t.lastYear ? t.firstYear : t.firstYear + '–' + t.lastYear}${rate && agg && agg.loose ? ' · <span class="bpm-flag" data-imtip="At least one competition in this tier had results lopsided enough to stretch Win Shares. Open the tier to see which.">WS stretched</span>' : ''}</div></div>
      </div></td>${cells}</tr>${sub}`;
  }).join('');

  const note = rate
    ? `<strong>Computed here</strong> from box scores with Basketball-Reference's formulas, one competition at a time, so
       every figure is measured against the field it was earned in: a PER of 15 is exactly average <em>for that competition</em>,
       and a Win Share is priced in that competition's own points per game and pace. WS/40 is Basketball-Reference's WS/48
       rescaled to a 40-minute FIBA game; the average player posts .100. A tier combines only its own competitions — PER, USG%
       and the ratings weighted by minutes, win shares summed. <strong>Win Shares are a model, and they stretch in blowouts</strong>:
       they convert point margin into wins in a straight line, which tracks real wins closely in close leagues (MBL: within 12% of
       games played) but overshoots where results are lopsided, flagged above. A competition is rated when it publishes box scores,
       and a player when he reaches its qualifying games and 40 possessions — the same rule as BPM below.`
    : `TS%, OR%, DR% and TO% are published by the source; PIR, Game Score and EFF are its own published ratings, and EFF and PIR are
       shown per game. eFG% and A/TO are computed here from published totals. A tier combines its competitions weighted by attempts
       and games, never across tiers. Where a competition's line was rebuilt from box scores because the source publishes no player
       statistics page, OR%, DR% and PIR cannot be recovered and show as a dash.`;

  return `<div class="card">
    <div class="card-head">Advanced by competition tier
      <span class="seg" style="margin-left:auto;">
        ${PADV_MODES.map(([k, l]) => `<button class="seg-btn ${mode === k ? 'seg-on' : ''}" data-amode="${k}">${l}</button>`).join('')}
      </span>
    </div>
    <div class="table-scroll"><table>
      <thead><tr>
        <th class="left nosort"${gloss('Tier')}>Tier</th>
        <th class="nosort">${rate ? 'Rated' : 'Comps'}</th>
        ${rate ? '<th class="nosort" data-imtip="Minutes played in the rated competitions — what every figure on this row is built on.">MIN</th>' : ''}
        ${cols.map(([k, l], i) => `<th class="nosort"${last(i)}${gloss(l)}>${l}</th>`).join('')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="note">${note}</div>
  </div>`;
}

/* ---- on/off, from lineups rebuilt out of the play-by-play --------------------
   How his team did per 100 possessions with him on the floor, and without him.
   Measured, not modelled — but it measures the five-man units he played in, so
   it is as much about his teammates as about him, and it is noisy. */
function onoffRow(cid, pid) {
  const r = ((DB.onoff || {})[cid] || {})[pid];
  if (!r) return null;
  return { min: r[0], on: r[1], off: r[2], d: r[3], lo: r[4], hi: r[5], pm: r[6], g: r[7], poss: r[8], cov: r[9] };
}
function onoffBar(o) {
  const s = 30;
  const x = q => Math.max(0, Math.min(100, (q + s) / (2 * s) * 100));
  return `<div class="bpm-track" data-imtip="80% of resamples of his team's games land between ${bpmFmt(o.lo)} and ${bpmFmt(o.hi)}. The scale runs −${s} to +${s}; the centre line is no difference.">
    ${[-15, 15].map(t => `<div class="bpm-tick" style="left:${x(t)}%"></div>`).join('')}<div class="bpm-zero"></div>
    <div class="bpm-span ${o.d >= 0 ? '' : 'dn'}" style="left:${x(o.lo)}%;width:${Math.max(0.8, x(o.hi) - x(o.lo))}%"></div>
    <div class="bpm-pt ${o.d >= 0 ? 'up' : 'dn'}" style="left:calc(${x(o.d)}% - 1.5px)"></div>
  </div>`;
}
function playerOnOff(pid, tiers) {
  const M = DB.onoffMeta || {};
  const groups = tiers.map(t => ({ t, rows: t.rows.map(r => ({ c: r.c, p: r.p, o: onoffRow(r.c.id, pid) })).filter(r => r.o) }))
    .filter(x => x.rows.length);
  if (!groups.length) {
    return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No on/off yet — it needs play-by-play for his games and at least ${M.min_on || 30} minutes on court in one competition.</div></div>`;
  }
  const body = groups.map(({ t, rows }) => `<tr class="oo-tier"><td class="left" colspan="8">${esc(t.label)}</td></tr>` +
    rows.sort((a, b) => (b.c.year || 0) - (a.c.year || 0)).map(({ c, p, o }) => `<tr>
      <td class="left"><a href="#/c/${c.id}/players">${esc(c.label || c.name)}</a>
        <div class="p-team">${c.year || ''}${p.team ? ' · ' + esc(p.team) : ''}${o.cov < 0.8 ? ` · <span class="bpm-flag" data-imtip="Lineups could be rebuilt for ${Math.round(o.cov * 100)}% of his team's games here — the rest have no play-by-play, or a period that could not be made to hold five a side. The figures cover those games only.">${Math.round(o.cov * 100)}% of games</span>` : ''}</div></td>
      <td>${o.g}</td>
      <td>${Math.round(o.min).toLocaleString()}</td>
      <td>${sgn1(o.on)}</td>
      <td>${sgn1(o.off)}</td>
      <td class="lead"><span class="bpm-num ${o.d >= 0 ? 'up' : 'dn'}">${bpmFmt(o.d)}</span></td>
      <td class="oo-bar">${onoffBar(o)}<div class="oo-ci">${bpmFmt(o.lo)} to ${bpmFmt(o.hi)}</div></td>
      <td style="padding-right:20px;">${o.pm > 0 ? '+' : o.pm < 0 ? '−' : ''}${Math.abs(o.pm)}</td>
    </tr>`).join('')).join('');
  const pct = v => has(v) ? (v * 100).toFixed(1).replace(/\.0$/, '') + '%' : '—';
  return `<div class="card">
    <div class="card-head">On/Off by competition<span class="head-sub">team points per 100 possessions, with him and without him</span></div>
    <div class="table-scroll"><table class="oo-table">
      <thead><tr>
        <th class="left nosort">Competition</th>
        <th class="nosort" data-imtip="Games he was on court for, among those with rebuilt lineups.">G</th>
        <th class="nosort" data-imtip="Minutes on court, from the rebuilt lineups.">MIN</th>
        <th class="nosort"${gloss('On')}>On</th>
        <th class="nosort"${gloss('Off')}>Off</th>
        <th class="nosort"${gloss('On−Off')}>On−Off</th>
        <th class="nosort left" data-imtip="80% interval from resampling his team's games — how far the On−Off figure could move on a different run of the same games.">80% range</th>
        <th class="nosort" style="padding-right:20px;" data-imtip="The team's points scored minus points allowed while he was on court, summed over the competition.">On ±</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <div class="note"><strong>Measured from rebuilt lineups, not published by the source.</strong> Every substitution in the
      play-by-play is followed to know who was on the floor; a starter who plays a whole period without appearing in the feed is
      recovered from the box score's minutes. Checked against the box scores, rebuilt minutes land within a minute of the published
      figure for ${pct(M.min_1)} of player-games, and rebuilt plus/minus matches the published one exactly on ${pct(M.pm_exact_c)} of lines
      in games where the source's own plus/minus adds up. <strong>On/off is noisy and shared</strong>: it rates the units he played in, so a
      bench player behind a strong starter looks worse than he is, and in a 20-game competition the 80% range is usually wider than the
      figure itself. It is not adjusted for the score, so minutes in blowouts count in full. Shown for ${M.min_on || 30}+ minutes on court.</div>
  </div>`;
}

function playerAdvanced(pid, tiers) {
  if (!tiers.length) {
    return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>The source publishes no statistical line for this player in any competition — only a roster entry. Nothing is estimated here.</div></div>`;
  }
  return `${advTable(pid, tiers)}
    <div class="adv-divider"><span>Box Plus/Minus &amp; VORP</span><em>impact per 100 possessions, with its uncertainty</em></div>
    ${playerBpm(pid, tiers)}
    <div class="adv-divider"><span>On/Off</span><em>how his team did with him on the floor, and without him</em></div>
    ${playerOnOff(pid, tiers)}`;
}

/* ---- hero ------------------------------------------------------------- */
function heroTierFor(pid, tiers) {
  if (PROFILE.heroTier && tiers.some(t => t.key === PROFILE.heroTier)) return PROFILE.heroTier;
  return defaultTierKey(tiers);
}

function renderPlayerLegacy(pid, tab) {
  if (PROFILE.pid !== pid) {
    PROFILE.pid = pid; PROFILE.heroTier = null; PROFILE.statMode = 'pg';
    PROFILE.logTier = ''; PROFILE.openLog = null;
    BPMV.tier = null; BPMV.cid = null; BPMV.full = false;
  }
  const name = PERSONS[pid];
  if (!name) return `<div class="page"><div class="card"><div class="note" style="border-top:none;">Player not found.</div></div></div>`;
  const career = (CAREER[pid] || []).slice().sort((a, b) => (b.c.year || 0) - (a.c.year || 0) || a.c.name.localeCompare(b.c.name));
  const tiers = playerTiers(pid);
  const bios = BIO[pid] || {};
  const bio = career.map(r => bios[r.c.id]).find(Boolean) || {};
  const hk = heroTierFor(pid, tiers);
  const ht = tiers.find(t => t.key === hk) || null;

  const years = career.map(r => r.c.year).filter(Boolean);
  const span = years.length ? (Math.min.apply(null, years) === Math.max.apply(null, years)
    ? String(Math.min.apply(null, years))
    : Math.min.apply(null, years) + ' – ' + Math.max.apply(null, years)) : '—';

  // Team pills have a fixed scope: MBL, and the U20 / U23 age groups. Those are
  // the competitions the club affiliation is meant to say something about; the
  // rest of the career is noise here. The scope does not follow the hero tier
  // selector, and a player with none of them gets no pill row at all.
  const pillScope = career.filter(r =>
    r.c.series === MBL_SERIES || r.c.level === 'U20' || r.c.level === 'U23');
  const teamYears = {};
  pillScope.forEach(r => {
    const tn = r.p.team || (bios[r.c.id] && bios[r.c.id].tid ? TEAMS[bios[r.c.id].tid] : '');
    if (!tn || !r.c.year) return;
    const e = teamYears[tn] || (teamYears[tn] = { min: r.c.year, max: r.c.year, cid: r.c.id });
    e.min = Math.min(e.min, r.c.year); e.max = Math.max(e.max, r.c.year);
    if (r.c.year >= e.max) e.cid = r.c.id;
  });
  const pills = Object.entries(teamYears).sort((a, b) => b[1].max - a[1].max);

  /* The age-group nationals are contested by states, so a player who has been
     to one carries a state as well as a club. Newest appearance wins; a player
     who has represented two states shows both. */
  const stateRows = career
    .filter(r => r.c.level === 'U17' && stateFlag(r.p.team))
    .sort((a, b) => (b.c.year || 0) - (a.c.year || 0));
  const stateSeen = {};
  const states = [];
  stateRows.forEach(r => {
    const k = stateSlug(r.p.team);
    if (stateSeen[k]) { stateSeen[k].years.push(r.c.year); return; }
    stateSeen[k] = { key: k, years: [r.c.year] };
    states.push(stateSeen[k]);
  });

  const meta = [
    ['Position', bio.pos || '—'],
    ['Height / Weight', (has(bio.ht) ? bio.ht + ' cm' : '—') + (has(bio.wt) ? ' / ' + bio.wt + ' kg' : '')],
    ['Born', bio.dob || '—'],
    ['Nationality', bio.nat || '—'],
    ['Career span', span],
  ];
  const stateCell = states.length ? `<div><div class="hero-meta-label">State · U17</div>
    <div class="hero-state">${states.map(x => {
      const ys = x.years.filter(Boolean).sort();
      const yr = ys.length ? (ys[0] === ys[ys.length - 1] ? ys[0] : ys[0] + '–' + ys[ys.length - 1]) : '';
      return `<span class="hero-state-one"><img src="${FLAGS[x.key]}" alt="">${esc(STATE_NAME[x.key])}${
        yr ? `<em>${yr}</em>` : ''}</span>`;
    }).join('')}</div></div>` : '';

  // the bloom behind the plate is tinted with the player's most recent team
  const pillTeam = (career.slice().sort((a, b) => (b.c.year || 0) - (a.c.year || 0))
    .map(r => r.p.team).find(Boolean)) || '';
  // BPM & VORP now lives inside Advanced; an old #/p/<pid>/bpm link opens there
  if (tab === 'bpm') tab = 'adv';
  const tabs = [['tiers', 'By tier'], ['adv', 'Advanced'], ['impact', 'Impact'],
                ['detail', 'Detailed statistics'], ['log', 'Game log']];
  const body = tab === 'impact' ? playerImpact(pid, tiers)
    : tab === 'adv' ? playerAdvanced(pid, tiers)
    : tab === 'detail' ? playerDetail(pid, tiers)
    : tab === 'log' ? playerLog(pid, career)
    : tierTable(pid);

  return `<div class="page">
    <div class="crumb"><a href="#/players">Players</a> / ${esc(name)}</div>

    <div class="hero">
      <div class="bloom" style="--team:${teamBloom(pillTeam || '')}">
        <i class="b1"></i><i class="b2"></i>${PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="">` : ''}
      </div>
      <div class="grain"></div>
      <div class="hero-plate rim">
      <div class="hero-main">
        <div class="hero-photo">
          ${PHOTOS[pid]
            ? `<img src="${PHOTOS[pid]}" alt="${esc(name)}">`
            : `<div class="hero-photo-inner" title="Photo slot — awaiting a portrait for this player">${initials(name)}</div>`}
        </div>
        <div class="hero-body">
          <h1 class="hero-name">${esc(name)}</h1>
          <div class="hero-meta">
            ${meta.map(([l, v]) => `<div><div class="hero-meta-label">${esc(l)}</div><div class="hero-meta-value">${esc(v)}</div></div>`).join('')}${stateCell}
          </div>
          ${pills.length ? `<div class="hero-teams">
            <div class="hero-meta-label">Teams · MBL / U20 / U23</div>
            <div class="pill-row">${pills.map(([tn, e]) => {
              const tid = TID_BY_NAME[tn];
              const label = e.min === e.max ? e.min : e.min + '–' + e.max;
              return `<a class="team-pill" ${tid ? `href="#/c/${e.cid}/team/${tid}"` : ''}>${crest(tn, 18)}<span>${esc(tn)}</span><em>${label}</em></a>`;
            }).join('')}</div>
          </div>` : ''}
        </div>
      </div>

      ${ht ? `<div class="hero-stats">
        <div class="hero-stats-label">
          <span class="hero-tier-name">${esc(ht.label)}</span>
          <span class="hero-tier-sub">${ht.firstYear === ht.lastYear ? ht.firstYear : ht.firstYear + '–' + ht.lastYear} · ${ht.nComps} competition${ht.nComps === 1 ? '' : 's'} · per game</span>
          ${tiers.length > 1 ? `<select class="hero-tier-select" data-herotier>
            ${tiers.map(t => `<option value="${esc(t.key)}" ${t.key === hk ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select>` : ''}
        </div>
        <div class="hero-tiles">
          ${[['Games', fmt0(ht.g)], ['PPG', fmt1(pg(ht.pts, ht.g))], ['RPG', fmt1(pg(ht.reb, ht.g))],
             ['APG', fmt1(pg(ht.ast, ht.g))], ['EFF', fmt1(pg(ht.eff, ht.g))]]
            .map(([l, v]) => `<div class="hero-tile"><div class="hero-tile-value">${v}</div><div class="hero-tile-label">${l}</div></div>`).join('')}
        </div>
      </div>` : `<div class="hero-stats"><div class="hero-stats-label"><span class="hero-tier-sub">No published statistical line in any competition yet.</span></div></div>`}
      </div>
    </div>

    ${careerHighStrip(pid)}

    <div class="toolbar"><div class="tabbar">
      ${tabs.map(([k, l]) => `<a href="#/p/${pid}/${k}" class="tab ${tab === k ? 'tab-active' : ''}">${l}</a>`).join('')}
    </div></div>
    ${body}
  </div>`;
}

/* ---- career highs ------------------------------------------------------ */
function careerHighStrip(pid) {
  const highs = careerHighs(pid);
  return `<div class="highs">
    ${HIGH_CATS.map(([k, label]) => {
      const h = highs[k];
      if (!h) {
        return `<div class="high"><div class="high-label">Career high ${esc(label.toLowerCase())}</div>
          <div class="high-value">—</div><div class="high-sub">No published box score</div></div>`;
      }
      const opp = h.line.team === h.g.h ? h.g.a : h.g.h;
      return `<div class="high">
        <div class="high-label">Career high ${esc(label.toLowerCase())}</div>
        <div class="high-value">${h.v}</div>
        <div class="high-sub">vs ${esc(opp)} · ${fmtDate(h.g.date)}</div>
        <a class="tier-badge" href="#/c/${h.c.id}/box/${h.g.mid}">${esc(tierShort(h.tier))}</a>
      </div>`;
    }).join('')}
  </div>`;
}

/* ---- detailed statistics ---------------------------------------------- */
const DETAIL_GROUPS = [
  ['Scoring', [['pts', 'Points', 0], ['ppg', 'Points per game', 1], ['fgm', 'Field goals made', 0], ['fga', 'Field goals attempted', 0],
    ['fgpct', 'Field goal %', 1], ['twopm', '2-pointers made', 0], ['twopa', '2-pointers attempted', 0], ['twoppct', '2P%', 1],
    ['tpm', '3-pointers made', 0], ['tpa', '3-pointers attempted', 0], ['tppct', '3P%', 1],
    ['ftm', 'Free throws made', 0], ['fta', 'Free throws attempted', 0], ['ftpct', 'FT%', 1],
    ['efg', 'Effective FG%', 1], ['tspct', 'True shooting %', 1], ['tsa', 'True shooting attempts', 1]]],
  ['Rebounding, playmaking & defence', [['reb', 'Total rebounds', 0], ['rpg', 'Rebounds per game', 1],
    ['oreb', 'Offensive rebounds', 0], ['orpct', 'Offensive rebound %', 1], ['dreb', 'Defensive rebounds', 0], ['drpct', 'Defensive rebound %', 1],
    ['ast', 'Assists', 0], ['apg', 'Assists per game', 1], ['tov', 'Turnovers', 0], ['topct', 'Turnover %', 1],
    ['ato', 'Assist / turnover', 2], ['stl', 'Steals', 0], ['blk', 'Blocks', 0], ['blkr', 'Times blocked', 0]]],
  ['Fouls & discipline', [['pf', 'Total fouls', 0], ['flson', 'Fouls drawn', 0]]],
  ['Playing time & team context', [['g', 'Games played', 0], ['gs', 'Games started', 0], ['min', 'Total minutes', 1],
    ['minpg', 'Minutes per game', 1], ['w', 'Wins while appearing', 0], ['l', 'Losses while appearing', 0], ['pm', 'Plus / minus', 'pm']]],
  ['Efficiency ratings', [['eff', 'Efficiency (EFF)', 0], ['index', 'Performance index (PIR)', 0], ['gmsc', 'Game score', 1]]],
];
function detailVal(t, k) {
  switch (k) {
    case 'ppg': return pg(t.pts, t.g);
    case 'rpg': return pg(t.reb, t.g);
    case 'apg': return pg(t.ast, t.g);
    case 'minpg': return pg(t.min, t.g);
    case 'fgpct': return ratio(t.fgm, t.fga);
    case 'twoppct': return ratio(t.twopm, t.twopa);
    case 'tppct': return ratio(t.tpm, t.tpa);
    case 'ftpct': return ratio(t.ftm, t.fta);
    case 'efg': return efgPct(t);
    case 'ato': return (has(t.ast) && t.tov) ? t.ast / t.tov : null;
    default: return t[k];
  }
}
/* Forty-odd published figures per tier is a wall of numbers when every tier is
   open at once, so each tier collapses the way the game log's competitions do:
   the newest is open, the rest are one click away, and the closed head still
   carries the line most readers came for. */
function playerDetail(pid, tiers) {
  if (!tiers.length) return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>The source publishes no statistical line for this player in any competition yet — only a roster entry. Nothing is estimated here.</div></div>`;
  if (PROFILE.openDetail === null) PROFILE.openDetail = tiers[0].key;

  const shown = tiers.filter(t => !PROFILE.logTier || t.key === PROFILE.logTier);
  return `
  ${tiers.length > 1 ? `<div class="chip-row">
    <button class="chip ${PROFILE.logTier === '' ? 'chip-on' : ''}" data-logtier="">All tiers</button>
    ${tiers.map(t => `<button class="chip ${PROFILE.logTier === t.key ? 'chip-on' : ''}" data-logtier="${esc(t.key)}">${esc(tierShort(t.key))}</button>`).join('')}
  </div>` : ''}
  ${shown.map(t => {
    const open = PROFILE.openDetail === t.key;
    return `<div class="card acc ${open ? 'acc-open' : ''}">
      <div class="acc-head" data-detopen="${esc(t.key)}">
        <span class="tier-caret ${open ? 'open' : ''}">▸</span>
        <div style="flex:1;min-width:0;">
          <div class="acc-title">${esc(t.label)}</div>
          <div class="acc-sub">${t.firstYear === t.lastYear ? t.firstYear : t.firstYear + '–' + t.lastYear} · ${t.nComps} competition${t.nComps === 1 ? '' : 's'}${t.teams.length ? ' · ' + esc(t.teams.slice(0, 2).join(', ')) : ''}</div>
        </div>
        <div class="acc-stat"><b>${t.g}</b> games</div>
        <div class="acc-stat"><b>${fmt1(pg(t.pts, t.g))}</b> PPG</div>
        <div class="acc-stat"><b>${fmt1(pg(t.eff, t.g))}</b> EFF</div>
      </div>
      ${open ? DETAIL_GROUPS.map(([g, fields]) => {
        const avail = fields.filter(([k]) => has(detailVal(t, k)));
        if (!avail.length) return '';
        return `<div class="detail-group"><div class="detail-group-title">${esc(g)}</div>
          <div class="detail-grid">${avail.map(([k, label, dp]) => {
            const v = detailVal(t, k);
            const out = dp === 'pm' ? fmtPM(v) : (typeof v === 'number' ? (dp === 0 ? fmt0(v) : Number(v).toFixed(dp)) : esc(v));
            return `<div class="detail-item"><div class="detail-label">${esc(label)}</div><div class="detail-value">${out}</div></div>`;
          }).join('')}</div></div>`;
      }).join('') + `<div class="note">Every statistic the source publishes for this player, summed across the ${t.nComps} competition${t.nComps === 1 ? '' : 's'} in this tier only — never mixed with any other tier. Totals, minutes, plus/minus, EFF, PIR and game score are the source's own published values; per-game figures and shooting percentages are computed from those totals. TS%, OR%, DR% and TO% are published directly and are combined here weighted by attempts and games.</div>` : ''}
    </div>`;
  }).join('')}`;
}

/* ---- game log ---------------------------------------------------------- */
function playerLog(pid, career) {
  const byComp = {};
  (BOX_BY_PID[pid] || []).forEach(mid => {
    const g = GAME_BY_MID[mid]; if (!g) return;
    const b = getBox(mid); if (!b) return;
    const line = b.p.find(x => x.pid === pid); if (!line) return;
    const c = COMP_BY_ID[g.cid]; if (!c) return;
    (byComp[c.id] = byComp[c.id] || { c: c, lines: [] }).lines.push({ g: g, l: line });
  });
  const groups = Object.values(byComp).sort((a, b) => (b.c.year || 0) - (a.c.year || 0) ||
    (b.lines[0].g.date || '').localeCompare(a.lines[0].g.date || ''));
  if (!groups.length) {
    return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>No per-game box score covering this player has been published by the source. Their season figures are on the other two tabs.</div></div>`;
  }
  groups.forEach(x => x.lines.sort((a, b) => (b.g.date || '').localeCompare(a.g.date || '')));
  if (PROFILE.openLog === null) PROFILE.openLog = groups[0].c.id;

  const tierKeys = [...new Set(groups.map(x => tierKey(x.c)))];
  const shown = groups.filter(x => !PROFILE.logTier || tierKey(x.c) === PROFILE.logTier);

  return `
  ${tierKeys.length > 1 ? `<div class="chip-row">
    <button class="chip ${PROFILE.logTier === '' ? 'chip-on' : ''}" data-logtier="">All tiers</button>
    ${tierKeys.map(k => `<button class="chip ${PROFILE.logTier === k ? 'chip-on' : ''}" data-logtier="${esc(k)}">${esc(tierLabelFromKey(k))}</button>`).join('')}
  </div>` : ''}
  ${shown.map(x => {
    const open = PROFILE.openLog === x.c.id;
    const tot = x.lines.reduce((a, y) => a + (Number(y.l.pts) || 0), 0);
    return `<div class="card acc ${open ? 'acc-open' : ''}">
      <div class="acc-head" data-logopen="${x.c.id}">
        <span class="tier-caret ${open ? 'open' : ''}">▸</span>
        <div style="flex:1;min-width:0;">
          <div class="acc-title">${esc(x.c.label || x.c.name)}</div>
          <div class="acc-sub">${esc(tierLabelFromKey(tierKey(x.c)))} · ${x.c.year || ''}${x.lines[0].l.team ? ' · ' + esc(x.lines[0].l.team) : ''}</div>
        </div>
        <div class="acc-stat"><b>${x.lines.length}</b> games</div>
        <div class="acc-stat"><b>${fmt1(tot / x.lines.length)}</b> PPG</div>
      </div>
      ${open ? `<div class="table-scroll"><table>
        <thead><tr><th class="left nosort">Date</th><th class="left nosort">Matchup</th><th class="nosort"${gloss('MIN')}>MIN</th><th class="nosort"${gloss('PTS')}>PTS</th>
          <th class="nosort"${gloss('FG')}>FG</th><th class="nosort"${gloss('3P')}>3P</th><th class="nosort"${gloss('FT')}>FT</th><th class="nosort"${gloss('REB')}>REB</th><th class="nosort"${gloss('AST')}>AST</th>
          <th class="nosort"${gloss('STL')}>STL</th><th class="nosort"${gloss('BLK')}>BLK</th><th class="nosort"${gloss('TOV')}>TOV</th><th class="nosort"${gloss('PF')}>PF</th><th class="nosort" style="padding-right:20px;"${gloss('EFF')}>EFF</th></tr></thead>
        <tbody>${x.lines.map(y => {
          const l = y.l, g = y.g;
          const own = l.team === g.h ? g.hs : g.as, opp = l.team === g.h ? g.as : g.hs;
          return `<tr class="clickable" onclick="location.hash='#/c/${x.c.id}/box/${g.mid}'" style="cursor:pointer;">
            <td class="left">${fmtDateShort(g.date)} <span style="color:var(--text-faint);">${g.date ? g.date.slice(0, 4) : ''}</span></td>
            <td class="left">${esc(l.team === g.h ? g.a : g.h)} <span class="${own > opp ? 'win-txt' : 'loss-txt'}">${own > opp ? 'W' : 'L'} ${fmt0(own)}–${fmt0(opp)}</span>${phaseLabel(x.c, g.mid) ? ` <span class="po-tag">${esc(phaseLabel(x.c, g.mid))}</span>` : ''}</td>
            <td>${esc(l.min || '—')}</td><td class="lead">${fmt0(l.pts)}</td>
            <td>${has(l.fgm) ? l.fgm + '/' + l.fga : '—'}</td><td>${has(l.tpm) ? l.tpm + '/' + l.tpa : '—'}</td><td>${has(l.ftm) ? l.ftm + '/' + l.fta : '—'}</td>
            <td>${fmt0(boxReb(l))}</td><td>${fmt0(l.ast)}</td><td>${fmt0(l.stl)}</td><td>${fmt0(l.blk)}</td><td>${fmt0(l.tov)}</td><td>${fmt0(l.pf)}</td>
            <td style="padding-right:20px;">${fmt0(l.eff)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : ''}
    </div>`;
  }).join('')}
  <div class="note" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);border-top:1px solid var(--border);">Every game the source publishes a box score line for, grouped by competition and never pooled across them. Click a competition to open its games; click a game for the full box score.</div>`;
}
