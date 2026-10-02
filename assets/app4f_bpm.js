/* =========================================================================
   BPM & VORP — the profile's estimated-impact tab.

   Everything on the other tabs is something the source published. Nothing on
   this one is: BPM is a model, and the numbers here are its output. Three
   consequences shape the design.

   1. A rating is meaningless without its league, so every row belongs to one
      competition. A tier heading pools the competitions inside it by
      possessions, never across tiers.
   2. The intervals are wide. In these tournaments a player's 80% interval is
      about nine BPM points across, which is a large fraction of the whole
      spread of the metric. So the interval is drawn at the same size as the
      number, and the rank is reported as the band of players it cannot be
      separated from — not as a single position.
   3. BPM is a rate. VORP and points added are the volume companions, and a
      player who is sixth by rate can be first by volume. Both are shown.
   ========================================================================= */

const BPMV = { tier: null, cid: null, sort: 'bpm', full: false };

function bpmRow(cid, pid) {
  const c = (DB.bpm || {})[cid];
  const r = c && c[pid];
  if (!r) return null;
  return { bpm: r[0], obpm: r[1], dbpm: r[2], lo: r[3], hi: r[4],
           vorp: r[5], padd: r[6], pos: r[7], role: r[8], poss: r[9] };
}
function bpmMeta(cid) { return (DB.bpmMeta || {})[cid] || null; }

/* Rank, plus the band of players whose own interval overlaps this one. Reporting
   "6th" alone would claim a precision the sample does not support. */
let BPM_ORDER = {};
function bpmOrder(cid) {
  if (BPM_ORDER[cid]) return BPM_ORDER[cid];
  const c = (DB.bpm || {})[cid] || {};
  const list = Object.keys(c).map(pid => ({ pid, v: c[pid][0], lo: c[pid][3], hi: c[pid][4] }));
  list.sort((a, b) => b.v - a.v);
  list.forEach((x, i) => { x.rank = i + 1; });
  return (BPM_ORDER[cid] = list);
}
function bpmStanding(cid, pid) {
  const list = bpmOrder(cid);
  const me = list.find(x => x.pid === pid);
  if (!me) return null;
  const tied = list.filter(x => x.lo <= me.hi && x.hi >= me.lo);
  return { rank: me.rank, n: list.length,
           from: Math.min.apply(null, tied.map(x => x.rank)),
           to: Math.max.apply(null, tied.map(x => x.rank)) };
}

/* One entry per competition the player has a rating in, grouped by tier. */
function bpmTiers(pid) {
  const groups = {};
  (CAREER[pid] || []).forEach(r => {
    const row = bpmRow(r.c.id, pid);
    if (!row) return;
    const k = tierKey(r.c);
    const t = groups[k] || (groups[k] = { key: k, label: tierLabelFromKey(k), rows: [] });
    t.rows.push({ c: r.c, b: row, meta: bpmMeta(r.c.id) });
  });
  const out = Object.values(groups);
  out.forEach(t => {
    t.rows.sort((a, b) => (b.c.year || 0) - (a.c.year || 0));
    t.poss = t.rows.reduce((s, x) => s + x.b.poss, 0);
    const wa = f => t.rows.reduce((s, x) => s + x.b[f] * x.b.poss, 0) / t.poss;
    t.bpm = wa('bpm'); t.obpm = wa('obpm'); t.dbpm = wa('dbpm');
    // independent competitions, so the pooled interval is the weighted
    // combination of their variances — it narrows, it does not just average
    const half = t.rows.map(x => (x.b.hi - x.b.lo) / 2);
    const varw = t.rows.reduce((s, x, i) => s + Math.pow(half[i] * x.b.poss, 2), 0);
    const h = Math.sqrt(varw) / t.poss;
    t.lo = t.bpm - h; t.hi = t.bpm + h;
    t.vorp = t.rows.reduce((s, x) => s + x.b.vorp, 0);
    t.padd = t.rows.reduce((s, x) => s + x.b.padd, 0);
    t.lastYear = Math.max.apply(null, t.rows.map(x => x.c.year || 0));
  });
  out.sort((a, b) => b.poss - a.poss);
  return out;
}

const bpmFmt = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);

