/* ===== src/55a-candidate.js ===== */
/* Structured near-misses: one object, one sink, every solver family.
 *
 * Solver families search internally -- induced object tables, grown trees,
 * chained object programs, re-posed sub-tasks -- and used to throw away
 * everything that did not reproduce every demonstration. Those failures are
 * the most informative thing the search produced: "right on three pairs,
 * wrong colour on the fourth", "right objects, wrong displacement". A
 * CandidateTrace keeps such a failure as a structured object:
 *
 *   family / module / name        who proposed it
 *   program                       closure (opaque), typed {struct, theta},
 *                                 or repair {base, tree}
 *   representation                the substrate it was written in
 *   trainPreds                    its outputs on the demonstration inputs
 *   residual                      RESID.quick over the demonstrations
 *   satisfied / violated          which demonstrations it reproduces
 *   behaviorKey / structuralKey   duplicate detection (09c-canonical.js)
 *   complexity, depth, params,
 *   lineage, why (rejection),
 *   cost (generation ms)
 *
 * The CandidateSink collects traces with hard bounds: a per-module offer
 * cap, an evaluation time budget, deduplication by behaviour and structure,
 * at most ``perCluster`` traces per (family, residual signature,
 * representation, root operator) cluster, and a global cap. It is what the
 * refinement kernel, population search and task-local adaptation seed from.
 *
 * Backward compatibility: REFINEMENT.noteNear / noteTyped (57-refinement.js)
 * still exist and route here.
 *
 * Nothing a trace holds is an answer: traces are built from demonstrations
 * only and are never emitted as predictions. A near-miss becomes a
 * prediction only after repair makes it reproduce every demonstration.
 */

var CANDIDATES = null;

