# Next stage: execution-guided transformation policy, neural branches

This report covers only the new stage. The concept engine it builds on is
described in `CONCEPT-ENGINE-REPORT.md`. Everything runs locally in
JavaScript: the neural networks here are implemented from scratch
(`c4-arc/src/71-nn.js`, hand-written backward passes checked against finite
differences in `c4-arc/policy-test.js`). No external model or API is used.

## 1. Verified starting point

Re-scored independently (`tools/arc-verify.js`) from the saved predictions
against the OFFICIAL ARC-AGI-1 task files, not with the bench's own code:

| split | top-1 | top-2 | correct output generated / retained | official per-output pass@2 |
|---|---|---|---|---|
| development (ARC-AGI-1 training, 400) | 260 (65.0%) | 268 (67.0%) | 270 (67.5%) | 268.0 |
| evaluation (ARC-AGI-1 public eval, 400) | 115 (28.75%) | 120 (30.0%) | 122 (30.5%) | 120.5 (30.1%) |

The numbers in the brief are correct. The distance to 90% on the held-out
split is 61.25 points, not 25.

## 2. Why 65% on development and 29% on evaluation

`tools/arc-gap.js` (aggregate statistics only; no evaluation task inspected
individually; `measurements/arc-gap.json`). Categories are computed from the
demonstrations.

| category | development solved | evaluation solved |
|---|---|---|
| output same shape as input | 62% of 262 | **21% of 270** |
| output smaller | 71% of 101 | 43% of 94 |
| output larger | 69% of 36 | 49% of 35 |
| largest grid side <= 10 | 76% of 192 | 49% of 83 |
| 11-20 | 58% of 165 | 24% of 218 |
| > 20 | 44% of 43 | 21% of 99 |
| 0-2 objects | 64% of 109 | 28% of 53 |
| > 15 objects | 53% of 49 | 24% of 90 |

| family (top-1 solves) | development | evaluation | ratio |
|---|---|---|---|
| sketch (new entity programs) | 64 | 21 | 0.33 |
| cellwise (cell decision trees) | 41 | 14 | 0.34 |
| objects | 32 | 11 | 0.34 |
| geometry | 32 | 14 | 0.44 |
| partition | 21 | 19 | 0.90 |
| tiling | 13 | 8 | 0.62 |
| symmetry | 10 | 14 | 1.40 |
| 13 special families with 1 development solve each | 13 | 0 | 0 |

| failure reason | development | evaluation |
|---|---|---|
| a program fits every demonstration, wrong on test | 37 | **79** |
| created cells no operator explains | 26 | 50 |
| object correspondence failure | 16 | 44 |
| size change unexplained | 27 | 44 |
| relation not expressible | 7 | 21 |
| conditional required | 7 | 20 |

Transfer of the previous stage's new families: +27 development, +11
evaluation (0.41). As a share of each split's failures: 16.2% of
development failures fixed, 3.7% of evaluation failures (0.23).

What this says:

1. The gap is largest where the learned rule fitters work: same-shape tasks
   (62% -> 21%). Families that fit a rule to the demonstrations (entity
   programs, cell decision trees, object maps) keep about a third of their
   development solves. Generic structural families (symmetry, partition,
   tiling) transfer almost fully. The thirteen one-task special families
   transfer nothing: they were written for development tasks.
2. The evaluation split is harder in ways that matter to this engine: larger
   grids (99 vs 43 tasks above 20 cells a side), more objects. The gap
   persists inside every size and object-count bucket, so difficulty alone
   does not explain it.
3. "Fits every demonstration, wrong on test" doubles (37 -> 79). Flexible
   fitters memorise demonstrations instead of capturing the rule, and they
   do it more on unfamiliar tasks.
4. The earlier synthetic result says the same from the other side: the
   engine solves only 42-48% of tasks sampled from its OWN grammar on
   held-out inputs.

So the next capability is not another concept family. It is constructing
transformations by composition from what the current program has actually
done, and measuring that on held-out compositions rather than on the
development split.

