// Procedural dinosaurs: each one is a signed distance field built from
// smoothly blended primitives, meshed with surface nets.
// Axes: +x = forward (head), +y = up, z = sideways. Ground at y = 0.

// ---------- SDF primitives ----------

function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Mirror across the z = 0 plane (left/right legs, eyes, horns...)
function sym(f) {
  return (x, y, z) => f(x, y, z < 0 ? -z : z);
}

// Ellipsoid centered at c with radii r, rotated by `rot` radians around z
// (positive rot lifts the +x end).
function ellipsoid(c, r, rot = 0) {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const co = Math.cos(rot), si = Math.sin(rot);
  const rmin = Math.min(rx, ry, rz);
  return (x, y, z) => {
    let px = x - cx, py = y - cy;
    const pz = z - cz;
    if (rot) {
      const tx = co * px + si * py;
      py = -si * px + co * py;
      px = tx;
    }
    const ax = px / rx, ay = py / ry, az = pz / rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax / rx, by = ay / ry, bz = az / rz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    if (k1 < 1e-9) return -rmin;
    return (k0 * (k0 - 1)) / k1;
  };
}

// Round cone between a=[x,y,z,r1] and b=[x,y,z,r2] (exact, by Inigo Quilez)
function cone(a, b) {
  const [ax, ay, az, r1] = a;
  const [bx2, by2, bz2, r2] = b;
  const bax = bx2 - ax, bay = by2 - ay, baz = bz2 - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const srr = Math.sign(rr) * rr * rr;
  return (x, y, z) => {
    const pax = x - ax, pay = y - ay, paz = z - az;
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = srr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

// Chain of round cones through points [x,y,z,r]. Only the first segment is
// blended with k; the rest join almost sharply so joints don't bulge.
function chain(pts, k, kNext = 0.01) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) out.push([cone(pts[i], pts[i + 1]), i === 0 ? k : kNext]);
  return out;
}

function leg(pts, kHip, kJoint) {
  return chain(pts, kHip, kJoint).map(([f, k]) => [sym(f), k]);
}

// ---------- Dinosaurs ----------

