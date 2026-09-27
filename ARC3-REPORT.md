# ARC-AGI-3: from a navigation agent to game-program discovery

Stage 3 of the CELL4 work. It covers the official interface, the new agent, its synthetic test worlds, the ablations and the held-out results. All numbers below come from JSON outputs of `tools/arc3-bench.js` and `tools/arc3-official.js`, formatted by `tools/arc3-report.js`. The architecture was frozen at commit `6353398` before any held-out game was run. Each held-out set was then run exactly once on that commit.

## Headline (honest)

* **Held-out synthetic families** (6 mechanics compositions never run before the freeze; 5 seeds; same action budget for every agent):
  * new agent **0.100** mean official score (30/90 levels);
  * previous agent 0.000 (0/90);
  * random 0.003 (8/90).
* **Dev synthetic families** (used for development, so optimistic): new agent **0.376**, previous agent 0.070, random 0.000. The drop from dev to held-out is the most important number in this report. The agent generalises to *some* unseen mechanics (logic panels 0.53, gravity drops completed), but not to most.
* **Held-out community games on the official engine** (214 third-party games never run before the freeze; same budgets):
  * new agent **0.040** mean official score; previous agent **0.065**.
  * The new agent completes at least one level in more games (78 vs 60) but fewer levels in total (181 vs 210), and less efficiently.
  * On this suite the new agent is **worse** than the navigation agent it was built to generalise.
* **Official ARC-AGI-3 public games (ls20, ft09, vc33)**, the only 3 of 25 reachable, run once:
  * new agent **0.000** and previous agent **0.000**.
  * The new agent completed 2 of the 7 levels of vc33, but with 595 and 232 actions against human baselines of 6 and 13. That scores 0 under the 5× cutoff and about 0.02 points on the 0–100 scale without it.
  * ls20 and ft09: no level for either agent.
* No 10× claim is made, and none would survive the held-out data.
  * Dev: about 5× higher than the previous agent, on the data it was developed on.
  * Held-out synthetic: 0.100 vs 0.000.
  * Held-out community: 0.040 vs 0.065.
  * Official: 0 vs 0.

  The architecture is broader (clicks, non-avatar mechanics, hidden state, inventories, lose conditions), but its induced programs and goal grammar do not yet cover enough unseen mechanics to pay off under the squared action-efficiency metric.

## 1. Official interface, verified (and where the brief differs)

Sources: the official `arcengine` 0.9.3 and `arc-agi` 0.9.9 packages from PyPI. `enums.py`, `base_game.py`, `local_wrapper.py` and `scorecard.py` were read directly. `docs.arcprize.org`, `arcprize.org` and the game API are blocked by this container's egress policy. The ARC-AGI-3 technical report (arXiv 2603.24621) was consulted through search summaries only.

* **Actions.**
  * `RESET` = 0; `ACTION1`–`ACTION5` are simple actions.
  * `ACTION6` is the only complex action: a click at pixel `x, y` in 0..63, (0,0) top-left, `x` = column.
  * `ACTION7` is simple (undo by convention, game-specific).
  * Each game lists its `available_actions`.
  * *Differs from the brief:* the meaning of ACTION1–5 (up/down/left/right/space) is only a client convention. Games bind them freely, and undo is not guaranteed to exist. The agent therefore learns every action's semantics and never assumes directions.
* **Observations.** `frame` is a LIST of 64×64 grids, because one action may render several animation frames. Values are 0..15. Other fields: `state` (NOT_PLAYED / NOT_FINISHED / WIN / GAME_OVER), `levels_completed`, `win_levels`, `available_actions`, `full_reset`.
* **Levels and completion.** A level-up shows as an increase of `levels_completed`. The frame before the new level shows the winning configuration, and the agent learns its goals from it. After WIN or GAME_OVER only RESET does anything.
* **RESET.**
  * A full reset if no action was taken yet or after WIN; otherwise the level restarts.
  * The engine's action counter does not count RESET. *This harness counts it* (conservative) and reports resets separately.
* **Scoring** (`scorecard.py`; the brief calls the metric RHAE).
  * A completed level scores `min(115, (baseline/actions)^2 × 100)`; an uncompleted level scores 0. The cap is 115, not 100.
  * A game's score is the level-index-weighted mean (level i has weight i), capped at the weight share of completed levels.
  * The benchmark score is the mean over games.
  * The technical report says a level taking more than 5× its baseline scores 0, but **the 0.9.9 scorecard code does not apply this cutoff**. The harness applies it by default (conservative) and the tables also give the score without it. The two differ by at most 0.002 anywhere below.
* **Baselines.** Official per-level human baselines come from each game's `metadata.json` (`baseline_actions`). Some community games list fewer baselines than levels. Their missing levels get the mean of the listed baselines, and each such record is flagged (`imputed_baselines`).
* **Reachability.** Only 3 of the 25 public ARC-AGI-3 games (`ls20`, `ft09`, `vc33`, official downloads with official baselines) are reachable from this container. They come from the MIT community repository `theredbluepill/arc-interactive`. The other 22 need the blocked API. Their sha256 hashes match the ones frozen in `ARC3-EVAL-PROTOCOL.md` before development.

## 2. Architecture before and after

**Before (`c4-arc3-world.js`, unchanged, now the navigation specialist).**
* It assumes an *avatar* that the simple actions move through walls towards goal colours, with hazards, keys/doors and teleports as special cases.
* It keeps beliefs over a few world models, plans breadth-first over avatar positions, and uses hierarchical options (goal, prerequisite, enable, retest, test).
* It cannot click. A game without an avatar gives it nothing to model.

**After (`c4-arc3-agent.js`).** The central object is an executable **game program** inferred from interaction:

