/* Ablations of the ARC reasoning stages at EQUAL time per task, on the
 * synthetic curriculum's held-out splits (tools/arc-curriculum.js): held-out
 * compositions (element pairs never seen together in training) and
 * representation tasks (rules over colour roles, change overlays, ...).
 * No ARC benchmark data is read.
 *
 *   node tools/arc-ablate.js [--n 100] [--rep 40] [--ms 500] [--seed 31] [--out FILE]
 *
 * Configurations: full, -canon, -represent, -refine, -pop, -macros, -tta,
 * -meta. Portfolio-level stages (counterfactual discrimination, semantic
 * pass@2, re-framing) are ablated on ARC itself with
 * `node c4-arc/bench.js --ablate <stage>`.
 */
"use strict";
var path = require("path"), fs = require("fs");
var CUR = require("./arc-curriculum.js");
var E = require(path.join(__dirname, "..", "c4-arc-engine.js"));

var args = process.argv.slice(2);
function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
var n = +arg("n", 100), nRep = +arg("rep", 40), ms = +arg("ms", 500), seed = +arg("seed", 31), out = arg("out", "");
var only = arg("only", "");

var comp = CUR.makeSplit(n, seed, "heldout", { depths: [2, 3, 4], holdSeed: 1 });
var rep = [];
["roles", "change", "crop", "down"].forEach(function (k, i) { rep = rep.concat(CUR.makeSplit(Math.ceil(nRep / 4), seed + 100 + i, "rep:" + k)); });
var library = E.MACROS.active();
var metaModel = E.META && E.META.hub && E.META.hub.active ? E.META.hub.active() : null;

var CONFIGS = {
  "full": {},
  "-canon": { canon: false },
  "-represent": { represent: false },
  "-refine": { refine: false },
  "-pop": { pop: false },
  "-macros": { macros: false },
  "-tta": { tta: false },
  "-meta": { meta: false }
};

function run(name) {
  var cfg = CONFIGS[name], t0 = Date.now();
  if (cfg.macros === false) E.MACROS.clear();
  var opts = { ms: ms, canon: cfg.canon, represent: cfg.represent, refine: cfg.refine, pop: cfg.pop, tta: cfg.tta,
               metaModel: cfg.meta === false ? null : metaModel };
  var a = CUR.evaluateSplit(comp, opts), b = CUR.evaluateSplit(rep, opts);
  if (cfg.macros === false) E.MACROS.load(library);
  return {
    composition: { n: a.n, generalized: a.generalized, top2: a.top2, byDepth: a.byDepth, bySolver: a.bySolver,
                   duplicate_ratio: a.generated ? Math.round((a.canonDup + a.behaviorDup) / a.generated * 1000) / 1000 : null },
    representation: { n: b.n, generalized: b.generalized, top2: b.top2, bySolver: b.bySolver },
    seconds: Math.round((Date.now() - t0) / 100) / 10
  };
}

var names = only ? only.split(",") : Object.keys(CONFIGS), res = {};
names.forEach(function (k) {
  res[k] = run(k);
  var r = res[k];
  console.log(k.padEnd(12) + " composition " + r.composition.generalized + "/" + r.composition.n +
              "  representation " + r.representation.generalized + "/" + r.representation.n + "  (" + r.seconds + " s)");
});
var report = { note: "synthetic held-out splits at equal time per task; no ARC data", ms_per_task: ms, seed: seed,
               macros_loaded: library.length, meta_model: !!metaModel, results: res };
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
