# CELL4 language model: everyday-conversation upgrade

Everything here runs locally in the page (`c4-mini.html`). There is **no external
model or API**, no answer table and no per-question code. Each answer comes from
reading the message's English construction plus the local knowledge base,
lexicon and exact tools.

## How it was measured

- **Frozen held-out sets.** Each set was written and committed *before* the
  round of fixes it measures, and each was scored once (git history shows the
  order). After scoring, a set becomes a development set, and the next round
  gets a new frozen set.
- **Scoring** (`tools/lm-chat-eval.js`): questions are asked in one session,
  in order, the way a person chats.
  - **good**: matches the item's patterns.
  - **honest**: a plain "I don't know / couldn't find".
  - **wrong**: anything else, such as a definition of an incidental word, a
    wrong number, or an answer about the previous topic.
- **Strict score**: a decline never counts as good unless the item itself asks
  for a decline (for example "is coffee bad for you").

| Held-out set (frozen before) | Pre-change code | After the round it measured |
|---|---|---|
| v1: 36 questions (round 1) | 16 good (14 strict), **14 wrong** | 31 good (29 strict), **3 wrong** |
| v2: 40 questions (round 2) | 13 good (13 strict), **22 wrong** | 31 good (28 strict), **5 wrong** |
| v3: 40 questions (round 3) | 19 good (16 strict), **15 wrong** | 37 good (34 strict), **1 wrong** |
| v4: 40 questions (written after round 3, scored before any v4 fix) | 14 good (13 strict), **17 wrong** | 30 good (26 strict), **3 wrong**\* |

\*One of the three v4 "wrong" answers is a scoring error. The hat does cost
$10, but the frozen "bad" pattern matched "scarf = 20" inside the working. The
frozen file was left unchanged.

**Over all 156 held-out questions:**

| | Pre-change | Now |
|---|---|---|
| Wrong answers | 68 | 12 (5.7× fewer) |
| Strict good | 56 | 117 (2.1×) |

On the newest untouched set (v4), wrong answers dropped from 17 to 3. Two of
those are real errors, and both were fixed after measurement.

**Current code, all four sets (now development sets):**

| Set | Good | Wrong |
|---|---|---|
| v1 | 33/36 | 0 |
| v2 | 37/40 | 0 |
| v3 | 38/40 | 0 |
| v4 | 34/40 | 1 (the scoring error above) |

The rest are honest declines where the local knowledge base has no facts (how-tos, penicillin, day and night).

**Nothing else regressed:**

| Suite | Result |
|---|---|
| LM battery (`lm-eval.js`) | 184/184, 0 hallucinations, 0 synthesis defects |
| Paraphrase suite | 675/687 (was 674) |
| Robustness | 52/52 |
| heldout3 | 34/36 |
| reason-synth | 1.0 |
| `lm-chat-test` | 82/82 |
| `npm test` | green |

Answers are about 25 words on average, up from about 19. The extra length is
the reasoning being shown: the equation, the rule applied, what a percentage
means, the conversion factor.

## What a random user now gets (pre-change code → current code)

**Q: hi!**

- Before: Ask me anything — a fact, a calculation, an explanation, or something to build.
- After: Hi! How can I help?

**Q: I'm so sad, my cat died.**

- Before: A cat is a small domesticated carnivorous mammal.
- After: I'm so sorry to hear that your cat died. It's natural to feel so sad. Losing someone you love is really hard, and there's no right way to feel about it. If you'd like to talk about them, I'm here.

**Q: I got promoted today!**

- Before: Understood — say more and I'll dig in.
- After: Congratulations — you got promoted today! That's great news. Tell me more!

**Q: I feel overwhelmed with work.**

- Before: Work has more than one sense: activity involving effort done to achieve a result; as a verb, to do work.
- After: I'm sorry you're feeling overwhelmed with work. Having too much on at once is exhausting, and it doesn't mean you're doing anything wrong. If you list what's on your plate, I can help you sort it into what's urgent, what can wait, and the smallest next step.

**Q: If the store is open, the lights are on. The lights are off. Is the store open?**