## 3. Research pass (this stage)

arXiv, OpenReview, Hugging Face, github.io pages and most blogs are blocked
by this container's egress proxy (also for the WebFetch tool). What was read
directly: GitHub repositories (code and READMEs). Paper-only details come
from search-engine summaries and are marked (s).

| source | mechanism (what was checked) | reported result | what this repo takes from it |
|---|---|---|---|
| Ouellette 2024, 2411.17708 (s) + GridCoder2024 repo | three paradigms: grid space (transduction), program space (task -> program tokens), transform space (state + target -> next instruction, intermediate state fed back) | program-space model fails OOD; transform space proposed, preliminary | the core design of this stage |
| Ouellette 2025, 2507.15877 (s) + OODGenARC-AGI code | GridCoder 2: transformer encoder over target grids and EVERY intermediate state (state-index embeddings), decoder over instruction tokens; best-first tree search, tokens above p = 0.01 expanded, priority = joint log-prob, entropy raised when the space is exhausted; 200k synthetic samples; 7 OOD composition tasks | EG-NPS 50-100% per OOD task vs TTFT 0-40%; TTFT "mainly elicits in-distribution knowledge" | execution-guided policy, best-first search with probability threshold; test held-out compositions; do not expect TTT to create composition ability |
| ARC Prize 2025 report, 2601.10904 (s) | refinement loops: per-task iterative program/model improvement from a feedback signal; TTT behind the top Kaggle scores (ARChitects 2024, NVARC 2025) | ARC-AGI-2 top 24% private | search -> learn -> search inside a task |
| Akyurek et al. TTT (s) | per-task LoRA on leave-one-out tasks from demonstrations + geometric augmentations; augmented inference + hierarchical voting | 53.0% alone, 61.9% ensembled with program synthesis; no transformations -16 tasks; per-task LoRA beats shared by 7 tasks | per-task parameter updates on the task's own data; complementary errors of program vs direct prediction |
| TRM analysis, 2512.11847 (s) | checkpoint analysis | voting over 1000 augmented samples adds ~11 pp pass@1; replacing the puzzle ID gives 0%; most accuracy at the first recursion step | recursion depth is not the lever; augmentation and voting are; TRM's per-puzzle embedding is not transferable |
| SOAR, 2507.14172 (s) | LLM evolutionary search (sample + refine), hindsight relabelling of every attempt as a solved (task, program) pair, fine-tune, repeat | 52% ARC-1 public test with self-improvement; joint sampling+refinement fine-tuning beats either | hindsight relabelling of the search's own executions as training data |
| Explorer-Definer / Reflective Orchestrator, 2607.06764 + repo | explorers propose pattern hypotheses, definers write transform functions with a train-feedback repair loop; the orchestrator lets the implementer spawn fresh exploration mid-loop | ARC-1 eval pass@2: 15.5% one-shot, 57.5% pipeline, 67.25% orchestrator (DeepSeek V3.2); ~75% of unique wins from mid-loop exploration; "generation-bound, not selection-bound" | separate "which transformation" (policy) from "bind it exactly" (finishers, version spaces); failure returns to proposal |
| ArcMemo, 2509.04439 (s) | concept-level natural-language memory abstracted from solutions, retrieved per task, updated during evaluation | 55.17 -> 59.33 on ARC-1 (o4-mini) | concepts not instances (the previous stage's library found none with support >= 2) |
| CompressARC (repo + s) | 76K-parameter equivariant network trained from scratch per puzzle, loss = description length | 20% eval, 34.75% training, ~20 min/puzzle on a GPU | per-task learning is possible without pretraining but costs orders of magnitude more than 3 s on a CPU |
| NVARC (s) | 10^6 synthetic puzzles by concept mixing, validated; Qwen-4B with TTT; 8 geometric x colour-permutation augmentations; TRM ensemble | 24% ARC-2 private | whole-task D4 and colour augmentation are exact; mixing generators |
| ARChitects 2025 (s) | LLaDA-8B masked diffusion, 2D RoPE, 102 recursive soft-mask refinement steps, perspective (augmentation) scoring | 16.5% ARC-2 | iterative refinement of a whole output grid; score candidates across augmentations |
| ARCANA, 2607.09059 (s, unverified) | slot-attention scene graphs, cVAE latent program policy, symbolic execution traces, counterfactual credit assignment, learned meta-controller | no numbers found | not used beyond the general loop |

## 4. The vertical slice: execution-guided transformation policy

```
task demonstrations (x_i, y_i), test input t
        |
        v
  best-first search over EXECUTED states (73-egsearch.js)
    node = (S_i = P(x_i) for every demonstration, P(t))
    free exact finishers at every node: S_i == y_i, one colour map S_i -> y_i
        |  expand: ask the policy
        v
  transformation policy (72-policy.js), 63k parameters, trained from scratch
    per demonstration:  pair tower over [S one-hot, y one-hot, S != y, bg masks,
                        x != S, x != y]  (conv 3x3, dilations 1, 2, 4)
                        single tower over S and over y (shared)
                        16 scalars (sizes, ratios, residual fraction, palettes)
    demonstrations pooled as a SET (mean, max) -> 128
    heads: next step type (80 types) + colour pointer (colour-equivariant)
        |  top-6 proposals (p >= 0.01), colour args: top-2 colours
        v
  step language (70-steps.js): legacy grid primitives made explicit
    geometry, crops/selections, compressions, colour edits, drawing/repair,
    scaling/tiling/mirroring, gravity/shifts/sorting, split-and-combine,
    FIN_SKETCH = hand the remaining gap to entity-level synthesis (63-sketch.js)
        |
        v
  every step executed on every grid; invalid, no-op, already-seen states dropped
  a program is returned only if it reproduces EVERY demonstration exactly
```

Training data (`tools/arc-steps-lib.js`): rules sampled from the step
language (depth 1-3, optionally closed by a colour map or a sampled entity
program), each executed on inputs from one of five generators (ARC-AGI-1
training-split inputs, random object scenes, sparse noise, tiled/mirrored
motifs, separator panels). Pairs are kept only when every step changes the
state and no state repeats. Every prefix state of every task is one
supervised example: (x_i, S_i, y_i over the demonstrations) -> next step.
400,000 examples, generated on the fly by 4 workers; exact colour-permutation
augmentation; 39 minutes on 4 CPU cores.

Held out from training by STRUCTURE, never by rendering: 10% of ordered
step-type adjacencies (A -> B never adjacent while A and B each appear), six
ordered group adjacencies (e.g. geometry -> colour edit), 10% of exact step
sequences, and every 4-step program.

## 5. Synthetic out-of-distribution results

Frozen before any model was evaluated on it: `c4-arc-steps-ood.js`, 200
tasks per split, 3 demonstrations + 1 query each, inputs from the test side
of every generator. Same search, same execution budget; only the proposal
distribution differs. Top-1 = the first program found solves the query.
(`measurements/egp-ood-v1.json`, `measurements/egp-ood-template.json`)

| split (200 each) | policy on executed state | template: same net, no executed state | bigram P(step given previous) | uniform |
|---|---|---|---|---|
| **300 executions** | | | | |
| in-distribution | **121** | 105 | 13 | 10 |
| held-out programs | **123** | 105 | 4 | 1 |
| held-out type-pair compositions | **73** | 42 | 4 | 3 |
| held-out group-pair compositions | **59** | 35 | 13 | 7 |
| depth 4 (never trained) | **15** | 9 | 4 | 2 |
| **1500 executions** | | | | |
| in-distribution | **130** | 114 | 30 | 21 |
| held-out programs | **133** | 110 | 24 | 15 |
| held-out type-pair compositions | **96** | 55 | 11 | 5 |
| held-out group-pair compositions | **81** | 47 | 24 | 12 |
| depth 4 (never trained) | **26** | 11 | 8 | 2 |

The defining test ("does it solve a novel composition because it
understands the intermediate state?") comes out yes, within this language:

* Against the identical network trained without the executed state, the
  advantage is +14% in distribution and +72-75% on held-out compositions,
  +136% at an unseen depth. The template model has to infer from tokens what
  the program did; that inference is what breaks on compositions it never
  saw. This reproduces Ouellette's finding (EG-NPS vs program-space
  learning) with a different model, DSL and search.
* Held-out exact programs are solved as often as trained ones (133 vs 130):
  no memorisation of sequences.
* Blind and bigram search at the same budget solve 1-15% of these tasks.
  The learned proposal is worth roughly two orders of magnitude of
  executions.
* It is not solved: held-out compositions reach 40-48%, depth 4 only 13%.
  Composition still degrades with novelty and depth.

Next-step prediction on the training distribution (validation, 600 steps):
top-1 32.8% / top-5 68.5% with the executed state, 28.3% / 62.3% without.
Next-step accuracy understates search value (several next steps are often
equally valid; see the set-valued labels in 72-policy.js).

## 6. On real ARC tasks (development split)

**Search alone** (`tools/arc-egs-arc.js`, 1 s per task, trained policy):
100 of 400 development tasks get a demonstration-exact step program, 84 are
right at top-1, 88 have a right program among those found. Only 1 is a task
the full engine did not already solve at top-1 (`arc1_f5b8619d`: tile 2x2,
then entity-level rays). The policy guides rather than being brute-forced:
over the 73 steps of the 60 step-program solutions, the winning step was the
policy's first choice 36 times, 2nd-3rd 24 times, 4th-6th 12 times, lower
once. Trained only on synthetic tasks, it ranks real ARC transformations
well, when they are in its language.

**Inside the portfolio** (`tools/arc-stage2-runs.sh`, same 3 s harness):

| run | top-1 | top-2 | oracle | task seconds |
|---|---|---|---|---|
| previous frozen engine (dev-final) | 260 | 268 | 270 | 1013 |
| + egpolicy + ntrans (dev-new) | 260 | 268 | 270 | 1045 |

One gain (`arc1_f5b8619d`, egpolicy), one regression (`arc1_239be575`,
the bidirectional family did not reach its program in the shared time). The
policy branch produces the correct output on 68 development tasks, 62 of them
also produced by legacy families; the union of all branches stays at 270.
On the split the step language was assembled from, the new branch adds no
generation. Whether its composition ability reaches unseen ARC tasks can only
be measured on the held-out split.

## 7. Neural transduction branch (74-ntrans.js)

61k parameters, trained from scratch on 200,000 same-shape synthetic tasks
(70% step and entity programs, 30% random cellular automata), whole-task D4
and colour-permutation augmentation, 34 minutes on 4 cores.

| measurement | result |
|---|---|
| synthetic validation (test-side generators), query painted exactly | 13.7% |
| leave-one-demonstration-out gate: coverage / precision | 2.3% / 71% |
| ARC development, 262 same-shape tasks, painted exactly (no gate) | 2 |
| admitted by the gate / correct / new-only | 2 / 2 / 0 |

It is a weak branch: a 61k-parameter CNN trained on this synthetic mix
does not learn ARC transformations the program families lack. It is kept
because it is cheap (about 40 ms per task), conservative (gate precision
100% on development) and its held-out overlap is measured below; by the
brief's own criterion (only duplicate solves) it has not earned its cost.

## 8. Task-time adaptation (TTT) of the policy

Per task: clone the policy, search with 40% of the budget, relabel every
state that search executed as the correct output of the path that produced it
on THIS task's inputs (hindsight), fine-tune the heads on those paths (towers
frozen, features cached), search the remaining 60% with the adapted clone.
Demonstration outputs are used only as search targets; test outputs never.

