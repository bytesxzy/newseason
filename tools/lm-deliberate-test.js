/* Deliberation controller tests (c4-lm-deliberate.js), on the shipping page
 * stack (tools/lm-runtime.js boots c4-mini.html's own scripts).
 *
 * The required generalisation check: a language solver produces one
 * PLAUSIBLE BUT WRONG derivation (fluent, long, self-reported as checked)
 * and one VERIFIED derivation (short, plain). The selector must choose the
 * verified one -- by verification, never by length or eloquence.
 *
 * Also: a majority of methods sharing one misreading loses to one
 * independently verified reading; a self-checked fragment loses to a
 * substitution-checked answer; the asked quantity picks the tool; closed
 * mode never touches the network and abstains on a knowledge gap; tool mode
 * turns SUPPORTING evidence from independent origins into candidates, and
 * rejects evidence that merely mentions the subject; the meta hub shared
 * with ARC receives the language trajectories.
 */
"use strict";
var RT = require("./lm-runtime.js");
var win = RT.boot({});
var D = win.C4LMDeliberate, PR = win.C4LMProblem, EV = win.C4LMEvidence, C = win.C4LMCore, META = win.C4ReasonMeta;

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  FAIL " + msg); } }

ok(!!(D && PR && EV && C && META), "stack loaded (deliberate, problem, evidence, core, meta)");
if (win.__loadErrors) console.log("  load errors: " + win.__loadErrors.join("; "));

/* ---------------------------------------------- plausible vs verified */
console.log("plausible-but-wrong vs verified");
var Q = "Solve 3x - 7 = 11 for x.";
var WRONG = {
  source: "solverA", method: "fluent derivation", answer: "x = 4/3",
  derivation: ["3x - 7 = 11", "3x = 11 - 7", "3x = 4", "x = 4/3"],
  claims: ["Subtracting 7 from both sides isolates the linear term cleanly.", "Dividing by the coefficient 3 then yields the unique solution.",
           "This is the standard two-step procedure for any linear equation, and it always works."],
  checks: [{ name: "self-consistency of the narrative", pass: true }], uncertainty: 0.05
};
var RIGHT = { source: "solverB", method: "plain derivation", answer: "x = 6", derivation: ["3x - 7 = 11", "3x = 18", "x = 6"], checks: [] };
(function rolesOnly() {
  var S = PR.structure(Q);
  var cands = [WRONG, RIGHT].map(function (c) { return D.roles.solver ? null : c; }).filter(Boolean);
  /* the two injected candidates only: no other reader may decide it */
  var norm = [WRONG, RIGHT].map(function (c) {
    return { source: c.source, method: c.method, answer: c.answer, key: D.answerKey(c.answer), claims: c.claims || [], assumptions: [],
             derivation: c.derivation, toolsUsed: [], evidenceUsed: [], checks: (c.checks || []).map(function (x) { return Object.assign({ strength: "self" }, x); }),
             uncertainty: c.uncertainty || 0.5 };
  });
  D.roles.critic(norm, S, Q); D.roles.verifier(norm); var sel = D.roles.selector(norm, S);
  ok(cands.length === 0, "roles are called directly");
  ok(sel.best && sel.best.key === "6", "selector chooses the verified derivation (chose " + (sel.best && sel.best.key) + ")");
  var w = norm[0], r = norm[1];
  ok(w.issues.some(function (i) { return i.kind === "invalid_inference" || i.kind === "verification_failed"; }), "critic finds the wrong step / failed substitution");
  ok(r.verification.strong, "the plain derivation is independently verified (substitution into the question's equation)");
  ok(!w.verification.verified, "the fluent derivation is not verified despite its self-reported check");
  ok(w.derivation.join(" ").length + w.claims.join(" ").length > r.derivation.join(" ").length, "the wrong one really is the longer, more eloquent one");
})();
(function fullSolve() {
  var res = D.solve(Q, { candidates: [WRONG] });
  ok(res.answer && /\b6\b/.test(res.answer), "full deliberation with the wrong derivation injected answers 6 (" + res.answer + ")");
  var injected = res.candidates.filter(function (c) { return c.source === "solverA"; })[0];
  ok(injected && !injected.verified, "the injected wrong derivation is rejected");
})();
(function bothUnverifiable() {
  var S = PR.structure("Which is heavier, a glorp or a snib?");
  var cands = [{ source: "a", method: "m", answer: "a glorp", key: "a glorp", claims: [], assumptions: ["glorps are dense"], derivation: [], toolsUsed: [], evidenceUsed: [], checks: [], uncertainty: 0.5 },
               { source: "b", method: "m", answer: "a snib", key: "a snib", claims: [], assumptions: ["snibs are big"], derivation: [], toolsUsed: [], evidenceUsed: [], checks: [], uncertainty: 0.5 }];
  D.roles.critic(cands, S, "Which is heavier, a glorp or a snib?"); D.roles.verifier(cands);
  var sel = D.roles.selector(cands, S);
  ok(!sel.verified && sel.confidence < 0.5, "nothing verified: low confidence (" + Math.round(sel.confidence * 100) / 100 + ")");
})();

