/* =========================================================================
   Milestones (#/milestones): local players in the MBL (men), every season the
   database holds; a new season counts the day its games are in.
   - Totals: every 50 points, rebounds, assists, steals, blocks and games, over the
     MBL career or with one team, with the game each was reached in.
   - Next up: active players (in the latest MBL season) within two games of their
     next one, at their per-game rate of that season.
   - Single game: triple- and double-doubles, 30 points, 15 rebounds, 10 assists,
     5 steals, 5 blocks; the closest game where nobody has one yet.
   A local player: registered as MAS in any roster; where no roster says, one with
   Malaysia caps or a game in a Malaysian state or school competition. Any other
   nationality makes a player foreign. All of it is worked out here from the box
   scores the page already holds.
   ========================================================================= */
const MS = {sc: 'c', k: 'pts', ft: 'dd', m: null, anim: true};
const MS_SERIES = 'Major Basketball League';
const MS_DOM = new Set(['Agong Cup', 'MABA/MATRIX Cup', 'MABA/MATRIX 17 & Below', 'Sukan Malaysia', 'MSSM', 'Schools Championship', 'MILO Lum Mun Chak Cup',
  'Malaysia D-League', 'NXT Championship', 'Sukan Selangor', 'Selangor Basketball League']);
const MS_K = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['gp', 'GAMES']];
const MS_KL = Object.fromEntries(MS_K);
const MS_STEP = 50;
const MS_FEATS = [
  ['td', 'Triple-double', ['pts', 'reb', 'ast', 'stl', 'blk'], 10, 3], ['dd', 'Double-double', ['pts', 'reb', 'ast', 'stl', 'blk'], 10, 2],
  ['p30', '30-point game', ['pts'], 30, 1], ['r15', '15-rebound game', ['reb'], 15, 1], ['a10', '10-assist game', ['ast'], 10, 1],
  ['s5', '5-steal game', ['stl'], 5, 1], ['b5', '5-block game', ['blk'], 5, 1]];
const MS_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const msDt = iso => { const [y, m, d] = String(iso || '').split('-'); return {d: +d || '', m: MS_MON[+m - 1] || '', y: y || ''}; };
const msClock = t => { const x = /(\d+):(\d+)\s*([AP]M)?/i.exec(t || ''); if (!x) return 0; let h = +x[1]; if (x[3]) h = h % 12 + (/p/i.test(x[3]) ? 12 : 0); return h * 60 + +x[2]; };
const msN = v => Number(v) || 0;

function msLocalTest() {
  const nat = {}, ser = {};
  COMPS.forEach(c => {
    Object.values(c.roster || {}).forEach(rows => (rows || []).forEach(r => { (nat[r.pid] = nat[r.pid] || new Set()).add(r.nat || ''); }));
    (c.players || []).forEach(p => { const id = p.pid || p[0]; (ser[id] = ser[id] || new Set()).add(c.series); });
  });
  const caps = DB.caps || {};
  return pid => {
    const n = [...(nat[pid] || [])].filter(Boolean);
    if (n.length) return n.every(x => x === 'MAS');
    return !!caps[pid] || [...(ser[pid] || [])].some(s => MS_DOM.has(s));
  };
}

