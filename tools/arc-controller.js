/* Train the search controller from hindsight-relabelled tasks.
 *
 *   node tools/arc-controller.js [--n 600] [--seed 5] [--traj 100] [--exclude fam,...]
 *                                [--write] [--out FILE]
 *
 * Training tasks come from two sources, both built on the FIRST HALF of the
 * development corpus's inputs (the second half is kept for held-out
 * synthetic tests, tools/arc-synth-gen.js --split heldout):
 *   dream      programs sampled from the grammar at depth 1-3 and executed
 *              on real inputs (tools/arc-dream-lib.js)
 *   hindsight  candidates the search actually executed on real development
 *              tasks and REJECTED, re-run on that task's inputs: each is the
 *              correct program of the task it produces (search creates its
 *              own training data; failed trajectories are not discarded)
 * One logistic model per label (segmentation, operator family, object-rule
 * kind) over CONTROL.features. --exclude drops every training task that uses
 * one of the named families (leave-family-out). --write regenerates
 * c4-arc/src/67a-controller-weights.js. No ARC output grid is read.
 */
'use strict';
const fs = require('fs'), path = require('path');
const D = require('./arc-dream-lib.js'), E = D.E;
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const nPer = +arg('n', 600), seed = +arg('seed', 5), nTraj = +arg('traj', 100);
const exclude = arg('exclude') ? arg('exclude').split(',') : null;
const corpusFile = path.join(__dirname, '..', 'c4-arc-tasks.js');
const all = D.inputGroups(corpusFile, 'arc1_');
const groups = all.slice(0, Math.floor(all.length / 2));

function sampleOf(task, prog, src) {
  const ctx = new E.Ctx(task.train, task.test.map(p => p[0]), null);
  return { x: E.CONTROL.vec(E.CONTROL.features(ctx)), y: E.CONTROL.labels(prog), fam: D.families(prog), src };
}

const data = [];
/* 1. dreamed tasks */
for (const depth of [1, 2, 3]) {
  const tasks = D.suite({ groups, n: nPer, depth, seed: seed * 10 + depth, exclude });
  tasks.forEach(t => data.push(sampleOf(t, t.prog, 'dream')));
}
const nDream = data.length;
/* 2. hindsight from real search trajectories (rejected candidates) */
const T = require(corpusFile);
const grid = s => s.split('|').map(r => [...r].map(Number));
const pairs = s => s.split(';').map(p => { const [x, y] = p.split('>'); return [grid(x), grid(y)]; });
const halfIds = new Set(groups.map(g => g.id));
let used = 0;
for (const row of T) {
  if (used >= nTraj || !halfIds.has(row[0])) continue;
  const tr = pairs(row[1]);
  if (!tr.every(([x, y]) => x.length === y.length && x[0].length === y[0].length)) continue;
  used++;
  const inputs = tr.map(p => p[0]).concat(pairs(row[2]).map(p => p[0]));
  const ctx = new E.Ctx(tr, [], null);
  const rec = [];
  try { E.SKETCH.synthesize(ctx, Date.now() + 3000, { mode: 'pure', maxExec: 96, record: rec, keepProgs: true }); } catch (e) { continue; }
  let k = 0;
  for (const r of rec) {
    if (!r.prog || r.exact || k >= 12) continue;
    const t = D.makeTask(r.prog, { id: row[0], inputs }, D.bgOf);
    if (!t) continue;
    const fams = D.families(r.prog);
    if (exclude && fams.some(f => exclude.includes(f))) continue;
    data.push(sampleOf(t, r.prog, 'hindsight'));
    k++;
  }
}
/* 3. --solved: components of the demonstration-exact programs the search
   found on first-half real tasks (what SOLVES, not what was tried) */
