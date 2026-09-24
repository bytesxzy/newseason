# CELL4 reasoning upgrade: report

This covers the Tier 1-4 architecture work on CELL4's shared reasoning
core, measured against baselines saved before any change
(`measurements/pre-100x/`).

Everything runs locally and deterministically. No external model or API is
used anywhere. ARC and ARC-3 reasoning never touch the network. The
language stack uses the network only in TOOL mode, and closed/tool scores
are never mixed. **Actual HLE was not run.** The ARC-3 numbers come from
synthetic environments and are **not an ARC-AGI-3 score**.

## 1. What changed, by tier

### Tier 1: search that does not repeat itself, and reasons in the right frame

| Component | File | What it does | Live path |
|---|---|---|---|
| Canonical program forms | `c4-arc/src/09c-canonical.js` | dihedral group table derived from the primitives, idempotence, commutation with equivariant operators, bounded saturation; structural / behavioural / semantic keys | synthesis dedupe, version space, macros, population search |
| Fast grid identity | `c4-arc/src/00-grid.js` | 53-bit grid hashes, direct-compare `gEq`; **fixed `antiTranspose`**, which was identical to `transpose` (24,000 property checks, 0 mismatches after the fix) | everywhere |
| Incremental synthesis | `09a-synthesis.js` | numeric state keys, exact render keys, per-step evaluation, near-miss emission (≤ 2 per signature) | typed synthesis (2.2-2.4× faster at equal work) |
| Candidate traces | `c4-arc/src/55a-candidate.js` | every solver family offers its near-misses (per-module / per-cluster / global caps, eval budget) | refinement seeds |
| Representation registry | `c4-arc/src/17-representation.js` | frames (roles, canonical colours, 7 dihedral, crop, largest, strip, change, downscale, tile base) and views; evidence scored against raw; migrating a program between representations | `represent` solver module, repair, re-framing |
| Residual diagnoses | `55-residual.js` | representation-level vs program-level failures (wrong colour roles, wrong frame, wrong segmentation, missing composition ...) | kernel operation choice |
| Population search | `c4-arc/src/56a-popsearch.js` | MAP-Elites / Pareto archive, 17 mutation classes, multi-edit, crossover, depth ≤ 6 | refinement stage when nothing executable exists |
| Test-time adaptation | `c4-arc/src/57b-testtime.js` | operator / representation / mutation priors from the task's own demonstrations (pseudo-held-out folds), discarded after the task | refinement stage |

### Tier 2: abstractions, learned control, discrimination

| Component | File | What it does |
|---|---|---|
| Macro library | `56b-macros.js`, generated `56c-macro-library.js`, `tools/arc-macros.js` | fragments mined from solved synthetic programs, anti-unified, accepted **only** if they improve held-out compositions; loaded as a separate macro alphabet (2-bit escape, so existing code lengths are unchanged); in synthesis they *extend* each level on their own capacity and beam slots, never displacing a base-operator state |
| Working / episodic / semantic / procedural / abstraction memory | `c4-reason-memory.js` | compact reasoning trace (CONFIRMED / UNRESOLVED / REFUTED / PLAN / ABSTRACTIONS / COUNTEREXAMPLES); episodic store refuses answer/output fields |
| Learned meta-controller | `c4-reason-meta.js`, generated `57a-repair-policy.js` | ridge regression per kernel operation over sparse search-state features, trained on synthetic trajectories including failures; `allocate()` for fast/deep compute |
| Kernel 2.0 | `c4-reason-kernel.js` | 13 operations incl. PROPOSE_REPRESENTATION, GENERATE_DISCRIMINATOR, INVENT_ABSTRACTION, VERIFY_DEEPLY, RESTART_DIVERSE; richer hypotheses (representation, semantic key, novelty, counterexamples) |
| Active counterfactuals | `58-counterfactual.js` | 12 plausible input mutations; hypotheses that agree on every demonstration are told apart by where they disagree, without labels |
| Semantic pass@2 | `50-portfolio.js` (`PASS2`) | the second guess is a genuinely different reading, not a near-duplicate |
| Version space by semantics | `09b-vspace.js` | one weight per semantic class, not per spelling |

### Tier 3: language reasoning

