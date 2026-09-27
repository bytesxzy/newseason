'use strict';
/* Tests of the execution-guided synthesis stack (70-73): numerical gradient
 * checks of the hand-written backward passes, and search sanity. */
const E = require('../c4-arc-engine.js');
const { NN, POLICY, STEPS, EGS } = E;
let pass = 0;
function ok(name, cond, info) { if (!cond) { console.log('FAIL', name, info || ''); process.exitCode = 1; } else { pass++; console.log('PASS', name, info || ''); } }
let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

/* 1. convolution backward vs finite differences (dilation 2) */
(function () {
  NN.setSeed(3);
  const cin = 3, cout = 4, H = 5, W = 6, dil = 2, P = NN.param(cout * cin * 9, cin * 9), B = NN.param(cout, 1);
  const x = Float32Array.from({ length: cin * H * W }, () => rnd() - 0.5), r = Float32Array.from({ length: cout * H * W }, () => rnd() - 0.5);
  const L = () => { const y = NN.conv(P, B, x, cin, H, W, cout, dil); let t = 0; for (let i = 0; i < y.length; i++) t += y[i] * r[i]; return t; };
  const dx = NN.convBack(P, B, x, cin, H, W, cout, dil, r, true);
  let worst = 0;
  for (const i of [0, 5, 17, 40, 88, P.n - 1]) { const o = P.w[i]; P.w[i] = o + 1e-2; const a = L(); P.w[i] = o - 1e-2; const b = L(); P.w[i] = o; worst = Math.max(worst, Math.abs((a - b) / 2e-2 - P.g[i])); }
  for (const i of [0, 7, 33, 61, x.length - 1]) { const o = x[i]; x[i] = o + 1e-2; const a = L(); x[i] = o - 1e-2; const b = L(); x[i] = o; worst = Math.max(worst, Math.abs((a - b) / 2e-2 - dx[i])); }
  ok('conv backward matches finite differences', worst < 1e-2, 'max abs err ' + worst.toExponential(2));
})();

/* 2. the whole policy: loss gradient of every parameter tensor */
(function () {
  NN.setSeed(11);
  const m = POLICY.create('full');
  const g = (h, w) => Array.from({ length: h }, () => Array.from({ length: w }, () => (rnd() < 0.6 ? 0 : 1 + Math.floor(rnd() * 4))));
  const demos = [0, 1, 2].map(() => { const x = g(4, 5); return { x, S: g(4, 5), y: g(4, 5) }; });
  demos[1].y = g(3, 5); /* one demonstration with a size mismatch */
  const ex = { bg: 0, demos }, lab = { type: STEPS.BY.fill_c.id, color: 2 };
  const L = () => { const fw = POLICY.forward(m, ex, true); const p = NN.softmax(fw.logits); let l = -Math.log(p[lab.type]);
    const jj = POLICY.CT[lab.type], cand = []; fw.col.forEach((e, c) => { if (e) cand.push(c); });
    const pc = NN.softmax(Float32Array.from(cand.map(c => fw.col[c].s[jj]))); return l - Math.log(pc[cand.indexOf(lab.color)]); };
  /* zero-initialised biases put pre-activations exactly on ReLU kinks, where
     a finite difference is one-sided; move them off the kinks first */
  m.order.forEach(name => { if (m.p[name].n <= 128) m.p[name].w.forEach((_, i, w) => { w[i] = 0.05 * (rnd() - 0.3); }); });
  m.list.forEach(P => P.g.fill(0));
  const fw = POLICY.forward(m, ex, true); POLICY.lossBack(m, ex, fw, lab);
  let worst = 0, where = '';
  m.order.forEach(name => {
    const P = m.p[name];
    for (let k = 0; k < 4; k++) {
      const i = Math.floor(rnd() * P.n), o = P.w[i], h = 1e-3;
      P.w[i] = o + h; const a = L(); P.w[i] = o - h; const b = L(); P.w[i] = o;
      const num = (a - b) / (2 * h), err = Math.abs(num - P.g[i]) / Math.max(1e-3, Math.abs(num) + Math.abs(P.g[i]));
      if (Math.abs(num - P.g[i]) > 2e-3 && err > worst) { worst = err; where = name + '[' + i + '] num ' + num.toFixed(5) + ' ana ' + P.g[i].toFixed(5); }
    }
  });
  ok('policy backward matches finite differences for all tensors', worst < 0.05, worst ? 'worst rel err ' + worst.toFixed(3) + ' at ' + where : 'all within 2e-3');
})();

