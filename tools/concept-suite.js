'use strict';
/* Concept audit: parametric ARC-style concept families, generated from scratch.
 *
 * Each family fixes its task-level parameters once (a colour, a direction, a
 * size) and then draws random demonstration and test inputs, so a solver has
 * to learn the concept rather than memorise a grid. No ARC data is read.
 * This measures robustness of coverage per concept -- the thing a missing
 * primitive breaks -- rather than a score on any benchmark.
 *
 *   node tools/concept-suite.js [--n 6] [--budget 3] [--only name,name] [--seed 1] [--engine path]
 */
const path = require('node:path');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const N = +arg('n', 6), BUDGET = +arg('budget', 3), SEED = +arg('seed', 1);
const ONLY = arg('only', '').split(',').filter(Boolean), SHOW = arg('show', ''), MODULE = arg('module', '');
const E = require(path.resolve(arg('engine', path.join(__dirname, '..', 'c4-arc-engine.js'))));

const PRI = arg('prior', ''); if (PRI) PRI.split(',').forEach(kv => { const [k, v] = kv.split('='); E.SOLVER_PRIOR[k] = +v; });
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let R = rng(1);
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
const pick = arr => arr[Math.floor(R() * arr.length)];
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const G = (h, w, v = 0) => Array.from({ length: h }, () => new Array(w).fill(v));
const copy = g => g.map(r => r.slice());
const inb = (g, r, c) => r >= 0 && c >= 0 && r < g.length && c < g[0].length;
const colors = (n, excl = [0]) => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter(c => !excl.includes(c))).slice(0, n);
const D8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
/* random empty cell positions with a minimum spacing (Chebyshev) */
function spots(g, n, gap = 2, avoid = []) {
  const out = [], h = g.length, w = g[0].length; let tries = 0;
  while (out.length < n && tries++ < 400) {
    const r = ri(0, h - 1), c = ri(0, w - 1);
    if (g[r][c] !== 0) continue;
    if ([...out, ...avoid].some(p => Math.max(Math.abs(p[0] - r), Math.abs(p[1] - c)) < gap)) continue;
    out.push([r, c]);
  }
  return out;
}
function rect(g, r0, c0, h, w, v, hollow = false) {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
    if (!inb(g, r, c)) continue;
    if (hollow && r > r0 && r < r0 + h - 1 && c > c0 && c < c0 + w - 1) continue;
    g[r][c] = v;
  }
}
/* free rectangle placement: returns [r, c] or null */
function place(g, h, w, margin = 1) {
  for (let t = 0; t < 200; t++) {
    const r = ri(0, g.length - h), c = ri(0, g[0].length - w); let ok = true;
    for (let rr = r - margin; rr < r + h + margin && ok; rr++) for (let cc = c - margin; cc < c + w + margin; cc++)
      if (inb(g, rr, cc) && g[rr][cc] !== 0) { ok = false; break; }
    if (ok) return [r, c];
  }
  return null;
}
/* random connected blob of n cells inside h x w, as a list of [r, c] */
function blob(n, h, w) {
  const cells = [[ri(0, h - 1), ri(0, w - 1)]], set = new Set([cells[0].join()]);
  let tries = 0;
  while (cells.length < n && tries++ < 300) {
    const [r, c] = pick(cells), [dr, dc] = pick(D8.slice(0, 4)), nr = r + dr, nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= h || nc >= w || set.has(nr + ',' + nc)) continue;
    set.add(nr + ',' + nc); cells.push([nr, nc]);
  }
  return cells;
}
function putBlob(g, cells, r0, c0, v) { cells.forEach(([r, c]) => { if (inb(g, r0 + r, c0 + c)) g[r0 + r][c0 + c] = v; }); }
function objects(g, bg = 0, diag = true) {
  const h = g.length, w = g[0].length, seen = G(h, w), out = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    if (g[r][c] === bg || seen[r][c]) continue;
    const col = g[r][c], st = [[r, c]], cells = []; seen[r][c] = 1;
    while (st.length) {
      const [a, b] = st.pop(); cells.push([a, b]);
      for (const [dr, dc] of (diag ? D8 : D8.slice(0, 4))) {
        const nr = a + dr, nc = b + dc;
        if (inb(g, nr, nc) && !seen[nr][nc] && g[nr][nc] === col) { seen[nr][nc] = 1; st.push([nr, nc]); }
      }
    }
    out.push({ cells, color: col, n: cells.length });
  }
  return out;
}

/* each family returns sample(): [input, output] after fixing its parameters */
const FAMILIES = {};
const fam = (name, f) => { FAMILIES[name] = f; };

fam('ray_fixed_dir', () => { const d = pick(D8), col = colors(2); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length); const s = spots(g, ri(2, 3), 4);
  s.forEach(([r, c], i) => { g[r][c] = col[i % 2]; o[r][c] = col[i % 2]; });
  s.forEach(([r, c], i) => { let a = r + d[0], b = c + d[1]; while (inb(g, a, b)) { if (!g[a][b] && !o[a][b]) o[a][b] = col[i % 2]; a += d[0]; b += d[1]; } });
  return [g, o]; }; });
fam('ray_cross', () => { const col = colors(1)[0]; return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length); const s = spots(g, ri(1, 2), 5);
  s.forEach(([r, c]) => { g[r][c] = col; });
  s.forEach(([r, c]) => { for (let i = 0; i < g.length; i++) o[i][c] = col; for (let j = 0; j < g[0].length; j++) o[r][j] = col; });
  return [g, o]; }; });
