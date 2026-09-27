#!/usr/bin/env node
/* Tables for the ARC-3 report from tools/arc3-bench.js / arc3-official.js
 * JSON outputs (no numbers are typed by hand).
 *
 *   node tools/arc3-report.js bench.json [more.json ...]
 *
 * Prints, per agent: mean official score, levels, per-family scores,
 * per-category scores (non-avatar, click-heavy, temporal, hidden-state,
 * navigation), cross-level efficiency (baseline/actions on level 1 vs later
 * completed levels), prediction accuracy (own steps; counterfactual probes
 * by K), actions to the first completion, wasted experiments, think time. */
"use strict";
var fs = require("fs");
var CATS = {
  "non-avatar": ["lights", "rotsel", "cyclematch", "counter", "modepaint", "sequence", "timedstop", "swap", "symmetry", "dropstack", "logicpanel", "eliminate"],
  "click-heavy": ["lights", "rotsel", "cyclematch", "counter", "modepaint", "sequence", "swap", "symmetry", "dropstack", "logicpanel", "eliminate"],
  "temporal": ["patrol", "timedstop", "dropstack"],
  "hidden-state": ["rotsel", "modepaint", "keys", "sequence", "swap", "logicpanel"],
  "navigation": ["maze", "push", "patrol", "keys", "collect", "bridgekey"]
};
/* the game score without the 5x-baseline cutoff (the scorecard code of
   arc-agi 0.9.9 applies none; the technical report's cutoff is what the
   harness scores by default) */
