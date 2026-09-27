/* Synthetic tasks for the execution-guided transformation policy.
 *
 * A RULE is a step program (c4-arc/src/70-steps.js) optionally closed by a
 * finisher: a colour map, or an entity-level sketch program sampled from the
 * sketch grammar (tools/arc-dream-lib.js). A rule is executed on many inputs
 * drawn from ONE of five independent input generators:
 *   dev     ARC-AGI-1 TRAINING-split input grids (never evaluation)
 *   objects random scenes of rectangles, blobs, lines on a background
 *   noise   sparse random pixels
 *   motif   a small random motif tiled / mirrored, partly erased
 *   panels  2-3 panels divided by separator lines
 * A pair is kept only if every step is valid and CHANGES the state, and no
 * state repeats (a step that undoes an earlier one would make the label
 * ambiguous). Tasks are 3 demonstrations + 1 held-out query of the SAME rule.
 *
 * Structure, not rendering, defines the splits:
 *   fingerprint   the step-type sequence (+ finisher kind)
 *   held-out type pairs     10% of ordered (A -> B) adjacencies, never in training
 *   held-out group pairs    6 ordered group adjacencies, never in training
 *   held-out programs       10% of fingerprints (depth <= 3), never in training
 *   depth                   training depth <= 3; depth 4 only in tests
 * Training examples are generated on the fly: at every prefix state of the
 * program, (x_i, S_i, y_i over the demonstrations) -> the next step.
 */
'use strict';
const path = require('path');
const D = require('./arc-dream-lib.js');
const E = D.E, STEPS = E.STEPS;
const rng = D.rng;
const pick = (R, a) => a[Math.floor(R() * a.length)];
const ri = (R, a, b) => a + Math.floor(R() * (b - a + 1));

/* ------------------------------------------------------------ inputs */
let DEV = null;
function devInputs(which) {
  if (!DEV) {
    const groups = D.inputGroups(path.join(__dirname, '..', 'c4-arc-tasks.js'), 'arc1_');
    const all = groups.flatMap(g => g.inputs.map(x => ({ x, src: g.id }))).filter(e => e.x.length <= 20 && e.x[0].length <= 20);
    const cut = Math.floor(groups.length * 0.75), trainIds = new Set(groups.slice(0, cut).map(g => g.id));
    DEV = { train: all.filter(e => trainIds.has(e.src)).map(e => e.x), test: all.filter(e => !trainIds.has(e.src)).map(e => e.x) };
  }
  return DEV[which];
}
function blank(H, W, v) { return Array.from({ length: H }, () => new Array(W).fill(v)); }
function genObjects(R) {
  const H = ri(R, 5, 16), W = ri(R, 5, 16), bg = R() < 0.85 ? 0 : ri(R, 1, 9), g = blank(H, W, bg), n = ri(R, 1, 6);
  const cols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].filter(c => c !== bg);
  for (let k = 0; k < n; k++) {
    const c = pick(R, cols.slice(0, ri(R, 2, 9))), kind = ri(R, 0, 4);
    let cells = [];
    if (kind === 0 || kind === 1) { const h = ri(R, 1, 4), w = ri(R, 1, 4); for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) if (kind === 0 || i === 0 || j === 0 || i === h - 1 || j === w - 1) cells.push([i, j]); }
    else if (kind === 2) { let r = 0, cc = 0; cells.push([0, 0]); for (let s = ri(R, 1, 6); s > 0; s--) { const d = pick(R, [[0, 1], [1, 0], [0, -1], [-1, 0]]); r += d[0]; cc += d[1]; cells.push([r, cc]); } }
    else if (kind === 3) { const L = ri(R, 2, 6), hz = R() < 0.5; for (let i = 0; i < L; i++) cells.push(hz ? [0, i] : [i, 0]); }
    else { cells = [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]]; }
    const r0 = Math.min(...cells.map(p => p[0])), c0 = Math.min(...cells.map(p => p[1]));
    cells = cells.map(p => [p[0] - r0, p[1] - c0]);
    const hh = Math.max(...cells.map(p => p[0])) + 1, ww = Math.max(...cells.map(p => p[1])) + 1;
    if (hh > H || ww > W) continue;
    const orr = ri(R, 0, H - hh), oc = ri(R, 0, W - ww);
    if (cells.some(p => g[orr + p[0]][oc + p[1]] !== bg)) continue;
    cells.forEach(p => { g[orr + p[0]][oc + p[1]] = c; });
  }
  return g;
}
function genNoise(R) {
  const H = ri(R, 4, 14), W = ri(R, 4, 14), g = blank(H, W, 0), d = 0.08 + 0.3 * R(), cols = [ri(R, 1, 9), ri(R, 1, 9), ri(R, 1, 9)].slice(0, ri(R, 1, 3));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (R() < d) g[r][c] = pick(R, cols);
  return g;
}
function genMotif(R) {
  const h = ri(R, 2, 5), w = ri(R, 2, 5), m = blank(h, w, 0), cols = [ri(R, 1, 9), ri(R, 1, 9)];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (R() < 0.5) m[r][c] = pick(R, cols);
  const mode = ri(R, 0, 2);
  let g = mode === 0 ? E.G.tile(m, ri(R, 1, 3), ri(R, 1, 3)) : mode === 1 ? E.G.hconcat(m, E.G.flipH(m)) : E.G.vconcat(E.G.hconcat(m, E.G.flipH(m)), E.G.flipV(E.G.hconcat(m, E.G.flipH(m))));
  if (R() < 0.4) { const r = ri(R, 0, g.length - 1), c = ri(R, 0, g[0].length - 1); g[r][c] = 0; }
  return g;
}
function genPanels(R) {
  const n = ri(R, 2, 3), ph = ri(R, 3, 6), pw = ri(R, 3, 6), sep = ri(R, 1, 9), vert = R() < 0.5, c = ri(R, 1, 9);
  const panels = [];
  for (let k = 0; k < n; k++) { const p = blank(ph, pw, 0); for (let r = 0; r < ph; r++) for (let q = 0; q < pw; q++) if (R() < 0.35) p[r][q] = c === sep ? (c % 9) + 1 : c; panels.push(p); }
  let g = panels[0];
  for (let k = 1; k < n; k++) {
    const line = vert ? blank(ph, 1, sep) : blank(1, pw, sep);
    g = vert ? E.G.hconcat(E.G.hconcat(g, line), panels[k]) : E.G.vconcat(E.G.vconcat(g, line), panels[k]);
  }
  return g;
}
const GENS = { dev: null, objects: genObjects, noise: genNoise, motif: genMotif, panels: genPanels };
function sampleInput(R, gen, which) {
  if (gen === 'dev') { const pool = devInputs(which); return pool[Math.floor(R() * pool.length)].map(r => r.slice()); }
  return GENS[gen](R);
}

