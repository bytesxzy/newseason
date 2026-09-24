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
    nervous: ["pressure", -1], panicking: ["pressure", -1], panicked: ["pressure", -1], tense: ["pressure", -1],
    overwhelmed: ["load", -1], swamped: ["load", -1], burnt: ["load", -1], burned: ["load", -1], overworked: ["load", -1], stretched: ["load", -1],
    sick: ["health", -1], ill: ["health", -1], unwell: ["health", -1], poorly: ["health", -1],
    scared: ["fear", -1], afraid: ["fear", -1], frightened: ["fear", -1], terrified: ["fear", -1],
    sad: ["low", -1], down: ["low", -1], unhappy: ["low", -1], upset: ["low", -1], lonely: ["low", -1], miserable: ["low", -1],
    heartbroken: ["low", -1], hurt: ["low", -1], blue: ["low", -1], gloomy: ["low", -1], disappointed: ["low", -1],
    tired: ["energy", -1], exhausted: ["energy", -1], sleepy: ["energy", -1], drained: ["energy", -1], worn: ["energy", -1],
    frustrated: ["anger", -1], angry: ["anger", -1], annoyed: ["anger", -1], irritated: ["anger", -1], mad: ["anger", -1],
    confused: ["confusion", -1], stuck: ["confusion", -1], lost: ["confusion", -1],
    bored: ["boredom", 0],
    happy: ["joy", 1], glad: ["joy", 1], excited: ["joy", 1], great: ["joy", 1], proud: ["joy", 1], grateful: ["joy", 1],
    thankful: ["joy", 1], relieved: ["joy", 1], calm: ["joy", 1], amazing: ["joy", 1], awesome: ["joy", 1], fantastic: ["joy", 1],
    wonderful: ["joy", 1], cheerful: ["joy", 1], thrilled: ["joy", 1], optimistic: ["joy", 1], motivated: ["joy", 1],
    ecstatic: ["joy", 1], delighted: ["joy", 1], overjoyed: ["joy", 1], lucky: ["joy", 1], content: ["joy", 1], hopeful: ["joy", 1],
    /* a plain "I'm fine" is an answer to "how are you", not news */
    fine: ["fine", 1], good: ["fine", 1], ok: ["fine", 1], okay: ["fine", 1], alright: ["fine", 1], well: ["fine", 1]
  };
  var OFFER = {
    pressure: "If it would help, I can explain something you're stuck on, quiz you on it, or help you break what's ahead into smaller, manageable steps.",
    fear: "It can help to name exactly what's worrying you — if you'd like, tell me more and we can think it through together.",
    low: "I'm here if you want to talk about what's going on, or I can keep you company with something lighter for a while.",
    energy: "A short break, some water, or a bit of rest can make a real difference — and if there's something you need to get done, I can help make it quicker.",
    anger: "If you tell me what's getting in the way, I can try to help untangle it.",
    confusion: "Tell me which part is unclear and we'll go through it step by step.",
    boredom: "Let's fix that — I could give you a logic puzzle, a riddle, or a surprising fact to explore. Which sounds good?",
    load: "If you list what's on your plate, I can help you sort it into what's urgent, what can wait, and the smallest next step.",
    health: "Rest, fluids and taking it easy help — and if it gets worse or doesn't improve, it's worth checking in with a doctor.",
    joy: "", fine: ""
  };
  var NORMALISE = {
    pressure: "That's a really common feeling when something important is coming up.",
    fear: "Feeling that way is understandable.",
    low: "That sounds hard.",
    energy: "That happens to everyone sometimes.",
    anger: "That sounds frustrating.",
    confusion: "That's completely normal when something is new.",
    load: "Having too much on at once is exhausting, and it doesn't mean you're doing anything wrong.",
    health: "Being unwell is miserable.",
    boredom: "", joy: "", fine: ""
  };
  /* what a stated cause is: an event still ahead (a test tomorrow) makes
     nerves normal in a different way than a standing load does */
  var AHEAD = /\b(?:test|exam|interview|presentation|deadline|tomorrow|tonight|next|date|meeting|speech|audition|match|game|race|surgery|operation|appointment|results?|trip|flight|move|wedding|first day|performance|recital|competition)\b/;

  /* News about the speaker's life: what kind of event it is decides the
     response (congratulate, console, wish well). An event lexicon, the way
     the emotion words above are a lexicon -- not stored sentences. */
  function newsKind(ev) {
    ev = String(ev || "").toLowerCase();
    if (/\b(?:died|passed away|has died|is dead|was put (?:down|to sleep))\b/.test(ev) ||
        /\blost (?:my|our) (?:mom|mum|mother|dad|father|grand\w+|brother|sister|wife|husband|partner|friend|best friend|son|daughter|baby|dog|cat|pet|uncle|aunt|cousin)\b/.test(ev)) return "grief";
    if (/\b(?:broke up|got dumped|was dumped|got divorced|getting divorced|left me|cheated on me)\b/.test(ev)) return "breakup";
    if (/\b(?:got sick|am sick|i'm sick|got hurt|broke my \w+|got injured|was injured|have (?:the )?(?:flu|covid|a cold|a fever)|got (?:the )?(?:flu|covid|a cold)|(?:am|i'm) in (?:the )?hospital)\b/.test(ev)) return "health";
    if (/\b(?:failed|flunked|got fired|was fired|been fired|got laid off|was laid off|been laid off|got rejected|was rejected|been rejected|didn't get|did not get|lost (?:the|my|our) (?:job|game|match|race|case|election|bet|wallet|keys|phone|bag)|missed (?:the|my) \w+|got robbed|was robbed|crashed my \w+|got a bad (?:grade|mark|score))\b/.test(ev)) return "setback";
    if (/\b(?:got|landed|was offered|been offered|received|won)\s+(?:the |a |my |an |our )?(?:new |first |dream |full )?(?:job|promotion|raise|scholarship|internship|offer|place|visa|license|licence|degree|diploma|award|prize|lottery|house|apartment|puppy|kitten|grant|contract)\b/.test(ev) ||
        /\b(?:got|was|been|am|i'm|are|we're|getting|just got)\s+(?:promoted|engaged|married|accepted|hired|admitted|selected|published|pregnant)\b/.test(ev) ||
        /\b(?:passed|aced|won|finished|completed|graduated|nailed|beat|ran|climbed|published|launched|opened)\s+(?:my|the|our|a|an|from|his|her|their)\b/.test(ev) ||
        /\b(?:had|welcomed) (?:a|our|my) (?:baby|son|daughter)\b|\bbought (?:a|my first|our first|our|my|the) (?:house|home|car|flat|apartment)\b|\bturned \d+\b/.test(ev)) return "good";
    return null;
  }
  function newsReply(kind, ev, feelingLine) {
    var f = feelingLine ? " " + feelingLine : "";
    switch (kind) {
      case "good": return "Congratulations — " + ev + "! That's " + vary(["great news", "wonderful news", "fantastic news"], "news+") + "." + f + " " +
                          vary(["How are you celebrating?", "You must be proud — what's next?", "Tell me more!"], "news+2");
      case "grief": return "I'm so sorry to hear that " + ev + "." + f + " Losing someone you love is really hard, and there's no right way to feel about it. If you'd like to talk about them, I'm here.";
      case "breakup": return "I'm sorry to hear that " + ev + "." + f + " Breakups hurt, even when they're for the best. I'm here if you want to talk it through.";
      case "health": return "I'm sorry to hear that " + ev + "." + f + " I hope you feel better soon — rest and fluids help, and it's worth checking in with a doctor if it gets worse or doesn't improve.";
      case "setback": return "I'm sorry to hear that " + ev + "." + f + " That's disappointing, but one setback doesn't define you. If you'd like, we can think through what to do next.";
    }
    return null;
  }
  /* the speaker's first person as the reply's second person */
  function flipPerson(s) {
    return String(s || "").replace(/\b(i was|i am|i'm|i've|i'll|i'd|we're|we've|we'll|we were|i|me|my|mine|myself|we|us|our|ours|am)\b/gi, function (w) {
      return { "i was": "you were", "i am": "you are", "i'm": "you're", "i've": "you've", "i'll": "you'll", "i'd": "you'd", "we're": "you're",
               "we've": "you've", "we'll": "you'll", "we were": "you were", i: "you", me: "you", my: "your", mine: "yours", myself: "yourself",
               we: "you", us: "you", our: "your", ours: "yours", am: "are" }[w.toLowerCase()] || w;
    });
  }

  /* ---------------------------------------------------- intent analysis */

  function analyze(text) {
    var I = analyzeLower(text);
    if (!I) return null;
    /* the user's own casing for the slots ("Paris", not "paris") */
    var src = clean(text), proper = {};
    /* names capitalised mid-sentence keep their casing even after the slot
       was re-worded ("my trip to spain" -> "your trip to Spain") */
    src.split(/(?<=[.!?])\s+/).forEach(function (sent) {
      sent.split(/\s+/).slice(1).forEach(function (w) { w = w.replace(/[^A-Za-z'-]/g, ""); if (/[A-Z]/.test(w) && w !== "I") proper[w.toLowerCase()] = w; });
    });
    function orig(x) {
      if (!x) return x;
      var i = src.toLowerCase().indexOf(String(x).toLowerCase());
      if (i >= 0) return src.substr(i, String(x).length);
      return String(x).replace(/[A-Za-z][A-Za-z'-]*/g, function (w) { return proper[w.toLowerCase()] || w; });
    }
    ["topic", "said", "cause", "claim", "event"].forEach(function (k) { if (typeof I[k] === "string") I[k] = orig(I[k]); });
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
    /* a greeting is answered in kind; thanks is acknowledged (with a
       goodbye when it carries one) */
    if ((m = bare.match(/^(?:oh\s+)?(hi|hello|hey|hiya|howdy|heya|hullo|yo|greetings|sup|hey hey)(?:\s+(?:there|everyone|all|friend|buddy|again|cell4|you))?[!.\s]*$/)))
      return { intent: "greeting", part: null, word: m[1] };
    if ((m = bare.match(/^(?:(?:ok(?:ay)?|great|cool|perfect|awesome|nice|alright|oh)[,!\s]+)?(?:thanks|thank you|thank u|thx|ty|cheers|many thanks)(?:\s+(?:so much|a lot|a bunch|very much|again|anyway|for (?:the|your|all the|all your) (?:help|answer|answers|explanation|info|information|time)))*(?:[,!.\s]+(.*))?$/))) {
      var after = (m[1] || "").trim();
      if (!after) return { intent: "thanks" };
      if (/^(?:bye|goodbye|good bye|see you|see ya|good night|goodnight|later|cya|talk (?:to you )?(?:later|soon)|gotta go|got to go|bye for now|take care)\b/.test(after)) return { intent: "thanks", bye: true };
    }
    /* time-of-day greetings are mirrored */
    if ((m = bare.match(/^(?:good\s+)(morning|afternoon|evening|day)(?:\s+to you)?(?:[,!\s]+(?:there|friend|everyone))?$/)))
      return { intent: "greeting", part: m[1] };
    /* who the assistant is: an introduction, its name, who made it */
    if (/^(?:so\s+|ok(?:ay)?\s+|and\s+)?(?:tell me (?:a (?:little |bit )?|a little bit )?(?:more )?about (?:yourself|you)|introduce yourself|who are you|who r u|what(?:'s| is) your name|do you have a name|what should i call you|what do (?:i|people) call you|who (?:made|built|created|wrote|programmed|designed|developed) you|where do you come from|where are you from)$/.test(bare))
      return { intent: "intro", about: bare };
    /* affection or dislike aimed at the assistant */
    if ((m = bare.match(/^i (?:really |kind of |kinda |just |totally )?(love|like|adore|hate|dislike|miss|appreciate) (?:you|u|talking to you|chatting with you|talking with you)(?:\s+(?:so much|a lot|too|very much))?$/)))
      return { intent: "affection", verb: m[1] };
    /* words about words: rhymes, opposites, synonyms */
    if ((m = bare.match(/^(?:what|which)(?: words?)? rhymes? with\s+([a-z]+)$|^(?:give me |tell me |list |name )?(?:some |a few |any )?(?:words? )?(?:that )?rhym(?:e|es|ing) with\s+([a-z]+)$|^what(?:'s| is) a (?:word that )?rhym(?:e|es) (?:for|with)\s+([a-z]+)$/)))
      return { intent: "rhyme", word: m[1] || m[2] || m[3] };
    if ((m = bare.match(/^(?:what(?:'s| is) )?(?:the |an )?(?:opposite|antonym) (?:of|for)\s+([a-z]+)$|^(?:give me|tell me) (?:the |an )?(?:opposite|antonym) (?:of|for)\s+([a-z]+)$/)))
      return { intent: "opposite", word: m[1] || m[2] };
    if ((m = bare.match(/^(?:what(?:'s| is) (?:a |another )?(?:word|synonym) (?:for|meaning)|(?:give me|tell me) (?:a |another )?(?:synonym|word) for|(?:a |another )?synonym (?:of|for)|what(?:'s| is) another word for)\s+([a-z]+)$/)))
      return { intent: "synonym", word: m[1] };
    /* a request for a recommendation, which needs the person's taste */
    if ((m = bare.match(/^(?:can you |could you |would you |please )?(?:recommend|suggest)(?: me| to me)?\s+(?:a |an |some |any |me a |me some )?(?:good |great |nice |fun |new |interesting )?([a-z]+(?: [a-z]+)?)(?:\s+(?:to|for)\s+.+)?$|^what (?:should|can|could) i (eat|cook|make|watch|read|play|listen to|do|buy|wear|get)(?:\s+.+)?$/)))
      return { intent: "recommend", thing: m[1] || null, verb: m[2] || null };
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
    if ((m = bare.match(/^(?:(?:honestly|ugh|well|oh|man|and|but|yeah|omg|wow|sigh)[,!\s]+)*(?:i'm|i am|im|i feel|i've been feeling|i have been feeling|i'm feeling|i am feeling|feeling|i've been|i have been|i get|i got|i'm getting|i am getting|i was|i'm just|i am just)\s+((?:(?:so|really|very|a bit|a little|a little bit|kind of|kinda|pretty|quite|super|extremely|a lot|incredibly|totally|completely|absolutely|just|too|rather|somewhat|seriously)\s+)*)([a-z]+)(?:\s+out)?(?:\s+(?:today|tonight|right now|now|lately|recently|again|these days|this week|this morning|at the moment|all day))?(?:\s+(about|because of|over|with|by|for|at|of|to)\s+(.+)|\s*(?:[,;:\u2014-]\s*|\s+)(?:(?:because|since|as|that|'cause|cause|coz)\s+)?((?:i|i'm|i've|we|my|our|it|it's|they|he|she|the|this|everything|nothing|someone|somebody|nobody|people|there)\b.*))?$/))) {
      var w = m[2];
      if (AFFECT[w] && !(AFFECT[w][0] === "fine" && (m[4] || m[5]))) {
        var ev = m[5] ? flipPerson(m[5]) : null;
        return { intent: "feeling", affect: w, kind: AFFECT[w][0], valence: AFFECT[w][1], degree: (m[1] || "").trim(),
                 cause: m[4] ? m[3] + " " + flipPerson(m[4]) : null, event: ev, eventKind: m[5] ? newsKind(m[5]) : null };
      }
    }
    /* news about the speaker's life, with no emotion word: "I got
       promoted", "my cat died", "I failed my test" */
    if (!/\?/.test(l) && (m = bare.match(/^(?:(?:guess what|omg|wow|yay|ugh|sadly|unfortunately|well|so|today|yesterday|finally)[,!\s]+)*((?:i|we|my\s+[a-z]+(?:\s+[a-z]+)?|our\s+[a-z]+)\s+(?:just\s+|finally\s+|recently\s+|actually\s+|officially\s+)?.+)$/)) &&
        m[1].split(/\s+/).length <= 14) {
      var nk = newsKind(m[1]);
      if (nk) return { intent: "news", event: flipPerson(m[1]), kind: nk };
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
      /* the pipeline's own comparison answers first (it honours "in three
         bullets" and keeps the pair for "which one is faster?"); this one
         stands in only when the gate finds no real contrast */
      return { intent: "compare", options: [stripArt(m[1] || m[3] || m[5] || m[7]), stripArt(m[2] || m[4] || m[6] || m[8]).replace(/\s+(?:in|as|using|with)\s+(?:exactly\s+|just\s+|only\s+)?(?:a |an |one |two |three |four |five |\d+ )?(?:bullets?|bullet points|sentences?|words|lines|paragraphs?|table|list)\b.*$/, "")], passive: true };
    /* magnitudes */
    /* "which is closer to the sun, venus or mars": the reference point is
       part of the question, not of the first option */
    var ADJ = "bigger|larger|smaller|heavier|lighter|older|younger|faster|slower|taller|shorter|longer|hotter|colder|farther|further|closer|nearer|more populous|higher|deeper|wider|greater|brighter|denser";
    if ((m = bare.match(new RegExp("^which (?:is|one is|are|has|was)\\s+(" + ADJ + ")\\s+(?:to|from)\\s+([^,]+?)\\s*,\\s*(.+?)\\s+or\\s+(.+)$"))))
      return { intent: "magnitude", adj: m[1], ref: stripArt(m[2]), options: [stripArt(m[3]), stripArt(m[4])], said: [m[3].trim(), m[4].trim()] };
    if ((m = bare.match(new RegExp("^which (?:is|one is|are|has|was)\\s+(" + ADJ + ")[,:]?\\s+(.+?)\\s+or\\s+(.+)$"))))
      return { intent: "magnitude", adj: m[1], options: [stripArt(m[2]), stripArt(m[3])], said: [m[2].trim(), m[3].trim()] };
    if ((m = bare.match(new RegExp("^(?:is|are)\\s+(.+?)\\s+(" + ADJ + ")(?:\\s+(?:to|from)\\s+(.+?))?\\s+than\\s+(.+)$"))))
      return { intent: "magnitude", adj: m[2], ref: m[3] ? stripArt(m[3]) : null, options: [stripArt(m[1]), stripArt(m[4])], said: [m[1].trim(), m[4].trim()], asked: stripArt(m[1]) };
    /* open questions: no factual answer to look up */
    if (/\b(?:meaning|purpose|point) of (?:life|existence|living|being alive|it all|everything|our lives|my life|human life)\b|^why (?:are we here|do we exist|does anything exist|is there something rather than nothing)\b|^what (?:happens|comes) after (?:we die|death)\b|^(?:is there|does) (?:a )?god (?:exist)?\b|^what(?:'s| is) the point of (?:life|living|it all)\b|^what is happiness\b/.test(bare))
      return { intent: "open", topic: bare };
    if ((m = bare.match(/^what do you think (?:about|of)\s+(.+)$|^what(?:'s| is) your (?:opinion|view|take) on\s+(.+)$|^do you (?:like|love|enjoy|prefer)\s+(.+)$|^what(?:'s| is) your fav(?:ou|o)rite\s+(.+)$/)))
      return { intent: "opinion", topic: stripArt(m[1] || m[2] || m[3] || m[4]) };
    /* how-to and advice */
    if ((m = bare.match(/^(?:(?:can you |could you )?give me |do you have |i need |i want )?(?:any |some |a few )?(?:tips|advice|suggestions|ideas|pointers)\s+(?:for|on|about)\s+(.+)$|^what(?:'s| is| are) (?:a |the |some )?(?:good|best|easiest) ways? to\s+(.+)$|^how (?:can|could|do|should) i (?:get better at|improve(?: at| my)?|stop|start|become|learn to|(be) (?=more |less |better |a better ))\s*(.+)$/)))
      return { intent: "advice", topic: m[3] ? stripArt((m[3] === "be" ? "being " : "") + m[4]) : stripArt(m[1] || m[2]) };
    if ((m = bare.match(/^(?:how (?:do|can|should|would) (?:i|you|we|one)|how to)\s+(?!do$)(.+)$|^(?:what are the )?steps (?:to|for)\s+(.+)$|^(?:give me )?instructions (?:for|on)\s+(.+)$/)) &&
        !/^how (?:do|does|did) (?:it|that|this)\b/.test(bare))
      return { intent: "procedure", topic: stripArt(m[1] || m[2] || m[3]) };
    /* "is it bad to skip breakfast": a value judgement about an action */
    if ((m = bare.match(/^(?:is it|isn't it|would it be)\s+(good|bad|safe|dangerous|healthy|unhealthy|harmful|okay|ok|normal|wrong|rude|legal|illegal|smart|wise|necessary)\s+(?:for (?:you|me|us|people|kids|children|a person)\s+)?to\s+(.+)$/)))
      return { intent: "yesno", subject: "it", said: "it", predicate: m[1], toVP: m[2], "for": null, passive: true };
    /* "is a tomato a fruit or a vegetable": which of two kinds */
    if ((m = bare.match(/^(?:is|are)\s+((?:a |an |the )?[a-z]+(?: (?!(?:a|an|the)\b)[a-z]+)?)\s+(?:a |an )?([a-z]+)\s+or\s+(?:a |an )?([a-z]+)$/)))
      return { intent: "either", subject: stripArt(m[1]), said: m[1], options: [m[2], m[3]] };
    /* claims to check */
    if ((m = bare.match(/^is it (?:true|correct|a fact|right) that\s+(.+)$/)))
      return { intent: "claim", claim: m[1] };
    /* no response of their own, but a definition does not answer them:
       "why do cats purr", "is coffee bad for you" */
    if ((m = bare.match(/^why\s+(do|does|did|is|are|was|were|can|can't|cannot|don't|doesn't|would|should|won't|isn't|aren't)\s+(.+)$/)))
      return { intent: "why", aux: m[1], topic: m[2], passive: true };
    if ((m = bare.match(/^(?:is|are|was|were|can|does|do|will|should)\s+(.+?)\s+(good|bad|safe|dangerous|healthy|unhealthy|harmful|toxic|poisonous|true|real|possible|legal|necessary|better|worse|worth it|okay|ok)(?:\s+for\s+(.+))?$/)))
      return { intent: "yesno", subject: stripArt(m[1]), said: m[1], predicate: m[2], "for": m[3] || null, passive: true };
    /* any yes/no about a subject and a predicate: "is the earth flat",
       "can penguins fly" -- its answer must speak to the predicate */
    if ((m = bare.match(/^(?:is|are|was|were)\s+((?:the |a |an )?[a-z]+(?: (?!(?:a|an|the)\b)[a-z]+)?)\s+(a |an )?([a-z]+)$/)) || (m = bare.match(/^(?:can|could|do|does|did)\s+((?:the |a |an )?[a-z]+(?: (?!(?:a|an|the)\b)[a-z]+)?)\s+()([a-z]+)$/)))
      return { intent: "yesno", subject: stripArt(m[1]), said: m[1], predicate: m[3], predSaid: (m[2] || "") + m[3], "for": null, passive: true, open: true };
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
    /* "released in 2013" carries its own verb: it WAS released */
    if (r === "time") return /^(?:first |originally )?(?:released|created|founded|built|written|published|launched|invented|discovered|established|introduced|completed|opened|born|formed|designed|developed)\b/i.test(v) ? "was " + v : /\bold$/i.test(v) ? "is " + v : /^from\b/i.test(v) ? "dates " + v : "dates to " + v.replace(/^in\s+/i, "");
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
    var first = String(k.defn || "").split(/(?<=\.)\s/)[0];
    /* set a size against Earth's when both are known: a comparison makes a
       number mean something */
    var cmp = "";
    if (k.rel && k.rel.size && !/^earth$/i.test(k.name)) {
      var earth = knowledgeOf("earth"), a = measure(k.rel.size), b = earth ? measure(earth.rel.size) : null;
      if (a && b && a.unit === b.unit && b.value) {
        var r = a.value / b.value;
        cmp = r >= 1.5 ? " (about " + (r >= 10 ? Math.round(r) : Math.round(r * 10) / 10) + " times as wide as Earth)" : r <= 0.67 ? " (about " + Math.round(100 * r) + "% of Earth's width)" : "";
      }
    }
    keys.forEach(function (r) { if (k.rel && k.rel[r] && bits.length < 2) bits.push(attrPhrase(r, k.rel[r]) + (r === "size" ? cmp : "")); });
    return "Here's one: " + first + (bits.length ? " It " + bits.join(", and ") + "." : "");
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
  /* the definition's own subject and verb: "Bacteria are ...", "A virus
     is ...", so a sentence built on it agrees in number */
  function subjectOf(k, fallback) {
    if (k && k.source === "kb") {
      var m = String(k.defn || "").split(/(?<=\.)\s/)[0].match(/^(.+?)\s+(is|are|was|were)\s+/);
      if (m && m[1].split(/\s+/).length <= 5) return { np: m[1], be: m[2] };
    }
    if (k && k.gloss) return { np: (/^(?:a|an)\s/i.test(k.gloss) ? (/^[aeiou]/i.test(k.name) ? "an " : "a ") : "") + k.name, be: "is" };
    return { np: fallback || (k && k.name) || "", be: "is" };
  }
  /* inside a sentence an article, or a common noun that opened its own
     definition ("Bacteria are ..."), is lower case; a name is not */
  function midSentence(np, k) {
    np = String(np).replace(/^(A|An|The)\b/, function (x) { return x.toLowerCase(); });
    return k && k.name && /^[a-z]/.test(k.name) && np.toLowerCase().indexOf(k.name.toLowerCase()) === 0 ? np.charAt(0).toLowerCase() + np.slice(1) : np;
  }
  function firstSentence(d) { return String(d || "").split(/(?<=\.)\s/)[0]; }
  var GENERIC_TYPE = /^(?:concept|thing|term|word|idea|topic|entity|other|misc)$/;

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
    var cause = I.cause ? " " + I.cause : "", deg = I.degree ? I.degree + " " : "";
    if (I.kind === "fine") return vary(["Glad to hear it!", "Good to hear!", "Nice — glad things are okay."], "fine") + " What's on your mind?";
    /* a feeling with the event behind it: respond to the event */
    if (I.event) {
      var line = I.valence > 0 ? "No wonder you're " + deg + I.affect + "!" : "It's natural to feel " + deg + I.affect + ".";
      var nr = I.eventKind ? newsReply(I.eventKind, I.event, line) : null;
      if (nr) return nr;
      if (I.valence > 0) return "That's great to hear — " + I.event + "! Tell me more?";
      return "I'm sorry you're feeling " + deg + I.affect + " — " + I.event + " sounds hard. " + (OFFER[I.kind] || "");
    }
    if (I.valence > 0) {
      return vary(["That's great to hear", "Love that", "That's wonderful"], "feel+") + (I.cause ? " — " + (I.affect === "excited" ? "being excited" : "feeling " + I.affect) + cause + " is a good place to be" : "") +
             "! " + (I.cause ? "Tell me more?" : "What's got you feeling " + I.affect + "?");
    }
    if (I.kind === "boredom") return "Being bored is no fun. " + OFFER.boredom;
    var norm = I.kind === "pressure" && !(I.cause && AHEAD.test(I.cause)) ? "A lot of people feel that way — it usually means something matters to you." : NORMALISE[I.kind];
    return "I'm sorry you're feeling " + I.affect + cause + ". " + norm + " " + OFFER[I.kind];
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
    out.push("It depends on what you're looking for — both can be good choices.");
    if (ka) { var da = subjectOf(ka, na); out.push(cap(da.np) + " " + da.be + " " + predicate(ka).replace(/\.$/, "") + "."); }
    if (kb) { var db = subjectOf(kb, nb); out.push(cap(db.np) + " " + db.be + " " + predicate(kb).replace(/\.$/, "") + "."); }
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
      var ca = subjectOf(ka, na), cb = subjectOf(kb, nb);
      out.push(cap(ca.np) + " " + ca.be + " " + predicate(ka).replace(/\.$/, "") + ", while " + midSentence(cb.np, kb) + " " + cb.be + " " + predicate(kb).replace(/\.$/, "") + ".");
      if (cmp && cmp.dims) out.push("In short: " + (Array.isArray(cmp.dims) ? cmp.dims.join("; ") : String(cmp.dims)) + ".");
      else if (ka.type && kb.type && ka.type === kb.type && !GENERIC_TYPE.test(ka.type)) out.push("Both are " + (/s$/.test(ka.type) ? ka.type : ka.type + "s") + ".");
      /* a shared word in both definitions is the axis they differ along */
      /* the attributes both have, side by side */
      var both = Object.keys(ka.rel || {}).filter(function (r) { return kb.rel && kb.rel[r] && !/^(?:type|location|symbol)$/.test(r) && ka.rel[r] !== kb.rel[r]; });
      if (both.length) out.push("Side by side: " + both.slice(0, 3).map(function (r) { return r + " — " + na + ": " + ka.rel[r] + "; " + nb + ": " + kb.rel[r]; }).join(". ") + ".");
    } else {
      var k = ka || kb, other = ka ? nb : na, sk = subjectOf(k, k.name);
      out.push(cap(sk.np) + " " + sk.be + " " + predicate(k).replace(/\.$/, "") + ". I don't have a reliable definition of " + other + " to set against it, so I can't spell out the difference.");
    }
    return out.join(" ");
  }

  var ORDINAL = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  /* "the second planet from the Sun" -> a place in an ordered series */
  function position(k) {
    var m = String(k && k.defn || "").match(/\bthe (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)) ([a-z]+) (from|to|in|of) (?:the )?([A-Za-z]+)/i);
    if (!m) return null;
    var n = ORDINAL[m[1].toLowerCase()] || parseInt(m[1], 10);
    return n ? { n: n, word: m[1].toLowerCase(), noun: m[2].toLowerCase(), prep: m[3].toLowerCase(), ref: m[4] } : null;
  }
  var ATTR_NAME = { size: "size", length: "length", height: "height", population: "population", time: "age", birth: "age", speed: "speed",
                    temperature: "temperature", distance: "distance", mass: "mass", weight: "weight", depth: "depth", width: "width" };
  /* a stand-in measure when the asked one is not stored, with its limit
     said out loud: size suggests mass but does not fix it */
  var PROXY = { heavier: ["size", "size alone doesn't settle mass"], lighter: ["size", "size alone doesn't settle mass"] };
  function possessive(n) { return /s$/.test(n) ? n + "'" : n + "'s"; }
  function magnitude(I) {
    var a = I.options[0], b = I.options[1], ka = knowledgeOf(a), kb = knowledgeOf(b);
    var said0 = I.said || I.options, nva = numValue(said0[0]), nvb = numValue(said0[1]);
    if (nva && nvb) return numericMagnitude(I, nva, nvb);
    if (!ka && !kb) return "I don't have " + said0[0] + " or " + said0[1] + " in my local knowledge, so I can't compare them reliably.";
    if (!ka || !kb) return "I don't know enough about " + (ka ? said0[1] : said0[0]) + " to compare it with " + (ka ? said0[0] : said0[1]) + " reliably.";
    /* 1. places in the same ordered series */
    if (/^(?:closer|nearer|farther|further)$/.test(I.adj)) {
      var pa = position(ka), pb = position(kb);
      if (pa && pb && pa.noun === pb.noun && pa.ref.toLowerCase() === pb.ref.toLowerCase() && pa.prep === "from" && pa.n !== pb.n &&
          (!I.ref || stripArt(I.ref).toLowerCase() === pa.ref.toLowerCase())) {
        var near = /^(?:closer|nearer)$/.test(I.adj), aW = near ? pa.n < pb.n : pa.n > pb.n;
        var wS = aW ? said0[0] : said0[1], lS = aW ? said0[1] : said0[0], wP = aW ? pa : pb, lP = aW ? pb : pa;
        return cap(wS) + " is " + I.adj + " " + (near ? "to" : "from") + " the " + pa.ref + ": it's the " + wP.word + " " + pa.noun + " from the " + pa.ref +
               ", while " + lS + " is the " + lP.word + ".";
      }
    }
    /* 2. a stored measure of the asked attribute, units normalised */
    var keys = ATTR_OF[I.adj] || ["size"], ma = null, mb = null, key = null;
    for (var i = 0; i < keys.length && !(ma && mb); i++) {
      var ra = ka.rel[keys[i]], rb = kb.rel[keys[i]];
      /* a distance "from Earth" does not answer "closer to the Sun" */
      if (I.ref && keys[i] === "distance" && [ra, rb].some(function (v) { var f = String(v || "").match(/\bfrom (?:the )?([A-Za-z]+)/); return f && f[1].toLowerCase() !== stripArt(I.ref).toLowerCase(); })) continue;
      if (ra && rb) { var x = measure(ra), y = measure(rb); if (x && y && x.unit === y.unit) { ma = x; mb = y; key = keys[i]; } }
    }
    if (!ma) {
      /* 3. a stand-in measure, with its limit stated */
      var px = PROXY[I.adj], pra = px && ka.rel[px[0]], prb = px && kb.rel[px[0]], px1 = pra && measure(pra), py1 = prb && measure(prb);
      if (px1 && py1 && px1.unit === py1.unit && px1.value !== py1.value) {
        var bigA = px1.value > py1.value, rr = Math.max(px1.value, py1.value) / Math.min(px1.value, py1.value);
        var likely = (I.adj === "heavier") === bigA ? said0[0] : said0[1];
        return "I don't have their masses stored, but by size " + (bigA ? said0[0] : said0[1]) + " is " +
               (rr >= 1.5 ? "about " + (rr >= 10 ? Math.round(rr) : Math.round(rr * 10) / 10) + " times" : "slightly") + " as wide (" +
               (bigA ? pra : prb) + " versus " + (bigA ? prb : pra) + "), so " + likely + " is very likely " + I.adj + " — though " + px[1] + ".";
      }
      /* 4. what is known, and what is missing */
      var attr = ATTR_NAME[keys[0]] || keys[0];
      var ka1 = keys.filter(function (k) { return ka.rel[k]; })[0], kb1 = keys.filter(function (k) { return kb.rel[k]; })[0];
      if (ka1 && !kb1) return "I have " + possessive(said0[0]) + " " + (ATTR_NAME[ka1] || ka1) + " (" + ka.rel[ka1] + ") but not " + possessive(said0[1]) + ", so I can't compare them reliably from my local knowledge.";
      if (kb1 && !ka1) return "I have " + possessive(said0[1]) + " " + (ATTR_NAME[kb1] || kb1) + " (" + kb.rel[kb1] + ") but not " + possessive(said0[0]) + ", so I can't compare them reliably from my local knowledge.";
      return "I don't have the " + attr + " of " + said0[0] + " or " + said0[1] + " in my local knowledge, so I can't compare them reliably.";
    }
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

  /* ------------------------------------------------ words about words */
  /* the words the system can see: the lexicon's headwords and glosses and
     the knowledge base's names and definitions */
  var VOCAB_CACHE = null;
  function vocabulary() {
    if (VOCAB_CACHE) return VOCAB_CACHE;
    var set = Object.create(null), L = get("C4LMLexicon"), KB = get("C4LMKB");
    function addText(t) { String(t || "").toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).forEach(function (w) { if (/^[a-z]{2,12}$/.test(w)) set[w] = 1; }); }
    if (L && L.raw) Object.keys(L.raw).forEach(function (w) { addText(w); try { var lx = L.lookup(w); (lx && lx.senses || []).forEach(function (x) { addText(x.gloss); }); } catch (e) {} });
    /* definitions, not names: "Rabat" is a city, not an everyday word */
    if (KB && KB.entities) KB.entities().forEach(function (e) { addText(String(e.defn || "").replace(/\b[A-Z][a-z]+\b/g, " ")); });
    VOCAB_CACHE = Object.keys(set);
    return VOCAB_CACHE;
  }
  function knownWord(w) {
    var L = get("C4LMLexicon"), CO = get("C4LMCore");
    try { return !!((L && L.lookup && L.lookup(w)) || (CO && CO.knownWord && CO.knownWord(w))); } catch (e) { return false; }
  }
  /* rhyme by spelling: the last vowel group and what follows it, with the
     English w/qu + a exception ("what" does not rhyme with "cat") */
  function rime(w) { var m = String(w).match(/[aeiouy]+[^aeiouy]*$/); return m ? m[0] : ""; }
  function rhymes(word) {
    word = word.toLowerCase();
    var r = rime(word), wa = function (x) { return /(?:wh?|qu)a[^aeiouy]*$/.test(x) && /^a/.test(rime(x)); };
    if (!r) return [];
    return vocabulary().filter(function (x) {
      return x !== word && rime(x) === r && x.length <= 10 && !(wa(x) && !wa(word)) && x.slice(-word.length) !== word && word.slice(-x.length) !== x &&
             (r !== "y" || x.length <= 4);
    }).sort(function (a, b) { return a.length - b.length || (a < b ? -1 : 1); }).slice(0, 8);
  }
  /* opposites: the comparative pairs the reasoner already uses (taller /
     shorter -> tall / short), glosses that differ only in an opposed word
     ("having a high temperature" / "having a low temperature"), and
     negating prefixes that make a real word */
  var FUNCTION_OPPOSITES = { more: "less", much: "little", above: "below", with: "without", over: "under", inside: "outside", before: "after",
                             first: "last", start: "end", open: "closed", on: "off", up: "down", "in": "out", increase: "decrease", gain: "loss",
                             present: "absent", presence: "absence", high: "low", many: "few", full: "empty", early: "late" };
  var IRREG_BASE = { farther: "far", further: "far", better: "good", worse: "bad", elder: "old", less: "little", more: "much" };
  function plainAdj(c) {
    c = String(c).toLowerCase();
    if (IRREG_BASE[c]) return IRREG_BASE[c];
    var cands = [];
    if (/ier$/.test(c)) cands.push(c.slice(0, -3) + "y");
    if (/([^aeiou])\1er$/.test(c)) cands.push(c.slice(0, -3));
    cands.push(c.slice(0, -1), c.slice(0, -2));
    for (var i = 0; i < cands.length; i++) if (knownWord(cands[i])) return cands[i];
    return cands[cands.length - 1];
  }
  function oppositePairs() {
    var pairs = {}, EV = get("C4LMEveryday"), comp = (EV && EV.OPPOSITE) || {};
    function add(a, b) { if (a && b && a !== b) { (pairs[a] = pairs[a] || []); if (pairs[a].indexOf(b) < 0) pairs[a].push(b); } }
    Object.keys(comp).forEach(function (c) { var a = plainAdj(c), b = plainAdj(comp[c]); add(a, b); add(b, a); });
    Object.keys(FUNCTION_OPPOSITES).forEach(function (a) { add(a, FUNCTION_OPPOSITES[a]); add(FUNCTION_OPPOSITES[a], a); });
    return pairs;
  }
  function opposites(word) {
    word = word.toLowerCase();
    var pairs = oppositePairs(), out = [], why = {}, L = get("C4LMLexicon");
    (pairs[word] || []).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    /* gloss alignment over the lexicon's adjectives */
    var g0 = null;
    try { var lx0 = L && L.lookup ? L.lookup(word) : null; g0 = lx0 && lx0.senses ? lx0.senses.filter(function (x) { return x.pos === "adj"; })[0] : null; } catch (e) { g0 = null; }
    if (g0 && L && L.raw) {
      var t0 = g0.gloss.toLowerCase().split(/\s+/);
      Object.keys(L.raw).forEach(function (u) {
        if (u === word) return;
        var lu = null; try { lu = L.lookup(u); } catch (e) { lu = null; }
        var gu = lu && lu.senses ? lu.senses.filter(function (x) { return x.pos === "adj"; })[0] : null;
        if (!gu) return;
        var tu = gu.gloss.toLowerCase().split(/\s+/);
        if (tu.length !== t0.length) return;
        var diff = [];
        for (var i = 0; i < t0.length; i++) if (t0[i] !== tu[i]) diff.push([t0[i], tu[i]]);
        if (diff.length === 1 && (pairs[diff[0][0]] || []).indexOf(diff[0][1]) >= 0) {
          if (out.indexOf(u) < 0) out.push(u);
          why[u] = word + " is \u201c" + g0.gloss + "\u201d and " + u + " is \u201c" + gu.gloss + "\u201d";
        }
      });
    }
    /* a negating prefix that makes a real word, or removing one */
    var pre = word.match(/^(un|in|im|il|ir|dis|non)([a-z]{3,})$/);
    if (pre && knownWord(pre[2]) && out.indexOf(pre[2]) < 0) out.push(pre[2]);
    if (!out.length) ["un", "dis", "in", "im", "non"].forEach(function (p) { if (!out.length && knownWord(p + word) && (p !== "im" || /^[bmp]/.test(word)) && (p !== "in" || !/^[bmp]/.test(word))) out.push(p + word); });
    return { words: out, why: why };
  }
  function synonyms(word) {
    var L = get("C4LMLexicon"), lx = null;
    try { lx = L && L.lookup ? L.lookup(word) : null; } catch (e) { lx = null; }
    if (!lx || !lx.senses || !lx.senses.length || !L.raw) return [];
    var s0 = lx.senses[0], STOPW = /^(?:a|an|the|of|or|and|to|in|on|for|with|by|as|that|is|be|having|being|something|someone|one)$/;
    var bag = function (g) { return g.toLowerCase().split(/[^a-z]+/).filter(function (x) { return x && !STOPW.test(x); }); };
    var b0 = bag(s0.gloss), out = [];
    Object.keys(L.raw).forEach(function (u) {
      if (u === word) return;
      var lu = null; try { lu = L.lookup(u); } catch (e) { lu = null; }
      (lu && lu.senses || []).forEach(function (x) {
        if (x.pos !== s0.pos || x.cls !== s0.cls) return;
        var b1 = bag(x.gloss), inter = b0.filter(function (y) { return b1.indexOf(y) >= 0; }).length, uni = b0.length + b1.length - inter;
        if (uni && inter / uni >= 0.5 && out.indexOf(u) < 0) out.push(u);
      });
      if (bag(s0.gloss).length === 1 && bag(s0.gloss)[0] === u && out.indexOf(u) < 0) out.push(u);
    });
    return out.slice(0, 5);
  }
  /* exact comparison of two written numbers: "3/4", "0.7", "45%" */
  function numValue(s) {
    var t = String(s || "").trim(), m;
    if ((m = t.match(/^(-?\d+)\s*\/\s*(\d+)$/)) && +m[2]) return { v: +m[1] / +m[2], num: +m[1], den: +m[2], text: t };
    if ((m = t.match(/^(-?\d+(?:\.\d+)?)\s*%$/))) return { v: +m[1] / 100, text: t };
    if ((m = t.match(/^-?\d+(?:\.\d+)?$/))) return { v: +t, text: t };
    return null;
  }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function numericMagnitude(I, a, b) {
    var big = /^(?:bigger|larger|greater|higher|more)$/.test(I.adj), small = /^(?:smaller|lower|less)$/.test(I.adj);
    if (!big && !small) return null;
    var dec = function (x) { var r = Math.round(x.v * 1000) / 1000; return (r === x.v ? "= " : "≈ ") + r; };
    if (a.v === b.v) return "Neither — they're equal: " + a.text + " " + dec(a) + " and " + b.text + " " + dec(b) + ".";
    var aW = big ? a.v > b.v : a.v < b.v, w = aW ? a : b, l = aW ? b : a;
    var common = "";
    if (a.den && b.den && a.den !== b.den) {
      var L = a.den / gcd(a.den, b.den) * b.den;
      common = " Over a common denominator: " + (a.num * L / a.den) + "/" + L + " versus " + (b.num * L / b.den) + "/" + L + ".";
    }
    return w.text + " is " + I.adj + ": " + w.text + " " + dec(w) + ", while " + l.text + " " + dec(l) + "." + common;
  }

  /* "why is the night sky dark" -> "why the night sky is dark": the
     question's auxiliary moves back behind its subject (the lexicon's parts
     of speech find where the subject ends) */
  function whyClause(I) {
    var aux = String(I.aux || "").toLowerCase(), topic = String(I.topic || "").replace(/[?.!]+$/, "");
    if (/^(?:do|does)$/.test(aux)) return "why " + topic;
    if (aux === "did" || !topic) return "that";
    var L = get("C4LMLexicon"), w = topic.split(/\s+/), n = /^(?:the|a|an|my|your|our|their|his|her|its|this|that|these|those)$/.test(w[0]) ? 2 : 1;
    function nounOnly(x) {
      try { var lx = L && L.lookup ? L.lookup(x) : null; return !!(lx && lx.senses && lx.senses.length && lx.senses.every(function (s) { return s.pos === "n"; })); } catch (e) { return false; }
    }
    while (n < w.length - 1 && nounOnly(w[n])) n++;
    if (n >= w.length) return "that";
    return "why " + w.slice(0, n).join(" ") + " " + aux + " " + w.slice(n).join(" ");
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
      case "greeting":
        out = I.part ? "Good " + I.part + "! How can I help?" :
              cap(/^(?:hello|hullo|greetings)$/.test(I.word) ? "hello" : /^(?:hey|heya|hey hey|yo|sup)$/.test(I.word) ? "hey" : "hi") + (ctx.who ? " " + ctx.who : "") + "! " +
              vary(["How can I help?", "What's on your mind today?", "Ask me anything — a fact, a calculation, a puzzle, or something to think through."], "greet"); break;
      case "thanks": out = vary(["You're welcome!", "Any time — glad it helped.", "Happy to help!"], "thanks") + (I.bye ? " Take care — bye for now!" : " Anything else you'd like to look at?"); break;
      case "news": out = newsReply(I.kind, I.event, ""); break;
      case "intro":
        out = /\b(?:name|call you)\b/.test(I.about) ? "I'm CELL4's local language system — you can just call me CELL4. I answer questions, work through math and logic step by step, and I'll tell you when I don't know something." :
              /\b(?:made|built|created|wrote|programmed|designed|developed|come from|are you from)\b/.test(I.about) ? "I was built as part of CELL4, and I run entirely in your browser — a reasoning engine, exact math tools and a local knowledge base, with no remote AI model doing the thinking." :
              "I'm CELL4's local language system, running entirely in your browser. " + capability();
        break;
      case "affection":
        out = /^(?:hate|dislike)$/.test(I.verb) ? "Sorry I've let you down. Tell me what went wrong and I'll do my best to fix it." :
              "That's kind of you to say — thank you! I'm a program, so I can't feel it back the way a person would, but I'm really glad our chats are useful to you.";
        break;
      case "rhyme": {
        var rh = rhymes(I.word);
        out = rh.length ? "Some words that rhyme with " + I.word + ": " + rh.join(", ") + "." : "I couldn't find a rhyme for " + I.word + " among the words I know.";
        route = "lexicon"; break;
      }
      case "opposite": {
        var op = opposites(I.word);
        out = op.words.length ? "The opposite of " + I.word + " is " + op.words.slice(0, 3).join(" or ") + "." + (op.why[op.words[0]] ? " (" + cap(op.why[op.words[0]]) + ".)" : "") :
              "I don't have a reliable opposite for " + I.word + " in my word lexicon.";
        route = "lexicon"; break;
      }
      case "synonym": {
        var sy = synonyms(I.word);
        out = sy.length ? "Words close in meaning to " + I.word + ": " + sy.join(", ") + "." : "I don't have a reliable synonym for " + I.word + " in my word lexicon, and I'd rather not guess.";
        route = "lexicon"; break;
      }
      case "recommend": {
        var what = I.thing ? I.thing.replace(/s$/, "") : { eat: "meal", cook: "dish", make: "dish", watch: "show or film", read: "book", play: "game", "listen to": "album", "do": "activity", buy: "option", wear: "outfit", get: "option" }[I.verb] || "option";
        out = "I don't know your taste, and I don't keep a catalogue of " + (/y$/.test(what) ? what.slice(0, -1) + "ies" : /(?:s|sh|ch|x)$/.test(what) ? what + "es" : what + "s") +
              " to pick from, so I'd rather not choose one at random. Tell me a couple you've enjoyed — or what you're in the mood for — and I'll help you narrow it down by what they have in common.";
        break;
      }
      case "either": {
        var ke = knowledgeOf(I.subject), hit = [];
        if (ke) {
          var blob = [ke.defn, ke.type, ke.gloss, JSON.stringify(ke.rel || {})].join(" ").toLowerCase();
          I.options.forEach(function (o) { if (new RegExp("\\b" + o.toLowerCase().replace(/s$/, "") + "s?\\b").test(blob)) hit.push(o); });
        }
        var subjE = String(I.said || I.subject).replace(/[?.!]+$/, "");
        /* settled by knowledge: answer now; otherwise let the other layers
           try first, and decline only after they have */
        if (hit.length !== 1 && !ctx.looked) return null;
        var other = hit.length === 1 ? I.options.filter(function (o) { return o !== hit[0]; })[0] : "";
        out = hit.length === 1 ? cap(subjE) + " is " + (/^[aeiou]/i.test(hit[0]) ? "an " : "a ") + hit[0] + ", not " + (/^[aeiou]/i.test(other) ? "an " : "a ") + other +
                                 " — " + (/s$/.test(I.subject) ? "they're " : "it's ") + predicate(ke).replace(/\.$/, "") + "." :
              "I can't tell from my local knowledge whether " + subjE + " is " + (/^[aeiou]/i.test(I.options[0]) ? "an " : "a ") + I.options[0] + " or " + (/^[aeiou]/i.test(I.options[1]) ? "an " : "a ") + I.options[1] + ", so I won't guess." + (ke ? " What I do know: " + firstSentence(ke.defn) : "");
        route = "knowledge"; break;
      }
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
      case "why":
        out = (ctx.federated ? "I couldn't find a reliable explanation of " : "I don't have a reliable explanation of ") + whyClause(I) +
              (ctx.federated ? "" : " in my local knowledge") + ", and I'd rather not guess at a cause." + (ctx.federated ? "" : " In tool mode I can look for one in public sources.");
        route = "knowledge"; break;
      case "yesno": {
        var aux = (clean(text).match(/^\w+/) || ["is"])[0].toLowerCase(), subj = String(I.said || I.subject).replace(/[?.!]+$/, "").trim();
        var kn = knowledgeOf(I.subject), known = kn ? " What I do know: " + firstSentence(kn.defn) : "";
        /* "do fish sleep" -> "fish sleep"; "does a dog bark" -> "a dog barks" */
        var third = function (v) { return /(?:s|sh|ch|x|z|o)$/.test(v) ? v + "es" : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ies" : v + "s"; };
        var claimTxt = I.toVP ? "it's " + I.predicate + " to " + I.toVP :
                       aux === "do" ? subj + " " + I.predicate : aux === "does" ? subj + " " + third(I.predicate) : subj + " " + aux + " " + (I.predSaid || I.predicate) + (I.for ? " for " + I.for : "");
        out = I.open ? (ctx.federated ? "I couldn't confirm from my local knowledge or the sources I checked" : "I can't confirm from my local knowledge") + " whether " + claimTxt + ", so I won't guess." + known :
              "I can't say reliably whether " + claimTxt + " from my local knowledge — it's the kind of claim that needs evidence I don't have here." + known;
        route = "knowledge"; break;
      }
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
    if ((result.route === "insufficient" || result.insufficientEvidence) && /^(?:procedure|advice|claim|compare|decide|magnitude|creative|why|yesno|open|either)$/.test(I.intent)) return false;
    /* a comparison, a decision or a magnitude must be answered AS one --
       both things named and set against each other -- whatever layer
       produced it ("Earth is the third planet from the Sun" mentions the
       Sun, but does not say which is heavier) */
    if ((I.intent === "compare" || I.intent === "decide" || I.intent === "magnitude") && result.route !== "comparison") {
      var names = I.options.map(function (o) { return o.toLowerCase(); }), t = String(result.text || "").toLowerCase();
      if (!names.every(function (n) { return t.indexOf(n.split(/\s+/)[0]) >= 0; })) return false;
      if (I.intent === "magnitude") return new RegExp("\\b(?:" + I.adj + "|" + baseAdj(I.adj) + "|" + oppositeAdj(I.adj) + "|than|versus|times as|the same)\\b").test(t);
      if (I.intent === "compare") return /\b(?:while|whereas|but|unlike|differ\w*|difference|both|however|on the other hand)\b/.test(t);
      return /\b(?:depends|choose|go with|better|if you|prefer)\b/.test(t);
    }
    if (I.intent === "either") {
      var te = String(result.text || "");
      /* "which of two" is never answered by yes or no */
      if (/^\s*(?:yes|no)\b/i.test(te) || /^\s*\S+\s+(?:means|has more than one sense)\b/i.test(te)) return false;
      return new RegExp("\\b" + String(I.subject).split(/\s+/).pop().replace(/s$/, "") + "\\w*\\b", "i").test(te) &&
             I.options.some(function (o) { return new RegExp("\\b" + o.replace(/s$/, "") + "\\w*\\b", "i").test(te); });
    }
    var defLike = /^(?:knowledge|lexicon|site|compose|explanation)$/.test(result.route || "") || result.defined || result.composed;
    if (!defLike) return true;
    if (I.intent === "procedure" || I.intent === "advice")
      return /\b(?:first|then|next|step|until|minutes?|add|place|put|use|try|avoid|keep|make sure)\b/i.test(result.text || "");
    /* a "why" needs a cause; a yes/no needs a verdict on the subject */
    if (I.intent === "why") return result.route === "explanation" || /^(?:why|cause|causes|reason|mechanism)$/.test(result.relation || "") ||
                                    /\b(?:because|due to|so that|therefore|causes?|caused|causing|results? in|leads? to|which is why|since|as a result)\b/i.test(result.text || "");
    if (I.intent === "yesno" && I.open) {
      /* a verdict, or a statement about the subject that speaks to the
         predicate -- a definition of the predicate is neither */
      var tq = String(result.text || ""), subj0 = String(I.subject).split(/\s+/).pop().replace(/s$/, "");
      if (/^(?:yes|no)\b/i.test(tq)) return true;
      if (/^\s*\S+\s+(?:means|has more than one sense)\b/i.test(tq)) return false;
      return new RegExp("\\b" + subj0 + "\\w*\\b", "i").test(tq) && new RegExp("\\b" + I.predicate.replace(/s$/, "") + "\\w*\\b", "i").test(tq);
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
