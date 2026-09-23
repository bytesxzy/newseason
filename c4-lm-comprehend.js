/* CELL4 comprehension stage.
 *
 *   words -> a gloss for every word and phrase -> what is asked and what is
 *   given -> a one-line summary of the question -> (a) a derivation by
 *   dimensional analysis when the question is quantitative, or a statement
 *   of exactly what is missing when the question does not fix its answer;
 *   (b) a research query built from the summary, for the retrieval index
 *   and the evidence federation.
 *
 * Nothing here names a question. Word meanings come from the lexicon and the
 * knowledge base; units and their dimensions come from the operator
 * library's unit table plus the grammar of rates ("X per Y", "X an Y",
 * "X every Y", "X/Y"); quantities the question does not state come from the
 * knowledge base entries of the things it mentions, and are reported as
 * assumptions. Runs locally; no model service.
 */
(function (root) {
  "use strict";

  function mods() {
    return { C: root.C4LMCore, LX: root.C4LMLexicon, KB: root.C4LMKB, RS: root.C4LMReason, PRB: root.C4LMProblem };
  }

  /* ------------------------------------------------------------ grammar */
  /* Closed classes: grammar, so their "definition" is their role. */
  var ROLES = [
    [/^(?:a|an|the|this|that|these|those|some|any|each|every|no|its|their|his|her|my|your|our)$/, "determiner (picks out which thing is meant)"],
    [/^(?:i|me|you|he|him|she|it|we|us|they|them|itself|himself|herself|themselves)$/, "pronoun (stands for a person or thing already known)"],
    [/^(?:is|are|was|were|be|been|being|am|do|does|did|have|has|had|will|would|shall|should|can|could|may|might|must)$/, "auxiliary verb (tense, mood or question form)"],
    [/^(?:what|which|who|whom|whose|when|where|why|how)$/, "question word (marks what is being asked)"],
    [/^(?:and|or|but|nor|so|yet|if|then|because|while|although|than|as)$/, "connective (joins or conditions clauses)"],
    [/^(?:of|in|on|at|to|for|from|by|with|about|into|over|under|through|per|between|during|after|before|without|within|across|behind)$/, "preposition (relates a thing to another)"]
  ];
  function roleOf(w) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i][0].test(w)) return ROLES[i][1]; return ""; }

  /* ------------------------------------------------------- dimensions */
  /* Base dimensions: length, mass, time, volume, money, count. */
  var BASE = ["L", "M", "T", "V", "$", "#"];
  var FAMILY = { length: "L", mass: "M", time: "T", volume: "V" };
  var MONEY = { dollar: 1, dollars: 1, usd: 1, cent: 0.01, cents: 0.01, euro: 1, euros: 1 };
  /* SI-ish scale of each family's base unit in the operator library's table */
  var FAMILY_SCALE = { length: 1, mass: 1, time: 1, volume: 1 };

  function dim(o) { var d = {}; for (var k in o) if (o[k]) d[k] = o[k]; return d; }
  function dmul(a, b, e) { var d = {}, k; e = e === undefined ? 1 : e; for (k in a) d[k] = (d[k] || 0) + a[k]; for (k in b) d[k] = (d[k] || 0) + e * b[k]; return dim(d); }
  function dkey(d) { return BASE.filter(function (b) { return d[b]; }).map(function (b) { return b + d[b]; }).join(" "); }
  function deq(a, b) { return dkey(a) === dkey(b); }
  function dsize(d) { var s = 0; for (var k in d) s += Math.abs(d[k]); return s; }

  /* The names of dimensions are physics vocabulary, not question text. */
  var DIM_NAME = {};
  [[{ L: 1 }, "a distance"], [{ M: 1 }, "a mass"], [{ T: 1 }, "a length of time"], [{ V: 1 }, "a volume"],
   [{ $: 1 }, "an amount of money"], [{ "#": 1 }, "a count"], [{ L: 1, T: -1 }, "a speed"], [{ V: 1, T: -1 }, "a flow rate"],
   [{ "#": 1, T: -1 }, "a rate per unit of time"], [{ $: 1, T: -1 }, "a pay or cost rate"],
   [{ L: 1, V: -1 }, "a fuel economy (distance per volume)"], [{ V: 1, L: -1 }, "a fuel consumption (volume per distance)"],
   [{ $: 1, M: -1 }, "a price per unit of mass"], [{ $: 1, V: -1 }, "a price per unit of volume"], [{ $: 1, "#": -1 }, "a price per item"],
   [{ M: 1, V: -1 }, "a density"], [{ L: 1, T: -2 }, "an acceleration"]
  ].forEach(function (p) { DIM_NAME[dkey(p[0])] = p[1]; });
  function dimName(d) {
    if (DIM_NAME[dkey(d)]) return DIM_NAME[dkey(d)];
    var inv = dmul({}, d, -1);
    if (DIM_NAME[dkey(inv)]) return "the inverse of " + DIM_NAME[dkey(inv)].replace(/^an? /, "");
    return "a quantity measured in " + dkey(d);
  }
  var MISSING_ASK = { "T1": "how long it goes on for", "L1": "how far it goes", "#1": "how many there are",
                      "M1": "how much (by weight) is involved", "V1": "how much (by volume) is involved", "$1": "how much money is involved" };

  /* ----------------------------------------------------------- units */
  function singular(w) { return /ies$/.test(w) ? w.slice(0, -3) + "y" : /(?:ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; }
  function unitOf(word) {
    var m = mods(), w = String(word || "").toLowerCase();
    if (!w) return null;
    if (MONEY[w] !== undefined) return { dim: { $: 1 }, scale: MONEY[w], name: w.replace(/s$/, "") };
    if (m.RS && m.RS.unitFamily) {
      var tries = [w, singular(w), w.replace(/s$/, "")];
      for (var i = 0; i < tries.length; i++) {
        var fam = m.RS.unitFamily(tries[i]);
        /* one-letter abbreviations collide with ordinary words ("a", "in") */
        if (fam && FAMILY[fam] && tries[i].length > 2) {
          var d = {}; d[FAMILY[fam]] = 1;
          return { dim: d, scale: m.RS.unitFactor(tries[i]) * FAMILY_SCALE[fam], name: singular(tries[i]) };
        }
      }
    }
    /* A word the dictionary defines as "<unit> per <unit>" is that rate:
       "mph" is glossed "miles per hour". The dictionary is the source. */
    var LX = m.LX, h = LX && LX.lookup(w);
    if (h) {
      for (var s = 0; s < h.senses.length; s++) {
        var g = h.senses[s].gloss.match(/^(?:a unit of \w+,?\s*)?([a-z]+)\s+per\s+([a-z]+)/i);
        if (g) {
          var a = unitOf(g[1]), b = unitOf(g[2]);
          if (a && b) return { dim: dmul(a.dim, b.dim, -1), scale: a.scale / b.scale, name: g[1] + " per " + singular(g[2]), rate: [a, b] };
        }
      }
    }
    return null;
  }

  /* ------------------------------------------------------ quantities */
  var RATE_JOIN = /^(?:per|an|a|each|every|\/)$/;
  var NUM = /^-?\d[\d,]*(?:\.\d+)?$/;
  function num(s) { return parseFloat(String(s).replace(/,/g, "")); }

  /* Read "N unit", "N unit per unit", "N unit an unit", "N count-noun per
     unit", "$N", "N to M unit" (a range; its middle is used and it is marked
     approximate). Returns quantities with value (scaled), dimension, unit
     names and the phrase they came from. */
  function quantities(text) {
    var m = mods();
    var t = m.PRB && m.PRB.wordsToNumbers ? m.PRB.wordsToNumbers(String(text)) : String(text);
    t = t.replace(/\$\s?(\d[\d,]*(?:\.\d+)?)/g, "$1 dollars").replace(/(\d)\s*\/\s*([a-z])/gi, "$1 / $2")
         .replace(/([a-z])\/([a-z])/gi, "$1 / $2").replace(/(\d)\s*[–-]\s*(\d)/g, "$1 to $2");
    var toks = t.match(/\$?\d[\d,]*(?:\.\d+)?|[A-Za-z][A-Za-z'-]*|\//g) || [];
    var out = [], used = [];
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      /* "an hour" / "a minute" not attached to a number: one of that unit */
      if (/^(?:a|an|one)$/i.test(tk) && i + 1 < toks.length && !(i > 0 && (NUM.test(toks[i - 1]) || unitOf(toks[i - 1]) || RATE_JOIN.test(toks[i - 1])))) {
        var u1 = unitOf(toks[i + 1]);
        if (u1 && (u1.dim.T || u1.dim.L || u1.dim.M || u1.dim.V) && !u1.rate && !(i > 0 && /^(?:per|every|each)$/i.test(toks[i - 1]))) {
          var prevWord = i > 0 ? toks[i - 1].toLowerCase() : "";
          if (!(out.length && out[out.length - 1].end === i - 1)) {
            out.push({ value: u1.scale, raw: 1, dim: u1.dim, unit: u1.name, phrase: tk + " " + toks[i + 1], start: i, end: i + 1, implicit: true, after: prevWord });
          }
          continue;
        }
      }
      if (!NUM.test(tk)) continue;
      var v = num(tk), j = i + 1, approx = false;
      if (toks[j] && /^to$/i.test(toks[j]) && toks[j + 1] && NUM.test(toks[j + 1])) { v = (v + num(toks[j + 1])) / 2; approx = true; j += 2; }
      /* "N [adjective] unit" is rare in questions; units follow the number */
      var u = toks[j] ? unitOf(toks[j]) : null, countNoun = "";
      /* a counted thing must be a noun: the dictionary says so, or it is an
         unlisted plural ("beats"); a verb ("9 use per hour") is not */
      var cw = toks[j] ? toks[j].toLowerCase() : "", cl = cw && m.LX ? m.LX.lookup(cw) : null;
      var nounish = cw && (cl ? cl.senses.some(function (x) { return x.pos === "n"; }) : /s$/.test(cw));
      if (!u && nounish && /^[a-z]/i.test(toks[j]) && !roleOf(cw) && toks[j + 1] && RATE_JOIN.test(toks[j + 1])) {
        /* "20 pages per minute", "70 times per minute": a count of a noun */
        countNoun = toks[j].toLowerCase();
        u = { dim: { "#": 1 }, scale: 1, name: countNoun };
      }
      if (!u) { if (toks[j] && /^(?:times|items|people|pages|beats|steps|units)$/i.test(toks[j])) u = { dim: { "#": 1 }, scale: 1, name: toks[j].toLowerCase() }; }
      if (!u) { out.push({ value: v, raw: v, dim: {}, unit: "", phrase: tk, start: i, end: i, approx: approx }); continue; }
      var q = { value: v * u.scale, raw: v, dim: u.dim, unit: u.name, phrase: toks.slice(i, j + 1).join(" "), start: i, end: j, approx: approx };
      if (u.rate) q.units = [u.rate[0].name, u.rate[1].name];
      /* rate: "N unit per|an|every unit" */
      var k = j + 1;
      if (toks[k] && RATE_JOIN.test(toks[k]) && toks[k + 1]) {
        /* "per hour", or with a count: "every 3 minutes" */
        var dn = 1, du = k + 1;
        if (NUM.test(toks[du]) && toks[du + 1]) { dn = num(toks[du]); du++; }
        var den = unitOf(toks[du]);
        if (den && !den.rate && dn > 0) {
          q = { value: q.value / (den.scale * dn), raw: v / dn, dim: dmul(u.dim, den.dim, -1), unit: u.name + " per " + den.name,
                units: [u.name, den.name], phrase: toks.slice(i, du + 1).join(" "), start: i, end: du, approx: approx };
        }
      }
      out.push(q);
      i = q.end;
    }
    return out;
  }

  /* ------------------------------------------------------- glossary */
  /* Every word and phrase of the question with what it means here. Phrases
     the knowledge base names are defined as wholes; other content words get
     the dictionary sense whose gloss best overlaps the rest of the question
     (the Lesk criterion); grammar words get their role; numbers and units
     get their quantity; a word nothing defines is marked unknown. */
  function glossary(text) {
    var m = mods(), C = m.C, KB = m.KB, LX = m.LX;
    var words = String(text).replace(/[’]/g, "'").match(/\$?\d[\d,]*(?:\.\d+)?|[A-Za-z][A-Za-z'-]*/g) || [];
    var low = words.map(function (w) { return w.toLowerCase().replace(/'s$/, ""); });
    var context = low.filter(function (w) { return !roleOf(w) && !(C && C.STOP[w]) && w.length > 2; });
    var out = [], i = 0;
    while (i < words.length) {
      var took = 0;
      /* longest named phrase first */
      if (KB) {
        for (var n = Math.min(5, words.length - i); n >= 1 && !took; n--) {
          var span = words.slice(i, i + n), lo = low.slice(i, i + n);
          if (roleOf(lo[0]) || roleOf(lo[n - 1]) || NUM.test(lo[0])) continue;
          var hit = KB.resolve(span.join(" "), { strict: true })[0];
          if (!hit || hit.score < 0.9) continue;
          /* a single ordinary word matched only through a generic alias
             belongs to the dictionary, not to the entry */
          var surf = String(hit.surface || "").toLowerCase();
          if (n === 1 && LX && LX.has(lo[0]) && C && C.flatten(hit.entity.name) !== C.flatten(lo[0]) && surf === lo[0] && !/^[A-Z]/.test(span[0])) continue;
          out.push({ span: span.join(" "), kind: "entity", gloss: String(hit.entity.defn || "").split(/(?<=\.)\s/)[0], entity: hit.entity.name, source: "knowledge base" });
          took = n;
        }
      }
      if (took) { i += took; continue; }
      var w = low[i];
      if (NUM.test(w.replace(/^\$/, ""))) { out.push({ span: words[i], kind: "number", gloss: "the number " + w.replace(/^\$/, "") }); i++; continue; }
      var r = roleOf(w);
      if (r) { out.push({ span: words[i], kind: "function", gloss: r }); i++; continue; }
      var u = unitOf(w);
      if (u) { out.push({ span: words[i], kind: "unit", gloss: "a unit of " + dimName(u.dim).replace(/^an? /, ""), dim: dkey(u.dim) }); i++; continue; }
      var h = LX && LX.lookup(w);
      if (h && h.senses.length) {
        var best = null;
        h.senses.forEach(function (s, si) {
          var g = C ? C.flatten(s.gloss) : s.gloss.toLowerCase(), overlap = 0;
          context.forEach(function (c) { if (c !== w && c.length > 2 && g.indexOf(C ? C.stem(c) : c) >= 0) overlap++; });
          var score = overlap - si * 0.01;
          if (!best || score > best.score) best = { sense: s, score: score };
        });
        out.push({ span: words[i], kind: "word", gloss: best.sense.gloss, pos: best.sense.pos, cls: best.sense.cls, source: "lexicon", senses: h.senses.length });
        i++; continue;
      }
      if (C && C.STOP[w]) { out.push({ span: words[i], kind: "function", gloss: "function word" }); i++; continue; }
      out.push({ span: words[i], kind: "unknown", gloss: "" });
      i++;
    }
    return out;
  }

  /* ------------------------------------------------- what is asked */
  var MEASURE_NOUN = { distance: { L: 1 }, length: { L: 1 }, time: { T: 1 }, duration: { T: 1 }, speed: { L: 1, T: -1 },
                       velocity: { L: 1, T: -1 }, mass: { M: 1 }, weight: { M: 1 }, volume: { V: 1 }, cost: { $: 1 },
                       price: { $: 1 }, pay: { $: 1 }, pace: { L: 1, T: -1 } };
  function asked(text, givens, gl) {
    var m = mods(), t = String(text).toLowerCase().replace(/[’]/g, "'"), mm;
    var clause = t.split(/(?<=[.!?;,])\s+/).filter(function (s) { return /\b(?:how|what|which|when|where|who|why)\b/.test(s); }).pop() || t;
    function has(d) { return givens.some(function (g) { return g.dim[d]; }); }
    if (/\bhow\s+far\b/.test(clause)) return { dim: { L: 1 }, phrase: "the distance" };
    if (/\bhow\s+(?:fast|quickly)\b/.test(clause)) return { dim: { L: 1, T: -1 }, phrase: "the speed" };
    if (/\bhow\s+heavy\b/.test(clause)) return { dim: { M: 1 }, phrase: "the mass" };
    if (/\bhow\s+long\b/.test(clause)) {
      if (/\b(?:take|takes|took|last|lasts|wait|need|spend)\b/.test(clause) || !has("L")) return { dim: { T: 1 }, phrase: "the time" };
      return { dim: { L: 1 }, phrase: "the length" };
    }
    if ((mm = clause.match(/\bhow\s+many\s+([a-z]+)/))) {
      var u = unitOf(mm[1]);
      if (u && !u.rate) return { dim: u.dim, unit: u, phrase: "the number of " + mm[1] };
      return { dim: { "#": 1 }, countNoun: mm[1], phrase: "the number of " + mm[1] };
    }
    if (/\bhow\s+much\b/.test(clause) && /\b(?:cost|costs|pay|paid|earn|earns|spend|charge|worth|price)\b/.test(clause)) return { dim: { $: 1 }, phrase: "the cost" };
    if ((mm = clause.match(/\bhow\s+much\s+(?:more\s+)?([a-z]+)/)) && !roleOf(mm[1])) {
      var noun = mm[1], nu = unitOf(noun);
      if (nu && !nu.rate) return { dim: nu.dim, unit: nu, phrase: "the number of " + noun };
      if (MEASURE_NOUN[noun]) return { dim: MEASURE_NOUN[noun], phrase: "the " + noun };
      /* a substance: measured by volume when it is a liquid or a fuel (the
         dictionary says which), or by whatever the given rates measure it in */
      if (has("V") && !has("M")) return { dim: { V: 1 }, noun: noun, phrase: "the amount of " + noun };
      if (has("M") && !has("V")) return { dim: { M: 1 }, noun: noun, phrase: "the amount of " + noun };
      var g = (gl || []).filter(function (e) { return e.span.toLowerCase() === noun; })[0];
      var LX = m.LX, senses = LX && LX.lookup(noun) ? LX.lookup(noun).senses : [];
      var liquid = (g && /liquid|fuel|drink|fluid/.test(g.gloss)) || senses.some(function (s) { return /liquid|fuel|fluid/.test(s.gloss); });
      if (liquid || senses.some(function (s) { return s.cls === "SUBSTANCE"; }))
        /* by volume or by weight: whichever the question and what is known
           about its things can actually determine */
        return { dim: liquid ? { V: 1 } : { M: 1 }, alt: [liquid ? { M: 1 } : { V: 1 }], noun: noun, phrase: "the amount of " + noun };
    }
    if ((mm = clause.match(/\bwhat\s+(?:is|was|'s)\s+(?:its|his|her|their|the)\s+([a-z]+)/)) && MEASURE_NOUN[mm[1]]) return { dim: MEASURE_NOUN[mm[1]], phrase: "the " + mm[1] };
    if ((mm = clause.match(/\bwhat\s+([a-z]+)\s+(?:is|does|do|did|will)\b/)) && MEASURE_NOUN[mm[1]]) return { dim: MEASURE_NOUN[mm[1]], phrase: "the " + mm[1] };
    return null;
  }

  /* ----------------------------------------- knowledge quantities */
  /* Quantities the question does not state but the knowledge base holds for
     the things it mentions (and for entries that are "X of" one of them:
     "speed of light" for light). Each is an assumption and says so. */
  function knowledgeQuantities(gl) {
    var m = mods(), KB = m.KB, C = m.C, out = [], seen = {};
    if (!KB) return out;
    var ents = [];
    gl.forEach(function (g) {
      if (g.kind === "entity") ents.push(g.entity);
      else if (g.kind === "word" && g.cls !== "ACTION" && KB.resolve(g.span, { strict: true })[0]) ents.push(KB.resolve(g.span, { strict: true })[0].entity.name);
    });
    /* the things the question mentions: its named entries and its nouns
       ("light" reaches the entry "speed of light") */
    gl.forEach(function (g) { if (g.kind === "word" && g.pos === "n") ents.push(g.span); });
    var names = ents.map(function (e) { return C.flatten(e); }).filter(function (n, i, a) { return n && a.indexOf(n) === i; });
    var pool = [];
    KB.entities().forEach(function (e) {
      var n = C.flatten(e.name);
      if (names.indexOf(n) >= 0 || names.some(function (x) { return new RegExp("\\bof (?:the )?" + x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$").test(n); })) pool.push(e);
    });
    pool.forEach(function (e) {
      var texts = [e.defn];
      Object.keys(e.rel || {}).forEach(function (k) { if (typeof e.rel[k] === "string") texts.push(e.rel[k] + " (" + k.replace(/_/g, " ") + ")"); });
      Object.keys(e.extra || {}).forEach(function (k) { if (typeof e.extra[k] === "string") texts.push(e.extra[k] + " (" + k.replace(/_/g, " ") + ")"); });
      texts.forEach(function (tx) {
        quantities(tx).forEach(function (q) {
          if (!dsize(q.dim)) return;
          var key = e.name + dkey(q.dim);
          if (seen[key]) return;
          seen[key] = 1;
          var label = (String(tx).match(/\(([a-z ]+)\)$/) || [])[1] || dimName(q.dim).replace(/^an? /, "");
          q.knowledge = { entity: e.name, label: label, text: String(tx).replace(/\s*\([a-z ]+\)$/, "") };
          /* approximate only when the words next to THIS number say so */
          var at = String(tx).indexOf(String(q.phrase).split(" ")[0]);
          var before = at > 0 ? String(tx).slice(Math.max(0, at - 16), at) : "";
          q.approx = q.approx || /\b(?:about|roughly|around|approximately|nearly|some)\s*$/i.test(before) || /\btypical\b/i.test(tx);
          out.push(q);
        });
      });
    });
    return out;
  }

  /* ---------------------------------------- dimensional derivation */
  /* Find exponents (-1, 0, +1) over the stated quantities -- and at most one
     known quantity -- whose product has the asked dimension. Prefer using
     every stated quantity and assuming nothing. If none matches, find the
     product that leaves the simplest missing dimension: that is what the
     question does not say, and the answer is given per unit of it when the
     missing thing is an extent (a time, a distance, a count). */
  function derive(target, givens, known) {
    var G = givens.filter(function (g) { return dsize(g.dim); }).slice(0, 6);
    var K = known.slice(0, 8);
    var exact = [], partial = [];
    var nG = G.length, total = Math.pow(3, nG);
    for (var kk = -1; kk < K.length; kk++) {
      for (var code = 0; code < total; code++) {
        var c = code, ex = [], d = {}, used = 0;
        for (var i = 0; i < nG; i++) { var e = (c % 3) - 1; c = Math.floor(c / 3); ex.push(e); if (e) { d = dmul(d, G[i].dim, e); used++; } }
        if (!used) continue;
        var variants = kk < 0 ? [0] : [1, -1];
        for (var vi = 0; vi < variants.length; vi++) {
          var dd = kk < 0 ? d : dmul(d, K[kk].dim, variants[vi]);
          var rec = { ex: ex, used: used, kn: kk < 0 ? null : { q: K[kk], e: variants[vi] } };
          if (deq(dd, target)) exact.push(rec);
          else {
            var miss = dmul(target, dd, -1);
            rec.missing = miss;
            partial.push(rec);
          }
        }
      }
    }
    function rank(a, b) {
      return (b.used - a.used) || ((a.kn ? 1 : 0) - (b.kn ? 1 : 0)) ||
             (a.ex.reduce(function (s, x) { return s + Math.abs(x); }, 0) - b.ex.reduce(function (s, x) { return s + Math.abs(x); }, 0));
    }
    exact.sort(rank);
    if (exact.length && exact[0].used === nG) return { status: "solved", rec: exact[0], G: G };
    /* missing an extent: the simplest leftover dimension */
    var extents = partial.filter(function (p) { return dsize(p.missing) === 1 && ["T", "L", "#", "M", "V", "$"].some(function (b) { return p.missing[b] === 1; }); });
    extents.sort(function (a, b) { return (b.used - a.used) || ((b.kn ? 1 : 0) - (a.kn ? 1 : 0)) || rank(a, b); });
    /* a leftover with a name (a speed, a flow rate, or the inverse of one)
       is a quantity someone could supply; prefer it */
    function named(p) { return DIM_NAME[dkey(p.missing)] || DIM_NAME[dkey(dmul({}, p.missing, -1))] ? 0 : 1; }
    var simplest = partial.slice().sort(function (a, b) { return (b.used - a.used) || (dsize(a.missing) - dsize(b.missing)) || (named(a) - named(b)) || rank(a, b); });
    if (extents.length && extents[0].used === nG) return { status: "underdetermined", rec: extents[0], G: G, alt: simplest[0] };
    if (exact.length) return { status: "solved", rec: exact[0], G: G };
    if (simplest.length) return { status: "underdetermined", rec: simplest[0], G: G };
    return { status: "none", G: G };
  }

  /* ------------------------------------------------------ rendering */
  function fmt(v) {
    var m = mods();
    if (!isFinite(v)) return String(v);
    var r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
    return m.RS && m.RS.fmtNumber ? m.RS.fmtNumber(r) : String(r);
  }
  function plural(name, v) { return Math.abs(v - 1) < 1e-9 ? name : (/(?:ch|sh|x|s)$/.test(name) ? name + "es" : /[^aeiou]y$/.test(name) ? name.slice(0, -1) + "ies" : name + "s"); }
  /* The unit to answer in: the one the question asked for, else the units
     the question (or the assumed knowledge) used for each base dimension. */
  function unitFor(target, ask, quantities_) {
    if (ask && ask.unit) return { name: ask.unit.name, scale: ask.unit.scale, simple: !ask.unit.rate };
    var per = {};
    quantities_.forEach(function (q) {
      var names = q.units || (q.unit ? [q.unit] : []);
      if (!names.length) return;
      if (names.length === 2) {
        var a = unitOf(names[0]) || (q.dim["#"] ? { dim: { "#": 1 }, scale: 1, name: names[0] } : null), b = unitOf(names[1]);
        [a, b].forEach(function (u) { if (u) { var k = dkey(u.dim); if (dsize(u.dim) === 1 && !per[k]) per[k] = u; } });
      } else {
        var u = unitOf(names[0]) || (q.dim["#"] ? { dim: { "#": 1 }, scale: 1, name: names[0] } : null);
        if (u && dsize(u.dim) === 1 && !per[dkey(u.dim)]) per[dkey(u.dim)] = u;
      }
    });
    if (ask && ask.countNoun) per["#1"] = { dim: { "#": 1 }, scale: 1, name: singular(ask.countNoun) };
    var num_ = [], den = [], scale = 1, ok = true;
    BASE.forEach(function (b) {
      var e = target[b]; if (!e) return;
      var u = per[b + "1"]; if (!u) { ok = false; return; }
      for (var i = 0; i < Math.abs(e); i++) { if (e > 0) { num_.push(u.name); scale *= u.scale; } else { den.push(u.name); scale /= u.scale; } }
    });
    if (!ok || !num_.length) return null;
    return { name: num_.join(" ") + (den.length ? " per " + den.join(" per ") : ""), scale: scale, simple: !den.length && num_.length === 1 };
  }
  function show(q) {
    if (q.knowledge) return (q.approx ? "about " : "") + fmt(q.raw) + " " + String(q.unit || "").replace(/^(\S+)/, function (w) { return plural(w, q.raw); });
    return q.phrase.replace(/\s+/g, " ");
  }

  /* ----------------------------------------------------------- read */
  function read(text) {
    var gl = glossary(text);
    var qs = quantities(text);
    var givens = qs.filter(function (q) { return dsize(q.dim); });
    var ask = asked(text, givens, gl);
    var content = gl.filter(function (g) { return g.kind === "entity" || g.kind === "word" || g.kind === "unknown"; });
    var askWord = ask ? ask.phrase.split(" ").pop() : "";
    var about = [];
    content.forEach(function (g) {
      if (!(g.kind === "entity" || g.pos === "n" || g.kind === "unknown")) return;
      var k = singular(g.span.toLowerCase());
      if (k === singular(askWord) || about.some(function (a) { return singular(a.toLowerCase()) === k; })) return;
      about.push(g.span);
    });
    var summary = "Asked: " + (ask ? ask.phrase + " (" + dimName(ask.dim) + ")" : (gl.filter(function (g) { return g.kind === "function" && /question word/.test(g.gloss); }).map(function (g) { return g.span.toLowerCase(); })[0] || "a statement") + " about " + (about.join(", ") || "the words given")) +
                  (givens.length ? ". Given: " + givens.map(function (q) { return show(q) + " (" + dimName(q.dim) + ")"; }).join("; ") : "") +
                  (about.length ? ". About: " + about.join(", ") : "") + ".";
    var query = about.concat(ask && ask.noun ? [ask.noun] : []).concat(ask ? [ask.phrase.replace(/^the (?:number of |amount of )?/, "")] : [])
      .filter(function (w, i, a) { return w && a.indexOf(w) === i; }).join(" ");
    return { glossary: gl, quantities: qs, givens: givens, asked: ask, about: about, summary: summary, query: query,
             unknown: gl.filter(function (g) { return g.kind === "unknown"; }).map(function (g) { return g.span; }) };
  }

  /* Solve a quantitative question by dimensions, or say exactly what it
     leaves open. Returns null when the question is not quantitative. */
  function solveQuantity(text) {
    if (String(text).split(/\s+/).length > 80) return null;
    var r = read(text);
    if (!r.asked || !r.givens.length) return null;
    var known = knowledgeQuantities(r.glossary).filter(function (k) { return !r.givens.some(function (g) { return deq(g.dim, k.dim); }); });
    var d = derive(r.asked.dim, r.givens, known);
    (r.asked.alt || []).forEach(function (alt) {
      if (d.status === "solved") return;
      var d2 = derive(alt, r.givens, known);
      if (d2.status === "solved") { d = d2; r.asked.dim = alt; }
    });
    if (d.status === "none") return null;
    var rec = d.rec, G = d.G, parts = [], value = 1, num_ = [], den = [];
    G.forEach(function (g, i) {
      var e = rec.ex[i]; if (!e) return;
      value *= Math.pow(g.value, e);
      (e > 0 ? num_ : den).push(show(g));
    });
    var assumption = "";
    if (rec.kn) {
      value *= Math.pow(rec.kn.q.value, rec.kn.e);
      (rec.kn.e > 0 ? num_ : den).push(show(rec.kn.q));
      var ent = rec.kn.q.knowledge.entity.toLowerCase(), lab = rec.kn.q.knowledge.label;
      assumption = ent.indexOf(lab) >= 0 ?
        "using the " + ent + ", " + show(rec.kn.q) + ", from the knowledge base" :
        "assuming a typical " + ent + "'s " + lab + " of " + show(rec.kn.q) + " (from the knowledge base; the question doesn't state it)";
    }
    var formula = num_.join(" × ") + (den.length ? " ÷ " + den.join(" ÷ ") : "");
    var out = { reading: r, status: d.status, summary: r.summary, assumption: assumption };
    if (d.status === "solved") {
      var u = unitFor(r.asked.dim, r.asked, r.givens.concat(rec.kn ? [rec.kn.q] : []));
      if (!u) return null;
      var v = value / u.scale;
      out.value = v; out.unit = u.name;
      out.text = (rec.kn && rec.kn.q.approx ? "About " : "") + fmt(v) + " " + u.name.replace(/^(\S+)/, function (w) { return plural(w, v); }) + " — " + formula + "." +
                 (assumption ? " That is " + assumption + "." : "");
      out.derivation = formula;
      return out;
    }
    /* under-determined: name what is missing, give the relationship, and a
       rate per unit of the missing extent when it is one */
    var miss = rec.missing, missKey = dkey(miss), inv = dmul({}, miss, -1);
    /* a missing "time per distance" is a missing speed, divided by */
    var byInverse = !DIM_NAME[missKey] && !MISSING_ASK[missKey] && !!DIM_NAME[dkey(inv)];
    var need = MISSING_ASK[missKey] ? MISSING_ASK[missKey] : byInverse ? DIM_NAME[dkey(inv)] : dimName(miss);
    var missName = (byInverse ? DIM_NAME[dkey(inv)] : dimName(miss)).replace(/^an? /, "").replace(/^length of /, "");
    var numer = num_.concat(byInverse ? [] : [missName]), denom = den.concat(byInverse ? [missName] : []);
    var rel = r.asked.phrase.replace(/^the /, "") + " = " + (numer.length ? numer.join(" × ") : "1") + (denom.length ? " ÷ " + denom.join(" ÷ ") : "");
    var text2 = "That depends on " + need + ", which the question doesn't say: " + rel + ".";
    if (dsize(miss) === 1 && miss[BASE.filter(function (b) { return miss[b]; })[0]] === 1) {
      var rateDim = dmul(r.asked.dim, miss, -1);
      var ru = unitFor(rateDim, null, r.givens.concat(rec.kn ? [rec.kn.q] : []));
      /* a rate that is just a stated quantity restated adds nothing */
      var restated = !rec.kn && rec.ex.filter(function (e) { return e; }).length === 1;
      if (ru && !restated) {
        var rv = value / ru.scale;
        out.rate = { value: rv, unit: ru.name };
        var perName = ru.name.split(" per ").slice(1).join(" per ");
        text2 += " At " + (rec.kn ? "that" : "the given") + " rate it's " + (rec.kn && rec.kn.q.approx ? "about " : "") + fmt(rv) + " " + ru.name.replace(/^(\S+)/, function (w) { return plural(w, rv); }) +
                 (perName ? "" : "") + " — " + formula + "." +
                 (assumption ? " That is " + assumption + "." : "");
      }
    } else if (rec.missing) {
      /* a leftover with no name is a sign the question was misread, not a
         quantity anyone could supply: say nothing rather than nonsense */
      if (!MISSING_ASK[missKey] && !DIM_NAME[missKey] && !byInverse) return null;
      text2 += " Give me " + (byInverse ? DIM_NAME[dkey(inv)] : dimName(miss)) + " and I can work it out.";
    }
    out.text = text2;
    out.missing = need;
    return out;
  }

  root.C4LMComprehend = {
    read: read, glossary: glossary, quantities: quantities, asked: asked, solveQuantity: solveQuantity,
    unitOf: unitOf, dimName: dimName, derive: derive, knowledgeQuantities: knowledgeQuantities
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMComprehend;
})(typeof window !== "undefined" ? window : globalThis);
