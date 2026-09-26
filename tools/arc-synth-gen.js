/* Synthetic generalisation suites for the entity-program engine.
 *
 *   node tools/arc-synth-gen.js [--n 60] [--depths 1,2,3] [--seed 7] [--ms 1500]
 *                               [--split heldout] [--out FILE]
 *
 * Tasks are dreamed (tools/arc-dream-lib.js): programs sampled from the
 * grammar, executed on development-corpus INPUTS. --split heldout draws the
 * inputs only from the second half of the corpus (sources never used by
 * tools/arc-controller.js, which trains on the first half), so different
 * grids, colours, positions, sizes and object counts than training. Reported
 * per depth and per concept family: tasks with a demonstration-exact
 * program, tasks whose lowest-cost program is correct on the held-out test
 * pair, and executions to the first exact program. A solver strong at depth
 * 1 and weak at depth 3 has a COMPOSITION problem, not a primitive problem.
 */
'use strict';
const fs = require('fs'), path = require('path');
const D = require('./arc-dream-lib.js'), E = D.E;
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const n = +arg('n', 60), depths = arg('depths', '1,2,3').split(',').map(Number), seed = +arg('seed', 7), ms = +arg('ms', 1500);
const all = D.inputGroups(path.join(__dirname, '..', 'c4-arc-tasks.js'), 'arc1_');
const half = Math.floor(all.length / 2);
const groups = arg('split', 'heldout') === 'heldout' ? all.slice(half) : all.slice(0, half);
const mode = arg('mode', 'sls'), maxExec = arg('maxexec') ? +arg('maxexec') : undefined;
const report = { seed, n, split: arg('split', 'heldout'), mode, maxExec: maxExec || null, byDepth: {}, byFamily: {} };
for (const depth of depths) {
  const tasks = D.suite({ groups, n, depth, seed: seed * 100 + depth, families: arg('families') ? arg('families').split(',') : null,
                          exclude: arg('exclude') ? arg('exclude').split(',') : null });
  let exact = 0, top1 = 0, anyc = 0, first = 0, firstN = 0;
  for (const t of tasks) {
    const ctx = new E.Ctx(t.train, t.test.map(p => p[0]), null);
    const rec = [];
    let progs = [];
    try { progs = E.SKETCH.synthesize(ctx, Date.now() + ms, { record: rec, mode, maxExec }); } catch (e) { progs = []; }
    const correct = p => t.test.every(([x, y]) => { const o = E.SKETCH.run(p, x); return o && E.G.gEq(o, y); });
    const ok = progs.length > 0;
    const ranked = progs.slice().sort((a, b) => E.EMDL.cost(a) + Math.min(3, E.EMDL.shift(a, ctx)) - E.EMDL.cost(b) - Math.min(3, E.EMDL.shift(b, ctx)));
    const t1 = ok && correct(ranked[0]);
    if (ok) exact++;
    if (t1) top1++;
    if (ok && progs.some(correct)) anyc++;
    const fr = rec.find(r => r.exact); if (fr) { first += fr.n; firstN++; }
    for (const f of t.families) {
      const b = report.byFamily[f] || (report.byFamily[f] = { n: 0, exact: 0, top1: 0 });
      b.n++; if (ok) b.exact++; if (t1) b.top1++;
    }
  }
  report.byDepth[depth] = { tasks: tasks.length, exact, top1, any_correct: anyc, exec_to_first: firstN ? +(first / firstN).toFixed(1) : null };
  console.log(`depth ${depth}: ${tasks.length} tasks, exact ${exact}, top1 ${top1}, any-correct ${anyc}, exec-to-first ${report.byDepth[depth].exec_to_first}`);
}
console.log(JSON.stringify(report.byFamily));
if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(report, null, 2));
