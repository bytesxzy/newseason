/* CELL4 language orchestrator.
 *
 *   RAW TEXT -> shared normalisation -> one QueryFrame
 *            -> parallel System-1 decisions (one feature pass, many verdicts)
 *            -> adaptive depth: the cheapest sufficient resolver runs
 *            -> verification and confidence
 *            -> answer plan -> realiser -> text
 *
 * The System-1 layer is a typed decision head in the spirit of the small
 * structured-decision models: unstructured input becomes structured decisions
 * cheaply and in one pass, and only the branch those decisions select pays
 * for deep work. Free-form language is still produced -- by the realiser,
 * from structured content, at the end.
 *
 * No external model service anywhere in this file. The only network use is
 * the keyless public-data federation, and it runs only when the frame says
 * the answer cannot be known locally.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore, KB = root.C4LMKB, RS = root.C4LMReason,
      PRB = root.C4LMProblem, KER = root.C4ReasonKernel, CMP = root.C4LMComprehend,
      RT = root.C4LMRetrieve, EV = root.C4LMEvidence, RZ = root.C4LMRealize,
      CD = root.C4LMCode, MEM = root.C4LMMemory;

  var state = {
    ready: false,
    index: null,
    federation: null,
    ablations: Object.create(null),
    memory: null,
    varyKey: "",
    userText: "",
    mode: "tool",
    defaultMode: "tool",
    profile: [],
    stats: { turns: 0, web: 0, cacheHits: 0 }
  };

  /* Evaluation modes, never mixed in one score: "closed" answers from local
     knowledge, local exact tools and local reasoning with the network OFF;
     "tool" (the default) may also consult the keyless evidence federation. */
  function off(name) { return !!state.ablations[name] || (name === "web" && state.mode === "closed"); }

  /* ===================================================== discourse state */

  function Discourse() {
    this.activeEntity = "";
    this.activeTopic = "";
    this.currentRelation = "";
    this.questionFamily = "";
    this.recentEntities = [];
    this.recentClaims = [];
    this.answerFacets = [];
    this.lastAnswer = "";
    this.turns = 0;
    this.lastCandidates = [];
    /* What was actually said, turn by turn: the user's words (normalised and
       as content stems), what was read as their subject, what was answered
       and whether that answer was a real one. Repetition is judged against
       this record, not against surface strings. */
    this.history = [];
  }
  Discourse.prototype.snapshot = function () {
    return {
      subject: this.activeEntity, entity: this.activeEntity, topic: this.activeTopic,
      relation: this.currentRelation, family: this.questionFamily,
      recent: this.recentEntities.slice(0, 5), facets: this.answerFacets.slice(0, 6),
      turn: this.turns, candidates: this.lastCandidates.slice()
    };
  };
  Discourse.prototype.commit = function (frame, result) {
    this.turns++;
    if (frame.topicShift) {
      this.activeEntity = ""; this.activeTopic = ""; this.currentRelation = "";
      this.answerFacets = [];
    }
    var ent = result && (result.entity || result.subject);
    if (!ent && result && result.pendingSenses && result.pendingSenses.length) {
      /* A clarification leaves the reading open but not the topic: a pronoun
         in the next turn still has the dominant candidate to attach to. */
      ent = result.pendingSenses[0].entity;
    }
    if (ent && !result.carriedContext) {
      if (this.activeEntity && C.flatten(this.activeEntity) !== C.flatten(ent)) {
        this.recentEntities.unshift(this.activeEntity);
        this.recentEntities = this.recentEntities.slice(0, 6);
      }
      this.activeEntity = ent;
      this.activeTopic = ent;
    } else if (ent && !this.activeEntity) {
      this.activeEntity = ent; this.activeTopic = ent;
    }
    if (result && result.relation) this.currentRelation = result.relation;
    this.questionFamily = frame.queryForm;
    if (result && result.text) {
      this.lastAnswer = result.text;
      this.recentClaims.unshift({ text: result.text, entity: ent || "", turn: this.turns });
      this.recentClaims = this.recentClaims.slice(0, 5);
    }
    if (result && result.facets) this.answerFacets = result.facets.slice(0, 8);
    if (result && result.candidates) this.lastCandidates = result.candidates.slice(0, 6);
    if (result && result.comparison) this.lastComparison = result.comparison;
    if (result && result.pendingSenses) this.pendingSenses = result.pendingSenses;
  };

  /* Selective forgetting: whatever the predicate names leaves the discourse,
     so a pronoun can no longer land on it. */
  Discourse.prototype.forget = function (pred) {
    function gone(x) { return !!x && pred(String(x)); }
    if (gone(this.activeEntity) || gone(this.activeTopic)) {
      this.activeEntity = ""; this.activeTopic = ""; this.currentRelation = ""; this.questionFamily = "";
      this.answerFacets = [];
    }
    this.recentEntities = this.recentEntities.filter(function (e) { return !gone(e); });
    this.recentClaims = this.recentClaims.filter(function (c) { return !(c && gone(c.entity)); });
    this.lastCandidates = this.lastCandidates.filter(function (c) { return !(c && gone(c.entity || c.name || c)); });
    if (this.pendingSenses) this.pendingSenses = null;
    if (this.lastComparison) this.lastComparison = null;
    return this;
  };
  /* "keep France in this context": France becomes what "it" refers to. */
  Discourse.prototype.focus = function (entity) {
    if (!entity) return this;
    if (this.activeEntity && C.flatten(this.activeEntity) !== C.flatten(entity)) {
      this.recentEntities.unshift(this.activeEntity);
      this.recentEntities = this.recentEntities.slice(0, 6);
    }
    this.activeEntity = entity; this.activeTopic = entity;
    this.currentRelation = ""; this.questionFamily = ""; this.answerFacets = [];
    return this;
  };

  /* Pronoun and ellipsis resolution. A reference is replaced by the active
     entity only when the message cannot stand on its own; a topic shift or a
     self-sufficient question clears the carry instead of dragging it along. */
  var THIRD_PERSON = /^(?:he|she|it|they|them|him|her|his|hers|its|their|theirs|this|that|these|those|one)$/i;
  /* words that carry no topic of their own in a follow-up ("how COME?",
     "why EXACTLY?", "and THEN?") -- a closed class of discourse particles */
  var DISCOURSE_PARTICLE = /^(?:come|so|exactly|then|else|more|really|again|now|though|anyway|instead)$/i;
  /* Pronoun tokens that do not refer in this message (English syntax):
       dummy "it"     it + be + adjective/that/to ("it is true that",
                      "is it possible to"), it + seems/appears/looks/turns
                      out/happens, weather and clock "it" ("it is raining",
                      "what time is it")
       clause "that"  that introducing a clause after a verb or adjective
                      of saying/knowing/judging, or before a subject
                      ("true that no birds fly", "think that he") */
  function nonReferring(body) {
    var t = " " + String(body || "").toLowerCase().replace(/[?!.,]+/g, " ") + " ", out = {};
    if (/\b(?:is|was|isn't|wasn't|will|would|could|can)\s+it\s+(?:\w+\s+)?(?:true|false|possible|impossible|likely|unlikely|ok|okay|fine|safe|normal|wise|necessary|worth|hard|easy|better|best|good|bad|fair|legal|rude|important|common|raining|snowing|sunny|cold|hot|warm|windy|late|early)\b/.test(t) ||
        /\bit(?:'s|\s+is|\s+was|\s+will be|\s+would be)\s+(?:\w+\s+)?(?:true|false|possible|impossible|likely|unlikely|ok|okay|fine|safe|normal|wise|necessary|worth|hard|easy|better|best|good|bad|fair|important|common|raining|snowing|sunny|cloudy|cold|hot|warm|windy|late|early|\d)/.test(t) ||
        /\bit\s+(?:seems|seemed|appears|appeared|looks like|turns out|turned out|happens|happened that|rains|snows|rained|snowed)\b/.test(t) ||
        /\bwhat\s+(?:time|day|date|year|month)\s+is\s+it\b/.test(t))
      out.it = 1;
    if (/\b(?:true|false|possible|likely|sure|clear|obvious|certain|think|thinks|thought|know|knows|knew|say|says|said|believe|believes|mean|means|hope|hopes|seems|fact|so|such|claim|claims|heard|read)\s+that\b/.test(t) ||
        /\bthat\s+(?:no|all|some|every|each|most|the|a|an|i|you|we|they|he|she|there)\b/.test(t))
      out.that = 1;
    return out;
  }

  function resolveContext(frame, disc) {
    if (off("dialogue")) return { frame: frame, carried: false };
    if (!disc || !disc.activeEntity) return { frame: frame, carried: false };
    if (frame.topicShift) return { frame: frame, carried: false };
    /* A message that is a complete act of its own -- a feeling, a request
       for a riddle, a decision, a greeting -- is not an ellipsis of the
       previous question, however short it is. */
    var CVc = root.C4LMConverse;
    if (CVc && !off("converse")) { try { if (CVc.analyze(frame.rawText || frame.body)) return { frame: frame, carried: false }; } catch (e) {} }

    var needsCarry = false, reason = "";
    /* 1. a third-person pronoun with no competing entity in the message.
       Not every "it" or "that" refers: "is it true THAT no birds fly",
       "it is raining", "what time is it" use a dummy subject and a clause
       marker, and must not drag the previous topic in. */
    var dummy = nonReferring(frame.body);
    var hasPronoun = frame.pronouns.some(function (p) { return THIRD_PERSON.test(p) && !dummy[p.toLowerCase()]; });
    if (hasPronoun && !frame.entities.length) { needsCarry = true; reason = "pronoun"; }
    /* 2. an elliptical fragment: a bare noun phrase, a bare relation, or a
          bare "why"/"how" with nothing to attach to */
    /* A bare entity after a relational question repeats that question about
       a new subject: "capital of France?" then "and Germany?" or just
       "Germany?". This is parallel ellipsis, and it is resolved by reusing
       the previous relation, not by dragging the previous subject in. */
    if (!needsCarry && frame.wordCount <= 4 && disc.currentRelation && KB) {
      var bare = frame.body.replace(/[?.!]+$/, "").trim();
      if (bare && KB.resolve(bare, { strict: true }).length &&
          C.flatten(bare) !== C.flatten(disc.activeEntity)) {
        var parallel = C.parse(questionFor(disc.questionFamily, disc.currentRelation, bare), disc.snapshot());
        parallel.rawText = frame.rawText;
        return { frame: parallel, carried: true, reason: "parallel", newSubject: bare };
      }
    }
    if (!needsCarry && frame.wordCount <= 6) {
      /* A bare noun that names something is a NEW topic, not an ellipsis:
         typing "learning" after a question about Mercury is a change of
         subject. Only an explicit continuation marker, a pronoun or an
         unattached relation carries the previous subject forward. */
      /* One content word that names something is enough to make this a new
         topic: "mouse computing" after a question about viruses is a change
         of subject, not a continuation of it. */
      var namesSomething = frame.contentTokens.length >= 1 &&
        ((KB && KB.resolve(frame.body.replace(/[?.!]+$/, "").trim(), { strict: true }).length > 0) ||
         (root.C4LMLexicon && frame.contentTokens.some(function (t) { return root.C4LMLexicon.has(t); })) ||
         (KB && frame.contentTokens.some(function (t) { return KB.resolve(t, { strict: true }).length > 0; })));
      /* A wh-question is elliptical only when it has nothing of its own
         to be about: "why?", "how come?", "when?" continue the previous
         topic; "why is the sky blue?" names its own. */
      var own = frame.contentTokens.filter(function (t) { return !DISCOURSE_PARTICLE.test(t); });
      var bareWh = /^(?:why|how|when|where)\b/i.test(frame.body) && !own.length && !frame.subject;
      if (frame.leadMarker === "and" || frame.leadMarker === "but" ||
          /^(?:and|what about|how about|what else|more|and what of)\b/i.test(frame.body) || bareWh ||
          (frame.relation && !frame.subject) ||
          (!namesSomething && frame.queryForm === "statement" && !frame.entities.length &&
           frame.contentTokens.length <= 2)) {
        needsCarry = true; reason = "ellipsis";
      }
    }
    /* 3. a relation with no subject at any length */
    if (!needsCarry && frame.relation && !frame.subject) { needsCarry = true; reason = "open-relation"; }
    if (!needsCarry) return { frame: frame, carried: false };

    /* Build the explicit question the fragment stands for, then parse it
       once. Downstream never sees a fragment. */
    var subject = disc.activeEntity;
    var rebuilt = "";
    /* A pronoun is resolved in place: the rest of the message keeps its own
       syntax, so "when was he born" stays a birth-date question rather than
       being rebuilt from the relation label. */
    if (hasPronoun) {
      rebuilt = frame.body.replace(/\b(?:he|she|it|they|them|him|her|his|hers|its|their|theirs)\b/gi, function (m0) {
        return /^(?:his|her|its|their)$/i.test(m0) ? subject + "'s" : subject;
      });
    } else if (frame.relation) rebuilt = "what is the " + (frame.relationPhrase || frame.relation) + " of " + subject;
    else if (/^(?:and|what about|how about)\b/i.test(frame.body) || frame.leadMarker === "and") {
      /* "and UDP?" introduces a NEW subject under the SAME question.
         "what about cost?" introduces a new facet of the SAME subject. */
      var tail = frame.body.replace(/^(?:and|what about|how about)\s*/i, "").replace(/[?.!]+$/, "").trim();
      var tailIsEntity = KB && KB.resolve(tail, { strict: true }).length > 0;
      if (tailIsEntity && disc.questionFamily) {
        rebuilt = questionFor(disc.questionFamily, disc.currentRelation, tail);
        return { frame: C.parse(rebuilt, disc.snapshot()), carried: true, reason: "parallel", newSubject: tail };
      }
      rebuilt = "what is the " + tail + " of " + subject;
    } else if (/^why\b/i.test(frame.body)) rebuilt = "why " + subject;
    else if (/^how\b/i.test(frame.body)) rebuilt = "how does " + subject + " work";
    else rebuilt = frame.body + " of " + subject;

    var carriedFrame = C.parse(rebuilt, disc.snapshot());
    /* Keep the user's own format and length requests: they belong to the
       message, not to the reconstructed question. */
    carriedFrame.requestedFormat = frame.requestedFormat;
    carriedFrame.requestedLength = frame.requestedLength;
    carriedFrame.requestedUnit = frame.requestedUnit;
    carriedFrame.onlyValue = frame.onlyValue;
    carriedFrame.rawText = frame.rawText;
    return { frame: carriedFrame, carried: true, reason: reason };
  }
  function questionFor(family, relation, subject) {
    if (relation) return "what is the " + relation + " of " + subject;
    if (family === "why") return "why " + subject;
    if (family === "howmany") return "how many " + subject;
    return "what is " + subject;
  }

  /* ============================================ System-1 decision head
   * One feature extraction, many decisions. The weights are a small
   * log-linear model per route; they are read once from the shared feature
   * vector rather than from ten independent classifiers over the raw text. */

  var ROUTES = ["compute", "reason", "knowledge", "local", "web", "comparison",
                "explanation", "conversation", "code", "clarify"];

  function features(frame, disc) {
    return {
      isEmpty: frame.empty ? 1 : 0,
      hasNumber: /\d/.test(frame.body) ? 1 : 0,
      arithmetic: frame.requiresComputation ? 1 : 0,
      logical: frame.requiresReasoning ? 1 : 0,
      compare: frame.requiresComparison ? 1 : 0,
      explain: frame.requiresExplanation ? 1 : 0,
      list: frame.requiresList ? 1 : 0,
      code: frame.requiresCode ? 1 : 0,
      fresh: frame.requiresFreshInformation ? 1 : 0,
      question: frame.speechAct === "question" ? 1 : 0,
      command: frame.speechAct === "command" ? 1 : 0,
      social: (frame.speechAct === "greeting" || frame.speechAct === "thanks" ||
               frame.speechAct === "acknowledgement" || frame.metaSelf) ? 1 : 0,
      statement: frame.speechAct === "statement" ? 1 : 0,
      remark: (frame.speechAct === "statement" && !frame.hasQuestionMark &&
               !frame.requiresComputation && !frame.requiresCode && frame.wordCount >= 3) ? 1 : 0,
      hasRelation: frame.relation ? 1 : 0,
      hasSubject: frame.subject || frame.entities.length ? 1 : 0,
      shortMsg: frame.wordCount <= 4 ? 1 : 0,
      longMsg: frame.wordCount >= 25 ? 1 : 0,
      aboutSite: /\b(?:cell4|robots\.js|this site|this page|your (?:engine|solver|code))\b/i.test(frame.lower) ? 1 : 0,
      kbHit: 0, kbRelation: 0, ambiguousName: 0, localHit: 0,
      hasContext: disc && disc.activeEntity ? 1 : 0
    };
  }

  /* Resolve the subject against local knowledge ONCE, and let every decision
     read the result. This is the single most useful feature and the old
     stack recomputed its equivalent per consumer. */
  function groundSubject(frame, f) {
    if (!KB || off("kb")) return null;
    var tries = [];
    if (frame.subject) tries.push(frame.subject);
    frame.entities.forEach(function (e) { tries.push(e); });
    if (frame.topic) tries.push(frame.topic);
    frame.subjectCandidates.forEach(function (c) { if (c.weight >= 0.35) tries.push(c.text); });
    var best = null;
    for (var i = 0; i < tries.length && i < 22; i++) {
      var hits = KB.resolve(tries[i]).filter(genuineMatch);
      if (!hits.length) continue;
      var ent = hits[0].entity;
      var senses = KB.senses(tries[i]);
      /* Grounding is intent-aware. "Why does Earth have seasons?" names two
         known entities; the one that carries a causal account is the one the
         question is about. The same rule picks the entity that holds the
         asked relation over one that merely shares the sentence. */
      var bonus = 0;
      if (frame.requiresExplanation && ((ent.extra && ent.extra.why) || (ent.rel && ent.rel.cause))) bonus += 0.45;
      if (frame.relation && ent.rel && ent.rel[frame.relation]) bonus += 0.5;
      /* Cross-coverage: the candidate whose own record accounts for the rest
         of the question is the one the question is about. "Earth have
         seasons" is about seasons, whose entry mentions Earth -- not about
         Earth, whose entry does not mention seasons. */
      var blob = C.flatten([ent.defn, JSON.stringify(ent.rel || {}), JSON.stringify(ent.extra || {})].join(" "));
      var own = C.flatten(ent.name).split(" ");
      var covered = 0, others = 0;
      for (var q = 0; q < frame.contentTokens.length; q++) {
        var tk = frame.contentTokens[q];
        if (own.indexOf(tk) >= 0) continue;
        others++;
        if (blob.indexOf(C.stem(tk)) >= 0 || blob.indexOf(tk) >= 0) covered++;
      }
      if (others) bonus += 0.35 * (covered / others);
      var cand = { phrase: tries[i], hits: hits, senses: senses, score: hits[0].score - i * 0.03 + bonus };
      if (!best || cand.score > best.score) best = cand;
      if (hits[0].score >= 0.95 && bonus > 0) break;
    }
    if (best) {
      f.kbHit = 1;
      if (frame.relation && KB.attribute(best.hits[0].entity, frame.relation)) f.kbRelation = 1;
      if (best.senses && best.senses.length > 1) f.ambiguousName = 1;
    }
    return best;
  }

  var WEIGHTS = {
    compute:     { arithmetic: 3.0, hasNumber: 0.8, code: -1.2, compare: -1.0, social: -3, explain: -0.6 },
    reason:      { logical: 3.0, arithmetic: 0.4, hasNumber: 0.5, social: -3, kbRelation: -0.8 },
    knowledge:   { kbHit: 2.4, kbRelation: 2.2, question: 0.7, command: 0.3, hasSubject: 0.5,
                   fresh: -3.0, social: -3, aboutSite: -2.5, arithmetic: -1.5, code: -0.8 },
    comparison:  { compare: 3.2, kbHit: 0.5, social: -3 },
    explanation: { explain: 2.4, kbHit: 0.8, question: 0.3, social: -3, arithmetic: -1.5 },
    code:        { code: 2.6, command: 0.6, social: -3, compare: -0.8 },
    local:       { aboutSite: 3.2, localHit: 1.2, question: 0.3, fresh: -2 },
    web:         { fresh: 3.0, question: 0.4, kbHit: -0.6, arithmetic: -2, social: -3 },
    conversation:{ social: 3.4, statement: 1.0, remark: 1.6, shortMsg: 0.5, question: -1.0, kbHit: -1.2,
                   arithmetic: -2, code: -1.5, hasRelation: -1.5 },
    clarify:     { ambiguousName: 2.0, shortMsg: 0.2, hasContext: -1.5, hasRelation: -1.5, explain: -1 }
  };

  function decide(frame, disc) {
    var f = features(frame, disc);
    var grounded = groundSubject(frame, f);
    if (state.index && !off("retrieval")) {
      /* A cheap probe only; full ranking happens on the branch that needs it. */
      var probe = state.index.candidates(frame, 3);
      f.localHit = probe.length && probe[0].bm25 > 3 ? 1 : 0;
    }
    var logits = Object.create(null), i, r;
    for (i = 0; i < ROUTES.length; i++) {
      r = ROUTES[i];
      var w = WEIGHTS[r] || {}, sum = -1.0;
      for (var k in w) sum += w[k] * (f[k] || 0);
      logits[r] = sum;
    }
    /* softmax for calibrated probabilities */
    var peak = -Infinity;
    for (r in logits) if (logits[r] > peak) peak = logits[r];
    var z = 0, dist = Object.create(null);
    for (r in logits) { dist[r] = Math.exp(logits[r] - peak); z += dist[r]; }
    for (r in dist) dist[r] /= z;

    var order = ROUTES.slice().sort(function (a, b) { return dist[b] - dist[a]; });
    /* Adaptive depth. Level 0 is a deterministic operation; level 3 is a
       decomposition. The router predicts it from the same features, so a
       trivial question never pays for deep machinery. */
    var depth = 1;
    if (f.social || (f.arithmetic && !f.logical)) depth = 0;
    else if (f.logical || f.compare || f.explain) depth = 2;
    else if (f.fresh || f.longMsg || (f.explain && f.compare)) depth = 3;
    if (f.code) depth = Math.max(depth, 2);

    return {
      features: f, grounded: grounded, dist: dist, order: order,
      route: order[0], confidence: dist[order[0]], depth: depth,
      margin: dist[order[0]] - dist[order[1]]
    };
  }

  /* A type qualifier is only a qualifier when the word really names a type
     and the other word really names something. The lexicon supplies the
     first test and the knowledge base the second; neither is a list written
     for particular phrases. */
  var TYPE_CLASSES = { GROUP: 1, PLACE: 1, ARTIFACT: 1, PERSON: 1, ORGANISM: 1, FIELD: 1, COMMUNICATION: 1, SUBSTANCE: 1 };
  function validQualifier(frame) {
    if (!frame.typeQualifier || !frame.qualifiedName) return null;
    var LX = root.C4LMLexicon;
    var q = frame.typeQualifier;
    /* Any common noun may name a type. Whether it really does is settled by
       whether a candidate sense matches it -- if none does, the qualifier
       reading is abandoned and nothing is lost. The class test only raises
       confidence, it does not gate. */
    var typeish = false;
    if (LX) {
      var hit = LX.lookup(q);
      if (hit) typeish = hit.senses.some(function (sn) { return sn.pos === "n"; });
    }
    if (!typeish && KB) typeish = KB.byType(q).length > 0;
    if (!typeish) return null;
    /* The qualified word must not itself be an ordinary word being modified
       ("learning pivot" is not a pivot of type learning). */
    if (LX && LX.lookup(frame.qualifiedName) && !/^[A-Z]/.test(frame.qualifiedName)) {
      var known = KB && KB.resolve(frame.qualifiedName, { strict: true }).length;
      if (!known) return null;
    }
    return { type: q, name: frame.qualifiedName };
  }

  /* ================================================= knowledge answering */

  /* A knowledge-base entry reached through a GENERIC alias is a pointer, not
     an identification: "method" points at the programming sense of function,
     "river" points at the Nile. When the matched spelling is an ordinary word
     and the entry is named something else, the match is rejected -- the word
     belongs to the lexicon, and the entry is about a different thing. */
  function genuineMatch(hit) {
    var LX = root.C4LMLexicon;
    if (!LX || !hit || !hit.surface) return true;
    var surface = String(hit.surface).toLowerCase();
    var name = C.flatten(hit.entity.name).replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (C.flatten(surface) === name) return true;          /* matched its own name */
    if (/^[A-Z]/.test(hit.surface)) return true;           /* a proper spelling */
    return !LX.has(surface);                               /* else: ordinary word wins */
  }

  var RELATION_LABEL = {
    capital: "capital", currency: "currency", language: "language", symbol: "chemical symbol",
    author: "author", creator: "creator", artist: "creator", birth: "date of birth",
    death: "date of death", population: "population", location: "location", height: "height",
    length: "length", speed: "speed", count: "number", purpose: "use", cause: "cause",
    part: "components", type: "type", time: "date", price: "price", version: "version",
    distance: "distance", size: "size", mechanism: "mechanism", definition: "definition"
  };

  function answerFromKB(frame, decision) {
    var g = decision.grounded;
    if (!g || !g.hits.length) return null;
    var entity = g.hits[0].entity;

    /* "the company Meta" asks for the sense of Meta that is a company. The
       qualifier filters the candidates before anything else looks at them. */
    var qual = validQualifier(frame);
    if (qual) {
      var wanted = qual.type.replace(/s$/, "");
      for (var qi = 0; qi < g.hits.length; qi++) {
        var cand = g.hits[qi].entity;
        var blob = (cand.type + " " + (cand.rel && cand.rel.type || "") + " " + cand.defn).toLowerCase();
        if (blob.indexOf(wanted) >= 0) { entity = cand; break; }
      }
    }

    /* Ambiguity gate. Several senses AND no disambiguating context means the
       honest answer is a short question, not a confident guess. A dominant
       sense from context or from a qualifier in the message settles it. */
    if (g.senses && g.senses.length > 1 && !off("ambiguity")) {
      var picked = pickSense(frame, g.senses, decision);
      /* A sense that dominates usage is answered, with no question asked.
         Clarification is for names whose readings are genuinely balanced. */
      if (!picked) {
        for (var si = 0; si < g.senses.length; si++) if (g.senses[si].dominant) { picked = g.senses[si]; break; }
      }
      if (picked) entity = (KB.resolve(picked.entity, { strict: true })[0] || {}).entity || entity;
      else if (frame.queryForm === "whois" || frame.queryForm === "whatis" || frame.queryForm === "topic") {
        if (frame.wordCount <= 6) {
          return {
            text: "“" + titleOf(g.phrase) + "” could mean a few different things — " +
              RZ.joinList(g.senses.slice(0, 3).map(function (s) { return s.gloss; }), "or") +
              ". Which did you have in mind?",
            route: "clarify", clarification: true, entity: "", confidence: 0.5,
            senses: g.senses, pendingSenses: g.senses
          };
        }
      }
    }

    /* A "who" question is about a person. If one of the resolved candidates
       IS a person, that is the answer; if none is, the question is still
       answerable -- a name can belong to a place -- but a document that
       merely shares the words is not the place to look, so content retrieval
       gets first refusal. */
    if (frame.wantsPerson && entity.type !== "person" && !frame.relation) {
      var person = null;
      for (var pi = 0; pi < g.hits.length; pi++) {
        if (g.hits[pi].entity.type === "person") { person = g.hits[pi].entity; break; }
      }
      if (person) entity = person;
      else if (!(g.senses && g.senses.length > 1)) return null;
    }

    /* The entry must be about the PHRASE, not about one word inside it. A
       multi-word question whose knowledge-base match covers only the head is
       a compound the base does not hold, and reading it compositionally says
       more than defining its head would. */
    if (!frame.relation && !frame.requiresExplanation && isDefinitional(frame)) {
      var askedPhrase = C.flatten(frame.subject || frame.topic || "");
      var entName = C.flatten(displayName(entity));
      if (askedPhrase && entName && askedPhrase !== entName) {
        var askedWords = askedPhrase.split(" ").filter(function (w) { return !C.STOP[w]; });
        var entWords = entName.split(" ");
        /* If the asked phrase is itself one of the entry's names, the entry
           IS about the phrase, whatever its primary name happens to be:
           "REST API" is an alias of REST. */
        var aliasHit = KB.resolve(askedPhrase, { strict: true })[0];
        var phraseIsThisEntry = aliasHit && aliasHit.entity === entity;
        if (!phraseIsThisEntry && askedWords.length >= 2 && entWords.length < askedWords.length &&
            entWords.every(function (w) { return askedWords.indexOf(w) >= 0; })) {
          /* Step aside only if the compositional reader can actually read the
             phrase. If it cannot, defining the head is still the best answer
             available, and silence would be worse. */
          var CPm = root.C4LMCompose;
          if (CPm && CPm.read(askedPhrase)) return null;
        }
      }
    }

    /* A relation question is answered from the attribute, not from prose. */
    if (frame.relation) {
      var val = KB.attribute(entity, frame.relation);
      if (!val && frame.relation === "creator") val = KB.attribute(entity, "artist") || KB.attribute(entity, "author");
      if (!val && frame.relation === "author") val = KB.attribute(entity, "creator");
      if (!val && frame.relation === "artist") val = KB.attribute(entity, "creator");
      if (!val && frame.relation === "time") val = KB.attribute(entity, "birth");
      if (val) {
        var plan = {
          kind: "relation", subject: displayName(entity), relation: frame.relation, extras: factPool(entity, frame.relation),
          relationLabel: RELATION_LABEL[frame.relation] || frame.relation, value: val,
          elaboration: frame.requestedTone === "brief" ? "" : shortElaboration(entity, frame.relation),
          format: frame.requestedFormat, tone: frame.requestedTone,
          lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit,
          onlyValue: frame.onlyValue, value2: val
        };
        if (frame.onlyValue) { plan.format = "value"; plan.value = String(val).replace(/^the\s+/i, ""); }
        var out = RZ.realize(plan);
        return {
          text: out.text, route: "knowledge", entity: entity.name, relation: frame.relation,
          confidence: 0.9, defects: out.defects, sources: ["local knowledge base"],
          facets: Object.keys(entity.rel || {})
        };
      }
    }

    /* Multi-hop: the relation is not on this entity, but the entity points at
       one that has it. "capital of the country where the Eiffel Tower is". */
    if (frame.relation && !off("reasoning")) {
      var hop = multiHop(entity, frame.relation);
      if (hop) {
        var hopPlan = {
          kind: "relation", subject: displayName(hop.via), relation: frame.relation,
          relationLabel: RELATION_LABEL[frame.relation] || frame.relation, value: hop.value,
          format: frame.requestedFormat, onlyValue: frame.onlyValue
        };
        if (frame.onlyValue) { hopPlan.format = "value"; hopPlan.value = String(hop.value).replace(/^the\s+/i, ""); }
        var hopOut = RZ.realize(hopPlan);
        return {
          text: hopOut.text, route: "knowledge", entity: hop.via.name, relation: frame.relation,
          confidence: 0.82, defects: hopOut.defects, sources: ["local knowledge base"],
          multiHop: [entity.name, hop.via.name]
        };
      }
    }

    /* Facet lookup. A question can name an attribute that is not one of the
       parsed relations -- "his education", "its applications". Any content
       word that matches an attribute name (or a close morphological variant)
       answers from that attribute, which is how a new facet becomes
       answerable without a new branch. */
    var facet = matchFacet(frame, entity);
    if (facet) {
      var isSentence = /^[A-Z]/.test(String(facet.value)) && /[.!?]$/.test(String(facet.value).trim());
      var fPlan = {
        kind: isSentence ? "statement" : "relation",
        statement: facet.value, name: displayName(entity), definition: facet.value,
        subject: displayName(entity), relation: facet.key,
        relationLabel: RELATION_LABEL[facet.key] || facet.key, value: facet.value,
        format: frame.requestedFormat, tone: frame.requestedTone,
        lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit,
        onlyValue: frame.onlyValue
      };
      var fOut = RZ.realize(fPlan);
      if (fOut.text) {
        return { text: fOut.text, route: "knowledge", entity: entity.name, relation: facet.key,
                 confidence: 0.82, defects: fOut.defects, sources: ["local knowledge base"] };
      }
    }

    /* Explanation: a phenomenon carries its causal account. */
    if ((frame.requiresExplanation || frame.queryForm === "why") && !off("kb")) {
      var why = (entity.extra && entity.extra.why) || KB.attribute(entity, "cause");
      /* "Why?" about a thing with no causal account is a question about what
         it is FOR. Answering the purpose is the honest reading. */
      if (!why && KB.attribute(entity, "purpose")) {
        why = "It exists because " + KB.attribute(entity, "purpose") +
              " is worth doing, and " + displayName(entity) + " is how that is done.";
      }
      if (why) {
        var ePlan = {
          kind: "explanation", direct: entity.defn, mechanism: why,
          format: frame.requestedFormat, tone: frame.requestedTone,
          lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit
        };
        var eOut = RZ.realize(ePlan);
        return { text: eOut.text, route: "explanation", entity: entity.name, confidence: 0.85,
                 defects: eOut.defects, sources: ["local knowledge base"] };
      }
    }

    /* Otherwise: the definition, with one elaboration if there is room. */
    if (!entity.defn) return null;
    var defPlan = {
      kind: "definition", name: displayName(entity), extras: factPool(entity, ""),
      definition: (entity.extra && frame.requestedLength === 1 && entity.extra.oneLine) || entity.defn,
      elaboration: frame.requestedTone === "brief" ? "" : shortElaboration(entity, ""),
      format: frame.requestedFormat, tone: frame.requestedTone,
      lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit
    };
    var defOut = RZ.realize(defPlan);
    return {
      text: defOut.text, route: "knowledge", entity: entity.name, confidence: 0.85,
      defects: defOut.defects, sources: ["local knowledge base"],
      facets: Object.keys(entity.rel || {}).concat(Object.keys(entity.extra || {}))
    };
  }

  /* Attribute names are themselves vocabulary. A content word that stems to
     an attribute key -- or to one of its synonyms -- selects that attribute. */
  var FACET_SYNONYM = {
    education: "education", educated: "education", school: "education", schooling: "education",
    study: "education", studied: "education", university: "education", degree: "education",
    achievement: "achievement", award: "achievement", awards: "achievement", prize: "achievement",
    won: "achievement", win: "achievement", nobel: "achievement",
    application: "purpose", applications: "purpose", use: "purpose", uses: "purpose",
    used: "purpose", useful: "purpose", point: "purpose", good: "purpose",
    component: "part", components: "part", parts: "part", ingredient: "part",
    made: "part", contains: "part", boiling: "boiling", freezing: "freezing",
    many: "count", much: "count", number: "count", count: "count",
    born: "birth", birthday: "birth", died: "death", tall: "height", high: "height",
    fast: "speed", cost: "price", worth: "price", where: "location", size: "size"
  };
  function matchFacet(frame, entity) {
    var pools = [entity.extra || {}, entity.rel || {}];
    /* Every token, not only the content ones: "how many" carries the facet
       even though both words are function words. */
    for (var t = 0; t < frame.tokens.length; t++) {
      var word = frame.tokens[t], stemmed = frame.stems[t];
      var key = FACET_SYNONYM[word] || FACET_SYNONYM[stemmed] || "";
      var tries = [key, word, stemmed].filter(Boolean);
      for (var i = 0; i < tries.length; i++) {
        for (var p = 0; p < pools.length; p++) {
          if (pools[p][tries[i]]) return { key: tries[i], value: pools[p][tries[i]] };
        }
      }
    }
    return null;
  }

  function displayName(entity) { return String(entity.name).replace(/\s*\([^)]*\)\s*$/, ""); }
  function titleOf(s) { return RZ.capitalize(String(s)); }

  function shortElaboration(entity, usedRelation) {
    var order = ["purpose", "part", "cause", "creator", "location", "time", "count"];
    for (var i = 0; i < order.length; i++) {
      if (order[i] === usedRelation) continue;
      var v = entity.rel && entity.rel[order[i]];
      if (!v) continue;
      switch (order[i]) {
        case "purpose": return "It is used for " + v;
        case "part": return "It is made up of " + v;
        case "cause": return "It is caused by " + v;
        case "creator": return "It was created by " + v;
        case "location": return "It is in " + v;
        case "time": return "It dates to " + String(v)
          .replace(/^(?:founded|published|released|created|written|completed|first released)\s+/i, "")
          .replace(/^in\s+/i, "");
        /* A bare number with no noun ("79") says nothing on its own. */
        case "count": return /\s/.test(String(v)) ? "It has " + v : "";
      }
    }
    return "";
  }

  /* One hop through a relation the entity DOES have, to an entity that has
     the asked relation. Bounded to a single hop on purpose. */
  function multiHop(entity, relation) {
    var links = ["country", "location", "author", "creator", "person"];
    for (var i = 0; i < links.length; i++) {
      var target = entity.rel && entity.rel[links[i]];
      if (!target) continue;
      var hits = KB.resolve(String(target).split(/,|\band\b/)[0], { strict: true });
      if (!hits.length) continue;
      var val = KB.attribute(hits[0].entity, relation);
      if (val) return { via: hits[0].entity, value: val };
    }
    return null;
  }

  /* Sense selection from context: the dialogue's active domain, a qualifier
     in the message, or a domain word elsewhere in the sentence. */
  function pickSense(frame, senses, decision) {
    var text = frame.lower + " " + (frame.knownContext ? C.flatten(frame.knownContext.topic || "") : "");
    var best = null;
    for (var i = 0; i < senses.length; i++) {
      var s = senses[i], score = 0;
      var domainWords = {
        computing: ["code", "program", "language", "software", "run", "compile", "library", "api", "jvm", "script"],
        astronomy: ["planet", "sun", "orbit", "solar", "space", "star"],
        chemistry: ["element", "metal", "symbol", "atomic", "liquid", "chemical"],
        geography: ["country", "island", "river", "capital", "city", "map", "located"],
        sport: ["basketball", "nba", "player", "game", "team", "championship"],
        film: ["film", "movie", "watch", "cinema", "director", "starring"],
        mathematics: ["matrix", "vector", "linear", "algebra", "array", "determinant"],
        business: ["company", "stock", "iphone", "shares", "ceo", "retail"],
        biology: ["snake", "animal", "species", "bird", "reptile"],
        mythology: ["god", "roman", "greek", "myth"],
        everyday: ["coffee", "drink", "fruit", "eat"]
      };
      var words_ = domainWords[s.domain] || [];
      for (var j = 0; j < words_.length; j++) if (text.indexOf(words_[j]) >= 0) score += 1;
      if (!best || score > best.score) best = { sense: s, score: score };
    }
    return best && best.score > 0 ? best.sense : null;
  }

  /* ------------------------------------------------- superlatives / lists */

  var SUPERLATIVE = {
    largest: ["size", 1], biggest: ["size", 1], smallest: ["size", -1],
    tallest: ["height", 1], shortest: ["height", -1], highest: ["height", 1],
    longest: ["length", 1], fastest: ["speed", 1], slowest: ["speed", -1],
    heaviest: ["size", 1], nearest: ["distance", -1], closest: ["distance", -1],
    farthest: ["distance", 1], furthest: ["distance", 1],
    "most populous": ["population", 1]
  };

  function leadingNumber(v) {
    var m = String(v).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    if (/\bbillion\b/i.test(v)) n *= 1e9;
    else if (/\bmillion\b/i.test(v)) n *= 1e6;
    else if (/\bthousand\b/i.test(v)) n *= 1e3;
    return n;
  }

  /* "the largest planet in the solar system" is answered by comparing the
     attribute across the entities of that type, not by looking the phrase up. */
  function answerSuperlative(frame) {
    if (!KB || off("kb")) return null;
    var text = frame.lower;
    var adj = "", spec = null;
    for (var k in SUPERLATIVE) {
      if (new RegExp("\\b" + k + "\\b").test(text)) { adj = k; spec = SUPERLATIVE[k]; break; }
    }
    if (!spec) return null;
    var m = text.match(new RegExp("\\b" + adj + "\\s+([a-z][\\w-]*(?:\\s+[a-z][\\w-]*)?)"));
    if (!m) return null;
    var category = m[1].replace(/\b(?:in|of|on|the|a|an)\b.*$/, "").trim();
    /* "largest planet solar system" names the category in its first word;
       try the whole phrase, then shorter heads, before giving up. */
    var pool = KB.byType(category);
    if (pool.length < 2 && /\s/.test(category)) {
      var heads = category.split(/\s+/);
      for (var h = heads.length - 1; h >= 1 && pool.length < 2; h--) {
        var shorter = heads.slice(0, h).join(" ");
        pool = KB.byType(shorter);
        if (pool.length >= 2) category = shorter;
      }
    }
    if (pool.length < 2) return null;
    var attr = spec[0], dir = spec[1], best = null;
    for (var i = 0; i < pool.length; i++) {
      var raw = KB.attribute(pool[i], attr);
      var n = raw ? leadingNumber(raw) : null;
      if (n == null) continue;
      if (!best || (dir > 0 ? n > best.n : n < best.n)) best = { ent: pool[i], n: n, raw: raw };
    }
    if (!best) return null;
    var out = RZ.realize({
      kind: "statement",
      statement: displayName(best.ent) + " is the " + adj + " " + singularize(category) +
                 ", at " + best.raw + ".",
      lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit
    });
    return { text: out.text, route: "knowledge", entity: best.ent.name, confidence: 0.8,
             defects: out.defects, sources: ["local knowledge base"] };
  }
  function singularize(w) {
    return /ies$/.test(w) ? w.slice(0, -3) + "y" : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w;
  }

  /* An enumeration question is answered from a list attribute, as a list. */
  function answerListRequest(frame, decision) {
    if (!frame.requiresList || !KB || off("kb")) return null;
    var g = decision.grounded;
    var entity = g && g.hits.length ? g.hits[0].entity : null;
    if (!entity || !entity.extra || !entity.extra.list) return null;
    var items = entity.extra.list.slice(0, frame.requestedLength || entity.extra.list.length);
    var out = RZ.realize({ kind: "list", items: items,
                           format: frame.requestedFormat === "bullets" || items.length > 2 ? "bullets" : "prose",
                           limit: items.length });
    return { text: out.text, route: "knowledge", entity: entity.name, confidence: 0.85,
             defects: out.defects, sources: ["local knowledge base"] };
  }

  /* A comparative follow-up resolves against the pair already on the table:
     "which one is faster?" is scored from what each entry's own record says. */
  var COMPARATIVE_SYNONYM = {
    faster: ["fast", "speed", "latency", "low-latency", "quick", "nanosecond"],
    slower: ["slow", "millisecond"],
    bigger: ["large", "big", "capacity"], larger: ["large", "big", "capacity"],
    smaller: ["small", "compact", "minimal"],
    cheaper: ["cheap", "cheaper", "inexpensive", "low cost"],
    safer: ["safe", "secure", "reliable", "encrypt"],
    simpler: ["simple", "minimal", "no setup"],
    "more reliable": ["reliable", "guarantee", "retransmit", "ordered"]
  };
  function answerComparativeFollowup(frame, disc) {
    if (!disc || !disc.lastComparison || !KB) return null;
    var m = frame.lower.match(/\bwhich\s+(?:one\s+)?(?:is|has|was)\s+(?:the\s+)?([a-z]+(?:er|est)?)\b/);
    if (!m) return null;
    var adj = m[1];
    var cues = (COMPARATIVE_SYNONYM[adj] || [adj.replace(/er$/, ""), adj]).slice();
    var pair = disc.lastComparison;
    function score(name) {
      var hits = KB.resolve(name, { strict: true });
      if (!hits.length) return { n: 0, quote: "" };
      var e = hits[0].entity;
      var blob = [e.defn, JSON.stringify(e.rel || {}), JSON.stringify(e.extra || {})].join(" ").toLowerCase();
      var n = 0, quote = "";
      for (var i = 0; i < cues.length; i++) {
        var idx = blob.indexOf(cues[i]);
        if (idx >= 0) { n++; if (!quote) quote = cues[i]; }
      }
      return { n: n, quote: quote, entity: e };
    }
    var sa = score(pair.a), sb = score(pair.b);
    if (sa.n === sb.n) return null;
    var win = sa.n > sb.n ? pair.a : pair.b;
    var winEnt = sa.n > sb.n ? sa.entity : sb.entity;
    var other = sa.n > sb.n ? pair.b : pair.a;
    var reason = winEnt ? (winEnt.rel && winEnt.rel.purpose ? " — it is built for " + winEnt.rel.purpose : "") : "";
    var out = RZ.realize({ kind: "statement",
      statement: win + " is the " + adj + " of the two" + reason + "." });
    return { text: out.text, route: "comparison", entity: win, confidence: 0.7,
             defects: out.defects, sources: ["local knowledge base"] };
  }

  /* ======================================================== comparison */

  function answerComparison(frame, decision) {
    if (!frame.comparands || frame.comparands.length !== 2 || !KB) return null;
    var a = frame.comparands[0], b = frame.comparands[1];
    /* Coordinated noun phrases elide the shared head: "supervised and
       unsupervised learning" names two kinds of learning, not a thing called
       "supervised". Restore the head before resolving either operand. */
    if (!KB.resolve(a, { strict: true }).length) {
      var bWords = String(b).split(/\s+/);
      for (var t = 1; t < bWords.length && t <= 2; t++) {
        var tail = bWords.slice(bWords.length - t).join(" ");
        if (KB.resolve(a + " " + tail, { strict: true }).length) { a = a + " " + tail; break; }
      }
    }
    if (!KB.resolve(b, { strict: true }).length) {
      var aWords = String(a).split(/\s+/);
      for (var u = 1; u < aWords.length && u <= 2; u++) {
        var head = aWords.slice(aWords.length - u).join(" ");
        if (KB.resolve(b + " " + head, { strict: true }).length) { b = b + " " + head; break; }
      }
    }
    var ca = KB.contrast(a, b);
    var ra = KB.resolve(a), rb = KB.resolve(b);
    var nameA = ra.length ? displayName(ra[0].entity) : RZ.capitalize(a);
    var nameB = rb.length ? displayName(rb[0].entity) : RZ.capitalize(b);
    var dims = ca ? (ca.flipped ? ca.dims.map(function (d) { return [d[0], d[2], d[1]]; }) : ca.dims) : null;

    if (!dims && ra.length && rb.length) {
      /* Generic contrast: the attributes both entities carry, wherever they
         differ. This is what makes an unseen pair comparable at all. */
      dims = [];
      var ea = ra[0].entity, eb = rb[0].entity;
      var keys = Object.keys(ea.rel || {});
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!eb.rel || !eb.rel[k]) continue;
        if (C.flatten(ea.rel[k]) === C.flatten(eb.rel[k])) continue;
        dims.push([RELATION_LABEL[k] || k, predicateFor(k, ea.rel[k]), predicateFor(k, eb.rel[k])]);
        if (dims.length >= 4) break;
      }
      if (!dims.length) {
        dims = [["what it is", "is " + stripLead(ea.defn, ea.name), "is " + stripLead(eb.defn, eb.name)]];
      }
    }
    if (!dims || !dims.length) return null;

    var limit = frame.requestedLength || (frame.requestedFormat === "bullets" ? 3 : 4);
    var plan = {
      kind: "comparison", a: nameA, b: nameB, dims: dims, limit: limit,
      format: frame.requestedFormat === "bullets" ? "bullets" : "prose",
      tone: frame.requestedTone
    };
    /* An example was asked for, and one of the two entries carries one. */
    if (/\bexample|for instance|illustrat/i.test(frame.lower)) {
      var exa = (ra.length && ra[0].entity.extra && ra[0].entity.extra.example) ||
                (rb.length && rb[0].entity.extra && rb[0].entity.extra.example) || "";
      if (exa) plan.caveat = exa;
    }
    var out = RZ.realize(plan);
    return {
      text: out.text, route: "comparison", entity: nameA + " / " + nameB,
      confidence: ca ? 0.9 : 0.7, defects: out.defects, sources: ["local knowledge base"],
      facets: dims.map(function (d) { return d[0]; }),
      comparison: { a: nameA, b: nameB, dims: dims }
    };
  }
  /* An attribute is a value; a contrast line needs a predicate. One mapping,
     shared with the relation realiser's vocabulary. */
  function predicateFor(rel, value) {
    switch (rel) {
      case "purpose": return "is used for " + value;
      case "part": return "is made up of " + value;
      case "type": return "is " + value;
      case "speed": return "runs at " + value;
      case "cause": return "is caused by " + value;
      case "location": return "is in " + value;
      case "creator": return "was created by " + value;
      case "author": return "was written by " + value;
      case "time": return "dates to " + String(value).replace(/^in\s+/i, "");
      case "count": return "has " + value;
      case "capital": return "has the capital " + value;
      case "currency": return "uses " + value;
      case "language": return "speaks " + value;
      case "population": return "has a population of " + value;
      default: return "is " + value;
    }
  }

  function stripLead(defn, name) {
    var s = String(defn).replace(new RegExp("^(?:the\\s+)?" + String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "\\s+(?:is|are|was|were)\\s+", "i"), "");
    return s.replace(/\.$/, "");
  }

  /* Content retrieval into the knowledge base: used when the question does
     not NAME its subject. Gated on the identity tiers, so a document that
     merely shares words still cannot answer. */
  function answerKBByContent(frame, decision) {
    if (!state.index || off("retrieval") || !KB) return null;
    /* Content retrieval needs content. A message of bare digits or symbols
       names nothing, and matching it against a corpus only ever produces a
       confident answer to a question nobody asked. */
    var alpha = frame.contentTokens.filter(function (t) { return /[a-z]{3,}/i.test(t); });
    if (!alpha.length) return null;
    var ranked = state.index.rank(frame, { limit: 4, pool: 30 });
    var pick = null;
    for (var i = 0; i < ranked.length; i++) {
      var r = ranked[i];
      if (r.doc.scope !== "kb") continue;
      if (r.score < 6) continue;
      /* Identity again, for definitional questions: an entry may only define
         the thing asked about. A "who/when/which" question is different --
         there the entry that MENTIONS the asked description is exactly what
         is wanted, as with "the first president of the United States". */
      if (isDefinitional(frame) && r.tier < RT.TIER.DEFINES) continue;
      var ent = r.doc.ref.entity;
      /* An explanation question may only be answered by an entry that
         actually explains something. Otherwise a shared word ("cold") lets
         an unrelated entry answer, which is the failure mode this gate
         exists for. */
      if (frame.requiresExplanation && !(ent && ((ent.extra && ent.extra.why) || (ent.rel && ent.rel.cause)))) continue;
      /* At least two of the question's content terms must be present, so a
         single shared word cannot select an entry. */
      var covered = 0;
      for (var c = 0; c < frame.contentStems.length; c++) if (r.doc.tf[frame.contentStems[c]]) covered++;
      if (frame.contentStems.length >= 2 && covered < 2) continue;
      pick = r;
      break;
    }
    if (!pick) return null;
    var entity = pick.doc.ref.entity;
    if (!entity) return null;
    var why = entity.extra && entity.extra.why;
    if (frame.requiresExplanation && why) {
      var ePlan = { kind: "explanation", direct: entity.defn, mechanism: why,
                    format: frame.requestedFormat, tone: frame.requestedTone,
                    lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit };
      var eOut = RZ.realize(ePlan);
      return { text: eOut.text, route: "explanation", entity: entity.name,
               confidence: 0.7, defects: eOut.defects, sources: ["local knowledge base"] };
    }
    var dPlan = { kind: "definition", name: displayName(entity), definition: entity.defn,
                  elaboration: why ? "" : shortElaboration(entity, ""),
                  format: frame.requestedFormat, tone: frame.requestedTone,
                  lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit };
    var dOut = RZ.realize(dPlan);
    return { text: dOut.text, route: "knowledge", entity: entity.name, confidence: 0.65,
             defects: dOut.defects, sources: ["local knowledge base"] };
  }

  /* A type qualifier is a disambiguation instruction: "the company Meta"
     says which Meta. Resolve the NAME and keep only the sense of the right
     type, rather than treating "company meta" as a compound to be read. */
  function answerQualified(frame, decision) {
    var qual = validQualifier(frame);
    if (!qual || !KB) return null;
    var hits = KB.resolve(qual.name);
    if (!hits.length) return null;
    var wanted = qual.type.replace(/s$/, "");
    var pick = null;
    for (var i = 0; i < hits.length; i++) {
      var e = hits[i].entity;
      var blob = (e.type + " " + (e.rel && e.rel.type || "") + " " + e.defn).toLowerCase();
      if (blob.indexOf(wanted) >= 0) { pick = e; break; }
    }
    if (!pick) return null;
    if (frame.relation) {
      var val = KB.attribute(pick, frame.relation);
      if (val) {
        var rPlan = { kind: "relation", subject: displayName(pick), relation: frame.relation,
                      relationLabel: RELATION_LABEL[frame.relation] || frame.relation, value: val,
                      format: frame.requestedFormat, onlyValue: frame.onlyValue };
        var rOut = RZ.realize(rPlan);
        return { text: rOut.text, route: "knowledge", entity: pick.name, relation: frame.relation,
                 confidence: 0.9, defects: rOut.defects, sources: ["local knowledge base"] };
      }
    }
    var plan = { kind: "definition", name: displayName(pick), definition: pick.defn,
                 elaboration: frame.requestedTone === "brief" ? "" : shortElaboration(pick, ""),
                 format: frame.requestedFormat, tone: frame.requestedTone,
                 lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit };
    var out = RZ.realize(plan);
    return { text: out.text, route: "knowledge", entity: pick.name, confidence: 0.88,
             defects: out.defects, sources: ["local knowledge base"], disambiguatedBy: qual.type };
  }

  /* ------------------------------------------------- words and compounds
   * A definitional question whose subject is not a named thing is a question
   * about LANGUAGE. It is answered from word senses: one word gets its
   * senses, a compound gets read compositionally from its head and modifier.
   * This is what stops an unseen phrase being matched to the nearest article
   * with similar letters in it. */
  function answerLexical(frame, decision) {
    var CP = root.C4LMCompose;
    if (!CP || off("lexical")) return null;
    var asked = (frame.subject || frame.topic || frame.contentTokens.join(" ")).trim();
    if (!asked) return null;
    var words = C.words(asked).filter(function (w) { return !C.STOP[w]; });
    if (!words.length || words.length > 5) return null;

    /* If any span of the question names something the knowledge base holds,
       that is not a phrase to read compositionally -- it is a term with an
       entry, and the entry is the better answer. */
    if (KB) {
      for (var n = words.length; n >= 2; n--) {
        for (var i = 0; i + n <= words.length; i++) {
          var span = words.slice(i, i + n).join(" ");
          var hit = KB.resolve(span, { strict: true })[0];
          if (hit && hit.score >= 0.85) return null;
        }
      }
    }

    if (words.length >= 2) {
      var reading = CP.read(asked);
      if (reading) {
        var text = CP.explain(reading, frame.requestedTone === "brief" ? "brief" : "");
        var out = RZ.realize({ kind: "statement", statement: text,
                               lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit });
        return {
          text: out.text || text, route: "compose", entity: reading.phrase,
          confidence: reading.confidence, defects: [], sources: reading.sources,
          composed: true, reading: {
            head: reading.headWord, modifier: reading.modifierWord,
            relation: reading.relation.rel
          }
        };
      }
    }
    var single = CP.defineWord(words[words.length - 1], { limit: frame.requestedLength === 1 ? 1 : 3 });
    if (single) {
      var sOut = RZ.realize({ kind: "statement", statement: single.text,
                              lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit });
      return { text: sOut.text || single.text, route: "lexicon", entity: single.word,
               confidence: single.confidence, defects: [], sources: single.sources, defined: true };
    }
    return null;
  }

  /* When a word is not held locally, the dictionaries are asked for it and
     the answer is learned, so the same phrase is read locally next time. */
  function learnWords(frame) {
    var CP = root.C4LMCompose, LX = root.C4LMLexicon;
    if (!CP || !LX || !state.federation || off("web")) return Promise.resolve(false);
    var words = C.words(frame.subject || frame.topic || "")
      .filter(function (w) { return w.length > 2 && !C.STOP[w] && !LX.has(w); });
    return learnWordList(words);
  }
  function learnWordList(words) {
    var CP = root.C4LMCompose, LX = root.C4LMLexicon;
    if (!CP || !LX || !state.federation || off("web") || !words || !words.length) return Promise.resolve(false);
    var jobs = words.slice(0, 3).map(function (w) {
      var sub = C.parse("define " + w);
      sub.lexicalQuestion = true;
      sub.subject = w;
      return state.federation.gather(sub, { domain: "lexical" }).then(function (graph) {
        if (!graph || !graph.size()) return false;
        var senses = graph.props
          .filter(function (pr) { return pr.predicate === "wordSense" && pr.object; })
          .slice(0, 4)
          .map(function (pr) {
            var pos = (pr.qualifiers && pr.qualifiers.pos) || "n";
            return { pos: pos, gloss: String(pr.object).replace(/\s+/g, " ").trim(), cls: CP.classify(pr.object, pos) };
          });
        if (!senses.length) return false;
        LX.learn(w, senses);
        return true;
      }, function () { return false; });
    });
    return Promise.all(jobs).then(function (r) { return r.some(Boolean); });
  }

  /* ========================================================= local site */

  function answerLocal(frame, decision, opts) {
    if (!state.index || off("retrieval")) return null;
    opts = opts || {};
    var definitional = !opts.relaxed && (frame.queryForm === "whatis" || frame.queryForm === "topic");
    var ranked = state.index.rank(frame, { definitional: definitional, limit: 4 });
    ranked = ranked.filter(function (r) { return r.doc.scope !== "kb"; });
    if (!ranked.length) return null;
    var top = ranked[0];
    /* Identity is not overlap. A document may only answer for a concept it
       actually names -- whatever grammatical form the question took. */
    if (top.tier < RT.TIER.DEFINES && !opts.relaxed) return null;
    /* Relaxed still means the document must contain the phrase, not merely
       share words with it. */
    if (opts.relaxed && top.tier < RT.TIER.PHRASE) return null;
    if (top.score < (opts.relaxed ? 3 : 4)) return null;
    var sents = EV.sentences(demarkdown(top.doc.text));
    /* The answering sentence is the one that talks about the asked concept,
       not whichever sentence happens to come first in the document. */
    var askedTokens = frame.contentStems;
    sents = sents.filter(readableSentence);
    if (!sents.length) return null;
    var scored = sents.map(function (sn, i) {
      var flat = C.words(sn).map(C.stem);
      var cover = 0;
      for (var a = 0; a < askedTokens.length; a++) if (flat.indexOf(askedTokens[a]) >= 0) cover++;
      var defines = /\b(?:is|are|means|refers to|provides|does|runs|answers)\b/.test(sn) ? 1 : 0;
      return { text: sn, score: cover * 2 + defines - i * 0.05, cover: cover };
    }).sort(function (x, y) { return y.score - x.score; });
    if (!scored.length || scored[0].cover === 0) return null;
    var lead = scored[0].text;
    var second = scored.length > 1 && scored[1].cover > 0 ? scored[1].text : "";
    var plan = {
      kind: "statement", statement: lead, elaboration: second,
      format: frame.requestedFormat, tone: frame.requestedTone,
      lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit
    };
    var out = RZ.realize(plan);
    return {
      text: out.text, route: "local", entity: top.doc.title, confidence: 0.6 + 0.06 * top.tier,
      defects: out.defects, sources: [top.doc.url || top.doc.source].filter(Boolean),
      used: ["this site"], tier: top.tier
    };
  }

  /* "What does CELL4 do?" names the site and nothing else, so there is no
     content term to retrieve on. The answer is what the site is about: its
     overview document's opening claim. General to any corpus -- no page or
     brand name is written into this function. */
  var BRAND = /^(?:cell4|robots|js|site|page|you|your|this|do|does|it)$/i;
  function answerSiteOverview(frame) {
    if (!state.index) return null;
    var specific = frame.contentTokens.filter(function (t) { return !BRAND.test(t); });
    if (specific.length) return null;
    var docs = state.index.docs.filter(function (d) { return d.scope === "site"; });
    if (!docs.length) return null;
    docs.sort(function (a, b) {
      var ar = /readme/i.test(a.title) ? 1 : 0, br = /readme/i.test(b.title) ? 1 : 0;
      return (br - ar) || (b.text.length - a.text.length);
    });
    /* What is this corpus ABOUT? The most frequent proper noun across it is
       its subject; the answer is the best definitional sentence about that
       subject. No page title, product name or path is written into this
       function -- it reads whatever corpus it is given. */
    var freq = Object.create(null);
    for (var d0 = 0; d0 < docs.length; d0++) {
      var caps = String(docs[d0].text).match(/\b[A-Z][A-Za-z0-9]{2,}\b/g) || [];
      for (var c0 = 0; c0 < caps.length; c0++) {
        var w0 = caps[c0];
        if (C.STOP[w0.toLowerCase()]) continue;
        freq[w0] = (freq[w0] || 0) + 1;
      }
    }
    var subjectName = "", topFreq = 0;
    for (var fk in freq) if (freq[fk] > topFreq) { topFreq = freq[fk]; subjectName = fk; }

    var best = null;
    for (var d = 0; d < docs.length && d < 40; d++) {
      var ss = EV.sentences(demarkdown(docs[d].text)).slice(0, 8);
      for (var i = 0; i < ss.length; i++) {
        if (!readableSentence(ss[i])) continue;
        var sc = 1 - i * 0.2 + (/readme/i.test(docs[d].title) ? 0.6 : 0);
        /* A sentence that names the corpus subject and then says what it is. */
        if (subjectName && new RegExp("^(?:the\\s+)?" + subjectName + "\\b[^.]{0,40}\\b(?:is|are)\\b", "i").test(ss[i])) sc += 4;
        else if (subjectName && ss[i].indexOf(subjectName) >= 0) sc += 1.2;
        if (/\b(?:engine|system|solver|browser|runs|answers|project)\b/i.test(ss[i])) sc += 0.8;
        if (!best || sc > best.sc) best = { sc: sc, text: ss[i], doc: docs[d], next: ss[i + 1] || "" };
      }
    }
    if (!best) return null;
    var out = RZ.realize({ kind: "statement", statement: best.text,
                           elaboration: readableSentence(best.next) ? best.next : "",
                           lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit });
    return { text: out.text, route: "local", entity: best.doc.title, confidence: 0.6,
             defects: out.defects, sources: [best.doc.url || best.doc.source].filter(Boolean),
             used: ["this site"] };
  }

  /* Documents are written in Markdown; the answer is prose. */
  function demarkdown(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " ")
      /* Tables survive line-collapsing as pipe runs, so they are removed by
         shape rather than by line position. */
      .replace(/\|[^|\n]{0,80}\|(?:[^|\n]{0,80}\|)*/g, " ")
      .replace(/-{3,}:?|:-{3,}/g, " ")
      .replace(/#{1,6}\s*/g, "")
      .replace(/(^|\s)>\s*/g, "$1")
      .replace(/(^|\s)[-*+]\s+/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ");
  }

  /* Prose, not layout residue. A "sentence" that is mostly punctuation or
     digits came out of a table or a command line, not out of an explanation. */
  function readableSentence(sn) {
    var t = String(sn || "").trim();
    if (t.length < 30 || t.length > 400) return false;
    var letters = (t.match(/[A-Za-z]/g) || []).length;
    if (letters / t.length < 0.72) return false;
    if (/[|`{}<>]/.test(t)) return false;
    if (!/\b(?:is|are|was|were|does|do|has|have|can|will|means|runs|solves|provides|uses|answers)\b/.test(t)) return false;
    return true;
  }

  /* ============================================================== web */

  function answerWeb(frame, decision) {
    if (off("web") || !state.federation) return Promise.resolve(null);
    state.stats.web++;
    return state.federation.gather(frame).then(function (graph) {
      if (!graph || !graph.size()) return null;
      var subject = frame.subject || frame.topic || "";
      var claim = frame.relation ? graph.best(subject, frame.relation) : null;
      if (!claim) {
        claim = graph.props.slice().sort(function (x, y) {
          return ((y.support || 1) * y.confidence) - ((x.support || 1) * x.confidence);
        })[0];
      }
      if (!claim) return null;
      /* Identity gate on retrieved evidence. An article may only answer for
         the thing that was asked about; sharing letters with the question is
         not the same as being about it. Without this, an unseen phrase picks
         up whatever article the search engine liked best. */
      if (!frame.relation && subject && !identityMatches(subject, claim)) return null;
      var conflicts = graph.conflicts(claim.subject, claim.predicate);
      var plan;
      if (claim.predicate === "version" || claim.predicate === "price" || claim.predicate === "rate") {
        plan = { kind: "relation", subject: claim.subject, relation: claim.predicate,
                 relationLabel: RELATION_LABEL[claim.predicate] || claim.predicate, value: claim.object,
                 format: frame.requestedFormat, onlyValue: frame.onlyValue,
                 caveat: claim.time ? "" : "" };
      } else {
        plan = { kind: "definition", name: claim.exactTitle || claim.subject,
                 definition: claim.object || claim.text,
                 copula: claim.qualifiers && claim.qualifiers.copula, extras: webExtras(graph, claim),
                 elaboration: "", format: frame.requestedFormat,
                 lengthLimit: frame.requestedLength, lengthUnit: frame.requestedUnit };
      }
      if (conflicts && conflicts.length > 1) {
        plan.caveat = "Sources disagree on this, so treat it as provisional";
      }
      var out = RZ.realize(plan);
      return {
        text: out.text, route: "web", entity: claim.subject, relation: claim.predicate,
        confidence: Math.min(0.9, claim.confidence + ((claim.support || 1) - 1) * 0.1),
        defects: out.defects, sources: graph.sources.slice(),
        used: graph.sources.slice(), evidence: graph.size(),
        elapsed: graph.elapsed, reason: graph.reason
      };
    }, function () { return null; });
  }

  /* Does this evidence identify the thing that was asked about? The test is
     over the claim's own subject/title, not over the body text. */
  function identityMatches(asked, claim) {
    var a = C.flatten(asked).replace(/^(?:the|a|an) /, "");
    var titles = [claim.exactTitle, claim.subject].filter(Boolean)
      .map(function (t) { return C.flatten(t).replace(/\s*\([^)]*\)\s*$/, "").trim(); });
    if (!a) return true;
    for (var i = 0; i < titles.length; i++) {
      var t = titles[i];
      if (!t) continue;
      if (t === a) return true;
      /* A qualified title is the same concept: "Mercury (planet)" answers
         "Mercury". A title that merely contains the words is not. */
      var at = a.split(" "), tt = t.split(" ");
      if (tt.length >= at.length) {
        var head = true;
        for (var k = 0; k < at.length; k++) if (tt[k] !== at[k]) { head = false; break; }
        var repeats = false;
        for (var r = at.length; r < tt.length; r++) if (at.indexOf(tt[r]) >= 0) repeats = true;
        if (head && !repeats && tt.length - at.length <= 2) return true;
      }
      if (at.length >= tt.length && at.join(" ").indexOf(tt.join(" ")) === 0 && at.length - tt.length <= 1) return true;
    }
    return false;
  }

  /* ==================================================== conversation */

  var SOCIAL = {
    greeting: ["Hi — what would you like to know?", "Hello. What can I look into for you?",
               "Hey. Ask me something.", "Hi there — what are we looking into?"],
    thanks: ["Any time.", "Glad it helped.", "You're welcome.", "Happy to help."],
    acknowledgement: ["Noted.", "Understood.", "Right.", "Makes sense."],
    meta: ["I'm CELL4's local language system. I run in your browser: I answer from a local knowledge base and reasoning engine, and I only go to public data sources when a question needs current information."],
    statement: ["Understood — say more and I'll dig in.", "Got it. What would you like me to work out?"]
  };

  function answerConversation(frame, disc) {
    var bucket = SOCIAL[frame.speechAct] || (frame.metaSelf ? SOCIAL.meta : SOCIAL.statement);
    if (frame.metaSelf) bucket = SOCIAL.meta;
    var pick = RZ.variation ? RZ.variation.choose(bucket, "social:" + (frame.metaSelf ? "meta" : frame.speechAct || "statement"))
                            : bucket[(disc ? disc.turns : 0) % bucket.length];
    var who = "";
    try { who = state.memory ? state.memory.nameForAddress() : ""; } catch (e) { who = ""; }
    if (who && frame.speechAct === "greeting") pick = pick.replace(/^(Hi|Hello|Hey)(?: there)?\b/, "$1 " + who);
    return { text: pick, route: "conversation", confidence: 0.75, conversational: true, sources: [] };
  }

  /* ========================================================== reasoning */

  /* Confidence for an operator-library result, from an independent
     re-derivation of its own trace (c4-lm-problem.js) through the kernel's
     calibration -- not a constant. A disagreement lowers it below the
     hallucination brake, which then softens the answer. */
  function calibrateReason(r, frame) {
    if (!PRB || !KER || off("calibration")) return null;
    var derivations = 1, disagree = 0, pass = 0, total = 0;
    if (r.expression !== undefined && r.value !== undefined) {
      var vv = PRB.verifyValue(r.expression, r.value);
      if (vv) { total++; if (vv.agree) { pass++; derivations++; } else disagree++; }
    }
    if (r.steps && r.steps.length) {
      var st = PRB.verifySteps(r.steps);
      total += st.checked; pass += st.passed;
      if (st.failed.length) disagree++;
    }
    if (r.nodes && r.nodes.length && r.nodes[0].op === "extrapolate" && r.nodes[0].args) {
      PRB.extrapolate(r.nodes[0].args).forEach(function (alt) {
        if (Math.abs(alt.value - r.value) < 1e-9) derivations++; else disagree++;
      });
    }
    /* a deduction by a sound rule (closure, ordering) is one derivation that
       passed its own consistency check */
    if (!total && r.route === "reason" && r.ok !== false) { pass = 1; total = 1; }
    /* verifying the arithmetic says nothing about whether the arithmetic
       was the question: algebra in the text that the reading ignored is a
       contradiction of the interpretation, not of the calculation */
    var misread = r.route === "compute" && PRB.hasAlgebra(frame.rawText || frame.body || "") ? 1 : 0;
    return KER.calibrate({ derivations: misread ? 1 : derivations, disagreements: disagree, verifierPass: misread ? 0 : pass,
                           verifierTotal: misread ? 0 : total, contradictions: (disagree ? 1 : 0) + misread });
  }

  /* Problems the operator library does not cover but that can be DERIVED:
     equations, systems, calculus, combinatorics, number theory, probability,
     shortest paths, multiple choice -- solved by independent derivations
     that must survive falsification (c4-lm-problem.js). */
  function answerProblem(frame, allowProseArithmetic) {
    if (!PRB || off("problem")) return null;
    var p = null;
    try { p = PRB.answer(frame.rawText || frame.body || ""); } catch (e) { p = null; }
    /* Arithmetic over the digits is the operator library's job; arithmetic
       READ from English ("three quarters of 200", "multiply 12 by itself")
       is accepted only once the operator library has declined. */
    if (!p || (p.kind === "arithmetic" && !(allowProseArithmetic && p.problem && p.problem.fromProse))) return null;
    return { text: RZ.polish(p.text), route: "reason", confidence: p.confidence, sources: [], defects: [],
             derivations: p.derivations.length, verification: { agreeing: p.agreeing, eliminated: p.eliminated,
             diagnoses: p.diagnoses, calibration: p.calibration } };
  }

  /* Hard reasoning (c4-lm-deliberate.js). When an exact tool can read the
     question -- a matrix, a list of data, a sum over a range, an
     optimisation, a conditional probability, a counting condition -- the
     deliberation controller runs EVERY reader (tools, the problem reasoner,
     the operator library, dimensional analysis); its critic, verifier and
     selector keep the answer with independent verified support. It takes
     over only when a tool reading with an independent verifier wins; a
     question the other readers answer the same way keeps their answer. */
  function answerDeliberate(frame) {
    var DL = root.C4LMDeliberate;
    if (!DL || off("deliberate-tools")) return null;
    var text = frame.rawText || frame.body || "";
    var tools = [];
    try { tools = DL.applicable(text); } catch (e) { tools = []; }
    if (!tools.length) return null;
    var d = null;
    try { d = DL.solve(text, { mode: state.mode }); } catch (e) { d = null; }
    if (!d || !d.verified || d.abstained || !d.winner || !d.winner.tool) return null;
    return { text: RZ.polish ? RZ.polish(d.sentence) : d.sentence, route: "reason", confidence: d.confidence, sources: [], defects: [],
             interpretation: "exact tool", derivations: d.winner.verified,
             verification: { deliberation: { ranked: d.ranked, candidates: d.candidates.length, difficulty: d.difficulty.level, mode: d.mode },
                             calibration: d.calibration } };
  }

  /* Everyday reasoning (c4-lm-everyday.js): rules and fallacies, categories
     with all / some / no, relations between quantities, possessions that
     change, clock and weekday arithmetic, equal stated amounts. The answer
     carries its reasoning. */
  function answerEveryday(frame) {
    var EVD = root.C4LMEveryday;
    if (!EVD || off("everyday")) return null;
    var r = null;
    try { r = EVD.solve(frame.rawText || frame.body || ""); } catch (e) { r = null; }
    if (!r || !r.text) return null;
    return { text: r.text, route: "reason", confidence: r.certain ? 0.93 : 0.6, sources: [], defects: [],
             interpretation: "everyday " + r.kind, derivations: 1, verification: { steps: r.steps, reader: r.reader } };
  }

  function answerConverse(frame) {
    var CV = root.C4LMConverse;
    if (!CV || off("converse")) return null;
    var r = null;
    /* the user's own words: a carried or rebuilt frame is for lookup, not
       for reading what the message calls for */
    try { r = CV.respond(state.userText || frame.rawText || frame.body || "", { turn: discourse.turns, federated: !!state.federation && !off("web"),
                                                                            lastTopic: discourse.activeEntity || "" }); }
    catch (e) { r = null; }
    return r;
  }

  function answerReason(frame, decision) {
    if (off("reasoning") || !RS) return null;
    var hard = answerDeliberate(frame);
    if (hard) return hard;
    var everyday = answerEveryday(frame);
    if (everyday) return everyday;
    /* Interpretation check. When the text parses as a structured problem
       (an equation, a system, calculus, combinatorics ...), reading it as
       bare arithmetic over its digits is a MISINTERPRETATION -- "solve
       x^2 - 5x + 6 = 0" is not "2 - 5". The structured reading wins. */
    var structured = answerProblem(frame);
    if (structured) { structured.interpretation = "structured"; return structured; }
    var r = RS.solve(frame);
    /* Arithmetic read compositionally from the English comes before the
       numeral re-read below: "three quarters of 200" re-read as "3/4 of 200"
       would hand the operator library a fragment ("3/4") of the question. */
    if (!r && !off("prose")) {
      var proseArith = answerProblem(frame, true);
      if (proseArith) { proseArith.interpretation = "prose-arithmetic"; return proseArith; }
    }
    /* Second reading: numbers written as words ("two hours", "a dozen")
       re-read as numerals, so the operator library sees the quantities the
       sentence states. Only a changed text is re-parsed. */
    if (!r && PRB && PRB.wordsToNumbers && !off("prose")) {
      var rawT = frame.rawText || frame.body || "", alt = PRB.wordsToNumbers(rawT);
      if (alt !== rawT) {
        var altFrame = C.parse(alt, discourse.snapshot());
        if (altFrame && !altFrame.empty && !r) {
          r = RS.solve(altFrame);
          /* a bare evaluation that leaves a stated number unused read a
             fragment of the sentence, not the sentence */
          var stated = alt.match(/\d+(?:\.\d+)?/g) || [];
          if (r && r.kind === "arithmetic" && stated.some(function (n) { return String(r.expression || "").indexOf(n) < 0; })) r = null;
          if (r) frame = altFrame;
        }
      }
    }
    if (!r) return answerQuantity(frame);
    var cal = calibrateReason(r, frame);
    var out = answerReasonText(frame, r);
    if (out && cal) { out.confidence = cal.confidence; out.calibration = cal; }
    return out;
  }

  /* Quantitative questions the operator library does not recognise are
     read by the comprehension stage: every word defined, what is asked and
     what is given identified, then a derivation by dimensional analysis --
     or, when the question does not fix its answer, a statement of what is
     missing with the answer per unit of it. */
  function answerQuantity(frame) {
    if (!CMP || off("comprehension")) return null;
    var q = null;
    try { q = CMP.solveQuantity(frame.rawText || frame.body || ""); } catch (e) { q = null; }
    if (!q || !q.text) return null;
    return { text: q.text, route: "reason", sources: q.assumption ? ["local knowledge base"] : [], defects: [],
             confidence: q.status === "solved" ? (q.assumption ? 0.78 : 0.9) : 0.7,
             interpretation: q.summary, quantity: { status: q.status, value: q.value, unit: q.unit, rate: q.rate, missing: q.missing } };
  }

  function answerReasonText(frame, r) {
    if (r.route === "compute") {
      var lead = "";
      if (r.kind === "arithmetic" && r.expression) lead = r.expression + " = ";
      var plan = {
        kind: "calculation", value: r.text, unit: r.unit || "",
        lead: r.kind === "arithmetic" ? lead : leadFor(r.kind, frame),
        onlyValue: frame.onlyValue, steps: r.steps,
        showWorking: !frame.onlyValue && (frame.requiresExplanation || frame.requestedTone === "steps"),
        format: frame.onlyValue ? "value" : "prose"
      };
      if (frame.onlyValue) return { text: String(r.text), route: "compute", confidence: 0.99, sources: [], defects: [] };
      var out = RZ.realize(plan);
      return { text: out.text, route: "compute", confidence: 0.99, defects: out.defects,
               sources: [], computed: r.value };
    }
    if (r.kind === "clock") {
      return { text: r.text, route: "compute", confidence: 0.95, sources: [], defects: [] };
    }
    var body = r.text;
    if (r.why && !frame.onlyValue && r.text.length < 80) body = RZ.terminate(r.text) + " " + RZ.terminate(RZ.capitalize(r.why));
    var pol = RZ.polish(body);
    return { text: pol, route: "reason", confidence: 0.92, defects: RZ.inspect(pol),
             sources: [], derivation: (r.nodes || []).length };
  }
  function leadFor(kind, frame) {
    switch (kind) {
      case "discount": return "The new price is ";
      case "rate": return "It travels ";
      case "convert": return "That is ";
      case "average": return "The average is ";
      case "probability": return "The probability is ";
      case "percent": return "That is ";
      default: return "";
    }
  }

  /* ============================================================== code */

  function answerCode(frame) {
    if (off("code") || !CD || !CD.isRequest(frame)) return null;
    var built = CD.build(frame);
    if (!built || !built.ok) return null;
    var lang = built.language === "sql" ? "SQL" : RZ.capitalize(built.language);
    var text = "```" + built.language + "\n" + built.code + "\n```\n" +
      (built.explain ? built.explain : "");
    return {
      text: text, route: "code", confidence: 0.9, sources: [],
      code: built.code, language: built.language, verified: built.verified,
      defects: [], entity: built.spec.op
    };
  }

  /* Everything that can answer without the network, in the order that keeps
     each kind of question with the resolver that understands it. One chain,
     used both as the fast path and as the fallback after a web attempt, so
     the two can never drift apart. */
  function localResolvers(frame, decision) {
    return answerQualified(frame, decision) ||
           answerListRequest(frame, decision) ||
           answerSuperlative(frame) ||
           answerFromKB(frame, decision) ||
           /* A definitional question about ordinary language is answered from
              word senses before any document is consulted: "what is learning"
              is about the word, and "machine learning" is a different term
              that merely contains it. */
           (isDefinitional(frame) ? answerLexical(frame, decision) : null) ||
           answerKBByContent(frame, decision) ||
           (isDefinitional(frame) ? null : answerLexical(frame, decision)) ||
           answerLocal(frame, decision);
  }

  /* Does any word in the message name something the system knows? */
  function namesAnything(frame) {
    var LX = root.C4LMLexicon;
    for (var i = 0; i < frame.contentTokens.length; i++) {
      var t = frame.contentTokens[i];
      if (LX && LX.has(t)) return true;
      if (KB && KB.resolve(t, { strict: true }).length) return true;
    }
    return false;
  }

  function hasUnknownWord(frame) {
    var LX = root.C4LMLexicon;
    if (!LX || !KB) return false;
    var words = frame.contentTokens.filter(function (w) { return w.length > 2; });
    /* A compound is short. A long question is not a phrase to be read from
       its parts, so an unfamiliar word in it is not a reason to stop and
       look the word up. */
    if (!words.length || words.length > 3) return false;
    for (var i = 0; i < words.length; i++) {
      if (LX.has(words[i])) continue;
      if (KB.resolve(words[i], { strict: true }).length) continue;
      return true;
    }
    return false;
  }

  function isDefinitional(frame) {
    if (frame.queryForm === "whatis" || frame.queryForm === "topic") return true;
    /* A polite wrapper moves the interrogative off the front of the string
       without changing what is being asked: "tell me what is X" is still a
       definitional question. */
    if (/\b(?:what(?:'s| is| are)|which is)\s+(?:a |an |the )?[\w-]/i.test(frame.body)) return true;
    if (/\b(?:mean|means|meaning|define|definition)\b/i.test(frame.lower)) return true;
    if (frame.queryForm === "whois" && !frame.wantsPerson) return true;
    /* A bare noun phrase typed into a box is a request for what it is.
       "learning", "growth engine" -- no verb, no question mark, nothing else
       to read it as. */
    if (frame.queryForm === "statement" && !frame.hasQuestionMark &&
        frame.contentTokens.length >= 1 && frame.contentTokens.length <= 3 &&
        !frame.requiresComputation && !frame.requiresCode && !frame.requiresComparison) {
      return true;
    }
    return false;
  }

  /* ========================================================== fallback */

  function fallback(frame, decision) {
    if (decision && decision.features && decision.features.remark) {
      return answerConversation(frame, discourse);
    }
    var subject = frame.subject || frame.entities[0] || frame.topic || "";
    /* Echoing a long question back is not informative; name the thing. */
    if (subject.split(/\s+/).length > 6) {
      subject = frame.entities[0] || frame.contentTokens.slice(0, 3).join(" ");
    }
    if (subject) {
      return {
        text: "I don't have anything reliable on " + subject + ". " +
          (state.federation && !off("web") ?
            "I couldn't confirm it from the public sources I can reach either." :
            "That one is outside what I hold locally.") +
          " If you can point me at a more specific term or a source, I'll work from that.",
        route: "insufficient", confidence: 0.2, insufficient: true, sources: []
      };
    }
    return {
      text: "I'm not sure what to look into there. Give me a topic, a question, or a calculation and I'll take it from the top.",
      route: "insufficient", confidence: 0.2, insufficient: true, sources: []
    };
  }

  /* ======================================================== deliberation */

  /* System 2 for questions the first pass answered weakly. The router picks
     ONE reading of the words, and that is where an idiom ("the pen behind
     Hamlet"), a metaphor ("the tongue of Brazil"), a keyword fragment or an
     answer of the wrong type goes wrong. Deliberation generates other
     readings from general knowledge -- entities the knowledge base can spot
     in the words, relations named directly or through another dictionary
     sense of a word (chosen by gloss overlap with the rest of the sentence),
     words a dictionary gloss paraphrases -- answers each one through the
     ordinary resolvers, and scores every candidate on one scale: did a
     resolver actually answer, how much of the question does the answer
     account for, is it the type of thing asked for, and how far is the
     reading from the words as written. The first answer is replaced only by
     a clear margin, and the reading used is recorded on the result. Nothing
     here names a question, an idiom or an entity. */

  /* English closed-class words (prepositions, particles, speaker pronouns):
     grammar, not content, so they never count for or against coverage. */
  var CLOSED_CLASS = /^(?:about|above|across|after|against|along|among|around|at|before|behind|below|beneath|beside|between|beyond|by|down|during|except|for|from|in|inside|into|near|of|off|on|onto|out|outside|over|past|since|through|throughout|to|toward|towards|under|underneath|until|up|upon|with|within|without|away|back|me|us|you|your|my|our|we|they|them|just|really|exactly|actually|need|needs|get|gets|got)$/;
  /* A word whose sense is "information about something" (a summary, the
     facts, an account) frames a request for the thing; it is not content. */
  var ABOUT_GLOSS = /\b(?:information|facts?|summary|account|news|overview|main point|general meaning)\b/;
  var DELIB_MARGIN = 0.75, DELIB_BUDGET_MS = 300, DELIB_MAX_READINGS = 10;

  function lexSenses(w) {
    var LX = root.C4LMLexicon, h = LX && LX.lookup(w);
    return h ? h.senses : [];
  }
  function aboutWord(t) {
    return lexSenses(t).some(function (s) {
      return (s.cls === "COMMUNICATION" || s.cls === "ABSTRACT") && ABOUT_GLOSS.test(s.gloss);
    });
  }
  /* Light (support) verbs carry tense and aspect, not content: "keep its
     government", "put pen to paper", "gave us the theory". */
  var LIGHT_VERB = /^(?:keep|keeps|kept|keeping|have|has|had|having|make|makes|made|making|take|takes|took|taken|taking|give|gives|gave|given|giving|put|puts|putting|go|goes|went|gone|going|come|comes|came|coming|bring|brings|brought|let|lets)$/;
  function grammarToken(t) { return !t || t.length <= 2 || !!C.STOP[t] || CLOSED_CLASS.test(t); }
  function neutralToken(t) { return grammarToken(t) || LIGHT_VERB.test(t); }
  /* The head region of a gloss: up to the first relative clause or
     purpose phrase, where the defining nouns sit. */
  function glossHead(gloss) {
    var out = [], ws = C.words(gloss);
    for (var i = 0; i < ws.length && i < 12; i++) {
      if (/^(?:who|whom|which|that|where|when|whose|used|because|by|as)$/.test(ws[i]) && out.length) break;
      if (!C.STOP[ws[i]]) out.push(ws[i]);
    }
    return out;
  }
  function stemIn(hay, t) {
    if (!t) return false;
    if (hay.indexOf(t) >= 0) return true;
    var st = C.stem(t);
    if (st.length >= 3 && hay.indexOf(st) >= 0) return true;
    return t.length >= 6 && hay.indexOf(t.slice(0, 5)) >= 0;
  }
  function relationEntry(id) {
    for (var i = 0; i < C.relations.length; i++) if (C.relations[i].id === id) return C.relations[i];
    return null;
  }

  /* A speaker-directed imperative ("break down X for me", "walk me through
     X") is a request: its verb and particles are the act of asking. */
  function speakerRequest(frame) {
    var t = frame.tokens;
    if (!t.length || /^(?:what|which|who|whom|whose|when|where|why|how|is|are|was|were|do|does|did|can|could|would|should|will)$/.test(t[0])) return false;
    return /\b(?:me|us)\b/.test(frame.lower);
  }
  /* In a speaker-directed request the leading verb is the act of asking
     ("break down X for me", "walk me through X"); only that verb and its
     particle are set aside, never the words that say what is asked. */
  function requestVerbs(frame) {
    if (!speakerRequest(frame)) return [];
    var t = frame.tokens, out = [t[0]];
    if (t[1] && CLOSED_CLASS.test(t[1])) out.push(t[1]);
    return out;
  }
  function isRequest(frame) {
    return frame.speechAct === "question" || frame.speechAct === "command" || frame.hasQuestionMark ||
           speakerRequest(frame) || (frame.speechAct === "statement" && frame.contentTokens.length <= 5);
  }

  /* Entities the knowledge base holds, spotted anywhere in the words:
     longest spans first, never starting or ending on a function word. */
  function spotEntities(frame) {
    if (!KB || off("kb")) return [];
    var surf = String(frame.semanticText || frame.body || "").match(/[A-Za-z0-9][A-Za-z0-9'’.+#-]*[A-Za-z0-9+#]|[A-Za-z0-9]/g) || [];
    var toks = surf.map(function (w) { return w.replace(/['’]s$/i, ""); });
    var used = [], out = [];
    for (var pass = 0; pass < 2 && !(pass && out.length); pass++)
    for (var n = Math.min(5, toks.length); n >= 1; n--) {
      for (var i = 0; i + n <= toks.length; i++) {
        var span = toks.slice(i, i + n), lo = span.map(function (s) { return s.toLowerCase(); });
        if (used.slice(i, i + n).some(Boolean)) continue;
        if (neutralToken(lo[0]) || neutralToken(lo[n - 1]) || /^(?:what|which|who|how|why|when|where)$/.test(lo[0])) continue;
        var phrase = span.join(" ");
        var hit = KB.resolve(phrase, { strict: true }).filter(genuineMatch)[0];
        /* a plural names the kind ("volcanoes" is about the volcano) -- a
           second pass, so a plural never splits a phrase that names a thing */
        if (pass && (!hit || hit.score < 0.85) && /s$/i.test(phrase)) {
          var one = span.slice(0, -1).concat([singularize(span[n - 1].toLowerCase()).replace(/oe$/, "o")]).join(" ");
          hit = KB.resolve(one, { strict: true }).filter(genuineMatch)[0] || KB.resolve(one.replace(/e$/, ""), { strict: true }).filter(genuineMatch)[0];
        }
        if (!hit || hit.score < 0.85) continue;
        out.push({ phrase: displayName(hit.entity), entity: hit.entity, start: i, len: n,
                   tokens: lo.map(function (x) { return C.flatten(x); }) });
        for (var k = i; k < i + n; k++) used[k] = true;
      }
    }
    out.sort(function (a, b) { return b.len - a.len || a.start - b.start; });
    return out;
  }

  /* Relations the question names: a relation noun or verb as written, or a
     relation noun in the head of one of a word's dictionary senses. A
     sense is preferred when its gloss shares words with the rest of the
     sentence (gloss overlap -- the Lesk criterion); the words it shares are
     accounted for by that reading. */
  function relationCues(frame, entTok) {
    var cues = [], ctx = frame.contentTokens;
    function push(c) {
      for (var i = 0; i < cues.length; i++) {
        if (cues[i].rel === c.rel && cues[i].from === c.from) { if (c.cost < cues[i].cost) cues[i] = c; return; }
      }
      cues.push(c);
    }
    ctx.forEach(function (t) {
      if (entTok[t] || grammarToken(t)) return;
      var direct = C.relationForHead(t);
      if (direct && relationEntry(direct) && relationEntry(direct).heads.length) push({ rel: direct, head: t, from: t, cost: 0, accounts: [t] });
      var verb = C.relationForVerb(t);
      if (verb && !direct) push({ rel: verb, head: (relationEntry(verb) || { heads: [t] }).heads[0] || t, from: t, cost: 0.05, accounts: [t] });
      lexSenses(t).forEach(function (s, si) {
        var head = glossHead(s.gloss), gl = C.flatten(s.gloss);
        var shared = ctx.filter(function (o) { return o !== t && !neutralToken(o) && !entTok[o] && stemIn(gl, o); });
        head.forEach(function (g) {
          if (g === t) return;
          var r = s.pos === "v" ? C.relationForVerb(g) : C.relationForHead(g);
          if (!r || !relationEntry(r) || !relationEntry(r).heads.length) return;
          var h = s.pos === "v" ? relationEntry(r).heads[0] : g;
          push({ rel: r, head: h, from: t, cost: Math.max(0.05, (si ? 0.35 : 0.2) - 0.25 * shared.length),
                 accounts: [t].concat(shared), sense: s.gloss, figurative: si > 0 });
        });
      });
    });
    cues.sort(function (a, b) { return a.cost - b.cost; });
    return cues;
  }

  /* Words a dictionary gloss paraphrases: "turn to ice" is what the gloss
     of "freeze" says. Each such word stands in for the tokens it covers. */
  function glossParaphrases(frame, entTok, ents) {
    var LX = root.C4LMLexicon, out = [];
    if (!LX || !LX.raw) return out;
    var ctx = frame.contentTokens.filter(function (t) { return !entTok[t] && !neutralToken(t); });
    /* what the named things ARE is context too: "where does France keep its
       government" is about a country's government */
    var typed = ctx.slice();
    (ents || []).forEach(function (e) { C.words(e.entity.type || "").forEach(function (w) { if (typed.indexOf(w) < 0) typed.push(w); }); });
    if (!ctx.length || typed.length < 2) return out;
    Object.keys(LX.raw).forEach(function (w) {
      if (ctx.indexOf(w) >= 0) return;
      (LX.raw[w] || []).forEach(function (s) {
        var head = C.words(s.gloss).map(function (g) { return g.replace(/'s$/, ""); })
          .filter(function (g) { return !C.STOP[g] && g.length > 2; }).slice(0, 8);
        if (head.length < 2) return;
        var match = function (t) { return head.some(function (g) { return g === t || C.stem(g) === C.stem(t); }); };
        var hit = typed.filter(match), own = ctx.filter(match);
        if (own.length && hit.length >= 2 && hit.length * 2 >= Math.min(head.length, 4)) out.push({ word: w, accounts: own });
      });
    });
    return out.slice(0, 6);
  }

  /* The type of thing the question asks for. "which/what N" asks for an
     instance of N; "how ADJ" for a quantity (a temperature when the
     adjective's gloss is about temperature); who/where/when as usual. */
  function expectedType(frame, cues) {
    var l = frame.lower, m;
    var rel = frame.relation && relationEntry(frame.relation);
    if (rel && /^(?:person|place|time|quantity)$/.test(rel.answerType)) return { kind: rel.answerType };
    /* a polar question wants a position taken, yes or no */
    if (frame.queryForm === "yesno" || /^(?:is|are|was|were|do|does|did|can|could|has|have|will|should)\s+(?:the\s+|a\s+|an\s+)?[a-z]/.test(C.flatten(frame.semanticText || frame.body)))
      return { kind: "polar" };
    if (/\bwho(?:'s|m|se)?\b/.test(l)) return { kind: "person" };
    if (/^where\b|\bwhere (?:is|are|was|were|does|do|did)\b/.test(l)) return { kind: "place" };
    if (/^when\b|\bwhat (?:year|date|century|decade)\b/.test(l)) return { kind: "time" };
    if ((m = l.match(/\bhow ([a-z]+)\b/)) && !/^(?:do|does|did|can|could|is|are|was|were|come|would|should|will|to|about|so)$/.test(m[1])) {
      var hot = m[1] === "temperature" || lexSenses(m[1]).some(function (s) { return /temperature/.test(s.gloss); });
      return { kind: hot ? "temperature" : "quantity", word: m[1] };
    }
    if ((m = l.match(/\b(?:what|which)\s+([a-z]+)\b/)) && !C.STOP[m[1]] && !/^(?:is|are|was|were|do|does|did|makes|causes)$/.test(m[1])) {
      if (m[1] === "temperature" || lexSenses(m[1]).some(function (s) { return /temperature/.test(s.gloss); })) return { kind: "temperature", word: m[1] };
      var rels = (cues || []).filter(function (c) { return c.from === m[1]; }).map(function (c) { return c.rel; });
      if (rels.length) return { kind: "relation", word: m[1], rels: rels };
      /* otherwise "which N" asks for something that IS an N */
      if (lexSenses(m[1]).some(function (s) { return s.pos === "n"; }) && !/^(?:kind|type|sort|way|part|thing|one)$/.test(m[1]))
        return { kind: "instance", word: m[1] };
    }
    return { kind: "" };
  }
  function typeFit(type, result, frame) {
    var text = String(result.text || "");
    switch (type.kind) {
      case "person": {
        var names = text.match(/\b[A-Z][a-z'-]+(?:\s+(?:van|von|de|da|di|del|der|la|le|bin|al)?\s*[A-Z][a-z'-]+)+/g) || [];
        return names.some(function (n) { return C.flatten(frame.body).indexOf(C.flatten(n)) < 0; }) ? 1 : -1;
      }
      case "place":
        return (result.relation === "capital" || result.relation === "location" ||
                (text.match(/\b[A-Z][a-z]+/g) || []).slice(1).some(function (n) { return frame.body.indexOf(n) < 0; })) ? 1 : -1;
      case "time": return /\b(?:1\d{3}|20\d{2})\b|\bcentury\b|\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(text) ? 1 : -1;
      case "temperature": return /°|\bdegrees?\b|\bkelvin\b/i.test(text) ? 1 : -1;
      case "quantity": return /\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|hundred|thousand|million|billion)\b/i.test(text) ? 1 : -1;
      case "relation": return type.rels.indexOf(result.relation) >= 0 ? 1 : -1;
      case "instance": {
        var own = result.entity && KB ? ((KB.resolve(result.entity, { strict: true })[0] || {}).entity || {}).defn || "" : "";
        var kindRe = new RegExp("\\b(?:is|are|was|were)\\s+(?:a|an|the)\\s+(?:[a-z-]+\\s+){0,3}" + singularize(type.word) + "(?:s|es)?\\b", "i");
        return kindRe.test(text + " " + own) ? 1 : -1;
      }
      case "polar": return /\b(?:yes|no|not|never|isn't|aren't|wasn't|doesn't|don't|didn't|cannot|can't)\b/i.test(text) ? 1 : -1;
    }
    return 0;
  }

  /* How much of the question an answer accounts for: each content token is
     found in the answer (by stem), or consumed by the reading (a sense
     substitution whose relation the answer delivered, a paraphrase the
     answer uses), or it names the answer type and the type fits. A noun
     glued to an entity ("computer science" when only "computer" is known)
     counts double: answering the shorter name answers a different
     question. */
  function coverage(frame, result, reading, type, fit, ents) {
    var hay = C.flatten(String(result.text || "") + " " + (result.entity || ""))
      .replace(/°\s*f\b/g, " fahrenheit ").replace(/°\s*c\b/g, " celsius ");
    var entTok = Object.create(null);
    ents.forEach(function (e, ei) { e.tokens.forEach(function (t) { entTok[t] = ei + 1; }); });
    /* a compositional reading restates the question's words by construction,
       so finding them in it is only half the evidence */
    var echo = (result.composed || result.route === "compose") ? 0.5 : 1;
    var total = 0, got = 0, toks = frame.contentTokens, all = frame.tokens;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (neutralToken(t) || aboutWord(t) || (!entTok[t] && requestVerbs(frame).indexOf(t) >= 0)) continue;
      var w = 1, at = all.indexOf(t);
      var sn = lexSenses(t), nounish = entTok[t] || (sn.length && sn.every(function (s) { return s.pos === "n"; }));
      var glued = function (o) { return o && entTok[o] && entTok[o] !== entTok[t]; };
      if (nounish && at >= 0 && (glued(all[at - 1]) || glued(all[at + 1]))) w = 2;
      total += w;
      if (stemIn(hay, t)) { got += w * echo; continue; }
      if (result.accounted && result.accounted.indexOf(t) >= 0) { got += w; continue; }
      if (reading && reading.accounts && reading.accounts.indexOf(t) >= 0 &&
          (!reading.rel || result.relation === reading.rel || reading.paraphrase)) { got += w; continue; }
      if (type.word === t && fit > 0) { got += w; continue; }
    }
    return total ? got / total : 1;
  }

  function routeScore(result) {
    if (!result || !result.text) return -Infinity;
    if (result.insufficient || result.route === "insufficient" || result.route === "none") return -2;
    if (result.conversational || result.route === "conversation") return -1.5;
    /* a compositional reading is a guess when the composer itself could not
       fit a sense to the phrase (its own confidence says so) */
    if (result.composed || result.route === "compose") return (result.confidence || 0) >= 0.6 ? 0.5 : -1.5;
    if (result.clarification) return -0.5;
    if (result.defined || result.route === "lexicon") return 0;
    return 1;
  }
  function scoreCandidate(frame, result, reading, type, ents) {
    var fit = typeFit(type, result, frame);
    var cov = coverage(frame, result, reading, type, fit, ents);
    var s = routeScore(result) + 3 * cov + 0.8 * fit + 0.3 * (result.confidence || 0) - (reading ? reading.cost : 0);
    return { score: s, coverage: cov, fit: fit };
  }

  /* Choose from an entity's own facts the sentence that answers the most of
     the question -- its definition, its stored statements, its relations. */
  function answerByFacts(frame, entity, paraphrases, type, entTok) {
    var facts = [];
    if (entity.defn) facts.push(entity.defn);
    Object.keys(entity.extra || {}).forEach(function (k) {
      var v = entity.extra[k];
      if (typeof v === "string" && v.length > 12 && /[.!?]$/.test(v.trim()) && /\s/.test(v)) facts.push(v);
    });
    factPool(entity, "").forEach(function (s) { facts.push(s); });
    /* relations the fact pool does not verbalise are stated plainly */
    Object.keys(entity.rel || {}).forEach(function (k) {
      var v = entity.rel[k];
      if (typeof v !== "string" || !v || k === "type") return;
      if (k === "count" && /\s/.test(v)) facts.push(displayName(entity) + " has " + v + ".");
      else if (!/^(?:capital|currency|language|population|continent|location|country|birth|death|creator|author|artist|purpose|part|height|length|symbol|capitalOf)$/.test(k))
        facts.push("The " + (RELATION_LABEL[k] || k) + " of " + displayName(entity) + " is " + v + ".");
    });
    var ask = frame.contentTokens.filter(function (t) { return !entTok[t] && !neutralToken(t) && !aboutWord(t); });
    if (!ask.length) return null;
    var best = null;
    facts.forEach(function (f) {
      var hay = C.flatten(f), got = 0, via = [];
      ask.forEach(function (t) {
        if (stemIn(hay, t)) { got++; return; }
        if (paraphrases.some(function (p) { return p.accounts.indexOf(t) >= 0 && stemIn(hay, p.word); })) { got++; via.push(t); }
      });
      var fit = typeFit(type, { text: f }, frame);
      var s = got + 0.8 * Math.max(0, fit);
      if (got && (!best || s > best.s)) best = { s: s, text: f, via: via };
    });
    if (!best) return null;
    /* the fact pool speaks of "it"; a standalone answer names its subject */
    var name = displayName(entity);
    best.text = best.text.replace(/^Its\s/, name + "'s ").replace(/^It\s/, name + " ");
    return { text: RZ.polish(RZ.terminate(best.text)), route: "knowledge", entity: entity.name, confidence: 0.75,
             sources: ["local knowledge base"], defects: [], factSelected: true, accounted: best.via };
  }

  /* ------------------------------------------------------ research */
  function queryFrame(words) {
    var toks = words.map(function (w) { return C.flatten(w); }).join(" ").split(" ").filter(function (t) { return t && !C.STOP[t]; });
    return { contentTokens: toks, contentStems: toks.map(C.stem), stems: toks.map(C.stem) };
  }
  /* A document's prose: for a knowledge-base entry, its definition and its
     stored statements -- never the alias list the index also carries. */
  function docProse(doc) {
    var e = doc && doc.entity;
    if (!e) return String(doc && doc.text || "");
    var parts = [e.defn];
    Object.keys(e.extra || {}).forEach(function (k) {
      var v = e.extra[k];
      if (typeof v === "string" && /\s/.test(v) && /[.!?]$/.test(v.trim())) parts.push(v);
    });
    return parts.filter(Boolean).join(" ");
  }
  /* real sentences only: capitalised, ending in terminal punctuation (an
     index document may trail a keyword list, which is not prose) */
  function sentencesOf(text) {
    return String(text || "").split(/(?<=[.!?])\s+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length > 12 && /^[A-Z0-9"“(]/.test(x) && /[.!?]["”)]?$/.test(x); });
  }

  /* Several documents retrieved by the summary's query, kept only when they
     are about the question (they mention its subject terms), their sentences
     ranked by how much of the question they account for; a sentence whose
     key content is repeated by another on-topic document ranks higher. */
  function researchSummary(frame, type) {
    var comp = frame.comprehension;
    if (!state.index || !comp || !comp.about.length) return null;
    var about = comp.about.map(function (a) { return C.flatten(a); });
    var docs = state.index.candidates(queryFrame(comp.query.split(" ")), 12).filter(function (h) {
      var hay = C.flatten((h.doc.title || "") + " " + (h.doc.text || ""));
      var hits = about.filter(function (a) { return a.split(" ").every(function (w) { return stemIn(hay, w); }); }).length;
      return hits >= Math.max(1, Math.ceil(about.length * 0.6));
    }).slice(0, 6);
    if (!docs.length) return null;
    var ask = frame.contentTokens.filter(function (t) { return !neutralToken(t); }), best = null;
    docs.forEach(function (h) {
      sentencesOf(docProse(h.doc)).forEach(function (sn) {
        var hay = C.flatten(sn), cov = ask.filter(function (t) { return stemIn(hay, t); }).length / Math.max(1, ask.length);
        var fit = typeFit(type, { text: sn }, frame);
        var agree = docs.filter(function (o) { return o !== h && C.flatten(o.doc.text || "").indexOf(hay.slice(0, 24)) < 0 &&
          (sn.match(/\b[A-Z][a-z]+|\d[\d,.]*/g) || []).some(function (k) { return (o.doc.text || "").indexOf(k) >= 0; }); }).length;
        var sc = cov + 0.5 * Math.max(0, fit) + 0.15 * Math.min(agree, 3);
        if (!best || sc > best.sc) best = { sc: sc, text: sn, doc: h.doc };
      });
    });
    if (!best) return null;
    /* a sentence lifted out of its document names its subject */
    var subj = best.doc.entity ? displayName(best.doc.entity) : (best.doc.title || "");
    if (subj) best.text = best.text.replace(/^Its\s/, subj + "'s ").replace(/^(?:It|This)\s/, subj + " ");
    return { text: RZ.polish(RZ.terminate(best.text)), route: "knowledge", entity: best.doc.title || "", confidence: 0.7,
             sources: docs.map(function (h) { return h.doc.title; }).filter(Boolean).slice(0, 4), defects: [], researched: true };
  }

  /* "What N ...?" / "Which N ...?" asks for an instance of N. Candidates are
     the entries the knowledge base defines as an N; the one the documents
     about the rest of the question mention most is the answer. */
  function researchInstance(frame) {
    var m = String(frame.lower || "").match(/\b(?:what|which)\s+([a-z]+)\s+(?:is|are|was|were|do|does|did|can|will)\b/);
    if (!m || !KB || !state.index) return null;
    var kind = singularize(m[1]);
    if (C.STOP[kind] || /^(?:time|year|day)$/.test(kind)) return null;
    var re = new RegExp("\\b(?:is|are|was|were)\\s+(?:a|an|the)\\s+(?:[a-z-]+\\s+){0,2}" + kind + "s?\\b", "i");
    var cands = KB.entities().filter(function (e) { return re.test(e.defn || "") || C.flatten(e.type || "") === kind; });
    if (!cands.length || cands.length > 60) return null;
    var rest = frame.contentTokens.filter(function (t) { return !neutralToken(t) && C.stem(t) !== C.stem(kind) && singularize(t) !== kind; });
    if (!rest.length) return null;
    var docs = state.index.candidates(queryFrame(rest), 16);
    var best = null;
    cands.forEach(function (e) {
      var names = [e.name].concat(e.aliases || []).map(function (n) { return C.flatten(n); }).filter(function (n) { return n.length > 2; });
      var support = 0, where = [], covered = [], quote = null;
      docs.forEach(function (h) {
        if (h.doc.entity === e) return;
        var hay = C.flatten(h.doc.text || "");
        if (!names.some(function (n) { return hay.indexOf(n) >= 0; })) return;
        var hit = rest.filter(function (t) { return stemIn(hay, t); }), cov = hit.length / rest.length;
        if (cov < 0.5) return;
        support += cov; where.push(h.doc.title);
        hit.forEach(function (t) { if (covered.indexOf(t) < 0) covered.push(t); });
        /* the sentence that ties the instance to the question */
        sentencesOf(docProse(h.doc)).forEach(function (sn) {
          var f = C.flatten(sn);
          if (!names.some(function (n) { return f.indexOf(n) >= 0; })) return;
          var c2 = rest.filter(function (t) { return stemIn(f, t); }).length;
          if (!quote || c2 > quote.c) quote = { c: c2, text: sn };
        });
      });
      if (support && (!best || support > best.support)) best = { e: e, support: support, where: where, covered: covered, quote: quote };
    });
    if (!best) return null;
    var name = displayName(best.e);
    return { text: RZ.polish(name.charAt(0).toUpperCase() + name.slice(1) + (best.quote ? " — " + RZ.terminate(best.quote.text) : ".") +
                   " " + RZ.terminate(best.e.defn)),
             route: "knowledge", entity: best.e.name, confidence: 0.72, sources: ["local knowledge base"].concat(best.where.slice(0, 3)),
             defects: [], researched: true, accounted: best.covered };
  }

  /* A question that names a unit the answer does not use gets the answer's
     quantity converted into it, by the same converter arithmetic uses. */
  var SCALE = { c: "celsius", celsius: "celsius", centigrade: "celsius", f: "fahrenheit", fahrenheit: "fahrenheit" };
  function conformUnits(frame, result) {
    if (!RS || !result || !result.text || off("units")) return result;
    var asked = (frame.lower.match(/\b(fahrenheit|celsius|centigrade)\b/) || [])[1];
    if (!asked) return result;
    var want = SCALE[asked], text = String(result.text);
    var q = text.match(/(-?\d+(?:\.\d+)?)\s*(?:°\s*|degrees?\s+)(c|f|celsius|fahrenheit)\b/i);
    if (!q || SCALE[q[2].toLowerCase()] === want) return result;
    if (new RegExp("°\\s*" + want.charAt(0) + "\\b|\\b" + want + "\\b", "i").test(text)) return result;
    var conv = RS.solve(C.parse("convert " + q[1] + " degrees " + SCALE[q[2].toLowerCase()] + " to " + want, {}));
    if (!conv || conv.value === undefined) return result;
    result.text = RZ.terminate(text.replace(/[.!?]\s*$/, "")) + " That is " + RS.fmtNumber(conv.value) + " °" + want.charAt(0).toUpperCase() + ".";
    result.unitConformed = want;
    return result;
  }

  /* The longest run of content words: what a question is about once its
     interrogative, light verb and particles are set aside. */
  function nounPhrase(frame) {
    var runs = [], run = [];
    frame.tokens.concat([""]).forEach(function (t) {
      if (t && (!neutralToken(t) || /^\d/.test(t)) && !/^(?:who|what|which|where|when|why|how)(?:'s)?$/.test(t)) run.push(t);
      else { if (run.length) runs.push(run); run = []; }
    });
    /* the run holding a word nothing knows is what the question is about */
    runs.sort(function (a, b) { return (b.some(unknownWord) - a.some(unknownWord)) || (b.length - a.length); });
    var pick = runs[0] || [];
    /* keep the name, drop a trailing verb ("glimmerwing 9 use") */
    while (pick.length > 1 && lexSenses(pick[pick.length - 1]).length && lexSenses(pick[pick.length - 1]).every(function (s) { return s.pos === "v"; })) pick = pick.slice(0, -1);
    return pick.join(" ");
  }
  /* A word no local source knows -- not in the lexicon, the vocabulary or
     the knowledge base. */
  function unknownWord(t) {
    if (neutralToken(t) || /\d/.test(t)) return false;
    if (lexSenses(t).length || (C.knownWord && C.knownWord(t))) return false;
    return !(KB && KB.resolve(t, { strict: true }).length);
  }
  /* The answer is about a known thing while the question's subject is a
     name nothing here knows: "freezing point of zorbanium" answered with
     the freezing point of water is a confident answer to a different
     question, and it is withdrawn. */
  function offTopic(frame, result) {
    if (!result || !result.entity || result.multiHop || !frame.subject) return false;
    var subj = C.words(frame.subject).filter(function (t) { return !neutralToken(t); });
    if (!subj.some(unknownWord)) return false;
    var name = C.flatten(result.entity);
    /* the words nothing knows are the ones that pick the thing out ("the
       Trelloway X2 car" is not "car"): the answer must be about them */
    return !subj.filter(unknownWord).some(function (t) { return stemIn(name, t); });
  }

  /* A keyword fragment with numbers leaves out the words that say what to
     do with them ("two power ten", "20 degrees Celsius Fahrenheit"). The
     missing connective is searched for: a reading inserts one connective
     between two words and/or a leading request, the exact solver tries it,
     and only a reading whose worked steps use every stated number is kept. */
  var FRAG_LEAD = ["", "convert ", "what is ", "how ", "how many "];
  var FRAG_JOIN = ["to", "of", "in", "to the power of"];
  function completeFragment(frame, t0) {
    if (!RS || !PRB || !PRB.wordsToNumbers || off("fragment")) return null;
    var text = PRB.wordsToNumbers(String(frame.semanticText || frame.body || "")).replace(/[?.!]+$/, "").trim();
    var toks = text.split(/\s+/), nums = text.match(/\d+(?:\.\d+)?/g) || [];
    if (!nums.length || toks.length > 7 || /^(?:what|which|who|how|why|when|where|is|are|do|does|can)\b/i.test(text)) return null;
    for (var li = 0; li < FRAG_LEAD.length; li++) {
      var tries = [FRAG_LEAD[li] + text];
      for (var g = 1; g < toks.length; g++) {
        FRAG_JOIN.forEach(function (j) {
          /* the connective goes between two words, or stands in for the one
             word that only gestured at it ("2 power 10") */
          tries.push(FRAG_LEAD[li] + toks.slice(0, g).join(" ") + " " + j + " " + toks.slice(g).join(" "));
          if (g < toks.length - 1) tries.push(FRAG_LEAD[li] + toks.slice(0, g).join(" ") + " " + j + " " + toks.slice(g + 1).join(" "));
        });
      }
      for (var k = 0; k < tries.length; k++) {
        if (now() - t0 > DELIB_BUDGET_MS) return null;
        var f2 = C.parse(tries[k], discourse.snapshot()), r = null, out = null, worked = "";
        try { r = f2 && !f2.empty ? RS.solve(f2) : null; } catch (e) { r = null; }
        if (r && r.value !== undefined && r.ok !== false) {
          worked = (r.steps || []).concat([r.expression || ""]).join(" ");
          out = answerReasonText(f2, r);
        } else {
          /* the English arithmetic reader is the second solver */
          var p = null;
          try { p = PRB.answer(tries[k]); } catch (e) { p = null; }
          if (!p || p.kind !== "arithmetic" || !p.problem || !p.problem.fromProse) continue;
          worked = String(p.problem.expr || "");
          out = { text: RZ.polish(p.text), route: "reason", confidence: p.confidence, sources: [], defects: [] };
        }
        worked = " " + worked.replace(/[^\d.]+/g, " ") + " ";
        if (!out || !nums.every(function (n) { return worked.indexOf(" " + n + " ") >= 0; })) continue;
        out.accounted = frame.contentTokens.slice();
        out.reading = tries[k];
        return { cand: out, why: "fragment read as “" + tries[k] + "”" };
      }
    }
    return null;
  }

  function weakness(frame, result, decision) {
    if (!result || result.memoryTurn || result.code) return "";
    if (result.route === "code" || result.route === "compute" || result.route === "reason" || result.route === "memory") return "";
    if (decision && decision.features && decision.features.social) return "";
    /* a response built for what the message calls for (c4-lm-converse.js)
       is not re-read as a lookup of its words */
    if (result.intent) return "";
    if (frame.metaSelf || !isRequest(frame)) return "";
    /* a long message is not a phrasing puzzle; deliberation is bounded */
    if (frame.wordCount > 80) return "";
    /* a question about the present has no better local reading: an honest
       "could not reach a live source" must not be traded for a definition */
    if (frame.requiresFreshInformation || result.caveat) return "";
    /* an answer whose form the user dictated (a list, one word, N sentences)
       does not restate the question by design; coverage cannot judge it */
    if (frame.requiresList || frame.onlyValue || frame.requestedLength ||
        (frame.requestedFormat && frame.requestedFormat !== "prose")) return "";
    if (routeScore(result) <= -1.5) return result.route === "compose" ? "compositional guess" : "no answer";
    return "check";
  }

  function deliberate(frame, decision, result) {
    if (off("deliberation") || !C || !KB) return result;
    var why = weakness(frame, result, decision);
    if (!why) return result;
    var t0 = now();
    if (offTopic(frame, result)) {
      var honest = fallback(frame, null);
      honest.deliberation = { trigger: "off-topic", withdrawn: result.entity };
      return honest;
    }
    conformUnits(frame, result);
    var ents = spotEntities(frame), entTok = Object.create(null);
    ents.forEach(function (e) { e.tokens.forEach(function (t) { entTok[t] = 1; }); });
    /* A request to explain a named thing that nothing here knows is not
       small talk: say so, rather than "say more". */
    function keep(record) {
      var names = frame.entities.some(function (e) { return C.flatten(e) !== frame.tokens[0]; }) ||
                  frame.contentTokens.some(unknownWord);
      /* a word's dictionary sense given for a "who"/"where"/"when" question,
         or small talk given for a request naming a thing, answers a question
         nobody asked: say what is missing instead */
      var wrongKind = (result.route === "lexicon" || result.defined || result.route === "compose" || result.composed) &&
                      base && base.fit < 0 && /^(?:person|place|time|quantity|temperature)$/.test(type.kind);
      /* a keyword fragment ("melting point of blorvium") is a question even
         without a question mark; one that speaks of the speaker is not */
      var impersonal = !frame.tokens.some(function (t) { return /^(?:i|i'm|i've|i'd|me|my|mine|we|us|our|you|your|yours)$/.test(t); });
      var fragmentAsk = frame.speechAct === "statement" && impersonal && (frame.relation || ents.length) &&
                        frame.contentTokens.some(unknownWord);
      if ((result.route === "conversation" && ((speakerRequest(frame) && names) || fragmentAsk)) || wrongKind) {
        /* name the part nothing here knows: the parsed subject if it holds
           the unknown word, else the phrase that does */
        var unknownSubject = frame.subject && C.words(frame.subject).some(unknownWord) ? frame.subject : "";
        var none = fallback(Object.assign({}, frame, { subject: unknownSubject || nounPhrase(frame) || frame.subject }), null);
        none.deliberation = record || { trigger: why };
        none.deliberation.withdrawn = result.route;
        return none;
      }
      if (record) result.deliberation = record;
      return result;
    }
    /* reading a phrase word by word when it names something the knowledge
       base holds is the weaker reading, whatever the composer's confidence */
    if (why === "check" && (result.composed || result.route === "compose") && ents.length) why = "composed over a named thing";
    var cues = relationCues(frame, entTok), type = { kind: "" }, base = null;
    type = expectedType(frame, cues);
    base = scoreCandidate(frame, result, null, type, ents);
    /* A solid first answer that accounts for the question and fits its type
       is left alone: deliberation is paid for only when it can matter. */
    var stated = String(frame.semanticText || frame.body || "").match(/\d+(?:\.\d+)?/g) || [];
    var usesNumbers = stated.every(function (n) { return String(result.text || "").indexOf(n) >= 0; });
    if (why === "check" && base.coverage >= 0.66 && base.fit >= 0 && usesNumbers) return result;
    if (routeScore(result) <= 0 && (frame.queryForm === "statement" || frame.queryForm === "compute")) {
      var frag = completeFragment(frame, t0);
      if (frag) {
        var fsc = scoreCandidate(frame, frag.cand, { cost: 0.3, accounts: [] }, type, ents);
        if (fsc.score >= base.score + DELIB_MARGIN) {
          frag.cand.interpretation = frag.why;
          frag.cand.deliberation = { trigger: why, chosen: frag.why, base: Math.round(base.score * 100) / 100,
                                     score: Math.round(fsc.score * 100) / 100 };
          state.profile.push({ label: "deliberate", ms: now() - t0 });
          return frag.cand;
        }
      }
    }
    if (!ents.length && !cues.length && !(frame.comprehension && frame.comprehension.about.length)) return keep(null);

    var paraphrases = glossParaphrases(frame, entTok, ents);
    /* a paraphrased word that is itself a relation noun is a relation cue:
       "keep its government" paraphrases "capital" */
    paraphrases.forEach(function (p) {
      var r = C.relationForHead(p.word);
      if (r && relationEntry(r) && relationEntry(r).heads.length && !cues.some(function (c) { return c.rel === r; })) {
        cues.push({ rel: r, head: p.word, from: p.accounts[0], cost: 0.3, accounts: p.accounts });
      }
    });
    /* "who ..." about a work or an invention asks for its maker: every
       relation whose answer is a person is a reading */
    if (type.kind === "person") {
      C.relations.forEach(function (r) {
        if (r.answerType === "person" && r.heads.length && !cues.some(function (c) { return c.rel === r.id; })) {
          cues.push({ rel: r.id, head: r.heads[0], from: "", cost: 0.35, accounts: [] });
        }
      });
    }
    var readings = [];
    var explainy = frame.requiresExplanation || /^(?:why|how)$/.test(frame.queryForm);
    ents.slice(0, 2).forEach(function (e, ei) {
      cues.slice(0, 6).forEach(function (c) {
        var who = (relationEntry(c.rel) || {}).answerType === "person" || type.kind === "person";
        readings.push({ text: (who ? "Who is the " : "What is the ") + c.head + " of " + e.phrase + "?",
                        cost: c.cost + 0.1 + ei * 0.1, rel: c.rel, accounts: c.accounts,
                        why: "“" + c.from + "” read as " + c.head + (c.sense ? " (" + c.sense + ")" : "") });
      });
      readings.push({ facts: e.entity, cost: 0.15 + ei * 0.1, accounts: [], paraphrase: true,
                      why: "facts of " + e.phrase });
      readings.push({ text: (explainy ? "Explain " : "What is ") + e.phrase + "?", cost: 0.3 + ei * 0.1, accounts: [],
                      why: "about " + e.phrase });
    });
    /* The sentence as written with one figurative word in its other sense. */
    cues.filter(function (c) { return c.figurative; }).slice(0, 2).forEach(function (c) {
      var re = new RegExp("\\b" + c.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      var sub = String(frame.rawText || frame.body).replace(re, c.head);
      if (sub !== frame.rawText) readings.push({ text: sub, cost: c.cost, rel: c.rel, accounts: c.accounts,
                                                 why: "“" + c.from + "” read as " + c.head });
    });
    /* The first frame through the resolvers the router did not pick. */
    readings.push({ resolver: "content", cost: 0.2, accounts: [], why: "content retrieval" });
    /* Research by the comprehension summary: several documents, strictly on
       topic, and -- for "what/which N" -- the instance of N the documents
       about the rest of the question keep mentioning. */
    if (frame.comprehension) {
      readings.push({ research: "instance", cost: 0.2, accounts: [], why: "research: instance named across documents" });
      readings.push({ research: "summary", cost: 0.25, accounts: [], why: "research by summary" });
    }

    var best = null, considered = 0, tried = [];
    for (var i = 0; i < readings.length && considered < DELIB_MAX_READINGS; i++) {
      if (now() - t0 > DELIB_BUDGET_MS) break;
      var rd = readings[i], cand = null;
      try {
        if (rd.facts) cand = answerByFacts(frame, rd.facts, paraphrases, type, entTok);
        else if (rd.research === "instance") cand = researchInstance(frame);
        else if (rd.research === "summary") cand = researchSummary(frame, type);
        else if (rd.resolver === "content") cand = answerKBByContent(frame, decision);
        else {
          var f2 = C.parse(rd.text, discourse.snapshot());
          if (f2 && !f2.empty) cand = localResolvers(f2, decide(f2, discourse));
        }
      } catch (e) { cand = null; }
      considered++;
      if (!cand || !cand.text || cand.clarification) continue;
      conformUnits(frame, cand);
      var sc = scoreCandidate(frame, cand, rd, type, ents);
      tried.push({ reading: rd.why, route: cand.route, score: Math.round(sc.score * 100) / 100,
                   coverage: Math.round(sc.coverage * 100) / 100, fit: sc.fit });
      if (!best || sc.score > best.sc.score) best = { cand: cand, sc: sc, reading: rd };
    }
    state.profile.push({ label: "deliberate", ms: now() - t0 });
    var record = { trigger: why, considered: considered, base: Math.round(base.score * 100) / 100,
                   type: type.kind, readings: tried };
    if (best && best.sc.score >= base.score + DELIB_MARGIN && routeScore(best.cand) > 0 && best.sc.coverage >= 0.5) {
      var out = best.cand;
      out.confidence = Math.min(out.confidence || 0.7, 0.8);
      out.interpretation = best.reading.why;
      record.chosen = best.reading.why; record.score = Math.round(best.sc.score * 100) / 100;
      out.deliberation = record;
      return out;
    }
    return keep(record);
  }

  /* ================================================ conversation awareness */

  function userSignature(frame) {
    var stems = (frame.contentStems || []).filter(function (s, i, a) { return s && s.length > 1 && !C.STOP[s] && a.indexOf(s) === i; });
    /* the form asked for is part of the request: "in one sentence" after the
       same question is a new request, not a repeat */
    var form = [frame.requestedFormat, frame.requestedLength, frame.requestedUnit, frame.requestedTone, frame.onlyValue ? 1 : 0].join("|");
    return { norm: C.flatten(frame.rawText || frame.body || ""), stems: stems, form: form };
  }
  /* the same request: the same words, or the same content (stems overlap
     almost entirely -- "how do markov chains work" / "how does a markov
     chain work") */
  function sameAsk(a, b) {
    if (a.norm && a.norm === b.norm) return true;
    if (a.form !== b.form) return false;
    if (!a.stems.length || !b.stems.length) return false;
    var inter = a.stems.filter(function (s) { return b.stems.indexOf(s) >= 0; }).length;
    var union = a.stems.length + b.stems.length - inter;
    return inter / union >= 0.8;
  }
  function isReaction(frame) {
    if (frame.speechAct === "acknowledgement") return true;
    if (frame.hasQuestionMark || /^(?:greeting|thanks|meta|question|command)$/.test(frame.speechAct)) return false;
    /* no content at all: nothing to be about but the last exchange */
    return frame.contentTokens.filter(function (t) { return !C.STOP[t] && t.length > 1; }).length === 0 && frame.wordCount > 0;
  }
  /* an answer that is not really one: an admission, a guess, low confidence */
  function weakAnswer(result) {
    if (!result || !result.text) return true;
    if (result.insufficient || result.route === "insufficient" || result.route === "none") return true;
    if ((result.composed || result.route === "compose") && (result.confidence || 0) < 0.6) return true;
    return (result.confidence || 0) > 0 && result.confidence < 0.45;
  }
  function repeatsOf(sig) {
    return discourse.history.filter(function (h) { return h.kind === "ask" && sameAsk(h.sig, sig); });
  }
  function subjectOf(frame) {
    var comp = frame.comprehension;
    return frame.subject || (comp && comp.about && comp.about.join(" and ")) || nounPhrase(frame) || frame.topic || "that";
  }
  function ordinal(n) { return n === 2 ? "second" : n === 3 ? "third" : n === 4 ? "fourth" : n === 5 ? "fifth" : n + "th"; }
  function lowerFirst(t) { return /^[A-Z][a-z]/.test(t) && !/^[A-Z][a-z]+\s[A-Z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

  function recordTurn(frame, result, info) {
    if (!info || info.internal) return;
    discourse.history.push({ kind: info.reaction ? "reaction" : "ask", sig: info.sig, turn: discourse.turns,
                             words: C.flatten(frame.rawText || ""), subject: info.reaction ? "" : subjectOf(frame),
                             text: result.text || "", weak: weakAnswer(result), route: result.route });
    if (discourse.history.length > 40) discourse.history.shift();
  }

  /* A question asked again means the earlier answer did not land. What to
     say depends on what that answer was: an admission is not repeated as if
     new -- the repeat is acknowledged, the limit stated plainly, and what
     would help is asked for; a real answer that comes out the same is given
     again with that said, and an invitation to narrow it; an answer that
     differs this time is introduced as a second attempt. */
  function awareOfRepeat(frame, result, info) {
    if (!info || !info.rep || !info.rep.length || result.memoryTurn) return result;
    var n = info.rep.length + 1, prev = info.rep[info.rep.length - 1];
    var sim = RZ.variation && RZ.variation.similarity ? RZ.variation.similarity(prev.text, result.text || "") : (prev.text === result.text ? 1 : 0);
    var subject = subjectOf(frame);
    var ago = discourse.turns - prev.turn <= 2 ? "just now" : "earlier";
    if (weakAnswer(result)) {
      var remote = state.federation && !off("web");
      return { text: "That's the " + ordinal(n) + " time you've asked, and I still can't give you a real answer: I don't have anything reliable on " +
                     subject + (remote ? ", and the public sources I can reach didn't turn anything up either." : " in what I hold locally.") +
                     (n >= 3 ? " Asking again won't change what I know — but if you tell me what you already know about it, or paste a source, I'll reason from that."
                             : " If you tell me which part you're after, or point me at a source, I'll work from that."),
               route: "insufficient", insufficient: true, confidence: 0.2, sources: [], repeat: n };
    }
    if (prev.weak) {
      result.text = "Let me take another run at that. " + result.text;
    } else {
      /* a real answer, asked for again: say it is the same answer (the
         realiser has already reworded it and added a detail not given
         before), and ask what the user is missing */
      result.text = "You asked this " + ago + (sim >= 0.6 ? " — the answer hasn't changed: " : " — same answer, put another way: ") + result.text +
                    (n >= 3 ? " You've asked it " + n + " times now, so I may be missing what you mean — which part should I go into?"
                            : " If that isn't what you were after, tell me which part to go into.");
    }
    result.repeat = n;
    return result;
  }

  /* A reaction answers the last exchange. After an answer that was not a
     real one it is read as the user noticing that; several in a row mean
     the conversation is not giving them what they need, and that is said. */
  function answerReaction(frame) {
    var hist = discourse.history, lastAsk = null, inRow = 0, i;
    for (i = hist.length - 1; i >= 0; i--) { if (hist[i].kind === "reaction") inRow++; else { lastAsk = hist[i]; break; } }
    var word = C.flatten(frame.rawText || "").trim();
    if (!lastAsk) return answerConversation(frame, discourse);
    var same = 0;
    for (i = hist.length - 1; i >= 0 && hist[i].kind === "reaction"; i--) if (hist[i].words === word) same++;
    /* how often the user has reacted to a non-answer on this same subject,
       across the whole conversation, and what was already said back */
    var misses = 0, said = [];
    for (i = 0; i < hist.length; i++) {
      if (hist[i].kind !== "reaction") continue;
      said.push(hist[i].text);
      for (var j = i - 1; j >= 0; j--) if (hist[j].kind === "ask") { if (hist[j].weak && hist[j].subject === lastAsk.subject) misses++; break; }
    }
    /* several reactions in a row: the count itself is what is noticed, so
       the reply changes as the run grows */
    if (inRow >= 3) {
      return { text: "“" + word + "” again — that's " + (inRow + 1) + " in a row" + (same >= inRow ? "" : " with no question") + ". I'm still here" +
                     (lastAsk.subject ? "; if " + lastAsk.subject + (/s$/.test(lastAsk.subject) && !/ss$/.test(lastAsk.subject) ? " are" : " is") + " still the thing, tell me what you're after and I'll try from a new angle" : "; ask me anything") + ".",
               route: "conversation", conversational: true, confidence: 0.7, sources: [] };
    }
    if (lastAsk.weak && misses >= 1 && inRow < 2) {
      var loop = { text: "We're going round in circles on " + (lastAsk.subject || "this") + ": you ask, I say I don't have it, and I don't want to keep repeating that. " +
                         "Two things would break the loop — tell me what you actually want to know about it (the idea, an example, how it's used), " +
                         "or paste a sentence or source about it and I'll reason from that. Or ask me about something related I might know.",
                   route: "conversation", conversational: true, confidence: 0.7, sources: [] };
      /* never the same sentence twice: if that was already said, say less */
      if (said.some(function (t) { return t === loop.text; })) {
        loop.text = "Still no source on " + (lastAsk.subject || "this") + " on my side. Whenever you want, give me something to work from — or change the subject.";
        if (said.some(function (t) { return t === loop.text; })) loop.text = "I'm here when you've got something new to try.";
      }
      return loop;
    }
    if (inRow >= 2) {
      return { text: "You've " + (same >= 2 ? "said “" + word + "”" : "reacted like that") + " a few times now, so I don't think I've given you what you need" +
                     (lastAsk.subject ? " on " + lastAsk.subject : "") + ". What are you actually trying to find out? Put it in your own words and I'll start from there.",
               route: "conversation", conversational: true, confidence: 0.7, sources: [] };
    }
    if (lastAsk.weak) {
      return { text: "Fair reaction — that wasn't a real answer. I don't have anything reliable on " + (lastAsk.subject || "that") +
                     ". If you tell me what you'd like to know about it, or give me a source, I'll work from that.",
               route: "conversation", conversational: true, confidence: 0.7, sources: [] };
    }
    return answerConversation(frame, discourse);
  }

  /* ============================================================ driver */

  var discourse = new Discourse();

  function timed(label, fn) {
    var t0 = now();
    var v = fn();
    state.profile.push({ label: label, ms: now() - t0 });
    return v;
  }
  function now() {
    if (typeof performance !== "undefined" && performance.now) return performance.now();
    return Date.now();
  }

  /* Facts about the entity that were not the answer: what a repeated question
     can add instead of only rewording. */
  function factPool(entity, used) {
    if (!entity || !entity.rel) return [];
    var out = [], seen = Object.create(null), name = displayName(entity), person = entity.type === "person";
    var subj = person ? name : "It";
    Object.keys(entity.rel).forEach(function (k) {
      var v = entity.rel[k];
      if (!v || typeof v !== "string" || k === used || k === "type") return;
      var place = v.replace(/^in\s+/i, ""), s = "";
      switch (k) {
        case "capital": s = "Its capital is " + v; break;
        case "currency": s = "Its currency is " + v; break;
        case "language": s = "People there speak " + v; break;
        case "population": s = subj + " has a population of " + v; break;
        case "continent": case "location": case "country": s = subj + " is in " + place; break;
        case "birth": s = person ? name + " was born on " + v.replace(/^on\s+/i, "") : ""; break;
        case "death": s = person ? name + " died on " + v.replace(/^on\s+/i, "") : ""; break;
        case "creator": s = subj + " was created by " + v; break;
        case "author": s = subj + " was written by " + v; break;
        case "artist": s = subj + " was made by " + v; break;
        case "purpose": s = subj + " is used for " + v; break;
        case "part": s = subj + " is made up of " + v; break;
        case "height": s = subj + " is " + v + " tall"; break;
        case "length": s = subj + " is " + v + " long"; break;
        case "symbol": s = "Its chemical symbol is " + v; break;
        case "capitalOf": s = subj + " is the capital of " + v; break;
      }
      var key = C.flatten(s);
      if (!s || seen[key]) return;
      seen[key] = 1;
      out.push(RZ.terminate(s));
    });
    return out;
  }
  /* The other sentences of the article a web answer came from. */
  function webExtras(graph, claim) {
    var out = [], seen = Object.create(null);
    if (!graph || !graph.props) return out;
    var title = C.flatten(claim.exactTitle || claim.subject), own = C.flatten(claim.object || "").slice(0, 40);
    graph.props.forEach(function (p) {
      if (p === claim || p.source !== claim.source) return;
      if (C.flatten(p.exactTitle || p.subject) !== title && C.flatten(p.subject) !== title) return;
      var t = RZ.cleanClause(p.predicate === "definition" ? p.text : (p.object || p.text));
      if (!t || t.length < 30 || t.length > 320) return;
      var k = C.flatten(t);
      if ((own && k.indexOf(own) >= 0) || seen[k.slice(0, 60)]) return;
      seen[k.slice(0, 60)] = 1;
      out.push(RZ.terminate(t));
    });
    return out.slice(0, 6);
  }
  /* Standing instructions ("from now on, one sentence") shape every frame. */
  function applyDirectives(frame) {
    var d = null;
    try { d = state.memory ? state.memory.directives() : null; } catch (e) { d = null; }
    if (!d) return frame;
    var f = {}, k;
    for (k in frame) f[k] = frame[k];
    if (d.length && !f.requestedLength) { f.requestedLength = d.length; f.requestedUnit = d.unit; }
    if (d.tone && !f.requestedTone) f.requestedTone = d.tone;
    if (d.onlyValue && !f.onlyValue) f.onlyValue = true;
    return f;
  }
  function varyKeyFor(frame) {
    return C.flatten([frame.subject || frame.topic || frame.semanticText || frame.body || "",
                      frame.relation || "", frame.queryForm || "", frame.speechAct || ""].join(" "));
  }

  /* Conversation memory reads every message first: what to remember, what
     to forget, how to answer, and questions about the conversation itself.
     Whatever else the message asks is answered as usual, after it. */
  function answer(text, opts) {
    state.mode = opts && (opts.evaluationMode === "closed" || opts.evaluationMode === "tool") ? opts.evaluationMode : state.defaultMode;
    var M = state.memory, raw = String(text == null ? "" : text);
    if (!M) return answerCore(raw, opts);
    var memo = null;
    try { memo = M.command(raw); } catch (e) { memo = null; }
    if (memo && memo.handled) {
      /* a residual the user did not type (the last question, re-asked by a
         format instruction) is the system asking itself, not a repeat */
      if (memo.residual && C.flatten(raw).indexOf(C.flatten(memo.residual)) < 0) {
        var o2 = {}, k2; for (k2 in (opts || {})) o2[k2] = opts[k2]; o2.internal = true; opts = o2;
      }
      return deliverMemo(memo, opts);
    }
    /* A verb the lexicon does not hold is learned from the dictionaries, then
       the message is read again with its definition. */
    var unknown = [];
    try { unknown = M.unknownVerbs(raw); } catch (e) { unknown = []; }
    if (!unknown.length || !state.federation || off("web")) return answerCore(raw, opts);
    return learnWordList(unknown).then(function () {
      var again = null;
      try { again = M.command(raw); } catch (e) { again = null; }
      return again && again.handled ? deliverMemo(again, opts) : answerCore(raw, opts);
    }, function () { return answerCore(raw, opts); });
  }
  function deliverMemo(memo, opts) {
    if (memo.residual) {
      return answerCore(memo.residual, opts).then(function (r) {
        if (r && memo.text) r.text = memo.text + " " + r.text;
        return r;
      });
    }
    return Promise.resolve({ text: memo.text, route: "memory", confidence: 0.95, sources: [], used: [],
                             memory: memo.act, memoryTurn: true, latency_ms: 0, profile: [],
                             frame: { subject: "", relation: "", form: "memory", fresh: false, act: "memory" } });
  }

  function answerCore(text, opts) {
    opts = opts || {};
    state.varyKey = "";
    state.userText = String(text == null ? "" : text);
    var t0 = now();
    state.profile = [];
    state.stats.turns++;

    var baseFrame = timed("parse", function () { return C.parse(text, discourse.snapshot()); });
    if (baseFrame.empty) {
      var empty = { text: "Ask me anything — a fact, a calculation, an explanation, or something to build.",
                    route: "conversation", confidence: 0.6, conversational: true, sources: [] };
      return Promise.resolve(finish(baseFrame, empty, t0));
    }
    if (baseFrame.safetyClass === "sensitive") {
      return Promise.resolve(finish(baseFrame, {
        text: "I'd rather not go into that one. If you're going through something difficult, talking to someone you trust or a local support line is worth more than anything I can say here.",
        route: "conversation", confidence: 0.9, sources: []
      }, t0));
    }

    /* Conversation awareness. A reaction ("oh", "hmm") answers the last
       exchange, it is not a new question about its topic. A question asked
       before is read again on its own words -- a repeat is not a follow-up,
       so the dialogue context must not drift it -- and what is said depends
       on what happened the last time it was asked. */
    var sig = userSignature(baseFrame);
    state.turnInfo = { sig: sig, rep: [], reaction: false, internal: !!opts.internal };
    if (!off("awareness") && !opts.internal && isReaction(baseFrame)) {
      state.turnInfo.reaction = true;
      return Promise.resolve(finish(baseFrame, answerReaction(baseFrame), t0));
    }
    if (!off("awareness") && !opts.internal) state.turnInfo.rep = repeatsOf(sig);
    var ctx = state.turnInfo.rep.length ?
      { frame: C.parse(text, null), carried: false } :
      timed("dialogue", function () { return resolveContext(baseFrame, discourse); });
    var frame = applyDirectives(ctx.frame);
    /* Comprehension: every word and phrase defined, what is asked and given
       summarised; the summary's query drives research (local and remote). */
    if (CMP && !off("comprehension") && !frame.empty && frame.wordCount <= 80) {
      timed("comprehend", function () {
        try {
          var comp = CMP.read(frame.rawText || frame.body || "");
          frame.comprehension = comp;
          if (comp.query && comp.query.split(" ").length >= 2) frame.searchQueries = [comp.query];
        } catch (e) {}
      });
    }
    state.varyKey = varyKeyFor(frame);
    if (RZ.variation) RZ.variation.begin(state.varyKey);
    var decision = timed("route", function () { return decide(frame, discourse); });
    decision.carried = ctx.carried;

    /* ---- Level 0: deterministic, no retrieval, no network ---- */
    /* Deterministic resolvers run before the social branch: "what time is it
       right now" is a clock question with a chatty shape, and a computation
       is never small talk. */
    var reasoned = timed("reason", function () { return answerReason(frame, decision); });
    if (reasoned) return Promise.resolve(finish(frame, reasoned, t0, decision));
    /* What the message calls for when it is not a question about a thing:
       a feeling, a decision, a comparison, a poem, a how-to, an open
       question, or a social act (c4-lm-converse.js). */
    var conversed = timed("converse", function () { return answerConverse(frame); });
    if (conversed) return Promise.resolve(finish(frame, conversed, t0, decision));
    /* A bare noun phrase is a question, whatever its conversational shape:
       "bookmark social media" is not small talk. It only falls through to
       conversation if nothing can actually answer it. */
    if (!off("depth") && decision.route === "conversation" && !decision.features.social &&
        isDefinitional(frame) && namesAnything(frame)) {
      var asPhrase = timed("local-chain", function () { return localResolvers(frame, decision); });
      if (asPhrase) return Promise.resolve(finish(frame, asPhrase, t0, decision));
    }
    if (!off("depth") && decision.route === "conversation" &&
        (decision.features.social || decision.features.remark)) {
      return Promise.resolve(finish(frame, answerConversation(frame, discourse), t0, decision));
    }
    var comparative = timed("comparative", function () { return answerComparativeFollowup(frame, discourse); });
    if (comparative) return Promise.resolve(finish(frame, comparative, t0, decision));

    /* ---- Level 1: local knowledge ---- */
    var coded = timed("code", function () { return answerCode(frame); });
    if (coded) return Promise.resolve(finish(frame, coded, t0, decision));

    if (decision.features.compare || off("depth")) {
      var cmp = timed("compare", function () { return answerComparison(frame, decision); });
      if (cmp) return Promise.resolve(finish(frame, cmp, t0, decision));
    }
    if (off("depth")) {
      /* No routing shortcut: the site index, the knowledge base and content
         retrieval are all consulted before anything is returned. */
      var forced = timed("forced", function () {
        return answerLocal(frame, decision, { relaxed: true }) ||
               answerListRequest(frame, decision) || answerSuperlative(frame) ||
               answerFromKB(frame, decision) || answerKBByContent(frame, decision);
      });
      if (forced) return Promise.resolve(finish(frame, forced, t0, decision));
    }

    /* A question about CELL4 itself is answered from the site, not from
       general knowledge; everything else prefers knowledge over documents. */
    if (decision.features.aboutSite && !off("depth")) {
      var site = timed("local", function () {
        return answerSiteOverview(frame) || answerLocal(frame, decision, { relaxed: true });
      });
      if (site) return Promise.resolve(finish(frame, site, t0, decision));
      /* A question about CELL4 that this site cannot answer is not a question
         about something else that shares a word. General knowledge must not
         speak over it. */
      return Promise.resolve(finish(frame, fallback(frame, decision), t0, decision));
    }

    /* A definitional question containing a word nothing local knows is a
       question for the dictionaries. Answering it from the words that happen
       to be known produces a confident answer to a different question, so
       the local shortcut is skipped until the unknown word has been looked
       up. */
    var unknownWord = isDefinitional(frame) && hasUnknownWord(frame) &&
                      state.federation && !off("web");

    if (!frame.requiresFreshInformation && !unknownWord) {
      var localAnswer = timed("local-chain", function () { return localResolvers(frame, decision); });
      if (localAnswer) return Promise.resolve(finish(frame, localAnswer, t0, decision));
    }

    /* ---- Level 2/3: evidence from the network, only when warranted ---- */
    /* A definitional question containing a word nothing local knows is a
       question the dictionaries can answer. Learning the word is cheaper and
       more accurate than guessing from the words that ARE known. */
    var needWeb = unknownWord || frame.requiresFreshInformation ||
                  (!off("web") && decision.dist.web > 0.15) ||
                  (!decision.features.kbHit && frame.speechAct === "question");
    if (needWeb && state.federation && !off("web")) {
      /* A definitional question asks both kinds of source: the dictionaries
         for the words, the encyclopedias for the thing. Whichever produces an
         answer that actually identifies what was asked wins. */
      var wordsFirst = isDefinitional(frame) && (unknownWord || !decision.features.kbHit) ?
        learnWords(frame) : Promise.resolve(false);
      return wordsFirst.then(function (learned) {
        if (learned) {
          var fromWords = answerQualified(frame, decision) || answerLexical(frame, decision);
          if (fromWords) return finish(frame, fromWords, t0, decision);
        }
        return answerWeb(frame, decision);
      }).then(function (web) {
        if (!web || web.text === undefined) {
          /* answerWeb already resolved above when it returned an answer. */
        }
        if (web && web.text) return finish(frame, web, t0, decision);
        var late = localResolvers(frame, decision);
        if (late) {
          if (frame.requiresFreshInformation) late.caveat = true;
          return finish(frame, late, t0, decision);
        }
        return finish(frame, fallback(frame, decision), t0, decision);
      });
    }
    var last = localResolvers(frame, decision);
    return Promise.resolve(finish(frame, last || fallback(frame, decision), t0, decision));
  }

  /* Confidence is assembled from the parts that produced the answer, and a
     low-confidence answer is softened rather than asserted. */
  function finish(frame, result, t0, decision) {
    result = result || { text: "", route: "none", confidence: 0 };
    /* The answer-type gate: an answer about a word the message merely
       contains does not do what the message asked (c4-lm-converse.js). */
    var CVg = root.C4LMConverse;
    if (CVg && !off("converse") && !result.memoryTurn && state.userText && !CVg.accepts(state.userText, result)) {
      var alt = null;
      try { alt = CVg.respond(state.userText, { turn: discourse.turns, federated: !!state.federation && !off("web"), looked: true }); } catch (e) { alt = null; }
      result = alt || fallback(frame, null);
      result.gated = true;
    }
    /* A weak first answer gets a second, deliberate reading before it is
       committed; the time it takes is part of the reported latency. */
    if (decision) result = deliberate(frame, decision, result) || result;
    result.latency_ms = Math.round((now() - t0) * 100) / 100;
    result.evaluationMode = state.mode;
    result.frame = {
      subject: frame.subject, relation: frame.relation, form: frame.queryForm,
      fresh: frame.requiresFreshInformation, act: frame.speechAct
    };
    if (decision) {
      result.decision = { route: decision.route, depth: decision.depth,
                          confidence: Math.round(decision.confidence * 100) / 100,
                          margin: Math.round(decision.margin * 100) / 100 };
      result.confidenceFactors = {
        interpretation: Math.round(frame.confidence * 100) / 100,
        routing: Math.round(decision.confidence * 100) / 100,
        answer: result.confidence || 0
      };
    }
    if (frame.comprehension) {
      result.comprehension = { summary: frame.comprehension.summary, query: frame.comprehension.query,
                               glossary: frame.comprehension.glossary.map(function (g) { return { span: g.span, kind: g.kind, gloss: g.gloss }; }) };
    }
    result.profile = state.profile.slice();
    /* Hallucination brake: an uncertain answer says so instead of asserting. */
    if (result.confidence && result.confidence < 0.45 && result.text && !result.insufficient &&
        !result.conversational && !/^(?:i (?:don't|do not)|i'm not sure)/i.test(result.text)) {
      result.text = "I think " + result.text.charAt(0).toLowerCase() + result.text.slice(1) +
        " — though I'd check that one.";
    }
    if (result.caveat === true) {
      result.text += " I could not reach a live source just now, so that is from local knowledge and may be out of date.";
      result.caveat = "stale";
    }
    if (!off("awareness")) {
      result = awareOfRepeat(frame, result, state.turnInfo);
      recordTurn(frame, result, state.turnInfo);
    }
    if (state.memory && result.text && !result.conversational) {
      try { result.text = state.memory.conform(result.text, { route: result.route, code: !!result.code }) || result.text; } catch (e) {}
    }
    if (RZ.variation && state.varyKey && result.text) RZ.variation.commit(state.varyKey, result.text);
    discourse.commit(frame, result);
    if (state.memory) { try { state.memory.observe(state.userText, result); } catch (e) {} }
    return result;
  }

  /* ============================================================== setup */

  function init(opts) {
    opts = opts || {};
    if (KB) KB.build();
    if (C && KB) {
      C.setEntityOracle(function (phrase) {
        var hits = KB.resolve(phrase, { strict: true });
        return hits.length > 0 && hits[0].score >= 0.6;
      });
    }
    if (RT && !state.index) {
      state.index = new RT.Index();
      if (opts.documents && opts.documents.length) state.index.add(opts.documents);
      /* Knowledge-base entries are documents too. A question that describes a
         phenomenon without naming it ("why does metal feel colder than wood")
         finds the entry that explains it through ordinary retrieval, rather
         than needing a phrase-to-entity rule written for it. */
      if (KB) {
        state.index.add(KB.entities().map(function (e) {
          return {
            title: e.name, scope: "kb", source: "local knowledge base", authority: 0.8,
            text: [e.defn, e.aliases.join(" "), e.extra && e.extra.why,
                   e.rel && e.rel.cause, e.rel && e.rel.purpose,
                   e.rel && e.rel.part].filter(Boolean).join(" "),
            entity: e
          };
        }));
      }
      state.index.build();
    }
    if (EV && opts.fetch !== false) {
      state.federation = new EV.Federation({
        fetch: opts.fetch, deadline: opts.deadline || 4000,
        perSourceTimeout: opts.perSourceTimeout || 2500, quorum: opts.quorum || 2,
        earlyCompletion: opts.earlyCompletion !== false
      });
    }
    if (MEM && !state.memory) {
      var store = null;
      if (opts.memoryStorage !== undefined) store = opts.memoryStorage;
      else if (opts.memoryPersist !== false) { try { store = root.localStorage || null; } catch (e) { store = null; } }
      state.memory = new MEM.Memory({ storage: store });
      state.memory.listen({
        resetAll: function () { discourse = new Discourse(); if (C) C._clearCache(); },
        forgetTopics: function (pred) { discourse.forget(pred); if (C) C._clearCache(); },
        focus: function (entity) { discourse.focus(entity); }
      });
    }
    if (RZ && RZ.variation) RZ.variation.seed(opts.seed);
    state.ready = true;
    return state;
  }

  root.C4LM = {
    init: init,
    answer: answer,
    parse: function (t) { return C.parse(t, discourse.snapshot()); },
    decide: function (t) { var f = C.parse(t, discourse.snapshot()); return decide(f, discourse); },
    discourse: function () { return discourse; },
    reset: function () { discourse = new Discourse(); if (C) C._clearCache(); if (state.memory) state.memory.resetSession(); },
    /* Documents can arrive after boot (the page reads its own pages
       asynchronously), so the index accepts late additions. */
    addDocuments: function (docs) {
      if (!RT || !docs || !docs.length) return 0;
      if (!state.index) state.index = new RT.Index();
      state.index.add(docs);
      state.index.build();
      return state.index.size();
    },
    /* The comprehension stage's reading of a text: every word and phrase
       with its gloss, the quantities, what is asked, the summary and the
       research query. */
    comprehend: function (text) { return CMP ? CMP.read(String(text == null ? "" : text)) : null; },
    ablate: function (list) {
      state.ablations = Object.create(null);
      (list || []).forEach(function (k) { state.ablations[k] = 1; });
      /* "early" is enforced inside the federation, not by a branch here. */
      if (state.federation) state.federation.earlyCompletion = !state.ablations.early;
      if (C && C.setNormalization) C.setNormalization(!state.ablations.normalize);
      if (RZ && RZ.variation) RZ.variation.enable(!state.ablations.variation);
      return state.ablations;
    },
    setMode: function (m) { if (m === "closed" || m === "tool") state.defaultMode = state.mode = m; return state.defaultMode; },
    mode: function () { return state.mode; },
    stats: function () { return state.stats; },
    profile: function () { return state.profile.slice(); },
    ready: function () { return state.ready; },
    /* conversation memory, for the page: it reads messages before any other
       module does, and sees the answers that did not come from here */
    command: function (t) {
      if (!state.memory || !state.ready) return null;
      try { return state.memory.command(String(t == null ? "" : t)); } catch (e) { return null; }
    },
    observe: function (t, a) { if (state.memory) { try { state.memory.observe(t, a); } catch (e) {} } },
    conform: function (t, info) {
      if (!state.memory) return t;
      try { return state.memory.conform(t, info || {}) || t; } catch (e) { return t; }
    },
    vary: function (t, key) {
      if (!RZ || !RZ.variation) return t;
      var d = null;
      try { d = state.memory ? state.memory.directives() : null; } catch (e) { d = null; }
      return RZ.variation.text(t, key, d ? { lengthLimit: d.length || 0, lengthUnit: d.unit || "" } : {});
    },
    listen: function (l) { if (state.memory) state.memory.listen(l); },
    memory: function () { return state.memory; },
    seed: function (n) { if (RZ && RZ.variation) RZ.variation.seed(n); },
    state: state
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LM;
})(typeof window !== "undefined" ? window : globalThis);
