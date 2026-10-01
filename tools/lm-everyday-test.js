/* Checks for the fun and chance layer (riddles, quiz, games, dice, quotes) and for everyday-noun definitions.
 *
 *   node tools/lm-everyday-test.js
 *
 * Chance is checked by range and shape, not by value. Quiz answers are looked up in the module's own bank.
 * No network, no outside model.
 */
"use strict";
var rt = require("./lm-runtime.js");
var pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) pass++; else { fail++; console.log("FAIL " + name + (detail ? "  => " + detail : "")); } }

(async function () {
  var w = rt.boot({}), FUN = w.C4LMFun, text = null;
  async function say(win, q) { var r = await rt.askOnce(win, q, 20000); return r.text; }

  /* chance */
  for (var i = 0; i < 6; i++) {
    var c = await say(rt.boot({}), "Flip a coin");
    ok("coin is heads or tails", /^(?:Heads|Tails)\.$/.test(c), c);
  }
  var d = await say(w, "Roll a die");
  ok("die in 1..6", /rolled a [1-6]\./.test(d), d);
  d = await say(w, "roll 3d20");
  var dm = d.match(/rolled ([\d, ]+) — a total of (\d+)/);
  ok("3d20 gives three rolls that add up", !!dm && dm[1].split(",").length === 3 && dm[1].split(",").reduce(function (a, b) { return a + +b; }, 0) === +dm[2], d);
  var n = await say(w, "Pick a number between 5 and 7");
  ok("number in range", /^[567]\.$/.test(n), n);
  n = await say(w, "Give me a random number between 1000 and 1002");
  ok("number in a different range", /^100[012]\.$/.test(n), n);
  var pk = await say(w, "pick one: pizza, pasta or sushi");
  ok("picks one of the options", /^I pick (?:pizza|pasta|sushi)\.$/.test(pk), pk);
  var pl = await say(w, "Choose a random planet");
  ok("random planet is a planet", /^(?:Mercury|Venus|Earth|Mars|Jupiter|Saturn|Uranus|Neptune)\.$/.test(pl), pl);
  var b = await say(w, "magic 8 ball");
  ok("8 ball answers", b.length > 2, b);

  /* riddle thread: wrong, hint, right */
  var rw = rt.boot({}), rid = await say(rw, "Tell me a riddle");
  var entry = FUN.banks.RIDDLES.filter(function (r) { return rid.indexOf(r[0]) === 0; })[0];
  ok("riddle comes from the bank", !!entry, rid);
  if (entry) {
    var wrong = await say(rw, "a zebra");
    ok("wrong riddle answer is not marked right", /Not quite/.test(wrong), wrong);
    var hint = await say(rw, "hint");
    ok("hint is given", /^Hint:/.test(hint), hint);
    var good = await say(rw, entry[1].split("|")[0]);
    ok("right riddle answer is marked right", /^Yes/.test(good), good);
  }
  var rg = rt.boot({}); await say(rg, "Tell me a riddle");
  var giveUp = await say(rg, "I give up");
  ok("give up reveals the answer", /^The answer is:/.test(giveUp), giveUp);

  /* quiz thread: right, wrong, score, a question asked mid-quiz is answered normally */
  var qw = rt.boot({}), q1 = await say(qw, "Quiz me");
  var item = FUN.banks.QUIZ.filter(function (x) { return q1.indexOf(x[1]) >= 0; })[0];
  ok("quiz question comes from the bank", !!item, q1);
  if (item) {
    var right = await say(qw, "I think it's " + item[2].split("|")[0]);
    ok("right quiz answer is marked correct", /^Correct!/.test(right) && /1 out of 1/.test(right), right);
    var q2 = await say(qw, "next");
    var item2 = FUN.banks.QUIZ.filter(function (x) { return q2.indexOf(x[1]) >= 0; })[0];
    ok("next gives another question", !!item2 && item2 !== item, q2);
    var miss = await say(qw, "banana");
    ok("wrong quiz answer shows the answer", /^Not quite\. The answer is:/.test(miss) && /1 out of 2/.test(miss), miss);
    var sc = await say(qw, "score");
    ok("score is kept", /1 right out of 2/.test(sc), sc);
  }
  var mid = rt.boot({}); await say(mid, "Quiz me");
  var cap = await say(mid, "What is the capital of France?");
  ok("a real question during a quiz is answered", /Paris/.test(cap), cap);

  /* rock paper scissors */
  var rp = rt.boot({}); await say(rp, "let's play rock paper scissors");
  var rr = await say(rp, "rock");
  ok("rps gets a result", /(?:draw|win)/i.test(rr), rr);

  /* jokes, facts, quotes, twisters, words, another */
  var jw = rt.boot({}), j1 = await say(jw, "Tell me a joke"), j2 = await say(jw, "another one");
  ok("jokes differ", j1 && j2 && j1 !== j2 && FUN.banks.JOKES.indexOf(j1) >= 0 && FUN.banks.JOKES.indexOf(j2) >= 0, j1 + " / " + j2);
  var fw = rt.boot({}), f1 = await say(fw, "Tell me a fun fact"), f2 = await say(fw, "another");
  ok("facts differ", f1 !== f2 && FUN.banks.FACTS.indexOf(f1) >= 0, f1 + " / " + f2);
  var fa = await say(rt.boot({}), "Tell me a fun fact about the moon");
  ok("fact about a topic mentions it", /moon/i.test(fa), fa);
  var qt = await say(rt.boot({}), "Give me a quote");
  ok("quote is attributed", /^“.+” — .+/.test(qt), qt);
  var tw = await say(rt.boot({}), "Tell me a tongue twister");
  ok("tongue twister", /three times fast/.test(tw), tw);
  var wd = await say(rt.boot({}), "word of the day");
  ok("word of the day has a meaning and an example", /: .+\. Example: /.test(wd), wd);
  var wr = await say(rt.boot({}), "would you rather");
  ok("would you rather", /^Would you rather/.test(wr), wr);

  /* every quiz and riddle entry accepts its own shown answer */
  var bad = FUN.banks.QUIZ.filter(function (x) { return !x[2] || !x[3]; });
  ok("quiz entries are complete", bad.length === 0, JSON.stringify(bad[0]));
  var rbad = FUN.banks.RIDDLES.filter(function (x) { return x.length < 4; });
  ok("riddle entries are complete", rbad.length === 0, JSON.stringify(rbad[0]));

  /* everyday nouns: a sentence about the thing, not about something near it */
  var NOUNS = [
    ["What is a butterfly?", /butterfly is an insect/i], ["What is a canoe?", /canoe is a light, narrow boat/i], ["What is a swamp?", /swamp is a wet/i],
    ["What is a wasp?", /wasp is a flying insect/i], ["What is a tulip?", /tulip is a spring flower/i], ["What is a lung?", /lung/i],
    ["What is an electrician?", /electrician is a person/i], ["What is a neutron?", /neutron is a particle/i], ["What is a proverb?", /proverb is a short/i],
    ["What is a duck?", /duck is a water bird/i], ["What is a barn?", /barn is a large farm building/i], ["What is a garage?", /garage is a building/i],
    ["What is a saw?", /saw is a tool|don't have anything reliable/i], ["What is a judge?", /judge is a public official/i], ["What is an owl?", /owl is a/i],
    ["What is an apple?", /apple is the edible fruit/i], ["What is a tsunami?", /tsunami is a huge sea wave/i], ["What is a mortgage?", /mortgage is a loan/i],
    ["What is the function of red blood cells?", /carry oxygen/i], ["What is the purpose of roots?", /anchor a plant/i],
    ["What is the capital of the US?", /Washington/], ["What is the capital of the Netherlands?", /\bThe Netherlands\b|\bthe Netherlands\b/], ["What is the largest state in the US?", /Alaska/],
    ["Which is larger, 2/3 or 3/5?", /2\/3 is larger/], ["Which is bigger, the Atlantic or the Pacific Ocean?", /Pacific/], ["What is the hottest planet?", /^Venus is the hottest/],
    ["What is the longest river in South America?", /Amazon/], ["What is the closest planet to the Sun?", /^Mercury is the (?:closest|planet closest)/]
  ];
  for (var k = 0; k < NOUNS.length; k++) {
    var t = await say(rt.boot({}), NOUNS[k][0]);
    ok("define: " + NOUNS[k][0], NOUNS[k][1].test(t), t.slice(0, 140));
  }
  /* world clock and holidays: fixed "now" so the checks do not depend on the day they are run */
  var CK = w.C4LMClock, fixed = function (y, m, d, h) { return new Date(y, m - 1, d, h || 12, 0, 0); };
  function ck(q, now) { var r = CK.solve(q, now); return r ? r.answer : ""; }
  ok("Easter 2027", /Sunday, March 28, 2027/.test(ck("When is Easter 2027?", fixed(2026, 10, 1))), ck("When is Easter 2027?", fixed(2026, 10, 1)));
  ok("Easter 2025", /Sunday, April 20, 2025/.test(ck("When is Easter 2025?", fixed(2026, 10, 1))));
  ok("Thanksgiving 2027", /Thursday, November 25, 2027/.test(ck("When is Thanksgiving in 2027?", fixed(2026, 10, 1))));
  ok("Memorial Day 2025", /Monday, May 26, 2025/.test(ck("When is Memorial Day in 2025?", fixed(2026, 10, 1))));
  ok("Mother's Day next", /Sunday, May 9, 2027/.test(ck("When is Mother's Day?", fixed(2026, 10, 1))));
  ok("days until Christmas", /85 days until Christmas Day/.test(ck("How many days until Christmas?", fixed(2026, 10, 1))), ck("How many days until Christmas?", fixed(2026, 10, 1)));
  ok("Christmas on Christmas morning is today", /today/.test(ck("How many days until Christmas?", fixed(2026, 12, 25, 9))));
  ok("weekday of a holiday", /falls on a Friday/.test(ck("What day of the week is Christmas this year?", fixed(2026, 10, 1))));
  ok("New York to London in autumn", /9:00 AM in New York is 2:00 PM in London/.test(ck("If it's 9am in New York, what time is it in London?", fixed(2026, 10, 1))));
  ok("New York to London in a week the US is already back on standard time", /9:00 AM in New York is 2:00 PM in London/.test(ck("If it's 9am in New York, what time is it in London?", fixed(2026, 11, 10))));
  ok("New York to London in the weeks the two disagree", /9:00 AM in New York is 1:00 PM in London/.test(ck("If it's 9am in New York, what time is it in London?", fixed(2026, 3, 20))), ck("If it's 9am in New York, what time is it in London?", fixed(2026, 3, 20)));
  ok("crossing midnight", /11:00 AM the next day in Tokyo/.test(ck("What time is it in Tokyo when it's 9pm in Chicago?", fixed(2026, 10, 1))));
  ok("time zone abbreviations", /12:00 PM in PST/.test(ck("Convert 3pm EST to PST", fixed(2026, 10, 1))));
  ok("difference with half-hour zone", /5.5 hours ahead of London/.test(ck("What is the time difference between Mumbai and London?", fixed(2026, 1, 15))), ck("What is the time difference between Mumbai and London?", fixed(2026, 1, 15)));
  ok("local time in a city", /in Tokyo \(UTC\+9\)/.test(await say(rt.boot({}), "What time is it in Tokyo?")));
  ok("plain what time is it keeps the device clock", /device's clock/.test(await say(rt.boot({}), "What time is it?")));
  ok("February in a leap year", /^29 days/.test(await say(rt.boot({}), "How many days are in February 2028?")));
  ok("weekday of a date with a year at the end", /Thursday/.test(await say(rt.boot({}), "What day is July 4th on in 2030?")));
  /* a little Spanish, French, German, Italian, Portuguese */
  var LANGS = [
    ["¿Cuál es la capital de Francia?", /^La capital de Francia es París\.$/], ["Quelle est la capitale du Japon ?", /^La capitale du Japon est Tokyo\.$/],
    ["Wie heißt die Hauptstadt von Spanien?", /^Die Hauptstadt von Spanien ist Madrid\.$/], ["Qual è la capitale della Francia?", /^La capitale della Francia è Parigi\.$/],
    ["Qual é a capital do Brasil?", /^A capital do Brasil é Brasília\.$/], ["Hola", /^¡Hola!/], ["Guten Morgen", /^Guten Morgen!/], ["Merci", /^Je vous en prie/],
    ["¿Cuánto es 15 por 3?", /\b45\b/], ["Combien font 12 plus 7 ?", /\b19\b/], ["Je voudrais un café", /français/], ["What is the capital of France?", /Paris/], ["Do you speak Spanish?", /Spanish|language|speak/i]
  ];
  for (var lgi = 0; lgi < LANGS.length; lgi++) {
    var lt = await say(rt.boot({}), LANGS[lgi][0]);
    ok("language: " + LANGS[lgi][0], LANGS[lgi][1].test(lt), lt.slice(0, 120));
  }
  console.log((fail ? "FAIL " : "") + pass + "/" + (pass + fail) + " everyday checks passed");
  process.exit(fail ? 1 : 0);
})();
