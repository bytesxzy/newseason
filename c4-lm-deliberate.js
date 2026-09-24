/* CELL4 deliberation controller for hard reasoning questions.
 *
 * Four ROLES, implemented as functions over structured candidates -- not
 * four personas writing prose at each other:
 *
 *   SOLVER    produces candidate solutions from independent sources:
 *             the problem reasoner (c4-lm-problem.js, several derivations
 *             per problem), the exact tools (c4-lm-tools.js), the operator
 *             library (c4-lm-reason.js), dimensional reasoning
 *             (c4-lm-comprehend.js) and, in TOOL mode only, retrieved
 *             evidence. Each candidate records
 *               answer, claims, assumptions, derivation (steps),
 *               toolsUsed, evidenceUsed, uncertainty, source
 *   CRITIC    inspects each candidate for unsupported assumptions, missing
 *             cases, invalid inference, dimension mismatch, arithmetic
 *             errors, contradictions with other candidates, knowledge gaps
 *             and ambiguous interpretation
 *   VERIFIER  re-checks with exact mechanisms: the tool's own independent
 *             verifier, re-evaluation of stated steps, substitution, the
 *             kernel's ReasoningGraph for claims, agreement between
 *             independent derivations
 *   SELECTOR  chooses by VERIFIED SUPPORT (independent verified sources,
 *             minus critic issues), never by length or eloquence;
 *             disagreement between verified candidates LOWERS confidence
 *             and can trigger another bounded round of reasoning
 *
 * Adaptive: difficulty() maps generic signals through the shared
 * C4ReasonMeta.allocate(): a single verified exact result takes the fast
 * path; disagreement, verifier failure, ambiguity, knowledge gaps, many
 * interacting constraints or a long derivation take the deep path, with
 * recursion (reformulation, decomposition) bounded by maxDepth.
 *
 * Modes (never mixed in one score):
 *   closed  local knowledge, local exact tools, local reasoning; NO network
 *   tool    closed + retrieval / evidence federation (solveAsync)
 *
 * Exports root.C4LMDeliberate. Local, deterministic; the network is touched
 * only by solveAsync in tool mode, through the federation it is given.
 */
