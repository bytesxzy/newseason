/* ===== src/56a-popsearch.js ===== */
/* Population search over typed programs.
 *
 * The refinement kernel (c4-reason-kernel.js) is a best-first repair loop:
 * a child survives only if it improves the residual, is simpler, or opens a
 * new cluster. That is efficient when every step of the correct repair
 * reduces the residual, and blind when it does not -- when the right program
 * is three edits away and the first two edits make the output WORSE (a
 * plateau or a valley), which is exactly the case of a deeper composition.
 *
 * This module keeps a population instead of a frontier:
 *
 *   archive     a small MAP-Elites grid: one niche per (representation,
 *               residual class, root operator, depth bucket); each niche
 *               keeps a few elites ranked by residual then description
 *               length. A neutral variant (same residual, different
 *               behaviour) is kept when its niche has room, so the search
 *               can drift across plateaus instead of discarding them.
 *   pareto      the non-dominated set over (residual, description length,
 *               invariant violations, novelty, test executability) -- no
 *               single scalar eliminates diversity early.
 *   selection   rotates between the least-selected niche (exploration), the
 *               Pareto front (trade-offs) and the best elite (exploitation).
 *   variation   16 mutation classes (below), residual-targeted repairs from
 *               the ARC adapter, crossover (subtree exchange between
 *               elites) and multi-edit steps (2-3 mutations at once, to
 *               cross a valley in one move).
 *   bounds      tree depth <= 6, structural duplicates rejected BEFORE
 *               execution (09c-canonical.js), behavioural duplicates after,
 *               evaluation cache per solve, niche and archive caps, a
 *               deadline and an evaluation cap.
 *
 * Mutation classes:
 *   param, opsub, subtree_sub (crossover), insert, delete, compose (B after
 *   A), decompose (a subtree alone), specialize (restrict to an object /
 *   change class), generalize (drop a restriction; select <-> forall),
 *   role (literal colour -> semantic role), selector, migrate
 *   (representation), macro_sub, macro_expand, anchor (which object a
 *   relative operation refers to), frame (conjugate by a symmetry).
 *
 * HARD REQUIREMENT kept: a program leaves this module only if the adapter's
 * verifier (independent re-execution) says it reproduces every
 * demonstration and executes on every test input.
 */

var POPSEARCH = null;

