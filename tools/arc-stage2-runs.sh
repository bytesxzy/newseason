#!/bin/sh
# Stage-2 development runs (ARC-AGI-1 TRAINING split), sequential, same
# harness as every earlier run: 3 s per task, 3 workers.
#   sh tools/arc-stage2-runs.sh OUT_DIR
# The evaluation split is NOT run here: it is run once, separately, after the
# engine is frozen (see TRANSFORMATION-POLICY-REPORT.md).
set -e
OUT="$1"
B="node c4-arc/bench.js --policy-mode none --budget 3 --jobs 3"
$B --out "$OUT/dev-new"
$B --without egpolicy --out "$OUT/dev-no-egpolicy"
$B --without ntrans --out "$OUT/dev-no-ntrans"
echo ALL-DONE
