/* CELL4 residual-driven refinement kernel.
 *
 *   PERCEIVE -> ABSTRACT -> PROPOSE -> SIMULATE -> VERIFY -> RESIDUAL
 *            -> DIAGNOSE -> REPAIR -> RE-SIMULATE -> FALSIFY -> COMPRESS -> SELECT
 *
 * One loop, many domains. The kernel owns everything that does not depend on
 * what a hypothesis is ABOUT: its bookkeeping (assumptions, evidence,
 * lineage), how it is scored, which near-misses are worth keeping, which
 * reasoning operation to apply next, when to backtrack, when to stop, how
 * competing explanations are discriminated and how confidence is derived.
 * A domain adapter owns what does: how a hypothesis is executed, how its
 * failure is measured and described, and which repairs a diagnosis suggests.
 * ARC grids (c4-arc/src/55..58), ARC-3 world models (c4-arc3-world.js) and
 * language/maths problems (c4-lm-problem.js) are adapters over this file.
 *
 * Invariants the kernel enforces, whatever the adapter does:
 *   - a hypothesis enters the EXACT pool only if the adapter's verifier says
 *     it reproduces every constraint; near hypotheses are never "selected";
 *   - the frontier, the exact pool, children per step, depth and total
 *     expansions are all bounded; duplicate behaviours and cycles are
 *     rejected by key, so a mutation loop terminates;
 *   - everything is deterministic given the adapter and the clock budget.
 *
 * Deterministic, local, no network, no external model.
 */
