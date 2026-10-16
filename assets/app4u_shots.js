/* =========================================================================
   Shot map — a player profile tab (#/p/<pid>/shots). Three views of the
   same shots: a 3D terrain (height = how often he shoots from a spot,
   colour = his FG% there against the average from the same spot), zones
   (his FG% per zone against the average) and every shot.
   Scope: his whole career, one season, one event of that season, one game.
   The average is always the event's own: every shot he took is set against
   the shots of the event it was taken in, so a career map that mixes a U20
   league with the Agong Cup compares each shot with its own field.
   Data (build_shots.py): stats/sh/<cid>.js holds an event's averages
   (zones and a 0.5 m grid); stats/shp/<pid>.js holds one player's shots in
   every event. DB.shotIdx (the ids of every player with a shot, comma-joined) says
   beforehand who gets the tab; the rest comes with his file.
   ========================================================================= */
const SH_DATA = {}, SH_ST = {}, SHP_DATA = {}, SHP_ST = {};
function SHOTS_PUT(cid, d) {
  SH_DATA[cid] = d;
  d.LG = d.G ? d.G.split(';').map(t => t.split(',').map(Number)).map(([i, j, a, m]) => ({x: i * 0.5 - 7.5 + 0.25, d: j * 0.5 + 0.25, a, m})) : [];
  d.LZ = {}; Object.entries(d.Z).forEach(([k, [a, m]]) => { d.LZ[k] = a ? m / a : 0; });
}
function SHOTP_PUT(pid, d) { SHP_DATA[pid] = d; }
function smLoad(url, key, st, data) {
  if (st[key]) return;
  st[key] = 'loading';
  const s = document.createElement('script');
  s.src = HS.BASE + url;
  const done = ok => { st[key] = ok && data[key] ? 'done' : 'error'; if (/\/(shots|report)$/.test(HS.hash())) softRoute(); };   // the Report tab reads these files too
  s.onload = () => done(true); s.onerror = () => done(false);
  document.head.appendChild(s);
}
const ensureShots = cid => smLoad('stats/sh/' + cid + '.js', cid, SH_ST, SH_DATA);
const ensurePlayerShots = pid => smLoad('stats/shp/' + pid + '.js', pid, SHP_ST, SHP_DATA);
// the events he has shots in, newest first (from his file, once it is loaded)
function smComps(pid) {
  const d = SHP_DATA[pid]; if (!d) return [];
  return Object.keys(d.E).filter(cid => d.E[cid].length && COMP_BY_ID[cid])
    .sort((a, b) => (COMP_BY_ID[b].start || COMP_BY_ID[b].end || '').localeCompare(COMP_BY_ID[a].start || COMP_BY_ID[a].end || ''));
}
let SM_WHO = null;
function smHas(pid) { return (SM_WHO || (SM_WHO = new Set(String(DB.shotIdx || '').split(',')))).has(pid); }
const smCount = (pid, cid) => ((SHP_DATA[pid] || {E: {}}).E[cid] || []).length;
const smYear = cid => String(COMP_BY_ID[cid].year || (COMP_BY_ID[cid].start || '').slice(0, 4));
// a short name for an event ("Agong Cup 2026"); the full name when two of his events would share it
const smShortRaw = cid => { const c = COMP_BY_ID[cid]; return typeof tierLabel === 'function' ? tierLabel(c) + ' ' + smYear(cid) : (c.label || c.name); };
const smShort = cid => { const s = smShortRaw(cid), c = COMP_BY_ID[cid];
  return SM.pid && smComps(SM.pid).some(k => k !== cid && smShortRaw(k) === s) ? (c.label || c.name) : s; };

/* ------------------------------------------------------------ geometry */
const SM_RIM = 1.575;
const SM_ZONES = {PT: 'Paint', MC: 'Mid-range · middle', ML: 'Mid-range · left', MR: 'Mid-range · right',
  C3L: 'Corner 3 · left', C3R: 'Corner 3 · right', W3L: 'Wing 3 · left', W3R: 'Wing 3 · right', T3: 'Top of the arc · 3PT'};
function smZoneOf(x, y, three) {          // same rules as build_shots.py zone()
  const d = y + SM_RIM, side = x < 0 ? 'L' : 'R';
  if (three) { if (d <= 3.13) return 'C3' + side; return Math.abs(x) <= 2.45 ? 'T3' : 'W3' + side; }
  if (Math.abs(x) <= 2.45 && d <= 5.8) return 'PT';
  return Math.abs(x) <= 2.45 ? 'MC' : 'M' + side;
}
function smZoneAt(x, d) {                 // a floor point: beyond the line counts as three
  const y = d - SM_RIM;
  return smZoneOf(x, y, (Math.abs(x) >= 6.6 && d <= 2.99) || (d > 2.99 && Math.hypot(x, y) >= 6.75));
}

/* ------------------------------------------------------------- state */
// scope: 'career' or a season ('2026'); ev: 'all' or one event of the scope; game: 'all' or one game of that event
const SM = {pid: null, scope: 'career', ev: 'all', game: 'all', view: 'terrain', zone: null, surf: null, surfKey: '', Zv: null, lg: {}, mix: null};
try { const v = localStorage.getItem('hs-shotmap-view'); if (v === 'terrain' || v === 'zones' || v === 'shots') SM.view = v; } catch (e) {}
function smScopeComps(pid) {
  const all = smComps(pid);
  const inScope = SM.scope === 'career' ? all : all.filter(cid => smYear(cid) === SM.scope);
  return SM.ev === 'all' ? inScope : inScope.filter(cid => cid === SM.ev);
}
function smAllShots(pid) {
  const d = SHP_DATA[pid]; if (!d) return [];
  const out = [];
  Object.entries(d.E).forEach(([cid, rows]) => rows.forEach(s => out.push({x: s[0], y: s[1], made: s[2], three: s[3], type: d.T[s[4]], mid: d.M[s[5]], per: s[6], cid, z: smZoneOf(s[0], s[1], s[3])})));
  return out;
}
function smShots() {
  const keep = new Set(smScopeComps(SM.pid));
  const all = smAllShots(SM.pid).filter(s => keep.has(s.cid));
  return SM.game === 'all' ? all : all.filter(s => s.mid === SM.game);
}
const smPct = p => (p * 100).toFixed(1) + '%';
const smDiff = d => (d >= 0 ? '+' : '−') + Math.abs(d * 100).toFixed(1) + ' pts';
const smCls = d => d > 0.02 ? 'sm-up' : d < -0.02 ? 'sm-down' : 'sm-even';
const smAvgOf = s => (SH_DATA[s.cid] ? SH_DATA[s.cid].LZ[s.z] : 0) || 0;
/* The average for a zone in the current scope: what an average player would make taking his shots
   there, each from its own event. A zone he has no shots in gets the events' averages, weighted by
   how many of his shots each event holds. */