fam('ray_by_color', () => { const [a, b] = colors(2), da = pick(D8.slice(0, 4)), db = pick(D8.slice(0, 4).filter(d => d !== da)); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length); const s = spots(g, 4, 3);
  s.forEach(([r, c], i) => { const col = i % 2 ? a : b, d = i % 2 ? da : db; g[r][c] = col; o[r][c] = col;
    let x = r + d[0], y = c + d[1]; while (inb(g, x, y)) { if (!g[x][y] && !o[x][y]) o[x][y] = col; x += d[0]; y += d[1]; } });
  return [g, o]; }; });
fam('between_hv', () => { const col = colors(1)[0]; return () => {
  const g = G(ri(10, 15), ri(10, 15)), o = G(g.length, g[0].length);
  const n = ri(2, 3), used = new Set();
  for (let k = 0; k < n; k++) {
    if (R() < 0.5) { const r = ri(0, g.length - 1); if (used.has('r' + r)) continue; used.add('r' + r); const c1 = ri(0, g[0].length - 4), c2 = ri(c1 + 3, g[0].length - 1);
      g[r][c1] = col; g[r][c2] = col; for (let c = c1; c <= c2; c++) o[r][c] = col; }
    else { const c = ri(0, g[0].length - 1); if (used.has('c' + c)) continue; used.add('c' + c); const r1 = ri(0, g.length - 4), r2 = ri(r1 + 3, g.length - 1);
      g[r1][c] = col; g[r2][c] = col; for (let r = r1; r <= r2; r++) if (o[r][c] === 0) o[r][c] = col; }
  }
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) o[r][c] = g[r][c];
  /* reject accidental alignments: every marked cell may share a row/column with exactly its partner */
  const pts = []; g.forEach((row, r) => row.forEach((v, c) => { if (v) pts.push([r, c]); }));
  for (const p of pts) { const same = pts.filter(q => q !== p && (q[0] === p[0] || q[1] === p[1])); if (same.length !== 1) return null; }
  return [g, o]; }; });
fam('halo8', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(9, 13), ri(9, 13)), o = G(g.length, g[0].length); const s = spots(g, ri(2, 4), 4);
  s.forEach(([r, c]) => { g[r][c] = a; D8.forEach(([dr, dc]) => { if (inb(o, r + dr, c + dc)) o[r + dr][c + dc] = b; }); });
  s.forEach(([r, c]) => { o[r][c] = a; }); return [g, o]; }; });
fam('stamp_plus', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(9, 13), ri(9, 13)), o = G(g.length, g[0].length); const s = spots(g, ri(2, 4), 4);
  s.forEach(([r, c]) => { g[r][c] = a; D8.slice(0, 4).forEach(([dr, dc]) => { if (inb(o, r + dr, c + dc)) o[r + dr][c + dc] = b; }); });
  s.forEach(([r, c]) => { o[r][c] = a; }); return [g, o]; }; });
fam('fill_rect_interior', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(11, 15), ri(11, 15)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(1, 3); k++) { const h = ri(4, 6), w = ri(4, 6), p = place(g, h, w); if (!p) continue;
    rect(g, p[0], p[1], h, w, a, true); rect(o, p[0], p[1], h, w, a, true); rect(o, p[0] + 1, p[1] + 1, h - 2, w - 2, b); }
  return [g, o]; }; });
fam('fill_holes_by_size', () => { const [fr, s1, s2] = colors(3); return () => {
  const g = G(ri(12, 16), ri(12, 16)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(2, 4); k++) { const big = R() < 0.5, h = big ? ri(4, 5) : 3, w = big ? ri(4, 5) : 3, p = place(g, h, w); if (!p) continue;
    rect(g, p[0], p[1], h, w, fr, true); rect(o, p[0], p[1], h, w, fr, true); rect(o, p[0] + 1, p[1] + 1, h - 2, w - 2, big ? s2 : s1); }
  return [g, o]; }; });
fam('flood_enclosed_seed', () => { const [wall, seed] = colors(2); return () => {
  const g = G(ri(11, 15), ri(11, 15)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(2, 3); k++) { const h = ri(4, 6), w = ri(4, 6), p = place(g, h, w); if (!p) continue;
    rect(g, p[0], p[1], h, w, wall, true); rect(o, p[0], p[1], h, w, wall, true);
    if (R() < 0.6) { g[p[0] + 1 + ri(0, h - 3)][p[1] + 1 + ri(0, w - 3)] = seed; rect(o, p[0] + 1, p[1] + 1, h - 2, w - 2, seed); } }
  return [g, o]; }; });
fam('bbox_ring', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(12, 16), ri(12, 16)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(1, 3); k++) { const h = ri(2, 3), w = ri(2, 4), p = place(g, h, w, 2); if (!p) continue;
    rect(g, p[0], p[1], h, w, a); rect(o, p[0] - 1, p[1] - 1, h + 2, w + 2, b); rect(o, p[0], p[1], h, w, a); }
  return [g, o]; }; });
fam('diag_from_corners', () => { const col = colors(2); return () => {
  const g = G(ri(12, 16), ri(12, 16)), o = G(g.length, g[0].length); const h = 2, w = 2, p = place(g, h, w, 4); if (!p) return [g, o];
  rect(g, p[0], p[1], h, w, col[0]); rect(o, p[0], p[1], h, w, col[0]);
  [[-1, -1, p[0] - 1, p[1] - 1], [-1, 1, p[0] - 1, p[1] + w], [1, -1, p[0] + h, p[1] - 1], [1, 1, p[0] + h, p[1] + w]].forEach(([dr, dc, r, c]) => { while (inb(o, r, c)) { o[r][c] = col[1]; r += dr; c += dc; } });
  return [g, o]; }; });

