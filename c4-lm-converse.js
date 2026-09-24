/* CELL4 conversation: what a message CALLS FOR, and a response that does it.
 *
 * The rest of the stack answers questions about things. People also say how
 * they feel, ask for a decision, a comparison, a poem, or just say hello --
 * and a system that only knows how to define words answers those with the
 * definition of whatever word it recognised ("a bit stressed" -> "a bit is
 * the smallest unit of information"). This module reads the INTENT of a
 * message from English constructions (not from stored questions) and
 * composes a response from the message's own words and from real knowledge
 * (c4-lm-kb.js entities with their attributes, the lexicon's glosses, the
 * registered exact tools).
 *
 *   social      wellbeing ("how are you"), capability (built from the
 *               modules actually loaded), help, farewell
 *   feeling     first-person emotion: reflect it, name its cause, offer
 *               help that fits the kind of feeling
 *   decide      "should I X or Y": both options from knowledge, and when
 *               each is the better choice
 *   compare     "difference between X and Y": both definitions, contrasted
 *   magnitude   "which is bigger, X or Y": the attribute read from
 *               knowledge, units normalised, compared, with the ratio
 *   creative    poems / haiku built from what is known about the topic
 *               (syllable-fitted for haiku), riddles built from definitions
 *   open        questions with no factual answer (meaning of life, opinions)
 *   procedure / advice: answered by knowledge when it has steps; otherwise
 *               an honest, specific "I don't have steps for X" instead of a
 *               definition of an incidental word
 *
 * respond() returns null for plain factual questions: those belong to the
 * knowledge and reasoning layers. accepts() is the answer-type gate used
 * on whatever those layers produce.
 * Local, deterministic apart from phrasing variety, no network, no model.
 */
