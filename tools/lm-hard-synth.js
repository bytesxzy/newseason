/* Generated hard-computation questions for the language stack, CLOSED mode
 * (no network). Every question is produced from a seeded template with
 * random numbers; every answer is computed HERE, independently of the
 * stack's tools (plain JavaScript arithmetic / enumeration).
 *
 *   node tools/lm-hard-synth.js [--n 12] [--seed 5] [--out FILE]
 *
 * Families: determinant, rank, median, mean, variance, Bayes posterior,
 * power sums, quadratic minimum on an interval, subset-sum counts, rational
 * equations, unit conversion, and a plain-arithmetic control.
 *
 * This measures whether hard computations are READ and VERIFIED correctly.
 * It is not HLE and no HLE question is used: actual HLE was not run.
 */
"use strict";
var path = require("path"), fs = require("fs");
var RT = require("./lm-runtime.js");

var args = process.argv.slice(2);
function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
var N = +arg("n", 12), SEED = +arg("seed", 5), OUT = arg("out", "");

function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
var R = rng(SEED);
function ri(a, b) { return a + Math.floor(R() * (b - a + 1)); }

function det(A) {
  if (A.length === 1) return A[0][0];
  var s = 0;
  for (var j = 0; j < A.length; j++) {
    var minor = A.slice(1).map(function (r) { return r.filter(function (_, k) { return k !== j; }); });
    s += (j % 2 ? -1 : 1) * A[0][j] * det(minor);
  }
  return s;
}
function rank(A) {
  var M = A.map(function (r) { return r.slice(); }), rows = M.length, cols = M[0].length, rk = 0;
  for (var c = 0; c < cols && rk < rows; c++) {
    var p = -1;
    for (var r = rk; r < rows; r++) if (Math.abs(M[r][c]) > 1e-9) { p = r; break; }
    if (p < 0) continue;
    var t = M[p]; M[p] = M[rk]; M[rk] = t;
    for (r = 0; r < rows; r++) if (r !== rk) { var f = M[r][c] / M[rk][c]; for (var k = c; k < cols; k++) M[r][k] -= f * M[rk][k]; }
    rk++;
  }
  return rk;
}
function mat(n) { var A = []; for (var i = 0; i < n; i++) { var row = []; for (var j = 0; j < n; j++) row.push(ri(-4, 9)); A.push(row); } return A; }
function lit(A) { return "[" + A.map(function (r) { return "[" + r.join(",") + "]"; }).join(",") + "]"; }
function list(k) { var a = []; for (var i = 0; i < k; i++) a.push(ri(1, 30)); return a; }

var FAM = {
  determinant: function () { var A = mat(ri(2, 3)); return { q: "What is the determinant of " + lit(A) + "?", a: det(A) }; },
  rank: function () {
    var A = mat(3);
    if (R() < 0.5) { var m = ri(2, 3); A[2] = A[0].map(function (x, j) { return x * m + A[1][j]; }); }
    return { q: "What is the rank of " + lit(A) + "?", a: rank(A) };
  },
  median: function () { var a = list(ri(5, 9)), s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
    return { q: "What is the median of " + a.join(", ") + "?", a: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 }; },
  mean: function () { var a = list(ri(4, 8)); return { q: "What is the mean of " + a.join(", ") + "?", a: a.reduce(function (x, y) { return x + y; }, 0) / a.length }; },
  variance: function () { var a = list(ri(4, 8)), m = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
    return { q: "What is the variance of " + a.join(", ") + "?", a: a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / a.length }; },
  bayes: function () {
    var p = ri(1, 10), s = ri(80, 99), f = ri(2, 12);
    return { q: "A condition affects " + p + "% of the population. A test detects " + s + "% of cases and has a false positive rate of " + f +
             "%. If a person tests positive, what is the probability they have the condition?", a: p * s / (p * s + (100 - p) * f) };
  },
  power_sum: function () { var k = ri(1, 3), n = ri(5, 30), s = 0; for (var i = 1; i <= n; i++) s += Math.pow(i, k);
    return { q: "What is the sum of i^" + k + " for i from 1 to " + n + "?", a: s }; },
  quad_min: function () {
    var a = ri(1, 3), b = ri(-10, 10), c = ri(-5, 5), lo = ri(-6, 0), hi = ri(1, 7);
    var f = function (x) { return a * x * x + b * x + c; }, xv = -b / (2 * a), cand = [f(lo), f(hi)];
    if (xv > lo && xv < hi) cand.push(f(xv));
    var expr = a + "x^2 " + (b < 0 ? "- " + (-b) : "+ " + b) + "x " + (c < 0 ? "- " + (-c) : "+ " + c);
    return { q: "What is the minimum of " + expr.replace(/^1x/, "x") + " for x in [" + lo + ", " + hi + "]?", a: Math.min.apply(null, cand) };
  },
  subset_count: function () {
    var n = ri(6, 12), s = ri(n, 3 * n), dp = [1]; for (var t = 1; t <= s; t++) dp.push(0);
    for (var i = 1; i <= n; i++) for (var v = s; v >= i; v--) dp[v] += dp[v - i];
    return { q: "How many subsets of {1, 2, ..., " + n + "} sum to " + s + "?", a: dp[s] };
  },
  rational: function () {
    var a = ri(1, 9), b = ri(1, 9), c = ri(2, 6);
    /* (x + a) / (x - b) = c  ->  x = (a + b c) / (c - 1) */
    return { q: "Solve (x+" + a + ")/(x-" + b + ") = " + c, a: (a + b * c) / (c - 1) };
  },
  unit_convert: function () {
    var U = [["km", "m", 1000], ["m", "cm", 100], ["kg", "g", 1000], ["h", "min", 60], ["min", "s", 60]], u = U[ri(0, U.length - 1)], v = ri(2, 40);
    return { q: "Convert " + v + " " + u[0] + " to " + u[1], a: v * u[2] };
  },
  control_arith: function () { var x = ri(12, 99), y = ri(12, 99); return { q: "What is " + x + " * " + y + "?", a: x * y }; }
};

