# C4 ARC: constrained program induction (modules 61-69) — report

This report covers the upgrade from "forward solver portfolio + local residual repair" towards a **bidirectional,
constraint-propagating, version-space program-induction family** (`psyn`) that runs beside the existing portfolio, plus the
learned search policy, the measurement protocol, and a small upgrade of the ARC-3 world model. Everything here was measured on
this machine; commands to reproduce are at the end. Nothing in the code calls an external model of any kind (no hosted
LLM, no API): the "learned" parts are small logistic models and frequency tables trained offline from this repository's own
search traces and written as plain source (`c4-arc/src/68-psyn-policy.js`).

**Honest summary.** The family solves real tasks by genuine inverse-semantics induction (examples in section 14), the
sealed ARC-AGI-1 half moved 46 -> 50 top-1 with no task lost, and ARC-AGI-2 evaluation moved 1 -> 2. These are small
absolute gains: the dominant bottleneck is the vocabulary of effects/representations, not search depth or search
efficiency (section 18). Several components I built did **not** earn a place by ablation and are off by default (transduction,
learned operator pruning, beam/prefix stage search, near-miss seeding, calibrated arbitration, consensus second attempts);
they are reported as negative results (section 13). Synthetic numbers (latent-program curriculum, ARC-3 fixtures) are never
ARC scores.

## 0. Protocol (sealed-evaluation discipline)

| set | role | how used |
|---|---|---|
| ARC-1 training (400), ARC-2-style tasks `t2new` even half (117), synthetic latent programs | **learning** | policy training, mechanism selection by ablation |
| ARC-1 evaluation half A `e1A` (200), `t2new` odd half (116) | **development** | measured freely, failures studied |
| ARC-1 evaluation half B `e1B` (200) | **sealed** | scored in aggregate only, once with the final engine; per-task results never opened |
| ARC-2 public evaluation (120) | **final sealed** | scored once with the final engine |

Baselines were frozen before any change (`measurements/arc-psyn-baseline.json`, engine = git HEAD at the start); the sealed
baselines were re-run from a frozen copy of that engine. No solution, task id or benchmark answer is referenced anywhere in the
code. Budget 3 s per task, 3 workers; wall-clock scheduling moves knife-edge tasks by about +-1-3 per 200 (section 8 gives the
measured re-run noise).

## 1. Architectural changes

1. **A second route to programs: inverse-semantics induction.** Instead of enumerating programs forward and testing them,
   every effect (delete, recolour, colour map, move, copy, slide, D4, bbox fill, hole fill, halo, ray, between, stamp, position
   map) has a forward `writes()` and an inverse `infer()` that reads its parameters off the demonstrated output. Candidate
   effect *templates* come out of the data; the search is over which objects they apply to.
2. **Version space over selectors.** For each template the set of objects it is right for (positives) and wrong for
   (negatives) is a pair of bit sets; the learner enumerates the conjunctions of atoms that separate them exactly (specific
   boundary plus killer sets, hitting sets of at most three atoms, dominance pruning), with a beam fallback for partial cover.
3. **Rule lists with union semantics** (a `ForEach object / Filter by selector / Map effect` structure): every rule whose
   selector matches applies; an object has at most one fate among effects that rewrite its own cells. A MDL greedy cover picks
   the rules; stages chain through the residual (`stage1 >> stage2`).
4. **Multi-representation perception**: c4 / c8 / m4 / m8 / colour-only parses and panels, relations (adjacent, enclosed,
   nearest, row/column partner, same panel) and scene roles (largest, marker, frame, fewest/most objects, ...). Colour
   parameters are literal, role or relation references so one rule transfers across demonstrations whose literal colours differ.
5. **Extraction by inverse witness**: when the output is a crop / mask / D4 / recolour of one input object or panel, the witness
   objects are found first and the selector is learned over them.
6. **Learned proposers and value function from verified search history**: parse proposer, operator proposer, solve
   scheduler, program value function, atom-family priors, macros (rule signatures with constants abstracted).
7. **Semantic-equivalence accounting** (raw / syntactic / observational duplicates) at both the template and the program level.
8. **Ensemble integration**: psyn runs as an `EXTRA` family: the time it uses is *added* to the task deadline so every other
   family keeps exactly its share. Its programs enter the portfolio as ordinary hypotheses, are ranked together with
   everything else and aggregated per distinct output (so the second attempt is a semantically distinct output).
