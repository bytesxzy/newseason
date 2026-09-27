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
