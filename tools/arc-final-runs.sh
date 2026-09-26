#!/bin/sh
# Frozen-protocol runs, sequential (identical 3-worker timing conditions).
#   sh tools/arc-final-runs.sh BASELINE_ROOT OUT_DIR
# BASELINE_ROOT: a directory holding the pre-change engine (commit 2771611's
# c4-arc-engine.js) and copies of c4-arc-tasks.js / c4-arc-eval-tasks.js.
# 1. ARC-AGI-1 public EVALUATION split (frozen file, used once):
#      baseline engine, final engine, final engine without the new families
# 2. Development split (ARC-AGI-1 training) ablations of the final engine.
set -e
BASE="$1"; OUT="$2"
B="node c4-arc/bench.js --policy-mode none --budget 3 --jobs 3"
EV="--corpus c4-arc-eval-tasks.js --prefix arc1eval_"
$B --root "$BASE" $EV --out "$OUT/eval-baseline"
$B $EV --out "$OUT/eval-final"
$B $EV --without sketch,extract,encode,transduce --out "$OUT/eval-final-without-new-families"
$B --out "$OUT/dev-final"
$B --without sketch,extract,encode,transduce --out "$OUT/dev-without-new-families"
$B --ablate sls --out "$OUT/dev-pure-search"
$B --ablate views --out "$OUT/dev-no-views"
$B --ablate shift --out "$OUT/dev-no-referent"
$B --ablate removed --out "$OUT/dev-no-removed-law"
$B --without transduce --out "$OUT/dev-no-transduce"
$B --without extract,encode --out "$OUT/dev-no-extract-encode"
echo ALL-DONE
