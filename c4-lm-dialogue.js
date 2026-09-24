/* CELL4 dialogue: reasoning over the conversation itself.
 *
 * c4-lm.js keeps a structured record of every turn (what was asked, what was
 * answered, the entity it was about, a numeric result, the meanings a
 * definition listed, the statements of a word problem). This module reads a
 * new message against that record:
 *
 *   sense      "What is a crane?" ... "the machine" / "I meant the bird" /
 *              "the second one": the meaning chosen by overlap with each
 *              listed sense and by closeness in the dataset's taxonomy
 *   math       a previous result as an operand: "add 7 to that", "double it",
 *              "what's the square of that", "is that more than 70?"
 *   problem    a word problem told over several turns ("Sara has 20
 *              stickers." "She gives away 8." "How many now?"), with the
 *              running state after each statement
 *   compare    "which of the two has more people?", "by how much?" -- over
 *              the things just discussed
 *   more       "tell me more", "what else did he write?"
 *   recall     "what did we talk about first?", "the last number you gave
 *              me", "summarize our conversation"
 *
 * It returns an answer, a rewritten question for the pipeline to answer
 * ({ rewrite }), or null. Local, deterministic, no model, no API.
 */
(function (root) {
  "use strict";
  function get(n) { return root[n] || null; }
  function low(s) { return String(s || "").toLowerCase().trim(); }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function clean(s) { return String(s == null ? "" : s).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(); }
  function fmt(v) {
    if (!isFinite(v)) return String(v);
    var r = Math.round(v * 1e6) / 1e6;
    return Math.abs(r) >= 1e15 ? r.toExponential(6) : String(r);
  }
  var STOP = /^(?:a|an|the|of|or|and|with|from|in|on|by|for|to|as|that|which|is|are|was|be|i|meant|mean|one|sense|meaning|kind|type|no|not|it|its|this|please|actually|just|like|about|what|you|the)$/;
  function stem(t) { t = low(t); return t.replace(/ies$/, "y").replace(/(?:ches|shes|xes|sses)$/, function (x) { return x.slice(0, -2); }).replace(/([^s])s$/, "$1"); }
  function toks(s) { return low(s).replace(/[^a-z0-9' -]+/g, " ").split(/\s+/).filter(function (t) { return t && !STOP.test(t); }).map(stem); }

  /* ------------------------------------------------------ recent context */
  function recent(log, pred, max) { for (var i = log.length - 1, n = 0; i >= 0 && n < (max || log.length); i--, n++) if (pred(log[i])) return log[i]; return null; }
  function lastValue(log, within) { return recent(log, function (e) { return typeof e.value === "number" && isFinite(e.value); }, within || 4); }

  /* ------------------------------------------------ word meanings (senses) */
  /* the senses a definition answer listed, as data: from the result when it
     carried them, otherwise read back from the listing it printed */
  function sensesFromText(word, text) {
    var m = String(text || "").match(/has (?:more than one sense|several meanings|a few meanings)\s*:\s*([\s\S]+)$/i);
    if (!m) return null;
    var parts = m[1].split(/;\s*(?=(?:\(\d+\)\s*)?(?:as an? [a-z]+,\s*)?)/).map(function (p) { return p.replace(/^\(\d+\)\s*/, "").replace(/[.?]\s*(?:Which one[\s\S]*)?$/, "").trim(); }).filter(Boolean);
    return parts.length > 1 ? parts.map(function (g) { return { gloss: g.replace(/^as an? [a-z]+,\s*/i, ""), pos: (g.match(/^as an? ([a-z]+),/i) || [])[1] || "noun" }; }) : null;
  }
  var ORD = { first: 0, "1st": 0, one: 0, second: 1, "2nd": 1, two: 1, third: 2, "3rd": 2, three: 2, fourth: 3, "4th": 3, last: -1 };
  function chooseSense(text, entry) {
    var l = low(text).replace(/[?.!]+$/, ""), senses = entry.senses, m;
    if ((m = l.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\b(?:\s+(?:one|sense|meaning|definition))?/)) || (m = l.match(/^(?:number|option|#)\s*(one|two|three|\d)$/))) {
      var k = ORD[m[1]] !== undefined ? ORD[m[1]] : (+m[1] - 1);
      var s = k < 0 ? senses[senses.length - 1] : senses[k];
      return s ? { sense: s, why: "you asked for the " + m[1] + " meaning" } : null;
    }
    var mine = toks(l.replace(/^(?:no[, ]+|not the [a-z ]+?,?\s+)?(?:i meant|i mean|i was asking about|i'm asking about|what about|how about)\s+/, ""));
    if (!mine.length) return null;
    var DS = get("C4Dataset"), W = DS && DS.available() ? DS.wordnet : null;
    /* the meanings listed, then the word's other meanings in the dataset
       ("no, I meant the animal" may name one that was not listed) */
    var pool = senses.map(function (s) { return { s: s, listed: true }; });
    if (W && entry.word) {
      var have = {};
      senses.forEach(function (s) { if (s.syn) have[s.syn.offset] = 1; });
      ["noun", "verb", "adj"].forEach(function (f) {
        W.senses(entry.word, f).forEach(function (x) {
          if (have[x.syn.offset]) return;
          have[x.syn.offset] = 1;
          var hyp = W.follow(x.syn, "@")[0];
          pool.push({ listed: false, s: { gloss: String(x.syn.def).split(/\s*;\s*/)[0], label: hyp ? hyp.words[0] : "", pos: f, syn: x.syn, words: x.syn.words,
                                          kinds: hyp ? hyp.words.concat(W.above(x.syn, 4).map(function (a) { return a.syn.words[0]; })) : [] } });
        });
      });
    }
    /* a compound kind ("animal skin") is a kind of its head ("skin") */
    function heads(list) { return (list || []).map(function (k) { return String(k).split(/[\s_]+/).pop(); }); }
    var scored = pool.map(function (p, i) {
      var s = p.s, bag = toks([s.gloss, heads([s.label]).join(" "), (s.words || []).join(" "), heads(s.kinds).join(" ")].join(" ")), sc = 0;
      mine.forEach(function (t) { if (bag.indexOf(t) >= 0) sc += 3; });
      /* taxonomy: the word named is what this meaning IS ("the animal" for
         a seal that is a mammal), or at least close to it */
      if (W && s.syn) {
        var anc = Object.create(null);
        W.above(s.syn, 20).forEach(function (x) { anc[x.syn.offset] = x.depth; });
        mine.forEach(function (t) {
          var best = 0;
          W.senses(t, "noun").slice(0, 3).forEach(function (x, k) {
            if (x.syn.offset in anc) best = Math.max(best, 4 - k * 0.5);
            else { var d = distance(W, s.syn, x.syn); if (d !== null) best = Math.max(best, 3 - d * 0.5); }
          });
          sc += best;
        });
      }
      return { sense: s, score: sc - (p.listed ? 0 : 0.75) - i * 0.01 };
    }).sort(function (a, b) { return b.score - a.score; });
    if (!scored.length || scored[0].score < 1) return null;
    return { sense: scored[0].sense, why: "“" + mine.join(" ") + "” matches it" };
  }
  function distance(W, a, b) {
    if (a.offset === b.offset) return 0;
    var up = Object.create(null);
    up[a.offset] = 0;
    W.above(a, 12).forEach(function (x) { up[x.syn.offset] = x.depth; });
    if (b.offset in up) return up[b.offset];
    var best = null;
    W.above(b, 6).forEach(function (x) { if (x.syn.offset in up) { var d = Math.max(x.depth, up[x.syn.offset]) + 1; if (best === null || d < best) best = d; } });
    return best !== null && best <= 6 ? best : null;
  }
  /* A word's meanings from the reference dataset, most frequent first:
     used when nothing else defines it, and kept for a follow-up choice */
  function define(word, max) {
    var DS = get("C4Dataset"), W = DS && DS.available() ? DS.wordnet : null;
    if (!W) return null;
    var all = [];
    ["noun", "verb", "adj"].forEach(function (f) {
      W.senses(word, f).forEach(function (x) { if (!/^[A-Z]/.test(x.syn.words[0]) || x.syn.words[0].toLowerCase() === low(word)) all.push({ x: x, f: f }); });
    });
    var common = all.filter(function (o) { return !/^[A-Z]/.test(o.x.syn.words[0]); });
    var pick = (common.length ? common : all).sort(function (a, b) { return (a.f === "noun" ? 0 : 1) - (b.f === "noun" ? 0 : 1) || a.x.rank - b.x.rank; }).slice(0, max || 3);
    if (!pick.length) return null;
    var senses = pick.map(function (o) {
      var hyp = W.follow(o.x.syn, "@")[0];
      return { gloss: String(o.x.syn.def).split(/\s*;\s*/)[0], label: hyp ? hyp.words[0] : o.f, pos: o.f, syn: o.x.syn,
               words: o.x.syn.words, kinds: hyp ? hyp.words.concat(W.above(o.x.syn, 4).map(function (a) { return a.syn.words[0]; })) : [] };
    });
    var w = low(word);
    var text = senses.length === 1 ? cap(art(w)) + w + " is " + senses[0].gloss + "." :
      cap(w) + " has several meanings: " + senses.map(function (s, i) { return "(" + (i + 1) + ") " + (s.pos === "noun" ? art(s.label) + s.label : "as " + art(s.pos) + s.pos) + " — " + s.gloss; }).join("; ") + ". Which one do you mean?";
    return { text: text, route: "knowledge", word: w, senses: senses.length > 1 ? senses : null, sources: [W.source + " (reference dataset)"], confidence: 0.8 };
  }
  /* senses listed from another source (the lexicon) tied to the dataset's
     synsets by gloss overlap, so a choice can use the taxonomy too */
  function enrich(word, senses) {
    var DS = get("C4Dataset"), W = DS && DS.available() ? DS.wordnet : null;
    if (!W) return senses;
    var FILE = { noun: "noun", n: "noun", verb: "verb", v: "verb", adjective: "adj", adj: "adj", adverb: "adv", adv: "adv" };
    var used = {};
    return senses.map(function (s) {
      if (s.syn) return s;
      var f = FILE[low(s.pos)] || "noun", g = toks(s.gloss), best = null, bs = 0;
      /* a definition opens with its genus ("A plant of ..."): the synset
         that IS one is the same meaning */
      var genus = f === "noun" ? g[0] : "";
      W.senses(word, f).forEach(function (x) {
        if (used[x.syn.offset]) return;
        var bag = toks(x.syn.def + " " + x.syn.words.join(" ")), sc = 0;
        g.forEach(function (t) { if (bag.indexOf(t) >= 0) sc++; });
        if (genus && W.above(x.syn, 12).some(function (a) { return a.syn.words.some(function (w) { return stem(w) === genus; }); })) sc += 3;
        if (sc > bs) { bs = sc; best = x; }
      });
      if (!best) return s;
      used[best.syn.offset] = 1;
      var hyp = W.follow(best.syn, "@")[0];
      return { gloss: s.gloss, pos: f, syn: best.syn, label: hyp ? hyp.words[0] : "", words: best.syn.words,
               kinds: hyp ? hyp.words.concat(W.above(best.syn, 4).map(function (a) { return a.syn.words[0]; })) : [] };
    });
  }
  function art(w) { return /^[aeiou]/i.test(w) ? "an " : "a "; }
  function describeSense(word, s) {
    var DS = get("C4Dataset"), W = DS && DS.available() ? DS.wordnet : null, extra = [];
    if (W && s.syn) {
      var hyp = W.follow(s.syn, "@")[0];
      if (hyp && low(hyp.words[0]) !== low(s.label)) extra.push("It's a kind of " + hyp.words[0] + ".");
      else if (hyp) { var up = W.follow(hyp, "@")[0]; if (up) extra.push(cap(art(hyp.words[0])) + hyp.words[0] + " is a kind of " + up.words[0] + "."); }
      var parts = W.follow(s.syn, "%p").slice(0, 3).map(function (p) { return p.words[0]; });
      if (parts.length) extra.push("Its parts include " + parts.join(", ") + ".");
      var other = s.syn.words.filter(function (x) { return low(x) !== low(word); }).slice(0, 3);
      if (other.length) extra.push("Also called " + other.join(", ") + ".");
    }
    return cap(word) + (s.label && s.pos === "noun" ? ", the " + s.label + ": " : ", in that sense: ") + s.gloss.replace(/\.$/, "") + "." + (extra.length ? " " + extra.join(" ") : "");
  }

  /* ----------------------------------------------------- running math */
  var REF = "(?:that|it|this|the result|the answer|the number|the total|that number|this number)";
  function num(s) { var n = parseFloat(String(s).replace(/,/g, "")); return isFinite(n) ? n : null; }
  var NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, hundred: 100 };
  function words2num(l) { return l.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred)\b/g, function (w) { return String(NUMW[w]); }); }
  var N = "(-?\\d[\\d,]*(?:\\.\\d+)?)";
  var OPS = [
    [new RegExp("^(?:add|plus)\\s+" + N + "(?:\\s+to\\s+" + REF + ")?$"), function (v, n) { return [v + n, fmt(v) + " + " + fmt(n)]; }],
    [new RegExp("^" + REF + "\\s+(?:plus|\\+)\\s+" + N + "$"), function (v, n) { return [v + n, fmt(v) + " + " + fmt(n)]; }],
    [new RegExp("^(?:subtract|minus|take away|take off|deduct)\\s+" + N + "(?:\\s+(?:from|off)\\s+" + REF + ")?$"), function (v, n) { return [v - n, fmt(v) + " − " + fmt(n)]; }],
    [new RegExp("^" + REF + "\\s+(?:minus|-|less)\\s+" + N + "$"), function (v, n) { return [v - n, fmt(v) + " − " + fmt(n)]; }],
    [new RegExp("^(?:multiply|times)(?:\\s+" + REF + ")?\\s+(?:by\\s+)?" + N + "$"), function (v, n) { return [v * n, fmt(v) + " × " + fmt(n)]; }],
    [new RegExp("^" + REF + "\\s+(?:times|multiplied by|x|\\*)\\s+" + N + "$"), function (v, n) { return [v * n, fmt(v) + " × " + fmt(n)]; }],
    [new RegExp("^divide(?:\\s+" + REF + ")?\\s+by\\s+" + N + "$"), function (v, n) { return n === 0 ? null : [v / n, fmt(v) + " ÷ " + fmt(n)]; }],
    [new RegExp("^(?:" + REF + "\\s+)?divided by\\s+" + N + "$"), function (v, n) { return n === 0 ? null : [v / n, fmt(v) + " ÷ " + fmt(n)]; }],
    [new RegExp("^double(?:\\s+" + REF + ")?$|^twice\\s+" + REF + "$"), function (v) { return [v * 2, fmt(v) + " × 2"]; }],
    [new RegExp("^triple(?:\\s+" + REF + ")?$|^three times\\s+" + REF + "$"), function (v) { return [v * 3, fmt(v) + " × 3"]; }],
    [new RegExp("^halve(?:\\s+" + REF + ")?$|^half\\s+(?:of\\s+)?" + REF + "$"), function (v) { return [v / 2, fmt(v) + " ÷ 2"]; }],
    [new RegExp("^(?:the\\s+)?square\\s+(?:of\\s+)?" + REF + "$|^square(?:\\s+" + REF + ")?$|^" + REF + "\\s+squared$"), function (v) { return [v * v, fmt(v) + "²"]; }],
    [new RegExp("^(?:the\\s+)?cube\\s+(?:of\\s+)?" + REF + "$|^cube(?:\\s+" + REF + ")?$|^" + REF + "\\s+cubed$"), function (v) { return [v * v * v, fmt(v) + "³"]; }],
    [new RegExp("^(?:the\\s+)?square root of\\s+" + REF + "$|^sqrt\\s+" + REF + "$"), function (v) { return v < 0 ? null : [Math.sqrt(v), "√" + fmt(v)]; }],
    [new RegExp("^" + N + "\\s*(?:%|percent)\\s+of\\s+" + REF + "$"), function (v, n) { return [v * n / 100, fmt(n) + "% of " + fmt(v) + " = " + fmt(n / 100) + " × " + fmt(v)]; }],
    [new RegExp("^(?:raise\\s+)?" + REF + "\\s+(?:to the power of|to the|\\^)\\s+" + N + "(?:th|st|nd|rd)?(?:\\s+power)?$"), function (v, n) { return [Math.pow(v, n), fmt(v) + "^" + fmt(n)]; }],
    [new RegExp("^round\\s+" + REF + "(?:\\s+(?:off|up|down))?$"), function (v) { return [Math.round(v), "round(" + fmt(v) + ")"]; }]
  ];
  var TESTS = [
    [new RegExp("^is\\s+" + REF + "\\s+(?:more|greater|bigger|larger|higher)\\s+than\\s+" + N + "$"), function (v, n) { return [v > n, fmt(v) + (v > n ? " > " : " ≤ ") + fmt(n)]; }],
    [new RegExp("^is\\s+" + REF + "\\s+(?:less|smaller|fewer|lower)\\s+than\\s+" + N + "$"), function (v, n) { return [v < n, fmt(v) + (v < n ? " < " : " ≥ ") + fmt(n)]; }],
    [new RegExp("^is\\s+" + REF + "\\s+(?:equal to|the same as)\\s+" + N + "$"), function (v, n) { return [Math.abs(v - n) < 1e-9, fmt(v) + (Math.abs(v - n) < 1e-9 ? " = " : " ≠ ") + fmt(n)]; }],
    [new RegExp("^is\\s+" + REF + "\\s+(?:an?\\s+)?(even|odd)(?:\\s+number)?$"), function (v, n, w) { var ok = Number.isInteger(v) && (Math.abs(v) % 2 === (w === "even" ? 0 : 1)); return [ok, fmt(v) + (Number.isInteger(v) ? " is " + (v % 2 === 0 ? "even" : "odd") : " is not a whole number")]; }],
    [new RegExp("^is\\s+" + REF + "\\s+(?:an?\\s+)?(prime)(?:\\s+number)?$"), function (v) { var p = Number.isInteger(v) && v > 1; for (var d = 2; p && d * d <= v; d++) if (v % d === 0) p = false; return [p, fmt(v) + (p ? " has no divisors but 1 and itself" : " is not prime")]; }],
    [new RegExp("^is\\s+" + REF + "\\s+(?:a\\s+)?(positive|negative)(?:\\s+number)?$"), function (v, n, w) { return [w === "positive" ? v > 0 : v < 0, fmt(v) + (v > 0 ? " > 0" : v < 0 ? " < 0" : " = 0")]; }]
  ];
  function mathFollow(text, log) {
    var prev = lastValue(log, 4);
    if (!prev) return null;
    var l = words2num(low(text).replace(/[?.!]+$/, "")).replace(/^(?:ok(?:ay)?|now|then|and|so|next|and then|alright|right|great|cool)[,!]?\s+/, "")
      .replace(/^(?:ok(?:ay)?|now|then|and|so|next)[,!]?\s+/, "").replace(/^(?:what(?:'s| is)|what do you get if you|can you|could you|please|if you|and if you)\s+/, "").replace(/\s+please$/, "").trim();
    var v = prev.value, i, m, r;
    for (i = 0; i < OPS.length; i++) if ((m = l.match(OPS[i][0]))) {
      r = OPS[i][1](v, m[1] !== undefined ? num(m[1]) : null);
      if (!r || !isFinite(r[0])) return null;
      return { text: fmt(r[0]) + ". " + r[1] + " = " + fmt(r[0]) + " (from the previous result, " + fmt(v) + ").", route: "compute", value: r[0], kind: "math", note: r[1] + " = " + fmt(r[0]), confidence: 0.99 };
    }
    for (i = 0; i < TESTS.length; i++) if ((m = l.match(TESTS[i][0]))) {
      r = TESTS[i][1](v, m[1] !== undefined && !isNaN(parseFloat(m[1])) ? num(m[1]) : null, m[1]);
      return { text: (r[0] ? "Yes" : "No") + " — " + r[1] + " (the previous result was " + fmt(v) + ").", route: "compute", kind: "math", note: r[1], confidence: 0.99 };
    }
    return null;
  }

  /* ----------------------------------------------- word problems over turns */
  /* a told fact of a word problem, not a question (with or without its
     question mark: "what is the probability of drawing red") */
  function isStatement(t) { return !/\?\s*$/.test(t) && !/\b(?:what|how|which|who|whom|whose|why|when|where|find|calculate|compute|work out|probability|chance)\b/i.test(t) && /\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\b/i.test(t) && t.split(/\s+/).length <= 25 && !/=|→/.test(t); }
  function problemRun(log) {
    var run = [];
    for (var i = log.length - 1; i >= 0; i--) { if (log[i].problem) run.unshift(log[i].user); else break; }
    return run;
  }
  var START = /\b(I|we|you|[A-Z][a-z]+|he|she|they)\s+(?:has|have|had|owns?|owned|starts? with|started with|got|gets|bought|buys|picked|baked|made|found|collected)\s+(\d+(?:\.\d+)?)\s+([a-z]+)|\b(?:there)\s+(?:are|were)\s+(\d+(?:\.\d+)?)\s+([a-z]+)/i;
  function problemTopic(lines) {
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(START);
      if (m) { var o = m[1] || "there", it = countedItem(lines) || m[3] || m[5]; return "the word problem about " + (/^(?:there)$/i.test(o) ? "the " + it : /^(?:I|we)$/i.test(o) ? "your " + it : /^(?:you|he|she|they)$/i.test(o) ? "the " + it : o + "'s " + it); }
    }
    return "a word problem";
  }
  /* what is being counted: the noun after the latest number that has one
     ("gave 10 pencils"), else the one before it ("gives away 8" keeps
     counting stickers) */
  var FUNC = /^(?:more|extra|additional|of|each|every|per|times|and|or|to|from|in|on|at|for|with|left|away|the|a|an|his|her|their|my|your|our|its)$/i;
  function countedItem(lines) {
    for (var i = lines.length - 1; i >= 0; i--) {
      var re = /(\d+(?:\.\d+)?)\s+(?:(?:more|extra|additional|new|old|of\s+the|of\s+his|of\s+her|of\s+their)\s+)?([a-z]+)/gi, mm, last = null;
      while ((mm = re.exec(lines[i]))) if (!FUNC.test(mm[2]) && !/^(?:hours?|minutes?|days?|weeks?|years?|times?|percent|dollars?|cents?)$/i.test(mm[2]) || /^(?:dollars?|cents?)$/i.test(mm[2])) last = mm[2];
      if (last) return last.toLowerCase();
    }
    return "";
  }
  function problemFollow(text, log) {
    var E = get("C4LMEveryday");
    if (!E) return null;
    var t = clean(text), run = problemRun(log);
    if (isStatement(t)) {
      var all = run.concat([t]), m = null;
      for (var i = 0; i < all.length && !m; i++) m = all[i].match(START);
      if (!m) return null;
      var owner = m[1] || "there", item = countedItem(all) || m[3] || m[5];
      var q = /^there$/i.test(owner) ? "How many " + item + " are there now?" : /^(?:I|we|you|they)$/i.test(owner) ? "How many " + item + " do " + (/^i$/i.test(owner) ? "I" : owner.toLowerCase()) + " have now?" : "How many " + item + " does " + owner + " have now?";
      if (all.length === 1) {
        var who = /^I$/i.test(owner) ? "you have" : /^we$/i.test(owner) ? "you have" : /^there$/i.test(owner) ? "there are" : owner + " has";
        var what = (t.match(new RegExp((m[2] || m[4]).replace(".", "\\.") + "\\s+([a-z]+(?:\\s+of\\s+[a-z]+)?)", "i")) || [])[1] || item;
        return { text: "Got it: " + who + " " + (m[2] || m[4]) + " " + what + ". Tell me what happens next, or ask me how many there are.", route: "reason", kind: "problem", problem: true, topic: problemTopic(all), note: t, confidence: 0.9 };
      }
      var r = null;
      try { r = E.solve(all.join(" ") + " " + q); } catch (e) { r = null; }
      /* a statement that does not change the count yet (a rate, a price, a
         condition) is kept for the question that follows */
      if (!r) return { text: "Noted: " + t.replace(/[.!]+$/, "") + ". Go on, or ask me the question.", route: "reason", kind: "problem", problem: true, topic: problemTopic(all), note: t, confidence: 0.85 };
      return { text: "Okay — that makes " + r.text.replace(/^(\$?[\d.]+ [a-z]+)(?: left)?\. /, "$1 now. "), route: "reason", kind: "problem", problem: true, value: r.value, topic: problemTopic(all), note: t + " → " + fmt(r.value), confidence: 0.93 };
    }
    if (run.length && /\?\s*$/.test(t) && /\bhow\s+(?:many|much)\b/i.test(t) && !/\d/.test(t)) {
      var r2 = null;
      try { r2 = E.solve(run.join(" ") + " " + t); } catch (e) { r2 = null; }
      if (r2) return { text: r2.text, route: "reason", kind: "problem", problem: true, value: r2.value, topic: problemTopic(run), note: "answer: " + fmt(r2.value), confidence: 0.93 };
      /* the question belongs to the problem even when it cannot be worked out */
      return { text: "I couldn't work that out from what you've told me so far (" + run.join(" ") + "). Tell me the steps another way, or add what's missing.", route: "reason", kind: "problem", problem: true, insufficient: true, topic: problemTopic(run), confidence: 0.5 };
    }
    return null;
  }

  /* ----------------------------------------- the things just discussed */
  function discussed(log, n) {
    var out = [];
    for (var i = log.length - 1; i >= 0 && out.length < (n || 2); i--) {
      var e = log[i].entity;
      if (e && out.map(low).indexOf(low(e)) < 0) out.push(e);
    }
    return out;
  }
  function compareFollow(text, log) {
    var l = low(text).replace(/[?.!]+$/, ""), m;
    if (/\bor\b/.test(l) || !/^(?:so\s+|and\s+)?(?:which|who)\s+(?:one\s+|of\s+(?:the\s+two|them|those|these|both)\s+)?(?:is|has|was)\b|^compare\s+(?:them|the two|those|these)\b|^how\s+do\s+(?:they|the two)\s+compare\b/.test(l)) return null;
    /* "who is X?" is a question about X; a comparison says "of the two",
       "one", "them", or asks with a comparative */
    if (!/^(?:so\s+|and\s+)?(?:which|who)\s+(?:one|of\s+(?:the\s+two|them|those|these|both))\b|^compare\b|^how\s+do\b/.test(l) &&
        !/\b(?:more|less|fewer|[a-z]{3,}er)\s+(?:than|people|populous)?\b|\b(?:bigger|larger|smaller|heavier|lighter|older|younger|faster|slower|taller|shorter|longer|hotter|colder|farther|further|closer|nearer|higher|deeper|wider|greater)\b/.test(l)) return null;
    var two = discussed(log, 2);
    if (two.length < 2) return null;
    var adj = null;
    if (/\bmore\s+(?:people|inhabitants|residents)\b|\bbigger\s+population\b|\blarger\s+population\b|\bmore\s+populous\b/.test(l)) adj = "more populous";
    else if ((m = l.match(/\b(bigger|larger|smaller|heavier|lighter|older|younger|faster|slower|taller|shorter|longer|hotter|colder|farther|further|closer|nearer|higher|deeper|wider|greater)\b/))) adj = m[1];
    if (!adj) return { rewrite: "What's the difference between " + two[1] + " and " + two[0] + "?" };
    return { rewrite: "Which is " + adj + ", " + two[1] + " or " + two[0] + "?" };
  }
  var SCALE = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
  function big(v) {
    if (Math.abs(v) >= 1e3 && Math.abs(v) < 1e6) { var p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2); return String(Math.round(v / p) * p).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
    for (var i = 0; i < SCALE.length; i++) if (Math.abs(v) >= SCALE[i][0]) return fmt(Math.round(v / SCALE[i][0] * 100) / 100) + " " + SCALE[i][1]; return fmt(Math.round(v * 100) / 100); }
  var UNIT_WORD = { yr: "years", m: "metres", kg: "kg", n: "people", C: "°C", "m/s": "m/s" };
  function byHowMuch(text, log) {
    var l = low(text).replace(/[?.!]+$/, "");
    if (!/^(?:and\s+|so\s+)?(?:by\s+how\s+much|how\s+much\s+(?:more|bigger|older|larger|higher|longer|heavier|faster|hotter|further|farther|less|smaller|younger)|what(?:'s| is) the difference(?: between them)?|how\s+big\s+is\s+the\s+difference)$/.test(l)) return null;
    var CV = get("C4LMConverse"), c = CV && CV.lastMeasure ? CV.lastMeasure() : null, cmp = recent(log, function (e) { return e.route === "comparison"; }, 2);
    if (!cmp) return null;
    /* the comparison could not be made: there is no difference to give */
    if (!c) return { text: "I can't say by how much — I couldn't compare them in the first place: " + cmp.answer.replace(/^I\b/, "I").replace(/\.$/, "") + ".", route: "conversation", kind: "math", insufficient: true, confidence: 0.6 };
    var diff = Math.abs(c.a.value - c.b.value), unit = c.a.unit, u = UNIT_WORD[unit] || unit || "";
    var shown = unit === "m" && diff >= 1000 ? big(diff / 1000) + " km" : big(diff) + (u ? " " + u : "");
    var ratio = Math.max(c.a.value, c.b.value) / Math.min(c.a.value, c.b.value);
    return { text: "By about " + shown + ": " + c.win + " " + c.a.text + " versus " + c.b.text + " for " + c.lose + (ratio < 1.5 ? " — a difference of about " + fmt(Math.round((ratio - 1) * 1000) / 10) + "%." : " — about " + fmt(Math.round(ratio * 10) / 10) + " times as much."),
             route: "compute", kind: "math", value: diff, shown: shown, confidence: 0.9 };
  }

  /* ------------------------------------------------ elaboration, "what else" */
  function moreFollow(text, log, ctx) {
    var l = low(text).replace(/[?.!]+$/, ""), m, who = null;
    if ((m = l.match(/^(?:ok(?:ay)?[, ]+)?(?:tell me more|more|go on|keep going|continue|anything else|what else(?: do you know)?|and\??|say more|more please|elaborate)(?:\s+(?:about|on)\s+(.+?))?(?:\s+please)?$/))) who = m[1] || null;
    else return null;
    var ent = who ? who.replace(/^(?:the|a|an)\s+/, "") : (recent(log, function (e) { return !!e.entity; }, 4) || {}).entity;
    if (!ent || /^(?:it|that|this|him|her|them)$/.test(ent)) ent = (recent(log, function (e) { return !!e.entity; }, 4) || {}).entity;
    if (!ent) return null;
    var said = log.filter(function (e) { return low(e.entity) === low(ent); }).map(function (e) { return e.answer; });
    var more = ctx && ctx.elaborate ? ctx.elaborate(ent, said) : null;
    if (!more) return null;
    return { text: more, route: "knowledge", entity: ent, kind: "more", confidence: 0.85 };
  }
  function elseFollow(text, log) {
    var l = low(text).replace(/[?.!]+$/, ""), m = l.match(/^what\s+(?:else|other\s+\w+)\s+did\s+(he|she|they|[a-z][a-z .'-]+?)\s+(write|paint|create|compose|invent|discover|found|build|design|direct|make|produce)$/);
    if (!m) return null;
    var CO = get("C4LMCore"), KB = get("C4LMKB"), rel = CO && CO.relationForVerb ? CO.relationForVerb(m[2] === "write" ? "wrote" : m[2]) : "";
    var pr = /^(?:he|she|they)$/.test(m[1]) ? recent(log, function (e) { return !!(e.person || e.entity); }, 5) : null;
    var person = pr ? pr.person || pr.entity : m[1];
    var keys = uniq([rel, "author", "creator", "artist", "painter", "composer", "inventor", "founder", "architect", "director"]);
    if (!person || !KB) return null;
    var pe = KB.resolve(person, { strict: true })[0];
    /* "he" after a question about a work is the one who made it */
    if (pe && pe.entity.type !== "person") {
      var maker = keys.map(function (k) { return (pe.entity.rel || {})[k]; }).filter(function (v) { return typeof v === "string"; })[0];
      if (!maker) return null;
      pe = KB.resolve(maker, { strict: true })[0] || null;
      person = maker;
    }
    var pname = pe ? pe.entity.name : person;
    var already = log.map(function (e) { return low(e.entity); });
    var works = KB.entities().filter(function (e) {
      return keys.some(function (k) { return typeof (e.rel || {})[k] === "string" && low(e.rel[k]).indexOf(low(pname)) >= 0; });
    });
    var others = works.filter(function (e) { return already.indexOf(low(e.name)) < 0; });
    if (!works.length) return { text: "I don't hold any other works by " + pname + " in my knowledge base.", route: "knowledge", kind: "else", confidence: 0.6 };
    if (!others.length) return { text: "The only work by " + pname + " I hold is the one we just talked about.", route: "knowledge", kind: "else", confidence: 0.6 };
    var PAST = { write: "wrote", build: "built", make: "made", found: "founded", paint: "painted", direct: "directed", invent: "invented", discover: "discovered", design: "designed", compose: "composed", create: "created", produce: "produced" };
    return { text: pname + " also " + (PAST[m[2]] || m[2] + "ed") + " " + others.slice(0, 5).map(function (e) { return e.name; }).join(", ") + ".", route: "knowledge", kind: "else", entity: others[0].name, confidence: 0.85 };
  }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }

  /* --------------------------------------------------- the conversation */
  function recallFollow(text, log) {
    var l = low(text).replace(/[?.!]+$/, "");
    if (!log.length) return null;
    if (/^what\s+(?:did\s+we\s+(?:talk|start|begin)\s+(?:about|with)\s+first|was\s+the\s+first\s+(?:thing|topic)\s+(?:we\s+(?:talked|discussed)|you\s+told\s+me)(?:\s+about)?)$/.test(l)) {
      var f = log.filter(function (e) { return e.topic; })[0];
      return f ? { text: "We started with " + f.topic + " — you asked “" + f.user + "”.", route: "conversation", kind: "recall", confidence: 0.9 } : null;
    }
    if (/^what\s+(?:was|is)\s+the\s+(?:last|previous|latest)\s+(?:number|result|answer|value)(?:\s+you\s+(?:gave|told|showed)\s+me)?$/.test(l)) {
      var v = recent(log, function (e) { return typeof e.value === "number"; });
      return v ? { text: "The last number was " + (v.shown || fmt(v.value)) + " — from “" + v.user + "”.", route: "conversation", kind: "recall", value: v.value, confidence: 0.9 } : null;
    }
    if (/^(?:can you\s+|please\s+)?(?:summari[sz]e|recap|sum up)(?:\s+(?:our|the|this))?(?:\s+(?:conversation|chat|discussion|talk|session))?(?:\s+so\s+far)?(?:\s+please)?$|^what\s+have\s+we\s+(?:talked|discussed)\s+(?:about\s+)?so\s+far$|^what\s+did\s+we\s+(?:talk\s+about|discuss)$/.test(l)) {
      var groups = [], last = null;
      log.forEach(function (e) {
        var key = e.topic || (e.kind === "math" || (typeof e.value === "number" && /^(?:compute|math|tool|calculation)$/.test(e.route)) ? "the running calculation" : null);
        if (!key) return;
        if (!last || last.key !== key) { last = { key: key, notes: [] }; groups.push(last); }
        if (e.note) last.notes.push(String(e.note).replace(/[.;]\s*$/, ""));
      });
      if (!groups.length) return null;
      return { text: "Here's what we've covered: " + groups.slice(0, 10).map(function (g, i) { return (i + 1) + ") " + g.key + (g.notes.length ? " — " + uniq(g.notes).slice(-3).join("; ") : ""); }).join(" ") + (groups.length > 10 ? " …and " + (groups.length - 10) + " more." : ""),
               route: "conversation", kind: "summary", confidence: 0.9 };
    }
    return null;
  }

  /* ------------------------------------------------------------ answer */
  function answer(text, ctx) {
    ctx = ctx || {};
    var log = ctx.log || [], t = clean(text), r;
    if (!t) return null;
    var lastE = log[log.length - 1];
    if (lastE && lastE.senses && lastE.senses.length > 1 && t.split(/\s+/).length <= 8 && !/^(?:what|who|when|where|why|how|is|are|do|does|can)\b(?!.*\b(?:one|meaning|sense)\b)/i.test(t)) {
      var ch = chooseSense(t, lastE);
      if (ch) return { text: describeSense(lastE.word, ch.sense), route: "knowledge", entity: lastE.word, kind: "sense", chosenSense: ch.sense.label || ch.sense.gloss, note: "you meant the " + (ch.sense.label || "sense “" + ch.sense.gloss.slice(0, 30) + "”"), confidence: 0.88 };
    }
    return mathFollow(t, log) || problemFollow(t, log) || byHowMuch(t, log) || compareFollow(t, log) || elseFollow(t, log) || moreFollow(t, log, ctx) || recallFollow(t, log);
  }
  /* would this message be read against the conversation? (the memory layer
     leaves such messages alone) */
  function wants(text, log) {
    var t = clean(text);
    if (!t || !log || !log.length) return isStatement(t) && START.test(t);
    try {
      var lastE = log[log.length - 1];
      if (lastE && lastE.senses && lastE.senses.length > 1 && t.split(/\s+/).length <= 8 && chooseSense(t, lastE)) return true;
      return !!((isStatement(t) && (START.test(t) || problemRun(log).length)) || answer(t, { log: log }));
    } catch (e) { return false; }
  }
  var DL = { answer: answer, wants: wants, define: define, enrich: enrich, sensesFromText: sensesFromText, lastValue: lastValue };
  root.C4LMDialogue = DL;
  if (typeof module !== "undefined" && module.exports) module.exports = DL;
})(typeof window !== "undefined" ? window : globalThis);