function msModel() {
  if (MS.m) return MS.m;
  const comps = COMPS.filter(c => c.series === MS_SERIES && c.gender !== 'Women').sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const local = msLocalTest(), rows = [];
  comps.forEach(c => c.games.filter(g => g.st === 'COMPLETE').sort((a, b) => (a.date || '').localeCompare(b.date || '') || msClock(a.time) - msClock(b.time) || a.mid.localeCompare(b.mid)).forEach(g => {
    const b = getBox(g.mid); if (!b) return;
    b.p.forEach(r => {
      if (!r.pid || !local(r.pid)) return;
      const x = {cid: c.id, y: c.year, mid: g.mid, d: g.date, pid: r.pid, t: r.team, o: r.team === g.h ? g.a : g.h,
        sc: r.team === g.h ? [g.hs, g.as] : [g.as, g.hs], pts: msN(r.pts), reb: msN(r.oreb) + msN(r.dreb), ast: msN(r.ast), stl: msN(r.stl), blk: msN(r.blk)};
      // a DNP line: no minutes and nothing else
      if (!(minsToNum(r.min) > 0) && !(x.pts || x.reb || x.ast || x.stl || x.blk || msN(r.fga) || msN(r.fta) || msN(r.tov) || msN(r.pf))) return;
      rows.push(x);
    });
  }));
  const latest = comps.length ? comps[comps.length - 1].id : null;
  const car = {}, team = {}, ach = [], act = {};
  const add = (T, x) => { T.gp = (T.gp || 0) + 1; ['pts', 'reb', 'ast', 'stl', 'blk'].forEach(k => { T[k] = (T[k] || 0) + x[k]; }); };
  rows.forEach(x => {
    [['c', car, x.pid], ['t', team, x.pid + '|' + x.t]].forEach(([sc, M, key]) => {
      const T = M[key] = M[key] || {pid: x.pid, t: x.t};
      const before = {}; MS_K.forEach(([k]) => { before[k] = T[k] || 0; });
      add(T, x);
      MS_K.forEach(([k]) => { for (let th = (Math.floor(before[k] / MS_STEP) + 1) * MS_STEP; th <= T[k]; th += MS_STEP) ach.push({sc, pid: x.pid, t: x.t, k, th, d: x.d, mid: x.mid, cid: x.cid, o: x.o, y: x.y}); });
    });
    if (x.cid === latest) { const a = act[x.pid] = act[x.pid] || {t: x.t, g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0}; a.t = x.t; a.g++; ['pts', 'reb', 'ast', 'stl', 'blk'].forEach(k => { a[k] += x[k]; }); }
  });
  const next = [];
  Object.entries(act).forEach(([pid, a]) => [['c', car[pid]], ['t', team[pid + '|' + a.t]]].forEach(([sc, T]) => {
    if (!T) return;
    MS_K.forEach(([k]) => {
      const cur = T[k] || 0, th = (Math.floor(cur / MS_STEP) + 1) * MS_STEP, pace = k === 'gp' ? 1 : a[k] / a.g;
      if (pace > 0) next.push({sc, pid, k, cur, th, need: th - cur, pace, gn: Math.ceil((th - cur) / pace), t: a.t});
    });
  }));
  next.sort((p, q) => p.gn - q.gn || p.need - q.need);
  const lead = {};
  [['c', car], ['t', team]].forEach(([sc, M]) => MS_K.forEach(([k]) => {
    lead[sc + k] = Object.values(M).filter(T => T[k]).sort((p, q) => q[k] - p[k]).slice(0, 10)
      .map(T => ({pid: T.pid, v: T[k], act: !!act[T.pid], team: sc === 't' ? T.t : (act[T.pid] || {}).t || T.t}));
  }));
  const feats = MS_FEATS.map(([key, name, ks, min, need]) => {
    const score = x => ks.map(k => x[k]).sort((p, q) => q - p)[need - 1];
    const hits = rows.filter(x => score(x) >= min).sort((p, q) => q.d.localeCompare(p.d));
    const best = hits.length ? null : rows.slice().sort((p, q) => score(q) - score(p) || (q.pts + q.reb + q.ast) - (p.pts + p.reb + p.ast))[0] || null;
    return {key, name, ks, min, list: hits, best};
  });
  ach.sort((p, q) => q.d.localeCompare(p.d) || q.th - p.th);
  return (MS.m = {comps, rows, ach, next, lead, feats});
}

/* ---------------------------------------------------------------- pieces */
const msWho = (pid, t, extra) => `<div class="ms-who">${avatar(pid)}<span><b>${esc(personName(pid))}</b><small>${t ? crest(t, 14) + `<span>${esc(t)}</span>` : ''}${extra || ''}</small></span></div>`;

