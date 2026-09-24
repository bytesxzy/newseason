'use strict';
/* Architecture generalisation tests. Every task here is synthetic and built
 * in this file (or by tools/arc-curriculum.js generators); none is an ARC
 * benchmark task, and nothing here names one. These check that the new
 * mechanisms do what they claim WITHOUT task-specific rules:
 *   macro generalisation, composition generalisation, representation
 *   switch by the reasoning kernel, deep (>= 3 edit) repair, duplicate
 *   suppression (and its soundness), counterfactual discrimination.
 *   node c4-arc/generalize-test.js */
const assert = require('node:assert/strict');
const E = require('../c4-arc-engine.js');
const C = require('../tools/arc-curriculum.js');
const K = E.KERNEL, { G, PROG, CANON, MACROS, REPAIR, POPSEARCH, CFACT } = E;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function grid(h, w) { return Array.from({ length: h }, () => Array(w).fill(0)); }
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const T = (op, kid, params) => ({ op, kids: [kid], params: params || [] });
const IN = { op: 'in' };
const run = (t, g) => PROG.runTree(t, g, { bg: 0, x: g });
/* object scene: n rectangles of random colours, sizes, positions */
function scene(r, h, w, n, pal) {
  const g = grid(h, w);
  for (let k = 0; k < n; k++) {
    const oh = 1 + Math.floor(r() * 3), ow = 1 + Math.floor(r() * 3), c = pal[Math.floor(r() * pal.length)];
    const r0 = Math.floor(r() * (h - oh)), c0 = Math.floor(r() * (w - ow));
    for (let i = 0; i < oh; i++) for (let j = 0; j < ow; j++) g[r0 + i][c0 + j] = c;
  }
  return g;
}

test('duplicate suppression: equivalent programs collapse, and only equivalent ones', () => {
  const r = rng(7), ops = ['rot90', 'rot180', 'rot270', 'flip_h', 'flip_v', 'transpose', 'anti_transpose', 'crop', 'compress', 'dedup'];
  const probes = [0, 1, 2, 3, 4, 5].map(k => scene(r, 5 + k, 7 - (k % 3), 3, [1, 2, 3, 4]));
  const raw = new Set(), canon = new Set(), beh = new Set(), canonToBeh = new Map();
  for (let i = 0; i < 600; i++) {
    let t = IN; const d = 1 + Math.floor(r() * 4);
    for (let k = 0; k < d; k++) t = T(ops[Math.floor(r() * ops.length)], t);
    raw.add(PROG.treeRender(t));
    const ck = CANON.structural(t), bk = probes.map(g => { const y = run(t, g); return y ? G.gkey(y) : '~'; }).join('#');
    canon.add(ck); beh.add(bk);
    if (canonToBeh.has(ck)) assert.equal(canonToBeh.get(ck), bk, 'canonicalisation merged two different functions: ' + ck);
    canonToBeh.set(ck, bk);
  }
  /* most syntactic variety is redundant; the canonical rewrites collapse
     most of the redundancy (the rest is only equal on these grids, which
     no sound rewrite may assume) */
  const collapse = (raw.size - canon.size) / Math.max(1, raw.size - beh.size);
  assert.ok(collapse >= 0.7, `collapsed ${(collapse * 100).toFixed(1)}% of redundant variants`);
  /* the eight square symmetries: every redundant composition collapses */
  const dih = ['rot90', 'rot180', 'rot270', 'flip_h', 'flip_v', 'transpose', 'anti_transpose'], dc = new Set(), db = new Set();
  for (let i = 0; i < 400; i++) {
    let t = IN; const d = 1 + Math.floor(r() * 5);
    for (let k = 0; k < d; k++) t = T(dih[Math.floor(r() * dih.length)], t);
    dc.add(CANON.structural(t)); db.add(probes.map(g => G.gkey(run(t, g))).join('#'));
  }
  assert.equal(dc.size, db.size, 'symmetry chains must collapse exactly to their group elements');
});

