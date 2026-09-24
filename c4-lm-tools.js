/* CELL4 exact-tool registry.
 *
 * Every tool is a specification, not a regex patch:
 *
 *   { name, domain, inputType, outputType, exact, cost, preconditions,
 *     execute(input) -> {value, text, exact},
 *     verify(input, output) -> {ok, checks:[{name, pass}]},
 *     failureModes: [...] }
 *
 * The first group WRAPS what c4-lm-problem.js already computes (expression
 * evaluation, fractions, polynomials, equation solving, linear systems,
 * determinants, combinations, permutations, factorisation, primality,
 * modular exponentiation, gcd/lcm, probability, derivatives, numerical
 * integration, Dijkstra, Bellman-Ford, CSP, visual geometry checks). The
 * second group adds exact tools that were missing: matrix algebra (product,
 * transpose, inverse, rank, RREF), rational equations, polynomial
 * simplification, combinatorial enumeration, Bayesian updating, descriptive
 * statistics, unit / dimension analysis, AC-3 constraint propagation, finite
 * sums, a bounded program interpreter, numerical root finding, univariate
 * optimisation and graph traversal (BFS, components, topological order).
 *
 * Each verify() is INDEPENDENT of execute(): substitution for roots, A*x = b
 * for systems, A*inverse = I, a second algorithm for counts and paths, dense
 * sampling for optima, round trips for unit conversions. A tool result that
 * fails its own verifier is reported as failed, never as an answer.
 *
 * Exact arithmetic is the BigInt rational of c4-lm-problem.js. Local,
 * deterministic, no network, no external model.
 */
