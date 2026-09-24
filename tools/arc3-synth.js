/* Synthetic interactive environments for the ARC-3 world model.
 *
 *   node tools/arc3-synth.js [--levels 40] [--seed 1] [--out measurements/arc3-synth.json]
 *
 * Small deterministic grid games whose rules are hidden from the agent:
 * which action moves which way (a random permutation per game, plus a no-op
 * action), walls, hazards that end the game, a goal that completes the level,
 * keys that open doors, buttons that remove barriers, teleporter pairs. The
 * agent sees only frames and the two signals "level complete" / "game over".
 *
 * These are training and regression fixtures for the reasoning process
 * (explore, infer, predict, detect contradiction, repair, plan). They are not
 * ARC-AGI-3 games and no score here is an ARC-AGI-3 score.
 *
 * Harder mechanics (--suite hard):
 *   ambiguous      two actions share a direction, no no-op action
 *   changing-map   the action permutation is re-drawn every level
 *   two-stage      a key opens a door around a button; the button removes
 *                  the barrier around the goal
 *   delayed        the button's barrier removal happens 3 steps later
 *   false-goal     inert decoy objects of a goal-like colour
 *   multi-goal     every goal cell must be collected; the last completes
 *   irreversible   a trap turns every goal cell into wall (level lost)
 *   hidden-state   the key is carried invisibly; the door opens only when
 *                  bumped while carrying it
 *   resource       the goal completes only once every coin is collected
 *   multi-mechanic hazards, key/door, button/barrier and teleporters
 */
"use strict";
var W = require("../c4-arc3-world.js");

var BG = 0, WALL = 5, AGENT = 3, GOAL = 4, HAZARD = 2, KEY = 6, DOOR = 7, BUTTON = 8, BARRIER = 9, TELE = 1;

function rng(seed) {
  var s = seed >>> 0 || 1;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function Env(opts) {
  this.rand = rng(opts.seed || 1);
  this.h = opts.h || 9; this.w = opts.w || 9;
  this.features = opts.features || [];
  var dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]], r = this.rand;
  for (var i = dirs.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t; }
  this.map = { 1: dirs[0], 2: dirs[1], 3: dirs[2], 4: dirs[3], 5: [0, 0] };
  if (this.features.indexOf("ambiguous") >= 0) this.map = { 1: dirs[0], 2: dirs[0], 3: dirs[1], 4: dirs[2], 5: dirs[3] };
  if (opts.map) this.map = opts.map;
  this.actions = [1, 2, 3, 4, 5];
  this.level = 0;
}
Env.prototype.has = function (f) { return this.features.indexOf(f) >= 0; };
/* a ring of colour col on the free 4-neighbours of p */
Env.prototype.ring = function (p, col) {
  var self = this;
  [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
    var y = p[0] + d[0], x = p[1] + d[1];
    if (self.base[y][x] === BG) self.base[y][x] = col;
  });
};
Env.prototype.redrawMap = function () {
  var dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]], r = this.rand;
  for (var i = dirs.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t; }
  this.map = { 1: dirs[0], 2: dirs[1], 3: dirs[2], 4: dirs[3], 5: [0, 0] };
};

Env.prototype.free = function () {
  var out = [], r, c;
  for (r = 1; r < this.h - 1; r++) for (c = 1; c < this.w - 1; c++) if (this.base[r][c] === BG) out.push([r, c]);
  return out;
};
Env.prototype.place = function (col) {
  var f = this.free(), p = f[Math.floor(this.rand() * f.length)];
  this.base[p[0]][p[1]] = col;
  return p;
};

