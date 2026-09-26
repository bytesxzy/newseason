/* ===== src/63-sketch.js ===== */
/* Entity-level sketch synthesis with version-space hole solving.
 *
 * A program here is a decision list over the entities of a scene:
 *
 *     for each entity e of SCN(input, seg):
 *        first rule (PRED_i, ACTION_i) whose PRED_i(e) holds applies,
 *        otherwise the DEFAULT action (keep | delete)
 *     then GROWTH rules paint new cells relative to selected entities
 *     then an optional canvas recolour of untouched background
 *
 * ACTION kinds and their typed holes:
 *     recolor(COLOR)  del  move(VEC)  copy(VEC)  moverc(VEC, COLOR)
 * GROWTH kinds: halo4/halo8(COLOR), bbox(COLOR), holes(COLOR),
 *     ray(DIRSET, STOP, COLOR), link(REL, COLOR)
 *
 * Holes are EXPRESSIONS, not literals: COLOR ranges over literals, the
 * entity's own colours, the colours of related entities (nearest, container,
 * touching, unique-colour ...), and grid colour ranks; VEC over literal
 * offsets, direction x INT (INT = own height/width/size, object counts,
 * colour counts, distances ...), slides until blocked, moves until contact
 * with a related entity, alignment and mirroring about it.
 *
 * The search is structure first, parameters second, and parameters are
 * never enumerated blindly: for every entity of every demonstration the
 * correspondence (61-correspondence.js) says what happened to it, and the
 * set of expressions consistent with that is computed ONCE per entity. The
 * hole's version space is the intersection of those sets over the entities a
 * rule covers. Selection predicates are likewise the intersection of the
 * predicates true on the entities a rule must cover and false on those it
 * must not. When one rule cannot explain every entity the entities are
 * partitioned by which expression explains them and a low-cost predicate
 * separating the parts is searched: a conditional appears only where the
 * residual partitions cleanly.
 *
 * Every assembled program is executed on every demonstration and kept only
 * if it reproduces all of them exactly. Programs are values (plain objects)
 * with a canonical key and a description length (64-mdl.js), so the
 * portfolio can rank them, LODO can refit them, and the library can mine
 * them.
 */
