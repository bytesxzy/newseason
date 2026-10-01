/* CELL4 symbolic and word tools.
 *
 * Exact procedures a calculator or a pencil would use, applied to the
 * question's own text:
 *
 *   algebra     derivative, integral, expand, factor, simplify, f(a), inequalities,
 *               discriminant, sum / product of roots
 *   numbers     factorial expressions, logarithms, trigonometry at standard angles,
 *               primes, Fibonacci, fractions <-> decimals <-> percent, Roman numerals,
 *               base conversion, combinations
 *   words       reverse, count letters / vowels, nth letter, alphabetical order,
 *               palindromes, anagrams
 *   choices     "Which of the following ...?" answered by category or by number
 *   premises    questions that assume something that is not so (a president of Mars,
 *               a 60th US president, the largest prime)
 *
 * Nothing here stores a question or an answer; each reply is computed from the
 * text. A question that does not match a procedure exactly returns null so the
 * rest of the system can answer it. Runs locally: no network, no model service.
 */
(function (root) {
  "use strict";

  function clean(t) { return String(t || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim(); }
  function endStrip(t) { return String(t).replace(/[?.]+$/, "").replace(/(?<=[A-Za-z]|\s)!+$/, "").replace(/[?.]+$/, "").trim(); }
  function res(answer, steps, schema, confidence) { return { answer: answer, steps: steps || [], schema: schema, confidence: confidence || 0.88 }; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }

  /* ------------------------------------------------------------- fractions */
  function F(n, d) { if (d === undefined) d = 1; if (d < 0) { n = -n; d = -d; } var g = gcd(n, d); return { n: n / g, d: d / g }; }
  function fAdd(a, b) { return F(a.n * b.d + b.n * a.d, a.d * b.d); }
  function fMul(a, b) { return F(a.n * b.n, a.d * b.d); }
  function fNeg(a) { return F(-a.n, a.d); }
  function fInv(a) { return F(a.d, a.n); }
  function fIsZero(a) { return a.n === 0; }
  function fToNum(a) { return a.n / a.d; }
  function fFrom(x) {
    if (Number.isInteger(x)) return F(x, 1);
    for (var d = 1; d <= 100000; d++) { var n = Math.round(x * d); if (Math.abs(n / d - x) < 1e-12 * Math.max(1, Math.abs(x))) return F(n, d); }
    return null;
  }
  function fStr(a) { return a.d === 1 ? String(a.n) : a.n + "/" + a.d; }
  function numStr(x) {
    if (!isFinite(x)) return String(x);
    if (Number.isInteger(x)) return String(x);
    var r = Math.round(x * 1e6) / 1e6; return String(r);
  }

  /* ---------------------------------------------------------------- parsing */
  var FUNCS = { sin: 1, cos: 1, tan: 1, exp: 1, ln: 1, log: 1, sqrt: 1, abs: 1, sec: 1, csc: 1, cot: 1 };
  function tokenize(s) {
    var t = String(s).replace(/\*\*/g, "^").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/²/g, "^2").replace(/³/g, "^3");
    var out = [], i = 0, m;
    while (i < t.length) {
      var c = t[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((m = t.slice(i).match(/^(\d+(?:\.\d+)?|\.\d+)/))) { out.push({ k: "num", v: parseFloat(m[1]) }); i += m[1].length; continue; }
      if ((m = t.slice(i).match(/^[A-Za-z]+/))) {
        var w = m[0], lw = w.toLowerCase();
        if (FUNCS[lw] || lw === "pi" || lw === "e") { out.push({ k: "id", v: lw }); i += w.length; continue; }
        /* single-letter variables, split "xy" into x y */
        out.push({ k: "id", v: w[0] }); i += 1; continue;
      }
      if ("+-*/^()!,=".indexOf(c) >= 0) { out.push({ k: "op", v: c }); i++; continue; }
      return null;
    }
    return out;
  }
  function parse(str) {
    var toks = tokenize(str);
    if (!toks || !toks.length) return null;
    var p = 0;
    function peek() { return toks[p]; }
    function isOp(v) { return peek() && peek().k === "op" && peek().v === v; }
    function startsPrimary(tk) { return tk && (tk.k === "num" || tk.k === "id" || (tk.k === "op" && tk.v === "(")); }
    function expr() {
      var a = term();
      while (isOp("+") || isOp("-")) { var op = toks[p++].v; var b = term(); a = op === "+" ? { t: "add", a: a, b: b } : { t: "add", a: a, b: { t: "neg", a: b } }; }
      return a;
    }
    function term() {
      var a = unary();
      for (;;) {
        if (isOp("*")) { p++; a = { t: "mul", a: a, b: unary() }; }
        else if (isOp("/")) { p++; a = { t: "div", a: a, b: unary() }; }
        else if (startsPrimary(peek())) { a = { t: "mul", a: a, b: unary() }; } /* implicit multiplication */
        else break;
      }
      return a;
    }
    function unary() {
      if (isOp("-")) { p++; return { t: "neg", a: unary() }; }
      if (isOp("+")) { p++; return unary(); }
      return power();
    }
    function power() {
      var base = postfix();
      if (isOp("^")) { p++; var ex = unary(); return { t: "pow", a: base, b: ex }; }
      return base;
    }
    function postfix() {
      var a = primary();
      while (isOp("!")) { p++; a = { t: "fact", a: a }; }
      return a;
    }
    function primary() {
      var tk = peek();
      if (!tk) throw new Error("end");
      if (tk.k === "num") { p++; return { t: "num", v: tk.v }; }
      if (tk.k === "op" && tk.v === "(") { p++; var e = expr(); if (!isOp(")")) throw new Error("paren"); p++; return e; }
      if (tk.k === "id") {
        p++;
        if (FUNCS[tk.v]) {
          var arg;
          if (isOp("(")) { p++; arg = expr(); if (!isOp(")")) throw new Error("paren"); p++; }
          else arg = power();
          return { t: "fn", n: tk.v, a: arg };
        }
        if (tk.v === "pi") return { t: "num", v: Math.PI, sym: "pi" };
        if (tk.v === "e") return { t: "num", v: Math.E, sym: "e" };
        return { t: "var", n: tk.v };
      }
      throw new Error("bad token");
    }
    try {
      var e = expr();
      if (p < toks.length) return null;
      return e;
    } catch (err) { return null; }
  }
  function vars(ast, set) {
    set = set || {};
    if (!ast) return set;
    if (ast.t === "var") set[ast.n] = 1;
    ["a", "b"].forEach(function (k) { if (ast[k]) vars(ast[k], set); });
    return set;
  }
  function evalAst(ast, env) {
    switch (ast.t) {
      case "num": return ast.v;
      case "var": if (env[ast.n] === undefined) throw new Error("free"); return env[ast.n];
      case "neg": return -evalAst(ast.a, env);
      case "add": return evalAst(ast.a, env) + evalAst(ast.b, env);
      case "mul": return evalAst(ast.a, env) * evalAst(ast.b, env);
      case "div": return evalAst(ast.a, env) / evalAst(ast.b, env);
      case "pow": return Math.pow(evalAst(ast.a, env), evalAst(ast.b, env));
      case "fact": { var n = evalAst(ast.a, env); if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error("fact"); var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; }
      case "fn": {
        var v = evalAst(ast.a, env);
        switch (ast.n) { case "sin": return Math.sin(v); case "cos": return Math.cos(v); case "tan": return Math.tan(v); case "exp": return Math.exp(v); case "ln": return Math.log(v); case "log": return Math.log10(v); case "sqrt": return Math.sqrt(v); case "abs": return Math.abs(v); case "sec": return 1 / Math.cos(v); case "csc": return 1 / Math.sin(v); case "cot": return 1 / Math.tan(v); }
      }
    }
    throw new Error("eval");
  }

  /* ------------------------------------------------------------- polynomials */
  function polyTrim(p) { while (p.length > 1 && fIsZero(p[p.length - 1])) p.pop(); return p; }
  function pConst(f) { return [f]; }
  function pAdd(a, b) { var n = Math.max(a.length, b.length), r = []; for (var i = 0; i < n; i++) r.push(fAdd(a[i] || F(0), b[i] || F(0))); return polyTrim(r); }
  function pMul(a, b) { var r = []; for (var i = 0; i < a.length + b.length - 1; i++) r.push(F(0)); for (i = 0; i < a.length; i++) for (var j = 0; j < b.length; j++) r[i + j] = fAdd(r[i + j], fMul(a[i], b[j])); return polyTrim(r); }
  function pNeg(a) { return a.map(fNeg); }
  function pPow(a, n) { var r = [F(1)]; for (var i = 0; i < n; i++) r = pMul(r, a); return r; }
  function pDeg(a) { return polyTrim(a.slice()).length - 1; }
  function toPoly(ast, v) {
    switch (ast.t) {
      case "num": { if (ast.sym) return null; var f = fFrom(ast.v); return f ? pConst(f) : null; }
      case "var": return ast.n === v ? [F(0), F(1)] : null;
      case "neg": { var a = toPoly(ast.a, v); return a ? pNeg(a) : null; }
      case "add": { var x = toPoly(ast.a, v), y = toPoly(ast.b, v); return x && y ? pAdd(x, y) : null; }
      case "mul": { var m1 = toPoly(ast.a, v), m2 = toPoly(ast.b, v); return m1 && m2 ? pMul(m1, m2) : null; }
      case "div": { var n1 = toPoly(ast.a, v), d1 = toPoly(ast.b, v); if (!n1 || !d1 || d1.length !== 1 || fIsZero(d1[0])) return null; var inv = fInv(d1[0]); return n1.map(function (c) { return fMul(c, inv); }); }
      case "pow": { var b0 = toPoly(ast.a, v); if (!b0) return null; var e = ast.b; if (e.t !== "num" || !Number.isInteger(e.v) || e.v < 0 || e.v > 12) return null; return pPow(b0, e.v); }
      default: return null;
    }
  }
  function fCoefStr(c, isFirst, hasVar) {
    var neg = c.n < 0, a = F(Math.abs(c.n), c.d);
    var body;
    if (hasVar) {
      if (a.n === 1 && a.d === 1) body = "";
      else if (a.d === 1) body = String(a.n);
      else body = null;
    } else body = fStr(a);
    return { neg: neg, a: a, body: body };
  }
  function polyStr(p, v) {
    v = v || "x";
    var parts = [], first = true;
    for (var k = p.length - 1; k >= 0; k--) {
      var c = p[k];
      if (fIsZero(c)) continue;
      var info = fCoefStr(c, first, k > 0), term;
      var varPart = k === 0 ? "" : (k === 1 ? v : v + "^" + k);
      if (k === 0) term = fStr(info.a);
      else if (info.body === null) term = (info.a.n === 1 ? "" : info.a.n) + varPart + "/" + info.a.d;
      else term = info.body + varPart;
      parts.push((info.neg ? "- " : (first ? "" : "+ ")) + term);
      first = false;
    }
    if (!parts.length) return "0";
    var out = parts.join(" ").replace(/^- /, "-").replace(/\s+/g, " ");
    return out;
  }

  /* --------------------------------------------------- symbolic differentiation */
  function N(v) { return { t: "num", v: v }; }
  function isNum(a, v) { return a.t === "num" && !a.sym && (v === undefined || Math.abs(a.v - v) < 1e-12); }
  function simp(a) {
    switch (a.t) {
      case "num": case "var": return a;
      case "neg": { var x = simp(a.a); if (isNum(x)) return N(-x.v); if (x.t === "neg") return x.a; return { t: "neg", a: x }; }
      case "add": { var l = simp(a.a), r = simp(a.b); if (isNum(l, 0)) return r; if (isNum(r, 0)) return l; if (isNum(l) && isNum(r)) return N(l.v + r.v); return { t: "add", a: l, b: r }; }
      case "mul": { var m = simp(a.a), n = simp(a.b); if (isNum(m, 0) || isNum(n, 0)) return N(0); if (isNum(m, 1)) return n; if (isNum(n, 1)) return m; if (isNum(m) && isNum(n)) return N(m.v * n.v); if (isNum(n) && !isNum(m)) return { t: "mul", a: n, b: m }; if (m.t === "neg" && isNum(m.a) ) return simp({ t: "mul", a: N(-m.a.v), b: n }); return { t: "mul", a: m, b: n }; }
      case "div": { var p = simp(a.a), q = simp(a.b); if (isNum(p, 0)) return N(0); if (isNum(q, 1)) return p; if (isNum(p) && isNum(q) && q.v !== 0) { var f = fFrom(p.v / q.v); if (f) return N(p.v / q.v); } return { t: "div", a: p, b: q }; }
      case "pow": { var b = simp(a.a), e = simp(a.b); if (isNum(e, 0)) return N(1); if (isNum(e, 1)) return b; if (isNum(b) && isNum(e)) return N(Math.pow(b.v, e.v)); return { t: "pow", a: b, b: e }; }
      case "fn": return { t: "fn", n: a.n, a: simp(a.a) };
      case "fact": return { t: "fact", a: simp(a.a) };
    }
    return a;
  }
  function D(a, v) {
    switch (a.t) {
      case "num": return N(0);
      case "var": return N(a.n === v ? 1 : 0);
      case "neg": return { t: "neg", a: D(a.a, v) };
      case "add": return { t: "add", a: D(a.a, v), b: D(a.b, v) };
      case "mul": return { t: "add", a: { t: "mul", a: D(a.a, v), b: a.b }, b: { t: "mul", a: a.a, b: D(a.b, v) } };
      case "div": return { t: "div", a: { t: "add", a: { t: "mul", a: D(a.a, v), b: a.b }, b: { t: "neg", a: { t: "mul", a: a.a, b: D(a.b, v) } } }, b: { t: "pow", a: a.b, b: N(2) } };
      case "pow": {
        var hasV = vars(a.a)[v], hasE = vars(a.b)[v];
        if (!hasE) return { t: "mul", a: { t: "mul", a: a.b, b: { t: "pow", a: a.a, b: { t: "add", a: a.b, b: N(-1) } } }, b: D(a.a, v) };
        if (!hasV) return { t: "mul", a: { t: "mul", a: a, b: { t: "fn", n: "ln", a: a.a } }, b: D(a.b, v) };
        return { t: "mul", a: a, b: { t: "add", a: { t: "mul", a: D(a.b, v), b: { t: "fn", n: "ln", a: a.a } }, b: { t: "div", a: { t: "mul", a: a.b, b: D(a.a, v) }, b: a.a } } };
      }
      case "fn": {
        var u = a.a, du = D(u, v), outer;
        switch (a.n) {
          case "sin": outer = { t: "fn", n: "cos", a: u }; break;
          case "cos": outer = { t: "neg", a: { t: "fn", n: "sin", a: u } }; break;
          case "tan": outer = { t: "div", a: N(1), b: { t: "pow", a: { t: "fn", n: "cos", a: u }, b: N(2) } }; break;
          case "exp": outer = a; break;
          case "ln": outer = { t: "div", a: N(1), b: u }; break;
          case "log": outer = { t: "div", a: N(1), b: { t: "mul", a: u, b: N(Math.LN10) } }; break;
          case "sqrt": outer = { t: "div", a: N(1), b: { t: "mul", a: N(2), b: a } }; break;
          default: return null;
        }
        return { t: "mul", a: outer, b: du };
      }
    }
    return null;
  }
  /* printing an AST */
  function prec(a) { switch (a.t) { case "add": return 1; case "mul": case "div": return 2; case "neg": return 3; case "pow": return 4; default: return 5; } }
  function show(a, parentPrec, right) {
    parentPrec = parentPrec || 0;
    var s;
    switch (a.t) {
      case "num": s = a.sym ? a.sym : (Number.isInteger(a.v) ? String(a.v) : (fFrom(a.v) && fFrom(a.v).d <= 12 ? fStr(fFrom(a.v)) : numStr(a.v))); if (!a.sym && a.v < 0 && parentPrec > 0) s = "(" + s + ")"; return s;
      case "var": return a.n;
      case "neg": s = "-" + show(a.a, 3); return parentPrec > 1 ? "(" + s + ")" : s;
      case "add": {
        var l = show(a.a, 1), r;
        if (a.b.t === "neg") { r = show(a.b.a, 2, true); s = l + " - " + r; } else if (isNum(a.b) && a.b.v < 0) { s = l + " - " + show(N(-a.b.v), 1); } else { r = show(a.b, 1); s = l + " + " + r; }
        return parentPrec > 1 ? "(" + s + ")" : s;
      }
      case "mul": {
        var ml = show(a.a, 2), mr = show(a.b, 2);
        if (isNum(a.a) && !isNum(a.b) && (a.b.t === "var" || a.b.t === "pow" || a.b.t === "fn")) s = ml + (a.b.t === "fn" ? " " : "") + mr;
        else if (a.a.t === "var" && a.b.t === "var") s = ml + mr;
        else s = ml + " * " + mr;
        return parentPrec > 2 ? "(" + s + ")" : s;
      }
      case "div": s = show(a.a, 2) + "/" + show(a.b, 3); return parentPrec > 2 ? "(" + s + ")" : s;
      case "pow": return show(a.a, 5) + "^" + show(a.b, 5);
      case "fn": if (a.n === "exp") return (a.a.t === "var" || (a.a.t === "num" && !a.a.sym)) ? "e^" + show(a.a, 5) : "e^(" + show(a.a, 0) + ")"; return a.n + "(" + show(a.a, 0) + ")";
      case "fact": return show(a.a, 5) + "!";
    }
    return "?";
  }
  /* collect a sum of monomials c*x^n into a tidy form when the expression is polynomial; otherwise print */
  function tidy(ast, v) {
    var s = simp(ast), poly = toPoly(s, v);
    if (poly) return polyStr(poly, v);
    return show(simp(s));
  }

  /* -------------------------------------------------------------- integration */
  function flatten(a, sign, out) {
    if (a.t === "add") { flatten(a.a, sign, out); flatten(a.b, sign, out); }
    else if (a.t === "neg") flatten(a.a, -sign, out);
    else out.push({ s: sign, a: a });
    return out;
  }
  function splitConst(a, v) {
    /* a = c * core, with c free of v */
    if (!vars(a)[v]) return { c: a, core: null };
    if (a.t === "mul") {
      var l = splitConst(a.a, v), r = splitConst(a.b, v);
      if (l.core === null) return { c: { t: "mul", a: l.c, b: r.c }, core: r.core };
      if (r.core === null) return { c: { t: "mul", a: r.c, b: l.c }, core: l.core };
      return { c: N(1), core: a };
    }
    if (a.t === "neg") { var s = splitConst(a.a, v); return { c: { t: "neg", a: s.c }, core: s.core }; }
    if (a.t === "div" && !vars(a.b)[v]) { var q = splitConst(a.a, v); return { c: { t: "div", a: q.c, b: a.b }, core: q.core }; }
    return { c: N(1), core: a };
  }
  function linearIn(a, v) {
    /* a = k*v + b ?  returns {k, b} numeric or null */
    var p = toPoly(a, v);
    if (!p || p.length > 2) return null;
    return { k: fToNum(p[1] || F(0)), b: fToNum(p[0]) };
  }
  function integrate(ast, v) {
    var terms = flatten(simp(ast), 1, []), parts = [];
    var polyAcc = [F(0)], polyOk = true;
    for (var i = 0; i < terms.length; i++) {
      var tm = terms[i], pl = toPoly(tm.a, v);
      if (pl) { polyAcc = pAdd(polyAcc, tm.s < 0 ? pNeg(pl) : pl); continue; }
      var sc = splitConst(tm.a, v), core = sc.core;
      var cval;
      try { cval = tm.s * evalAst(sc.c, {}); } catch (e) { return null; }
      if (!core) return null;
      var done = null;
      if (core.t === "fn" && (core.n === "sin" || core.n === "cos" || core.n === "exp")) {
        var lin = linearIn(core.a, v);
        if (!lin || lin.k === 0) return null;
        var k = lin.k;
        if (core.n === "sin") done = { c: -cval / k, f: "cos(" + show(core.a) + ")" };
        else if (core.n === "cos") done = { c: cval / k, f: "sin(" + show(core.a) + ")" };
        else done = { c: cval / k, f: "e^(" + show(core.a) + ")" };
      } else if (core.t === "pow" && core.a.t === "num" && core.a.sym === "e") {
        var lin2 = linearIn(core.b, v);
        if (!lin2 || lin2.k === 0) return null;
        done = { c: cval / lin2.k, f: "e^(" + show(core.b) + ")" };
      } else if (core.t === "div" && isNum(core.a, 1) || (core.t === "div" && !vars(core.a)[v])) {
        var lin3 = linearIn(core.b, v);
        if (!lin3 || lin3.k === 0) return null;
        var num;
        try { num = evalAst(core.a, {}); } catch (e2) { return null; }
        done = { c: cval * num / lin3.k, f: "ln|" + show(core.b) + "|" };
      } else if (core.t === "fn" && core.n === "sqrt") {
        var lin4 = linearIn(core.a, v);
        if (!lin4 || lin4.k === 0) return null;
        done = { c: cval * 2 / (3 * lin4.k), f: "(" + show(core.a) + ")^(3/2)" };
      } else return null;
      parts.push(done);
    }
    var out = [];
    /* polynomial part */
    var anti = [F(0)];
    for (var d = 0; d < polyAcc.length; d++) if (!fIsZero(polyAcc[d])) { anti[d + 1] = fMul(polyAcc[d], F(1, d + 1)); }
    for (var z = 0; z < anti.length; z++) if (!anti[z]) anti[z] = F(0);
    var ps = polyStr(polyTrim(anti), v);
    if (ps !== "0") out.push(ps);
    parts.forEach(function (p) {
      var cf = fFrom(p.c), cs;
      if (cf) cs = cf.n === 1 && cf.d === 1 ? "" : (cf.n === -1 && cf.d === 1 ? "-" : (cf.d === 1 ? String(cf.n) : "(" + fStr(cf) + ")"));
      else cs = numStr(p.c) + " ";
      out.push(cs + (cs && !/\s$/.test(cs) && !/^-$/.test(cs) ? "" : "") + p.f);
    });
    if (!out.length) return { text: "C", poly: anti };
    var text = out.join(" + ").replace(/\+ -/g, "- ");
    return { text: text, poly: anti, polyOnly: parts.length === 0 };
  }

  /* ------------------------------------------------------------------ factoring */
  function ratRoots(p) {
    /* rational roots of an integer-coefficient polynomial by the rational root theorem; returns [{n,d,mult}] */
    var den = 1; p.forEach(function (c) { den = den * c.d / gcd(den, c.d); });
    var ip = p.map(function (c) { return c.n * (den / c.d); });
    while (ip.length > 1 && ip[ip.length - 1] === 0) ip.pop();
    var roots = [], work = ip.slice();
    var zeros = 0; while (work.length > 1 && work[0] === 0) { work.shift(); zeros++; }
    if (zeros) roots.push({ n: 0, d: 1, mult: zeros });
    function evalAt(c, n, d) { var r = 0; for (var i = c.length - 1; i >= 0; i--) r = r * n + c[i] * Math.pow(d, c.length - 1 - i); return r; }
    var a0 = Math.abs(work[0]), an = Math.abs(work[work.length - 1]);
    if (work.length > 1 && a0 && an && a0 < 1e6 && an < 1e6) {
      var ps = [], qs = [], i;
      for (i = 1; i <= Math.sqrt(a0); i++) if (a0 % i === 0) { ps.push(i); if (i !== a0 / i) ps.push(a0 / i); }
      for (i = 1; i <= Math.sqrt(an); i++) if (an % i === 0) { qs.push(i); if (i !== an / i) qs.push(an / i); }
      var tried = {};
      qs.forEach(function (q) { ps.forEach(function (pp) { [pp, -pp].forEach(function (pv) {
        var f = F(pv, q), key = f.n + "/" + f.d;
        if (tried[key]) return; tried[key] = 1;
        var cur = work, mult = 0;
        for (;;) {
          if (cur.length < 2 || evalAt(cur, f.n, f.d) !== 0) break;
          /* synthetic division by (d x - n) */
          var newc = [], carry = 0;
          /* divide polynomial (as integers) by (f.d x - f.n) using fractions */
          var cp = cur.map(function (c) { return F(c, 1); }), deg = cp.length - 1, quo = [];
          var rem = cp.slice();
          for (var k = deg; k >= 1; k--) { var coef = fMul(rem[k], F(1, f.d)); quo[k - 1] = coef; rem[k - 1] = fAdd(rem[k - 1], fMul(coef, F(f.n, 1))); rem[k] = F(0); }
          var allInt = quo.every(function (c) { return c.d === 1; });
          if (!allInt) break;
          cur = quo.map(function (c) { return c.n; }); mult++;
        }
        if (mult) { roots.push({ n: f.n, d: f.d, mult: mult }); work = cur; }
      }); }); });
    }
    return { roots: roots, rest: work, den: den };
  }
  function factorPoly(p, v) {
    p = polyTrim(p.slice());
    if (p.length < 2) return null;
    var den = 1; p.forEach(function (c) { den = den * c.d / gcd(den, c.d); });
    var ip = p.map(function (c) { return c.n * (den / c.d); });
    var g = 0; ip.forEach(function (c) { g = gcd(g, c); });
    if (ip[ip.length - 1] < 0) g = -g;
    var prim = ip.map(function (c) { return c / g; });
    var rr = ratRoots(prim.map(function (c) { return F(c, 1); }));
    var factors = [];
    rr.roots.sort(function (a, b) { return a.n / a.d - b.n / b.d; }).forEach(function (r) {
      var lin;
      if (r.n === 0) lin = (r.d === 1) ? v : v;
      else if (r.d === 1) lin = "(" + v + (r.n < 0 ? " + " + (-r.n) : " - " + r.n) + ")";
      else lin = "(" + (r.d === 1 ? "" : r.d) + v + (r.n < 0 ? " + " + (-r.n) : " - " + r.n) + ")";
      factors.push(lin + (r.mult > 1 ? "^" + r.mult : ""));
    });
    var rest = rr.rest;
    if (rest.length > 1) {
      var rg = 0; rest.forEach(function (c) { rg = gcd(rg, c); });
      var restPoly = rest.map(function (c) { return F(c / (rest.length > 1 ? 1 : 1), 1); });
      /* any constant content stays outside */
      if (rest.length === 1) { g = g * rest[0]; }
      else factors.push("(" + polyStr(restPoly, v) + ")");
    } else if (rest.length === 1 && rest[0] !== 1) g = g * rest[0];
    var lead = g === 1 ? "" : (g === -1 ? "-" : String(g));
    if (!factors.length) return null;
    if (factors.length === 1 && !lead && !/\^/.test(factors[0]) && rr.roots.length === 0) return null; /* irreducible */
    return lead + factors.join("");
  }

  /* --------------------------------------------------------------- the questions */
  function takeExpr(s) { return clean(s).replace(/[?.!]+$/, "").replace(/\s+dx$/i, "").replace(/^(?:the )?(?:function |expression |polynomial )?/i, "").replace(/^[:\s]+|[:\s]+$/g, ""); }
  function pickVar(ast) { var vs = Object.keys(vars(ast)); return vs.length === 1 ? vs[0] : (vs.indexOf("x") >= 0 ? "x" : (vs[0] || "x")); }
  function prepExpr(s) {
    return s.replace(/\bsquared\b/gi, "^2").replace(/\bcubed\b/gi, "^3").replace(/\be\s*\^\s*\(?\s*([a-z0-9+\-*/. ]+?)\)?(?=$|[,;)])/gi, function (m, g) { return "exp(" + g + ")"; }).replace(/\be\^([a-z])\b/gi, "exp($1)");
  }

  function derivativeQ(text) {
    var t = clean(text), m;
    if (!(m = t.match(/(?:derivative|differentiate|differentiation|d\/d([a-z]))\s*(?:of|:)?\s*(.+?)(?:\s+with respect to ([a-z]))?[?.!]*$/i))) return null;
    var exprS = takeExpr(m[2].replace(/^\(\s*(.+)\s*\)$/, "$1"));
    var ast = parse(prepExpr(exprS));
    if (!ast) return null;
    var v = m[3] || m[1] || pickVar(ast);
    var d = D(ast, v);
    if (!d) return null;
    var out = tidy(d, v);
    return res(out, ["d/d" + v + " (" + exprS + ")"], "calculus");
  }
  function integralQ(text) {
    var t = clean(text), m;
    if (!(m = t.match(/(?:integral|antiderivative|integrate|∫)\s*(?:of|:)?\s*(.+?)(?:\s*d([a-z]))?(?:\s+from\s+(-?[\d.\/]+)\s+to\s+(-?[\d.\/]+))?[?.!]*$/i))) return null;
    var body = m[1].replace(/\s*d([a-z])\s*$/i, ""), lo = m[3], hi = m[4];
    var bm = body.match(/^(.+?)\s+from\s+(-?[\d.\/]+)\s+to\s+(-?[\d.\/]+)\s*$/i);
    if (bm) { body = bm[1].replace(/\s*d([a-z])\s*$/i, ""); lo = bm[2]; hi = bm[3]; }
    var ast = parse(prepExpr(takeExpr(body)));
    if (!ast) return null;
    var v = m[2] || pickVar(ast);
    var I = integrate(ast, v);
    if (!I) return null;
    if (lo !== undefined && hi !== undefined) {
      function val(s) { var a = parse(s); return a ? evalAst(a, {}) : NaN; }
      var a0 = val(lo), b0 = val(hi);
      if (!I.polyOnly || isNaN(a0) || isNaN(b0)) return null;
      var e = function (x) { var r = 0; for (var i = I.poly.length - 1; i >= 0; i--) r = r * x + fToNum(I.poly[i] || F(0)); return r; };
      var out2 = e(b0) - e(a0);
      return res(numStr(out2), ["antiderivative " + I.text + ", evaluated from " + lo + " to " + hi], "calculus");
    }
    return res(I.text + " + C", [], "calculus");
  }
  function expandQ(text) {
    var t = clean(text), m;
    if (!(m = t.match(/^(?:please )?(?:expand|multiply out|foil)\s*(?:the\s+)?(?:expression|product)?\s*:?\s*(.+?)[?.!]*$/i))) return null;
    var ast = parse(prepExpr(takeExpr(m[1])));
    if (!ast) return null;
    var v = pickVar(ast), p = toPoly(ast, v);
    if (!p) return null;
    return res(polyStr(p, v), [], "algebra");
  }
  function simplifyQ(text) {
    var t = clean(text), m;
    if (!(m = t.match(/^(?:please )?(?:simplify|combine like terms(?: in)?)\s*:?\s*(.+?)[?.!]*$/i))) return null;
    var ast = parse(prepExpr(takeExpr(m[1])));
    if (!ast) return null;
    var v = pickVar(ast), p = toPoly(ast, v);
    if (!p) return null;
    return res(polyStr(p, v), [], "algebra");
  }
  function factorQ(text) {
    var t = clean(text), m;
    if (!(m = t.match(/^(?:please )?(?:factor|factorise|factorize)(?:\s+completely)?\s*:?\s*(.+?)[?.!]*$/i))) return null;
    var ast = parse(prepExpr(takeExpr(m[1])));
    if (!ast) return null;
    var v = pickVar(ast), p = toPoly(ast, v);
    if (!p) return null;
    var f = factorPoly(p, v);
    if (!f) return res(polyStr(p, v) + " does not factor over the rational numbers", [], "algebra");
    return res(f, [], "algebra");
  }
  function evalFunctionQ(text) {
    var t = clean(text);
    var def = t.match(/\b([a-z])\(\s*([a-z])\s*\)\s*=\s*([^,;?]+?)\s*(?:[,;]|\.\s|\.$|\?|$|\bwhat\b|\bfind\b|\bevaluate\b|\bcompute\b)/i);
    if (!def) return null;
    var after = t.slice(t.indexOf(def[0]) + def[0].length - (/\?|\.$/.test(def[0]) ? 0 : 0));
    var q = t.replace(def[0], " ");
    var call = q.match(new RegExp("\\b" + def[1] + "\\(\\s*(-?[\\d./]+|[a-z])\\s*\\)"));
    if (!call) return null;
    var ast = parse(prepExpr(def[3]));
    if (!ast) return null;
    var argAst = parse(call[1]); if (!argAst) return null;
    var env = {}; env[def[2]] = evalAst(argAst, {});
    var val;
    try { val = evalAst(ast, env); } catch (e) { return null; }
    if (!isFinite(val)) return null;
    return res(numStr(val), [def[1] + "(" + call[1] + ") = " + numStr(val)], "algebra");
  }
  function inequalityQ(text) {
    var t = clean(text).replace(/≥/g, ">=").replace(/≤/g, "<=");
    var m = t.match(/^(?:please )?(?:solve|find x(?: such that)?|what values of x satisfy)?\s*(?:the inequality|for x)?\s*:?\s*([^<>=]+?)\s*(>=|<=|>|<)\s*([^<>=?]+?)\s*(?:for ([a-z]))?[?.!]*$/i);
    if (!m || !/solve|inequality|values of|find/i.test(t)) return null;
    var L = parse(prepExpr(m[1])), R = parse(prepExpr(m[3]));
    if (!L || !R) return null;
    var v = m[4] || pickVar({ t: "add", a: L, b: R });
    var diff = toPoly({ t: "add", a: L, b: { t: "neg", a: R } }, v);
    if (!diff) return null;
    var deg = pDeg(diff), op = m[2];
    if (deg === 1) {
      var a = diff[1], b = diff[0];
      var rhs = fMul(fNeg(b), fInv(a));
      var flip = a.n < 0;
      var op2 = flip ? { ">": "<", "<": ">", ">=": "<=", "<=": ">=" }[op] : op;
      return res(v + " " + op2 + " " + fStr(rhs), [fStr(a) + v + " " + (b.n < 0 ? "- " + fStr(F(-b.n, b.d)) : "+ " + fStr(b)) + " " + op + " 0" + (flip ? " (dividing by a negative flips the sign)" : "")], "algebra");
    }
    if (deg === 2) {
      var A = fToNum(diff[2]), B = fToNum(diff[1]), C = fToNum(diff[0]), disc = B * B - 4 * A * C;
      if (disc < 0) {
        var allTrue = (A > 0 && /[>]/.test(op)) || (A < 0 && /[<]/.test(op));
        return res(allTrue ? "all real numbers" : "no real solutions", [], "algebra");
      }
      var r1 = (-B - Math.sqrt(disc)) / (2 * A), r2 = (-B + Math.sqrt(disc)) / (2 * A);
      if (r1 > r2) { var tmp = r1; r1 = r2; r2 = tmp; }
      var s1 = numStr(r1), s2 = numStr(r2), strict = op.length === 1, outside = (A > 0 && /[>]/.test(op)) || (A < 0 && /[<]/.test(op));
      var lt = strict ? "<" : "<=", gt = strict ? ">" : ">=";
      return res(outside ? v + " " + lt + " " + s1 + " or " + v + " " + gt + " " + s2 : s1 + " " + lt + " " + v + " " + lt + " " + s2, [], "algebra");
    }
    return null;
  }
  function quadraticQ(text) {
    var t = clean(text), m;
    var kind = null;
    if ((m = t.match(/\bdiscriminant of\s+(.+?)(?:\s*=\s*0)?[?.!]*$/i))) kind = "disc";
    else if ((m = t.match(/\bsum of (?:the )?roots (?:of|for)\s+(.+?)(?:\s*=\s*0)?[?.!]*$/i))) kind = "sum";
    else if ((m = t.match(/\bproduct of (?:the )?roots (?:of|for)\s+(.+?)(?:\s*=\s*0)?[?.!]*$/i))) kind = "prod";
    else if ((m = t.match(/\b(?:vertex|turning point) of (?:the )?(?:parabola |quadratic )?(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)[?.!]*$/i))) kind = "vertex";
    else if ((m = t.match(/\bhow many (?:real )?(?:roots|solutions|zeros) does\s+(.+?)(?:\s*=\s*0)?\s+have[?.!]*$/i))) kind = "count";
    if (!kind) return null;
    var ast = parse(prepExpr(takeExpr(m[1].replace(/^(?:y|f\(x\))\s*=\s*/, ""))));
    if (!ast) return null;
    var p = toPoly(ast, "x");
    if (!p || pDeg(p) !== 2) return null;
    var a = fToNum(p[2]), b = fToNum(p[1] || F(0)), c = fToNum(p[0]), disc = b * b - 4 * a * c;
    if (kind === "disc") return res(numStr(disc), ["b² − 4ac = " + numStr(b) + "² − 4(" + numStr(a) + ")(" + numStr(c) + ")"], "algebra");
    if (kind === "sum") { var s = fFrom(-b / a); return s ? res(fStr(s), ["−b/a = " + numStr(-b) + "/" + numStr(a)], "algebra") : null; }
    if (kind === "prod") { var pr = fFrom(c / a); return pr ? res(fStr(pr), ["c/a = " + numStr(c) + "/" + numStr(a)], "algebra") : null; }
    if (kind === "count") return res(disc > 0 ? "2 real roots" : (disc === 0 ? "1 real root (a double root)" : "no real roots"), ["discriminant " + numStr(disc)], "algebra");
    var vx = -b / (2 * a), vy = a * vx * vx + b * vx + c;
    return res("(" + numStr(vx) + ", " + numStr(vy) + ")", ["x = −b/2a"], "algebra");
  }

  /* ------------------------------------------------------------ numbers & logs */
  function isPrime(n) { if (n < 2 || !Number.isInteger(n)) return false; if (n < 4) return true; if (n % 2 === 0) return false; for (var i = 3; i * i <= n; i += 2) if (n % i === 0) return false; return true; }
  function factorize(n) { var out = [], d = 2; while (n > 1 && d * d <= n) { while (n % d === 0) { out.push(d); n /= d; } d++; } if (n > 1) out.push(n); return out; }
  function words2num(s) {
    var W = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, hundred: 100 };
    s = String(s).toLowerCase(); if (/^-?\d+$/.test(s)) return +s;
    var m = s.match(/^(\d+)(?:st|nd|rd|th)$/); if (m) return +m[1];
    var O = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
    return W[s] !== undefined ? W[s] : (O[s] || null);
  }
  function primeQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/\b(?:smallest|least|first|next|lowest) prime(?: number)? (?:that is )?(?:(?:greater|larger|bigger|more|higher) than|above|over|after) (\d+)/)) || (m = l.match(/\bnext prime(?: number)? (?:after|following|past) (\d+)/)) || (m = l.match(/\bfirst prime (?:after|above) (\d+)/))) {
      var n = +m[1] + 1; while (!isPrime(n)) n++; return res(String(n), [], "number");
    }
    if ((m = l.match(/\b(?:largest|greatest|biggest|previous|last) prime(?: number)? (?:that is )?(?:(?:less|smaller|lower|fewer) than|below|under|before) (\d+)/)) || (m = l.match(/\bprevious prime(?: number)? (?:before|below) (\d+)/))) {
      var k = +m[1] - 1; while (k > 1 && !isPrime(k)) k--; return k > 1 ? res(String(k), [], "number") : null;
    }
    if ((m = l.match(/^is (\d+) (?:a )?prime(?: number)?$/)) || (m = l.match(/^is (\d+) prime$/))) {
      var q = +m[1];
      if (isPrime(q)) return res("Yes — " + q + " is prime.", [], "number");
      if (q < 2) return res("No \u2014 " + q + " is not prime: a prime has exactly two different divisors, 1 and itself" + (q === 1 ? ", and 1 has only one" : "") + ".", [], "number");
      var fs = factorize(q);
      return res("No \u2014 " + q + " = " + fs.join(" \u00d7 ") + ".", [], "number");
    }
    if ((m = l.match(/\bprime factori[sz]ation of (\d+)/)) || (m = l.match(/\bfactor (\d+) into primes/))) {
      var fz = factorize(+m[1]); var cnt = {}; fz.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; });
      return res(Object.keys(cnt).map(function (k2) { return cnt[k2] > 1 ? k2 + "^" + cnt[k2] : k2; }).join(" × "), [], "number");
    }
    if ((m = l.match(/\bhow many primes?(?: numbers?)? (?:are there )?(?:are )?(?:there )?(?:below|under|less than|up to|before) (\d+)/))) {
      var lim = +m[1], c = 0; if (lim > 2e6) return null; for (var i = 2; i < lim; i++) if (isPrime(i)) c++; return res(String(c), [], "number");
    }
    if ((m = l.match(/\bwhat is the (\w+) prime(?: number)?\b/)) && words2num(m[1])) {
      var idx = words2num(m[1]), cur = 1, cntp = 0; if (idx > 100000) return null; while (cntp < idx) { cur++; if (isPrime(cur)) cntp++; } return res(String(cur), [], "number");
    }
    if ((m = l.match(/\bprimes? between (\d+) and (\d+)/))) { var a = +m[1], b = +m[2], out = []; if (b - a > 10000) return null; for (var j = a; j <= b; j++) if (isPrime(j)) out.push(j); return res(out.join(", ") || "none", [], "number"); }
    return null;
  }
  function fibQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/\b(?:what is )?the (\w+) (?:number in the )?fibonacci(?: number| sequence)?/)) && !(m = l.match(/\bfibonacci(?: number)? (?:number )?(\d+)/))) return null;
    var n = words2num(m[1]); if (!n || n > 90) return null;
    var zeroBased = /starts? (?:with )?0|begin(?:s)? (?:with )?0/.test(l);
    var a = zeroBased ? 0 : 1, b = 1;
    if (zeroBased) { a = 0; b = 1; for (var i = 1; i < n; i++) { var t = a + b; a = b; b = t; } return res(String(a), [], "number"); }
    a = 1; b = 1; for (var j = 2; j < n; j++) { var t2 = a + b; a = b; b = t2; }
    return res(String(n <= 2 ? 1 : b), [], "number");
  }
  function mathFnQ(text) {
    var l = clean(text).replace(/[?.!]+$/, ""), ll = l.toLowerCase(), m;
    /* logarithms */
    if ((m = ll.match(/\b(?:log(?:arithm)?)\s*(?:base|_)\s*(\d+(?:\.\d+)?)\s*(?:of|\()?\s*(\d+(?:\.\d+)?)\)?/)) || (m = ll.match(/\blog\s*_?\s*(\d+)\s*\(?\s*(\d+(?:\.\d+)?)\)?$/))) {
      var base = +m[1], x = +m[2], v = Math.log(x) / Math.log(base);
      if (base > 0 && base !== 1 && x > 0) { var rv = Math.round(v); if (Math.abs(v - rv) < 1e-9) v = rv; return res(numStr(v), ["log_" + base + "(" + x + ") = " + numStr(v) + " because " + base + "^" + numStr(v) + " = " + x], "number"); }
    }
    if ((m = ll.match(/\b(?:natural log(?:arithm)?|ln)\s*(?:of)?\s*\(?\s*(e(?:\^[\d.]+)?|[\d.]+)\)?$/))) {
      var xe = m[1].match(/^e\^([\d.]+)$/) ? +m[1].slice(2) : (m[1] === "e" ? 1 : Math.log(+m[1]));
      return res(numStr(xe), [], "number");
    }
    if ((m = ll.match(/\b(?:common )?log(?:arithm)?(?: base 10)?\s*(?:of)?\s*\(?\s*(\d+(?:\.\d+)?)\)?$/)) && !/base (?!10)/.test(ll)) {
      var v10 = Math.log10(+m[1]); var r10 = Math.round(v10); if (Math.abs(v10 - r10) < 1e-9) v10 = r10; return res(numStr(v10), [], "number");
    }
    /* trig at angles */
    if ((m = ll.match(/\b(sin|sine|cos|cosine|tan|tangent)\s*(?:of|\()?\s*(-?[\d.]+(?:\s*\/\s*\d+)?|pi(?:\s*\/\s*\d+)?|\d*\s*pi(?:\s*\/\s*\d+)?)\s*(degrees?|°|deg|radians?|rad)?\s*\)?$/))) {
      var fn = m[1].slice(0, 3), arg = m[2].replace(/\s+/g, ""), unit = m[3] || "";
      var deg, isRad = /rad/.test(unit) || /pi/.test(arg);
      if (/pi/.test(arg)) { var am = arg.match(/^(\d*)pi(?:\/(\d+))?$/); var k = am[1] ? +am[1] : 1; deg = 180 * k / (am[2] ? +am[2] : 1); }
      else { var av = arg.indexOf("/") >= 0 ? arg.split("/").reduce(function (a, b) { return a / b; }) : +arg; deg = /rad/.test(unit) ? av * 180 / Math.PI : av; }
      var d360 = ((deg % 360) + 360) % 360;
      var EX = { sin: { 0: "0", 30: "1/2", 45: "√2/2", 60: "√3/2", 90: "1", 120: "√3/2", 135: "√2/2", 150: "1/2", 180: "0", 210: "-1/2", 225: "-√2/2", 240: "-√3/2", 270: "-1", 300: "-√3/2", 315: "-√2/2", 330: "-1/2" } };
      var rad = deg * Math.PI / 180, val = fn === "sin" ? Math.sin(rad) : (fn === "cos" ? Math.cos(rad) : Math.tan(rad));
      if (Math.abs(val) < 1e-12) val = 0;
      if (fn === "tan" && Math.abs(Math.cos(rad)) < 1e-12) return res("undefined", [], "number");
      var exact = null;
      if (fn === "sin" && EX.sin[d360] !== undefined) exact = EX.sin[d360];
      if (fn === "cos" && EX.sin[((d360 + 90) % 360)] !== undefined) exact = EX.sin[(d360 + 90) % 360];
      if (fn === "tan") { var tv = { 0: "0", 30: "√3/3", 45: "1", 60: "√3", 180: "0", 135: "-1", 225: "1", 210: "√3/3", 240: "√3", 315: "-1" }[d360]; if (tv !== undefined) exact = tv; }
      var dec = numStr(Math.round(val * 1e6) / 1e6);
      return res(exact !== null ? exact + (/^-?[01]$|^0$/.test(exact) ? "" : " (≈ " + dec + ")") : dec, [fn + "(" + numStr(deg) + "°)"], "number");
    }
    return null;
  }
  function factorialExprQ(text) {
    var l = endStrip(clean(text)), m;
    var body = null;
    if ((m = l.match(/^(?:what is |what's |evaluate |compute |calculate |find |simplify )?(?:the value of )?(.+)$/i))) body = m[1];
    if (!body) return null;
    var fm = body.match(/^(\d+)\s+factorial$/i);
    if (fm) body = fm[1] + "!";
    else body = body.replace(/\bfactorial of (\d+)\b/gi, "$1!");
    if (!/!/.test(body) || !/^[\d\s+\-*/^().!×÷]+$/.test(body)) return null;
    var ast = parse(body);
    if (!ast) return null;
    var v;
    try { v = evalAst(ast, {}); } catch (e) { return null; }
    if (!isFinite(v)) return null;
    return res(numStr(v), [body + " = " + numStr(v)], "number");
  }
  function chooseQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    function C(n, k) { if (k > n) return 0; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
    if ((m = l.match(/\b(\d+) choose (\d+)\b/)) || (m = l.match(/\bc\((\d+)\s*,\s*(\d+)\)/)) || (m = l.match(/\bcombinations of (\d+) (?:things |items |objects )?taken (\d+)/))) return res(String(C(+m[1], +m[2])), [], "number");
    if ((m = l.match(/\bchoose (?:a |an )?(?:committee|team|group|subset)? ?(?:of )?(\d+)[^.?]*? from (?:a (?:group|set|class|list) of )?(\d+)\b/)) || (m = l.match(/\bways (?:can|to) (?:you )?(?:choose|pick|select) (\d+)[^.?]*? from (?:a (?:group|set|class) of )?(\d+)\b/))) return res(String(C(+m[2], +m[1])), ["C(" + m[2] + ", " + m[1] + ")"], "number");
    return null;
  }
  /* |ax + b| = k, solved by reading the inside as a linear function of x */
  function absEquationQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:solve|find x(?: such that)?|what is x(?: if)?|solve for x)[:,]?\s*(?:\|(.+)\||abs\((.+)\))\s*=\s*(-?\d+(?:\.\d+)?)$/))) return null;
    var inner = (m[1] || m[2]).trim(), k = +m[3], ast;
    try { ast = parse(inner); } catch (e) { return null; }
    var f0, f1, f2;
    try { f0 = evalAst(ast, { x: 0 }); f1 = evalAst(ast, { x: 1 }); f2 = evalAst(ast, { x: 2 }); } catch (e2) { return null; }
    var a = f1 - f0, b = f0;
    if (!isFinite(a) || !isFinite(b) || Math.abs(f2 - (2 * a + b)) > 1e-9 || a === 0) return null;
    if (k < 0) return res("No solution \u2014 an absolute value is never negative.", [], "equation");
    var x1 = (k - b) / a, x2 = (-k - b) / a;
    if (k === 0 || x1 === x2) return res("x = " + numStr(x1), ["|" + inner + "| = 0 means " + inner + " = 0"], "equation");
    var lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    return res("x = " + numStr(hi) + " or x = " + numStr(lo), [inner + " = " + numStr(k) + " or " + inner + " = " + numStr(-k)], "equation");
  }
  function absQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/\babsolute value of\s*\(?(-?\d+(?:\.\d+)?)\)?$/)) || (m = l.match(/^\|\s*(-?\d+(?:\.\d+)?)\s*\|$/))) return res(numStr(Math.abs(+m[1])), [], "number");
    return null;
  }
  function fractionQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/\b(?:what is |write |express |convert )?(-?\d*\.\d+|\d+)\s*(?:as|to|into) (?:a )?(fraction|simplest fraction)\b/)) ) {
      var f = fFrom(parseFloat(m[1])); if (f) return res(fStr(f), [], "number");
    }
    if ((m = l.match(/\b(?:what is |write |express |convert )?(\d+(?:\.\d+)?)\s*%\s*(?:as|to|into) (?:a )?(fraction|decimal)\b/))) { var p = parseFloat(m[1]) / 100; if (m[2] === "decimal") return res(numStr(p), [], "number"); var ff = fFrom(p); if (ff) return res(fStr(ff), [], "number"); }
    if ((m = l.match(/\b(?:convert |write |express )?(\d+)\s*\/\s*(\d+)\s*(?:as|to|into) (?:a )?(percent|percentage|decimal)\b/))) { var dv = +m[1] / +m[2]; return res(m[3] === "decimal" ? numStr(dv) : numStr(Math.round(dv * 1e6) / 1e4) + "%", [], "number"); }
    if ((m = l.match(/\b(?:convert |write |express |change )?(-?\d*\.\d+|\d+)\s*(?:as|to|into) (?:a )?(percent|percentage)\b/))) return res(numStr(parseFloat(m[1]) * 100) + "%", [], "number");
    if ((m = l.match(/\bsimplify (?:the fraction )?(\d+)\s*\/\s*(\d+)/))) { var g = gcd(+m[1], +m[2]); return res((+m[1] / g) + "/" + (+m[2] / g), [], "number"); }
    return null;
  }
  var ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  function toRoman(n) { var s = ""; ROMAN.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } }); return s; }
  function fromRoman(s) { var v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }, t = 0; for (var i = 0; i < s.length; i++) { var a = v[s[i]], b = v[s[i + 1]]; t += b > a ? -a : a; } return t; }
  function baseQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/\b(?:convert |write |express |what is )?(\d+)\s+(?:in|to|into|as) roman(?: numerals?)?\b/)) || (m = l.match(/\broman numeral(?:s)? (?:for|of) (\d+)\b/))) { var n = +m[1]; if (n > 0 && n < 4000) return res(toRoman(n), [], "number"); }
    if ((m = clean(text).match(/\b(?:what number is|what is|convert|value of)\s+([IVXLCDM]{2,})\b/)) && /roman|number|numeral|\bis\b/i.test(text)) { if (/^[IVXLCDM]+$/.test(m[1])) return res(String(fromRoman(m[1])), [], "number"); }
    if ((m = l.match(/\b(?:what is |convert |write |express )?(\d+)\s+(?:in|to|into|as) (binary|hex|hexadecimal|octal)\b/)) || (m = l.match(/\b(binary|hex|hexadecimal|octal) (?:of|for|representation of) (\d+)\b/))) {
      var num = +(/^\d+$/.test(m[1]) ? m[1] : m[2]), kind = /^\d+$/.test(m[1]) ? m[2] : m[1];
      var b = kind === "binary" ? 2 : (kind === "octal" ? 8 : 16);
      return res(num.toString(b).toUpperCase(), [], "number");
    }
    if ((m = l.match(/\b(?:what is |convert |value of )?([01]+)\s+(?:in|from)\s+binary\s+(?:to|in)?\s*(?:decimal|base 10)?\b/)) || (m = l.match(/\bconvert ([01]+) (?:from binary )?to decimal\b/))) return res(String(parseInt(m[1], 2)), [], "number");
    if ((m = l.match(/\b(?:what is |convert )?([0-9a-f]+)\s+(?:in )?hex(?:adecimal)?\s+(?:in|to)\s+decimal\b/))) return res(String(parseInt(m[1], 16)), [], "number");
    return null;
  }


  /* ------------------------------------------------------------ unit conversion */
  /* every unit: dimension vector over [length, mass, time, volume-as-length^3 is derived] and factor to SI */
  var UNITS = (function () {
    var U = {};
    function add(names, dim, f) { names.split("|").forEach(function (n) { U[n] = { dim: dim, f: f }; }); }
    var L = { L: 1 }, M = { M: 1 }, T = { T: 1 };
    add("millimeter|millimeters|millimetre|millimetres|mm", L, 0.001); add("centimeter|centimeters|centimetre|centimetres|cm", L, 0.01);
    add("meter|meters|metre|metres|m", L, 1); add("kilometer|kilometers|kilometre|kilometres|km|kms", L, 1000);
    add("inch|inches|in", L, 0.0254); add("foot|feet|ft", L, 0.3048); add("yard|yards|yd|yds", L, 0.9144); add("mile|miles|mi", L, 1609.344);
    add("nautical mile|nautical miles|nmi", L, 1852); add("light year|light years|ly", L, 9.4607304725808e15);
    add("milligram|milligrams|mg", M, 1e-6); add("gram|grams|g", M, 0.001); add("kilogram|kilograms|kilo|kilos|kg|kgs", M, 1);
    add("tonne|tonnes|metric ton|metric tons", M, 1000); add("ounce|ounces|oz", M, 0.028349523125); add("pound|pounds|lb|lbs", M, 0.45359237); add("stone|stones", M, 6.35029318); add("ton|tons", M, 907.18474);
    add("second|seconds|sec|secs|s", T, 1); add("minute|minutes|min|mins", T, 60); add("hour|hours|hr|hrs|h", T, 3600); add("day|days", T, 86400); add("week|weeks", T, 604800); add("year|years", T, 31536000);
    add("millisecond|milliseconds|ms", T, 0.001);
    /* volume is length cubed */
    var V = { L: 3 };
    add("milliliter|milliliters|millilitre|millilitres|ml", V, 1e-6); add("liter|liters|litre|litres|l", V, 0.001); add("gallon|gallons|gal", V, 0.003785411784); add("quart|quarts|qt", V, 0.000946352946);
    add("pint|pints|pt", V, 0.000473176473); add("cup|cups", V, 0.0002365882365); add("tablespoon|tablespoons|tbsp", V, 0.00001478676478); add("teaspoon|teaspoons|tsp", V, 0.00000492892159); add("fluid ounce|fluid ounces|fl oz|floz", V, 0.0000295735296);
    /* area */
    var A = { L: 2 };
    add("acre|acres", A, 4046.8564224); add("hectare|hectares|ha", A, 10000);
    return U;
  })();
  var UNIT_PREFIX = /^(?:square|sq\.?|cubic|cu\.?)\s+/;
  var SPEED_ALIAS = { mph: [["mile", 1], ["hour", -1]], kph: [["kilometer", 1], ["hour", -1]], kmh: [["kilometer", 1], ["hour", -1]], "km/h": [["kilometer", 1], ["hour", -1]], "km/hr": [["kilometer", 1], ["hour", -1]], "mi/h": [["mile", 1], ["hour", -1]], "m/s": [["meter", 1], ["second", -1]], mps: [["meter", 1], ["second", -1]], knot: [["nautical mile", 1], ["hour", -1]], knots: [["nautical mile", 1], ["hour", -1]], kn: [["nautical mile", 1], ["hour", -1]], "ft/s": [["foot", 1], ["second", -1]], fps: [["foot", 1], ["second", -1]] };
  function dimAdd(a, b, k) { var o = {}, x; for (x in a) o[x] = a[x]; for (x in b) { o[x] = (o[x] || 0) + k * b[x]; if (!o[x]) delete o[x]; } return o; }
  function dimKey(d) { return Object.keys(d).sort().map(function (k) { return k + d[k]; }).join(","); }
  function parseUnit(str) {
    var t = String(str).toLowerCase().trim().replace(/\.$/, "").replace(/\s+/g, " ");
    if (SPEED_ALIAS[t]) { var acc = { dim: {}, f: 1 }; SPEED_ALIAS[t].forEach(function (p) { var u = UNITS[p[0]]; acc.dim = dimAdd(acc.dim, u.dim, p[1]); acc.f *= Math.pow(u.f, p[1]); }); return acc; }
    var m;
    if ((m = t.match(/^(.+?)\s*(?:\/|\bper\b)\s*(.+)$/))) {
      var n = parseUnit(m[1]), d = parseUnit(m[2]);
      if (!n || !d) return null;
      return { dim: dimAdd(n.dim, d.dim, -1), f: n.f / d.f };
    }
    var power = 1, base = t;
    if (UNIT_PREFIX.test(t)) { power = /^(?:cubic|cu)/.test(t) ? 3 : 2; base = t.replace(UNIT_PREFIX, ""); }
    var sq = base.match(/^(.+?)\s*[²^]2$/); if (sq) { power = 2; base = sq[1]; }
    var cb = base.match(/^(.+?)\s*[³^]3$/); if (cb) { power = 3; base = cb[1]; }
    var u = UNITS[base] || UNITS[base.replace(/s$/, "")] || UNITS[base.replace(/es$/, "")];
    if (!u) return null;
    var dim = {}, x; for (x in u.dim) dim[x] = u.dim[x] * power;
    return { dim: dim, f: Math.pow(u.f, power) };
  }
  function sig(x) { if (!isFinite(x)) return String(x); if (Math.abs(x) >= 1e6 || (Math.abs(x) < 1e-4 && x !== 0)) return Number(x.toPrecision(6)).toString(); return String(Math.round(x * 1e6) / 1e6); }
  function convertQ(text) {
    var t = clean(text).replace(/[?.!]+$/, ""), l = t.toLowerCase(), m;
    var TEMP = { c: 1, celsius: 1, f: 2, fahrenheit: 2, k: 3, kelvin: 3 };
    if ((m = l.match(/\b(-?\d+(?:\.\d+)?)\s*(?:degrees?|°)?\s*(celsius|fahrenheit|kelvin|c|f|k)\s*(?:to|in|into|as)\s*(?:degrees?\s*)?(celsius|fahrenheit|kelvin|c|f|k)\b/)) && TEMP[m[2]] && TEMP[m[3]] && m[2] !== m[3] && (m[2].length > 1 || /degrees|°/.test(l))) {
      var v = +m[1], from = TEMP[m[2]], to = TEMP[m[3]], c = from === 1 ? v : (from === 2 ? (v - 32) * 5 / 9 : v - 273.15), r = to === 1 ? c : (to === 2 ? c * 9 / 5 + 32 : c + 273.15);
      return res(sig(r) + (to === 1 ? " °C" : (to === 2 ? " °F" : " K")), [], "units");
    }
    var amount, fromU, toU;
    if ((m = l.match(/\bconvert\s+(-?[\d.,]+(?:\s*\/\s*\d+)?)\s*([a-z][a-z./\s²³^0-9]*?)\s+(?:to|into|in)\s+([a-z][a-z./\s²³^0-9]*)$/)) || (m = l.match(/\b(?:how many|what is)\s+(?:is\s+)?(-?[\d.,]+(?:\s*\/\s*\d+)?)\s*([a-z][a-z./\s²³^0-9]*?)\s+(?:in|to|into|is|are)\s+(?:how many\s+)?([a-z][a-z./\s²³^0-9]*)$/))) { amount = m[1]; fromU = m[2]; toU = m[3]; }
    else if ((m = l.match(/\bhow many\s+([a-z][a-z./\s²³^0-9]*?)\s+(?:are |is )?(?:there )?in\s+(?:an?\s+|one\s+|1\s+)?([a-z][a-z./\s²³^0-9]*)$/))) { amount = "1"; toU = m[1]; fromU = m[2]; }
    else if ((m = l.match(/\bhow many\s+([a-z][a-z./\s²³^0-9]*?)\s+(?:are |is )?(?:there )?in\s+(-?[\d.,]+)\s*([a-z][a-z./\s²³^0-9]*)$/))) { amount = m[2]; toU = m[1]; fromU = m[3]; }
    else if ((m = l.match(/\bhow many\s+([a-z][a-z./\s\u00b2\u00b3^0-9]*?)\s+(?:is|are|make up|equal)\s+(-?[\d.,]+)\s*([a-z][a-z./\s\u00b2\u00b3^0-9]*)$/))) { amount = m[2]; toU = m[1]; fromU = m[3]; }
    else if ((m = l.match(/^(?:what is|what's)\s+(-?[\d.,]+(?:\s*\/\s*\d+)?)\s*([a-z][a-z./\s²³^0-9]*?)\s+(?:in|to|into)\s+([a-z][a-z./\s²³^0-9]*)$/))) { amount = m[1]; fromU = m[2]; toU = m[3]; }
    else if ((m = l.match(/^(?:what is|how many)\s+(?:an?\s+|one\s+)?([a-z][a-z./\s²³^0-9]*?)\s+in\s+([a-z][a-z./\s²³^0-9]*)$/))) { amount = "1"; fromU = m[1]; toU = m[2]; }
    else return null;
    var a = amount.indexOf("/") >= 0 ? amount.split("/").reduce(function (x, y) { return +x / +y; }) : parseFloat(amount.replace(/,/g, ""));
    if (!isFinite(a)) return null;
    var fu = parseUnit(fromU.replace(/^(?:the |a |an )/, "")), tu = parseUnit(toU.replace(/^(?:the |a |an )/, ""));
    if (!fu || !tu || dimKey(fu.dim) !== dimKey(tu.dim)) return null;
    var out = a * fu.f / tu.f;
    var rr = Math.abs(out - Math.round(out)) < 1e-9 ? String(Math.round(out)) : sig(out);
    return res(sig(a) + " " + fromU.trim() + " = " + rr + " " + toU.trim(), [], "units");
  }

  /* ----------------------------------------------------------------- words */
  function quotedWord(s) { return s.replace(/^['"]|['"]$/g, ""); }
  var ORDW = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };
  function stringQ(text) {
    var t = clean(text).replace(/[?.!]+$/, ""), l = t.toLowerCase(), m;
    if ((m = l.match(/\b(?:spell|write|say|type)\s+(?:the word\s+)?['"]?([a-z][a-z-]*)['"]?\s+(?:backwards?|in reverse|reversed)\b/)) || (m = l.match(/\breverse (?:the )?(?:word |string |letters of )?['"]?([a-z][a-z-]*)['"]?$/)) || (m = l.match(/\b['"]?([a-z][a-z-]*)['"]? (?:spelled|spelt|written) backwards?\b/))) {
      var w = m[1]; return res(w.split("").reverse().join(""), [], "word");
    }
    if ((m = l.match(/\bhow many (letters|vowels|consonants|syllables?) (?:are |is )?(?:there )?(?:in|does) (?:the word |the name )?['"]?([a-z][a-z'-]*)['"]?(?: have| contain)?$/)) || (m = l.match(/\bhow many (letters|vowels|consonants) (?:does|do) (?:the word )?['"]?([a-z][a-z'-]*)['"]? (?:have|contain)$/)) || (m = l.match(/\bhow many (letters|vowels|consonants) (?:are there )?in ['"]?([a-z][a-z'-]*)['"]?$/))) {
      var word = m[2].replace(/[^a-z]/g, ""), kind = m[1];
      if (kind === "letters") return res(String(word.length), [], "word");
      if (kind === "vowels") return res(String((word.match(/[aeiou]/g) || []).length), [], "word");
      if (kind === "consonants") return res(String((word.match(/[^aeiou]/g) || []).length), [], "word");
      if (/syllable/.test(kind)) { var sy = (word.replace(/e$/, "").match(/[aeiouy]+/g) || []).length; return res(String(Math.max(1, sy)), [], "word"); }
    }
    if ((m = l.match(/\bhow many (?:times )?(?:does )?(?:the letter )?['"]?([a-z])['"]?(?:'s|s)? (?:appear|occur|are there|show up|is there)s? (?:in )?(?:the word )?['"]?([a-z][a-z-]*)['"]?$/)) || (m = l.match(/\bhow many ['"]?([a-z])['"]?(?:'s|s) (?:are )?in (?:the word )?['"]?([a-z][a-z-]*)['"]?$/))) {
      var cnt = (m[2].match(new RegExp(m[1], "g")) || []).length; return res(String(cnt), [], "word");
    }
    if ((m = l.match(/\bwhat is the (first|last|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)) letter (?:of|in) (?:the word )?['"]?([a-z][a-z-]*)['"]?$/))) {
      var ws = m[2].replace(/[^a-z]/g, ""), ix = ORDW[m[1]] !== undefined ? ORDW[m[1]] : parseInt(m[1], 10);
      var ch = ix === -1 ? ws[ws.length - 1] : ws[ix - 1];
      if (ch) return res(ch.toUpperCase(), [], "word");
    }
    if ((m = l.match(/\bwhat is the (first|last|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)) letter (?:of|in) the (?:english )?alphabet$/))) {
      var ixa = ORDW[m[1]] !== undefined ? ORDW[m[1]] : parseInt(m[1], 10);
      if (ixa === -1) return res("Z", [], "word"); if (ixa >= 1 && ixa <= 26) return res(String.fromCharCode(64 + ixa), [], "word");
    }
    if (/\bhow many letters (?:are )?(?:there )?in (?:the |an? )?(?:english )?alphabet\b/.test(l)) return res("26", [], "word");
    if ((m = l.match(/\bwhat letter (comes|is) (after|before) ['"]?([a-z])['"]?$/)) || (m = l.match(/\bwhich letter (comes|is) (after|before) ['"]?([a-z])['"]?$/))) {
      var c0 = m[3].charCodeAt(0) - 96, nx = m[2] === "after" ? c0 + 1 : c0 - 1;
      if (nx >= 1 && nx <= 26) return res(String.fromCharCode(64 + nx), [], "word");
    }
    if ((m = l.match(/\b(?:what|which) (?:is the )?position (?:of )?(?:the )?(?:letter )?['"]?([a-z])['"]? (?:in )?(?:the )?alphabet\b/))) return res(String(m[1].charCodeAt(0) - 96), [], "word");
    /* alphabetical order */
    if ((m = t.match(/\b(?:put|arrange|sort|order|alphabeti[sz]e|list)\b[^:]*?(?:in )?alphabetical(?:ly)?(?: order)?[^:]*[:\s]\s*(.+)$/i)) || (m = t.match(/\balphabeti[sz]e\b[:\s]+(.+)$/i)) || (m = t.match(/\b(?:sort|order|arrange)\b[^:]*?:\s*(.+?)\s+(?:alphabetically|in alphabetical order)$/i))) {
      var items = m[1].split(/\s*(?:,|\band\b)\s*/).map(function (x) { return quotedWord(x.trim()); }).filter(Boolean);
      if (items.length >= 2 && items.length <= 20) return res(items.slice().sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : (a.toLowerCase() > b.toLowerCase() ? 1 : 0); }).join(", "), [], "word");
    }
    if ((m = l.match(/\bwhich (?:word |one )?(?:comes|is|would come|appears) (first|last)(?: alphabetically| in (?:the )?(?:dictionary|alphabetical order))[,:]?\s*['"]?([a-z][a-z-]*)['"]?\s+or\s+['"]?([a-z][a-z-]*)['"]?$/)) || (m = l.match(/\bwhich (?:word )?(?:comes|is) (first|last)[,:]?\s*['"]?([a-z][a-z-]*)['"]?\s+or\s+['"]?([a-z][a-z-]*)['"]?\s+(?:alphabetically|in (?:the )?dictionary)$/))) {
      var pair = [m[2], m[3]].sort(); return res(cap(m[1] === "first" ? pair[0] : pair[1]), [], "word");
    }
    if ((m = l.match(/\bwhich (?:word )?is (longer|shorter)[,:]?\s*['"]?([a-z][a-z-]*)['"]?\s+or\s+['"]?([a-z][a-z-]*)['"]?$/))) {
      var a = m[2], b = m[3]; if (a.length === b.length) return res("They are the same length (" + a.length + " letters).", [], "word");
      var longer = a.length > b.length ? a : b, shorter = longer === a ? b : a;
      return res(cap(m[1] === "longer" ? longer : shorter), [a + " has " + a.length + " letters, " + b + " has " + b.length], "word");
    }
    if ((m = l.match(/^is ['"]?([a-z][a-z-]*)['"]? a palindrome$/))) { var pw = m[1].replace(/-/g, ""); var yes = pw === pw.split("").reverse().join(""); return res((yes ? "Yes" : "No") + " — " + m[1] + " reads " + (yes ? "the same" : "differently") + " backwards (" + m[1].split("").reverse().join("") + ").", [], "word"); }
    if ((m = l.match(/^is ['"]?([a-z]+)['"]? an anagram of ['"]?([a-z]+)['"]?$/))) { var s1 = m[1].split("").sort().join(""), s2 = m[2].split("").sort().join(""); return res(s1 === s2 ? "Yes — they use exactly the same letters." : "No — they use different letters.", [], "word"); }
    if ((m = l.match(/\b(?:write|convert|make|put|change)\s+['"]?([a-z][a-z -]*)['"]?\s+in\s+(upper|lower) ?case$/)) || (m = l.match(/\b(uppercase|lowercase|upper case|lower case) (?:of |version of )?['"]?([a-z][a-z -]*)['"]?$/))) {
      if (m[2] === "upper" || m[2] === "lower") return res(m[2] === "upper" ? m[1].toUpperCase() : m[1].toLowerCase(), [], "word");
      return res(/upper/.test(m[1]) ? m[2].toUpperCase() : m[2].toLowerCase(), [], "word");
    }
    return null;
  }

  /* ---------------------------------------------------------- multiple choice */
  function parseOptions(t) {
    var m = t.match(/^(.*?)((?:\(?[A-Da-d1-4][).:]\s+.+?)(?:\s+\(?[B-Eb-e2-5][).:]\s+.+?)+)\s*$/);
    if (!m) return null;
    var stem = m[1].trim(), rest = m[2];
    var parts = rest.split(/\s+(?=\(?[A-Ea-e1-5][).:]\s)/), opts = [];
    for (var i = 0; i < parts.length; i++) { var pm = parts[i].match(/^\(?([A-Ea-e1-5])[).:]\s+(.+?)[;,]?$/); if (!pm) return null; opts.push({ key: pm[1].toUpperCase(), text: pm[2].trim().replace(/[.]$/, "") }); }
    return opts.length >= 2 ? { stem: stem, opts: opts } : null;
  }
  function numOf(s) {
    s = s.trim().replace(/,/g, "");
    var m;
    if ((m = s.match(/^(-?\d+(?:\.\d+)?)\s*%$/))) return parseFloat(m[1]) / 100;
    if ((m = s.match(/^(-?\d+)\s*\/\s*(\d+)$/))) return +m[1] / +m[2];
    if (/^-?\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
    return null;
  }
  function multipleChoiceQ(text, LGK) {
    var t = clean(text), po = parseOptions(t);
    if (!po) return null;
    var stem = po.stem.replace(/[?:]+$/, "").trim(), l = stem.toLowerCase(), m;
    var opts = po.opts, nums = opts.map(function (o) { return numOf(o.text); });
    function pick(o, why) { return res(o.key + ") " + o.text, why ? [why] : [], "choice"); }
    if (nums.every(function (x) { return x !== null; })) {
      if (/\b(?:largest|greatest|biggest|highest|maximum|most)\b/.test(l)) { var mi = nums.indexOf(Math.max.apply(null, nums)); return pick(opts[mi], "largest value " + numStr(nums[mi])); }
      if (/\b(?:smallest|least|lowest|minimum)\b/.test(l)) { var mn = nums.indexOf(Math.min.apply(null, nums)); return pick(opts[mn], "smallest value " + numStr(nums[mn])); }
      var tests = [[/\bprime\b/, function (x) { return isPrime(x); }], [/\beven\b/, function (x) { return x % 2 === 0; }], [/\bodd\b/, function (x) { return Math.abs(x % 2) === 1; }], [/\bperfect square\b/, function (x) { return x >= 0 && Number.isInteger(Math.sqrt(x)); }]];
      if ((m = l.match(/\bdivisible by (\d+)\b/)) || (m = l.match(/\bmultiple of (\d+)\b/))) { var dv = +m[1]; var hit = opts.filter(function (o, i) { return nums[i] % dv === 0; }); if (hit.length === 1) return pick(hit[0], "divisible by " + dv); }
      for (var i = 0; i < tests.length; i++) if (tests[i][0].test(l) && /\bwhich\b/.test(l)) {
        var wants = !/\bnot\b/.test(l), good = opts.filter(function (o, j) { return !!tests[i][1](nums[j]) === wants; });
        if (good.length === 1) return pick(good[0]);
      }
    }
    /* "Which of the following is a <kind>?" / "is not a <kind>" */
    if ((m = l.match(/\bwhich\b[^?]*?\b(?:is|are) (?:an? )?(not )?(?:an? |the )?([a-z ]+?)$/)) && LGK) {
      var neg = !!m[1], catW = m[2].replace(/\b(?:of the following|of these|below|listed)\b/g, "").trim();
      var cat = LGK.kind(catW);
      if (cat) {
        var ok = opts.filter(function (o) { var k = LGK.kind(o.text.toLowerCase().replace(/^(?:an? |the )/, "")); return k && LGK.isa(k, cat); });
        var good2 = neg ? opts.filter(function (o) { return ok.indexOf(o) < 0; }) : ok;
        if (good2.length === 1) return pick(good2[0], good2[0].text + " is " + (neg ? "not " : "") + "a " + cat);
      }
    }
    return null;
  }

  /* ---------------------------------------------- questions that assume something false */
  var ROLE_NEEDS = {
    president: ["country"], "prime minister": ["country"], king: ["country"], queen: ["country"], emperor: ["country"], monarch: ["country"], leader: ["country", "city"], mayor: ["city"], governor: ["state"],
    capital: ["country", "state"], currency: ["country"], "official language": ["country"], "national anthem": ["country"], population: ["country", "city", "continent"], ceo: ["company"], founder: ["company"]
  };
  var NOT_PLACES = { planet: "planet", moon: "moon", sun: "star", star: "star", ocean: "ocean", continent: "continent", mercury: "planet", venus: "planet", earth: "planet", mars: "planet", jupiter: "planet", saturn: "planet", uranus: "planet", neptune: "planet", pluto: "dwarf planet", pacific: "ocean", atlantic: "ocean", indian: "ocean", arctic: "ocean", everest: "mountain", sahara: "desert", amazon: "river", nile: "river", antarctica: "continent", europe: "continent", asia: "continent", africa: "continent", moon_: "moon" };
  function falseRoleQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/\bwho (?:is|was) the (president|prime minister|king|queen|emperor|monarch|leader|mayor|governor|ceo) of (?:the )?(?:planet |moon |mount |the )?([a-z]+)\b/))) {
      var ent = NOT_PLACES[m[2]];
      var needs = ROLE_NEEDS[m[1]] || [];
      if (ent && needs.indexOf(ent) < 0 && !(needs.indexOf("country") >= 0 && /^(?:country|state)$/.test(ent))) return res(cap(m[2]) + " is " + (/^[aeiou]/.test(ent) ? "an " : "a ") + ent + ", and " + (/^[aeiou]/.test(ent) ? "an " : "a ") + ent + " has no " + m[1] + " — the question assumes something that isn't so.", [], "premise");
    }
    if ((m = l.match(/\bwhat is the (capital|currency|population|official language) of (?:the )?(?:planet |moon )?(mercury|venus|earth|mars|jupiter|saturn|uranus|neptune|pluto|moon|sun|atlantis)\b/)) && m[2] !== "earth") {
      if (m[2] === "atlantis") return res("Atlantis is a legend, not a real place, so it has no " + m[1] + ".", [], "premise");
      if (m[1] === "population" && /^(?:mars|moon|venus|mercury|jupiter|saturn|uranus|neptune|pluto)$/.test(m[2])) return res("No people live permanently on " + cap(m[2]) + ", so its human population is zero.", [], "premise");
      return res(cap(m[2]) + " is not a country, so it has no " + m[1] + ".", [], "premise");
    }
    if ((m = l.match(/\bfirst (?:person|human|man|woman|people|astronaut|astronauts|humans)s? to (?:walk|land|step|set foot|live|go|travel|fly|get)(?: on| to| in| onto)? (?:the )?(mars|venus|mercury|jupiter|saturn|uranus|neptune|pluto|sun)\b/)))
      return res("No one yet — no human has been to " + cap(m[1]) + (m[1] === "mars" ? "; only robotic spacecraft and rovers have landed there." : "."), [], "premise");
    if ((m = l.match(/\bhow many moons does (?:the )?(sun|stars?)\b/))) return res("None — the Sun is a star, and moons orbit planets (the planets orbit the Sun).", [], "premise");
    /* ordinals beyond what exists */
    var OMAX = { president: [47, "the United States has had 47 presidents so far"], planet: [8, "the Solar System has eight planets"], month: [12, "a year has twelve months"], continent: [7, "there are seven continents"], ocean: [5, "there are five oceans"], "day of the week": [7, "a week has seven days"] };
    if ((m = l.match(/\bthe (\d+)(?:st|nd|rd|th) (president|planet|month|continent|ocean|day of the week)\b/)) || (m = l.match(/\bthe (twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|hundredth|\w+-\w+) (president|planet|month|continent|ocean)\b/))) {
      var nn = /^\d+$/.test(m[1]) ? +m[1] : ({ twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, hundredth: 100 }[m[1]] || (/-/.test(m[1]) ? ({ "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60 }[m[1].split("-")[0]] || 0) + ({ first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 }[m[1].split("-")[1]] || 0) : 0));
      var lim = OMAX[m[2]];
      if (lim && nn > lim[0] && nn - lim[0] >= (m[2] === "president" ? 3 : 1)) return res("There is no " + nn + (["th", "st", "nd", "rd"][(nn % 10 < 4 && Math.floor(nn / 10) !== 1) ? nn % 10 : 0]) + " " + m[2] + " — " + lim[1] + ".", [], "premise");
    }
    /* things that have no largest / last / smallest */
    if ((/\b(?:largest|biggest|greatest|highest|last) (?:prime|number|integer|whole number|natural number|counting number|digit of pi)\b/.test(l) && !/\b(?:below|under|less than|smaller than|before|up to|at most|not more than|between|within|that is less|that is smaller|under)\b|\bin (?:the )?(?:first|range)\b|\bof (?:these|the following)\b/.test(l)) || /\blast digit of (?:pi|π)\b/.test(l)) {
      if (/\bprime\b/.test(l)) return res("There is no largest prime — Euclid proved that the primes go on forever.", [], "premise");
      if (/\bdigit of (?:pi|π)\b/.test(l)) return res("Pi has no last digit — it is irrational, so its decimal expansion never ends or repeats.", [], "premise");
      return res("There is no largest number — whatever number you name, adding 1 gives a bigger one.", [], "premise");
    }
    if (/\bsmallest (?:positive )?(?:real number|fraction|decimal|number greater than zero|number above zero)\b/.test(l)) return res("There is no smallest positive number — halve any positive number and you get a smaller one.", [], "premise");
    if (/\bwhat is (?:infinity|∞) (?:plus|\+|minus|-|times|\*|×) (?:1|one|infinity|∞)\b/.test(l)) return res("Infinity isn't a number you can do ordinary arithmetic with; in the extended reals, ∞ + 1 is still ∞.", [], "premise");
    if (/\bwhich came first,? the chicken or the egg\b/.test(l) || /\bchicken or the egg\b/.test(l)) return res("The egg: egg-laying animals existed hundreds of millions of years before chickens, and the first chicken hatched from an egg laid by a bird that was not quite a chicken.", [], "premise");
    return null;
  }


  /* "How many wings does a dog have?": zero, for a creature that is known not to */
  function zeroAttrQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^how many (wings|legs|eyes|tails|horns|fins|arms|wheels|heads) (?:does|do|has|have) (?:an? |the |one )?([a-z]+?)s?(?: have)?$/))) return null;
    var L = root.C4LMLogic; if (!L || !L.kind) return null;
    var k = L.kind(m[2]); if (!k) return null;
    var IS = function (c) { return L.isa(k, c); };
    var attr = m[1], none = false;
    if (attr === "wings" && (IS("mammal") && k !== "bat" || IS("fish") || IS("reptile") || IS("amphibian"))) none = true;
    if (attr === "legs" && (IS("fish") || k === "snake" || k === "whale" || k === "dolphin" || k === "eel" || IS("mollusc") && k !== "octopus")) none = true;
    if (attr === "fins" && (IS("mammal") && !/whale|dolphin|seal/.test(k) || IS("bird") || IS("reptile") || IS("insect"))) none = true;
    if (attr === "wheels" && (IS("animal") || IS("fruit") || IS("vegetable"))) none = true;
    if (!none) return null;
    return res("None — " + (/^[aeiou]/.test(m[2]) ? "an " : "a ") + m[2] + " has no " + attr + ".", [], "premise");
  }
  /* "When did Napoleon land on the Moon?": a person asked to do what had not yet been invented */
  var EVENTS = [
    [/\b(?:land(?:ed)?|walk(?:ed)?|step(?:ped)?|travel(?:l?ed)?|go|went|gone) (?:on|to) the moon\b/, 1969, "the first Moon landing"],
    [/\b(?:fl(?:y|ew|own|ying)|board(?:ed)?)\b[^?]*\b(?:plane|airplane|aeroplane|jet|helicopter)\b/, 1903, "the first powered flight"],
    [/\b(?:use|used|using|own|owned|text|texted)\b[^?]*\b(?:smartphone|iphone|android phone)\b/, 2007, "the first iPhone"],
    [/\b(?:send|sent|write|wrote|check|checked)\b[^?]*\b(?:email|e-mail)\b/, 1971, "email"],
    [/\b(?:browse|browsed|surf|surfed|use|used)\b[^?]*\b(?:the internet|the web|google|a website|the world wide web)\b/, 1991, "the World Wide Web"],
    [/\b(?:watch|watched|own|owned)\b[^?]*\b(?:television|tv)\b/, 1926, "television"],
    [/\b(?:drive|drove|driven|own|owned)\b[^?]*\b(?:a car|an automobile|a motorcar)\b/, 1885, "the automobile"],
    [/\b(?:make|made|take|took)\b[^?]*\b(?:a phone call|a telephone call)\b|\buse(?:d)? (?:a |the )?telephone\b/, 1876, "the telephone"],
    [/\b(?:post|posted|use|used)\b[^?]*\b(?:facebook|twitter|instagram|tiktok|youtube)\b/, 2004, "social media"],
    [/\b(?:play|played)\b[^?]*\b(?:video ?games?|playstation|xbox|nintendo)\b/, 1972, "video games"],
    [/\b(?:use|used|turn(?:ed)? on)\b[^?]*\b(?:light ?bulb|electric light)\b/, 1879, "the light bulb"]
  ];
  /* ---- plain arithmetic phrased as a command, lists, divisors, parity, limits, exact fractions */
  var NUMRE = "-?\\d+(?:,\\d{3})*(?:\\.\\d+)?";
  function numsOf(t) { return (t.match(new RegExp(NUMRE, "g")) || []).map(function (x) { return parseFloat(x.replace(/,/g, "")); }); }
  function arithVerbQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m, ns;
    if ((m = l.match(new RegExp("^(?:please )?(?:add|sum|total|add up)(?: up)? ((?:" + NUMRE + "(?:\\s*,\\s*|\\s+and\\s+|\\s+plus\\s+|\\s+)?)+)$"))) && (ns = numsOf(m[1])).length >= 2) {
      var t = ns.reduce(function (a, b) { return a + b; }, 0); return res(numStr(Math.round(t * 1e9) / 1e9), [ns.join(" + ") + " = " + numStr(t)], "number");
    }
    if ((m = l.match(new RegExp("^(?:please )?(?:what is |what's |find |calculate |compute )?(?:the )?(?:sum|total) of ((?:" + NUMRE + "(?:\\s*,\\s*|\\s+and\\s+|\\s+)?)+)$"))) && (ns = numsOf(m[1])).length >= 2) {
      var t2 = ns.reduce(function (a, b) { return a + b; }, 0); return res(numStr(Math.round(t2 * 1e9) / 1e9), [ns.join(" + ") + " = " + numStr(t2)], "number");
    }
    if ((m = l.match(new RegExp("^(?:please )?(?:multiply|times) (" + NUMRE + ") (?:and|with|by) (" + NUMRE + ")$"))) || (m = l.match(new RegExp("^(?:what is |what's |find |calculate )?the product of (" + NUMRE + ") and (" + NUMRE + ")$")))) {
      var pr = parseFloat(m[1].replace(/,/g, "")) * parseFloat(m[2].replace(/,/g, "")); return res(numStr(Math.round(pr * 1e9) / 1e9), [m[1] + " × " + m[2]], "number");
    }
    if ((m = l.match(new RegExp("^(?:what is |what's |find |calculate )?the (?:difference|gap) between (" + NUMRE + ") and (" + NUMRE + ")$")))) {
      var a1 = parseFloat(m[1].replace(/,/g, "")), b1 = parseFloat(m[2].replace(/,/g, "")); return res(numStr(Math.abs(a1 - b1)), ["|" + m[1] + " − " + m[2] + "|"], "number");
    }
    return null;
  }
  function sortQ(text) {
    var l = clean(text).replace(/[?.!]+$/, "").replace(/\b(?:alphabetically|numerically)\b\s*[:\-]?\s*/i, ""), m;
    if (!(m = l.match(/^(?:please )?(?:sort|order|arrange|rank)\s+(?:these |the |this |following )*(numbers|values|words|items|names|letters|list)?\s*(?:from (?:smallest|lowest|least) to (?:largest|highest|greatest|biggest) |from (?:largest|highest|greatest|biggest) to (?:smallest|lowest|least) |in (?:ascending|descending|alphabetical|reverse alphabetical) order )?[:\-]?\s*(.+?)(?:\s+(?:in (?:ascending|descending|alphabetical|reverse alphabetical|increasing|decreasing) order|from (?:smallest|lowest|least) to (?:largest|highest|greatest|biggest)|from (?:largest|highest|greatest|biggest) to (?:smallest|lowest|least)|alphabetically|descending|ascending))?$/i))) return null;
    var low = l.toLowerCase(), items = m[2].split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (items.length < 2) return null;
    var desc = /descending|largest to smallest|greatest to least|highest to lowest|reverse|decreasing|biggest to smallest/.test(low) || /\bfrom (?:largest|highest|greatest|biggest)/.test(low);
    var allNum = items.every(function (x) { return /^-?\d+(?:\.\d+)?$/.test(x); });
    var sorted = items.slice().sort(allNum ? function (a, b) { return a - b; } : function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0; });
    if (desc) sorted.reverse();
    return res(sorted.join(", "), [], "list");
  }
  function numberFactsQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/^(?:what are|list|find|give me|name) (?:all )?(?:the )?(?:factors|divisors) of (\d+)$/)) || (m = l.match(/^(?:what are|list|find) the factors of (\d+)$/))) {
      var n = +m[1]; if (n < 1 || n > 1e6) return null; var f = []; for (var i = 1; i * i <= n; i++) if (n % i === 0) { f.push(i); if (i * i !== n) f.push(n / i); }
      f.sort(function (a, b) { return a - b; }); return res(f.join(", ") + " (" + f.length + " factors)", [], "number");
    }
    if ((m = l.match(/^(?:what are|list|find) (?:the )?multiples of (\d+)(?: up to (\d+))?$/))) {
      var k = +m[1], lim = m[2] ? +m[2] : k * 10, out = []; if (k < 1 || lim / k > 50) return null; for (var j = k; j <= lim; j += k) out.push(j); return res(out.join(", "), [], "number");
    }
    if ((m = l.match(/^is (\d+) (?:divisible|evenly divisible) by (\d+)$/)) || (m = l.match(/^does (\d+) divide (?:evenly )?by (\d+)$/))) {
      var a = +m[1], b = +m[2]; if (!b) return null; return res((a % b === 0 ? "Yes" : "No") + " — " + a + " ÷ " + b + (a % b === 0 ? " = " + (a / b) + "." : " leaves a remainder of " + (a % b) + "."), [], "number");
    }
    if ((m = l.match(/^is (-?\d+) (?:odd or even|even or odd)$/)) || (m = l.match(/^is (-?\d+) (even|odd)$/))) {
      var v = +m[1], even = v % 2 === 0, asked = m[2];
      if (asked === "even" || asked === "odd") return res((even === (asked === "even") ? "Yes" : "No") + " — " + v + " is " + (even ? "even" : "odd") + ".", [], "number");
      return res(v + " is " + (even ? "even" : "odd") + ".", [], "number");
    }
    return null;
  }
  function fracOpQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    var FR = "(\\d+)\\s*/\\s*(\\d+)";
    if ((m = l.match(new RegExp("^(?:what is |what's |calculate |find |compute )?(?:the )?(?:sum of )?" + FR + " (?:\\+|plus|and) " + FR + "$"))) && /\b(?:sum|plus|\+)\b/.test(l) ||
        (m = l.match(new RegExp("^(?:what is |what's |calculate |find |compute )?" + FR + " (?:minus|-|\\u2212) " + FR + "$"))) && (m.op = "-") ||
        (m = l.match(new RegExp("^(?:what is |what's |calculate |find |compute )?" + FR + " (?:times|\\*|x|\\u00d7|multiplied by) " + FR + "$"))) && (m.op = "*") ||
        (m = l.match(new RegExp("^(?:what is |what's |calculate |find |compute )?" + FR + " (?:divided by|\\u00f7|/ ) " + FR + "$"))) && (m.op = "/")) {
      var a = +m[1], b = +m[2], c = +m[3], d = +m[4], op = m.op || "+";
      if (!b || !d) return null;
      var nn, dd;
      if (op === "+") { nn = a * d + c * b; dd = b * d; } else if (op === "-") { nn = a * d - c * b; dd = b * d; } else if (op === "*") { nn = a * c; dd = b * d; } else { if (!c) return null; nn = a * d; dd = b * c; }
      var g = gcd(nn, dd); nn /= g; dd /= g; if (dd < 0) { nn = -nn; dd = -dd; }
      var frac = dd === 1 ? String(nn) : nn + "/" + dd, dec = nn / dd;
      return res(frac + (dd === 1 ? "" : " (about " + numStr(Math.round(dec * 1e4) / 1e4) + ")"), [a + "/" + b + " " + op + " " + c + "/" + d], "number");
    }
    return null;
  }
  /* limits by evaluation: at infinity, or at a finite point from both sides */
  function limitQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:what is |find |evaluate |compute |calculate )?(?:the )?limit of (.+?) as ([a-z]) (?:approaches|goes to|tends to|tends towards|→|->|go to) (-?infinity|∞|-∞|inf|-?\d+(?:\.\d+)?)$/))) return null;
    var expr = m[1].replace(/\^/g, "^"), v = m[2], target = m[3], ast;
    try { ast = parse(expr.replace(/\bx squared\b/g, "x^2")); } catch (e) { return null; }
    function f(x) { var env = {}; env[v] = x; try { return evalAst(ast, env); } catch (e2) { return NaN; } }
    var inf = /inf|∞/.test(target), neg = /^-/.test(target);
    if (inf) {
      var xs = neg ? [-1e3, -1e5, -1e7] : [1e3, 1e5, 1e7], ys = xs.map(f);
      if (ys.some(function (y) { return !isFinite(y) && !isNaN(y); }) || ys.every(function (y) { return isNaN(y); })) return null;
      if (Math.abs(ys[2]) > 1e6 && Math.abs(ys[2]) > Math.abs(ys[1]) * 5) return res((ys[2] > 0 ? "∞" : "-∞") + " (the expression grows without bound)", [], "limit");
      if (Math.abs(ys[2] - ys[1]) < 1e-3 * Math.max(1, Math.abs(ys[2]))) { var r = Math.round(ys[2] * 1e4) / 1e4; return res(numStr(r), ["values at 10^3, 10^5, 10^7: " + ys.map(function (y) { return numStr(Math.round(y * 1e6) / 1e6); }).join(", ")], "limit"); }
      return null;
    }
    var a = parseFloat(target), h = [1e-3, 1e-5, 1e-7], right = h.map(function (d) { return f(a + d); }), left = h.map(function (d) { return f(a - d); }), direct = f(a);
    if (isFinite(direct) && right.concat(left).every(function (y) { return isFinite(y); }) && Math.abs(right[2] - direct) < 1e-4 * Math.max(1, Math.abs(direct))) return res(numStr(Math.round(direct * 1e6) / 1e6), ["the expression is continuous at " + a + ", so substitute"], "limit");
    if (right.every(isFinite) && left.every(isFinite) && Math.abs(right[2] - left[2]) < 1e-3 * Math.max(1, Math.abs(right[2])) && Math.abs(right[2] - right[1]) < 1e-2 * Math.max(1, Math.abs(right[2]))) return res(numStr(Math.round(right[2] * 1e4) / 1e4), ["both one-sided values approach the same number"], "limit");
    if (Math.abs(right[2]) > 1e5 && Math.abs(left[2]) > 1e5) return res(Math.sign(right[2]) === Math.sign(left[2]) ? (right[2] > 0 ? "∞" : "-∞") : "does not exist (the two sides go to opposite infinities)", [], "limit");
    return null;
  }
  function ouncesQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/^how many (?:fluid |fl\.? )?ounces (?:are )?in (?:a |one |1 )?(cup|pint|quart|gallon)$/))) {
      var F = { cup: 8, pint: 16, quart: 32, gallon: 128 }[m[1]];
      return res(F + " fluid ounces (1 " + m[1] + " = " + F + " fl oz).", [], "units");
    }
    if ((m = l.match(/^how many (cups|pints|quarts|gallons|tablespoons|teaspoons) (?:are )?in (?:a |one |1 )?(gallon|quart|pint|cup|tablespoon)$/))) {
      var T = { "gallon:quarts": 4, "gallon:pints": 8, "gallon:cups": 16, "quart:pints": 2, "quart:cups": 4, "pint:cups": 2, "cup:tablespoons": 16, "tablespoon:teaspoons": 3, "cup:teaspoons": 48 }[m[2] === m[2] && m[3] + ":" + m[1]];
      if (T) return res(T + " " + m[1] + " (1 " + m[3] + " = " + T + " " + m[1] + ").", [], "units");
    }
    return null;
  }

  /* continents are not countries, and Australia is both */
  var CONTINENTS = ["africa", "antarctica", "asia", "australia", "europe", "north america", "south america", "oceania"];
  function continentQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/^(?:is|are) (?:the )?([a-z ]+?) (?:a |an |one of the )?continents?$/))) {
      var x = m[1].trim();
      if (x === "australia") return res("Yes \u2014 Australia is both a country and, in the usual seven-continent model, a continent (sometimes called Oceania or Australia/Oceania).", [], "geography");
      if (CONTINENTS.indexOf(x) >= 0) return res("Yes \u2014 " + cap0(x) + " is one of the seven continents.", [], "geography");
      var K = root.C4LMKB, hit = K && K.resolve ? K.resolve(x, { strict: true }) : [];
      if (hit && hit.length && /\b(?:country|island|city|ocean|sea|river|mountain|state|desert|lake)\b/i.test(hit[0].entity.defn || "")) return res("No \u2014 " + cap0(x) + " is not a continent; the seven continents are Africa, Antarctica, Asia, Australia, Europe, North America and South America.", [], "geography");
    }
    if ((m = l.match(/^(?:is|are) (?:the )?([a-z ]+?) (?:a |an )countr(?:y|ies)$/)) && CONTINENTS.indexOf(m[1].trim()) >= 0 && m[1].trim() !== "australia")
      return res("No \u2014 " + cap0(m[1].trim()) + " is a continent, not a country.", [], "geography");
    return null;
  }
  function cap0(w) { return w.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
  /* "Who invented the smartphone in 1850?": the thing did not exist yet */
  var INVENTED = { telephone: 1876, phone: 1876, "light bulb": 1879, lightbulb: 1879, airplane: 1903, aeroplane: 1903, plane: 1903, television: 1926, tv: 1926, smartphone: 2007, iphone: 2007, internet: 1969, "world wide web": 1989, email: 1971, computer: 1945, laptop: 1981, radio: 1895, automobile: 1885, car: 1885, photograph: 1826, camera: 1826, "steam engine": 1712, "printing press": 1440, "atomic bomb": 1945, "nuclear bomb": 1945, "nuclear weapon": 1945, penicillin: 1928, telescope: 1608, microscope: 1590, battery: 1800, "social media": 2004, facebook: 2004, google: 1998, "video game": 1958, "space shuttle": 1981, satellite: 1957, rocket: 1926, helicopter: 1939, submarine: 1620, "electric car": 1881, "x-ray": 1895, "x-rays": 1895, laser: 1960, transistor: 1947, "microwave oven": 1945, "credit card": 1950, "gps": 1978 };
  function inventedBeforeQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:who|which person) (?:invented|created|built|made|discovered|developed) (?:the |a |an )?([a-z -]+?) in (?:the year )?(\d{3,4})$/)) && !(m = l.match(/^(?:when|in what year) did (?:someone|anyone|somebody|people) (?:invent|create|build|make|discover) (?:the |a |an )?([a-z -]+?) in (\d{3,4})$/))) return null;
    var thing = m[1].trim(), yr = +m[2];
    if (INVENTED[thing] === undefined && INVENTED[thing.replace(/s$/, "")] !== undefined) thing = thing.replace(/s$/, "");
    if (INVENTED[thing] === undefined || yr >= INVENTED[thing]) return null;
    return res("Nobody did \u2014 the " + thing + " did not exist yet in " + yr + "; it was not invented until about " + INVENTED[thing] + ".", [], "anachronism", 0.9);
  }
  function yearOfPhrase(n, bce) { return bce ? -parseInt(n, 10) : parseInt(n, 10); }
  function lifespanOf(name) {
    var FXm = root.C4LMFacts;
    if (!FXm || !FXm._docs) return null;
    var docs = FXm._docs(), low = name.toLowerCase(), i, m;
    for (i = 0; i < docs.length; i++) {
      var t = docs[i].text, lf = t.indexOf(" lived from ");
      if (lf < 0) continue;
      var subj = t.slice(0, lf).toLowerCase();
      if (subj !== low && subj.indexOf(low + " ") !== 0 && !new RegExp("(?:^|\\s)" + low.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$").test(subj)) continue;
      if ((m = t.match(/lived from (\d+)( BCE| CE)? to (\d+)( BCE| CE)?/))) return { born: yearOfPhrase(m[1], /BCE/.test(m[2] || "")), died: yearOfPhrase(m[3], /BCE/.test(m[4] || "")) };
    }
    return null;
  }
  function anachronismQ(text) {
    var t = clean(text).replace(/[?.!]+$/, ""), m;
    if (!(m = t.match(/^(?:[Ww]hen|[Ww]hat year|[Ii]n what year|[Ii]n which year|[Hh]ow old was)\s+(?:did|was|were)\s+((?:[A-Z][\w.'’-]*)(?:\s+(?:de|da|van|von|the|of|[A-Z][\w.'’-]*))*)\s+(.+)$/))) return null;
    var who = m[1], rest = m[2].toLowerCase(), i;
    for (i = 0; i < EVENTS.length; i++) if (EVENTS[i][0].test(rest)) {
      var life = lifespanOf(who);
      if (life && life.died < EVENTS[i][1] && life.died !== null) return res(who + " lived from " + (life.born < 0 ? -life.born + " BCE" : life.born) + " to " + (life.died < 0 ? -life.died + " BCE" : life.died) + ", long before " + EVENTS[i][2] + " (" + EVENTS[i][1] + "), so that could not have happened.", [], "premise");
    }
    return null;
  }


  /* squares, cubes, roots and rounding */
  function powerQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    function out(v, how) { return res(numStr(v), [how], "number"); }
    if ((m = l.match(/^(?:what is |what's |calculate |find |compute |evaluate )?(?:the value of )?(-?\d+(?:\.\d+)?) (squared|cubed)$/))) { var b = +m[1], e = m[2] === "squared" ? 2 : 3; return out(Math.pow(b, e), m[1] + "^" + e); }
    if ((m = l.match(/^(?:what is |what's |calculate |find |compute )?(?:the )?(square|cube) of (-?\d+(?:\.\d+)?)$/))) { var e2 = m[1] === "square" ? 2 : 3; return out(Math.pow(+m[2], e2), m[2] + "^" + e2); }
    if ((m = l.match(/^(?:what is |what's |calculate |find |compute )?(?:the )?(cube|square|fourth|fifth) root of (-?\d+(?:\.\d+)?)$/))) {
      var k = { square: 2, cube: 3, fourth: 4, fifth: 5 }[m[1]], x = +m[2], r = x < 0 && k % 2 ? -Math.pow(-x, 1 / k) : Math.pow(x, 1 / k);
      if (x < 0 && k % 2 === 0) return null;
      var rr = Math.round(r); if (Math.abs(r - rr) < 1e-9 && Math.pow(rr, k) === x) r = rr;
      return out(r, "the number whose " + k + (k === 2 ? "nd" : k === 3 ? "rd" : "th") + " power is " + m[2]);
    }
    if ((m = l.match(/^(?:what is |what's |calculate |find |compute )?(-?\d+(?:\.\d+)?) (?:to the power of|raised to the power of|to the) (?:power )?(-?\d+(?:\.\d+)?)$/))) return out(Math.pow(+m[1], +m[2]), m[1] + "^" + m[2]);
    return null;
  }
  /* a number written as a fraction, decimal, percent or integer */
  function numVal(x) {
    x = String(x).trim().replace(/^the (?:number |fraction )?/, "").replace(/,/g, "");
    var m;
    if ((m = x.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/))) return +m[2] ? +m[1] / +m[2] : null;
    if ((m = x.match(/^(-?\d+(?:\.\d+)?)\s*%$/))) return +m[1] / 100;
    if ((m = x.match(/^(-?\d*\.?\d+)$/))) return +m[1];
    return null;
  }
  function compareNumsQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m, a, b, big;
    if ((m = l.match(/^which is (larger|bigger|greater|higher|more|smaller|less|lesser|lower)[,:]?\s+(.+?)\s+or\s+(.+)$/))) {
      a = numVal(m[2]); b = numVal(m[3]); big = /larger|bigger|greater|higher|more/.test(m[1]);
      if (a === null || b === null) return null;
      if (a === b) return res("They are equal: " + m[2] + " = " + m[3] + ".", [], "compare");
      var win = (a > b) === big ? m[2] : m[3];
      return res(win.replace(/^the (?:number |fraction )?/, "") + " is " + (big ? "larger" : "smaller") + " (" + numStr(Math.round(a * 1e6) / 1e6) + " vs " + numStr(Math.round(b * 1e6) / 1e6) + ").", [], "compare");
    }
    if ((m = l.match(/^is (.+?) (greater than|larger than|bigger than|more than|less than|smaller than|fewer than|equal to) (.+)$/))) {
      a = numVal(m[1]); b = numVal(m[3]);
      if (a === null || b === null) return null;
      var op = m[2], ok = /greater|larger|bigger|more/.test(op) ? a > b : (/less|smaller|fewer/.test(op) ? a < b : a === b);
      return res((ok ? "Yes" : "No") + " \u2014 " + numStr(Math.round(a * 1e6) / 1e6) + (a === b ? " equals " : (a > b ? " is greater than " : " is less than ")) + numStr(Math.round(b * 1e6) / 1e6) + ".", [], "compare");
    }
    return null;
  }
  function rootDecimalsQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:what is |find |calculate |compute )?(?:the )?(square|cube) root of (\d+(?:\.\d+)?)(?: (?:to|correct to|rounded to|up to)|,? rounded to) (\d+|one|two|three|four|five|six) (?:decimal places?|d\.p\.|decimals?)$/))) return null;
    var W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }, d = /^\d+$/.test(m[3]) ? +m[3] : W[m[3]], v = Math.pow(+m[2], m[1] === "square" ? 1 / 2 : 1 / 3);
    return res(v.toFixed(d), [], "number");
  }
  function roundQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    var W = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
    if ((m = l.match(/^round (-?\d+(?:\.\d+)?) (?:off )?to (?:the nearest )?(\d+|zero|one|two|three|four|five|six) (?:decimal places?|decimals?|places?|d\.p\.)$/))) {
      var d = /^\d+$/.test(m[2]) ? +m[2] : W[m[2]], f = Math.pow(10, d), v = Math.round((+m[1] + Number.EPSILON * Math.sign(+m[1])) * f) / f;
      return res(d === 0 ? String(v) : v.toFixed(d), [], "number");
    }
    if ((m = l.match(/^round (-?\d+(?:\.\d+)?) (?:off )?to the nearest (whole number|integer|ten|hundred|thousand|tenth|hundredth|thousandth)$/))) {
      var g = { "whole number": 1, integer: 1, ten: 10, hundred: 100, thousand: 1000, tenth: 0.1, hundredth: 0.01, thousandth: 0.001 }[m[2]];
      var r2 = Math.round(+m[1] / g) * g; r2 = Math.round(r2 * 1e6) / 1e6; return res(String(r2), [], "number");
    }
    return null;
  }

  /* ----------------------------------------------------------------- solve */
  var SOLVERS = [falseRoleQ, zeroAttrQ, anachronismQ, inventedBeforeQ, continentQ, arithVerbQ, sortQ, numberFactsQ, fracOpQ, limitQ, ouncesQ, rootDecimalsQ, compareNumsQ, powerQ, roundQ, convertQ, factorialExprQ, derivativeQ, integralQ, expandQ, factorQ, simplifyQ, inequalityQ, quadraticQ, evalFunctionQ, primeQ, fibQ, mathFnQ, chooseQ, absEquationQ, absQ, fractionQ, baseQ, stringQ];
  function solve(text, ctx) {
    var t = clean(text);
    if (!t || t.length > 600) return null;
    var mc = null;
    try { mc = multipleChoiceQ(t, root.C4LMLogic); } catch (e) { mc = null; }
    if (mc) return mc;
    for (var i = 0; i < SOLVERS.length; i++) {
      var r = null;
      try { r = SOLVERS[i](t); } catch (e) { r = null; }
      if (r && r.answer) return r;
    }
    return null;
  }

  root.C4LMTools = { solve: solve, parse: parse, evalAst: evalAst, show: show, derivative: derivativeQ, integral: integralQ, factor: factorQ, expand: expandQ, multipleChoice: multipleChoiceQ, isPrime: isPrime, toRoman: toRoman };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMTools;
})(typeof window !== "undefined" ? window : globalThis);