Env.prototype.reset = function () {
  var r, c, tries = 0;
  this.level++;
  if (this.has("changing-map") && this.level > 1) this.redrawMap();
  do {
    this.base = [];
    for (r = 0; r < this.h; r++) {
      var row = [];
      for (c = 0; c < this.w; c++) row.push(r === 0 || c === 0 || r === this.h - 1 || c === this.w - 1 ? WALL : BG);
      this.base.push(row);
    }
    var nw = Math.floor(this.rand() * 5) + 2;
    for (var i = 0; i < nw; i++) this.place(WALL);
    this.agent = this.place(AGENT); this.base[this.agent[0]][this.agent[1]] = BG;
    this.goal = this.place(GOAL);
    if (this.features.indexOf("hazard") >= 0) { this.place(HAZARD); this.place(HAZARD); }
    if (this.features.indexOf("keydoor") >= 0) {
      /* the door sits in front of the goal's free neighbours */
      this.place(KEY);
      var g = this.goal, self = this;
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
        var y = g[0] + d[0], x = g[1] + d[1];
        if (self.base[y][x] === BG) self.base[y][x] = DOOR;
      });
    }
    if (this.features.indexOf("button") >= 0) {
      this.place(BUTTON);
      var g2 = this.goal, self2 = this;
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
        var y = g2[0] + d[0], x = g2[1] + d[1];
        if (self2.base[y][x] === BG) self2.base[y][x] = BARRIER;
      });
    }
    if (this.features.indexOf("teleport") >= 0) { this.tele = [this.place(TELE), this.place(TELE)]; }
    else this.tele = null;
    if (this.has("two-stage")) {
      /* key -> door ring around the button; button -> barrier ring around the goal */
      this.place(KEY);
      this.ring(this.goal, BARRIER);
      var bt = this.place(BUTTON);
      this.ring(bt, DOOR);
    }
    if (this.has("hidden-state")) { this.place(KEY); this.ring(this.goal, DOOR); }
    if (this.has("false-goal")) { this.place(TELE); this.place(TELE); this.place(TELE); }
    if (this.has("multi-goal")) { this.place(GOAL); this.place(GOAL); }
    if (this.has("irreversible")) { this.place(BARRIER); this.place(BARRIER); }
    if (this.has("resource")) { this.place(BUTTON); this.place(BUTTON); this.place(BUTTON); }
    this.done = false; this.over = false; this.steps = 0; this.carry = false; this.pending = [];
    tries++;
  } while (!this.solvable() && tries < 50);
  return this.frame();
};

/* reachability of the goal under the true rules (keys/buttons open things) */
Env.prototype.solvable = function () {
  var self = this, start = this.agent, seen = {}, q = [[start[0], start[1], 0]], qi = 0;
  var hasKey = this.has("keydoor") || this.has("two-stage") || this.has("hidden-state");
  var hasBtn = this.has("button") || this.has("two-stage");
  var trap = this.has("irreversible"), coins = this.has("resource");
  var dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  function open(r, c, state) {
    var v = self.base[r][c];
    if (v === WALL || v === HAZARD) return false;
    if (v === DOOR && !(state & 1)) return false;
    if (v === BARRIER && (trap || !(state & 2))) return false;
    return true;
  }
  /* every goal cell (and every coin) must be reachable in some state */
  var need = {}, needN = 0, r0, c0;
  for (r0 = 0; r0 < this.h; r0++) for (c0 = 0; c0 < this.w; c0++)
    if (this.base[r0][c0] === GOAL || (coins && this.base[r0][c0] === BUTTON)) { need[r0 + "," + c0] = 1; needN++; }
  var got = {};
  seen[start + ",0"] = 1;
  while (qi < q.length) {
    var cur = q[qi++];
    for (var a = 0; a < 4; a++) {
      var d = dirs[a], r = cur[0] + d[0], c = cur[1] + d[1], st = cur[2];
      if (!open(r, c, st)) continue;
      var v = this.base[r][c];
      if (need[r + "," + c] && !got[r + "," + c]) { got[r + "," + c] = 1; needN--; if (!needN) return this.mapCovers(); }
      if (v === GOAL) continue;
      if (v === KEY && hasKey) st |= 1;
      if (v === BUTTON && hasBtn) st |= 2;
      var k = r + "," + c + "," + st;
      if (seen[k]) continue;
      seen[k] = 1; q.push([r, c, st]);
    }
  }
  return false;
};
/* the actions reach all four directions (the ambiguous map does) */
Env.prototype.mapCovers = function () {
  var seen = {};
  for (var a in this.map) seen[this.map[a].join(",")] = 1;
  return !!(seen["0,1"] && seen["1,0"] && seen["0,-1"] && seen["-1,0"]);
};

Env.prototype.frame = function () {
  var g = this.base.map(function (row) { return row.slice(); });
  if (!this.over) g[this.agent[0]][this.agent[1]] = AGENT;
  return g;
};