```
OBSERVE    lattice -> logical grid -> objects (+ clicked-cell segmentation) -> events
INFER      per interaction context: version space of rules (selector x operator)
           + latent splits + autonomous rules + contact model + goal/lose programs
SIMULATE   the program is executable: simulate(state, rules, latent) -> next state
PLAN       best-first search through the program, carrying the latent state
ACT        predict before acting (own step + plan expectation)
CHECK      compare, classify: rule violation, unmodelled change (noise), refusal,
           death, level-up
REVISE     re-induce the touched contexts; physics changes re-explain the past
```

Discovery and execution alternate:
* **Discovery.** The agent takes the action with the highest expected information gain, or an experiment sequence.
* **Execution.** It follows a plan for the most believed goal. Execution is used as soon as a goal is confirmed from an earlier level, as soon as no unobserved context is left, or every 4th step as a probe.

The previous agent runs in the shadow on every frame. It is consulted only when the discovered program has actors and nothing better exists.

## 3. Files

| file | status | lines | role |
|---|---|---|---|
| `c4-arc3-agent.js` | new | 1611 | perception, program DSL, induction, goals, exploration, planning, memory, specialist wrapper |
| `c4-arc3-env.js` | new | 161 | official observation/action protocol, official level and game scoring, matched-budget harness (sync + async) |
| `c4-arc3-games.js` | new | 734 | 18 synthetic game families (12 dev, 6 held-out) with BFS-optimal baselines |
| `tools/arc3-bench.js` | new | 209 | benchmark on synthetic families: agents, ablations, probes, metrics, freeze guard |
| `tools/arc3-bridge.py` | new | 90 | official engine (arcengine) bridge over JSON lines |
| `tools/arc3-official.js` | new | 118 | agents on engine games (dev / held-out community / official), freeze guard |
| `tools/arc3-report.js` | new | 72 | every table in this report, from the JSON outputs |
| `ARC3-EVAL-PROTOCOL.md` | new | 72 | interface summary, dev/held-out split and file hashes, committed before development |
| `ARC3-REPORT.md` | new | — | this report |
| `arc3-results/*.json` | new | — | raw outputs of every frozen run behind the tables (dev and held-out synthetic, dev and held-out community, official) |
| `c4-arc3-world.js` | unchanged | 988 | previous agent; baseline and navigation specialist |

## 4. State representation

* **Render lattice.** Cell size s and offset are inferred from the frames. Every edge position is weighted by its length. The chosen period trades edge coverage against coarseness (0.2·ln s). An offset is allowed only when its border margins are a frame (≥ 80% one colour). This rules out HUD pixels forcing 1-pixel cells, and coincidental periods (e.g. 11 px) fitting a few edges. On the 35 dev engine games it matches the declared grid size in 29 of the 31 games whose declared first grid size divides 64. The exceptions are `mm01` (a coarser 14-px lattice with a 4-px margin) and `bd01` (12-px cells inside a 2-px frame, against a declared range of 4–8 cells).
* **Background, frame and play box.** Decided on the first frame of a level and kept. In a board of tiles the commonest colour changes as tiles flip.
* **Objects.** Each object is a 4-connected one-colour component. It carries its cells, bounding box, centroid, shape key, canonical D4 shape and class (colour/shape).
* **Second segmentation.** The clicked cell is also a pseudo-object, because click effects are often local to one cell of a larger same-coloured region.
* **Regions.** Separator bands (full uniform rows or columns) give the panels that clicks are contextualised by.
* **Latent state**, carried by the planner:
  * the parity of every context's occurrences and of every simple action (modes, toggles);
  * the last-clicked object, tracked through moves, rotations and recolours;
  * velocities of moving objects;
  * the underlay (what movers cover);
  * the inventory: the collected colours.
* **Per level:** a noise mask (cells that change when the model predicts no change: status lines, counters) and visit counts of states.

## 5. Program DSL

* **Rule** = interaction context × selector × operator, optionally split on a latent feature.
* **Contexts.**
  * Clicks: `a:<action>`, `k:<class>@<band>`, `kc:<colour>@<band>`, `k*@<band>`, then the same keys without the band, and `kbg@<band>` for the background.
  * The most specific *observed* context whose model is complete predicts.
* **Selectors:** `cell`, `clicked`, `lastClicked` (optionally with a colour), `nbr4`, `ray4`, `clickedRay4`, `row`, `col`, `sameColor`, `sameClass`, `color:c`, `cls:k`.
* **Operators:** `recolor`, `swapcol`, `cycle`, `map` (a learned colour function), `delete`, `grow` / `shrink` (bars and gauges), `spawn(shape, colour, offset)` (markers, placed blocks), `rotate(k, anchor)`, `move(dr,dc)`, `slide`, `patrol` (velocity from the latent state), `moveTo(ref)`.
* **Autonomous rules (ticks):** any operator on a class selector that holds in ≥30% of a recent window, under ≥2 action contexts. Examples are patrols, countdown bars and cycling lights.
* **Contact model** (what entering a colour does), learned directly from events:
  * `hide` (covered, remembered in the underlay), `collect` (into the inventory), `push`, `tint` (a crate taking another colour on a pad), `deadly`, `refused`.
  * A passage refused before and taken later needs what was held when it was taken. Keys and doors are learned without naming either.
* **Goal programs:**
  * `clear(c)` (visible or hidden under an actor), `reach(c)` (an actor on c), `clear2(a,b)`, `count(a,b)`;
  * `align(axis,a,b)` for single objects;
  * `pairs(a,b)` (objects of b take the shapes of the objects of a, in reading order);
  * `match(A,B,exact|mask c)` over separator panels.
* **Lose programs:** the same predicates, learned at game over.

## 6. Inference

1. **Events.** Frame differences become per-object events: unchanged, move, recolour, rotate, reshape, move with tint, delete, spawn. Identity is matched by colour and shape, then place, then canonical shape.
2. **Candidate rules per transition.** For every event and every selector that selects its object, operators consistent with the event are simulated. A rule is kept if it predicts only events that happened.
3. **Version space per context.**
   * Once a context has n ≥ 4 transitions, a rule may contradict up to max(1, ⌊n/8⌋) of them (at 4 bits each). One misperceived contact therefore cannot erase a context's program.
   * Colour maps are merged across transitions when the pairs form a function.
   * Greedy MDL covers (explained events per bit) give up to 3 alternative explanations per context. These alternatives are the live model set, 2–16 combinations across contexts. Where they disagree on a candidate action, that action is informative.
