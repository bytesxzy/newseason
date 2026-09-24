/* Learn reusable ARC macros from the synthetic curriculum.
 *
 *   node tools/arc-macros.js [--train 240] [--val 80] [--test 120] [--ms 300]
 *                            [--seed 21] [--source both|discovered|generator]
 *                            [--write] [--out measurements/arc-macros.json]
 *
 *   collect   solve the curriculum's TRAINING split with the search core,
 *             macros off; keep the exact programs found (source
 *             "discovered") and/or the generator programs of those training
 *             tasks (source "generator")
 *   mine      canonicalise, enumerate fragments, anti-unify literals into
 *             typed parameters, estimate description-length gain
 *             (c4-arc/src/56b-macros.js)
 *   accept    each candidate, alone, on a HELD-OUT composition validation
 *             split: accepted only if it solves more held-out tasks, or the
 *             same number with at least 10% less search to the first exact
 *             program. Backward elimination drops any macro whose removal
 *             does not hurt the accepted set.
 *   test      the accepted set, jointly, on a separate held-out test split
 *             against no macros: held-out accuracy delta, search-cost delta,
 *             how often solutions actually use a macro
 *   write     c4-arc/src/56c-macro-library.js (generated; then npm run build)
 *
 * No ARC benchmark data is read. Held-out splits use composition holdout
 * (tools/arc-curriculum.js): their family/motif adjacencies never occur in
 * the training split.
 */
"use strict";
var fs = require("fs"), path = require("path");
var E = require("../c4-arc-engine.js");
var C = require("./arc-curriculum.js");

var args = process.argv.slice(2);
function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
var nTrain = +arg("train", 240), nVal = +arg("val", 80), nTest = +arg("test", 120), ms = +arg("ms", 300), seed = +arg("seed", 21);
var source = arg("source", "both"), maxCand = +arg("candidates", 10);
var t0 = Date.now();
function log(m) { console.log("[" + ((Date.now() - t0) / 1000).toFixed(0) + "s] " + m); }

E.MACROS.clear();
var train = C.makeSplit(nTrain, seed, "train", { depths: [2, 3, 4] });
var val = C.makeSplit(nVal, seed + 1, "heldout", { depths: [3, 4, 5] });
var test = C.makeSplit(nTest, seed + 2, "heldout", { depths: [3, 4, 5] });
log("splits train=" + train.length + " val=" + val.length + " test=" + test.length);

/* ---------------------------------------------------------------- collect */
var programs = [], solvedTrain = 0;
train.forEach(function (it, i) {
  if (source !== "generator") {
    var a = C.solveCore(it, { ms: ms, refine: true, pop: true });
    if (a.generalized && a.tree) { programs.push({ tree: a.tree, task: "t" + i, source: "discovered" }); solvedTrain++; }
  }
  if (source !== "discovered") programs.push({ tree: it.P, task: "t" + i, source: "generator" });
});
log("collected " + programs.length + " programs (" + solvedTrain + " discovered)");

/* ------------------------------------------------------------------- mine */
var cands = E.MACROS.mine(programs, { minSupport: 4, maxParams: 3, limit: 40 });
log("candidates " + cands.length);

