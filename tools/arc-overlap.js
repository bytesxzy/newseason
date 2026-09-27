/* Branch overlap matrix from a bench run: which branches produced the
 * correct output of each task (correct_families, as recorded by
 * c4-arc/bench.js after the prediction was committed).
 *
 *   node tools/arc-overlap.js RUN_DIR [--out FILE]
 *
 * Branches: legacy (every family of the pre-concept portfolio), sketch
 * (sketch / extract / encode), transduce (69, rule-table transducer),
 * egpolicy (73, execution-guided synthesis), ntrans (74, neural transduction).
 * For every pair: |A|, |B|, |A n B|, |A u B|, Jaccard, and conditional gains
 * |B \ A| and |A \ B|. A branch that solves exactly what another solves has
 * no ensemble value, whatever its own score.
 */
'use strict';
const fs = require('fs'), path = require('path');
const dir = process.argv[2], outI = process.argv.indexOf('--out');
const BR = f => f === 'sketch' ? 'sketch' : f === 'transduce' ? 'transduce' : f === 'egpolicy' ? 'egpolicy' : f === 'ntrans' ? 'ntrans' : 'legacy';
const sets = {};
for (const f of fs.readdirSync(dir)) {
  if (!/^arc1[a-z]*_[0-9a-f]+\.json$/.test(f)) continue;
  const r = JSON.parse(fs.readFileSync(path.join(dir, f)));
  if (!r.oracle_retained) continue;
  /* a branch counts for a task when it produced the correct output of EVERY test input */
  const per = (r.correct_families || []).map(fs2 => new Set(fs2.map(x => BR(String(x).split('@')[0]))));
  const all = per.length ? [...per[0]].filter(b => per.every(s => s.has(b))) : [];
  all.forEach(b => { (sets[b] = sets[b] || new Set()).add(r.task_id); });
}
const names = Object.keys(sets).sort(), rows = [];
console.log('branch sizes:', names.map(n => n + ' ' + sets[n].size).join(', '));
console.log('A'.padEnd(10), 'B'.padEnd(10), '|A|', '|B|', 'AnB', 'AuB', 'Jaccard', 'B\\A', 'A\\B');
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const A = sets[names[i]], B = sets[names[j]], I = [...A].filter(x => B.has(x)).length, U = new Set([...A, ...B]).size;
  const row = { A: names[i], B: names[j], a: A.size, b: B.size, inter: I, union: U, jaccard: +(I / U).toFixed(3), b_minus_a: B.size - I, a_minus_b: A.size - I };
  rows.push(row);
  console.log(row.A.padEnd(10), row.B.padEnd(10), row.a, row.b, row.inter, row.union, row.jaccard, row.b_minus_a, row.a_minus_b);
}
const union = new Set(names.flatMap(n => [...sets[n]])).size;
console.log('union of all branches', union);
if (outI > 0) fs.writeFileSync(process.argv[outI + 1], JSON.stringify({ sizes: Object.fromEntries(names.map(n => [n, sets[n].size])), pairs: rows, union }, null, 1));
