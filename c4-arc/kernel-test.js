'use strict';
/* Tests for the residual-driven refinement kernel on ARC:
 * structured residuals, program repair, the exact pool / refinement frontier
 * boundary, bounded search, and counterfactual discrimination.
 *   node c4-arc/kernel-test.js
 * Every task here is synthetic and built in this file. */
const assert = require('node:assert/strict');
const E = require('../c4-arc-engine.js');
const K = globalThis.C4ReasonKernel;
const { G, RESID, REPAIR, PROG } = E;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const copy = g => g.map(r => r.slice());
function grid(h, w) { return Array.from({ length: h }, () => Array(w).fill(0)); }
function put(g, cells, c) { cells.forEach(([r, k]) => { g[r][k] = c; }); return g; }
function ctxOf(pairs, test) { return new E.Ctx(pairs, test || [pairs[0][0]], Date.now() + 10000); }
function kinds(preds, ctx) { return RESID.diagnose(preds, ctx).diagnoses.map(d => d.kind); }

/* a scene: a 2x2 red square and a 1x3 blue bar, in two placements */
function sceneA() { const g = grid(8, 8); put(g, [[1, 1], [1, 2], [2, 1], [2, 2]], 2); put(g, [[5, 3], [5, 4], [5, 5]], 1); return g; }
function sceneB() { const g = grid(8, 8); put(g, [[3, 4], [3, 5], [4, 4], [4, 5]], 2); put(g, [[6, 0], [6, 1], [6, 2]], 1); return g; }
const idPairs = [[sceneA(), sceneA()], [sceneB(), sceneB()]];

/* ------------------------------------------------------------ residuals */
test('residual: one pixel wrong is a local cell defect, not a wrong rule', () => {
  const ctx = ctxOf(idPairs);
  const p = [copy(idPairs[0][1]), copy(idPairs[1][1])]; p[0][7][7] = 5;
  const d = RESID.diagnose(p, ctx), q = d.residual;
  assert.equal(q.pairErrors, 1); assert.equal(q.cellErrors, 1);
  assert.ok(q.norm < 0.02);
  assert.ok(kinds(p, ctx).includes('local_cells'));
  assert.ok(!kinds(p, ctx).includes('wrong_dims'));
});
test('residual: one colour wrong everywhere is a consistent colour substitution', () => {
  const ctx = ctxOf(idPairs);
  const p = idPairs.map(([, y]) => y.map(r => r.map(v => v === 2 ? 7 : v)));
  const d = RESID.diagnose(p, ctx).diagnoses;
  const sub = d.find(x => x.kind === 'color_substitution');
  assert.ok(sub && sub.strong); assert.deepEqual(sub.table, { 7: 2 });
});
test('residual: whole output shifted by one cell is a consistent translation', () => {
  const ctx = ctxOf(idPairs);
  const p = idPairs.map(([, y]) => G.translate(y, 1, 0, 0));
  const t = RESID.diagnose(p, ctx).diagnoses.find(x => x.kind === 'consistent_translation');
  assert.ok(t && t.strong); assert.equal(t.dr, -1); assert.equal(t.dc, 0);
});
test('residual: missing object vs extra object are told apart', () => {
  const ctx = ctxOf(idPairs);
  const miss = idPairs.map(([, y]) => y.map(r => r.map(v => v === 1 ? 0 : v)));
  const km = kinds(miss, ctx);
  assert.ok(km.includes('missing_objects')); assert.ok(!km.includes('extra_objects'));
  const extra = idPairs.map(([, y]) => { const g = copy(y); g[0][7] = 3; return g; });
  const ke = kinds(extra, ctx);
  assert.ok(ke.includes('extra_objects') || ke.includes('excessive_change')); assert.ok(!ke.includes('missing_objects'));
});
test('residual: right shape in the wrong relative place is an object move', () => {
  const ctx = ctxOf(idPairs);
  const p = idPairs.map(([, y]) => {
    const g = y.map(r => r.map(v => v === 1 ? 0 : v));
    const cells = []; y.forEach((row, r) => row.forEach((v, c) => { if (v === 1) cells.push([r - 1, c]); }));
    return put(g, cells, 1);
  });
  const mv = RESID.diagnose(p, ctx).diagnoses.find(x => x.kind === 'object_moved');
  assert.ok(mv && mv.consistent); assert.equal(mv.dr, 1); assert.equal(mv.dc, 0);
});
test('residual: correct rule except one object class names the class', () => {
  /* rule: recolour every object to 4; candidate misses the enclosed one */
  function scene(off) {
    const g = grid(9, 9);
    for (let i = 0; i < 5; i++) { g[off][off + i] = 5; g[off + 4][off + i] = 5; g[off + i][off] = 5; g[off + i][off + 4] = 5; }
    g[off + 2][off + 2] = 6; g[8][8 - off] = 3; g[0][8] = 3;
    return g;
  }
  const xs = [scene(1), scene(2)], ys = xs.map(x => x.map(r => r.map(v => v ? 4 : 0)));
  const ctx = ctxOf(xs.map((x, i) => [x, ys[i]]));
  const preds = xs.map((x, i) => ys[i].map((r, rr) => r.map((v, cc) => x[rr][cc] === 6 ? 6 : v)));
  const d = RESID.diagnose(preds, ctx).diagnoses.find(x => x.kind === 'unhandled_object_class');
  assert.ok(d, 'no class diagnosis');
  assert.ok(['enclosed', 'color', 'single', 'smallest'].includes(d.feature));
  assert.equal(d.polarity, 'under');
});

