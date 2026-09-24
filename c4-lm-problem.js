/* CELL4 problem reasoner: explicit problems, independent derivations,
 * falsification, calibrated confidence.
 *
 * c4-lm-reason.js stays the fast operator library for everyday questions.
 * This module is the reasoning ARCHITECTURE for problems that must be
 * derived and checked, built on the shared kernel (c4-reason-kernel.js):
 *
 *   PERCEIVE   text -> Problem { domain, givens, unknowns, equations,
 *              constraints, assumptions, requiredKnowledge, candidateAnswers }
 *   PROPOSE    several GENUINELY DIFFERENT derivations per problem kind --
 *              quadratic formula vs. rational roots vs. numeric root finding;
 *              elimination vs. Cramer's rule; multiplicative binomial vs.
 *              Pascal's triangle; enumeration vs. closed form; symbolic vs.
 *              numeric calculus -- each an independent hypothesis
 *   VERIFY /   every candidate answer is attacked with the checks relevant to
 *   FALSIFY    the problem: substitution, reverse derivation, numeric
 *              differentiation/integration, bounds, sign, magnitude, parity,
 *              multiple-choice elimination
 *   DIAGNOSE   a derivation that fails is labelled in the kernel's FAILURE
 *              vocabulary (arithmetic error, bad inference, misinterpretation,
 *              missing knowledge, ambiguity, contradiction ...) and removed
 *   SELECT     agreement between independent derivations plus verifier pass
 *              rate, contradiction count and assumption burden become a
 *              calibrated confidence (kernel.calibrate), never a constant
 *
 * Knowledge is kept apart from reasoning: a question whose answer is a fact
 * this module cannot derive is reported as MISSING_KNOWLEDGE with low
 * confidence rather than answered. Exact arithmetic is BigInt rational.
 * Deterministic, local, no network, no external model.
 */
