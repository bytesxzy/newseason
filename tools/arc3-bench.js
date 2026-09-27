#!/usr/bin/env node
/* ARC-AGI-3-style benchmark on the synthetic game families
 * (c4-arc3-games.js), under the official protocol and scoring
 * (c4-arc3-env.js). Every agent gets the SAME environment-action budget per
 * game (default: 5x the per-level baselines, summed; RESET counts).
 *
 *   node tools/arc3-bench.js --set dev --seeds 1-5 --agents new,legacy
 *   node tools/arc3-bench.js --families maze,push --seeds 1 --agents new --verbose
 *   node tools/arc3-bench.js --set dev --agents new,new:-ig,new:-physics --probe --json out.json
 *
 * Agents: new (c4-arc3-agent.js, full), new:-flag,-flag (ablations: ig,
 * goals, memory, plan, latent, ticks, physics, experiments, spec), legacy
 * (c4-arc3-world.js behind the official interface), random (uniform over
 * the available actions, clicks at uniform random pixels).
 *
 * The held-out families run only on a frozen commit:
 *   node tools/arc3-bench.js --set holdout --frozen <commit>   (HEAD must be
 *   <commit> and the ARC-3 sources must have no uncommitted change)
 *
 * Metrics per game: official score, levels completed, actions, resets,
 * prediction accuracy of the agent's own next-state predictions (and, with
 * --probe, counterfactual accuracy over all candidate actions after
 * K = 1, 2, 4, 8, 16, 32 interactions), actions until predictions become
 * reliable (5 consecutive correct), actions to the first level completion,
 * no-op actions, wasted experiments (exploration steps that changed
 * nothing the model did not already predict), think time. */
"use strict";
var path = require("path"), cp = require("child_process"), os = require("os");
var ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
  var o = { set: "dev", seeds: [1], agents: ["new"], budgetMult: 5, jobs: Math.max(1, os.cpus().length), probe: false };
  for (var i = 2; i < argv.length; i++) {
    var a = argv[i], v = argv[i + 1];
    if (a === "--set") { o.set = v; i++; }
    else if (a === "--families") { o.families = v.split(","); i++; }
    else if (a === "--seeds") { o.seeds = v.indexOf("-") > 0 ? range(v) : v.split(",").map(Number); i++; }
    else if (a === "--agents") { o.agents = v.split(","); i++; }
    else if (a === "--budget-mult") { o.budgetMult = +v; i++; }
    else if (a === "--jobs") { o.jobs = +v; i++; }
    else if (a === "--json") { o.json = v; i++; }
    else if (a === "--frozen") { o.frozen = v; i++; }
    else if (a === "--probe") o.probe = true;
    else if (a === "--verbose") o.verbose = true;
    else if (a === "--worker") o.worker = true;
  }
  return o;
  function range(s) { var p = s.split("-").map(Number), r = []; for (var k = p[0]; k <= p[1]; k++) r.push(k); return r; }
}

