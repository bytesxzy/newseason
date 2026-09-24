/* ===== src/56b-macros.js ===== */
/* Reusable abstractions: mining macros from solved programs.
 *
 *   1. canonicalise every solved program (09c-canonical.js normal form)
 *      so equal ideas are written the same way
 *   2. enumerate its sub-programs of two or more operators (chains through
 *      the input side and whole subtrees)
 *   3. group them by operator skeleton and ANTI-UNIFY each group: a literal
 *      that is the same in every member stays a literal, a literal that
 *      differs becomes a typed parameter
 *   4. support = number of distinct solved PROBLEMS containing the skeleton
 *      (not occurrences: one problem repeating a fragment is not evidence
 *      that the fragment is a reusable concept)
 *   5. compression gain = sum over uses of (bits of the fragment - bits of a
 *      macro reference with its parameters) - bits of the definition
 *
 * Mining only proposes. Whether a macro is ACCEPTED is decided by
 * tools/arc-macros.js on held-out compositions (it must improve held-out
 * solving or cut search cost without an accuracy loss); accepted macros are
 * written to 56c-macro-library.js (generated) and loaded here as typed
 * operators of the macro alphabet (09-program.js), where synthesis, repair
 * and population search use them like any other step. Every macro reduces
 * to existing operators, so it can make a program SHORTER to find, never
 * compute something new.
 *
 * Sources are programs the system itself found, or the generator programs
 * of the synthetic curriculum's TRAINING split. Never benchmark answers.
 */

var MACROS = null;

