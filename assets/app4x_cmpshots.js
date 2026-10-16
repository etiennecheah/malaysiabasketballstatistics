/* =========================================================================
   Compare page: the two players' shot terrains against each other (after the
   NBA Index head-to-head). One court with both surfaces laid over each other
   ("Overlay"), or two courts side by side that turn together ("Dual").
   Height is the share of his own shots, so both terrains sit on one scale
   whatever their number of attempts; colour says whose terrain it is (blue the
   left player, orange the right, as on the rest of the page) and its lightness
   his FG% against the average from that spot in the same event.
   Data: his stats/shp file and the events' stats/sh files (app4u_shots.js),
   drawn with three.js (loaded once by app4w_shot3d.js). Two renderers live for
   the whole visit; their canvases are moved into each render of the page.
   ========================================================================= */
const CS = {mode: 'overlay', scope: '', key: '', view: 'broadcast', st: null, mk: null, raf: 0, drag: null, ro: null};
try { const m = localStorage.getItem('hs-cmpshot-mode'); if (m === 'overlay' || m === 'dual') CS.mode = m; } catch (e) {}
const CS_STEP = 0.25, CS_NX = 60, CS_ND = 46, CS_CW = 15, CS_CL = 11.5, CS_PEAK = 1.8, CS_EXP = 1.5;
const CS_RAMP = {
  a: [[-0.2, [30, 72, 140]], [-0.09, [45, 103, 190]], [0, [74, 140, 226]], [0.09, [118, 182, 250]], [0.2, [178, 218, 255]]],
  b: [[-0.2, [128, 58, 20]], [-0.09, [178, 86, 32]], [0, [226, 122, 52]], [0.09, [246, 160, 96]], [0.2, [255, 206, 160]]]};
const CS_VIEWS = {broadcast: {th: 0, ph: 0.98, r: 21, t: [0, 0.4, 5.2]}, baseline: {th: Math.PI * 0.86, ph: 1.12, r: 16, t: [0, 0.8, 5.5]},
  side: {th: -Math.PI / 2, ph: 1.0, r: 19, t: [0, 0.4, 5.2]}, top: {th: 0, ph: 0.02, r: 22, t: [0, 0, 5.75]}};

/* ------------------------------------------------------------ which shots */
// the scopes on offer: the page's own competition (or season), every event both played, each career
function csScopes(A, B, fieldCids, fieldLabel) {
  const has = (p, c) => !!(SHP_DATA[p] && SHP_DATA[p].E[c] && SHP_DATA[p].E[c].length);
  const out = [];
  const fc = (fieldCids || []).filter(c => has(A, c) && has(B, c));
  if (fc.length) out.push({k: 'field', label: fieldLabel, cids: fc});
  const both = Object.keys(SHP_DATA[A].E).filter(c => has(A, c) && has(B, c) && COMP_BY_ID[c]);
  if (both.length && both.length !== fc.length) out.push({k: 'shared', label: `Every event both played (${both.length})`, cids: both});
  out.push({k: 'career', label: 'Career', cids: null});
  return out;
}
const csList = (pid, sc) => { const all = smAllShots(pid); return sc.cids ? all.filter(s => sc.cids.includes(s.cid)) : all; };
// one player's surfaces: share of his shots around each 0.25 m cell, and his FG% there against the average
function csSurf(L) {
  const by = {}; L.forEach(s => { by[s.cid] = (by[s.cid] || 0) + 1; });
  const n = CS_NX * CS_ND, lg = new Float32Array(n), dens = new Float32Array(n), diff = new Float32Array(n);
  Object.entries(by).forEach(([cid, c]) => { if (!SH_DATA[cid]) return; const S = smLeagueSurf(cid); for (let k = 0; k < n; k++) lg[k] += S[k] * c / L.length; });
  let max = 0;
  for (let j = 0; j < CS_ND; j++) for (let i = 0; i < CS_NX; i++) {
    const x = -7.5 + (i + 0.5) * CS_STEP, d = (j + 0.5) * CS_STEP; let a1 = 0, a = 0, m = 0;
    for (const s of L) {
      const dx = s.x - x, dd = s.y + SM_RIM - d, r2 = dx * dx + dd * dd; if (r2 > 25) continue;
      a1 += Math.exp(-r2 / (2 * 0.85 * 0.85)); const k = Math.exp(-r2 / (2 * 1.6 * 1.6)); a += k; m += k * s.made;
    }
    const q = j * CS_NX + i, L0 = lg[q] || 0.42;
    dens[q] = L.length ? a1 / L.length : 0; diff[q] = (m + 3 * L0) / (a + 3) - L0; if (dens[q] > max) max = dens[q];
  }
  return {dens, diff, max};
}
function csColor(side, v) {
  const S = CS_RAMP[side]; v = Math.max(-0.2, Math.min(0.2, v)); let k = 0; while (k < S.length - 2 && v > S[k + 1][0]) k++;
  const [v0, c0] = S[k], [v1, c1] = S[k + 1], t = (v - v0) / (v1 - v0);
  return c0.map((x, i) => (x + (c1[i] - x) * t) / 255);
}
const csOn = (sd, i, j) => i >= 0 && j >= 0 && i < CS_NX && j < CS_ND && sd.dens[j * CS_NX + i] > CS.maxd * 0.05;
function csHeights(sd) {
  const W = CS_NX + 1, Z = new Float32Array(W * (CS_ND + 1)), thr = CS.maxd * 0.05;
  for (let j = 0; j <= CS_ND; j++) for (let i = 0; i <= CS_NX; i++) {
    let v = 0, c = 0;
    for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && b >= 0 && a < CS_NX && b < CS_ND) { v += sd.dens[b * CS_NX + a]; c++; }
    v /= c; Z[j * W + i] = v > thr ? CS_PEAK * Math.pow(v / CS.maxd, CS_EXP) : 0;
  }
  sd.Z = Z;
}
function csHeight(sd, x, d) {
  const fi = (x + 7.5) / CS_STEP, fj = d / CS_STEP, i = Math.floor(fi), j = Math.floor(fj);
  if (!sd || !sd.Z || !csOn(sd, i, j)) return 0;
  const u = fi - i, v = fj - j, Z = sd.Z, W = CS_NX + 1;
  return (Z[j * W + i] * (1 - u) + Z[j * W + i + 1] * u) * (1 - v) + (Z[(j + 1) * W + i] * (1 - u) + Z[(j + 1) * W + i + 1] * u) * v;
}