fam('recolor_largest', () => { const [a, b, c] = colors(3); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length); const sizes = shuffle([2, 3, 4, 5, 6]).slice(0, ri(2, 4));
  const objs = sizes.map(n => { const bl = blob(n, 3, 3), p = place(g, 3, 3); if (!p) return null; putBlob(g, bl, p[0], p[1], a); return { bl, p, n }; }).filter(Boolean);
  const mx = Math.max(...objs.map(x => x.n)); objs.forEach(x => putBlob(o, x.bl, x.p[0], x.p[1], x.n === mx ? b : a));
  return [g, o]; }; });
fam('recolor_by_size_rank', () => { const cs = colors(3); return () => {
  const g = G(ri(12, 16), ri(12, 16)), o = G(g.length, g[0].length); const sizes = shuffle([1, 2, 3, 4, 5, 6, 7]).slice(0, 3);
  const objs = sizes.map(n => { const bl = blob(n, 3, 3), p = place(g, 3, 3); if (!p) return null; putBlob(g, bl, p[0], p[1], 5); return { bl, p, n }; }).filter(Boolean);
  const order = objs.slice().sort((x, y) => y.n - x.n); order.forEach((x, i) => putBlob(o, x.bl, x.p[0], x.p[1], cs[i]));
  return [g, o]; }; });
fam('recolor_by_holes', () => { const cs = colors(2); return () => {
  const g = G(ri(12, 16), ri(12, 16)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(2, 4); k++) { const holey = R() < 0.5, p = place(g, 3, 3); if (!p) continue; rect(g, p[0], p[1], 3, 3, 5, holey); rect(o, p[0], p[1], 3, 3, holey ? cs[0] : cs[1], holey); }
  return [g, o]; }; });
fam('recolor_touch_border', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(3, 5); k++) { const edge = R() < 0.5, h = ri(1, 3), w = ri(1, 3); let p = null;
    if (edge) { const r = R() < 0.5 ? 0 : g.length - h; const c = ri(0, g[0].length - w); p = place(g, h, w, 1) || null; if (p) p = [r, p[1]]; }
    else { p = place(g, h, w, 1); if (p) { p = [Math.max(1, Math.min(g.length - h - 1, p[0])), Math.max(1, Math.min(g[0].length - w - 1, p[1]))]; } }
    if (!p) continue; if (g.some((row, r) => row.some((v, c) => v && Math.abs(r - p[0]) < h + 1 && Math.abs(c - p[1]) < w + 1))) continue;
    rect(g, p[0], p[1], h, w, a); const touches = p[0] === 0 || p[1] === 0 || p[0] + h === g.length || p[1] + w === g[0].length; rect(o, p[0], p[1], h, w, touches ? b : a); }
  return [g, o]; }; });
fam('swap_two_colors', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(6, 10), ri(6, 10)); for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) g[r][c] = pick([0, 0, a, b]);
  return [g, g.map(r => r.map(v => v === a ? b : v === b ? a : v))]; }; });
fam('remove_color', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(6, 10), ri(6, 10)); for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) g[r][c] = pick([0, 0, a, b]);
  return [g, g.map(r => r.map(v => v === a ? 0 : v))]; }; });
fam('keep_largest_object', () => { const cs = colors(3); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length); const sizes = shuffle([2, 3, 4, 5, 6, 7]).slice(0, ri(2, 4));
  const objs = sizes.map((n, i) => { const bl = blob(n, 3, 3), p = place(g, 3, 3); if (!p) return null; putBlob(g, bl, p[0], p[1], cs[i % 3]); return { bl, p, n, col: cs[i % 3] }; }).filter(Boolean);
  const mx = objs.reduce((a, b) => b.n > a.n ? b : a); putBlob(o, mx.bl, mx.p[0], mx.p[1], mx.col); return [g, o]; }; });
fam('denoise_isolated', () => { const [a, noise] = colors(2); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(1, 3); k++) { const h = ri(3, 4), w = ri(3, 4), p = place(g, h, w, 2); if (!p) continue; rect(g, p[0], p[1], h, w, a); rect(o, p[0], p[1], h, w, a); }
  spots(g, ri(3, 6), 3).forEach(([r, c]) => { if (g.every((row, rr) => row.every((v, cc) => !v || Math.max(Math.abs(rr - r), Math.abs(cc - c)) > 1))) g[r][c] = noise; });
  return [g, o]; }; });
fam('gravity_cells', () => { const d = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]); const cs = colors(2); return () => {
  const g = G(ri(8, 12), ri(8, 12)); for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) g[r][c] = R() < 0.2 ? pick(cs) : 0;
  const o = G(g.length, g[0].length); const vertical = d[0] !== 0, n = vertical ? g[0].length : g.length, len = vertical ? g.length : g[0].length;
  for (let i = 0; i < n; i++) { const line = []; for (let k = 0; k < len; k++) line.push(vertical ? g[k][i] : g[i][k]); const mv = line.filter(v => v); const pad = len - mv.length;
    const res = (d[0] > 0 || d[1] > 0) ? new Array(pad).fill(0).concat(mv) : mv.concat(new Array(pad).fill(0)); for (let k = 0; k < len; k++) { if (vertical) o[k][i] = res[k]; else o[i][k] = res[k]; } }
  return [g, o]; }; });
