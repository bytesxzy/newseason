'use strict';
/* Structural probe of ARC tasks. Reads TRAIN pairs only (never test outputs) and buckets each task by the kind of
 * explanation that could produce its outputs, so that synthesis effort goes where unsolved tasks actually are.
 *
 *   node tools/arc-probe.js <task-json-dir> [--solved <bench-results-dir>] [--out file.json]
 */
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const dir = args[0];
const solvedDir = arg('solved', null);
const outFile = arg('out', null);
const eq = (a, b) => a.length === b.length && a.every((r, i) => r.every((v, j) => v === b[i][j]));
const mode = g => { const c = {}; let b = 0, bv = 0; for (const r of g) for (const v of r) { c[v] = (c[v] || 0) + 1; if (c[v] > bv) { bv = c[v]; b = v; } } return +b; };
function sub(g, r0, c0, h, w) { return g.slice(r0, r0 + h).map(r => r.slice(c0, c0 + w)); }
function findSub(g, s) { const H = g.length, W = g[0].length, h = s.length, w = s[0].length; const hits = []; for (let r = 0; r + h <= H; r++) for (let c = 0; c + w <= W; c++) { let ok = true; for (let i = 0; ok && i < h; i++) for (let j = 0; j < w; j++) if (g[r + i][c + j] !== s[i][j]) { ok = false; break; } if (ok) hits.push([r, c]); } return hits; }
const D4 = [g => g, g => g[0].map((_, j) => g.map(r => r[j]).reverse()), g => g.map(r => r.slice().reverse()).reverse(), g => g[0].map((_, j) => g.map(r => r[r.length - 1 - j])), g => g.map(r => r.slice().reverse()), g => g.slice().reverse(), g => g[0].map((_, j) => g.map(r => r[j])), g => g[0].map((_, j) => g.map(r => r[r.length - 1 - j]).reverse())];
function describe(t) {
  const d = { nTrain: t.train.length };
  const ps = t.train;
  const same = ps.every(p => p.input.length === p.output.length && p.input[0].length === p.output[0].length);
  d.same = same;
  const rel = new Set();
  for (const p of ps) {
    const H = p.input.length, W = p.input[0].length, h = p.output.length, w = p.output[0].length;
    if (h === H && w === W) rel.add('same');
    else if (h % H === 0 && w % W === 0 && h >= H && w >= W) rel.add('grow' + (h / H) + 'x' + (w / W));
    else if (H % h === 0 && W % w === 0) rel.add('shrink' + (H / h) + 'x' + (W / w));
    else if (h <= H && w <= W) rel.add('crop');
    else rel.add('other');
  }
  d.dimsRel = [...rel].sort().join('|');
  const sizes = new Set(ps.map(p => p.output.length + 'x' + p.output[0].length));
  d.constOut = sizes.size === 1;
  if (same) {
    let ch = 0, tot = 0, add = 0, del = 0, rec = 0;
    for (const p of ps) { const bg = mode(p.input); for (let r = 0; r < p.input.length; r++) for (let c = 0; c < p.input[0].length; c++) { tot++; const a = p.input[r][c], b = p.output[r][c]; if (a !== b) { ch++; if (a === bg) add++; else if (b === bg) del++; else rec++; } } }
    d.changedFrac = +(ch / tot).toFixed(4);
    d.changeType = ch === 0 ? 'none' : (add && !del && !rec) ? 'add_only' : (!add && del && !rec) ? 'del_only' : (!add && !del && rec) ? 'recolor_only' : 'mixed';
  } else {
    // output is an exact subgrid (possibly after a dihedral move) of the input in every pair?
    let crop = true, cropT = true;
    for (const p of ps) {
      if (p.output.length > p.input.length || p.output[0].length > p.input[0].length) { crop = cropT = false; break; }
      if (!findSub(p.input, p.output).length) crop = false;
      if (!D4.some(f => { const o = f(p.output); return o.length <= p.input.length && o[0].length <= p.input[0].length && findSub(p.input, o).length; })) cropT = false;
    }
    d.exactCrop = crop; d.cropUpToD4 = cropT;
    // output palette subset of input palette?
    d.paletteSubset = ps.every(p => { const s = new Set(p.input.flat()); return p.output.flat().every(v => s.has(v)); });
  }
  d.bgSame = new Set(ps.map(p => mode(p.input))).size === 1;
  return d;
}
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const rows = {};
for (const f of files) {
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const id = 'arc1_' + f.replace(/\.json$/, '');
  rows[id] = describe(t);
}
if (solvedDir) for (const id of Object.keys(rows)) {
  const p = path.join(solvedDir, id + '.json');
  if (fs.existsSync(p)) { const r = JSON.parse(fs.readFileSync(p, 'utf8')); rows[id].solved = !!r.solved_top1; rows[id].failure = r.failure_class; rows[id].family = r.winning_family; }
}
const bucket = d => d.same ? 'same/' + d.changeType : (d.exactCrop ? 'crop/exact' : d.cropUpToD4 ? 'crop/d4' : 'dims/' + d.dimsRel.replace(/\d+x\d+/g, 'k') + (d.constOut ? '/constOut' : ''));
const tab = {};
for (const [id, d] of Object.entries(rows)) { const b = bucket(d); tab[b] = tab[b] || { n: 0, solved: 0, ids: [] }; tab[b].n++; if (d.solved) tab[b].solved++; if (!d.solved) tab[b].ids.push(id); }
for (const [b, v] of Object.entries(tab).sort((a, b) => b[1].n - a[1].n)) console.log(b.padEnd(34), String(v.n).padStart(4), 'solved', String(v.solved).padStart(4), 'unsolved', String(v.n - v.solved).padStart(4));
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ rows, tab }, null, 1));
