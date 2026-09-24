/* CELL4 cross-referencing: relations learned from examples, applied to new
 * items, with the reasoning shown -- and a session memory of what the user
 * paired.
 *
 *   "Red, Yellow = Ketchup, Mustard"        the pairs are stored (user
 *                                           provenance) and cross-checked
 *   "Green = ?"                             the relation the examples share
 *                                           is induced and applied
 *   "hot : cold :: big : ?"                 a one-example analogy
 *   "What did I pair with Blue?"            session memory, either direction
 *   "Why is Red Ketchup?"                   the chain that links them
 *   "What color is ketchup?" / "Is snow black?" / "Name something yellow"
 *   "What do ketchup and mustard have in common?"
 *
 * How a relation is found (no stored pattern, no stored answer): for each
 * example pair the reference dataset (c4-dataset.js, WordNet 3.1) and the
 * local knowledge base are searched for what links the two sides:
 *   kb        a knowledge-base relation (capital, currency, language ...)
 *   pointer   a typed WordNet link (opposite-of, part-of, kind-of ...), with
 *             similar-to and kind-of steps tolerated at the ends
 *   template  one side's definition names the other with the same wording
 *             ("puppy: a YOUNG dog" -> "YOUNG ... cat" -> kitten)
 *   attribute the left sides are values of one attribute class (colors,
 *             shapes, tastes: whatever the dataset files under "attribute")
 *             and the right sides are things whose definitions -- directly
 *             or one definition away -- carry that value
 * The family that explains the most pairs wins; each pair is reported as
 * confirmed by the dataset or kept as the user's own association. Nothing a
 * user says is ever written into the dataset (zero poisoning).
 * Local, deterministic, no model, no API key.
 */
