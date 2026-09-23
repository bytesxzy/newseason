/* Held-out reasoning evaluation v3 for the language stack.
 *
 *   node tools/lm-heldout3.js [--root DIR] [--out FILE] [--fails]
 *
 * FROZEN, written and committed BEFORE the comprehension stage it measures
 * (quantity reasoning by dimensions, under-determined questions, research by
 * summary). The one exception is the car question, which is the user's own
 * example the stage was designed around -- it is kept but is not held out.
 * Runtime code never sees this file.
 */
"use strict";
var path = require("path"), fs = require("fs");
var HONEST = /don't (?:have|know|hold)|not sure|couldn't|can't|outside what|check that|could mean|which did you|no reliable|not something i/i;

/* [category, question, regex the answer must match] */
var CASES = [
  ["quantity", "A train travels at 80 kilometers per hour for 3 hours. How far does it go?", /\b240\b/],
  ["quantity", "How long does it take to drive 150 miles at 50 miles an hour?", /\b3\b/],
  ["quantity", "A cyclist covers 45 kilometers in 3 hours. How fast is she going?", /\b15\b/],
  ["quantity", "A tap fills 12 liters every minute. How much water does it give in 5 minutes?", /\b60\b/],
  ["quantity", "A car gets 30 miles per gallon. How many gallons does it need for 240 miles?", /\b8\b/],
  ["quantity", "If apples cost 2 dollars per kilogram, how much do 5 kilograms cost?", /\b10\b/],
  ["quantity", "A printer prints 20 pages per minute. How long does it take to print 300 pages?", /\b15\b/],
  ["quantity", "A runner keeps a pace of 6 miles per hour for 30 minutes. How far does she run?", /\b3\b/],
  ["quantity", "Water flows at 4 liters per second. How many liters flow in one hour?", /14,?400/],
  ["quantity", "A plane flies 900 kilometers in 2 hours. What is its speed?", /\b450\b/],
  ["quantity", "A worker earns 15 dollars an hour. How much does she earn in 8 hours?", /\b120\b/],
  ["quantity", "A pump moves 30 gallons per minute. How long does it take to move 600 gallons?", /\b20\b/],
  ["quantity", "A snail moves 2 meters per hour. How long does it take to cross 10 meters?", /\b5\b/],
  ["quantity", "How far does light travel in 2 seconds?", /599|600,?000|5\.99/],
  ["quantity", "A heart beats 70 times per minute. How many beats happen in an hour?", /4,?200/],
  /* the question does not fix the answer: the only passing answer names
     what is missing (or answers per unit of it) instead of inventing */
  ["underdetermined", "A car is traveling 60 miles an hour, how much gas does it use?", /depend|how long|how far|fuel economy|per gallon|per hour|need to know/i],
  ["underdetermined", "A truck drives at 50 miles per hour. How far does it go?", /depend|how long|per hour|need to know|time/i],
  ["underdetermined", "A pump moves 10 liters per minute. How much water does it move?", /depend|how long|per minute|need to know/i],
  ["underdetermined", "A plane flies 800 kilometers. How long does it take?", /depend|speed|how fast|need to know/i],
  ["underdetermined", "Apples cost 3 dollars per kilogram. How much do the apples cost?", /depend|how many|how much.*(?:buy|weigh)|per kilogram|need to know/i],
  ["underdetermined", "A faucet drips 5 milliliters per minute. How much water is wasted?", /depend|how long|per minute|need to know/i],
  ["underdetermined", "A bus travels at 40 kilometers per hour. How long does the trip take?", /depend|how far|distance|need to know/i],
  ["knowledge", "What does a thermometer measure?", /temperature/i],
  ["knowledge", "Why do we need to sleep?", /rest|brain|memory|restor|body/i],
  ["knowledge", "What is the boiling point of water in Fahrenheit?", /212/],
  ["knowledge", "How many continents are there?", /seven|\b7\b/i],
  ["knowledge", "What planet is closest to the Sun?", /Mercury/i],
  ["knowledge", "What gas do plants absorb from the air?", /carbon dioxide|CO2/i],
  ["knowledge", "How many legs does an insect have?", /six|\b6\b/i],
  ["knowledge", "What is the main language of Japan?", /Japanese/i],
  ["knowledge", "What is H2O?", /water/i],
  ["knowledge", "What is the speed of light?", /299|300,?000|3\s?(?:x|×)\s?10/i],
  ["abstain", "How much fuel does a Glimmerwing 9 use per hour?", HONEST],
  ["abstain", "How far is Planet Vorn from its star?", HONEST],
  ["abstain", "How much does a quellium bar weigh?", HONEST],
  ["abstain", "What is the top speed of the Trelloway X2 car?", HONEST]
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
    var hay = /math|quantity/.test(c[0]) ? firstSentence(text) : text;
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
