/* Synthetic, internally verifiable reasoning problems (HLE-STYLE PRACTICE,
 * NOT HLE).
 *
 *   node tools/reason-synth.js [--n 300] [--seed 3] [--root DIR] [--out FILE]
 *
 * Every problem is generated FROM its answer (roots chosen before the
 * polynomial is expanded, a solution chosen before the system is written,
 * ...), so the answer is known without trusting any solver. Families:
 * linear and quadratic equations, 2x2 systems, derivatives at a point,
 * definite integrals, binomial coefficients, gcd/lcm, modular powers,
 * primality, dice and coin probabilities, series sums, shortest paths,
 * multiple choice, and plain arithmetic as a control.
 *
 * Measured through the SHIPPING page pipeline (tools/lm-runtime.js) of the
 * workspace given by --root, so the same file measures the baseline archive
 * and the upgraded one:
 *   accuracy          first sentence of the answer states the right value(s)
 *   coverage          the system gave a value at all
 *   Brier / ECE       of the reported confidence against correctness
 *   wrong_confident   wrong answers reported with confidence >= 0.9
 *
 * A second part tests derivation checking directly (c4-lm-problem.js):
 * correct chains must pass, chains with one corrupted step must be caught
 * at that step.
 */
"use strict";
var path = require("path"), fs = require("fs");

