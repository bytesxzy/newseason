/* Dreaming: synthetic tasks from the entity-program grammar.
 *
 * A program is sampled from the same typed grammar the sketch engine
 * searches (seg x decision-list rules x growth rules, holes filled with
 * expressions) and EXECUTED on real input grids taken from the development
 * corpus (inputs only -- no output of any ARC task is read). Every executed
 * program is by construction the solution of the task it produces: this is
 * hindsight relabelling and DreamCoder's "fantasies" at once.
 *
 * Diversity, not volume: programs are drawn with controlled depth (number of
 * rules), every draw is fingerprinted by its structure (seg, rule kinds,
 * operator families, expression classes), and suites are balanced by
 * fingerprint. Degenerate draws are rejected: no change on some demo, the
 * same output everywhere, an output identical to the input's, a test input
 * the program cannot execute, or a change so large it is noise.
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'c4-arc-engine.js'));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (R, a) => a[Math.floor(R() * a.length)];

const OBJ_KINDS = ['recolor', 'del', 'move', 'moverc', 'copy'];
const FAM_OF_OP = op => E.SKETCH.opFamily(op);

function exprClass(x) {
  if (!x) return '-';
  if (x.lit) return 'lit';
  if (x.tab) return 'tab';
  if (x.rel) return 'rel';
  return x.k.replace(/[^a-z].*$/, '') || 'x';
}

/* concept families of a program, for balancing and leave-family-out */
function families(p) {
  const f = new Set();
  p.rules.forEach(r => f.add(r.a.kind));
  if (p.def === 'del') f.add('keeponly');
  (p.grow || []).forEach(g => f.add(FAM_OF_OP(g.g.op)));
  return [...f].sort();
}
function fingerprint(p) {
  return [p.seg, p.def, p.rules.map(r => r.a.kind + ':' + exprClass(r.a.v || r.a.c) + ':' + r.p.k.replace(/[=<>!:].*$/, '')).join(','),
    (p.grow || []).map(g => FAM_OF_OP(g.g.op) + ':' + exprClass(g.g.c)).join(',')].join('|');
}

/* sample one program for a scene family (preds need a palette) */
function sampleProgram(R, palette, depth, opts) {
  opts = opts || {};
  const segs = ['c8', 'c4', 'm8', 'col', 'bgin'];
  const seg = pick(R, segs);
  const preds = E.EXPR.predCatalog([], palette).filter(p => !/^n[<>=]/.test(p.k));
  const cheapPreds = preds.filter(p => p.b <= 3.5 + E.EXPR.LOG2_10 && !/^first|^last|^mid$/.test(p.k));
  const colorLits = E.SKETCH.COLOR_EXPRS.filter(c => c.lit && palette.concat([1, 2, 3, 4, 5, 6, 7, 8, 9]).includes(+c.k.slice(1)));
  const colorAny = E.SKETCH.COLOR_EXPRS.filter(c => !c.lit || colorLits.includes(c));
  const vecs = E.SKETCH.VEC_EXPRS.filter(v => !/#c/.test(v.k));
  let nRules = 0, nGrow = 0;
  const kinds = opts.families;
  for (let i = 0; i < depth; i++) { if (R() < 0.5) nRules++; else nGrow++; }
  const rules = [];
  for (let i = 0; i < nRules; i++) {
    const kind = pick(R, OBJ_KINDS.filter(k => !kinds || kinds.includes(k)).concat(kinds && !OBJ_KINDS.some(k => kinds.includes(k)) ? [] : []));
    if (!kind) break;
    const a = { kind };
    if (kind === 'recolor' || kind === 'moverc') a.c = pick(R, colorAny);
    if (kind === 'move' || kind === 'copy' || kind === 'moverc') a.v = pick(R, vecs);
    rules.push({ p: pick(R, cheapPreds), a });
  }
  const grow = [];
  const ops = E.GEN.OPS.filter(o => !kinds || kinds.includes(FAM_OF_OP(o)));
  for (let i = 0; i < nGrow && ops.length; i++) {
    const op = pick(R, ops);
    grow.push({ p: pick(R, cheapPreds), g: { op, c: op.patch ? null : pick(R, colorAny), b: op.b } });
  }
  if (!rules.length && !grow.length) return null;
  return { seg, bg: 0, rules, def: R() < 0.15 && rules.length ? 'del' : 'keep', grow, canvas: -1 };
}

/* inputs: groups of same-task input grids from the development corpus */
function inputGroups(corpusFile, prefix) {
  const T = require(corpusFile);
  const grid = s => s.split('|').map(r => [...r].map(Number));
  return T.filter(t => t[0].startsWith(prefix)).map(t => {
    const ins = t[1].split(';').map(p => grid(p.split('>')[0])).concat(t[2].split(';').map(p => grid(p.split('>')[0])));
    return { id: t[0], inputs: ins };
  }).filter(g => g.inputs.length >= 3 && g.inputs.every(x => x.length <= 20 && x[0].length <= 20));
}

/* execute program on a group's inputs; returns a task or null */
function makeTask(p, group, bgOf) {
  const bg = bgOf(group.inputs);
  p.bg = bg;
  const pairs = [];
  for (const x of group.inputs) {
    let y = null;
    try { y = E.SKETCH.run(p, x); } catch (e) { y = null; }
    if (!y) return null;
    let d = 0;
    for (let r = 0; r < x.length; r++) for (let c = 0; c < x[0].length; c++) if (x[r][c] !== y[r][c]) d++;
    if (!d || d > 0.6 * x.length * x[0].length) return null;
    pairs.push([x, y]);
  }
  const keys = new Set(pairs.map(q => E.G.gkey(q[1])));
  if (keys.size < pairs.length) return null;
  return { train: pairs.slice(0, pairs.length - 1), test: pairs.slice(pairs.length - 1), prog: p, src: group.id };
}

function bgOf(inputs) {
  const cnt = new Array(10).fill(0);
  for (const g of inputs) for (const row of g) for (const v of row) cnt[v]++;
  if (cnt[0] > 0) return 0;
  return cnt.indexOf(Math.max(...cnt));
}

/* a suite of n tasks at the given depth, balanced by fingerprint */
function suite(opts) {
  const R = rng(opts.seed || 1);
  const groups = opts.groups;
  const out = [], perPrint = new Map(), maxPer = opts.maxPerPrint || 3;
  let tries = 0;
  while (out.length < opts.n && tries < opts.n * 400) {
    tries++;
    const g = pick(R, groups);
    const pal = [...new Set(g.inputs.flat(2))];
    const p = sampleProgram(R, pal, opts.depth, { families: opts.families });
    if (!p) continue;
    const fams = families(p);
    if (opts.exclude && fams.some(f => opts.exclude.includes(f))) continue;
    if (opts.require && !fams.some(f => opts.require.includes(f))) continue;
    const fp = fingerprint(p);
    if ((perPrint.get(fp) || 0) >= maxPer) continue;
    const t = makeTask(p, g, bgOf);
    if (!t) continue;
    perPrint.set(fp, (perPrint.get(fp) || 0) + 1);
    t.families = fams; t.fp = fp; t.depth = opts.depth;
    out.push(t);
  }
  return out;
}

module.exports = { rng, sampleProgram, makeTask, suite, inputGroups, families, fingerprint, bgOf, E };
