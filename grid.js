// Uniform grid over a mesh, so painting only has to look at the triangles and
// vertices near the finger instead of all of them.

const CELL = 0.15;

// Compressed cell -> items table: items of cell c are list[start[c]..start[c + 1]].
function binItems(cells, items, visit) {
  const start = new Uint32Array(cells + 1);
  for (let it = 0; it < items; it++) visit(it, (c) => { start[c + 1]++; });
  for (let c = 0; c < cells; c++) start[c + 1] += start[c];
  const fill = start.slice(0, cells);
  const list = new Uint32Array(start[cells]);
  for (let it = 0; it < items; it++) visit(it, (c) => { list[fill[c]++] = it; });
  return { start, list };
}

export function buildGrid(P, I) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) {
    const a = i % 3;
    if (P[i] < min[a]) min[a] = P[i];
    if (P[i] > max[a]) max[a] = P[i];
  }
  const nx = Math.floor((max[0] - min[0]) / CELL) + 1;
  const ny = Math.floor((max[1] - min[1]) / CELL) + 1;
  const nz = Math.floor((max[2] - min[2]) / CELL) + 1;
  const cells = nx * ny * nz;
  const cx = (x) => Math.floor((x - min[0]) / CELL);
  const cy = (y) => Math.floor((y - min[1]) / CELL);
  const cz = (z) => Math.floor((z - min[2]) / CELL);

  const verts = binItems(cells, P.length / 3, (v, add) => {
    add(cx(P[3 * v]) + cy(P[3 * v + 1]) * nx + cz(P[3 * v + 2]) * nx * ny);
  });
  // A triangle goes into every cell its bounding box overlaps.
  const tris = binItems(cells, I.length / 3, (t, add) => {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
    const i0 = cx(Math.min(P[a], P[b], P[c])), i1 = cx(Math.max(P[a], P[b], P[c]));
    const j0 = cy(Math.min(P[a + 1], P[b + 1], P[c + 1])), j1 = cy(Math.max(P[a + 1], P[b + 1], P[c + 1]));
    const k0 = cz(Math.min(P[a + 2], P[b + 2], P[c + 2])), k1 = cz(Math.max(P[a + 2], P[b + 2], P[c + 2]));
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) add(i + j * nx + k * nx * ny);
  });

  return { min, n: [nx, ny, nz], vertStart: verts.start, verts: verts.list, triStart: tris.start, tris: tris.list };
}

export const gridBuffers = (g) => [g.vertStart.buffer, g.verts.buffer, g.triStart.buffer, g.tris.buffer];

// Calls visit(v) for every vertex in the cells a sphere overlaps.
export function forVerticesNear(g, x, y, z, r, visit) {
  const [nx, ny, nz] = g.n;
  const i0 = Math.max(0, Math.floor((x - r - g.min[0]) / CELL)), i1 = Math.min(nx - 1, Math.floor((x + r - g.min[0]) / CELL));
  const j0 = Math.max(0, Math.floor((y - r - g.min[1]) / CELL)), j1 = Math.min(ny - 1, Math.floor((y + r - g.min[1]) / CELL));
  const k0 = Math.max(0, Math.floor((z - r - g.min[2]) / CELL)), k1 = Math.min(nz - 1, Math.floor((z + r - g.min[2]) / CELL));
  const { vertStart, verts } = g;
  for (let k = k0; k <= k1; k++)
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const c = i + j * nx + k * nx * ny;
        for (let e = vertStart[c]; e < vertStart[c + 1]; e++) visit(verts[e]);
      }
}

// Nearest front-facing triangle along a ray, walking the grid cell by cell
// from where the ray enters it. Returns { local, face } or null.
export function raycastGrid(g, P, I, ox, oy, oz, dx, dy, dz) {
  const o = [ox, oy, oz], d = [dx, dy, dz];
  let tEnter = 0, tExit = Infinity;
  for (let a = 0; a < 3; a++) {
    const lo = g.min[a], hi = lo + g.n[a] * CELL;
    if (d[a] === 0) {
      if (o[a] < lo || o[a] > hi) return null;
      continue;
    }
    const ta = (lo - o[a]) / d[a], tb = (hi - o[a]) / d[a];
    tEnter = Math.max(tEnter, Math.min(ta, tb));
    tExit = Math.min(tExit, Math.max(ta, tb));
  }
  if (tEnter > tExit) return null;

  const cell = [0, 0, 0], step = [0, 0, 0], next = [Infinity, Infinity, Infinity], delta = [Infinity, Infinity, Infinity];
  for (let a = 0; a < 3; a++) {
    const lo = g.min[a];
    cell[a] = Math.min(g.n[a] - 1, Math.max(0, Math.floor((o[a] + d[a] * tEnter - lo) / CELL)));
    if (d[a] === 0) continue;
    step[a] = d[a] > 0 ? 1 : -1;
    next[a] = (lo + (cell[a] + (d[a] > 0 ? 1 : 0)) * CELL - o[a]) / d[a];
    delta[a] = CELL / Math.abs(d[a]);
  }

  const { triStart, tris } = g;
  const [nx, ny] = g.n;
  let best = Infinity, bestTri = -1;
  while (true) {
    const c = cell[0] + cell[1] * nx + cell[2] * nx * ny;
    for (let e = triStart[c]; e < triStart[c + 1]; e++) {
      const tri = tris[e];
      const a = 3 * I[3 * tri], b = 3 * I[3 * tri + 1], f = 3 * I[3 * tri + 2];
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[f] - P[a], e2y = P[f + 1] - P[a + 1], e2z = P[f + 2] - P[a + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det <= 0) continue; // back face
      const tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
      const u = tx * px + ty * py + tz * pz;
      if (u < 0 || u > det) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = dx * qx + dy * qy + dz * qz;
      if (v < 0 || u + v > det) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) / det;
      if (t >= 0 && t < best) { best = t; bestTri = tri; }
    }
    // Anything in a later cell is further away than this cell's exit.
    const axis = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : (next[1] < next[2] ? 1 : 2);
    if (best <= next[axis]) break;
    cell[axis] += step[axis];
    if (cell[axis] < 0 || cell[axis] >= g.n[axis]) break;
    next[axis] += delta[axis];
  }
  if (bestTri < 0) return null;

  const a = I[3 * bestTri], b = I[3 * bestTri + 1], c = I[3 * bestTri + 2];
  const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
  const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
  const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
  const l = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  return {
    local: { x: ox + dx * best, y: oy + dy * best, z: oz + dz * best },
    face: { a, b, c, normal: { x: fx / l, y: fy / l, z: fz / l } },
  };
}