| setting | before adaptation | after adaptation |
|---|---|---|
| synthetic OOD, 1500 executions (iid / prog / comp-type / comp-group / depth4) | 130 / 133 / 96 / 81 / 26 | 132 / 136 / 97 / 83 / 28 |
| synthetic OOD, 300 executions | 121 / 123 / 73 / 59 / 15 | 111 / 123 / 67 / 57 / 15 |
| ARC development, policy search alone, 1 s per task: top-1 / any / new vs engine | 84 / 88 / 1 | 86 / 91 / 1 |

A small, consistent gain when the budget is large enough for two phases
(+1 to +3 per split, +2 top-1 on ARC development), a loss when it is not.
It creates no new capability (the new-vs-engine count is unchanged), which
matches Ouellette's finding that test-time fine-tuning mostly re-elicits
in-distribution knowledge. The portfolio keeps plain search.

## 9. Held-out ARC-AGI-1 evaluation (frozen stage-2 engine, one run)

Engine frozen at commit 1e55d16 (sha256 `8cd8a7ad62cb1c9e...`) before the
run; same harness (3 s per task, 3 workers). Scored independently against
the official task files (`tools/arc-verify.js`).

| engine | top-1 | top-2 | oracle generated = retained | official pass@2 | task seconds |
|---|---|---|---|---|---|
| previous stage (frozen) | 115 | 120 | 122 | 120.5 | 1094 |
| **stage 2: + egpolicy + ntrans** | **116 (29.0%)** | **122 (30.5%)** | **124 (31.0%)** | **122.5 (30.6%)** | 1108 |

