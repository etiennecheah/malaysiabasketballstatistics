/* =========================================================================
   Shot map, the 3D terrain view (app4u_shots.js draws the tab; this file draws its
   "3D terrain" view). The surface is the 2D terrain's own: 0.25 m tiles, coloured by his
   FG% against the average from the same spot, raised where he shoots most. Here it is a
   real 3D scene the reader can turn, zoom and pan, with the hoop at its real height, and
   a replay that throws every shot of the view, oldest first, building the terrain as
   they land.
   three.js r128 is served with the site (vendor/three.r128.min.js) and fetched only the
   first time this view opens. Where WebGL is off or the file cannot load, the tab keeps
   the 2D terrain. One renderer lives for the whole visit: each render of the tab gets the
   same canvas moved into it, so switching scope or view never piles up GL contexts.
   ========================================================================= */
const SM3 = {st: '', R: null, key: '', pid: null, list: [], games: [], hs: 1, spin: false, view: 'broadcast', raf: 0, last: 0, ro: null,
  drag: null, ptrs: new Map(), pinch0: 0, lastHover: 0,
  play: {on: false, k: 0, L: 0, wait: 0, sp: 4, started: false}, balls: [], pops: [], nett: 0};
const SM3_RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SM3_CW = 15, SM3_CL = 11.5, SM3_STEP = 0.25, SM3_NX = 60, SM3_ND = 46, SM3_PEAK = 1.6;
const SM3_VIEWS = {
  broadcast: {th: 0, ph: 0.98, r: 21, t: [0, 0.4, 5.2]},
  baseline: {th: Math.PI * 0.86, ph: 1.12, r: 16, t: [0, 0.8, 5.5]},     // a little off the pole
  side: {th: -Math.PI / 2, ph: 1.0, r: 19, t: [0, 0.4, 5.2]},
  top: {th: 0, ph: 0.02, r: 22, t: [0, 0, 5.75]},
};
const SM3_TYPE = {jumpshot: 'jump shot', layup: 'layup', tipinlayup: 'tip-in', turnaroundjumpshot: 'turnaround jumper', drivinglayup: 'driving layup',
  fadeaway: 'fadeaway', pullupjumpshot: 'pull-up jumper', floatingjumpshot: 'floater', alleyoop: 'alley-oop', eurostep: 'euro step',
  stepbackjumpshot: 'step-back jumper', reverselayup: 'reverse layup', dunk: 'dunk', hookshot: 'hook shot'};

/* ------------------------------------------------------------ loading */
function sm3dEnsure() {
  if (SM3.st) return;
  let ok = false;
  try {
    if (typeof window !== 'undefined' && window.WebGLRenderingContext) {
      const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      ok = !!gl;
      const lose = gl && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    }
  } catch (e) { ok = false; }
  if (!ok) { SM3.st = 'nogl'; return; }
  SM3.st = 'loading';
  const s = document.createElement('script');
  s.src = HS.BASE + 'vendor/three.r128.min.js'; s.async = true;
  const again = () => { if (/\/shots$/.test(HS.hash()) && SM.view === 'terrain') softRoute(); };
  s.onload = () => { try { sm3dInit(); SM3.st = 'ready'; } catch (e) { SM3.st = 'error'; } again(); };
  s.onerror = () => { SM3.st = 'error'; again(); };
  document.head.appendChild(s);
}
const sm3dReady = () => SM3.st === 'ready';
// what the terrain view's stage holds: the 3D scene, a placeholder while three.js loads, or nothing (the 2D terrain)
function sm3dStage() {
  if (SM3.st === 'loading') return `<div class="sm-3d sm-3d-wait"><span>Loading the 3D map…</span></div>`;
  if (!sm3dReady()) return '';
  const vb = (k, l) => `<button data-sm3v="${k}" aria-pressed="${SM3.view === k}">${l}</button>`;
  return `<div class="sm-3d" id="sm-3d" tabindex="0" aria-label="3D shot map. Drag to rotate, scroll to zoom; with the map selected the arrow keys rotate and + and − zoom.">
    <div class="sm3-ctl">
      <div class="sm3-row" role="group" aria-label="Camera">${vb('broadcast', 'Broadcast')}${vb('baseline', 'Baseline')}${vb('side', 'Sideline')}${vb('top', 'Top')}</div>
      <div class="sm3-row"><button data-sm3="spin" aria-pressed="${SM3.spin}">Auto-rotate</button><button data-sm3="hoop" aria-pressed="${!SM3.R || SM3.hoop.visible}">Hoop</button></div>
      <label class="sm3-h">Height <input type="range" id="sm3-hgt" min="0.4" max="2.4" step="0.1" value="${SM3.hs}"></label>
    </div>
    <div class="sm3-help">Drag to rotate · Scroll or pinch to zoom · Right-drag or two fingers to pan · Double-click to recentre</div>
  </div>`;
}
// the replay bar under the 3D map
function sm3dBar() {
  if (!sm3dReady()) return '';
  return `<div class="sm3-replay" id="sm3-replay">
    <button class="sm3-play" id="sm3-play" aria-label="Play his shots, oldest first"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z"/></svg><span>Play</span></button>
    <div class="sm3-mid">
      <div class="sm3-line"><span id="sm3-game"></span><span class="num" id="sm3-count"></span></div>
      <input type="range" id="sm3-k" min="0" max="1" value="1" step="1" aria-label="Shots shown, oldest first">
      <div class="sm3-strip" id="sm3-strip" aria-hidden="true"></div>
      <div class="sm3-last" id="sm3-last" aria-live="polite"></div>
    </div>
    <div class="sm3-speed" role="group" aria-label="Replay speed"><span>Speed</span>${[1, 2, 4, 8].map(v => `<button data-sm3sp="${v}" aria-pressed="${SM3.play.sp === v}">${v}×</button>`).join('')}</div>
  </div>`;
}

