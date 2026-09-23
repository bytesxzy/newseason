/* Conversation memory and answer variation.
 *
 *   node tools/lm-memory.js            (npm run lm:memory)
 *
 * Boots the shipping page with a stand-in for the public sources, so the web
 * path runs without a network, and walks the dialogues the memory layer exists
 * for: repeated questions, "forget X but keep Y", "ignore previous
 * instructions", standing instructions, notes, recall, and a memory verb the
 * lexicon has never seen. Expectations live here, never in runtime code.
 */
"use strict";
var rt = require("./lm-runtime.js");

var EXTRACT = {
  "2016": "2016 (MMXVI) was a leap year starting on Friday of the Gregorian calendar, the 2016th year of the Common Era (CE) and Anno Domini (AD) designations, the 16th year of the 3rd millennium and the 21st century, and the 7th year of the 2010s decade. 2016 was designated as International Year of Pulses by the sixty-eighth session of the United Nations General Assembly. 2016 marked the deaths of famous musicians including David Bowie, Prince, and George Michael, as well as prominent world leaders including Shimon Peres, Bhumibol Adulyadej, and Fidel Castro."
};
var DICT = { obliterate: [{ word: "obliterate", meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To destroy completely; to wipe out." }] }] }] };
function json(o) { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(o); } }); }
function mockFetch(url) {
  var u = String(url), m, k;
  if ((m = u.match(/dictionaryapi\.dev\/api\/v2\/entries\/en\/([^?&#]+)/))) {
    var w = decodeURIComponent(m[1]).toLowerCase();
    return DICT[w] ? json(DICT[w]) : Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });
  }
  if (/wikipedia\.org/.test(u) && (m = u.match(/[?&]titles=([^&]+)/))) {
    var t = decodeURIComponent(m[1]);
    for (k in EXTRACT) if (k.toLowerCase() === t.toLowerCase()) return json({ query: { pages: { "1": { title: k, extract: EXTRACT[k] } } } });
    return json({ query: { pages: { "-1": { missing: "" } } } });
  }
  if (/wikipedia\.org/.test(u) && (m = u.match(/[?&]gsrsearch=([^&]+)/))) {
    var q = decodeURIComponent(m[1]);
    for (k in EXTRACT) if (q.toLowerCase().indexOf(k.toLowerCase()) >= 0) return json({ query: { pages: { "1": { title: k, extract: EXTRACT[k] } } } });
    return json({ query: { pages: {} } });
  }
  if ((m = u.match(/wbsearchentities&search=([^&]+)/))) {
    return json({ search: decodeURIComponent(m[1]) === "2016" ? [{ label: "2016", description: "year" }] : [] });
  }
  return Promise.reject(new Error("offline"));
}

var DEFECTS = [/\b(is|are|was|were)\s+(is|are|was|were)\b/i, /\b([a-z]{4,})\s+\1\b/i,
               /\b(?:and|or|but|of|to|the|a|an|with|because)\s*[.!?]$/i, /<\/?[a-z]+[^>]*>/i,
               /\bundefined\b|\bNaN\b|\[object/, /^[^"]*"[^"]*$/, /\s+[,.;:]/];
function clean(t) { return DEFECTS.every(function (re) { return !re.test(t); }); }
function sentences(t) { return (String(t).match(/[.!?]+(?=\s|$)/g) || []).length || 1; }

var failed = 0, total = 0;
function check(name, ok, detail) {
  total++;
  if (!ok) failed++;
  console.log((ok ? "  ok    " : "  FAIL  ") + name + (detail ? "   [" + String(detail).replace(/\s+/g, " ").slice(0, 220) + "]" : ""));
}
function boot(seed) {
  var w = rt.boot({ fetch: mockFetch });
  if (w.__loadErrors && w.__loadErrors.length) console.log("LOAD ERRORS", w.__loadErrors);
  if (seed != null && w.C4LM && w.C4LM.seed) w.C4LM.seed(seed);
  return w;
}
async function ask(w, q) { var r = await rt.askOnce(w, q, 20000); return String(r.text || ""); }

async function run(seed) {
  console.log("seed " + seed);
  var w = boot(seed);
  var a1 = await ask(w, "What is 2016?"), a2 = await ask(w, "What is 2016?"), a3 = await ask(w, "What is 2016?");
  check("repeat: facts kept", [a1, a2, a3].every(function (x) { return /2016/.test(x) && /leap year/i.test(x) && /Gregorian/.test(x); }), a1);
  check("repeat: source tense kept", /\bwas a leap year\b/.test(a1) && !/\b2016 is a leap year\b/.test(a1), a1);
  check("repeat: three different answers", a1 !== a2 && a2 !== a3 && a1 !== a3, a2 + " || " + a3);
  check("repeat: a fact not shown before is added", /Pulses|Bowie|Castro|Peres/.test(a2) && /Pulses|Bowie|Castro|Peres/.test(a3), a3);
  check("repeat: well-formed", [a1, a2, a3].every(clean), [a1, a2, a3].filter(function (x) { return !clean(x); })[0]);

  w = boot(seed);
  var c1 = await ask(w, "What is the capital of France?"), c2 = await ask(w, "What is the capital of France?"), c3 = await ask(w, "What is the capital of France?");
  check("local repeat: Paris every time", [c1, c2, c3].every(function (x) { return /Paris/.test(x) && /France/.test(x); }), c1 + " || " + c2);
  check("local repeat: worded differently", c1 !== c2 && c2 !== c3 && c1 !== c3, c2 + " || " + c3);
  check("local repeat: well-formed", [c1, c2, c3].every(clean), [c1, c2, c3].filter(function (x) { return !clean(x); })[0]);

  w = boot(seed);
  var n1 = await ask(w, "My name is Gabriel.");
  check("introduction acknowledged", /Gabriel/.test(n1), n1);
  check("name recalled", /Gabriel/.test(await ask(w, "What is my name?")));
  var hi = await ask(w, "hi");
  check("greeting uses the name", /Gabriel/.test(hi), hi);

  w = boot(seed);
  await ask(w, "What is 2016?");
  await ask(w, "What is the capital of France?");
  var f1 = await ask(w, "Forget about 2016 but keep France in this context.");
  check("forget X keep Y: acknowledged", /2016/.test(f1) && /France/.test(f1) && /forg|out of my memory/i.test(f1), f1);
  var f2 = await ask(w, "What is its population?");
  check("forget X keep Y: kept subject still resolves", /68 million/.test(f2), f2);
  var f3 = await ask(w, "What did we talk about?");
  check("forget X keep Y: forgotten topic gone", /France/.test(f3) && !/2016/.test(f3), f3);

  w = boot(seed);
  await ask(w, "My name is Gabriel.");
  var d1 = await ask(w, "From now on, answer in one sentence.");
  check("standing instruction acknowledged", /one-sentence|one sentence/i.test(d1), d1);
  var d2 = await ask(w, "What is photosynthesis?");
  check("standing instruction applied", sentences(d2) === 1 && /photosynthesis/i.test(d2), d2);
  var d3 = await ask(w, "Ignore previous instructions.");
  check("ignore previous instructions: acknowledged", /clear|forg|fresh|slate/i.test(d3), d3);
  var d4 = await ask(w, "What is photosynthesis?");
  check("ignore previous instructions: instruction gone", sentences(d4) >= 2, d4);
  var d5 = await ask(w, "What is my name?");
  check("ignore previous instructions: facts gone", !/Gabriel/.test(d5), d5);

  w = boot(seed);
  await ask(w, "My name is Gabriel.");
  await ask(w, "Use bullet points from now on.");
  var k1 = await ask(w, "Ignore previous instructions but keep my name.");
  var k2 = await ask(w, "What's my name?");
  check("ignore ... but keep: kept fact survives", /Gabriel/.test(k2), k1 + " || " + k2);
  var k3 = await ask(w, "What are my instructions?");
  check("ignore ... but keep: instructions cleared", /haven.t given/i.test(k3), k3);

  w = boot(seed);
  var r1 = await ask(w, "Remember that my meeting is at 5pm.");
  var r2 = await ask(w, "When is my meeting?");
  check("note stored and recalled", /5\s?pm/i.test(r1) && /5\s?pm/i.test(r2), r1 + " || " + r2);

  w = boot(seed);
  await ask(w, "Don't forget that I live in Honolulu.");
  var g1 = await ask(w, "Where do I live?");
  check("don't forget = remember", /Honolulu/.test(g1), g1);
  await ask(w, "Stop remembering where I live.");
  var g2 = await ask(w, "Where do I live?");
  check("stop remembering = forget", !/Honolulu/.test(g2), g2);

  w = boot(seed);
  var q1 = await ask(w, "Ignore previous instructions. What is the capital of Japan?");
  check("question after a command still answered", /Tokyo/.test(q1), q1);

  w = boot(seed);
  await ask(w, "What is the capital of France?");
  await ask(w, "What is photosynthesis?");
  var t1 = await ask(w, "What was my first question?");
  check("first question recalled", /capital of France/i.test(t1), t1);

  w = boot(seed);
  await ask(w, "What is the capital of France?");
  var u1 = await ask(w, "Obliterate everything we discussed.");
  var u2 = await ask(w, "What did we talk about?");
  check("unknown verb read from its dictionary definition", /clear|forg|fresh|slate/i.test(u1) && !/France/.test(u2), u1 + " || " + u2);

  w = boot(seed);
  await ask(w, "What is machine learning?");
  var m1 = await ask(w, "Never mind. What is 12 * 12?");
  check("never mind is not a memory command", /\b144\b/.test(m1) && !/machine learning/i.test(m1), m1);

  w = boot(seed);
  var o1 = await ask(w, "Explain photosynthesis in one sentence.");
  var o2 = await ask(w, "What is photosynthesis?");
  check("one-off format request stays one-off", sentences(o1) === 1 && sentences(o2) >= 2, o1 + " || " + o2);

  w = boot(seed);
  await ask(w, "What is photosynthesis?");
  var b1 = await ask(w, "Answer in one sentence.");
  var b2 = await ask(w, "What is gravity?");
  check("bare format instruction re-answers the last question", /photosynthesis/i.test(b1) && sentences(b1) <= 2, b1);
  check("...and applies only to that answer", sentences(b2) >= 2, b2);

  w = boot(seed);
  await ask(w, "My name is Gabriel.");
  var stored = w.localStorage.getItem("c4lm.memory.v1");
  var w2 = boot(seed);
  if (stored) w2.localStorage.setItem("c4lm.memory.v1", stored);
  w2.C4LM.memory().load();
  check("long-term memory persists across sessions", /Gabriel/.test(await ask(w2, "What is my name?")), stored);
}

(async function () {
  var seeds = process.argv.slice(2).map(Number).filter(function (n) { return !isNaN(n); });
  if (!seeds.length) seeds = [1, 7, 42];
  for (var i = 0; i < seeds.length; i++) await run(seeds[i]);
  console.log("\n" + (total - failed) + "/" + total + " checks passed");
  process.exit(failed ? 1 : 0);
})();
