/* ---------------------------- pathway ----------------------------
   The road a Malaysian player can take, from the U12 schools championship to
   the open game. Rows are age stages, columns are four lanes (schools and
   universities, club and state 5x5, 3x3, international). Where a stage is in
   this database, the card links to it and says how much of it is here.

   Part 2 hooks: an event's `logo` (a data URL or DB.complogos key) and a stage's
   `photo` are read if present; until then a database event wears its
   competition mark and anything else a monogram plate. */

const PW_LANES = [
  { key: 'school', name: 'Schools & universities', short: 'School', note: 'School sports councils and campus games' },
  { key: 'club', name: 'Club & state 5x5', short: '5x5', note: 'National age-group championships, state teams and leagues' },
  { key: 'x3', name: '3x3', short: '3x3', note: 'The half-court game, with its own age ladder' },
  { key: 'intl', name: 'International', short: 'International', note: 'Representing Malaysia abroad' },
];

// tier: a database tier key (series|level) — the card then links to the newest edition
// seq: a qualifier and the event it leads to, drawn as one two-step card
const PATHWAY = [
  { age: 'U12', cap: '12 and under', ev: [
    { lane: 'school', name: 'MSSM', full: 'Majlis Sukan Sekolah-Sekolah Malaysia', scope: 'Schools', mono: 'MSSM' } ] },
  { age: 'U15', cap: '15 and under', ev: [
    { lane: 'club', name: 'National U15', full: 'MILO Lum Mun Chak Cup', scope: 'National', tier: 'MILO Lum Mun Chak Cup|U15' } ] },
  { age: 'U16', cap: '16 and under', ev: [
    { lane: 'intl', seq: ['FIBA Asia U16 Qualifiers', 'FIBA Asia U16'], full: 'Qualify in the region, then play the continental championship', scope: 'FIBA', mono: 'FIBA' } ] },
  { age: 'U17', cap: '17 and under', ev: [
    { lane: 'club', name: 'National U17', full: 'MABA/MATRIX 17 & Below', scope: 'National', tier: 'MABA/MATRIX 17 & Below|U17' },
    { lane: 'x3', name: 'ASEAN U17 3x3', full: 'The region\'s under-17 3x3 championship', scope: 'International', mono: '3x3' } ] },
  { age: 'U18', cap: '18 and under', ev: [
    { lane: 'school', name: 'MSSM U18', full: 'Majlis Sukan Sekolah-Sekolah Malaysia', scope: 'Schools', mono: 'MSSM' },
    { lane: 'school', name: 'ASEAN School Games', full: 'Schools teams from across Southeast Asia', scope: 'International', mono: 'ASG' },
    { lane: 'intl', seq: ['FIBA Asia U18 Qualifiers', 'FIBA Asia U18'], full: 'Qualify in the region, then play the continental championship', scope: 'FIBA', mono: 'FIBA' } ] },
  { age: 'U20', cap: '20 and under', ev: [
    { lane: 'club', name: 'D-League U20', full: 'Malaysia D-League', scope: 'National league', tier: 'Malaysia D-League|U20' },
    { lane: 'club', name: 'SBL U20', full: 'Selangor Basketball League', scope: 'State league', tier: 'Selangor Basketball League|U20' } ] },
  { age: 'U21', cap: '21 and under', ev: [
    { lane: 'club', name: 'SUKMA', full: 'Sukan Malaysia', scope: 'State teams', tier: 'Sukan Malaysia|Open' },
    { lane: 'x3', name: 'FIBA 3x3 Nations League U21', full: 'FIBA\'s 3x3 national-team league', scope: 'International', mono: '3x3' } ] },
  { age: 'U23', cap: '23 and under', ev: [
    { lane: 'club', name: 'D-League U23', full: 'Malaysia D-League', scope: 'National league', tier: 'Malaysia D-League|U23' },
    { lane: 'x3', name: 'FIBA 3x3 Nations League U23', full: 'FIBA\'s 3x3 national-team league', scope: 'International', mono: '3x3' } ] },
  { age: 'College', cap: 'University & college', ev: [
    { lane: 'school', name: 'SUKIPT', full: 'Sukan Institusi Pengajian Tinggi', scope: 'Universities', mono: 'IPT' },
    { lane: 'school', name: 'ESP University League', full: 'Inter-university league', scope: 'Universities', mono: 'ESP' },
    { lane: 'intl', name: 'ASEAN University Games', full: 'University teams from across Southeast Asia', scope: 'Universities', mono: 'AUG' } ] },
  { age: 'Open', cap: 'Senior · no age limit', open: true, ev: [
    { lane: 'club', name: 'Major Basketball League', full: 'The top professional league', scope: 'Pro league', tier: 'Major Basketball League|Open' },
    { lane: 'club', name: 'Agong Cup', full: 'The national championship for state teams', scope: 'State teams', tier: 'Agong Cup|Open' },
    { lane: 'club', name: 'Tan See Seng Cup', full: 'Open championship', scope: 'National', mono: 'TSS' },
    { lane: 'club', name: 'MABA/MATRIX Cup', full: 'Open championship', scope: 'National', tier: 'MABA/MATRIX Cup|Open', only: 'For non-Chinese players only' } ] },
];

