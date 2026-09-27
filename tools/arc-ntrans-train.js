/* Train the neural transduction branch (c4-arc/src/74-ntrans.js).
 *
 *   node tools/arc-ntrans-train.js [--examples 200000] [--batch 32] [--workers 4]
 *        [--lr 0.001] [--seed 2] [--out FILE] [--write]
 *
 * Every example is a same-shape synthetic task (tools/arc-steps-lib.js:
 * step programs allowed in training, entity programs, random cellular
 * automata) of 4 pairs: one pair is the target, the other three the context
 * (every pair takes a turn, as in leave-one-out test-time-training tasks).
 * Each task is transformed as a WHOLE by a random square symmetry and a
 * random colour permutation, which is exact: the transformed task is still a
 * task. Validation (a stream the workers never draw): exact-grid accuracy on
 * the target, and the LODO gate's coverage and precision.
 */
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path');
const L = require('./arc-steps-lib.js');
const E = L.E, { NN, NTRANS, G } = E;

function viewModel(m, wBuf, gBuf) { let o = 0; m.list.forEach(P => { P.w = new Float32Array(wBuf, o * 4, P.n); if (gBuf) P.g = new Float32Array(gBuf, o * 4, P.n); o += P.n; }); }
const D4 = [g => g, G.rot90, G.rot180, G.rot270, G.flipH, G.flipV, G.transpose, G.antiTranspose];
function augment(pairs, R) {
  const pi = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  if (R() < 0.7) for (let i = 9; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = pi[i]; pi[i] = pi[j]; pi[j] = t; }
  const f = D4[Math.floor(R() * 8)], P = g => f(g).map(r => r.map(v => pi[v]));
  return pairs.map(([x, y]) => [P(x), P(y)]);
}
function taskPairs(R, which) {
  for (;;) { const t = L.sampleSameShapeTask(R, which, 3, 1); if (t) return t.runs.concat(t.queries).map(r => [r.x, r.y]); }
}
function bgOf(pairs) { const b = pairs.map(p => G.background(p[0])); return b.includes(0) ? 0 : b[0]; }

if (!isMainThread) {
  const m = NTRANS.create(); viewModel(m, workerData.wBuf, workerData.gBuf);
  const R = L.rng(workerData.seed);
  parentPort.on('message', msg => {
    let loss = 0, n = 0;
    while (n < msg.n) {
      const pairs = augment(taskPairs(R, 'train'), R), bg = bgOf(pairs);
      for (let rot = 0; rot < 2 && n < msg.n; rot++) {
        const j = Math.floor(R() * pairs.length), ctxPairs = pairs.filter((_, k) => k !== j);
        const enc = NTRANS.encode(m, ctxPairs, bg), dec = NTRANS.decode(m, enc, pairs[j][0], bg);
        loss += NTRANS.lossBack(m, enc, dec, pairs[j][1]); n++;
      }
    }
    parentPort.postMessage({ loss, n });
  });
} else {
  const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
  const total = +arg('examples', 200000), batch = +arg('batch', 32), nw = +arg('workers', 4), lr0 = +arg('lr', 0.001), seed = +arg('seed', 2);
  NN.setSeed(seed);
  const m = NTRANS.create();
  let N = 0; m.list.forEach(P => { N += P.n; });
  const wBuf = new SharedArrayBuffer(N * 4), init = m.list.map(P => P.w.slice());
  viewModel(m, wBuf, null); m.list.forEach((P, i) => P.w.set(init[i]));
  const gBufs = [], workers = [];
  for (let k = 0; k < nw; k++) { gBufs.push(new SharedArrayBuffer(N * 4)); workers.push(new Worker(__filename, { workerData: { wBuf, gBuf: gBufs[k], seed: seed * 1000 + k + 1 } })); }
  const gViews = gBufs.map(b => new Float32Array(b));
  const VR = L.rng(seed * 7919 + 23), val = [];
  while (val.length < 300) val.push(taskPairs(VR, 'test'));
  function validate() {
    let exact = 0, gated = 0, gatedOk = 0;
    for (const pairs of val) {
      const bg = bgOf(pairs), ctxPairs = pairs.slice(0, 3), q = pairs[3];
      if (G.gEq(NTRANS.predictGrid(NTRANS.decode(m, NTRANS.encode(m, ctxPairs, bg), q[0], bg)), q[1])) exact++;
      const ctx = new E.Ctx(ctxPairs, [q[0]], null), f = NTRANS.solve(m, ctx);
      if (f) { gated++; if (G.gEq(f(q[0]), q[1])) gatedOk++; }
    }
    return { exact: +(exact / val.length).toFixed(3), gate_coverage: +(gated / val.length).toFixed(3), gate_precision: gated ? +(gatedOk / gated).toFixed(3) : null };
  }
  const steps = Math.ceil(total / batch), log = [];
  let t = 0, seen = 0, lossAcc = 0, nAcc = 0; const t0 = Date.now();
  const once = (w, n) => new Promise(res => { w.once('message', res); w.postMessage({ n }); });
  (async () => {
    console.log('params', N, 'val@0', JSON.stringify(validate()));
    for (let s = 0; s < steps; s++) {
      const rs = await Promise.all(workers.map(w => once(w, Math.ceil(batch / nw))));
      let n = 0; rs.forEach(r => { n += r.n; lossAcc += r.loss; nAcc += r.n; });
      let off = 0;
      m.list.forEach(P => { for (let i = 0; i < P.n; i++) { let g = 0; for (let k = 0; k < nw; k++) { g += gViews[k][off + i]; gViews[k][off + i] = 0; } P.g[i] = g / n; } off += P.n; });
      t++; seen += n;
      NN.adam(m.list, lr0 * Math.min(1, t / 200) * (0.5 * (1 + Math.cos(Math.PI * s / steps)) * 0.9 + 0.1), t);
      if (s % 500 === 0 || s === steps - 1) {
        const rec = { step: s, seen, loss: +(lossAcc / nAcc).toFixed(4), val: validate(), sec: Math.round((Date.now() - t0) / 1000) };
        log.push(rec); lossAcc = 0; nAcc = 0; console.log(JSON.stringify(rec));
      }
    }
    workers.forEach(w => w.terminate());
    const W = NTRANS.dump(m);
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ ...W, log, examples: seen, seed }));
    if (args.includes('--write')) {
      fs.writeFileSync(path.join(__dirname, '..', 'c4-arc', 'src', '74a-ntrans-weights.js'),
        '/* ===== src/74a-ntrans-weights.js ===== */\n/* GENERATED by tools/arc-ntrans-train.js --write (synthetic tasks only). */\nvar NTRANS_WEIGHTS = ' + JSON.stringify(W) + ';\n');
      console.log('wrote c4-arc/src/74a-ntrans-weights.js');
    }
  })();
}
