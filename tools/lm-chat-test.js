/* Everyday reasoning (c4-lm-everyday.js) and conversation (c4-lm-converse.js)
 * through the shipping page stack. Items are development cases, NOT the
 * frozen held-out set (tools/lm-chat-heldout.json).
 *
 *   reasoning   rules (ponens, tollens, both fallacies named), categories
 *               with all / some / no, comparative chains, group properties,
 *               linear word problems, rates declined, possessions that
 *               change, clock / weekday / age arithmetic, equal amounts
 *   dialogue    the previous topic is NOT carried into a complete question
 *               ("why is the sky blue" after Hamlet) but IS carried into a
 *               real follow-up ("why?", "and Germany?")
 *   intents     feelings, wellbeing, self-questions, decisions, contrasts,
 *               magnitudes from stored attributes, riddles, open questions,
 *               honest how-to declines
 *   gate        a definition of a word the message merely contains is never
 *               the answer (bit, mean, cat for "why do cats purr")
 *   round 3     kinds, properties and abilities in one containment calculus
 *               (articles, "can", "have", typos, some+no -> not all);
 *               acquisitions and departures as changes; totals of a kind;
 *               portions of a whole; next day / month; "twice his age";
 *               life events and feelings with their cause; greetings back;
 *               comparisons by place in a series, by exact number, by a
 *               stand-in measure with its limit; opposites and rhymes from
 *               the lexicon; working shown for means and percentages
 */
"use strict";
var RT = require("./lm-runtime.js");
var win = RT.boot({});
var E = win.C4LMEveryday, CV = win.C4LMConverse;
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("  FAIL " + msg); } }
function solve(q) { var r = E.solve(q); return r ? r.text : ""; }

ok(!!(E && CV), "modules loaded");

/* ------------------------------------------------------------ reasoning */
ok(/^Not necessarily/.test(solve("If it rains, the ground gets wet. The ground is wet. Did it rain?")) &&
   /affirming the consequent/.test(solve("If it rains, the ground gets wet. The ground is wet. Did it rain?")), "affirming the consequent is named");
ok(/^Not necessarily/.test(solve("If it snows, school closes. It did not snow. Did school close?")) &&
   /denying the antecedent/.test(solve("If it snows, school closes. It did not snow. Did school close?")), "denying the antecedent is named");
ok(/^No\b/.test(solve("If I study, I pass. I didn't pass. Did I study?")), "modus tollens");
ok(/^Yes\b/.test(solve("If the alarm rings, I wake up. The alarm rang. Did I wake up?")), "modus ponens");
ok(/^Yes\b/.test(solve("All roses are flowers. All flowers are plants. Are all roses plants?")), "subset chain");
ok(/^Not necessarily/.test(solve("Some birds are red. Tweety is a bird. Is Tweety red?")), "some does not license a conclusion about one member");
ok(/^No\b/.test(solve("No reptiles are mammals. Sly is a reptile. Is Sly a mammal?")), "disjoint classes");
ok(/^Yes\b/.test(solve("If Ann is faster than Bea and Bea is faster than Cy, is Ann faster than Cy?")), "comparative chain in one sentence");
ok(/^Dee\b/.test(solve("Dee is richer than Eve. Eve is richer than Fay. Who is the richest?")), "superlative from a chain");
ok(/^Yes\b/.test(solve("Every player on the team scored. Max is a player on the team. Did Max score?")), "group property");
ok(/\$0\.10/.test(solve("A cup and a saucer cost $1.20 in total. The cup costs $1.00 more than the saucer. How much does the saucer cost?")), "sum-and-difference word problem");
ok(/^12\b/.test(solve("Zoe has three times as many shells as Leo. Leo has 4 shells. How many shells does Zoe have?")), "times as many");
ok(/^15\b/.test(solve("Kai is 4 years younger than Mia. Mia is 19. How old is Kai?")), "age difference");
ok(solve("Oranges cost 2 dollars per kilogram. How much do the oranges cost?") === "", "a rate is not an amount (declined)");
ok(/^4\b/.test(solve("I have 7 cookies and give away 3. How many are left?")), "loss verb");
ok(/^9\b/.test(solve("Nina has 6 stamps and buys 3 more. How many stamps does she have now?")), "gain verb");
ok(/6:15 pm/.test(solve("A concert starts at 4:45 pm and lasts 90 minutes. When does it end?")), "clock plus duration");
ok(/3:20 pm/.test(solve("What time is it 20 minutes after 3 pm?")), "duration before the time");
ok(/^Saturday/.test(solve("If today is Wednesday, what day will it be in 3 days?")), "weekday forward");
ok(/^Tuesday/.test(solve("What day was it 3 days before Friday?")), "weekday back from a named day");
ok(/31/.test(solve("How old will I be in 6 years if I'm 25 now?")), "age in N years");
ok(/^Neither/.test(solve("Which is heavier, a ton of bricks or a ton of feathers?")), "equal stated amounts");
ok(/^Not necessarily/.test(solve("Some dogs are big. A poodle is a dog. Is a poodle big?")), "a kind stated with an article");
ok(/^No\b/.test(solve("No birds have gills. A robin is a bird. Does a robin have gills?")), "a property ('have') excluded from a kind");
ok(/^No\b/.test(solve("No poets are robots. Some artists are poets. Can all artists be robots?")), "some A are S, no S is B: not all A are B");
ok(/every square is a rectangle/i.test(solve("All squares are rectangles. All rectangles are shapes. Are all squares shapes?")) &&
   !/\bsquar\b|rectangl\b/.test(solve("All squares are rectangles. All rectangles are shapes. Are all squares shapes?")), "answers show words, not stems");
