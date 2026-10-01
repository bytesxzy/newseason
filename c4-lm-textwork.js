/* Work on a piece of text the user supplies: summarise it, pull out keywords, judge the sentiment, change the tone, reword it,
 * give it a title, turn it into bullets, count it, say how hard it is to read, say what it is about.
 *
 * Everything is rule-based and local: sentence scoring by word frequency, a sentiment lexicon with negation, phrase tables for
 * formal and casual wording, a synonym table, topic word lists. solve(text) returns { answer, schema, confidence } or null.
 * The text to work on is whatever follows a colon or a quote, or whatever precedes the instruction. */
(function (root) {
  "use strict";

  var STOP = ("a an the and or but if then than so as of at by for with about against between into through during before after above below to from up down in out on off over under again further once here there when where why how all any both each few more most other some such no nor not only own same too very can will just don should now is are was were be been being have has had having do does did doing i me my myself we our ours you your yours he him his she her hers it its they them their theirs what which who whom this that these those am would could might may must shall also however although though while whether because until unless since yet still even already much many one two said say says").split(" ");
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  function clean(t) { return String(t || "").replace(/\s+/g, " ").trim(); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  var ABBR = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K|No|Inc|Ltd|Co|a\.m|p\.m)\.$/;
  function sentences(text) {
    var raw = String(text).replace(/\r/g, "").split(/(?<=[.!?])["')\]]*\s+(?=["'(\[]?[A-Z0-9])|\n+/), out = [], i;
    for (i = 0; i < raw.length; i++) {
      var s = raw[i].trim(); if (!s) continue;
      if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += " " + s; else out.push(s);
    }
    return out;
  }
  function tokens(text) { return String(text).toLowerCase().replace(/[^a-z0-9'\s-]+/g, " ").split(/\s+/).filter(Boolean); }
  var IRREG = { paid: "pay", bought: "buy", sold: "sell", made: "make", took: "take", gave: "give", ran: "run", saw: "see", said: "say", found: "find", got: "get", had: "has", was: "be", were: "be", is: "be", are: "be", did: "do", does: "do", went: "go", came: "come", ate: "eat", wrote: "write", won: "win", lost: "lose", met: "meet", left: "leave", built: "build", began: "begin", brought: "bring", thought: "think", taught: "teach", caught: "catch", felt: "feel", kept: "keep", held: "hold", told: "tell", sat: "sit", stood: "stand", spent: "spend", sent: "send", grew: "grow", drew: "draw", flew: "fly", knew: "know", chose: "choose", drove: "drive", rode: "ride", fell: "fall", hid: "hide", founded: "found", founding: "found", children: "child", people: "person", men: "man", women: "woman", mice: "mouse", feet: "foot", countries: "country", cities: "city", babies: "baby", families: "family", stories: "story" };
  function stem(w) { if (IRREG[w]) return IRREG[w]; return w.replace(/ies$/, "y").replace(/(?:ing|ed|es|s|ly)$/, "").replace(/(.)\1$/, "$1") || w; }
  function syl(w) {
    var W = root.C4LMWrite;
    if (W && W.syllables) return W.syllables(w);
    w = String(w).toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0; if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    var g = w.match(/[aeiouy]{1,2}/g); return g ? g.length : 1;
  }

  /* ------------------------------------------------------------ summaries and keywords */
  function frequencies(text) {
    var f = {}, forms = {}, ts = tokens(text);
    ts.forEach(function (w) { if (w.length < 3 || STOPSET[w] || /^\d+$/.test(w)) return; var k = stem(w); f[k] = (f[k] || 0) + 1; forms[k] = forms[k] || {}; forms[k][w] = (forms[k][w] || 0) + 1; });
    return { f: f, forms: forms };
  }
  function surface(forms, k) { var best = "", n = -1; Object.keys(forms[k] || {}).forEach(function (w) { if (forms[k][w] > n) { n = forms[k][w]; best = w; } }); return best || k; }
  function summarize(text, k) {
    var ss = sentences(text);
    if (ss.length <= k) return ss;
    var F = frequencies(text), max = 0; Object.keys(F.f).forEach(function (w) { if (F.f[w] > max) max = F.f[w]; });
    var scored = ss.map(function (s, i) {
      var ts = tokens(s).filter(function (w) { return w.length >= 3 && !STOPSET[w]; }), sc = 0;
      ts.forEach(function (w) { sc += (F.f[stem(w)] || 0) / (max || 1); });
      sc = ts.length ? sc / Math.sqrt(ts.length + 2) : 0;
      if (i === 0) sc *= 1.6; else if (i === ss.length - 1) sc *= 1.1;
      if (ts.length < 4) sc *= 0.5;
      return { s: s, i: i, sc: sc };
    });
    return scored.slice().sort(function (a, b) { return b.sc - a.sc; }).slice(0, k).sort(function (a, b) { return a.i - b.i; }).map(function (x) { return x.s; });
  }
  function keywords(text, n) {
    var F = frequencies(text), ks = Object.keys(F.f).sort(function (a, b) { return F.f[b] - F.f[a] || b.length - a.length; });
    var caps = {}; (String(text).match(/(?<=[a-z,;:)]\s)[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})*/g) || []).forEach(function (c) { if (!/^(?:The|This|That|These|Those|There|They|Their|It|Its|When|Where|What|Which|While|However|But|And|For|With|From|Some|Many|Most|Our|His|Her|She|He|You|Your|We|In|On|At|As|By|If)$/.test(c)) caps[c] = (caps[c] || 0) + 1; });
    var out = [];
    Object.keys(caps).sort(function (a, b) { return caps[b] - caps[a]; }).slice(0, Math.ceil(n / 2)).forEach(function (c) { out.push(c); });
    ks.forEach(function (k) { if (out.length >= n) return; var w = surface(F.forms, k); if (out.some(function (o) { return o.toLowerCase().indexOf(w) >= 0; })) return; out.push(w); });
    /* a repeated two-word phrase of content words reads better than its parts */
    var ts = tokens(text), bi = {};
    for (var i = 0; i + 1 < ts.length; i++) if (!STOPSET[ts[i]] && !STOPSET[ts[i + 1]] && ts[i].length > 2 && ts[i + 1].length > 2) { var b = ts[i] + " " + ts[i + 1]; bi[b] = (bi[b] || 0) + 1; }
    var top = Object.keys(bi).filter(function (b) { return bi[b] >= 2; }).sort(function (a, b) { return bi[b] - bi[a]; })[0];
    if (top && out.indexOf(top) < 0) { out = out.filter(function (o) { return top.indexOf(o) < 0; }); out.unshift(top); }
    return out.slice(0, n);
  }

  /* ------------------------------------------------------------ sentiment */
  var POS = ("love loved loves loving like liked likes great good excellent amazing awesome fantastic wonderful brilliant superb outstanding perfect best better beautiful happy glad delighted pleased joy joyful enjoy enjoyed enjoyable fun funny friendly helpful kind nice lovely terrific fabulous marvellous marvelous impressive impressed recommend recommended favourite favorite incredible stunning gorgeous charming cheerful comfortable easy fast reliable fresh delicious tasty satisfied satisfying thrilled thrilling exciting excited positive success successful win won winning proud grateful thank thanks thankful smile smiling super cool neat clean smooth generous caring warm welcoming cozy elegant flawless solid worth valuable useful improved improve improving hope hopeful peaceful calm relaxed relaxing sweet adorable hilarious entertaining engaging inspiring inspired courage brave strong").split(" ");
  var NEG = ("hate hated hates hating dislike disliked bad worse worst terrible awful horrible dreadful poor disappointing disappointed disappointment sad unhappy angry annoyed annoying upset mad furious boring bored dull slow slowly broken fail failed failure failing useless waste wasted ugly dirty filthy rude unfriendly unhelpful cold stale bland overpriced expensive noisy loud painful pain hurt hurts suffer suffering sick ill tired exhausted stressful stress anxious worried worry fear afraid scared scary nasty disgusting gross cheap flimsy faulty defective damaged missing late delayed lost lose losing lost never nothing nobody problem problems trouble difficult hard impossible cruel mean harsh negative regret sorry unfortunately unfortunate depressing depressed miserable lonely abandoned toxic tragic disaster mess awful dangerous risky unsafe ruin ruined worthless pathetic lame hopeless tedious confusing confused frustrated frustrating complain complaint").split(" ");
  var POSS = {}, NEGS = {}; POS.forEach(function (w) { POSS[w] = 1; }); NEG.forEach(function (w) { NEGS[w] = 1; });
  var NEGATORS = /^(?:not|no|never|none|neither|nor|hardly|barely|scarcely|without|isn't|wasn't|aren't|weren't|don't|doesn't|didn't|won't|wouldn't|can't|cannot|couldn't|shouldn't|haven't|hasn't|hadn't|isnt|wasnt|dont|doesnt|didnt|cant|wont)$/;
  var BOOST = /^(?:very|really|extremely|absolutely|totally|completely|incredibly|truly|so|super|utterly|highly|especially|deeply|insanely)$/;
  var EMO = {
    joy: "happy joy joyful delighted glad thrilled excited cheerful love loved wonderful fantastic amazing great enjoy enjoyed fun celebrate proud grateful",
    sadness: "sad unhappy depressed miserable lonely cry crying tears grief lost heartbroken sorry disappointed hopeless regret mourn",
    anger: "angry mad furious annoyed irritated hate hated rage outraged livid frustrated disgusted unacceptable outrageous",
    fear: "afraid scared fear frightened terrified anxious worried nervous panic horror dread terrifying scary",
    surprise: "surprised shocked astonished amazed unexpected sudden wow unbelievable stunned startled"
  };
  function sentiment(text) {
    var ts = String(text).toLowerCase().replace(/[^a-z0-9'\s-]+/g, " ").split(/\s+/).filter(Boolean), pos = [], neg = [], score = 0, i;
    for (i = 0; i < ts.length; i++) {
      var w = ts[i], p = POSS[w], n = NEGS[w];
      if (!p && !n) continue;
      var flip = false, boost = 1, j;
      for (j = Math.max(0, i - 3); j < i; j++) { if (NEGATORS.test(ts[j]) || /n't$/.test(ts[j])) flip = true; if (BOOST.test(ts[j])) boost = 1.5; }
      var v = (p ? 1 : -1) * boost * (flip ? -0.8 : 1);
      score += v; if (v > 0) pos.push((flip ? "not " : "") + w); else neg.push((flip ? "not " : "") + w);
    }
    if (/!/.test(text) && score !== 0) score *= 1.1;
    var label = score >= 0.8 ? "positive" : (score <= -0.8 ? "negative" : "neutral");
    if (pos.length && neg.length && Math.abs(score) < 2) label = "mixed";
    var emo = null, best = 0;
    Object.keys(EMO).forEach(function (e) { var n2 = 0, set = EMO[e].split(" "); ts.forEach(function (w) { if (set.indexOf(w) >= 0) n2++; }); if (n2 > best) { best = n2; emo = e; } });
    return { label: label, score: Math.round(score * 10) / 10, pos: pos, neg: neg, emotion: emo };
  }

  /* ------------------------------------------------------------ tone */
  var CONTR = [["can't", "cannot"], ["won't", "will not"], ["don't", "do not"], ["doesn't", "does not"], ["didn't", "did not"], ["isn't", "is not"], ["aren't", "are not"], ["wasn't", "was not"], ["weren't", "were not"], ["haven't", "have not"], ["hasn't", "has not"], ["hadn't", "had not"], ["wouldn't", "would not"], ["couldn't", "could not"], ["shouldn't", "should not"], ["I'm", "I am"], ["I've", "I have"], ["I'll", "I will"], ["I'd", "I would"], ["it's", "it is"], ["that's", "that is"], ["there's", "there is"], ["what's", "what is"], ["he's", "he is"], ["she's", "she is"], ["we're", "we are"], ["they're", "they are"], ["you're", "you are"], ["let's", "let us"], ["we've", "we have"], ["you've", "you have"], ["they've", "they have"], ["we'll", "we will"], ["you'll", "you will"], ["they'll", "they will"]];
  var SLANG = [[/\bcan u\b/gi, "can you"], [/\bu\b/gi, "you"], [/\bur\b/gi, "your"], [/\br\b/gi, "are"], [/\bpls\b|\bplz\b/gi, "please"], [/\bthx\b|\bthnx\b|\bty\b/gi, "thank you"], [/\bgonna\b/gi, "going to"], [/\bwanna\b/gi, "want to"], [/\bgotta\b/gi, "have to"], [/\bkinda\b/gi, "somewhat"], [/\bsorta\b/gi, "somewhat"], [/\bya\b/gi, "you"], [/\byeah\b|\byep\b|\byup\b/gi, "yes"], [/\bnope\b/gi, "no"], [/\bhey\b|\bhiya\b|\byo\b/gi, "Hello"], [/\basap\b/gi, "as soon as possible"], [/\bbtw\b/gi, "by the way"], [/\bfyi\b/gi, "for your information"], [/\blol\b|\bhaha+\b|\blmao\b/gi, ""], [/\bomg\b/gi, ""], [/\bbc\b|\bcuz\b|\bcos\b/gi, "because"], [/\btho\b/gi, "though"], [/\bokay\b|\bok\b/gi, "all right"], [/\bguys\b/gi, "everyone"], [/\bbig deal\b/gi, "significant matter"], [/\bawesome\b/gi, "excellent"], [/\bcool\b/gi, "fine"], [/\bstuff\b/gi, "items"], [/\bkids\b/gi, "children"], [/\bget\b/gi, "obtain"], [/\bbuy\b/gi, "purchase"], [/\bhelp\b/gi, "assist"], [/\bneed\b/gi, "require"], [/\bask\b/gi, "inquire"], [/\bshow\b/gi, "demonstrate"], [/\bstart\b/gi, "begin"], [/\bend\b/gi, "conclude"], [/\bsorry\b/gi, "I apologise"], [/\bsend me\b/gi, "send me"], [/\bnow\b/gi, "immediately"]];
  var CASUAL = [[/\bhello\b/gi, "hi"], [/\bdear\b/gi, "hi"], [/\bhowever\b/gi, "but"], [/\btherefore\b/gi, "so"], [/\badditionally\b|\bfurthermore\b|\bmoreover\b/gi, "also"], [/\bregarding\b|\bconcerning\b/gi, "about"], [/\bassist\b/gi, "help"], [/\bobtain\b/gi, "get"], [/\brequire\b/gi, "need"], [/\binquire\b/gi, "ask"], [/\bcommence\b/gi, "start"], [/\bterminate\b/gi, "end"], [/\butili[sz]e\b/gi, "use"], [/\bsufficient\b/gi, "enough"], [/\bapproximately\b/gi, "about"], [/\bdemonstrate\b/gi, "show"], [/\bnumerous\b/gi, "lots of"], [/\bindividuals\b/gi, "people"], [/\bendeavou?r\b/gi, "try"], [/\bprior to\b/gi, "before"], [/\bin order to\b/gi, "to"], [/\bsubsequently\b/gi, "later"], [/\bas soon as possible\b/gi, "asap"], [/\bthank you\b/gi, "thanks"], [/\bchildren\b/gi, "kids"], [/\bexcellent\b/gi, "great"], [/\bI would like to\b/gi, "I'd like to"], [/\bplease find attached\b/gi, "here's"], [/\bkindly\b/gi, "please"]];
  var HEDGE = /\b(?:I think|I guess|I believe|maybe|perhaps|probably|possibly|sort of|kind of|a little|a bit|just|somewhat|I feel like|it seems|seems like|might)\s*/gi;
  var FILLER = /\b(?:very|really|actually|basically|literally|quite|simply|honestly|definitely|totally|rather|in fact|of course|just|that is to say|it is worth noting that|needless to say)\s+/gi;
  function fixCase(s) {
    s = s.replace(/\s+([,.!?;:])/g, "$1").replace(/\s{2,}/g, " ").replace(/^\s*[,.;:]\s*/, "").trim();
    s = s.replace(/(^|[.!?]\s+)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    return s.replace(/\bi\b/g, "I");
  }
  function formal(text) {
    var t = String(text).trim(), greet = "";
    var gm = t.match(/^(?:hey|hi|hello|yo|heya|hiya)\b[,!.\s]+/i);
    if (gm && t.length > gm[0].length + 8) { greet = "Hello, "; t = t.slice(gm[0].length); }
    var asked = /^(?:can|could|would|will)\s+(?:you|u)\b/i.test(t);
    CONTR.forEach(function (c) { t = t.replace(new RegExp("\\b" + c[0].replace("'", "['’]") + "\\b", "gi"), function (m) { return m.charAt(0) === m.charAt(0).toUpperCase() ? cap(c[1]) : c[1]; }); });
    SLANG.slice(0, 20).forEach(function (r) { t = t.replace(r[0], r[1]); });
    if (asked) { t = t.replace(/^(?:can|could|would|will) you\b/i, "Could you"); if (!/\bplease\b/i.test(t)) t = t.replace(/^Could you\s+/i, "Could you please "); }
    t = t.replace(/\bsend me\b/gi, "send me").replace(/\bget back to me\b/gi, "respond");
    t = fixCase(t);
    if (!/[.!?]$/.test(t)) t += asked ? "?" : ".";
    else if (asked && /\.$/.test(t)) t = t.replace(/\.$/, "?");
    if (greet) t = greet + t.charAt(0).toLowerCase() + t.slice(1);
    return t;
  }
  function polite(text) {
    var t = formal(text);
    if (!/\bplease\b/i.test(t) && !/\?$/.test(t)) t = t.replace(/^(\w+)/, function (w) { return "Please " + w.toLowerCase(); });
    if (!/thank/i.test(t)) t += " Thank you.";
    return t;
  }
  function casual(text) {
    var t = String(text).trim();
    CASUAL.forEach(function (r) { t = t.replace(r[0], r[1]); });
    CONTR.slice().reverse().forEach(function (c) { t = t.replace(new RegExp("\\b" + c[1] + "\\b", "g"), c[0]); t = t.replace(new RegExp("\\b" + cap(c[1]) + "\\b", "g"), cap(c[0])); });
    t = t.replace(/\bcan not\b|\bcannot\b/gi, "can't");
    return fixCase(t);
  }
  function confident(text) { return fixCase(String(text).replace(HEDGE, "")); }
  function concise(text) { return fixCase(String(text).replace(FILLER, "").replace(/\b(?:in order to)\b/gi, "to").replace(/\bdue to the fact that\b/gi, "because").replace(/\bat this point in time\b/gi, "now").replace(/\bin the event that\b/gi, "if")); }

  /* ------------------------------------------------------------ paraphrase */
  var SYN = { quick: "fast", quickly: "rapidly", fast: "quick", big: "large", large: "big", small: "little", little: "small", happy: "glad", sad: "unhappy", begin: "start", start: "begin", end: "finish", finish: "complete", help: "assist", show: "display", buy: "purchase", house: "home", kid: "child", smart: "clever", clever: "bright", beautiful: "lovely", pretty: "attractive", ugly: "unattractive", old: "aged", new: "fresh", good: "fine", bad: "poor", great: "excellent", important: "significant", difficult: "hard", hard: "difficult", easy: "simple", simple: "easy", angry: "furious", tired: "weary", scared: "frightened", brave: "courageous", strong: "powerful", weak: "feeble", rich: "wealthy", poor: "needy", fun: "enjoyable", funny: "amusing", boring: "dull", lazy: "idle", jumps: "leaps", jump: "leap", jumped: "leaped", walks: "strolls", walk: "stroll", walked: "strolled", runs: "dashes", run: "dash", ran: "dashed", says: "states", said: "stated", asked: "enquired", answered: "replied", looks: "appears", seems: "appears", gets: "obtains", get: "obtain", got: "obtained", makes: "creates", make: "create", made: "created", uses: "employs", use: "employ", used: "employed", wants: "desires", want: "desire", wanted: "desired", needs: "requires", need: "require", needed: "required", think: "believe", thinks: "believes", thought: "believed", tell: "inform", tells: "informs", told: "informed", try: "attempt", tries: "attempts", tried: "attempted", keep: "retain", kept: "retained", give: "provide", gives: "provides", gave: "provided", often: "frequently", always: "constantly", sometimes: "occasionally", usually: "typically", very: "extremely", really: "truly", also: "as well", but: "yet", because: "since", many: "numerous", few: "several", enough: "sufficient", most: "the majority of", maybe: "perhaps", about: "approximately", almost: "nearly", huge: "enormous", tiny: "minute", friend: "companion", child: "youngster", children: "youngsters", people: "individuals", idea: "notion", problem: "issue", answer: "response", question: "query", story: "tale", chance: "opportunity", mistake: "error", trip: "journey", meal: "dish", thing: "item", things: "items", place: "location" };
  function paraphrase(text) {
    var changed = 0, t = String(text).replace(/\b([A-Za-z']+)\b/g, function (w) {
      var k = w.toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(SYN, k) || !SYN[k]) return w;
      /* names and sentence starts keep their form; only content words change, and not every one of them */
      changed++;
      var r = SYN[k];
      return w.charAt(0) === w.charAt(0).toUpperCase() && w.charAt(0) !== w.charAt(0).toLowerCase() ? cap(r) : r;
    });
    return changed ? { text: t, changed: changed } : null;
  }

  /* ------------------------------------------------------------ titles, topics */
  var TOPIC = {
    technology: "computer software internet app data code algorithm network digital online device phone robot artificial intelligence machine learning model server cloud cyber programming website",
    science: "scientist experiment research theory atom molecule cell energy physics chemistry biology species evolution planet space universe gravity laboratory hypothesis",
    health: "health doctor disease patient medicine hospital symptom diet exercise vaccine treatment mental nutrition sleep body illness",
    business: "company market customer sales profit revenue investor startup business manager economy price product brand industry employee",
    finance: "money bank loan interest stock invest budget tax savings debt credit mortgage inflation financial currency",
    politics: "government president election vote law policy parliament minister senate political party democracy congress campaign",
    sports: "game team player match season coach league score win championship tournament athlete football soccer basketball tennis",
    entertainment: "movie film actor music song album concert show series director celebrity band novel theatre",
    travel: "travel trip flight hotel tourist beach city visit holiday destination journey airport passport",
    food: "recipe food cook restaurant dish meal ingredient flavor taste kitchen bake eat chef",
    education: "school student teacher university class course lesson learn exam study education college degree",
    environment: "climate environment pollution carbon warming forest species renewable energy conservation emissions ocean wildlife",
    history: "century war empire king ancient revolution historical medieval colonial dynasty civilization treaty"
  };
  function topics(text) {
    var ts = tokens(text), best = [], k;
    for (k in TOPIC) { var set = TOPIC[k].split(" "), hits = []; ts.forEach(function (w) { if (set.indexOf(w) >= 0 || set.indexOf(stem(w)) >= 0) hits.push(w); }); if (hits.length) best.push({ topic: k, n: hits.length, hits: hits }); }
    return best.sort(function (a, b) { return b.n - a.n; });
  }
  function titleCase(s) {
    return String(s).replace(/\b[a-z][a-z']*/g, function (w, i) { return i > 0 && /^(?:a|an|the|and|or|of|on|in|to|for|with|at|by|vs)$/.test(w) ? w : cap(w); });
  }
  function titlesFor(topic) {
    var t = titleCase(topic.replace(/^(?:the )?/i, ""));
    return ["Understanding " + t, t + ": What You Need to Know", "The Impact of " + t, "Exploring " + t, "Why " + t + " Matters", "A Closer Look at " + t];
  }

  /* ------------------------------------------------------------ counts and reading level */
  function counts(text) {
    var words = (String(text).match(/[A-Za-z0-9'’-]+/g) || []), chars = String(text).length, sent = sentences(text).length;
    var syls = words.reduce(function (n, w) { return n + syl(w); }, 0);
    return { words: words.length, chars: chars, charsNoSpace: String(text).replace(/\s/g, "").length, sentences: sent, lines: String(text).split(/\n/).length, paragraphs: String(text).split(/\n\s*\n/).filter(function (x) { return x.trim(); }).length || 1, syllables: syls, letters: (String(text).match(/[A-Za-z]/g) || []).length, vowels: (String(text).match(/[aeiou]/gi) || []).length };
  }
  function readability(text) {
    var c = counts(text); if (!c.words || !c.sentences) return null;
    var wps = c.words / c.sentences, spw = c.syllables / c.words;
    var ease = 206.835 - 1.015 * wps - 84.6 * spw, grade = 0.39 * wps + 11.8 * spw - 15.59;
    var level = ease >= 90 ? "very easy (about 5th grade)" : ease >= 80 ? "easy (6th grade)" : ease >= 70 ? "fairly easy (7th grade)" : ease >= 60 ? "plain English (8th to 9th grade)" : ease >= 50 ? "fairly difficult (10th to 12th grade)" : ease >= 30 ? "difficult (college level)" : "very difficult (graduate level)";
    return { ease: Math.round(ease * 10) / 10, grade: Math.max(0, Math.round(grade * 10) / 10), level: level, words: c.words, sentences: c.sentences, wps: Math.round(wps * 10) / 10 };
  }

  /* ------------------------------------------------------------ finding the text and the instruction */
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, a: 1, single: 1 };
  function num(s) { return /^\d+$/.test(s) ? +s : NUMW[String(s).toLowerCase()] || 0; }
  var INSTR = /\b(?:summari[sz]e|summary|tl;?dr|sum up|the gist|condense|shorten|keywords?|key (?:terms|words|phrases|points)|main (?:points|ideas|topics)|takeaways|sentiment|positive or negative|tone of|what emotion|how does (?:the )?(?:writer|author|speaker|person) feel|more formal|formal(?:ly)?|more polite|politely|professional|more casual|more informal|casual|informal|friendly|more confident|more concise|concise|paraphrase|reword|rephrase|say (?:this )?differently|another way to say|other words|title|headline|bullet(?:s| points?)?|how many (?:words|characters|letters|sentences|lines|paragraphs|syllables|vowels)|count (?:the )?(?:number of )?(?:words|characters|letters|sentences|lines|paragraphs|syllables|vowels)|word count|character count|reading level|readability|grade level|flesch|what (?:is|’s|'s) (?:this|the text|it|the passage|the article|the paragraph) about|what topic|which category|classify|categori[sz]e|what language|extract|proofread|simplify|in simple (?:words|terms)|explain (?:this|that|it) simply)\b/i;

  function split(text) {
    var t = String(text || "").replace(/\r/g, "").trim(), m;
    if (!INSTR.test(t)) return null;
    /* instruction: text   /  instruction "text"  /  instruction on the first line, text below */
    if ((m = t.match(/^([^'‘\n:]{3,120}?)\s*['‘]([\s\S]{3,}?)['’]\s*[.?!]?\s*$/)) && INSTR.test(m[1])) return { instr: m[1], body: m[2].trim() };
    if ((m = t.match(/^([^:\n]{3,120}?)\s*:\s*([\s\S]{5,})$/)) && INSTR.test(m[1])) return { instr: m[1], body: m[2].replace(/^["“'‘]|["”'’]$/g, "").trim() };
    if ((m = t.match(/^([^"“\n]{3,120}?)\s*["“]([\s\S]{5,}?)["”]\s*[.?!]?\s*$/)) && INSTR.test(m[1])) return { instr: m[1], body: m[2].trim() };
    if ((m = t.match(/^([^\n]{3,120}?)\n+([\s\S]{15,})$/)) && INSTR.test(m[1]) && !INSTR.test(m[2].slice(0, 40))) return { instr: m[1], body: m[2].trim() };
    if ((m = t.match(/^([\s\S]{8,}?[.!?"”])\s+((?:what|how|is|does|can you tell me)[^.?!]*\b(?:sentiment|positive or negative|tone|emotion|reading level|readability|keywords?|about)\b[^.?!]*\??)$/i)) && !INSTR.test(m[1].slice(0, 40)) && !/^(?:what|how|is)\b/i.test(m[1])) return { instr: m[2], body: m[1].trim() };
    /* text first, instruction last */
    if ((m = t.match(/^([\s\S]{40,}?)\n+\s*((?:please\s+)?[A-Za-z][^\n]{3,100})$/)) && INSTR.test(m[2]) && !INSTR.test(m[1].slice(0, 60))) return { instr: m[2], body: m[1].trim() };
    if ((m = t.match(/^([\s\S]{40,}[.!?"”])\s+((?:please\s+)?(?:can you |could you )?(?:summari[sz]e|paraphrase|rephrase|reword|simplify|proofread)[^.?!]{0,60}[.?!]?)$/i)) && !INSTR.test(m[1].slice(0, 60))) return { instr: m[2], body: m[1].trim() };
    return null;
  }
  function topicOf(instr) {
    var m = String(instr).match(/\b(?:about|on|regarding|for|of)\s+(?:an? |the |my |our )?(.{3,80}?)\s*[?.!]*$/i);
    return m ? m[1].replace(/^(?:essay|article|story|post|blog|report|paper|book|poem|speech|presentation|talk|video|song)\s+(?:about|on|of)\s+(?:an? |the )?/i, "").trim() : "";
  }

  /* ------------------------------------------------------------ reading a passage the user supplied */
  var NUMWORDS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion dozen several few both double triple half";
  var NUMRE = "(?:\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:million|billion|thousand|hundred|percent|%))?|(?:" + NUMWORDS.split(" ").join("|") + ")(?:[- ](?:one|two|three|four|five|six|seven|eight|nine|hundred|thousand|million))*)";
  var NOTNAME = /^(?:The|A|An|In|On|At|It|Its|This|That|These|Those|He|She|They|There|His|Her|Their|Some|Many|Most|All|Each|Every|One|Two|Three|When|Where|What|Which|Who|While|However|But|And|Or|If|As|By|For|From|With|After|Before|During|Since|Until|Although|Because|Then|Later|Soon|Today|Yesterday|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|I|We|You|My|Our|Your)$/;
  var NAMERE = /[A-Z][a-z]+(?:[- ][A-Z][a-z]+)*/g;
  function namesIn(text, ignore) {
    var out = [], seen = {}, m, ign = (ignore || "").toLowerCase();
    NAMERE.lastIndex = 0;
    while ((m = NAMERE.exec(text))) {
      var parts = m[0].split(/\s+/); while (parts.length && NOTNAME.test(parts[0])) parts.shift();
      var nm = parts.join(" "); if (!nm || seen[nm.toLowerCase()] || ign.indexOf(nm.toLowerCase()) >= 0) continue;
      seen[nm.toLowerCase()] = 1; out.push(nm);
    }
    return out;
  }
  var WH = /^(?:what|who|whom|whose|which|when|where|why|how|did|does|do|is|are|was|were|can|could|will|would|has|have|had|should)$/;
  function qStems(q) { return tokens(q).filter(function (w) { return w.length > 1 && !STOPSET[w] && !WH.test(w) && !/^(?:text|passage|paragraph|article|story|according|following|based)$/.test(w); }).map(stem); }

  function parsePassage(raw) {
    var t = String(raw || "").replace(/\r/g, "").trim(), m, label = /^\s*(?:read (?:this|the following|the text|the passage|the paragraph|the article)|passage|text|context|article|story|paragraph|document|here is (?:a|the) (?:text|passage|paragraph|story)|given (?:the )?(?:following )?(?:text|passage|paragraph|article|story)|use (?:this|the following) (?:text|passage))\s*[:,.\-]?\s*/i;
    var based = t.match(/^\s*(?:based on|according to|using|from|in|read) (?:the |this )?(?:following |above |given )?(?:text|passage|paragraph|article|story|information|excerpt)\s*[,:]?\s*/i);
    if (based) {
      var rest = t.slice(based[0].length).trim(), qm = rest.match(/^([^?]*\?)\s*([\s\S]{15,})$/);
      if (qm) return { question: qm[1].trim(), passage: qm[2].trim() };
      var qm2 = rest.match(/^([\s\S]{20,}?)\s+((?:what|who|whom|when|where|why|how|which|did|does|is|are|was|were)\b[^?]*\?)\s*$/i);
      if (qm2) return { question: qm2[2].trim(), passage: qm2[1].trim() };
      return null;
    }
    if (!label.test(t)) return null;
    t = t.replace(label, "");
    if ((m = t.match(/^([\s\S]{15,}?)\s*\b(?:question|q|questions)\s*[:\-]\s*([\s\S]+)$/i))) return { passage: m[1].trim(), question: m[2].trim() };
    if ((m = t.match(/^([\s\S]{15,}?[.!"”])\s+((?:what|who|whom|when|where|why|how|which|did|does|is|are|was|were|can|could)\b[^?]*\?)\s*$/i))) return { passage: m[1].trim(), question: m[2].trim() };
    return null;
  }
  function bestSentence(ss, qs, qwords, want) {
    var best = null, i, tot = 0, wt = {};
    qs.forEach(function (w) { wt[w] = (qwords && qwords.names && qwords.names[w]) ? 0.5 : 1; tot += wt[w]; });
    for (i = 0; i < ss.length; i++) {
      var pro = i > 0 && /^(?:he|she|it|they|this|these|that|his|her|its|their|then|later)\b/i.test(ss[i]);
      var st = tokens((pro ? ss[i - 1] + " " : "") + ss[i]).map(stem), hit = 0;
      qs.forEach(function (w) { if (st.indexOf(w) >= 0) hit += wt[w]; });
      var sc = tot ? hit / tot : 0;
      /* on a tie, the sentence that can hold the kind of answer wanted */
      var bonus = want === "number" && /\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(ss[i]) ? 0.001 : (want === "name" && /(?:^|[a-z,]\s)[A-Z][a-z]+/.test(ss[i]) ? 0.001 : 0);
      sc += bonus;
      if (best === null || sc > best.sc + 1e-9) best = { i: i, sc: sc, s: ss[i] };
    }
    best.sc = Math.min(1, best.sc);
    return best;
  }
  function trimClause(x) { return x.replace(/[.!?]+$/, "").trim(); }
  function answerPassage(passage, question) {
    var ss = sentences(passage), q = question.replace(/[?]+$/, "").trim(), ql = q.toLowerCase(), qs = qStems(q);
    if (!ss.length || !qs.length) return null;
    var qnames = {}; (q.match(/(?<=[a-z,]\s)[A-Z][a-z]+/g) || []).concat(q.match(/^(?:Who|What|When|Where|Why|How|Which|Did|Does|Is|Was|Were|Are|Do|Can)\s+(?:did\s+|does\s+|is\s+|was\s+)?([A-Z][a-z]+)/) ? [RegExp.$1] : []).forEach(function (n) { qnames[stem(n.toLowerCase())] = 1; });
    var want = /^how (?:many|much)\b/.test(ql) ? "number" : (/^who\b/.test(ql) ? "name" : "");
    var best = bestSentence(ss, qs, { names: qnames }, want), sent, ctx;
    if (!best || best.sc < 0.34) return "The text doesn't say.";
    sent = best.s; ctx = best.i > 0 && /^(?:he|she|it|they|this|these|that|his|her|its|their)\b/i.test(sent) ? ss[best.i - 1] + " " + sent : sent;
    var m, qnoun, mm;
    /* who */
    if (/^(?:who|whom)\b/.test(ql) || /^(?:which|what) (?:person|man|woman|boy|girl|student|player|team|company)\b/.test(ql)) {
      var by = sent.match(/\bby\s+((?:[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)(?:(?:,\s*|\s+and\s+|,\s+and\s+)[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)*)/);
      if (by && /\b(?:found|found(?:ed)?|wrote|written|built|made|created|invented|painted|discovered|directed|designed|led|won|chosen|elected|developed|composed|signed|sent|taught)\b/i.test(ql + " " + sent)) return by[1] + ".";
      var nm = namesIn(sent, q.replace(/[^A-Za-z ]/g, " ")), subjFirst = sent.match(/^((?:[A-Z][a-z]+)(?:\s[A-Z][a-z]+)*)\b/);
      if (/\b(?:who|whom)\b.*\b(?:met|saw|called|asked|told|invited|helped|visited|married|hired|thanked)\b/.test(ql) && nm.length) return nm.join(", ").replace(/, ([^,]*)$/, " and $1") + ".";
      if (nm.length) return (nm.length > 1 && subjFirst && /^(?:who)\b/.test(ql) ? nm : nm).slice(0, 4).join(", ").replace(/, ([^,]*)$/, " and $1") + ".";
    }
    /* "in total", "altogether": add up what the passage counts */
    if (/^how (?:many|much)\b/.test(ql) && /\b(?:in total|altogether|combined|together|in all|total)\b/.test(ql)) {
      var allNums = (passage.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number);
      var scope = (sent.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number);
      var pick = scope.length >= 2 ? scope : allNums;
      if (pick.length >= 2) { var tot = pick.reduce(function (a2, b2) { return a2 + b2; }, 0); return (Math.round(tot * 1e6) / 1e6) + "."; }
    }
    /* how many / how much */
    if ((m = ql.match(/^how (?:many|much)\s+(?:([a-z]+)\s+)?/))) {
      qnoun = m[1] && !/^(?:did|does|do|is|are|was|were|will|can|could|would)$/.test(m[1]) ? m[1] : "";
      if (qnoun) { mm = sent.match(new RegExp("(" + NUMRE + ")\\s+(?:[a-z]+\\s+){0,2}" + stem(qnoun).slice(0, Math.max(3, stem(qnoun).length - 1)) + "[a-z]*", "i")); if (mm) return cap(mm[0].trim()) + "."; }
      var money = sent.match(/(?:[$£€]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:dollars?|euros?|pounds?|cents?|USD|EUR|GBP|yen|rupees?|pesos?))/i);
      if (money && /\bmuch\b/.test(ql)) return money[0] + ".";
      var nums = sent.match(new RegExp(NUMRE + "(?:\\s+[a-z]+){0,3}", "gi"));
      if (nums && nums.length) return cap(nums[0].trim()) + ".";
    }
    /* when / what year / what date */
    if (/^when\b|^what (?:year|date|day|month|time)\b|^in what (?:year|month)\b/.test(ql)) {
      var date = sent.match(/\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:,?\s+\d{4})?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?|\d{4}s?|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)|(?:last|next|this)\s+(?:week|month|year|summer|winter|spring|autumn|fall)|yesterday|today|tomorrow)\b/);
      if (date) return date[0] + ".";
    }
    /* where */
    if (/^where\b/.test(ql)) {
      var wh = sent.match(/\b(?:in|at|on|near|to|from|inside|outside|across|through|beside|behind)\s+((?:the\s+)?[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*)*|(?:the\s+)[a-z]+(?:\s+[a-z]+)?)/);
      if (wh) return cap(wh[0]) + ".";
    }
    /* why */
    if (/^why\b/.test(ql)) { var bc = sent.match(/\b(?:because|since|so that|due to|in order to|as a result of)\s+(.+)$/i); if (bc) return cap(trimClause(bc[0])) + "."; }
    /* yes / no */
    if (/^(?:is|are|was|were|did|does|do|has|have|had|can|could|will|would|should)\b/.test(ql)) {
      var neg = /\b(?:not|no|never|n't|none|nobody|neither|nor|cannot)\b/i.test(sent);
      if (best.sc < 0.99) return "The text doesn't say that directly. What it says is: " + trimClause(sent) + ".";
      return neg ? "No. " + trimClause(sent) + "." : "Yes. " + trimClause(sent) + ".";
    }
    /* a question that ends on a preposition ("Who did Pete give the wallet to?") wants what follows it in the sentence */
    if ((m = ql.match(/\b(to|from|with|for|about|at|by)$/))) {
      var pm = sent.match(new RegExp("\\b" + m[1] + "\\s+((?:the |a |an |his |her |their )?[A-Za-z]+(?:\\s+[A-Z][a-z]+)*)"));
      if (pm && !(m[1] === "by" && /^who/.test(ql))) return cap(pm[1]) + ".";
    }
    /* what did X <verb>: what follows the verb in the sentence */
    if ((m = ql.match(/^what (?:did|does|do|will|would|can|could)\s+(?:[a-z]+\s+){1,3}?([a-z]+)$/))) {
      var vs = stem(m[1]), words = sent.split(/\s+/), vi = -1, wi;
      for (wi = 0; wi < words.length; wi++) if (stem(words[wi].toLowerCase().replace(/[^a-z]/g, "")) === vs) { vi = wi; break; }
      if (vi >= 0 && vi < words.length - 1) { var rest2 = words.slice(vi + 1).join(" ").replace(/\s+(?:and then|then|while|when|because|but|after|before)\b[\s\S]*$/i, "").replace(/\s+(?:on|in|at|during)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|the (?:morning|evening|afternoon|night)|\d)[\s\S]*$/i, "").replace(/^(?:to|for|at|in|on)\s+(?=the |a |an )/i, ""); rest2 = rest2.replace(/\s+(?:on|in|at|during|after|before|yesterday|today|last|next)\s+[A-Za-z0-9 ]+$/i, function (x) { return /^\s+(?:on|in|at)\s+(?:the |a )/i.test(x) ? x : ""; }); return cap(trimClause(rest2)) + "."; }
    }
    /* what is X / which X: the clause after the matched words, else the sentence */
    var lead = qs.map(function (w) { return w.replace(/[^a-z]/g, ""); }).filter(Boolean);
    if (/^(?:what|which)\b/.test(ql)) {
      var cop = sent.match(/\b(?:is|are|was|were|called|named|means|known as)\s+(?:an? |the )?(.+?)(?:[.;]|$)/i);
      if (cop && /^what (?:is|are|was|were)\b/.test(ql) && cop[1].length < 80) return cap(cop[1]) + ".";
    }
    return "According to the text: " + trimClause(sent) + ".";
  }

  /* ------------------------------------------------------------ pulling things out of a text */
  var EXTRACT = {
    numbers: /(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?![\w])/g,
    dates: /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:,?\s+\d{4})?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
    emails: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    urls: /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/g,
    phones: /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3}[\s-]\d{3,4}(?:[\s-]\d{2,4})?/g,
    hashtags: /#\w+/g,
    mentions: /@\w+/g,
    prices: /[$£€]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|euros|pounds|USD|EUR|GBP)\b/g,
    percentages: /\b\d+(?:\.\d+)?\s?(?:%|percent)/g,
    years: /\b(?:1[0-9]{3}|20[0-9]{2})\b/g
  };
  function extractList(kind, body) {
    var k = String(kind).toLowerCase().replace(/e-mail addresses|email addresses?/, "emails").replace(/links|urls?/, "urls").replace(/phone numbers?/, "phones").replace(/numbers?|digits?/, "numbers").replace(/\bdates?\b/, "dates").replace(/hashtags?/, "hashtags").replace(/mentions?/, "mentions").replace(/prices?|amounts?/, "prices").replace(/percentages?/, "percentages").replace(/\byears?\b/, "years");
    if (/^(?:names?|people|persons?|capitali[sz]ed words?|proper nouns?)$/.test(String(kind).toLowerCase())) { var ns = namesIn(body, ""); return { label: /capital|proper/.test(String(kind)) ? "capitalised words" : "names", items: ns }; }
    if (!EXTRACT[k]) return null;
    var found = String(body).match(EXTRACT[k]) || [];
    if (k === "numbers") found = found.filter(function (x) { return !(String(body).match(EXTRACT.dates) || []).some(function (d) { return d.indexOf(x) >= 0; }) || true; });
    return { label: k, items: found.map(function (x) { return x.trim().replace(/[.,;:]+$/, ""); }) };
  }

  function res(a, schema) { return a ? { answer: a, schema: schema, confidence: 0.84 } : null; }
  function bullets(list) { return list.map(function (x) { return "- " + x; }).join("\n"); }

  function solve(text) {
    var raw = String(text || "").trim();
    if (!raw || raw.length > 20000) return null;
    var low = raw.toLowerCase();
    /* a title or headline for a subject given in the request itself */
    var m = low.match(/^(?:please\s+)?(?:can you |could you )?(?:give|write|suggest|make|create|come up with|think of|generate)\s+(?:me\s+)?(?:a |an |some |three |3 |a few )?(?:good |catchy |great |creative |nice )?(?:title|titles|headline|headlines|heading)s?\s+(?:for|of)\s+(.+?)[?.!]*$/);
    if (m && !/:\s*\S/.test(raw)) {
      var tp = topicOf("for " + m[1]) || m[1];
      tp = tp.replace(/^(?:an?|the)\s+(?:essay|article|story|post|blog post|report|paper|book|poem|speech|presentation|talk|video|song|chapter|film|movie|podcast)\s+(?:about|on|of)\s+/i, "").replace(/^(?:an?|the)\s+/i, "");
      if (tp.split(/\s+/).length <= 8) return res("Some title ideas:\n" + bullets(titlesFor(tp).slice(0, 4)), "textwork:title");
    }
    /* a passage and a question about it */
    var pq = parsePassage(raw);
    if (pq && pq.passage && pq.question) { var pa = answerPassage(pq.passage, pq.question); if (pa) return res(pa, "textwork:passage"); }
    /* things to pull out of a text */
    if ((m = raw.match(/^\s*(?:please\s+)?(?:can you |could you )?(?:extract|find|list|get|pull out|show me|give me|what are|name)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(numbers?|digits?|dates?|e-?mail addresses|emails?|urls?|links|phone numbers?|names?|people|persons?|capitali[sz]ed words|proper nouns|hashtags?|mentions?|prices?|amounts?|percentages?|years?)\s+(?:in|from|out of|within|of)\s*(?:this|the following|the text)?\s*[:,]?\s*(?:text\s*)?[:,]?\s*["“']?([\s\S]{3,}?)["”']?\s*[.?!]*$/i))) {
      var ex = extractList(m[1], m[2]);
      if (ex) return res(ex.items.length ? ex.label.charAt(0).toUpperCase() + ex.label.slice(1) + ": " + ex.items.join(", ") + "." : "I didn't find any " + ex.label + " in that text.", "textwork:extract");
    }
    var sp = split(raw);
    if (!sp) return null;
    var ins = sp.instr.toLowerCase(), body = sp.body;
    if (body.length < 3) return null;
    var k;
    /* counts */
    if ((m = ins.match(/\b(?:how many|count (?:the )?(?:number of )?)\s*(words|characters|letters|sentences|lines|paragraphs|syllables|vowels)\b/)) || /\b(word|character) count\b/.test(ins)) {
      var c = counts(body), what = m ? m[1] : (/character/.test(ins) ? "characters" : "words");
      var n = what === "characters" ? c.chars : (what === "letters" ? c.letters : c[what]);
      var extra = what === "characters" ? " (" + c.charsNoSpace + " without spaces)" : "";
      return res("There are " + n + " " + (n === 1 ? what.replace(/s$/, "") : what) + extra + ".", "textwork:count");
    }
    if (/\b(?:reading level|readability|grade level|flesch)\b/.test(ins)) {
      var rd = readability(body); if (!rd) return null;
      return res("Flesch reading ease " + rd.ease + ": " + rd.level + ". " + (rd.grade < 1 ? "Below first-grade level" : "Grade level about " + rd.grade) + ", from " + rd.words + " words in " + rd.sentences + " sentence" + (rd.sentences === 1 ? "" : "s") + " (" + rd.wps + " words per sentence).", "textwork:readability");
    }
    if (/\bsentiment\b|\bpositive or negative\b|\btone of\b|\bwhat emotion\b|\bhow does (?:the )?(?:writer|author|speaker|person) feel\b|\bis (?:this|that|the) (?:review|comment|text|sentence|message|feedback|statement)?\s*(?:positive|negative|good|bad)\b/.test(ins) || /\bis (?:this|it) (?:positive|negative)\b/.test(ins)) {
      var se = sentiment(body), why = se.pos.length || se.neg.length ? " Clues: " + se.pos.concat(se.neg).slice(0, 6).join(", ") + "." : "";
      var emo = /\bemotion|\bfeel\b/.test(ins) && se.emotion ? " The strongest emotion is " + se.emotion + "." : "";
      var lead = se.label === "mixed" ? "The sentiment is mixed" : (se.label === "neutral" ? "The sentiment is neutral" : "The sentiment is " + se.label);
      return res(lead + " (score " + (se.score > 0 ? "+" : "") + se.score + ")." + why + emo, "textwork:sentiment");
    }
    if (/\bkeywords?\b|\bkey (?:terms|words|phrases)\b|\bmain topics\b|\bextract\b/.test(ins) && !/\bsummar/.test(ins)) {
      var kn = (m = ins.match(/\b(\d+|one|two|three|four|five|six|seven|eight|ten)\s+(?:key)?words?\b|\btop\s+(\d+)\b/)) ? num(m[1] || m[2]) : 5;
      var kw = keywords(body, kn || 5); if (!kw.length) return null;
      return res("Keywords: " + kw.join(", ") + ".", "textwork:keywords");
    }
    if (/\bwhat (?:is|’s|'s) (?:this|the text|it|the passage|the article|the paragraph) about\b|\bwhat topic\b|\bwhich category\b|\bclassify\b|\bcategori[sz]e\b/.test(ins)) {
      var tp2 = topics(body);
      if (tp2.length) return res("It is mostly about " + tp2[0].topic + " (" + tp2[0].hits.slice(0, 4).filter(function (w, i, a) { return a.indexOf(w) === i; }).join(", ") + ")" + (tp2[1] ? ", with some " + tp2[1].topic : "") + ".", "textwork:topic");
      var kw2 = keywords(body, 3); return kw2.length ? res("It seems to be about " + kw2.join(", ") + ".", "textwork:topic") : null;
    }
    if (/\bwhat language\b/.test(ins)) {
      var P = root.C4LMPolyglot, lg = P && P.detect ? P.detect(body) : null, names = { es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese" };
      return res(lg ? "That looks like " + names[lg] + "." : "That looks like English.", "textwork:language");
    }
    if (/\bformal(?:ly)?\b|\bprofessional(?:ly)?\b|\bmore polite\b|\bpolitely\b|\bbusiness\b/.test(ins) && /\b(?:make|rewrite|rephrase|reword|turn|convert|change|say|put|write|can you|could you)\b/.test(ins) && !/\binformal\b/.test(ins)) return res(/polite/.test(ins) ? polite(body) : formal(body), "textwork:formal");
    if (/\bcasual(?:ly)?\b|\binformal\b|\bfriendly\b|\bmore relaxed\b|\bconversational\b/.test(ins)) return res(casual(body), "textwork:casual");
    if (/\bconfident\b/.test(ins)) return res(confident(body), "textwork:confident");
    if (/\bconcise\b|\bsimplify\b|\bin simple (?:words|terms)\b|\bexplain (?:this|that|it) simply\b|\bshorten\b/.test(ins) && !/\bsummar/.test(ins)) {
      var cz = concise(body);
      if (cz.length < body.length * 0.95 || !/\bshorten\b/.test(ins)) { if (cz === body && /simpl/.test(ins)) return res(casual(body), "textwork:simplify"); return res(cz, "textwork:concise"); }
    }
    if (/\bparaphrase\b|\breword\b|\brephrase\b|\bsay (?:this )?differently\b|\banother way to say\b|\bother words\b/.test(ins)) {
      var pp = paraphrase(body);
      return res(pp ? pp.text : "I couldn't find safe alternatives for the words in that sentence. Try giving me a longer passage.", "textwork:paraphrase");
    }
    if (/\btitle\b|\bheadline\b/.test(ins)) {
      var kt = keywords(body, 2); if (!kt.length) return null;
      var first = sentences(body)[0], head = first.length <= 70 ? first.replace(/[.!?]+$/, "") : "";
      var tt = titlesFor(kt.join(" and ")).slice(0, 3);
      return res("Title ideas:\n" + bullets((head ? [titleCase(head)] : []).concat(tt)), "textwork:title");
    }
    if (/\bbullet(?:s| points?)?\b|\bkey points\b|\bmain (?:points|ideas)\b|\btakeaways\b/.test(ins) && !/\bsummar/.test(ins)) {
      var ks = sentences(body); var kk = /\bkey points\b|\bmain (?:points|ideas)\b|\btakeaways\b/.test(ins) ? summarize(body, Math.min(4, Math.max(2, Math.ceil(ks.length / 2)))) : ks;
      return res(bullets(kk.map(function (x) { return x.replace(/[.]+$/, ""); })), "textwork:bullets");
    }
    if (/\bsummari[sz]e\b|\bsummary\b|\btl;?dr\b|\bsum up\b|\bthe gist\b|\bcondense\b|\bshorten\b/.test(ins)) {
      var ss = sentences(body), want = 0, unit = "";
      if ((m = ins.match(/\b(?:in|into|as|to|using|with)\s+(\d+|one|two|three|four|five|a|a single)\s+(sentences?|bullet(?:s| points?)?|points?|words?|lines?)\b/))) { want = num(m[1]); unit = m[2]; }
      if (/\b(?:one|1|a single) sentence\b|\bone[- ]line\b|\bone liner\b|\bin a nutshell\b/.test(ins)) { want = 1; unit = "sentence"; }
      if (unit && /^word/.test(unit)) {
        var best = summarize(body, 1)[0] || ss[0], ws = best.split(/\s+/);
        return res(ws.length > want ? ws.slice(0, want).join(" ").replace(/[,;:]$/, "") + "…" : best, "textwork:summary");
      }
      var kcount = want || (ss.length <= 2 ? 1 : (ss.length <= 5 ? 2 : (ss.length <= 10 ? 3 : 4)));
      if (ss.length <= 1) return res(ss[0] ? ss[0] + " (That is already a single sentence.)" : null, "textwork:summary");
      var sm = summarize(body, kcount);
      if (/^(?:bullet|point)/.test(unit) || /\bbullet/.test(ins)) return res(bullets(sm.map(function (x) { return x.replace(/[.]+$/, ""); })), "textwork:summary");
      return res(sm.join(" "), "textwork:summary");
    }
    return null;
  }

  /* does this message ask for work on a text it supplies? Cheap enough to ask before the memory reads it as facts about the user. */
  function matches(text) {
    var t = String(text || ""); if (t.length < 20 || t.length > 20000) return false;
    try { return !!(parsePassage(t) || split(t) || /^\s*(?:please\s+)?(?:can you |could you )?(?:extract|find|list|get|pull out|show me|give me|what are|name)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:numbers?|digits?|dates?|e-?mail addresses|emails?|urls?|links|phone numbers?|names?|people|prices?|percentages?|years?|hashtags?)\s+(?:in|from|out of)\b/i.test(t)); } catch (e) { return false; }
  }
  root.C4LMTextwork = { matches: matches, solve: solve, summarize: summarize, keywords: keywords, sentiment: sentiment, formal: formal, casual: casual, paraphrase: paraphrase, readability: readability, counts: counts, split: split };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMTextwork;
})(typeof window !== "undefined" ? window : globalThis);
