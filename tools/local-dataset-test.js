/* The internal dataset file (c4-dataset.txt) hooked into the whole stack.
 * The shipped file is empty; this test boots the page with its own sample
 * text in the file's place and asks through the full pipeline:
 *   knowledge answers, relations, definitions of words, analogies /
 *   example-pair patterns, attribute questions, and the safety rules
 *   (quarantine, no overwriting of built-in facts).
 */
"use strict";
var RT = require("./lm-runtime.js"), fs = require("fs"), path = require("path");
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("  FAIL " + msg); } }
var SAMPLE = [
  "# a comment",
  "entity: Zorbia | type: country | defn: Zorbia is a small island country. | capital: Zorb City | currency: the zorb | language: Zorbish | continent: Oceania",
  "entity: Quellia | type: country | defn: Quellia is a mountain country. | capital: Quell | currency: the quellar",
  "entity: Zorb City | type: city | defn: Zorb City is the capital city of Zorbia. | country: Zorbia",
  "entity: Glimberry | type: fruit | defn: A glimberry is a small wild berry. | color: teal | aliases: glimberries",
  "entity: France | capital: Lyon | anthem: La Marseillaise",
  "word: glimmerous | pos: adj | gloss: shining faintly and unsteadily | class: QUALITY",
  "entity: <script>x</script> | defn: bad",
  "this line is not a record",
  "entity: Longname | defn: " + new Array(700).join("x"),
  "word: blorp | pos: zz | gloss: nothing"
].join("\n");

(async function () {
  /* the shipped file is empty of records */
  var shipped = fs.readFileSync(path.join(__dirname, "..", "c4-dataset.txt"), "utf8");
  ok(shipped.split(/\n/).every(function (l) { return !l.trim() || /^#/.test(l.trim()); }), "the shipped internal dataset has no records");
  var win0 = RT.boot({});
  await RT.askOnce(win0, "hello", 20000);
  ok(win0.C4LocalDataset.loaded() && win0.C4LocalDataset.report().entities === 0, "an empty file loads cleanly and adds nothing");

  var win = RT.boot({ localDataset: SAMPLE });
  async function ask(q) { return (await RT.askOnce(win, q, 30000)).text; }
  var t = await ask("What is the capital of Zorbia?");
  var rep = win.C4LocalDataset.report();
  ok(/Zorb City/.test(t), "relation answered from the dataset (" + t.slice(0, 60) + ")");
  t = await ask("What is Zorbia?");
  ok(/island country/.test(t), "definition answered from the dataset");
  t = await ask("What currency does Quellia use?");
  ok(/quellar/i.test(t), "another relation");
  t = await ask("France, Japan = Paris, Tokyo. Quellia = ?");
  ok(/Quellia → Quell\b/.test(t), "an example-pair pattern carries over to a dataset entry");
  t = await ask("What color is a glimberry?");
  ok(/teal/.test(t) && /internal dataset/.test(t), "attribute question from the dataset, with provenance");
  t = await ask("Is a glimberry red?");
  ok(/^No/.test(t) && /teal/.test(t), "attribute check from the dataset");
  t = await ask("What does glimmerous mean?");
  ok(/shining faintly/.test(t), "a word sense from the dataset");
  t = await ask("What is the capital of France?");
  ok(/Paris/.test(t) && !/Lyon/.test(t), "a built-in fact is never overwritten");
  ok(rep.conflicts.some(function (c) { return /France/.test(c) && /Lyon/.test(c); }), "the disagreement is reported");
  ok(win.C4LMKB.resolve("France", { strict: true })[0].entity.rel.anthem === "La Marseillaise", "a missing attribute is filled in");
  ok(rep.quarantined.length === 4, "malformed, markup, oversized and bad part-of-speech lines are quarantined (" + rep.quarantined.map(function (q) { return q.why; }).join("; ") + ")");
  ok(rep.entities === 4 && rep.words === 1, "4 new entities and 1 word accepted");

  console.log("local-dataset-test: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e.stack); process.exit(1); });