ok(/^Yes\b/.test(solve("All squares are rectagnles. All rectangles are shapes. Are all squares shapes?")), "a transposed letter still names the class");
ok(/^11\b/.test(solve("Mia picked 15 apples and ate 4. How many apples does she have?")), "a first acquisition is the starting amount");
ok(/^18 people/.test(solve("There were 20 people on the bus. 6 got off and 4 got on. How many people are on the bus now?")), "departures and arrivals");
ok(/^12 pens/.test(solve("A box has 6 red pens, 4 blue pens and 2 black pens. How many pens are in the box?")), "counts of one kind added up");
ok(/^1\/2 of the cake/.test(solve("A cake is cut into 12 pieces. Tom eats 2 and Ann eats 4. What fraction is left?")), "portion of a whole, simplified");
ok(/^February/.test(solve("What month comes before March?")), "previous month");
ok(/^24\b/.test(solve("Tom is 12. His sister is twice his age. How old is his sister?")), "'twice his age' points back to Tom");
ok(/from tallest to shortest: Jack, Kim, Lee/.test(solve("Jack is taller than Kim. Kim is taller than Lee. Who is the shortest?")), "order stated in words");

/* ------------------------------------------------ dialogue and intents */
(async function () {
  async function ask(q) { var r = await RT.askOnce(win, q, 20000); return r; }
  await ask("Who wrote Hamlet?");
  var sky = await ask("Why is the sky blue?");
  ok(!/Hamlet|Shakespeare/.test(sky.text), "a complete why-question is not about the previous topic");
  await ask("What is photosynthesis?");
  var why = await ask("why?");
  ok(/light|energy|chlorophyll|sugar/i.test(why.text), "a bare 'why?' continues the previous topic (" + why.text.slice(0, 50) + ")");
  await ask("What is the capital of France?");
  var de = await ask("and Germany?");
  ok(/Berlin/.test(de.text), "parallel ellipsis still works");
  var claimT = await ask("Is it true that no birds can fly?");
  ok(!/France|Paris|Berlin/.test(claimT.text), "dummy 'it' does not drag the previous topic in");

  var stressed = await ask("I'm feeling really anxious about my interview.");
  ok(/sorry/i.test(stressed.text) && /interview/.test(stressed.text) && !/means\b/.test(stressed.text), "a feeling is met with empathy that names its cause");
  var bored = await ask("I'm bored");
  ok(/puzzle|riddle|fact/i.test(bored.text), "boredom gets something to do");
  var how = await ask("how are you doing?");
  ok(/\b(?:well|good|fine)\b/i.test(how.text), "wellbeing question answered");
  var feel = await ask("do you have emotions?");
  ok(/^No\b/.test(feel.text), "self-model: no feelings");
  var cap = await ask("what can you do?");
  ok(/logic|math/i.test(cap.text) && /\?$/.test(cap.text), "capabilities listed from the loaded modules");
  var dec = await ask("Should I learn Python or JavaScript first?");
  ok(/Python/.test(dec.text) && /JavaScript/.test(dec.text) && /depends/i.test(dec.text), "a decision weighs both options");
  var cmp = await ask("What's the difference between a planet and a star?");
  ok(/planet/i.test(cmp.text) && /star/i.test(cmp.text) && /while/.test(cmp.text), "a contrast defines both");
  var mag = await ask("Which is bigger, Jupiter or Earth?");
  ok(/^Jupiter is bigger/.test(mag.text) && /times/.test(mag.text), "magnitude from stored attributes, with the ratio");
  var rid = await ask("tell me a riddle");
  ok(/What am I\?/.test(rid.text), "a riddle is built from a definition");
  var life = await ask("What's the meaning of life?");
  ok(/open question/i.test(life.text) && !/sum of values/.test(life.text), "an open question is not answered with 'mean'");
  var cats = await ask("Why do cats purr?");
  ok(!/small domesticated/.test(cats.text), "a definition does not answer a why-question");
  var bit = await ask("I'm feeling a bit overwhelmed.");
  ok(!/unit of information/.test(bit.text), "'a bit' in a feeling is not the unit of information");

  /* round 3: conversation and knowledge */
  var hi = await ask("hi!");
  ok(/^Hi!/.test(hi.text), "a bare greeting is greeted back");
  var bye = await ask("thanks, bye!");
  ok(/welcome|any time|happy to help/i.test(bye.text) && /bye/i.test(bye.text), "thanks with a goodbye");
  var cat = await ask("I'm so sad, my cat died.");
  ok(/sorry to hear that your cat died/.test(cat.text) && !/small domesticated/.test(cat.text), "a feeling with its cause: the event is answered");
  var promo = await ask("I got promoted today!");
  ok(/^Congratulations/.test(promo.text), "good news is congratulated");
  var fail1 = await ask("I failed my math test.");
  ok(/sorry to hear that you failed your math test/.test(fail1.text), "a setback is met with sympathy");
  var far = await ask("Which is farther from the Sun, Jupiter or Saturn?");
  ok(/^Saturn is farther/.test(far.text) && /sixth/.test(far.text), "place in an ordered series");
  var heavy = await ask("Which is heavier, the Sun or the Earth?");
  ok(/very likely heavier/.test(heavy.text) && /doesn't settle mass/.test(heavy.text), "a stand-in measure, with its limit said");
  var frac = await ask("Which is bigger, 3/4 or 2/3?");
  ok(/^3\/4 is bigger/.test(frac.text) && /9\/12/.test(frac.text), "numbers compared exactly");
  var opp = await ask("What's the opposite of hot?");
  ok(/\bcold\b/.test(opp.text), "an opposite from gloss alignment");
  var rhyme = await ask("What rhymes with cat?");
  ok(/\b(?:that|chat|flat)\b/.test(rhyme.text) && !/\bwhat\b/.test(rhyme.text), "rhymes by spelling, without w+a");
  var me = await ask("tell me about yourself");
  ok(/CELL4/.test(me.text), "self-introduction");
  var avg = await ask("What's the average of 4, 8 and 12?");
  ok(/mean is 8/.test(avg.text) && /24 ÷ 3/.test(avg.text), "a list ending in 'and' is read whole, with the working");
  var mia = await ask("Mia picked 15 apples and ate 4. How many apples does she have?");
  ok(/^11 apples/.test(mia.text) && !/1365/.test(mia.text), "'picked' in a possession problem is not a combination");
  var pct = await ask("What is 15% of 200?");
  ok(/0\.15 × 200 = 30/.test(pct.text), "a percentage shows what it means");
  var whale = await ask("Is a whale a fish or a mammal?");
  ok(/^A whale is a mammal, not a fish/.test(whale.text), "which of two kinds, from the definition");
  var sleep = await ask("Why do we sleep?");
  ok(/why we sleep/.test(sleep.text), "an honest why-decline says what it could not explain");
  var purpose = await ask("What's the purpose of existence?");
  ok(/open question/i.test(purpose.text), "the purpose of existence is an open question");
  var everest = await ask("What's the tallest mountain in the world?");
  ok(/Everest/.test(everest.text), "a superlative stated in a definition");
  var age = await ask("How old is the Earth?");
  ok(/^Earth is about 4\.54 billion years old/.test(age.text), "an age answers 'how old' first");
  var dinner = await ask("What should I eat for dinner?");
  ok(/don't know your taste/.test(dinner.text), "a recommendation asks for taste instead of guessing");
  var brk = await ask("Is it bad to skip breakfast?");
  ok(/whether it's bad to skip breakfast/.test(brk.text), "a value judgement about an action is declined honestly");

  console.log("lm-chat-test: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
