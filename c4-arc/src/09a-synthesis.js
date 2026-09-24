/* ===== src/09a-synthesis.js ===== */
/* Port of engine/synthesis.py -- typed bottom-up synthesis over PROG
 * structures.
 *
 * It sits beside the legacy enumerator rather than replacing it, so a paired
 * ablation is one flag rather than two checkouts. Three things it does that
 * the legacy enumerator does not: every candidate exposes its canonical
 * structure and its literals separately; table-valued literals are SOLVED
 * against the demonstrations rather than enumerated; and a binary combination
 * re-enters the frontier, so u(binary(a,b)) is reachable.
 */

var SYN = null;

(function () {
  var TERMINAL_OPS = ["cmap", "recolor_by"];
  /* Operators applied at EVERY node: no literal, or a literal over two or
     three values. Applying the colour-parameterised operators everywhere
     multiplies the branching factor by ten, and a frontier that wide never
     reaches depth three inside the slice the portfolio gives this family --
     which is how a search that looks powerful on paper returns nothing on a
     real task. */
  var CORE_OPS = ["rot90", "rot180", "rot270", "flip_h", "flip_v", "transpose",
    "anti_transpose", "crop", "dedup", "dedup_r", "dedup_c", "trim",
    "compress", "half", "quad", "grav", "upscale", "downscale", "tile",
    "shift", "wrap", "mirror_cat", "nzblock", "modeblock", "mode_cell",
    "denoise", "bbox_fill", "repair", "complete", "connect", "outline",
    "frame_in", "frame_all", "move_objs"];
  /* Applied only from the root, in the manner of the legacy enumerator's
     seeds: expensive, or carrying a literal over the whole palette. */
  var SEED_OPS = ["cropc", "keepc", "fillholes", "pad", "border",
    "fill_enclosed", "connect_c", "outline_c", "marked", "pick_crop",
    "pick_patch", "keep_only", "drop_one", "tile_yx", "replace"];
  var INNER_OPS = CORE_OPS.concat(SEED_OPS);
  var BIN = [["hcat", G.hconcat, 2.0], ["vcat", G.vconcat, 2.0]];

  /* Operator search-order bonus, the typed counterpart of ENUM's OP_BIAS.
     Without it the typed frontier is ordered by code length alone and nothing
     learned can reach it: the policy and the language model both express
     themselves as an opinion about operators, and that opinion previously only
     reached the legacy enumerator. A bias reorders what is tried and nudges the
     beam; it never changes what fits, because every candidate is still checked
     against every demonstration. */
  var OP_BIAS = {};

  /* Search-state identity: a 53-bit hash over the state's grids (see
     G.ghashList). stateKeyExact is the exact text, used where a program is
     stored as found. */
  function stateKey(st) { return G.ghashList(st); }
  function stateKeyExact(st) {
    var i, parts = [];
    for (i = 0; i < st.length; i++) parts.push(G.gkey(st[i]));
    return parts.join("#");
  }

  function paramGrid(op, dom, cap) {
    var kinds = PROG.OPS[op].kinds.filter(function (k) { return k !== PROG.T_GRID; });
    if (!kinds.length) return [[]];
    if (kinds.indexOf(PROG.T_CMAP) >= 0) return null;
    var spaces = kinds.map(function (k) { return dom[k] || [0]; }), total = 1, i;
    for (i = 0; i < spaces.length; i++) total *= Math.max(1, spaces[i].length);
    if (total > cap) return null;
    return PROG.product(spaces);
  }

  function applyState(struct, theta, env, state) {
    var out = [], i, rr;
    for (i = 0; i < state.length; i++) {
      try { rr = PROG.evalNode(struct, PROG.iterOf(theta), state[i], env); }
      catch (e) { return null; }
      if (rr === null || rr === undefined || !G.valid(rr)) return null;
      out.push(rr);
    }
    return out;
  }

  function admit(seen, key, depth, bits) {
    var labels = seen.get(key), i;
    if (!labels) { seen.set(key, [[depth, bits]]); return true; }
    for (i = 0; i < labels.length; i++)
      if (labels[i][0] <= depth && labels[i][1] <= bits) return false;
    var kept = labels.filter(function (l) { return !(depth <= l[0] && bits <= l[1]); });
    kept.push([depth, bits]);
    seen.set(key, kept);
    return true;
  }

  function distance(state, target) {
    var d = 0.0, i;
    for (i = 0; i < target.length; i++) {
      var a = state[i], b = target[i], da = G.dims(a), db = G.dims(b);
      if (da[0] !== db[0] || da[1] !== db[1]) {
        d += 1.0 + Math.abs(da[0] - db[0]) / Math.max(da[0], db[0])
                 + Math.abs(da[1] - db[1]) / Math.max(da[1], db[1]);
      } else {
        var n = 0, r, c;
        for (r = 0; r < da[0]; r++) for (c = 0; c < da[1]; c++) if (a[r][c] !== b[r][c]) n++;
        d += n / (da[0] * da[1]);
      }
    }
    return d / Math.max(1, target.length);
  }

  function beam(nodes, width, target) {
    if (nodes.length <= width) return nodes;
    var ranked = nodes.slice().sort(function (a, b) {
      return (a.bits - b.bits) || (a.depth - b.depth); });
    var cheap = ranked.slice(0, width >> 1), taken = new Set(cheap);
    var rest = ranked.filter(function (n) { return !taken.has(n); });
    rest.forEach(function (n) { n._d = distance(n.state, target) + 0.02 * n.bits; });
    rest.sort(function (a, b) { return (a._d - b._d) || (a.bits - b.bits); });
    return cheap.concat(rest.slice(0, width - cheap.length));
  }

  function fitFor(op, combo, pairs, env) {
    if (op === "cmap") {
      var table = PROG.fitTable("cmap", combo, pairs, env);
      if (!table) return null;
      var counts = {}, i, r, c;
      for (i = 0; i < pairs.length; i++) {
        var a = pairs[i][0], d = G.dims(a);
        for (r = 0; r < d[0]; r++) for (c = 0; c < d[1]; c++)
          counts[a[r][c]] = (counts[a[r][c]] || 0) + 1;
      }
      for (var k in table) if (table.hasOwnProperty(k) && (counts[k] || 0) < 2) return null;
      return table;
    }
    return PROG.fitTable(op, combo, pairs, env);
  }

  var NEAR_CAP = 24;
  /* Apply one step to every grid of the parent's state. */
  function stepState(op, params, env, state) {
    var fn = PROG.OPS[op].fn, out = [], i, rr;
    for (i = 0; i < state.length; i++) {
      try { rr = fn.apply(null, [env, state[i]].concat(params)); } catch (e) { return null; }
      if (rr === null || rr === undefined || !G.valid(rr)) return null;
      out.push(rr);
    }
    return out;
  }
  /* Cheap signature of HOW a near state fails: root operator, depth, which
     pairs have the target's size, and the error topology on the others
     (fraction wrong; missing vs excess change relative to the input). */
  function nearSig(n, ctx, target) {
    var root = Array.isArray(n.struct) ? n.struct[0] : "in", dims = "", err = 0, cnt = 0, under = 0, excess = 0, i;
    for (i = 0; i < target.length; i++) {
      var a = n.state[i], t = target[i], x = ctx.train[i][0];
      if (a.length !== t.length || a[0].length !== t[0].length) { dims += "x"; continue; }
      dims += "=";
      var same = x.length === t.length && x[0].length === t[0].length, r, c, bad = 0;
      for (r = 0; r < t.length; r++) for (c = 0; c < t[0].length; c++) {
        if (a[r][c] === t[r][c]) continue;
        bad++;
        if (same) { if (a[r][c] === x[r][c]) under++; else if (t[r][c] === x[r][c]) excess++; }
      }
      err += bad / (t.length * t[0].length); cnt++;
    }
    var e = cnt ? err / cnt : 1;
    var topo = under > 2 * excess ? "u" : excess > 2 * under ? "e" : "m";
    return root + "/" + n.depth + "/" + dims + "/" + (e < 0.05 ? "t" : e < 0.15 ? "l" : e < 0.4 ? "m" : "h") + topo;
  }

  function localSlot(op) {
    var kinds = PROG.OPS[op].kinds.filter(function (k) { return k !== PROG.T_GRID; });
    return kinds.indexOf(PROG.T_CMAP);
  }

  /* Canonical structure of op(parent): the parent is already canonical, so
     only a rewrite at the new root can apply. Operators that no rewrite
     touches keep their text and get an incremental key; the others are
     normalised in full (09c-canonical.js). Returns {struct, theta, key,
     collapsed} where collapsed means the new step changed nothing
     structurally (it merged away). */
  var USE_CANON = true;
  function interacts(op, parentOp) {
    if (!CANON) return false;
    if (op === "id" || op === "tile_yx") return true;
    var D = CANON.COMPOSE;
    if (D[op] && (D[parentOp] || parentOp === "mode_cell")) return true;
    if (CANON.IDEMPOTENT[op] && parentOp === op) return true;
    if (op === "crop" && parentOp === "compress") return true;
    if (op === "mode_cell" && D[parentOp]) return true;
    if (CANON.COMMUTE_DIH[op] && D[parentOp]) return true;
    return false;
  }
  function paramKey(params) {
    var s = "", i;
    for (i = 0; i < params.length; i++) s += (i ? "," : "") + (params[i] && typeof params[i] === "object" ? JSON.stringify(params[i]) : params[i]);
    return s;
  }
  /* The key is exactly PROG.render's text, built incrementally from the
     parent's cached text so that a candidate that needed no rewrite and one
     that was rewritten into the same program get the same key. */
  function renderStep(op, parentKey, params) {
    var kinds = PROG.OPS[op].kinds, parts = [], j = 0, i;
    for (i = 0; i < kinds.length; i++) parts.push(kinds[i] === PROG.T_GRID ? parentKey : PROG.lit(params[j++], kinds[i]));
    return op + "(" + parts.join(",") + ")";
  }
  function canonChild(op, params, node) {
    var struct = PROG.structOf(op, node.struct), theta = node.theta.concat(params);
    var pOp = Array.isArray(node.struct) && node.struct.length ? node.struct[0] : "in";
    if (!USE_CANON || !interacts(op, pOp))
      return { struct: struct, theta: theta, key: renderStep(op, node.ckey, params), rewritten: false };
    var t = CANON.normalizeTree(PROG.toTree(struct, theta)), f = PROG.fromTree(t);
    return { struct: f.struct, theta: f.theta, key: PROG.render(f.struct, f.theta), rewritten: true };
  }

  function search(ctx, depth, width, deadline, cap, prior) {
    depth = depth === undefined ? 3 : depth;
    width = width === undefined ? 650 : width;
    cap = cap === undefined ? 12 : cap;
    if (deadline === undefined) deadline = ctx.deadline;
    var nTr = ctx.train.length;
    if (!nTr) return [];
    var env = PROG.makeEnv(ctx), dom = PROG.domains(ctx);
    var bias = {}, bk;
    for (bk in OP_BIAS) if (OP_BIAS.hasOwnProperty(bk)) bias[bk] = OP_BIAS[bk];
    if (prior) for (bk in prior) if (prior.hasOwnProperty(bk)) bias[bk] = prior[bk];
    /* task-local adaptation (57b-testtime.js): temporary operator priors
       read off this task's own demonstrations; discarded with the context */
    if (ctx._tta && ctx._tta.opPrior) for (bk in ctx._tta.opPrior) if (ctx._tta.opPrior.hasOwnProperty(bk))
      bias[bk] = (bias[bk] || 0) + ctx._tta.opPrior[bk];
    var hasBias = Object.keys(bias).length > 0;
    var grids = ctx.inputs().concat(ctx.test_inputs), target = ctx.outputs();
    var found = new Map(), seen = new Map();
    /* canonical structures already evaluated in this search */
    var canonSeen = new Set(), sstats = { generated: 0, canonical_duplicates: 0, canonicalised: 0,
      evaluated: 0, behavior_duplicates: 0, beam_accepted: 0, near_emitted: 0, exact: 0, macro_steps: 0, levels: 0 };
    ctx._synStats = sstats;
    var macros = (typeof PROG.macroOps === "function") ? PROG.macroOps(ctx) : [];

    function expired() { return deadline !== null && deadline !== undefined && nowMs() >= deadline; }

    function keep(struct, theta, st) {
      if (sstats.first_exact_evaluated === undefined) sstats.first_exact_evaluated = sstats.evaluated;
      var bits = PROG.structBits(struct) + PROG.thetaBits(struct, theta);
      var k = stateKeyExact(st), prev = found.get(k);
      if (!prev || bits < prev[0]) found.set(k, [bits, struct, theta]);
    }

    function trainEq(st) {
      var i;
      for (i = 0; i < nTr; i++) if (!G.gEq(st[i], target[i])) return false;
      return true;
    }

    /* A table is read off the demonstrations cell by cell or object by object,
       so it can only exist when the state already has the target's shape.
       Checking that first keeps a full object segmentation of every training
       grid out of the inner loop. */
    function close(node) {
      if (node.depth >= depth) return;
      var q;
      for (q = 0; q < nTr; q++) {
        var dq = G.dims(node.state[q]), dt = G.dims(target[q]);
        if (dq[0] !== dt[0] || dq[1] !== dt[1]) return;
      }
      var oi, ci;
      for (oi = 0; oi < TERMINAL_OPS.length; oi++) {
        if (expired()) return;
        var op = TERMINAL_OPS[oi];
        var kinds = PROG.OPS[op].kinds.filter(function (k) { return k !== PROG.T_GRID; });
        var others = kinds.filter(function (k) { return k !== PROG.T_CMAP; });
        var spaces = others.map(function (k) { return dom[k] || [0]; }), tot = 1, i;
        for (i = 0; i < spaces.length; i++) tot *= Math.max(1, spaces[i].length);
        if (tot > 96) continue;
        var combos = PROG.product(spaces);
        for (ci = 0; ci < combos.length; ci++) {
          if (expired()) return;
          var struct = PROG.structOf(op, node.struct);
          var slot = PROG.cmapSlot(struct);
          if (slot === null) continue;
          var pairs = [];
          for (i = 0; i < nTr; i++) pairs.push([node.state[i], target[i]]);
          var table = fitFor(op, combos[ci], pairs, env);
          if (!table) continue;
          var theta = node.theta.concat(combos[ci]);
          theta.splice(node.theta.length + localSlot(op), 0, table);
          var st = applyState(struct, theta, env, grids);
          if (st && trainEq(st)) keep(struct, theta, st);
        }
      }
    }

    var root = { struct: PROG.VAR, theta: [], state: grids,
                 bits: PROG.opBits("in"), depth: 0, ckey: "$" };
    canonSeen.add("$");
    admit(seen, stateKey(grids), 0, root.bits);
    if (trainEq(grids)) keep(PROG.VAR, [], grids);
    close(root);
    var frontier = [root], every = [root], paramCache = {}, lvl;
    function byBias(a, b) {
      var da = bias[a] || 0, db = bias[b] || 0;
      return (db - da) || (a < b ? -1 : a > b ? 1 : 0);
    }
    /* A state some label in `table` already reaches at no greater depth and
       no more bits (admit() would reject it), checked without recording. */
    function dominated(table, key, d, b) {
      var labels = table.get(key);
      if (!labels) return false;
      for (var i = 0; i < labels.length; i++) if (labels[i][0] <= d && labels[i][1] <= b) return true;
      return false;
    }
    /* expand one node by the given operators into `into`; base steps are
       admitted to the shared table, macro steps to their own */
    function expand(node, ops, into, lvl, macroPass, table) {
      for (var oi2 = 0; oi2 < ops.length; oi2++) {
        if (expired()) break;
        var op2 = ops[oi2];
        if (!PROG.OPS[op2]) continue;
        if (!(op2 in paramCache)) paramCache[op2] = paramGrid(op2, dom, PROG.OPS[op2].macro ? 40 : 64);
        var combos2 = paramCache[op2];
        if (!combos2) continue;
        for (var ci2 = 0; ci2 < combos2.length; ci2++) {
          sstats.generated++;
          /* the stored structure is absolute (applied to the original
             grids); it is the CANONICAL form of op2(parent), so an
             equivalent program reached another way is never executed
             twice and every program carries its shortest description */
          var cc = canonChild(op2, combos2[ci2], node);
          if (canonSeen.has(cc.key)) { sstats.canonical_duplicates++; continue; }
          canonSeen.add(cc.key);
          if (cc.rewritten) sstats.canonicalised++;
          /* incremental evaluation: op2 applied to the parent's outputs is,
             by construction, the canonical program's output */
          var st2 = stepState(op2, combos2[ci2], env, node.state);
          sstats.evaluated++;
          if (!st2) continue;
          var struct2 = cc.struct, theta2 = cc.theta;
          var bits2 = PROG.structBits(struct2) + PROG.thetaBits(struct2, theta2);
          var key2 = stateKey(st2);
          if (macroPass && dominated(seen, key2, lvl, bits2)) { sstats.behavior_duplicates++; continue; }
          if (!admit(table, key2, lvl, bits2)) { sstats.behavior_duplicates++; continue; }
          var nn = { struct: struct2, theta: theta2, state: st2,
                     bits: bits2 - (bias[op2] || 0), depth: lvl, ckey: cc.key, skey: key2, rawBits: bits2 };
          if (PROG.OPS[op2].macro) sstats.macro_steps++;
          if (trainEq(st2)) keep(struct2, theta2, st2);
          into.set(key2, nn);
          if (macroPass && into.size > width) return;
        }
      }
    }
    for (lvl = 1; lvl <= depth; lvl++) {
      var nxt = new Map(), nxtM = new Map(), seenM = new Map();
      var baseOps = (lvl === 1 ? INNER_OPS : CORE_OPS).slice();
      if (hasBias) baseOps.sort(byBias);
      /* pass 1: the base operators, exactly as a search without macros */
      for (var ni = 0; ni < frontier.length; ni++) {
        if (expired()) break;
        expand(frontier[ni], baseOps, nxt, lvl, false, seen);
        if (nxt.size > width * 4) break;
      }
      /* pass 2: learned macros (56b-macros.js) EXTEND the search on their
         own capacity and beam slots; they never crowd out, or pre-empt in
         the shared dedupe table, a base-operator state */
      if (macros.length) {
        var mOps = macros.slice();
        if (hasBias) mOps.sort(byBias);
        for (var nj = 0; nj < frontier.length && nxtM.size <= width; nj++) {
          if (expired()) break;
          expand(frontier[nj], mOps, nxtM, lvl, true, seenM);
        }
      }
      if (!nxt.size && !nxtM.size) break;
      frontier = beam(Array.from(nxt.values()), width, target);
      if (nxtM.size) {
        var fm = beam(Array.from(nxtM.values()), Math.max(2, width >> 2), target);
        fm.forEach(function (n) { if (admit(seen, n.skey, lvl, n.rawBits)) frontier.push(n); });
      }
      /* the table closers run on the beam only: they are the expensive half of
         the level, and the beam is what survives to be built on anyway */
      for (var ki = 0; ki < frontier.length; ki++) {
        if (expired()) break;
        close(frontier[ki]);
      }
      every = every.concat(frontier);
      if (expired() || found.size >= cap) break;
    }

    if (!expired()) {
      var pool = beam(every.filter(function (n) { return n.depth < depth; }), 60, target);
      for (var ai = 0; ai < pool.length; ai++) {
        for (var bi = 0; bi < pool.length; bi++) {
          for (var k2 = 0; k2 < BIN.length; k2++) {
            if (expired()) break;
            var a = pool[ai], b = pool[bi], st3 = [], okAll = true, i3;
            for (i3 = 0; i3 < grids.length; i3++) {
              var rr;
              try { rr = BIN[k2][1](a.state[i3], b.state[i3]); } catch (e) { rr = null; }
              if (rr === null || rr === undefined || !G.valid(rr)) { okAll = false; break; }
              st3.push(rr);
            }
            if (!okAll) continue;
            var bits3 = a.bits + b.bits + BIN[k2][2], dep3 = 1 + Math.max(a.depth, b.depth);
            var key3 = stateKey(st3);
            if (!admit(seen, key3, dep3, bits3)) continue;
            var struct3 = [BIN[k2][0], a.struct, b.struct];
            var theta3 = a.theta.concat(b.theta);
            var node3 = { struct: struct3, theta: theta3, state: st3,
                          bits: bits3, depth: dep3 };
            if (trainEq(st3)) keep(struct3, theta3, st3); else close(node3);
          }
        }
      }
    }
    /* Hand the closest non-exact search states to the refinement stage
       instead of discarding them (57-refinement.js). States are already
       computed; this costs one distance per beam node. */
    if (ctx._nearSink && typeof REFINEMENT !== "undefined" && REFINEMENT) {
      var near = every.filter(function (n) { return n.depth > 0 && !trainEq(n.state); });
      near.forEach(function (n) { if (n._d === undefined) n._d = distance(n.state, target); });
      near.sort(function (a, b) { return (a._d - b._d) || (a.bits - b.bits); });
      /* qualitatively different near-solutions, not the twelve nearest
         (which are typically one idea in twelve literal variants): at most
         two per (root operator, depth, dims agreement, error topology) */
      var perSig = new Map(), examined = 0;
      for (var ni2 = 0; ni2 < near.length && sstats.near_emitted < NEAR_CAP && examined < 400; ni2++) {
        examined++;
        var sg = nearSig(near[ni2], ctx, target);
        var used = perSig.get(sg) || 0;
        if (used >= 2) continue;
        perSig.set(sg, used + 1);
        REFINEMENT.noteTyped(ctx, near[ni2].struct, near[ni2].theta, near[ni2]._d,
                             { sig: sg, depth: near[ni2].depth, family: "typed" });
        sstats.near_emitted++;
      }
      sstats.near_clusters = perSig.size;
    }
    sstats.exact = found.size;
    sstats.levels = lvl - 1;
    var out = Array.from(found.values()).sort(function (x, y) {
      return (x[0] - y[0]) || (PROG.render(x[1]) < PROG.render(y[1]) ? -1 : 1);
    }).slice(0, cap);
    return out.map(function (rec) { return new PROG.Prog(rec[1], rec[2], env); });
  }

  SYN = { search: search, INNER_OPS: INNER_OPS, CORE_OPS: CORE_OPS, nearSig: nearSig,
          canon: function (on) { if (on !== undefined) USE_CANON = !!on; return USE_CANON; },
          SEED_OPS: SEED_OPS, TERMINAL_OPS: TERMINAL_OPS,
          opBias: function (b) { if (b !== undefined) OP_BIAS = b || {}; return OP_BIAS; } };
})();