/* A point estimate sitting inside its 80% interval, all on one shared scale. */
function bpmBar(lo, hi, v, span) {
  const s = span || 20;
  const x = q => Math.max(0, Math.min(100, (q + s) / (2 * s) * 100));
  const ticks = [-10, 10].map(t => `<div class="bpm-tick" style="left:${x(t)}%"></div>`).join('');
  return `<div class="bpm-track" data-imtip="80% of resamples of this player's own games land between ${bpmFmt(lo)} and ${bpmFmt(hi)}. The scale runs −${s} to +${s}; the centre line is the competition average.">
    ${ticks}<div class="bpm-zero"></div>
    <div class="bpm-span ${v >= 0 ? '' : 'dn'}" style="left:${x(lo)}%;width:${Math.max(0.8, x(hi) - x(lo))}%"></div>
    <div class="bpm-pt ${v >= 0 ? 'up' : 'dn'}" style="left:calc(${x(v)}% - 1.5px)"></div>
  </div>`;
}

/* The competition's whole field, one dot per player, with this one marked. */
function bpmField(cid, pid) {
  const list = bpmOrder(cid);
  if (list.length < 8) return '';
  const lo = -26, hi = 26, H = 96, D = 9;
  const bins = {};
  let dots = '';
  list.slice().sort((a, b) => a.v - b.v).forEach(x => {
    const b = Math.round(x.v);
    const n = (bins[b] = (bins[b] || 0) + 1);
    const left = Math.max(0, Math.min(100, (x.v - lo) / (hi - lo) * 100));
    const top = H - 12 - (n - 1) * (D - 1);
    const me = x.pid === pid;
    dots += `<div class="bpm-dot${me ? ' me' : (x.v >= 0 ? '' : ' lo')}" style="left:${left}%;top:${top}px"
      data-imtip="${esc(personName(x.pid))}\n${bpmFmt(x.v)} BPM · ${bpmFmt(x.lo)} to ${bpmFmt(x.hi)}"></div>`;
  });
  let ax = '';
  for (let v = -25; v <= 25; v += 5) {
    const left = (v - lo) / (hi - lo) * 100;
    ax += `<div class="bpm-ax-g" style="left:${left}%"></div><div class="bpm-ax-t" style="left:${left}%">${v > 0 ? '+' : ''}${v}</div>`;
  }
  return `<div class="bpm-field"><div class="bpm-dots" style="height:${H}px">${dots}</div>
    <div class="bpm-axis">${ax}</div></div>`;
}

/* The whole field of one competition, ranked. The dot plot shows the shape of
   the distribution; this shows who is in it. Rank follows whichever column is
   being ranked by, because "best season" by rate and by volume are different
   questions and a player can be sixth on one and first on the other. */
