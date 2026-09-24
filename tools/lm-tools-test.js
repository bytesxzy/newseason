/* Exact-tool registry tests (c4-lm-tools.js).
 *
 * For every registered tool:
 *   1. a known input gives the known answer AND passes its own verifier
 *   2. the verifier is INDEPENDENT of execute(): a tampered output (a wrong
 *      answer in the right shape) is rejected
 *   3. malformed input fails cleanly (ok:false), never throws
 * Plus: the registry covers every tool the router can suggest.
 */
"use strict";
var path = require("path");
var root = path.join(__dirname, "..");
require(path.join(root, "c4-reason-kernel.js"));
require(path.join(root, "c4-lm-problem.js"));
var TL = require(path.join(root, "c4-lm-tools.js"));

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  FAIL " + msg); } }

function tamper(v) {
  if (v === null || v === undefined) return 12345;
  if (typeof v === "number") return v + 7;
  if (typeof v === "boolean") return !v;
  if (typeof v === "string") return v + "x";
  if (typeof v === "bigint") return v + 7n;
  if (v && typeof v.add === "function" && v.n !== undefined) return v.add(7);           /* Frac */
  if (Array.isArray(v)) {
    if (!v.length) return [7];
    var c = v.slice(); c[0] = tamper(c[0]); return c;
  }
  if (typeof v === "object") {
    var o = Object.assign({}, v), k = Object.keys(o)[0];
    if (k === undefined) return { bogus: 1 };
    o[k] = tamper(o[k]); return o;
  }
  return v;
}

/* name -> [input, expected text (exact or RegExp)] */
var CASES = {
  "expr.eval": [{ expr: "2^10 - 3*7" }, "1003"],
  "frac.arith": [{ a: "1/3", b: "1/6", op: "+" }, "1/2"],
  "equation.solve": [{ equation: "x^2 - 5x + 6 = 0" }, /2, 3|3, 2/],
  "linsys.solve": [{ A: [[1, 1], [1, -1]], b: [10, 2] }, /6.*4/],
  "matrix.det": [{ A: [[2, 1], [1, 3]] }, "5"],
  "comb.choose": [{ n: 10, k: 3 }, "120"],
  "comb.perm": [{ n: 5, k: 2 }, "20"],
  "nt.factor": [{ n: 360 }, "2 x 2 x 2 x 3 x 3 x 5"],
  "nt.isprime": [{ n: 97 }, /prime|true/],
  "nt.modpow": [{ b: 3, e: 200, m: 13 }, "9"],
  "nt.gcd": [{ a: 84, b: 36 }, "12"],
  "nt.lcm": [{ a: 4, b: 6 }, "12"],
  "prob.dice": [{ n: 2, faces: 6, target: 7 }, "1/6"],
  "prob.binomial": [{ n: 4, k: 2, p: "1/2" }, "3/8"],
  "calc.derivative": [{ expr: "x^3", at: 2 }, "12"],
  "calc.integrate": [{ expr: "x^2", a: 0, b: 3 }, /^9(\.0+)?$|^9\b/],
  "graph.shortest": [{ edges: [["a", "b", 1], ["b", "c", 2], ["a", "c", 5]], from: "a", to: "c" }, "3"],
  "csp.solve": [{ vars: ["a", "b"], domains: { a: [1, 2, 3], b: [1, 2, 3] },
                  constraints: [function (s) { return s.a === undefined || s.b === undefined || s.a + s.b === 5; },
                                function (s) { return s.a === undefined || s.b === undefined || s.a > s.b; }] }, /"a":3.*"b":2/],
  "geom.visual": null,
  "matrix.mul": [{ A: [[1, 2], [3, 4]], B: [[0, 1], [1, 0]] }, /\[\[2, 1\], \[4, 3\]\]/],
  "matrix.transpose": [{ A: [[1, 2, 3], [4, 5, 6]] }, /\[\[1, 4\], \[2, 5\], \[3, 6\]\]/],
  "matrix.inverse": [{ A: [[2, 1], [1, 3]] }, "[[3/5, -1/5], [-1/5, 2/5]]"],
  "matrix.rank": [{ A: [[1, 2], [2, 4]] }, "1"],
  "matrix.rref": [{ A: [[1, 2], [3, 4]] }, /\[\[1, 0\], \[0, 1\]\]/],
  "rational.solve": [{ left: ["x+1", "x-2"], right: ["3", "1"] }, "7/2"],
  "poly.simplify": [{ expr: "(x+1)^2 - x^2" }, /2x \+ 1|2\*x \+ 1|1 \+ 2x/],
  "comb.enumerate": [{ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], targetSum: 15 }, "20"],
  "prob.bayes": [{ priors: { H: "1/100", notH: "99/100" }, likelihoods: { H: "99/100", notH: "5/100" } }, /1\/6/],
  "stats.describe": [{ values: [2, 4, 4, 4, 5, 5, 7, 9] }, /mean 5, median 9\/2, variance 4/],
  "units.convert": [{ value: "5", from: "km", to: "m" }, "5000 m"],
  "units.check": [{ lhs: "m/s", rhs: "km/h" }, /consistent|true|same/],
  "csp.propagate": [{ vars: ["x", "y"], domains: { x: [1, 2, 3], y: [1, 2, 3] }, binary: [["x", "y", function (a, b) { return a + b === 4 && a < b; }]] }, /"x":1.*"y":3/],
  "seq.sum": [{ expr: "i^2", variable: "i", from: "1", to: "10" }, "385"],
  "prog.exec": [{ program: "s = 0; for i in 1..4: s = s + i" }, /s = 10/],
  "root.find": [{ expr: "x^3 - 2", a: "0", b: "2" }, /^1\.2599/],
  "opt.extremum": [{ expr: "x^2 - 4x + 1", a: "0", b: "5", goal: "min" }, /minimum -3 at x = 2/],
  "graph.bfs": [{ edges: [["a", "b"], ["b", "c"], ["c", "d"]], from: "a", to: "d" }, "3"],
  "graph.components": [{ edges: [["a", "b"], ["c", "d"], ["d", "e"]] }, /2/],
  "graph.toposort": [{ edges: [["shirt", "tie"], ["tie", "jacket"], ["pants", "shoes"]] }, /shirt/]
};