/* ------------------------------------------------------------ the card */
function cmpShotCard(A, B, fieldCids, fieldLabel) {
  if (typeof smHas !== 'function' || !smHas(A) || !smHas(B)) return '';
  const nameA = personName(A), nameB = personName(B);
  const wrap = inner => `<div class="card cmp-card cs-card" id="cs-card">
    <div class="card-head">Shot terrain<span class="head-sub">where each of them shoots from, and how well, on one court</span></div>${inner}</div>`;
  const wait = msg => wrap(`<div class="empty-row" style="padding:18px 20px"><span class="empty-dot"></span>${msg}</div>`);
  if (!SHP_DATA[A] || !SHP_DATA[B]) {
    ensurePlayerShots(A); ensurePlayerShots(B);
    return wait(SHP_ST[A] === 'error' || SHP_ST[B] === 'error' ? 'The shot charts could not be loaded. Refresh the page to try again.' : 'Loading the shot charts…');
  }
  const fk = (fieldCids || []).join(',');
  if (fk !== CS.fk) { CS.fk = fk; CS.scope = ''; }        // the page's competition or season changed: follow it
  const scopes = csScopes(A, B, fieldCids, fieldLabel);
  let sc = scopes.find(s => s.k === CS.scope) || scopes[0]; CS.scope = sc.k;
  const cids = [...new Set([...csList(A, sc), ...csList(B, sc)].map(s => s.cid))];
  const missing = cids.filter(c => !SH_DATA[c]);
  if (missing.length) {
    missing.forEach(ensureShots);
    return wait(missing.some(c => SH_ST[c] === 'error') ? 'The shot charts could not be loaded. Refresh the page to try again.' : 'Loading the shot charts…');
  }
  sm3dEnsure();
  const LA = csList(A, sc), LB = csList(B, sc), sa = smSummary(LA), sb = smSummary(LB);
  const ga = new Set(LA.map(s => s.mid)).size, gb = new Set(LB.map(s => s.mid)).size;
  const who = (side, pid, name, s, g) => { const fg = s.a ? s.m / s.a : 0, dv = fg - s.exp;
    return `<div class="cs-who ${side}"><span class="cs-ph">${PHOTOS[pid] ? `<img src="${PHOTOS[pid]}" alt="">` : `<span>${esc(initials(name))}</span>`}</span>
      <span class="cs-wt"><span class="cs-n">${esc(name)}</span><span class="cs-s">${esc(sc.k === 'career' ? 'Career' : sc.label)}</span>
      <span class="cs-stats"><span><span class="cs-lbl">FG%</span><span class="cs-big">${s.a ? smPct(fg) : '–'}</span></span>
      <span class="cs-mini">FGA <b>${s.a.toLocaleString('en')}</b> · ${g} game${g === 1 ? '' : 's'}<br>vs avg <b class="${smCls(dv)}">${s.a ? smDiff(dv) : '–'}</b></span></span></span></div>`; };
  const nOf = s => `${csList(A, s).length} · ${csList(B, s).length}`;
  const three = sm3dReady();
  const stage = (id, side, tag) => `<div class="cs-stage ${side}" id="${id}" tabindex="0" aria-label="Shot terrain. Drag to rotate, scroll to zoom; with it selected the arrow keys rotate.">
      ${tag ? `<div class="cs-tag">${tag}</div>` : ''}</div>`;
  const ramp = side => `<span class="cs-ramp">${CS_RAMP[side].map(([, c]) => `<i style="background:rgb(${c.join(',')})"></i>`).join('')}</span>`;
  const courts = SM3.st === 'loading' || SM3.st === ''
    ? `<div class="cs-stages"><div class="cs-stage cs-wait"><span>Loading the 3D courts…</span></div></div>`
    : three ? `<div class="cs-stages${CS.mode === 'dual' ? ' dual' : ''}">
        ${stage('cs-s1', 'a', CS.mode === 'dual' ? `${esc(nameA)}<span>FGA ${LA.length}</span>` : '')}
        ${CS.mode === 'dual' ? stage('cs-s2', 'b', `${esc(nameB)}<span>FGA ${LB.length}</span>`) : ''}
        <div class="cs-views" role="group" aria-label="Camera">${Object.keys(CS_VIEWS).map(v => `<button data-csview="${v}" aria-pressed="${CS.view === v}">${{broadcast: 'Broadcast', baseline: 'Baseline', side: 'Sideline', top: 'Top'}[v]}</button>`).join('')}</div>
      </div>`
      : `<div class="cs-stages"><div class="cs-stage cs-wait"><span>This browser cannot draw the 3D courts (WebGL is off). The zone table below has every number.</span></div></div>`;
  const inner = `<div class="cs-duel">
      <div class="cs-head">${who('a', A, nameA, sa, ga)}
        <div class="cs-mid"><span class="cs-vs">VS</span>
          <span class="cs-seg" role="group" aria-label="Layout"><button data-csmode="overlay" aria-pressed="${CS.mode === 'overlay'}">Overlay</button><button data-csmode="dual" aria-pressed="${CS.mode === 'dual'}">Dual</button></span></div>
        ${who('b', B, nameB, sb, gb)}</div>
      ${scopes.length > 1 ? `<div class="cs-scope" role="group" aria-label="Shots from">${scopes.map(s => `<button data-csscope="${s.k}" aria-pressed="${s.k === sc.k}">${esc(s.label)}<small>${nOf(s)}</small></button>`).join('')}</div>` : ''}
      ${courts}
      <div class="cs-key"><span>${ramp('a')} ${esc(nameA)}</span><span>${ramp('b')} ${esc(nameB)}</span><span>Height: share of his shots · Brighter: better than the average from there</span></div>
      <div class="cs-read" aria-live="polite"><div class="cs-rp a" id="cs-ra"></div><div class="cs-rz" id="cs-rz"></div><div class="cs-rp b" id="cs-rb"></div></div>
      <div class="cs-zones" role="group" aria-label="Zones">${Object.keys(SM_ZONES).map(z => `<button data-csz="${z}" aria-pressed="false">${SM_ZONES[z]}</button>`).join('')}</div>
    </div>
    <div class="tbl-wrap cs-tbl">${csTable(LA, LB, nameA, nameB)}</div>
    <div class="note">Height is the share of his own shots that come from around a spot (each shot spread over about 85 cm), so both terrains sit on one scale whatever their number of attempts; in <b>Overlay</b>, where one surface rises above the other, he goes there more. Colour is whose terrain it is; brighter means his FG% from there beats the average from the same spot in the same event. Versus average = his FG% minus what an average shooter in the same events would make from his spots. In <b>Dual</b> the two courts turn together.</div>`;
  CS.pending = {A, B, sc, LA, LB, key: [A, B, sc.k, (sc.cids || []).join(',')].join('|')};
  return wrap(inner);
}
function csZone(L, z) { const zs = L.filter(s => s.z === z), a = zs.length, m = zs.reduce((t, s) => t + s.made, 0), avg = a ? zs.reduce((t, s) => t + smAvgOf(s), 0) / a : 0; return {a, m, fg: a ? m / a : 0, avg, freq: L.length ? a / L.length : 0}; }
function csTable(LA, LB, nameA, nameB) {
  const rows = Object.keys(SM_ZONES).map(z => [z, csZone(LA, z), csZone(LB, z)]).filter(([, a, b]) => a.a + b.a).sort((p, q) => (q[1].a + q[2].a) - (p[1].a + p[2].a));
  const la = esc(nameA.split(' ').pop()), lb = esc(nameB.split(' ').pop());
  return `<table class="cs-table"><thead><tr><th>Zone</th><th>${la} FG</th><th>${la} FG%</th><th>${la} share</th><th>${lb} FG</th><th>${lb} FG%</th><th>${lb} share</th></tr></thead><tbody>
    ${rows.map(([z, a, b]) => `<tr><td>${SM_ZONES[z]}</td><td>${a.m}/${a.a}</td><td class="ca">${a.a ? smPct(a.fg) : '–'}</td><td>${smPct(a.freq)}</td><td>${b.m}/${b.a}</td><td class="cb">${b.a ? smPct(b.fg) : '–'}</td><td>${smPct(b.freq)}</td></tr>`).join('')}</tbody></table>`;
}
function csReadout(x, d) {
  const P = CS.pending; if (!P) return;
  const z = smZoneAt(x, d), $ = id => document.getElementById(id);
  if (!$('cs-rz')) return;
  $('cs-rz').innerHTML = `<div class="z">${SM_ZONES[z]}</div><div class="d">${Math.hypot(x, d - SM_RIM).toFixed(1)} m from the rim</div>`;
  [['a', P.LA, P.A], ['b', P.LB, P.B]].forEach(([side, L, pid]) => {
    const q = csZone(L, z), dv = q.fg - q.avg;
    $('cs-r' + side).innerHTML = `<div class="rn">${esc(personName(pid))}</div><div class="rg">
      <div><small>FGM</small><b>${q.m}</b></div><div><small>FGA</small><b>${q.a}</b></div><div><small>FG%</small><b>${q.a ? smPct(q.fg) : '–'}</b></div>
      <div><small>Share</small><b>${smPct(q.freq)}</b></div><div><small>Vs avg</small><b class="${q.a ? smCls(dv) : ''}">${q.a ? smDiff(dv) : '–'}</b></div></div>`;
  });
  document.querySelectorAll('[data-csz]').forEach(b => b.setAttribute('aria-pressed', b.dataset.csz === z));
}

