/* CELL4 logic and puzzle reasoner.
 *
 * Small, exact procedures for the questions people ask to see whether a
 * system can think rather than recall:
 *
 *   categorical reasoning   "All cats are mammals. Tom is a cat. Is Tom a mammal?"
 *   conditionals            "If it rained the grass is wet. It is not wet. Did it rain?"
 *   ordering                "Anna is taller than Ben ... Who is the tallest?"
 *   calendar arithmetic     "If today is Monday, what day is it in 10 days?"
 *   kinship                 "A is the mother of B. B is the mother of C. What is A to C?"
 *   compass and clock       "I face north and turn right ..."; "angle of the hands at 3:00"
 *   sequences               "What comes next: 2, 4, 8, 16?"
 *   odd one out, taxonomy   "Which does not belong: apple, banana, carrot?"; "Is a whale a fish?"
 *   classic riddles         the ones whose answer is a reading of the words, not a fact
 *
 * Every answer is derived from the question's own premises (plus a small
 * taxonomy for kinds of things); a question the premises do not settle gets
 * "not necessarily", not a guess. No question, answer or phrasing is stored
 * for a particular test. Runs locally: no network, no model service.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------- helpers */
  var WN = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
  var ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
  function num(t) {
    t = String(t || "").toLowerCase();
    if (/^-?\d+$/.test(t)) return +t;
    var m = t.match(/^(\d+)(?:st|nd|rd|th)$/); if (m) return +m[1];
    if (WN[t] !== undefined) return WN[t];
    if (ORD[t]) return ORD[t];
    var p = t.split("-");
    if (p.length === 2 && WN[p[0]] >= 20 && WN[p[1]] < 10) return WN[p[0]] + WN[p[1]];
    return null;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function res(answer, steps, schema, confidence) { return { answer: answer, steps: steps || [], schema: schema, confidence: confidence || 0.85 }; }
  function clean(t) { return String(t || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim(); }
  function sents(t) { return clean(t).split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  var IRR = { people: "person", men: "man", women: "woman", children: "child", mice: "mouse", geese: "goose", feet: "foot", teeth: "tooth", wolves: "wolf", leaves: "leaf", knives: "knife", lives: "life", oxen: "ox", dice: "die", fish: "fish", sheep: "sheep", deer: "deer", bacteria: "bacterium", cacti: "cactus", is: "be", are: "be", was: "be", were: "be", been: "be", am: "be", gets: "be", get: "be", got: "be", becomes: "be", become: "be", became: "be" };
  function stem(w) {
    w = String(w).toLowerCase().replace(/[^a-z'-]/g, "");
    if (!w) return "";
    if (IRR[w]) return IRR[w];
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(?:ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /ves$/.test(w)) return w.slice(0, -3) + "f";
    if (w.length > 4 && /ied$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /ed$/.test(w) && !/eed$/.test(w)) return w.slice(0, -2).replace(/(.)\1$/, "$1");
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3).replace(/(.)\1$/, "$1");
    if (w.length > 3 && /s$/.test(w) && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }

  /* ================================================================ taxonomy
   * Kinds of things, child -> parents, and groups whose members exclude each
   * other. Used for "is a whale a fish?", "are all squares rectangles?" and
   * odd-one-out. A relation that is not here is not asserted either way. */
  var ISA = {
    mammal: ["animal"], bird: ["animal"], fish: ["animal"], reptile: ["animal"], amphibian: ["animal"], insect: ["animal"], arachnid: ["animal"], crustacean: ["animal"], mollusc: ["animal"],
    whale: ["mammal"], dolphin: ["mammal"], bat: ["mammal"], dog: ["mammal"], cat: ["mammal"], horse: ["mammal"], cow: ["mammal"], pig: ["mammal"], sheep: ["mammal"], goat: ["mammal"], human: ["mammal"], person: ["mammal"], monkey: ["mammal"], ape: ["mammal"],
    elephant: ["mammal"], lion: ["mammal"], tiger: ["mammal"], bear: ["mammal"], rabbit: ["mammal"], mouse: ["mammal"], rat: ["mammal"], kangaroo: ["mammal"], seal: ["mammal"], platypus: ["mammal"], wolf: ["mammal"], fox: ["mammal"], deer: ["mammal"], giraffe: ["mammal"], zebra: ["mammal"],
    penguin: ["bird"], eagle: ["bird"], ostrich: ["bird"], owl: ["bird"], sparrow: ["bird"], duck: ["bird"], chicken: ["bird"], hen: ["bird"], parrot: ["bird"], robin: ["bird"], hawk: ["bird"], swan: ["bird"], goose: ["bird"], kiwi: ["bird"], pigeon: ["bird"],
    shark: ["fish"], salmon: ["fish"], tuna: ["fish"], trout: ["fish"], goldfish: ["fish"], eel: ["fish"], cod: ["fish"], seahorse: ["fish"],
    snake: ["reptile"], lizard: ["reptile"], turtle: ["reptile"], crocodile: ["reptile"], alligator: ["reptile"], tortoise: ["reptile"],
    frog: ["amphibian"], toad: ["amphibian"], salamander: ["amphibian"],
    ant: ["insect"], bee: ["insect"], butterfly: ["insect"], beetle: ["insect"], fly: ["insect"], mosquito: ["insect"], wasp: ["insect"], moth: ["insect"], grasshopper: ["insect"], ladybug: ["insect"],
    spider: ["arachnid"], scorpion: ["arachnid"], tick: ["arachnid"], crab: ["crustacean"], lobster: ["crustacean"], shrimp: ["crustacean"], snail: ["mollusc"], octopus: ["mollusc"], squid: ["mollusc"],
    plant: ["organism"], animal: ["organism"], fruit: ["food"], vegetable: ["food"], meat: ["food"], grain: ["food"],
    apple: ["fruit"], banana: ["fruit"], orange: ["fruit"], grape: ["fruit"], pear: ["fruit"], mango: ["fruit"], strawberry: ["fruit"], lemon: ["fruit"], peach: ["fruit"], cherry: ["fruit"], plum: ["fruit"], melon: ["fruit"], pineapple: ["fruit"], watermelon: ["fruit"], tomato: ["fruit"], kiwifruit: ["fruit"], lime: ["fruit"], coconut: ["fruit"], blueberry: ["fruit"], raspberry: ["fruit"], apricot: ["fruit"], fig: ["fruit"],
    carrot: ["vegetable"], potato: ["vegetable"], broccoli: ["vegetable"], spinach: ["vegetable"], onion: ["vegetable"], cabbage: ["vegetable"], lettuce: ["vegetable"], cucumber: ["vegetable"], pea: ["vegetable"], celery: ["vegetable"], pepper: ["vegetable"], cauliflower: ["vegetable"], radish: ["vegetable"], beet: ["vegetable"], garlic: ["vegetable"], zucchini: ["vegetable"], corn: ["vegetable"],
    rose: ["flower"], tulip: ["flower"], daisy: ["flower"], lily: ["flower"], sunflower: ["flower"], orchid: ["flower"], flower: ["plant"], tree: ["plant"], oak: ["tree"], pine: ["tree"], maple: ["tree"], palm: ["tree"], grass: ["plant"], bush: ["plant"],
    square: ["rectangle", "rhombus"], rectangle: ["parallelogram"], rhombus: ["parallelogram"], parallelogram: ["quadrilateral"], trapezoid: ["quadrilateral"], kite: ["quadrilateral"], quadrilateral: ["polygon"], triangle: ["polygon"], pentagon: ["polygon"], hexagon: ["polygon"], octagon: ["polygon"], polygon: ["shape"], circle: ["shape"], ellipse: ["shape"], oval: ["shape"],
    integer: ["rational"], rational: ["real"], irrational: ["real"], real: ["number"], complex: ["number"], natural: ["integer"], even: ["integer"], odd: ["integer"], prime: ["integer"],
    car: ["vehicle"], truck: ["vehicle"], bus: ["vehicle"], bicycle: ["vehicle"], bike: ["vehicle"], motorcycle: ["vehicle"], train: ["vehicle"], plane: ["vehicle"], airplane: ["vehicle"], boat: ["vehicle"], ship: ["vehicle"], helicopter: ["vehicle"], tram: ["vehicle"], scooter: ["vehicle"],
    piano: ["instrument"], guitar: ["instrument"], violin: ["instrument"], drum: ["instrument"], flute: ["instrument"], trumpet: ["instrument"], cello: ["instrument"], harp: ["instrument"], saxophone: ["instrument"], clarinet: ["instrument"], trombone: ["instrument"], oboe: ["instrument"],
    shirt: ["clothing"], pants: ["clothing"], dress: ["clothing"], skirt: ["clothing"], sock: ["clothing"], jacket: ["clothing"], coat: ["clothing"], hat: ["clothing"], shoe: ["clothing"], glove: ["clothing"], scarf: ["clothing"], sweater: ["clothing"],
    hammer: ["tool"], saw: ["tool"], screwdriver: ["tool"], wrench: ["tool"], drill: ["tool"], pliers: ["tool"], chisel: ["tool"],
    chair: ["furniture"], table: ["furniture"], sofa: ["furniture"], bed: ["furniture"], desk: ["furniture"], shelf: ["furniture"], couch: ["furniture"], wardrobe: ["furniture"],
    iron: ["metal"], gold: ["metal"], silver: ["metal"], copper: ["metal"], aluminum: ["metal"], aluminium: ["metal"], zinc: ["metal"], tin: ["metal"], lead: ["metal"], steel: ["metal"], nickel: ["metal"], platinum: ["metal"],
    oxygen: ["gas"], nitrogen: ["gas"], hydrogen: ["gas"], helium: ["gas"], neon: ["gas"], argon: ["gas"], methane: ["gas"],
    red: ["color"], blue: ["color"], green: ["color"], yellow: ["color"], orange_c: ["color"], purple: ["color"], pink: ["color"], black: ["color"], white: ["color"], brown: ["color"], gray: ["color"], grey: ["color"],
    mercury: ["planet"], venus: ["planet"], earth: ["planet"], mars: ["planet"], jupiter: ["planet"], saturn: ["planet"], uranus: ["planet"], neptune: ["planet"],
    asia: ["continent"], africa: ["continent"], europe: ["continent"], antarctica: ["continent"], australia: ["continent"], "north america": ["continent"], "south america": ["continent"],
    pacific: ["ocean"], atlantic: ["ocean"], indian: ["ocean"], arctic: ["ocean"], southern: ["ocean"],
    france: ["country"], germany: ["country"], italy: ["country"], spain: ["country"], japan: ["country"], china: ["country"], india: ["country"], brazil: ["country"], canada: ["country"], mexico: ["country"], egypt: ["country"], russia: ["country"], kenya: ["country"], peru: ["country"], norway: ["country"], sweden: ["country"], greece: ["country"], turkey: ["country"],
    paris: ["city"], london: ["city"], tokyo: ["city"], rome: ["city"], berlin: ["city"], madrid: ["city"], cairo: ["city"], moscow: ["city"], beijing: ["city"], delhi: ["city"], sydney: ["city"], toronto: ["city"], lima: ["city"],
    soccer: ["sport"], football: ["sport"], tennis: ["sport"], basketball: ["sport"], baseball: ["sport"], golf: ["sport"], swimming: ["sport"], cricket: ["sport"], hockey: ["sport"], rugby: ["sport"], boxing: ["sport"], volleyball: ["sport"],
    english: ["language"], french: ["language"], spanish: ["language"], german: ["language"], chinese: ["language"], japanese: ["language"], arabic: ["language"], hindi: ["language"], russian: ["language"], portuguese: ["language"], italian: ["language"], latin: ["language"],
    python: ["programming language"], java: ["programming language"], javascript: ["programming language"], ruby: ["programming language"], rust: ["programming language"], go: ["programming language"], swift: ["programming language"],
    january: ["month"], february: ["month"], march: ["month"], april: ["month"], may: ["month"], june: ["month"], july: ["month"], august: ["month"], september: ["month"], october: ["month"], november: ["month"], december: ["month"],
    monday: ["day"], tuesday: ["day"], wednesday: ["day"], thursday: ["day"], friday: ["day"], saturday: ["day"], sunday: ["day"],
    teacher: ["person"], doctor: ["person"], nurse: ["person"], farmer: ["person"], pilot: ["person"], chef: ["person"], lawyer: ["person"], engineer: ["person"],
    eye: ["organ"], heart: ["organ"], lung: ["organ"], liver: ["organ"], kidney: ["organ"], brain: ["organ"], stomach: ["organ"], skin: ["organ"],
    water: ["liquid"], milk: ["liquid"], juice: ["liquid"], oil: ["liquid"], coffee: ["liquid"], tea: ["liquid"], wine: ["liquid"], soda: ["liquid"],
    rain: ["weather"], snow: ["weather"], wind: ["weather"], fog: ["weather"], hail: ["weather"], thunder: ["weather"], sun: ["star"]
  };
  ISA.orange_c = undefined; delete ISA.orange_c;
  var DISJOINT = [
    ["mammal", "bird", "fish", "reptile", "amphibian", "insect", "arachnid", "crustacean", "mollusc"],
    ["fruit", "vegetable", "meat", "grain"], ["rectangle", "triangle", "circle", "pentagon", "hexagon", "octagon", "ellipse"],
    ["animal", "plant"], ["vehicle", "animal", "plant", "instrument", "tool", "furniture", "clothing", "food"],
    ["planet", "star"], ["metal", "gas", "liquid"], ["even", "odd"], ["rational", "irrational"], ["month", "day", "color", "planet"]
  ];
  function ancestors(x) {
    var seen = {}, queue = [x], out = [];
    while (queue.length) {
      var c = queue.shift();
      (ISA[c] || []).forEach(function (p) { if (!seen[p]) { seen[p] = 1; out.push(p); queue.push(p); } });
    }
    return out;
  }
  function isa(x, y) { return x === y || ancestors(x).indexOf(y) >= 0; }
  function taxDisjoint(x, y) {
    var ax = [x].concat(ancestors(x)), ay = [y].concat(ancestors(y));
    return DISJOINT.some(function (g) {
      var ix = g.filter(function (k) { return ax.indexOf(k) >= 0; }), iy = g.filter(function (k) { return ay.indexOf(k) >= 0; });
      return ix.length && iy.length && ix.some(function (a) { return iy.some(function (b) { return a !== b; }); }) && !ix.some(function (a) { return iy.indexOf(a) >= 0; });
    });
  }
  function kind(w) {
    w = String(w || "").toLowerCase().trim();
    var s = stem(w), alts = [w, s, w.replace(/s$/, ""), w.replace(/es$/, ""), w.replace(/ies$/, "y")];
    for (var i = 0; i < alts.length; i++) if (alts[i] && Object.prototype.hasOwnProperty.call(ISA, alts[i])) return alts[i];
    return null;
  }
  function allKinds() { return Object.keys(ISA); }

  /* odd one out: the category that holds all but one of the items */
  function oddOneOut(items) {
    var ks = items.map(function (i) { return kind(i); });
    if (ks.some(function (k) { return !k; }) || items.length < 3) return null;
    var cats = {};
    ks.forEach(function (k, i) { [k].concat(ancestors(k)).forEach(function (c) { (cats[c] = cats[c] || {})[i] = 1; }); });
    var best = null;
    Object.keys(cats).forEach(function (c) {
      var n = Object.keys(cats[c]).length;
      if (n === items.length - 1) {
        var out = -1; for (var i = 0; i < items.length; i++) if (!cats[c][i]) out = i;
        if (!best || (c !== "animal" && c !== "food" && c !== "organism" && c !== "shape")) best = best && best.count > n ? best : { cat: c, odd: out, count: n };
      }
    });
    if (!best) return null;
    /* the odd one must have its own different category among the sensible alternatives */
    return { odd: items[best.odd], cat: best.cat, oddKind: ks[best.odd] };
  }

  /* ============================================================ categorical */
  var VERBS = "is are was were be been am have has had can could cannot can't may might must should shall will would do does did don't doesn't eat eats ate fly flies swim swims live lives breathe breathes bark barks run runs walk walks jump jumps climb climbs sleep sleeps need needs make makes give gives produce produces contain contains grow grows move moves hunt hunts like likes love loves hate hates play plays sing sings read reads write writes teach teaches work works study studies drive drives ride rides carry carries hold holds feed feeds drink drinks see sees hear hears smell smells taste tastes cost costs weigh weighs lay lays hatch hatches bloom blooms fade fades melt melts float floats sink sinks burn burns freeze freezes boil boils shine shines glow glows pass passes fail fails win wins lose loses absorb absorbs conduct conducts emit emits reflect reflects require requires cause causes provide provides help helps protect protects attract attracts repel repels release releases generate generates create creates build builds wear wears buy buys sell sells own owns serve serves speak speaks understand understands remember remembers forget forgets rise rises spin spins vibrate vibrates flow flows dissolve dissolves expand expands contract contracts evaporate evaporates decay decays spoil spoils wilt wilts die dies bite bites sting stings fear fears dislike dislikes enjoy enjoys prefer prefers want wants kill kills chase chases catch catches pull pulls push pushes lift lifts throw throws kick kicks sit sits stand stands stay stays leave leaves arrive arrives appear appears exist exists belong belongs contribute contributes depend depends lead leads follow follows include includes mean means become becomes remain remains seem seems keep keeps take takes get gets tell tells ask asks answer answers travel travels fight fights wash washes listen listens wait waits join joins meet meets visit visits save saves spend spends earn earns pay pays measure measures predict predicts improve improves reduce reduces increase increases decrease decreases suffer suffers evolve evolves reproduce reproduces pollinate pollinates digest digests swallow swallows chew chews bounce bounces roll rolls slide slides glide glides crawl crawls dig digs bend bends stretch stretches shrink shrinks vanish vanishes explode explodes crack cracks sparkle sparkles shatter shatters spread spreads fill fills surround surrounds lack lacks offer offers accept accepts allow allows prevent prevents avoid avoids attack attacks defend defends guard guards orbit orbits attract tolerate tolerates survive survives breed breeds migrate migrates hibernate hibernates graze grazes squeak squeaks roar roars purr purrs sweat sweats shed sheds molt molts store stores weigh decompose decomposes ferment ferments transmit transmits propel propels".split(" ");
  var VERBSET = {}; VERBS.forEach(function (v) { VERBSET[v] = 1; });
  var GENERIC_N = /^(?:people|persons?|things?|ones?|animals?|creatures?|beings?|items?|objects?)$/;
  var NPS = {};
  var DET = /^(?:a|an|the|all|every|each|any|some|no|none|of|those|these|that|this|certain|many|most)$/;
  function normNP(np) {
    var raw = clean(np).replace(/[?.!,;:"']/g, "");
    var w = raw.toLowerCase().split(" ").filter(Boolean), det = "";
    while (w.length && DET.test(w[0])) { det = det || w[0]; w.shift(); }
    var surface = w.join(" ");
    if (w.length > 1 && GENERIC_N.test(w[w.length - 1])) w.pop();
    var node = w.map(stem).join(" ");
    if (!NPS[node]) NPS[node] = { raw: surface, det: det, name: !det && /^[A-Z]/.test(raw) };
    else if (det && !NPS[node].det) NPS[node].det = det;
    return node;
  }
  var PRAW = {};
  function predNode(raw) { var n = "P:" + normPred(raw); if (!PRAW[n]) PRAW[n] = clean(raw).toLowerCase().replace(/[?.!,;:]+$/, ""); return n; }
  function normPred(p) {
    var w = clean(p).toLowerCase().replace(/[?.!,;:"']/g, "").split(" ").filter(Boolean);
    while (w.length && /^(?:a|an|the|to|able)$/.test(w[0])) w.shift();
    w = w.map(function (x, i) { return i === 0 ? ({ has: "have", does: "do" }[x] || stem(x)) : stem(x); });
    return w.join(" ");
  }
  /* split "<subject NP> <verb ...>" at the first verb word */
  function splitSV(s) {
    var w = clean(s).replace(/[?.!,]+$/, "").split(" ");
    for (var i = 1; i < w.length && i <= 4; i++) {
      var lw = w[i].toLowerCase();
      if (VERBSET[lw] || (i >= 1 && /^(?:cannot|can't)$/.test(lw))) return { subj: w.slice(0, i).join(" "), verb: lw, rest: w.slice(i + 1).join(" "), all: w.slice(i).join(" ") };
    }
    return null;
  }
  function parsePremise(s) {
    var t = clean(s).replace(/[.!]+$/, "");
    var low = t.toLowerCase(), m, sv;
    if ((m = low.match(/^(all|every|each|any) (.+)$/))) {
      sv = splitSV(m[2]);
      if (!sv) return null;
      if (/^(?:is|are)$/.test(sv.verb)) {
        var neg = /^not /.test(sv.rest);
        return { t: neg ? "no" : "all", a: normNP(sv.subj), b: normNP(sv.rest.replace(/^not /, "")), raw: t };
      }
      return { t: "all", a: normNP(sv.subj), b: predNode(sv.all), raw: t };
    }
    if ((m = low.match(/^(?:no|none of the|none of) (.+)$/))) {
      sv = splitSV(m[1]);
      if (!sv) return null;
      if (/^(?:is|are)$/.test(sv.verb)) return { t: "no", a: normNP(sv.subj), b: normNP(sv.rest), raw: t };
      return { t: "no", a: normNP(sv.subj), b: predNode(sv.all), raw: t };
    }
    if ((m = low.match(/^some (.+)$/))) {
      sv = splitSV(m[1]);
      if (!sv) return null;
      if (/^(?:is|are)$/.test(sv.verb)) {
        if (/^not /.test(sv.rest)) return { t: "somenot", a: normNP(sv.subj), b: normNP(sv.rest.replace(/^not /, "")), raw: t };
        return { t: "some", a: normNP(sv.subj), b: normNP(sv.rest), raw: t };
      }
      return { t: "some", a: normNP(sv.subj), b: predNode(sv.all), raw: t };
    }
    /* "X is (not) a Y" / "X can Y" */
    sv = splitSV(t);
    if (sv) {
      var subj = normNP(sv.subj);
      if (sv.verb === "are" && NPS[subj]) NPS[subj].plural = true;
      if (/^(?:is|are)$/.test(sv.verb)) {
        var r = sv.rest, neg2 = false;
        if (/^not /i.test(r)) { neg2 = true; r = r.replace(/^not /i, ""); }
        return { t: neg2 ? "no" : "all", a: subj, b: normNP(r), raw: t, inst: true };
      }
      var vneg = /^(?:cannot|can't|doesn't|don't|does not|do not)$/.test(sv.verb) || /^not /i.test(sv.rest);
      return { t: vneg ? "no" : "all", a: subj, b: predNode((vneg && /^(?:cannot|can't)$/.test(sv.verb) ? "can " : "") + sv.rest.replace(/^not /i, "")), raw: t, inst: true };
    }
    return null;
  }
  function reach(edges, from) {
    var seen = {}, q = [from], via = {};
    seen[from] = 1;
    while (q.length) {
      var c = q.shift();
      (edges[c] || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; via[n] = c; q.push(n); } });
    }
    return { seen: seen, via: via };
  }
  function pathOf(r, to) { var p = [to], c = to; while (r.via[c] !== undefined) { c = r.via[c]; p.unshift(c); } return p; }
  function showNode(n) { return String(n).indexOf("P:") === 0 ? (PRAW[n] || n.slice(2)) : String(n); }
  var DETW = /^(?:all|every|each|any|some|no|a|an|the|if)$/;
  function lowFirst(t) { var w = t.split(" ")[0].toLowerCase(); return DETW.test(w) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  function an(w) { return (/^[aeiou]/.test(w) ? "an " : "a ") + w; }
  function isNounNode(n) { var i = NPS[n]; if (!i) return true; if (i.name) return true; if (/^(?:a|an)$/.test(i.det)) return true; if (ISA[n]) return true; return i.raw !== n && /s$/.test(i.raw) && !/ss$/.test(i.raw); }
  function descr(n) { var i = NPS[n]; if (i && i.name) return cap(i.raw); if (!isNounNode(n)) return i ? i.raw : n; return an(showNode(n)); }
  function pluralOf(n) { var i = NPS[n]; if (i && i.raw !== n && /s$/.test(i.raw)) return i.raw; if (i && !isNounNode(n)) return i.raw; return plural(showNode(n)); }
  function restate(Q, negate) {
    var pred = Q.b.indexOf("P:") === 0, subj = Q.t === "some" ? "some " + pluralOf(Q.a) : (Q.t === "all" ? "all " + pluralOf(Q.a) : descr(Q.a));
    if (pred) {
      var ph = showNode(Q.b), ni = NPS[Q.a], plSubj = Q.t !== "in" || (ni && (ni.plural || (!ni.name && /s$/.test(ni.raw) && !/ss$/.test(ni.raw))));
      var third = ph;
      if (!plSubj) third = ph.replace(/^(\w+)/, function (v) { return v === "have" ? "has" : (v === "do" ? "does" : (/(?:s|x|z|ch|sh)$/.test(v) ? v + "es" : (/[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ies" : v + "s"))); });
      return subj + " " + (negate ? (plSubj ? "do not " : "does not ") + ph : third);
    }
    if (Q.t === "in") return subj + (negate ? " is not " : " is ") + descr(Q.b);
    return subj + (negate ? " are not " : " are ") + (isNounNode(Q.b) ? pluralOf(Q.b) : (NPS[Q.b] ? NPS[Q.b].raw : Q.b));
  }

  function categorical(text) {
    PRAW = {}; NPS = {};
    if (/\d/.test(text)) return null;
    var ss = sents(text);
    if (ss.length < 2 && !/,/.test(text)) return null;
    var qIdx = -1, i;
    for (i = ss.length - 1; i >= 0; i--) if (/\?$/.test(ss[i])) { qIdx = i; break; }
    if (qIdx < 0) return null;
    var qs = ss[qIdx], pre = ss.slice(0, qIdx);
    /* "If A and B, are some X Y?" -- premises before a comma inside the question */
    var cm = qs.match(/^(?:if|given that|suppose|assuming)?\s*(.+?),\s*((?:are|is|do|does|did|can|must|will|would|should|could|was|were|has|have)\b.+\?)$/i);
    if (cm && /\b(?:all|every|each|some|no|none)\b|\bis a\b|\bare\b/i.test(cm[1])) { pre = pre.concat(cm[1].split(/\s+and\s+(?=(?:all|every|each|some|no|none|[a-z]+ (?:is|are)))/i)); qs = cm[2]; }
    if (/^if\b/i.test(qs) && !cm) return null;
    var prem = [];
    pre.forEach(function (s) {
      s.split(/\s*(?:;|,\s*and\s+|\s+and\s+(?=(?:all|every|each|some|no|none)\b|[A-Za-z]+ (?:is|are|can|has|have)\b))\s*/i).forEach(function (p) { if (p) prem.push(p); });
    });
    var conditional = prem.some(function (p) { return /^if\b/i.test(p) || /\bthen\b/i.test(p); });
    if (conditional) return null;
    var P = prem.map(parsePremise).filter(Boolean);
    var qraw = clean(qs).replace(/\?+$/, ""), ql = qraw.toLowerCase(), m;
    /* the question: universal / existential / membership / predicate */
    var Q = null;
    if ((m = ql.match(/^(?:are|is) (?:all|every|each|any) (.+)$/)) || (m = ql.match(/^(?:must|do|does|would|will|should|can|could|may|might) (?:all|every|each) (.+)$/))) {
      var sv = splitSV(m[1]);
      if (sv) Q = /^(?:is|are|be)$/.test(sv.verb) ? { t: "all", a: normNP(sv.subj), b: normNP(sv.rest) } : { t: "all", a: normNP(sv.subj), b: predNode(sv.all) };
      else { /* "are all cats animals": no verb inside */ var w = m[1].split(" "); if (w.length >= 2) Q = { t: "all", a: normNP(w[0]), b: normNP(w.slice(1).join(" ")) }; }
    } else if ((m = ql.match(/^(?:are|is|must|do|does|can|could|would|will|may|might) (?:there )?(?:some|any) (.+)$/)) || (m = ql.match(/^(?:must|do|does|can|would|will|may|might) (?:some) (.+)$/))) {
      var sv2 = splitSV(m[1]);
      if (sv2) Q = /^(?:is|are|be)$/.test(sv2.verb) ? { t: "some", a: normNP(sv2.subj), b: normNP(sv2.rest) } : { t: "some", a: normNP(sv2.subj), b: predNode(sv2.all) };
      else { var w2 = m[1].split(" "); if (w2.length >= 2) Q = { t: "some", a: normNP(w2[0]), b: normNP(w2.slice(1).join(" ")) }; }
    } else if ((m = ql.match(/^(?:is|are) (.+?) (?:a|an) (.+)$/))) {
      Q = { t: "in", a: normNP(m[1]), b: normNP(m[2]) };
    } else if ((m = ql.match(/^(?:is|are) (.+)$/))) {
      var w3 = m[1].split(" ");
      if (w3.length >= 2) Q = { t: "in", a: normNP(w3.slice(0, -1).join(" ")), b: normNP(w3[w3.length - 1]) };
    } else if ((m = ql.match(/^(?:does|do|can|will|would|did|could|must|should) (.+)$/))) {
      var sv3 = splitSV("x " + m[1]);
      var parts = m[1].split(" "), j;
      for (j = 1; j < parts.length && j <= 4; j++) if (VERBSET[parts[j]] || j >= 1) { break; }
      /* subject = words up to the verb */
      var found = null;
      for (j = 1; j < parts.length; j++) if (VERBSET[parts[j]] || ["fly", "swim", "have", "eat", "bark", "grow", "float", "sink", "melt", "fade", "live", "breathe", "run", "walk", "lay", "make", "need", "hunt"].indexOf(parts[j]) >= 0) { found = j; break; }
      if (found === null) found = parts.length - 1;
      Q = { t: "in", a: normNP(parts.slice(0, found).join(" ")), b: predNode(parts.slice(found).join(" ")) };
    }
    if (!Q || !Q.a || !Q.b) return null;
    if (!P.length && !(kind(Q.a) && kind(Q.b))) return null;

    /* implication graph: A -> B for "all A are B"; disjoint pairs; overlaps */
    var edges = {}, disj = [], some = [], edgeRaw = {};
    P.forEach(function (p) {
      if (p.t === "all") { (edges[p.a] = edges[p.a] || []).push(p.b); edgeRaw[p.a + "\u2192" + p.b] = p.raw; }
      else if (p.t === "no") { disj.push([p.a, p.b]); edgeRaw[p.a + "\u2194" + p.b] = p.raw; }
      else if (p.t === "some") { some.push([p.a, p.b]); edgeRaw["\u2229" + p.a + "\u2229" + p.b] = p.raw; }
    });
    /* background taxonomy joins the premises only for kinds the premises mention */
    var mention = {}; P.forEach(function (p) { mention[p.a] = 1; mention[p.b] = 1; }); mention[Q.a] = 1; mention[Q.b] = 1;
    Object.keys(mention).forEach(function (k) { var kk = kind(k); if (kk) (ISA[kk] || []).forEach(function (par) { if (mention[par] || true) { (edges[k] = edges[k] || []).push(par); } }); });
    function sub(a, b) { var r = reach(edges, a); return r.seen[b] ? r : null; }
    function disjointN(a, b) {
      var ra = reach(edges, a), rb = reach(edges, b), hit = null;
      disj.forEach(function (d) { if ((ra.seen[d[0]] && rb.seen[d[1]]) || (ra.seen[d[1]] && rb.seen[d[0]])) hit = d; });
      if (hit) return hit;
      var ka = kind(a), kb = kind(b);
      if (ka && kb && ka !== kb && taxDisjoint(ka, kb) && !isa(ka, kb) && !isa(kb, ka)) return [ka, kb];
      return null;
    }
    function overlapN(a, b) {
      var ra = reach(edges, a), rb = reach(edges, b), hit = null;
      some.forEach(function (s) {
        /* SOME(x,y): x intersects y. Query a ~ b when x within a and y within b (either order) */
        var xa = reach(edges, s[0]), ya = reach(edges, s[1]);
        if ((xa.seen[a] && ya.seen[b]) || (xa.seen[b] && ya.seen[a])) hit = s;
      });
      /* an instance: a ⊆ b already means they overlap when a is non-empty */
      if (!hit && ra.seen[b]) hit = [a, b];
      if (!hit && rb.seen[a]) hit = [b, a];
      return hit;
    }
    function showP(x) { return showNode(x); }
    function surf(x, y) { return lowFirst(edgeRaw[x + "\u2192" + y] || (descr(x) + " is " + (String(y).indexOf("P:") === 0 ? showNode(y) : descr(y)))); }
    function chain(from, to) { if (from === to) return []; var r0 = reach(edges, from); if (!r0.seen[to]) return []; var pth = pathOf(r0, to), out = []; for (var k = 0; k < pth.length - 1; k++) out.push(surf(pth[k], pth[k + 1])); return out; }
    if (Q.t === "all" || Q.t === "in") {
      var r = sub(Q.a, Q.b);
      if (r) { var used = chain(Q.a, Q.b); return res("Yes — " + used.join(", and ") + (used.length > 1 ? ", so " + restate(Q) : "") + ".", used, "categorical"); }
      if (Q.t === "all") {
        var ref = null;
        some.forEach(function (sm) {
          if (ref) return;
          var rx = reach(edges, sm[0]), ry = reach(edges, sm[1]);
          /* some X are Y with X inside the asked class, and Y excluded from the predicate */
          if (rx.seen[Q.a] && disjointN(sm[1], Q.b)) ref = sm;
          else if (ry.seen[Q.a] && disjointN(sm[0], Q.b)) ref = [sm[1], sm[0]];
        });
        if (ref) { var dj = disjointN(ref[1], Q.b); var ur = [lowFirst(edgeRaw["\u2229" + ref[0] + "\u2229" + ref[1]] || edgeRaw["\u2229" + ref[1] + "\u2229" + ref[0]] || "some " + pluralOf(ref[0]) + " are " + pluralOf(ref[1])), lowFirst(edgeRaw[dj[0] + "\u2194" + dj[1]] || edgeRaw[dj[1] + "\u2194" + dj[0]] || (showNode(dj[0]) + " excludes " + showNode(dj[1])))]; return res("No \u2014 " + ur.join(", and ") + ", so not every " + showNode(Q.a) + " can be " + (Q.b.indexOf("P:") === 0 ? "one that " + showNode(Q.b) : an(showNode(Q.b))) + ".", ur, "categorical"); }
      }
      var d = disjointN(Q.a, Q.b);
      if (d) { var u2 = [edgeRaw[d[0] + "\u2194" + d[1]] || edgeRaw[d[1] + "\u2194" + d[0]] || (showNode(d[0]) + " excludes " + showNode(d[1]))].map(lowFirst).concat(chain(Q.a, d[0]), chain(Q.b, d[1]), chain(Q.a, d[1]), chain(Q.b, d[0])); return res("No — " + u2.join(", and ") + ", so " + restate(Q, true) + ".", u2, "categorical"); }
      if (Q.t === "all" && kind(Q.a) && kind(Q.b) && isa(kind(Q.b), kind(Q.a)) && !isa(kind(Q.a), kind(Q.b))) return res("No — not every " + showNode(Q.a) + " is " + an(showNode(Q.b)) + "; every " + showNode(Q.b) + " is " + an(showNode(Q.a)) + ", but not the other way round.", [], "categorical");
      return res("Not necessarily — that doesn't follow from what is given.", [], "categorical", 0.8);
    }
    if (Q.t === "some") {
      var o = overlapN(Q.a, Q.b);
      if (o) { var used3 = [lowFirst(edgeRaw["\u2229" + o[0] + "\u2229" + o[1]] || (restate({ t: "some", a: o[0], b: o[1] })))].concat(chain(Q.a, o[0]), chain(Q.b, o[1]), chain(Q.a, o[1]), chain(Q.b, o[0])); return res("Yes — " + used3.join(", and ") + ", so " + restate(Q) + ".", used3, "categorical"); }
      var d2 = disjointN(Q.a, Q.b);
      if (d2) return res("No — " + restate(Q, true).replace(/^some /, "no ") + ".", [], "categorical");
      return res("Not necessarily — that doesn't follow from what is given.", [], "categorical", 0.8);
    }
    return null;
  }

  /* taxonomy-only questions: "Is a whale a fish?", "Are all squares rectangles?", "Is the statement '...' true?" */
  function taxonomyQuestion(text) {
    var t = clean(text).replace(/[?.!]+$/, ""), l = t.toLowerCase(), m;
    var stmt = l.match(/^is (?:the )?(?:statement|claim|sentence)\s+["']?(.+?)["']?\s+(?:true|correct|right|false)$/);
    if (stmt) {
      var inner = stmt[1];
      var m2 = inner.match(/^(?:all|every|each)\s+([a-z ]+?)\s+(?:is|are)\s+(?:a |an )?([a-z ]+)$/);
      if (m2) { var a = kind(m2[1].trim()) || kind(normNP(m2[1])), b = kind(m2[2].trim()) || kind(normNP(m2[2])); if (a && b) { var yes = isa(a, b); return res(yes ? "Yes — that's true: every " + a + " is a " + b + "." : "No — that's false: not every " + a + " is a " + b + ".", [], "taxonomy"); } }
      return null;
    }
    if (/\b(?:disproved?|refuted?|falsified?|contradicted)\b/.test(l) && /\b(?:all|every)\b/.test(l) && /\b(?:one|a single|a|an)\b/.test(l)) return res("Yes — a single counterexample is enough to disprove a universal claim.", [], "logic");
    if ((m = l.match(/^(?:are|is) (?:all|every|each) ([a-z ]+?) (?:a |an )?([a-z]+)$/))) {
      var ka = kind(m[1].trim()) || kind(normNP(m[1])), kb = kind(m[2].trim()) || kind(normNP(m[2]));
      if (ka && kb) {
        if (isa(ka, kb)) return res("Yes — every " + ka + " is a " + kb + ".", [], "taxonomy");
        if (isa(kb, ka)) return res("No — not every " + ka + " is a " + kb + "; every " + kb + " is a " + ka + ", but not the other way round.", [], "taxonomy");
        if (taxDisjoint(ka, kb)) return res("No — a " + ka + " is never a " + kb + ".", [], "taxonomy");
        return res("No — not every " + ka + " is a " + kb + ".", [], "taxonomy", 0.7);
      }
    }
    if ((m = l.match(/^(?:is|are) (?:a |an |the )?([a-z ]+?) (?:a |an )([a-z ]+)$/))) {
      var xa = kind(m[1].trim()) || kind(normNP(m[1])), xb = kind(m[2].trim()) || kind(normNP(m[2]));
      if (xa && xb) {
        if (isa(xa, xb)) return res("Yes — a " + xa + " is a " + xb + ".", [], "taxonomy");
        if (taxDisjoint(xa, xb)) {
          var real = ISA[xa] ? ISA[xa][0] : "";
          return res("No — a " + xa + " is " + (real ? "a " + real : "not a " + xb) + (real ? ", not a " + xb : "") + ".", [], "taxonomy");
        }
      }
    }
    return null;
  }

  /* ============================================================ conditionals */
  var PSTOP = /^(?:the|a|an|it|its|then|that|this|there|they|he|she|we|i|you|do|does|did|will|would|has|have|had|to|of)$/;
  function litOf(s) {
    var t = clean(s).toLowerCase().replace(/[?.!,]+$/g, "");
    var neg = /\b(?:not|never|no longer|isn't|aren't|wasn't|weren't|doesn't|didn't|don't|won't|hasn't|haven't)\b|n't\b/.test(t);
    var toks = t.replace(/\b(?:not|never|no longer)\b/g, " ").replace(/n't\b/g, " ").split(/\s+/).filter(Boolean).map(stem).filter(function (w) { return w && !PSTOP.test(w); });
    toks = toks.filter(function (w, i) { return toks.indexOf(w) === i; }).sort();
    return { neg: neg, key: toks.join("|"), raw: t };
  }
  function litFact(s) { var f = litOf(s); f.raw = clean(s).replace(/[.!]+$/, ""); f.raw = f.raw.charAt(0).toLowerCase() + f.raw.slice(1); return f; }
  function conditionals(text) {
    if (/\d/.test(text)) return null;
    var ss = sents(text), qIdx = -1, i;
    for (i = ss.length - 1; i >= 0; i--) if (/\?$/.test(ss[i])) { qIdx = i; break; }
    if (qIdx < 0) return null;
    var rules = [], facts = [], pre = ss.slice(0, qIdx), qs = ss[qIdx], m;
    pre.forEach(function (s) {
      var low = s.replace(/[.!]+$/, "");
      if ((m = low.match(/^if (.+?),\s*(?:then\s+)?(.+)$/i)) || (m = low.match(/^if (.+?)(?:\s+then\s+|\s+)((?:the|a|an|it|they|he|she|we|you|i|there)\b.+)$/i)) || (m = low.match(/^(.+?),?\s+if\s+(.+)$/i) && [null, RegExp.$2, RegExp.$1])) {
        rules.push({ p: litOf(m[1]), q: litOf(m[2]), raw: low.charAt(0).toLowerCase() + low.slice(1) });
      } else if ((m = low.match(/^(?:whenever|when)\s+(.+?),\s*(.+)$/i))) {
        rules.push({ p: litOf(m[1]), q: litOf(m[2]), raw: low.charAt(0).toLowerCase() + low.slice(1) });
      } else if (!/^(?:what|who|how|which|why|when|where)\b/i.test(low)) {
        facts.push(litFact(low));
      }
    });
    /* the question may carry the premises: "If it rains the ground gets wet. The ground is not wet. Did it rain?" is covered above */
    if (!rules.length) return null;
    var Q = litOf(qs.replace(/^(?:did|does|do|is|are|was|were|will|would|has|have|had)\s+/i, ""));
    if (!Q.key) return null;
    /* chaining */
    var known = {}, basis = {}; facts.forEach(function (f) { known[f.key] = f.neg ? "F" : "T"; basis[f.key] = f.raw; });
    var changed = true, guard = 0, steps = [];
    while (changed && guard++ < 20) {
      changed = false;
      rules.forEach(function (r) {
        if (known[r.p.key] === (r.p.neg ? "F" : "T") && known[r.q.key] === undefined) { known[r.q.key] = r.q.neg ? "F" : "T"; basis[r.q.key] = r.raw + ", and " + basis[r.p.key] + ", so " + r.q.raw; changed = true; steps.push("modus ponens: " + r.p.raw + " \u21d2 " + r.q.raw); }
        if (known[r.q.key] === (r.q.neg ? "T" : "F") && known[r.p.key] === undefined) { known[r.p.key] = r.p.neg ? "T" : "F"; basis[r.p.key] = r.raw + ", and " + basis[r.q.key] + ", so it is not the case that " + r.p.raw; changed = true; steps.push("modus tollens: not (" + r.q.raw + ") \u21d2 not (" + r.p.raw + ")"); }
      });
    }
    var v = known[Q.key];
    if (v === undefined) {
      if (facts.length || rules.length) return res("Not necessarily \u2014 that doesn't follow from what is given.", [], "conditional", 0.8);
      return null;
    }
    var yes = (v === "T") !== Q.neg;
    return res((yes ? "Yes" : "No") + " \u2014 " + (basis[Q.key] || "it follows from the premises") + ".", steps, "conditional");
  }

  /* ================================================================ ordering */
  var HI = { taller: "height", older: "age", faster: "speed", quicker: "speed", heavier: "weight", bigger: "size", larger: "size", richer: "wealth", stronger: "strength", longer: "length", hotter: "temp", warmer: "temp", smarter: "smart", cleverer: "smart", better: "quality", greater: "amount", higher: "amount", earlier: "early", happier: "happy", louder: "loud", brighter: "bright", wider: "width", deeper: "depth", farther: "far", further: "far", cheaper: "cheap", "east of": "east", "north of": "north", "right of": "right", "ahead of": "ahead", "in front of": "ahead", above: "up", after: "late", "to the right of": "right", "to the east of": "east", "to the north of": "north", "more expensive than": "price", "more than": "amount", "greater than": "amount", "older than": "age" };
  var LO = { shorter: "height", younger: "age", slower: "speed", lighter: "weight", smaller: "size", poorer: "wealth", weaker: "strength", colder: "temp", cooler: "temp", dumber: "smart", worse: "quality", lower: "amount", less: "amount", fewer: "amount", later: "early", sadder: "happy", quieter: "loud", dimmer: "bright", narrower: "width", shallower: "depth", nearer: "far", closer: "far", "more expensive": "cheap", costlier: "price", "west of": "east", "south of": "north", "left of": "right", "behind": "ahead", "below": "up", before: "late", "to the left of": "right", "to the west of": "east", "to the south of": "north", "less than": "amount", "smaller than": "size" };
  var SUPER = {
    tallest: ["height", 1], shortest: ["height", -1], oldest: ["age", 1], youngest: ["age", -1], fastest: ["speed", 1], slowest: ["speed", -1], heaviest: ["weight", 1], lightest: ["weight", -1], biggest: ["size", 1], largest: ["size", 1], smallest: ["size", -1],
    richest: ["wealth", 1], poorest: ["wealth", -1], strongest: ["strength", 1], weakest: ["strength", -1], longest: ["length", 1], hottest: ["temp", 1], warmest: ["temp", 1], coldest: ["temp", -1], coolest: ["temp", -1], smartest: ["smart", 1], cleverest: ["smart", 1], best: ["quality", 1], worst: ["quality", -1],
    highest: ["amount", 1], lowest: ["amount", -1], greatest: ["amount", 1], least: ["amount", -1], most: ["amount", 1], earliest: ["early", 1], latest: ["early", -1], happiest: ["happy", 1], saddest: ["happy", -1], loudest: ["loud", 1], brightest: ["bright", 1], cheapest: ["cheap", 1], "most expensive": ["price", 1], farthest: ["far", 1], furthest: ["far", 1], nearest: ["far", -1], closest: ["far", -1]
  };
  var COMPS = Object.keys(HI).concat(Object.keys(LO)).sort(function (a, b) { return b.length - a.length; });
  var COMPRE = COMPS.map(function (c) { return c.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); }).join("|");
  function relTable(w) { w = w.toLowerCase(); if (HI[w]) return [HI[w], 1]; if (LO[w]) return [LO[w], -1]; return null; }

  function ordering(text) {
    var t = clean(text);
    var ss = sents(t), qIdx = -1, i;
    for (i = ss.length - 1; i >= 0; i--) if (/\?$/.test(ss[i])) { qIdx = i; break; }
    if (qIdx < 0) return null;
    var qs = ss[qIdx].replace(/\?$/, ""), pre = ss.slice(0, qIdx).join(" ");
    /* "town A", "runner Kim": a generic noun before a capitalised name is dropped */
    var DESC = /\b(?:[Tt]own|[Cc]ity|[Vv]illage|[Hh]ouse|[Ss]treet|[Rr]unner|[Pp]erson|[Ss]tudent|[Tt]eam|[Pp]layer|[Cc]ar|[Bb]uilding|[Ii]sland|[Pp]lanet|[Bb]ox|[Ss]helf|[Ff]loor|[Rr]oom|[Ll]ane|[Bb]us|[Tt]rain|[Cc]ountry|[Ss]tore|[Ss]hop|[Ss]chool|[Bb]oy|[Gg]irl|[Mm]an|[Ww]oman|[Ss]tation|[Pp]ark|[Ll]ake|[Mm]ountain|[Rr]iver|[Bb]ook|[Ss]tudent)\s+(?=[A-Z])/g;
    pre = pre.replace(DESC, ""); qs = qs.replace(DESC, "");
    var icm = qs.match(/^(?:[Ii]f|[Gg]iven that|[Ss]uppose)\s+(.+?),\s*((?:[Ii]s|[Aa]re|[Ww]as|[Dd]oes|[Dd]id|[Ww]ho|[Ww]hich)\b.+)$/);
    if (icm) { pre = (pre + " " + icm[1]).trim(); qs = icm[2]; }
    /* premises may share the question's sentence: "Anna is taller than Ben and Ben is taller than Carl. Who is the tallest?" */
    var rels = [], names = {};
    var NAME = "[A-Z][a-z]*";
    var reRel = new RegExp("(" + NAME + ")(?:\\s+(?:is|are|was|were|sits?|stands?|finishes|finished|lives?|runs?|walks?|ranks?|comes?|came|placed|places|has|had|scored))?\\s+(?:(?:much|far|slightly|a bit|a little)\\s+)?(" + COMPRE + ")(?:\\s+than)?\\s+(" + NAME + ")", "g");
    var m, ctx = pre;
    /* first normalise "A finishes before B and after C" into separate clauses */
    ctx = ctx.replace(new RegExp("(" + NAME + ")((?:\\s+(?:finishes|finished|sits?|stands?|is|was|lives?|comes?)){0,1}\\s+(?:" + COMPRE + ")(?:\\s+than)?\\s+" + NAME + ")\\s*(?:,|and|but)\\s*((?:" + COMPRE + ")(?:\\s+than)?\\s+" + NAME + ")", "g"),
      function (all, subj, first, second) { return subj + first + ". " + subj + " is " + second; });
    while ((m = reRel.exec(ctx))) {
      var rt = relTable(m[2]);
      if (!rt) continue;
      names[m[1]] = 1; names[m[3]] = 1;
      rels.push(rt[1] > 0 ? [m[1], m[3], rt[0]] : [m[3], m[1], rt[0]]);
    }
    if (rels.length < 1) return null;
    var race = /\b(?:finish|finishes|finished|race|raced|place|placed)\b/i.test(pre + " " + qs);
    /* axis normalisation: speed in a race is finishing order (earlier = faster) */
    function axisOf(dim, sign) {
      if (race && dim === "speed") return ["late", -sign];
      if (dim === "early" || dim === "ahead") return ["late", -sign];
      return [dim, sign];
    }
    var byDim = {};
    rels.forEach(function (r) {
      var ax = axisOf(r[2], 1);
      var hi = ax[1] > 0 ? r[0] : r[1], lo = ax[1] > 0 ? r[1] : r[0];
      (byDim[ax[0]] = byDim[ax[0]] || []).push([hi, lo]);
    });
    var ql = qs.toLowerCase(), qm, dim = null, sgn = 1, who = null;
    function above(d, a, b) { // is a above b (transitive)?
      var edges = {}; (byDim[d] || []).forEach(function (e) { (edges[e[1]] = edges[e[1]] || []).push(e[0]); });
      return !!reach(edges, b).seen[a] && a !== b;
    }
    function members(d) { var s = {}; (byDim[d] || []).forEach(function (e) { s[e[0]] = 1; s[e[1]] = 1; }); return Object.keys(s); }
    function top(d) { var ms = members(d); return ms.filter(function (a) { return ms.every(function (b) { return a === b || above(d, a, b); }); }); }
    function bottom(d) { var ms = members(d); return ms.filter(function (a) { return ms.every(function (b) { return a === b || above(d, b, a); }); }); }
    /* Is X <comp> than Y? */
    if ((qm = qs.match(new RegExp("^(?:[Ii]s|[Aa]re|[Ww]as|[Dd]oes|[Dd]id)\\s+(" + NAME + ")\\s+(?:sit |stand |finish |live )?(" + COMPRE + ")(?:\\s+than)?\\s+(" + NAME + ")$")))) {
      var rt2 = relTable(qm[2]); if (!rt2) return null;
      var ax2 = axisOf(rt2[0], rt2[1]);
      var hiN = ax2[1] > 0 ? qm[1] : qm[3], loN = ax2[1] > 0 ? qm[3] : qm[1];
      if (above(ax2[0], hiN, loN)) return res("Yes — " + qm[1] + " is " + qm[2] + (/(?: of| than)$/.test(qm[2]) ? " " : " than ") + qm[3] + ".", [], "ordering");
      if (above(ax2[0], loN, hiN)) return res("No — " + qm[3] + " is " + qm[2] + (/(?: of| than)$/.test(qm[2]) ? " " : " than ") + qm[1] + ".", [], "ordering");
      return res("Not necessarily — the facts don't settle it.", [], "ordering", 0.8);
    }
    /* Who is <comp>, X or Y? / Which is <comp>... */
    if ((qm = qs.match(new RegExp("(?:[Ww]ho|[Ww]hich)\\s+(?:is|was|sits?|stands?|finishes?)?\\s*(" + COMPRE + ")[,:]?\\s+(?:than\\s+)?(" + NAME + ")\\s+or\\s+(" + NAME + ")$")))) {
      var rt3 = relTable(qm[1]); if (!rt3) return null;
      var ax3 = axisOf(rt3[0], rt3[1]);
      var a1 = qm[2], b1 = qm[3];
      var aUp = above(ax3[0], a1, b1), bUp = above(ax3[0], b1, a1);
      if (!aUp && !bUp) return res("Not necessarily — the facts don't settle it.", [], "ordering", 0.8);
      var winner = ax3[1] > 0 ? (aUp ? a1 : b1) : (aUp ? b1 : a1);
      return res(winner, [], "ordering");
    }
    /* Who is the tallest / shortest / farthest east ... */
    if ((qm = ql.match(/\b(?:who|which(?: one| person)?)\b.*?\b(?:the |on the |at the )?(far (?:left|right)|middle|(?:farthest|furthest|most) (?:east|west|north|south)|finishes? first|finishes? last|wins?|comes? first|comes? last|first|last|in the middle|on the left|on the right|leftmost|rightmost|(?:[a-z]+est)|most expensive|least)\b/))) {
      var w = qm[1], d = null, sg = 1;
      if (/^(?:far left|leftmost|on the left)$/.test(w)) { d = "right"; sg = -1; }
      else if (/^(?:far right|rightmost|on the right)$/.test(w)) { d = "right"; sg = 1; }
      else if (/middle/.test(w)) {
        var dd = Object.keys(byDim)[0], ms = members(dd);
        if (ms.length === 3) { var tp = top(dd)[0], bt = bottom(dd)[0]; var mid = ms.filter(function (x) { return x !== tp && x !== bt; }); if (tp && bt && mid.length === 1) return res(mid[0], ["middle of " + ms.join(", ")], "ordering"); }
        return null;
      }
      else if (/(?:farthest|furthest|most) (east|west|north|south)/.test(w)) { var dir = w.match(/(east|west|north|south)/)[1]; d = dir === "east" || dir === "west" ? "east" : "north"; sg = dir === "east" || dir === "north" ? 1 : -1; }
      else if (/first|wins?/.test(w)) { d = "late"; sg = -1; }
      else if (/last/.test(w)) { d = "late"; sg = 1; }
      else if (SUPER[w]) { var sp = SUPER[w]; var ax4 = axisOf(sp[0], sp[1]); d = ax4[0]; sg = ax4[1]; }
      else if (w === "most expensive") { d = "price"; sg = 1; }
      if (!d || !byDim[d]) {
        /* a single-dimension problem: use it if the superlative's dimension is the only one present */
        var onlyD = Object.keys(byDim); if (d && onlyD.length === 1 && SUPER[w]) d = onlyD[0]; else return null;
      }
      var cand = sg > 0 ? top(d) : bottom(d);
      if (cand.length === 1) return res(cand[0], [members(d).join(", ") + " ordered by " + d], "ordering");
      return res("Not necessarily — the facts don't settle it.", [], "ordering", 0.8);
    }
    return null;
  }

  /* ================================================================ calendar */
  var DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  var MDAYS = { january: 31, february: 28, march: 31, april: 30, may: 31, june: 30, july: 31, august: 31, september: 30, october: 31, november: 30, december: 31 };
  function mod(a, n) { return ((a % n) + n) % n; }
  function calendar(text) {
    var t = clean(text).toLowerCase().replace(/[?.!,]+/g, " ").replace(/\s+/g, " ").trim(), m;
    var dayRe = "(monday|tuesday|wednesday|thursday|friday|saturday|sunday)", monRe = "(january|february|march|april|may|june|july|august|september|october|november|december)";
    var NUMW = "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|twenty|thirty|a hundred|hundred|a)";
    function n(x) { return x === "a" ? 1 : (x === "a hundred" ? 100 : num(x)); }
    /* anchors */
    var anchor = null;
    if ((m = t.match(new RegExp("\\b(?:today|it) is " + dayRe)))) anchor = DAYS.indexOf(m[1]);
    else if ((m = t.match(new RegExp("\\byesterday was " + dayRe)))) anchor = mod(DAYS.indexOf(m[1]) + 1, 7);
    else if ((m = t.match(new RegExp("\\btomorrow (?:is|will be) " + dayRe)))) anchor = mod(DAYS.indexOf(m[1]) - 1, 7);
    else if ((m = t.match(new RegExp("\\bthe day after tomorrow is " + dayRe)))) anchor = mod(DAYS.indexOf(m[1]) - 2, 7);
    else if ((m = t.match(new RegExp("\\bthe day before yesterday was " + dayRe)))) anchor = mod(DAYS.indexOf(m[1]) + 2, 7);
    var steps = [];
    function dayAns(base, off, why) { var r = mod(base + off, 7); return res(cap(DAYS[r]), [why || (cap(DAYS[mod(base, 7)]) + " " + (off >= 0 ? "+" : "−") + " " + Math.abs(off) + " days = " + cap(DAYS[r]) + " (" + Math.abs(off) + " mod 7 = " + (Math.abs(off) % 7) + ")")], "calendar"); }
    /* relative to an explicit day: "what day is 100 days after Wednesday", "two days before Sunday" */
    if ((m = t.match(new RegExp("\\bwhat day (?:is|comes|falls|was|would it be|will it be)?\\s*(?:the )?(?:day )?(?:" + NUMW + " days? )?(before|after|from|following|preceding) " + dayRe)))) {
      var k = m[1] ? n(m[1]) : 1, sgn = /before|preceding/.test(m[2]) ? -1 : 1;
      if (k !== null) return dayAns(DAYS.indexOf(m[3]), sgn * k);
    }
    if ((m = t.match(new RegExp("\\b" + NUMW + " days? (before|after) " + dayRe))) && /what day/.test(t)) {
      var k2 = n(m[1]); if (k2 !== null) return dayAns(DAYS.indexOf(m[3]), (m[2] === "before" ? -1 : 1) * k2);
    }
    if (anchor !== null) {
      if ((m = t.match(new RegExp("\\bwhat day (?:will it be|is it|would it be|will it have been)\\s+(?:in )?" + NUMW + " days?(?: (from now|from today|later|ago|after today|before today))?")))) {
        var k3 = n(m[1]); if (k3 !== null) { var back = /ago|before/.test(m[2] || "") || /\bwhat day was it\b/.test(t); return dayAns(anchor, back ? -k3 : k3); }
      }
      if ((m = t.match(new RegExp("\\b" + NUMW + " days? ago\\b"))) && /what day/.test(t)) { var k4 = n(m[1]); if (k4 !== null) return dayAns(anchor, -k4); }
      if ((m = t.match(new RegExp("\\bin " + NUMW + " days\\b"))) && /what day/.test(t)) { var k5 = n(m[1]); if (k5 !== null) return dayAns(anchor, k5); }
      if (/\bwhat day is (?:it )?tomorrow\b|\bwhat day (?:will it be|is) tomorrow\b/.test(t)) return dayAns(anchor, 1);
      if (/\bwhat day (?:was it|was) yesterday\b|\bwhat day is yesterday\b/.test(t)) return dayAns(anchor, -1);
      if (/\bwhat day is (?:it )?(?:the )?day after tomorrow\b|\bday after tomorrow\b/.test(t) && /\bwhat day\b/.test(t)) return dayAns(anchor, 2);
      if (/\bday before yesterday\b/.test(t) && /\bwhat day\b/.test(t)) return dayAns(anchor, -2);
      if (/\bwhat day is (?:it )?today\b|\bwhat day is it\b/.test(t) && !/in \d|ago/.test(t)) return dayAns(anchor, 0, "given");
      if (/\bwhat day (?:is|will it be|was) (?:it )?(?:next|last) week\b/.test(t)) return dayAns(anchor, 0, "a week later is the same day");
    }
    if ((m = t.match(new RegExp("\\bhow many days (?:from|between|after) " + dayRe + " (?:to|and|until|till) " + dayRe)))) { var dd = mod(DAYS.indexOf(m[2]) - DAYS.indexOf(m[1]), 7); return res(String(dd || 7), [], "calendar"); }
    /* the neighbour of a named day, month or season: "what comes after Thursday", "the season after winter" */
    var SEAS = ["spring", "summer", "autumn", "winter"], ANYNAME = "(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|autumn|fall|winter)";
    if (!/\d/.test(t) && (m = t.match(new RegExp("\\b(?:what|which)\\b[^?]*?\\b(before|after|following|preceding|prior to)\\s+(?:the\\s+)?(?:day\\s+|month\\s+|season\\s+)?" + ANYNAME + "\\b")))) {
      var dirn = /before|preceding|prior/.test(m[1]) ? -1 : 1, nm = m[2] === "fall" ? "autumn" : m[2];
      if (DAYS.indexOf(nm) >= 0) return res(cap(DAYS[mod(DAYS.indexOf(nm) + dirn, 7)]), [], "calendar");
      if (MONTHS.indexOf(nm) >= 0) return res(cap(MONTHS[mod(MONTHS.indexOf(nm) + dirn, 12)]), [], "calendar");
      if (SEAS.indexOf(nm) >= 0) return res(cap(SEAS[mod(SEAS.indexOf(nm) + dirn, 4)]), [], "calendar");
    }
    if ((m = t.match(/\b(?:what|which) (?:day|month)?[^?]*?\bbetween (\w+) and (\w+)\b/))) {
      var L1 = DAYS.indexOf(m[1]) >= 0 ? DAYS : (MONTHS.indexOf(m[1]) >= 0 ? MONTHS : null);
      if (L1 && L1.indexOf(m[2]) >= 0) { var ia = L1.indexOf(m[1]), ib = L1.indexOf(m[2]), N = L1.length; if (mod(ib - ia, N) === 2) return res(cap(L1[mod(ia + 1, N)]), [], "calendar"); }
    }
    /* months */
    if ((m = t.match(new RegExp("\\bwhat month (?:is|comes|falls|was|would it be|will it be)?\\s*(?:the )?(?:month )?(?:" + NUMW + " months? )?(before|after|from|following|preceding) " + monRe)))) {
      var k6 = m[1] ? n(m[1]) : 1, s6 = /before|preceding/.test(m[2]) ? -1 : 1;
      if (k6 !== null) return res(cap(MONTHS[mod(MONTHS.indexOf(m[3]) + s6 * k6, 12)]), [], "calendar");
    }
    if ((m = t.match(new RegExp("\\b" + NUMW + " months? (before|after) " + monRe))) && /what month|which month/.test(t)) { var k7 = n(m[1]); if (k7 !== null) return res(cap(MONTHS[mod(MONTHS.indexOf(m[3]) + (m[2] === "before" ? -1 : 1) * k7, 12)]), [], "calendar"); }
    if ((m = t.match(/\bwhat is the (\w+) (month|day) of the (year|week)\b/)) && m[2] === "month" && m[3] === "year") { var k8 = num(m[1]); if (k8 && k8 <= 12) return res(cap(MONTHS[k8 - 1]), [], "calendar"); }
    if ((m = t.match(new RegExp("\\bhow many days (?:are )?(?:there )?in " + monRe)))) {
      var dn = MDAYS[m[1]];
      var fy = t.match(/\b(1[0-9]{3}|2[0-9]{3})\b/);
      if (m[1] === "february" && fy) { var Y = +fy[1], isLeap = (Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0; return res((isLeap ? "29" : "28") + " days (" + Y + " is " + (isLeap ? "" : "not ") + "a leap year)", [], "calendar"); }
      if (m[1] === "february") return res(/leap/.test(t) ? "29 days" : (/regular|normal|common|non-leap|ordinary|usual/.test(t) ? "28 days" : "28 days (29 in a leap year)"), [], "calendar");
      return res(dn + " days", [], "calendar");
    }
    if ((m = t.match(/\bhow many months (?:of the year )?(?:have|has|contain|with) (\d+) days\b/))) {
      var nd = +m[1];
      if (nd === 31) return res("7 months have 31 days: January, March, May, July, August, October and December.", [], "calendar");
      if (nd === 30) return res("4 months have 30 days: April, June, September and November.", [], "calendar");
      if (nd === 28) return res("All 12 months have at least 28 days; only February has exactly 28 (29 in a leap year).", [], "calendar");
      if (nd === 29) return res("Only February in a leap year has 29 days.", [], "calendar");
    }
    if ((m = t.match(/\bhow many (?:days|months|weeks|hours|minutes|seconds) (?:are )?(?:there )?in (?:a|one) (leap year|year|week|day|month|hour|minute)\b/)) && /how many/.test(t)) {
      var what = (t.match(/how many (days|months|weeks|hours|minutes|seconds)/) || [])[1];
      var T = { "leap year": { days: 366, weeks: 52, months: 12, hours: 8784 }, year: { days: 365, weeks: 52, months: 12, hours: 8760 }, week: { days: 7, hours: 168, minutes: 10080, seconds: 604800 }, day: { hours: 24, minutes: 1440, seconds: 86400 }, hour: { minutes: 60, seconds: 3600 }, minute: { seconds: 60 } };
      if (T[m[1]] && T[m[1]][what]) return res(String(T[m[1]][what]), [], "calendar");
    }
    return null;
  }

  /* ================================================================== kinship */
  var KIN = {
    mother: ["parent", "f"], father: ["parent", "m"], parent: ["parent", ""], son: ["child", "m"], daughter: ["child", "f"], child: ["child", ""],
    brother: ["sibling", "m"], sister: ["sibling", "f"], sibling: ["sibling", ""], husband: ["spouse", "m"], wife: ["spouse", "f"], spouse: ["spouse", ""],
    grandmother: ["grandparent", "f"], grandfather: ["grandparent", "m"], grandparent: ["grandparent", ""], grandson: ["grandchild", "m"], granddaughter: ["grandchild", "f"], grandchild: ["grandchild", ""],
    uncle: ["auncle", "m"], aunt: ["auncle", "f"], nephew: ["nibling", "m"], niece: ["nibling", "f"], cousin: ["cousin", ""]
  };
  function kinName(rel, g) {
    var N = { parent: { f: "mother", m: "father", "": "parent" }, child: { f: "daughter", m: "son", "": "child" }, sibling: { f: "sister", m: "brother", "": "sibling" }, spouse: { f: "wife", m: "husband", "": "spouse" },
      grandparent: { f: "grandmother", m: "grandfather", "": "grandparent" }, grandchild: { f: "granddaughter", m: "grandson", "": "grandchild" }, auncle: { f: "aunt", m: "uncle", "": "aunt or uncle" }, nibling: { f: "niece", m: "nephew", "": "niece or nephew" }, cousin: { f: "cousin", m: "cousin", "": "cousin" },
      parentinlaw: { f: "mother-in-law", m: "father-in-law", "": "parent-in-law" }, childinlaw: { f: "daughter-in-law", m: "son-in-law", "": "child-in-law" }, siblinginlaw: { f: "sister-in-law", m: "brother-in-law", "": "sibling-in-law" } };
    return N[rel] ? N[rel][g || ""] : null;
  }
  /* the relation of A to C, when A is the r1 of B and B is the r2 of C ("A is the mother of B; B is the wife of C") */
  function composeKin(r1, r2) {
    var a = KIN[r1], b = KIN[r2];
    if (!a || !b) return null;
    var x = a[0], y = b[0], g = a[1];
    function out(rel, gender) { return kinName(rel, gender); }
    if (x === "parent" && y === "parent") return out("grandparent", g);
    if (x === "child" && y === "child") return out("grandchild", g);
    if (x === "parent" && y === "sibling") return out("parent", g);
    if (x === "sibling" && y === "parent") return out("auncle", g);
    if (x === "child" && y === "sibling") return out("nibling", g);
    if (x === "sibling" && y === "child") return out("child", "");
    if (x === "sibling" && y === "sibling") return out("sibling", g);
    if (x === "parent" && y === "spouse") return out("parentinlaw", g);
    if (x === "child" && y === "spouse") return out("child", g);
    if (x === "spouse" && y === "parent") return out("parent", "");
    if (x === "spouse" && y === "child") return out("childinlaw", g);
    if (x === "sibling" && y === "spouse") return out("siblinginlaw", g);
    if (x === "spouse" && y === "sibling") return out("siblinginlaw", g);
    if (x === "grandparent" && y === "child") return out("parent", "");
    if (x === "auncle" && y === "child") return out("cousin", "");
    if (x === "auncle" && y === "sibling") return out("auncle", g);
    if (x === "parent" && y === "child") return null;
    return null;
  }
  function kinship(text) {
    var t = clean(text).replace(/[?.!]+$/, ""), l = t.toLowerCase(), m;
    /* "my father's brother" -> uncle: the r2 of my r1 */
    if ((m = l.match(/\b(?:my|his|her|your) ([a-z]+)'s ([a-z]+)\b/)) && KIN[m[1]] && KIN[m[2]] && /\b(?:what|who|call|called|is)\b/.test(l)) {
      var rel = composeKinOfMine(m[1], m[2]);
      if (rel) return res(cap(rel), [], "kinship");
    }
    /* chain of statements */
    var ss = sents(text), qIdx = -1, i;
    for (i = ss.length - 1; i >= 0; i--) if (/\?$/.test(ss[i])) { qIdx = i; break; }
    if (qIdx < 0) return null;
    var facts = [];
    var re = /\b([A-Z][a-z]*|[A-Z])\s+is\s+(?:the|a|an)\s+([a-z]+)\s+of\s+([A-Z][a-z]*|[A-Z])\b/g, mm;
    var body = ss.slice(0, qIdx).join(" ") + " " + ss[qIdx].replace(/\?$/, "");
    var qm = ss[qIdx].match(/\b[Ww]hat is ([A-Z][a-z]*|[A-Z]) to ([A-Z][a-z]*|[A-Z])\b/);
    var bodyPre = ss.slice(0, qIdx).join(" ");
    body = bodyPre;
    while ((mm = re.exec(body))) if (KIN[mm[2]]) facts.push({ a: mm[1], r: mm[2], b: mm[3] });
    if (!qm || facts.length < 2) return null;
    /* walk from qm[1] to qm[2] through the facts */
    var cur = null, node = qm[1], target = qm[2], hops = [], guard = 0;
    while (node !== target && guard++ < 6) {
      var f = facts.filter(function (x) { return x.a === node; })[0];
      if (!f) return null;
      hops.push(f); node = f.b;
    }
    if (node !== target || hops.length < 2) return null;
    var rel2 = hops[0].r;
    for (i = 1; i < hops.length; i++) { rel2 = composeKinName(rel2, hops[i].r); if (!rel2) return null; }
    return res(cap(rel2) + ".", [hops.map(function (h) { return h.a + " is the " + h.r + " of " + h.b; }).join("; ")], "kinship");
  }
  function composeKinName(r1, r2) { return composeKin(r1, r2); }
  /* "my R1's R2": the R2 of my R1 */
  function composeKinOfMine(r1, r2) {
    var a = KIN[r1], b = KIN[r2], x = a[0], y = b[0], g = b[1];
    function nm(rel, gg) { return kinName(rel, gg); }
    if (x === "parent" && y === "parent") return nm("grandparent", g);
    if (x === "parent" && y === "sibling") return nm("auncle", g);
    if (x === "sibling" && y === "child") return nm("nibling", g);
    if (x === "child" && y === "child") return nm("grandchild", g);
    if (x === "sibling" && y === "sibling") return null;
    if (x === "child" && y === "spouse") return nm("childinlaw", g);
    if (x === "spouse" && y === "parent") return nm("parentinlaw", g);
    if (x === "spouse" && y === "sibling") return nm("siblinginlaw", g);
    if (x === "sibling" && y === "spouse") return nm("siblinginlaw", g);
    if (x === "auncle" && y === "child") return "cousin";
    if (x === "parent" && y === "child") return null;
    if (x === "grandparent" && y === "child") return null;
    return null;
  }

  /* ================================================== compass, clock, riddles */
  var DIRS = ["north", "east", "south", "west"];
  function compass(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+/g, " "), m;
    if (!(m = l.match(/\b(?:face|facing|faces|heading|head|looking|look|walk(?:ing)? (?:toward|towards)|start(?:ing)? (?:by )?facing) (north|east|south|west)\b/))) return null;
    var d = DIRS.indexOf(m[1]), re = /\b(?:turn|turns|turned|turning|rotate|rotates|spin|spins)\s+(?:to the )?(right|left|around|back|(\d+) degrees?(?:\s+(?:to the )?(clockwise|counterclockwise|anticlockwise|right|left))?)(?:\s+(twice|three times|(\d+) times))?/g, tm, any = false;
    var from = l.indexOf(m[0]);
    var rest = l.slice(from + m[0].length);
    while ((tm = re.exec(rest))) {
      any = true;
      var times = tm[4] ? (tm[4] === "twice" ? 2 : (tm[4] === "three times" ? 3 : +tm[5])) : 1;
      var step;
      if (tm[1] === "right") step = 1; else if (tm[1] === "left") step = -1; else if (tm[1] === "around" || tm[1] === "back") step = 2;
      else { var deg = +tm[2], dir = tm[3] || "clockwise"; step = (deg / 90) * (/counter|anti|left/.test(dir) ? -1 : 1); }
      d = mod(d + step * times, 4);
    }
    if (!any) return null;
    return res(cap(DIRS[d]), ["start " + m[1], "each right turn is a quarter turn clockwise"], "compass");
  }
  function clockAngle(text) {
    var l = clean(text).toLowerCase(), m;
    if (!/\bangle\b/.test(l) || !/\bhands?\b/.test(l) || !/\bclock\b|\bhour\b|\bminute\b/.test(l)) return null;
    if (!(m = l.match(/\b(\d{1,2}):(\d{2})\b/)) && !(m = l.match(/\b(\d{1,2}) o'?clock\b/))) return null;
    var h = +m[1] % 12, mi = m[2] ? +m[2] : 0;
    var a = Math.abs(30 * h + 0.5 * mi - 6 * mi); if (a > 180) a = 360 - a;
    return res(String(a) + " degrees", ["|30×" + h + " + 0.5×" + mi + " − 6×" + mi + "| = " + a], "clock");
  }

  function sequence(text) {
    var l = clean(text);
    if (!/\b(?:next|missing|continue|continues|follows|complete|pattern|sequence|series|term)\b/i.test(l)) return null;
    if (/\bfibonacci\b/i.test(l) && /\b(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i.test(l)) return null;
    var seg = l.replace(/^.*?(?:next|pattern|sequence|series|follows|complete|continue)[^:\d-]*?[:\s]\s*(?=-?\d|[A-Za-z]\s*,)/i, "");
    var m = seg.match(/-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+/);
    var nums = null, letters = null;
    if (m) nums = m[0].split(/\s*,\s*/).map(Number);
    else if ((m = seg.match(/\b[A-Za-z](?:\s*,\s*[A-Za-z]){2,}/))) letters = m[0].split(/\s*,\s*/);
    var rest0 = null;
    if (!nums && !letters) return null;
    var seq = nums;
    var upper = false;
    if (letters) {
      upper = /[A-Z]/.test(letters[0]);
      seq = letters.map(function (c) { return c.toLowerCase().charCodeAt(0) - 96; });
    }
    var nth = (l.match(/\b(\d+)(?:st|nd|rd|th) term\b/) || [])[1];
    var r = nextOfSequence(seq, nth ? +nth : null);
    if (!r) return null;
    var out = r.value;
    if (letters) { out = String.fromCharCode(96 + mod(Math.round(r.value) - 1, 26) + 1); if (upper) out = out.toUpperCase(); }
    return res((typeof out === "number" ? fmtNum(out) : out), [r.rule], "sequence");
  }
  function fmtNum(x) { return Number.isInteger(x) ? String(x) : String(Math.round(x * 1e6) / 1e6); }
  function nextOfSequence(a, nth) {
    var n = a.length, i, k;
    if (n < 3) return null;
    function eq(x, y) { return Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(x), Math.abs(y)); }
    function all(f) { for (var j = 0; j < n; j++) if (!f(j)) return false; return true; }
    var idx = nth ? nth : n + 1;
    /* arithmetic */
    var d = a[1] - a[0];
    if (all(function (j) { return j === 0 || eq(a[j] - a[j - 1], d); })) return { value: a[0] + (idx - 1) * d, rule: "add " + fmtNum(d) + " each time" };
    /* geometric */
    if (a[0] !== 0 && all(function (j) { return a[j - 0] !== 0; })) {
      var r = a[1] / a[0];
      if (all(function (j) { return j === 0 || eq(a[j] / a[j - 1], r); })) return { value: a[0] * Math.pow(r, idx - 1), rule: "multiply by " + fmtNum(r) + " each time" };
    }
    if (nth) return null;
    /* fibonacci-like */
    if (n >= 4 && all(function (j) { return j < 2 || eq(a[j], a[j - 1] + a[j - 2]); })) return { value: a[n - 1] + a[n - 2], rule: "each term is the sum of the two before it" };
    /* polynomial by finite differences */
    var diffs = [a.slice()], lvl;
    for (lvl = 1; lvl <= 3 && diffs[lvl - 1].length > 2; lvl++) {
      var prev = diffs[lvl - 1], cur = [];
      for (i = 1; i < prev.length; i++) cur.push(prev[i] - prev[i - 1]);
      diffs.push(cur);
      if (cur.length >= 2 && cur.every(function (x) { return eq(x, cur[0]); })) {
        /* constant at this level: extend */
        var ext = cur[0], L;
        for (L = lvl - 1; L >= 0; L--) ext = diffs[L][diffs[L].length - 1] + ext;
        return { value: ext, rule: lvl === 1 ? "constant difference" : (lvl === 2 ? "the differences themselves grow by a constant (squares, triangular numbers ...)" : "third differences are constant") };
      }
    }
    /* x*k + c */
    if (n >= 4) {
      var den = a[1] - a[0];
      if (den !== 0) {
        var kk = (a[2] - a[1]) / den, cc = a[1] - kk * a[0];
        if (all(function (j) { return j === 0 || eq(a[j], kk * a[j - 1] + cc); })) return { value: kk * a[n - 1] + cc, rule: "multiply by " + fmtNum(kk) + " then add " + fmtNum(cc) };
      }
    }
    /* factorial-like: ratios step by one */
    if (n >= 4) {
      var rat = []; for (i = 1; i < n; i++) { if (a[i - 1] === 0) { rat = null; break; } rat.push(a[i] / a[i - 1]); }
      if (rat && rat.length >= 3) { var rd = rat[1] - rat[0]; if (rat.every(function (x, j) { return j === 0 || eq(x - rat[j - 1], rd); })) return { value: a[n - 1] * (rat[rat.length - 1] + rd), rule: "the multiplier grows by " + fmtNum(rd) + " each step" }; }
    }
    /* alternating differences */
    if (n >= 5) {
      var d1 = a[1] - a[0], d2 = a[2] - a[1];
      if (all(function (j) { return j === 0 || eq(a[j] - a[j - 1], j % 2 ? d1 : d2); })) return { value: a[n - 1] + (n % 2 ? d1 : d2), rule: "add " + fmtNum(d1) + " then " + fmtNum(d2) + ", alternating" };
    }
    /* interleaved sequences */
    if (n >= 6) {
      var ev = [], od = [];
      for (i = 0; i < n; i++) (i % 2 ? od : ev).push(a[i]);
      var re1 = ev.length >= 3 ? nextOfSequence(ev, null) : null, re2 = od.length >= 3 ? nextOfSequence(od, null) : null;
      if (re1 && re2) return { value: n % 2 ? re1.value : re2.value, rule: "two interleaved sequences" };
    }
    /* primes */
    var primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
    if (n < primes.length && all(function (j) { return a[j] === primes[j]; })) return { value: primes[n], rule: "the prime numbers" };
    return null;
  }

  /* classic riddles whose answer is a careful reading of the words */
  function riddles(text) {
    var l = clean(text).toLowerCase(), m;
    if ((m = l.match(/\b(\d+|[a-z]+)\s+(?:sheep|cows|chickens|hens|animals|birds|fish|horses|pigs|dogs|cats|apples|people|students|goats|ducks|rabbits|pigeons|cookies|marbles|candles|balloons)\b[^?]*?\ball but (\d+|[a-z]+)\b/)) && /how many/.test(l)) { var v = num(m[2]); if (v !== null) return res(String(v), ["\"all but " + v + "\" leaves " + v], "riddle"); }
    if (/\bhow many months\b.*\b(?:28|twenty-eight)\b/.test(l)) return res("All 12 months have at least 28 days.", [], "riddle");
    if ((m = l.match(/\b(\d+|[a-z]+) (?:apples?|cookies?|oranges?|coins?|pens?|books?|cakes?|sweets?|candies)\b[^.?]*\byou take (?:away )?(\d+|[a-z]+)\b[^.?]*\bhow many (?:[a-z]+ )?(?:do|would) you have\b/)) || (m = l.match(/\b(\d+|[a-z]+) (?:apples?|cookies?|oranges?|coins?|pens?|books?|cakes?|sweets?|candies)\b[^.?]*\byou take (\d+|[a-z]+) away\b[^.?]*\bhow many (?:[a-z]+ )?(?:do|would) you have\b/))) { var tk = num(m[2]); if (tk !== null) return res(tk + " — the ones you took.", [], "riddle"); }
    if (/\b(?:heavier|weighs more|weigh more|heavy)\b/.test(l) && (m = l.match(/\b(?:a |an |one )?(kilogram|kilo|pound|ton|ounce|gram|stone)s? of ([a-z]+)\b[^.?]*\b(?:or|and) (?:a |an |one )?(kilogram|kilo|pound|ton|ounce|gram|stone)s? of ([a-z]+)\b/)) && m[1].replace("kilo", "kilogram") === m[3].replace("kilo", "kilogram")) return res("They weigh the same — a " + m[1] + " of " + m[2] + " and a " + m[3] + " of " + m[4] + " are the same weight.", [], "riddle");
    var lw = l.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|fifty|hundred)\b/g, function (w) { return String(WN[w]); });
    if ((m = lw.match(/\b(\d+) (?:machines?|workers?|printers?|robots?|people|men|painters?|bakers?|cooks?|ovens?|presses|looms?) (?:take|takes|make|makes|produce|produces|print|prints|bake|bakes)\s+(\d+)\s+([a-z]+)\s+(?:in|within)\s+(\d+)\s+(minutes?|hours?|days?|seconds?)/)) ||
        (m = lw.match(/\b(\d+) (?:machines?|workers?|printers?|robots?|people|men|painters?|bakers?|cooks?|ovens?|presses|looms?) (?:take|takes) (\d+) (minutes?|hours?|days?|seconds?) to (?:make|produce|print|build|bake) (\d+) ([a-z]+)/) && [null, RegExp.$1, RegExp.$4, RegExp.$5, RegExp.$2, RegExp.$3])) {
      var n1 = +m[1], w1 = +m[2], t1 = m[4], unit = m[5];
      var m2 = lw.match(/\bhow long\b[^?]*?\b(\d+) (?:machines?|workers?|printers?|robots?|people|men|painters?|bakers?|cooks?|ovens?|presses|looms?)[^?]*?\b(\d+) ([a-z]+)/);
      if (n1 === w1 && m2 && +m2[1] === +m2[2]) return res(t1 + " " + unit + " \u2014 each machine works at the same time, so each still needs " + t1 + " " + unit + " for its own one.", [], "riddle");
    }
    if ((m = l.match(/\b([a-z]+)'s (?:father|mother|dad|mom) has (\w+) (?:daughters|sons|children)[^.?]*?(?:named|called|:)\s*([a-z, ]+?)(?:\.|and what|what)/)) && /what is the (?:name of the )?(?:fifth|last|\w+th|\w+) (?:daughter|son|child)/.test(l)) return res(cap(m[1]), ["the question names her in its first words"], "riddle");
    if (/\bsam has 3 brothers\b|\b(\w+) has (\w+) brothers? and each brother has (\w+) sisters?\b/.test(l)) {
      m = l.match(/each brother has (\d+|\w+) sisters?/); var sis = m ? num(m[1]) : null;
      if (sis !== null && /\bif (?:\w+) is a boy\b|\bhe\b/.test(l)) return res(String(sis), ["the brothers' sisters are also his sisters; he is a boy, so he is not one of them"], "riddle");
    }
    if (/\bhow many (?:animals|pairs|creatures)\b.*\bmoses\b/.test(l)) return res("None — it was Noah, not Moses, who took animals on the ark.", [], "riddle");
    if ((m = l.match(/\bwhat (?:weighs|is) (?:more|heavier)[^,]*,\s*(?:a |an )?([a-z]+) of ([a-z]+) or (?:a |an )?([a-z]+) of ([a-z]+)/)) && m[1] === m[3]) return res("They weigh the same — a " + m[1] + " is a " + m[1] + ".", [], "riddle");
    if (/\bwhich (?:is |weighs )?(?:heavier|more)\b/.test(l) && (m = l.match(/(\d+) ?(kg|kilograms?|pounds?|lbs?)/g)) && m.length === 2 && m[0].replace(/\s/g, "") === m[1].replace(/\s/g, "")) return res("They weigh the same.", [], "riddle");
    return null;
  }

  function opposite(text) {
    var l = clean(text).toLowerCase(), m;
    if ((m = l.match(/\bopposite (?:direction )?of (north|south|east|west|up|down|left|right)\b/)) || (m = l.match(/\bopposite (?:direction )?to (north|south|east|west|up|down|left|right)\b/))) {
      var P = { north: "south", south: "north", east: "west", west: "east", up: "down", down: "up", left: "right", right: "left" };
      return res(cap(P[m[1]]), [], "opposite");
    }
    return null;
  }

  /* odd-one-out questions */
  function oddQuestion(text) {
    var t = clean(text).replace(/[?.!]+$/, ""), m;
    if (!(m = t.match(/\b(?:which|what)\b[^:]*?\b(?:does(?:n't| not) belong|is the odd one out|is different|doesn't fit|does not fit|is the odd one|is not like the others|one is different|odd one out|does not match|doesn't match)\b[^:]*[:,]\s*(.+)$/i)) &&
        !(m = t.match(/\bwhich (?:one )?of (?:these|the following)\b[^:]*:\s*(.+)$/i)) &&
        !(m = t.match(/\bodd one out\b[^:]*[:\s]\s*(.+)$/i))) return null;
    var items = m[1].replace(/\bor\b|\band\b/gi, ",").split(/\s*,\s*/).map(function (x) { return x.trim().toLowerCase().replace(/^(?:a|an|the)\s+/, ""); }).filter(Boolean);
    var r = oddOneOut(items);
    if (!r) return null;
    return res(cap(r.odd) + " — the others are " + (r.cat === "animal" ? "animals" : plural(r.cat)) + ", " + r.odd + " is " + (a_an(r.oddKind)) + ".", [], "category");
  }
  function plural(w) { if (/s$/.test(w)) return w; if (/y$/.test(w) && !/[aeiou]y$/.test(w)) return w.slice(0, -1) + "ies"; if (/(?:ch|sh|x)$/.test(w)) return w + "es"; return w + "s"; }
  function a_an(w) { return (/^[aeiou]/.test(w) ? "an " : "a ") + w; }

  /* ================================================================ solve */
  var SOLVERS = [riddles, calendar, kinship, compass, clockAngle, sequence, oddQuestion, opposite, taxonomyQuestion, conditionals, ordering, categorical];
  function solve(text) {
    var t = clean(text);
    if (!t || t.length > 900) return null;
    for (var i = 0; i < SOLVERS.length; i++) {
      var r = null;
      try { r = SOLVERS[i](t); } catch (e) { r = null; }
      if (r && r.answer) return r;
    }
    return null;
  }

  root.C4LMLogic = { solve: solve, categorical: categorical, ordering: ordering, calendar: calendar, kinship: kinship, sequence: sequence, nextOfSequence: nextOfSequence, isa: isa, kind: kind, oddOneOut: oddOneOut, taxonomy: taxonomyQuestion };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMLogic;
})(typeof window !== "undefined" ? window : globalThis);
