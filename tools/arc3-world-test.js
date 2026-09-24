/* ARC-3 world-model tests (c4-arc3-world.js) on the synthetic environments
 * of tools/arc3-synth.js. Synthetic fixtures only: nothing here is an
 * ARC-AGI-3 score.
 *
 *   world-model revision   the action map is redrawn between levels: the
 *                          BeliefSet must switch to "actions-redrawn" after
 *                          at most two contradicting moves, and the revised
 *                          model must be correct
 *   no spurious revision   when the mechanics persist, the carried-over
 *                          model stays the most probable one
 *   hidden state           a door that opens only when bumped while carrying
 *                          an invisible key: the bump effect and its
 *                          precondition are learned and reused
 *   enabling transfer      a key/door level after the first is solved through
 *                          an "enable" option, faster than the first level
 *   irreversible harm      a trap that destroys the goal is remembered and
 *                          avoided on later levels
 *   teleport planning      an observed teleport becomes a planned transition
 *   one controller         ARC-3 option segments reach the shared meta hub
 */
"use strict";
var path = require("path");
var root = path.join(__dirname, "..");
require(path.join(root, "c4-reason-kernel.js"));
var META = require(path.join(root, "c4-reason-meta.js"));
var W = require(path.join(root, "c4-arc3-world.js"));
var S = require("./arc3-synth.js");

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; if (process.env.VERBOSE) console.log("  ok   " + msg); } else { fail++; console.log("  FAIL " + msg); } }

function playLevels(feats, seed, levels, maxSteps, opts) {
  var env = new S.Env({ seed: seed, features: feats }), agent = new W.Agent(env.actions, opts || {}), out = [];
  for (var li = 0; li < levels; li++) {
    var t0 = agent.trace.length;
    var res = S.play(env, agent, maxSteps || 150);
    res.trace = agent.trace.slice(t0);
    res.model = agent.model;
    res.beliefs = agent.beliefs;
    res.semantics = S.semanticsCorrect(agent.model, env);
    out.push(res);
    agent.nextLevel();
  }
  return out;
}

/* ------------------------------------------------ world-model revision */
console.log("world-model revision");
var switched = 0, fast = 0, correct = 0, n = 0;
for (var g = 0; g < 20; g++) {
  var env = new S.Env({ seed: 7000 + g, features: ["changing-map"] }), agent = new W.Agent(env.actions, {});
  S.play(env, agent, 150);
  agent.nextLevel();
  /* level 2 with a redrawn map: count contradicting moves until the switch */
  var grid = env.reset(); agent.observe(grid, {});
  var contradictions = 0, done = false;
  for (var t = 0; t < 150 && !done; t++) {
    var before = agent.beliefs.best().label, a = agent.act();
    var pred = agent.model.predict(agent.prev, a);
    var o = env.step(a); agent.observe(o.grid, o);
    var e1 = agent.model.agentEntity(agent.prev);
    if (pred.known && e1 && (e1.r0 !== pred.pos[0] || e1.c0 !== pred.pos[1]) && before === "prior") contradictions++;
    if (agent.beliefs.best().label === "actions-redrawn" && before === "prior") { switched++; if (contradictions <= 2) fast++; }
    done = o.levelComplete || o.gameOver;
  }
  n++;
  if (S.semanticsCorrect(agent.model, env) >= 0.75) correct++;
}
ok(switched >= 0.8 * n, "the BeliefSet switches to the redrawn-actions model (" + switched + "/" + n + ")");
ok(fast >= 0.8 * switched, "the switch needs at most two contradicting moves (" + fast + "/" + switched + ")");
ok(correct >= 0.8 * n, "the revised action semantics are correct (" + correct + "/" + n + ")");

/* ------------------------------------------------ no spurious revision */
var stay = 0, starts = 0;
for (var g2 = 0; g2 < 15; g2++) {
  var lv = playLevels([], 7100 + g2, 3);
  for (var l = 1; l < 3; l++) { starts++; if (lv[l].beliefs.best().label === "prior") stay++; }
}
ok(stay >= 0.9 * starts, "persistent mechanics keep the carried-over model most probable (" + stay + "/" + starts + ")");

