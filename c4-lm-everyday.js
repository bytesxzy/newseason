/* CELL4 everyday reasoning: the logic and arithmetic people actually ask.
 *
 * Six general readers, each a small semantic parser plus an exact solver.
 * None of them knows any particular question; each reads a CONSTRUCTION
 * of English and reasons over what it extracted:
 *
 *   rules        "if P, (then) Q" + stated facts + a yes/no question.
 *                Forward chaining (modus ponens) and contraposition (modus
 *                tollens); when neither decides, the classic fallacies are
 *                named instead of guessed (affirming the consequent,
 *                denying the antecedent)
 *   categories   "all / no / some A are B", "x is a A" + a question about a
 *                class or an individual: subset closure, disjointness,
 *                and "some" never licensing a conclusion about one member
 *   quantities   relations between named quantities -- "X and Y cost N in
 *                total", "X costs N more than Y", "X has twice as many as
 *                Y", "X is N years older than Y", "Y has N" -- solved as a
 *                linear system in exact rationals
 *   changes      "I have 3 apples and eat one": a possession changed by
 *                gain / loss verbs, then asked about
 *   clock        "starts at 7:30 pm and lasts 2 hours", "if today is
 *                Monday, what day is it in 3 days"
 *   equal        "a kilogram of feathers or a kilogram of steel": two
 *                stated quantities compared after unit conversion
 *
 * Each result carries the reasoning steps, which the answer shows.
 * Local, deterministic, no network, no external model.
 */