test('macro generalisation: learned on one palette and geometry, used on unseen colours, sizes, positions, counts', () => {
  MACROS.clear();
  const r = rng(11);
  /* experience: tasks whose solutions share "crop the largest object, then
     rotate", written with different literals */
  const programs = [];
  for (let i = 0; i < 6; i++) programs.push({ tree: T('rot90', T('crop', T('keep_only', IN, [0, 0]))), task: 'e' + i });
  for (let i = 0; i < 6; i++) programs.push({ tree: T('flip_h', T('crop', T('keep_only', IN, [0, 0]))), task: 'f' + i });
  const cands = MACROS.mine(programs, { minSupport: 3 });
  const m = cands.find(c => c.skeleton.indexOf('crop(keep_only(') >= 0);
  assert.ok(m, 'no macro mined for the shared fragment');
  /* a NEW task: palette {5,6,7}, bigger grids, more objects, a different
     outer step (transpose) never seen with the fragment */
  const rule = g => run(T('transpose', T('crop', T('keep_only', IN, [0, 0]))), g);
  const xs = [], ys = [];
  while (xs.length < 5) { const x = scene(r, 11 + xs.length, 12, 4 + xs.length % 2, [5, 6, 7]); const y = rule(x); if (y && !G.gEq(y, x)) { xs.push(x); ys.push(y); } }
  const train = xs.slice(0, 4).map((x, i) => [x, ys[i]]);
  function solve(depth) {
    const ctx = new E.Ctx(train, [xs[4]], Date.now() + 4000);
    return E.SYN.search(ctx, depth, 300, Date.now() + 4000, 6).find(p => { const y = p.run(xs[4]); return y && G.gEq(y, ys[4]); });
  }
  assert.equal(solve(2), undefined, 'depth-2 search should not reach a depth-3 rule without the macro');
  MACROS.load([Object.assign({ name: 'croplarge' }, m)]);
  try {
    const p = solve(2);
    assert.ok(p, 'with the learned macro the rule is reachable at depth 2 and generalises');
    assert.ok(MACROS.uses(PROG.toTree(p.struct, p.theta)) >= 1);
  } finally { MACROS.clear(); }
});

test('composition generalisation: held-out adjacencies of trained families are solved', () => {
  /* experience: A (geometry), B (colour), A>B, C (object selection);
     held out: B>C, C>A, A>C>B */
  const r = rng(5);
  const A = k => T('flip_v', k), B = k => T('replace', k, [2, 8]), Cs = k => T('pick_crop', k, [0, 0]);
  const heldOut = [['B>C', t => Cs(B(t))], ['C>A', t => A(Cs(t))], ['A>C>B', t => B(Cs(A(t)))]];
  for (const [name, mk] of heldOut) {
    const P = mk(IN), xs = [], ys = [];
    let guard = 0;
    while (xs.length < 6 && guard++ < 500) { const x = scene(r, 8 + (xs.length % 3), 9, 3, [2, 3, 4]); const y = run(P, x); if (y && !G.gEq(y, x)) { xs.push(x); ys.push(y); } }
    const item = { xs, ys, depth: PROG.treeSize(P), kind: 'compose' };
    const a = C.solveCore(item, { ms: 1500 });
    assert.ok(a.generalized, 'held-out composition not solved: ' + name);
    assert.ok(a.generalizedBoth, 'held-out composition does not transfer to a second unseen input: ' + name);
  }
});

test('representation switch: raw-cell search fails, the kernel moves to colour roles and succeeds', () => {
  /* rule: recolour the most frequent foreground colour ROLE; every
     demonstration uses its own palette, so no literal-colour program fits */
  const r = rng(3);
  const rule = x => { const p = CANON.rolePerm(x); const y = run(T('replace', IN, [1, 5]), CANON.mapColors(x, p.fwd)); return y ? CANON.mapColors(y, p.inv) : null; };
  const pals = [[2, 3], [4, 6], [7, 1], [9, 8], [3, 5], [6, 2]];
  const xs = [], ys = [];
  for (let i = 0; xs.length < 6 && i < 200; i++) {
    const pal = pals[xs.length], x = scene(r, 8, 9, 4, pal); const y = rule(x);
    const h = G.histogram(x); if (!(h[pal[0]] > h[pal[1]] && h[pal[1]] > 0)) continue;
    if (y && !G.gEq(y, x)) { xs.push(x); ys.push(y); }
  }
  const train = xs.slice(0, 4).map((x, i) => [x, ys[i]]);
  const ctx = new E.Ctx(train, [xs[4]], Date.now() + 8000);
  const raw = E.SYN.search(ctx, 2, 300, Date.now() + 1500, 6);
  assert.ok(!raw.some(p => { const y = p.run(xs[4]); return y && G.gEq(y, ys[4]); }), 'raw cells should not already solve it');
  const A = new REPAIR.ArcAdapter(ctx);
  /* the near-miss a raw search leaves: right operation, literal colours */
  const seed = A.seed(null, T('replace', IN, [2, 5]), {});
  const out = K.refine(A, [seed], { maxMs: 6000, maxSteps: 60, stopOnExact: true, childCap: 12,
                                    actions: ['REFINE_BEST', 'PROPOSE_REPRESENTATION', 'ABSTRACT_RESIDUAL', 'STOP'] });
  assert.ok(out.stats.migrations >= 1, 'the kernel never proposed a representation change');
  const ex = out.exact.find(h => h.representationId !== 'raw');
  assert.ok(ex, 'no exact program in another representation');
  const y = A.closure(ex.program)(xs[5]);
  assert.ok(y && G.gEq(y, ys[5]), 'the migrated program does not generalise to an unseen palette');
});

