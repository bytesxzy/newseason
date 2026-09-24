/* CELL4 reasoning memory.
 *
 * Not chat memory (that is c4-lm-memory.js). This is what a reasoner keeps
 * about its OWN reasoning, in five stores with different lifetimes:
 *
 *   WorkingMemory      one episode: current hypotheses, confirmed facts, open
 *                      questions, contradictions, the current representation,
 *                      the plan so far, the current residual and the recent
 *                      operations that failed. Discarded with the episode
 *                      after compact() has summarised it.
 *   EpisodicMemory     compressed episodes: problem signature, representation
 *                      sequence, failed branches, the successful branch,
 *                      counterexamples, operations, cost, outcome. Bounded
 *                      FIFO; never stores an answer to reuse as a shortcut
 *                      (record() drops any field named like one).
 *   SemanticMemory     domain-independent facts that were verified through a
 *                      permitted source, with provenance and confidence. For
 *                      ARC these are abstract mechanisms ("keys open doors"),
 *                      never literal grids.
 *   ProceduralMemory   "after residual X in representation Y, operation Z
 *                      tended to help": success counts with Laplace-smoothed
 *                      log-odds priors, the table a controller reads.
 *   AbstractionMemory  learned reusable schemas (ARC macros, reasoning
 *                      templates) with the bookkeeping that decides whether
 *                      they stay: support, failures, training and held-out
 *                      utility, description-length gain, lineage, version.
 *
 * compact(trace) turns a long reasoning trace into CONFIRMED / UNRESOLVED /
 * REFUTED / CURRENT PLAN / REUSABLE ABSTRACTIONS / IMPORTANT COUNTEREXAMPLES,
 * each item with its provenance. Compression never rewrites a confirmed fact:
 * a confirmed item can only be moved to REFUTED by an explicit refutation
 * that is itself recorded.
 *
 * Deterministic, local, bounded; no network, no external model.
 */
