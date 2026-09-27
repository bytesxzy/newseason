#!/usr/bin/env node
/* Agents on games of the OFFICIAL ARC-AGI-3 engine (arcengine), through
 * tools/arc3-bridge.py, under the official scoring (c4-arc3-env.js).
 *
 *   ARC3_PYTHON=/path/to/python-with-arcengine \
 *   node tools/arc3-official.js --root <environment_files> --set dev --agents new,legacy
 *   (--shard k/n runs every n-th game from the k-th, for parallel processes)
 *
 * Sets (ARC3-EVAL-PROTOCOL.md):
 *   dev       the community games whose descriptions were seen before the
 *             protocol was written: interface debugging only
 *   heldout   every other community game: run ONCE on a frozen commit
 *   official  ls20, ft09, vc33 (official public ARC-AGI-3 games, official
 *             human baselines): run ONCE on a frozen commit
 * heldout and official refuse to run unless --frozen <commit> names HEAD
 * and the agent sources are unmodified.
 *
 * Every agent gets the same budget per game: 5x the sum of the official
 * per-level baselines (metadata baseline_actions); RESET counts. A level
 * needing more than 5x its baseline scores 0 anyway (technical report).
 * The agent sees frames, state, level counters and available actions only
 * (never titles, descriptions or tags). */
"use strict";
var path = require("path"), fs = require("fs"), cp = require("child_process"), readline = require("readline");
var ROOT = path.join(__dirname, "..");
var DEV = "ez01 ez02 ez03 ez04 ul01 tt01 wm01 sv01 pt01 pt02 sy01 sk01 tb01 ff01 mm01 ms01 sq01 rs01 pb01 pb02 pb03 fs01 fs02 fs03 tp01 tp02 tp03 ic01 ic02 ic03 va01 va02 va03 nw01 bd01".split(" ");
var OFFICIAL = ["ls20", "ft09", "vc33"];

function EngineGame(dir, py) {
  this.dir = dir;
  this.proc = cp.spawn(py, [path.join(__dirname, "arc3-bridge.py"), dir], { stdio: ["pipe", "pipe", "inherit"] });
  this.rl = readline.createInterface({ input: this.proc.stdout });
  this.waiting = [];
  var self = this;
  this.rl.on("line", function (line) { var w = self.waiting.shift(); if (w) w(JSON.parse(line)); });
}
EngineGame.prototype.req = function (o) { var self = this; return new Promise(function (res) { self.waiting.push(res); self.proc.stdin.write(JSON.stringify(o) + "\n"); }); };
/* baselines: the official per-level human baselines from metadata; a
   community game listing fewer baselines than levels gets the mean of the
   listed ones for the rest (flagged in the record) */
EngineGame.prototype.init = async function () {
  var info = await this.req({ cmd: "info" }), o = check(await this.req({ cmd: "reset" }));
  this.game_id = info.game_id; this.levels = o.win_levels || (info.baselines || []).length || 1;
  var b = (info.baselines || []).slice(0, this.levels), m = b.length ? Math.round(b.reduce(function (s, x) { return s + x; }, 0) / b.length) : 30;
  this.imputed = this.levels - b.length;
  while (b.length < this.levels) b.push(m);
  this.baselines = b;
  return this;
};
EngineGame.prototype.reset = function () { return this.req({ cmd: "reset" }).then(check); };
EngineGame.prototype.step = function (a) { return this.req(a.id === 6 ? { cmd: "step", id: 6, x: a.x, y: a.y } : { cmd: "step", id: a.id }).then(check); };
EngineGame.prototype.close = function () { try { this.proc.stdin.write(JSON.stringify({ cmd: "quit" }) + "\n"); this.proc.stdin.end(); } catch (e) { } };
function check(o) { if (o.error) throw new Error("engine: " + o.error); return o; }

function makeAgent(spec) {
  global.C4Arc3World = require(path.join(ROOT, "c4-arc3-world.js"));
  var ENV = require(path.join(ROOT, "c4-arc3-env.js")), AG = require(path.join(ROOT, "c4-arc3-agent.js"));
  if (spec === "legacy") return new ENV.LegacyAgent();
  if (spec === "random") return new (require("./arc3-bench.js").RandomAgent)(1);
  var opts = {};
  if (spec.indexOf("new:") === 0) spec.slice(4).split(/[,+]/).forEach(function (f) { if (f.charAt(0) === "-") opts[f.slice(1)] = false; });
  return new AG.Agent(opts);
}

function gameDirs(root, names) {
  return names.map(function (n) {
    var d = path.join(root, n); if (!fs.existsSync(d)) return null;
    var vs = fs.readdirSync(d).filter(function (v) { return fs.existsSync(path.join(d, v, "metadata.json")); });
    return vs.length ? { name: n, dir: path.join(d, vs[0]) } : null;
  }).filter(Boolean);
}

