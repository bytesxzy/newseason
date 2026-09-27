/* Train the transformation policy (c4-arc/src/72-policy.js) on supervised
 * transformation steps from synthetic tasks (tools/arc-steps-lib.js).
 *
 *   node tools/arc-policy-train.js [--mode full|template] [--examples 200000]
 *        [--batch 64] [--workers 4] [--lr 0.001] [--seed 1] [--out FILE] [--write]
 *        [--init FILE] [--alts]
 *
 * Data-parallel: the weights live in shared memory; every worker samples its
 * own stream of training tasks (only programs allowed in training: no
 * held-out adjacency, no held-out fingerprint, depth <= 3), turns every
 * prefix state into (x, S, y) -> next step, applies a random colour
 * permutation (exact: the step language is colour-agnostic except for the
 * colour argument, which is permuted with it), and accumulates gradients;
 * the main thread averages them and takes an Adam step. A fixed validation
 * set of 600 steps from tasks the stream never produces (different seed)
 * reports next-step top-1 / top-5 accuracy. No ARC output grid is read: the
 * 'dev' input generator uses only TRAINING-split input grids.
 * --alts trains with set-valued labels: every step type that produces the
 * same next state on all demonstrations counts as correct.
 * --write regenerates c4-arc/src/72a-policy-weights.js (full mode only).
 */
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path');
const L = require('./arc-steps-lib.js');
const { POLICY, NN, STEPS } = L.E;

function viewModel(m, wBuf, gBuf) {
  let o = 0;
  m.list.forEach(P => { P.w = new Float32Array(wBuf, o * 4, P.n); if (gBuf) P.g = new Float32Array(gBuf, o * 4, P.n); o += P.n; });
  return o;
}
function permuteExample(ex, R) {
  const pi = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 9; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = pi[i]; pi[i] = pi[j]; pi[j] = t; }
  const P = g => g.map(r => r.map(v => pi[v]));
  return { bg: pi[ex.bg], demos: ex.demos.map(d => ({ x: P(d.x), S: P(d.S), y: P(d.y) })), label: { type: ex.label.type, alts: ex.label.alts, color: ex.label.color === undefined ? undefined : pi[ex.label.color] }, prevSteps: ex.prevSteps };
}
function examplesFrom(R, n, alts) {
  const out = [];
  while (out.length < n) { const t = L.sampleTrainingTask(R); if (t) L.stepExamples(t, alts).forEach(e => out.push(e)); }
  return out.slice(0, n);
}