function smMixLZ(list, cids) {
  const byEv = {}; list.forEach(s => { byEv[s.cid] = (byEv[s.cid] || 0) + 1; });
  const w = cids.map(c => [c, byEv[c] || (list.length ? 0 : 1)]).filter(([c, n]) => n && SH_DATA[c]);
  const tot = w.reduce((t, [, n]) => t + n, 0) || 1;
  const LZ = {};
  Object.keys(SM_ZONES).forEach(z => {
    const zs = list.filter(s => s.z === z);
    LZ[z] = zs.length ? zs.reduce((t, s) => t + smAvgOf(s), 0) / zs.length : w.reduce((t, [c, n]) => t + (SH_DATA[c].LZ[z] || 0) * n, 0) / tot;
  });
  return {LZ, w, tot};
}
function smSummary(list) {
  const byZ = {};
  list.forEach(s => { const z = byZ[s.z] = byZ[s.z] || [0, 0]; z[0]++; z[1] += s.made; });
  const a = list.length, m = list.reduce((t, s) => t + s.made, 0);
  return {byZ, a, m, exp: a ? list.reduce((t, s) => t + smAvgOf(s), 0) / a : 0};
}
// the games of one event he has shots in, with his team's result
function smGames(pid, cid) {
  const d = SHP_DATA[pid]; if (!d || !d.E[cid]) return [];
  const mids = [...new Set(d.E[cid].map(s => d.M[s[5]]))];
  return mids.map(mid => {
    const g = GAME_BY_MID[mid]; if (!g) return {mid, label: mid, date: ''};
    const b = typeof getBox === 'function' ? getBox(mid) : null;
    const row = b && b.p.find(r => r.pid === pid);
    const home = row ? row.team === g.h : true;
    const opp = home ? g.a : g.h, my = home ? g.hs : g.as, their = home ? g.as : g.hs;
    const res = my !== '' && my != null ? (+my > +their ? 'W ' : +my < +their ? 'L ' : '') + my + '–' + their : '';
    return {mid, date: g.date || '', label: (g.date ? fmtDateShort(g.date) : '') + ' v ' + (typeof teamDisplay === 'function' ? teamDisplay(opp) : opp) + (res ? ' · ' + res : '')};
  }).sort((p, q) => p.date.localeCompare(q.date));
}

