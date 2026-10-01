/* Checks for the everyday-skills layer and the fixes found by probing the language stack.
 *
 *   node tools/lm-skills-test.js
 *
 * Module checks call the solvers directly (fast); session checks boot the page once per
 * conversation and ask in order, because several bugs only showed up in sequences
 * (a pronoun or a one-word follow-up dragging the previous topic into a new question).
 * No network, no outside model.
 */
"use strict";
var rt = require("./lm-runtime.js");
var win0 = rt.boot({});
var SK = win0.C4LMSkills, WR = win0.C4LMWrite, TL = win0.C4LMTools, STY = win0.C4LMStory, LG = win0.C4LMLogic, HW = win0.C4LMHowTo, TH = win0.C4LMThesaurus;

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) pass++; else { fail++; console.log("FAIL " + name + (detail ? "  => " + detail : "")); }
}
function mod(m, label, rows) {
  rows.forEach(function (r) {
    var out = null;
    try { var x = m.solve(r[0]); out = x && x.answer; } catch (e) { out = "ERR " + e.message; }
    ok(label + ": " + r[0], out !== null && out !== undefined && r[1].test(String(out)), String(out).slice(0, 120));
  });
}

mod(SK, "skills", [
  ["What day of the week was July 4, 1776?", /Thursday/],
  ["How many days are between March 3 and April 10?", /\b38\b/],
  ["Write 1234 in words.", /one thousand two hundred (?:and )?thirty-four/],
  ["What is the number forty-two in digits?", /\b42\b/],
  ["Translate hello to Spanish.", /hola/],
  ["What is the French word for cat?", /chat/],
  ["What is the Spanish word for elephant?", /phrasebook/],
  ["What is the percent increase from 50 to 75?", /50%/],
  ["What is 20 percent of 150?", /\b30\b/],
  ["What is the simple interest on 1000 dollars at 5% for 3 years?", /150/],
  ["If I invest $1000 at 5% annual interest, how much will I have after 3 years?", /1,157\.63/],
  ["What is the standard deviation of 2, 4, 4, 4, 5, 5, 7, 9?", /\b2\b/],
  ["How many ways can the letters of CAT be arranged?", /\b6\b/],
  ["What is the molar mass of H2O?", /18\.0/],
  ["What force is needed to accelerate a 10 kg mass at 2 m/s^2?", /\b20 N/],
  ["What is the density of an object with mass 20 g and volume 5 cm^3?", /4 g\/cm/],
  ["What is the opposite of hot?", /cold/],
  ["Give me a synonym for happy.", /joyful|cheerful|glad/],
  ["How old is someone born in 1990 in 2020?", /\b30\b/]
]);
mod(WR, "write", [
  ["Write a haiku about autumn.", /\n.*\n/],
  ["Write a limerick about a cat.", /Maine/],
  ["Write an acrostic for HOPE", /^H/],
  ["Spell the word necessary.", /N-E-C-E-S-S-A-R-Y/],
  ["Count to five.", /1, 2, 3, 4, 5/],
  ["Count by 2s to 20", /^2, 4, 6/],
  ["What rhymes with cat?", /bat/],
  ["Give me a word that starts with Q.", /quail|quarter|queen|quick|query/],
  ["Convert \"hello world\" to uppercase", /HELLO WORLD/],
  ["Make \"HELLO\" lowercase", /^hello$/],
  ["How many words are in \"the quick brown fox jumps\"?", /^5$/]
]);
mod(TL, "tools", [
  ["Solve |x - 3| = 5.", /8.*-2|-2.*8/],
  ["Which is larger, 2/3 or 3/5?", /2\/3 is larger/],
  ["What is the square root of 2 to three decimal places?", /1\.414/],
  ["Add 15 and 27", /^42$/],
  ["What is the difference between 100 and 37?", /^63$/],
  ["Sort these numbers: 5, 2, 9, 1", /^1, 2, 5, 9$/],
  ["What are the factors of 24?", /1, 2, 3, 4, 6, 8, 12, 24/],
  ["Is 2024 divisible by 4?", /^Yes/],
  ["What is the sum of 1/2 and 1/3?", /5\/6/],
  ["What is the limit of 1/x as x goes to infinity?", /^0$/],
  ["Find the limit of sin(x)/x as x approaches 0", /^1$/],
  ["How many ounces are in a cup?", /8 fluid/],
  ["Who invented the smartphone in 1850?", /not invented until/],
  ["When did Napoleon land on the Moon?", /long before/],
  ["Is Australia a continent?", /both a country/],
  ["Is 1 a prime number?", /not prime/]
]);
mod(STY, "story", [
  ["Priya had 45 stickers and gave away 18. How many stickers remain?", /27/],
  ["John has 5 apples and eats 2. How many are left?", /3 apples/],
  ["There are 24 students and 6 are absent. How many are present?", /18/],
  ["In a class of 30 students, 40% are boys. How many are girls?", /18/],
  ["Kai earns $12 per hour and works 35 hours. What is the weekly pay?", /420/],
  ["A sandwich costs $4.50 and a drink costs $1.75. What is the total for 3 sandwiches and 2 drinks?", /17/],
  ["Oscar is saving for a $240 bike. He has $90 and saves $15 a week. How many weeks until he can buy it?", /10/],
  ["Two trains 300 km apart travel toward each other at 60 and 40 km/h. After how many hours do they meet?", /3 hours/],
  ["A shirt costs $50 after a 20% discount. What was the original price?", /62\.50/],
  ["Mia is twice as old as Jon. In 5 years the sum of their ages is 40. How old is Jon now?", /10/],
  ["A school bus holds 48 students. 7 buses are full. How many students are on the buses?", /336/],
  ["A rectangle has a length of 8 and a width of 5. What is its perimeter?", /^26$/],
  ["If a train travels 90 km in 1.5 hours, what is its speed?", /60 kilometers per hour/],
  ["A circle has a radius of 7. What is its circumference? Use 3.14.", /43\.96/]
]);
mod(LG, "logic", [
  ["Town A is east of town B, and town B is east of town C. Which town is farthest west?", /^C$/],
  ["Sam finished ahead of Lee, and Lee finished ahead of Kim. Who finished last of the three?", /Kim/],
  ["Some cats are black. All black things absorb heat. Do some cats absorb heat?", /^Yes/],
  ["All birds have feathers. Penguins are birds. Do penguins have feathers?", /Penguins have feathers/],
  ["What comes after Thursday?", /Friday/],
  ["What season comes after winter?", /Spring/]
]);
mod(HW, "howto", [
  ["How do I concatenate two strings in Java?", /\+/],
  ["How do I center a div in CSS?", /justify-content: center/],
  ["How do I make a list in HTML?", /<ul>/],
  ["What is the difference between let and const in JavaScript?", /cannot be reassigned/],
  ["What is the difference between GET and POST?", /request body/]
]);
ok("thesaurus has entries", TH.size() > 200);
ok("haiku lines are 5-7-5", (function () {
  var bad = 0, want = [5, 7, 5], H = WR._haiku;
  Object.keys(H).forEach(function (k) { H[k].forEach(function (list, i) { list.forEach(function (l) { if (WR.lineSyl(l) !== want[i]) bad++; }); }); });
  return bad === 0;
})());