/* ---------------------------------------------------------- held-out sets */
const K = STEPS.N, GROUPS = [...new Set(STEPS.TYPES.map(t => t.group))];
const HO_GROUP_PAIRS = new Set(['geom>color', 'crop>scale', 'select>geom', 'move>draw', 'compress>color', 'color>move']);
function heldTypePairs(seed) {
  const R = rng(seed), s = new Set();
  for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) if (a !== b && R() < 0.10) s.add(a + '>' + b);
  return s;
}
const HO_TYPE_PAIRS = heldTypePairs(4242);
function fingerprint(rule) { return rule.steps.map(s => STEPS.NAMES[s[0]]).join('>') + '|' + (rule.fin ? rule.fin.kind : '-'); }
function fpHeld(fp) { let h = 2166136261; for (let i = 0; i < fp.length; i++) { h ^= fp.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10) === 0; }
function adjacencies(rule) {
  const out = [];
  for (let i = 1; i < rule.steps.length; i++) out.push([rule.steps[i - 1][0], rule.steps[i][0]]);
  return out;
}
function category(rule) {
  const adj = adjacencies(rule);
  const typeHeld = adj.some(([a, b]) => HO_TYPE_PAIRS.has(a + '>' + b));
  const groupHeld = adj.some(([a, b]) => HO_GROUP_PAIRS.has(STEPS.TYPES[a].group + '>' + STEPS.TYPES[b].group));
  const depth = rule.steps.length + (rule.fin && rule.fin.kind === 'sketch' ? 1 : 0);
  return { typeHeld, groupHeld, progHeld: fpHeld(fingerprint(rule)), depth };
}
function allowedInTraining(rule) {
  const c = category(rule);
  return !c.typeHeld && !c.groupHeld && !c.progHeld && rule.steps.length <= 3;
}

