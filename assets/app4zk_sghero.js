/* =========================================================================
   Home: the signing hero. A signing the News items mark with
   spotlight: 'next-mbl-game' (data/news.json) opens the Home page in place of
   the MBL milestone hero, from the day it is announced until the next MBL
   game tips off; after that the milestone hero is back. The card shows the
   player's portrait, the new club's crest, the league's mark and the move
   (her last club in Malaysia to the new club abroad). Closing it is
   remembered for that signing. ?signing=show shows the newest spotlight
   signing whatever the date.
   One global: SGX. Classes sgx-*, custom property --sgh.
   ========================================================================= */
const SGX = (() => {
  const LS = 'hs-sgx-hide', CAP = 14 * 864e5;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // the new club's colour, read from its crest (oklch hue); others fall back to a hash
  const HUE = {'Etugen Panthers': 262};
  const NAT = {MGL: 'Mongolia', MAS: 'Malaysia'};
  // the country of a league abroad, for its flag
  const COUNTRY = [[/mongolia/i, 'MGL']];
  const hueOf = n => { if (HUE[n] != null) return HUE[n]; let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = () => typeof liveNow === 'function' ? liveNow() : Date.now();
  const force = () => /[?&]signing=show\b/.test(typeof location !== 'undefined' ? location.search || '' : '');
  const dlong = iso => { const [y, m, d] = iso.split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };
  const key = n => n.pid + '|' + n.date;

  // the newest spotlight signing, and the time its card gives way: the next MBL men's game's tip-off
  function pick() {
    const n = (typeof NEWS !== 'undefined' ? NEWS : DB.news || []).find(x => x.spotlight && x.pid && x.to && PERSONS[x.pid]);
    if (!n) return null;
    const since = Date.parse(n.date + 'T00:00:00+08:00');
    let next = null;
    if (typeof liveStart === 'function') COMPS.forEach(c => {
      if (c.series !== 'Major Basketball League' || c.gender === 'Women') return;
      c.games.forEach(g => {
        if (g.st === 'COMPLETE' || g.st === 'NOT_PLAYED') return;
        const s = liveStart(g);
        if (s != null && s > since && (!next || s < next)) next = s;
      });
    });
    return {n, since, until: Math.min(next || since + CAP, since + CAP)};
  }
  function active() {
    const p = pick();
    return !!p && (force() || (now() >= p.since && now() < p.until));
  }

  /* ---------- what the card says ---------- */
  // height, position and age from the newest roster that gives them
  function bio(pid) {
    const out = {};
    COMPS.slice().sort((a, b) => (b.end || '').localeCompare(a.end || '')).some(c => {
      Object.values(c.roster || {}).forEach(rows => (rows || []).forEach(r => {
        if (r.pid !== pid) return;
        if (!out.ht && r.ht) out.ht = r.ht;
        if (!out.pos && r.pos) out.pos = r.pos;
        if (!out.dob && r.dob) out.dob = r.dob;
      }));
      return out.ht && out.pos && out.dob;
    });
    if (out.dob) {
      const m = String(out.dob).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) {
        let y = +m[3]; if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
        const t = new Date(now()), b = new Date(y, +m[1] - 1, +m[2]);
        out.age = t.getFullYear() - y - (t < new Date(t.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
      }
    }
    return out;
  }
  // her latest club in the database: a club, not a state side or the national team
  function lastClub(pid) {
    const rows = (CAREER[pid] || []).filter(x => x.p.team && !stateSlug(x.p.team) && !natFlag(x.p.team))
      .sort((a, b) => (b.c.end || '').localeCompare(a.c.end || ''));
    return rows.length ? rows[0].p.team : '';
  }
  const flag = c => { const f = (DB.natflags || {})[c]; return f ? `<img class="sgx-flag" src="${f}" alt="" width="20" height="15">` : ''; };
  const POS = {PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Centre', G: 'Guard', F: 'Forward'};

  function render() {
    const p = pick();
    if (!p || !(force() || (now() >= p.since && now() < p.until))) return '';
    const n = p.n, pid = n.pid, name = personName(pid), hue = hueOf(n.to), crest = teamLogo(n.to), mark = n.mark ? COMPLOGOS[n.mark] : null;
    const b = bio(pid), from = lastClub(pid), fromLogo = from ? teamLogo(from) : null;
    const cc = (COUNTRY.find(([re]) => re.test(n.league || '')) || [])[1] || '';
    const caps = typeof pvCapsCount === 'function' && DB.caps ? pvCapsCount(pid).all : 0;   // as the profile counts them
    const hidden = !force() && ls(LS) === key(n);
    // the name over two lines, in the database's order: the last word on its own line
    const parts = name.split(' '), cut = parts.length > 2 ? parts.length - 1 : 1;
    const lines = parts.length > 1 ? [parts.slice(0, cut).join(' '), parts.slice(cut).join(' ')] : [name];
    const photo = PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="">` : `<span class="ini">${esc(initials(name))}</span>`;
    const chips = [
      caps ? `<span class="chip">${flag('MAS')}Malaysia · <b>${caps}</b> national cap${caps > 1 ? 's' : ''}</span>` : '',
      b.pos || b.ht ? `<span class="chip">${esc([POS[b.pos] || b.pos, b.ht ? b.ht + ' cm' : ''].filter(Boolean).join(' · '))}</span>` : '',
      b.age ? `<span class="chip">Age <b>${b.age}</b></span>` : '',
    ].join('');
    const node = (img, label, sub, cls) => `<div class="sgx-node ${cls}"><span class="disc">${img || `<span class="ini">${esc(initials(label))}</span>`}</span><b>${esc(label)}</b><small>${sub}</small></div>`;
    return `<section class="sgx${hidden ? ' gone' : ''}" id="sgx" style="--sgh:${hue}" aria-label="Signing: ${esc(name)} joins ${esc(n.to)}" tabindex="-1">
      <div class="grain"></div><div class="ghost" aria-hidden="true">Signed</div>${crest ? `<img class="crestbg" src="${crest}" alt="">` : ''}
      <div class="sgx-top">
        <div class="sgx-eye"><span class="dot"></span><span>Official signing<em>${esc(dlong(n.date))}</em></span></div>
        <button type="button" class="sgx-x" data-sgx="x" aria-label="Hide this signing"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="sgx-body">
        <div class="sgx-photo">${photo}</div>
        <div class="sgx-main">
          <div class="sgx-kick">${cc ? flag(cc) : ''}<span>Asian import · ${esc(NAT[cc] || n.league || 'abroad')}</span></div>
          <h2 class="sgx-name">${lines.map((l, i) => `<span style="--i:${i}"><i>${esc(l)}</i></span>`).join('')}</h2>
          <p class="sgx-sub">signs with ${crest ? `<img src="${crest}" alt="">` : ''}<b>${esc(n.to)}</b></p>
          ${n.note ? `<p class="sgx-note">${esc(n.note)}</p>` : ''}
          <div class="sgx-meta">${chips}</div>
          <div class="sgx-cta"><a class="pri" href="#/p/${esc(pid)}">Profile</a><a href="#/p/${esc(pid)}/stats">Career stats</a></div>
        </div>
        <div class="sgx-move" role="group" aria-label="The move">
          <h3>The move</h3>
          <div class="sgx-route">
            ${node(fromLogo ? `<img src="${fromLogo}" alt="">` : flag('MAS'), from || 'Malaysia', `${flag('MAS')}Malaysia`, 'from')}
            <svg class="arc" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true"><path d="M4 32 C 40 -4, 80 -4, 116 32" pathLength="1"/><circle r="3.2"><animateMotion dur="1.1s" begin="indefinite" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".3 0 .2 1" path="M4 32 C 40 -4, 80 -4, 116 32"/></circle></svg>
            ${node(crest ? `<img src="${crest}" alt="">` : '', n.to, `${cc ? flag(cc) : ''}${esc(NAT[cc] || '')}`, 'to')}
          </div>
          ${mark || n.league ? `<div class="sgx-league">${mark ? `<span class="plate"><img src="${mark}" alt="${esc(n.league || '')}"></span>` : ''}<span><small>League</small><b>${esc(n.league || '')}</b></span></div>` : ''}
        </div>
      </div>
    </section>
    <div class="sgx-mini${hidden ? ' show' : ''}" id="sgx-mini" style="--sgh:${hue}">${crest ? `<img class="cr" src="${crest}" alt="">` : ''}${PHOTOS[pid] ? `<img class="av" src="${(DB.avatars || {})[pid] || PHOTOS[pid]}" alt="">` : ''}<span><b>${esc(name)}</b> signs with ${esc(n.to)}</span><button type="button" data-sgx="reopen">Show</button></div>`;
  }

  /* ---------- motion ---------- */
  const $ = id => document.getElementById(id);
  let bound = false, KEY = '';
  function play() {
    const el = $('sgx'); if (!el || el.classList.contains('gone')) return;
    el.classList.remove('in', 'flying'); el.offsetHeight; el.classList.add('in');
    // the dot flies the arc as it draws, and rests at the new club; with no motion it just sits there
    const am = el.querySelector('animateMotion'), dot = el.querySelector('.arc circle');
    const land = () => { if (dot) dot.setAttribute('transform', 'translate(116 32)'); el.classList.add('flying'); };
    if (am && !reduce() && am.beginElement) setTimeout(() => { if (dot) dot.removeAttribute('transform'); el.classList.add('flying'); try { am.beginElement(); } catch (e) { land(); } }, 780);
    else land();
  }
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('click', ev => {
      const b = ev.target.closest('[data-sgx]'); if (!b) return;
      const el = $('sgx'), mini = $('sgx-mini'); if (!el) return;
      if (b.dataset.sgx === 'x') {
        ls(LS, KEY);
        const done = () => { el.classList.add('gone'); if (mini) mini.classList.add('show'); };
        if (reduce() || !el.animate) done(); else el.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(-8px) scale(.99)'}], {duration: 280, easing: 'ease-in'}).onfinish = done;
      } else if (b.dataset.sgx === 'reopen') {
        ls(LS, ''); if (mini) mini.classList.remove('show'); el.classList.remove('gone'); play();
      }
    });
    // a light tilt and parallax under the mouse
    document.addEventListener('pointermove', ev => {
      const el = $('sgx'); if (!el || ev.pointerType !== 'mouse' || reduce()) return;
      if (el.contains(ev.target)) {
        const r = el.getBoundingClientRect(), dx = (ev.clientX - r.left) / r.width - .5, dy = (ev.clientY - r.top) / r.height - .5;
        el.style.transform = `perspective(1400px) rotateY(${dx * 2}deg) rotateX(${-dy * 2}deg)`;
        el.style.setProperty('--px', dx * -24 + 'px'); el.style.setProperty('--pxp', dx * 10 + 'px');
      } else if (el.style.transform) { el.style.transform = ''; el.style.setProperty('--px', '0px'); el.style.setProperty('--pxp', '0px'); }
    });
  }
  function after() {
    const el = $('sgx'); if (!el) return;
    const p = pick(); KEY = p ? key(p.n) : '';
    bind(); play();
  }
  return {active, render, after};
})();
function sgxAfterRender() { SGX.after(); }