/* -------------------------------------------------------------- tab */
function smTab(pid) {
  if (!SHP_DATA[pid]) {
    ensurePlayerShots(pid);
    return pvSec('Shot map', '', '', `<div class="card pv-card"><div class="empty-row"><span class="empty-dot"></span>${SHP_ST[pid] === 'error' ? 'The shot chart could not be loaded. Refresh the page to try again.' : 'Loading the shot chart…'}</div></div>`);
  }
  const comps = smComps(pid);
  if (SM.pid !== pid) { SM.pid = pid; SM.scope = 'career'; SM.ev = 'all'; SM.game = 'all'; SM.zone = null; SM.surfKey = ''; }
  const years = [...new Set(comps.map(smYear))].sort().reverse();
  if (SM.scope !== 'career' && years.indexOf(SM.scope) < 0) SM.scope = 'career';
  const scopeAll = SM.scope === 'career' ? comps : comps.filter(c => smYear(c) === SM.scope);
  if (SM.ev !== 'all' && scopeAll.indexOf(SM.ev) < 0) SM.ev = 'all';
  const cids = smScopeComps(pid);
  // everything this view needs: his shots and the averages of each event in it
  const missing = cids.filter(c => !SH_DATA[c]).length;
  const nOf = list => list.reduce((t, c) => t + smCount(pid, c), 0);
  const scopeBtns = [['career', 'Career', nOf(comps)]].concat(years.map(y => [y, y, nOf(comps.filter(c => smYear(c) === y))]));
  const scopeBar = `<div class="sm-scope">
    <div class="sm-seg" role="group" aria-label="Shots from">${scopeBtns.map(([k, l, n]) => `<button data-sms="${k}" aria-pressed="${SM.scope === k}">${l}<small>${n}</small></button>`).join('')}</div>
    ${scopeAll.length > 1 ? `<label class="sm-pick"><span>Event</span><select data-sme="1"><option value="all"${SM.ev === 'all' ? ' selected' : ''}>All ${scopeAll.length} events${SM.scope === 'career' ? '' : ' of ' + SM.scope}</option>${scopeAll.map(k => `<option value="${k}"${k === SM.ev ? ' selected' : ''}>${esc(smShort(k))} · ${smCount(pid, k)} shots</option>`).join('')}</select></label>` : ''}
  </div>`;
  if (missing) {
    cids.forEach(ensureShots);
    const err = cids.some(c => SH_ST[c] === 'error');
    return pvSec('Shot map', '', '', `${scopeBar}<div class="card pv-card"><div class="empty-row"><span class="empty-dot"></span>${err ? 'The shot chart could not be loaded. Refresh the page to try again.' : 'Loading the shot chart…'}</div></div>`);
  }
  const games = SM.ev !== 'all' ? smGames(pid, SM.ev) : [];
  if (SM.game !== 'all' && !games.some(g => g.mid === SM.game)) SM.game = 'all';
  const list = smShots(), sm = smSummary(list), mix = SM.mix = smMixLZ(list, cids);
  if (!SM.zone || !sm.byZ[SM.zone]) SM.zone = Object.entries(sm.byZ).sort((p, q) => q[1][0] - p[1][0])[0]?.[0] || 'PT';
  const fg = sm.a ? sm.m / sm.a : 0, LZ = mix.LZ;
  const nGames = new Set(list.map(s => s.mid)).size;
  const where = SM.ev !== 'all' ? smShort(SM.ev) : SM.scope === 'career' ? 'Career' : 'Season ' + SM.scope;
  const avgName = cids.length > 1 ? 'the same events' : 'this event';
  const views = [['terrain', '3D terrain'], ['zones', 'Zones'], ['shots', 'Every shot']];
  const note = {
    terrain: `Colour: his shooting compared with the average from the same spot in ${avgName}. Height: how often he shoots there.`,
    zones: `His FG% in each zone, coloured against the average for that zone in ${avgName}. Grey zones: no attempts.`,
    shots: 'Every attempt where it was taken. Filled circle: made. Cross: missed.'}[SM.view];
  const rows = Object.entries(sm.byZ).sort((p, q) => q[1][0] - p[1][0] || q[1][1] - p[1][1]);
  const body = `${scopeBar}
  <div class="sm">
    <div class="sm-left">
      <div class="sm-views" role="group" aria-label="Chart style">${views.map(([k, l]) => `<button data-smv="${k}" aria-pressed="${SM.view === k}">${l}</button>`).join('')}</div>
      <div class="sm-stage">
        <canvas id="sm-cv" width="1440" height="880" role="img" aria-label="Shot map"></canvas>
        <canvas id="sm-ov" class="sm-ov" width="1440" height="880" aria-hidden="true"></canvas>
        <div class="sm-badge"><span>${esc(SM.game === 'all' ? where : (games.find(g => g.mid === SM.game) || {}).label || '')}${SM.game === 'all' ? ` · ${cids.length > 1 ? cids.length + ' events, ' : ''}${nGames} game${nGames === 1 ? '' : 's'}` : ''}</span><b>${sm.m}/${sm.a} FG</b></div>
        <div class="sm-tip" id="sm-tip" hidden></div>
        ${games.length > 1 ? `<div class="sm-chips" role="group" aria-label="Games"><button data-smg="all" aria-pressed="${SM.game === 'all'}">All games</button>${games.map(g => `<button data-smg="${g.mid}" aria-pressed="${SM.game === g.mid}">${esc(g.label)}</button>`).join('')}</div>` : ''}
      </div>
      ${SM.view !== 'shots' ? `<div class="sm-legend" aria-label="Colour scale">Below average <i style="background:#1f8fff"></i><i style="background:#4b86c8"></i><i style="background:#6c7486"></i><i style="background:#c2507a"></i><i style="background:#ff2e58"></i> Above average</div>` : ''}
      <div class="sm-note">${note}</div>
      <div class="sm-tiles">
        <div><small>FG%</small><b>${sm.a ? smPct(fg) : '–'}</b></div>
        <div><small>Expected at his spots</small><b>${sm.a ? smPct(sm.exp) : '–'}</b></div>
        <div><small>Versus average</small><b class="${smCls(fg - sm.exp)}">${sm.a ? smDiff(fg - sm.exp) : '–'}</b></div>
      </div>
    </div>
    <aside class="sm-explain" aria-label="What the map shows">
      <div class="sm-zone" id="sm-zone" aria-live="polite">${smZonePanel(list)}</div>
      ${smNotes(list)}
      ${cids.length > 1 ? smEvents(pid, cids) : ''}
      <div class="sm-zones">
        <div class="sm-zones-h"><h3>Zones</h3><span>most attempts first</span></div>
        ${rows.map(([z, [a, m]]) => { const p = m / a, df = p - (LZ[z] || 0);
          return `<div class="sm-zrow${SM.zone === z ? ' on' : ''}" data-smz="${z}" tabindex="0">
            <span class="nm">${SM_ZONES[z]}</span><span class="pc">${smPct(p)}</span>
            <span class="sb">${m}/${a} · ${(a / sm.a * 100).toFixed(0)}% of his shots · average ${smPct(LZ[z] || 0)}</span><span class="df ${smCls(df)}">${smDiff(df)}</span>
            <span class="bar" aria-hidden="true"><i style="width:${(a / sm.a * 100).toFixed(1)}%"></i></span></div>`; }).join('')}
      </div>
      <details class="sm-method">
        <summary>How to read this map</summary>
        <p><b>Source.</b> Shot positions from the organiser's shot chart for each game, in 1% steps (about 28 cm along the court, 15 cm across). Shot charts start with the 2026 competitions; the NXT Championship, MSSM and FIBA events have none.</p>
        <p><b>The average.</b> Each shot is compared with the event it was taken in: ${cids.map(c => `${esc(smShort(c))} (${SH_DATA[c].n.toLocaleString('en')} shots in ${SH_DATA[c].g} game${SH_DATA[c].g === 1 ? '' : 's'})`).join(', ')}. A career map that mixes a U20 league with the Agong Cup therefore never holds a U20 shot to a senior average, or the other way round.</p>
        <p><b>Zones.</b> Two or three points is the source's own label. Corner 3 = within about 3.1 m of the baseline; top of the arc = between the lane lines extended. Left and right are from the shooter's view, facing the basket.</p>
        <p><b>Terrain.</b> His makes are smoothed over about 1.6 m and pulled toward the average where he has few shots. Expected FG% = what an average shooter in the same events would make from his spots.</p>
      </details>
    </aside>
  </div>`;
  const sub = `${esc(where)} · ${sm.a} field-goal attempt${sm.a === 1 ? '' : 's'}`;
  return pvSec('Shot map', sub, '', body);
}

/* the selected zone, at the top of the explanation box; redrawn on hover without a re-render */
function smZonePanel(list) {
  const z = SM.zone, zs = list.filter(s => s.z === z), a = zs.length, m = zs.reduce((t, s) => t + s.made, 0), avg = (SM.mix && SM.mix.LZ[z]) || 0;
  const df = a ? m / a - avg : 0;
  return `<div class="k">Selected zone · hover the court or a row below</div><div class="n">${SM_ZONES[z] || ''}</div>
    <div class="g"><div><small>FGM/FGA</small><span>${a ? m + '/' + a : 'no shots'}</span></div>
    <div><small>FG%</small><span>${a ? smPct(m / a) : '–'}</span></div>
    <div><small>Versus average</small><span class="${a ? smCls(df) : ''}">${a ? smDiff(df) : '–'}</span><em>average ${smPct(avg)}</em></div></div>`;
}

