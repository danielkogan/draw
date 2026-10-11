import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DINOS } from './dinos.js';

const COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#ffe9a8',
  '#7cb342', '#2e7d32', '#00897b', '#29b6f6',
  '#1e5fc8', '#8e24aa', '#f06292', '#795548',
  '#d7b98e', '#9e9e9e', '#222222', '#ffffff',
];
const BASE = new THREE.Color('#fbfaf7');
const STORE_KEY = 'dino-paint-v1:';

// ---------- scene ----------

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3f1ec');

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bb, 1.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(3, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 });
sun.shadow.radius = 6;
sun.shadow.bias = -0.0005;
scene.add(sun);
const rim = new THREE.DirectionalLight(0xffffff, 0.6);
rim.position.set(-5, 3, -6);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.ShadowMaterial({ opacity: 0.13 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- state ----------

const state = {
  color: new THREE.Color(COLORS[0]),
  colorHex: COLORS[0],
  size: 0.15,
  tool: 'brush',
  dino: null, // current entry from cache
};
const cache = {}; // id -> { mesh, geom, colors, normals, positions, undo[], adj }

// ---------- dino loading ----------

const worker = new Worker('./worker.js', { type: 'module' });
const pending = {};
worker.onmessage = (e) => {
  pending[e.data.id]?.(e.data);
  delete pending[e.data.id];
};
const requestMesh = (id) => new Promise((res) => { pending[id] = res; worker.postMessage({ id }); });

const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 0.25 });
const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

function makeEntry(id, data) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  const n = data.positions.length / 3;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) BASE.toArray(colors, i * 3);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('color', colorAttr);
  geom.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geom.computeBoundingBox();
  geom.computeBoundingSphere();

  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0,
  }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  for (const [x, y, z, r] of data.eyes) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), eyeMat);
    eye.position.set(x, y, z);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 10, 8), shineMat);
    shine.position.set(r * 0.35, r * 0.45, Math.sign(z) * r * 0.65);
    eye.add(shine);
    mesh.add(eye);
  }

  const entry = { id, mesh, geom, colors, colorAttr, positions: data.positions, normals: data.normals, undo: [], adj: null };
  loadColors(entry);
  return entry;
}

const loadingEl = document.getElementById('loading');
let loadToken = 0;

async function selectDino(id) {
  const token = ++loadToken;
  document.querySelectorAll('#dinos button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  try { localStorage.setItem(STORE_KEY + 'last', id); } catch {}
  if (state.dino) scene.remove(state.dino.mesh);
  state.dino = null;

  if (!cache[id]) {
    loadingEl.classList.add('show');
    const data = await requestMesh(id);
    cache[id] = makeEntry(id, data);
    loadingEl.classList.remove('show');
  }
  if (token !== loadToken) return;
  state.dino = cache[id];
  scene.add(state.dino.mesh);
  fitCamera(state.dino.geom.boundingBox);
}

// Free area between the UI panels; the camera is centered and fitted to it.
function freeArea() {
  const w = window.innerWidth, h = window.innerHeight;
  const left = document.getElementById('palette').getBoundingClientRect().right;
  const right = document.getElementById('tools').getBoundingClientRect().left;
  const top = document.getElementById('dinos').getBoundingClientRect().bottom;
  const x0 = left + 8, x1 = right - 8, y0 = top + 8, y1 = h - 12;
  if (x1 - x0 < w * 0.3) return { x0: 0, x1: w, y0, y1, w, h };
  return { x0, x1, y0, y1, w, h };
}

function fitCamera(box) {
  const a = freeArea();
  camera.setViewOffset(a.w, a.h, a.w / 2 - (a.x0 + a.x1) / 2, a.h / 2 - (a.y0 + a.y1) / 2, a.w, a.h);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanV = tv * (a.y1 - a.y0) / a.h;
  const tanH = tv * camera.aspect * (a.x1 - a.x0) / a.w;
  const sinOf = (t) => t / Math.sqrt(1 + t * t);
  const dist = Math.max(radius / sinOf(tanV), radius / sinOf(tanH)) * 0.92;
  const dir = new THREE.Vector3(0.35, 0.28, 1).normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.minDistance = radius * 0.6;
  controls.maxDistance = dist * 2.2;
  controls.update();
}

// ---------- painting ----------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function hitAt(clientX, clientY) {
  if (!state.dino) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(state.dino.mesh, false)[0];
  return hit || null;
}

function stamp(entry, p, n, target, radius) {
  const { positions: P, normals: N, colors: Cc } = entry;
  const r2 = radius * radius;
  const tr = target.r, tg = target.g, tb = target.b;
  const px = p.x, py = p.y, pz = p.z, nx = n.x, ny = n.y, nz = n.z;
  for (let i = 0, len = P.length; i < len; i += 3) {
    const dx = P[i] - px, dy = P[i + 1] - py, dz = P[i + 2] - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) continue;
    // don't bleed through to the far side of thin parts
    if (N[i] * nx + N[i + 1] * ny + N[i + 2] * nz < -0.15) continue;
    const t = Math.sqrt(d2) / radius;
    let w = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    w = w * w * (3 - 2 * w);
    Cc[i] += (tr - Cc[i]) * w;
    Cc[i + 1] += (tg - Cc[i + 1]) * w;
    Cc[i + 2] += (tb - Cc[i + 2]) * w;
  }
  entry.colorAttr.needsUpdate = true;
}

