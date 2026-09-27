/* Why does the engine solve 65% of the development split and 29% of the
 * evaluation split? Aggregate diagnostics only: per-category solve rates
 * (categories computed from DEMONSTRATIONS), transfer ratios, which solver
 * families produce the solves, failure reasons. No individual evaluation task
 * is printed.
 *
 *   node tools/arc-gap.js ARC-AGI/data results/final [--out FILE]
 */
'use strict';
const fs = require('fs'), path = require('path');
const [dataDir, runRoot] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const outArg = process.argv.indexOf('--out');
function load(split) {
  return fs.readdirSync(path.join(dataDir, split)).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ id: f.slice(0, -5), ...JSON.parse(fs.readFileSync(path.join(dataDir, split, f))) }));
}
function records(dir, prefix) {
  const m = new Map();
  for (const f of fs.readdirSync(dir)) {
    const mm = /^(arc1[a-z]*_)([0-9a-f]+)\.json$/.exec(f);
    if (!mm || mm[1] !== prefix) continue;
    m.set(mm[2], JSON.parse(fs.readFileSync(path.join(dir, f))));
  }
  return m;
}
/* categories from demonstrations */
function comps(g) {
  const H = g.length, W = g[0].length, cnt = {}; g.flat().forEach(v => { cnt[v] = (cnt[v] || 0) + 1; });
  const bg = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  const seen = g.map(r => r.map(() => false)); let n = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (seen[r][c] || g[r][c] === bg) continue; n++;
    const st = [[r, c]]; seen[r][c] = true;
    while (st.length) { const [a, b] = st.pop(); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const x = a + dr, y = b + dc; if (x < 0 || y < 0 || x >= H || y >= W || seen[x][y] || g[x][y] !== g[a][b]) continue; seen[x][y] = true; st.push([x, y]); } }
  }
  return n;
}
function cats(t) {
  const tr = t.train, same = tr.every(p => p.input.length === p.output.length && p.input[0].length === p.output[0].length);
  const smaller = tr.every(p => p.output.length * p.output[0].length < p.input.length * p.input[0].length);
  const larger = tr.every(p => p.output.length * p.output[0].length > p.input.length * p.input[0].length);
  const size = Math.max(...tr.map(p => Math.max(p.input.length, p.input[0].length, p.output.length, p.output[0].length)));
  const objs = Math.max(...tr.map(p => comps(p.input)));
  const inCols = new Set(tr.flatMap(p => p.input.flat())), outCols = new Set(tr.flatMap(p => p.output.flat()));
  let changed = 0, cells = 0;
  if (same) tr.forEach(p => p.input.forEach((r, i) => r.forEach((v, j) => { cells++; if (v !== p.output[i][j]) changed++; })));
  return {
    shape: same ? 'same' : smaller ? 'smaller' : larger ? 'larger' : 'mixed',
    size: size <= 10 ? '<=10' : size <= 20 ? '11-20' : '>20',
    objects: objs <= 2 ? '0-2' : objs <= 6 ? '3-6' : objs <= 15 ? '7-15' : '>15',
    newColour: [...outCols].some(c => !inCols.has(c)) ? 'new colour' : 'no new colour',
    changed: !same ? 'n/a' : changed / cells < 0.05 ? '<5%' : changed / cells < 0.2 ? '5-20%' : '>=20%',
    demos: tr.length <= 2 ? '2' : tr.length === 3 ? '3' : '4+'
  };
}
const splits = { dev: { data: load('training'), prefix: 'arc1_', final: 'dev-final', without: 'dev-without-new-families' },
                 eval: { data: load('evaluation'), prefix: 'arc1eval_', final: 'eval-final', without: 'eval-final-without-new-families' } };
const report = { categories: {}, families: {}, reasons: {}, transfer: {} };
for (const [name, S] of Object.entries(splits)) {
  const fin = records(path.join(runRoot, S.final), S.prefix), wo = records(path.join(runRoot, S.without), S.prefix);
  S.fin = fin; S.wo = wo;
  for (const t of S.data) {
    const r = fin.get(t.id); if (!r) continue;
    const c = cats(t);
    for (const [k, v] of Object.entries(c)) {
      const key = k + ':' + v; report.categories[key] = report.categories[key] || { dev: [0, 0], eval: [0, 0] };
      report.categories[key][name][0] += r.solved_top1 ? 1 : 0; report.categories[key][name][1]++;
    }
    if (r.solved_top1) {
      const fam = String((r.winning_program && r.winning_program[0] && r.winning_program[0][0]) || 'none').split('@')[0];
      report.families[fam] = report.families[fam] || { dev: 0, eval: 0 }; report.families[fam][name]++;
    } else {
      const why = r.failure_reason === 'UNKNOWN' ? 'WRONG_PROGRAM_FITS' : r.failure_reason;
      report.reasons[why] = report.reasons[why] || { dev: 0, eval: 0 }; report.reasons[why][name]++;
    }
  }
  const n1 = [...fin.values()].filter(r => r.solved_top1).length, n0 = [...wo.values()].filter(r => r.solved_top1).length;
  report.transfer[name] = { with_new: n1, without_new: n0, gain: n1 - n0, failure_pool: S.data.length - n0, fixed_fraction: +((n1 - n0) / (S.data.length - n0)).toFixed(3) };
}
report.transfer.ratio_absolute = +(report.transfer.eval.gain / report.transfer.dev.gain).toFixed(2);
report.transfer.ratio_of_fixed_fraction = +(report.transfer.eval.fixed_fraction / report.transfer.dev.fixed_fraction).toFixed(2);
const pct = ([a, b]) => b ? (100 * a / b).toFixed(0) + '% of ' + b : '-';
console.log('category'.padEnd(26), 'dev'.padEnd(14), 'eval');
Object.keys(report.categories).sort().forEach(k => console.log(k.padEnd(26), pct(report.categories[k].dev).padEnd(14), pct(report.categories[k].eval)));
console.log('\nwinning family (top-1 solves)  dev  eval');
Object.entries(report.families).sort((a, b) => b[1].dev - a[1].dev).forEach(([k, v]) => console.log(k.padEnd(30), String(v.dev).padEnd(4), v.eval));
console.log('\nfailure reason                 dev  eval');
Object.entries(report.reasons).sort((a, b) => b[1].eval - a[1].eval).forEach(([k, v]) => console.log(k.padEnd(30), String(v.dev).padEnd(4), v.eval));
console.log('\ntransfer', JSON.stringify(report.transfer));
if (outArg > 0) fs.writeFileSync(process.argv[outArg + 1], JSON.stringify(report, null, 1));