(function (root) {
  "use strict";
  function get(n) { return root[n] || null; }
  function DSW() { var D = get("C4Dataset"); return D && D.available() ? D.wordnet : null; }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function clean(s) { return String(s == null ? "" : s).replace(/[’‘]/g, "'").replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim(); }
  function low(s) { return String(s || "").toLowerCase().trim(); }
  function art(w) { return /^[aeiou]/i.test(w) ? "an " : "a "; }
  function quote(s) { return "“" + String(s).replace(/\s+/g, " ").trim() + "”"; }
  function head(syn) { return syn.words[0]; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  var STOP = /^(?:a|an|the|of|or|and|with|from|in|on|by|for|to|as|that|which|who|is|are|was|be|being|its|it|their|any|some|various|especially|usually|often|used|made|having|has|one|two|several|many|very|more|most|other|such|than|into|at|out|up|not|no|also|like|similar|kind|type|sort|form|part|member|genus|family|etc|e\.g\.)$/;

  /* ----------------------------------------------------------- parsing */
  var ITEM = /^[a-z][a-z' -]{0,40}$/i;
  function items(s) {
    var xs = clean(s).replace(/[.!]+$/, "").split(/\s*(?:,|\band\b|&|\/|;)\s*/i).map(function (x) { return x.trim().replace(/^(?:a|an|the)\s+/i, ""); }).filter(Boolean);
    return xs;
  }
  function isQ(s) { return /^\s*(?:\?+|what|which|_+|blank|x)\s*\??\s*$/i.test(s); }
  function goodItems(xs) { return xs.length && xs.every(function (x) { return ITEM.test(x) && x.split(/\s+/).length <= 3 && !/^[a-z]$/i.test(x); }); }

  function analyze(text) {
    var t = clean(text), l = low(t).replace(/[?.!]+$/, "").trim(), m, correction = false;
    if (!t) return null;
    if ((m = t.match(/^(?:actually|no|correction|wait|oops|sorry|i meant)[,:!]?\s+(?:i meant\s+)?(.+=.+)$/i))) { t = m[1]; l = low(t).replace(/[?.!]+$/, "").trim(); correction = true; }
    /* analogies: "A is to B as C is to ?", "A : B :: C : ?" */
    if ((m = l.match(/^(?:if\s+)?(.+?)\s+is\s+to\s+(.+?)\s*,?\s+(?:as|then|what is)\s+(.+?)\s+is\s+to\s*(?:what|\?|_+|blank)?$/)) ||
        (m = l.match(/^(.+?)\s*:\s*(.+?)\s*::\s*(.+?)\s*:\s*(?:\?|what|_+|x)?$/)))
      if (goodItems([m[1], m[2], m[3]])) return { kind: "analogy", pairs: [[m[1], m[2]]], query: [m[3]] };
    /* statements and queries: "Red, Yellow = Ketchup, Mustard. Green = ?" */
    var sents = t.split(/(?<=[.!?])\s+(?=[A-Za-z])/), stmts = [], query = null;
    for (var i = 0; i < sents.length; i++) {
      var s = sents[i].trim();
      if ((m = s.match(/^(.+?)\s*(?:=|→|->|=>)\s*(.*)$/))) {
        var L = items(m[1]), rhs = m[2].replace(/[.!]+$/, "").trim();
        if (!goodItems(L)) return null;
        if (!rhs || isQ(rhs) || /\?\s*$/.test(rhs) && items(rhs.replace(/\?+$/, "")).every(isQ)) { query = L; continue; }
        var R = items(rhs.replace(/\?+$/, ""));
        if (!goodItems(R) || R.length !== L.length) return null;
        stmts.push(L.map(function (x, k) { return [x, R[k]]; }));
      } else if (stmts.length || query) {
        var more = followUp(low(s).replace(/[?.!]+$/, ""));
        if (more) return { kind: "compound", stmts: stmts, then: more };
        return null;
      } else return i === 0 ? single(l) : null;
    }
    if (stmts.length || query) return { kind: query ? "apply" : "state", stmts: stmts, query: query, correction: correction };
    return single(l);
  }
  function followUp(l) {
    var m;
    if ((m = l.match(/^(?:so\s+|then\s+|and\s+)?what(?:'s| is| goes with| about)\s+(.+?)$/)) && goodItems([m[1]])) return { kind: "apply", stmts: [], query: [m[1]] };
    return null;
  }
  function single(l) {
    var m;
    l = l.replace(/\b(?:a|an|the)\s+/g, "");
    /* recall, either direction */
    if ((m = l.match(/^(?:and |so |ok |okay |wait,? )?what (?:did i (?:pair|match|link|put|say goes|say went)|was (?:paired|matched|linked|put)|goes|went|is paired|was) with (.+?)(?: again| earlier| before)?$/)) ||
        (m = l.match(/^(?:and |so )?what (?:did|does) (.+?) (?:map|go|pair|correspond|match) (?:to|with)(?: again| earlier)?$/)) ||
        (m = l.match(/^(?:and |so )?what(?:'s| is| was) (.+?) (?:paired|matched|mapped|linked) (?:with|to)(?: again| earlier)?$/)))
      return goodItems([m[1]]) ? { kind: "recall", item: m[1], want: null } : null;
    if ((m = l.match(/^(?:and |so )?which (\w+) (?:went|goes|was paired|did i pair|is paired|matched|was matched|did i match) with (.+?)(?: again| earlier)?$/)))
      return goodItems([m[2]]) ? { kind: "recall", item: m[2], want: m[1] } : null;
    if (/^what (?:pairs|mappings|matches) (?:did i give you|have i given you|do you remember|have i made)|^(?:list|show) (?:my|the) (?:pairs|mappings)/.test(l)) return { kind: "list" };
    if ((m = l.match(/^(?:please )?(?:forget|remove|delete|drop|undo)(?: the)?(?: pair(?:ing)?s?)?(?: for| with| about)? (.+?)(?: pair(?:ing)?)?$/)) && goodItems([m[1]]))
      return { kind: "forget", item: m[1] };
    if ((m = l.match(/^what (?:was|is|were) (?:the |my )?(first|second|third|fourth|fifth|last|latest|previous|most recent) (?:pair|pairing|mapping|thing i paired|one)$/)))
      return { kind: "nth", which: m[1] };
    if ((m = l.match(/^what about (.+?)$/)) && goodItems([m[1]])) return { kind: "apply", stmts: [], query: [m[1]], soft: true };
    /* why a pair holds */
    if ((m = l.match(/^why (?:is|does|did|would|should) (.+?) (?:=\s*|equal |equals |mean |go with |goes with |map to |pair with |match |become )?(.+?)$/)) && goodItems([m[1], m[2]]))
      return { kind: "why", a: m[1], b: m[2] };
    /* attribute questions */
    if ((m = l.match(/^what (\w+) (?:is|are|was|were) (?:a |an |the )?(.+?)$/)) && goodItems([m[2]]) && !/^(?:time|day|year|kind|type|sort|number|size of)$/.test(m[1]))
      return { kind: "attr", attr: m[1], subject: m[2] };
    if ((m = l.match(/^(?:is|are|was|were) (?:a |an |the )?(.+?) (\w+)$/)) && goodItems([m[1]]))
      return { kind: "isattr", subject: m[1], value: m[2] };
    if ((m = l.match(/^(?:name|give me|tell me|list|show me|what(?:'s| is| are)) (?:something|some things|a thing|things|an object|objects|anything|one thing|an example of something|examples of things|stuff) (?:that (?:is|are|'s)|which (?:is|are)|that's) (.+?)$/)) ||
        (m = l.match(/^(?:name|give me|tell me) (?:something|a thing|some things|things) (\w+)$/)))
      return goodItems([m[1]]) ? { kind: "name", value: m[1] } : null;
    if ((m = l.match(/^what do (.+?) and (.+?) have in common$|^how (?:are|is) (.+?) and (.+?) (?:alike|similar|related|connected)$|^what(?:'s| is) the (?:connection|link|relation|relationship) between (.+?) and (.+?)$/)))
      return goodItems([m[1] || m[3] || m[5], m[2] || m[4] || m[6]]) ? { kind: "common", a: m[1] || m[3] || m[5], b: m[2] || m[4] || m[6] } : null;
    return null;
  }

  /* --------------------------------------------------------- dataset use */
  function nounSenses(w, term, max) { return w.senses(term, "noun").filter(function (x) { return x.rank < (max || 3); }); }
  function allSenses(w, term, max) { return w.senses(term).filter(function (x) { return x.rank < (max || 3); }); }
  function lemmaOf(w, tok) {
    var out = [tok], asNoun = !!w.index.noun[tok];
    ["noun", "adj", "verb"].forEach(function (f) {
      if (asNoun && f !== "noun") return;
      w.lemmas(tok, f).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x.replace(/_/g, " ")); });
    });
    return out;
  }
  /* The first value a definition carries, directly or one definition away:
     "ketchup: sauce made from tomatoes" -> "tomato: ... red ..." */
  function reach(w, starts, isValue, maxDepth) {
    var best = null;
    function consider(c) {
      if (!best || c.depth < best.depth || (c.depth === best.depth && (c.rank < best.rank || (c.rank === best.rank && c.index < best.index)))) best = c;
    }
    function scan(s, depth, chain, rank) {
      var toks = get("C4Dataset").tokens(s.def);
      for (var i = 0; i < toks.length; i++) {
        var v = describing(toks, i) && !(depth > 0 && toks[i + 1] && w.index.noun[toks[i] + "_" + toks[i + 1]]) ? isValue(toks[i]) : null;
        if (v) {
          var alt = toks[i + 1] === "or" && toks[i + 2] ? isValue(toks[i + 2]) : null;
          consider({ value: v, alt: alt && alt !== v ? alt : null, depth: depth, rank: rank, index: i, chain: chain.concat([{ syn: s, token: toks[i] }]) });
          break;
        }
      }
      if (depth >= maxDepth || (best && best.depth <= depth)) return;
      var seen = 0;
      for (var j = 0; j < toks.length && seen < 8; j++) {
        if (STOP.test(toks[j]) || /-/.test(toks[j]) || toks[j].length < 3) continue;
        /* only physical things carry visible properties on to what they
           make up ("tomatoes" -> tomato), not numbers or ideas */
        var ns = lesk(w, toks[j], s, 4).filter(function (x) { return isPhysical(w, x.syn); }).slice(0, 1);
        if (!ns.length) continue;
        seen++;
        ns.forEach(function (x) { if (x.syn !== s) scan(x.syn, depth + 1, chain.concat([{ syn: s, token: toks[j] }]), rank); });
      }
    }
    starts.forEach(function (x) { scan(x.syn, 0, [], x.rank); });
    return best;
  }
  /* The sense of a word in context (the Lesk method): the one whose
     definition shares the most content words with the definition it was
     read in ("plasma" in blood's definition is the fluid of the blood, not
     the green chalcedony). Sense order breaks ties. */
  function lesk(w, word, ctxSyn, max) {
    var ctx = Object.create(null);
    get("C4Dataset").tokens(ctxSyn.def).concat(ctxSyn.words.map(low)).forEach(function (t) { if (!STOP.test(t) && t.length > 2) ctx[lemmaOfPlain(t)] = 1; });
    return nounSenses(w, word, max || 4).map(function (x) {
      var ov = 0;
      get("C4Dataset").tokens(x.syn.def).forEach(function (t) { if (ctx[lemmaOfPlain(t)] && !STOP.test(t)) ov++; });
      return { syn: x.syn, rank: x.rank, lemma: x.lemma, score: ov * 2 - x.rank * 0.5 };
    }).sort(function (a, b) { return b.score - a.score; });
  }
  /* A value word describes only when it modifies what follows ("white
     nutritious liquid", "red or yellow pulpy fruit"), not when it is itself
     the thing named after a preposition ("grains of rock or coral"). */
  var PREP = /^(?:of|from|with|in|on|by|for|to|as|at|into|like|than|and|or)$/;
  function describing(toks, i) {
    var j = i + 1;
    while (j < toks.length && /^(?:or|and|to)$/.test(toks[j]) && j + 1 < toks.length) j += 2;
    if (j >= toks.length) return false;                        /* "... rock or coral" */
    if (/^(?:of|than|and|or)$/.test(toks[j])) return false;     /* "coral of ..." names a thing */
    if (i > 0 && /^(?:of|from|with|by|like|into|as)$/.test(toks[i - 1])) return false;
    return true;
  }
  function chainText(ch, subj) {
    /* "ketchup is 'thick spicy sauce made from tomatoes', and a tomato is
       'mildly acid red or yellow pulpy fruit ...'" */
    var parts = ch.map(function (c, i) {
      var who = i === 0 ? subj : c.syn.words.filter(function (x) { return low(x) === low(ch[i - 1].token) || lemmaOfPlain(ch[i - 1].token) === low(x); })[0] || head(c.syn);
      return (i === 0 ? who : art(who) + who) + " is " + quote(firstDef(c.syn.def));
    });
    return parts.join(", and ");
  }
  function lemmaOfPlain(t) { t = low(t); return t.replace(/ies$/, "y").replace(/(?:ches|shes|xes|ses|oes)$/, function (x) { return x.slice(0, -2); }).replace(/([^s])s$/, "$1"); }
  function firstDef(d) { return String(d).split(/\s*;\s*/)[0]; }

  /* the attribute classes the dataset files under "attribute" */
  var CACHE = { attrRoot: null, closures: {}, values: {} };
  function attrRoot(w) {
    if (CACHE.attrRoot) return CACHE.attrRoot;
    /* the taxonomy's own category: the sense of "attribute" nearest the top */
    var s = nounSenses(w, "attribute", 9).sort(function (x, y) { return w.above(x.syn, 20).length - w.above(y.syn, 20).length; })[0];
    return (CACHE.attrRoot = s ? s.syn : null);
  }
  /* the taxonomy's top-level split (physical entity / abstraction), found
     the same way as "attribute": the sense nearest the top */
  function topSense(w, word) {
    var k = "top:" + word;
    if (!(k in CACHE)) { var s = nounSenses(w, word, 9).sort(function (x, y) { return w.above(x.syn, 20).length - w.above(y.syn, 20).length; })[0]; CACHE[k] = s ? s.syn : null; }
    return CACHE[k];
  }
  function under(w, syn, rootSyn) { return !!rootSyn && (syn.offset === rootSyn.offset || w.above(syn, 20).some(function (a) { return a.syn.offset === rootSyn.offset; })); }
  function isPhysical(w, syn) { return syn.pos === "n" && under(w, syn, topSense(w, "physical entity")); }
  function topKind(w, syn) { var up = w.above(syn, 20); return up.length >= 2 ? up[up.length - 2].syn.offset : syn.offset; }
  function isUnderAttribute(w, syn) {
    var r = attrRoot(w);
    return !!r && w.above(syn, 20).some(function (a) { return a.syn.offset === r.offset; });
  }
  function closure(w, syn, limit) {
    var k = syn.pos + syn.offset + ":" + (limit || 0);
    if (!CACHE.closures[k]) {
      var below = w.below(syn, limit || 20000);
      CACHE.closures[k] = { list: below, set: below.reduce(function (o, x) { o[x.offset] = 1; return o; }, Object.create(null)), full: !limit || below.length < limit };
    }
    return CACHE.closures[k];
  }
  /* the words that name a value of an attribute class: every lemma below
     it, plus adjectives whose attribute link points into it */
  function valueWords(w, syn) {
    var k = syn.offset;
    if (CACHE.values[k]) return CACHE.values[k];
    var set = Object.create(null), cl = closure(w, syn, 3000);
    cl.list.forEach(function (x) { if (x !== syn) x.words.forEach(function (v) { if (!/\s/.test(v)) set[low(v)] = low(x.words[0]); }); });
    /* the dataset's attribute links: "color" -> colored / colorless, and
       the adjectives similar to those */
    cl.list.slice(0, 50).forEach(function (x) {
      w.follow(x, "=").forEach(function (a) {
        /* the linked head adjectives themselves (colored, colorless) -- not
           everything similar to them ("hot", "vivid") */
        a.words.forEach(function (v) { if (!/\s/.test(v) && !set[low(v)]) set[low(v)] = low(v); });
      });
    });
    return (CACHE.values[k] = set);
  }
  function valueTester(w, set) {
    return function (tok) {
      if (set[tok]) return tok;
      /* a shade: "dark-blue" is blue ("yellow-flowered" is not yellow) */
      var hy = tok.split("-");
      if (hy.length === 2 && set[hy[1]] && w.index.adj[hy[0]]) return hy[1];
      var ls = lemmaOf(w, tok);
      for (var i = 0; i < ls.length; i++) if (set[ls[i]]) return ls[i];
      return null;
    };
  }
  /* lowest common kind-of ancestor of several terms' senses, and its depth */
  function commonKind(w, terms, maxClosure, maxRank) {
    var per = terms.map(function (t) {
      var m = Object.create(null);
      nounSenses(w, t, maxRank || 3).forEach(function (x) {
        m[x.syn.offset] = { syn: x.syn, d: 0, rank: x.rank };
        w.above(x.syn, 18).forEach(function (a) { var o = a.syn.offset; if (!m[o] || m[o].d > a.depth) m[o] = { syn: a.syn, d: a.depth, rank: x.rank }; });
      });
      return m;
    });
    if (!per.length || per.some(function (m) { return !Object.keys(m).length; })) return null;
    var best = null;
    Object.keys(per[0]).forEach(function (o) {
      if (!per.every(function (m) { return m[o]; })) return;
      var worst = Math.max.apply(null, per.map(function (m) { return m[o].d; })), rk = per.reduce(function (s, m) { return s + m[o].rank; }, 0);
      if (!best || worst < best.depth || (worst === best.depth && rk < best.rank)) best = { syn: per[0][o].syn, depth: worst, rank: rk };
    });
    if (!best) return null;
    if (maxClosure && !closure(w, best.syn, maxClosure).full) return null;
    return best;
  }
  /* every shared kind, shallowest first (the pairs' evidence picks one) */
  function commonKinds(w, terms, maxClosure, maxRank, limit) {
    var per = terms.map(function (t) {
      var m = Object.create(null);
      nounSenses(w, t, maxRank || 3).forEach(function (x) {
        m[x.syn.offset] = { syn: x.syn, d: 0 };
        w.above(x.syn, 18).forEach(function (a) { var o = a.syn.offset; if (!m[o] || m[o].d > a.depth) m[o] = { syn: a.syn, d: a.depth }; });
      });
      return m;
    });
    if (!per.length) return [];
    return Object.keys(per[0]).filter(function (o) { return per.every(function (m) { return m[o]; }); })
      .map(function (o) { return { syn: per[0][o].syn, depth: Math.max.apply(null, per.map(function (m) { return m[o].d; })) }; })
      .filter(function (k) { return !maxClosure || closure(w, k.syn, maxClosure).full; })
      .sort(function (x, y) { return x.depth - y.depth; }).slice(0, limit || 4);
  }
  /* how far two synsets are from their nearest shared kind (null: none
     within reach) */
  function kindDistance(w, a, b) {
    if (a.offset === b.offset && a.pos === b.pos) return 0;
    var up = Object.create(null);
    w.above(a, 12).forEach(function (x) { up[x.syn.offset] = x.depth; });
    var best = null;
    w.above(b, 12).forEach(function (x) { if (x.syn.offset in up) { var d = Math.max(x.depth, up[x.syn.offset]); if (best === null || d < best) best = d; } });
    return best;
  }
  function commonness(w, syn) {
    var lemma = syn.words[0].replace(/ /g, "_").toLowerCase(), e = w.index.noun[lemma];
    var first = e && e.offsets[0] === syn.offset ? 1 : 0;
    var CO = get("C4LMCore"), LX = get("C4LMLexicon"), familiar = 0;
    try { familiar = (LX && LX.lookup && LX.lookup(lemma)) || (CO && CO.knownWord && CO.knownWord(lemma)) ? 0.8 : 0; } catch (e) { familiar = 0; }
    return first * 1.2 + (e ? Math.log(1 + e.tagsense) / 2 : 0) + familiar + (/\s|-/.test(syn.words[0]) ? -0.6 : 0) + (/^[A-Z]/.test(syn.words[0]) ? -1 : 0);
  }

  /* ----------------------------------------------------- relation families */
  function kbEntity(term) {
    var KB = get("C4LMKB"), h = [];
    try { h = KB ? KB.resolve(term, { strict: true }) : []; } catch (e) { h = []; }
    return h.length ? h[0].entity : null;
  }
  function plain(v) { return low(String(v).replace(/^(?:the|a|an)\s+/i, "")); }
  function kbMatches(val, term) {
    var v = plain(val), t = plain(term), e = kbEntity(term);
    return v === t || (e && (plain(e.name) === v || (e.aliases || []).some(function (a) { return plain(a) === v; }))) || v.split(/\s*,\s*|\s+and\s+/).indexOf(t) >= 0;
  }
  var FAMILIES = {
    kb: {
      label: function (r) { return (r.inverse ? "the thing whose " + r.key + " it is" : r.key); },
      find: function (w, a, b) {
        var out = [], ea = kbEntity(a), eb = kbEntity(b);
        if (ea) Object.keys(ea.rel || {}).forEach(function (k) { if (typeof ea.rel[k] === "string" && kbMatches(ea.rel[k], b)) out.push({ family: "kb", key: k, inverse: false, why: cap(ea.name) + "'s " + k + " is " + ea.rel[k] }); });
        if (eb) Object.keys(eb.rel || {}).forEach(function (k) { if (typeof eb.rel[k] === "string" && kbMatches(eb.rel[k], a)) out.push({ family: "kb", key: k, inverse: true, why: cap(eb.name) + "'s " + k + " is " + eb.rel[k] }); });
        return out;
      },
      apply: function (w, rel, c) {
        var KB = get("C4LMKB"), ec = kbEntity(c);
        if (!rel.inverse) return ec && typeof ec.rel[rel.key] === "string" ? [{ answer: String(ec.rel[rel.key]).replace(/^the\s+/i, ""), why: cap(ec.name) + "'s " + rel.key + " is " + ec.rel[rel.key], score: 5 }] : [];
        var hits = KB && KB.entities ? KB.entities().filter(function (e) { return typeof (e.rel || {})[rel.key] === "string" && kbMatches(e.rel[rel.key], c); }) : [];
        return hits.slice(0, 1).map(function (e) { return { answer: e.name, why: cap(e.name) + "'s " + rel.key + " is " + e.rel[rel.key], score: 5 }; });
      }
    },
    pointer: {
      find: function (w, a, b) {
        if (!w) return [];
        var out = [], SB = allSenses(w, b, 3), sbSet = Object.create(null);
        SB.forEach(function (x) {
          sbSet[x.syn.pos + x.syn.offset] = 0;
          /* similar-to and also-see are near-identity at the target end
             ("unhappy" also-see "sad") */
          w.follow(x.syn, "&").concat(w.follow(x.syn, "^")).forEach(function (y) { if (!(y.pos + y.offset in sbSet)) sbSet[y.pos + y.offset] = 1; });
          w.above(x.syn, 3).forEach(function (y) { if (!(y.syn.pos + y.syn.offset in sbSet)) sbSet[y.syn.pos + y.syn.offset] = 1 + y.depth; });
        });
        allSenses(w, a, 3).forEach(function (x) {
          var starts = [x.syn].concat(w.follow(x.syn, "&"));
          starts.forEach(function (st, si) {
            st.ptrs.forEach(function (p) {
              if (/^[@~]/.test(p.sym) || p.sym === "&" || p.sym === "+" || p.sym === "\\\\") return;
              var k = p.pos + p.offset;
              var tg0 = !(k in sbSet) ? w.synset(p.pos, p.offset) : null;
              if (tg0) {
                /* or one near-identity step after the link ("happy" -> "unhappy"
                   also-see "sad") */
                var nb = w.follow(tg0, "&").concat(w.follow(tg0, "^")).filter(function (y) { return (y.pos + y.offset) in sbSet && sbSet[y.pos + y.offset] === 0; })[0];
                if (nb) out.push({ family: "pointer", sym: p.sym, cost: 1 + si + x.rank, top: null, why: null });
              }
              if (k in sbSet) { var tg = w.synset(p.pos, p.offset); out.push({ family: "pointer", sym: p.sym, cost: sbSet[k] + si + x.rank, top: tg && tg.pos === "n" && w.above(tg, 20).length >= 2 ? topKind(w, tg) : null, exemplar: tg ? { pos: tg.pos, offset: tg.offset } : null, why: null }); }
            });
          });
        });
        return out;
      },
      apply: function (w, rel, c) {
        var out = pointerApply(w, rel, c);
        if (out.length || !/^#[pms]$/.test(rel.sym)) return out;
        /* no explicit link: a definition names the whole with "of"
           ("page: one side of one leaf (of a book ...)") -- the first such
           noun of the same top-level kind as the example's whole */
        var objectRoot = topSense(w, "physical object");
        nounSenses(w, c, 2).forEach(function (x) {
          if (out.length) return;
          var toks = get("C4Dataset").tokens(x.syn.def), last = null;
          for (var i = 0; i < toks.length - 1; i++) {
            if (toks[i] !== "of") continue;
            var j = /^(?:a|an|the|one)$/.test(toks[i + 1]) ? i + 2 : i + 1, cand = toks[j];
            if (!cand || STOP.test(cand)) continue;
            var cs = nounSenses(w, cand, 1)[0];
            /* a whole is an object (not a process: "organ of photosynthesis");
               in a chain the outermost one is the whole */
            if (cs && (!rel.top || topKind(w, cs.syn) === rel.top) && under(w, cs.syn, objectRoot)) last = cs;
          }
          if (last) out.push({ answer: last.lemma.replace(/_/g, " "), syn: last.syn, score: 2, why: c + " is " + quote(firstDef(x.syn.def)) + " — its definition names the whole" });
        });
        return out;
      }
    },
    _pointerApply: {
      apply: function (w, rel, c) {
        var out = [];
        /* the word's main senses: a rare sense that happens to carry the
           link ("leaf" = a sheet of paper) is not what was meant */
        /* adjective senses are finer-grained than noun senses */
        allSenses(w, c, 3).filter(function (x) { return x.syn.pos === "a" || x.rank < 2; }).forEach(function (x) {
          [x.syn].concat(w.follow(x.syn, "&")).forEach(function (st, si) {
            w.follow(st, rel.sym).forEach(function (t) {
              var name = t.words.filter(function (v) { return low(v) !== low(c); })[0];
              if (rel.top && topKind(w, t) !== rel.top) return;
              if (name) out.push({ answer: name, syn: t, score: 4 - x.rank - si * 0.5, why: null });
            });
          });
        });
        return out;
      }
    },
    template: {
      find: function (w, a, b) {
        if (!w) return [];
        var out = [];
        function names(term) {
          var ns = [];
          nounSenses(w, term, 2).forEach(function (x) { ns = ns.concat(x.syn.words); w.follow(x.syn, "~").slice(0, 30).forEach(function (h) { ns = ns.concat(h.words); }); });
          return uniq(ns.map(low));
        }
        [[a, b, false], [b, a, true]].forEach(function (o) {
          var nm = names(o[0]);
          nounSenses(w, o[1], 2).forEach(function (x) {
            var toks = get("C4Dataset").tokens(x.syn.def), d = " " + toks.join(" ") + " ";
            nm.forEach(function (n) {
              var at = d.indexOf(" " + n + " ");
              if (at < 0) return;
              var before = d.slice(0, at).trim().split(" ").filter(function (t) { return !STOP.test(t); }).pop();
              var adjacent = d.slice(0, at).trim().split(" ").pop() === before;
              if (before && !/\d/.test(before)) out.push({ family: "template", word: before, reverse: o[2], cost: x.rank + (adjacent ? 0 : 1), why: head(x.syn) + " is " + quote(firstDef(x.syn.def)) });
            });
          });
        });
        return out;
      },
      apply: function (w, rel, c) {
        var out = [], nm = [];
        nounSenses(w, c, 2).forEach(function (x) { nm = nm.concat(x.syn.words); w.follow(x.syn, "~").slice(0, 30).forEach(function (h) { nm = nm.concat(h.words); }); });
        nm = uniq(nm.map(low));
        if (rel.reverse) {
          nounSenses(w, c, 2).forEach(function (x) {
            var toks = get("C4Dataset").tokens(x.syn.def), i = toks.indexOf(rel.word);
            if (i < 0) return;
            for (var j = i + 1; j < toks.length && j < i + 4; j++) if (!STOP.test(toks[j]) && nounSenses(w, toks[j], 1).length) { out.push({ answer: toks[j], score: 3, why: head(x.syn) + " is " + quote(firstDef(x.syn.def)) }); break; }
          });
          return out;
        }
        w.mentioning(rel.word, "noun").forEach(function (off) {
          var s = w.synset("n", off);
          if (!s) return;
          var d = " " + get("C4Dataset").tokens(s.def).join(" ") + " ";
          nm.forEach(function (n) {
            var at = d.indexOf(" " + n + " ");
            if (at < 0) return;
            var words = d.slice(0, at).trim().split(" ").filter(function (t) { return !STOP.test(t); });
            var near = words.slice(-2).indexOf(rel.word) >= 0;
            if (s.words.some(function (v) { return low(v) === low(c); })) return;
            out.push({ answer: head(s), syn: s, score: (near ? 3 : 1) + commonness(w, s), why: head(s) + " is " + quote(firstDef(s.def)) });
          });
        });
        return out;
      }
    }
  };

  /* attribute family: values on one side, things on the other */
  function attributeClass(w, terms) {
    /* a value may be a word's rarer sense ("peach" the color is its fourth) */
    /* "black" and "white" also meet at "person": take the first shared kind
       that the dataset files under attribute */
    /* one item alone must be a value in its main sense; a rarer sense
       ("peach" the color) needs another item to corroborate it */
    var ks = commonKinds(w, terms, 3000, terms.length > 1 ? 8 : 1, 60).filter(function (k) { return k.syn.offset !== (attrRoot(w) || {}).offset && isUnderAttribute(w, k.syn); });
    return ks.length ? ks[0].syn : null;
  }
  /* the senses of a thing that belong to the kind the pairs share
     ("mustard" the condiment, not the greens) */
  function thingSenses(w, thing, category) {
    var all = nounSenses(w, thing, 6);
    if (!category) return all.slice(0, 3);
    var cl = closure(w, category, 20000), inCat = all.filter(function (x) { return cl.full && cl.set[x.syn.offset]; });
    return inCat.length ? inCat : all.slice(0, 3);
  }
  function holdsAttr(w, cls, value, thing, category, strict) {
    var vals = Object.create(null), vw = valueWords(w, cls);
    lemmaOf(w, low(value)).forEach(function (v) { if (vw[v]) vals[v] = 1; });
    vals[low(value)] = 1;
    var test = valueTester(w, vals);
    /* confirming one named value may use any main sense ("snow" the layer
       of white crystals), not only the senses of the pairs' shared kind */
    var r = reach(w, thingSenses(w, thing, category), test, 1) || (category && !strict ? reach(w, nounSenses(w, thing, 4), test, 1) : null);
    return r;
  }
  /* the first value of an attribute class that a thing is described with */
  function describedValue(w, cls, thing, category) {
    return reach(w, thingSenses(w, thing, category), valueTester(w, valueWords(w, cls)), 1);
  }
  function thingsWith(w, value, category, exclude, classValues) {
    var cands = [], seen = Object.create(null), cat = category ? closure(w, category, 20000) : null;
    var own = classValues ? valueTester(w, classValues) : null;
    if (cat && !cat.full) cat = null;
    function add(s, depth, via) {
      if (!s || seen[s.offset] || (cat && !cat.set[s.offset])) return;
      if (s.words.some(function (v) { return exclude.indexOf(low(v)) >= 0; })) return;
      seen[s.offset] = 1;
      var toks = get("C4Dataset").tokens(s.def), at = toks.indexOf(via ? via.token : value);
      if (at >= 0 && !via && !describing(toks, at)) return;
      /* its own definition already names a different value: that is its
         value, not one inherited from something it mentions */
      if (via && own) { for (var q = 0; q < toks.length; q++) { var ov = describing(toks, q) ? own(toks[q]) : null; if (ov && ov !== value) return; } }
      /* "red or yellow or green skin" is not mainly green */
      var ahead = at > 0 && /^(?:or|and)$/.test(toks[at - 1]) ? 0.9 : 0;
      cands.push({ syn: s, depth: depth, via: via, score: commonness(w, s) - depth * 2 - (at > 3 ? 0.4 : 0) + (at >= 0 && at <= 2 ? 0.4 : 0) - ahead });
    }
    w.mentioning(value, "noun").forEach(function (o) { add(w.synset("n", o), 0, null); });
    /* shades the dataset itself writes: any "X-value" token whose X is an
       adjective ("dark-blue berries") */
    var suffix = "-" + value;
    Object.keys(w.inverted.noun || {}).forEach(function (k) {
      if (k.length > suffix.length && k.slice(-suffix.length) === suffix && w.index.adj[k.slice(0, -suffix.length)])
        w.mentioning(k, "noun").forEach(function (o) { add(w.synset("n", o), 0, { syn: null, token: k, shade: true }); });
    });
    if (cat) {
      w.mentioning(value, "noun").slice(0, 600).forEach(function (o) {
        var mid = w.synset("n", o);
        if (!mid || !isPhysical(w, mid)) return;
        mid.words.filter(function (v) { return !/\s/.test(v); }).map(low).forEach(function (lemma) {
          [lemma, lemma + "s", lemma.replace(/y$/, "ies"), lemma + "es"].forEach(function (form) {
            w.mentioning(form, "noun").forEach(function (o2) { add(w.synset("n", o2), 1, { syn: mid, token: form }); });
          });
        });
      });
    }
    return cands.sort(function (x, y) { return y.score - x.score; });
  }

  /* --------------------------------------------------- relation induction */
  function induce(w, pairs) {
    var cand = {};
    function key(r) { return r.family + ":" + (r.key || r.sym || r.word || "") + ":" + (r.inverse || r.reverse ? 1 : 0); }
    pairs.forEach(function (p, i) {
      var bestHere = {};
      ["kb", "pointer", "template"].forEach(function (f) {
        if (f !== "kb" && !w) return;
        /* the cheapest link of each kind speaks for this pair */
        FAMILIES[f].find(w, p[0], p[1]).forEach(function (r) {
          var k = key(r);
          if (!bestHere[k] || (r.cost || 0) < (bestHere[k].cost || 0)) bestHere[k] = r;
        });
      });
      Object.keys(bestHere).forEach(function (k) {
        var r = bestHere[k];
        cand[k] = cand[k] || { rel: r, support: 0, cost: 0, evidence: [] };
        if ((r.cost || 0) < (cand[k].rel.cost || 0)) cand[k].rel = r;
        cand[k].support++; cand[k].cost += r.cost || 0; cand[k].evidence[i] = r.why;
      });
    });
    var ranked = Object.keys(cand).map(function (k) { return cand[k]; }).sort(function (x, y) {
      return y.support - x.support || x.cost - y.cost || ({ kb: 0, pointer: 1, template: 2 }[x.rel.family] - { kb: 0, pointer: 1, template: 2 }[y.rel.family]);
    });
    var best = ranked[0] && ranked[0].support >= Math.max(1, Math.ceil(pairs.length / 2)) ? ranked[0] : null;
    /* attribute: left values of one class, right things (or the reverse) */
    var attr = null;
    if (w) {
      [[0, 1], [1, 0]].some(function (o) {
        var cls = attributeClass(w, pairs.map(function (p) { return p[o[0]]; }));
        if (!cls) return false;
        var things = pairs.map(function (p) { return p[o[1]]; }), kinds = commonKinds(w, things, 20000, 6), cat = null, checks = null;
        /* the kind is chosen by strict evidence (senses inside the kind);
           the report may then confirm a pair through any main sense */
        (kinds.length ? kinds : [null]).forEach(function (k) {
          var ch = pairs.map(function (p) { return holdsAttr(w, cls, p[o[0]], p[o[1]], k ? k.syn : null, true); });
          if (!checks || ch.filter(Boolean).length > checks.filter(Boolean).length) { checks = ch; cat = k; }
        });
        checks = pairs.map(function (p, i) { return checks[i] || holdsAttr(w, cls, p[o[0]], p[o[1]], cat ? cat.syn : null, false); });
        attr = { family: "attribute", cls: cls, valueSide: o[0], category: cat ? cat.syn : null, checks: checks,
                 support: checks.filter(Boolean).length };
        return true;
      });
    }
    var alts = ranked.filter(function (r) { return best && r.support === best.support; }).map(function (r) { return { family: r.rel.family, rel: r.rel, support: r.support, evidence: r.evidence }; });
    /* every left item being a value of one attribute class is evidence too */
    if (attr && (!best || attr.support + 0.5 >= best.support)) { attr.alts = alts; return attr; }
    if (!best) return attr;
    var top = alts[0];
    top.alts = alts.slice(1).concat(attr ? [attr] : []);
    return top;
  }
  function describeRelation(w, R, pairs) {
    if (!R) return "";
    if (R.family === "attribute") {
      var things = R.category ? head(R.category) : "thing";
      return R.valueSide === 0 ? "each left item is " + art(head(R.cls)) + head(R.cls) + " and each right item " + art(things) + things + " that has it"
                               : "each left item is " + art(things) + things + " and each right item its " + head(R.cls);
    }
    if (R.family === "kb") return R.rel.inverse ? "the right side is the thing whose " + R.rel.key + " is the left side" : "the right side is the left side's " + R.rel.key;
    if (R.family === "pointer") return { "#p": "the right side is the whole the left side is part of", "#m": "the right side is the group the left side belongs to",
      "#s": "the right side is what the left side is made into", "%p": "the right side is a part of the left side", "%m": "the right side is a member of the left side",
      "%s": "the right side is what the left side is made of" }[R.rel.sym] || "the right side is the " + SYM_NAME(R.rel.sym) + " of the left side";
    if (R.family === "template") return R.rel.reverse ? "the left side is defined as “" + R.rel.word + " …” the right side" : "the right side is defined as “" + R.rel.word + " …” the left side";
    return "";
  }
  function pointerApply(w, rel, c) { return FAMILIES._pointerApply.apply(w, rel, c); }
  function SYM_NAME(s) {
    return { "!": "opposite", "#p": "whole it is part of", "%p": "part", "#m": "group it belongs to", "%m": "member", "#s": "thing it is made into",
             "%s": "substance it is made of", "=": "attribute", "*": "consequence", ">": "cause", "^": "related word", "<": "participle", "@i": "class", "~i": "instance",
             ";c": "topic", "-c": "topic member", ";r": "region", ";u": "usage" }[s] || "linked word";
  }
  function applyRelation(w, R, c, examples) {
    var exclude = examples.reduce(function (o, p) { return o.concat([low(p[0]), low(p[1])]); }, [low(c)]);
    if (R.family === "attribute") {
      if (R.valueSide === 0) {
        var cv = valueWords(w, R.cls), list = thingsWith(w, low(c), R.category, exclude, cv), up = R.category, tries = 0;
        while (!list.length && up && tries++ < 3) { up = (w.above(up, 1)[0] || {}).syn; list = up ? thingsWith(w, low(c), up, exclude, cv) : []; }
        if (!list.length) list = thingsWith(w, low(c), null, exclude, cv);
        return list.slice(0, 4).map(function (x) {
          return { answer: head(x.syn), score: x.score, syn: x.syn,
                   why: x.via && x.via.syn ? head(x.syn) + " is " + quote(firstDef(x.syn.def)) + ", and " + art(head(x.via.syn)) + head(x.via.syn) + " is " + quote(firstDef(x.via.syn.def))
                              : head(x.syn) + " is " + quote(firstDef(x.syn.def)), widened: up !== R.category };
        });
      }
      var d = describedValue(w, R.cls, c, null);
      return d ? [{ answer: d.value, score: 3, why: chainText(d.chain, c) }] : [];
    }
    var fam = FAMILIES[R.family], got = fam.apply(w, R.rel, c).filter(function (x) { return exclude.indexOf(low(x.answer)) < 0; });
    /* "foot" has many parts; the one of the same kind as the exact sense the
       example reached (finger, the digit) is the toe */
    var ex0 = R.rel && R.rel.exemplar ? w.synset(R.rel.exemplar.pos, R.rel.exemplar.offset) : null;
    if (w && got.length > 1 && ex0) got.forEach(function (x) { if (x.syn) { var d = kindDistance(w, x.syn, ex0); x.score += d === null ? 0 : Math.max(0, 8 - 2 * d); } });
    return got.sort(function (x, y) { return y.score - x.score; });
  }

  /* ------------------------------------------------------------ session */
  function session() { return { pairs: [], relation: null, examples: [], sets: 0, history: [] }; }
  function findPair(sess, term) {
    var t = low(term), out = [];
    sess.pairs.forEach(function (p) { if (low(p.left) === t) out.push({ p: p, side: 0 }); else if (low(p.right) === t) out.push({ p: p, side: 1 }); });
    return out;
  }

  /* ---------------------------------------------------------- responders */
  function steps(list) { return "\nReasoning:\n" + list.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n"); }
  function noDataset() {
    var D = get("C4Dataset");
    return "I can't reach my reference dataset right now" + (D && D.error ? " (" + D.error + ")" : "") + ", so I can only use my knowledge base for this.";
  }
  function state(w, sess, stmts, correction) {
    var out = [], notes = [];
    stmts.forEach(function (pairs) {
      sess.sets++;
      /* a correction belongs to the set it corrects: re-check it against
         that set's pattern, not a pattern guessed from one pair */
      var prior = correction ? sess.pairs.filter(function (q) { return !q.inferred && pairs.some(function (p) { return low(q.left) === low(p[0]); }); })[0] : null;
      var R = prior && prior.relation ? prior.relation : induce(w, pairs);
      if (prior && R && R.family === "attribute") R = Object.assign({}, R, { checks: pairs.map(function (p) { return holdsAttr(w, R.cls, p[R.valueSide], p[1 - R.valueSide], R.category); }) });
      if (prior && R && R.family === "attribute") R.support = R.checks.filter(Boolean).length;
      pairs.forEach(function (p) {
        var old = sess.pairs.filter(function (q) { return !q.inferred && low(q.left) === low(p[0]); });
        old.forEach(function (q) { notes.push("Updated: " + cap(p[0]) + " → " + cap(p[1]) + " (was " + q.right + ")."); sess.pairs.splice(sess.pairs.indexOf(q), 1); });
      });
      pairs.forEach(function (p, i) {
        var confirmed = null;
        if (R && R.family === "attribute") confirmed = R.checks[i];
        else if (R && R.evidence) confirmed = R.evidence[i] ? { why: R.evidence[i] } : null;
        sess.pairs.push({ left: cap(p[0]), right: cap(p[1]), set: sess.sets, confirmed: confirmed, relation: R });
      });
      if (R) { sess.relation = R; sess.examples = pairs; sess.history.push({ R: R, ex: pairs }); }
      var shown = pairs.map(function (p) { return cap(p[0]) + " → " + cap(p[1]); }).join(", ");
      out.push(shown);
      if (R) notes.push("Pattern: " + describeRelation(w, R, pairs) + " (it fits " + (R.support || 0) + " of " + pairs.length + " pair" + (pairs.length > 1 ? "s" : "") + " in my data).");
      else notes.push("I can't find a single relation in my data that links these pairs, so I'll treat them as your own mapping.");
      pairs.forEach(function (p, i) {
        var c = sess.pairs[sess.pairs.length - pairs.length + i].confirmed;
        if (c && c.chain) notes.push("Checked " + cap(p[0]) + " → " + cap(p[1]) + ": " + chainText(c.chain, low(p[1])) + ".");
        else if (c && c.why) notes.push("Checked " + cap(p[0]) + " → " + cap(p[1]) + ": " + c.why + ".");
        else if (R && R.family === "attribute" && w) {
          var other = describedValue(w, R.cls, p[R.valueSide === 0 ? 1 : 0], R.category);
          notes.push(cap(p[R.valueSide === 0 ? 1 : 0]) + ": " + (other ? "my dataset describes it as " + other.value + " (" + chainText(other.chain, low(p[R.valueSide === 0 ? 1 : 0])) + ")" : "my dataset doesn't state its " + head(R.cls)) +
                     ", so I'm keeping " + cap(p[0]) + " → " + cap(p[1]) + " as your pairing, not as a fact.");
        } else notes.push(cap(p[0]) + " → " + cap(p[1]) + " isn't confirmed by my data, so I'm keeping it as your pairing, not as a fact.");
      });
    });
    return { text: "Got it: " + out.join("; ") + "." + steps(notes), kind: "state" };
  }
  /* which remembered pattern a new item belongs to: the most recent one
     whose left side is the same kind of thing ("blue" goes with the color
     pattern, not with finger : hand) */
  function fitting(w, sess, c) {
    if (w) {
      var best = null;
      sess.history.forEach(function (h, i) {
        var k = commonKind(w, [c].concat(h.ex.map(function (p) { return p[0]; })), 0, 8);
        if (k && k.depth <= 3 && (!best || k.depth < best.d || (k.depth === best.d && i > best.i))) best = { h: h, d: k.depth, i: i };
      });
      if (best) return best.h;
    }
    for (var i = sess.history.length - 1; i >= 0; i--) {
      var h = sess.history[i], R = h.R;
      if (R.family === "attribute") {
        if (!w) continue;
        var vw = valueWords(w, R.cls), lc = low(c);
        if (R.valueSide === 0 ? (vw[lc] || lemmaOf(w, lc).some(function (x) { return vw[x]; })) : !vw[lc]) return h;
        continue;
      }
      if (R.family === "kb") { var e1 = kbEntity(c), e2 = kbEntity(h.ex[0][0]); if (e1 && e2 && e1.type === e2.type) return h; continue; }
      if (w && FAMILIES[R.family].apply(w, R.rel, c).length) return h;
    }
    return null;
  }
  function apply(w, sess, stmts, query, soft, quiet) {
    var pre = stmts.length ? state(w, sess, stmts) : null;
    if (quiet) pre = null;
    var R, ex;
    if (stmts.length) { ex = stmts[stmts.length - 1]; R = induce(w, ex); }
    else { var hh = fitting(w, sess, query[0]); R = hh ? hh.R : null; ex = hh ? hh.ex : []; }
    if (!R) {
      if (soft) return null;
      var msg = stmts.length ? "I couldn't find what links " + ex.map(function (p) { return cap(p[0]) + " and " + cap(p[1]); }).join(", ") + " in my data, so I can't carry it over to " + query.map(cap).join(", ") + "."
                             : "I don't have a pattern that fits " + query.map(cap).join(", ") + " yet — give me a pair or two first, like “Red, Yellow = Ketchup, Mustard”.";
      return { text: (pre ? pre.text + "\n\n" : "") + msg, kind: "apply" };
    }
    var lines = [], why = ["From " + ex.map(function (p) { return cap(p[0]) + " → " + cap(p[1]); }).join(", ") + ": " + describeRelation(w, R, ex) + "."];
    var any = false;
    query.forEach(function (c) {
      var got = w || R.family === "kb" ? applyRelation(w, R, c, ex) : [];
      /* equally supported readings of the examples: the one that carries
         over to the new item is the one meant */
      (R.alts || []).some(function (A) {
        if (got.length) return true;
        got = w || A.family === "kb" ? applyRelation(w, A, c, ex) : [];
        if (got.length) { why[0] = "From " + ex.map(function (p) { return cap(p[0]) + " → " + cap(p[1]); }).join(", ") + ": " + describeRelation(w, A, ex) + "."; }
        return got.length > 0;
      });
      if (!got.length) { lines.push(cap(c) + " → ? (nothing in my data fits that pattern)"); return; }
      any = true;
      var alts = got.slice(1, 3).map(function (x) { return x.answer; }).filter(function (x) { return low(x) !== low(got[0].answer); });
      lines.push(cap(c) + " → " + cap(got[0].answer) + (alts.length ? " (or " + alts.join(", ") + ")" : ""));
      if (got[0].why) why.push(cap(c) + ": " + got[0].why + (got[0].widened ? " (nothing matched inside the same kind of thing, so I widened the search)" : "") + ".");
      sess.pairs.push({ left: cap(c), right: cap(got[0].answer), set: sess.sets, confirmed: { why: got[0].why }, inferred: true });
    });
    if (!any && soft) return null;
    return { text: (pre ? pre.text + "\n\n" : "") + lines.join("; ") + "." + steps(why), kind: "apply" };
  }
  function recall(w, sess, I) {
    var hits = findPair(sess, I.item);
    if (!hits.length) return sess.pairs.length ? { text: "You haven't paired " + cap(I.item) + " with anything yet. So far: " + sess.pairs.filter(function (p) { return !p.inferred; }).map(function (p) { return p.left + " → " + p.right; }).join(", ") + ".", kind: "recall" } : null;
    var h = hits[0], other = h.side === 0 ? h.p.right : h.p.left;
    var who = h.p.inferred ? "I matched " : "You paired ";
    var src = h.p.inferred ? " (my inference from your pattern)" : "";
    var note = h.p.confirmed === null && !h.p.inferred ? " My data doesn't confirm that one, so it's your association rather than a fact." : "";
    return { text: who + cap(I.item) + " with " + other + src + "." + note, kind: "recall" };
  }
  function whyPair(w, sess, I) {
    var hit = sess.pairs.filter(function (p) { return (low(p.left) === low(I.a) && low(p.right) === low(I.b)) || (low(p.left) === low(I.b) && low(p.right) === low(I.a)); })[0];
    if (!hit) return null;
    var R = hit.relation || sess.relation, c = hit.confirmed;
    var lead = (hit.inferred ? "I matched " : "You paired ") + hit.left + " with " + hit.right;
    if (c && c.chain) return { text: lead + ", and my data backs it up: " + chainText(c.chain, low(hit.right)) + " — so " + low(hit.right) + " is " + low(hit.left) + "." + steps(["Pattern: " + describeRelation(w, R, sess.examples) + ".", "Read " + low(hit.right) + "'s definition" + (c.chain.length > 1 ? ", then one step further to " + head(c.chain[1].syn) + "," : "") + " until it named " + low(hit.left) + "."]), kind: "why", explanation: true };
    if (c && c.why) return { text: lead + " because " + c.why + ".", kind: "why", explanation: true };
    return { text: lead + ", but my data doesn't show a link between them, so it's your association rather than something I can explain.", kind: "why", explanation: true };
  }
  function attrQuestion(w, sess, I) {
    var cls = nounSenses(w, I.attr, 1)[0];
    if (!cls || !isUnderAttribute(w, cls.syn)) return null;
    if (!nounSenses(w, I.subject, 3).length) return null;
    var d = describedValue(w, cls.syn, I.subject), mine = findPair(sess, I.subject)[0];
    var note = mine && !mine.p.inferred ? " (You paired it with " + (mine.side === 0 ? mine.p.right : mine.p.left) + " earlier — I've kept that as your pairing.)" : "";
    if (!d) return { text: "My dataset doesn't state the " + I.attr + " of " + I.subject + "." + note, kind: "attr" };
    var ans = d.value + (d.alt ? " or " + d.alt : "");
    return { text: cap(I.subject) + " is " + ans + ": " + chainText(d.chain, I.subject) + "." + note +
                   steps(["“" + I.attr + "” is an attribute class in my dataset; its values are the kinds of " + I.attr + " below it.",
                          "Read " + I.subject + "'s definition" + (d.depth ? ", then " + head(d.chain[1].syn) + "'s," : "") + " for the first word that names a " + I.attr + ": " + d.value + "."]), kind: "attr" };
  }
  function isAttr(w, I) {
    if (!w.lemmas(I.value, "adj").length || !nounSenses(w, I.subject, 3).length) return null;
    var vs = nounSenses(w, I.value, 3).filter(function (x) { return isUnderAttribute(w, x.syn); });
    for (var i = 0; i < vs.length; i++) {
      /* a value competes only with its own family: its parent and
         grandparent classes (achromatic color, color), not "property" */
      var ups = [vs[i].syn].concat(w.above(vs[i].syn, 2).map(function (a) { return a.syn; }));
      for (var j = 1; j < ups.length; j++) {
        if (!closure(w, ups[j], 3000).full || ups[j].offset === (attrRoot(w) || {}).offset) break;
        var d = describedValue(w, ups[j], I.subject);
        if (!d) continue;
        var same = d.value === low(I.value) || d.alt === low(I.value) || lemmaOf(w, low(I.value)).indexOf(d.value) >= 0;
        return { text: (same ? "Yes — " : "No — ") + I.subject + " is described as " + d.value + (d.alt ? " or " + d.alt : "") + ": " + chainText(d.chain, I.subject) + ".", kind: "isattr" };
      }
    }
    return null;
  }
  function nameSomething(w, I) {
    var list = thingsWith(w, low(I.value), null, [low(I.value)]).filter(function (x) { return !x.depth; }).slice(0, 3);
    if (!list.length) return null;
    return { text: cap(head(list[0].syn)) + " — " + quote(firstDef(list[0].syn.def)) + "." + (list.length > 1 ? " Also: " + list.slice(1).map(function (x) { return head(x.syn); }).join(", ") + "." : ""), kind: "name" };
  }
  function common(w, I) {
    var ck = commonKind(w, [I.a, I.b], 0, 6);
    if (!ck || ck.depth > 6) return null;
    var k = ck.syn;
    return { text: "Both are " + head(k) + (/s$/.test(head(k)) ? "" : "s") + ": " + quote(firstDef(k.def)) + "." + steps(["Climbed the kind-of links from " + I.a + " and " + I.b + " until they met.", "They meet at " + head(k) + ", " + ck.depth + " step" + (ck.depth === 1 ? "" : "s") + " up."]), kind: "common" };
  }

  /* ------------------------------------------------------------- answer */
  function wants(text, sess) {
    var I = null;
    try { I = analyze(text); } catch (e) { I = null; }
    if (!I) return false;
    if (/^(?:forget|nth)$/.test(I.kind)) return !!(sess && (I.kind === "nth" ? sess.pairs.length : findPair(sess, I.item).length));
    return true;
  }
  function ready() { var D = get("C4Dataset"); return D ? D.ready() : Promise.resolve(null); }
  function answer(text, sess) {
    var I = analyze(text);
    if (!I) return null;
    /* the generic question forms yield to an act the conversation layer
       already recognises ("tell me something interesting" is a request
       for a fact, not for things that are "interesting") */
    var CV = get("C4LMConverse");
    if (/^(?:name|isattr|attr|common)$/.test(I.kind) && CV) { try { var ci = CV.analyze(text); if (ci && !ci.passive) return null; } catch (e) {} }
    sess = sess || session();
    var w = DSW(), r = null;
    if (!w && I.kind !== "recall" && I.kind !== "list" && !(I.kind === "analogy" || I.kind === "apply" || I.kind === "state")) return null;
    switch (I.kind) {
      case "state": r = state(w, sess, I.stmts, I.correction); break;
      case "apply": r = apply(w, sess, I.stmts, I.query, I.soft); break;
      case "compound": r = state(w, sess, I.stmts); if (I.then) { var r2 = apply(w, sess, [], I.then.query); if (r2) r.text += "\n\n" + r2.text; } break;
      case "analogy": r = apply(w, sess, [I.pairs], I.query, false, true); break;
      case "recall": r = recall(w, sess, I); break;
      case "forget": {
        var gone = findPair(sess, I.item);
        if (!gone.length) return null;
        gone.forEach(function (h) { sess.pairs.splice(sess.pairs.indexOf(h.p), 1); });
        r = { text: "Forgotten: " + gone.map(function (h) { return h.p.left + " → " + h.p.right; }).join(", ") + ". " + (sess.pairs.length ? "Still paired: " + sess.pairs.filter(function (p) { return !p.inferred; }).map(function (p) { return p.left + " → " + p.right; }).join(", ") + "." : "No pairs left."), kind: "forget" };
        break;
      }
      case "nth": {
        var mine = sess.pairs.filter(function (p) { return !p.inferred; });
        if (!mine.length) return null;
        var idx = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4 }[I.which], p = idx === undefined ? mine[mine.length - 1] : mine[idx];
        r = p ? { text: "The " + I.which + " pair you gave me was " + p.left + " → " + p.right + ".", kind: "nth" } : { text: "You've only given me " + mine.length + " pair" + (mine.length === 1 ? "" : "s") + ".", kind: "nth" };
        break;
      }
      case "list": r = sess.pairs.length ? { text: "So far: " + sess.pairs.map(function (p) { return p.left + " → " + p.right + (p.inferred ? " (inferred)" : ""); }).join(", ") + ".", kind: "list" } : null; break;
      case "why": r = whyPair(w, sess, I); break;
      case "attr": r = w ? attrQuestion(w, sess, I) : null; break;
      case "isattr": r = w ? isAttr(w, I) : null; break;
      case "name": r = w ? nameSomething(w, I) : null; break;
      case "common": r = w ? common(w, I) : null; break;
    }
    if (!r) return null;
    if (!w && /apply|state|analogy/.test(I.kind) && r.text.indexOf("→ ?") >= 0) r.text += " " + noDataset();
    var D = get("C4Dataset");
    return { text: r.text, route: "crossref", intent: "crossref", kind: r.kind, confidence: 0.85, explanation: !!r.explanation,
             sources: w ? [w.source + " (validated, " + (D && D.caller ? D.caller.stats.requests + " chunk reads" : "local") + ")"] : ["local knowledge base"] };
  }

  var CR = { analyze: analyze, answer: answer, wants: wants, ready: ready, session: session, induce: induce, applyRelation: applyRelation };
  root.C4LMCrossRef = CR;
  if (typeof module !== "undefined" && module.exports) module.exports = CR;
})(typeof window !== "undefined" ? window : globalThis);