Every task whose outcome changed:

| task | before -> after | cause |
|---|---|---|
| arc1eval_bbb1b8b6 | not generated -> correct at rank 2 | **new generation by egpolicy** (`halves_or_v`, then entity recolouring) |
| arc1eval_bf699163 | rank 2 -> rank 1 | **ranking**: egpolicy agrees with 5 other families (consensus term) |
| arc1eval_bf89d739 | not generated -> top-1 | legacy population search, timing |
| arc1eval_9def23fe | not generated -> rank 2 | legacy cellwise, timing |
| arc1eval_5b526a93 | top-1 -> lost | legacy cellwise, timing |

So the new branches contributed exactly one new generated output (a
second-guess solve) and one ranking fix; neural transduction contributed
nothing. The +1 / +2 / +2 is within what timing moves between runs.

## 10. Branch overlap

Tasks whose correct output each branch produced (`tools/arc-overlap.js`):

| split | legacy | sketch | egpolicy | transduce (69) | ntrans (74) | union |
|---|---|---|---|---|---|---|
| development | 240 | 109 | 68 | 13 | 2 | 270 |
| evaluation | 108 | 29 | 24 | 1 | 0 | 124 |

| pair (evaluation) | A n B | Jaccard | only B | only A |
|---|---|---|---|---|
| legacy / egpolicy | 19 | 0.168 | 5 | 89 |
| sketch / egpolicy | 7 | 0.152 | 17 | 22 |
| legacy / sketch | 14 | 0.114 | 15 | 94 |

