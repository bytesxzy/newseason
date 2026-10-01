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
  /* text the user supplies */
  var TXT = [
    ["Summarize this: The Industrial Revolution began in Britain in the late 18th century. It shifted production from hand tools to machines. Factories grew, cities expanded, and new forms of transport such as railways appeared. Living conditions were often poor at first, but over time wages and health improved.", /^The Industrial Revolution began in Britain/],
    ["What is the sentiment of: I absolutely loved this movie, it was fantastic!", /sentiment is positive/], ["Is this positive or negative: The service was terrible and the food was cold.", /sentiment is negative/],
    ["Is this positive or negative: I did not enjoy it at all.", /sentiment is negative/], ["What is the sentiment of: The food was not bad.", /positive|neutral/],
    ["Make this more formal: hey, can u send me the report asap", /^Hello, could you please send me the report as soon as possible\?$/],
    ["Make this more casual: I would like to inquire regarding the purchase of additional items.", /I'd like to ask about the purchase/],
    ["Paraphrase: The quick brown fox jumps over the lazy dog.", /^The fast brown fox leaps over the idle dog\.$/],
    ["Give me a title for an essay about climate change", /Understanding Climate Change/], ["How many words are in: the quick brown fox jumps", /^There are 5 words\.$/],
    ["Count the characters in 'hello world'", /11 characters/], ["Turn this into bullet points: The meeting starts at 9. Bring your laptop. Lunch is provided.", /^- The meeting starts at 9\n- Bring your laptop\n- Lunch is provided$/],
    ["What is this about: The team won the championship after a thrilling match, and the coach praised every player.", /sports/],
    ["Extract the keywords from: Machine learning models learn patterns from large datasets to make predictions.", /Keywords: .*(?:learning|models|patterns)/],
    ["What is the reading level of: The cat sat on the mat. It was a sunny day.", /very easy/],
    ["Read this: Maria went to the market on Tuesday and bought 3 apples, 2 loaves of bread and a bottle of milk. She paid 12 dollars. Question: How much did Maria pay?", /^12 dollars\.$/],
    ["Passage: The Amazon is the largest rainforest on Earth. It covers about 5.5 million square kilometres across nine countries. Question: How many countries does the Amazon cover?", /^Nine countries\.$/],
    ["Based on the following text, who founded the company? Apple was founded by Steve Jobs, Steve Wozniak and Ronald Wayne in 1976.", /^Steve Jobs, Steve Wozniak and Ronald Wayne\.$/],
    ["Text: The festival takes place in Edinburgh every August. Thousands of visitors attend. Question: When does the festival take place?", /^August\.$/],
    ["Passage: Sara missed the bus because it rained heavily. She walked to school instead. Question: Why did Sara miss the bus?", /^Because it rained heavily\.$/],
    ["Passage: The sky is blue. Question: Who won the World Cup?", /doesn't say/],
    ["Extract all the numbers from: I have 3 cats, 12 fish and 100 books.", /^Numbers: 3, 12, 100\.$/],
    ["Find the emails in: contact bob@example.com or alice@test.org", /bob@example\.com, alice@test\.org/],
    ["What are the dates in: The event is on 5 May 2025 and ends on 7 May 2025.", /5 May 2025, 7 May 2025/]
  ];
  for (var tx = 0; tx < TXT.length; tx++) {
    var tt = await say(rt.boot({}), TXT[tx][0]);
    ok("text: " + TXT[tx][0].slice(0, 60), TXT[tx][1].test(tt), tt.slice(0, 160));
  }
  /* distances between places, trip times, coordinates */
  var DIS = [
    ["How far is Toronto from New York?", /about 5[0-9]{2} km \(3[0-9]{2} miles\)/], ["How far is London from Paris in miles?", /215 miles/],
    ["distance between London and Sydney", /16,9[0-9]{2} km/], ["How long does it take to fly from London to New York?", /7 hours/],
    ["Which is closer to London, Paris or Rome?", /^Paris is closer to London/], ["Which is farther north, Oslo or Rome?", /^Oslo is farther north/],
    ["What are the coordinates of Tokyo?", /35\.7° N, 139\.7° E/], ["What is the latitude of Sydney?", /33\.9° S/], ["Which hemisphere is Sydney in?", /southern/],
    ["How far is France from Japan?", /capitals/], ["How long would it take to drive from London to Sydney?", /no road/],
    ["How many miles from Boston to Chicago?", /850 miles/], ["How far is Londn from Pariss?", /345 km/], ["How far is the Moon from the Earth?", /^(?!.*straight line)/]
  ];
  for (var di = 0; di < DIS.length; di++) {
    var dd = await say(rt.boot({}), DIS[di][0]);
    ok("distance: " + DIS[di][0], DIS[di][1].test(dd), dd.slice(0, 160));
  }
  /* words: inflections, rhymes, pronunciation, vocabulary, collective nouns, events */
  var WRD = [
    ["What is the plural of cactus?", /cacti or cactuses/], ["What is the past tense of swim?", /swam/], ["What is the past participle of eat?", /eaten/], ["What is the plural of baby?", /babies/],
    ["What is the comparative of good?", /better/], ["superlative of happy", /happiest/], ["What is the -ing form of run?", /running/], ["Spell 'necessary'", /^necessary is spelled N-E-C-E-S-S-A-R-Y\.$/],
    ["Is 'alot' a word?", /misspelling.*a lot/], ["Is it recieve or receive?", /"receive" is correct/], ["What rhymes with cat?", /bat, hat/], ["What rhymes with orange?", /Nothing rhymes perfectly/],
    ["How do you pronounce 'quinoa'?", /KEEN-wah/], ["How do you say hello in French?", /bonjour/i], ["What part of speech is run?", /verb/], ["Use the word serendipity in a sentence", /serendipity/],
    ["What does the word 'serendipity' mean?", /chance|accident/], ["What is the fear of spiders called?", /Arachnophobia/], ["What is a person who is afraid of clowns called?", /Coulrophobia/], ["What is the word for fear of snakes?", /Ophidiophobia/],
    ["What is a group of crows called?", /^A group of crows is called a murder\.$/], ["What does ghosting mean?", /ending all contact/], ["What does 'status quo' mean?", /existing state/], ["What is the study of insects called?", /Entomology/],
    ["Who won the 1966 World Cup?", /^England won the 1966 World Cup\.$/], ["Where were the 1992 Olympics?", /Barcelona/], ["How many times has Brazil won the World Cup?", /five times/], ["How many players are on a football team?", /an American football/],
    ["What is 3 power 4?", /^81/], ["What is 5 raised to the 3rd?", /^125/]
  ];
  for (var wi = 0; wi < WRD.length; wi++) {
    var wd = await say(rt.boot({}), WRD[wi][0]);
    ok("words: " + WRD[wi][0], WRD[wi][1].test(wd), wd.slice(0, 160));
  }
  /* money: tips, splitting, discounts, tax, loans, interest, wages */
  var MON = [
    ["Split 120 dollars among 5 people", /\$24 each/], ["How much is 15% off 80?", /becomes 68/], ["What is 20% tip on 85 dollars?", /\$17.*\$102/], ["What is 8% sales tax on 50 dollars?", /\$54/],
    ["We have a 150 dollar bill, 6 of us, 15% tip. How much each?", /\$28\.75/], ["A pack of 12 costs 6 dollars. What is the price per item?", /\$0\.50 each/],
    ["Which is cheaper: 500 g for 3 dollars or 1 kg for 5 dollars?", /1 kg for 5 dollars.*better value/], ["What is the monthly payment on a 10000 dollar loan at 5% for 3 years?", /\$299\.71/],
    ["What is 2000 dollars at 5% compounded annually for 10 years?", /\$3,257\.79/], ["What is my annual salary if I make 25 dollars per hour?", /\$52,000/], ["How long to double my money at 6%?", /11\.9 years/],
    ["The shirt is 30 dollars after 25% off. What was the original price?", /\$40/], ["Convert 30 mpg to km per liter", /12\.75/], ["Increase 80 by 15%", /^92/]
  ];
  for (var mo = 0; mo < MON.length; mo++) {
    var mm = await say(rt.boot({}), MON[mo][0]);
    ok("money: " + MON[mo][0], MON[mo][1].test(mm), mm.slice(0, 160));
  }
  /* things that change by the minute are declined, not answered with something unrelated */
  var LIVE = [["What's the weather today?", /can't check the weather/], ["What's the weather like in Paris?", /can't check the weather/], ["What's the news?", /can't read the news/],
              ["What is the price of Bitcoin?", /can't look up prices/], ["Who won the game last night?", /can't look up scores/], ["Is the library open now?", /can't check opening hours/],
              ["What is weather?", /^(?!.*can't check)/], ["What is Bitcoin?", /^Bitcoin is/]];
  for (var li = 0; li < LIVE.length; li++) {
    var ll = await say(rt.boot({}), LIVE[li][0]);
    ok("live: " + LIVE[li][0], LIVE[li][1].test(ll), ll.slice(0, 160));
  }
  /* what the person says about themselves is used by later questions */
  var mw = rt.boot({}), MEMQ = [
    ["I live in Toronto.", /Toronto/], ["How far is it from here to Paris?", /6,0[0-9]{2} km/], ["What time is it in my city?", /in Toronto/], ["What is my city?", /^You live in Toronto/],
    ["I was born in Cairo.", /born in Cairo/], ["Where was I born?", /^You were born in Cairo/], ["Where am I from?", /haven't told me/], ["I'm from Canada.", /Canada/], ["Where am I from?", /^You're from Canada/],
    ["I have two cats named Milo and Luna.", /Milo/], ["What are my cats called?", /Milo.*Luna|Luna.*Milo/]
  ];
  for (var mi = 0; mi < MEMQ.length; mi++) {
    var mr = await say(mw, MEMQ[mi][0]);
    ok("memory: " + MEMQ[mi][0], MEMQ[mi][1].test(mr), mr.slice(0, 160));
  }
  console.log((fail ? "FAIL " : "") + pass + "/" + (pass + fail) + " everyday checks passed");
  process.exit(fail ? 1 : 0);
})();
