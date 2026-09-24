# CELL4 internal dataset: sharded, up to ~250 MB

The record format has not changed. It is the same pipe-separated CELL4
syntax, read by the same parser:

```
entity: <name> | type: <type> | defn: <text> | aliases: <a>, <b> | <attr>: <value> | ...
word: <headword> | pos: n|v|adj|adv | gloss: <text> | class: <CLASS>
# comment
```

Only the storage changed. There is still one `c4-dataset.txt`, but a large
dataset can now also be a directory of shards. The language system treats
the file and every shard as **one logical dataset** and never knows which
shard a fact came from.

```
c4-dataset.txt              the single file (5 MB / 20,000 records), unchanged
c4-dataset/
  manifest.json             the only list of shards and their order
  shard_000.txt             each is a complete, valid CELL4 file
  shard_001.txt               of at most 4.75 MiB (4,980,736 bytes)
  ...                         and at most 19,500 records
  build-report.json         diagnostics from the generator (not read by the loader)
```

## Where the old limits were, and what they are now

`c4-local-dataset.js` had `MAX_BYTES = 5 MB` and `MAX_RECORDS = 20000`. They
were enforced in `parse()`, and the whole dataset was one file. The limits now
apply **per file**:

| | bytes | records |
|---|---|---|
| `c4-dataset.txt` (unchanged) | 5 MB | 20,000 |
| each shard | 4.75 MiB | 19,500 |
| whole dataset | no cap in the loader (the generator stops at 250 MiB by default; `--max-total-bytes 0` removes that) | no cap |

The 600-character field limit and every validation rule are unchanged. A
malformed line in a shard is quarantined exactly as it is in the file.

## Loading pipeline

1. `c4-dataset.txt` is read, parsed and ingested exactly as before.
2. `c4-dataset/manifest.json` is read and validated: version 1, format
   `c4-record-v1`, safe file names, per-shard limits, and totals that add up.
   An invalid manifest is reported, and the directory is skipped; nothing crashes.
3. The shards are loaded **one at a time, in manifest order**. Each shard is
   read, its UTF-8 size is checked against the manifest, it is parsed by the
   same `parse()` under the shard limits, and it is ingested. Its text is
   then released. Between shards the loader yields, so the page stays
   responsive.
   A missing shard, an unreadable shard, or one whose size differs from the
   manifest is logged and skipped. The other shards still load.
4. **Global de-duplication:** a record's identity is its type plus its fields
   in any order, with spacing normalised. The same record in two shards,
   or in the file and a shard, is taken once and counted as a duplicate.
5. Records go where they always went:
   - entities go to the knowledge base (`KB.add`) and the retrieval index
     (`LM.addDocuments`);
   - words go to the lexicon.

   The indexes grow incrementally across shards and end up as if all the
   records came from one file.
6. **Precedence is unchanged:** an entry can only fill gaps. It never
   overwrites a built-in fact, and every disagreement is counted and
   reported (the first 1,000 are kept word for word).

At start-up the loader prints one summary. For example, with the 250 MB
books-heavy test dataset (the `c4-dataset.txt` in this repo holds only
comments):

```
CELL4 dataset:
  mode: file+sharded
  shards: 55 of 55
  records: 732,480
  size: 250 MB
  loaded: 732,480 (171,625 new entities, 65,713 merged, 2,473 words, 491,966 book passages in 612 books)
  quarantined: 0
  duplicates: 0
  conflicts: 198,464
  time: 22679 ms
```

Shard errors are printed on their own lines. `C4LocalDataset.report()`
returns the same figures, and `shardErrors` lists every problem.

## Books

Books are plain text in the same record format. The generator turns each book into:

```
entity: The Grey Whale | type: book | defn: The Grey Whale is a book by Ann Example. | author: Ann Example
entity: The Grey Whale, passage 1 | type: passage | defn: <up to 600 characters of the text> | book: The Grey Whale
```

A `type: passage` record is **text to quote, not a fact**. It never enters
the knowledge base or the general retrieval index. So book text cannot
appear in an answer to a question that did not name the book. A question
that names a held book is answered from that book's own passages, quoted and
cited ("In The Grey Whale by Ann Example: “…” (passage 2)"). A book that
does not mention the thing asked about says so, rather than guessing. A
one-word title (for example *Emma*) only counts when the question calls it a
book or says "in *Emma*". The book record itself (author) answers "Who wrote …?".

## Commands

**Build a ~250 MB sharded dataset** from record files and a folder of books:

```
python3 tools/c4_dataset_build.py c4-dataset.txt my-records/ --books my-books/ --out c4-dataset
```

- Inputs are record files, or directories of `*.txt` record files. `--books`
  takes a directory of plain-text books (Project Gutenberg headers and
  footers are handled) and can be repeated.
- Output is deterministic: the same inputs give byte-identical shards and
  checksums. Records keep their input order (files sorted by path), are
  validated with the loader's rules, and are de-duplicated globally. A
  record is never split across shards. `manifest.json` is written last.
- The build stops adding records at 250 MiB by default (`--max-total-bytes`).
  The per-shard limits can be lowered with `--shard-bytes` and
  `--shard-records`, but never raised above the loader's.

