# CELL4 language stack

Local natural-language understanding, reasoning and generation for
`c4-mini.html`. No model service of any kind: no OpenAI, no Anthropic, no
Gemini, no hosted inference. The only network use is a keyless public-data
federation, and it runs only when the question's own frame says the answer
cannot be known locally.

ARC is untouched. None of the files listed here is loaded by, or loads, the
ARC engine.

## Shape

```
RAW USER TEXT
      │
      ▼  shared normalisation (unicode, morphology, spell repair, preamble)
  ONE QueryFrame                                c4-lm-core.js
      │
      ▼  one feature pass → many typed decisions
  SYSTEM-1 DECISION HEAD                        c4-lm.js
      │   route distribution · depth · confidence
      ├────────────┬─────────────┬──────────────┬────────────┐
      ▼            ▼             ▼              ▼            ▼
   COMPUTE      KNOWLEDGE      REASON        RETRIEVAL      WEB
  arithmetic    entity +       typed graph   BM25F +      evidence
  units, dates  relation       deduction,    identity     quorum,
  probability   lookup         sequences,    tiers        early exit
      │            │           ordering         │            │
      └────────────┴─────────────┴──────────────┴────────────┘
                              │
                              ▼  verification · confidence factors
                        ANSWER PLAN                     c4-lm-realize.js
                              │
                              ▼  discourse plan → clauses → agreement → polish
                           OUTPUT
```

## Files

| file | what it owns |
|---|---|
| `c4-lm-core.js` | Normalisation, morphology, typo repair, the relation lexicon, type qualifiers, and the immutable **QueryFrame**. The message is parsed once; everything downstream reads the frame. |
| `c4-lm-lexicon.js` | What WORDS mean, as distinct from what things are: senses, parts of speech and a semantic class per sense. Words it does not hold are fetched from keyless dictionaries at query time and learned. |
| `c4-lm-compose.js` | **Compositional reading.** An unseen phrase is not matched, it is read: head and modifier are looked up, the relation between them is inferred from their semantic classes, and a meaning is composed. This is what makes "learning pivot" a pivot in learning rather than the nearest article with those letters in it. |
| `c4-lm-kb.js` | The local knowledge base: entities with aliases, types, definitions, relational attributes, causal accounts, sense sets and contrast dimensions. Entity resolution is exact → alias → typo-tolerant → token-vote, and identity is never substring overlap. |
| `c4-lm-reason.js` | The reasoning graph. Compact typed nodes (ENTITY, QUANTITY, CLAIM, ORDER, OPERATION, INFERENCE, TEMPORAL) for arithmetic, percentages, rates, unit and temperature conversion, averages, probability, categorical syllogisms, transitive ordering, sequence extrapolation, date arithmetic, loop diagnosis and classification. |
| `c4-lm-retrieve.js` | Two-stage retrieval. A cheap BM25F sweep produces a shortlist; only the shortlist pays for ordered-phrase locks, identity tiers, topical concentration and relation compatibility. |
| `c4-lm-evidence.js` | Query decomposition, the source federation and the evidence graph. Sources are selected by domain, started in parallel, and cancelled the moment a quorum of independent evidence is reached. Retrieved text becomes propositions, which are merged and checked for contradiction. |
| `c4-lm-realize.js` | Answer plans and surface realisation: article selection, subject–verb agreement, connectives, enumeration, length and format constraints, and a well-formedness contract that rejects duplicate copulas, dangling connectives, repeated sentences and pasted snippets. |
| `c4-lm-code.js` | Code construction from a specification. Semantic operations, language backends, and execution of every emitted JavaScript program against its own example before it is offered. |
| `c4-reason-kernel.js` | The shared **residual-driven refinement kernel** (also compiled into the ARC engine): hypotheses with lineage, MDL scoring in bits, the bounded diverse refinement frontier, the meta-controller over reasoning operations, discrimination, `calibrate()` (confidence as accumulated evidence, never a constant), and the proposition graph with KNOWN / DERIVED / ASSUMED / UNKNOWN / CONTRADICTED status. |
| `c4-lm-problem.js` | **Problem reasoning.** Text becomes an explicit Problem (givens, unknowns, equations, constraints, assumptions, required knowledge, candidate answers) by composing an intent with the mathematical objects present. Each problem is solved by several genuinely different methods (e.g. quadratic formula / rational roots / numeric root search; elimination / Cramer; multiplicative / Pascal), every candidate is attacked by the checks relevant to it (substitution, reverse derivation, numeric calculus, bounds, symmetry), failures are labelled in the kernel's FAILURE vocabulary and eliminated, and confidence comes from `calibrate()`. Also: derivation checking with step localisation and repair, multiple-choice elimination, exact BigInt rationals and polynomials, number theory, probability, graph and CSP tools, knowledge-vs-reasoning analysis, and the visual-fact interface (POINT/LINE/REGION/ARROW/LABEL/RELATION into the same graph). |
| `c4-lm.js` | The orchestrator: discourse state, the System-1 decision head, adaptive depth, confidence assembly, ablation switches. `answerReason` now (1) prefers a structured reading over a bare-arithmetic one when the text carries algebra (interpretation check), and (2) derives the confidence of operator-library results from an independent re-derivation of their own trace (`calibrateReason`). Ablate with `problem` / `calibration`. |