function bpmLadder(cid, pid) {
  const c = (DB.bpm || {})[cid] || {};
  const comp = COMP_BY_ID[cid];
  const teamOf = {};
  (comp.players || []).forEach(p => { if (p.team) teamOf[p.pid] = p.team; });

  const byVorp = BPMV.sort === 'vorp';
  const list = Object.keys(c).map(q => Object.assign({ pid: q }, bpmRow(cid, q)));
  if (list.length < 4) return '';
  list.sort((a, b) => (byVorp ? b.vorp - a.vorp : b.bpm - a.bpm) || b.poss - a.poss);
  list.forEach((x, i) => { x.rank = i + 1; });
  const mine = list.findIndex(x => x.pid === pid);

  // Show the top of the table and the player's own neighbourhood; a 60-name list
  // that buries him in the middle answers neither question.
  const TOP = 10, NEAR = 2;
  let idx;
  if (BPMV.full || list.length <= TOP + 8 || mine < 0) {
    idx = list.map((x, i) => i);
  } else if (mine < TOP + NEAR) {
    idx = list.slice(0, TOP + NEAR + 1).map((x, i) => i);
  } else {
    const near = [];
    for (let i = Math.max(TOP, mine - NEAR); i <= Math.min(list.length - 1, mine + NEAR); i++) near.push(i);
    idx = list.slice(0, TOP).map((x, i) => i).concat([-1], near);
  }
  const hidden = list.length - idx.filter(i => i >= 0).length;

  const rows = idx.map(i => {
    if (i < 0) {
      return `<tr class="bpm-gap"><td colspan="6">${hidden.toLocaleString()} more player${hidden === 1 ? '' : 's'}</td></tr>`;
    }
    const x = list[i], me = x.pid === pid;
    return `<tr class="${me ? 'bpm-me' : ''}">
      <td class="bpm-rk">${x.rank}</td>
      <td class="left">${me ? `<b>${esc(personName(x.pid))}</b>` : `<a href="#/p/${x.pid}">${esc(personName(x.pid))}</a>`}
        ${teamOf[x.pid] ? `<div class="p-team">${esc(teamOf[x.pid])}</div>` : ''}</td>
      <td class="bpm-num ${x.bpm >= 0 ? 'up' : 'dn'}">${bpmFmt(x.bpm)}</td>
      <td class="bpm-cell">${bpmBar(x.lo, x.hi, x.bpm, 20)}</td>
      <td>${x.vorp.toFixed(2)}</td>
      <td style="padding-right:20px;">${x.padd >= 0 ? '+' : '−'}${Math.abs(Math.round(x.padd))}</td>
    </tr>`;
  }).join('');

  const sortChip = (k, l, tip) =>
    `<button class="chip chip-sm ${BPMV.sort === k ? 'chip-on' : ''}" data-bpmsort="${k}"${tip}>${l}</button>`;

  return `<div class="card">
    <div class="card-head">Full ranking — ${esc(comp.label || comp.name)}
      <span class="hint">${list.length.toLocaleString()} rated players</span></div>
    <div class="bpm-ctl">
      <span class="bpm-ctl-l">Rank by</span>
      ${sortChip('bpm', 'BPM', ' data-imtip="Points per 100 possessions above an average player in this competition. A rate: it does not care how long he was on the floor."')}
      ${sortChip('vorp', 'VORP', ' data-imtip="Value over replacement — the rate turned into a volume, so a good player who played every minute outranks a slightly better one who played half of them."')}
    </div>
    <div class="table-scroll"><table>
      <thead><tr><th class="nosort bpm-rk">#</th><th class="left nosort">Player</th>
        <th class="nosort"${gloss('BPM')}>BPM</th>
        <th class="left nosort" style="min-width:180px;">80% interval</th>
        <th class="nosort"${gloss('VORP')}>VORP</th>
        <th class="nosort" style="padding-right:20px;"${gloss('PTS ADDED')}>Pts added</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${hidden > 0 ? `<div class="foot"><span>Showing ${idx.filter(i => i >= 0).length} of ${list.length}</span>
      <button class="chip" data-bpmfull="1">Show every rated player ↓</button></div>` : ''}
    <div class="note">Ranked on a single competition — pooling ratings across competitions would be
      comparing players against different fields. The intervals are wide enough that most neighbouring
      rows cannot be told apart; the order inside an overlapping run is not a finding.</div>
  </div>`;
}