**Validate** (exits 1 if the dataset is structurally invalid; add `--strict`
to also fail on malformed lines and duplicates):

```
node tools/dataset-validate.js c4-dataset
node tools/dataset-validate.js c4-dataset.txt
```

It checks the manifest, whether each shard exists, its size and SHA-256
checksum, record counts, record syntax, entity and word validity, part of
speech, word classes, duplicates, empty and oversized fields, broken `|`
fields, and the totals.

**Use it in the site:** put `c4-dataset/` next to `c4-mini.html`. It is
picked up automatically, and nothing else changes. Configuration (in
`window.ROBOTS_CONFIG`):

| key | default | meaning |
|---|---|---|
| `localDataset` | `"c4-dataset.txt"` | the single file (`false` = none) |
| `localDatasetDir` | `"c4-dataset"` | the shard directory (`false` = none) |
| `localDatasetWaitMs` | `3000` | how long the first question waits for a still-loading dataset. After that it answers with what is loaded, and later questions never wait |
| `localDatasetPreload` | `true` | start loading when the page opens, not at the first question |
| `localDatasetQuiet` | `false` | skip the start-up summary |

For example:

```html
<script>window.ROBOTS_CONFIG = { localDatasetDir: "datasets/cell4" };</script>
```

In Node (tests, tools), `RT.boot({ localDatasetDir: "path/to/c4-dataset" })`
reads the shards from disk.

## Migrating from the single c4-dataset.txt

1. Keep `c4-dataset.txt` as it is: it still loads.
2. Build the shards from it plus everything new:
   `python3 tools/c4_dataset_build.py c4-dataset.txt new-records/ --books books/`
3. `node tools/dataset-validate.js c4-dataset` should end with `RESULT: valid`.
4. Once the shards hold everything, empty `c4-dataset.txt` back to comments.
   You can also leave it: records present in both places are de-duplicated.
5. After editing any shard by hand, re-run the generator, or the validator
   and loader will reject that shard, because its size or checksum no
   longer matches the manifest. It is simpler to edit the input files and
   rebuild.

`c4-dataset/` is in `.gitignore`: a 250 MB dataset does not belong in git history.

## Measured at 250 MB (Node test runtime, this container)

Both datasets were generated by the tools above from synthetic inputs, then
validated, loaded through the full page, and queried.

| dataset | records | load | heap after load | query latency |
|---|---|---|---|---|
| A: 200 MB of books + 50 MB of records | 732,480 (491,966 passages, 612 books) | 22.7 s | 545 MB | 13–124 ms |
| B: 250 MB of entity records only (worst case) | 1,199,076 (790,722 new entities) | 79.7 s | 1.36 GB | 17–638 ms |

The first answer to "What is a crane?" takes about 1 s. That is the WordNet
dictionary loading on first use, which happens with or without the dataset.

Standard questions (the capital of France, Hamlet's author, 15% of 80,
Jupiter vs Earth, whales, love) gave the same answers with either dataset
loaded. No passage text or synthetic entity leaked into them. A first
question asked while loading was answered after the wait cap, and loading
continued in the background.

What was needed to get there (the numbers before each fix are on the same data):

- `KB.add` used to run a full fuzzy `resolve()` per record (quadratic). It is
  now an exact-key lookup, which gives the same result.
- `resolve()` no longer scans every registered name:
  - the token vote uses a word → name index (same result);
  - typo matching compares built-in names one by one as before, and imported
    names through opening-letters and word buckets. For a one-word query this
    is the same as before. For a multi-word query with a typo, an imported
    name must share a word or its opening letters.
- A never-read token index was removed.
- The retrieval index grows incrementally instead of being rebuilt per
  batch. It computes derived text on demand and packs long posting lists
  into typed arrays; scores are unchanged.
- Hot loops no longer look up globals per character (12× faster in the Node
  runtime).
- Load time went from 86 s to 22.7 s for A, and from 220 s to 79.7 s for B.

## Files changed

| file | why |
|---|---|
| `c4-local-dataset.js` | per-file limits, the manifest and shard loader, global de-duplication, bad-shard isolation, summary logging, bounded first wait, the book library |
| `c4-lm-kb.js` | `addEntity` exact lookup; indexed token vote and fuzzy buckets; dead token index removed; shared provenance record |
| `c4-lm-retrieve.js` | incremental, memory-lean index (lazy derived fields, packed postings) |
| `c4-lm-core.js` | ASCII fast path in `normalizeUnicode`; no per-call global lookups in hot helpers (same output) |
| `c4-lm.js` | library stage (questions naming a held book); bounded wait for a loading dataset |
| `c4-lm-dialogue.js` | "who is X?" is no longer mistaken for "which of the two" |
| `c4-mini.html` | the page router sends book questions to the language stack |
| `tools/lm-runtime.js` | reads a shard directory from disk (`localDatasetDir`) |
| `tools/c4_dataset_build.py` | new: the generator |
| `tools/dataset-validate.js` | new: the validator (uses the loader's own parser) |
| `tools/dataset-shard-test.js` | new: 50 checks, in `npm test` |
| `package.json`, `.gitignore`, `c4-dataset.txt` (comments) | scripts, ignore the generated directory, a pointer to this document |