(function (root) {
  "use strict";
  function get(n) { return root[n] || null; }

  function clean(s) { return String(s == null ? "" : s).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(); }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function stripArt(s) { return String(s || "").trim().replace(/^(?:the|a|an|some|my|your|our)\s+/i, "").replace(/[?.!,]+$/, "").trim(); }
  function vary(options, key) {
    var RZ = get("C4LMRealize");
    if (RZ && RZ.variation && RZ.variation.choose) return RZ.variation.choose(options, key);
    return options[0];
  }

  /* ------------------------------------------------ emotion vocabulary
     A lexical resource: emotion words, their valence and the kind of
     support that fits (a sentiment lexicon, not a list of questions). */
  var AFFECT = {
    stressed: ["pressure", -1], stress: ["pressure", -1], anxious: ["pressure", -1], anxiety: ["pressure", -1], worried: ["pressure", -1],
    nervous: ["pressure", -1], overwhelmed: ["pressure", -1], panicking: ["pressure", -1], panicked: ["pressure", -1], tense: ["pressure", -1],
    scared: ["fear", -1], afraid: ["fear", -1], frightened: ["fear", -1], terrified: ["fear", -1],
    sad: ["low", -1], down: ["low", -1], unhappy: ["low", -1], upset: ["low", -1], lonely: ["low", -1], miserable: ["low", -1],
    heartbroken: ["low", -1], hurt: ["low", -1], blue: ["low", -1], gloomy: ["low", -1], disappointed: ["low", -1],
    tired: ["energy", -1], exhausted: ["energy", -1], sleepy: ["energy", -1], drained: ["energy", -1], worn: ["energy", -1],
    frustrated: ["anger", -1], angry: ["anger", -1], annoyed: ["anger", -1], irritated: ["anger", -1], mad: ["anger", -1],
    confused: ["confusion", -1], stuck: ["confusion", -1], lost: ["confusion", -1],
    bored: ["boredom", 0],
    happy: ["joy", 1], glad: ["joy", 1], excited: ["joy", 1], great: ["joy", 1], proud: ["joy", 1], grateful: ["joy", 1],
    thankful: ["joy", 1], relieved: ["joy", 1], calm: ["joy", 1], amazing: ["joy", 1], awesome: ["joy", 1], fantastic: ["joy", 1],
    wonderful: ["joy", 1], cheerful: ["joy", 1], thrilled: ["joy", 1], optimistic: ["joy", 1], motivated: ["joy", 1]
  };
  var OFFER = {
    pressure: "If it would help, I can explain something you're stuck on, quiz you on it, or help you break what's ahead into smaller, manageable steps.",
    fear: "It can help to name exactly what's worrying you — if you'd like, tell me more and we can think it through together.",
    low: "I'm here if you want to talk about what's going on, or I can keep you company with something lighter for a while.",
    energy: "A short break, some water, or a bit of rest can make a real difference — and if there's something you need to get done, I can help make it quicker.",
    anger: "If you tell me what's getting in the way, I can try to help untangle it.",
    confusion: "Tell me which part is unclear and we'll go through it step by step.",
    boredom: "Let's fix that — I could give you a logic puzzle, a riddle, or a surprising fact to explore. Which sounds good?",
    joy: ""
  };
  var NORMALISE = {
    pressure: "That's a really common feeling when something important is coming up.",
    fear: "Feeling that way is understandable.",
    low: "That sounds hard.",
    energy: "That happens to everyone sometimes.",
    anger: "That sounds frustrating.",
    confusion: "That's completely normal when something is new.",
    boredom: "", joy: ""
  };

  /* ---------------------------------------------------- intent analysis */

  function analyze(text) {
    var I = analyzeLower(text);
    if (!I) return null;
    /* the user's own casing for the slots ("Paris", not "paris") */
    var src = clean(text);
    function orig(x) {
      if (!x) return x;
      var i = src.toLowerCase().indexOf(String(x).toLowerCase());
      return i >= 0 ? src.substr(i, String(x).length) : x;
    }
    ["topic", "said", "cause", "claim"].forEach(function (k) { if (typeof I[k] === "string") I[k] = orig(I[k]); });
    if (I.options) I.options = I.options.map(orig);
    if (I.said && Array.isArray(I.said)) I.said = I.said.map(orig);
    return I;
  }
  function analyzeLower(text) {
    var t = clean(text), l = t.toLowerCase(), m, bare = l.replace(/[?.!]+$/, "").trim();
    if (!l) return null;
    /* social acts */
    if (/^(?:hi|hello|hey|yo)?[,!\s]*(?:how are you|how are you doing|how're you|how's it going|how is it going|how are things|how do you do|how have you been|how's your day|how is your day(?: going)?|what's up|whats up|how's life|how you doing|how are ya)\b/.test(l))
      return { intent: "wellbeing" };
    if (/^(?:ok(?:ay)?[,\s]+)?(?:bye|goodbye|good bye|see you|see ya|good night|goodnight|talk (?:to you )?(?:later|soon)|catch you later|farewell|gotta go|got to go|i'm off|bye for now|cya|later)\b/.test(l))
      return { intent: "farewell" };
    if (/^(?:so\s+)?(?:what can you do|what are you able to do|what do you know(?: about)?\s*$|what are you good at|how can you help|what can i ask(?: you)?|what kind of (?:questions|things) can you|what are your (?:abilities|capabilities|skills))/.test(bare))
      return { intent: "capability" };
    if ((m = bare.match(/^(?:hey[,\s]+)?(?:can|could|would|will) you (?:please )?help(?: me)?(?:\s+(?:with|on|to)\s+(.+))?$|^(?:i need|i want|i'd like) (?:some |a little )?help(?:\s+(?:with|on)\s+(.+))?$|^help(?: me)?(?:\s+(?:with|on)\s+(.+))?$/)))
      return { intent: "help", topic: stripArt(m[1] || m[2] || m[3] || "") || null };
    /* time-of-day greetings are mirrored */
    if ((m = bare.match(/^(?:good\s+)(morning|afternoon|evening|day)(?:\s+to you)?(?:[,!\s]+(?:there|friend|everyone))?$/)))
      return { intent: "greeting", part: m[1] };
    /* questions about the assistant itself */
    if ((m = bare.match(/^(?:are|do|can|will|have|did|were|could|would)\s+you\s+(.+)$|^(?:what|who|where|how old)\s+(?:are|were)\s+you(?:\s+(.+))?$/)) &&
        SELF_TOPIC.test(bare))
      return { intent: "self", about: bare };
    /* reactions to the assistant */
    if (/^(?:you(?:'re| are)|ur|that(?:'s| is|\s+was))\s+(?:so\s+|really\s+|very\s+|pretty\s+|super\s+)?(?:funny|hilarious|smart|clever|great|awesome|amazing|helpful|nice|kind|cool|brilliant|the best|good)\b/.test(bare))
      return { intent: "praise" };
    if (/^(?:you(?:'re| are)|that(?:'s| is|\s+was))\s+(?:so\s+|really\s+|very\s+|totally\s+|completely\s+)?(?:wrong|incorrect|useless|stupid|dumb|bad|terrible|not right|not helpful|unhelpful|confusing)\b|^(?:that's not|this is not|that isn't|wrong)\b/.test(bare))
      return { intent: "criticism" };
    if (/^(?:lol|lmao|haha+|hehe+|rofl|😂|🤣)+$/.test(bare))
      return { intent: "laughter" };
    if (/^(?:i (?:don't|do not|dont) (?:understand|get it|follow|get what you mean)|what do you mean|i'm confused(?: by (?:that|this))?|huh|that (?:doesn't|does not) make sense|can you (?:explain|say) (?:that|it) (?:again|differently|more simply)|explain (?:that|it) (?:again|differently|more simply))$/.test(bare))
      return { intent: "clarify" };
    /* a fact, please */
    if ((m = bare.match(/^(?:tell me|give me|share|teach me|do you know)\s+(?:a|an|another|one|some)?\s*(?:fun|interesting|random|cool|weird|surprising|amazing)?\s*(?:fact|thing|something interesting|something cool)s?(?:\s+about\s+(.+))?$|^(?:tell me|teach me) something (?:interesting|cool|new|fun)(?:\s+about\s+(.+))?$/)))
      return { intent: "fact", topic: m[1] || m[2] ? stripArt(m[1] || m[2]) : null };
    /* feelings: first person + an emotion word */
    if ((m = bare.match(/^(?:honestly[,\s]+|ugh[,\s]+|well[,\s]+)?(?:i'm|i am|im|i feel|i've been feeling|i have been feeling|i'm feeling|i am feeling|feeling|i've been|i get|i got)\s+(?:so\s+|really\s+|very\s+|a bit\s+|a little\s+|kind of\s+|kinda\s+|pretty\s+|quite\s+|super\s+|extremely\s+|a lot\s+)*([a-z]+)(?:\s+(?:today|tonight|right now|now|lately|recently|again|these days|this week|this morning|at the moment))?(?:\s+(?:about|because of|because|over|with|by|for|at)\s+(.+))?$/))) {
      var w = m[1];
      if (AFFECT[w]) return { intent: "feeling", affect: w, kind: AFFECT[w][0], valence: AFFECT[w][1], cause: m[2] ? m[2].replace(/\bmy\b/g, "your").replace(/\bme\b/g, "you") : null };
    }
    /* creative */
    if ((m = bare.match(/^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:write|compose|make|create|give|tell|share)(?: me| us)?\s+(?:a|an|another|some|one)?\s*(?:(?:short|little|quick|funny|nice|good|cute|simple|small)\s+)*(poem|haiku|limerick|joke|riddle|rhyme|verse)s?(?:\s+(?:about|on|for|regarding)\s+(.+))?$/)))
      return { intent: "creative", form: m[1], topic: m[2] ? stripArt(m[2]) : null, said: m[2] ? m[2].trim() : null };
    /* decisions */
    if ((m = bare.match(/^(?:should i|shall i|do i|would you|which should i|which one should i|is it better (?:for me )?to)\s+([a-z]+)\s+(.+?)\s+or\s+(.+?)(?:\s+(?:first|instead|next|now))?$/)))
      return { intent: "decide", verb: m[1], options: [stripArt(m[2]), stripArt(m[3])] };
    if ((m = bare.match(/^which (?:is|one is|would be) (?:better|best)(?: for [a-z ]+?)?[,:]?\s+(.+?)\s+or\s+(.+?)$|^(.+?)\s+or\s+(.+?)[,:]?\s+which (?:is|one is) better$/)))
      return { intent: "decide", verb: null, options: [stripArt(m[1] || m[3]), stripArt(m[2] || m[4])] };
    /* comparisons */
    if ((m = bare.match(/(?:what(?:'s| is| are) )?(?:the )?differences? between (.+?) and (.+)$|^how (?:is|are|does|do) (.+?) differ(?:ent)? from (.+)$|^compare (.+?) (?:and|with|to) (.+)$|^(.+?) (?:vs\.?|versus) (.+)$/)))
      return { intent: "compare", options: [stripArt(m[1] || m[3] || m[5] || m[7]), stripArt(m[2] || m[4] || m[6] || m[8])] };
    /* magnitudes */
    if ((m = bare.match(/^which (?:is|one is|are|has)\s+(bigger|larger|smaller|heavier|lighter|older|younger|faster|slower|taller|shorter|longer|hotter|colder|farther|further|closer|nearer|more populous|higher|deeper|wider|greater)[,:]?\s+(.+?)\s+or\s+(.+)$/)))
      return { intent: "magnitude", adj: m[1], options: [stripArt(m[2]), stripArt(m[3])], said: [m[2].trim(), m[3].trim()] };
    if ((m = bare.match(/^(?:is|are)\s+(.+?)\s+(bigger|larger|smaller|heavier|lighter|older|younger|faster|slower|taller|shorter|longer|hotter|colder|farther|closer|higher|deeper|wider)\s+than\s+(.+)$/)))
      return { intent: "magnitude", adj: m[2], options: [stripArt(m[1]), stripArt(m[3])], said: [m[1].trim(), m[3].trim()], asked: stripArt(m[1]) };
    /* open questions: no factual answer to look up */
    if (/\bmeaning of (?:life|existence)\b|^why (?:are we here|do we exist|does anything exist)\b|^what (?:happens|comes) after (?:we die|death)\b|^(?:is there|does) (?:a )?god (?:exist)?\b|^what(?:'s| is) the point of (?:life|living|it all)\b|^what is happiness\b/.test(bare))
      return { intent: "open", topic: bare };
    if ((m = bare.match(/^what do you think (?:about|of)\s+(.+)$|^what(?:'s| is) your (?:opinion|view|take) on\s+(.+)$|^do you (?:like|love|enjoy|prefer)\s+(.+)$|^what(?:'s| is) your fav(?:ou)?rite\s+(.+)$/)))
      return { intent: "opinion", topic: stripArt(m[1] || m[2] || m[3] || m[4]) };
    /* how-to and advice */
    if ((m = bare.match(/^(?:(?:can you |could you )?give me |do you have |i need |i want )?(?:any |some |a few )?(?:tips|advice|suggestions|ideas|pointers)\s+(?:for|on|about)\s+(.+)$|^what(?:'s| is| are) (?:a |the |some )?(?:good|best|easiest) ways? to\s+(.+)$|^how (?:can|could|do|should) i (?:get better at|improve(?: at| my)?|stop|start|become|learn to|(be) (?=more |less |better |a better ))\s*(.+)$/)))
      return { intent: "advice", topic: m[3] ? stripArt((m[3] === "be" ? "being " : "") + m[4]) : stripArt(m[1] || m[2]) };
    if ((m = bare.match(/^(?:how (?:do|can|should|would) (?:i|you|we|one)|how to)\s+(?!do$)(.+)$|^(?:what are the )?steps (?:to|for)\s+(.+)$|^(?:give me )?instructions (?:for|on)\s+(.+)$/)) &&
        !/^how (?:do|does|did) (?:it|that|this)\b/.test(bare))
      return { intent: "procedure", topic: stripArt(m[1] || m[2] || m[3]) };
    /* claims to check */
    if ((m = bare.match(/^is it (?:true|correct|a fact|right) that\s+(.+)$/)))
      return { intent: "claim", claim: m[1] };
    /* no response of their own, but a definition does not answer them:
       "why do cats purr", "is coffee bad for you" */
    if ((m = bare.match(/^why\s+(?:do|does|did|is|are|was|were|can|can't|don't|doesn't|would|should)\s+(.+)$/)))
      return { intent: "why", topic: m[1], passive: true };
    if ((m = bare.match(/^(?:is|are|was|were|can|does|do|will|should)\s+(.+?)\s+(good|bad|safe|dangerous|healthy|unhealthy|harmful|toxic|poisonous|true|real|possible|legal|necessary|better|worse|worth it|okay|ok)(?:\s+for\s+(.+))?$/)))
      return { intent: "yesno", subject: stripArt(m[1]), predicate: m[2], "for": m[3] || null, passive: true };
    /* any yes/no about a subject and a predicate: "is the earth flat",
       "can penguins fly" -- its answer must speak to the predicate */
    if ((m = bare.match(/^(?:is|are|was|were)\s+((?:the |a |an )?[a-z]+(?: [a-z]+)?)\s+([a-z]+)$/)) || (m = bare.match(/^(?:can|could|do|does|did)\s+((?:the |a |an )?[a-z]+(?: [a-z]+)?)\s+([a-z]+)$/)))
      return { intent: "yesno", subject: stripArt(m[1]), predicate: m[2], "for": null, passive: true, open: true };
    return null;
  }

  /* --------------------------------------------------------- self model
     What the assistant truthfully is, for questions about itself. */
  var SELF_TOPIC = /\b(?:feel|feelings|emotions?|conscious|alive|sentient|self-aware|love|real|human|person|robot|machine|ai|bot|computer|program|learn|remember|memory|forget|internet|online|web|search|old|born|age|sleep|eat|tired|smart|clever|intelligent|think|dream|body|live)\b/;
  function selfAnswer(q) {
    var M = get("C4LMMemory"), online = "In tool mode I can check keyless public sources such as Wikipedia and Wikidata when a question needs current or outside information; in closed mode I answer only from local knowledge and reasoning.";
    if (/\b(?:feel|feelings|emotions?|conscious|sentient|self-aware|love|alive|dream)\b/.test(q))
      return "No — I don't have feelings or experiences. I'm a program: I read what you write and reason over what I know, but nothing is felt on my side. I'm glad to talk about feelings, though, if something's on your mind.";
    if (/\b(?:robot|human|person|real|machine|ai|bot|computer|program|body)\b/.test(q))
      return "I'm software — CELL4's local language system, running in your browser. Not a human, and not a physical robot: no body, just a reasoning engine, exact math tools and a local knowledge base.";
    if (/\b(?:learn|remember|memory|forget)\b/.test(q))
      return (M ? "I remember what you tell me during our conversation — you can ask what I know about you, or tell me to forget something. " : "") + "I don't retrain myself from our chats, so I won't quietly change how I reason.";
    if (/\b(?:internet|online|web|search)\b/.test(q)) return online;
    if (/\b(?:old|born|age)\b/.test(q)) return "I don't have an age in the human sense — I'm a program that starts fresh whenever the page loads.";
    if (/\b(?:sleep|eat|tired|live)\b/.test(q)) return "No — I don't sleep, eat or get tired, and I don't live anywhere except the page you're using. I just run while it's open.";
    if (/\b(?:smart|clever|intelligent|think)\b/.test(q))
      return "I'm good at some things — exact math, logic puzzles, word problems and the facts in my knowledge base — and I try to be honest about what I don't know rather than guess.";
    return null;
  }
  /* the verb frame an attribute value needs in a sentence */
  function attrPhrase(r, v) {
    v = String(v);
    if (r === "population") return "has a population of " + v.replace(/\s+(?:people|inhabitants)$/, "") + " people";
    if (r === "count") return "has " + v;
    if (r === "temperature") return "has a temperature of " + v;
    if (r === "speed") return /^(?:about|roughly|around)?\s*\d/.test(v) ? "moves at " + v : "is " + v;
    if (r === "height" && !/\b(?:tall|high)\b/.test(v)) return "is " + v + " tall";
    if (r === "length" && !/\blong\b/.test(v)) return "is " + v + " long";
    return "is " + v;
  }
  function factAbout(topic, turn) {
    var KB = get("C4LMKB"), k = topic ? knowledgeOf(topic) : null, pool = [];
    if (!k && KB && KB.entities) {
      pool = KB.entities().filter(function (e) { return e.rel && (e.rel.size || e.rel.distance || e.rel.speed || e.rel.height || e.rel.time || e.rel.temperature || e.rel.population); });
      if (pool.length) { var e = pool[((turn || 0) * 13 + 5) % pool.length]; k = { name: e.name, defn: e.defn, rel: e.rel, type: e.type }; }
    }
    if (!k) return null;
    var keys = ["size", "distance", "speed", "height", "temperature", "time", "population", "length", "count"], bits = [];
    keys.forEach(function (r) { if (k.rel && k.rel[r] && bits.length < 2) bits.push(attrPhrase(r, k.rel[r])); });
    var first = String(k.defn || "").split(/(?<=\.)\s/)[0];
    /* set a size against Earth's when both are known: a comparison makes a
       number mean something */
    var cmp = "";
    if (k.rel && k.rel.size && !/^earth$/i.test(k.name)) {
      var earth = knowledgeOf("earth"), a = measure(k.rel.size), b = earth ? measure(earth.rel.size) : null;
      if (a && b && a.unit === b.unit && b.value) {
        var r = a.value / b.value;
        cmp = r >= 1.5 ? " — about " + (r >= 10 ? Math.round(r) : Math.round(r * 10) / 10) + " times as wide as Earth" : r <= 0.67 ? " — about " + Math.round(100 * r) + "% of Earth's width" : "";
      }
    }
    return "Here's one: " + first + (bits.length ? " " + cap(k.name.replace(/^the\s+/i, "")) + " " + bits.join(", and ") + cmp + "." : "");
  }

  /* ------------------------------------------------------ knowledge */

  function knowledgeOf(term) {
    var KB = get("C4LMKB"), L = get("C4LMLexicon"), t = stripArt(term);
    if (!t) return null;
    if (KB) {
      var hits = [];
      try { hits = KB.resolve(t, { strict: true }); } catch (e) { hits = []; }
      if (!hits.length) try { hits = KB.resolve(t.replace(/s$/, ""), { strict: true }); } catch (e) { hits = []; }
      if (hits.length) { var e = hits[0].entity; return { name: e.name, defn: e.defn, rel: e.rel || {}, type: e.type, source: "kb", entity: e }; }
    }
    if (L && L.lookup) {
      var w = t.split(/\s+/).length === 1 ? t : null, lx = null;
      if (w) try { lx = L.lookup(w) || L.lookup(w.replace(/s$/, "")); } catch (e) { lx = null; }
      if (lx && lx.senses && lx.senses.length) {
        var s0 = lx.senses.filter(function (s) { return s.pos === "n"; })[0] || lx.senses[0];
        return { name: t, defn: cap(t) + " is " + s0.gloss.replace(/^(?:to|the|a|an)\s+/, function (x) { return /^to /.test(x) ? "to " : x; }) + ".", gloss: s0.gloss, cls: s0.cls, rel: {}, source: "lexicon" };
      }
    }
    return null;
  }
  /* "X is Y." -> "Y" (the predicate of a definition sentence) */
  function predicate(k) {
    if (!k) return "";
    if (k.gloss) return k.gloss;
    var d = String(k.defn || "").split(/(?<=\.)\s/)[0].replace(/\.$/, "");
    var m = d.match(/^.+?\s+(?:is|are|was|were|refers to|means)\s+(.+)$/i);
    return m ? m[1] : d;
  }
  /* what something is good for, from its attributes and definition */
  function strengths(k) {
    var out = [];
    if (!k) return out;
    if (k.rel.purpose) out.push(k.rel.purpose);
    var d = String(k.defn || ""), m;
    if ((m = d.match(/\bknown for ([^.;]+)/i))) out.push(m[1]);
    if ((m = d.match(/\bthat ([^.;]+)/i)) && out.length < 2) out.push(m[1]);
    if ((m = d.match(/\bused (?:for|to) ([^.;]+)/i))) out.push(m[1]);
    return out.filter(function (x, i) { return out.indexOf(x) === i; });
  }

  /* numbers with magnitude words and units, normalised (km, m, kg, years) */
  var SCALE = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
  var UNIT = { km: ["m", 1000], kilometres: ["m", 1000], kilometers: ["m", 1000], m: ["m", 1], metres: ["m", 1], meters: ["m", 1],
               miles: ["m", 1609.344], mi: ["m", 1609.344], cm: ["m", 0.01], kg: ["kg", 1], tonnes: ["kg", 1000], tons: ["kg", 907.18],
               g: ["kg", 0.001], years: ["yr", 1], year: ["yr", 1], "km/h": ["m/s", 1 / 3.6], "m/s": ["m/s", 1], mph: ["m/s", 0.44704],
               "°c": ["C", 1], c: ["C", 1], people: ["n", 1], inhabitants: ["n", 1] };
  function measure(s) {
    var m = String(s || "").replace(/,(?=\d{3})/g, "").match(/(\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion)?\s*([a-z°/]+)?/i);
    if (!m) return null;
    var v = +m[1] * (m[2] ? SCALE[m[2].toLowerCase()] : 1), u = m[3] ? UNIT[m[3].toLowerCase()] : null;
    return { value: u ? v * u[1] : v, unit: u ? u[0] : (m[3] || ""), text: m[0].trim() };
  }
  var ATTR_OF = { bigger: ["size", "length", "height", "population"], larger: ["size", "length", "height", "population"],
    smaller: ["size", "length", "height", "population"], taller: ["height", "size"], shorter: ["height", "length"],
    longer: ["length", "size"], older: ["time", "birth"], younger: ["time", "birth"], faster: ["speed"], slower: ["speed"],
    hotter: ["temperature"], colder: ["temperature"], farther: ["distance"], further: ["distance"], closer: ["distance"],
    nearer: ["distance"], "more populous": ["population"], heavier: ["mass", "weight"], lighter: ["mass", "weight"],
    higher: ["height"], deeper: ["depth"], wider: ["size", "width"], greater: ["size", "population"] };
  var SMALLER = /^(?:smaller|younger|slower|colder|closer|nearer|shorter|lighter)$/;

  /* --------------------------------------------------------- responders */

  function capability() {
    var TL = get("C4LMTools"), KB = get("C4LMKB"), parts = [];
    if (KB && KB.entities) {
      var types = {};
      KB.entities().forEach(function (e) { types[e.type] = (types[e.type] || 0) + 1; });
      var top = Object.keys(types).sort(function (a, b) { return types[b] - types[a]; }).slice(0, 5)
        .map(function (t) { return /y$/.test(t) ? t.slice(0, -1) + "ies" : /s$/.test(t) ? t : t + "s"; });
      parts.push("answer factual questions — about " + top.join(", ") + " and more");
    }
    if (TL && TL.list) {
      var dom = [];
      TL.list().forEach(function (t) { if (dom.indexOf(t.domain) < 0) dom.push(t.domain); });
      parts.push("work through math exactly and check my own answers (" + dom.slice(0, 6).join(", ") + ", …)");
    }
    if (get("C4LMEveryday")) parts.push("solve logic puzzles and word problems, showing the reasoning");
    parts.push("compare things, explain the difference between ideas, and help you decide between options");
    if (get("C4LMMemory")) parts.push("remember what you tell me during our conversation");
    return "Here's what I can do: " + parts.slice(0, -1).join("; ") + "; and " + parts[parts.length - 1] + ". What would you like to try?";
  }

  function feeling(I) {
    var cause = I.cause ? " about " + I.cause : "";
    if (I.valence > 0) {
      return vary(["That's great to hear", "Love that", "That's wonderful"], "feel+") + (I.cause ? " — " + (I.affect === "excited" ? "being excited" : "feeling " + I.affect) + cause + " is a good place to be" : "") +
             "! " + (I.cause ? "Tell me more?" : "What's got you feeling " + I.affect + "?");
    }
    if (I.kind === "boredom") return "Being bored is no fun. " + OFFER.boredom;
    return "I'm sorry you're feeling " + I.affect + cause + ". " + NORMALISE[I.kind] + " " + OFFER[I.kind];
  }

  function decide(I) {
    var a = I.options[0], b = I.options[1], ka = knowledgeOf(a), kb = knowledgeOf(b);
    var KB = get("C4LMKB"), cmp = null;
    try { cmp = KB && KB.contrast ? KB.contrast(a, b) : null; } catch (e) { cmp = null; }
    /* weighing one known option against an unknown one, or two senses from
       different domains ("spaces: the expanse beyond Earth" against tabs),
       is not a comparison: both must be known, and alike */
    if (!cmp && (!ka || !kb || ka.source !== kb.source || (ka.source === "kb" && ka.type !== kb.type) ||
                 (ka.source === "lexicon" && ka.cls !== kb.cls))) { ka = null; kb = null; }
    var na = ka ? ka.name : a, nb = kb ? kb.name : b, sa = strengths(ka), sb = strengths(kb), out = [];
    out.push("It depends on what you want to do" + (I.verb ? " with it" : "") + " — both are reasonable choices.");
    if (ka) out.push(cap(na) + " is " + predicate(ka).replace(/\.$/, "") + ".");
    if (kb) out.push(cap(nb) + " is " + predicate(kb).replace(/\.$/, "") + ".");
    if (cmp && cmp.dims) out.push("The main trade-off: " + (Array.isArray(cmp.dims) ? cmp.dims.join("; ") : String(cmp.dims)) + ".");
    if (sa.length || sb.length) {
      var rec = [];
      if (sa.length) rec.push("if " + (sa[0].length < 60 ? "you care most about " + sa[0] : "that fits your goal") + ", go with " + na);
      if (sb.length) rec.push("if you want " + sb[0].replace(/^(?:scripting|building|running|making)\b/, function (x) { return "to be " + x; }) + ", go with " + nb);
      out.push(cap(rec.join("; ")) + ".");
    } else if (!ka && !kb) {
      return "I don't know enough about " + a + " and " + b + " to compare them reliably, so I won't pretend to. If you tell me what matters most to you — price, what you'll use it for, how long it needs to last — I can help you weigh the options up.";
    }
    out.push("If you tell me what you're aiming for, I can give you a firmer recommendation.");
    return out.join(" ");
  }

  function compare(I) {
    var a = I.options[0], b = I.options[1], ka = knowledgeOf(a), kb = knowledgeOf(b);
    if (!ka && !kb) return null;
    var KB = get("C4LMKB"), cmp = null;
    try { cmp = KB && KB.contrast ? KB.contrast(a, b) : null; } catch (e) { cmp = null; }
    var out = [], na = ka ? ka.name : a, nb = kb ? kb.name : b;
    if (ka && kb) {
      out.push(cap(na) + " is " + predicate(ka).replace(/\.$/, "") + ", while " + nb + " is " + predicate(kb).replace(/\.$/, "") + ".");
      if (cmp && cmp.dims) out.push("In short: " + (Array.isArray(cmp.dims) ? cmp.dims.join("; ") : String(cmp.dims)) + ".");
      else if (ka.type && kb.type && ka.type === kb.type) out.push("Both are " + (/s$/.test(ka.type) ? ka.type : ka.type + "s") + ".");
      /* a shared word in both definitions is the axis they differ along */
      /* the attributes both have, side by side */
      var both = Object.keys(ka.rel || {}).filter(function (r) { return kb.rel && kb.rel[r] && !/^(?:type|location|symbol)$/.test(r) && ka.rel[r] !== kb.rel[r]; });
      if (both.length) out.push("Side by side: " + both.slice(0, 3).map(function (r) { return r + " — " + na + ": " + ka.rel[r] + "; " + nb + ": " + kb.rel[r]; }).join(". ") + ".");
    } else {
      var k = ka || kb, other = ka ? nb : na;
      out.push(cap(k.name) + " is " + predicate(k).replace(/\.$/, "") + ". I don't have a reliable definition of " + other + " to set against it.");
    }
    return out.join(" ");
  }

  function magnitude(I) {
    var a = I.options[0], b = I.options[1], ka = knowledgeOf(a), kb = knowledgeOf(b);
    if (!ka || !kb) return null;
    var keys = ATTR_OF[I.adj] || ["size"], ma = null, mb = null, key = null;
    for (var i = 0; i < keys.length && !(ma && mb); i++) {
      var ra = ka.rel[keys[i]], rb = kb.rel[keys[i]];
      if (ra && rb) { var x = measure(ra), y = measure(rb); if (x && y && x.unit === y.unit) { ma = x; mb = y; key = keys[i]; } }
    }
    if (!ma) return null;
    var wantSmall = SMALLER.test(I.adj), aWins = wantSmall ? ma.value < mb.value : ma.value > mb.value;
    if (ma.value === mb.value) return cap(ka.name) + " and " + kb.name + " are the same on that measure (" + ka.rel[key] + ").";
    var win = aWins ? ka : kb, lose = aWins ? kb : ka, big = Math.max(ma.value, mb.value), small = Math.min(ma.value, mb.value);
    var said = I.said || I.options, winSaid = aWins ? said[0] : said[1], loseSaid = aWins ? said[1] : said[0];
    var ratio = small > 0 ? big / small : null, bigSaid = ma.value >= mb.value ? said[0] : said[1];
    var across = /diameter/i.test(win.rel[key]) ? "as wide" : "as " + baseAdj(wantSmall ? oppositeAdj(I.adj) : I.adj);
    var rtxt = ratio && ratio >= 1.5 ? " — " + (wantSmall ? bigSaid + " is " : "") + "about " + (ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10) + " times " + across : "";
    return cap(winSaid) + " is " + I.adj + ": " + win.rel[key] + " versus " + lose.rel[key] + " for " + loseSaid + rtxt + ".";
  }
  function oppositeAdj(a) {
    return { smaller: "bigger", younger: "older", slower: "faster", colder: "hotter", closer: "farther", nearer: "farther", shorter: "taller", lighter: "heavier" }[a] || a;
  }
  function fmtNum(v) {
    if (v >= 1e9) return Math.round(v / 1e8) / 10 + " billion";
    if (v >= 1e6) return Math.round(v / 1e5) / 10 + " million";
    return String(Math.round(v * 100) / 100);
  }
  function baseAdj(adj) {
    return { bigger: "big", larger: "large", heavier: "heavy", older: "old", faster: "fast", taller: "tall", longer: "long",
             hotter: "hot", farther: "far", further: "far", higher: "high", deeper: "deep", wider: "wide", greater: "great" }[adj] || adj;
  }

  /* --- creative: built from what is known about the topic --- */
  function syllables(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    var m = w.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }
  function phrases(k) {
    var src = [predicate(k)];
    Object.keys(k.rel || {}).forEach(function (r) { if (!/^(?:type|symbol|capitalOf|country)$/.test(r)) src.push(k.rel[r]); });
    var out = [];
    src.forEach(function (s) {
      String(s).replace(/\.$/, "").split(/,(?!\d)\s*|\s+(?=(?:powered|covering|made|found|known|used|with|that|which|where|while)\b)/).forEach(function (p) {
        p = p.trim().replace(/^(?:and|or|but)\s+/, "");
        if (p.split(/\s+/).length >= 2) out.push(p);
      });
    });
    return out;
  }
  function fitLine(words, target) {
    var line = [], n = 0;
    for (var i = 0; i < words.length; i++) {
      var s = syllables(words[i]);
      if (n + s > target) break;
      line.push(words[i]); n += s;
      if (n === target) return { text: line.join(" "), used: i + 1 };
    }
    return null;
  }
  function haiku(topic, k) {
    /* whole phrases first: choose phrases whose syllables sum to 5, 7, 5 */
    var ph = [cap(k.name)].concat(phrases(k)), cnt = ph.map(function (p) { return p.split(/\s+/).reduce(function (s, w) { return s + syllables(w); }, 0); });
    var targets = [5, 7, 5], used = {}, lines2 = [];
    for (var t0 = 0; t0 < 3; t0++) {
      var found = null;
      for (var i0 = 0; i0 < ph.length && !found; i0++) {
        if (used[i0]) continue;
        if (cnt[i0] === targets[t0]) found = [i0];
        for (var j0 = i0 + 1; j0 < ph.length && !found; j0++) if (!used[j0] && cnt[i0] + cnt[j0] === targets[t0]) found = [i0, j0];
      }
      if (!found) { lines2 = null; break; }
      found.forEach(function (x) { used[x] = 1; });
      lines2.push(found.map(function (x) { return ph[x]; }).join(", "));
    }
    if (lines2) { lines2.exact = true; return lines2; }
    /* within one syllable per line, still whole phrases */
    used = {}; lines2 = [];
    for (var t1 = 0; t1 < 3; t1++) {
      var best = null, bd = 99;
      for (var i1 = 0; i1 < ph.length; i1++) {
        if (used[i1]) continue;
        var d1 = Math.abs(cnt[i1] - targets[t1]);
        if (d1 < bd) { bd = d1; best = i1; }
      }
      if (best === null || bd > 1) return null;
      used[best] = 1; lines2.push(ph[best]);
    }
    return lines2;
    var words = [cap(k.name)].concat(phrases(k).join(" ").split(/\s+/));
    var pool = words.slice(), lines = [], targets = [5, 7, 5];
    for (var t = 0; t < 3; t++) {
      var got = null;
      for (var start = 0; start < pool.length && !got; start++) { got = fitLine(pool.slice(start), targets[t]); if (got) got.start = start; }
      if (!got) return null;
      lines.push(got.text);
      pool = pool.slice(got.start + got.used);
    }
    return lines;
  }
  function creative(I, turn) {
    var form = I.form, topic = I.topic;
    if (form === "joke" || form === "riddle") {
      var KB = get("C4LMKB"), k = topic ? knowledgeOf(topic) : null;
      if (!k && KB && KB.entities) {
        var pool = KB.entities().filter(function (e) { return e.defn && /^(?:animal|planet|element|phenomenon|landmark|substance|satellite|star)$/.test(e.type); });
        if (pool.length) { var e = pool[(turn || 0) * 7 % pool.length]; k = { name: e.name, defn: e.defn, rel: e.rel || {}, type: e.type }; }
      }
      if (!k) return null;
      var clue = predicate(k).replace(/^(?:a|an|the)\s+/i, "");
      var first = /s$/.test(k.name) && !/ss$/.test(k.name) ? "We're " : "I'm ";
      return (form === "joke" ? "Here's a riddle rather than a pun — I build them from what I know: " : "Here's one: ") +
             first + (/^(?:a|an|the)\s/i.test(predicate(k)) ? predicate(k).match(/^(a|an|the)/i)[1].toLowerCase() + " " : "") + clue.replace(/\.$/, "") +
             ". What am I? … " + cap(k.name) + "!";
    }
    if (!topic) return null;
    var kk = knowledgeOf(topic);
    if (!kk) return "I don't know enough about " + topic + " to write about it well. Tell me a few things about it — what it looks like, sounds like, or means to you — and I'll shape them into a " + form + ".";
    if (form === "haiku") {
      var h = haiku(topic, kk);
      if (h) return (h.exact ? "A haiku about " : "A haiku-style poem (close to 5-7-5) about ") + (I.said || topic) + ", built from what I know about it:\n\n" + h.join("\n");
    }
    var ph = phrases(kk).slice(0, 4);
    if (!ph.length) return null;
    var lines = [cap(kk.name) + " —"].concat(ph.map(function (p, i) { return (i === ph.length - 1 ? p + "." : p + ","); }));
    return "A short " + (form === "haiku" ? "poem" : form) + " about " + (I.said || topic) + ", from what I know of it:\n\n" + lines.join("\n");
  }

  function open(I) {
    if (/meaning of (?:life|existence)|point of (?:life|living|it all)|why (?:are we here|do we exist)/.test(I.topic))
      return "That's one of the oldest open questions, and there isn't a single factual answer to look up. Philosophers and traditions answer it differently — some find meaning given from outside (religion, a larger purpose), others see it as something each person builds through relationships, curiosity, work and helping others. If you tell me which angle interests you, I can go deeper on it.";
    return "That's an open question — people answer it through their beliefs and philosophy rather than through facts I could check, so I'd rather not pretend to settle it. If you tell me the angle you're curious about, I can lay out the main positions or the relevant facts.";
  }
  function opinion(I) {
    var k = knowledgeOf(I.topic || "");
    var lead = "I don't have personal tastes or feelings, so I can't honestly say I like or dislike " + (I.topic || "things") + ".";
    if (k) return lead + " What I can tell you: " + k.defn.replace(/\s+$/, "") + " Want to know more about it?";
    return lead + " If you tell me what you'd like to know about it, I'll dig into the facts.";
  }
  /* "learn a new language" -> "learning a new language" (English -ing
     spelling rules); a phrase that is not led by a verb is left alone */
  function gerund(vp) {
    var w = vp.split(/\s+/), v = w[0], L = get("C4LMLexicon"), isVerb = false;
    if (/ing$/.test(v)) return vp;
    try { var lx = L && L.lookup ? L.lookup(v) : null; isVerb = !!(lx && lx.senses && lx.senses.some(function (x) { return x.pos === "v"; })); } catch (e) { isVerb = false; }
    if (!isVerb && !/^(?:learn|make|get|stay|keep|be|become|stop|start|sleep|eat|study|save|lose|build|write|read|cook|run|tie|boil|fix|improve|speak|use)$/.test(v)) return vp;
    var g = v === "be" ? "being" : /ie$/.test(v) ? v.slice(0, -2) + "ying" : /[^aeiou]e$/.test(v) && v !== "be" ? v.slice(0, -1) + "ing" :
            /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(v) ? v + v.slice(-1) + "ing" : v + "ing";
    return [g].concat(w.slice(1)).join(" ");
  }
  function howto(I, federated, looked) {
    var topic = I.topic || "that";
    if (federated && !looked) return null;          /* the evidence layer may find real steps */
    var vp = topic.replace(/^(?:how to|to)\s+/, "");
    var kind = I.intent === "advice" ? "tips on " + gerund(vp) : "step-by-step instructions to " + vp;
    return (looked ? "I looked, but couldn't find reliable " + kind + ", and I'd rather not make steps up. "
                   : "I don't have reliable " + kind + " in my local knowledge, and I'd rather not make steps up. In tool mode I can look it up from public sources. ") +
           "If you tell me what you've tried so far, I'll help you reason it through.";
  }
  function claim(I) {
    var EVD = get("C4LMEveryday");
    var m = I.claim.match(/^(no|all|every|some)\s+(\w+)\s+(?:can|could|are|is|do|does|have|has)\s+(.+)$/i);
    if (m) {
      var k = knowledgeOf(m[2]);
      var what = "that " + (m[1].toLowerCase() === "no" ? "no " + m[2] : m[1].toLowerCase() + " " + m[2]) + " " + I.claim.slice(m[0].indexOf(m[3]) >= 0 ? 0 : 0).replace(/^(?:no|all|every|some)\s+\w+\s+/i, "");
      var note = m[1].toLowerCase() === "no" || /^(?:all|every)$/i.test(m[1]) ?
        " A claim about every single " + m[2].replace(/s$/, "") + " is disproved by one counterexample, so it needs strong evidence." : "";
      return "I can't confirm " + what + " from my local knowledge." + (k ? " What I do know: " + k.defn.split(/(?<=\.)\s/)[0] : "") + note;
    }
    return null;
  }

  /* ----------------------------------------------------------- respond */

  function respond(text, ctx) {
    ctx = ctx || {};
    var I = analyze(text);
    if (!I) return null;
    if (I.passive && !ctx.looked) return null;
    var out = null, route = "conversation";
    switch (I.intent) {
      case "wellbeing":
        out = vary(["I'm doing well, thanks for asking! Ready for whatever you want to dig into — how about you?",
                    "Doing well, thank you — it's a good day for questions. How are you doing?",
                    "All good here, thanks! What's on your mind today?"], "wellbeing"); break;
      case "farewell":
        out = vary(["Bye for now — take care!", "See you later — it was good talking with you.", "Goodbye! Come back any time."], "farewell"); break;
      case "capability": out = capability(); break;
      case "greeting": out = "Good " + I.part + "! What can I help you with?"; break;
      case "self": out = selfAnswer(I.about); break;
      case "praise": out = vary(["Thank you — that's kind of you to say!", "Thanks! Happy to help with more whenever you like.", "Glad you think so — thanks!"], "praise"); break;
      case "criticism": out = "Sorry about that — tell me what's off, or what you expected, and I'll take another look. If I made a mistake, I'd rather fix it than defend it."; break;
      case "laughter": out = vary(["Glad that made you smile!", "Ha — glad you liked it.", "😄 Anything else you'd like to try?"], "laugh"); break;
      case "clarify":
        out = "Sorry — let me try to make it clearer. Which part didn't land? " + (ctx.lastTopic ? "I can explain " + ctx.lastTopic + " step by step, more simply, or with an example." : "I can go through it step by step, more simply, or with an example."); break;
      case "fact": out = factAbout(I.topic, ctx.turn || 0); route = "knowledge"; break;
      case "help":
        out = I.topic ? "Of course — let's work on " + I.topic + ". What part would you like to start with?" :
                        vary(["Of course — what do you need help with?", "Sure, happy to help. What's up?"], "help"); break;
      case "feeling": out = feeling(I); break;
      case "decide": out = decide(I); route = "comparison"; break;
      case "compare": out = compare(I); route = "comparison"; break;
      case "magnitude": out = magnitude(I); route = "comparison"; break;
      case "creative": out = creative(I, ctx.turn || 0); route = "creative"; break;
      case "open": out = open(I); break;
      case "opinion": out = opinion(I); break;
      case "advice": case "procedure": out = howto(I, ctx.federated, ctx.looked); route = "knowledge"; break;
      case "claim": out = ctx.federated ? null : claim(I); route = "knowledge"; break;
      case "why": out = "I don't have a reliable explanation of why " + I.topic + " in my local knowledge, and I'd rather not guess at a cause. In tool mode I can look for one in public sources."; route = "knowledge"; break;
      case "yesno": out = I.open ? "I can't confirm from my local knowledge whether " + I.subject + " " + (/^(?:can|could|do|does|did)\b/i.test(text.trim()) ? text.trim().match(/^\w+/)[0].toLowerCase() + " " + I.predicate : (/s$/.test(I.subject) ? "are " : "is ") + I.predicate) + ", so I won't guess." + (ctx.lastKnown ? " What I do know: " + ctx.lastKnown : "") :
          "I can't say reliably whether " + I.subject + " " + (/s$/.test(I.subject) ? "are" : "is") + " " + I.predicate + (I.for ? " for " + I.for : "") + " from my local knowledge — it's the kind of claim that needs evidence I don't have here."; route = "knowledge"; break;
    }
    if (!out) return null;
    return { text: out, route: route, intent: I.intent, confidence: /^I (?:don't|can't)\b/.test(out) ? 0.5 : 0.8,
             conversational: route === "conversation", sources: [] };
  }

  /* The answer-type gate: does an answer from another layer do what the
     message asked? A definition of a word the message merely contains
     does not answer a feeling, a decision, a comparison, a poem request,
     an open question or a how-to. */
  function accepts(text, result) {
    var I = analyze(text);
    if (!I || !result) return true;
    /* a generic "found nothing" is replaced by the intent's own honest
       reply when it has one (a how-to, advice, a claim, a comparison) */
    if ((result.route === "insufficient" || result.insufficientEvidence) && /^(?:procedure|advice|claim|compare|decide|magnitude|creative)$/.test(I.intent)) return false;
    var defLike = /^(?:knowledge|lexicon|site|compose|explanation)$/.test(result.route || "") || result.defined || result.composed;
    if (!defLike) return true;
    if (I.intent === "compare" || I.intent === "decide" || I.intent === "magnitude") {
      var names = I.options.map(function (o) { return o.toLowerCase(); }), t = String(result.text || "").toLowerCase();
      return names.every(function (n) { return t.indexOf(n.split(/\s+/)[0]) >= 0; });
    }
    if (I.intent === "procedure" || I.intent === "advice")
      return /\b(?:first|then|next|step|until|minutes?|add|place|put|use|try|avoid|keep|make sure)\b/i.test(result.text || "");
    /* a "why" needs a cause; a yes/no needs a verdict on the subject */
    if (I.intent === "why") return result.route === "explanation" || /\b(?:because|due to|so that|therefore|causes?|caused|results? in|leads? to|which is why|since|as a result)\b/i.test(result.text || "");
    if (I.intent === "yesno" && I.open) {
      var tq = String(result.text || "");
      return /^(?:yes|no)\b/i.test(tq) || new RegExp("\\b" + I.predicate.replace(/s$/, "") + "\\w*\\b", "i").test(tq.replace(/\bmeans\b.*$/i, ""));
    }
    if (I.intent === "yesno") {
      var tx = String(result.text || "");
      return /^(?:yes|no)\b/i.test(tx) || (new RegExp("\\b" + String(I.subject).split(/\s+/)[0] + "\\b", "i").test(tx) && new RegExp("\\b" + I.predicate + "\\b", "i").test(tx) && !/\bmeans\b/i.test(tx));
    }
    return false;
  }

  var CV = { analyze: analyze, respond: respond, accepts: accepts, knowledgeOf: knowledgeOf, measure: measure, syllables: syllables,
             capability: capability, AFFECT: AFFECT };
  root.C4LMConverse = CV;
  if (typeof module !== "undefined" && module.exports) module.exports = CV;
})(typeof window !== "undefined" ? window : globalThis);
