/* Everyday-conversation evaluation for the language stack.
 *
 *   node tools/lm-chat-eval.js [--set tools/lm-chat-heldout.json] [--out FILE] [--show]
 *
 * Asks every question in ONE session, in order, the way a person chats
 * (so a wrong carry-over from the previous turn shows up), and scores each
 * answer:
 *   good    matches every "good" pattern and no "bad" pattern
 *   honest  a plain "I don't know / couldn't find" decline
 *   wrong   anything else (an answer about the wrong thing, a fallback
 *           that pretends, a definition of an incidental word ...)
 * The held-out file is frozen before the fixes it measures.
 */
"use strict";
var fs = require("fs"), path = require("path");
var RT = require("./lm-runtime.js");
var args = process.argv.slice(2);
function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
var set = JSON.parse(fs.readFileSync(path.resolve(arg("set", path.join(__dirname, "lm-chat-heldout.json"))), "utf8"));
var out = arg("out", ""), show = args.indexOf("--show") >= 0;
/* an honest decline says it does not know or could not find/confirm */
var HONEST = /\b(?:i don't have|i do not have|i couldn't|i could not|couldn't find|could not find|not sure|don't know|do not know|don't know enough|no reliable|can't answer|cannot answer|can't confirm|cannot confirm|can't say reliably|rather not (?:guess|pretend|make))\b/i;

var win = RT.boot({});
(async function () {
  var res = { n: 0, good: 0, honest: 0, wrong: 0, items: [], words: 0 };
  for (var i = 0; i < set.items.length; i++) {
    var it = set.items[i], r = await RT.askOnce(win, it.q, 20000), t = String(r.text || "");
    var good = (it.good || []).every(function (p) { return new RegExp(p, "i").test(t); }) &&
               !(it.bad || []).some(function (p) { return new RegExp(p, "i").test(t); });
    var verdict = good ? "good" : HONEST.test(t) ? "honest" : "wrong";
    res.n++; res[verdict]++; res.words += t.split(/\s+/).filter(Boolean).length;
    res.items.push({ q: it.q, verdict: verdict, route: r.route, answer: t.slice(0, 300) });
    if (show) console.log("[" + verdict + "] " + it.q + "\n    " + t.replace(/\n/g, " / ").slice(0, 260));
  }
  res.good_rate = Math.round(res.good / res.n * 1000) / 1000;
  res.wrong_rate = Math.round(res.wrong / res.n * 1000) / 1000;
  res.mean_words = Math.round(res.words / res.n * 10) / 10;
  console.log("lm-chat-eval: good " + res.good + "/" + res.n + ", honest " + res.honest + ", wrong " + res.wrong +
              " (mean " + res.mean_words + " words per answer)");
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 2));
  process.exit(0);
})();
