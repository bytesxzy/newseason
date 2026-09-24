/* Long conversations: follow-ups read against what was already said
 * (c4-lm-dialogue.js and the turn log in c4-lm.js). Each conversation is one
 * session, asked in order through the full page; every check is on a turn
 * that only makes sense given the earlier ones. Dev material only -- the
 * frozen held-out conversation (tools/longconv-heldout.json) is not used here.
 */
"use strict";
var RT = require("./lm-runtime.js");
var pass = 0, fail = 0;
function ok(c, msg, t) { if (c) pass++; else { fail++; console.log("  FAIL " + msg + (t ? "  <- " + String(t).slice(0, 200) : "")); } }

var CONVERSATIONS = [
  { name: "meanings, running math, places, works, problems, recall", turns: [
    ["What is a mouse?", /several meanings|more than one sense/i, "a word with several meanings lists them"],
    ["the second one", /rodent/i, "\"the second one\" picks the listed meaning"],
    ["What is 15% of 80?", /\b12\b/, "a percentage"],
    ["Add 7 to that", /\b19\b/, "the previous result is the operand"],
    ["Now double it", /\b38\b/, "a chain of results"],
    ["Is that an even number?", /^Yes/, "a test on the previous result"],
    ["What is the capital of France?", /Paris/, "a fact"],
    ["How many people live there?", /68 million/, "\"there\" is the place just discussed"],
    ["What about Germany?", /Germany/, "parallel question"],
    ["Which of the two has more people?", /^Germany/, "\"the two\" are the places just discussed"],
    ["By how much?", /16 million/, "the difference behind the last comparison"],
    ["Who wrote Hamlet?", /Shakespeare/, "an author"],
    ["When was he born?", /1564/, "\"he\" after a work is its author"],
    ["What else did he write?", /Romeo and Juliet|Macbeth/, "other works by the same person"],
    ["Tom had 30 marbles.", /Got it/i, "a word problem told over turns: the start"],
    ["He lost 12.", /\b18\b/, "the running count"],
    ["Then he found 4 more.", /\b22\b/, "the running count again"],
    ["How many marbles does Tom have now?", /\b22\b/, "the question at the end"],
    ["What did we talk about first?", /mouse/i, "the first topic"],
    ["What was the last number you gave me?", /\b22\b/, "the last number"],
    ["Summarize our conversation", /mouse[\s\S]*France[\s\S]*Tom's marbles/i, "a summary in order"]
  ] },
  { name: "senses by taxonomy, groups, honest limits", turns: [
    ["What is a seal?", /several meanings|more than one sense/i, "a word's meanings"],
    ["no, I meant the animal", /mammal/i, "a meaning chosen by what it is, even one not listed"],
    ["What's 9 squared?", /\b81\b/, "a power"],
    ["Plus 19", /\b100\b/, "a bare operation continues the result"],
    ["What's 10 percent of that?", /\b10\b/, "percent of the previous result"],
    ["Where was he born?", /who do you mean/i, "\"he\" with no person in view is asked about, not guessed"],
    ["Lena bought 3 boxes of pencils.", /3 boxes of pencils/, "the start of a problem"],
    ["Each box has 12 pencils.", /\b36\b/, "equal groups"],
    ["She gave 10 pencils to her brother.", /\b26\b/, "a change after equal groups"],
    ["How many pencils does she have left?", /\b26\b/, "the question"],
    ["Which is bigger, Jupiter or Mars?", /can't compare/i, "a comparison the knowledge can't settle"],
    ["By how much?", /can't say by how much/i, "no difference is invented"],
    ["Recap please", /seal[\s\S]*pencils/i, "a recap"]
  ] }
];

(async function () {
  for (var c = 0; c < CONVERSATIONS.length; c++) {
    var conv = CONVERSATIONS[c], win = RT.boot({});
    console.log(conv.name);
    for (var i = 0; i < conv.turns.length; i++) {
      var tr = conv.turns[i], t = (await RT.askOnce(win, tr[0], 30000)).text;
      ok(tr[1].test(t), tr[2] + " (" + tr[0] + ")", t);
    }
  }
  /* the math follow-ups are exact, and refuse what they cannot do */
  var DL = require("../c4-lm-dialogue.js");
  var log = [{ user: "x", value: 12, route: "compute" }];
  ok(DL.answer("divide it by 0", { log: log }) === null, "division by zero is not answered");
  ok(DL.answer("square root of that", { log: [{ user: "x", value: -4, route: "compute" }] }) === null, "no square root of a negative");
  ok(/\b144\b/.test(DL.answer("what's the square of that?", { log: log }).text), "square");
  ok(DL.answer("add 5 to that", { log: [] }) === null, "no previous result, no follow-up");
  ok(DL.answer("add 5 to that", { log: [{ user: "a", value: 3 }, { user: "b" }, { user: "c" }, { user: "d" }, { user: "e" }] }) === null, "a result too far back is not reused");
  /* the word-problem reader behind the running counts */
  var E = RT.boot({}).C4LMEveryday;
  [["Omar had 45 cards. He traded away 9 of them. Then his sister gave him 14. How many cards does Omar have now?", 50, "a verb with \"away\" loses; \"gave him\" gains"],
   ["Mia had 50 dollars. She spent 12 dollars on a book and 8 dollars on lunch. How much money does she have left?", 30, "\"and 8\" shares the verb"],
   ["Sam has 4 bags with 6 apples in each bag. He eats 5 apples. How many apples are left?", 19, "equal groups, then a change"],
   ["Emma had 8 balloons and 3 kites. She gave away 2 balloons. How many balloons does she have?", 6, "\"and 3 kites\" before any change is not a change"]
  ].forEach(function (c) { var r = E.solve(c[0]); ok(r && r.value === c[1], c[2], r && r.text); });
  console.log("lm-dialogue-test: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e.stack); process.exit(1); });
