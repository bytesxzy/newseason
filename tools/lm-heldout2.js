/* Held-out phrasing evaluation v2 for the language stack.
 *
 *   node tools/lm-heldout2.js [--root DIR] [--out FILE] [--fails]
 *
 * FROZEN, and written AFTER the phrasing work was done: v1 (lm-heldout.js)
 * was looked at during development, so it is no longer held out. These 91
 * questions were committed before their first run and are never used to
 * tune runtime code. Same categories as v1 plus ordinary questions (to catch
 * regressions) and invented-name questions whose only passing answer is an
 * honest "I don't know" -- the check against confident off-topic answers.
 */
"use strict";
var path = require("path"), fs = require("fs");
var HONEST = /don't (?:have|know|hold)|not sure|couldn't|can't|outside what|check that|could mean|which did you|no reliable|not something i/i;

/* [category, question, regex the answer must match] */
var CASES = [
  ["idiom", "Give me the scoop on photosynthesis", /light|chlorophyll|glucose|sugar/i],
  ["idiom", "What's the lowdown on volcanoes?", /magma|lava|erupt/i],
  ["idiom", "In a nutshell, what does a CPU do?", /instruction|execut|process/i],
  ["idiom", "Talk me through how the heart pumps blood", /ventric|atri|chamber|muscle|contract/i],
  ["idiom", "What's the gist of the theory of evolution?", /natural selection|species|Darwin|inherit/i],
  ["idiom", "Who's the brains behind Microsoft?", /Gates|Allen/i],
  ["idiom", "Who's the genius behind the telephone?", /Bell/i],
  ["idiom", "Who put pen to paper for Romeo and Juliet?", /Shakespeare/i],
  ["idiom", "Who gave us the theory of gravity?", /Newton/i],
  ["idiom", "Who brought the light bulb to life?", /Edison/i],
  ["idiom", "Where does France keep its government?", /Paris/i],
  ["idiom", "How cold does water have to get to freeze?", /\b0\b|\b32\b/],
  ["idiom", "What's the chemical shorthand for silver?", /\bAg\b/],
  ["idiom", "Spell out what an atom is", /nucleus|proton|electron|matter/i],
  ["idiom", "Run me through what DNS does", /domain|name|IP|address/i],
  ["idiom", "Fill me in on the French Revolution", /1789|monarchy|Bastille|France/i],
  ["idiom", "What's the deal with inflation?", /price/i],
  ["idiom", "Who kicked off the Protestant Reformation?", /Luther/i],
  ["idiom", "Who came up with the periodic table?", /Mendeleev/i],
  ["idiom", "How tall is the Eiffel Tower, roughly?", /3[0-3]\d/],
  ["metaphor", "What's the mother tongue of Argentina?", /Spanish/i],
  ["metaphor", "Which tongue is spoken in Portugal?", /Portuguese/i],
  ["metaphor", "What is the seat of government of Germany?", /Berlin/i],
  ["metaphor", "Who is the architect of the theory of relativity?", /Einstein/i],
  ["metaphor", "Who was the mastermind behind the Sistine Chapel ceiling?", /Michelangelo/i],
  ["metaphor", "Which pen wrote Oliver Twist?", /Dickens/i],
  ["metaphor", "What is the cradle of the Renaissance?", /Florence|Italy/i],
  ["metaphor", "What's under the hood of a CPU?", /control unit|arithmetic|register|cache|instruction/i],
  ["metaphor", "Who is the father of the theory of evolution?", /Darwin/i],
  ["metaphor", "What's the birthplace of the Olympic Games?", /Greece|Olympia/i],
  ["fragment", "capital Canada", /Ottawa/i],
  ["fragment", "boiling point water", /100|212/],
  ["fragment", "author 1984", /Orwell/i],
  ["fragment", "Newton laws", /motion|force|inertia/i],
  ["fragment", "speed of sound", /343|340|1,?235|767/],
  ["fragment", "chemical symbol sodium", /\bNa\b/],
  ["fragment", "Jupiter moons", /\d|Io|Europa|Ganymede|Callisto/],
  ["fragment", "currency Japan", /yen/i],
  ["fragment", "inventor telephone", /Bell/i],
  ["fragment", "largest planet", /Jupiter/i],
  ["fragment", "Shakespeare famous for", /Hamlet|plays|Romeo|playwright/i],
  ["fragment", "tallest mountain", /Everest/i],
  ["prose-math", "Three times a number minus 4 is 20. What is the number?", /\b8\b/],
  ["prose-math", "A number increased by 15 equals 42. Find it.", /\b27\b/],
  ["prose-math", "The difference between a number and 9 is 14. What is the number?", /\b23\b/],
  ["prose-math", "Seven more than twice a number is 31. What is the number?", /\b12\b/],
  ["prose-math", "If you divide a number by 3 and add 5 you get 12. What's the number?", /\b21\b/],
  ["prose-math", "A third of a number is 11. What is the number?", /\b33\b/],
  ["prose-math", "I double a number and add 9 to get 25. What was the number?", /\b8\b/],
  ["prose-math", "Four times a number equals the number plus 18. Find the number.", /\b6\b/],
  ["prose-math", "The sum of two numbers is 30 and their difference is 6. What are the numbers?", /18[\s\S]*12|12[\s\S]*18/],
  ["prose-math", "A number squared is 81. What is the number?", /\b9\b/],
  ["prose-math", "Subtract 6 from a number and the result is 19. What is the number?", /\b25\b/],
  ["prose-math", "When 8 is added to five times a number, the result is 48. Find the number.", /\b8\b/],
  ["desc-math", "What's the chance of rolling a 6 on a die?", /1\/6|0\.16|16\.\d+%|17%/],
  ["desc-math", "Flip three coins. What is the probability all are heads?", /1\/8|0\.125|12\.5%/],
  ["desc-math", "What is the greatest common divisor of 36 and 60?", /\b12\b/],
  ["desc-math", "What is the least common multiple of 6 and 8?", /\b24\b/],
  ["desc-math", "How many ways can 4 people stand in a line?", /\b24\b/],
  ["desc-math", "How many games are played if 6 teams each play every other team once?", /\b15\b/],
  ["desc-math", "What is two thirds of 90?", /\b60\b/],
  ["desc-math", "What is the cube of 5?", /\b125\b/],
  ["desc-math", "What is 3 to the power of 5?", /\b243\b/],
  ["desc-math", "What's the remainder when 50 is divided by 6?", /\b2\b/],
  ["desc-math", "How many minutes are in three hours?", /\b180\b/],
  ["desc-math", "A shirt costs 60 dollars and is 20 percent off. What is the sale price?", /\b48\b/],
  ["desc-math", "What is the sum of the numbers from 1 to 100?", /5,?050/],
  ["desc-math", "Is 97 a prime number?", /\byes\b|is prime|is a prime/i],
  ["normal", "What is the capital of Italy?", /Rome/i],
  ["normal", "Who wrote Romeo and Juliet?", /Shakespeare/i],
  ["normal", "How many legs does a spider have?", /eight|\b8\b/i],
  ["normal", "What is photosynthesis?", /light|chlorophyll|glucose|sugar/i],
  ["normal", "Why is the sky blue?", /scatter|Rayleigh|wavelength/i],
  ["normal", "What language is spoken in Brazil?", /Portuguese/i],
  ["normal", "Who painted the Mona Lisa?", /Leonardo/i],
  ["normal", "What is the chemical symbol for iron?", /\bFe\b/],
  ["normal", "What is the boiling point of water?", /100|212/],
  ["normal", "Who developed the theory of relativity?", /Einstein/i],
  ["normal", "What does a GPU do?", /parallel|graphic/i],
  ["normal", "What is the difference between a virus and bacteria?", /cell|living|antibiotic|replicat/i],
  ["normal", "When did World War II end?", /1945/],
  ["normal", "What is the largest ocean on Earth?", /Pacific/i],
  ["normal", "What currency does Japan use?", /yen/i],
  /* Nothing local can know these (invented names). The only passing answer
     is an honest one; a confident answer about something else fails. */
  ["abstain", "Who is the drummer of the band Glass Otters?", HONEST],
  ["abstain", "What's the capital of the planet Zorbon?", HONEST],
  ["abstain", "What's the tongue of Narnia?", HONEST],
  ["abstain", "Who's the pen behind the novel The Quiet Lantern of Vess?", HONEST],
  ["abstain", "What is the population of Glimmerfield township?", HONEST],
  ["abstain", "Break down the Hollis-Varga theorem for me", HONEST],
  ["abstain", "Who founded the company Brindlewick Labs?", HONEST],
  ["abstain", "freezing point of zorbanium", HONEST]
];

