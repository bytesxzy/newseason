/* Execution-guided synthesis ALONE on an ARC split, compared per task with a
 * stored bench run of the full engine.
 *
 *   node tools/arc-egs-arc.js --full W.json [--mode full|template|bigram|uniform]
 *        [--ms 1000] [--exec N] [--corpus c4-arc-tasks.js] [--prefix arc1_]
 *        [--against results/final/dev-final] [--out FILE] [--jobs 3]
 *
 * Reports demo-exact programs found, top-1 correct (first program found),
 * any-correct, and the tasks it solves that the stored engine run did NOT
 * solve at top-1 (new-only), which is the number that matters for the
 * portfolio. Test outputs are compared only after the search returns.
 * Use on the development split freely; on the evaluation split only for the
 * frozen final measurement.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const root = path.join(__dirname, '..');
if (!isMainThread) {
  const E = require(path.join(root, 'c4-arc-engine.js'));
  const o = workerData;
  let model = null, bigram = null;
  if (o.mode === 'full' || o.mode === 'template') { model = E.POLICY.create(o.mode); if (!E.POLICY.load(model, JSON.parse(fs.readFileSync(o.weights)))) throw new Error('weights'); }
  if (o.mode === 'bigram') bigram = JSON.parse(fs.readFileSync(o.bigram)).tab;
  parentPort.on('message', t => {
    const ctx = new E.Ctx(t.train, t.test.map(p => p[0]), null), st = {}, t0 = Date.now();
    let sols = [];
    try { sols = E.EGS.search(ctx, Date.now() + o.ms, { mode: o.mode, model, bigram, maxDepth: 4, maxSolutions: 3, maxExecutions: o.exec || Infinity, stats: st }); } catch (e) { sols = []; }
    const ok = p => t.test.every(([x, y]) => { const r = E.EGS.run(p, x, p.bg); return r && E.G.gEq(r, y); });
    parentPort.postMessage({ id: t.id, found: sols.length > 0, top1: sols.length > 0 && ok(sols[0]), any: sols.some(ok), prog: sols.length ? E.EGS.progKey(sols[0]) : null,
      ms: Date.now() - t0, expanded: st.expanded, executed: st.executed });
  });
} else {
  const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
  const prefix = arg('prefix', 'arc1_');
  const grid = s => s.split('|').map(r => [...r].map(Number));
  const pairs = s => s.split(';').map(p => { const [x, y] = p.split('>'); return [grid(x), grid(y)]; });
  const tasks = require(path.join(root, arg('corpus', 'c4-arc-tasks.js'))).filter(t => t[0].startsWith(prefix)).map(t => ({ id: t[0], train: pairs(t[1]), test: pairs(t[2]) }));
  const against = arg('against');
  const engineTop1 = new Set();
  if (against) for (const f of fs.readdirSync(against)) { const m = /^(arc1[a-z]*_[0-9a-f]+)\.json$/.exec(f); if (m && JSON.parse(fs.readFileSync(path.join(against, f))).solved_top1) engineTop1.add(m[1]); }
  const wd = { mode: arg('mode', 'full'), weights: arg('full'), bigram: arg('bigram'), ms: +arg('ms', 1000), exec: arg('exec') ? +arg('exec') : null };
  const nj = +arg('jobs', 3), res = [];
  let next = 0;
  const done = new Promise(resolve => {
    let alive = nj;
    for (let k = 0; k < nj; k++) {
      const w = new Worker(__filename, { workerData: wd });
      const feed = () => { if (next < tasks.length) w.postMessage(tasks[next++]); else { w.terminate(); if (--alive === 0) resolve(); } };
      w.on('message', r => { res.push(r); feed(); });
      feed();
    }
  });
  done.then(() => {
    const s = { tasks: res.length, found: 0, top1: 0, any: 0, new_only_top1: [], new_only_any: [], ms: 0 };
    res.forEach(r => { s.found += r.found; s.top1 += r.top1; s.any += r.any; s.ms += r.ms;
      if (r.top1 && !engineTop1.has(r.id)) s.new_only_top1.push(r.id + ' ' + r.prog);
      if (r.any && !engineTop1.has(r.id)) s.new_only_any.push(r.id); });
    s.ms = Math.round(s.ms / res.length);
    console.log(JSON.stringify({ mode: wd.mode, ms_budget: wd.ms, tasks: s.tasks, found: s.found, top1: s.top1, any: s.any, new_only_top1: s.new_only_top1.length, new_only_any: s.new_only_any.length, mean_ms: s.ms }));
    s.new_only_top1.forEach(x => console.log('  new:', x));
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ config: wd, summary: s, per_task: res }, null, 1));
  });
}