export const DINOS = {
  trex: {
    name: 'Тираннозавр',
    bounds: [[-3.95, -0.1, -1.0], [2.75, 3.1, 1.0]],
    eyes: [[2.0, 2.63, 0.06]],
    parts: () => [
      [ellipsoid([0, 1.65, 0], [1.15, 0.72, 0.6], 0.1), 0],
      ...chain([[-0.7, 1.75, 0, 0.52], [-1.8, 1.7, 0, 0.36], [-2.9, 1.45, 0, 0.17], [-3.75, 1.2, 0, 0.04]], 0.2),
      ...chain([[0.8, 1.85, 0, 0.45], [1.3, 2.3, 0, 0.34]], 0.2),
      [ellipsoid([1.75, 2.5, 0], [0.62, 0.36, 0.33]), 0.15],
      [cone([1.9, 2.45, 0, 0.3], [2.4, 2.38, 0, 0.19]), 0.1],
      [ellipsoid([1.8, 2.2, 0], [0.55, 0.16, 0.26], -0.1), 0.06],
      [sym(ellipsoid([1.85, 2.73, 0.18], [0.2, 0.07, 0.09])), 0.06],
      // legs
      ...leg([[0.0, 1.55, 0.42, 0.42], [0.25, 0.95, 0.5, 0.23], [-0.05, 0.3, 0.5, 0.12]], 0.15, 0.08),
      [sym(cone([-0.1, 0.2, 0.5, 0.14], [0.45, 0.09, 0.5, 0.09])), 0.08],
      [sym(cone([-0.05, 0.15, 0.5, 0.1], [0.38, 0.07, 0.34, 0.065])), 0.05],
      [sym(cone([-0.05, 0.15, 0.5, 0.1], [0.38, 0.07, 0.66, 0.065])), 0.05],
      // tiny arms
      [sym(cone([1.0, 1.75, 0.36, 0.09], [1.22, 1.5, 0.45, 0.06])), 0.06],
      [sym(cone([1.22, 1.5, 0.45, 0.055], [1.42, 1.58, 0.42, 0.035])), 0.03],
    ],
  },

  brachio: {
    name: 'Брахиозавр',
    bounds: [[-4.45, -0.1, -1.05], [3.0, 5.85, 1.05]],
    eyes: [[2.62, 5.47, 0.05]],
    parts: () => [
      [ellipsoid([0, 2.3, 0], [1.35, 0.85, 0.78], 0.12), 0],
      ...chain([[0.9, 2.6, 0, 0.5], [1.6, 3.7, 0, 0.33], [2.0, 4.9, 0, 0.22], [2.15, 5.3, 0, 0.2]], 0.25),
      [ellipsoid([2.45, 5.4, 0], [0.42, 0.2, 0.21], -0.15), 0.12],
      [ellipsoid([2.33, 5.56, 0], [0.2, 0.14, 0.15]), 0.1],
      ...chain([[-1.1, 2.3, 0, 0.5], [-2.3, 1.9, 0, 0.3], [-3.5, 1.3, 0, 0.12], [-4.25, 0.9, 0, 0.035]], 0.2),
      ...leg([[0.85, 2.1, 0.5, 0.34], [0.9, 1.1, 0.55, 0.25], [0.88, 0.12, 0.55, 0.24]], 0.15, 0.05),
      ...leg([[-0.85, 2.2, 0.5, 0.4], [-0.8, 1.1, 0.55, 0.28], [-0.85, 0.12, 0.55, 0.26]], 0.15, 0.05),
    ],
  },

  trike: {
    name: 'Трицератопс',
    bounds: [[-3.0, -0.1, -1.1], [2.6, 2.85, 1.1]],
    eyes: [[1.85, 1.52, 0.055]],
    parts: () => [
      [ellipsoid([0, 1.35, 0], [1.35, 0.8, 0.78], 0.05), 0],
      ...chain([[-1.1, 1.45, 0, 0.45], [-2.1, 1.15, 0, 0.22], [-2.95, 0.75, 0, 0.05]], 0.2),
      [ellipsoid([1.55, 1.3, 0], [0.55, 0.45, 0.42], -0.3), 0.2],
      [cone([1.85, 1.15, 0, 0.28], [2.35, 0.95, 0, 0.07]), 0.1],
      [ellipsoid([1.15, 1.95, 0], [0.1, 0.78, 0.92], 0.45), 0.12],
      [sym(cone([1.7, 1.68, 0.22, 0.1], [2.45, 2.15, 0.32, 0.015])), 0.05],
      [cone([2.1, 1.3, 0, 0.09], [2.3, 1.62, 0, 0.015]), 0.05],
      ...leg([[0.8, 1.1, 0.55, 0.3], [0.9, 0.55, 0.6, 0.22], [0.85, 0.1, 0.6, 0.2]], 0.12, 0.05),
      ...leg([[-0.75, 1.3, 0.5, 0.4], [-0.7, 0.6, 0.58, 0.27], [-0.75, 0.1, 0.58, 0.23]], 0.15, 0.05),
    ],
  },

  stego: {
    name: 'Стегозавр',
    bounds: [[-3.4, -0.1, -1.0], [2.35, 3.25, 1.0]],
    eyes: [[1.98, 1.0, 0.045]],
    parts: () => {
      const plates = [
        [1.0, 2.0, 0.06, 0.15, 0.2], [0.6, 2.28, -0.06, 0.2, 0.28], [0.15, 2.45, 0.06, 0.24, 0.33],
        [-0.35, 2.45, -0.06, 0.25, 0.34], [-0.85, 2.3, 0.06, 0.23, 0.3], [-1.35, 2.0, -0.06, 0.2, 0.25],
        [-1.85, 1.72, 0.06, 0.15, 0.18],
      ].map(([x, y, z, rx, ry]) => [ellipsoid([x, y + 0.14, z], [rx * 1.1, ry * 1.5, 0.045]), 0.04]);
      return [
        [ellipsoid([-0.1, 1.5, 0], [1.3, 0.8, 0.65], -0.05), 0],
        ...chain([[-1.0, 1.6, 0, 0.42], [-2.0, 1.3, 0, 0.22], [-3.0, 0.9, 0, 0.06]], 0.2),
        ...chain([[1.0, 1.3, 0, 0.35], [1.6, 1.0, 0, 0.2]], 0.15),
        [ellipsoid([1.85, 0.95, 0], [0.35, 0.17, 0.16], -0.2), 0.1],
        ...leg([[0.8, 1.1, 0.4, 0.22], [0.85, 0.55, 0.45, 0.17], [0.85, 0.1, 0.45, 0.16]], 0.12, 0.05),
        ...leg([[-0.6, 1.4, 0.42, 0.35], [-0.6, 0.7, 0.45, 0.24], [-0.65, 0.1, 0.45, 0.21]], 0.15, 0.05),
        ...plates,
        [sym(cone([-2.6, 1.1, 0.12, 0.05], [-2.9, 1.45, 0.45, 0.01])), 0.02],
        [sym(cone([-2.9, 0.95, 0.1, 0.045], [-3.25, 1.15, 0.42, 0.01])), 0.02],
      ];
    },
  },

  ankylo: {
    name: 'Анкилозавр',
    bounds: [[-3.6, -0.1, -1.3], [2.2, 1.9, 1.3]],
    eyes: [[1.75, 0.98, 0.045]],
    parts: () => {
      const bumps = [];
      for (const [x, z] of [[0.8, 0.3], [0.2, 0.42], [-0.4, 0.42], [-1.0, 0.3], [0.5, 0.75], [-0.2, 0.8], [-0.85, 0.7]])
        bumps.push([sym(ellipsoid([x, 1.0 + 0.62 * Math.sqrt(Math.max(0, 1 - (x / 1.45) ** 2 - (z / 0.95) ** 2)), z], [0.13, 0.09, 0.13])), 0.04]);
      const spikes = [];
      for (const x of [0.7, 0.1, -0.5, -1.1]) spikes.push([sym(cone([x, 0.95, 0.75, 0.1], [x - 0.1, 0.85, 1.15, 0.015])), 0.04]);
      return [
        [ellipsoid([-0.1, 1.0, 0], [1.45, 0.62, 0.95]), 0],
        ...chain([[-1.3, 1.0, 0, 0.4], [-2.3, 0.85, 0, 0.18], [-3.0, 0.75, 0, 0.1]], 0.2),
        [ellipsoid([-3.15, 0.75, 0], [0.32, 0.2, 0.32]), 0.08],
        [ellipsoid([1.55, 0.85, 0], [0.42, 0.3, 0.36], -0.1), 0.2],
        [sym(cone([1.5, 1.0, 0.3, 0.07], [1.35, 1.05, 0.55, 0.015])), 0.03],
        ...leg([[0.8, 0.8, 0.55, 0.22], [0.85, 0.35, 0.65, 0.18], [0.85, 0.1, 0.65, 0.17]], 0.12, 0.05),
        ...leg([[-0.8, 0.85, 0.55, 0.28], [-0.8, 0.4, 0.65, 0.22], [-0.8, 0.1, 0.65, 0.2]], 0.12, 0.05),
        ...bumps, ...spikes,
      ];
    },
  },

  parasaur: {
    name: 'Паразавролоф',
    bounds: [[-3.6, -0.1, -1.0], [2.6, 3.6, 1.0]],
    eyes: [[1.72, 2.82, 0.05]],
    parts: () => [
      [ellipsoid([0, 1.75, 0], [1.15, 0.68, 0.58], 0.15), 0],
      ...chain([[-0.8, 1.7, 0, 0.48], [-1.9, 1.55, 0, 0.3], [-2.8, 1.3, 0, 0.14], [-3.45, 1.1, 0, 0.04]], 0.2),
      ...chain([[0.85, 2.05, 0, 0.36], [1.35, 2.6, 0, 0.24]], 0.2),
      [ellipsoid([1.75, 2.72, 0], [0.42, 0.22, 0.22], -0.25), 0.12],
      [ellipsoid([2.15, 2.52, 0], [0.25, 0.08, 0.17], -0.3), 0.08],
      [cone([1.65, 2.9, 0, 0.1], [0.75, 3.35, 0, 0.07]), 0.06],
      ...leg([[0.0, 1.6, 0.4, 0.4], [0.25, 0.95, 0.48, 0.24], [-0.05, 0.3, 0.48, 0.14]], 0.15, 0.08),
      [sym(cone([-0.1, 0.2, 0.48, 0.15], [0.4, 0.09, 0.48, 0.1])), 0.08],
      [sym(cone([1.0, 1.85, 0.35, 0.11], [1.2, 1.3, 0.42, 0.07])), 0.06],
      [sym(cone([1.2, 1.3, 0.42, 0.065], [1.38, 1.05, 0.42, 0.045])), 0.03],
    ],
  },

  spino: {
    name: 'Спинозавр',
    bounds: [[-4.2, -0.1, -1.0], [3.1, 3.8, 1.0]],
    eyes: [[1.95, 2.25, 0.05]],
    parts: () => [
      [ellipsoid([0, 1.55, 0], [1.3, 0.62, 0.55], 0.08), 0],
      ...chain([[-0.9, 1.6, 0, 0.45], [-2.0, 1.45, 0, 0.3], [-3.1, 1.2, 0, 0.15], [-4.0, 1.0, 0, 0.04]], 0.2),
      ...chain([[0.9, 1.75, 0, 0.36], [1.5, 2.1, 0, 0.26]], 0.2),
      [ellipsoid([1.85, 2.15, 0], [0.4, 0.2, 0.22]), 0.12],
      [cone([2.0, 2.08, 0, 0.17], [2.95, 1.95, 0, 0.08]), 0.08],
      [ellipsoid([-0.15, 2.45, 0], [1.35, 1.05, 0.06], 0.05), 0.15],
      ...leg([[-0.2, 1.4, 0.38, 0.36], [0.0, 0.85, 0.45, 0.2], [-0.25, 0.28, 0.45, 0.11]], 0.15, 0.08),
      [sym(cone([-0.3, 0.18, 0.45, 0.12], [0.2, 0.08, 0.45, 0.08])), 0.08],
      [sym(cone([1.0, 1.55, 0.35, 0.1], [1.35, 1.15, 0.45, 0.07])), 0.06],
      [sym(cone([1.35, 1.15, 0.45, 0.065], [1.6, 1.05, 0.42, 0.035])), 0.03],
    ],
  },

  raptor: {
    name: 'Велоцираптор',
    bounds: [[-3.2, -0.1, -0.7], [2.0, 2.0, 0.7]],
    eyes: [[1.35, 1.6, 0.04]],
    parts: () => [
      [ellipsoid([0, 1.05, 0], [0.75, 0.33, 0.3], 0.12), 0],
      ...chain([[-0.55, 1.05, 0, 0.27], [-1.5, 1.08, 0, 0.14], [-2.4, 1.1, 0, 0.07], [-3.05, 1.12, 0, 0.02]], 0.15),
      ...chain([[0.55, 1.2, 0, 0.18], [0.85, 1.55, 0, 0.12]], 0.12),
      [ellipsoid([1.2, 1.58, 0], [0.4, 0.13, 0.13], -0.08), 0.08],
      ...leg([[-0.05, 0.98, 0.22, 0.24], [0.15, 0.6, 0.26, 0.11], [-0.1, 0.2, 0.26, 0.06]], 0.12, 0.05),
      [sym(cone([-0.12, 0.12, 0.26, 0.07], [0.22, 0.05, 0.26, 0.045])), 0.04],
      [sym(cone([0.02, 0.1, 0.26, 0.04], [0.08, 0.25, 0.26, 0.012])), 0.02],
      [sym(cone([0.6, 1.05, 0.2, 0.06], [0.8, 0.8, 0.28, 0.04])), 0.05],
      [sym(cone([0.8, 0.8, 0.28, 0.04], [1.05, 0.72, 0.26, 0.015])), 0.02],
    ],
  },
};