## The five distinctions the architecture is built on

1. **Identity is not overlap.** A document that contains a phrase is not a
   document about it. `identityTier` scores position, not containment, and a
   definitional question may only be answered from the DEFINES tier or above.
2. **Relation is not topic.** "capital of France", "France's capital",
   "which city is the capital of France" and "capital France" all normalise to
   `subject=France, relation=capital`. One representation, not four branches.
3. **Depth is predicted, not fixed.** `2 + 2` never reaches the reasoning
   graph; "why does a metal spoon feel colder than wood" never gets answered
   by keyword match.
4. **Evidence sufficiency, not a deadline.** The federation finishes when the
   evidence is good enough and aborts the rest. A slow endpoint can add
   information; it can never delay an answer that is already supported.
5. **A word is not a thing.** "What is a pivot" is a question about a word and
   goes to the lexicon; "what is Mercury" is a question about a thing and goes
   to the knowledge base. A phrase that is neither — "learning pivot" — is
   read from its parts, and the answer says plainly that it is a reading.

## Reproducing the measurements

```sh
node tools/lm-eval.js --out measurements/lm-after.json   # the 150-case battery
node tools/lm-paraphrase.js                              # 540 unseen paraphrases
node tools/lm-ablate.js                                  # one component removed per run
node tools/lm-bench.js --n 1200                          # local latency
node tools/mock-sources.js &                             # stand-in sources with fixed delays
node tools/lm-web-bench.js                               # scheduler latency
node tools/lm-robustness.js                              # failure modes
```

## Conversation memory and answer variation (c4-lm-memory.js)

