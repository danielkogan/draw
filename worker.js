import { buildDino } from './dinos.js';
import { gridBuffers } from './grid.js';

self.onmessage = (e) => {
  const { id } = e.data;
  const m = buildDino(id);
  self.postMessage({ id, ...m }, [m.positions.buffer, m.normals.buffer, m.indices.buffer, ...gridBuffers(m.grid)]);
};