/* ------------------------------------------------ sessions: sequences of turns */
var SESSIONS = [
  { name: "unrelated questions do not borrow each other's topic", turns: [
    ["What is inflation?", /rise in prices/], ["How do magnets work?", /magnetic field/], ["How does a vaccine work?", /immune/],
    ["Why is the ocean salty?", /rivers carry/], ["When did the Titanic sink?", /1912|iceberg/]] },
  { name: "pronouns follow the person, not the work", turns: [
    ["Who wrote Hamlet?", /Shakespeare/], ["When was he born?", /1564/], ["Where was he born?", /Stratford/], ["Who was his wife?", /Hathaway/]] },
  { name: "it and there keep the planet", turns: [
    ["Tell me about Mars", /fourth planet/], ["How far is it from the Sun?", /228 million/], ["How many moons does it have?", /two/], ["Can humans live there?", /cannot currently live/]] },
  { name: "ellipsis keeps the question and swaps the country", turns: [
    ["What is the capital of France?", /Paris/], ["And Germany?", /Berlin/], ["What about Italy?", /Rome/], ["How many people live there?", /59 million/]] },
  { name: "arithmetic continues the last result", turns: [
    ["What is 5 + 3?", /\b8\b/], ["Multiply that by 2", /\b16\b/], ["Now subtract 4", /\b12\b/], ["Add 10", /\b22\b/], ["Double it", /\b44\b/]] },
  { name: "another one repeats the kind", turns: [
    ["Tell me a joke", /./], ["Another one", /./], ["Tell me a fun fact", /./], ["Another one", /./]] },
  { name: "a feeling is not a follow-up", turns: [
    ["Who is the president of the United States?", /Trump/], ["I am sad", /sorry/i], ["Are you smart?", /program/], ["How do I write a good essay?", /thesis/]] },
  { name: "recase the last answer", turns: [["What is the capital of France?", /Paris/], ["Make it uppercase", /PARIS/]] }
];