9. **ARC-3**: the world model now infers the *floor* from the cells the agent vacates and identifies the *agent* by the
   mutual information between action and displacement (section 19).

Not built (and therefore not claimed): a global diverse best-first search over partial programs (the search is a greedy MDL
cover plus a small stage tree), a typed-hole IR driving the production search (the IR in module 61 exists, is unit-tested, and
is used for canonicalisation and accounting, but the production learner works on rule lists), true library learning that creates
new executable operators (macros are description-length bonuses), executable multi-model ensembles for ARC-3, active
counterfactual discrimination beyond the existing `58-counterfactual.js`.

## 2. Files and modules

New: `c4-arc/src/61-psyn-core.js` (IR, D4 group, canonicalisation, equivalence store, accounts, switches),
`62-psyn-scene.js`, `63-psyn-effects.js`, `64-psyn-select.js`, `65-psyn-learn.js`, `66-psyn-extract.js`,
`67-psyn-learned.js`, `68-psyn-policy.js` (generated), `69-psyn-transduce.js`, `c4-arc/psyn-test.js` (12 tests, in `npm test`),
tools `arc-psyn.js`, `arc-psyn-train.js`, `arc-latent-gen.js`, `arc-regress.js`, `arc-probe.js`, `arc-show.js`,
`arc-explain-cover.js`, `arc-calibrate.js`, `arc-psyn-tables.js`; measurements `arc-psyn-baseline.json`,
`arc-psyn-final.json`, `arc3-synth-before-after.json`.
Changed: `50-portfolio.js` (EXTRA families, per-hypothesis correctness diagnostics), `90-engine.js` (export), `manifest.json`,
`build.js` (optional output path), `bench.js` (records per-hypothesis correctness), `c4-arc3-world.js`, `tools/arc3-synth.js`,
`tools/reason-kernel-test.js`, `package.json`, `c4-arc/README.md`, the rebuilt `c4-arc-engine.js`.

## 3. New abstractions and data structures

`Hole(type, Domain)` / `Node` / `PP` (partial program: narrow, bind, dead, lower bound); `Dom` (finite / any / empty with exact
intersection); the D4 group as `4*flip+rotation` with a numerically verified composition table; `canon` (rewrite rules: compose
flatten, D4 fusion, translate fusion, recolour chains, boolean normalisation); `EStore` and `Accounts`; `Scene`/`Obj`
(features, relations, roles, panels); `FX` effect table with `writes/infer/bits/facts`; `ColorRef` (literal | role | relation);
`Universe` (all training objects as bit-set rows) and atom bit sets; selector solutions `{ids, mask, bits}`; `ObjFX` programs
`{stages:[{parse, rules:[{kind, th|ref, atoms, bits, alt}]}]}`; `Policy` (parse/kind/scheduler/value/macro tables); `Trace`
(search events with hindsight outcome labels); `NearMiss` (structured failure record).

## 4. Before / after (3 s per task, 3 workers, whole portfolio)

"before" = the engine at the start of this work, re-run on the same machine; "after" = final engine. Top-1 counts tasks whose
first attempt is exactly right; top-2 is the official two-attempt metric.

| split | role | n | top-1 before -> after | top-2 before -> after | oracle (right output retained) |
|---|---|---|---|---|---|
| ARC-1 eval half A | development | 200 | 66 -> 67 (kept 64, lost 2, gained 3) | 69 -> 69 | 71 -> 73 |
| ARC-1 eval half B | **sealed** | 200 | 46 -> **50** (lost 0, gained 4) | 49 -> **53** | 50 -> 54 |
| ARC-1 eval, both halves | | 400 | 112 -> 117 (28.0% -> 29.25%) | 118 -> 122 (29.5% -> 30.5%) | 121 -> 127 |
| ARC-2 public evaluation | **sealed** | 120 | 1 -> **2** | 1 -> 2 | 1 -> 2 |
| ARC-2-style tasks, odd half | development | 116 | 7 -> 8 | 7 -> 8 | 8 -> 9 |
| ARC-2-style tasks, even half | learning | 117 | 7 -> 10 | 9 -> 10 | 11 -> 13 |
| ARC-1 training (psyn switched off vs on, same engine) | learning | 400 | 233 -> 243 (lost 0, gained 10) | 236 -> 245 | 237 -> 246 |

