/* Regression tests for the phrasing layer of the language stack:
 * compositional prose arithmetic, figurative word senses, the deliberation
 * pass, the off-topic guard, fragment completion and the parser fixes.
 *
 *   node tools/lm-phrasing-test.js
 *
 * The sentences here are NOT the held-out ones (tools/lm-heldout*.js): each
 * exercises a mechanism with different words, so passing them says nothing
 * about the held-out sets and the held-out sets stay unseen by the tests.
 */
"use strict";
var path = require("path");
var rt = require(path.join(__dirname, "lm-runtime.js"));

var CHECKS = [
  /* compositional English arithmetic */
  ["prose: prefix product, passive result", "When 3 is added to four times a number, the result is 31. What is the number?", /\b7\b/, "first"],
  ["prose: purpose infinitive states the result", "I halve a number and add 4 to get 10. What was the number?", /\b12\b/, "first"],
  ["prose: two-unknown system from sum/difference", "The sum of two numbers is 40 and their difference is 10. What are the numbers?", /25[\s\S]*15|15[\s\S]*25/, "first"],
  ["prose: word numbers and fractions", "What is two fifths of 150?", /\b60\b/, "first"],
  ["dice: one die, a named face", "What is the probability of rolling a 3 with one die?", /1\/6/, "first"],
  ["percent typography: attached sign is a percentage", "12% 50", /\b6\b/, "first"],
  ["percent typography: spaced sign is modulo", "What is 17 % 4?", /\b1\b/, "first"],
  /* fragments: the missing connective is searched for */
  ["fragment: operator word stands for the connective", "3 power 4", /\b81\b/, "first"],
  ["fragment: conversion without 'to'", "Convert 5 miles kilometers", /8\.04/, "first"],
  /* figurative senses through dictionary glosses */
  ["sense: 'tongue' read as language", "What's the tongue of Germany?", /German/],
  ["sense: 'pen' read as writer", "Who is the pen behind Macbeth?", /Shakespeare/],
  ["paraphrase: 'keep its government' is the capital", "Where does Italy keep its government?", /Rome/],
  ["facts: gloss paraphrase selects the entity's fact", "At what temperature does water turn into ice?", /\b0\b|\b32\b/],
  /* parser fixes */
  ["contraction is not a name", "What's the story with Albert Einstein?", /physicist|relativity/i],
  ["polite wrappers strip to a fixpoint", "hey, could you tell me Is the Sun a planet?", /\bno\b|\bstar\b/i],
  /* honesty */
  ["off-topic guard: unknown subject is not replaced by a known one", "melting point of blorvium", /don't have|not sure|couldn't/i],
  ["request about an unknown named thing is not small talk", "Walk me through the Qarvell-Oduya lemma", /don't have|not sure|couldn't/i],
  ["memory does not take a word problem as a personal fact", "I triple a number and subtract 5 to get 16. What is the number?", /\b7\b/, "first"],
  /* dictated form is left alone */
  ["dictated form: list stays a list", "List three primary colors.", /red/i],
  ["dictated form: one word stays one word", "Answer with a single word: what is the capital of Spain?", /^\s*Madrid\.?\s*$/]
];

function firstSentence(t) { return (String(t).split(/(?<=[.!?])\s+(?=[A-Z(])/)[0] || ""); }

async function main() {
  var fails = 0;
  for (var i = 0; i < CHECKS.length; i++) {
    var c = CHECKS[i], win = rt.boot({}), a = await rt.askOnce(win, c[1], 20000);
    var text = a.text || "", hay = c[3] === "first" ? firstSentence(text) : text;
    var ok = c[2].test(hay);
    if (!ok) fails++;
    console.log((ok ? "PASS " : "FAIL ") + c[0] + (ok ? "" : "\n       " + c[1] + " => " + text.slice(0, 160)));
  }
  console.log((CHECKS.length - fails) + "/" + CHECKS.length + " phrasing checks passed");
  if (fails) process.exit(1);
}
main();
