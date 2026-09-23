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
    ["derivative", /\b(?:derivative|differentiate|d\/d[a-z]|slope of the tangent|rate of change)\b|\b[a-z]'\s*\(/i],
    ["integral", /\b(?:integral|integrate|area under)\b|\u222b/i],
    ["choose", /\b(?:choose|combinations?|committees?|subsets?|select(?:ed|ing)?|pick(?:ed|ing)?)\b|\bC\(\s*\d/],
    ["permute", /\b(?:permutations?|arrange(?:ments?)?|orderings?|ordered)\b|\bP\(\s*\d/],
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
                  eleven: 11, twelve: 12, once: 1, twice: 2, thrice: 3 };
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

  function compose(t) {
    var intent = null, i;
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
      var nd = near(t, ints, "dice|die"), tm = t.match(/\b(?:sum|total)\b[^\d]{0,24}(\d+)/i) || t.match(/(\d+)[^\d]{0,12}\b(?:sum|total)\b/i);
      if (!nd || !tm) return null;
      P = newProblem("probability", "dice", t);
      P.n = nd; P.faces = 6; P.target = parseInt(tm[1], 10);
      P.assumptions.push("the dice are fair and independent"); P.unknowns = ["probability"];
      return P.n >= 1 && P.n <= 8 ? P : null;
    }
    if (intent === "coins") {
      var kk = near(t, ints, "heads|tails"), nn = near(t, ints, "times|flips|tosses|coins|coin flips|coin tosses");
      if (kk === null || nn === null || kk > nn) return null;
      P = newProblem("probability", "coins", t);
      P.k = kk; P.n = nn; P.p = "0.5";
      P.assumptions.push("the coin is fair and flips are independent"); P.unknowns = ["probability"];
      return P;
    }
    return null;
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
    return null;
  }

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
      function (P) { var v = gcdFactor(P.a, P.b); return ans(v, v.toString(), "common prime factors", { key: v.toString() }); }
    ],
    lcm: [
      function (P) { var v = P.a * P.b / gcdEuclid(P.a, P.b); return ans(v, v.toString(), "ab / gcd(a,b)", { key: v.toString() }); },
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
      function (P) { var v = binomProb(P.n, P.k, P.p); return ans(v, fracText(v), "binomial formula", { key: v.toString() }); },
      function (P) { var v = binomEnumerate(P.n, P.k, P.p); return v && ans(v, fracText(v), "enumerate sequences", { key: v.toString() }); }
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
    var P = parse(text);
    if (P) return { kind: "derivable", problem: P.kind, requiredKnowledge: [], knowledgeCompleteness: 1 };
    var t = clean(text), need = [];
    var m = t.match(/^(?:what|who|which|when|where)\s+(?:is|was|are|were|did|does)\s+(?:the\s+)?(.+)$/i);
    if (m) need.push(m[1]);
    return { kind: need.length ? "knowledge" : "unknown", requiredKnowledge: need, knowledgeCompleteness: 0 };
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
    Frac: Frac, Poly: Poly, parseExpr: parseExpr, evalExact: evalExact, evalFloat: evalFloat, toPoly: toPoly,
    rootsFormula: rootsFormula, rootsRational: rootsRational, rootsNumeric: rootsNumeric,
    gaussSolve: gaussSolve, cramerSolve: cramerSolve, det: det,
    chooseMult: chooseMult, choosePascal: choosePascal, permFormula: permFormula, factorize: factorize,
    isPrimeMR: isPrimeMR, isPrimeTrial: isPrimeTrial, modpow: modpow, gcdEuclid: gcdEuclid,
    diceConvolve: diceConvolve, diceEnumerate: diceEnumerate, binomProb: binomProb,
    numDeriv: numDeriv, simpson: simpson, dijkstra: dijkstra, bellmanFord: bellmanFord, csp: csp,
    parse: parse, parseOptions: parseOptions, solveProblem: solveProblem, answer: answer,
    checkDerivation: checkDerivation, analyze: analyze, verifyValue: verifyValue,
    verifySteps: verifySteps, extrapolate: extrapolate, compose: compose, hasAlgebra: hasAlgebra, mathSpans: mathSpans, visualGraph: visualGraph, visualQuery: visualQuery,
    METHODS: METHODS, VERIFIERS: VERIFIERS
  };
  root.C4LMProblem = PR;
  if (typeof module !== "undefined" && module.exports) module.exports = PR;
})(typeof window !== "undefined" ? window : globalThis);
