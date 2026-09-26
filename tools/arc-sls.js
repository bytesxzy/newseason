/* Search-learn-search vs pure search at MATCHED candidate executions.
 *
 *   node tools/arc-sls.js [--n 128,512] [--prefix arc1_] [--limit K] [--out FILE]
 *
 * For every same-shape task of the development corpus (ARC-1 TRAINING split
 * by default) the entity-program search (63-sketch.js / 66-search.js) is run
 * twice per budget N with a generous wall clock, so the EXECUTION COUNT is
 * the binding budget:
 *   pure  N executions pulled by the fixed prior, nothing learned
 *   sls   N/4 search -> learn -> N/4 search -> learn -> N/2 search
 *         (hindsight credit to components + refinement of niche elites)
 * Reported per schedule: tasks with any demonstration-exact program, tasks
 * whose lowest-cost exact program is correct on the test pairs, tasks with a
 * correct program anywhere among the exact ones, and mean executions to the
 * first exact program. Test outputs are read only here, after search.
 */
'use strict';
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
const E = require(path.join(root, 'c4-arc-engine.js'));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const budgets = arg('n', '128,512').split(',').map(Number);
const prefix = arg('prefix', 'arc1_');
const corpus = require(path.join(root, arg('corpus', 'c4-arc-tasks.js')));
const grid = s => s.split('|').map(r => [...r].map(Number));
const pairs = s => s.split(';').map(p => { const [x, y] = p.split('>'); return [grid(x), grid(y)]; });
let tasks = corpus.filter(t => t[0].startsWith(prefix)).map(t => ({ id: t[0], train: pairs(t[1]), test: pairs(t[2]) }))
  .filter(t => t.train.every(([x, y]) => x.length === y.length && x[0].length === y[0].length));
if (arg('limit')) tasks = tasks.slice(0, +arg('limit'));
/* --half 2: only tasks whose inputs the controller never trained on (it
   trains on the first half of the corpus's input groups) */
if (arg('half')) {
  const D = require('./arc-dream-lib.js');
  const all = D.inputGroups(path.join(root, 'c4-arc-tasks.js'), prefix);
  const first = new Set(all.slice(0, Math.floor(all.length / 2)).map(g => g.id));
  tasks = tasks.filter(t => arg('half') === '2' ? !first.has(t.id) : first.has(t.id));
}
const ctlOff = args.includes('--no-controller');
const out = { corpus: prefix, tasks: tasks.length, controller: !ctlOff, half: arg('half') || null, budgets: {} };
for (const N of budgets) {
  const row = {};
  for (const mode of (arg('modes', 'pure,pureref,sls')).split(',')) {
    let anyExact = 0, top1 = 0, anyCorrect = 0, firstSum = 0, firstN = 0, execSum = 0;
    const solvedIds = [];
    for (const t of tasks) {
      const ctx = new E.Ctx(t.train, t.test.map(p => p[0]), null);
      const rec = [], st = {};
      let progs = [];
      try { progs = E.SKETCH.synthesize(ctx, Date.now() + 20000, { mode, maxExec: N, record: rec, stats: st, controller: !ctlOff }); } catch (e) { progs = []; }
      execSum += st.exec || 0;
      if (!progs.length) continue;
      anyExact++;
      const first = rec.find(r => r.exact); if (first) { firstSum += first.n; firstN++; }
      const correct = p => t.test.every(([x, y]) => { const o = E.SKETCH.run(p, x); return o && E.G.gEq(o, y); });
      const ranked = progs.slice().sort((a, b) => E.EMDL.bits(a) - E.EMDL.bits(b));
      if (correct(ranked[0])) { top1++; solvedIds.push(t.id); }
      if (ranked.some(correct)) anyCorrect++;
    }
    row[mode] = { any_exact: anyExact, top1_correct: top1, any_correct: anyCorrect,
                  mean_exec_to_first_exact: firstN ? +(firstSum / firstN).toFixed(1) : null,
                  mean_exec: +(execSum / tasks.length).toFixed(1), solved: solvedIds };
    console.log(`N=${N} ${mode}: exact ${anyExact}, top1-correct ${top1}, any-correct ${anyCorrect}, exec-to-first ${row[mode].mean_exec_to_first_exact}`);
  }
  if (row.pure && row.sls) {
    const a = new Set(row.pure.solved), b = new Set(row.sls.solved);
    row.only_sls = [...b].filter(x => !a.has(x)); row.only_pure = [...a].filter(x => !b.has(x));
  }
  out.budgets[N] = row;
}
if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(out, null, 2));