function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function ri(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
function nz(r, a, b) { var v; do { v = ri(r, a, b); } while (!v); return v; }
function sgn(v) { return v < 0 ? " - " + (-v) : " + " + v; }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
function frac(n, d) { var g = gcd(n, d) || 1; n /= g; d /= g; if (d < 0) { n = -n; d = -d; } return d === 1 ? String(n) : n + "/" + d; }
function choose(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
function modpow(b, e, m) { var r = 1n, B = BigInt(b) % BigInt(m), E = BigInt(e), M = BigInt(m); while (E > 0n) { if (E & 1n) r = r * B % M; B = B * B % M; E >>= 1n; } return Number(r); }
function isPrime(n) { if (n < 2) return false; for (var p = 2; p * p <= n; p++) if (n % p === 0) return false; return true; }

/* Paraphrased phrasings of the same families, written AFTER the parser and
   deliberately not matched to it: a generalisation probe, expected to be
   harder. */
var PARA = {
  linear: function (A, B, C) { return ["Find x if " + A + "x" + sgn(B) + " = " + C, "What value of x satisfies " + A + "x" + sgn(B) + " = " + C + "?", "If " + A + "x" + sgn(B) + " equals " + C + ", what is x?"]; },
  quadratic: function (b, c) { return ["Find the roots of x^2" + sgn(b) + "x" + sgn(c), "What are the solutions of x^2" + sgn(b) + "x" + sgn(c) + " = 0?", "For which x is x^2" + sgn(b) + "x" + sgn(c) + " zero?"]; },
  choose: function (N, K) { return ["Compute C(" + N + ", " + K + ")", "How many ways can you choose " + K + " items from " + N + "?", "In how many ways can a committee of " + K + " be picked from " + N + " people?"]; },
  gcd: function (a, b) { return ["What's the greatest common divisor of " + a + " and " + b + "?", "Find the highest common factor of " + a + " and " + b, "gcd(" + a + ", " + b + ") = ?"]; },
  dice: function (s, nd) { return ["If you roll " + nd + " dice, what's the chance the total is " + s + "?", "Two fair dice are thrown. What is the probability that the sum equals " + s + "?".replace("Two", nd === 2 ? "Two" : "Three")]; },
  coins: function (k, n) { return ["A fair coin is tossed " + n + " times. What is the probability of exactly " + k + " heads?", "Probability of exactly " + k + " heads when flipping a coin " + n + " times?"]; },
  deriv: function (c3, c2, c1, x0) { return ["Differentiate " + c3 + "x^3" + sgn(c2) + "x^2" + sgn(c1) + "x and evaluate at x = " + x0, "f(x) = " + c3 + "x^3" + sgn(c2) + "x^2" + sgn(c1) + "x. What is f'(" + x0 + ")?"]; }
};
function generateParaphrased(n, seed) {
  var r = rng(seed), out = [], fams = Object.keys(PARA);
  for (var i = 0; i < n; i++) {
    var f = fams[i % fams.length], qs, a;
    if (f === "linear") { var x = ri(r, -9, 9), A = nz(r, -7, 7), B = ri(r, -20, 20); qs = PARA.linear(A, B, A * x + B); a = [x]; }
    else if (f === "quadratic") { var r1 = ri(r, -8, 8), r2 = ri(r, -8, 8); qs = PARA.quadratic(-(r1 + r2), r1 * r2); a = r1 === r2 ? [r1] : [r1, r2]; }
    else if (f === "choose") { var N = ri(r, 5, 25), K = ri(r, 1, N - 1); qs = PARA.choose(N, K); a = [choose(N, K)]; }
    else if (f === "gcd") { var g = ri(r, 2, 30), u = ri(r, 2, 20), v = u + 1; qs = PARA.gcd(g * u, g * v); a = [g]; }
    else if (f === "dice") { var nd = 2, s = ri(r, 2, 12), hits = 0; for (var d1 = 1; d1 <= 6; d1++) for (var d2 = 1; d2 <= 6; d2++) if (d1 + d2 === s) hits++; qs = PARA.dice(s, nd); a = [hits / 36]; }
    else if (f === "coins") { var nc = ri(r, 2, 8), kc = ri(r, 0, nc); qs = PARA.coins(kc, nc); a = [choose(nc, kc) / Math.pow(2, nc)]; }
    else { var c3 = nz(r, -3, 3), c2 = ri(r, -5, 5), c1 = ri(r, -9, 9), x0 = ri(r, -3, 3); qs = PARA.deriv(c3, c2, c1, x0); a = [3 * c3 * x0 * x0 + 2 * c2 * x0 + c1]; }
    out.push({ id: i, family: f + "~", q: qs[ri(r, 0, qs.length - 1)], answer: a });
  }
  return out;
}

/* HELD-OUT phrasings, written after the parser was frozen and never used
   to change it. Includes forms outside the parser's design (prose word
   problems, "a pair of dice", definitions by description). */
function generateHeldout(n, seed) {
  var r = rng(seed), out = [];
  var fams = ["linear", "quadratic", "choose", "gcd", "dice", "coins", "deriv", "integral"];
  for (var i = 0; i < n; i++) {
    var f = fams[i % fams.length], qs, a;
    if (f === "linear") { var x = ri(r, 1, 9), A = ri(r, 2, 7), B = ri(r, 1, 20), C = A * x + B;
      qs = ["Determine x: " + A + "x + " + B + " = " + C, "Given " + A + "x + " + B + " = " + C + ", x equals what?",
            A + " times a number plus " + B + " is " + C + ". What is the number?"]; a = [x]; }
    else if (f === "quadratic") { var r1 = ri(r, -6, 6), r2 = ri(r, -6, 6);
      qs = ["Zeros of the polynomial x^2" + sgn(-(r1 + r2)) + "x" + sgn(r1 * r2) + "?", "Factor and solve: x^2" + sgn(-(r1 + r2)) + "x" + sgn(r1 * r2) + " = 0"]; a = r1 === r2 ? [r1] : [r1, r2]; }
    else if (f === "choose") { var N = ri(r, 6, 20), K = ri(r, 2, 5);
      qs = ["How many " + K + "-element subsets does a " + N + "-element set have?", "Number of combinations of " + N + " things taken " + K + " at a time",
            "From " + N + " students, how many ways to select a team of " + K + "?"]; a = [choose(N, K)]; }
    else if (f === "gcd") { var g = ri(r, 2, 24), u = ri(r, 2, 15), v = u + 1;
      qs = ["Largest integer dividing both " + g * u + " and " + g * v + "?", "GCD(" + g * u + "," + g * v + ")", "What is the greatest common factor of " + g * u + " and " + g * v]; a = [g]; }
    else if (f === "dice") { var s = ri(r, 2, 12), hits = 0; for (var d1 = 1; d1 <= 6; d1++) for (var d2 = 1; d2 <= 6; d2++) if (d1 + d2 === s) hits++;
      qs = ["Rolling a pair of dice, probability the numbers add to " + s + "?", "Chance that two dice show a total of " + s]; a = [hits / 36]; }
    else if (f === "coins") { var nc = ri(r, 2, 7), kc = ri(r, 0, nc);
      qs = ["Flip " + nc + " coins. Chance of exactly " + kc + " heads?", "Probability of " + kc + " tails in " + nc + " tosses of a fair coin"]; a = [choose(nc, kc) / Math.pow(2, nc)]; }
    else if (f === "deriv") { var c2 = ri(r, 1, 4), c1 = ri(r, -5, 5), x0 = ri(r, -2, 3);
      qs = ["Slope of the tangent to y = " + c2 + "x^2" + sgn(c1) + "x at x = " + x0, "d/dx (" + c2 + "x^2" + sgn(c1) + "x) at x = " + x0,
            "Find g'(" + x0 + ") for g(x) = " + c2 + "x^2" + sgn(c1) + "x"]; a = [2 * c2 * x0 + c1]; }
    else { var k = ri(r, 1, 3), lo = ri(r, 0, 2), hi = lo + ri(r, 1, 3);
      qs = ["Area under y = " + k + "x^2 from " + lo + " to " + hi, "Integrate " + k + "x^2 between " + lo + " and " + hi]; a = [k * (hi * hi * hi - lo * lo * lo) / 3]; }
    out.push({ id: i, family: f + "!", q: qs[ri(r, 0, qs.length - 1)], answer: a });
  }
  return out;
}

function generate(n, seed) {
  var r = rng(seed), out = [], fams = ["linear", "quadratic", "system", "deriv", "integral", "choose", "gcd", "lcm",
    "modpow", "prime", "dice", "coins", "series", "path", "mc", "arith"];
  for (var i = 0; i < n; i++) {
    var f = fams[i % fams.length], q, a;
    if (f === "linear") { var x = ri(r, -9, 9), A = nz(r, -7, 7), B = ri(r, -20, 20); q = "Solve " + A + "x" + sgn(B) + " = " + (A * x + B); a = [x]; }
    else if (f === "quadratic") { var r1 = ri(r, -8, 8), r2 = ri(r, -8, 8); q = "Solve x^2" + sgn(-(r1 + r2)) + "x" + sgn(r1 * r2) + " = 0"; a = r1 === r2 ? [r1] : [r1, r2]; }
    else if (f === "system") { var X = ri(r, -6, 6), Y = ri(r, -6, 6), a1 = nz(r, -4, 4), b1 = nz(r, -4, 4), a2 = nz(r, -4, 4), b2 = nz(r, -4, 4);
      if (a1 * b2 - a2 * b1 === 0) { b2 += 1; if (!b2) b2 = 2; if (a1 * b2 - a2 * b1 === 0) { i--; continue; } }
      q = "Solve " + a1 + "x" + sgn(b1) + "y = " + (a1 * X + b1 * Y) + ", " + a2 + "x" + sgn(b2) + "y = " + (a2 * X + b2 * Y); a = [X, Y]; }
    else if (f === "deriv") { var c3 = nz(r, -3, 3), c2 = ri(r, -5, 5), c1 = ri(r, -9, 9), x0 = ri(r, -3, 3);
      q = "What is the derivative of " + c3 + "x^3" + sgn(c2) + "x^2" + sgn(c1) + "x at x = " + x0; a = [3 * c3 * x0 * x0 + 2 * c2 * x0 + c1]; }
    else if (f === "integral") { var k1 = ri(r, 1, 4), k0 = ri(r, -5, 5), lo = ri(r, 0, 2), hi = lo + ri(r, 1, 3);
      q = "Integral of " + k1 + "x^2" + sgn(k0) + " from " + lo + " to " + hi;
      var num = k1 * (hi * hi * hi - lo * lo * lo) + 3 * k0 * (hi - lo); a = [num / 3]; a.frac = frac(num, 3); }
    else if (f === "choose") { var N = ri(r, 5, 25), Kk = ri(r, 1, N - 1); q = "What is " + N + " choose " + Kk + "?"; a = [choose(N, Kk)]; }
    else if (f === "gcd") { var g = ri(r, 2, 30), u = ri(r, 2, 20), v = ri(r, 2, 20); if (gcd(u, v) !== 1) v = u + 1; q = "What is the gcd of " + g * u + " and " + g * v + "?"; a = [g]; }
    else if (f === "lcm") { var p1 = ri(r, 2, 30), p2 = ri(r, 2, 30); q = "What is the lcm of " + p1 + " and " + p2 + "?"; a = [p1 * p2 / gcd(p1, p2)]; }
    else if (f === "modpow") { var bb = ri(r, 2, 30), ee = ri(r, 20, 400), mm = ri(r, 3, 60); q = "What is " + bb + "^" + ee + " mod " + mm + "?"; a = [modpow(bb, ee, mm)]; }
    else if (f === "prime") { var pn = ri(r, 50, 5000); q = "Is " + pn + " prime?"; a = [isPrime(pn) ? "yes" : "no"]; a.word = true; }
    else if (f === "dice") { var nd = ri(r, 2, 3), s = ri(r, nd, 6 * nd), hits = 0, tot = Math.pow(6, nd);
      for (var t = 0; t < tot; t++) { var ss = nd, xx = t; for (var j = 0; j < nd; j++) { ss += xx % 6; xx = Math.floor(xx / 6); } if (ss === s) hits++; }
      q = "What is the probability of rolling a sum of " + s + " with " + (nd === 2 ? "two" : "three") + " dice?"; a = [hits / tot]; a.frac = frac(hits, tot); }
    else if (f === "coins") { var nc = ri(r, 2, 8), kc = ri(r, 0, nc); q = "What is the probability of getting exactly " + kc + " heads in " + nc + " coin flips?"; a = [choose(nc, kc) / Math.pow(2, nc)]; a.frac = frac(choose(nc, kc), Math.pow(2, nc)); }
    else if (f === "series") { var ns = ri(r, 5, 200), kind = ["odd numbers", "positive integers", "squares"][ri(r, 0, 2)];
      q = "What is the sum of the first " + ns + " " + kind + "?"; a = [kind === "odd numbers" ? ns * ns : kind === "squares" ? ns * (ns + 1) * (2 * ns + 1) / 6 : ns * (ns + 1) / 2]; }
    else if (f === "path") { var w = [ri(r, 1, 9), ri(r, 1, 9), ri(r, 1, 9), ri(r, 1, 9), ri(r, 1, 20)];
      q = "Shortest path from A to D with edges A-B " + w[0] + ", B-C " + w[1] + ", C-D " + w[2] + ", B-D " + w[3] + ", A-D " + w[4];
      a = [Math.min(w[4], w[0] + w[3], w[0] + w[1] + w[2])]; }
    else if (f === "mc") { var xm = ri(r, -9, 9), Am = nz(r, 2, 7), Bm = ri(r, -20, 20), opts = [xm, xm + 1, xm - 2, xm + 3];
      var perm = opts.slice().sort(function () { return r() - 0.5; }), lab = ["A", "B", "C", "D"];
      q = "Solve " + Am + "x" + sgn(Bm) + " = " + (Am * xm + Bm) + ". " + perm.map(function (o, k) { return "(" + lab[k] + ") " + o; }).join(" ");
      a = [xm]; a.label = lab[perm.indexOf(xm)]; }
    else { var p = ri(r, 11, 99), qv = ri(r, 11, 99); q = "What is " + p + " * " + qv + "?"; a = [p * qv]; }
    out.push({ id: i, family: f, q: q, answer: a });
  }
  return out;
}

/* numbers stated in the first sentence of an answer (fractions first) */
function statedNumbers(text) {
  var first = String(text).split(/(?<=[.!?])\s+(?=[A-Z(])/)[0] || "", out = [], m;
  var re = /(-?\d+)\s*\/\s*(\d+)|-?\d+(?:\.\d+)?/g;
  while ((m = re.exec(first))) out.push(m[1] !== undefined ? Number(m[1]) / Number(m[2]) : Number(m[0]));
  return { first: first, nums: out };
}
function correct(item, text) {
  var a = item.answer, st = statedNumbers(text);
  if (a.word) return new RegExp("^\\s*(?:\\(\\w\\)\\s*)?" + a[0] + "\\b", "i").test(st.first) || (a[0] === "no" ? /\bnot prime\b/i.test(st.first) : /\bis prime\b/i.test(st.first) && !/\bnot\b/i.test(st.first));
  if (!st.nums.length) return false;
  if (a.length === 1) {
    var last = st.nums[st.nums.length - 1];
    return Math.abs(last - a[0]) <= 1e-6 * Math.max(1, Math.abs(a[0])) ||
           st.nums.some(function (v) { return Math.abs(v - a[0]) < 1e-9; }) && st.nums.length <= 2;
  }
  return a.every(function (v) { return st.nums.some(function (x) { return Math.abs(x - v) < 1e-9; }); }) && st.nums.length <= a.length + 1;
}

function metrics(rows) {
  var n = rows.length, acc = 0, cov = 0, brier = 0, wc = 0, bins = [];
  for (var b = 0; b < 10; b++) bins.push({ n: 0, conf: 0, acc: 0 });
  rows.forEach(function (x) {
    if (x.correct) acc++;
    if (x.answered) cov++;
    var c = typeof x.conf === "number" ? x.conf : 0.5;
    brier += Math.pow(c - (x.correct ? 1 : 0), 2);
    if (!x.correct && c >= 0.9 && x.answered) wc++;
    var bin = bins[Math.min(9, Math.floor(c * 10))]; bin.n++; bin.conf += c; bin.acc += x.correct ? 1 : 0;
  });
  var ece = 0;
  bins.forEach(function (bn) { if (bn.n) ece += bn.n / n * Math.abs(bn.conf / bn.n - bn.acc / bn.n); });
  return { n: n, accuracy: acc / n, coverage: cov / n, brier: brier / n, ece: ece, wrong_confident: wc };
}

async function evalPipeline(root, items) {
  var rt = require(path.join(root, "tools", "lm-runtime.js")), rows = [];
  for (var i = 0; i < items.length; i++) {
    var win = rt.boot({}), a = await rt.askOnce(win, items[i].q, 20000);
    var conf = a.raw && a.raw.lm ? a.raw.lm.confidence : undefined;
    var ok = correct(items[i], a.text || "");
    rows.push({ id: items[i].id, family: items[i].family, q: items[i].q, text: (a.text || "").slice(0, 200),
                answered: !!a.text && !/^i (?:don't|do not|could not)/i.test(a.text), correct: ok, conf: conf });
  }
  return rows;
}

/* derivation checking: expansions and arithmetic chains, correct vs. one
   corrupted step */
function derivationItems(n, seed) {
  var r = rng(seed), out = [];
  for (var i = 0; i < n; i++) {
    var steps, bad = null;
    if (i % 2) {
      var a = ri(r, -6, 6), b = ri(r, -6, 6);
      steps = ["(x" + sgn(a) + ")(x" + sgn(b) + ")", "x^2" + sgn(a) + "x" + sgn(b) + "x" + sgn(a * b), "x^2" + sgn(a + b) + "x" + sgn(a * b)];
    } else {
      var p = ri(r, 2, 30), q = ri(r, 2, 30), s = ri(r, 1, 50);
      steps = [p + " * " + q + " + " + s, (p * q) + " + " + s, String(p * q + s)];
    }
    var corrupt = r() < 0.5;
    if (corrupt) {
      bad = ri(r, 1, steps.length - 1);
      steps[bad] = steps[bad].replace(/(\d+)(?!.*\d)/, function (m) { return String(Number(m) + ri(r, 1, 3)); });
    }
    out.push({ steps: steps, corrupt: corrupt, bad: bad });
  }
  return out;
}

async function main() {
  var args = process.argv.slice(2);
  function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
  var n = +arg("n", 256), seed = +arg("seed", 3), root = path.resolve(arg("root", path.join(__dirname, "..")));
  var items = args.indexOf("--heldout") >= 0 ? generateHeldout(n, seed) :
              args.indexOf("--paraphrase") >= 0 ? generateParaphrased(n, seed) : generate(n, seed);
  var rows = await evalPipeline(root, items);
  var byFam = {};
  rows.forEach(function (x) { var f = byFam[x.family] || (byFam[x.family] = []); f.push(x); });
  var report = { note: "synthetic verifiable problems; practice for HLE-style reasoning, NOT an HLE score",
                 root: root, seed: seed, overall: metrics(rows), by_family: {} };
  Object.keys(byFam).forEach(function (f) { report.by_family[f] = metrics(byFam[f]); });
  var PR = null;
  try { PR = require(path.join(root, "c4-lm-problem.js")); } catch (e) { PR = null; }
  if (PR) {
    var ds = derivationItems(200, seed + 1), tp = 0, fp = 0, loc = 0, nc = 0, ncor = 0;
    ds.forEach(function (d) {
      var c = PR.checkDerivation(d.steps);
      if (d.corrupt) { nc++; if (!c.valid) { tp++; if (c.firstInvalid === d.bad) loc++; } }
      else { ncor++; if (!c.valid) fp++; }
    });
    report.derivation_check = { corrupted: nc, detected: tp, localized: loc, correct_chains: ncor, false_alarms: fp };
  } else report.derivation_check = "not available in this workspace";
  report.samples_wrong = rows.filter(function (x) { return !x.correct; }).slice(0, 12);
  var out = arg("out", "");
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ overall: report.overall, derivation_check: report.derivation_check,
    by_family: Object.keys(report.by_family).map(function (f) { var m = report.by_family[f]; return f + ":" + m.accuracy.toFixed(2); }).join(" ") }, null, 1));
}

module.exports = { generate: generate, generateParaphrased: generateParaphrased, correct: correct, metrics: metrics, derivationItems: derivationItems };
if (require.main === module) main();