/* The stated value: the first number after the first "=", "is", "equals",
   "comes to" or "works out to" when the answer has one ("37 * 55 = 2035",
   "The minimum value is -3"), else its first number ("5000 m"). */
function firstNumber(t) {
  t = String(t).replace(/,(?=\d{3}\b)/g, "");
  var mk = t.match(/(?:=|\bis\b|\bequals\b|\bcomes to\b|\bworks out to\b)/i);
  if (mk) t = t.slice(mk.index + mk[0].length);
  var m = t.match(/-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?/);
  if (!m) return null;
  var s = m[0].replace(/\s+/g, "");
  if (s.indexOf("/") > 0) { var p = s.split("/"); return +p[0] / +p[1]; }
  return +s;
}
function close(x, y) { return x !== null && isFinite(x) && Math.abs(x - y) <= 1e-3 * Math.max(1, Math.abs(y)); }

var items = [];
Object.keys(FAM).forEach(function (f) { for (var i = 0; i < N; i++) { var it = FAM[f](); it.family = f; items.push(it); } });

var win = RT.boot({});
if (win.C4LM && win.C4LM.setMode) win.C4LM.setMode("closed");
var res = { total: 0, correct: 0, byFamily: {}, failures: [] };
(async function () {
  for (var i = 0; i < items.length; i++) {
    var it = items[i], r = await RT.askOnce(win, it.q, 20000), v = firstNumber(r.text);
    /* an answer that states the value anywhere counts only if its FIRST
       number is the value: "2 - 4 is -2 ... the minimum is -3" is wrong */
    var ok = close(v, it.a);
    var fb = res.byFamily[it.family] || (res.byFamily[it.family] = { n: 0, correct: 0 });
    fb.n++; res.total++;
    if (ok) { fb.correct++; res.correct++; } else if (res.failures.length < 40) res.failures.push({ family: it.family, q: it.q, expected: it.a, got: String(r.text).slice(0, 120) });
  }
  res.accuracy = Math.round(res.correct / res.total * 1000) / 1000;
  var report = { note: "generated hard-computation questions, closed mode (no network); answers computed independently by the generator. Not HLE: actual HLE was not run.",
                 seed: SEED, per_family: N, mode: win.C4LM && win.C4LM.mode ? win.C4LM.mode() : "unknown", result: res };
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("lm-hard-synth: " + res.correct + "/" + res.total + " (" + Math.round(res.accuracy * 1000) / 10 + "%)");
  Object.keys(res.byFamily).forEach(function (f) { console.log("  " + f.padEnd(14) + res.byFamily[f].correct + "/" + res.byFamily[f].n); });
  process.exit(0);
})();
