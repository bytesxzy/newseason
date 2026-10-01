/* CELL4 local fact library and extractive answerer.
 *
 * The knowledge base (c4-lm-kb.js) stores entities with typed relations. Most
 * of what people ask is not shaped like that: "Who discovered penicillin?",
 * "What force keeps the planets in orbit?", "Which ancient civilisation built
 * the pyramids?". This module holds declarative sentences, indexes them by
 * content stem, and answers a question by finding the sentence that accounts
 * for the question's content words AND contains the kind of thing asked for
 * (a person for "who", a year for "when", a number for "how many").
 *
 * There is no question -> answer table. A sentence is stored once, as
 * knowledge, and is reached from any phrasing whose content words it covers.
 * A question the library covers only in part is declined: a shared word is
 * never enough, which is what stops a confident answer to a different
 * question.
 *
 * Runs locally. No network, no model service.
 */
(function (root) {
  "use strict";

  var DOCS = [], DF = Object.create(null), built = false;

  var STOP = Object.create(null);
  ("a an the of to in on at by for with from as is are was were be been being am do does did done has have had " +
   "it its this that these those and or but not no so if then than too very can could will would shall should may might must " +
   "i me my we our you your he him his she her they them their there here what which who whom whose when where why how " +
   "tell give say about also just into onto over under out up down off again more most much many some any each every " +
   "year years name named called call known kind type sort please").split(" ").forEach(function (w) { STOP[w] = 1; });
  /* words that frame a question about a quantity are not content either */
  var FRAME = Object.create(null);
  ("many much long far tall high old big fast often happen happens happened occur occurs story proverb saying idiom expression phrase").split(" ").forEach(function (w) { FRAME[w] = 1; });

  /* words the library treats as one. The first of each group is canonical. */
  var SYN_GROUPS = [
    ["function", "purpose", "role", "job"],
    ["weigh", "weighs", "weighed", "weight", "heavy", "heavier", "heaviest"],
    ["lifespan", "lifetime", "lifespans"],
    ["tire", "tyre"],
    ["versus", "vs"],
    ["largest", "biggest", "greatest", "largest"],
    ["smallest", "tiniest", "littlest"],
    ["highest", "tallest"],
    ["write", "wrote", "written", "writer", "author", "authored", "writes"],
    ["paint", "painted", "painter", "paints", "painting"],
    ["compose", "composed", "composer", "composes"],
    ["invent", "invented", "inventor", "invents", "invention"],
    ["discover", "discovered", "discoverer", "discovers", "discovery"],
    ["found", "founded", "founder", "founders", "founding"],
    ["lead", "led", "leader", "leads", "leading"],
    ["begin", "began", "begun", "start", "started", "starts", "beginning"],
    ["end", "ended", "ends", "ending", "finish", "finished"],
    ["die", "died", "dies", "death"],
    ["born", "birth", "birthplace"],
    ["build", "built", "builds", "builder", "constructed", "construct"],
    ["nation", "country", "countries", "nations"],
    ["ruler", "emperor", "king", "monarch"],
    ["buy", "bought", "purchase", "purchased"],
    ["sculpt", "sculpted", "sculptor", "sculpture"],
    ["direct", "directed", "director"],
    ["sign", "signed", "signing"],
    ["win", "won", "winner", "wins", "victory"],
    ["propose", "proposed", "developed", "formulated", "formulate", "develop"],
    ["mammal", "mammals"],
    ["stand", "stands", "stood"],
    ["mean", "means", "meaning", "definition", "define"],
    ["exhale", "breathe", "expel"],
    ["kilometer", "kilometre", "kilometers", "kilometres", "km"], ["meter", "metre", "meters", "metres"], ["centimeter", "centimetre", "centimeters", "centimetres"],
    ["liter", "litre", "liters", "litres"], ["center", "centre"], ["color", "colour", "colors", "colours"], ["gray", "grey"], ["organize", "organise", "organization", "organisation"],
    ["aluminum", "aluminium"], ["program", "programme"], ["travel", "travels", "traveled", "travelled", "traveling", "travelling"], ["mile", "miles"],
    ["europe", "european"], ["africa", "african"], ["asia", "asian"], ["america", "american"], ["australia", "australian"], ["west", "western"], ["east", "eastern"], ["north", "northern"], ["south", "southern"],
    ["britain", "british"], ["france", "french"], ["germany", "german"], ["spain", "spanish"], ["italy", "italian"], ["greece", "greek"], ["egypt", "egyptian"], ["china", "chinese"], ["japan", "japanese"], ["russia", "russian"], ["india", "indian"], ["rome", "roman"],
    ["explorer", "explore", "explored", "exploration"], ["reach", "reached", "reaches", "arrive", "arrived"], ["meet", "met", "meets"], ["fall", "fell", "fallen", "falls", "collapse", "collapsed"], ["filter", "filters", "filtered"], ["pull", "pulls", "attract", "attracts", "attracted"]
  ];
  SYN_GROUPS.push(["sing", "sang", "sung", "sings", "singer", "singing"]);
  SYN_GROUPS.push(["discover", "discovered", "discovering", "discovers", "discovery"]);
  SYN_GROUPS.push(["spouse", "wife", "husband", "partner", "married", "marry", "wed"]);
  var SYN = Object.create(null);
  SYN_GROUPS.forEach(function (g) { g.forEach(function (w) { SYN[w] = g[0]; }); });
  /* irregular verbs: the past forms meet the base form ("sank", "sunk" -> "sink") unless a group above already says otherwise */
  ("sink:sank:sunk blow:blew:blown break:broke:broken bring:brought build:built buy:bought catch:caught choose:chose:chosen come:came dig:dug do:did:done draw:drew:drawn drink:drank:drunk drive:drove:driven eat:ate:eaten fall:fell:fallen " +
   "feed:fed fight:fought fly:flew:flown forget:forgot:forgotten forgive:forgave freeze:froze:frozen get:got:gotten give:gave:given go:went:gone grow:grew:grown hang:hung have:had hear:heard hide:hid:hidden hold:held keep:kept know:knew:known " +
   "lead:led leave:left:left lend:lent lose:lost make:made mean:meant meet:met pay:paid ride:rode:ridden ring:rang:rung run:ran say:said see:saw:seen sell:sold send:sent shake:shook:shaken shine:shone shoot:shot sing:sang:sung sit:sat sleep:slept " +
   "speak:spoke:spoken spend:spent stand:stood steal:stole:stolen swim:swam:swum swing:swung take:took:taken teach:taught tear:tore:torn tell:told think:thought throw:threw:thrown understand:understood wake:woke:woken wear:wore:worn win:won write:wrote:written begin:began:begun become:became").split(" ").forEach(function (g) {
    var f = g.split(":"), base = f[0];
    f.slice(1).forEach(function (w) { if (w && !SYN[w] && !/^(?:saw|left|found|lay|rose|ground|spoke|bore|wound|lit|bound|fit|had|did|made|said|go|got|ring|rang|rung|lead|led|hung|hang|held|shot|sat|met|paid|won|told|sold|sent|lent|lost|kept|heard|hid|fed|fought|dug|built|bought|brought|caught|taught|thought|meant)$/.test(w) || (w && !SYN[w] && /^(?:sank|sunk|went|gone|came|ate|eaten|wrote|written|flew|flown|drove|driven|began|begun|became|took|taken|gave|given|knew|known|grew|grown|threw|thrown|wore|worn|stole|stolen|swam|swum|sang|sung|rode|ridden|spoke|spoken|broke|broken|chose|chosen|drank|drunk|drew|drawn|fell|fallen|froze|frozen|forgot|forgotten|woke|woken|shook|shaken|tore|torn|blew|blown|understood|stood)$/.test(w))) SYN[w] = SYN[base] || base; });
  });

  function stem(w) {
    if (w.length <= 3) return w;
    if (/(ss|us|is|as)$/.test(w)) { /* keep */ }
    else if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
    else if (/(ches|shes|xes|zes|ses)$/.test(w)) return w.slice(0, -2);
    else if (/s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    if (/ing$/.test(w) && w.length > 5) {
      var b = w.slice(0, -3);
      if (/([bdfglmnprt])\1$/.test(b)) b = b.slice(0, -1);
      return /[aeiou]/.test(b) ? b : w;
    }
    if (/ed$/.test(w) && w.length > 4) {
      var c = w.slice(0, -2);
      if (/([bdfglmnprt])\1$/.test(c)) c = c.slice(0, -1);
      return /[aeiou]/.test(c) ? c : w;
    }
    return w;
  }

  var ORD_WORDS = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth",
    "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
  var TENS = { 2: "twenty", 3: "thirty", 4: "forty", 5: "fifty", 6: "sixty", 7: "seventy" };
  var TENS_ORD = { 2: "twentieth", 3: "thirtieth", 4: "fortieth", 5: "fiftieth", 6: "sixtieth", 7: "seventieth" };
  function ordWord(n) {
    n = +n;
    if (n <= 20) return ORD_WORDS[n];
    var t = Math.floor(n / 10), u = n % 10;
    if (!TENS[t]) return String(n);
    return u ? TENS[t] + " " + ORD_WORDS[u] : TENS_ORD[t];
  }
  function tokens(s) {
    var t = String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, function (m, n) { return ordWord(n); })
      .replace(/(twenty|thirty|forty|fifty|sixty|seventy)-(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)/g, "$1 $2")
      .replace(/[’']s\b/g, "")
      .replace(/[^a-z0-9À-ɏ]+/g, " ").trim();
    if (!t) return [];
    return t.split(" ");
  }
  function canon(w) { return SYN[w] || SYN[stem(w)] || stem(w); }
  function contentStems(s, keepFrame) {
    var out = [], seen = Object.create(null);
    tokens(s).forEach(function (w) {
      if (w === "jr" || w === "sr") return;
      if (STOP[w] || (FRAME[w] && !(keepFrame === true || (keepFrame === 2 && /^(?:high|low|big|long|old|fast|tall|far)$/.test(w)) || (keepFrame && /^(?:story|proverb|saying|idiom|expression|phrase)$/.test(w))))) return;
      var c = canon(w);
      if (STOP[c] || seen[c]) return;
      seen[c] = 1; out.push(c);
    });
    /* "What is a proverb?" asks about the word the frame list would otherwise throw away */
    if (!out.length) tokens(s).forEach(function (w) { if (/^(?:story|proverb|saying|idiom|expression|phrase)$/.test(w) && !seen[canon(w)]) { seen[canon(w)] = 1; out.push(canon(w)); } });
    return out;
  }
  /* the content words in order, repeats kept, for adjacency */
  function contentSeq(s) {
    var out = [];
    tokens(s).forEach(function (w) {
      if (STOP[w] || FRAME[w] || w === "jr" || w === "sr") return;
      var c = canon(w);
      if (!STOP[c]) out.push(c);
    });
    return out;
  }
  /* the first few words of the sentence are the question's own terms: it is about them */
  function leadCovers(text, qs) {
    if (!qs.length) return false;
    var ts = tokens(text).filter(function (w) { return !STOP[w]; }).slice(0, qs.length).map(canon);
    return qs.every(function (q) { return ts.indexOf(q) >= 0; });
  }
  function bigrams(seq) {
    var o = [], i;
    for (i = 0; i + 1 < seq.length; i++) o.push(seq[i] + "|" + seq[i + 1]);
    return o;
  }

  function add(list) {
    (Array.isArray(list) ? list : [list]).forEach(function (t) {
      t = String(t).trim();
      if (!t) return;
      DOCS.push({ text: t, stems: null });
    });
    built = false;
  }

  function usTok(t) {
    return String(t).replace(/\bU\.S\.A?\.?(?=\s|$|[,;)?!])|\bUSA\b|\bUS\b|\bUnited States(?: of America)?\b/g, "US");
  }

  function build() {
    if (built) return;
    DF = Object.create(null);
    DOCS.forEach(function (d) {
      /* "US", "U.S." and "United States" index as one token, so "state" only matches a real state */
      var nt = usTok(d.text);
      var st = contentStems(nt, true), set = Object.create(null);
      st.forEach(function (x) { set[x] = 1; });
      d.stems = set; d.n = st.length;
      var bg = Object.create(null); bigrams(contentSeq(nt)).forEach(function (b) { bg[b] = 1; });
      d.bi = bg;
      st.forEach(function (x) { DF[x] = (DF[x] || 0) + 1; });
    });
    built = true;
  }
  function idf(s) {
    var df = DF[s] || 0;
    return Math.log(1 + (DOCS.length + 1) / (df + 0.5));
  }

  /* what kind of thing does the question ask for? */
  function askType(q) {
    var l = " " + String(q).toLowerCase().replace(/[?!.,]+/g, " ") + " ";
    if (/^\s*(?:and |but |so |then )?(?:who|whom|whose)\b|\b(?:by|to|for|with|of|from) whom\b/.test(l) && !/\bwho (?:is|was) (?:the )?(?:first|last)\b.*\b(?:country|city)\b/.test(l)) return "person";
    if (/\bwhat (?:year|date|century|decade)\b|\bwhich (?:year|century|decade)\b|\bwhen\b|\bhow long ago\b/.test(l)) return "time";
    if (/\bhow (?:many|much|long|far|tall|high|old|big|fast|deep|heavy|wide|hot|cold|large)\b|\bwhat (?:number|percentage|percent|temperature|speed|distance)\b/.test(l)) return "quantity";
    if (/\bwhere\b|\bwhich (?:country|city|continent|ocean|sea|river|state|region|place|island|mountain|desert|lake)\b|\bwhat (?:country|city|continent|ocean|sea|river|state|region|place|island|mountain|desert|lake)\b/.test(l)) return "place";
    return "thing";
  }

  function capWords(text) {
    /* capitalised words that are not simply the first word of the sentence */
    var out = [], m, re = /(?:^|[\s(])([A-Z][\wÀ-ɏ.'-]+)/g;
    while ((m = re.exec(text))) out.push(m[1]);
    return out;
  }
  var NOT_NAMES = /^(?:The|A|An|In|On|At|It|Its|This|That|These|Those|He|She|They|There|His|Her|Their|Some|Many|Most|All|Each|Every|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|First|Second|Third|When|Where|What|Which|Who|Why|How|If|As|By|For|From|With|Without|And|But|Or|Not|No|Yes|Is|Are|Was|Were)$/;

  /* does the sentence carry the kind of answer asked for, beyond the words of the question itself? */
  var UNIT = {
    tall: /\b(?:m|km|cm|mm|metres?|meters?|kilomet\w+|miles?|feet|foot|ft|inch\w*|yards?)\b/i,
    far: /\b(?:m|km|cm|metres?|meters?|kilomet\w+|miles?|feet|light[- ]years?|au|astronomical units?)\b/i,
    old: /\b(?:years?|centuries|million|billion|thousand)\b/i,
    fast: /(?:km\/h|mph|per (?:hour|second)|kilomet\w+ per|metres? per|meters? per|speed)/i,
    heavy: /\b(?:kg|kilograms?|tonnes?|pounds?|grams?|tons?|lbs?)\b/i
  };
  UNIT.long = /\b(?:m|km|cm|mm|metres?|meters?|kilomet\w+|miles?|feet|foot|ft|inch\w*|yards?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|decades?|centuries)\b/i;
  UNIT.high = UNIT.tall; UNIT.deep = UNIT.tall; UNIT.wide = UNIT.tall;
  UNIT.big = /\b(?:square|sq|hectares?|acres?|m|km|metres?|meters?|kilomet\w+|miles?|feet|foot|diameter|across|area|size|wide|tall|long|litres?|gallons?|cubic)\b/i;
  function carries(type, text, qTokens, frameWord) {
    var inQ = Object.create(null);
    qTokens.forEach(function (w) { inQ[w] = 1; });
    if (type === "person" || type === "place") {
      var caps = capWords(text).filter(function (w) {
        var bare = w.replace(/[.'’-]+$/g, "");
        if (NOT_NAMES.test(bare)) return false;
        return !inQ[bare.toLowerCase()];
      });
      if (caps.length) return true;
      /* "the ancient Egyptians built ..." : a plural demonym counts */
      return false;
    }
    if (type === "time") {
      var yrs = text.match(/\b\d{3,4}\b|\b\d{1,2}(?:st|nd|rd|th) century\b|\bcentury\b|\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}\b|\b(?:first|second|third|fourth|last) (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g) || [];
      return yrs.some(function (y) { return !inQ[String(y).toLowerCase()]; });
    }
    if (type === "quantity") {
      /* a speed such as 55 km/h is not a height or a length */
      if (frameWord && UNIT[frameWord] && !UNIT[frameWord].test(frameWord === "fast" ? text : text.replace(/\b(?:km|m|mi)\s*\/\s*(?:h|s|hr)\b|\b(?:kilometres?|miles?|metres?) per (?:hour|second)\b/gi, " "))) return false;
      var nums = text.match(/\b\d[\d,.]*\b/g) || [];
      return nums.some(function (n) { return !inQ[n.toLowerCase()]; }) ||
             /\b(?:no|zero|none|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|billion|dozen)\b/i.test(text);
    }
    return true;
  }

  /* Rank the library against a question. opts.min is the coverage required. */
  function answer(question, opts) {
    opts = opts || {};
    build();
    if (!DOCS.length) return null;
    var LISTLEAD = /^\s*(?:please\s+)?(?:list|name|give me|tell me)\s+(?:all\s+)?(?:(?:the|some|a few|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)/i;
    question = usTok(question);
    /* "when do I use who versus whom" and "cats vs dogs" ask for the difference between the two */
    question = String(question).replace(/^\s*(?:when|how)\s+(?:do|should|can)\s+(?:i|you|we|one)\s+(?:use|choose|say|write)\s+(.+?)\s+(?:versus|vs\.?|or)\s+(.+?)\s*\??\s*$/i, "What is the difference between $1 and $2?")
      .replace(/^\s*(?:what(?:'s| is) the )?(?:difference|comparison)?\s*(?:of |between )?([A-Za-z][\w' -]{1,30}?)\s+(?:versus|vs\.?)\s+([A-Za-z][\w' -]{1,30}?)\s*\??\s*$/i, "What is the difference between $1 and $2?");
    /* "How long do elephants live?" asks for a lifespan */
    question = String(question).replace(/^\s*how long (?:do|does|did|will|can|would) (?:a |an |the )?(.+?) (?:typically |usually |normally |generally |on average )?(?:live|survive|last)(?: for)?\s*\??\s*$/i, function (m0, who) { return "What is the lifespan of " + who + "?"; });
    var asList = LISTLEAD.test(question) && /^\s*(?:please\s+)?(?:list|name)\b|^\s*(?:give me|tell me)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a few|some)\s/i.test(question);
    if (asList) question = String(question).replace(LISTLEAD, "What are the ");
    var qs = contentStems(question, /^\s*what\s+(?:is|are)\s+(?:a |an |the )?(?:high|low|big|long|old|fast|tall|far)\s+[a-z]/i.test(question) ? 2 : false);
    if (!qs.length) return null;
    /* "World War I" and "World War II" differ only by a letter the stemmer drops */
    var wwOne = /\bworld war (?:i|1|one)\b(?!\s*(?:i|1|two|2))/i.test(question) || /\bfirst world war\b/i.test(question);
    var wwTwo = /\bworld war (?:ii|2|two)\b/i.test(question) || /\bsecond world war\b/i.test(question);
    if (opts.minStems && qs.filter(function (w) { return /[a-z]/.test(w); }).length < opts.minStems) return null;
    var qTokens = tokens(question), type = askType(question);
    var qw = qs.map(function (s) { return { s: s, w: idf(s) }; });
    var total = 0;
    qw.forEach(function (x) { total += x.w; });
    /* capitalised words in the question name the thing: they must be covered */
    var named = (String(question).match(/\b[A-Z][\wÀ-ɏ-]{2,}/g) || [])
      .slice(1).map(function (w) { return canon(w.toLowerCase()); }).filter(function (w) { return !STOP[w]; });
    var qBi = bigrams(contentSeq(question));
    var frameWord = tokens(question).filter(function (w) { return FRAME[w]; })[0] || "";
    var whoDef = /^\s*who\s+(?:is|was|were|are)\b/i.test(question) && qs.length <= 3;
    var defStem = qs.filter(function (x) { return !/^(?:word|term|phrase|mean|meaning|definition|define)$/.test(x); })[0] || qs[0];
    var bigNums = (String(question).match(/\b\d{3,}\b/g) || []).concat((String(question).match(/\b\d{1,4}\s*(?:BCE|BC)\b/gi) || []).map(function (x) { return x.replace(/\s+/, " ").toUpperCase(); }));
    var dm = String(question).match(/^\s*what\s+(?:is|are|was|were)\s+(?:a |an |the )?([A-Za-z][A-Za-z' -]{2,40}?)\s*\??\s*$/i);
    var defSubj = dm ? dm[1].trim().replace(/(?<=[a-z]{3})s$/i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[- ]") : "";
    var howTo = /^\s*(?:how\s+(?:do|can|should|would|could|to|does one)\b|what(?:'s| is) the best way to\b|what should i do (?:to|if)\b)/i.test(question);
    var qMarker = (String(question).toLowerCase().match(/\b(most|least|fewest|biggest|smallest|first|last)\b/) || [])[1];
    var listAsk = /^\s*(?:name|list|what are|which are|give me|tell me)\b/i.test(question) && /\b(?:the|all|some|few|three|four|five|six|seven|eight|nine|ten)\b/i.test(question);
    var presentQ = /^\s*(?:who|what|which)\s+(?:is|are)\b/i.test(question) && !/\b(?:first|last|original|former|ex|previous|second|third|[0-9]+(?:st|nd|rd|th))\b/i.test(question);
    var qSup = (String(question).toLowerCase().match(/\b(?:longest|largest|biggest|tallest|highest|smallest|deepest|oldest|fastest|heaviest|richest|greatest|most [a-z]+)\b/) || [])[0];
    var supRe = qSup ? new RegExp("\\b" + qSup + "\\b[^.,;]{0,40}?\\b(?:wholly|entirely|solely|only|within|inside)\\b", "i") : null;
    var howWork = /\bhow (?:does|do|did|can)\b[^?]* (?:work|function|operate)\b/i.test(question);
    var why = /\bwhy\b|\bhow (?:come|does|do|did) .* (?:work|happen|form)\b/i.test(question) || /\bwhat (?:causes|makes|caused)\b/i.test(question);
    var pool = [];
    var best = null, second = null, i, d, k;
    for (i = 0; i < DOCS.length; i++) {
      d = DOCS[i];
      var matched = 0, hits = 0;
      for (k = 0; k < qw.length; k++) if (d.stems[qw[k].s]) { matched += qw[k].w; hits++; }
      if (!hits) continue;
      var cov = matched / total;
      if (cov < (opts.min || 0.6)) continue;
      if (hits < Math.min(2, qw.length)) continue;
      var namesOk = true;
      for (k = 0; k < named.length; k++) if (!d.stems[named[k]]) { namesOk = false; break; }
      if (!namesOk) continue;
      if (!carries(type, d.text, qTokens, frameWord)) continue;
      /* a bare "what is X" is answered by a sentence that defines X: X is its subject */
      if (opts.define && !(new RegExp("^(?:(?:a|an|the)\\s+)?(?:(?:word|term|phrase)\\s+)?" + defStem.replace(/[^a-z0-9]/g, "") + "[a-z]*\\s+(?:[a-z]+\\s+){0,2}(?:is|are|was|were|means|refers|stands|lived|combines|contains|consists|includes|has|uses|helps|works|starts|begins|measures|equals|produces|holds|happens|occurs|asks|forms)\\b", "i")).test(d.text) && !leadCovers(d.text, qs)) continue;
      /* a bare "what is X" is not answered by a life-event line about X */
      if (opts.define && /\b(?:died|was born) in [0-9]{1,4}(?: BCE| CE| BC| AD)?\.?$/.test(d.text) && !/\b(?:born|birth|die[ds]?|death)\b/i.test(question)) continue;
      /* a number the question states must be in the sentence: "the 2087 World Cup" is not any World Cup */
      var numsOk = true;
      for (k = 0; k < bigNums.length; k++) if (d.text.indexOf(bigNums[k]) < 0) { numsOk = false; break; }
      if (!numsOk) continue;
      /* a "why" question wants a reason, not a description of the same things */
      if (why && !/\b(?:because|cause[sd]?|due to|so that|result(?:s|ed)? (?:from|in)|scatter|tilt|which is why|that is why|this is why|in order to|to (?:protect|prevent|stay|keep|remove|rest|survive|save|cool|clear|avoid|attract|catch|warn|communicate|signal|control|grip|wash|sort|fight|defend|hunt|hide|escape|warm|breathe|reproduce|mate|reflect|absorb|store|digest|sense)|(?:erupt|erupts|melt|melts|freeze|freezes|rise|rises|fall|falls|sink|sinks|burst|bursts|bubble|bubbles|pop|pops|float|floats|glow|glows) (?:when|because|as|if)|since|[a-z]+ when|(?:happens?|occurs?|forms?|appears?|arises?) when)\b/i.test(d.text) && !(howWork && /\bworks? by\b|\bby \w+ing\b|\bthrough\b|\busing\b|\bwhen\b|\bwhile\b|\bpumps?\b|\bconverts?\b|\bturns?\b/i.test(d.text))) continue;
      /* "What is learning?" is not answered by a recipe: "To learn a language, ..." is the steps, for a how question */
      if (defSubj && !howTo && /^To [a-z]+\b/.test(d.text)) continue;
      /* a focused sentence beats a long one that mentions the same words */
      if (/^Simply put, /.test(d.text) !== !!opts.simple) continue;
      if (wwOne && (!/\bworld war (?:i|one|1)\b(?!\s*i)|\b1914\b|\bfirst world war\b/i.test(d.text) || /\bworld war ii\b|\b1939\b|\bsecond world war\b/i.test(d.text) && !/\bworld war i\b(?!i)/i.test(d.text))) continue;
      if (wwTwo && !/\bworld war ii\b|\b1939\b|\bsecond world war\b|\b1945\b/i.test(d.text)) continue;
      var focus = matched / (matched + 0.35 * Math.max(0, d.n - hits) + 1);
      var adj = 0;
      for (k = 0; k < qBi.length; k++) if (d.bi[qBi[k]]) adj++;
      if (whoDef && /\b(?:died|was born) in [0-9]{1,4}(?: BCE| CE| BC| AD)?\.?$/.test(d.text)) continue;
      /* life-event lines (birthplace, spouse) answer questions about those events, not "who was X" or "tell me about X" */
      if (/\bwas born in\b|\bwas married to\b|\bspouse was\b|\bwife or husband was\b/i.test(d.text) && !/\b(?:born|birth|birthplace|where|married|wife|husband|spouse|wed|marry)\b/i.test(question)) continue;
      var score = (whoDef && /\b(?:is known for|lived from|was an?|is an?|was the|is the)\b/.test(d.text) ? 0.4 : 0) + cov + 0.35 * focus + (hits === qw.length ? 0.2 : 0) + 0.3 * (qBi.length ? adj / qBi.length : 0);
      /* a present-tense question wants the present holder, not a past one in the list of holders */
      if (presentQ && /\bwas the (?:[a-z]+ )?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|[a-z-]+(?:th|st|nd|rd)|[a-z]+-[a-z]+)\b/i.test(d.text) && !/\b(?:is|are) the\b/i.test(d.text)) score -= 0.4;
      if (presentQ && /^as of \d{4}/i.test(d.text)) score += 0.3;
      /* "what is X": the sentence that is about X (starts with it) beats one that merely mentions it */
      if (defSubj && new RegExp("^(?:(?:the|a|an)\\s+)?" + defSubj + "(?:s|es)?\\b(?:[^.,:]{0,40}?\\s(?:is|are|was|were|means|refers|stands|happens|occurs)\\b|[,:])", "i").test(d.text)) score += 0.35;
      /* "A vitamin is a ..." defines the thing itself, ahead of "Vitamin C is ..." which defines one kind of it */
      if (defSubj && new RegExp("^(?:(?:the|a|an)\\s+)?" + defSubj + "(?:s|es)?\\s+(?:is|are|means|refers to)\\b", "i").test(d.text)) score += 0.2;
      /* an abbreviation line answers "what does X stand for", while "what is X" wants the explanation */
      if (defSubj && /\bstands? for\b/i.test(d.text) && !/\b(?:stand|stands|stood|abbreviat\w*|acronym|initials?|short for|mean|means)\b/i.test(question)) score -= 0.3;
      /* "X is a ..., and the Y is a ..." defines two things at once; the sentence about X alone is the better definition */
      if (defSubj && /,\s*(?:and|while|whereas)\s+(?:the|a|an)\s+[a-z-]+\s+(?:is|are|has|have)\b/i.test(d.text)) score -= 0.25;
      /* "Zeus is the king of the gods, Hera is his wife, Poseidon rules the sea" is a cast list, not a definition of Zeus */
      if (defSubj && (d.text.match(/,\s*(?:and\s+)?[A-Z][A-Za-z-]+(?:\s[A-Z][A-Za-z-]+)?\s+(?:is|are|was|rules|ends|began|has)\b/g) || []).length >= 1) score -= 0.3;
      if (qMarker && new RegExp("\\b" + qMarker + "\\b", "i").test(d.text)) score += 0.45;
      if (listAsk && (d.text.match(/,/g) || []).length >= 3) score += Math.min(0.6, 0.06 * (d.text.match(/,/g) || []).length + 0.1);
      /* "How do plants grow?" is answered by "Plants grow by using sunlight ..." */
      if (/^\s*how\s+(?:do|does|did|can)\b/i.test(question) && /\b(?:by|through) [a-z]+ing\b|\bworks? by\b/i.test(d.text)) score += 0.3;
      /* "How do I cook rice?" wants the steps ("To cook rice, ..."), not a number about cooked rice */
      if (howTo) {
        if (/^To [a-z]+/.test(d.text)) score += 0.5;
        else if (/\b(?:has|have|contains?) (?:about |around )?[\d,.]+ (?:calories|grams|kilograms|milligrams)\b/i.test(d.text) && !/\b(?:calorie|nutrition|nutrient|fat|protein|carb|sugar|vitamin)\w*\b/i.test(question)) score -= 0.4;
      }
      /* a sentence that settles four different questions in a row is a roll-call, not the answer to one of them */
      if (!listAsk && (d.text.match(/\b(?:is|are)\b/g) || []).length >= 4 && (d.text.match(/,/g) || []).length >= 2 && (d.text.match(/\b(?:[a-z]+est|most|least)\b/gi) || []).length >= 3) score -= 0.8;
      /* "the longest river wholly within Brazil" is a narrower claim than "the longest river in South America" */
      if (supRe && supRe.test(d.text)) score -= 0.4;
      var cand = { text: d.text, score: score, coverage: cov, hits: hits, total: qw.length, type: type };
      if (opts.top) pool.push(cand);
      if (!best || score > best.score) { second = best; best = cand; }
      else if (!second || score > second.score) second = cand;
    }
    if (!best) return null;
    if (opts.top) best.all = pool.sort(function (a, b) { return b.score - a.score; }).slice(0, opts.top);
    best.margin = second ? best.score - second.score : best.score;
    best.confidence = Math.max(0.3, Math.min(0.95, 0.45 + 0.5 * best.coverage + (best.hits === best.total ? 0.1 : 0)));
    return best;
  }

  root.C4LMFacts = {
    add: add, answer: answer, size: function () { return DOCS.length; },
    contentStems: contentStems, askType: askType,
    _docs: function () { return DOCS; }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMFacts;
})(typeof window !== "undefined" ? window : globalThis);
