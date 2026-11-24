/* =========================================================================
   Today: the national team hero (update-132). Malaysia's twelve for the
   FIBA Asia Cup 2029 Pre-Qualifiers Second Round in Ulaanbaatar, stood as a
   two-row team photo (the cut-outs in data/ntfig, DB.ntfig), with a player
   card that moves on every 4.2 s and the window's three games along the
   floor. It shows above the next-game spotlight from now until 3.5 h after
   Mongolia v Malaysia tips off; ?nthero=show shows it whatever the date.
   Position, height, age and club come from the database; the shirt numbers
   (read off the team photos), the name split and the First Round averages
   (August 2026, a closed window) are fixed here.
   One global: NTX. Classes ntx-*.
   ========================================================================= */
const NTX = (() => {
  const CID = 'fiba-acpq-2029', LAST = 'fiba-132588', DWELL = 4200;
  // [pid, shirt, given name(s), family name, First Round pts/reb/ast if he played the August window]
  const SQUAD = [
    ['620479', 0, 'Chee Wei', 'Lim'],
    ['2092917', 1, 'Jia Hao', 'Hiew', [4.0, 1.3, 2.0]],
    ['1845447', 7, 'Zhen Jie', 'Tem'],
    ['1957810', 8, 'John · Khai Chiek', 'Wong'],
    ['2371569', 11, 'Yi Hou', 'Wong', [9.7, 2.7, 1.3]],
    ['2370342', 12, 'Tychique', 'Bosango', [12.7, 8.3, 2.7]],
    ['2302680', 18, 'Jing Hung', 'Lee', [5.0, 3.3, 0.7]],
    ['797690', 20, 'Soon Kang', 'Chong'],
    ['1885900', 21, 'Yi Hang', 'Te'],
    ['2371570', 22, 'Zi Fueng', 'Chang'],
    ['2252562', 27, 'Chun Hong', 'Ting', [13.0, 5.7, 2.3]],
    ['2371573', 71, 'Wei Yong', 'Ong', [6.7, 2.7, 2.7]],
  ].map(([pid, no, given, fam, aug]) => ({pid, no, given, fam, aug}));
  // team-photo order: the six tallest at the back, by number; the rest in front
  const BACK = ['1957810', '2371569', '2302680', '797690', '2371570', '2252562'];
  const FRONT = ['620479', '2092917', '1845447', '2370342', '1885900', '2371573'];
  const CODE = {Malaysia: 'MAS', Thailand: 'THA', Fiji: 'FIJ', Mongolia: 'MGL'};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = () => typeof liveNow === 'function' ? liveNow() : Date.now();
  const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const force = () => /[?&]nthero=show\b/.test(typeof location !== 'undefined' ? location.search || '' : '');
  const comp = () => COMP_BY_ID[CID];
  const MIDS = ['fiba-132590', 'fiba-132592', 'fiba-132588'];   // THA v MAS, MAS v FIJ, MGL v MAS
  const games = () => ((comp() || {}).games || []).filter(g => MIDS.includes(g.mid))
    .sort((a, b) => (liveStart(a) || 0) - (liveStart(b) || 0));
  const byPid = Object.fromEntries(SQUAD.map(p => [p.pid, p]));
  const S = {cur: 0, playing: true, held: false, el: 0, last: 0, holdUntil: 0, raf: 0, cd: 0};

  function active() {
    if (!comp() || !DB.ntfig) return false;
    if (force()) return true;
    const g = games().find(x => x.mid === LAST);
    const end = g && liveStart(g) != null ? liveStart(g) + LIVE_AFTER : Date.parse('2026-11-30T00:00:00+08:00');
    return now() < end;
  }

  /* ---------- the card ---------- */
  function bio(p) {
    const b = typeof cmpBio === 'function' ? cmpBio(p.pid) : {};
    const nt = typeof newsTeam === 'function' ? newsTeam(p.pid) : null;
    return {pos: b.pos || '', ht: b.ht ? Math.round(+b.ht) : '', age: b.age != null ? b.age : '', club: (nt && nt.team) || b.team || ''};
  }
  function card(i) {
    const p = SQUAD[i], b = bio(p);
    const note = p.aug
      ? `<span class="ntx-tag back">Back from August</span><span>First Round: <b>${p.aug[0].toFixed(1)}</b> pts · <b>${p.aug[1].toFixed(1)}</b> reb · <b>${p.aug[2].toFixed(1)}</b> ast</span>`
      : `<span class="ntx-tag new">Added for this window</span>`;
    const chips = [b.pos, b.ht ? b.ht + ' cm' : '', b.age !== '' ? b.age + ' yrs' : ''].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')
      + (b.club ? `<span class="ntx-club">${esc(b.club)}</span>` : '');
    return `<div class="ntx-num"><span>${p.no}</span></div>
      <div class="ntx-who"><div class="ntx-given">${esc(p.given)}</div><div class="ntx-fam">${esc(p.fam)}</div></div>
      <div class="ntx-meta">${chips}</div>
      <div class="ntx-note">${note}</div>`;
  }
  function figs() {
    const one = (ids, row) => ids.map((pid, i) => {
      const p = byPid[pid], x = row === 'back' ? (i + 1) / 7 : .1 + i * .16;
      const d = row === 'front' ? .05 + Math.abs(i - 2.5) * .07 : .3 + Math.abs(i - 2.5) * .07;   // the line-up rises from the middle out
      return `<button type="button" class="ntx-fig ${row}${pid === SQUAD[0].pid ? ' on' : ''}" data-ntx="${pid}" style="--x:${x.toFixed(4)};--d:${d.toFixed(2)}s" aria-label="#${p.no} ${esc(p.given.replace(' · ', ' '))} ${esc(p.fam)}">
        <img src="${DB.ntfig[pid] || ''}" alt="" draggable="false" decoding="async"><span class="ntx-pin">#${p.no}</span></button>`;
    }).join('');
    return one(BACK, 'back') + one(FRONT, 'front');
  }

  /* ---------- the floor: Group F and the three games ---------- */
  function cdText(s) {
    const ms = s - now();
    if (ms <= 0) return 'Live now';
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    return 'Tip-off in ' + (d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${Math.max(m, 1)}m`);
  }
  function fixtures() {
    const flag = n => { const f = (DB.natflags || {})[CODE[n]]; return f ? `<img src="${f}" alt="">` : ''; };
    const t = now(), list = games();
    const next = list.find(g => g.st !== 'COMPLETE' && g.st !== 'NOT_PLAYED' && liveStart(g) + LIVE_AFTER > t);
    return list.map((g, i) => {
      const s = liveStart(g), d = new Date(s + 8 * 3600e3), done = g.st === 'COMPLETE';
      const live = !done && t >= s - LIVE_BEFORE && t < s + LIVE_AFTER;
      const hm = (() => { const h = d.getUTCHours(), m = d.getUTCMinutes(); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; })();
      let when = `${WD[d.getUTCDay()]} ${hm} MYT`;
      if (done) { const mas = g.h === 'Malaysia' ? +g.hs : +g.as, opp = g.h === 'Malaysia' ? +g.as : +g.hs; when = `<b>${mas > opp ? 'W' : 'L'} ${mas}–${opp}</b> · Final`; }
      else if (g === next) when = `<b data-ntx-cd="${s}">${cdText(s)}</b> · ${when}`;
      const href = done ? (g.box ? `#/c/${CID}/box/${g.mid}` : `#/c/${CID}/schedule`) : live ? `#/live/${g.mid}` : `#/c/${CID}/schedule`;
      return `<a class="ntx-gm${g === next ? ' next' : ''}" href="${href}" style="--d:${(.9 + i * .1).toFixed(1)}s">
        <span class="ntx-day"><b>${d.getUTCDate()}</b><small>${MON[d.getUTCMonth()]}</small></span>
        <span class="ntx-vs">${flag(g.h)}<span class="ntx-t">${esc(g.h)}</span><em>v</em>${flag(g.a)}<span class="ntx-t">${esc(g.a)}</span></span>
        <span class="ntx-when">${when}</span></a>`;
    }).join('');
  }
  function group() {
    const rows = [];
    ((comp() || {}).stand || []).some((r, i, all) => { if (i && r.pos <= all[i - 1].pos) return true; rows.push(r); return false; });   // the first table is Group F
    const m = rows.find(r => r.team === 'Malaysia');
    const rec = m ? `<span>Malaysia ${m.w}–${m.l}, ${typeof ordinal === 'function' ? ordinal(m.pos) : m.pos} of ${rows.length}</span>` : '';
    return `<div class="ntx-grp"><b>Group F</b>${rec}<span>Top two go through</span></div>`;
  }

  function render() {
    if (!active()) return '';
    const ic = (d, fill) => `<svg viewBox="0 0 16 16" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${d}</svg>`;
    return `<section class="ntx" id="ntx" aria-labelledby="ntx-t">
      <div class="ntx-bg" aria-hidden="true"><div class="ntx-beam"></div><div class="ntx-floor"></div><div class="ntx-ghost">MALAYSIA</div><div class="ntx-grain"></div></div>
      <div class="ntx-head">
        <p class="ntx-eye"><span class="ntx-dot"></span>FIBA Asia Cup 2029 Pre-Qualifiers · Second Round</p>
        <h2 class="ntx-title" id="ntx-t"><span><i>Malaysia's twelve</i></span><span><i>for Ulaanbaatar</i></span></h2>
      </div>
      <div class="ntx-body">
        <div class="ntx-card" aria-live="polite">${card(0)}</div>
        <div class="ntx-ctl">
          <button type="button" data-ntx-go="-1" aria-label="Previous player">${ic('<path d="M10 3 5 8l5 5"/>')}</button>
          <button type="button" data-ntx-play aria-label="Pause">${ic('<rect x="3.5" y="3" width="3" height="10" rx="1"/><rect x="9.5" y="3" width="3" height="10" rx="1"/>', 1)}</button>
          <button type="button" data-ntx-go="1" aria-label="Next player">${ic('<path d="m6 3 5 5-5 5"/>')}</button>
          <span class="ntx-prog" aria-hidden="true"><i></i></span>
          <span class="ntx-count">01 / ${SQUAD.length}</span>
          <a class="ntx-prof" href="#/p/${SQUAD[0].pid}">Profile</a>
        </div>
      </div>
      <div class="ntx-stage" role="group" aria-label="The twelve players. Choose one to see his details.">${figs()}<div class="ntx-sweep" aria-hidden="true"></div></div>
      <div class="ntx-fix">${group()}${fixtures()}</div>
    </section>`;
  }

  /* ---------- motion and controls ---------- */
  function go(root, i) {
    S.cur = (i + SQUAD.length) % SQUAD.length; S.el = 0;
    const p = SQUAD[S.cur], c = root.querySelector('.ntx-card');
    c.innerHTML = card(S.cur); c.classList.remove('swap'); void c.offsetWidth; c.classList.add('swap');
    root.querySelectorAll('.ntx-fig').forEach(f => f.classList.toggle('on', f.dataset.ntx === p.pid));
    root.querySelector('.ntx-count').textContent = `${String(S.cur + 1).padStart(2, '0')} / ${SQUAD.length}`;
    const a = root.querySelector('a.ntx-prof'); a.href = '#/p/' + p.pid; a.setAttribute('aria-label', `Open ${p.fam}'s profile`);
    root.querySelector('.ntx-prog i').style.transform = 'scaleX(0)';
  }
  function setPlay(root, on) {
    S.playing = on;
    const b = root.querySelector('[data-ntx-play]');
    b.setAttribute('aria-label', on ? 'Pause' : 'Play');
    b.querySelector('svg').innerHTML = on ? '<rect x="3.5" y="3" width="3" height="10" rx="1"/><rect x="9.5" y="3" width="3" height="10" rx="1"/>'
      : '<path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z"/>';
  }
  function after() {
    const root = document.getElementById('ntx');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';
    S.cur = 0; S.el = 0; S.last = 0; S.held = false; S.holdUntil = performance.now() + 1400;   // the first player holds while the line-up rises
    setPlay(root, !reduce());
    const pick = pid => go(root, SQUAD.findIndex(p => p.pid === pid));
    root.addEventListener('click', e => {
      const f = e.target.closest('.ntx-fig'); if (f) { pick(f.dataset.ntx); return; }
      const g = e.target.closest('[data-ntx-go]'); if (g) { go(root, S.cur + +g.dataset.ntxGo); return; }
      if (e.target.closest('[data-ntx-play]')) setPlay(root, !S.playing);
    });
    root.querySelector('.ntx-stage').addEventListener('mouseover', e => {
      const f = e.target.closest('.ntx-fig');
      if (f && f.dataset.ntx !== SQUAD[S.cur].pid && matchMedia('(hover:hover)').matches) pick(f.dataset.ntx);
    });
    root.addEventListener('mouseenter', () => { S.held = true; });
    root.addEventListener('mouseleave', () => { S.held = false; });
    root.addEventListener('focusin', () => { S.held = true; });
    root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) S.held = false; });
    root.addEventListener('keydown', e => {
      if (e.target.closest('a')) return;
      if (e.key === 'ArrowRight') { go(root, S.cur + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { go(root, S.cur - 1); e.preventDefault(); }
    });
    cancelAnimationFrame(S.raf);
    const tick = t => {
      if (!root.isConnected) return;          // Today was left: stop
      S.raf = requestAnimationFrame(tick);
      const dt = S.last ? t - S.last : 0; S.last = t;
      if (!S.playing || S.held || t < S.holdUntil || document.hidden) return;
      S.el += dt;
      root.querySelector('.ntx-prog i').style.transform = `scaleX(${Math.min(S.el / DWELL, 1)})`;
      if (S.el >= DWELL) go(root, S.cur + 1);
    };
    S.raf = requestAnimationFrame(tick);
    clearInterval(S.cd);
    S.cd = setInterval(() => {
      if (!root.isConnected) { clearInterval(S.cd); return; }
      const b = root.querySelector('[data-ntx-cd]'); if (b) b.textContent = cdText(+b.dataset.ntxCd);
    }, 30000);
  }
  return {active, render, after};
})();
function ntxAfterRender() { NTX.after(); }
