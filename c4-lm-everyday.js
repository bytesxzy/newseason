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
  /* Complementary states: "the lights are off" is "the lights are on" with
     the polarity reversed, "closed" is not "open", "lost" is not "won". The
     negative member maps onto the positive one and flips the polarity, so
     a fact stated with either word meets a rule stated with the other. */
  var STATE = { off: ["", 1], close: ["open", 1], closes: ["open", 1], closed: ["open", 1], closing: ["open", 1], shut: ["open", 1], shuts: ["open", 1],
                open: ["open", 0], opens: ["open", 0], opened: ["open", 0], absent: ["present", 1], present: ["present", 0],
                dead: ["alive", 1], alive: ["alive", 0], asleep: ["awake", 1], awake: ["awake", 0], dry: ["wet", 1], empty: ["full", 1], full: ["full", 0],
                "false": ["true", 1], "true": ["true", 0], unlocked: ["locked", 1], locked: ["locked", 0],
                fail: ["pass", 1], fails: ["pass", 1], failed: ["pass", 1], pass: ["pass", 0], passes: ["pass", 0], passed: ["pass", 0],
                lose: ["win", 1], loses: ["win", 1], lost: ["win", 1], win: ["win", 0], wins: ["win", 0], won: ["win", 0],
                cold: ["warm", 1], cool: ["warm", 1], warm: ["warm", 0], hot: ["warm", 0] };
  function proposition(clause) {
    var t = " " + clause.toLowerCase().replace(/n['’]t\b/g, " not").replace(/[^a-z0-9' ]+/g, " ") + " ";
    var neg = /\s(?:not|never|no)\s/.test(t), flipped = false;
    var words = t.split(/\s+/).filter(Boolean), content = [], subj = null;
    words.forEach(function (w, i) {
      if (w === "not" || w === "never" || w === "no") return;
      if (PERSON[w] && subj === null) { subj = PERSON[w]; return; }
      if (STATE[w]) { if (STATE[w][1]) flipped = !flipped; if (STATE[w][0]) content.push(base(STATE[w][0])); return; }
      if (AUX[w] || FUNC[w]) return;
      content.push(base(w));
    });
    return { text: clause.trim(), content: content, neg: neg !== flipped, subj: subj };
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
    /* lookup() already answers for p's own polarity ("the switch is off"
       is known true); flipping again here would read it as false */
    function valueOf(p) {
      var k = lookup(p);
      return k ? k.value : null;
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
                 text: "Not necessarily. The rule (" + flip(r.text) + ") only says what happens when its condition holds. Since “" + flip(r.p.text) +
                       "” is false here, the rule is silent — “" + flip(r.q.text) + "” may or may not be true. (Concluding it isn't would be the fallacy of denying the antecedent.)" };
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
  /* "squares" -> "square", "berries" -> "berry": the word an answer shows
     (the matching key is a stem, which is not a word) */
  function singular(w) {
    w = String(w).toLowerCase();
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
    if (/(?:x|z|ch|sh|ss)es$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/(?:is|us|ss)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function categories(text) {
    var ss = splitSentences(text), subset = [], disjoint = [], some = [], member = [], nonmember = [], question = null, shown = {};
    /* A predicate is a kind ("are mammals", "is a fruit"), a property ("are
       sweet") or an ability ("can walk", "have wings"). Each names a set of
       things, so one containment calculus reasons over all of them. */
    /* one transposed, missing or extra letter still names the same class
       ("rectagnles" is "rectangles") */
    function near(a, b) {
      if (a === b) return true;
      if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
      var i = 0; while (i < a.length && a[i] === b[i]) i++;
      if (a.length === b.length) return a.slice(i + 2) === b.slice(i + 2) && a[i] === b[i + 1] && a[i + 1] === b[i] || a.slice(i + 1) === b.slice(i + 1);
      return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
    }
    function key(word, noun, pl) {
      var k = cls(word), w = String(word).toLowerCase();
      if (!shown[k]) {
        var twin = Object.keys(shown).filter(function (x) { return !/:/.test(x) && near(x, k); })[0];
        if (twin) {
          /* show the spelling the lexicon knows */
          var LX = get("C4LMLexicon"), CO = get("C4LMCore"), known = function (x) {
            try { return !!((LX && LX.lookup && LX.lookup(x)) || (CO && CO.knownWord && (CO.knownWord(x) || CO.knownWord(x + "s")))); } catch (e) { return false; } };
          if (noun && known(singular(w)) && !known(shown[twin].w)) { shown[twin].w = singular(w); if (pl) shown[twin].pl = w; }
          k = twin;
        }
      }
      if (!shown[k]) shown[k] = { w: noun ? singular(w) : w, noun: noun, pl: pl ? w : null };
      else if (pl && !shown[k].pl) shown[k].pl = w;
      return k;
    }
    function ability(v, rest) {
      var k = v + ":" + String(rest).toLowerCase().split(/\s+/).map(base).join(" ");
      if (!shown[k]) shown[k] = { w: String(rest).toLowerCase(), verb: v };
      return k;
    }
    function pred(p) {
      var m;
      p = String(p).trim().replace(/\s+/g, " ");
      if ((m = p.match(/^(?:are|is|be)\s+(?:not\s+)?(a\s+|an\s+)?([a-z]+)$/i))) return key(m[2], !!m[1] || singular(m[2]) !== m[2].toLowerCase(), !m[1] && singular(m[2]) !== m[2].toLowerCase());
      if ((m = p.match(/^(?:can|could)\s+(?:not\s+)?be\s+(a\s+|an\s+)?([a-z]+)$/i))) return key(m[2], !!m[1] || singular(m[2]) !== m[2].toLowerCase(), !m[1] && singular(m[2]) !== m[2].toLowerCase());
      if ((m = p.match(/^(?:can|could|cannot|can't|can not)\s+([a-z]+(?:\s+[a-z]+)?)$/i))) return ability("can", m[1]);
      if ((m = p.match(/^(?:have|has|do not have|does not have|don't have|doesn't have)\s+([a-z]+(?:\s+[a-z]+)?)$/i))) return ability("have", m[1]);
      /* any verb phrase names the set of things that do it: "play chess" */
      if ((m = p.match(/^(?:do not |does not |don't |doesn't )?([a-z]+)((?:\s+[a-z]+){0,3})$/i)) && verbish(m[1])) {
        var vb = base(m[1].toLowerCase()), kk = "do:" + vb + m[2].toLowerCase();
        if (!shown[kk]) shown[kk] = { w: m[2].trim().toLowerCase(), verb: "do", v: m[1].toLowerCase().replace(/(?:es|s)$/, function (x, i, str) { return /(?:ss|sh|ch|x|o)es$/.test(str) ? "" : x === "es" ? "e" : ""; }) };
        return kk;
      }
      return null;
    }
    var NEG = /\bnot\b|n't\b|\bcannot\b/i;
    ss.forEach(function (s) {
      var m, p;
      if (/\?\s*$/.test(s)) { question = s.replace(/\?\s*$/, "").replace(/^(?:so|then|and)\s+/i, ""); return; }
      s = s.replace(/[.!]\s*$/, "").replace(/^(?:if|given that|suppose)\s+/i, "");
      s.split(/\s*,?\s+and\s+(?=(?:all|no|some|every|each)\b)/i).forEach(function (c) {
        /* "hey, could you tell me no poets are robots": the statement is the
           quantified clause, whatever request wording leads into it */
        var lead = c.match(/^(.*?\s)((?:all|every|each|no|some)\s+[a-z]+\s+.+)$/i);
        if (lead && !/^(?:all|every|each|no|some)\s/i.test(c) && /\b(?:me|help|question|wondering|puzzle|this|that|please|think)\b[:,]?\s*$/i.test(lead[1])) c = lead[2];
        if ((m = c.match(/^(all|every|each|no|some)\s+([a-z]+)\s+(.+)$/i)) && (p = pred(m[3]))) {
          var q = m[1].toLowerCase(), A = key(m[2], true, /^(?:all|no|some)$/.test(q));
          if (q !== "no" && NEG.test(m[3])) disjoint.push([A, p]);
          else (q === "no" ? disjoint : q === "some" ? some : subset).push([A, p]);
        } else if ((m = c.match(/^(?:an?)\s+([a-z]+)\s+(.+)$/i)) && (p = pred(m[2]))) {
          /* "a lemon is a fruit" is a statement about the kind */
          (NEG.test(m[2]) ? disjoint : subset).push([key(m[1], true, false), p]);
        } else if ((m = c.match(/^([Tt]he\s+[a-z]+|[A-Z][a-z]+)\s+(.+)$/)) && (p = pred(m[2]))) {
          (NEG.test(m[2]) ? nonmember : member).push([m[1].toLowerCase(), p, m[1]]);
        }
      });
    });
    if (!question || !(subset.length + disjoint.length + some.length)) return null;
    function supers(a) {
      var out = [a], i = 0;
      while (i < out.length) { var x = out[i++]; subset.forEach(function (p) { if (p[0] === x && out.indexOf(p[1]) < 0) out.push(p[1]); }); }
      return out;
    }
    /* the stated exclusion that separates a from b, if any: [S, T] */
    function excluded(a, b) {
      var sa = supers(a), sb = supers(b);
      for (var i = 0; i < disjoint.length; i++) {
        var d = disjoint[i];
        if (sa.indexOf(d[0]) >= 0 && sb.indexOf(d[1]) >= 0) return d;
        if (sa.indexOf(d[1]) >= 0 && sb.indexOf(d[0]) >= 0) return [d[1], d[0]];
      }
      return null;
    }
    function word(k) { return shown[k] ? shown[k].w : k; }
    function many(k) { return shown[k] && shown[k].pl ? shown[k].pl : plural(word(k)); }
    /* "Rex is a dog", "a lemon is sweet", "no fish can walk" */
    function says(subj, k, neg) {
      var s = shown[k] || { w: k, noun: true };
      if (s.verb === "do") return subj + (neg ? " doesn't " + s.v : " " + third(s.v)) + (s.w ? " " + s.w : "");
      if (s.verb === "can") return subj + (neg ? " can't " : " can ") + s.w;
      if (s.verb === "have") return subj + (neg ? " doesn't have " : " has ") + s.w;
      return subj + (neg ? " isn't " : " is ") + (s.noun ? article(s.w) + " " : "") + s.w;
    }
    function areAll(k) {                     /* the predicate after a plural subject */
      var s = shown[k] || { w: k, noun: true };
      return s.verb === "do" ? s.v + (s.w ? " " + s.w : "") : s.verb ? s.verb + " " + s.w : "are " + (s.noun ? many(k) : s.w);
    }
    function pathTo(a, b) {
      var prev = {}, q = [a], seen = {}; seen[a] = 1;
      while (q.length) { var x2 = q.shift(); if (x2 === b) break;
        subset.forEach(function (p) { if (p[0] === x2 && !seen[p[1]]) { seen[p[1]] = 1; prev[p[1]] = x2; q.push(p[1]); } }); }
      var out = [], cur = b;
      while (prev[cur] !== undefined) { out.unshift(says("every " + word(prev[cur]), cur)); cur = prev[cur]; }
      return out;
    }
    /* the question: "are all A B", "is a lemon sweet", "is Rex an animal",
       "can a salmon walk", "does Tom have fur" */
    var qm = question.match(/^(is|are|can|could|does|do)\s+(?:(all|every|each)\s+)?((?:an?\s+|the\s+)?[A-Za-z]+)\s+(.+)$/i);
    if (!qm) return null;
    var aux = qm[1].toLowerCase(), B = pred(/^(?:is|are)$/.test(aux) ? "is " + qm[4] : /^(?:can|could)$/.test(aux) ? "can " + qm[4] : qm[4]);
    if (!B) return null;
    var subjRaw = qm[3], all = !!qm[2], named = !all && /^(?:the\s+[a-z]+|[A-Z][a-z]+)$/.test(subjRaw) && !/^(?:An?|The)\s/.test(subjRaw);
    var who = subjRaw.toLowerCase(), mine = named ? member.filter(function (p) { return p[0] === who; }).map(function (p) { return p[1]; }) : [];
    if (named && nonmember.some(function (p) { return p[0] === who && p[1] === B; }))
      return { answer: "No", kind: "categories", certain: true, steps: [], text: "No — that's stated directly: " + says(subjRaw, B, true) + "." };
    if (named && mine.indexOf(B) >= 0)
      return { answer: "Yes", kind: "categories", certain: true, steps: [], text: "Yes — that's stated directly: " + says(subjRaw, B) + "." };
    var starts, subj, lead, ex2 = null;
    if (named && mine.length) { starts = mine; subj = subjRaw; }
    else if (named) return null;
    else {
      var A0 = cls(subjRaw);
      if (!shown[A0]) return null;
      starts = [A0]; subj = all ? "every " + word(A0) : subjRaw.toLowerCase();
    }
    for (var i = 0; i < starts.length; i++) {
      var S = starts[i];
      lead = named ? [says(subj, S)] : [];
      if (supers(S).indexOf(B) >= 0) {
        var chain = lead.concat(pathTo(S, B));
        return { answer: "Yes", kind: "categories", certain: true, steps: chain,
                 text: "Yes. " + capital(chain.join(", and ")) + (named || chain.length < 2 ? "." : ", so " + says(subj, B) + ".") };
      }
      var ex = excluded(S, B);
      if (ex) {
        var via = lead.concat(pathTo(S, ex[0]));
        return { answer: "No", kind: "categories", certain: true, steps: via.concat([says("no " + word(ex[0]), ex[1])]),
                 text: "No. " + capital(via.concat([says("no " + word(ex[0]), ex[1])]).join(", and ")) +
                       ", so " + says(subj, B, true) + "." };
      }
    }
    /* "some artists are poets" and "no poet is a robot": those artists are
       not robots, so not every artist is one */
    if (all) {
      for (var e = 0; e < some.length; e++) {
        var pr = some[e];
        [[pr[0], pr[1]], [pr[1], pr[0]]].forEach(function (o) { if (!ex2 && supers(o[0]).indexOf(starts[0]) >= 0 && excluded(o[1], B)) { ex2 = o; ex2.d = excluded(o[1], B); } });
        if (ex2) break;
      }
      if (ex2) return { answer: "No", kind: "categories", certain: true, steps: ["some " + many(ex2[0]) + " are " + many(ex2[1]), says("no " + word(ex2.d[0]), ex2.d[1])],
        text: "No. Some " + many(ex2[0]) + " are " + (shown[ex2[1]] && shown[ex2[1]].noun === false ? word(ex2[1]) : many(ex2[1])) + ", and " + says("no " + word(ex2.d[0]), ex2.d[1]) +
              " — so those " + many(ex2[0]) + " " + (shown[B] && shown[B].verb ? (shown[B].verb === "can" ? "can't " : "don't have ") + shown[B].w : "aren't " + (shown[B] && shown[B].noun ? many(B) : word(B))) +
              ", which means not " + says(subj, B).replace(/^every /, "every ") + "." };
    }
    for (var j = 0; j < starts.length; j++) {
      var up = supers(starts[j]), sm = some.filter(function (p) { return up.indexOf(p[0]) >= 0 && p[1] === B; })[0];
      if (sm && all) return { answer: "Not necessarily", kind: "categories", certain: true, steps: ["only some " + many(sm[0]) + " " + areAll(B)],
        text: "Not necessarily. We're only told that some " + many(sm[0]) + " " + areAll(B) + " — that doesn't mean " + says(subj, B) + "." };
      if (sm) return { answer: "Not necessarily", kind: "categories", certain: true, steps: ["only some " + many(sm[0]) + " " + areAll(B)],
        text: "Not necessarily. Only some " + many(sm[0]) + " " + areAll(B) + ", and nothing stated says " + subj + " is one of them — " +
              subj + " may or may not " + (shown[B] && shown[B].verb === "do" ? shown[B].v + (shown[B].w ? " " + shown[B].w : "") : shown[B] && shown[B].verb ? (shown[B].verb === "can" ? "be able to " : "have ") + shown[B].w : "be " + (shown[B] && shown[B].noun ? article(word(B)) + " " : "") + word(B)) + "." };
    }
    return { answer: "Can't tell", kind: "categories", certain: false, steps: [], text: "I can't tell: nothing stated settles whether " + says(subj, B) + "." };
  }
  function article(w) { return /^[aeiou]/i.test(w) ? "an" : "a"; }
  function third(v) { return /(?:s|sh|ch|x|z|o)$/.test(v) ? v + "es" : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ies" : v + "s"; }
  /* a verb, by the lexicon or by an everyday verb's inflection */
  function verbish(w) {
    w = String(w).toLowerCase();
    if (/^(?:is|are|was|were|be|been|a|an|the|in|on|at|of|to|for|with|and|or|not|very|so)$/.test(w)) return false;
    var L = get("C4LMLexicon"), lx = null, b = w.replace(/(?:es|s)$/, "");
    try { lx = L && L.lookup ? (L.lookup(w) || L.lookup(b)) : null; } catch (e) { lx = null; }
    if (lx && lx.senses && lx.senses.some(function (x) { return x.pos === "v"; })) return true;
    return /^(?:play|plays|eat|eats|drink|drinks|read|reads|swim|swims|run|runs|sing|sings|speak|speaks|like|likes|love|loves|own|owns|wear|wears|drive|drives|live|lives|work|works|study|studies|write|writes|cook|cooks|dance|dances|fly|flies|walk|walks|lay|lays|sleep|sleeps|climb|climbs|bark|barks|bite|bites|grow|grows|use|uses|need|needs|know|knows|want|wants)$/.test(w);
  }
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
    /* "twice his age" is twice as old as the person "his" points back to,
       and "his sister" names one person, the same one in the question */
    t = t.replace(/\b(twice|double|thrice|triple|half|\d+(?:\.\d+)?\s+times)\s+(?:his|her|their)\s+age\b/gi, function (all, k, off) {
      var prior = (t.slice(0, off).match(/\b[A-Z][a-z]+\b/g) || []).filter(function (n) { return !/^(?:His|Her|Their|The|A|An|If|He|She|They|It|How|What|When|Who|My)$/.test(n); });
      return prior.length ? k + " as old as " + prior[prior.length - 1] : all;
    }).replace(/\b(?:[Hh]is|[Hh]er|[Tt]heir)\s+(sister|brother|mother|father|mom|mum|dad|son|daughter|friend|cousin|aunt|uncle|grandma|grandpa|grandmother|grandfather|wife|husband|boss|teacher|dog|cat)\b/g, "the $1");
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
      if ((m = s.match(new RegExp("^" + NP + "\\s+" + VERB + "\\s+(-?\\d+(?:\\.\\d+)?)\\s*(?:[a-z]+\\s+)?(more|less|fewer|older|younger|taller|shorter|heavier|lighter)(?:\\s+[a-z]+)?\\s+than\\s+" + NP, "i")))) {
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
  /* things that leave or arrive on their own: "5 fly away", "3 more came" */
  var DEPART = /^(?:fly|flies|flew|run|runs|ran|walk|walks|walked|swim|swims|swam|leave|leaves|left|go|goes|went|hop|hops|hopped|escape|escapes|escaped|die|dies|died|melt|melts|melted|pop|pops|popped|fall|falls|fell|jump|jumps|jumped|get|gets|got|drive|drives|drove|sail|sails|sailed)$/i;
  var ARRIVE = /^(?:come|comes|came|arrive|arrives|arrived|join|joins|joined|land|lands|landed|hatch|hatches|hatched|appear|appears|appeared|get|gets|got|hop|hops|hopped|climb|climbs|climbed)$/i;
  function changes(text) {
    if (RATE.test(text)) return null;
    var t = numbersIn(text).replace(/\$\s*(\d)/g, "$1");
    /* the starting amount: a possession ("Emma had 8 balloons"), what is
       there ("there are 12 birds"), or a first acquisition ("Mia picked 15
       apples") -- what was picked or baked did not exist for her before */
    var m = t.match(/\b(I|we|you|[A-Z][a-z]+|he|she|they)\s+(?:has|have|had|owns?|owned|starts? with|started with)\s+(\d+(?:\.\d+)?)\s+([a-z]+)/i), how = "had";
    if (!m && (m = t.match(/\b(there)\s+(?:are|were|is|was)\s+(\d+(?:\.\d+)?)\s+([a-z]+)/i))) how = "there";
    if (!m) {
      var re0 = /\b(I|we|you|[A-Z][a-z]+|he|she|they)\s+(?:just\s+|first\s+)?([a-z]+)\s+(\d+(?:\.\d+)?)\s+([a-z]+)/gi, m0;
      while ((m0 = re0.exec(t))) if (GAIN.test(m0[2]) && !/^(?:borrow|borrowed|save|saved|saves|add|added|adds)$/i.test(m0[2])) { m = [m0[0], m0[1], m0[3], m0[4]]; m.index = m0.index; how = m0[2]; break; }
    }
    if (!m) return null;
    var owner = m[1], count = +m[2], item = m[3], who = /^(?:I|we)$/i.test(owner) ? "you" : owner;
    var said = how === "there" ? "there " + (/\bwere\b/i.test(m[0]) ? "were " : "are ") + m[2] + " " + item :
               who + " " + (how === "had" ? (/\bhas\b/.test(m[0]) ? "has" : /\bhave\b/.test(m[0]) ? (who === "you" ? "have" : "have") : "had") : how.toLowerCase()) + " " + m[2] + " " + item;
    var steps = [said], expr = [m[2]];
    var rest = t.slice(m.index + m[0].length), mm, changed = false, ev = [];
    var re = /\b([a-z]+)\s+(away\s+|up\s+)?(?:another\s+)?(\d+(?:\.\d+)?)(\s+(?:more|of them|of these|more\s+[a-z]+))?/gi;
    while ((mm = re.exec(rest))) {
      var verb = mm[1], n = +mm[3];
      if (GAIN.test(verb)) ev.push([mm.index, n, verb + " " + (mm[2] || "") + mm[3] + (mm[4] || "")]);
      else if (LOSS.test(verb)) ev.push([mm.index, -n, verb + " " + (mm[2] || "") + mm[3]]);
    }
    /* a number as the subject: "5 fly away", "6 got off", "3 more came" */
    var re2 = /\b(\d+(?:\.\d+)?)\s+(more\s+)?(?:of (?:them|the [a-z]+)\s+|[a-z]+\s+)??([a-z]+)(?:\s+(away|off|out|down|on|in|over|back))?\b/gi;
    while ((mm = re2.exec(rest))) {
      var v2 = mm[3], p2 = (mm[4] || "").toLowerCase(), n2 = +mm[1];
      if (/^(?:get|gets|got|hop|hops|hopped|climb|climbs|climbed)$/i.test(v2) && !p2) continue;
      var arrive = ARRIVE.test(v2) && (!/^(?:get|gets|got|hop|hops|hopped|climb|climbs|climbed)$/i.test(v2) || /^(?:on|in|back)$/.test(p2)) && p2 !== "away" && p2 !== "off" && p2 !== "out",
          depart = !arrive && DEPART.test(v2) && (!/^(?:fly|flies|flew|run|runs|ran|walk|walks|walked|swim|swims|swam|hop|hops|hopped|jump|jumps|jumped|get|gets|got|drive|drives|drove|sail|sails|sailed)$/i.test(v2) || /^(?:away|off|out|down)$/.test(p2));
      if (arrive || depart) ev.push([mm.index, arrive ? n2 : -n2, mm[0].trim()]);
    }
    ev.sort(function (a, b) { return a[0] - b[0]; });
    ev.forEach(function (e) { count += e[1]; steps.push(flip(e[2])); expr.push((e[1] < 0 ? "− " : "+ ") + Math.abs(e[1])); changed = true; });
    if (!changed) return null;
    var ask = text.split(/[.!]/).pop() + text.slice(-60);
    if (!/\?/.test(text) || !/\b(?:how\s+(?:many|much)|what)\b/i.test(text) || !/\b(?:left|remain|remaining|now|have|has|end up|altogether|in total|total|are there|were there)\b/i.test(ask)) return null;
    if (count < 0) return null;
    var money = /\$|\bdollars?\b/i.test(text), v = Math.round(count * 100) / 100;
    /* the noun as the problem wrote it ("people", "fish"), singular for one */
    var IRR = { people: "person", children: "child", men: "man", women: "woman", mice: "mouse", geese: "goose", teeth: "tooth", feet: "foot" };
    var noun = count === 1 ? (IRR[item.toLowerCase()] || singular(item)) : +m[2] !== 1 ? item : plural(item);
    var shown = (money && /\$/.test(text) ? "$" : "") + v + (money && !/\$/.test(text) ? (v === 1 ? " dollar" : " dollars") : " " + noun);
    return { answer: shown, value: count, kind: "changes", certain: true, steps: steps,
             text: shown + (/\b(?:left|remain)/i.test(ask) ? " left" : "") + ". " + capital(steps[0]) + ", then " + steps.slice(1).join(", then ") + ": " + expr.join(" ") + " = " + v + "." };
  }

  /* ============================================================ groups */

  /* equal groups: "3 packs of gum with 5 pieces each", "4 boxes. Each box
     has 6 eggs." -- a count of groups times the size of each */
  function groups(text) {
    if (!/\?/.test(text)) return null;
    var t = numbersIn(text);
    var m = t.match(/\b(\d+)\s+([a-z]+)(?:\s+of\s+[a-z]+)?,?\s+(?:each\s+)?(?:with|of|containing|holding)\s+(\d+)\s+([a-z]+)(?:\s+(?:each|in each|apiece|inside))?\b/i) ||
            t.match(/\b(\d+)\s+([a-z]+)\b[^.?!]*[.,;]?\s*(?:and\s+)?(?:each|every)\s+(?:one\s+|of them\s+|[a-z]+\s+)?(?:has|holds|contains|had|held|contained|with)\s+(\d+)\s+([a-z]+)/i);
    if (!m) return null;
    var q = t.match(/\bhow\s+many\s+([a-z]+)/i);
    if (!q || base(singular(q[1])) !== base(singular(m[4]))) return null;
    var n = +m[1], k = +m[3], total = n * k, item = m[4].toLowerCase();
    return { answer: total + " " + item, value: total, kind: "groups", certain: true, steps: [n + " × " + k + " = " + total],
             text: total + " " + (total === 1 ? singular(item) : item) + ". " + n + " " + m[2] + " × " + k + " " + item + " each = " + total + " " + item + "." };
  }

  /* ============================================================ totals */

  /* counts of one kind added up: "3 red balls and 5 blue balls"; a kind
     can also be the class the counted things belong to ("4 cats and 3
     dogs" are animals, by the knowledge base) */
  function isKind(word, kind) {
    var w = base(singular(word)), k = base(singular(kind));
    if (w === k) return true;
    var KB = get("C4LMKB"), hits = [];
    try { hits = KB && KB.resolve ? KB.resolve(singular(word), { strict: true }) : []; } catch (e) { hits = []; }
    if (!hits.length) return false;
    var e = hits[0].entity, first = String(e.defn || "").split(/(?<=\.)\s/)[0].toLowerCase();
    return base(singular(String(e.type || ""))) === k || new RegExp("\\b" + singular(kind).toLowerCase() + "s?\\b").test(first.replace(/^.+?\s(?:is|are)\s/, ""));
  }
  function totals(text) {
    if (RATE.test(text) || !/\?/.test(text)) return null;
    var t = numbersIn(text), q = t.match(/\bhow\s+many\s+([a-z]+)\b[^?]*\?/i);
    if (!q) return null;
    var noun = q[1].toLowerCase();
    if (/^(?:more|of|are|is|do|does|did|were|was|will|can|times|ways)$/.test(noun)) return null;
    if (/\b(?:ate|eats?|eaten|gave|gives?|lost|loses?|sold|sells?|spent|spends?|bought|buys?|found|finds?|more|fewer|less|left|away|remain\w*|than|times|twice|half|each|per)\b/i.test(t)) return null;
    var body = t.slice(0, q.index), re = /\b(\d+(?:\.\d+)?)\s+([a-z]+(?:\s+[a-z]+){0,2})/gi, m, parts = [];
    while ((m = re.exec(body))) {
      var ws = m[2].toLowerCase().split(/\s+/);
      for (var j = 0; j < ws.length && !/^(?:and|or|with|in|on|of)$/.test(ws[j]); j++) if (isKind(ws[j], noun)) { parts.push([+m[1], ws.slice(0, j + 1).join(" ")]); break; }
    }
    if (parts.length < 2) return null;
    var total = parts.reduce(function (a, p) { return a + p[0]; }, 0), shown = total === 1 ? singular(noun) : noun;
    return { answer: total + " " + shown, value: total, kind: "totals", certain: true, steps: parts.map(function (p) { return p[0] + " " + p[1]; }),
             text: total + " " + shown + ". " + parts.map(function (p) { return p[0] + " " + p[1]; }).join(" + ") + " = " + total + " " + shown + "." };
  }
  /* a whole cut into equal parts, some of them taken: what is left, as a
     count and as a fraction of the whole */
  function portions(text) {
    if (!/\?/.test(text)) return null;
    var t = numbersIn(text);
    var w = t.match(/\b(?:cut|divided|split|sliced|broken)\s+(?:up\s+)?into\s+(\d+)\s+(?:equal\s+|even\s+)?([a-z]+)/i) || t.match(/\b(?:has|had)\s+(\d+)\s+(slices|pieces|parts|segments|squares|sections)\b/i);
    if (!w) return null;
    var N = +w[1], unit = w[2].toLowerCase(), rest = t.slice(w.index + w[0].length), m, gone = 0, verb = null;
    var re = /\b(eat|eats|ate|take|takes|took|give|gives|gave|use|uses|used|share|shares|shared)\s+(?:away\s+)?(\d+)/gi;
    while ((m = re.exec(rest))) { gone += +m[2]; verb = verb || m[1].toLowerCase(); }
    if (!gone || gone > N) return null;
    var asksFrac = /\bwhat\s+(?:fraction|part|portion|share)\b|\bhow\s+much\s+of\b/i.test(t), asksPct = /\bwhat\s+percent(?:age)?\b/i.test(t), asksCount = /\bhow\s+many\b/i.test(t);
    if (!asksFrac && !asksPct && !asksCount) return null;
    var left = N - gone, g = (function gcd(a, b) { return b ? gcd(b, a % b) : a; })(left, N), frac = (left / g) + "/" + (N / g), pct = Math.round(left / N * 1000) / 10;
    var PART = { eat: "eaten", eats: "eaten", ate: "eaten", take: "taken", takes: "taken", took: "taken", give: "given away", gives: "given away", gave: "given away",
                 use: "used", uses: "used", used: "used", share: "shared", shares: "shared", shared: "shared" };
    var wm = t.match(/\b(?:a|an|the)\s+([a-z]+)\s+(?:is|was|gets|got)\s+(?:cut|divided|split|sliced|broken)/i), whole = wm ? "the " + wm[1].toLowerCase() : "it";
    var head = asksCount && !asksFrac && !asksPct ? left + " " + (left === 1 ? singular(unit) : unit) + " left" : (asksPct ? pct + "%" : frac) + " of " + whole + " is left";
    return { answer: asksPct ? pct + "%" : asksFrac ? frac : String(left), value: left / N, kind: "portions", certain: true, steps: [N + " − " + gone + " = " + left],
             text: capital(head) + ". " + capital(whole) + " was cut into " + N + " " + unit + " and " + gone + " " + (gone === 1 ? "was " : "were ") + (PART[verb] || "taken") +
                   ", so " + left + " of the " + N + " remain" + (left === 1 ? "s" : "") + " — " + (g > 1 ? left + "/" + N + " = " : "") + frac + ", or " + pct + "%." };
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
    /* the next or previous day or month: "what day comes after Friday" */
    var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    var nx = t.match(/\b(after|before)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|january|february|march|april|june|july|august|september|october|november|december)\b/i);
    if (nx && /\b(?:what|which)\b/i.test(t) && /\b(?:day|month|comes?|came)\b/i.test(t) && !/\d/.test(t) && !/\b(?:today|tomorrow|yesterday)\b/i.test(t)) {
      var nm0 = nx[2].toLowerCase(), cyc = DAYS.indexOf(nm0) >= 0 ? DAYS : MONTHS, st0 = /before/i.test(nx[1]) ? -1 : 1;
      var res0 = cyc[((cyc.indexOf(nm0) + st0) % cyc.length + cyc.length) % cyc.length];
      return { answer: capital(res0), kind: "clock", certain: true, steps: [capital(nm0) + (st0 > 0 ? " + 1" : " − 1")],
               text: capital(res0) + " comes " + nx[1].toLowerCase() + " " + capital(nm0) + (cyc === DAYS && ((nm0 === "saturday" && st0 > 0) || (nm0 === "sunday" && st0 < 0)) ? " — the week wraps around." : cyc === MONTHS && ((nm0 === "december" && st0 > 0) || (nm0 === "january" && st0 < 0)) ? " — the year wraps around." : ".") };
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
    /* "From tallest to shortest: Jack, Kim, Lee" */
    function chain() {
      var order = names.slice().sort(function (p, q2) { return above(p, q2) ? -1 : above(q2, p) ? 1 : 0; });
      function most(c) { return c.replace(/([^aeiou])\1er$/, "$1$1er").replace(/er$/, "est"); }
      return "from " + most(adj) + " to " + most(OPPOSITE[adj]) + ": " + order.join(", ");
    }
    var question = t.slice(t.lastIndexOf(".", qm) + 1, qm + 1).replace(/^\s*(?:so|then|and)\s+/i, "").trim();
    var qq = question.match(/\b(?:[Ii]s|[Ww]as|[Aa]re|[Ww]ere)\s+([A-Z][a-z]+)\s+([a-z]+er)\s+than\s+([A-Z][a-z]+)/);
    if (qq) {
      var qa = qq[2].toLowerCase(), X = qq[1], Y = qq[3];
      if (qa !== adj && OPPOSITE[qa] !== adj) return null;
      var yes = qa === adj ? above(X, Y) : above(Y, X), no = qa === adj ? above(Y, X) : above(X, Y);
      if (!yes && !no) return { answer: "Can't tell", kind: "ordering", certain: false, steps: [], text: "I can't tell: nothing stated connects " + X + " and " + Y + " in that order." };
      return { answer: yes ? "Yes" : "No", kind: "ordering", certain: true, steps: [chain()],
               text: (yes ? "Yes" : "No") + ". " + capital(chain()) + " — so " + X + " is " + (yes ? "" : "not ") + qa + " than " + Y + "." };
    }
    var sm = question.match(/\bwho(?:'s| is| was)?\s+(?:the\s+)?([a-z]+est)\b/i);
    if (sm && SUPER[sm[1].toLowerCase()]) {
      var sa = SUPER[sm[1].toLowerCase()], top = names.filter(function (n) {
        return names.every(function (o) { return o === n || (sa === adj ? above(n, o) : above(o, n)); });
      });
      if (top.length !== 1) return { answer: "Can't tell", kind: "ordering", certain: false, steps: [], text: "I can't tell who is " + sm[1] + " from what's stated — the comparisons don't connect everyone." };
      return { answer: top[0], kind: "ordering", certain: true, steps: [chain()], text: top[0] + ". Putting what's stated in order, " + chain() + "." };
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
                 ["clock", clock], ["ages", ages], ["groups", groups], ["changes", changes], ["portions", portions], ["totals", totals], ["quantities", quantities]];
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

  var E = { solve: solve, rules: rules, categories: categories, quantities: quantities, changes: changes, clock: clock, equal: equal, OPPOSITE: OPPOSITE,
            proposition: proposition, sameProp: sameProp, base: base };
  root.C4LMEveryday = E;
  if (typeof module !== "undefined" && module.exports) module.exports = E;
})(typeof window !== "undefined" ? window : globalThis);
