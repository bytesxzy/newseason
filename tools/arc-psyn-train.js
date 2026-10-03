'use strict';
/* Offline training of the synthesiser's learned components from SEARCH TRACES.
 *
 *   node tools/arc-psyn-train.js --sets name=dir[:weight][,name=dir...] [--budget 3] [--shard i/n] --collect out.json
 *   node tools/arc-psyn-train.js --traces a.json,b.json --train --out c4-arc/src/68-psyn-policy.js [--eval holdout.json]
 *
 * Phase 1 (collect): run the synthesiser on every task, with the ground truth of the TEST pair used only to label the
 * outcome afterwards, and record per task: features, runtime, accounting, and for every exact-fitting program its structural
 * description, features and whether it is right on the test input (hindsight label).
 * Phase 2 (train): fit small logistic models on those records:
 *   parse proposer       P(parse is used by a correct program | task features)
 *   operator proposer    P(effect kind is used by a correct program | task features), with a floor that keeps >= 97% of used kinds
 *   solve scheduler      P(synthesiser's top-1 is correct | task features)
 *   value function       P(program is correct | program features), the ranking signal for exact fits
 *   atom-family prior    description-length shifts from how often each atom family occurs in correct vs. merely fitting programs
 *   macros               rule signatures that recur in correct programs of >= 3 different tasks (anti-unified: constants removed)
 * and write the weights as a generated source file. Training and evaluation task sets are given separately by the caller;
 * this tool never reads sealed data unless told to.
 */
const fs = require('node:fs');
const path = require('node:path');
const E = require('../c4-arc-engine.js');
const G = E.G, P = E.PSYN;
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };

/* ------------------------------------------------------------------ collection */
function collect() {
  const sets = arg('sets', '').split(',').filter(Boolean).map(s => { const [nm, rest] = s.split('='); const [dir, w] = rest.split(':'); return { nm, dir, w: +(w || 1) }; });
  const budget = +arg('budget', 3), shard = arg('shard', '0/1').split('/').map(Number), out = arg('collect');
  const rows = [];
  for (const set of sets) {
    const files = fs.readdirSync(set.dir).filter(f => f.endsWith('.json')).sort().filter((f, i) => i % shard[1] === shard[0]);
    for (const f of files) {
      const t = JSON.parse(fs.readFileSync(path.join(set.dir, f), 'utf8'));
      const train = t.train.map(p => [G.asGrid(p.input), G.asGrid(p.output)]), tests = t.test.map(p => G.asGrid(p.input));
      const t0 = Date.now(), ctx = { timed_out: () => Date.now() - t0 > budget * 1000, deadline: t0 + budget * 1000 };
      const acct = new P.Accounts();
      let res; try { res = P.synthesize(train, tests, ctx, acct, null); } catch (e) { continue; }
      const progs = res.programs.slice().sort((a, b) => a.rank - b.rank).map((pg, i) => {
        const preds = t.test.map(tp => pg.run(G.asGrid(tp.input)));
        const correct = preds.every((g, j) => g && G.gEq(g, G.asGrid(t.test[j].output)));
        const raw = pg.raw, isX = pg.kind === 'extract';
        const stages = isX ? [{ parse: raw.parse, rules: [{ kind: 'extract', atoms: raw.atoms }] }] : raw.stages;
        const pf = isX ? P.programFeatures({ stages: stages, bits: pg.bits }, { loo: null, nTrain: train.length, extract: true }) : P.programFeatures(raw, { loo: pg.loo, nTrain: train.length });
        return { rank: i, kind: pg.kind, bits: pg.bits, loo: pg.loo, correct, pf, parses: stages.map(s => s.parse), kinds: [].concat(...stages.map(s => s.rules.map(r => r.kind))),
                 sigs: [].concat(...stages.map(s => s.rules.map(r => isX ? 'extract//' + r.atoms.map(P.atomFamily).sort().join('+') : P.ruleSig(r)))), fams: [].concat(...stages.map(s => [].concat(...s.rules.map(r => r.atoms.map(P.atomFamily))))),
                 distinctPred: 0 };
      });
      rows.push({ set: set.nm, w: set.w, id: f.replace('.json', ''), feat: P.taskFeatures(train), ms: Date.now() - t0, acct: acct.toJSON(), progs, solved: !!(progs[0] && progs[0].correct), anyCorrect: progs.some(p => p.correct) });
    }
  }
  fs.writeFileSync(out, JSON.stringify(rows));
  console.log(JSON.stringify({ tasks: rows.length, fit: rows.filter(r => r.progs.length).length, top1: rows.filter(r => r.solved).length, any: rows.filter(r => r.anyCorrect).length }));
}

