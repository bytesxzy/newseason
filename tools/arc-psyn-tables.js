'use strict';
/* Markdown tables for PSYN-REPORT.md, generated from result directories so every number in the report is reproducible.
 *
 *   node tools/arc-psyn-tables.js --ablation <dir-written-by-ablate_all.sh> [--datasets e1A_json,t2new_odd,t2new_even,a1train_json]
 *   node tools/arc-psyn-tables.js --accounts <dir> --label full
 *   node tools/arc-psyn-tables.js --compare <base-results> <new-results> [--subset <task-json-dir>]
 */
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };

function parseStandalone(file) {
  if (!fs.existsSync(file)) return null;
  const txt = fs.readFileSync(file, 'utf8'), i = txt.indexOf('{\n "tasks"');
  if (i < 0) return null;
  try { return JSON.parse(txt.slice(i, txt.lastIndexOf('}') + 1)); } catch (e) { return null; }
}

if (arg('ablation', null)) {
  const dir = arg('ablation'), ds = (arg('datasets', 'e1A_json,t2new_odd,t2new_even,a1train_json')).split(',');
  const labels = fs.readdirSync(dir).filter(f => f.endsWith('.txt')).map(f => f.split('.')[0]).filter((v, i, a) => a.indexOf(v) === i);
  const order = ['full', 'no_multiparse', 'no_roles', 'no_relations', 'no_stages', 'no_extract', 'no_loo', 'no_partmap', 'no_between', 'no_stamp', 'no_inverse', 'no_value', 'no_fam', 'no_parseorder', 'no_macro', 'no_sched', 'on_kindprune', 'on_beam', 'on_prefix'];
  labels.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  console.log('| configuration | ' + ds.map(d => d.replace('_json', '') + ' fit/top-1/any (ms)').join(' | ') + ' |');
  console.log('|---|' + ds.map(() => '---').join('|') + '|');
  for (const l of labels) {
    const cells = ds.map(d => { const j = parseStandalone(path.join(dir, l + '.' + d + '.txt')); return j ? `${j.fit}/${j.solvedTop1}/${j.anyCorrect} (${j.totalMs})` : '-'; });
    console.log(`| ${l} | ${cells.join(' | ')} |`);
  }
}

if (arg('accounts', null)) {
  const dir = arg('accounts'), label = arg('label', 'full');
  for (const d of ['e1A_json', 't2new_odd', 't2new_even', 'a1train_json']) {
    const j = parseStandalone(path.join(dir, label + '.' + d + '.txt'));
    if (!j) continue;
    const a = j.accounts;
    console.log(`${d}: tasks ${j.tasks}  fits ${j.fit}  nodes ${a.nodes}  template proposals ${a.tmpl_raw} -> syntactically distinct ${a.tmpl_syntactic} (${(100 * (1 - a.tmpl_syntactic / a.tmpl_raw)).toFixed(1)}% syntactic duplicates) -> observationally distinct ${a.tmpl_classes} (${(100 * (1 - a.tmpl_classes / a.tmpl_syntactic)).toFixed(1)}% further semantic duplicates)`
      + `  complete programs ${a.prog_raw} -> classes ${a.prog_classes} (${a.prog_syntactic || 0} syntactic + ${a.prog_semantic || 0} semantic duplicates = ${(100 * (1 - a.prog_classes / a.prog_raw)).toFixed(1)}%)  naive params ${a.naive_params} vs inferred ${a.inferred_params}  object-effect pairs pruned by inversion ${a.pruned_inverse}`
      + `  kinds pruned by abstract execution ${a.pruned_abstract}  parses tried ${a.parses_tried} duplicate ${a.parses_duplicate || 0}  vs-members ${a.vs_member_estimate} -> classes ${a.vs_collapsed}  alternatives ${a.vs_alternatives || 0}`);
  }
}

if (arg('compare', null)) {
  const [oldDir, newDir] = [args[args.indexOf('--compare') + 1], args[args.indexOf('--compare') + 2]];
  const sub = arg('subset', null);
  const ids = sub ? new Set(fs.readdirSync(sub).filter(f => f.endsWith('.json')).map(f => 'arc1_' + f.replace('.json', ''))) : null;
  const load = d => { const o = {}; for (const f of fs.readdirSync(d)) if (/^arc.*\.json$/.test(f) && !/prediction/.test(f)) { const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); if (!ids || ids.has(j.task_id)) o[j.task_id] = j; } return o; };
  const A = load(oldDir), B = load(newDir), keys = Object.keys(A).filter(k => B[k]);
  const cnt = (O, f) => keys.filter(k => f(O[k])).length;
  const tab = f => { let ss = 0, sf = 0, fs_ = 0; for (const k of keys) { const a = f(A[k]), b = f(B[k]); if (a && b) ss++; else if (a) sf++; else if (b) fs_++; } return `${ss}/${sf}/${fs_}`; };
  const rt = O => { const v = keys.map(k => O[k].runtime).sort((x, y) => x - y); const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))]; return `${v.reduce((x, y) => x + y, 0).toFixed(0)}s p50 ${q(0.5).toFixed(2)} p90 ${q(0.9).toFixed(2)} p99 ${q(0.99).toFixed(2)}`; };
  console.log(`n=${keys.length}`);
  console.log(`top-1: ${cnt(A, r => r.solved_top1)} -> ${cnt(B, r => r.solved_top1)}   (kept/lost/gained ${tab(r => r.solved_top1)})`);
  console.log(`top-2: ${cnt(A, r => r.solved_top2)} -> ${cnt(B, r => r.solved_top2)}   (kept/lost/gained ${tab(r => r.solved_top2)})`);
  console.log(`oracle: ${cnt(A, r => r.oracle_retained)} -> ${cnt(B, r => r.oracle_retained)}   (kept/lost/gained ${tab(r => r.oracle_retained)})`);
  console.log(`runtime: ${rt(A)}  ->  ${rt(B)}`);
  console.log('lost top-1: ' + keys.filter(k => A[k].solved_top1 && !B[k].solved_top1).join(' '));
  console.log('gained top-1: ' + keys.filter(k => !A[k].solved_top1 && B[k].solved_top1).map(k => k + '(' + B[k].winning_family + ')').join(' '));
}
