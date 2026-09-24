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
/* ---------------------------------------------------- search quality
   (every field optional: older result directories simply lack them) */
function add(o, k, v) { o[k] = (o[k] || 0) + (v || 0); }
var sq = { synthesis: {}, candidates: {}, near_miss_by_family: {}, popsearch: { tasks: 0, by_class: {}, exact_depths: {} },
           tta: { ran: 0, validated: 0, adapted_found: 0, top_residual: {} },
           representation: { tasks_with_represent_fit: 0, migrations: 0, migration_kept: 0, migration_exact: 0 },
           repair_by_residual: {}, macros: { tasks_using: 0, steps: 0 }, failures: {}, pass2_promoted: 0,
           stage_ms: { modules: {}, refinement: 0, popsearch: 0, tta: 0 } };
R.forEach(function (r) {
  var d = r.diagnostics || {};
  add(sq.failures, r.failure_class || "unknown", 1);
  (d.modules || []).forEach(function (m) {
    add(sq.stage_ms.modules, m.module, m.elapsed || 0);
    if (m.module === "represent" && m.fitted) sq.representation.tasks_with_represent_fit++;
  });
  Object.keys(d.synthesis || {}).forEach(function (k) { add(sq.synthesis, k, d.synthesis[k]); });
  (d.predictions || []).forEach(function (pr) { if (pr.pass2_promoted) sq.pass2_promoted++; });
  var usesMacro = (d.typed_solutions || []).some(function (t) { return /\bm:/.test(t.struct || ""); });
  if (usesMacro) sq.macros.tasks_using++;
  sq.macros.steps += (d.synthesis && d.synthesis.macro_steps) || 0;
  var x = d.refinement;
  if (!x || !x.ran) return;
  var c = x.candidates || {};
  ["offered", "evaluated", "kept", "typed", "clusters", "dup_behavior", "dup_structural", "capped", "evicted", "budget_stopped"].forEach(function (k) { add(sq.candidates, k, c[k]); });
  Object.keys(c.near_miss_by_family || {}).forEach(function (f) {
    var s = c.near_miss_by_family[f], t = sq.near_miss_by_family[f] || (sq.near_miss_by_family[f] = { offered: 0, kept: 0, best_sum: 0, n: 0 });
    t.offered += s.offered || 0; t.kept += s.kept || 0;
    if (typeof s.best === "number") { t.best_sum += s.best; t.n++; }
  });
  var st = x.stats || {};
  sq.representation.migrations += st.migrations || 0; sq.representation.migration_kept += st.migration_kept || 0;
  sq.representation.migration_exact += st.migration_exact || 0;
  sq.stage_ms.refinement += st.ms || 0;
  /* repair success by the task's dominant residual category */
  var bd = st.by_diag || {}, top = Object.keys(bd).sort(function (a, b) { return bd[b] - bd[a]; })[0];
  if (top) { var rr = sq.repair_by_residual[top] || (sq.repair_by_residual[top] = { tasks: 0, made_exact: 0 }); rr.tasks++; if (st.made_exact || (x.popsearch && x.popsearch.exact)) rr.made_exact++; }
  var ps = x.popsearch;
  if (ps) {
    sq.popsearch.tasks++;
    ["generated", "evaluated", "struct_dup", "behavior_dup", "exact", "niches", "archive"].forEach(function (k) { add(sq.popsearch, k, ps[k]); });
    sq.stage_ms.popsearch += ps.ms || 0;
    (ps.exact_depths || []).forEach(function (dd) { add(sq.popsearch.exact_depths, String(dd), 1); });
    Object.keys(ps.by_class || {}).forEach(function (k) {
      var s = ps.by_class[k], t = sq.popsearch.by_class[k] || (sq.popsearch.by_class[k] = { tried: 0, kept: 0, improved: 0, exact: 0 });
      t.tried += s.tried || 0; t.kept += s.kept || 0; t.improved += s.improved || 0; t.exact += s.exact || 0;
    });
  }
  if (x.tta) {
    sq.tta.ran++; sq.tta.validated += x.tta.validated || 0; sq.tta.adapted_found += x.tta.adapted_found || 0;
    sq.stage_ms.tta += x.tta.ms || 0;
    if (x.tta.top_residual) add(sq.tta.top_residual, x.tta.top_residual, 1);
  }
});
Object.keys(sq.near_miss_by_family).forEach(function (f) {
  var t = sq.near_miss_by_family[f]; t.mean_best_residual = t.n ? Math.round(t.best_sum / t.n * 1000) / 1000 : null; delete t.best_sum; delete t.n;
});
if (sq.synthesis.generated) {
  sq.synthesis.duplicate_ratio = Math.round((sq.synthesis.canonical_duplicates + sq.synthesis.behavior_duplicates) / sq.synthesis.generated * 1000) / 1000;
  sq.synthesis.unique_states = sq.synthesis.evaluated - (sq.synthesis.behavior_duplicates || 0);
}
if (sq.popsearch.generated) sq.popsearch.unique_per_generated = Math.round((sq.popsearch.evaluated - sq.popsearch.behavior_dup) / sq.popsearch.generated * 1000) / 1000;
p.search_quality = sq;

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