fam('gravity_objects', () => { const cs = colors(2); return () => {
  const g = G(ri(10, 14), ri(8, 12)), o = G(g.length, g[0].length); const floor = g.length - 1;
  for (let c = 0; c < g[0].length; c++) { g[floor][c] = cs[1]; o[floor][c] = cs[1]; }
  const blocks = []; for (let k = 0; k < ri(2, 3); k++) { const w = ri(1, 3), h = ri(1, 2), p = place(g, h, w, 1); if (!p || p[0] + h >= floor - 1) continue; rect(g, p[0], p[1], h, w, cs[0]); blocks.push({ h, w, c: p[1] }); }
  blocks.sort((x, y) => 0);
  const order = []; for (let r = g.length - 2; r >= 0; r--) for (let c = 0; c < g[0].length; c++) if (g[r][c] === cs[0]) order.push([r, c]);
  for (const [r, c] of order) { let rr = r; while (rr + 1 < floor && o[rr + 1][c] === 0) rr++; o[rr][c] = cs[0]; }
  return [g, o]; }; });
fam('shift_all', () => { const [dr, dc] = [pick([-2, -1, 0, 1, 2]), pick([-2, -1, 1, 2])]; const cs = colors(2); return () => {
  const g = G(ri(9, 13), ri(9, 13)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(1, 3); k++) { const bl = blob(ri(2, 5), 3, 3), p = place(g, 3, 3, 1); if (!p) continue; if (p[0] + dr < 0 || p[1] + dc < 0 || p[0] + 3 + dr > g.length || p[1] + 3 + dc > g[0].length) continue; const col = pick(cs); putBlob(g, bl, p[0], p[1], col); putBlob(o, bl, p[0] + dr, p[1] + dc, col); }
  return [g, o]; }; });
fam('flip_objects_h', () => { const cs = colors(2); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(1, 3); k++) { const bl = blob(ri(3, 6), 3, 3), p = place(g, 3, 3, 1); if (!p) continue; const c0 = Math.min(...bl.map(x => x[1])), c1 = Math.max(...bl.map(x => x[1])); const col = pick(cs);
    putBlob(g, bl, p[0], p[1], col); putBlob(o, bl.map(([r, c]) => [r, c0 + c1 - c]), p[0], p[1], col); }
  return [g, o]; }; });
fam('symmetrize_h', () => { const cs = colors(2); return () => {
  const half = ri(4, 6), h = ri(6, 9), o = G(h, half * 2), g = G(h, half * 2);
  for (let r = 0; r < h; r++) for (let c = 0; c < half; c++) { const v = R() < 0.4 ? pick(cs) : 0; o[r][c] = v; o[r][2 * half - 1 - c] = v; g[r][c] = v; }
  return [g, o]; }; });
fam('outline_hollow', () => { const [a] = colors(1); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(1, 3); k++) { const h = ri(3, 5), w = ri(3, 5), p = place(g, h, w); if (!p) continue; rect(g, p[0], p[1], h, w, a); rect(o, p[0], p[1], h, w, a, true); }
  return [g, o]; }; });
fam('sort_bars', () => { const col = colors(1)[0]; return () => {
  const w = ri(5, 8), h = ri(5, 8), g = G(h, w), o = G(h, w); const hs = Array.from({ length: w }, () => ri(0, h));
  hs.forEach((x, c) => { for (let r = 0; r < x; r++) g[h - 1 - r][c] = col; });
  hs.slice().sort((a, b) => a - b).forEach((x, c) => { for (let r = 0; r < x; r++) o[h - 1 - r][c] = col; }); return [g, o]; }; });

fam('crop_largest_object', () => { const cs = colors(3); return () => {
  const g = G(ri(10, 14), ri(10, 14)); const sizes = shuffle([2, 3, 4, 5, 6, 7]).slice(0, ri(2, 4)); let best = null;
  sizes.forEach((n, i) => { const bl = blob(n, 3, 3), p = place(g, 3, 3); if (!p) return; const col = cs[i % 3]; putBlob(g, bl, p[0], p[1], col); if (!best || n > best.n) best = { n, bl, col }; });
  const r0 = Math.min(...best.bl.map(x => x[0])), c0 = Math.min(...best.bl.map(x => x[1]));
  const h = Math.max(...best.bl.map(x => x[0])) - r0 + 1, w = Math.max(...best.bl.map(x => x[1])) - c0 + 1, o = G(h, w); putBlob(o, best.bl.map(([r, c]) => [r - r0, c - c0]), 0, 0, best.col); return [g, o]; }; });
fam('crop_unique_color', () => { const cs = colors(3); return () => {
  const g = G(ri(10, 14), ri(10, 14)); const uniq = cs[0]; let target = null;
  for (let k = 0; k < 4; k++) { const bl = blob(ri(3, 6), 3, 3), p = place(g, 3, 3); if (!p) continue; const col = k === 0 ? uniq : cs[1 + (k % 2)]; putBlob(g, bl, p[0], p[1], col); if (k === 0) target = { bl }; }
  if (!target) return [g, G(1, 1)]; const r0 = Math.min(...target.bl.map(x => x[0])), c0 = Math.min(...target.bl.map(x => x[1]));
  const h = Math.max(...target.bl.map(x => x[0])) - r0 + 1, w = Math.max(...target.bl.map(x => x[1])) - c0 + 1, o = G(h, w); putBlob(o, target.bl.map(([r, c]) => [r - r0, c - c0]), 0, 0, uniq); return [g, o]; }; });
fam('count_objects_bar', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(10, 14), ri(10, 14)); let n = 0;
  for (let k = 0; k < ri(1, 5); k++) { const p = place(g, 2, 2, 1); if (!p) continue; rect(g, p[0], p[1], 2, 2, a); n++; }
  return [g, [new Array(n).fill(a)]]; }; });
