/* Cross-referencing and contextual memory through the shipping page stack
 * (c4-lm-crossref.js over the validated WordNet dataset). Development
 * cases only -- the frozen set is tools/crossref-heldout.json.
 * One session, in order: later turns depend on earlier ones.
 */
"use strict";
var fs = require("fs"), path = require("path");
if (!fs.existsSync(path.join(__dirname, "..", "data", "wordnet", "manifest.json"))) { console.log("lm-crossref-test: SKIPPED -- run `node tools/dataset-fetch.js` first"); process.exit(0); }
var RT = require("./lm-runtime.js"), win = RT.boot({});
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("  FAIL " + msg); } }
(async function () {
  async function ask(q) { return (await RT.askOnce(win, q, 30000)).text; }
  var t;
  t = await ask("Purple, Orange = Grape, Carrot");
  ok(/Purple → Grape/.test(t) && /Checked Purple → Grape/.test(t) && /Checked Orange → Carrot/.test(t), "pairs stored and both confirmed from definitions");
  t = await ask("Pink = ?");
  ok(/^Pink → \w+/.test(t) && /pink/i.test(t.split("Reasoning")[1] || ""), "the color pattern applied, with the definition that carries it");
  t = await ask("Which fruit went with Purple?");
  ok(/Grape/.test(t), "recall by the other side, with a type word");
  t = await ask("Why is Orange Carrot?");
  ok(/orange/.test(t) && /carrot is/.test(t), "why: the definition that links them");
  t = await ask("What about blue?");
  ok(/^Blue → Blueberry/.test(t), "a follow-up joins the pattern of its own kind; a shade the dataset writes counts");
  t = await ask("Germany, Egypt = Berlin, Cairo. Peru = ?");
  ok(/Peru → Lima/.test(t) && /capital/.test(t), "a knowledge-base relation induced from two pairs");
  t = await ask("Japan, Mexico = yen, peso. Brazil = ?");
  ok(/Brazil → Real/.test(t), "currency");
  t = await ask("Paris, Lima = France, Peru. Tokyo = ?");
  ok(/Tokyo → Japan/.test(t), "the inverse direction");
  t = await ask("good is to bad as light is to ?");
  ok(/Light → Heavy/.test(t), "opposites through the adjective's own senses");
  t = await ask("happy : sad :: up : ?");
  ok(/Up → Down/.test(t), "opposite through an also-see step");
  t = await ask("dog is to puppy as sheep is to ?");
  ok(/Sheep → Lamb/.test(t) && /young/.test(t), "a definition template (a young X)");
  t = await ask("cow : calf :: horse : ?");
  ok(/couldn't find what links/.test(t), "no link found is said plainly");
  t = await ask("finger : hand :: leaf : ?");
  ok(!/Written communication/i.test(t), "a rare sense does not carry an analogy across kinds");
  t = await ask("What color is a banana?");
  ok(/yellow/.test(t), "attribute question");
  t = await ask("What color is coal?");
  ok(/doesn't state/.test(t), "an attribute the dataset does not give is not guessed");
  t = await ask("Is grass blue?");
  ok(/^No — grass is described as green/.test(t), "a competing value answers no");
  t = await ask("Name something that is green.");
  ok(/^Grass/.test(t), "the thing whose definition leads with the value");
  t = await ask("What do ketchup and mustard have in common?");
  ok(/condiment/.test(t), "shared kind");
  t = await ask("What do a dog and a cat have in common?");
  ok(/carnivore/.test(t), "shared kind with articles");
  t = await ask("what pairs have I given you?");
  ok(/Purple → Grape/.test(t) && /\(inferred\)/.test(t), "the session's pairs, stated vs inferred");
  console.log("lm-crossref-test: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