/* ------------------------------------------------------------ the scene */
function sm3dInit() {
  const T = THREE;
  const R = new T.WebGLRenderer({antialias: true, alpha: true});
  R.domElement.className = 'sm3-cv';
  R.domElement.setAttribute('role', 'img');
  R.domElement.setAttribute('aria-label', 'Shot terrain: height is how often he shoots from a spot, colour is his shooting there against the average');
  SM3.R = R;
  const scene = SM3.scene = new T.Scene();
  SM3.camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new T.HemisphereLight(0xdfe8ff, 0x1a2030, 0.5));
  const sun = new T.DirectionalLight(0xffffff, 0.62); sun.position.set(-6, 12, 14); scene.add(sun);
  // court lines as a picture: dim on the floor, brighter where they drape over the terrain (emissive, so they read on any colour)
  const court = alpha => {
    const c = document.createElement('canvas'), s = 100; c.width = SM3_CW * s; c.height = SM3_CL * s;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = `rgba(255,255,255,${alpha})`; g.lineWidth = 6; g.lineJoin = 'round';
    const X = x => (x + 7.5) * s, Y = d => d * s;
    g.strokeRect(3, 3, c.width - 6, c.height + 20);
    g.strokeRect(X(-2.45), Y(0), 4.9 * s, 5.8 * s);
    g.beginPath(); g.arc(X(0), Y(5.8), 1.8 * s, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(X(0), Y(SM_RIM), 1.25 * s, 0, Math.PI); g.stroke();
    const a3 = Math.asin(6.6 / 6.75);
    g.beginPath(); g.moveTo(X(-6.6), 0); g.lineTo(X(-6.6), Y(SM_RIM + 6.75 * Math.cos(a3)));
    g.arc(X(0), Y(SM_RIM), 6.75 * s, Math.PI / 2 + a3, Math.PI / 2 - a3, true); g.lineTo(X(6.6), 0); g.stroke();
    return {c, g, s};
  };
  const tex = c => { const t = new T.CanvasTexture(c); t.anisotropy = 8; return t; };
  const fl = court(0.5);
  fl.g.strokeStyle = 'rgba(140,160,200,.16)'; fl.g.lineWidth = 2;     // a 1 m grid on the floor
  for (let x = 1; x < SM3_CW; x++) { fl.g.beginPath(); fl.g.moveTo(x * fl.s, 0); fl.g.lineTo(x * fl.s, fl.c.height); fl.g.stroke(); }
  for (let d = 1; d < SM3_CL; d++) { fl.g.beginPath(); fl.g.moveTo(0, d * fl.s); fl.g.lineTo(fl.c.width, d * fl.s); fl.g.stroke(); }
  const apron = new T.Mesh(new T.PlaneGeometry(SM3_CW + 6, SM3_CL + 6), new T.MeshStandardMaterial({color: 0x0d1422, roughness: 1}));
  apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.02, SM3_CL / 2); scene.add(apron);
  const floor = SM3.floor = new T.Mesh(new T.PlaneGeometry(SM3_CW, SM3_CL), new T.MeshStandardMaterial({color: 0x16203a, roughness: 1, emissive: 0xffffff, emissiveMap: tex(fl.c), emissiveIntensity: 0.5}));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, SM3_CL / 2); scene.add(floor);
  // the terrain: a tile wherever he shoots, one colour each, thin seams between them
  SM3.terrain = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0,
    emissive: 0xffffff, emissiveMap: tex(court(0.9).c), emissiveIntensity: 0.5, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2}));
  scene.add(SM3.terrain);
  SM3.seams = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({color: 0x080c14, transparent: true, opacity: 0.5, depthWrite: false}));
  scene.add(SM3.seams);
  // the hoop at its real height: rim 3.05 m, board 1.2 m in from the baseline
  const hoop = SM3.hoop = new T.Group(), mat = new T.MeshStandardMaterial({color: 0xd9dee8, roughness: 0.6});
  const board = new T.Mesh(new T.BoxGeometry(1.8, 1.05, 0.04), new T.MeshStandardMaterial({color: 0xcfe0ff, transparent: true, opacity: 0.18, roughness: 0.2}));
  board.position.set(0, 3.425, 1.2); hoop.add(board);
  const edge = new T.LineSegments(new T.EdgesGeometry(board.geometry), new T.LineBasicMaterial({color: 0xe6ecf7})); edge.position.copy(board.position); hoop.add(edge);
  const sq = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(0.59, 0.45)), new T.LineBasicMaterial({color: 0xe6ecf7})); sq.position.set(0, 3.275, 1.18); hoop.add(sq);
  const rim = new T.Mesh(new T.TorusGeometry(0.225, 0.018, 8, 40), new T.MeshStandardMaterial({color: 0xf08a3c, roughness: 0.5}));
  rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, SM_RIM); hoop.add(rim);
  const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 3.9, 12), mat); pole.position.set(0, 1.95, -0.9); hoop.add(pole);
  const arm = new T.Mesh(new T.BoxGeometry(0.08, 0.08, 2.1), mat); arm.position.set(0, 3.45, 0.15); hoop.add(arm);
  const net = SM3.net = new T.Mesh(new T.CylinderGeometry(0.225, 0.14, 0.4, 16, 1, true), new T.MeshBasicMaterial({color: 0xffffff, wireframe: true, transparent: true, opacity: 0.45}));
  net.position.set(0, 2.85, SM_RIM); hoop.add(net);
  scene.add(hoop);
  // the marker under the pointer: a 1 m ring draped on the surface (the tooltip's "within 1 m"), a puck, a dashed stem to its shadow
  const mk = SM3.marker = new T.Group(); mk.visible = false; scene.add(mk);
  SM3.ringMat = new T.MeshBasicMaterial({color: 0xffffff});
  SM3.puck = new T.Mesh(new T.SphereGeometry(0.11, 16, 12), new T.MeshBasicMaterial({color: 0xffffff}));
  SM3.shadow = new T.Mesh(new T.CircleGeometry(0.22, 24), new T.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0.45}));
  SM3.shadow.rotation.x = -Math.PI / 2;
  SM3.stemMat = new T.LineDashedMaterial({color: 0xffffff, dashSize: 0.08, gapSize: 0.06});
  mk.add(SM3.puck, SM3.shadow);
  // the replay's ball, its trail and the marks a shot leaves
  SM3.fx = new T.Group(); scene.add(SM3.fx);
  const cvs = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return tex(c); };
  SM3.ballMat = new T.MeshStandardMaterial({roughness: 0.75, map: cvs(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d9662a'); gr.addColorStop(0.5, '#f08a3c'); gr.addColorStop(1, '#d9662a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a1608'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 4, 0); g.lineTo(w / 4, h); g.moveTo(3 * w / 4, 0); g.lineTo(3 * w / 4, h); g.stroke();
    for (const cx of [0, w / 2, w]) { g.beginPath(); for (let y = 0; y <= h; y += 4) { const x = cx + 30 * Math.sin(y / h * Math.PI); if (y) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
  })});
  SM3.ballGeo = new T.SphereGeometry(0.12, 20, 14);
  SM3.dot = {
    made: cvs(128, 128, g => { g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.fillStyle = '#ff3d64'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#0b111c'; g.stroke(); }),
    miss: cvs(128, 128, g => { g.lineCap = 'round'; const k = 34, x = () => { g.beginPath(); g.moveTo(64 - k, 64 - k); g.lineTo(64 + k, 64 + k); g.moveTo(64 + k, 64 - k); g.lineTo(64 - k, 64 + k); g.stroke(); };
      g.strokeStyle = '#0b111c'; g.lineWidth = 30; x(); g.strokeStyle = '#7fc0ff'; g.lineWidth = 16; x(); })};
  SM3.ringGeo = new T.RingGeometry(0.82, 1, 40); SM3.ringGeo.rotateX(-Math.PI / 2);
  SM3.trailMat = new T.LineBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false});
  // the camera
  const V = SM3_VIEWS.broadcast;
  SM3.cam = {th: V.th, ph: V.ph, r: V.r, t: new T.Vector3(...V.t)};
  SM3.goal = {th: V.th, ph: V.ph, r: V.r, t: new T.Vector3(...V.t)};
  SM3.vel = {th: 0, ph: 0};
  SM3.ray = new T.Raycaster(); SM3.ndc = new T.Vector2();
  sm3dPointerEvents(R.domElement);
}