(function (root) {
  "use strict";

  var LN2 = Math.LN2;
  function log2(x) { return Math.log(x) / LN2; }
  function nowMs() { return Date.now(); }

  /* ------------------------------------------------------------ vocabulary */

  var STATUS = { KNOWN: "KNOWN", DERIVED: "DERIVED", ASSUMED: "ASSUMED",
                 UNKNOWN: "UNKNOWN", CONTRADICTED: "CONTRADICTED" };

  /* Why a line of reasoning failed. Distinguishing these is the point: the
     remedy for missing knowledge is retrieval, for a bad inference it is a
     different rule, for an arithmetic slip it is recomputation, and for an
     ambiguity it is a question -- never the same repair. */
  var FAILURE = { MISSING_KNOWLEDGE: "missing_knowledge", BAD_INFERENCE: "bad_inference",
                  MISINTERPRETATION: "misinterpretation", ARITHMETIC_ERROR: "arithmetic_error",
                  UNSUPPORTED_ASSUMPTION: "unsupported_assumption",
                  CONTRADICTION: "contradiction", AMBIGUITY: "ambiguity" };

  /* Reasoning operations the meta-controller chooses between.
   *
   * The last five do work the first eight cannot:
   *   PROPOSE_REPRESENTATION  re-express a hypothesis in a different semantic
   *                           substrate (colour roles, a geometric frame, an
   *                           object or change-mask encoding) through the
   *                           adapter's migrateRepresentation hook -- the
   *                           program is carried over, the thing it is ABOUT
   *                           changes. CHANGE_REPRESENTATION only edits the
   *                           program inside its current substrate.
   *   GENERATE_DISCRIMINATOR  several exact explanations predict different
   *                           things: build inputs on which they disagree and
   *                           record fragility / disagreement. It never picks
   *                           a winner by label (there is none).
   *   INVENT_ABSTRACTION      anti-unify near-solutions from different
   *                           clusters into a parameterised template and refit
   *                           it on all evidence (adapter.inventAbstraction).
   *   VERIFY_DEEPLY           leave-one-out re-derivation of an exact
   *                           explanation; one that only fits when it has seen
   *                           every example stops counting as "solved" and the
   *                           search continues.
   *   RESTART_DIVERSE         a long stall: jump to the least-explored region
   *                           (seeds and clusters never expanded) instead of
   *                           the stalled branch's ancestor (BACKTRACK). */
  var ACTIONS = ["REFINE_BEST", "REFINE_DIVERSE", "ABSTRACT_RESIDUAL",
                 "CHANGE_REPRESENTATION", "EXPAND_PROGRAM", "SIMPLIFY_PROGRAM",
                 "BACKTRACK", "STOP",
                 "PROPOSE_REPRESENTATION", "GENERATE_DISCRIMINATOR", "INVENT_ABSTRACTION",
                 "VERIFY_DEEPLY", "RESTART_DIVERSE"];
  /* Which adapter repair mode each operation invokes. */
  var MODE_OF = { REFINE_BEST: "targeted", REFINE_DIVERSE: "targeted",
                  ABSTRACT_RESIDUAL: "abstract", CHANGE_REPRESENTATION: "represent",
                  EXPAND_PROGRAM: "expand", SIMPLIFY_PROGRAM: "simplify",
                  BACKTRACK: "targeted", PROPOSE_REPRESENTATION: "migrate",
                  INVENT_ABSTRACTION: "invent", RESTART_DIVERSE: "restart",
                  GENERATE_DISCRIMINATOR: "discriminate", VERIFY_DEEPLY: "verify" };

  /* ------------------------------------------------------------ hypothesis */

  var _ids = 0;
  function Hypothesis(o) {
    o = o || {};
    this.id = o.id || ("h" + (++_ids));
    this.domain = o.domain || "";
    this.representation = o.representation || "";
    this.assumptions = o.assumptions || [];
    this.evidence = o.evidence || [];
    this.constraints = o.constraints || [];
    this.latentState = o.latentState || {};
    this.program = o.program === undefined ? null : o.program;
    this.predictions = o.predictions || [];
    this.residual = o.residual || null;       /* adapter-defined, must carry .norm in [0,1] */
    this.diagnosis = o.diagnosis || null;     /* [{kind, weight, ...}] */
    this.status = o.status || "unevaluated";  /* exact | near | invalid */
    this.complexity = o.complexity || 0;      /* bits of the hypothesis itself */
    this.residualBits = o.residualBits || 0;  /* bits to encode its exceptions */
    this.invariantViolations = o.invariantViolations || 0;
    this.repairBits = o.repairBits || 0;
    this.score = 0;
    this.confidence = 0;
    this.key = o.key || null;                 /* behaviour key: equal keys = same hypothesis */
    this.cluster = o.cluster || null;         /* diversity bucket */
    this.expanded = {};                       /* modes already applied */
    this.lineage = o.lineage || { parent: null, mutation: null, depth: 0, why: null,
                                  residualBefore: null, residualAfter: null,
                                  assumptionAdded: null, assumptionRemoved: null };
    /* Representation and provenance. All optional: an adapter that never sets
       them gets the defaults and the old behaviour. */
    this.representationId = o.representationId || this.representation || "";
    this.representationState = o.representationState || null;  /* adapter data for the substrate */
    this.semanticKey = o.semanticKey || null;       /* equal = same function on a probe set */
    this.structuralKey = o.structuralKey || null;   /* equal = same canonical program text */
    this.sourceFamily = o.sourceFamily || "";
    this.episodeId = o.episodeId || null;
    this.traceId = o.traceId || null;
    this.novelty = o.novelty || 0;                  /* 0..1: how far from what the frontier holds */
    this.utility = o.utility || 0;
    this.verification = o.verification || null;     /* {deep, fragility, disagreement, ...} */
    this.counterexamples = o.counterexamples || [];
    this.localAdaptation = o.localAdaptation || null;
    this.abstractionsUsed = o.abstractionsUsed || [];
  }

  /* Child of ``parent`` produced by ``mutation``: lineage is filled in here so
     no adapter can forget it. */
  function derive(parent, fields, mutation) {
    var h = new Hypothesis(fields);
    h.domain = h.domain || parent.domain;
    if (!fields || !fields.representationId) h.representationId = parent.representationId || h.representationId;
    if (!fields || fields.representationState === undefined) h.representationState = parent.representationState || null;
    h.sourceFamily = h.sourceFamily || parent.sourceFamily || "";
    h.episodeId = h.episodeId || parent.episodeId || null;
    if (!fields || !fields.abstractionsUsed) h.abstractionsUsed = (parent.abstractionsUsed || []).slice();
    h.lineage = {
      parent: parent.id, parentRef: parent, mutation: mutation || null,
      depth: (parent.lineage ? parent.lineage.depth : 0) + 1,
      why: parent.diagnosis && parent.diagnosis.length ? parent.diagnosis[0].kind : null,
      residualBefore: parent.residual ? parent.residual.norm : null,
      residualAfter: null,
      assumptionAdded: mutation && mutation.assume ? mutation.assume : null,
      assumptionRemoved: mutation && mutation.unassume ? mutation.unassume : null
    };
    h.repairBits = (parent.repairBits || 0) + (mutation && mutation.bits ? mutation.bits : 1.0);
    return h;
  }

  /* --------------------------------------------------------------- scoring
   *
   * One currency: bits. A hypothesis is a two-part code -- the hypothesis
   * itself, then the data given the hypothesis -- so every term below is a
   * description length and the terms add without weights:
   *
   *   complexity      L(H): the program/model, supplied by the adapter from
   *                   its own prefix code (PROG.structBits+thetaBits for ARC).
   *   assumptions     each unsupported assumption must be stated to use H;
   *                   stating which one of ~4 kinds costs 2 bits.
   *   residual        L(D|H): exceptions needed to turn H's output into the
   *                   observed data (adapter: wrong cells x colour bits, ...).
   *                   Zero for an exact hypothesis.
   *   invariants      each violated demonstrated invariant is one more
   *                   exception; encoded as log2(10) (one colour-sized symbol).
   *   repair          the mutations that produced H are part of its
   *                   derivation; a long repair path is a less plausible
   *                   explanation than the same program found directly.
   *
   * Lower is better. Normalising by bits rather than by hand-tuned weights
   * is what keeps near and exact hypotheses comparable on one axis. */
  var ASSUMPTION_BITS = 2.0, INVARIANT_BITS = log2(10);
  function mdlScore(h) {
    var parts = {
      complexity: +h.complexity || 0,
      assumptions: ASSUMPTION_BITS * (h.assumptions ? h.assumptions.length : 0),
      residual: h.status === "exact" ? 0 : (+h.residualBits || 0),
      invariants: INVARIANT_BITS * (+h.invariantViolations || 0),
      repair: +h.repairBits || 0
    };
    var total = parts.complexity + parts.assumptions + parts.residual + parts.invariants + parts.repair;
    h.score = total;
    return { total: total, parts: parts };
  }

  /* -------------------------------------------------------------- frontier
   *
   * The bounded set of near-solutions worth repairing. Capacity is split
   * across clusters (a cluster is a residual signature x representation x
   * ancestry bucket supplied by the adapter), so 64 variants of one idea
   * cannot crowd out a structurally different idea with a worse score. */
  function Frontier(cap, clusterCap) {
    this.cap = cap || 48;
    this.clusterCap = clusterCap || Math.max(2, Math.ceil(this.cap / 8));
    this.items = [];
    this.keys = new Set();
    this.byCluster = new Map();
    this.evicted = 0;
  }
  Frontier.prototype.size = function () { return this.items.length; };
  Frontier.prototype.clusters = function () { return this.byCluster.size; };
  Frontier.prototype._cmp = function (a, b) {
    var ra = a.residual ? a.residual.norm : 1, rb = b.residual ? b.residual.norm : 1;
    return (a.score - b.score) || (ra - rb) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
  Frontier.prototype._remove = function (h) {
    var i = this.items.indexOf(h);
    if (i >= 0) this.items.splice(i, 1);
    var lst = this.byCluster.get(h.cluster);
    if (lst) {
      var j = lst.indexOf(h);
      if (j >= 0) lst.splice(j, 1);
      if (!lst.length) this.byCluster.delete(h.cluster);
    }
    this.evicted++;
  };
  /* Returns true when h was kept. */
  Frontier.prototype.add = function (h) {
    if (h.key !== null && this.keys.has(h.key)) return false;
    var cl = h.cluster || "_", lst = this.byCluster.get(cl) || [], self = this;
    if (lst.length >= this.clusterCap) {
      lst.sort(function (a, b) { return self._cmp(a, b); });
      var worstInCluster = lst[lst.length - 1];
      if (this._cmp(h, worstInCluster) >= 0) return false;
      this._remove(worstInCluster);
      lst = this.byCluster.get(cl) || [];
    }
    if (this.items.length >= this.cap) {
      /* evict the worst member of the most crowded cluster */
      var crowd = null, n = -1;
      this.byCluster.forEach(function (v, k) {
        if (v.length > n || (v.length === n && k > crowd)) { n = v.length; crowd = k; }
      });
      var victims = this.byCluster.get(crowd).slice().sort(function (a, b) { return self._cmp(a, b); });
      var victim = victims[victims.length - 1];
      if (crowd === cl && this._cmp(h, victim) >= 0) return false;
      this._remove(victim);
      lst = this.byCluster.get(cl) || [];
    }
    lst.push(h);
    this.byCluster.set(cl, lst);
    this.items.push(h);
    if (h.key !== null) this.keys.add(h.key);
    return true;
  };
  Frontier.prototype.sorted = function () {
    var self = this;
    return this.items.slice().sort(function (a, b) { return self._cmp(a, b); });
  };
  /* Best member not yet expanded under ``mode``. */
  Frontier.prototype.best = function (mode) {
    var s = this.sorted(), i;
    for (i = 0; i < s.length; i++) if (!s[i].expanded[mode]) return s[i];
    return null;
  };
  /* Best member of the least-explored cluster. */
  Frontier.prototype.diverse = function (mode) {
    var self = this, pick = null, pickN = Infinity, pickScore = Infinity;
    this.byCluster.forEach(function (lst) {
      var tried = 0, best = null, i;
      for (i = 0; i < lst.length; i++) {
        if (lst[i].expanded[mode]) tried++;
        else if (!best || self._cmp(lst[i], best) < 0) best = lst[i];
      }
      if (best && (tried < pickN || (tried === pickN && best.score < pickScore))) {
        pick = best; pickN = tried; pickScore = best.score;
      }
    });
    return pick;
  };

  /* ------------------------------------------------------ repair statistics
   *
   * Which repairs work after which diagnoses. Filled online during a solve
   * and offline from the synthetic curriculum (tools/arc-curriculum.js); the
   * adapter uses it to ORDER the children it proposes, never to accept one. */
  function RepairStats(data) {
    this.t = {};
    if (data && data.table) {
      var k;
      for (k in data.table) if (Object.prototype.hasOwnProperty.call(data.table, k))
        this.t[k] = [data.table[k][0], data.table[k][1]];
    }
  }
  RepairStats.prototype.observe = function (diag, mut, success) {
    var k = diag + "|" + mut, r = this.t[k] || (this.t[k] = [0, 0]);
    r[1] += 1; if (success) r[0] += 1;
  };
  /* Laplace-smoothed log-odds that ``mut`` helps after ``diag``; 0 = no data. */
  RepairStats.prototype.prior = function (diag, mut) {
    var r = this.t[diag + "|" + mut] || this.t["*|" + mut];
    if (!r) return 0.0;
    return Math.log((r[0] + 1) / (r[1] - r[0] + 1));
  };
  RepairStats.prototype.toJSON = function () { return { table: this.t }; };

  /* ------------------------------------------------------- meta-controller
   *
   * Chooses the next REASONING OPERATION, not the next solver. The state is
   * small and explicit: how good the best near-solution is, whether the last
   * steps improved it, how many exact explanations exist, how diverse the
   * frontier is, which failure keeps recurring, how much budget is left, and
   * how often each operation has paid off in this solve. Utilities are a
   * prior (below, each line justified) plus learned weights plus the
   * observed payoff of each operation, with a deterministic exploration
   * bonus so an operation that has never been tried is not starved. */
  function MetaController(opts) {
    opts = opts || {};
    this.weights = opts.weights || {};       /* learned: feature -> action -> w */
    /* a trained C4ReasonMeta model (c4-reason-meta.js): expected progress per
       unit of compute for each operation given the state features */
    this.model = opts.model || null;
    this.modelScale = opts.modelScale === undefined ? 1.0 : opts.modelScale;
    this.priors = opts.priors === undefined ? true : !!opts.priors;
    this.explore = opts.explore === undefined ? 0.5 : opts.explore;
    this.stats = {};
    this.trace = [];
    this.stallLimit = opts.stallLimit || 3;
    for (var i = 0; i < ACTIONS.length; i++) this.stats[ACTIONS[i]] = { n: 0, gain: 0, ms: 0 };
  }
  MetaController.prototype.features = function (st) {
    var f = ["bias"];
    var r = st.bestResidual;
    f.push("res:" + (r === null ? "none" : r < 0.02 ? "tiny" : r < 0.1 ? "low" : r < 0.35 ? "mid" : "high"));
    f.push("stall:" + Math.min(st.stall, 3));
    f.push("exact:" + (st.exact === 0 ? "0" : st.exact < 3 ? "few" : "many"));
    f.push("div:" + (st.clusters <= 1 ? "1" : st.clusters < 4 ? "some" : "wide"));
    f.push("left:" + (st.budgetFrac > 0.66 ? "hi" : st.budgetFrac > 0.33 ? "mid" : "lo"));
    if (st.topDiag) f.push("diag:" + st.topDiag);
    if (st.repeatedDiag) f.push("repeat:1");
    /* extended state (the legacy weight table carries none of these, so old
       policies are unaffected; a trained C4ReasonMeta model reads them) */
    if (st.domain) f.push("dom:" + st.domain);
    if (st.representation) f.push("rep:" + st.representation);
    if (st.dupRate !== undefined) f.push("dup:" + (st.dupRate > 0.5 ? "hi" : st.dupRate > 0.2 ? "mid" : "lo"));
    if (st.depth !== undefined) f.push("depth:" + Math.min(st.depth, 4));
    if (st.disagree) f.push("amb:1");
    if (st.verifyFail) f.push("vfail:1");
    if (st.repChanges) f.push("repchg:" + Math.min(st.repChanges, 2));
    if (st.lastAction) f.push("last:" + st.lastAction + (st.lastGain > 0 ? ":+" : ":0"));
    if (st.knowledge !== undefined && st.knowledge < 1) f.push("know:partial");
    if (st.exactVerified) f.push("verified:1");
    return f;
  };
  MetaController.prototype.utilities = function (st, available, feats) {
    feats = feats || this.features(st);
    var util = {}, i, a, total = 0, learned = null;
    for (i = 0; i < ACTIONS.length; i++) total += this.stats[ACTIONS[i]].n;
    if (this.model && typeof this.model.utilities === "function") {
      try { learned = this.model.utilities(feats, available); } catch (e) { learned = null; }
    }
    for (i = 0; i < available.length; i++) {
      a = available[i];
      var u = 0.0, s = this.stats[a];
      /* priors */
      if (this.priors) {
        if (a === "REFINE_BEST") u += 1.0;                                   /* default: exploit the best near-miss */
        if (a === "ABSTRACT_RESIDUAL" && st.topDiagStrong) u += 1.2;         /* a consistent semantic diagnosis names its own repair */
        if (a === "REFINE_DIVERSE" && st.clusters > 1) u += 0.3 + 0.3 * Math.min(st.stall, 3); /* stalled on one idea: try another */
        if (a === "EXPAND_PROGRAM" && st.bestResidual !== null && st.bestResidual > 0.3) u += 0.6; /* far from target: a missing step */
        if (a === "SIMPLIFY_PROGRAM" && st.topDiag === "excessive_change") u += 0.8; /* doing too much: delete a step */
        if (a === "CHANGE_REPRESENTATION" && (st.stall >= 2 || st.repeatedDiag)) u += 0.9; /* same failure again: change the frame */
        if (a === "BACKTRACK" && st.stall >= 2) u += 0.7;                    /* branch stopped improving */
        /* the substrate itself may be wrong: repeated failure, or a failure
           the residual attributes to the representation */
        if (a === "PROPOSE_REPRESENTATION") u += (st.repFailure ? 1.2 : 0) + (st.stall >= 3 ? 0.4 : 0);
        /* competing exact explanations that disagree: information, not search */
        if (a === "GENERATE_DISCRIMINATOR" && st.disagree) u += 1.4;
        /* two different near-solutions share structure: generalise them */
        if (a === "INVENT_ABSTRACTION" && st.clusters > 1 && st.stall >= 1) u += 0.5;
        /* an exact explanation nobody has cross-validated */
        if (a === "VERIFY_DEEPLY" && st.exact > 0 && !st.exactVerified) u += 1.3;
        /* a long stall: the region is exhausted */
        if (a === "RESTART_DIVERSE" && st.stall >= 2 * this.stallLimit) u += 0.6;
        /* nothing left to gain: one verified explanation, no rival */
        if (a === "STOP" && st.exact > 0 && st.exactVerified && !st.disagree) u += 0.8 + 0.3 * Math.min(st.stall, 3);
      }
      /* learned */
      for (var j = 0; j < feats.length; j++) {
        var row = this.weights[feats[j]];
        if (row && row[a]) u += row[a];
      }
      if (learned && learned[a] !== undefined && isFinite(learned[a])) u += this.modelScale * learned[a];
      /* observed payoff per operation this solve, and exploration: an
         operation that has never been tried keeps a floor of utility so a
         learned policy cannot lock the search into one path */
      if (s.n) u += Math.min(2.0, s.gain / s.n * 4.0);
      u += this.explore * Math.sqrt(Math.log(total + 2) / (s.n + 1));
      util[a] = u;
    }
    return util;
  };
  MetaController.prototype.choose = function (st, available) {
    if (!available.length) return "STOP";
    var feats = this.features(st), util = this.utilities(st, available, feats), i;
    var best = available[0];
    for (i = 1; i < available.length; i++) if (util[available[i]] > util[best]) best = available[i];
    this.trace.push({ action: best, utility: Math.round(util[best] * 100) / 100, feats: feats.slice(1) });
    return best;
  };
  MetaController.prototype.observe = function (action, gain, ms) {
    var s = this.stats[action];
    if (!s) return;
    s.n += 1; s.gain += Math.max(0, gain); s.ms += ms;
    var last = this.trace[this.trace.length - 1];
    if (last && last.action === action && last.gain === undefined) last.gain = gain;
  };
  /* Learn feature -> action weights from traces: the log-odds that an
     operation chosen in a state with that feature improved the frontier.
     Laplace-smoothed, halved so learned terms stay commensurate with the
     documented priors in choose(). */
  function learnWeights(traces, minCount) {
    var cnt = {}, w = {};
    minCount = minCount || 5;
    traces.forEach(function (t) {
      if (t.gain === undefined) return;
      (t.feats || []).concat(["bias"]).forEach(function (f) {
        var k = f + "|" + t.action, c = cnt[k] || (cnt[k] = [0, 0]);
        c[1]++; if (t.gain > 0) c[0]++;
      });
    });
    Object.keys(cnt).forEach(function (k) {
      var c = cnt[k];
      if (c[1] < minCount) return;
      var i = k.lastIndexOf("|"), f = k.slice(0, i), a = k.slice(i + 1);
      (w[f] || (w[f] = {}))[a] = Math.round(0.5 * Math.log((c[0] + 1) / (c[1] - c[0] + 1)) * 1000) / 1000;
    });
    return w;
  }

  /* -------------------------------------------------------- refinement loop */

  /* Keep a child only when it carries information the parent did not:
   *   - its residual is smaller, or
   *   - it is materially simpler (>= 2 bits) at no residual cost, or
   *   - it opens a residual/representation cluster the frontier lacks and is
   *     not much worse (the diversity case: a different wrong answer is worth
   *     keeping, the same wrong answer is not). */
  var IMPROVE_EPS = 1e-9, SIMPLER_BITS = 2.0, DIVERSE_SLACK = 0.10;
  /* A representation change is allowed to look worse at first: the program
     was written for the old substrate and has not been refitted to the new
     one yet. Bounded, so a migration cannot flood the frontier. */
  var REP_SLACK = 0.25;
  /* bits charged to an exact explanation that breaks on discriminating
     probes (scaled by its fragility), or that fails leave-one-out
     re-derivation -- enough to reorder near-ties, never to overturn an
     exact fit into a non-fit */
  var FRAGILITY_BITS = 4.0, DEEP_FAIL_BITS = 3.0;
  function survives(child, parent, frontier) {
    var rc = child.residual ? child.residual.norm : 1, rp = parent.residual ? parent.residual.norm : 1;
    if (rc < rp - IMPROVE_EPS) return "improved";
    if (rc <= rp + IMPROVE_EPS && child.complexity <= parent.complexity - SIMPLER_BITS) return "simpler";
    if (!frontier.byCluster.has(child.cluster) && rc <= rp + DIVERSE_SLACK) return "diverse";
    if (child.representationId !== parent.representationId && rc <= rp + REP_SLACK) return "represented";
    return null;
  }

  var _episodes = 0;

  /* Is the best hypothesis failing because of its SUBSTRATE rather than its
     program? Adapters tag diagnoses with level "representation" or
     "program"; a strong representation-level diagnosis, or more
     representation-level than program-level weight, says so. */
  function repFailureOf(h) {
    var ds = h && h.diagnosis ? h.diagnosis : [], rep = 0, prog = 0, i;
    for (i = 0; i < ds.length; i++) {
      var w = (ds[i].strong ? 2 : 1) * (ds[i].weight || 0.1);
      if (ds[i].level === "representation") { if (ds[i].strong) return true; rep += w; } else prog += w;
    }
    return rep > prog;
  }

  /* adapter: {
   *   evaluate(h)            simulate + verify + residual; sets status, residual,
   *                          residualBits, complexity, key, cluster
   *   diagnose(h)            -> [{kind, weight, strong?, ...}] semantic diagnoses
   *   repair(h, mode, diag)  -> [child hypotheses] (use kernel.derive)
   *   verifyExact(h)         -> bool, final guard before the exact pool
   *   -- optional hooks; the kernel degrades gracefully without them --
   *   structuralKey(h)       canonical program key computed BEFORE execution;
   *                          equal keys are the same program, so the second
   *                          is never executed
   *   semanticKey(h)         behaviour on a probe set (after evaluation)
   *   estimateNovelty(h, F)  0..1 distance from what frontier F holds
   *   proposeRepresentations(h, diags)  -> children in other substrates
   *   inventAbstraction(hs, exact)      -> generalised children
   *   generateDiscriminator(exact)      -> {probes, fragility[], disagreement}
   *   verifyDeep(h)          -> {pass, wins, trials} | null
   *   restart(sample, F)     -> fresh hypotheses from unexplored regions
   * }
   * opts: deadline | maxMs, maxSteps, frontierCap, clusterCap, childCap,
   *       maxDepth, stallLimit, exactCap, stopOnExact, weights, stats, log,
   *       metaModel (C4ReasonMeta), actions (allowed subset), domain,
   *       episodeId, trajectory (array to append step records to),
   *       checkGeneralization(h) -> bool (synthetic curricula only) */
  function refine(adapter, seeds, opts) {
    opts = opts || {};
    var t0 = nowMs();
    var deadline = opts.deadline || (t0 + (opts.maxMs || 500));
    var maxSteps = opts.maxSteps || 64, childCap = opts.childCap || 10;
    var maxDepth = opts.maxDepth || 4, exactCap = opts.exactCap || 16;
    var stallLimit = opts.stallLimit || 3, maxStall = opts.maxStall || stallLimit * 4;
    var frontier = new Frontier(opts.frontierCap || 48, opts.clusterCap);
    var meta = new MetaController({ weights: opts.weights, stallLimit: stallLimit, model: opts.metaModel || null,
                                    modelScale: opts.metaScale, priors: opts.metaPriors, explore: opts.explore });
    var repairStats = opts.stats || new RepairStats();
    var seen = new Set(), structSeen = new Set(), exact = [], exactKeys = new Set();
    var episodeId = opts.episodeId || ("ep" + (++_episodes));
    var domain = opts.domain || (seeds.length && seeds[0].domain) || "";
    var Mem = root.C4ReasonMemory || null;
    var wm = Mem && Mem.WorkingMemory ? new Mem.WorkingMemory({ episodeId: episodeId, domain: domain }) : null;
    var trajectory = [], trajCap = opts.trajectoryCap || 400;
    var hooks = {
      structural: typeof adapter.structuralKey === "function",
      semantic: typeof adapter.semanticKey === "function",
      novelty: typeof adapter.estimateNovelty === "function",
      migrate: typeof adapter.proposeRepresentations === "function",
      invent: typeof adapter.inventAbstraction === "function",
      discriminate: typeof adapter.generateDiscriminator === "function",
      verify: typeof adapter.verifyDeep === "function",
      restart: typeof adapter.restart === "function"
    };
    var allow = opts.actions ? new Set(opts.actions) : null;
    var stats = { seeds: 0, evaluated: 0, kept: 0, duplicates: 0, wasted: 0, exact: 0,
                  steps: 0, backtracks: 0, repsSwitched: 0, depthSum: 0, madeExact: 0,
                  bestStart: null, bestEnd: null, byMutation: {}, byDiag: {}, survival: {},
                  structDuplicates: 0, migrations: 0, migrationKept: 0, migrationExact: 0,
                  discriminations: 0, inventions: 0, deepVerified: 0, deepFailed: 0, restarts: 0,
                  maxDepthReached: 0, byAction: {} };

    function budgetLeft() { return Math.max(0, deadline - nowMs()) / Math.max(1, deadline - t0); }
    function mutStat(k) { return stats.byMutation[k] || (stats.byMutation[k] = { tried: 0, kept: 0, exact: 0, improved: 0 }); }
    function actStat(a) { return stats.byAction[a] || (stats.byAction[a] = { n: 0, gain: 0, exact: 0, children: 0 }); }

    function admitExact(h) {
      if (exactKeys.has(h.key)) return;
      if (!adapter.verifyExact(h)) { h.status = "near"; return; }     /* the guarantee */
      exactKeys.add(h.key);
      if (hooks.semantic) { try { h.semanticKey = adapter.semanticKey(h) || null; } catch (e) { h.semanticKey = null; } }
      mdlScore(h);
      exact.push(h);
      exact.sort(function (a, b) { return (a.score - b.score) || (a.id < b.id ? -1 : 1); });
      if (exact.length > exactCap) exact.pop();
      stats.exact++;
      discriminated = false;
      if (wm) wm.confirm(h.key, { id: h.id, repr: h.representationId, score: h.score });
    }

    function consider(h, parent, mutKind) {
      if (!h.episodeId) h.episodeId = episodeId;
      if (hooks.structural) {
        var sk = null;
        try { sk = adapter.structuralKey(h); } catch (e) { sk = null; }
        if (sk !== null && sk !== undefined) {
          h.structuralKey = sk;
          if (structSeen.has(sk)) { stats.duplicates++; stats.structDuplicates++; return null; }
          structSeen.add(sk);
        }
      }
      if (h.key !== null && h.key !== undefined && seen.has(h.key)) { stats.duplicates++; return null; }
      try { adapter.evaluate(h); } catch (e) { h.status = "invalid"; }
      stats.evaluated++;
      if (h.key !== null && h.key !== undefined) {
        if (seen.has(h.key)) { stats.duplicates++; return null; }
        seen.add(h.key);
      }
      if (h.status === "invalid") { stats.wasted++; return null; }
      mdlScore(h);
      if (hooks.novelty) { try { h.novelty = +adapter.estimateNovelty(h, frontier) || 0; } catch (e) { h.novelty = 0; } }
      else h.novelty = frontier.byCluster.has(h.cluster) ? 0 : 1;
      if (parent) h.lineage.residualAfter = h.residual ? h.residual.norm : null;
      if (h.lineage && h.lineage.depth > stats.maxDepthReached) stats.maxDepthReached = h.lineage.depth;
      if (h.status === "exact") {
        admitExact(h);
        if (h.status === "exact") {
          if (parent) { stats.madeExact++; stats.depthSum += h.lineage.depth; mutStat(mutKind).exact++; }
          return "exact";
        }
      }
      if (!parent) { if (frontier.add(h)) stats.kept++; return "seed"; }
      var why = survives(h, parent, frontier);
      if (why && h.lineage.depth <= maxDepth && frontier.add(h)) {
        stats.kept++; mutStat(mutKind).kept++;
        stats.survival[why] = (stats.survival[why] || 0) + 1;
        if (why === "improved") mutStat(mutKind).improved++;
        return why;
      }
      stats.wasted++;
      return null;
    }

    var i;
    for (i = 0; i < seeds.length; i++) {
      if (nowMs() > deadline) break;
      stats.seeds++;
      consider(seeds[i], null, null);
    }
    function bestNorm() {
      var s = frontier.sorted();
      return s.length && s[0].residual ? s[0].residual.norm : null;
    }
    stats.bestStart = bestNorm();

    /* afterExact: how many further operations to spend once an exact
       explanation exists (alternatives for ranking); 0 = stop at the first.
       An exact explanation that fails deep verification does not count. */
    var afterExact = opts.stopOnExact ? 0 : (opts.afterExact === undefined ? Infinity : opts.afterExact);
    var stall = 0, lastBest = stats.bestStart, lastDiags = [], stalledParent = null, firstExactStep = null;
    var discriminated = false, lastAction = null, lastGain = 0, repChanges = 0;
    function trusted() { return exact.filter(function (e) { return !(e.verification && e.verification.deep === false); }); }
    function unverified() {
      for (var q = 0; q < exact.length; q++) if (!exact[q].verification || exact[q].verification.deep === undefined) return exact[q];
      return null;
    }
    function restartSample() {
      /* members never expanded, least-deep first, from the least-expanded clusters */
      var items = frontier.items.filter(function (h) { return !Object.keys(h.expanded).length; });
      items.sort(function (a, b) {
        return ((a.lineage ? a.lineage.depth : 0) - (b.lineage ? b.lineage.depth : 0)) || (a.score - b.score) || (a.id < b.id ? -1 : 1);
      });
      return items.slice(0, 6);
    }
    while (stats.steps < maxSteps && nowMs() < deadline) {
      var good = trusted();
      if (good.length && firstExactStep === null) firstExactStep = stats.steps;
      if (!good.length) firstExactStep = null;
      if (firstExactStep !== null && stats.steps - firstExactStep >= afterExact) break;
      if (!frontier.size() && !exact.length) break;
      var best = frontier.size() ? frontier.sorted()[0] : null;
      if (best && !best.diagnosis) { try { best.diagnosis = adapter.diagnose(best) || []; } catch (e) { best.diagnosis = []; } }
      var top = best && best.diagnosis && best.diagnosis.length ? best.diagnosis[0] : null;
      var st = {
        bestResidual: bestNorm(), stall: stall, exact: exact.length, clusters: frontier.clusters(),
        budgetFrac: budgetLeft(), topDiag: top ? top.kind : null, topDiagStrong: !!(top && top.strong),
        repeatedDiag: lastDiags.length >= 2 && top && lastDiags[lastDiags.length - 1] === top.kind &&
                      lastDiags[lastDiags.length - 2] === top.kind,
        domain: domain, representation: best ? best.representationId : null,
        dupRate: stats.evaluated + stats.duplicates ? stats.duplicates / (stats.evaluated + stats.duplicates) : 0,
        depth: best && best.lineage ? best.lineage.depth : 0,
        disagree: exact.length >= 2 && !discriminated,
        verifyFail: stats.deepFailed > 0, repChanges: repChanges,
        repFailure: repFailureOf(best), exactVerified: good.some(function (e) { return e.verification && e.verification.deep === true; }),
        lastAction: lastAction, lastGain: lastGain
      };
      var avail = [], modeOpen = function (m) { return frontier.best(m) !== null; };
      if (modeOpen("targeted")) avail.push("REFINE_BEST");
      if (frontier.clusters() > 1 && frontier.diverse("targeted")) avail.push("REFINE_DIVERSE");
      if (top && top.strong && modeOpen("abstract")) avail.push("ABSTRACT_RESIDUAL");
      if (modeOpen("represent")) avail.push("CHANGE_REPRESENTATION");
      if (modeOpen("expand")) avail.push("EXPAND_PROGRAM");
      if (modeOpen("simplify")) avail.push("SIMPLIFY_PROGRAM");
      if (stall >= 2 && stalledParent && stalledParent.lineage.parentRef) avail.push("BACKTRACK");
      if (hooks.migrate && modeOpen("migrate")) avail.push("PROPOSE_REPRESENTATION");
      if (hooks.invent && frontier.size() >= 2 && modeOpen("invent")) avail.push("INVENT_ABSTRACTION");
      if (hooks.discriminate && exact.length >= 2 && !discriminated) avail.push("GENERATE_DISCRIMINATOR");
      if (hooks.verify && unverified()) avail.push("VERIFY_DEEPLY");
      if (stall >= stallLimit * 2 && (hooks.restart || restartSample().length)) avail.push("RESTART_DIVERSE");
      if (good.length) avail.push("STOP");
      if (allow) avail = avail.filter(function (a) { return allow.has(a) || a === "STOP"; });
      /* give up only after a long run of non-improving operations: the
         controller has by then been pushed through diversity, representation
         change and backtracking by the stall features */
      if (stall >= maxStall || !avail.length) break;
      if (avail.length === 1 && avail[0] === "STOP") break;
      var action = meta.choose(st, avail);
      if (action === "STOP") { stats.stopped = true; break; }
      var mode = MODE_OF[action], parent = null, started = nowMs(), children = [];
      var dup0 = stats.duplicates, kept0 = stats.kept, exact0 = stats.exact;
      var gain = 0, before = null, pdiag = "none", newClusters = 0, bestChildRes = null, bestChildCx = null;
      var clusterSet = new Set(frontier.byCluster.keys());

      if (action === "GENERATE_DISCRIMINATOR") {
        /* information about competing explanations, not search */
        var dres = null;
        try { dres = adapter.generateDiscriminator(exact.slice()); } catch (e) { dres = null; }
        discriminated = true;
        stats.discriminations++;
        if (dres && dres.fragility) {
          for (var di = 0; di < exact.length && di < dres.fragility.length; di++) {
            var fr = Math.max(0, Math.min(1, +dres.fragility[di] || 0));
            exact[di].verification = exact[di].verification || {};
            exact[di].verification.fragility = fr;
            exact[di].verification.disagreement = dres.disagreement === undefined ? null : dres.disagreement;
            exact[di].score += FRAGILITY_BITS * fr;
            if (fr > 0 && wm) wm.counterexample(exact[di].key, { kind: "fragile_probe", fragility: fr });
          }
          exact.sort(function (a, b) { return (a.score - b.score) || (a.id < b.id ? -1 : 1); });
          gain = dres.disagreement ? Math.min(1, +dres.disagreement) : 0;
        }
        if (wm && dres && dres.disagreement) wm.question("which exact explanation generalises", { disagreement: dres.disagreement });
      } else if (action === "VERIFY_DEEPLY") {
        var ev = unverified(), vr = null;
        try { vr = adapter.verifyDeep(ev); } catch (e) { vr = null; }
        ev.verification = ev.verification || {};
        ev.verification.deep = vr ? !!vr.pass : null;
        if (vr) { ev.verification.wins = vr.wins; ev.verification.trials = vr.trials; }
        parent = ev; before = 0;
        if (vr && !vr.pass) {
          ev.score += DEEP_FAIL_BITS; stats.deepFailed++;
          ev.counterexamples.push({ kind: "leave_one_out", wins: vr.wins, trials: vr.trials });
          exact.sort(function (a, b) { return (a.score - b.score) || (a.id < b.id ? -1 : 1); });
          if (wm) wm.refute(ev.key, "fails leave-one-out re-derivation");
          gain = 0.5;
        } else if (vr && vr.pass) { stats.deepVerified++; gain = 0.25; }
      } else {
        if (action === "REFINE_DIVERSE") parent = frontier.diverse(mode);
        else if (action === "BACKTRACK") {
          /* the stalled branch's ancestor gets its untried modes re-opened */
          parent = stalledParent.lineage.parentRef;
          stats.backtracks++;
          var untried = ["represent", "expand", "simplify", "abstract", "targeted"].filter(function (m) { return !parent.expanded[m]; });
          mode = untried.length ? untried[0] : "represent";
          if (frontier.keys.has(parent.key) === false) frontier.add(parent);
        } else if (action === "RESTART_DIVERSE") {
          stats.restarts++;
          var sample = restartSample();
          if (hooks.restart) {
            try { children = adapter.restart(sample, frontier) || []; } catch (e) { children = []; }
            parent = null;
          } else parent = sample.length ? sample[0] : frontier.diverse("expand");
          if (!hooks.restart && parent) mode = !parent.expanded.expand ? "expand" : !parent.expanded.represent ? "represent" : "targeted";
          stall = Math.floor(stall / 2);
        } else parent = frontier.best(mode);
        if (!parent && !(action === "RESTART_DIVERSE" && hooks.restart)) {
          meta.observe(action, 0, 0); stats.steps++; stall++; lastAction = action; lastGain = 0; continue;
        }
        if (parent) {
          parent.expanded[mode] = true;
          if (!parent.diagnosis) { try { parent.diagnosis = adapter.diagnose(parent) || []; } catch (e) { parent.diagnosis = []; } }
          pdiag = parent.diagnosis[0] ? parent.diagnosis[0].kind : "none";
          before = parent.residual ? parent.residual.norm : 1;
        } else before = bestNorm() === null ? 1 : bestNorm();
        if (mode === "represent") stats.repsSwitched++;
        if (action === "PROPOSE_REPRESENTATION") {
          stats.migrations++;
          try { children = adapter.proposeRepresentations(parent, parent.diagnosis) || []; } catch (e) { children = []; }
        } else if (action === "INVENT_ABSTRACTION") {
          stats.inventions++;
          /* the best member of each of up to four clusters */
          var picks = [], usedCl = new Set(), srt = frontier.sorted();
          for (var pi = 0; pi < srt.length && picks.length < 4; pi++) {
            if (usedCl.has(srt[pi].cluster)) continue;
            usedCl.add(srt[pi].cluster); picks.push(srt[pi]);
          }
          if (picks.indexOf(parent) < 0) picks.unshift(parent);
          try { children = adapter.inventAbstraction(picks, exact.slice()) || []; } catch (e) { children = []; }
        } else if (action !== "RESTART_DIVERSE" || !hooks.restart) {
          try { children = adapter.repair(parent, mode, parent.diagnosis, repairStats) || []; }
          catch (e) { children = []; }
        }
        if (children.length > childCap) children = children.slice(0, childCap);
        for (var c = 0; c < children.length; c++) {
          if (nowMs() > deadline) break;
          var ch = children[c], mk = ch.lineage && ch.lineage.mutation ? ch.lineage.mutation.kind : (action === "RESTART_DIVERSE" ? "restart" : "?");
          mutStat(mk).tried++;
          var outcome = consider(ch, parent, mk);
          var ok = outcome === "exact" || outcome === "improved";
          repairStats.observe(pdiag, mk, ok);
          stats.byDiag[pdiag] = (stats.byDiag[pdiag] || 0) + 1;
          if (parent && ch.representationId !== parent.representationId) {
            repChanges++;
            if (outcome) stats.migrationKept++;
            if (outcome === "exact") stats.migrationExact++;
          }
          if (outcome && ch.cluster !== null && !clusterSet.has(ch.cluster)) { newClusters++; clusterSet.add(ch.cluster); }
          if (outcome && ch.residual && (bestChildRes === null || ch.residual.norm < bestChildRes)) { bestChildRes = ch.residual.norm; bestChildCx = ch.complexity; }
          if (opts.log) opts.log.push({ diag: pdiag, diagDetail: parent && parent.diagnosis ? parent.diagnosis[0] || null : null,
            repr: parent ? parent.representation : null, mutation: ch.lineage ? ch.lineage.mutation : null, before: before,
            after: ch.residual ? ch.residual.norm : null, outcome: outcome || "rejected",
            depth: ch.lineage ? ch.lineage.depth : 0, action: action });
          if (outcome === "exact") gain = Math.max(gain, before);
          else if (ch.residual && outcome) gain = Math.max(gain, before - ch.residual.norm);
        }
      }
      var ms = nowMs() - started;
      meta.observe(action, gain, ms);
      var as = actStat(action); as.n++; as.gain += Math.max(0, gain); as.exact += stats.exact - exact0; as.children += children.length;
      stats.steps++;
      if (wm) wm.step({ action: action, parent: parent ? parent.id : null, gain: gain, repr: parent ? parent.representationId : null,
                        residual: bestNorm() });
      if (trajectory.length < trajCap) trajectory.push({
        ep: episodeId, step: stats.steps - 1, domain: domain, feats: meta.features(st).slice(1), action: action,
        parent: parent ? parent.id : null, parentDepth: parent && parent.lineage ? parent.lineage.depth : 0,
        repr: parent ? parent.representationId : null, resBefore: before, resAfter: bestChildRes,
        cxBefore: parent ? parent.complexity : null, cxAfter: bestChildCx, novelty: newClusters,
        ms: ms, children: children.length, dedup: stats.duplicates - dup0, kept: stats.kept - kept0,
        exactFound: stats.exact - exact0, gain: gain, reachedExact: false, depthFromSolution: null, generalized: null });
      lastAction = action; lastGain = gain;
      if (pdiag !== "none") lastDiags.push(pdiag);
      var nb = bestNorm();
      if (lastBest === null || (nb !== null && nb < lastBest - IMPROVE_EPS) || gain > 0.5) { stall = 0; lastBest = nb; }
      else { stall++; if (parent) stalledParent = parent; }
    }
    /* Which steps lay on a path to an exact explanation, and how far from it:
       the supervision signal for a learned controller. Failures stay in the
       log with reachedExact false -- they are half of what it learns from. */
    var onPath = new Map();
    exact.forEach(function (h) {
      var gen = null;
      if (opts.checkGeneralization) { try { gen = !!opts.checkGeneralization(h); } catch (e) { gen = null; } }
      h.verification = h.verification || {};
      if (gen !== null) h.verification.generalized = gen;
      var cur = h, d = h.lineage ? h.lineage.depth : 0;
      while (cur) {
        var prev = onPath.get(cur.id);
        var dist = d - (cur.lineage ? cur.lineage.depth : 0);
        if (!prev || dist < prev.dist) onPath.set(cur.id, { dist: dist, gen: gen });
        cur = cur.lineage ? cur.lineage.parentRef : null;
      }
    });
    trajectory.forEach(function (t) {
      var p = t.parent ? onPath.get(t.parent) : null;
      if (p) { t.reachedExact = true; t.depthFromSolution = p.dist; t.generalized = p.gen; }
    });
    /* Off-policy samples for STOP (only when a caller collects training
       trajectories): at every step taken while an exact explanation already
       existed, stopping would have been right exactly when no later step
       found another exact explanation -- the compute it would have saved. */
    if (opts.trajectory && opts.pseudoStop !== false) {
      var extra = [];
      for (var ti = 0; ti < trajectory.length; ti++) {
        var tt = trajectory[ti];
        if (!tt.feats || tt.feats.indexOf("exact:0") >= 0 || tt.action === "STOP") continue;
        var later = 0;
        for (var tj = ti; tj < trajectory.length; tj++) later += trajectory[tj].exactFound || 0;
        extra.push({ ep: tt.ep, step: tt.step, domain: tt.domain, feats: tt.feats, action: "STOP", pseudo: true,
                     gain: later ? 0 : 0.5, children: 0, ms: 0, reachedExact: false, depthFromSolution: null, generalized: null });
      }
      for (ti = 0; ti < extra.length; ti++) trajectory.push(extra[ti]);
    }
    if (opts.trajectory && Array.isArray(opts.trajectory)) for (i = 0; i < trajectory.length; i++) opts.trajectory.push(trajectory[i]);
    stats.bestEnd = bestNorm();
    stats.frontier = frontier.size();
    stats.clusters = frontier.clusters();
    stats.evicted = frontier.evicted;
    stats.ms = nowMs() - t0;
    stats.plan = meta.trace.map(function (t) { return t.action; });
    stats.trace = meta.trace;
    stats.trajectory = trajectory;
    stats.episodeId = episodeId;
    if (wm) {
      exact.forEach(function (h) { if (h.verification && h.verification.deep === false) wm.refute(h.key, "leave-one-out"); });
      stats.memory = wm.compact();
    }
    if (opts.episodic && typeof opts.episodic.record === "function") {
      try {
        opts.episodic.record({ id: episodeId, domain: domain, signature: opts.signature || null,
          representations: trajectory.map(function (t) { return t.repr; }).filter(function (r, k, a) { return r && a.indexOf(r) === k; }),
          operations: stats.plan.slice(), outcome: exact.length ? "exact" : "none", cost: { ms: stats.ms, evaluated: stats.evaluated },
          failedBranches: trajectory.filter(function (t) { return !t.reachedExact && t.gain <= 0; }).length,
          successfulBranch: exact.length ? lineagePath(exact[0]) : null,
          counterexamples: exact.reduce(function (acc, h) { return acc.concat(h.counterexamples || []); }, []).slice(0, 8),
          memory: stats.memory || null });
      } catch (e) { /* memory is advisory */ }
    }
    return { exact: exact, frontier: frontier, stats: stats, meta: meta, repairStats: repairStats, trajectory: trajectory };
  }

  /* The mutation path from a seed to h, oldest first. */
  function lineagePath(h) {
    var out = [], cur = h;
    while (cur && cur.lineage && cur.lineage.mutation) {
      out.push({ mutation: cur.lineage.mutation.kind, detail: cur.lineage.mutation.detail || "", why: cur.lineage.why });
      cur = cur.lineage.parentRef;
    }
    return out.reverse();
  }

  /* ---------------------------------------------------- compress / discriminate
   *
   * compress: hypotheses that behave identically on every probe are one
   * explanation; keep the shortest description of it.
   *
   * discriminate: run each hypothesis on probes that the evidence does not
   * decide (counterfactual situations built by the adapter), group by
   * behaviour, and report where they diverge and which ones break (return
   * nothing, or violate a demonstrated invariant). Probes carry no labels;
   * this measures fragility and generality, never correctness. */
  function compress(hyps, behaviourKey) {
    var byKey = new Map(), out = [];
    hyps.forEach(function (h) {
      var k = behaviourKey(h), cur = byKey.get(k);
      if (!cur || h.score < cur.score) byKey.set(k, h);
    });
    byKey.forEach(function (h) { out.push(h); });
    return out.sort(function (a, b) { return a.score - b.score; });
  }

  function discriminate(hyps, probes, run, invariant) {
    var n = hyps.length, rows = [], i, j, p;
    for (i = 0; i < n; i++) rows.push({ valid: 0, violations: 0, outs: [] });
    var divergent = [];
    for (p = 0; p < probes.length; p++) {
      var keys = [];
      for (i = 0; i < n; i++) {
        var out = null;
        try { out = run(hyps[i], probes[p]); } catch (e) { out = null; }
        var k = out === null || out === undefined ? null : (typeof out === "string" ? out : JSON.stringify(out));
        rows[i].outs.push(k);
        if (k !== null) {
          rows[i].valid++;
          if (invariant && !invariant(out, probes[p])) rows[i].violations++;
        }
        keys.push(k);
      }
      var distinct = new Set(keys.filter(function (x) { return x !== null; }));
      if (distinct.size > 1) divergent.push(p);
    }
    var agree = [];
    for (i = 0; i < n; i++) {
      agree.push([]);
      for (j = 0; j < n; j++) {
        var same = 0;
        for (p = 0; p < probes.length; p++) if (rows[i].outs[p] !== null && rows[i].outs[p] === rows[j].outs[p]) same++;
        agree[i].push(probes.length ? same / probes.length : 1);
      }
    }
    return {
      divergentProbes: divergent,
      robustness: rows.map(function (r) { return probes.length ? (r.valid - r.violations) / probes.length : 1; }),
      violations: rows.map(function (r) { return r.violations; }),
      agreement: agree
    };
  }

  /* ------------------------------------------------------------ calibration
   *
   * Confidence as accumulated evidence, in log-odds. Each term is a
   * likelihood ratio stated as an assumption about how often that signal
   * appears when the answer is WRONG, so the numbers can be argued with:
   *
   *   independent agreeing derivation   a wrong answer is reproduced by a
   *                                     genuinely different method <= 1/4 of
   *                                     the time                  -> +ln 4 each
   *   disagreeing derivation            -> -ln 4 each
   *   verifier passed / failed          a relevant check passes on a wrong
   *                                     answer <= 1/3 of the time -> +ln 3 / -ln 6
   *   contradiction                     -> -ln 20 each
   *   unsupported assumption            -> -ln 1.5 each
   *   cross-validation wins/trials      held-out reconstruction   -> +ln 3 per win, -ln 3 per loss
   *   margin over the runner-up (bits)  -> +0.25 nat per bit, capped at 2 nats
   *
   * Prior log-odds 0 (a lone derivation is a coin flip until checked). The
   * probability is then scaled by knowledge completeness (the fraction of
   * required facts actually available) and by (1 - residual uncertainty),
   * and clipped to [0.01, 0.99]: nothing here is ever certain. */
  function calibrate(sig) {
    sig = sig || {};
    var z = 0.0, terms = {};
    function add(name, v) { if (v) { terms[name] = Math.round(v * 1000) / 1000; z += v; } }
    var agree = Math.max(0, (sig.derivations || 1) - 1);
    add("derivations", agree * Math.log(4));
    add("disagreements", -(sig.disagreements || 0) * Math.log(4));
    add("verifiers", (sig.verifierPass || 0) * Math.log(3) - ((sig.verifierTotal || 0) - (sig.verifierPass || 0)) * Math.log(6));
    add("contradictions", -(sig.contradictions || 0) * Math.log(20));
    add("assumptions", -(sig.assumptions || 0) * Math.log(1.5));
    if (sig.cvTrials) add("crossval", ((sig.cvWins || 0) - (sig.cvTrials - (sig.cvWins || 0))) * Math.log(3));
    if (sig.marginBits) add("margin", Math.min(2.0, 0.25 * sig.marginBits));
    var p = 1 / (1 + Math.exp(-z));
    var kc = sig.knowledgeCompleteness === undefined ? 1 : Math.max(0, Math.min(1, sig.knowledgeCompleteness));
    var ru = sig.residualUncertainty === undefined ? 0 : Math.max(0, Math.min(1, sig.residualUncertainty));
    p = p * kc * (1 - ru);
    p = Math.max(0.01, Math.min(0.99, p));
    return { confidence: Math.round(p * 1000) / 1000, logOdds: Math.round(z * 1000) / 1000, terms: terms };
  }

  /* --------------------------------------------------------- reasoning graph
   *
   * Propositions with an explicit epistemic status. The graph distinguishes
   * a fact that was given (KNOWN), one that was derived (DERIVED, with its
   * rule and premises), one that was assumed to make progress (ASSUMED), one
   * that is needed but unavailable (UNKNOWN), and one that has been refuted
   * (CONTRADICTED). Perception, language parsing and calculation all write
   * into the same graph, so a visual fact and a stated fact are used alike. */
  function ReasoningGraph() {
    this.props = new Map();
    this.order = [];
  }
  function negKey(k) { return k.indexOf("not:") === 0 ? k.slice(4) : "not:" + k; }
  ReasoningGraph.prototype.get = function (k) { return this.props.get(k) || null; };
  ReasoningGraph.prototype._put = function (k, rec) {
    if (!this.props.has(k)) this.order.push(k);
    this.props.set(k, rec);
    var opp = this.props.get(negKey(k));
    if (opp && opp.status !== STATUS.UNKNOWN && rec.status !== STATUS.UNKNOWN &&
        opp.status !== STATUS.CONTRADICTED) {
      /* the weaker of the two is contradicted; given facts beat derivations,
         derivations beat assumptions */
      var rank = { KNOWN: 3, DERIVED: 2, ASSUMED: 1 };
      var loser = (rank[rec.status] || 0) > (rank[opp.status] || 0) ? opp : rec;
      loser.status = STATUS.CONTRADICTED;
      loser.contradictedBy = loser === rec ? negKey(k) : k;
    }
    return rec;
  };
  ReasoningGraph.prototype.know = function (k, meta) {
    return this._put(k, { key: k, status: STATUS.KNOWN, source: meta && meta.source || "given", meta: meta || {} });
  };
  ReasoningGraph.prototype.assume = function (k, why) {
    return this._put(k, { key: k, status: STATUS.ASSUMED, why: why || "", meta: {} });
  };
  ReasoningGraph.prototype.need = function (k, why) {
    if (this.props.has(k) && this.props.get(k).status !== STATUS.UNKNOWN) return this.props.get(k);
    return this._put(k, { key: k, status: STATUS.UNKNOWN, why: why || "", meta: {} });
  };
  /* A derivation is only as good as its premises: from a contradicted or
     unknown premise nothing is derived. */
  ReasoningGraph.prototype.derive = function (k, premises, rule, meta) {
    var self = this, weakest = STATUS.KNOWN, i;
    for (i = 0; i < premises.length; i++) {
      var p = self.props.get(premises[i]);
      if (!p || p.status === STATUS.UNKNOWN || p.status === STATUS.CONTRADICTED) return null;
      if (p.status === STATUS.ASSUMED) weakest = STATUS.ASSUMED;
    }
    return this._put(k, { key: k, status: STATUS.DERIVED, rule: rule, premises: premises.slice(),
                          dependsOnAssumption: weakest === STATUS.ASSUMED, meta: meta || {} });
  };
  ReasoningGraph.prototype.refute = function (k, why) {
    var p = this.props.get(k);
    if (!p) p = this._put(k, { key: k, status: STATUS.CONTRADICTED, meta: {} });
    p.status = STATUS.CONTRADICTED; p.why = why || p.why;
    /* everything derived from it falls with it */
    var self = this;
    this.order.forEach(function (q) {
      var r = self.props.get(q);
      if (r.status === STATUS.DERIVED && r.premises && r.premises.indexOf(k) >= 0) self.refute(q, "premise " + k + " refuted");
    });
    return p;
  };
  ReasoningGraph.prototype.byStatus = function (s) {
    var self = this;
    return this.order.filter(function (k) { return self.props.get(k).status === s; });
  };
  /* What is wrong, in the FAILURE vocabulary. */
  ReasoningGraph.prototype.diagnose = function () {
    var out = [], unknown = this.byStatus(STATUS.UNKNOWN), contra = this.byStatus(STATUS.CONTRADICTED),
        assumed = this.byStatus(STATUS.ASSUMED);
    if (unknown.length) out.push({ kind: FAILURE.MISSING_KNOWLEDGE, props: unknown });
    if (contra.length) out.push({ kind: FAILURE.CONTRADICTION, props: contra });
    var self = this, leaning = this.byStatus(STATUS.DERIVED).filter(function (k) { return self.props.get(k).dependsOnAssumption; });
    if (assumed.length && leaning.length) out.push({ kind: FAILURE.UNSUPPORTED_ASSUMPTION, props: assumed });
    return out;
  };
  ReasoningGraph.prototype.summary = function () {
    var c = {}, self = this;
    this.order.forEach(function (k) { var s = self.props.get(k).status; c[s] = (c[s] || 0) + 1; });
    return c;
  };

  /* ---------------------------------------------------------- staged beliefs
   *
   * A single observation is a tentative rule, repeated observation makes it a
   * candidate, and a rule that has survived situations where it could have
   * failed becomes persistent. A contradiction demotes it; repeated
   * contradiction retires it. Used by the ARC-3 world model and by the
   * cross-level memory. */
  var STAGES = ["retired", "tentative", "candidate", "persistent"];
  function stageOf(confirm, contradict, challenged) {
    if (contradict > 0 && contradict >= confirm) return "retired";
    var net = confirm - 2 * contradict;
    if (net >= 3 && (challenged || 0) >= 1) return "persistent";
    if (net >= 2) return "candidate";
    if (net >= 1) return "tentative";
    return "retired";
  }
  /* Beta(1,1) posterior mean of "the rule holds", discounted when it has
     never been tested in a situation where it could have failed. */
  function ruleConfidence(confirm, contradict, challenged) {
    var p = (confirm + 1) / (confirm + contradict + 2);
    return (challenged || 0) > 0 ? p : p * 0.8;
  }

  var K = {
    VERSION: "2.0.0",
    STATUS: STATUS, FAILURE: FAILURE, ACTIONS: ACTIONS, MODE_OF: MODE_OF,
    Hypothesis: Hypothesis, derive: derive, mdlScore: mdlScore,
    ASSUMPTION_BITS: ASSUMPTION_BITS, INVARIANT_BITS: INVARIANT_BITS,
    REP_SLACK: REP_SLACK, FRAGILITY_BITS: FRAGILITY_BITS, DEEP_FAIL_BITS: DEEP_FAIL_BITS,
    Frontier: Frontier, MetaController: MetaController, RepairStats: RepairStats, lineagePath: lineagePath,
    survives: survives, refine: refine, compress: compress, discriminate: discriminate, learnWeights: learnWeights,
    calibrate: calibrate, ReasoningGraph: ReasoningGraph,
    STAGES: STAGES, stageOf: stageOf, ruleConfidence: ruleConfidence, log2: log2
  };
  root.C4ReasonKernel = K;
  if (typeof module !== "undefined" && module.exports && !root.__C4_BUNDLED_KERNEL) module.exports = K;
})(typeof window !== "undefined" ? window : globalThis);