let nSolved = 0;
if (args.includes('--solved')) {
  for (const row of T) {
    if (!halfIds.has(row[0])) continue;
    const tr = pairs(row[1]);
    if (!tr.every(([x, y]) => x.length === y.length && x[0].length === y[0].length)) continue;
    const ctx = new E.Ctx(tr, pairs(row[2]).map(p => p[0]), null);
    let progs = [];
    try { progs = E.SKETCH.synthesize(ctx, Date.now() + 3000, { controller: false }); } catch (e) { continue; }
    if (!progs.length) continue;
    progs.sort((a, b) => E.EMDL.cost(a) - E.EMDL.cost(b));
    const x = E.CONTROL.vec(E.CONTROL.features(ctx));
    for (let k = 0; k < 3; k++) data.push({ x, y: E.CONTROL.labels(progs[0]), fam: D.families(progs[0]), src: 'solved' });
    nSolved++;
  }
}
console.log(`training tasks: ${data.length} (dream ${nDream}, hindsight ${data.length - nDream - 3 * nSolved} from ${used} real search trajectories, solved ${nSolved} x3)`);

/* one-vs-rest logistic regression per label */
const counts = {};
data.forEach(d => d.y.forEach(l => { counts[l] = (counts[l] || 0) + 1; }));
const labels = Object.keys(counts).filter(l => counts[l] >= 15).sort();
const R = D.rng(seed);
const order = data.map((_, i) => i);
const split = Math.floor(data.length * 0.8);
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
const trainIdx = order.slice(0, split), valIdx = order.slice(split);
const nf = E.CONTROL.FEATURES.length, W = {}, base = {};
for (const lab of labels) {
  const w = new Array(nf).fill(0);
  const pos = counts[lab] / data.length;
  base[lab] = +pos.toFixed(4);
  w[0] = Math.log(pos / (1 - pos));
  for (let ep = 0; ep < 40; ep++) {
    const lr = 0.3 / (1 + ep * 0.2);
    for (const i of trainIdx) {
      const d = data[i], yv = d.y.includes(lab) ? 1 : 0;
      let z = 0; for (let k = 0; k < nf; k++) z += w[k] * d.x[k];
      const g = 1 / (1 + Math.exp(-z)) - yv;
      for (let k = 0; k < nf; k++) w[k] -= lr * (g * d.x[k] + 1e-3 * w[k]);
    }
  }
  W[lab] = w.map(v => +v.toFixed(4));
}
/* validation: rank of true labels within each group (1 = best) */
function evalRank(idx) {
  const groupsOf = { seg: labels.filter(l => l.startsWith('seg:')), fam: labels.filter(l => l.startsWith('fam:') || l.startsWith('obj:')) };
  const res = {};
  for (const g of Object.keys(groupsOf)) {
    let sum = 0, n = 0, top1 = 0;
    for (const i of idx) {
      const d = data[i];
      const scores = groupsOf[g].map(l => { let z = 0; for (let k = 0; k < nf; k++) z += W[l][k] * d.x[k]; return [l, z - Math.log(base[l] / (1 - base[l]))]; }).sort((a, b) => b[1] - a[1]);
      d.y.filter(l => groupsOf[g].includes(l)).forEach(l => { const r = scores.findIndex(s => s[0] === l) + 1; sum += r; n++; if (r === 1) top1++; });
    }
    res[g] = { mean_rank: n ? +(sum / n).toFixed(2) : null, top1: n ? +(top1 / n).toFixed(3) : null, of: groupsOf[g].length };
  }
  return res;
}
const report = { training_tasks: data.length, dream: nDream, hindsight: data.length - nDream, real_trajectories: used,
                 labels: labels.length, exclude, validation: evalRank(valIdx), train_fit: evalRank(trainIdx) };
console.log(JSON.stringify(report));
if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(report, null, 2));
if (args.includes('--write')) {
  const body = '/* ===== src/67a-controller-weights.js ===== */\n/* GENERATED by tools/arc-controller.js from hindsight-relabelled synthetic\n * tasks (dreamed programs and rejected search candidates, re-run on\n * development-corpus inputs). Do not edit by hand. ' + JSON.stringify({ data: data.length, dream: nDream, hindsight: data.length - nDream, seed, exclude }) + ' */\nvar CONTROL_WEIGHTS = ' + JSON.stringify({ features: E.CONTROL.FEATURES, labels: W, base, scale: +arg('scale', 0.6) }) + ';\n';
  fs.writeFileSync(path.join(__dirname, '..', 'c4-arc', 'src', '67a-controller-weights.js'), body);
  console.log('wrote c4-arc/src/67a-controller-weights.js');
}