Every message is read by the memory layer before any other module. It keeps
facts the user states ("my name is ...", "I live in ..."), notes ("remember
that my meeting is at 5pm"), standing instructions ("from now on, answer in
one sentence", "use bullet points"), the topics discussed and a transcript.
Facts, notes and instructions survive a reload (localStorage key
`c4lm.memory.v1`); topics and the transcript belong to the session.

Commands are read from word definitions, not matched as phrases: a verb's
lexicon gloss decides whether it keeps or drops ("forget: to fail to recall",
"ignore: to pay no attention to", "keep: to continue to have"), negation
composes ("don't forget" keeps, "stop remembering" drops), and a verb the
lexicon lacks is learned from the dictionaries and then read the same way.
The object decides the scope: a discussed topic, a fact about the user, a kind
of memory, or everything ("previous instructions", "the context", "what I
said"). "Forget about X but keep Y in this context" drops X and focuses Y, so
"it" now means Y. Whatever else the message asks is answered normally.
Recall questions ("what's my name", "what did we talk about", "what was my
first question", "what are my instructions") are answered from memory.

Answers vary without changing what they claim: equivalent relation templates,
participle/relative-clause and appositive rewrites, and synonymous connectives,
each candidate required to keep every number and proper name of the canonical
wording and to pass the realiser's defect checks. A repeated question gets the
least similar candidate plus a fact from the same source not yet shown. The
source's own tense is kept ("2016 was a leap year"). `C4LM.seed(n)` makes the
choice reproducible; `C4LM.ablate(["variation"])` turns it off.

    npm run lm:memory      # memory + variation dialogues, 3 seeds

## Problem reasoning, falsification and calibration (c4-lm-problem.js)

Verifying a calculation says nothing about whether the calculation was the
question. Before this layer, "Solve x^2 - 5x + 6 = 0" was answered "2 - 5 =
-3" at confidence 0.99: the digits were read as arithmetic and the arithmetic
was right. Two things now stand in the way of that class of error:

1. **Interpretation check.** If the text parses as a structured problem, the
   structured reading answers. If an arithmetic reading ignored algebra that
   the text carries (a variable bound to a coefficient, an equation in a
   variable), that is recorded as a contradiction of the interpretation, and
   the calibrated confidence falls below the hallucination brake.
2. **Independent derivations + falsification.** An answer is accepted when
   methods that share no code agree AND it survives the checks relevant to
   the problem. A derivation that fails a check is eliminated, not outvoted.

Knowledge and reasoning are separated: `analyze()` reports whether a question
is derivable from what it states or needs facts it does not state; a missing
fact is `MISSING_KNOWLEDGE` in the graph, and nothing is derived from it.

Measured on synthetic verifiable problems (answers known by construction; NOT
HLE; see `tools/reason-synth.js`, `measurements/reason-*.json`):

| set | baseline accuracy | after | baseline confident-wrong | after |
|---|---|---|---|---|
| in-distribution phrasings (256) | 10.5% | 100% | 107 | 0 |
| held-out phrasings, parser frozen (160) | 2.5% | 86.9% | 75 | 1 |

The in-distribution number mostly measures coverage of the implemented
families; the held-out number is the honest generalisation figure.


## Phrasing and deliberation (c4-lm.js, c4-lm-problem.js)

The router picks one reading of the words, and idioms, metaphors, keyword
fragments and prose word problems are where one reading fails. Two general
mechanisms handle them.

**Quantitative English.** `c4-lm-problem.js` reads arithmetic stated in
English compositionally rather than by grabbing digits:
- operand order ("5 less than x");
- prefix, postfix and imperative operator chains;
- passive voice;
- "to get N" as equality;
- two-unknown systems;
- number words, fractions and collectives;
- descriptive definitions of gcd, lcm, pairwise counts, remainders and range
  sums.

The structured reading beats a bare-digit reading. English arithmetic
("three quarters of 200") is accepted only after the operator library has
declined.

**Deliberation.** In `c4-lm.js`, `deliberate()` runs from `finish()`, only
for a weak first answer. It generates readings from the knowledge base
(entities spotted in the words), the lexicon (relations reached through
another sense of a word, chosen by gloss overlap; phrases a gloss
paraphrases), the question's answer type, the entity's own facts, and, for
numeric fragments, a search over the missing connective.

Each reading is answered by the ordinary resolvers and scored on
resolver success, coverage of the question, answer-type fit and reading
cost. A replacement needs a 0.75 margin. Honesty rules withdraw an answer
about a known thing when the question's subject is unknown, and replace
small talk to a request about an unknown thing with "I don't have that".

The result records `deliberation` (trigger, readings tried with scores,
choice) and `interpretation`. It can be ablated with the `deliberation`,
`prose` and `fragment` switches.

Measure it:

    npm run lm:phrasing   # mechanism regression checks (20)
    npm run lm:heldout    # v1 (seen during development) and v2 (frozen before first run)
