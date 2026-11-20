/* =========================================================================
   Home: the MBL milestone hero. When Malaysian players reach a career
   milestone in the MBL (every 50 points, rebounds, assists, steals, blocks or
   games — the Milestones page's own rules and data, msModel()), the latest
   MBL game day's milestones open the Home page: the player's portrait, the
   number rolling up, the game, his rank, and "the climb" — every 50 he has
   reached. Several milestones play like stories. Shown from that game day
   until 72 hours after its last tip-off (a newer game day replaces it);
   closing it is remembered for that game day. ?milestones=last shows the
   latest MBL game day's milestones whatever the date.
   Career highs ride along: a player who set a new best in points, rebounds,
   assists, blocks or steals in that day's MBL games gets a card of his own,
   the number rolling up from his previous best and "New bests" showing each
   time he raised it. A Malaysian player's best counts every game in the
   database; an import's counts his MBL games (labelled "MBL career high").
   One global: MHX. Classes mhx-*, custom property --mhh.
   ========================================================================= */
const MHX = (() => {
  const HUE = {'NS Matrix Deers': 45, 'KL Titans': 122, 'Penang Sunrise Youngsters': 4, 'Johor Southern Tigers': 228, 'Selangor Hornbills': 16,
    'Sarawak Cola Warriors': 30, 'Putrajaya Parkcity Heat': 20};
  const SHORT = {'Penang Sunrise Youngsters': 'Penang', 'Johor Southern Tigers': 'Johor', 'NS Matrix Deers': 'NS Matrix', 'Selangor Hornbills': 'Selangor',
    'Sarawak Cola Warriors': 'Sarawak', 'Putrajaya Parkcity Heat': 'Putrajaya', 'Pegasus Sports': 'Pegasus', 'Singapore Adroit': 'Adroit', 'UCSI Rising Star': 'UCSI'};
  const K = {pts: ['points', 'Points', 'MBL career', 'PTS'], reb: ['rebounds', 'Rebounds', 'MBL career', 'REB'], ast: ['assists', 'Assists', 'MBL career', 'AST'],
    stl: ['steals', 'Steals', 'MBL career', 'STL'], blk: ['blocks', 'Blocks', 'MBL career', 'BLK'], gp: ['games', 'Games', 'played in the MBL', 'GP']};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WINDOW = 72 * 3600e3, DUR = 7000, LS = 'hs-mhx-hide';
  const short = n => SHORT[n] || n;
  const hueOf = n => { if (HUE[n] != null) return HUE[n]; let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const dlong = iso => { const x = new Date(iso + 'T12:00:00+08:00'), [y, m, d] = iso.split('-'); return `${DOW[x.getUTCDay()]} ${+d} ${MON[+m - 1]} ${y}`; };
  const dshort = iso => { const [y, m, d] = iso.split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let LIST = [], DAY = null, I = 0, timer = null, paused = false, left = DUR, t0 = 0, bound = false;

  /* the latest MBL game day's career milestones, with everything the card shows */
  function items(force) {
    if (typeof msModel !== 'function' || !HS.hasBoxes()) return null;
    const m = msModel();
    // the latest MBL game day with a box score
    const day = m.comps.flatMap(c => c.games).filter(g => g.st === 'COMPLETE' && BOX_RAW[g.mid]).map(g => g.date).sort().pop();
    if (!day) return null;
    const games = m.comps.flatMap(c => c.games).filter(g => g.date === day && g.st === 'COMPLETE');
    const lastTip = Math.max(...games.map(g => typeof liveStart === 'function' ? (liveStart(g) || 0) : 0), new Date(day + 'T12:00:00+08:00').getTime());
    if (!force && Date.now() - lastTip > WINDOW) return null;
    const ach = m.ach.filter(a => a.sc === 'c' && a.d === day);
    let hi = [];
    try { hi = highs(day, m.comps); } catch (err) { hi = []; }
    if (!ach.length && !hi.length) return null;
    // career totals at the end of that day, for "to go" and the rank among Malaysian players
    const tot = {};
    m.rows.forEach(x => { if (x.d > day) return; const T = tot[x.pid] = tot[x.pid] || {pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, gp: 0}; T.gp++; ['pts', 'reb', 'ast', 'stl', 'blk'].forEach(k => { T[k] += x[k]; }); });
    const out = ach.map(a => {
      const x = m.rows.find(r => r.pid === a.pid && r.mid === a.mid) || {};
      const ladder = m.ach.filter(b => b.sc === 'c' && b.pid === a.pid && b.k === a.k && b.th <= a.th).sort((p, q) => p.th - q.th);
      const now = (tot[a.pid] || {})[a.k] || a.th;
      const rank = 1 + Object.entries(tot).filter(([pid, T]) => pid !== a.pid && T[a.k] > now).length;
      return {pid: a.pid, k: a.k, th: a.th, d: a.d, mid: a.mid, cid: a.cid, team: a.t, opp: a.o, my: (x.sc || [])[0], ot: (x.sc || [])[1], line: x, ladder, now, rank, hue: hueOf(a.t)};
    });
    // one milestone per player and stat (a big night can pass two 50s): keep the highest
    const best = {};
    out.forEach(e => { const k = e.pid + '|' + e.k; if (!best[k] || e.th > best[k].th) best[k] = e; });
    return {day, list: [...hi, ...Object.values(best).sort((p, q) => q.th - p.th || p.rank - q.rank)]};
  }

  /* ---------- career highs ---------- */
  const CH_K = ['pts', 'reb', 'ast', 'blk', 'stl'];
  const CH_MIN = {pts: 12, reb: 8, ast: 5, blk: 3, stl: 4};   // below these a new best is not news
  const CH_PRIOR = 5;                                          // games he must have played before
  let NAT = null;
  function natOf(pid) {
    if (!NAT) {
      NAT = {};
      [...COMPS].sort((a, b) => (a.start || String(a.year)).localeCompare(b.start || String(b.year)))
        .forEach(c => Object.values(c.roster || {}).forEach(rows => (rows || []).forEach(r => { if (r.nat) NAT[PALIAS[r.pid] || r.pid] = r.nat; })));
    }
    return NAT[pid] || '';
  }
  const clock = t => { const x = /(\d+):(\d+)\s*([AP]M)?/i.exec(t || ''); if (!x) return 0; let h = +x[1]; if (x[3]) h = h % 12 + (/p/i.test(x[3]) ? 12 : 0); return h * 60 + +x[2]; };
  function highs(day, mbl) {
    const mblIds = new Set(mbl.map(c => c.id)), today = new Set();
    mbl.forEach(c => c.games.forEach(g => { if (g.date === day && g.st === 'COMPLETE' && BOX_RAW[g.mid]) today.add(g.mid); }));
    const B = k => BKEYS.indexOf(k), iP = B('pid'), iM = B('min'), iTi = B('ti'), iF = B('fga');
    const ix = {pts: B('pts'), oreb: B('oreb'), dreb: B('dreb'), ast: B('ast'), stl: B('stl'), blk: B('blk')};
    const pids = new Set();
    today.forEach(mid => BOX_RAW[mid].p.forEach(r => { if (r[iP]) pids.add(PALIAS[r[iP]] || r[iP]); }));
    // every game of those players in the database, oldest first
    const hist = {};
    COMPS.forEach(c => (c.games || []).forEach(g => {
      const raw = g.st === 'COMPLETE' && BOX_RAW[g.mid]; if (!raw) return;
      raw.p.forEach(r => {
        const pid = PALIAS[r[iP]] || r[iP]; if (!pid || !pids.has(pid)) return;
        const n = i => +r[i] || 0, team = raw.t[r[iTi]] || '';
        const x = {pid, cid: c.id, mbl: mblIds.has(c.id), mid: g.mid, d: g.date, at: (g.date || '') + String(clock(g.time)).padStart(4, '0') + g.mid,
          t: team, o: team === g.h ? g.a : g.h, sc: team === g.h ? [g.hs, g.as] : [g.as, g.hs],
          pts: n(ix.pts), reb: n(ix.oreb) + n(ix.dreb), ast: n(ix.ast), stl: n(ix.stl), blk: n(ix.blk)};
        if (!(minsToNum(r[iM]) > 0) && !(x.pts || x.reb || x.ast || x.stl || x.blk || n(iF))) return;   // a DNP line
        (hist[pid] = hist[pid] || []).push(x);
      });
    }));
    const out = [];
    Object.entries(hist).forEach(([pid, L0]) => {
      L0.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
      const imp = natOf(pid) !== 'MAS', L = imp ? L0.filter(x => x.mbl) : L0;
      L.forEach((x, i) => {
        if (!today.has(x.mid)) return;
        const prior = L.slice(0, i);
        if (prior.length < CH_PRIOR) return;
        const ks = CH_K.filter(k => x[k] >= CH_MIN[k] && x[k] > Math.max(...prior.map(p => p[k])));
        if (!ks.length) return;
        const k = ks[0], best = prior.reduce((m, p) => p[k] > m[k] || (p[k] === m[k] && p.at > m.at) ? p : m, prior[0]);
        // each game in which he raised his best, up to this one
        const ladder = []; let top = 0;
        [...prior, x].forEach(p => { if (p[k] > top) { top = p[k]; ladder.push({th: p[k], d: p.d, o: p.o}); } });
        out.push({ch: 1, imp, pid, k, also: ks.slice(1).map(q => [q, x[q]]), th: x[k], prev: best[k], prevD: best.d, prevO: best.o, n: prior.length + 1,
          d: x.d, mid: x.mid, cid: x.cid, team: x.t, opp: x.o, my: x.sc[0], ot: x.sc[1], line: x, ladder, now: x[k], rank: 99, hue: hueOf(x.t)});
      });
    });
    return out.sort((a, b) => CH_K.indexOf(a.k) - CH_K.indexOf(b.k) || b.th - a.th || (b.th - b.prev) - (a.th - a.prev));
  }

  /* ---------- drawing ---------- */
  const photo = e => PHOTOS[e.pid] ? `<img src="${PHOTOS[e.pid]}" alt="">` : `<span class="ini">${esc(initials(personName(e.pid)))}</span>`;
  function slide(e) {
    if (e.ch) return slideHigh(e);
    const [lab, unit, sub, ab] = K[e.k], ln = e.line || {}, win = e.my > e.ot, crest = teamLogo(e.team);
    const gl = e.k === 'gp' ? `${ln.pts || 0} PTS · ${ln.reb || 0} REB · ${ln.ast || 0} AST` : `${ln[e.k] || 0} ${ab} in the game`;
    const steps = [...e.ladder.map(x => x.th), e.th + 50], mx = (e.th + 50) * 1.04, many = steps.length > 14;
    return {
      photo: photo(e),
      unit: `<b>${unit}</b><small>${sub}</small>`,
      name: `<span>${esc(personName(e.pid))}</span>`,
      meta: `<span class="chip">${crest ? `<img src="${crest}" alt="">` : ''}${esc(e.team)}</span>`
        + (e.my != null ? `<span class="chip res${win ? '' : ' l'}"><b>${win ? 'W' : 'L'} ${e.my}–${e.ot}</b> v ${esc(short(e.opp))}</span>` : '')
        + `<span class="chip">${esc(gl)}</span>` + (e.rank <= 10 ? `<span class="chip rank">${ord(e.rank)} among Malaysian players</span>` : ''),
      cta: `<a class="pri" href="#/p/${esc(e.pid)}">Profile</a><a href="#/c/${esc(e.cid)}/box/${esc(e.mid)}">Box score</a><a href="#/milestones">All milestones</a>`,
      climbN: `${e.ladder.length} milestone${e.ladder.length > 1 ? 's' : ''}`,
      steps: steps.map((th, k) => { const L = e.ladder[k], isNew = th === e.th, nx = k === steps.length - 1;
        return `<span class="st${isNew ? ' new' : ''}${nx ? ' next' : ''}${many && !isNew && !nx && k % 3 ? ' hide' : ''}" style="--sh:${(th / mx * 100).toFixed(1)}%;--sd:${(k * .045).toFixed(2)}s" data-mhxtip="${nx ? `${th} next · ${th - e.now} to go` : `${th} · ${dshort(L.d)} v ${esc(short(L.o))}`}"><span>${th}</span></span>`; }).join(''),
      nxt: `<span>Next: ${e.th + 50} ${lab}</span><b>${e.th + 50 - e.now} to go</b>`,
      climbT: 'The climb',
    };
  }
  function slideHigh(e) {
    const [, unit, , ab] = K[e.k], ln = e.line || {}, win = e.my > e.ot, crest = teamLogo(e.team);
    const steps = e.ladder, mx = e.th * 1.04, many = steps.length > 14;
    return {
      photo: photo(e),
      unit: `<b>${unit}</b><small>${e.imp ? 'MBL career high' : 'Career high'}</small>`,
      name: `<span>${esc(personName(e.pid))}</span>`,
      meta: `<span class="chip">${crest ? `<img src="${crest}" alt="">` : ''}${esc(e.team)}</span>`
        + (e.my != null ? `<span class="chip res${win ? '' : ' l'}"><b>${win ? 'W' : 'L'} ${e.my}–${e.ot}</b> v ${esc(short(e.opp))}</span>` : '')
        + `<span class="chip">${ln.pts || 0} PTS · ${ln.reb || 0} REB · ${ln.ast || 0} AST</span>`
        + e.also.map(([q, v]) => `<span class="chip rank">Also a career-high ${v} ${K[q][3]}</span>`).join(''),
      cta: `<a class="pri" href="#/p/${esc(e.pid)}">Profile</a><a href="#/c/${esc(e.cid)}/box/${esc(e.mid)}">Box score</a>`,
      climbN: `${e.n} game${e.n > 1 ? 's' : ''}${e.imp ? ' in the MBL' : ''}`,
      steps: steps.map((x, k) => { const isNew = k === steps.length - 1;
        return `<span class="st${isNew ? ' new' : ''}${many && !isNew && k && (steps.length - 1 - k) % 3 ? ' hide' : ''}" style="--sh:${(x.th / mx * 100).toFixed(1)}%;--sd:${(k * .045).toFixed(2)}s" data-mhxtip="${x.th} ${ab} · ${dshort(x.d)} v ${esc(short(x.o))}"><span>${x.th}</span></span>`; }).join(''),
      nxt: `<span>Previous best: ${e.prev} · ${esc(dshort(e.prevD))} v ${esc(short(e.prevO))}</span><b>+${e.th - e.prev}</b>`,
      climbT: 'New bests',
    };
  }
  function render() {
    const force = /[?&]milestones=last\b/.test(typeof location !== 'undefined' ? location.search || '' : '');
    let r = null;
    try { r = items(force); } catch (err) { r = null; }
    if (!r || !r.list.length) { LIST = []; return ''; }
    LIST = r.list; DAY = r.day; I = 0;
    const nCh = LIST.filter(x => x.ch).length, nMs = LIST.length - nCh;
    const eye = nCh && nMs ? 'Milestones &amp; career highs' : nCh ? `Career high${nCh > 1 ? 's' : ''}` : `Milestone${nMs > 1 ? 's' : ''}`;
    const hidden = !force && ls(LS) === DAY, e = LIST[0], s = slide(e), mark = COMPLOGOS['mbl-mark'] || COMPLOGOS.mbl, many = LIST.length > 1;
    const ctlBtn = (id, label, path, nav) => `<button type="button" class="${nav ? 'nav' : ''}" data-mhx="${id}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></button>`;
    return `<section class="mhx${hidden ? ' gone' : ''}" id="mhx" style="--mhh:${e.hue}" aria-roledescription="carousel" aria-label="MBL ${nCh && !nMs ? 'career highs' : 'milestones'}, ${esc(dlong(DAY))}" tabindex="-1">
      <div class="grain"></div><div class="ghostnum" id="mhx-ghost" aria-hidden="true">${e.th}</div>${teamLogo(e.team) ? `<img class="crestbg" id="mhx-crestbg" src="${teamLogo(e.team)}" alt="">` : '<img class="crestbg" id="mhx-crestbg" alt="" hidden>'}
      <canvas class="sparks" id="mhx-sparks" aria-hidden="true"></canvas>
      <div class="mhx-top">
        <div class="mhx-eye">${mark ? `<img src="${mark}" alt="MBL">` : ''}<span>${eye}<br><em>${esc(dlong(DAY))}</em></span></div>
        <div class="bars" id="mhx-bars"${many ? '' : ' hidden'}>${LIST.map((x, i) => `<button type="button" data-mhxi="${i}" aria-label="${i + 1} of ${LIST.length}: ${esc(personName(x.pid))}, ${x.th} ${K[x.k][0]}${x.ch ? ' (career high)' : ''}"><i></i></button>`).join('')}</div>
        <div class="ctl">${many ? ctlBtn('prev', 'Previous milestone', 'M15 5l-7 7 7 7', 1) + ctlBtn('pp', 'Pause', 'M8 5v14M16 5v14') + ctlBtn('next', 'Next milestone', 'M9 5l7 7-7 7', 1) : ''}${ctlBtn('x', 'Hide milestones', 'M6 6l12 12M18 6L6 18')}</div>
      </div>
      <div class="mhx-body" aria-live="polite">
        <div class="mhx-photo" id="mhx-photo">${s.photo}</div>
        <div class="mhx-main">
          <div class="mhx-num"><span class="odo" id="mhx-odo" aria-label="${e.th}">${e.th}</span><span class="unit" id="mhx-unit">${s.unit}</span></div>
          <h2 class="mhx-name" id="mhx-name">${s.name}</h2>
          <div class="mhx-meta" id="mhx-meta">${s.meta}</div>
          <div class="mhx-cta" id="mhx-cta">${s.cta}</div>
        </div>
        <div class="climb" role="group" aria-label="Milestones so far"><h3><span id="mhx-climbT">${s.climbT}</span> <b id="mhx-climbN">${s.climbN}</b></h3><div class="steps on" id="mhx-steps">${s.steps}</div><div class="nxt" id="mhx-nxt">${s.nxt}</div></div>
      </div>
    </section>
    <div class="mhx-mini${hidden ? ' show' : ''}" id="mhx-mini" style="--mhh:${e.hue}">${mark ? `<img src="${mark}" alt="MBL">` : ''}<span class="avs">${LIST.slice(0, 4).map(x => PHOTOS[x.pid] ? `<img src="${(DB.avatars || {})[x.pid] || PHOTOS[x.pid]}" alt="">` : '').join('')}</span><span>${nMs ? `${nMs} MBL milestone${nMs > 1 ? 's' : ''}` : ''}${nMs && nCh ? ' · ' : ''}${nCh ? `${nCh} career high${nCh > 1 ? 's' : ''}` : ''} · ${esc(dshort(DAY))}</span><button type="button" data-mhx="reopen">Show</button></div>`;
  }

  /* ---------- motion ---------- */
  const $ = id => document.getElementById(id);
  function odo(el, from, to) {
    const t = String(to), f = String(from).padStart(t.length, ' ');
    el.setAttribute('aria-label', t);
    el.innerHTML = t.split('').map(() => `<span><b>${Array.from({length: 10}, (_, k) => `<i>${k}</i>`).join('')}</b></span>`).join('');
    const cols = [...el.querySelectorAll('b')];
    cols.forEach((b, i) => { b.style.transition = 'none'; b.style.transform = `translateY(-${(f[i] === ' ' ? 0 : +f[i]) * 10}%)`; });
    el.offsetHeight;
    cols.forEach((b, i) => { b.style.transition = reduce() ? 'none' : `transform ${1.05 + i * .18}s cubic-bezier(.2,.9,.15,1)`; b.style.transform = `translateY(-${+t[i] * 10}%)`; });
  }
  function show(i, first) {
    const mh = $('mhx'); if (!mh || !LIST.length) return;
    I = (i + LIST.length) % LIST.length;
    const e = LIST[I];
    const paint = () => {
      if (!$('mhx')) return;
      const s = slide(e);
      mh.style.setProperty('--mhh', e.hue);
      $('mhx-ghost').textContent = e.th;
      const cb = $('mhx-crestbg'), lg = teamLogo(e.team); if (lg) { cb.src = lg; cb.hidden = false; } else cb.hidden = true;
      $('mhx-photo').innerHTML = s.photo; $('mhx-unit').innerHTML = s.unit; $('mhx-name').innerHTML = s.name; $('mhx-meta').innerHTML = s.meta; $('mhx-cta').innerHTML = s.cta;
      $('mhx-climbN').textContent = s.climbN; $('mhx-nxt').innerHTML = s.nxt; if ($('mhx-climbT')) $('mhx-climbT').textContent = s.climbT;
      mh.classList.toggle('ch', !!e.ch);
      const st = $('mhx-steps'); st.innerHTML = s.steps; st.classList.remove('on'); requestAnimationFrame(() => requestAnimationFrame(() => st.classList.add('on')));
      odo($('mhx-odo'), e.ch ? e.prev : Math.max(0, e.th - 50), e.th);
      mh.classList.remove('out', 'in', 'sweep'); mh.offsetHeight; mh.classList.add('in', 'sweep');
      setTimeout(sparks, reduce() ? 0 : 900);
      [...($('mhx-bars') || {children: []}).children].forEach((b, k) => { b.className = k < I ? 'done' : k === I ? 'cur' : ''; });
      mh.style.setProperty('--dur', DUR + 'ms');
      arm();
    };
    if (first || reduce()) paint(); else { mh.classList.add('out'); setTimeout(paint, 420); }
  }
  function arm() {
    clearTimeout(timer); t0 = Date.now(); left = DUR;
    if (LIST.length > 1 && !paused && !reduce()) timer = setTimeout(() => show(I + 1), left);
  }
  function pause(p) {
    const mh = $('mhx'); if (!mh || p === paused) return;
    paused = p; mh.classList.toggle('paused', p);
    const pp = mh.querySelector('[data-mhx="pp"]');
    if (pp) { pp.setAttribute('aria-label', p ? 'Play' : 'Pause'); pp.querySelector('path').setAttribute('d', p ? 'M7 4.5v15l12-7.5z' : 'M8 5v14M16 5v14'); }
    if (LIST.length < 2 || reduce()) return;
    if (p) { clearTimeout(timer); left -= Date.now() - t0; } else { t0 = Date.now(); timer = setTimeout(() => show(I + 1), Math.max(300, left)); }
  }
  function sparks() {
    if (reduce()) return;
    const cv = $('mhx-sparks'), mh = $('mhx'), od = $('mhx-odo');
    if (!cv || !mh || !od || mh.classList.contains('gone')) return;
    const r = mh.getBoundingClientRect(), o = od.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    const x = cv.getContext('2d'); if (!x) return; x.scale(dpr, dpr);
    const cx = o.left - r.left + o.width * .5, cy = o.top - r.top + o.height * .45, h = LIST[I] ? LIST[I].hue : 30;
    const P = Array.from({length: 34}, (_, i) => { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
      return {x: cx + Math.cos(a) * 20, y: cy + Math.sin(a) * 14, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, life: 1, r: 1 + Math.random() * 2.2, c: i % 3 ? `oklch(85% 0.12 ${h})` : '#fbd47c'}; });
    const start = performance.now();
    (function f(t) {
      x.clearRect(0, 0, r.width, r.height);
      let alive = false;
      P.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .07; p.vx *= .985; p.life -= .016; if (p.life > 0) { alive = true; x.globalAlpha = p.life; x.fillStyle = p.c; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); } });
      if (alive && t - start < 2000) requestAnimationFrame(f); else x.clearRect(0, 0, r.width, r.height);
    })(start);
  }
  function tipEl() { let t = $('mhx-tip'); if (!t) { t = document.createElement('div'); t.id = 'mhx-tip'; t.className = 'mhx-tip'; t.setAttribute('aria-hidden', 'true'); document.body.appendChild(t); } return t; }
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('click', ev => {
      const mh = $('mhx'); if (!mh) return;
      const bi = ev.target.closest('[data-mhxi]'); if (bi) { show(+bi.dataset.mhxi); return; }
      const b = ev.target.closest('[data-mhx]'); if (!b) return;
      const a = b.dataset.mhx;
      if (a === 'prev') show(I - 1);
      else if (a === 'next') show(I + 1);
      else if (a === 'pp') pause(!paused);
      else if (a === 'x') {
        clearTimeout(timer); ls(LS, DAY);
        const done = () => { mh.classList.add('gone'); $('mhx-mini').classList.add('show'); };
        if (reduce() || !mh.animate) done(); else mh.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(-8px) scale(.99)'}], {duration: 280, easing: 'ease-in'}).onfinish = done;
      } else if (a === 'reopen') {
        ls(LS, ''); $('mhx-mini').classList.remove('show'); mh.classList.remove('gone');
        mh.style.animation = 'none'; mh.offsetHeight; mh.style.animation = ''; paused = false; mh.classList.remove('paused'); show(0, true);
      }
    });
    document.addEventListener('pointermove', ev => {
      const mh = $('mhx');
      if (mh && ev.pointerType === 'mouse' && !reduce() && mh.contains(ev.target)) {
        const r = mh.getBoundingClientRect(), dx = (ev.clientX - r.left) / r.width - .5, dy = (ev.clientY - r.top) / r.height - .5;
        mh.style.transform = `perspective(1400px) rotateY(${dx * 2.2}deg) rotateX(${-dy * 2.2}deg)`;
        mh.style.setProperty('--px', dx * -26 + 'px'); mh.style.setProperty('--pxb', dx * 14 + 'px'); mh.style.setProperty('--pxp', dx * 10 + 'px');
        pause(true);
      } else if (mh && mh.style.transform && !mh.contains(ev.target)) {
        mh.style.transform = ''; ['--px', '--pxb', '--pxp'].forEach(v => mh.style.setProperty(v, '0px')); if (!mh.contains(document.activeElement)) pause(false);
      }
      const t = ev.target.closest && ev.target.closest('[data-mhxtip]'), tip = $('mhx-tip');
      if (!t) { if (tip) tip.classList.remove('on'); return; }
      const tp = tipEl(); tp.textContent = t.dataset.mhxtip; tp.classList.add('on');
      tp.style.left = Math.min(innerWidth - tp.offsetWidth - 10, ev.clientX + 12) + 'px'; tp.style.top = ev.clientY - 36 + 'px';
    });
    document.addEventListener('focusin', ev => { const mh = $('mhx'); if (mh && mh.contains(ev.target)) pause(true); });
    document.addEventListener('focusout', ev => { const mh = $('mhx'); if (mh && mh.contains(ev.target) && !mh.contains(ev.relatedTarget)) pause(false); });
    document.addEventListener('keydown', ev => { const mh = $('mhx'); if (!mh || !mh.contains(document.activeElement)) return; if (ev.key === 'ArrowRight') show(I + 1); if (ev.key === 'ArrowLeft') show(I - 1); });
    let sx = null;
    document.addEventListener('touchstart', ev => { const mh = $('mhx'); sx = mh && mh.contains(ev.target) ? ev.touches[0].clientX : null; }, {passive: true});
    document.addEventListener('touchend', ev => { if (sx == null) return; const d = ev.changedTouches[0].clientX - sx; if (Math.abs(d) > 50) show(I + (d < 0 ? 1 : -1)); sx = null; });
  }
  function after() {
    clearTimeout(timer);
    const mh = $('mhx'); if (!mh || !LIST.length) return;
    bind(); paused = false;
    if (!mh.classList.contains('gone')) show(0, true);
  }
  return {render, after, highs};
})();
function mhxAfterRender() { MHX.after(); }