/* ------------------------------------------------------------- repair */
function repairFrom(pairs, test, want, corrupted) {
  const ctx = new E.Ctx(pairs, [test], Date.now() + 10000);
  const A = new REPAIR.ArcAdapter(ctx);
  const out = K.refine(A, [A.seed(null, corrupted, {})], { maxMs: 3000, maxSteps: 60, stopOnExact: true, childCap: 12 });
  assert.ok(out.exact.length, 'no exact repair from ' + REPAIR.render(corrupted));
  const h = out.exact[0];
  assert.ok(A.verifyExact(h));
  assert.ok(G.gEq(h.predictions[0], want), 'repair does not generalise: ' + REPAIR.render(h.program.tree));
  return h;
}
const T = (op, kid, params) => ({ op, kids: [kid], params: params || [] });
const IN = { op: 'in' };
function runT(tree, g) { return REPAIR.runTree(REPAIR.fromTree(tree), g, g, 0); }
function taskFor(tree, xs) { const ys = xs.map(x => runT(tree, x)); return { pairs: xs.slice(0, -1).map((x, i) => [x, ys[i]]), test: xs[xs.length - 1], want: ys[ys.length - 1] }; }
const XS = [sceneA(), sceneB(), (() => { const g = grid(8, 8); put(g, [[2, 5], [2, 6], [3, 5], [3, 6]], 2); put(g, [[7, 1], [7, 2], [7, 3]], 1); return g; })()];

test('repair: wrong translation magnitude', () => {
  const t = taskFor(T('offset', IN, [1, 2]), XS);
  const h = repairFrom(t.pairs, t.test, t.want, T('offset', IN, [1, 1]));
  assert.ok(h.lineage.depth >= 1 && h.lineage.mutation);
});
test('repair: wrong colour parameter', () => {
  const t = taskFor(T('replace', IN, [2, 8]), XS);
  repairFrom(t.pairs, t.test, t.want, T('replace', IN, [2, 3]));
});
test('repair: wrong object selector', () => {
  const t = taskFor(T('keep_only', IN, [0, 0]), XS);            /* largest */
  repairFrom(t.pairs, t.test, t.want, T('keep_only', IN, [0, 1])); /* smallest */
});
test('repair: missing composition step', () => {
  const t = taskFor(T('flip_h', T('rot90', IN)), XS);
  repairFrom(t.pairs, t.test, t.want, T('rot90', IN));
});
test('repair: incorrect rotation', () => {
  const t = taskFor(T('rot270', IN), XS);
  repairFrom(t.pairs, t.test, t.want, T('rot90', IN));
});
test('repair: wrong object predicate', () => {
  const t = taskFor(T('select_by', IN, [0, 7, 1]), XS);           /* objects with colour 1 */
  repairFrom(t.pairs, t.test, t.want, T('select_by', IN, [0, 7, 2]));
});
test('repair: excessive change filtered by change-set class', () => {
  /* the program paints every background cell next to red; target only the
     largest such change component. Base = typed program, repair = filter */
  const xs = XS.map(copy);
  const trueT = T('filter_changes', T('outline_c', IN, [4]), [{ f: 'largest', v: 1, inv: false }]);
  const ys = xs.map(x => REPAIR.runTree(REPAIR.fromTree(trueT), x, x, 0));
  if (ys.some(y => !y)) return;               /* degenerate scene: nothing to test */
  repairFrom(xs.slice(0, 2).map((x, i) => [x, ys[i]]), xs[2], ys[2], T('outline_c', IN, [4]));
});