4. **Latent splits.** When no cover explains a context, its transitions are split on each latent feature: occurrence parity, selection, action parities. The cheapest complete split is kept.
5. **Contact model.** Learned before rules, from the cells movers entered and what became of their occupants. A change in it re-explains all past transitions.
6. **Death attribution.**
   * A game over is blamed on colours an actor touched, per the model's prediction of the step and of the same step with every colour passable.
   * Otherwise it is blamed on the action's context. A context is banned only if it kills at least half the times it is used.
   * Lose predicates: those that became true at the fatal step and were never true in any state seen safe before, including winning configurations.

## 7. Goal inference

* Hypotheses come from the grammar, over every colour seen in the level. Colours hidden or already collected still count.
* **Priors:** rarer colours are likelier targets. `match` priors are template-aware: exact when the workspace's colours come from the template, mask of colour c when c is the workspace's own colour.
* **Refutation:** a hypothesis satisfied while the level continues is refuted for this level.
* **Confirmation:** the winning frame of every completed level confirms the templates that hold in it (×5, then ×20 per confirmation) and weakens the rest. Hypotheses refuted during the level are excluded, since they held without winning.
* Up to 10 hypotheses are planned in belief order, within a node budget. Those found unreachable under the current model are skipped until the model changes.

## 8. Exploration and experiments

* **Single-step expected information gain.**
  * An unobserved context is worth 1.0, or 0.4 if a more generic context already predicts it completely.
  * Alternative covers disagreeing on this action are worth 0.6·log2(number of distinct predictions).
  * A young incomplete context is worth up to 0.3.
  * A simple action never tried in the current latent configuration is worth 0.5; configurations differ by what is selected and by the parity of silent actions.
  * A simple action seen only doing nothing is worth up to 0.6, where the actors' surroundings differ from every earlier try.
  * Risk comes from unexplained context deaths and predicted deaths.
* **Experiment sequences:**
  * *Contact experiments:* walk, through the known program, to where an actor can press into a colour whose contact effect is untested. Paths that push objects are penalised as possibly irreversible.
  * *Context experiments:* reach a state where a click on a never-observed colour context can be tried, e.g. first make a colour, then click it.
* When nothing is informative, the navigation specialist is asked if the program has actors. Otherwise the agent takes the safe action whose predicted next state was visited least.
* Visual novelty is never treated as information. Only disagreement between the agent's own models and unobserved contexts count.

## 9. Planning

* Best-first search through the executable program, with f = path length + 2·goal distance. A node is the grid plus a latent signature: the split features actually used, selection, inventory, and velocities when ticks exist.
* It accepts consistent-but-incomplete models (coverage ≥ 0.6).
* It prunes predicted deaths and lose predicates.
* Untested colours that the goal needs are assumed passable (optimism under uncertainty). A refusal is then learned and the plan dropped.
* Every plan step carries its expected grid. Execution continues while observations match, outside the noise mask.
* **RESET is a planned action.** When every tried goal is provably unreachable (the reachable space was exhausted, not cut off), the agent plans from the level's start state. If that succeeds, it plans RESET plus that path, at most 3 times per level.
* **Budgets:** 1500 nodes per goal, 4500 per step, and a 1 s deliberation deadline per action. The agent is anytime.
* MCTS is not used. The learned simulator is deterministic, and exact best-first search over it was never the bottleneck. When the agent fails, its program is wrong or its goal grammar lacks the goal (section 24).

## 10. Memory across levels (format)

The agent carries its evidence (all transitions), the contact model, goal template beliefs, lose predicates and winning configurations across levels. Layouts, the latent state, the underlay and the noise mask are per level. `Agent.program()` exports the inferred program as compact JSON. Example from a dev *keys* game after 3 levels, abridged:

```json
{ "contexts": { "a:1": { "rules": ["color:12 -> move:0,1"], "coverage": 0.98 },
                "a:3": { "rules": ["color:12 -> move:-1,0"], "complete": true }, ... },
  "autonomous": [], "actors": [12],
  "contact": { "pass": { "1": {"k": "hide"}, "4": {"k": "collect"},
                         "7": {"k": "collect", "need": [4]} , ... } },
  "goals": [ { "template": "reach:1", "confirmed": 3 }, ... ], "lose": [] }
```

It reads: the four actions move colour 12, colour 4 is collected, and colour 7 opens once 4 is held. The goal is to stand on colour 1.

## 11. Synthetic generators

`c4-arc3-games.js` defines 18 families. Each game instance draws:
* a random colour for every role (background 0 in 60% of games);
* random shapes;
* a random assignment of action ids.

No colour, shape or id carries meaning across games. Every game speaks the official protocol: 64×64 frames with the logical grid rendered at an integer scale on a frame colour, lists of frames for animations, ACTION6 pixel clicks, RESET semantics, 3 levels. Per-level baselines are BFS-optimal action counts, which are *harder* than human baselines.

| split | family | mechanics |
|---|---|---|
| dev | lights | click toggles a neighbourhood (plus / self / row / column) |
| dev | rotsel | click selects (marker visible or not), a simple action rotates the selection |
| dev | cyclematch | click cycles a cell's colour; match the template panel |
| dev | counter | plus/minus buttons change a bar; match the target |
| dev | modepaint | a hidden mode switches clicks between delete and recolour; losing condition |
| dev | sequence | click buttons in the order shown; a wrong click resets progress |
| dev | maze, push, collect, keys | walls, crates onto pads, coins, keys/doors (carried invisibly) |
| dev | patrol | hazards move by themselves; contact is game over |
| dev | timedstop | a marker runs a loop by itself; a button freezes it on the target |
| held-out | swap | click one tile then another to swap (hidden selection) |
| held-out | symmetry | click cells until the pattern is mirror-symmetric |
| held-out | dropstack | click a column: a block falls (animated frames); match the skyline |
| held-out | logicpanel | switches feed a lamp through a hidden boolean function |
| held-out | eliminate | delete the objects shaped like the legend; a wrong click is game over |
| held-out | bridgekey | composition: click rotates a bridge, walk across, key, door, goal |