if (!isMainThread) {
  const m = POLICY.create(workerData.mode);
  viewModel(m, workerData.wBuf, workerData.gBuf);
  const R = L.rng(workerData.seed);
  parentPort.on('message', msg => {
    let loss = 0, n = 0;
    for (const e0 of examplesFrom(R, msg.n, workerData.alts)) {
      const e = R() < 0.5 ? permuteExample(e0, R) : e0;
      if (workerData.mode === 'template') e.prev = POLICY.prevVec(e.prevSteps);
      const fw = POLICY.forward(m, e, true);
      loss += POLICY.lossBack(m, e, fw, e.label); n++;
    }
    parentPort.postMessage({ loss, n });
  });
} else {
  const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
  const mode = arg('mode', 'full'), total = +arg('examples', 200000), batch = +arg('batch', 64), nw = +arg('workers', 4), lr0 = +arg('lr', 0.001), seed = +arg('seed', 1);
  NN.setSeed(seed);
  const m = POLICY.create(mode);
  let N = 0; m.list.forEach(P => { N += P.n; });
  const wBuf = new SharedArrayBuffer(N * 4);
  const init = m.list.map(P => P.w.slice());
  viewModel(m, wBuf, null);
  let o = 0; m.list.forEach((P, i) => { P.w.set(init[i]); o += P.n; });
  if (arg('init')) { const W = JSON.parse(fs.readFileSync(arg('init'))); if (!POLICY.load(m, W)) throw new Error('init weights incompatible'); }
  const gBufs = [], workers = [];
  for (let k = 0; k < nw; k++) {
    gBufs.push(new SharedArrayBuffer(N * 4));
    workers.push(new Worker(__filename, { workerData: { mode, wBuf, gBuf: gBufs[k], seed: seed * 1000 + k + 1, alts: args.includes('--alts') } }));
  }
  const gViews = gBufs.map(b => new Float32Array(b));
  /* fixed validation steps (a stream the workers never draw) */
  /* validation labels always carry the equivalent-step sets, so runs with
     and without --alts are scored the same way: strict top-1 (the sampled
     step) and set top-1 (any step producing the same next state) */
  const val = examplesFrom(L.rng(seed * 7919 + 17), 600, true);
  function validate() {
    let t1 = 0, t5 = 0, c1 = 0, cn = 0, s1 = 0;
    for (const e of val) {
      if (mode === 'template') e.prev = POLICY.prevVec(e.prevSteps);
      e.demos.forEach(d => { delete d._ty; });
      const pr = POLICY.predict(m, e), p = pr.p, lab = e.label.type;
      const rank = Array.from(p).filter(v => v > p[lab]).length;
      if (rank === 0) t1++; if (rank < 5) t5++;
      let best = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
      if (best === lab || (e.label.alts || []).includes(best)) s1++;
      if (e.label.color !== undefined && POLICY.CT[lab] !== undefined) { cn++; const cl = pr.colours(lab); if (cl.length && cl[0][0] === e.label.color) c1++; }
    }
    return { top1: +(t1 / val.length).toFixed(3), set_top1: +(s1 / val.length).toFixed(3), top5: +(t5 / val.length).toFixed(3), colour_top1: cn ? +(c1 / cn).toFixed(3) : null };
  }
  const log = [];
  const steps = Math.ceil(total / batch);
  let t = 0, seen = 0, lossAcc = 0, nAcc = 0;
  const t0 = Date.now();
  function once(w, n) { return new Promise(res => { w.once('message', res); w.postMessage({ n }); }); }
  (async () => {
    console.log('params', N, 'mode', mode, 'val@0', JSON.stringify(validate()));
    for (let s = 0; s < steps; s++) {
      const per = Math.ceil(batch / nw);
      const rs = await Promise.all(workers.map(w => once(w, per)));
      let n = 0; rs.forEach(r => { n += r.n; lossAcc += r.loss; nAcc += r.n; });
      /* average worker gradients into the main model and step */
      let off = 0;
      m.list.forEach(P => { for (let i = 0; i < P.n; i++) { let g = 0; for (let k = 0; k < nw; k++) { g += gViews[k][off + i]; gViews[k][off + i] = 0; } P.g[i] = g / n; } off += P.n; });
      t++; seen += n;
      const lr = lr0 * Math.min(1, t / 200) * (0.5 * (1 + Math.cos(Math.PI * Math.min(1, s / steps))) * 0.9 + 0.1);
      NN.adam(m.list, lr, t);
      if (s % 250 === 0 || s === steps - 1) {
        const v = validate(), rec = { step: s, seen, loss: +(lossAcc / nAcc).toFixed(3), val: v, sec: Math.round((Date.now() - t0) / 1000) };
        log.push(rec); lossAcc = 0; nAcc = 0;
        console.log(JSON.stringify(rec));
      }
    }
    workers.forEach(w => w.terminate());
    const W = POLICY.dump(m);
    const out = arg('out');
    if (out) fs.writeFileSync(out, JSON.stringify({ ...W, log, mode, examples: seen, seed }));
    if (args.includes('--write') && mode === 'full') {
      fs.writeFileSync(path.join(__dirname, '..', 'c4-arc', 'src', '72a-policy-weights.js'),
        '/* ===== src/72a-policy-weights.js ===== */\n/* GENERATED by tools/arc-policy-train.js --write. Trained only on synthetic\n * tasks built from the step language (tools/arc-steps-gen.js); no ARC\n * evaluation data. */\nvar POLICY_WEIGHTS = ' + JSON.stringify(W) + ';\n');
      console.log('wrote c4-arc/src/72a-policy-weights.js');
    }
  })();
}