/* one row per event in a career or season map; each against its own event's average */
function smEvents(pid, cids) {
  const all = smShots();
  const rows = cids.map(cid => { const l = all.filter(s => s.cid === cid), s = smSummary(l); return {cid, ...s, games: new Set(l.map(x => x.mid)).size}; }).filter(r => r.a);
  const max = Math.max(...rows.map(r => r.a));
  return `<div class="sm-evs"><div class="sm-zones-h"><h3>By event</h3><span>each against its own event</span></div>
    ${rows.map(r => { const p = r.m / r.a, df = p - r.exp, three = all.filter(s => s.cid === r.cid && s.three), t3m = three.reduce((t, s) => t + s.made, 0);
      return `<button class="sm-evrow" data-sme-go="${r.cid}">
        <span class="nm">${esc(smShort(r.cid))}</span><span class="pc">${smPct(p)}</span>
        <span class="sb">${r.m}/${r.a} FG · ${t3m}/${three.length} 3P · ${r.games} game${r.games === 1 ? '' : 's'}</span><span class="df ${smCls(df)}">${smDiff(df)}</span>
        <span class="bar" aria-hidden="true"><i style="width:${(r.a / max * 100).toFixed(1)}%"></i></span></button>`; }).join('')}</div>`;
}

/* automatic notes: the zones that stand out, the two sides, the overall line */
function smNotes(list) {
  const LZ = SM.mix.LZ, sm = smSummary(list), Z = sm.byZ;
  if (sm.a < 8) return '';
  // the average for a group of zones: his shots there, each against its own event (the scope's mix where he has none)
  const lgOf = (...ks) => { const zs = list.filter(s => ks.includes(s.z)); return zs.length ? zs.reduce((t, s) => t + smAvgOf(s), 0) / zs.length : ks.reduce((t, k) => t + LZ[k], 0) / ks.length; };
  const sum = (...ks) => ks.reduce((t, k) => [t[0] + (Z[k] || [0, 0])[0], t[1] + (Z[k] || [0, 0])[1]], [0, 0]);
  const N = [];
  const ranked = Object.entries(Z).filter(([, [a]]) => a >= 4).map(([z, [a, m]]) => ({z, a, m, df: m / a - LZ[z]})).sort((p, q) => q.df - p.df);
  const best = ranked[0], worst = ranked[ranked.length - 1];
  if (best && best.df > 0.05) N.push(['u', `Best zone: ${SM_ZONES[best.z].toLowerCase()}`, `${best.m}/${best.a} (${smPct(best.m / best.a)}) against an average of ${smPct(LZ[best.z])}.`]);
  if (worst && worst !== best && worst.df < -0.05) N.push(['d', `Coldest zone: ${SM_ZONES[worst.z].toLowerCase()}`, `${worst.m}/${worst.a} (${smPct(worst.m / worst.a)}) against ${smPct(LZ[worst.z])}.`]);
  const L3 = sum('C3L', 'W3L'), R3 = sum('C3R', 'W3R');
  if (L3[0] >= 3 && R3[0] >= 3) {
    const l = L3[1] / L3[0], r = R3[1] / R3[0];
    if (Math.abs(l - r) >= 0.1) N.push([l > r ? 'u' : 'd', `Threes: better from the ${l > r ? 'left' : 'right'}`, `${L3[1]}/${L3[0]} (${smPct(l)}) on the left, ${R3[1]}/${R3[0]} (${smPct(r)}) on the right; the average is ${smPct(lgOf('C3L', 'W3L'))} and ${smPct(lgOf('C3R', 'W3R'))}.`]);
  }
  const pt = Z.PT || [0, 0];
  if (pt[0] >= 4) N.push([pt[1] / pt[0] - LZ.PT > 0 ? 'u' : 'd', 'In the paint', `${pt[1]}/${pt[0]} (${smPct(pt[1] / pt[0])}) against ${smPct(LZ.PT)}; ${Math.round(pt[0] / sm.a * 100)}% of his shots come from there.`]);
  const mid = sum('ML', 'MC', 'MR'), all3 = sum('C3L', 'C3R', 'W3L', 'W3R', 'T3');
  if (mid[0] >= 3) N.push(['', 'Mid-range', `${mid[1]}/${mid[0]} (${smPct(mid[1] / mid[0])}) against ${smPct(lgOf('ML', 'MC', 'MR'))}.`]);
  const fg = sm.m / sm.a;
  N.push(['', 'Overall', `${sm.m}/${sm.a} (${smPct(fg)}) where an average shooter taking the same shots in the same events would make ${smPct(sm.exp)}` +
    (Math.abs((fg - sm.exp) * sm.a) >= 1 ? `: about ${Math.abs(Math.round((fg - sm.exp) * sm.a))} ${fg > sm.exp ? 'more' : 'fewer'} makes than expected` : '') +
    (all3[0] ? `. From three: ${all3[1]}/${all3[0]} (${smPct(all3[1] / all3[0])}) against ${smPct(lgOf('C3L', 'C3R', 'W3L', 'W3R', 'T3'))}.` : '.')]);
  const L = list.filter(s => s.x < -0.75), R = list.filter(s => s.x > 0.75), mk = a => a.reduce((t, s) => t + s.made, 0);
  const sides = L.length && R.length ? `<div class="sm-side"><div><small>Left side of the floor</small><b>${mk(L)}/${L.length} · ${smPct(mk(L) / L.length)}</b></div><div><small>Right side of the floor</small><b>${mk(R)}/${R.length} · ${smPct(mk(R) / R.length)}</b></div></div>` : '';
  return `<div class="sm-notes"><h3>What stands out</h3>${sm.a < 40 ? `<p class="sm-small">${sm.a} shots: a zone with only a few attempts can swing a long way on one make, so read the small ones as a lean.</p>` : ''}
    ${sides}${N.map(([c, h, p]) => `<div class="sm-n ${c === 'u' ? 'u' : c === 'd' ? 'd' : ''}"><h4>${h}</h4><p>${p}</p></div>`).join('')}</div>`;
}