(function (root) {
  "use strict";

  var K = root.C4ReasonKernel;
  if (!K && typeof require === "function") { try { K = require("./c4-reason-kernel.js"); } catch (e) { K = null; } }
  var FAIL = K ? K.FAILURE : {};

  /* ============================================================ rationals */

  function bgcd(a, b) { if (a < 0n) a = -a; if (b < 0n) b = -b; while (b) { var t = a % b; a = b; b = t; } return a; }
  function Frac(n, d) {
    if (d === undefined) d = 1n;
    if (d === 0n) throw new Error("division by zero");
    if (d < 0n) { n = -n; d = -d; }
    var g = bgcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  Frac.of = function (x) {
    if (x instanceof Frac) return x;
    if (typeof x === "bigint") return new Frac(x, 1n);
    var s = String(x).trim();
    var m = s.match(/^([-+]?)(\d*)(?:\.(\d+))?(?:e([-+]?\d+))?$/i);
    if (!m || (m[2] === "" && !m[3])) {
      if (typeof x === "number" && isFinite(x)) return Frac.of(x.toPrecision(15));
      return null;
    }
    var digits = (m[2] || "0") + (m[3] || ""), den = 10n ** BigInt((m[3] || "").length);
    var num = BigInt(digits) * (m[1] === "-" ? -1n : 1n);
    if (m[4]) { var e = parseInt(m[4], 10); if (e >= 0) num *= 10n ** BigInt(e); else den *= 10n ** BigInt(-e); }
    return new Frac(num, den);
  };
  Frac.prototype.add = function (o) { o = Frac.of(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); };
  Frac.prototype.sub = function (o) { o = Frac.of(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); };
  Frac.prototype.mul = function (o) { o = Frac.of(o); return new Frac(this.n * o.n, this.d * o.d); };
  Frac.prototype.div = function (o) { o = Frac.of(o); return new Frac(this.n * o.d, this.d * o.n); };
  Frac.prototype.neg = function () { return new Frac(-this.n, this.d); };
  Frac.prototype.isZero = function () { return this.n === 0n; };
  Frac.prototype.isInt = function () { return this.d === 1n; };
  Frac.prototype.cmp = function (o) { o = Frac.of(o); var l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; };
  Frac.prototype.eq = function (o) { return this.cmp(o) === 0; };
  Frac.prototype.pow = function (k) {
    if (k < 0) return new Frac(1n, 1n).div(this.pow(-k));
    var r = new Frac(1n, 1n), b = this;
    while (k > 0) { if (k & 1) r = r.mul(b); b = b.mul(b); k >>= 1; }
    return r;
  };
  Frac.prototype.toNumber = function () { return Number(this.n) / Number(this.d); };
  Frac.prototype.toString = function () { return this.d === 1n ? this.n.toString() : this.n.toString() + "/" + this.d.toString(); };
  function F(x) { return Frac.of(x); }
  var ZERO = new Frac(0n), ONE = new Frac(1n);

  /* ========================================================== expressions */

  var FUNCS = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10,
                exp: Math.exp, abs: Math.abs };

  function tokenize(s) {
    var t = [], i = 0, m;
    s = String(s).replace(/×|⋅/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\*\*/g, "^");
    while (i < s.length) {
      var ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if ((m = /^\d+(?:\.\d+)?|^\.\d+/.exec(s.slice(i)))) { t.push({ k: "num", v: m[0] }); i += m[0].length; continue; }
      if ((m = /^[a-zA-Z_]+/.exec(s.slice(i)))) {
        var w = m[0];
        if (FUNCS[w.toLowerCase()] || w.toLowerCase() === "pi" || w === "e") t.push({ k: FUNCS[w.toLowerCase()] ? "fn" : "const", v: w.toLowerCase() });
        else for (var j = 0; j < w.length; j++) t.push({ k: "var", v: w[j] });   /* "xy" is x*y */
        i += w.length; continue;
      }
      if ("+-*/^(),!".indexOf(ch) >= 0) { t.push({ k: "op", v: ch }); i++; continue; }
      return null;
    }
    /* implicit multiplication: 2x, 3(x+1), (x+1)(x-1), x(x+1), 2 sin x */
    var out = [];
    for (i = 0; i < t.length; i++) {
      var a = out[out.length - 1], b = t[i];
      if (a && (a.k === "num" || a.k === "var" || a.k === "const" || (a.k === "op" && (a.v === ")" || a.v === "!"))) &&
          (b.k === "num" || b.k === "var" || b.k === "const" || b.k === "fn" || (b.k === "op" && b.v === "(")))
        out.push({ k: "op", v: "*" });
      out.push(b);
    }
    return out;
  }

  /* precedence climbing: + - < * / < unary - < ^ (right assoc) < ! */
  function parseExpr(src) {
    var toks = tokenize(src);
    if (!toks || !toks.length) return null;
    var i = 0;
    function peek() { return toks[i]; }
    function eat(v) { if (toks[i] && toks[i].k === "op" && toks[i].v === v) { i++; return true; } return false; }
    function primary() {
      var t = toks[i++];
      if (!t) throw new Error("eof");
      if (t.k === "num") return { t: "num", v: F(t.v) };
      if (t.k === "var") return { t: "var", n: t.v };
      if (t.k === "const") return { t: "const", n: t.v };
      if (t.k === "fn") {
        var arg;
        if (eat("(")) { arg = sum(); if (!eat(")")) throw new Error(")"); }
        else arg = power();
        return { t: "fn", f: t.v, a: arg };
      }
      if (t.k === "op" && t.v === "(") { var e = sum(); if (!eat(")")) throw new Error(")"); return e; }
      if (t.k === "op" && t.v === "-") return { t: "neg", a: unary() };
      if (t.k === "op" && t.v === "+") return unary();
      throw new Error("unexpected " + t.v);
    }
    function postfix() { var e = primary(); while (eat("!")) e = { t: "fact", a: e }; return e; }
    function power() {
      var base = postfix();
      if (eat("^")) return { t: "op", o: "^", a: base, b: unary() };
      return base;
    }
    function unary() { if (eat("-")) return { t: "neg", a: unary() }; if (eat("+")) return unary(); return power(); }
    function product() {
      var e = unary();
      for (;;) {
        if (eat("*")) e = { t: "op", o: "*", a: e, b: unary() };
        else if (eat("/")) e = { t: "op", o: "/", a: e, b: unary() };
        else return e;
      }
    }
    function sum() {
      var e = product();
      for (;;) {
        if (eat("+")) e = { t: "op", o: "+", a: e, b: product() };
        else if (eat("-")) e = { t: "op", o: "-", a: e, b: product() };
        else return e;
      }
    }
    try { var e = sum(); return i === toks.length ? e : null; } catch (err) { return null; }
  }

  function varsOf(e, acc) {
    acc = acc || {};
    if (!e) return acc;
    if (e.t === "var") acc[e.n] = 1;
    ["a", "b"].forEach(function (k) { if (e[k]) varsOf(e[k], acc); });
    return acc;
  }

  function factB(n) { var r = 1n; for (var i = 2n; i <= n; i++) r *= i; return r; }

  /* Exact evaluation; null when the value is not rational (sqrt of a
     non-square, trig, ...). */
  function evalExact(e, env) {
    switch (e.t) {
      case "num": return e.v;
      case "var": return env && env[e.n] !== undefined ? F(env[e.n]) : null;
      case "const": return null;
      case "neg": var a0 = evalExact(e.a, env); return a0 ? a0.neg() : null;
      case "fact": var f = evalExact(e.a, env); return f && f.isInt() && f.n >= 0n && f.n <= 500n ? new Frac(factB(f.n)) : null;
      case "fn":
        var x = evalExact(e.a, env);
        if (!x) return null;
        if (e.f === "abs") return x.cmp(ZERO) < 0 ? x.neg() : x;
        if (e.f === "sqrt" && x.cmp(ZERO) >= 0) { var sn = isqrt(x.n), sd = isqrt(x.d); return sn * sn === x.n && sd * sd === x.d ? new Frac(sn, sd) : null; }
        return null;
      case "op":
        var l = evalExact(e.a, env), r = evalExact(e.b, env);
        if (!l || !r) return null;
        if (e.o === "+") return l.add(r);
        if (e.o === "-") return l.sub(r);
        if (e.o === "*") return l.mul(r);
        if (e.o === "/") return r.isZero() ? null : l.div(r);
        if (e.o === "^") return r.isInt() && r.n >= -64n && r.n <= 256n ? l.pow(Number(r.n)) : null;
    }
    return null;
  }
  function isqrt(n) {
    if (n < 0n) return -1n;
    if (n < 2n) return n;
    var x = BigInt(Math.floor(Math.sqrt(Number(n)))), y;
    for (;;) { y = (x + n / x) >> 1n; if (y >= x) break; x = y; }
    while (x * x > n) x--;
    while ((x + 1n) * (x + 1n) <= n) x++;
    return x;
  }

  function evalFloat(e, env) {
    switch (e.t) {
      case "num": return e.v.toNumber();
      case "var": return env && env[e.n] !== undefined ? env[e.n] : NaN;
      case "const": return e.n === "pi" ? Math.PI : Math.E;
      case "neg": return -evalFloat(e.a, env);
      case "fact": var n = evalFloat(e.a, env), r = 1; for (var i = 2; i <= n; i++) r *= i; return r;
      case "fn": return FUNCS[e.f](evalFloat(e.a, env));
      case "op":
        var l = evalFloat(e.a, env), rr = evalFloat(e.b, env);
        return e.o === "+" ? l + rr : e.o === "-" ? l - rr : e.o === "*" ? l * rr : e.o === "/" ? l / rr : Math.pow(l, rr);
    }
    return NaN;
  }

  /* ========================================================== polynomials */

  function Poly(c) { this.c = c.map(F); this.trim(); }
  Poly.prototype.trim = function () { while (this.c.length > 1 && this.c[this.c.length - 1].isZero()) this.c.pop(); if (!this.c.length) this.c = [ZERO]; return this; };
  Poly.prototype.deg = function () { return this.c.length === 1 && this.c[0].isZero() ? -Infinity : this.c.length - 1; };
  Poly.prototype.add = function (o) { var n = Math.max(this.c.length, o.c.length), out = []; for (var i = 0; i < n; i++) out.push((this.c[i] || ZERO).add(o.c[i] || ZERO)); return new Poly(out); };
  Poly.prototype.neg = function () { return new Poly(this.c.map(function (x) { return x.neg(); })); };
  Poly.prototype.sub = function (o) { return this.add(o.neg()); };
  Poly.prototype.mul = function (o) {
    var out = [], i, j;
    for (i = 0; i < this.c.length + o.c.length - 1; i++) out.push(ZERO);
    for (i = 0; i < this.c.length; i++) for (j = 0; j < o.c.length; j++) out[i + j] = out[i + j].add(this.c[i].mul(o.c[j]));
    return new Poly(out);
  };
  Poly.prototype.pow = function (k) { var r = new Poly([ONE]); for (var i = 0; i < k; i++) r = r.mul(this); return r; };
  Poly.prototype.eval = function (x) { x = F(x); var r = ZERO; for (var i = this.c.length - 1; i >= 0; i--) r = r.mul(x).add(this.c[i]); return r; };
  Poly.prototype.evalF = function (x) { var r = 0; for (var i = this.c.length - 1; i >= 0; i--) r = r * x + this.c[i].toNumber(); return r; };
  Poly.prototype.deriv = function () { var out = []; for (var i = 1; i < this.c.length; i++) out.push(this.c[i].mul(i)); return new Poly(out.length ? out : [ZERO]); };
  Poly.prototype.integ = function () { var out = [ZERO]; for (var i = 0; i < this.c.length; i++) out.push(this.c[i].div(i + 1)); return new Poly(out); };
  Poly.prototype.eq = function (o) { var d = this.sub(o); return d.deg() === -Infinity; };
  Poly.prototype.toString = function (v) {
    v = v || "x";
    var parts = [], i;
    for (i = this.c.length - 1; i >= 0; i--) {
      var a = this.c[i];
      if (a.isZero()) continue;
      var neg = a.cmp(ZERO) < 0, abs = neg ? a.neg() : a, coef = abs.toString();
      if (abs.d !== 1n) coef = "(" + coef + ")";
      var term = i === 0 ? coef : (abs.eq(ONE) ? "" : coef) + v + (i > 1 ? "^" + i : "");
      parts.push((parts.length ? (neg ? " - " : " + ") : (neg ? "-" : "")) + term);
    }
    return parts.length ? parts.join("") : "0";
  };

  function toPoly(e, v) {
    switch (e.t) {
      case "num": return new Poly([e.v]);
      case "var": return e.n === v ? new Poly([ZERO, ONE]) : null;
      case "neg": var a = toPoly(e.a, v); return a ? a.neg() : null;
      case "op":
        var l = toPoly(e.a, v), r;
        if (e.o === "^") {
          var k = evalExact(e.b, {});
          return l && k && k.isInt() && k.n >= 0n && k.n <= 20n ? l.pow(Number(k.n)) : null;
        }
        r = toPoly(e.b, v);
        if (!l || !r) return null;
        if (e.o === "+") return l.add(r);
        if (e.o === "-") return l.sub(r);
        if (e.o === "*") return l.mul(r);
        if (e.o === "/") return r.deg() <= 0 && !r.c[0].isZero() ? new Poly(l.c.map(function (x) { return x.div(r.c[0]); })) : null;
    }
    return null;
  }

  /* ================================================= derivation methods */

  /* roots of a polynomial, three independent ways */
  function rootsFormula(p) {
    var d = p.deg();
    if (d === 1) return [p.c[0].neg().div(p.c[1])];
    if (d !== 2) return null;
    var a = p.c[2], b = p.c[1], c = p.c[0], disc = b.mul(b).sub(a.mul(c).mul(4));
    if (disc.cmp(ZERO) < 0) return [];
    var sn = isqrt(disc.n), sd = isqrt(disc.d);
    if (sn * sn !== disc.n || sd * sd !== disc.d) {
      var sq = Math.sqrt(disc.toNumber()), A = a.toNumber(), B = b.toNumber();
      return uniqNum([(-B + sq) / (2 * A), (-B - sq) / (2 * A)]);
    }
    var s = new Frac(sn, sd);
    return uniqFrac([b.neg().add(s).div(a.mul(2)), b.neg().sub(s).div(a.mul(2))]);
  }
  function divisors(n) { n = n < 0n ? -n : n; var out = []; for (var i = 1n; i * i <= n && i < 100000n; i++) if (n % i === 0n) { out.push(i); if (i * i !== n) out.push(n / i); } return out; }
  /* rational root theorem, then deflation */
  function rootsRational(p) {
    if (p.deg() < 1) return null;
    var lcm = 1n, i;
    for (i = 0; i < p.c.length; i++) lcm = lcm * p.c[i].d / bgcd(lcm, p.c[i].d);
    var ints = p.c.map(function (x) { return x.mul(new Frac(lcm)).n; });
    var roots = [];
    while (ints.length > 1 && ints[0] === 0n) { roots.push(ZERO); ints.shift(); }
    if (ints.length === 1) return uniqFrac(roots);
    var P = divisors(ints[0]), Q = divisors(ints[ints.length - 1]), q2 = new Poly(ints.map(function (x) { return new Frac(x); }));
    P.forEach(function (pp) { Q.forEach(function (qq) {
      [new Frac(pp, qq), new Frac(-pp, qq)].forEach(function (r) { if (q2.eval(r).isZero()) roots.push(r); });
    }); });
    roots = uniqFrac(roots);
    var found = roots.length, deg = p.deg();
    if (found < deg && deg === 2) return null;          /* irrational pair: this method cannot see it */
    return roots;
  }
  /* sign changes on a grid, then bisection: knows nothing of algebra */
  function rootsNumeric(f, lo, hi) {
    lo = lo === undefined ? -1000 : lo; hi = hi === undefined ? 1000 : hi;
    var roots = [], N = 4000, step = (hi - lo) / N, x0 = lo, f0 = f(x0), i;
    for (i = 1; i <= N; i++) {
      var x1 = lo + i * step, f1 = f(x1);
      if (!isFinite(f0) || !isFinite(f1)) { x0 = x1; f0 = f1; continue; }
      if (f0 === 0) roots.push(x0);
      else if (f0 * f1 < 0) {
        var a = x0, b = x1, fa = f0;
        for (var k = 0; k < 200; k++) { var m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
        roots.push((a + b) / 2);
      }
      x0 = x1; f0 = f1;
    }
    /* double roots do not change sign: probe local minima of |f| */
    for (i = 1; i < N; i++) {
      var xa = lo + (i - 1) * step, xb = lo + i * step, xc = lo + (i + 1) * step;
      var fa2 = Math.abs(f(xa)), fb2 = Math.abs(f(xb)), fc2 = Math.abs(f(xc));
      if (fb2 < fa2 && fb2 < fc2 && fb2 < 1e-6) roots.push(xb);
    }
    return uniqNum(roots);
  }
  function uniqFrac(list) { var out = []; list.forEach(function (r) { if (!out.some(function (o) { return o.eq(r); })) out.push(r); }); return out.sort(function (a, b) { return a.cmp(b); }); }
  function uniqNum(list) { var out = []; list.sort(function (a, b) { return a - b; }).forEach(function (r) { if (!out.length || Math.abs(out[out.length - 1] - r) > 1e-6) out.push(r); }); return out; }

  /* linear systems: elimination and Cramer */
  function gaussSolve(A, b) {
    var n = A.length, M = A.map(function (row, i) { return row.map(F).concat([F(b[i])]); }), i, j, k;
    for (i = 0; i < n; i++) {
      var piv = -1;
      for (k = i; k < n; k++) if (!M[k][i].isZero()) { piv = k; break; }
      if (piv < 0) return null;
      var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      for (k = 0; k < n; k++) {
        if (k === i || M[k][i].isZero()) continue;
        var f = M[k][i].div(M[i][i]);
        for (j = i; j <= n; j++) M[k][j] = M[k][j].sub(f.mul(M[i][j]));
      }
    }
    return M.map(function (row, idx) { return row[n].div(row[idx]); });
  }
  function det(A) {
    var n = A.length;
    if (n === 1) return F(A[0][0]);
    if (n === 2) return F(A[0][0]).mul(A[1][1]).sub(F(A[0][1]).mul(A[1][0]));
    var s = ZERO;
    for (var j = 0; j < n; j++) {
      var minor = A.slice(1).map(function (row) { return row.filter(function (_, k) { return k !== j; }); });
      var t = F(A[0][j]).mul(det(minor));
      s = j % 2 ? s.sub(t) : s.add(t);
    }
    return s;
  }
  function cramerSolve(A, b) {
    var D = det(A);
    if (D.isZero() || A.length > 4) return null;
    return A.map(function (_, j) {
      var Aj = A.map(function (row, i) { return row.map(function (v, k) { return k === j ? b[i] : v; }); });
      return det(Aj).div(D);
    });
  }

  /* combinatorics / number theory, each two ways */
  function chooseMult(n, k) { if (k < 0n || k > n) return 0n; if (k > n - k) k = n - k; var r = 1n; for (var i = 1n; i <= k; i++) r = r * (n - k + i) / i; return r; }
  function choosePascal(n, k) {
    if (n > 400n) return null;
    var N = Number(n), Kk = Number(k), row = [1n];
    for (var i = 1; i <= N; i++) { var nr = [1n]; for (var j = 1; j < i; j++) nr.push(row[j - 1] + row[j]); nr.push(1n); row = nr; }
    return Kk < 0 || Kk > N ? 0n : row[Kk];
  }
  function permFormula(n, k) { return k > n ? 0n : factB(n) / factB(n - k); }
  function permProduct(n, k) { var r = 1n; for (var i = 0n; i < k; i++) r *= (n - i); return k > n ? 0n : r; }
  function gcdEuclid(a, b) { return bgcd(a, b); }
  function factorize(n) {
    n = n < 0n ? -n : n;
    var out = [], p = 2n;
    while (p * p <= n && p < 2000000n) { while (n % p === 0n) { out.push(p); n /= p; } p += p === 2n ? 1n : 2n; }
    if (n > 1n) out.push(n);
    return out;
  }
  function gcdFactor(a, b) {
    var fa = factorize(a), fb = factorize(b).slice(), g = 1n;
    fa.forEach(function (p) { var i = fb.indexOf(p); if (i >= 0) { g *= p; fb.splice(i, 1); } });
    return g;
  }
  function isPrimeTrial(n) { if (n < 2n) return false; for (var p = 2n; p * p <= n; p++) { if (n % p === 0n) return false; if (p > 3000000n) return null; } return true; }
  function modpow(b, e, m) { var r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
  function isPrimeMR(n) {
    if (n < 2n) return false;
    var small = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    for (var i = 0; i < small.length; i++) { if (n === small[i]) return true; if (n % small[i] === 0n) return false; }
    var d = n - 1n, s = 0;
    while (!(d & 1n)) { d >>= 1n; s++; }
    for (i = 0; i < small.length; i++) {
      var x = modpow(small[i], d, n);
      if (x === 1n || x === n - 1n) continue;
      var comp = true;
      for (var r = 1; r < s; r++) { x = x * x % n; if (x === n - 1n) { comp = false; break; } }
      if (comp) return false;
    }
    return true;
  }
  function modpowNaive(b, e, m) { if (e > 20000n) return null; var r = 1n; for (var i = 0n; i < e; i++) r = r * b % m; return r; }

  /* probability: enumeration vs. convolution / closed form */
  function diceEnumerate(n, faces, target) {
    if (Math.pow(faces, n) > 2e6) return null;
    var hit = 0, total = Math.pow(faces, n), idx = new Array(n).fill(0), t;
    for (t = 0; t < total; t++) {
      var s = n, x = t;
      for (var i = 0; i < n; i++) { s += x % faces; x = Math.floor(x / faces); }
      if (s === target) hit++;
    }
    return new Frac(BigInt(hit), BigInt(total));
  }
  function diceConvolve(n, faces, target) {
    var dist = [1n], i, j, k;
    for (i = 0; i < n; i++) {
      var nd = new Array(dist.length + faces).fill(0n);
      for (j = 0; j < dist.length; j++) for (k = 1; k <= faces; k++) nd[j + k] += dist[j];
      dist = nd;
    }
    var hits = dist[target] || 0n;
    return new Frac(hits, BigInt(faces) ** BigInt(n));
  }
  function binomProb(n, k, p) { return new Frac(chooseMult(BigInt(n), BigInt(k))).mul(F(p).pow(k)).mul(ONE.sub(F(p)).pow(n - k)); }
  function binomEnumerate(n, k, p) {
    if (n > 20) return null;
    var P = F(p), Q = ONE.sub(P), s = ZERO;
    for (var m = 0; m < (1 << n); m++) {
      var c = 0, x = m; while (x) { c += x & 1; x >>= 1; }
      if (c === k) s = s.add(P.pow(c).mul(Q.pow(n - c)));
    }
    return s;
  }

  /* numeric calculus, independent of the symbolic route */
  function numDeriv(f, x) { var h = 1e-5 * Math.max(1, Math.abs(x)); return (f(x + h) - f(x - h)) / (2 * h); }
  function simpson(f, a, b, n) { n = n || 2000; var h = (b - a) / n, s = f(a) + f(b); for (var i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; }

  /* graphs: Dijkstra and Bellman-Ford */
  function dijkstra(edges, src, dst) {
    var dist = {}, done = {}, nodes = {};
    edges.forEach(function (e) { nodes[e[0]] = 1; nodes[e[1]] = 1; });
    Object.keys(nodes).forEach(function (v) { dist[v] = Infinity; });
    dist[src] = 0;
    for (;;) {
      var u = null;
      Object.keys(nodes).forEach(function (v) { if (!done[v] && (u === null || dist[v] < dist[u])) u = v; });
      if (u === null || dist[u] === Infinity) break;
      done[u] = 1;
      edges.forEach(function (e) {
        if (e[0] === u && dist[u] + e[2] < dist[e[1]]) dist[e[1]] = dist[u] + e[2];
        if (e[1] === u && dist[u] + e[2] < dist[e[0]]) dist[e[0]] = dist[u] + e[2];
      });
    }
    return dist[dst];
  }
  function bellmanFord(edges, src, dst) {
    var dist = {}, nodes = {};
    edges.forEach(function (e) { nodes[e[0]] = 1; nodes[e[1]] = 1; });
    Object.keys(nodes).forEach(function (v) { dist[v] = Infinity; });
    dist[src] = 0;
    for (var i = 0; i < Object.keys(nodes).length; i++) edges.forEach(function (e) {
      if (dist[e[0]] + e[2] < dist[e[1]]) dist[e[1]] = dist[e[0]] + e[2];
      if (dist[e[1]] + e[2] < dist[e[0]]) dist[e[0]] = dist[e[1]] + e[2];
    });
    return dist[dst];
  }

  /* constraint propagation + backtracking over small finite domains */
  function csp(vars, domains, constraints) {
    var dom = {};
    vars.forEach(function (v) { dom[v] = domains[v].slice(); });
    function consistent(asg) { return constraints.every(function (c) { return c(asg) !== false; }); }
    var solutions = [];
    (function bt(i, asg) {
      if (solutions.length > 50) return;
      if (i === vars.length) { solutions.push(Object.assign({}, asg)); return; }
      var v = vars[i];
      for (var k = 0; k < dom[v].length; k++) {
        asg[v] = dom[v][k];
        if (consistent(asg)) bt(i + 1, asg);
        delete asg[v];
      }
    })(0, {});
    return solutions;
  }

  /* ============================================================= parsing */

  function clean(s) {
    return String(s).replace(/\s+/g, " ").trim().replace(/[?.!]+\s*$/, "").trim();
  }
  function stripLead(s) {
    return s.replace(/^(?:please\s+)?(?:what\s+is|what's|find|compute|calculate|evaluate|determine|give)\s+(?:the\s+)?/i, "");
  }

  /* multiple-choice options "(A) 3 (B) 4" or "A) 3, B) 4" or "A. 3" */
  function parseOptions(text) {
    var re = /(?:^|\s)\(?([A-E])[).:]\s*([^()]*?)(?=\s+\(?[A-E][).:]\s|$)/g, m, out = [];
    while ((m = re.exec(text))) out.push({ label: m[1], text: m[2].trim().replace(/[,;]$/, "") });
    if (out.length < 2) return { stem: text, options: [] };
    var first = text.search(/(?:^|\s)\(?A[).:]\s/);
    return { stem: text.slice(0, first).trim(), options: out };
  }

  var PARSERS = [];
  function parser(kind, fn) { PARSERS.push({ kind: kind, fn: fn }); }

  function newProblem(domain, kind, text) {
    return { domain: domain, kind: kind, text: text, givens: [], unknowns: [], claims: [], equations: [],
             constraints: [], assumptions: [], requiredKnowledge: [], candidateAnswers: [] };
  }

  parser("derivative", function (t) {
    var m = t.match(/(?:derivative|differentiate|d\/d([a-z]))\s*(?:of\s+)?(?:f\([a-z]\)\s*=\s*|y\s*=\s*)?(.+?)(?:\s+with respect to\s+([a-z]))?(?:\s+(?:at|when|for)\s+([a-z])\s*=\s*(-?[\d./]+))?$/i);
    if (!m) return null;
    var v = (m[1] || m[3] || m[4] || "x").toLowerCase(), e = parseExpr(m[2]);
    if (!e) return null;
    var vs = Object.keys(varsOf(e));
    if (vs.length > 1 || (vs.length === 1 && vs[0] !== v)) { if (vs.length === 1) v = vs[0]; else return null; }
    var P = newProblem("calculus", "derivative", t);
    P.givens.push({ expr: e, v: v });
    P.unknowns.push(m[5] !== undefined ? "f'(" + m[5] + ")" : "f'(" + v + ")");
    if (m[5] !== undefined) P.at = F(m[5]);
    return P;
  });

  parser("integral", function (t) {
    var m = t.match(/(?:definite\s+)?(?:integral|integrate|∫)\s*(?:of\s+)?(.+?)\s*(?:d([a-z]))?\s+from\s+(-?[\d./]+)\s+to\s+(-?[\d./]+)$/i);
    if (!m) return null;
    var e = parseExpr(m[1].replace(/\s*d[a-z]\s*$/i, ""));
    if (!e) return null;
    var vs = Object.keys(varsOf(e)), v = (m[2] || vs[0] || "x").toLowerCase();
    if (vs.length > 1) return null;
    var P = newProblem("calculus", "integral", t);
    P.givens.push({ expr: e, v: v, a: F(m[3]), b: F(m[4]) });
    P.unknowns.push("integral");
    return P;
  });

  parser("system", function (t) {
    var body = t.replace(/^(?:solve|find\s+[a-z](?:\s*(?:and|,)\s*[a-z])+\s*(?:if|given|when|such that)?|solve the system)\s*:?\s*/i, "");
    var parts = body.split(/\s*(?:,|;|\band\b)\s*/).filter(function (x) { return /=/.test(x); });
    if (parts.length < 2 || parts.length > 4) return null;
    var eqs = [], allv = {};
    for (var i = 0; i < parts.length; i++) {
      var sides = parts[i].split("=");
      if (sides.length !== 2) return null;
      var l = parseExpr(sides[0]), r = parseExpr(sides[1]);
      if (!l || !r) return null;
      var e = { t: "op", o: "-", a: l, b: r };
      Object.keys(varsOf(e)).forEach(function (v) { allv[v] = 1; });
      eqs.push(e);
    }
    var vars = Object.keys(allv).sort();
    if (vars.length !== eqs.length || vars.length < 2) return null;
    /* linear? coefficients by evaluation at unit vectors */
    var A = [], b = [];
    for (i = 0; i < eqs.length; i++) {
      var zero = {}; vars.forEach(function (v) { zero[v] = 0; });
      var c0 = evalExact(eqs[i], zero);
      if (!c0) return null;
      var row = [];
      for (var j = 0; j < vars.length; j++) {
        var unit = Object.assign({}, zero); unit[vars[j]] = 1;
        var cj = evalExact(eqs[i], unit);
        if (!cj) return null;
        row.push(cj.sub(c0));
      }
      /* check linearity at another point */
      var probe = {}; vars.forEach(function (v, k) { probe[v] = k + 2; });
      var lin = c0; vars.forEach(function (v, k) { lin = lin.add(row[k].mul(k + 2)); });
      var act = evalExact(eqs[i], probe);
      if (!act || !act.eq(lin)) return null;
      A.push(row); b.push(c0.neg());
    }
    var P = newProblem("algebra", "system", t);
    P.equations = eqs; P.vars = vars; P.A = A; P.b = b;
    P.unknowns = vars.slice();
    return P;
  });

  parser("equation", function (t) {
    var body = t.replace(/^(?:solve|find\s+([a-z])\s*(?:if|given|when|such that|where)?|for what value of ([a-z])(?: is| does)?|what (?:value of )?([a-z]) (?:satisfies|solves))\s*:?\s*/i, "");
    body = body.replace(/\s+for\s+[a-z]$/i, "");
    var sides = body.split("=");
    if (sides.length !== 2) return null;
    var l = parseExpr(sides[0]), r = parseExpr(sides[1]);
    if (!l || !r) return null;
    var e = { t: "op", o: "-", a: l, b: r }, vs = Object.keys(varsOf(e));
    if (vs.length !== 1) return null;
    var P = newProblem("algebra", "equation", t);
    P.equations = [e]; P.v = vs[0]; P.unknowns = [vs[0]];
    P.poly = toPoly(e, vs[0]);
    if (P.poly && P.poly.deg() < 1) return null;
    return P;
  });

  parser("choose", function (t) {
    var m = t.match(/\b(\d+)\s*(?:choose|C)\s*(\d+)\b/) || t.match(/\bC\(\s*(\d+)\s*,\s*(\d+)\s*\)/) ||
            t.match(/(?:ways|combinations)\s+(?:are there\s+)?(?:to\s+)?(?:choose|select|pick)\s+(\d+)\s+(?:\w+\s+)?(?:from|out of|of)\s+(\d+)/i);
    if (!m) return null;
    var n = BigInt(m[1]), k = BigInt(m[2]);
    if (/(?:ways|combinations)/i.test(t) && /(?:choose|select|pick)\s+\d+\s+(?:\w+\s+)?(?:from|out of|of)/i.test(t)) { var tmp = n; n = k; k = tmp; }
    var P = newProblem("combinatorics", "choose", t);
    P.n = n; P.k = k; P.unknowns = ["C(" + n + "," + k + ")"];
    return P;
  });

  parser("permute", function (t) {
    var m = t.match(/\bP\(\s*(\d+)\s*,\s*(\d+)\s*\)/) || t.match(/(\d+)\s*P\s*(\d+)\b/) ||
            t.match(/(?:ways|permutations)\s+(?:are there\s+)?(?:to\s+)?(?:arrange|order)\s+(\d+)\s+(?:\w+\s+)?(?:from|out of|of)\s+(\d+)/i);
    if (!m) return null;
    var n = BigInt(m[1]), k = BigInt(m[2]);
    if (/(?:arrange|order)\s+\d+\s+(?:\w+\s+)?(?:from|out of|of)/i.test(t)) { var tmp = n; n = k; k = tmp; }
    var P = newProblem("combinatorics", "permute", t);
    P.n = n; P.k = k; P.unknowns = ["P(" + n + "," + k + ")"];
    return P;
  });

  parser("gcd", function (t) {
    var m = t.match(/(?:gcd|greatest common (?:divisor|factor)|hcf)\s*(?:of\s+)?\(?\s*(\d+)\s*(?:,|and)\s*(\d+)/i);
    var lm = t.match(/(?:lcm|least common multiple)\s*(?:of\s+)?\(?\s*(\d+)\s*(?:,|and)\s*(\d+)/i);
    if (!m && !lm) return null;
    var P = newProblem("number_theory", m ? "gcd" : "lcm", t);
    var mm = m || lm;
    P.a = BigInt(mm[1]); P.b = BigInt(mm[2]); P.unknowns = [P.kind];
    return P;
  });

  parser("prime", function (t) {
    var m = t.match(/^is\s+(\d+)\s+(?:a\s+)?prime/i);
    var f = t.match(/(?:prime\s+factori[sz]ation|prime\s+factors|factori[sz]e)\s+(?:of\s+)?(\d+)/i);
    if (!m && !f) return null;
    var P = newProblem("number_theory", m ? "isprime" : "factor", t);
    P.n = BigInt((m || f)[1]); P.unknowns = [P.kind];
    return P;
  });

  parser("modpow", function (t) {
    var m = t.match(/(\d+)\s*\^\s*(\d+)\s*(?:mod|modulo|%)\s*(\d+)/i) ||
            t.match(/remainder\s+(?:when|of)\s+(\d+)\s*\^\s*(\d+)\s+(?:is\s+)?divided\s+by\s+(\d+)/i);
    if (!m) return null;
    var P = newProblem("number_theory", "modpow", t);
    P.b0 = BigInt(m[1]); P.e = BigInt(m[2]); P.m = BigInt(m[3]); P.unknowns = ["residue"];
    if (P.m === 0n) return null;
    return P;
  });

  var WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  function num(w) { return WORDNUM[String(w).toLowerCase()] || parseInt(w, 10); }

  parser("dice", function (t) {
    var m = t.match(/probability\b.*?\bsum\s+(?:of\s+)?(\d+)\b.*?\b(\d+|two|three|four|five)\s+(?:fair\s+)?(?:(\d+)-sided\s+)?dice/i) ||
            t.match(/probability\b.*?\b(\d+|two|three|four|five)\s+(?:fair\s+)?(?:(\d+)-sided\s+)?dice\b.*?\bsum\s+(?:of\s+|to\s+|is\s+)?(\d+)/i);
    if (!m) return null;
    var P = newProblem("probability", "dice", t);
    if (/sum\s+(?:of\s+)?\d+.*dice/i.test(t) && m[3] === undefined || /sum\s+(?:of\s+)?\d+.*dice/i.test(t)) {
      P.target = parseInt(m[1], 10); P.n = num(m[2]); P.faces = m[3] ? parseInt(m[3], 10) : 6;
    }
    if (!P.n) { P.n = num(m[1]); P.faces = m[2] ? parseInt(m[2], 10) : 6; P.target = parseInt(m[3], 10); }
    if (!(P.n >= 1 && P.n <= 8 && P.faces >= 2 && P.faces <= 20)) return null;
    P.assumptions.push("the dice are fair and independent");
    P.unknowns = ["probability"];
    return P;
  });

  parser("coins", function (t) {
    var m = t.match(/probability\b.*?\bexactly\s+(\d+|one|two|three|four|five|six)\s+(heads|tails)\b.*?\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:fair\s+)?(?:coin\s+)?(?:flips|tosses|coins|flips of a coin)/i);
    if (!m) return null;
    var P = newProblem("probability", "coins", t);
    P.k = num(m[1]); P.n = num(m[3]); P.p = "0.5";
    if (!(P.n >= 1 && P.n <= 60 && P.k >= 0)) return null;
    P.assumptions.push("the coin is fair and flips are independent");
    P.unknowns = ["probability"];
    return P;
  });

  parser("series", function (t) {
    var m = t.match(/sum of (?:the )?first\s+(\d+)\s+(positive integers|natural numbers|integers|odd numbers|odd integers|even numbers|even integers|squares|perfect squares|cubes)/i);
    if (!m) return null;
    var P = newProblem("algebra", "series", t);
    P.n = BigInt(m[1]); P.which = m[2].toLowerCase();
    P.unknowns = ["sum"];
    return P;
  });

  parser("path", function (t) {
    var m = t.match(/shortest (?:path|distance|route)\s+(?:length\s+)?from\s+([A-Za-z0-9]+)\s+to\s+([A-Za-z0-9]+)/i);
    if (!m) return null;
    var edges = [], re = /([A-Za-z0-9]+)\s*[-–]\s*([A-Za-z0-9]+)\s*[:=(]?\s*(\d+(?:\.\d+)?)/g, e;
    var rest = t.slice(0, m.index) + " " + t.slice(m.index + m[0].length);
    while ((e = re.exec(rest))) edges.push([e[1], e[2], parseFloat(e[3])]);
    if (!edges.length) return null;
    var P = newProblem("graphs", "path", t);
    P.src = m[1]; P.dst = m[2]; P.edges = edges; P.unknowns = ["distance"];
    return P;
  });

  /* A bare arithmetic expression: derivable, two ways (exact rational and
     floating point). Used to VERIFY the fast arithmetic route. */
  parser("arithmetic", function (t) {
    if (!/^[\d\s.+\-*\/^()!]+$/.test(t) || !/[+\-*\/^!]/.test(t)) return null;
    var e = parseExpr(t);
    if (!e || Object.keys(varsOf(e)).length) return null;
    var P = newProblem("arithmetic", "arithmetic", t);
    P.expr = e; P.unknowns = ["value"];
    return P;
  });

  /* ------------------------------------------------ compositional reading
     Instead of one pattern per sentence shape, a problem is COMPOSED from
     two independent readings of the text: what is being asked (the intent,
     from a small cue lexicon) and which mathematical objects are present
     (equations, expressions, evaluation points, integers). Any phrasing that
     states the same intent and the same objects reads the same. */
  var INTENTS = [
    ["derivative", /\b(?:derivative|differentiate|d\/d[a-z]|slope|gradient|rate of change)\b|\b[a-z]'\s*\(/i],
    ["integral", /\b(?:integral|integrate|area under)\b|\u222b/i],
    ["choose", /\b(?:choose|combinations?|committees?|subsets?|select(?:ed|ing)?|pick(?:ed|ing)?)\b|\bC\(\s*\d/],
    ["permute", /\b(?:permutations?|arrange(?:d|ments?)?|orderings?|ordered|(?:different\s+|possible\s+)?orders\b|line[ds]?\s+up|lined\s+up|in\s+a\s+(?:row|line|queue)|queue[ds]?\s+up|seat(?:ed|ing)?\s+in\s+a\s+row)\b|\bP\(\s*\d/i],
    ["gcd", /\b(?:gcd|greatest common (?:divisor|factor)|highest common factor|hcf)\b/i],
    ["lcm", /\b(?:lcm|least common multiple|lowest common multiple)\b/i],
    ["modpow", /\b(?:mod|modulo|remainder)\b/i],
    ["factor", /\bprime factori[sz]ation\b|\bprime factors\b/i],
    ["isprime", /\bprime\b/i],
    ["dice", /\bdice\b|\bdie\b/i],
    ["coins", /\bcoins?\b|\bheads\b|\btails\b/i],
    ["solve", /\b(?:solve|roots?|solutions?|zeros?|satisf(?:y|ies)|what is [a-z]\b|find [a-z]\b|value of [a-z]\b|for which [a-z]\b)/i]
  ];
  var NUMWORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
                  eleven: 11, twelve: 12, once: 1, twice: 2, thrice: 3, pair: 2, couple: 2, dozen: 12 };
  function normMath(t) {
    return " " + t.replace(/\b(?:is equal to|equals|is equal)\b/gi, " = ")
      .replace(/\b(?:is|equals?|be|becomes?)\s+zero\b/gi, " = 0").replace(/([\dA-Za-z)])\s+zero\b/g, "$1 = 0")
      .replace(/\bsquared\b/gi, "^2").replace(/\bcubed\b/gi, "^3")
      .replace(/\u2212/g, "-") + " ";
  }
  /* maximal spans that parse as expressions/equations and mention a variable
     or an operator; English words are excluded by requiring every letter run
     to be a single variable letter or a known function name */
  function mathSpans(t) {
    var re = /[-+(]?[\w^.()+\-*\/= ]*[\d)a-z]/gi, out = [], m;
    var src = normMath(t);
    var cands = src.split(/[,;?:]|\b(?:and|at|when|where|if|then|what|for|which|is|find|solve|compute|evaluate|determine|the|of|from|to|between)\b/i);
    cands.forEach(function (c) {
      c = c.trim().replace(/\.$/, "");
      /* peel English words off the edges: "differentiate 3x^2" -> "3x^2" */
      function isWord(w) { return w.length > 1 && !FUNCS[w.toLowerCase()] && w.toLowerCase() !== "pi"; }
      var m0;
      while ((m0 = c.match(/^([a-z]+)\b\s*/i)) && isWord(m0[1])) c = c.slice(m0[0].length);
      while ((m0 = c.match(/\s*\b([a-z]+)$/i)) && isWord(m0[1])) c = c.slice(0, c.length - m0[0].length);
      c = c.trim();
      if (!c || !/[\d]/.test(c) && !/[a-z]\s*[\^=]/i.test(c)) return;
      var words = c.match(/[a-z]+/gi) || [];
      if (words.some(function (w) { return w.length > 1 && !FUNCS[w.toLowerCase()] && w.toLowerCase() !== "pi"; })) return;
      if (/=/.test(c)) {
        var sides = c.split("=");
        if (sides.length === 2 && parseExpr(sides[0]) && parseExpr(sides[1])) out.push({ eq: true, l: parseExpr(sides[0]), r: parseExpr(sides[1]), src: c });
      } else {
        var e = parseExpr(c);
        if (e && (Object.keys(varsOf(e)).length || /[+\-*\/^]/.test(c))) out.push({ eq: false, e: e, src: c });
      }
    });
    return out;
  }
  function intsOf(t) {
    var out = [], re = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|once|twice|thrice)\b/gi, m;
    while ((m = re.exec(t))) out.push({ v: /\d/.test(m[1]) ? parseInt(m[1], 10) : NUMWORD[m[1].toLowerCase()], at: m.index, w: m[1] });
    return out;
  }
  function near(t, ints, cue) {
    /* the integer closest BEFORE a cue word ("3 heads", "5 times", "2 dice") */
    var re = new RegExp("(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|once|twice|thrice)\\s+(?:fair\\s+|six-sided\\s+|standard\\s+)?(?:" + cue + ")\\b", "i");
    var m = t.match(re);
    return m ? (/\d/.test(m[1]) ? parseInt(m[1], 10) : NUMWORD[m[1].toLowerCase()]) : null;
  }
  function evalPoint(t, v) {
    var m = t.match(new RegExp("\\b" + v + "\\s*=\\s*(-?[\\d./]+)", "i")) || t.match(new RegExp("\\b[a-z]'\\s*\\(\\s*(-?[\\d./]+)\\s*\\)", "i")) ||
            t.match(/\bat\s+(-?[\d./]+)\b/i);
    return m ? F(m[1]) : null;
  }

  /* Readings defined by what a question DESCRIBES rather than by a keyword:
     the greatest number dividing both a and b is their gcd, the least number
     both divide is their lcm; every member of a group interacting once with
     every other is the number of unordered pairs; the remainder of a
     division; the sum of a run of consecutive integers. */
  function describe(t) {
    var P, m, low = wordsToNumbers(t.toLowerCase());
    var ints = (low.match(/-?\d+/g) || []).map(Number);
    var maxWord = /\b(?:largest|greatest|biggest|highest|maximum)\b/.test(low), minWord = /\b(?:smallest|least|lowest|minimum|first)\b/.test(low);
    if (ints.length === 2 && (maxWord || minWord)) {
      var divides = /\bthat\s+(?:evenly\s+|exactly\s+)?divides?\b|\bdividing\b|\bdivisor\b|\bfactor\b|\bgoes\s+(?:evenly\s+)?into\s+(?:both|each)/.test(low);
      var multiple = /\bdivisible\s+by\b|\bmultiple\s+of\b|\b\d+\s+and\s+\d+\s+(?:both\s+|each\s+)?(?:divide|go)\b|\bboth\s+\d+\s+and\s+\d+\s+(?:divide|go)\b/.test(low);
      if (maxWord && divides && !multiple) { P = newProblem("number_theory", "gcd", t); P.a = BigInt(ints[0]); P.b = BigInt(ints[1]); P.unknowns = ["gcd"]; P.reading = "the greatest common divisor of " + ints[0] + " and " + ints[1]; return P; }
      if (minWord && multiple) { P = newProblem("number_theory", "lcm", t); P.a = BigInt(ints[0]); P.b = BigInt(ints[1]); P.unknowns = ["lcm"]; P.reading = "the least common multiple of " + ints[0] + " and " + ints[1]; return P; }
    }
    /* each member interacting once with every other member: unordered pairs */
    if (ints.length === 1 && /\b(?:each|every)\b/.test(low) &&
        (/\b(?:with|against|to)\s+(?:every(?:one|body)?(?:\s+(?:else|other))?|each\s+other|all\s+(?:the\s+)?others?)\b/.test(low) ||
         /\bevery\s+other\s+\w+/.test(low) || /\beach\s+other\b/.test(low))) {
      P = newProblem("combinatorics", "choose", t); P.n = BigInt(ints[0]); P.k = 2n; P.unknowns = ["pairs"];
      P.reading = "one interaction per unordered pair of " + ints[0]; return P;
    }
    if ((m = low.match(/\bremainder\s+(?:when|of|after)\s+(-?\d+)\s+(?:is\s+)?divided\s+by\s+(\d+)/)) ||
        (m = low.match(/\b(-?\d+)\s+(?:mod|modulo)\s+(\d+)\b(?!\s*\^)/))) {
      if (+m[2] === 0) return null;
      P = newProblem("number_theory", "mod", t); P.a = BigInt(m[1]); P.m = BigInt(m[2]); P.unknowns = ["remainder"]; return P;
    }
    if ((m = low.match(/\b(?:sum|add(?:\s+up)?|total)\b[^\d]{0,40}?(?:numbers|integers|whole numbers|natural numbers)?\s*from\s+(-?\d+)\s+(?:to|through|up to)\s+(-?\d+)/))) {
      var a0 = BigInt(m[1]), b0 = BigInt(m[2]);
      if (b0 < a0 || b0 - a0 > 10000000n) return null;
      P = newProblem("algebra", "rangesum", t); P.lo = a0; P.hi = b0; P.unknowns = ["sum"]; return P;
    }
    return null;
  }

  function compose(t) {
    var intent = null, i;
    /* "a pair of dice", "a couple of coins": collective nouns are counts */
    t = t.replace(/\ba\s+(pair|couple|dozen)\s+of\b/gi, function (_, w) { return String(COLLECTIVE[w.toLowerCase()]); });
    var described = describe(t);
    if (described) return described;
    for (i = 0; i < INTENTS.length; i++) if (INTENTS[i][1].test(t)) { intent = INTENTS[i][0]; break; }
    var spans = mathSpans(t), ints = intsOf(t), P;
    var eqs = spans.filter(function (s) { return s.eq; }), exprs = spans.filter(function (s) { return !s.eq; });
    function withVar(list) { return list.filter(function (s) { var v = s.eq ? Object.assign(varsOf(s.l), varsOf(s.r)) : varsOf(s.e); return Object.keys(v).length; }); }
    if (intent === "derivative" || intent === "integral") {
      /* the function: "f(x) = expr" is a definition, not an equation */
      var fx = eqs.filter(function (s) { return s.l.t === "fn" || /^[a-z]\s*\(\s*[a-z]\s*\)$/i.test(s.src.split("=")[0].trim()) || /^y$/i.test(s.src.split("=")[0].trim()); });
      var body = fx.length ? fx[0].r : (withVar(exprs)[0] || {}).e;
      if (!body) return null;
      var vs = Object.keys(varsOf(body));
      if (vs.length !== 1) return null;
      if (intent === "derivative") {
        P = newProblem("calculus", "derivative", t);
        P.givens.push({ expr: body, v: vs[0] });
        var at = evalPoint(t, vs[0]);
        if (at) P.at = at;
        P.unknowns.push("f'");
        return P;
      }
      var bm = t.match(/(?:from|between)\s+(-?[\d./]+)\s+(?:to|and)\s+(-?[\d./]+)/i);
      if (!bm) return null;
      P = newProblem("calculus", "integral", t);
      P.givens.push({ expr: body, v: vs[0], a: F(bm[1]), b: F(bm[2]) });
      P.unknowns.push("integral");
      return P;
    }
    if (intent === "solve" || (!intent && eqs.length)) {
      var veqs = withVar(eqs).filter(function (s) { return !/^[a-z]\s*\(/i.test(s.src); });
      if (veqs.length >= 2) {
        var sys = PARSERS.filter(function (p) { return p.kind === "system"; })[0].fn("solve " + veqs.map(function (s) { return s.src; }).join(", "));
        if (sys) return sys;
      }
      var e1 = null;
      if (veqs.length === 1) e1 = "solve " + veqs[0].src;
      else if (!veqs.length && withVar(exprs).length === 1 && /\b(?:roots?|zeros?|solutions?)\b/i.test(t)) e1 = "solve " + withVar(exprs)[0].src + " = 0";
      if (e1) return PARSERS.filter(function (p) { return p.kind === "equation"; })[0].fn(e1);
      return null;
    }
    var nums = ints.map(function (x) { return x.v; }).filter(function (v) { return v !== undefined; });
    if (intent === "choose" || intent === "permute") {
      var digits = ints.filter(function (x) { return /\d/.test(x.w); }).map(function (x) { return x.v; });
      if (intent === "permute" && digits.length === 1 && digits[0] <= 200) {
        /* arranging all n items: n! */
        P = newProblem("combinatorics", "permute", t);
        P.n = BigInt(digits[0]); P.k = BigInt(digits[0]); P.unknowns = ["arrangements"];
        P.reading = "orderings of all " + digits[0];
        return P;
      }
      if (digits.length < 2) return null;
      var n = Math.max(digits[0], digits[1]), k = Math.min(digits[0], digits[1]);
      P = newProblem("combinatorics", intent, t);
      P.n = BigInt(n); P.k = BigInt(k); P.unknowns = [intent];
      return P;
    }
    if (intent === "gcd" || intent === "lcm") {
      var d2 = ints.filter(function (x) { return /\d/.test(x.w); }).map(function (x) { return x.v; });
      if (d2.length < 2) return null;
      P = newProblem("number_theory", intent, t);
      P.a = BigInt(d2[0]); P.b = BigInt(d2[1]); P.unknowns = [intent];
      return P;
    }
    if (intent === "dice") {
      var nd = near(t, ints, "dice|die"),
          tm = t.match(/\b(?:sum|total|add(?:s|ing)?\s+(?:up\s+)?to|come\s+to|comes\s+to)\b[^\d]{0,24}(\d+)/i) || t.match(/(\d+)[^\d]{0,12}\b(?:sum|total)\b/i) ||
               /* "rolling a 6": the face shown, which for several dice is their total */
               t.match(/\b(?:roll(?:s|ed|ing)?|throw(?:s|n|ing)?|get(?:s|ting)?|land(?:s|ing)?\s+on|show(?:s|ing)?)\s+(?:a|an)?\s*(\d+)\b(?!\s*(?:dice|die)\b)/i);
      /* "a die", "one die", "a single die" is one die */
      if (nd === null && /\b(?:a|one|the|single|a\s+single|1)\s+(?:fair\s+|six-sided\s+|standard\s+)?die\b/i.test(t)) nd = 1;
      if (!nd || !tm) return null;
      P = newProblem("probability", "dice", t);
      P.n = nd; P.faces = 6; P.target = parseInt(tm[1], 10);
      P.assumptions.push("the dice are fair and independent"); P.unknowns = ["probability"];
      return P.n >= 1 && P.n <= 8 ? P : null;
    }
    if (intent === "coins") {
      var kk = near(t, ints, "heads|tails"), nn = near(t, ints, "times|flips|tosses|coins|coin flips|coin tosses");
      /* quantifiers: "both land heads", "all heads", "no heads" */
      if (kk === null && nn !== null) {
        if (/\b(?:both|all|every(?:\s+one)?|each)\b[^.?]{0,30}\b(?:heads|tails)\b/i.test(t)) kk = nn;
        else if (/\b(?:no|none|zero)\b[^.?]{0,30}\b(?:heads|tails)\b/i.test(t)) kk = 0;
      }
      if (kk === null || nn === null || kk > nn) return null;
      P = newProblem("probability", "coins", t);
      P.k = kk; P.n = nn; P.p = "0.5";
      P.cmp = /\bat\s+least\b|\bor\s+more\b/i.test(t) ? "ge" : /\bat\s+most\b|\bor\s+(?:fewer|less)\b/i.test(t) ? "le" : "eq";
      P.assumptions.push("the coin is fair and flips are independent"); P.unknowns = ["probability"];
      return P;
    }
    return null;
  }

  /* ------------------------------------------- quantitative English -> algebra
     English states arithmetic with its own grammar: operand order flips in
     "five less than x" and "4 subtracted from x", "the sum of A and B" is a
     prefix operator, "doubled and then increased by 7" is a postfix chain,
     "triple a number and subtract 4" is a sequence of imperatives acting on
     a running value, and "is / gives / you get" is equality. These rules are
     that grammar -- compositional and recursive, so they read sentences
     nobody listed -- not a table of sentences. The unknown is whatever the
     text refers to as "a number", "the number", "it", ... */
  var SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var DENOM = { half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5,
    sixth: 6, sixths: 6, seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10 };
  /* collective quantity nouns: "a pair of dice" is two dice */
  var COLLECTIVE = { pair: 2, couple: 2, dozen: 12, score: 20, trio: 3, triple: 3, quartet: 4 };

  function wordsToNumbers(t) {
    t = " " + t + " ";
    t = t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g,
      function (_, a, b) { return String(TENS[a] + SMALL[b]); });
    t = t.replace(/\b(a|one|two|three|four|five|six|seven|eight|nine|ten)\s+(hundred|thousand)\b/g,
      function (_, a, b) { return String((a === "a" ? 1 : SMALL[a]) * (b === "hundred" ? 100 : 1000)); });
    /* fractions before plain numbers: "three quarters of", "a third of", "half of" */
    t = t.replace(/\b(a|an|one|two|three|four|five|six|seven|eight|nine)\s+(halves|half|thirds?|quarters?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?)\b/g,
      function (_, a, b) { return " " + (a === "a" || a === "an" ? 1 : SMALL[a]) + "/" + DENOM[b] + " "; });
    t = t.replace(/\bhalf\b/g, " 1/2 ");
    t = t.replace(/\ba\s+(pair|couple|dozen|score|trio|quartet)\s+of\b/g, function (_, w) { return " " + COLLECTIVE[w] + " "; });
    t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g,
      function (w) { return String(SMALL[w]); });
    t = t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, function (w) { return String(TENS[w]); });
    t = t.replace(/\btwice\b/g, " twice ").replace(/\bthrice\b/g, " triple ");
    return t.replace(/\s+/g, " ").trim();
  }

  var UNKNOWN = /^(?:(?:a|the|some|this|that|my|an|one|a certain|an unknown|the unknown|the same|what|which)\s+)?(?:number|integer|value|quantity|unknown)$|^(?:it|itself|x|n)$/;
  var NUM_ATOM = /^-?\d+(?:\.\d+)?(?:\/\d+)?$/;

  function wrap(e) { return /^[\w.]+$/.test(e) ? e : "(" + e + ")"; }
  /* split ``p`` at the first top-level occurrence of ``re`` (words only;
     the grammar has no brackets), returning [left, right] or null */
  function splitFirst(p, re) {
    var m = re.exec(p);
    if (!m || m.index === 0) return null;
    var l = p.slice(0, m.index).trim(), r = p.slice(m.index + m[0].length).trim();
    return l && r ? [l, r, m] : null;
  }
  function splitLast(p, re) {
    var g = new RegExp(re.source, "g"), m, last = null;
    while ((m = g.exec(p))) { if (m.index > 0) last = { index: m.index, len: m[0].length, m: m }; if (!m[0].length) g.lastIndex++; }
    if (!last) return null;
    var l = p.slice(0, last.index).trim(), r = p.slice(last.index + last.len).trim();
    return l && r ? [l, r, last.m] : null;
  }

  var POSTFIX = /\b(doubled|tripled|quadrupled|halved|squared|cubed|(?:increased|decreased|reduced|multiplied|divided|raised|lowered)\s+by\s+.+|raised\s+to\s+.+)$/;
  function applyPostfix(e, verb) {
    var m;
    if (verb === "doubled") return "2*" + wrap(e);
    if (verb === "tripled") return "3*" + wrap(e);
    if (verb === "quadrupled") return "4*" + wrap(e);
    if (verb === "halved") return wrap(e) + "/2";
    if (verb === "squared") return wrap(e) + "^2";
    if (verb === "cubed") return wrap(e) + "^3";
    if ((m = verb.match(/^(increased|decreased|reduced|lowered|multiplied|divided|raised)\s+by\s+(.+)$/))) {
      var b = phraseExpr(m[2]);
      if (b === null) return null;
      var op = { increased: "+", decreased: "-", reduced: "-", lowered: "-", multiplied: "*", divided: "/", raised: "+" }[m[1]];
      return wrap(e) + op + wrap(b);
    }
    if ((m = verb.match(/^raised\s+to\s+(?:the\s+)?(?:power\s+of\s+)?(.+)$/))) {
      var k = phraseExpr(m[1].replace(/(\d+)(?:st|nd|rd|th)(?:\s+power)?/, "$1"));
      return k === null ? null : wrap(e) + "^" + wrap(k);
    }
    return null;
  }

  /* An English noun phrase of arithmetic -> expression string, or null. */
  function phraseExpr(p) {
    p = String(p).trim().replace(/^(?:the|a|an)\s+(?=(?:sum|product|difference|quotient|square|cube|result|total)\b)/, "")
                        .replace(/[,.;:!?]+$/, "").trim();
    if (!p) return null;
    if (NUM_ATOM.test(p)) return p;
    if (UNKNOWN.test(p)) return "x";
    var s, e;
    /* "A less than B" = B - A; "A more than B" = B + A (lowest precedence) */
    if ((s = splitFirst(p, /\s+(?:less|fewer)\s+than\s+/))) { var a1 = phraseExpr(s[0]), b1 = phraseExpr(s[1]); return a1 !== null && b1 !== null ? wrap(b1) + "-" + wrap(a1) : null; }
    if ((s = splitFirst(p, /\s+(?:more|greater|larger|bigger)\s+than\s+/))) { var a2 = phraseExpr(s[0]), b2 = phraseExpr(s[1]); return a2 !== null && b2 !== null ? wrap(b2) + "+" + wrap(a2) : null; }
    if ((s = splitFirst(p, /\s+subtracted\s+from\s+/))) { var a3 = phraseExpr(s[0]), b3 = phraseExpr(s[1]); return a3 !== null && b3 !== null ? wrap(b3) + "-" + wrap(a3) : null; }
    if ((s = splitFirst(p, /\s+added\s+to\s+/))) { var a4 = phraseExpr(s[0]), b4 = phraseExpr(s[1]); return a4 !== null && b4 !== null ? wrap(b4) + "+" + wrap(a4) : null; }
    /* sequential postfix chain: "a number doubled and then increased by 7" */
    if ((s = splitLast(p, /\s*,?\s+and\s+(?:then\s+)?(?=(?:doubled|tripled|halved|squared|cubed|increased|decreased|reduced|lowered|multiplied|divided|raised)\b)/))) {
      var left = phraseExpr(s[0]);
      return left === null ? null : applyPostfix(left, s[1]);
    }
    /* prefix operators */
    var m;
    if ((m = p.match(/^sum\s+of\s+(.+?)\s+and\s+(.+)$/))) { var x1 = phraseExpr(m[1]), y1 = phraseExpr(m[2]); return x1 !== null && y1 !== null ? wrap(x1) + "+" + wrap(y1) : null; }
    if ((m = p.match(/^product\s+of\s+(.+?)\s+and\s+(.+)$/))) { var x2 = phraseExpr(m[1]), y2 = phraseExpr(m[2]); return x2 !== null && y2 !== null ? wrap(x2) + "*" + wrap(y2) : null; }
    if ((m = p.match(/^difference\s+(?:between|of)\s+(.+?)\s+and\s+(.+)$/))) { var x3 = phraseExpr(m[1]), y3 = phraseExpr(m[2]); return x3 !== null && y3 !== null ? wrap(x3) + "-" + wrap(y3) : null; }
    if ((m = p.match(/^quotient\s+of\s+(.+?)\s+and\s+(.+)$/))) { var x4 = phraseExpr(m[1]), y4 = phraseExpr(m[2]); return x4 !== null && y4 !== null ? wrap(x4) + "/" + wrap(y4) : null; }
    /* infix, left-associative: split at the LAST additive, then multiplicative operator */
    if ((s = splitLast(p, /\s+(plus|minus|and)\s+(?!then\b)/))) {
      if (s[2][1] !== "and" || /^\d/.test(s[1])) {
        var l5 = phraseExpr(s[0]), r5 = phraseExpr(s[1]);
        if (l5 !== null && r5 !== null) return wrap(l5) + (s[2][1] === "minus" ? "-" : "+") + wrap(r5);
      }
    }
    if ((s = splitLast(p, /\s+(times|multiplied\s+by|divided\s+by|over)\s+/))) {
      var l6 = phraseExpr(s[0]), r6 = phraseExpr(s[1]);
      if (l6 !== null && r6 !== null) return wrap(l6) + (/times|multiplied/.test(s[2][1]) ? "*" : "/") + wrap(r6);
    }
    if ((s = splitFirst(p, /\s+(?:to\s+the\s+power\s+of|raised\s+to(?:\s+the\s+power\s+of)?)\s+/))) {
      var l7 = phraseExpr(s[0]), r7 = phraseExpr(s[1].replace(/(\d+)(?:st|nd|rd|th)(?:\s+power)?$/, "$1"));
      if (l7 !== null && r7 !== null) return wrap(l7) + "^" + wrap(r7);
    }
    if ((m = p.match(/^(.+?)\s+to\s+the\s+(\d+)(?:st|nd|rd|th)(?:\s+power)?$/))) { var b8 = phraseExpr(m[1]); return b8 !== null ? wrap(b8) + "^" + m[2] : null; }
    if ((m = p.match(/^(?:twice|double)\s+(.+)$/))) { e = phraseExpr(m[1]); return e !== null ? "2*" + wrap(e) : null; }
    if ((m = p.match(/^(?:triple|treble)\s+(.+)$/))) { e = phraseExpr(m[1]); return e !== null ? "3*" + wrap(e) : null; }
    if ((m = p.match(/^square\s+root\s+of\s+(.+)$/))) { e = phraseExpr(m[1]); return e !== null ? "sqrt" + "(" + e + ")" : null; }
    if ((m = p.match(/^(?:square|second\s+power)\s+of\s+(.+)$/))) { e = phraseExpr(m[1]); return e !== null ? wrap(e) + "^2" : null; }
    if ((m = p.match(/^(?:cube|third\s+power)\s+of\s+(.+)$/))) { e = phraseExpr(m[1]); return e !== null ? wrap(e) + "^3" : null; }
    if ((m = p.match(/^(-?\d+(?:\.\d+)?)\s*(?:%|percent|per\s+cent)\s+of\s+(.+)$/))) { e = phraseExpr(m[2]); return e !== null ? m[1] + "/100*" + wrap(e) : null; }
    if ((m = p.match(/^(\d+\/\d+)\s+of\s+(.+)$/))) { e = phraseExpr(m[2]); return e !== null ? m[1] + "*" + wrap(e) : null; }
    /* postfix on an atom or phrase: "a number squared", "the number halved" */
    if ((m = p.match(POSTFIX)) && m.index > 0) {
      var base = phraseExpr(p.slice(0, m.index));
      return base === null ? null : applyPostfix(base, m[1]);
    }
    return null;
  }

  /* Imperative chains acting on a running value:
     "(I) triple a number and subtract 4", "add 13 to it",
     "multiply 12 by itself", "divide it by 3 and then square it". */
  var IMP = /^(?:double|triple|quadruple|halve|square|cube|add|subtract|take\s+away|multiply|divide|times|take|start\s+with|pick|choose|think\s+of)\b/;
  function imperativeExpr(clause) {
    var c = clause.replace(/^(?:if|when|suppose|then)\s+/, "").replace(/^(?:i|you|we|they|someone|one)\s+(?:first\s+)?/, "")
                  .replace(/\s*,?\s*and\s*$/, "").trim();
    if (!IMP.test(c)) return null;
    var parts = c.split(/\s*,?\s+(?:and\s+)?then\s+|\s*,\s*(?:and\s+)?|\s+and\s+(?=(?:double|triple|quadruple|halve|square|cube|add|subtract|take\s+away|multiply|divide)\b)/);
    var run = null, i, m;
    for (i = 0; i < parts.length; i++) {
      var s = parts[i].trim().replace(/^(?:i|you|we)\s+/, "");
      if (!s) continue;
      /* "it" is the running value once there is one; before that it refers
         back to the unknown the text introduced ("a number ... add 13 to it") */
      var target = function (x) {
        if (!x || /^(?:it|the result|that|this)$/.test(x)) return run !== null ? run : (x ? "x" : null);
        return phraseExpr(x);
      };
      if ((m = s.match(/^(?:take|start\s+with|pick|choose|think\s+of)\s+(.+)$/)) && !/^away\b/.test(m[1])) {
        /* "take a number": the running value starts as that quantity */
        run = phraseExpr(m[1]);
        if (run === null) return null;
        continue;
      }
      if ((m = s.match(/^(double|triple|quadruple|halve|square|cube)\s*(.*)$/))) {
        var v = target(m[2]);
        if (v === null) return null;
        run = { double: "2*" + wrap(v), triple: "3*" + wrap(v), quadruple: "4*" + wrap(v), halve: wrap(v) + "/2",
                square: wrap(v) + "^2", cube: wrap(v) + "^3" }[m[1]];
      } else if ((m = s.match(/^add\s+(.+?)(?:\s+to\s+(.+))?$/))) {
        var a = phraseExpr(m[1]), to = m[2] ? target(m[2]) : run;
        if (a === null || to === null) return null;
        run = wrap(to) + "+" + wrap(a);
      } else if ((m = s.match(/^(?:subtract|take\s+away)\s+(.+?)(?:\s+from\s+(.+))?$/))) {
        var sb = phraseExpr(m[1]), from = m[2] ? target(m[2]) : run;
        if (sb === null || from === null) return null;
        run = wrap(from) + "-" + wrap(sb);
      } else if ((m = s.match(/^(multiply|divide|times)\s+(.+?)\s+by\s+(.+)$/)) || (m = s.match(/^(multiply|divide)\s+by\s+(.+)()$/))) {
        var lhs = m[3] === "" ? run : target(m[2]), byStr = m[3] === "" ? m[2] : m[3];
        var by = /^itself$/.test(byStr) ? lhs : phraseExpr(byStr);
        if (lhs === null || by === null) return null;
        run = wrap(lhs) + (m[1] === "divide" ? "/" : "*") + wrap(by);
      } else return null;
      if (run === null) return null;
    }
    return run;
  }

  var EQUALS = /\s+(?:is\s+equal\s+to|equals?|is|are|gives?|yields?|results\s+in|makes|comes\s+to|becomes|leaves|(?:you|i|we|they)(?:'ll)?\s+(?:get|have|end\s+up\s+with|obtain|are\s+left\s+with)|(?:in\s+order\s+)?to\s+(?:get|make|obtain|reach|end\s+up\s+with))\s+/;

  function sideExpr(p) {
    p = p.trim().replace(/,$/, "");
    return imperativeExpr(p) || phraseExpr(p.replace(/^(?:if|when)\s+/, ""));
  }

  /* Read a (possibly multi-sentence) prose problem. Returns
     { kind: "equation", eq } | { kind: "system", eqs } | { kind: "arithmetic", expr } | null */
  /* Passive voice states the same operations: "a number is multiplied by 5
     and then 2 is subtracted" is "a number multiplied by 5, decreased by 2";
     "the result is R" equates R with everything computed before it. */
  function activeVoice(t) {
    /* the target runs to the clause boundary: "8 is added to five times a
       number, the result is 48" adds 8 to the whole product */
    var TARGET = "((?:[^,;.]*?\\s)?(?:(?:a|the|some|this|that|a certain)\\s+(?:number|integer|value)|it))";
    return t
      .replace(new RegExp("\\b(-?\\d+(?:\\.\\d+)?(?:\\/\\d+)?)\\s+is\\s+added\\s+to\\s+" + TARGET + "\\b", "g"), "$1 more than $2")
      .replace(new RegExp("\\b(-?\\d+(?:\\.\\d+)?(?:\\/\\d+)?)\\s+is\\s+(?:subtracted|taken\\s+away)\\s+from\\s+" + TARGET + "\\b", "g"), "$1 less than $2")
      .replace(/\b(is|are|gets|get)\s+(multiplied|divided|increased|decreased|reduced|raised|lowered)\s+by\b/g, "$2 by")
      .replace(/\b(is|are|gets|get)\s+(doubled|tripled|quadrupled|halved|squared|cubed)\b/g, "$2")
      .replace(/\b(?:and\s+)?(?:then\s+)?(-?\d+(?:\.\d+)?(?:\/\d+)?)\s+is\s+(?:subtracted|taken\s+away)(?:\s+from\s+(?:it|that|the\s+result))?/g, " and then decreased by $1")
      .replace(/\b(?:and\s+)?(?:then\s+)?(-?\d+(?:\.\d+)?(?:\/\d+)?)\s+is\s+added(?:\s+to\s+(?:it|that|the\s+result))?/g, " and then increased by $1")
      .replace(/\s*,?\s*(?:and\s+)?the\s+(?:result|answer|outcome|total)\s+(?=is\b|equals?\b|will\s+be\b)/g, " ")
      .replace(/\bwill\s+be\b/g, "is")
      .replace(/\s+/g, " ").trim();
  }

  function prose(text) {
    var t = activeVoice(wordsToNumbers(String(text).toLowerCase().replace(/[’']/g, "'").replace(/\bi'm\b/g, "i am")));
    /* two unknowns stated as a pair of relations */
    if (/\btwo\s+(?:numbers|integers|values)\b|\b2\s+(?:numbers|integers|values)\b/.test(t)) {
      var eqs = [], m;
      var OFTHEM = "(?:\\s+of\\s+(?:the\\s+)?(?:two\\s+|2\\s+)?(?:numbers|integers|values|them)|\\s+between\\s+them)?";
      if ((m = t.match(new RegExp("\\b(?:add\\s+up\\s+to|sum\\s+to|sum" + OFTHEM + "\\s+is|have\\s+a\\s+sum\\s+of|total)\\s+(-?\\d+(?:\\.\\d+)?)")))) eqs.push("x+y=" + m[1]);
      if ((m = t.match(new RegExp("\\b(?:differ\\s+by|difference" + OFTHEM + "\\s+is|have\\s+a\\s+difference\\s+of)\\s+(-?\\d+(?:\\.\\d+)?)")))) eqs.push("x-y=" + m[1]);
      if ((m = t.match(/\bone\s+is\s+(\d+(?:\.\d+)?)\s+times\s+the\s+other\b/))) eqs.push("x=" + m[1] + "*y");
      if ((m = t.match(/\bone\s+is\s+(\d+(?:\.\d+)?)\s+more\s+than\s+the\s+other\b/))) eqs.push("x-y=" + m[1]);
      if (eqs.length === 2) return { kind: "system", eqs: eqs, reading: eqs.join(", ") };
    }
    var sentences = t.split(/(?<=[.!?;])\s+/).map(function (s) { return s.replace(/[.!?;]+$/, "").trim(); }).filter(Boolean);
    /* "... . The result is 26." -- a sentence that only states the value
       completes the computation described in the sentence before it */
    for (var k = 1; k < sentences.length; k++) {
      if (/^(?:is|equals?)\s+-?\d/.test(sentences[k])) { sentences[k - 1] = sentences[k - 1] + " " + sentences[k]; sentences.splice(k, 1); k--; }
    }
    var hasUnknown = /\b(?:a|the|some|this|that|a certain|an unknown|what|which)\s+(?:number|integer|value)\b|\bit\b/.test(t);
    for (var i = 0; i < sentences.length; i++) {
      var sent = sentences[i];
      /* the question sentence ("what is the number?") states nothing */
      if (/^(?:what|find|which|determine|solve|give)\b/.test(sent) && !/\d/.test(sent.replace(/^what\s+number/, ""))) continue;
      var clause = sent.replace(/^(?:i am thinking of a number|think of a number)\s*,?\s*/, "");
      /* "if P, (then) Q" -> P = Q's number;  "X is N" */
      var parts = null, mm;
      if ((mm = clause.match(/^(?:if|when)\s+(.+?)\s*,?\s*(?:then\s+)?(?:you|i|we|they)(?:'ll)?\s+(?:get|have|end\s+up\s+with|obtain|are\s+left\s+with)\s+(.+)$/))) parts = [mm[1], mm[2]];
      else {
        var sp = splitLast(clause, EQUALS);
        if (sp) parts = [sp[0], sp[1]];
      }
      if (!parts) continue;
      var L = sideExpr(parts[0].replace(/^what\s+number\b/, "a number")), R = sideExpr(parts[1]);
      if (L === null || R === null) continue;
      if (/x/.test(L + R) && hasUnknown) return { kind: "equation", eq: L + "=" + R, reading: L + " = " + R };
    }
    return null;
  }

  /* The same grammar for a quantity with no unknown: "the square of 17",
     "three quarters of 200", "multiply 12 by itself". */
  function proseArithmetic(text) {
    var t = wordsToNumbers(String(text).toLowerCase().replace(/[’']/g, "'"))
      .replace(/[?.!]+$/, "")
      .replace(/^(?:please\s+)?(?:what(?:'s| is| are)|what do you get (?:when|if) you|what would you get (?:when|if) you|how much is|calculate|compute|evaluate|work out|find)\s+/, "")
      .trim();
    if (!t || /\b(?:number|integer|value)\b/.test(t)) return null;
    var e = imperativeExpr(t) || phraseExpr(t);
    if (e === null || !/[-+*\/^]|sqrt/.test(e) || /x/.test(e)) return null;
    return { kind: "arithmetic", expr: e };
  }

  /* Does the text carry algebra (a variable bound to a coefficient or an
     equation in a variable)? If so, reading it as bare arithmetic ignores
     part of what was said. */
  function hasAlgebra(text) {
    var t = normMath(text);
    return /\d\s*[a-z]\b(?![a-z])/i.test(t.replace(/\b\d+\s*(?:am|pm|st|nd|rd|th|km|kg|cm|mm|m|s|h|g|l)\b/gi, "")) ||
           mathSpans(t).some(function (s) { return s.eq && Object.keys(Object.assign(varsOf(s.l), varsOf(s.r))).length; });
  }

  function parse(text) {
    var t = clean(stripLead(clean(text)));
    var mc = parseOptions(t), stem = mc.options.length ? clean(stripLead(mc.stem)) : t, i;
    for (i = 0; i < PARSERS.length; i++) {
      var P = null;
      try { P = PARSERS[i].fn(stem); } catch (e) { P = null; }
      if (P) { P.options = mc.options; return P; }
    }
    var C2 = null;
    try { C2 = compose(stem); } catch (e) { C2 = null; }
    if (C2) { C2.options = mc.options; C2.composed = true; return C2; }
    /* prose: the sentence states the equation in words */
    var pz = null;
    try { pz = prose(stem); } catch (e) { pz = null; }
    if (pz) {
      var kindP = pz.kind === "system" ? "system" : "equation";
      var P3 = PARSERS.filter(function (q) { return q.kind === kindP; })[0].fn("solve " + (pz.kind === "system" ? pz.eqs.join(", ") : pz.eq));
      if (P3) {
        P3.reading = pz.reading; P3.options = mc.options;
        P3.assumptions.push("the sentence reads as " + pz.reading);
        return P3;
      }
    }
    var pa = null;
    try { pa = proseArithmetic(stem); } catch (e) { pa = null; }
    if (pa) {
      var ea = parseExpr(pa.expr);
      if (ea && !Object.keys(varsOf(ea)).length) {
        var P4 = newProblem("arithmetic", "arithmetic", stem);
        P4.expr = ea; P4.fromProse = true; P4.reading = pa.expr; P4.unknowns = ["value"]; P4.options = mc.options;
        return P4;
      }
    }
    return null;
  }

  function cmpOk(P, j) { return P.cmp === "ge" ? j >= P.k : P.cmp === "le" ? j <= P.k : j === P.k; }

  /* ======================================================== derivations */

  function ans(value, text, method, extra) {
    var a = { value: value, text: text, method: method };
    if (extra) for (var k in extra) a[k] = extra[k];
    return a;
  }
  function fracText(f) { return f.isInt() ? f.toString() : f.toString() + " (" + fmt(f.toNumber()) + ")"; }
  function fmt(x) { var r = Math.round(x * 1e9) / 1e9; return String(r); }
  function rootsText(v, rs) {
    if (!rs.length) return "no real solution";
    return rs.map(function (r) { return v + " = " + (r instanceof Frac ? r.toString() : fmt(r)); }).join(" or ");
  }
  function rootsKey(rs) { return rs.map(function (r) { return fmt(r instanceof Frac ? r.toNumber() : r); }).join("|") || "none"; }

  var METHODS = {
    equation: [
      function (P) { if (!P.poly) return null; var r = rootsFormula(P.poly); return r && ans(r, rootsText(P.v, r), "closed-form formula", { key: rootsKey(r) }); },
      function (P) { if (!P.poly) return null; var r = rootsRational(P.poly); return r && ans(r, rootsText(P.v, r), "rational-root theorem", { key: rootsKey(r) }); },
      function (P) {
        var e = P.equations[0], v = P.v;
        var r = rootsNumeric(function (x) { var env = {}; env[v] = x; return evalFloat(e, env); });
        return ans(r, rootsText(v, r), "numeric sign-change search", { key: rootsKey(r), numeric: true });
      }
    ],
    system: [
      function (P) { var s = gaussSolve(P.A, P.b); return s && ans(s, P.vars.map(function (v, i) { return v + " = " + s[i]; }).join(", "), "Gaussian elimination", { key: s.map(String).join("|") }); },
      function (P) { var s = cramerSolve(P.A, P.b); return s && ans(s, P.vars.map(function (v, i) { return v + " = " + s[i]; }).join(", "), "Cramer's rule", { key: s.map(String).join("|") }); }
    ],
    derivative: [
      function (P) {
        var g = P.givens[0], p = toPoly(g.expr, g.v);
        if (!p) return null;
        var d = p.deriv();
        if (P.at) { var v = d.eval(P.at); return ans(v, fracText(v), "symbolic (power rule)", { key: fmt(v.toNumber()) }); }
        return ans(d, d.toString(g.v), "symbolic (power rule)", { key: "poly:" + d.c.map(String).join(",") });
      },
      function (P) {
        var g = P.givens[0], f = function (x) { var env = {}; env[g.v] = x; return evalFloat(g.expr, env); };
        if (P.at) { var v = numDeriv(f, P.at.toNumber()); return ans(v, fmt(v), "numeric central difference", { key: fmt(Math.round(v * 1e4) / 1e4), numeric: true }); }
        return null;
      }
    ],
    integral: [
      function (P) {
        var g = P.givens[0], p = toPoly(g.expr, g.v);
        if (!p) return null;
        var I = p.integ(), v = I.eval(g.b).sub(I.eval(g.a));
        return ans(v, fracText(v), "antiderivative (fundamental theorem)", { key: fmt(v.toNumber()) });
      },
      function (P) {
        var g = P.givens[0], f = function (x) { var env = {}; env[g.v] = x; return evalFloat(g.expr, env); };
        var v = simpson(f, g.a.toNumber(), g.b.toNumber());
        return ans(v, fmt(v), "Simpson's rule", { key: fmt(Math.round(v * 1e6) / 1e6), numeric: true });
      }
    ],
    choose: [
      function (P) { var v = chooseMult(P.n, P.k); return ans(v, v.toString(), "multiplicative formula", { key: v.toString() }); },
      function (P) { var v = choosePascal(P.n, P.k); return v === null ? null : ans(v, v.toString(), "Pascal's triangle", { key: v.toString() }); },
      function (P) { if (P.n > 300n) return null; var v = factB(P.n) / (factB(P.k) * factB(P.n - P.k)); return P.k > P.n ? null : ans(v, v.toString(), "factorial definition", { key: v.toString() }); }
    ],
    permute: [
      function (P) { var v = permFormula(P.n, P.k); return ans(v, v.toString(), "n!/(n-k)!", { key: v.toString() }); },
      function (P) { var v = permProduct(P.n, P.k); return ans(v, v.toString(), "falling product", { key: v.toString() }); }
    ],
    gcd: [
      function (P) { var v = gcdEuclid(P.a, P.b); return ans(v, v.toString(), "Euclid's algorithm", { key: v.toString() }); },
      function (P) {
        /* the definition, searched: the largest d dividing both */
        var hi = P.a < P.b ? P.a : P.b;
        if (hi > 2000000n || hi <= 0n) return null;
        for (var d = hi; d >= 1n; d--) if (P.a % d === 0n && P.b % d === 0n) return ans(d, d.toString(), "exhaustive search of common divisors", { key: d.toString() });
        return null;
      },
      function (P) { var v = gcdFactor(P.a, P.b); return ans(v, v.toString(), "common prime factors", { key: v.toString() }); }
    ],
    lcm: [
      function (P) { var v = P.a * P.b / gcdEuclid(P.a, P.b); return ans(v, v.toString(), "ab / gcd(a,b)", { key: v.toString() }); },
      function (P) {
        /* the definition, searched: the smallest positive multiple of both */
        var big = P.a > P.b ? P.a : P.b;
        if (P.a <= 0n || P.b <= 0n || P.a * P.b > 5000000n) return null;
        for (var m = big; m <= P.a * P.b; m += big) if (m % P.a === 0n && m % P.b === 0n) return ans(m, m.toString(), "search of common multiples", { key: m.toString() });
        return null;
      },
      function (P) {
        var fa = factorize(P.a), fb = factorize(P.b), cnt = {};
        fa.forEach(function (p) { cnt[p] = Math.max(cnt[p] || 0, fa.filter(function (q) { return q === p; }).length); });
        fb.forEach(function (p) { cnt[p] = Math.max(cnt[p] || 0, fb.filter(function (q) { return q === p; }).length); });
        var v = 1n; Object.keys(cnt).forEach(function (p) { v *= BigInt(p) ** BigInt(cnt[p]); });
        return ans(v, v.toString(), "max prime powers", { key: v.toString() });
      }
    ],
    isprime: [
      function (P) { var v = isPrimeTrial(P.n); return v === null ? null : ans(v, v ? "yes" : "no", "trial division", { key: String(v) }); },
      function (P) { var v = isPrimeMR(P.n); return ans(v, v ? "yes" : "no", "Miller-Rabin (deterministic bases)", { key: String(v) }); }
    ],
    factor: [
      function (P) { var f = factorize(P.n); return ans(f, f.join(" x "), "trial division", { key: f.join("x") }); }
    ],
    modpow: [
      function (P) { var v = modpow(P.b0, P.e, P.m); return ans(v, v.toString(), "square-and-multiply", { key: v.toString() }); },
      function (P) { var v = modpowNaive(P.b0 % P.m, P.e, P.m); return v === null ? null : ans(v, v.toString(), "repeated multiplication", { key: v.toString() }); }
    ],
    dice: [
      function (P) { var v = diceEnumerate(P.n, P.faces, P.target); return v && ans(v, fracText(v), "enumerate outcomes", { key: v.toString() }); },
      function (P) { var v = diceConvolve(P.n, P.faces, P.target); return ans(v, fracText(v), "convolution of distributions", { key: v.toString() }); }
    ],
    coins: [
      function (P) {
        var v = ZERO, j;
        for (j = 0; j <= P.n; j++) if (cmpOk(P, j)) v = v.add(binomProb(P.n, j, P.p));
        return ans(v, fracText(v), "binomial formula", { key: v.toString() });
      },
      function (P) {
        if (P.n > 20) return null;
        var pp = F(P.p), q = ONE.sub(pp), v = ZERO;
        for (var m = 0; m < (1 << P.n); m++) {
          var c = 0, x = m; while (x) { c += x & 1; x >>= 1; }
          if (cmpOk(P, c)) v = v.add(pp.pow(c).mul(q.pow(P.n - c)));
        }
        return ans(v, fracText(v), "enumerate sequences", { key: v.toString() });
      }
    ],
    mod: [
      function (P) { var r = ((P.a % P.m) + P.m) % P.m; return ans(r, r.toString(), "division algorithm", { key: r.toString() }); },
      function (P) {
        var a = P.a, m = P.m, steps = 0n;
        if ((a < 0n ? -a : a) / m > 5000000n) return null;
        while (a >= m) { a -= m; steps++; }
        while (a < 0n) { a += m; steps++; }
        return ans(a, a.toString(), "repeated subtraction", { key: a.toString() });
      }
    ],
    rangesum: [
      function (P) { var v = (P.lo + P.hi) * (P.hi - P.lo + 1n) / 2n; return ans(v, v.toString(), "Gauss pairing formula", { key: v.toString() }); },
      function (P) { if (P.hi - P.lo > 2000000n) return null; var v = 0n; for (var i = P.lo; i <= P.hi; i++) v += i; return ans(v, v.toString(), "direct summation", { key: v.toString() }); }
    ],
    series: [
      function (P) {
        var n = P.n, w = P.which, v;
        if (/odd/.test(w)) v = n * n; else if (/even/.test(w)) v = n * (n + 1n);
        else if (/square/.test(w)) v = n * (n + 1n) * (2n * n + 1n) / 6n; else if (/cube/.test(w)) v = (n * (n + 1n) / 2n) ** 2n;
        else v = n * (n + 1n) / 2n;
        return ans(v, v.toString(), "closed form", { key: v.toString() });
      },
      function (P) {
        if (P.n > 2000000n) return null;
        var s = 0n, n = P.n, w = P.which;
        for (var i = 1n; i <= n; i++) s += /odd/.test(w) ? 2n * i - 1n : /even/.test(w) ? 2n * i : /square/.test(w) ? i * i : /cube/.test(w) ? i * i * i : i;
        return ans(s, s.toString(), "direct summation", { key: s.toString() });
      }
    ],
    arithmetic: [
      function (P) { var v = evalExact(P.expr, {}); return v && ans(v, fracText(v), "exact rational arithmetic", { key: fmt(v.toNumber()) }); },
      function (P) { var v = evalFloat(P.expr, {}); return isFinite(v) ? ans(v, fmt(v), "floating point", { key: fmt(v), numeric: true }) : null; }
    ],
    path: [
      function (P) { var v = dijkstra(P.edges, P.src, P.dst); return isFinite(v) ? ans(v, fmt(v), "Dijkstra", { key: fmt(v) }) : ans(null, "no path", "Dijkstra", { key: "none" }); },
      function (P) { var v = bellmanFord(P.edges, P.src, P.dst); return isFinite(v) ? ans(v, fmt(v), "Bellman-Ford", { key: fmt(v) }) : ans(null, "no path", "Bellman-Ford", { key: "none" }); }
    ]
  };

  /* ============================================================ verifiers
     Each returns true (survived an attempt to disprove), false (disproved)
     or null (not applicable). They are chosen by problem kind, not all at
     once. */
  var VERIFIERS = {
    equation: [
      ["substitution", function (P, a) {
        var e = P.equations[0], v = P.v, rs = a.value;
        if (!rs.length) return null;
        return rs.every(function (r) {
          var env = {}; env[v] = r instanceof Frac ? r : r;
          if (r instanceof Frac) { var x = evalExact(e, env); if (x) return x.isZero(); }
          env[v] = r instanceof Frac ? r.toNumber() : r;
          return Math.abs(evalFloat(e, env)) < 1e-6 * Math.max(1, Math.abs(r instanceof Frac ? r.toNumber() : r));
        });
      }],
      ["root count bound", function (P, a) { return P.poly ? a.value.length <= P.poly.deg() : null; }],
      ["no missed sign change", function (P, a) {
        var e = P.equations[0], v = P.v, f = function (x) { var env = {}; env[v] = x; return evalFloat(e, env); };
        var num = rootsNumeric(f, -1000, 1000);
        return num.every(function (r) { return a.value.some(function (q) { return Math.abs((q instanceof Frac ? q.toNumber() : q) - r) < 1e-4; }); });
      }]
    ],
    system: [
      ["substitution", function (P, a) {
        var env = {}; P.vars.forEach(function (v, i) { env[v] = a.value[i]; });
        return P.equations.every(function (e) { var x = evalExact(e, env); return x && x.isZero(); });
      }]
    ],
    derivative: [
      ["numeric differentiation", function (P, a) {
        var g = P.givens[0], f = function (x) { var env = {}; env[g.v] = x; return evalFloat(g.expr, env); };
        var pts = P.at ? [P.at.toNumber()] : [-1.5, 0.5, 2];
        return pts.every(function (x) {
          var got = a.value instanceof Poly ? a.value.evalF(x) : (a.value instanceof Frac ? a.value.toNumber() : a.value);
          var want = numDeriv(f, x);
          return Math.abs(got - want) < 1e-3 * Math.max(1, Math.abs(want));
        });
      }],
      ["reverse: integrate back", function (P, a) {
        if (!(a.value instanceof Poly)) return null;
        var g = P.givens[0], p = toPoly(g.expr, g.v);
        if (!p) return null;
        var back = a.value.integ();
        return back.add(new Poly([p.c[0]])).eq(p);
      }]
    ],
    integral: [
      ["independent quadrature", function (P, a) {
        var g = P.givens[0], f = function (x) { var env = {}; env[g.v] = x; return evalFloat(g.expr, env); };
        var q = simpson(f, g.a.toNumber(), g.b.toNumber(), 4000), got = a.value instanceof Frac ? a.value.toNumber() : a.value;
        return Math.abs(q - got) < 1e-6 * Math.max(1, Math.abs(q));
      }],
      ["sign bound", function (P, a) {
        var g = P.givens[0], f = function (x) { var env = {}; env[g.v] = x; return evalFloat(g.expr, env); };
        var lo = g.a.toNumber(), hi = g.b.toNumber(), pos = true, neg = true;
        for (var i = 0; i <= 50; i++) { var y = f(lo + (hi - lo) * i / 50); if (y < 0) pos = false; if (y > 0) neg = false; }
        var got = a.value instanceof Frac ? a.value.toNumber() : a.value, dir = hi >= lo ? 1 : -1;
        if (pos) return got * dir >= -1e-9;
        if (neg) return got * dir <= 1e-9;
        return null;
      }]
    ],
    choose: [
      ["symmetry C(n,k)=C(n,n-k)", function (P, a) { return P.k > P.n ? null : chooseMult(P.n, P.n - P.k) === a.value; }],
      ["bound C(n,k) <= 2^n", function (P, a) { return a.value <= 2n ** P.n; }]
    ],
    permute: [["P(n,k) = C(n,k) k!", function (P, a) { return chooseMult(P.n, P.k) * factB(P.k) === a.value; }]],
    gcd: [["divides both", function (P, a) { return a.value > 0n && P.a % a.value === 0n && P.b % a.value === 0n; }],
          ["cofactors coprime", function (P, a) { return bgcd(P.a / a.value, P.b / a.value) === 1n; }]],
    lcm: [["multiple of both", function (P, a) { return a.value % P.a === 0n && a.value % P.b === 0n; }],
          ["gcd * lcm = ab", function (P, a) { return bgcd(P.a, P.b) * a.value === P.a * P.b; }]],
    isprime: [["witness factor", function (P, a) {
      var f = factorize(P.n);
      return a.value ? f.length === 1 && f[0] === P.n : f.length > 1 || P.n < 2n;
    }]],
    factor: [["product reconstructs n", function (P, a) { return a.value.reduce(function (x, y) { return x * y; }, 1n) === P.n; }],
             ["factors prime", function (P, a) { return a.value.every(function (p) { return isPrimeMR(p); }); }]],
    modpow: [["range 0 <= r < m", function (P, a) { return a.value >= 0n && a.value < P.m; }],
             ["Fermat/Euler reduction", function (P, a) {
               if (!isPrimeMR(P.m) || P.b0 % P.m === 0n) return null;
               return modpow(P.b0, P.e % (P.m - 1n), P.m) === a.value;
             }]],
    dice: [["probability in [0,1]", function (P, a) { return a.value.cmp(ZERO) >= 0 && a.value.cmp(ONE) <= 0; }],
           ["symmetry about the mean", function (P, a) {
             var mirror = P.n * (P.faces + 1) - P.target;
             return diceConvolve(P.n, P.faces, mirror).eq(a.value);
           }]],
    coins: [["probability in [0,1]", function (P, a) { return a.value.cmp(ZERO) >= 0 && a.value.cmp(ONE) <= 0; }],
            ["distribution sums to 1", function (P, a) {
              var s = ZERO; for (var k = 0; k <= P.n && P.n <= 60; k++) s = s.add(binomProb(P.n, k, P.p)); return s.eq(ONE);
            }]],
    series: [["small-case induction", function (P, a) {
      var small = { n: 3n, which: P.which }, m = METHODS.series;
      return m[0](small).key === m[1](small).key;
    }], ["parity/magnitude", function (P, a) { return a.value >= P.n; }]],
    mod: [["range 0 <= r < m", function (P, a) { return a.value >= 0n && a.value < P.m; }],
          ["a - r is a multiple of m", function (P, a) { return (P.a - a.value) % P.m === 0n; }]],
    rangesum: [["mean times count", function (P, a) { return a.value * 2n === (P.lo + P.hi) * (P.hi - P.lo + 1n); }],
               ["bounds", function (P, a) { var n = P.hi - P.lo + 1n; return a.value >= P.lo * n && a.value <= P.hi * n; }]],
    path: [["triangle inequality on direct edges", function (P, a) {
      if (a.value === null) return null;
      var direct = P.edges.filter(function (e) { return (e[0] === P.src && e[1] === P.dst) || (e[1] === P.src && e[0] === P.dst); });
      return direct.every(function (e) { return a.value <= e[2] + 1e-9; });
    }]]
  };

  /* =============================================================== solve */

  function solveProblem(P) {
    var graph = K ? new K.ReasoningGraph() : null;
    if (graph) {
      graph.know("problem:" + P.kind);
      P.assumptions.forEach(function (a) { graph.assume("assume:" + a, "stated by the problem type"); });
    }
    var methods = METHODS[P.kind] || [], cands = [], i;
    for (i = 0; i < methods.length; i++) {
      var a = null;
      try { a = methods[i](P); } catch (e) { a = null; }
      if (a && a.key !== undefined) cands.push(a);
    }
    if (!cands.length) return null;
    var vers = VERIFIERS[P.kind] || [];
    var diagnoses = [];
    cands.forEach(function (c) {
      c.checks = [];
      vers.forEach(function (v) {
        var r = null;
        try { r = v[1](P, c); } catch (e) { r = false; }
        if (r !== null) c.checks.push({ name: v[0], pass: !!r });
      });
      c.pass = c.checks.filter(function (x) { return x.pass; }).length;
      c.fail = c.checks.length - c.pass;
      if (graph) {
        var k = "answer:" + c.method + "=" + c.key;
        graph.derive(k, ["problem:" + P.kind].concat(P.assumptions.map(function (a) { return "assume:" + a; })), c.method);
        if (c.fail) {
          graph.refute(k, c.checks.filter(function (x) { return !x.pass; }).map(function (x) { return x.name; }).join(", "));
          diagnoses.push({ kind: c.numeric ? FAIL.ARITHMETIC_ERROR : FAIL.BAD_INFERENCE, method: c.method,
                           failed: c.checks.filter(function (x) { return !x.pass; }).map(function (x) { return x.name; }) });
        }
      }
    });
    /* group candidates by answer; a falsified derivation does not vote */
    var groups = {};
    cands.forEach(function (c) {
      var g = groups[c.key] || (groups[c.key] = { key: c.key, members: [], pass: 0, total: 0, fail: 0 });
      g.members.push(c);
      g.pass += c.pass; g.total += c.checks.length; g.fail += c.fail;
    });
    var ranked = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) {
      var sa = (a.fail ? 0 : 1), sb = (b.fail ? 0 : 1);
      return (sb - sa) || (b.members.length - a.members.length) || (b.pass - a.pass) || (a.key < b.key ? -1 : 1);
    });
    var best = ranked[0], survivors = ranked.filter(function (g) { return !g.fail; });
    /* multiple choice: eliminate options that are not the derived answer */
    var choice = null;
    if (P.options && P.options.length) choice = pickOption(P, best);
    var exactRep = best.members.filter(function (m) { return !m.numeric; })[0] || best.members[0];
    var cal = K ? K.calibrate({
      derivations: best.fail ? 1 : best.members.length,
      disagreements: survivors.length > 1 ? survivors.length - 1 : 0,
      verifierPass: Math.min(best.pass, 4), verifierTotal: Math.min(best.total, 4 + best.fail),
      contradictions: best.fail ? 1 : 0,
      assumptions: P.assumptions.length,
      knowledgeCompleteness: 1
    }) : { confidence: 0.5 };
    if (graph) graph.derive("selected:" + best.key, [], "agreement");
    return {
      ok: !best.fail, kind: P.kind, domain: P.domain, problem: P,
      answer: exactRep.text, value: exactRep.value, choice: choice,
      derivations: cands.map(function (c) { return { method: c.method, answer: c.text, checks: c.checks }; }),
      agreeing: best.members.map(function (m) { return m.method; }),
      eliminated: cands.filter(function (c) { return c.fail; }).map(function (c) { return c.method; }),
      diagnoses: diagnoses, confidence: cal.confidence, calibration: cal,
      status: graph ? graph.summary() : null, assumptions: P.assumptions.slice()
    };
  }

  function pickOption(P, best) {
    var rep = best.members[0], val = rep.value, out = [], i;
    function asNum(x) { return x instanceof Frac ? x.toNumber() : typeof x === "bigint" ? Number(x) : typeof x === "number" ? x : null; }
    for (i = 0; i < P.options.length; i++) {
      var o = P.options[i], e = parseExpr(o.text.replace(/^[a-z]\s*=\s*/i, "")), v = e ? evalExact(e, {}) : null;
      var on = v ? v.toNumber() : (e ? evalFloat(e, {}) : NaN), bn = asNum(Array.isArray(val) ? val[0] : val);
      var ok = (bn !== null && isFinite(on) && Math.abs(on - bn) < 1e-9 * Math.max(1, Math.abs(bn))) ||
               o.text.toLowerCase() === String(rep.text).toLowerCase();
      out.push({ label: o.label, text: o.text, eliminated: !ok });
    }
    var alive = out.filter(function (o) { return !o.eliminated; });
    return { options: out, answer: alive.length === 1 ? alive[0].label : null };
  }

  /* ================================================ derivation checking
   *
   * A derivation is a chain  E0 = E1 = E2 ...  (one expression per line, or
   * "=" separated). Each step must be an IDENTITY in its variables: checked
   * exactly as polynomials when possible, else numerically at several
   * points. The first failing step is located, classified, and repaired by
   * recomputing the step from its predecessor. */
  function checkDerivation(steps) {
    var exprs = steps.map(function (s) { return parseExpr(String(s).replace(/^\s*=\s*/, "")); });
    var out = { steps: steps.length, valid: true, firstInvalid: null, diagnosis: null, repaired: null, checks: [] };
    for (var i = 1; i < exprs.length; i++) {
      var a = exprs[i - 1], b = exprs[i];
      if (!a || !b) { out.checks.push({ step: i, ok: null, why: "unparsed" }); continue; }
      var vs = Object.keys(Object.assign(varsOf(a), varsOf(b))), ok;
      if (vs.length <= 1) {
        var v = vs[0] || "x", pa = toPoly(a, v), pb = toPoly(b, v);
        if (pa && pb) ok = pa.eq(pb);
      }
      if (ok === undefined) {
        ok = true;
        var pts = [0.37, 1.9, -2.3, 3.1];
        for (var k = 0; k < pts.length && ok; k++) {
          var env = {}; vs.forEach(function (v2, j) { env[v2] = pts[(k + j) % pts.length]; });
          var x = evalFloat(a, env), y = evalFloat(b, env);
          if (isFinite(x) && isFinite(y) && Math.abs(x - y) > 1e-7 * Math.max(1, Math.abs(x))) ok = false;
        }
      }
      out.checks.push({ step: i, ok: ok });
      if (!ok && out.valid) {
        out.valid = false; out.firstInvalid = i;
        var hasVars = vs.length > 0;
        out.diagnosis = hasVars ? FAIL.BAD_INFERENCE : FAIL.ARITHMETIC_ERROR;
        /* repair: carry the correct value/form forward from the last good line */
        if (!hasVars) { var ev = evalExact(a, {}); out.repaired = { step: i, value: ev ? ev.toString() : fmt(evalFloat(a, {})) }; }
        else { var pa2 = toPoly(a, vs[0]); if (pa2) out.repaired = { step: i, value: pa2.toString(vs[0]) }; }
      }
    }
    return out;
  }

  /* =========================================== knowledge vs. reasoning */

  /* Is this question something to DERIVE (all needed facts are in the
     question) or something to KNOW (it needs facts that are not)? */
  function analyze(text) {
    var P = parse(text), S = structure(text, P);
    if (P) return { kind: "derivable", problem: P.kind, requiredKnowledge: [], knowledgeCompleteness: 1,
                    classes: S.classes, structure: S };
    var t = clean(text), need = [];
    var m = t.match(/^(?:what|who|which|when|where)\s+(?:is|was|are|were|did|does)\s+(?:the\s+)?(.+)$/i);
    if (m) need.push(m[1]);
    return { kind: need.length ? "knowledge" : "unknown", requiredKnowledge: need, knowledgeCompleteness: 0,
             classes: S.classes, structure: S };
  }

  /* ============================================= structured problems
   *
   * Every question, parsed or not, as a structure the deliberation layer
   * (c4-lm-deliberate.js) can reason over:
   *   domain, kind, givens, unknowns, constraints, claims, equations,
   *   requiredKnowledge, possibleTools, ambiguities, assumptions, numbers,
   *   units, classes
   * classes: reasoning-heavy | knowledge-heavy | mixed | computation-heavy |
   *   retrieval-required | multimodal | underdetermined | ambiguous
   * Each class is assigned from general cues (what the text contains), not
   * from any list of known questions; a question the templates do not cover
   * still gets a structure instead of being forced into one. */
  var FRESH = /\b(?:today|now|currently|current|latest|recent|this (?:year|week|month)|as of|price|stock|version|release|weather|news|live)\b/i;
  var VISUAL = /\b(?:figure|diagram|image|picture|graph shown|chart|shown below|shown above|the plot|in the photo|drawing)\b/i;
  var KNOWLEDGE = /^(?:who|what|which|when|where)\b|\b(?:capital|author|invented|discovered|founded|born|died|population|located|named after|defined as|meaning of)\b/i;
  var REASONING = /\b(?:if|then|therefore|implies|must|cannot|all|none|some|every|each|at least|at most|exactly|unless|only if|either|neither|prove|show that|deduce|consistent)\b/i;
  var COMPUTE = /\d|\b(?:sum|product|how many|how much|calculate|compute|solve|probability|average|total|percent|ratio|rate)\b/i;
  var UNIT_RE = /\b(\d+(?:\.\d+)?)\s*(km\/h|mph|m\/s|km|kilometers?|miles?|meters?|m|cm|mm|kg|kilograms?|g|grams?|lb|pounds?|hours?|h|minutes?|min|seconds?|s|liters?|L|gallons?|dollars?|\$|%)\b/gi;

  function structure(text, P) {
    var t = clean(text), low = t.toLowerCase();
    if (P === undefined) { try { P = parse(text); } catch (e) { P = null; } }
    var S = {
      domain: P ? P.domain : "general", kind: P ? P.kind : null, text: t,
      givens: P ? P.givens.slice() : [], unknowns: P ? P.unknowns.slice() : [],
      constraints: P ? (P.constraints || []).slice() : [], claims: [], equations: P && P.equations ? P.equations.slice() : [],
      requiredKnowledge: [], possibleTools: [], ambiguities: [], assumptions: P ? P.assumptions.slice() : [],
      numbers: (t.match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []).slice(0, 24), units: [], classes: []
    };
    var m;
    UNIT_RE.lastIndex = 0;
    while ((m = UNIT_RE.exec(t))) S.units.push({ value: m[1], unit: m[2] });
    /* equations written in the text, parsed or not */
    t.split(/[,;]|\band\b/).forEach(function (seg) { if (/=/.test(seg) && /[a-z]/i.test(seg)) S.equations.push(seg.trim()); });
    if (!S.unknowns.length) {
      var q = t.match(/\b(?:what|find|compute|calculate|determine|how many|how much)\b\s*(?:is|are|was|the)?\s*([^?.,]{2,60})/i);
      if (q) S.unknowns.push(q[1].trim());
    }
    /* sentences stating something are claims to be checked, not assumed */
    t.split(/(?<=[.!])\s+/).forEach(function (sen) {
      if (!/\?\s*$/.test(sen) && /\b(?:is|are|was|were|has|have|equals?)\b/i.test(sen) && sen.length > 8) S.claims.push(sen.trim());
    });
    if (root.C4LMTools && root.C4LMTools.suggest) { try { S.possibleTools = root.C4LMTools.suggest(P, t); } catch (e) { S.possibleTools = []; } }
    /* a "what is" question over stated numbers that an exact tool covers is
       a computation, not a fact to look up */
    var kn = KNOWLEDGE.test(t) && !P && !(S.possibleTools.length && S.numbers.length >= 2);
    if (kn) {
      var need = t.match(/^(?:what|who|which|when|where)\s+(?:is|was|are|were|did|does)\s+(?:the\s+)?(.+)$/i);
      S.requiredKnowledge.push(need ? need[1] : t);
    }
    var comp = !!P || (COMPUTE.test(t) && S.numbers.length >= 2);
    var reason = REASONING.test(t) && (S.claims.length >= 1 || /\b(?:if|then|therefore|must)\b/i.test(t));
    if (comp) S.classes.push("computation-heavy");
    if (reason || (P && ["system", "csp", "path", "mc"].indexOf(P.kind) >= 0)) S.classes.push("reasoning-heavy");
    if (kn) S.classes.push("knowledge-heavy");
    if (kn && (comp || reason)) S.classes.push("mixed");
    if (FRESH.test(t)) S.classes.push("retrieval-required");
    if (VISUAL.test(t)) S.classes.push("multimodal");
    /* under-determined: a rate with nothing to apply it to, or an unknown
       quantity with fewer givens than it needs (read by the comprehension
       stage when it is loaded) */
    var CMP = root.C4LMComprehend;
    if (CMP && CMP.solveQuantity && !P) {
      try { var sq = CMP.solveQuantity(text); if (sq && sq.status && sq.status !== "solved" && sq.missing) { S.classes.push("underdetermined"); S.ambiguities.push("missing: " + sq.missing); } } catch (e) {}
    }
    if (/^(?:it|they|this|that|he|she)\b/i.test(t) && !P) { S.ambiguities.push("pronoun without antecedent"); }
    if (/\b(\w+)\s+or\s+(\w+)\s*\?\s*$/i.test(text) && !P) S.ambiguities.push("alternative readings");
    if (S.ambiguities.length && S.classes.indexOf("underdetermined") < 0) S.classes.push("ambiguous");
    if (!S.classes.length) S.classes.push(kn ? "knowledge-heavy" : "reasoning-heavy");
    return S;
  }

  /* ================================================== answer for the LM */

  /* Independent re-derivation of a value another component computed, for
     calibration: returns kernel-calibrated confidence and whether the two
     agree. ``expr`` is the arithmetic the other component evaluated. */
  function verifyValue(expr, value) {
    var e = parseExpr(String(expr || ""));
    if (!e || Object.keys(varsOf(e)).length) return null;
    var ex = evalExact(e, {}), fl = evalFloat(e, {});
    var v = typeof value === "number" ? value : parseFloat(value);
    var agreeExact = ex ? Math.abs(ex.toNumber() - v) <= 1e-9 * Math.max(1, Math.abs(v)) : null;
    var agreeFloat = isFinite(fl) ? Math.abs(fl - v) <= 1e-9 * Math.max(1, Math.abs(v)) : null;
    var agree = [agreeExact, agreeFloat].filter(function (x) { return x === true; }).length;
    var dis = [agreeExact, agreeFloat].filter(function (x) { return x === false; }).length;
    var cal = K ? K.calibrate({ derivations: 1 + agree, disagreements: dis, verifierPass: agree, verifierTotal: agree + dis,
                                contradictions: dis ? 1 : 0 }) : { confidence: 0.5 };
    return { agree: !dis && agree > 0, exact: ex ? ex.toString() : null, confidence: cal.confidence, calibration: cal };
  }

  /* Recompute each step of another component's trace ("25% of 80 is 20",
     "80 - 20 = 60") exactly. Steps it cannot read are not counted. */
  function verifySteps(steps) {
    var checked = 0, passed = 0, failed = [];
    (steps || []).forEach(function (st) {
      var s2 = String(st).replace(/,(?=\d{3}\b)/g, ""), m, lhs, rhs;
      if ((m = s2.match(/(-?[\d.]+)\s*%\s*of\s*(-?[\d.]+)\s*(?:is|=)\s*(-?[\d.]+)/i))) { lhs = m[1] + "*" + m[2] + "/100"; rhs = m[3]; }
      else if ((m = s2.match(/^([\d\s.+\-*\/^()]+)=\s*(-?[\d.]+)\s*$/))) { lhs = m[1]; rhs = m[2]; }
      else return;
      var e = parseExpr(lhs), v = parseFloat(rhs);
      if (!e || !isFinite(v)) return;
      checked++;
      var x = evalExact(e, {}), got = x ? x.toNumber() : evalFloat(e, {});
      /* the trace prints rounded values: agree to the printed precision */
      var dec = (String(rhs).split(".")[1] || "").length, tol = dec ? Math.pow(10, -dec) : 1e-9;
      if (Math.abs(got - v) <= tol * Math.max(1, dec ? 1 : Math.abs(v))) passed++; else failed.push(st);
    });
    return { checked: checked, passed: passed, failed: failed };
  }

  /* Extrapolate a numeric sequence two independent ways: Newton forward
     differences (polynomial) and a constant ratio (geometric). */
  function extrapolate(nums) {
    var out = [], d = nums.slice(), levels = [], k;
    for (k = 0; k < 4 && d.length > 1; k++) {
      levels.push(d);
      var nd = []; for (var i = 1; i < d.length; i++) nd.push(d[i] - d[i - 1]);
      d = nd;
      if (d.length >= 2 && d.every(function (x) { return Math.abs(x - d[0]) < 1e-9; })) {
        var next = d[0];
        for (var j = levels.length - 1; j >= 0; j--) next = levels[j][levels[j].length - 1] + next;
        out.push({ method: "finite differences (order " + (k + 1) + ")", value: next });
        break;
      }
    }
    if (nums.length >= 3 && nums.every(function (x) { return x !== 0; })) {
      var r = nums[1] / nums[0];
      if (nums.every(function (x, i2) { return i2 === 0 || Math.abs(x / nums[i2 - 1] - r) < 1e-9; }))
        out.push({ method: "constant ratio", value: nums[nums.length - 1] * r });
    }
    return out;
  }

  function answer(text) {
    var P = parse(text);
    if (!P) return null;
    var r = solveProblem(P);
    if (!r) return null;
    var lead = r.choice && r.choice.answer ? "(" + r.choice.answer + ") " : "";
    /* a question asked in words about "the number" is answered in words */
    if (P.reading && P.kind === "equation" && Array.isArray(r.value) && r.value.length) {
      r.answer = "The number is " + r.value.map(function (v) { return v instanceof Frac ? v.toString() : fmt(v); }).join(" or ");
    }
    if (P.reading && P.kind === "arithmetic") r.answer = r.answer + " (" + P.reading.replace(/\*/g, " × ") + ")";
    var how = r.agreeing.length > 1 ? " Checked by " + r.agreeing.length + " independent methods (" + r.agreeing.join(", ") + ")" : " Derived by " + r.agreeing[0];
    var checks = [];
    r.derivations.forEach(function (d) { d.checks.forEach(function (c) { if (c.pass && checks.indexOf(c.name) < 0) checks.push(c.name); }); });
    if (checks.length) how += "; verified by " + checks.join(", ");
    var body = lead + r.answer + "." + how + ".";
    if (r.assumptions.length) body += " Assuming " + r.assumptions.join("; ") + ".";
    if (!r.ok) body = "I could not verify an answer: every derivation failed a check (" + r.eliminated.join(", ") + ").";
    r.text = body;
    return r;
  }

  /* ======================================== multimodal / visual facts
   *
   * Perception is not implemented here; this is the INTERFACE through which
   * extracted visual structure enters the same reasoning graph as text.
   * Input: [{type: POINT|LINE|SEGMENT|REGION|AXIS|ARROW|LABEL|TEXT|RELATION, ...}].
   * Output: propositions with KNOWN status, geometric facts DERIVED from
   * coordinates when coordinates are given, and contradictions between what
   * was stated and what the coordinates imply. */
  function visualGraph(facts) {
    var G = K ? new K.ReasoningGraph() : null, pts = {}, lines = {}, regions = {}, props = [];
    if (!G) return null;
    facts.forEach(function (f) {
      var T = String(f.type).toUpperCase();
      if (T === "POINT") { pts[f.id] = f; G.know("point:" + f.id); }
      else if (T === "LINE" || T === "SEGMENT") { lines[f.id] = f; G.know((T === "LINE" ? "line:" : "segment:") + f.id); (f.through || []).forEach(function (p) { G.know("on:" + p + ":" + f.id); }); }
      else if (T === "REGION") { regions[f.id] = f; G.know("region:" + f.id); (f.contains || []).forEach(function (p) { G.know("in:" + p + ":" + f.id); }); }
      else if (T === "ARROW") G.know("arrow:" + f.from + "->" + f.to);
      else if (T === "LABEL" || T === "TEXT") G.know("label:" + f.text + "@" + (f.at || ""));
      else if (T === "AXIS") G.know("axis:" + f.id);
      else if (T === "RELATION") G.know(f.rel + ":" + f.a + ":" + f.b, { source: "stated" });
    });
    function vec(seg) { var t = lines[seg] && lines[seg].through; if (!t || !pts[t[0]] || !pts[t[1]] || pts[t[0]].x === undefined) return null; return [pts[t[1]].x - pts[t[0]].x, pts[t[1]].y - pts[t[0]].y]; }
    var ids = Object.keys(lines), i, j;
    for (i = 0; i < ids.length; i++) for (j = i + 1; j < ids.length; j++) {
      var u = vec(ids[i]), w = vec(ids[j]);
      if (!u || !w) continue;
      var dot = u[0] * w[0] + u[1] * w[1], cr = u[0] * w[1] - u[1] * w[0], nu = Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]);
      if (Math.abs(dot) < 1e-9 * nu) G.derive("perpendicular:" + ids[i] + ":" + ids[j], ["line:" + ids[i], "line:" + ids[j]].filter(function (k) { return G.get(k); }), "coordinates");
      else G.derive("not:perpendicular:" + ids[i] + ":" + ids[j], ["line:" + ids[i], "line:" + ids[j]].filter(function (k) { return G.get(k); }), "coordinates");
      if (Math.abs(cr) < 1e-9 * nu) G.derive("parallel:" + ids[i] + ":" + ids[j], [], "coordinates");
      else G.derive("not:parallel:" + ids[i] + ":" + ids[j], [], "coordinates");
    }
    /* a point stated to lie on a line must be collinear with its definers */
    Object.keys(lines).forEach(function (l) {
      var t = lines[l].through || [];
      if (t.length < 3) return;
      var a = pts[t[0]], b = pts[t[1]];
      for (var k = 2; k < t.length; k++) {
        var c = pts[t[k]];
        if (!a || !b || !c || a.x === undefined) continue;
        var area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (Math.abs(area) > 1e-9) G.derive("not:on:" + t[k] + ":" + l, [], "coordinates");
      }
    });
    return G;
  }
  function visualQuery(facts, q) {
    var G = visualGraph(facts), p = G.get(q), n = G.get("not:" + q);
    var status = p ? p.status : (n ? (n.status === "CONTRADICTED" ? "UNKNOWN" : "REFUTED") : "UNKNOWN");
    return { query: q, status: status, graph: G, diagnoses: G.diagnose() };
  }

  var PR = {
    Frac: Frac, Poly: Poly, parseExpr: parseExpr, evalExact: evalExact, evalFloat: evalFloat, toPoly: toPoly, varsOf: varsOf,
    rootsFormula: rootsFormula, rootsRational: rootsRational, rootsNumeric: rootsNumeric,
    gaussSolve: gaussSolve, cramerSolve: cramerSolve, det: det,
    chooseMult: chooseMult, choosePascal: choosePascal, permFormula: permFormula, factorize: factorize,
    isPrimeMR: isPrimeMR, isPrimeTrial: isPrimeTrial, modpow: modpow, gcdEuclid: gcdEuclid,
    diceConvolve: diceConvolve, diceEnumerate: diceEnumerate, binomProb: binomProb,
    numDeriv: numDeriv, simpson: simpson, dijkstra: dijkstra, bellmanFord: bellmanFord, csp: csp,
    parse: parse, parseOptions: parseOptions, solveProblem: solveProblem, answer: answer,
    checkDerivation: checkDerivation, analyze: analyze, structure: structure, verifyValue: verifyValue,
    verifySteps: verifySteps, extrapolate: extrapolate, compose: compose, hasAlgebra: hasAlgebra, mathSpans: mathSpans,
    prose: prose, proseArithmetic: proseArithmetic, phraseExpr: phraseExpr, imperativeExpr: imperativeExpr,
    wordsToNumbers: wordsToNumbers, visualGraph: visualGraph, visualQuery: visualQuery,
    METHODS: METHODS, VERIFIERS: VERIFIERS
  };
  root.C4LMProblem = PR;
  if (typeof module !== "undefined" && module.exports) module.exports = PR;
})(typeof window !== "undefined" ? window : globalThis);