/* ------------------------------------------------------- hidden state */
console.log("hidden state, enabling, harm, teleport");
var learnedBump = 0, withPre = 0, laterWins = 0, laterN = 0, firstWins = 0;
for (var g3 = 0; g3 < 12; g3++) {
  var hs = playLevels(["hidden-state"], 7200 + g3, 3, 200);
  hs.forEach(function (r, i) {
    if (i === 0) firstWins += r.complete ? 1 : 0; else { laterN++; laterWins += r.complete ? 1 : 0; }
    var eff = r.model.effects["bump:" + S.COLORS.DOOR];
    if (eff) { learnedBump++; if (Object.keys(eff).some(function (k) { return eff[k].pre.indexOf(S.COLORS.KEY) >= 0; })) withPre++; }
  });
}
ok(learnedBump > 0, "a bump effect on the door is learned (" + learnedBump + " levels)");
ok(withPre >= 0.8 * learnedBump, "its precondition is the carried key (" + withPre + "/" + learnedBump + ")");
ok(laterWins / laterN >= 0.7, "later hidden-state levels are solved (" + laterWins + "/" + laterN + ")");

/* ------------------------------------------------ enabling transfer */
var enableUsed = 0, firstSteps = 0, laterSteps = 0, kd = 0;
for (var g4 = 0; g4 < 15; g4++) {
  var k = playLevels(["keydoor"], 7300 + g4, 3);
  firstSteps += k[0].steps; laterSteps += (k[1].steps + k[2].steps) / 2; kd++;
  if (k.slice(1).some(function (r) { return r.trace.some(function (t) { return t.option && t.option.kind === "enable"; }); })) enableUsed++;
}
ok(enableUsed >= 5, "later key/door levels use an enable option (" + enableUsed + "/" + kd + " games)");
ok(laterSteps < firstSteps, "later key/door levels take fewer steps (" + Math.round(laterSteps / kd) + " vs " + Math.round(firstSteps / kd) + ")");

/* ------------------------------------------------ irreversible harm */
var harmKnown = 0, trapTouchedLater = 0, harmGames = 0;
for (var g5 = 0; g5 < 20; g5++) {
  var ir = playLevels(["irreversible"], 7400 + g5, 3, 150);
  var trapColor = S.COLORS.BARRIER;
  var learnedAt = -1;
  ir.forEach(function (r, i) { if (learnedAt < 0 && r.model.harmful(trapColor)) learnedAt = i; });
  if (learnedAt >= 0 && learnedAt < 2) {
    harmGames++;
    harmKnown++;
    ir.slice(learnedAt + 1).forEach(function (r) {
      if (r.trace.some(function (t) { return t.option && t.option.target === trapColor; })) trapTouchedLater++;
    });
  }
}
ok(harmKnown > 0, "a trap that destroyed the goal is recognised as harmful (" + harmKnown + " games)");
ok(trapTouchedLater === 0, "no later level targets a known-harmful colour (" + trapTouchedLater + ")");

/* ------------------------------------------------ teleport planning */
var teleUsed = 0;
for (var g6 = 0; g6 < 10; g6++) {
  var tp = playLevels(["teleport"], 7500 + g6, 2);
  if (tp.some(function (r) { return Object.keys(r.model.teleMap).length > 0; })) teleUsed++;
}
ok(teleUsed > 0, "observed teleports are recorded for planning (" + teleUsed + "/10 games)");
var tpEval = S.evaluate({ games: 12, seed: 77, suites: [["teleport"]] });
ok(tpEval.complete_rate >= 0.9, "teleport levels are completed (" + Math.round(tpEval.complete_rate * 100) + "%)");

/* ------------------------------------------------ one controller */
var before = META.hub.buffer.filter(function (s) { return s.domain === "arc3"; }).length;
playLevels([], 7600, 2);
var after = META.hub.buffer.filter(function (s) { return s.domain === "arc3"; }).length;
ok(after > before, "ARC-3 option segments are logged to the shared meta hub (" + (after - before) + ")");
ok(META.hub.buffer.filter(function (s) { return s.domain === "arc3"; }).every(function (s) { return META.ACTIONS.indexOf(s.action) >= 0; }),
   "they are logged as kernel operations");

console.log("arc3-world-test: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