## 12. Dev synthetic results (development data, 5 seeds, same budgets)

These families were used during development. The numbers are therefore optimistic, and they are shown to make the dev/held-out gap visible. Frozen commit, 5 seeds per family, the same budget for every agent (5× the BFS-optimal baseline of each level, summed). Cells are mean official score (mean levels completed of 3).

| family | new | legacy | random |
|---|---|---|---|
| lights | 0.816 (3.0) | 0.000 (0.0) | 0.000 (0.0) |
| rotsel | 0.371 (2.0) | 0.000 (0.0) | 0.000 (0.0) |
| cyclematch | 0.020 (1.0) | 0.000 (0.0) | 0.000 (0.0) |
| counter | 0.379 (2.4) | 0.000 (0.0) | 0.000 (0.2) |
| modepaint | 0.232 (2.6) | 0.000 (0.0) | 0.000 (0.2) |
| sequence | 0.000 (0.0) | 0.000 (0.0) | 0.000 (0.2) |
| maze | 0.781 (3.0) | 0.175 (1.2) | 0.003 (1.2) |
| push | 0.290 (2.2) | 0.000 (0.0) | 0.000 (0.4) |
| patrol | 0.432 (2.2) | 0.017 (0.4) | 0.000 (0.2) |
| keys | 0.567 (3.0) | 0.407 (2.6) | 0.000 (0.0) |
| timedstop | 0.002 (0.2) | 0.000 (0.0) | 0.000 (0.0) |
| collect | 0.619 (3.0) | 0.239 (3.0) | 0.000 (1.0) |
| **mean** | **0.376** | **0.070** | **0.000** |
| mean without the 5x cutoff | 0.377 | 0.070 | 0.001 |
| games with >= 1 level | 48/60 | 14/60 | 13/60 |
| levels completed | 123/180 | 36/180 | 17/180 |

**Dev community games on the official engine.** These are the 35 games whose descriptions were seen before the protocol was written. They were used only to debug the interface (lattice, background, crashes), never to add mechanics. Frozen commit, same budgets:

| family | new | legacy |
|---|---|---|
| **mean** | **0.253** | **0.160** |
| mean without the 5x cutoff | 0.253 | 0.160 |
| games with >= 1 level | 18/35 | 13/35 |
| levels completed | 55/175 | 35/175 |

<details><summary>per game</summary>

| family | new | legacy |
|---|---|---|
| ez01 | 1.000 (5.0) | 0.067 (1.0) |
| ul01 | 0.042 (1.0) | 0.535 (4.0) |
| pt01 | 0.000 (0.0) | 0.000 (0.0) |
| tb01 | 0.000 (0.0) | 0.000 (0.0) |
| sq01 | 0.000 (0.0) | 0.000 (0.0) |
| pb03 | 0.000 (0.0) | 0.000 (0.0) |
| tp01 | 0.139 (2.0) | 0.067 (1.0) |
| ic02 | 1.000 (5.0) | 1.000 (5.0) |
| va03 | 0.000 (0.0) | 0.000 (0.0) |
| ez02 | 1.000 (5.0) | 0.667 (4.0) |
| tt01 | 0.276 (2.0) | 0.000 (0.0) |
| pt02 | 0.000 (0.0) | 0.000 (0.0) |
| ff01 | 0.000 (0.0) | 0.000 (0.0) |
| rs01 | 0.000 (0.0) | 0.000 (0.0) |
| fs01 | 0.000 (0.0) | 0.000 (0.0) |
| tp02 | 0.169 (2.0) | 0.067 (1.0) |
| ic03 | 0.067 (1.0) | 0.067 (1.0) |
| nw01 | 1.000 (5.0) | 1.000 (5.0) |
| ez03 | 1.000 (5.0) | 0.000 (0.0) |
| wm01 | 1.000 (5.0) | 0.000 (0.0) |
| sy01 | 0.000 (0.0) | 0.000 (0.0) |
| mm01 | 0.002 (2.0) | 0.000 (0.0) |
| pb01 | 0.000 (0.0) | 0.000 (0.0) |
| fs02 | 0.009 (1.0) | 0.052 (1.0) |
| tp03 | 0.067 (1.0) | 0.067 (1.0) |
| va01 | 0.000 (0.0) | 0.010 (1.0) |
| bd01 | 0.064 (2.0) | 1.000 (5.0) |
| ez04 | 1.000 (5.0) | 0.000 (0.0) |
| sv01 | 0.004 (1.0) | 0.000 (0.0) |
| sk01 | 0.000 (0.0) | 0.000 (0.0) |
| ms01 | 0.000 (0.0) | 0.000 (0.0) |
| pb02 | 0.000 (0.0) | 0.000 (0.0) |
| fs03 | 0.000 (0.0) | 0.000 (0.0) |
| ic01 | 1.000 (5.0) | 1.000 (5.0) |
| va02 | 0.000 (0.0) | 0.000 (0.0) |

</details>

## 13. Held-out synthetic results (frozen, run once)

These families were never run before the freeze and were run once on commit `6353398` (`tools/arc3-bench.js --set holdout --frozen 6353398236c9`). 5 seeds, the same budgets, and cells as in section 12.

