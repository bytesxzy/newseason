'use strict';
/* Tests of the concept engine (60-69) on synthetic tasks built here; no ARC
 * data. Each test states a property the architecture claims. */
const E = require('../c4-arc-engine.js');
let pass = 0;
function ok(name, cond) { if (!cond) { console.log('FAIL', name); process.exitCode = 1; } else { pass++; console.log('PASS', name); } }
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
function put(g, cells, v) { cells.forEach(([r, c]) => { g[r][c] = v; }); return g; }
function solve(train, testIn, ms) {
  const ctx = new E.Ctx(train, testIn, null);
  const progs = E.SKETCH.synthesize(ctx, Date.now() + (ms || 2000));
  progs.sort((a, b) => E.EMDL.cost(a) - E.EMDL.cost(b));
  return { ctx, progs };
}

/* 1. relational hole solved by version-space intersection: each object moves
   up by its OWN height (no literal offset is shared by the demonstrations) */
(function () {
  function task(shapes) {
    const x = blank(12, 12), y = blank(12, 12);
    shapes.forEach(([r, c, h, w, v]) => {
      for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) { x[r + i][c + j] = v; y[r - h + i][c + j] = v; }
    });
    return [x, y];
  }
  const train = [task([[8, 1, 3, 2, 1], [9, 6, 2, 3, 4]]), task([[6, 2, 4, 1, 2], [10, 7, 1, 2, 3]]), task([[7, 4, 2, 2, 6]])];
  const test = task([[9, 0, 3, 3, 5], [10, 8, 2, 1, 7]]);
  const { progs } = solve(train, [test[0]]);
  const top = progs[0];
  ok('move by own height is induced (not enumerated literals)', top && /move\[u\*h\]/.test(E.SKETCH.progKey(top)));
  ok('... and generalises to unseen sizes', top && E.G.gEq(E.SKETCH.run(top, test[0]), test[1]));
})();

/* 2. conditional from a clean residual partition: colour 1 objects recolour
   to 2, colour 3 objects are deleted, others stay */
(function () {
  function task(objs) {
    const x = blank(8, 8), y = blank(8, 8);
    objs.forEach(([r, c, v]) => { x[r][c] = v; x[r][c + 1] = v; y[r][c] = v === 1 ? 2 : v === 3 ? 0 : v; y[r][c + 1] = y[r][c]; });
    return [x, y];
  }
  const train = [task([[0, 0, 1], [2, 3, 3], [5, 1, 5]]), task([[1, 4, 3], [4, 0, 1], [6, 5, 1]]), task([[3, 2, 5], [6, 0, 3]])];
  const test = task([[0, 5, 1], [2, 1, 5], [5, 3, 3]]);
  const { progs } = solve(train, [test[0]]);
  ok('two-rule decision list separates the residual by predicate', progs.length && E.G.gEq(E.SKETCH.run(progs[0], test[0]), test[1]));
})();

/* 3. reflection across a related entity (flip fixed by geometry) */
(function () {
  function task(objR, lineR) {
    const x = blank(12, 7), y = blank(12, 7);
    for (let c = 0; c < 7; c++) { x[lineR][c] = 2; y[lineR][c] = 2; }
    const shape = [[0, 0], [0, 1], [1, 0]];
    shape.forEach(([dr, dc]) => { x[objR + dr][2 + dc] = 5; y[2 * lineR - (objR + dr)][2 + dc] = 5; });
    return [x, y];
  }
  const train = [task(1, 5), task(2, 6), task(0, 4)];
  const test = task(3, 7);
  const { progs } = solve(train, [test[0]]);
  ok('reflection across the line is found and flips the shape', progs.length && E.G.gEq(E.SKETCH.run(progs[0], test[0]), test[1]));
})();

/* 4. growth on the residual of a relaxed rule: keep the unique-colour pixel,
   delete the rest, draw an 8-halo around it */
(function () {
  function task(pix, noise) {
    const x = blank(9, 9), y = blank(9, 9);
    noise.forEach(([r, c]) => { x[r][c] = 5; });
    x[pix[0]][pix[1]] = 3;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = pix[0] + dr, c = pix[1] + dc;
      if (r >= 0 && r < 9 && c >= 0 && c < 9) y[r][c] = (dr || dc) ? 2 : 3;
    }
    return [x, y];
  }
  const train = [task([4, 4], [[0, 0], [1, 7], [5, 5], [8, 2]]), task([2, 6], [[3, 6], [7, 1], [8, 8]]), task([6, 2], [[0, 4], [5, 3], [2, 2]])];
  const test = task([3, 3], [[0, 8], [4, 4], [7, 6], [8, 0]]);
  const { progs } = solve(train, [test[0]], 3000);
  ok('relaxed object rule + growth rule on its residual', progs.length && progs.some(p => E.G.gEq(E.SKETCH.run(p, test[0]), test[1])));
})();

/* 5. the transducer is admitted only by leave-one-demo-out: a task whose
   demonstrations disagree about an identical context is rejected */
(function () {
  const a = [[1, 0], [0, 0]], b = [[2, 0], [0, 0]], c = [[3, 0], [0, 0]];
  const ctx = new E.Ctx([[a, b], [a, c]], [a], null);
  ok('transducer rejects contradictory demonstrations', E.TRANSDUCE.model(ctx, Date.now() + 1000) === null);
})();

/* 6. a classification lookup must see every entry at least twice */
(function () {
  const g1 = [[1, 1], [0, 0]], g2 = [[0, 1], [0, 1]], o1 = [[5]], o2 = [[6]];
  const ctx = new E.Ctx([[g1, o1], [g2, o2], [g1, o1]], [g2], null);
  const progs = E.ENCODE.synthesize(ctx, Date.now() + 500).filter(p => p.pat === 'lookup');
  ok('lookup with a singleton entry is refused', progs.length === 0);
})();

/* 7. two-stage composition: the second program perceives the first's output */
(function () {
  const p1 = { seg: 'c8', bg: 0, rules: [{ p: E.EXPR.predCatalog([], [1]).find(q => q.k === 'all'), a: { kind: 'recolor', c: E.EXPR.COLOR_EXPRS.find(c => c.k === 'c2') } }], def: 'keep', grow: [], canvas: -1 };
  const p2 = { seg: 'c8', bg: 0, rules: [], def: 'keep', grow: [{ p: E.EXPR.predCatalog([], [2]).find(q => q.k === 'col=2'), g: { op: E.GEN.OPS.find(o => o.key === 'halo4'), c: E.EXPR.COLOR_EXPRS.find(c => c.k === 'c7'), b: 3 } }], canvas: -1 };
  const x = put(blank(5, 5), [[2, 2]], 1);
  const out = E.SKETCH.run({ seq: [p1, p2], seg: 'c8', bg: 0 }, x);
  ok('composition runs P2 on P1(x)', out && out[2][2] === 2 && out[1][2] === 7 && out[2][1] === 7);
})();

console.log(`${pass} concept-engine tests passed`);