(async function () {
  for (var i = 0; i < SESSIONS.length; i++) {
    var s = SESSIONS[i], w = rt.boot({});
    for (var j = 0; j < s.turns.length; j++) {
      var r = await rt.askOnce(w, s.turns[j][0], 20000);
      ok("session [" + s.name + "] " + s.turns[j][0], s.turns[j][1].test(r.text), r.text.replace(/\n/g, " | ").slice(0, 140));
    }
  }
  /* single end-to-end questions, each in its own page */
  var SINGLE = [
    ["What is a butterfly?", /insect/i], ["Who is the CEO of Apple?", /Tim Cook/], ["Name the months of the year.", /January.*December/],
    ["List the planets in order from the Sun.", /- Mercury/], ["Which planet has the most moons?", /Saturn/], ["What does the word benevolent mean?", /kind/],
    ["How do planes fly?", /lift/], ["What sound does a cat make?", /meow/i], ["When is Christmas?", /25 December/],
    ["Which is bigger, Texas or California?", /Texas is larger/], ["What is the difference between a virus and a bacterium?", /smaller/],
    ["What is the best way to learn a language?", /practise/], ["Write a haiku about the sea.", /\n/], ["What is the meaning of life?", /no single/],
    ["Tell me France's capital city", /Paris/], ["Which company created the Windows operating system?", /Microsoft/],
    ["How many people live in Italy?", /million/]
  ];
  for (var k = 0; k < SINGLE.length; k++) {
    var w2 = rt.boot({}), r2 = await rt.askOnce(w2, SINGLE[k][0], 20000);
    ok("single: " + SINGLE[k][0], SINGLE[k][1].test(r2.text), r2.text.replace(/\n/g, " | ").slice(0, 140));
  }
  /* things that must be declined, not guessed */
  var DECLINE = ["What is the square root of a banana?", "Who wrote the book The Glass Orchard of Zeta?", "What is the phone number of my dentist?"];
  for (var d = 0; d < DECLINE.length; d++) {
    var w3 = rt.boot({}), r3 = await rt.askOnce(w3, DECLINE[d], 20000);
    ok("declines: " + DECLINE[d], /don't|do not|can't|cannot|not a number|doesn't|no reliable/i.test(r3.text), r3.text.slice(0, 120));
  }
  console.log((fail ? "FAIL " : "") + pass + "/" + (pass + fail) + " skills checks passed");
  process.exit(fail ? 1 : 0);
})();