function evalWith(list, items) {
  E.MACROS.load(list);
  var r = C.evaluateSplit(items, { ms: ms });
  E.MACROS.clear();
  return r;
}
/* --------------------------------------------------------------- accept */
var base = evalWith([], val);
log("validation baseline generalized " + base.generalized + "/" + base.n + " cost " + (base.mean_search_cost || 0).toFixed(0));
var accepted = [], tried = [];
cands.slice(0, maxCand).forEach(function (c, i) {
  c.name = "L" + i;
  var r = evalWith([c], val);
  var dGen = r.generalized - base.generalized;
  var costCut = base.mean_search_cost && r.mean_search_cost ? 1 - r.mean_search_cost / base.mean_search_cost : 0;
  var ok = dGen >= 1 || (dGen === 0 && costCut >= 0.10);
  tried.push({ name: c.name, skeleton: c.skeleton, params: c.params, support: c.support, mdlGain: c.mdlGain,
               val_generalized: r.generalized, delta: dGen, cost_cut: Math.round(costCut * 1000) / 1000,
               macro_uses: r.macroUses || 0, accepted: ok });
  log("  " + c.name + " " + c.skeleton + " support=" + c.support + " gain=" + c.mdlGain + " delta=" + dGen + " costcut=" + costCut.toFixed(2) + (ok ? " ACCEPT" : ""));
  if (ok) { c.heldoutUtility = dGen; c.valCostCut = costCut; accepted.push(c); }
});
/* backward elimination on the joint set */
if (accepted.length > 1) {
  var joint = evalWith(accepted, val);
  for (var k = accepted.length - 1; k >= 0 && accepted.length > 1; k--) {
    var without = accepted.slice(0, k).concat(accepted.slice(k + 1));
    var rw = evalWith(without, val);
    if (rw.generalized >= joint.generalized) {
      log("  drop " + accepted[k].name + " (joint " + joint.generalized + " -> " + rw.generalized + " without it)");
      accepted = without; joint = rw;
    }
  }
}
/* ------------------------------------------------------------------ test */
var testBase = evalWith([], test);
var testWith = accepted.length ? evalWith(accepted, test) : testBase;
log("held-out test: without " + testBase.generalized + "/" + testBase.n + ", with " + testWith.generalized + "/" + testWith.n);

accepted.forEach(function (c) {
  c.weight = 1 + Math.max(0, c.heldoutUtility || 0) + Math.max(0, (c.valCostCut || 0) * 4);
  c.version = 1;
  c.lineage = ["arc-macros seed=" + seed + " source=" + source];
  c.preconditions = {};
});
var report = {
  note: "synthetic curriculum; macros mined from the training split, accepted on a held-out composition validation split, measured on a separate held-out test split. No ARC benchmark data.",
  source: source, splits: { train: train.length, val: val.length, test: test.length }, ms_per_task: ms,
  collected: programs.length, discovered: solvedTrain,
  candidate_macros: cands.length, evaluated_candidates: tried.length, accepted_macros: accepted.length,
  average_compression_gain: accepted.length ? accepted.reduce(function (s, c) { return s + c.mdlGain; }, 0) / accepted.length : 0,
  validation_baseline: base.generalized,
  heldout_test: { without: testBase.generalized, with: testWith.generalized, n: testBase.n,
                  delta: testWith.generalized - testBase.generalized,
                  search_cost_without: testBase.mean_search_cost, search_cost_with: testWith.mean_search_cost,
                  macro_usage: testWith.macroUses || 0, by_depth_without: testBase.byDepth, by_depth_with: testWith.byDepth },
  candidates: tried, seconds: (Date.now() - t0) / 1000
};
var out = arg("out", "");
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ accepted: accepted.map(function (c) { return c.name + ":" + c.skeleton; }), heldout_test: report.heldout_test }, null, 1));
if (args.indexOf("--write") >= 0) {
  var lib = accepted.map(function (c) {
    return { name: c.name, template: c.template, params: c.params, weight: Math.round(c.weight * 1000) / 1000, support: c.support,
             mdlGain: c.mdlGain, heldoutUtility: c.heldoutUtility, version: c.version, lineage: c.lineage, preconditions: c.preconditions };
  });
  var src = "/* ===== src/56c-macro-library.js ===== */\n" +
    "/* GENERATED FILE -- do not edit by hand.\n" +
    " * Learned macro library written by tools/arc-macros.js from the synthetic\n" +
    " * curriculum's TRAINING split (programs the solver found, and generator\n" +
    " * programs of training tasks). Each macro was accepted only after it\n" +
    " * improved held-out compositional solving or cut search cost without an\n" +
    " * accuracy loss. No ARC benchmark data is used.\n" +
    " * Regenerate with: npm run arc:macros */\n" +
    "MACROS.load(" + JSON.stringify(lib) + ");\n";
  fs.writeFileSync(path.join(__dirname, "..", "c4-arc", "src", "56c-macro-library.js"), src);
  console.log("wrote c4-arc/src/56c-macro-library.js (" + lib.length + " macros); run npm run build");
}