/* ------------------------------------------------------------------ logistic regression */
function logistic(X, y, w, opts) {
  opts = opts || {};
  const n = X.length, d = X[0].length, wt = new Array(d).fill(0); let b = 0;
  const lr = opts.lr || 0.3, l2 = opts.l2 === undefined ? 0.05 : opts.l2, epochs = opts.epochs || 600;
  const sw = w.reduce((a, c) => a + c, 0) || 1;
  /* balance classes so rare positives are not ignored */
  const pos = y.reduce((a, c, i) => a + (c ? w[i] : 0), 0), neg = sw - pos, cw = [neg > 0 && pos > 0 ? sw / (2 * neg) : 1, neg > 0 && pos > 0 ? sw / (2 * pos) : 1];
  for (let ep = 0; ep < epochs; ep++) {
    const g = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < d; j++) z += wt[j] * X[i][j];
      const p = 1 / (1 + Math.exp(-z)), e = (p - (y[i] ? 1 : 0)) * w[i] * cw[y[i] ? 1 : 0];
      for (let j = 0; j < d; j++) g[j] += e * X[i][j]; gb += e;
    }
    for (let j = 0; j < d; j++) wt[j] -= lr * (g[j] / sw + l2 * wt[j]);
    b -= lr * gb / sw;
  }
  return { w: wt.map(v => +v.toFixed(4)), b: +b.toFixed(4) };
}
function auc(scores, labels) {
  const pos = [], neg = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  let wins = 0; for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return +(wins / (pos.length * neg.length)).toFixed(3);
}
const sig = z => 1 / (1 + Math.exp(-z));
const dot = (m, x) => m.w.reduce((a, c, i) => a + c * (x[i] || 0), m.b);