egpolicy's 24 correct evaluation outputs: 23 are tasks other branches
already solve at top-1; 1 (bbb1b8b6) is produced by no other branch.

## 11. Transfer ratios (evaluation change / development change)

| subsystem | development | evaluation | transfer |
|---|---|---|---|
| previous stage's families (sketch, extract, encode, transduce) | +27 top-1 | +11 top-1 | 0.41 |
| egpolicy, correct outputs produced (branch size) | 68 | 24 | 0.35 |
| egpolicy, demo-exact programs found in the portfolio | 77 | 32 | 0.42 |
| egpolicy, unique oracle contribution | +2 (258 -> 260, noise level) | +1 | ~0.5 of almost nothing |
| ntrans | +1 (noise) | 0 | 0 |

## 12. Milestones

| milestone | target | reached |
|---|---|---|
| A: evaluation oracle > 35% (140) | 140 | no: 124 (31.0%) |
| B: evaluation top-1 > 35% | 140 | no: 116 (29.0%) |
| C-I (45% ... 90%) | | no |

## 13. Diagnosis

1. **The mechanism works; the space is too small.** On held-out
   compositions of its own language the execution-guided policy is 72-75%
   better than the same network without the executed state and two orders
   of magnitude more efficient than blind search. On real ARC tasks it
   ranks the right next step first half the time. On the evaluation split
   it still produces only 24 correct outputs, 23 of them already found by
   other families. The step language is the legacy primitives made
   explicit, and those primitives were already searched (bottom-up) by the
   legacy enumerator. A better navigator of the same space adds almost no
   new ARC solutions. Coverage, not navigation, bounds ARC generation.
