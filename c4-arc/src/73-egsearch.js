/* ===== src/73-egsearch.js ===== */
/* Execution-guided search over step programs (70-steps.js).
 *
 * A node is an EXECUTED state: the grids P(x_i) of every demonstration and
 * P(t) of the test input(s). Expansion asks a proposal distribution which
 * step closes the gap to the targets y_i, executes the proposed steps on
 * every grid, drops invalid, no-op and already-seen states (observational
 * equivalence), and pushes the children by cumulative log-probability. At
 * every node two exact finishers are free:
 *   identity    S_i == y_i for every demonstration
 *   colour map  one colour function maps every S_i onto y_i
 * and the proposal may ask for the entity-level synthesiser (63-sketch.js)
 * as a finisher on (S_i -> y_i). Every returned program reproduces every
 * demonstration exactly; nothing here reads a test output.
 *
 * Proposals (opts.mode):
 *   full      the transformation policy on (x, executed S, y)  (72-policy.js)
 *   template  the same network on (x, y) + the steps taken so far
 *   bigram    P(step | previous step) counted over training programs
 *   uniform   every step equally likely (breadth-first enumeration)
 */
var EGS = (function () {
  function key(st) { var s = ""; for (var i = 0; i < st.length; i++) s += G.gkey(st[i]) + "|"; return s; }
  function Heap() { this.a = []; }
  Heap.prototype.push = function (n) {
    var a = this.a; a.push(n); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (a[p].pri >= a[i].pri) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l].pri > a[m].pri) m = l;
        if (r < a.length && a[r].pri > a[m].pri) m = r;
        if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };
  /* exact colour function from every S_i onto y_i, or null */
  function cmap(S, Y) {
    var f = new Int8Array(10).fill(-1), i, r, c, changed = false;
    for (i = 0; i < S.length; i++) {
      if (S[i].length !== Y[i].length || S[i][0].length !== Y[i][0].length) return null;
      for (r = 0; r < S[i].length; r++) for (c = 0; c < S[i][r].length; c++) {
        var a = S[i][r][c], b = Y[i][r][c];
        if (f[a] === -1) f[a] = b; else if (f[a] !== b) return null;
        if (a !== b) changed = true;
      }
    }
    return changed ? f : null;
  }
  function applyMap(f, g) { return g.map(function (row) { return row.map(function (v) { return f[v] >= 0 ? f[v] : v; }); }); }
  function allEq(S, Y) { for (var i = 0; i < S.length; i++) if (!G.gEq(S[i], Y[i])) return false; return true; }
  function run(prog, g, bg) {
    for (var i = 0; i < prog.steps.length; i++) {
      g = STEPS.apply(STEPS.TYPES[prog.steps[i][0]], g, bg, prog.steps[i][1]);
      if (!g) return null;
    }
    if (!prog.fin) return g;
    if (prog.fin.kind === "cmap") return applyMap(prog.fin.f, g);
    if (prog.fin.kind === "sketch") return SKETCH.run(prog.fin.p, g);
    return null;
  }
  function progKey(prog) {
    return prog.steps.map(function (s) { return STEPS.NAMES[s[0]] + (s[1] === null || s[1] === undefined ? "" : "#" + s[1]); }).join(">") +
      (prog.fin ? (prog.fin.kind === "cmap" ? "|cmap" : "|sk:" + SKETCH.progKey(prog.fin.p)) : "");
  }
  /* proposals for one node: [[type, colour|null, logp]] best first */
  function propose(node, ctx, opts) {
    var out = [], K = STEPS.N, t, j;
    if (opts.mode === "uniform") {
      var pal = node.pal, lp = -Math.log(K);
      for (t = 0; t < K; t++) {
        var T = STEPS.TYPES[t];
        if (T.colorArg) { var cs = []; for (j = 0; j < 10; j++) if (pal >> j & 1) cs.push(j); cs.forEach(function (c) { out.push([t, c, lp - Math.log(cs.length)]); }); }
        else out.push([t, null, lp]);
      }
      return out;
    }
    var p;
    if (opts.mode === "bigram") {
      var prev = node.steps.length ? node.steps[node.steps.length - 1][0] : K;
      p = opts.bigram[prev];
    } else {
      var ex = { bg: node.bg, demos: node.demos, prev: opts.mode === "template" ? POLICY.prevVec(node.steps.map(function (s) { return s[0]; })) : null };
      var pr = POLICY.predict(opts.model, ex); p = pr.p; node._colours = pr.colours;
    }
    var idx = []; for (t = 0; t < K; t++) idx.push(t);
    idx.sort(function (a, b) { return p[b] - p[a]; });
    for (j = 0; j < idx.length && out.length < opts.topK * 2; j++) {
      t = idx[j]; if (p[t] < opts.pmin && j >= 1) break;
      if (STEPS.TYPES[t].colorArg) {
        var cl = node._colours ? node._colours(t) : null;
        if (!cl || !cl.length) { cl = []; for (var c2 = 0; c2 < 10; c2++) if (node.pal >> c2 & 1) cl.push([c2, 1]); cl = cl.map(function (e) { return [e[0], 1 / cl.length]; }); }
        cl.slice(0, 2).forEach(function (e) { out.push([t, e[0], Math.log(p[t] + 1e-9) + Math.log(e[1] + 1e-9)]); });
      } else out.push([t, null, Math.log(p[t] + 1e-9)]);
    }
    return out.sort(function (a, b) { return b[2] - a[2]; }).slice(0, opts.topK);
  }
  function palOf(st) { var m = 0; st.forEach(function (g) { g.forEach(function (row) { row.forEach(function (v) { m |= 1 << v; }); }); }); return m; }

  function search(ctx, deadline, opts) {
    opts = opts || {};
    opts.mode = opts.mode || "full"; opts.topK = opts.topK || 6; opts.pmin = opts.pmin === undefined ? 0.01 : opts.pmin;
    var maxDepth = opts.maxDepth || 4, maxSol = opts.maxSolutions || 6, maxExp = opts.maxExpansions || Infinity, st = opts.stats || {};
    var maxRun = opts.maxExecutions || Infinity;
    if ((opts.mode === "full" || opts.mode === "template") && !opts.model) opts.model = POLICY.base();
    if ((opts.mode === "full" || opts.mode === "template") && !opts.model) return [];
    var X = ctx.train.map(function (p) { return p[0]; }), Y = ctx.train.map(function (p) { return p[1]; });
    var bg = ctx.bg(), sols = [], seenSol = new Set();
    st.expanded = 0; st.executed = 0; st.firstSolutionAt = null;
    var ypal = palOf(Y) | palOf(X);
    function mk(S, T, steps, lp, parent) {
      var demos = S.map(function (s, i) { return { x: X[i], S: s, y: Y[i], _ty: rootDemos ? rootDemos[i]._ty : undefined }; });
      var n = { S: S, T: T, steps: steps, lp: lp, pri: lp - 0.05 * steps.length, demos: demos, bg: bg, pal: ypal | palOf(S), parent: parent || null };
      if (opts.explored) opts.explored.push(n);
      return n;
    }
    var rootDemos = null, root = mk(X, ctx.test_inputs, [], 0); rootDemos = root.demos;
    var heap = new Heap(), seen = new Set([key(root.S.concat(root.T))]);
    heap.push(root);
    function found(steps, fin) {
      var prog = { steps: steps, fin: fin, bg: bg }, k = progKey(prog);
      if (seenSol.has(k)) return;
      seenSol.add(k); sols.push(prog);
      if (st.firstSolutionAt === null) st.firstSolutionAt = st.expanded;
    }
    while (heap.a.length && sols.length < maxSol && st.expanded < maxExp && st.executed < maxRun && nowMs() < deadline) {
      var node = heap.pop(); st.expanded++;
      if (node.steps.length && allEq(node.S, Y)) { found(node.steps, null); continue; }
      var f = cmap(node.S, Y);
      if (f) found(node.steps, { kind: "cmap", f: f });
      if (node.steps.length >= maxDepth) continue;
      var props = propose(node, ctx, opts);
      for (var i = 0; i < props.length && st.executed < maxRun && nowMs() < deadline; i++) {
        var t = props[i][0], col = props[i][1], lp = props[i][2];
        if (t === STEPS.FIN_SKETCH) {
          if (opts.noSketch || !node.S.every(function (s, k) { return s.length === Y[k].length && s[0].length === Y[k][0].length; })) continue;
          var sub = new Ctx(node.S.map(function (s, k) { return [s, Y[k]]; }), node.T, null), ps = [];
          try { ps = SKETCH.synthesize(sub, Math.min(deadline, nowMs() + (opts.sketchMs || 200)), { mode: "pure", noStage2: true, maxExec: opts.sketchExec || 150 }); } catch (e) { ps = []; }
          /* an entity-level synthesis costs about as much as 50 step executions */
          st.executed += 50; st.sketchCalls = (st.sketchCalls || 0) + 1;
          ps.sort(function (a, b) { return EMDL.cost(a) - EMDL.cost(b); }).slice(0, 2).forEach(function (p) { found(node.steps, { kind: "sketch", p: p }); });
          continue;
        }
        var T = STEPS.TYPES[t], S2 = [], T2 = [], ok = true, k2;
        for (k2 = 0; k2 < node.S.length && ok; k2++) { var g = STEPS.apply(T, node.S[k2], bg, col); if (!g) ok = false; else S2.push(g); }
        for (k2 = 0; k2 < node.T.length && ok; k2++) { var h = STEPS.apply(T, node.T[k2], bg, col); if (!h) ok = false; else T2.push(h); }
        st.executed++;
        if (!ok) continue;
        var kk = key(S2.concat(T2));
        if (seen.has(kk)) continue;
        seen.add(kk);
        heap.push(mk(S2, T2, node.steps.concat([[t, col]]), node.lp + lp, node));
      }
    }
    return sols;
  }

  /* Task-time adaptation: search -> learn -> search inside ONE task.
     Every state the first phase executed is the correct output of the step
     path that produced it, on THIS task's own inputs (hindsight). Those paths
     become supervised examples (x_i, S_k, S_node) -> step k+1; the policy's
     heads are fine-tuned on a clone (towers frozen, features cached) and the
     second phase searches with the clone. The execution budget is split,
     not added. Demonstration outputs are used exactly as in plain search:
     as targets; test outputs never. */
  function hindsight(explored, X, bg, maxEx) {
    var cands = explored.filter(function (n) { return n.steps.length >= 1; });
    /* prefer deeper and diverse paths: at most 2 nodes per step-type prefix */
    var per = {}, out = [];
    cands.sort(function (a, b) { return b.steps.length - a.steps.length || b.lp - a.lp; });
    for (var i = 0; i < cands.length && out.length < maxEx; i++) {
      var n = cands[i], key0 = n.steps.map(function (s) { return s[0]; }).join(">");
      if ((per[key0] = (per[key0] || 0) + 1) > 2) continue;
      var path = [], m = n; while (m) { path.unshift(m); m = m.parent; }
      for (var k = 0; k + 1 < path.length && out.length < maxEx; k++) {
        var st = n.steps[k];
        out.push({ bg: bg, demos: X.map(function (x, d) { return { x: x, S: path[k].S[d], y: n.S[d] }; }), label: { type: st[0], color: st[1] === null ? undefined : st[1] } });
      }
    }
    return out;
  }
  function adapt(model, exs, iters, lr) {
    var c = POLICY.cloneHeads(model), hcs = exs.map(function (e) { return POLICY.headCache(model, e); }), t = 0;
    for (var it = 0; it < iters; it++) for (var j = 0; j < exs.length; j++) {
      POLICY.headLoss(c, hcs[j], exs[j].label, true); t++;
      if (t % 8 === 0) NN.adam(c.heads, lr, t / 8);
    }
    return c;
  }
  function searchTTT(ctx, deadline, opts) {
    var st1 = {}, st2 = {}, explored = [], B = opts.maxExecutions || Infinity, now = nowMs();
    var o1 = {}; for (var k in opts) o1[k] = opts[k];
    o1.maxExecutions = B === Infinity ? Infinity : Math.floor(B * (opts.tttSplit || 0.4));
    o1.stats = st1; o1.explored = explored;
    var d1 = B === Infinity ? now + (deadline - now) * (opts.tttSplit || 0.4) : deadline;
    var sols = search(ctx, d1, o1);
    if (sols.length >= (opts.maxSolutions || 6) || nowMs() >= deadline) { if (opts.stats) { opts.stats.expanded = st1.expanded; opts.stats.executed = st1.executed; opts.stats.firstSolutionAt = st1.firstSolutionAt; } return sols; }
    var X = ctx.train.map(function (p) { return p[0]; });
    var exs = hindsight(explored, X, ctx.bg(), opts.tttExamples || 48);
    var model = o1.model || POLICY.base(), adapted = exs.length ? adapt(model, exs, opts.tttIters || 4, opts.tttLr || 3e-4) : model;
    var o2 = {}; for (k in opts) o2[k] = opts[k];
    o2.model = adapted; o2.stats = st2; o2.maxExecutions = B === Infinity ? Infinity : B - st1.executed;
    var more = search(ctx, deadline, o2), keys = new Set(sols.map(progKey));
    more.forEach(function (p) { if (!keys.has(progKey(p))) sols.push(p); });
    if (opts.stats) {
      opts.stats.expanded = st1.expanded + st2.expanded; opts.stats.executed = st1.executed + st2.executed;
      opts.stats.firstSolutionAt = st1.firstSolutionAt !== null ? st1.firstSolutionAt : (st2.firstSolutionAt !== null ? st1.expanded + st2.firstSolutionAt : null);
      opts.stats.tttExamples = exs.length;
    }
    return sols;
  }

  /* the family inside the portfolio */
  (function () {
    function generate(ctx) {
      if (!POLICY.base()) return [];
      var sols = search(ctx, ctx.deadline, { mode: "full", maxDepth: 4, topK: 6, maxSolutions: 6 });
      return sols.map(function (prog) {
        var bits = prog.steps.length + (prog.fin ? (prog.fin.kind === "cmap" ? 1 : EMDL.bits(prog.fin.p) / 8) : 0);
        var h = new Hyp("eg:" + progKey(prog), function (g) { return run(prog, g, prog.bg); }, 1.4 + 0.4 * bits, "egpolicy");
        h.egprog = prog;
        return h;
      });
    }
    /* no leave-one-out refit: a search re-run on fewer demonstrations
       usually reaches a different first program, which the refit would
       count as a failure of a correct one; description length and the
       consensus of independent families rank these instead */
    defSolver("egpolicy", "egpolicy", generate, 1, 1.0).NO_LOO = true;
  })();
  return { search: search, searchTTT: searchTTT, run: run, progKey: progKey, cmap: cmap };
})();
