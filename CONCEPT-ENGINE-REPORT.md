# CELL4 ARC concept engine: research, design, measurements

Everything here is local JavaScript. No external model or API is used by the
engine, the tools, or the training loops. Development used only the ARC-AGI-1
public TRAINING split (`arc1_` in `c4-arc-tasks.js`) and synthetic tasks. The
ARC-AGI-1 public EVALUATION split was frozen in `c4-arc-eval-tasks.js`
(commit 7c088f4, sha256 `b724c5cf...`) before any engine run on it.

**Results at a glance** (3 s per task, same harness, details in sections 4-13):

| | baseline | final | change |
|---|---|---|---|
| held-out ARC-AGI-1 evaluation, top-1 | 102 / 400 (25.5%) | **115 / 400 (28.75%)** | +13 (+3.25 points) |
| held-out ARC-AGI-1 evaluation, top-2 | 104 (26.0%) | **120 (30.0%)** | +16 (+4.0 points) |
| held-out correct output generated | 108 | 122 | +14 |
| development (ARC-AGI-1 training), top-1 | 232 (58.0%) | 260 (65.0%) | +28 |
| runtime per task | 2.73 s | 2.74 s | same |

The +10-point target was not reached on the held-out split, and 70% is far
away. Section 13 says why.

Where each requested item is: architecture before/after 1; files changed
and added 2; algorithms and their research sources 3 (table 0); baseline
numbers 5; final numbers, top-1/top-2, oracle generation and retention,
runtime 6; failure taxonomy 7; matched-compute ablations 8a-8c;
subsystem per newly solved task, regressions, unique gains 9a-9b;
branch intersection/union 9c; synthetic generalisation 10;
leave-family-out 11; negative results 12; remaining failures 13.

## 0. Research table (written before implementation)