/* ------------------------------------------------------------ agents */
function makeAgent(spec, seed) {
  global.C4Arc3World = require(path.join(ROOT, "c4-arc3-world.js"));
  var ENV = require(path.join(ROOT, "c4-arc3-env.js")), AG = require(path.join(ROOT, "c4-arc3-agent.js"));
  if (spec === "legacy") return new ENV.LegacyAgent();
  if (spec === "random") return new RandomAgent(seed);
  var opts = {};
  if (spec.indexOf("new:") === 0) spec.slice(4).split(/[,+]/).forEach(function (f) { if (f.charAt(0) === "-") opts[f.slice(1)] = false; });
  return new AG.Agent(opts);
}
function RandomAgent(seed) { var s = (seed * 2654435761) >>> 0 || 1; this.R = function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
RandomAgent.prototype.start = function (info) { this.acts = (info.available_actions || [1, 2, 3, 4, 5, 6]).filter(function (a) { return a !== 0; }); };
RandomAgent.prototype.observe = function (obs) { this.state = obs.state; };
RandomAgent.prototype.act = function () {
  if (this.state === "GAME_OVER") return { id: 0 };
  var a = this.acts[Math.floor(this.R() * this.acts.length)];
  return a === 6 ? { id: 6, x: Math.floor(this.R() * 64), y: Math.floor(this.R() * 64) } : { id: a };
};

/* ------------------------------------------------------------ one run */
var PROBE_K = [1, 2, 4, 8, 16, 32];
function runOne(job) {
  var ENV = require(path.join(ROOT, "c4-arc3-env.js")), GAMES = require(path.join(ROOT, "c4-arc3-games.js"));
  var P = require(path.join(ROOT, "c4-arc3-agent.js")).parts;
  var game = new GAMES.Game(job.family, job.seed), agent = makeAgent(job.agent, job.seed);
  var budget = game.baselines.reduce(function (a, b) { return a + job.budgetMult * b; }, 0);
  var probes = {}, noop = 0, steps = [];
  function frameKey(o) { var f = o.frames && o.frames.length ? o.frames[o.frames.length - 1] : null; return f ? f.map(function (r) { return r.join(","); }).join("|") : ""; }
  var rec = ENV.run(agent, game, {
    budget: budget,
    probe: job.probe && agent.predictAction ? function (g, ag, k) {
      if (PROBE_K.indexOf(k) < 0 || g.lv !== 0 || g.state !== "NOT_FINISHED" || !ag.S) return;
      var acts = g.available.filter(function (a) { return a !== 6 && a !== 0; }).map(function (a) { return { id: a }; });
      if (g.available.indexOf(6) >= 0) {
        var objs = ag.S.objs.filter(function (o) { return o.n <= ag.S.H * ag.S.W / 3; }), stride = Math.max(1, Math.floor(objs.length / 8));
        for (var i = 0; i < objs.length && acts.length < 13; i += stride) {
          var o = objs[i], cell = o.cells[Math.floor(o.cells.length / 2)], p = ag.L.pixelOf((cell / ag.S.W) | 0, cell % ag.S.W);
          acts.push({ id: 6, x: p.x, y: p.y });
        }
      }
      acts.forEach(function (a) {
        var pr = ag.predictAction(a), o = g.peek(a);
        if (!o.frames.length) return;
        var fr = o.state === "WIN" ? o.frames[o.frames.length - 1] : (o.levels_completed > g.lv ? o.frames[o.frames.length - 2] : o.frames[o.frames.length - 1]);
        var truth = ag.L.logical(fr), ok = !!pr && P.gkey(pr.g) === P.gkey(truth);
        var b = probes[k] || (probes[k] = [0, 0, 0]); b[0] += ok ? 1 : 0; b[1]++; b[2] += pr ? 1 : 0;
      });
    } : null,
    onStep: function (a, obs, prev, k) { var same = frameKey(obs) === frameKey(prev); if (same) noop++; steps.push(same ? 0 : 1); }
  });
  var st = agent.stats || null, out = {
    agent: job.agent, family: job.family, seed: job.seed, score: rec.score, levels: rec.completed_levels, nLevels: rec.levels.length,
    actions: rec.total_actions, budget: budget, resets: rec.resets, win: rec.win, think_ms: rec.think_ms,
    level_detail: rec.levels.map(function (L) { return [L.actions, L.baseline, L.completed ? 1 : 0, Math.round(L.score * 1000) / 1000]; }),
    first_level_actions: rec.levels[0] && rec.levels[0].completed ? rec.levels[0].actions : null,
    noop: noop, probes: probes
  };
  if (st) {
    out.pred = [st.correct, st.predicted];
    out.agent_errors = st.errors || 0; if (st.lastError) out.last_error = st.lastError;
    out.byK = st.byK;
    /* actions until predictions become reliable: start of the first run of
       5 consecutive correct predictions of the agent's own steps */
    var log = st.predLog || [], run = 0, reliable = null;
    for (var i = 0; i < log.length; i++) { if (log[i] === 1) { run++; if (run === 5) { reliable = i - 3; break; } } else run = 0; }
    out.reliable_at = reliable;
    var modes = (st.modeLog || []).join("");
    out.modes = modes;
    /* wasted experiments: exploration-type steps (x, f, r) whose outcome
       was a correctly predicted no-change */
    var wasted = 0;
    for (var j = 0; j < modes.length && j < steps.length; j++) if ("xfr".indexOf(modes[j]) >= 0 && !steps[j] && log[j] === 1) wasted++;
    out.wasted = wasted;
  }
  return out;
}

/* ------------------------------------------------------------ driver */
function checkFrozen(o) {
  if (o.set !== "holdout" && !(o.families || []).some(isHoldout)) return;
  if (!o.frozen) { console.error("held-out families run only on a frozen commit: --frozen <commit>"); process.exit(2); }
  var head = cp.execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  var dirty = cp.execSync("git status --porcelain -- c4-arc3-agent.js c4-arc3-env.js c4-arc3-games.js c4-arc3-world.js tools/arc3-bench.js", { cwd: ROOT }).toString().trim();
  if (head.indexOf(o.frozen) !== 0 || dirty) { console.error("not frozen: HEAD " + head + (dirty ? ", uncommitted:\n" + dirty : "")); process.exit(2); }
}
function isHoldout(f) { return require(path.join(ROOT, "c4-arc3-games.js")).HOLDOUT.indexOf(f) >= 0; }

function main() {
  var o = parseArgs(process.argv);
  if (o.worker) {
    process.on("message", function (job) { var r; try { r = runOne(job); } catch (e) { r = { error: String(e && e.stack || e), agent: job.agent, family: job.family, seed: job.seed }; } process.send(r); });
    return;
  }
  var GAMES = require(path.join(ROOT, "c4-arc3-games.js"));
  var fams = o.families || (o.set === "holdout" ? GAMES.HOLDOUT : GAMES.DEV);
  checkFrozen({ set: o.set, families: fams, frozen: o.frozen });
  var jobs = [];
  o.agents.forEach(function (ag) { fams.forEach(function (f) { o.seeds.forEach(function (s) { jobs.push({ agent: ag, family: f, seed: s, budgetMult: o.budgetMult, probe: o.probe }); }); }); });
  var results = [], next = 0, live = 0, t0 = Date.now();
  var nw = Math.min(o.jobs, jobs.length);
  for (var w = 0; w < nw; w++) spawn();
  function spawn() {
    var ch = cp.fork(__filename, ["--worker"], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    live++;
    ch.on("message", function (r) { results.push(r); if (o.verbose || r.error) report1(r); feed(ch); });
    feed(ch);
  }
  function feed(ch) {
    if (next < jobs.length) ch.send(jobs[next++]);
    else { ch.kill(); if (--live === 0) done(); }
  }
  function report1(r) {
    if (r.error) { console.log("ERROR " + r.agent + " " + r.family + " s" + r.seed + "\n" + r.error); return; }
    console.log([r.agent, r.family, "s" + r.seed, "score " + r.score.toFixed(3), "lv " + r.levels + "/" + r.nLevels, "act " + r.actions + "/" + r.budget, "rst " + r.resets,
                 r.pred ? "pred " + r.pred[0] + "/" + r.pred[1] : "", r.modes ? "modes " + r.modes.slice(0, 80) : "", Math.round(r.think_ms) + "ms"].join("  "));
  }
  function done() {
    var agents = o.agents, byAF = {};
    results.forEach(function (r) { if (r.error) return; var k = r.agent + "|" + r.family; (byAF[k] = byAF[k] || []).push(r); });
    function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
    var lines = [], header = "| family | " + agents.join(" | ") + " |";
    lines.push(header); lines.push("|" + new Array(agents.length + 2).join("---|"));
    var tot = {};
    fams.forEach(function (f) {
      var row = "| " + f + " | ";
      row += agents.map(function (ag) {
        var rs = byAF[ag + "|" + f] || []; if (!rs.length) return "-";
        var sc = mean(rs.map(function (r) { return r.score; })), lv = mean(rs.map(function (r) { return r.levels; }));
        (tot[ag] = tot[ag] || []).push(sc);
        return sc.toFixed(3) + " (" + lv.toFixed(1) + " lv)";
      }).join(" | ") + " |";
      lines.push(row);
    });
    lines.push("| **mean** | " + agents.map(function (ag) { return "**" + mean(tot[ag] || []).toFixed(3) + "**"; }).join(" | ") + " |");
    console.log(lines.join("\n"));
    /* secondary metrics per agent */
    agents.forEach(function (ag) {
      var rs = results.filter(function (r) { return !r.error && r.agent === ag; });
      var pc = rs.reduce(function (a, r) { return r.pred ? [a[0] + r.pred[0], a[1] + r.pred[1]] : a; }, [0, 0]);
      var rel = rs.filter(function (r) { return r.reliable_at !== null && r.reliable_at !== undefined; });
      var fl = rs.filter(function (r) { return r.first_level_actions; });
      var pk = {};
      rs.forEach(function (r) { Object.keys(r.probes || {}).forEach(function (k) { var b = pk[k] || (pk[k] = [0, 0, 0]); b[0] += r.probes[k][0]; b[1] += r.probes[k][1]; b[2] += r.probes[k][2]; }); });
      console.log(ag + ": games " + rs.length + ", levels " + rs.reduce(function (a, r) { return a + r.levels; }, 0) + "/" + rs.reduce(function (a, r) { return a + r.nLevels; }, 0) +
        ", actions " + rs.reduce(function (a, r) { return a + r.actions; }, 0) + ", resets " + rs.reduce(function (a, r) { return a + r.resets; }, 0) +
        ", no-op " + rs.reduce(function (a, r) { return a + r.noop; }, 0) +
        (pc[1] ? ", own-step prediction " + (100 * pc[0] / pc[1]).toFixed(1) + "% of " + pc[1] : "") +
        (rs[0] && rs[0].wasted !== undefined ? ", wasted experiments " + rs.reduce(function (a, r) { return a + (r.wasted || 0); }, 0) : "") +
        (rel.length ? ", reliable after " + mean(rel.map(function (r) { return r.reliable_at; })).toFixed(1) + " actions (" + rel.length + "/" + rs.length + " games)" : "") +
        (fl.length ? ", first level in " + mean(fl.map(function (r) { return r.first_level_actions; })).toFixed(1) + " actions (" + fl.length + " games)" : "") +
        ", think " + (rs.reduce(function (a, r) { return a + r.think_ms; }, 0) / 1000).toFixed(1) + "s" +
        (Object.keys(pk).length ? "\n  counterfactual accuracy after K actions: " + PROBE_K.filter(function (k) { return pk[k]; }).map(function (k) { return "K=" + k + " " + (100 * pk[k][0] / pk[k][1]).toFixed(1) + "% (coverage " + (100 * pk[k][2] / pk[k][1]).toFixed(0) + "%, n=" + pk[k][1] + ")"; }).join(", ") : ""));
    });
    console.log("wall " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
    if (o.json) require("fs").writeFileSync(o.json, JSON.stringify({ args: o, results: results }, null, 1));
  }
}
if (require.main === module) main();
module.exports = { runOne: runOne, makeAgent: makeAgent, RandomAgent: RandomAgent };
