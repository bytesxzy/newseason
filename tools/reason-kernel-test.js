'use strict';
/* Tests for the shared kernel's LM, HLE-style, ARC-3 and multimodal adapters.
 *   node tools/reason-kernel-test.js
 * Everything is constructed here; no benchmark data. */
const assert = require('node:assert/strict');
const K = require('../c4-reason-kernel.js');
const PR = require('../c4-lm-problem.js');
const W = require('../c4-arc3-world.js');
const S = require('./arc3-synth.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }

/* ---------------------------------------------------------------- LM */
test('falsification removes the derivation with an invalid intermediate step', () => {
  const good = PR.checkDerivation(['(x+3)(x-2)', 'x^2 - 2x + 3x - 6', 'x^2 + x - 6']);
  const bad = PR.checkDerivation(['(x+3)(x-2)', 'x^2 - 2x + 3x - 6', 'x^2 + x + 6']);
  assert.equal(good.valid, true);
  assert.equal(bad.valid, false); assert.equal(bad.firstInvalid, 2);
  assert.equal(bad.diagnosis, K.FAILURE.BAD_INFERENCE);
  assert.equal(bad.repaired.value, 'x^2 + x - 6');
  const arith = PR.checkDerivation(['17 * 3 + 4', '51 + 4', '56']);
  assert.equal(arith.firstInvalid, 2); assert.equal(arith.diagnosis, K.FAILURE.ARITHMETIC_ERROR);
  assert.equal(arith.repaired.value, '55');
});
test('a derivation that fails its verifier is eliminated, the surviving answer is selected', () => {
  /* inject a broken method alongside the real ones */
  const saved = PR.METHODS.equation.slice();
  PR.METHODS.equation.push(P => ({ value: [PR.Frac.of(7)], text: 'x = 7', method: 'sloppy guess', key: '7' }));
  try {
    const r = PR.answer('Solve 2x + 3 = 11');
    assert.equal(r.answer, 'x = 4');
    assert.ok(r.eliminated.includes('sloppy guess'));
    assert.ok(r.diagnoses.some(d => d.method === 'sloppy guess'));
    assert.ok(r.status.CONTRADICTED >= 1);
  } finally { PR.METHODS.equation.length = 0; saved.forEach(m => PR.METHODS.equation.push(m)); }
});
test('independent derivations genuinely differ in method and agree on the answer', () => {
  const r = PR.answer('solve x^2 - 5x + 6 = 0');
  assert.deepEqual(r.agreeing.sort(), ['closed-form formula', 'numeric sign-change search', 'rational-root theorem']);
  assert.equal(r.answer, 'x = 2 or x = 3');
  const s = PR.answer('Solve 2x + y = 7, x - y = 2');
  assert.deepEqual(s.agreeing, ['Gaussian elimination', "Cramer's rule"]);
});
test('multiple choice by elimination', () => {
  const r = PR.answer('Solve 3x - 7 = 2. (A) 2 (B) 3 (C) 4');
  assert.equal(r.choice.answer, 'B');
  assert.deepEqual(r.choice.options.filter(o => o.eliminated).map(o => o.label), ['A', 'C']);
});
test('calibration: verified multi-path answer is more confident than an unsupported single path', () => {
  const multi = K.calibrate({ derivations: 3, verifierPass: 3, verifierTotal: 3 });
  const single = K.calibrate({ derivations: 1 });
  const contradicted = K.calibrate({ derivations: 2, disagreements: 1, contradictions: 1 });
  const missing = K.calibrate({ derivations: 3, verifierPass: 3, verifierTotal: 3, knowledgeCompleteness: 0.3 });
  assert.ok(multi.confidence > single.confidence);
  assert.ok(single.confidence > contradicted.confidence);
  assert.ok(missing.confidence < multi.confidence);
  assert.ok(multi.confidence < 1 && contradicted.confidence > 0);
  assert.ok(PR.answer('What is 10 choose 3?').confidence > PR.answer('prime factorization of 360').confidence);
});
test('knowledge is kept apart from reasoning', () => {
  assert.equal(PR.analyze('What is the capital of Nigeria?').kind, 'knowledge');
  assert.equal(PR.analyze('Solve 2x + 3 = 11').kind, 'derivable');
  const g = new K.ReasoningGraph();
  g.know('given:a'); g.need('fact:capital', 'not in the question');
  g.derive('answer', ['given:a', 'fact:capital'], 'lookup');
  assert.equal(g.get('answer'), null);                   /* nothing derived from a missing fact */
  assert.equal(g.diagnose()[0].kind, K.FAILURE.MISSING_KNOWLEDGE);
});
test('reasoning graph: contradiction demotes the weaker claim and what depends on it', () => {
  const g = new K.ReasoningGraph();
  g.assume('p', 'guess'); g.derive('q', ['p'], 'rule');
  g.know('not:p');
  assert.equal(g.get('p').status, 'CONTRADICTED');
  g.refute('p', 'given');
  assert.equal(g.get('q').status, 'CONTRADICTED');
});
test('interpretation: algebra in the text is not read as bare arithmetic', () => {
  assert.equal(PR.hasAlgebra('Solve x^2 - 5x + 6 = 0'), true);
  assert.equal(PR.hasAlgebra('If -6x + 13 equals 67, what is x?'), true);
  assert.equal(PR.hasAlgebra('What is 17 * 23?'), false);
  assert.equal(PR.hasAlgebra('Meet at 3pm, 5km away'), false);
  assert.equal(PR.answer('For which x is x^2 + 7x + 12 zero?').answer, 'x = -4 or x = -3');
});
test('exact tools: rationals, polynomials, number theory, probability, graphs, CSP', () => {
  const F = PR.Frac.of;
  assert.equal(F('0.1').add(F('0.2')).toString(), '3/10');
  const p = PR.toPoly(PR.parseExpr('(x+1)^3'), 'x');
  assert.equal(p.toString(), 'x^3 + 3x^2 + 3x + 1');
  assert.equal(p.deriv().toString(), '3x^2 + 6x + 3');
  assert.equal(PR.chooseMult(52n, 5n), 2598960n);
  assert.equal(PR.choosePascal(52n, 5n), 2598960n);
  assert.equal(PR.isPrimeMR(1000000007n), true);
  assert.equal(PR.modpow(3n, 1000n, 1000000007n), PR.modpow(3n, 1000n % 1000000006n, 1000000007n));
  assert.equal(PR.diceConvolve(3, 6, 10).toString(), PR.diceEnumerate(3, 6, 10).toString());
  assert.equal(PR.dijkstra([['a', 'b', 1], ['b', 'c', 1], ['a', 'c', 5]], 'a', 'c'), 2);
  const sol = PR.csp(['x', 'y'], { x: [1, 2, 3], y: [1, 2, 3] }, [a => a.x === undefined || a.y === undefined || a.x + a.y === 4, a => a.x === undefined || a.y === undefined || a.x < a.y]);
  assert.deepEqual(sol, [{ x: 1, y: 3 }]);
  assert.ok(Math.abs(PR.simpson(Math.sin, 0, Math.PI) - 2) < 1e-9);
});

/* -------------------------------------------------- multimodal interface */
test('visual facts enter the reasoning graph and are checked against coordinates', () => {
  const facts = [
    { type: 'POINT', id: 'A', x: 0, y: 0 }, { type: 'POINT', id: 'B', x: 4, y: 0 },
    { type: 'POINT', id: 'C', x: 1, y: -2 }, { type: 'POINT', id: 'D', x: 1, y: 3 },
    { type: 'LINE', id: 'AB', through: ['A', 'B'] }, { type: 'LINE', id: 'CD', through: ['C', 'D'] },
    { type: 'ARROW', from: 'A', to: 'B' }, { type: 'LABEL', text: 'x', at: 'A' },
    { type: 'RELATION', rel: 'parallel', a: 'AB', b: 'CD' }            /* a stated, wrong relation */
  ];
  const perp = PR.visualQuery(facts, 'perpendicular:AB:CD');
  assert.equal(perp.status, 'DERIVED');
  const g = perp.graph;
  assert.equal(g.get('arrow:A->B').status, 'KNOWN');
  assert.equal(g.get('on:A:AB').status, 'KNOWN');
  /* the stated parallel relation contradicts the coordinates */
  assert.ok(g.get('parallel:AB:CD') && g.get('not:parallel:AB:CD'));
  assert.ok(['CONTRADICTED'].includes(g.get('parallel:AB:CD').status) || ['CONTRADICTED'].includes(g.get('not:parallel:AB:CD').status));
  assert.ok(g.diagnose().some(d => d.kind === K.FAILURE.CONTRADICTION));
});

/* ------------------------------------------------------------ ARC-3 */
function tinyEnv(map) {
  /* 5x7 corridor, agent 3 at the left, goal 4 at the right, walls 5 */
  const env = new S.Env({ seed: 42, features: [], h: 5, w: 7, map });
  env.reset = function () {
    this.base = [[5, 5, 5, 5, 5, 5, 5], [5, 0, 0, 0, 0, 0, 5], [5, 0, 5, 0, 0, 4, 5], [5, 0, 0, 0, 0, 0, 5], [5, 5, 5, 5, 5, 5, 5]];
    this.agent = [2, 1]; this.goal = [2, 5]; this.tele = null; this.done = false; this.over = false; this.steps = 0;
    return this.frame();
  };
  return env;
}
const RIGHT_MAP = { 1: [0, 1], 2: [0, -1], 3: [1, 0], 4: [-1, 0], 5: [0, 0] };
test('world model: infers action effects from transitions', () => {
  const env = tinyEnv(RIGHT_MAP), ag = new W.Agent(env.actions);
  ag.observe(env.reset(), {});
  for (let t = 0; t < 40; t++) { const a = ag.act(); const o = env.step(a); ag.observe(o.grid, o); if (o.levelComplete) break; }
  for (const a of [1, 2, 3, 4]) {
    const r = ag.model.actionRule(a);
    if (r) assert.deepEqual([r.dr, r.dc], RIGHT_MAP[a]);
  }
  assert.ok([1, 2, 3, 4].filter(a => ag.model.actionRule(a)).length >= 3);
  assert.equal(ag.model.agentColor(), 3);
});
test('world model: a blocked move is explained by a condition, not a contradiction', () => {
  const env = tinyEnv(RIGHT_MAP), m = new W.WorldModel(env.actions);
  let p0 = W.perceive(env.reset());
  function step(a) { const o = env.step(a), p1 = W.perceive(o.grid); m.learn(p0, a, p1, o); p0 = p1; }
  step(3);                                   /* down into the open row */
  for (let i = 0; i < 5; i++) step(1);       /* right until the wall at column 6 */
  assert.ok(m.blockers[5] && m.blockers[5].confirm >= 1);
  assert.ok(m.repairs.some(r => r.mutation === 'add_condition'));
  assert.equal(m.actionRule(1).dc, 1);                   /* the rule survived, with a condition */
});
test('world model: a false prior rule is revised after contradictory evidence', () => {
  /* the prior says action 1 moves right; in this level it moves LEFT */
  const env = tinyEnv({ 1: [0, -1], 2: [0, 1], 3: [1, 0], 4: [-1, 0], 5: [0, 0] });
  const prior = { agent: 3, actions: { 1: { dr: 0, dc: 1 } }, blockers: [5], hazards: [], goals: [4], contacts: {} };
  const ag = new W.Agent(env.actions, { prior });
  let g = env.reset(); env.agent = [2, 4]; g = env.frame(); ag.observe(g, {});
  for (let t = 0; t < 6; t++) { ag.lastAction = 1; const o = env.step(1); ag.observe(o.grid, o); }
  const r = ag.model.actionRule(1);
  assert.ok(r, 'no rule for action 1');
  assert.deepEqual([r.dr, r.dc], [0, -1]);
  assert.equal(ag.model.actionModels['1'].disp['0,1'].stage(), 'retired');
});
test('world model: cross-level memory keeps mechanics, drops layout', () => {
  const env = tinyEnv(RIGHT_MAP), ag = new W.Agent(env.actions);
  S.play(env, ag, 60);
  const prior = ag.nextLevel();
  assert.equal(prior.agent, 3);
  assert.ok(prior.goals.includes(4));
  const text = JSON.stringify(prior);
  assert.ok(!/"r0"|"c0"|"pos"|"at"/.test(text), 'coordinates leaked into cross-level memory');
  assert.ok(Object.keys(prior.actions).length >= 1);
});
test('world model: exploration favours uncertain actions early and exploitation later', () => {
  const env = tinyEnv(RIGHT_MAP), ag = new W.Agent(env.actions);
  ag.observe(env.reset(), {});
  ag.act();
  const early = ag.trace[0].beta;
  for (let t = 0; t < 30; t++) { const a = ag.act(); const o = env.step(a); ag.observe(o.grid, o); if (o.levelComplete) break; }
  const late = ag.trace[ag.trace.length - 1].beta;
  assert.ok(late < early, 'uncertainty did not fall: ' + early + ' -> ' + late);
});

/* ------------------------------------------------------------ kernel */
test('kernel meta-controller learns feature -> operation weights from traces', () => {
  const traces = [];
  for (let i = 0; i < 20; i++) traces.push({ action: 'SIMPLIFY_PROGRAM', feats: ['diag:excessive_change'], gain: 0.2 });
  for (let i = 0; i < 20; i++) traces.push({ action: 'EXPAND_PROGRAM', feats: ['diag:excessive_change'], gain: 0 });
  const w = K.learnWeights(traces, 5);
  assert.ok(w['diag:excessive_change'].SIMPLIFY_PROGRAM > 0);
  assert.ok(w['diag:excessive_change'].EXPAND_PROGRAM < 0);
});
test('staged beliefs: tentative -> candidate -> persistent, retired by contradiction', () => {
  assert.equal(K.stageOf(1, 0, 0), 'tentative');
  assert.equal(K.stageOf(2, 0, 0), 'candidate');
  assert.equal(K.stageOf(3, 0, 1), 'persistent');
  assert.equal(K.stageOf(3, 0, 0), 'candidate');
  assert.equal(K.stageOf(2, 2, 0), 'retired');
});

console.log(`${passed} reasoning-kernel tests passed`);
