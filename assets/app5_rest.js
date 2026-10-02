/* ---------------------------- Leaders ---------------------------- */
/* Leaders for one phase (regular season or playoffs), from the box-score lines — the
   source publishes its boards for the whole season only. Same categories as the
   published boards, except second-chance points (not in a box score). Averages and
   percentages need a qualifying sample, stated on the page. */
function phaseLeaders(c, ph) {
  const L = phaseLines(c, ph);
  const maxG = Math.max(0, ...L.map(p => p.g || 0));
  const minG = Math.max(1, Math.ceil(maxG / 2));
  const q = p => (p.g || 0) >= minG;
  const pgv = k => p => q(p) && p.g ? p[k] / p.g : null;
  const pct = (m, a, per) => p => q(p) && (p[a] || 0) >= per * (p.g || 0) && p[a] ? p[m] / p[a] * 100 : null;
  const cats = [['Efficiency', p => p.eff], ['Field goal percentage', pct('fgm', 'fga', 2)], ['Free throw percentage', pct('ftm', 'fta', 1)],
    ['3 Point percentage', pct('tpm', 'tpa', 1)], ['2 Points percentage', pct('twopm', 'twopa', 2)],
    ['Points', p => p.pts], ['Average points', pgv('pts')], ['Assists', p => p.ast], ['Average assists', pgv('ast')],
    ['Total rebounds', p => p.reb], ['Average total rebounds', pgv('reb')], ['Blocks', p => p.blk], ['Average blocks', pgv('blk')],
    ['Steals', p => p.stl], ['Average steals', pgv('stl')], ['Turnovers', p => p.tov], ['Average turnovers', pgv('tov')]];
  return { minG, boards: cats.map(([cat, f]) => ({ cat, rows: L.map(p => ({ pid: p.pid, v: f(p), team: p.team }))
    .filter(r => r.v != null && isFinite(r.v)).sort((a, b) => b.v - a.v).slice(0, 10)
    .map(r => ({ pid: r.pid, team: r.team, v: Math.round(r.v * 10) / 10 })) })).filter(b => b.rows.length) };
}
function renderLeaders(cid) {
  const c = COMP_BY_ID[cid];
  if (!c.leaders.length) return page(c, 'Leaders', `<div class="card"><div class="empty-row"><span class="empty-dot"></span>The source publishes no leaders board for this competition.</div></div>`);
  const teamOf = {}; c.players.forEach(p => { teamOf[p.pid] = p.team || ''; });
  const ph = phaseOf(c);
  if (ph !== 'all') {
    const { minG, boards } = phaseLeaders(c, ph);
    return page(c, 'Leaders', `<div class="phase-bar">${phaseSeg(c)}<span class="phase-note">${ph === 'rs' ? 'Regular season' : 'Playoffs'} leaders, from the box scores</span></div>
      <div class="lead-grid">
        ${boards.map(b => `<div class="lead-card">
          <div class="lead-head">${esc(b.cat)}<span>Top ${b.rows.length}</span></div>
          ${b.rows.map((r, i) => `<div class="lead-row">
            <div class="lead-rank">${i + 1}</div>
            <div style="flex:1;min-width:0;"><div class="lead-name">${personLink(r.pid)}</div><div class="lead-team">${esc(r.team || '')}</div></div>
            <div class="lead-val">${Number.isInteger(r.v) ? r.v : r.v.toFixed(1)}</div>
          </div>`).join('')}
        </div>`).join('')}
      </div>
      <div class="note" style="border-top:none;padding-top:16px;">The source publishes its leaders boards for the whole season only, so these are computed from the ${ph === 'rs' ? 'regular-season' : 'playoff'} box scores. Averages and percentages need at least ${minG} game${minG > 1 ? 's' : ''} (half the most anyone played); a percentage also needs 2 attempts a game (FG, 2P) or 1 a game (3P, FT). Second-chance points are not in a box score, so that board is left out. <em>All games</em> shows the published boards.</div>`);
  }
  return page(c, 'Leaders', `${c.split ? `<div class="phase-bar">${phaseSeg(c)}<span class="phase-note">The source's published boards, every game</span></div>` : ''}
    <div class="lead-grid">
      ${c.leaders.map(b => `<div class="lead-card">
        <div class="lead-head">${esc(b.cat)}<span>Top ${b.rows.length}</span></div>
        ${b.rows.map((r, i) => `<div class="lead-row">
          <div class="lead-rank">${i + 1}</div>
          <div style="flex:1;min-width:0;">
            <div class="lead-name">${personLink(r.pid)}</div>
            <div class="lead-team">${esc(teamOf[r.pid] || '')}</div>
          </div>
          <div class="lead-val">${has(r.v) ? (typeof r.v === 'number' ? (Number.isInteger(r.v) ? r.v : r.v.toFixed(1)) : r.v) : '—'}</div>
        </div>`).join('')}
      </div>`).join('')}
    </div>
    <div class="note" style="border-top:none;padding-top:16px;">Leaders boards exactly as published by this competition's own leaders page — ${c.leaders.length} categories. Player names link to that player's full career across every competition in this database.</div>`);
}

/* ---------------------------- Box score ---------------------------- */
const BOX_COLS = [['min', 'MIN'], ['pts', 'PTS'], ['fg', 'FG'], ['tp', '3P'], ['ft', 'FT'],
  ['oreb', 'OR'], ['dreb', 'DR'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'],
  ['blk', 'BLK'], ['tov', 'TOV'], ['pf', 'PF'], ['pm', '+/-'], ['eff', 'EFF']];

// The source's box score publishes offensive and defensive rebounds separately;
// the REB column is their sum, not a separate published figure.
function boxReb(l) {
  if (!has(l.oreb) && !has(l.dreb)) return null;
  return (l.oreb || 0) + (l.dreb || 0);
}
function boxCell(l, k) {
  if (k === 'reb') return fmt0(boxReb(l));
  if (k === 'fg') return has(l.fgm) ? l.fgm + '/' + l.fga : '—';
  if (k === 'tp') return has(l.tpm) ? l.tpm + '/' + l.tpa : '—';
  if (k === 'ft') return has(l.ftm) ? l.ftm + '/' + l.fta : '—';
  if (k === 'min') return has(l.min) ? esc(l.min) : '—';
  if (k === 'pm') return fmtPM(l.pm);
  return fmt0(l[k]);
}
function boxTable(title, teamName, lines) {
  if (!lines.length) return '';
  const tot = {};
  ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'eff']
    .forEach(k => { tot[k] = lines.reduce((a, l) => a + (has(l[k]) ? Number(l[k]) : 0), 0); });
  return `<div class="card">
    <div class="card-head">${crest(teamName, 22)} ${esc(teamName)}</div>
    <div class="table-scroll sticky-first"><table>
      <thead><tr><th class="left nosort">Player</th>${BOX_COLS.map(([k, l], i) => `<th class="nosort" ${i === BOX_COLS.length - 1 ? 'style="padding-right:20px;"' : ''}${gloss(l)}>${l}</th>`).join('')}</tr></thead>
      <tbody>
        ${lines.map(l => `<tr class="clickable" ${l.pid ? `onclick="location.hash='#/p/${l.pid}'" style="cursor:pointer;"` : ''}>
          <td class="left"><div class="player-cell">${has(l.num) && l.num !== '' ? `<span class="num-pill">#${esc(l.num)}</span>` : ''}<span class="p-name">${esc(l.name || (l.pid ? personName(l.pid) : '—'))}</span>${l.starter ? '<span style="color:var(--accent);font-weight:700;font-size:10px;">★</span>' : ''}</div></td>
          ${BOX_COLS.map(([k], i) => `<td class="${k === 'pts' ? 'lead' : ''} ${k === 'pm' && has(l.pm) ? (l.pm > 0 ? 'pm-pos' : (l.pm < 0 ? 'pm-neg' : '')) : ''}" ${i === BOX_COLS.length - 1 ? 'style="padding-right:20px;"' : ''}>${boxCell(l, k)}</td>`).join('')}
        </tr>`).join('')}
        <tr class="totals"><td class="left">Team totals</td>
          ${BOX_COLS.map(([k], i) => `<td ${i === BOX_COLS.length - 1 ? 'style="padding-right:20px;"' : ''}>${k === 'min' || k === 'pm' ? '' : boxCell(tot, k)}</td>`).join('')}
        </tr>
      </tbody>
    </table></div>
  </div>`;
}

function renderBox(cid, mid) {
  const c = COMP_BY_ID[cid];
  const g = c && c.games.find(x => x.mid === mid);
  const b = getBox(mid);
  if (!g) return `<div class="page"><div class="card"><div class="note" style="border-top:none;">Game not found.</div></div></div>`;
  const head = matchHead(cid, mid, 'box');

  if (!b || !b.p || !b.p.length) {
    return head + `<div class="card"><div class="empty-row"><span class="empty-dot"></span>${g.box ? 'The source publishes a detailed statistics page for this game, but no per-player box score could be read from it.' : 'The source publishes no per-player box score for this game.'}</div></div></div>`;
  }
  const homeLines = b.p.filter(l => l.team === g.h);
  const awayLines = b.p.filter(l => l.team === g.a);
  const other = b.p.filter(l => l.team !== g.h && l.team !== g.a);
  return head +
    boxTable('Home', g.h, homeLines) +
    boxTable('Away', g.a, awayLines) +
    (other.length ? boxTable('Other', other[0].team || '—', other) : '') +
    `<div class="card"><div class="note" style="border-top:none;">Per-player box score exactly as published on this game's detailed statistics page. ★ marks a starter where the source flags one. Team totals are the sum of the published player lines. Click any player for their full career across every competition.</div></div>
  </div>`;
}

/* ---------------------------- interactions ---------------------------- */
// In-page state changes (expanding a tier, switching stat mode) re-render
// through the router but must not throw the reader back to the top.
/* A busy month can run past the strip's right edge; after a re-render the
   selected day has to be brought back into view or an arrow click looks like
   it did nothing. inline only — the page must not jump vertically. */
function gDayIntoView() {
  const el = document.querySelector('.gday.on');
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function softRoute() {
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}

document.addEventListener('click', e => {
  const th = e.target.closest('[data-theme-toggle]');
  if (th) {
    const root = document.documentElement;
    const dark = root.getAttribute('data-theme') === 'dark'
      || (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('hsmy-theme', next); } catch (err) {}
    return;
  }
  const tm = e.target.closest('[data-tmode]');
  if (tm) { PROFILE.statMode = tm.dataset.tmode; softRoute(); return; }
  const phb = e.target.closest('[data-phase]');
  if (phb) { PHASE[phb.dataset.phasecid] = phb.dataset.phase; softRoute(); return; }
  const am = e.target.closest('[data-amode]');
  if (am) { PROFILE.advMode = am.dataset.amode; softRoute(); return; }
  // team page: appearance filters (division, squad)
  const tps = e.target.closest('[data-tpsex],[data-tpsq]');
  if (tps) {
    if (tps.dataset.tpsex) TEAMPG.sex = tps.dataset.tpsex;
    if (tps.dataset.tpsq) TEAMPG.sq = tps.dataset.tpsq;
    softRoute(); return;
  }

  // Play-by-play period filter — a pure visibility toggle, no re-render
  const pp = e.target.closest('[data-pbpper]');
  if (pp) {
    const box = pp.closest('.pbp-card');
    if (box) {
      box.querySelector('.pbpx').dataset.per = pp.dataset.pbpper;
      box.querySelectorAll('.pbp-tab').forEach(t => t.classList.toggle('on', t === pp));
    }
    return;
  }

  const to = e.target.closest('[data-tieropen]');
  if (to) {
    const k = 'tier:' + to.dataset.tieropen;
    PROFILE.openLog = (PROFILE.openLog === k) ? '' : k;
    softRoute(); return;
  }
  const lt = e.target.closest('[data-logtier]');
  if (lt) { PROFILE.logTier = lt.dataset.logtier; softRoute(); return; }

  const gd = e.target.closest('[data-gday]');
  if (gd) {
    if (!gd.dataset.gday) return;
    GAMES.day = gd.dataset.gday; softRoute(); gDayIntoView(); return;
  }
  if (e.target.closest('[data-ghide]')) { GAMES.hide = !GAMES.hide; softRoute(); return; }
  const fj = e.target.closest('[data-fxjump]');
  if (fj) {
    const sec = document.querySelector(`[data-fxsec="${fj.dataset.fxjump}"]`);
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const bt = e.target.closest('[data-bpmtier]');
  // a new tier is a different set of seasons, so the season choice cannot carry over
  if (bt) { BPMV.tier = bt.dataset.bpmtier; BPMV.cid = null; BPMV.full = false; softRoute(); return; }
  const bc = e.target.closest('[data-bpmcomp]');
  if (bc) { BPMV.cid = bc.dataset.bpmcomp; BPMV.full = false; softRoute(); return; }
  const bs = e.target.closest('[data-bpmsort]');
  if (bs) { BPMV.sort = bs.dataset.bpmsort; softRoute(); return; }
  if (e.target.closest('[data-bpmfull]')) { BPMV.full = true; softRoute(); return; }
  const dop = e.target.closest('[data-detopen]');
  if (dop) {
    const k = dop.dataset.detopen;
    PROFILE.openDetail = (PROFILE.openDetail === k) ? '' : k;
    softRoute(); return;
  }
  const lo = e.target.closest('[data-logopen]');
  if (lo) {
    const id = lo.dataset.logopen;
    PROFILE.openLog = (PROFILE.openLog === id) ? '' : id;
    softRoute(); return;
  }

  const im = e.target.closest('[data-immetric]');
  if (im) { IMPACT.metric = im.dataset.immetric; softRoute(); return; }
  const ix = e.target.closest('[data-imexpand]');
  if (ix) {
    const k = ix.dataset.imexpand;
    IMPACT.expand = (IMPACT.expand === k) ? null : k;
    softRoute(); return;
  }
  const cf = e.target.closest('[data-cmpfield]');
  if (cf) { COMPARE.field = cf.dataset.cmpfield; COMPARE.ed = ''; softRoute(); return; }
  const ce = e.target.closest('[data-cmped]');
  if (ce) { COMPARE.ed = ce.dataset.cmped; softRoute(); return; }
  const cpp = e.target.closest('[data-cmpper]');
  if (cpp) { COMPARE.per = cpp.dataset.cmpper; softRoute(); return; }
  const cm = e.target.closest('[data-cmpmode]');
  if (cm) { COMPARE.mode = cm.dataset.cmpmode; softRoute(); return; }
  const csw = e.target.closest('[data-cmpswap]');
  if (csw) { location.hash = '#/compare/' + COMPARE.b + '/' + COMPARE.a; return; }
  const cx = e.target.closest('[data-cmpclear]');
  if (cx) {
    const keep = cx.dataset.cmpclear === 'a' ? COMPARE.b : COMPARE.a;
    location.hash = cx.dataset.cmpclear === 'a' ? '#/compare//' + keep : '#/compare/' + keep;
    return;
  }
  const cr = e.target.closest('[data-cmppick]');
  if (cr) {
    const [sd, pid] = cr.dataset.cmppick.split('|');
    const a = sd === 'a' ? pid : COMPARE.a, b = sd === 'a' ? COMPARE.b : pid;
    location.hash = '#/compare/' + (a || '') + (b ? '/' + b : '');
    return;
  }

  const rt = e.target.closest('[data-rdtier]');
  if (rt) { PROFILE.heroTier = rt.dataset.rdtier; IMPACT.rdEd = ''; IMPACT.rdCmp = ''; softRoute(); return; }
  const re = e.target.closest('[data-rded]');
  if (re) {
    const k = re.dataset.rded;
    IMPACT.rdEd = (IMPACT.rdEd === k) ? '' : k;
    if (IMPACT.rdCmp === 'ed~' + IMPACT.rdEd) IMPACT.rdCmp = '';
    softRoute(); return;
  }

  const it = e.target.closest('[data-imtable]');
  if (it) { IMPACT.table = !IMPACT.table; softRoute(); return; }

  const cs = e.target.closest('[data-csort]');
  if (cs) {
    const k = cs.dataset.csort;
    SORT.comp.dir = (SORT.comp.key === k && SORT.comp.dir === 'desc') ? 'asc' : 'desc';
    SORT.comp.key = k;
    const cid = (location.hash.match(/#\/c\/([^\/]+)/) || [])[1];
    if (cid) cpRedraw(cid);
    return;
  }
  const cv = e.target.closest('[data-cpview]');
  if (cv) {
    CPV.view = cv.dataset.cpview; SORT.comp = { key: cpView().sort, dir: 'desc' };
    const cid = (location.hash.match(/#\/c\/([^\/]+)/) || [])[1];
    const el = document.getElementById('players-body');
    if (el && cid) el.innerHTML = compPlayersTable(cid);
    return;
  }
  const gs = e.target.closest('[data-gsort]');
  if (gs) {
    const k = gs.dataset.gsort;
    SORT.glob.dir = (SORT.glob.key === k && SORT.glob.dir === 'desc') ? 'asc' : 'desc';
    SORT.glob.key = k; PAGE.glob = 0;
    const el = document.getElementById('glob-body');
    if (el) el.innerHTML = globTable();
    return;
  }
  const gv = e.target.closest('[data-gview]');
  if (gv) { GVIEW = gv.dataset.gview; PAGE.glob = 0; PAGE.cards = 1; route(); return; }
  const gm = e.target.closest('[data-gmore]');
  if (gm) {
    PAGE.cards += 1;
    const el = document.getElementById('glob-body');
    if (el) el.innerHTML = globCards();
    return;
  }
  const gp = e.target.closest('[data-gpage]');
  if (gp && !gp.disabled) {
    PAGE.glob = Math.max(0, PAGE.glob + (gp.dataset.gpage === 'next' ? 1 : -1));
    const el = document.getElementById('glob-body');
    if (el) { el.innerHTML = globTable(); el.scrollIntoView({ block: 'start' }); }
    return;
  }
});

document.addEventListener('change', e => {
  if (e.target.matches('[data-gmonth]')) {
    const ix = gameIndex();
    GAMES.day = ix.days.find(d => d.slice(0, 7) === e.target.value) || GAMES.day;
    softRoute(); gDayIntoView(); return;
  }
  const f = e.target.closest('[data-filter]');
  if (f) { FILTER[f.dataset.filter] = f.value; route(); return; }
  const tt = e.target.closest('[data-teamcat]');
  if (tt) { TEAMHUB.cat = tt.value; route(); return; }
  const h = e.target.closest('[data-herotier]');
  if (h) { PROFILE.heroTier = h.value; softRoute(); return; }
  const rc = e.target.closest('[data-rdcmp]');
  if (rc) { IMPACT.rdCmp = rc.value; softRoute(); return; }
  const g = e.target.closest('[data-gfilter]');
  if (g) {
    GFILTER[g.dataset.gfilter] = g.value;
    PAGE.glob = 0; PAGE.cards = 1; GLOB_CACHE = null;
    const el = document.getElementById('glob-body');
    if (el) el.innerHTML = GVIEW === 'cards' ? globCards() : globTable();
    const bar = document.getElementById('glob-filters');
    if (bar) bar.outerHTML = globFilterBar();
    return;
  }
});

let qTimer = null;
/* The formulas filter hides rows in place rather than re-rendering: the page is
   one long static list, and a re-render would drop the caret on every keystroke. */
document.addEventListener('input', e => {
  if (e.target.id === 'cp-q') {
    CPV.q = e.target.value;
    const cid = (location.hash.match(/#\/c\/([^\/]+)/) || [])[1];
    if (cid) cpRedraw(cid);
    return;
  }
  if (e.target.id !== 'fx-q') return;
  const q = e.target.value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('.fx').forEach(el => {
    const hit = !q || el.dataset.fxq.indexOf(q) >= 0;
    el.hidden = !hit;
    if (hit) shown++;
  });
  document.querySelectorAll('.fx-sec').forEach(sec => {
    sec.hidden = !sec.querySelector('.fx:not([hidden])');
  });
  const empty = document.getElementById('fx-empty');
  if (empty) empty.hidden = shown > 0;
});

document.addEventListener('input', e => {
  if (e.target.id === 'comp-q') {
    clearTimeout(qTimer);
    const v = e.target.value;
    qTimer = setTimeout(() => {
      FILTER.q = v; route();
      const el = document.getElementById('comp-q');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 220);
  }
  if (e.target.id === 'team-q') {
    clearTimeout(qTimer);
    const v = e.target.value;
    qTimer = setTimeout(() => {
      TEAMHUB.q = v; route();
      const el = document.getElementById('team-q');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 220);
  }
  // both search boxes — the one in the hero and the one in the filter bar —
  // drive the same filter, and redraw only the results so the caret survives
  if (e.target.id === 'glob-q' || e.target.id === 'glob-q-hero') {
    clearTimeout(qTimer);
    const v = e.target.value, other = e.target.id === 'glob-q' ? 'glob-q-hero' : 'glob-q';
    qTimer = setTimeout(() => {
      GFILTER.q = v; PAGE.glob = 0; PAGE.cards = 1;
      const el = document.getElementById('glob-body');
      if (el) el.innerHTML = GVIEW === 'cards' ? globCards() : globTable();
      const o = document.getElementById(other);
      if (o && o.value !== v) o.value = v;
    }, 220);
  }
});

/* post-render work: the Stats pages wire their filters and the Stats menu once the page is in place */
function afterRender() { if (typeof statsAfterRender === 'function') statsAfterRender(); }

window.addEventListener('hashchange', route);
route();

/* ---- chart tooltip -----------------------------------------------------
   One shared element, positioned on hover. Charts carry their text in a
   data-imtip attribute so the markup stays declarative and re-renders freely. */
let IM_TIP_EL = null;
function imTipEl() {
  if (!IM_TIP_EL) {
    IM_TIP_EL = document.createElement('div');
    IM_TIP_EL.className = 'im-tip';
    document.body.appendChild(IM_TIP_EL);
  }
  return IM_TIP_EL;
}
function imTipMove(e, el) {
  const t = imTipEl();
  t.textContent = el.dataset.imtip;
  t.classList.add('on');
  const r = t.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 16;
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
  t.style.left = Math.max(8, x) + 'px';
  t.style.top = Math.max(8, y) + 'px';
}
document.addEventListener('mousemove', e => {
  const el = e.target.closest ? e.target.closest('[data-imtip]') : null;
  if (el) imTipMove(e, el);
  else if (IM_TIP_EL) IM_TIP_EL.classList.remove('on');
});
document.addEventListener('scroll', () => { if (IM_TIP_EL) IM_TIP_EL.classList.remove('on'); }, true);

/* Touch has no hover, so a tap on a read-only header shows the same tooltip —
   otherwise half the audience can never find out what PIR means. Sortable
   headers keep their tap for sorting; a tap anywhere else dismisses. */
document.addEventListener('click', e => {
  const el = e.target.closest ? e.target.closest('th.nosort[data-imtip]') : null;
  if (!el) { if (IM_TIP_EL) IM_TIP_EL.classList.remove('on'); return; }
  const r = el.getBoundingClientRect();
  imTipMove({ clientX: r.left + r.width / 2, clientY: r.bottom }, el);
});

/* ---- compare page: player search ---------------------------------------
   Typing filters the roster in place; re-rendering the whole page on every
   keystroke would throw the caret away. */
document.addEventListener('input', e => {
  const el = e.target.closest && e.target.closest('[data-cmpsearch]');
  if (!el) return;
  const side = el.dataset.cmpsearch;
  const box = document.getElementById('cmp-res-' + side);
  if (!box) return;
  const q = el.value.trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = ''; box.classList.remove('on'); return; }
  const taken = side === 'a' ? COMPARE.b : COMPARE.a;
  const hits = [];
  for (const pid in PERSONS) {
    if (pid === taken) continue;
    if (PERSONS[pid].toLowerCase().indexOf(q) < 0) continue;
    hits.push(pid);
    if (hits.length >= 40) break;
  }
  hits.sort((x, y) => (CAREER[y] || []).length - (CAREER[x] || []).length);
  box.innerHTML = hits.slice(0, 8).map(pid =>
    `<button class="cmp-res" data-cmppick="${side}|${pid}">
       <span class="cmp-res-face">${PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="">` : esc(initials(PERSONS[pid]))}</span>
       <span>${esc(PERSONS[pid])}</span>
       <em>${(CAREER[pid] || []).filter(r => hasStats(r.p)).length} comps</em>
     </button>`).join('') || '<div class="cmp-res-none">No player matches that.</div>';
  box.classList.add('on');
});