| family | new | legacy | random |
|---|---|---|---|
| swap | 0.003 (0.2) | 0.000 (0.0) | 0.000 (0.0) |
| symmetry | 0.006 (1.4) | 0.000 (0.0) | 0.015 (0.2) |
| dropstack | 0.051 (1.0) | 0.000 (0.0) | 0.002 (1.0) |
| logicpanel | 0.529 (2.8) | 0.000 (0.0) | 0.000 (0.0) |
| eliminate | 0.008 (0.2) | 0.000 (0.0) | 0.000 (0.4) |
| bridgekey | 0.004 (0.4) | 0.000 (0.0) | 0.000 (0.0) |
| **mean** | **0.100** | **0.000** | **0.003** |
| mean without the 5x cutoff | 0.101 | 0.000 | 0.003 |
| games with >= 1 level | 17/30 | 0/30 | 7/30 |
| levels completed | 30/90 | 0/90 | 8/90 |

* **logicpanel** (a hidden boolean function of switches lights a lamp) is solved in most seeds. Its click-toggle mechanics and "lamp colour gone" goal are in the vocabulary.
* **dropstack** and **symmetry** complete levels, but far above baseline.
* **swap**, **eliminate** and **bridgekey** mostly fail; section 25 gives the verified causes.
* The previous agent completes nothing: none of these games is navigation-only.

## 14–17. Non-avatar, click-heavy, temporal, hidden-state

Families grouped by the mechanics they exercise (a family can sit in several groups). Means of family means.

**Dev (developed on):**

| category | new | legacy | random |
|---|---|---|---|
| non-avatar (lights, rotsel, cyclematch, counter, modepaint, sequence, timedstop) | 0.260 | 0.000 | 0.000 |
| click-heavy (lights, rotsel, cyclematch, counter, modepaint, sequence) | 0.303 | 0.000 | 0.000 |
| temporal (patrol, timedstop) | 0.217 | 0.008 | 0.000 |
| hidden-state (rotsel, modepaint, keys, sequence) | 0.292 | 0.102 | 0.000 |
| navigation (maze, push, patrol, keys, collect) | 0.538 | 0.167 | 0.001 |

**Held-out (unseen):**

| category | new | legacy | random |
|---|---|---|---|
| non-avatar (swap, symmetry, dropstack, logicpanel, eliminate) | 0.119 | 0.000 | 0.003 |
| click-heavy (swap, symmetry, dropstack, logicpanel, eliminate) | 0.119 | 0.000 | 0.003 |
| temporal (dropstack) | 0.051 | 0.000 | 0.002 |
| hidden-state (swap, logicpanel) | 0.266 | 0.000 | 0.000 |
| navigation (bridgekey) | 0.004 | 0.000 | 0.000 |

* **Non-avatar and click-heavy games:** the previous agent scores 0 on them. It has no clicks, so in click-only games it has no usable action at all, and it has no model without an avatar. The new agent reaches 0.26–0.30 on dev and 0.12 held-out.
* **Temporal:** patrolling hazards (dev patrol 0.43) are handled by autonomous rules and planning through them. Conditional motion (timedstop) and gravity with animation (dropstack) are not.
* **Hidden state:** invisible selection (rotsel), hidden modes (modepaint), carried keys (keys) and the hidden boolean function (logicpanel) are handled through latent features and the inventory. Hidden two-click selection whose effect is an exchange (swap) is not.

## 18. Cross-level transfer

Efficiency is baseline/actions on the levels an agent completed, for level 1 against later levels. The same agent without memory across levels is shown for comparison.

**Dev synthetic:**

| agent | level 1 | levels 2+ | completed L1 | completed L2+ |
|---|---|---|---|---|
| new | 0.497 | 0.748 | 48/60 | 75/120 |
| new:-goals | 0.497 | 0.769 | 48/60 | 66/120 |
| new:-memory | 0.497 | 0.559 | 48/60 | 69/120 |
| legacy | 0.498 | 0.593 | 14/60 | 22/120 |

**Held-out synthetic:**

| agent | level 1 | levels 2+ | completed L1 | completed L2+ |
|---|---|---|---|---|
| new | 0.278 | 0.594 | 17/30 | 13/60 |
| new:-goals | 0.284 | 0.468 | 17/30 | 13/60 |
| new:-memory | 0.284 | 0.307 | 17/30 | 15/60 |
| legacy | - | - | 0/30 | 0/60 |

**Held-out community games** (baselines partly imputed, see section 1):

| agent | level 1 | levels 2+ | completed L1 | completed L2+ |
|---|---|---|---|---|
| new | 0.343 | 1.128 | 78/213 | 103/952 |
| legacy | 0.343 | 0.779 | 60/214 | 150/956 |

What carries over:
* the program (rules per context),
* the contact model,
* goal templates confirmed at level ends,
* lose predicates.

Later levels are played more efficiently than first levels (baseline/actions on completed levels):
* dev: 0.50 → 0.75;
* held-out: 0.28 → 0.59.

Without memory the later-level efficiency is 0.56 on dev and 0.31 held-out. Removing memory across levels costs 0.16 of score on dev and 0.07 held-out. Removing only the goal memory costs 0.03 and 0.04.

On the held-out community games the new agent is faster than the previous one on the later levels it completes (1.13 vs 0.78, against partly imputed baselines), but it completes fewer of them (103 vs 150).

## 19. Composition hold-out

`bridgekey` composes a click switch, a rotating bridge segment over water, walking, a carried key, a door and a goal. It was never run before the freeze.
* The new agent completed 0.4 of 3 levels on average (score 0.004). The previous agent completed none.
* Level 1 is sometimes completed. The walk, the contact model (bridge walkable, water refused, key collected, door opened) and the goal (`reach` the goal colour) are all learned.
* **Why level 2 fails.** This is a post-hoc trace of seed 1 with the frozen agent (analysis only, no change made).
  1. When the switch is clicked, the bridge rotates and the cells it uncovers show *water*.
  2. The simulator paints cells uncovered by a rotation with background, because the underlay is modelled for movers only.
  3. So the correct rule, "a click on the switch rotates the bridge", predicts events that did not happen and is rejected.
  4. The switch's context therefore stays unexplained (coverage 0), and the planner cannot use it on level 2.

  The components compose; one missing piece of the simulator (underlays for any shape change) breaks the chain.

