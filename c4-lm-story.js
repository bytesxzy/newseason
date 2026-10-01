/* CELL4 story-problem solver.
 *
 * Ordinary arithmetic word problems ("Tom has 5 apples and buys 7 more...",
 * "If 3 pens cost 4.50, how much do 5 cost?", "Jack is 3 times as old as
 * Jill...") are read into a small model, solved exactly, and declined unless
 * EVERY number in the text was used. A problem whose reading leaves a stated
 * number unexplained is not answered: a confident answer to a half-read
 * problem is worse than none.
 *
 * Readers, tried in order: geometry, statistics, clock time, prices and
 * change, rates and proportion, entities related by linear equations (ages,
 * comparisons, totals, ratios), and a running count through a narrative.
 * No problem text, number or answer is stored anywhere in this file.
 *
 * Runs locally. No network, no model service.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------ numbers */
  var ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var SCALE = { hundred: 100, thousand: 1000, million: 1000000 };

  /* number words -> digits, leaving everything else alone */
  function numify(text) {
    var t = String(text)
      .replace(/\bhalf a dozen\b/gi, "6").replace(/\b(?:a|one) dozen\b/gi, "12").replace(/\b(\d+|two|three|four|five|six) dozen\b/gi, function (m, n) { return String((ONES[n.toLowerCase()] !== undefined ? ONES[n.toLowerCase()] : +n) * 12); })
      .replace(/\ba pair of\b/gi, "2").replace(/\ba couple of\b/gi, "2");
    var toks = t.split(/(\s+)/), out = [], i = 0;
    while (i < toks.length) {
      var w = toks[i], lw = w.toLowerCase().replace(/[^a-z-]/g, "");
      var parts = lw.split("-");
      var isNum = function (x) { return ONES[x] !== undefined || TENS[x] !== undefined || SCALE[x] !== undefined; };
      if (lw && parts.every(isNum) && !(lw === "one" && /^(?:of|another|or|day|time)$/i.test((toks[i + 2] || "").replace(/[^a-z]/gi, ""))) ) {
        var total = 0, cur = 0, j = i, consumed = false, tail = w.match(/[^A-Za-z-]+$/);
        while (j < toks.length) {
          var piece = toks[j].toLowerCase().replace(/[^a-z-]/g, "");
          var sub = piece.split("-");
          if (!piece || !sub.every(isNum)) {
            if (toks[j].trim() === "" || piece === "and") {
              /* "one hundred and five": allow 'and' between number words when a number word follows */
              var nxt = (toks[j + 2] || "").toLowerCase().replace(/[^a-z-]/g, "");
              if (piece === "and" && nxt && nxt.split("-").every(isNum) && consumed) { j += 2; continue; }
              if (toks[j].trim() === "" && consumed) { var nx2 = (toks[j + 1] || "").toLowerCase().replace(/[^a-z-]/g, ""); if (nx2 && nx2.split("-").every(isNum)) { j++; continue; } }
            }
            break;
          }
          sub.forEach(function (p) {
            if (ONES[p] !== undefined) cur += ONES[p];
            else if (TENS[p] !== undefined) cur += TENS[p];
            else if (p === "hundred") cur = (cur || 1) * 100;
            else { total += (cur || 1) * SCALE[p]; cur = 0; }
          });
          consumed = true;
          if (/[.,;:!?]$/.test(toks[j])) { j++; break; }
          j++;
        }
        if (consumed) {
          out.push(String(total + cur) + (tail && /[.,;:!?]$/.test(toks[j - 1] || "") ? (toks[j - 1].match(/[.,;:!?]+$/) || [""])[0] : ""));
          i = j; continue;
        }
      }
      out.push(w); i++;
    }
    return out.join("")
      .replace(/(\d+(?:\.\d+)?)\s*(?:percent|per cent)\b/gi, "$1%")
      .replace(/\$\s*(\d)/g, "$$$1");
  }

  var FRACS = { half: [1, 2], halves: [1, 2], third: [1, 3], thirds: [1, 3], quarter: [1, 4], quarters: [1, 4], fourth: [1, 4], fourths: [1, 4],
    fifth: [1, 5], fifths: [1, 5], sixth: [1, 6], eighth: [1, 8], tenth: [1, 10] };

  function nice(v) {
    if (!isFinite(v)) return String(v);
    var r = Math.round(v * 1e6) / 1e6;
    return Number.isInteger(r) ? String(r) : String(r);
  }
  function money(v) {
    var r = Math.round(v * 100) / 100;
    return "$" + (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(2));
  }

  /* ------------------------------------------------------------- splitting */
  function sentences(t) {
    var s = String(t).replace(/\s+/g, " ").trim();
    var parts = s.split(/(?<=[.!?])\s+(?=[A-Z0-9$"'(])/);
    return parts.map(function (p) { return p.trim(); }).filter(Boolean);
  }
  var VERBISH = /^(?:buys?|bought|gets?|got|finds?|found|receives?|received|earns?|earned|picks?|picked|collects?|collected|adds?|added|gains?|gained|wins?|won|makes?|made|bakes?|baked|gathers?|gathered|gives?|gave|loses?|lost|spends?|spent|sells?|sold|eats?|ate|uses?|used|breaks?|broke|donates?|donated|pays?|paid|drops?|dropped|throws?|threw|removes?|removed|takes?|took|leaves?|left|feeds?|fed|has|have|had|is|are|was|were|saves?|saved|reads?|read|runs?|ran|walks?|walked|drives?|drove|plants?|planted|cuts?|cut|shares?|shared|hands?|handed|brings?|brought|loans?|lends?|lent|borrows?|borrowed|then|after|doubles?|doubled|triples?|tripled|sells?|she|he|they|it|i|we)\b/i;
  function clausesOf(sentence) {
    var out = [], s = sentence.replace(/[.!?]+$/, "");
    var parts = s.split(/\s*(?:;|,\s*(?:and\s+)?then|\bthen\b|,\s+and\b|\band\b|,(?=\s+(?:she|he|they|it)\b))\s*/i);
    /* re-join pieces that do not start like a clause ("4 red and 6 blue marbles") */
    var cur = "";
    parts.forEach(function (p, i) {
      if (!p) return;
      if (!cur) { cur = p; return; }
      if (VERBISH.test(p) || /^(?:[A-Z][a-z]+)\s+(?:buys?|gets?|has|gives?|spends?|sells?|eats?)\b/.test(p)) { out.push(cur); cur = p; }
      else cur += " and " + p;
    });
    if (cur) out.push(cur);
    return out;
  }

  /* numbers in a piece of text, with the word that follows and money/percent flags */
  function numbersIn(text) {
    var re = /(\$)?(\d+(?:,\d{3})*(?:\.\d+)?|\d*\.\d+)(%)?(?:\s*\/\s*(\d+))?(?:\s+([A-Za-z$]+(?:-[A-Za-z]+)?))?/g, m, out = [];
    while ((m = re.exec(text))) {
      var v = parseFloat(m[2].replace(/,/g, ""));
      if (m[4]) v = v / parseFloat(m[4]);
      var unit = (m[5] || "").toLowerCase();
      var isMoney = !!m[1] || /^(?:dollars?|bucks?|cents?|euros?|pounds?|usd)$/.test(unit);
      out.push({ v: v, pos: m.index, end: m.index + m[0].length, unit: unit, money: isMoney, pct: !!m[3], raw: m[0] });
    }
    return out;
  }
  function stemN(w) {
    w = String(w || "").toLowerCase();
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 3 && /(?:ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  var FILLER = /^(?:more|less|fewer|of|to|for|from|at|on|in|each|per|every|times|and|or|but|with|by|than|as|a|an|the|that|which|who|how|what|when|if|is|are|was|were|has|have|had|does|do|did|off|apiece|total|altogether|together|some|all|them|it|they|he|she|his|her|their|out|away|back|left|into|minutes?|hours?|days?|weeks?|months?|years?|seconds?|percent)$/;
  function sameNoun(a, b) {
    if (!a || !b) return false;
    var x = stemN(a), y = stemN(b);
    return x === y || (x.length > 3 && y.length > 3 && (x.indexOf(y) === 0 || y.indexOf(x) === 0));
  }
  var MONEY_UNITS = /^(?:dollars?|bucks?|cents?|money|euros?|pounds?|usd)$/;

  /* ============================================================ readers */

  function result(value, unitText, steps, schema, extra) {
    var r = { value: value, unit: unitText || "", steps: steps || [], schema: schema, confidence: 0.82 };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }
  function setOf(arr) { var o = Object.create(null); arr.forEach(function (x) { o[x] = 1; }); return o; }

  /* ---- geometry */
  function geometry(S) {
    var t = S.all.toLowerCase(), q = S.question.toLowerCase(), ns = numbersIn(S.all), m, v;
    if (!/\b(?:area|perimeter|circumference|volume|hypotenuse|diagonal|surface area)\b/.test(q)) return null;
    function nn() { return ns.map(function (n) { return n.v; }); }
    /* right triangle */
    if (/\bhypotenuse\b/.test(q) && ns.length === 2) {
      v = Math.sqrt(ns[0].v * ns[0].v + ns[1].v * ns[1].v);
      return result(v, "", [ns[0].v + "^2 + " + ns[1].v + "^2 = " + nice(ns[0].v * ns[0].v + ns[1].v * ns[1].v), "sqrt = " + nice(v)], "geometry");
    }
    if (/\bcircle\b|\bcircular\b|\bcircumference\b/.test(t)) {
      var r = null, isD = false;
      if ((m = t.match(/\bradius (?:of |is |= )?(\d+(?:\.\d+)?)/)) || (m = t.match(/(\d+(?:\.\d+)?)[ -](?:\w+ )?radius/))) r = +m[1];
      else if ((m = t.match(/\bdiameter (?:of |is |= )?(\d+(?:\.\d+)?)/)) || (m = t.match(/(\d+(?:\.\d+)?)[ -](?:\w+ )?diameter/))) { r = +m[1] / 2; isD = true; }
      if (r !== null && ns.length === 1) {
        var inPi = /\bin terms of (?:pi|π)\b|\bexact(?:ly)?\b|\bleave (?:it )?in (?:terms of )?(?:pi|π)/.test(q);
        var coef = /\barea\b/.test(q) ? r * r : 2 * r, what = /\barea\b/.test(q) ? "area" : "circumference";
        if (inPi) return result(coef, "", [what + " = " + nice(coef) + "π"], "geometry", { pi: true, text: nice(coef) + "π (" + what + ", about " + nice(coef * Math.PI) + ")" });
        return result(coef * Math.PI, "", [what + " = " + nice(coef) + " × π"], "geometry");
      }
      return null;
    }
    if (/\bsquare\b/.test(t) && !/\bsquare (?:feet|meters?|metres?|inches|units|miles|kilomet)/.test(t) || /\bside of (\d+)/.test(t)) {
      if ((m = t.match(/\bside(?:s)? (?:of|is|length|measures?)? ?(\d+(?:\.\d+)?)/)) && ns.length === 1 && /\bsquare\b/.test(t)) {
        var sd = +m[1];
        if (/\barea\b/.test(q)) return result(sd * sd, "", [sd + " × " + sd + " = " + nice(sd * sd)], "geometry");
        if (/\bperimeter\b/.test(q)) return result(4 * sd, "", ["4 × " + sd + " = " + nice(4 * sd)], "geometry");
      }
    }
    if (/\bcube\b/.test(t) && ns.length === 1 && /\bvolume\b/.test(q)) { v = Math.pow(ns[0].v, 3); return result(v, "", [ns[0].v + "^3 = " + nice(v)], "geometry"); }
    if (/\brectang|\bbox\b|\bgarden\b|\broom\b|\bfield\b|\bfloor\b|\bpool\b|\bplot\b|\bpage\b|\bscreen\b|\bpicture\b/.test(t) || / by /.test(t)) {
      var l = null, w = null, h = null;
      if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?(?:long|in length|length)\b/))) l = +m[1];
      if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?(?:wide|in width|width)\b/))) w = +m[1];
      if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?(?:high|tall|in height|height|deep)\b/))) h = +m[1];
      if (l === null && w === null && (m = t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?(?:by|x|×)\s*(\d+(?:\.\d+)?)(?:\s*(?:[a-z]+\s+)?(?:by|x|×)\s*(\d+(?:\.\d+)?))?/))) { l = +m[1]; w = +m[2]; if (m[3]) h = +m[3]; }
      if (l !== null && w !== null && ns.length === (h !== null ? 3 : 2)) {
        if (/\bvolume\b/.test(q) && h !== null) return result(l * w * h, "", [l + " × " + w + " × " + h + " = " + nice(l * w * h)], "geometry");
        if (/\barea\b/.test(q) && h === null) return result(l * w, "", [l + " × " + w + " = " + nice(l * w)], "geometry");
        if (/\bperimeter\b/.test(q) && h === null) return result(2 * (l + w), "", ["2 × (" + l + " + " + w + ") = " + nice(2 * (l + w))], "geometry");
      }
    }
    if (/\btriangle\b/.test(t) && /\barea\b/.test(q) && ns.length === 2 && /\bbase\b/.test(t) && /\bheight\b/.test(t)) {
      v = 0.5 * ns[0].v * ns[1].v;
      return result(v, "", ["1/2 × " + ns[0].v + " × " + ns[1].v + " = " + nice(v)], "geometry");
    }
    return null;
  }

  /* ---- statistics of a listed set */
  function statistics(S) {
    var q = S.question.toLowerCase(), m = q.match(/\b(average|mean|median|mode|range|sum|total|largest|smallest|biggest|highest|lowest|maximum|minimum)\b/);
    if (!m) return null;
    if (!/\b(?:of|for|in)\b/.test(q)) return null;
    var listSrc = S.all;
    var ns = numbersIn(listSrc).filter(function (n) { return !n.pct; }).map(function (n) { return n.v; });
    /* a list: at least three numbers separated by commas / and, or two with 'average' words */
    if (ns.length < 2) return null;
    if (!/\d\s*(?:,|and)\s*\d/.test(listSrc) && !/\d\s*,\s*\d/.test(listSrc)) return null;
    /* refuse when the text has words that make it a story about rates */
    if (/\b(?:per|each|every|hour|cost|price|speed|rate)\b/i.test(listSrc) && !/\baverage of\b|\bmedian of\b|\bmean of\b|\bmode of\b|\brange of\b/i.test(listSrc)) return null;
    var kind = m[1], v, arr = ns.slice().sort(function (a, b) { return a - b; });
    if (kind === "average" || kind === "mean") v = ns.reduce(function (a, b) { return a + b; }, 0) / ns.length;
    else if (kind === "median") { var mid = arr.length >> 1; v = arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2; }
    else if (kind === "mode") { var cnt = {}, best = -1, bv = null, tie = false; ns.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; }); Object.keys(cnt).forEach(function (k) { if (cnt[k] > best) { best = cnt[k]; bv = +k; tie = false; } else if (cnt[k] === best) tie = true; }); if (tie) return null; v = bv; }
    else if (kind === "range") v = arr[arr.length - 1] - arr[0];
    else if (kind === "sum" || kind === "total") v = ns.reduce(function (a, b) { return a + b; }, 0);
    else if (/largest|biggest|highest|maximum/.test(kind)) v = arr[arr.length - 1];
    else v = arr[0];
    return result(v, "", [kind + " of " + ns.join(", ") + " = " + nice(v)], "statistics");
  }

  /* ---- clock time */
  function parseClock(s) {
    var m = String(s).match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
    if (!m) { m = String(s).match(/\b(\d{1,2}):(\d{2})\b/); if (!m) return null; return { h: +m[1], m: +m[2], mer: "" }; }
    return { h: +m[1], m: m[2] ? +m[2] : 0, mer: m[3].toLowerCase().replace(/\./g, "") };
  }
  function toMin(c) { var h = c.h % 12; if (c.mer === "pm") h += 12; else if (!c.mer && c.h === 12) h = 12; else if (!c.mer) h = c.h; return h * 60 + c.m; }
  function showClock(min, mer) {
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60, suf = "";
    if (mer) { suf = h >= 12 ? " pm" : " am"; h = h % 12 || 12; }
    return h + ":" + (m < 10 ? "0" : "") + m + suf;
  }
  function clock(S) {
    var t = S.all, q = S.question.toLowerCase(), m;
    var dur = function (s) { var h = 0, mi = 0, g = false, a; if ((a = s.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i))) { h = +a[1]; g = true; } if ((a = s.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i))) { mi = +a[1]; g = true; } return g ? h * 60 + mi : null; };
    if (/\b(?:what time|when)\b.*\b(?:end|finish|arrive|over|done|get there|leave|start)/.test(q) || /\bwhat time\b/.test(q)) {
      var start = parseClock(t);
      var rest = t.replace(/(\d{1,2})(?::(\d{2}))?\s*(?:a\.?m\.?|p\.?m\.?)/i, "");
      var d = dur(rest);
      if (start && d !== null) {
        var sign = /\b(?:before|earlier|ago)\b/.test(q) ? -1 : 1;
        return result(0, "", [showClock(toMin(start), !!start.mer) + " + " + d + " minutes"], "clock", { text: showClock(toMin(start) + sign * d, !!start.mer) });
      }
    }
    if (/\bhow (?:long|many (?:hours|minutes))\b/.test(q)) {
      var times = []; var re = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/gi;
      while ((m = re.exec(t))) times.push(parseClock(m[0]));
      if (times.length === 2) {
        var diff = toMin(times[1]) - toMin(times[0]); if (diff < 0) diff += 1440;
        var asH = /hours?/.test(q) && !/minutes?/.test(q);
        return result(asH ? diff / 60 : diff, asH ? "hours" : "minutes", [diff + " minutes between them"], "clock", asH ? {} : { text: Math.floor(diff / 60) + " hours " + (diff % 60) + " minutes" + (diff % 60 === 0 ? "" : "") });
      }
    }
    return null;
  }

  /* ---- prices, totals and change */
  function prices(S) {
    var q = S.question.toLowerCase();
    if (!/\b(?:how much|cost|total|pay|spend|change|altogether|in all|price)\b/.test(q)) return null;
    if (!/\$|dollars?|cents|euros?|\bcost|price|\bbuys?|\bbought|\bpays?|\bpaid/.test(S.all.toLowerCase())) return null;
    var items = [], tender = null, steps = [], used = [], ns = numbersIn(S.all);
    var all = S.all;
    var consumed = new Array(ns.length);
    function num(i) { consumed[i] = true; return ns[i].v; }
    /* "N item(s) at/for/costing P each" */
    var re = /(\d+(?:\.\d+)?)\s+([a-z-]+(?:\s[a-z]+)?)\s+(?:at|for|costing|that cost|which cost)\s+\$?(\d+(?:\.\d+)?)\s*(?:dollars?|each|apiece|per\b[a-z ]*)?/gi, m, found = false;
    var spans = [];
    while ((m = re.exec(all))) {
      var cnt = +m[1], price = +m[3];
      /* "3 pens for 4.50" is a total, "3 pens at 4.50 each" a unit price */
      var each = /\b(?:each|apiece|per)\b/i.test(m[0]) || /\bat\b/i.test(m[0]);
      items.push(each ? cnt * price : price); found = true;
      steps.push(each ? cnt + " × " + price : "" + price);
      spans.push([m.index, m.index + m[0].length]);
    }
    /* "each costs P" / "costs P each" after "N things" */
    if (!found) {
      var cm = all.match(/(\d+(?:\.\d+)?)\s+([a-z-]+)[^.?!]*?(?:at|costing|cost|costs|for)\s+\$?(\d+(?:\.\d+)?)\s*(?:dollars?\s*)?(?:each|apiece)/i)
            || all.match(/(?:each|every)\s+([a-z-]+)\s+(?:costs?|is|sells for)\s+\$?(\d+(?:\.\d+)?)[^.?!]*?(\d+(?:\.\d+)?)\s+/i);
      if (cm && cm.length === 4 && /\d/.test(cm[1])) { items.push(+cm[1] * +cm[3]); steps.push(cm[1] + " × " + cm[3]); found = true; spans.push([cm.index, cm.index + cm[0].length]); }
    }
    /* "a/an X for/costs P" */
    var re2 = /\b(?:a|an|one)\s+([a-z-]+(?:\s[a-z]+)?)\s+(?:for|at|costing|that costs?|which costs?)\s+\$?(\d+(?:\.\d+)?)/gi;
    while ((m = re2.exec(all))) {
      var inSpan = spans.some(function (s) { return m.index >= s[0] && m.index < s[1]; });
      if (inSpan) continue;
      items.push(+m[2]); steps.push("" + m[2]); found = true; spans.push([m.index, m.index + m[0].length]);
    }
    if (!found) return null;
    var total = items.reduce(function (a, b) { return a + b; }, 0);
    /* tendered amount for change questions */
    var tm = all.match(/(?:pays?|paid|gives?|gave|hands?|handed|uses?|used|with)\s+(?:with\s+)?(?:a\s+|an\s+)?\$?(\d+(?:\.\d+)?)\s*(?:dollar|bill|note|euro)?/i);
    if (/\bchange\b/.test(q)) {
      if (!tm) return null;
      tender = +tm[1];
    }
    /* every number in the givens must be accounted for */
    var accounted = 0, stepText = steps.join(" + ");
    var numsInSteps = (stepText.match(/\d+(?:\.\d+)?/g) || []).length + (tender !== null ? 1 : 0);
    if (numsInSteps !== ns.length) return null;
    if (tender !== null) return result(tender - total, "", [stepText + " = " + nice(total), tender + " − " + nice(total)], "prices", { money: true });
    return result(total, "", [stepText + " = " + nice(total)], "prices", { money: true });
  }

  /* ---- rates and proportion */
  function rates(S) {
    var all = S.all, q = S.question.toLowerCase(), m, a, b;
    var ns = numbersIn(all);
    if (!/\bhow (?:many|much|long|far)\b/.test(q)) return null;
    /* direct proportion: "If N1 A <verb> P <unit>, how many/much <unit> for N2 A?" */
    if ((m = all.match(/(?:if|when|suppose)?\s*(\d+(?:\.\d+)?)\s+([a-z-]+)\s+(?:cost|costs|weigh|weighs|make|makes|produce|produces|take|takes|use|uses|hold|holds|eat|eats|need|needs|contain|contains|fill|fills|give|gives|yield|yields|sell for)\s+\$?(\d+(?:\.\d+)?)\s*([a-z]*)/i))) {
      var n1 = +m[1], noun = m[2], p1 = +m[3];
      var qm = q.match(/(\d+(?:\.\d+)?)\s+([a-z-]+)/);
      if (qm && sameNoun(qm[2], noun) && ns.length === 3) {
        var n2 = +qm[1], v = p1 / n1 * n2;
        return result(v, "", [p1 + " ÷ " + n1 + " = " + nice(p1 / n1) + " each", nice(p1 / n1) + " × " + n2 + " = " + nice(v)], "rates", { money: /\$|dollar|cost|price/.test(all.toLowerCase()) });
      }
    }
    /* inverse proportion: N1 workers ... D days; N2 workers -> days */
    if ((m = all.match(/(\d+(?:\.\d+)?)\s+(workers?|people|men|women|machines?|pumps?|painters?|builders?|printers?|taps?|pipes?|farmers?|robots?|students|friends|cooks|bakers)\s+[^.?!]*?(?:in|takes?|for|within)\s+(\d+(?:\.\d+)?)\s+(days?|hours?|minutes?|weeks?)/i))) {
      var q2 = q.match(/(\d+(?:\.\d+)?)\s+(workers?|people|men|women|machines?|pumps?|painters?|builders?|printers?|taps?|pipes?|farmers?|robots?|students|friends|cooks|bakers)/);
      if (q2 && ns.length === 3) {
        var tt = +m[1] * +m[3] / +q2[1];
        return result(tt, m[4], [m[1] + " × " + m[3] + " = " + nice(+m[1] * +m[3]) + " worker-" + stemN(m[4]), nice(+m[1] * +m[3]) + " ÷ " + q2[1] + " = " + nice(tt)], "rates");
      }
    }
    /* "N1 things in T1 time; how many in T2 time?" -> same-rate scaling */
    if ((m = all.match(/(\d+(?:\.\d+)?)\s+([a-z-]+)\s+(?:in|every|per|each|within)\s+(\d+(?:\.\d+)?)\s+(minutes?|hours?|days?|weeks?|seconds?|months?|years?)/i))) {
      var q3 = q.match(/(?:in|for|over|after)\s+(\d+(?:\.\d+)?)\s+(minutes?|hours?|days?|weeks?|seconds?|months?|years?)/);
      if (q3 && ns.length === 3 && stemN(q3[2]) === stemN(m[4])) {
        var r3 = +m[1] / +m[3] * +q3[1];
        return result(r3, m[2], [m[1] + " ÷ " + m[3] + " = " + nice(+m[1] / +m[3]) + " per " + stemN(m[4]), nice(+m[1] / +m[3]) + " × " + q3[1] + " = " + nice(r3)], "rates");
      }
    }
    /* "R <units> per/a/every <time>": how many <time> to reach a total, or total over T time */
    if ((m = all.match(/(\d+(?:\.\d+)?)\s+([a-z$-]+(?:\s[a-z]+)?)\s+(?:per|a|an|every|each)\s+(day|week|month|year|hour|minute|second|kilomet\w+|km|mile|gallon|liter|litre|kilogram|kg|pound|page|game|lap|trip)/i))) {
      var rate = +m[1], per = m[3];
      var q4 = q.match(/(?:in|for|over|after)\s+(\d+(?:\.\d+)?)\s+([a-z]+)/);
      var q5 = all.match(/(?:save|reach|get|make|earn|read|collect|fill|cover|travel|drive|walk|run)[^.?!]*?(\d+(?:\.\d+)?)/i);
      if (q4 && sameNoun(q4[2], per) && ns.length === 2) {
        var tot = rate * +q4[1];
        return result(tot, m[2], [rate + " × " + q4[1] + " = " + nice(tot)], "rates", { money: /\$|dollar/.test(all) });
      }
      var qn = q.match(/\bhow (?:many|long)\s+([a-z]+)/);
      if (qn && sameNoun(qn[1], per) && ns.length === 2) {
        var targ = ns.filter(function (n) { return n.v !== rate; })[0] || ns[1];
        if (targ) { var w = targ.v / rate; return result(w, per + "s", [targ.v + " ÷ " + rate + " = " + nice(w)], "rates"); }
      }
    }
    /* "uses A per B; how much for C B" */
    if ((m = all.match(/(\d+(?:\.\d+)?)\s+([a-z-]+)\s+(?:of [a-z ]+?)?\s*(?:per|for every|for each)\s+(\d+(?:\.\d+)?)\s+([a-z-]+)/i))) {
      var q6 = q.match(/(?:for|in|over)\s+(\d+(?:\.\d+)?)\s+([a-z-]+)/);
      if (q6 && ns.length === 3 && sameNoun(q6[2], m[4])) {
        var v6 = +m[1] / +m[3] * +q6[1];
        return result(v6, m[2], [m[1] + " ÷ " + m[3] + " = " + nice(+m[1] / +m[3]), nice(+m[1] / +m[3]) + " × " + q6[1] + " = " + nice(v6)], "rates");
      }
    }
    /* "N1 <noun> need/use P <unit>; how many for N2 <noun>" (recipes) */
    if ((m = all.match(/(\d+(?:\.\d+)?)\s+(cups?|liters?|litres?|kilograms?|grams?|teaspoons?|tablespoons?|eggs?|pounds?|ounces?)\s+(?:of\s+)?[a-z ]*?\s*(?:for|makes?|to make|serves?|feeds?)\s+(\d+(?:\.\d+)?)\s+([a-z-]+)/i))) {
      var q7 = q.match(/(?:for|make|makes|serve|feed)\s+(\d+(?:\.\d+)?)\s+([a-z-]+)/);
      if (q7 && ns.length === 3 && sameNoun(q7[2], m[4])) {
        var v7 = +m[1] / +m[3] * +q7[1];
        return result(v7, m[2], [m[1] + " ÷ " + m[3] + " × " + q7[1] + " = " + nice(v7)], "rates");
      }
    }
    return null;
  }

  /* ---- entities related by linear equations */
  function gauss(A, b) {
    var n = A.length, i, j, k, M = A.map(function (r, idx) { return r.slice().concat([b[idx]]); });
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
      if (Math.abs(M[piv][i]) < 1e-12) return null;
      var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      for (j = i + 1; j < n; j++) { var f = M[j][i] / M[i][i]; for (k = i; k <= n; k++) M[j][k] -= f * M[i][k]; }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) { var s = M[i][n]; for (j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }
  var NAME_STOP = /^(?:The|A|An|If|When|How|What|Who|In|On|At|It|Its|This|That|These|Those|He|She|They|There|His|Her|Their|Some|Many|Each|Every|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Together|Altogether|Both|Find|Suppose|Let|Given|Half|Twice|Double|Triple|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)$/;
  function names(text) {
    var out = [], re = /\b([A-Z][a-z]+)\b/g, m, seen = {};
    while ((m = re.exec(text))) {
      if (NAME_STOP.test(m[1]) || seen[m[1]]) continue;
      /* a sentence-initial common word is not a name */
      seen[m[1]] = 1; out.push(m[1]);
    }
    return out;
  }
  function linear(S) {
    var all = S.all, q = S.question;
    var ql = q.toLowerCase();
    var nm = names(S.all + " " + q);
    if (!/\b(?:times as|twice as|half as|as (?:many|much|old|tall)|more than|fewer than|less than|older than|younger than|taller than|shorter than|ratio|together|combined|altogether|in all|consecutive|sum|difference|both)\b/i.test(all)) return null;
    /* consecutive integers: "two consecutive integers add up to 37" */
    var cm = all.toLowerCase().match(/\b(\d+)\s+consecutive\s+(odd |even )?(?:integers?|numbers?)\b[^.]*?(?:add up to|sum to|sum is|total|sum of|have a sum of|is)\s+(\d+)/);
    if (cm) {
      var k = +cm[1], step = cm[2] ? 2 : 1, sum = +cm[3];
      var n0 = (sum - step * (k * (k - 1) / 2)) / k;
      if (!Number.isInteger(n0)) return null;
      var list = []; for (var i = 0; i < k; i++) list.push(n0 + i * step);
      return result(list.join(", "), "", [k + " consecutive numbers starting at n sum to " + sum + ", so n = " + n0], "linear", { text: list.join(" and ").replace(/ and (?=.* and )/g, ", ") });
    }
    /* ratio split: "ratio of boys to girls is 3 to 2 and there are 30 students. How many girls?" */
    var rm = all.match(/\bratio of ([a-z ]+?) to ([a-z ]+?) (?:is|was|=)\s+(\d+)\s*(?:to|:)\s*(\d+)/i);
    if (rm) {
      var A = +rm[3], B = +rm[4];
      var totalM = all.match(/(?:there are|total(?: of)?|altogether|in all|together)[^0-9]*(\d+(?:\.\d+)?)/i) || all.match(/(\d+(?:\.\d+)?)\s+(?:students|children|kids|people|animals|items|pupils|members|fruits|marbles|cars|books|cookies)\b/i);
      if (totalM) {
        var T = +totalM[1], unit = T / (A + B);
        var askFirst = new RegExp("\\b" + stemN(rm[1].trim().split(" ").pop()), "i").test(ql) && !new RegExp("\\b" + stemN(rm[2].trim().split(" ").pop()), "i").test(ql);
        var askSecond = new RegExp("\\b" + stemN(rm[2].trim().split(" ").pop()), "i").test(ql);
        var valR = askSecond ? unit * B : (askFirst ? unit * A : null);
        if (valR !== null && numbersIn(all).length === 3) return result(valR, "", ["parts: " + A + " + " + B + " = " + (A + B), T + " ÷ " + (A + B) + " = " + nice(unit) + " per part"], "linear");
      }
    }
    if (nm.length < 1) return null;
    /* unknown per name */
    var idx = {}; nm.forEach(function (n, i) { idx[n] = i; });
    var N = nm.length, rows = [], rhs = [], used = 0;
    var nnum = numbersIn(all).length;
    function varRow() { var r = []; for (var i = 0; i < N; i++) r.push(0); return r; }
    var sents = sentences(all);
    var lastName = null;
    sents.forEach(function (s) {
      var sl = s.toLowerCase(), m2;
      var present = nm.filter(function (n) { return new RegExp("\\b" + n + "\\b").test(s); });
      var subj = present[0] || lastName;
      if (present[0]) lastName = present[0];
      /* X is/has N times/twice/half as many/old as Y */
      if ((m2 = s.match(/\b([A-Z][a-z]+)\b[^.]*?\b(\d+(?:\.\d+)?|twice|double|half|triple|three times|two times)\s*(?:times)?\s*as\s+(?:many|much|old|tall|heavy|long|fast|young)?\s*(?:[a-z]+\s+)?as\s+([A-Z][a-z]+)/))) {
        var f = m2[2] === "twice" || m2[2] === "double" ? 2 : m2[2] === "half" ? 0.5 : m2[2] === "triple" ? 3 : +m2[2];
        var r = varRow(); r[idx[m2[1]]] = 1; r[idx[m2[3]]] -= f; rows.push(r); rhs.push(0); used += /\d/.test(m2[2]) ? 1 : 0; return;
      }
      if ((m2 = s.match(/\b([A-Z][a-z]+)\b[^.]*?\b(\d+)\s+times\s+(?:as\s+)?(?:old|many|much|tall|heavy|long|fast)?\s*(?:as\s+)?([A-Z][a-z]+)/))) {
        var r2 = varRow(); r2[idx[m2[1]]] = 1; r2[idx[m2[3]]] -= +m2[2]; rows.push(r2); rhs.push(0); used++; return;
      }
      if ((m2 = s.match(/\b([A-Z][a-z]+)\b[^.]*?\b(\d+(?:\.\d+)?)\s+(?:[a-z]+\s+){0,2}(more|fewer|less|older|younger|taller|shorter)\s+than\s+([A-Z][a-z]+)/))) {
        var sg = /more|older|taller/.test(m2[3]) ? 1 : -1;
        var r3 = varRow(); r3[idx[m2[1]]] = 1; r3[idx[m2[4]]] -= 1; rows.push(r3); rhs.push(sg * +m2[2]); used++; return;
      }
      /* "Name is/has N ..." direct value */
      if ((m2 = s.match(/\b([A-Z][a-z]+)\b\s+(?:is|has|have|had|was|owns|bought|scored|weighs|earns|saved)\s+(?:only\s+)?(\d+(?:\.\d+)?)\b(?!\s*(?:times|%))/)) && idx[m2[1]] !== undefined && !/as (?:many|old|much)|than/.test(sl)) {
        var r4 = varRow(); r4[idx[m2[1]]] = 1; rows.push(r4); rhs.push(+m2[2]); used++; return;
      }
      /* "together/altogether/in all they have/are N" */
      if ((m2 = sl.match(/\b(?:together|altogether|combined|in all|in total|both)\b[^0-9]*(\d+(?:\.\d+)?)/)) || (m2 = sl.match(/(?:sum|total)[^0-9]*(?:is|of|=)\s*(\d+(?:\.\d+)?)/))) {
        var inS = nm.filter(function (n) { return new RegExp("\\b" + n + "\\b").test(all); });
        if (inS.length >= 2) { var r5 = varRow(); inS.forEach(function (n) { r5[idx[n]] = 1; }); rows.push(r5); rhs.push(+m2[1]); used++; }
        return;
      }
      if ((m2 = sl.match(/\bdifference\b[^0-9]*(\d+(?:\.\d+)?)/)) && present.length >= 2) {
        var r6 = varRow(); r6[idx[present[0]]] = 1; r6[idx[present[1]]] = -1; rows.push(r6); rhs.push(+m2[1]); used++; return;
      }
    });
    if (rows.length < N || used !== nnum) return null;
    if (rows.length > N) rows = rows.slice(0, N), rhs = rhs.slice(0, N);
    var sol = gauss(rows, rhs);
    if (!sol) return null;
    /* who is asked about? */
    var askedNames = nm.filter(function (n) { return new RegExp("\\b" + n + "\\b").test(q); });
    var togetherQ = /\b(?:together|altogether|combined|in all|in total|both|sum)\b/.test(ql);
    var val;
    if (togetherQ && askedNames.length !== 1) val = sol.reduce(function (a, b) { return a + b; }, 0);
    else if (askedNames.length === 1) val = sol[idx[askedNames[0]]];
    else return null;
    if (!isFinite(val) || val < -1e-9 || Math.abs(val - Math.round(val * 1e6) / 1e6) > 1e-9 && false) return null;
    return result(val, "", nm.map(function (n, i) { return n + " = " + nice(sol[i]); }), "linear");
  }

  /* ---- percentages */
  function percent(S) {
    var all = S.all, q = S.question.toLowerCase(), m;
    var ns = numbersIn(all);
    if (!/%/.test(all) && !/\b(?:discount|off|tip|tax|interest|increase|decrease|markup|sale)\b/.test(all.toLowerCase())) return null;
    /* P% of X */
    if ((m = all.match(/(\d+(?:\.\d+)?)%\s+of\s+\$?(\d+(?:\.\d+)?)/)) && ns.length === 2) {
      var v = +m[1] / 100 * +m[2];
      return result(v, "", [m[1] + "% of " + m[2] + " = " + nice(v)], "percent");
    }
    /* X is/costs P% off / discounted by P% */
    if ((m = all.match(/\$?(\d+(?:\.\d+)?)\s*(?:dollars?\s*)?[^.?!]*?(\d+(?:\.\d+)?)%\s*(?:off|discount)/i)) || (m = all.match(/(\d+(?:\.\d+)?)%\s*(?:off|discount)[^.?!]*?\$?(\d+(?:\.\d+)?)/i))) {
      var price, p;
      if (/%\s*(?:off|discount)/i.test(m[0]) && m[0].indexOf("%") < m[0].search(/\d+(?:\.\d+)?\s*(?:dollars)?[^%]*$/)) { p = +m[1]; price = +m[2]; } else { price = +m[1]; p = +m[2]; }
      var tax = all.match(/(\d+(?:\.\d+)?)%\s*(?:sales )?tax/i);
      if (ns.length === 2 + (tax ? 1 : 0)) {
        var sale = price * (1 - p / 100), fin = sale;
        var st = [price + " × (1 − " + p + "/100) = " + nice(sale)];
        if (tax) { fin = sale * (1 + +tax[1] / 100); st.push(nice(sale) + " × (1 + " + tax[1] + "/100) = " + nice(fin)); }
        return result(fin, "", st, "percent", { money: true });
      }
    }
    /* tip on a bill */
    if ((m = all.match(/(\d+(?:\.\d+)?)%\s*tip[^.?!]*?\$?(\d+(?:\.\d+)?)/i)) || (m = all.match(/tip[^.?!]*?(\d+(?:\.\d+)?)%[^.?!]*?\$?(\d+(?:\.\d+)?)/i))) {
      if (ns.length === 2) { var t = +m[1] / 100 * +m[2]; return result(t, "", [m[1] + "% of " + m[2] + " = " + nice(t)], "percent", { money: true }); }
    }
    /* increase / decrease by P% */
    if ((m = all.match(/\$?(\d+(?:\.\d+)?)[^.?!]*?(increas\w+|decreas\w+|rises?|rose|drops?|dropped|grows?|grew|falls?|fell)\s+by\s+(\d+(?:\.\d+)?)%/i)) && ns.length === 2) {
      var up = /increas|rise|rose|grow|grew/i.test(m[2]);
      var vv = +m[1] * (1 + (up ? 1 : -1) * +m[3] / 100);
      return result(vv, "", [m[1] + " × (1 " + (up ? "+" : "−") + " " + m[3] + "/100) = " + nice(vv)], "percent");
    }
    /* N total, P% are X: how many X */
    if ((m = all.match(/(\d+(?:\.\d+)?)\s+([a-z]+)[^.?!]*?(\d+(?:\.\d+)?)%\s+(?:are|were|is|of them)/i)) && ns.length === 2 && /\bhow many\b/.test(q)) {
      var cnt = +m[1] * +m[3] / 100, rest = +m[1] - cnt;
      var askRest = /(?:not|other|rest|remaining|girls|women|left)/.test(q) && !/\bboys?|men\b/.test(q);
      return result(askRest ? rest : cnt, "", [m[3] + "% of " + m[1] + " = " + nice(cnt)], "percent");
    }
    /* "tank holds N and is P% full" */
    if ((m = all.match(/(?:holds?|has|contains?|capacity of)\s+(\d+(?:\.\d+)?)[^.?!]*?(\d+(?:\.\d+)?)%\s*full/i)) && ns.length === 2) {
      var f2 = +m[1] * +m[2] / 100; return result(f2, "", [m[2] + "% of " + m[1] + " = " + nice(f2)], "percent");
    }
    return null;
  }

  /* ---- a count carried through a narrative, and sums of events */
  var ADD_RE = /\b(?:buys?|bought|gets?|got|finds?|found|receives?|received|earns?|earned|picks?|picked|collects?|collected|adds?|added|gains?|gained|wins?|won|makes?|made|bakes?|baked|gathers?|gathered|is given|are given|was given|were given|grows?|grew|plants?|planted|catches|caught|saves?|saved|borrows?|borrowed|inherits?|inherited|arrives?|arrived|joins?|joined|more|another|additional|scores?|scored)\b/i;
  var SUB_RE = /\b(?:gives? away|gave away|gives?|gave|loses?|lost|spends?|spent|sells?|sold|eats?|ate|uses?|used|breaks?|broke|donates?|donated|pays?|paid|drops?|dropped|throws? away|threw away|removes?|removed|takes? away|took away|leaves?|feeds?|fed|wastes?|wasted|returns?|returned|lends?|lent|loans?|damaged|ruined|burns?|burned|shares?|shared|hands? out|handed out|eaten|taken|spent)\b/i;
  var SET_RE = /\b(?:has|have|had|starts? with|started with|owns?|owned|there (?:are|were|is|was)|begins? with|holds?|contains?|keeps?|kept)\b/i;

  function unitOf(text, pos) {
    var m = text.slice(pos).match(/^\s*([A-Za-z$]+(?:-[A-Za-z]+)?)/);
    return m ? m[1].toLowerCase() : "";
  }
  function fracIn(cl) {
    var m = cl.match(/\b(?:a|an|one|the)\s+(half|third|quarter|fourth|fifth|sixth|eighth|tenth)\b|\b(half)\b|\b(\d+)\s*\/\s*(\d+)\b|\b(two|three|four|five)\s+(thirds|quarters|fourths|fifths)\b|\b(\d+(?:\.\d+)?)%/i);
    if (!m) return null;
    if (m[7]) return +m[7] / 100;
    if (m[3]) return +m[3] / +m[4];
    if (m[5]) { var num = { two: 2, three: 3, four: 4, five: 5 }[m[5].toLowerCase()], den = FRACS[m[6].toLowerCase()][1]; return num / den; }
    var w = (m[1] || m[2]).toLowerCase(); return FRACS[w][0] / FRACS[w][1];
  }
  function targetOf(q) {
    var m = q.match(/\bhow many\s+([a-z-]+(?:\s[a-z-]+)?)/i), t = null;
    if (m) {
      var parts = m[1].toLowerCase().split(" ");
      t = parts[0];
      if (parts[1] && !/^(?:do|does|did|are|is|were|was|have|has|had|will|can|could|would|should|must)$/.test(parts[1]) && !FILLER.test(parts[1])) t = parts[1];
      if (/^(?:more|fewer|less)$/.test(t)) return null;
      return { noun: t, money: false };
    }
    if (/\bhow much\b/i.test(q)) {
      var mm = q.match(/\bhow much (?:(money|\w+?)\b)?/i);
      var noun = mm && mm[1] && !/^(?:does|do|did|is|are|was|were|has|have|had|will|can|could|more|less|change)$/i.test(mm[1]) ? mm[1].toLowerCase() : "money";
      return { noun: noun, money: noun === "money" || MONEY_UNITS.test(noun) };
    }
    return null;
  }

  function narrative(S) {
    var q = S.question, ql = q.toLowerCase();
    var tgt = targetOf(q);
    if (!tgt) return null;
    var givens = S.givens, ns_total = numbersIn(S.all).length, nq = numbersIn(q).length;
    var owners = {}, order = [], lastOwner = null, steps = [], usedCount = 0, events = [];
    function own(n) { if (!(n in owners)) { owners[n] = null; order.push(n); } return n; }
    function unitMatches(u, t) {
      if (!u) return true;
      if (tgt.money) return MONEY_UNITS.test(u) || u === "$" || FILLER.test(u);
      if (MONEY_UNITS.test(u)) return false;
      return sameNoun(u, tgt.noun) || FILLER.test(u);
    }
    var sumEvents = /\b(?:altogether|in total|in all|total|combined|together)\b/.test(ql) && /\b(?:sold|bought|ate|read|ran|walked|drove|made|baked|earned|spent|paid|collected|picked|saved|used|scored|did|sell|buy|eat|read|run|walk|drive|make|bake|earn|spend|pay|collect|pick|save|use|score)\b/.test(ql);
    var clauseIdx = 0, prevAmount = null, ok = true;
    givens.forEach(function (sent) {
      clausesOf(sent).forEach(function (cl) {
        if (!ok) return;
        var low = cl.toLowerCase();
        var nums = numbersIn(cl);
        var nameM = cl.match(/^(?:[A-Za-z]+\s+)?([A-Z][a-z]+)\b/) || cl.match(/\b([A-Z][a-z]+)\b/);
        var owner = nameM && !NAME_STOP.test(nameM[1]) ? nameM[1] : (lastOwner || "x");
        if (nameM && !NAME_STOP.test(nameM[1])) lastOwner = owner;
        own(owner);
        if (!nums.length && !fracIn(low)) return;
        /* relative amount: "half as many" / "twice as many" / "3 more than" */
        var rel = low.match(/\b(half|twice|double|triple|\d+(?:\.\d+)?\s+times)\s+as\s+(?:many|much)\b/);
        if (rel && prevAmount !== null) {
          var f = rel[1] === "half" ? 0.5 : (rel[1] === "twice" || rel[1] === "double") ? 2 : rel[1] === "triple" ? 3 : parseFloat(rel[1]);
          var amt = prevAmount * f; events.push({ owner: owner, kind: "event", v: amt }); steps.push(nice(prevAmount) + " × " + nice(f) + " = " + nice(amt)); prevAmount = amt; return;
        }
        var kind = SUB_RE.test(low) && !SET_RE.test(low.replace(SUB_RE, "")) ? "sub" : (ADD_RE.test(low) ? "add" : (SET_RE.test(low) ? "set" : (SUB_RE.test(low) ? "sub" : "")));
        if (/\bgives?\s+\d|\bgave\s+\d|\bgives? (?:away)?\b/.test(low) && /\bto\s+[A-Z]/.test(cl) === false && SUB_RE.test(low)) kind = "sub";
        if (/\b(?:is|are|was|were) given\b|\bgives? (?:him|her|them)\b|\bgave (?:him|her|them)\b/.test(low)) kind = "add";
        /* the quantity this clause states */
        var amount = null, consumedN = 0;
        var frac = fracIn(low);
        var relMore = low.match(/(\d+(?:\.\d+)?)\s+(?:more|extra|additional)/);
        var each = /\b(?:each|every|per|apiece)\b/.test(low);
        var cand = nums.filter(function (n) { return !n.pct && unitMatches(n.unit) || n.money === tgt.money; });
        if (frac !== null && /\bof\b/.test(low) && (!nums.length || nums.every(function (n) { return n.pct || n.raw.indexOf("/") >= 0; }))) {
          var basis = owners[owner];
          if (basis === null || basis === undefined) { var vs = order.map(function (o) { return owners[o]; }).filter(function (x) { return x !== null; }); basis = vs.length ? vs[vs.length - 1] : null; }
          if (basis === null) { ok = false; return; }
          amount = basis * frac; consumedN = nums.length;
          if (!kind) kind = "sub";
          steps.push(nice(frac) + " of " + nice(basis) + " = " + nice(amount));
        } else if (each && nums.length >= 2) {
          /* N groups with M things each */
          var a = nums[0], b = nums[1];
          amount = a.v * b.v; consumedN = 2; steps.push(nice(a.v) + " × " + nice(b.v) + " = " + nice(amount));
          if (!kind) kind = "set";
        } else if (nums.length >= 1) {
          /* choose the number whose unit matches the target; else the only number */
          var pick = null;
          for (var i = 0; i < nums.length; i++) if (!nums[i].pct && nums[i].unit && (tgt.money ? nums[i].money : sameNoun(nums[i].unit, tgt.noun))) { pick = nums[i]; break; }
          if (!pick) { var free = nums.filter(function (n) { return !n.pct && (!n.unit || FILLER.test(n.unit) || (tgt.money && n.money)); }); if (free.length === 1 && nums.length === 1) pick = free[0]; else if (nums.length === 1) pick = nums[0]; }
          if (!pick) { ok = false; return; }
          /* a clause about a different kind of thing is not ours */
          if (pick.unit && !(tgt.money ? pick.money : sameNoun(pick.unit, tgt.noun)) && !FILLER.test(pick.unit) && nums.length === 1) {
            /* the noun may follow later: "buys 5 new red apples" */
            var tail = low.slice(pick.end);
            if (!new RegExp("\\b" + stemN(tgt.noun)).test(tail.replace(/s\b/g, "")) && !(tgt.money && /dollar|\$/.test(low))) { ok = false; return; }
          }
          amount = pick.v; consumedN = nums.length;
          if (nums.length > 1) { ok = false; return; }
          steps.push(nice(amount));
        } else return;
        usedCount += consumedN;
        if (!kind) kind = owners[owner] === null ? "set" : "add";
        if (sumEvents) { events.push({ owner: owner, kind: kind, v: amount }); prevAmount = amount; return; }
        var cur = owners[owner];
        if (kind === "set") owners[owner] = amount;
        else if (kind === "add") owners[owner] = (cur === null ? 0 : cur) + amount;
        else if (kind === "sub") {
          if (cur === null) { ok = false; return; }
          owners[owner] = cur - amount;
          /* "gives N to Sam" moves the amount */
          var to = cl.match(/\bto\s+([A-Z][a-z]+)\b/);
          if (to && !NAME_STOP.test(to[1])) { own(to[1]); owners[to[1]] = (owners[to[1]] === null ? 0 : owners[to[1]]) + amount; }
        }
        prevAmount = amount;
      });
    });
    if (!ok) return null;
    if (usedCount !== ns_total) return null;
    var value;
    if (sumEvents && events.length) {
      value = events.reduce(function (a, e) { return a + e.v; }, 0);
      return result(value, tgt.noun, steps.concat(["total = " + nice(value)]), "narrative", { money: tgt.money });
    }
    var vals = order.map(function (o) { return owners[o]; }).filter(function (x) { return x !== null; });
    if (!vals.length) return null;
    var named = order.filter(function (o) { return o !== "x" && new RegExp("\\b" + o + "\\b").test(q); });
    var together = /\b(?:altogether|in all|in total|together|combined|both|total)\b/.test(ql);
    if (together || vals.length === 1) value = vals.reduce(function (a, b) { return a + b; }, 0);
    else if (named.length === 1) value = owners[named[0]];
    else if (order.length && owners[order[0]] !== null) value = owners[order[0]];
    else return null;
    if (value < -1e-9) return null;
    return result(value, tgt.noun, steps, "narrative", { money: tgt.money });
  }

  /* ---- "a number" algebra phrases handled elsewhere; here: X more than / twice plus */
  var READERS = [geometry, statistics, clock, prices, percent, rates, linear, narrative];

  function parse(text) {
    var t = numify(text);
    var ss = sentences(t);
    if (!ss.length) return null;
    var qi = -1, i;
    for (i = ss.length - 1; i >= 0; i--) if (/\?\s*$/.test(ss[i]) || /^(?:find|calculate|compute|determine|what|how)\b/i.test(ss[i])) { qi = i; break; }
    if (qi < 0) return null;
    /* the question may share a sentence with the givens: "If 3 pens cost 4.50, how much do 5 cost?" */
    var qsent = ss[qi], givens = ss.slice(0, qi).concat(ss.slice(qi + 1));
    var splitAt = qsent.search(/,\s*(?:how|what|find)\b/i);
    if (splitAt > 0) { givens.push(qsent.slice(0, splitAt)); qsent = qsent.slice(splitAt + 1).trim(); }
    var em = qsent.match(/^(.*?)\b((?:how|what)\b.*)$/i);
    if (em && em[1] && /\d/.test(em[1]) && !/^(?:if|when|suppose)\b/i.test(em[1].trim() ? "" : "x")) { givens.push(em[1].replace(/[,;]\s*$/, "")); qsent = em[2]; }
    return { all: t, givens: givens, question: qsent.trim() };
  }

  function solve(text) {
    var S = parse(text);
    if (!S) return null;
    S.all = S.givens.join(" ") + " " + S.question;
    for (var i = 0; i < READERS.length; i++) {
      var r = null;
      try { r = READERS[i](S); } catch (e) { r = null; }
      if (r && r.value !== undefined && (typeof r.value !== "number" || isFinite(r.value))) return finalize(r, S);
    }
    return null;
  }

  function finalize(r, S) {
    var ans;
    if (r.text) ans = r.text;
    else if (typeof r.value === "string") ans = r.value;
    else if (r.money) ans = money(r.value);
    else ans = nice(r.value) + (r.unit && !/^\s*$/.test(r.unit) ? " " + r.unit : "");
    r.answer = ans;
    return r;
  }

  root.C4LMStory = { solve: solve, parse: parse, numify: numify, sentences: sentences, clausesOf: clausesOf };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMStory;
})(typeof window !== "undefined" ? window : globalThis);
