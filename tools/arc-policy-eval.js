/* Out-of-distribution evaluation of execution-guided synthesis on the frozen
 * synthetic splits (c4-arc-steps-ood.js), and the bigram baseline.
 *
 *   node tools/arc-policy-eval.js --bigram-build results/policy/bigram.json
 *   node tools/arc-policy-eval.js [--variants full,template,bigram,uniform] [--exec 300,1500]
 *        [--full W.json] [--template W.json] [--bigram B.json] [--splits ...] [--limit N]
 *        [--tasks c4-arc-steps-ood.js] [--out FILE]
 *
 * Every variant runs the SAME search (c4-arc/src/73-egsearch.js) with the
 * same execution budget; only the proposal distribution differs:
 *   full      policy on the EXECUTED state      (transform space)
 *   template  policy on input + steps so far    (program space)
 *   bigram    P(step | previous step)           (program-template statistics)
 *   uniform   all steps equally likely          (blind enumeration)
 *   fullttt   full, with task-time adaptation: 40% of the budget searched,
 *             the heads fine-tuned on hindsight-relabelled paths of that
 *             search, the remaining 60% searched with the adapted clone
 * Top-1 = the first program found reproduces the held-out query; any = some
 * program found does. Demonstration outputs are the only targets the search
 * sees; query outputs are read after the search, to score.
 */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('../c4-arc-engine.js');
const { EGS, POLICY, STEPS } = E;
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
if (arg('bigram-build')) {
  const L = require('./arc-steps-lib.js'), R = L.rng(777), K = STEPS.N;
  const cnt = Array.from({ length: K + 1 }, () => new Float64Array(K).fill(0.5));
  for (let i = 0; i < +arg('n', 20000);) {
    const t = L.sampleTrainingTask(R); if (!t) continue; i++;
    let prev = K;
    t.rule.steps.forEach(s => { cnt[prev][s[0]]++; prev = s[0]; });
    if (t.rule.fin && t.rule.fin.kind === 'sketch') cnt[prev][STEPS.FIN_SKETCH]++;
  }
  const tab = cnt.map(row => { const s = row.reduce((a, b) => a + b, 0); return Array.from(row, v => +(v / s).toFixed(6)); });
  fs.writeFileSync(arg('bigram-build'), JSON.stringify({ names: STEPS.NAMES.join(','), tab }));
  console.log('bigram table written');
  process.exit(0);
}
const { Worker, isMainThread, parentPort } = require('worker_threads');
const grid = s => s.split('|').map(r => [...r].map(Number));
const pairs = s => s.split(';').map(p => { const [x, y] = p.split('>'); return [grid(x), grid(y)]; });
let tasks = require(path.resolve(arg('tasks', path.join(__dirname, '..', 'c4-arc-steps-ood.js'))))
  .map(t => ({ id: t[0], train: pairs(t[1]), test: pairs(t[2]), meta: t[3] }));
if (arg('splits')) { const s = new Set(arg('splits').split(',')); tasks = tasks.filter(t => s.has(t.meta.split)); }
if (arg('limit')) { const per = {}; tasks = tasks.filter(t => (per[t.meta.split] = (per[t.meta.split] || 0) + 1) <= +arg('limit')); }
const variants = arg('variants', 'full,template,bigram,uniform').split(','), budgets = arg('exec', '300,1500').split(',').map(Number);
/* one search: the row of one (task, variant, budget) */
function runOne(t, v, B, models, bigram) {
  const ctx = new E.Ctx(t.train, t.test.map(p => p[0]), null), st = {}, t0 = Date.now();
  let sols = [];
  try {
    sols = v === 'fullttt'
      ? EGS.searchTTT(ctx, Date.now() + 30000, { mode: 'full', model: models.full, maxDepth: 4, maxExecutions: B, maxSolutions: 3, stats: st })
      : EGS.search(ctx, Date.now() + 30000, { mode: v, model: models[v], bigram, maxDepth: 4, maxExecutions: B, maxSolutions: 3, stats: st });
  } catch (e) { sols = []; }
  const ok = p => t.test.every(([x, y]) => { const o = EGS.run(p, x, p.bg); return o && E.G.gEq(o, y); });
  return { split: t.meta.split, found: sols.length > 0, top1: sols.length > 0 && ok(sols[0]), any: sols.some(ok),
    first: st.firstSolutionAt, ms: Date.now() - t0, sketch: st.sketchCalls || 0, prog: sols.length ? EGS.progKey(sols[0]) : null };
}
if (!isMainThread) {
  const models = {};
  for (const v of ['full', 'template']) if (variants.includes(v) || (v === 'full' && variants.includes('fullttt'))) {
    const m = POLICY.create(v), W = JSON.parse(fs.readFileSync(arg(v)));
    if (!POLICY.load(m, W)) throw new Error(v + ' weights incompatible');
    models[v] = m;
  }
  const bigram = variants.includes('bigram') ? JSON.parse(fs.readFileSync(arg('bigram'))).tab : null;
  parentPort.on('message', j => parentPort.postMessage({ j, r: runOne(tasks[j.i], j.v, j.B, models, bigram) }));
} else {
  const jobs = [];
  for (const B of budgets) for (const v of variants) tasks.forEach((_, i) => jobs.push({ i, v, B }));
  const rows = [], nj = +arg('jobs', 4);
  let next = 0;
  new Promise(resolve => {
    let alive = nj;
    for (let k = 0; k < nj; k++) {
      const w = new Worker(__filename, { argv: process.argv.slice(2) });
      const feed = () => { if (next < jobs.length) w.postMessage(jobs[next++]); else { w.terminate(); if (--alive === 0) resolve(); } };
      w.on('message', m => { rows.push(m); feed(); });
      feed();
    }
  }).then(() => {
    const out = { budgets: {}, tasks: tasks.length, per_task: rows.map(m => ({ id: tasks[m.j.i].id, v: m.j.v, B: m.j.B, ...m.r })) };
    for (const B of budgets) {
      out.budgets[B] = {};
      for (const v of variants) {
        const per = {};
        rows.filter(m => m.j.B === B && m.j.v === v).forEach(({ r }) => {
          const P = per[r.split] = per[r.split] || { tasks: 0, found: 0, top1: 0, any: 0, firstExp: 0, firstN: 0, ms: 0, sketch: 0 };
          P.tasks++; P.found += r.found; P.top1 += r.top1; P.any += r.any; P.ms += r.ms; P.sketch += r.sketch;
          if (r.first !== null && r.first !== undefined) { P.firstExp += r.first; P.firstN++; }
        });
        for (const s in per) { const P = per[s]; P.firstExp = P.firstN ? +(P.firstExp / P.firstN).toFixed(1) : null; P.ms = Math.round(P.ms / P.tasks); delete P.firstN; }
        out.budgets[B][v] = per;
        console.log(`exec=${B} ${v}: ` + Object.keys(per).sort().map(s => `${s} ${per[s].top1}/${per[s].tasks} (any ${per[s].any}, found ${per[s].found}, ${per[s].ms}ms)`).join(' | '));
      }
    }
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1));
  });
}