/* ------------------------------------------------------------------ training */
function train() {
  const files = arg('traces', '').split(',').filter(Boolean);
  let rows = []; for (const f of files) rows = rows.concat(JSON.parse(fs.readFileSync(f, 'utf8')));
  const evalRows = arg('eval') ? arg('eval').split(',').flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8'))) : [];
  const FK = P.FEAT_KEYS, PK = P.PROG_KEYS, policy = { parseW: {}, kindW: {}, famPrior: {}, solveW: null, valueW: null, macros: {} }, report = {};
  const X = rows.map(r => P.featVec(r.feat)), W = rows.map(r => r.w || 1);
  /* solve scheduler */
  policy.solveW = logistic(X, rows.map(r => r.solved), W);
  report.solveAuc = { train: auc(X.map(x => dot(policy.solveW, x)), rows.map(r => r.solved)) };
  /* a skip floor that keeps >= 98% of the solved tasks: the lowest solve-probability among the top 98% of solved tasks */
  const sp = rows.map((r, i) => [sig(dot(policy.solveW, X[i])), r.solved]).filter(a => a[1]).map(a => a[0]).sort((a, b) => a - b);
  policy.solveFloor = sp.length ? +(sp[Math.floor(sp.length * 0.02)]).toFixed(4) : 0;
  /* parse proposer */
  for (const p of ['c4', 'c8', 'm4', 'm8', 'col', 'pnl']) {
    const y = rows.map(r => r.progs.some(g => g.correct && g.parses.indexOf(p) >= 0));
    if (y.filter(Boolean).length >= 3) policy.parseW[p] = logistic(X, y, W);
  }
  /* operator proposer, trained on tasks the synthesiser actually solved (what makes a kind appear in a RIGHT program) */
  const solvedRows = rows.filter(r => r.anyCorrect), XS = solvedRows.map(r => P.featVec(r.feat)), WS = solvedRows.map(r => r.w || 1);
  const kinds = {}; solvedRows.forEach(r => r.progs.filter(g => g.correct).forEach(g => g.kinds.forEach(k => { kinds[k] = (kinds[k] || 0) + 1; })));
  for (const k of Object.keys(kinds)) {
    const y = solvedRows.map(r => r.progs.some(g => g.correct && g.kinds.indexOf(k) >= 0));
    if (kinds[k] < 4 || y.every(Boolean)) continue;
    const m = logistic(XS, y, WS, { l2: 0.2 });
    const ps = solvedRows.map((r, i) => [sig(dot(m, XS[i])), y[i]]).filter(a => a[1]).map(a => a[0]).sort((a, b) => a - b);
    m.floor = ps.length ? +(ps[Math.floor(ps.length * 0.03)] * 0.9).toFixed(4) : 0;
    policy.kindW[k] = m;
  }
  /* value function on every exact-fitting program */
  const V = [], vy = [], vw = [];
  rows.forEach(r => r.progs.forEach(g => { V.push(PK.map(k => g.pf[k] || 0)); vy.push(g.correct); vw.push((r.w || 1) / Math.sqrt(r.progs.length)); }));
  if (V.length > 20) {
    policy.valueW = logistic(V, vy, vw, { l2: 0.15 });
    report.valueAuc = { train: auc(V.map(x => dot(policy.valueW, x)), vy), n: V.length, positives: vy.filter(Boolean).length };
  }
  /* atom-family prior: shift (bits) = -0.9 * log2( P(correct | family) / P(correct) ), shrunk and clipped */
  const famFit = {}, famOk = {}; let totFit = 0, totOk = 0;
  rows.forEach(r => r.progs.forEach(g => { const fs2 = new Set(g.fams); fs2.forEach(f => { famFit[f] = (famFit[f] || 0) + (r.w || 1); if (g.correct) famOk[f] = (famOk[f] || 0) + (r.w || 1); }); totFit += r.w || 1; if (g.correct) totOk += r.w || 1; }));
  const base = (totOk + 1) / (totFit + 3);
  for (const f of Object.keys(famFit)) {
    if (famFit[f] < 6) continue;
    const pf = ((famOk[f] || 0) + base * 4) / (famFit[f] + 4), shift = -0.9 * Math.log2(pf / base);
    policy.famPrior[f] = +Math.max(-1.5, Math.min(1.5, shift)).toFixed(2);
  }
  /* macros: anti-unified rule signatures (constants already abstracted to families) that recur across tasks */
  const sigTasks = {};
  rows.forEach(r => { const seen = new Set(); r.progs.filter(g => g.correct).forEach(g => g.sigs.forEach(s => { if (!seen.has(s)) { seen.add(s); (sigTasks[s] = sigTasks[s] || new Set()).add(r.set + ':' + r.id); } })); });
  for (const s of Object.keys(sigTasks)) if (sigTasks[s].size >= 3) policy.macros[s] = { count: sigTasks[s].size, bonus: +Math.min(2.0, 0.5 * Math.log2(sigTasks[s].size)).toFixed(2) };
  /* held-out evaluation of the learned models */
  if (evalRows.length) {
    const XE = evalRows.map(r => P.featVec(r.feat));
    report.solveAuc.heldout = auc(XE.map(x => dot(policy.solveW, x)), evalRows.map(r => r.solved));
    const VE = [], vye = [];
    evalRows.forEach(r => r.progs.forEach(g => { VE.push(PK.map(k => g.pf[k] || 0)); vye.push(g.correct); }));
    if (policy.valueW && VE.length) report.valueAuc.heldout = auc(VE.map(x => dot(policy.valueW, x)), vye);
    /* ranking quality among fitting programs: how often the value function puts a correct program first, vs. description length */
    let n = 0, byBits = 0, byValue = 0;
    evalRows.forEach(r => { if (r.progs.length >= 2 && r.progs.some(g => g.correct)) { n++; const b = r.progs.slice().sort((a, c) => a.rank - c.rank)[0]; if (b.correct) byBits++; const v = r.progs.slice().sort((a, c) => dot(policy.valueW, PK.map(k => c.pf[k] || 0)) - dot(policy.valueW, PK.map(k => a.pf[k] || 0)))[0]; if (v.correct) byValue++; } });
    report.rankingOnHeldout = { tasksWithAlternatives: n, topByRank: byBits, topByValue: byValue };
  }
  report.counts = { tasks: rows.length, solved: rows.filter(r => r.solved).length, parseModels: Object.keys(policy.parseW), kindModels: Object.keys(policy.kindW), families: Object.keys(policy.famPrior).length, macros: Object.keys(policy.macros).length };
  const out = arg('out');
  const src = '/* ===== src/68-psyn-policy.js (GENERATED by tools/arc-psyn-train.js; do not edit) ===== */\n/* Trained on search traces: ' + rows.length + ' tasks. See measurements/arc-psyn-policy-report.json. */\nPSYN.Policy.load(' + JSON.stringify(policy) + ');\n';
  if (out) fs.writeFileSync(out, src);
  if (arg('report')) fs.writeFileSync(arg('report'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}
if (arg('collect')) collect(); else if (args.includes('--train')) train(); else console.log('see header');