Env.prototype.recolorAll = function (from, to) {
  for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) if (this.base[y][x] === from) this.base[y][x] = to;
};
Env.prototype.count = function (col) {
  var n = 0;
  for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) if (this.base[y][x] === col) n++;
  return n;
};
Env.prototype.step = function (a) {
  if (this.done || this.over) return { grid: this.frame(), levelComplete: this.done, gameOver: this.over };
  this.steps++;
  var self = this;
  /* delayed effects fire first, on schedule */
  this.pending = (this.pending || []).filter(function (e) { if (self.steps >= e.at) { e.fn(); return false; } return true; });
  var d = this.map[a] || [0, 0], r = this.agent[0] + d[0], c = this.agent[1] + d[1], v = this.base[r][c];
  if (d[0] || d[1]) {
    if (v === DOOR && this.has("hidden-state")) {
      /* bumping the door while carrying the (invisible) key opens it */
      if (this.carry) this.recolorAll(DOOR, BG);
    } else if (v === WALL || v === DOOR || (v === BARRIER && !this.has("irreversible"))) { /* blocked */ }
    else {
      this.agent = [r, c];
      if (v === HAZARD) this.over = true;
      else if (v === GOAL) {
        if (this.has("resource") && this.count(BUTTON)) { /* inert until every coin is collected */ }
        else if (this.has("multi-goal") && this.count(GOAL) > 1) this.base[r][c] = BG;
        else this.done = true;
      }
      else if (v === BARRIER && this.has("irreversible")) { this.base[r][c] = BG; this.recolorAll(GOAL, WALL); }
      else if (v === KEY) {
        this.base[r][c] = BG;
        if (this.has("hidden-state")) this.carry = true;
        else this.recolorAll(DOOR, BG);
      } else if (v === BUTTON && this.has("resource")) {
        this.base[r][c] = BG;
      } else if (v === BUTTON) {
        this.base[r][c] = BG;
        if (this.has("delayed")) this.pending.push({ at: this.steps + 3, fn: function () { self.recolorAll(BARRIER, BG); } });
        else this.recolorAll(BARRIER, BG);
      } else if (v === TELE && this.tele) {
        var other = (this.tele[0][0] === r && this.tele[0][1] === c) ? this.tele[1] : this.tele[0];
        /* land next to the partner so the teleporter stays visible */
        var nb = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        for (var k = 0; k < 4; k++) {
          var yy = other[0] + nb[k][0], xx = other[1] + nb[k][1];
          if (this.base[yy][xx] === BG) { this.agent = [yy, xx]; break; }
        }
      }
    }
  }
  return { grid: this.frame(), levelComplete: this.done, gameOver: this.over };
};

/* Play one level; returns the outcome and what was learned. */
function play(env, agent, maxSteps) {
  var g = env.reset();
  agent.observe(g, {});
  var t;
  for (t = 0; t < maxSteps; t++) {
    var a = agent.act();
    var o = env.step(a);
    agent.observe(o.grid, o);
    if (o.levelComplete || o.gameOver) return { complete: o.levelComplete, over: o.gameOver, steps: t + 1 };
  }
  return { complete: false, over: false, steps: maxSteps };
}

/* Does the learned model match the environment's hidden action map? */
function semanticsCorrect(model, env) {
  var ok = 0, n = 0;
  for (var a = 1; a <= 4; a++) {
    n++;
    var r = model.actionRule(a);
    if (r && r.dr === env.map[a][0] && r.dc === env.map[a][1]) ok++;
  }
  return ok / n;
}