function pushUndo(entry) {
  entry.undo.push(entry.colors.slice());
  if (entry.undo.length > 30) entry.undo.shift();
}

function buildAdjacency(entry) {
  const idx = entry.geom.index.array;
  const n = entry.positions.length / 3;
  const deg = new Uint32Array(n + 1);
  for (let i = 0; i < idx.length; i += 3) { deg[idx[i]] += 2; deg[idx[i + 1]] += 2; deg[idx[i + 2]] += 2; }
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
  const fillPos = start.slice(0, n);
  const list = new Uint32Array(start[n]);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    list[fillPos[a]++] = b; list[fillPos[a]++] = c;
    list[fillPos[b]++] = a; list[fillPos[b]++] = c;
    list[fillPos[c]++] = a; list[fillPos[c]++] = b;
  }
  return { start, list };
}

function floodFill(entry, hit, target) {
  entry.adj ||= buildAdjacency(entry);
  const { start, list } = entry.adj;
  const C = entry.colors;
  const ref = entry.undo[entry.undo.length - 1]; // snapshot taken just before
  // seed = nearest corner of the hit triangle
  const P = entry.positions, f = hit.face;
  let seed = f.a, best = Infinity;
  for (const v of [f.a, f.b, f.c]) {
    const d = (P[3 * v] - hit.local.x) ** 2 + (P[3 * v + 1] - hit.local.y) ** 2 + (P[3 * v + 2] - hit.local.z) ** 2;
    if (d < best) { best = d; seed = v; }
  }
  const sr = ref[3 * seed], sg = ref[3 * seed + 1], sb = ref[3 * seed + 2];
  const tol = 0.035;
  const seen = new Uint8Array(P.length / 3);
  const stack = [seed];
  seen[seed] = 1;
  while (stack.length) {
    const v = stack.pop();
    C[3 * v] = target.r; C[3 * v + 1] = target.g; C[3 * v + 2] = target.b;
    for (let e = start[v]; e < start[v + 1]; e++) {
      const u = list[e];
      if (seen[u]) continue;
      seen[u] = 1;
      const dr = ref[3 * u] - sr, dg = ref[3 * u + 1] - sg, db = ref[3 * u + 2] - sb;
      if (dr * dr + dg * dg + db * db < tol) stack.push(u);
      else seen[u] = 0;
    }
    seen[v] = 2; // filled
  }

  // Soft brush edges are blends of the seed color and some other color `o`.
  // Re-blend the two rings around the region with the fill color instead.
  let ring = [];
  for (let v = 0; v < seen.length; v++) {
    if (seen[v] !== 2) continue;
    for (let e = start[v]; e < start[v + 1]; e++) if (!seen[list[e]]) { seen[list[e]] = 3; ring.push(list[e]); }
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = [];
    for (const u of ring) {
      let o = u, od = -1;
      for (let e = start[u] - 1; e < start[u + 1]; e++) {
        const q = e < start[u] ? u : list[e];
        const d = (ref[3 * q] - sr) ** 2 + (ref[3 * q + 1] - sg) ** 2 + (ref[3 * q + 2] - sb) ** 2;
        if (d > od) { od = d; o = q; }
        if (pass === 0 && !seen[q]) { seen[q] = 3; next.push(q); }
      }
      if (od < 1e-4) continue;
      const or = ref[3 * o] - sr, og = ref[3 * o + 1] - sg, ob = ref[3 * o + 2] - sb;
      let w = ((ref[3 * u] - sr) * or + (ref[3 * u + 1] - sg) * og + (ref[3 * u + 2] - sb) * ob) / od;
      if (w >= 0.97) continue;
      w = Math.max(0, w);
      C[3 * u] = target.r + w * (ref[3 * o] - target.r);
      C[3 * u + 1] = target.g + w * (ref[3 * o + 1] - target.g);
      C[3 * u + 2] = target.b + w * (ref[3 * o + 2] - target.b);
    }
    ring = next;
  }
  entry.colorAttr.needsUpdate = true;
}

// stroke handling
let stroke = null; // { id, lastX, lastY, entry }
const tmpLocal = new THREE.Vector3();

function localHit(x, y) {
  const hit = hitAt(x, y);
  if (!hit) return null;
  hit.local = state.dino.mesh.worldToLocal(tmpLocal.copy(hit.point)).clone();
  return hit;
}

function paintAt(x, y) {
  const hit = localHit(x, y);
  if (!hit) return;
  const target = state.tool === 'eraser' ? BASE : state.color;
  stamp(stroke.entry, hit.local, hit.face.normal, target, state.size);
}

