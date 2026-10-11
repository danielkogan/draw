import { buildDino } from './dinos.js';

self.onmessage = (e) => {
  const { id } = e.data;
  const m = buildDino(id);
  self.postMessage({ id, ...m }, [m.positions.buffer, m.normals.buffer, m.indices.buffer]);
};