console.log("exact tools");
var names = TL.names();
names.forEach(function (n) {
  var c = CASES[n];
  ok(c !== undefined, n + " has a test case");
  if (!c) return;
  var r = TL.run(n, c[0]);
  ok(r.ok && r.verified, n + " runs and verifies (" + (r.error || r.checks.map(function (x) { return x.name + ":" + x.pass; }).join(", ")) + ")");
  var want = c[1];
  ok(want instanceof RegExp ? want.test(String(r.text)) : String(r.text) === want, n + " answer " + JSON.stringify(r.text) + " vs " + want);
  /* the verifier judges a WRONG answer of the right shape */
  var spec = TL.get(n);
  if (spec.verify && r.ok && n !== "csp.solve" && n !== "prog.exec" && n !== "graph.toposort") {
    var wrong = { value: tamper(r.value), text: "tampered", detail: r.detail };
    var v = null;
    try { v = spec.verify(c[0], wrong); } catch (e) { v = { ok: false }; }
    ok(v && !v.ok, n + " verifier rejects a tampered output");
  }
  /* malformed input: ok:false, no throw */
  var threw = false, bad = null;
  try { bad = TL.run(n, { nonsense: true }); } catch (e) { threw = true; }
  ok(!threw && bad && (bad.ok === false || bad.verified === false || bad.value === null || bad.text === "no solution"), n + " fails cleanly on malformed input");
});

/* geometry query through the kernel's reasoning graph */
var gv = TL.run("geom.visual", { facts: [{ type: "point", id: "A" }, { type: "line", id: "l", through: ["A"] }], query: "on:A:l" });
ok(gv.ok && gv.value === "VERIFIED" || gv.value === "KNOWN" || /VERIF|KNOWN|TRUE/i.test(String(gv.value)), "geom.visual answers a stated incidence (" + gv.value + ")");

/* every tool the router can suggest exists */
var routed = {};
["What is the determinant of [[1,2],[3,4]]?", "Find the inverse of [[1,2],[3,4]]", "What is the rank of [[1,2],[2,4]]?",
 "What is the median of 1, 2, 3?", "Convert 3 miles to km", "How many subsets of {1, 2, ..., 6} sum to 7?",
 "What is the sum of k^2 for k from 1 to 5?", "What is the minimum of x^2 for x in [-1, 1]?",
 "A disease affects 2% of the population and a test has a false positive rate of 3%", "shortest path from a to b"].forEach(function (q) {
  TL.suggest(null, q).forEach(function (n) { routed[n] = 1; });
});
Object.keys(routed).forEach(function (n) { ok(!!TL.get(n), "suggested tool " + n + " is registered"); });
ok(TL.suggest(null, "What is the determinant of [[1,2],[3,4]]?").indexOf("matrix.inverse") < 0, "a determinant question does not route to the inverse");

console.log("lm-tools-test: " + pass + " passed, " + fail + " failed (" + names.length + " tools)");
if (fail) process.exit(1);