function playerBpm(pid, tiers) {
  const ts = bpmTiers(pid);
  if (!ts.length) {
    return `<div class="card"><div class="empty-row"><span class="empty-dot"></span>
      No rating: BPM needs box scores, and this player has none in any competition that publishes them.</div></div>`;
  }
  // open on whatever tier the rest of the profile is showing, so switching tabs
  // does not silently change which competition you are looking at
  const hero = heroTierFor(pid, tiers);
  const key = (BPMV.tier && ts.some(t => t.key === BPMV.tier)) ? BPMV.tier
            : (ts.some(t => t.key === hero) ? hero : ts[0].key);
  const t = ts.find(x => x.key === key);
  // Which competition inside the tier the field, the standing and the ranking are
  // about. Default to the one he played most of; a tier is several seasons and
  // each has its own field, so the choice has to be the reader's.
  const big = t.rows.find(x => x.c.id === BPMV.cid)
           || t.rows.slice().sort((a, b) => b.b.poss - a.b.poss)[0];
  const st = bpmStanding(big.c.id, pid);
  const meta = big.meta || {};

  // year alone unless two competitions in this tier share one
  const yrs = {};
  t.rows.forEach(x => { yrs[x.c.year] = (yrs[x.c.year] || 0) + 1; });
  const seasonLabel = x => (x.c.year && yrs[x.c.year] === 1)
    ? String(x.c.year) : (x.c.label || x.c.name);
  const seasons = t.rows.length > 1 ? `<div class="bpm-ctl">
    <span class="bpm-ctl-l">Season</span>
    ${t.rows.map(x => `<button class="chip chip-sm ${x.c.id === big.c.id ? 'chip-on' : ''}" data-bpmcomp="${esc(x.c.id)}">
      ${esc(seasonLabel(x))} <em>${bpmFmt(x.b.bpm)}</em></button>`).join('')}
  </div>` : '';

  const chips = ts.length > 1 ? `<div class="chip-row" style="margin-bottom:14px;">
    ${ts.map(x => `<button class="chip ${x.key === key ? 'chip-on' : ''}" data-bpmtier="${esc(x.key)}">
      ${esc(tierShort(x.key))} <em>${bpmFmt(x.bpm)}</em></button>`).join('')}</div>` : '';

  const head = `<div class="card">
    <div class="card-head">${esc(t.label)}
      <span class="hint">${t.rows.length} competition${t.rows.length === 1 ? '' : 's'} · ${Math.round(t.poss).toLocaleString()} possessions on court</span></div>
    <div class="bpm-hero">
      <div class="bpm-hero-main">
        <div class="bpm-big ${t.bpm >= 0 ? 'up' : 'dn'}">${bpmFmt(t.bpm)}</div>
        <div class="bpm-lab">BPM · points per 100 possessions<br>against an average player in this tier</div>
        <div class="bpm-ci" data-imtip="80% bootstrap interval, resampling this player's own games. Eight in ten resamples of his season land inside it.">${bpmFmt(t.lo)} to ${bpmFmt(t.hi)} <span>80% interval</span></div>
      </div>
      <div class="bpm-hero-side">
        <div><div class="bpm-v ${t.obpm >= 0 ? 'up' : 'dn'}">${bpmFmt(t.obpm)}</div><div class="bpm-l">OBPM</div></div>
        <div><div class="bpm-v ${t.dbpm >= 0 ? 'up' : 'dn'}">${bpmFmt(t.dbpm)}</div><div class="bpm-l">DBPM</div></div>
        <div><div class="bpm-v">${t.vorp.toFixed(2)}</div><div class="bpm-l" data-imtip="Value over replacement: (BPM + 2.0) × his share of his team's minutes. A rate becomes a volume.">VORP</div></div>
        <div><div class="bpm-v">${t.padd >= 0 ? '+' : '−'}${Math.abs(Math.round(t.padd))}</div><div class="bpm-l" data-imtip="BPM × possessions ÷ 100 — points he added over an average player across every possession he was on the floor for.">PTS ADDED</div></div>
      </div>
    </div>
    ${seasons}
    ${st ? `<div class="bpm-stand">
      <b>${st.rank}${ord(st.rank)} of ${st.n}</b> in ${esc(big.c.label || big.c.name)} —
      but his interval overlaps everyone from <b>${st.from}${ord(st.from)}</b> to <b>${st.to}${ord(st.to)}</b>,
      so the ranking inside that band is not something ${meta.n || st.n} players over a short competition can settle.
    </div>` : ''}
    ${bpmField(big.c.id, pid)}
    <div class="note">One dot per rated player in ${esc(big.c.label || big.c.name)}; this player is the filled one.
      A rating exists for everyone who played at least ${meta.thr || 2} games and 40 possessions.</div>
  </div>`;

  const span = 20;
  const rows = t.rows.map(x => {
    const s = bpmStanding(x.c.id, pid);
    const m = x.meta || {};
    const noisy = (m.sos || 0) >= 10;
    return `<tr>
      <td class="left"><a href="#/c/${x.c.id}/players">${esc(x.c.label || x.c.name)}</a>
        <div class="p-team">${x.c.year || ''} · ${Math.round(x.b.poss)} poss · position ${x.b.pos.toFixed(1)} · role ${x.b.role.toFixed(1)}${
          noisy ? ` · <span class="bpm-flag" data-imtip="Teams in this competition faced very unequal opposition (median schedule adjustment ${m.sos} points per 100). The schedule adjustment is doing a lot of work here, so these ratings are softer than elsewhere.">uneven schedule</span>` : ''}</div></td>
      <td class="bpm-num ${x.b.bpm >= 0 ? 'up' : 'dn'}">${bpmFmt(x.b.bpm)}</td>
      <td class="bpm-cell">${bpmBar(x.b.lo, x.b.hi, x.b.bpm, span)}
        <div class="bpm-range">${bpmFmt(x.b.lo)} to ${bpmFmt(x.b.hi)}</div></td>
      <td>${bpmFmt(x.b.obpm)}</td><td>${bpmFmt(x.b.dbpm)}</td>
      <td>${s ? s.rank + ord(s.rank) + ' / ' + s.n : '—'}</td>
      <td>${x.b.vorp.toFixed(2)}</td>
      <td style="padding-right:20px;">${x.b.padd >= 0 ? '+' : '−'}${Math.abs(Math.round(x.b.padd))}</td>
    </tr>`;
  }).join('');

  const table = `<div class="card">
    <div class="card-head">Competition by competition<span class="hint">every rating belongs to one competition; the bars share one scale</span></div>
    <div class="table-scroll"><table>
      <thead><tr><th class="left nosort">Competition</th>
        <th class="nosort"${gloss('BPM')}>BPM</th>
        <th class="left nosort" style="min-width:180px;">80% interval</th>
        <th class="nosort"${gloss('OBPM')}>OBPM</th><th class="nosort"${gloss('DBPM')}>DBPM</th>
        <th class="nosort">Rank</th><th class="nosort"${gloss('VORP')}>VORP</th>
        <th class="nosort" style="padding-right:20px;"${gloss('PTS ADDED')}>Pts added</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="note">League context for ${esc(big.c.label || big.c.name)}: ${meta.lgortg || '—'} points per 100 possessions,
      ${meta.pace || '—'} possessions per 40 minutes, ${meta.ptstsa || '—'} points per true-shot attempt.
      Those three numbers are what "average" means here, and they are not the same in any two competitions.</div>
  </div>`;

  return `<div class="bpm-tab">${chips}${head}${bpmLadder(big.c.id, pid)}${table}${bpmMethod()}</div>`;
}

