/* CELL4 ARC-AGI-3 adapter: an interactive world model over the reasoning kernel.
 *
 * ARC-AGI-3 is a game, not a grid-to-grid function: the agent sees a frame,
 * acts, sees the next frame, and must discover what its actions do, what the
 * objects are, what hurts, and what the goal is. The static ARC solver does
 * not apply. What does apply is the kernel's loop:
 *
 *   PERCEIVE   frame -> entities (colour components with shape, bbox)
 *   ABSTRACT   (state_t, action, state_t+1) -> delta: which entity moved by
 *              how much, what appeared, vanished, changed colour, whether the
 *              level completed or the game ended
 *   PROPOSE    rules: action -> displacement of the controllable entity;
 *              contact(colour) -> effect; colour is a hazard; colour is a goal
 *   SIMULATE   predict the next state under the current rules
 *   RESIDUAL   predicted vs. observed delta
 *   DIAGNOSE   a move that did not happen: what was in the way? an
 *              unexpected jump: was it a teleport through the contacted colour?
 *   REPAIR     add the condition ("moves right unless the target cell is
 *              colour 5"), never just overwrite the rule
 *   STAGE      one observation = tentative; repeated = candidate; survived a
 *              situation where it could have failed = persistent
 *              (kernel.stageOf / ruleConfidence)
 *   ACT        utility(a) = goal progress + information gain - risk - cost,
 *              with the information term weighted by how uncertain the model
 *              still is: explore while ambiguous, exploit once confident
 *   COMPRESS   between levels keep only coordinate-free knowledge: action
 *              semantics, which colour is the agent, blockers, hazards, goal
 *              colours, contact effects. Positions and layouts are dropped.
 *              The next level starts from these as candidate (not certain)
 *              rules, so they can still be contradicted and revised.
 *
 * The environment interface is minimal and generic: frames are integer
 * grids, actions are opaque identifiers, the only reward signals are "level
 * complete" and "game over". Nothing here knows any particular game.
 */