/* ------------------------------------------------------------ the surface */
const sm3dColor = v => {
  v = Math.max(-0.2, Math.min(0.2, v)); let k = 0; while (k < SM_STOPS.length - 2 && v > SM_STOPS[k + 1][0]) k++;
  const [v0, c0] = SM_STOPS[k], [v1, c1] = SM_STOPS[k + 1], t = (v - v0) / (v1 - v0);
  return c0.map((x, i) => (x + (c1[i] - x) * t) / 255);
};
const sm3dOn = (i, j) => { const s = SM3.surf; return !!s && i >= 0 && j >= 0 && i < SM3_NX && j < SM3_ND && s.dens[j * SM3_NX + i] > s.max * 0.05; };
function sm3dHeight(x, d) {
  const s = SM3.surf, fi = (x + 7.5) / SM3_STEP, fj = d / SM3_STEP, i = Math.floor(fi), j = Math.floor(fj);
  if (!s || !s.Z || !sm3dOn(i, j)) return 0;
  const u = fi - i, v = fj - j, Z = s.Z, W = SM3_NX + 1;
  return (Z[j * W + i] * (1 - u) + Z[j * W + i + 1] * u) * (1 - v) + (Z[(j + 1) * W + i] * (1 - u) + Z[(j + 1) * W + i + 1] * u) * v;
}
// the 2D terrain's surfaces (smSurfaces), raised the same way: each corner the mean of its four cells, 1.6 m × (density / peak)^2.2
function sm3dBuild(list) {
  const T = THREE;
  const s = SM3.surf = list.length ? smSurfaces(list) : {dens: new Float32Array(SM3_NX * SM3_ND), diff: new Float32Array(SM3_NX * SM3_ND), max: 0};
  const thr = s.max * 0.05, W = SM3_NX + 1, Z = s.Z = new Float32Array(W * (SM3_ND + 1));
  for (let j = 0; j <= SM3_ND; j++) for (let i = 0; i <= SM3_NX; i++) {
    let v = 0, c = 0;
    for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && b >= 0 && a < SM3_NX && b < SM3_ND) { v += s.dens[b * SM3_NX + a]; c++; }
    v /= c; Z[j * W + i] = s.max && v > thr ? SM3_PEAK * SM3.hs * Math.pow(v / s.max, 2.2) : 0;
  }
  const P = [], C = [], UV = [], L = [];
  const vtx = (i, j) => { const x = -7.5 + i * SM3_STEP, d = j * SM3_STEP; return [x, Z[j * W + i] + 0.004, d, (x + 7.5) / SM3_CW, 1 - d / SM3_CL]; };
  for (let j = 0; j < SM3_ND; j++) for (let i = 0; i < SM3_NX; i++) {
    if (!sm3dOn(i, j)) continue;
    const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i + 1, j + 1), e = vtx(i, j + 1), col = sm3dColor(s.diff[j * SM3_NX + i]);
    for (const p of [a, e, b, b, e, c]) { P.push(p[0], p[1], p[2]); UV.push(p[3], p[4]); C.push(col[0], col[1], col[2]); }
    for (const [p, q] of [[a, b], [b, c], [c, e], [e, a]]) L.push(p[0], p[1] + 0.003, p[2], q[0], q[1] + 0.003, q[2]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('color', new T.Float32BufferAttribute(C, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(UV, 2));
  g.computeVertexNormals(); SM3.terrain.geometry.dispose(); SM3.terrain.geometry = g;
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(L, 3)); SM3.seams.geometry.dispose(); SM3.seams.geometry = sg;
  sm3dReq();
}
function sm3dMarker(x, d) {
  const T = THREE, mk = SM3.marker;
  if (x == null) { mk.visible = false; sm3dReq(); return; }
  const pts = [];
  for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, rx = Math.max(-7.5, Math.min(7.5, x + Math.cos(a))), rd = Math.max(0, Math.min(SM3_CL, d + Math.sin(a))); pts.push(new T.Vector3(rx, sm3dHeight(rx, rd) + 0.04, rd)); }
  if (SM3.ringMesh) { mk.remove(SM3.ringMesh); SM3.ringMesh.geometry.dispose(); }
  SM3.ringMesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 96, 0.025, 6, true), SM3.ringMat); mk.add(SM3.ringMesh);
  const h = sm3dHeight(x, d);
  SM3.puck.position.set(x, h + 0.11, d); SM3.shadow.position.set(x, 0.006, d);
  if (SM3.stem) { mk.remove(SM3.stem); SM3.stem.geometry.dispose(); }
  SM3.stem = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(x, 0.01, d), new T.Vector3(x, h, d)]), SM3.stemMat); SM3.stem.computeLineDistances(); mk.add(SM3.stem);
  SM3.stem.visible = SM3.shadow.visible = h > 0.05;
  mk.visible = true; sm3dReq();
}