fam('majority_color_1x1', () => { const cs = colors(3); return () => {
  const g = G(ri(5, 8), ri(5, 8)); const cnt = {}; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) { const v = pick([cs[0], cs[0], cs[1], cs[2]]); g[r][c] = v; cnt[v] = (cnt[v] || 0) + 1; }
  const keys = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]); if (keys.length > 1 && cnt[keys[0]] === cnt[keys[1]]) g[0][0] = cs[0], cnt[cs[0]]++;
  const best = Object.keys(cnt).map(Number).sort((x, y) => cnt[y] - cnt[x])[0]; return [g, [[best]]]; }; });
fam('upscale_k', () => { const k = ri(2, 3); return () => {
  const g = G(ri(3, 4), ri(3, 4)); for (const r of g) for (let c = 0; c < r.length; c++) r[c] = pick([0, 1, 2, 3]);
  const o = G(g.length * k, g[0].length * k); for (let r = 0; r < o.length; r++) for (let c = 0; c < o[0].length; c++) o[r][c] = g[Math.floor(r / k)][Math.floor(c / k)]; return [g, o]; }; });
fam('kaleidoscope_2x2', () => { return () => {
  const g = G(ri(2, 4), ri(2, 4)); for (const r of g) for (let c = 0; c < r.length; c++) r[c] = pick([0, 1, 2, 3]);
  const fh = x => x.map(r => r.slice().reverse()), fv = x => x.slice().reverse(); const top = g.map((r, i) => r.concat(fh(g)[i])); const bot = fv(g).map((r, i) => r.concat(fh(fv(g))[i]));
  return [g, top.concat(bot)]; }; });
fam('panel_or', () => { const [a, b, o1] = colors(3); return () => {
  const h = ri(4, 6), w = ri(4, 6), L = G(h, w), Rr = G(h, w), sep = G(h, 1, 5); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { L[r][c] = R() < 0.4 ? a : 0; Rr[r][c] = R() < 0.4 ? b : 0; }
  const g = L.map((r, i) => r.concat(sep[i], Rr[i])); const out = G(h, w); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r][c] = (L[r][c] || Rr[r][c]) ? o1 : 0; return [g, out]; }; });
fam('panel_xor', () => { const [a, b, o1] = colors(3); return () => {
  const h = ri(4, 6), w = ri(4, 6), L = G(h, w), Rr = G(h, w), sep = G(h, 1, 5); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { L[r][c] = R() < 0.5 ? a : 0; Rr[r][c] = R() < 0.5 ? b : 0; }
  const g = L.map((r, i) => r.concat(sep[i], Rr[i])); const out = G(h, w); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r][c] = (!!L[r][c] !== !!Rr[r][c]) ? o1 : 0; return [g, out]; }; });
fam('crop_inside_frame', () => { const [fr, a] = colors(2); return () => {
  const g = G(ri(12, 16), ri(12, 16)); const h = ri(5, 7), w = ri(5, 7), p = place(g, h, w, 1); if (!p) return [g, G(1, 1)];
  rect(g, p[0], p[1], h, w, fr, true); const o = G(h - 2, w - 2); for (let r = 0; r < h - 2; r++) for (let c = 0; c < w - 2; c++) if (R() < 0.35) { g[p[0] + 1 + r][p[1] + 1 + c] = a; o[r][c] = a; }
  spots(g, 3, 2).forEach(([r, c]) => { if (!(r >= p[0] - 1 && r <= p[0] + h && c >= p[1] - 1 && c <= p[1] + w)) g[r][c] = pick([a, fr]); }); return [g, o]; }; });
fam('periodic_inpaint', () => { const mask = colors(1)[0]; return () => {
  const ph = ri(2, 3), pw = ri(2, 4), tile = G(ph, pw); for (const r of tile) for (let c = 0; c < pw; c++) r[c] = ri(1, 4); const h = ri(9, 13), w = ri(9, 13), full = G(h, w);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) full[r][c] = tile[r % ph][c % pw]; const g = copy(full);
  for (let k = 0; k < ri(1, 2); k++) rect(g, ri(0, h - 3), ri(0, w - 3), ri(2, 3), ri(2, 3), mask); return [g, full]; }; });
fam('symmetric_inpaint', () => { const mask = 0; return () => {
  const half = ri(4, 6), h = ri(8, 10), full = G(h, half * 2); for (let r = 0; r < h; r++) for (let c = 0; c < half; c++) { const v = ri(1, 5); full[r][c] = v; full[r][2 * half - 1 - c] = v; }
  const g = copy(full); const mw = ri(2, 3); rect(g, ri(0, h - 3), ri(0, half - mw), ri(2, 3), mw, mask); return [g, full]; }; });
fam('template_stamp_marker', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(12, 16), ri(12, 16)), o = G(g.length, g[0].length); const bl = blob(ri(3, 5), 3, 3); const p = place(g, 3, 3, 2); if (!p) return [g, o];
  putBlob(g, bl, p[0], p[1], a); putBlob(o, bl, p[0], p[1], a); const [cr, cc] = bl[0]; g[p[0] + cr][p[1] + cc] = b; o[p[0] + cr][p[1] + cc] = b;
  spots(g, ri(1, 2), 5, [[p[0], p[1]]]).forEach(([r, c]) => { if (Math.abs(r - p[0]) < 4 && Math.abs(c - p[1]) < 4) return; g[r][c] = b; bl.forEach(([br, bc]) => { const rr = r + br - cr, c2 = c + bc - cc; if (inb(o, rr, c2)) o[rr][c2] = (br === cr && bc === cc) ? b : a; }); });
  return [g, o]; }; });