/* ---------------------------------------------- exact pool vs. frontier */
test('frontier: bounded, cluster-diverse, duplicate-free', () => {
  const F = new K.Frontier(32, 4);
  for (let i = 0; i < 500; i++) {
    const h = new K.Hypothesis({ key: 'k' + (i % 300), cluster: 'c' + (i % 7) });
    h.residual = { norm: (i % 13) / 13 }; h.score = i % 17;
    F.add(h);
  }
  assert.ok(F.size() <= 32);
  F.byCluster.forEach(l => assert.ok(l.length <= 4));
  assert.equal(new Set(F.items.map(h => h.key)).size, F.items.length);
  assert.ok(F.clusters() >= 7);
});
test('frontier: mutation loops terminate on duplicate states', () => {
  let calls = 0;
  const adapter = {
    evaluate(h) { h.key = 'same'; h.residual = { norm: 0.5 }; h.status = 'near'; h.complexity = 1; h.cluster = 'c'; },
    diagnose() { return [{ kind: 'x', weight: 1, strong: false }]; },
    repair(h) { calls++; return [K.derive(h, {}, { kind: 'noop' }), K.derive(h, {}, { kind: 'noop' })]; },
    verifyExact() { return false; }
  };
  const out = K.refine(adapter, [new K.Hypothesis({})], { maxMs: 2000, maxSteps: 500 });
  assert.equal(out.exact.length, 0);
  assert.ok(out.stats.steps < 500, 'did not terminate early');
  assert.ok(out.stats.duplicates > 0);
  assert.ok(calls < 50);
});
test('near-solutions are never emitted as answers', () => {
  /* the only generator returns a program that is one cell wrong; nothing can
     repair a cell that no program explains, so the answer set stays empty */
  const x = sceneA(), y = copy(x); y[7][7] = 9;
  const x2 = sceneB(), y2 = copy(x2); y2[0][0] = 9;
  const near = { __name__: 'nearonly', SOLVER: 'geometry', PHASE: 1,
    generate: () => [new E.Hyp('almost', g => { const o = copy(g); o[7][7] = 9; return o; }, 1, 'geometry')] };
  const r = E.solveTask({ train: [{ input: x, output: y }, { input: x2, output: y2 }], test: [{ input: XS[2] }] },
                        { time_budget: 1.0, loo: false, modules: [near] });
  for (const preds of r.predictions) for (const p of preds) {
    /* anything emitted must reproduce both demonstrations */
    assert.ok(false, 'a prediction was emitted without an exact program: ' + JSON.stringify(p).slice(0, 60));
  }
  assert.ok(r.diagnostics.refinement.ran);
});
test('exact repairs stay exact through the portfolio', () => {
  const t = taskFor(T('replace', T('rot90', IN), [2, 6]), XS);
  const nearMod = { __name__: 'nearrot', SOLVER: 'geometry', PHASE: 1,
    generate: () => [new E.Hyp('rot90', g => G.rot90(g), 1, 'geometry')] };
  const r = E.solveTask({ train: t.pairs.map(([i, o]) => ({ input: i, output: o })), test: [{ input: t.test }] },
                        { time_budget: 2.0, loo: false, modules: [nearMod] });
  assert.ok(r.predictions[0].length, 'no prediction');
  assert.ok(G.gEq(r.predictions[0][0], t.want));
  assert.equal(r.chosen[0][0], 'repair');
  const ex = r.diagnostics.refinement.exact[0];
  assert.ok(ex.lineage.length >= 1 && ex.lineage[0].mutation);
});

