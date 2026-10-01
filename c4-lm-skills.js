/* CELL4 everyday skills.
 *
 * Procedures for the things people ask a language system to do besides look
 * facts up, each computed from the text of the request:
 *
 *   dates         day of the week of a date, days between dates, a date N days on,
 *                 ages and spans of years
 *   number words  1234 -> "one thousand two hundred thirty-four", and back; ordinals
 *   money         percent change, "A is what percent of B", simple and compound interest
 *   statistics    variance, standard deviation, z-score
 *   phrasebook    "how do you say thank you in French?", "what does 'danke' mean?"
 *   summaries     the most informative sentences of a passage
 *   letters       arrangements of the letters of a word
 *   chemistry     molar mass of a formula or a common compound, atom counts
 *   physics       F = ma, kinetic energy, V = IR, density, speed ... from the given quantities
 *   words         opposites and near-synonyms (thesaurus)
 *
 * A request that does not match a procedure exactly returns null. Local only.
 */
(function (root) {
  "use strict";

  function clean(t) { return String(t || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim(); }
  function res(answer, steps, schema, confidence) { return { answer: answer, steps: steps || [], schema: schema, confidence: confidence || 0.86 }; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fmt(x, digits) {
    if (!isFinite(x)) return String(x);
    if (Number.isInteger(x)) return String(x);
    var d = digits === undefined ? 4 : digits;
    var r = Number(x.toFixed(d));
    return String(r);
  }
  function money(x) { return "$" + (Math.round(x * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* ---------------------------------------------------------------- dates */
  var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  var MON_RE = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\\.?";
  var DAYNAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function monthIndex(w) {
    w = w.toLowerCase().replace(/\.$/, "");
    for (var i = 0; i < 12; i++) if (MONTHS[i] === w || MONTHS[i].slice(0, 3) === w.slice(0, 3) && w.length <= 4 && MONTHS[i].indexOf(w) === 0) return i;
    return -1;
  }
  function today() { var d = new Date(); return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }; }
  function utc(y, m, d) { var t = new Date(Date.UTC(2000, m, d)); t.setUTCFullYear(y); return t; }
  function toDate(o) { return utc(o.y, o.m, o.d); }
  function fromDate(t) { return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; }
  function showDate(o) { return MONTHS[o.m].charAt(0).toUpperCase() + MONTHS[o.m].slice(1) + " " + o.d + ", " + o.y; }
  function dayName(o) { return DAYNAMES[toDate(o).getUTCDay()]; }
  function validDate(o) { var yy = o.y === null ? 2000 : o.y, t = toDate({ y: yy, m: o.m, d: o.d }); return t.getUTCFullYear() === yy && t.getUTCMonth() === o.m && t.getUTCDate() === o.d; }
  /* every date written in the text, in order */
  function datesIn(text) {
    var out = [], re, m, taken = [];
    function add(o, idx, len) { if (o && validDate(o)) { out.push({ date: o, at: idx }); taken.push([idx, idx + len]); } }
    function free(idx) { return !taken.some(function (t) { return idx >= t[0] && idx < t[1]; }); }
    re = new RegExp("\\b" + MON_RE + "\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{3,4}))?\\b", "gi");
    while ((m = re.exec(text))) if (free(m.index)) add({ y: m[3] ? +m[3] : null, m: monthIndex(m[1]), d: +m[2] }, m.index, m[0].length);
    re = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?" + MON_RE + "(?:,?\\s+(\\d{3,4}))?\\b", "gi");
    while ((m = re.exec(text))) if (free(m.index)) add({ y: m[3] ? +m[3] : null, m: monthIndex(m[2]), d: +m[1] }, m.index, m[0].length);
    re = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = re.exec(text))) if (free(m.index)) add({ y: +m[1], m: +m[2] - 1, d: +m[3] }, m.index, m[0].length);
    re = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    while ((m = re.exec(text))) if (free(m.index)) add({ y: +m[3], m: +m[1] - 1, d: +m[2] }, m.index, m[0].length);
    out.sort(function (a, b) { return a.at - b.at; });
    return out.map(function (x) { return x.date; });
  }
  function fixYear(d, fallback) { if (d.y === null) { d = { y: fallback, m: d.m, d: d.d }; } return d; }
  function dateQ(text) {
    var t = clean(text), l = t.toLowerCase().replace(/[?.!]+$/, ""), m, ds;
    var now = today();
    /* day of the week */
    if (/\bwhat (?:day of the week|day)\b/.test(l) && !/\b(?:in|after|from|before|ago|will it be|until)\b\s+\d+ (?:days?|weeks?)/.test(l) && !/\b(?:today|tomorrow|yesterday)\b/.test(l) && (ds = datesIn(t)).length === 1) {
      var d1 = fixYear(ds[0], now.y), tense = /\b(?:was|were|did)\b/.test(l) ? "was" : (d1.y > now.y || (d1.y === now.y && toDate(d1) > toDate(now)) ? "will be" : "is");
      if (/\bwas\b/.test(l)) tense = "was";
      return res(showDate(d1) + " " + tense + " a " + dayName(d1) + ".", [], "date");
    }
    /* days between two dates */
    if (/\bhow many (days|weeks|months|years)\b/.test(l) && /\b(?:between|from|since|until|till|to)\b/.test(l) && (ds = datesIn(t)).length === 2) {
      var yr = ds[0].y !== null ? ds[0].y : (ds[1].y !== null ? ds[1].y : now.y);
      var a = fixYear(ds[0], yr), b = fixYear(ds[1], ds[1].y !== null ? ds[1].y : yr);
      var days = Math.round((toDate(b) - toDate(a)) / 86400000), unit = (l.match(/how many (days|weeks|months|years)/) || [])[1];
      var n = Math.abs(days);
      if (unit === "weeks") return res(fmt(n / 7, 2) + " weeks (" + n + " days)", [], "date");
      if (unit === "months") return res("about " + fmt(n / 30.4375, 1) + " months (" + n + " days)", [], "date");
      if (unit === "years") return res("about " + fmt(n / 365.25, 2) + " years (" + n + " days)", [], "date");
      return res(n + " days" + (days < 0 ? " (the second date is earlier)" : "") + ".", [showDate(a) + " to " + showDate(b)], "date");
    }
    /* days until / since a date, from today */
    if ((m = l.match(/\bhow many (days|weeks) (?:are there |is it |are left |left )?(until|till|since|to|from)\b/)) && (ds = datesIn(t)).length === 1) {
      var tg = fixYear(ds[0], now.y), dd = Math.round((toDate(tg) - toDate(now)) / 86400000);
      if (m[2] === "since" || m[2] === "from") dd = -dd;
      if (/\buntil|till|to\b/.test(m[2]) && dd < 0 && ds[0].y === null) { tg = { y: now.y + 1, m: tg.m, d: tg.d }; dd = Math.round((toDate(tg) - toDate(now)) / 86400000); }
      var cnt = Math.abs(dd);
      return res((m[1] === "weeks" ? fmt(cnt / 7, 1) + " weeks (" + cnt + " days)" : cnt + " days") + (dd < 0 && m[2] !== "since" && m[2] !== "from" ? " ago" : "") + ", counting from today (" + showDate(now) + ").", [], "date");
    }
    /* a date N days/weeks/months/years after or before */
    if ((m = l.match(/\bwhat(?:'s| is)? (?:the )?date\b[^0-9]*?(\d+)\s*(days?|weeks?|months?|years?)\s*(from|after|before|ago|from now)\b/)) || (m = l.match(/\b(\d+)\s*(days?|weeks?|months?|years?)\s*(from|after|before)\b[^?]*\bwhat(?:'s| is)? (?:the )?date\b/))) {
      var base = datesIn(t)[0], baseTxt;
      if (!base) { base = now; baseTxt = "today"; } else base = fixYear(base, now.y);
      var amount = +m[1] * (/before|ago/.test(m[3]) ? -1 : 1), unit2 = m[2].replace(/s$/, ""), tt = toDate(base);
      if (unit2 === "day") tt.setUTCDate(tt.getUTCDate() + amount);
      else if (unit2 === "week") tt.setUTCDate(tt.getUTCDate() + 7 * amount);
      else if (unit2 === "month") tt.setUTCMonth(tt.getUTCMonth() + amount);
      else tt.setUTCFullYear(tt.getUTCFullYear() + amount);
      var r = fromDate(tt);
      return res(showDate(r) + " (a " + dayName(r) + ").", [], "date");
    }
    /* ages and spans of years */
    if ((m = l.match(/\bhow old (?:is|would be|will be) (?:someone|a person|somebody|anyone|he|she|a man|a woman|a child) (?:who was )?born in (\d{4})(?: in (\d{4}))?\b/)) || (m = l.match(/\bhow old am i if i was born in (\d{4})()\b/))) {
      var age = (m[2] ? +m[2] : now.y) - +m[1];
      return res("About " + age + " years old (it depends on whether the birthday has passed " + (m[2] ? "by then" : "this year") + ": " + (age - 1) + " or " + age + ").", [], "date");
    }
    if ((m = l.match(/\bhow many years (?:are there )?(?:between|from) (\d{4}) (?:and|to) (\d{4})\b/))) return res(Math.abs(+m[2] - +m[1]) + " years.", [], "date");
    if ((m = l.match(/\bhow many years ago (?:was|did|were)\b[^?]*\b(?:in )?(\d{4})\b/)) || (m = l.match(/\bhow long ago was (\d{4})\b/))) return res("About " + (now.y - +m[1]) + " years ago (in " + m[1] + ").", [], "date");
    if ((m = l.match(/\bis (\d{4}) a leap year\b/)) || (m = l.match(/\bwas (\d{4}) a leap year\b/))) { var y = +m[1], leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; return res((leap ? "Yes" : "No") + " — " + y + " " + (leap ? "is" : "is not") + " a leap year" + (leap ? "" : (y % 100 === 0 ? " (a century year not divisible by 400)" : " (not divisible by 4)")) + ".", [], "date"); }
    return null;
  }

  /* ------------------------------------------------------------ number words */
  var ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  var TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  var SCALES = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
  function below1000(n) {
    var parts = [];
    if (n >= 100) { parts.push(ONES[Math.floor(n / 100)] + " hundred"); n %= 100; }
    if (n >= 20) { var t = TENS[Math.floor(n / 10)], o = n % 10; parts.push(o ? t + "-" + ONES[o] : t); }
    else if (n > 0) parts.push(ONES[n]);
    return parts.join(" ");
  }
  function toWords(n) {
    if (!Number.isInteger(n) || Math.abs(n) >= 1e15) return null;
    if (n === 0) return "zero";
    var neg = n < 0; n = Math.abs(n);
    var out = [];
    SCALES.forEach(function (sc) { if (n >= sc[0]) { out.push(below1000(Math.floor(n / sc[0])) + " " + sc[1]); n %= sc[0]; } });
    if (n > 0) out.push(below1000(n));
    return (neg ? "negative " : "") + out.join(" ");
  }
  var ORD_IRR = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
  function ordinalWords(n) {
    var w = toWords(n); if (!w) return null;
    var parts = w.split(/([ -])/), last = parts.length - 1;
    var lw = parts[last];
    if (ORD_IRR[lw]) parts[last] = ORD_IRR[lw];
    else if (/y$/.test(lw)) parts[last] = lw.slice(0, -1) + "ieth";
    else parts[last] = lw + "th";
    return parts.join("");
  }
  var WORD_VAL = {}; ONES.forEach(function (w, i) { WORD_VAL[w] = i; }); TENS.forEach(function (w, i) { if (w) WORD_VAL[w] = i * 10; });
  function fromWords(s) {
    var toks = s.toLowerCase().replace(/-/g, " ").replace(/\band\b/g, " ").split(/\s+/).filter(Boolean), total = 0, cur = 0, neg = false, ok = false;
    for (var i = 0; i < toks.length; i++) {
      var w = toks[i];
      if (w === "negative" || w === "minus") { neg = true; continue; }
      if (WORD_VAL[w] !== undefined) { cur += WORD_VAL[w]; ok = true; }
      else if (w === "hundred") { cur = (cur || 1) * 100; ok = true; }
      else if (w === "thousand" || w === "million" || w === "billion" || w === "trillion") { total += (cur || 1) * { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 }[w]; cur = 0; ok = true; }
      else return null;
    }
    return ok ? (neg ? -1 : 1) * (total + cur) : null;
  }
  function numberWordsQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/^(?:please )?(?:write|spell|say|express|convert|put|give me)(?: out)?(?: the number)? (-?[\d,]+)(?:\s*(?:in|as|into) words?)?$/)) && /words|spell|out/.test(l) || (m = l.match(/^(?:how (?:do you|to|can i) (?:spell|write|say))(?: the number)? (-?[\d,]+)$/)) || (m = l.match(/^(?:what is |what's )?(-?[\d,]+) in words$/)) || (m = l.match(/^spell(?: out)?(?: the number)? (-?[\d,]+)$/))) {
      var n = parseInt(m[1].replace(/,/g, ""), 10), w = toWords(n);
      if (w) return res(w, [], "words");
    }
    if ((m = l.match(/^(?:write|spell|say|convert|express)\s+(\d+)(?:st|nd|rd|th)\s+(?:in|as)\s+words$/)) || (m = l.match(/^(\d+)(?:st|nd|rd|th) in words$/))) { var o = ordinalWords(+m[1]); if (o) return res(o, [], "words"); }
    if ((m = l.match(/^(?:what is the |what's the )?ordinal (?:form )?of (\d+)(?: in words)?$/))) { var o2 = ordinalWords(+m[1]); if (o2) return res(o2, [], "words"); }
    if ((m = l.match(/^(?:convert|change|write|turn|what number is|what is|what's)\s+["']?([a-z][a-z\s-]*?)["']?(?:\s+(?:to|into|as|in)\s+(?:a\s+)?(?:number|digits|numerals?|figures?))?$/)) && /^[a-z][a-z\s-]*$/.test(m[1]) && /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/.test(m[1]) && (/\b(?:number|digits|numerals?|figures?)\b/.test(l) || /^what (?:number )?is\b/.test(l))) {
      var v = fromWords(m[1].replace(/^(?:the )?(?:number )?/, "")); if (v !== null) return res(String(v), [], "words");
    }
    return null;
  }

  /* -------------------------------------------------------------- money */
  function numIn(s) { return parseFloat(String(s).replace(/[,$]/g, "")); }
  function financeQ(text) {
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/\bpercent(?:age)? (increase|decrease|change)\b[^0-9$]*\$?(\d[\d.,]*)\s*(?:to|and|->)\s*\$?(\d[\d.,]*)/)) || (m = l.match(/\bby what percent(?:age)? (?:did|does|will)[^?]*?(?:increase|decrease|change|rise|fall|grow|drop)[^0-9$]*\$?(\d[\d.,]*)\s*(?:to|and|->)\s*\$?(\d[\d.,]*)/) && [null, "change", RegExp.$1, RegExp.$2]) || (m = l.match(/\b(?:increase|decrease|change|rise|drop|fall|growth)\b[^0-9$]*from\s*\$?(\d[\d.,]*)\s*to\s*\$?(\d[\d.,]*)/) && /percent|%/.test(l) && [null, "change", RegExp.$1, RegExp.$2])) {
      var a = numIn(m[2]), b = numIn(m[3]), p = (b - a) / a * 100;
      if (a === 0) return null;
      return res(fmt(Math.abs(p), 2) + "% " + (p >= 0 ? "increase" : "decrease") + " (" + fmt(a) + " to " + fmt(b) + ").", [(b - a) + " ÷ " + a + " × 100 = " + fmt(p, 2) + "%"], "money");
    }
    if ((m = l.match(/^(\d[\d.,]*)\s+is\s+what\s+percent(?:age)?\s+of\s+(\d[\d.,]*)$/)) || (m = l.match(/^what\s+percent(?:age)?\s+of\s+(\d[\d.,]*)\s+is\s+(\d[\d.,]*)$/) && [null, RegExp.$2, RegExp.$1])) {
      var x = numIn(m[1]), y = numIn(m[2]); if (y === 0) return null;
      return res(fmt(x / y * 100, 2) + "%", [x + " ÷ " + y + " × 100"], "money");
    }
    if ((m = l.match(/^(?:what is |what's |calculate )?(?:the )?(?:increase|raise|add)\s+\$?(\d[\d.,]*)\s+by\s+(\d+(?:\.\d+)?)\s*%$/)) || (m = l.match(/^(?:increase|raise)\s+\$?(\d[\d.,]*)\s+by\s+(\d+(?:\.\d+)?)\s*%$/))) { var v = numIn(m[1]) * (1 + +m[2] / 100); return res(fmt(v, 2), [], "money"); }
    if ((m = l.match(/^(?:decrease|reduce|lower|cut)\s+\$?(\d[\d.,]*)\s+by\s+(\d+(?:\.\d+)?)\s*%$/))) { var v2 = numIn(m[1]) * (1 - +m[2] / 100); return res(fmt(v2, 2), [], "money"); }
    if ((m = l.match(/^(?:what is |what's |calculate |find )?(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+\$?(\d[\d.,]*)$/))) { var pv = +m[1] / 100 * numIn(m[2]); return res(fmt(pv, 4), [m[1] + "% × " + m[2]], "money"); }
    /* interest */
    var pm = l.match(/\$?(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?)?/), rm = l.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/), tm = l.match(/(?:for|over|after)\s+(\d+(?:\.\d+)?)\s*(years?|months?)/);
    if (/\binterest\b/.test(l) && pm && rm && tm) {
      var P = numIn(pm[1]), r = +rm[1] / 100, yrs = +tm[1] / (/month/.test(tm[2]) ? 12 : 1);
      if (/\bcompound/.test(l)) {
        var nPer = /\bmonthly\b/.test(l) ? 12 : (/\bquarterly\b/.test(l) ? 4 : (/\b(?:semi-?annual(?:ly)?|twice a year|half-yearly)\b/.test(l) ? 2 : (/\bdaily\b/.test(l) ? 365 : 1)));
        var A = P * Math.pow(1 + r / nPer, nPer * yrs);
        return res(money(A - P) + " of interest, for a total of " + money(A) + ".", ["A = P(1 + r/n)^(nt) with n = " + nPer], "money");
      }
      var I = P * r * yrs;
      return res(money(I) + " of simple interest, for a total of " + money(P + I) + ".", ["I = P × r × t = " + P + " × " + r + " × " + fmt(yrs, 3)], "money");
    }
    return null;
  }

  /* ---------------------------------------------------------- statistics */
  function listNums(text) {
    var m = text.match(/-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?|\s+and\s+-?\d+(?:\.\d+)?)+/);
    return m ? m[0].split(/\s*,\s*|\s+and\s+/).map(Number) : null;
  }
  function statsQ(text) {
    var t = clean(text), l = t.toLowerCase().replace(/[?.!]+$/, ""), m, ns;
    if ((m = l.match(/\b(population |sample )?(standard deviation|variance)\b/)) && (ns = listNums(t)) && ns.length >= 2) {
      var mean = ns.reduce(function (a, b) { return a + b; }, 0) / ns.length, ss = ns.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0);
      var sample = /sample/.test(m[1] || "") || /\bsample\b/.test(l), v = ss / (sample ? ns.length - 1 : ns.length);
      return res(fmt(m[2] === "variance" ? v : Math.sqrt(v), 4) + " (" + (sample ? "sample" : "population") + " " + m[2] + "; mean " + fmt(mean) + ").", [], "stats");
    }
    if ((m = l.match(/\bz[- ]?score\b[^0-9-]*(-?\d+(?:\.\d+)?)[^0-9-]+mean[^0-9-]*(-?\d+(?:\.\d+)?)[^0-9-]+(?:standard deviation|sd|std)[^0-9-]*(\d+(?:\.\d+)?)/))) {
      return res(fmt((+m[1] - +m[2]) / +m[3], 3), ["(x − mean) ÷ sd"], "stats");
    }
    return null;
  }

  /* ----------------------------------------------------------- phrasebook */
  var LANG = { spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt", japanese: "ja", chinese: "zh", mandarin: "zh", russian: "ru", arabic: "ar", hindi: "hi", korean: "ko", dutch: "nl", swedish: "sv", latin: "la", greek: "el", turkish: "tr" };
  var LNAME = { es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", ja: "Japanese", zh: "Chinese (Mandarin)", ru: "Russian", ar: "Arabic", hi: "Hindi", ko: "Korean", nl: "Dutch", sv: "Swedish", la: "Latin", el: "Greek", tr: "Turkish" };
  /* concept: [en, es, fr, de, it, pt, ja, zh, ru, ar, hi, ko, nl, sv] with the romanisation in brackets where the script differs */
  var PHRASES = [
    ["hello", "hola", "bonjour", "hallo", "ciao", "olá", "こんにちは (konnichiwa)", "你好 (nǐ hǎo)", "здравствуйте (zdravstvuyte)", "مرحبا (marhaba)", "नमस्ते (namaste)", "안녕하세요 (annyeonghaseyo)", "hallo", "hej"],
    ["goodbye", "adiós", "au revoir", "auf Wiedersehen", "arrivederci", "adeus", "さようなら (sayōnara)", "再见 (zàijiàn)", "до свидания (do svidaniya)", "مع السلامة (ma'a as-salāma)", "अलविदा (alvida)", "안녕히 가세요 (annyeonghi gaseyo)", "tot ziens", "hejdå"],
    ["thank you", "gracias", "merci", "danke", "grazie", "obrigado", "ありがとう (arigatō)", "谢谢 (xièxie)", "спасибо (spasibo)", "شكرا (shukran)", "धन्यवाद (dhanyavād)", "감사합니다 (gamsahamnida)", "dank je", "tack"],
    ["please", "por favor", "s'il vous plaît", "bitte", "per favore", "por favor", "お願いします (onegai shimasu)", "请 (qǐng)", "пожалуйста (pozhaluysta)", "من فضلك (min fadlak)", "कृपया (kripayā)", "부탁합니다 (butakamnida)", "alstublieft", "snälla"],
    ["yes", "sí", "oui", "ja", "sì", "sim", "はい (hai)", "是 (shì)", "да (da)", "نعم (na'am)", "हाँ (hāṁ)", "네 (ne)", "ja", "ja"],
    ["no", "no", "non", "nein", "no", "não", "いいえ (iie)", "不 (bù)", "нет (net)", "لا (lā)", "नहीं (nahīṁ)", "아니요 (aniyo)", "nee", "nej"],
    ["good morning", "buenos días", "bonjour", "guten Morgen", "buongiorno", "bom dia", "おはよう (ohayō)", "早上好 (zǎoshang hǎo)", "доброе утро (dobroye utro)", "صباح الخير (sabāḥ al-khayr)", "सुप्रभात (suprabhāt)", "좋은 아침 (joeun achim)", "goedemorgen", "god morgon"],
    ["good night", "buenas noches", "bonne nuit", "gute Nacht", "buona notte", "boa noite", "おやすみ (oyasumi)", "晚安 (wǎn'ān)", "спокойной ночи (spokoynoy nochi)", "تصبح على خير (tuṣbiḥ ʿalā khayr)", "शुभ रात्रि (śubh rātri)", "안녕히 주무세요 (annyeonghi jumuseyo)", "goedenacht", "god natt"],
    ["i love you", "te quiero", "je t'aime", "ich liebe dich", "ti amo", "eu te amo", "愛してる (aishiteru)", "我爱你 (wǒ ài nǐ)", "я тебя люблю (ya tebya lyublyu)", "أحبك (uḥibbuka)", "मैं तुमसे प्यार करता हूँ (main tumse pyār kartā hūṁ)", "사랑해요 (saranghaeyo)", "ik hou van je", "jag älskar dig"],
    ["how are you", "¿cómo estás?", "comment allez-vous ?", "wie geht's?", "come stai?", "como vai?", "お元気ですか (ogenki desu ka)", "你好吗 (nǐ hǎo ma)", "как дела? (kak dela)", "كيف حالك؟ (kayfa ḥāluk)", "आप कैसे हैं? (āp kaise haiṁ)", "어떻게 지내세요? (eotteoke jinaeseyo)", "hoe gaat het?", "hur mår du?"],
    ["sorry", "lo siento", "désolé", "es tut mir leid", "mi dispiace", "desculpe", "ごめんなさい (gomen nasai)", "对不起 (duìbuqǐ)", "извините (izvinite)", "آسف (āsif)", "माफ़ कीजिए (māf kījie)", "미안합니다 (mianhamnida)", "sorry", "förlåt"],
    ["excuse me", "perdón", "excusez-moi", "entschuldigung", "scusi", "com licença", "すみません (sumimasen)", "不好意思 (bù hǎoyìsi)", "извините (izvinite)", "عفوا (ʿafwan)", "क्षमा कीजिए (kṣamā kījie)", "실례합니다 (sillyehamnida)", "pardon", "ursäkta"],
    ["you're welcome", "de nada", "de rien", "bitte schön", "prego", "de nada", "どういたしまして (dō itashimashite)", "不客气 (bù kèqi)", "пожалуйста (pozhaluysta)", "عفوا (ʿafwan)", "आपका स्वागत है (āpkā svāgat hai)", "천만에요 (cheonmaneyo)", "graag gedaan", "varsågod"],
    ["cheers", "salud", "santé", "prost", "salute", "saúde", "乾杯 (kanpai)", "干杯 (gānbēi)", "за здоровье (za zdorovye)", "في صحتك (fī ṣiḥḥatik)", "चियर्स (chiyars)", "건배 (geonbae)", "proost", "skål"],
    ["water", "agua", "eau", "Wasser", "acqua", "água", "水 (mizu)", "水 (shuǐ)", "вода (voda)", "ماء (māʾ)", "पानी (pānī)", "물 (mul)", "water", "vatten"],
    ["cat", "gato", "chat", "Katze", "gatto", "gato", "猫 (neko)", "猫 (māo)", "кошка (koshka)", "قطة (qiṭṭa)", "बिल्ली (billī)", "고양이 (goyangi)", "kat", "katt"],
    ["dog", "perro", "chien", "Hund", "cane", "cachorro", "犬 (inu)", "狗 (gǒu)", "собака (sobaka)", "كلب (kalb)", "कुत्ता (kuttā)", "개 (gae)", "hond", "hund"],
    ["friend", "amigo", "ami", "Freund", "amico", "amigo", "友達 (tomodachi)", "朋友 (péngyou)", "друг (drug)", "صديق (ṣadīq)", "दोस्त (dost)", "친구 (chingu)", "vriend", "vän"],
    ["book", "libro", "livre", "Buch", "libro", "livro", "本 (hon)", "书 (shū)", "книга (kniga)", "كتاب (kitāb)", "किताब (kitāb)", "책 (chaek)", "boek", "bok"],
    ["house", "casa", "maison", "Haus", "casa", "casa", "家 (ie)", "房子 (fángzi)", "дом (dom)", "بيت (bayt)", "घर (ghar)", "집 (jip)", "huis", "hus"],
    ["food", "comida", "nourriture", "Essen", "cibo", "comida", "食べ物 (tabemono)", "食物 (shíwù)", "еда (yeda)", "طعام (ṭaʿām)", "खाना (khānā)", "음식 (eumsik)", "eten", "mat"],
    ["welcome", "bienvenido", "bienvenue", "willkommen", "benvenuto", "bem-vindo", "ようこそ (yōkoso)", "欢迎 (huānyíng)", "добро пожаловать (dobro pozhalovat)", "أهلا وسهلا (ahlan wa sahlan)", "स्वागत है (svāgat hai)", "환영합니다 (hwanyeonghamnida)", "welkom", "välkommen"],
    ["i don't understand", "no entiendo", "je ne comprends pas", "ich verstehe nicht", "non capisco", "não entendo", "わかりません (wakarimasen)", "我不明白 (wǒ bù míngbai)", "я не понимаю (ya ne ponimayu)", "لا أفهم (lā afham)", "मुझे समझ नहीं आया (mujhe samajh nahīṁ āyā)", "이해가 안 돼요 (ihaega an dwaeyo)", "ik begrijp het niet", "jag förstår inte"],
    ["where is the bathroom", "¿dónde está el baño?", "où sont les toilettes ?", "wo ist die Toilette?", "dov'è il bagno?", "onde fica o banheiro?", "トイレはどこですか (toire wa doko desu ka)", "洗手间在哪里 (xǐshǒujiān zài nǎlǐ)", "где туалет? (gde tualet)", "أين الحمام؟ (ayna al-ḥammām)", "शौचालय कहाँ है? (śaucālay kahāṁ hai)", "화장실이 어디예요? (hwajangsiri eodiyeyo)", "waar is het toilet?", "var är toaletten?"],
    ["help", "ayuda", "aide", "Hilfe", "aiuto", "ajuda", "助けて (tasukete)", "帮助 (bāngzhù)", "помощь (pomoshch)", "مساعدة (musāʿada)", "मदद (madad)", "도와주세요 (dowajuseyo)", "hulp", "hjälp"],
    ["one", "uno", "un", "eins", "uno", "um", "一 (ichi)", "一 (yī)", "один (odin)", "واحد (wāḥid)", "एक (ek)", "하나 (hana)", "een", "ett"],
    ["two", "dos", "deux", "zwei", "due", "dois", "二 (ni)", "二 (èr)", "два (dva)", "اثنان (ithnān)", "दो (do)", "둘 (dul)", "twee", "två"],
    ["three", "tres", "trois", "drei", "tre", "três", "三 (san)", "三 (sān)", "три (tri)", "ثلاثة (thalātha)", "तीन (tīn)", "셋 (set)", "drie", "tre"],
    ["four", "cuatro", "quatre", "vier", "quattro", "quatro", "四 (shi/yon)", "四 (sì)", "четыре (chetyre)", "أربعة (arbaʿa)", "चार (cār)", "넷 (net)", "vier", "fyra"],
    ["five", "cinco", "cinq", "fünf", "cinque", "cinco", "五 (go)", "五 (wǔ)", "пять (pyat)", "خمسة (khamsa)", "पाँच (pāñc)", "다섯 (daseot)", "vijf", "fem"],
    ["six", "seis", "six", "sechs", "sei", "seis", "六 (roku)", "六 (liù)", "шесть (shest)", "ستة (sitta)", "छह (chah)", "여섯 (yeoseot)", "zes", "sex"],
    ["seven", "siete", "sept", "sieben", "sette", "sete", "七 (nana/shichi)", "七 (qī)", "семь (sem)", "سبعة (sabʿa)", "सात (sāt)", "일곱 (ilgop)", "zeven", "sju"],
    ["eight", "ocho", "huit", "acht", "otto", "oito", "八 (hachi)", "八 (bā)", "восемь (vosem)", "ثمانية (thamāniya)", "आठ (āṭh)", "여덟 (yeodeol)", "acht", "åtta"],
    ["nine", "nueve", "neuf", "neun", "nove", "nove", "九 (kyū)", "九 (jiǔ)", "девять (devyat)", "تسعة (tisʿa)", "नौ (nau)", "아홉 (ahop)", "negen", "nio"],
    ["ten", "diez", "dix", "zehn", "dieci", "dez", "十 (jū)", "十 (shí)", "десять (desyat)", "عشرة (ʿashara)", "दस (das)", "열 (yeol)", "tien", "tio"]
  ];
  var LANG_ORDER = ["en", "es", "fr", "de", "it", "pt", "ja", "zh", "ru", "ar", "hi", "ko", "nl", "sv"];
  function stripPunct(s) { return s.toLowerCase().replace(/[¿?¡!.,]/g, "").replace(/\s*\([^)]*\)\s*/g, "").replace(/\s+/g, " ").trim(); }
  /* common words: en | es | fr | de | it | pt */
  var WORDLIST = {};
  [
    ["cat","gato","chat","Katze","gatto","gato"],
    ["dog","perro","chien","Hund","cane","cão"],
    ["house","casa","maison","Haus","casa","casa"],
    ["water","agua","eau","Wasser","acqua","água"],
    ["food","comida","nourriture","Essen","cibo","comida"],
    ["bread","pan","pain","Brot","pane","pão"],
    ["milk","leche","lait","Milch","latte","leite"],
    ["coffee","café","café","Kaffee","caffè","café"],
    ["tea","té","thé","Tee","tè","chá"],
    ["apple","manzana","pomme","Apfel","mela","maçã"],
    ["book","libro","livre","Buch","libro","livro"],
    ["friend","amigo","ami","Freund","amico","amigo"],
    ["family","familia","famille","Familie","famiglia","família"],
    ["mother","madre","mère","Mutter","madre","mãe"],
    ["father","padre","père","Vater","padre","pai"],
    ["brother","hermano","frère","Bruder","fratello","irmão"],
    ["sister","hermana","sœur","Schwester","sorella","irmã"],
    ["boy","chico","garçon","Junge","ragazzo","menino"],
    ["girl","chica","fille","Mädchen","ragazza","menina"],
    ["man","hombre","homme","Mann","uomo","homem"],
    ["woman","mujer","femme","Frau","donna","mulher"],
    ["child","niño","enfant","Kind","bambino","criança"],
    ["day","día","jour","Tag","giorno","dia"],
    ["night","noche","nuit","Nacht","notte","noite"],
    ["sun","sol","soleil","Sonne","sole","sol"],
    ["moon","luna","lune","Mond","luna","lua"],
    ["star","estrella","étoile","Stern","stella","estrela"],
    ["sky","cielo","ciel","Himmel","cielo","céu"],
    ["tree","árbol","arbre","Baum","albero","árvore"],
    ["flower","flor","fleur","Blume","fiore","flor"],
    ["car","coche","voiture","Auto","macchina","carro"],
    ["train","tren","train","Zug","treno","trem"],
    ["school","escuela","école","Schule","scuola","escola"],
    ["city","ciudad","ville","Stadt","città","cidade"],
    ["country","país","pays","Land","paese","país"],
    ["love","amor","amour","Liebe","amore","amor"],
    ["time","tiempo","temps","Zeit","tempo","tempo"],
    ["year","año","an","Jahr","anno","ano"],
    ["money","dinero","argent","Geld","denaro","dinheiro"],
    ["work","trabajo","travail","Arbeit","lavoro","trabalho"],
    ["red","rojo","rouge","rot","rosso","vermelho"],
    ["blue","azul","bleu","blau","blu","azul"],
    ["green","verde","vert","grün","verde","verde"],
    ["yellow","amarillo","jaune","gelb","giallo","amarelo"],
    ["black","negro","noir","schwarz","nero","preto"],
    ["white","blanco","blanc","weiß","bianco","branco"],
    ["big","grande","grand","groß","grande","grande"],
    ["small","pequeño","petit","klein","piccolo","pequeno"],
    ["good","bueno","bon","gut","buono","bom"],
    ["bad","malo","mauvais","schlecht","cattivo","mau"],
    ["hot","caliente","chaud","heiß","caldo","quente"],
    ["cold","frío","froid","kalt","freddo","frio"],
    ["happy","feliz","heureux","glücklich","felice","feliz"],
    ["sad","triste","triste","traurig","triste","triste"],
    ["one","uno","un","eins","uno","um"],
    ["two","dos","deux","zwei","due","dois"],
    ["three","tres","trois","drei","tre","três"],
    ["four","cuatro","quatre","vier","quattro","quatro"],
    ["five","cinco","cinq","fünf","cinque","cinco"],
    ["six","seis","six","sechs","sei","seis"],
    ["seven","siete","sept","sieben","sette","sete"],
    ["eight","ocho","huit","acht","otto","oito"],
    ["nine","nueve","neuf","neun","nove","nove"],
    ["ten","diez","dix","zehn","dieci","dez"],
    ["eat","comer","manger","essen","mangiare","comer"],
    ["drink","beber","boire","trinken","bere","beber"],
    ["sleep","dormir","dormir","schlafen","dormire","dormir"],
    ["run","correr","courir","laufen","correre","correr"],
    ["walk","caminar","marcher","gehen","camminare","andar"],
    ["read","leer","lire","lesen","leggere","ler"],
    ["write","escribir","écrire","schreiben","scrivere","escrever"],
    ["speak","hablar","parler","sprechen","parlare","falar"],
    ["see","ver","voir","sehen","vedere","ver"],
    ["go","ir","aller","gehen","andare","ir"],
    ["come","venir","venir","kommen","venire","vir"],
    ["have","tener","avoir","haben","avere","ter"],
    ["be","ser","être","sein","essere","ser"],
    ["want","querer","vouloir","wollen","volere","querer"],
    ["know","saber","savoir","wissen","sapere","saber"],
    ["morning","mañana","matin","Morgen","mattina","manhã"],
    ["evening","tarde","soir","Abend","sera","noite"],
    ["today","hoy","aujourd'hui","heute","oggi","hoje"],
    ["tomorrow","mañana","demain","morgen","domani","amanhã"],
    ["yesterday","ayer","hier","gestern","ieri","ontem"],
    ["yes","sí","oui","ja","sì","sim"],
    ["no","no","non","nein","no","não"],
    ["please","por favor","s'il vous plaît","bitte","per favore","por favor"],
    ["sorry","lo siento","désolé","Entschuldigung","scusa","desculpe"],
    ["welcome","bienvenido","bienvenue","willkommen","benvenuto","bem-vindo"],
    ["help","ayuda","aide","Hilfe","aiuto","ajuda"],
    ["bird","pájaro","oiseau","Vogel","uccello","pássaro"],
    ["fish","pez","poisson","Fisch","pesce","peixe"],
    ["horse","caballo","cheval","Pferd","cavallo","cavalo"],
    ["cow","vaca","vache","Kuh","mucca","vaca"],
    ["pig","cerdo","cochon","Schwein","maiale","porco"],
    ["rain","lluvia","pluie","Regen","pioggia","chuva"],
    ["snow","nieve","neige","Schnee","neve","neve"],
    ["wind","viento","vent","Wind","vento","vento"],
    ["fire","fuego","feu","Feuer","fuoco","fogo"],
    ["earth","tierra","terre","Erde","terra","terra"],
    ["sea","mar","mer","Meer","mare","mar"],
    ["mountain","montaña","montagne","Berg","montagna","montanha"],
    ["river","río","rivière","Fluss","fiume","rio"],
    ["window","ventana","fenêtre","Fenster","finestra","janela"],
    ["door","puerta","porte","Tür","porta","porta"],
    ["table","mesa","table","Tisch","tavolo","mesa"],
    ["chair","silla","chaise","Stuhl","sedia","cadeira"],
    ["bed","cama","lit","Bett","letto","cama"],
    ["room","habitación","chambre","Zimmer","stanza","quarto"],
    ["street","calle","rue","Straße","strada","rua"],
    ["shop","tienda","magasin","Geschäft","negozio","loja"],
    ["doctor","médico","médecin","Arzt","medico","médico"],
    ["teacher","profesor","professeur","Lehrer","insegnante","professor"],
    ["language","idioma","langue","Sprache","lingua","língua"],
    ["name","nombre","nom","Name","nome","nome"],
    ["life","vida","vie","Leben","vita","vida"],
    ["world","mundo","monde","Welt","mondo","mundo"],
    ["heart","corazón","cœur","Herz","cuore","coração"],
    ["hand","mano","main","Hand","mano","mão"],
    ["head","cabeza","tête","Kopf","testa","cabeça"],
    ["eye","ojo","œil","Auge","occhio","olho"],
    ["music","música","musique","Musik","musica","música"],
    ["song","canción","chanson","Lied","canzone","canção"],
    ["game","juego","jeu","Spiel","gioco","jogo"],
    ["phone","teléfono","téléphone","Telefon","telefono","telefone"],
    ["computer","ordenador","ordinateur","Computer","computer","computador"],
    ["rabbit","conejo","lapin","Kaninchen","coniglio","coelho"],
    ["bear","oso","ours","Bär","orso","urso"],
    ["butterfly","mariposa","papillon","Schmetterling","farfalla","borboleta"],
    ["bee","abeja","abeille","Biene","ape","abelha"],
    ["egg","huevo","œuf","Ei","uovo","ovo"],
    ["cheese","queso","fromage","Käse","formaggio","queijo"],
    ["rice","arroz","riz","Reis","riso","arroz"],
    ["salt","sal","sel","Salz","sale","sal"],
    ["sugar","azúcar","sucre","Zucker","zucchero","açúcar"],
    ["wine","vino","vin","Wein","vino","vinho"],
    ["beer","cerveza","bière","Bier","birra","cerveja"],
    ["hospital","hospital","hôpital","Krankenhaus","ospedale","hospital"],
    ["airport","aeropuerto","aéroport","Flughafen","aeroporto","aeroporto"],
    ["beautiful","hermoso","beau","schön","bello","bonito"],
    ["thank you very much","muchas gracias","merci beaucoup","vielen Dank","grazie mille","muito obrigado"]
  ].forEach(function (r) { WORDLIST[r[0]] = { es: r[1], fr: r[2], de: r[3], it: r[4], pt: r[5] }; });
  function wordFor(word, code) {
    var w = word.toLowerCase().replace(/^(?:a|an|the|to)\s+/, "");
    var e = WORDLIST[w] || WORDLIST[w.replace(/ies$/, "y")] || WORDLIST[w.replace(/s$/, "")];
    return e && e[code] ? e[code] : null;
  }
  function translateQ(text) {
    var l = clean(text).replace(/[?.!]+$/, ""), low = l.toLowerCase(), m;
    var forward = low.match(/^(?:how (?:do|would|can) (?:you|i) say|what(?:'s| is) the word for|translate|say|what is|what's|how to say)\s+["']?(.+?)["']?\s+(?:in|into|to)\s+([a-z]+)$/);
    var viaWord = low.match(/^(?:what(?:'s| is) the|give me the|tell me the)\s+([a-z]+)\s+(?:word|translation)\s+for\s+["']?(.+?)["']?$/);
    if (viaWord && LANG[viaWord[1]]) forward = [null, viaWord[2], viaWord[1]];
    if (forward && LANG[forward[2]]) {
      var key = stripPunct(forward[1]), code = LANG[forward[2]], col = LANG_ORDER.indexOf(code);
      for (var i = 0; i < PHRASES.length; i++) if (stripPunct(PHRASES[i][0]) === key) {
        if (col < 0) return null;
        return res(PHRASES[i][col], [], "translate");
      }
      var wf = wordFor(forward[1], code);
      if (wf) return res(wf, [], "translate");
      if (key.split(" ").length <= 3 && !/\d/.test(key)) return res("I don't have \u201c" + forward[1] + "\u201d in my " + (LNAME[code] || forward[2]) + " phrasebook yet, and I won't guess a translation.", [], "translate", 0.5);
      return null;
    }
    var back = low.match(/^(?:what does|what is the meaning of|what's the meaning of|translate)\s+["']?(.+?)["']?\s+(?:mean|in english|to english)(?: in english)?$/) || low.match(/^what does ["']?(.+?)["']? mean$/);
    if (back) {
      var k = stripPunct(back[1]);
      for (var j = 0; j < PHRASES.length; j++) for (var c = 1; c < PHRASES[j].length; c++) {
        if (stripPunct(PHRASES[j][c]) === k || stripPunct(PHRASES[j][c].replace(/^.*\(/, "").replace(/\)$/, "")) === k) {
          return res("\"" + back[1] + "\" is " + (LNAME[LANG_ORDER[c]] || "foreign") + " for \"" + PHRASES[j][0] + "\".", [], "translate");
        }
      }
    }
    return null;
  }

  /* ------------------------------------------------------------ summaries */
  var SUM_STOP = /^(?:the|a|an|of|to|in|on|at|by|for|with|from|as|is|are|was|were|be|been|it|its|this|that|these|those|and|or|but|not|so|if|then|than|he|she|they|them|his|her|their|we|you|i|my|our|your|which|who|whom|has|have|had|do|does|did|will|would|can|could|may|might|also|very|just|into|about|over|after|before|there|here)$/;
  function summarizeQ(text) {
    var m = clean(text).match(/^(?:please )?(?:summari[sz]e|sum up|tl;?dr|give me (?:a |the )?(?:short |quick |brief )?summary of|shorten|what is the main idea of|what's the main idea of)\s*[:\-]?\s*(.+)$/i);
    if (!m) return null;
    var body = m[1].replace(/^(?:the following|this)(?: text| passage| paragraph)?\s*[:\-]?\s*/i, "").replace(/^["']|["']$/g, "");
    var sents = body.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 3; });
    if (sents.length < 2) return null;
    var freq = {}, words = function (s) { return s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2 && !SUM_STOP.test(w); }); };
    sents.forEach(function (s) { words(s).forEach(function (w) { freq[w] = (freq[w] || 0) + 1; }); });
    var scored = sents.map(function (s, i) {
      var ws = words(s), sc = 0; ws.forEach(function (w) { sc += freq[w]; });
      sc = ws.length ? sc / Math.pow(ws.length, 0.7) : 0;
      if (i === 0) sc *= 1.25;
      return { s: s, i: i, sc: sc };
    });
    var k = sents.length <= 4 ? 1 : (sents.length <= 8 ? 2 : 3);
    var pick = scored.slice().sort(function (a, b) { return b.sc - a.sc; }).slice(0, k).sort(function (a, b) { return a.i - b.i; });
    return res(pick.map(function (p) { return p.s; }).join(" "), [], "summary", 0.7);
  }

  /* -------------------------------------------------------------- letters */
  function arrangementsQ(text) {
    var t0 = clean(text), l = t0.toLowerCase().replace(/[?.!]+$/, ""), m, w = null;
    if (!/\b(?:ways|arrangements?|permutations?|orders?|anagrams?|rearrange\w*|arrange\w*)\b/.test(l) || !/\b(?:letters?|word|permutations?|anagrams?)\b/.test(l)) return null;
    if ((m = t0.match(/\b(?:letters?|word|permutations|anagrams)\s+(?:of|in|from)?\s*(?:the\s+)?(?:letters?\s+|word\s+)?["']?([A-Za-z]{2,12})["']?\s*(?:\b(?:be|can|are|is|if)\b[^?]*)?[?.!]*$/)) && !/^(?:the|word|letters|word|are|can)$/i.test(m[1])) w = m[1].toLowerCase();
    if (!w && (m = t0.match(/["']([A-Za-z]{2,12})["']/))) w = m[1].toLowerCase();
    if (!w && (m = t0.match(/\b([A-Z]{2,12})\b/))) w = m[1].toLowerCase();
    if (!w || w.length < 2) return null;
    var counts = {}; w.split("").forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    var fact = function (n) { var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; };
    var total = fact(w.length); Object.keys(counts).forEach(function (c) { total /= fact(counts[c]); });
    var rep = Object.keys(counts).filter(function (c) { return counts[c] > 1; });
    var extra = "";
    if (total <= 24) { var seen = {}, outl = []; (function perm(pre, rest) { if (!rest.length) { if (!seen[pre]) { seen[pre] = 1; outl.push(pre.toUpperCase()); } return; } for (var i = 0; i < rest.length; i++) perm(pre + rest[i], rest.slice(0, i) + rest.slice(i + 1)); })("", w); extra = " They are: " + outl.join(", ") + "."; }
    return res(total + " different arrangements of the letters in " + w.toUpperCase() + "." + extra, [w.length + "!" + (rep.length ? " ÷ " + rep.map(function (c) { return counts[c] + "!"; }).join(" × ") : "")], "letters");
  }

  /* ------------------------------------------------------------ chemistry */
  var MASS = { H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Ag: 107.87, Cd: 112.41, Sn: 118.71, Sb: 121.76, I: 126.90, Xe: 131.29, Cs: 132.91, Ba: 137.33, W: 183.84, Pt: 195.08, Au: 196.97, Hg: 200.59, Pb: 207.2, U: 238.03 };
  var COMPOUNDS = { water: "H2O", "carbon dioxide": "CO2", "table salt": "NaCl", salt: "NaCl", "sodium chloride": "NaCl", glucose: "C6H12O6", sugar: "C12H22O11", sucrose: "C12H22O11", ammonia: "NH3", methane: "CH4", "sulfuric acid": "H2SO4", "sulphuric acid": "H2SO4", "hydrochloric acid": "HCl", "nitric acid": "HNO3", ethanol: "C2H6O", alcohol: "C2H6O", oxygen: "O2", hydrogen: "H2", nitrogen: "N2", ozone: "O3", "carbon monoxide": "CO", "hydrogen peroxide": "H2O2", "baking soda": "NaHCO3", "sodium bicarbonate": "NaHCO3", "calcium carbonate": "CaCO3", limestone: "CaCO3", "sodium hydroxide": "NaOH", propane: "C3H8", butane: "C4H10", benzene: "C6H6", acetone: "C3H6O", "acetic acid": "C2H4O2", vinegar: "C2H4O2", "magnesium oxide": "MgO", "calcium hydroxide": "Ca(OH)2", "potassium chloride": "KCl", "silver nitrate": "AgNO3", "iron oxide": "Fe2O3", rust: "Fe2O3", "carbon tetrachloride": "CCl4", "sulfur dioxide": "SO2", "nitrogen dioxide": "NO2", urea: "CH4N2O", caffeine: "C8H10N4O2", aspirin: "C9H8O4" };
  var ELEMENT_NAMES = { hydrogen: "H", helium: "He", lithium: "Li", carbon: "C", nitrogen: "N", oxygen: "O", fluorine: "F", neon: "Ne", sodium: "Na", magnesium: "Mg", aluminum: "Al", aluminium: "Al", silicon: "Si", phosphorus: "P", sulfur: "S", sulphur: "S", chlorine: "Cl", argon: "Ar", potassium: "K", calcium: "Ca", iron: "Fe", copper: "Cu", zinc: "Zn", silver: "Ag", gold: "Au", mercury: "Hg", lead: "Pb", tin: "Sn", iodine: "I", uranium: "U", bromine: "Br" };
  function parseFormula(f) {
    var i = 0;
    function parseGroup() {
      var counts = {};
      while (i < f.length && f[i] !== ")") {
        if (f[i] === "(") {
          i++; var inner = parseGroup(); i++;
          var mm = f.slice(i).match(/^\d+/), mult = mm ? +mm[0] : 1; if (mm) i += mm[0].length;
          Object.keys(inner).forEach(function (k) { counts[k] = (counts[k] || 0) + inner[k] * mult; });
        } else {
          var em = f.slice(i).match(/^[A-Z][a-z]?/);
          if (!em || MASS[em[0]] === undefined) throw new Error("element");
          i += em[0].length;
          var nm = f.slice(i).match(/^\d+/), n = nm ? +nm[0] : 1; if (nm) i += nm[0].length;
          counts[em[0]] = (counts[em[0]] || 0) + n;
        }
      }
      return counts;
    }
    var out = parseGroup();
    if (i < f.length) throw new Error("paren");
    return out;
  }
  function molarMass(counts) { return Object.keys(counts).reduce(function (a, k) { return a + MASS[k] * counts[k]; }, 0); }
  function chemQ(text) {
    var l = clean(text).replace(/[?.!]+$/, ""), low = l.toLowerCase(), m, f, name;
    if ((m = low.match(/\b(?:molar mass|molecular (?:mass|weight)|molecular mass|formula (?:mass|weight)|mass of one mole)\s+(?:of|for)\s+(?:an? |the )?(.+)$/)) || (m = low.match(/\bhow (?:much|many grams)[^?]*?\bdoes (?:one |1 )?mole of (.+?) (?:weigh|have)\b/)) || (m = low.match(/\bwhat is the (?:mass|weight) of (?:one |1 )mole of (.+)$/))) {
      var subj = m[1].trim();
      f = COMPOUNDS[subj] || ELEMENT_NAMES[subj] || null; name = subj;
      if (!f) { var raw = l.match(/\b(?:of|for)\s+(?:an? |the )?([A-Z][A-Za-z0-9()]*)$/); if (raw) { f = raw[1]; name = raw[1]; } }
      if (!f && ELEMENT_NAMES[subj.replace(/ atom$/, "")]) f = ELEMENT_NAMES[subj.replace(/ atom$/, "")];
      if (!f) return null;
      try { var counts = parseFormula(f), mm = molarMass(counts); return res(fmt(mm, 3) + " g/mol (" + f + ").", [Object.keys(counts).map(function (k) { return counts[k] + " × " + MASS[k]; }).join(" + ")], "chemistry"); } catch (e) { return null; }
    }
    if ((m = low.match(/\bhow many (?:atoms|elements)\b[^?]*?\b(?:are |is )?(?:in|does)\b[^?]*?(?:an? |the |one )?(?:molecule of |formula )?([A-Z][A-Za-z0-9()]*|[a-z ]+?)(?: have| contain)?$/i)) && /atoms/.test(low)) {
      var cand = (l.match(/\b([A-Z][A-Za-z0-9()]{1,})\b\s*(?:molecule)?$/) || [])[1] || COMPOUNDS[m[1].trim().toLowerCase()];
      if (cand) { try { var c2 = parseFormula(cand), tot = Object.keys(c2).reduce(function (a, k) { return a + c2[k]; }, 0); return res(tot + " atoms in one molecule of " + cand + " (" + Object.keys(c2).map(function (k) { return c2[k] + " " + k; }).join(", ") + ").", [], "chemistry"); } catch (e2) { return null; } }
    }
    return null;
  }

  /* -------------------------------------------------------------- physics */
  var QTY = [
    { k: "mass", u: /\b(kg|kilograms?|grams?|g|lbs?|pounds?)\b/, f: { kg: 1, kilogram: 1, kilograms: 1, g: 0.001, gram: 0.001, grams: 0.001, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237 } },
    { k: "velocity", u: /\b(m\/s|km\/h|kph|mph|meters? per second|metres? per second)\b/, f: { "m/s": 1, "km/h": 1 / 3.6, kph: 1 / 3.6, mph: 0.44704, "meters per second": 1, "meter per second": 1, "metres per second": 1, "metre per second": 1 } },
    { k: "acceleration", u: /\b(m\/s\^?2|m\/s²|meters? per second squared)\b/, f: { "m/s^2": 1, "m/s2": 1, "m/s²": 1, "meters per second squared": 1, "meter per second squared": 1 } },
    { k: "force", u: /\b(newtons?|n)\b/, f: { newton: 1, newtons: 1, n: 1 } },
    { k: "energy", u: /\b(joules?|j|kj|kilojoules?)\b/, f: { joule: 1, joules: 1, j: 1, kj: 1000, kilojoule: 1000, kilojoules: 1000 } },
    { k: "power", u: /\b(watts?|w|kw|kilowatts?)\b/, f: { watt: 1, watts: 1, w: 1, kw: 1000, kilowatt: 1000, kilowatts: 1000 } },
    { k: "time", u: /\b(seconds?|s|secs?|minutes?|mins?|hours?|hrs?|h)\b/, f: { second: 1, seconds: 1, s: 1, sec: 1, secs: 1, minute: 60, minutes: 60, min: 60, mins: 60, hour: 3600, hours: 3600, hr: 3600, hrs: 3600, h: 3600 } },
    { k: "distance", u: /\b(m|meters?|metres?|km|kilometers?|kilometres?|cm|centimeters?)\b/, f: { m: 1, meter: 1, meters: 1, metre: 1, metres: 1, km: 1000, kilometer: 1000, kilometers: 1000, kilometre: 1000, kilometres: 1000, cm: 0.01, centimeter: 0.01, centimeters: 0.01 } },
    { k: "voltage", u: /\b(volts?|v)\b/, f: { volt: 1, volts: 1, v: 1 } },
    { k: "current", u: /\b(amps?|amperes?|a|ma|milliamps?)\b/, f: { amp: 1, amps: 1, ampere: 1, amperes: 1, a: 1, ma: 0.001, milliamp: 0.001, milliamps: 0.001 } },
    { k: "resistance", u: /\b(ohms?|Ω)\b/, f: { ohm: 1, ohms: 1, "Ω": 1 } },
    { k: "volume", u: /\b(m3|m\^3|m³|liters?|litres?|l|ml|cm3|cm\^3|cm³)\b/, f: { m3: 1, "m^3": 1, "m³": 1, liter: 0.001, liters: 0.001, litre: 0.001, litres: 0.001, l: 0.001, ml: 1e-6, cm3: 1e-6, "cm^3": 1e-6, "cm³": 1e-6, "cubic centimeters": 1e-6, "cubic centimetres": 1e-6, "cubic meters": 1, "cubic metres": 1 } },
    { k: "area", u: /\b(m2|m\^2|m²|cm2|cm\^2|cm²)\b/, f: { m2: 1, "m^2": 1, "m²": 1, cm2: 1e-4, "cm^2": 1e-4, "cm²": 1e-4 } },
    { k: "pressure", u: /\b(pascals?|pa|kpa)\b/, f: { pascal: 1, pascals: 1, pa: 1, kpa: 1000 } },
    { k: "frequency", u: /\b(hz|hertz|khz)\b/, f: { hz: 1, hertz: 1, khz: 1000 } },
    { k: "wavelength", u: /\b(wavelength)\b/, f: {} }
  ];
  var FORMULAS = [
    { ask: /\bkinetic energy\b/, out: "energy", vars: ["mass", "velocity"], calc: function (v) { return 0.5 * v.mass * v.velocity * v.velocity; }, show: "KE = ½mv²", unit: "J" },
    { ask: /\b(?:gravitational )?potential energy\b/, out: "energy", vars: ["mass", "height"], calc: function (v) { return v.mass * 9.8 * v.height; }, show: "PE = mgh (g = 9.8 m/s²)", unit: "J" },
    { ask: /\bforce\b/, out: "force", vars: ["mass", "acceleration"], calc: function (v) { return v.mass * v.acceleration; }, show: "F = ma", unit: "N" },
    { ask: /\bacceleration\b/, out: "acceleration", vars: ["force", "mass"], calc: function (v) { return v.force / v.mass; }, show: "a = F ÷ m", unit: "m/s²" },
    { ask: /\bacceleration\b/, out: "acceleration", vars: ["velocity", "time"], calc: function (v) { return v.velocity / v.time; }, show: "a = Δv ÷ t", unit: "m/s²" },
    { ask: /\bmomentum\b/, out: "momentum", vars: ["mass", "velocity"], calc: function (v) { return v.mass * v.velocity; }, show: "p = mv", unit: "kg·m/s" },
    { ask: /\bweight\b/, out: "force", vars: ["mass"], calc: function (v) { return v.mass * 9.8; }, show: "W = mg (g = 9.8 m/s²)", unit: "N" },
    { ask: /\b(?:speed|velocity)\b/, out: "velocity", vars: ["distance", "time"], calc: function (v) { return v.distance / v.time; }, show: "v = d ÷ t", unit: "m/s" },
    { ask: /\b(?:how far|distance)\b/, out: "distance", vars: ["velocity", "time"], calc: function (v) { return v.velocity * v.time; }, show: "d = v × t", unit: "m" },
    { ask: /\bwork\b/, out: "energy", vars: ["force", "distance"], calc: function (v) { return v.force * v.distance; }, show: "W = F × d", unit: "J" },
    { ask: /\bpower\b/, out: "power", vars: ["energy", "time"], calc: function (v) { return v.energy / v.time; }, show: "P = E ÷ t", unit: "W" },
    { ask: /\bpower\b/, out: "power", vars: ["voltage", "current"], calc: function (v) { return v.voltage * v.current; }, show: "P = VI", unit: "W" },
    { ask: /\b(?:voltage|potential difference)\b/, out: "voltage", vars: ["current", "resistance"], calc: function (v) { return v.current * v.resistance; }, show: "V = IR", unit: "V" },
    { ask: /\bcurrent\b/, out: "current", vars: ["voltage", "resistance"], calc: function (v) { return v.voltage / v.resistance; }, show: "I = V ÷ R", unit: "A" },
    { ask: /\bresistance\b/, out: "resistance", vars: ["voltage", "current"], calc: function (v) { return v.voltage / v.current; }, show: "R = V ÷ I", unit: "Ω" },
    { ask: /\bdensity\b/, out: "density", vars: ["mass", "volume"], calc: function (v) { return v.mass / v.volume; }, show: "ρ = m ÷ V", unit: "kg/m³" },
    { ask: /\bpressure\b/, out: "pressure", vars: ["force", "area"], calc: function (v) { return v.force / v.area; }, show: "P = F ÷ A", unit: "Pa" },
    { ask: /\b(?:wave )?speed\b|\bwavelength\b/, out: "velocity", vars: ["frequency", "wavelength"], calc: function (v) { return v.frequency * v.wavelength; }, show: "v = fλ", unit: "m/s" }
  ];
  function physicsQ(text) {
    var t = clean(text), l = t.toLowerCase();
    if (!/\b(?:what|find|calculate|compute|determine|how much|how far|how fast|how long)\b/.test(l)) return null;
    var vals = {}, m, unitKeys = {};
    QTY.forEach(function (q0) { Object.keys(q0.f).forEach(function (k) { unitKeys[k] = 1; }); });
    ["cubic centimeters", "cubic centimetres", "cubic meters", "cubic metres", "cm3", "m3", "square meters", "square metres"].forEach(function (k) { unitKeys[k] = 1; });
    var re = new RegExp("(-?\\d+(?:\\.\\d+)?)\\s*(" + Object.keys(unitKeys).sort(function (a, b) { return b.length - a.length; }).map(function (k) { return k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); }).join("|") + ")(?![A-Za-z0-9^²³])", "gi");
    while ((m = re.exec(t))) {
      var unit = m[2].toLowerCase();
      for (var i = 0; i < QTY.length; i++) {
        var q = QTY[i];
        if (q.f[unit] !== undefined || q.f[m[2]] !== undefined) {
          var f = q.f[unit] !== undefined ? q.f[unit] : q.f[m[2]];
          if (vals[q.k] === undefined) vals[q.k] = +m[1] * f;
          if (q.k === "distance" && /\b(?:height|high|tall|above|lifted|raised)\b/.test(l)) vals.height = +m[1] * f;
          break;
        }
      }
    }
    var wl = l.match(/wavelength (?:of )?(\d+(?:\.\d+)?)/); if (wl) vals.wavelength = +wl[1];
    if (Object.keys(vals).length < 1) return null;
    for (var j = 0; j < FORMULAS.length; j++) {
      var fm = FORMULAS[j];
      if (!fm.ask.test(l)) continue;
      if (fm.vars.every(function (v) { return vals[v] !== undefined; })) {
        var v = fm.calc(vals);
        if (!isFinite(v)) continue;
        if (fm.out === "density") return res(fmt(v / 1000, 4) + " g/cm\u00b3 (" + fmt(v, 4) + " kg/m\u00b3)", [fm.show + " with " + fm.vars.map(function (k) { return k + " = " + fmt(vals[k], 4); }).join(", ")], "physics");
        return res(fmt(v, 4) + " " + fm.unit, [fm.show + " with " + fm.vars.map(function (k) { return k + " = " + fmt(vals[k], 4); }).join(", ")], "physics");
      }
    }
    return null;
  }

  /* ------------------------------------------------------------- thesaurus */
  function thesaurusQ(text) {
    var T = root.C4LMThesaurus; if (!T) return null;
    var l = clean(text).toLowerCase().replace(/[?.!]+$/, ""), m;
    if ((m = l.match(/^(?:what(?:'s| is) )?(?:the )?(?:opposite|antonym)s? (?:of|for|to) ["']?([a-z-]+)["']?$/)) || (m = l.match(/^(?:what(?:'s| is) )?(?:the )?opposite of ["']?([a-z-]+)["']?$/)) || (m = l.match(/^(?:give me |tell me |name )?(?:an? )?antonyms? (?:of|for) ["']?([a-z-]+)["']?$/))) {
      var o = T.opposites(m[1]);
      if (o.length) return res("The opposite of " + m[1] + " is " + o[0] + (o.length > 1 ? " (also " + o.slice(1, 3).join(", ") + ")" : "") + ".", [], "thesaurus");
    }
    if ((m = l.match(/^(?:what(?:'s| is) )?(?:an? |the )?(?:synonyms?|another word|other word|similar word|word)s? (?:for|to|meaning|like) ["']?([a-z-]+)["']?$/)) || (m = l.match(/^(?:give me |tell me |name |list )?(?:an? |some |a few )?synonyms? (?:of|for) ["']?([a-z-]+)["']?$/)) || (m = l.match(/^what (?:else )?(?:can i|could i) say instead of ["']?([a-z-]+)["']?$/)) || (m = l.match(/^(?:what )?(?:other )?words? (?:mean|means) (?:the same as|similar to) ["']?([a-z-]+)["']?$/))) {
      var sy = T.synonyms(m[1]);
      if (sy.length) return res("Synonyms for " + m[1] + ": " + sy.slice(0, 5).join(", ") + ".", [], "thesaurus");
    }
    return null;
  }

  var SOLVERS = [dateQ, numberWordsQ, financeQ, statsQ, translateQ, summarizeQ, arrangementsQ, chemQ, physicsQ, thesaurusQ];
  function solve(text) {
    var t = clean(text);
    if (!t || t.length > 2500) return null;
    for (var i = 0; i < SOLVERS.length; i++) {
      var r = null;
      try { r = SOLVERS[i](t); } catch (e) { r = null; }
      if (r && r.answer) return r;
    }
    return null;
  }

  root.C4LMSkills = { solve: solve, toWords: toWords, fromWords: fromWords, ordinalWords: ordinalWords, datesIn: datesIn, parseFormula: parseFormula, molarMass: molarMass, phrases: function () { return PHRASES.length; } };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMSkills;
})(typeof window !== "undefined" ? window : globalThis);