- Before: Open-source software is released under a licence that lets anyone read, modify and redistribute the source.
- After: No. The rule says: If the store is open, the lights are on. “the lights are on” is false here, so “the store is open” must be false too — otherwise the rule would have made it true. (That's modus tollens: if the result didn't happen, the condition can't have either.)

**Q: Some fruits are sweet. A lemon is a fruit. Is a lemon sweet?**

- Before: An apple is the edible fruit of the apple tree, Malus domestica.
- After: Not necessarily. Only some fruits are sweet, and nothing stated says a lemon is one of them — a lemon may or may not be sweet.

**Q: No poets are robots. Some artists are poets. Can all artists be robots?**

- Before: No. Some artists are poets, and no poets are robots. Those artists therefore cannot be robots, so not all of them can.
- After: No. Some artists are poets, and no poet is a robot — so those artists aren't robots, which means not every artist is a robot.

**Q: Mia picked 15 apples and ate 4. How many apples does she have?**

- Before: 1365. Checked by 3 independent methods (multiplicative formula, Pascal's triangle, factorial definition); verified by symmetry C(n,k)=C(n,n-k), bound C(n,k) <= 2^n.
- After: 11 apples. Mia picked 15 apples, then ate 4: 15 − 4 = 11.

**Q: A pizza is cut into 8 slices. I eat 3. What fraction is left?**

- Before: I don't have anything reliable on What. I couldn't confirm it from the public sources I can reach either. If you can point me at a more specific term or a source, I'll work from that.
- After: 5/8 of the pizza is left. The pizza was cut into 8 slices and 3 were eaten, so 5 of the 8 remain — 5/8, or 62.5%.

**Q: Tom is 12. His sister is twice his age. How old is his sister?**

- Before: I don't have anything reliable on his sister. I couldn't confirm it from the public sources I can reach either. If you can point me at a more specific term or a source, I'll work from that.
- After: 24. Writing what's stated as equations: Tom = 12; the sister = 2 × Tom. Solving them together gives Tom = 12, sister = 24.

**Q: What's the average of 4, 8 and 12?**

- Before: The mean is 6. Computed exactly (stats.describe); verified by count, n x mean = sum, E[x^2] - E[x]^2.
- After: The mean is 8: (4 + 8 + 12) ÷ 3 = 24 ÷ 3 = 8. Computed exactly and checked 4 ways (count; n x mean = sum; E[x^2] - E[x]^2; …); 1 independent reading agrees.

**Q: What is 15% of 200?**

- Before: That comes to 30.
- After: That's 30. 15% means 15 out of every 100, so 0.15 × 200 = 30.

**Q: Which is bigger, 3/4 or 2/3?**

- Before: 3/4 equals 0.75.
- After: 3/4 is bigger: 3/4 = 0.75, while 2/3 ≈ 0.667. Over a common denominator: 9/12 versus 8/12.

**Q: Which is closer to the Sun, Venus or Mars?**

- Before: Mars is the fourth planet from the Sun. It is a cold desert world often called the Red Planet. It is in the Solar System.
- After: Venus is closer to the Sun: it's the second planet from the Sun, while Mars is the fourth.

**Q: Which is heavier, the Sun or the Earth?**

- Before: The Sun is the star at the centre of the Solar System. It is also a ball of hot plasma powered by nuclear fusion. It dates to about 4.6 billion years old.
- After: I don't have their masses stored, but by size the Sun is about 109 times as wide (1.39 million km in diameter versus 12,742 km in diameter), so the Sun is very likely heavier — though size alone doesn't settle mass.

**Q: What's the difference between a virus and a bacterium?**

- Before: Virus and bacteria differ in one respect. Virus is A virus is a tiny infectious agent that can only replicate inside the living cells of a host, while bacteria is single-celled microorganisms without a nucleus; some cause disease and many are harmless or useful.
- After: A virus is a tiny infectious agent that can only replicate inside the living cells of a host, while bacteria are single-celled microorganisms without a nucleus; some cause disease and many are harmless or useful.

**Q: Is a whale a fish or a mammal?**

- Before: No. Whale is a large marine mammal that breathes air and nurses its young.
- After: A whale is a mammal, not a fish — it's a large marine mammal that breathes air and nurses its young.

**Q: Is the Sun a planet?**

- Before: No. Sun is the star at the centre of the Solar System, a ball of hot plasma powered by nuclear fusion.
- After: No — the Sun is a star, not a planet. The Sun is the star at the centre of the Solar System, a ball of hot plasma powered by nuclear fusion.

**Q: What's the tallest mountain in the world?**

- Before: In the world, a mountain is a large natural elevation of the earth's surface. That is the general sense of the word — I don't hold a separate world meaning for it.
- After: Mount Everest is the highest mountain above sea level, on the border of Nepal and Tibet.

**Q: How old is the Earth?**

- Before: World means the earth and all the people and things on it.
- After: Earth is about 4.54 billion years old. It is in the Solar System. It is 12,742 km in diameter.

**Q: What's the opposite of hot?**

- Before: Hot means as an adjective, having a high temperature.
- After: The opposite of hot is cold. (Hot is “having a high temperature” and cold is “having a low temperature”.)

**Q: Why do we sleep?**

- Before: Hot means as an adjective, having a high temperature.
- After: I couldn't find a reliable explanation of why we sleep, and I'd rather not guess at a cause.

**Q: What should I eat for dinner?**

- Before: I don't have anything reliable on What should I eat for dinner. I couldn't confirm it from the public sources I can reach either. If you can point me at a more specific term or a source, I'll work from that.
- After: I don't know your taste, and I don't keep a catalogue of meals to pick from, so I'd rather not choose one at random. Tell me a couple you've enjoyed — or what you're in the mood for — and I'll help you narrow it down by what they have in common.

**Q: thanks, bye!**

- Before: Hot means as an adjective, having a high temperature.
- After: You're welcome! Take care — bye for now!

## What changed

- **Everyday reasoning** (`c4-lm-everyday.js`)
  - **Rules:** modus ponens and tollens, with both fallacies named. Opposite
    states flip polarity (on/off, open/closed, won/lost). A double polarity
    flip that broke negative conditions is fixed.
  - **One containment calculus** covers kinds, properties, abilities and verb
    phrases: "a lemon is a fruit", "can walk", "have gills", "play chess".
    Typos in class names are tolerated. "Some A are S, no S is B" gives "not
    all A are B".
  - **Word problems:**
    - comparative chains
    - linear systems solved exactly
    - possessions that change, including acquisitions and departures
    - totals of a kind, using knowledge-base hypernyms (cats and dogs are
      animals)
    - portions of a whole
    - equal groups
    - "N more X than Y"
    - "twice his age"
    - clock, weekday and month arithmetic
- **Conversation** (`c4-lm-converse.js`)
  - The intent is read from English constructions: greetings, thanks and
    goodbyes, feelings with their cause, life-event news (congratulate or
    console), self-introduction, affection, open questions, recommendations
    (which ask for your taste), rhymes, opposites and synonyms, and either/or
    kinds.
  - Answers are composed from real knowledge.
  - An answer-type gate means a definition of a word the message merely
    contains is never the answer.
- **Comparisons**
  - By position in an ordered series: Venus is the 2nd planet, Mars the 4th.
  - By exact number: 3/4 vs 2/3 over a common denominator.
  - By a stand-in measure, with its limit stated: size suggests mass but
    doesn't settle it.
  - Honest partial answers when one side's data is missing.
- **Knowledge answers**
  - Superlatives stated in definitions (Everest).
  - Direct age answers.
  - No restated facts, plural agreement, "the Moon".
  - "No" only from a different knowledge-base category (the Sun is a star,
    not a planet), never merely because the definition didn't mention a class.
- **Working shown:** percentages, unit and temperature conversions, means and
  medians, square roots.
- **Bugs fixed on the way:**
  - "picked 15 apples" was read as a combination: C(15,4) = 1365.
  - The average of "4, 8 and 12" dropped the last number (it gave 6).
  - Stems leaked into answers ("every squar is a rectangl").
  - The previous topic was carried into unrelated questions.

## Honest limits

- The offline knowledge base is small. How-tos, most "why" questions and many
  facts get an honest "I don't know" in closed mode. The page's tool mode can
  consult keyless public sources (Wikipedia/Wikidata).
- The held-out sets were written by the same process that made the fixes, but
  each was written before the fixes it measures. v4 deliberately includes kinds
  of question the system is weak at.
- Creative writing (poems, jokes) is built from stored facts, so it is literal
  rather than artful.

## Reproduce

```
npm test                                    # everything, including lm-chat-test
node tools/lm-chat-eval.js --set tools/lm-chat-heldout4.json --show
node tools/lm-eval.js --out /tmp/lm.json    # 184-case battery
node tools/lm-paraphrase.js
```
