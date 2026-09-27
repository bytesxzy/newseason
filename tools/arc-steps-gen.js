/* Frozen synthetic evaluation sets for the transformation policy.
 *
 *   node tools/arc-steps-gen.js [--n 200] [--seed 31] [--out c4-arc-steps-ood.js]
 *
 * Five splits, each task = 3 demonstrations + 1 query of one rule, inputs
 * from the TEST side of every generator (the 'dev' generator draws the last
 * quarter of ARC-AGI-1 TRAINING input groups, which the training stream never
 * uses):
 *   iid         programs the training stream can produce (fresh draws)
 *   prog        held-out fingerprints (the exact step sequence never trained)
 *   comp_type   >= 1 held-out ordered type pair (A -> B never adjacent in
 *               training, A and B each trained), no held-out group pair
 *   comp_group  >= 1 held-out ordered GROUP pair (e.g. geom -> color never)
 *   depth4      4 steps (training has at most 3), no held-out adjacency
 * Written in the packed corpus format of c4-arc-tasks.js ("r|r>r|r;..."),
 * plus the rule's structure for per-structure analysis. Frozen once written.
 */
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./arc-steps-lib.js');
const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const n = +arg('n', 200), seed = +arg('seed', 31), out = arg('out', path.join(__dirname, '..', 'c4-arc-steps-ood.js'));
const pack = g => g.map(r => r.join('')).join('|');
const SPLITS = {
  iid: c => !c.typeHeld && !c.groupHeld && !c.progHeld,
  prog: c => c.progHeld && !c.typeHeld && !c.groupHeld,
  comp_type: c => c.typeHeld && !c.groupHeld,
  comp_group: c => c.groupHeld,
  depth4: c => !c.typeHeld && !c.groupHeld
};
const DEPTH = { iid: [1, 3], prog: [1, 3], comp_type: [2, 3], comp_group: [2, 3], depth4: [4, 4] };
const rows = [];
for (const [split, ok] of Object.entries(SPLITS)) {
  const R = L.rng(seed * 100 + Object.keys(SPLITS).indexOf(split)), seen = new Set();
  let got = 0, tries = 0;
  while (got < n && tries < n * 5000) {
    tries++;
    const rule = L.sampleRule(R, { minDepth: DEPTH[split][0], maxDepth: DEPTH[split][1] });
    if (!rule) continue;
    const c = L.category(rule);
    if (!ok(c)) continue;
    const t = L.makeTask(rule, R, 'test', 3, 1);
    if (!t) continue;
    const key = t.runs.map(r => pack(r.x)).join(';');
    if (seen.has(key)) continue; seen.add(key);
    const id = `syn_${split}_${String(got).padStart(3, '0')}`;
    rows.push([id, t.runs.map(r => pack(r.x) + '>' + pack(r.y)).join(';'), t.queries.map(r => pack(r.x) + '>' + pack(r.y)).join(';'),
      { split, fp: L.fingerprint(rule), steps: rule.steps.map(s => L.STEPS.NAMES[s[0]] + (s[1] === null ? '' : '#' + s[1])), fin: rule.fin ? rule.fin.kind : null, gen: rule.gen, depth: c.depth }]);
    got++;
  }
  console.log(split, got, 'tasks', tries, 'draws');
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, '/* FROZEN synthetic OOD sets for the transformation policy (tools/arc-steps-gen.js --seed ' + seed + '). */\n' +
  '(function (root) {\n"use strict";\nroot.C4StepsOOD = [\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n];\nif (typeof module !== "undefined") module.exports = root.C4StepsOOD;\n})(typeof globalThis !== "undefined" ? globalThis : this);\n');
console.log('wrote', out, rows.length, 'tasks');
