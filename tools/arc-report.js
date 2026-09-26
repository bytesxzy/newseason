/* Tables for the concept-engine report from bench result directories.
 *
 *   node tools/arc-report.js BASELINE_DIR FINAL_DIR [--md]
 *
 * Reads the per-task records written by c4-arc/bench.js (answers are compared
 * there; this only aggregates). Reports: summary metrics of both runs;
 * regressions (baseline top-1, final not); unique gains (final top-1,
 * baseline not) with the subsystem that authored the correct output;
 * intersection / union of the old portfolio branch and the new concept
 * branches over tasks whose correct output was retained.
 */
'use strict';
const fs = require('fs'), path = require('path');
const [A, B] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const NEW = new Set(['sketch', 'transduce']);           /* families of the new branches */
function read(dir) {
  const m = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!/^arc1[a-z]*_[0-9a-f]+\.json$/.test(f)) continue;
    const r = JSON.parse(fs.readFileSync(path.join(dir, f)));
    m.set(r.task_id, r);
  }
  return m;
}
function summary(m) {
  const s = { n: m.size, top1: 0, top2: 0, oracle_retained: 0, oracle_generated: 0, task_seconds: 0, failures: {}, reasons: {} };
  m.forEach(r => {
    s.top1 += r.solved_top1 ? 1 : 0; s.top2 += r.solved_top2 ? 1 : 0;
    s.oracle_retained += r.oracle_retained ? 1 : 0; s.oracle_generated += (r.oracle_generated || r.oracle_retained) ? 1 : 0;
    s.task_seconds += r.runtime || 0;
    s.failures[r.failure_class] = (s.failures[r.failure_class] || 0) + 1;
    if (r.failure_reason) s.reasons[r.failure_reason] = (s.reasons[r.failure_reason] || 0) + 1;
  });
  s.task_seconds = +s.task_seconds.toFixed(0);
  return s;
}
const base = read(A), fin = read(B);
function fams(r) { return new Set((r.correct_families || []).flat().map(f => String(f).split('@')[0])); }
function authorOf(r) {
  const w = r.winning_program && r.winning_program[0];
  return w ? String(w[0]).split('@')[0] + ':' + String(w[1]).slice(0, 110) : null;
}
const regressions = [], gains = [];
fin.forEach((r, id) => {
  const b = base.get(id); if (!b) return;
  if (b.solved_top1 && !r.solved_top1) regressions.push({ id, now: r.failure_class, before: authorOf(b) });
  if (!b.solved_top1 && r.solved_top1) gains.push({ id, subsystem: [...fams(r)].join('+'), program: authorOf(r) });
});
/* branch intersection / union over correct retained outputs */
let oldOnly = 0, newOnly = 0, both = 0;
fin.forEach(r => {
  if (!r.oracle_retained) return;
  const f = fams(r), hasNew = [...f].some(x => NEW.has(x)), hasOld = [...f].some(x => !NEW.has(x));
  if (hasNew && hasOld) both++; else if (hasNew) newOnly++; else if (hasOld) oldOnly++;
});
const out = { baseline: summary(base), final: summary(fin), regressions, unique_gains: gains,
  branches: { old_only: oldOnly, new_only: newOnly, both, union: oldOnly + newOnly + both } };
console.log(JSON.stringify(out, null, 1));