(function () {
  var T = PROG;
  var LIB = [], STATS = { loaded: 0, uses: 0 };

  function kindsOf(op) { return T.OPS[op] ? T.OPS[op].kinds.filter(function (k) { return k !== T.T_GRID; }) : []; }
  function skeleton(t) { return t.op === "in" ? "$" : t.op + "(" + t.kids.map(skeleton).join(",") + ")"; }

  /* Sub-programs of size >= 2 that are closed over one input leaf: every
     subtree, and every contiguous section of a unary chain. */
  function fragments(t) {
    var out = [], seen = new Set();
    function addFrag(f) {
      if (T.treeSize(f) < 2) return;
      var k = T.treeRender(f);
      if (seen.has(k)) return; seen.add(k); out.push(f);
    }
    T.treeNodes(t).forEach(function (p) {
      var n = p[0];
      if (n.op === "in") return;
      addFrag(T.cloneTree(n));
      /* chain sections: cut the chain below n at every depth */
      var cur = n, depth = 0;
      while (cur && cur.kids && cur.kids.length === 1 && cur.kids[0].op !== "in" && depth < 5) {
        depth++;
        var cut = (function copyUntil(x, d) {
          if (d === 0) return { op: "in" };
          return { op: x.op, kids: [copyUntil(x.kids[0], d - 1)], params: x.params.slice() };
        })(n, depth + 1);
        addFrag(cut);
        cur = cur.kids[0];
      }
    });
    return out;
  }

  /* Anti-unification of same-skeleton fragments: returns {template, params
     (kinds), literalSlots} where differing literals became {"$": i}. */
  function antiUnify(frags) {
    var holes = [];
    function walk(nodes) {
      var n0 = nodes[0];
      if (n0.op === "in") return { op: "in" };
      var ks = kindsOf(n0.op), params = [], j;
      for (j = 0; j < n0.params.length; j++) {
        var v0 = JSON.stringify(n0.params[j]), same = nodes.every(function (n) { return JSON.stringify(n.params[j]) === v0; });
        if (same) params.push(n0.params[j] && typeof n0.params[j] === "object" ? JSON.parse(v0) : n0.params[j]);
        else { params.push({ $: holes.length }); holes.push(ks[j]); }
      }
      var kids = [], i;
      for (i = 0; i < n0.kids.length; i++) kids.push(walk(nodes.map(function (n) { return n.kids[i]; })));
      return { op: n0.op, kids: kids, params: params };
    }
    return { template: walk(frags), params: holes };
  }

  function refBits(kinds) {
    var b = T.MACRO_ESCAPE_BITS + 3.0, i;          /* escape + ~8 macros */
    for (i = 0; i < kinds.length; i++) b += (T.DOMAIN_BITS[kinds[i]] || 4.0);
    return b;
  }

  /* programs: [{tree, task}] (canonical or not). Returns candidates sorted
     by estimated compression gain. */
  function mine(programs, opts) {
    opts = opts || {};
    var minSupport = opts.minSupport || 3, maxParams = opts.maxParams === undefined ? 3 : opts.maxParams;
    var bySkel = new Map();
    programs.forEach(function (p) {
      var t = p.tree;
      /* the rewrite NORMAL form (symmetries outermost), not the saturation's
         lexicographic minimum: a consistent orientation keeps shared inner
         fragments contiguous across programs */
      try { t = CANON.normalizeTree(t); } catch (e) { /* keep */ }
      fragments(t).forEach(function (f) {
        var k = skeleton(f), g = bySkel.get(k);
        if (!g) { g = { skel: k, frags: [], tasks: new Set() }; bySkel.set(k, g); }
        g.frags.push(f); g.tasks.add(p.task);
      });
    });
    var out = [];
    bySkel.forEach(function (g) {
      if (g.tasks.size < minSupport) return;
      /* ops that cannot be parameterised (fitted tables) are excluded */
      if (g.frags.some(function (f) { return T.treeNodes(f).some(function (q) { return kindsOf(q[0].op).some(function (k) { return k === T.T_CMAP || k === "T" || k === "Q"; }); }); })) return;
      var au = antiUnify(g.frags);
      if (au.params.length > maxParams) return;
      var defBits = T.treeBits(T.instantiate(au.template, au.params.map(function () { return 0; })));
      var gain = 0;
      g.frags.forEach(function (f) { gain += T.treeBits(f) - refBits(au.params); });
      gain -= defBits;
      if (gain <= 0) return;
      out.push({ skeleton: g.skel, template: au.template, params: au.params, support: g.tasks.size,
                 occurrences: g.frags.length, mdlGain: Math.round(gain * 100) / 100, size: T.treeSize(g.frags[0]) });
    });
    /* prefer larger fragments when one skeleton contains another with the
       same support: the smaller is implied */
    out.sort(function (a, b) { return (b.mdlGain - a.mdlGain) || (b.size - a.size) || (a.skeleton < b.skeleton ? -1 : 1); });
    return out.slice(0, opts.limit || 40);
  }

  function nameOf(c, i) {
    return (c.name || ("L" + i + "_" + c.skeleton.replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "").slice(0, 40)));
  }

  /* Register macros as typed operators. Each record: {name, template,
     params, weight, support, heldoutUtility, mdlGain, version, preconditions}. */
  function load(list) {
    clear();
    (list || []).forEach(function (m, i) {
      var name = m.name || nameOf(m, i);
      T.defineMacro({ name: name, template: m.template, params: m.params || [], weight: m.weight || 1,
                      version: m.version || 1, preconditions: m.preconditions || {} });
      var rec = { id: "m:" + name, domain: "arc", type: "G->G", template: m.template, params: m.params || [],
                  preconditions: m.preconditions || {}, representation: m.representation || "raw",
                  support: m.support || 0, failures: m.failures || 0, trainUtility: m.trainUtility === undefined ? null : m.trainUtility,
                  heldoutUtility: m.heldoutUtility === undefined ? null : m.heldoutUtility, mdlGain: m.mdlGain || 0,
                  lineage: m.lineage || [], version: m.version || 1, status: "active" };
      LIB.push(rec);
      if (root.C4ReasonMemory) root.C4ReasonMemory.shared.abstractions.propose(rec);
    });
    STATS.loaded = LIB.length;
    return LIB.length;
  }
  function clear() { T.clearMacros(); LIB = []; STATS.loaded = 0; }
  function active() { return LIB.slice(); }

  /* How many macro steps a program uses (for usage reports). */
  function uses(tree) {
    return T.treeNodes(tree).filter(function (p) { return T.OPS[p[0].op] && T.OPS[p[0].op].macro; }).length;
  }

  MACROS = { mine: mine, fragments: fragments, antiUnify: antiUnify, skeleton: skeleton, load: load, clear: clear,
             active: active, uses: uses, refBits: refBits, stats: function () { return { loaded: STATS.loaded }; } };
})();