function checkFrozen(frozen) {
  if (!frozen) { console.error("held-out and official games run only on a frozen commit: --frozen <commit>"); process.exit(2); }
  var head = cp.execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  var dirty = cp.execSync("git status --porcelain -- c4-arc3-agent.js c4-arc3-env.js c4-arc3-world.js tools/arc3-official.js tools/arc3-bridge.py", { cwd: ROOT }).toString().trim();
  if (head.indexOf(frozen) !== 0 || dirty) { console.error("not frozen: HEAD " + head + (dirty ? ", uncommitted:\n" + dirty : "")); process.exit(2); }
}

async function main() {
  var args = { set: "dev", agents: ["new"], budgetMult: 5, py: process.env.ARC3_PYTHON || "python3", maxWallMs: 20 * 60 * 1000 };
  for (var i = 2; i < process.argv.length; i++) {
    var a = process.argv[i], v = process.argv[i + 1];
    if (a === "--root") { args.root = v; i++; } else if (a === "--set") { args.set = v; i++; } else if (a === "--games") { args.games = v.split(","); i++; }
    else if (a === "--agents") { args.agents = v.split(","); i++; } else if (a === "--budget-mult") { args.budgetMult = +v; i++; }
    else if (a === "--frozen") { args.frozen = v; i++; } else if (a === "--json") { args.json = v; i++; } else if (a === "--max-wall-min") { args.maxWallMs = +v * 60000; i++; }
    else if (a === "--shard") { var sh = v.split("/"); args.shard = [+sh[0], +sh[1]]; i++; }
    else if (a === "--verbose") args.verbose = true;
  }
  if (!args.root) { console.error("--root <environment_files dir> required"); process.exit(2); }
  var all = fs.readdirSync(args.root).filter(function (n) { return fs.statSync(path.join(args.root, n)).isDirectory(); }).sort();
  var names = args.games || (args.set === "dev" ? DEV : args.set === "official" ? OFFICIAL : all.filter(function (n) { return DEV.indexOf(n) < 0 && OFFICIAL.indexOf(n) < 0; }));
  if (names.some(function (n) { return DEV.indexOf(n) < 0; })) checkFrozen(args.frozen);
  if (args.shard) names = names.filter(function (n, i) { return i % args.shard[1] === args.shard[0]; });
  var games = gameDirs(args.root, names), ENV = require(path.join(ROOT, "c4-arc3-env.js")), results = [];
  for (var gi = 0; gi < games.length; gi++) {
    for (var ai = 0; ai < args.agents.length; ai++) {
      var g = await new EngineGame(games[gi].dir, args.py).init(), ag = makeAgent(args.agents[ai]), rec;
      var budget = g.baselines.reduce(function (s, b) { return s + args.budgetMult * b; }, 0) || 200;
      try { rec = await ENV.runAsync(ag, g, { budget: budget, maxWallMs: args.maxWallMs }); }
      catch (e) { rec = { error: String(e && e.message || e), score: 0, completed_levels: 0, levels: [], total_actions: 0, resets: 0, think_ms: 0 }; }
      g.close();
      var r = { game: games[gi].name, game_id: g.game_id, agent: args.agents[ai], score: rec.score, levels: rec.completed_levels, nLevels: g.baselines.length, imputed_baselines: g.imputed, actions: rec.total_actions, budget: budget, resets: rec.resets,
                think_ms: rec.think_ms, level_detail: (rec.levels || []).map(function (L) { return [L.actions, L.baseline, L.completed ? 1 : 0, Math.round((L.score || 0) * 1000) / 1000]; }), error: rec.error,
                pred: ag.stats ? [ag.stats.correct, ag.stats.predicted] : null, modes: ag.stats ? ag.stats.modeLog.join("") : null,
                agent_errors: ag.stats ? ag.stats.errors || 0 : 0, last_error: ag.stats ? ag.stats.lastError || null : null };
      results.push(r);
      console.log([r.agent, r.game, "score " + (r.score || 0).toFixed(3), "lv " + r.levels + "/" + r.nLevels, "act " + r.actions + "/" + budget, "rst " + r.resets, r.pred ? "pred " + r.pred[0] + "/" + r.pred[1] : "", Math.round(r.think_ms / 1000) + "s", r.error || "", r.agent_errors ? "agent-errors " + r.agent_errors : "", args.verbose && r.modes ? r.modes.slice(0, 100) : ""].join("  "));
    }
  }
  args.agents.forEach(function (agn) {
    var rs = results.filter(function (r) { return r.agent === agn; }), mean = rs.reduce(function (s, r) { return s + (r.score || 0); }, 0) / Math.max(1, rs.length);
    console.log(agn + ": games " + rs.length + ", mean score " + mean.toFixed(4) + ", levels " + rs.reduce(function (s, r) { return s + r.levels; }, 0) + "/" + rs.reduce(function (s, r) { return s + r.nLevels; }, 0) +
      ", games with a level " + rs.filter(function (r) { return r.levels > 0; }).length + ", actions " + rs.reduce(function (s, r) { return s + r.actions; }, 0));
  });
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ args: args, results: results }, null, 1));
}
main().catch(function (e) { console.error(e); process.exit(1); });
