/* CELL4 conversation memory.
 *
 * Everything said in a conversation is kept: facts the user states about
 * themselves, notes they ask to have remembered, standing instructions about
 * how to answer, the topics discussed, and a transcript of every turn.
 *
 * Remembering and forgetting are commands, and they are READ, not matched.
 * The operative verb means what its definition says: "forget" is "to fail to
 * recall", so it removes; "keep" is "to continue to have", so it retains;
 * "ignore" is "to pay no attention to", so it removes. A verb the lexicon does
 * not hold is learned from the dictionaries through the same path every other
 * unknown word takes, and is then read the same way. Negation composes: "don't
 * forget X" retains, "stop remembering X" removes. The object says WHAT: a
 * thing that was discussed, a fact about the user, a kind of memory, or -- for
 * "previous instructions", "everything", "the context", "what I said" -- all
 * of it. "Forget about X but keep Y" is two clauses of opposite polarity, and
 * what one keeps survives whatever the other removes. Whatever else the
 * message asks is handed back as a residual question and answered normally.
 *
 * Long-term memory (facts, notes, instructions) survives a reload; topics and
 * the transcript belong to the session. "Forget everything" clears both.
 *
 * No model service: grammar, the lexicon, and the store below.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;
  function LX() { return root.C4LMLexicon || null; }
  function RZ() { return root.C4LMRealize || null; }
  var STORE_KEY = "c4lm.memory.v1";

  /* ============================================================== words */

  function expand(s) {
    return String(s == null ? "" : s)
      .replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"')
      .replace(/\bcan'?t\b/gi, "can not").replace(/\bcannot\b/gi, "can not")
      .replace(/\bwon'?t\b/gi, "will not")
      .replace(/\b(do|does|did|is|are|was|were|should|could|would|have|has|had|must)n'?t\b/gi, "$1 not")
      .replace(/\bi'm\b/gi, "I am").replace(/\bi've\b/gi, "I have").replace(/\bi'll\b/gi, "I will")
      .replace(/\bi'd\b/gi, "I would").replace(/\blet's\b/gi, "let us")
      .replace(/\b(what|where|who|when|how|that|it|there|here)'s\b/gi, "$1 is")
      .replace(/\b(you|we|they)'re\b/gi, "$1 are").replace(/\b(you|we|they)'ve\b/gi, "$1 have");
  }
  function tokens(s) { return String(s == null ? "" : s).toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []; }
  function spans(s) {
    var re = /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g, out = [], m;
    while ((m = re.exec(s))) out.push({ w: m[0], i: m.index });
    return out;
  }
  function ff(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/['\u2019]s\b/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function stop(w) { return !!(C && C.STOP && C.STOP[w]); }
  function rand() {
    var R = RZ();
    return R && R.variation && R.variation.random ? R.variation.random() : Math.random();
  }
  function pick(list) { return list[Math.floor(rand() * list.length) % list.length]; }
  function joinList(xs) {
    xs = (xs || []).filter(Boolean);
    if (xs.length < 2) return xs[0] || "";
    return xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
  }
  function trimEnd(s) { return String(s || "").replace(/[\s.!?,;:]+$/, ""); }

  var GENERIC = Object.create(null);
  ("thing things stuff part parts bit bits piece info information detail details data lot lots " +
   "whole something nothing whatever what which that this these those it its them they one ones " +
   "you your yours i me my mine myself we us our ours about regarding concerning the a an s just " +
   "also please now then there here some other another any").split(" ").forEach(function (w) { GENERIC[w] = 1; });

  function wordsOf(text) {
    var out = [];
    tokens(text).forEach(function (w) {
      if ((stop(w) || GENERIC[w]) && !/\d/.test(w)) return;
      if (w.length < 2 && !/\d/.test(w)) return;
      out.push(w);
      var sg = w.replace(/ies$/, "y").replace(/(?:ss)?es$/, function (m) { return m === "sses" ? "ss" : "e"; });
      if (/s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
      if (sg !== w) out.push(sg);
    });
    return out;
  }

  /* The lexicon reads inflections ("forgetting" -> "forget"); the handful of
     irregular forms it cannot strip are listed here. */
  var IRREG = { forgot: "forget", forgotten: "forget", kept: "keep", held: "hold", told: "tell",
                said: "say", did: "do", done: "do", was: "be", were: "be", been: "be", am: "be",
                is: "be", are: "be", has: "have", had: "have", made: "make", went: "go",
                gone: "go", knew: "know", known: "know", saw: "see", seen: "see", got: "get",
                began: "begin", begun: "begin", undid: "undo", undone: "undo", wrote: "write",
                written: "write", spoke: "speak", lost: "lose", took: "take", gave: "give",
                ran: "run", thought: "think" };
  function lemma(w) {
    w = String(w || "").toLowerCase();
    if (IRREG[w]) return IRREG[w];
    var L = LX(), hit = null;
    if (L) { try { hit = L.lookup(w); } catch (e) { hit = null; } }
    return hit && hit.word ? hit.word : w;
  }
  function sensesOf(word, pos) {
    var L = LX();
    if (!L || !word) return [];
    var w = String(word).toLowerCase(), hit = null;
    try { hit = L.lookup(IRREG[w] || w); } catch (e) { hit = null; }
    if (!hit || !hit.senses) return [];
    return hit.senses.filter(function (s) {
      if (!s || !s.gloss) return false;
      var verb = s.pos === "v" || s.pos === "verb";
      if (pos === "v") return verb;
      if (pos === "nominal") return !verb;
      return true;
    });
  }

  /* ------------------------------------------------ reading a definition
     A gloss is scanned for the first word that is about HAVING something
     (keep, retain, store, continue) or about MEMORY (recall, mind, attention,
     notice), or about their opposites (remove, discard, erase). Negation in
     the few words before it flips the polarity: "fail to recall", "pay no
     attention to", "put out of one's mind", "stop holding". */
  var RETAIN_MEM = /^(?:recall\w*|remember\w*|memor\w*|mind|minds|attention|attend\w*|notic\w*|heed\w*|record\w*)$/;
  var RETAIN_HAVE = /^(?:retain\w*|keep\w*|kept|hold\w*|held|stor\w*|sav\w*|preserv\w*|maintain\w*|continu\w*)$/;
  var DISCARD_MEM = /^(?:forget\w*|forgot\w*|ignor\w*|disregard\w*|dismiss\w*|overlook\w*)$/;
  var DISCARD_HAVE = /^(?:discard\w*|remov\w*|delet\w*|erase\w*|erasing|abandon\w*|cancel\w*|wipe\w*|wiping|purg\w*|rid|eliminat\w*|omit\w*|exclud\w*|revers\w*|scrap\w*|drop\w*|unlearn\w*)$/;
  var NEGATOR = /^(?:fail|fails|failed|failing|no|not|never|stop|stops|stopping|cease|ceases|refuse|refuses|without|longer|quit)$/;

  function negatedAt(t, i) {
    for (var j = Math.max(0, i - 4); j < i; j++) {
      if (NEGATOR.test(t[j])) return true;
      if (t[j] === "out" && t[j + 1] === "of") return true;
    }
    return false;
  }
  function glossReading(gloss) {
    var t = tokens(gloss);
    for (var i = 0; i < t.length; i++) {
      var dm = DISCARD_MEM.test(t[i]), dh = !dm && DISCARD_HAVE.test(t[i]);
      var rm = RETAIN_MEM.test(t[i]), rh = !rm && RETAIN_HAVE.test(t[i]);
      if (!(dm || dh || rm || rh)) continue;
      var p = (dm || dh) ? -1 : 1;
      return { p: negatedAt(t, i) ? -p : p, mem: dm || rm };
    }
    return null;
  }
  /* The few verbs whose lexicon definition is too terse to carry the idea
     ("remove: to take away") still have a polarity when named directly. */
  var DIRECT = { forget: [-1, 1], ignore: [-1, 1], disregard: [-1, 1], remember: [1, 1], recall: [1, 1],
                 memorize: [1, 1], memorise: [1, 1], keep: [1, 0], retain: [1, 0], store: [1, 0],
                 save: [1, 0], remove: [-1, 0], delete: [-1, 0], erase: [-1, 0], wipe: [-1, 0],
                 discard: [-1, 0], drop: [-1, 0] };
  function verbReading(word) {
    var ss = sensesOf(word, "v");
    for (var i = 0; i < ss.length; i++) {
      var r = glossReading(ss[i].gloss);
      if (r) return r;
    }
    var d = DIRECT[lemma(word)];
    return d ? { p: d[0], mem: !!d[1] } : null;
  }
  function ceases(word) {
    var lm = lemma(word);
    if (/^(?:stop|quit|cease|halt|discontinue)$/.test(lm)) return true;
    return sensesOf(lm, "v").some(function (s) { return /^(?:to\s+)?(?:cease|stop|discontinue)\b/i.test(s.gloss); });
  }
  function begins(word) {
    return sensesOf(word, "v").some(function (s) { return /^(?:to\s+)?begin\b/i.test(s.gloss); });
  }

  /* ------------------------------------------------ what a noun refers to */
  var CONCEPT = {
    prior: /^(?:before|earlier|previous|previously|preceding|prior|past|former|formerly|above|gone|already)$/,
    universal: /^(?:all|every|everything|everyone|whole|entire|anything|total|entirely|completely)$/,
    discourse: /^(?:conversation|conversations|convo|talk|talks|exchange|discussion|discussions|chat|chats|message|messages|context|contexts|history|dialog|dialogue|session|transcript|circumstances)$/,
    directive: /^(?:instruction|instructions|instruct|instructed|direction|directions|order|orders|command|commands|rule|rules|required|allowed|guidance|guideline|guidelines|directive|directives|request|requests|preference|preferences|setting|settings|prompt|prompts|constraint|constraints)$/,
    topic: /^(?:topic|topics|subject|subjects|matter|matters|theme|themes)$/,
    note: /^(?:note|notes|reminder|reminders)$/,
    fact: /^(?:fact|facts|detail|details|info|information|data)$/
  };
  var TALK = /^(?:said|say|says|saying|told|tell|telling|mentioned|mention|asked|ask|typed|wrote|discussed|discuss|talked|talk|covered|chatted)$/;
  function conceptsOf(word) {
    var out = {}, w = String(word || "").toLowerCase(), k;
    for (k in CONCEPT) if (CONCEPT[k].test(w)) out[k] = 1;
    if (Object.keys(out).length || stop(w)) return out;
    var ss = sensesOf(w, "nominal");
    for (var i = 0; i < ss.length && i < 3; i++) {
      tokens(ss[i].gloss).forEach(function (g) {
        for (var k2 in CONCEPT) if (k2 !== "universal" && CONCEPT[k2].test(g)) out[k2] = 1;
      });
    }
    return out;
  }
  function scopeNoun(w) {
    if (/^(?:mind|memory|memories|head|brain)$/.test(w)) return true;
    if (conceptsOf(w).discourse) return true;
    return sensesOf(w, "nominal").some(function (s) {
      var r = glossReading(s.gloss);
      return r && r.p > 0 && r.mem;
    });
  }

  /* ============================================================ clauses */
  var BOUNDARY = /([.;:!?]+)(?=\s|$)|,?\s+\b(but|except|however|though|although|whereas|and|then|plus)\b\s+|\s+[-\u2013\u2014]+\s+/gi;
  function clauses(raw) {
    var out = [], last = 0, conj = "", m;
    BOUNDARY.lastIndex = 0;
    while ((m = BOUNDARY.exec(raw))) {
      if (!m[0].length) { BOUNDARY.lastIndex++; continue; }
      var seg = raw.slice(last, m.index);
      if (seg.trim()) out.push({ text: seg.trim(), start: last, end: m.index + (m[1] ? m[1].length : 0), conj: conj });
      conj = (m[2] || "").toLowerCase();
      last = m.index + m[0].length;
    }
    if (raw.slice(last).trim()) out.push({ text: raw.slice(last).trim(), start: last, end: raw.length, conj: conj });
    return out;
  }
  function joinResidual(raw, cl) {
    var parts = [], i = 0;
    while (i < cl.length) {
      if (cl[i].used) { i++; continue; }
      var j = i;
      while (j + 1 < cl.length && !cl[j + 1].used) j++;
      parts.push(raw.slice(cl[i].start, cl[j].end).trim());
      i = j + 1;
    }
    return parts.join(" ").replace(/^[\s,;:]+/, "").trim();
  }
  function hasVerb(text) {
    if (/\?/.test(text)) return true;
    var t = tokens(expand(text));
    if (!t.length) return false;
    if (/^(?:what|who|where|when|why|how|which|is|are|was|were|do|does|did|can|could|would|will|should|tell|explain|give|show|list|define|describe|compare|calculate|write|find|i|you|we|it)$/.test(t[0])) return true;
    return sensesOf(t[0], "v").length > 0 && !sensesOf(t[0], "nominal").length;
  }

  var POLITE = /^(?:(?:please|pls|plz|kindly|ok|okay|so|well|now|alright|hey|just|also|and|then|actually|right|oh|um|uh|hmm)\b[\s,]*)+/;
  var MODAL = /^(?:(?:can|could|would|will) you\s+(?:please\s+)?|i (?:want|need|would like) you to\s+|you (?:can|should|must|may|could|need to|have to)\s+|go ahead and\s+|let us\s+|try to\s+|i (?:want|would like) to\s+|we (?:can|should)\s+|make sure (?:that )?(?:you\s+|to\s+)|be sure to\s+|remember to\s+)/;

  /* A clause as an operation: polarity (+1 keep, -1 drop), whether the verb
     is about memory itself, and the object in both cases. */
  function analyze(text) {
    var ex = expand(text).replace(/[\s.!?;:,]+$/, "");
    var low = ex.toLowerCase(), s = low.replace(/^[\s,;:]+/, ""), prev;
    do { prev = s; s = s.replace(POLITE, "").replace(MODAL, ""); } while (s !== prev);
    var neg = false, nm = s.match(/^(?:do not|never|no longer|not)\s+/);
    if (nm) { neg = true; s = s.slice(nm[0].length); }
    var sCase = low.length === ex.length ? ex.slice(low.length - s.length) : s;
    var sp = spans(sCase), t = sp.map(function (x) { return x.w.toLowerCase(); });
    if (!t.length) return null;
    var vi = 0, cease = false;
    if (t.length > 1 && /ing$/.test(t[1]) && ceases(t[0])) { cease = true; vi = 1; }
    var reading = null, span = 1, reset = false;
    /* "start over", "begin again": beginning again sets aside what came before */
    if (t[vi + 1] && /^(?:over|again|fresh|afresh|anew)$/.test(t[vi + 1]) && begins(t[vi])) {
      reading = { p: -1, mem: false }; span = 2; reset = true;
    }
    if (!reading) reading = verbReading(t[vi]);
    var objSp = sp.slice(vi + span);
    var out = { verb: t[vi], objTokens: objSp.map(function (x) { return x.w.toLowerCase(); }),
                objCase: objSp.map(function (x) { return x.w; }),
                objSurface: objSp.length ? sCase.slice(objSp[0].i) : "" };
    if (!reading) { out.kind = "none"; return out; }
    out.kind = "op";
    out.p = reading.p * (neg ? -1 : 1) * (cease ? -1 : 1);
    out.mem = reading.mem;
    out.reset = reset;
    return out;
  }

  /* ========================================================= statements */
  var NOT_FACT_VERB = /^(?:think|believe|guess|suppose|feel|felt|want|wish|hope|wonder|mean|know|see|understand|need|would|could|should|can|will|may|might|must|just|also|really|do|does|am|was|were|had|got|get|agree|disagree|doubt|forgot|asked|ask|said|say|told|tell|bet|found|saw|tried|try|guess|mean|think)$/;
  function selfStatement(text) {
    var s = expand(text).replace(/^[\s,]+|[\s.!]+$/g, "")
      .replace(/^(?:(?:and|also|btw|oh|well|so|ok|okay|hey|hi|hello|fyi)[,:\s]+|by the way[,\s]+|just so you know[,\s]+)+/i, "");
    if (!s || /\?/.test(s) || s.split(/\s+/).length > 16) return null;
    var m, pp;
    if ((m = s.match(/^my\s+([a-z][a-z' -]{0,40}?)\s+(is|are|was|were)\s+(.{1,80})$/i))) {
      var val = trimEnd(m[3]);
      if (/^(?:not|also|what|who|where|when|how)\b/i.test(val)) return null;
      var attr = m[1].trim().toLowerCase();
      return { key: attr, attr: attr, value: val, copula: m[2].toLowerCase(), verb: "be" };
    }
    if ((m = s.match(/^(?:you can |please |just )?call me\s+([A-Za-z][\w'-]*(?:\s+[A-Z][\w'-]*)?)$/i))) {
      return { key: "name", attr: "name", value: cap(m[1]), copula: "is", verb: "be", address: true };
    }
    if ((m = s.match(/^i\s+am\s+(.{1,80})$/i))) {
      var rest = trimEnd(m[1]);
      if (/^(?:a|an)\s+\w/i.test(rest) && !/^(?:a|an)\s+(?:bit|little|lot)\b/i.test(rest)) {
        return { key: "role", attr: "role", value: rest, verb: "be" };
      }
      if ((pp = rest.match(/^(from|in|at|based in|living in|located in|staying in)\s+(.+)$/i))) {
        var from = /^from$/i.test(pp[1]);
        return { key: from ? "origin" : "location", attr: from ? "origin" : "location",
                 value: pp[2], prep: pp[1].toLowerCase(), verb: "be" };
      }
      if ((pp = rest.match(/^(\d{1,3})(?:\s+years?\s+old)?$/i))) return { key: "age", attr: "age", value: pp[1], verb: "be" };
      if ((pp = rest.match(/^(?:called |named )?([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})$/))) {
        var L = LX();
        if (!(L && L.has(pp[1].toLowerCase()))) return { key: "name", attr: "name", value: pp[1], copula: "is", verb: "be" };
      }
      return null;
    }
    if ((m = s.match(/^i\s+(?:(?:usually|also|really|mostly|often|always|still|currently|now|actually)\s+)?([a-z]+)\s+(.{2,80})$/i))) {
      var v = m[1].toLowerCase(), obj = trimEnd(m[2]);
      if (NOT_FACT_VERB.test(v) || /(?:ed|ly)$/.test(v)) return null;
      if (/^(?:you|your|yours|it|this|that|these|those|them|so|too|not|to|been|got|just|already|never|no|some|any)\b/i.test(obj)) return null;
      if (v === "have" && /^(?:(?:a|an)\s+(?:question|idea|problem|issue|doubt|request|suggestion|thought|concern|feeling|point|minute|second|moment)|questions?)\b/i.test(obj)) return null;
      var L2 = LX();
      if (!((L2 && L2.has(v)) || (C.knownWord && C.knownWord(v)))) return null;
      var lv = lemma(v);
      return { key: "v:" + lv, attr: lv, verb: lv, verbSurface: v, value: obj };
    }
    return null;
  }

  function flipPerson(s) {
    var map = { "i am": "you are", "i was": "you were", "i have": "you have", "i will": "you will",
                "i would": "you would", "my": "your", "mine": "yours", "myself": "yourself", "me": "you", "i": "you" };
    return String(s || "").replace(/\b(?:I am|I was|I have|I will|I would|my|mine|myself|me|I)\b/gi, function (m0) {
      return map[m0.toLowerCase()] || m0;
    });
  }
  function factSentence(f) {
    var v = flipPerson(f.value);
    if (f.verb === "be") {
      if (f.key === "role") return "You're " + v + ".";
      if (f.key === "origin") return "You're from " + v + ".";
      if (f.key === "location") return "You're " + (f.prep || "in") + " " + v + ".";
      if (f.key === "age") return "You're " + v + ".";
      if (f.key === "address") return "You asked me to call you " + v + ".";
      return "Your " + f.attr + " " + (f.copula || "is") + " " + v + ".";
    }
    return "You " + (f.verbSurface || f.verb) + " " + v + ".";
  }
  function factEcho(f) { var s = factSentence(f); return s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, ""); }
  function noteSentence(n) { return cap(trimEnd(flipPerson(n.text))) + "."; }

  /* ========================================================= directives */
  var PERSIST = /\b(?:from now on|from here on|going forward|for the rest of (?:this|the|our) (?:conversation|chat|session)|henceforth|hereafter|always|every time|each time|whenever|in (?:the )?future|until i say otherwise|permanently|forever|onwards?)\b/;
  var FORMAT_WORD = /^(?:sentence|sentences|word|words|line|lines|paragraph|paragraphs|bullet|bullets|bulleted|point|points|list|brief|briefly|short|shorter|concise|concisely|terse|succinct|detail|detailed|thorough|thoroughly|longer|simple|simpler|simply|plain|terms|step|steps|single|number|value|one|two|three|four|five|six|seven|eight|nine|ten|\d+|max|maximum|under|within|than|fewer|less|more|most|least|no|exactly|only|just|eli5|english|by)$/;
  var RESPONSE_WORD = /^(?:answer|answers|answering|respond|responding|response|responses|reply|replies|replying|write|writing|keep|keeping|make|give|giving|use|using|be|talk|talking|speak|speaking|explain|explaining|explanation|explanations|format|formatting|put|say|it|them|things|everything|stuff|your|you|me|my|all|every|each|from|now|on|here|going|forward|please|also|and|the|a|an|to|in|with|as|of|for|very|really|at|do|not|never|stop|again|back|normal|normally|usual|usually|default|regular|regularly|way|style|like|form|mode|go|okay|ok|so|i|want|would|need|should|can|could|will|let|us|try|always|henceforth|hereafter|forever|onward|onwards|future|time|until|otherwise|permanently|rest|this|that|conversation|chat|session|whenever|could|without|more|anymore|quit)$/;

  function directiveOf(text) {
    var s = expand(text).toLowerCase().replace(/[\s.!?]+$/, "").trim();
    if (!s || s.length > 160) return null;
    var fmt = (C && C.parseFormat) ? (C.parseFormat(s) || {}) : {};
    var eff = {};
    if (fmt.onlyValue) eff.onlyValue = true;
    if (fmt.length && fmt.unit && fmt.unit !== "items") { eff.length = fmt.length; eff.unit = fmt.unit; }
    if (fmt.format === "bullets" || /\bbullet/.test(s)) eff.format = "bullets";
    if (!eff.length && /\b(?:brief|briefly|short|shorter|concise|concisely|terse|succinct)\b/.test(s)) eff.tone = "brief";
    else if (/\b(?:detailed|in detail|longer|thorough|thoroughly)\b/.test(s)) eff.tone = "detailed";
    else if (/\b(?:simple|simpler|simply|plain english|eli5)\b/.test(s)) eff.tone = "simple";
    else if (/\bstep[- ]by[- ]step\b/.test(s)) eff.tone = "steps";
    var reset = !Object.keys(eff).length && /\b(?:normal|normally|usual|usually|default|regular|regularly)\b/.test(s);
    if (!reset && !Object.keys(eff).length) return null;
    var rest = tokens(s).filter(function (w) { return !FORMAT_WORD.test(w) && !RESPONSE_WORD.test(w) && !stop(w); });
    if (rest.length) return null;
    var neg = /^(?:(?:please|ok|okay|so|and|just)\s+)*(?:do not|never|stop|no more|quit|no longer|without)\b/.test(s) ||
              /\b(?:without|no) bullet/.test(s) || /\banymore\b/.test(s);
    return { effect: eff, reset: reset, negated: neg,
             persist: PERSIST.test(s) || /\b(?:answers|responses|replies|explanations)\b/.test(s) };
  }
  var NUMW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  function describe(e) {
    var parts = [];
    if (e.onlyValue) parts.push("one-word answers");
    if (e.length) {
      var n = NUMW[e.length] || String(e.length);
      parts.push(e.unit === "words" ? "answers of at most " + n + " words"
                 : n + "-" + String(e.unit || "sentences").replace(/s$/, "") + " answers");
    }
    if (e.format === "bullets") parts.push("bullet points");
    if (e.tone) parts.push({ brief: "brief answers", detailed: "detailed answers", simple: "simple explanations",
                             steps: "step-by-step answers" }[e.tone] || e.tone + " answers");
    return joinList(parts);
  }
  function describeOnce(e) {
    var parts = [];
    if (e.onlyValue) parts.push("in one word");
    if (e.length) parts.push("in " + (NUMW[e.length] || e.length) + " " + (e.length === 1 ? String(e.unit || "sentences").replace(/s$/, "") : e.unit));
    if (e.format === "bullets") parts.push("as bullet points");
    if (e.tone) parts.push({ brief: "briefly", detailed: "in more detail", simple: "more simply", steps: "step by step" }[e.tone] || "");
    return joinList(parts);
  }

  /* ============================================================= memory */
  function Memory(opts) {
    opts = opts || {};
    this.storage = opts.storage || null;
    this.items = [];
    this.transcript = [];
    this.tombstones = Object.create(null);
    this.listeners = [];
    this.turn = 0;
    this.nextId = 1;
    this.lastQuestion = "";
    this.resetAt = 0;
    this.load();
  }
  var P = Memory.prototype;

  P.listen = function (l) { if (l) this.listeners.push(l); };
  P.emit = function (ev, arg) {
    this.listeners.forEach(function (l) { try { if (l && typeof l[ev] === "function") l[ev](arg); } catch (e) {} });
  };
  P.byKind = function (k) { return this.items.filter(function (it) { return it.kind === k; }); };
  P.find = function (kind, key) {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].kind === kind && this.items[i].key === key) return this.items[i];
    return null;
  };
  P.add = function (it) {
    var old = this.find(it.kind, it.key);
    if (old) { for (var k in it) old[k] = it[k]; return old; }
    it.id = this.nextId++;
    this.items.push(it);
    return it;
  };
  P.addTopic = function (name) {
    var disp = String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim(), key = ff(disp);
    if (!key || disp.length > 60) return null;
    var old = this.find("topic", key);
    if (old) { old.turn = this.turn; old.count++; return old; }
    return this.add({ kind: "topic", key: key, value: disp, words: wordsOf(disp), first: this.turn, turn: this.turn, count: 1 });
  };
  P.addNote = function (text) {
    var t = trimEnd(text);
    return this.add({ kind: "note", key: ff(t).slice(0, 80), text: t, words: wordsOf(t), turn: this.turn });
  };
  P.storeFact = function (st) {
    var key = st.key, name = this.find("fact", "name");
    if (st.address && name && ff(name.value) !== ff(st.value)) key = "address";
    delete this.tombstones[key]; delete this.tombstones[st.attr];
    return this.add({ kind: "fact", key: key, attr: key === "address" ? "address" : st.attr, value: trimEnd(st.value),
                      copula: st.copula || "", verb: st.verb, verbSurface: st.verbSurface || "", prep: st.prep || "",
                      address: !!st.address, turn: this.turn,
                      words: wordsOf(st.attr + " " + st.value + (st.verb !== "be" ? " " + st.verb : "")) });
  };
  P.lastTopic = function () {
    var ts = this.byKind("topic");
    ts.sort(function (a, b) { return b.turn - a.turn || b.id - a.id; });
    return ts[0] || null;
  };
  P.match = function (words, kinds) {
    var best = [], top = 0;
    if (!words.length) return best;
    this.items.forEach(function (it) {
      if (kinds && kinds.indexOf(it.kind) < 0) return;
      var hit = 0;
      words.forEach(function (w) { if ((it.words || []).indexOf(w) >= 0) hit++; });
      if (!hit) return;
      var score = hit / words.length;
      if (score > top + 1e-9) { top = score; best = [it]; }
      else if (Math.abs(score - top) < 1e-9) best.push(it);
    });
    return top >= 0.5 ? best : [];
  };
  P.nameForAddress = function () {
    var a = this.find("fact", "address") || this.find("fact", "name");
    return a ? a.value : "";
  };
  P.directives = function () {
    var ds = this.byKind("directive");
    if (!ds.length) return null;
    var e = {};
    ds.forEach(function (d) { for (var k in d.effect) e[k] = d.effect[k]; });
    return e;
  };

  /* ---------------------------------------------------- the object read */
  P.readObject = function (words, surfaceWords) {
    var t = words.slice(), tc = surfaceWords.slice(), memPP = false, m;
    while (t.length && /^(?:about|of|on|regarding|concerning|over|up|down)$/.test(t[0])) { t.shift(); tc.shift(); }
    /* "in mind", "in memory" in front of a that-clause */
    if (t.length > 1 && /^(?:in|on)$/.test(t[0]) && scopeNoun(t[1])) { t.splice(0, 2); tc.splice(0, 2); memPP = true; }
    for (;;) {
      var joined = t.join(" ");
      if ((m = joined.match(/(?:^|\s)(?:for now|for later|going forward|from now on|from here on|for the rest of (?:this |the |our )?(?:conversation|chat|session))$/))) {
        var n = m[0].trim().split(" ").length;
        t = t.slice(0, t.length - n); tc = tc.slice(0, tc.length - n); memPP = true; continue;
      }
      /* a trailing "in this context", "in your memory", "for this conversation" */
      var k = t.length - 1, nouns = 0;
      while (k >= 0 && !/^(?:in|within|into|throughout|during|from|for|on)$/.test(t[k])) {
        if (/^(?:this|the|our|my|your|that|a|an|current)$/.test(t[k])) { k--; continue; }
        if (!scopeNoun(t[k])) { nouns = -1; break; }
        nouns++; k--;
      }
      if (k >= 0 && nouns > 0) { t = t.slice(0, k); tc = tc.slice(0, k); memPP = true; continue; }
      break;
    }
    for (var a = t.length - 1; a >= 0; a--) {
      if (/^(?:about|regarding|concerning)$/.test(t[a]) && a < t.length - 1) { t = t.slice(a + 1); tc = tc.slice(a + 1); break; }
    }
    var talk = t.some(function (w) { return TALK.test(w); });
    var firstPerson = t.some(function (w) { return /^(?:me|my|mine|myself)$/.test(w); }) || (t.indexOf("i") >= 0 && !talk);
    var conc = {}, content = [], contentCase = [];
    t.forEach(function (w, i) {
      var c = conceptsOf(w), any = false;
      for (var k2 in c) { conc[k2] = 1; any = true; }
      if (TALK.test(w)) { conc.discourse = 1; any = true; }
      if (!any && !(stop(w) && !/\d/.test(w)) && !GENERIC[w] && (w.length > 1 || /\d/.test(w))) { content.push(w); contentCase.push(tc[i]); }
    });
    var ordinal = t.filter(function (w) { return /^(?:last|first|previous|latest|recent)$/.test(w); })[0];
    if (ordinal && content.length && content.every(function (w) {
      return /^(?:last|first|latest|recent|question|questions|message|messages|answer|answers|thing|one)$/.test(w);
    })) return { type: "turn", which: ordinal === "first" ? "first" : "last", memPP: memPP };
    var search = [];
    content.forEach(function (w) { wordsOf(w).forEach(function (x) { if (search.indexOf(x) < 0) search.push(x); }); });
    if (search.length) {
      var items = this.match(search, firstPerson ? ["fact", "note"] : null);
      if (items.length) return { type: "items", items: items, memPP: memPP };
    }
    if (firstPerson) {
      return content.length ? { type: "missing", surface: flipPerson(tc.join(" ")), personal: true, memPP: memPP }
                            : { type: "personal", memPP: memPP };
    }
    if (conc.prior || conc.discourse) return { type: "all", memPP: memPP };
    if (!content.length) {
      if (conc.directive) return { type: "category", category: "directive", memPP: memPP };
      if (conc.topic) return (conc.universal || /s$/.test(t[t.length - 1] || "")) ? { type: "category", category: "topic" } : { type: "last", memPP: memPP };
      if (conc.note) return { type: "category", category: "note", memPP: memPP };
      if (conc.fact) return { type: "personal", memPP: memPP };
      if (conc.universal) return { type: "all", memPP: memPP };
    }
    var pronoun = t.length > 0 && t.every(function (w) { return /^(?:it|that|this|those|these|them|one|thing|stuff|bit|part|last|the|a|an)$/.test(w); });
    if (!t.length || pronoun) return { type: "last", memPP: memPP, empty: !t.length };
    if (content.length) {
      return { type: "missing", surface: contentCase.join(" "), memPP: memPP,
               proper: contentCase.some(function (w) { return /^[A-Z0-9]/.test(w); }) };
    }
    return null;
  };
  P.objectOf = function (a) {
    var t = a.objTokens;
    if (a.p > 0 && t.length > 1) {
      var lead = t[0] === "that" ? 1 : (/^(?:in|on)$/.test(t[0]) && t[1] && scopeNoun(t[1]) ? (t[2] === "that" ? 3 : 2) : 0);
      var body = t.slice(lead);
      if (lead && t[lead - 1] === "that" || body.some(function (w) { return /^(?:is|are|was|were|am|will|have|has|had)$/.test(w); }) && body.length >= 3) {
        var surf = a.objSurface, sp = spans(surf);
        if (sp[lead]) surf = surf.slice(sp[lead].i);
        return { type: "clause", surface: trimEnd(surf) };
      }
    }
    if (a.reset && !t.length) return { type: "all" };
    var o = this.readObject(t, a.objCase);
    if (o && o.type === "last" && o.empty && !a.mem) return { type: "all" };
    return o;
  };
  function accept(a, o, mem) {
    if (!o) return false;
    if (a.p < 0) {
      if (o.type === "last" && o.empty && !mem.lastTopic()) return false;
      if (a.mem) return true;
      return o.type !== "missing" || o.memPP || o.proper;
    }
    if (o.type === "last") return o.memPP;
    if (o.type === "missing") return o.memPP || o.proper;
    if (o.type === "all") return o.memPP || a.mem;
    return true;
  }

  /* ----------------------------------------------------------- commands */
  P.command = function (text) {
    var raw = String(text == null ? "" : text).trim();
    if (!raw || raw.length > 500 || /```|=>|\bfunction\b|\bdef\s|[{}]/.test(raw)) return null;
    var rec = this.recall(raw);
    if (rec) { this.record(raw, rec); return { handled: true, text: rec, residual: "", act: "recall" }; }
    /* A word problem speaks in the first person ("I double a number and add
       9 to get 25") without saying anything about the speaker: a message the
       problem reader parses as a problem is not a memory command. */
    var PRB = root.C4LMProblem;
    if (PRB && PRB.parse && /\d/.test(raw)) {
      try { var asProblem = PRB.parse(raw); if (asProblem && asProblem.kind !== "arithmetic") return null; } catch (e) {}
    }
    /* the same for everyday reasoning: "I have 3 apples and eat one. How
       many are left?" states premises of a question, not facts to keep */
    var EVD = root.C4LMEveryday;
    if (EVD && /\?/.test(raw)) {
      try { if (EVD.solve(raw)) return null; } catch (e) {}
    }
    var cl = clauses(raw), ops = [];
    for (var i = 0; i < cl.length; i++) {
      var c = cl[i];
      var d = directiveOf(c.text);
      if (d) { ops.push({ type: "directive", d: d, clause: c }); c.used = true; continue; }
      var st = selfStatement(c.text);
      if (st) { ops.push({ type: "state", st: st, clause: c }); c.used = true; continue; }
      var a = analyze(c.text);
      if (a && a.kind === "op") {
        var o = this.objectOf(a);
        if (accept(a, o, this)) { ops.push({ type: "op", p: a.p, obj: o, clause: c }); c.used = true; continue; }
      }
      /* a clause with no verb of its own continues the memory clause before it:
         "forget 2016 and France", "forget everything except France" */
      var prevOp = ops.length && ops[ops.length - 1].type === "op" && i > 0 && cl[i - 1].used ? ops[ops.length - 1] : null;
      if (prevOp && !hasVerb(c.text)) {
        var exc = /^(?:but|except)$/.test(c.conj) || /^(?:not|except|apart from|other than|besides|but)\b/i.test(c.text);
        var body = expand(c.text).replace(/^(?:not|except(?: for)?|apart from|other than|besides|but(?: not)?)\s+/i, "").replace(/[\s.!?]+$/, "");
        var sp = spans(body);
        var o2 = this.readObject(sp.map(function (x) { return x.w.toLowerCase(); }), sp.map(function (x) { return x.w; }));
        if (o2 && o2.type !== "all" && o2.type !== "last") {
          ops.push({ type: "op", p: exc ? -prevOp.p : prevOp.p, obj: o2, clause: c }); c.used = true; continue;
        }
      }
    }
    if (!ops.length) return null;
    if (cl.some(function (x) { return !x.used; })) {
      /* A format instruction that comes WITH a question is part of that question. */
      ops = ops.filter(function (o) {
        if (o.type === "directive" && !o.d.persist) { o.clause.used = false; return false; }
        return true;
      });
      if (!ops.length) return null;
    }
    var sum = this.execute(ops);
    var ack = this.acknowledge(sum);
    var residual = joinResidual(raw, cl);
    if (!residual && sum.rerun && this.lastQuestion) residual = this.lastQuestion;
    if (residual) {
      var rr = this.recall(residual);
      if (rr) { ack = (ack ? ack + " " : "") + rr; residual = ""; }
    }
    if (!ack && !residual) ack = "Okay.";
    this.record(raw, ack);
    return { handled: true, text: ack, residual: residual, act: sum.act || "memory", summary: sum };
  };

  var KIND_OF = { directive: "directive", topic: "topic", note: "note", personal: "fact" };
  var CATEGORY_OF = { directive: "directive", topic: "topic", note: "note", fact: "personal" };
  function labelOf(it) {
    if (it.kind === "topic") return it.value;
    if (it.kind === "directive") return "the request for " + it.text;
    if (it.kind === "note") return "the note that " + flipPerson(it.text);
    if (it.verb && it.verb !== "be") return "that you " + (it.verbSurface || it.verb) + " " + flipPerson(it.value);
    return { role: "your role", origin: "where you're from", location: "where you are", age: "your age",
             address: "what to call you" }[it.key] || "your " + it.attr;
  }
  function categoryLabel(c) {
    return { directive: "your instructions", topic: "the topics", note: "your notes", personal: "what you've told me about yourself" }[c] || c;
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  P.execute = function (ops) {
    var self = this, sum = { forgotten: [], kept: [], stored: [], named: "", address: "", directives: [], once: "",
                             dropped: [], cleared: 0, notFound: [], all: false, counts: "", act: "", rerun: false, focus: "" };
    var protect = Object.create(null), protectKind = Object.create(null);
    function prot(it) { if (it) protect[it.id] = 1; }
    ops.forEach(function (op) {
      if (op.type !== "op" || op.p < 0) return;
      var o = op.obj;
      sum.act = sum.act || "keep";
      if (o.type === "items") o.items.forEach(function (it) { prot(it); sum.kept.push(labelOf(it)); if (it.kind === "topic") sum.focus = it.value; });
      else if (o.type === "personal") { self.byKind("fact").forEach(prot); sum.kept.push(categoryLabel("personal")); }
      else if (o.type === "category") { protectKind[o.category] = 1; sum.kept.push(categoryLabel(o.category)); }
      else if (o.type === "last" || o.type === "turn") { var lt = self.lastTopic(); if (lt) { prot(lt); sum.kept.push(lt.value); sum.focus = lt.value; } }
      else if (o.type === "missing") { var nt = self.addTopic(o.surface); if (nt) { prot(nt); sum.kept.push(nt.value); sum.focus = nt.value; } }
      else if (o.type === "clause") {
        var st = selfStatement(o.surface);
        if (st) { var f = self.storeFact(st); prot(f); if (f.key === "name") sum.named = f.value; else sum.stored.push(factEcho(f)); }
        else { var n = self.addNote(o.surface); prot(n); sum.stored.push(trimEnd(flipPerson(n.text))); }
        sum.act = "remember";
      }
    });
    ops.forEach(function (op) {
      if (op.type === "state") {
        var f = self.storeFact(op.st);
        prot(f);
        if (f.key === "name") sum.named = f.value;
        else if (f.key === "address") sum.address = f.value;
        else sum.stored.push(factEcho(f));
        if (op.st.address && f.key === "name") sum.address = f.value;
        sum.act = sum.act || "remember";
      } else if (op.type === "directive") {
        var d = op.d;
        sum.act = sum.act || "instruct";
        if (d.reset) {
          sum.cleared = self.byKind("directive").length;
          self.items = self.items.filter(function (it) { return it.kind !== "directive"; });
          return;
        }
        var aspects = [];
        if (d.effect.length) aspects.push(["length", { length: d.effect.length, unit: d.effect.unit }]);
        if (d.effect.format) aspects.push(["format", { format: d.effect.format }]);
        if (d.effect.tone) aspects.push(["tone", { tone: d.effect.tone }]);
        if (d.effect.onlyValue) aspects.push(["value", { onlyValue: true }]);
        if (d.negated) {
          aspects.forEach(function (a) {
            var old = self.find("directive", a[0]);
            if (old) { self.items.splice(self.items.indexOf(old), 1); sum.dropped.push(old.text); }
            else sum.dropped.push(describe(a[1]));
          });
          return;
        }
        var once = !d.persist && !!self.lastQuestion;
        aspects.forEach(function (a) {
          var it = self.add({ kind: "directive", key: a[0], effect: a[1], text: describe(a[1]), once: once, turn: self.turn,
                              words: wordsOf(describe(a[1]) + " " + a[0] + " " + JSON.stringify(a[1]).replace(/[^a-z]+/gi, " ")) });
          prot(it);
        });
        if (once) { sum.once = describeOnce(d.effect); sum.rerun = true; }
        else sum.directives.push(describe(d.effect));
      }
    });
    var victims = [];
    ops.forEach(function (op) {
      if (op.type !== "op" || op.p > 0) return;
      var o = op.obj, list = [];
      sum.act = "forget";
      if (o.type === "all") { sum.all = true; list = self.items.slice(); }
      else if (o.type === "items") list = o.items;
      else if (o.type === "personal") list = self.byKind("fact").concat(self.byKind("note"));
      else if (o.type === "category") list = self.byKind(KIND_OF[o.category] || o.category);
      else if (o.type === "last") { var lt = self.lastTopic(); if (lt) list = [lt]; }
      else if (o.type === "turn") {
        var qs = self.transcript.filter(function (x) { return x.kind === "qa"; });
        var tr = o.which === "first" ? qs[0] : qs[qs.length - 1];
        if (tr) {
          self.transcript.splice(self.transcript.indexOf(tr), 1);
          sum.forgotten.push(o.which === "first" ? "your first question" : "your last question");
          var tp = tr.entity ? self.find("topic", ff(String(tr.entity).replace(/\s*\([^)]*\)\s*$/, ""))) : null;
          if (tp) list = [tp];
        }
      }
      else if (o.type === "missing") { sum.notFound.push(o.surface); return; }
      list.forEach(function (it) {
        if (protect[it.id] || protectKind[CATEGORY_OF[it.kind]]) return;
        if (victims.indexOf(it) < 0) victims.push(it);
      });
    });
    var counts = { topic: 0, fact: 0, note: 0, directive: 0 }, gone = [];
    victims.forEach(function (it) {
      counts[it.kind]++;
      if (it.kind === "fact") { self.tombstones[it.key] = 1; self.tombstones[it.attr] = 1; }
      if (it.kind === "topic") gone.push(it.key);
      if (!sum.all) sum.forgotten.push(labelOf(it));
    });
    self.items = self.items.filter(function (it) { return victims.indexOf(it) < 0; });
    if (sum.all) {
      sum.counts = joinList([counts.topic ? plural(counts.topic, "topic", "topics") : "",
                             counts.fact + counts.note ? plural(counts.fact + counts.note, "fact about you", "facts about you") : "",
                             counts.directive ? plural(counts.directive, "instruction", "instructions") : ""]);
      self.transcript = [];
      self.lastQuestion = "";
      self.resetAt = self.turn || 1;
      self.emit("resetAll");
    } else if (gone.length) {
      var pred = function (name) {
        var k = ff(String(name || "").replace(/\s*\([^)]*\)\s*$/, ""));
        return !!k && gone.some(function (g) { return k === g || k.indexOf(g + " ") === 0; });
      };
      self.transcript = self.transcript.filter(function (x) { return !(x.entity && pred(x.entity)); });
      self.emit("forgetTopics", pred);
    }
    if (sum.focus) self.emit("focus", sum.focus);
    self.save();
    return sum;
  };

  P.acknowledge = function (sum) {
    var out = [], K, D;
    if (sum.named) out.push(pick(["Nice to meet you, " + sum.named + ".", "Good to meet you, " + sum.named + " — I'll remember your name.",
                                  "Got it, " + sum.named + "."]));
    if (sum.address && ff(sum.address) !== ff(sum.named) || (sum.address && !sum.named)) {
      out.push(pick(["Sure — I'll call you " + sum.address + ".", "Okay, " + sum.address + " it is."]));
    }
    if (sum.stored.length) out.push(pick(["Got it — I'll remember that ", "Noted: ", "I'll keep in mind that "]) + joinList(sum.stored) + ".");
    if (sum.all) {
      var rest = sum.kept.length ? "everything else" : "everything";
      out.push(sum.counts
        ? pick(["Done — I've cleared " + rest + " from this conversation (" + sum.counts + ").",
                "Okay, clean slate: I've forgotten " + rest + " from before (" + sum.counts + ")."])
        : pick(["Okay — clean slate.", "Done. We're starting fresh."]));
    } else if (sum.forgotten.length) {
      K = joinList(sum.forgotten);
      var many = sum.forgotten.length > 1;
      out.push(pick(["Okay, I've forgotten " + K + ".", "Done — " + K + (many ? " are" : " is") + " out of my memory.",
                     "Got it, " + K + (many ? " are" : " is") + " forgotten."]));
    }
    if (sum.kept.length) {
      K = joinList(sum.kept);
      var pl = sum.kept.length > 1 || /^(?:your instructions|the topics|your notes)$/.test(K);
      out.push(pick([cap(K) + (pl ? " stay" : " stays") + " in context.", "I'm keeping " + K + " in context.", "I've kept " + K + "."]));
    }
    if (sum.cleared) out.push(pick(["Okay — back to normal answers.", "Done, I've dropped the formatting instructions."]));
    if (sum.dropped.length) out.push(pick(["Okay — no more " + joinList(sum.dropped) + ".", "Done, I'll stop with " + joinList(sum.dropped) + "."]));
    if (sum.directives.length) {
      D = joinList(sum.directives);
      out.push(pick(["Okay — " + D + " from now on.", "Got it: I'll give you " + D + " until you say otherwise.",
                     "Understood. I'll stick to " + D + "."]));
    }
    if (sum.once) out.push(pick(["Sure, " + sum.once + ":", "Here it is " + sum.once + ":"]));
    if (sum.notFound.length) out.push("There was nothing about " + joinList(sum.notFound) + " in my memory to forget.");
    return out.join(" ").replace(/\s+/g, " ").trim();
  };

  /* ------------------------------------------------------------- recall */
  function normQ(text) {
    var s = expand(text).replace(/[?!.\s]+$/, "").trim();
    s = s.replace(/^(?:(?:hey|ok(?:ay)?|so|and|also|um|uh|well|please|quick question|hmm+|btw|by the way)[,\s]+)+/i, "");
    s = s.replace(/\s+(?:again|please|then|now)$/i, "");
    var m = s.match(/^(?:do you know|can you tell me|could you tell me|would you tell me|tell me|remind me|can you remind me|could you remind me|please remind me)\s+(what|where|who|when|which|how old|how)\s+(.+?)\s+(is|are|was|were)$/i);
    if (m) s = m[1] + " " + m[3] + " " + m[2];
    m = s.match(/^(?:do you know|can you tell me|could you tell me|tell me|remind me|can you remind me)\s+(what|where|who|when|how)\s+I\s+(\w+)(.*)$/i);
    if (m) s = m[1] + " do I " + m[2] + m[3];
    return s;
  }
  function isTalkVerb(w) { return TALK.test(w) || /^(?:talk\w*|discuss\w*|chat\w*|cover\w*|go|went|speak\w*|spoke|converse\w*)$/i.test(w); }

  P.recall = function (text) {
    var s = normQ(text), m;
    if (!s || s.length > 120) return "";
    if (/^who am I$/i.test(s)) return this.aboutUser();
    if ((m = s.match(/^(?:what|how much)\s+(?:do|did|can|does)\s+you\s+(?:know|remember|recall)\s+about\s+(me|myself)$/i)) ||
        /^what\s+(?:have|did)\s+I\s+(?:told|tell)\s+you(?:\s+about\s+(?:me|myself))?(?:\s+so\s+far)?$/i.test(s)) return this.aboutUser();
    if (/^(?:what|how much)\s+(?:do|can|did)\s+you\s+(?:remember|recall)(?:\s+so\s+far)?$|^what(?:\s+is|\s+do\s+you\s+have)?\s+in\s+your\s+memory$|^what\s+do\s+you\s+know\s+so\s+far$/i.test(s)) return this.summary();
    if ((m = s.match(/^what\s+(?:did|have|were|had)\s+we\s+(?:been\s+)?(\w+)(?:\s+(?:about|over|through|on))?(?:\s+(?:so\s+far|before|earlier|today|already))?$/i)) && isTalkVerb(m[1])) return this.topicList();
    if ((m = s.match(/^what\s+(?:topics?|subjects?|things)\s+(?:did|have|were)\s+we\s+(?:been\s+)?(\w+)/i)) && isTalkVerb(m[1])) return this.topicList();
    if ((m = s.match(/^what\s+(?:was|is)\s+(?:my|the)\s+(first|last|previous|latest|second|third|most recent)\s+(?:question|message|thing\s+I\s+(?:said|asked|typed))$/i))) return this.turnAt(m[1].toLowerCase(), false);
    if ((m = s.match(/^what\s+did\s+I\s+(?:(first|last|just)\s+)?(say|ask|type|write)(?:\s+(first|last|before|earlier))?$/i))) {
      return this.turnAt(String(m[1] || m[3] || "last").toLowerCase(), /say|type|write/i.test(m[2]));
    }
    if ((m = s.match(/^what\s+did\s+you\s+(?:just\s+)?(?:say|tell me|answer|reply)(?:\s+(?:about|on|regarding)\s+(.+))?$/i))) return this.botSaid(m[1] || "");
    if (/^what\s+(?:are|were)\s+my\s+(?:instructions|rules|settings|preferences|directions|requests)$/i.test(s) ||
        /^what\s+(?:did|have)\s+I\s+(?:told|tell|asked|ask)\s+you\s+to\s+do$/i.test(s)) return this.directiveList();
    if ((m = s.match(/^(?:do|did)\s+you\s+(?:still\s+)?(?:remember|recall)\s+(.+)$/i))) return this.remembers(m[1]);
    if ((m = s.match(/^(?:do|did)\s+you\s+(?:still\s+)?know\s+((?:my|where I|what I|who I|when I|how old I)\b.*)$/i))) return this.remembers(m[1]);
    if ((m = s.match(/^(?:what|who|where|when|which|how old|how)\s+(?:is|are|was|were)\s+my\s+(.{1,40})$/i))) return this.attrAnswer(m[1]);
    if ((m = s.match(/^what\s+is\s+the\s+name\s+of\s+my\s+(.{1,30})$/i))) return this.attrAnswer(m[1] + " name");
    if ((m = s.match(/^(what|where|who|when|how|which)\s+(?:do|did|does)\s+I\s+([a-z]+)\b\s*(.*)$/i))) return this.verbAnswer(m[1], m[2], m[3]);
    return "";
  };
  P.attrAnswer = function (phrase) {
    phrase = trimEnd(phrase);
    var words = wordsOf(phrase);
    if (!words.length) return "";
    if (conceptsOf(tokens(phrase).pop()).directive) return this.directiveList();
    var f = this.match(words, ["fact"])[0];
    if (f) {
      var out = factSentence(f);
      if (f.key === "name") { var ad = this.find("fact", "address"); if (ad) out += " " + factSentence(ad); }
      return out;
    }
    var n = this.match(words, ["note"])[0];
    if (n) return noteSentence(n);
    var key = phrase.toLowerCase();
    if (this.tombstones[key] || this.tombstones[ff(phrase)]) {
      return pick(["You asked me to forget your " + phrase + ", so I don't have it anymore.",
                   "I don't have your " + phrase + " anymore — you asked me to forget it."]);
    }
    if (phrase.split(/\s+/).length > 4 || /\d/.test(phrase)) return "";
    return pick(["You haven't told me your " + phrase + " yet.", "I don't know your " + phrase + " — you haven't mentioned it.",
                 "You haven't mentioned your " + phrase + " so far."]);
  };
  P.verbAnswer = function (wh, verb, rest) {
    var v = lemma(verb);
    if (/^(?:say|ask|tell|type|write|mention)$/.test(v)) return this.turnAt(/first/i.test(rest) ? "first" : "last", v !== "ask");
    var fs = this.byKind("fact").filter(function (f) {
      return f.verb === v || (v === "do" && /^(?:role|v:work)$/.test(f.key));
    });
    if (fs.length) return fs.map(factSentence).join(" ");
    var phrase = String(wh).toLowerCase() + " you " + verb.toLowerCase();
    if (this.tombstones["v:" + v] || this.tombstones[v]) return "You asked me to forget " + phrase + ", so I don't have it anymore.";
    if (/^(?:live|work|like|love|do|come|study|prefer)$/.test(v) && !String(rest || "").trim()) return "You haven't told me " + phrase + " yet.";
    return "";
  };
  P.turnAt = function (which, anyKind) {
    var qs = this.transcript.filter(function (x) { return anyKind ? x.kind !== "recall" : x.kind === "qa"; });
    if (!qs.length) return this.resetAt ? "Nothing since you asked me to start fresh." : "You haven't asked me anything yet.";
    var idx = which === "first" ? 0 : which === "second" ? 1 : which === "third" ? 2 : qs.length - 1;
    if (idx >= qs.length) return "You've only asked me " + plural(qs.length, "question", "questions") + " so far.";
    var q = trimEnd(qs[idx].user) + (/\?\s*$/.test(qs[idx].user) ? "?" : "");
    if (anyKind) return "You said “" + q + "”";
    return which === "first" ? pick(["Your first question was “" + q + "”", "You started with “" + q + "”"])
                             : pick(["Your last question was “" + q + "”", "You last asked “" + q + "”"]);
  };
  P.botSaid = function (about) {
    var ts = this.transcript.filter(function (x) { return x.bot && x.kind !== "recall"; });
    if (!ts.length) return "I haven't said anything yet.";
    if (!about) return "I said: “" + ts[ts.length - 1].bot + "”";
    var w = wordsOf(about);
    for (var i = ts.length - 1; i >= 0; i--) {
      var hay = wordsOf(ts[i].entity + " " + ts[i].user);
      var hit = w.filter(function (x) { return hay.indexOf(x) >= 0; }).length;
      if (w.length && hit / w.length >= 0.5) return "Earlier I said: “" + ts[i].bot + "”";
    }
    return "I haven't said anything about " + trimEnd(about) + " so far.";
  };
  P.topicList = function () {
    var ts = this.byKind("topic").sort(function (a, b) { return a.first - b.first || a.id - b.id; }).map(function (t) { return t.value; });
    if (!ts.length) return this.resetAt ? "Nothing yet since you asked me to start fresh." : "We haven't talked about anything yet.";
    return pick(["So far we've talked about ", "We've covered ", "Up to now we've discussed "]) + joinList(ts) + ".";
  };
  P.directiveList = function () {
    var ds = this.byKind("directive").filter(function (d) { return !d.once; }).map(function (d) { return d.text; });
    var ad = this.find("fact", "address");
    if (!ds.length && !ad) return "You haven't given me any standing instructions.";
    var out = ds.length ? "You've asked me for " + joinList(ds) + "." : "";
    if (ad) out += (out ? " " : "") + factSentence(ad);
    return out;
  };
  P.aboutUser = function () {
    var lines = this.byKind("fact").map(factSentence).concat(this.byKind("note").map(noteSentence));
    if (!lines.length) return "I don't know anything about you yet — tell me and I'll remember it.";
    return lines.join(" ");
  };
  P.summary = function () {
    var parts = [];
    if (this.byKind("fact").length || this.byKind("note").length) parts.push(this.aboutUser());
    if (this.byKind("directive").length) parts.push(this.directiveList());
    if (this.byKind("topic").length) parts.push(this.topicList());
    return parts.length ? parts.join(" ") : "My memory of this conversation is empty right now.";
  };
  P.remembers = function (x) {
    x = trimEnd(x);
    var m;
    if (/^(?:me|myself)$/i.test(x)) return this.aboutUser();
    if ((m = x.match(/^my\s+(.+)$/i))) {
      var f = this.match(wordsOf(m[1]), ["fact", "note"])[0];
      var ans = this.attrAnswer(m[1]);
      return f ? "Yes. " + ans : ans;
    }
    if ((m = x.match(/^(what|where|who|when|how)\s+I\s+(\w+)(.*)$/i))) {
      var v = this.verbAnswer(m[1], m[2], m[3]);
      return v && /^You (?!haven't|asked)/.test(v) ? "Yes. " + v : v;
    }
    if (/^what\s+we\s+/i.test(x)) return this.topicList();
    var items = this.match(wordsOf(x));
    if (items.length) {
      var it = items[0];
      if (it.kind === "topic") return "Yes — we talked about " + it.value + ".";
      if (it.kind === "fact") return "Yes. " + factSentence(it);
      if (it.kind === "note") return "Yes. " + noteSentence(it);
      return "Yes — you asked me for " + it.text + ".";
    }
    return pick(["No — " + x + " hasn't come up yet.", "I don't have anything about " + x + " so far."]);
  };

  /* ---------------------------------------------------------- the turns */
  P.record = function (user, bot) {
    this.turn++;
    this.transcript.push({ turn: this.turn, user: String(user || ""), bot: String(bot || ""), entity: "", route: "memory", kind: "memory" });
    if (this.transcript.length > 400) this.transcript.shift();
  };
  P.observe = function (user, result) {
    result = result || {};
    var route = String(result.route || "");
    if (route === "memory" || result.memoryTurn) return;
    this.turn++;
    var kind = result.conversational || route === "conversation" ? "chat" : "qa";
    var entry = { turn: this.turn, user: String(user || ""), bot: String(result.text || ""),
                  entity: String(result.entity || ""), route: route, kind: kind };
    this.transcript.push(entry);
    if (this.transcript.length > 400) this.transcript.shift();
    if (kind !== "qa") return;
    this.lastQuestion = entry.user;
    if (entry.entity && !result.insufficient && !/^(?:insufficient|clarify|none)$/.test(route)) this.addTopic(entry.entity);
    var once = this.items.filter(function (it) { return it.kind === "directive" && it.once; });
    if (once.length) { this.items = this.items.filter(function (it) { return once.indexOf(it) < 0; }); this.save(); }
  };

  /* A standing instruction applies to answers that did not come through the
     realiser too: length is clipped, bullets are laid out. */
  P.conform = function (text, info) {
    var d = this.directives(), R = RZ();
    info = info || {};
    if (!d || !text || !R || info.conversational || info.code || /```/.test(text) ||
        /^(?:code|compute|memory|recall)$/.test(String(info.route || ""))) return text;
    var out = String(text);
    if (d.length && d.unit === "sentences" && R.clipSentences) out = R.clipSentences(out, d.length);
    else if (d.length && d.unit === "words") {
      var w = out.split(/\s+/);
      if (w.length > d.length) out = R.terminate(R.trimDangling(w.slice(0, d.length).join(" ")));
    }
    if (d.format === "bullets" && !/^\s*[-*\u2022]\s/m.test(out)) {
      var parts = (out.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [out]).map(function (p) { return p.trim(); }).filter(Boolean);
      if (parts.length >= 2) out = parts.map(function (p) { return "- " + p; }).join("\n");
    }
    return out;
  };

  /* A verb the lexicon does not know, used on something in memory, is worth
     looking up: "obliterate everything we discussed". */
  P.unknownVerbs = function (text) {
    var L = LX(), out = [], self = this;
    if (!L) return out;
    clauses(String(text || "")).forEach(function (c) {
      var a = analyze(c.text);
      if (!a || a.kind !== "none") return;
      var w = a.verb;
      if (!/^[a-z]{4,}$/.test(w) || stop(w) || L.has(w) || out.indexOf(w) >= 0) return;
      var o = self.readObject(a.objTokens, a.objCase);
      if (o && /^(?:all|items|personal|category)$/.test(o.type)) out.push(w);
    });
    return out.slice(0, 2);
  };

  P.resetSession = function () {
    this.items = this.items.filter(function (it) { return it.kind !== "topic"; });
    this.transcript = [];
    this.lastQuestion = "";
  };
  P.save = function () {
    if (!this.storage) return;
    try {
      var keep = this.items.filter(function (it) { return it.kind !== "topic" && !it.once; });
      this.storage.setItem(STORE_KEY, JSON.stringify({ v: 1, t: Date.now(), items: keep }));
    } catch (e) { /* storage full or blocked: memory still works for the session */ }
  };
  P.load = function () {
    if (!this.storage) return;
    var self = this, j = null;
    try { j = JSON.parse(this.storage.getItem(STORE_KEY) || "null"); } catch (e) { j = null; }
    if (!j || j.v !== 1 || !Array.isArray(j.items)) return;
    j.items.forEach(function (it) {
      if (it && it.kind && it.key && /^(?:fact|note|directive)$/.test(it.kind)) { it.turn = 0; self.add(it); }
    });
  };
  P.snapshot = function () {
    return { items: this.items.map(function (it) { var o = {}; for (var k in it) o[k] = it[k]; return o; }),
             turns: this.transcript.length, turn: this.turn };
  };

  root.C4LMMemory = {
    Memory: Memory,
    /* exposed for tests and for other modules that want the same reading */
    analyze: analyze, directiveOf: directiveOf, selfStatement: selfStatement, clauses: clauses,
    glossReading: glossReading, flipPerson: flipPerson
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMMemory;
})(typeof window !== "undefined" ? window : globalThis);