(function () {
  var K = root.C4ReasonKernel;
  var T = PROG;
  var CLASSES = ["param", "opsub", "subtree_sub", "insert", "delete", "compose", "decompose", "specialize",
                 "generalize", "role", "selector", "migrate", "macro_sub", "macro_expand", "anchor", "frame", "targeted"];
  var MAX_TREE_DEPTH = 6;
  /* learned class weights (curriculum), overridden per task by test-time
     adaptation; uniform when absent */
  var PRIOR = { classWeights: null };
  function setPrior(p) { PRIOR = p || { classWeights: null }; }

  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }

  var INSERT_OPS = ["rot90", "rot180", "rot270", "flip_h", "flip_v", "transpose", "anti_transpose", "crop", "compress",
    "dedup", "trim", "denoise", "bbox_fill", "repair", "complete", "connect", "outline", "frame_in", "grav", "shift",
    "move_objs", "upscale", "downscale", "tile", "mirror_cat", "half", "keepc", "replace", "fill_enclosed", "fillholes",
    "outline_c", "connect_c", "pick_crop", "keep_only", "drop_one", "offset", "keep_role", "drop_role",
    "changes_on_bg", "changes_on_fg", "border", "pad", "cropc"];
  var FEATURES_Q = ["enclosed", "border", "holes", "single", "rect", "largest", "smallest", "color", "size"];
  var CHANGE_Q = ["largest", "smallest", "span", "rect", "border", "horiz", "vert", "color", "size"];

  function kindsOf(op) { return T.OPS[op] ? T.OPS[op].kinds.filter(function (k) { return k !== T.T_GRID; }) : []; }
  function randParam(r, kind, dom, ctx) {
    if (kind === "Q") return { f: pick(r, FEATURES_Q), v: pick(r, [0, 1]), inv: r() < 0.5 };
    var d = dom[kind];
    if (!d || !d.length) return 0;
    return pick(r, d);
  }
  function randomStep(r, kid, dom, macros) {
    var pool = INSERT_OPS.concat(macros || []), op = null, tries = 0;
    while (tries++ < 8) {
      op = pick(r, pool);
      if (T.OPS[op] && kindsOf(op).every(function (k) { return k !== T.T_CMAP && k !== "T"; })) break;
      op = null;
    }
    if (!op) return null;
    return { op: op, kids: [kid], params: kindsOf(op).map(function (k) { return randParam(r, k, dom); }) };
  }
  function unary(n) { return n.op !== "in" && n.kids && n.kids.length === 1; }
  function leafPath(t) {
    var list = T.treeNodes(t), i;
    for (i = 0; i < list.length; i++) if (list[i][0].op === "in") return list[i][1];
    return null;
  }

  /* ------------------------------------------------------------ mutations
     Each returns a new tree (or {tree, rep}) or null. ``h`` is the parent
     kernel hypothesis; ``env`` = {r, dom, ctx, adapter, donors, macros}. */
  var MUT = {};
  MUT.param = function (t, env) {
    var nodes = T.treeNodes(t).filter(function (p) { return p[0].op !== "in" && p[0].params && p[0].params.length; });
    if (!nodes.length) return null;
    var n = pick(env.r, nodes), ks = kindsOf(n[0].op), j = Math.floor(env.r() * ks.length);
    if (ks[j] === T.T_CMAP || ks[j] === "T") return null;
    var c = T.cloneTree(n[0]); c.params[j] = randParam(env.r, ks[j], env.dom);
    return T.treeReplace(t, n[1], c);
  };
  MUT.opsub = function (t, env) {
    var nodes = T.treeNodes(t).filter(function (p) { return p[0].op !== "in" && p[0].op !== "hcat" && p[0].op !== "vcat"; });
    if (!nodes.length) return null;
    var n = pick(env.r, nodes), sig = T.OPS[n[0].op] ? T.OPS[n[0].op].kinds.join("") : "";
    var alts = [];
    REPAIR.SIBLINGS.forEach(function (g) { if (g.indexOf(n[0].op) >= 0) g.forEach(function (o) { if (o !== n[0].op && T.OPS[o] && T.OPS[o].kinds.join("") === sig) alts.push(o); }); });
    if (!alts.length) return null;
    var c = T.cloneTree(n[0]); c.op = pick(env.r, alts);
    return T.treeReplace(t, n[1], c);
  };
  MUT.subtree_sub = function (t, env) {
    if (!env.donors.length) return null;
    var nodes = T.treeNodes(t).filter(function (p) { return p[0].op !== "in"; });
    if (!nodes.length) return null;
    var n = pick(env.r, nodes), donor = pick(env.r, env.donors);
    var dn = T.treeNodes(donor).filter(function (p) { return p[0].op !== "in"; });
    if (!dn.length) return null;
    return T.treeReplace(t, n[1], T.cloneTree(pick(env.r, dn)[0]));
  };
  MUT.insert = function (t, env) {
    var nodes = T.treeNodes(t), n = pick(env.r, nodes);
    var step = randomStep(env.r, T.cloneTree(n[0]), env.dom, env.macros);
    return step ? T.treeReplace(t, n[1], step) : null;
  };
  MUT["delete"] = function (t, env) {
    var nodes = T.treeNodes(t).filter(function (p) { return unary(p[0]); });
    if (!nodes.length) return null;
    var n = pick(env.r, nodes);
    return T.treeReplace(t, n[1], T.cloneTree(n[0].kids[0]));
  };
  MUT.compose = function (t, env) {
    if (!env.donors.length) return null;
    var d = pick(env.r, env.donors), lp = leafPath(d);
    if (!lp) return null;
    /* donor after parent, or parent after donor */
    return env.r() < 0.5 ? T.treeReplace(d, lp, T.cloneTree(t)) : (function () {
      var lp2 = leafPath(t); return lp2 ? T.treeReplace(t, lp2, T.cloneTree(d)) : null; })();
  };
  MUT.decompose = function (t, env) {
    var nodes = T.treeNodes(t).filter(function (p) { return p[1].length && p[0].op !== "in"; });
    if (!nodes.length) return null;
    return T.cloneTree(pick(env.r, nodes)[0]);
  };
  MUT.specialize = function (t, env) {
    if (!env.ctx.same_shape()) return null;
    if (env.r() < 0.5) return { op: "restrict_objs", kids: [T.cloneTree(t)], params: [{ f: pick(env.r, FEATURES_Q), v: pick(env.r, [0, 1]), inv: env.r() < 0.5 }] };
    return { op: "filter_changes", kids: [T.cloneTree(t)], params: [{ f: pick(env.r, CHANGE_Q), v: 1, inv: false }] };
  };
  MUT.generalize = function (t, env) {
    var nodes = T.treeNodes(t);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i][0];
      if (n.op === "restrict_objs" || n.op === "filter_changes") return T.treeReplace(t, nodes[i][1], T.cloneTree(n.kids[0]));
      if (n.op === "keep_only") return T.treeReplace(t, nodes[i][1], { op: "select_by", kids: [T.cloneTree(n.kids[0])], params: [n.params[0], Math.floor(env.r() * 10), pick(env.r, [0, 1, 2, 3])] });
      if (n.op === "select_by") return T.treeReplace(t, nodes[i][1], { op: "keep_only", kids: [T.cloneTree(n.kids[0])], params: [n.params[0], Math.floor(env.r() * 10)] });
    }
    return null;
  };
  MUT.role = function (t, env) {
    var nodes = T.treeNodes(t).filter(function (p) { return ["replace", "keepc", "cropc"].indexOf(p[0].op) >= 0; });
    if (!nodes.length) return null;
    var n = pick(env.r, nodes)[0], path = nodes.filter(function (p) { return p[0] === n; })[0][1];
    var role = Math.floor(env.r() * 4);
    var rep = n.op === "replace" ? { op: "role_replace", params: [role, n.params[1]] }
            : n.op === "keepc" ? { op: "keep_role", params: [role] } : { op: "crop_role", params: [role] };
    rep.kids = [T.cloneTree(n.kids[0])];
    return T.treeReplace(t, path, rep);
  };
  MUT.selector = function (t, env) {
    var nodes = T.treeNodes(t).filter(function (p) { return kindsOf(p[0].op).indexOf(T.T_SEL) >= 0; });
    if (!nodes.length) return null;
    var n = pick(env.r, nodes), j = kindsOf(n[0].op).indexOf(T.T_SEL), c = T.cloneTree(n[0]);
    c.params[j] = Math.floor(env.r() * 10);
    return T.treeReplace(t, n[1], c);
  };
  MUT.migrate = function (t, env, h) {
    if (typeof REPRESENT === "undefined" || !env.reps.length) return null;
    var cur = h.program.rep || "raw", opts = env.reps.filter(function (n) { return n !== cur; });
    if (!opts.length) return null;
    var name = pick(env.r, opts), moved = REPRESENT.migrateTree(t, name, env.ctx, 2);
    return moved.length ? { tree: moved[0].tree, rep: name } : null;
  };
  MUT.macro_sub = function (t, env) {
    if (!env.macros.length) return null;
    var nodes = T.treeNodes(t), n = pick(env.r, nodes), m = pick(env.r, env.macros);
    var step = { op: m, kids: [T.cloneTree(n[0])], params: kindsOf(m).map(function (k) { return randParam(env.r, k, env.dom); }) };
    return T.treeReplace(t, n[1], step);
  };
  MUT.macro_expand = function (t) {
    var nodes = T.treeNodes(t).filter(function (p) { return T.OPS[p[0].op] && T.OPS[p[0].op].macro; });
    if (!nodes.length) return null;
    var n = nodes[0];
    return T.treeReplace(t, n[1], T.expandTree(n[0]));
  };
  MUT.anchor = function (t, env) {
    var nodes = T.treeNodes(t).filter(function (p) { return p[0].op === "offset_obj" || p[0].op === "offset" || p[0].op === "paint_obj"; });
    if (!nodes.length) {
      /* no relative operation yet: move one selected object */
      return { op: "offset_obj", kids: [T.cloneTree(t)], params: [0, Math.floor(env.r() * 10), pick(env.r, [-2, -1, 1, 2]), pick(env.r, [-1, 0, 1])] };
    }
    var n = pick(env.r, nodes), c = T.cloneTree(n[0]);
    if (c.op === "offset") c = { op: "offset_obj", kids: c.kids, params: [0, Math.floor(env.r() * 10), c.params[0], c.params[1]] };
    else c.params[1] = Math.floor(env.r() * 10);
    return T.treeReplace(t, n[1], c);
  };
  MUT.frame = function (t, env) {
    var D = [["rot90", "rot270"], ["rot180", "rot180"], ["flip_h", "flip_h"], ["flip_v", "flip_v"], ["transpose", "transpose"], ["anti_transpose", "anti_transpose"]];
    var d = pick(env.r, D), lp = leafPath(t);
    if (!lp) return null;
    var inner = T.treeReplace(t, lp, { op: d[0], kids: [{ op: "in" }], params: [] });
    return { op: d[1], kids: [inner], params: [] };
  };

  /* ------------------------------------------------------------- archive */

  function nicheOf(h) {
    var sig = h.residual && h.residual.sig ? h.residual.sig : "?";
    var t = h.program.tree, d = T.treeDepth(t);
    return (h.program.rep || "raw") + "|" + sig + "|" + (h.program.base ? "B:" + h.program.base.solver + ">" : "") + t.op + "|" + (d <= 1 ? 1 : d <= 2 ? 2 : d <= 3 ? 3 : 4);
  }
  function better(a, b) {
    var ra = a.residual ? a.residual.norm : 1, rb = b.residual ? b.residual.norm : 1;
    return (ra - rb) || ((a.invariantViolations || 0) - (b.invariantViolations || 0)) || (a.complexity - b.complexity);
  }
  function dominates(a, b) {
    var ra = a.residual ? a.residual.norm : 1, rb = b.residual ? b.residual.norm : 1;
    var ge = ra <= rb && a.complexity <= b.complexity && (a.invariantViolations || 0) <= (b.invariantViolations || 0);
    var gt = ra < rb || a.complexity < b.complexity || (a.invariantViolations || 0) < (b.invariantViolations || 0);
    return ge && gt;
  }
  function Archive(nicheCap, cap) {
    this.niches = new Map(); this.nicheCap = nicheCap || 3; this.cap = cap || 96;
    this.size = 0; this.selected = new Map(); this.pareto = [];
  }
  Archive.prototype.add = function (h) {
    var k = nicheOf(h), lst = this.niches.get(k) || [];
    if (lst.length >= this.nicheCap) {
      lst.sort(better);
      if (better(h, lst[lst.length - 1]) >= 0 && lst.some(function (e) { return (e.residual ? e.residual.norm : 1) <= (h.residual ? h.residual.norm : 1); })) return false;
      lst.pop(); this.size--;
    }
    if (this.size >= this.cap) {
      /* evict the worst elite of the fullest niche */
      var crowd = null, n = -1;
      this.niches.forEach(function (v, kk) { if (v.length > n || (v.length === n && kk > crowd)) { n = v.length; crowd = kk; } });
      var cl = this.niches.get(crowd); cl.sort(better);
      if (crowd === k && better(h, cl[cl.length - 1]) >= 0) return false;
      cl.pop(); this.size--;
      if (!cl.length) this.niches.delete(crowd);
      lst = this.niches.get(k) || [];
    }
    lst.push(h); this.niches.set(k, lst); this.size++;
    h._niche = k;
    /* Pareto front */
    if (!this.pareto.some(function (p) { return dominates(p, h); })) {
      this.pareto = this.pareto.filter(function (p) { return !dominates(h, p); });
      this.pareto.push(h);
      if (this.pareto.length > 24) { this.pareto.sort(better); this.pareto.length = 24; }
    }
    return true;
  };
  Archive.prototype.all = function () { var out = []; this.niches.forEach(function (v) { out = out.concat(v); }); return out; };
  Archive.prototype.best = function () { var a = this.all(); a.sort(better); return a[0] || null; };
  Archive.prototype.select = function (r, round) {
    var mode = round % 3, self = this;
    if (mode === 0) {
      /* least-selected niche */
      var bestK = null, bestN = Infinity;
      this.niches.forEach(function (v, k) { var s = self.selected.get(k) || 0; if (s < bestN || (s === bestN && k < bestK)) { bestN = s; bestK = k; } });
      if (bestK === null) return null;
      this.selected.set(bestK, bestN + 1);
      var lst = this.niches.get(bestK);
      return lst[Math.floor(r() * lst.length)];
    }
    if (mode === 1 && this.pareto.length) return this.pareto[Math.floor(r() * this.pareto.length)];
    var all = this.all().sort(better);
    return all.length ? all[Math.min(all.length - 1, Math.floor(r() * r() * all.length))] : null;
  };

  /* --------------------------------------------------------------- search
     adapter: REPAIR.ArcAdapter. seeds: kernel hypotheses (typed trees,
     possibly with a base). opts: deadline, maxEvals, afterExact, seed,
     classes (allowed mutation classes; ablations), multiEdit, stats. */
  function search(adapter, seeds, opts) {
    opts = opts || {};
    var t0 = nowMs(), deadline = opts.deadline || (t0 + (opts.maxMs || 400));
    var maxEvals = opts.maxEvals || 4000, ctx = adapter.ctx;
    var r = rng(opts.seed !== undefined ? opts.seed : (G.ghashList(ctx.inputs()) % 4294967296));
    var archive = new Archive(opts.nicheCap || 3, opts.archiveCap || 96);
    var exact = [], exactKeys = new Set(), structSeen = new Set(), behSeen = new Set();
    var allowed = opts.classes ? opts.classes.slice() : CLASSES.slice();
    var st = { seeds: 0, generated: 0, struct_dup: 0, behavior_dup: 0, evaluated: 0, invalid: 0, kept: 0,
               exact: 0, rounds: 0, byClass: {}, maxDepth: 0, exactDepths: [], bestStart: null, bestEnd: null,
               depthCap: 0, multiEdits: 0 };
    var env = { r: r, dom: T.domains(ctx), ctx: ctx, adapter: adapter, donors: [],
                macros: typeof T.macroOps === "function" ? T.macroOps(ctx) : [],
                reps: typeof REPRESENT !== "undefined" ? REPRESENT.rank(ctx).filter(function (o) { return o.gain > 0 && o.name !== "raw"; }).slice(0, 3).map(function (o) { return o.name; }) : [] };
    var weights = {};
    allowed.forEach(function (c) {
      var w = PRIOR.classWeights && PRIOR.classWeights[c] !== undefined ? PRIOR.classWeights[c] : 1;
      if (ctx._tta && ctx._tta.mutPrior && ctx._tta.mutPrior[c] !== undefined) w *= ctx._tta.mutPrior[c];
      if (c === "macro_sub" && !env.macros.length) w = 0;
      if (c === "macro_expand" && !env.macros.length) w = 0;
      if (c === "migrate" && !env.reps.length) w = 0;
      weights[c] = Math.max(0, w);
    });
    var wsum = allowed.reduce(function (s, c) { return s + weights[c]; }, 0) || 1;
    function drawClass() {
      var x = r() * wsum, i;
      for (i = 0; i < allowed.length; i++) { x -= weights[allowed[i]]; if (x <= 0) return allowed[i]; }
      return allowed[allowed.length - 1];
    }
    function cstat(c) { return st.byClass[c] || (st.byClass[c] = { tried: 0, kept: 0, improved: 0, exact: 0 }); }

    function consider(h, parent, cls) {
      var sk = CANON ? CANON.structural(h.program) : null;
      st.generated++;
      if (sk !== null) { if (structSeen.has(sk)) { st.struct_dup++; return null; } structSeen.add(sk); }
      try { adapter.evaluate(h); } catch (e) { h.status = "invalid"; }
      st.evaluated++;
      if (h.status === "invalid") { st.invalid++; return null; }
      if (behSeen.has(h.key)) { st.behavior_dup++; return null; }
      behSeen.add(h.key);
      K.mdlScore(h);
      var d = h.lineage ? h.lineage.depth : 0;
      if (d > st.maxDepth) st.maxDepth = d;
      if (h.status === "exact") {
        if (!exactKeys.has(h.key) && adapter.verifyExact(h)) {
          exactKeys.add(h.key); exact.push(h); st.exact++; st.exactDepths.push(d);
          if (cls) cstat(cls).exact++;
          return "exact";
        }
        h.status = "near";
      }
      if (archive.add(h)) {
        st.kept++;
        if (cls) cstat(cls).kept++;
        if (parent && h.residual && parent.residual && h.residual.norm < parent.residual.norm - 1e-9 && cls) cstat(cls).improved++;
        if (!h.program.base && h.program.tree.op !== "in") env.donors.push(h.program.tree);
        if (env.donors.length > 48) env.donors.shift();
        return "kept";
      }
      return null;
    }

    for (var i = 0; i < seeds.length; i++) {
      if (nowMs() > deadline) break;
      st.seeds++;
      consider(seeds[i], null, null);
      if (!seeds[i].program.base && seeds[i].program.tree.op !== "in") env.donors.push(seeds[i].program.tree);
    }
    var b0 = archive.best();
    st.bestStart = b0 && b0.residual ? b0.residual.norm : null;
    var afterExact = opts.afterExact === undefined ? 60 : opts.afterExact, firstExactAt = null;

    while (nowMs() < deadline && st.evaluated < maxEvals) {
      if (exact.length && firstExactAt === null) firstExactAt = st.evaluated;
      if (firstExactAt !== null && st.evaluated - firstExactAt >= afterExact) break;
      var parent = archive.select(r, st.rounds++);
      if (!parent) break;
      var cls = drawClass(), children = [];
      cstat(cls).tried++;
      if (cls === "targeted") {
        if (!parent.diagnosis) { try { parent.diagnosis = adapter.diagnose(parent) || []; } catch (e) { parent.diagnosis = []; } }
        try { children = (adapter.repair(parent, "targeted", parent.diagnosis, null) || []).slice(0, 4); } catch (e) { children = []; }
      } else {
        var edits = 1;
        /* multi-edit: occasionally two or three mutations at once */
        if (opts.multiEdit !== false) { var u = r(); if (u < 0.2) edits = 2; else if (u < 0.28) edits = 3; }
        if (edits > 1) st.multiEdits++;
        var tree = parent.program.tree, rep = parent.program.rep || null, ok = true, names = [];
        for (var e = 0; e < edits && ok; e++) {
          var c2 = e === 0 ? cls : drawClass();
          if (c2 === "targeted") c2 = "param";
          var fnm = MUT[c2];
          var res = null;
          try { res = fnm ? fnm(tree, env, parent) : null; } catch (err) { res = null; }
          if (!res) { ok = false; break; }
          if (res.tree) { tree = res.tree; rep = res.rep; } else tree = res;
          names.push(c2);
        }
        if (!ok) continue;
        if (T.treeDepth(tree) > MAX_TREE_DEPTH) { st.depthCap++; continue; }
        children = [K.derive(parent, { domain: "arc", representation: parent.representation, representationId: rep || "raw",
          program: { base: parent.program.base, tree: tree, rep: rep }, latentState: {} },
          { kind: "pop:" + names.join("+"), detail: "", bits: 1.5 * names.length })];
      }
      for (var ci = 0; ci < children.length; ci++) {
        if (nowMs() > deadline) break;
        consider(children[ci], parent, cls);
      }
    }
    var b1 = archive.best();
    st.bestEnd = b1 && b1.residual ? b1.residual.norm : null;
    st.niches = archive.niches.size;
    st.archive = archive.size;
    st.pareto = archive.pareto.length;
    st.ms = nowMs() - t0;
    st.unique_per_s = st.ms ? Math.round((st.evaluated - st.behavior_dup) / (st.ms / 1000)) : null;
    exact.sort(function (a, b) { return (a.score - b.score) || (a.id < b.id ? -1 : 1); });
    return { exact: exact.slice(0, 12), archive: archive, stats: st };
  }

  POPSEARCH = { search: search, CLASSES: CLASSES, MUT: MUT, Archive: Archive, setPrior: setPrior,
                prior: function () { return PRIOR; }, nicheOf: nicheOf, MAX_TREE_DEPTH: MAX_TREE_DEPTH };
})();