function compose(parts) {
  const n = parts.length;
  const fs = parts.map((p) => p[0]);
  const ks = parts.map((p) => p[1]);
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < n; i++) d = smin(d, fs[i](x, y, z), ks[i]);
    return Math.max(d, -y); // flatten feet on the ground
  };
}

// ---------- Surface nets mesher ----------

const CORNERS = [];
for (let c = 0; c < 8; c++) CORNERS.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
const EDGES = [];
for (let c = 0; c < 8; c++) for (const bit of [1, 2, 4]) if (!(c & bit)) EDGES.push([c, c | bit]);

export function buildDino(id, cell = 0.035) {
  const def = DINOS[id];
  const sdf = compose(def.parts());
  const [bmin, bmax] = def.bounds;
  const h = cell;
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1;
  const ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1;
  const nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const sxy = nx * ny;

  // Narrow band: sample block centers first; blocks far from the surface
  // just take the coarse value (only the sign matters there).
  const B = 4;
  const bx = Math.ceil(nx / B), by = Math.ceil(ny / B), bz = Math.ceil(nz / B);
  const coarse = new Float32Array(bx * by * bz);
  for (let k = 0; k < bz; k++)
    for (let j = 0; j < by; j++)
      for (let i = 0; i < bx; i++)
        coarse[i + j * bx + k * bx * by] = sdf(
          bmin[0] + (i * B + 1.5) * h, bmin[1] + (j * B + 1.5) * h, bmin[2] + (k * B + 1.5) * h);
  const far = 4.5 * h;

  const vals = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const z = bmin[2] + k * h;
    for (let j = 0; j < ny; j++) {
      const y = bmin[1] + j * h;
      const crow = ((j / B) | 0) * bx + ((k / B) | 0) * bx * by;
      let o = j * nx + k * sxy;
      for (let i = 0; i < nx; i++) {
        const c = coarse[crow + ((i / B) | 0)];
        vals[o++] = c > far || c < -far ? c : sdf(bmin[0] + i * h, y, z);
      }
    }
  }

  // One vertex per cell that straddles the surface
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const cv = new Float32Array(8);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = CORNERS[c];
          const v = vals[i + di + (j + dj) * nx + (k + dk) * sxy];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let px = 0, py = 0, pz = 0, cnt = 0;
        for (const [a, b] of EDGES) {
          const va = cv[a], vb = cv[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const A = CORNERS[a], B = CORNERS[b];
          px += A[0] + (B[0] - A[0]) * t;
          py += A[1] + (B[1] - A[1]) * t;
          pz += A[2] + (B[2] - A[2]) * t;
          cnt++;
        }
        cellVert[i + j * cx + k * cx * cy] = pos.length / 3;
        pos.push(bmin[0] + (i + px / cnt) * h, bmin[1] + (j + py / cnt) * h, bmin[2] + (k + pz / cnt) * h);
      }

  // Quads across every grid edge with a sign change
  const idx = [];
  const C = (i, j, k) => cellVert[i + j * cx + k * cx * cy];
  const emit = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    idx.push(a, b, c, a, c, d); // winding fixed below using SDF normals
  };
  for (let k = 1; k < cz; k++)
    for (let j = 1; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        const d0 = vals[i + j * nx + k * sxy], d1 = vals[i + 1 + j * nx + k * sxy];
        if ((d0 < 0) !== (d1 < 0)) emit(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k));
      }
  for (let k = 1; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 1; i < cx; i++) {
        const d0 = vals[i + j * nx + k * sxy], d1 = vals[i + (j + 1) * nx + k * sxy];
        if ((d0 < 0) !== (d1 < 0)) emit(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1));
      }
  for (let k = 0; k < cz; k++)
    for (let j = 1; j < cy; j++)
      for (let i = 1; i < cx; i++) {
        const d0 = vals[i + j * nx + k * sxy], d1 = vals[i + j * nx + (k + 1) * sxy];
        if ((d0 < 0) !== (d1 < 0)) emit(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k));
      }

  // Smooth normals from the SDF gradient
  const positions = new Float32Array(pos);
  const normals = new Float32Array(positions.length);
  const e = h * 0.5;
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v], y = positions[v + 1], z = positions[v + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    normals[v] = gx / l; normals[v + 1] = gy / l; normals[v + 2] = gz / l;
  }

  // Orient every triangle so its face normal agrees with the SDF normals
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const d = fx * (normals[a] + normals[b] + normals[c]) + fy * (normals[a + 1] + normals[b + 1] + normals[c + 1]) + fz * (normals[a + 2] + normals[b + 2] + normals[c + 2]);
    if (d < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }

  // Eyes: march in from the side to find the surface
  const eyes = [];
  for (const [ex, ey, r] of def.eyes) {
    let z = bmax[2];
    while (z > 0 && sdf(ex, ey, z) > 0) z -= 0.005;
    const ez = z - r * 0.6;
    eyes.push([ex, ey, ez, r], [ex, ey, -ez, r]);
  }

  const indices = positions.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { positions, normals, indices, eyes };
}