/* ------------------------------------------------------------ the camera */
function sm3dApplyCam() {
  const C = SM3.cam, cam = SM3.camera, s = Math.sin(C.ph);
  cam.position.set(C.t.x + C.r * s * Math.sin(C.th), C.t.y + C.r * Math.cos(C.ph), C.t.z + C.r * s * Math.cos(C.th));   // theta 0 looks from half court toward the basket
  cam.up.set(0, 1, 0);
  if (C.ph < 0.05) cam.up.set(-Math.sin(C.th), 0, -Math.cos(C.th));
  cam.lookAt(C.t);
}
function sm3dClamp() {
  const G = SM3.goal;
  G.ph = Math.max(0.02, Math.min(1.42, G.ph)); G.r = Math.max(5, Math.min(42, G.r));
  G.t.x = Math.max(-9, Math.min(9, G.t.x)); G.t.z = Math.max(-2, Math.min(14, G.t.z)); G.t.y = Math.max(0, Math.min(3, G.t.y));
}
function sm3dView(v, instant) {
  const V = SM3_VIEWS[v], G = SM3.goal, C = SM3.cam;
  SM3.view = v; G.ph = V.ph; G.r = V.r; G.t.set(...V.t);
  let th = V.th; while (th - C.th > Math.PI) th -= 2 * Math.PI; while (th - C.th < -Math.PI) th += 2 * Math.PI; G.th = th;   // the short way round
  if (instant || SM3_RM) { C.th = G.th; C.ph = G.ph; C.r = G.r; C.t.copy(G.t); }
  document.querySelectorAll('[data-sm3v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sm3v === v));
  sm3dReq();
}
const sm3dFree = () => { SM3.view = ''; document.querySelectorAll('[data-sm3v]').forEach(b => b.setAttribute('aria-pressed', 'false')); };
function sm3dTick() {
  SM3.raf = 0;
  const cv = SM3.R.domElement;
  if (!cv.isConnected) { sm3dStop(); SM3.last = 0; return; }       // the tab is gone: stop until it comes back
  const now = performance.now(), dt = SM3.last ? Math.min(0.05, (now - SM3.last) / 1000) : 0.016; SM3.last = now;
  sm3dStep(dt);
  const G = SM3.goal, C = SM3.cam, Vl = SM3.vel;
  if (SM3.spin) G.th += 0.0035;
  if (!SM3.drag) { G.th += Vl.th; G.ph += Vl.ph; Vl.th *= 0.9; Vl.ph *= 0.9; if (Math.abs(Vl.th) < 1e-4) Vl.th = 0; if (Math.abs(Vl.ph) < 1e-4) Vl.ph = 0; }
  sm3dClamp();
  const k = SM3_RM ? 1 : 0.16;
  C.th += (G.th - C.th) * k; C.ph += (G.ph - C.ph) * k; C.r += (G.r - C.r) * k; C.t.lerp(G.t, k);
  sm3dApplyCam(); SM3.R.render(SM3.scene, SM3.camera);
  const moving = SM3.spin || Vl.th || Vl.ph || Math.abs(G.th - C.th) > 1e-4 || Math.abs(G.ph - C.ph) > 1e-4 || Math.abs(G.r - C.r) > 1e-3 || C.t.distanceTo(G.t) > 1e-3;
  if (moving || SM3.play.on || SM3.balls.length || SM3.pops.length || SM3.nett > 0) sm3dReq(); else SM3.last = 0;
}
function sm3dReq() { if (SM3.R && !SM3.raf) SM3.raf = requestAnimationFrame(sm3dTick); }
function sm3dResize() {
  const host = document.getElementById('sm-3d'); if (!host || !SM3.R) return;
  const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
  SM3.R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); SM3.R.setSize(w, h, false);
  SM3.camera.aspect = w / h; SM3.camera.fov = w / h < 0.9 ? 52 : 38; SM3.camera.updateProjectionMatrix(); sm3dReq();
}

