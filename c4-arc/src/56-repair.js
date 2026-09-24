/* ===== src/56-repair.js ===== */
/* Program repair: residual-driven mutation of typed programs.
 *
 * A near-miss is a program plus a structured account of how it fails
 * (55-residual.js). Repair edits the PROGRAM, not the output: every child is
 * again a complete program that is executed on every demonstration and must
 * reproduce all of them exactly before it can be proposed as an answer.
 *
 * Representation. A repair candidate is ``base >> tree``: ``base`` is an
 * existing hypothesis from any solver family (an opaque closure, possibly
 * null) and ``tree`` is a typed PROG program applied to its output. For a
 * typed near-miss base is null and the tree is the whole program, so every
 * node of it can be edited; for an opaque one the tree starts as the
 * identity and repair can only compose after it. Either way the tree is a
 * PROG structure with typed holes, so code length, refitting and rendering
 * are the existing ones.
 *
 * Mutation vocabulary (each reusable, none task-specific):
 *   param:<kind>    parameter substitution (colour, int, direction, axis,
 *                   selector, segmentation, key, offset, role)
 *   opsub           operator substitution within a same-signature family
 *   invert          predicate inversion (keep <-> drop, restrict <-> complement)
 *   append:<fam>    composition insertion after the program (a correction)
 *   prepend         composition insertion before it (a change of frame)
 *   delete          composition deletion
 *   reorder         swap two adjacent steps
 *   role            literal colour -> semantic colour role
 *   forall/select   selected-object <-> every-object-with-property
 *   restrict        restrict the program's effect to an object class
 *   mask            restrict the program's effect to background / foreground
 *   closer          fit a colour table or object->colour table to the residual
 */

var REPAIR = null;

