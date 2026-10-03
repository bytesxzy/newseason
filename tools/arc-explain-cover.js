'use strict';
/* How much of the changed-cell set could the effect catalogue explain at all, ignoring selectors?
 * For each same-shape task and each parse, every object's INVERSE-consistent effect instances are applied at once; the
 * fraction of changed cells they account for is the ceiling for any selector-based rewrite under that parse.
 *   node tools/arc-explain-cover.js <task-json-dir> [--solved <bench-dir>]
 */
const fs = require('node:fs'), path = require('node:path');
const E = require('../c4-arc-engine.js'); const P = E.PSYN, G = E.G, FX = P.FX;
const args = process.argv.slice(2); const dir = args[0];
const solvedDir = (i => i < 0 ? null : args[i + 1])(args.indexOf('--solved'));
const rows = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), id = f.replace('.json', '');
  const pairs = t.train.map(p => [G.asGrid(p.input), G.asGrid(p.output)]);
  if (!pairs.every(p => p[0].length === p[1].length && p[0][0].length === p[1][0].length)) continue;
  let solved = null; if (solvedDir) { const q = path.join(solvedDir, 'arc1_' + id + '.json'); if (fs.existsSync(q)) solved = JSON.parse(fs.readFileSync(q, 'utf8')).solved_top1; }
  let bestCover = 0, bestParse = null, totalDelta = 0;
  for (const parse of ['c4', 'c8', 'm4', 'm8', 'col']) {
    let cov = 0, tot = 0, ok = true;
    for (const [I, O] of pairs) {
      const sc = P.parse(I, parse, 'mode'); if (sc.tooMany) { ok = false; break; }
      const covered = new Uint8Array(sc.H * sc.W), delta = new Uint8Array(sc.H * sc.W);
      for (let r = 0; r < sc.H; r++) for (let c = 0; c < sc.W; c++) if (I[r][c] !== O[r][c]) { delta[r * sc.W + c] = 1; tot++; }
      for (const o of sc.objs) for (const k of Object.keys(FX)) {
        let inf; try { inf = FX[k].infer(o, sc, I, O); } catch (e) { continue; }
        for (const v of inf) {
          const th = FX[k].param === 'color' ? v : v;
          const w = FX[k].writes(o, th, sc); if (!w || !P.consistent(w, sc, I, O)) continue;
          for (let i = 0; i < w.pnt.length; i += 2) if (O[(w.pnt[i] / sc.W) | 0][w.pnt[i] % sc.W] === w.pnt[i + 1] && delta[w.pnt[i]]) covered[w.pnt[i]] = 1;
          for (const cc of w.clr) if (delta[cc] && O[(cc / sc.W) | 0][cc % sc.W] === sc.bg) covered[cc] = 1;
        }
      }
      for (let i = 0; i < covered.length; i++) cov += covered[i];
    }
    if (ok && tot && cov / tot > bestCover) { bestCover = cov / tot; bestParse = parse; }
    totalDelta = tot;
  }
  rows.push({ id, solved, cover: +bestCover.toFixed(3), parse: bestParse, delta: totalDelta });
}
const bins = [0, 0.25, 0.5, 0.75, 0.9, 0.999, 1.01];
const hist = {};
for (const r of rows) { const b = bins.findIndex((x, i) => r.cover >= x && r.cover < bins[i + 1]); const k = bins[b] + '-' + bins[b + 1]; hist[k] = hist[k] || { n: 0, solved: 0 }; hist[k].n++; if (r.solved) hist[k].solved++; }
console.log('same-shape tasks', rows.length);
for (const [k, v] of Object.entries(hist)) console.log(('cover ' + k).padEnd(18), String(v.n).padStart(4), 'baseline-solved', String(v.solved).padStart(4));
fs.writeFileSync(path.join(__dirname, '..', 'measurements', '.tmp-cover.json'), JSON.stringify(rows));