| Component | File | What it does |
|---|---|---|
| Exact tools | `c4-lm-tools.js` | 39 tools (matrices, rational equations, Bayes, statistics, units, CSP with AC-3, sums, a bounded interpreter, root finding, optimisation, graphs ...). Every verifier is **independent of the executor** and judges the returned value |
| Deliberation | `c4-lm-deliberate.js` | SOLVER / CRITIC / VERIFIER / SELECTOR over candidates from the tools, the problem reasoner, the operator library and dimensional analysis. It checks substitution into the question's own equation and flags readings that leave givens unused. Independence is counted per reading, not per method; independent checks are weighed above self-checks; eloquence never counts |
| Structured problems | `c4-lm-problem.js` | `structure()`: givens, unknowns, equations, claims, required knowledge, possible tools, classes (computation / reasoning / knowledge / mixed / retrieval / multimodal / under-determined / ambiguous) |
| Evidence | `c4-lm-evidence.js` | claims that SUPPORT the asked relation vs claims that merely MENTION the subject; source independence by origin (Wikipedia + Wikidata + Wiktionary are one origin); contradiction groups; knowledge-gap detection |
| Retrieval | `c4-lm-retrieve.js` | aliases the document states for itself, subquery phrase locks, identity dominance for definitional questions |
| Modes | `c4-lm.js` | per-call `evaluationMode: "closed"` (network off) or `"tool"`; exact-tool readings take over only when a verified tool reading wins |

### Tier 4: ARC-3-style interactive reasoning (`c4-arc3-world.js`)

* **BeliefSet of WorldModels.** Three models compete after every level:
  mechanics carried over, action map redrawn, and roles redrawn. Each is
  weighted by how well it predicted each transition. One contradicted action
  demotes the whole carried-over map.