/* ------------------------------------------------------------ the scenes */
function csCourtTex(alpha, grid) {
  const c = document.createElement('canvas'), s = 100; c.width = CS_CW * s; c.height = CS_CL * s;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  if (grid) { g.strokeStyle = 'rgba(140,160,200,.16)'; g.lineWidth = 2;
    for (let x = 1; x < CS_CW; x++) { g.beginPath(); g.moveTo(x * s, 0); g.lineTo(x * s, c.height); g.stroke(); }
    for (let d = 1; d < CS_CL; d++) { g.beginPath(); g.moveTo(0, d * s); g.lineTo(c.width, d * s); g.stroke(); } }
  g.strokeStyle = `rgba(255,255,255,${alpha})`; g.lineWidth = 6; g.lineJoin = 'round';
  const X = x => (x + 7.5) * s, Y = d => d * s;
  g.strokeRect(3, 3, c.width - 6, c.height + 20); g.strokeRect(X(-2.45), Y(0), 4.9 * s, 5.8 * s);
  g.beginPath(); g.arc(X(0), Y(5.8), 1.8 * s, 0, Math.PI); g.stroke();
  g.beginPath(); g.arc(X(0), Y(SM_RIM), 1.25 * s, 0, Math.PI); g.stroke();
  const a3 = Math.asin(6.6 / 6.75);
  g.beginPath(); g.moveTo(X(-6.6), 0); g.lineTo(X(-6.6), Y(SM_RIM + 6.75 * Math.cos(a3))); g.arc(X(0), Y(SM_RIM), 6.75 * s, Math.PI / 2 + a3, Math.PI / 2 - a3, true); g.lineTo(X(6.6), 0); g.stroke();
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
function csScene(sides) {
  const T = THREE, S = {sides, scene: new T.Scene(), camera: new T.PerspectiveCamera(38, 1, 0.1, 200), terr: {}, seams: {}};
  S.scene.add(new T.HemisphereLight(0xdfe8ff, 0x1a2030, 0.55));
  const sun = new T.DirectionalLight(0xffffff, 0.62); sun.position.set(-6, 12, 14); S.scene.add(sun);
  const apron = new T.Mesh(new T.PlaneGeometry(CS_CW + 6, CS_CL + 6), new T.MeshStandardMaterial({color: 0x0d1422, roughness: 1}));
  apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.02, CS_CL / 2); S.scene.add(apron);
  S.floor = new T.Mesh(new T.PlaneGeometry(CS_CW, CS_CL), new T.MeshStandardMaterial({color: 0x16203a, roughness: 1, emissive: 0xffffff, emissiveMap: CS.tex.floor, emissiveIntensity: 0.5}));
  S.floor.rotation.x = -Math.PI / 2; S.floor.position.set(0, 0, CS_CL / 2); S.scene.add(S.floor);
  sides.forEach((sd, k) => {
    S.terr[sd] = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, emissive: 0xffffff,
      emissiveMap: CS.tex.lines, emissiveIntensity: 0.45, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 - k, polygonOffsetUnits: -2 - 2 * k}));
    S.seams[sd] = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({color: 0x080c14, transparent: true, opacity: 0.45, depthWrite: false}));
    S.scene.add(S.terr[sd], S.seams[sd]);
  });
  const hoop = new T.Group(), mat = new T.MeshStandardMaterial({color: 0xd9dee8, roughness: 0.6});
  const board = new T.Mesh(new T.BoxGeometry(1.8, 1.05, 0.04), new T.MeshStandardMaterial({color: 0xcfe0ff, transparent: true, opacity: 0.18})); board.position.set(0, 3.425, 1.2); hoop.add(board);
  const edge = new T.LineSegments(new T.EdgesGeometry(board.geometry), new T.LineBasicMaterial({color: 0xe6ecf7})); edge.position.copy(board.position); hoop.add(edge);
  const rim = new T.Mesh(new T.TorusGeometry(0.225, 0.018, 8, 40), new T.MeshStandardMaterial({color: 0xf08a3c})); rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, SM_RIM); hoop.add(rim);
  const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 3.9, 12), mat); pole.position.set(0, 1.95, -0.9); hoop.add(pole);
  const arm = new T.Mesh(new T.BoxGeometry(0.08, 0.08, 2.1), mat); arm.position.set(0, 3.45, 0.15); hoop.add(arm);
  const net = new T.Mesh(new T.CylinderGeometry(0.225, 0.14, 0.4, 16, 1, true), new T.MeshBasicMaterial({color: 0xffffff, wireframe: true, transparent: true, opacity: 0.45})); net.position.set(0, 2.85, SM_RIM); hoop.add(net);
  S.scene.add(hoop);
  S.mk = new T.Group(); S.mk.visible = false; S.scene.add(S.mk);
  S.puck = new T.Mesh(new T.SphereGeometry(0.11, 16, 12), new T.MeshBasicMaterial({color: 0xffffff})); S.mk.add(S.puck);
  return S;
}
function csInit() {
  const T = THREE;
  const mk = () => { const R = new T.WebGLRenderer({antialias: true, alpha: true}); R.domElement.className = 'cs-cv'; R.domElement.setAttribute('role', 'img'); return R; };
  CS.R1 = mk(); CS.R2 = mk();
  CS.tex = {floor: csCourtTex(0.5, true), lines: csCourtTex(0.85, false)};
  CS.OV = csScene(['a', 'b']); CS.DA = csScene(['a']); CS.DB = csScene(['b']);
  const V = CS_VIEWS.broadcast;
  CS.cam = {th: V.th, ph: V.ph, r: V.r, t: new T.Vector3(...V.t)}; CS.goal = {th: V.th, ph: V.ph, r: V.r, t: new T.Vector3(...V.t)}; CS.vel = {th: 0, ph: 0};
  CS.ray = new T.Raycaster(); CS.ndc = new T.Vector2();
  csWire(CS.R1.domElement, 1); csWire(CS.R2.domElement, 2);
}
function csBuild(S, sd) {
  const T = THREE, s = CS.surf[sd], Z = s.Z, W = CS_NX + 1, P = [], C = [], UV = [], L = [];
  const vtx = (i, j) => { const x = -7.5 + i * CS_STEP, d = j * CS_STEP; return [x, Z[j * W + i] + 0.004, d, (x + 7.5) / CS_CW, 1 - d / CS_CL]; };
  for (let j = 0; j < CS_ND; j++) for (let i = 0; i < CS_NX; i++) {
    if (!csOn(s, i, j)) continue;
    const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i + 1, j + 1), e = vtx(i, j + 1), col = csColor(sd, s.diff[j * CS_NX + i]);
    for (const p of [a, e, b, b, e, c]) { P.push(p[0], p[1], p[2]); UV.push(p[3], p[4]); C.push(col[0], col[1], col[2]); }
    for (const [p, q] of [[a, b], [b, c], [c, e], [e, a]]) L.push(p[0], p[1] + 0.003, p[2], q[0], q[1] + 0.003, q[2]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('color', new T.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(UV, 2));
  g.computeVertexNormals(); S.terr[sd].geometry.dispose(); S.terr[sd].geometry = g;
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(L, 3)); S.seams[sd].geometry.dispose(); S.seams[sd].geometry = sg;
}
function csMarkScene(S, x, d) {
  const T = THREE, mk = S.mk;
  if (x == null) { mk.visible = false; return; }
  const top = (px, pd) => Math.max(...S.sides.map(sd => csHeight(CS.surf[sd], px, pd)));
  const pts = []; for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, rx = Math.max(-7.5, Math.min(7.5, x + Math.cos(a))), rd = Math.max(0, Math.min(CS_CL, d + Math.sin(a))); pts.push(new T.Vector3(rx, top(rx, rd) + 0.04, rd)); }
  if (S.ring) { mk.remove(S.ring); S.ring.geometry.dispose(); }
  S.ring = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 96, 0.025, 6, true), new T.MeshBasicMaterial({color: 0xffffff})); mk.add(S.ring);
  const h = top(x, d); S.puck.position.set(x, h + 0.11, d);
  if (S.stem) { mk.remove(S.stem); S.stem.geometry.dispose(); }
  S.stem = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(x, 0.01, d), new T.Vector3(x, h, d)]), new T.LineDashedMaterial({color: 0xffffff, dashSize: 0.08, gapSize: 0.06}));
  S.stem.computeLineDistances(); S.stem.visible = h > 0.05; mk.add(S.stem);
  mk.visible = true;
}
function csMark(x, d) { CS.mk = x == null ? null : [x, d]; [CS.OV, CS.DA, CS.DB].forEach(S => csMarkScene(S, x, d)); if (x != null) csReadout(x, d); csReq(); }
// which scene each canvas shows now
const csSceneOf = n => CS.mode === 'overlay' ? (n === 1 ? CS.OV : null) : (n === 1 ? CS.DA : CS.DB);