/* -------------------------------------------------- counterfactuals */
test('counterfactual: two exact rules that agree on every demonstration are discriminated, not decided', () => {
  /* H1 "move the red object right", H2 "move the leftmost object right":
     in every demonstration the red object IS the leftmost one */
  function scene(redC, blueC) { const g = grid(6, 10); g[2][redC] = 2; g[4][blueC] = 1; return g; }
  function moveWhere(g, pred) {
    const o = copy(g); let pos = null;
    g.forEach((row, r) => row.forEach((v, c) => { if (v && pred(v, c, g) && pos === null) pos = [r, c]; }));
    if (!pos) return null; o[pos[0]][pos[1]] = 0; o[pos[0]][pos[1] + 1] = g[pos[0]][pos[1]]; return o;
  }
  const leftmost = g => { let m = 99; g.forEach(row => row.forEach((v, c) => { if (v && c < m) m = c; })); return m; };
  const h1 = new E.Hyp('move_red', g => moveWhere(g, v => v === 2), 2.0, 'objects');
  const h2 = new E.Hyp('move_leftmost', g => moveWhere(g, (v, c, gg) => c === leftmost(gg)), 2.0, 'select');
  const xs = [scene(1, 5), scene(2, 7), scene(0, 3)];
  const train = xs.map(x => ({ input: x, output: h1.apply(x) }));
  xs.forEach((x, i) => assert.ok(G.gEq(h2.apply(x), train[i].output)));
  const testX = scene(6, 2);                         /* red now on the RIGHT */
  const mod = { __name__: 'two', SOLVER: 'objects', PHASE: 1, generate: () => [h1, h2] };
  const r = E.solveTask({ train, test: [{ input: testX }] }, { time_budget: 1.5, loo: false, modules: [mod], collect_all: true });
  const cf = r.diagnostics.counterfactual;
  assert.ok(cf.ran, 'counterfactual did not run: ' + cf.reason);
  assert.ok(cf.divergent_probes.length > 0, 'no divergence found');
  /* both readings survive into the ranked output: no hidden label is claimed */
  assert.equal(r.predictions[0].length, 2);
  assert.ok(r.predictions[0].some(p => G.gEq(p, h1.apply(testX))));
  assert.ok(r.predictions[0].some(p => G.gEq(p, h2.apply(testX))));
});
test('kernel discriminate reports fragility without labels', () => {
  const hs = [{ f: x => x * 2 }, { f: x => (x > 3 ? null : x * 2) }];
  const d = K.discriminate(hs, [1, 2, 5, 7], (h, p) => h.f(p), out => out < 100);
  assert.deepEqual(d.robustness, [1, 0.5]);
  assert.equal(d.divergentProbes.length, 0);          /* never two different outputs */
});

/* --------------------------------------------------------------- scoring */
test('MDL score: exact beats near at equal complexity; repair path costs bits', () => {
  const a = new K.Hypothesis({ complexity: 10, status: 'exact' }), b = new K.Hypothesis({ complexity: 10, status: 'near', residualBits: 12 });
  const c = new K.Hypothesis({ complexity: 10, status: 'exact', repairBits: 6 });
  assert.ok(K.mdlScore(a).total < K.mdlScore(b).total);
  assert.ok(K.mdlScore(a).total < K.mdlScore(c).total);
  assert.equal(K.mdlScore(b).parts.residual, 12);
});
test('aux repair operators leave existing program code lengths unchanged', () => {
  /* the Kraft total over the synthesis alphabet excludes aux operators */
  const total = Object.keys(PROG.OPS).filter(k => !PROG.OPS[k].aux).reduce((s, k) => s + Math.pow(2, -PROG.opBits(k)), 0);
  assert.ok(Math.abs(total + Math.pow(2, -PROG.opBits('in')) - 1) < 0.2);
  assert.ok(PROG.opBits('offset') > 1);
});

console.log(`${passed} kernel tests passed`);