## 20. Action efficiency

Every score here is efficiency-weighted: (baseline/actions)², with baselines that are BFS-optimal for synthetic games and upper-median human for official ones. Further evidence is in section 18 (efficiency on completed levels) and in the "first level (actions)" and "wasted experiments" columns of section 21. A wasted experiment is an exploration step whose correctly predicted outcome was "nothing changes".

## 21. Transition prediction accuracy

Two measures:
* **own-step:** before every action the agent predicts the next logical frame, and the prediction counts as correct only if the whole frame matches;
* **counterfactual probes:** after K = 1, 2, 4, 8, 16, 32 actions of level 1, the agent predicts the next frame for every simple action and for clicks on up to 8 objects. The truth comes from the game's `peek` (no action is spent). Unknown contexts count as wrong.

**Dev synthetic:**

| agent | own-step prediction | counterfactual K=1 / 2 / 4 / 8 / 16 / 32 | reliable after (actions) | first level (actions) | wasted experiments | resets | think s/game |
|---|---|---|---|---|---|---|---|
| new | 78.0% of 4877 | 11% / 45% / 65% / 69% / 81% / 74% | 11.9 (56/60) | 14.4 (48/60) | 702 | 77 | 6.6 |
| new:-ig | 77.8% of 6115 | 30% / 42% / 52% / 56% / 67% / 66% | 11.6 (59/60) | 21.1 (29/60) | 2612 | 35 | 6.5 |
| new:-goals | 79.6% of 5124 | 11% / 45% / 65% / 69% / 81% / 74% | 12.1 (57/60) | 14.4 (48/60) | 682 | 84 | 8.5 |
| new:-memory | 81.1% of 4896 | 11% / 45% / 65% / 69% / 81% / 74% | 14.0 (50/60) | 14.4 (48/60) | 732 | 41 | 7.4 |
| new:-plan | 84.2% of 7165 | 11% / 45% / 65% / 79% / 91% / 86% | 9.2 (54/60) | 28.5 (31/60) | 1259 | 19 | 1.5 |
| new:-latent | 74.2% of 5058 | 11% / 45% / 66% / 76% / 85% / 62% | 9.4 (55/60) | 21.0 (47/60) | 910 | 64 | 5.0 |
| new:-ticks | 79.8% of 5135 | 11% / 45% / 64% / 65% / 81% / 72% | 12.1 (55/60) | 17.4 (48/60) | 705 | 81 | 5.7 |
| new:-physics | 72.9% of 6339 | 10% / 43% / 65% / 80% / 89% / 84% | 10.3 (54/60) | 22.8 (38/60) | 928 | 56 | 4.6 |
| new:-experiments | 78.1% of 4931 | 11% / 45% / 65% / 69% / 81% / 75% | 11.8 (56/60) | 16.3 (49/60) | 721 | 76 | 6.4 |
| new:-spec | 80.6% of 4961 | 11% / 45% / 65% / 69% / 81% / 74% | 11.9 (56/60) | 14.4 (48/60) | 744 | 76 | 6.9 |
| legacy | - | - / - / - / - / - / - | - | 20.4 (14/60) | - | 1 | 0.1 |
| random | - | - / - / - / - / - / - | - | 55.8 (13/60) | - | 20 | 0.0 |

**Held-out synthetic:**

| agent | own-step prediction | counterfactual K=1 / 2 / 4 / 8 / 16 / 32 | reliable after (actions) | first level (actions) | wasted experiments | resets | think s/game |
|---|---|---|---|---|---|---|---|
| new | 91.4% of 2377 | 3% / 45% / 61% / 77% / 91% / 92% | 9.8 (26/30) | 20.0 (17/30) | 542 | 44 | 2.4 |
| new:-ig | 93.0% of 2428 | 48% / 68% / 68% / 62% / 61% / 78% | 5.8 (29/30) | 14.8 (13/30) | 1922 | 32 | 1.0 |
| new:-goals | 91.8% of 2383 | 3% / 45% / 62% / 77% / 90% / 92% | 9.7 (26/30) | 18.9 (17/30) | 546 | 42 | 2.1 |
| new:-memory | 90.6% of 2316 | 3% / 45% / 62% / 77% / 90% / 92% | 9.7 (25/30) | 18.9 (17/30) | 548 | 51 | 2.0 |
| new:-plan | 92.5% of 2354 | 3% / 45% / 57% / 75% / 92% / 91% | 9.7 (26/30) | 8.5 (11/30) | 686 | 44 | 0.5 |
| new:-latent | 91.4% of 2365 | 3% / 45% / 62% / 75% / 89% / 92% | 9.5 (26/30) | 14.4 (17/30) | 521 | 44 | 1.6 |
| new:-ticks | 91.7% of 2377 | 3% / 45% / 62% / 81% / 90% / 92% | 9.6 (26/30) | 18.9 (17/30) | 542 | 44 | 1.8 |
| new:-physics | 91.6% of 2377 | 3% / 45% / 60% / 76% / 89% / 90% | 10.2 (26/30) | 10.5 (15/30) | 693 | 44 | 1.3 |
| new:-experiments | 90.9% of 2375 | 3% / 45% / 62% / 77% / 90% / 92% | 9.8 (26/30) | 19.1 (17/30) | 539 | 46 | 1.4 |
| new:-spec | 91.5% of 2377 | 3% / 45% / 62% / 77% / 90% / 92% | 9.7 (26/30) | 19.6 (17/30) | 543 | 44 | 1.8 |
| legacy | - | - / - / - / - / - / - | - | - | - | 0 | 0.2 |
| random | - | - / - / - / - / - / - | - | 26.0 (7/30) | - | 27 | 0.0 |

**Held-out community games:** own-step prediction 63.0% of 28763 steps (section 24). **Official games:** ft09 82/438, vc33 157/1355, ls20 0/2418.

