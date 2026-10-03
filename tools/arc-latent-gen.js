'use strict';
/* Procedural ARC-like tasks from LATENT EXECUTABLE PROGRAMS, with structural train/validation splits.
 *
 * Each task is produced by sampling a latent program in the same grammar the synthesiser searches (stages of
 * decision-list rules: a selector over object/colour/relation atoms and an effect), sampling scenes (objects, markers,
 * frames, panels, distractors, varying colours/sizes/positions), and executing the latent program to obtain the outputs.
 * The generator records the ground-truth program, its structural signature, the selected object ids and the stage
 * outputs, so a search can be audited against what it was supposed to find.
 *
 * Splits are by COMPOSITION, not by random task: a signature is the ordered list of (selector family, effect kind) pairs
 * per rule plus the stage count; a fixed hash of the signature decides whether it belongs to train or held-out. Held-out
 * compositions never appear in the training half.
 *
 *   node tools/arc-latent-gen.js --n 400 --seed 5 --out dir      # writes dir/train/*.json, dir/heldout/*.json, dir/index.json
 *
 * THESE ARE SYNTHETIC TASKS. Results on them say whether a mechanism works and whether a learned search policy transfers
 * to unseen compositions; they are never ARC scores.
 */
const fs = require('node:fs');
const path = require('node:path');
const E = require('../c4-arc-engine.js');
const G = E.G, P = E.PSYN;
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };

function rngMake(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];
const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------------------------------------------------------------- shapes */
const SHAPES = {
  rect: rng => { const h = rint(rng, 1, 4), w = rint(rng, 1, 4), c = []; for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) c.push([r, q]); return c; },
  line: rng => { const n = rint(rng, 2, 5), v = rng() < 0.5, c = []; for (let i = 0; i < n; i++) c.push(v ? [i, 0] : [0, i]); return c; },
  L: rng => { const a = rint(rng, 2, 4), b = rint(rng, 2, 4), c = []; for (let i = 0; i < a; i++) c.push([i, 0]); for (let j = 1; j < b; j++) c.push([a - 1, j]); return c; },
  T: rng => { const w = pick(rng, [3, 5]), c = []; for (let j = 0; j < w; j++) c.push([0, j]); const m = (w - 1) / 2; for (let i = 1; i < 3; i++) c.push([i, m]); return c; },
  plus: () => [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  frame: rng => { const h = rint(rng, 3, 5), w = rint(rng, 3, 5), c = []; for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) if (r === 0 || q === 0 || r === h - 1 || q === w - 1) c.push([r, q]); return c; },
  blob: rng => { const set = new Set(['0,0']), c = [[0, 0]]; const n = rint(rng, 3, 7); let guard = 0; while (c.length < n && guard++ < 60) { const b = pick(rng, c); const d = pick(rng, [[0, 1], [1, 0], [0, -1], [-1, 0]]); const k = (b[0] + d[0]) + ',' + (b[1] + d[1]); if (!set.has(k)) { set.add(k); c.push([b[0] + d[0], b[1] + d[1]]); } } const mr = Math.min(...c.map(x => x[0])), mc = Math.min(...c.map(x => x[1])); return c.map(x => [x[0] - mr, x[1] - mc]); },
  dot: () => [[0, 0]]
};
const SHAPE_NAMES = Object.keys(SHAPES);

