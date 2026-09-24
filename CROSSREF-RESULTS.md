# Cross-referencing, contextual memory and the chunked dataset caller

Local only. There is **no external model or API**, no answer table and no
per-word rules. The LM learns the relation your example pairs share, from a
reference dataset it reads in verified chunks. It then applies that relation
to new items and shows its reasoning chain. It also remembers your pairs for
the rest of the session.

## Results (frozen held-out sets, each scored once)

| Set | Written | Before (code without cross-referencing) | After |
|---|---|---|---|
| Cross-referencing v1 (29 turns, one session) | before the engine existed | 1 / 29 | **27 / 29** |
| Cross-referencing v2 (25 turns, one session) | after the engine, before being run | 6 / 25 | **20 / 25** (19 strict)\* |

\*"What color is blood?" was scored good because "red" was quoted, but the
answer said green, from the wrong sense of "plasma". It is fixed now (see
below), but it counts as wrong in the held-out number.

On the untouched v2 set, correct answers went from 6 to 20: **3.3× (3.2×
strict)**. The misses on each set were then fixed as general classes, and
each set became a development set:

| Set, current code | Correct |
|---|---|
| v1 | 28 / 29 |
| v2 | 22 / 25 |
| Dev test `tools/lm-crossref-test.js` | 32 / 32 |
| Poisoning / chunking test `tools/dataset-test.js` | 15 / 15 |

**Nothing else regressed:**

| Suite | Result |
|---|---|
| `npm test` | green |
| LM battery | 184/184, 0 hallucinations, 0 defects |
| Paraphrase | 675/687 |
| Robustness | 53/53 |
| heldout3 | 34/36 |
| reason-synth | 1.0 |
| Everyday sets v1-v4 | unchanged |

## Your example, as it runs now

**You:** Red, Yellow = Ketchup, Mustard

```
Got it: Red → Ketchup, Yellow → Mustard.
Reasoning:
1. Pattern: each left item is a chromatic color and each right item a condiment that has it (it fits 1 of 2 pairs in my data).
2. Checked Red → Ketchup: ketchup is “thick spicy sauce made from tomatoes”, and a tomato is “mildly acid red or yellow pulpy fruit eaten as a vegetable”.
3. Mustard: my dataset doesn't state its chromatic color, so I'm keeping Yellow → Mustard as your pairing, not as a fact.
```

**You:** Blue, Peach = Water, Sand

```
Got it: Blue → Water, Peach → Sand.
Reasoning:
1. Pattern: each left item is a chromatic color and each right item a material that has it (it fits 0 of 2 pairs in my data).
2. Water: my dataset doesn't state its chromatic color, so I'm keeping Blue → Water as your pairing, not as a fact.
3. Sand: my dataset describes it as red (sand is “a loose material consisting of grains of rock or coral”, and a coral is “the hard stony skeleton of a Mediterranean coral that has a delicate red or pink color and is used for jewelry”), so I'm keeping Peach → Sand as your pairing, not as a fact.
```

**You:** Green, White = ?

```
Green → Green olive (or wasabi, sauce Louis); White → Blanc (or veloute, horseradish sauce).
Reasoning:
1. From Red → Ketchup, Yellow → Mustard: each left item is a chromatic color and each right item a condiment that has it.
2. Green: green olive is “olives picked green and pickled in brine”.
3. White: blanc is “a white sauce of fat, broth, and vegetables (used especially with braised meat)”.
```

**You:** What did I pair with Blue?

```
You paired Blue with Water. My data doesn't confirm that one, so it's your association rather than a fact.
```

**You:** Why is Red Ketchup?

```
You paired Red with Ketchup, and my data backs it up: ketchup is “thick spicy sauce made from tomatoes”, and a tomato is “mildly acid red or yellow pulpy fruit eaten as a vegetable” — so ketchup is red.
Reasoning:
1. Pattern: each left item is a chromatic color and each right item a condiment that has it.
2. Read ketchup's definition, then one step further to tomato, until it named red.
```

**You:** What color is water?

```
My dataset doesn't state the color of water. (You paired it with Blue earlier — I've kept that as your pairing.)
```

**You:** Purple, Orange = Grape, Carrot

```
Got it: Purple → Grape, Orange → Carrot.
Reasoning:
1. Pattern: each left item is a chromatic color and each right item a produce that has it (it fits 2 of 2 pairs in my data).
2. Checked Purple → Grape: grape is “any of various juicy fruit of the genus Vitis with green or purple skins”.
3. Checked Orange → Carrot: carrot is “orange root”.
```

**You:** What about blue?

```
Blue → Blueberry (or radicchio, fennel).
Reasoning:
1. From Purple → Grape, Orange → Carrot: each left item is a chromatic color and each right item a produce that has it.
2. Blue: blueberry is “sweet edible dark-blue berries of either low-growing or high-growing blueberry plants”.
```

**You:** dog is to puppy as sheep is to ?

```
Sheep → Lamb.
Reasoning:
1. From Dog → Puppy: the right side is defined as “young …” the left side.
2. Sheep: lamb is “young sheep”.
```

**You:** hand : finger :: foot : ?

```
Foot → Toe (or big toe, little toe).
Reasoning:
1. From Hand → Finger: the right side is a part of the left side.
```