(function (root) {
  "use strict";
  /* One instance per page/process: the ARC bundle embeds this file and the
     language stack loads it standalone; whichever loads second reuses the
     first so ARC and the LM share one C4ReasonMemory (and its state). */
  if (root.C4ReasonMemory && root.C4ReasonMemory.VERSION === "1.0.0") {
    if (typeof module !== "undefined" && module.exports && !root.__C4_BUNDLED_KERNEL) module.exports = root.C4ReasonMemory;
    return;
  }

  function clip(a, n) { return a.length > n ? a.slice(a.length - n) : a; }
  function now() { return Date.now(); }

  /* Field names that would turn an episode into an answer cache. */
  var FORBIDDEN = { answer: 1, answers: 1, output: 1, outputs: 1, testOutput: 1, test_output: 1,
                    prediction: 1, predictions: 1, solution_grid: 1, label: 1, labels: 1 };
  function scrub(o, depth) {
    if (!o || typeof o !== "object" || (depth || 0) > 4) return o;
    if (Array.isArray(o)) return o.map(function (v) { return scrub(v, (depth || 0) + 1); });
    var out = {}, k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k) && !FORBIDDEN[k]) out[k] = scrub(o[k], (depth || 0) + 1);
    return out;
  }

  /* ---------------------------------------------------------- working memory */

  function WorkingMemory(o) {
    o = o || {};
    this.episodeId = o.episodeId || null;
    this.domain = o.domain || "";
    this.hypotheses = [];          /* ids currently in play (bounded) */
    this.facts = new Map();        /* key -> {status, provenance, t} */
    this.questions = [];           /* open questions */
    this.contradictions = [];
    this.representation = null;
    this.plan = [];                /* operations taken, in order */
    this.residual = null;
    this.failed = [];              /* recent operations with no gain */
    this.counterexamples = [];
    this.abstractions = [];
    this.cap = o.cap || 64;
    this._t = 0;
  }
  WorkingMemory.prototype._stamp = function () { return ++this._t; };
  WorkingMemory.prototype.hold = function (id) {
    if (this.hypotheses.indexOf(id) < 0) this.hypotheses = clip(this.hypotheses.concat([id]), this.cap);
  };
  /* A fact that passed its verifier. */
  WorkingMemory.prototype.confirm = function (key, provenance) {
    var cur = this.facts.get(key);
    if (cur && cur.status === "REFUTED") return cur;            /* refutation is sticky */
    var rec = { key: key, status: "CONFIRMED", provenance: provenance || null, t: this._stamp() };
    this.facts.set(key, rec);
    return rec;
  };
  /* Explicit refutation, with its reason kept: the only way a confirmed item
     changes status. */
  WorkingMemory.prototype.refute = function (key, why) {
    var cur = this.facts.get(key);
    var rec = { key: key, status: "REFUTED", provenance: cur ? cur.provenance : null, why: why || "",
                was: cur ? cur.status : null, t: this._stamp() };
    this.facts.set(key, rec);
    this.contradictions = clip(this.contradictions.concat([{ key: key, why: why || "" }]), this.cap);
    return rec;
  };
  WorkingMemory.prototype.question = function (text, detail) {
    for (var i = 0; i < this.questions.length; i++) if (this.questions[i].text === text) { this.questions[i].detail = detail; return; }
    this.questions = clip(this.questions.concat([{ text: text, detail: detail || null, t: this._stamp() }]), 16);
  };
  WorkingMemory.prototype.resolve = function (text) {
    this.questions = this.questions.filter(function (q) { return q.text !== text; });
  };
  WorkingMemory.prototype.counterexample = function (key, ce) {
    this.counterexamples = clip(this.counterexamples.concat([{ key: key, ce: ce, t: this._stamp() }]), 16);
  };
  WorkingMemory.prototype.abstraction = function (a) {
    this.abstractions = clip(this.abstractions.concat([a]), 16);
  };
  /* One reasoning operation and its outcome. */
  WorkingMemory.prototype.step = function (s) {
    this.plan = clip(this.plan.concat([s.action]), 128);
    if (s.repr) this.representation = s.repr;
    if (s.residual !== undefined) this.residual = s.residual;
    if (!(s.gain > 0)) this.failed = clip(this.failed.concat([{ action: s.action, parent: s.parent, t: this._stamp() }]), 8);
    if (s.parent) this.hold(s.parent);
  };
  /* How many of the last n operations were ``action`` and gained nothing. */
  WorkingMemory.prototype.recentFailures = function (action, n) {
    var recent = this.failed.slice(-Math.max(1, n || 4));
    return recent.filter(function (f) { return !action || f.action === action; }).length;
  };
  WorkingMemory.prototype.byStatus = function (s) {
    var out = [];
    this.facts.forEach(function (v) { if (v.status === s) out.push(v); });
    return out.sort(function (a, b) { return a.t - b.t; });
  };
  WorkingMemory.prototype.compact = function () {
    return compact({
      facts: Array.from(this.facts.values()), questions: this.questions, plan: this.plan,
      abstractions: this.abstractions, counterexamples: this.counterexamples,
      representation: this.representation, residual: this.residual, contradictions: this.contradictions
    });
  };

  /* ------------------------------------------------------------- compaction
   *
   * Input: {facts:[{key,status,provenance,why?}], questions, plan,
   * abstractions, counterexamples, ...} or a flat list of trace steps
   * {kind: "confirm"|"refute"|"question"|"resolve"|"step"|"abstraction"|
   *  "counterexample", ...}. Output sections are bounded; everything keeps
   * its provenance. A key confirmed and later refuted appears in REFUTED
   * with the confirmation recorded under ``was`` -- never silently dropped
   * or rewritten. */
  function compact(trace, opts) {
    opts = opts || {};
    var cap = opts.cap || 24;
    var facts = new Map(), questions = [], plan = [], abstractions = [], ces = [];
    function apply(s) {
      if (!s) return;
      if (s.kind === "confirm") {
        var cur = facts.get(s.key);
        if (!cur || cur.status !== "REFUTED") facts.set(s.key, { key: s.key, status: "CONFIRMED", provenance: s.provenance || null });
      } else if (s.kind === "refute") {
        var prev = facts.get(s.key);
        facts.set(s.key, { key: s.key, status: "REFUTED", provenance: prev ? prev.provenance : (s.provenance || null),
                           why: s.why || "", was: prev ? prev.status : null });
      } else if (s.kind === "question") questions.push({ text: s.text, detail: s.detail || null });
      else if (s.kind === "resolve") questions = questions.filter(function (q) { return q.text !== s.text; });
      else if (s.kind === "step") plan.push(s.action);
      else if (s.kind === "abstraction") abstractions.push(s.abstraction || s);
      else if (s.kind === "counterexample") ces.push({ key: s.key, ce: s.ce || null });
    }
    if (Array.isArray(trace)) trace.forEach(apply);
    else if (trace) {
      (trace.facts || []).forEach(function (f) { facts.set(f.key, { key: f.key, status: f.status, provenance: f.provenance || null, why: f.why, was: f.was }); });
      questions = (trace.questions || []).slice();
      plan = (trace.plan || []).slice();
      abstractions = (trace.abstractions || []).slice();
      ces = (trace.counterexamples || []).slice();
    }
    var confirmed = [], refuted = [];
    facts.forEach(function (f) { (f.status === "REFUTED" ? refuted : f.status === "CONFIRMED" ? confirmed : []).push(f); });
    /* run-length encode the plan: a trace of 200 operations compresses to
       its shape ("REFINE_BEST x12, PROPOSE_REPRESENTATION, ...") */
    var rle = [];
    plan.forEach(function (a) {
      var last = rle[rle.length - 1];
      if (last && last.action === a) last.n++; else rle.push({ action: a, n: 1 });
    });
    return {
      CONFIRMED: confirmed.slice(0, cap),
      UNRESOLVED: questions.slice(-cap),
      REFUTED: refuted.slice(0, cap),
      CURRENT_PLAN: rle.slice(-cap).map(function (r) { return r.n > 1 ? r.action + " x" + r.n : r.action; }),
      REUSABLE_ABSTRACTIONS: abstractions.slice(0, cap),
      IMPORTANT_COUNTEREXAMPLES: ces.slice(0, cap),
      sizes: { facts: facts.size, plan: plan.length, compressedPlan: rle.length }
    };
  }

  /* --------------------------------------------------------- episodic memory */

  function EpisodicMemory(o) {
    o = o || {};
    this.cap = o.cap || 256;
    this.episodes = [];
  }
  EpisodicMemory.prototype.record = function (ep) {
    var e = scrub(ep);
    e.recorded = this.episodes.length;
    this.episodes.push(e);
    if (this.episodes.length > this.cap) this.episodes.shift();
    return e;
  };
  /* Episodes whose signature overlaps ``sig`` (Jaccard over string tags). */
  EpisodicMemory.prototype.similar = function (sig, k) {
    var q = new Set(sig || []), out = [];
    this.episodes.forEach(function (e) {
      var s = e.signature || [], inter = 0, i;
      for (i = 0; i < s.length; i++) if (q.has(s[i])) inter++;
      var uni = q.size + s.length - inter;
      if (inter) out.push([inter / uni, e]);
    });
    out.sort(function (a, b) { return (b[0] - a[0]) || (a[1].recorded - b[1].recorded); });
    return out.slice(0, k || 5).map(function (x) { return { sim: x[0], episode: x[1] }; });
  };
  EpisodicMemory.prototype.summary = function () {
    var out = { episodes: this.episodes.length, exact: 0, byDomain: {} };
    this.episodes.forEach(function (e) {
      if (e.outcome === "exact") out.exact++;
      out.byDomain[e.domain || "?"] = (out.byDomain[e.domain || "?"] || 0) + 1;
    });
    return out;
  };
  EpisodicMemory.prototype.toJSON = function () { return { cap: this.cap, episodes: this.episodes }; };

  /* --------------------------------------------------------- semantic memory */

  function SemanticMemory() { this.facts = new Map(); }
  /* A fact enters only with provenance; confidence accumulates as evidence
     (confirm/contradict counts), never by assertion. */
  SemanticMemory.prototype.add = function (key, value, provenance) {
    if (!provenance) throw new Error("semantic facts need provenance");
    var cur = this.facts.get(key);
    if (!cur) { cur = { key: key, value: value, confirm: 0, contradict: 0, sources: [] }; this.facts.set(key, cur); }
    if (JSON.stringify(cur.value) !== JSON.stringify(value)) { cur.contradict++; cur.conflict = value; }
    else cur.confirm++;
    if (cur.sources.indexOf(provenance) < 0) cur.sources = clip(cur.sources.concat([provenance]), 8);
    return cur;
  };
  SemanticMemory.prototype.contradict = function (key, provenance) {
    var cur = this.facts.get(key);
    if (cur) { cur.contradict++; if (provenance) cur.sources = clip(cur.sources.concat(["-" + provenance]), 8); }
    return cur || null;
  };
  SemanticMemory.prototype.get = function (key) {
    var f = this.facts.get(key);
    if (!f) return null;
    return { key: key, value: f.value, confidence: (f.confirm + 1) / (f.confirm + f.contradict + 2),
             confirm: f.confirm, contradict: f.contradict, sources: f.sources.slice() };
  };
  SemanticMemory.prototype.keys = function () { return Array.from(this.facts.keys()); };
  SemanticMemory.prototype.toJSON = function () { return Array.from(this.facts.values()); };
  SemanticMemory.fromJSON = function (rows) {
    var m = new SemanticMemory();
    (rows || []).forEach(function (r) { m.facts.set(r.key, { key: r.key, value: r.value, confirm: r.confirm || 0, contradict: r.contradict || 0, sources: r.sources || [] }); });
    return m;
  };

  /* ------------------------------------------------------- procedural memory */

  function ProceduralMemory(data) {
    this.t = {};
    if (data && data.table) for (var k in data.table) if (Object.prototype.hasOwnProperty.call(data.table, k))
      this.t[k] = [data.table[k][0], data.table[k][1]];
  }
  function pkey(residual, repr, op) { return (residual || "*") + "|" + (repr || "*") + "|" + op; }
  ProceduralMemory.prototype.observe = function (residual, repr, op, success) {
    var keys = [pkey(residual, repr, op), pkey(residual, null, op), pkey(null, repr, op), pkey(null, null, op)], i;
    for (i = 0; i < keys.length; i++) {
      var r = this.t[keys[i]] || (this.t[keys[i]] = [0, 0]);
      r[1]++; if (success) r[0]++;
    }
  };
  /* Laplace-smoothed log-odds that ``op`` helps in (residual, repr), backing
     off to less specific contexts when the specific one is thin. */
  ProceduralMemory.prototype.prior = function (residual, repr, op, minCount) {
    var keys = [pkey(residual, repr, op), pkey(residual, null, op), pkey(null, repr, op), pkey(null, null, op)], i;
    minCount = minCount || 4;
    for (i = 0; i < keys.length; i++) {
      var r = this.t[keys[i]];
      if (r && r[1] >= minCount) return Math.log((r[0] + 1) / (r[1] - r[0] + 1));
    }
    return 0;
  };
  ProceduralMemory.prototype.rank = function (residual, repr, ops) {
    var self = this;
    return ops.slice().sort(function (a, b) { return (self.prior(residual, repr, b) - self.prior(residual, repr, a)) || (a < b ? -1 : 1); });
  };
  ProceduralMemory.prototype.toJSON = function () { return { table: this.t }; };

  /* ------------------------------------------------------ abstraction memory */

  var ABS_FIELDS = ["id", "domain", "type", "template", "params", "preconditions", "representation",
                    "support", "failures", "trainUtility", "heldoutUtility", "mdlGain", "lineage", "version"];
  function AbstractionMemory() { this.items = new Map(); }
  AbstractionMemory.prototype.propose = function (a) {
    if (!a || !a.id) throw new Error("abstraction needs an id");
    var cur = this.items.get(a.id), rec = {}, i;
    for (i = 0; i < ABS_FIELDS.length; i++) rec[ABS_FIELDS[i]] = a[ABS_FIELDS[i]] === undefined ? null : a[ABS_FIELDS[i]];
    rec.support = +a.support || 0; rec.failures = +a.failures || 0;
    rec.version = cur ? (cur.version || 1) + 1 : (a.version || 1);
    rec.lineage = (cur && cur.lineage ? cur.lineage : []).concat(a.lineage ? [].concat(a.lineage) : []);
    rec.status = a.status || (cur ? cur.status : "candidate");
    this.items.set(a.id, rec);
    return rec;
  };
  AbstractionMemory.prototype.use = function (id, success) {
    var r = this.items.get(id);
    if (!r) return null;
    if (success) r.support++; else r.failures++;
    return r;
  };
  /* The acceptance rule: an abstraction stays active only while it has
     earned it -- enough support, positive compression, held-out utility not
     negative, and failures not concentrated. */
  AbstractionMemory.prototype.judge = function (id, opts) {
    opts = opts || {};
    var r = this.items.get(id);
    if (!r) return null;
    var minSupport = opts.minSupport || 3;
    var ok = r.support >= minSupport && (r.mdlGain || 0) > 0 && (r.heldoutUtility === null || r.heldoutUtility >= 0) &&
             r.failures <= Math.max(2, r.support);
    r.status = ok ? "active" : (r.status === "active" ? "retired" : "rejected");
    return r.status;
  };
  AbstractionMemory.prototype.active = function (domain) {
    var out = [];
    this.items.forEach(function (r) { if (r.status === "active" && (!domain || r.domain === domain)) out.push(r); });
    return out.sort(function (a, b) { return (b.mdlGain || 0) - (a.mdlGain || 0) || (a.id < b.id ? -1 : 1); });
  };
  AbstractionMemory.prototype.all = function () { return Array.from(this.items.values()); };
  AbstractionMemory.prototype.toJSON = function () { return this.all(); };
  AbstractionMemory.fromJSON = function (rows) {
    var m = new AbstractionMemory();
    (rows || []).forEach(function (r) { m.items.set(r.id, r); });
    return m;
  };

  /* A process-wide store shared by every domain adapter that runs in this
     page or process (ARC engine, ARC-3 agent, language deliberation). The
     domains share metacognition through it, not domain content. */
  var SHARED = { episodic: new EpisodicMemory({ cap: 512 }), procedural: new ProceduralMemory(),
                 semantic: new SemanticMemory(), abstractions: new AbstractionMemory() };

  var M = {
    VERSION: "1.0.0",
    WorkingMemory: WorkingMemory, EpisodicMemory: EpisodicMemory, SemanticMemory: SemanticMemory,
    ProceduralMemory: ProceduralMemory, AbstractionMemory: AbstractionMemory,
    compact: compact, scrub: scrub, shared: SHARED
  };
  root.C4ReasonMemory = M;
  if (typeof module !== "undefined" && module.exports && !root.__C4_BUNDLED_KERNEL) module.exports = M;
})(typeof window !== "undefined" ? window : globalThis);
