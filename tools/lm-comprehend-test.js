/* Tests for the comprehension stage (c4-lm-comprehend.js) and its use by the
 * answer pipeline.
 *
 *   node tools/lm-comprehend-test.js
 *
 * The sentences are not those of the held-out sets; each one exercises a
 * mechanism: every word defined, quantities and rates read, the asked
 * dimension found, a derivation by dimensions, a statement of what is
 * missing, a knowledge quantity used as a declared assumption, and a
 * misreading refused rather than answered.
 */
"use strict";
var path = require("path");
var rt = require(path.join(__dirname, "lm-runtime.js"));

async function main() {
  var fails = 0, n = 0;
  function check(name, ok, detail) {
    n++; if (!ok) fails++;
    console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n       " + String(detail || "").slice(0, 200)));
  }
  var win = rt.boot({}), M = win.C4LMComprehend;
  check("module loads in the page", !!M);

  /* every word and phrase gets a gloss */
  var r = M.read("A delivery van moves at 45 kilometres per hour through the city.");
  var words = "A delivery van moves at 45 kilometres per hour through the city".split(" ");
  var spans = r.glossary.map(function (g) { return g.span.toLowerCase(); }).join(" ");
  check("glossary covers every word", words.every(function (w) { return spans.indexOf(w.toLowerCase()) >= 0; }), spans);
  check("grammar words are defined by role", r.glossary.some(function (g) { return g.span === "through" && /preposition/.test(g.gloss); }));
  check("a rate is one quantity with a compound dimension", r.givens.length === 1 && /speed/.test(M.dimName(r.givens[0].dim)), JSON.stringify(r.givens));

  /* dimensional derivation */
  var q = M.solveQuantity("A delivery van moves at 45 kilometres per hour. How far does it get in 4 hours?");
  check("distance = speed x time", q && q.status === "solved" && /\b180\b/.test(q.text), q && q.text);
  q = M.solveQuantity("A kettle heats 2 litres every 3 minutes. How many litres does it heat in 12 minutes?");
  check("rate with 'every' and a named output unit", q && /\b8\b/.test(q.text), q && q.text);
  q = M.solveQuantity("Paint costs 12 dollars per litre. How much do 7 litres cost?");
  check("price per volume x volume = money", q && /\b84\b/.test(q.text), q && q.text);

  /* what is missing */
  q = M.solveQuantity("A kettle heats 2 litres per minute. How much water does it heat?");
  check("missing time is named, answer given per unit of it", q && q.status === "underdetermined" && /how long/.test(q.text), q && q.text);
  q = M.solveQuantity("A boat sails 60 kilometres. How long does the voyage take?");
  check("missing speed is named by its inverse", q && q.status === "underdetermined" && /speed/.test(q.text), q && q.text);

  /* a knowledge quantity is an assumption, and says so */
  q = M.solveQuantity("A car drives for 3 hours at 50 miles per hour. How much fuel does it burn?");
  check("fuel from speed, time and the knowledge base's fuel economy", q && /\b5\b/.test(q.text) && /knowledge base/.test(q.text), q && q.text);

  /* misreadings are refused */
  q = M.solveQuantity("How much sugar does a Zentari 4 take per hour?");
  check("a verb is not a counted thing; no nonsense answer", !q || !/quantity measured in/.test(q.text || ""), q && q.text);

  /* through the pipeline */
  var a = await rt.askOnce(rt.boot({}), "A delivery van moves at 45 kilometres per hour. How far does it get in 4 hours?", 20000);
  check("pipeline answers the quantity question", /\b180\b/.test(a.text), a.text);
  check("pipeline exposes the reading", !!(a.raw && a.raw.lm && a.raw.lm.comprehension && a.raw.lm.comprehension.glossary.length), JSON.stringify(a.raw && a.raw.lm && a.raw.lm.comprehension || {}).slice(0, 120));
  console.log((n - fails) + "/" + n + " comprehension checks passed");
  if (fails) process.exit(1);
}
main();
