/* ===== src/17-representation.js ===== */
/* Representations: the substrate a rule is written in.
 *
 * The same task can be a long program over raw cells and a one-step program
 * over colour roles, or over the grid's content crop, or over the CHANGES a
 * rule makes rather than the whole output. Search inside one substrate can
 * be arbitrarily hard while the right substrate makes it trivial, so the
 * choice of substrate is itself something to search over -- guided by
 * evidence, not run blindly.
 *
 * A representation here is an executable re-posing of the task:
 *
 *   kind "frame"   a bijection applied to input AND output of every pair
 *                  (colour roles per grid, a canonical task palette, one of
 *                  the square symmetries); decode inverts it.
 *   kind "input"   a view of the input only (content crop, largest object,
 *                  separator lines stripped); outputs are unchanged.
 *   kind "output"  an encoding of the output with an exact decoder (the
 *                  change mask over the input, a downscaled or single-tile
 *                  output). Applicable only when decode(encode(y)) == y on
 *                  every demonstration.
 *   kind "view"    analysis only (objects, relation graph, panels, runs,
 *                  symmetry orbits, periods): features for scoring and
 *                  diagnosis, never executed.
 *
 * REPRESENT.register(name, spec)          add a representation
 * REPRESENT.encode(name, grid, ctx, i)    one grid into the representation
 * REPRESENT.taskIn(ctx, name)             the whole task re-posed (a Ctx)
 * REPRESENT.wrap(hyp, name, st, ctx)      a hypothesis found in the
 *                                         representation, decoded back
 * REPRESENT.features(name, encoded)       features of an encoded grid
 * REPRESENT.score(name, ctx, residual)    evidence that it simplifies the task
 * REPRESENT.rank(ctx, opts)               scored, applicable representations
 * REPRESENT.propose(ctx, residual, hyp)   which to try for a failing
 *                                         hypothesis, and why
 * REPRESENT.migrate(prog, name, ctx)      carry a program into another
 *                                         substrate (typed literals remapped,
 *                                         then refitted on all evidence)
 *
 * Scores use training pairs only. A representation that does not simplify
 * the demonstrations is not proposed; the registry never runs every
 * representation by default.
 */

var REPRESENT = null;