test('deep repair: a program three meaningful edits away is recovered and generalises', () => {
  const r = rng(21);
  const truth = T('crop', T('replace', T('flip_h', IN), [3, 7]));
  /* three edits: operator (flip_h -> flip_v), parameter (7 -> 4), deletion of crop */
  const seed = T('replace', T('flip_v', IN), [3, 4]);
  const xs = [], ys = [];
  for (let i = 0; xs.length < 6 && i < 300; i++) { const x = scene(r, 9, 10, 4, [3, 5, 6]); const y = run(truth, x); if (y && !G.gEq(y, x) && G.histogram(x)[3]) { xs.push(x); ys.push(y); } }
  const train = xs.slice(0, 4).map((x, i) => [x, ys[i]]);
  const ctx = new E.Ctx(train, [xs[4]], Date.now() + 20000);
  const A = new REPAIR.ArcAdapter(ctx);
  const s = A.seed(null, seed, {});
  let ex = K.refine(A, [s], { maxMs: 1500, maxSteps: 200, stopOnExact: true, childCap: 12, maxDepth: 6 }).exact[0];
  let depth = ex ? ex.lineage.depth : 0;
  if (!ex) {
    const po = POPSEARCH.search(A, [A.seed(null, seed, {})], { maxMs: 8000, afterExact: 0, seed: 5 });
    ex = po.exact[0];
    depth = po.stats.exactDepths[0] || 0;
  }
  assert.ok(ex, 'deep repair not recovered');
  assert.ok(depth >= 2, 'recovered in fewer edits than the corruption applied?');
  const y = A.closure(ex.program)(xs[5]);
  assert.ok(y && G.gEq(y, ys[5]), 'recovered program does not generalise');
});

test('counterfactual discrimination: two programs that agree on every demonstration are separated by generated probes', () => {
  const r = rng(9);
  const P1 = T('keep_only', IN, [0, 0]), P2 = T('keep_only', IN, [0, 8]);   /* largest vs first */
  const xs = [];
  let guard = 0;
  while (xs.length < 4 && guard++ < 2000) {
    const x = scene(r, 9, 9, 3, [1, 2, 4]), a = run(P1, x), b = run(P2, x);
    if (a && b && G.gEq(a, b) && !G.gEq(a, x)) xs.push(x);
  }
  let tx = null; guard = 0;
  while (!tx && guard++ < 2000) { const x = scene(r, 9, 9, 3, [1, 2, 4]); if (!G.gEq(run(P1, x), run(P2, x))) tx = x; }
  const ctx = new E.Ctx(xs.map(x => [x, run(P1, x)]), [tx], Date.now() + 5000);
  const d = CFACT.discriminate(ctx, [g => run(P1, g), g => run(P2, g)], { budgetMs: 2000 });
  assert.ok(d.pool > 0 && d.probes.length > 0, 'no discriminating probe generated');
  assert.ok(d.disagreement >= 0.5, 'chosen probes do not split the two programs: ' + d.disagreement);
  /* and no label is claimed: both programs survive with a fragility, not a verdict */
  assert.equal(d.fragility.length, 2);
});

console.log(`${passed} generalisation tests passed`);
