/* ===== src/08-hypcache.js ===== */
/* Port of engine/hypcache.py -- per-solve reuse of completed generation.
 *
 * Partial, expired and failed streams are never cached. Cache lifetime is one
 * top-level solve; transformed and leave-one-out contexts have distinct keys.
 */

var HYPCACHE_ENABLED = true;
var _HC_STATE = null;

var _HC_CACHEABLE = {};
(function () {
  var names = ["geometry", "colormap", "partition", "symmetry", "tiling",
    "blocks", "select", "regions", "counting", "cellwise", "objects_map",
    "objproc", "relproc", "motion", "substitute", "sequence", "paint", "patterns",
    "analogy", "assemble", "paneltable", "selfstamp", "tally", "extend", "locate"];
  var i;
  for (i = 0; i < names.length; i++) _HC_CACHEABLE[names[i]] = true;
})();

function hypcacheScoped(fn) {
  return function () {
    var state = HYPCACHE_ENABLED ? { items: new Map(), hits: 0, misses: 0, stored_hyps: 0,
                                     evals: new Map(), eval_hits: 0, eval_misses: 0, eval_cells: 0 } : null;
    var prev = _HC_STATE;
    _HC_STATE = state;
    try {
      var result = fn.apply(null, arguments);
      if (state && result && result.diagnostics) {
        result.diagnostics.hypothesis_cache = {
          hits: state.hits, misses: state.misses,
          stored_hyps: state.stored_hyps, entries: state.items.size,
          eval_hits: state.eval_hits, eval_misses: state.eval_misses, eval_entries: state.evals.size
        };
      }
      return result;
    } finally {
      _HC_STATE = prev;
    }
  };
}

function _ctxKey(ctx) {
  var parts = [], i;
  for (i = 0; i < ctx.train.length; i++)
    parts.push(G.gkey(ctx.train[i][0]), G.gkey(ctx.train[i][1]));
  parts.push("|");
  for (i = 0; i < ctx.test_inputs.length; i++) parts.push(G.gkey(ctx.test_inputs[i]));
  return parts.join("~");
}

function hypcacheGenerate(module, ctx) {
  var state = _HC_STATE, name = module.__name__ || "";
  if (state === null || !_HC_CACHEABLE[name]) return module.generate(ctx);
  var priorKey = "", k, keys = [];
  if (ctx.op_prior) {
    for (k in ctx.op_prior) if (Object.prototype.hasOwnProperty.call(ctx.op_prior, k)) keys.push(k);
    keys.sort();
    for (k = 0; k < keys.length; k++) priorKey += keys[k] + "=" + ctx.op_prior[keys[k]] + ";";
  }
  var key = name + "||" + _ctxKey(ctx) + "||" + priorKey;
  var cached = state.items.get(key);
  if (cached !== undefined) { state.hits++; return cached; }
  state.misses++;
  var complete = module.generate(ctx);
  if (!ctx.timed_out() && state.items.size < 96 &&
      state.stored_hyps + complete.length <= 12000) {
    state.items.set(key, complete);
    state.stored_hyps += complete.length;
  }
  return complete;
}


/* Canonical evaluation cache. Repair, population search and representation
   migration keep reaching the same program by different edit paths; the
   canonical structural key (09c-canonical.js) plus the representation and
   the context identity name the computation, so its outputs are computed
   once per solve. Keys are structural, never behavioural: two programs
   share an entry only when they are the same program after sound
   rewriting. Bounded by entries and by stored cells; cleared with the
   solve. Outside a scoped solve (e.g. unit tests, the curriculum) a
   module-level cache of the same shape is used. */
var _HC_LOCAL = { evals: new Map(), eval_hits: 0, eval_misses: 0, eval_cells: 0 };
var HC_EVAL_ENTRIES = 4096, HC_EVAL_CELLS = 4000000;
var _ctxIds = 0;
function hypcacheCtxId(ctx) {
  if (ctx._cid === undefined) ctx._cid = ++_ctxIds;
  return ctx._cid;
}
function hypcacheEval(ctx, key, compute) {
  if (key === null || key === undefined) return compute();
  var st = _HC_STATE || _HC_LOCAL;
  var k = hypcacheCtxId(ctx) + "|" + key, hit = st.evals.get(k);
  if (hit !== undefined) { st.eval_hits++; return hit; }
  st.eval_misses++;
  var out = compute(), cells = 0, i;
  if (out && out.length) for (i = 0; i < out.length; i++) if (out[i]) cells += out[i].length * out[i][0].length;
  if (st.evals.size >= HC_EVAL_ENTRIES || st.eval_cells + cells > HC_EVAL_CELLS) {
    st.evals.clear(); st.eval_cells = 0;
  }
  st.evals.set(k, out);
  st.eval_cells += cells;
  return out;
}
function hypcacheEvalStats() {
  var st = _HC_STATE || _HC_LOCAL;
  return { hits: st.eval_hits, misses: st.eval_misses, entries: st.evals.size };
}
function hypcacheResetLocal() { _HC_LOCAL.evals.clear(); _HC_LOCAL.eval_hits = 0; _HC_LOCAL.eval_misses = 0; _HC_LOCAL.eval_cells = 0; }