Sources actually read: Barbadillo's ARC25 solution summary (ironbar/arc25
docs), Pang's writeup (epang080516/arc_agi), Berman's two writeups
(jerber/arc_agi, jerber/arc-lang-public), NVARC README (1ytic/NVARC), TRM
README and `trm.py` (SamsungSAILMontreal/TinyRecursiveModels), SOAR README
(flowersteam/SOAR), ARChitects 2024 and Product-of-Experts READMEs
(da-fr/*), CompressARC README (iliao2345/CompressARC), MARC/TTT README
(ekinakyurek/marc). arXiv, arcprize.org and kaggle.com are blocked by this
container's egress proxy, so papers that exist only there (ARC Prize 2025
report, ARC-AGI-2 report, ArcMemo, DreamCoder, ILP papers, ARCANA) are
summarised from prior knowledge and marked (pk). ARCANA claims could not be
verified at all and are not used.

| METHOD | MECHANISM | REPORTED BENEFIT | TRANSFERABLE IDEA | EXPECTED IMPACT HERE | COST | RISK |
|---|---|---|---|---|---|---|
| Barbadillo search+learn | sample programs, relabel every executed program as the correct solution of the task it actually solves (hindsight), fine-tune, sample again | 512 preds: pure 23.3%, 256+learn+256 26.0%, 128x3+learn 28.3% (ARC-1 eval, BARC model). Own 32-generator synthetic data: solved 0 real tasks ("infinite synthetic data is not enough if diversity is low"). Small-model refinement: no gain | search -> learn -> search at MATCHED prediction count; hindsight tasks from failed programs; generator diversity matters more than volume | medium: controller over sketch components learned from hindsight tasks; within-task posterior update | medium | small symbolic proposal space may leave little for a controller to learn (his refinement finding) |
| SOAR (pk + README) | evolutionary sample+refine with an LLM, then fine-tune on all attempts, failures relabelled | open 7-72B models beat larger closed ones on ARC-1 after self-improvement iterations | learning from failed search; refinement operator improves with training | same as above | medium | same |
| Berman 2024 | LLM writes Python, fitness = (#demos exact, cell accuracy), best parents revised; "pooling" keeps parents that each solve a different demo | deep 4x50 = 45/60 vs shallow 1x200 = 42/60 at equal calls; 42% of deep solves from gen 2-4 | refinement beats independent sampling at equal budget; keep per-demo specialists (lexicase-like pooling) | medium: CEGIS keeps partial explainers per object class and per demo | low | none |
| Berman 2025 (arc-lang) | natural-language instructions scored by LEAVE-ONE-OUT over demos, revision + pooling | ARC-2 SOTA at the time | LOO as the fitness of a rule, not only exact fit | high for ranking of exact-fit programs (our 40 NO_CORRECT_RETAINED) | low | ARC tasks that need every demo to disambiguate |
| Pang 2025 | DreamCoder-like library of programs; prompt with best library program by (#demos, cell acc); 10 LLM calls/task | 77.1% ARC-1 semi-private at $2.56/task | reuse of solved-program structure across tasks makes synthesis cheaper | medium: concept library of sketch structures with triggers, retrieved by scene/schema signature | medium | memorising task instances instead of concepts |
| DreamCoder (pk) | wake (recognition-guided enumeration), abstraction (refactor + MDL), dream (fantasies from library train the recognition model) | library growth enables deeper programs | MDL-accepted abstractions; dreaming = hindsight tasks sampled from the grammar | medium | high | library of 77 hand primitives on ARC scored 4.5% (PeARL): DSL coverage dominates |
| Akyurek TTT (README + pk) | per-task LoRA on leave-one-out tasks built from demos + geometric augmentations; augmented inference with hierarchical voting | 53% -> 61.9% ARC-1 eval with program ensemble | leave-one-demo-out tasks as the per-task training signal; voting across invertible transforms | high as LODO evidence and as a view-consensus signal | low | a neural model is not feasible in 3 s/task on CPU |
| ARChitects 2024 / PoE | fine-tuned LLM, per-task TTT, DFS sampling, score every candidate under many D4/colour/order augmentations (product of experts) | 71.6% ARC-1 eval (8B) | augmentation consistency as a SCORE for candidates | medium: re-induce the program in D4 views; agreement after inverse = consistency evidence | medium | orientation-dependent rules (gravity) are legitimately non-equivariant |
| ARChitects 2025 (pk) | masked diffusion LLM with ~100 recursive soft-mask refinement steps | 16.5% ARC-2 (2nd) | recursive refinement of an answer; keep confident cells, revise the rest | medium: symbolic recursive refinement Y_t+1 = revise(Y_t, residual) via residual re-posing | medium | none |
| TRM (README + trm.py) | tiny net; z_L updated L times from (x + z_H), z_H from z_L, H cycles, deep supervision, learned halting | 45% ARC-1, 8% ARC-2 with 7M params (trained with 1000 augmentations per task incl. eval demos) | latent state Z + answer Y, iterate reason/revise; halt when stable | medium as a symbolic loop (Z = scene + program + unresolved residual) | medium | the neural version needs GPU training; not feasible here |
| NVARC 2025 (README + pk) | 103k synthetic puzzles by concept mixing + 3.2M augmentations; ARChitects-style TTT; TRM ensemble; voting | 24.0% ARC-2 (1st) | synthetic data built by MIXING concepts, not by volume; scoring by voting | medium for dreaming: compose sampled concepts | medium | same as Barbadillo on diversity |
| CompressARC (README + pk) | per-task network trained from scratch at inference, loss = description length (KL + reconstruction); equivariances by weight tying | ~20% ARC-1 eval, no pretraining | MDL as the selection objective among exact fits; equivariance as prior | high for selection: a real code-length for entity programs (relations cheap when one rule explains all demos, literals charged per varying value) | low | MDL weights must be calibrated on synthetic held-out, not ARC |
| ArcMemo (pk) | concept-level memory ("situation -> suggestion") abstracted from solutions, retrieved per task | ~+7.5% relative on ARC-1 with o4-mini | memory of CONCEPTS with triggers, never task instances | medium: machine-readable trigger -> sketch entries | low | trigger features too coarse |
| ARGA / object-centric synthesis (pk) | multiple graph abstractions of the image; filter -> transform -> parameter binding with constraint acquisition; tabu search | solved most of an object-centric subset | multi-segmentation beam; entity-level filters and transforms with bound parameters | HIGH: most of our 121 NO_CANDIDATE tasks are entity-level rules with relational parameters | high | segmentation ambiguity |
| ILP / relational decomposition (pk) | output as relational facts; logic rules over background predicates (Popper) | solves tasks with position-general rules | version-space / set-intersection induction of relational expressions; predicate invention for selection | HIGH: hole solving by per-example binding sets intersected across demos | medium | combinatorial predicate sets |
| ARCANA | (not verifiable here) | - | not used | - | - | - |

Findings the design must honour (from the brief, checked against the sources):
refinement > independent sampling (Berman depth study); search+learn > pure
search at matched predictions (Barbadillo table); TTA solves a different
problem than width (Akyurek, Barbadillo); program vs transduction are
complementary (MARC ensemble); verification of executable programs is the
strongest signal (all program-synthesis entries); D4/colour views as
consistency tests (ARChitects PoE); MDL among perfect fits (CompressARC);
diversity of generated tasks, not volume (Barbadillo 3.1, NVARC concept
mixing); candidate generation helps only once the proposal distribution
contains the concept (Barbadillo 3.1/5.1; this repo's own finding that
population search and TTA found 0 exact programs on 131 real ARC failures).

### What this means for this engine

The previous pass already has search, repair, population search, macros and
test-time weighting. Its own report says they found 0 exact programs on the
real no-candidate tasks: the concepts are not in the proposal distribution.
So the first-order change is a NEW HYPOTHESIS SPACE at the level of
entities and relations, where parameters are expressions solved by
intersecting per-demonstration version spaces (ILP / ARGA / sketching),
not literals enumerated blindly. Learning (controller, library, search-learn-
search) is built on top of that space, because learning over a space that
does not contain the concept cannot help (Barbadillo 3.1).

## 1. Architecture before and after

Before (commit 2771611, engine sha256 `8077b0655c33...`):

```
task ─► 59 re-framing wrapper (D4 / colour frames)
         └─► 50 portfolio, 3 s wall clock per task
              phase 1: ~50 specialist families in a fixed order, one time slice each
              │   geometry, colormap, tiling, symmetry, objects_map, objproc,
              │   cellwise/celltree, compose, enumerate_dsl, typed, ...
              │   each family emits Hyp(program, cost, family)
              ├─ every Hyp executed on every demonstration (exact fit only)
              ├─ reservoir (600) ─► leave-one-out refit (>= 3 demos) ─► vote pool (150)
              ├─ phase 2: residual repair (55/56), population search (56a), macros (56b/c),
              │           refinement (57), test-time weighting (57b), counterfactual (58)
              └─ identical predictions aggregated (logsumexp over families) ─► top-2
   output: predictions only; a failed task was "NO_CANDIDATE" with no reason
```

After (commit 2c2c845, engine sha256 `e17a325ccc941ba0...`):

```
task ─► 59 re-framing wrapper (unchanged; carries provenance and generation keys)
         └─► 50 portfolio, same 3 s wall clock, same phases
              ├─ every baseline family, code unchanged (celltree gets a 0.35 s minimum slice)
              ├─ NEW family "sketch" (64-mdl.js; minimum slice 1.0 s, cap 1.2 s)
              │    65 SCHEMA  demonstrations ─► evidence ─► arm priors
              │    60 SCN     scene per segmentation, beam of 10 readings, objectness bits
              │    61 CORR    per-entity fates: same / vacated / recolor / cmap / mixed + placements
              │    62 EXPR    typed REL / COLOR / INT / VEC / PRED expressions with code length
              │    62a GEN    generative operators (halo, fills, rays, link, symm, stamp, repeat, ...)
              │    63 SKETCH  version-space holes, decision lists from residual partitions,
              │               growth rules on the residual, falls, reflections,
              │               two-stage composition P2(P1(x)) on near misses
              │    66 SEARCH  arms counted in executions; search ─► learn ─► search with
              │               hindsight credit, niche elites, refinement and stage-2 arms
              │    64 EMDL    description length; D4 view re-induction; referent consistency
              ├─ NEW family "extract"   (63a) output = render(entity chosen by a predicate VS)
              ├─ NEW family "encode"    (63b) output = pattern(H(scene) x W(scene)), INT VS
              ├─ NEW family "transduce" (69, phase 2) LODO-gated backoff cell model
              ├─ ranking: removed-colour law, consensus 0.5 ln(#families), half LOO for sketch
              └─ result: top-2 + provenance (families per prediction) + generation keys
                         + failure_reason from 65 TAXON when nothing fits
   67 CONTROL (learned arm priors) is built and trained but ships with null
   weights: every variant measured hurt held-out search (section 8).
```

## 2. Files

Changed (8): `c4-arc/src/50-portfolio.js` (provenance, generation keys,
minimum slices, removed-colour law, consensus term, half-weight LOO for the
searching family, failure reasons), `c4-arc/src/59-equivariant.js`
(provenance and generation keys through re-framing), `c4-arc/src/47-celltree.js`
(minimum slice), `c4-arc/src/90-engine.js` (switches, exports),
`c4-arc/manifest.json` (new modules), `c4-arc/bench.js` (`--corpus`,
`oracle_generated`, `correct_families`, `failure_reason`, `--ablate`),
`package.json` (tests), `c4-arc-engine.js` (regenerated by `node c4-arc/build.js`).

Added, engine (14): `c4-arc/src/60-scene.js`, `61-correspondence.js`,
`62-expr.js`, `62a-genops.js`, `62b-concepts.js`, `63-sketch.js`,
`63a-extract.js`, `63b-encode.js`, `64-mdl.js`, `65-schema.js`,
`66-search.js`, `67-controller.js`, `67a-controller-weights.js`,
`69-transduce.js`.

Added, tools and tests (10): `c4-arc/concept-test.js`, `tools/arc-sls.js`,
`tools/arc-dream-lib.js`, `tools/arc-synth-gen.js`, `tools/arc-controller.js`,
`tools/arc-library.js`, `tools/arc-report.js`, `tools/arc-lfo.js`,
`tools/arc-final-runs.sh`, `c4-arc-eval-tasks.js` (the frozen evaluation split).

Added, report and measurements: `CONCEPT-ENGINE-REPORT.md` (this file);
`measurements/arc-final-runs.json` (summaries of all 12 frozen runs),
`arc-report-eval.json`, `arc-report-dev.json` (gains, regressions,
branches), `arc-sls-dev*.json`, `arc-controller-*.json`,
`arc-synth-heldout.json` (development stage), `arc-synth-heldout-final.json`,
`arc-lfo.json`, `arc-library-mine.json`.

After the frozen runs, two header comments were corrected (63-sketch.js
listed fewer action and growth kinds than exist; 69-transduce.js named the
wrong file for consensus). The rebuilt bundle differs from the measured one
in comment lines only (13 added, 5 removed; sha256 `d94da26aac8eff16...`).
The measured engine is commit 2c2c845.

## 3. Algorithms and where each idea came from

| Algorithm | File | What it does | Inspiration |
|---|---|---|---|
| Segmentation beam | 60-scene | Ten readings of every grid (same-colour and multicolour components, colour classes, enclosed and all background regions, separator panels, empty rectangles, cells); readings with identical partitions are merged; each costs objectness bits | ARGA multi-abstraction graphs; CompressARC description length |
| Correspondence fates | 61-correspondence | Per entity and demonstration: same / vacated / recolour / colour map / mixed, plus every exact or recoloured placement of its patch on changed cells (moves, copies, D4 images) without committing to one | object-centric synthesis (ARGA) |
| Typed expressions with code length | 62-expr | Holes are REL / COLOR / INT / VEC / PRED expressions (nearest-of-a-kind, container, own height, slide until blocked, reflect about a partner, ...), each with its bits | DreamCoder typed DSL; ILP background predicates |
| Version-space hole solving | 63-sketch | For every entity the set of expressions consistent with its fate is computed once; a rule's hole is the intersection over the entities it covers in all demonstrations | ILP / version spaces; sketching |
| Conditionals from residual partitions | 63-sketch | Entities are partitioned by which expression explains them; a decision list of 1-3 rules appears only when a cheap predicate (or conjunction, +3 bits) separates the parts | CEGIS; predicate invention |
| Growth on the residual | 63-sketch, 62a-genops | Cells no object rule explains are explained by a generative operator whose instances are intersected per selected entity (rays, halos, links, completed symmetry, stamps, repeats, bars) | CEGIS counterexample loop |
| Two-stage refinement | 63-sketch `stage2Arm` | A near-miss program's output is re-perceived and a second program is synthesised on (P1(x) -> y); P2 after P1 is emitted | TRM and ARChitects 2025 recursive refinement, done symbolically |
| Search in execution units | 66-search | Candidate streams (arms) per segmentation and kind; every pull is one execution, so schedules compare at matched compute | Barbadillo matched-prediction protocol |
| Search -> learn -> search | 66-search | After each round, executed candidates (failures included) are relabelled as evidence about their components; arms are re-ordered, never pruned; near misses spawn refinement arms, one elite per niche | Barbadillo hindsight relabelling; SOAR; Berman pooling; MAP-Elites |
| Learned controller (off) | 67-controller, tools/arc-controller | Logistic model from demonstration features to segmentation / family / kind, trained on dreamed and hindsight-relabelled tasks | DreamCoder recognition model; Barbadillo |
| Dreaming | tools/arc-dream-lib | Programs sampled from the grammar are run on development INPUTS; each is the correct program of the task it produces | DreamCoder dreams; NVARC concept mixing |
| Description length ranking | 64-mdl | Prefix code over segmentation, rules, predicates, holes, growth, canvas; literal values cost more the more they vary | CompressARC |
| D4 view re-induction | 64-mdl | When exact programs disagree, the whole task is re-posed in transpose / rot180 / flip views, synthesis runs again, and each raw prediction is scored by how many views reproduce it after the inverse transform (same views for every candidate) | ARChitects product of experts; Akyurek augmentation voting |
| Referent consistency | 64-mdl | Properties that held for every entity a rule selected or referred to in training are checked on the test input; a role filled only on the test grid counts as extrapolation | counterfactual / attribute-dependence checks from the brief |
| Removed-colour law | 50-portfolio | A colour present in every demonstration input and absent from every output must not survive in a prediction | counterfactual consistency |
| Consensus by independent support | 50-portfolio | Identical predictions from distinct families add 0.5 ln(#families); clones inside one family count once | MARC program/transduction ensemble |
| LODO | 50-portfolio, 69-transduce | Leave-one-demonstration-out refit; half weight for the searching family (its structure was chosen with all demonstrations); hard admission gate for the transducer | Akyurek leave-one-out tasks; Berman 2025 LOO fitness |
| Extraction | 63a-extract | Output = rendering (bbox or patch, optional D4) of the one entity a predicate selects; predicate VS over demonstrations | ARGA filters |
| Encoding | 63b-encode | Output height and width solved as INT version spaces over scene counts; pattern and colour enumerated; lookups need two observations per entry | ILP over numeric background knowledge |
| Transduction | 69-transduce | Per-task backoff context model over cells with relational targets, D4-augmented, admitted only if it rebuilds every held-out demonstration | MARC induction/transduction complementarity; PPM / CompressARC |
| Concept library | tools/arc-library, 62b-concepts | Fused operator pairs mined from solved programs, accepted only with support >= 2 tasks and positive MDL gain (none qualified) | DreamCoder abstraction; Pang; ArcMemo |
| Schema posterior and failure taxonomy | 65-schema | Size / palette / change / level evidence from demonstrations moves arm priors; nine named reasons replace NO_CANDIDATE | the brief |

## 4. Protocol

* Development split: ARC-AGI-1 public TRAINING, 400 tasks (`arc1_` in
  `c4-arc-tasks.js`). All design, debugging and inspection used it and
  synthetic tasks only.
* Held-out split: ARC-AGI-1 public EVALUATION, 400 tasks, frozen in
  `c4-arc-eval-tasks.js` (commit 7c088f4) before any engine touched it. The
  engine was frozen at commit 2c2c845 (sha256 `e17a325ccc941ba0...`) and
  then run on it exactly once, with the baseline beside it. No evaluation
  task was inspected to change anything; nothing in the engine changed
  after the run.
* One harness for both engines: `node c4-arc/bench.js --policy-mode none
  --budget 3 --jobs 3`: 3 s wall clock per task, 3 tasks in parallel on 4
  cores, node v22, all runs one after another in `tools/arc-final-runs.sh`.
  The baseline is the pre-change bundle (commit 2771611) run from a copy.
* top-1: the first prediction is correct on EVERY test input of the task.
  top-2: one of the first two is (ARC's two-attempt rule, but counted per
  task, so it is a lower bound on the per-output official score).
  Oracle generated: some demonstration-exact hypothesis in the reservoir
  (cap 600) produced the correct output. Oracle retained: the correct
  output survives into the final ranked list. Task seconds: the sum of
  per-task solve times.

## 5. Baseline numbers

| split | top-1 | top-2 | oracle generated | oracle retained | task seconds | failure classes |
|---|---|---|---|---|---|---|
| development (400) | 232 (58.0%) | 239 | 239* | 239 | 1002 | no candidate 121, wrong program fits 40, outranked 7 |
| **held-out evaluation (400)** | **102 (25.5%)** | **104 (26.0%)** | 108* | 108 | 1091 | no candidate 215, wrong program fits 77, outranked 6 |

\* the baseline does not report outputs it generated and pruned, so its
generation oracle equals its retention (a lower bound).

The drop from 58% on the development split to 25.5% on the evaluation split
is what the old engine's own tuning on training tasks looked like when
measured honestly.

## 6. Final numbers

| split | engine | top-1 | top-2 | oracle generated | oracle retained | task seconds |
|---|---|---|---|---|---|---|
| **held-out evaluation** | baseline | 102 (25.5%) | 104 (26.0%) | 108 | 108 | 1091 |
| **held-out evaluation** | **final** | **115 (28.75%)** | **120 (30.0%)** | **122** | **122** | 1094 |
| held-out evaluation | final without sketch, extract, encode, transduce | 104 | 106 | 110 | 110 | 1094 |
| development | baseline | 232 (58.0%) | 239 | 239 | 239 | 1002 |
| development | final | 260 (65.0%) | 268 | 270 | 270 | 1013 |
| development | final without the new families | 233 | 240 | 241 | 241 | 1006 |

Held-out: +13 top-1 (+3.25 points), +16 top-2 (+4.0 points), +14 oracle,
at the same runtime (2.74 s per task vs 2.73 s). The requested +10 points
were NOT reached; nor anything near 70%. Development: +28 top-1 (+7.0
points), but that split was used to build the engine, so only the held-out
number measures generalisation. The generalisation gap of the new code is
visible: it gains 7.0 points on the split it was built on and 3.25 on the
split it never saw.

The old families inside the new engine (the "without" rows) score +2
held-out and +1 development over the baseline: the portfolio-level changes
(removed-colour law, consensus term, minimum slices) plus about one task of
timing noise (see the checkpoints below). The rest of the gain comes from
the new families.

Generation vs retention: on both splits every correct output a
demonstration-exact program produced was retained (generated = retained),
and ranking loses only 7 held-out tasks (122 retained, 115 top-1). The
bottleneck is GENERATION: on 278 of 400 held-out tasks no program that
fits the demonstrations produces the right output.

Development checkpoints (same harness; each row is one full 400-task run;
"commit" is the commit that followed the run):

| checkpoint | engine sha256 | top-1 | top-2 | oracle retained | no candidate | commit |
|---|---|---|---|---|---|---|
| baseline | 8077b0655c | 232 | 239 | 239 | 121 | 2771611 |
| BC-1 | 2c712953b5 | 245 | 250 | 250 | 113 | aa1a679 |
| C-2 | febd838123 | 245 | 252 | 253 | 113 | 266e7be |
| F-3 | 1b89fcd129 | 250 | 256 | 258 | 112 | 266e7be |
| F-4 | b142358f83 | 250 | 255 | 257 | 108 | a958dc7 |
| I-5 | 62e5da3704 | 254 | 259 | 261 | 105 | a958dc7 |
| J-6 | 6a2649b0fa | 253 | 259 | 261 | 105 | a958dc7 |
| J-7 | 2da0cb3825 | 254 | 259 | 260 | 106 | a958dc7 |
| J-8 | 3609987a2d | 254 | 260 | 261 | 104 | a958dc7 |
| J-9 | fe7689d782 | 256 | 262 | 263 | 105 | 7a319f0 |
| J-10 | 9e7b2053c3 | 254 | 260 | 261 | 104 | none (rewrite composition, -2, reverted) |
| J-11 | 2adf30b356 | 259 | 264 | 265 | 103 | 7a319f0 |
| K-12 | 4a5bd67e72 | 259 | 267 | 270 | 92 | 2c2c845 |
| K-13 | e17a325ccc | 259 | 267 | 269 | 93 | 2c2c845 (frozen) |
| dev-final | e17a325ccc | 260 | 268 | 270 | 93 | frozen engine, re-run |

K-13 and dev-final are the same engine: 259 vs 260 is the run-to-run timing
noise of a 3 s wall-clock budget (about one task).

## 7. Failure taxonomy (final engine)

"No candidate" is no longer one bucket: 65-schema.js names a reason from
the demonstrations alone.

| reason | held-out evaluation | development |
|---|---|---|
| solved top-1 | 115 | 260 |
| RANKING (correct output retained, not first) | 7 | 10 |
| WRONG_PROGRAM_FITS (fits every demonstration, wrong on test) | 79 | 37 |
| GENERATIVE_OP_MISSING (created cells no operator explains) | 50 | 26 |
| OBJECT_CORRESPONDENCE_FAILURE | 44 | 16 |
| SIZE_CHANGE_UNEXPLAINED | 44 | 27 |
| RELATION_NOT_EXPRESSIBLE | 21 | 7 |
| CONDITIONAL_REQUIRED | 20 | 7 |
| OUTPUT_SHAPE_UNKNOWN | 18 | 10 |
| CORRECT_STRUCTURE_WRONG_PARAMETERS | 2 | 0 |
| CORRECT_PROGRAM_PRUNED, SEGMENTATION_FAILURE, TIMEOUT | 0 | 0 |

## 8. Matched-compute ablations

### 8a. Search -> learn -> search at matched executions

`tools/arc-sls.js`: the 262 same-shape tasks of the development split, entity
search only, generous wall clock so the EXECUTION COUNT is the binding budget.
N = 512 is split 128 search / learn / 128 search / learn / 256 search, the
protocol of the brief. Top-1 = the lowest-description-length exact program is
correct on the test pairs.

| schedule | N | demo-exact tasks | top-1 correct | any exact program correct | mean executions used | executions to first exact |
|---|---|---|---|---|---|---|
| pure (v1 run) | 128 | 57 | 53 | 56 | 85.5 | 4.9 |
| sls v1 (learn prunes arms) | 128 | 63 | 55 | 61 | 87.2 | 9.4 |
| pure (v1 run) | 512 | 59 | 55 | 58 | 197.9 | 11.7 |
| sls v1 | 512 | 70 | 61 | 66 | 209.7 | 34.3 |
| blind control (v1 stage) | 128 | 70 | 62 | 67 | 96.5 | 10.5 |
| blind control (v1 stage) | 512 | 74 | 66 | 71 | 273.8 | 36.6 |
| blind control (final) | 128 | 71 | 63 | 68 | 96.5 | 10.9 |
| **sls (final)** | 128 | 72 | 63 | 69 | 96.8 | 10.2 |
| blind control (final) | 512 | 75 | 67 | 72 | 280.7 | 36.6 |
| **sls (final)** | 512 | 76 | 67 | 72 | 280.6 | 33.1 |

The blind control runs the same rounds and spawns the same number of
refinement arms, but from the first candidate of each niche in execution
order, ignoring reward. What this shows:

* Pure search uses only 198 of 512 executions on average: its finite
  proposal space is exhausted. What adds solved tasks at matched budget is
  NEW proposals spawned from near misses (refinement and stage-2 arms):
  +6 top-1 at N = 512 in the v1 run, and the blind control gets them too.
* Reward-guided learning in v1 was WORSE than the blind control (61 vs 66
  at 512), because pruning low-reward arms threw away arms that needed more
  pulls. The final version re-orders and never prunes; it then matches the
  blind control on top-1 (67 = 67) with one more exact task and fewer
  executions to the first exact program (33.1 vs 36.6).
* So in this symbolic space Barbadillo's search-learn-search gain reproduces
  as "refine near misses" (large), not as "learn which arms to pull" (about
  zero). This is his own small-model refinement finding, and the brief's
  warning that learning cannot add a concept the proposal space lacks.

### 8b. Learned controller (disabled in production)

`tools/arc-controller.js` trains the logistic controller of 67-controller.js
from tasks dreamed on the FIRST half of the development inputs; it is then
measured on the 150 same-shape tasks of the SECOND half, whose inputs it
never saw (`--half 2`), at matched executions. Top-1 correct:

| controller weights | pure N=32 | sls N=32 | pure N=64 | sls N=64 | pure N=128 | sls N=128 |
|---|---|---|---|---|---|---|
| none (production) | 25 | 27 | 26 | 30 | 26 | 31 |
| dreamed + hindsight + real trajectories (1700 tasks) | 21 | 23 | 23 | 26 | 25 | 28 |
| hindsight-relabelled executions only (708) | 25 | 27 | 26 | 29 | 26 | 31 |
| hindsight from solved development tasks only (123) | 23 | 28 | 26 | 28 | 26 | 30 |

No variant beats no controller at any budget. The largest training set is the
worst (-4 at N = 32). Its validation accuracy on held-out dreams is low
(family top-1 0.30 of 16 labels, segmentation 0.18 of 7), so its prior is
mostly noise that displaces the hand-set one. The hindsight-only controller
predicts its own labels well (family top-1 0.75 of 11) and still adds
nothing; the likely reason is that relabelled executions of this search name
the components the search already tries early. The weights file ships
`null`; the code stays so the experiment can be re-run
(`measurements/arc-controller-*.json`).

### 8c. Component ablations at matched wall time

Same harness as section 6 (3 s per task, 3 workers), frozen engine, one
component switched off (`--ablate` / `--without`). Only the development
split was used: the held-out split was run once, for the three evaluation
runs of section 6.

| ablation | top-1 | top-2 | oracle retained | top-1 vs final |
|---|---|---|---|---|
| final engine | 260 | 268 | 270 | - |
| without sketch, extract, encode, transduce | 233 | 240 | 241 | -27 |
| pure search instead of search-learn-search (no refinement or stage-2 arms) | 253 | 259 | 260 | -7 |
| without extraction and encoding | 256 | 264 | 266 | -4 |
| without D4 view consistency | 258 | 265 | 267 | -2 |
| without referent consistency | 259 | 266 | 269 | -1 |
| without the transducer | 259 | 268 | 270 | -1 |
| without the removed-colour law | 260 | 266 | 268 | 0 (top-2 -2) |
| held-out evaluation, without the new families | 104 | 106 | 110 | -11 (vs 115) |

The same engine run twice differs by about one task (K-13 vs dev-final),
so only the first three removals are clearly real: the new families (-27),
refinement inside the search (-7), extraction and encoding (-4). View
consistency (-2) is at the edge of the noise. Referent consistency, the
transducer and the removed-colour law are within it: they are not shown
to matter at this scale.

## 9. Newly solved tasks, regressions, unique gains

`node tools/arc-report.js BASELINE_DIR FINAL_DIR` (answers are compared by
the bench after the prediction is committed; this only aggregates). The
subsystem is read from the name of the program that wrote the top-1 output.

### 9a. Held-out evaluation: 15 gains, 2 regressions (net +13)

| task | subsystem | program (engine notation) | reading |
|---|---|---|---|
| arc1eval_13713586 | sketch: growth | `c8 · g: all>ray:edge:toward(big):hit{self}` | every object casts rays toward the largest object until something is hit |
| arc1eval_140c817e | sketch: two-stage | `c8 · all>recolor{c3} · g: all>ray:edge:orth:hit{self} >> c4 · g: pix>halo8{c4}` | stage 2 perceives stage 1's output and adds halos around single pixels |
| arc1eval_18419cfa | sketch: growth | `c8 · g: all>symm:rot2@cont` | complete each shape by 180-degree rotation about its container's centre |
| arc1eval_1a6449f1 | extract | `x: bgin · max:n · bbox` | output = bounding box of the largest enclosed background region |
| arc1eval_292dd178 | sketch: growth | `c8 · g: all>bbox{c3}; all>leak:hit{c3}` | fill each shape's interior and leak out through its gap |
| arc1eval_42918530 | sketch: two-stage | `c8 · g: all>stamp(hasC):center >> col · g: n=33>symm:rot2@self` | stamp the template, then complete by rotation |
| arc1eval_55059096 | sketch: growth | `c8 · g: all>link:diag(allS){c2}` | diagonal links between all same-shaped objects |
| arc1eval_551d5bf1 | sketch: growth | `c8 · g: all>bbox{c8}; all>leak:hit{c8}` | same concept as 292dd178, other colour |
| arc1eval_5af49b42 | sketch: growth | `m8 · g: all>stamp(hasC):match` | copy the template onto every place its pattern occurs |
| arc1eval_5b526a93 | old family (cellwise) | `cellwise:treeD[pos,5]` | cell decision tree (celltree minimum slice) |
| arc1eval_60a26a3e | sketch: growth | `bgin · g: all>link:orth(rowN){c1}; all>link:orth(colN){c1}` | enclosed regions link to same-row and same-column partners |
| arc1eval_64a7c07e | sketch: object rule | `c8 · all>move[r*h]` | every object moves right by its own height |
| arc1eval_73c3b0d8 | sketch: two-stage | `c8 · pix>move[d*h] >> m8 · g: all>ray:minor:diag:hit{gmin}` | move, re-perceive, then diagonal rays |
| arc1eval_b1fc8b8e | encode | `enc:lookup[fg]` | output looked up by foreground pattern (every entry seen twice) |
| arc1eval_f5aa3634 | consensus | `select:m4.majority_shape.patch` (select + sketch + compose agree) | three families agree; the consensus term lifts it to top-1 |

By subsystem: sketch growth 7, two-stage refinement 3, object rule 1,
extraction 1, encoding 1, consensus 1, old family 1.

Regressions: arc1eval_21f83797 (baseline: `cellwise:treeD[cascade,9]`) and
arc1eval_bf89d739 (baseline: population search in the refinement stage),
both now without a fitting program. Both families' code is unchanged; they
are anytime searches that did not reach the same program once the new
families took their share of the 3 s.

### 9b. Development: 33 gains, 5 regressions (net +28)

| subsystem | count | tasks |
|---|---|---|
| sketch: growth | 15 | 06df4c85, 1f0c79e5, 25d487eb, 31aa019c, 41e4d17e, 4938f0c2, 4c5c2cf0, 6e19193c, a3df8b1e, b548a754, b8cdaf2b, dbc1a6ce, e9614598, ec883f72, fcc82909 |
| sketch: growth, conditional (2+ predicates) | 3 | 444801d8, 5c0a986e, 8d510a79 |
| sketch: object rule | 4 | 3eda0437, 5521c0d9, 868de0fa, 9edfc990 |
| sketch: reflection | 2 | 6855a6e4, f8a8fe49 |
| sketch: two-stage refinement | 2 | 3befdf3e, 56dc2b01 |
| sketch: sequential fall | 1 | 4093f84a |
| encode | 3 | 445eab21, 9af7a82c, d0f5fe59 |
| old families (cellwise 2, objects 1) | 3 | 3bdb4ada, 40853293, aabf363d |

Regressions (development, inspected):
* 1bfc4729: the baseline solved it through the colour-role re-framing
  retry (`geometry:const@roles`). Now celltree, with its minimum slice,
  finds a fitting but wrong tree directly, so the retry never runs (most
  likely cause).
* 4612dd53, 5582e5ca, b27ca6d3: a new exact sketch program (two-stage in
  two of them) ranks above the correct old program, which stays at rank 2
  (top-2 still correct).
* b9b7f026: a different `select` program now ranks first; the correct one
  is at rank 2.

### 9c. Unique gains by branch (which branch holds the correct output)

Over tasks whose correct output is retained by the final engine: produced
only by old families, only by the new branches (sketch, extract, encode,
transduce), or by both.

| split | old only | new only | both | union |
|---|---|---|---|---|
| held-out evaluation | 89 | 15 | 18 | 122 |
| development | 156 | 29 | 85 | 270 |

The new branches reach 33 held-out outputs (15 unique) and 114 development
outputs (29 unique). Nothing was deleted: 89 held-out answers exist only
in the old families.

## 10. Synthetic generalisation by depth

`tools/arc-synth-gen.js --n 60 --depths 1,2,3 --seed 7 --split heldout`,
frozen engine, 1.5 s of entity search per task. Each task is a program
sampled from the grammar (depth = number of object and growth rules) and
executed on development INPUTS from the second half of the corpus, which the
controller and library tools never used. Top-1 = the lowest-cost exact
program is correct on the held-out test pair
(`measurements/arc-synth-heldout-final.json`).

| depth | tasks | demo-exact program found | top-1 correct | some exact program correct | executions to first exact |
|---|---|---|---|---|---|
| 1 | 60 | 37 | 29 (48%) | 34 | 11.2 |
| 2 | 60 | 28 | 26 (43%) | 26 | 51.9 |
| 3 | 60 | 36 | 25 (42%) | 29 | 49.8 |

By concept family over all depths (tasks / exact / top-1): recolor 38/28/24,
repeat 59/37/30, ray 20/15/13, bar 17/14/10, symm 24/13/12, move 37/15/12,
del 50/26/15, copy 44/17/11, moverc 21/8/7, stamp 12/8/5, keeponly 21/8/5.

What this says:
* The engine does not reliably solve its OWN grammar: 23 of 60 depth-1
  tasks get no exact program in 1.5 s. Sampled holes (colour and offset
  expressions, predicates) are drawn from the full catalogues, and the
  inducer does not reconstruct all of them from three demonstrations.
  Some sampled tasks are also under-determined by their demonstrations
  (copy: 17 exact, 11 correct).
* Composition costs executions: the first exact program takes about 4.5x
  more executions at depth 2-3 than at depth 1.
* Depth 3 finds MORE exact programs than depth 2 (36 vs 28), but top-1
  barely moves (25 vs 26). Deeper samples are often explained by a shorter
  program that fits the demonstrations and fails the test: the
  over-general fit of section 13, reproduced synthetically.
* An earlier development-stage run of the same command reported 41 / 25 /
  26 top-1. It is not comparable: the suite is sampled from the engine's
  grammar, which grew before the freeze, so the same seed draws different
  tasks.

## 11. Leave-family-out

`tools/arc-lfo.js --n 30`: for each generative family F, 30 depth-1 tasks
that REQUIRE F are dreamed on the held-out inputs and solved twice by the
frozen engine: with the full grammar, and with every operator of F removed
from the search (`measurements/arc-lfo.json`). Top-1 correct:

| family removed | tasks | full grammar | without the family |
|---|---|---|---|
| fill (bbox, holes) | 30 | 28 | 23 |
| ray | 30 | 22 | 17 |
| raycorner | 30 | 23 | 10 |
| halo | 30 | 24 | 10 |
| repeat | 30 | 21 | 7 |
| link | 25 | 18 | 4 |
| stamp | 14 | 14 | 1 |
| bar | 30 | 26 | 1 |
| symm | 30 | 21 | 0 |

Where the behaviour is recovered (fill, ray, some halo and raycorner
tasks), the likely mechanism is a neighbouring operator painting the same
cells on those particular grids (a ray that stops after one cell draws a
halo side; a fill of a small box can equal a halo). The tool does not record
which operator won, so this is an inference. It is coincidence of
operators, not a missing concept being rebuilt. Symmetry, stamp and bar are
not recovered at all (0-1 of 14-30), and link barely (4 of 25). The engine does not invent a concept it
lacks. This matches the empty library (section 12) and the held-out
failure counts (section 13).

## 12. What did not work

| attempt | measured result | status |
|---|---|---|
| Learned search controller (dreams, hindsight, solved-task hindsight) | never better than no controller on held-out inputs; -4 top-1 at N = 32 for the largest training set (8b) | ships with null weights |
| Reward-guided arm pruning (search-learn-search v1) | worse than the blind refinement control: 61 vs 66 top-1 at N = 512 (8a) | replaced |
| Learning which arm to pull (final version) | equal to the blind control on top-1 (67 = 67 at N = 512) | kept: fewer executions to the first exact program |
| Concept library (DreamCoder-style abstraction) | 41 solved programs mined, 43 candidate fused operators, none with support in 2 or more tasks and positive MDL gain (`measurements/arc-library-mine.json`) | library is empty (62b-concepts.js) |
| Transducer | development: admitted by LODO on 16 tasks, correct on 13, the only source of a correct output on 0. Held-out: admitted on 1, correct, not unique. Removing it: -1 top-1 (noise level, 8c) | kept, but no measured benefit |
| Referent consistency, removed-colour law | removing either changes development top-1 by -1 and 0 (8c) | kept, no measured benefit |
| Rewrite composition | -2 top-1 on development (checkpoint J-10) | reverted |
| ArcMemo-style concept memory | not built as a separate store; its closest analogue is the controller above | not done |
| Colour-permutation views | view consistency re-induces in D4 views only; colour frames exist only in the old re-framing wrapper | not done |
| Recursion deeper than two stages | only P2 after P1; see depth 3 in section 10 | partial |

## 13. Remaining failures, honestly

285 held-out tasks are still wrong at top-1. From the taxonomy (section 7):

* 278 are GENERATION failures: no program that fits the demonstrations
  produces the right output. Ranking loses only 7. Better ranking cannot
  close the gap.
* 79 have a program that fits every demonstration and is wrong on the test
  (coincidental fits: a cell decision tree or an enumeration that
  reproduces 2-3 demonstrations by accident). MDL, view consistency,
  referent consistency and LODO choose among candidates. With no correct
  candidate present, they cannot help.
* 50 need a generative concept that is not among the operators (halo,
  fills, rays, links, symmetry, stamps, repeats, bars, stretch, extrude,
  leak, midpoints): for example paths that turn, continuation of a
  sequence, construction driven by counts, gravity with stacking.
* 44 change the foreground in ways the correspondence cannot state: objects
  scaled, rotated or reflected in place, split or merged, recoloured by a
  context-dependent map, or a unit of change that no segmentation of the
  beam isolates.
* 44 know the output size but not the content. Entity programs are
  same-shape; extraction and encoding cover single-entity crops and numeric
  encodings. Crop-then-transform, tile-then-modify and assembling several
  entities are not in the space.
* 41 have an operator but lack the selecting relation or predicate (21), or
  have entity fates that split into classes no short predicate separates
  (20); 18 have no size law at all.

The structural reasons behind those counts:

1. The hypothesis space is hand-built. Every solved concept had to be
   reachable in it, and the learning components (controller, library)
   added no concept (section 12), as Barbadillo found for low-diversity
   generators. What added programs was refinement of near misses.
2. Composition is shallow: one level of rules plus growth, and a second
   stage only after a near miss (see the depth results in section 10).
3. 3 s per task on a CPU. The anytime families trade time with each other.
   Both held-out regressions are schedule effects.
4. Part of the new code fits the development concepts. Operator variants
   were added where development tasks needed them. It gains 7.0 points
   there and 3.25 held-out. The held-out number is the honest one.

The systems that reach 50-72% on this split (ARChitects 71.6% with an 8B
model; Akyurek et al. 61.9% with test-time training plus programs) train
neural models per task on GPUs. That is outside this engine's constraints:
local, no external model, CPU, 3 s per task. A symbolic engine of this kind
needs many more concepts in its space, or a way to learn new ones that
actually works, before 70% is a sensible target. This work does not provide
either.

## 14. Reproduction

```
node c4-arc/build.js            # bundle from c4-arc/src (measured engine: commit 2c2c845)
npm test                        # includes c4-arc/concept-test.js
sh tools/arc-final-runs.sh BASELINE_ROOT results/final
node tools/arc-report.js results/final/eval-baseline results/final/eval-final
node tools/arc-report.js results/base-arc1 results/final/dev-final
node tools/arc-report.js --table results/final/*
node tools/arc-sls.js --n 128,512 --out measurements/arc-sls-dev-v2.json
node tools/arc-controller.js --out measurements/arc-controller-train.json
#   --write installs the trained weights (then rebuild); production ships null
node tools/arc-sls.js --n 32,64,128 --half 2 [--no-controller]
node tools/arc-synth-gen.js --n 60 --depths 1,2,3 --split heldout
node tools/arc-lfo.js --n 30
```

`BASELINE_ROOT` holds the pre-change `c4-arc-engine.js` (commit 2771611)
and copies of both corpus files. The container restarted once during the
ablation `dev-no-views`. That run was deleted and redone from scratch, and
the ablations after it were run with the same commands. Every other run
finished in one piece.
