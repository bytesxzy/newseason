/* ===== src/90-engine.js ===== */
/* Public surface of the bundle. */

function loadPolicy(data) { return new Policy(data); }
function loadPlanner(data, opts) { return data ? new Planner(data, opts) : null; }

/* Engine-wide switches for ablations and evaluation modes. Every switch
   defaults to the full system; bench.js records which were set. */
function configure(o) {
  o = o || {};
  var out = {};
  if (o.canon !== undefined) { SYN.canon(!!o.canon); CANON.enabled(!!o.canon); out.canon = !!o.canon; }
  if (o.pop !== undefined || o.tta !== undefined || o.meta !== undefined || o.refine !== undefined || o.maxDepth !== undefined) {
    var ro = {};
    if (o.pop !== undefined) ro.pop = !!o.pop;
    if (o.tta !== undefined) ro.tta = !!o.tta;
    if (o.meta !== undefined) ro.meta = !!o.meta;
    if (o.refine !== undefined) ro.off = !o.refine;
    if (o.maxDepth !== undefined) ro.maxDepth = o.maxDepth;
    out.refinement = REFINEMENT.options(ro);
  }
  if (o.counterfactual !== undefined) out.counterfactual_active = CFACT.active(!!o.counterfactual);
  if (o.macros === false) { PROG.clearMacros(); out.macros = false; }
  if (o.pass2 !== undefined) out.pass2 = PASS2.diverse(!!o.pass2);
  return out;
}

/* Solve one ARC task. ``task`` is the standard ARC JSON shape:
   {train: [{input, output}, ...], test: [{input, output?}, ...]}.
   Test outputs, when present, are never read here -- the caller scores. */
function solveTask(task, opts) {
  opts = opts || {};
  var train = [], testInputs = [], i;
  for (i = 0; i < task.train.length; i++) train.push([task.train[i].input, task.train[i].output]);
  for (i = 0; i < task.test.length; i++) testInputs.push(task.test[i].input);
  /* equivariant re-framing only acts when no program fits in the given frame */
  return REFRAME.solveReframed(solve, train, testInputs, opts);
}

/* True when every test pair of the task is reproduced within the top ``k``
   ranked guesses. A task counts as solved only when every pair is exact. */
function scoreTask(task, res, k) {
  if (k === undefined) k = 2;
  var i, j, ok1 = true, okk = true, ans, preds, hit;
  for (i = 0; i < task.test.length; i++) {
    if (task.test[i].output === undefined) return null;
    ans = G.asGrid(task.test[i].output);
    preds = res.predictions[i] || [];
    if (!preds.length || !G.gEq(preds[0], ans)) ok1 = false;
    hit = false;
    for (j = 0; j < Math.min(k, preds.length); j++) if (G.gEq(preds[j], ans)) { hit = true; break; }
    if (!hit) okk = false;
  }
  return { top1: ok1, topk: okk };
}

var ENGINE = {
  SCENE: SCENE, BIDI: BIDI, REDUCE: REDUCE,
  G: G, O: O, OPS: OPS, ENUM: ENUM, LEARN: LEARN, PLANNER: PLANNER, PART: PART,
  PROG: PROG, SYN: SYN, VSPACE: VSPACE, CELLTREE: CELLTREE, CANVASTREE: CANVASTREE,
  PANELTREE: PANELTREE, GROWTREE: GROWTREE, OBJTREE: OBJTREE,
  DELTA_STENCILS: DELTA_STENCILS,
  REPEAT: REPEAT,
  RESID: RESID, REPAIR: REPAIR, REFINEMENT: REFINEMENT, CFACT: CFACT, REFRAME: REFRAME,
  KERNEL: root.C4ReasonKernel, MEMORY: root.C4ReasonMemory, META: root.C4ReasonMeta,
  CANON: CANON, REPRESENT: REPRESENT, CANDIDATES: CANDIDATES, POPSEARCH: POPSEARCH, TESTTIME: TESTTIME,
  MACROS: MACROS, PASS2: PASS2,
  SCN: SCN, CORR: CORR, SKETCH: SKETCH, EMDL: EMDL, EXPR: EXPR, GEN: GEN, EXTRACT: EXTRACT, SCHEMA: SCHEMA, TAXON: TAXON,
  TILING: TILING, SYMM: SYMM, REGIONS: REGIONS, SEQ: SEQ,
  Ctx: Ctx, Hyp: Hyp, Result: Result,
  SOLVER_PRIOR: SOLVER_PRIOR, SOLVER_MODULES: SOLVER_MODULES,
  rankMode: function (m) { if (m !== undefined) RANK_MODE = m; return RANK_MODE; },
  orderedModules: orderedModules,
  solve: solve, solveTask: solveTask, scoreTask: scoreTask,
  signatures: signatures,
  loadPolicy: loadPolicy, loadPlanner: loadPlanner, configure: configure,
  activatePolicy: activatePolicy, activatePlanner: activatePlanner,
  moduleNames: function () {
    var out = [], i, mods = orderedModules();
    for (i = 0; i < mods.length; i++) out.push(mods[i].__name__);
    return out;
  }
};

root.C4ARCEngine = ENGINE;
if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
