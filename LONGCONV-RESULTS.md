# Long conversations: follow-ups read against the conversation

Everything runs locally. There is **no external model or API**, no answer table and no
per-question rule. Every turn is now saved as structured data: what was
asked, what was answered, what it was about, the number it gave, the meanings a
definition listed, and the statements of a word problem. `c4-lm-dialogue.js` reads each new
message against that record.

| Follow-up | Example | How |
|---|---|---|
| choosing a meaning | "What is mustard?" → "The flower" / "no, I meant the animal" / "the second one" | ordinal choice, word overlap, and the dataset's taxonomy (is the named thing an ancestor of this meaning?). It can also pick a meaning that was not listed |
| running math | "25% of 60" → "multiply that by 4" → "now subtract 10" → "what's the square of that?" → "is that more than 70?" | the previous result is the operand, and the working is shown |
| word problems over turns | "Sara has 20 stickers." → "She gives away 8." → "Then she buys 5 more." → "How many now?" | the running count after every statement |
| the two just discussed | "Which of the two has more people?" → "By how much?" | rewrites to an explicit comparison, then gives the difference from the measures behind it |
| places and people | "How many people live there?", "When was he born?" after a book | "there" means the place just discussed. "he/she" means a person, or the author of a work. If no person has been discussed, it asks who is meant instead of guessing |
| more / else | "Tell me more about Italy", "What else did he write?" | facts not said yet; other works by the same person |
| recall | "What did we talk about first?", "the last number you gave me", "Summarize our conversation" | read from the turn log |

A word nothing local defines ("crane", "seal", "pitcher") is now answered with
its WordNet meanings. WordNet loads only when it is needed.

## Math upgrades (shared by every path)

- Equal groups followed by later changes: "3 boxes, 12 each, gave 10 away" gives
  **26**. Before, the answer was 36.
- One verb covers every amount joined by "and": "spent 12 on a book and 8 on
  lunch" gives **30**. Before, the answer was 38.
- Any verb followed by "away" is a loss ("traded away 9"). Something given
  to the person counting is a gain ("his sister gave him 14").
- A question without a question mark is no longer read as a problem statement.

## Results (frozen held-out conversations, each scored once)

| Set | Written | Before | After |
|---|---|---|---|
| Long conversation v1 (30 turns, one session) | before the dialogue layer existed | 10 / 30 | **29 / 30**\* |
| Long conversation v2 (26 turns, one session) | after the layer, committed before its only run | — | **23 / 26** |

\*The one miss is a display defect: the last number showed as "60000000"
instead of "60 million years". It is fixed now, but it still counts as a miss in
the held-out number. The v2 misses were two word-problem verbs ("traded away",
"gave him"), fixed as general classes. Both sets are now development sets
(v2 now scores 26 / 26).

## Nothing broken

| Suite | Before | After |
|---|---|---|
| LM battery (184 cases) | 184 / 184, 0 hallucinations | 184 / 184, 0 hallucinations |
| LM battery latency p50 / p90 | 31 / 83 ms | 24 / 65 ms |
| Paraphrase robustness | 675 / 687 | 675 / 687 |
| Robustness | 53 / 53 | 54 / 54 |
| heldout3 | 34 / 36 | 34 / 36 |
| Everyday v1 / v2 / v3 / v4 | 33 / 37 / 38 / 34 | 33 / 37 / 38 / 34 |
| Cross-referencing v1 / v2 | 28 / 22 | 28 / 22 |
| reason-synth | 1.00 | 1.00 |
| npm test | green | green (plus `lm-dialogue-test`: 43 / 43) |

Run it: `npm run lm:dialogue`, `npm run lm:longconv:heldout`, `npm run lm:longconv:heldout2`.
