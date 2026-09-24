/* CELL4 learned reasoning-operation controller.
 *
 * The kernel (c4-reason-kernel.js) chooses its next reasoning OPERATION --
 * refine, change representation, discriminate, verify, restart, stop -- from
 * a state description. Its hand-written priors are a reasonable start; this
 * module learns, from logged search trajectories, how much each operation
 * actually tends to achieve in each kind of state:
 *
 *     u(a | x) = b_a + sum_f w_{a,f} x_f        x_f in {0,1} state features
 *
 * fitted by ridge regression (cyclic coordinate descent, deterministic) to
 *
 *     y = (immediate progress + path credit) / compute cost
 *
 *   immediate progress   residual reduction, or 1 for an exact discovery,
 *                        or the information an operation yielded
 *                        (disagreement found, a failed cross-validation)
 *   path credit          the step lay on the lineage of an exact solution,
 *                        discounted by its distance from it -- and cut when
 *                        that solution did NOT generalise to held-out
 *                        synthetic input (a path to an overfit is not worth
 *                        imitating)
 *   compute cost         1 + 0.05 per child evaluated + ms / 250
 *
 * Failures are kept: a step that achieved nothing is a training example
 * with y = 0 for that state and operation, which is how the model learns
 * what NOT to do. Nothing here is domain specific: the features are strings
 * (res:high, stall:3, amb:1, dom:arc, rep:roles ...) produced by the kernel's
 * MetaController for ARC, ARC-3 and language problems alike.
 *
 * choose() keeps an exploration floor: every valid operation retains a
 * minimum share (deterministic schedule, no Math.random), so a learned
 * policy can never permanently retire an operation.
 *
 * Also here, shared across domains: allocate() -- adaptive compute. Given
 * generic signals (candidate count, agreement, verification, residual, stall,
 * ambiguity, knowledge gaps) it says fast path or deep path and why.
 *
 * Exports root.C4ReasonMeta and CommonJS. Local, deterministic, no network.
 */