* **Hierarchical options:** goal, probe an unknown action, prerequisite,
  enable (chained: "the key opens the door around the button that removes
  the barrier"), collect, retest a stale blocker, test an untested object.
* **Causal memory as hypotheses.** Covers bump effects, delayed effects
  attributed to recent silent contacts, and conjunctive hidden-state
  preconditions (a version space over the invisible inventory). Also:
  goal prerequisites, irreversible harm, and state-conditioned tests (a
  failed test is stale once the hidden state changed).
* **Risk and information gain.** The risk of an unknown action is the mean
  contact risk over the directions it could still map to. Planning is
  safe-first and teleport-aware. Disagreement between models counts as
  information gain.
* **Perception fix.** In framed levels the wall colour can outnumber the
  floor, which made the floor register as an object. Border frames no
  longer vote for the background, and reshaped regions are no longer
  reported as vanished.

### One reasoning core for ARC, ARC-3 and language

The kernel, memory and meta modules load **once per page or process**. The
ARC bundle embeds them, the language stack loads them standalone, and
whichever loads second reuses the first. What is shared:

* ARC refinement, ARC-3 option segments and language deliberation rounds
  all log to the same meta hub, as the same kernel operations.
* The learned operation model drives ARC refinement.
* `allocate()` (fast vs deep) drives language deliberation.
* One calibration function, `K.calibrate`, produces confidence everywhere.

ARC-3 and the language stack do not yet *use* the learned operation model
for their own decisions (see section 13).

### Budget discipline

`59-equivariant.js` re-framing used to run **after** the task budget (up to
+50%). In the first full run of this work, 121/400 ARC-1 tasks took over 4 s
under a 3 s budget. Re-framing now comes out of the same budget. Frames
with positive evidence make the base solve anytime: if nothing fits by 2/3
of the budget, it wraps up by 5/6 and the frame gets the rest. The old
post-budget behaviour only happens when `reframe_budget` is passed
explicitly.

## 2. ARC-1 / ARC-2 (equal budget: 3 s per task, 3 workers)

<!-- ARC-FINAL -->

## 3. Synthetic generalisation (no ARC data)

Held-out corrupted programs (curriculum v2, 300 items, 1-5 edits, equal
time; `measurements/arc-curriculum-v2.json`):

| Controller | Recovery | Generalises to unseen input |
|---|---|---|
| legacy repair order (pre-change policy) | 0.340 | 0.313 |
| legacy learned policy | 0.363 | 0.343 |
| regenerated repair policy | 0.400 | 0.373 |
| learned meta-controller | 0.437 (0.507 in the previous run) | 0.413 (0.490) |
| meta-controller + population search | **0.847** (0.837) | **0.807** (0.800) |
| equal time, refinement only | 0.753 | 0.713 |
| equal time, refinement + population search | 0.823 | 0.780 |

Evaluation runs under a wall-clock budget per item. The meta-controller
alone moved by 0.07 between two runs of the same model, so its gain over
the legacy policy is +0.07 to +0.14. Meta-controller + population search
was stable across both runs.

Macros (`measurements/arc-macros.json`): with macros *extending* the search
(see section 7), 2 of 10 mined candidates survive held-out acceptance and
backward elimination. On a separate held-out test split of compositions:
**35/120 → 41/120** (depth 3: 19 → 21, depth 4: 10 → 13, depth 5: 6 → 7).

A first scheme mixed macros into each level's operator list. It accepted 6
macros and scored 34 → 54/120 on the same split, but on ARC-1 it displaced a
base-operator program (`rot270(connect(rot90($)))`) and was replaced.

Deduplication: 82% of generated programs in a mixed synthetic set are
canonical duplicates, and 100% of dihedral re-spellings collapse.

<!-- ABLATION -->

## 4. ARC-3-style synthetic environments (not ARC-AGI-3)

`tools/arc3-synth.js`, 30 games × 3 levels (seed 1):

| | before | after |
|---|---|---|
| completion (with cross-level transfer) | 0.811 | **0.900** |
| game over / timeout | 11 / 6 | 9 / 0 |
| action semantics correct | 0.908 | 0.958 |
| steps, first level / later levels | 20.5 / 18.0 | 12.2 / 8.7 |
| completion without transfer | 0.644 | 0.767 |

Harder mechanics (`--suite hard`, 11 suites × 30 levels, seed 1):
**0.736 → 0.873**; timeouts 76 → 29.

| suite | before | after |
|---|---|---|
| ambiguous actions | 1.000 | 1.000 |
| action map changes each level | 0.967 | 1.000 |
| two-stage key → door → button → barrier | 0.767 | 0.867 |
| button + teleport | 0.600 | 0.867 |
| delayed effect | 0.933 | 0.867 |
| false goals | 0.967 | 1.000 |
| multiple goals | 1.000 | 1.000 |
| irreversible trap | 0.633 | 0.733 |
| hidden state (invisible key) | 0.100 | 0.767 |
| resource required | 0.800 | 1.000 |
| multi-mechanic | 0.333 | 0.500 |

Held-out seeds, where the pre-change agent is loaded from git and runs the
same environments:

| seed | basic before → after | hard before → after |
|---|---|---|
| 2 | 0.789 → 0.878 | 0.752 → 0.918 |
| 3 | 0.756 → 0.867 | 0.712 → 0.915 |
| 4 | 0.778 → 0.856 | 0.742 → 0.888 |

World-model revision (`tools/arc3-world-test.js`), after the action map is
redrawn:

* The BeliefSet switched to the redrawn-actions model in 20/20 games,
  every time within two contradicting moves.
* The revised semantics were correct in 17/20 games.
* With persistent mechanics, the carried-over model stayed most probable
  at 30/30 level starts.
* Hidden-state bump preconditions were learned correctly in 26/26 levels.
* Later key/door levels took 10 steps against 30 for the first level.

## 5. Language and reasoning

| suite | before | after |
|---|---|---|
| `npm run lm:robust` | 48/48 | 50/50 (48 unchanged + syntax checks of the 2 new files) |
| `npm run lm:heldout3` (frozen held-out v3) | 34/36 | 34/36 |
| `npm run reason:synth` (256 problems) | 256/256 | 256/256 |
| generated hard computations, closed mode, seed 17 (`tools/lm-hard-synth.js`) | 49/144 | **144/144** |
| same, seed 29 | 49/144 | **144/144** |

In the hard-computation set, before → after, the determinant, rank, median,
variance, Bayes, power-sum, quadratic-minimum and subset-count families
went from 0-1/12 to 12/12 each. Mean, rational equations, unit conversion
and the arithmetic control were already 12/12 and stayed there. Seed 5 was
used to find a bug (an optimum at x = 0 was dropped) and is not counted.

The set measures whether hard computations are **read and verified**
correctly. It is generated by me alongside the tools, so it measures tool
coverage, not general exam ability. **Actual HLE was not run.**

Deliberation (`tools/lm-deliberate-test.js`, 31 checks): a fluent, longer,
self-"checked" derivation with a sign error loses to a plain derivation
verified by substitution. Three methods sharing one misreading lose to one
independently verified reading. A self-checked fragment ("+ 3") fails
substitution. Closed mode never calls the network and abstains on a
knowledge gap. Tool mode accepts evidence only from ≥ 2 independent
origins that support the asked relation; mentions alone are not evidence.

## 6. Runtime

<!-- RUNTIME -->

## 7. What did not help, or not yet

* **Population search and test-time adaptation on real ARC failures.**
  Both help on synthetic curricula (above). On ARC-1 no-candidate tasks,
  population search ran on 131 tasks and found 0 exact programs, and
  test-time adaptation validated 0 fold programs. The near-misses of real
  failures are too far from any program in the vocabulary.
* **Macros mixed into the operator list displaced base-operator
  programs.** Under a fixed beam, macro children used up each level's
  expansion capacity; on ARC-1 this lost 40853293. Macros now *extend* the
  search: base operators first, exactly as without macros, then macros on
  their own capacity and beam slots. The accepted set shrank from 6 to 2,
  and the held-out gain from +20 to +6. Part of the larger figure came from
  crowding.
* **The meta-controller's ranking accuracy is modest** (0.59 on held-out
  trajectories). Its gain on the curriculum is real (0.363 → 0.507), but it
  is a weak ranker.