/* ------------------------------------------------------------ pointer */
function sm3dPick(e) {
  const cv = SM3.R.domElement, r = cv.getBoundingClientRect();
  SM3.ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  SM3.ray.setFromCamera(SM3.ndc, SM3.camera);
  const hit = SM3.ray.intersectObjects([SM3.terrain, SM3.floor])[0]; if (!hit) return null;
  const x = hit.point.x, d = hit.point.z;
  return x < -7.5 || x > 7.5 || d < 0 || d > SM3_CL ? null : {x, d};
}
function sm3dHover(e) {
  const now = performance.now(); if (now - SM3.lastHover < 16) return; SM3.lastHover = now;
  const hit = sm3dPick(e), tip = document.getElementById('sm-tip');
  if (!hit) { if (tip) tip.hidden = true; sm3dMarker(null); return; }
  sm3dMarker(hit.x, hit.d);
  smHover(e, hit.x, hit.d, sm3dList());
}
function sm3dPan(dx, dy) {
  // screen right on the floor is (cos th, -sin th); screen up is (-sin th, -cos th)
  const host = document.getElementById('sm-3d'), C = SM3.cam, G = SM3.goal;
  const k = C.r / ((host && host.clientHeight) || 500) * 1.1, c = Math.cos(C.th), s = Math.sin(C.th);
  G.t.x += (-dx * c - dy * s) * k; G.t.z += (dx * s - dy * c) * k; sm3dClamp();
}
function sm3dPointerEvents(cv) {
  const P = SM3.ptrs;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); P.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (P.size === 2) { const [a, b] = [...P.values()]; SM3.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); SM3.drag = {mode: 'two', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; }
    else SM3.drag = {mode: e.button === 2 || e.shiftKey ? 'pan' : 'rot', x: e.clientX, y: e.clientY};
    SM3.vel.th = SM3.vel.ph = 0; SM3.spin = false;
    document.querySelectorAll('[data-sm3="spin"]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    cv.classList.add('grabbing'); const tip = document.getElementById('sm-tip'); if (tip) tip.hidden = true;
  });
  cv.addEventListener('pointermove', e => {
    if (P.has(e.pointerId)) P.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const D = SM3.drag;
    if (!D) { if (e.pointerType === 'mouse') sm3dHover(e); return; }
    if (D.mode === 'two' && P.size === 2) {
      const [a, b] = [...P.values()], dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (SM3.pinch0) SM3.goal.r *= SM3.pinch0 / dist; SM3.pinch0 = dist; sm3dPan(mx - D.x, my - D.y); D.x = mx; D.y = my; sm3dFree(); sm3dReq(); return;
    }
    const dx = e.clientX - D.x, dy = e.clientY - D.y; D.x = e.clientX; D.y = e.clientY;
    if (D.mode === 'pan') sm3dPan(dx, dy);
    else { const a = -dx * 0.0085, b = -dy * 0.0065; SM3.goal.th += a; SM3.goal.ph += b; SM3.vel.th = a * 0.5; SM3.vel.ph = b * 0.5; }
    if (Math.abs(dx) + Math.abs(dy) > 0) sm3dFree();
    sm3dReq();
  });
  const up = e => {
    const tap = SM3.drag && SM3.drag.mode === 'rot' && e.pointerType !== 'mouse' && Math.abs(SM3.vel.th) + Math.abs(SM3.vel.ph) < 0.002;
    P.delete(e.pointerId); if (P.size < 2) SM3.pinch0 = 0;
    if (!P.size) { SM3.drag = null; cv.classList.remove('grabbing'); } else if (P.size === 1) { const [p] = [...P.values()]; SM3.drag = {mode: 'rot', x: p.x, y: p.y}; }
    if (tap && e.type === 'pointerup') sm3dHover(e);         // a tap on a phone reads the spot
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', e => { if (!SM3.drag && e.pointerType === 'mouse') { const t = document.getElementById('sm-tip'); if (t) t.hidden = true; sm3dMarker(null); } });
  cv.addEventListener('wheel', e => { e.preventDefault(); SM3.goal.r *= Math.exp(e.deltaY * 0.0012); sm3dClamp(); sm3dFree(); sm3dReq(); }, {passive: false});
  cv.addEventListener('dblclick', e => { const h = sm3dPick(e); if (h) { SM3.goal.t.set(h.x, 0.4, h.d); SM3.goal.r = Math.min(SM3.goal.r, 14); sm3dFree(); sm3dReq(); } });
}
document.addEventListener('keydown', e => {
  if (!e.target.closest || !e.target.closest('#sm-3d') || e.target.closest('input,button,select')) return;
  const k = e.key, G = SM3.goal; let used = true;
  if (k === 'ArrowLeft') G.th -= 0.12; else if (k === 'ArrowRight') G.th += 0.12; else if (k === 'ArrowUp') G.ph -= 0.08; else if (k === 'ArrowDown') G.ph += 0.08;
  else if (k === '+' || k === '=') G.r *= 0.88; else if (k === '-' || k === '_') G.r *= 1.14; else if (k === '0') { sm3dView('broadcast'); return e.preventDefault(); } else used = false;
  if (used) { e.preventDefault(); sm3dFree(); sm3dReq(); }
});

