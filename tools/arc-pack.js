'use strict';
/* Build a benchmark root from a directory of official ARC task JSON files, so
 * c4-arc/bench.js can score the engine on data it was never developed against.
 *
 *   node tools/arc-pack.js <task-json-dir> <out-root> [--every N --offset K]
 *
 * Writes <out-root>/c4-arc-tasks.js in the bench format and links the engine
 * and policy next to it. Then:
 *
 *   node c4-arc/bench.js --root <out-root> --budget 3 --jobs 3 --out results/x
 *
 * --every/--offset keep every Nth task starting at K, which is how a public
 * evaluation set is split into a half that may be studied and a sealed half
 * that is only ever scored in aggregate.
 *
 * Tasks are ids "arc1_<file stem>" so the bench's default prefix selects them.
 */
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const dir = args[0], out = args[1];
if (!dir || !out) { console.error('usage: node tools/arc-pack.js <task-json-dir> <out-root> [--every N --offset K]'); process.exit(1); }
const every = +arg('every', 1), offset = +arg('offset', 0);
const g = m => m.map(r => r.join('')).join('|');
const pair = p => g(p.input) + '>' + (p.output ? g(p.output) : '');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().filter((_, i) => i % every === offset);
const rows = files.map(f => {
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return ['arc1_' + f.replace(/\.json$/, ''), t.train.map(pair).join(';'), t.test.map(pair).join(';')];
});
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'c4-arc-tasks.js'),
  '(function(root){root.C4ARCTasks=' + JSON.stringify(rows) + ';if(typeof module!=="undefined")module.exports=root.C4ARCTasks;})(globalThis);\n');
const repo = path.resolve(__dirname, '..');
for (const f of ['c4-arc-engine.js', 'c4-arc-policy.js']) {
  const link = path.join(out, f);
  try { fs.unlinkSync(link); } catch (e) { /* not there yet */ }
  fs.symlinkSync(path.join(repo, f), link);
}
console.log(rows.length + ' tasks packed into ' + out);