function msNext() {
  const all = msModel().next.filter(n => n.sc === MS.sc && n.gn <= 2), C = 2 * Math.PI * 26;
  const cards = all.slice(0, 18).map((n, i) => { const p = Math.max(0, Math.min(1, (n.cur - (n.th - MS_STEP)) / MS_STEP));
    return `<a class="ms-nc ${MS.anim ? 'ms-in' : ''}" style="--i:${i}" href="#/p/${n.pid}">
      ${msWho(n.pid, n.t)}
      <div class="ms-goal"><div class="t">${n.th}<span>${MS_KL[n.k]}</span></div><div class="g"><b>${n.need}</b> to go · ${n.gn === 1 ? 'next game' : '~' + n.gn + ' games'}</div></div>
      <div class="ms-ring"><svg viewBox="0 0 62 62" aria-hidden="true"><circle class="bg" cx="31" cy="31" r="26"/><circle class="fg" cx="31" cy="31" r="26" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(MS.anim ? C : C * (1 - p)).toFixed(1)}" data-off="${(C * (1 - p)).toFixed(1)}"/></svg><em>${n.cur}</em></div>
      <div class="ms-scope"><span>${MS.sc === 'c' ? 'MBL career' : 'With ' + esc(n.t)}</span><span>${n.k === 'gp' ? '' : (Math.round(n.pace * 10) / 10).toFixed(1) + ' per game'}</span></div></a>`; }).join('');
  return `<section class="ms-next" aria-label="Next up"><div class="ms-h"><h2><i></i>Next up</h2>${all.length ? `<small>${all.length} within two games</small>` : ''}</div>
    <div class="ms-rail">${cards || '<div class="ms-none">—</div>'}</div></section>`;
}
function msStats() {
  const A = msModel().ach.filter(a => a.sc === MS.sc);
  return `<div class="ms-stats" role="group" aria-label="Statistic">${MS_K.map(([k, s]) => `<button data-msk="${k}" aria-pressed="${MS.k === k}"><b>${s}</b><small>${A.filter(a => a.k === k).length} reached</small></button>`).join('')}</div>`;
}
function msLadder() {
  const rows = msModel().lead[MS.sc + MS.k] || [];
  if (!rows.length) return '<div class="ms-none">—</div>';
  const top = (Math.floor(rows[0].v / MS_STEP) + 1) * MS_STEP, lab = top > 400 ? 100 : MS_STEP, ticks = [];
  for (let t = MS_STEP; t < top; t += MS_STEP) ticks.push(t);
  const pc = v => (v / top * 100).toFixed(2) + '%';
  const scale = `<div class="ms-scale"><div>${[0].concat(ticks.filter(t => t % lab === 0), [top]).map(t => `<span style="left:${pc(t)}">${t}</span>`).join('')}</div></div>`;
  return scale + rows.map((r, i) => { const nx = (Math.floor(r.v / MS_STEP) + 1) * MS_STEP;
    return `<a class="ms-lr ${r.act ? '' : 'dim'} ${MS.anim ? 'ms-in' : ''}" style="--i:${i}" href="#/p/${r.pid}">
      <span class="rk">${i + 1}</span>${msWho(r.pid, r.team)}
      <div class="ms-bar"><span class="f" style="width:${MS.anim ? 0 : pc(r.v)}" data-w="${pc(r.v)}"></span>${r.act ? `<span class="g" style="left:${pc(r.v)};width:${pc(nx - r.v)}"></span>` : ''}${ticks.map(t => `<span class="tk" style="left:${pc(t)}"></span>`).join('')}</div>
      <div class="v"><b>${r.v}</b><small>${r.act ? `${nx - r.v} to ${nx}` : 'not active'}</small></div></a>`; }).join('');
}
function msFeed() {
  const list = msModel().ach.filter(a => a.sc === MS.sc && a.k === MS.k);
  if (!list.length) return '<div class="ms-none">None yet</div>';
  let y = null;
  return list.map((a, i) => { const d = msDt(a.d), h = a.y !== y ? `<div class="ms-fy">MBL ${esc(a.y)}</div>` : ''; y = a.y;
    return h + `<a class="ms-fi ${MS.anim ? 'ms-in' : ''}" style="--i:${Math.min(i, 14)}" href="#/c/${a.cid}/box/${a.mid}">
      <div class="d"><b>${d.d}</b>${d.m}</div>${msWho(a.pid, a.t, `<span class="ms-vs">· v ${esc(a.o)}</span>`)}
      <span class="ms-chip ${a.th % 100 === 0 ? 'big' : ''}">${a.th}<small>${MS_KL[a.k]}</small></span></a>`; }).join('');
}
function msFeats() {
  return `<div class="ms-feats">${msModel().feats.map((f, i) => { const l = f.list[0], d = l ? msDt(l.d) : null;
    return `<button class="ms-ft ${MS.anim ? 'ms-in' : ''}" style="--i:${i}" data-msft="${f.key}" aria-pressed="${MS.ft === f.key}">
      <span class="n ${f.list.length ? '' : 'zero'}" data-n="${f.list.length}">${MS.anim ? 0 : f.list.length}</span><span class="nm">${f.name}</span>
      <span class="lt">${l ? `<b>${esc(personName(l.pid))}</b>${d.d} ${d.m} ${d.y}` : '<b>Not yet</b>'}</span></button>`; }).join('')}</div>`;
}
function msFeatList() {
  const f = msModel().feats.find(x => x.key === MS.ft);
  if (!f) return '';
  const hit = (k, l) => f.ks.includes(k) && l[k] >= f.min, K = ['pts', 'reb', 'ast', 'stl', 'blk'];
  if (f.list.length) return `<div class="table-scroll"><table class="ms-tbl"><thead><tr><th class="l">Date</th><th class="l">Player</th><th class="l">Game</th>${K.map(k => `<th>${k.toUpperCase()}</th>`).join('')}</tr></thead><tbody>
    ${f.list.map((l, i) => { const d = msDt(l.d), w = +l.sc[0] > +l.sc[1];
      return `<tr><td class="l mute">${d.d} ${d.m} ${d.y}</td><td class="l"><a href="#/p/${l.pid}">${msWho(l.pid, l.t)}</a></td>
        <td class="l res"><a href="#/c/${l.cid}/box/${l.mid}">v ${esc(l.o)} · <b>${w ? 'W' : 'L'} ${esc(l.sc[0])}–${esc(l.sc[1])}</b></a></td>${K.map(k => `<td class="${hit(k, l) ? 'hit' : 'mute'}">${l[k]}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
  const b = f.best; if (!b) return '<div class="ms-none">—</div>';
  const d = msDt(b.d);
  return `<a class="ms-best" href="#/c/${b.cid}/box/${b.mid}"><span class="lbl">Closest</span>${avatar(b.pid)}<b>${esc(personName(b.pid))}</b>
    <span class="ln">${K.map(k => `${b[k]}<i>${k.toUpperCase()}</i>`).join('')}</span><span class="ms-vs">v ${esc(b.o)} · ${d.d} ${d.m} ${d.y}</span></a>`;
}

/* ---------------------------------------------------------------- page */
function renderMilestones() {
  const m = msModel();
  MS.anim = true;
  if (!m.comps.length) return `<div class="page"><div class="card"><div class="empty-row"><span class="empty-dot"></span>No MBL season in the database yet.</div></div></div>`;
  return `<div class="page ms-page">
    <div class="ms-head"><h1>MBL Milestones</h1>
      <div class="ms-seg" role="group" aria-label="Count"><button data-mssc="c" aria-pressed="${MS.sc === 'c'}">MBL career</button><button data-mssc="t" aria-pressed="${MS.sc === 't'}">With one team</button></div></div>
    <div id="ms-next">${msNext()}</div>
    <div id="ms-stats">${msStats()}</div>
    <div class="ms-board">
      <section class="ms-card"><div class="ms-h"><h2>Leaders</h2></div><div class="ms-lad" id="ms-lad">${msLadder()}</div></section>
      <section class="ms-card"><div class="ms-h"><h2>Reached</h2><small id="ms-feed-n"></small></div><div class="ms-feed" id="ms-feed">${msFeed()}</div></section>
    </div>
    <section><div class="ms-h"><h2>Single game</h2></div>${msFeats()}
      <div class="ms-flist ${MS.ft ? 'open' : ''}" id="ms-flist"><div><div class="ms-card ms-fl" id="ms-fl">${msFeatList()}</div></div></div></section>
  </div>`;
}
// after the page is drawn: the rings and bars fill, the counts run up
function msFill() {
  const n = msModel().ach.filter(a => a.sc === MS.sc && a.k === MS.k).length, fn = document.getElementById('ms-feed-n'); if (fn) fn.textContent = n || '';
  if (!MS.anim) return false;
  MS.anim = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.ms-ring .fg').forEach(c => { c.style.strokeDashoffset = c.dataset.off; });
    document.querySelectorAll('.ms-bar .f').forEach(f => { f.style.width = f.dataset.w; });
    document.querySelectorAll('.ms-bar .g').forEach(g => { g.style.opacity = 1; });
  }));
  return true;
}
function milestonesAfterRender() {
  if (!document.querySelector('.ms-page') || !msFill()) return;
  const els = [...document.querySelectorAll('.ms-ft .n')], t0 = performance.now();
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(e => { e.textContent = e.dataset.n; }); return; }
  const step = t => { const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3);
    els.forEach(el => { el.textContent = Math.round(+el.dataset.n * e); }); if (k < 1 && els[0] && els[0].isConnected) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
// a switch redraws only its parts, which fill again
function msRepaint(parts) {
  MS.anim = true;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  if (parts.includes('next')) set('ms-next', msNext());
  if (parts.includes('stats')) set('ms-stats', msStats());
  if (parts.includes('lad')) set('ms-lad', msLadder());
  if (parts.includes('feed')) { set('ms-feed', msFeed()); const f = document.getElementById('ms-feed'); if (f) f.scrollTop = 0; }
  msFill();
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-mssc],[data-msk],[data-msft]'); if (!b) return;
  if (b.dataset.mssc) { if (b.dataset.mssc === MS.sc) return; MS.sc = b.dataset.mssc; document.querySelectorAll('[data-mssc]').forEach(x => x.setAttribute('aria-pressed', x === b)); msRepaint(['next', 'stats', 'lad', 'feed']); }
  else if (b.dataset.msk) { if (b.dataset.msk === MS.k) return; MS.k = b.dataset.msk; msRepaint(['stats', 'lad', 'feed']); }
  else {
    MS.ft = MS.ft === b.dataset.msft ? '' : b.dataset.msft;
    document.querySelectorAll('[data-msft]').forEach(x => x.setAttribute('aria-pressed', x.dataset.msft === MS.ft));
    const fl = document.getElementById('ms-fl'), box = document.getElementById('ms-flist');
    if (MS.ft && fl) fl.innerHTML = msFeatList();
    if (box) box.classList.toggle('open', !!MS.ft);
  }
});