/* ------------------------------------------------------- the drawing */
const SM_W = 1440, SM_H = 880, SM_NX = 60, SM_ND = 46, SM_STEP = 0.25, SM_PEAK = 1.6;
const SM_CAM = {x: 0, y: 23.5, z: 12.5}, SM_TGT = {x: 0, y: 5.2, z: 0};
const SM_F = (() => { const v = {x: SM_TGT.x - SM_CAM.x, y: SM_TGT.y - SM_CAM.y, z: SM_TGT.z - SM_CAM.z}, n = Math.hypot(v.x, v.y, v.z); return {x: v.x / n, y: v.y / n, z: v.z / n}; })();
const SM_U = (() => { let y = -SM_F.z, z = SM_F.y; const n = Math.hypot(y, z); y /= n; z /= n; if (z < 0) { y = -y; z = -z; } return {y, z}; })();
let SM_FOC = 1, SM_CX = SM_W / 2, SM_CY = 0;
function smProj(x, d, z) {
  const vx = x - SM_CAM.x, vy = d - SM_CAM.y, vz = z - SM_CAM.z;
  const yc = vy * SM_U.y + vz * SM_U.z, zc = vx * SM_F.x + vy * SM_F.y + vz * SM_F.z;
  return [SM_CX + SM_FOC * vx / zc, SM_CY - SM_FOC * yc / zc];
}
(() => {   // fit the floor (15 m wide, baseline to 11.5 m) to the canvas
  const pts = [[-7.5, 0], [7.5, 0], [7.5, 11.5], [-7.5, 11.5]].map(([x, d]) => smProj(x, d, 0));
  const xs = pts.map(p => p[0] - SM_CX), ys = pts.map(p => p[1]);
  SM_FOC = Math.min(SM_W * 0.95 / (Math.max(...xs) - Math.min(...xs)), SM_H * 0.78 / (Math.max(...ys) - Math.min(...ys)));
  SM_CY = SM_H * 0.58 - SM_FOC * (Math.min(...ys) + Math.max(...ys)) / 2;
})();
function smRay(sx, sy) {
  const a = (sx - SM_CX) / SM_FOC, b = -(sy - SM_CY) / SM_FOC;
  return {dx: a + SM_F.x, dy: SM_U.y * b + SM_F.y, dz: SM_U.z * b + SM_F.z};
}
function smUnproj(sx, sy) {
  const r = smRay(sx, sy), t = -SM_CAM.z / r.dz;
  return [SM_CAM.x + t * r.dx, SM_CAM.y + t * r.dy];
}
function smHeightAt(x, d) {
  const s = SM.surf; if (!s || !SM.Zv) return 0;
  const fi = (x + 7.5) / SM_STEP, fj = d / SM_STEP, i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= SM_NX || j >= SM_ND || s.dens[j * SM_NX + i] <= s.max * 0.05) return 0;
  const u = fi - i, v = fj - j, Z = SM.Zv, n = SM_NX + 1;
  return (Z[j * n + i] * (1 - u) + Z[j * n + i + 1] * u) * (1 - v) + (Z[(j + 1) * n + i] * (1 - u) + Z[(j + 1) * n + i + 1] * u) * v;
}
// the first point of the 3D surface under the pointer (walk the line of sight down from above the peaks)
function smUnprojSurface(sx, sy) {
  const r = smRay(sx, sy);
  if (r.dz >= 0) return smUnproj(sx, sy);
  const t0 = (SM_PEAK + 0.05 - SM_CAM.z) / r.dz, t1 = -SM_CAM.z / r.dz;
  const at = t => [SM_CAM.x + t * r.dx, SM_CAM.y + t * r.dy, SM_CAM.z + t * r.dz];
  const above = t => { const [x, d, z] = at(t); return z > smHeightAt(x, d); };
  const n = Math.ceil((t1 - t0) / 0.04);
  let prev = t0;
  for (let k = 1; k <= n; k++) {
    const t = t0 + (t1 - t0) * k / n;
    if (!above(t)) { let lo = prev, hi = t; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (above(m)) lo = m; else hi = m; } const [x, d] = at(hi); return [x, d]; }
    prev = t;
  }
  return smUnproj(sx, sy);
}
const SM_OS = Math.min(SM_W * 0.9 / 15, SM_H * 0.84 / 11.5), SM_OX = SM_W / 2, SM_OY = SM_H * 0.115;
const smFlat = (x, d) => [SM_OX + x * SM_OS, SM_OY + d * SM_OS];
const smUnflat = (sx, sy) => [(sx - SM_OX) / SM_OS, (sy - SM_OY) / SM_OS];
const SM_STOPS = [[-0.20, [31, 143, 255]], [-0.09, [75, 134, 200]], [0, [108, 116, 134]], [0.09, [194, 80, 122]], [0.20, [255, 46, 88]]];
function smColor(v, shade) {
  v = Math.max(-0.2, Math.min(0.2, v));
  let k = 0; while (k < SM_STOPS.length - 2 && v > SM_STOPS[k + 1][0]) k++;
  const [v0, c0] = SM_STOPS[k], [v1, c1] = SM_STOPS[k + 1], t = (v - v0) / (v1 - v0);
  const c = c0.map((x, i) => Math.round((x + (c1[i] - x) * t) * shade));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const SM_COURT = (() => {
  const P = [], arc = (cx, cd, r, a0, a1, n = 48) => { const o = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; o.push([cx + r * Math.sin(a), cd + r * Math.cos(a)]); } return o; };
  P.push([[-7.5, 0], [7.5, 0]], [[-7.5, 0], [-7.5, 11.5]], [[7.5, 0], [7.5, 11.5]], [[-2.45, 0], [-2.45, 5.8], [2.45, 5.8], [2.45, 0]]);
  P.push(arc(0, 5.8, 1.8, -Math.PI / 2, Math.PI / 2), arc(0, SM_RIM, 1.25, -Math.PI / 2, Math.PI / 2, 24));
  const a3 = Math.asin(6.6 / 6.75);
  P.push([[-6.6, 0], [-6.6, SM_RIM + 6.75 * Math.cos(a3)], ...arc(0, SM_RIM, 6.75, -a3, a3, 64), [6.6, SM_RIM + 6.75 * Math.cos(a3)], [6.6, 0]]);
  P.push([[-0.9, 1.2], [0.9, 1.2]], arc(0, SM_RIM, 0.23, -Math.PI, Math.PI, 20));
  return P;
})();
function smLeagueSurf(cid) {
  if (SM.lg[cid]) return SM.lg[cid];
  const LG = SH_DATA[cid].LG, out = new Float32Array(SM_NX * SM_ND);
  for (let j = 0; j < SM_ND; j++) for (let i = 0; i < SM_NX; i++) {
    const x = -7.5 + (i + 0.5) * SM_STEP, d = (j + 0.5) * SM_STEP;
    let w = 0, m = 0;
    for (const c of LG) { const r2 = (c.x - x) ** 2 + (c.d - d) ** 2; if (r2 > 12) continue; const k = Math.exp(-r2 / 2); w += k * c.a; m += k * c.m; }   // beyond 3.5 m the weight is under 0.3%
    out[j * SM_NX + i] = w > 0.5 ? m / w : 0.42;
  }
  return (SM.lg[cid] = out);
}
// the average surface for the current scope: each event's own, weighted by how many of his shots it holds
function smMixSurf() {
  const w = SM.mix.w, tot = SM.mix.tot;
  if (w.length === 1) return smLeagueSurf(w[0][0]);
  const out = new Float32Array(SM_NX * SM_ND);
  w.forEach(([cid, n]) => { const s = smLeagueSurf(cid); for (let k = 0; k < out.length; k++) out[k] += s[k] * n / tot; });
  return out;
}
function smSurfaces(list) {
  const lg = smMixSurf(), dens = new Float32Array(SM_NX * SM_ND), diff = new Float32Array(SM_NX * SM_ND);
  let max = 0;
  for (let j = 0; j < SM_ND; j++) for (let i = 0; i < SM_NX; i++) {
    const x = -7.5 + (i + 0.5) * SM_STEP, d = (j + 0.5) * SM_STEP;
    let a1 = 0, a = 0, m = 0;
    for (const s of list) {
      const dx = s.x - x, dd = s.y + SM_RIM - d, r2 = dx * dx + dd * dd;
      a1 += Math.exp(-r2 / (2 * 0.85 * 0.85));
      const k = Math.exp(-r2 / (2 * 1.6 * 1.6)); a += k; m += k * s.made;
    }
    const L = lg[j * SM_NX + i], p = (m + 3 * L) / (a + 3);
    dens[j * SM_NX + i] = a1; diff[j * SM_NX + i] = p - L;
    if (a1 > max) max = a1;
  }
  return {dens, diff, max};
}
function smDraw() {
  const cv = document.getElementById('sm-cv'); if (!cv || !SM.mix) return;
  const g = cv.getContext('2d'), list = smShots();
  g.clearRect(0, 0, SM_W, SM_H);
  if (SM.view === 'zones') return smDrawZones(g, list);
  const floor = [smProj(-7.5, 0, 0), smProj(7.5, 0, 0), smProj(7.5, 11.5, 0), smProj(-7.5, 11.5, 0)];
  g.beginPath(); floor.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
  const fg = g.createLinearGradient(0, floor[0][1], 0, floor[2][1]); fg.addColorStop(0, '#1a2436'); fg.addColorStop(1, '#101828');
  g.fillStyle = fg; g.fill();
  g.strokeStyle = 'rgba(140,160,200,.07)'; g.lineWidth = 1.5;
  for (let x = -7; x <= 7; x++) { g.beginPath(); g.moveTo(...smProj(x, 0, 0)); g.lineTo(...smProj(x, 11.5, 0)); g.stroke(); }
  for (let d = 1; d <= 11; d++) { g.beginPath(); g.moveTo(...smProj(-7.5, d, 0)); g.lineTo(...smProj(7.5, d, 0)); g.stroke(); }
  if (SM.zone) {                         // the selected zone, on the floor
    g.fillStyle = 'rgba(255,255,255,.07)';
    for (let d = 0; d < 11.5; d += 0.25) for (let x = -7.5; x < 7.5; x += 0.25) {
      if (smZoneAt(x + 0.125, d + 0.125) !== SM.zone) continue;
      const q = [smProj(x, d, 0), smProj(x + 0.25, d, 0), smProj(x + 0.25, d + 0.25, 0), smProj(x, d + 0.25, 0)];
      g.beginPath(); q.forEach(([a, b], k) => k ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.fill();
    }
  }
  if (SM.view === 'terrain') smDrawTerrain(g, list); else { smLines(g, 0.55, false); smDrawShots(g, list); }
}
function smLines(g, alpha, lift) {
  g.strokeStyle = `rgba(230,236,247,${alpha})`; g.lineWidth = 2.2; g.lineJoin = 'round';
  for (const path of SM_COURT) {
    g.beginPath(); let first = true;
    for (let k = 0; k < path.length; k++) {
      const steps = k ? 6 : 1;
      for (let t = 1; t <= steps; t++) {
        const [xa, da] = k ? path[k - 1] : path[0], [x0, d0] = path[k];
        const x = k ? xa + (x0 - xa) * t / steps : x0, d = k ? da + (d0 - da) * t / steps : d0;
        const [sx, sy] = smProj(x, d, lift ? smHeightAt(x, d) + 0.02 : 0);
        if (first) { g.moveTo(sx, sy); first = false; } else g.lineTo(sx, sy);
      }
    }
    g.stroke();
  }
}
function smDrawTerrain(g, list) {
  const key = [SM.pid, SM.scope, SM.ev, SM.game].join('|');
  if (SM.surfKey !== key) { SM.surf = smSurfaces(list); SM.surfKey = key; }
  const s = SM.surf, thr = s.max * 0.05;
  smLines(g, 0.28, false);
  if (!list.length) return;
  const hv = (i, j) => { let v = 0, n = 0; for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && b >= 0 && a < SM_NX && b < SM_ND) { v += s.dens[b * SM_NX + a]; n++; } v /= n; return v > thr ? SM_PEAK * Math.pow(v / s.max, 2.2) : 0; };
  const Z = []; for (let j = 0; j <= SM_ND; j++) for (let i = 0; i <= SM_NX; i++) Z.push(hv(i, j));
  SM.Zv = Z;
  const z = (i, j) => Z[j * (SM_NX + 1) + i];
  for (let j = 0; j < SM_ND; j++) for (let i = 0; i < SM_NX; i++) {
    const k = j * SM_NX + i; if (s.dens[k] <= thr) continue;
    const x0 = -7.5 + i * SM_STEP, x1 = x0 + SM_STEP, d0 = j * SM_STEP, d1 = d0 + SM_STEP;
    const za = z(i, j), zb = z(i + 1, j), zc = z(i + 1, j + 1), zd = z(i, j + 1);
    const nx = (za + zd - zb - zc) / (2 * SM_STEP), nd = (za + zb - zc - zd) / (2 * SM_STEP);
    const shade = Math.max(0.62, Math.min(1.12, 0.55 + 0.55 * (0.5 * nd + 0.85) / Math.hypot(nx, nd, 1)));
    const q = [smProj(x0, d0, za), smProj(x1, d0, zb), smProj(x1, d1, zc), smProj(x0, d1, zd)];
    g.beginPath(); q.forEach(([a, b], n) => n ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath();
    g.fillStyle = smColor(s.diff[k], shade); g.fill();
    g.strokeStyle = 'rgba(8,12,20,.12)'; g.lineWidth = 1; g.stroke();
  }
  smLines(g, 0.5, true);
}
function smDrawShots(g, list) {
  for (const s of list) {
    const [px, py] = smProj(s.x, s.y + SM_RIM, 0), r = 13;
    g.globalAlpha = !SM.zone || s.z === SM.zone ? 1 : 0.28;
    if (s.made) { g.fillStyle = '#ff3d64'; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#0b111c'; g.lineWidth = 3; g.stroke(); }
    else { g.strokeStyle = '#7fc0ff'; g.lineWidth = 4.5; g.beginPath(); g.moveTo(px - r * .75, py - r * .75); g.lineTo(px + r * .75, py + r * .75); g.moveTo(px + r * .75, py - r * .75); g.lineTo(px - r * .75, py + r * .75); g.stroke(); }
  }
  g.globalAlpha = 1;
  g.font = '600 26px Archivo, system-ui, sans-serif';
  g.fillStyle = '#ff3d64'; g.beginPath(); g.arc(46, SM_H - 44, 12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9d3e6'; g.fillText('Made', 68, SM_H - 35);
  g.strokeStyle = '#7fc0ff'; g.lineWidth = 4.5; g.beginPath(); g.moveTo(160, SM_H - 53); g.lineTo(178, SM_H - 35); g.moveTo(178, SM_H - 53); g.lineTo(160, SM_H - 35); g.stroke();
  g.fillText('Missed', 190, SM_H - 35);
}
function smDrawZones(g, list) {
  const LZ = SM.mix.LZ, sm = smSummary(list), step = 0.1;
  const [fx0, fy0] = smFlat(-7.5, 0), [fx1, fy1] = smFlat(7.5, 11.5);
  g.fillStyle = '#151e2e'; g.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  for (let dd = 0; dd < 11.5; dd += step) for (let x = -7.5; x < 7.5; x += step) {
    const z = smZoneAt(x + step / 2, dd + step / 2), st = sm.byZ[z], dim = SM.zone && SM.zone !== z;
    g.fillStyle = st ? smColor(st[1] / st[0] - (LZ[z] || 0), dim ? 0.62 : 1) : (dim ? '#1a2333' : '#222d40');
    const [px, py] = smFlat(x, dd); g.fillRect(px, py, step * SM_OS + 0.8, step * SM_OS + 0.8);
  }
  g.strokeStyle = 'rgba(230,236,247,.75)'; g.lineWidth = 2.4; g.lineJoin = 'round';
  for (const path of SM_COURT) { g.beginPath(); path.forEach(([x, dd], k) => { const [a, b] = smFlat(x, dd); k ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
  g.strokeStyle = 'rgba(230,236,247,.35)'; g.lineWidth = 2; g.setLineDash([8, 8]);
  for (const sx of [-2.45, 2.45]) { g.beginPath(); g.moveTo(...smFlat(sx, 5.8)); g.lineTo(...smFlat(sx, 11.5)); g.stroke(); }
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(...smFlat(sx * 6.6, 3.13)); g.lineTo(...smFlat(sx * 7.5, 3.13)); g.stroke(); }
  g.setLineDash([]);
  const pos = {C3L: [-6.75, 1.55], C3R: [6.75, 1.55], PT: [0, 3.4], T3: [0, 10.0], MC: [0, 7.0], ML: [-4.4, 3.4], MR: [4.4, 3.4], W3L: [-5.6, 8.6], W3R: [5.6, 8.6]};
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const z in pos) {
    const st = sm.byZ[z], [px, py] = smFlat(...pos[z]);
    const t1 = st ? st[1] + '/' + st[0] : '0/0', t2 = st ? smPct(st[1] / st[0]) : 'no shots';
    g.font = '700 30px "Archivo Narrow", Archivo, system-ui, sans-serif';
    const w = Math.max(g.measureText(t1).width, 90) + 22, r = 12, x0 = px - w / 2, y0 = py - 34, h = 68;
    g.fillStyle = 'rgba(8,12,20,.72)';
    g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r); g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.fillText(t1, px, py - 11);
    g.font = '600 21px Archivo, system-ui, sans-serif'; g.fillStyle = '#c9d3e6'; g.fillText(t2, px, py + 16);
  }
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
}

/* --------------------------------------------- pointer, hover box, rows */
function smSetZone(z) {
  if (z === SM.zone) return;
  SM.zone = z; smDraw();
  document.querySelectorAll('.sm-zrow').forEach(r => r.classList.toggle('on', r.dataset.smz === z));
  const el = document.getElementById('sm-zone');
  if (el && SM.mix) el.innerHTML = smZonePanel(smShots());
}
/* Where the pointer is: a marker on its own canvas over the map, so moving it never redraws the
   terrain. On the terrain it sits on the surface itself: a ring of 1 m (the "within 1 m of here"
   count in the hover box) draped over the peaks, a puck at the point, and a dashed stem down to its
   shadow on the floor, so the height under the pointer reads at a glance. */
let SM_MK = null, SM_MK_RAF = 0;
function smMarker(p) {
  SM_MK = p;
  if (!SM_MK_RAF) SM_MK_RAF = requestAnimationFrame(smDrawMarker);
}
function smDrawMarker() {
  SM_MK_RAF = 0;
  const ov = document.getElementById('sm-ov'); if (!ov) return;
  const g = ov.getContext('2d');
  g.clearRect(0, 0, SM_W, SM_H);
  if (!SM_MK) return;
  const [x, d] = SM_MK, terrain = SM.view === 'terrain', flat = SM.view === 'zones';
  const at = (px, pd, lift) => flat ? smFlat(px, pd) : smProj(px, pd, terrain ? smHeightAt(px, pd) + (lift || 0) : 0);
  const h = terrain ? smHeightAt(x, d) : 0;
  const ring = []; for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, rx = x + Math.cos(a), rd = d + Math.sin(a); ring.push(at(Math.max(-7.5, Math.min(7.5, rx)), Math.max(0, Math.min(11.5, rd)), 0.03)); }
  const path = pts => { g.beginPath(); pts.forEach(([a, b], k) => k ? g.lineTo(a, b) : g.moveTo(a, b)); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (terrain && h > 0.02) {                       // the stem and its shadow on the floor
    const [fx, fy] = smProj(x, d, 0), [tx, ty] = smProj(x, d, h);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(fx, fy, 16, 7, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2.5; g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(fx, fy); g.lineTo(tx, ty); g.stroke(); g.setLineDash([]);
  }
  path(ring); g.fillStyle = 'rgba(255,255,255,.10)'; g.fill();
  g.strokeStyle = 'rgba(8,12,20,.85)'; g.lineWidth = 7; g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
  const [cx, cy] = at(x, d, 0.03);
  g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(8,12,20,.9)'; g.lineWidth = 4;
  g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill(); g.stroke();
}
function smPointer(ev) {
  const cv = document.getElementById('sm-cv'), tip = document.getElementById('sm-tip'); if (!cv || !tip) return;
  const r = cv.getBoundingClientRect();
  const sx = (ev.clientX - r.left) * SM_W / r.width, sy = (ev.clientY - r.top) * SM_H / r.height;
  const [x, d] = SM.view === 'zones' ? smUnflat(sx, sy) : SM.view === 'terrain' ? smUnprojSurface(sx, sy) : smUnproj(sx, sy);
  if (x < -7.5 || x > 7.5 || d < 0 || d > 11.5) { tip.hidden = true; smMarker(null); return; }
  smMarker([x, d]);
  const z = smZoneAt(x, d), list = smShots();
  smSetZone(z);
  const zs = list.filter(s => s.z === z), a = zs.length, m = zs.reduce((t, s) => t + s.made, 0);
  const near = list.filter(s => Math.hypot(s.x - x, s.y + SM_RIM - d) <= 1.0), nm = near.reduce((t, s) => t + s.made, 0);
  const avg = SM.mix.LZ[z] || 0, df = a ? m / a - avg : null;
  tip.innerHTML = `<div class="t1">${SM_ZONES[z]}</div><div class="t0">about ${Math.hypot(x, d - SM_RIM).toFixed(1)} m from the rim</div>
    <div class="sm-tr"><span>FGM/FGA</span><b>${a ? m + '/' + a : 'no shots'}</b></div>
    <div class="sm-tr"><span>FG%</span><b>${a ? smPct(m / a) : '–'}</b></div>
    <div class="sm-tr"><span>Average from here</span><b>${smPct(avg)}</b></div>
    ${a ? `<div class="sm-tr"><span>Versus average</span><b class="${df > 0.02 ? 'pos' : df < -0.02 ? 'neg' : 'flat'}">${smDiff(df)}</b></div>` : ''}
    <div class="sm-tr"><span>Within 1 m of here</span><b>${near.length ? nm + '/' + near.length : 'none'}</b></div>`;
  tip.hidden = false;
  const st = cv.parentElement.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = ev.clientX - st.left + 16, top = ev.clientY - st.top + 16;
  if (left + tw > st.width - 8) left = ev.clientX - st.left - tw - 16;
  if (top + th > cv.offsetHeight - 4) top = ev.clientY - st.top - th - 16;
  tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
}
function shotsAfterRender() {
  const cv = document.getElementById('sm-cv'); if (!cv) return;
  smDraw();
  cv.addEventListener('pointermove', smPointer);
  cv.addEventListener('pointerdown', smPointer);
  cv.addEventListener('pointerleave', e => { const t = document.getElementById('sm-tip'); if (t && e.pointerType === 'mouse') { t.hidden = true; smMarker(null); } });
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(smDraw);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-smv],[data-smg],[data-sms],[data-sme-go]'); if (!b) return;
  if (b.dataset.smv) { SM.view = b.dataset.smv; try { localStorage.setItem('hs-shotmap-view', SM.view); } catch (err) {} }
  if (b.dataset.smg) { SM.game = b.dataset.smg; SM.zone = null; }
  if (b.dataset.sms) { SM.scope = b.dataset.sms; SM.ev = 'all'; SM.game = 'all'; SM.zone = null; }
  if (b.dataset.smeGo) { SM.ev = b.dataset.smeGo; SM.game = 'all'; SM.zone = null; }
  softRoute();
});
document.addEventListener('change', e => {
  const s = e.target.closest('[data-sme]'); if (!s) return;
  SM.ev = s.value; SM.game = 'all'; SM.zone = null; softRoute();
});
document.addEventListener('pointerover', e => { const r = e.target.closest && e.target.closest('.sm-zrow'); if (r) smSetZone(r.dataset.smz); });
document.addEventListener('focusin', e => { const r = e.target.closest && e.target.closest('.sm-zrow'); if (r) smSetZone(r.dataset.smz); });