const PW = { lane: '' };

// what the database holds for one tier: editions (years), players, genders, newest competition
function pwStats(tier) {
  const cs = COMPS.filter(c => tierKey(c) === tier);
  if (!cs.length) return null;
  const years = [...new Set(cs.map(c => c.year).filter(Boolean))].sort((a, b) => a - b);
  const players = new Set();
  cs.forEach(c => (c.players || []).forEach(r => players.add(r.pid)));
  const g = new Set(cs.map(c => c.gender));
  const latest = cs.slice().sort((a, b) => (b.year || 0) - (a.year || 0) || (a.gender === 'Men' ? -1 : 1))[0];
  return { n: cs.length, years, players: players.size, both: g.has('Men') && g.has('Women'), latest };
}

function pwLogo(e, st) {
  if (e.logo) return `<span class="pw-logo"><img src="${COMPLOGOS[e.logo] || e.logo}" alt=""></span>`;
  if (st && compMark(st.latest)) return `<span class="pw-logo">${compCrest(st.latest, 40)}</span>`;
  const m = e.mono || (e.name || '').split(/[\s/]+/).map(w => w[0]).join('').slice(0, 4);
  return `<span class="pw-logo pw-mono" aria-hidden="true">${esc(m)}</span>`;
}

function pwCard(e) {
  const st = e.tier ? pwStats(e.tier) : null;
  const title = e.seq
    ? `<div class="pw-seq"><span>${esc(e.seq[0])}</span><i aria-hidden="true">↓</i><b>${esc(e.seq[1])}</b></div>`
    : `<div class="pw-name">${esc(e.name)}</div>`;
  const db = st ? `<a class="pw-db" href="#/c/${st.latest.id}">
      <span><b>${st.years.length}</b> ${st.years.length === 1 ? 'season' : 'seasons'}</span>
      <span><b>${st.players.toLocaleString()}</b> players</span>
      <span>${st.years[0] === st.years[st.years.length - 1] ? st.years[0] : st.years[0] + '–' + st.years[st.years.length - 1]}${st.both ? ' · men & women' : ''}</span>
      <em>Open ${st.latest.year} →</em></a>`
    : `<div class="pw-db off">Not in the database yet</div>`;
  return `<article class="pw-card lane-${e.lane}${st ? ' in-db' : ''}" data-pwlane="${e.lane}">
    <span class="pw-node" aria-hidden="true"></span>
    <div class="pw-top">${pwLogo(e, st)}<div class="pw-tt">${title}<div class="pw-full">${esc(e.full || '')}</div></div></div>
    <div class="pw-tags"><span class="pw-tag lane">${esc(PW_LANES.find(l => l.key === e.lane).short)}</span>${e.scope !== PW_LANES.find(l => l.key === e.lane).short ? `<span class="pw-tag">${esc(e.scope)}</span>` : ''}${e.only ? `<span class="pw-tag note">${esc(e.only)}</span>` : ''}</div>
    ${db}
  </article>`;
}