function sampleScene(rng, opt) {
  const H = rint(rng, 10, 18), W = rint(rng, 10, 18), g = G.constGrid(H, W, 0);
  const palette = opt.palette.slice();
  const occ = G.constGrid(H, W, 0);
  const objs = [];
  const n = rint(rng, 3, 7);
  let guard = 0;
  while (objs.length < n && guard++ < 200) {
    const shape = pick(rng, opt.shapes || SHAPE_NAMES), cells = SHAPES[shape](rng);
    const col = pick(rng, palette);
    const h = Math.max(...cells.map(c => c[0])) + 1, w = Math.max(...cells.map(c => c[1])) + 1;
    if (h + 2 > H || w + 2 > W) continue;
    const r0 = rint(rng, 1, H - h - 1), c0 = rint(rng, 1, W - w - 1);
    let ok = true;
    for (let r = r0 - 1; r <= r0 + h && ok; r++) for (let c = c0 - 1; c <= c0 + w; c++) if (r >= 0 && c >= 0 && r < H && c < W && occ[r][c]) { ok = false; break; }
    if (!ok) continue;
    for (const [dr, dc] of cells) { g[r0 + dr][c0 + dc] = col; occ[r0 + dr][c0 + dc] = 1; }
    objs.push({ shape, color: col, r0, c0, cells: cells.map(([dr, dc]) => [r0 + dr, c0 + dc]) });
  }
  /* markers next to some objects */
  if (opt.marker !== undefined) {
    const mk = opt.marker;
    const k = rint(rng, 1, Math.max(1, Math.floor(objs.length / 2)));
    for (let i = 0; i < k; i++) {
      const o = pick(rng, objs), cell = pick(rng, o.cells), d = pick(rng, [[0, 1], [1, 0], [0, -1], [-1, 0]]);
      const r = cell[0] + d[0], c = cell[1] + d[1];
      if (r >= 0 && c >= 0 && r < H && c < W && g[r][c] === 0 && !occ[r][c]) { g[r][c] = mk; occ[r][c] = 1; }
    }
  }
  return g;
}

/* ---------------------------------------------------------------- latent programs */
const SEL_FAMILIES = {
  color: (rng, o) => ({ atoms: [{ t: 'col', v: o.pal[0] }] }),
  largest: () => ({ atoms: [{ t: 'bool', v: 'largest' }] }),
  smallest: () => ({ atoms: [{ t: 'bool', v: 'smallest' }] }),
  uniqColor: () => ({ atoms: [{ t: 'bool', v: 'uniqColor' }] }),
  uniqShape: () => ({ atoms: [{ t: 'bool', v: 'uniqShape' }] }),
  border: () => ({ atoms: [{ t: 'bool', v: 'border' }] }),
  holes: () => ({ atoms: [{ t: 'bool', v: 'hasHoles' }] }),
  single: () => ({ atoms: [{ t: 'bool', v: 'single' }] }),
  adjMarker: (rng, o) => ({ atoms: [{ t: 'rel', rel: 'adj', p: { t: 'col', v: o.marker } }], needsMarker: true }),
  notAdjMarker: (rng, o) => ({ atoms: [{ t: 'not', a: { t: 'rel', rel: 'adj', p: { t: 'col', v: o.marker } } }, { t: 'bool', v: 'largest' }], needsMarker: true }),
  colorAndLarge: (rng, o) => ({ atoms: [{ t: 'col', v: o.pal[0] }, { t: 'num', f: 'size', op: '>=', v: 4 }] }),
  all: () => ({ atoms: [] })
};
const EFF_FAMILIES = {
  recolorLit: (rng, o) => ({ kind: 'recolor', ref: { kind: 'lit', v: o.out } }),
  recolorMarker: (rng, o) => ({ kind: 'recolor', ref: { kind: 'rel', v: 'adj' }, needsMarker: true }),
  delete: () => ({ kind: 'delete', th: null }),
  move: (rng) => ({ kind: 'move', th: pick(rng, [[2, 0], [0, 2], [-2, 0], [0, -2], [1, 1], [3, 0]]) }),
  slide: (rng) => ({ kind: 'slide', th: rint(rng, 0, 3) }),
  d4: (rng) => ({ kind: 'd4', th: pick(rng, [2, 4, 6]) }),
  fillbox: (rng, o) => ({ kind: 'fillbox', ref: { kind: 'lit', v: o.out } }),
  halo: (rng, o) => ({ kind: 'halo8', ref: { kind: 'lit', v: o.out } }),
  ray: (rng, o) => ({ kind: 'ray', th: { d: rint(rng, 0, 3), col: o.out } }),
  copy: (rng) => ({ kind: 'copy', th: pick(rng, [[4, 0], [0, 4], [-4, 0], [0, -4]]) })
};
function sampleProgram(rng, nStages, families) {
  const palAll = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const o = { pal: [pick(rng, palAll)], marker: pick(rng, palAll.filter(c => c !== 0)), out: pick(rng, palAll) };
  while (o.marker === o.pal[0]) o.marker = pick(rng, palAll);
  while (o.out === o.pal[0] || o.out === o.marker) o.out = pick(rng, palAll);
  const stages = [], sig = [];
  let needsMarker = false;
  for (let s = 0; s < nStages; s++) {
    const nRules = nStages > 1 ? 1 : rint(rng, 1, 2), rules = [];
    for (let r = 0; r < nRules; r++) {
      const sf = pick(rng, families.sel), ef = pick(rng, families.eff);
      const sel = SEL_FAMILIES[sf](rng, o), eff = EFF_FAMILIES[ef](rng, o);
      if (sel.needsMarker || eff.needsMarker) needsMarker = true;
      rules.push({ kind: eff.kind, th: eff.th, ref: eff.ref, atoms: sel.atoms, bits: 5 });
      sig.push(sf + '>' + ef);
    }
    stages.push({ parse: pick(rng, ['c4', 'c8']), bgMode: 'mode', rules, bits: 8 });
  }
  return { prog: { stages, bits: 0 }, sig: nStages + ':' + sig.join('|'), consts: o, needsMarker };
}