* **Re-framing** contributes a few ARC tasks. The earlier measurement (0
  top-1) and this one (2 top-1, via the colour-roles frame) are within
  run-to-run noise of each other.
* **The first ARC-3 level with an untested hazard is a coin flip.** Nothing
  distinguishes a hazard from a goal before contact. Structural priors
  (e.g. "the rarer colour is the goal") were rejected as tuning to my own
  environments.
* **Delayed effects in the hard ARC-3 suite** varied between 0.867 and
  1.000 across versions: noise at 30 levels.

## 8. Intentionally rejected

* Any external model or API, anywhere.
* Task-ID conditionals, answer tables, test-output access. The bench
  throws on test-output access.
* Hand patches from inspecting ARC failures. Hand edits of the generated
  engine, `57a-repair-policy.js` or `56c-macro-library.js`: all three are
  regenerated by their tools.
* Retraining any policy on ARC outcomes.
* HLE questions in the knowledge base.
* Mixing closed and tool scores.
* A colour-number tie-break in the ARC-3 agent. It was biased (it always
  tested the lowest colour first) and was replaced by "nearest first".
* Letting language or ARC-3 logging drive decisions before a model is
  trained for them.

## 9. Largest remaining bottleneck

ARC NO_CANDIDATE tasks (about 120 on ARC-1): no program in the current
vocabulary fits the demonstrations, and repair or population search cannot
bridge that distance. Search efficiency is no longer the limiting factor.
The limit is the space of object and relational abstractions the
vocabulary can express.

## Reproduce

    npm test
    npm run arc:nopolicy            # ARC-1, no planner
    npm run arc:clean               # ARC-1, clean planner
    node c4-arc/bench.js --policy-mode legacy --budget 3 --jobs 3 --out results/arc1-legacy
    node c4-arc/bench.js --prefix arc2_ --end 150 --policy-mode none --budget 3 --jobs 3 --out results/arc2-nopolicy
    node c4-arc/bench.js --policy-mode none --ablate refine --budget 3 --jobs 3 --out results/arc1-norefine
    npm run arc:profile
    npm run arc:ablate
    npm run arc:macros              # regenerates 56c (synthetic only)
    npm run arc:curriculum          # regenerates 57a (synthetic only)
    npm run arc3:synth && npm run arc3:hard && npm run arc3:test
    npm run lm:robust && npm run lm:heldout3 && npm run reason:synth
    node tools/lm-hard-synth.js --n 12 --seed 17