function paintTo(x, y) {
  const dx = x - stroke.lastX, dy = y - stroke.lastY;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 5));
  for (let s = 1; s <= steps; s++) paintAt(stroke.lastX + (dx * s) / steps, stroke.lastY + (dy * s) / steps);
  stroke.lastX = x;
  stroke.lastY = y;
}

// Registered BEFORE OrbitControls so we can swallow touches that land on the dino.
canvas.addEventListener('pointerdown', (e) => {
  if (state.tool === 'rotate' || stroke || !state.dino) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const hit = localHit(e.clientX, e.clientY);
  if (!hit) return; // empty space -> orbit controls
  e.stopImmediatePropagation();
  e.preventDefault();
  const entry = state.dino;
  pushUndo(entry);
  if (state.tool === 'fill') {
    floodFill(entry, hit, state.color);
    saveColorsSoon(entry);
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  stroke = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY, entry };
  paintAt(e.clientX, e.clientY);
});

canvas.addEventListener('pointermove', (e) => {
  if (!stroke || e.pointerId !== stroke.id) return;
  e.stopImmediatePropagation();
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ce of events.length ? events : [e]) paintTo(ce.clientX, ce.clientY);
});

function endStroke(e) {
  if (!stroke || e.pointerId !== stroke.id) return;
  e.stopImmediatePropagation();
  saveColorsSoon(stroke.entry);
  stroke = null;
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.53;
controls.rotateSpeed = 0.9;

// ---------- persistence ----------

const saveTimers = {};
function saveColorsSoon(entry) {
  clearTimeout(saveTimers[entry.id]);
  saveTimers[entry.id] = setTimeout(() => saveColors(entry), 600);
}
function saveColors(entry) {
  const c = entry.colors;
  const bytes = new Uint8Array(c.length);
  for (let i = 0; i < c.length; i++) bytes[i] = Math.round(Math.min(1, Math.max(0, c[i])) * 255);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  try { localStorage.setItem(STORE_KEY + entry.id, btoa(s)); } catch {}
}
function loadColors(entry) {
  let s;
  try { s = localStorage.getItem(STORE_KEY + entry.id); } catch {}
  if (!s) return;
  const bin = atob(s);
  if (bin.length !== entry.colors.length) return;
  for (let i = 0; i < bin.length; i++) entry.colors[i] = bin.charCodeAt(i) / 255;
  entry.colorAttr.needsUpdate = true;
}

// ---------- UI ----------

const dinosNav = document.getElementById('dinos');
for (const [id, def] of Object.entries(DINOS)) {
  const b = document.createElement('button');
  b.textContent = def.name;
  b.dataset.id = id;
  b.onclick = () => selectDino(id);
  dinosNav.appendChild(b);
}

const swatches = document.getElementById('swatches');
function setColor(hex, el) {
  state.colorHex = hex;
  state.color.set(hex);
  document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === el));
  document.documentElement.style.setProperty('--brush', hex);
  if (state.tool === 'eraser' || state.tool === 'rotate') setTool('brush');
}
for (const hex of COLORS) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.background = hex;
  b.setAttribute('aria-label', hex);
  b.onclick = () => setColor(hex, b);
  swatches.appendChild(b);
}
const custom = document.getElementById('customColor');
custom.addEventListener('input', () => {
  custom.parentElement.style.background = custom.value;
  setColor(custom.value, custom.parentElement);
});
setColor(COLORS[0], swatches.firstChild);

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
}
document.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));

document.querySelectorAll('#sizes button').forEach((b) => {
  b.onclick = () => {
    state.size = parseFloat(b.dataset.size);
    document.querySelectorAll('#sizes button').forEach((x) => x.classList.toggle('on', x === b));
    if (state.tool !== 'brush' && state.tool !== 'eraser') setTool('brush');
  };
});

document.getElementById('undo').onclick = () => {
  const entry = state.dino;
  if (!entry || !entry.undo.length) return;
  entry.colors.set(entry.undo.pop());
  entry.colorAttr.needsUpdate = true;
  saveColorsSoon(entry);
};

document.getElementById('clear').onclick = () => {
  const entry = state.dino;
  if (!entry) return;
  pushUndo(entry);
  for (let i = 0; i < entry.colors.length; i += 3) BASE.toArray(entry.colors, i);
  entry.colorAttr.needsUpdate = true;
  saveColorsSoon(entry);
};

document.getElementById('save').onclick = async () => {
  renderer.render(scene, camera);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const name = `dino-${state.dino?.id || 'art'}-${Date.now()}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// block page gestures (pinch-zoom, double-tap zoom) on iPad
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---------- loop ----------

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => {
  resize();
  if (state.dino) fitCamera(state.dino.geom.boundingBox);
});
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

let last;
try { last = localStorage.getItem(STORE_KEY + 'last'); } catch {}
selectDino(DINOS[last] ? last : 'trex');