function scoreNoCut(r) {
  var tw = 0, ts = 0, cw = 0;
  (r.level_detail || []).forEach(function (L, i) {
    var w = i + 1, sc = L[2] && L[0] > 0 && L[1] > 0 ? Math.min(1.15, Math.pow(L[1] / L[0], 2)) : 0;
    tw += w; ts += w * sc; if (sc > 0) cw += w;
  });
  return tw ? Math.min(ts / tw, cw / tw) : 0;
}
function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : NaN; }
function f3(x) { return isNaN(x) ? "-" : x.toFixed(3); }
var results = [];
process.argv.slice(2).forEach(function (p) { var j = JSON.parse(fs.readFileSync(p, "utf8")); results = results.concat(j.results.filter(function (r) { return !r.error; })); });
var agents = []; results.forEach(function (r) { if (agents.indexOf(r.agent) < 0) agents.push(r.agent); });
var fams = []; results.forEach(function (r) { var f = r.family || r.game; if (fams.indexOf(f) < 0) fams.push(f); });
function of(ag, f) { return results.filter(function (r) { return r.agent === ag && (r.family || r.game) === f; }); }
console.log("## Score by family (mean official score; mean levels completed)\n");
console.log("| family | " + agents.join(" | ") + " |"); console.log("|" + new Array(agents.length + 2).join("---|"));
fams.forEach(function (f) { console.log("| " + f + " | " + agents.map(function (ag) { var rs = of(ag, f); return rs.length ? f3(mean(rs.map(function (r) { return r.score; }))) + " (" + mean(rs.map(function (r) { return r.levels; })).toFixed(1) + ")" : "-"; }).join(" | ") + " |"); });
console.log("| **mean** | " + agents.map(function (ag) { return "**" + f3(mean(fams.map(function (f) { var rs = of(ag, f); return rs.length ? mean(rs.map(function (r) { return r.score; })) : NaN; }).filter(function (x) { return !isNaN(x); }))) + "**"; }).join(" | ") + " |");
console.log("| mean without the 5x cutoff | " + agents.map(function (ag) { return f3(mean(fams.map(function (f) { var rs = of(ag, f); return rs.length ? mean(rs.map(scoreNoCut)) : NaN; }).filter(function (x) { return !isNaN(x); }))); }).join(" | ") + " |");
console.log("| games with >= 1 level | " + agents.map(function (ag) { var rs = results.filter(function (r) { return r.agent === ag; }); return rs.filter(function (r) { return r.levels > 0; }).length + "/" + rs.length; }).join(" | ") + " |");
console.log("| levels completed | " + agents.map(function (ag) { var rs = results.filter(function (r) { return r.agent === ag; }); return rs.reduce(function (a, r) { return a + r.levels; }, 0) + "/" + rs.reduce(function (a, r) { return a + r.nLevels; }, 0); }).join(" | ") + " |");
console.log("\n## Score by category\n");
console.log("| category | " + agents.join(" | ") + " |"); console.log("|" + new Array(agents.length + 2).join("---|"));
Object.keys(CATS).forEach(function (c) {
  var fs2 = CATS[c].filter(function (f) { return fams.indexOf(f) >= 0; }); if (!fs2.length) return;
  console.log("| " + c + " (" + fs2.join(", ") + ") | " + agents.map(function (ag) { return f3(mean(fs2.map(function (f) { var rs = of(ag, f); return rs.length ? mean(rs.map(function (r) { return r.score; })) : NaN; }).filter(function (x) { return !isNaN(x); }))); }).join(" | ") + " |");
});
console.log("\n## Cross-level efficiency (baseline/actions of completed levels; level 1 vs later)\n");
console.log("| agent | level 1 | levels 2+ | completed L1 | completed L2+ |"); console.log("|---|---|---|---|---|");
agents.forEach(function (ag) {
  var l1 = [], l2 = [], c1 = 0, n1 = 0, c2 = 0, n2 = 0;
  results.filter(function (r) { return r.agent === ag; }).forEach(function (r) { (r.level_detail || []).forEach(function (L, i) { if (i === 0) { n1++; if (L[2]) { c1++; l1.push(L[1] / Math.max(1, L[0])); } } else { n2++; if (L[2]) { c2++; l2.push(L[1] / Math.max(1, L[0])); } } }); });
  console.log("| " + ag + " | " + f3(mean(l1)) + " | " + f3(mean(l2)) + " | " + c1 + "/" + n1 + " | " + c2 + "/" + n2 + " |");
});
console.log("\n## Prediction, efficiency, runtime\n");
console.log("| agent | own-step prediction | counterfactual K=1 / 2 / 4 / 8 / 16 / 32 | reliable after (actions) | first level (actions) | wasted experiments | resets | think s/game |");
console.log("|---|---|---|---|---|---|---|---|");
agents.forEach(function (ag) {
  var rs = results.filter(function (r) { return r.agent === ag; }), pc = [0, 0], pk = {};
  rs.forEach(function (r) { if (r.pred) { pc[0] += r.pred[0]; pc[1] += r.pred[1]; } Object.keys(r.probes || {}).forEach(function (k) { var b = pk[k] || (pk[k] = [0, 0]); b[0] += r.probes[k][0]; b[1] += r.probes[k][1]; }); });
  var rel = rs.filter(function (r) { return r.reliable_at !== null && r.reliable_at !== undefined; }), fl = rs.filter(function (r) { return r.first_level_actions; });
  console.log("| " + ag + " | " + (pc[1] ? (100 * pc[0] / pc[1]).toFixed(1) + "% of " + pc[1] : "-") + " | " +
    [1, 2, 4, 8, 16, 32].map(function (k) { return pk[k] ? (100 * pk[k][0] / pk[k][1]).toFixed(0) + "%" : "-"; }).join(" / ") + " | " +
    (rel.length ? mean(rel.map(function (r) { return r.reliable_at; })).toFixed(1) + " (" + rel.length + "/" + rs.length + ")" : "-") + " | " +
    (fl.length ? mean(fl.map(function (r) { return r.first_level_actions; })).toFixed(1) + " (" + fl.length + "/" + rs.length + ")" : "-") + " | " +
    (rs[0] && rs[0].wasted !== undefined ? rs.reduce(function (a, r) { return a + (r.wasted || 0); }, 0) : "-") + " | " +
    rs.reduce(function (a, r) { return a + (r.resets || 0); }, 0) + " | " + (mean(rs.map(function (r) { return (r.think_ms || 0) / 1000; }))).toFixed(1) + " |");
});
