'use strict';
/* Run the partial-program synthesiser (PSYN) alone on a directory of ARC task JSON files and score it afterwards.
 * Inference reads train pairs and test INPUTS only; test outputs are compared only after the program is fixed.
 *
 *   node tools/arc-psyn.js <task-json-dir> [--budget 3] [--only id1,id2] [--out file.json] [--verbose]
 */
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const E = require(arg('engine', path.join(__dirname, '..', 'c4-arc-engine.js')));
const frame = arg('frame', 'all'); const dir = args[0], budget = +arg('budget', 3), only = (arg('only', '') || '').split(',').filter(Boolean), outFile = arg('out', null), verbose = args.includes('--verbose');
const shard = (arg('shard', '0/1')).split('/').map(Number);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().filter((f, i) => i % shard[1] === shard[0]).filter(f => !only.length || only.includes(f.replace(/\.json$/, '')));
const G = E.G, P = E.PSYN;
const rows = []; let solved = 0, fit = 0, sameShape = 0;
const totals = {};
for (const f of files) {
  const id = f.replace(/\.json$/, '');
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const train = t.train.map(p => [p.input, p.output]), tests = t.test.map(p => p.input);
  const same = train.every(p => p[0].length === p[1].length && p[0][0].length === p[1][0].length);
  if (same) sameShape++;
  if (frame === 'same' && !same) { rows.push({ id, skipped: 'dims' }); continue; }
  if (frame === 'diff' && same) { rows.push({ id, skipped: 'same' }); continue; }
  const t0 = Date.now(), ctx = { timed_out: () => Date.now() - t0 > budget * 1000 };
  const acct = new P.Accounts(); let res;
  try { res = P.synthesize(train.map(p => [G.asGrid(p[0]), G.asGrid(p[1])]), tests.map(G.asGrid), ctx, acct, null); }
  catch (e) { rows.push({ id, error: String(e.stack).slice(0, 300) }); continue; }
  const progs = res.programs.slice().sort((a, b) => a.rank - b.rank);
  let ok = false, okAny = false;
  const preds = progs.map(p => t.test.map(tp => p.run(G.asGrid(tp.input))));
  progs.forEach((p, i) => { const good = preds[i].every((g, j) => g && G.gEq(g, G.asGrid(t.test[j].output))); if (good) okAny = true; if (i === 0 && good) ok = true; });
  if (progs.length) fit++;
  if (ok) solved++;
  for (const k of Object.keys(acct.toJSON())) totals[k] = (totals[k] || 0) + acct.toJSON()[k];
  const row = { id, fits: progs.length, top1: ok, any: okAny, ms: Date.now() - t0, prog: progs.length ? progs[0].str : null, near: res.near.length, loo: progs.length ? progs[0].loo : null };
  rows.push(row);
  if (verbose) console.log(id.padEnd(10), String(row.fits).padStart(3), ok ? 'SOLVED' : okAny ? 'any' : '', row.ms + 'ms', row.prog ? row.prog.slice(0, 150) : '');
}
console.log(JSON.stringify({ tasks: files.length, sameShape, fit, solvedTop1: solved, anyCorrect: rows.filter(r => r.any).length, totalMs: rows.reduce((a, r) => a + (r.ms || 0), 0), accounts: totals }, null, 1));
if (outFile) fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