(function (root) {
  "use strict";
  /* One instance per page/process: the ARC bundle embeds this file and the
     language stack loads it standalone; whichever loads second reuses the
     first so ARC and the LM share one C4ReasonMeta (and its state). */
  if (root.C4ReasonMeta && root.C4ReasonMeta.VERSION === "1.0.0") {
    if (typeof module !== "undefined" && module.exports && !root.__C4_BUNDLED_KERNEL) module.exports = root.C4ReasonMeta;
    return;
  }

  var K = root.C4ReasonKernel;
  if (!K && typeof require === "function") { try { K = require("./c4-reason-kernel.js"); } catch (e) { K = null; } }
  var ACTIONS = K ? K.ACTIONS.slice() : ["REFINE_BEST", "REFINE_DIVERSE", "ABSTRACT_RESIDUAL", "CHANGE_REPRESENTATION",
    "EXPAND_PROGRAM", "SIMPLIFY_PROGRAM", "BACKTRACK", "STOP", "PROPOSE_REPRESENTATION", "GENERATE_DISCRIMINATOR",
    "INVENT_ABSTRACTION", "VERIFY_DEEPLY", "RESTART_DIVERSE"];

  /* ----------------------------------------------------------------- target */

  function target(t, opts) {
    opts = opts || {};
    var immediate = Math.max(0, Math.min(1, +t.gain || 0));
    if (t.exactFound > 0) immediate = Math.max(immediate, 1);
    var credit = 0;
    if (t.reachedExact) {
      credit = 0.6 * Math.pow(0.7, Math.max(0, t.depthFromSolution || 0));
      if (t.generalized === false) credit *= 0.3;
      else if (t.generalized === true) credit *= 1.2;
    }
    var cost = 1 + 0.05 * (+t.children || 0) + (opts.ignoreTime ? 0 : (+t.ms || 0) / 250);
    return (immediate + credit) / cost;
  }

  /* ------------------------------------------------------------------ model */

  function Model(data) {
    data = data || {};
    this.b = data.b || {};           /* action -> intercept */
    this.w = data.w || {};           /* action -> feature -> weight */
    this.n = data.n || {};           /* action -> training samples */
    this.meta = data.meta || {};
    this.version = data.version || 1;
    /* target mean / spread over all training steps: utilities are reported
       as z-scores so they are commensurate with the kernel's stated priors
       (which are in units of about one) whatever the target's scale */
    this.mu = data.mu === undefined ? 0 : data.mu;
    this.sd = data.sd === undefined ? 1 : data.sd;
  }
  Model.prototype.trained = function () { return Object.keys(this.b).length > 0; };
  Model.prototype.utility = function (feats, a) {
    var u = this.b[a] || 0, row = this.w[a], i;
    if (row) for (i = 0; i < feats.length; i++) if (row[feats[i]]) u += row[feats[i]];
    return u;
  };
  /* Utilities for the available actions. Actions the model never saw get
     the mean intercept, not zero, so they are neither favoured nor starved. */
  Model.prototype.utilities = function (feats, available) {
    var out = {}, keys = Object.keys(this.b), mean = 0, i;
    for (i = 0; i < keys.length; i++) mean += this.b[keys[i]];
    mean = keys.length ? mean / keys.length : 0;
    var acts = available || ACTIONS, sd = this.sd > 1e-6 ? this.sd : 1;
    for (i = 0; i < acts.length; i++)
      out[acts[i]] = ((this.b[acts[i]] === undefined ? mean : this.utility(feats, acts[i])) - this.mu) / sd;
    return out;
  };
  /* Pick an action; every ``floorEvery``-th call takes the least-tried
     available action instead (deterministic exploration floor). */
  Model.prototype.choose = function (feats, available, state) {
    state = state || {};
    var u = this.utilities(feats, available), best = available[0], i;
    for (i = 1; i < available.length; i++) if (u[available[i]] > u[best]) best = available[i];
    var every = state.floorEvery || 7;
    state.calls = (state.calls || 0) + 1;
    state.tried = state.tried || {};
    if (available.length > 1 && state.calls % every === 0) {
      var least = available[0];
      for (i = 1; i < available.length; i++) if ((state.tried[available[i]] || 0) < (state.tried[least] || 0)) least = available[i];
      best = least;
    }
    state.tried[best] = (state.tried[best] || 0) + 1;
    return best;
  };
  Model.prototype.toJSON = function () { return { b: this.b, w: this.w, n: this.n, meta: this.meta, version: this.version, mu: this.mu, sd: this.sd }; };

  /* Ridge regression per action over sparse binary features, by cyclic
     coordinate descent (exact per-coordinate minimisation; deterministic
     order). Features seen fewer than minCount times for an action are
     dropped: a weight from three examples is noise. */
  function train(trajectories, opts) {
    opts = opts || {};
    var lambda = opts.lambda === undefined ? 4.0 : opts.lambda;
    var minCount = opts.minCount || 5, sweeps = opts.sweeps || 40;
    var byAction = {};
    (trajectories || []).forEach(function (t) {
      if (!t || !t.action || !t.feats) return;
      (byAction[t.action] || (byAction[t.action] = [])).push({ x: t.feats.slice(), y: target(t, opts) });
    });
    var all = [];
    Object.keys(byAction).forEach(function (a) { byAction[a].forEach(function (r) { all.push(r.y); }); });
    var mu = all.length ? all.reduce(function (s, v) { return s + v; }, 0) / all.length : 0;
    var sd = all.length ? Math.sqrt(all.reduce(function (s, v) { return s + (v - mu) * (v - mu); }, 0) / all.length) : 1;
    var model = new Model({ mu: Math.round(mu * 1e4) / 1e4, sd: Math.round(Math.max(1e-3, sd) * 1e4) / 1e4,
                            meta: { trainedOn: (trajectories || []).length, lambda: lambda, minCount: minCount,
                                    note: opts.note || "trained on synthetic reasoning trajectories" } });
    Object.keys(byAction).sort().forEach(function (a) {
      var rows = byAction[a], n = rows.length, cnt = {}, i, j;
      if (n < minCount) return;
      rows.forEach(function (r) { r.x.forEach(function (f) { cnt[f] = (cnt[f] || 0) + 1; }); });
      var feats = Object.keys(cnt).filter(function (f) { return cnt[f] >= minCount; }).sort();
      var idx = {}; feats.forEach(function (f, k) { idx[f] = k; });
      var X = rows.map(function (r) { return r.x.filter(function (f) { return idx[f] !== undefined; }).map(function (f) { return idx[f]; }); });
      var y = rows.map(function (r) { return r.y; });
      var mean = y.reduce(function (s, v) { return s + v; }, 0) / n;
      var w = new Float64Array(feats.length), pred = new Float64Array(n);
      for (i = 0; i < n; i++) pred[i] = mean;
      /* column lists */
      var cols = feats.map(function () { return []; });
      for (i = 0; i < n; i++) for (j = 0; j < X[i].length; j++) cols[X[i][j]].push(i);
      for (var sweep = 0; sweep < sweeps; sweep++) {
        var delta = 0;
        for (j = 0; j < feats.length; j++) {
          var col = cols[j], rsum = 0, k;
          for (k = 0; k < col.length; k++) rsum += y[col[k]] - pred[col[k]] + w[j];
          var nw = rsum / (col.length + lambda);
          var d = nw - w[j];
          if (d !== 0) { for (k = 0; k < col.length; k++) pred[col[k]] += d; w[j] = nw; delta += Math.abs(d); }
        }
        if (delta < 1e-7) break;
      }
      model.b[a] = Math.round(mean * 1e4) / 1e4;
      model.n[a] = n;
      var row = {};
      for (j = 0; j < feats.length; j++) if (Math.abs(w[j]) >= 1e-4) row[feats[j]] = Math.round(w[j] * 1e4) / 1e4;
      model.w[a] = row;
    });
    return model;
  }

  /* Mean target of held-out steps under the model's choice vs under the
     logged choice, estimated only on states where the chosen action was
     actually logged (no counterfactual invention): the fraction of states
     in which the model ranks the logged action with the higher realised
     payoff first. Returns {pairs, agree, rankAccuracy}. */
  function evaluate(model, trajectories, opts) {
    var byState = {};
    (trajectories || []).forEach(function (t) {
      if (!t || !t.feats) return;
      var k = t.feats.slice().sort().join("&");
      (byState[k] || (byState[k] = [])).push(t);
    });
    var pairs = 0, agree = 0;
    Object.keys(byState).forEach(function (k) {
      var rows = byState[k], i, j;
      for (i = 0; i < rows.length; i++) for (j = i + 1; j < rows.length; j++) {
        if (rows[i].action === rows[j].action) continue;
        var yi = target(rows[i], opts), yj = target(rows[j], opts);
        if (Math.abs(yi - yj) < 1e-6) continue;
        pairs++;
        var ui = model.utility(rows[i].feats, rows[i].action), uj = model.utility(rows[j].feats, rows[j].action);
        if ((ui > uj) === (yi > yj)) agree++;
      }
    });
    return { pairs: pairs, agree: agree, rankAccuracy: pairs ? agree / pairs : null };
  }

  /* Did the model learn the behaviours a good reasoner should have? Each
     probe compares an operation's utility in the state that calls for it
     against a neutral state. Positive = learned. */
  function behaviours(model) {
    function u(feats, a) { return model.utility(feats, a); }
    var base = ["res:mid", "stall:0", "exact:0", "div:some", "left:hi"];
    function st(extra, drop) { return base.filter(function (f) { return !drop || drop.indexOf(f.split(":")[0]) < 0; }).concat(extra); }
    return {
      switch_representation_after_stall:
        (u(st(["stall:3"], ["stall"]), "PROPOSE_REPRESENTATION") - u(st(["stall:3"], ["stall"]), "REFINE_BEST")) -
        (u(base, "PROPOSE_REPRESENTATION") - u(base, "REFINE_BEST")),
      expand_after_underfit:
        (u(st(["res:high"], ["res"]), "EXPAND_PROGRAM") - u(st(["res:high"], ["res"]), "REFINE_BEST")) -
        (u(st(["res:tiny"], ["res"]), "EXPAND_PROGRAM") - u(st(["res:tiny"], ["res"]), "REFINE_BEST")),
      simplify_after_excess:
        (u(st(["diag:excessive_change"]), "SIMPLIFY_PROGRAM") - u(base, "SIMPLIFY_PROGRAM")),
      discriminate_when_ambiguous:
        (u(st(["amb:1", "exact:few"], ["exact"]), "GENERATE_DISCRIMINATOR") - u(st(["exact:few"], ["exact"]), "GENERATE_DISCRIMINATOR")),
      stop_when_verified:
        (u(st(["exact:few", "verified:1"], ["exact"]), "STOP") - u(st(["exact:few"], ["exact"]), "STOP"))
    };
  }

  /* Human-readable summary: the strongest positive features per action. */
  function explain(model, k) {
    var out = {};
    Object.keys(model.w).sort().forEach(function (a) {
      var row = model.w[a];
      out[a] = { intercept: model.b[a], n: model.n[a],
        favours: Object.keys(row).sort(function (x, y) { return row[y] - row[x]; }).slice(0, k || 5)
          .filter(function (f) { return row[f] > 0; }).map(function (f) { return f + " " + row[f]; }) };
    });
    return out;
  }

  /* -------------------------------------------------------- adaptive compute
   *
   * Shared by the ARC portfolio and language deliberation. Signals, all
   * optional: {candidates, exact, agreeing, disagreeing, verified,
   * verifierFailed, residual (0..1), stall, ambiguous, knowledgeGap,
   * interacting (constraint count), steps (derivation length), confidence}.
   * Returns {mode: "fast"|"deep", depth: 0..3, reasons: []}. Each rule is
   * stated; nothing is tuned to a benchmark. */
  function allocate(sig) {
    sig = sig || {};
    var reasons = [], deep = 0;
    if (sig.exact === 1 && sig.verified && !sig.disagreeing && !sig.ambiguous && (sig.confidence === undefined || sig.confidence >= 0.8))
      return { mode: "fast", depth: 0, reasons: ["one verified explanation, no rival"] };
    if (!sig.candidates && !sig.exact) { deep++; reasons.push("no candidate"); }
    if (sig.disagreeing) { deep++; reasons.push("candidates disagree"); }
    if (sig.verifierFailed) { deep++; reasons.push("verifier failed"); }
    if (sig.ambiguous) { deep++; reasons.push("ambiguous interpretation"); }
    if (sig.knowledgeGap) { deep++; reasons.push("knowledge gap"); }
    if (sig.residual !== undefined && sig.residual > 0 && sig.residual < 0.35) { deep++; reasons.push("structured near-miss"); }
    if ((sig.interacting || 0) >= 3) { deep++; reasons.push("interacting constraints"); }
    if ((sig.steps || 0) >= 4) { deep++; reasons.push("long derivation"); }
    if (sig.confidence !== undefined && sig.confidence < 0.5) { deep++; reasons.push("low confidence"); }
    return deep ? { mode: "deep", depth: Math.min(3, deep), reasons: reasons } : { mode: "fast", depth: 0, reasons: ["no difficulty signal"] };
  }

  /* ------------------------------------------------- one controller, all domains
   *
   * A process-wide hub: every domain logs its search trajectories here and
   * reads the same model back. ARC, ARC-3 and language reasoning therefore
   * learn their OPERATION selection jointly (dom:<domain> is a feature, so
   * domain-specific differences are still expressible). */
  var HUB = {
    model: null,
    buffer: [],
    cap: 20000,
    log: function (steps) {
      if (!steps) return;
      for (var i = 0; i < steps.length; i++) {
        this.buffer.push(steps[i]);
        if (this.buffer.length > this.cap) this.buffer.shift();
      }
    },
    retrain: function (opts) { this.model = train(this.buffer, opts); return this.model; },
    load: function (data) { this.model = data ? new Model(data) : null; return this.model; },
    active: function () { return this.model && this.model.trained() ? this.model : null; }
  };

  var META = {
    VERSION: "1.0.0", ACTIONS: ACTIONS,
    Model: Model, train: train, target: target, evaluate: evaluate, behaviours: behaviours, explain: explain,
    allocate: allocate, hub: HUB
  };
  root.C4ReasonMeta = META;
  if (typeof module !== "undefined" && module.exports && !root.__C4_BUNDLED_KERNEL) module.exports = META;
})(typeof window !== "undefined" ? window : globalThis);