/* ------------------------------------------------------------ the replay */
const sm3dClock = t => { const m = /(\d+):(\d+)\s*([AP]M)?/i.exec(t || ''); if (!m) return 0; let h = +m[1]; if (m[3]) h = h % 12 + (/p/i.test(m[3]) ? 12 : 0); return h * 60 + +m[2]; };
// oldest first: games by date and tip-off, then by period; within a period, the order of the game's shot chart
function sm3dOrder(list) {
  const key = mid => { const g = GAME_BY_MID[mid] || {}; return (g.date || '') + ' ' + String(sm3dClock(g.time)).padStart(4, '0') + ' ' + mid; };
  return list.map((s, o) => ({s, o, k: key(s.mid)})).sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : (a.s.per || 0) - (b.s.per || 0) || a.o - b.o).map(x => x.s);
}
// the shots the map and the numbers show: all of the view, or those that have landed so far
function sm3dList() { return SM3.play.k >= SM3.list.length ? SM3.list : SM3.list.slice(0, SM3.play.k); }
function sm3dLive() { return sm3dReady() && SM.view === 'terrain' && document.getElementById('sm-3d') && SM3.play.k < SM3.list.length ? sm3dList() : null; }
function sm3dGames() {
  SM3.games = [];
  SM3.list.forEach((s, i) => { if (!i || s.mid !== SM3.list[i - 1].mid) SM3.games.push(i); });
  SM3.info = {};
  SM3.list.forEach(s => { if (!SM3.info[s.mid]) SM3.info[s.mid] = smGameInfo(SM.pid, s.mid); });
}
function sm3dLaunch(i) {
  const T = THREE, s = SM3.list[i], dist = Math.hypot(s.x, s.y), u = dist > 0.05 ? [s.x / dist, s.y / dist] : [0, 1], close = dist < 1.8, d = s.y + SM_RIM;
  const a = new T.Vector3(s.x, Math.max(close ? 2.5 : 2.2, sm3dHeight(s.x, d) + 0.35), d);
  // a make ends over the middle of the rim; a miss clips the front of it
  const b = s.made ? new T.Vector3(0, 3.2, SM_RIM) : new T.Vector3(u[0] * 0.25, 3.12, SM_RIM + u[1] * 0.25);
  const m = new T.Mesh(SM3.ballGeo, SM3.ballMat); m.position.copy(a); SM3.fx.add(m);
  const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(new Float32Array(18 * 3), 3)); tg.setDrawRange(0, 0);
  const tr = new T.Line(tg, SM3.trailMat); SM3.fx.add(tr);
  const lat = (Math.random() - 0.5) * 2;
  SM3.balls.push({i, s, a, b, m, tr, pts: [], t: 0, T: (close ? 0.45 : 0.6) + 0.045 * dist, H: close ? 0.3 : 0.8 + 0.07 * dist, ph: 0, life: 0,
    v: s.made ? new T.Vector3(0, -1.2, 0) : new T.Vector3(u[0] * 1.8 - u[1] * lat, 2.4, u[1] * 1.8 + u[0] * lat)});
  sm3dBarUpdate();
}
function sm3dPop(s) {
  const T = THREE, d = s.y + SM_RIM, y = sm3dHeight(s.x, d);
  const sp = new T.Sprite(new T.SpriteMaterial({map: s.made ? SM3.dot.made : SM3.dot.miss, transparent: true, depthWrite: false}));
  sp.position.set(s.x, y + 0.28, d); sp.renderOrder = 4; SM3.fx.add(sp);
  const p = {sp, t: 0, ring: null};
  if (s.made) { p.ring = new T.Mesh(SM3.ringGeo, new T.MeshBasicMaterial({color: 0xff3d64, transparent: true, depthWrite: false, side: T.DoubleSide})); p.ring.position.set(s.x, y + 0.05, d); SM3.fx.add(p.ring); }
  SM3.pops.push(p);
}
function sm3dDropBall(b) { SM3.fx.remove(b.m); SM3.fx.remove(b.tr); b.tr.geometry.dispose(); }
function sm3dDropPop(p) { SM3.fx.remove(p.sp); p.sp.material.dispose(); if (p.ring) { SM3.fx.remove(p.ring); p.ring.material.dispose(); } }
function sm3dClear() { SM3.balls.forEach(sm3dDropBall); SM3.balls = []; SM3.pops.forEach(sm3dDropPop); SM3.pops = []; SM3.nett = 0; if (SM3.net) SM3.net.scale.y = 1; }
function sm3dStop() { SM3.play.on = false; if (SM3.R) sm3dClear(); }
function sm3dStep(dt) {
  const P = SM3.play, N = SM3.list.length;
  if (P.on) {
    P.wait -= dt * P.sp;
    while (P.on && P.wait <= 0 && P.L < N) {
      const i = P.L++, nx = SM3.list[i + 1];
      if (SM3_RM) { P.k = i + 1; sm3dRefresh(); } else sm3dLaunch(i);
      P.wait += nx && nx.mid !== SM3.list[i].mid ? 2.4 : 0.8;
    }
    if (P.L >= N && !SM3.balls.length) { P.on = false; sm3dBarUpdate(); }
  }
  const bt = dt * Math.sqrt(P.sp);
  SM3.balls = SM3.balls.filter(b => {
    b.t += bt;
    if (b.ph === 0) {
      const t = Math.min(1, b.t / b.T);
      b.m.position.lerpVectors(b.a, b.b, t); b.m.position.y += 4 * b.H * t * (1 - t); b.m.rotation.x -= bt * 14;
      if (t >= 1) {                              // at the rim: it counts now
        b.ph = 1; P.k = Math.max(P.k, b.i + 1); sm3dRefresh(); sm3dPop(b.s);
        if (b.s.made) SM3.nett = 0.32;
      }
    } else {                                     // through the net, or off the rim and away
      b.life += bt; b.v.y -= 9.8 * bt; b.m.position.addScaledVector(b.v, bt);
      if (b.m.position.y < 0.12) { b.m.position.y = 0.12; b.v.y = Math.abs(b.v.y) * 0.45; b.v.x *= 0.7; b.v.z *= 0.7; }
      if (b.life > 0.75) b.m.scale.setScalar(Math.max(0.01, 1 - (b.life - 0.75) / 0.3));
      if (b.life > 1.05) { sm3dDropBall(b); return false; }
    }
    b.pts.push(b.m.position.x, b.m.position.y, b.m.position.z); if (b.pts.length > 54) b.pts.splice(0, 3);
    if (b.ph) b.pts.splice(0, Math.min(b.pts.length - 3, 6));        // the trail runs out after the rim
    const pa = b.tr.geometry.attributes.position; pa.array.set(b.pts); pa.needsUpdate = true; b.tr.geometry.setDrawRange(0, b.pts.length / 3);
    return true;
  });
  SM3.pops = SM3.pops.filter(p => {
    p.t += dt;
    const g = Math.min(1, p.t / 0.18), o = p.t < 1 ? 1 : Math.max(0, 1 - (p.t - 1) / 0.6);
    p.sp.scale.setScalar(0.12 + 0.3 * g); p.sp.material.opacity = o;
    if (p.ring) { p.ring.scale.setScalar(0.15 + 0.6 * Math.min(1, p.t / 0.7)); p.ring.material.opacity = Math.max(0, 0.9 - p.t / 0.7); }
    if (p.t > 1.6) { sm3dDropPop(p); return false; }
    return true;
  });
  if (SM3.net) { if (SM3.nett > 0) { SM3.nett = Math.max(0, SM3.nett - dt); SM3.net.scale.y = 1 + 0.35 * Math.sin((0.32 - SM3.nett) / 0.32 * Math.PI); } else SM3.net.scale.y = 1; }
}
// after a shot lands (or the slider moves): the terrain, the numbers beside it and the bar
function sm3dRefresh() { const list = sm3dList(); sm3dBuild(list); sm3dPanels(list); sm3dBarUpdate(); }
function sm3dPanels(list) {
  const sm = smSummary(list), fg = sm.a ? sm.m / sm.a : 0;
  const b = document.querySelector('.sm-badge b'); if (b) b.textContent = `${sm.m}/${sm.a} FG`;
  const t = document.querySelector('.sm-tiles');
  if (t) t.innerHTML = `<div><small>FG%</small><b>${sm.a ? smPct(fg) : '–'}</b></div><div><small>Expected at his spots</small><b>${sm.a ? smPct(sm.exp) : '–'}</b></div><div><small>Versus average</small><b class="${smCls(fg - sm.exp)}">${sm.a ? smDiff(fg - sm.exp) : '–'}</b></div>`;
  const z = document.getElementById('sm-zone'); if (z) z.innerHTML = smZonePanel(list);
}
function sm3dBarUpdate() {
  const P = SM3.play, N = SM3.list.length, k = P.k, on = P.on, $ = id => document.getElementById(id);
  const rk = $('sm3-k'); if (!rk || !N) return;
  rk.max = N; rk.value = k;
  const btn = $('sm3-play');
  btn.querySelector('span').textContent = on ? 'Pause' : k >= N ? (P.started ? 'Replay' : 'Play') : k ? 'Resume' : 'Play';
  btn.querySelector('svg').innerHTML = on ? '<path d="M2 1h3v10H2zM7 1h3v10H7z"/>' : '<path d="M2 1l9 5-9 5z"/>';
  btn.setAttribute('aria-label', on ? 'Pause the replay' : 'Play his shots, oldest first');
  const m = sm3dList().reduce((t, s) => t + s.made, 0), G = SM3.games.length;
  const first = SM3.info[SM3.list[0].mid], lastG = SM3.info[SM3.list[N - 1].mid];
  if (k >= N && !on) {
    $('sm3-game').innerHTML = `<b>${G} game${G === 1 ? '' : 's'}</b>${first.date ? ` · ${esc(fmtDate(first.date))}${G > 1 ? ' to ' + esc(fmtDate(lastG.date)) : ''}` : ''}`;
    $('sm3-count').textContent = `${N} shots · ${m}/${N} FG`;
  } else {
    const i = Math.max(0, Math.min(N - 1, (on ? P.L : k) - 1));
    let gi = 0; while (gi + 1 < G && SM3.games[gi + 1] <= i) gi++;
    const s = SM3.list[i], g = SM3.info[s.mid];
    $('sm3-game').innerHTML = k || on ? `<b>Game ${gi + 1} of ${G}</b> · ${esc(g.long)}${SM.ev === 'all' ? ' · ' + esc(smShort(s.cid)) : ''}` : `<b>${G} game${G === 1 ? '' : 's'}</b> · starts ${esc(fmtDate(first.date))}`;
    $('sm3-count').textContent = `Shot ${k} of ${N} · ${m}/${k} FG${k ? ' (' + smPct(m / k) + ')' : ''}`;
  }
  const last = k ? SM3.list[k - 1] : null;
  $('sm3-last').innerHTML = last && (on || k < N)
    ? `<i class="${last.made ? 'm' : 'x'}"></i><span><b>${last.made ? 'Made' : 'Missed'}</b> ${last.three ? '3' : '2'}-pointer · ${esc(SM3_TYPE[last.type] || last.type || 'shot')} · ${SM_ZONES[last.z]}${last.per ? ' · ' + (last.per > 4 ? 'OT' + (last.per > 5 ? last.per - 4 : '') : 'Q' + last.per) : ''}</span>`
    : '<span>Press Play to watch every shot land, oldest first. Misses included.</span>';
  const cur = k || on ? SM3.list[Math.max(0, Math.min(N, on ? P.L : k) - 1)].cid : null;
  document.querySelectorAll('#sm3-strip span').forEach(x => x.classList.toggle('on', (on || k < N) && x.dataset.c === cur));
}
function sm3dStrip() {
  const el = document.getElementById('sm3-strip'); if (!el) return;
  const segs = []; SM3.list.forEach(s => { const l = segs[segs.length - 1]; if (l && l.c === s.cid) l.n++; else segs.push({c: s.cid, n: 1}); });
  el.innerHTML = segs.map(g => `<span data-c="${g.c}" style="flex:${g.n} 1 0" title="${esc(smShort(g.c))}">${esc(smShort(g.c))}</span>`).join('');
}

