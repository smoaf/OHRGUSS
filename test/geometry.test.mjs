// Checks that every printable part comes out as a closed, single-piece mesh for a
// range of designs, and that the export files are well formed.
// Uses the export resolutions, so it takes a minute or two.
//
// Usage: npm test

import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const C = require('../web/js/core.js');

/** Edges used by one triangle (holes) or by more than two (pinches). */
function edgeProblems(m) {
  const count = new Map(), nv = m.pos.length / 3;
  for (let t = 0; t < m.idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = m.idx[t + k], b = m.idx[t + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a;
      count.set(key, (count.get(key) || 0) + 1);
    }
  }
  let open = 0, pinched = 0;
  for (const n of count.values()) { if (n === 1) open++; else if (n !== 2) pinched++; }
  return { open, pinched };
}

/** Number of separate pieces in a mesh. */
function shells(m) {
  const nv = m.pos.length / 3, parent = Int32Array.from({ length: nv }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = find(m.idx[t]), b = find(m.idx[t + 1]), c = find(m.idx[t + 2]);
    parent[b] = a; parent[c] = a;
  }
  const roots = new Set();
  for (let i = 0; i < nv; i++) roots.add(find(i));
  return roots.size;
}

/** A design for both ears from shared settings, with optional left-ear overrides. */
const design = (shared, left = {}) => ({
  L: { ...C.DEFAULTS, ...shared, ...left, side: 'L' },
  R: { ...C.DEFAULTS, ...shared, side: 'R' }
});

const DESIGNS = {
  'defaults': design({}),
  'cord ring, different left ear': design({ cord: true }, { canalW: 7.8, canalH: 11.3, bend: 35, bendDir: 120, conchaW: 20, depth: 11 }),
  'removal grip': design({ grip: true }, { bendDir: 200 }),
  'solid with vent, no marks': design({ solid: true, vent: true, marks: false }),
  'case with hinge, loop and magnets': design({ caseHinge: true, caseLoop: true, caseMagnets: true }),
  'thick mould, constant core, wide bore': design({ mouldWall: 8, coreTaper: false, bore: 3, seatDia: 8 }),
  'small concha': design({ conchaW: 12, conchaH: 14, offX: 0, offY: 0, mouldWall: 4 }),
  'sizing kit fine steps': design({ kitMode: 'fine' }),
  'sizing kit bends': design({ kitMode: 'bends' })
};
const PARTS = [['plug', 0.25], ['mould', 0.32], ['case', 0.28], ['kit', 0.3]];

for (const [name, ds] of Object.entries(DESIGNS)) {
  test(name, () => {
    for (const [kind, res] of PARTS) {
      const { meshes } = C.generate(kind, ds, {}, res, true);
      assert.ok(meshes.length > 0, `${kind}: no parts`);
      for (const m of meshes) {
        const { open, pinched } = edgeProblems(m);
        assert.equal(open, 0, `${kind}/${m.name}: ${open} open edges`);
        assert.equal(pinched, 0, `${kind}/${m.name}: ${pinched} pinched edges`);
        assert.equal(shells(m), 1, `${kind}/${m.name}: more than one piece`);
        assert.ok(C.volume(m) > 0, `${kind}/${m.name}: inside out or empty`);
      }
    }
  });
}

test('STL and zip export are well formed', () => {
  const { meshes } = C.generate('plug', design({}), {}, 0.6, false);
  const stl = C.stl(meshes);
  const tris = meshes.reduce((n, m) => n + m.idx.length / 3, 0);
  const dv = new DataView(stl.buffer);
  assert.equal(dv.getUint32(80, true), tris);
  assert.equal(stl.length, 84 + tris * 50);

  const zip = C.zip([{ name: 'a.stl', data: stl }, { name: 'README.txt', data: new TextEncoder().encode('hello') }]);
  const zv = new DataView(zip.buffer);
  assert.equal(zv.getUint32(0, true), 0x04034b50, 'local header');
  assert.equal(zv.getUint32(zip.length - 22, true), 0x06054b50, 'end of central directory');
  assert.equal(zv.getUint16(zip.length - 12, true), 2, 'file count');
});