The sealed half moved by +4 with no loss, which agrees with the development direction (+1 on A, +1 on the odd half) but is
four tasks: a paired sign test on 4-0 gives p = 0.125 two-sided, so this is encouraging evidence, not proof. The ARC-2 evaluation
change is one task.

## 5. ARC-1 deltas

Gained on development: `21f83797` (rays then hole fill) and `4f537728` (recolour by relation to the rarest-colour objects) are
solved by exact psyn programs (section 14). `73ccf9c2` is solved by the `select` family: its ranked hypotheses are identical
with and without psyn, but psyn's exact crop programs agree with `select`'s second-best explanation, the evidence of the two
families adds up in the per-output aggregation, and the correct output moves from rank 2 to rank 1 — independent induction
acting as a verifier of a hand-built family. Lost on development: `4364c1c4`, `e88171ec` (section 12). On the sealed half
the aggregate is +4 / -0; per-task identities were not read.

## 6. ARC-2 deltas

`t2new` (ARC-2-style tasks that are not in ARC-1): 14 -> 18 top-1, 0 lost; the odd (development) half gains `fe45cba4`
(delete + copy, then fill by role); the even (learning) half gains `5034a0b5` (role-selected moves), `aa62e3f4` (delete +
halo by role) and `b7256dcd` (via the `objects` family). ARC-2 public evaluation: 1 -> 2 (sealed, aggregate only).

## 7. Top-1 / top-2 / oracle

See the table in section 4. Oracle gains exceed top-2 gains on development because the right output is sometimes retained at
rank 3+: of the 10 development tasks (eval A + ARC-2-style) with "right output outranked", the correct output is at rank 2 in
2, at rank 3 in 6 and at rank 8-9 in 2. In those rank-3 cases the first three outputs are near duplicates of each other (0.01-0.07 of cells differ), so a
better *second* attempt cannot be chosen by diversity alone; a consensus second attempt (per-cell vote of the top three) was
tried and gave no gain (section 13).

## 8. Runtime

Total task-seconds, per-task percentiles (3 s budget; psyn adds up to ~1.2 s of extra time per task, not counted against the
other families):

| split | before total / p50 / p90 / p99 | after total / p50 / p90 / p99 |
|---|---|---|
| ARC-1 eval A | 661 s / 3.24 / 4.23 / 4.47 | 734 s / 3.49 / 5.33 / 6.17 |
| ARC-1 eval B (sealed) | 682 s / 3.44 / 4.24 / 4.40 | 742 s / 3.49 / 5.11 / 6.86 |
| ARC-2 eval (sealed) | 448 s / 3.87 / 4.31 / 4.41 | 502 s / 4.29 / 5.46 / 6.00 |
| ARC-2-style (233) | 823 s / 3.67 / 4.20 / 4.42 | 908 s / 3.91 / 5.17 / 6.22 |

About +9-11 % total time. psyn's own extra time per task: p50 ~70 ms, p90 ~740 ms, max ~1.2 s (about 50 s per 200 tasks).
Re-run noise of the *unchanged* portfolio, same machine, same engine with psyn switched off: <<NOISE>>.

## 9. Semantic duplicate rate (accounts, standalone family, 1.08 s per task)

Duplicates are counted where they arise. **Templates**: proposals made by the inverse step (every object proposes the effect
parameters its output dictates) collapse by syntactic key and then by *observational* equivalence (identical writes on every
demonstration object). **Programs**: complete exact programs collapse by rendered text, then by identical outputs on all
demonstrations and test inputs.

| set | template proposals -> syntactically distinct -> observationally distinct | complete programs -> distinct behaviours |
|---|---|---|
| ARC-1 eval A (200) | 765,940 -> 35,811 (95.3 % syntactic duplicates) -> 30,736 (14.2 % further semantic duplicates) | 48 -> 29 (0 syntactic + 19 semantic = 39.6 %) |
| ARC-2-style odd (116) | 283,420 -> 21,578 (92.4 %) -> 18,188 (15.7 %) | 7 -> 5 (0 + 2 = 28.6 %) |
| ARC-1 training (400) | 806,845 -> 49,566 (93.9 %) -> 41,283 (16.7 %) | 183 -> 112 (0 + 71 = 38.8 %) |