* On synthetic games the program becomes predictive quickly. After 8 actions, 69% (dev) and 77% (held-out) of all counterfactual next frames are exactly right; after 16, 81% and 91%.
* The "reliable after" column is the first action from which 5 consecutive own-step predictions were exact: about 10–12 actions.
* The `-ig` variant is more accurate on the first probes (K = 1–2) but less accurate from K = 8 on (dev 56% vs 69%, held-out 62% vs 77%), and it scores far worse.
* Own-step accuracy is higher on the held-out families (91%) than on dev (78%), while the score is far lower. Predicting the next frame is necessary for planning, but it does not show that the goal is understood.

## 22. Ablations (same environment-action budget for every variant)

Every variant plays the same games (12 dev families and 6 held-out families, 5 seeds each) with the same environment-action budget (5× the per-level BFS-optimal baselines, summed; RESET counts). Frozen commit. Differences are against the full agent.

| variant | what is removed | dev score | dev levels | held-out score | held-out levels |
|---|---|---|---|---|---|
| `new` | full agent | 0.376 | 123/180 | 0.100 | 30/90 |
| `new:-ig` | no information-gain exploration (random choice among candidates when no plan) | 0.203 (-0.173) | 67/180 | 0.011 (-0.089) | 20/90 |
| `new:-goals` | no goal learning across levels (grammar priors only) | 0.346 (-0.029) | 114/180 | 0.060 (-0.040) | 30/90 |
| `new:-memory` | no memory across levels (program, contact model, goals reset each level) | 0.216 (-0.160) | 117/180 | 0.031 (-0.069) | 32/90 |
| `new:-plan` | no planning (exploration and experiments only) | 0.073 (-0.302) | 49/180 | 0.119 (+0.019) | 24/90 |
| `new:-latent` | no latent splits / latent novelty | 0.345 (-0.030) | 109/180 | 0.120 (+0.020) | 33/90 |
| `new:-ticks` | no autonomous rules | 0.353 (-0.023) | 118/180 | 0.100 (+0.000) | 31/90 |
| `new:-physics` | no contact model (every non-background colour blocks) | 0.199 (-0.177) | 85/180 | 0.099 (-0.001) | 29/90 |
| `new:-experiments` | no experiment sequences | 0.377 (+0.001) | 124/180 | 0.099 (-0.001) | 31/90 |
| `new:-spec` | no navigation specialist | 0.373 (-0.003) | 122/180 | 0.100 (+0.000) | 31/90 |
| `legacy` | previous agent (c4-arc3-world.js) | 0.070 (-0.306) | 36/180 | 0.000 (-0.100) | 0/90 |
| `random` | uniform over available actions, random click pixels | 0.000 (-0.375) | 17/180 | 0.003 (-0.097) | 8/90 |

Full per-family ablation tables are produced by `node tools/arc3-report.js arc3-results/dev-frozen.json` (and `holdout-synth.json`).

**What matters on dev:**
* planning (−0.30),
* the contact model (−0.18),
* information-gain exploration (−0.17),
* memory across levels (−0.16).

Latent state, autonomous rules and goal memory each add 0.02–0.03. Experiment sequences and the specialist are neutral in aggregate: they help a few families and cost a few others.

**What matters held-out:**
* information-gain exploration (−0.09),
* memory across levels (−0.07),
* goal memory (−0.04).

Planning and latent splits are *slightly harmful* held-out (+0.02 without them). The likely reading, not verified game by game: with a wrong program or a goal outside the grammar, plans spend actions confidently on the wrong thing. That is the dev/held-out gap from another angle.

## 23. Runtime

Node 22, one core per game, frozen commit. Mean deliberation time per game (3 levels):

| agent | dev synthetic s/game | held-out synthetic s/game |
|---|---|---|
| `new` | 6.6 | 2.4 |
| `new:-ig` | 6.5 | 1.0 |
| `new:-goals` | 8.5 | 2.1 |
| `new:-memory` | 7.4 | 2.0 |
| `new:-plan` | 1.5 | 0.5 |
| `new:-latent` | 5.0 | 1.6 |
| `new:-ticks` | 5.7 | 1.8 |
| `new:-physics` | 4.6 | 1.3 |
| `new:-experiments` | 6.4 | 1.4 |
| `new:-spec` | 6.9 | 1.8 |
| `legacy` | 0.1 | 0.2 |
| `random` | 0.0 | 0.0 |

**On the official engine:**
* The new agent thinks for 11.3 s per held-out community game on average (at most 181 s).
* Official games: ls20 240 s, ft09 81 s, vc33 30 min (stopped by the per-game cap after 1379 of 1535 actions).
* Big pixel-level boards dominate the cost: induction over many events, and planning over many objects and background cells.
* Every action has a 1 s deliberation deadline and a node budget, so the agent is anytime, and wall-clock load changes results slightly (section 25).
* The previous agent thinks for about 0.1 s per game.

## 24. Official ARC-AGI-3 public games and held-out community games

**How the runs were made.**
* Commit `6353398`; `tools/arc3-official.js --frozen 6353398236c9`. The tool refuses to run held-out or official games unless HEAD is that commit and the agent sources are unmodified.
* The official engine was driven through `tools/arc3-bridge.py`.
* Integrity: the official files' sha256 matched `ARC3-EVAL-PROTOCOL.md`, and so did the aggregate hash over all 252 game files.
* Each set was run once. Nothing was changed after seeing any result.
* Every agent got the same budget per game (5× the sum of the per-level baselines) and the same wall-clock cap (4 min per community game, 30 min per official game).

**Official public games** (the official downloads with official human baselines; 3 of the 25 public games, the rest need the blocked API):