fam('reflect_across_line', () => { const cs = colors(2); return () => {
  const h = ri(9, 13), w = ri(7, 10), g = G(h, w), o = G(h, w); const L = ri(4, h - 5); for (let c = 0; c < w; c++) { g[L][c] = 5; o[L][c] = 5; }
  const bl = blob(ri(3, 5), 3, 3); const r0 = ri(0, L - 3), c0 = ri(0, w - 3); const col = pick(cs);
  bl.forEach(([r, c]) => { g[r0 + r][c0 + c] = col; o[r0 + r][c0 + c] = col; const rr = 2 * L - (r0 + r); if (rr < h) o[rr][c0 + c] = col; }); return [g, o]; }; });
fam('count_colors_hist', () => { const cs = colors(3); return () => {
  const g = G(ri(6, 9), ri(6, 9)); const cnt = {}; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) { const v = pick([0, 0, 0, cs[0], cs[0], cs[1], cs[2]]); g[r][c] = v; if (v) cnt[v] = (cnt[v] || 0) + 1; }
  const ks = Object.keys(cnt).map(Number).sort((x, y) => cnt[y] - cnt[x]); const vals = ks.map(k => cnt[k]);
  if (new Set(vals).size !== vals.length) return null; return [g, ks.map(k => [k])]; }; });
fam('fill_between_diag', () => { const col = colors(1)[0]; return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length); const L = ri(3, 6), r0 = ri(0, g.length - L - 1), c0 = ri(0, g[0].length - L - 1), d = R() < 0.5 ? 1 : -1;
  const c1 = d === 1 ? c0 : c0 + L; for (let i = 0; i <= L; i++) o[r0 + i][c1 + d * i] = col; g[r0][c1] = col; g[r0 + L][c1 + d * L] = col; return [g, o]; }; });
fam('draw_border', () => { const col = colors(1)[0]; return () => {
  const g = G(ri(5, 9), ri(5, 9)); for (const r of g) for (let c = 0; c < r.length; c++) r[c] = R() < 0.25 ? pick([1, 2, 3].filter(x => x !== col)) : 0;
  const o = copy(g); for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (r === 0 || c === 0 || r === g.length - 1 || c === g[0].length - 1) o[r][c] = col; return [g, o]; }; });
fam('concentric_rings', () => { const [a, b] = colors(2); return () => {
  const n = ri(1, 3) * 2 + 1, g = G(n, n), o = G(n, n); const m = (n - 1) / 2; g[m][m] = a; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) o[r][c] = Math.max(Math.abs(r - m), Math.abs(c - m)) % 2 === 0 ? a : b; return [g, o]; }; });


fam('extend_to_wall', () => { const [a, wall] = colors(2); const horiz = R() < 0.5; return () => {
  const h = ri(10, 14), w = ri(10, 14), g = G(h, w), o = G(h, w);
  if (horiz) { for (let r = 0; r < h; r++) { g[r][w - 1] = wall; o[r][w - 1] = wall; }
    const rs = shuffle(Array.from({ length: h }, (_, i) => i).filter(i => i % 2 === 0)).slice(0, ri(2, 3));
    rs.forEach(r => { const c = ri(0, w - 5); g[r][c] = a; g[r][c + 1] = a; for (let k = c; k < w - 1; k++) o[r][k] = a; }); }
  else { for (let c = 0; c < w; c++) { g[h - 1][c] = wall; o[h - 1][c] = wall; }
    const cs2 = shuffle(Array.from({ length: w }, (_, i) => i).filter(i => i % 2 === 0)).slice(0, ri(2, 3));
    cs2.forEach(c => { const r = ri(0, h - 5); g[r][c] = a; g[r + 1][c] = a; for (let k = r; k < h - 1; k++) o[k][c] = a; }); }
  return [g, o]; }; });
fam('connect_L_path', () => { const [a, b, pc] = colors(3); return () => {
  const h = ri(9, 13), w = ri(9, 13), g = G(h, w), o = G(h, w); const r1 = ri(0, h - 1), c1 = ri(0, w - 1); let r2, c2; do { r2 = ri(0, h - 1); c2 = ri(0, w - 1); } while (r2 === r1 || c2 === c1);
  g[r1][c1] = a; g[r2][c2] = b; o[r1][c1] = a; o[r2][c2] = b; const step = c1 < c2 ? 1 : -1; for (let c = c1 + step; c !== c2 + step; c += step) if (!(r1 === r2 && c === c2)) o[r1][c] = pc;
  const st = r1 < r2 ? 1 : -1; for (let r = r1; r !== r2; r += st) if (!(r === r1 && c2 === c1)) o[r][c2] = pc; o[r2][c2] = b; o[r1][c1] = a; return [g, o]; }; });
fam('recolor_by_half', () => { const [a, b, c] = colors(3); const vertical = R() < 0.5; return () => {
  const h = ri(8, 12) * 1, w = ri(8, 12), g = G(h, w), o = G(h, w); const hh = h - (h % 2), ww = w - (w % 2);
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) if (R() < 0.3) { g[r][q] = a; o[r][q] = vertical ? (q < w / 2 ? b : c) : (r < h / 2 ? b : c); }
  return [g, o]; }; });
fam('fill_bbox_gaps', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length);
  for (let k = 0; k < ri(1, 2); k++) { const h = ri(3, 5), w = ri(3, 5), p = place(g, h, w, 1); if (!p) continue; const bl = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const on = r === 0 || c === 0 || r === h - 1 || c === w - 1 || R() < 0.4; if (on) { g[p[0] + r][p[1] + c] = a; o[p[0] + r][p[1] + c] = a; } else o[p[0] + r][p[1] + c] = b; } }
  return [g, o]; }; });
fam('pattern_row_extend', () => { return () => {
  const w = ri(10, 14), h = ri(3, 5), per = ri(2, 4), tile = Array.from({ length: per }, () => ri(1, 4)); const g = G(h, w), o = G(h, w); const shown = per * 2 + ri(0, 1);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const v = tile[(c + r) % per]; o[r][c] = v; if (c < shown) g[r][c] = v; } return [g, o]; }; });