/* ------------------------------------------- independence and coverage */
console.log("independence, coverage, substitution, routing");
var sub = D.solve("How many subsets of {1, 2, ..., 10} sum to 15?");
ok(sub.key === "20", "three methods on one misreading lose to one verified tool (" + sub.key + ")");
ok(sub.candidates.some(function (c) { return c.source === "problem" && c.issues.indexOf("unused_givens") >= 0; }), "the misreading is flagged: unused givens");
var lin = D.solve("Solve 2x + 3 = 11");
ok(lin.key === "4", "linear equation answered 4");
ok(lin.candidates.some(function (c) { return c.source === "operators" && c.key === "3" && !c.verified; }), "a self-checked fragment ('+ 3') fails substitution");
var det = D.solve("What is the determinant of [[2,1],[1,3]]?");
ok(det.key === "5" && det.candidates.every(function (c) { return c.method !== "matrix.inverse"; }), "the asked quantity picks the tool (determinant 5, no inverse candidate)");
var mn = D.solve("What is the minimum of x^2 - 4x + 1 for x in [0, 5]?");
ok(mn.key === "-3", "minimum value -3 (not the operator library's fragment -2): " + mn.key);
var bay = D.solve("A disease affects 1% of the population. A test detects 99% of cases and has a false positive rate of 5%. If a person tests positive, what is the probability they have the disease?");
ok(bay.answer && /1\/6/.test(bay.answer), "Bayes posterior 1/6");
ok(bay.difficulty.level === "easy", "one verified exact tool takes the fast path");
ok(sub.difficulty.level === "hard", "a contested question takes the deep path");
ok(bay.trace && /CONFIRMED/.test(JSON.stringify(bay.trace)), "working memory records the confirmed candidate");

/* ------------------------------------------------- closed vs tool mode */
console.log("closed vs tool mode");
var calls = 0;
var boom = { gather: function () { calls++; throw new Error("network touched"); } };
var closed = D.solve("What is the capital of Freedonia?", { mode: "closed", federation: boom });
ok(closed.abstained && closed.knowledgeGap, "closed mode abstains on a knowledge gap");
ok(calls === 0, "closed solve() never calls the federation");
var frame = C.parse("What is the capital of Freedonia?", null);
function fedWith(props) {
  return { gather: function () {
    calls++;
    var g = new EV.EvidenceGraph();
    props.forEach(function (p) { g.add(new EV.Proposition(p)); });
    return Promise.resolve(g);
  } };
}
var TWO_ORIGINS = [
  { subject: "Freedonia", predicate: "detail", object: "Fredville", text: "The capital of Freedonia is Fredville.", source: "Wikipedia", sourceKind: "encyclopedia", confidence: 0.8 },
  { subject: "Freedonia", predicate: "detail", object: "Fredville", text: "Freedonia's capital city is Fredville.", source: "Crossref", sourceKind: "scholarly", confidence: 0.7 }
];
var SAME_ORIGIN = [
  { subject: "Freedonia", predicate: "detail", object: "Fredville", text: "The capital of Freedonia is Fredville.", source: "Wikipedia", sourceKind: "encyclopedia", confidence: 0.8 },
  { subject: "Freedonia", predicate: "detail", object: "Fredville", text: "Freedonia capital: Fredville", source: "Wikidata", sourceKind: "structured", confidence: 0.8 }
];
var MENTION_ONLY = [
  { subject: "Freedonia", predicate: "detail", object: "Freedonia is a fictional country.", text: "Freedonia is a fictional country in a 1933 film.", source: "Wikipedia", sourceKind: "encyclopedia", confidence: 0.8 }
];
calls = 0;
D.solveAsync("What is the capital of Freedonia?", { mode: "closed", federation: fedWith(TWO_ORIGINS), frame: frame }).then(function (r0) {
  ok(calls === 0 && r0.abstained, "solveAsync in closed mode does not gather evidence");
  return D.solveAsync("What is the capital of Freedonia?", { mode: "tool", federation: fedWith(TWO_ORIGINS), frame: frame });
}).then(function (r1) {
  ok(calls === 1, "tool mode gathers evidence once");
  ok(r1.answer === "Fredville" && r1.verified, "two independent origins supporting the asked relation give a verified answer (" + r1.answer + ")");
  ok(r1.mode === "tool", "the result is labelled tool mode");
  return D.solveAsync("What is the capital of Freedonia?", { mode: "tool", federation: fedWith(SAME_ORIGIN), frame: frame });
}).then(function (r2) {
  var ev = r2.candidates.filter(function (c) { return c.source === "evidence"; })[0];
  ok(ev && !ev.verified, "Wikipedia + Wikidata are one origin: not independently verified");
  return D.solveAsync("What is the capital of Freedonia?", { mode: "tool", federation: fedWith(MENTION_ONLY), frame: frame });
}).then(function (r3) {
  ok(r3.abstained || !r3.verified, "evidence that only MENTIONS the subject does not answer the asked relation");
  var g = new EV.EvidenceGraph(); MENTION_ONLY.forEach(function (p) { g.add(new EV.Proposition(p)); });
  ok(EV.knowledgeGap(g, frame).gap, "knowledge gap detected when only mentions exist");
  var g2 = new EV.EvidenceGraph();
  g2.add(new EV.Proposition({ subject: "Freedonia", predicate: "capital", object: "Fredville", source: "Wikipedia", confidence: 0.8, text: "capital Fredville" }));
  g2.add(new EV.Proposition({ subject: "Freedonia", predicate: "capital", object: "Sylvania City", source: "Crossref", confidence: 0.8, text: "capital Sylvania City" }));
  ok(EV.contradictionGroups(g2).length === 1, "contradicting claims form one contradiction group");
}).then(function () {
  /* one controller for every domain: language trajectories reach the hub ARC uses */
  var n = META.hub.buffer.filter(function (s) { return s.domain === "lm"; }).length;
  ok(n > 0, "language trajectories are logged to the shared meta hub (" + n + ")");
  console.log("lm-deliberate-test: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.log("  ERROR " + (e && e.stack || e)); process.exit(1); });
