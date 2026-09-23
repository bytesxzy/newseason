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

if (require.main === module) {
  var args = process.argv.slice(2);
  function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
  var nTrain = +arg("train", 400), nEval = +arg("eval", 200), seed = +arg("seed", 7), ms = +arg("ms", 250);
  var steps = +arg("steps", 40);
  var t0 = Date.now();
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

module.exports = { makeItem: makeItem, attempt: attempt, batch: batch, trainPolicy: trainPolicy, rng: rng };