var SKETCH = (function () {
  var DIRS = EXPR.DIRS, DNAME = EXPR.DNAME, LOG2_10 = EXPR.LOG2_10, RELS = EXPR.RELS, REL_BY = EXPR.REL_BY,
      rel = EXPR.rel, COLOR_EXPRS = EXPR.COLOR_EXPRS, INT_EXPRS = EXPR.INT_EXPRS, VEC_EXPRS = EXPR.VEC_EXPRS,
      litVec = EXPR.litVec, predCatalog = EXPR.predCatalog;

  /* ---------------------------------------------------------- programs */
  /* prog = {seg, bg, rules:[{p:pred, a:{kind, v:vexpr, c:cexpr}}], def: "keep"|"del",
             grow:[{p, g:{kind, d, stop, c}}], canvas: color|-1} */
  function actionKey(a) {
    return a.kind + (a.d !== undefined ? "<" + (typeof a.d === "number" ? DNAME[a.d] : a.d) + ">" : "") +
      (a.v ? "[" + a.v.k + "]" : "") + (a.c ? "{" + a.c.k + "}" : "");
  }
  function progKey(p) {
    var s = p.seg + "|" + p.rules.map(function (r) { return r.p.k + ">" + actionKey(r.a); }).join(";") + "|" + p.def;
    if (p.grow && p.grow.length) s += "|g:" + p.grow.map(function (r) { return r.p.k + ">" + growKey(r.g); }).join(";");
    if (p.canvas >= 0) s += "|bg:" + p.canvas;
    return s;
  }
  function growKey(g) { return g.op.key + (g.c ? "{" + g.c.k + "}" : ""); }

  function paintPatch(out, e, dr, dc, color) {
    var H = out.length, W = out[0].length, i, p, r, c;
    for (i = 0; i < e.n; i++) {
      p = e.cells[i]; r = (p >> 6) + dr; c = (p & 63) + dc;
      if (r < 0 || r >= H || c < 0 || c >= W) continue;
      out[r][c] = color === undefined || color === null ? e.patch[(p >> 6) - e.r0][(p & 63) - e.c0] : color;
    }
  }

  /* direction of a fall: a literal orthogonal direction, or toward REL */
  function fallDir(sc, e, d) {
    if (typeof d === "number") return d;
    var o = rel(sc, d, e);
    if (!o) return -1;
    var rov = sc.rowOverlap(e, o), cov = sc.colOverlap(e, o);
    if (cov && !rov) return e.r1 < o.r0 ? 1 : 0;
    if (rov && !cov) return e.c1 < o.c0 ? 3 : 2;
    return -1;
  }
  /* how far along direction d the entity already is (larger = nearer) */
  function lead(e, d) {
    return d === 0 ? -e.r0 : d === 1 ? e.r1 : d === 2 ? -e.c0 : e.c1;
  }

  function run(prog, grid) {
    var sc = SCN.of(grid, prog.seg, prog.bg);
    if (!sc) return null;
    var out = [], r, i, j, ents = sc.ents, acts = new Array(ents.length);
    for (r = 0; r < grid.length; r++) out.push(grid[r].slice());
    for (i = 0; i < ents.length; i++) {
      var a = null;
      for (j = 0; j < prog.rules.length; j++) if (prog.rules[j].p.f(sc, ents[i])) { a = prog.rules[j].a; break; }
      acts[i] = a;
    }
    /* phase 1: erasures */
    for (i = 0; i < ents.length; i++) {
      var k = acts[i] ? acts[i].kind : prog.def;
      if (k === "del" || k === "move" || k === "moverc" || k === "fall")
        for (j = 0; j < ents[i].n; j++) out[ents[i].cells[j] >> 6][ents[i].cells[j] & 63] = sc.bg;
    }
    /* sequential falls: nearest to the destination first, each sliding on
       the canvas as it is now (so later ones stack on earlier ones) */
    var falls = [];
    for (i = 0; i < ents.length; i++) if (acts[i] && acts[i].kind === "fall") {
      var fd = fallDir(sc, ents[i], acts[i].d);
      if (fd < 0) return null;
      falls.push([ents[i], fd, acts[i]]);
    }
    falls.sort(function (a, b) { return lead(b[0], b[1]) - lead(a[0], a[1]); });
    for (i = 0; i < falls.length; i++) {
      var fe = falls[i][0], dd = EXPR.DIRS[falls[i][1]], kk = 0, fc = null;
      if (falls[i][2].c) { fc = falls[i][2].c.f(sc, fe); if (fc === null || fc === undefined) return null; }
      for (;;) {
        var nk = kk + 1, okk = true;
        for (j = 0; j < fe.n; j++) {
          var rr = (fe.cells[j] >> 6) + dd[0] * nk, cc = (fe.cells[j] & 63) + dd[1] * nk;
          if (rr < 0 || rr >= sc.H || cc < 0 || cc >= sc.W || out[rr][cc] !== sc.bg) { okk = false; break; }
        }
        if (!okk || nk > 60) break;
        kk = nk;
      }
      paintPatch(out, fe, dd[0] * kk, dd[1] * kk, fc);
    }
    /* phase 2: paints */
    for (i = 0; i < ents.length; i++) {
      var A = acts[i], e = ents[i];
      if (!A) continue;
      var col = null, v = null;
      if (A.c) { col = A.c.f(sc, e); if (col === null || col === undefined) return null; }
      if (A.v) { v = A.v.f(sc, e); if (!v) return null; }
      if (A.kind === "recolor") paintPatch(out, e, 0, 0, col);
      else if (A.kind === "move" || A.kind === "copy") paintPatch(out, e, v[0], v[1], null);
      else if (A.kind === "moverc" || A.kind === "copyrc") paintPatch(out, e, v[0], v[1], col);
    }
    /* phase 3: growth, relative to the input's entities, on the canvas the
       object rules left (so a halo may cover what a rule deleted) */
    var base = null;
    if (prog.grow && prog.grow.length) { base = []; for (r = 0; r < out.length; r++) base.push(out[r].slice()); }
    if (prog.grow) for (j = 0; j < prog.grow.length; j++) {
      var R = prog.grow[j];
      for (i = 0; i < ents.length; i++) {
        if (!R.p.f(sc, ents[i])) continue;
        var res = GEN.apply(sc, ents[i], base, R.g.op);
        if (!res) return null;
        var gc = null;
        if (!res.cols) { gc = R.g.c.f(sc, ents[i]); if (gc === null || gc === undefined) return null; }
        for (var q = 0; q < res.cells.length; q++) out[res.cells[q] >> 6][res.cells[q] & 63] = res.cols ? res.cols[q] : gc;
      }
    }
    if (prog.canvas >= 0) {
      for (r = 0; r < out.length; r++) for (j = 0; j < out[0].length; j++)
        if (out[r][j] === sc.bg && grid[r][j] === sc.bg) out[r][j] = prog.canvas;
    }
    return out;
  }

  /* --------------------------------------------------------- induction */
  function valEq(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    if (Array.isArray(a)) return a[0] === b[0] && a[1] === b[1];
    return a === b;
  }

  /* Observations: what each entity allows, as candidate actions with their
     observed parameter values. */
  function observe(item, x, y, bg) {
    var e = item.e, f = item.fate, obs = [];
    if (f.kind === "same") {
      obs.push({ kind: "keep" });
      if (e.ncol === 1) obs.push({ kind: "recolor", c: e.color });
      /* staying put is the zero-length move */
      obs.push({ kind: "move", v: [0, 0], zero: true });
      if (e.ncol === 1) obs.push({ kind: "moverc", v: [0, 0], c: e.color, zero: true });
    } else if (f.kind === "vacated") obs.push({ kind: "del" });
    else if (f.kind === "recolor") {
      obs.push({ kind: "recolor", c: f.c });
      /* recoloured in place is the zero-length recolouring move */
      if (e.ncol === 1) obs.push({ kind: "moverc", v: [0, 0], c: f.c, zero: true });
    }
    else if (f.kind === "mixed") obs.push({ kind: "keep", partial: true });
    if ((f.kind === "vacated" || f.kind === "mixed" || f.kind === "same") && e.n <= 120) {
      var pl = CORR.placements(e, x, y, bg, "exact", 0);
      if (pl) pl.forEach(function (p) {
        obs.push({ kind: f.kind === "same" ? "copy" : "move", v: [p.dr, p.dc] });
      });
      if (e.ncol === 1 && f.kind !== "same") {
        var pr = CORR.placements(e, x, y, bg, "recolor", 0);
        if (pr) pr.forEach(function (p) { obs.push({ kind: "moverc", v: [p.dr, p.dc], c: p.c }); });
      }
    }
    return obs;
  }

  /* For one entity and one action kind: the consistent expressions. */
  function consistentExprs(item, kind) {
    var memo = item.vs || (item.vs = {});
    if (memo[kind]) return memo[kind];
    var sc = item.sc, e = item.e, res = { v: new Map(), c: new Map(), vc: [] }, i, j;
    var want = item.obs.filter(function (o) { return o.kind === kind; });
    if (!want.length) { memo[kind] = null; return null; }
    if (kind === "recolor") {
      for (i = 0; i < COLOR_EXPRS.length; i++) {
        var cv = COLOR_EXPRS[i].f(sc, e);
        for (j = 0; j < want.length; j++) if (cv === want[j].c) { res.c.set(COLOR_EXPRS[i].k, COLOR_EXPRS[i]); break; }
      }
    } else if (kind === "move" || kind === "copy" || kind === "moverc") {
      var vals = [];
      for (i = 0; i < VEC_EXPRS.length; i++) {
        var vv = VEC_EXPRS[i].f(sc, e);
        if (!vv) continue;
        for (j = 0; j < want.length; j++) if (valEq(vv, want[j].v)) {
          res.v.set(VEC_EXPRS[i].k, VEC_EXPRS[i]);
          if (kind === "moverc") vals.push([VEC_EXPRS[i], want[j].c]);
          break;
        }
      }
      for (j = 0; j < want.length; j++) {
        var L = litVec(want[j].v);
        res.v.set(L.k, L);
        if (kind === "moverc") vals.push([L, want[j].c]);
      }
      if (kind === "moverc") {
        /* colour expressions per matching offset */
        var cm = new Map();
        for (i = 0; i < COLOR_EXPRS.length; i++) {
          var cv2 = COLOR_EXPRS[i].f(sc, e);
          for (j = 0; j < want.length; j++) if (cv2 === want[j].c) { cm.set(COLOR_EXPRS[i].k, COLOR_EXPRS[i]); break; }
        }
        res.c = cm;
      }
    }
    memo[kind] = res;
    return res;
  }

  function intersectMaps(a, b) {
    var out = new Map();
    a.forEach(function (v, k) { if (b.has(k)) out.set(k, v); });
    return out;
  }

  /* The version space of an action kind over a set of entities: the
     expressions every one of them allows. */
  function recolorObs(items) {
    var obs = [], i, j;
    for (i = 0; i < items.length; i++) {
      var o = null;
      for (j = 0; j < items[i].obs.length; j++) if (items[i].obs[j].kind === "recolor") { o = items[i].obs[j]; break; }
      if (!o) return null;
      obs.push({ sc: items[i].sc, e: items[i].e, c: o.c });
    }
    return obs;
  }
  function tableVS(items) {
    var obs = recolorObs(items);
    if (!obs) return null;
    var tabs = EXPR.fitTables(obs), m = new Map();
    tabs.forEach(function (t) { m.set(t.k, t); });
    return m.size ? m : null;
  }
  function actionVS(items, kind) {
    var V = null, C = null, i;
    if (kind === "recolor") {
      for (i = 0; i < items.length; i++) {
        var rc = consistentExprs(items[i], kind);
        if (!rc) return null;
        C = C === null ? new Map(rc.c) : intersectMaps(C, rc.c);
        if (!C.size) break;
      }
      if (C && C.size) return { v: null, c: C };
      /* no shared expression: a fitted attribute -> colour table */
      var T = tableVS(items);
      return T ? { v: null, c: T } : null;
    }
    for (i = 0; i < items.length; i++) {
      var r = consistentExprs(items[i], kind);
      if (!r) return null;
      if (kind === "recolor") { C = C === null ? new Map(r.c) : intersectMaps(C, r.c); if (!C.size) return null; }
      else {
        V = V === null ? new Map(r.v) : intersectMaps(V, r.v);
        if (!V.size) return null;
        if (kind === "moverc") { C = C === null ? new Map(r.c) : intersectMaps(C, r.c); if (!C.size) return null; }
      }
    }
    return { v: V, c: C };
  }

  function sortedExprs(m, cap) {
    var arr = [];
    m.forEach(function (x) { arr.push(x); });
    arr.sort(function (a, b) { return (a.b - b.b) || (a.k < b.k ? -1 : 1); });
    return arr.slice(0, cap);
  }

  /* predicates true on every item of T and false on every item of F */
  function predVS(preds, T, F, cap) {
    var out = [], i, j, ok;
    for (i = 0; i < preds.length; i++) {
      var p = preds[i];
      ok = true;
      for (j = 0; j < T.length && ok; j++) if (!truth(p, T[j])) ok = false;
      for (j = 0; j < F.length && ok; j++) if (truth(p, F[j])) ok = false;
      if (ok) out.push(p);
    }
    out.sort(function (a, b) { return a.b - b.b; });
    if (out.length || !T.length || !F.length) return out.slice(0, cap);
    /* conjunctions of two, when no single predicate separates */
    var tp = preds.filter(function (p) { for (var k = 0; k < T.length; k++) if (!truth(p, T[k])) return false; return p.k !== "all"; });
    tp.sort(function (a, b) { return a.b - b.b; });
    tp = tp.slice(0, 24);
    for (i = 0; i < tp.length; i++) for (j = i + 1; j < tp.length; j++) {
      ok = true;
      for (var q = 0; q < F.length; q++) if (truth(tp[i], F[q]) && truth(tp[j], F[q])) { ok = false; break; }
      if (ok) out.push(conj(tp[i], tp[j]));
      if (out.length >= cap * 3) break;
    }
    out.sort(function (a, b) { return a.b - b.b; });
    return out.slice(0, cap);
  }
  function conj(p, q) {
    return { k: p.k + "&" + q.k, b: p.b + q.b + 1, f: function (sc, e) { return p.f(sc, e) && q.f(sc, e); } };
  }
  function truth(p, item) {
    var t = item.pt || (item.pt = {});
    if (t[p.k] === undefined) t[p.k] = !!p.f(item.sc, item.e);
    return t[p.k];
  }

  /* RELAX: an entity whose cells were recoloured may instead have been
     deleted or kept and then painted over by a growth rule; the relaxed pass
     lets the object rules say so and leaves those cells to growth. */
  var RELAX = false;
  function allows(item, kind) {
    for (var i = 0; i < item.obs.length; i++) if (item.obs[i].kind === kind && !item.obs[i].partial) return true;
    if (RELAX && (kind === "del" || kind === "keep") && (item.fate.kind === "recolor" || item.fate.kind === "mixed")) return true;
    return false;
  }

  /* Enumerate decision lists (<= 2 rules + default) whose rule version
     spaces are non-empty. Returns skeletons {rules:[{p, kind, vs}], def}. */
  function decisionLists(items, preds, cap) {
    var kinds = ["recolor", "del", "move", "moverc", "copy"], out = [];
    var needs = items.filter(function (it) { return !allows(it, "keep"); });
    if (!needs.length) return out;
    ["keep", "del"].forEach(function (def) {
      var defOK = items.map(function (it) { return def === "keep" ? (allows(it, "keep") || it.fate.kind === "mixed") : allows(it, "del"); });
      var need = items.filter(function (it, i) { return !defOK[i]; });
      if (!need.length) return;
      /* one rule */
      kinds.forEach(function (K) {
        if (K === def) return;
        var cover = need.filter(function (it) { return allows(it, K); });
        if (cover.length !== need.length) return;
        var vs = actionVS(need, K);
        if (!vs) return;
        /* entities where the rule would be wrong must be excluded by the
           predicate: those that do not allow K with an expression in vs */
        var F = [], T = need.slice();
        items.forEach(function (it, i) {
          if (!defOK[i]) return;
          if (!compatible(it, K, vs)) F.push(it);
        });
        var ps = predVS(preds, T, F, 4);
        ps.forEach(function (p) { out.push({ rules: [{ p: p, kind: K, vs: vs }], def: def }); });
      });
      /* two rules: partition the needy entities by kind / expression */
      if (out.length >= cap) return;
      kinds.forEach(function (K1) {
        kinds.forEach(function (K2) {
          if (K1 === def || K2 === def) return;
          var g1 = need.filter(function (it) { return allows(it, K1); });
          if (!g1.length || g1.length === need.length && K1 === K2) return;
          /* split g1 further by expression: take the largest consistent
             subset greedily (expression-driven partition) */
          var parts = splitByExpr(g1, K1);
          parts.forEach(function (part) {
            var rest = need.filter(function (it) { return part.T.indexOf(it) < 0; });
            if (!rest.length) return;
            if (rest.some(function (it) { return !allows(it, K2); })) return;
            var vs2 = actionVS(rest, K2);
            if (!vs2) return;
            /* rule 1 predicate: true on part, false on rest and on default
               entities incompatible with rule 1 */
            var F1 = rest.slice();
            items.forEach(function (it, i) { if (defOK[i] && !compatible(it, K1, part.vs)) F1.push(it); });
            var p1s = predVS(preds, part.T, F1, 2);
            p1s.forEach(function (p1) {
              var F2 = [];
              items.forEach(function (it, i) {
                if (!defOK[i] || truth(p1, it)) return;
                if (!compatible(it, K2, vs2)) F2.push(it);
              });
              var p2s = predVS(preds, rest, F2, 2);
              p2s.forEach(function (p2) {
                out.push({ rules: [{ p: p1, kind: K1, vs: part.vs }, { p: p2, kind: K2, vs: vs2 }], def: def });
              });
            });
          });
        });
      });
    });
    return out.slice(0, cap);
  }

  /* entity already satisfied by the default, but would the rule's action
     (with SOME expression of the version space) also leave it right? */
  function compatible(it, kind, vs) {
    if (!allows(it, kind)) return false;
    var r = consistentExprs(it, kind);
    if (!r) return false;
    var ok = false;
    if (kind === "recolor") vs.c.forEach(function (x, k) {
      if (r.c.has(k)) ok = true;
      else if (x.tab) {
        var v = x.f(it.sc, it.e);
        for (var j = 0; j < it.obs.length; j++) if (it.obs[j].kind === "recolor" && it.obs[j].c === v) ok = true;
      }
    });
    else if (kind === "del") ok = true;
    else vs.v.forEach(function (x, k) { if (r.v.has(k)) ok = true; });
    return ok;
  }

  /* partition entities allowing kind K by the expression that explains
     them: the largest group sharing a non-empty version space first */
  function splitByExpr(items, K) {
    if (K === "del") return [{ T: items, vs: { v: null, c: null } }];
    var counts = new Map(), i;
    items.forEach(function (it) {
      var r = consistentExprs(it, K);
      if (!r) return;
      var m = K === "recolor" ? r.c : r.v;
      m.forEach(function (x, k) { counts.set(k, (counts.get(k) || 0) + 1); });
    });
    var keys = Array.from(counts.keys()).sort(function (a, b) { return counts.get(b) - counts.get(a); }).slice(0, 4);
    var out = [];
    for (i = 0; i < keys.length; i++) {
      var T = items.filter(function (it) {
        var r = consistentExprs(it, K); if (!r) return false;
        return (K === "recolor" ? r.c : r.v).has(keys[i]);
      });
      var vs = actionVS(T, K);
      if (vs) out.push({ T: T, vs: vs });
    }
    return out;
  }

  /* Programs from a skeleton: every combination of the cheapest expressions
     (bounded), so disagreeing members of the version space all compete. */
  function instantiate(sk, seg, bg, canvas, capPer) {
    var progs = [[]];
    sk.rules.forEach(function (r) {
      var choices = [];
      if (r.kind === "del") choices.push({ kind: "del" });
      else if (r.kind === "recolor") sortedExprs(r.vs.c, capPer).forEach(function (c) { choices.push({ kind: "recolor", c: c }); });
      else if (r.kind === "moverc") sortedExprs(r.vs.v, capPer).forEach(function (v) {
        sortedExprs(r.vs.c, 2).forEach(function (c) { choices.push({ kind: "moverc", v: v, c: c }); });
      });
      else sortedExprs(r.vs.v, capPer).forEach(function (v) { choices.push({ kind: r.kind, v: v }); });
      var next = [];
      progs.forEach(function (pre) { choices.forEach(function (a) { next.push(pre.concat([{ p: r.p, a: a }])); }); });
      progs = next.slice(0, 64);
    });
    return progs.map(function (rules) { return { seg: seg, bg: bg, rules: rules, def: sk.def, grow: [], canvas: canvas }; });
  }

  /* ------------------------------------------------------------ growth */
  /* Induce growth rules (62a-genops.js operators) explaining the cells
     `created` (per demo) that the object program left wrong. For every
     operator and entity: the paint must agree with the output everywhere it
     paints (a single colour, whose COLOR version space is intersected over
     the rule's entities, or the copied patch colours exactly) -- "good" when
     it also creates something, "bad" when it contradicts, "idle" otherwise.
     The rule's predicate must hold on the good entities and fail on the bad. */
  function induceGrowth(demos, preds, cap, deadline) {
    var cands = [], oi;
    for (oi = 0; oi < GEN.OPS.length; oi++) {
      if (deadline && nowMs() > deadline) break;
      var op = GEN.OPS[oi], goods = [], bads = [], covered = 0, t, i, j, C = null, dead = false, gobs = [];
      for (t = 0; t < demos.length && !dead; t++) {
        var D = demos[t];
        for (i = 0; i < D.items.length; i++) {
          var it = D.items[i], res = GEN.apply(D.sc, it.e, D.canvas, op);
          if (!res || !res.cells.length) continue;
          var good = true, useful = 0, col = -1;
          for (j = 0; j < res.cells.length; j++) {
            var p = res.cells[j], yv = D.y[p >> 6][p & 63];
            if (res.cols) { if (yv !== res.cols[j]) { good = false; break; } }
            else if (col < 0) col = yv; else if (yv !== col) { good = false; break; }
            if (D.created.has(p)) useful++;
          }
          if (good && !res.cols && col === D.sc.bg) good = false;
          if (!good) { bads.push(it); continue; }
          if (!useful) continue;
          covered += useful;
          goods.push(it);
          if (!res.cols) {
            gobs.push({ sc: it.sc, e: it.e, c: col });
            if (C === null || C.size) {
              var m = new Map();
              for (var ci = 0; ci < COLOR_EXPRS.length; ci++) if (COLOR_EXPRS[ci].f(it.sc, it.e) === col) m.set(COLOR_EXPRS[ci].k, COLOR_EXPRS[ci]);
              C = C === null ? m : intersectMaps(C, m);
            }
          }
        }
      }
      if (dead || !goods.length) continue;
      if (C && !C.size) {
        /* colours differ by entity with no shared relation: fitted table */
        var tabs = EXPR.fitTables(gobs);
        if (!tabs.length) continue;
        C = new Map();
        tabs.forEach(function (tb) { C.set(tb.k, tb); });
      }
      var ps = predVS(preds, goods, bads, 2);
      if (!ps.length) continue;
      cands.push({ op: op, C: C, ps: ps, covered: covered });
    }
    cands.sort(function (a, b) { return (b.covered - a.covered) || (a.op.b - b.op.b); });
    return cands.slice(0, cap);
  }

  /* ------------------------------------------------------------ driver */
  function paletteOf(ctx) {
    return G.csList(G.csUnion(ctx.in_palette(), ctx.out_palette()));
  }

  function canvasColor(ctx, bg) {
    /* untouched background of every input becomes one colour c != bg */
    var c = -1, t, r, k;
    for (t = 0; t < ctx.train.length; t++) {
      var x = ctx.train[t][0], y = ctx.train[t][1], cnt = new Int32Array(10), tot = 0;
      for (r = 0; r < x.length; r++) for (k = 0; k < x[0].length; k++) if (x[r][k] === bg) { cnt[y[r][k]]++; tot++; }
      var best = 0;
      for (k = 1; k < 10; k++) if (cnt[k] > cnt[best]) best = k;
      if (best === bg || cnt[best] < tot * 0.5) return -1;
      if (c < 0) c = best; else if (c !== best) return -1;
    }
    return c;
  }

  function verify(prog, ctx) {
    for (var t = 0; t < ctx.train.length; t++) {
      var out;
      try { out = run(prog, ctx.train[t][0]); } catch (e) { return false; }
      if (!out || !G.gEq(out, ctx.train[t][1])) return false;
    }
    return true;
  }

  /* residual of a program on each demo: the cells it leaves wrong */
  function residual(prog, ctx) {
    var res = [], t;
    for (t = 0; t < ctx.train.length; t++) {
      var out = null, y = ctx.train[t][1], x = ctx.train[t][0];
      try { out = run(prog, x); } catch (e) { out = null; }
      if (!out) return null;
      var wrong = new Set(), r, c;
      for (r = 0; r < y.length; r++) for (c = 0; c < y[0].length; c++) if (out[r][c] !== y[r][c]) wrong.add((r << 6) | c);
      res.push({ out: out, wrong: wrong });
    }
    return res;
  }

  var STATS = null;

  /* Synthesize for one segmentation. */
  function forSeg(ctx, seg, bg, deadline, found, seen, canvas) {
    var demos = [], allItems = [], t, i;
    for (t = 0; t < ctx.train.length; t++) {
      var x = ctx.train[t][0], y = ctx.train[t][1];
      var sc = SCN.of(x, seg, bg);
      if (!sc) return;
      var fates = CORR.fates(sc, y);
      if (!fates) return;
      var items = [];
      for (i = 0; i < sc.ents.length; i++) {
        var item = { sc: sc, e: sc.ents[i], fate: fates[i], t: t };
        item.obs = observe(item, x, y, bg);
        items.push(item); allItems.push(item);
      }
      demos.push({ sc: sc, x: x, y: y, items: items });
    }
    for (t = 0; t < ctx.test_inputs.length; t++) if (!SCN.of(ctx.test_inputs[t], seg, bg)) return;
    var preds = predCatalog(allItems, paletteOf(ctx)), nearCount = 0;
    if (nowMs() > deadline) return;
    function tryProg(p, why) {
      if (STATS) STATS.executed++;
      var key = progKey(p);
      if (seen.has(key)) return false;
      seen.add(key);
      if (!verify(p, ctx)) {
        /* near-miss bookkeeping for the failure taxonomy: a program that
           reproduces all demonstrations but one */
        if (ctx.train.length >= 2 && !ctx._sketchNear && nearCount < 60) {
          nearCount++;
          var fit = 0;
          for (var d0 = 0; d0 < ctx.train.length; d0++) {
            var o0 = null; try { o0 = run(p, ctx.train[d0][0]); } catch (e0) { o0 = null; }
            if (o0 && G.gEq(o0, ctx.train[d0][1])) fit++;
          }
          if (fit === ctx.train.length - 1) ctx._sketchNear = key;
        }
        return false;
      }
      p.why = why;
      found.push(p);
      return true;
    }
    /* 1. object rules (identity default when nothing needs an action);
       then the relaxed pass, whose programs mainly seed growth */
    var base = [];
    [false, true].forEach(function (relax) {
      if (nowMs() > deadline) return;
      RELAX = relax;
      var skels = decisionLists(allItems, preds, 24);
      RELAX = false;
      for (var s0 = 0; s0 < skels.length && nowMs() < deadline; s0++) {
        var progs = instantiate(skels[s0], seg, bg, canvas, relax ? 2 : 4);
        for (var j = 0; j < progs.length && nowMs() < deadline; j++) {
          if (tryProg(progs[j], relax ? "relaxed" : "rules")) continue;
          base.push(progs[j]);
        }
      }
    });
    /* 1b. sequential falls (gravity with stacking): the moved entities
       select themselves; direction literal or toward a related entity */
    var movers = allItems.filter(function (it) { return it.fate.kind === "vacated" || (it.fate.kind === "recolor" && it.e.ncol === 1); });
    if (movers.length && movers.length <= 40 && nowMs() < deadline) {
      var still = allItems.filter(function (it) { return it.fate.kind === "same"; });
      var fps = predVS(preds, movers, [], 3).concat(predVS(preds, movers, still, 3));
      var fcol = [null];
      var recs = movers.filter(function (it) { return it.fate.kind === "recolor"; });
      if (recs.length) {
        var cm = null;
        recs.forEach(function (it) {
          var m = new Map();
          COLOR_EXPRS.forEach(function (ce) { if (ce.f(it.sc, it.e) === it.fate.c) m.set(ce.k, ce); });
          cm = cm === null ? m : intersectMaps(cm, m);
        });
        fcol = cm && cm.size ? sortedExprs(cm, 2) : [];
      }
      var fdirs = [0, 1, 2, 3, "nearB", "big", "near"];
      for (var fi = 0; fi < fdirs.length && nowMs() < deadline; fi++)
        for (var fj = 0; fj < fps.length; fj++) for (var fk = 0; fk < fcol.length; fk++)
          tryProg({ seg: seg, bg: bg, rules: [{ p: fps[fj], a: { kind: "fall", d: fdirs[fi], c: fcol[fk] } }], def: "keep", grow: [], canvas: canvas }, "fall");
    }
    /* 2. growth on top of the best object programs (or of identity):
       the object program's residual becomes the growth task (CEGIS) */
    var starts = [{ seg: seg, bg: bg, rules: [], def: "keep", grow: [], canvas: canvas }].concat(base.slice(0, 10));
    for (i = 0; i < starts.length && nowMs() < deadline; i++) {
      var st = starts[i], R = residual(st, ctx);
      if (!R) continue;
      var creatable = true, dd = [];
      for (t = 0; t < demos.length; t++) {
        var created = new Set();
        R[t].wrong.forEach(function (p) { created.add(p); });
        if (!creatable) break;
        dd.push({ sc: demos[t].sc, y: demos[t].y, items: demos[t].items, created: created, canvas: R[t].out });
      }
      if (!creatable) continue;
      var gc = induceGrowth(dd, preds, 6, deadline);
      for (var a = 0; a < gc.length && nowMs() < deadline; a++) {
        var g1 = gc[a], cexprs = g1.C ? sortedExprs(g1.C, 3) : [null];
        for (var b = 0; b < cexprs.length; b++) for (var q = 0; q < g1.ps.length; q++) {
          var G1 = { op: g1.op, c: cexprs[b], b: g1.op.b };
          var p1 = { seg: seg, bg: bg, rules: st.rules, def: st.def, grow: [{ p: g1.ps[q], g: G1 }], canvas: canvas };
          if (tryProg(p1, "grow")) continue;
          /* second growth rule on the remaining residual */
          if (a < 3 && b === 0 && q === 0) {
            var R2 = residual(p1, ctx);
            if (!R2) continue;
            var dd2 = [], ok2 = true;
            for (t = 0; t < demos.length; t++) {
              var cr2 = new Set();
              R2[t].wrong.forEach(function (p) { cr2.add(p); });
              dd2.push({ sc: demos[t].sc, y: demos[t].y, items: demos[t].items, created: cr2, canvas: R2[t].out });
            }
            if (!ok2) continue;
            var gc2 = induceGrowth(dd2, preds, 3, deadline);
            for (var a2 = 0; a2 < gc2.length; a2++) {
              var cx2 = gc2[a2].C ? sortedExprs(gc2[a2].C, 2) : [null];
              for (var b2 = 0; b2 < cx2.length; b2++) {
                var G2 = { op: gc2[a2].op, c: cx2[b2], b: gc2[a2].op.b };
                tryProg({ seg: seg, bg: bg, rules: st.rules, def: st.def, grow: [{ p: g1.ps[q], g: G1 }, { p: gc2[a2].ps[0], g: G2 }], canvas: canvas }, "grow2");
              }
            }
          }
        }
      }
    }
  }

  function synthesize(ctx, deadline, opts) {
    opts = opts || {};
    if (!ctx.same_shape()) return [];
    var bg = ctx.bg(), found = [], seen = new Set();
    var canvas = canvasColor(ctx, bg);
    var segs = opts.segs || SCN.SEGS, i;
    for (i = 0; i < segs.length && nowMs() < deadline; i++) {
      forSeg(ctx, segs[i], bg, deadline, found, seen, canvas);
      if (canvas >= 0) forSeg(ctx, segs[i], bg, deadline, found, seen, -1);
      if (found.length >= 40) break;
    }
    return found;
  }

  /* Roles of a program on a grid: for each rule, the entities it selected
     and the entities its relational expressions referred to. Used by the
     referent-consistency evidence (64-mdl.js). */
  function roles(prog, grid) {
    var sc = SCN.of(grid, prog.seg, prog.bg);
    if (!sc) return null;
    var out = [], i, j, rest = { sel: [], ref: [] };
    prog.rules.forEach(function () { out.push({ sel: [], ref: [] }); });
    (prog.grow || []).forEach(function () { out.push({ sel: [], ref: [] }); });
    for (i = 0; i < sc.ents.length; i++) {
      var e = sc.ents[i], any = false;
      for (j = 0; j < prog.rules.length; j++) if (prog.rules[j].p.f(sc, e)) {
        any = true;
        out[j].sel.push(e);
        var a = prog.rules[j].a;
        [a.c, a.v].forEach(function (x) { if (x && x.rel) { var o = rel(sc, x.rel, e); if (o) out[j].ref.push(o); } });
        break;
      }
      (prog.grow || []).forEach(function (R, k) {
        if (!R.p.f(sc, e)) return;
        any = true;
        var slot = out[prog.rules.length + k];
        slot.sel.push(e);
        var r = R.g.op.r || R.g.op.tpl || (R.g.op.about !== "self" ? R.g.op.about : null);
        if (typeof r === "string" && REL_BY[r]) { var o = rel(sc, r, e); if (o) slot.ref.push(o); }
        if (R.g.c && R.g.c.rel) { var o2 = rel(sc, R.g.c.rel, e); if (o2) slot.ref.push(o2); }
      });
      /* the complement role: what no rule touched is also taught */
      if (!any) rest.sel.push(e);
    }
    out.push(rest);
    return out;
  }

  /* Diagnostic (development measurement only): for each segmentation, how
     much of the created residual the best single operator explains when
     applied to its consistent entities, ignoring whether a predicate can
     select them. Separates "no operator expresses it" from "no predicate
     selects it". */
  function explainGap(ctx) {
    if (!ctx.same_shape()) return null;
    var bg = ctx.bg(), best = { frac: 0 }, si;
    for (si = 0; si < SCN.SEGS.length; si++) {
      var seg = SCN.SEGS[si], demos = [], t, ok = true, total = 0;
      for (t = 0; t < ctx.train.length; t++) {
        var x = ctx.train[t][0], y = ctx.train[t][1], sc = SCN.of(x, seg, bg);
        if (!sc) { ok = false; break; }
        var created = new Set(), r, c;
        for (r = 0; r < y.length; r++) for (c = 0; c < y[0].length; c++) if (x[r][c] !== y[r][c] && x[r][c] === bg) created.add((r << 6) | c);
        total += created.size;
        demos.push({ sc: sc, y: y, created: created, canvas: x, items: sc.ents.map(function (e) { return { sc: sc, e: e }; }) });
      }
      if (!ok || !total) continue;
      for (var oi = 0; oi < GEN.OPS.length; oi++) {
        var op = GEN.OPS[oi], got = 0, bad = 0;
        demos.forEach(function (D) {
          D.items.forEach(function (it) {
            var res = GEN.apply(D.sc, it.e, D.canvas, op);
            if (!res || !res.cells.length) return;
            var good = true, col = -1, u = 0;
            for (var j = 0; j < res.cells.length; j++) {
              var p = res.cells[j], yv = D.y[p >> 6][p & 63];
              if (res.cols ? yv !== res.cols[j] : (col < 0 ? (col = yv, false) : yv !== col)) { good = false; break; }
              if (D.created.has(p)) u++;
            }
            if (good) got += u; else bad++;
          });
        });
        var frac = got / total;
        if (frac > best.frac) best = { frac: frac, op: op.key, seg: seg, bad: bad };
      }
    }
    return best;
  }

  return { synthesize: synthesize, run: run, progKey: progKey, explainGap: explainGap, roles: roles, actionKey: actionKey, growKey: growKey,
           RELS: RELS, COLOR_EXPRS: COLOR_EXPRS, VEC_EXPRS: VEC_EXPRS, INT_EXPRS: INT_EXPRS,
           predCatalog: predCatalog, predVS: predVS, verify: verify, residual: residual,
           stats: function (s) { if (s !== undefined) STATS = s; return STATS; } };
})();
