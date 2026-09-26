/* Leave-family-out: does composition of the remaining concepts recover a
 * held-out concept family?
 *
 *   node tools/arc-lfo.js [--n 30] [--families ray,halo,...] [--seed 3] [--ms 1500] [--out FILE]
 *
 * For each generative family F: tasks REQUIRING F are dreamed on held-out
 * inputs (second half of the development corpus; tools/arc-dream-lib.js),
 * then solved (a) with the full grammar and (b) with every operator of F
 * removed from the search. Top-1 correctness on the dreamed test pair is
 * reported for both: (b) > 0 means other concepts compose into F's
 * behaviour on those tasks. No ARC output is read.
 */
'use strict';
const fs = require('fs'), path = require('path');
const D = require('./arc-dream-lib.js'), E = D.E;
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const n = +arg('n', 30), seed = +arg('seed', 3), ms = +arg('ms', 1500);
const fams = arg('families', 'halo,fill,ray,raycorner,link,symm,stamp,repeat,bar').split(',');
const all = D.inputGroups(path.join(__dirname, '..', 'c4-arc-tasks.js'), 'arc1_');
const groups = all.slice(Math.floor(all.length / 2));
const ALL_OPS = E.GEN.OPS.slice();
function solveTop1(t) {
  const ctx = new E.Ctx(t.train, t.test.map(p => p[0]), null);
  let progs = [];
  try { progs = E.SKETCH.synthesize(ctx, Date.now() + ms, {}); } catch (e) { progs = []; }
  if (!progs.length) return false;
  progs.sort((a, b) => E.EMDL.cost(a) - E.EMDL.cost(b));
  return t.test.every(([x, y]) => { const o = E.SKETCH.run(progs[0], x); return o && E.G.gEq(o, y); });
}
const report = { n, seed, split: 'heldout', families: {} };
for (const F of fams) {
  const tasks = D.suite({ groups, n, depth: 1, seed: seed * 1000 + fams.indexOf(F), families: [F], require: [F] });
  let full = 0, without = 0;
  for (const t of tasks) if (solveTop1(t)) full++;
  /* remove the family's operators (restored afterwards) */
  const kept = ALL_OPS.filter(o => E.SKETCH.opFamily(o) !== F);
  E.GEN.OPS.length = 0; kept.forEach(o => E.GEN.OPS.push(o));
  E.SCN.reset();
  for (const t of tasks) if (solveTop1(t)) without++;
  E.GEN.OPS.length = 0; ALL_OPS.forEach(o => E.GEN.OPS.push(o));
  E.SCN.reset();
  report.families[F] = { tasks: tasks.length, full_top1: full, without_family_top1: without };
  console.log(`${F}: ${tasks.length} tasks, full ${full}, without ${F} ${without}`);
}
if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(report, null, 2));