/* every rule must select at least one object in the example (otherwise it is unlearnable from that example) */
function allRulesFire(latent, g) {
  let cur = g;
  for (const st of latent.prog.stages) {
    const sc = P.parse(cur, st.parse, st.bgMode);
    const fired = st.rules.map(() => 0), handled = new Set();
    for (const o of sc.objs) {
      for (let j = 0; j < st.rules.length; j++) {
        if (st.rules[j].atoms.every(a => P.evalAtom(a, sc, o))) { fired[j]++; break; }
      }
    }
    if (fired.some(n => n === 0)) return false;
    cur = P.ObjFX.runProgram({ stages: [st] }, cur);
    if (!cur) return false;
  }
  return true;
}

function makeTask(rng, latent, nTrain) {
  const pairs = [];
  let tries = 0;
  const pal = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(c => c !== latent.consts.out);
  while (pairs.length < nTrain + 1 && tries++ < 400) {
    const palette = [latent.consts.pal[0], ...pal.filter(c => c !== latent.consts.pal[0] && c !== latent.consts.marker).sort(() => rng() - 0.5).slice(0, 2)];
    const g = sampleScene(rng, { palette, marker: latent.needsMarker ? latent.consts.marker : undefined, shapes: undefined });
    const out = P.ObjFX.runProgram(latent.prog, g);
    if (!out || !allRulesFire(latent, g)) continue;
    let changed = 0; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c] !== out[r][c]) changed++;
    if (!changed || changed > g.length * g[0].length * 0.5) continue;
    pairs.push({ input: g, output: out });
  }
  if (pairs.length < nTrain + 1) return null;
  return { train: pairs.slice(0, nTrain), test: [pairs[nTrain]] };
}

function generate(n, seed) {
  const rng = rngMake(seed), out = [];
  const families = { sel: Object.keys(SEL_FAMILIES), eff: Object.keys(EFF_FAMILIES) };
  let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const nStages = rng() < 0.7 ? 1 : 2;
    const latent = sampleProgram(rng, nStages, families);
    const task = makeTask(rng, latent, rint(rng, 3, 4));
    if (!task) continue;
    const isHeld = hashStr(latent.sig) % 4 === 0;
    out.push({ id: 'lat' + seed + '_' + String(out.length).padStart(4, '0'), split: isHeld ? 'heldout' : 'train', sig: latent.sig, program: P.ObjFX.progStr(latent.prog), latent: latent.prog, task });
  }
  return out;
}

if (require.main === module) {
  const n = +arg('n', 200), seed = +arg('seed', 1), dir = arg('out', null);
  const tasks = generate(n, seed);
  const idx = tasks.map(t => ({ id: t.id, split: t.split, sig: t.sig, program: t.program }));
  const held = tasks.filter(t => t.split === 'heldout').length;
  console.log(JSON.stringify({ n: tasks.length, train: tasks.length - held, heldout: held, signatures: new Set(tasks.map(t => t.sig)).size, heldoutSignatures: new Set(tasks.filter(t => t.split === 'heldout').map(t => t.sig)).size }));
  if (dir) {
    for (const s of ['train', 'heldout']) fs.mkdirSync(path.join(dir, s), { recursive: true });
    for (const t of tasks) fs.writeFileSync(path.join(dir, t.split, t.id + '.json'), JSON.stringify(t.task));
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx, null, 1));
  }
}
module.exports = { generate, sampleProgram, makeTask, SEL_FAMILIES, EFF_FAMILIES };
