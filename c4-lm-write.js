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
      var w = m[1];
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

  var SOLVERS = [spellQ, countQ, rhymeQ, wordsQ, haikuQ, limerickQ, acrosticQ, poemQ];
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