function firstSentence(t) { return (String(t).split(/(?<=[.!?])\s+(?=[A-Z(])/)[0] || ""); }

async function main() {
  var args = process.argv.slice(2);
  function arg(k, d) { var i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; }
  var root = path.resolve(arg("root", path.join(__dirname, "..")));
  var rt = require(path.join(root, "tools", "lm-runtime.js"));
  var rows = [], byCat = {}, lat = [];
  for (var i = 0; i < CASES.length; i++) {
    var c = CASES[i], win = rt.boot({}), a = await rt.askOnce(win, c[1], 20000);
    var text = a.text || "";
    /* math answers must state the value in their first sentence; prose
       answers anywhere */
    var hay = /math/.test(c[0]) ? firstSentence(text) : text;
    var pass = c[2].test(hay);
    lat.push(a.latency_ms || 0);
    var b = byCat[c[0]] || (byCat[c[0]] = { total: 0, pass: 0 });
    b.total++; if (pass) b.pass++;
    rows.push({ cat: c[0], q: c[1], pass: pass, text: text.slice(0, 220), route: a.route,
                conf: a.raw && a.raw.lm ? a.raw.lm.confidence : undefined, ms: a.latency_ms });
  }
  lat.sort(function (x, y) { return x - y; });
  var passN = rows.filter(function (r) { return r.pass; }).length;
  var report = { root: root, total: rows.length, pass: passN, accuracy_pct: Math.round(passN / rows.length * 1000) / 10,
                 by_category: byCat, latency: { p50: lat[lat.length >> 1], p90: lat[Math.floor(lat.length * 0.9)], max: lat[lat.length - 1] },
                 rows: rows };
  var out = arg("out", "");
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: passN + "/" + rows.length, accuracy_pct: report.accuracy_pct, by_category: byCat, latency: report.latency }));
  if (args.indexOf("--fails") >= 0) rows.filter(function (r) { return !r.pass; }).forEach(function (r) { console.log("FAIL", r.cat, "|", r.q, "=>", r.text.slice(0, 120)); });
}
module.exports = { CASES: CASES };
if (require.main === module) main();