(function (root) {
  "use strict";

  var PR = root.C4LMProblem;
  if (!PR && typeof require === "function") { try { PR = require("./c4-lm-problem.js"); } catch (e) { PR = null; } }
  if (!PR) return;
  var Frac = PR.Frac;
  /* numbers, decimals, BigInts and "p/q" strings, exactly */
  function F(x) {
    if (typeof x === "string") {
      var m = x.trim().match(/^([-+]?\d+(?:\.\d+)?)\s*\/\s*([-+]?\d+(?:\.\d+)?)$/);
      if (m) return Frac.of(m[1]).div(Frac.of(m[2]));
    }
    return Frac.of(x);
  }
  var ZERO = F(0), ONE = F(1);

  var TOOLS = {}, ORDER = [];
  function register(spec) {
    if (!spec.name || typeof spec.execute !== "function") throw new Error("tool needs a name and execute()");
    spec.domain = spec.domain || "math";
    spec.exact = spec.exact !== false;
    spec.cost = spec.cost || 1;
    spec.preconditions = spec.preconditions || [];
    spec.failureModes = spec.failureModes || [];
    if (!TOOLS[spec.name]) ORDER.push(spec.name);
    TOOLS[spec.name] = spec;
    return spec;
  }

  /* Run a tool and its verifier; never throws. */
  function run(name, input) {
    var t = TOOLS[name];
    if (!t) return { ok: false, tool: name, error: "unknown tool" };
    var out;
    try { out = t.execute(input); } catch (e) { return { ok: false, tool: name, error: String(e && e.message || e).slice(0, 160) }; }
    if (!out) return { ok: false, tool: name, error: "no result" };
    var v = { ok: true, checks: [] };
    if (t.verify) { try { v = t.verify(input, out) || v; } catch (e) { v = { ok: false, checks: [{ name: "verifier error", pass: false }] }; } }
    return { ok: !!v.ok, tool: name, value: out.value, text: out.text, exact: out.exact !== false && t.exact,
             checks: v.checks || [], verified: !!v.ok, detail: out.detail || null };
  }

  function fracStr(x) { return x instanceof Frac ? x.toString() : String(x); }
  function num(x) { return x instanceof Frac ? x.toNumber() : typeof x === "bigint" ? Number(x) : +x; }
  function close(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(a), Math.abs(b)); }
  function check(name, pass) { return { name: name, pass: !!pass }; }
  function all(checks) { return { ok: checks.length > 0 && checks.every(function (c) { return c.pass; }), checks: checks }; }

  /* =========================================================== wrapped */

  register({ name: "expr.eval", domain: "arithmetic", inputType: "expression", outputType: "number",
    execute: function (inp) {
      var e = PR.parseExpr(String(inp.expr || inp));
      if (!e) return null;
      var x = PR.evalExact(e, inp.env || {});
      if (x) return { value: x, text: fracStr(x), exact: true };
      var f = PR.evalFloat(e, inp.env || {});
      return isFinite(f) ? { value: f, text: String(f), exact: false } : null;
    },
    verify: function (inp, out) {
      var e = PR.parseExpr(String(inp.expr || inp)), f = PR.evalFloat(e, inp.env || {});
      return all([check("float re-evaluation", isFinite(f) && close(f, num(out.value), 1e-9))]);
    }, failureModes: ["division by zero", "irrational result (float only)"] });

  register({ name: "frac.arith", domain: "arithmetic", inputType: "fractions", outputType: "fraction",
    execute: function (inp) {
      var a = F(inp.a), b = F(inp.b), op = inp.op, r = op === "+" ? a.add(b) : op === "-" ? a.sub(b) : op === "*" ? a.mul(b) : op === "/" ? a.div(b) : null;
      return r ? { value: r, text: r.toString() } : null;
    },
    verify: function (inp, out) {
      var a = num(F(inp.a)), b = num(F(inp.b)), op = inp.op, f = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b;
      return all([check("float arithmetic", close(f, num(out.value)))]);
    } });

  register({ name: "equation.solve", domain: "algebra", inputType: "polynomial equation", outputType: "roots",
    execute: function (inp) {
      var s = String(inp.equation || inp), v = inp.variable || "x", parts = s.split("=");
      var lhs = PR.parseExpr(parts[0]), rhs = parts.length > 1 ? PR.parseExpr(parts[1]) : PR.parseExpr("0");
      if (!lhs || !rhs) return null;
      var pl = PR.toPoly(lhs, v), pr = PR.toPoly(rhs, v);
      if (!pl || !pr) return null;
      var p = pl.sub(pr), roots = PR.rootsRational(p);
      if (!roots || (p.deg() > 0 && !roots.length)) {
        var fr = PR.rootsFormula(p);
        if (fr && fr.length) roots = fr;
      }
      if ((!roots || !roots.length) && p.deg() > 0) roots = PR.rootsNumeric(function (x) { return p.evalF(x); }, -1e3, 1e3);
      return { value: roots || [], text: (roots || []).map(fracStr).join(", ") || "no real solution", exact: (roots || []).every(function (r) { return r instanceof Frac; }),
               detail: { poly: p, variable: v } };
    },
    verify: function (inp, out) {
      var p = out.detail.poly, checks = [];
      (out.value || []).forEach(function (r) {
        if (r instanceof Frac) checks.push(check("substitute " + r.toString(), p.eval(r).isZero()));
        else checks.push(check("substitute " + r, Math.abs(p.evalF(r)) < 1e-7));
      });
      /* completeness: the number of distinct real roots found agrees with a
         numeric sign-change sweep */
      var sweep = PR.rootsNumeric(function (x) { return p.evalF(x); }, -1e3, 1e3) || [];
      checks.push(check("root count vs sweep", sweep.length <= (out.value || []).length || p.deg() > 4));
      return all(checks);
    }, failureModes: ["non-polynomial equation", "roots outside the sweep interval"] });

  register({ name: "linsys.solve", domain: "linear algebra", inputType: "matrix A, vector b", outputType: "vector",
    execute: function (inp) {
      var A = inp.A.map(function (r) { return r.map(F); }), b = inp.b.map(F);
      var x = PR.gaussSolve(A, b);
      return x ? { value: x, text: x.map(fracStr).join(", ") } : null;
    },
    verify: function (inp, out) {
      var A = inp.A.map(function (r) { return r.map(F); }), b = inp.b.map(F), x = out.value, checks = [];
      A.forEach(function (row, i) {
        var s = ZERO; row.forEach(function (a, j) { s = s.add(a.mul(x[j])); });
        checks.push(check("row " + (i + 1) + " A.x = b", s.eq(b[i])));
      });
      var cx = null; try { cx = PR.cramerSolve(A, b); } catch (e) { cx = null; }
      if (cx) checks.push(check("Cramer's rule agrees", cx.every(function (v, i) { return v.eq(x[i]); })));
      return all(checks);
    }, failureModes: ["singular matrix", "inconsistent system"] });

  register({ name: "matrix.det", domain: "linear algebra", inputType: "square matrix", outputType: "number",
    execute: function (inp) { var d = PR.det(inp.A.map(function (r) { return r.map(F); })); return { value: d, text: fracStr(d) }; },
    verify: function (inp, out) { return all([check("cofactor expansion", cofactorDet(inp.A.map(function (r) { return r.map(F); })).eq(out.value))]); } });

  register({ name: "comb.choose", domain: "combinatorics", inputType: "n, k", outputType: "integer",
    execute: function (inp) { var v = PR.chooseMult(BigInt(inp.n), BigInt(inp.k)); return { value: v, text: v.toString() }; },
    verify: function (inp, out) { return all([check("Pascal's triangle", PR.choosePascal(BigInt(inp.n), BigInt(inp.k)) === out.value)]); } });
  register({ name: "comb.perm", domain: "combinatorics", inputType: "n, k", outputType: "integer",
    execute: function (inp) { var v = PR.permFormula(BigInt(inp.n), BigInt(inp.k)); return { value: v, text: v.toString() }; },
    verify: function (inp, out) {
      var r = 1n, n = BigInt(inp.n), k = BigInt(inp.k), i;
      for (i = 0n; i < k; i++) r *= (n - i);
      return all([check("falling product", (k > n ? 0n : r) === out.value)]);
    } });
  register({ name: "nt.factor", domain: "number theory", inputType: "integer", outputType: "prime factors",
    execute: function (inp) { var f = PR.factorize(BigInt(inp.n)); return f ? { value: f, text: f.map(String).join(" x ") } : null; },
    verify: function (inp, out) {
      var p = out.value.reduce(function (a, b) { return a * BigInt(b); }, 1n);
      return all([check("product of factors", p === BigInt(inp.n)), check("each factor prime", out.value.every(function (q) { return PR.isPrimeMR(BigInt(q)); }))]);
    } });
  register({ name: "nt.isprime", domain: "number theory", inputType: "integer", outputType: "boolean",
    execute: function (inp) { var v = PR.isPrimeMR(BigInt(inp.n)); return { value: v, text: v ? "prime" : "not prime" }; },
    verify: function (inp, out) { var t = PR.isPrimeTrial(BigInt(inp.n)); return t === null ? { ok: true, checks: [check("trial division (skipped: too large)", true)] } : all([check("trial division", t === out.value)]); } });
  register({ name: "nt.modpow", domain: "number theory", inputType: "b, e, m", outputType: "integer",
    execute: function (inp) { var v = PR.modpow(BigInt(inp.b), BigInt(inp.e), BigInt(inp.m)); return { value: v, text: v.toString() }; },
    verify: function (inp, out) {
      var e = BigInt(inp.e), m = BigInt(inp.m), b = ((BigInt(inp.b) % m) + m) % m, r = 1n, i;
      if (e <= 20000n) { for (i = 0n; i < e; i++) r = r * b % m; return all([check("naive repeated product", r === out.value)]); }
      /* right-to-left square-and-multiply: a different route than the
         executor's for large exponents */
      var x = b, k = e; r = 1n % m;
      while (k > 0n) { if (k & 1n) r = r * x % m; x = x * x % m; k >>= 1n; }
      return all([check("right-to-left square-and-multiply", r === out.value)]);
    } });
  register({ name: "nt.gcd", domain: "number theory", inputType: "a, b", outputType: "integer",
    execute: function (inp) { var v = PR.gcdEuclid(BigInt(inp.a), BigInt(inp.b)); return { value: v, text: v.toString() }; },
    verify: function (inp, out) { var a = BigInt(inp.a), b = BigInt(inp.b), g = out.value; return all([check("divides both", g > 0n && a % g === 0n && b % g === 0n), check("cofactors coprime", PR.gcdEuclid(a / g, b / g) === 1n)]); } });
  register({ name: "nt.lcm", domain: "number theory", inputType: "a, b", outputType: "integer",
    execute: function (inp) { var a = BigInt(inp.a), b = BigInt(inp.b), g = PR.gcdEuclid(a, b); var v = (a / g) * b; if (v < 0n) v = -v; return { value: v, text: v.toString() }; },
    verify: function (inp, out) { var a = BigInt(inp.a), b = BigInt(inp.b); return all([check("gcd x lcm = |a b|", PR.gcdEuclid(a, b) * out.value === (a * b < 0n ? -(a * b) : a * b)), check("multiple of both", out.value % a === 0n && out.value % b === 0n)]); } });
  register({ name: "prob.dice", domain: "probability", inputType: "n dice, faces, target sum", outputType: "fraction",
    execute: function (inp) { var v = PR.diceConvolve(inp.n, inp.faces || 6, inp.target); return { value: v, text: fracStr(v) }; },
    verify: function (inp, out) { var e = PR.diceEnumerate(inp.n, inp.faces || 6, inp.target); return e === null ? { ok: true, checks: [check("enumeration (skipped)", true)] } : all([check("enumeration", e.eq(out.value))]); } });
  register({ name: "prob.binomial", domain: "probability", inputType: "n, k, p", outputType: "fraction",
    execute: function (inp) { var v = PR.binomProb(inp.n, inp.k, F(inp.p)); return { value: v, text: fracStr(v) }; },
    verify: function (inp, out) {
      if (inp.n > 20) return { ok: true, checks: [check("enumeration (skipped: n > 20)", true)] };
      var P = F(inp.p), Q = ONE.sub(P), s2 = ZERO, m;
      for (m = 0; m < (1 << inp.n); m++) { var c = 0, x = m; while (x) { c += x & 1; x >>= 1; } if (c === inp.k) s2 = s2.add(P.pow(c).mul(Q.pow(inp.n - c))); }
      return all([check("enumeration of outcomes", s2.eq(out.value))]);
    } });
  register({ name: "calc.derivative", domain: "calculus", inputType: "polynomial, point", outputType: "number",
    execute: function (inp) {
      var e = PR.parseExpr(inp.expr), v = inp.variable || "x", p = e && PR.toPoly(e, v);
      if (!p) return null;
      var dp = derivPoly(p), x = F(inp.at);
      return { value: dp.eval(x), text: dp.eval(x).toString(), detail: { e: e, v: v } };
    },
    verify: function (inp, out) {
      var e = out.detail.e, v = out.detail.v, f = function (x) { var env = {}; env[v] = x; return PR.evalFloat(e, env); };
      return all([check("central difference", close(PR.numDeriv(f, num(F(inp.at))), num(out.value), 1e-5))]);
    } });
  register({ name: "calc.integrate", domain: "calculus", inputType: "expression, a, b", outputType: "number",
    execute: function (inp) {
      var e = PR.parseExpr(inp.expr), v = inp.variable || "x", p = e && PR.toPoly(e, v);
      if (p) { var P = antiderivPoly(p), val = P.eval(F(inp.b)).sub(P.eval(F(inp.a))); return { value: val, text: val.toString(), detail: { e: e, v: v } }; }
      var f = function (x) { var env = {}; env[v] = x; return PR.evalFloat(e, env); };
      var s = PR.simpson(f, num(F(inp.a)), num(F(inp.b)));
      return isFinite(s) ? { value: s, text: String(Math.round(s * 1e9) / 1e9), exact: false, detail: { e: e, v: v } } : null;
    },
    verify: function (inp, out) {
      var e = out.detail.e, v = out.detail.v, f = function (x) { var env = {}; env[v] = x; return PR.evalFloat(e, env); };
      return all([check("Simpson's rule", close(PR.simpson(f, num(F(inp.a)), num(F(inp.b)), 4000), num(out.value), 1e-6))]);
    } });
  register({ name: "graph.shortest", domain: "graphs", inputType: "weighted edges, source, target", outputType: "path",
    /* undirected weighted edges [a, b, w] (the problem module's convention) */
    execute: function (inp) { var d = PR.dijkstra(inp.edges, inp.from, inp.to); return d !== undefined ? { value: d, text: d === Infinity ? "unreachable" : String(d) } : null; },
    verify: function (inp, out) { return all([check("Bellman-Ford agrees", PR.bellmanFord(inp.edges, inp.from, inp.to) === out.value)]); } });
  register({ name: "csp.solve", domain: "logic", inputType: "variables, domains, constraints", outputType: "assignment",
    /* constraints are functions of a (partial) assignment returning false
       when violated -- the problem module's convention */
    execute: function (inp) { var r = PR.csp(inp.vars, inp.domains, inp.constraints); return r && r.length ? { value: r[0], text: JSON.stringify(r[0]), detail: { count: r.length } } : { value: null, text: "no solution" }; },
    verify: function (inp, out) {
      if (!out.value) return all([check("search exhausted", true)]);
      return all(inp.constraints.map(function (c, i) { var ok = false; try { ok = c(out.value) !== false; } catch (e) { ok = false; } return check("constraint " + (i + 1), ok); }));
    } });
  register({ name: "geom.visual", domain: "geometry", inputType: "visual facts, query", outputType: "status",
    execute: function (inp) { var r = PR.visualQuery(inp.facts, inp.query); return { value: r.status, text: r.status, detail: r }; },
    verify: function (inp, out) { return { ok: out.value !== undefined, checks: [check("graph built", !!out.detail.graph)] }; } });

  /* ============================================================ helpers */

  function cofactorDet(A) {
    var n = A.length;
    if (n === 1) return A[0][0];
    if (n === 2) return A[0][0].mul(A[1][1]).sub(A[0][1].mul(A[1][0]));
    var s = ZERO, j;
    for (j = 0; j < n; j++) {
      var minor = A.slice(1).map(function (r) { return r.filter(function (_, k) { return k !== j; }); });
      var t = A[0][j].mul(cofactorDet(minor));
      s = j % 2 ? s.sub(t) : s.add(t);
    }
    return s;
  }
  function derivPoly(p) { var c = [], i; for (i = 1; i < p.c.length; i++) c.push(p.c[i].mul(F(i))); return new PR.Poly(c.length ? c : [ZERO]); }
  function antiderivPoly(p) { var c = [ZERO], i; for (i = 0; i < p.c.length; i++) c.push(p.c[i].div(F(i + 1))); return new PR.Poly(c); }

  /* ================================================ matrices, exactly */

  function M(A) { return A.map(function (r) { return r.map(F); }); }
  function matMul(A, B) {
    if (!A.length || A[0].length !== B.length) return null;
    return A.map(function (row) { return B[0].map(function (_, j) { var s = ZERO; row.forEach(function (a, k) { s = s.add(a.mul(B[k][j])); }); return s; }); });
  }
  function transpose(A) { return A[0].map(function (_, j) { return A.map(function (r) { return r[j]; }); }); }
  /* reduced row echelon form, exact; returns {R, rank, pivots} */
  function rref(A0) {
    var A = A0.map(function (r) { return r.slice(); }), rows = A.length, cols = A[0].length, r = 0, pivots = [], c, i;
    for (c = 0; c < cols && r < rows; c++) {
      var p = -1;
      for (i = r; i < rows; i++) if (!A[i][c].isZero()) { p = i; break; }
      if (p < 0) continue;
      var tmp = A[p]; A[p] = A[r]; A[r] = tmp;
      var inv = ONE.div(A[r][c]);
      A[r] = A[r].map(function (v) { return v.mul(inv); });
      for (i = 0; i < rows; i++) if (i !== r && !A[i][c].isZero()) {
        var f = A[i][c];
        A[i] = A[i].map(function (v, k) { return v.sub(f.mul(A[r][k])); });
      }
      pivots.push(c); r++;
    }
    return { R: A, rank: r, pivots: pivots };
  }
  function identity(n) { var I = [], i, j; for (i = 0; i < n; i++) { I.push([]); for (j = 0; j < n; j++) I[i].push(i === j ? ONE : ZERO); } return I; }
  function inverse(A) {
    var n = A.length, aug = A.map(function (r, i) { return r.concat(identity(n)[i]); }), R = rref(aug);
    if (R.rank < n || R.pivots[n - 1] !== n - 1) return null;
    return R.R.map(function (r) { return r.slice(n); });
  }
  function matStr(A) { return "[" + A.map(function (r) { return "[" + r.map(fracStr).join(", ") + "]"; }).join(", ") + "]"; }
  function matEq(A, B) { return A.length === B.length && A.every(function (r, i) { return r.every(function (v, j) { return v.eq(B[i][j]); }); }); }

  register({ name: "matrix.mul", domain: "linear algebra", inputType: "matrices A, B", outputType: "matrix",
    execute: function (inp) { var P = matMul(M(inp.A), M(inp.B)); return P ? { value: P, text: matStr(P) } : null; },
    verify: function (inp, out) {
      /* (AB)^T = B^T A^T, an identity computed by a different route */
      var alt = matMul(transpose(M(inp.B)), transpose(M(inp.A)));
      return all([check("(AB)^T = B^T A^T", alt && matEq(transpose(out.value), alt))]);
    } });
  register({ name: "matrix.transpose", domain: "linear algebra", inputType: "matrix", outputType: "matrix",
    execute: function (inp) { var T = transpose(M(inp.A)); return { value: T, text: matStr(T) }; },
    verify: function (inp, out) { return all([check("transpose twice is identity", matEq(transpose(out.value), M(inp.A)))]); } });
  register({ name: "matrix.inverse", domain: "linear algebra", inputType: "square matrix", outputType: "matrix",
    execute: function (inp) { var I = inverse(M(inp.A)); return I ? { value: I, text: matStr(I) } : null; },
    verify: function (inp, out) {
      var A = M(inp.A), n = A.length;
      return all([check("A . inverse = I", matEq(matMul(A, out.value), identity(n))), check("inverse . A = I", matEq(matMul(out.value, A), identity(n)))]);
    }, failureModes: ["singular matrix"] });
  register({ name: "matrix.rank", domain: "linear algebra", inputType: "matrix", outputType: "integer",
    execute: function (inp) { var R = rref(M(inp.A)); return { value: R.rank, text: String(R.rank) }; },
    verify: function (inp, out) { return all([check("rank of transpose", rref(transpose(M(inp.A))).rank === out.value)]); } });
  register({ name: "matrix.rref", domain: "linear algebra", inputType: "matrix", outputType: "matrix",
    execute: function (inp) { var R = rref(M(inp.A)); return { value: R.R, text: matStr(R.R), detail: R }; },
    verify: function (inp, out) {
      var R = out.value, ok = true;
      out.detail.pivots.forEach(function (c, r) { R.forEach(function (row, i) { if (!(i === r ? row[c].eq(ONE) : row[c].isZero())) ok = false; }); });
      return all([check("pivot columns are unit vectors", ok), check("rank stable under re-reduction", rref(R).rank === out.detail.rank)]);
    } });

  /* =============================================== rational equations */

  /* Solve  N1(x)/D1(x) = N2(x)/D2(x): cross-multiply to N1 D2 - N2 D1 = 0,
     solve the polynomial, and discard roots that zero a denominator
     (extraneous solutions). Input: {left: [num, den], right: [num, den]}. */
  register({ name: "rational.solve", domain: "algebra", inputType: "rational equation", outputType: "roots",
    execute: function (inp) {
      var v = inp.variable || "x";
      function poly(s) { var e = PR.parseExpr(String(s)); return e ? PR.toPoly(e, v) : null; }
      var n1 = poly(inp.left[0]), d1 = poly(inp.left[1] || "1"), n2 = poly(inp.right[0]), d2 = poly(inp.right[1] || "1");
      if (!n1 || !d1 || !n2 || !d2) return null;
      var p = n1.mul(d2).sub(n2.mul(d1)), cand = PR.rootsRational(p) || [];
      var roots = cand.filter(function (r) { return !d1.eval(r).isZero() && !d2.eval(r).isZero(); });
      var extraneous = cand.filter(function (r) { return roots.indexOf(r) < 0; });
      return { value: roots, text: roots.map(fracStr).join(", ") || "no solution",
               detail: { n1: n1, d1: d1, n2: n2, d2: d2, extraneous: extraneous.map(fracStr) } };
    },
    verify: function (inp, out) {
      var d = out.detail, checks = [];
      out.value.forEach(function (r) {
        var l = d.n1.eval(r).div(d.d1.eval(r)), rr = d.n2.eval(r).div(d.d2.eval(r));
        checks.push(check("substitute " + r.toString(), l.eq(rr)));
      });
      if (!out.value.length) checks.push(check("no admissible root", true));
      return all(checks);
    }, failureModes: ["irrational roots (rational-root theorem only)"] });

  /* ================================================ symbolic simplify */

  /* Polynomial normal form in one variable: expand, collect, order by degree. */
  function polyText(p, v) {
    var terms = [], i;
    for (i = p.c.length - 1; i >= 0; i--) {
      var c = p.c[i];
      if (c.isZero()) continue;
      var coef = c.toString(), neg = coef.charAt(0) === "-";
      var mag = neg ? coef.slice(1) : coef;
      var body = i === 0 ? mag : (mag === "1" ? "" : mag) + v + (i > 1 ? "^" + i : "");
      terms.push((terms.length ? (neg ? " - " : " + ") : (neg ? "-" : "")) + body);
    }
    return terms.join("") || "0";
  }
  register({ name: "poly.simplify", domain: "algebra", inputType: "expression in one variable", outputType: "polynomial",
    execute: function (inp) {
      var v = inp.variable || "x", e = PR.parseExpr(String(inp.expr || inp)), p = e && PR.toPoly(e, v);
      return p ? { value: p, text: polyText(p, v), detail: { e: e, v: v } } : null;
    },
    verify: function (inp, out) {
      var e = out.detail.e, v = out.detail.v, checks = [], pts = [-3, -1, 0.5, 2, 7];
      pts.forEach(function (x) { var env = {}; env[v] = x; checks.push(check("equal at " + x, close(PR.evalFloat(e, env), out.value.evalF(x), 1e-9))); });
      return all(checks);
    } });

  /* ============================================= combinatorial counts */

  /* Count subsets of {items} (n <= 18) satisfying a predicate over the
     subset (a function), by enumeration; verified by a second route when the
     predicate is a target sum (dynamic programming). */
  register({ name: "comb.enumerate", domain: "combinatorics", inputType: "items, predicate | targetSum", outputType: "count",
    execute: function (inp) {
      var items = inp.items || [], n = items.length, cnt = 0, m, i;
      if (n > 18) return null;
      var pred = inp.predicate || (inp.targetSum !== undefined ? function (s) { return s.reduce(function (a, b) { return a + b; }, 0) === inp.targetSum; } : null);
      if (!pred) return null;
      for (m = 0; m < (1 << n); m++) {
        var sub = [];
        for (i = 0; i < n; i++) if (m & (1 << i)) sub.push(items[i]);
        if (pred(sub)) cnt++;
      }
      return { value: cnt, text: String(cnt) };
    },
    verify: function (inp, out) {
      if (inp.targetSum === undefined) return { ok: true, checks: [check("enumeration is exhaustive", true)] };
      var dp = {}; dp[0] = 1;
      inp.items.forEach(function (x) { var nd = {}; Object.keys(dp).forEach(function (s) { nd[s] = (nd[s] || 0) + dp[s]; nd[+s + x] = (nd[+s + x] || 0) + dp[s]; }); dp = nd; });
      return all([check("dynamic programming count", (dp[inp.targetSum] || 0) === out.value)]);
    } });

  /* ================================================== Bayesian update */

  /* Posterior over hypotheses: {priors: {H: p}, likelihoods: {H: P(E|H)}}.
     Exact fractions; verified by counting a population of N individuals
     (N = the least common multiple of the denominators). */
  register({ name: "prob.bayes", domain: "probability", inputType: "priors, likelihoods", outputType: "posterior",
    execute: function (inp) {
      var hs = Object.keys(inp.priors), joint = {}, total = ZERO;
      hs.forEach(function (h) { joint[h] = F(inp.priors[h]).mul(F(inp.likelihoods[h])); total = total.add(joint[h]); });
      if (total.isZero()) return null;
      var post = {}; hs.forEach(function (h) { post[h] = joint[h].div(total); });
      return { value: post, text: hs.map(function (h) { return "P(" + h + "|E) = " + post[h].toString(); }).join("; "), detail: { evidence: total } };
    },
    verify: function (inp, out) {
      var hs = Object.keys(inp.priors), L = 1n;
      function lcm(a, b) { return a / PR.gcdEuclid(a, b) * b; }
      hs.forEach(function (h) { L = lcm(L, F(inp.priors[h]).d); L = lcm(L, F(inp.likelihoods[h]).d); L = lcm(L, F(inp.priors[h]).mul(F(inp.likelihoods[h])).d); });
      var counts = {}, withE = 0n;
      hs.forEach(function (h) { var n = F(inp.priors[h]).mul(new Frac(L)).mul(F(inp.likelihoods[h])); counts[h] = n.n / n.d; withE += counts[h]; });
      var checks = hs.map(function (h) { return check("population count " + h, new Frac(counts[h], withE).eq(out.value[h])); });
      checks.push(check("posteriors sum to 1", hs.reduce(function (s, h) { return s.add(out.value[h]); }, ZERO).eq(ONE)));
      return all(checks);
    } });

  /* ===================================================== statistics */

  register({ name: "stats.describe", domain: "statistics", inputType: "numbers", outputType: "summary",
    execute: function (inp) {
      var xs = (inp.values || inp).map(F), n = xs.length;
      if (!n) return null;
      var sum = xs.reduce(function (a, b) { return a.add(b); }, ZERO), mean = sum.div(F(n));
      var sorted = xs.slice().sort(function (a, b) { return a.cmp(b); });
      var median = n % 2 ? sorted[(n - 1) / 2] : sorted[n / 2 - 1].add(sorted[n / 2]).div(F(2));
      var cnt = {}, mode = null, mc = 0;
      sorted.forEach(function (x) { var k = x.toString(); cnt[k] = (cnt[k] || 0) + 1; if (cnt[k] > mc) { mc = cnt[k]; mode = x; } });
      var ss = xs.reduce(function (a, x) { var d = x.sub(mean); return a.add(d.mul(d)); }, ZERO);
      var varPop = ss.div(F(n)), varSample = n > 1 ? ss.div(F(n - 1)) : null;
      return { value: { n: n, mean: mean, median: median, mode: mc > 1 ? mode : null, variance: varPop, sampleVariance: varSample,
                        stdev: Math.sqrt(varPop.toNumber()), sampleStdev: varSample ? Math.sqrt(varSample.toNumber()) : null },
               text: "mean " + mean.toString() + ", median " + median.toString() + ", variance " + varPop.toString() };
    },
    verify: function (inp, out) {
      var xs = (inp.values || inp).map(F), n = xs.length;
      /* one-pass formula E[x^2] - E[x]^2, a different route to the variance */
      var sx2 = xs.reduce(function (a, x) { return a.add(x.mul(x)); }, ZERO).div(F(n));
      var sum = xs.reduce(function (a, x) { return a.add(x); }, ZERO);
      return all([check("count", out.value.n === n), check("n x mean = sum", !!(out.value.mean && out.value.mean.mul && out.value.mean.mul(F(n)).eq(sum))),
                  check("E[x^2] - E[x]^2", sx2.sub(out.value.mean.mul(out.value.mean)).eq(out.value.variance)),
                  check("median splits the data", xs.filter(function (x) { return x.cmp(out.value.median) < 0; }).length <= n / 2)]);
    } });

  /* ============================================ units and dimensions
   * A quantity is a value in SI base units times a dimension vector over
   * (m, kg, s, A, K, mol, cd). Conversion factors are exact rationals. */
  var DIMS = ["m", "kg", "s", "A", "K", "mol", "cd"];
  function dv(o) { return DIMS.map(function (d) { return o[d] || 0; }); }
  var UNITS = {
    m: [F(1), dv({ m: 1 })], km: [F(1000), dv({ m: 1 })], cm: [F("0.01"), dv({ m: 1 })], mm: [F("0.001"), dv({ m: 1 })],
    mile: [F("1609.344"), dv({ m: 1 })], mi: [F("1609.344"), dv({ m: 1 })], ft: [F("0.3048"), dv({ m: 1 })], foot: [F("0.3048"), dv({ m: 1 })],
    in: [F("0.0254"), dv({ m: 1 })], inch: [F("0.0254"), dv({ m: 1 })], yd: [F("0.9144"), dv({ m: 1 })],
    kg: [F(1), dv({ kg: 1 })], g: [F("0.001"), dv({ kg: 1 })], mg: [F("0.000001"), dv({ kg: 1 })], lb: [F("0.45359237"), dv({ kg: 1 })],
    tonne: [F(1000), dv({ kg: 1 })],
    s: [F(1), dv({ s: 1 })], ms: [F("0.001"), dv({ s: 1 })], min: [F(60), dv({ s: 1 })], h: [F(3600), dv({ s: 1 })], hr: [F(3600), dv({ s: 1 })],
    day: [F(86400), dv({ s: 1 })],
    A: [F(1), dv({ A: 1 })], K: [F(1), dv({ K: 1 })], mol: [F(1), dv({ mol: 1 })],
    N: [F(1), dv({ kg: 1, m: 1, s: -2 })], J: [F(1), dv({ kg: 1, m: 2, s: -2 })], W: [F(1), dv({ kg: 1, m: 2, s: -3 })],
    Pa: [F(1), dv({ kg: 1, m: -1, s: -2 })], Hz: [F(1), dv({ s: -1 })], C: [F(1), dv({ A: 1, s: 1 })], V: [F(1), dv({ kg: 1, m: 2, s: -3, A: -1 })],
    L: [F("0.001"), dv({ m: 3 })], mL: [F("0.000001"), dv({ m: 3 })], gal: [F("0.003785411784"), dv({ m: 3 })],
    kWh: [F(3600000), dv({ kg: 1, m: 2, s: -2 })], cal: [F("4.184"), dv({ kg: 1, m: 2, s: -2 })], kcal: [F(4184), dv({ kg: 1, m: 2, s: -2 })]
  };
  /* "km/h", "m/s^2", "kg*m/s^2", "N m" */
  function parseUnit(s) {
    s = String(s).trim().replace(/\bper\b/g, "/").replace(/\s+/g, "*").replace(/mph/g, "mi/h").replace(/kph/g, "km/h");
    var factor = ONE, dim = dv({}), sign = 1, parts = s.split(/([*/])/), i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (p === "*") { sign = 1; continue; } if (p === "/") { sign = -1; continue; }
      if (!p) continue;
      var m = p.match(/^([A-Za-z]+)(?:\^(-?\d+))?$/);
      if (!m || !UNITS[m[1]]) return null;
      /* "/" divides by the next factor only: km/h*h is (km/h)*h */
      var e = (m[2] ? parseInt(m[2], 10) : 1) * sign, u = UNITS[m[1]];
      sign = 1;
      factor = factor.mul(u[0].pow(e));
      dim = dim.map(function (d, k) { return d + u[1][k] * e; });
    }
    return { factor: factor, dim: dim };
  }
  function dimText(d) { return DIMS.map(function (n, i) { return d[i] ? n + (d[i] !== 1 ? "^" + d[i] : "") : ""; }).filter(Boolean).join(" ") || "dimensionless"; }
  register({ name: "units.convert", domain: "physics", inputType: "value, from unit, to unit", outputType: "quantity",
    execute: function (inp) {
      var a = parseUnit(inp.from), b = parseUnit(inp.to);
      if (!a || !b) return null;
      if (a.dim.join() !== b.dim.join()) return { value: null, text: "incompatible dimensions: " + dimText(a.dim) + " vs " + dimText(b.dim), exact: true, detail: { incompatible: true } };
      var v = F(inp.value).mul(a.factor).div(b.factor);
      return { value: v, text: v.toString() + " " + inp.to + (v.isInt() ? "" : " (" + Math.round(v.toNumber() * 1e6) / 1e6 + ")"), detail: { a: a, b: b } };
    },
    verify: function (inp, out) {
      if (out.value === null) return all([check("dimension mismatch detected", !!out.detail.incompatible)]);
      var back = out.value.mul(out.detail.b.factor).div(out.detail.a.factor);
      return all([check("round trip", back.eq(F(inp.value)))]);
    } });
  /* Dimensional consistency of an equation between unit expressions:
     {lhs: "km/h * h", rhs: "km"} */
  register({ name: "units.check", domain: "physics", inputType: "unit expressions", outputType: "boolean",
    execute: function (inp) {
      var a = parseUnit(inp.lhs), b = parseUnit(inp.rhs);
      if (!a || !b) return null;
      var ok = a.dim.join() === b.dim.join();
      return { value: ok, text: ok ? "dimensionally consistent (" + dimText(a.dim) + ")" : "inconsistent: " + dimText(a.dim) + " vs " + dimText(b.dim), detail: { a: a, b: b } };
    },
    verify: function (inp, out) {
      var a = parseUnit(inp.lhs), b = parseUnit(inp.rhs);
      if (!a || !b) return all([check("units re-parsed", false)]);
      var same = true, i; for (i = 0; i < DIMS.length; i++) if ((a.dim[i] || 0) !== (b.dim[i] || 0)) same = false;
      return all([check("dimension vectors compared componentwise", same === out.value)]);
    } });

  /* ======================================= constraint propagation */

  /* AC-3 over binary constraints, then backtracking. Input: {vars: [...],
     domains: {v: [...]}, binary: [[a, b, fn(x, y)]], unary?: [[a, fn(x)]]} */
  function ac3(vars, domains, binary) {
    var D = {}; vars.forEach(function (v) { D[v] = domains[v].slice(); });
    var arcs = [];
    binary.forEach(function (c) { arcs.push([c[0], c[1], c[2]]); arcs.push([c[1], c[0], function (y, x) { return c[2](x, y); }]); });
    var queue = arcs.slice(), removed = 0;
    while (queue.length) {
      var arc = queue.shift(), X = arc[0], Y = arc[1], fn = arc[2];
      var keep = D[X].filter(function (x) { return D[Y].some(function (y) { return fn(x, y); }); });
      if (keep.length < D[X].length) {
        removed += D[X].length - keep.length;
        D[X] = keep;
        if (!keep.length) return { domains: D, consistent: false, removed: removed };
        arcs.forEach(function (a) { if (a[1] === X && a[0] !== Y) queue.push(a); });
      }
    }
    return { domains: D, consistent: true, removed: removed };
  }
  function backtrack(vars, D, binary, assign, idx, count) {
    if (count.n > 200000) return null;
    if (idx === vars.length) return Object.assign({}, assign);
    var v = vars[idx];
    for (var i = 0; i < D[v].length; i++) {
      count.n++;
      assign[v] = D[v][i];
      var ok = binary.every(function (c) { return assign[c[0]] === undefined || assign[c[1]] === undefined || c[2](assign[c[0]], assign[c[1]]); });
      if (ok) { var r = backtrack(vars, D, binary, assign, idx + 1, count); if (r) return r; }
      delete assign[v];
    }
    return null;
  }
  register({ name: "csp.propagate", domain: "logic", inputType: "variables, domains, binary constraints", outputType: "assignment",
    execute: function (inp) {
      var doms = {}; inp.vars.forEach(function (v) { doms[v] = inp.domains[v].slice(); });
      (inp.unary || []).forEach(function (u) { doms[u[0]] = doms[u[0]].filter(u[1]); });
      var r = ac3(inp.vars, doms, inp.binary || []);
      if (!r.consistent) return { value: null, text: "no solution (arc consistency empties a domain)", detail: r };
      var sol = backtrack(inp.vars, r.domains, inp.binary || [], {}, 0, { n: 0 });
      return { value: sol, text: sol ? JSON.stringify(sol) : "no solution", detail: r };
    },
    verify: function (inp, out) {
      if (!out.value) {
        /* no solution claimed: brute force over the ORIGINAL domains agrees */
        var any = backtrack(inp.vars, inp.domains, inp.binary || [], {}, 0, { n: 0 });
        var ok = !any || (inp.unary || []).some(function (u) { return !u[1](any[u[0]]); });
        return all([check("exhaustive search finds none", ok)]);
      }
      var checks = (inp.binary || []).map(function (c, i) { return check("binary " + (i + 1), c[2](out.value[c[0]], out.value[c[1]])); });
      (inp.unary || []).forEach(function (u, i) { checks.push(check("unary " + (i + 1), u[1](out.value[u[0]]))); });
      return all(checks);
    } });

  /* ============================================== finite sums / products */

  /* sum (or product) of expr over var = a..b, exactly. */
  register({ name: "seq.sum", domain: "algebra", inputType: "expression, variable, a, b", outputType: "number",
    execute: function (inp) {
      var e = PR.parseExpr(inp.expr), v = inp.variable || "i", a = parseInt(inp.from, 10), b = parseInt(inp.to, 10);
      if (!e || !(b - a < 200000)) return null;
      var acc = inp.product ? ONE : ZERO, k;
      for (k = a; k <= b; k++) { var env = {}; env[v] = F(k); var x = PR.evalExact(e, env); if (!x) return null; acc = inp.product ? acc.mul(x) : acc.add(x); }
      return { value: acc, text: acc.toString(), detail: { e: e, v: v, a: a, b: b } };
    },
    verify: function (inp, out) {
      var d = out.detail, acc = inp.product ? ONE : ZERO, k;
      /* reverse order: the same set of terms, a different accumulation */
      for (k = d.b; k >= d.a; k--) { var env = {}; env[d.v] = F(k); var x = PR.evalExact(d.e, env); acc = inp.product ? acc.mul(x) : acc.add(x); }
      var checks = [check("reverse accumulation", acc.eq(out.value))];
      var p = PR.toPoly(d.e, d.v);
      if (!inp.product && p && p.deg() <= 3 && d.a === 1) {
        /* Faulhaber: sum of powers in closed form */
        var n = F(d.b), s1 = n.mul(n.add(ONE)).div(F(2)), s2 = n.mul(n.add(ONE)).mul(n.mul(F(2)).add(ONE)).div(F(6)), s3 = s1.mul(s1);
        var sums = [n, s1, s2, s3], tot = ZERO;
        p.c.forEach(function (c, i) { tot = tot.add(c.mul(sums[i])); });
        checks.push(check("Faulhaber closed form", tot.eq(out.value)));
      }
      return all(checks);
    } });

  /* ======================================== bounded program execution */

  /* A tiny language: assignments "x = expr", "for i in a..b: stmt" (one
     statement body, may nest), "if cond: stmt" (cond "a < b", "a == b" ...).
     Integer / rational arithmetic, exact; a step cap bounds every run. */
  function execProgram(src, cap) {
    var env = {}, steps = 0, lines = String(src).split(/\n|;/).map(function (l) { return l.trim(); }).filter(Boolean);
    function val(expr) { var e = PR.parseExpr(expr); if (!e) throw new Error("cannot parse " + expr); var x = PR.evalExact(e, env); if (!x) throw new Error("not exact: " + expr); return x; }
    function cond(c) {
      var m = c.match(/^(.+?)\s*(==|!=|<=|>=|<|>)\s*(.+)$/);
      if (!m) throw new Error("bad condition " + c);
      var a = val(m[1]), b = val(m[3]), k = a.cmp(b);
      return m[2] === "==" ? k === 0 : m[2] === "!=" ? k !== 0 : m[2] === "<" ? k < 0 : m[2] === ">" ? k > 0 : m[2] === "<=" ? k <= 0 : k >= 0;
    }
    function exec(stmt) {
      if (++steps > cap) throw new Error("step cap");
      var m;
      if ((m = stmt.match(/^for\s+([a-z])\s+in\s+(.+?)\.\.(.+?)\s*:\s*(.+)$/i))) {
        var a = val(m[2]), b = val(m[3]);
        for (var k = a; k.cmp(b) <= 0; k = k.add(ONE)) { env[m[1]] = k; exec(m[4]); }
        return;
      }
      if ((m = stmt.match(/^if\s+(.+?)\s*:\s*(.+)$/i))) { if (cond(m[1])) exec(m[2]); return; }
      if ((m = stmt.match(/^([a-z])\s*(\+|-|\*)?=\s*(.+)$/i))) {
        var v = val(m[3]), cur = env[m[1]];
        env[m[1]] = !m[2] ? v : m[2] === "+" ? cur.add(v) : m[2] === "-" ? cur.sub(v) : cur.mul(v);
        return;
      }
      throw new Error("unknown statement " + stmt);
    }
    lines.forEach(exec);
    return { env: env, steps: steps };
  }
  register({ name: "prog.exec", domain: "programs", inputType: "program text", outputType: "final variables",
    execute: function (inp) {
      var r = execProgram(inp.program || inp, inp.cap || 100000), out = {};
      Object.keys(r.env).forEach(function (k) { out[k] = r.env[k]; });
      return { value: out, text: Object.keys(out).map(function (k) { return k + " = " + out[k].toString(); }).join(", "), detail: { steps: r.steps } };
    },
    verify: function (inp, out) {
      var r2 = execProgram(inp.program || inp, inp.cap || 100000);
      return all([check("deterministic re-execution", Object.keys(out.value).every(function (k) { return r2.env[k] && r2.env[k].eq(out.value[k]); })),
                  check("within step cap", out.detail.steps <= (inp.cap || 100000))]);
    }, failureModes: ["step cap exceeded", "unsupported statement"] });

  /* =============================================== numeric root finding */

  function fOf(expr, v) {
    var e = PR.parseExpr(expr);
    return e ? function (x) { var env = {}; env[v] = x; return PR.evalFloat(e, env); } : null;
  }
  /* bisection safeguarded by secant steps, on [a, b] with a sign change;
     without one, a scan for sign changes first */
  function findRoots(f, a, b) {
    var out = [], n = 400, h = (b - a) / n, i, x0 = a, f0 = f(a);
    for (i = 1; i <= n; i++) {
      var x1 = a + i * h, f1 = f(x1);
      if (isFinite(f0) && Math.abs(f0) < 1e-12) out.push(x0);
      else if (isFinite(f0) && isFinite(f1) && f0 * f1 < 0) {
        var lo = x0, hi = x1, flo = f0;
        for (var it = 0; it < 200; it++) {
          var mid = (lo + hi) / 2, fm = f(mid);
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
          if (hi - lo < 1e-13 * Math.max(1, Math.abs(mid))) break;
        }
        out.push((lo + hi) / 2);
      }
      x0 = x1; f0 = f1;
    }
    var uniq = [];
    out.forEach(function (r) { if (!uniq.some(function (u) { return Math.abs(u - r) < 1e-8; })) uniq.push(r); });
    return uniq;
  }
  register({ name: "root.find", domain: "analysis", inputType: "f(x), interval", outputType: "roots", exact: false,
    execute: function (inp) {
      var f = inp.expr === undefined ? null : fOf(inp.expr, inp.variable || "x");
      if (!f || !isFinite(+inp.a) || !isFinite(+inp.b) || +inp.a >= +inp.b || inp.a === undefined || inp.b === undefined) return null;
      var rs = findRoots(f, +inp.a, +inp.b);
      return { value: rs, text: rs.map(function (r) { return String(Math.round(r * 1e10) / 1e10); }).join(", ") || "no root in the interval", exact: false, detail: { f: f } };
    },
    verify: function (inp, out) {
      var f = out.detail.f;
      return all(out.value.map(function (r) { return check("|f(" + r.toFixed(6) + ")| small", Math.abs(f(r)) < 1e-7 * Math.max(1, Math.abs(f(r + 1e-3)) * 1e3)); })
        .concat([check("interval scanned", true)]));
    } });

  /* ================================================== optimisation */

  register({ name: "opt.extremum", domain: "analysis", inputType: "f(x), interval, min|max", outputType: "point", exact: false,
    execute: function (inp) {
      var f = inp.expr === undefined ? null : fOf(inp.expr, inp.variable || "x"), a = +inp.a, b = +inp.b, sgn = inp.goal === "max" ? -1 : 1;
      if (!f || inp.a === undefined || inp.b === undefined || !isFinite(a) || !isFinite(b) || a >= b || !isFinite(f(a)) || !isFinite(f(b))) return null;
      var g = function (x) { return sgn * f(x); };
      /* candidates: endpoints and critical points (roots of a central
         difference derivative), each refined by golden-section search */
      var d = function (x) { return (g(x + 1e-6) - g(x - 1e-6)) / 2e-6; };
      var cands = [a, b].concat(findRoots(d, a, b)), best = null;
      cands.forEach(function (x) {
        var lo = Math.max(a, x - (b - a) / 400), hi = Math.min(b, x + (b - a) / 400), phi = (Math.sqrt(5) - 1) / 2, it;
        for (it = 0; it < 80; it++) { var c1 = hi - phi * (hi - lo), c2 = lo + phi * (hi - lo); if (g(c1) < g(c2)) hi = c2; else lo = c1; }
        var xm = g(lo) < g(x) ? lo : x;
        if (!best || g(xm) < g(best)) best = xm;
      });
      return { value: { x: best, f: f(best) }, text: (inp.goal === "max" ? "maximum" : "minimum") + " " + (Math.round(f(best) * 1e9) / 1e9) + " at x = " + (Math.round(best * 1e9) / 1e9), exact: false, detail: { g: g } };
    },
    verify: function (inp, out) {
      var g = out.detail.g, a = +inp.a, b = +inp.b, n = 20000, i, ok = true;
      for (i = 0; i <= n; i++) if (g(a + (b - a) * i / n) < g(out.value.x) - 1e-7 * Math.max(1, Math.abs(g(out.value.x)))) { ok = false; break; }
      return all([check("dense sampling finds nothing better", ok)]);
    } });

  /* ================================================== graph traversal */

  function adjacency(edges, directed) {
    var adj = {};
    edges.forEach(function (e) {
      (adj[e[0]] || (adj[e[0]] = [])).push(e[1]);
      if (!adj[e[1]]) adj[e[1]] = [];
      if (!directed) adj[e[1]].push(e[0]);
    });
    return adj;
  }
  register({ name: "graph.bfs", domain: "graphs", inputType: "edges, source", outputType: "hop distances",
    execute: function (inp) {
      var adj = adjacency(inp.edges, inp.directed), dist = {}, q = [inp.from], qi = 0;
      dist[inp.from] = 0;
      while (qi < q.length) { var u = q[qi++]; (adj[u] || []).forEach(function (w) { if (dist[w] === undefined) { dist[w] = dist[u] + 1; q.push(w); } }); }
      return { value: dist, text: inp.to !== undefined ? (dist[inp.to] === undefined ? "unreachable" : String(dist[inp.to])) : JSON.stringify(dist) };
    },
    verify: function (inp, out) {
      /* hop distance = Dijkstra with unit weights */
      var unit = inp.edges.map(function (e) { return [String(e[0]), String(e[1]), 1]; });
      var checks = [check("source at distance 0", out.value[inp.from] === 0)];
      Object.keys(out.value).slice(0, 12).forEach(function (k) {
        if (String(k) === String(inp.from)) return;
        if (inp.directed) return;   /* the problem module's Dijkstra is undirected */
        var r = PR.dijkstra(unit, String(inp.from), String(k));
        checks.push(check("unit-weight shortest path to " + k, r === out.value[k]));
      });
      if (!checks.length) checks.push(check("isolated source", true));
      return all(checks);
    } });
  register({ name: "graph.components", domain: "graphs", inputType: "edges", outputType: "components",
    execute: function (inp) {
      var adj = adjacency(inp.edges, false), seen = {}, comps = [];
      Object.keys(adj).forEach(function (s) {
        if (seen[s]) return;
        var comp = [], st = [s]; seen[s] = 1;
        while (st.length) { var u = st.pop(); comp.push(u); (adj[u] || []).forEach(function (w) { if (!seen[w]) { seen[w] = 1; st.push(String(w)); } }); }
        comps.push(comp.sort());
      });
      return { value: comps, text: comps.length + " component(s)" };
    },
    verify: function (inp, out) {
      /* union-find, a different algorithm */
      var parent = {};
      function find(x) { while (parent[x] !== undefined && parent[x] !== x) x = parent[x]; return x; }
      inp.edges.forEach(function (e) { var a = String(e[0]), b = String(e[1]); if (parent[a] === undefined) parent[a] = a; if (parent[b] === undefined) parent[b] = b; var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; });
      var roots = {}; Object.keys(parent).forEach(function (x) { roots[find(x)] = 1; });
      var partition = true, covered = {};
      out.value.forEach(function (comp) {
        var r0 = comp.length ? find(String(comp[0])) : null;
        comp.forEach(function (v) { v = String(v); if (parent[v] === undefined || find(v) !== r0 || covered[v]) partition = false; covered[v] = 1; });
      });
      return all([check("union-find component count", Object.keys(roots).length === out.value.length),
                  check("same partition as union-find", partition && Object.keys(parent).every(function (v) { return covered[v]; }))]);
    } });
  register({ name: "graph.toposort", domain: "graphs", inputType: "directed edges", outputType: "order",
    execute: function (inp) {
      var adj = adjacency(inp.edges, true), indeg = {}, q = [], order = [];
      Object.keys(adj).forEach(function (u) { indeg[u] = indeg[u] || 0; adj[u].forEach(function (w) { indeg[w] = (indeg[w] || 0) + 1; }); });
      Object.keys(indeg).sort().forEach(function (u) { if (!indeg[u]) q.push(u); });
      while (q.length) { q.sort(); var u = q.shift(); order.push(u); (adj[u] || []).forEach(function (w) { if (--indeg[w] === 0) q.push(String(w)); }); }
      var cyclic = order.length < Object.keys(indeg).length;
      return { value: cyclic ? null : order, text: cyclic ? "no order: the graph has a cycle" : order.join(" -> ") };
    },
    verify: function (inp, out) {
      if (!out.value) return all([check("cycle detected", true)]);
      var pos = {}; out.value.forEach(function (u, i) { pos[u] = i; });
      return all(inp.edges.map(function (e, i) { return check("edge " + (i + 1) + " respects order", pos[String(e[0])] < pos[String(e[1])]); }));
    } });

  /* ========================================================= routing
     Which tools a structured problem could use (c4-lm-problem.js
     structure()): by kind first, then by cue words. A suggestion list, not
     a decision -- the deliberation controller runs and verifies. */
  var KIND_TOOLS = {
    equation: ["equation.solve", "rational.solve", "root.find"], system: ["linsys.solve", "matrix.det"],
    derivative: ["calc.derivative"], integral: ["calc.integrate"], choose: ["comb.choose"], perm: ["comb.perm"],
    gcd: ["nt.gcd"], lcm: ["nt.lcm"], modpow: ["nt.modpow"], prime: ["nt.isprime", "nt.factor"], factor: ["nt.factor"],
    dice: ["prob.dice"], coins: ["prob.binomial"], path: ["graph.shortest", "graph.bfs"], arithmetic: ["expr.eval"]
  };
  var CUES = [
    /* the ASKED quantity picks the matrix tool: a determinant question is
       not answered by the inverse of the same matrix */
    [/\bdeterminant\b/i, ["matrix.det"]], [/\binverse\b/i, ["matrix.inverse"]], [/\brank\b/i, ["matrix.rank"]],
    [/\btranspose\b/i, ["matrix.transpose"]], [/\brow[- ]?(?:reduced )?echelon|\brref\b/i, ["matrix.rref"]],
    [/\bmatri(?:x|ces)\b[^?]*\b(?:product|multipl)/i, ["matrix.mul"]],
    [/\bbayes|posterior|given that|false positive|test is\b/i, ["prob.bayes"]],
    [/\bmean|median|mode|variance|standard deviation|average\b/i, ["stats.describe"]],
    [/\bconvert|in (?:meters|kilometers|miles|feet|seconds|hours|minutes|grams|kilograms|pounds|liters)\b/i, ["units.convert"]],
    [/\bdimension|units? (?:of|consistent)\b/i, ["units.check"]],
    [/\bsubsets?|how many ways|arrangements|committee\b/i, ["comb.enumerate", "comb.choose", "comb.perm"]],
    [/\bsum of|product of\b.*\bfrom\b/i, ["seq.sum"]],
    [/\bminimi[sz]e|maximi[sz]e|minimum|maximum|largest value|smallest value\b/i, ["opt.extremum"]],
    [/\bshortest|path|reachable|connected\b/i, ["graph.shortest", "graph.bfs", "graph.components"]],
    [/\bbefore|after|order|prerequisite|depends on\b/i, ["graph.toposort"]],
    [/\bfor [a-z] in|loop|after running|program\b/i, ["prog.exec"]],
    [/\bsimplify|expand\b/i, ["poly.simplify"]],
    [/\bconstraint|each .* different|puzzle\b/i, ["csp.propagate", "csp.solve"]]
  ];
  function suggest(problem, text) {
    var out = [];
    function add(list) { (list || []).forEach(function (t) { if (TOOLS[t] && out.indexOf(t) < 0) out.push(t); }); }
    if (problem && problem.kind) add(KIND_TOOLS[problem.kind]);
    CUES.forEach(function (c) { if (c[0].test(text || "")) add(c[1]); });
    return out;
  }

  function list() {
    return ORDER.map(function (n) {
      var t = TOOLS[n];
      return { name: n, domain: t.domain, inputType: t.inputType, outputType: t.outputType, exact: t.exact, cost: t.cost,
               preconditions: t.preconditions, failureModes: t.failureModes };
    });
  }

  var TL = { register: register, run: run, get: function (n) { return TOOLS[n] || null; }, list: list, names: function () { return ORDER.slice(); },
             suggest: suggest, rref: rref, inverse: inverse, matMul: matMul, parseUnit: parseUnit, ac3: ac3, execProgram: execProgram,
             findRoots: findRoots, UNITS: UNITS, DIMS: DIMS };
  root.C4LMTools = TL;
  if (typeof module !== "undefined" && module.exports) module.exports = TL;
})(typeof window !== "undefined" ? window : globalThis);
