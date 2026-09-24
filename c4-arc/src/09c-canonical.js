/* ===== src/09c-canonical.js ===== */
/* Canonicalisation: stop paying twice for the same idea.
 *
 * Bottom-up synthesis, repair and population search all generate programs
 * that are different TEXT for the same FUNCTION: rot90(rot90(x)) is rot180(x);
 * crop(crop(x)) is crop(x); replace(2,5)(flip_h(x)) is flip_h(replace(2,5)(x)).
 * Executing both costs a full evaluation on every demonstration and test
 * grid, and the second one can only ever be rejected as a behavioural
 * duplicate afterwards. This module decides equivalence BEFORE execution
 * wherever it can be decided soundly, at three levels:
 *
 *   structural   the program text after SAFE rewrites (below): equal keys are
 *                the same function on every grid, by construction.
 *   behaviour    the outputs on the task's own grids (train + test inputs):
 *                equal keys are indistinguishable BY THIS TASK.
 *   semantic     behaviour on the task's grids plus a fixed probe set
 *                derived from the test inputs (reflections, a transposition,
 *                a colour-role swap): equal keys are the same explanation
 *                as far as any plausible variation of the task can tell.
 *                Programs with equal behaviour but different semantic keys
 *                are genuinely different explanations the task does not
 *                decide between -- the case counterfactuals and pass@2 need.
 *
 * Rewrites (each one is exact; tests in c4-arc/generalize-test.js check them
 * on random grids):
 *   - the eight square symmetries form a group: any chain of them collapses
 *     to one element or to nothing (table computed from the grid primitives
 *     themselves at load time, not typed in);
 *   - identity steps are removed (id, tile_yx(1,1));
 *   - idempotent steps collapse (crop, compress, dedup, dedup_r, dedup_c,
 *     grav(d), keepc(c), cropc(c)); crop after compress is compress;
 *   - operators equivariant under the symmetries (pointwise colour maps,
 *     crop, compress, uniform upscale/tile, pad, border, enclosed fill,
 *     denoise) commute with them: symmetries are moved outward so chains
 *     meet and collapse;
 *   - parameter encodings are reduced to their canonical residue (the DSL
 *     reads directions mod 4, selectors mod 10, ...); identity entries of
 *     colour tables are dropped.
 * A small bounded saturation (saturate) explores the rewrite class in both
 * directions and returns its least element; macro mining uses it to match
 * fragments modulo equivalence.
 *
 * Canonicalisation never decides that two programs are equivalent without
 * one of these justifications. It only prunes; it never adds behaviour.
 */

var CANON = null;