function evaluate(opts) {
  opts = opts || {};
  var games = opts.games || 20, levelsPer = opts.levelsPer || 3, maxSteps = opts.maxSteps || 150;
  var suites = opts.suites || [[], ["hazard"], ["keydoor"], ["button"], ["teleport"], ["hazard", "keydoor"]];
  var out = { games: 0, levels: 0, complete: 0, over: 0, timeout: 0, steps: 0, semantics: 0,
              firstLevelSteps: 0, laterLevelSteps: 0, firstLevelN: 0, laterLevelN: 0,
              repairs: 0, contradictions: 0, bySuite: {} };
  for (var gi = 0; gi < games; gi++) {
    var feats = suites[gi % suites.length], name = feats.join("+") || "basic";
    var env = new Env({ seed: (opts.seed || 1) * 1000 + gi, features: feats });
    var agent = new W.Agent(env.actions, { prior: null });
    var s = out.bySuite[name] || (out.bySuite[name] = { levels: 0, complete: 0, over: 0, timeout: 0, steps: 0, semantics: 0 });
    out.games++;
    for (var li = 0; li < levelsPer; li++) {
      var res = play(env, agent, maxSteps);
      out.levels++; s.levels++;
      out.steps += res.steps;
      if (res.complete) { out.complete++; s.complete++; }
      else if (res.over) { out.over++; s.over++; }
      else { out.timeout++; s.timeout++; }
      s.steps += res.steps;
      s.semantics += semanticsCorrect(agent.model, env);
      if (li === 0) { out.firstLevelSteps += res.steps; out.firstLevelN++; }
      else { out.laterLevelSteps += res.steps; out.laterLevelN++; }
      out.semantics += semanticsCorrect(agent.model, env);
      out.repairs += agent.model.repairs.length;
      out.contradictions += agent.model.contradictions;
      if (opts.noTransfer) agent = new W.Agent(env.actions, {}); else agent.nextLevel();
    }
  }
  out.complete_rate = out.complete / out.levels;
  out.semantics_rate = out.semantics / out.levels;
  out.mean_steps_first_level = out.firstLevelSteps / Math.max(1, out.firstLevelN);
  out.mean_steps_later_levels = out.laterLevelSteps / Math.max(1, out.laterLevelN);
  return out;
}

/* the harder mechanics, one suite each (see the header) */
var HARD = [["ambiguous"], ["changing-map"], ["two-stage"], ["button", "teleport"], ["button", "delayed"], ["false-goal"],
            ["multi-goal"], ["irreversible"], ["hidden-state"], ["resource"], ["hazard", "keydoor", "button", "teleport"]];
var HARD_NAMES = ["ambiguous", "changing-map", "two-stage", "button+teleport", "delayed", "false-goal", "multi-goal",
                  "irreversible", "hidden-state", "resource", "multi-mechanic"];

module.exports = { Env: Env, play: play, evaluate: evaluate, semanticsCorrect: semanticsCorrect, HARD: HARD, HARD_NAMES: HARD_NAMES,
                   COLORS: { BG: BG, WALL: WALL, AGENT: AGENT, GOAL: GOAL, HAZARD: HAZARD, KEY: KEY, DOOR: DOOR, BUTTON: BUTTON, BARRIER: BARRIER, TELE: TELE } };

if (require.main === module) {
  var args = process.argv.slice(2);
  function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
  var games = +arg("games", 30), seed = +arg("seed", 1), suite = arg("suite", "basic");
  if (suite === "hard") {
    /* each hard suite gets `games` games of 3 levels; feature names map to
       the readable suite names */
    var hard = evaluate({ games: games * HARD.length, seed: seed, suites: HARD, maxSteps: +arg("steps", 200) });
    var named = {};
    Object.keys(hard.bySuite).forEach(function (k) {
      var i = HARD.map(function (f) { return f.join("+"); }).indexOf(k), b = hard.bySuite[k];
      named[i >= 0 ? HARD_NAMES[i] : k] = { levels: b.levels, complete_rate: Math.round(b.complete / b.levels * 1000) / 1000, over: b.over,
        timeout: b.timeout, mean_steps: Math.round(b.steps / b.levels * 10) / 10, semantics: Math.round(b.semantics / b.levels * 1000) / 1000 };
    });
    var rep = { note: "synthetic environments with harder mechanics; not an ARC-AGI-3 score", complete_rate: hard.complete_rate,
                over: hard.over, timeout: hard.timeout, semantics_rate: hard.semantics_rate, levels: hard.levels, bySuite: named };
    var outH = arg("out", "");
    if (outH) require("fs").writeFileSync(outH, JSON.stringify(rep, null, 2));
    console.log(JSON.stringify(rep, null, 1));
    process.exit(0);
  }
  var withT = evaluate({ games: games, seed: seed });
  var noT = evaluate({ games: games, seed: seed, noTransfer: true });
  var report = { note: "synthetic environments; not an ARC-AGI-3 score", with_transfer: withT, without_transfer: noT };
  var out = arg("out", "");
  if (out) require("fs").writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ with_transfer: { complete_rate: withT.complete_rate, over: withT.over, timeout: withT.timeout,
    semantics_rate: withT.semantics_rate, steps_first: withT.mean_steps_first_level, steps_later: withT.mean_steps_later_levels, bySuite: withT.bySuite },
    without_transfer: { complete_rate: noT.complete_rate, steps_first: noT.mean_steps_first_level, steps_later: noT.mean_steps_later_levels } }, null, 1));
}
