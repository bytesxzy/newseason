/* CELL4 answer planning and surface realization.
 *
 * The old path picked sentences and concatenated them, which is where "is is",
 * dangling conjunctions, duplicated subjects and pasted search snippets came
 * from. Here an ANSWER PLAN is chosen from the question type, filled with
 * propositions, and only then realised as English -- with article selection,
 * subject agreement, connectives, and a final well-formedness pass that
 * rejects the defects rather than hoping they do not occur.
 *
 * No model service. Grammar and templates, driven by structured content.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;

  /* ------------------------------------------------------------ grammar */

  var VOWEL_SOUND = /^(?:[aeiou]|hour|honest|heir|x-|f-|m-|n-|s-|l-|r-)/i;
  var CONSONANT_ACRONYM = /^(?:u[bnkrs]|eu|one|once|uni)/i;
  function article(word) {
    var w = String(word || "").trim();
    if (!w) return "a";
    if (CONSONANT_ACRONYM.test(w)) return "a";
    return VOWEL_SOUND.test(w) ? "an" : "a";
  }
  function capitalize(s) {
    s = String(s || "").trim();
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function terminate(s) {
    s = String(s || "").trim();
    if (!s) return s;
    return /[.!?:;]$/.test(s) ? s : s + ".";
  }
  /* Plural agreement for a bare noun phrase used as a subject. */
  function isPlural(np) {
    var head = String(np).trim().split(/\s+/).pop() || "";
    return /(?:[^s]s|ies|men|people|data|children)$/i.test(head) && !/(?:ss|us|is)$/i.test(head);
  }
  function copula(np) { return isPlural(np) ? "are" : "is"; }

  var DANGLING = /\b(?:and|or|but|nor|so|yet|of|the|a|an|to|for|in|on|at|by|with|from|as|that|which|who|whose|when|where|because|since|while|if|than|then|into|onto|over|under|between|among|is|are|was|were|be|been|being|has|have|had|do|does|did)\s*$/i;
  function trimDangling(s) {
    s = String(s || "").replace(/[\s,;:–—-]+$/, "");
    var prev;
    do { prev = s; s = s.replace(DANGLING, "").replace(/[\s,;:–—-]+$/, ""); } while (s && s !== prev);
    return s;
  }

  /* Remove a restated subject: "Photosynthesis is Photosynthesis is the
     process..." collapses to one clause. Also kills doubled copulas. */
  function deduplicate(s) {
    s = String(s || "");
    s = s.replace(/\b(is|are|was|were|has|have|had)\s+\1\b/gi, "$1");
    s = s.replace(/\b([A-Za-z][\w-]{2,})\s+\1\b/g, "$1");
    s = s.replace(/\b(a|an|the|of|to|in|on|for|and|or)\s+\1\b/gi, "$1");
    /* "X is X is Y" -> "X is Y" */
    s = s.replace(/\b(.{2,50}?)\s+(is|are)\s+\1\s+\2\b/gi, "$1 $2");
    return s.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1");
  }

  /* A source sentence is evidence, not prose to paste. Strip the encyclopedic
     furniture and the parenthetical pronunciation clutter, and make the
     clause stand on its own. */
  function cleanClause(s) {
    return String(s || "")
      .replace(/\([^)]{0,120}?(?:listen|pronounced|IPA|\/[^\/]+\/)[^)]*\)/gi, "")
      .replace(/\[\d+\]/g, "")
      .replace(/\s*\([^)]{0,6}\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* A common noun used as a subject takes a definite article; a proper name
     does not. Capitalisation in the knowledge base marks the difference. */
  function definite(np) {
    var s = String(np || "").trim();
    if (!s) return s;
    if (/^[A-Z0-9]/.test(s)) return s;
    return "The " + s;
  }
  function pluralize(w) {
    w = String(w || "").trim();
    if (!w) return w;
    if (/(?:s|x|z|ch|sh)$/i.test(w)) return w + "es";
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + "ies";
    return w + "s";
  }

  function joinList(items, conj) {
    items = items.filter(Boolean);
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + " " + (conj || "and") + " " + items[1];
    return items.slice(0, -1).join(", ") + ", " + (conj || "and") + " " + items[items.length - 1];
  }

  function clipSentences(text, n) {
    if (!n) return text;
    var parts = String(text).match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [text];
    var kept = parts.filter(function (p) { return /\w/.test(p); }).slice(0, n).join(" ").trim();
    return terminate(trimDangling(kept.replace(/[.!?]+$/, "")));
  }

  /* --------------------------------------------------------- answer plans
   * A plan is a sequence of slots. Which slots exist depends on the question
   * type and on what the user asked for, not on which module produced the
   * content. */
  var PLANS = {
    definition: ["direct", "elaboration", "detail"],
    identity:   ["direct", "elaboration"],
    statement:  ["direct"],
    relation:   ["direct", "elaboration"],
    explanation:["direct", "mechanism", "detail"],
    comparison: ["direct", "contrast", "summary"],
    list:       ["direct", "items"],
    calculation:["direct", "working"],
    code:       ["direct", "code", "detail"],
    verdict:    ["direct", "justification"],
    current:    ["direct", "provenance"],
    uncertain:  ["direct", "suggestion"],
    conversation: ["direct"]
  };

  /* --------------------------------------------------------- realization */

  function realizeDefinition(plan) {
    var name = plan.name, defn = cleanClause(plan.definition || "");
    if (!defn) return "";
    var out;
    /* The definition text may already be a full sentence about the subject.
       Re-stating the subject in front of it is what produced "X is X is Y". */
    var flatName = C.flatten(name);
    var flatDefn = C.flatten(defn).replace(/^(?:the|a|an) /, "");
    /* The stored definition is usually already a sentence about the subject.
       Prefixing the subject again is what produced "X is X is Y". */
    /* A definition that is already a well-formed sentence about something is
       stated, not embedded: prefixing the entry's name produces "Day of the
       week is There are seven days in a week." */
    var completeSentence = /^[A-Z]/.test(defn.trim()) &&
      (/\b(?:is|are|was|were|has|have|means|refers|exists|comes|makes|produces)\b/.test(defn.slice(0, 90)) ||
       /* a clause opened by a determiner or pronoun has its own subject:
          "The sky looks blue because ..." */
       /^(?:The|A|An|This|These|Those|It|They|There)\s+\S+(?:\s+\S+)?\s+[a-z]+s\b/.test(defn.trim()));
    var selfContained = completeSentence || flatDefn.indexOf(flatName) === 0 ||
      new RegExp("^[a-z0-9 ]{0,30}\\b" + flatName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                 "\\b[a-z0-9 ]{0,20}\\b(?:is|are|was|were|refers|means)\\b").test(flatDefn);
    if (selfContained) {
      out = capitalize(defn);
    } else {
      out = capitalize(name) + " " + (/^(?:is|are|was|were)$/i.test(plan.copula || "") ? String(plan.copula).toLowerCase() : copula(name)) + " " + defn;
    }
    return terminate(deduplicate(trimDangling(out)));
  }

  /* A value that is itself a participial predicate ("described by Charles
     Darwin", "proposed by ...") already states how the subject relates to
     it; wrapping it in another verb garbles the sentence. */
  var PARTICIPLE_BY = /^(?:[a-z]+(?:ed|en)|built|made|written|drawn|sung|done|shown|known|found)\s+by\b/i;
  function realizeRelation(plan) {
    var subj = plan.subject, rel = plan.relationLabel || plan.relation, val = cleanClause(plan.value || "");
    if (!val) return "";
    if (PARTICIPLE_BY.test(val) && /^(?:creator|author|artist|founder|inventor|designer)$/.test(plan.relation || "")) {
      return capitalize(subj) + " " + (isPlural(subj) ? "were" : "was") + " " + val + ".";
    }
    var TEMPLATES = {
      capital: function () { return "The capital of " + subj + " is " + val + "."; },
      currency: function () { return "The currency of " + subj + " is " + val + "."; },
      language: function () { return val.indexOf(" and ") >= 0 || /^[A-Z]/.test(val) ?
        ("The language of " + subj + " is " + val + ".") : ("People in " + subj + " speak " + val + "."); },
      author: function () { return val + " wrote " + subj + "."; },
      artist: function () { return val + " created " + subj + "."; },
      creator: function () { return subj + " was created by " + val + "."; },
      symbol: function () { return "The chemical symbol for " + subj + " is " + val + "."; },
      birth: function () { return capitalize(subj) + " was born on " + val + "."; },
      death: function () { return capitalize(subj) + " died on " + val + "."; },
      population: function () { return "The population of " + subj + " is " + val + "."; },
      height: function () { return capitalize(subj) + " is " + val + " tall."; },
      length: function () { return capitalize(subj) + " is " + val + " long."; },
      distance: function () { return capitalize(subj) + " is " + val + "."; },
      speed: function () { return "The speed of " + subj + " is " + val + "."; },
      location: function () { return capitalize(subj) + " " + copula(subj) + " in " + val + "."; },
      count: function () {
        /* A bare number answers "how many X are there"; a counted noun
           answers "how many X does Y have". Different sentences. */
        if (/^[\d,.]+$|^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i.test(val.trim())) {
          return "There are " + val + " " + pluralize(subj.toLowerCase()) + ".";
        }
        return definite(subj) + " has " + val + ".";
      },
      purpose: function () { return capitalize(subj) + " " + copula(subj) + " used for " + val + "."; },
      cause: function () { return capitalize(subj) + " " + copula(subj) + " caused by " + val + "."; },
      time: function () { return capitalize(subj) + " " + (/^\d/.test(val) ? "dates to " : "was ") + val + "."; },
      version: function () { return "The current version of " + subj + " is " + val + "."; },
      price: function () { return capitalize(subj) + " " + copula(subj) + " trading at " + val + "."; },
      part: function () { return capitalize(subj) + " " + copula(subj) + " made of " + val + "."; },
      type: function () { return capitalize(subj) + " " + copula(subj) + " " + article(val) + " " + val + "."; },
      capitalOf: function () { return capitalize(subj) + " is the capital of " + val + "."; }
    };
    var fn = TEMPLATES[plan.relation];
    var out = fn ? fn() : (capitalize(subj) + "'s " + (plan.relationLabel || plan.relation) + " is " + val + ".");
    /* A value that is already a sentence is used as-is rather than embedded. */
    if (/[.!?]\s+\w/.test(val) || val.split(" ").length > 25) out = capitalize(val);
    return terminate(deduplicate(trimDangling(out)));
  }

  function realizeComparison(plan) {
    var a = plan.a, b = plan.b, dims = plan.dims || [];
    if (!dims.length) return "";
    if (plan.format === "bullets") {
      var n = plan.limit || dims.length;
      var lines = dims.slice(0, n).map(function (d) {
        return "- " + capitalize(d[0]) + ": " +
          [a, verbFor(a, d[1]), d[1]].filter(Boolean).join(" ") + ", while " +
          [b, verbFor(b, d[2]), d[2]].filter(Boolean).join(" ") + ".";
      });
      return lines.join("\n").replace(/\s+—\.$/gm, ".");
    }
    var head = capitalize(a) + " and " + b + " differ in " +
      (dims.length === 1 ? "one respect" : dims.length + " main respects") + ". ";
    var body = dims.slice(0, plan.limit || 4).map(function (d) {
      return [capitalize(a), verbFor(a, d[1]), d[1]].filter(Boolean).join(" ") + ", while " +
             [b, verbFor(b, d[2]), d[2]].filter(Boolean).join(" ") + ".";
    }).join(" ");
    return deduplicate(head + body).replace(/\s*,?\s*while\s+\w+\s+—\./g, ".");
  }
  /* A contrast fragment is either a predicate ("sets up a connection") or a
     noun phrase ("the amount of matter"). A noun phrase needs a copula, in
     agreement with its subject; a predicate already has its verb. */
  var AUX_HEAD = /^(?:is|are|was|were|has|have|had|does|do|did|can|may|might|must|will|would|should|only|never|always|usually|often)\b/i;
  var KNOWN_VERB = /^(?:keeps?|loses?|uses?|sends?|sets?|delivers?|makes?|produces?|retransmits?|guarantees?|supports?|provides?|requires?|allows?|runs?|works?|stores?|holds?|handles?|changes?|finds?|learns?|maps?|measures?|needs?|takes?|gives?|comes?|goes?|sits?|reads?|writes?|adds?|removes?|creates?|returns?|shows?|starts?|stops?|grows?|falls?|rises?|moves?|covers?|carries?|wraps?|sorts?|counts?|filters?|splits?|joins?|descends?|presents?|says?|means?|drops?|tracks?|records?|applies|dates?|speaks?|lies|lives?|orbits?)\b/i;
  function verbFor(subject, phrase) {
    var p = String(phrase || "").trim();
    if (!p || p === "—") return "";
    if (KNOWN_VERB.test(p) || AUX_HEAD.test(p)) return "";
    return copula(subject);
  }

  function realizeExplanation(plan) {
    var head = cleanClause(plan.direct || "");
    var mech = cleanClause(plan.mechanism || "");
    var parts = [];
    if (head) parts.push(terminate(capitalize(head)));
    if (mech && C.flatten(mech) !== C.flatten(head)) parts.push(terminate(capitalize(mech)));
    return deduplicate(parts.join(" "));
  }

  function realizeList(plan) {
    var items = (plan.items || []).filter(Boolean);
    if (!items.length) return "";
    if (plan.format === "bullets" || items.length > 3) {
      return items.slice(0, plan.limit || items.length).map(function (i) { return "- " + capitalize(terminate(i)); }).join("\n");
    }
    return terminate(capitalize(joinList(items)));
  }

  function realizeCalculation(plan) {
    if (plan.onlyValue) return String(plan.value);
    var unit = plan.unit || "";
    var head = unit === "$" || unit === "£" || unit === "€" ?
      (unit + String(plan.value)) : (String(plan.value) + (unit ? " " + unit : ""));
    var lead = String(plan.lead || "");
    var out = lead ? (capitalize(lead.trim()) + " " + head) : capitalize(head);
    if (plan.showWorking && plan.steps && plan.steps.length) {
      out += ". " + plan.steps.join("; ") + ".";
      return deduplicate(out.replace(/\.\s*\./g, "."));
    }
    return terminate(out);
  }

  /* --------------------------------------------- well-formedness contract */

  var DEFECTS = [
    { id: "duplicate_copula", re: /\b(is|are|was|were|has|have)\s+\1\b/i },
    { id: "duplicate_word", re: /\b([a-z]{4,})\s+\1\b/i },
    /* "that" and "which" can legitimately end a sentence as demonstratives
       ("I'll work from that."), so they are not treated as dangling. */
    { id: "dangling", re: /\b(?:and|or|but|because|of|the|to|with|from|than)\s*[.!?]\s*$/i },
    { id: "empty", re: /^\s*$/ },
    { id: "raw_html", re: /<\/?(?:div|span|p|br|script|a|img)\b/i },
    { id: "undefined_token", re: /\b(?:undefined|NaN|\[object Object\])\b/ },
    { id: "snippet_start", re: /^\s*(?:\.\.\.|…|,|;)/ },
    { id: "double_punct", re: /\s+[,.;:]|[,.;:]{2,}(?!\.)/ },
    { id: "orphan_dash", re: /\s—\s*[.!?]/ }
  ];

  function inspect(text) {
    var found = [];
    for (var i = 0; i < DEFECTS.length; i++) if (DEFECTS[i].re.test(text)) found.push(DEFECTS[i].id);
    /* repeated whole sentence */
    var seen = Object.create(null);
    var parts = String(text).split(/(?<=[.!?])\s+/);
    for (var j = 0; j < parts.length; j++) {
      var k = C.flatten(parts[j]);
      if (k.length > 12) { if (seen[k]) { found.push("repeated_sentence"); break; } seen[k] = 1; }
    }
    return found;
  }

  /* Best-effort repair, then a verdict. A defect that cannot be repaired is
     reported so the caller can fall back rather than ship broken prose. */
  function polish(text) {
    var out = String(text || "");
    out = out.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1");
    out = deduplicate(out);
    out = out.replace(/([,.;:])\1+/g, "$1");
    out = out.replace(/\s—\s*([.!?])/g, "$1");
    /* de-duplicate identical adjacent sentences */
    var parts = out.split(/(?<=[.!?])\s+/), kept = [], seen = Object.create(null);
    for (var i = 0; i < parts.length; i++) {
      var k = C.flatten(parts[i]);
      if (k.length > 12 && seen[k]) continue;
      seen[k] = 1;
      kept.push(parts[i]);
    }
    out = kept.join(" ").trim();
    out = trimDangling(out.replace(/[.!?]+$/, "")) + (/[.!?]$/.test(out) ? out.slice(-1) : ".");
    out = out.replace(/\.\.$/, ".").replace(/([!?])\.$/, "$1");
    return out.trim();
  }

  /* ------------------------------------------------------------ assembly */

  function realizeOnce(plan, override) {
    var body = "";
    if (override && override.body) body = override.body;
    else switch (plan.kind) {
      case "definition": body = realizeDefinition(plan); break;
      case "relation":   body = realizeRelation(plan); break;
      case "comparison": body = realizeComparison(plan); break;
      case "explanation":body = realizeExplanation(plan); break;
      case "list":       body = realizeList(plan); break;
      case "calculation":body = realizeCalculation(plan); break;
      case "statement":  body = terminate(capitalize(cleanClause(plan.statement || ""))); break;
      default:           body = String(plan.text || "");
    }
    if (!body) return { text: "", defects: ["empty"] };

    /* Elaboration is optional and only added when it says something new and
       the user did not ask for brevity. */
    if (plan.elaboration && plan.format !== "value" && plan.tone !== "brief" &&
        !plan.lengthLimit && plan.kind !== "comparison") {
      var extra = cleanClause(plan.elaboration);
      if (extra && C.flatten(extra).indexOf(C.flatten(body).slice(0, 30)) < 0 &&
          C.flatten(body).indexOf(C.flatten(extra).slice(0, 30)) < 0 && !restates(body, extra)) {
        /* a template that opens with the value would give "It" the wrong antecedent */
        if (override && override.valueFirst && /^It\b/.test(extra) && plan.subject) extra = extra.replace(/^It\b/, capitalize(plan.subject));
        body += " " + terminate(capitalize(extra));
      }
    }
    if (plan.caveat) body += " " + terminate(capitalize(cleanClause(plan.caveat)));

    if (plan.format === "value") {
      var v = plan.value != null ? String(plan.value) : body.replace(/[.]$/, "");
      return { text: v, defects: [] };
    }

    var text = plan.format === "bullets" ? body : polish(body);
    if (plan.lengthLimit && plan.lengthUnit === "sentences") text = clipSentences(text, plan.lengthLimit);
    if (plan.lengthLimit && plan.lengthUnit === "words") {
      var w = text.split(/\s+/);
      if (w.length > plan.lengthLimit) text = terminate(trimDangling(w.slice(0, plan.lengthLimit).join(" ")));
    }
    return { text: text, defects: inspect(text) };
  }

  /* ---------------------------------------------------------- variation
     The same content should not come back in the same words every time it is
     asked for. Variation happens here, last, and only in ways that cannot
     change what is claimed: which of several equivalent templates carries a
     relation, whether an appositive list is one sentence or two, a participle
     or a relative clause, one of a set of synonymous connectives. Every
     candidate keeps every number and every proper name of the canonical
     wording, passes the same well-formedness contract, and respects the
     requested length. When a question is asked again, the candidate least
     like what was already said wins, and a fact not yet shown is added. */
  var VARY = { on: true, rng: Math.random, key: "", history: Object.create(null), order: [], lastPick: Object.create(null) };
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedVariation(n) {
    VARY.rng = (n == null || n === "" || isNaN(Number(n))) ? Math.random : mulberry32(Number(n) >>> 0);
  }
  function rand() { return VARY.rng(); }
  function pickOne(list) { return list[Math.floor(rand() * list.length) % list.length]; }
  function historyFor(key) { return VARY.history[String(key || "")] || []; }
  function beginVariation(key) { VARY.key = String(key || ""); }
  function commitVariation(key, text) {
    key = String(key == null ? VARY.key : key);
    if (!key || !text) return;
    if (!VARY.history[key]) {
      VARY.history[key] = []; VARY.order.push(key);
      if (VARY.order.length > 300) delete VARY.history[VARY.order.shift()];
    }
    var h = VARY.history[key];
    h.push(String(text));
    if (h.length > 8) h.shift();
  }
  function chooseVariant(list, key) {
    if (!list || !list.length) return "";
    var last = VARY.lastPick[key];
    var pool = list.length > 1 ? list.filter(function (x) { return x !== last; }) : list;
    var p = VARY.on ? pickOne(pool) : list[0];
    VARY.lastPick[key] = p;
    return p;
  }
  function ff2(s) { return String(s || "").toLowerCase().replace(/['\u2019]s\b/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
  function grams(s) {
    var w = ff2(s).split(" ").filter(Boolean), g = Object.create(null);
    for (var i = 0; i < w.length; i++) g[w[i] + " " + (w[i + 1] || "")] = 1;
    return g;
  }
  function similarity(a, b) {
    var ga = grams(a), gb = grams(b), inter = 0, na = 0, nb = 0, k;
    for (k in ga) { na++; if (gb[k]) inter++; }
    for (k in gb) nb++;
    return (na + nb - inter) ? inter / (na + nb - inter) : 1;
  }
  var ORTHO = /^(?:It|Its|They|Their|The|This|That|These|Those|In|On|At|As|For|From|With|By|Also|One|Some|Many|Most|There|Here|When|While|Because|Although|However|If|A|An|People|Same|Once|Again|To|Put|Up|Our|We|So|Another|Something|After|Yes|No)$/;
  function anchors(s) {
    var out = [], re = /\b\d[\d,.]*\d\b|\b\d\b|\b[A-Z][A-Za-z'\u2019-]*[A-Za-z]\b/g, m;
    while ((m = re.exec(String(s)))) {
      var w = m[0].replace(/['\u2019]s$/, "");
      if (/^[A-Z]/.test(w) && (C.STOP[w.toLowerCase()] || ORTHO.test(w))) continue;
      out.push(ff2(w));
    }
    return out;
  }
  function keepsAnchors(base, cand) {
    var fc = " " + ff2(cand) + " ";
    return anchors(base).every(function (a) { return !a || fc.indexOf(" " + a + " ") >= 0; });
  }
  function restates(body, extra) {
    var b = " " + ff2(body) + " ";
    var ws = ff2(extra).split(" ").filter(function (w) { return w.length > 2 && !C.STOP[w] && w !== "its"; });
    if (!ws.length) return false;
    for (var i = 0; i < ws.length; i++) if (b.indexOf(" " + ws[i] + " ") < 0) return false;
    return true;
  }
  function sentenceCount(t) { return (String(t).match(/[.!?]+(?=\s|$)/g) || []).length || 1; }
  function wordCount(t) { return String(t).trim().split(/\s+/).filter(Boolean).length; }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function possessiveOf(x) { x = String(x || ""); return /s$/i.test(x) ? x + "'" : x + "'s"; }

  /* synonymous connectives; a third element marks a one-way substitution */
  var SWAPS = [
    ["starting on", "beginning on"], ["located in", "situated in"], ["approximately", "roughly"],
    ["is known as", "is called", 1], ["are known as", "are called", 1], ["also known as", "also called"],
    ["a type of", "a kind of"], ["consists of", "is made up of"], ["consist of", "are made up of"],
    ["is caused by", "results from"], ["are caused by", "result from"], ["for example", "for instance"],
    ["was designated as", "was named", 1], ["famous", "well-known"], ["the process by which", "the process through which"],
    ["is able to", "can", 1], ["are able to", "can", 1], ["the majority of", "most of", 1],
    ["usually", "typically"], ["primarily", "mainly"], ["in addition,", "additionally,"], ["commonly", "often", 1]
  ];
  function swapOnce(s) {
    var opts = [];
    SWAPS.forEach(function (p) {
      [[p[0], p[1]], p[2] ? null : [p[1], p[0]]].forEach(function (d) {
        if (!d) return;
        var re = new RegExp("\\b" + esc(d[0]) + (/,$/.test(d[0]) ? "" : "\\b"), "i");
        if (re.test(s)) opts.push({ re: re, to: d[1] });
      });
    });
    if (!opts.length) return null;
    var o = pickOne(opts);
    return String(s).replace(o.re, function (m0) { return /^[A-Z]/.test(m0) ? capitalize(o.to) : o.to; });
  }
  var PARTICIPLE = { starting: "start", beginning: "begin", ending: "end", running: "run", lying: "lie",
                     stretching: "stretch", extending: "extend", flowing: "flow", bordering: "border",
                     connecting: "connect", linking: "link", consisting: "consist", spanning: "span",
                     covering: "cover", serving: "serve", operating: "operate", originating: "originate", dating: "date" };
  var PAST = { begin: "began", run: "ran", lie: "lay" };
  function pastOf(b) {
    if (PAST[b]) return PAST[b];
    if (/e$/.test(b)) return b + "d";
    if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + "ied";
    if (/^[^aeiou]*[aeiou][bdgmnprt]$/.test(b)) return b + b.slice(-1) + "ed";
    return b + "ed";
  }
  function presentOf(b, pl) {
    if (pl) return b;
    if (/(?:s|x|z|ch|sh)$/.test(b)) return b + "es";
    if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + "ies";
    return b + "s";
  }
  /* "a leap year starting on Friday" -> "a leap year that started on Friday" */
  function relativize(s) {
    s = String(s);
    var re = /\b([A-Za-z][\w-]*)\s+(starting|beginning|ending|running|lying|stretching|extending|flowing|bordering|connecting|linking|consisting|spanning|covering|serving|operating|originating|dating)\s+(on|in|at|from|with|by|into|over|under|through|to|across|along|between|around|of|back|for)\b/;
    var m = s.match(re);
    if (!m || C.STOP[m[1].toLowerCase()] || /(?:ing|ly)$/.test(m[1])) return null;
    var cm = s.slice(0, m.index).match(/\b(?:is|are|was|were)\b/gi);
    var past = cm && /^(?:was|were)$/i.test(cm[cm.length - 1]);
    var base = PARTICIPLE[m[2]];
    var verb = past ? pastOf(base) : presentOf(base, isPlural(m[1]));
    return s.slice(0, m.index) + m[1] + " that " + verb + " " + m[3] + s.slice(m.index + m[0].length);
  }
  var PERSONISH = /\b(?:born|died|he|she|his|her|actor|actress|singer|writer|author|poet|politician|physicist|scientist|chemist|biologist|mathematician|musician|artist|painter|philosopher|engineer|inventor|businessman|entrepreneur|president|king|queen|emperor|footballer|player|composer|director)\b/i;
  /* "X was A, the B, and the C." -> "X was A. It was also the B and the C." */
  function splitAppositive(text) {
    var t = String(text), cut = t.search(/[.!?]\s+(?=[A-Z0-9])/);
    var first = cut < 0 ? t : t.slice(0, cut + 1), rest = cut < 0 ? "" : t.slice(cut + 1);
    var m = first.match(/^(.{1,90}?)\s(is|are|was|were)\s(.+?)([.!?])$/);
    if (!m) return null;
    var body = m[3], depth = 0, at = -1;
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i);
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      else if (ch === "," && !depth && /^,\s+(?:the|a|an)\s/i.test(body.slice(i))) { at = i; break; }
    }
    if (at < 0) return null;
    var head = body.slice(0, at).trim(), tail = body.slice(at + 1).trim();
    if (head.split(/\s+/).length < 3 || tail.split(/\s+/).length < 4) return null;
    if (/\b(?:is|are|was|were|has|have|had|which|who|whose|where|when|while)\b/i.test(tail)) return null;
    var subj = m[1], pron = isPlural(subj) ? "They" : "It";
    if (PERSONISH.test(first)) { var ws = subj.trim().split(/\s+/); pron = ws[ws.length - 1]; }
    return subj + " " + m[2] + " " + head + ". " + pron + " " + m[2] + " also " + tail + m[4] + rest;
  }
  function surfaceVariants(t, allowSplit) {
    var out = [t], r = relativize(t), w = swapOnce(t), rw = r ? swapOnce(r) : null;
    [r, w, rw].forEach(function (x) { if (x) out.push(x); });
    if (allowSplit) out.slice().forEach(function (x) { var sp = splitAppositive(x); if (sp) out.push(sp); });
    return out;
  }
  var RELATION_ALTS = {
    capital: [function (S, v, V, P) { return { text: V + " is the capital of " + S, valueFirst: true }; },
              function (S, v, V, P) { return { text: P + " capital is " + v }; },
              function (S, v) { return { text: S + " has " + v + " as its capital" }; }],
    currency: [function (S, v, V, P) { return { text: P + " currency is " + v }; },
               function (S, v) { return { text: S + " uses " + v + " as its currency" }; }],
    language: [function (S, v, V) { return { text: V + " " + (/\band\b|,/.test(v) ? "are" : "is") + " spoken in " + S, valueFirst: true }; },
               function (S, v) { return { text: "People in " + S + " speak " + v }; }],
    author: [function (S, v) { return { text: S + " was written by " + v }; }],
    artist: [function (S, v) { return { text: S + " was created by " + v }; },
             function (S, v) { return { text: S + " is the work of " + v }; }],
    creator: [function (S, v, V, P, s) { return { text: V + " created " + s, valueFirst: true }; }],
    symbol: [function (S, v, V, P) { return { text: P + " chemical symbol is " + v }; },
             function (S, v) { return { text: S + " has the chemical symbol " + v }; }],
    birth: [function (S, v, V, P) { return { text: P + " date of birth is " + v.replace(/^on\s+/i, "") }; }],
    death: [function (S, v) { return /^\d|^[A-Z][a-z]+ \d/.test(v) ? { text: S + " passed away on " + v } : null; }],
    population: [function (S, v) { return { text: S + " has a population of " + v }; },
                 function (S, v) { return /people|inhabitants|residents/i.test(v) ? null : { text: S + " is home to " + v + " people" }; }],
    height: [function (S, v) { return { text: S + " stands " + v + " tall" }; }],
    length: [function (S, v) { return { text: S + " measures " + v + " in length" }; }],
    speed: [function (S, v, V, P, s) { return { text: capitalize(s) + " travels at " + v }; }],
    location: [function (S, v, V, P, s) { return { text: S + " " + copula(s) + " located in " + v.replace(/^in\s+/i, "") }; },
               function (S, v, V, P, s) { return { text: S + " " + (isPlural(s) ? "lie" : "lies") + " in " + v.replace(/^in\s+/i, "") }; }],
    cause: [function (S, v, V, P, s) { return { text: S + " " + (isPlural(s) ? "result" : "results") + " from " + v }; }],
    version: [function (S, v, V, P, s) { return { text: "The latest version of " + s + " is " + v }; }],
    part: [function (S, v, V, P, s) { return { text: S + " " + (isPlural(s) ? "consist" : "consists") + " of " + v }; }],
    capitalOf: [function (S, v) { return { text: S + " serves as the capital of " + v }; }]
  };
  function leadAlternatives(lead) {
    lead = String(lead || "");
    if (/=\s*$/.test(lead)) { var ex = lead.replace(/\s*=\s*$/, ""); return [ex + " comes to ", ex + " works out to ", ex + " equals "]; }
    return ({ "The new price is ": ["The new price comes to ", "After the discount it comes to "],
              "It travels ": ["It covers "], "That is ": ["That's ", "That comes to "],
              "The average is ": ["The mean is ", "That averages out to "],
              "The probability is ": ["The chance is "] })[lead] || [];
  }
  function alternativeBodies(plan) {
    var out = [];
    if (plan.kind === "relation") {
      var s = String(plan.subject || ""), v = cleanClause(plan.value || "");
      if (!s || !v || /[.!?]\s+\w/.test(v) || v.split(" ").length > 25) return out;
      if (PARTICIPLE_BY.test(v)) return out;
      (RELATION_ALTS[plan.relation] || []).forEach(function (fn) {
        var r = fn(capitalize(s), v, capitalize(v), capitalize(possessiveOf(s)), s);
        if (r && r.text) out.push({ body: terminate(deduplicate(trimDangling(r.text))), valueFirst: !!r.valueFirst });
      });
    } else if (plan.kind === "comparison") {
      var base = realizeComparison(plan);
      if (base && /, while /.test(base)) out.push({ body: base.replace(/, while /g, ", whereas ") });
      if (base && / main respects?\./.test(base)) out.push({ body: base.replace(/ main respects\./, " main ways.").replace(/ main respect\./, " main way.") });
    } else if (plan.kind === "calculation") {
      leadAlternatives(plan.lead).forEach(function (l) {
        var p2 = {}, k;
        for (k in plan) p2[k] = plan[k];
        p2.lead = l;
        var b = realizeCalculation(p2);
        if (b) out.push({ body: b });
      });
    }
    return out;
  }
  function variationEligible(plan) {
    if (!VARY.on || !plan || plan.vary === false || plan.onlyValue) return false;
    if (plan.format === "value" || plan.format === "bullets" || plan.format === "lines") return false;
    return /^(?:definition|relation|statement|explanation|comparison|calculation)$/.test(plan.kind);
  }
  var REPEAT_OPENERS = ["As I said:", "Once more:", "Same as before:", "To recap:", "Again:"];
  var EXTRA_LEADS = ["One more detail:", "Also worth knowing:", "Something I didn't mention before:", "On top of that:", "Another fact:"];
  function freshExtra(extras, hist, base) {
    var seen = ff2(hist.join(" ") + " " + base);
    for (var i = 0; i < (extras || []).length; i++) {
      var e = String(extras[i] || "").trim();
      if (!e) continue;
      var probe = ff2(e).split(" ").slice(0, 8).join(" ");
      if (probe && seen.indexOf(probe) < 0) return terminate(capitalize(e));
    }
    return "";
  }
  function selectVariant(base, cands, hist, plan) {
    var ok = [], seen = Object.create(null), baseDefects = inspect(base);
    cands.forEach(function (c) {
      c = String(c || "").replace(/[ \t]{2,}/g, " ").trim();
      if (!c || seen[c]) return;
      seen[c] = 1;
      if (!keepsAnchors(base, c)) return;
      if (inspect(c).some(function (d) { return baseDefects.indexOf(d) < 0; })) return;
      if (plan.lengthLimit && plan.lengthUnit === "sentences" && sentenceCount(c) > sentenceCount(base)) return;
      if (plan.lengthLimit && plan.lengthUnit === "words" && wordCount(c) > Math.max(wordCount(base), plan.lengthLimit)) return;
      ok.push(c);
    });
    if (!ok.length) return base;
    if (!hist.length) return pickOne(ok);
    var best = base, bestScore = -1;
    ok.forEach(function (c) {
      var worst = 0;
      hist.forEach(function (h) { var s = similarity(c, h); if (s > worst) worst = s; });
      var score = (1 - worst) + rand() * 0.05;
      if (score > bestScore) { bestScore = score; best = c; }
    });
    return best;
  }
  function realize(plan) {
    var base = realizeOnce(plan, null);
    if (!base.text || !variationEligible(plan)) return base;
    var hist = historyFor(VARY.key), limited = !!plan.lengthLimit || plan.tone === "brief";
    var pool = [base.text];
    alternativeBodies(plan).forEach(function (alt) { var r = realizeOnce(plan, alt); if (r.text) pool.push(r.text); });
    var cands = [];
    pool.forEach(function (t) { surfaceVariants(t, !limited).forEach(function (v) { cands.push(v); }); });
    if (hist.length && !limited) {
      var extra = freshExtra(plan.extras, hist, base.text), more = [];
      cands.forEach(function (c) {
        var e = extra ? c + " " + pickOne(EXTRA_LEADS) + " " + extra : c;
        /* no canned "As I said:" -- noticing a repeat is the orchestrator's
           job, from what was actually asked and answered */
        more.push(e, c);
      });
      cands = more;
    }
    var text = selectVariant(base.text, cands, hist, plan);
    return { text: text, defects: inspect(text) };
  }
  /* The same, for prose that did not come through a plan (answers the page
     assembled itself). Rewording only: nothing is added but an opener. */
  function varyText(text, key, opts) {
    var t = String(text == null ? "" : text);
    opts = opts || {};
    if (!VARY.on || t.length < 25 || /\n|```/.test(t)) return t;
    key = "text:" + String(key || "");
    var hist = historyFor(key);
    var cands = surfaceVariants(t, !opts.lengthLimit);
    var out = selectVariant(t, cands, hist, { lengthLimit: opts.lengthLimit || 0, lengthUnit: opts.lengthUnit || "" });
    commitVariation(key, out);
    return out;
  }

  root.C4LMRealize = {
    realize: realize,
    variation: {
      seed: seedVariation, begin: beginVariation, commit: commitVariation, choose: chooseVariant,
      text: varyText, random: rand, similarity: similarity,
      enable: function (on) { VARY.on = on !== false; },
      history: function (k) { return historyFor(k).slice(); }
    },
    polish: polish,
    inspect: inspect,
    article: article,
    capitalize: capitalize,
    terminate: terminate,
    copula: copula,
    isPlural: isPlural,
    joinList: joinList,
    definite: definite,
    pluralize: pluralize,
    cleanClause: cleanClause,
    clipSentences: clipSentences,
    trimDangling: trimDangling,
    PLANS: PLANS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMRealize;
})(typeof window !== "undefined" ? window : globalThis);