function renderPathway() {
  const all = PATHWAY.flatMap(s => s.ev);
  const inDb = all.filter(e => e.tier && pwStats(e.tier)).length;
  const lanes = PW_LANES.map(l => `<button class="pw-lg lane-${l.key} ${PW.lane === l.key ? 'on' : ''}" data-pwfilter="${l.key}" aria-pressed="${PW.lane === l.key}">
      <span class="sw" aria-hidden="true"></span><span><b>${esc(l.name)}</b><small>${esc(l.note)}</small></span></button>`).join('');
  // the climb: one step per stage, each a little higher than the last
  const steps = PATHWAY.map((s, i) => `<button class="pw-step" data-pwgo="${esc(s.age)}" style="--h:${Math.round(22 + i * (78 / (PATHWAY.length - 1)))}%">
      <span class="bar"></span><b>${s.age === 'College' ? '<span class="lf">College</span><span class="ls">Uni</span>' : esc(s.age)}</b><small>${s.ev.length}</small></button>`).join('');
  const rows = PATHWAY.map(s => {
    // the open game: every lane ends here, so its competitions sit side by side across the full width
    const cells = s.open ? `<div class="pw-cell pw-summit" data-pwlane="club"><div class="pw-summit-k">Every lane leads here</div><div class="pw-summit-g">${s.ev.map(pwCard).join('')}</div></div>` : PW_LANES.map(l => {
      const ev = s.ev.filter(e => e.lane === l.key);
      return `<div class="pw-cell lane-${l.key} ${ev.length ? 'has' : 'empty'}" data-pwlane="${l.key}">${ev.map(pwCard).join('')}</div>`;
    }).join('');
    return `<section class="pw-row ${s.open ? 'is-open' : ''}" id="pw-${esc(s.age)}" aria-label="${esc(s.age)}">
      <div class="pw-age"><div class="a">${esc(s.age)}</div><div class="c">${esc(s.cap)}</div>
        ${s.photo ? `<img class="pw-photo" src="${s.photo}" alt="">` : ''}</div>
      ${cells}
    </section>`;
  }).join('');
  return `<div class="pw ${PW.lane ? 'focus focus-' + PW.lane : ''}">
    <section class="pw-hero" aria-label="Pathway">
      <div class="pw-hero-in">
        <div class="pw-intro">
          <div class="pw-eyebrow">The Malaysian player pathway</div>
          <h1 class="pw-h1">From the school court<br>to the MBL</h1>
          <p class="pw-lede">Every stage a Malaysian player can climb, age by age: the schools championships, the national age-group cups, 3x3, the leagues and the national teams, up to the open game.</p>
          <dl class="pw-facts"><div><dt>Stages</dt><dd>${PATHWAY.length}</dd></div><div><dt>Competitions</dt><dd>${all.length}</dd></div><div><dt>In this database</dt><dd>${inDb}</dd></div></dl>
        </div>
        <div class="pw-climb" role="group" aria-label="Jump to a stage">${steps}</div>
      </div>
    </section>
    <div class="pw-body">
      <div class="pw-legend" role="group" aria-label="Highlight a lane">${lanes}</div>
      <div class="pw-grid">
        <div class="pw-head"><div></div>${PW_LANES.map(l => `<div class="lane-${l.key}"><span class="sw"></span>${esc(l.name)}</div>`).join('')}</div>
        ${rows}
      </div>
      <p class="pw-foot">Stages are the age limits each competition sets; a player can take part in more than one lane in the same year. Cards with numbers link to that competition's newest edition here.</p>
    </div>
  </div>`;
}

document.addEventListener('click', e => {
  const f = e.target.closest && e.target.closest('[data-pwfilter]');
  if (f) {
    PW.lane = PW.lane === f.dataset.pwfilter ? '' : f.dataset.pwfilter;
    const root = document.querySelector('.pw');
    if (root) {
      root.className = 'pw' + (PW.lane ? ' focus focus-' + PW.lane : '');
      root.querySelectorAll('[data-pwfilter]').forEach(b => { const on = b.dataset.pwfilter === PW.lane; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    }
    return;
  }
  const g = e.target.closest && e.target.closest('[data-pwgo]');
  if (g) {
    const el = document.getElementById('pw-' + g.dataset.pwgo);
    if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
});
