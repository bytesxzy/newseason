/* Held-out phrasing evaluation for the language stack.
 *
 *   node tools/lm-heldout.js [--root DIR] [--out FILE]
 *
 * FROZEN. These 80 questions were written before any of the code changes
 * they measure, and are never used to tune runtime code: idiomatic and
 * metaphorical phrasings of ordinary questions, keyword fragments, prose
 * word problems and descriptive mathematics. Expectations are checked on the
 * answer text only; runtime code never sees this file.
 */
"use strict";
var path = require("path"), fs = require("fs");

/* [category, question, regex the answer must match, (optional) regex it must not match] */
var CASES = [
  ["idiom", "Give me the lowdown on photosynthesis", /light|chlorophyll|glucose|sugar/i],
  ["idiom", "What's the deal with black holes?", /gravity|light|escape/i],
  ["idiom", "In a nutshell, what is DNA?", /genetic|deoxyribonucleic|double helix|nucleotide|hered/i],
  ["idiom", "Walk me through how vaccines work", /immune|antigen|antibod/i],
  ["idiom", "What makes a CPU tick?", /instruction|execut|processing/i],
  ["idiom", "Spill the beans on the Cold War", /Soviet|USSR|United States/i],
  ["idiom", "Who's the brains behind Python?", /Guido/i],
  ["idiom", "Who put the Mona Lisa on canvas?", /Leonardo/i],
  ["idiom", "Who's the pen behind Hamlet?", /Shakespeare/i],
  ["idiom", "Where does Japan keep its seat of government?", /Tokyo/i],
  ["idiom", "Paint me a picture of what a neuron is", /nerve|signal|brain|cell/i],
  ["idiom", "Break down the greenhouse effect for me", /heat|gas|carbon|atmospher/i],
  ["idiom", "What's the big idea behind evolution?", /natural selection|species|Darwin|inherit/i],
  ["idiom", "Boil it down: what is inflation?", /price/i],
  ["idiom", "What's the skinny on machine learning?", /data|learn/i],
  ["idiom", "Who first set foot on the Moon?", /Armstrong/i],
  ["metaphor", "What's the tongue of Brazil?", /Portuguese/i],
  ["metaphor", "Which tongue do they speak in Mexico?", /Spanish/i],
  ["idiom", "Who dreamed up the theory of relativity?", /Einstein/i],
  ["idiom", "Who cooked up the World Wide Web?", /Berners-Lee/i],
  ["idiom", "Mount Everest, how tall are we talking?", /8,?8\d\d|8\.8/],
  ["idiom", "How hot does water need to get before it boils away?", /\b100\b|212/],
  ["idiom", "At what temperature does water turn to ice?", /\b0\b|\b32\b/],
  ["idiom", "What's the chemical shorthand for gold?", /\bAu\b/],
  ["metaphor", "Why is the sky dressed in blue?", /scatter|Rayleigh|wavelength/i],
  ["idiom", "How come we have seasons on Earth?", /tilt|axis/i],
  ["idiom", "How come metals feel cold to the touch?", /conduct|heat/i],
  ["idiom", "In plain words, how do TCP and UDP differ?", /TCP[\s\S]*UDP|UDP[\s\S]*TCP/],
  ["idiom", "Is a spider an insect or not?", /\bno\b|\bnot\b|arachnid|eight legs/i],
  ["idiom", "Explain like I'm five: what's gravity?", /mass|attract|pull|force/i],
  ["metaphor", "What's under the hood of a GPU?", /parallel|graphic/i],
  ["idiom", "Sum up World War II in a sentence", /1939|1945|Axis|Allies/i],
  ["idiom", "Who's the mastermind behind The Starry Night?", /van Gogh/i],
  ["idiom", "Who penned Pride and Prejudice?", /Austen/i],
  ["metaphor", "Where does the Eiffel Tower call home?", /Paris|France/i],
  ["idiom", "Give me the Big Bang in a nutshell", /universe|expan/i],
  ["idiom", "Fill me in on the Renaissance", /Europe|art|14th|15th|16th|rebirth/i],
  ["idiom", "What's the story with Nelson Mandela?", /South Africa|apartheid|president/i],
  ["metaphor", "Who is the father of computer science?", /Turing/i],
  ["idiom", "Clue me in: what does an enzyme do?", /catalys|reaction|speed/i],
  ["fragment", "speed light", /299|300,?000|3\s?(?:x|×)\s?10/i],
  ["fragment", "Einstein famous for", /relativity/i],
  ["fragment", "capital Kenya", /Nairobi/i],
  ["fragment", "freezing point water fahrenheit", /\b32\b/],
  ["fragment", "Newton known for", /motion|gravit/i],
  ["fragment", "largest ocean", /Pacific/i],
  ["fragment", "language Austria", /German/i],
  ["fragment", "painter Starry Night", /van Gogh/i],
  ["fragment", "chemical symbol iron", /\bFe\b/],
  ["fragment", "Mars moons", /Phobos|Deimos|two/i],
  ["prose-math", "Two times a number plus 11 is 15. What is the number?", /\b2\b/],
  ["prose-math", "A number doubled and then increased by 7 gives 19. Find the number.", /\b6\b/],
  ["prose-math", "The sum of a number and 8 is 20. What is the number?", /\b12\b/],
  ["prose-math", "Five less than three times a number is 16. Find the number.", /\b7\b/],
  ["prose-math", "If I triple a number and subtract 4, I get 11. What is the number?", /\b5\b/],
  ["prose-math", "Half of a number is 9. What is the number?", /\b18\b/],
  ["prose-math", "A number divided by 4 equals 6. What is it?", /\b24\b/],
  ["prose-math", "Twice a number minus 3 equals the number plus 5. Find the number.", /\b8\b/],
  ["prose-math", "I'm thinking of a number. If you add 13 to it you get 40. What is it?", /\b27\b/],
  ["prose-math", "The product of a number and 6 is 54. What's the number?", /\b9\b/],
  ["desc-math", "Rolling a pair of dice, what's the probability the numbers add to 8?", /5\/36|0\.13\d|13\.\d+%/],
  ["desc-math", "Toss a couple of coins. What's the chance both land heads?", /1\/4|0\.25|25%/],
  ["desc-math", "What is the largest number that divides both 48 and 180?", /\b12\b/],
  ["desc-math", "What's the smallest number that both 4 and 6 divide into?", /\b12\b/],
  ["desc-math", "How many handshakes happen if 10 people each shake hands once with everyone else?", /\b45\b/],
  ["desc-math", "In how many ways can 5 books be lined up on a shelf?", /\b120\b/],
  ["desc-math", "How many different teams of 3 can be picked from 8 players?", /\b56\b/],
  ["desc-math", "What is the square of 17?", /\b289\b/],
  ["desc-math", "What is three quarters of 200?", /\b150\b/],
  ["desc-math", "What do you get when you multiply 12 by itself?", /\b144\b/],
  ["desc-math", "A jacket costs 40 dollars and is 25 percent off. What do I pay?", /\b30\b/],
  ["desc-math", "What is 2 to the 8th power?", /\b256\b/],
  ["desc-math", "What's the remainder when 100 is divided by 7?", /\b2\b/],
  ["desc-math", "Is 91 a prime number?", /\bno\b|not prime|7\s*(?:x|×|\*)\s*13/i],
  ["desc-math", "How many seconds are in two hours?", /\b7,?200\b/],
  ["desc-math", "What's the slope of y = 3x^2 at x = 2?", /\b12\b/],
  ["desc-math", "What number squared gives 144?", /\b12\b/],
  ["desc-math", "Two numbers add up to 10 and differ by 4. What are they?", /\b7\b[\s\S]*\b3\b|\b3\b[\s\S]*\b7\b/],
  ["desc-math", "What is the sum of the numbers from 1 to 50?", /\b1,?275\b/],
  ["desc-math", "What's the average of 10, 20 and 60?", /\b30\b/]
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
