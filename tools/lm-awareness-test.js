/* Conversation-awareness tests: repeated questions, reactions, and the
 * system's own repetition.
 *
 *   node tools/lm-awareness-test.js
 *
 * Replays multi-turn conversations in one session. The checks are about
 * behaviour (is a repeat noticed, is a reaction read as a reaction, does the
 * system avoid saying the same sentence twice), not about exact wording.
 */
"use strict";
var path = require("path");
var rt = require(path.join(__dirname, "lm-runtime.js"));

async function convo(turns) {
  var w = rt.boot({}), out = [];
  for (var i = 0; i < turns.length; i++) out.push((await rt.askOnce(w, turns[i], 20000)).text || "");
  return out;
}

async function main() {
  var fails = 0, n = 0;
  function check(name, ok, detail) {
    n++; if (!ok) fails++;
    console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "\n       " + String(detail || "").slice(0, 220)));
  }
  /* the user's own transcript: an unanswerable question, asked four times,
     with a reaction after each answer */
  var q = "how do markov chains work?";
  var t = await convo([q, "oh", q, "oh", q, "oh", q, "oh"]);
  check("an unknown topic gets an honest answer, not a word-by-word guess", /don't have|not sure|couldn't/i.test(t[0]) && !/would be/.test(t[0]), t[0]);
  check("a reaction is not answered as a question about the last topic's words", !/more than one sense|means /i.test(t[1]), t[1]);
  check("a reaction after a non-answer is read as noticing it", /wasn't a real answer|circles|what you need|don't have/i.test(t[1]), t[1]);
  check("a repeated question is noticed as a repeat", /second time|again/i.test(t[2]), t[2]);
  check("the count of repeats is tracked", /third time/i.test(t[4]) && /fourth time/i.test(t[6]), t[4] + " || " + t[6]);
  var dup = t.filter(function (x, i) { return t.indexOf(x) !== i; });
  check("the system never says the same thing twice", dup.length === 0, dup[0]);

  /* a run of reactions */
  var r = await convo(["what is a zorbleflux?", "oh", "oh", "oh", "oh"]);
  var rdup = r.filter(function (x, i) { return r.indexOf(x) !== i; });
  check("consecutive reactions are counted, not answered identically", rdup.length === 0 && /in a row|few times/i.test(r[3] + r[4]), r.slice(1).join(" || "));

  /* a real answer asked again */
  var p = await convo(["What is the capital of Italy?", "What is the capital of Italy?"]);
  check("a real answer asked again is given again, and the repeat is acknowledged", /Rome/.test(p[1]) && /asked this/i.test(p[1]), p[1]);
  var s = await convo(["What is the capital of Italy?", "what's the capital of italy"]);
  check("a repeat in different words is still a repeat", /asked this/i.test(s[1]), s[1]);

  /* not repeats */
  var f = await convo(["What is gravity?", "Explain gravity in one sentence"]);
  check("the same topic in a different form is a new request", !/asked this/i.test(f[1]), f[1]);
  var g = await convo(["What is the capital of Italy?", "What is the capital of Spain?"]);
  check("a different question is not a repeat", !/asked this/i.test(g[1]) && /Madrid/.test(g[1]), g[1]);

  console.log((n - fails) + "/" + n + " awareness checks passed");
  if (fails) process.exit(1);
}
main();