/* ------------------------------------------------------------- rules */
const STEP_TYPES = STEPS.TYPES.filter(t => t.run);
const BY_GROUP = {}; STEP_TYPES.forEach(t => { (BY_GROUP[t.group] = BY_GROUP[t.group] || []).push(t); });
const GROUP_LIST = Object.keys(BY_GROUP);
function sampleRule(R, opts) {
  opts = opts || {};
  const depth = opts.depth !== undefined ? opts.depth : ri(R, opts.minDepth || 1, opts.maxDepth || 3);
  const steps = [];
  for (let i = 0; i < depth; i++) {
    const t = pick(R, BY_GROUP[pick(R, GROUP_LIST)]);
    steps.push([t.id, t.colorArg ? ri(R, 0, 9) : null]);
  }
  const u = R(), fin = u < 0.25 ? { kind: 'cmap' } : u < 0.55 ? { kind: 'sketch' } : null;
  if (!steps.length && !fin) return null;
  return { steps, fin, gen: pick(R, ['dev', 'dev', 'objects', 'objects', 'noise', 'motif', 'panels']) };
}
/* run a rule on one input: states [S0 = x, S1, ...], y, or null */
function execute(rule, x, R, finCache) {
  const bg = E.G.background(x);
  const states = [x];
  let g = x;
  for (const [t, c] of rule.steps) {
    const h = STEPS.apply(STEPS.TYPES[t], g, bg, c);
    if (!h || E.G.gEq(h, g) || states.some(s => E.G.gEq(s, h))) return null;
    states.push(h); g = h;
  }
  let y = g;
  if (rule.fin && rule.fin.kind === 'cmap') {
    if (!finCache.map) {
      const pal = [...new Set(g.flat())], m = new Int8Array(10).fill(-1), n = Math.min(pal.length, ri(R, 1, 2));
      for (let i = 0; i < n; i++) { const a = pal[i]; let b = ri(R, 0, 9); if (b === a) b = (a + 1) % 10; m[a] = b; }
      finCache.map = m;
    }
    y = g.map(row => row.map(v => finCache.map[v] >= 0 ? finCache.map[v] : v));
  } else if (rule.fin && rule.fin.kind === 'sketch') {
    if (!finCache.prog) {
      let p = null;
      for (let k = 0; k < 6 && !p; k++) p = D.sampleProgram(R, [...new Set(g.flat())], 1);
      if (!p) return null;
      finCache.prog = p;
    }
    finCache.prog.bg = bg;
    try { y = E.SKETCH.run(finCache.prog, g); } catch (e) { y = null; }
  }
  if (!y || E.G.gEq(y, g) && rule.fin || E.G.gEq(y, x) || y.length > 30 || y[0].length > 30) return null;
  return { x, states, y, bg };
}
/* a task of the rule: nDemo demonstrations + nQuery queries, or null */
function makeTask(rule, R, which, nDemo, nQuery) {
  const finCache = {}, runs = [];
  for (let a = 0; a < 24 && runs.length < nDemo + nQuery; a++) {
    const x = sampleInput(R, rule.gen, which || 'train');
    const r = execute(rule, x, R, finCache);
    if (r && !runs.some(o => E.G.gEq(o.x, r.x))) runs.push(r);
  }
  if (runs.length < nDemo + nQuery) return null;
  /* the rule must not be the identity on the demonstrations' outputs */
  const ys = new Set(runs.map(r => E.G.gkey(r.y)));
  if (ys.size < 2) return null;
  /* the search executes every step with the TASK background (Ctx.bg: 0 if
     any demonstration input has background 0, else the commonest); every
     input must have been executed with that same background */
  const bgs = runs.slice(0, nDemo).map(r => r.bg), bg = bgs.includes(0) ? 0 : bgs.sort((a, b) => bgs.filter(v => v === b).length - bgs.filter(v => v === a).length)[0];
  if (runs.some(r => r.bg !== bg)) return null;
  return { rule, runs: runs.slice(0, nDemo), queries: runs.slice(nDemo), bg };
}
/* supervised transformation steps of one task: at every prefix state the
   next step; FIN_SKETCH before a sketch finisher */
function stepExamples(task) {
  const out = [], n = task.rule.steps.length, bg = task.bg;
  for (let k = 0; k <= n; k++) {
    let lab = null;
    if (k < n) lab = { type: task.rule.steps[k][0], color: task.rule.steps[k][1] === null ? undefined : task.rule.steps[k][1] };
    else if (task.rule.fin && task.rule.fin.kind === 'sketch') lab = { type: STEPS.FIN_SKETCH };
    if (!lab) continue;
    out.push({ bg, demos: task.runs.map(r => ({ x: r.x, S: r.states[k], y: r.y })), label: lab, k, prevSteps: task.rule.steps.slice(0, k).map(s => s[0]) });
  }
  return out;
}
function sampleTrainingTask(R) {
  for (let a = 0; a < 200; a++) {
    const rule = sampleRule(R);
    if (!rule || !allowedInTraining(rule)) continue;
    const t = makeTask(rule, R, 'train', 3, 0);
    if (t) return t;
  }
  return null;
}
module.exports = { sampleRule, makeTask, stepExamples, sampleTrainingTask, category, allowedInTraining, fingerprint, HO_GROUP_PAIRS, HO_TYPE_PAIRS, rng, E, STEPS, GROUPS };