(function () {
  var K = root.C4ReasonKernel;
  var T = PROG;

  /* ------------------------------------------------ auxiliary repair operators
     Registered in PROG's auxiliary alphabet (09-program.js): they never enter
     bottom-up synthesis and do not change any existing code length. */

  function freqOrder(g) {
    var h = G.histogram(g), cols = [], v;
    for (v = 0; v < G.NCOLORS; v++) if (h[v]) cols.push(v);
    cols.sort(function (a, b) { return (h[b] - h[a]) || (a - b); });
    return cols;
  }
  /* role 0: most frequent (usually background), 1: next, 2: third, 3: rarest */
  function roleColor(g, r) {
    var o = freqOrder(g);
    if (!o.length) return null;
    if (r === 3) return o.length >= 2 ? o[o.length - 1] : null;
    return r < o.length ? o[r] : null;
  }
  function roleOf(g, c) {
    var o = freqOrder(g), i = o.indexOf(c);
    if (i < 0) return -1;
    if (i <= 2) return i;
    return i === o.length - 1 ? 3 : -1;
  }

  function sameDims(a, b) { return a && b && a.length === b.length && a[0].length === b[0].length; }

  function aux(name, fn, kinds, w) { T.register(name, fn, kinds, w, true); }
  var G_ = T.T_GRID;

  aux("offset", function (e, g, dr, dc) {
    if (!dr && !dc) return null;
    return G.translate(g, dr, dc, e.bg);
  }, [G_, T.T_OFS, T.T_OFS], 0.8);
  aux("role_replace", function (e, g, r, c) {
    var a = roleColor(g, r);
    return (a === null || a === c) ? null : G.replaceColor(g, a, c);
  }, [G_, T.T_ROLE, T.T_COLOR], 0.8);
  aux("keep_role", function (e, g, r) {
    var a = roleColor(g, r);
    if (a === null) return null;
    return g.map(function (row) { return row.map(function (v) { return v === a ? v : e.bg; }); });
  }, [G_, T.T_ROLE], 0.5);
  aux("drop_role", function (e, g, r) {
    var a = roleColor(g, r);
    if (a === null || a === e.bg) return null;
    return G.replaceColor(g, a, e.bg);
  }, [G_, T.T_ROLE], 0.5);
  aux("crop_role", function (e, g, r) {
    var a = roleColor(g, r);
    return a === null ? null : G.cropToContent(g, a);
  }, [G_, T.T_ROLE], 0.5);
  /* change masks: keep the program's changes only where the ORIGINAL input
     was background (or only where it was foreground); elsewhere keep the
     input. The repair for "right change, wrong place". */
  aux("changes_on_bg", function (e, g) {
    var x = e.x;
    if (!x || !sameDims(x, g)) return null;
    return x.map(function (row, r) { return row.map(function (v, c) { return v === e.bg ? g[r][c] : v; }); });
  }, [G_], 0.6);
  aux("changes_on_fg", function (e, g) {
    var x = e.x;
    if (!x || !sameDims(x, g)) return null;
    return x.map(function (row, r) { return row.map(function (v, c) { return v !== e.bg ? g[r][c] : v; }); });
  }, [G_], 0.6);
  /* restrict the program's effect to input objects of one class (or to the
     complement): cells of other input objects are restored from the input,
     background cells keep the program's output. */
  aux("restrict_objs", function (e, g, q) {
    var x = e.x;
    if (!x || !sameDims(x, g) || !q || typeof q !== "object") return null;
    var objs;
    try { objs = O.segment(x, "c8", e.bg); } catch (err) { return null; }
    if (!objs || objs.length > 80) return null;
    var out = G.copyGrid(g), hit = false, i;
    for (i = 0; i < objs.length; i++) {
      var f = RESID.objFeatures(objs[i], objs)[q.f];
      var take = (f === q.v) !== !!q.inv;
      if (take) { hit = true; continue; }
      var it = objs[i].cells.values(), s = it.next();
      while (!s.done) { out[s.value >> 6][s.value & 63] = x[s.value >> 6][s.value & 63]; s = it.next(); }
    }
    return hit ? out : null;
  }, [G_, "Q"], 0.6);
  /* keep only the program's change components whose feature matches (the
     repair for "right change, too many places"); others restored from the
     input */
  aux("filter_changes", function (e, g, q) {
    var x = e.x;
    if (!x || !sameDims(x, g) || !q || typeof q !== "object") return null;
    var comps = RESID.changeComponents(g, x);
    if (!comps || !comps.length) return null;
    var out = G.copyGrid(g), kept = 0, i, j;
    for (i = 0; i < comps.length; i++) {
      if ((comps[i][q.f] === q.v) !== !!q.inv) { kept++; continue; }
      for (j = 0; j < comps[i].cells.length; j++) {
        var cc = comps[i].cells[j];
        out[cc[0]][cc[1]] = x[cc[0]][cc[1]];
      }
    }
    return kept ? out : null;
  }, [G_, "Q"], 0.6);
  /* object-level translate / paint of a selected object */
  function selObj(e, g, seg, sel) {
    var objs = T.objsOf(g, T.SEGMODES[((seg % 5) + 5) % 5], e.bg);
    return objs ? T.pick(objs, T.SELECTORS[((sel % 10) + 10) % 10]) : null;
  }
  aux("offset_obj", function (e, g, seg, sel, dr, dc) {
    var o = selObj(e, g, seg, sel);
    if (!o || (!dr && !dc)) return null;
    var h = g.length, w = g[0].length, out = G.copyGrid(g), cs = T.cellsOf(o), i;
    for (i = 0; i < cs.length; i++) out[cs[i][0]][cs[i][1]] = e.bg;
    for (i = 0; i < cs.length; i++) {
      var r = cs[i][0] + dr, c = cs[i][1] + dc;
      if (r < 0 || r >= h || c < 0 || c >= w) return null;
      out[r][c] = g[cs[i][0]][cs[i][1]];
    }
    return out;
  }, [G_, T.T_SEG, T.T_SEL, T.T_OFS, T.T_OFS], 0.5);
  aux("paint_obj", function (e, g, seg, sel, c) {
    var o = selObj(e, g, seg, sel);
    if (!o) return null;
    var out = G.copyGrid(g), cs = T.cellsOf(o), i;
    for (i = 0; i < cs.length; i++) out[cs[i][0]][cs[i][1]] = c;
    return out;
  }, [G_, T.T_SEG, T.T_SEL, T.T_COLOR], 0.5);

  /* Contextual correction tables. A plain colour table cannot express "this
     cell should change because of what the INPUT had here" or "because of
     how many neighbours it has"; these two can. Keys are (program colour,
     input colour) and (program colour, number of non-background 4-neighbours).
     A key never seen in training makes the program undefined on that grid
     (null), so a table cannot silently invent behaviour at test time. */
  function ctxKey(kind, e, g, r, c) {
    if (kind === 0) return g[r][c] * 16 + e.x[r][c];
    var n = 0, h = g.length, w = g[0].length;
    if (r > 0 && g[r - 1][c] !== e.bg) n++;
    if (r < h - 1 && g[r + 1][c] !== e.bg) n++;
    if (c > 0 && g[r][c - 1] !== e.bg) n++;
    if (c < w - 1 && g[r][c + 1] !== e.bg) n++;
    return g[r][c] * 16 + n;
  }
  function applyCtxTable(kind) {
    return function (e, g, tab) {
      if (!tab || typeof tab !== "object") return null;
      if (kind === 0 && (!e.x || !sameDims(e.x, g))) return null;
      var out = [], r, c;
      for (r = 0; r < g.length; r++) {
        var row = new Array(g[0].length);
        for (c = 0; c < g[0].length; c++) {
          var k = ctxKey(kind, e, g, r, c);
          if (!tab.hasOwnProperty(k)) return null;
          row[c] = tab[k];
        }
        out.push(row);
      }
      return out;
    };
  }
  aux("cmap_x", applyCtxTable(0), [G_, "T"], 0.7);
  aux("cmap_n", applyCtxTable(1), [G_, "T"], 0.7);
  /* Fit such a table from (program output, target) pairs: consistent, every
     changed key seen at least twice, at least one change. */
  function fitCtxTable(kind, pairs, xs, bg) {
    var tab = {}, cnt = {}, changed = false, i, r, c;
    for (i = 0; i < pairs.length; i++) {
      var g = pairs[i][0], t = pairs[i][1], e = { bg: bg, x: xs[i] };
      if (!sameDims(g, t) || (kind === 0 && !sameDims(xs[i], g))) return null;
      for (r = 0; r < g.length; r++) for (c = 0; c < g[0].length; c++) {
        var k = ctxKey(kind, e, g, r, c);
        if (tab.hasOwnProperty(k)) { if (tab[k] !== t[r][c]) return null; }
        else tab[k] = t[r][c];
        cnt[k] = (cnt[k] || 0) + 1;
        if (g[r][c] !== t[r][c]) changed = true;
      }
    }
    if (!changed) return null;
    for (var k2 in tab) if (tab.hasOwnProperty(k2) && tab[k2] !== (k2 >> 4) && cnt[k2] < 2) return null;
    return tab;
  }

  /* ------------------------------------------------------------ tree editing
     tree := {op: "in"} | {op, kids: [tree...], params: [literal...]} */

  function toTree(struct, theta) {
    var it = T.iterOf(theta || []);
    return (function walk(n) {
      if (T.isVar(n)) return { op: "in" };
      if (n[0] === "hcat" || n[0] === "vcat") return { op: n[0], kids: [walk(n[1]), walk(n[2])], params: [] };
      var kids = [], params = [], i;
      for (i = 1; i < n.length; i++) {
        if (T.isHole(n[i])) params.push(it.next());
        else kids.push(walk(n[i]));
      }
      return { op: n[0], kids: kids, params: params };
    })(struct);
  }

  function fromTree(tree) {
    if (tree.op === "in") return { struct: T.VAR, theta: [] };
    if (tree.op === "hcat" || tree.op === "vcat") {
      var a = fromTree(tree.kids[0]), b = fromTree(tree.kids[1]);
      return { struct: [tree.op, a.struct, b.struct], theta: a.theta.concat(b.theta) };
    }
    var op = T.OPS[tree.op], struct = [tree.op], theta = [], ki = 0, pi = 0, i;
    for (i = 0; i < op.kinds.length; i++) {
      if (op.kinds[i] === T.T_GRID) {
        var sub = fromTree(tree.kids[ki++]);
        struct.push(sub.struct); theta = theta.concat(sub.theta);
      } else { struct.push(T.hole(op.kinds[i])); theta.push(tree.params[pi++]); }
    }
    return { struct: struct, theta: theta };
  }

  function clone(t) {
    if (t.op === "in") return { op: "in" };
    return { op: t.op, kids: t.kids.map(clone), params: t.params.slice(), rep: t.rep };
  }
  /* pre-order list of [node, path] where path is the list of kid indices */
  function nodesOf(t) {
    var out = [];
    (function walk(n, path) {
      out.push([n, path]);
      if (n.kids) for (var i = 0; i < n.kids.length; i++) walk(n.kids[i], path.concat([i]));
    })(t, []);
    return out;
  }
  function at(t, path) { var n = t, i; for (i = 0; i < path.length; i++) n = n.kids[path[i]]; return n; }
  function replaceAt(t, path, sub) {
    if (!path.length) return sub;
    var c = clone(t), n = c, i;
    for (i = 0; i < path.length - 1; i++) n = n.kids[path[i]];
    n.kids[path[path.length - 1]] = sub;
    return c;
  }
  function leaves(t) { return nodesOf(t).filter(function (p) { return p[0].op === "in"; }).length; }
  function paramKinds(op) { return T.OPS[op] ? T.OPS[op].kinds.filter(function (k) { return k !== T.T_GRID; }) : []; }
  function unary(n) { return n.op !== "in" && n.kids && n.kids.length === 1; }
  function usesInput(t) {
    return nodesOf(t).some(function (p) {
      return ["changes_on_bg", "changes_on_fg", "restrict_objs", "cmap_x", "filter_changes"].indexOf(p[0].op) >= 0;
    });
  }
  function render(tree) { var f = fromTree(tree); return T.render(f.struct, f.theta); }
  function treeBits(tree) {
    var f = fromTree(tree);
    return T.structBits(f.struct) + T.thetaBits(f.struct, f.theta);
  }

  /* ----------------------------------------------------------- execution */

  function ArcAdapter(ctx) {
    this.ctx = ctx;
    this.grids = ctx.inputs().concat(ctx.test_inputs);
    this.nTr = ctx.train.length;
    this.bg = ctx.bg();
    this.baseCache = new Map();
    this.palette = G.csList(G.csUnion(ctx.in_palette(), ctx.out_palette()));
    this.outColors = G.csList(ctx.out_palette());
    this.newColors = G.csList(ctx.new_colors());
    this.stats = { runs: 0, baseRuns: 0 };
    this.repCache = new Map();
    this.sink = null;
    this.usedSeeds = [];
  }
  ArcAdapter.prototype.baseOutputs = function (base) {
    if (!base) return this.grids;
    var hit = this.baseCache.get(base);
    if (hit) return hit;
    var out = [], i;
    for (i = 0; i < this.grids.length; i++) {
      var y = null;
      try { y = base.apply(this.grids[i]); } catch (e) { y = null; }
      out.push(y && G.valid(y) ? y : null);
    }
    this.stats.baseRuns++;
    this.baseCache.set(base, out);
    return out;
  };
  /* Execute ``tree`` on the base output of grid i; the original input is
     visible to the change-mask operators through env.x. */
  function runTree(f, g, x, bg) {
    if (g === null) return null;
    var out;
    try { out = T.evalNode(f.struct, T.iterOf(f.theta), g, { bg: bg, x: x }); }
    catch (e) { return null; }
    return (out && G.valid(out)) ? out : null;
  }
  /* Representation (17-representation.js): a program may be written in
     another substrate. Execution is then encode -> base -> tree -> decode,
     and every residual is still measured against the raw demonstrations. */
  ArcAdapter.prototype.rep = function (name) {
    if (!name || name === "raw" || typeof REPRESENT === "undefined") return null;
    var hit = this.repCache.get(name);
    if (hit !== undefined) return hit;
    var p = REPRESENT.prepared(this.ctx, name), sub = p ? REPRESENT.taskIn(this.ctx, name) : null;
    var rec = p && sub ? { name: name, p: p, bg: sub.bg(), sub: sub } : null;
    this.repCache.set(name, rec);
    return rec;
  };
  ArcAdapter.prototype.execute = function (prog) {
    var self = this;
    var key = CANON ? CANON.structural(prog) : null;
    return hypcacheEval(this.ctx, key, function () {
      var f = fromTree(prog.tree), out = [], i, R = self.rep(prog.rep);
      self.stats.runs++;
      if (!R) {
        var bo = self.baseOutputs(prog.base);
        for (i = 0; i < self.grids.length; i++) out.push(runTree(f, bo[i], self.grids[i], self.bg));
        return out;
      }
      for (i = 0; i < self.grids.length; i++) out.push(runInRep(R, prog.base, f, self.grids[i]));
      return out;
    });
  };
  function runInRep(R, base, f, x) {
    var ex = REPRESENT.encIn(R.p, x);
    if (!ex) return null;
    var b = ex;
    if (base) { try { b = base.apply(ex); } catch (e) { b = null; } if (!b || !G.valid(b)) return null; }
    var y = runTree(f, b, ex, R.bg);
    if (!y) return null;
    return R.p.spec.kind === "input" ? y : REPRESENT.decode(R.p, y, x);
  }
  /* A standalone closure for the portfolio: base then tree, on any grid. */
  ArcAdapter.prototype.closure = function (prog) {
    var f = fromTree(prog.tree), base = prog.base, bg = this.bg, R = this.rep(prog.rep);
    if (R) return function (g) { return runInRep(R, base, f, g); };
    return function (g) {
      var b = base ? base.apply(g) : g;
      if (!b || !G.valid(b)) return null;
      return runTree(f, b, g, bg);
    };
  };

  ArcAdapter.prototype.seed = function (base, tree, meta) {
    meta = meta || {};
    var rep = meta.rep && meta.rep !== "raw" && this.rep(meta.rep) ? meta.rep : null;
    var h = new K.Hypothesis({ domain: "arc", representation: base ? "closure>prog" : "typed",
      representationId: rep || "raw",
      program: { base: base || null, tree: tree || { op: "in" }, rep: rep }, latentState: meta });
    if (base) h.assumptions = [];
    h.sourceFamily = meta.family || (base ? base.solver : "typed");
    return h;
  };

  /* ------------------------------------------------ kernel hooks (optional) */

  ArcAdapter.prototype.structuralKey = function (h) {
    return CANON ? CANON.structural(h.program) : null;
  };
  ArcAdapter.prototype.semanticKey = function (h) {
    return CANON ? CANON.semanticRun(this.closure(h.program), this.ctx) : null;
  };
  ArcAdapter.prototype.estimateNovelty = function (h, frontier) {
    if (!frontier.byCluster.has(h.cluster)) return 1;
    return frontier.byCluster.get(h.cluster).length <= 1 ? 0.5 : 0;
  };

  /* PROPOSE_REPRESENTATION: move a hypothesis into another substrate. Typed
     programs are carried over (literals remapped, then refitted on every
     demonstration in the new substrate); an opaque specialist's rule is
     re-induced by its own family inside the re-posed task. */
  ArcAdapter.prototype.proposeRepresentations = function (h, diags) {
    if (typeof REPRESENT === "undefined") return [];
    var self = this, out = [], props = REPRESENT.propose(this.ctx, { diagnoses: diags || [] }, h, 3);
    this.stats.repProposals = (this.stats.repProposals || 0) + props.length;
    props.forEach(function (pr) {
      if (!self.rep(pr.name)) return;
      var mut = function (detail, exact) { return { kind: "migrate:" + pr.name, detail: detail, bits: 2 + (REPRESENT.get(pr.name).cost || 0), why: pr.why }; };
      if (!h.program.base) {
        var moved = REPRESENT.migrateTree(h.program.tree, pr.name, self.ctx, 4);
        moved.slice(0, 3).forEach(function (m) {
          var c = K.derive(h, { domain: "arc", representation: "typed", representationId: pr.name,
            program: { base: null, tree: m.tree, rep: pr.name }, latentState: {} }, mut(m.exact ? "refit" : "remap"));
          out.push(c);
        });
      } else {
        /* re-induce with the base's own family in the new substrate */
        var mod = self.moduleOf(h);
        if (!mod) {
          out.push(K.derive(h, { domain: "arc", representation: h.representation, representationId: pr.name,
            program: { base: h.program.base, tree: h.program.tree, rep: pr.name }, latentState: {} }, mut("conjugate")));
          return;
        }
        var sub = REPRESENT.taskIn(self.ctx, pr.name, nowMs() + 60);
        if (!sub) return;
        var hs = [];
        try { hs = mod.generate(sub) || []; } catch (e) { hs = []; }
        hs.slice(0, 3).forEach(function (hy) {
          out.push(K.derive(h, { domain: "arc", representation: "closure>prog", representationId: pr.name,
            program: { base: hy, tree: { op: "in" }, rep: pr.name }, latentState: {} }, mut("reinduce:" + hy.name)));
        });
      }
    });
    return out;
  };
  ArcAdapter.prototype.moduleOf = function (h) {
    var m = h.latentState && (h.latentState.module || null);
    if (m && moduleByName(m)) return moduleByName(m);
    return null;
  };

  /* INVENT_ABSTRACTION: anti-unify the typed programs of near-solutions from
     different clusters. Where two programs share an operator skeleton the
     differing literals become holes and the template is refitted on ALL
     demonstrations (PROG.refit); a colour-literal program is also offered
     with its colours generalised to roles. Evidence from several
     hypotheses is combined; nothing is enumerated blindly. */
  ArcAdapter.prototype.inventAbstraction = function (hs) {
    var self = this, out = [], typed = hs.filter(function (h) { return !h.program.base && h.program.tree.op !== "in"; });
    function skeleton(t) { return t.op === "in" ? "$" : t.op + "(" + t.kids.map(skeleton).join(",") + ")"; }
    var groups = {};
    typed.forEach(function (h) { var k = skeleton(h.program.tree) + "@" + (h.program.rep || "raw"); (groups[k] || (groups[k] = [])).push(h); });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], h0 = g[0], f;
      try { f = fromTree(h0.program.tree); } catch (e) { return; }
      var R = self.rep(h0.program.rep), pairs = R ? R.sub.train : self.ctx.train, cx = R ? R.sub : self.ctx;
      var thetas = [];
      try { thetas = T.refit(f.struct, pairs, cx, 4, 3000); } catch (e) { thetas = []; }
      thetas.forEach(function (th) {
        out.push(K.derive(h0, { domain: "arc", representation: h0.representation, program: { base: null, tree: T.toTree(f.struct, th), rep: h0.program.rep || null },
          latentState: {} }, { kind: "invent:antiunify", detail: k + " x" + g.length, bits: 1 + g.length }));
      });
    });
    /* partial evidence: the common subtree of two different skeletons */
    if (typed.length >= 2 && out.length < 4) {
      var a = typed[0].program.tree, b = typed[1].program.tree;
      var common = commonSuffix(a, b);
      if (common && common.op !== "in") {
        var fc = fromTree(common), th2 = [];
        try { th2 = T.refit(fc.struct, self.ctx.train, self.ctx, 2, 1500); } catch (e) { th2 = []; }
        th2.forEach(function (th) {
          out.push(K.derive(typed[0], { domain: "arc", representation: "typed", program: { base: null, tree: T.toTree(fc.struct, th), rep: null },
            latentState: {} }, { kind: "invent:common", detail: skeleton(common), bits: 2 }));
        });
      }
    }
    return out;
  };
  /* the innermost (input-side) chain two unary programs share */
  function commonSuffix(a, b) {
    function chain(t) { var c = []; while (t && t.op !== "in" && t.kids && t.kids.length === 1) { c.push(t); t = t.kids[0]; } return c.reverse(); }
    var ca = chain(a), cb = chain(b), i = 0;
    while (i < ca.length && i < cb.length && ca[i].op === cb[i].op && JSON.stringify(ca[i].params) === JSON.stringify(cb[i].params)) i++;
    if (!i) return null;
    return T.cloneTree(ca[i - 1]);
  }

  /* VERIFY_DEEPLY: leave-one-out re-derivation of the repair's parameters. */
  ArcAdapter.prototype.verifyDeep = function (h) {
    if (typeof REFINEMENT === "undefined" || !REFINEMENT || !REFINEMENT.repairLOO) return null;
    if (h.program.rep) return null;
    var r = null;
    try { r = REFINEMENT.repairLOO(this, h, nowMs() + 80); } catch (e) { r = null; }
    if (!r || !r.trials) return null;
    return { pass: r.wins / r.trials >= 0.5, wins: r.wins, trials: r.trials };
  };

  /* GENERATE_DISCRIMINATOR: active probes (58-counterfactual.js). */
  ArcAdapter.prototype.generateDiscriminator = function (exact) {
    if (typeof CFACT === "undefined" || !CFACT || !CFACT.discriminate) return null;
    var self = this;
    return CFACT.discriminate(this.ctx, exact.map(function (h) { return self.closure(h.program); }), { budgetMs: 60 });
  };

  /* RESTART_DIVERSE: seeds the refinement never used (candidate sink
     reserve), then structural perturbations of unexplored hypotheses. */
  ArcAdapter.prototype.restart = function (sample) {
    var self = this, out = [];
    if (this.sink && this.sink.reserve) {
      this.sink.reserve(this.usedSeeds || [], 4).forEach(function (tr) {
        var h = tr.tree && !tr.hyp ? self.seed(null, tr.tree, { family: tr.family, trace: tr.id })
                                   : self.seed(tr.hyp, null, { family: tr.family, trace: tr.id, module: tr.module });
        h.traceId = tr.id;
        out.push(h);
      });
      this.usedSeeds = (this.usedSeeds || []).concat(out);
    }
    (sample || []).slice(0, 3).forEach(function (h) {
      ["crop", "transpose", "complete"].forEach(function (op) {
        var t = withLeaf(h.program.tree, op);
        if (t) out.push(K.derive(h, { domain: "arc", representation: h.representation, program: { base: h.program.base, tree: t, rep: h.program.rep || null },
          latentState: {} }, { kind: "restart:prepend", detail: op, bits: 2 }));
      });
    });
    return out;
  };

  ArcAdapter.prototype.evaluate = function (h) {
    var outs = this.execute(h.program), tr = outs.slice(0, this.nTr), te = outs.slice(this.nTr), i;
    h.predictions = te;
    h.latentState.train = tr;
    var q = RESID.quick(tr, this.ctx);
    var inv = RESID.invariantsOf(this.ctx), tv = 0;
    for (i = 0; i < te.length; i++) tv += RESID.violations(te[i], this.ctx.test_inputs[i], inv, this.bg);
    h.residual = { norm: q.norm, bits: q.bits, sig: q.sig, pairErrors: q.pairErrors, cellErrors: q.cellErrors,
                   under: q.under, excess: q.excess, invariants: q.invariants };
    h.residualBits = q.bits;
    h.invariantViolations = q.invariants + tv;
    var base = h.program.base;
    h.complexity = (base ? Math.max(0, Number(base.cost) || 0) * 8 : 0) + treeBits(h.program.tree);
    h.key = outs.map(function (g) { return g ? G.gkey(g) : "~"; }).join("#");
    h.cluster = q.sig + "|" + (base ? base.solver : "typed") + "|" + h.program.tree.op + (h.program.rep ? "@" + h.program.rep : "");
    h.representationId = h.program.rep || "raw";
    var testOk = te.every(function (g) { return g !== null; });
    if (q.exact) h.status = testOk ? "exact" : "invalid";
    else h.status = tr.every(function (g) { return g === null; }) ? "invalid" : "near";
    return h;
  };

  ArcAdapter.prototype.verifyExact = function (h) {
    /* independent re-execution through the closure the portfolio will use */
    var fn = this.closure(h.program), i;
    for (i = 0; i < this.nTr; i++) {
      var y = fn(this.ctx.train[i][0]);
      if (!y || !G.gEq(y, this.ctx.train[i][1])) return false;
    }
    for (i = 0; i < this.ctx.test_inputs.length; i++) if (!fn(this.ctx.test_inputs[i])) return false;
    return true;
  };

  ArcAdapter.prototype.diagnose = function (h) {
    var d = RESID.diagnose(h.latentState.train, this.ctx);
    /* iteration scope: does running the program once more on its own output
       get closer? Then the rule should be applied until it stops changing,
       not once (or once more). Only this adapter can test it: it needs the
       program, not just its predictions. */
    try {
      if (!h.program.base && !h.program.rep && h.program.tree.op !== "in" && d.residual && !d.residual.exact) {
        var f = fromTree(h.program.tree), again = [], i;
        for (i = 0; i < this.nTr; i++) {
          var p = h.latentState.train[i];
          again.push(p ? runTree(f, p, this.ctx.train[i][0], this.bg) : null);
        }
        var q2 = RESID.quick(again, this.ctx);
        if (q2.norm < d.residual.norm - 1e-9)
          d.diagnoses.push({ kind: "wrong_iteration_scope", level: "program", repair: "iterate", weight: 0.5, strong: q2.exact });
      }
    } catch (e) { /* advisory */ }
    d.diagnoses.sort(function (a, b) { return (b.strong - a.strong) || (b.weight - a.weight); });
    h.latentState.diagDetail = d;
    return d.diagnoses;
  };

  /* ------------------------------------------------------------- mutations */

  var SIBLINGS = [
    ["id", "rot90", "rot180", "rot270", "flip_h", "flip_v", "transpose", "anti_transpose",
     "crop", "compress", "dedup", "dedup_r", "dedup_c", "trim", "denoise", "bbox_fill",
     "connect", "outline", "repair", "complete", "frame_in", "frame_all", "changes_on_bg", "changes_on_fg"],
    ["shift", "wrap", "grav", "move_objs"],
    ["upscale", "downscale", "tile", "nzblock", "modeblock", "quad"],
    ["half", "mirror_cat"],
    ["cropc", "keepc", "fillholes", "pad", "border", "fill_enclosed", "connect_c", "outline_c", "marked"],
    ["pick_crop", "pick_patch", "keep_only", "drop_one"],
    ["keep_role", "drop_role", "crop_role"]
  ];
  var INVERSE = { keep_only: "drop_one", drop_one: "keep_only", keep_role: "drop_role", drop_role: "keep_role",
                  changes_on_bg: "changes_on_fg", changes_on_fg: "changes_on_bg" };
  var DIHEDRAL = ["rot90", "rot180", "rot270", "flip_h", "flip_v", "transpose", "anti_transpose"];
  var LOCAL = ["denoise", "complete", "repair", "bbox_fill", "connect", "outline"];
  var EXPAND = ["crop", "compress", "trim", "dedup", "transpose", "rot90", "rot180", "rot270", "flip_h",
                "flip_v", "denoise", "bbox_fill", "complete", "repair", "connect", "outline", "frame_in"];
  var SEG_OK = [0, 1, 2];

  function sigOf(op) {
    return T.OPS[op] ? T.OPS[op].kinds.join("") : "";
  }

  /* Build a child hypothesis. ``prio`` orders children (higher first); the
     kernel evaluates at most childCap of them. */
  function Proposals(adapter, parent, stats, diagKind) {
    this.a = adapter; this.p = parent; this.stats = stats; this.diag = diagKind || "none";
    this.list = []; this.seen = new Set([render(parent.program.tree)]);
  }
  Proposals.prototype.add = function (tree, kind, detail, prio, extra) {
    var r = render(tree);
    if (this.seen.has(r)) return;
    this.seen.add(r);
    var bits = Math.max(1.0, treeBits(tree) - treeBits(this.p.program.tree));
    var mut = { kind: kind, detail: detail || "", bits: bits };
    if (extra) for (var k in extra) mut[k] = extra[k];
    var h = K.derive(this.p, { domain: "arc", representation: this.p.representation,
      program: { base: this.p.program.base, tree: tree, rep: this.p.program.rep || null }, latentState: {} }, mut);
    var learned = this.stats ? this.stats.prior(this.diag, kind) : 0;
    this.list.push([prio + 0.5 * learned - 0.02 * bits, this.list.length, h]);
  };
  Proposals.prototype.done = function () {
    return this.list.sort(function (x, y) { return (y[0] - x[0]) || (x[1] - y[1]); })
                    .map(function (x) { return x[2]; });
  };

  function wrap(tree, op, params) {
    var n = { op: op, kids: [tree], params: params || [], rep: true };
    return n;
  }
  function withLeaf(tree, op, params) {
    if (leaves(tree) !== 1) return null;
    var list = nodesOf(tree), i;
    for (i = 0; i < list.length; i++)
      if (list[i][0].op === "in") return replaceAt(tree, list[i][1], wrap({ op: "in" }, op, params));
    return null;
  }

  /* Outputs of the subtree feeding node ``path`` on the training grids --
     needed wherever a repair is fitted to what a node actually receives. */
  function nodeInputs(adapter, h, path) {
    var node = at(h.program.tree, path);
    if (!node.kids || !node.kids.length) return null;
    var sub = { base: h.program.base, tree: node.kids[0], rep: h.program.rep || null };
    return adapter.execute(sub).slice(0, adapter.nTr);
  }

  function paramAlternatives(adapter, kind, v, hint) {
    var out = [], i;
    if (kind === T.T_COLOR) {
      var pal = (hint && hint.colors ? hint.colors : []).concat(adapter.palette);
      for (i = 0; i < pal.length; i++) if (pal[i] !== v && out.indexOf(pal[i]) < 0) out.push(pal[i]);
    } else if (kind === T.T_INT) { [v + 1, v - 1, v + 2].forEach(function (x) { if (x >= 0 && x <= 5) out.push(x); }); }
    else if (kind === T.T_DIR || kind === T.T_AXIS || kind === T.T_ROLE) { for (i = 0; i < 4; i++) if (i !== v) out.push(i); }
    else if (kind === T.T_SEL || kind === T.T_KEY) { for (i = 0; i < 10; i++) if (i !== v) out.push(i); }
    else if (kind === T.T_SEG) { SEG_OK.forEach(function (x) { if (x !== v) out.push(x); }); }
    else if (kind === T.T_OFS) { [v + 1, v - 1, -v].forEach(function (x) { if (x && x >= -3 && x <= 3 && out.indexOf(x) < 0) out.push(x); }); }
    return out;
  }

  function addParamSubs(P, kinds, prio, hint, cap) {
    var list = nodesOf(P.p.program.tree), n = 0, i, j, k;
    for (i = 0; i < list.length; i++) {
      var node = list[i][0];
      if (node.op === "in" || !node.params || !node.params.length) continue;
      var pk = paramKinds(node.op);
      for (j = 0; j < pk.length; j++) {
        if (kinds && kinds.indexOf(pk[j]) < 0) continue;
        var alts = paramAlternatives(P.a, pk[j], node.params[j], hint);
        /* a colour hint names the replacement the residual asks for */
        if (pk[j] === T.T_COLOR && hint && hint.table && hint.table.hasOwnProperty(node.params[j]))
          alts = [hint.table[node.params[j]]].concat(alts);
        for (k = 0; k < alts.length && n < (cap || 24); k++) {
          var c = clone(node); c.params[j] = alts[k];
          P.add(replaceAt(P.p.program.tree, list[i][1], c), "param:" + pk[j],
                node.op + "." + j + ":" + node.params[j] + ">" + alts[k], prio - 0.01 * k);
          n++;
        }
      }
    }
  }

  function addOpSubs(P, prio) {
    var list = nodesOf(P.p.program.tree), i, g, j;
    for (i = 0; i < list.length; i++) {
      var node = list[i][0];
      if (node.op === "in" || node.op === "hcat" || node.op === "vcat") continue;
      if (INVERSE[node.op]) {
        var inv = clone(node); inv.op = INVERSE[node.op];
        if (sigOf(inv.op) === sigOf(node.op)) P.add(replaceAt(P.p.program.tree, list[i][1], inv), "invert", node.op + ">" + inv.op, prio + 0.1);
      }
      if (node.op === "restrict_objs" && node.params[0]) {
        var q = clone(node); q.params[0] = { f: node.params[0].f, v: node.params[0].v, inv: !node.params[0].inv };
        P.add(replaceAt(P.p.program.tree, list[i][1], q), "invert", "restrict complement", prio + 0.1);
      }
      for (g = 0; g < SIBLINGS.length; g++) {
        if (SIBLINGS[g].indexOf(node.op) < 0) continue;
        for (j = 0; j < SIBLINGS[g].length; j++) {
          var alt = SIBLINGS[g][j];
          if (alt === node.op || !T.OPS[alt] || sigOf(alt) !== sigOf(node.op)) continue;
          var c = clone(node); c.op = alt;
          P.add(replaceAt(P.p.program.tree, list[i][1], c), "opsub", node.op + ">" + alt, prio);
        }
      }
    }
  }

  function addDeletes(P, prio) {
    var list = nodesOf(P.p.program.tree), i;
    for (i = 0; i < list.length; i++) {
      var node = list[i][0];
      if (!unary(node)) continue;
      P.add(replaceAt(P.p.program.tree, list[i][1], clone(node.kids[0])), "delete", node.op, prio);
    }
  }

  function addReorders(P, prio) {
    var list = nodesOf(P.p.program.tree), i;
    for (i = 0; i < list.length; i++) {
      var a = list[i][0];
      if (!unary(a) || !unary(a.kids[0])) continue;
      var b = a.kids[0];
      var swapped = { op: b.op, params: b.params.slice(), kids: [{ op: a.op, params: a.params.slice(), kids: [clone(b.kids[0])] }] };
      P.add(replaceAt(P.p.program.tree, list[i][1], swapped), "reorder", a.op + "<>" + b.op, prio);
    }
  }

  function trainPairs(adapter, preds) {
    var out = [], i;
    for (i = 0; i < adapter.nTr; i++) { if (!preds[i]) return null; out.push([preds[i], adapter.ctx.train[i][1]]); }
    return out;
  }

  /* Closers: solve a colour table (cell- or object-keyed) against the
     residual rather than enumerating one. */
  function addClosers(P, prio) {
    var preds = P.p.latentState.train, pairs = preds && trainPairs(P.a, preds);
    if (!pairs || !pairs.every(function (p) { return sameDims(p[0], p[1]); })) return;
    var env = { bg: P.a.bg };
    var tab = T.fitTable("cmap", [], pairs, env);
    if (tab) P.add(wrap(P.p.program.tree, "cmap", [tab]), "closer", "cmap", prio + 0.2);
    var xs = P.a.ctx.inputs();
    for (var kind = 0; kind < 2; kind++) {
      var ct = fitCtxTable(kind, pairs, xs, P.a.bg);
      if (ct) P.add(wrap(P.p.program.tree, kind ? "cmap_n" : "cmap_x", [ct]), "closer", kind ? "cmap_n" : "cmap_x", prio + 0.1);
    }
    var combos = [[0, 0], [0, 7], [0, 3], [0, 5], [2, 0], [1, 0]], i;
    for (i = 0; i < combos.length; i++) {
      var t2 = T.fitTable("recolor_by", combos[i], pairs, env);
      if (t2) P.add(wrap(P.p.program.tree, "recolor_by", [combos[i][0], combos[i][1], t2]), "closer",
                    "recolor_by:" + T.KEYS[combos[i][1]], prio);
    }
  }

  function addDimsFix(P, d, prio) {
    var t = P.p.program.tree, rel = d.detail || {}, i;
    if (rel.kind === "orientation") P.add(wrap(t, rel.op), "append:dihedral", rel.op, prio + 0.5);
    else if (rel.kind === "scale_up" || rel.kind === "tile") {
      if (rel.ky === rel.kx) {
        P.add(wrap(t, rel.kind === "tile" ? "tile" : "upscale", [rel.ky]), "append:scale", rel.kind + rel.ky, prio + 0.5);
      }
      if (rel.kind === "tile") P.add(wrap(t, "tile_yx", [rel.ky, rel.kx]), "append:scale", "tile_yx", prio + 0.4);
    } else if (rel.kind === "scale_down" && rel.ky === rel.kx) {
      ["downscale", "nzblock", "modeblock"].forEach(function (op) { P.add(wrap(t, op, [rel.ky]), "append:scale", op + rel.ky, prio + 0.4); });
    } else if (rel.kind === "crop_content") P.add(wrap(t, "crop"), "append:crop", "crop", prio + 0.5);
    else if (rel.kind === "extend") {
      for (i = 0; i < P.a.outColors.length; i++) P.add(wrap(t, "pad", [P.a.outColors[i]]), "append:extend", "pad", prio);
      for (i = 0; i < 4; i++) P.add(wrap(t, "mirror_cat", [i]), "append:extend", "mirror_cat", prio - 0.1);
    }
    ["crop", "compress", "trim", "dedup", "dedup_r", "dedup_c"].forEach(function (op) {
      P.add(wrap(t, op), "append:crop", op, prio - 0.2);
    });
    for (i = 0; i < P.a.palette.length; i++) P.add(wrap(t, "cropc", [P.a.palette[i]]), "append:crop", "cropc", prio - 0.3);
    DIHEDRAL.forEach(function (op) { P.add(wrap(t, op), "append:dihedral", op, prio - 0.4); });
    /* a frame change: do the same thing on the cropped content */
    var pre = withLeaf(t, "crop");
    if (pre) P.add(pre, "prepend", "crop", prio - 0.3);
  }

  function addLocal(P, d, prio) {
    var t = P.p.program.tree, cols = P.a.newColors.length ? P.a.newColors : P.a.outColors, i;
    LOCAL.forEach(function (op) { P.add(wrap(t, op), "append:local", op, prio); });
    for (i = 0; i < cols.length && i < 4; i++) {
      ["fill_enclosed", "fillholes", "outline_c", "connect_c"].forEach(function (op) {
        P.add(wrap(t, op, [cols[i]]), "append:local", op + cols[i], prio - 0.05);
      });
    }
  }

  function addRoles(P, prio) {
    var list = nodesOf(P.p.program.tree), i;
    for (i = 0; i < list.length; i++) {
      var node = list[i][0];
      if (["replace", "keepc", "cropc"].indexOf(node.op) < 0) continue;
      var ins = nodeInputs(P.a, P.p, list[i][1]);
      if (!ins || ins.some(function (g) { return !g; })) continue;
      var c = node.params[0], role = roleOf(ins[0], c), ok = role >= 0, j;
      for (j = 1; j < ins.length && ok; j++) if (roleOf(ins[j], c) !== role) ok = false;
      if (!ok) continue;
      var rep = node.op === "replace" ? { op: "role_replace", params: [role, node.params[1]] }
              : node.op === "keepc" ? { op: "keep_role", params: [role] } : { op: "crop_role", params: [role] };
      rep.kids = [clone(node.kids[0])]; rep.rep = true;
      P.add(replaceAt(P.p.program.tree, list[i][1], rep), "role", node.op + ":" + c + ">role" + role, prio);
    }
  }

  /* selected object <-> every object sharing its property */
  function addForall(P, prio) {
    var list = nodesOf(P.p.program.tree), i, k;
    for (i = 0; i < list.length; i++) {
      var node = list[i][0];
      if (node.op === "keep_only") {
        var ins = nodeInputs(P.a, P.p, list[i][1]);
        if (!ins || !ins[0]) continue;
        var objs = T.objsOf(ins[0], T.SEGMODES[node.params[0]], P.a.bg);
        var o = objs ? T.pick(objs, T.SELECTORS[node.params[1]]) : null;
        if (!o) continue;
        for (k = 0; k < T.KEYS.length; k++) {
          var want = T.feature(o, T.KEYS[k], objs);
          if (want === null || want === undefined) continue;
          P.add(replaceAt(P.p.program.tree, list[i][1], { op: "select_by", kids: [clone(node.kids[0])],
            params: [node.params[0], k, want], rep: true }), "forall", "keep_only>select_by:" + T.KEYS[k], prio - 0.01 * k);
        }
      } else if (node.op === "select_by") {
        for (k = 0; k < T.SELECTORS.length; k++)
          P.add(replaceAt(P.p.program.tree, list[i][1], { op: "keep_only", kids: [clone(node.kids[0])],
            params: [node.params[0], k], rep: true }), "select", "select_by>keep_only:" + T.SELECTORS[k], prio - 0.01 * k);
      }
    }
  }

  function addObjectMoves(P, d, prio) {
    var t = P.p.program.tree, sels = [2, 3, 0, 1, 8, 9], i;
    if (d.dr === null || d.dr === undefined) return;
    if (d.dr || d.dc) {
      P.add(wrap(t, "offset", [d.dr, d.dc]), "append:offset", d.dr + "," + d.dc, prio + 0.2);
      for (i = 0; i < sels.length; i++)
        P.add(wrap(t, "offset_obj", [0, sels[i], d.dr, d.dc]), "append:objmove", T.SELECTORS[sels[i]], prio - 0.02 * i);
    }
  }

  function addPaintObj(P, prio) {
    var t = P.p.program.tree, cols = P.a.newColors.length ? P.a.newColors : P.a.outColors, i, j;
    var sels = [2, 3, 0, 1];
    for (i = 0; i < cols.length && i < 3; i++) for (j = 0; j < sels.length; j++)
      P.add(wrap(t, "paint_obj", [0, sels[j], cols[i]]), "append:objpaint", T.SELECTORS[sels[j]] + ">" + cols[i], prio - 0.02 * j);
  }

  function addMasks(P, prio) {
    var t = P.p.program.tree;
    if (!P.a.ctx.same_shape()) return;
    P.add(wrap(t, "changes_on_bg"), "mask", "changes_on_bg", prio);
    P.add(wrap(t, "changes_on_fg"), "mask", "changes_on_fg", prio);
  }

  function addRestrict(P, d, prio) {
    if (!P.a.ctx.same_shape()) return;
    var t = P.p.program.tree;
    /* excess on class C: the effect belongs to the complement of C;
       under on class C: C was left alone although it should change, so the
       effect of a program that DID touch C elsewhere is only half-useful --
       both polarities are proposed, the residual decides */
    var first = d.polarity === "under" ? false : true;
    P.add(wrap(t, "restrict_objs", [{ f: d.feature, v: d.value, inv: first }]), "restrict", d.feature + "=" + d.value, prio + 0.3);
    P.add(wrap(t, "restrict_objs", [{ f: d.feature, v: d.value, inv: !first }]), "restrict", d.feature + "=" + d.value + "~", prio);
  }

  /* Targeted repairs for one diagnosis. */
  function addForDiag(P, d, prio) {
    switch (d.kind) {
      case "wrong_dims": addDimsFix(P, d, prio); break;
      case "wrong_orientation": P.add(wrap(P.p.program.tree, d.op), "append:dihedral", d.op, prio + 0.5); break;
      case "consistent_translation":
        P.add(wrap(P.p.program.tree, "offset", [d.dr, d.dc]), "append:offset", d.dr + "," + d.dc, prio + 0.5);
        addParamSubs(P, [T.T_DIR, T.T_OFS, T.T_INT], prio + 0.2, null, 12);
        break;
      case "color_substitution":
        addParamSubs(P, [T.T_COLOR], prio + 0.3, { table: d.table, colors: Object.keys(d.table).map(function (k) { return d.table[k]; }) }, 12);
        P.add(wrap(P.p.program.tree, "cmap", [d.table]), "closer", "cmap", prio + 0.2);
        break;
      case "object_recolored":
        if (d.table) P.add(wrap(P.p.program.tree, "cmap", [d.table]), "closer", "cmap", prio + 0.1);
        addClosers(P, prio);
        addPaintObj(P, prio - 0.2);
        break;
      case "object_moved": addObjectMoves(P, d, prio); addParamSubs(P, [T.T_DIR, T.T_OFS], prio - 0.1, null, 8); break;
      case "unhandled_object_class":
        addRestrict(P, d, prio);
        addParamSubs(P, [T.T_SEL, T.T_SEG, T.T_KEY], prio - 0.1, null, 12);
        addForall(P, prio - 0.2);
        break;
      case "missed_change": addClosers(P, prio); addLocal(P, d, prio - 0.1); addPaintObj(P, prio - 0.3); break;
      case "excess_change_class":
        P.add(wrap(P.p.program.tree, "filter_changes", [{ f: d.feature, v: d.value, inv: false }]), "filter", d.feature + "=" + d.value, prio + 0.6);
        break;
      case "excessive_change":
        addMasks(P, prio + 0.1); addDeletes(P, prio); addParamSubs(P, null, prio - 0.3, null, 8);
        ["largest", "span", "rect"].forEach(function (f) {
          P.add(wrap(P.p.program.tree, "filter_changes", [{ f: f, v: 1, inv: false }]), "filter", f, prio - 0.1);
        });
        break;
      case "wrong_change": addClosers(P, prio); addParamSubs(P, [T.T_COLOR], prio - 0.1, null, 10); break;
      case "palette_mismatch":
        addParamSubs(P, [T.T_COLOR], prio, { colors: P.a.newColors.concat(P.a.outColors) }, 16);
        addClosers(P, prio - 0.1);
        break;
      case "topology_changed": addLocal(P, d, prio); break;
      case "local_cells": addLocal(P, d, prio); break;
      case "count_mismatch": case "extra_objects": case "missing_objects":
        addParamSubs(P, [T.T_SEL, T.T_SEG], prio, null, 10);
        P.add(wrap(P.p.program.tree, "denoise"), "append:local", "denoise", prio - 0.1);
        break;
      case "relation_mismatch": addParamSubs(P, [T.T_SEL, T.T_DIR, T.T_OFS], prio, null, 10); break;
      case "no_output": addDeletes(P, prio); addOpSubs(P, prio - 0.1); break;
      case "wrong_iteration_scope":
        P.add(wrap(P.p.program.tree, P.p.program.tree.op, P.p.program.tree.params.slice()), "iterate", "twice", prio + 0.5);
        break;
      case "wrong_segmentation": case "wrong_grouping":
        addParamSubs(P, [T.T_SEG], prio + 0.2, null, 8); addParamSubs(P, [T.T_SEL, T.T_KEY], prio - 0.1, null, 8); break;
      case "wrong_anchor":
        addParamSubs(P, [T.T_SEL], prio + 0.1, null, 10); addObjectMoves(P, d, prio - 0.1); break;
      case "wrong_symmetry_frame":
        /* the target has a symmetry the prediction breaks: complete it */
        P.add(wrap(P.p.program.tree, "complete"), "append:local", "complete", prio);
        P.add(wrap(P.p.program.tree, "repair"), "append:local", "repair", prio - 0.05);
        break;
      case "missing_composition":
        addLocal(P, d, prio - 0.2);
        DIHEDRAL.forEach(function (op) { P.add(wrap(P.p.program.tree, op), "append:dihedral", op, prio - 0.3); });
        break;
      case "overgeneralized_predicate":
        P.add(wrap(P.p.program.tree, "restrict_objs", [{ f: d.feature, v: d.value, inv: true }]), "specialize", d.feature + "=" + d.value, prio);
        break;
      case "undergeneralized_predicate": addForall(P, prio); break;
      default: addParamSubs(P, null, prio - 0.5, null, 8);
    }
  }

  ArcAdapter.prototype.repair = function (h, mode, diags, stats) {
    var top = diags && diags.length ? diags[0] : null;
    var P = new Proposals(this, h, stats, top ? top.kind : "none"), i;
    if (mode === "targeted") {
      for (i = 0; i < diags.length && i < 3; i++) addForDiag(P, diags[i], 3 - i);
      addParamSubs(P, null, 0.5, null, 10);
      addOpSubs(P, 0.4);
    } else if (mode === "abstract") {
      var sem = diags.filter(function (d) { return d.strong; });
      for (i = 0; i < sem.length && i < 2; i++) addForDiag(P, sem[i], 3 - i);
      addForall(P, 1.0); addRoles(P, 0.9);
    } else if (mode === "represent") {
      addRoles(P, 2.0);
      addForall(P, 1.8);
      addParamSubs(P, [T.T_SEG, T.T_KEY], 1.5, null, 8);
      addOpSubs(P, 1.2);
      addMasks(P, 1.0);
      var pre = withLeaf(h.program.tree, "crop");
      if (pre) P.add(pre, "prepend", "crop", 0.9);
      DIHEDRAL.forEach(function (op) { var w = withLeaf(h.program.tree, op); if (w) P.add(w, "prepend", op, 0.5); });
    } else if (mode === "expand") {
      addClosers(P, 2.0);
      var dimsBad = diags.some(function (d) { return d.kind === "wrong_dims"; });
      EXPAND.forEach(function (op, k) { P.add(wrap(h.program.tree, op), "append:" + (DIHEDRAL.indexOf(op) >= 0 ? "dihedral" : "generic"), op, (dimsBad ? 1.5 : 1.0) - 0.02 * k); });
      addLocal(P, top, 0.8);
      for (i = 0; i < 4; i++) P.add(wrap(h.program.tree, "move_objs", [i]), "append:generic", "move_objs" + i, 0.6);
    } else if (mode === "simplify") {
      addDeletes(P, 2.0);
      addReorders(P, 1.0);
    }
    return P.done();
  };

  REPAIR = { ArcAdapter: ArcAdapter, toTree: toTree, fromTree: fromTree, render: render, runInRep: runInRep,
             wrap: wrap, withLeaf: withLeaf, Proposals: Proposals, addForDiag: addForDiag, addParamSubs: addParamSubs,
             addOpSubs: addOpSubs, addDeletes: addDeletes, addClosers: addClosers, addLocal: addLocal, addRoles: addRoles,
             addForall: addForall, addMasks: addMasks, SIBLINGS: SIBLINGS, DIHEDRAL: DIHEDRAL, EXPAND: EXPAND,
             treeBits: treeBits, nodesOf: nodesOf, usesInput: usesInput, roleOf: roleOf,
             roleColor: roleColor, paramKinds: paramKinds, runTree: runTree, clone: clone,
             fitCtxTable: fitCtxTable };
})();
