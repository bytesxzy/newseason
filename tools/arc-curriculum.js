/* Self-generated ARC curriculum for the repair policy.
 *
 *   node tools/arc-curriculum.js --train 600 --eval 300 [--seed 7] [--write]
 *
 * choose a symbolic program P      (typed PROG program, random parameters)
 * generate inputs x                (random grids with objects, noise, frames)
 * compute y = P(x)                 (3-4 demonstrations + 1 held-out test)
 * corrupt P into P'                (a random mutation: parameter, operator,
 *                                   deleted/inserted/reordered step)
 * run the refinement kernel from P' with the ARC adapter and log
 *   (diagnosis, repair, residual before/after, outcome, cost)
 *
 * The log trains two things:
 *   - a repair-ordering table: P(repair kind helps | diagnosis kind)
 *   - meta-controller weights: P(operation improves | state feature)
 * written to c4-arc/src/57a-repair-policy.js (then `npm run build`).
 *
 * Evaluation uses a disjoint seed and reports, for policy vs. no policy:
 * recovery rate (an exact program found from P'), generalisation (its
 * held-out test prediction equals P(test)), and mean kernel steps.
 * No ARC benchmark task, input or answer is used anywhere here.
 */
"use strict";
var fs = require("fs"), path = require("path");
var E = require("../c4-arc-engine.js");
var K = globalThis.C4ReasonKernel;
var PROG = E.PROG, R = E.REPAIR;