2. **Composition still degrades with novelty.** 65% in distribution, 40-48%
   on held-out compositions, 13% at an unseen depth. Even inside its
   language the policy is far from reliable composition.
3. **Neural transduction at this scale does not transfer.** A 61k-parameter
   CNN trained on synthetic tasks paints 2 of 262 same-shape development
   tasks and none of the evaluation tasks. The systems that make direct
   prediction work on ARC (ARChitects, NVARC, TTT) use pretrained models of
   billions of parameters and GPU hours per task. That is outside this
   engine's CPU/3 s constraint.
4. **The failures that dominate evaluation are untouched by this stage:**
   "a program fits every demonstration and is wrong" (82), created cells no
   operator explains (49), object correspondence (44), size change
   unexplained (42).

## 14. Not done (and why)

| requested | status |
|---|---|
| Explorer/definer split with ABANDON_HYPOTHESIS | partial: the policy proposes step types, exact finishers bind them; no explicit abandon/re-explore loop was built, because the first measurement showed coverage, not search control, is the ARC bottleneck |
| value function, PUCT / MCTS | not built (same reason) |
| adversarial task generator at the competence edge | not built |
| concept memory with synthetic-variant validation | not built (the previous stage's library found no concept with support >= 2) |
| NCA / per-task tiny networks | not built: CompressARC-style per-task training costs minutes of GPU per task; nothing close fits 3 s on a CPU |
| learned router | not built; the portfolio's measured-value scheduler is unchanged |
| masked-denoising refinement in the neural branch | not built (single-pass decoder) |
| offline LLM teacher | not used (no external model, by design) |

## 15. The most plausible next path (not attempted here)

Keep the policy and the search: they are the part of this stage that
demonstrably generalises. Put them to work in a much larger transformation
space: entity-level rules as INTERMEDIATE steps (not only as a finisher),
region and panel operations, and the transferable families' transformations
(symmetry, partition, tiling transferred at 0.62-1.4 in section 2) as steps.
Generate training data from all of them, and grow the space by mining
repeated residuals of near-misses into candidate primitives that must pass
synthetic held-out tests before admission. The policy's own held-out
composition results say it can navigate a larger language. Section 2 says
the language, not the navigator, is what fails on unseen ARC tasks.

## 16. Reproduction

```
node c4-arc/build.js && node c4-arc/policy-test.js          # gradient checks, search sanity
node tools/arc-verify.js ARC-AGI/data/evaluation arc1eval_ results/final/eval-final
node tools/arc-gap.js ARC-AGI/data results/final --out measurements/arc-gap.json
node tools/arc-policy-train.js --mode full --examples 400000 --seed 1 --out full.json
node tools/arc-policy-train.js --mode template --examples 400000 --seed 1 --out template.json
node tools/arc-policy-eval.js --bigram-build bigram.json
node tools/arc-policy-eval.js --variants full,fullttt,template,bigram,uniform \
     --full full.json --template template.json --bigram bigram.json --exec 300,1500
node tools/arc-egs-arc.js --full full.json --ms 1000 --against results/final/dev-final [--ttt]
node tools/arc-ntrans-train.js --examples 200000 --seed 2 --out ntrans.json
sh tools/arc-stage2-runs.sh results/stage2
node c4-arc/bench.js --policy-mode none --budget 3 --jobs 3 --corpus c4-arc-eval-tasks.js \
     --prefix arc1eval_ --out results/stage2/eval-new           # once, after freezing
node tools/arc-overlap.js results/stage2/eval-new
```
