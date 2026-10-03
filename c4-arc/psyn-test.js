'use strict';
/* Unit tests for the constrained program-induction modules (61-69). Each test states the property it protects. */
const assert = require('node:assert/strict');
const E = require('../c4-arc-engine.js');
const { G } = E, P = E.PSYN;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const g = rows => rows.map(r => r.split('').map(Number));
const probe = [[1, 2, 3], [4, 5, 6]];

test('D4 composition table agrees with grid functions on all 64 pairs', () => {
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++)
    assert.ok(G.gEq(P.d4Apply(P.d4Compose(a, b), probe), P.d4Apply(a, P.d4Apply(b, probe))), `compose(${a},${b})`);
  for (let a = 0; a < 8; a++) assert.equal(P.d4Index(x => P.d4Apply(a, x)), a);
});

test('canonicalisation fuses D4/translate/recolor chains and normalises booleans without changing behaviour', () => {
  const N = (op, ...args) => new P.Node(op, args);
  assert.equal(P.render(P.canon(N('Compose', N('D4', 1), N('D4', 1)))), 'D4(2)');
  assert.equal(P.render(P.canon(N('Compose', N('D4', 4), N('D4', 4)))), 'Id()');
  assert.equal(P.render(P.canon(N('Compose', N('Translate', 1, 0), N('Translate', 0, 2)))), 'Translate(1,2)');
  assert.equal(P.render(P.canon(N('Compose', N('Recolor', 1, 2), N('Recolor', 2, 3)))), 'Recolor(1,3)');
  assert.equal(P.render(P.canon(N('And', 'b', N('And', 'a', 'b')))), P.render(P.canon(N('And', 'a', 'b'))));
});

test('partial programs: domains narrow, bind rejects non-members, dead programs are detected, lower bound counts open holes', () => {
  const h = new P.Hole('C', P.Dom.finite([0, 1, 2, 3]));
  const pp = new P.PP(new P.Node('Recolor', [5, h]));
  assert.equal(pp.open().length, 1);
  assert.ok(Math.abs(pp.lowerBound() - 2) < 1e-9);
  const n = pp.narrow(h.id, P.Dom.finite([2, 3, 9]));
  assert.equal(P.Dom.size(n.holes[h.id].dom), 2);
  assert.equal(pp.narrow(h.id, P.Dom.finite([7, 8])), null);
  assert.equal(pp.bind(h.id, 9), null);
  assert.ok(pp.bind(h.id, 3).isClosed());
});

test('semantic equivalence store separates syntactic from semantic duplicates', () => {
  const a = new P.Accounts(), s = new P.EStore(a);
  assert.equal(s.admit('p1', () => 'fp-A', 1).status, 'new');
  assert.equal(s.admit('p1', () => 'fp-A', 1).status, 'syntactic');
  assert.equal(s.admit('p2', () => 'fp-A', 2).status, 'semantic');
  assert.equal(s.admit('p3', () => 'fp-B', 3).status, 'new');
  assert.equal(a.raw, 4); assert.equal(a.syntactic, 1); assert.equal(a.semantic, 1); assert.equal(a.classes, 2);
});

test('scene perception: shared partitions are detected, panels and relations exist', () => {
  const gr = g(['1100', '1100', '0002', '0000']);
  const s4 = P.parse(gr, 'c4', 'mode'), s8 = P.parse(gr, 'c8', 'mode');
  assert.equal(s4.n, 2); assert.equal(s8.n, 2);
  assert.ok(s4.rel().nearest.length === 2);
  assert.equal(s4.objs[0].size + s4.objs[1].size, 5);
});

/* inverse semantics: for a known forward effect, the inverse must return the true parameter AND its writes must be consistent
   with the demonstrated output */
function invCheck(kind, I, O, objPick, truth) {
  const sc = P.parse(I, 'c4', 'mode'), o = sc.objs.filter(objPick)[0];
  assert.ok(o, kind + ': object');
  const inf = P.FX[kind].infer(o, sc, I, O);
  assert.ok(inf.length > 0, kind + ': inverse returned nothing');
  const hit = inf.find(truth);
  assert.ok(hit !== undefined, kind + ': true parameter not recovered: ' + JSON.stringify(inf).slice(0, 200));
  const w = P.FX[kind].writes(o, hit, sc);
  assert.ok(P.consistent(w, sc, I, O), kind + ': recovered parameter inconsistent with output');
}
test('inverse semantics: recolor, move, ray, between, stamp recover their parameters from the output alone', () => {
  const I1 = g(['0000', '0110', '0110', '0000']), O1 = g(['0000', '0330', '0330', '0000']);
  invCheck('recolor', I1, O1, o => o.size === 4, v => v === 3);
  const I2 = g(['0000', '0100', '0000', '0000']), O2 = g(['0000', '0000', '0100', '0000']);
  invCheck('move', I2, O2, o => o.size === 1, v => JSON.stringify(v) === JSON.stringify([0, 1]));   // [dx, dy]: one step down
  const I3 = g(['0000', '0200', '0000', '0000']), O3 = g(['0000', '0222', '0000', '0000']);
  invCheck('ray', I3, O3, o => o.size === 1, v => v.d === 3 && v.col === -1);
  const I4 = g(['5000005', '0000000', '0000000']), O4 = g(['5555555', '0000000', '0000000']);
  invCheck('between', I4, O4, o => o.c0 === 0, v => v.ax === 0 && v.col === -1);
  const I5 = g(['00000', '00200', '00000', '00000']), O5 = g(['00000', '00200', '01010', '00000']);
  invCheck('stamp', I5, O5, o => o.size === 1, v => v.length === 2 && v[0][2] === 1);
});

