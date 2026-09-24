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

  /* The background is the most common colour of the PLAYING AREA: when one
     colour frames the border (a wall around the level), border cells are
     left out of the count, so a thick frame cannot outvote the floor. */
  function background(g) {
    var cnt = {}, best = 0, bn = -1, r, c, h = g.length, w = g[0].length;
    var border = {}, per = 0;
    for (c = 0; c < w; c++) { border[g[0][c]] = (border[g[0][c]] || 0) + 1; border[g[h - 1][c]] = (border[g[h - 1][c]] || 0) + 1; per += 2; }
    for (r = 1; r < h - 1; r++) { border[g[r][0]] = (border[g[r][0]] || 0) + 1; border[g[r][w - 1]] = (border[g[r][w - 1]] || 0) + 1; per += 2; }
    var framed = h >= 5 && w >= 5 && Object.keys(border).some(function (k) { return border[k] >= 0.9 * per; });
    for (r = framed ? 1 : 0; r < (framed ? h - 1 : h); r++) for (c = framed ? 1 : 0; c < (framed ? w - 1 : w); c++) cnt[g[r][c]] = (cnt[g[r][c]] || 0) + 1;
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
      } else {
        /* reshaped, not gone: an unmatched same-colour entity that keeps at
           least half of its cells (a region the agent stepped into or out
           of changes shape without disappearing) */
        var cellSet = {}, k2;
        for (k2 = 0; k2 < a.cells.length; k2++) cellSet[a.cells[k2][0] * 4096 + a.cells[k2][1]] = 1;
        var reshaped = -1;
        for (j = 0; j < p1.ents.length && reshaped < 0; j++) {
          var b2 = p1.ents[j];
          if (used[j] || b2.color !== a.color) continue;
          var shared = 0;
          for (k2 = 0; k2 < b2.cells.length; k2++) if (cellSet[b2.cells[k2][0] * 4096 + b2.cells[k2][1]]) shared++;
          if (shared * 2 >= a.cells.length && a.cells.length > 1) reshaped = j;
        }
        if (reshaped >= 0) used[reshaped] = 1;
        else ev.vanished.push({ color: a.color, size: a.size, at: [a.r0, a.c0] });
      }
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
    /* causal structure beyond single contacts */
    this.effects = {};               /* trigger ("enter:c" | "bump:c") -> effectKey -> {counter, removes, pre, lag} */
    this.inventory = {};             /* colours collected this level (vanished on contact) -- hidden state */
    this.recent = [];                /* recent silent contacts, for delayed attribution */
    this.goalTests = [];             /* failed goal contacts {color, present} */
    this.goalWins = [];              /* completions {color, present} */
    this.harms = {};                 /* colour -> Counter: contact destroyed the goal without completing */
    this.blockTests = {};            /* colour -> inventory keys under which it blocked */
    this.prereq = {};                /* goal colour -> colours that must be gone first (from a prior) */
    this.teleMap = {};               /* entry cell -> observed landing cell (this level) */
    this.steps = 0;
    var i;
    for (i = 0; i < actions.length; i++) this.actionModels[key(actions[i])] = { disp: {}, noop: new Counter() };
    if (prior) this.loadPrior(prior);
  }
  WorldModel.prototype.invKey = function () { return Object.keys(this.inventory).sort().join(","); };
  function presentColors(p, except) {
    var s = {};
    p.ents.forEach(function (e) { if (except.indexOf(e.color) < 0) s[e.color] = 1; });
    return s;
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
        /* where this entry cell sends the agent, for planning (coordinates:
           this level only, dropped by compress) */
        this.teleMap[(ent0.r0 + rule.dr) + "," + (ent0.c0 + rule.dc)] = [ent0.r0 + d[0], ent0.c0 + d[1]];
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
    var present0 = presentColors(p0, [ac, p0.bg]), frame0 = framing(p0);
    /* the colours of which NO cell remains: collected or removed */
    var gone = Object.keys(present0).map(Number).filter(function (c) { return !p1.ents.some(function (e) { return e.color === c; }); });
    contact.forEach(function (c) {
      var m = self.contacts[c] || (self.contacts[c] = {});
      for (var k in m) if (k !== ek && m[k].confirm) m[k].contradict++;
      counterOf(m, ek).confirm++;
      if (effect.complete) counterOf(self.goals, c).confirm++; else counterOf(self.goals, c).contradict++;
      if (effect.over) counterOf(self.hazards, c).confirm++; else if (self.hazards[c]) self.hazards[c].contradict++;
      /* a goal test is judged in the hidden state it ran in: the colours
         present then (a later change can make a failed test stale) */
      if (effect.complete) self.goalWins.push({ color: c, present: present0 });
      else if (!effect.over) self.goalTests.push({ color: c, present: present0, steps: self.steps });
    });
    if (effect.complete && !contact.length && ent1) {
      /* the goal was the cell the agent now stands on in the previous frame */
      ent1.cells.forEach(function (q) { var c = cellColor(p0, q[0], q[1]); if (c !== p0.bg && c !== ac && c !== -1) { counterOf(self.goals, c).confirm++; self.goalWins.push({ color: c, present: present0 }); } });
    }
    this.learnCausal(p0, a, ev, contact, rule, ent0, d, teleported, effect, gone, present0, frame0);
    residual.contact = contact;
    residual.effect = effect;
    return residual;
  };

  /* Causal structure beyond "what I stepped on":
       bump effects     moving INTO something that stays put and changes it
                        ("bump the door while carrying the key")
       preconditions    the hidden inventory at the time, intersected over
                        observations (a conjunctive version space)
       delayed effects  a change nobody touched is attributed to a recent
                        silent contact, with its lag
       harms            a contact that destroys every goal cell without
                        completing is irreversible damage, avoided like a
                        hazard */
  WorldModel.prototype.learnCausal = function (p0, a, ev, contact, rule, ent0, d, teleported, effect, gone, present0, frame0) {
    var self = this, ac = this.agentColor();
    this.steps++;
    var moved = !!(d && (d[0] || d[1]));
    var bumped = [];
    if (!moved && rule && ent0) bumped = landing(p0, ent0, rule.dr, rule.dc).filter(function (c) { return c !== -1 && c !== p0.bg; });
    bumped.forEach(function (b) { (self.blockTests[b] || (self.blockTests[b] = [])).push(self.invKey()); });
    /* what changed apart from the agent: colours removed (all or part) */
    var removed = {};
    ev.vanished.forEach(function (v) { if (v.color !== ac) removed[v.color] = 1; });
    ev.recolored.forEach(function (r) { removed[r.from] = 1; });
    var collectedNow = contact.filter(function (c) { return removed[c]; });
    var others = Object.keys(removed).map(Number).filter(function (c) { return contact.indexOf(c) < 0; });
    function record(trigger, removes, lag) {
      if (!removes.length) return;
      var m = self.effects[trigger] || (self.effects[trigger] = {});
      var k = removes.slice().sort().join(",") + (lag ? "@" + lag : "");
      var e = m[k] || (m[k] = { counter: new Counter(), removes: removes.slice(), pre: null, lag: lag || 0 });
      e.counter.confirm++;
      var inv = Object.keys(self.inventory).map(Number);
      e.pre = e.pre === null ? inv : e.pre.filter(function (c) { return inv.indexOf(c) >= 0; });
    }
    var silent = true;
    if (contact.length) {
      contact.forEach(function (c) { record("enter:" + c, others, 0); });
      if (others.length) silent = false;
    } else if (bumped.length && others.length) {
      bumped.forEach(function (b) { record("bump:" + b, others, 0); });
      silent = false;
    } else if (!contact.length && !bumped.length && others.length && !effect.complete) {
      /* nobody touched it: the most recent silent contact within 6 steps */
      for (var i = this.recent.length - 1; i >= 0; i--) {
        var r = this.recent[i], lag = this.steps - r.step;
        if (lag > 6) break;
        if (r.silent) { record(r.trigger, others, lag); r.silent = false; break; }
      }
    }
    contact.forEach(function (c) { self.recent.push({ trigger: "enter:" + c, step: self.steps, silent: silent }); });
    if (this.recent.length > 12) this.recent.shift();
    /* hidden state: what the agent collected */
    collectedNow.forEach(function (c) { self.inventory[c] = 1; });
    /* irreversible harm: every cell of a goal-like colour disappeared without
       completion, and the agent did not collect it itself */
    if (!effect.complete && !effect.over) {
      var goalish = gone.filter(function (c) { return contact.indexOf(c) < 0 && !frame0[c] && (self.goals[c] ? self.goals[c].confirm > 0 : self.goalLike(c)); });
      if (goalish.length) contact.concat(bumped).forEach(function (c) { counterOf(self.harms, c).confirm++; });
    }
  };
  /* a colour is goal-like when it completed a level before (prior) or is
     the only remaining untested candidate class; used for harm detection */
  WorldModel.prototype.goalLike = function (c) { return !!(this.goals[c] && this.goals[c].confirm) || !!this.priorGoal && this.priorGoal.indexOf(c) >= 0; };

  /* Which triggers remove colour b, with what hidden-state precondition. */
  WorldModel.prototype.enablers = function (b) {
    var out = [], self = this;
    Object.keys(this.effects).forEach(function (t) {
      Object.keys(self.effects[t]).forEach(function (k) {
        var e = self.effects[t][k];
        if (e.removes.indexOf(b) >= 0 && e.counter.stage() !== "retired")
          out.push({ trigger: t, kind: t.split(":")[0], color: +t.split(":")[1], pre: e.pre || [], lag: e.lag, n: e.counter.confirm });
      });
    });
    return out.sort(function (x, y) { return (y.n - x.n) || (x.lag - y.lag); });
  };
  /* A failed goal test is STALE when a colour that was present then (other
     than the tested one) has since disappeared: the hidden state changed. */
  WorldModel.prototype.staleTests = function (p, c) {
    var now = presentColors(p, []), n = 0;
    this.goalTests.forEach(function (t) {
      if (t.color !== c) return;
      if (Object.keys(t.present).some(function (x) { return +x !== c && !now[x]; })) n++;
    });
    return n;
  };
  /* A blocker verdict is stale when the inventory changed since every test. */
  WorldModel.prototype.staleBlocker = function (b) {
    var tests = this.blockTests[b], inv = this.invKey();
    return !!(tests && tests.length && tests.indexOf(inv) < 0);
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
      /* failed tests run in a different hidden state do not count */
      var stale = g ? Math.min(g.contradict, self.staleTests(p, c)) : 0;
      var prior = g ? (g.confirm + 1) / (g.confirm + g.contradict - stale + 2) : (frame[c] ? 0.05 : 0.5);
      if (hz && hz.stage() !== "retired" && hz.confirm) prior *= 0.1;
      if (self.harms[c] && self.harms[c].confirm) prior *= 0.1;
      if (self.blockers[c] && self.blockers[c].confirm && !(g && g.confirm)) prior *= 0.2;
      /* a goal whose prerequisites are still present is not reachable as a
         goal yet (its prerequisites become subgoals) */
      var pre = (self.prereq[c] || []).filter(function (x) { return present[x]; });
      out.push({ color: c, p: prior, tested: !!g && g.contradict - stale > 0 || !!(g && g.confirm), prereq: pre, stale: stale });
    });
    return out.sort(function (a, b) { return (b.p - a.p) || (a.color - b.color); });
  };

  /* ----------------------------------------------------------------- compress */

  WorldModel.prototype.compress = function () {
    var self = this, out = { agent: this.agentColor(), actions: {}, blockers: [], hazards: [], goals: [], contacts: {} };
    this.actions.forEach(function (a) {
      var r = self.actionRule(a);
      /* seen once is carried too, as a weaker (tentative) prior: the belief
         set can still refute it, and an unknown action is worse */
      if (r && r.stage !== "retired" && r.counter.confirm >= 1) out.actions[key(a)] = { dr: r.dr, dc: r.dc, stage: r.stage, n: Math.min(2, r.counter.confirm) };
    });
    Object.keys(this.blockers).forEach(function (c) { if (self.blockers[c].stage() !== "retired") out.blockers.push(+c); });
    Object.keys(this.hazards).forEach(function (c) { if (self.hazards[c].stage() !== "retired" && self.hazards[c].confirm) out.hazards.push(+c); });
    Object.keys(this.goals).forEach(function (c) { if (self.goals[c].confirm && self.goals[c].confirm >= self.goals[c].contradict / 3) out.goals.push(+c); });
    Object.keys(this.contacts).forEach(function (c) {
      var best = null, bn = 0;
      for (var k in self.contacts[c]) if (self.contacts[c][k].confirm > bn) { bn = self.contacts[c][k].confirm; best = k; }
      if (best) out.contacts[c] = JSON.parse(best);
    });
    /* causal memory, still coordinate-free: what removes what (and under
       which hidden state), what destroys the goal, what a goal needs gone */
    out.effects = [];
    Object.keys(this.effects).forEach(function (t) {
      Object.keys(self.effects[t]).forEach(function (k) {
        var e = self.effects[t][k];
        if (e.counter.stage() !== "retired") out.effects.push({ trigger: t, removes: e.removes, pre: e.pre || [], lag: e.lag });
      });
    });
    out.harms = Object.keys(this.harms).filter(function (c) { return self.harms[c].confirm; }).map(Number);
    /* colours entered without harm: safe to cross next time */
    out.safe = Object.keys(this.entered).map(Number).filter(function (c) {
      return c !== -1 && !(self.hazards[c] && self.hazards[c].confirm) && !(self.harms[c] && self.harms[c].confirm);
    });
    out.prereq = {};
    this.goalWins.forEach(function (w) {
      /* colours present at every failed test of the goal but gone at its win */
      var fails = self.goalTests.filter(function (t) { return t.color === w.color; });
      if (!fails.length) return;
      var need = Object.keys(fails[0].present).map(Number).filter(function (x) {
        return x !== w.color && fails.every(function (f) { return f.present[x]; }) && !w.present[x];
      });
      if (need.length) out.prereq[w.color] = need;
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
      counterOf(m.disp, pr.actions[a].dr + "," + pr.actions[a].dc).confirm = pr.actions[a].n !== undefined ? pr.actions[a].n : 2;
    });
    (pr.blockers || []).forEach(function (c) { counterOf(self.blockers, c).confirm = 2; });
    (pr.hazards || []).forEach(function (c) { counterOf(self.hazards, c).confirm = 2; });
    (pr.goals || []).forEach(function (c) { counterOf(self.goals, c).confirm = 2; });
    this.priorGoal = (pr.goals || []).slice();
    (pr.effects || []).forEach(function (e) {
      var m = self.effects[e.trigger] || (self.effects[e.trigger] = {});
      var k = e.removes.slice().sort().join(",") + (e.lag ? "@" + e.lag : "");
      var rec = m[k] || (m[k] = { counter: new Counter(), removes: e.removes.slice(), pre: (e.pre || []).slice(), lag: e.lag || 0 });
      rec.counter.confirm = 2;
    });
    (pr.harms || []).forEach(function (c) { counterOf(self.harms, c).confirm = 2; });
    (pr.safe || []).forEach(function (c) { self.entered[c] = 1; });
    Object.keys(pr.contacts || {}).forEach(function (c) {
      var m = self.contacts[c] || (self.contacts[c] = {});
      counterOf(m, JSON.stringify(pr.contacts[c])).confirm = 2;
    });
    Object.keys(pr.prereq || {}).forEach(function (c) { self.prereq[c] = pr.prereq[c].slice(); });
  };
  /* Load only part of a prior: the BeliefSet's alternative models. */
  function partialPrior(pr, drop) {
    if (!pr) return null;
    var out = JSON.parse(JSON.stringify(pr));
    /* the carried-over rules stay as zero-evidence entries: under this
       hypothesis they are retired, and a matching observation revives one
       at once */
    if (drop === "actions") Object.keys(out.actions || {}).forEach(function (a) { out.actions[a].n = 0; });
    if (drop === "roles") { out.blockers = []; out.hazards = []; out.goals = []; out.harms = []; out.prereq = {}; out.effects = []; out.contacts = {}; }
    return out;
  }

  /* ----------------------------------------------------------------- planning */

  /* Stepping on x has removed every cell of a colour whose role is a goal
     or still unknown (not a blocker or hazard it could be glad to lose):
     potentially irreversible, so plans do not pass THROUGH x (x can still
     be chosen as a target). Confirmed when a goal was destroyed. */
  WorldModel.prototype.harmful = function (x) {
    if (this.harms[x] && this.harms[x].confirm) return true;
    var effs = this.effects["enter:" + x], self = this;
    if (!effs) return false;
    return Object.keys(effs).some(function (k) {
      return effs[k].removes.some(function (c) {
        if (c === x || (self.blockers[c] && self.blockers[c].confirm) || (self.hazards[c] && self.hazards[c].confirm)) return false;
        return !!(self.goals[c] && self.goals[c].confirm) || !self.goals[c] || self.goalLike(c);
      });
    });
  };
  WorldModel.prototype.passable = function (p, r, c, ent) {
    var col = cellColor(p, r, c);
    if (col === -1) return false;
    if (col === p.bg || col === ent.color) return true;
    if (this.blockers[col] && this.blockers[col].stage() !== "retired") return false;
    if (this.hazards[col] && this.hazards[col].confirm && this.hazards[col].stage() !== "retired") return false;
    if (this.harmful(col)) return false;
    return true;
  };

  /* Breadth-first search over agent positions using learned action rules.
     Returns [firstAction, pathLength] toward any cell of colour ``target``. */
  WorldModel.prototype.plan = function (p, target, maxNodes, popts) {
    var ent = this.agentEntity(p);
    if (!ent) return null;
    popts = popts || {};
    var ignore = popts.ignore || {}, bump = !!popts.bump, safe = !!popts.safe;
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
          var rr = ent.cells[j][0] + dr, cc = ent.cells[j][1] + dc, cl = cellColor(p, rr, cc);
          if (cl === target && (bump || !(self.blockers[target] && self.blockers[target].confirm))) hit = true;
          else if (!(ignore[cl] && cl !== -1) && !self.passable(p, rr, cc, ent)) { ok = false; break; }
          /* risk-averse: never cross a colour whose contact is untested */
          else if (safe && cl !== p.bg && cl !== ent.color && !self.entered[cl] && !ignore[cl]) { ok = false; break; }
        }
        if (!ok) continue;
        var first = cur[2] === null ? moves[i][0] : cur[2];
        if (hit) return [first, cur[3] + 1];
        seen[k] = 1;
        /* a cell known to teleport: the successor is where it sends the
           agent; an entry never observed has an unknown destination and is
           not planned through */
        if (!hit && self.teleports(p, nr, nc, ent)) {
          var land = self.teleMap[nr + "," + nc];
          if (!land || seen[land[0] + "," + land[1]]) continue;
          seen[land[0] + "," + land[1]] = 1;
          q.push([land[0], land[1], first, cur[3] + 1]);
          continue;
        }
        q.push([nr, nc, first, cur[3] + 1]);
      }
    }
    return null;
  };

  /* Safe-first planning: a path that crosses no untested colour when one
     exists, otherwise any path. */
  WorldModel.prototype.planSafe = function (p, target, maxNodes, popts) {
    var o = Object.assign({}, popts || {}, { safe: true });
    return this.plan(p, target, maxNodes, o) || this.plan(p, target, maxNodes, popts);
  };

  /* Does moving the agent's anchor to (r, c) enter a colour whose contact
     is known to teleport? */
  WorldModel.prototype.teleports = function (p, r, c, ent) {
    var dr = r - ent.r0, dc = c - ent.c0, self = this;
    return landing(p, ent, dr, dc).some(function (col) {
      var m = self.contacts[col];
      if (!m) return false;
      return Object.keys(m).some(function (k) { return m[k].confirm && m[k].stage() !== "retired" && JSON.parse(k).teleport; });
    });
  };

  /* Which present blocker colours stand between the agent and target: the
     plan succeeds only when that colour is treated as passable. */
  WorldModel.prototype.inTheWay = function (p, target) {
    var self = this, out = [], cols = {};
    p.ents.forEach(function (e) { if (e.color !== target && e.color !== self.agentColor() && self.blockers[e.color] && self.blockers[e.color].confirm) cols[e.color] = 1; });
    Object.keys(cols).forEach(function (b) {
      var ig = {}; ig[b] = 1;
      if (self.plan(p, target, 3000, { ignore: ig })) out.push(+b);
    });
    return out;
  };

  /* ------------------------------------------------------------------ agent */

  /* ---------------------------------------------------------- belief set
   *
   * Several complete WorldModels compete: after a level boundary, "the
   * mechanics carried over" (the compressed prior), "the action map was
   * redrawn, the roles carried over" and "the roles were redrawn, the
   * actions carried over". Each is weighted by how well it PREDICTED every
   * transition before learning from it (Bayes with a floor, so a model can
   * recover), all of them learn, and the agent acts on the most probable
   * one. Cross-level memory is therefore a hypothesis that can be refuted as
   * a whole -- one contradicted action demotes the entire carried-over map,
   * instead of waiting for every action to be contradicted separately. */
  function transitionLikelihood(model, p0, a, p1, info) {
    var pr = model.predict(p0, a), ent1 = model.agentEntity(p1), ent0 = model.agentEntity(p0), L = 1;
    if (!ent0 || !ent1) return pr.known ? 0.8 : 0.6;
    var dr = ent1.r0 - ent0.r0, dc = ent1.c0 - ent0.c0;
    if (pr.known) {
      var jump = Math.abs(dr) + Math.abs(dc) > Math.abs(pr.rule.dr) + Math.abs(pr.rule.dc) + 1;
      if (jump) L *= 1;                                             /* teleport: uninformative */
      else if (ent1.r0 === pr.pos[0] && ent1.c0 === pr.pos[1]) L *= 0.9;
      else if (!dr && !dc && landing(p0, ent0, pr.rule.dr, pr.rule.dc).some(function (c) { return c !== -1 && !model.entered[c] && !(model.blockers[c] && model.blockers[c].confirm); }))
        L *= 0.5;                                                   /* an untested obstacle */
      else L *= 0.1;
      pr.contact.forEach(function (c) {
        if (model.hazards[c] && model.hazards[c].confirm) L *= info.gameOver ? 0.9 : 0.3;
        if (model.goals[c] && model.goals[c].confirm && !model.staleTests(p0, c)) L *= info.levelComplete ? 0.9 : 0.5;
      });
    } else L *= 0.5;
    return L;
  }
  function BeliefSet(actions, prior, opts) {
    opts = opts || {};
    this.members = [];
    if (!prior || opts.beliefs === false) this.members.push({ label: prior ? "prior" : "fresh", model: new WorldModel(actions, prior), w: 1 });
    else {
      this.members.push({ label: "prior", model: new WorldModel(actions, prior), w: 0.5 });
      this.members.push({ label: "actions-redrawn", model: new WorldModel(actions, partialPrior(prior, "actions")), w: 0.3 });
      this.members.push({ label: "roles-redrawn", model: new WorldModel(actions, partialPrior(prior, "roles")), w: 0.2 });
    }
    this.switches = 0;
    this.history = [];
  }
  BeliefSet.prototype.best = function () {
    var b = this.members[0];
    for (var i = 1; i < this.members.length; i++) if (this.members[i].w > b.w + 1e-12) b = this.members[i];
    return b;
  };
  BeliefSet.prototype.update = function (p0, a, p1, info) {
    var before = this.best().label, tot = 0, res = null, bestM = this.best().model;
    this.members.forEach(function (m) { m.w = Math.max(1e-4, m.w * transitionLikelihood(m.model, p0, a, p1, info)); tot += m.w; });
    this.members.forEach(function (m) { m.w /= tot; });
    this.members.forEach(function (m) { var r = m.model.learn(p0, a, p1, info); if (m.model === bestM) res = r; });
    if (this.members.length > 1) {
      this.members = this.members.filter(function (m) { return m.w >= 0.01; });
      if (this.best().label !== before) { this.switches++; this.history.push({ step: this.best().model.steps, from: before, to: this.best().label }); }
    }
    return res;
  };
  BeliefSet.prototype.entropy = function () {
    var h = 0;
    this.members.forEach(function (m) { if (m.w > 0) h -= m.w * Math.log(m.w) / Math.LN2; });
    return h;
  };
  /* Do the two most probable models predict different outcomes for a? */
  BeliefSet.prototype.disagreement = function (p, a) {
    if (this.members.length < 2) return 0;
    var ms = this.members.slice().sort(function (x, y) { return y.w - x.w; }), p1 = ms[0].model.predict(p, a), p2 = ms[1].model.predict(p, a);
    if (!p1.known && !p2.known) return 0;
    if (p1.known !== p2.known) return Math.min(ms[0].w, ms[1].w) * 2;
    return (p1.pos[0] !== p2.pos[0] || p1.pos[1] !== p2.pos[1] || p1.blocked !== p2.blocked) ? Math.min(ms[0].w, ms[1].w) * 2 : 0;
  };

  /* ---------------------------------------------------- hierarchical options
   *
   * Temporally extended plans the agent chooses between, each a target and
   * a path (BFS over learned action rules):
   *   goal      reach a confident goal
   *   prereq    collect what the goal was learned to need gone first
   *   enable    reach / bump the trigger known to remove what blocks the
   *             way (chained: the trigger itself may need enabling)
   *   collect   gather an item the trigger's precondition needs
   *   retest    bump a blocker whose verdict predates a change of the
   *             hidden inventory (the test is stale)
   *   test      touch the most promising untested object
   * The chosen option's first action gets the option's progress value. */
  var OPTION_GP = { goal: 1.0, probe: 0.9, prereq: 0.8, enable: 0.8, collect: 0.75, retest: 0.6, test: 0.5 };
  function enableOptions(M, p, target, pr, depth, out, seen) {
    if (depth > 2 || seen[target]) return;
    seen[target] = 1;
    M.inTheWay(p, target).forEach(function (b) {
      var ens = M.enablers(b), used = false;
      ens.forEach(function (en) {
        var missing = en.pre.filter(function (x) { return !M.inventory[x]; });
        if (missing.length) {
          missing.forEach(function (x) { var pl = M.planSafe(p, x); if (pl) { out.push({ kind: "collect", target: x, plan: pl, p: pr, via: b }); used = true; } });
          return;
        }
        if (en.kind === "bump") {
          var plb = M.planSafe(p, en.color, null, { bump: true });
          if (plb) { out.push({ kind: "enable", target: en.color, plan: plb, p: pr, via: b, bump: true }); used = true; }
        } else {
          var pl = M.planSafe(p, en.color);
          if (pl) { out.push({ kind: "enable", target: en.color, plan: pl, p: pr, via: b }); used = true; }
          else enableOptions(M, p, en.color, pr * 0.9, depth + 1, out, seen);
        }
      });
      if (!used && M.staleBlocker(b)) {
        var plr = M.planSafe(p, b, null, { bump: true });
        if (plr) out.push({ kind: "retest", target: b, plan: plr, p: pr, via: b, bump: true });
      }
    });
  }
  function options(agent, p, goals) {
    var M = agent.model, out = [], self = agent;
    var confident = goals.filter(function (g) { return g.p > 0.6; });
    confident.forEach(function (g) {
      if (g.prereq && g.prereq.length) {
        g.prereq.forEach(function (x) { var pl = M.planSafe(p, x); if (pl) out.push({ kind: "prereq", target: x, plan: pl, p: g.p }); });
        if (out.length) return;
      }
      var pl = M.planSafe(p, g.color);
      if (pl) out.push({ kind: "goal", target: g.color, plan: pl, p: g.p });
      else enableOptions(M, p, g.color, g.p, 0, out, {});
    });
    /* a confident goal without a plan while some action is still unknown:
       learning the action is the safest step toward it (no contact risk) */
    if (confident.length && !out.some(function (o) { return o.kind === "goal"; })) {
      var ent = M.agentEntity(p);
      if (ent) agent.actions.forEach(function (a) {
        var am = M.actionModels[key(a)];
        if (M.actionRule(a) || (am && am.noop.confirm >= 2)) return;
        out.push({ kind: "probe", target: null, plan: [a, 1], p: confident[0].p });
      });
    }
    if (!out.some(function (o) { return o.kind === "goal" || o.kind === "probe"; }) && ent0Known(agent) && agent.uncertainty() < 0.8) {
      /* untested candidates, most promising first: reachable ones become
         "test" options, unreachable ones get enabling / retest options */
      goals.filter(function (g) { return !g.tested && !(M.blockers[g.color] && M.blockers[g.color].confirm) && !M.harmful(g.color); })
        .map(function (g) { return { g: g, v: g.p - HAZARD_COST * M.untestedHazard(p, g.color) * 0.2, pl: M.planSafe(p, g.color) }; })
        /* equally promising candidates: the nearest is the cheaper test (a
           colour's NUMBER carries no information) */
        .sort(function (a, b) { return (b.v - a.v) || ((a.pl ? a.pl[1] : 1e9) - (b.pl ? b.pl[1] : 1e9)) || (a.g.color - b.g.color); })
        .forEach(function (c, rank) {
          if (c.v <= 0) return;
          if (c.pl) out.push({ kind: "test", target: c.g.color, plan: c.pl, p: c.g.p, rank: rank });
          else if (self.useOptions) enableOptions(M, p, c.g.color, c.g.p * 0.8, 0, out, {});
        });
    }
    out.forEach(function (o) { o.value = OPTION_GP[o.kind] * (o.kind === "goal" ? 1 : Math.min(1, o.p / 0.6)) - (o.kind === "test" ? 0.01 * o.rank : 0.004 * o.plan[1]); });
    return out.sort(function (a, b) { return b.value - a.value; });
  }

  /* Completing a level and losing it are the two outcomes; they are valued
     symmetrically, so a contact is worth testing when P(goal) > P(hazard). */
  var GOAL_VALUE = 2.0, HAZARD_COST = 2.0;
  function ent0Known(agent) { return !!(agent.prev && agent.model.agentEntity(agent.prev)); }

  function Agent(actions, opts) {
    opts = opts || {};
    this.actions = actions.slice();
    this.opts = opts;
    this.useBeliefs = opts.beliefs !== false;
    this.useOptions = opts.options !== false;
    this.beliefs = new BeliefSet(actions, opts.prior || null, { beliefs: this.useBeliefs });
    this.model = this.beliefs.best().model;
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
    if (this.prev && this.lastAction !== null) {
      res = this.beliefs.update(this.prev, this.lastAction, p, info || {});
      this.model = this.beliefs.best().model;
    }
    if (info && (info.levelComplete || info.gameOver)) this.flushTrajectory(info);
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
    /* hierarchical options: goal, prerequisite, enabling, retest, test */
    var opts = options(this, p, goals), chosen = opts[0] || null;
    var optGp = {};
    opts.forEach(function (o) { var k = key(o.plan[0]); optGp[k] = Math.max(optGp[k] || 0, Math.max(0.05, o.value)); });
    var stateKey = gridKey(p.grid);
    var goalP = {};
    goals.forEach(function (g) { goalP[g.color] = g.p; });
    var ent = this.model.agentEntity(p), best = null, bu = -Infinity, scored = [];
    for (i = 0; i < this.actions.length; i++) {
      var a = this.actions[i], pred = this.model.predict(p, a);
      var gp = optGp[key(a)] || 0, ig = this.model.actionUncertainty(a), risk = 0, nov = 0;
      /* information gain about WHICH world model holds */
      if (this.useBeliefs) ig += this.beliefs.disagreement(p, a);
      if (!pred.known && ent) {
        /* an unknown action goes to one of the directions no known action
           claims (or nowhere): its risk is the mean contact risk over them */
        var claimed = {}, cand = [], self2 = this;
        this.actions.forEach(function (b) { var r2 = self2.model.actionRule(b); if (r2) claimed[r2.dr + "," + r2.dc] = 1; });
        [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) { if (!claimed[d[0] + "," + d[1]]) cand.push(d); });
        if (cand.length) {
          var er = 0;
          cand.forEach(function (d) {
            landing(p, ent, d[0], d[1]).forEach(function (c) {
              if (c === -1 || c === p.bg || self.model.entered[c]) return;
              var hz = self.model.hazards[c], g = self.model.goals[c];
              er += HAZARD_COST * (hz ? (hz.confirm ? hz.conf() : 0) : (g ? 0 : self.model.untestedHazard(p, c)));
            });
          });
          risk += er / (cand.length + 1);
        }
      }
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
    this.trace.push({ step: this.step++, beta: Math.round(beta * 100) / 100, chosen: best, options: scored,
                      option: chosen ? { kind: chosen.kind, target: chosen.target, len: chosen.plan[1] } : null,
                      belief: this.beliefs.best().label });
    this.lastAction = best;
    return best;
  };

  /* One controller for every domain: the option segments of a level are
     logged to the shared meta hub (c4-reason-meta.js) as kernel operations,
     next to ARC's refinement steps and the language deliberation rounds.
     The level's outcome is the progress signal; its cost is the steps. */
  var OPTION_ACTION = { goal: "REFINE_BEST", probe: "GENERATE_DISCRIMINATOR", test: "GENERATE_DISCRIMINATOR",
                        enable: "EXPAND_PROGRAM", collect: "EXPAND_PROGRAM", prereq: "EXPAND_PROGRAM", retest: "VERIFY_DEEPLY" };
  Agent.prototype.flushTrajectory = function (info) {
    var META = root.C4ReasonMeta, tr = this.trace.slice(this.flushed || 0);
    this.flushed = this.trace.length;
    if (!META || !META.hub || !tr.length) return null;
    var segs = [], cur = null;
    tr.forEach(function (t) {
      var k = t.option ? t.option.kind : "none";
      if (!cur || cur.kind !== k) { cur = { kind: k, steps: 0, beta: t.beta, belief: t.belief }; segs.push(cur); }
      cur.steps++;
    });
    var win = !!info.levelComplete, steps = segs.map(function (sg, i) {
      return { domain: "arc3", action: OPTION_ACTION[sg.kind] || (sg.kind === "none" ? "REFINE_DIVERSE" : "EXPAND_PROGRAM"),
               feats: ["dom:arc3", "amb:" + (sg.beta > 0.5 ? 1 : 0), "last:" + (i ? segs[i - 1].kind : "start"), "belief:" + sg.belief],
               gain: win ? (i === segs.length - 1 ? 1 : 0.3) : 0, children: sg.steps, ms: sg.steps };
    });
    META.hub.log(steps);
    return steps;
  };

  /* Level boundary: keep mechanics, drop layout. */
  Agent.prototype.nextLevel = function () {
    var prior = this.model.compress();
    this.beliefs = new BeliefSet(this.actions, prior, { beliefs: this.useBeliefs });
    this.model = this.beliefs.best().model;
    this.prev = null; this.lastAction = null; this.visits = {}; this.futile = {};
    this.flushed = this.trace.length;
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

  var W = { perceive: perceive, delta: delta, background: background, WorldModel: WorldModel, Agent: Agent, BeliefSet: BeliefSet,
            options: options, transitionLikelihood: transitionLikelihood };
  root.C4Arc3World = W;
  if (typeof module !== "undefined" && module.exports) module.exports = W;
})(typeof window !== "undefined" ? window : globalThis);
