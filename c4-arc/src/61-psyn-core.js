/* ===== src/61-psyn-core.js ===== */
/* Constrained partial-program synthesis: the shared core.
 *
 * Programs here are NOT required to be complete. A PartialProgram is a typed tree whose unresolved positions are
 * Holes. Each hole carries a Domain (the values still possible), and every demonstration shrinks domains instead of
 * enumerating completions. Three things are kept apart on purpose:
 *
 *   structure   Node trees with operator names and typed slots (this file)
 *   knowledge   domains and constraints on the holes (this file, filled by inverse semantics in 63/64)
 *   evidence    execution results, residuals, traces (65, 66)
 *
 * Canonicalisation rewrites a tree to a normal form BEFORE anything is executed, and a semantic store maps behaviour
 * fingerprints to equivalence classes, so equivalent programs are executed once. Every proposal passes through
 * `Accounts` (raw / syntactic duplicate / semantic duplicate / new class / concrete execution), which is what the
 * duplicate-rate numbers in the report come from.
 */

var PSYN = (function () {
  /* ------------------------------------------------------------------ accounting */
  function Accounts() {
    this.raw = 0; this.syntactic = 0; this.semantic = 0; this.classes = 0; this.executions = 0;
    this.pruned_abstract = 0; this.pruned_inverse = 0; this.inverse_applied = 0; this.domain_shrinks = 0;
    this.vs_member_estimate = 0; this.vs_collapsed = 0; this.nodes = 0; this.holes_bound = 0;
    this.parses_tried = 0; this.parses_pruned = 0; this.stage_chains = 0;
  }
  Accounts.prototype.dupRate = function () {
    return this.raw ? (this.syntactic + this.semantic) / this.raw : 0;
  };
  Accounts.prototype.toJSON = function () {
    var o = {}, k;
    for (k in this) if (this.hasOwnProperty(k) && typeof this[k] === "number") o[k] = this[k];
    o.dup_rate = Math.round(this.dupRate() * 1000) / 1000;
    return o;
  };

  /* ------------------------------------------------------------------ bit sets over small universes */
  var Bits = {
    make: function (n) { return new Int32Array((n + 31) >> 5); },
    set: function (b, i) { b[i >> 5] |= (1 << (i & 31)); },
    get: function (b, i) { return (b[i >> 5] >>> (i & 31)) & 1; },
    and: function (a, b) { var o = new Int32Array(a.length), i; for (i = 0; i < a.length; i++) o[i] = a[i] & b[i]; return o; },
    or: function (a, b) { var o = new Int32Array(a.length), i; for (i = 0; i < a.length; i++) o[i] = a[i] | b[i]; return o; },
    andNot: function (a, b) { var o = new Int32Array(a.length), i; for (i = 0; i < a.length; i++) o[i] = a[i] & ~b[i]; return o; },
    count: function (a) {
      var n = 0, i, x;
      for (i = 0; i < a.length; i++) { x = a[i]; x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); n += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
      return n;
    },
    isZero: function (a) { var i; for (i = 0; i < a.length; i++) if (a[i]) return false; return true; },
    subset: function (a, b) { var i; for (i = 0; i < a.length; i++) if (a[i] & ~b[i]) return false; return true; },
    equals: function (a, b) { var i; for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; },
    full: function (n) { var b = new Int32Array((n + 31) >> 5), i; for (i = 0; i < n; i++) b[i >> 5] |= (1 << (i & 31)); return b; },
    key: function (a) { return Array.prototype.join.call(a, "."); },
    andCount: function (a, b) {
      var n = 0, i, x;
      for (i = 0; i < a.length; i++) { x = a[i] & b[i]; if (x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); n += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; } }
      return n;
    },
    anyAnd: function (a, b) { var i; for (i = 0; i < a.length; i++) if (a[i] & b[i]) return true; return false; },
    hash: function (a) { var h = 2166136261, i; for (i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; },
    list: function (a, n) { var o = [], i; for (i = 0; i < n; i++) if ((a[i >> 5] >>> (i & 31)) & 1) o.push(i); return o; }
  };

  /* ------------------------------------------------------------------ domains */
  /* A Domain is the set of values a hole may still take. 'finite' domains list their members with a key function so
     intersection is exact; 'any' is the unconstrained top; 'empty' is the bottom (the partial program is dead). */
  var Dom = {
    any: function () { return { kind: "any" }; },
    empty: function () { return { kind: "empty" }; },
    finite: function (items, keyFn) {
      var kf = keyFn || function (x) { return String(x); }, seen = {}, out = [], i, k;
      for (i = 0; i < items.length; i++) { k = kf(items[i]); if (!seen[k]) { seen[k] = 1; out.push(items[i]); } }
      return out.length ? { kind: "finite", items: out, keyFn: kf, keys: seen } : Dom.empty();
    },
    size: function (d) { return d.kind === "any" ? Infinity : d.kind === "empty" ? 0 : d.items.length; },
    isEmpty: function (d) { return d.kind === "empty"; },
    intersect: function (a, b) {
      if (a.kind === "empty" || b.kind === "empty") return Dom.empty();
      if (a.kind === "any") return b;
      if (b.kind === "any") return a;
      var out = [], i;
      for (i = 0; i < a.items.length; i++) if (b.keys[a.keyFn(a.items[i])]) out.push(a.items[i]);
      return Dom.finite(out, a.keyFn);
    },
    singleton: function (d) { return d.kind === "finite" && d.items.length === 1 ? d.items[0] : undefined; }
  };

  /* ------------------------------------------------------------------ tree nodes and holes */
  var HOLE_SEQ = 0;
  function Hole(ty, dom, meta) { this.id = "?" + ty + (HOLE_SEQ++); this.ty = ty; this.dom = dom || Dom.any(); this.meta = meta || {}; }
  Hole.prototype.isHole = true;
  function Node(op, args, meta) { this.op = op; this.args = args || []; this.meta = meta || {}; }
  Node.prototype.isNode = true;
  function isHole(x) { return !!(x && x.isHole); }
  function isNode(x) { return !!(x && x.isNode); }

  function render(x) {
    if (isHole(x)) {
      var s = Dom.size(x.dom);
      return x.id + (s === Infinity ? "" : "{" + s + "}");
    }
    if (isNode(x)) return x.op + "(" + x.args.map(render).join(",") + ")";
    if (Array.isArray(x)) return "[" + x.map(render).join(",") + "]";
    return String(x);
  }

  /* ------------------------------------------------------------------ canonicalisation */
  /* The eight square symmetries as a group: element index = 4*flip + rotation. compose(a,b) = apply b then a. */
  var D4_NAMES = ["id", "rot90", "rot180", "rot270", "flipH", "flipH.rot90", "flipH.rot180", "flipH.rot270"];
  function d4Compose(a, b) {
    /* element e = 4f + r denotes g -> flipH^f(rot90^r(g)). a after b: F^fa R^ra F^fb R^rb = F^(fa^fb) R^(+-ra + rb),
       because rotating a mirrored grid by k equals mirroring the grid rotated by -k. */
    var fa = a >> 2, ra = a & 3, fb = b >> 2, rb = b & 3;
    var r = ((fb ? -ra : ra) + rb) % 4;
    return (fa ^ fb) * 4 + (r < 0 ? r + 4 : r);
  }
  var D4_OF = { "id": 0, "rot90": 1, "rot180": 2, "rot270": 3, "flipH": 4, "flipV": 6, "transpose": 5, "anti_transpose": 7 };
  /* flipH.rot90 etc. are an implementation detail; named ops map through the table below, verified numerically by
     `selfCheck` against the grid functions so the algebra cannot silently drift from G. */
  var D4_GRID = null;
  function d4Apply(i, g) {
    if (!D4_GRID) D4_GRID = [function (x) { return x; }, G.rot90, G.rot180, G.rot270, G.flipH,
      function (x) { return G.flipH(G.rot90(x)); }, function (x) { return G.flipH(G.rot180(x)); }, function (x) { return G.flipH(G.rot270(x)); }];
    return D4_GRID[i](g);
  }
  /* find, by brute force on an asymmetric probe, which element a grid function realises */
  function d4Index(fn) {
    var probe = [[1, 2, 3], [4, 5, 6]], want = fn(probe), i;
    for (i = 0; i < 8; i++) if (G.gEq(d4Apply(i, probe), want)) return i;
    return -1;
  }

  /* Rewrite rules are (match -> replacement) on nodes, applied bottom-up to a fixpoint. They never change behaviour;
     `selfCheck` in the tests executes both sides on random grids. */
  var RULES = [];
  function rule(name, fn) { RULES.push({ name: name, fn: fn }); }

  /* Compose(a, Compose(b, c)) -> Compose(a, b, c); Compose(x) -> x; identity removal */
  rule("compose-flatten", function (n) {
    if (n.op !== "Compose") return null;
    var out = [], changed = false, i, a;
    for (i = 0; i < n.args.length; i++) {
      a = n.args[i];
      if (isNode(a) && a.op === "Compose") { out = out.concat(a.args); changed = true; }
      else if (isNode(a) && a.op === "Id") changed = true;
      else out.push(a);
    }
    if (out.length === 1) return out[0];
    if (!out.length) return new Node("Id", []);
    return changed ? new Node("Compose", out) : null;
  });
  /* adjacent dihedral elements fuse into one element: Rot90(Rot90(x)) -> Rot180(x), FlipH(FlipH(x)) -> x */
  rule("d4-fuse", function (n) {
    if (n.op !== "Compose") return null;
    var out = [], i, a, last, fused = false;
    for (i = 0; i < n.args.length; i++) {
      a = n.args[i]; last = out[out.length - 1];
      if (isNode(a) && a.op === "D4" && last && isNode(last) && last.op === "D4") {
        out[out.length - 1] = new Node("D4", [d4Compose(a.args[0], last.args[0])]); fused = true;
      } else out.push(a);
    }
    return fused ? new Node("Compose", out) : null;
  });
  rule("d4-identity", function (n) { return n.op === "D4" && n.args[0] === 0 ? new Node("Id", []) : null; });
  /* Translate(Translate(x,a),b) -> Translate(x,a+b) */
  rule("translate-fuse", function (n) {
    if (n.op !== "Compose") return null;
    var out = [], i, a, last, fused = false;
    for (i = 0; i < n.args.length; i++) {
      a = n.args[i]; last = out[out.length - 1];
      if (isNode(a) && a.op === "Translate" && last && isNode(last) && last.op === "Translate" &&
          typeof a.args[0] === "number" && typeof last.args[0] === "number") {
        out[out.length - 1] = new Node("Translate", [a.args[0] + last.args[0], a.args[1] + last.args[1]]); fused = true;
      } else out.push(a);
    }
    return fused ? new Node("Compose", out) : null;
  });
  rule("translate-zero", function (n) { return n.op === "Translate" && n.args[0] === 0 && n.args[1] === 0 ? new Node("Id", []) : null; });
  /* Recolor chains: a->b then b->c is a->c; a->a is identity (colour maps are arrays of [from,to] pairs) */
  rule("recolor-chain", function (n) {
    if (n.op !== "Compose") return null;
    var out = [], i, a, last, fused = false;
    for (i = 0; i < n.args.length; i++) {
      a = n.args[i]; last = out[out.length - 1];
      if (isNode(a) && a.op === "Recolor" && last && isNode(last) && last.op === "Recolor" &&
          typeof a.args[0] === "number" && typeof last.args[0] === "number" && typeof a.args[1] === "number" && typeof last.args[1] === "number" &&
          last.args[1] === a.args[0]) {
        out[out.length - 1] = new Node("Recolor", [last.args[0], a.args[1]]); fused = true;
      } else out.push(a);
    }
    return fused ? new Node("Compose", out) : null;
  });
  rule("recolor-noop", function (n) { return n.op === "Recolor" && typeof n.args[0] === "number" && n.args[0] === n.args[1] ? new Node("Id", []) : null; });
  /* And/Or: flatten, sort, dedupe; Select(Select(x,P),Q) -> Select(x, And(P,Q)) */
  rule("bool-normal", function (n) {
    if (n.op !== "And" && n.op !== "Or") return null;
    var flat = [], i, a;
    for (i = 0; i < n.args.length; i++) { a = n.args[i]; if (isNode(a) && a.op === n.op) flat = flat.concat(a.args); else flat.push(a); }
    var keyed = flat.map(function (x) { return [render(x), x]; });
    keyed.sort(function (p, q) { return p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0; });
    var out = [], seen = {};
    for (i = 0; i < keyed.length; i++) if (!seen[keyed[i][0]]) { seen[keyed[i][0]] = 1; out.push(keyed[i][1]); }
    if (out.length === 1) return out[0];
    var same = out.length === n.args.length;
    if (same) for (i = 0; i < out.length; i++) if (out[i] !== n.args[i]) { same = false; break; }
    return same ? null : new Node(n.op, out);
  });
  rule("select-fuse", function (n) {
    if (n.op !== "Select" || !isNode(n.args[0]) || n.args[0].op !== "Select") return null;
    return new Node("Select", [n.args[0].args[0], new Node("And", [n.args[0].args[1], n.args[1]])]);
  });
  rule("map-identity", function (n) { return n.op === "Map" && isNode(n.args[0]) && n.args[0].op === "Id" ? n.args[1] : null; });

  function canon(x) {
    if (!isNode(x)) return x;
    var args = x.args.map(canon), n = new Node(x.op, args, x.meta), i, changed = true, r, guard = 0;
    while (changed && guard++ < 24) {
      changed = false;
      for (i = 0; i < RULES.length; i++) {
        r = RULES[i].fn(n);
        if (r) { n = isNode(r) ? (r === n ? n : new Node(r.op, r.args.map(canon), r.meta)) : r; changed = true; if (!isNode(n)) return n; }
      }
    }
    return n;
  }

  /* ------------------------------------------------------------------ partial programs */
  function PP(root, opts) {
    opts = opts || {};
    this.root = root;
    this.holes = {};            /* id -> Hole, collected from root */
    this.facts = opts.facts || {};   /* abstract properties known about the program's behaviour */
    this.constraints = opts.constraints || [];
    this.prov = opts.prov || [];
    this.cost = opts.cost || 0;
    this._collect(root);
  }
  PP.prototype._collect = function (x) {
    var i;
    if (isHole(x)) this.holes[x.id] = x;
    else if (isNode(x)) for (i = 0; i < x.args.length; i++) this._collect(x.args[i]);
    else if (Array.isArray(x)) for (i = 0; i < x.length; i++) this._collect(x[i]);
  };
  PP.prototype.open = function () {
    var out = [], k;
    for (k in this.holes) if (this.holes.hasOwnProperty(k)) out.push(this.holes[k]);
    return out;
  };
  PP.prototype.isClosed = function () { return this.open().length === 0; };
  PP.prototype.dead = function () { var k; for (k in this.holes) if (this.holes.hasOwnProperty(k) && Dom.isEmpty(this.holes[k].dom)) return true; return false; };
  /* narrow a hole's domain; returns a new program (structure shared) or null when the domain becomes empty */
  PP.prototype.narrow = function (holeId, dom, why) {
    var h = this.holes[holeId];
    if (!h) return this;
    var nd = Dom.intersect(h.dom, dom);
    if (Dom.isEmpty(nd)) return null;
    function subst(x) {
      if (isHole(x)) { if (x.id === holeId) { var nh = new Hole(x.ty, nd, x.meta); nh.id = x.id; return nh; } return x; }
      if (isNode(x)) return new Node(x.op, x.args.map(subst), x.meta);
      if (Array.isArray(x)) return x.map(subst);
      return x;
    }
    var q = new PP(subst(this.root), { facts: this.facts, constraints: this.constraints, prov: this.prov.concat([why || "narrow"]), cost: this.cost });
    return q;
  };
  PP.prototype.bind = function (holeId, value, why) {
    var h = this.holes[holeId];
    if (!h) return this;
    if (h.dom.kind === "finite" && !h.dom.keys[h.dom.keyFn(value)]) return null;
    function subst(x) {
      if (isHole(x)) return x.id === holeId ? value : x;
      if (isNode(x)) return new Node(x.op, x.args.map(subst), x.meta);
      if (Array.isArray(x)) return x.map(subst);
      return x;
    }
    return new PP(subst(this.root), { facts: this.facts, constraints: this.constraints, prov: this.prov.concat([why || "bind"]), cost: this.cost });
  };
  /* lower bound on the description length of any completion: each open hole costs at least log2(domain size) */
  PP.prototype.lowerBound = function () {
    var lb = this.cost, k, s;
    for (k in this.holes) if (this.holes.hasOwnProperty(k)) { s = Dom.size(this.holes[k].dom); lb += (s === Infinity ? 4 : Math.log(Math.max(1, s)) / Math.LN2); }
    return lb;
  };
  PP.prototype.key = function () { return render(canon(this.root)); };
  PP.prototype.toString = function () { return render(this.root); };

  /* ------------------------------------------------------------------ semantic equivalence store */
  function EStore(acct) { this.classes = new Map(); this.syn = new Set(); this.acct = acct; }
  /* register a proposal. Returns {status:'syntactic'|'semantic'|'new', cls} ; `fingerprint` is computed lazily by the
     caller only when the syntactic key is new (it requires executing the program on the probe set). */
  EStore.prototype.admit = function (synKey, fingerprintFn, member) {
    var a = this.acct;
    a.raw++;
    if (this.syn.has(synKey)) { a.syntactic++; return { status: "syntactic" }; }
    this.syn.add(synKey);
    var fp = fingerprintFn();
    a.executions++;
    if (fp === null) return { status: "invalid" };
    var cls = this.classes.get(fp);
    if (cls) { a.semantic++; cls.members.push(member); return { status: "semantic", cls: cls }; }
    cls = { fp: fp, members: [member] };
    this.classes.set(fp, cls);
    a.classes++;
    return { status: "new", cls: cls };
  };

  /* ------------------------------------------------------------------ NearMiss protocol */
  /* The reasoning structure behind a failed explanation, not just its output. Every family that can say something
     structured about a failure builds one of these; the refinement stage and the trace store consume them. */
  function NearMiss(o) {
    this.family = o.family || "psyn";
    this.representation = o.representation || null;
    this.partialProgram = o.partialProgram || null;
    this.concreteProgram = o.concreteProgram || null;
    this.fittedParameters = o.fittedParameters || null;
    this.intermediateStates = o.intermediateStates || null;
    this.trainPredictions = o.trainPredictions || null;
    this.residual = o.residual === undefined ? null : o.residual;
    this.structuralResidual = o.structuralResidual || null;
    this.diagnosis = o.diagnosis || null;
    this.failedConstraints = o.failedConstraints || [];
    this.objectCorrespondence = o.objectCorrespondence || null;
    this.semanticRoles = o.semanticRoles || null;
    this.unresolvedHoles = o.unresolvedHoles || [];
    this.complexity = o.complexity === undefined ? null : o.complexity;
    this.searchDepth = o.searchDepth === undefined ? 0 : o.searchDepth;
    this.elapsedMs = o.elapsedMs === undefined ? 0 : o.elapsedMs;
    this.provenance = o.provenance || [];
  }
  NearMiss.prototype.summary = function () {
    return { family: this.family, representation: this.representation, program: this.concreteProgram || (this.partialProgram ? String(this.partialProgram) : null),
      residual: this.residual, structural: this.structuralResidual, diagnosis: this.diagnosis, unresolved: this.unresolvedHoles.length,
      complexity: this.complexity, depth: this.searchDepth, ms: this.elapsedMs };
  };

  /* ------------------------------------------------------------------ pixel and structural residual levels */
  /* R0 pixel mismatch .. R7 schema mismatch. Only R0-R3 are computable from a grid pair alone; R4+ are filled in by the
     synthesiser, which knows objects, relations and roles. */
  function pixelResidual(pred, target) {
    if (!pred) return { r0: 1, dimsOk: false };
    if (pred.length !== target.length || pred[0].length !== target[0].length) return { r0: 1, dimsOk: false };
    var H = target.length, W = target[0].length, bad = 0, r, c;
    for (r = 0; r < H; r++) for (c = 0; c < W; c++) if (pred[r][c] !== target[r][c]) bad++;
    return { r0: bad / (H * W), cells: bad, dimsOk: true };
  }

  /* ------------------------------------------------------------------ trace recorder */
  /* Every search action becomes a training record: (task features, state, action, child, residual delta, constraints
     gained, runtime). Outcome labels are filled in when the search ends (hindsight). */
  function Trace(taskFeatures) { this.task = taskFeatures || {}; this.events = []; this.outcome = null; this.t0 = Date.now(); }
  Trace.prototype.add = function (e) { e.t = Date.now() - this.t0; this.events.push(e); if (this.events.length > 4000) this.events.shift(); };
  Trace.prototype.close = function (outcome) { this.outcome = outcome; return this; };

  /* Ablation switches. In Node: PSYN_OFF=value,sched,kind,macro,fam,loo,transduce,extract,partmap,roles,relations,multiparse,stages,union
     (comma separated). Programmatic: PSYN.setOff([...]). Used only to measure what each mechanism contributes. */
  var OFF = {};
  if (typeof process !== "undefined" && process.env && process.env.PSYN_OFF) process.env.PSYN_OFF.split(",").forEach(function (k) { if (k) OFF[k] = 1; });
  function off(name) { return !!OFF[name]; }
  function setOff(list) { OFF = {}; (list || []).forEach(function (k) { OFF[k] = 1; }); }

  return {
    off: off, setOff: setOff,
    Accounts: Accounts, Bits: Bits, Dom: Dom, Hole: Hole, Node: Node, PP: PP, EStore: EStore, NearMiss: NearMiss, Trace: Trace,
    isHole: isHole, isNode: isNode, render: render, canon: canon, d4Compose: d4Compose, d4Apply: d4Apply, d4Index: d4Index,
    rules: RULES, pixelResidual: pixelResidual, D4_NAMES: D4_NAMES
  };
})();