/* ------------------------------------------------------------ into the tab */
function sm3dMount() {
  const host = document.getElementById('sm-3d'); if (!host || !SM3.R) return;
  host.insertBefore(SM3.R.domElement, host.firstChild);
  if (SM3.ro) SM3.ro.disconnect();
  if (typeof ResizeObserver === 'function') { SM3.ro = new ResizeObserver(sm3dResize); SM3.ro.observe(host); }
  const key = [SM.pid, SM.scope, SM.ev, SM.game].join('|');
  if (key !== SM3.key) {
    const first = SM3.pid !== SM.pid;
    SM3.key = key; SM3.pid = SM.pid; sm3dStop();
    SM3.list = sm3dOrder(smShots()); SM3.play.k = SM3.play.L = SM3.list.length; SM3.play.started = false;
    sm3dGames(); sm3dMarker(null);
    if (first) sm3dView('broadcast', true);
  }
  sm3dStrip();
  const list = sm3dList();
  sm3dBuild(list);
  if (SM3.play.k < SM3.list.length) sm3dPanels(list);       // mid-replay: the tab was drawn with every shot
  sm3dBarUpdate();
  document.querySelectorAll('[data-sm3v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sm3v === SM3.view));
  sm3dResize(); sm3dReq();
}
function sm3dFlyTo(z) {
  if (!SM3.R || !document.getElementById('sm-3d')) return;
  const c = {PT: [0, 3.0], MC: [0, 6.9], ML: [-4.3, 3.3], MR: [4.3, 3.3], C3L: [-7.05, 1.5], C3R: [7.05, 1.5], W3L: [-5.7, 7.6], W3R: [5.7, 7.6], T3: [0, 9.6]}[z];
  if (!c) return;
  const G = SM3.goal; G.t.set(c[0] * 0.7, 0.3, c[1]); G.r = 13; G.ph = Math.min(G.ph, 1.05); sm3dFree(); sm3dMarker(c[0], c[1]); sm3dReq();
}
document.addEventListener('click', e => {
  if (!e.target.closest) return;
  const v = e.target.closest('[data-sm3v]'); if (v) { sm3dView(v.dataset.sm3v); return; }
  const c = e.target.closest('[data-sm3]');
  if (c && c.dataset.sm3 === 'spin') { SM3.spin = !SM3.spin; c.setAttribute('aria-pressed', SM3.spin); sm3dReq(); return; }
  if (c && c.dataset.sm3 === 'hoop') { SM3.hoop.visible = !SM3.hoop.visible; c.setAttribute('aria-pressed', SM3.hoop.visible); sm3dReq(); return; }
  const sp = e.target.closest('[data-sm3sp]');
  if (sp) { SM3.play.sp = +sp.dataset.sm3sp; document.querySelectorAll('[data-sm3sp]').forEach(b => b.setAttribute('aria-pressed', b === sp)); return; }
  if (e.target.closest('#sm3-play')) {
    const P = SM3.play;
    if (P.on) { P.on = false; P.L = Math.max(P.k, P.L); sm3dBarUpdate(); return; }
    if (P.k >= SM3.list.length) { sm3dClear(); P.k = P.L = 0; sm3dRefresh(); }
    P.L = Math.max(P.L, P.k); P.on = true; P.started = true; P.wait = 0.35; sm3dBarUpdate(); sm3dReq();
    return;
  }
  const zr = e.target.closest('.sm-zrow'); if (zr && SM.view === 'terrain') sm3dFlyTo(zr.dataset.smz);
});
document.addEventListener('input', e => {
  if (e.target.id === 'sm3-k') { sm3dStop(); SM3.play.k = SM3.play.L = +e.target.value; sm3dRefresh(); sm3dReq(); }
  else if (e.target.id === 'sm3-hgt') { SM3.hs = +e.target.value; sm3dBuild(sm3dList()); }
});
