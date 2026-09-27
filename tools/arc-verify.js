/* Independent re-scoring of stored bench runs against the OFFICIAL ARC task
 * files (github.com/fchollet/ARC-AGI data/<split>/*.json), not against the
 * packed corpus and not with bench.js's scoring code.
 *
 *   node tools/arc-verify.js OFFICIAL_DIR PREFIX RUN_DIR...
 *   e.g. node tools/arc-verify.js ARC-AGI/data/evaluation arc1eval_ results/final/eval-final
 *
 * Reads only <PREFIX><id>.prediction.json, which the bench writes BEFORE it
 * compares anything with an answer. Per run: tasks, top-1 (first prediction
 * right on every test output), top-2, retained (right output anywhere in the
 * ranked list), generated (retained, or its key among the engine's generation
 * keys), and the official per-output two-attempt score (each test output
 * counts 1/#outputs of its task).
 */
'use strict';
const fs = require('fs'), path = require('path');
const [official, prefix, ...runs] = process.argv.slice(2);
const key = g => g.map(r => r.join(',')).join(';');
const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((r, i) => r.length === b[i].length && r.every((v, j) => v === b[i][j]));
const tasks = fs.readdirSync(official).filter(f => f.endsWith('.json')).sort()
  .map(f => ({ id: f.slice(0, -5), test: JSON.parse(fs.readFileSync(path.join(official, f))).test }));
const out = {};
for (const run of runs) {
  const s = { tasks: tasks.length, missing: 0, top1: 0, top2: 0, retained: 0, generated: 0, official_pass2: 0, test_outputs: 0 };
  for (const t of tasks) {
    const f = path.join(run, prefix + t.id + '.prediction.json');
    if (!fs.existsSync(f)) { s.missing++; continue; }
    const r = JSON.parse(fs.readFileSync(f)).result || { predictions: [] };
    const rank = t.test.map((p, i) => ((r.predictions || [])[i] || []).findIndex(g => same(g, p.output)) + 1);
    const gen = t.test.every((p, i) => rank[i] > 0 || ((r.gen_keys || [])[i] || []).includes(key(p.output)));
    if (rank.every(n => n === 1)) s.top1++;
    if (rank.every(n => n > 0 && n <= 2)) s.top2++;
    if (rank.every(n => n > 0)) s.retained++;
    if (gen) s.generated++;
    s.official_pass2 += rank.filter(n => n > 0 && n <= 2).length / t.test.length;
    s.test_outputs += t.test.length;
  }
  s.official_pass2 = +s.official_pass2.toFixed(2);
  out[path.basename(run)] = s;
  console.log(path.basename(run).padEnd(36), JSON.stringify(s));
}
if (process.env.VERIFY_OUT) fs.writeFileSync(process.env.VERIFY_OUT, JSON.stringify(out, null, 1));