| game | levels | budget | new agent | previous agent |
|---|---|---|---|---|
| ls20-cb3b57cc | 7 | 2440 | 0.000, 0 levels, 2440 actions, 18 resets | 0.000, 0 levels, 2440 actions, 18 resets |
| ft09-9ab2447a | 6 | 455 | 0.000, 0 levels, 455 actions, 10 resets | 0.000, 0 levels, 455 actions, 13 resets |
| vc33-9851e02b | 7 | 1535 | 0.000, **2 levels** (595 and 232 actions vs baselines 6 and 13), 1379 actions, 22 resets, stopped by the 30-min cap | 0.000, 0 levels, 1535 actions |
| **mean** | | | **0.000** (0.0001 without the 5× cutoff, i.e. 0.008 of 100 points; vc33 alone 0.0002) | **0.000** |

This is the genuine result: no official game was scored.

**Post-hoc aggregate analysis of ls20** (40 steps of the frozen agent; aggregate statistics only, no frames or game code inspected):
* The lattice resolves to 1-pixel cells (64×64, 18 objects).
* About 52 cells change per step (at least 2, even when nothing moves). 375 cells were classified as noise.
* 36 of 36 next-frame predictions were wrong. Over the full run only 0 of 2418 own-step predictions were exactly right.

A plausible reading, marked as a hypothesis: something changes on every step (for example a countdown). The DSL's `shrink` removes one cell, not a line, so it cannot express this, and the resulting game-overs (18 resets) consume the budget.

**Held-out community games** (214 third-party games on the official engine, never run before the freeze; 148 of them list fewer baselines than levels, and their missing baselines were imputed as described in section 1):

| | new agent | previous agent |
|---|---|---|
| mean score | **0.040** | **0.065** |
| mean score without the 5× cutoff | 0.041 | 0.065 |
| games with at least one level | **78** / 214 | 60 / 214 |
| levels completed | 181 / 1165 | **210** / 1170 |
| games where this agent scored higher | 14 | **41** |
| games both scored 0 | 154 | 154 |
| efficiency on completed level-1s (baseline/actions) | 0.343 | 0.343 |
| completed later levels | 103 / 952 | **150** / 956 |
| own-step next-frame prediction | 63.0% of 28763 | — |
| RESETs | 400 | 315 |
| think time per game | 11.3 s | 0.1 s |

Notes:
* The totals differ by one game (1165 vs 1170 levels). The new agent's `pj01` run was stopped by an exception inside the engine: `'list' object has no attribute 'shape'`, raised inside the engine or game code during one of the agent's actions. It is counted as 0.
* One reasoning exception (`rz01`) was caught by the agent's fallback. The game continued.

The new agent reaches more first levels (clicks, non-avatar games) but plays navigation games less efficiently than the specialised previous agent. Its discovery costs actions that the squared efficiency metric punishes, and it completes fewer later levels.

**Dev community games** (35 games, the only ones used during development, for interface debugging): see section 12.

## 25. Bottlenecks, honestly

1. **The dev/held-out gap is the result.**
   * Synthetic: 0.376 on the families the agent was developed on, 0.100 on unseen compositions.
   * Community: 0.040, against 0.065 for the old navigation agent.
   * Official: 0.

   The architecture is general in form (programs of rules over objects, latent state, contact semantics, goal grammar), but its *vocabulary* was grown on 12 dev families and 35 dev games. Unseen mechanics mostly fall outside it.
2. **Missing DSL pieces, each verified on a held-out trace after the freeze** (no change made):
   * `swap`: a second click exchanges the colours of the clicked and the previously clicked tile. "Recolour to the other object's colour" is not an operator.
   * `bridgekey`: shapes that rotate over another colour uncover the wrong colour (no underlay for non-movers).
   * `symmetry`: mirror symmetry is not a goal predicate. Levels complete only by chance, inefficiently.
   * `dropstack`: column heights matching a skyline is not a goal predicate.
   * `eliminate`: "no object shaped like the legend" is not a goal predicate. Wrong clicks are learned as deadly contexts only after dying.
   * On dev games:
     * relational rules (`sequence`: click the colour that comes next in a shown order);
     * conditional autonomous motion (`timedstop`: a mover that follows a loop until frozen);
     * trails (a mover leaving colour behind, seen on dev engine games and deliberately *not* added, per the protocol's "dev games for interface debugging only").
3. **Discovery is expensive under a squared efficiency metric.**
   * The first level of a game costs about 15–20 actions. The BFS-optimal level-1 baselines are 1–17 (median 5) on dev families and 1–27 (median 2) on held-out families.
   * Every untested context gets one experiment.
   * The agent pays for generality where the old agent's hard-coded navigation prior is free. This is the main reason the old agent wins on the navigation-heavy community suite.
4. **Pixel-level games.**
   * When the lattice resolves to 1-pixel cells (ls20, pattern games), objects are big and events many, and single-cell operators (grow, shrink) no longer describe line-wise changes.
   * Predictions collapse (ls20: 0/2418) and thinking is slow (up to 3 min per community game, the 30-min cap on vc33).
5. **The simulator is exact but brittle.**
   * Rules must predict whole events.
   * The noise tolerance (⌊n/8⌋ contradictions, coverage ≥ 0.6 for planning, the noise mask for plan checks) helps.
   * But one unmodelled side effect in a context still makes it unusable, as in `bridgekey`.
6. **Goal inference is hypothesis ranking, not understanding.**
   * The first level of every game is played on grammar priors.
   * Weights transfer only when a template recurs.
   * Goals outside the grammar are reached only by accident.
7. **Anytime deliberation makes results load-dependent.** There is a 1 s deadline per action. Two dev runs of the frozen code under different machine load gave 0.378 and 0.376. With an earlier 400 ms deadline, runs of one code state varied by up to 0.02.
8. **Not done from the brief.**
   * No learned (neural) world-model refinement.
   * No learned edit proposers.
   * No MCTS.
   * No adversarial curriculum.
   * No meta-learning across games (goal and contact priors are hand-set, not learned from a game distribution).
   * No use of human replays.
   * Only 3 of the 25 official public games could be run (API blocked).