(function () {
  var DIH = ["id", "rot90", "rot180", "rot270", "flip_h", "flip_v", "transpose", "anti_transpose"];
  var DIH_FN = { id: function (g) { return g; }, rot90: G.rot90, rot180: G.rot180, rot270: G.rot270,
                 flip_h: G.flipH, flip_v: G.flipV, transpose: G.transpose, anti_transpose: G.antiTranspose };
  var IS_DIH = {};
  DIH.forEach(function (d) { if (d !== "id") IS_DIH[d] = true; });

  /* COMPOSE[a][b] = the single symmetry equal to "apply a, then b". Derived
     by applying both to a 2x3 grid of distinct values, which determines a
     symmetry uniquely. */
  var COMPOSE = {};
  (function () {
    var probe = [[1, 2, 3], [4, 5, 6]], byKey = {};
    DIH.forEach(function (d) { byKey[G.gkey(DIH_FN[d](probe))] = d; });
    DIH.forEach(function (a) {
      COMPOSE[a] = {};
      DIH.forEach(function (b) { COMPOSE[a][b] = byKey[G.gkey(DIH_FN[b](DIH_FN[a](probe)))] || null; });
    });
  })();

  var IDEMPOTENT = { crop: 1, compress: 1, dedup: 1, dedup_r: 1, dedup_c: 1, grav: 1, keepc: 1, cropc: 1, mode_cell: 1 };
  /* f(D(x)) == D(f(x)) for every square symmetry D */
  var COMMUTE_DIH = { replace: 1, keepc: 1, cmap: 1, crop: 1, compress: 1, upscale: 1, tile: 1, pad: 1,
                      border: 1, fill_enclosed: 1, denoise: 1, cropc: 1 };
  var MOD = { D: 4, A: 4, R: 4, S: 10, Y: 10, K: 5 };

  var STATS = { calls: 0, rewrites: 0, ms: 0, saturations: 0 };
  var _baseIds = 0;

  function sameParams(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = b[i];
      if (x === y) continue;
      if (x && y && typeof x === "object" && typeof y === "object" && JSON.stringify(x) === JSON.stringify(y)) continue;
      return false;
    }
    return true;
  }

  function normParams(op, params) {
    var o = PROG.OPS[op];
    if (!o) return params.slice();
    var kinds = o.kinds.filter(function (k) { return k !== PROG.T_GRID; }), out = [], i;
    for (i = 0; i < params.length; i++) {
      var p = params[i], m = MOD[kinds[i]];
      if (m && typeof p === "number") p = ((p % m) + m) % m;
      else if (kinds[i] === PROG.T_CMAP && p && typeof p === "object") {
        var t = {}, keys = Object.keys(p).sort(function (a, b) { return a - b; }), k;
        for (k = 0; k < keys.length; k++) if (+keys[k] !== p[keys[k]]) t[keys[k]] = p[keys[k]];
        p = t;
      }
      out.push(p);
    }
    return out;
  }

  /* One bottom-up normalisation pass. */
  function pass(t) {
    if (!t || t.op === "in") return { op: "in" };
    var kids = (t.kids || []).map(pass), params = normParams(t.op, t.params || []);
    var n = { op: t.op, kids: kids, params: params };
    var kid = kids.length === 1 ? kids[0] : null;
    if (n.op === "id" && kid) { STATS.rewrites++; return kid; }
    if (n.op === "tile_yx" && params[0] === 1 && params[1] === 1 && kid) { STATS.rewrites++; return kid; }
    if (kid && IS_DIH[n.op] && IS_DIH[kid.op]) {
      var c = COMPOSE[kid.op][n.op];
      STATS.rewrites++;
      if (c === "id") return kid.kids[0];
      return { op: c, kids: kid.kids, params: [] };
    }
    if (kid && IDEMPOTENT[n.op] && kid.op === n.op && sameParams(kid.params, params)) { STATS.rewrites++; return kid; }
    if (kid && n.op === "crop" && kid.op === "compress") { STATS.rewrites++; return kid; }
    if (kid && n.op === "mode_cell" && IS_DIH[kid.op]) { STATS.rewrites++; return { op: "mode_cell", kids: kid.kids, params: [] }; }
    if (kid && IS_DIH[n.op] && kid.op === "mode_cell") { STATS.rewrites++; return kid; }
    /* move symmetries outward through equivariant operators */
    if (kid && COMMUTE_DIH[n.op] && IS_DIH[kid.op]) {
      STATS.rewrites++;
      return { op: kid.op, kids: [{ op: n.op, kids: kid.kids, params: params }], params: [] };
    }
    return n;
  }

  function render(t) {
    try { return PROG.treeRender(t); } catch (e) { return JSON.stringify(t); }
  }

  /* Normal form: passes to a fixpoint (bounded; each pass only shrinks the
     tree or moves a symmetry one level outward). */
  function normalizeTree(t) {
    var t0 = nowMs(), cur = t, key = null, i;
    STATS.calls++;
    for (i = 0; i < 12; i++) {
      cur = pass(cur);
      var k = render(cur);
      if (k === key) break;
      key = k;
    }
    STATS.ms += nowMs() - t0;
    return cur;
  }

  function asTree(x) {
    if (!x) return null;
    if (x.op) return x;
    if (x.tree) return x.tree;
    if (x.struct) return PROG.toTree(x.struct, x.theta || []);
    return null;
  }

  /* Structural key of a tree, a {struct, theta} program, a PROG.Prog, or a
     repair program {base, tree, rep}. */
  function structural(x) {
    if (!x) return null;
    var t = asTree(x);
    if (!t) return null;
    var k = render(normalizeTree(t));
    /* an opaque base is identified by object identity, never by its name:
       two closures may share a name and differ in fitted parameters */
    if (x.base) k = "b" + (x.base.__cuid || (x.base.__cuid = ++_baseIds)) + ">>" + k;
    if (x.rep) k += "@" + (typeof x.rep === "string" ? x.rep : x.rep.name);
    return k;
  }

  function behavior(outputs) {
    var parts = [], i;
    for (i = 0; i < outputs.length; i++) parts.push(outputs[i] ? G.gkey(outputs[i]) : "~");
    return parts.join("#");
  }

  /* ---------------------------------------------------------------- colours */

  /* Per-grid role permutation: background -> 0, then colours by frequency
     (ties by value), then the absent colours in increasing order. A
     bijection on 0..9, so it is invertible. */
  function rolePerm(g, bg) {
    var h = G.histogram(g), cols = [], v;
    if (bg === undefined || bg === null) bg = G.background(g);
    for (v = 0; v < 10; v++) if (h[v] && v !== bg) cols.push(v);
    cols.sort(function (a, b) { return (h[b] - h[a]) || (a - b); });
    var order = [bg].concat(cols);
    for (v = 0; v < 10; v++) if (order.indexOf(v) < 0) order.push(v);
    var fwd = new Array(10), inv = new Array(10);
    for (v = 0; v < 10; v++) { fwd[order[v]] = v; inv[v] = order[v]; }
    return { fwd: fwd, inv: inv };
  }
  function mapColors(g, p) { return g.map(function (row) { return row.map(function (v) { return p[v]; }); }); }
  function normalizeColors(grids, bg) {
    var perms = grids.map(function (g) { return rolePerm(g, bg); });
    return { grids: grids.map(function (g, i) { return mapColors(g, perms[i].fwd); }),
             perms: perms.map(function (p) { return p.fwd; }), inverses: perms.map(function (p) { return p.inv; }) };
  }

  /* Canonical object order: top-left first, then colour, then size. Returns
     compact descriptors (shape up to the square symmetries, bbox, colour). */
  function normalizeObjects(objs) {
    return objs.slice().sort(function (a, b) {
      return (a.r0 - b.r0) || (a.c0 - b.c0) || (a.color - b.color) || (a.size() - b.size());
    }).map(function (o) {
      var m = o.mask(), best = null, i;
      var forms = [m, G.rot90(m), G.rot180(m), G.rot270(m), G.flipH(m), G.flipV(m), G.transpose(m), G.antiTranspose(m)];
      for (i = 0; i < forms.length; i++) { var k = G.gkey(forms[i]); if (best === null || k < best) best = k; }
      return { color: o.color, r0: o.r0, c0: o.c0, h: o.height(), w: o.width(), size: o.size(), shape: best };
    });
  }

  /* ----------------------------------------------------------------- probes */

  /* Deterministic variations of the task's own test inputs (and the first
     demonstration input): no labels exist for them and none are needed --
     they only separate programs that the task's grids cannot. */
  function probes(ctx) {
    return ctx.memo("canon_probes", function () {
      var src = ctx.test_inputs.slice(0, 2).concat(ctx.inputs().slice(0, 1)), out = [], bg = ctx.bg();
      src.forEach(function (g) {
        out.push(G.flipH(g));
        if (g.length !== g[0].length || !G.gEq(G.transpose(g), g)) out.push(G.transpose(g));
        var h = G.histogram(g), fg = [], v;
        for (v = 0; v < 10; v++) if (h[v] && v !== bg) fg.push(v);
        fg.sort(function (a, b) { return (h[b] - h[a]) || (a - b); });
        if (fg.length >= 2) { var m = {}; m[fg[0]] = fg[1]; m[fg[1]] = fg[0]; out.push(G.applyCmap(g, m)); }
      });
      return out.slice(0, 7);
    });
  }

  /* Semantic key: behaviour on the task's inputs plus the probes. ``run``
     maps a grid to an output grid (or null). */
  function semantic(run, ctx) {
    var grids = ctx.inputs().concat(ctx.test_inputs).concat(probes(ctx)), outs = [], i;
    for (i = 0; i < grids.length; i++) {
      var y = null;
      try { y = run(grids[i]); } catch (e) { y = null; }
      outs.push(y && G.valid(y) ? y : null);
    }
    return behavior(outs);
  }
  function runnerOf(x, ctx) {
    if (typeof x === "function") return x;
    if (x && typeof x.run === "function") return function (g) { return x.run(g); };
    if (x && typeof x.apply === "function") return function (g) { return x.apply(g); };
    var t = asTree(x);
    if (!t) return null;
    var env = PROG.makeEnv(ctx);
    return function (g) { return PROG.runTree(t, g, { bg: env.bg, x: g }); };
  }
  function semanticOf(x, ctx) {
    var run = runnerOf(x, ctx);
    return run ? semantic(run, ctx) : null;
  }

  function equivalent(a, b, ctx) {
    var sa = structural(a), sb = structural(b);
    if (sa !== null && sa === sb) return true;
    if (!ctx) return false;
    var ka = semanticOf(a, ctx), kb = semanticOf(b, ctx);
    return ka !== null && ka === kb;
  }

  /* ------------------------------------------------------ bounded saturation
     Explore the rewrite class of ``t`` in both directions (symmetries moved
     outward AND inward through equivariant steps, independent replaces
     swapped) up to ``cap`` members; return the least by (size, text). */
  function variants(t) {
    var out = [], nodes = PROG.treeNodes(t), i;
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i][0], path = nodes[i][1];
      if (n.op === "in" || !n.kids || n.kids.length !== 1) continue;
      var kid = n.kids[0];
      if (IS_DIH[n.op] && kid.op !== "in" && COMMUTE_DIH[kid.op] && kid.kids.length === 1)
        out.push(PROG.treeReplace(t, path, { op: kid.op, params: kid.params.slice(), kids: [{ op: n.op, params: [], kids: [PROG.cloneTree(kid.kids[0])] }] }));
      if (COMMUTE_DIH[n.op] && IS_DIH[kid.op])
        out.push(PROG.treeReplace(t, path, { op: kid.op, params: [], kids: [{ op: n.op, params: n.params.slice(), kids: [PROG.cloneTree(kid.kids[0])] }] }));
      if (n.op === "replace" && kid.op === "replace") {
        var a = n.params, b = kid.params;
        if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1])
          out.push(PROG.treeReplace(t, path, { op: "replace", params: b.slice(), kids: [{ op: "replace", params: a.slice(), kids: [PROG.cloneTree(kid.kids[0])] }] }));
      }
    }
    return out;
  }
  function saturate(t, cap) {
    cap = cap || 48;
    STATS.saturations++;
    var start = normalizeTree(t), seen = new Map(), queue = [start], qi = 0;
    seen.set(render(start), start);
    while (qi < queue.length && seen.size < cap) {
      var cur = queue[qi++], vs = variants(cur), i;
      for (i = 0; i < vs.length && seen.size < cap; i++) {
        var k = render(vs[i]);
        if (!seen.has(k)) { seen.set(k, vs[i]); queue.push(vs[i]); }
      }
    }
    var best = null, bestKey = null;
    seen.forEach(function (v, k) {
      var s = PROG.treeSize(v);
      if (best === null || s < PROG.treeSize(best) || (s === PROG.treeSize(best) && k < bestKey)) { best = v; bestKey = k; }
    });
    return { tree: best, key: bestKey, classSize: seen.size, bounded: seen.size >= cap };
  }

  /* ------------------------------------------------------------- measurement
     A deduper that counts what it saw at each level, so every search that
     uses it can report generated / structurally unique / behaviourally
     unique / semantically unique and the duplicate ratio. */
  function Deduper(name) {
    this.name = name || "";
    this.generated = 0;
    this.structural = new Set(); this.behavior = new Set(); this.semantic = new Set();
    this.structDup = 0; this.behaviorDup = 0; this.semanticDup = 0;
    this.ms = 0;
  }
  Deduper.prototype.seeStructural = function (k) {
    this.generated++;
    if (k === null || k === undefined) return true;
    if (this.structural.has(k)) { this.structDup++; return false; }
    this.structural.add(k); return true;
  };
  Deduper.prototype.seeBehavior = function (k) {
    if (k === null || k === undefined) return true;
    if (this.behavior.has(k)) { this.behaviorDup++; return false; }
    this.behavior.add(k); return true;
  };
  Deduper.prototype.seeSemantic = function (k) {
    if (k === null || k === undefined) return true;
    if (this.semantic.has(k)) { this.semanticDup++; return false; }
    this.semantic.add(k); return true;
  };
  Deduper.prototype.report = function () {
    return { generated: this.generated, structurally_unique: this.structural.size,
             behaviorally_unique: this.behavior.size, semantically_unique: this.semantic.size,
             structural_duplicates: this.structDup, behavioral_duplicates: this.behaviorDup,
             duplicate_ratio: this.generated ? Math.round((this.structDup + this.behaviorDup) / this.generated * 1000) / 1000 : 0,
             canon_ms: Math.round(this.ms) };
  };

  var ENABLED = true;
  CANON = {
    DIH: DIH, COMPOSE: COMPOSE, IDEMPOTENT: IDEMPOTENT, COMMUTE_DIH: COMMUTE_DIH,
    normalizeTree: normalizeTree, structural: structural, behavior: behavior, semantic: semanticOf,
    semanticRun: semantic, probes: probes, normalizeColors: normalizeColors, rolePerm: rolePerm,
    mapColors: mapColors, normalizeObjects: normalizeObjects, equivalent: equivalent,
    saturate: saturate, variants: variants, Deduper: Deduper,
    stats: function () { return { calls: STATS.calls, rewrites: STATS.rewrites, ms: STATS.ms, saturations: STATS.saturations }; },
    resetStats: function () { STATS.calls = 0; STATS.rewrites = 0; STATS.ms = 0; STATS.saturations = 0; },
    enabled: function (on) { if (on !== undefined) ENABLED = !!on; return ENABLED; }
  };
})();