(function (root) {
  "use strict";

  function get(name) { return root[name] || null; }
  var K = get("C4ReasonKernel");
  if (!K && typeof require === "function") { try { K = require("./c4-reason-kernel.js"); } catch (e) { K = null; } }

  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!]+$/, "").trim(); }
  function numsIn(s) { return (String(s).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []); }
  /* The comparable content of an answer: its numbers when it has any
     (order-insensitive for root sets), else its normalised text. */
  function answerKey(a) {
    if (a && typeof a === "object" && a.key) return a.key;
    var n = numsIn(a).map(function (x) {
      if (x.indexOf("/") > 0) { var p = x.split("/"); return String(Math.round(+p[0] / +p[1] * 1e9) / 1e9); }
      return String(Math.round(+x * 1e9) / 1e9);
    });
    return n.length ? n.sort().join("|") : norm(a);
  }

  /* ------------------------------------------------------ input readers
     Tool inputs read from the text by the STRUCTURE of what is written
     (a matrix literal, a list of numbers, a conversion phrase), not by
     question templates. Each returns an input object or null. */
  var READ = {
    matrix: function (t) {
      var m = t.match(/\[\s*\[[^\]]*\](?:\s*,\s*\[[^\]]*\])*\s*\]/);
      if (!m) return null;
      try { var A = JSON.parse(m[0]); return Array.isArray(A) && A.length && A.every(function (r) { return Array.isArray(r) && r.length === A[0].length; }) ? { A: A } : null; } catch (e) { return null; }
    },
    numbers: function (t) {
      /* "4, 8 and 12", "4, 8, and 12", "4 and 8": the last item joins with "and" */
      var m = t.match(/(?:of|:)\s*((?:-?\d+(?:\.\d+)?(?:\s*,\s*(?:and\s+)?|\s+and\s+))+-?\d+(?:\.\d+)?)/);
      return m ? { values: m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(Number) } : null;
    },
    convert: function (t) {
      var m = t.match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Z/^0-9*]+?)\s+(?:to|in|into)\s+([a-zA-Z/^0-9*]+)/);
      return m ? { value: m[1], from: m[2], to: m[3] } : null;
    },
    bayes: function (t) {
      /* base rate, true-positive rate, false-positive rate */
      var pct = function (re) { var m = t.match(re); return m ? String(+m[1] / 100) : null; };
      var prior = pct(/(\d+(?:\.\d+)?)\s*%\s*of\s+(?:the\s+)?(?:population|people|patients|cases|items|emails|users)/i);
      var tpr = pct(/(?:detects?|sensitivity(?:\s+of)?|true positive rate(?:\s+of)?|positive in|identifies)\s*(\d+(?:\.\d+)?)\s*%/i) ||
                pct(/(\d+(?:\.\d+)?)\s*%\s*(?:sensitivity|true positive)/i);
      var fpr = pct(/(?:false positive rate(?:\s+of)?|false positives? (?:in|for|of)?)\s*(\d+(?:\.\d+)?)\s*%/i) ||
                pct(/(\d+(?:\.\d+)?)\s*%\s*(?:false positive)/i);
      if (!prior || !tpr || !fpr) return null;
      var f = function (x) { return String(Math.round(+x * 1e6)) + "/1000000"; };
      return { priors: { H: f(prior), notH: f(1 - prior) }, likelihoods: { H: f(tpr), notH: f(fpr) }, ask: "H" };
    },
    sum: function (t) {
      var m = t.match(/(sum|product) of\s+(.+?)\s+for\s+([a-z])\s*(?:=|from)\s*(-?\d+)\s*(?:to|\.\.)\s*(-?\d+)/i);
      return m ? { expr: m[2], variable: m[3], from: m[4], to: m[5], product: /product/i.test(m[1]) } : null;
    },
    program: function (t) {
      var m = t.match(/(?:program|code|after running)[^:]*:\s*([\s\S]+?)(?:\s+what\b|\?|$)/i);
      if (!m || !/=/.test(m[1])) return null;
      var v = t.match(/\bvalue of ([a-z])\b/i);
      return { program: m[1].replace(/\s*;\s*/g, "; "), ask: v ? v[1] : null };
    },
    extremum: function (t) {
      var m = t.match(/(minimum|maximum|minimi[sz]e|maximi[sz]e|smallest value|largest value)\s+(?:value\s+)?of\s+(?:f\(x\)\s*=\s*)?(.+?)\s+(?:for|on|over|with)\s+(?:x\s+(?:in|between|from)\s*)?\[?\s*(-?\d+(?:\.\d+)?)\s*(?:,|and|to)\s*(-?\d+(?:\.\d+)?)\]?/i);
      return m ? { expr: m[2], a: m[3], b: m[4], goal: /max|largest/i.test(m[1]) ? "max" : "min" } : null;
    },
    subsets: function (t) {
      var m = t.match(/subsets? of \{\s*1\s*,\s*(?:2\s*,\s*)?(?:\.\.\.|…)\s*,\s*(\d+)\s*\}[^?]*?sum(?:s)?\s*(?:to|of|equal to)?\s*(\d+)/i);
      if (!m) return null;
      var n = +m[1], items = []; for (var i = 1; i <= n; i++) items.push(i);
      return n <= 18 ? { items: items, targetSum: +m[2] } : null;
    },
    rational: function (t) {
      var m = t.match(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)\s*=\s*(?:\(([^()]+)\)|([^\s/()]+))\s*(?:\/\s*\(([^()]+)\))?/);
      if (!m || !/[a-z]/i.test(m[2])) return null;
      return { left: [m[1], m[2]], right: [m[3] || m[4], m[5] || "1"] };
    },
    root: function (t) {
      var m = t.match(/(?:root|zero|solution) of\s+(.+?)\s*(?:=\s*0)?\s+(?:between|in|on)\s+\[?\s*(-?\d+(?:\.\d+)?)\s*(?:and|,|to)\s*(-?\d+(?:\.\d+)?)/i);
      return m ? { expr: m[1], a: m[2], b: m[3] } : null;
    }
  };
  var TOOL_READERS = {
    "matrix.det": READ.matrix, "matrix.inverse": READ.matrix, "matrix.rank": READ.matrix,
    "stats.describe": READ.numbers, "units.convert": READ.convert, "prob.bayes": READ.bayes,
    "seq.sum": READ.sum, "prog.exec": READ.program, "opt.extremum": READ.extremum,
    "comb.enumerate": READ.subsets, "rational.solve": READ.rational, "root.find": READ.root
  };
  /* which reader output answers the question for tools with several outputs */
  function toolAnswer(name, r, input, text) {
    if (!r || !r.ok) return null;
    if (name === "stats.describe") {
      var v = r.value, low = text.toLowerCase(), pick = /median/.test(low) ? "median" : /mode/.test(low) ? "mode" :
              /sample (?:variance|standard)/.test(low) ? (/standard/.test(low) ? "sampleStdev" : "sampleVariance") :
              /standard deviation/.test(low) ? "stdev" : /variance/.test(low) ? "variance" : "mean";
      var val = v[pick];
      return val === null || val === undefined ? null : { text: String(val && val.toString ? val.toString() : val), value: val, part: pick };
    }
    if (name === "prob.bayes") return { text: "P = " + r.value[input.ask].toString(), value: r.value[input.ask] };
    if (name === "opt.extremum") {
      /* "the minimum of f" asks for f's value; "at what x" asks for the point */
      var atX = /\b(?:at what|which|what) (?:value of )?x\b|\bwhere\b|\barg ?(?:min|max)|\b(?:minimi[sz]|maximi[sz])er\b/i.test(text);
      var ev = atX ? r.value.x : r.value.f;
      return { text: String(Math.round(ev * 1e9) / 1e9), value: ev, part: atX ? "x" : "f" };
    }
    if (name === "prog.exec" && input.ask && r.value[input.ask]) return { text: input.ask + " = " + r.value[input.ask].toString(), value: r.value[input.ask] };
    return { text: r.text, value: r.value };
  }

  /* ============================================================ SOLVER */

  /* The numbers a candidate's READING of the question consumed (its tool
     input, parsed problem or evaluated expression), for the critic's
     unused-givens check. Keys that restate the question or the answer are
     skipped. */
  var READ_SKIP = { text: 1, candidateAnswers: 1, options: 1, assumptions: 1, domain: 1, kind: 1, claims: 1, requiredKnowledge: 1, unknowns: 1, d: 1 };
  function readsOf(obj) {
    if (obj == null) return null;
    var s;
    try { s = typeof obj === "string" ? obj : JSON.stringify(obj, function (k, v) { return READ_SKIP[k] ? undefined : (typeof v === "bigint" ? v.toString() : v); }); }
    catch (e) { return null; }
    var out = {};
    (String(s).match(/-?\d+(?:\.\d+)?/g) || []).forEach(function (x) { out[String(Math.abs(+x))] = 1; });
    return out;
  }
  /* Checks that re-derive by a DIFFERENT mechanism (a tool's own verifier,
     substitution into the question's equation, an independent derivation)
     are "independent"; re-evaluating one's own expression is "self". */
  function strength(checks, kind) { return checks.map(function (c) { return Object.assign({ strength: c.strength || kind }, c); }); }

  function solverCandidates(text, S, opts) {
    var PR = get("C4LMProblem"), TL = get("C4LMTools"), RS = get("C4LMReason"), C = get("C4LMCore"), CMP = get("C4LMComprehend");
    var out = [];
    /* the problem reasoner: every derivation is its own candidate */
    if (PR) {
      var p = null;
      try { p = PR.answer(text); } catch (e) { p = null; }
      if (p && p.derivations) p.derivations.forEach(function (d) {
        out.push({ source: "problem", method: d.method, answer: d.answer, key: answerKey(d.answer), claims: [], assumptions: (p.assumptions || []).slice(),
                   derivation: [d.method], toolsUsed: [], evidenceUsed: [], checks: strength(d.checks, "independent"), uncertainty: 1 - (p.confidence || 0.5),
                   reads: readsOf(p.problem) });
      });
    }
    /* exact tools the structure suggests, with inputs read from the text */
    if (TL) (S.possibleTools || []).forEach(function (name) {
      var reader = TOOL_READERS[name];
      if (!reader) return;
      var input = reader(text);
      if (!input) return;
      var r = TL.run(name, input), a = toolAnswer(name, r, input, text);
      if (!a) return;
      out.push({ source: "tool", method: name, answer: a.text, key: answerKey(a.text), claims: [], assumptions: [], derivation: [name + "(" + JSON.stringify(input).slice(0, 80) + ")"],
                 toolsUsed: [name], evidenceUsed: [], checks: strength(r.checks, "independent"), uncertainty: r.verified ? 0.05 : 0.6, exact: r.exact,
                 reads: readsOf(input), part: a.part });
    });
    /* the operator library, with its trace re-checked */
    if (RS && C && !opts.noOperators) {
      try {
        var fr = C.parse(text, null), rr = fr && !fr.empty ? RS.solve(fr) : null;
        if (rr && rr.text !== undefined) {
          var steps = rr.steps || [], checks = [];
          if (PR && rr.expression !== undefined && rr.value !== undefined) {
            var vv = PR.verifyValue(rr.expression, rr.value);
            if (vv) checks.push({ name: "exact re-evaluation", pass: vv.agree });
          }
          if (PR && steps.length) { var st = PR.verifySteps(steps); if (st.checked) checks.push({ name: "steps re-computed", pass: !st.failed.length }); }
          out.push({ source: "operators", method: rr.route || "operators", answer: String(rr.text), key: answerKey(rr.value !== undefined ? String(rr.value) : rr.text),
                     claims: [], assumptions: [], derivation: steps.slice(0, 12), toolsUsed: [], evidenceUsed: [], checks: strength(checks, "self"), uncertainty: 0.3,
                     reads: rr.expression !== undefined ? readsOf(String(rr.expression)) : null });
        }
      } catch (e) { /* the operator library declines */ }
    }
    /* dimensional reasoning */
    if (CMP && CMP.solveQuantity) {
      try {
        var q = CMP.solveQuantity(text);
        if (q && q.text && q.status === "solved" && q.value !== undefined)
          out.push({ source: "quantity", method: "dimensional analysis", answer: q.text, key: answerKey(String(q.value)), claims: [],
                     assumptions: q.assumption ? [q.assumption] : [], derivation: [q.summary || "units"], toolsUsed: [], evidenceUsed: q.assumption ? ["local knowledge base"] : [],
                     checks: [{ name: "dimensions agree", pass: true, strength: "self" }], uncertainty: q.assumption ? 0.25 : 0.1 });
        else if (q && q.status && q.status !== "solved")
          out.push({ source: "quantity", method: "dimensional analysis", answer: q.text, key: "underdetermined", claims: [], assumptions: [],
                     derivation: [q.summary || ""], toolsUsed: [], evidenceUsed: [], checks: [], uncertainty: 0.3, underdetermined: true, missing: q.missing });
      } catch (e) { /* declines */ }
    }
    /* injected candidates (tests, other components) join on equal terms */
    (opts.candidates || []).forEach(function (c) { out.push(normalizeCandidate(c)); });
    return out;
  }
  function normalizeCandidate(c) {
    /* a check an outside component reports about itself is "self" unless
       it says which independent mechanism produced it */
    return { source: c.source || "external", method: c.method || "external", answer: String(c.answer), key: c.key || answerKey(c.answer),
             claims: c.claims || [], assumptions: c.assumptions || [], derivation: c.derivation || [], toolsUsed: c.toolsUsed || [],
             evidenceUsed: c.evidenceUsed || [], checks: strength(c.checks || [], "self"), uncertainty: c.uncertainty === undefined ? 0.5 : c.uncertainty,
             expression: c.expression, value: c.value, equation: c.equation, variable: c.variable, reads: c.reads ? readsOf(c.reads) : null };
  }

  /* ============================================================ CRITIC */

  /* The question's own equations when they share exactly ONE unknown and the
     question asks for it: [{l, r}] ASTs plus the variable. Parsed problems
     give ASTs of lhs - rhs; otherwise the text segments containing "=". */
  function questionEquations(S, text, PR) {
    if (!PR || !PR.parseExpr || !PR.varsOf) return null;
    var eqs = [], zero = PR.parseExpr("0");
    (S.equations || []).forEach(function (e) { if (e && typeof e === "object") eqs.push({ l: e, r: zero }); });
    if (!eqs.length) (S.equations || []).forEach(function (e) {
      if (typeof e !== "string") return;
      var s = e.replace(/^.*?\b(?:solve|if|where|when|given|find|that|suppose)\b\s*(?:for\s+[a-z]\b\s*)?:?\s*/i, "").replace(/[?.]+\s*$/, "");
      var parts = s.split("=");
      if (parts.length !== 2) return;
      var l = PR.parseExpr(parts[0]), r = PR.parseExpr(parts[1]);
      if (l && r) eqs.push({ l: l, r: r });
    });
    if (!eqs.length) return null;
    var vars = {};
    eqs.forEach(function (q) { PR.varsOf(q.l, vars); PR.varsOf(q.r, vars); });
    var vs = Object.keys(vars);
    if (vs.length !== 1) return null;
    var v = vs[0], asks = /\bsolve\b/i.test(text) || new RegExp("\\b(?:find|what is|value of|for)\\s+" + v + "\\b", "i").test(text) ||
      (S.unknowns || []).indexOf(v) >= 0;
    return asks ? { eqs: eqs, variable: v } : null;
  }
  function satisfies(Q, PR, value) {
    var env = {}, sv = String(value);
    try {
      env[Q.variable] = sv.indexOf("/") > 0 ? PR.Frac.of(sv.split("/")[0]).div(PR.Frac.of(sv.split("/")[1])) : PR.Frac.of(sv);
    } catch (e) { return null; }
    if (!env[Q.variable]) return null;
    var all = true, any = false;
    Q.eqs.forEach(function (q) {
      var l = PR.evalExact(q.l, env), r = PR.evalExact(q.r, env);
      if (l && r) { any = true; if (!l.sub(r).isZero()) all = false; }
      else {
        var lf = PR.evalFloat(q.l, env), rf = PR.evalFloat(q.r, env);
        if (isFinite(lf) && isFinite(rf)) { any = true; if (Math.abs(lf - rf) > 1e-7 * Math.max(1, Math.abs(lf), Math.abs(rf))) all = false; }
      }
    });
    return any ? all : null;
  }

  function critic(cands, S, text) {
    var PR = get("C4LMProblem"), TL = get("C4LMTools");
    var stated = norm(text);
    var Q = null;
    try { Q = questionEquations(S, text, PR); } catch (e) { Q = null; }
    /* the question's givens, for the unused-givens check */
    var givens = readsOf(String(text).replace(/\{\s*1\s*,\s*2\s*,\s*(?:\.\.\.|…)/g, "{1, 2, ...")) || {};
    var gl = Object.keys(givens).length;
    cands.forEach(function (c) {
      var issues = c.issues = [];
      /* substitution into the question's own equation: an independent check
         of any numeric answer, whichever component produced it */
      if (Q && c.key && c.key !== "underdetermined" && !c.checks.some(function (x) { return x.name === "satisfies the stated equation"; })) {
        var vals = c.key.split("|").filter(function (x) { return x !== "" && isFinite(+x); });
        if (vals.length) {
          var res = vals.map(function (x) {
            var exact = numsIn(c.answer).filter(function (y) { return Math.abs(+(y.indexOf("/") > 0 ? (+y.split("/")[0] / +y.split("/")[1]) : y) - +x) < 1e-9; })[0];
            return satisfies(Q, PR, exact || x);
          });
          if (res.every(function (x) { return x !== null; }))
            c.checks.push({ name: "satisfies the stated equation", pass: res.every(Boolean), strength: "independent" });
        }
      }
      /* unused givens: a reading that leaves out numbers another reading
         of the same question uses answered a different (smaller) question */
      if (c.reads && gl >= 2) {
        var cov = Object.keys(givens).filter(function (g) { return c.reads[g]; }).length / gl;
        c.coverage = cov;
      }
      /* unsupported assumptions: stated nowhere in the question */
      c.assumptions.forEach(function (a) {
        var words = norm(a).split(" ").filter(function (w) { return w.length > 4; });
        if (words.length && !words.some(function (w) { return stated.indexOf(w) >= 0; })) issues.push({ kind: "unsupported_assumption", detail: a });
      });
      /* invalid inference / arithmetic: re-compute every stated step */
      if (PR && c.derivation && c.derivation.length) {
        var st = PR.verifySteps(c.derivation);
        if (st.failed.length) issues.push({ kind: "invalid_inference", detail: st.failed.slice(0, 3) });
        var chk = null;
        var algebraic = c.derivation.filter(function (s) { return typeof s === "string" && /[a-z]/i.test(s) && !/\s{2,}/.test(s); });
        if (algebraic.length >= 2 && algebraic.every(function (s) { return s.length < 80; })) {
          try { chk = PR.checkDerivation(algebraic); } catch (e) { chk = null; }
          if (chk && chk.valid === false) issues.push({ kind: "invalid_inference", detail: "step " + chk.firstInvalid + " does not follow", repaired: chk.repaired && chk.repaired.value });
        }
      }
      /* arithmetic: a claimed value against its expression */
      if (PR && c.expression !== undefined && c.value !== undefined) {
        var vv = PR.verifyValue(c.expression, c.value);
        if (vv && !vv.agree) issues.push({ kind: "math_error", detail: c.expression + " is not " + c.value });
      }
      /* substitution into a stated equation */
      if (PR && c.equation && c.value !== undefined) {
        var parts = String(c.equation).split("="), e1 = PR.parseExpr(parts[0]), e2 = PR.parseExpr(parts[1] || "0");
        if (e1 && e2) {
          var env = {}; env[c.variable || "x"] = PR.Frac.of(c.value);
          var l = PR.evalExact(e1, env), r = PR.evalExact(e2, env);
          if (l && r && !l.eq(r)) issues.push({ kind: "math_error", detail: "substituting " + c.value + " does not satisfy " + c.equation });
        }
      }
      /* dimension mismatch: the question asks for a unit the answer cannot have */
      if (TL && S.units && S.units.length && c.unit) {
        var chk2 = TL.run("units.check", { lhs: c.unit, rhs: S.askedUnit || c.unit });
        if (chk2.ok && chk2.value === false) issues.push({ kind: "dimension_mismatch", detail: chk2.text });
      }
      /* failed own checks */
      var failed = c.checks.filter(function (x) { return !x.pass; });
      if (failed.length) issues.push({ kind: "verification_failed", detail: failed.map(function (x) { return x.name; }) });
      if (c.underdetermined) issues.push({ kind: "missing_case", detail: "the question does not fix the answer: " + (c.missing || "") });
    });
    var maxCov = Math.max.apply(null, [0].concat(cands.map(function (c) { return c.coverage || 0; })));
    cands.forEach(function (c) {
      if (c.coverage !== undefined && c.coverage < maxCov - 0.25 && cands.some(function (o) { return o.coverage === maxCov && o.key !== c.key; }))
        c.issues.push({ kind: "unused_givens", detail: "the reading uses " + Math.round(c.coverage * 100) + "% of the stated numbers; another uses " + Math.round(maxCov * 100) + "%" });
    });
    /* contradictions and missing cases across candidates, judged against
       candidates that survived their own checks (a candidate refuted above
       contradicts nothing) */
    function sound(c) { return c.checks.length && c.checks.every(function (x) { return x.pass; }) && !c.issues.some(function (i) { return !i.soft; }); }
    var byKey = {};
    cands.forEach(function (c) { (byKey[c.key] || (byKey[c.key] = [])).push(c); });
    var keys = Object.keys(byKey);
    cands.forEach(function (c) {
      keys.forEach(function (k) {
        if (k === c.key) return;
        var other = byKey[k].filter(sound)[0];
        /* a root set that is a strict subset of another candidate's: missing case */
        var mine = c.key.split("|"), theirs = k.split("|");
        if (mine.length < theirs.length && mine.every(function (x) { return theirs.indexOf(x) >= 0; }) && byKey[k].some(sound))
          c.issues.push({ kind: "missing_case", detail: "another derivation also finds " + theirs.filter(function (x) { return mine.indexOf(x) < 0; }).join(", ") });
        else if (other)
          c.issues.push({ kind: "contradiction", detail: "a verified candidate answers " + other.answer });
      });
    });
    if (S.ambiguities && S.ambiguities.length) cands.forEach(function (c) { c.issues.push({ kind: "ambiguous_interpretation", detail: S.ambiguities.join("; "), soft: true }); });
    return cands;
  }

  /* ========================================================== VERIFIER */

  function verifier(cands) {
    cands.forEach(function (c) {
      var pass = c.checks.filter(function (x) { return x.pass; }).length, total = c.checks.length;
      var hard = c.issues.filter(function (i) { return !i.soft && i.kind !== "contradiction" && i.kind !== "missing_case"; }).length;
      var verified = total > 0 && pass === total && hard === 0;
      /* strong: at least one passing check came from an independent mechanism */
      c.verification = { pass: pass, total: total, hardIssues: hard, verified: verified,
                         strong: verified && c.checks.some(function (x) { return x.pass && x.strength === "independent"; }) };
    });
    return cands;
  }

  /* ========================================================== SELECTOR */

  function selector(cands, S) {
    var groups = {};
    cands.forEach(function (c) {
      var g = groups[c.key] || (groups[c.key] = { key: c.key, members: [], sources: {}, verifiedSources: {}, strongSources: {}, methods: {}, issueSet: {},
                                                   issues: 0, assumptions: 0, pass: 0, total: 0, coverage: 0 });
      g.members.push(c);
      /* independence is per READING of the question (the source), not per
         method: three methods computing from one misreading are one piece
         of evidence about the reading */
      g.sources[c.source] = 1;
      if (c.verification.verified) { g.verifiedSources[c.source] = 1; g.methods[c.source + ":" + c.method] = 1; }
      if (c.verification.strong) g.strongSources[c.source] = 1;
      c.issues.forEach(function (i) { if (!i.soft && i.kind !== "contradiction") g.issueSet[c.source + ":" + i.kind] = 1; });
      g.assumptions += c.assumptions.length;
      g.pass += c.verification.pass; g.total += c.verification.total;
      g.coverage = Math.max(g.coverage, c.coverage || 0);
    });
    var list = Object.keys(groups).map(function (k) {
      var g = groups[k];
      g.verifiedN = Object.keys(g.verifiedSources).length;
      g.strongN = Object.keys(g.strongSources).length;
      g.sourceN = Object.keys(g.sources).length;
      g.issues = Object.keys(g.issueSet).length;
      /* independently verified support first, self-checked support second,
         unverified agreement counts for little, extra methods on the same
         reading add a small arithmetic-robustness bonus, every distinct hard
         critic issue costs a full verified source. Length and eloquence of
         a derivation never enter. */
      var extraMethods = Math.max(0, Object.keys(g.methods).length - g.verifiedN);
      g.support = 2 * g.strongN + 1 * (g.verifiedN - g.strongN) + 0.25 * (g.sourceN - g.verifiedN) + Math.min(0.5, 0.25 * extraMethods) -
                  2 * g.issues - 0.25 * g.assumptions;
      return g;
    }).sort(function (a, b) { return (b.support - a.support) || (b.strongN - a.strongN) || (b.verifiedN - a.verifiedN) || (b.coverage - a.coverage) ||
                                       (a.assumptions - b.assumptions) || (a.key < b.key ? -1 : 1); });
    var best = list[0] || null;
    /* a rival is another answer that is verified and survived the critic */
    var rivals = list.slice(1).filter(function (g) { return g.verifiedN > 0 && !g.issues; }).length;
    var cal = K ? K.calibrate({
      derivations: best ? Math.max(1, best.verifiedN || best.sourceN) : 1,
      disagreements: rivals,
      verifierPass: best ? Math.min(best.pass, 4) : 0, verifierTotal: best ? Math.min(best.total, 4 + (best.issues ? 1 : 0)) : 0,
      contradictions: best ? best.members.filter(function (c) { return c.issues.some(function (i) { return i.kind === "contradiction"; }); }).length ? 1 : 0 : 0,
      assumptions: best ? best.assumptions : 0,
      knowledgeCompleteness: S.classes && S.classes.indexOf("knowledge-heavy") >= 0 && !(best && best.members.some(function (c) { return c.evidenceUsed.length; })) ? 0.4 : 1
    }) : { confidence: best && best.verifiedN ? 0.8 : 0.3 };
    return { best: best, ranked: list, rivals: rivals, calibration: cal, confidence: cal.confidence,
             verified: !!(best && best.verifiedN > 0) };
  }

  /* ======================================================== difficulty */

  function difficulty(text, S, cands) {
    var M = get("C4ReasonMeta");
    var verified = (cands || []).filter(function (c) { return c.verification && c.verification.verified; });
    var keys = {}; verified.forEach(function (c) { keys[c.key] = 1; });
    var sig = {
      candidates: (cands || []).length, exact: Object.keys(keys).length, verified: verified.length > 0,
      disagreeing: Object.keys(keys).length > 1 || (cands || []).some(function (c) { return c.issues && c.issues.some(function (i) { return i.kind === "contradiction"; }); }),
      verifierFailed: (cands || []).some(function (c) { return c.verification && c.verification.total && !c.verification.verified; }),
      ambiguous: !!(S.ambiguities && S.ambiguities.length), knowledgeGap: S.classes.indexOf("knowledge-heavy") >= 0 && !verified.length,
      interacting: (S.equations || []).length + (S.constraints || []).length + (S.claims || []).length,
      steps: Math.max.apply(null, [0].concat((cands || []).map(function (c) { return (c.derivation || []).length; })))
    };
    var a = M ? M.allocate(sig) : { mode: sig.exact === 1 && sig.verified && !sig.disagreeing ? "fast" : "deep", depth: 1, reasons: [] };
    return { level: a.mode === "fast" ? "easy" : "hard", allocation: a, signals: sig };
  }

  /* ============================================================ solve */

  /* Closed-book deliberation (synchronous). opts: {mode: "closed"|"tool",
     maxDepth, candidates (extra, injected), noOperators}. */
  function solve(text, opts) {
    opts = opts || {};
    var t0 = Date.now(), PR = get("C4LMProblem"), CMP = get("C4LMComprehend"), MEM = get("C4ReasonMemory"), META = get("C4ReasonMeta");
    var S = PR && PR.structure ? PR.structure(text) : { classes: ["reasoning-heavy"], possibleTools: [], ambiguities: [], units: [] };
    var wm = MEM ? new MEM.WorkingMemory({ domain: "lm" }) : null;
    var traj = [], maxDepth = opts.maxDepth === undefined ? 2 : opts.maxDepth;

    function round(qText, depth) {
      var cands = solverCandidates(qText, depth ? PR.structure(qText) : S, opts);
      critic(cands, S, qText);
      verifier(cands);
      var sel = selector(cands, S);
      if (wm) cands.forEach(function (c) {
        if (c.verification.verified) wm.confirm(c.source + ":" + c.method + "=" + c.key, { answer: c.answer });
        else if (c.verification.total) wm.refute(c.source + ":" + c.method + "=" + c.key, c.issues.map(function (i) { return i.kind; }).join(", "));
      });
      return { cands: cands, sel: sel };
    }
    var r = round(text, 0), diff = difficulty(text, S, r.cands);
    traj.push({ domain: "lm", action: diff.level === "easy" ? "STOP" : "REFINE_BEST", feats: ["dom:lm", "exact:" + (r.sel.verified ? "few" : "0"),
                "amb:" + (S.ambiguities.length ? 1 : 0)], gain: r.sel.confidence, children: r.cands.length, ms: Date.now() - t0 });
    var depth = 0;
    /* deep path: another bounded round on a reformulation of the question
       (the comprehension stage's summary) when support is weak or split */
    while (diff.level === "hard" && depth < maxDepth && (!r.sel.verified || r.sel.rivals > 0)) {
      depth++;
      var reform = null;
      if (CMP && CMP.read) { try { var rd = CMP.read(text); reform = rd && rd.summary && rd.summary !== text ? rd.summary : null; } catch (e) { reform = null; } }
      if (!reform) break;
      var r2 = round(reform, depth);
      if (wm) wm.question("reformulated: " + reform.slice(0, 60), { depth: depth });
      var before = r.sel.confidence;
      if (r2.sel.best && (!r.sel.best || r2.sel.best.support > r.sel.best.support)) r = { cands: r.cands.concat(r2.cands), sel: selector(verifier(critic(r.cands.concat(r2.cands), S, text)), S) };
      traj.push({ domain: "lm", action: "RESTART_DIVERSE", feats: ["dom:lm", "stall:" + depth], gain: Math.max(0, r.sel.confidence - before), children: r2.cands.length, ms: 0 });
      diff = difficulty(text, S, r.cands);
    }
    /* discrimination between verified rivals: re-verify each against the
       others' stated equations (a verified answer that fails another's
       substitution check is weaker) */
    if (r.sel.rivals > 0) traj.push({ domain: "lm", action: "GENERATE_DISCRIMINATOR", feats: ["dom:lm", "amb:1"], gain: 0, children: r.sel.ranked.length, ms: 0 });
    if (META && META.hub) META.hub.log(traj);
    var best = r.sel.best, abstain = !best || (!r.sel.verified && r.sel.confidence < 0.35);
    var knowledgeGap = S.classes.indexOf("knowledge-heavy") >= 0 && !(best && best.verifiedN);
    var text2 = abstain ? (knowledgeGap ? "I don't have a verified source for that in local knowledge." :
                           "I could not verify an answer to that.") : best.members[0].answer;
    return {
      mode: opts.mode || "closed", answer: abstain ? null : best.members[0].answer, key: best ? best.key : null, text: text2,
      confidence: abstain ? Math.min(0.3, r.sel.confidence) : r.sel.confidence, verified: r.sel.verified, abstained: abstain,
      knowledgeGap: knowledgeGap, difficulty: diff, structure: { classes: S.classes, possibleTools: S.possibleTools, ambiguities: S.ambiguities },
      candidates: r.cands.map(function (c) { return { source: c.source, method: c.method, answer: c.answer, key: c.key, verified: c.verification.verified,
        checks: c.checks.length, issues: c.issues.map(function (i) { return i.kind; }) }; }),
      ranked: r.sel.ranked.map(function (g) { return { key: g.key, support: Math.round(g.support * 100) / 100, verified: g.verifiedN, sources: g.sourceN }; }),
      winner: best ? { sources: Object.keys(best.sources), strong: best.strongN, verified: best.verifiedN,
                       tool: best.members.some(function (c) { return c.source === "tool" && c.verification.strong; }) } : null,
      sentence: abstain || !best ? text2 : sentence(best, text),
      calibration: r.sel.calibration, depth: depth, trace: wm ? wm.compact() : null, ms: Date.now() - t0
    };
  }

  /* TOOL mode: closed deliberation first; when a knowledge gap remains and
     a federation is supplied, retrieved PROPOSITIONS that support (not
     merely mention) the asked relation become evidence-backed candidates. */
  function solveAsync(text, opts) {
    opts = opts || {};
    var closed = solve(text, Object.assign({}, opts, { mode: "tool" }));
    if (opts.mode !== "tool" || !opts.federation || !opts.frame || (!closed.knowledgeGap && closed.verified)) return Promise.resolve(closed);
    return opts.federation.gather(opts.frame).then(function (graph) {
      var EV = get("C4LMEvidence");
      var claims = EV && EV.supportingClaims ? EV.supportingClaims(graph, opts.frame) : [];
      if (!claims.length) { closed.evidence = { claims: 0, gap: true }; return closed; }
      var cands = claims.slice(0, 3).map(function (cl) {
        return { source: "evidence", method: cl.source, answer: cl.object, key: answerKey(cl.object), evidenceUsed: [cl.source],
                 checks: [{ name: "independent sources agree", pass: (cl.independent || 1) >= 2 }, { name: "supports the asked relation", pass: cl.supports }],
                 assumptions: [], derivation: [cl.text || ""] };
      });
      var again = solve(text, Object.assign({}, opts, { candidates: cands, mode: "tool" }));
      again.evidence = { claims: claims.length, independent: claims[0].independent || 1 };
      return again;
    }, function () { return closed; });
  }

  /* Exact tools whose readers find their input in the text: the cheap test
     the LM runs before paying for a full deliberation. */
  function applicable(text, S) {
    var PR = get("C4LMProblem");
    S = S || (PR && PR.structure ? PR.structure(text) : null);
    if (!S) return [];
    return (S.possibleTools || []).filter(function (n) { var rd = TOOL_READERS[n]; try { return !!(rd && rd(text)); } catch (e) { return false; } });
  }

  /* The answer as a sentence: what was asked, the value, and what verified
     it. Built from the winning candidate's structure, not from a template
     per question. */
  var ASKED = { "matrix.det": "The determinant is", "matrix.rank": "The rank is", "matrix.inverse": "The inverse is",
                "seq.sum": "The sum is", "comb.enumerate": "The count is", "prob.bayes": "The probability is" };
  var PART = { mean: "mean", median: "median", mode: "mode", variance: "variance", stdev: "standard deviation",
               sampleVariance: "sample variance", sampleStdev: "sample standard deviation" };
  function sentence(best, text) {
    var c = best.members.filter(function (m) { return m.verification.strong && m.source === "tool"; })[0] ||
            best.members.filter(function (m) { return m.verification.verified; })[0] || best.members[0];
    var ans = String(c.answer), lead;
    if (c.method === "stats.describe" && c.part) lead = "The " + PART[c.part] + " is " + ans;
    else if (c.method === "opt.extremum") lead = "The " + (/max|largest/i.test(text) ? "maximum" : "minimum") + (c.part === "x" ? " is attained at x = " : " value is ") + ans;
    else if (c.method === "seq.sum" && /\bproduct\b/i.test(text)) lead = "The product is " + ans;
    else if (c.method === "prob.bayes") {
      var v = ans.replace(/^P\s*=\s*/, ""), fl = v.indexOf("/") > 0 ? +v.split("/")[0] / +v.split("/")[1] : +v;
      lead = "The probability is " + v + (v.indexOf("/") > 0 && isFinite(fl) ? " (about " + (Math.round(fl * 10000) / 10000) + ")" : "");
    }
    else if (ASKED[c.method]) lead = ASKED[c.method] + " " + ans;
    else if (c.method === "rational.solve" || c.method === "root.find") lead = (/^[a-z]\s*=/.test(ans) ? "" : "x = ") + ans;
    else lead = ans;
    var passed = c.checks.filter(function (x) { return x.pass; }).map(function (x) { return x.name; });
    var others = best.verifiedN - 1;
    /* the working a person would write down, from the same numbers the tool
       read: a mean is the total over the count, a median the middle value */
    var work = "";
    if (c.method === "stats.describe" && (c.part === "mean" || c.part === "median")) {
      var inp = null;
      try { inp = READ.numbers(text); } catch (e) { inp = null; }
      var xs = inp && inp.values ? inp.values.filter(function (x) { return isFinite(x); }) : [];
      if (xs.length >= 2 && xs.length <= 12) {
        var sum = xs.reduce(function (a, b) { return a + b; }, 0), r2 = function (x) { return String(Math.round(x * 1e6) / 1e6); };
        if (c.part === "mean") work = "(" + xs.map(r2).join(" + ") + ") ÷ " + xs.length + " = " + r2(sum) + " ÷ " + xs.length + " = " + r2(sum / xs.length);
        else {
          var so = xs.slice().sort(function (a, b) { return a - b; });
          work = "in order, " + so.map(r2).join(", ") + (so.length % 2 ? " — the middle value is " + r2(so[(so.length - 1) / 2]) :
                 " — the two middle values are " + r2(so[so.length / 2 - 1]) + " and " + r2(so[so.length / 2]) + ", and halfway between them is " + r2((so[so.length / 2 - 1] + so[so.length / 2]) / 2));
        }
      }
    }
    var how = c.source === "tool" ? "Computed exactly" : "Derived by " + c.method;
    return lead.replace(/[.\s]+$/, "") + (work ? ": " + work : "") + ". " + how + (passed.length ? " and checked " + passed.length + " way" + (passed.length > 1 ? "s" : "") + " (" + passed.slice(0, 3).join("; ") + (passed.length > 3 ? "; …" : "") + ")" : "") +
           (others > 0 ? "; " + others + " independent reading" + (others > 1 ? "s agree" : " agrees") : "") + ".";
  }

  var D = { solve: solve, solveAsync: solveAsync, difficulty: difficulty, answerKey: answerKey, applicable: applicable, sentence: sentence,
            roles: { solver: solverCandidates, critic: critic, verifier: verifier, selector: selector }, READ: READ };
  root.C4LMDeliberate = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