**You:** Actually, Blue = Sky

```
Got it: Blue → Sky.
Reasoning:
1. Updated: Blue → Sky (was Water).
2. Pattern: each left item is a chromatic color and each right item a material that has it (it fits 0 of 1 pair in my data).
3. Sky: my dataset doesn't state its chromatic color, so I'm keeping Blue → Sky as your pairing, not as a fact.
```

**You:** what pairs have I given you?

```
So far: Red → Ketchup, Yellow → Mustard, Peach → Sand, Green → Green olive (inferred), White → Blanc (inferred), Purple → Grape, Orange → Carrot, Blue → Blueberry (inferred), Dog → Puppy, Sheep → Lamb (inferred), Hand → Finger, Foot → Toe (inferred), Blue → Sky.
```

## How it works

### 1. Chunk-sized dataset caller (`c4-dataset.js`)

- **The dataset:** Princeton WordNet 3.1, an open lexical database: 117k
  concepts, their definitions, and typed links such as kind-of, part-of,
  opposite-of, similar-to and attribute-of.
- **Fetching:** `node tools/dataset-fetch.js` downloads it once from the npm
  registry (`wordnet-db@3.1.14`). The tarball must match the registry's
  published sha512 before anything is written.
- **Reading:** every file is read in bounded chunks.
  - Browser: HTTP Range requests to a static mirror (default: jsDelivr's
    copy of the same package).
  - Node: positioned reads of the local copy.
  - Both have retries with backoff, per-file and total byte caps, and
    request counters. The full load is 59 chunk reads (28 MB) and takes about
    2 s once per session.
- **Zero poisoning:**
  1. **File:** its SHA-256 must equal the pinned manifest
     (`c4-dataset-manifest.js`, generated by the fetch tool). One flipped
     byte rejects the whole file.
  2. **Record:** each line must carry its own byte offset (WordNet's built-in
     self-address), a legal part of speech, and word and pointer counts that
     match. Legal pointer fields are required too. Anything else is
     quarantined, not repaired.
  3. **Link:** a pointer is followed only to a record that exists and itself
     validates.
  4. **Provenance:** things you say are stored as *your* pairs and never
     written into the dataset. "What color is water?" still answers from
     the dataset and notes your pairing separately.

### 2. Relation induction (`c4-lm-crossref.js`)

For each example pair it searches for what links the two sides. The reading
that explains the most pairs wins. Equal readings are settled by evidence
cost, then by which one carries over to the new item.

| Family | What it uses | Example |
|---|---|---|
| Knowledge base | a relation stored in the KB | France, Japan = Paris, Tokyo → capital → Italy = Rome |
| Typed dataset link | a pointer, with similar-to or also-see steps tolerated | happy : sad (via "unhappy") :: up : down; hand : finger :: foot : toe |
| Definition template | the same wording in both definitions | puppy "a **young** dog" → lamb "**young** sheep", pup "**young** of … a dog" |
| Attribute values | the left items share an attribute class (colors, shapes, tastes); the right items share a kind; each value is read from the definition, directly or through one physical step | ketchup "made from **tomatoes**" → tomato "mildly acid **red** …" |

**Reasoning safeguards, all derived from the dataset's own structure:**
- **A value word must describe something.** "white nutritious liquid"
  counts; "grains of rock or coral" does not.
- **Word senses are read in context** (the Lesk method). In blood's
  definition, "plasma" is blood plasma, not the green gemstone.
- **Only physical things pass visible properties along.** A definition hop
  never goes through a number or an idea.
- **A value competes only with its own family.** White is compared with
  black, not with "substance".
- **Analogy answers stay in the same kind as the example's exact sense.**
  foot → toe, never "written communication".
- **Opposites come from the dataset.** They are either the dataset's own
  opposite links, or glosses that differ only in an opposed word.
- **Shades come from the dataset's own compounds.** "dark-blue" counts as
  blue; "yellow-flowered" does not count as yellow.

### 3. Contextual memory

- Pairs in either direction: "What did I pair with Blue?", "Which color went
  with Sand?"
- Why a pair holds.
- Patterns remembered per kind. "What about blue?" joins the color pattern,
  not the last analogy.
- Corrections ("Actually, Blue = Sky") are re-checked against the set they
  correct.
- "Forget the Peach pair", "what was the first pair?", and "what pairs have I
  given you?" (stated vs inferred).
- Your personal-memory commands ("forget my name") are left to the memory
  module.

## Honest limits

- **Coverage is WordNet's.** It doesn't state mustard's or water's color, so
  those pairs stay your associations. It has no link for bird : fly or
  cow : calf, and the LM says so.
- **Suggested matches can be obscure** ("blanc" for a white condiment).
  They're chosen by the pattern and ranked by commonness, not by taste.
- **In the browser, the dataset loads from a public mirror.** If that's
  unreachable, cross-referencing falls back to the knowledge base, and the
  page says the dataset is unavailable.

## Reproduce

```
node tools/dataset-fetch.js        # once: fetch + verify WordNet into data/wordnet
npm test                           # includes dataset-test and lm-crossref-test
node tools/lm-chat-eval.js --set tools/crossref-heldout2.json --show
```