(function (root) {
  "use strict";

  var K = root.C4ReasonKernel;
  if (!K && typeof require === "function") { try { K = require("./c4-reason-kernel.js"); } catch (e) { K = null; } }

  /* --------------------------------------------------------------- perceive */

  function background(g) {
    var cnt = {}, best = 0, bn = -1, r, c;
    for (r = 0; r < g.length; r++) for (c = 0; c < g[0].length; c++) cnt[g[r][c]] = (cnt[g[r][c]] || 0) + 1;
    for (var k in cnt) if (cnt[k] > bn || (cnt[k] === bn && +k < best)) { bn = cnt[k]; best = +k; }
    return best;
  }

  function perceive(g, bg) {
    if (bg === undefined) bg = background(g);
    var h = g.length, w = g[0].length, seen = new Uint8Array(h * w), ents = [], r, c;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      if (seen[r * w + c] || g[r][c] === bg) continue;
      var col = g[r][c], st = [[r, c]], cells = [], r0 = r, r1 = r, c0 = c, c1 = c;
      seen[r * w + c] = 1;
      while (st.length) {
        var p = st.pop(); cells.push(p);
        if (p[0] < r0) r0 = p[0]; if (p[0] > r1) r1 = p[0]; if (p[1] < c0) c0 = p[1]; if (p[1] > c1) c1 = p[1];
        var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var i = 0; i < 4; i++) {
          var y = p[0] + nb[i][0], x = p[1] + nb[i][1];
          if (y < 0 || y >= h || x < 0 || x >= w || seen[y * w + x] || g[y][x] !== col) continue;
          seen[y * w + x] = 1; st.push([y, x]);
        }
      }
      var shape = cells.map(function (q) { return (q[0] - r0) + "," + (q[1] - c0); }).sort().join(";");
      ents.push({ color: col, cells: cells, r0: r0, c0: c0, r1: r1, c1: c1, size: cells.length, shape: shape });
    }
    return { h: h, w: w, bg: bg, ents: ents, grid: g };
  }

  /* ---------------------------------------------------------------- abstract */

  /* Delta between consecutive frames, as entity events. */
  function delta(p0, p1) {
    var ev = { moves: [], appeared: [], vanished: [], recolored: [], changed: 0 }, r, c;
    for (r = 0; r < p0.h; r++) for (c = 0; c < p0.w; c++) if (p0.grid[r][c] !== p1.grid[r][c]) ev.changed++;
    var used = new Uint8Array(p1.ents.length), i, j;
    for (i = 0; i < p0.ents.length; i++) {
      var a = p0.ents[i], best = -1, bd = Infinity;
      for (j = 0; j < p1.ents.length; j++) {
        var b = p1.ents[j];
        if (used[j] || b.color !== a.color || b.shape !== a.shape) continue;
        var d = Math.abs(b.r0 - a.r0) + Math.abs(b.c0 - a.c0);
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) {
        used[best] = 1;
        if (bd) ev.moves.push({ color: a.color, shape: a.shape, dr: p1.ents[best].r0 - a.r0, dc: p1.ents[best].c0 - a.c0,
                                from: [a.r0, a.c0], to: [p1.ents[best].r0, p1.ents[best].c0] });
      } else ev.vanished.push({ color: a.color, size: a.size, at: [a.r0, a.c0] });
    }
    for (j = 0; j < p1.ents.length; j++) if (!used[j]) ev.appeared.push({ color: p1.ents[j].color, size: p1.ents[j].size, at: [p1.ents[j].r0, p1.ents[j].c0] });
    /* vanished + appeared at the same place with the same size: a recolour */
    ev.vanished = ev.vanished.filter(function (v) {
      for (var k = 0; k < ev.appeared.length; k++) {
        var ap = ev.appeared[k];
        if (ap.at[0] === v.at[0] && ap.at[1] === v.at[1] && ap.size === v.size) {
          ev.recolored.push({ from: v.color, to: ap.color, at: v.at });
          ev.appeared.splice(k, 1);
          return false;
        }
      }
      return true;
    });
    return ev;
  }

  function key(a) { return typeof a === "object" ? JSON.stringify(a) : String(a); }

  /* -------------------------------------------------------------- the model */

  function Counter() { this.confirm = 0; this.contradict = 0; this.challenged = 0; }
  Counter.prototype.stage = function () { return K.stageOf(this.confirm, this.contradict, this.challenged); };
  Counter.prototype.conf = function () { return K.ruleConfidence(this.confirm, this.contradict, this.challenged); };

  function WorldModel(actions, prior) {
    this.actions = actions.slice();
    this.agentVotes = {};            /* colour -> evidence it is the controllable entity */
    this.actionModels = {};          /* action -> { dispKey -> Counter, rule: Hypothesis } */
    this.blockers = {};              /* colour -> Counter */
    this.hazards = {};               /* colour -> Counter */
    this.goals = {};                 /* colour -> Counter */
    this.contacts = {};              /* colour -> { effectKey -> Counter } */
    this.entered = {};               /* colours the agent has actually moved onto */
    this.transitions = 0;
    this.repairs = [];               /* lineage of rule repairs */
    this.contradictions = 0;
    this.uncertainty = {};
    var i;
    for (i = 0; i < actions.length; i++) this.actionModels[key(actions[i])] = { disp: {}, noop: new Counter() };
    if (prior) this.loadPrior(prior);
  }

  WorldModel.prototype.agentColor = function () {
    var best = null, bn = 0, k;
    for (k in this.agentVotes) if (this.agentVotes[k] > bn) { bn = this.agentVotes[k]; best = +k; }
    return bn >= 1 ? best : null;
  };

  WorldModel.prototype.agentEntity = function (p) {
    var ac = this.agentColor();
    if (ac === null) return null;
    var list = p.ents.filter(function (e) { return e.color === ac; });
    return list.length === 1 ? list[0] : null;
  };

  /* The displacement hypothesis currently favoured for action a, or null. */
  WorldModel.prototype.actionRule = function (a) {
    var m = this.actionModels[key(a)], best = null, bc = -1, k;
    if (!m) return null;
    for (k in m.disp) {
      var ct = m.disp[k], s = ct.confirm - 2 * ct.contradict;
      if (s > bc) { bc = s; best = k; }
    }
    if (best === null || m.disp[best].stage() === "retired") return null;
    var d = best.split(",").map(Number);
    return { dr: d[0], dc: d[1], counter: m.disp[best], stage: m.disp[best].stage(), conf: m.disp[best].conf() };
  };

  function counterOf(map, k) { return map[k] || (map[k] = new Counter()); }

  function cellColor(p, r, c) { return (r < 0 || r >= p.h || c < 0 || c >= p.w) ? -1 : p.grid[r][c]; }

  /* Colours the agent's cells would land on after (dr, dc). */
  function landing(p, ent, dr, dc) {
    var out = [], i;
    for (i = 0; i < ent.cells.length; i++) {
      var col = cellColor(p, ent.cells[i][0] + dr, ent.cells[i][1] + dc);
      if (col !== ent.color && out.indexOf(col) < 0) out.push(col);
    }
    return out;
  }

  /* SIMULATE: what the model expects action a to do in perceived state p. */
  WorldModel.prototype.predict = function (p, a) {
    var ent = this.agentEntity(p), rule = this.actionRule(a);
    if (!ent || !rule) return { known: false };
    var land = landing(p, ent, rule.dr, rule.dc), self = this;
    var blocked = land.some(function (c) { return c === -1 || (self.blockers[c] && self.blockers[c].stage() !== "retired"); });
    var pos = blocked ? [ent.r0, ent.c0] : [ent.r0 + rule.dr, ent.c0 + rule.dc];
    var contact = blocked ? [] : land.filter(function (c) { return c !== p.bg; });
    return { known: true, pos: pos, blocked: blocked, contact: contact, rule: rule };
  };

  /* One transition: learn from it. Returns the structured residual of the
     model's prediction against what actually happened. */
  WorldModel.prototype.learn = function (p0, a, p1, info) {
    info = info || {};
    this.transitions++;
    var ev = delta(p0, p1), am = this.actionModels[key(a)], self = this;
    if (!am) am = this.actionModels[key(a)] = { disp: {}, noop: new Counter() };
    var pred = this.predict(p0, a);
    /* agent identification: a single entity that moves in response to an
       action is evidence of control; entities that move on their own are
       told apart because their motion does not depend on the action */
    if (ev.moves.length === 1) this.agentVotes[ev.moves[0].color] = (this.agentVotes[ev.moves[0].color] || 0) + 1;
    var ent0 = this.agentEntity(p0), ac = this.agentColor();
    var residual = { predicted: pred.known ? pred.pos : null, observed: null, kind: "none" };
    if (ent0 === null) return residual;
    var mv = ev.moves.filter(function (m) { return m.color === ac; })[0];
    var vanishedAgent = ev.vanished.some(function (v) { return v.color === ac; });
    var ent1 = this.agentEntity(p1);
    var d = mv ? [mv.dr, mv.dc] : (ent1 ? [ent1.r0 - ent0.r0, ent1.c0 - ent0.c0] : null);
    residual.observed = ent1 ? [ent1.r0, ent1.c0] : null;

    /* contact: what the agent entered, read from the frame before */
    var contact = [];
    if (d && (d[0] || d[1])) contact = landing(p0, ent0, d[0], d[1]).filter(function (c) { return c !== p0.bg && c !== -1; });

    /* teleport: displacement differs from the action's rule and the agent
       now sits where an entity of a contacted colour used to be elsewhere */
    var rule = this.actionRule(a), teleported = false;
    /* the agent vanished (the frame after a game over has none): attribute
       the contact through the action's own rule */
    if (!ent1 && rule && (vanishedAgent || info.gameOver))
      contact = landing(p0, ent0, rule.dr, rule.dc).filter(function (c) { return c !== p0.bg && c !== -1; });
    if (rule && d && (d[0] !== rule.dr || d[1] !== rule.dc) && (d[0] || d[1])) {
      var viaLand = landing(p0, ent0, rule.dr, rule.dc).filter(function (c) { return c !== p0.bg && c !== -1; });
      if (viaLand.length && Math.abs(d[0]) + Math.abs(d[1]) > Math.abs(rule.dr) + Math.abs(rule.dc) + 1) {
        teleported = true;
        contact = viaLand;
      }
    }

    /* what the agent moved onto is passable, whatever the majority colour
       of the frame suggested */
    if (d && (d[0] || d[1]) && !teleported)
      landing(p0, ent0, d[0], d[1]).forEach(function (c) { if (c !== -1) self.entered[c] = (self.entered[c] || 0) + 1; });
    /* action semantics with residual-driven repair */
    if (d && !teleported) {
      var dk = d[0] + "," + d[1];
      if (d[0] || d[1]) {
        counterOf(am.disp, dk).confirm++;
        /* moved next to something it could have hit: the rule was challenged */
        if (ent0 && landing(p0, ent0, d[0] * 2, d[1] * 2).some(function (c) { return c !== p0.bg; })) counterOf(am.disp, dk).challenged++;
        for (var ok in am.disp) if (ok !== dk && am.disp[ok].confirm && !this.blockedExplains(p0, ent0, ok)) am.disp[ok].contradict++;
      } else if (rule) {
        /* DIAGNOSE a non-move: what was in the way? */
        /* in the way = anything the agent has never been seen to enter
           (the frame edge included) */
        var inWay = landing(p0, ent0, rule.dr, rule.dc).filter(function (c) { return !self.entered[c]; });
        if (inWay.length) {
          inWay.forEach(function (c) {
            if (c === -1) return;
            var b = counterOf(self.blockers, c);
            b.confirm++;
            if (b.confirm === 1) self.repairs.push({ rule: "action " + key(a) + " moves " + rule.dr + "," + rule.dc,
              mutation: "add_condition", condition: "target cell is not colour " + c,
              why: "predicted move, observed none, colour " + c + " in the way" });
          });
          rule.counter.challenged++;
          residual.kind = "blocked_explained";
        } else {
          rule.counter.contradict++;
          this.contradictions++;
          residual.kind = "contradiction";
        }
      } else am.noop.confirm++;
    }
    if (pred.known && pred.blocked && d && (d[0] || d[1])) {
      /* predicted blocked but it moved: the blocker hypothesis is wrong */
      pred.contact.concat(landing(p0, ent0, pred.rule.dr, pred.rule.dc)).forEach(function (c) {
        if (self.blockers[c]) { self.blockers[c].contradict++; self.contradictions++; residual.kind = "blocker_contradicted"; }
      });
    }

    /* contact effects, hazards, goals */
    var effect = { vanish: ev.vanished.filter(function (v) { return v.color !== ac; }).map(function (v) { return v.color; }).sort(),
                   recolor: ev.recolored.map(function (r) { return r.from + ">" + r.to; }).sort(),
                   complete: !!info.levelComplete, over: !!info.gameOver || vanishedAgent, teleport: teleported };
    var ek = JSON.stringify(effect);
    contact.forEach(function (c) {
      var m = self.contacts[c] || (self.contacts[c] = {});
      for (var k in m) if (k !== ek && m[k].confirm) m[k].contradict++;
      counterOf(m, ek).confirm++;
      if (effect.complete) counterOf(self.goals, c).confirm++; else counterOf(self.goals, c).contradict++;
      if (effect.over) counterOf(self.hazards, c).confirm++; else if (self.hazards[c]) self.hazards[c].contradict++;
    });
    if (effect.complete && !contact.length && ent1) {
      /* the goal was the cell the agent now stands on in the previous frame */
      ent1.cells.forEach(function (q) { var c = cellColor(p0, q[0], q[1]); if (c !== p0.bg && c !== ac && c !== -1) counterOf(self.goals, c).confirm++; });
    }
    residual.contact = contact;
    residual.effect = effect;
    return residual;
  };

  WorldModel.prototype.blockedExplains = function (p0, ent0, dk) {
    var d = dk.split(",").map(Number), self = this;
    return landing(p0, ent0, d[0], d[1]).some(function (c) { return c === -1 || (self.blockers[c] && self.blockers[c].confirm); });
  };

  /* Uncertainty in [0,1] per action and for the goal. */
  WorldModel.prototype.actionUncertainty = function (a) {
    var r = this.actionRule(a);
    /* an action repeatedly seen to do nothing carries no further information */
    if (!r) return this.actionModels[key(a)] && this.actionModels[key(a)].noop.confirm >= 2 ? 0.0 : 1.0;
    return 1 - r.conf;
  };
  /* A colour whose cells cover every border row and column is scene
     structure (a frame), not an object: a weak perceptual prior that it is
     neither goal nor hazard. It is only a prior; contact evidence overrides. */
  function framing(p) {
    var out = {}, r, c, cols = {};
    for (c = 0; c < p.w; c++) { cols[p.grid[0][c]] = (cols[p.grid[0][c]] || 0) + 1; cols[p.grid[p.h - 1][c]] = (cols[p.grid[p.h - 1][c]] || 0) + 1; }
    for (r = 1; r < p.h - 1; r++) { cols[p.grid[r][0]] = (cols[p.grid[r][0]] || 0) + 1; cols[p.grid[r][p.w - 1]] = (cols[p.grid[r][p.w - 1]] || 0) + 1; }
    var per = 2 * p.w + 2 * (p.h - 2);
    for (var k in cols) if (cols[k] >= 0.9 * per && +k !== p.bg) out[k] = 1;
    return out;
  }
  WorldModel.prototype.untestedHazard = function (p, c) { return framing(p)[c] ? 0.02 : 0.15; };

  WorldModel.prototype.goalHypotheses = function (p) {
    var out = [], present = {}, ac = this.agentColor(), i, self = this, frame = framing(p);
    for (i = 0; i < p.ents.length; i++) present[p.ents[i].color] = 1;
    Object.keys(present).forEach(function (c) {
      c = +c;
      if (c === ac) return;
      var g = self.goals[c], hz = self.hazards[c];
      var prior = g ? (g.confirm + 1) / (g.confirm + g.contradict + 2) : (frame[c] ? 0.05 : 0.5);
      if (hz && hz.stage() !== "retired" && hz.confirm) prior *= 0.1;
      if (self.blockers[c] && self.blockers[c].confirm && !(g && g.confirm)) prior *= 0.2;
      out.push({ color: c, p: prior, tested: !!g });
    });
    return out.sort(function (a, b) { return (b.p - a.p) || (a.color - b.color); });
  };

  /* ----------------------------------------------------------------- compress */

  WorldModel.prototype.compress = function () {
    var self = this, out = { agent: this.agentColor(), actions: {}, blockers: [], hazards: [], goals: [], contacts: {} };
    this.actions.forEach(function (a) {
      var r = self.actionRule(a);
      if (r && r.stage !== "retired" && r.counter.confirm >= 2) out.actions[key(a)] = { dr: r.dr, dc: r.dc, stage: r.stage };
    });
    Object.keys(this.blockers).forEach(function (c) { if (self.blockers[c].stage() !== "retired") out.blockers.push(+c); });
    Object.keys(this.hazards).forEach(function (c) { if (self.hazards[c].stage() !== "retired" && self.hazards[c].confirm) out.hazards.push(+c); });
    Object.keys(this.goals).forEach(function (c) { if (self.goals[c].confirm && self.goals[c].confirm >= self.goals[c].contradict / 3) out.goals.push(+c); });
    Object.keys(this.contacts).forEach(function (c) {
      var best = null, bn = 0;
      for (var k in self.contacts[c]) if (self.contacts[c][k].confirm > bn) { bn = self.contacts[c][k].confirm; best = k; }
      if (best) out.contacts[c] = JSON.parse(best);
    });
    return out;   /* no coordinates, no layout: only transferable mechanics */
  };

  /* Priors enter as CANDIDATE rules (two confirmations, never persistent), so
     the new level's evidence can still retire them. */
  WorldModel.prototype.loadPrior = function (pr) {
    var self = this;
    if (pr.agent !== null && pr.agent !== undefined) this.agentVotes[pr.agent] = 2;
    Object.keys(pr.actions || {}).forEach(function (a) {
      var m = self.actionModels[a] || (self.actionModels[a] = { disp: {}, noop: new Counter() });
      counterOf(m.disp, pr.actions[a].dr + "," + pr.actions[a].dc).confirm = 2;
    });
    (pr.blockers || []).forEach(function (c) { counterOf(self.blockers, c).confirm = 2; });
    (pr.hazards || []).forEach(function (c) { counterOf(self.hazards, c).confirm = 2; });
    (pr.goals || []).forEach(function (c) { counterOf(self.goals, c).confirm = 2; });
  };

  /* ----------------------------------------------------------------- planning */

  WorldModel.prototype.passable = function (p, r, c, ent) {
    var col = cellColor(p, r, c);
    if (col === -1) return false;
    if (col === p.bg || col === ent.color) return true;
    if (this.blockers[col] && this.blockers[col].stage() !== "retired") return false;
    if (this.hazards[col] && this.hazards[col].confirm && this.hazards[col].stage() !== "retired") return false;
    return true;
  };

  /* Breadth-first search over agent positions using learned action rules.
     Returns [firstAction, pathLength] toward any cell of colour ``target``. */
  WorldModel.prototype.plan = function (p, target, maxNodes) {
    var ent = this.agentEntity(p);
    if (!ent) return null;
    var self = this, moves = [];
    this.actions.forEach(function (a) { var r = self.actionRule(a); if (r && (r.dr || r.dc)) moves.push([a, r.dr, r.dc]); });
    if (!moves.length) return null;
    var start = [ent.r0, ent.c0], q = [[start[0], start[1], null, 0]], seen = {}, qi = 0;
    seen[start[0] + "," + start[1]] = 1;
    maxNodes = maxNodes || 4000;
    while (qi < q.length && qi < maxNodes) {
      var cur = q[qi++], i;
      for (i = 0; i < moves.length; i++) {
        var nr = cur[0] + moves[i][1], nc = cur[1] + moves[i][2], k = nr + "," + nc;
        if (seen[k]) continue;
        var dr = nr - ent.r0, dc = nc - ent.c0, ok = true, hit = false, j;
        for (j = 0; j < ent.cells.length; j++) {
          var rr = ent.cells[j][0] + dr, cc = ent.cells[j][1] + dc;
          if (cellColor(p, rr, cc) === target && !(self.blockers[target] && self.blockers[target].confirm)) hit = true;
          else if (!self.passable(p, rr, cc, ent)) { ok = false; break; }
        }
        if (!ok) continue;
        var first = cur[2] === null ? moves[i][0] : cur[2];
        if (hit) return [first, cur[3] + 1];
        seen[k] = 1;
        q.push([nr, nc, first, cur[3] + 1]);
      }
    }
    return null;
  };

  /* ------------------------------------------------------------------ agent */

  /* Completing a level and losing it are the two outcomes; they are valued
     symmetrically, so a contact is worth testing when P(goal) > P(hazard). */
  var GOAL_VALUE = 2.0, HAZARD_COST = 2.0;
  function ent0Known(agent) { return !!(agent.prev && agent.model.agentEntity(agent.prev)); }

  function Agent(actions, opts) {
    opts = opts || {};
    this.actions = actions.slice();
    this.model = new WorldModel(actions, opts.prior || null);
    this.prev = null;
    this.lastAction = null;
    this.visits = {};
    this.futile = {};
    this.trace = [];
    this.actionCost = opts.actionCost === undefined ? 0.05 : opts.actionCost;
    this.step = 0;
  }

  /* Feed the frame that resulted from the last action. */
  function gridKey(g) { return g.map(function (r) { return r.join(""); }).join("|"); }

  Agent.prototype.observe = function (grid, info) {
    var p = perceive(grid, this.prev ? this.prev.bg : undefined);
    var res = null;
    if (this.prev && this.lastAction !== null) {
      var k0 = gridKey(this.prev.grid);
      if (k0 === gridKey(grid)) { var fk = k0 + "|" + key(this.lastAction); this.futile[fk] = (this.futile[fk] || 0) + 1; }
    }
    if (this.prev && this.lastAction !== null) res = this.model.learn(this.prev, this.lastAction, p, info);
    this.prev = p;
    var ent = this.model.agentEntity(p);
    if (ent) { var k = ent.r0 + "," + ent.c0; this.visits[k] = (this.visits[k] || 0) + 1; }
    return res;
  };

  /* Model-level uncertainty: mean over action semantics and the goal. */
  Agent.prototype.uncertainty = function () {
    var self = this, u = 0;
    this.actions.forEach(function (a) { u += self.model.actionUncertainty(a); });
    u /= Math.max(1, this.actions.length);
    var goals = this.prev ? this.model.goalHypotheses(this.prev) : [];
    var gu = goals.length && goals[0].p > 0.6 ? 1 - goals[0].p : 1;
    return 0.5 * u + 0.5 * gu;
  };

  Agent.prototype.act = function () {
    var p = this.prev, self = this, i;
    if (!p) return this.actions[0];
    var beta = this.uncertainty();
    var goals = this.model.goalHypotheses(p);
    /* exploit: a confident goal with a planned path */
    var plan = null;
    if (goals.length && goals[0].p > 0.6) plan = this.model.plan(p, goals[0].color);
    /* no confident goal: head for the most promising untested candidate
       (expected goal value minus expected hazard cost), but only once the
       action semantics are no longer the main unknown */
    var explorePlan = null;
    if (!plan && ent0Known(this) && beta < 0.8) {
      var cands = goals.filter(function (g) {
        return !g.tested && !(self.model.blockers[g.color] && self.model.blockers[g.color].confirm);
      }).map(function (g) {
        return { color: g.color, v: g.p - HAZARD_COST * self.model.untestedHazard(p, g.color) * 0.2 };
      }).sort(function (a, b) { return (b.v - a.v) || (a.color - b.color); });
      for (i = 0; i < cands.length && !explorePlan; i++) if (cands[i].v > 0) explorePlan = this.model.plan(p, cands[i].color);
    }
    var stateKey = gridKey(p.grid);
    var goalP = {};
    goals.forEach(function (g) { goalP[g.color] = g.p; });
    var ent = this.model.agentEntity(p), best = null, bu = -Infinity, scored = [];
    for (i = 0; i < this.actions.length; i++) {
      var a = this.actions[i], pred = this.model.predict(p, a);
      var gp = 0, ig = this.model.actionUncertainty(a), risk = 0, nov = 0;
      if (plan && key(plan[0]) === key(a)) gp = 1.0;
      else if (explorePlan && key(explorePlan[0]) === key(a)) gp = 0.5;
      if (pred.known) {
        if (pred.blocked) ig *= 0.3;
        pred.contact.forEach(function (c) {
          var hz = self.model.hazards[c], g = self.model.goals[c];
          /* an untested colour might be a hazard: a prior of 0.15 makes
             contact with it worth testing only once safer exploration
             (novel cells, unknown actions) has run out */
          var pHaz = hz ? (hz.confirm ? hz.conf() : 0) : (g ? 0 : self.model.untestedHazard(p, c));
          risk += HAZARD_COST * pHaz;
          if (!g && !(hz && hz.confirm)) ig += 0.4;           /* untested contact: informative */
          /* expected goal progress of touching c is P(c is the goal) */
          var gh = goalP[c];
          if (gh !== undefined) gp = Math.max(gp, gh);
        });
        var pk = pred.pos[0] + "," + pred.pos[1];
        nov = 0.3 / (1 + (this.visits[pk] || 0));
        if (pred.blocked && pred.rule.stage !== "tentative") risk += 0.3;   /* a known wasted move */
      }
      /* futility: this exact action already changed nothing from this exact
         state -- repeating it cannot teach or achieve anything */
      var fk = stateKey + "|" + key(a);
      if (this.futile[fk]) { risk += 0.5 * this.futile[fk]; ig = 0; }
      var u = GOAL_VALUE * gp * (1 - 0.5 * beta) + beta * (ig + nov) - risk - this.actionCost;
      scored.push({ action: a, u: Math.round(u * 1000) / 1000, gp: gp, ig: Math.round(ig * 100) / 100, risk: risk });
      if (u > bu) { bu = u; best = a; }
    }
    this.trace.push({ step: this.step++, beta: Math.round(beta * 100) / 100, chosen: best, options: scored });
    this.lastAction = best;
    return best;
  };

  /* Level boundary: keep mechanics, drop layout. */
  Agent.prototype.nextLevel = function () {
    var prior = this.model.compress();
    this.model = new WorldModel(this.actions, prior);
    this.prev = null; this.lastAction = null; this.visits = {}; this.futile = {};
    return prior;
  };

  /* A world model as a kernel hypothesis, so its confidence is derived the
     same way as everywhere else. */
  WorldModel.prototype.confidence = function () {
    var self = this, pass = 0, total = 0;
    this.actions.forEach(function (a) { var r = self.actionRule(a); total++; if (r && r.stage !== "tentative") pass++; });
    return K.calibrate({ verifierPass: pass, verifierTotal: total, contradictions: Math.min(3, this.contradictions),
                         knowledgeCompleteness: Object.keys(this.goals).length ? 1 : 0.5 });
  };

  var W = { perceive: perceive, delta: delta, background: background, WorldModel: WorldModel, Agent: Agent };
  root.C4Arc3World = W;
  if (typeof module !== "undefined" && module.exports) module.exports = W;
})(typeof window !== "undefined" ? window : globalThis);
