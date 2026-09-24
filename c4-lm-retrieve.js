/* CELL4 retrieval 2.0.
 *
 * Two stages. A cheap BM25F sweep produces a shortlist; only the shortlist
 * pays for the expensive features (ordered phrase locks, identity tier,
 * relation compatibility, topical concentration, heading intent). Scoring the
 * whole corpus with the expensive features is what made the old path slow and
 * -- because every signal was lexical -- what let a document about machines
 * and reasoning answer "what is machine reasoning".
 *
 * The distinction this module is built around: IDENTITY is not OVERLAP.
 * A document that mentions a phrase is not a document about it.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;

  function Index(opts) {
    this.docs = [];
    this.df = Object.create(null);
    this.avgLen = 1;
    this.postings = Object.create(null);  /* term -> [doc, tf, doc, tf, ...] (packed once long) */
    this.opts = opts || {};
    this.dirty = true;
    this.built = 0;                       /* documents already indexed */
    this.totalLen = 0;
  }

  /* Postings: a short list is a plain [doc, tf, ...] array; a long one is
     packed into typed arrays (doc ids and frequencies, 6 bytes a posting),
     which is what keeps a corpus of hundreds of thousands of documents in
     bounded memory. The values are the same either way. */
  function post(P, t, id, f) {
    var L = P[t];
    if (!L) { P[t] = [id, f]; return; }
    if (L.ids) {
      if (L.n === L.ids.length) {
        var ni = new Int32Array(L.n * 2), nf = new Uint16Array(L.n * 2);
        ni.set(L.ids); nf.set(L.tfs); L.ids = ni; L.tfs = nf;
      }
      L.ids[L.n] = id; L.tfs[L.n] = f > 65535 ? 65535 : f; L.n++;
      return;
    }
    L.push(id, f);
    if (L.length >= 256) {
      var ids = new Int32Array(256), tfs = new Uint16Array(256);
      for (var i = 0; i < L.length; i += 2) { ids[i >> 1] = L[i]; tfs[i >> 1] = L[i + 1] > 65535 ? 65535 : L[i + 1]; }
      P[t] = { ids: ids, tfs: tfs, n: L.length >> 1 };
    }
  }

  /* A document's derived forms (flattened title and text, term frequencies)
     are computed when they are read, not stored for every document: only a
     shortlist ever reads them, and a large corpus would otherwise hold
     several copies of its whole text. A document may give its text as a
     function of its source record (textOf), so the text itself is not
     copied either. */
  function termFreq(d) {
    var tf = Object.create(null), j, tTok = C.indexTokens(d.title).map(C.stem), bTok = C.indexTokens(d.text).map(C.stem);
    for (j = 0; j < tTok.length; j++) tf[tTok[j]] = (tf[tTok[j]] || 0) + 3;   /* title weight */
    for (j = 0; j < bTok.length; j++) tf[bTok[j]] = (tf[bTok[j]] || 0) + 1;
    return { tf: tf, len: tTok.length + bTok.length };
  }
  var DocProto = {};
  Object.defineProperty(DocProto, "text", {
    get: function () { return this._text !== undefined ? this._text : String(this.ref.textOf(this.ref) || ""); },
    set: function (v) { this._text = v; }
  });
  Object.defineProperty(DocProto, "flatTitle", {
    get: function () { return this._fT !== undefined ? this._fT : (this._fT = C.flatten(this.title)); },
    set: function (v) { this._fT = v; }
  });
  Object.defineProperty(DocProto, "flatText", {
    get: function () { return this._fX !== undefined ? this._fX : (this._fX = C.flatten(this.text)); },
    set: function (v) { this._fX = v; }
  });
  Object.defineProperty(DocProto, "tf", {
    get: function () { return this._tf || (this._tf = termFreq(this).tf); },
    set: function (v) { this._tf = v; }
  });

  /* A document is {id, title, text, source, scope, url}. Fields are weighted:
     a term in the title says more about what the document is ABOUT than the
     same term buried in the body. */
  Index.prototype.add = function (docs) {
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      if (!d) continue;
      var doc = Object.create(DocProto);
      doc.id = this.docs.length;
      doc.title = String(d.title || d.h || "");
      if (typeof d.textOf !== "function") doc.text = String(d.text || d.t || "");
      doc.source = d.source || d.s || "";
      doc.scope = d.scope || "";
      doc.url = d.url || d.s || "";
      doc.kind = d.kind || "";
      doc.authority = d.authority == null ? 0.5 : d.authority;
      doc.ref = d;
      this.docs.push(doc);
    }
    this.dirty = true;
    return this.docs.length;
  };

  /* Incremental: only the documents added since the last build are
     tokenised; document frequencies and postings grow in place, so the
     result is the same as indexing everything at once. */
  Index.prototype.build = function () {
    if (!this.dirty) return;
    this.dirty = false;
    var learn = [];
    for (var i = this.built; i < this.docs.length; i++) {
      var d = this.docs[i], r = termFreq(d);
      d.len = r.len;
      this.totalLen += r.len;
      for (var t in r.tf) {
        this.df[t] = (this.df[t] || 0) + 1;
        post(this.postings, t, i, r.tf[t]);
      }
      if (!d.ref.noVocabulary) learn.push(d.title + " " + d.text);
    }
    this.built = this.docs.length;
    this.avgLen = this.totalLen / Math.max(1, this.docs.length);
    if (C && learn.length) C.learnVocabulary(learn);
  };

  /* Stage 1: BM25F over the posting lists only. Documents that share no
     content term with the query are never visited. */
  Index.prototype.candidates = function (frame, limit) {
    this.build();
    var k1 = 1.4, b = 0.72;
    var N = this.docs.length;
    var terms = frame.contentStems.length ? frame.contentStems : frame.stems;
    terms = terms.concat(C.indexTokens(frame.contentTokens.join(" ")).map(C.stem))
      .filter(function (t, i, a) { return a.indexOf(t) === i; });
    var scores = Object.create(null);
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      var L = this.postings[t];
      if (!L) continue;
      var idf = Math.log(1 + (N - this.df[t] + 0.5) / (this.df[t] + 0.5));
      var n = L.ids ? L.n : L.length >> 1;
      for (var j = 0; j < n; j++) {
        var id = L.ids ? L.ids[j] : L[2 * j], f = (L.ids ? L.tfs[j] : L[2 * j + 1]) || 0;
        var d = this.docs[id];
        var s = idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / this.avgLen));
        scores[id] = (scores[id] || 0) + s;
      }
    }
    var out = [];
    for (var id in scores) out.push({ doc: this.docs[id], bm25: scores[id] });
    out.sort(function (x, y) { return y.bm25 - x.bm25; });
    return out.slice(0, limit || 24);
  };

  /* ------------------------------------------------------ identity tiers */

  var TIER = { TITLE_EQUAL: 5, TITLE_HEAD: 4, DEFINES: 3, PHRASE: 2, OVERLAP: 1, NONE: 0 };

  /* Does this document DEFINE the asked concept, or merely contain its words?
     A definition puts the concept at the head of a sentence, a heading or a
     list item, followed by a copula. Position, not containment. */
  function definesConcept(doc, conceptFlat) {
    if (!conceptFlat) return true;               /* nothing specific was asked */
    if (doc.flatTitle === conceptFlat) return true;
    var esc = conceptFlat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[^a-z0-9]+");
    var re = new RegExp("(?:^|[.!?:;]\\s+|\\n\\s*[-*\\u2022]?\\s*)(?:the\\s+|a\\s+|an\\s+)?" + esc +
                        "\\b[^.!?]{0,40}?\\b(?:is|are|was|were|means|refers to|describes|denotes)\\b", "i");
    return re.test(doc.title + ". " + doc.text);
  }

  /* The names a document gives its own subject: a parenthetical in the
     title ("Deoxyribonucleic acid (DNA)") and the lead sentence's "also
     known as" / "abbreviated" / "(X)" forms. Read from the document, not
     from a synonym list. */
  function aliasesOf(doc) {
    if (doc._aliases) return doc._aliases;
    var out = [], m, re;
    var tm = String(doc.title).match(/^(.*?)\s*\(([^)]{1,40})\)\s*$/);
    if (tm) { out.push(C.flatten(tm[1])); out.push(C.flatten(tm[2])); }
    var lead = String(doc.text).slice(0, 300).split(/(?<=[.!?])\s/)[0] || "";
    re = /\b(?:also (?:known|called|referred to) as|abbreviated(?: as)?|or simply|short for)\s+(?:the\s+)?["']?([A-Za-z0-9][\w\- ]{0,40}?)["']?(?=[,.;)]|\s+(?:is|are|was|were)\b)/gi;
    while ((m = re.exec(lead))) out.push(C.flatten(m[1]));
    var pm = lead.match(/^(?:the\s+)?([^(]{2,60}?)\s*\(([A-Za-z0-9][^()]{0,30})\)/i);
    if (pm) { out.push(C.flatten(pm[1])); out.push(C.flatten(pm[2].split(/[;,]/)[0])); }
    doc._aliases = out.filter(function (a, i) { return a && a.length > 1 && out.indexOf(a) === i; });
    return doc._aliases;
  }

  function identityTier(frame, doc) {
    var asked = frame.subject ? C.flatten(frame.subject) :
                (frame.topic ? C.flatten(frame.topic) : C.flatten(frame.contentTokens.join(" ")));
    if (!asked) return TIER.NONE;
    var title = doc.flatTitle;
    if (title === asked) return TIER.TITLE_EQUAL;
    /* the document's own alias for its subject is the same identity */
    if (asked.length > 1 && aliasesOf(doc).indexOf(asked) >= 0) return TIER.TITLE_HEAD;
    var at = asked.split(" "), tt = title.split(" ");
    /* Head containment: the asked phrase leads the title in order. A title
       that merely contains the words in some other arrangement ("High School
       High" for "high school") is not the same concept. */
    if (tt.length >= at.length) {
      var head = true;
      for (var i = 0; i < at.length; i++) if (tt[i] !== at[i]) { head = false; break; }
      /* A title that REPEATS one of the asked words in its remainder is a
         different construction, not a narrower sense of the same one:
         "High School High" is a film title, not a kind of high school. */
      var repeats = false;
      for (var k = at.length; k < tt.length; k++) if (at.indexOf(tt[k]) >= 0) repeats = true;
      if (head && !repeats && tt.length - at.length <= 2) return TIER.TITLE_HEAD;
      if (head && repeats) return TIER.OVERLAP;
    }
    if (definesConcept(doc, asked)) return TIER.DEFINES;
    if ((" " + doc.flatText + " ").indexOf(" " + asked + " ") >= 0) return TIER.PHRASE;
    return TIER.OVERLAP;
  }

  /* Ordered phrase lock: the query's content words appear in the document in
     the same order, within a small window. Distinguishes "machine reasoning"
     from "reasoning about machines". */
  function orderedPhrase(words_, text, gap) {
    if (words_.length < 2) return 0;
    var pos = 0, hits = 0, maxGap = gap || 4;
    var toks = text.split(" ");
    var idx = toks.indexOf(words_[0], 0);
    while (idx >= 0) {
      var cur = idx, ok = true;
      for (var i = 1; i < words_.length; i++) {
        var nxt = toks.indexOf(words_[i], cur + 1);
        if (nxt < 0 || nxt - cur > maxGap) { ok = false; break; }
        cur = nxt;
      }
      if (ok) { hits++; break; }
      idx = toks.indexOf(words_[0], idx + 1);
      if (++pos > 40) break;
    }
    return hits ? 1 : 0;
  }

  function charTrigramSim(a, b) {
    function tri(s) {
      s = " " + String(s) + " ";
      var out = Object.create(null), n = 0;
      for (var i = 0; i + 3 <= s.length; i++) { var g = s.substr(i, 3); if (!out[g]) { out[g] = 1; n++; } }
      return { set: out, n: n };
    }
    var A = tri(a), B = tri(b), shared = 0;
    for (var g in A.set) if (B.set[g]) shared++;
    return (2 * shared) / Math.max(1, A.n + B.n);
  }

  /* Query-term concentration: how much of the document is about the query.
     A long document that mentions the phrase once is less "about" it than a
     short one that mentions it repeatedly. */
  function concentration(frame, doc) {
    var hits = 0;
    for (var i = 0; i < frame.contentStems.length; i++) hits += (doc.tf[frame.contentStems[i]] || 0);
    return hits / Math.sqrt(Math.max(20, doc.len));
  }

  /* Stage 2: rerank the shortlist only. */
  Index.prototype.rank = function (frame, opts) {
    opts = opts || {};
    var shortlist = this.candidates(frame, opts.pool || 24);
    var askedFlat = frame.subject ? C.flatten(frame.subject) : C.flatten(frame.topic || "");
    var askedWords = askedFlat ? askedFlat.split(" ").map(C.stem) : [];
    var relation = frame.relation;
    var subq = (frame.comparands || []).concat(frame.searchQueries || []).map(function (x) { return C.flatten(x).split(" ").map(C.stem); })
      .filter(function (w) { return w.length > 1 && w.join(" ") !== askedWords.join(" "); }).slice(0, 4);
    var out = [];
    for (var i = 0; i < shortlist.length; i++) {
      var doc = shortlist[i].doc;
      var tier = identityTier(frame, doc);
      var phrase = askedWords.length > 1 ?
        orderedPhrase(askedWords, (doc.flatTitle + " " + doc.flatText).split(" ").map(C.stem).join(" ")) : 0;
      var conc = concentration(frame, doc);
      var titleSim = askedFlat ? charTrigramSim(askedFlat, doc.flatTitle) : 0;
      /* subqueries: the comparands / decomposed research queries, each an
         ordered phrase the document may state */
      var sub = 0;
      for (var q = 0; q < subq.length && !sub; q++)
        sub = orderedPhrase(subq[q], (doc.flatTitle + " " + doc.flatText).split(" ").map(C.stem).join(" "));

      /* Relation compatibility: when the question asks for a relation, a
         document that states that relation outranks one that merely shares
         the subject's name. */
      var relBonus = 0;
      if (relation) {
        var relRe = new RegExp("\\b" + relation + "|\\b" + (C.relations.filter(function (r) { return r.id === relation; })[0] || { heads: [] })
          .heads.map(function (h) { return h.replace(/ /g, "[^a-z]+"); }).join("|\\b"), "i");
        if (relRe.test(doc.title + " " + doc.text)) relBonus = 0.6;
      }

      /* An intent mismatch in the heading is a penalty, not a filter: a
         "Troubleshooting" page is rarely the answer to "what is X". */
      var headPenalty = 0;
      if (frame.queryForm === "whatis" && /\b(?:troubleshoot|changelog|release notes|faq|errata|index of|list of)\b/i.test(doc.title)) headPenalty = 0.8;

      var score =
        0.55 * shortlist[i].bm25 +
        1.60 * tier +
        1.10 * phrase +
        0.80 * conc +
        1.20 * titleSim +
        relBonus +
        0.40 * (doc.authority || 0) +
        0.50 * sub -
        headPenalty;

      out.push({
        doc: doc, score: score, tier: tier, bm25: shortlist[i].bm25,
        phrase: phrase, concentration: conc, titleSim: titleSim, relation: relBonus > 0, subquery: sub
      });
    }
    /* Identity dominance for "what is X": a document whose title IS the
       asked concept (or its own alias for it) outranks every document that
       merely overlaps, however many query words the latter repeats. */
    var identityFirst = opts.definitional || frame.queryForm === "whatis";
    out.sort(function (a, b) {
      if (identityFirst) { var ia = a.tier >= TIER.TITLE_HEAD ? 1 : 0, ib = b.tier >= TIER.TITLE_HEAD ? 1 : 0; if (ia !== ib) return ib - ia; }
      return b.score - a.score;
    });

    /* Identity gate. A definitional question may only be answered by a
       document that reaches the DEFINES tier; overlap alone is refused. This
       is the general form of the fix that used to be one regex per failure. */
    if (opts.definitional) {
      out = out.filter(function (r) { return r.tier >= TIER.DEFINES; });
    }
    return out.slice(0, opts.limit || 6);
  };

  Index.prototype.size = function () { return this.docs.length; };

  root.C4LMRetrieve = {
    Index: Index,
    TIER: TIER,
    definesConcept: definesConcept,
    aliasesOf: aliasesOf,
    orderedPhrase: orderedPhrase,
    charTrigramSim: charTrigramSim
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMRetrieve;
})(typeof window !== "undefined" ? window : globalThis);