(function () {
  var REGISTRY = {}, ORDER = [];
  var DIH = [["rot90", G.rot90, G.rot270], ["rot180", G.rot180, G.rot180], ["rot270", G.rot270, G.rot90],
             ["flip_h", G.flipH, G.flipH], ["flip_v", G.flipV, G.flipV],
             ["transpose", G.transpose, G.transpose], ["anti_transpose", G.antiTranspose, G.antiTranspose]];

  function register(name, spec) {
    spec.name = name;
    spec.kind = spec.kind || "frame";
    spec.cost = spec.cost === undefined ? 2.0 : spec.cost;
    if (!REGISTRY[name]) ORDER.push(name);
    REGISTRY[name] = spec;
    return spec;
  }
  function get(name) { return REGISTRY[name] || null; }

  function mapGrid(g, p) { return g.map(function (row) { return row.map(function (v) { return p[v]; }); }); }
  function sameDims(a, b) { return !!(a && b && a.length === b.length && a[0].length === b[0].length); }

  /* ------------------------------------------------------ executable ones */

  register("raw", { kind: "frame", cost: 0,
    applicable: function () { return true; },
    prepare: function () { return {}; },
    encodeIn: function (g) { return g; }, encodeOut: function (y) { return y; },
    decode: function (y) { return y; } });

  /* Colour roles, per grid: background -> 0, then by frequency. The same
     rule over differently coloured demonstrations becomes one rule. */
  register("roles", { kind: "frame", cost: 2.0,
    applicable: function (ctx) {
      var pals = new Set(), i;
      for (i = 0; i < ctx.train.length; i++) pals.add(G.palette(ctx.train[i][0]));
      return pals.size > 1 || ctx.bg() !== 0;
    },
    prepare: function (ctx) { return { bg: null }; },
    encodeIn: function (g) { return mapGrid(g, CANON.rolePerm(g).fwd); },
    encodeOut: function (y, x) { return mapGrid(y, CANON.rolePerm(x).fwd); },
    decode: function (y, x) { return mapGrid(y, CANON.rolePerm(x).inv); } });

  /* One canonical palette for the whole task (bijection from task-wide
     colour frequency): literal colours become comparable across frames. */
  register("canon", { kind: "frame", cost: 1.0,
    applicable: function (ctx) { return !!taskPerm(ctx); },
    prepare: function (ctx) { return taskPerm(ctx); },
    encodeIn: function (g, st) { return mapGrid(g, st.fwd); }, encodeOut: function (y, x, st) { return mapGrid(y, st.fwd); },
    decode: function (y, x, st) { return mapGrid(y, st.inv); } });
  function taskPerm(ctx) {
    return ctx.memo("rep_taskperm", function () {
      var count = new Array(10).fill(0), i, r, c;
      function tally(g) { for (r = 0; r < g.length; r++) for (c = 0; c < g[r].length; c++) count[g[r][c]]++; }
      for (i = 0; i < ctx.train.length; i++) { tally(ctx.train[i][0]); tally(ctx.train[i][1]); }
      for (i = 0; i < ctx.test_inputs.length; i++) tally(ctx.test_inputs[i]);
      var order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort(function (a, b) { return (count[b] - count[a]) || (a - b); });
      var fwd = new Array(10), inv = new Array(10), ident = true;
      for (i = 0; i < 10; i++) { fwd[order[i]] = i; inv[i] = order[i]; }
      for (i = 0; i < 10; i++) if (fwd[i] !== i && count[i] > 0) { ident = false; break; }
      return ident ? null : { fwd: fwd, inv: inv };
    });
  }

  DIH.forEach(function (d) {
    register("dih:" + d[0], { kind: "frame", cost: 3.0,
      applicable: function () { return true; },
      prepare: function () { return {}; },
      encodeIn: function (g) { return d[1](g); }, encodeOut: function (y) { return d[1](y); },
      decode: function (y) { return d[2](y); } });
  });

  register("crop", { kind: "input", cost: 2.0,
    applicable: function (ctx) {
      return !ctx.same_shape() && ctx.all_inputs().every(function (g) {
        var c = G.cropToContent(g, ctx.bg()); return c && !G.gEq(c, g); });
    },
    prepare: function (ctx) { return { bg: ctx.bg() }; },
    encodeIn: function (g, st) { return G.cropToContent(g, st.bg); } });

  register("largest", { kind: "input", cost: 3.0,
    applicable: function (ctx) { return !ctx.same_shape(); },
    prepare: function (ctx) { return { bg: ctx.bg() }; },
    encodeIn: function (g, st) {
      var objs; try { objs = O.segment(g, "c8", st.bg); } catch (e) { return null; }
      if (!objs || !objs.length) return null;
      var o = O.selectExtreme(objs, "size", true);
      return o ? G.subgrid(g, o.r0, o.c0, o.r1, o.c1) : null;
    } });

  register("strip", { kind: "input", cost: 2.5,
    applicable: function (ctx) { return ctx.all_inputs().some(function (g) { return !!stripLines(g); }); },
    prepare: function () { return {}; },
    encodeIn: function (g) { return stripLines(g) || g; } });
  function stripLines(g) {
    var h = g.length, w = g[0].length, keepR = [], r, c, uni;
    for (r = 0; r < h; r++) { uni = true; for (c = 1; c < w; c++) if (g[r][c] !== g[r][0]) { uni = false; break; } if (!uni) keepR.push(g[r]); }
    if (!keepR.length || keepR.length === h) return null;
    var t = G.transpose(keepR), keepC = [];
    for (r = 0; r < t.length; r++) { uni = true; for (c = 1; c < t[r].length; c++) if (t[r][c] !== t[r][0]) { uni = false; break; } if (!uni) keepC.push(t[r]); }
    return keepC.length ? G.transpose(keepC) : null;
  }

  /* The change a rule makes, drawn on the background; decoded as an overlay
     on the input. Exact only when no demonstrated change is TO the
     background colour, which applicable() checks. */
  register("change", { kind: "output", cost: 2.0,
    applicable: function (ctx) {
      if (!ctx.same_shape()) return false;
      var bg = ctx.bg(), i, any = false;
      for (i = 0; i < ctx.train.length; i++) {
        var x = ctx.train[i][0], y = ctx.train[i][1], e = changeEnc(y, x, bg);
        if (!G.gEq(changeDec(e, x, bg), y)) return false;
        if (!G.gEq(x, y)) any = true;
      }
      return any;
    },
    prepare: function (ctx) { return { bg: ctx.bg() }; },
    encodeOut: function (y, x, st) { return changeEnc(y, x, st.bg); },
    decode: function (y, x, st) { return sameDims(y, x) ? changeDec(y, x, st.bg) : null; } });
  function changeEnc(y, x, bg) { return y.map(function (row, r) { return row.map(function (v, c) { return v === x[r][c] ? bg : v; }); }); }
  function changeDec(e, x, bg) { return e.map(function (row, r) { return row.map(function (v, c) { return v === bg ? x[r][c] : v; }); }); }

  /* Outputs that are an integer upscale / a tiling of something smaller. */
  function outRatio(ctx, fn) {
    var ks = null, i;
    for (i = 0; i < ctx.train.length; i++) {
      var y = ctx.train[i][1], found = null, k;
      for (k = 2; k <= 5 && !found; k++) if (!(y.length % k) && !(y[0].length % k) && fn(y, k)) found = k;
      if (!found || (ks !== null && ks !== found)) return null;
      ks = found;
    }
    return ks;
  }
  register("down", { kind: "output", cost: 2.5,
    applicable: function (ctx) { return !!ctx.memo("rep_down", function () { return outRatio(ctx, function (y, k) { var d = G.downscale(y, k, k); return d && G.gEq(G.upscale(d, k, k), y); }); }); },
    prepare: function (ctx) { return { k: ctx.memo("rep_down", function () { return null; }) }; },
    encodeOut: function (y, x, st) { return G.downscale(y, st.k, st.k); },
    decode: function (y, x, st) { return G.upscale(y, st.k, st.k); } });
  register("tilebase", { kind: "output", cost: 2.5,
    applicable: function (ctx) { return !!ctx.memo("rep_tile", function () { return outRatio(ctx, function (y, k) {
      var b = G.subgrid(y, 0, 0, y.length / k - 1, y[0].length / k - 1); return b && G.gEq(G.tile(b, k, k), y); }); }); },
    prepare: function (ctx) { return { k: ctx.memo("rep_tile", function () { return null; }) }; },
    encodeOut: function (y, x, st) { return G.subgrid(y, 0, 0, y.length / st.k - 1, y[0].length / st.k - 1); },
    decode: function (y, x, st) { return G.tile(y, st.k, st.k); } });

  /* --------------------------------------------------------- analysis views
     Never executed. Their features feed scoring and diagnosis. */
  register("objects", { kind: "view", cost: 0, features: function (g, bg) {
    var objs; try { objs = O.segment(g, "c8", bg); } catch (e) { objs = []; }
    var sizes = objs.map(function (o) { return o.size(); });
    return { n: objs.length, colors: new Set(objs.map(function (o) { return o.color; })).size,
             shapes: new Set(objs.map(function (o) { return o.norm_key(); })).size,
             maxSize: sizes.length ? Math.max.apply(null, sizes) : 0 };
  } });
  register("relations", { kind: "view", cost: 0, features: function (g, bg) {
    var objs; try { objs = O.segment(g, "c8", bg); } catch (e) { objs = []; }
    var adj = 0, contain = 0, i, j;
    for (i = 0; i < objs.length && i < 30; i++) for (j = i + 1; j < objs.length && j < 30; j++) {
      var a = objs[i], b = objs[j];
      if (a.r0 <= b.r0 && a.c0 <= b.c0 && a.r1 >= b.r1 && a.c1 >= b.c1) contain++;
      else if (!(a.r1 + 1 < b.r0 || b.r1 + 1 < a.r0 || a.c1 + 1 < b.c0 || b.c1 + 1 < a.c0)) adj++;
    }
    return { adjacency: adj, containment: contain };
  } });
  register("panels", { kind: "view", cost: 0, features: function (g) {
    var s = stripLines(g);
    return { separated: !!s, panelArea: s ? G.area(s) : G.area(g) };
  } });
  register("runs", { kind: "view", cost: 0, features: function (g) {
    var h = 0, v = 0, r, c;
    for (r = 0; r < g.length; r++) for (c = 1; c < g[0].length; c++) if (g[r][c] === g[r][c - 1]) h++;
    for (r = 1; r < g.length; r++) for (c = 0; c < g[0].length; c++) if (g[r][c] === g[r - 1][c]) v++;
    return { horizontalRuns: h, verticalRuns: v };
  } });
  register("symmetry", { kind: "view", cost: 0, features: function (g) {
    var out = {};
    DIH.forEach(function (d) { var t = d[1](g); out[d[0]] = sameDims(t, g) && G.gEq(t, g) ? 1 : 0; });
    return out;
  } });
  register("period", { kind: "view", cost: 0, features: function (g) {
    return { rowPeriod: G.rowPeriod ? G.rowPeriod(g) : null, colPeriod: G.colPeriod ? G.colPeriod(g) : null };
  } });

  /* ------------------------------------------------------------- encoding */

  function prepared(ctx, name) {
    var spec = REGISTRY[name];
    if (!spec || spec.kind === "view") return null;
    return ctx.memo("rep_state:" + name, function () {
      try { return spec.applicable(ctx) ? { spec: spec, st: spec.prepare(ctx) || {} } : false; } catch (e) { return false; }
    }) || null;
  }
  function applicable(ctx, name) { return !!prepared(ctx, name); }

  function encIn(p, g) {
    if (!p.spec.encodeIn) return g;
    try { var y = p.spec.encodeIn(g, p.st); return y && G.valid(y) ? y : null; } catch (e) { return null; }
  }
  function encOut(p, y, x) {
    if (!p.spec.encodeOut) return y;
    try { var z = p.spec.encodeOut(y, x, p.st); return z && G.valid(z) ? z : null; } catch (e) { return null; }
  }
  function dec(p, y, x) {
    if (!y) return null;
    if (!p.spec.decode) return y;
    try { var z = p.spec.decode(y, x, p.st); return z && G.valid(z) ? z : null; } catch (e) { return null; }
  }

  function encode(name, grid, ctx) {
    var p = prepared(ctx, name);
    if (p) return encIn(p, grid);
    var spec = REGISTRY[name];
    return spec && spec.features ? spec.features(grid, ctx.bg()) : null;
  }
  function features(name, encoded, ctx) {
    var spec = REGISTRY[name];
    if (spec && spec.features) return spec.features(encoded, ctx ? ctx.bg() : 0);
    if (!encoded || !encoded.length) return null;
    return { h: encoded.length, w: encoded[0].length, palette: G.csSize(G.palette(encoded)) };
  }

  /* The task re-posed in representation ``name`` (a new Ctx), or null when
     some grid cannot be encoded. */
  function taskIn(ctx, name, deadline) {
    var p = prepared(ctx, name);
    if (!p) return null;
    var train = [], tests = [], i;
    for (i = 0; i < ctx.train.length; i++) {
      var x = ctx.train[i][0], y = ctx.train[i][1];
      var ex = encIn(p, x), ey = p.spec.kind === "input" ? y : encOut(p, y, x);
      if (!ex || !ey) return null;
      if (p.spec.kind === "output" && !G.gEq(dec(p, ey, x), y)) return null;
      train.push([ex, ey]);
    }
    for (i = 0; i < ctx.test_inputs.length; i++) {
      var tx = encIn(p, ctx.test_inputs[i]);
      if (!tx) return null;
      tests.push(tx);
    }
    var sub = new Ctx(train, tests, deadline === undefined ? ctx.deadline : deadline);
    sub.op_prior = ctx.op_prior;
    sub._repOf = { name: name, parent: ctx };
    return sub;
  }

  /* Run ``fn`` (a function on encoded grids) in representation ``name``:
     a function on raw grids. */
  function lift(fn, name, ctx) {
    var p = prepared(ctx, name);
    if (!p) return null;
    return function (x) {
      var ex = encIn(p, x);
      if (!ex) return null;
      var y;
      try { y = fn(ex); } catch (e) { return null; }
      if (!y || !G.valid(y)) return null;
      return p.spec.kind === "input" ? y : dec(p, y, x);
    };
  }
  function wrap(hyp, name, ctx, extraCost) {
    var f = lift(function (g) { return hyp.apply(g); }, name, ctx);
    if (!f) return null;
    var h = new Hyp(hyp.name + "@" + name, f, hyp.cost + (extraCost === undefined ? REGISTRY[name].cost / 8 : extraCost), hyp.solver);
    h.representation = name;
    if (hyp.prog) h.innerProg = hyp.prog;
    return h;
  }

  /* --------------------------------------------------------------- scoring
     Evidence, on demonstrations only, that the representation SIMPLIFIES
     the task. Terms (each in [0,1] unless noted):
       palette   the encoded outputs share one palette across pairs
       mapping   one cellwise colour table (encoded input -> encoded output)
                 explains the same-shape pairs: 1 - conflicting keys / keys
       residue   cells that table leaves unexplained, as a fraction (lower
                 is better; enters negatively)
       shape     the output-shape law is consistent across pairs
       shrink    how much smaller the encoded outputs are (output kinds)
     score = 1.5 palette + 2 mapping - 2 residue + shape + 1.5 shrink
             - cost / 4, compared against the raw representation's score. */
  function evidence(ctx, name) {
    return ctx.memo("rep_ev:" + name, function () {
      var p = prepared(ctx, name);
      if (!p) return null;
      var enc = [], i;
      for (i = 0; i < ctx.train.length; i++) {
        var x = ctx.train[i][0], y = ctx.train[i][1];
        var ex = encIn(p, x), ey = p.spec.kind === "input" ? y : encOut(p, y, x);
        if (!ex || !ey) return null;
        enc.push([ex, ey]);
      }
      var pals = enc.map(function (e) { return G.palette(e[1]); }), cnt = {}, best = 0;
      pals.forEach(function (m) { cnt[m] = (cnt[m] || 0) + 1; if (cnt[m] > best) best = cnt[m]; });
      var palette = best / enc.length;
      var tab = {}, conflicts = new Set(), cells = 0, unexplained = 0, same = 0;
      enc.forEach(function (e) {
        if (!sameDims(e[0], e[1])) return;
        same++;
        for (var r = 0; r < e[0].length; r++) for (var c = 0; c < e[0][0].length; c++) {
          var a = e[0][r][c], b = e[1][r][c];
          if (tab.hasOwnProperty(a) && tab[a] !== b) conflicts.add(a); else tab[a] = b;
        }
      });
      enc.forEach(function (e) {
        if (!sameDims(e[0], e[1])) return;
        for (var r = 0; r < e[0].length; r++) for (var c = 0; c < e[0][0].length; c++) {
          cells++;
          if (conflicts.has(e[0][r][c]) || tab[e[0][r][c]] !== e[1][r][c]) unexplained++;
        }
      });
      var keys = Object.keys(tab).length;
      var mapping = same ? 1 - conflicts.size / Math.max(1, keys) : 0;
      var residue = cells ? unexplained / cells : 1;
      var dimsSame = enc.every(function (e) { return sameDims(e[0], e[1]); });
      var constOut = enc.every(function (e) { return sameDims(e[1], enc[0][1]); });
      var shape = dimsSame || constOut ? 1 : 0;
      var rawArea = 0, encArea = 0;
      for (i = 0; i < ctx.train.length; i++) { rawArea += G.area(ctx.train[i][1]); encArea += G.area(enc[i][1]); }
      var shrink = p.spec.kind === "output" ? Math.max(0, 1 - encArea / Math.max(1, rawArea)) : 0;
      var score = 1.5 * palette + 2 * mapping - 2 * residue + shape + 1.5 * shrink - p.spec.cost / 4;
      return { name: name, kind: p.spec.kind, palette: palette, mapping: mapping, residue: residue, shape: shape,
               shrink: shrink, score: Math.round(score * 1000) / 1000 };
    });
  }

  function score(name, ctx, residual) {
    var ev = evidence(ctx, name);
    if (!ev) return null;
    var s = ev.score;
    /* a hypothesis' failure can name the representation it needs */
    if (residual && residual.diagnoses) residual.diagnoses.forEach(function (d) {
      if (d.suggest && d.suggest.indexOf(name) >= 0) s += d.strong ? 1.0 : 0.5;
    });
    if (ctx._tta && ctx._tta.repPrior && ctx._tta.repPrior[name]) s += ctx._tta.repPrior[name];
    return s;
  }

  /* Applicable executable representations, best evidence first; raw always
     included for reference. opts.kinds filters by kind. */
  function rank(ctx, opts) {
    opts = opts || {};
    var out = [];
    ORDER.forEach(function (n) {
      var spec = REGISTRY[n];
      if (spec.kind === "view") return;
      if (opts.kinds && opts.kinds.indexOf(spec.kind) < 0) return;
      var ev = evidence(ctx, n);
      if (!ev) return;
      out.push({ name: n, kind: spec.kind, score: score(n, ctx, opts.residual), evidence: ev });
    });
    var raw = out.filter(function (o) { return o.name === "raw"; })[0];
    out.forEach(function (o) { o.gain = raw ? Math.round((o.score - raw.score) * 1000) / 1000 : 0; });
    out.sort(function (a, b) { return (b.score - a.score) || (a.name < b.name ? -1 : 1); });
    return out;
  }

  /* Which substrates to try for a failing hypothesis, from its residual
     diagnoses (55-residual.js attaches ``suggest`` lists to representation
     failures) and from task evidence; only those that beat raw evidence or
     are named by a diagnosis. */
  function propose(ctx, residual, hyp, k) {
    var cur = hyp && hyp.program && hyp.program.rep ? hyp.program.rep : "raw";
    var named = {};
    ((residual && residual.diagnoses) || []).forEach(function (d) {
      (d.suggest || []).forEach(function (n) { named[n] = Math.max(named[n] || 0, d.strong ? 2 : 1); });
    });
    var list = rank(ctx, { residual: residual }).filter(function (o) {
      return o.name !== cur && o.name !== "raw" && (named[o.name] || o.gain > 0.25);
    });
    list.forEach(function (o) { o.why = named[o.name] ? "diagnosis" : "evidence"; o.score += named[o.name] || 0; });
    list.sort(function (a, b) { return (b.score - a.score) || (a.name < b.name ? -1 : 1); });
    return list.slice(0, k || 3);
  }

  /* ------------------------------------------------------------- migration
     Carry a typed tree into representation ``name``. Literal colours are
     remapped through demonstration 0's encoding (so behaviour on that pair
     is preserved where the program is colour-literal), then every literal
     slot is refitted on ALL demonstrations in the new substrate (PROG.refit,
     bounded). Returns [{tree, rep, exact}] -- refitted versions first. */
  function migrateTree(tree, name, ctx, cap) {
    var p = prepared(ctx, name);
    if (!p || p.spec.kind === "view") return [];
    var sub = taskIn(ctx, name);
    if (!sub) return [];
    var out = [], seen = new Set();
    var fwd = null;
    if (p.spec.kind === "frame" && (name === "roles" || name === "canon")) {
      var x0 = ctx.train[0][0];
      fwd = name === "roles" ? CANON.rolePerm(x0).fwd : p.st.fwd;
    }
    function remap(t) {
      if (t.op === "in") return { op: "in" };
      var kinds = PROG.OPS[t.op] ? PROG.OPS[t.op].kinds.filter(function (k) { return k !== PROG.T_GRID; }) : [];
      return { op: t.op, kids: t.kids.map(remap), params: t.params.map(function (v, i) {
        if (fwd && kinds[i] === PROG.T_COLOR && typeof v === "number") return fwd[v];
        if (fwd && (kinds[i] === PROG.T_CMAP) && v && typeof v === "object") {
          var m = {}; Object.keys(v).forEach(function (k) { m[fwd[+k]] = fwd[v[k]]; }); return m;
        }
        return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
      }) };
    }
    var moved = remap(tree), f;
    try { f = PROG.fromTree(moved); } catch (e) { return []; }
    /* refit the literals on the whole re-posed task */
    var thetas = [];
    try { thetas = PROG.refit(f.struct, sub.train, sub, cap || 6, 3000); } catch (e) { thetas = []; }
    thetas.forEach(function (th) {
      var t = PROG.toTree(f.struct, th), k = PROG.treeRender(t);
      if (seen.has(k)) return; seen.add(k);
      out.push({ tree: t, rep: name, exact: true });
    });
    var mk = PROG.treeRender(moved);
    if (!seen.has(mk)) out.push({ tree: moved, rep: name, exact: false });
    return out;
  }

  /* A generic migration record for kernel hypotheses (56-repair.js uses
     it): typed programs are remapped and refitted; opaque closures are
     re-induced by their family inside the new substrate by the caller. */
  function migrate(prog, name, ctx) {
    if (!prog) return [];
    if (!prog.base && prog.tree) return migrateTree(prog.tree, name, ctx);
    return [{ tree: prog.tree || { op: "in" }, base: prog.base, rep: name, exact: false }];
  }

  /* ---------------------------------------------------- the search stage
     A solver family that re-poses the task in the representations whose
     evidence beats raw cells (never all of them) and runs typed synthesis
     there; programs found are decoded back and verified by the portfolio
     like any other hypothesis. Near states found in a representation are
     handed to the candidate sink tagged with it, so repair continues in
     that substrate. */
  var MIN_GAIN = 0.25, STATS = { tasks: 0, tried: 0, found: 0 };
  function generateRepresent(ctx) {
    var ranked;
    try { ranked = rank(ctx).filter(function (o) { return o.name !== "raw" && o.gain > MIN_GAIN; }); } catch (e) { return []; }
    var info = { candidates: ranked.slice(0, 4).map(function (o) { return o.name + ":" + o.gain; }), tried: [] };
    ctx._repInfo = info;
    if (!ranked.length) return [];
    STATS.tasks++;
    var out = [], end = ctx.deadline === null ? nowMs() + 600 : ctx.deadline, pick = ranked.slice(0, 2), idx;
    for (idx = 0; idx < pick.length; idx++) {
      var left = end - nowMs();
      if (left < 40) break;
      var r = pick[idx], sub = taskIn(ctx, r.name, nowMs() + left / (pick.length - idx) * 0.9);
      if (!sub) continue;
      if (ctx._nearSink && ctx._nearSink.noteTyped) sub._nearSink = { noteTyped: (function (name) {
        return function (c2, st, th, d, meta) { meta = meta || {}; meta.representation = name; ctx._nearSink.noteTyped(ctx, st, th, d, meta); };
      })(r.name) };
      var progs = [];
      try { progs = SYN.search(sub, 3, 300, sub.deadline, 6, ctx.op_prior); } catch (e) { progs = []; }
      STATS.tried++;
      progs.forEach(function (pr) {
        var fn = lift(function (g) { return pr.run(g); }, r.name, ctx);
        if (!fn) return;
        var h = new Hyp("rep[" + r.name + "]:" + pr.name(), fn, 2.0 + pr.codeLength() / 8 + REGISTRY[r.name].cost / 8, "represent");
        h.representation = r.name; h.repProg = pr;
        out.push(h);
      });
      if (progs.length) STATS.found++;
      info.tried.push({ name: r.name, gain: r.gain, found: progs.length });
    }
    return out;
  }
  defSolver("represent", "represent", generateRepresent, 2, 1.0);

  REPRESENT = {
    stats: function () { return { tasks: STATS.tasks, tried: STATS.tried, found: STATS.found }; },
    MIN_GAIN: MIN_GAIN, generate: generateRepresent,
    register: register, get: get, names: function () { return ORDER.slice(); },
    applicable: applicable, prepared: prepared, encode: encode, features: features, taskIn: taskIn,
    lift: lift, wrap: wrap, evidence: evidence, score: score, rank: rank, propose: propose,
    migrate: migrate, migrateTree: migrateTree, stripLines: stripLines,
    encIn: encIn, encOut: encOut, decode: dec
  };
})();