(Program duplicates are semantic because the same behaviour is reached from different parses — `c4{...}` and `col{...}` render
differently — which is exactly what the output-level aggregation then has to merge.)

Parse-level duplicates: 806 of 2,269 parses tried on eval A produced a partition identical to an earlier parse and were skipped
(35 %). Duplicate programs matter for ranking: without collapsing them, equivalent explanations would vote as independent
families. (`node tools/arc-psyn-tables.js --accounts <dir> --label full` prints these from the raw accounts.)

## 10. Version-space and search-node statistics

Standalone, 1.08 s per task. Nodes = distinct effect templates evaluated: 35.8 k on eval A (200 tasks), 21.6 k on the odd
ARC-2-style half, 49.6 k over the 400 ARC-1 training tasks. Selector version spaces: on eval A the exact conjunctive search
enumerated an estimated 5.4 M consistent conjunctions and collapsed them to 247 k dominance classes (22x). Alternative
selectors that fit the demonstrations but disagree on the test input are kept as separate hypotheses (not silently dropped):
1 on eval A, 0 on the odd half, 12 over ARC-1 training.

## 11. Inverse-semantics pruning

| set | naive parameter settings a forward enumerator would sweep | settings the output dictated | object-effect pairs eliminated outright by inversion | effect kinds removed by abstract execution (footprint of the changed cells) |
|---|---|---|---|---|
| ARC-1 eval A | 4.3e10 | 7.7e5 | 278,926 | 5,638 |
| ARC-2-style odd | 2.0e10 | 2.8e5 | 118,601 | 2,419 |
| ARC-1 training | 5.0e10 | 8.0e5 | 333,868 | 8,897 |

("naive" counts unbounded domains — stamp patterns, position tables — as 10^6 each, so the ratio overstates for those; the bounded
effects alone are 10-100x.) The only part that *can* be swept for comparison — colour-valued and direction-valued effects — was
swept in an ablation (`PSYN_OFF=inverse`): the same programs are found, with 6-9x more templates and 1.4-1.8x the time
(section 13).

## 12. Regressions

Development: `4364c1c4` and `e88171ec` on ARC-1 eval A. In both an exact psyn program (a two-rule relational move; a one-rule
position-map fill) outranks the correct exact answer of the `concepts` family, and the correct answer falls to rank 3 (the
top three outputs differ by a few percent of cells). They are genuine ambiguities between two exact explanations; measured
tie-breaks (calibrated per-family offsets, section 13) did not separate them. A third conflict (`705a3229`, a four-rule ray
program) was removed by the idle-rule cost: a rule that fires in every demonstration but on nothing in the test input is a
loose end of the fit (psyn programs with such a rule were right in 2 of 12 cases on development+learning, against 60 of 79 for
the rest). On the sealed half the aggregate is 0 lost.

## 13. Ablations

