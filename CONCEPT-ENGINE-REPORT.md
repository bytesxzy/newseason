# CELL4 ARC concept engine: research, design, measurements

Everything here is local JavaScript. No external model or API is used by the
engine, the tools, or the training loops. Development used only the ARC-AGI-1
public TRAINING split (`arc1_` in `c4-arc-tasks.js`) and synthetic tasks. The
ARC-AGI-1 public EVALUATION split was frozen in `c4-arc-eval-tasks.js`
(commit 7c088f4, sha256 `b724c5cf...`) before any engine run on it.

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