(function () {
  var DEFAULTS = { perModule: 8, perCluster: 2, total: 96, offerCap: 40, evalBudgetMs: 90, typedCap: 32 };
  var _ids = 0;

  function CandidateTrace(o) {
    this.id = "c" + (++_ids);
    this.family = o.family || "?";
    this.module = o.module || this.family;
    this.name = o.name || "";
    this.kind = o.kind || (o.tree ? "repair" : o.struct ? "typed" : "closure");
    this.hyp = o.hyp || null;                 /* closure hypothesis (Hyp) */
    this.struct = o.struct || null; this.theta = o.theta || null;
    this.tree = o.tree || null;
    this.representation = o.representation || "raw";
    this.trainPreds = o.trainPreds || null;
    this.residual = null;
    this.diagnoses = null;
    this.complexity = o.complexity === undefined ? null : o.complexity;
    this.satisfied = []; this.violated = [];
    this.behaviorKey = null; this.structuralKey = o.structuralKey || null; this.semanticKey = null;
    this.depth = o.depth || 0;
    this.lineage = o.lineage || [];
    this.params = o.params || null;
    this.why = o.why || "demonstration_mismatch";
    this.cost = o.cost || 0;
    this.score = o.score === undefined ? null : o.score;   /* closeness in [0,1], 1 = exact */
    this.sig = o.sig || null;
    this.cluster = null;
  }
  CandidateTrace.prototype.rootOp = function () {
    if (this.tree) return this.tree.op;
    if (this.struct && Array.isArray(this.struct)) return this.struct[0] || "in";
    var m = /^([A-Za-z_]+)/.exec(this.name || "");
    return m ? m[1] : "?";
  };
  CandidateTrace.prototype.summary = function () {
    return { id: this.id, family: this.family, module: this.module, name: String(this.name).slice(0, 100),
             representation: this.representation, residual: this.residual ? Math.round(this.residual.norm * 1000) / 1000 : null,
             sig: this.residual ? this.residual.sig : this.sig, satisfied: this.satisfied.length, violated: this.violated.length,
             depth: this.depth, why: this.why, complexity: this.complexity, cluster: this.cluster };
  };

  function CandidateSink(ctx, opts) {
    opts = opts || {};
    this.ctx = ctx || null;
    this.opts = {};
    for (var k in DEFAULTS) this.opts[k] = opts[k] === undefined ? DEFAULTS[k] : opts[k];
    this.byModule = new Map();       /* legacy cheap records: module -> [{hyp, score, solver, module, t}] */
    this.typed = [];                 /* typed near states from synthesis */
    this.traces = [];                /* evaluated traces */
    this.clusters = new Map();       /* cluster -> [trace] */
    this.behaviors = new Set();
    this.structs = new Set();
    this.offersByModule = {};
    this.notes = [];
    this.evalMs = 0;
    this.stats = { offered: 0, evaluated: 0, kept: 0, dupBehavior: 0, dupStruct: 0, capped: 0, evicted: 0,
                   budgetStopped: 0, exactOffered: 0, byFamily: {}, notes: {} };
  }

  function famStat(sink, f) {
    return sink.stats.byFamily[f] || (sink.stats.byFamily[f] = { offered: 0, kept: 0, best: null });
  }

  /* Closeness in [0,1]: fraction of demonstrations reproduced plus partial
     credit for cell agreement on the others (the old noteNear score). */
  function closeness(res) {
    if (!res) return 0;
    var n = res.pairs.length, s = 0, i;
    for (i = 0; i < n; i++) {
      var q = res.pairs[i];
      if (q.exact) s += 1;
      else if (q.valid && q.dims) s += Math.max(0, 1 - q.norm) * 0.9;
      else if (q.valid) s += 0.2;
    }
    return n ? s / n : 0;
  }

  CandidateSink.prototype._evaluate = function (tr, runFn) {
    var ctx = this.ctx, preds = tr.trainPreds, i;
    if (!preds) {
      var t0 = nowMs();
      preds = [];
      for (i = 0; i < ctx.train.length; i++) {
        var y = null;
        try { y = runFn(ctx.train[i][0]); } catch (e) { y = null; }
        preds.push(y && G.valid(y) ? y : null);
      }
      this.evalMs += nowMs() - t0;
      tr.trainPreds = preds;
    }
    this.stats.evaluated++;
    tr.residual = RESID.quick(preds, ctx);
    tr.satisfied = []; tr.violated = [];
    for (i = 0; i < preds.length; i++) (tr.residual.pairs[i].exact ? tr.satisfied : tr.violated).push(i);
    tr.score = closeness(tr.residual);
    tr.behaviorKey = tr.family + "|" + CANON.behavior(preds);
    return tr;
  };

  CandidateSink.prototype._admit = function (tr) {
    var o = this.opts;
    if (this.behaviors.has(tr.behaviorKey)) { this.stats.dupBehavior++; return false; }
    if (tr.structuralKey && this.structs.has(tr.structuralKey)) { this.stats.dupStruct++; return false; }
    if (tr.residual && tr.residual.exact) { this.stats.exactOffered++; return false; }   /* exact ones are the portfolio's */
    if (!tr.trainPreds || tr.trainPreds.every(function (p) { return p === null; })) return false;
    var depthB = tr.depth <= 1 ? "1" : tr.depth <= 3 ? "3" : "5";
    tr.cluster = tr.family + "|" + (tr.residual ? tr.residual.sig : tr.sig) + "|" + tr.representation + "|" + tr.rootOp() + "|" + depthB;
    var lst = this.clusters.get(tr.cluster) || [];
    function worse(a, b) { return (b.score - a.score) || ((a.complexity || 0) - (b.complexity || 0)); }
    if (lst.length >= o.perCluster) {
      lst.sort(worse);
      if (worse(tr, lst[lst.length - 1]) >= 0) { this.stats.capped++; return false; }
      this._remove(lst[lst.length - 1]);
      lst = this.clusters.get(tr.cluster) || [];
    }
    if (this.traces.length >= o.total) {
      /* evict the worst trace of the most crowded cluster */
      var crowd = null, n = -1;
      this.clusters.forEach(function (v, k) { if (v.length > n || (v.length === n && k > crowd)) { n = v.length; crowd = k; } });
      var vict = this.clusters.get(crowd).slice().sort(worse);
      var victim = vict[vict.length - 1];
      if (crowd === tr.cluster && worse(tr, victim) >= 0) { this.stats.capped++; return false; }
      this._remove(victim);
      this.stats.evicted++;
      lst = this.clusters.get(tr.cluster) || [];
    }
    lst.push(tr);
    this.clusters.set(tr.cluster, lst);
    this.traces.push(tr);
    this.behaviors.add(tr.behaviorKey);
    if (tr.structuralKey) this.structs.add(tr.structuralKey);
    this.stats.kept++;
    var fs = famStat(this, tr.family);
    fs.kept++;
    if (fs.best === null || tr.score > fs.best) fs.best = Math.round(tr.score * 1000) / 1000;
    return true;
  };
  CandidateSink.prototype._remove = function (tr) {
    var i = this.traces.indexOf(tr);
    if (i >= 0) this.traces.splice(i, 1);
    var lst = this.clusters.get(tr.cluster);
    if (lst) { var j = lst.indexOf(tr); if (j >= 0) lst.splice(j, 1); if (!lst.length) this.clusters.delete(tr.cluster); }
    this.behaviors.delete(tr.behaviorKey);
    if (tr.structuralKey) this.structs.delete(tr.structuralKey);
  };

  /* Offer a failed candidate. spec: {family, module, name, fn | hyp,
     representation, depth, params, why, complexity, preds?, structuralKey?}.
     Cheap to call: returns immediately when the module's offer cap or the
     evaluation budget is spent. */
  CandidateSink.prototype.offer = function (spec) {
    var mod = spec.module || spec.family || "?";
    this.stats.offered++;
    famStat(this, spec.family || mod).offered++;
    var n = (this.offersByModule[mod] = (this.offersByModule[mod] || 0) + 1);
    if (n > this.opts.offerCap) return false;
    if (!spec.preds && this.evalMs > this.opts.evalBudgetMs) { this.stats.budgetStopped++; return false; }
    var tr = new CandidateTrace({ family: spec.family || mod, module: mod, name: spec.name, hyp: spec.hyp || null,
      representation: spec.representation, depth: spec.depth, params: spec.params, why: spec.why,
      complexity: spec.complexity, trainPreds: spec.preds || null, structuralKey: spec.structuralKey || null,
      tree: spec.tree || null, struct: spec.struct || null, theta: spec.theta || null, cost: spec.cost });
    var fn = spec.fn || (spec.hyp ? function (g) { return spec.hyp.apply(g); } : null);
    if (!tr.trainPreds && !fn) return false;
    if (!tr.hyp && fn) tr.hyp = new Hyp(spec.name || "near", fn, spec.complexity === undefined ? 5.0 : spec.complexity, spec.family || mod);
    this._evaluate(tr, fn);
    return this._admit(tr);
  };

  /* Legacy entry from the portfolio's validation (_candidates): the pairs
     before t were reproduced, pair t produced p. Kept as a cheap record;
     evaluated fully only if it is among the best when seeds are drawn. */
  CandidateSink.prototype.noteNear = function (ctx, mod, hyp, t, p) {
    if (p === null) return;
    var target = ctx.train[t][1], agree = 0, ph = p.length, pw = p[0].length, th = target.length, tw = target[0].length;
    if (ph === th && pw === tw) {
      var n = 0, m = 0, r, c;
      for (r = 0; r < th; r++) for (c = 0; c < tw; c++) { n++; if (p[r][c] === target[r][c]) m++; }
      agree = m / n;
    } else if ((ph === tw && pw === th) || (!(th % ph) && !(tw % pw)) || (!(ph % th) && !(pw % tw))) {
      agree = 0.35;
    }
    var score = (t + agree) / ctx.train.length;
    if (score <= 0.1) return;
    var key = mod.__name__, lst = this.byModule.get(key);
    this.stats.offered++;
    famStat(this, hyp.solver || key).offered++;
    if (!lst) { lst = []; this.byModule.set(key, lst); }
    var rec = { hyp: hyp, score: score, solver: hyp.solver, module: key, t: t };
    if (lst.length < this.opts.perModule) lst.push(rec);
    else {
      var worst = 0, i;
      for (i = 1; i < lst.length; i++) if (lst[i].score < lst[worst].score) worst = i;
      if (score > lst[worst].score) lst[worst] = rec;
    }
  };

  /* Typed near states from bottom-up synthesis (already executed there). */
  CandidateSink.prototype.noteTyped = function (ctx, struct, theta, dist, meta) {
    meta = meta || {};
    this.typed.push({ struct: struct, theta: theta, score: 1 - Math.min(1, dist), sig: meta.sig || null,
                      depth: meta.depth || 0, family: meta.family || "typed", representation: meta.representation || "raw" });
    if (this.typed.length > this.opts.typedCap * 2) {
      this.typed.sort(function (a, b) { return b.score - a.score; });
      this.typed.length = this.opts.typedCap;
    }
  };

  /* A structured failure that is not a program: e.g. "no action in the
     vocabulary explains object k under segmentation c8". Representation
     proposals read these. */
  CandidateSink.prototype.note = function (kind, detail) {
    this.stats.notes[kind] = (this.stats.notes[kind] || 0) + 1;
    if (this.notes.length < 64) this.notes.push({ kind: kind, detail: detail || null });
  };

  /* Fold the legacy module records into evaluated traces (best first, within
     the evaluation budget). */
  CandidateSink.prototype.materialize = function () {
    var self = this, recs = [];
    this.byModule.forEach(function (lst) { recs = recs.concat(lst); });
    recs.sort(function (a, b) { return (b.score - a.score) || (a.module < b.module ? -1 : a.module > b.module ? 1 : 0); });
    this.byModule = new Map();
    recs.forEach(function (r) {
      if (self.evalMs > self.opts.evalBudgetMs * 1.5) return;
      var tr = new CandidateTrace({ family: r.solver || r.module, module: r.module, name: r.hyp.name, hyp: r.hyp,
                                    complexity: Number(r.hyp.cost) || null, why: "failed_pair_" + r.t });
      self._evaluate(tr, function (g) { return r.hyp.apply(g); });
      self._admit(tr);
    });
    return this;
  };

  /* Seeds for the refinement kernel / population search: typed near states
     and evaluated traces, best first, bounded per family, deduplicated by
     name. ``adapter`` is a REPAIR.ArcAdapter. */
  CandidateSink.prototype.seeds = function (adapter, opts) {
    opts = opts || {};
    var maxSeeds = opts.max || 40, perFam = opts.perFamily || 8, typedN = opts.typed || 10;
    this.materialize();
    var all = [], i;
    this.traces.forEach(function (t) { all.push({ trace: t, score: t.score, family: t.family }); });
    this.typed.sort(function (a, b) { return b.score - a.score; });
    this.typed.slice(0, typedN).forEach(function (t) { all.push({ typed: t, score: t.score, family: "typed" }); });
    all.sort(function (a, b) { return b.score - a.score; });
    var fam = {}, seen = new Set(), out = [];
    for (i = 0; i < all.length && out.length < maxSeeds; i++) {
      var s = all[i], f = s.family || "?";
      if ((fam[f] || 0) >= perFam) continue;
      var h;
      if (s.typed) {
        var tree = PROG.toTree(s.typed.struct, s.typed.theta);
        var nm = "typed:" + PROG.treeRender(tree);
        if (seen.has(nm)) continue; seen.add(nm);
        h = adapter.seed(null, tree, { seedScore: s.score, family: "typed", sig: s.typed.sig, rep: s.typed.representation });
      } else {
        var t = s.trace, nm2 = t.family + ":" + t.name;
        if (seen.has(nm2)) continue; seen.add(nm2);
        if (t.tree && !t.hyp) h = adapter.seed(null, t.tree, { seedScore: s.score, family: t.family, trace: t.id });
        else h = adapter.seed(t.hyp, null, { seedScore: s.score, family: t.family, trace: t.id, representation: t.representation });
      }
      h.sourceFamily = f;
      h.traceId = s.trace ? s.trace.id : null;
      fam[f] = (fam[f] || 0) + 1;
      out.push(h);
    }
    return { seeds: out, families: fam };
  };

  /* Traces not used as seeds (for RESTART_DIVERSE / population search). */
  CandidateSink.prototype.reserve = function (used, k) {
    var ids = new Set((used || []).map(function (h) { return h.traceId; }).filter(Boolean));
    return this.traces.filter(function (t) { return !ids.has(t.id); })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, k || 8);
  };

  CandidateSink.prototype.report = function () {
    var fams = {}, self = this;
    Object.keys(this.stats.byFamily).sort().forEach(function (f) { fams[f] = self.stats.byFamily[f]; });
    return { offered: this.stats.offered, evaluated: this.stats.evaluated, kept: this.traces.length,
             typed: this.typed.length, clusters: this.clusters.size, dup_behavior: this.stats.dupBehavior,
             dup_structural: this.stats.dupStruct, capped: this.stats.capped, evicted: this.stats.evicted,
             budget_stopped: this.stats.budgetStopped, eval_ms: Math.round(this.evalMs),
             near_miss_by_family: fams, notes: this.stats.notes,
             best: this.traces.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 5).map(function (t) { return t.summary(); }) };
  };

  /* The one call every instrumented solver makes. Free when no sink is
     attached (sub-contexts, leave-one-out folds, unit tests). */
  function offer(ctx, spec) {
    var sink = ctx && ctx._nearSink;
    if (!sink || typeof sink.offer !== "function") return false;
    try { return sink.offer(spec); } catch (e) { return false; }
  }
  function note(ctx, kind, detail) {
    var sink = ctx && ctx._nearSink;
    if (sink && typeof sink.note === "function") sink.note(kind, detail);
  }
  function active(ctx) { return !!(ctx && ctx._nearSink && typeof ctx._nearSink.offer === "function"); }

  CANDIDATES = { CandidateTrace: CandidateTrace, CandidateSink: CandidateSink, offer: offer, note: note,
                 active: active, closeness: closeness, DEFAULTS: DEFAULTS,
                 newSink: function (ctx, opts) { return new CandidateSink(ctx, opts); } };
})();