/* ------------------------------------------------------------ camera and pointer */
function csApply(S) {
  // a narrow court (Dual, phones) stands further back so the whole floor still fits
  const C = CS.cam, c = S.camera, asp = c.aspect || 1.6, r = asp < 0.95 ? C.r : C.r * Math.pow(Math.max(1, 1.45 / asp), 0.8), s = Math.sin(C.ph);
  c.position.set(C.t.x + r * s * Math.sin(C.th), C.t.y + r * Math.cos(C.ph), C.t.z + r * s * Math.cos(C.th));
  c.up.set(0, 1, 0); if (C.ph < 0.05) c.up.set(-Math.sin(C.th), 0, -Math.cos(C.th)); c.lookAt(C.t);
}
function csClamp() { const G = CS.goal; G.ph = Math.max(0.02, Math.min(1.42, G.ph)); G.r = Math.max(5, Math.min(42, G.r)); G.t.x = Math.max(-9, Math.min(9, G.t.x)); G.t.z = Math.max(-2, Math.min(14, G.t.z)); }
function csView(v, instant) {
  const V = CS_VIEWS[v], G = CS.goal, C = CS.cam; CS.view = v; G.ph = V.ph; G.r = V.r; G.t.set(...V.t);
  let th = V.th; while (th - C.th > Math.PI) th -= 2 * Math.PI; while (th - C.th < -Math.PI) th += 2 * Math.PI; G.th = th;
  if (instant || SM3_RM) { C.th = G.th; C.ph = G.ph; C.r = G.r; C.t.copy(G.t); }
  document.querySelectorAll('[data-csview]').forEach(b => b.setAttribute('aria-pressed', b.dataset.csview === v)); csReq();
}
const csFree = () => { CS.view = ''; document.querySelectorAll('[data-csview]').forEach(b => b.setAttribute('aria-pressed', 'false')); };
function csTick() {
  CS.raf = 0;
  if (!CS.R1 || !CS.R1.domElement.isConnected) return;          // the page is gone: stop until it comes back
  const G = CS.goal, C = CS.cam, V = CS.vel;
  if (!CS.drag) { G.th += V.th; G.ph += V.ph; V.th *= 0.9; V.ph *= 0.9; if (Math.abs(V.th) < 1e-4) V.th = 0; if (Math.abs(V.ph) < 1e-4) V.ph = 0; }
  csClamp();
  const k = SM3_RM ? 1 : 0.16;
  C.th += (G.th - C.th) * k; C.ph += (G.ph - C.ph) * k; C.r += (G.r - C.r) * k; C.t.lerp(G.t, k);
  [[CS.R1, 1], [CS.R2, 2]].forEach(([R, n]) => { const S = csSceneOf(n); if (S && R.domElement.isConnected) { csApply(S); R.render(S.scene, S.camera); } });
  if (V.th || V.ph || Math.abs(G.th - C.th) > 1e-4 || Math.abs(G.ph - C.ph) > 1e-4 || Math.abs(G.r - C.r) > 1e-3 || C.t.distanceTo(G.t) > 1e-3) csReq();
}
function csReq() { if (CS.R1 && !CS.raf) CS.raf = requestAnimationFrame(csTick); }
function csResize() {
  [[CS.R1, 1], [CS.R2, 2]].forEach(([R, n]) => {
    const host = R.domElement.parentElement, S = csSceneOf(n); if (!host || !S || !R.domElement.isConnected) return;
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); R.setSize(w, h, false);
    [CS.OV, CS.DA, CS.DB].forEach(s => { if (csSceneOf(n) === s) { s.camera.aspect = w / h; s.camera.fov = w / h < 0.95 ? 50 : 38; s.camera.updateProjectionMatrix(); } });
  });
  csReq();
}
function csPick(n, e) {
  const S = csSceneOf(n); if (!S) return null;
  const cv = (n === 1 ? CS.R1 : CS.R2).domElement, r = cv.getBoundingClientRect();
  CS.ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  CS.ray.setFromCamera(CS.ndc, S.camera);
  const hit = CS.ray.intersectObjects([...Object.values(S.terr), S.floor])[0]; if (!hit) return null;
  const x = hit.point.x, d = hit.point.z; return x < -7.5 || x > 7.5 || d < 0 || d > CS_CL ? null : {x, d};
}
function csWire(cv, n) {
  const ptrs = new Map(); let pinch = 0, last = 0;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); CS.drag = {mode: 'two', moved: 9}; }
    else CS.drag = {mode: e.button === 2 || e.shiftKey ? 'pan' : 'rot', x: e.clientX, y: e.clientY, moved: 0};
    CS.vel.th = CS.vel.ph = 0; cv.classList.add('grabbing');
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const D = CS.drag;
    if (!D) { if (e.pointerType === 'mouse') { const now = performance.now(); if (now - last < 16) return; last = now; const h = csPick(n, e); if (h) csMark(h.x, h.d); } return; }
    if (D.mode === 'two' && ptrs.size === 2) { const [a, b] = [...ptrs.values()], dist = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) CS.goal.r *= pinch / dist; pinch = dist; csFree(); csReq(); return; }
    const dx = e.clientX - D.x, dy = e.clientY - D.y; D.x = e.clientX; D.y = e.clientY; D.moved += Math.abs(dx) + Math.abs(dy);
    if (D.mode === 'pan') { const k = CS.cam.r / (cv.clientHeight || 400) * 1.1, c = Math.cos(CS.cam.th), s = Math.sin(CS.cam.th); CS.goal.t.x += (-dx * c - dy * s) * k; CS.goal.t.z += (dx * s - dy * c) * k; csClamp(); }
    else { const a = -dx * 0.0085, b = -dy * 0.0065; CS.goal.th += a; CS.goal.ph += b; CS.vel.th = a * 0.5; CS.vel.ph = b * 0.5; }
    if (D.moved > 3) csFree(); csReq();
  });
  const up = e => { const tap = CS.drag && CS.drag.moved < 6; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0;
    if (!ptrs.size) { CS.drag = null; cv.classList.remove('grabbing'); }
    if (tap && e.type === 'pointerup') { const h = csPick(n, e); if (h) csMark(h.x, h.d); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); CS.goal.r *= Math.exp(e.deltaY * 0.0012); csClamp(); csFree(); csReq(); }, {passive: false});
}
document.addEventListener('keydown', e => {
  if (!e.target.closest || !e.target.closest('.cs-stage') || !CS.goal) return;
  const k = e.key, G = CS.goal; let used = true;
  if (k === 'ArrowLeft') G.th -= 0.12; else if (k === 'ArrowRight') G.th += 0.12; else if (k === 'ArrowUp') G.ph -= 0.08; else if (k === 'ArrowDown') G.ph += 0.08;
  else if (k === '+' || k === '=') G.r *= 0.88; else if (k === '-' || k === '_') G.r *= 1.14; else used = false;
  if (used) { e.preventDefault(); csFree(); csReq(); }
});

