/* ARC-AGI-3 environment protocol, scoring and evaluation harness.
 *
 * Mirrors the official interface (verified from the arcengine / arc-agi
 * packages, see ARC3-EVAL-PROTOCOL.md):
 *
 *   observation  { frames: [grid, ...]   one action may render several 64x64
 *                                        frames (animation); values 0..15
 *                  state: "NOT_FINISHED" | "WIN" | "GAME_OVER",
 *                  levels_completed, win_levels, available_actions: [ids] }
 *   action       { id: 0..7, x, y }      0 = RESET, 1..5 simple, 6 = click
 *                                        at (x, y) in 0..63, 7 = undo
 *   after WIN / GAME_OVER only RESET acts; RESET restarts the level (or the
 *   game when nothing was played yet)
 *
 * A game object implements reset() -> observation and step(action) ->
 * observation. Synthetic games (c4-arc3-games.js) and the bridge to the
 * official engine (tools/arc3-bridge.py) both speak this.
 *
 * Scoring (official, arc_agi/scorecard.py): a completed level scores
 * min(1.15, (baseline / actions)^2); an uncompleted one 0; a level taking
 * more than 5x its baseline scores 0 (technical report). A game's score is
 * the level-index-weighted mean, capped at the weight share of completed
 * levels. RESET is counted as an action here (the engine's counter does not
 * count it; counting it is the conservative choice) and reported apart.
 *
 * The harness gives every agent the SAME environment-action budget. Internal
 * compute is free and reported separately.
 */
(function (root) {
  "use strict";

  function levelScore(baseline, actions, completed) {
    if (!completed || !(actions > 0) || !(baseline > 0)) return 0;
    if (actions > 5 * baseline) return 0;
    return Math.min(1.15, Math.pow(baseline / actions, 2));
  }
  /* official aggregation: level-index weights (1-indexed), capped at the
     weight share of completed levels */
  function gameScore(levels) {
    var tw = 0, ts = 0, cw = 0;
    levels.forEach(function (L, i) { var w = i + 1; tw += w; ts += w * L.score; if (L.score > 0) cw += w; });
    if (!tw) return 0;
    return Math.min(ts / tw, cw / tw);
  }

  /* Run one agent on one game.
     opts.budget        total environment actions for the whole game
     opts.levelBudget   per-level cap (default 5x baseline when baselines known)
     opts.probe(game, agent, k)  optional: called before every action, for
                        counterfactual prediction probes (no env action spent)
     opts.onStep(action, obs, prevObs, k)  optional: after every action
     Returns a record with per-level actions, completion, scores. */
  function run(agent, game, opts) {
    opts = opts || {};
    var baselines = game.baselines || [], nLevels = game.levels || baselines.length || 1;
    var budget = opts.budget || (baselines.length ? baselines.reduce(function (a, b) { return a + 5 * b; }, 0) : 200);
    var obs = game.reset(), t0 = Date.now(), thinkMs = 0;
    if (agent.start) agent.start({ available_actions: obs.available_actions, win_levels: obs.win_levels });
    var level = obs.levels_completed || 0, levelActions = 0, total = 0, resets = 0;
    var rec = { levels: [], total_actions: 0, resets: 0, state: obs.state, predictions: [] };
    var perLevel = [];
    agent.observe(obs);
    while (total < budget && obs.state !== "WIN") {
      if (opts.probe) opts.probe(game, agent, total);
      var t1 = Date.now(), a = agent.act();
      thinkMs += Date.now() - t1;
      if (!a) break;
      var pred = agent.predictLast ? agent.predictLast() : null, prevObs = obs;
      obs = game.step(a);
      total++; levelActions++;
      if (a.id === 0) resets++;
      if (opts.onStep) opts.onStep(a, obs, prevObs, total);
      if (pred && opts.scorePrediction) rec.predictions.push(opts.scorePrediction(pred, obs, total));
      if ((obs.levels_completed || 0) > level) {
        for (var k = level; k < obs.levels_completed; k++) perLevel.push({ index: k + 1, actions: levelActions, completed: true });
        level = obs.levels_completed; levelActions = 0;
      }
      t1 = Date.now(); agent.observe(obs); thinkMs += Date.now() - t1;
    }
    if (obs.state !== "WIN" && level < nLevels) perLevel.push({ index: level + 1, actions: levelActions, completed: false });
    for (var i = perLevel.length; i < nLevels; i++) perLevel.push({ index: i + 1, actions: 0, completed: false });
    perLevel.forEach(function (L, i) {
      L.baseline = baselines[i] || null;
      L.score = L.baseline ? levelScore(L.baseline, L.actions, L.completed) : (L.completed ? 1 : 0);
    });
    rec.levels = perLevel;
    rec.total_actions = total; rec.resets = resets; rec.state = obs.state;
    rec.completed_levels = perLevel.filter(function (L) { return L.completed; }).length;
    rec.win = obs.state === "WIN";
    rec.score = gameScore(perLevel);
    rec.think_ms = thinkMs; rec.wall_ms = Date.now() - t0;
    return rec;
  }

  /* The pre-existing navigation agent (c4-arc3-world.js) behind the official
     interface: it sees the last frame, acts with the simple actions it is
     given (it has no notion of a click or of coordinates), and answers
     GAME_OVER with RESET. This is the BASELINE of every comparison. */
  function LegacyAgent(opts) {
    var W = root.C4Arc3World || (typeof require === "function" ? require("./c4-arc3-world.js") : null);
    this.W = W; this.opts = opts || {}; this.agent = null; this.level = 0; this.lastState = null;
  }
  LegacyAgent.prototype.start = function (info) {
    var acts = (info.available_actions || [1, 2, 3, 4, 5]).filter(function (a) { return a >= 1 && a <= 5; });
    if (!acts.length) acts = [1];
    this.acts = acts;
    this.agent = new this.W.Agent(acts, {});
  };
  LegacyAgent.prototype.observe = function (obs) {
    var f = obs.frames && obs.frames.length ? obs.frames[obs.frames.length - 1] : null;
    this.lastState = obs.state;
    if ((obs.levels_completed || 0) > this.level) { this.level = obs.levels_completed; this.agent.nextLevel(); this.agent.observe(f, {}); return; }
    if (f) this.agent.observe(f, { gameOver: obs.state === "GAME_OVER" });
  };
  LegacyAgent.prototype.act = function () {
    if (this.lastState === "GAME_OVER") { this.agent.prev = null; this.agent.lastAction = null; return { id: 0 }; }
    var a = this.agent.act();
    return { id: typeof a === "number" ? a : this.acts[0] };
  };

  var ENV = { levelScore: levelScore, gameScore: gameScore, run: run, LegacyAgent: LegacyAgent };
  root.C4Arc3Env = ENV;
  if (typeof module !== "undefined" && module.exports) module.exports = ENV;
})(typeof globalThis !== "undefined" ? globalThis : this);