(function (root) {
  "use strict";
  function get(n) { return root[n] || null; }

  /* ------------------------------------------------------------ words */

  /* English irregular verb forms -> base form (a morphological table;
     regular forms are handled by suffix rules below) */
  var IRREGULAR = { woke: "wake", woken: "wake", ran: "run", ate: "eat", eaten: "eat", went: "go", gone: "go", was: "be", were: "be",
    had: "have", has: "have", did: "do", done: "do", got: "get", gotten: "get", bought: "buy", spent: "spend", gave: "give", given: "give",
    lost: "lose", sold: "sell", found: "find", won: "win", left: "leave", took: "take", taken: "take", made: "make", broke: "break",
    broken: "break", came: "come", saw: "see", seen: "see", knew: "know", known: "know", said: "say", told: "tell", rang: "ring",
    rung: "ring", fell: "fall", fallen: "fall", flew: "fly", flown: "fly", drove: "drive", driven: "drive", wrote: "write",
    written: "write", sat: "sit", stood: "stand", began: "begin", begun: "begin", brought: "bring", thought: "think", caught: "catch",
    taught: "teach", sang: "sing", sung: "sing", swam: "swim", drank: "drink", drunk: "drink", slept: "sleep", felt: "feel",
    kept: "keep", met: "meet", paid: "pay", sent: "send", built: "build", held: "hold", heard: "hear", led: "lead", meant: "mean",
    grew: "grow", grown: "grow", threw: "throw", thrown: "throw", wore: "wear", worn: "wear", chose: "choose", chosen: "choose",
    rode: "ride", spoke: "speak", spoken: "speak", froze: "freeze", frozen: "freeze", hid: "hide", hidden: "hide", shook: "shake",
    stole: "steal", stolen: "steal", tore: "tear", torn: "tear", understood: "understand", forgot: "forget", forgotten: "forget" };
  var AUX = { do: 1, does: 1, did: 1, will: 1, would: 1, shall: 1, should: 1, can: 1, could: 1, may: 1, might: 1, must: 1,
    is: 1, are: 1, am: 1, was: 1, were: 1, be: 1, been: 1, being: 1, get: 1, gets: 1, got: 1, become: 1, becomes: 1, became: 1,
    then: 1, also: 1, always: 1, still: 1, really: 1, actually: 1, definitely: 1, "true": 1 };
  var FUNC = { the: 1, a: 1, an: 1, it: 1, this: 1, that: 1, there: 1, to: 1, of: 1, in: 1, on: 1, at: 1, and: 1, or: 1, so: 1,
    my: 1, your: 1, his: 1, her: 1, their: 1, our: 1, its: 1 };
  var PERSON = { i: "1", me: "1", you: "2", we: "1p", us: "1p", he: "3m", him: "3m", she: "3f", they: "3p", them: "3p" };

  function base(w) {
    w = w.toLowerCase().replace(/['’]s$/, "");
    if (IRREGULAR[w]) return IRREGULAR[w];
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
    if (/ied$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
    var C = get("C4LMCore"), st = C && C.stem ? C.stem(w) : w.replace(/(?:ing|ed|es|s)$/, "");
    /* one canonical key per lemma: the stemmer maps "closes" to "clos" but
       "close" to "close"; dropping a final e makes them agree */
    return st.length > 3 ? st.replace(/e$/, "") : st;
  }
  function numbersIn(t) {
    var PR = get("C4LMProblem");
    return PR && PR.wordsToNumbers ? PR.wordsToNumbers(t) : t;
  }
  /* sentences end at . ! ? followed by space or the end -- never inside a
     number ("$1.10") */
  function splitSentences(t) {
    return String(t).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function fracText(x) {
    var PR = get("C4LMProblem");
    if (x && x.toString && x.d !== undefined) {
      if (x.d === 1n) return x.toString();
      var v = Number(x.n) / Number(x.d);
      return Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? String(Math.round(v * 100) / 100) : x.toString();
    }
    return String(x);
  }

  /* ================================================== propositions */

  /* A clause as a proposition: its content lemmas (subject included, dummy
     "it" and auxiliaries excluded) and its polarity. */
  function proposition(clause) {
    var t = " " + clause.toLowerCase().replace(/n['’]t\b/g, " not").replace(/[^a-z0-9' ]+/g, " ") + " ";
    var neg = /\s(?:not|never|no)\s/.test(t);
    var words = t.split(/\s+/).filter(Boolean), content = [], subj = null;
    words.forEach(function (w, i) {
      if (w === "not" || w === "never" || w === "no") return;
      if (PERSON[w] && subj === null) { subj = PERSON[w]; return; }
      if (AUX[w] || FUNC[w]) return;
      content.push(base(w));
    });
    return { text: clause.trim(), content: content, neg: neg, subj: subj };
  }
  /* Two clauses state the same proposition (up to polarity) when their
     content lemmas agree -- the subject person too, when both name one. */
  function sameProp(a, b) {
    if (!a.content.length || !b.content.length) return false;
    if (a.subj && b.subj && a.subj !== b.subj && !((a.subj === "1" && b.subj === "2") || (a.subj === "2" && b.subj === "1"))) return false;
    var A = {}, shared = 0;
    a.content.forEach(function (w) { A[w] = 1; });
    b.content.forEach(function (w) { if (A[w]) shared++; });
    return shared >= Math.max(1, Math.ceil(Math.min(a.content.length, b.content.length) * 0.67));
  }

  /* ============================================================ rules */

  function rules(text) {
    var ss = splitSentences(text), R = [], facts = [], question = null;
    ss.forEach(function (s) {
      var m;
      if (/\?\s*$/.test(s)) { question = s.replace(/\?\s*$/, ""); return; }
      s = s.replace(/[.!]\s*$/, "");
      if ((m = s.match(/^(?:if|whenever|when)\s+(.+?),\s*(?:then\s+)?(.+)$/i)) || (m = s.match(/^(?:if|whenever)\s+(.+?)\s+then\s+(.+)$/i)))
        R.push({ p: proposition(m[1]), q: proposition(m[2]), text: s });
      else if ((m = s.match(/^(.+?)\s+(?:if|whenever)\s+(.+)$/i)) && !/^(?:only|even)\b/i.test(m[2]))
        R.push({ p: proposition(m[2]), q: proposition(m[1]), text: s });
      else facts.push(proposition(s));
    });
    if (!R.length || !question) return null;
    /* the question: "did P?", "is Q?", "will I Q?" -- its proposition */
    var qs = question.replace(/^(?:so|then|and)\s+/i, "");
    if (!/^(?:did|does|do|is|are|was|were|will|would|can|could|has|have|had)\b/i.test(qs)) return null;
    var ask = proposition(qs);
    /* truth values: facts, then closure under the rules */
    var known = [];
    function lookup(p) {
      for (var i = 0; i < known.length; i++) if (sameProp(known[i].p, p)) return known[i].p.neg === p.neg ? known[i] : { p: known[i].p, value: !known[i].value, how: known[i].how };
      return null;
    }
    function assert(p, value, how) {
      var k = lookup(p);
      if (k) return false;
      known.push({ p: p, value: p.neg ? !value : value, how: how });
      /* store as the positive proposition */
      known[known.length - 1].p = { text: p.text, content: p.content, neg: false, subj: p.subj };
      return true;
    }
    facts.forEach(function (f) { assert(f, true, "stated"); });
    var steps = [], changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      R.forEach(function (r) {
        var kp = lookup(r.p), kq = lookup(r.q);
        if (kp && kp.value === true && (!kp.p || !r.p.neg ? true : true) && valueOf(r.p) === true && !kq) {
          if (assert(r.q, true, "modus ponens")) { steps.push("the rule says: " + flip(r.text).replace(/^if/i, "if") + ". “" + flip(r.p.text) + "” is true here, so “" + flip(r.q.text) + "” follows"); changed = true; }
        }
        if (kq && valueOf(r.q) === false && !kp) {
          if (assert(r.p, false, "modus tollens")) { steps.push("the rule says: " + flip(r.text) + ". “" + flip(r.q.text) + "” is false here, so “" + flip(r.p.text) + "” must be false too — otherwise the rule would have made it true"); changed = true; }
        }
      });
    }
    function valueOf(p) {
      var k = lookup(p);
      if (!k) return null;
      return p.neg ? !k.value : k.value;
    }
    var v = valueOf({ text: ask.text, content: ask.content, neg: false, subj: ask.subj });
    if (v !== null) {
      var yes = ask.neg ? !v : v, how = known.length ? known[known.length - 1].how : "";
      return { answer: yes ? "Yes" : "No", kind: "rules", steps: steps.length ? steps : ["that is stated directly"], certain: true,
               text: (yes ? "Yes" : "No") + ". " + (steps.length ? capital(steps.join("; then ")) + "." : "That is stated directly.") +
                     (/tollens/.test(how) ? " (That's modus tollens: if the result didn't happen, the condition can't have either.)" :
                      /ponens/.test(how) ? " (That's modus ponens: the condition held, so the result follows.)" : "") };
    }
    /* undecided: name the fallacy the question invites */
    for (var i = 0; i < R.length; i++) {
      var r = R[i];
      if (sameProp(r.p, ask) && valueOf(r.q) === true)
        return { answer: "Not necessarily", kind: "rules", certain: true, steps: ["the rule runs from “" + r.p.text + "” to “" + r.q.text + "”, not back"],
                 text: "Not necessarily. The rule (" + flip(r.text) + ") says the first part guarantees the second — not the other way round. " +
                       capital(flip(r.q.text)) + " could have other causes, so it doesn't prove that " + flip(r.p.text) + ". (Concluding it would be the fallacy of affirming the consequent.)" };
      if (sameProp(r.q, ask) && valueOf(r.p) === false)
        return { answer: "Not necessarily", kind: "rules", certain: true, steps: ["the rule says nothing about what happens when “" + r.p.text + "” is false"],
                 text: "Not necessarily. The rule (" + flip(r.text) + ") only says what happens when its condition holds. Since " + flip(r.p.text) +
                       " didn't happen, the rule is silent — " + flip(r.q.text) + " may or may not be true. (Concluding it isn't would be the fallacy of denying the antecedent.)" };
    }
    return { answer: "Can't tell", kind: "rules", certain: false, steps: [],
             text: "I can't tell from what's given: none of the stated rules or facts settles “" + ask.text + "”." };
  }
  function capital(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
  /* the user's first person becomes the answer's second person */
  function flip(s) {
    return String(s).replace(/\b(I|me|my|mine|myself|am|I'm|we|us|our)\b/g, function (w) {
      return { I: "you", me: "you", my: "your", mine: "yours", myself: "yourself", am: "are", "I'm": "you're", we: "you", us: "you", our: "your" }[w] || w;
    });
  }

  /* ======================================================= categories */

  function cls(w) { return base(String(w).trim().replace(/^(?:a|an|the)\s+/i, "").split(/\s+/).pop()); }
  function categories(text) {
    var ss = splitSentences(text), subset = [], disjoint = [], some = [], member = [], nonmember = [], question = null;
    ss.forEach(function (s) {
      var m;
      if (/\?\s*$/.test(s)) { question = s.replace(/\?\s*$/, "").replace(/^(?:so|then|and)\s+/i, ""); return; }
      s = s.replace(/[.!]\s*$/, "").replace(/^(?:if|given that|suppose)\s+/i, "");
      s.split(/\s*,?\s+and\s+(?=(?:all|no|some|every|each)\b)/i).forEach(function (c) {
        if ((m = c.match(/^(?:all|every|each)\s+(\w+)\s+(?:are|is)\s+(?:a\s+|an\s+)?(\w+)$/i))) subset.push([cls(m[1]), cls(m[2])]);
        else if ((m = c.match(/^no\s+(\w+)\s+(?:are|is)\s+(?:a\s+|an\s+)?(\w+)$/i))) disjoint.push([cls(m[1]), cls(m[2])]);
        else if ((m = c.match(/^some\s+(\w+)\s+(?:are|is)\s+(?:a\s+|an\s+)?(\w+)$/i))) some.push([cls(m[1]), cls(m[2])]);
        else if ((m = c.match(/^([A-Z][a-z]+)\s+is\s+not\s+(?:a|an)?\s*(\w+)$/))) nonmember.push([m[1], cls(m[2])]);
        else if ((m = c.match(/^([A-Z][a-z]+)\s+is\s+(?:a|an)?\s*(\w+)$/))) member.push([m[1], cls(m[2])]);
      });
    });
    if (!question || !(subset.length + disjoint.length + some.length)) return null;
    function supers(a) {
      var out = [a], i = 0;
      while (i < out.length) { var x = out[i++]; subset.forEach(function (p) { if (p[0] === x && out.indexOf(p[1]) < 0) out.push(p[1]); }); }
      return out;
    }
    function excluded(a, b) {
      var sa = supers(a), sb = supers(b);
      return disjoint.some(function (d) { return (sa.indexOf(d[0]) >= 0 && sb.indexOf(d[1]) >= 0) || (sa.indexOf(d[1]) >= 0 && sb.indexOf(d[0]) >= 0); });
    }
    var m, chain;
    /* "are all A B?" */
    if ((m = question.match(/^(?:are|is)\s+(?:all|every|each)\s+(\w+)\s+(?:a\s+|an\s+)?(\w+)$/i))) {
      var A = cls(m[1]), B = cls(m[2]);
      if (supers(A).indexOf(B) >= 0) { chain = pathTo(A, B);
        return { answer: "Yes", kind: "categories", certain: true, steps: chain, text: "Yes. " + capital(chain.join(", and ")) + ", so every " + A + " is " + article(B) + " " + B + "." }; }
      if (excluded(A, B)) return { answer: "No", kind: "categories", certain: true, steps: [], text: "No — in fact no " + A + " is " + article(B) + " " + B + ", given what's stated." };
      return { answer: "Can't tell", kind: "categories", certain: false, steps: [], text: "Not necessarily. Nothing stated puts every " + A + " inside " + B + "." };
    }
    /* "is x B?", "can x be B?" */
    if ((m = question.match(/^(?:[Ii]s|[Cc]an)\s+([A-Z][a-z]+)\s+(?:be\s+)?(?:a\s+|an\s+)?(\w+)$/))) {
      var x = m[1], Bc = cls(m[2]), mine = member.filter(function (p) { return p[0] === x; }).map(function (p) { return p[1]; });
      if (!mine.length) return null;
      for (var i = 0; i < mine.length; i++) {
        if (supers(mine[i]).indexOf(Bc) >= 0) { chain = pathTo(mine[i], Bc);
          return { answer: "Yes", kind: "categories", certain: true, steps: [x + " is " + article(mine[i]) + " " + mine[i]].concat(chain),
                   text: "Yes. " + x + " is " + article(mine[i]) + " " + mine[i] + (chain.length ? ", and " + chain.join(", and ") : "") + "." }; }
        if (excluded(mine[i], Bc)) return { answer: "No", kind: "categories", certain: true, steps: [],
          text: "No. " + x + " is " + article(mine[i]) + " " + mine[i] + ", and no " + mine[i] + " is " + article(Bc) + " " + Bc + "." };
      }
      var sm = some.filter(function (p) { return mine.indexOf(p[0]) >= 0 && p[1] === Bc; })[0];
      if (sm) return { answer: "Not necessarily", kind: "categories", certain: true, steps: ["only some " + plural(sm[0]) + " are " + Bc],
        text: "Not necessarily. Only SOME " + plural(sm[0]) + " are " + Bc + ", and nothing says " + x + " is one of them — " + x + " may or may not be " + Bc + "." };
      return { answer: "Can't tell", kind: "categories", certain: false, steps: [], text: "I can't tell: nothing stated links " + x + " to " + Bc + "." };
    }
    return null;
    function pathTo(a, b) {
      var prev = {}, q = [a], seen = {}; seen[a] = 1;
      while (q.length) { var x2 = q.shift(); if (x2 === b) break;
        subset.forEach(function (p) { if (p[0] === x2 && !seen[p[1]]) { seen[p[1]] = 1; prev[p[1]] = x2; q.push(p[1]); } }); }
      var out = [], cur = b;
      while (prev[cur] !== undefined) { out.unshift("every " + prev[cur] + " is " + article(cur) + " " + cur); cur = prev[cur]; }
      return out;
    }
  }
  function article(w) { return /^[aeiou]/i.test(w) ? "an" : "a"; }
  function plural(w) { return /(?:s|x|ch|sh)$/.test(w) ? w + "es" : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ies" : w + "s"; }

  /* ======================================================= quantities */

  /* The quantity-bearing things of a problem: named people and "the X"
     noun phrases; each is one unknown. */
  var MULT = { twice: 2, double: 2, thrice: 3, triple: 3, half: 0.5 };
  /* A number stated as a RATE ("3 dollars per kilogram", "5 each", "$10 an
     hour") is not an amount: questions built on rates need the dimensional
     reasoner (and often an amount the question never gives). */
  var RATE = /\d(?:[\d.,]*)\s*(?:[a-z$%]+\s+){0,2}?(?:per|each|apiece|every)\b|\d(?:[\d.,]*)\s*(?:[a-z$]+\s+)?(?:an?|one)\s+(?:hour|minute|second|day|week|month|year|kilogram|kg|gram|pound|lb|litre|liter|gallon|metre|meter|mile|km|kilometre|kilometer|piece|item|unit|dozen|person|head)\b|\d\s*\/\s*(?:kg|lb|h|hr|hour|day|km|mi|l)\b/i;
  function quantities(text) {
    if (RATE.test(text)) return null;
    var t = numbersIn(text).replace(/\$\s*(\d)/g, "$1").replace(/(\d),(\d{3})\b/g, "$1$2");
    var money = /\$|\bdollars?\b|\bcents?\b|\bcosts?\b|\bprice\b/i.test(text);
    var ss = splitSentences(t), eqs = [], question = null, names = [];
    function ent(phrase) {
      var p = String(phrase).trim().replace(/^(?:the|a|an|one)\s+/i, "").replace(/['’]s$/, "");
      if (!p) return null;
      var head = /^[A-Z]/.test(p) ? p.split(/\s+/)[0] : base(p.split(/\s+/).pop());
      if (/^(?:it|they|he|she|i|you|we)$/i.test(head)) return null;
      if (names.indexOf(head) < 0) names.push(head);
      return head;
    }
    var NP = "((?:the\\s+|a\\s+|an\\s+)?[A-Za-z]+(?:\\s+[a-z]+)?)";
    var VERB = "(?:costs?|weighs?|is|are|has|have|was|were|earns?|gets?|makes?|owns?|scores?|runs?|reads?)";
    ss.forEach(function (s) {
      var m;
      if (/\?\s*$/.test(s)) { question = s; return; }
      s = s.replace(/[.!]\s*$/, "");
      /* X and Y cost N (in total / together) */
      if ((m = s.match(new RegExp("^" + NP + "\\s+and\\s+" + NP + "\\s+" + VERB + "\\s+(-?\\d+(?:\\.\\d+)?)\\b", "i")))) {
        var a = ent(m[1]), b = ent(m[2]);
        if (a && b) eqs.push({ c: mk([[a, 1], [b, 1]]), v: +m[3], text: m[1] + " + " + m[2] + " = " + m[3] });
        return;
      }
      /* X costs/is N more/less than Y */
      if ((m = s.match(new RegExp("^" + NP + "\\s+" + VERB + "\\s+(-?\\d+(?:\\.\\d+)?)\\s*(?:[a-z]+\\s+)?(more|less|fewer|older|younger|taller|shorter|heavier|lighter)\\s+than\\s+" + NP, "i")))) {
        var x = ent(m[1]), y = ent(m[4]), sgn = /more|older|taller|heavier/i.test(m[3]) ? 1 : -1;
        if (x && y) eqs.push({ c: mk([[x, 1], [y, -1]]), v: sgn * +m[2], text: m[1] + " = " + m[4] + (sgn > 0 ? " + " : " − ") + m[2] });
        return;
      }
      /* X has twice / N times as many (things) as Y; X is half as old as Y */
      if ((m = s.match(new RegExp("^" + NP + "\\s+" + VERB + "\\s+(twice|double|thrice|triple|half|(\\d+(?:\\.\\d+)?(?:\\/\\d+)?)(?:\\s+times)?)\\s+as\\s+(?:many|much|old|tall|long|heavy|big)\\s+(?:[a-z]+\\s+)?as\\s+" + NP, "i")))) {
        var k = MULT[m[2].toLowerCase()] || (m[3] && m[3].indexOf("/") > 0 ? +m[3].split("/")[0] / +m[3].split("/")[1] : +m[3]), X = ent(m[1]), Y = ent(m[4]);
        if (X && Y && k) eqs.push({ c: mk([[X, 1], [Y, -k]]), v: 0, text: m[1] + " = " + k + " × " + m[4] });
        return;
      }
      /* X has/costs/is N (things) */
      if ((m = s.match(new RegExp("^" + NP + "\\s+" + VERB + "\\s+(-?\\d+(?:\\.\\d+)?)\\b(?!\\s*\\/)(?!\\s+(?:times\\s+)?as\\s+(?:many|much))", "i")))) {
        var z = ent(m[1]);
        if (z) eqs.push({ c: mk([[z, 1]]), v: +m[2], text: m[1] + " = " + m[2] });
      }
    });
    if (!question || !eqs.length || !names.length) return null;
    /* the unknown the question asks about */
    var target = null;
    names.forEach(function (n) { if (new RegExp("\\b" + n.replace(/[^A-Za-z]/g, "") + "(?:e?s)?\\b", "i").test(question)) target = target || n; });
    if (!target) {
      /* "how many does she have" -- the one name not given a value */
      var valued = eqs.filter(function (e) { return Object.keys(e.c).length === 1; }).map(function (e) { return Object.keys(e.c)[0]; });
      var open = names.filter(function (n) { return valued.indexOf(n) < 0; });
      if (open.length === 1) target = open[0];
    }
    if (!target || !/\b(?:how\s+(?:much|many|old|tall|long|heavy)|what)\b/i.test(question)) return null;
    if (eqs.length < names.length) return null;
    var PR = get("C4LMProblem");
    if (!PR || !PR.gaussSolve) return null;
    var A = eqs.slice(0, names.length).map(function (e) { return names.map(function (n) { return String(e.c[n] || 0); }); });
    var bvec = eqs.slice(0, names.length).map(function (e) { return String(e.v); });
    var sol = null;
    try { sol = PR.gaussSolve(A, bvec); } catch (e) { sol = null; }
    if (!sol) return null;
    /* check every stated relation, including any beyond the square system */
    var vals = {};
    names.forEach(function (n, i) { vals[n] = sol[i]; });
    var ok = eqs.every(function (e) {
      var s = 0; Object.keys(e.c).forEach(function (n) { s += e.c[n] * Number(vals[n].n) / Number(vals[n].d); });
      return Math.abs(s - e.v) < 1e-9;
    });
    if (!ok) return null;
    var v = vals[target], num = Number(v.n) / Number(v.d), shown = fracText(v);
    if (money && num < 1 && num > 0 && /\./.test(text + "")) shown = "$" + num.toFixed(2) + " (" + Math.round(num * 100) + " cents)";
    else if (money && /\$/.test(text)) shown = "$" + (Math.round(num * 100) / 100).toFixed(num % 1 ? 2 : 0);
    var steps = eqs.map(function (e) { return e.text; });
    return { answer: shown, value: num, kind: "quantities", certain: true, steps: steps,
             text: shown + ". Writing what's stated as equations: " + steps.join("; ") + ". Solving them together gives " +
                   names.map(function (n) { return n + " = " + fracText(vals[n]); }).join(", ") + "." };
  }
  function mk(pairs) { var c = {}; pairs.forEach(function (p) { c[p[0]] = (c[p[0]] || 0) + p[1]; }); return c; }

  /* ========================================================== changes */

  var GAIN = /^(?:get|gets|got|buy|bought|buys|find|found|finds|receive|received|receives|earn|earned|earns|win|won|wins|pick|picked|picks|collect|collected|collects|add|added|adds|make|made|makes|save|saved|saves|borrow|borrowed|catch|caught|bake|baked|gain|gained)$/i;
  var LOSS = /^(?:eat|eats|ate|spend|spent|spends|give|gives|gave|lose|lost|loses|sell|sold|sells|use|used|uses|drop|dropped|drops|break|broke|breaks|throw|threw|throws|pay|paid|pays|lend|lent|donate|donated|drink|drank|drinks|waste|wasted|remove|removed|take|took|takes|burn|burned|burnt)$/i;
  function changes(text) {
    if (RATE.test(text)) return null;
    var t = numbersIn(text).replace(/\$\s*(\d)/g, "$1");
    var m = t.match(/\b(I|we|you|[A-Z][a-z]+|he|she|they)\s+(?:has|have|had|owns?|owned|starts? with|started with)\s+(\d+(?:\.\d+)?)\s+([a-z]+)/i);
    if (!m) return null;
    var owner = m[1], count = +m[2], item = m[3], who = /^(?:I|we)$/i.test(owner) ? "you" : owner;
    var steps = [who + " start" + (/^(?:you|they)$/i.test(who) ? "" : "s") + " with " + m[2] + " " + item];
    var rest = t.slice(m.index + m[0].length), re = /\b([a-z]+)\s+(?:away\s+|up\s+)?(?:another\s+)?(\d+(?:\.\d+)?)(?:\s+(?:more|of them|of these|more\s+[a-z]+))?/gi, mm, changed = false;
    while ((mm = re.exec(rest))) {
      var verb = mm[1], n = +mm[2];
      if (GAIN.test(verb)) { count += n; steps.push("+" + n + " (" + verb + ")"); changed = true; }
      else if (LOSS.test(verb)) { count -= n; steps.push("−" + n + " (" + verb + ")"); changed = true; }
    }
    if (!changed) return null;
    if (!/\?/.test(text) || !/\b(?:how\s+(?:many|much)|what)\b/i.test(text) || !/\b(?:left|remain|remaining|now|have|has|end up|altogether|in total|total)\b/i.test(text.split(/[.!]/).pop() + text.slice(-60))) return null;
    var money = /\$|\bdollars?\b/i.test(text);
    var shown = (money && /\$/.test(text) ? "$" : "") + (Math.round(count * 100) / 100) + (money && !/\$/.test(text) ? " dollars" : " " + item.replace(/s?$/, count === 1 ? "" : "s"));
    return { answer: shown, value: count, kind: "changes", certain: true, steps: steps,
             text: shown.replace(/^(\$?)(-?\d)/, "$1$2") + " left. " + capital(steps.join(", ")) + " → " + (Math.round(count * 100) / 100) + "." };
  }

  /* ============================================================ clock */

  var DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  function parseTime(s) {
    var m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i) || s.match(/\b(\d{1,2}):(\d{2})\b/) ;
    if (m) {
      var h = +m[1], mi = +(m[2] || 0), ap = m[3] ? m[3].toLowerCase().replace(/\./g, "") : null;
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      return { min: h * 60 + mi, ampm: !!ap, at: m.index };
    }
    if ((m = s.match(/\b(noon|midday|midnight)\b/i))) return { min: /midnight/i.test(m[1]) ? 0 : 720, ampm: true, at: m.index };
    return null;
  }
  function parseDuration(s) {
    var total = 0, found = false, re = /(\d+(?:\.\d+)?|an?|half an?)\s*(hours?|hrs?|h|minutes?|mins?)\b/gi, m;
    while ((m = re.exec(s))) {
      var n = /^half/i.test(m[1]) ? 0.5 : /^an?$/i.test(m[1]) ? 1 : +m[1];
      total += /^h/i.test(m[2]) ? n * 60 : n; found = true;
    }
    return found ? total : null;
  }
  function fmtTime(min, ampm) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), mi = min % 60, mm = (mi < 10 ? "0" : "") + mi;
    if (!ampm) return (h < 10 ? "0" : "") + h + ":" + mm;
    var ap = h >= 12 ? "pm" : "am", h12 = h % 12 || 12;
    return h12 + ":" + mm + " " + ap;
  }
  function clock(text) {
    var t = numbersIn(text);
    if (!/\?/.test(text)) return null;
    var dm = t.match(/\b(?:today|it)\s+is\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (dm && /\bwhat\s+day\b/i.test(t)) {
      var d0 = DAYS.indexOf(dm[1].toLowerCase()), off = null, m2;
      if ((m2 = t.match(/\bin\s+(\d+)\s+days?\b|\b(\d+)\s+days?\s+(?:from now|later|after)\b|\bafter\s+(\d+)\s+days?\b/i))) off = +(m2[1] || m2[2] || m2[3]);
      else if ((m2 = t.match(/\b(\d+)\s+days?\s+ago\b/i))) off = -m2[1];
      else if (/\bday after tomorrow\b/i.test(t)) off = 2;
      else if (/\btomorrow\b/i.test(t)) off = 1;
      else if (/\bday before yesterday\b/i.test(t)) off = -2;
      else if (/\byesterday\b/i.test(t)) off = -1;
      if ((m2 = t.match(/\bin\s+(\d+)\s+weeks?\b/i))) off = 7 * +m2[1];
      if (off === null) return null;
      var d1 = DAYS[((d0 + off) % 7 + 7) % 7];
      return { answer: capital(d1), kind: "clock", certain: true, steps: [capital(dm[1]) + " " + (off >= 0 ? "+ " : "− ") + Math.abs(off) + " days"],
               text: capital(d1) + ". Counting " + Math.abs(off) + " day" + (Math.abs(off) === 1 ? "" : "s") + (off >= 0 ? " forward" : " back") + " from " + capital(dm[1]) +
                     (Math.abs(off) >= 7 ? " (every 7 days lands on the same weekday)" : "") + "." };
    }
    /* weekday arithmetic around a named day: "2 days before Wednesday" */
    var wm = t.match(/\b(\d+)\s+days?\s+(before|after)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (wm && /\bwhat\s+day\b/i.test(t)) {
      var w0 = DAYS.indexOf(wm[3].toLowerCase()), wo = (/before/i.test(wm[2]) ? -1 : 1) * +wm[1], w1 = DAYS[((w0 + wo) % 7 + 7) % 7];
      return { answer: capital(w1), kind: "clock", certain: true, steps: [capital(wm[3]) + (wo > 0 ? " + " : " − ") + Math.abs(wo) + " days"],
               text: capital(w1) + ". Counting " + Math.abs(wo) + " day" + (Math.abs(wo) === 1 ? "" : "s") + (wo > 0 ? " forward" : " back") + " from " + capital(wm[3]) + "." };
    }
    var st = parseTime(t);
    if (!st) return null;
    /* the duration may come before or after the time ("45 minutes after 2:30 pm") */
    var tStr = t.slice(st.at).match(/^\S+(?:\s*(?:a\.?m\.?|p\.?m\.?))?/i)[0];
    var dur = parseDuration(t.slice(0, st.at) + " " + t.slice(st.at + tStr.length));
    if (dur === null || !/\b(?:when|what time|at what time)\b/i.test(t)) return null;
    var rel = t.match(/\b(\d+(?:\.\d+)?|an?|half an?)\s*(?:hours?|hrs?|minutes?|mins?)\s+(before|after|past|until|to)\b/i);
    var back = rel ? /before|until|to/i.test(rel[2]) : (/\b(?:ago|before|earlier)\b/i.test(t) && !/\b(?:lasts?|takes?|travels?|runs?|for)\b/i.test(t));
    var end = st.min + (back ? -dur : dur);
    var ans = fmtTime(end, st.ampm);
    var hrs = Math.floor(dur / 60), mins = dur % 60, durTxt = (hrs ? hrs + " hour" + (hrs === 1 ? "" : "s") : "") + (hrs && mins ? " " : "") + (mins ? mins + " minute" + (mins === 1 ? "" : "s") : "");
    return { answer: ans, kind: "clock", certain: true, steps: [fmtTime(st.min, st.ampm) + (back ? " − " : " + ") + durTxt],
             text: ans + ". " + fmtTime(st.min, st.ampm) + (back ? " minus " : " plus ") + durTxt + " is " + ans + (end >= 1440 ? " (the next day)" : end < 0 ? " (the day before)" : "") + "." };
  }

  /* ============================================================ equal */

  function equal(text) {
    var m = text.match(/\bwhich\s+(?:is|weighs)\s+(heavier|lighter|longer|shorter|bigger|larger|more|less)\b[^,]*,?\s*(?:a|an|one|(\d+(?:\.\d+)?))\s+([a-z]+)\s+of\s+([a-z ]+?)\s+or\s+(?:a|an|one|(\d+(?:\.\d+)?))\s+([a-z]+)\s+of\s+([a-z ]+?)\s*\??$/i);
    if (!m) return null;
    var TL = get("C4LMTools");
    var q1 = (m[2] || "1") + " " + m[3], q2 = (m[5] || "1") + " " + m[6];
    var u1 = m[3].replace(/s$/, ""), u2 = m[6].replace(/s$/, ""), v1 = +(m[2] || 1), v2 = +(m[5] || 1), same = null;
    if (u1 === u2) same = v1 === v2 ? 0 : (v1 > v2 ? 1 : -1);
    else if (TL) {
      var r = TL.run("units.convert", { value: String(v2), from: u2, to: u1 });
      if (r.ok) { var c = Number(r.value && r.value.n !== undefined ? Number(r.value.n) / Number(r.value.d) : r.value); same = Math.abs(c - v1) < 1e-9 ? 0 : (v1 > c ? 1 : -1); }
    }
    if (same === null) return null;
    if (same === 0) return { answer: "Neither", kind: "equal", certain: true, steps: [q1 + " = " + q2],
      text: "Neither — they're the same. " + capital(q1) + " of " + m[4].trim() + " and " + q2 + " of " + m[7].trim() + " are equal amounts; what the stuff is made of doesn't change a stated " + u1 + "." };
    var first = same > 0;
    return { answer: first ? m[4] : m[7], kind: "equal", certain: true, steps: [q1 + (first ? " > " : " < ") + q2],
             text: capital(first ? q1 + " of " + m[4].trim() : q2 + " of " + m[7].trim()) + " — it's the larger amount." };
  }

  /* ============================================================ solve */

  /* ========================================================= ordering
     "A is taller than B", chained with "and" or across sentences; the
     question asks one pair or the extreme. Transitive closure over the
     stated pairs; a pair with no path either way is "can't tell". */
  var OPPOSITE = { taller: "shorter", shorter: "taller", older: "younger", younger: "older", bigger: "smaller", smaller: "bigger",
    larger: "smaller", heavier: "lighter", lighter: "heavier", faster: "slower", slower: "faster", richer: "poorer", poorer: "richer",
    stronger: "weaker", weaker: "stronger", longer: "shorter", higher: "lower", lower: "higher", hotter: "colder", colder: "hotter",
    smarter: "dumber", happier: "sadder", earlier: "later", later: "earlier", closer: "farther", farther: "closer", cheaper: "dearer" };
  var SUPER = { tallest: "taller", shortest: "shorter", oldest: "older", youngest: "younger", biggest: "bigger", smallest: "smaller",
    largest: "larger", heaviest: "heavier", lightest: "lighter", fastest: "faster", slowest: "slower", richest: "richer", poorest: "poorer",
    strongest: "stronger", weakest: "weaker", longest: "longer", highest: "higher", lowest: "lower", hottest: "hotter", coldest: "colder" };
  function ordering(text) {
    var t = String(text).replace(/\?\s*$/, "?"), qm = t.lastIndexOf("?");
    if (qm < 0) return null;
    var body = t, pairs = [], adj = null, re = /\b([A-Z][a-z]+)\s+(?:is|was|are|were)\s+(?:much\s+|a bit\s+|slightly\s+)?([a-z]+er)\s+than\s+([A-Z][a-z]+)\b/g, m;
    while ((m = re.exec(body))) {
      var a = m[2].toLowerCase(), x = m[1], y = m[3];
      if (!OPPOSITE[a]) continue;
      if (!adj) adj = a;
      if (a === adj) pairs.push([x, y]); else if (OPPOSITE[a] === adj) pairs.push([y, x]); else return null;
    }
    if (pairs.length < 2 || !adj) return null;
    var names = [];
    pairs.forEach(function (p) { p.forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); }); });
    function above(a, b) {           /* a is <adj> than b, by a chain */
      var seen = {}, q = [a];
      while (q.length) { var x2 = q.shift(); if (seen[x2]) continue; seen[x2] = 1;
        for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === x2) { if (pairs[i][1] === b) return true; q.push(pairs[i][1]); } }
      return false;
    }
    function chain() {
      var order = names.slice().sort(function (p, q2) { return above(p, q2) ? -1 : above(q2, p) ? 1 : 0; });
      return order.join(" > ");
    }
    var question = t.slice(t.lastIndexOf(".", qm) + 1, qm + 1).replace(/^\s*(?:so|then|and)\s+/i, "").trim();
    var qq = question.match(/\b(?:is|was|are|were)\s+([A-Z][a-z]+)\s+([a-z]+er)\s+than\s+([A-Z][a-z]+)/);
    if (qq) {
      var qa = qq[2].toLowerCase(), X = qq[1], Y = qq[3];
      if (qa !== adj && OPPOSITE[qa] !== adj) return null;
      var yes = qa === adj ? above(X, Y) : above(Y, X), no = qa === adj ? above(Y, X) : above(X, Y);
      if (!yes && !no) return { answer: "Can't tell", kind: "ordering", certain: false, steps: [], text: "I can't tell: nothing stated connects " + X + " and " + Y + " in that order." };
      return { answer: yes ? "Yes" : "No", kind: "ordering", certain: true, steps: [chain()],
               text: (yes ? "Yes" : "No") + ". Putting the statements in order (" + adj + " first): " + chain() + ", so " + X + " is " + (yes ? "" : "not ") + qa + " than " + Y + "." };
    }
    var sm = question.match(/\bwho(?:'s| is| was)?\s+(?:the\s+)?([a-z]+est)\b/i);
    if (sm && SUPER[sm[1].toLowerCase()]) {
      var sa = SUPER[sm[1].toLowerCase()], top = names.filter(function (n) {
        return names.every(function (o) { return o === n || (sa === adj ? above(n, o) : above(o, n)); });
      });
      if (top.length !== 1) return { answer: "Can't tell", kind: "ordering", certain: false, steps: [], text: "I can't tell who is " + sm[1] + " from what's stated — the comparisons don't connect everyone." };
      return { answer: top[0], kind: "ordering", certain: true, steps: [chain()], text: top[0] + ". Putting the statements in order (" + adj + " first): " + chain() + "." };
    }
    return null;
  }

  /* =============================================== universal properties
     "Every student in the class passed. Jane is in the class. Did Jane
     pass?" -- a property of a whole group, a member, a question about it. */
  function universals(text) {
    var ss = splitSentences(text), props = [], members = [], question = null, m;
    ss.forEach(function (s) {
      if (/\?\s*$/.test(s)) { question = s.replace(/\?\s*$/, ""); return; }
      s = s.replace(/[.!]\s*$/, "");
      if ((m = s.match(/^(?:every|each|all(?: of)?(?: the)?)\s+([a-z]+)(?:\s+(?:in|at|on|from|of)\s+(?:the\s+|my\s+|our\s+)?([a-z]+))?\s+(.+)$/i)) && !/^(?:is|are)\s+(?:a|an)\s/i.test(m[3]))
        props.push({ cls: cls(m[1]), where: m[2] ? cls(m[2]) : null, pred: m[3] });
      else if ((m = s.match(/^([A-Z][a-z]+)\s+is\s+(?:a|an|one of the)\s+([a-z]+)(?:\s+(?:in|at|on|from|of)\s+(?:the\s+|my\s+|our\s+)?([a-z]+))?$/)))
        members.push({ who: m[1], cls: cls(m[2]), where: m[3] ? cls(m[3]) : null });
      else if ((m = s.match(/^([A-Z][a-z]+)\s+is\s+(?:in|at|on|from)\s+(?:the\s+|my\s+|our\s+)?([a-z]+)$/)))
        members.push({ who: m[1], cls: null, where: cls(m[2]) });
    });
    if (!props.length || !members.length || !question) return null;
    var qm = question.match(/^(?:[Dd]id|[Dd]oes|[Ii]s|[Ww]as|[Cc]an|[Ww]ill|[Hh]as)\s+([A-Z][a-z]+)\s+(.+)$/);
    if (!qm) return null;
    var who = qm[1], qp = proposition(qm[2]);
    for (var i = 0; i < props.length; i++) {
      var p = props[i], pp = proposition(p.pred);
      if (!sameProp(pp, qp)) continue;
      var mem = members.filter(function (x) { return x.who === who; })[0];
      if (!mem) continue;
      var direct = mem.cls && mem.cls === p.cls && (!p.where || !mem.where || mem.where === p.where);
      var viaPlace = !mem.cls && p.where && mem.where === p.where;
      if (direct) return { answer: "Yes", kind: "universals", certain: true, steps: ["every " + p.cls + " " + p.pred, who + " is " + article(p.cls) + " " + p.cls],
        text: "Yes. Every " + p.cls + (p.where ? " in the " + p.where : "") + " " + p.pred + ", and " + who + " is one of them." };
      if (viaPlace) return { answer: "Yes (if " + who + " is a " + p.cls + ")", kind: "universals", certain: true, steps: [],
        text: "Yes — assuming " + who + " is one of the " + plural(p.cls) + " in the " + p.where + ": every " + p.cls + " there " + p.pred +
              ". (Strictly, being in the " + p.where + " doesn't make someone a " + p.cls + " — a teacher could be there too.)" };
    }
    return null;
  }

  /* ============================================================= ages */
  function ages(text) {
    var t = numbersIn(text), m;
    if (!/\?/.test(t) || !/\bhow old\b/i.test(t)) return null;
    var now = t.match(/\b(?:I'm|I am|im|(?:he|she|they|[A-Z][a-z]+)(?:'s| is| are))\s+(\d+)(?:\s+years?(?:\s+old)?)?(?:\s+(?:now|today|this year))?\b/i);
    if (!now) return null;
    var age = +now[1], d = 0;
    if ((m = t.match(/\bin\s+(\d+)\s+years?\b/i))) d = +m[1];
    else if ((m = t.match(/\b(\d+)\s+years?\s+ago\b/i))) d = -m[1];
    else if ((m = t.match(/\b(\d+)\s+years?\s+(?:from now|later)\b/i))) d = +m[1];
    if (!d) return null;
    var res = age + d, you = /\bI\b|\bI'm\b|\bim\b/i.test(now[0]);
    return { answer: String(res), kind: "ages", certain: true, steps: [age + (d > 0 ? " + " : " − ") + Math.abs(d)],
             text: (you ? "You'll be " : "") + res + (you ? "" : " years old") + (d < 0 ? (you ? " — you were " + res : "") : "") + ". " + age + (d > 0 ? " + " : " − ") + Math.abs(d) + " = " + res + "." };
  }

  var READERS = [["rules", rules], ["categories", categories], ["universals", universals], ["ordering", ordering], ["equal", equal],
                 ["clock", clock], ["ages", ages], ["changes", changes], ["quantities", quantities]];
  function solve(text) {
    var t = String(text || "").trim();
    if (!t || t.length > 600) return null;
    for (var i = 0; i < READERS.length; i++) {
      var r = null;
      try { r = READERS[i][1](t); } catch (e) { r = null; }
      if (r) { r.reader = READERS[i][0]; return r; }
    }
    return null;
  }

  var E = { solve: solve, rules: rules, categories: categories, quantities: quantities, changes: changes, clock: clock, equal: equal,
            proposition: proposition, sameProp: sameProp, base: base };
  root.C4LMEveryday = E;
  if (typeof module !== "undefined" && module.exports) module.exports = E;
})(typeof window !== "undefined" ? window : globalThis);
