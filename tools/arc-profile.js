/* Profile the refinement stage from benchmark result directories.
 *
 *   node tools/arc-profile.js RESULTS_DIR [BASELINE_DIR] [--out FILE]
 *
 * Reads the per-task records written by c4-arc/bench.js (diagnostics only;
 * answers are compared by bench.js, not here) and reports: which repair
 * operators were tried / improved a residual / produced exact programs,
 * which diagnoses occurred, which solver families supplied near-misses, how
 * many near-misses became exact, mean repair depth, wasted and duplicate
 * branches, redundant repairs, refinement time, and runtime against a
 * baseline run.
 */
"use strict";
var fs = require("fs"), path = require("path");
var args = process.argv.slice(2), outIdx = args.indexOf("--out"), out = outIdx >= 0 ? args[outIdx + 1] : null;
if (outIdx >= 0) args.splice(outIdx, 2);
var dir = args[0], base = args[1];
function read(d) {
  var m = new Map();
  fs.readdirSync(d).filter(function (n) { return /^arc[12]_[0-9a-f]+\.json$/.test(n); })
    .forEach(function (n) { var r = JSON.parse(fs.readFileSync(path.join(d, n))); m.set(r.task_id, r); });
  return m;
}
function q(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? { p50: a[a.length >> 1], p90: a[Math.floor(a.length * 0.9)], max: a[a.length - 1] } : null; }
var R = read(dir), B = base ? read(base) : null;
var p = { tasks: R.size, refinement_ran: 0, no_executable: 0, exact_found_no_executable: 0, exact_found_with_executable: 0,
  won_by_repair: 0, won_by_repair_correct: 0, redundant_repairs: 0, evaluated: 0, kept: 0, wasted: 0, duplicates: 0,
  backtracks: 0, representation_switches: 0, made_exact: 0, depth_sum: 0, seeds_by_family: {}, diagnoses: {},
  mutations: {}, ms: [], steps: [], counterfactual_ran: 0, counterfactual_penalised: 0, plan_actions: {} };
R.forEach(function (r) {
  var x = r.diagnostics && r.diagnostics.refinement;
  var cf = r.diagnostics && r.diagnostics.counterfactual;
  if (cf && cf.ran) { p.counterfactual_ran++; if (cf.hypotheses.some(function (h) { return h.penalty > 0; })) p.counterfactual_penalised++; }
  if (r.winning_family === "repair") { p.won_by_repair++; if (r.solved_top1) p.won_by_repair_correct++; }
  if (!x || !x.ran) return;
  var st = x.stats;
  p.refinement_ran++;
  if (!x.has_exact) { p.no_executable++; if (st.exact) p.exact_found_no_executable++; }
  else if (st.exact) p.exact_found_with_executable++;
  p.redundant_repairs += x.redundant || 0;
  p.evaluated += st.evaluated; p.kept += st.kept; p.wasted += st.wasted; p.duplicates += st.duplicates;
  p.backtracks += st.backtracks; p.representation_switches += st.representation_switches;
  p.made_exact += st.made_exact; if (st.mean_depth) p.depth_sum += st.mean_depth * st.made_exact;
  p.ms.push(st.ms); p.steps.push(st.steps);
  Object.keys(x.seed_families || {}).forEach(function (f) { p.seeds_by_family[f] = (p.seeds_by_family[f] || 0) + x.seed_families[f]; });
  Object.keys(st.by_diag || {}).forEach(function (k) { p.diagnoses[k] = (p.diagnoses[k] || 0) + st.by_diag[k]; });
  Object.keys(st.by_mutation || {}).forEach(function (k) {
    var m = p.mutations[k] || (p.mutations[k] = { tried: 0, kept: 0, improved: 0, exact: 0 }), s = st.by_mutation[k];
    m.tried += s.tried; m.kept += s.kept; m.improved += s.improved; m.exact += s.exact;
  });
  (st.plan || []).forEach(function (a) { p.plan_actions[a] = (p.plan_actions[a] || 0) + 1; });
});
p.mean_repair_depth = p.made_exact ? p.depth_sum / p.made_exact : null;
p.refinement_ms = q(p.ms); p.refinement_steps = q(p.steps); delete p.ms; delete p.steps; delete p.depth_sum;
if (B) {
  var rt = [], rb = [], improved = [], regressed = [];
  R.forEach(function (r, id) {
    var b = B.get(id); if (!b) return;
    rt.push(r.runtime || 0); rb.push(b.runtime || 0);
    if (r.solved_top1 && !b.solved_top1) improved.push(id);
    if (!r.solved_top1 && b.solved_top1) regressed.push(id);
  });
  var mean = function (a) { return a.reduce(function (s, v) { return s + v; }, 0) / Math.max(1, a.length); };
  p.runtime = { mean_after: mean(rt), mean_baseline: mean(rb), p90_after: q(rt).p90, p90_baseline: q(rb).p90 };
  p.tasks_improved = improved; p.tasks_regressed = regressed;
}
var ranked = Object.keys(p.mutations).sort(function (a, b) { return p.mutations[b].exact - p.mutations[a].exact || p.mutations[b].improved - p.mutations[a].improved; });
p.mutation_ranking = ranked.map(function (k) { var m = p.mutations[k]; return k + " tried=" + m.tried + " improved=" + m.improved + " exact=" + m.exact; });
if (out) fs.writeFileSync(out, JSON.stringify(p, null, 2));
console.log(JSON.stringify(p, null, 1));
