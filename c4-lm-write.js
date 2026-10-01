/* CELL4 writing helpers: spelling out words, counting, rhymes, words by letter, and short poems
 * (haiku, limerick, acrostic, rhyming verse) assembled from phrase banks whose syllable counts are checked.
 * Local only; no outside service. */
(function (root) {
  "use strict";

  function res(answer, schema, confidence) { return { answer: answer, steps: [], schema: schema, confidence: confidence || 0.82 }; }
  function clean(t) { return String(t || "").replace(/\s+/g, " ").trim(); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---- syllables: vowel groups, with the usual silent-e and -le endings */
  function syllables(word) {
    var w = String(word).toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return 0;
    var OVR = { quiet: 2, poem: 2, science: 2, owl: 1, our: 1, hour: 1, hours: 1, fire: 1, fireflies: 2, every: 2, flower: 2, power: 2, tower: 2, shower: 2, lion: 2, being: 2, create: 2, heron: 2, poet: 2, idea: 3, area: 3, real: 1, people: 2, beautiful: 3, wonderful: 3, different: 3, interesting: 4, evening: 2, family: 3, camera: 3, chocolate: 3, vegetable: 4 };
    if (OVR[w] !== undefined) return OVR[w];
    if (w.length <= 3) return 1;
    /* a final silent e or es/ed that adds no syllable */
    if (/[^aeiouy]ed$/.test(w) && !/[td]ed$/.test(w)) w = w.slice(0, -2);
    else if (/[^aeiouy]les$/.test(w)) { /* puddles, tables: the es is a syllable */ }
    else if (/[^aeiouysxzcgh]es$/.test(w) || /(?:[^aeiouylsxzcg]|[^c]h)es$/.test(w) && !/[sxzc]hes$/.test(w)) w = w.slice(0, -2);
    else if (/[^aeiouyl]e$/.test(w) && !/[^aeiouy]le$/.test(w)) w = w.slice(0, -1);
    else if (/[aeiouy]le$/.test(w)) w = w.slice(0, -1);
    w = w.replace(/^y/, "").replace(/([^aeiouy])y(?=ing)/g, "$1y_").replace(/(?:ia|io|iu|ua|uo|eo)(?=[^aeiouy]|$)/g, function (m) { return m.charAt(0) + "-" + m.charAt(1); }).replace(/-/g, "i");
    var g = w.match(/[aeiouy]+/g);
    return g ? g.length : 1;
  }
  function lineSyl(line) { return String(line).split(/\s+/).filter(Boolean).reduce(function (n, w) { return n + syllables(w); }, 0); }

  /* ---- spelling and counting */
  function spellQ(t) {
    var l = t.toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/^(?:please )?(?:spell|spell out)(?: the word| the name)?\s+["']?([a-z'-]{1,30})["']?$/)) || (m = l.match(/^how (?:do you|do i|to|would you) spell\s+(?:the word )?["']?([a-z'-]{1,30})["']?$/)) || (m = l.match(/^what(?:'s| is) the spelling of\s+["']?([a-z'-]{1,30})["']?$/))) {
      var w = m[1].replace(/^'+|'+$/g, "");
      return res(w + " is spelled " + w.toUpperCase().replace(/[^A-Z']/g, "").split("").join("-") + ".", "spell", 0.85);
    }
    return null;
  }
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
  function nn(x) { return /^\d+$/.test(x) ? +x : NUMW[x]; }
  function countQ(t) {
    var l = t.toLowerCase().replace(/[?.!]+$/, ""), m, a, b, step, out, i;
    if ((m = l.match(/^(?:please )?count (?:up )?(?:from (\w+) )?to (\w+)(?: by (\w+)s?)?$/))) {
      step = m[3] ? nn(m[3].replace(/s$/, "")) : 1; a = m[1] ? nn(m[1]) : (m[3] ? step : 1); b = nn(m[2]);
      if (a === undefined || b === undefined || !step || b < a || (b - a) / step > 100) return null;
      out = []; for (i = a; i <= b; i += step) out.push(i);
      return res(out.join(", "), "count");
    }
    if ((m = l.match(/^(?:please )?count (?:backwards?|down)(?: from (\w+))?(?: to (\w+))?$/))) {
      a = m[1] ? nn(m[1]) : 10; b = m[2] ? nn(m[2]) : 1;
      if (a === undefined || b === undefined || a < b || a - b > 100) return null;
      out = []; for (i = a; i >= b; i--) out.push(i);
      return res(out.join(", "), "count");
    }
    if ((m = l.match(/^(?:please )?count by (\w+)s? (?:from (\w+) )?to (\w+)$/))) {
      step = nn(m[1].replace(/s$/, "")); a = m[2] ? nn(m[2]) : step; b = nn(m[3]);
      if (!step || a === undefined || b === undefined || b < a || (b - a) / step > 100) return null;
      out = []; for (i = a; i <= b; i += step) out.push(i);
      return res(out.join(", "), "count");
    }
    return null;
  }

  /* ---- text transforms and counts on a quoted or colon-introduced string */
  function textQ(t) {
    var m, str, q = "[\"“'‘]", Q = "[\"”'’]";
    function grab(x) { return x.replace(new RegExp("^" + q + "|" + Q + "$", "g"), "").trim(); }
    if ((m = t.match(new RegExp("^(?:please )?(?:convert|change|make|turn|write|put|transform)\\s+(?:the (?:text|sentence|word|phrase|string) )?[:]?\\s*(.+?)\\s+(?:(?:to|into|in|as)\\s+)?(upper ?case|lower ?case|all caps|capital letters|title ?case|sentence case)\\.?$", "i"))) && m[1].length < 200) {
      str = grab(m[1]); if (/^(?:it|this|that|them|these|those)$/i.test(str)) return null;
      return res(applyCase(str, m[2]), "text", 0.85);
    }
    if ((m = t.match(/^(?:please )?(upper ?case|lower ?case|capitali[sz]e|title ?case)\s+(?:the (?:text|sentence|word|phrase|string)[:\s]*)?(.+?)\.?$/i)) && m[2].length < 200) {
      return res(applyCase(grab(m[2]), m[1]), "text", 0.85);
    }
    if ((m = t.match(/^(?:please )?(capitali[sz]e|uppercase|lowercase|title[- ]?case)\s+the (?:sentence|text|word|phrase|string)\s*[:\-]\s*(.+?)\.?$/i))) return res(applyCase(grab(m[2]), m[1]), "text", 0.85);
    if ((m = t.match(/^(?:please )?(?:reverse|flip)\s+(?:the (?:text|word|string|phrase)\s*)?[:\s]*["“']?(.+?)["”']?\.?$/i)) && m[1].length < 120 && !/\b(?:list|array|order|sort)\b/i.test(m[1])) return res(m[1].split("").reverse().join(""), "text", 0.8);
    if ((m = t.match(/^how many (words|characters|letters|vowels|consonants|spaces)\s+(?:are |is )?(?:there )?(?:in|does)\s+(?:the (?:text|sentence|phrase|string)\s*)?[:\s]*(.+?)(?:\s+have|\s+contain)?\??$/i)) && /["“'‘:]/.test(t)) {
      str = grab(m[2].replace(/^[:\s]+/, ""));
      var kind = m[1].toLowerCase(), n;
      if (kind === "words") n = str.split(/\s+/).filter(Boolean).length;
      else if (kind === "characters") n = str.length;
      else if (kind === "letters") n = (str.match(/[a-z]/gi) || []).length;
      else if (kind === "vowels") n = (str.match(/[aeiou]/gi) || []).length;
      else if (kind === "consonants") n = (str.match(/[b-df-hj-np-tv-z]/gi) || []).length;
      else n = (str.match(/ /g) || []).length;
      return res(String(n), "text", 0.85);
    }
    if ((m = t.match(/^(?:please )?(?:remove|delete|strip) (?:all )?(?:the )?(vowels|spaces|punctuation|digits|numbers) (?:from|in)\s+["“']?(.+?)["”']?\.?$/i))) {
      var what = m[1].toLowerCase(), src = m[2], rx = what === "vowels" ? /[aeiou]/gi : what === "spaces" ? /\s/g : what === "punctuation" ? /[^\w\s]/g : /\d/g;
      return res(src.replace(rx, ""), "text", 0.8);
    }
    if ((m = t.match(/^(?:please )?replace (?:all )?["“']?(.+?)["”']? with ["“']?(.+?)["”']? in ["“']?(.+?)["”']?\.?$/i))) return res(m[3].split(m[1]).join(m[2]), "text", 0.8);
    return null;
  }
  function applyCase(str, how) {
    how = String(how).toLowerCase().replace(/\s+/g, "");
    if (/upper|allcaps|capitalletters/.test(how)) return str.toUpperCase();
    if (/lower/.test(how)) return str.toLowerCase();
    if (/title/.test(how)) return str.toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /* ---- grammar correction by rule */
  var IRREG_PAST = { go: "went", eat: "ate", see: "saw", have: "had", do: "did", make: "made", take: "took", come: "came", run: "ran", buy: "bought", get: "got", give: "gave", write: "wrote", say: "said", tell: "told", think: "thought", know: "knew", find: "found", leave: "left", sit: "sat", stand: "stood", drink: "drank", sing: "sang", swim: "swam", begin: "began", bring: "brought", teach: "taught", speak: "spoke", drive: "drove", ride: "rode", fall: "fell", feel: "felt", meet: "met", pay: "paid", send: "sent", sleep: "slept", win: "won", wear: "wore", lose: "lost", read: "read", sell: "sold", build: "built", break: "broke", choose: "chose", fly: "flew", forget: "forgot", grow: "grew", hear: "heard", keep: "kept", sleep2: "slept" };
  var REG_VERBS = "walk talk play watch visit work study call help want need like love look ask use try start stay move open close clean cook jump laugh listen live wait wash answer arrive decide enjoy finish follow learn order plan pull push remember rest save show stop turn travel carry cry dance end happen invite join kick kiss lift mark miss offer pick pray prefer pass reach receive repeat shop skip smile snow stir talk touch trust wish yell".split(" ");
  var PAST_MARK = /\b(?:yesterday|last (?:night|week|month|year|summer|winter|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d+ (?:days?|weeks?|months?|years?|hours?|minutes?) ago|in (?:19|20)\d\d|earlier today|this morning)\b/i;
  function pastOf(v) { v = v.toLowerCase(); if (IRREG_PAST[v]) return IRREG_PAST[v]; if (REG_VERBS.indexOf(v) < 0) return null; return /e$/.test(v) ? v + "d" : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ied" : v + "ed"; }
  function thirdOf(v) { v = v.toLowerCase(); if (v === "have") return "has"; if (v === "do") return "does"; if (v === "go") return "goes"; return /(?:s|x|z|ch|sh)$/.test(v) ? v + "es" : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ies" : v + "s"; }
  var BASE_VERBS = Object.keys(IRREG_PAST).concat(REG_VERBS).join("|");
  function fixGrammar(text) {
    var t = text, notes = [], before;
    function rule(re, rep, note) { before = t; t = t.replace(re, rep); if (t !== before) notes.push(note); }
    rule(/\b(\w+(?:\s+\w+)?)\s+of\s+(?:the\s+)?(?=\w)/g, function (m) { return m; }, "");
    notes.length = 0;
    rule(/\b(should|could|would|must|might) of\b/gi, "$1 have", "“" + "should of" + "” should be “should have”");
    rule(/\balot\b/gi, "a lot", "“alot” is two words: “a lot”");
    rule(/\b(\w+) (?:and|&) me (is|are|was|were|go|went|like|have|want)\b/gi, function (m, a, v) { return /^(?:me|him|her|them|us)$/i.test(a) ? m : a + " and I " + v; }, "use “I”, not “me”, in a compound subject");
    rule(/\bme and (him|her|them|my (?:friend|brother|sister|mom|dad|mother|father|wife|husband)|\w+)\s+(is|are|was|were|am)\b/gi, function (m, o, v) { var map = { him: "he", her: "she", them: "they" }; var subj = map[o.toLowerCase()] ? map[o.toLowerCase()] : o; subj = subj.charAt(0).toUpperCase() + subj.slice(1); var pl = /^(?:is|am)$/i.test(v) ? "are" : (/^was$/i.test(v) ? "were" : v); return subj + " and I " + pl; }, "“me and him” as a subject should be “he and I”, with a plural verb");
    rule(/\b(him|her|them) and I\b(?=\s+(?:are|is|was|were|went|go|have))/gi, function (m, o) { return { him: "He", her: "She", them: "They" }[o.toLowerCase()] + " and I"; }, "use a subject pronoun");
    rule(/\b(i)\b(?!['’]|\.)/g, "I", "the pronoun “I” is always capitalised");
    rule(/\b(?:i|I) seen\b/g, "I saw", "“I seen” should be “I saw”");
    rule(/\b(?:i|I) done\b/g, "I did", "“I done” should be “I did”");
    rule(/\b(they|we|you) was\b/gi, function (m, p) { return p + " were"; }, "“" + "they/we/you was" + "” should be “were”");
    rule(/\b(?:your) (welcome|going|coming|right|wrong|late|here|not|very|so|being)\b/gi, "you're $1", "“you're” (you are) is not “your”");
    rule(/\byou're (book|car|house|dog|cat|friend|name|phone|mother|father|idea|turn)\b/gi, "your $1", "“your” shows possession");
    rule(/\bits (a|an|the|not|been|going|time|my|raining|very|so|too|really|just|only|true)\b/gi, "it's $1", "“it's” is short for “it is”");
    rule(/\bit's (tail|color|colour|name|own|head|owner|size|shape)\b/gi, "its $1", "“its” shows possession");
    rule(/\bthere (going|coming|not|late|here|friends|house|car)\b(?!\s+(?:is|are))/gi, function (m, w) { return /^(?:house|car|friends)$/i.test(w) ? "their " + w : "they're " + w; }, "“they're” means they are, “their” shows possession");
    rule(/\btheir (is|are|was|were)\b/gi, "there $1", "“there is/are”, not “their”");
    rule(/\bthey're (house|car|dog|cat|friends|book|names?|parents)\b/gi, "their $1", "“their” shows possession");
    rule(/\b(better|more|less|bigger|smaller|faster|slower|larger|older|younger|taller|rather|other|worse) then\b/gi, "$1 than", "“than” is for comparisons, “then” is for time");
    rule(/\bless (people|books|cars|friends|apples|mistakes|students|items|things|children|dogs|cats)\b/gi, "fewer $1", "use “fewer” with things you can count");
    rule(/\b(don't|doesn't|can't|couldn't|won't|wouldn't|didn't|haven't|hasn't) (?:have|get|want|see|know|do|need) no\b/gi, function (m) { return m.replace(/ no$/i, " any"); }, "avoid a double negative");
    rule(/\b(a) ([aeiou]\w+)/gi, function (m, art, w) { return /^(?:one|once|use|used|user|useful|usual|unit|union|unique|uniform|university|universe|european|eu)/i.test(w) ? m : (art === "A" ? "An " : "an ") + w; }, "use “an” before a vowel sound");
    rule(/\b(an) ([b-df-hj-np-tv-z]\w+)/gi, function (m, art, w) { return /^(?:hour|honest|honor|honour|heir)/i.test(w) ? m : (art === "An" ? "A " : "a ") + w; }, "use “a” before a consonant sound");
    rule(/\b(he|she|it|everyone|everybody|someone|somebody|nobody|each) (don't)\b/gi, "$1 doesn't", "use “doesn't” with he, she and it");
    rule(new RegExp("\\b(he|she|it|everyone|everybody|someone|somebody|nobody|each) (" + BASE_VERBS + "|want|need|like|love|know|think|live|play|work|study|walk|read|write|speak|talk|come|run|eat|make|take|get|give|find|say|tell|try|use|ask|help|call|feel|leave|keep|begin|seem|turn|start|have|do|go)\\b(?!\\w)", "gi"), function (m, subj, v) {
      if (/^(?:he|she|it|everyone|everybody|someone|somebody|nobody|each)$/i.test(subj) && !/s$/i.test(v) && !PAST_MARK.test(t)) return subj + " " + thirdOf(v);
      return m;
    }, "use the “-s” form of the verb with he, she and it");
    if (PAST_MARK.test(t)) {
      /* a present-tense verb after the subject in a sentence about the past */
      before = t;
      t = t.replace(new RegExp("\\b(I|you|we|they|he|she|it|[A-Z][a-z]+)\\s+(" + BASE_VERBS + ")(es|s)?\\b", "g"), function (m, subj, v, suf) {
        var pv = pastOf(v); if (!pv) return m;
        if (/^[A-Z][a-z]+$/.test(subj) && /^(?:The|A|An|This|That|My|His|Her|Their)$/.test(subj)) return m;
        return subj + " " + pv;
      });
      if (t !== before) notes.push("the sentence is about the past, so the verb takes the past tense");
    }
    t = t.replace(/\s{2,}/g, " ").trim();
    if (/^[a-z]/.test(t)) { t = t.charAt(0).toUpperCase() + t.slice(1); notes.push("a sentence starts with a capital letter"); }
    if (!/[.!?]$/.test(t)) { t += "."; notes.push("a sentence ends with punctuation"); }
    return { text: t, notes: notes };
  }
  function grammarQ(t) {
    var m = t.match(/^(?:please )?(?:correct|fix|proofread|edit|improve|check)\s+(?:the |this |my )?(?:grammar|spelling|sentence|text|english)?(?:\s+(?:of|in)\s+(?:the |this |my )?(?:sentence|text))?\s*[:\-]\s*["“']?(.+?)["”']?$/i) || t.match(/^is (?:this|the following)(?: sentence)? (?:grammatically )?correct\s*[:\-]\s*["“']?(.+?)["”']?\??$/i);
    if (!m || m[1].length > 300) return null;
    var asked = /^is /i.test(t), src = m[1].trim(), r = fixGrammar(src);
    var same = r.text.replace(/[.!?]$/, "") === src.replace(/[.!?]$/, "");
    if (same || r.notes.length === 0) return res(asked ? "Yes, that looks grammatical." : "That sentence looks correct: " + src, "grammar", 0.7);
    var real = r.notes.filter(Boolean);
    return res((asked ? "Not quite. A corrected version: " : "") + r.text + (real.length ? "\nWhy: " + real.slice(0, 3).join("; ") + "." : ""), "grammar", 0.72);
  }

  /* ---- ideas and names from banks */
  var IDEAS = [
    [/\b(?:pet|dog|puppy|cat|kitten|goldfish|fish|hamster|rabbit|bunny|bird|parrot|horse|turtle|guinea pig)\b.*\bnames?\b|\bnames?\b.*\b(?:pet|dog|puppy|cat|kitten|goldfish|fish|hamster|rabbit|bird|parrot|horse|turtle)\b/i, ["Buddy", "Luna", "Max", "Bella", "Milo", "Coco", "Rocky", "Daisy", "Oscar", "Ginger", "Bubbles", "Finn", "Nugget", "Pepper", "Willow", "Sushi", "Captain", "Splash"], "name"],
    [/birthday party|party ideas?|party theme/i, ["a backyard barbecue with lawn games", "a scavenger hunt around the neighbourhood", "a movie night with popcorn and blankets", "bowling or mini golf", "a board-game or card-game party", "a baking or pizza-making party", "a picnic in the park", "an escape room", "a karaoke night", "a craft or pottery workshop"], "idea"],
    [/\bgifts?\b/i, ["a book chosen for their interests", "a houseplant", "a handwritten letter with a small treat", "a good mug with tea or coffee", "a personalised photo frame or photo book", "a gift card for a favourite shop", "an experience such as a cooking class or concert tickets", "homemade baked goods", "a cozy blanket", "a nice notebook and pen"], "idea"],
    [/\bdate (?:ideas?|night)|first date|romantic\b/i, ["a picnic in the park", "cooking dinner together", "a museum or gallery visit", "a sunset hike", "stargazing", "a farmers' market stroll", "a board-game night", "mini golf or bowling", "a coffee-shop book crawl", "a dance or pottery class"], "idea"],
    [/\bhobbies?\b|\bhobby\b|\bthings to do (?:when|if) (?:i'?m|i am|you are) bored\b|\bwhen bored\b/i, ["drawing or sketching", "gardening", "journaling", "hiking", "learning a musical instrument", "photography", "baking", "chess", "learning to code", "birdwatching", "knitting", "learning a language"], "idea"],
    [/\bhealthy snacks?\b|\bsnack ideas?\b|\bsnacks?\b/i, ["an apple with peanut butter", "yogurt with berries", "carrots and hummus", "a handful of nuts", "air-popped popcorn", "cheese with whole-grain crackers", "a hard-boiled egg", "a banana", "cottage cheese with fruit", "roasted chickpeas"], "idea"],
    [/\b(?:programming|coding|software|app|web) projects?\b|\bproject ideas?\b.*\b(?:code|coding|programming|beginner)\b|\bbeginner projects?\b/i, ["a to-do list app", "a weather app using a public API", "a calculator", "tic-tac-toe or hangman", "a personal website", "a URL shortener", "a quiz game", "an expense tracker", "a simple chatbot", "a snake game"], "idea"],
    [/\bside hustles?\b|\bways to make (?:extra )?money\b|\bmake money\b|\bearn money\b/i, ["freelance writing, design or programming", "tutoring", "selling crafts online", "pet sitting or dog walking", "delivery driving", "photography", "managing social media for small businesses", "reselling thrift-store finds", "house or garden help", "teaching a skill online"], "idea"],
    [/\bice ?breakers?\b|\bconversation starters?\b|\bget to know\b/i, ["If you could travel anywhere tomorrow, where would you go?", "What is the best meal you have ever had?", "What was your first job?", "Which book or film changed how you think?", "What skill would you like to learn?", "What is your favourite way to spend a free weekend?", "If you could have dinner with anyone, who would it be?", "What is something you are looking forward to?"], "question"],
    [/\bstory (?:ideas?|prompts?)\b|\bwriting prompts?\b|\bstory about\b/i, ["A lighthouse keeper finds a message in a bottle addressed to them.", "Two strangers swap phones by mistake on a train.", "A town wakes up to find every clock stopped at the same time.", "A child discovers a door in the garden that was not there yesterday.", "An astronaut hears a familiar song on a silent planet.", "A baker's bread begins to grant small wishes."], "prompt"],
    [/\bworkouts?\b|\bexercises?\b.*\bat home\b|\bat[- ]home exercises?\b|\bhome workouts?\b/i, ["push-ups", "bodyweight squats", "lunges", "planks", "jumping jacks", "burpees", "mountain climbers", "glute bridges", "tricep dips on a chair", "high knees"], "idea"],
    [/\bweekend (?:activities|ideas|plans)\b|\bthings to do (?:this|on the) weekend\b|\bactivities for\b.*\bkids?\b|\bwith kids\b/i, ["a picnic or park day", "a nature walk and leaf collection", "baking together", "a living-room fort and movie", "a museum or library visit", "a scavenger hunt", "painting or crafts", "a trip to the zoo or a farm", "a board-game afternoon", "building something from cardboard"], "idea"],
    [/\bteam names?\b|\bband names?\b|\bgroup names?\b/i, ["The Night Owls", "Thunder Bolts", "The Rolling Stones' cousins", "Blue Horizon", "The Quiet Storm", "Paper Tigers", "Neon Echo", "The Wild Cards", "Copper Hearts", "Silver Foxes"], "name"],
    [/\bbusiness names?\b|\bcompany names?\b|\bstartup names?\b/i, ["Bright Harbor", "North Star Studio", "Willow & Wren", "Bluebird Labs", "Maple Lane Co.", "Quill & Compass", "Evergreen Works", "Copper Kettle"], "name"],
    [/\bbaby names?\b/i, ["Olivia", "Noah", "Amelia", "Liam", "Sophia", "Elijah", "Isla", "Lucas", "Harper", "Mason"], "name"],
    [/\bstudy (?:tips|techniques|methods|ideas)\b|\bways to study\b/i, ["test yourself with practice questions", "space your study over several days", "explain the topic aloud in your own words", "teach it to someone else", "use short focused sessions with breaks", "sleep well before an exam", "make a one-page summary", "mix up topics rather than blocking"], "idea"]
  ];
  var NUMWORD = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, few: 3, some: 5, several: 5 };
  function ideasQ(t) {
    var m = t.match(/^(?:please )?(?:can you |could you )?(?:give me|suggest|think of|list|brainstorm|come up with|recommend|what are|i need|i want|any|show me|tell me)\s+(?:me\s+)?(?:(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|a few|few|some|several)\s+)?(?:(?:good|fun|cool|creative|simple|easy|great|unique|cute|funny|nice|healthy|best|popular)\s+)*(.+?)[?.!]*$/i);
    if (!m) { m = t.match(/^(?:please )?(?:can you |could you )?(suggest|think of|come up with|recommend)\s+(?:me\s+)?(?:a|an|one)\s+(?:good |fun |cool |cute |funny |nice )*(.+?)[?.!]*$/i); if (m) m = [m[0], "1", m[2]]; }
    if (!m || !/\b(?:ideas?|names?|suggestions?|gifts?|activities|snacks?|projects?|prompts?|workouts?|hobbies|hobby|tips|starters?|icebreakers?|questions?|ways|things)\b|\bname\b/i.test(m[2]) && !/\b(?:snacks?|hobbies|gifts?)\b/i.test(t)) return null;
    if (/\b(?:ideas?|names?)\b/i.test(m[2]) === false && !/\b(?:snacks?|hobbies|gifts?|workouts?|prompts?|questions?|starters?|icebreakers?)\b/i.test(m[2])) return null;
    var n = m[1] ? (/^\d+$/.test(m[1]) ? +m[1] : (NUMWORD[m[1].toLowerCase()] || 5)) : (/^(?:suggest|think of|come up with|recommend)\s+(?:me\s+)?(?:a|an|one)\b/i.test(t) ? 1 : 5);
    n = Math.max(1, Math.min(n, 10));
    for (var i = 0; i < IDEAS.length; i++) if (IDEAS[i][0].test(t)) {
      var bank = IDEAS[i][1].slice(), k = (ix.poem = (ix.poem || 0) + 1) % bank.length, pick = [];
      for (var j = 0; j < n && j < bank.length; j++) pick.push(bank[(k + j) % bank.length]);
      var endp = function (x) { return /[.?!]$/.test(x) ? x : x; };
      if (n === 1) return res("How about " + (IDEAS[i][2] === "prompt" || IDEAS[i][2] === "question" ? "this: " + cap(pick[0]) : (/^[A-Z]/.test(pick[0]) && IDEAS[i][2] === "name" ? pick[0] : pick[0].replace(/^a /, "a "))) + (/[.?!]$/.test(pick[0]) ? "" : "?"), "ideas", 0.72);
      return res(pick.map(function (x, q) { return (q + 1) + ". " + cap(endp(x)); }).join("\n"), "ideas", 0.72);
    }
    return null;
  }

  /* ---- rhymes: words grouped by their ending sound */
  var RIMES = [
    "at|cat bat hat mat rat sat flat chat fat pat that brat splat", "an|man can fan pan plan ran tan van clan span", "ay|day say way play stay gray may pay hay lay ray tray spray",
    "ake|cake make take lake bake shake wake snake rake break", "ight|night light right fight bright sight tight flight might kite white", "ee|tree see bee free three knee flee key sea tea",
    "ine|line mine fine shine pine wine nine vine sign divine", "ow|go show know slow snow grow flow glow throw low toe", "oon|moon soon spoon tune noon balloon cartoon", "ound|sound ground round found sound hound pound around",
    "ore|more door floor store shore score core bore roar four", "ove|love dove glove above shove", "ing|sing ring king wing bring spring thing swing string", "ell|bell tell well sell shell smell spell yell fell",
    "ain|rain train brain plain chain main pain gain lane cane", "ear|hear near dear fear year clear cheer beer here", "og|dog log frog fog jog hog blog", "un|sun fun run bun done one gun spun", "ig|big pig dig wig fig jig twig",
    "ake|snake", "ed|bed red head said bread lead dead thread spread", "ill|hill will fill still bill chill kill mill thrill", "eat|eat heat meat seat beat feet street sweet neat treat", "own|town down brown crown clown frown gown",
    "ar|car star far jar bar scar guitar", "ool|cool pool school rule tool fool", "ake|ache", "ock|rock clock sock lock block knock shock dock", "ay|hey", "ew|new few blue true glue flew grew view crew do two too shoe", "all|ball tall wall fall call small hall",
    "ose|rose nose close those goes toes", "ook|book look cook hook took shook brook", "ish|fish dish wish swish", "ide|ride side wide hide pride slide guide tide", "ace|face place race space grace lace case", "eam|dream team cream stream beam steam",
    "ame|name game same flame fame came frame tame", "ate|late gate date plate great state wait eight weight", "ent|tent went bent sent spent rent", "old|gold cold hold old bold told fold sold", "ool|stool"
  ];
  var RIME_MAP = {};
  RIMES.forEach(function (r) { var p = r.split("|"); p[1].split(" ").forEach(function (w) { (RIME_MAP[w] = RIME_MAP[w] || []).push(p[0]); }); });
  var RIME_WORDS = {};
  RIMES.forEach(function (r) { var p = r.split("|"); RIME_WORDS[p[0]] = (RIME_WORDS[p[0]] || []).concat(p[1].split(" ")); });
  function rhymeQ(t) {
    var l = t.toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:what|which words?|give me (?:some )?words?(?: that)?|name (?:some )?words?(?: that)?|list (?:some )?words?(?: that)?|any words?(?: that)?)\s*(?:rhymes?|rhyme) with\s+["']?([a-z]+)["']?$/)) && !(m = l.match(/^(?:what )?rhymes? with\s+["']?([a-z]+)["']?$/)) && !(m = l.match(/^(?:give me|find|name) (?:a |some )?rhymes? (?:for|with)\s+["']?([a-z]+)["']?$/))) return null;
    var w = m[1], rimes = RIME_MAP[w], found = [];
    if (!rimes) {
      var suff = Object.keys(RIME_WORDS).filter(function (r) { return w.length > r.length && w.slice(-r.length) === r; }).sort(function (a, b) { return b.length - a.length; });
      rimes = suff.slice(0, 1);
    }
    (rimes || []).forEach(function (r) { RIME_WORDS[r].forEach(function (x) { if (x !== w && found.indexOf(x) < 0) found.push(x); }); });
    if (!found.length) return null;
    return res("Words that rhyme with " + w + ": " + found.slice(0, 8).join(", ") + ".", "rhyme", 0.8);
  }

  /* ---- words by letter / ending / length */
  function vocab() {
    var T = root.C4LMThesaurus, out = {};
    if (T && T.all) T.all().forEach(function (w) { if (/^[a-z]+$/.test(w)) out[w] = 1; });
    ["quiet", "queen", "quick", "question", "quilt", "quarter", "quest", "quote", "quartz", "quail"].forEach(function (w) { out[w] = 1; });
    ["xylophone", "xenon", "x-ray"].forEach(function (w) { out[w] = 1; });
    ["zebra", "zoo", "zero", "zone", "zigzag", "zest", "zipper", "zinc"].forEach(function (w) { out[w] = 1; });
    ["umbrella", "uncle", "under", "unicorn", "universe", "unit", "useful", "usual"].forEach(function (w) { out[w] = 1; });
    ["yellow", "yesterday", "yard", "yarn", "young", "yogurt", "yawn", "year"].forEach(function (w) { out[w] = 1; });
    ["jungle", "jelly", "jacket", "journey", "juice", "jump", "jewel", "joy"].forEach(function (w) { out[w] = 1; });
    ["kitchen", "kangaroo", "kettle", "kite", "knight", "koala", "key", "kindness"].forEach(function (w) { out[w] = 1; });
    ["vase", "valley", "velvet", "village", "violin", "volcano", "voyage", "vivid"].forEach(function (w) { out[w] = 1; });
    return Object.keys(out).sort();
  }
  function wordsQ(t) {
    var l = t.toLowerCase().replace(/[?.!]+$/, ""), m, pool, hits, n;
    if ((m = l.match(/^(?:give me|name|list|tell me|think of|find|what(?:'s| is))\s+(?:a |an |some |any |\d+ |three |two |five )?words?(?: that)?\s+(?:starts?|starting|begins?|beginning) with(?: the letter)?\s+["']?([a-z])["']?$/)) ||
        (m = l.match(/^(?:give me|name|list|tell me|think of|find)\s+(?:a |an |some |any )?words?\s+(?:that )?(?:starts?|begins?) with(?: the letter)?\s+["']?([a-z])["']?$/))) {
      pool = vocab(); hits = pool.filter(function (w) { return w.charAt(0) === m[1]; });
      if (!hits.length) return null;
      n = /\b(?:a|an|one)$/.test(l.split(" word")[0].trim()) ? 1 : 5;
      return res((n === 1 ? "A word that starts with " + m[1].toUpperCase() + ": " + hits[0] : "Words that start with " + m[1].toUpperCase() + ": " + hits.slice(0, 5).join(", ")) + ".", "words", 0.75);
    }
    if ((m = l.match(/^(?:give me|name|list|tell me|think of|find)\s+(?:a |an |some |any )?words?\s+(?:that )?(?:ends?|ending) (?:with|in)\s+["'-]?([a-z]{1,4})["']?$/))) {
      pool = vocab(); hits = pool.filter(function (w) { return w.slice(-m[1].length) === m[1] && w.length > m[1].length; });
      if (!hits.length) return null;
      return res("Words ending in -" + m[1] + ": " + hits.slice(0, 5).join(", ") + ".", "words", 0.75);
    }
    if ((m = l.match(/^(?:give me|name|list|tell me|think of|find)\s+(?:a |an |some )?(\d+|three|four|five|six|seven)[- ]letter words?$/))) {
      var len = nn(m[1]); pool = vocab(); hits = pool.filter(function (w) { return w.length === len; });
      if (!hits.length) return null;
      return res(len + "-letter words: " + hits.slice(0, 6).join(", ") + ".", "words", 0.75);
    }
    return null;
  }

  /* ---- poems */
  var ix = { haiku: 0, limerick: 0, poem: 0 };
  function pickFrom(list, k) { return list[(ix[k]++) % list.length]; }
  function themeOf(topic) {
    var t = topic.toLowerCase();
    var map = [[/autumn|fall\b|leaves|harvest/, "autumn"], [/winter|snow|ice|frost|cold/, "winter"], [/spring|bloom|blossom|garden/, "spring"], [/summer|sun\b|sunshine|beach|heat/, "summer"], [/sea|ocean|wave|tide|shore|beach/, "sea"], [/moon|star|night|sky|dark/, "night"],
      [/rain|storm|cloud|thunder/, "rain"], [/mountain|hill|peak|cliff/, "mountain"], [/river|stream|lake|water|pond/, "river"], [/forest|tree|wood|leaf/, "forest"], [/wind|breeze|air/, "wind"], [/morning|dawn|sunrise|day/, "morning"], [/flower|rose|petal/, "spring"]];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(t)) return map[i][1];
    return null;
  }
  /* each theme: three options for the 5-syllable first line, the 7-syllable second line and the 5-syllable last line */
  var HAIKU = {
    autumn: [["crisp leaves drift and fall", "golden light fades slow", "the cool wind has come"], ["the harvest moon climbs the hills", "red and amber leaves let go", "smoke curls above quiet roofs"], ["the year turns to rest", "bare branches wait now", "geese call through the sky"]],
    winter: [["snow falls without sound", "frost on the window", "the white world holds still"], ["the pond is a sheet of glass", "footprints fade in drifting snow", "a lone crow calls from the pine"], ["breath rising like smoke", "the night is so long", "spring sleeps beneath snow"]],
    spring: [["new buds break open", "soft rain wakes the earth", "green shoots lift to light"], ["petals float on the cool stream", "the garden hums with small wings", "every branch is full of song"], ["birdsong at the door", "a bee hums by me", "all the world is bright"]],
    summer: [["the long light of June", "cicadas hum low", "heat shimmers on stone"], ["feet bare on the warm gold sand", "waves of heat rise from the road", "ice melts in the amber glass"], ["cool shade by the creek", "the sun will not set", "fireflies wake at dusk"]],
    sea: [["waves fold into foam", "gulls cry in the wind", "salt air on my lips"], ["the tide pulls the shore away", "the endless blue meets the sky", "moonlight rides the silver swells"], ["the sea keeps its names", "a single sail glows", "deep and wide and calm"]],
    night: [["the moon climbs the hill", "stars scatter like seeds", "silver light on streets"], ["a thousand quiet small stars", "an owl calls out through the dark", "the cold dark hums with their light"], ["the night holds me close", "the world is at rest", "dreams drift on the air"]],
    rain: [["rain taps on the roof", "puddles hold the sky", "soft rain through the night"], ["a gray sky bends to the earth", "thunder rolls across the hills", "the smell of rain fills the air"], ["drops race down the glass", "the garden drinks deep", "morning shines like new"]],
    mountain: [["the peak holds the clouds", "stone against the sky", "snow on the high peaks"], ["snow sleeps on the ancient stone", "up the winding path we climb", "thin air and a wide white sky"], ["the world far below", "older than our names", "wind sings through the pass"]],
    river: [["the river runs on", "stones sing underneath", "clear and cold and quick"], ["water slips past silent stones", "a heron stands very still", "carrying the sky along"], ["light breaks on the stream", "the sea calls it home", "it never looks back"]],
    forest: [["tall trees breathe slowly", "moss softens the path", "roots hold up the sky"], ["sunlight falls in golden threads", "a hush settles on the pines", "deep inside the quiet wood"], ["a deer lifts its head", "leaves whisper my name", "the old pines keep peace"]],
    wind: [["the wind finds the door", "branches bow and sway", "wild wind in the grass"], ["it carries the scent of rain", "kites tug at their slender strings", "a restless breath moves the grass"], ["the field is all waves", "unseen wild hands play", "the wind never rests"]],
    morning: [["dawn lights the window", "mist lifts from the fields", "the sun clears the hill"], ["a soft gold creeps on the floor", "the first bird tries a small song", "all the dew begins to shine"], ["the day begins here", "coffee warms my hands", "a new day is here"]]
  };
  /* topics with no theme: templates by the topic's own syllable count, written so the line totals 5 or 7 */
  var HAIKU_GENERIC = {
    5: { 1: ["{T} in the still air", "{T} wakes with the day", "oh {T}, so quiet"], 2: ["{T} in the light", "gentle {T} waits", "{T} in the dusk"], 3: ["{T} at dusk", "the {T} calls", "{T} so still"] },
    7: { 1: ["the {T} fills the silent hours", "I watch the {T} as it turns", "all the day belongs to {T}"], 2: ["slowly the {T} appears", "I stop to watch the {T}", "all of the world is {T}"], 3: ["slowly the {T} comes", "I think of the {T}", "nothing is as {T}"] }
  };
  function haikuQ(t) {
    var l = t.toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:please )?(?:write|compose|make|create|give me|generate|can you write|could you write)\s+(?:me\s+)?(?:a|an|one)?\s*(?:short |little |quick )?haiku(?: poem)?(?: (?:about|on|for|of)\s+(?:an? |the )?(.+))?$/))) return null;
    var topic = (m[1] || "").trim(), theme = topic ? themeOf(topic) : pickFrom(["autumn", "sea", "night", "spring", "river", "morning"], "haiku");
    var lines;
    if (theme && HAIKU[theme]) {
      var banks = HAIKU[theme], k = ix.haiku++;
      lines = [banks[0][k % banks[0].length], banks[1][(k + 1) % banks[1].length], banks[2][(k + 2) % banks[2].length]];
      /* a named topic that is not the theme itself: let its word open the first line when it fits */
      if (topic && !new RegExp("\\b" + theme + "\\b").test(topic) && topic.split(" ").length === 1 && syllables(topic) <= 3) {
        var g5 = HAIKU_GENERIC[5][syllables(topic)];
        var first = g5 ? g5[k % g5.length].replace("{T}", topic) : null;
        if (first && lineSyl(first) === 5) lines[0] = first;
      }
    } else if (topic) {
      var w = topic.split(" ").slice(-1)[0], s = syllables(topic), sw = s;
      var L5 = (HAIKU_GENERIC[5][sw] || []), L7 = (HAIKU_GENERIC[7][sw] || []);
      var phrase = topic;
      if (!L5.length || !L7.length) { phrase = w; sw = syllables(w); L5 = HAIKU_GENERIC[5][sw] || []; L7 = HAIKU_GENERIC[7][sw] || []; }
      if (!L5.length || !L7.length) return null;
      lines = [L5[ix.haiku % L5.length].replace("{T}", phrase), L7[ix.haiku % L7.length].replace("{T}", phrase), "stillness fills the air"];
      ix.haiku++;
      if (lineSyl(lines[0]) !== 5 || lineSyl(lines[1]) !== 7) return null;
    } else return null;
    return res(lines.map(cap).join("\n"), "haiku", 0.8);
  }
  var LIMERICKS = [
    ["A curious {T} from Maine", "Went out for a walk in the rain.", "It slipped on a stone,", "Went tumbling home,", "And never went walking again."],
    ["There once was a {T} from the shore,", "Who danced on the sand by the door.", "It spun with a grin,", "Til the tide rolled in,", "Then danced on the sand some more."],
    ["A cheerful old {T} named Lee", "Climbed up to the top of a tree.", "It sang with a cheer", "For all who could hear,", "And shouted, \"Come up here and see!\""],
    ["A clever young {T} named Clyde", "Packed lunch for a long, bumpy ride.", "It ate every crumb,", "Then sat down, quite numb,", "With nothing but crumbs left inside."]
  ];
  function limerickQ(t) {
    var l = t.toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:please )?(?:write|compose|make|create|give me|generate|can you write|could you write)\s+(?:me\s+)?(?:a|an|one)?\s*(?:short |little |funny )?limerick(?: poem)?(?: (?:about|on|for|of)\s+(?:an? |the )?(.+))?$/))) return null;
    var topic = (m[1] || "cat").trim().replace(/s$/, "");
    var set = pickFrom(LIMERICKS, "limerick");
    return res(set.map(function (x, i) { return i === 0 ? x.replace("{T}", topic) : x; }).join("\n"), "limerick", 0.75);
  }
  var ACRO = { a: ["amazing", "bright and alive", "always glowing"], b: ["beautiful", "bold", "bright"], c: ["calm", "caring", "colorful"], d: ["dazzling", "dreamy", "delightful"], e: ["endless", "energetic", "easy"], f: ["friendly", "fresh", "free"], g: ["gentle", "graceful", "glowing"], h: ["happy", "hopeful", "heartfelt"], i: ["inspiring", "inviting", "imaginative"], j: ["joyful", "jolly", "jubilant"], k: ["kind", "keen", "kindred"], l: ["lovely", "lively", "luminous"], m: ["magical", "marvelous", "mellow"], n: ["natural", "noble", "new"], o: ["open", "optimistic", "outstanding"], p: ["peaceful", "playful", "precious"], q: ["quiet", "quick", "quaint"], r: ["radiant", "refreshing", "real"], s: ["sunny", "sweet", "shining"], t: ["tender", "true", "thoughtful"], u: ["unique", "uplifting", "united"], v: ["vibrant", "vivid", "valued"], w: ["warm", "wonderful", "wise"], x: ["xenial", "x-tra special", "x-citing"], y: ["young at heart", "yearning", "yellow"], z: ["zesty", "zealous", "zen"] };
  function acrosticQ(t) {
    var l = t.toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:please )?(?:write|compose|make|create|give me|generate)\s+(?:me\s+)?(?:an?\s+)?acrostic(?: poem)?(?: (?:for|of|about|with|using|on)\s+(?:the (?:word|name) )?["']?([a-z]{2,14})["']?)$/))) return null;
    var w = m[1], k = 0;
    return res(w.split("").map(function (c) { var bank = ACRO[c]; var word = bank[k++ % bank.length]; return c.toUpperCase() + " — " + word; }).join("\n"), "acrostic", 0.78);
  }
  var VERSE = [
    ["The {T} is a wonder to see,", "As bright as can be, wild and free.", "It brings us a smile, it makes us stay,", "And brightens the whole of the day."],
    ["Oh {T}, you are bright and you are bold,", "A story that never grows old.", "In every season, rain or shine,", "I'm glad that your beauty is mine."],
    ["I think of the {T} when days are long,", "And it sings to me a quiet song.", "It lifts my heart, it makes me glad,", "The best of the days I've had."]
  ];
  function poemQ(t) {
    var l = t.toLowerCase().replace(/[?.!]+$/, ""), m;
    if (!(m = l.match(/^(?:please )?(?:write|compose|make|create|give me|generate|can you write|could you write)\s+(?:me\s+)?(?:a|an|one)?\s*(?:short |little |rhyming |quick )*(?:poem|verse|rhyme|poetry)(?: (?:about|on|for|of)\s+(?:an? |the )?(.+))?$/))) return null;
    var topic = (m[1] || "").trim();
    if (!topic) topic = "morning";
    var haiku = HAIKU[themeOf(topic) || ""];
    var set = pickFrom(VERSE, "poem");
    return res(set.map(function (x) { return x.replace("{T}", topic); }).join("\n"), "poem", 0.72);
  }

  /* ---- very short stories from templates */
  var STORIES = [
    "Once upon a time there was a {T} who lived at the edge of a quiet village. Every morning the {T} wondered what lay beyond the hills. One day it set out to find out. On the way it met a traveller who needed help, and the {T} stopped to give it. In the end the {T} learned that the best adventures are shared, and it came home with a new friend.",
    "Nobody believed the {T} could do it. It was small, and the mountain was tall, and the winter was coming fast. But the {T} took one step, then another, and kept going while the snow fell. At the top it saw the whole valley glowing in the evening light. After that, nobody ever doubted the {T} again.",
    "One rainy afternoon a {T} found a mysterious key under an old stone. It tried the key in every lock it could find, but nothing opened. Just as the {T} was about to give up, the clouds parted and a tiny door appeared in the trunk of an oak tree. Inside was a note that said: you were brave enough to look."
  ];
  function storyQ(t) {
    var m = t.match(/^(?:please )?(?:write|tell|make up|compose|give|create|narrate)\s+(?:me\s+)?(?:a|an|one)\s+(?:short |little |quick |bedtime |funny |scary |sweet |happy )*(?:story|tale|fairy tale)(?:\s+(?:about|on|with)\s+(?:an? |the )?(.+?))?[?.!]*$/i);
    if (!m) return null;
    var T = (m[1] || "traveller").trim().replace(/s$/, "");
    if (T.split(" ").length > 4) return null;
    var k = (ix.story = (ix.story || 0) + 1) % STORIES.length;
    return res(STORIES[k].replace(/\{T\}/g, T), "story", 0.7);
  }

  var SOLVERS = [textQ, grammarQ, ideasQ, storyQ, spellQ, countQ, rhymeQ, wordsQ, haikuQ, limerickQ, acrosticQ, poemQ];
  function solve(text) {
    var t = clean(text);
    if (!t || t.length > 200) return null;
    for (var i = 0; i < SOLVERS.length; i++) {
      var r = null;
      try { r = SOLVERS[i](t); } catch (e) { r = null; }
      if (r && r.answer) return r;
    }
    return null;
  }

  root.C4LMWrite = { solve: solve, syllables: syllables, lineSyl: lineSyl, _haiku: HAIKU, _generic: HAIKU_GENERIC };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMWrite;
})(typeof window !== "undefined" ? window : globalThis);