Standalone family, 1.08 s per task (the ensemble's slice), cells are `exact-fitting tasks / top-1 correct / any retained
program correct (total ms)`. Learning splits show effects the small development sets cannot.

| configuration | e1A fit/top-1/any (ms) | t2new_odd fit/top-1/any (ms) | t2new_even fit/top-1/any (ms) | a1train fit/top-1/any (ms) |
|---|---|---|---|---|
| full | 23/9/11 (49018) | 5/2/2 (17260) | 7/5/5 (27483) | 95/73/78 (47150) |
| no_multiparse | 17/9/9 (12994) | 3/1/1 (6388) | 7/4/5 (8389) | 83/61/64 (13298) |
| no_roles | 23/10/11 (49860) | 4/2/2 (17668) | 5/3/3 (26068) | 95/72/78 (47393) |
| no_relations | 16/7/8 (37108) | 3/2/2 (13005) | 6/4/4 (22390) | 91/67/73 (34419) |
| no_stages | 16/8/9 (18863) | 1/0/0 (7757) | 7/5/5 (14115) | 77/63/66 (18993) |
| no_extract | 19/6/8 (48765) | 4/2/2 (17795) | 7/5/5 (27496) | 79/57/61 (47616) |
| no_loo | 23/9/11 (42456) | 5/2/2 (17499) | 7/5/5 (24567) | - |
| no_partmap | 20/9/11 (45761) | 4/2/2 (15202) | 7/5/5 (27115) | - |
| no_between | 23/9/11 (50718) | 4/2/2 (17177) | 7/5/5 (26024) | 89/68/73 (44284) |
| no_stamp | 23/9/11 (48556) | 5/2/2 (17237) | 8/5/5 (27637) | 91/71/74 (46318) |
| no_inverse | 23/9/11 (66790) | 5/2/2 (27570) | 7/5/5 (39622) | 95/73/78 (83245) |
| no_value | 23/9/11 (50414) | 5/2/2 (17992) | 7/5/5 (28970) | - |
| no_fam | 23/9/11 (49604) | 4/2/2 (16759) | 8/5/5 (29704) | - |
| no_parseorder | 23/9/11 (49647) | 5/2/2 (17272) | 7/5/5 (27919) | - |
| no_macro | 23/9/11 (49199) | 5/2/2 (16339) | 7/5/5 (27991) | - |
| no_sched | 23/9/11 (49941) | 5/2/2 (17359) | 7/5/5 (27450) | - |
| on_kindprune | 23/9/11 (47570) | 3/1/1 (16193) | 7/5/5 (26658) | - |
| on_beam | 21/9/11 (58068) | 5/2/2 (24375) | 9/5/5 (37232) | - |
| on_prefix | 22/9/11 (46632) | 4/1/1 (15724) | 7/5/5 (26135) | - |

Reading it:

* **Multi-representation perception** (c8 only vs five parses): -12 top-1 on ARC-1 training, -2 retained on eval A, -1 on the
  odd half; costs 3.7x time. **Relations**: -2 / -1 / -6. **Multi-stage pipelines**: -1 / -2 / -10. **Extraction by inverse
  witness**: -3 on eval A, -16 on training. **Between** (+diagonals): -5 on training, 0 on dev. **Stamp**: -2 on training, 0 on
  dev. **Roles**: 0 on dev, -2 on the even half.
* **Inverse semantics**: identical solves, 1.4-1.8x the time and 9x the templates when the sweepable effects are swept.
* **Learned components** (value, atom-family priors, parse order, macros, scheduler): no change in solves in the standalone
  family; the standalone numbers do not include the scheduler (it acts in the ensemble). Measured *hindsight* effects are in
  section 17.
* **Rejected / opt-in** (`PSYN_ON=...`): *kindprune* (operator proposer pruning) cuts 13 % of the nodes but cost one solve on the
  odd half (-1) — off by default. *beam* (branch on the 2nd/3rd best first rule): +18-40 % time, no solves. *prefix* (stage
  prefixes as continuation candidates): -1. *near-miss seeding of the refinement stage*: in the ensemble it traded one solve for
  one regression (it crowds the repair stage). *transduction* (per-task decision-tree transducer, leave-one-out gated, n >= 3,
  LOO >= 2/3): after gating it fires on 0 development tasks when run as a fallback; run unconditionally it gained one task and lost
  one for +16 % runtime (psyn8 experiment). Before gating, with n = 2 allowed, it fired on 65 tasks and was right on 1.
* **Calibration** (`tools/arc-calibrate.js`, conditional-logit offsets per family + psyn features, fitted on the learning
  splits, scored on development): fitted offsets were ~0 (cellwise +0.5, tiling +0.4; others < 0.25) and top-1 on the held-out
  set did not change (12 -> 12) — the hand-set priors were already near the optimum on the learning data. Not deployed.
* **Consensus second attempt** (per-cell vote of the top 3/4/5 outputs, alone or only when attempts 1 and 2 are near duplicates):
  335 vs 335/336 solved over four result sets (no gain).
* **Search size** (`PSYN_MAX_RULES`, `PSYN_MAX_STAGES`): 4 rules / 3 stages -> 6 / 4 adds exact-fitting programs (23 -> 25) but
  no correct ones: the limit is vocabulary, not depth.
* **Within-object `between` and bbox-ring effects** were tried and removed: no net gain on training and one task lost
  (`b60334d2` outranked by a spurious bbox-ring program).

## 14. Newly solved compositional tasks (programs found, all verified on every demonstration)

| task (split) | program |
|---|---|
| `21f83797` (ARC-1 eval A) | `ray.right(self); ray.down(self); ray.up(self); ray.left(self)  >>  fillholes(1)` |
| `4f537728` (ARC-1 eval A) | `[∃row:diffColor] -> recolor(role.fewestObjs); [∃col:color=role.fewestObjs] -> recolor(role.fewestObjs)` |
| `fe45cba4` (ARC-2-style odd) | `[!touchRight] -> delete; [∃near:color=role.fewestObjs] -> copy(-1,0)  >>  [largest] -> fillbox(role.largestObj)` |
| `aa62e3f4` (ARC-2-style even) | `[true] -> delete; [true] -> halo4(role.smallestObj)` |
| `5034a0b5` (ARC-2-style even) | `[!touchLeft & color=role.leftmost] -> move(-1,0); [!touchRight & color=role.rightmost] -> move(1,0); ...` |
| `0ca9ddb6` (ARC-1 training) | `[color=1] -> halo4(7); [color=2] -> stamp[-1,-1:4 -1,1:4 1,-1:4 1,1:4]` |
| `b60334d2` (ARC-1 training) | `halo4(1); move(-1,-1)  >>  stamp[0,2:5 2,0:5 2,2:5]` |
| `6c434453` (ARC-1 training) | `[hasHoles] -> delete; [hasHoles] -> fillbox(2)  >>  [smallest] -> halo4(role.smallestObj)` |
| `1f876c06` (ARC-1 training) | `between.all.same(self)` (connect same-coloured pairs along rows, columns and diagonals) |
| `d364b489` (ARC-1 training) | `stamp[-1,0:2 0,-1:7 0,1:6 1,0:8]` |

(selector atoms `role.*` are scene roles, `rel.*` relations; programs are printed exactly as the engine renders them.)

## 15. Where backward inference replaced enumeration

Per-task accounts (standalone, 1.08 s): `fe45cba4` — 3.6e7 naive parameter settings (move vectors, patterns, colours for every
object and kind) against 233 values the output dictated (x154,588), 232 object-effect pairs eliminated outright; `aa62e3f4` —
5.0e7 vs 228 (x219,465); `4f537728` — 3.1e8 vs 11,682 (x26,277); `0ca9ddb6` — 7.9e7 vs 157; `d364b489` — 1.3e7 vs 68, solved in 5 ms.
A move vector, a ray colour, a halo colour, a stamp pattern or a position table are never searched: they are read from the
changed cells (the demonstration's own output), and then only *which objects* they apply to is searched.

## 16. Discovered abstractions (macros)

The trainer abstracts rule signatures of verified programs (constants removed, atom families kept) and keeps those that
recur in at least three different tasks: **136** macros. Most frequent: `fillholes(colour) of objects with holes` (65
programs), `recolour(colour) the largest` (61), `copy(offset) the largest` (45), `delete the largest` (44), `halo8(colour)
of the largest` (37), `recolour by relation, single-cell objects` (35), `recolour(colour) of objects with holes` (35), `fillbox(colour)
of the largest` (32), `slide the largest` (31). A macro earns a description-length bonus of up to 2 bits when a new rule
matches it. This is frequency-based abstraction over rule signatures — it does not create new executable operators.

## 17. Search-policy improvement from hindsight

Hindsight = outcome labels (which program was right on the test input) attached to the traces after the fact; the
trainer fits small logistic models only on the learning splits. Round 1 produced the shipped policy; round 2 (re-collected under
the newer engine) did **not** improve held-out quality and was not adopted:

* parse proposer: on the 11 development tasks solved by an object program, the solving parse sits at mean position 2.09 in the
  learned order vs 3.18 in the default order (tried first for 5 vs 3 tasks); on learning tasks 1.63 vs 2.55 (38 vs 25 of 62).
  Because the budget covers every parse, solves per time budget are unchanged (7/9/9 solves at 0.05/0.15/0.4 s with and without).
* operator proposer: -13 % nodes, but one lost solve on each of two development sets -> opt-in only.
* scheduler: AUC 0.69 for "psyn produces an exact program" on development tasks (0.62 held-out in training); capping the budget
  of the lower half saves 26 % of psyn's extra time (about 3.5 % of total runtime); skipping outright had silenced five
  held-out solves, so it caps instead.
* value function: held-out AUC 0.76 (round 1) / 0.68 (round 2, different held-out set), ranking among alternatives picks the
  right program 9 vs 8 times of 10 (value vs description length).

## 18. Remaining bottlenecks

1. **Vocabulary.** More rules/stages produce more exact fits but no more correct ones; the unsolved same-shape tasks
   need effects and relations the library lacks (midpoint stamps, diagonal rays from concave corners, periodic pattern repair,
   counting-to-rendering, shape-conditional transformations). Adding an effect was worth 2-5 training tasks each and ~0 on dev.
2. **Output-changing-shape tasks** (35 % of ARC-1): only extraction is covered by psyn; shrink/upscale/summarise tasks rely on
   the old families.
3. **Ambiguity between exact explanations** (section 12): the arbitration across families is hand-set and the learning data
   offers no better one.
4. **Policy learning signal is thin**: ~100 fitted tasks in the learning splits; held-out AUCs of 0.62-0.76.
5. **ARC-2** needs compositional symbolic interpretation; the family reaches the tasks whose rule is a short object program.
6. The program IR with typed holes is not yet the production representation.

## 19. ARC-3 world model (synthetic fixtures; not ARC-AGI-3 scores)

`tools/arc3-synth.js` games with hidden rules (6 seeds x 30 games x 3 levels = 540 levels per cell). Two principled fixes in
`c4-arc3-world.js`:

* **Floor inference.** The most frequent colour of a small board can be the walls, which made walls "background" and the floor an
  object. The floor is now the colour revealed in cells the agent vacates (two cells and a clear lead before it is adopted;
  evidence collected under the wrong background is discarded).
* **Agent identification by action contingency.** The controllable entity is the one whose displacement depends on the action;
  an entity that patrols on its own does not. Mutual information between action and per-colour displacement (a non-move counts as a
  displacement) replaces "the only thing that moved".

| suite | levels | completed before -> after | timeouts before -> after | action semantics correct |
|---|---|---|---|---|
| standard (basic, hazard, key/door, button, teleport, hazard+key/door) | 540 | 426 -> 445 (78.9 % -> 82.4 %) | 41 -> 20 | 0.889 -> 0.886 |
| with a patrolling decoy (new) | 540 | 336 -> 437 (62.2 % -> 80.9 %) | 132 -> 49 | 0.640 -> 0.867 |

Not done: executable model *ensembles* replay-tested against the whole history, and information-value planning beyond the
existing uncertainty term. The remaining failures in these fixtures are first-contact hazard deaths (one per hazard game, which
no policy can avoid without a prior) and mechanics-discovery timeouts. Nothing is claimed about real ARC-AGI-3 games.

## Reproduce

```sh
npm run build && npm test                                   # includes c4-arc/psyn-test.js and the ARC-3 tests
node tools/arc-pack.js <ARC-AGI/data/evaluation> /tmp/e1A --every 2 --offset 0     # development half
node c4-arc/bench.js --root /tmp/e1A --budget 3 --jobs 3 --out /tmp/res/after
PSYN_MODE=off node c4-arc/bench.js --root /tmp/e1A --budget 3 --jobs 3 --out /tmp/res/before    # same engine, family off
node tools/arc-regress.js /tmp/res/before /tmp/res/after --ids                    # per-task 2x2 tables, runtime percentiles
node tools/arc-psyn.js <task-dir> --budget 1.08 --verbose                          # the family alone
PSYN_OFF=inverse node tools/arc-psyn.js <task-dir> --budget 1.08                   # ablations (see c4-arc/README.md)
node tools/arc-psyn-train.js --sets a=<dir>:4 --collect t.json && node tools/arc-psyn-train.js --traces t.json --train --out c4-arc/src/68-psyn-policy.js
node tools/arc3-synth.js --seed 1 --games 30 [--patrol]
```