fam('mirror_beside', () => { const [a] = colors(1); const dirR = R() < 0.5; return () => {
  const bl = blob(ri(3, 6), 3, 3), h = 3, w = 3; const g = G(ri(8, 11), ri(11, 15)), o = G(g.length, g[0].length); const r0 = ri(0, g.length - 3), c0 = ri(0, g[0].length / 2 - 3);
  const cw = Math.max(...bl.map(x => x[1])) + 1; bl.forEach(([r, c]) => { g[r0 + r][c0 + c] = a; o[r0 + r][c0 + c] = a; const nc = c0 + cw + (cw - 1 - c); if (nc < g[0].length) o[r0 + r][nc] = a; }); return [g, o]; }; });
fam('overlay_panels', () => { const cs = colors(3); return () => {
  const h = ri(3, 5), w = ri(3, 5), panels = cs.map((c) => { const p = G(h, w); for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) if (R() < 0.4) p[r][q] = c; return p; });
  const sep = G(h, 1, 5); let g = panels[0]; for (let i = 1; i < 3; i++) g = g.map((row, r) => row.concat(sep[r], panels[i][r])); const o = G(h, w);
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) { o[r][q] = panels[0][r][q] || panels[1][r][q] || panels[2][r][q]; } return [g, o]; }; });
fam('compare_counts_color', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(6, 9), ri(6, 9)); let na = 0, nb = 0; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) { const v = R() < 0.15 ? a : R() < 0.15 ? b : 0; g[r][c] = v; if (v === a) na++; if (v === b) nb++; }
  if (na === nb) return null; return [g, [[na > nb ? a : b]]]; }; });
fam('nearest_color_recolor', () => { const [gray] = colors(1); const cs = colors(3, [0, gray]); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length); const marks = spots(g, 2, 6).map((p, i) => ({ p, c: cs[i] })); if (marks.length < 2) return null;
  marks.forEach(({ p, c }) => { g[p[0]][p[1]] = c; o[p[0]][p[1]] = c; });
  for (let k = 0; k < ri(3, 5); k++) { const q = spots(g, 1, 1, marks.map(m => m.p)); if (!q.length) continue; const [r, c] = q[0]; const d = marks.map(m => Math.abs(m.p[0] - r) + Math.abs(m.p[1] - c)); if (d[0] === d[1]) continue; g[r][c] = gray; o[r][c] = marks[d[0] < d[1] ? 0 : 1].c; }
  return [g, o]; }; });
fam('move_to_corner', () => { const cs = colors(1); const corner = pick([[0, 0], [1, 0], [0, 1], [1, 1]]); return () => {
  const h = ri(8, 12), w = ri(8, 12), g = G(h, w), o = G(h, w); const bl = blob(ri(3, 5), 3, 3), r0 = ri(1, h - 4), c0 = ri(1, w - 4); const mr = Math.min(...bl.map(x => x[0])), mc = Math.min(...bl.map(x => x[1])), bh = Math.max(...bl.map(x => x[0])) - mr + 1, bw = Math.max(...bl.map(x => x[1])) - mc + 1;
  putBlob(g, bl, r0, c0, cs[0]); putBlob(o, bl.map(([r, c]) => [r - mr, c - mc]), corner[0] ? h - bh : 0, corner[1] ? w - bw : 0, cs[0]); return [g, o]; }; });
fam('fill_row_if_marker', () => { const [m, f] = colors(2); return () => {
  const h = ri(8, 12), w = ri(8, 12), g = G(h, w), o = G(h, w); const rows = shuffle(Array.from({ length: h }, (_, i) => i)).slice(0, ri(1, 3));
  rows.forEach(r => { g[r][0] = m; for (let c = 0; c < w; c++) o[r][c] = f; o[r][0] = m; }); return [g, o]; }; });
fam('color_by_column_marker', () => { const cs = colors(3); return () => {
  const w = ri(6, 9), h = ri(6, 9), g = G(h, w), o = G(h, w); const marks = []; for (let c = 0; c < w; c += 1) if (R() < 0.35) { const col = pick(cs); g[0][c] = col; for (let r = 0; r < h; r++) o[r][c] = col; } 
  for (let c = 0; c < w; c++) for (let r = 1; r < h; r++) if (o[r][c] && R() < 0.0) g[r][c] = 0; return [g, o]; }; });
fam('draw_box_around_pair', () => { const [a, b] = colors(2); return () => {
  const g = G(ri(10, 14), ri(10, 14)), o = G(g.length, g[0].length); const r1 = ri(0, g.length - 5), c1 = ri(0, g[0].length - 5), r2 = ri(r1 + 3, g.length - 1), c2 = ri(c1 + 3, g[0].length - 1);
  g[r1][c1] = a; g[r2][c2] = a; rect(o, r1, c1, r2 - r1 + 1, c2 - c1 + 1, b, true); o[r1][c1] = a; o[r2][c2] = a; return [g, o]; }; });
fam('quadrant_color_count', () => { const cs = colors(4); return () => {
  const n = ri(3, 4), g = G(n * 2, n * 2), o = G(2, 2); for (let q = 0; q < 4; q++) { const r0 = (q >> 1) * n, c0 = (q & 1) * n; const cnt = {}; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const v = R() < 0.6 ? cs[q] : cs[(q + 1) % 4]; g[r0 + r][c0 + c] = v; cnt[v] = (cnt[v] || 0) + 1; }
    const ks = Object.keys(cnt).map(Number).sort((x, y) => cnt[y] - cnt[x]); if (ks.length > 1 && cnt[ks[0]] === cnt[ks[1]]) return null; o[q >> 1][q & 1] = ks[0]; } return [g, o]; }; });
