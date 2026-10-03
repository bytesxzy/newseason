'use strict';
/* Per-task regression table between two bench result directories.
 *
 *   node tools/arc-regress.js <old-dir> <new-dir> [--ids] [--out file.json]
 *
 * Prints old/new x solved/failed counts for top-1 and top-2, the families that supplied new solves, task-second and
 * runtime percentiles, and failure-class transitions. With --ids it lists regressed and newly solved task ids (leave it
 * off for sealed splits: they are reported in aggregate only).
 */
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const [a, b] = args;
const showIds = args.includes('--ids');
const outFile = (i => i < 0 ? null : args[i + 1])(args.indexOf('--out'));
function load(dir) {
  const m = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'config.json' || f === 'summary.json' || f.endsWith('.prediction.json')) continue;
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    m.set(r.task_id, r);
  }
  return m;
}
const A = load(a), B = load(b);
const ids = [...A.keys()].filter(k => B.has(k)).sort();
const q = (xs, p) => { const s = xs.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
function table(metric) {
  const t = { 'solved->solved': 0, 'solved->failed': 0, 'failed->solved': 0, 'failed->failed': 0 };
  const reg = [], gain = [];
  for (const id of ids) {
    const x = !!A.get(id)[metric], y = !!B.get(id)[metric];
    t[(x ? 'solved' : 'failed') + '->' + (y ? 'solved' : 'failed')]++;
    if (x && !y) reg.push(id); if (!x && y) gain.push(id);
  }
  return { t, reg, gain };
}
const t1 = table('solved_top1'), t2 = table('solved_top2'), to = table('oracle_retained');
const fam = {};
for (const id of t1.gain) { const f = B.get(id).winning_family || '?'; fam[f] = (fam[f] || 0) + 1; }
const ftrans = {};
for (const id of ids) { const k = A.get(id).failure_class + '->' + B.get(id).failure_class; ftrans[k] = (ftrans[k] || 0) + 1; }
const rt = m => ids.map(id => m.get(id).runtime || 0);
const sum = xs => xs.reduce((s, x) => s + x, 0);
const res = {
  n: ids.length, old: a, new: b,
  top1: { old: ids.filter(i => A.get(i).solved_top1).length, new: ids.filter(i => B.get(i).solved_top1).length, table: t1.t },
  top2: { old: ids.filter(i => A.get(i).solved_top2).length, new: ids.filter(i => B.get(i).solved_top2).length, table: t2.t },
  oracle: { old: ids.filter(i => A.get(i).oracle_retained).length, new: ids.filter(i => B.get(i).oracle_retained).length, table: to.t },
  no_candidate: { old: ids.filter(i => A.get(i).failure_class === 'NO_CANDIDATE').length, new: ids.filter(i => B.get(i).failure_class === 'NO_CANDIDATE').length },
  new_solve_families: fam,
  runtime: { old: { total: sum(rt(A)), p50: q(rt(A), .5), p90: q(rt(A), .9), p99: q(rt(A), .99) }, new: { total: sum(rt(B)), p50: q(rt(B), .5), p90: q(rt(B), .9), p99: q(rt(B), .99) } },
  failure_transitions: ftrans
};
if (showIds) { res.regressed_top1 = t1.reg; res.new_top1 = t1.gain; }
console.log(JSON.stringify(res, null, 1));
if (outFile) fs.writeFileSync(outFile, JSON.stringify(res, null, 1));