function rng(seed) {
  var s = seed >>> 0 || 1;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* ------------------------------------------------------------- inputs */
function randomGrid(r, style) {
  var h = 6 + Math.floor(r() * 9), w = 6 + Math.floor(r() * 9), g = [], i, j;
  for (i = 0; i < h; i++) { g.push([]); for (j = 0; j < w; j++) g[i].push(0); }
  var nobj = 2 + Math.floor(r() * 4), palette = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (var o = 0; o < nobj; o++) {
    var col = palette[Math.floor(r() * palette.length)];
    var oh = 1 + Math.floor(r() * 3), ow = 1 + Math.floor(r() * 3);
    var r0 = Math.floor(r() * (h - oh)), c0 = Math.floor(r() * (w - ow));
    var hollow = style === "shapes" && oh === 3 && ow === 3 && r() < 0.5;
    for (i = 0; i < oh; i++) for (j = 0; j < ow; j++) {
      if (hollow && i === 1 && j === 1) continue;
      if (style !== "rects" && r() < 0.15) continue;
      g[r0 + i][c0 + j] = col;
    }
  }
  if (style === "noise") for (i = 0; i < 3; i++) g[Math.floor(r() * h)][Math.floor(r() * w)] = 1 + Math.floor(r() * 9);
  return g;
}

/* ----------------------------------------------------------- programs
   Templates are trees over PROG operators (the same alphabet the solver
   uses), with parameters drawn at random. Diverse on purpose: geometry,
   recolouring, movement, gravity, filtering, cropping, scaling, symmetry
   repair, filling, object selection, and two-step compositions. */
var UNARY = [["rot90"], ["rot180"], ["flip_h"], ["flip_v"], ["transpose"], ["crop"], ["compress"],
  ["denoise"], ["bbox_fill"], ["outline"], ["connect"], ["complete"]];
function pick(r, a) { return a[Math.floor(r() * a.length)]; }
function leaf() { return { op: "in" }; }
function node(op, kid, params) { return { op: op, kids: [kid], params: params || [] }; }
function randomStep(r, kid, colors) {
  var k = r();
  if (k < 0.25) return node(pick(r, UNARY)[0], kid);
  if (k < 0.35) return node("shift", kid, [Math.floor(r() * 4)]);
  if (k < 0.45) return node("grav", kid, [Math.floor(r() * 4)]);
  if (k < 0.55) return node("move_objs", kid, [Math.floor(r() * 4)]);
  if (k < 0.65) { var a = pick(r, colors), b = pick(r, [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(function (x) { return x !== a; })); return node("replace", kid, [a, b]); }
  if (k < 0.72) return node("keepc", kid, [pick(r, colors)]);
  if (k < 0.78) return node("fill_enclosed", kid, [1 + Math.floor(r() * 9)]);
  if (k < 0.84) return node("upscale", kid, [2 + Math.floor(r() * 2)]);
  if (k < 0.90) return node("keep_only", kid, [0, Math.floor(r() * 10)]);
  if (k < 0.95) return node("pick_crop", kid, [0, Math.floor(r() * 10)]);
  return node("offset", kid, [pick(r, [-2, -1, 1, 2]), pick(r, [-2, -1, 1, 2])]);
}
function randomProgram(r, colors) {
  var t = randomStep(r, leaf(), colors);
  if (r() < 0.45) t = randomStep(r, t, colors);
  return t;
}

/* ------------------------------------------------------------ corruption */
function corrupt(r, tree, colors) {
  var list = R.nodesOf(tree).filter(function (p) { return p[0].op !== "in"; });
  var k = r(), target = pick(r, list), n = target[0], c;
  function repl(sub) { return replaceAt(tree, target[1], sub); }
  if (k < 0.4 && n.params.length) {                       /* parameter */
    c = R.clone(n); var j = Math.floor(r() * n.params.length), kind = R.paramKinds(n.op)[j];
    var dom = kind === "C" ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : kind === "O" ? [-3, -2, -1, 1, 2, 3] : kind === "I" ? [2, 3, 4] :
              kind === "S" || kind === "Y" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 1, 2, 3];
    var alt = pick(r, dom.filter(function (x) { return x !== n.params[j]; }));
    c.params[j] = alt;
    return { tree: repl(c), kind: "param" };
  }
  if (k < 0.6) {                                          /* operator */
    var sig = PROG.OPS[n.op].kinds.join(""), sib = Object.keys(PROG.OPS).filter(function (o) {
      return o !== n.op && !PROG.OPS[o].aux && PROG.OPS[o].kinds.join("") === sig && ["id", "mode_cell"].indexOf(o) < 0; });
    if (sib.length) { c = R.clone(n); c.op = pick(r, sib); return { tree: repl(c), kind: "operator" }; }
  }
  if (k < 0.8 && list.length > 1) {                       /* deleted step */
    return { tree: repl(R.clone(n.kids[0])), kind: "deletion" };
  }
  /* inserted step */
  return { tree: randomStep(r, R.clone(tree), colors), kind: "insertion" };
}
function replaceAt(t, path, sub) {
  if (!path.length) return sub;
  var c = R.clone(t), n = c, i;
  for (i = 0; i < path.length - 1; i++) n = n.kids[path[i]];
  n.kids[path[path.length - 1]] = sub;
  return c;
}

function run(tree, g) {
  var f = R.fromTree(tree);
  return R.runTree(f, g, g, 0);
}

/* One curriculum item, or null when the sample is degenerate. */
function makeItem(r) {
  var style = pick(r, ["objects", "rects", "shapes", "noise"]);
  var xs = [], i;
  for (i = 0; i < 5; i++) xs.push(randomGrid(r, style));
  var colors = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  var P = randomProgram(r, colors), ys = [];
  for (i = 0; i < xs.length; i++) {
    var y = run(P, xs[i]);
    if (!y || E.G.gEq(y, xs[i])) return null;
    ys.push(y);
  }
  var bad = null;
  for (var tries = 0; tries < 6 && !bad; tries++) {
    var c = corrupt(r, P, colors), ok = true, differs = false;
    for (i = 0; i < 4; i++) {
      var p = run(c.tree, xs[i]);
      if (p && !E.G.gEq(p, ys[i])) differs = true;
      if (!p) ok = false;
    }
    if (ok && differs) bad = c;
  }
  if (!bad) return null;
  return { P: P, bad: bad, xs: xs, ys: ys };
}

function attempt(item, opts) {
  var train = [], i;
  for (i = 0; i < 4; i++) train.push([item.xs[i], item.ys[i]]);
  var ctx = new E.Ctx(train, [item.xs[4]], Date.now() + 5000);
  var A = new R.ArcAdapter(ctx), log = [];
  var seed = A.seed(null, item.bad.tree, {});
  var stats = opts.policy ? new K.RepairStats({ table: opts.policy.table }) : new K.RepairStats();
  var out = K.refine(A, [seed], { maxMs: opts.ms || 250, maxSteps: opts.steps || 40, maxStall: 20, frontierCap: 32, clusterCap: 6,
    childCap: 12, maxDepth: 3, stopOnExact: true, weights: opts.policy ? opts.policy.weights : {}, stats: stats, log: log });
  var ex = out.exact[0] || null, general = false;
  if (ex) {
    var pred = ex.predictions[0], want = item.ys[4];
    general = !!(pred && E.G.gEq(pred, want));
  }
  return { recovered: !!ex, general: general, steps: out.stats.steps, log: log, trace: out.stats.trace,
           kind: item.bad.kind, exact: ex ? R.render(ex.program.tree) : null };
}

function batch(n, seed, opts) {
  var r = rng(seed), items = [], guard = 0;
  while (items.length < n && guard++ < n * 20) { var it = makeItem(r); if (it) items.push(it); }
  var res = { n: items.length, recovered: 0, general: 0, steps: 0, byKind: {}, logs: [], traces: [] };
  items.forEach(function (it) {
    var a = attempt(it, opts);
    res.recovered += a.recovered; res.general += a.general; res.steps += a.steps;
    var b = res.byKind[a.kind] || (res.byKind[a.kind] = { n: 0, recovered: 0, general: 0 });
    b.n++; b.recovered += a.recovered; b.general += a.general;
    res.logs = res.logs.concat(a.log); res.traces = res.traces.concat(a.trace || []);
  });
  res.recovery_rate = res.recovered / Math.max(1, res.n);
  res.general_rate = res.general / Math.max(1, res.n);
  res.mean_steps = res.steps / Math.max(1, res.n);
  return res;
}

function trainPolicy(res) {
  var table = {};
  res.logs.forEach(function (l) {
    var k = l.diag + "|" + l.mutation.kind, kk = "*|" + l.mutation.kind;
    [k, kk].forEach(function (key) {
      var c = table[key] || (table[key] = [0, 0]);
      c[1]++; if (l.outcome === "exact" || l.outcome === "improved") c[0]++;
    });
  });
  /* drop thin rows: a prior from two observations is noise */
  Object.keys(table).forEach(function (k) { if (table[k][1] < 4) delete table[k]; });
  return { table: table, weights: K.learnWeights(res.traces, 8) };
}

/* =====================================================================
 * Curriculum v2: compositional, representational and ambiguous tasks.
 *
 * Everything below is generated from typed programs this file builds; no
 * ARC benchmark task, input or answer is read anywhere.
 *
 *   families      eight operation families (geometry, colour, selection,
 *                 movement, symmetry, topology, crop/scale, lines), each a
 *                 set of typed PROG steps with random parameters.
 *   motifs        a latent library of recurring two-step sub-routines (the
 *                 synthetic world's "concepts"). Tasks are built from motifs
 *                 and single steps. The solver never sees this library; the
 *                 macro learner (tools/arc-macros.js) has to rediscover it
 *                 from the solver's OWN solutions.
 *   holdout       COMPOSITION holdout, not a random split: a fixed set of
 *                 ordered family pairs (and motif pairs) never appears
 *                 adjacent in training programs; evaluation programs contain
 *                 at least one of them. Every family and motif still appears
 *                 in training -- only the combination is new.
 *   depth         programs of 1..5 steps (motifs count their steps).
 *   representation tasks whose rule is simple in one substrate and hard or
 *                 inexpressible in raw cells: colour roles (a different
 *                 palette per demonstration), change overlays, largest-object
 *                 views, upscaled outputs, separator-stripped inputs.
 *   ambiguity     two programs that agree on every demonstration (by
 *                 rejection sampling) and disagree on the test input; the
 *                 generator's program is known, so which explanation
 *                 generalised is a label this curriculum is ALLOWED to use.
 *   corruption    1..5 random edits of a program (deep repair).
 * ===================================================================== */
var FAMILIES = {
  G: function (r) { return [pick(r, ["rot90", "rot180", "rot270", "flip_h", "flip_v", "transpose", "anti_transpose"])]; },
  C: function (r, cols) { var a = pick(r, cols), b = pick(r, [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(function (x) { return x !== a; }));
                          return r() < 0.7 ? ["replace", a, b] : ["keepc", a]; },
  S: function (r) { return [pick(r, ["keep_only", "pick_crop", "drop_one"]), 0, pick(r, [0, 1, 2, 3, 4, 5, 8, 9])]; },
  M: function (r) { var k = r(); return k < 0.35 ? ["grav", Math.floor(r() * 4)] : k < 0.6 ? ["move_objs", Math.floor(r() * 4)]
                          : k < 0.8 ? ["shift", Math.floor(r() * 4)] : ["offset", pick(r, [-2, -1, 1, 2]), pick(r, [-2, -1, 1, 2])]; },
  Y: function (r) { return r() < 0.5 ? ["complete"] : ["mirror_cat", Math.floor(r() * 4)]; },
  T: function (r) { var k = r(); return k < 0.3 ? ["fill_enclosed", 1 + Math.floor(r() * 9)] : k < 0.5 ? ["outline_c", 1 + Math.floor(r() * 9)]
                          : k < 0.7 ? ["bbox_fill"] : k < 0.85 ? ["denoise"] : ["fillholes", 1 + Math.floor(r() * 9)]; },
  K: function (r) { var k = r(); return k < 0.35 ? ["crop"] : k < 0.55 ? ["compress"] : k < 0.8 ? ["upscale", 2 + Math.floor(r() * 2)] : ["tile", 2]; },
  L: function (r) { return r() < 0.5 ? ["connect"] : ["connect_c", 1 + Math.floor(r() * 9)]; }
};
var FAMILY_NAMES = Object.keys(FAMILIES);
/* latent motifs: two family steps with a fixed internal relation */
var MOTIFS = {
  cropLargest: [["S", ["keep_only", 0, 0]], ["K", ["crop"]]],
  gravThenOutline: [["M", ["grav", 0]], ["T", ["outline_c", "$c"]]],
  flipComplete: [["G", ["flip_h"]], ["Y", ["complete"]]],
  recolorFill: [["C", ["replace", "$a", "$b"]], ["T", ["fill_enclosed", "$c"]]],
  denoiseCrop: [["T", ["denoise"]], ["K", ["crop"]]],
  moveConnect: [["M", ["move_objs", 1]], ["L", ["connect"]]]
};
var MOTIF_NAMES = Object.keys(MOTIFS);

function stepTree(spec, kid) { return { op: spec[0], kids: [kid], params: spec.slice(1) }; }
function instMotif(r, name, kid, cols) {
  var t = kid, i;
  MOTIFS[name].forEach(function (st) {
    var sp = st[1].map(function (v) {
      if (v === "$c") return 1 + Math.floor(r() * 9);
      if (v === "$a") return pick(r, cols);
      if (v === "$b") return 1 + Math.floor(r() * 9);
      return v;
    });
    if (sp[0] === "replace" && sp[1] === sp[2]) sp[2] = sp[2] % 9 + 1;
    t = stepTree(sp, t);
  });
  return t;
}
/* an element: a family letter or "m:<motif>" */
function buildProgram(r, elems, cols) {
  var t = { op: "in" };
  elems.forEach(function (e) { t = e.indexOf("m:") === 0 ? instMotif(r, e.slice(2), t, cols) : stepTree(FAMILIES[e](r, cols), t); });
  return t;
}
function familyOfElem(e) { return e.indexOf("m:") === 0 ? e : e; }

/* the composition holdout: ordered element pairs never adjacent in training */
function holdoutPairs(seed) {
  var r = rng(seed * 7919 + 17), elems = FAMILY_NAMES.concat(MOTIF_NAMES.map(function (m) { return "m:" + m; }));
  var pairs = [], i, j;
  for (i = 0; i < elems.length; i++) for (j = 0; j < elems.length; j++) if (i !== j) pairs.push(elems[i] + ">" + elems[j]);
  for (i = pairs.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); var t = pairs[i]; pairs[i] = pairs[j]; pairs[j] = t; }
  return new Set(pairs.slice(0, Math.floor(pairs.length * 0.25)));
}
function adjacentPairs(elems) { var out = []; for (var i = 1; i < elems.length; i++) out.push(elems[i - 1] + ">" + elems[i]); return out; }
function sampleElems(r, depth, split, held) {
  var all = FAMILY_NAMES.concat(MOTIF_NAMES.map(function (m) { return "m:" + m; }));
  for (var tries = 0; tries < 400; tries++) {
    var out = [], steps = 0;
    while (steps < depth) {
      var e = pick(r, all), n = e.indexOf("m:") === 0 ? 2 : 1;
      if (steps + n > depth) { e = pick(r, FAMILY_NAMES); n = 1; }
      out.push(e); steps += n;
    }
    var adj = adjacentPairs(out), hasHeld = adj.some(function (p) { return held.has(p); });
    if (split === "train" && !hasHeld) return out;
    if (split === "heldout" && hasHeld) return out;
    if (split === "any") return out;
  }
  return null;
}

/* inputs: object scenes on a black field, varied sizes and palettes */
function scene(r, style) {
  var g = randomGrid(r, style || pick(r, ["objects", "rects", "shapes"]));
  return g;
}
function degenerate(xs, ys) {
  var i, allSame = true;
  for (i = 0; i < ys.length; i++) {
    if (!ys[i] || !E.G.valid(ys[i]) || ys[i].length > 30 || ys[i][0].length > 30) return true;
    if (E.G.gEq(ys[i], xs[i])) return true;
    if (i && !E.G.gEq(ys[i], ys[0])) allSame = false;
  }
  return allSame;
}
/* One compositional task: 4 demonstrations, 1 test, 1 hidden extra. */
function makeTask(r, elems, opts) {
  opts = opts || {};
  var cols = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (var tries = 0; tries < 12; tries++) {
    var P = buildProgram(r, elems, cols), xs = [], ys = [], i, bad = false;
    for (i = 0; i < 6; i++) {
      var x = scene(r, opts.style), y = run(P, x);
      xs.push(x); ys.push(y);
      if (!y) { bad = true; break; }
    }
    if (bad || degenerate(xs, ys)) continue;
    return { P: P, elems: elems, depth: E.PROG.treeSize(P), xs: xs, ys: ys, kind: "compose" };
  }
  return null;
}

/* representation tasks */
function recolorRandom(r, g) {
  var perm = [0], avail = [1, 2, 3, 4, 5, 6, 7, 8, 9], i;
  for (i = avail.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = avail[i]; avail[i] = avail[j]; avail[j] = t; }
  perm = perm.concat(avail);
  return g.map(function (row) { return row.map(function (v) { return perm[v]; }); });
}
function mapG(g, p) { return g.map(function (row) { return row.map(function (v) { return p[v]; }); }); }
function makeRepTask(r, kind) {
  var cols = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (var tries = 0; tries < 30; tries++) {
    var xs = [], ys = [], i, P, fn;
    if (kind === "roles") {
      /* a rule over colour ROLES; every demonstration uses its own palette */
      P = buildProgram(r, [pick(r, ["C", "S", "T"])], [1, 2, 3]);
      fn = function (x) { var p = E.CANON.rolePerm(x); var y = run(P, mapG(x, p.fwd)); return y ? mapG(y, p.inv) : null; };
      for (i = 0; i < 6; i++) xs.push(recolorRandom(r, scene(r, "rects")));
    } else if (kind === "change") {
      /* output = input overlaid with a transformed copy (a trail, a mirror) */
      var T2 = stepTree(pick(r, [["shift", Math.floor(r() * 4)], ["flip_h"], ["flip_v"], ["offset", pick(r, [-2, 2]), pick(r, [-1, 1])]]), { op: "in" });
      P = T2;
      fn = function (x) { var d = run(T2, x); if (!d || d.length !== x.length || d[0].length !== x[0].length) return null;
        return x.map(function (row, rr) { return row.map(function (v, cc) { return d[rr][cc] !== 0 ? d[rr][cc] : v; }); }); };
      for (i = 0; i < 6; i++) xs.push(scene(r, "objects"));
    } else if (kind === "largest") {
      P = buildProgram(r, [pick(r, ["G", "C", "T"])], cols);
      fn = function (x) { var o; try { o = E.O.segment(x, "c8", 0); } catch (e) { return null; } if (!o.length) return null;
        var L = E.O.selectExtreme(o, "size", true); if (!L) return null; return run(P, E.G.subgrid(x, L.r0, L.c0, L.r1, L.c1)); };
      for (i = 0; i < 6; i++) xs.push(scene(r, "shapes"));
    } else if (kind === "down") {
      P = buildProgram(r, [pick(r, ["G", "C", "S"])], cols);
      var k = 2 + Math.floor(r() * 2);
      fn = function (x) { var y = run(P, x); return y ? E.G.upscale(y, k, k) : null; };
      for (i = 0; i < 6; i++) { var sm = scene(r, "objects"); xs.push(sm.slice(0, 6).map(function (row) { return row.slice(0, 6); })); }
    } else if (kind === "strip") {
      P = buildProgram(r, [pick(r, ["G", "C", "T"])], cols);
      fn = function (x) { var s = E.REPRESENT.stripLines(x); return s ? run(P, s) : null; };
      for (i = 0; i < 6; i++) {
        var base = scene(r, "rects"), sep = 5, h = base.length, w = base[0].length, rr = 1 + Math.floor(r() * (h - 2));
        var withSep = base.map(function (row, q) { return q === rr ? row.map(function () { return sep; }) : row.map(function (v) { return v === sep ? 6 : v; }); });
        xs.push(withSep);
      }
    }
    for (i = 0; i < xs.length; i++) ys.push(fn(xs[i]));
    if (ys.some(function (y) { return !y; }) || degenerate(xs, ys)) continue;
    return { P: P, kind: "rep:" + kind, xs: xs, ys: ys, depth: E.PROG.treeSize(P) };
  }
  return null;
}

/* ambiguity: two programs agreeing on every demonstration */
var AMBIG = [
  [["keep_only", 0, 0], ["keep_only", 0, 8]],       /* largest vs first */
  [["pick_crop", 0, 0], ["pick_crop", 0, 5]],       /* largest vs tallest */
  [["grav", 0], ["move_objs", 0]],                  /* gravity vs slide objects */
  [["crop"], ["pick_crop", 0, 0]],                  /* content crop vs largest */
  [["keep_only", 0, 1], ["keep_only", 0, 9]],       /* smallest vs last */
  [["drop_one", 0, 1], ["drop_one", 0, 9]]          /* drop smallest vs drop last */
];
function makeAmbigTask(r) {
  for (var tries = 0; tries < 20; tries++) {
    var pair = pick(r, AMBIG), P1 = stepTree(pair[0], { op: "in" }), P2 = stepTree(pair[1], { op: "in" });
    if (r() < 0.5) { var t = P1; P1 = P2; P2 = t; }
    var xs = [], ys = [], guard = 0;
    while (xs.length < 4 && guard++ < 400) {
      var x = scene(r, "objects"), a = run(P1, x), b = run(P2, x);
      if (a && b && E.G.gEq(a, b) && !E.G.gEq(a, x)) { xs.push(x); ys.push(a); }
    }
    if (xs.length < 4) continue;
    var tx = null, g2 = 0;
    while (!tx && g2++ < 400) { var x2 = scene(r, "objects"), a2 = run(P1, x2), b2 = run(P2, x2); if (a2 && b2 && !E.G.gEq(a2, b2)) tx = x2; }
    if (!tx) continue;
    xs.push(tx); ys.push(run(P1, tx));
    xs.push(tx); ys.push(run(P2, tx));        /* index 5 = the rival's output, for pass@2 coverage */
    return { P: P1, rival: P2, kind: "ambig", xs: xs, ys: ys, depth: 1 };
  }
  return null;
}

/* ------------------------------------------------------ the search core
 * What a synthetic task is solved with: typed synthesis, then (unless
 * ablated) test-time adaptation + adapted synthesis, representation
 * search, kernel refinement, population search -- the same modules the
 * portfolio uses, without the specialist families (the tasks are typed
 * programs, so the specialists would only measure themselves). */
function solveCore(item, opts) {
  opts = opts || {};
  var ms = opts.ms || 600, t0 = Date.now(), deadline = t0 + ms, i;
  var train = []; for (i = 0; i < 4; i++) train.push([item.xs[i], item.ys[i]]);
  var ctx = new E.Ctx(train, [item.xs[4]], deadline);
  var sink = E.CANDIDATES.newSink(ctx, { evalBudgetMs: ms * 0.05 });
  ctx._nearSink = sink;
  if (opts.canon !== undefined) E.SYN.canon(opts.canon);
  var stats = { synthesis: null, stage: [], solvedBy: null };
  var found = [];
  function addProgs(ps, tag) { ps.forEach(function (p) { var tr = E.PROG.toTree(p.struct, p.theta); found.push({ run: function (g) { return p.run(g); }, name: p.name(), tag: tag, bits: p.codeLength(), depth: E.PROG.treeSize(tr), tree: tr, macroSteps: E.MACROS.uses(tr) }); }); }
  var synEnd = t0 + ms * (opts.synFrac || 0.45);
  var progs = E.SYN.search(ctx, 3, opts.width || 400, synEnd, 8, null);
  stats.synthesis = ctx._synStats;
  addProgs(progs, "synthesis");
  if (!found.length && opts.represent !== false) {
    var rEnd = Math.min(deadline, Date.now() + ms * 0.15);
    ctx.deadline = rEnd;
    var rh = [];
    try { rh = E.REPRESENT.generate(ctx); } catch (e) { rh = []; }
    rh.forEach(function (h) { if (h.fits(train)) found.push({ run: function (g) { return h.apply(g); }, name: h.name, tag: "represent", bits: h.cost * 8, depth: h.repProg ? E.PROG.treeSize(E.PROG.toTree(h.repProg.struct, h.repProg.theta)) : 1 }); });
    stats.represent = ctx._repInfo || null;
  }
  ctx.deadline = deadline;
  if (!found.length && opts.tta !== false) {
    var tta = E.TESTTIME.adapt(ctx, sink, { budgetMs: ms * 0.06 });
    stats.tta = tta.report;
    var ps2 = E.TESTTIME.adaptedSearch(ctx, Math.min(deadline, Date.now() + ms * 0.15), 300);
    addProgs(ps2, "tta");
  }
  ctx._nearSink = null;
  if (!found.length && (opts.refine !== false || opts.pop !== false)) {
    var A = new E.REPAIR.ArcAdapter(ctx);
    A.sink = sink;
    var sd = sink.seeds(A, { max: 24, perFamily: 12, typed: 16 });
    A.usedSeeds = sd.seeds.slice();
    var left = deadline - Date.now();
    var exacts = [];
    if (sd.seeds.length && left > 20) {
      if (opts.refine !== false) {
        var traj = [];
        var ro = K.refine(A, sd.seeds, { deadline: opts.pop === false ? deadline : Date.now() + left * 0.5, maxSteps: 400, maxStall: 60,
          frontierCap: 48, clusterCap: 6, childCap: 12, maxDepth: opts.maxDepth || 4, stopOnExact: true,
          weights: opts.policy ? opts.policy.weights : {}, stats: opts.policy ? new K.RepairStats({ table: opts.policy.table }) : null,
          metaModel: opts.metaModel || null, trajectory: traj, domain: "arc",
          checkGeneralization: function (h) { var y = A.closure(h.program)(item.xs[5]); return !!(y && E.G.gEq(y, item.ys[5])); } });
        if (opts.trajectories) traj.forEach(function (t) { opts.trajectories.push(t); });
        stats.refine = { evaluated: ro.stats.evaluated, duplicates: ro.stats.duplicates, struct_dup: ro.stats.structDuplicates,
                         steps: ro.stats.steps, migrations: ro.stats.migrations, migration_exact: ro.stats.migrationExact,
                         max_depth: ro.stats.maxDepthReached, plan: ro.stats.plan.slice(0, 40) };
        exacts = ro.exact.map(function (h) { return { h: h, tag: "refine" }; });
        if (!exacts.length && opts.pop !== false && deadline - Date.now() > 20) {
          var ps = ro.frontier.sorted().slice(0, 16);
          var po = E.POPSEARCH.search(A, ps.length ? ps : sd.seeds, { deadline: deadline, afterExact: 0 });
          stats.pop = po.stats;
          exacts = po.exact.map(function (h) { return { h: h, tag: "pop" }; });
        }
      } else {
        var po2 = E.POPSEARCH.search(A, sd.seeds, { deadline: deadline, afterExact: 0 });
        stats.pop = po2.stats;
        exacts = po2.exact.map(function (h) { return { h: h, tag: "pop" }; });
      }
    }
    exacts.forEach(function (e) { var fnc = A.closure(e.h.program); found.push({ run: fnc, name: E.REPAIR.render(e.h.program.tree), tag: e.tag, bits: e.h.complexity, depth: e.h.lineage ? e.h.lineage.depth : 0,
      tree: !e.h.program.base && !e.h.program.rep ? e.h.program.tree : null, macroSteps: E.MACROS.uses(e.h.program.tree) }); });
  }
  if (opts.canon !== undefined) E.SYN.canon(true);
  var best = found.length ? found.slice().sort(function (a, b) { return a.bits - b.bits; })[0] : null;
  var gen = false, gen2 = false;
  if (best) {
    var y4 = best.run(item.xs[4]), y5 = best.run(item.xs[5]);
    gen = !!(y4 && E.G.gEq(y4, item.ys[4]));
    gen2 = gen && !!(y5 && E.G.gEq(y5, item.ys[5]));
  }
  /* pass@2 on the test input: two distinct predictions */
  var preds = [], seen = {};
  found.slice().sort(function (a, b) { return a.bits - b.bits; }).forEach(function (f) {
    var y = f.run(item.xs[4]); if (!y) return; var k = E.G.gkey(y); if (seen[k]) return; seen[k] = 1; preds.push(y); });
  var top2 = preds.slice(0, 2).some(function (y) { return E.G.gEq(y, item.ys[4]); });
  return { solved: !!best, generalized: gen, generalizedBoth: gen2, top2: top2, preds: preds, solvedBy: best ? best.tag : null,
           depth: best ? best.depth : null, ms: Date.now() - t0, stats: stats, found: found.length,
           program: best ? best.name : null, tree: best ? best.tree || null : null, macroSteps: best ? best.macroSteps || 0 : 0,
           searchCost: stats.synthesis && stats.synthesis.first_exact_evaluated !== undefined ? stats.synthesis.first_exact_evaluated : null };
}

function makeSplit(n, seed, kind, opts) {
  opts = opts || {};
  var r = rng(seed), out = [], guard = 0, held = holdoutPairs(opts.holdSeed || 1);
  while (out.length < n && guard++ < n * 60) {
    var it = null;
    if (kind === "train" || kind === "heldout") {
      var depth = opts.depths ? pick(r, opts.depths) : (1 + Math.floor(r() * (kind === "train" ? 3 : 4)));
      var el = sampleElems(r, depth, kind, held);
      if (el) it = makeTask(r, el);
    } else if (kind.indexOf("rep:") === 0) it = makeRepTask(r, kind.slice(4));
    else if (kind === "ambig") it = makeAmbigTask(r);
    if (it) out.push(it);
  }
  return out;
}

function evaluateSplit(items, opts) {
  var res = { n: items.length, solved: 0, generalized: 0, generalizedBoth: 0, top2: 0, byDepth: {}, bySolver: {}, ms: 0,
              generated: 0, canonDup: 0, evaluated: 0, behaviorDup: 0, failures: [] };
  items.forEach(function (it) {
    var a = solveCore(it, opts);
    res.solved += a.solved; res.generalized += a.generalized; res.generalizedBoth += a.generalizedBoth; res.top2 += a.top2; res.ms += a.ms;
    var d = res.byDepth[it.depth] || (res.byDepth[it.depth] = { n: 0, generalized: 0 });
    d.n++; d.generalized += a.generalized;
    if (a.solvedBy) res.bySolver[a.solvedBy] = (res.bySolver[a.solvedBy] || 0) + 1;
    if (a.macroSteps) res.macroUses = (res.macroUses || 0) + 1;
    if (a.generalized && a.searchCost !== null) { res.costSum = (res.costSum || 0) + a.searchCost; res.costN = (res.costN || 0) + 1; }
    var s = a.stats.synthesis;
    if (s) { res.generated += s.generated; res.canonDup += s.canonical_duplicates; res.evaluated += s.evaluated; res.behaviorDup += s.behavior_duplicates; }
    if (!a.generalized && res.failures.length < 400) res.failures.push(failureRecord(it, a));
  });
  res.generalized_rate = res.generalized / Math.max(1, res.n);
  res.solved_rate = res.solved / Math.max(1, res.n);
  res.top2_rate = res.top2 / Math.max(1, res.n);
  res.mean_search_cost = res.costN ? res.costSum / res.costN : null;
  return res;
}

/* Machine-readable failure record (for clustering, never for patching). */
function failureRecord(it, a) {
  var s = a.stats || {}, pop = s.pop || {}, ref = s.refine || {};
  var best = null;
  if (s.pop && s.pop.bestEnd !== null && s.pop.bestEnd !== undefined) best = s.pop.bestEnd;
  var stage = !a.solved ? (a.found ? "ranking" : (s.synthesis && s.synthesis.near_emitted ? "search_exhausted" : "generation"))
            : "generalization";
  return {
    failure_type: a.solved ? "wrong_generalization" : "no_exact_program",
    task_kind: it.kind, elems: it.elems || null, depth: it.depth,
    representation: (s.represent && s.represent.tried && s.represent.tried.length) ? s.represent.tried[0].name : "raw",
    best_residual: best,
    candidate_diversity: s.synthesis ? s.synthesis.near_clusters || 0 : 0,
    correct_generated: a.top2 && !a.generalized,
    search_exhausted: !a.solved && a.ms < 0.9 * 600,
    verification_failure: a.solved && !a.generalized,
    likely_stage: stage,
    trace: (ref.plan || []).slice(0, 12)
  };
}
function clusterFailures(fails) {
  var byKey = {};
  fails.forEach(function (f) {
    var k = f.likely_stage + "|" + f.failure_type + "|" + (f.representation || "raw");
    var c = byKey[k] || (byKey[k] = { n: 0, depths: {}, kinds: {} });
    c.n++; c.depths[f.depth] = (c.depths[f.depth] || 0) + 1; c.kinds[f.task_kind] = (c.kinds[f.task_kind] || 0) + 1;
  });
  return Object.keys(byKey).sort(function (a, b) { return byKey[b].n - byKey[a].n; }).map(function (k) { var c = byKey[k]; c.cluster = k; return c; });
}

/* deep corruption: 1..5 edits from the generator's program */
function makeDeepRepair(r, edits) {
  for (var tries = 0; tries < 40; tries++) {
    var it = makeItem(r);
    if (!it) continue;
    var bad = it.bad.tree, k;
    for (k = 1; k < edits; k++) bad = corrupt(r, bad, [1, 2, 3, 4, 5, 6, 7, 8, 9]).tree;
    var differs = false, i;
    for (i = 0; i < 4; i++) { var p = run(bad, it.xs[i]); if (!p || !E.G.gEq(p, it.ys[i])) differs = true; }
    if (!differs) continue;
    it.bad = { tree: bad, kind: "deep" + edits };
    it.edits = edits;
    return it;
  }
  return null;
}

/* v2 repair attempt: kernel refinement from a corrupted program, optional
   population search, the learned controller, trajectories with the
   generalisation label (the hidden input is index 4). */
function attemptV2(item, opts) {
  var train = [], i;
  for (i = 0; i < 4; i++) train.push([item.xs[i], item.ys[i]]);
  var ctx = new E.Ctx(train, [item.xs[4]], Date.now() + 5000);
  var A = new R.ArcAdapter(ctx), log = [], traj = [];
  var seed = A.seed(null, item.bad.tree, {});
  var stats = opts.policy ? new K.RepairStats({ table: opts.policy.table }) : new K.RepairStats();
  var deadline = Date.now() + (opts.ms || 250);
  var out = K.refine(A, [seed], { deadline: opts.pop ? Date.now() + (opts.ms || 250) * 0.5 : deadline, maxSteps: opts.steps || 40,
    maxStall: 20, frontierCap: 32, clusterCap: 6, childCap: 12, maxDepth: opts.maxDepth || 4, stopOnExact: true,
    weights: opts.policy ? opts.policy.weights : {}, stats: stats, log: log, metaModel: opts.meta || null, actions: opts.actions || null,
    metaPriors: opts.priors === undefined ? true : opts.priors, trajectory: traj, domain: "arc",
    checkGeneralization: function (h) { var y = h.predictions[0]; return !!(y && E.G.gEq(y, item.ys[4])); } });
  var ex = out.exact[0] || null, popStats = null;
  if (!ex && opts.pop && Date.now() < deadline) {
    var ps = out.frontier.sorted().slice(0, 12);
    var po = E.POPSEARCH.search(A, ps.length ? ps : [seed], { deadline: deadline, afterExact: 0 });
    ex = po.exact[0] || null; popStats = po.stats;
  }
  var general = !!(ex && ex.predictions[0] && E.G.gEq(ex.predictions[0], item.ys[4]));
  return { recovered: !!ex, general: general, steps: out.stats.steps, log: log, trace: out.stats.trace, traj: traj,
           kind: item.bad.kind, edits: item.edits || 1, popStats: popStats, plan: out.stats.plan };
}
function batchV2(items, opts) {
  var res = { n: items.length, recovered: 0, general: 0, steps: 0, byEdits: {}, logs: [], traces: [], traj: [], pop: {} };
  items.forEach(function (it) {
    var a = attemptV2(it, opts);
    res.recovered += a.recovered; res.general += a.general; res.steps += a.steps;
    var b = res.byEdits[a.edits] || (res.byEdits[a.edits] = { n: 0, recovered: 0, general: 0 });
    b.n++; b.recovered += a.recovered; b.general += a.general;
    if (opts.collect) { res.logs = res.logs.concat(a.log); res.traces = res.traces.concat(a.trace || []); res.traj = res.traj.concat(a.traj); }
    if (a.popStats) Object.keys(a.popStats.byClass).forEach(function (c) {
      var s = a.popStats.byClass[c], t = res.pop[c] || (res.pop[c] = { tried: 0, kept: 0, improved: 0, exact: 0 });
      t.tried += s.tried; t.kept += s.kept; t.improved += s.improved; t.exact += s.exact;
    });
  });
  res.recovery_rate = res.recovered / Math.max(1, res.n);
  res.general_rate = res.general / Math.max(1, res.n);
  res.mean_steps = res.steps / Math.max(1, res.n);
  return res;
}
function deepItems(n, seed, maxEdits) {
  var r = rng(seed), out = [], guard = 0;
  while (out.length < n && guard++ < n * 30) {
    var e = 1 + (out.length % maxEdits);
    var it = makeDeepRepair(r, e);
    if (it) out.push(it);
  }
  return out;
}
/* population-search class weights from class outcomes: (improved + 3 exact
   + 1) / (tried + 2), normalised to mean 1 */
function popPrior(pop) {
  var w = {}, sum = 0, n = 0;
  Object.keys(pop).forEach(function (c) { var s = pop[c]; w[c] = (s.improved + 3 * s.exact + 1) / (s.tried + 2); sum += w[c]; n++; });
  Object.keys(w).forEach(function (c) { w[c] = Math.round(w[c] / (sum / n) * 1000) / 1000; });
  return { classWeights: w };
}
function runV2(opts) {
  var t0 = Date.now(), ms = opts.ms, steps = opts.steps;
  var trainItems = deepItems(opts.nTrain, opts.seed, 5);
  var evalItems = deepItems(opts.nEval, opts.seed + 1000, 5);
  /* 1. collect: repair attempts with the static controller, logs +
        trajectories (successes AND failures) */
  var tr = batchV2(trainItems, { ms: ms, steps: steps * 3, collect: true, pop: true });
  var policy = trainPolicy(tr);
  var M = globalThis.C4ReasonMeta;
  /* trajectories where the substrate IS the problem (representation
     tasks) and where several explanations fit (ambiguity tasks), so the
     controller sees the states in which representation change,
     discrimination, verification and stopping pay -- and those in which
     they do not */
  var extraTraj = [], rr = rng(opts.seed + 77);
  ["roles", "change", "largest", "down", "strip"].forEach(function (k) {
    makeSplit(Math.ceil(opts.nTrain / 20), opts.seed + 31 + k.length, "rep:" + k).forEach(function (it) {
      solveCore(it, { ms: ms * 2, trajectories: extraTraj, synFrac: 0.2, width: 60 });
    });
  });
  makeSplit(Math.ceil(opts.nTrain / 10), opts.seed + 53, "ambig").forEach(function (it) {
    var trn = [], i; for (i = 0; i < 4; i++) trn.push([it.xs[i], it.ys[i]]);
    var ctx = new E.Ctx(trn, [it.xs[4]], Date.now() + 5000), A = new R.ArcAdapter(ctx);
    var bad = corrupt(rr, it.P, [1, 2, 3, 4, 5, 6, 7, 8, 9]).tree;
    K.refine(A, [A.seed(null, bad, {}), A.seed(null, corrupt(rr, it.rival, [1, 2, 3, 4, 5, 6, 7, 8, 9]).tree, {})],
      { maxMs: ms, maxSteps: steps * 4, afterExact: 6, frontierCap: 32, childCap: 12, trajectory: extraTraj, domain: "arc",
        checkGeneralization: function (h) { var y = h.predictions[0]; return !!(y && E.G.gEq(y, it.ys[4])); } });
  });
  var meta = M.train(tr.traj.concat(extraTraj), { lambda: 4, minCount: 8, note: "trained on synthetic repair, representation and ambiguity trajectories (curriculum v2 train splits)" });
  var pprior = popPrior(tr.pop);
  /* 2. held-out evaluation at equal budget: static / learned repair policy
        / learned repair policy + meta-controller; population search on/off */
  var LEGACY = ["REFINE_BEST", "REFINE_DIVERSE", "ABSTRACT_RESIDUAL", "CHANGE_REPRESENTATION", "EXPAND_PROGRAM", "SIMPLIFY_PROGRAM", "BACKTRACK", "STOP"];
  /* equal budget for every arm: the same wall-clock and the same number of
     reasoning operations */
  var ev = {
    legacy_static: batchV2(evalItems, { ms: ms, steps: steps, actions: LEGACY }),
    legacy_policy: batchV2(evalItems, { ms: ms, steps: steps, actions: LEGACY, policy: policy }),
    static: batchV2(evalItems, { ms: ms, steps: steps }),
    repair_policy: batchV2(evalItems, { ms: ms, steps: steps, policy: policy }),
    meta_controller: batchV2(evalItems, { ms: ms, steps: steps, policy: policy, meta: meta }),
    meta_controller_pop: batchV2(evalItems, { ms: ms, steps: steps, policy: policy, meta: meta, pop: true }),
    refine_only_time: batchV2(evalItems, { ms: ms, steps: 400, policy: policy, meta: meta }),
    refine_pop_time: batchV2(evalItems, { ms: ms, steps: 400, policy: policy, meta: meta, pop: true })
  };
  var heldTraj = batchV2(evalItems.slice(0, Math.min(120, evalItems.length)), { ms: ms, steps: steps, collect: true }).traj;
  function brief(b) { return { n: b.n, recovery_rate: b.recovery_rate, general_rate: b.general_rate, mean_steps: b.mean_steps, byEdits: b.byEdits }; }
  return {
    report: {
      note: "synthetic curriculum v2; programs, inputs, corruptions (1-5 edits) generated; no ARC benchmark data",
      train: { n: tr.n, recovery_rate: tr.recovery_rate, general_rate: tr.general_rate, log_entries: tr.logs.length, trajectories: tr.traj.length,
               extra_trajectories: extraTraj.length },
      eval: (function () { var o = {}; Object.keys(ev).forEach(function (k) { o[k] = brief(ev[k]); }); return o; })(),
      meta: { rank_accuracy_heldout: M.evaluate(meta, heldTraj).rankAccuracy, behaviours: M.behaviours(meta), explain: M.explain(meta, 4),
              actions_trained: Object.keys(meta.b).length },
      popsearch_prior: pprior,
      policy_rows: Object.keys(policy.table).length, weight_features: Object.keys(policy.weights).length,
      seconds: (Date.now() - t0) / 1000
    },
    policy: policy, meta: meta, pprior: pprior
  };
}

if (require.main === module) {
  var args = process.argv.slice(2);
  function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
  var nTrain = +arg("train", 400), nEval = +arg("eval", 200), seed = +arg("seed", 7), ms = +arg("ms", 250);
  var steps = +arg("steps", 40);
  var t0 = Date.now();
  if (arg("suite", "legacy") === "v2") {
    var v2 = runV2({ nTrain: nTrain, nEval: nEval, seed: seed, ms: ms, steps: steps });
    console.log(JSON.stringify(v2.report, null, 1));
    var out2 = arg("out", "");
    if (out2) fs.writeFileSync(out2, JSON.stringify(v2.report, null, 2));
    if (args.indexOf("--write") >= 0) {
      var src2 = "/* ===== src/57a-repair-policy.js ===== */\n" +
        "/* GENERATED by tools/arc-curriculum.js --suite v2 from a self-generated\n" +
        " * curriculum of corrupted synthetic programs (1-5 edits; no ARC benchmark\n" +
        " * data). table: diagnosis|repair -> [helped, tried]; weights: feature ->\n" +
        " * operation; popsearch: mutation-class weights; meta: the learned\n" +
        " * reasoning-operation controller (c4-reason-meta.js), trained on search\n" +
        " * trajectories including failures. Do not edit by hand.\n" +
        " * Regenerate with: npm run arc:curriculum */\n" +
        "REFINEMENT.setPolicy(" + JSON.stringify(v2.policy) + ");\n" +
        "POPSEARCH.setPrior(" + JSON.stringify(v2.pprior) + ");\n" +
        "if (root.C4ReasonMeta) root.C4ReasonMeta.hub.load(" + JSON.stringify(v2.meta.toJSON()) + ");\n";
      fs.writeFileSync(path.join(__dirname, "..", "c4-arc", "src", "57a-repair-policy.js"), src2);
      console.log("wrote c4-arc/src/57a-repair-policy.js");
    }
    process.exit(0);
  }
  var tr = batch(nTrain, seed, { ms: ms });
  var policy = trainPolicy(tr);
  /* evaluation under a tight operation budget, where ordering matters */
  var base = batch(nEval, seed + 1000, { ms: ms, steps: steps });
  var withP = batch(nEval, seed + 1000, { ms: ms, steps: steps, policy: policy });
  var report = {
    note: "synthetic curriculum; programs, inputs and corruptions are generated, no ARC benchmark data",
    train: { n: tr.n, recovery_rate: tr.recovery_rate, general_rate: tr.general_rate, log_entries: tr.logs.length },
    eval_without_policy: { n: base.n, recovery_rate: base.recovery_rate, general_rate: base.general_rate, mean_steps: base.mean_steps, byKind: base.byKind },
    eval_with_policy: { n: withP.n, recovery_rate: withP.recovery_rate, general_rate: withP.general_rate, mean_steps: withP.mean_steps, byKind: withP.byKind },
    policy_rows: Object.keys(policy.table).length, weight_features: Object.keys(policy.weights).length,
    seconds: (Date.now() - t0) / 1000
  };
  console.log(JSON.stringify(report, null, 1));
  var out = arg("out", "");
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  if (args.indexOf("--write") >= 0) {
    var src = "/* ===== src/57a-repair-policy.js ===== */\n" +
      "/* Repair policy learned by tools/arc-curriculum.js from a self-generated\n" +
      " * curriculum of corrupted synthetic programs (no ARC benchmark data).\n" +
      " * table: diagnosis|repair -> [helped, tried]; weights: feature -> operation.\n" +
      " * Regenerate with: node tools/arc-curriculum.js --write && npm run build */\n" +
      "REFINEMENT.setPolicy(" + JSON.stringify(policy) + ");\n";
    fs.writeFileSync(path.join(__dirname, "..", "c4-arc", "src", "57a-repair-policy.js"), src);
    console.log("wrote c4-arc/src/57a-repair-policy.js");
  }
}

module.exports = { makeItem: makeItem, attempt: attempt, batch: batch, trainPolicy: trainPolicy, rng: rng,
                   _corrupt: corrupt, _randomStep: randomStep, randomGrid: randomGrid, runTree: run,
                   FAMILIES: FAMILIES, MOTIFS: MOTIFS, holdoutPairs: holdoutPairs, sampleElems: sampleElems,
                   buildProgram: buildProgram, makeTask: makeTask, makeRepTask: makeRepTask, makeAmbigTask: makeAmbigTask,
                   makeSplit: makeSplit, solveCore: solveCore, evaluateSplit: evaluateSplit, failureRecord: failureRecord,
                   clusterFailures: clusterFailures, makeDeepRepair: makeDeepRepair, attemptV2: attemptV2,
                   batchV2: batchV2, deepItems: deepItems, runV2: runV2, popPrior: popPrior };