/* 2b. neural transduction: loss gradient of every parameter tensor */
(function () {
  NN.setSeed(5);
  const NT = E.NTRANS, m = NT.create();
  m.order.forEach(name => { if (m.p[name].n <= 128) m.p[name].w.forEach((_, i, w) => { w[i] = 0.05 * (rnd() - 0.3); }); });
  const g = (h, w) => Array.from({ length: h }, () => Array.from({ length: w }, () => (rnd() < 0.6 ? 0 : 1 + Math.floor(rnd() * 4))));
  const pairs = [[g(4, 5), g(4, 5)], [g(3, 4), g(3, 4)]], x = g(4, 4), y = g(4, 4);
  const L = () => { const enc = NT.encode(m, pairs, 0), dec = NT.decode(m, enc, x, 0); let l = 0; const HW = 16;
    for (let i = 0; i < HW; i++) { const lg = new Float32Array(10); for (let k = 0; k < 10; k++) lg[k] = dec.logits[k * HW + i]; l -= Math.log(NN.softmax(lg)[y[(i / 4) | 0][i % 4]]); } return l / HW; };
  m.list.forEach(P => P.g.fill(0));
  const enc = NT.encode(m, pairs, 0), dec = NT.decode(m, enc, x, 0); NT.lossBack(m, enc, dec, y);
  let worst = 0, where = '';
  m.order.forEach(name => {
    const P = m.p[name];
    for (let k = 0; k < 4; k++) {
      /* a ReLU kink within h makes one finite difference one-sided: take the
         step size that agrees best */
      const i = Math.floor(rnd() * P.n), o = P.w[i];
      const num = [1e-2, 1e-3, 1e-4].map(h => { P.w[i] = o + h; const a = L(); P.w[i] = o - h; const b = L(); P.w[i] = o; return (a - b) / (2 * h); })
        .sort((u, v) => Math.abs(u - P.g[i]) - Math.abs(v - P.g[i]))[0];
      const err = Math.abs(num - P.g[i]) / Math.max(1e-3, Math.abs(num) + Math.abs(P.g[i]));
      if (Math.abs(num - P.g[i]) > 2e-4 && err > worst) { worst = err; where = name + '[' + i + '] num ' + num.toFixed(6) + ' ana ' + P.g[i].toFixed(6); }
    }
  });
  ok('neural transduction backward matches finite differences', worst < 0.05, worst ? 'worst rel err ' + worst.toFixed(3) + ' at ' + where : 'all within 2e-4');
})();

/* 3. search: y = flipH(crop(x)) is found by uniform enumeration at depth 2 */
(function () {
  const pair = (x) => [x, E.G.flipH(E.G.cropToContent(x, 0))];
  const tr = [pair([[0, 0, 0, 0], [0, 1, 2, 0], [0, 3, 0, 0]]), pair([[0, 0, 0], [5, 5, 0], [0, 6, 0], [0, 0, 0]]), pair([[0, 0, 0, 0, 0], [0, 0, 7, 8, 9], [0, 0, 0, 0, 1]])];
  const test = pair([[0, 0, 0], [0, 4, 3], [0, 2, 0]]);
  const ctx = new E.Ctx(tr, [test[0]], null), st = {};
  const sols = EGS.search(ctx, Date.now() + 3000, { mode: 'uniform', maxDepth: 2, stats: st });
  ok('uniform search finds a depth-2 step program', sols.length > 0 && E.G.gEq(EGS.run(sols[0], test[0], 0), test[1]), sols.length ? EGS.progKey(sols[0]) + ', expanded ' + st.expanded : 'none');
})();
console.log(`${pass} policy tests passed`);