fam('tile_3x3', () => { return () => { const g = G(ri(2, 3), ri(2, 3)); for (const r of g) for (let c = 0; c < r.length; c++) r[c] = pick([0, 1, 2]); const o = G(g.length * 3, g[0].length * 3); for (let r = 0; r < o.length; r++) for (let c = 0; c < o[0].length; c++) o[r][c] = g[r % g.length][c % g[0].length]; return [g, o]; }; });
fam('invert_binary', () => { const [a] = colors(1); const [b] = colors(1, [0, a]); return () => { const g = G(ri(5, 9), ri(5, 9)); for (const r of g) for (let c = 0; c < r.length; c++) r[c] = R() < 0.4 ? a : 0; return [g, g.map(r => r.map(v => v ? 0 : a))]; }; });
fam('largest_rect_fill', () => { const [a, f] = colors(2); return () => {
  const h = ri(8, 11), w = ri(8, 11), g = G(h, w); for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) g[r][c] = R() < 0.3 ? a : 0;
  const bh = ri(3, 4), bw = ri(3, 4), r0 = ri(0, h - bh), c0 = ri(0, w - bw); for (let r = 0; r < bh; r++) for (let c = 0; c < bw; c++) g[r0 + r][c0 + c] = 0;
  /* find unique largest empty rectangle by brute force */ let best = 0, bestR = null, tie = false;
  for (let r1 = 0; r1 < h; r1++) for (let c1 = 0; c1 < w; c1++) for (let r2 = r1; r2 < h; r2++) for (let c2 = c1; c2 < w; c2++) { let ok = true; for (let r = r1; r <= r2 && ok; r++) for (let c = c1; c <= c2; c++) if (g[r][c]) { ok = false; break; } if (!ok) break; const ar = (r2 - r1 + 1) * (c2 - c1 + 1); if (ar > best) { best = ar; bestR = [r1, c1, r2, c2]; tie = false; } else if (ar === best) tie = true; }
  if (tie || best < 6) return null; const o = copy(g); for (let r = bestR[0]; r <= bestR[2]; r++) for (let c = bestR[1]; c <= bestR[3]; c++) o[r][c] = f; return [g, o]; }; });
fam('holes_count_color', () => { const cs = colors(3); return () => {
  const g = G(ri(6, 9), ri(10, 14)); let n = 0; const o = G(1, 1); const k = ri(1, 3);
  for (let i = 0; i < k; i++) { const p = place(g, 3, 3, 1); if (!p) continue; rect(g, p[0], p[1], 3, 3, 5, true); n++; }
  return [g, [[cs[Math.min(n, 3) - 1]]]]; }; });

/* ------------------------------------------------------------ runner */
function makeTask(f) {
  const sample = f(); const pairs = []; let guard = 0;
  while (pairs.length < 4 && guard++ < 40) { const smp = sample(); if (!smp) continue; const [i, o] = smp; if (!i.length || !o.length || !o[0] || !o[0].length) continue; if (i.some(r => r.length !== i[0].length) || o.some(r => r.length !== o[0].length)) continue; if (JSON.stringify(i) === JSON.stringify(o) && pairs.length < 3 && false) continue; pairs.push({ input: i, output: o }); }
  if (pairs.length < 4) return null;
  return { train: pairs.slice(0, 3), test: pairs.slice(3) };
}
const names = Object.keys(FAMILIES).filter(n => !ONLY.length || ONLY.includes(n));
let total = 0, solvedAll = 0; const rows = [];
try { if (E.activatePlanner && E.loadPlanner) E.activatePlanner(E.loadPlanner(require(path.join(path.dirname(path.resolve(arg('engine', path.join(__dirname, '..', 'c4-arc-engine.js')))), 'c4-arc-policy.js')))); } catch (e) { /* policy optional */ }
for (const name of names) {
  let ok = 0, n = 0, bad = [];
  for (let k = 0; k < N; k++) {
    R = rng(SEED * 1000 + k * 37 + name.length * 101 + name.charCodeAt(0));
    const t = makeTask(FAMILIES[name]); if (!t) continue; n++;
    let res; try { const o2 = { time_budget: BUDGET, k: 2 }; if (MODULE) { o2.modules = E.SOLVER_MODULES.filter(m => m.__name__ === MODULE); o2.reframe = false; } res = E.solveTask(t, o2); } catch (e) { bad.push('ERR'); continue; }
    const top1 = res.predictions[0] && res.predictions[0][0] && JSON.stringify(res.predictions[0][0]) === JSON.stringify(t.test[0].output);
    if (top1) ok++; else bad.push(k);
    if (SHOW !== '' && +SHOW === k) { const sh = g => g.map(r => r.join('').replace(/0/g, '.')); t.train.concat(t.test).forEach((p, pi) => { console.log('pair', pi); const a = sh(p.input), b = sh(p.output); for (let q = 0; q < Math.max(a.length, b.length); q++) console.log((a[q] || '').padEnd(24) + (b[q] || '')); }); const pr = res.predictions[0] && res.predictions[0][0]; console.log('chosen', JSON.stringify(res.chosen), 'fit', res.n_fit); console.log('predicted:'); if (pr) sh(pr).forEach(l => console.log(l)); }
  }
  total += n; solvedAll += ok; rows.push([name, ok, n]);
  console.log(name.padEnd(26), (ok + '/' + n).padEnd(6), ok === n ? '' : 'missed ' + bad.join(','));
}
console.log('TOTAL', solvedAll + '/' + total, (100 * solvedAll / Math.max(1, total)).toFixed(1) + '%');