test('inverse semantics prunes whole effect classes by the changed-cell footprint (no object-writing effects on bg-only tasks)', () => {
  const train = [[g(['0000', '0100', '0000']), g(['0000', '0100', '0100'])], [g(['0000', '0000', '0020']), g(['0000', '0020', '0020'])]];
  const acct = new P.Accounts();
  P.ObjFX.learnStage(train.map(p => [G.asGrid(p[0]), G.asGrid(p[1])]), 'c4', { timed_out: () => false }, acct, null);
  assert.ok(acct.pruned_abstract > 0, 'abstract execution should have removed effect kinds');
  assert.ok(acct.inferred_params < acct.naive_params, 'inversion should replace enumeration');
});

test('selector version space: exact conjunction found, support constraint enforced, result generalises to a new object', () => {
  // objects of colour 1 (any size) are deleted, others kept
  const mk = (cells) => g(cells);
  const train = [
    [mk(['0000000', '0110200', '0110000', '0000030']), mk(['0000000', '0000200', '0000000', '0000030'])],
    [mk(['1000000', '0002200', '0000000', '3000010']), mk(['0000000', '0002200', '0000000', '3000000'])],
  ];
  const ctx = { timed_out: () => false };
  const res = P.ObjFX.search(train.map(p => [G.asGrid(p[0]), G.asGrid(p[1])]), [G.asGrid(mk(['1100000', '0000300', '0000000']))], ctx, new P.Accounts(), null);
  assert.ok(res.programs.length > 0, 'no program');
  const out = P.ObjFX.runProgram(res.programs.sort((a, b) => a.bits - b.bits)[0], G.asGrid(mk(['1100000', '0000300', '0000000'])));
  assert.ok(G.gEq(out, G.asGrid(mk(['0000000', '0000300', '0000000']))), 'wrong prediction on held-out input');
});

test('synthesis end to end: object-wise recolour by size is induced from two demonstrations', () => {
  const rule = x => { const s = P.parse(x, 'c4', 'mode'); const o = G.copyGrid(x); for (const ob of s.objs) if (ob.size >= 3) for (const k of ob.cells) o[(k / s.W) | 0][k % s.W] = 5; return o; };
  const xs = [g(['1100020', '1000000', '0003300', '4440000']), g(['0000111', '0200000', '0000000', '3300000', '0055500']), g(['1000000', '0220000', '0200033', '0000030'])];   // two big objects per demonstration on both sides: neither position nor 'largest' explains the rule
  const A = G.asGrid, train = xs.slice(0, 2).map(x => [A(x), A(rule(x))]), test = A(xs[2]);
  const t0 = Date.now(), res = P.synthesize(train, [test], { timed_out: () => Date.now() - t0 > 3000 }, new P.Accounts(), null);
  assert.ok(res.programs.length > 0);
  const best = res.programs.sort((a, b) => a.rank - b.rank).find(p => { const o = p.run(test); return o && G.gEq(o, A(rule(xs[2]))); });
  assert.ok(best, 'no program predicts the held-out grid');
});

test('ablation switches: a switched-off mechanism is really off (inverse semantics => many more templates, same fits)', () => {
  const train = [[g(['0000', '0100', '0000']), g(['0000', '0300', '0000'])], [g(['0000', '0010', '0000']), g(['0000', '0030', '0000'])]].map(p => [G.asGrid(p[0]), G.asGrid(p[1])]);
  const run = () => { const a = new P.Accounts(); const r = P.ObjFX.search(train, [train[0][0]], { timed_out: () => false }, a, null); return { n: r.programs.length, t: a.tmpl_syntactic || 0 }; };
  const on = run(); P.setOff(['inverse']); const off = run(); P.setOff([]);
  assert.ok(off.t > on.t * 2, `expected >2x templates without inverse semantics (${on.t} vs ${off.t})`);
  assert.ok(on.n > 0 && off.n > 0);
});

test('learned policy only proposes or ranks: with every learned component off the exact search still finds the program', () => {
  const train = [[g(['0000', '0100', '0000']), g(['0000', '0300', '0000'])], [g(['0000', '0010', '0000']), g(['0000', '0030', '0000'])]].map(p => [G.asGrid(p[0]), G.asGrid(p[1])]);
  P.setOff(['value', 'fam', 'parseorder', 'macro', 'sched', 'kind']);
  const r = P.ObjFX.search(train, [train[0][0]], { timed_out: () => false }, new P.Accounts(), null);
  P.setOff([]);
  assert.ok(r.programs.length > 0);
});

test('latent-program generator: held-out compositions are structurally disjoint from training compositions, and every latent program reproduces its own task', () => {
  const L = require('../tools/arc-latent-gen.js');
  const ts = L.generate(40, 7);
  assert.ok(ts.length >= 20, 'generator produced too few tasks');
  const tr = new Set(ts.filter(t => t.split === 'train').map(t => t.sig)), he = ts.filter(t => t.split === 'heldout').map(t => t.sig);
  assert.ok(he.length > 0, 'no held-out tasks');
  for (const s of he) assert.ok(!tr.has(s), 'composition leaked into training: ' + s);
  for (const t of ts.slice(0, 10)) for (const p of t.task.train) assert.ok(G.gEq(P.ObjFX.runProgram(t.latent, p.input), p.output), 'latent program does not reproduce its demonstration');
});

console.log(`${passed} psyn tests passed`);