function ord(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function leadK() { const m = DB.onoffMeta || {}; return m.k ? Math.round(m.k * 100) + '%' : 'about half'; }
function leadShare() {
  const m = DB.onoffMeta || {};
  let n = 0; COMPS.forEach(c => c.games.forEach(g => { if (g.st === 'COMPLETE') n++; }));
  return n && m.games ? Math.round(Math.min(1, m.games / n) * 100) + '%' : 'most';
}
function bpmMethod() {
  return `<div class="card">
    <div class="card-head">How this is built, and what it is worth</div>
    <div class="pad">
      <p class="bpm-p"><strong>BPM 2.0</strong> (Daniel Myers, basketball-reference.com/about/bpm2.html) turns a box score
        into points per 100 possessions above an average player, after allowing for what the player is asked to do.
        Possessions come from the standard estimate, computed per game and summed. A player's position and offensive role
        are read off his own share of his team's rebounds, assists, steals, fouls, blocks and scoring — blended with a
        listed position wherever the database has one for him. The team's players are then shifted by one constant until
        their minute-weighted ratings add up to what the team actually did, which is why the identity
        <span class="bpm-code">Σ(BPM × minute share) × 5 = team rating</span> holds exactly for every team here.</p>
      <p class="bpm-p"><strong>Three departures from the published recipe</strong>, each measured rather than assumed.
        The team rating used in that last step is <em>schedule-adjusted</em> — solved from every game in the competition,
        so a team that dominated a soft group is not paid for it; across the database that moves a player by about
        0.9 points, and by a lot more in the few competitions flagged above. The points-context baseline is this
        competition's own points per true-shot attempt, because the constant the original regression used is not
        published; shifting that baseline by a large 0.10 moves a final rating by a median of 0.34.</p>
      <p class="bpm-p"><strong>The lead adjustment</strong> is the published one, now measured rather than guessed. Teams play about
        0.35 points per 100 worse for every point they lead by, so a side that spent its games far ahead is rated as though it had
        kept pushing: the team rating the players must add up to gains 0.175 × its <em>average lead</em>. That lead is read off the
        play-by-play — the score margin, weighted by the time it stood — wherever the feed exists, which is ${esc(leadShare())}
        of completed games; elsewhere it is estimated from the final margin (on this database the average lead runs at
        ${esc(leadK())} of the final margin). It moves a team's rating by a median of 1.3 points and a player's BPM by a
        median of 0.26, most in the lopsided tournaments.</p>
      <p class="bpm-p"><strong>The coefficients were fitted to the NBA, and that turns out not to be the problem.</strong>
        Every box score line in this database carries a measured plus/minus — 48,988 of them. Against that,
        BPM correlates 0.29 with a player's own plus/minus per 100 relative to his team; coefficients refitted on this
        database and tested out of sample reach 0.31. Re-fitting buys almost nothing, so the published coefficients are
        kept: they are standard, documented, and comparable with every other site that reports BPM.</p>
      <p class="bpm-p"><strong>The sample is the problem.</strong> Split a player's games into odd and even and the two
        halves of his own plus/minus correlate 0.51 — the measurement itself is only about two-thirds reliable at full
        length. That is why every rating here carries its interval, and why the standing above is given as a band. A
        seven-game tournament cannot tell sixth from third. Read BPM as a bracket, not a position.</p>
    </div>
  </div>`;
}
