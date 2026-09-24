/* ===== src/56c-macro-library.js ===== */
/* GENERATED FILE -- do not edit by hand.
 * Learned macro library written by tools/arc-macros.js from the synthetic
 * curriculum's TRAINING split (programs the solver found, and generator
 * programs of training tasks). Each macro was accepted only after it
 * improved held-out compositional solving or cut search cost without an
 * accuracy loss. No ARC benchmark data is used.
 * Regenerate with: npm run arc:macros */
MACROS.load([{"name":"L0","template":{"op":"crop","kids":[{"op":"keep_only","kids":[{"op":"in"}],"params":[0,0]}],"params":[]},"params":[],"weight":2,"support":37,"mdlGain":666.8,"heldoutUtility":1,"version":1,"lineage":["arc-macros seed=21 source=both"],"preconditions":{}},{"name":"L1","template":{"op":"outline_c","kids":[{"op":"grav","kids":[{"op":"in"}],"params":[0]}],"params":[{"$":0}]},"params":["C"],"weight":3.199,"support":40,"mdlGain":659.17,"heldoutUtility":2,"version":1,"lineage":["arc-macros seed=21 source=both"],"preconditions":{}}]);