/* ------------------------------------------------------------ into the page */
function cmpShotsAfterRender() {
  const P = CS.pending, s1 = document.getElementById('cs-s1');
  if (!P || !s1 || !sm3dReady()) return;
  if (!CS.R1) { try { csInit(); } catch (e) { SM3.st = 'error'; softRoute(); return; } }
  s1.insertBefore(CS.R1.domElement, s1.firstChild);
  CS.R1.domElement.setAttribute('aria-label', CS.mode === 'dual' ? 'Shot terrain of ' + personName(P.A) : 'Shot terrains of both players on one court');
  const s2 = document.getElementById('cs-s2');
  if (s2) { s2.insertBefore(CS.R2.domElement, s2.firstChild); CS.R2.domElement.setAttribute('aria-label', 'Shot terrain of ' + personName(P.B)); }
  if (P.key !== CS.key) {
    CS.key = P.key;
    CS.surf = {a: csSurf(P.LA), b: csSurf(P.LB)};
    CS.maxd = Math.max(CS.surf.a.max, CS.surf.b.max) || 1;
    csHeights(CS.surf.a); csHeights(CS.surf.b);
    csBuild(CS.OV, 'a'); csBuild(CS.OV, 'b'); csBuild(CS.DA, 'a'); csBuild(CS.DB, 'b');
    if (!CS.mk) { const c = {PT: [0, 3.0]}.PT; CS.mk = c; }
  }
  if (CS.ro) CS.ro.disconnect();
  if (typeof ResizeObserver === 'function') { CS.ro = new ResizeObserver(csResize); CS.ro.observe(s1); if (s2) CS.ro.observe(s2); }
  csMark(CS.mk[0], CS.mk[1]);
  document.querySelectorAll('[data-csview]').forEach(b => b.setAttribute('aria-pressed', b.dataset.csview === CS.view));
  csResize(); csReq();
}
document.addEventListener('click', e => {
  if (!e.target.closest) return;
  const m = e.target.closest('[data-csmode]');
  if (m) { CS.mode = m.dataset.csmode; try { localStorage.setItem('hs-cmpshot-mode', CS.mode); } catch (err) {} softRoute(); return; }
  const s = e.target.closest('[data-csscope]'); if (s) { CS.scope = s.dataset.csscope; softRoute(); return; }
  const v = e.target.closest('[data-csview]'); if (v && CS.goal) { csView(v.dataset.csview); return; }
  const z = e.target.closest('[data-csz]');
  if (z && CS.goal) {
    const c = {PT: [0, 3.0], MC: [0, 6.9], ML: [-4.3, 3.3], MR: [4.3, 3.3], C3L: [-7.05, 1.5], C3R: [7.05, 1.5], W3L: [-5.7, 7.6], W3R: [5.7, 7.6], T3: [0, 9.6]}[z.dataset.csz];
    CS.goal.t.set(c[0] * 0.7, 0.3, c[1]); CS.goal.r = 14; CS.goal.ph = Math.min(CS.goal.ph, 1.05); csFree(); csMark(c[0], c[1]);
  }
});
