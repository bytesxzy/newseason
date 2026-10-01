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
      if (lw && parts.every(isNum) && !(lw === "one" && (/^(?:of|another|or|day|time|which|that|who|to|is|was|has|had|can|will|would|could|should|does|did|must|may|might|more|less|fewer|than|plus|minus|equals|and|but|as|must|number|numbers|side|sides|angle|angles)$/i.test((toks[i + 2] || "").replace(/[^a-z]/gi, "")) || /[.,;:!?]$/.test(w))) ) {
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
    var expanded = [];
    parts.forEach(function (pp) {
      if (!pp) return;
      var sg = pp.split(/,\s+/), c2 = sg[0];
      for (var k = 1; k < sg.length; k++) { if (VERBISH.test(sg[k])) { expanded.push(c2); c2 = sg[k]; } else c2 += ", " + sg[k]; }
      expanded.push(c2);
    });
    parts = expanded;
    /* re-join pieces that do not start like a clause ("4 red and 6 blue marbles") */
    var cur = "";
    parts.forEach(function (p, i) {
      if (!p) return;
      if (!cur) { cur = p; return; }
      if (VERBISH.test(p) || /^(?:[A-Z][a-z]+)\s+(?:buys?|gets?|has|gives?|spends?|sells?|eats?)\b/.test(p) || /^(?:a |an |the )?(?:half|third|quarter|fourth|fifth|sixth|eighth|tenth|\d+(?:\.\d+)?%|\d+\/\d+)\s+of\b/i.test(p)) { out.push(cur); cur = p; }
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
  function geoQ(q) {
    q = q.toLowerCase();
    if (/\bfenc|\ball the way around\b|\bdistance around\b|\bwalk(?:s|ing)? around\b|\bborder\b|\bframe\b|\bribbon around\b|\blap\b/.test(q) && !/\bperimeter\b/.test(q)) q += " perimeter";
    if (/\b(?:carpet|tiles?|paint|sod|lawn|grass|cover(?:ed|ing)?|wallpaper)\b/.test(q) && /\bhow (?:much|many)\b/.test(q) && !/\barea\b/.test(q)) q += " area";
    return q;
  }
  function geometry(S) {
    var t = S.all.toLowerCase(), q = geoQ(S.question), ns = numbersIn(S.all), m, v;
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
      if ((m = t.match(/\blength (?:of |is |= |was |measures )?(\d+(?:\.\d+)?)/))) l = +m[1];
      else if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?(?:long|in length|length)\b/))) l = +m[1];
      if ((m = t.match(/\bwidth (?:of |is |= |was |measures )?(\d+(?:\.\d+)?)/))) w = +m[1];
      else if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?(?:wide|in width|width)\b/))) w = +m[1];
      if ((m = t.match(/\b(?:height|depth) (?:of |is |= |was |measures )?(\d+(?:\.\d+)?)/))) h = +m[1];
      else if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?(?:high|tall|in height|height|deep)\b/))) h = +m[1];
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
        var asM = /minutes?/.test(q) && !/hours?/.test(q.replace(/hours? and minutes?/, ""));
        var hm = Math.floor(diff / 60) + " hour" + (Math.floor(diff / 60) === 1 ? "" : "s") + (diff % 60 ? " " + (diff % 60) + " minute" + (diff % 60 === 1 ? "" : "s") : "");
        return result(asH ? diff / 60 : diff, asH ? "hours" : "minutes", [diff + " minutes between them"], "clock", asH ? {} : { text: asM ? diff + " minutes" : hm + " (" + diff + " minutes)" });
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
  var ROLE = /\b(?:his|her|their|the|my|our)\s+(son|daughter|father|mother|brother|sister|friend|uncle|aunt|grandfather|grandmother|grandson|granddaughter|cousin|nephew|niece|husband|wife|teacher|student|boy|girl)\b/gi;
  var ROLE_APPOS = new RegExp(ROLE.source.replace(/\)\\b$/, ")") + "\\s+(?=[A-Z][a-z]+)", "gi");
  function roleFix(t) { return t.replace(ROLE_APPOS, "").replace(ROLE, function (m, r) { return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase(); }); }
  function linear(S) {
    var all = roleFix(S.all), q = roleFix(S.question);
    var ql = q.toLowerCase();
    var nm = names(all + " " + q);
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
        var askFirst = new RegExp("\\b" + stemN(rm[1].trim().split(" ")[0]), "i").test(ql) && !new RegExp("\\b" + stemN(rm[2].trim().split(" ")[0]), "i").test(ql);
        var askSecond = new RegExp("\\b" + stemN(rm[2].trim().split(" ")[0]), "i").test(ql);
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
    var sents = [];
    sentences(all).forEach(function (z) { z.split(/\s+and\s+(?=(?:together|altogether|in all|in total|they|their|the sum|the total|both|[A-Z][a-z]+ (?:is|has|was|had|are|have)\b))/).forEach(function (y) { sents.push(y); }); });
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
      var gw = (all.match(/(\d+(?:\.\d+)?)%\s+(?:are|were|is|of them are|of them were)\s+([a-z]+)/i) || [])[2], qn = (q.match(/\bhow many\s+([a-z]+)/) || [])[1];
      var askRest = gw && qn ? stemN(gw.toLowerCase()) !== stemN(qn) && !/\b(?:students|people|children|kids|items|animals|members|pupils)\b/.test(qn) : /(?:not|other|rest|remaining|girls|women|left)/.test(q) && !/\bboys?|men\b/.test(q);
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

  /* ======================================================== units and dimensions
   * Quantities carry units (dollar, pen, mile/hour ...). An answer is an
   * expression over the givens, each used once, whose unit is the unit asked
   * for: 45 student / (15 student per bus) = 3 bus. Sums need equal units,
   * products and quotients combine them. Ties are broken by where the numbers
   * stand in the text (a rate is made from numbers of the same sentence) and
   * by cue words; a genuine tie is declined.
   */
  var IRREG = { feet: "foot", people: "person", men: "man", women: "woman", children: "child", mice: "mouse", teeth: "tooth", geese: "goose",
    wives: "wife", knives: "knife", loaves: "loaf", leaves: "leaf", shelves: "shelf", halves: "half", dice: "die", buses: "bus", lunches: "lunch" };
  var UALIAS = { km: "kilometer", kms: "kilometer", m: "meter", cm: "centimeter", mm: "millimeter", mi: "mile", ft: "foot", yd: "yard", sec: "second", secs: "second",
    min: "minute", mins: "minute", hr: "hour", hrs: "hour", h: "hour", buck: "dollar", usd: "dollar", euro: "dollar", metre: "meter", kilometre: "kilometer",
    litre: "liter", kg: "kilogram", g: "gram", l: "liter", ml: "milliliter", lb: "pound", lbs: "pound", oz: "ounce" };
  function ustem(w) {
    w = String(w || "").toLowerCase();
    if (IRREG[w]) return IRREG[w];
    if (UALIAS[w]) return UALIAS[w];
    if (/^(?:fish|sheep|deer|series|species|news|mathematics)$/.test(w)) return w;
    return stemN(w);
  }
  function plural(s, n) {
    if (n === 1 || s === "percent") return s;
    var P = { foot: "feet", person: "people", man: "men", woman: "women", child: "children", mouse: "mice", tooth: "teeth", die: "dice", fish: "fish", sheep: "sheep", deer: "deer" };
    if (P[s]) return P[s];
    if (/(?:s|x|z|ch|sh)$/.test(s)) return s + "es";
    if (/[^aeiou]y$/.test(s)) return s.slice(0, -1) + "ies";
    return s + "s";
  }
  var TIME_PAIRS = { "week>day": 7, "day>hour": 24, "hour>minute": 60, "minute>second": 60, "year>month": 12, "year>week": 52, "year>day": 365, "decade>year": 10, "century>year": 100 };
  function timeConv(from, to) {
    if (from === to) return 1;
    var edges = [], k;
    for (k in TIME_PAIRS) { var p = k.split(">"); edges.push([p[0], p[1], TIME_PAIRS[k]]); edges.push([p[1], p[0], 1 / TIME_PAIRS[k]]); }
    var seen = {}, queue = [[from, 1]];
    seen[from] = 1;
    while (queue.length) {
      var cur = queue.shift();
      for (var i = 0; i < edges.length; i++) if (edges[i][0] === cur[0] && !seen[edges[i][1]]) {
        var f = cur[1] * edges[i][2];
        if (edges[i][1] === to) return f;
        seen[edges[i][1]] = 1; queue.push([edges[i][1], f]);
      }
    }
    return null;
  }
  var TIME_STEMS = { second: 1, minute: 1, hour: 1, day: 1, week: 1, month: 1, year: 1, decade: 1, century: 1 };
  var LEN_STEMS = { millimeter: 1, centimeter: 1, meter: 1, kilometer: 1, inch: 1, foot: 1, yard: 1, mile: 1 };
  var CLASS_OF = { boy: "person", girl: "person", man: "person", woman: "person", child: "person", kid: "person", student: "person", pupil: "person", person: "person", adult: "person", player: "person", member: "person", worker: "person", teacher: "person",
    hen: "animal", rabbit: "animal", cow: "animal", pig: "animal", sheep: "animal", horse: "animal", dog: "animal", cat: "animal", duck: "animal", chicken: "animal", goat: "animal", bird: "animal", fish: "animal",
    apple: "fruit", orange: "fruit", banana: "fruit", pear: "fruit", grape: "fruit", mango: "fruit", peach: "fruit" };
  var ATTR = {
    leg: { person: 2, man: 2, woman: 2, child: 2, boy: 2, girl: 2, human: 2, hen: 2, chicken: 2, duck: 2, bird: 2, goose: 2, turkey: 2, cow: 4, dog: 4, cat: 4, rabbit: 4, horse: 4, sheep: 4, goat: 4, pig: 4, lion: 4, tiger: 4, elephant: 4, table: 4, chair: 4, spider: 8, insect: 6, ant: 6, bee: 6, beetle: 6, fly: 6, octopus: 8, centipede: 100, tripod: 3 },
    wheel: { car: 4, bike: 2, bicycle: 2, tricycle: 3, motorcycle: 2, truck: 6, wagon: 4, unicycle: 1, scooter: 2 },
    eye: { person: 2, man: 2, woman: 2, child: 2, boy: 2, girl: 2, dog: 2, cat: 2, spider: 8, cyclops: 1 },
    ear: { person: 2, man: 2, woman: 2, child: 2, boy: 2, girl: 2, dog: 2, cat: 2, rabbit: 2, elephant: 2 },
    hand: { person: 2, man: 2, woman: 2, child: 2, boy: 2, girl: 2 },
    arm: { person: 2, man: 2, woman: 2, child: 2, boy: 2, girl: 2, octopus: 8, starfish: 5 },
    finger: { person: 10, man: 10, woman: 10, child: 10, boy: 10, girl: 10, hand: 5, glove: 5 },
    toe: { person: 10, man: 10, woman: 10, child: 10, boy: 10, girl: 10, foot: 5 },
    wing: { bird: 2, hen: 2, chicken: 2, duck: 2, butterfly: 4, bee: 4, fly: 2, insect: 4, plane: 2, airplane: 2, bat: 2 },
    side: { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10, quadrilateral: 4, rhombus: 4, trapezoid: 4, parallelogram: 4 },
    corner: { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, octagon: 8, cube: 8, box: 8 },
    vertex: { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, octagon: 8, cube: 8 },
    face: { cube: 6, die: 6, dice: 6, box: 6, tetrahedron: 4, pyramid: 5, prism: 5 },
    edge: { cube: 12, box: 12, tetrahedron: 6, pyramid: 8 },
    petal: { daisy: 8, flower: 5 }, tire: { car: 4, bike: 2, bicycle: 2, truck: 6, tricycle: 3, motorcycle: 2 }, window: { car: 4 }, tooth: { person: 32, shark: 300 }
  };
  var ATTR_ALIAS = { vertices: "vertex", faces: "face", sides: "side", legs: "leg", wheels: "wheel", eyes: "eye", ears: "ear", hands: "hand", arms: "arm", fingers: "finger", toes: "toe", wings: "wing", corners: "corner", edges: "edge", petals: "petal", tires: "tire", teeth: "tooth", windows: "window" };

  var MEASURE_STEMS = { second: 1, minute: 1, hour: 1, day: 1, week: 1, month: 1, year: 1, millimeter: 1, centimeter: 1, meter: 1, kilometer: 1, inch: 1, foot: 1, yard: 1, mile: 1,
    gram: 1, kilogram: 1, pound: 1, ounce: 1, milligram: 1, tonne: 1, liter: 1, milliliter: 1, gallon: 1, quart: 1, pint: 1, cup: 1 };
  var CONV = { length: { millimeter: 0.001, centimeter: 0.01, meter: 1, kilometer: 1000, inch: 0.0254, foot: 0.3048, yard: 0.9144, mile: 1609.344 },
    mass: { milligram: 1e-6, gram: 0.001, kilogram: 1, pound: 0.45359237, ounce: 0.028349523, tonne: 1000 },
    volume: { milliliter: 0.001, liter: 1, gallon: 3.785411784, quart: 0.946352946, pint: 0.473176473, cup: 0.2365882365 } };
  function uMul(a, b, sign) {
    var o = {}, k; for (k in a) o[k] = a[k];
    for (k in b) { o[k] = (o[k] || 0) + (sign || 1) * b[k]; if (!o[k]) delete o[k]; }
    return o;
  }
  function smallExp(u) { for (var k in u) if (Math.abs(u[k]) > 1) return false; return true; }
  function uKey(u) { return Object.keys(u).sort().map(function (k) { return k + "^" + u[k]; }).join("*"); }
  function uSingle(u) { var ks = Object.keys(u); return ks.length === 1 && u[ks[0]] === 1 ? ks[0] : null; }
  function popcount(x) { var c = 0; while (x) { c += x & 1; x >>= 1; } return c; }

  var NOUN_STOP = /^(?:and|or|but|in|on|at|to|for|from|with|by|of|each|every|per|a|an|the|is|are|was|were|has|have|had|does|do|did|will|would|can|could|should|must|need|needs|needed|how|what|when|if|then|that|which|who|long|wide|tall|high|deep|old|apart|away|more|less|fewer|than|as|so|after|before|during|altogether|total|together|left|remaining|remain|over|under|into|onto|up|down|out|it|they|he|she|them|his|her|their|apiece|all|only|just|now|today|yesterday|tomorrow|again|too|also|some|any|no|not|first|last|next|there|here|this|these|those|get|gets|got|buy|buys|spend|spends|pay|pays|cost|costs|make|makes|take|takes|give|gives|use|uses|hold|holds|travel|travels|ride|rides|walk|walks|run|runs|read|reads|eat|eats|earn|earns|bring|brings|sell|sells|share|shares)$/i;
  function headUnit(text, end) {
    var s = text.slice(end), m, words = [], i;
    if ((m = s.match(/^-([A-Za-z]+)/))) return m[1].toLowerCase();
    for (i = 0; i < 3; i++) {
      m = s.match(/^\s*([A-Za-z]+(?:-[A-Za-z]+)?)/);
      if (!m) break;
      var w = m[1].toLowerCase();
      if (NOUN_STOP.test(w)) break;
      words.push(w); s = s.slice(m[0].length);
      if (/^\s*[,.;:?!)]/.test(s)) break;
    }
    if (!words.length) return "";
    if (/^(?:dollar|euro|cent|buck)$/.test(words[0])) return words[0];
    if (MEASURE_STEMS[ustem(words[0])]) return words[0];
    if (words.length > 1 && /[^s]s$/.test(words[0]) && !/^(?:this|his|its|yes|bus|gas|plus|class|glass|grass|dress|boss|cross)$/.test(words[0])) return words[0];
    return words[words.length - 1];
  }

  /* quantities of one text segment, each with a unit map and the span it covers */
  function quantitiesOf(seg, g, isQ, fullText) {
    var out = [], claimed = [], m, re;
    function claim(i, j) { claimed.push([i, j]); }
    function isClaimed(i) { return claimed.some(function (c) { return i >= c[0] && i < c[1]; }); }
    function push(v, u, i, j, extra) {
      var o = { v: v, u: u, g: g, pos: i, end: j, optional: false, nums: 1 };
      if (extra) for (var k in extra) o[k] = extra[k];
      out.push(o); claim(i, j); return o;
    }
    var D = "dollar", NUM = "(\\$)?(\\d+(?:,\\d{3})*(?:\\.\\d+)?|\\d*\\.\\d+)";
    /* "N for $P" / "N for a dollar": a price per item, from two numbers */
    re = /\b([a-z]+)\s+(?:are|is|at|sell|sold|cost|go for)\s+(?:at\s+)?(\d+)\s+for\s+(?:\$\s*(\d+(?:\.\d+)?)|a dollar|(\d+(?:\.\d+)?)\s+dollars?)/gi;
    while ((m = re.exec(seg))) {
      var tot = m[3] !== undefined ? +m[3] : (m[4] !== undefined ? +m[4] : 1), cnt = +m[2], item = ustem(m[1]);
      var uu = {}; uu[D] = 1; uu[item] = -1;
      push(tot / cnt, uu, m.index, m.index + m[0].length, { nums: m[3] !== undefined || m[4] !== undefined ? 2 : 1, rate: true });
    }
    /* "$P for adults": a price per kind */
    re = /\$\s*(\d+(?:\.\d+)?)\s+for\s+(?!a\b|an\b|the\b|each\b|every\b|\d)([a-z]+)/gi;
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index)) continue;
      var u2 = {}; u2[D] = 1; u2[ustem(m[2])] = -1;
      push(+m[1], u2, m.index, m.index + m[0].length, { rate: true });
    }
    /* "5% per hour": a rate of percent */
    re = /(\d+(?:\.\d+)?)\s*%\s+(?:per|an?|each|every)\s+([A-Za-z]+)/gi;
    while ((m = re.exec(seg))) {
      var up2 = { percent: 1 }; up2[ustem(m[2])] = -1;
      push(+m[1], up2, m.index, m.index + m[0].length, { rate: true });
    }
    /* speed shorthand: 60 mph, 90 km/h, 5 m/s */
    re = /(\d+(?:\.\d+)?)\s*(mph|kph|km\/h|km\/hr|mi\/h|m\/s|mps)\b/gi;
    while ((m = re.exec(seg))) {
      var sp = m[2].toLowerCase(), uu2 = {};
      var nu = sp === "mph" || sp === "mi/h" ? "mile" : (sp === "m/s" || sp === "mps" ? "meter" : "kilometer"), de = sp === "m/s" || sp === "mps" ? "second" : "hour";
      uu2[nu] = 1; uu2[de] = -1; push(+m[1], uu2, m.index, m.index + m[0].length, { rate: true });
    }
    /* "N A per/a/an/each/every B" */
    re = new RegExp(NUM + "\\s*([A-Za-z]+)?(?:\\s+of\\s+[A-Za-z]+)?\\s+(per|an?|each|every|for each|for every)\\s+([A-Za-z]+)", "gi");
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index)) continue;
      if (/^an?$/i.test(m[4]) && !(m[1] || TIME_STEMS[ustem(m[5])] || /^(?:night|shift|lap|trip|session|lesson|serving)$/i.test(m[5]))) continue;
      var a = m[3] ? m[3].toLowerCase().split(" ") : [], hd = a.length ? a[a.length - 1] : "";
      if (hd && NOUN_STOP.test(hd)) { if (a.length > 1 && !NOUN_STOP.test(a[0])) hd = a[0]; else hd = ""; }
      var num = m[1] ? D : ustem(hd), den = ustem(m[5]);
      if (!num && !m[1]) continue;
      if (NOUN_STOP.test(m[5]) || !den) continue;
      var u3 = {}; u3[num] = 1; u3[den] = (u3[den] || 0) - 1; if (!u3[den]) delete u3[den];
      push(+m[2].replace(/,/g, ""), u3, m.index, m.index + m[0].length, { rate: true });
    }
    /* "pieces of 5 meters (each)": a measure per piece */
    re = /\b(pieces?|parts?|portions?|bags?|bottles?|cups?|jars?|packs?|boxes|box|bars?|strips?|slices?|segments?|groups?|containers?|loads?)\s+of\s+(\d+(?:\.\d+)?)\s+([A-Za-z]+)/gi;
    while ((m = re.exec(seg))) {
      var mu = ustem(m[3]);
      if (isClaimed(m.index) || !(TIME_STEMS[mu] || LEN_STEMS[mu] || /^(?:gram|kilogram|pound|ounce|liter|milliliter|gallon|quart|pint|cup|ton|mile)$/.test(mu))) continue;
      var u7 = {}; u7[mu] = 1; u7[ustem(m[1])] = -1;
      push(+m[2], u7, m.index, m.index + m[0].length + (/^\s*each\b/i.test(seg.slice(m.index + m[0].length)) ? seg.slice(m.index + m[0].length).match(/^\s*each/i)[0].length : 0), { rate: true });
    }
    /* "6 rows of 8 chocolates": N groups, M things in each */
    re = /(\d+(?:\.\d+)?)\s+(rows?|groups?|boxes|box|bags?|packs?|packets?|teams?|baskets?|trays?|shelves|shelf|piles?|plates?|sets?|bunches|bunch|bundles?|crates?|cartons?|dozens?|rounds?|pairs?|classes|class|tables?|cars?|buses|bus|bottles?|jars?|cups?|pots?|vases?|stacks?|columns?|lines?)\s+of\s+(\d+(?:\.\d+)?)\s+([A-Za-z]+)/gi;
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index)) continue;
      var cont = ustem(m[2]), thing = ustem(m[4]);
      if (NOUN_STOP.test(m[4]) || !thing) continue;
      var uc = {}; uc[cont] = 1;
      var ur = {}; ur[thing] = 1; ur[cont] = -1;
      var firstEnd = m.index + m[1].length + 1 + m[2].length;
      push(+m[1], uc, m.index, firstEnd, {});
      push(+m[3], ur, firstEnd, m.index + m[0].length, { rate: true });
    }
    /* "pens in packs of 12": the container size, with the thing named before or after */
    re = /(?:\b([A-Za-z]+)\s+(?:in|into|per)\s+)?\b(packs?|packets?|boxes|box|bags?|bundles?|sets?|cartons?|crates?|trays?|dozens?|rolls?|bottles?|cases?)\s+of\s+(\d+(?:\.\d+)?)(?:\s+([A-Za-z]+))?/gi;
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index)) continue;
      var thing2 = m[1] && !NOUN_STOP.test(m[1]) ? ustem(m[1]) : (m[4] && !NOUN_STOP.test(m[4]) ? ustem(m[4]) : "");
      if (!thing2 || TIME_STEMS[thing2]) continue;
      var ur2 = {}; ur2[thing2] = 1; ur2[ustem(m[2])] = -1;
      push(+m[3], ur2, m.index, m.index + m[0].length, { rate: true });
    }
    /* "N A on/in each B" and "N A each" */
    re = /(\d+(?:\.\d+)?)\s+([A-Za-z]+)\s+(?:on|in|for|to|into|inside|at)\s+(?:each|every|one)\s+([A-Za-z]+)/gi;
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index)) continue;
      var u4 = {}; u4[ustem(m[2])] = 1; u4[ustem(m[3])] = -1;
      push(+m[1], u4, m.index, m.index + m[0].length, { rate: true });
    }
    re = /(\d+(?:\.\d+)?)\s+([A-Za-z]+)\s+(?:each|apiece)\b/gi;
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index)) continue;
      push(+m[1], { "?": 0, _num: ustem(m[2]) }, m.index, m.index + m[0].length, { rate: true, eachNoun: ustem(m[2]) });
    }
    /* "each X holds/has/costs N [Y]" and "a pack of N X costs $P" is left to the generic reading */
    re = /\b(?:each|every|a|an|one)\s+(?:[A-Za-z]+\s+)?([A-Za-z]+)\s+(?:holds?|has|have|contains?|carries|seats?|fits|can hold|can carry|costs?|weighs?|takes?|uses?)\s+(\$)?(\d+(?:\.\d+)?)(?:\s+([A-Za-z]+))?/gi;
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index)) continue;
      if (/^(?:an?|one)\b/i.test(m[0]) && !new RegExp("\\d\\s+" + ustem(m[1]) + "(?:s|es)?\\b", "i").test(fullText || "") && !new RegExp("how (?:many|much)\\s+" + ustem(m[1]) + "(?:s|es)?\\b|(?:each|every|per|one)\\s+" + ustem(m[1]) + "\\b", "i").test(fullText || "")) continue;
      var ent = ustem(m[1]), nn = m[2] ? D : (m[4] && !NOUN_STOP.test(m[4]) ? ustem(m[4]) : "?");
      var u5 = {}; u5[nn] = 1; u5[ent] = -1;
      push(+m[3], u5, m.index, m.index + m[0].length, { rate: true, wild: nn === "?" });
    }
    /* "A X costs $P" / "X cost $P each": price per X */
    re = /\b(?:an?|one|each|every)?\s*([A-Za-z]+)\s+(?:costs?|sells? for|is priced at|are priced at)\s+\$?\s*(\d+(?:\.\d+)?)(?:\s+dollars?)?(?!\s+for\b)/gi;
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index) || NOUN_STOP.test(m[1])) continue;
      var u6 = {}; u6[D] = 1; u6[ustem(m[1])] = -1;
      /* "N X cost $P" is a total, not a price per X */
      var before = seg.slice(0, m.index).match(/(\d+(?:\.\d+)?)\s*(?:[A-Za-z]+\s+){0,1}$/);
      if (before) continue;
      if (/^(?:an?|one)\b/i.test(m[0].trim()) && !new RegExp("\\d\\s+(?:[a-z]+\\s+)?" + ustem(m[1]) + "(?:s|es)?\\b|how (?:many|much)\\s+(?:[a-z]+\\s+)?" + ustem(m[1]) + "(?:s|es)?\\b|(?:each|every|per|one)\\s+" + ustem(m[1]) + "\\b", "i").test(fullText || "")) continue;
      push(+m[2], u6, m.index, m.index + m[0].length, { rate: true });
    }
    /* generic: a number followed by a unit noun */
    re = /(\$)?(\d+(?:,\d{3})*(?:\.\d+)?|\d*\.\d+)(?:\s*\/\s*(\d+)(?![\d.]))?(%)?/g;
    while ((m = re.exec(seg))) {
      if (isClaimed(m.index)) continue;
      var v = parseFloat(m[2].replace(/,/g, "")), end = m.index + m[0].length, u = {}, hu, isFrac = false;
      if (m[3] && !m[1] && !m[4]) { v = v / parseFloat(m[3]); isFrac = true; }
      if (isFrac) { /* a fraction is a pure number: "3/8 of it" */ }
      else if (m[1]) u[D] = 1;
      else if (m[4]) u.percent = 1;
      else {
        hu = headUnit(seg, end);
        var hl = hu ? ustem(hu) : "";
        if (/^(?:dollar|buck|euro)s?$/.test(hu)) u[D] = 1;
        else if (hu === "cents" || hu === "cent") { u[D] = 1; v = v / 100; }
        else if (hl && !NOUN_STOP.test(hl)) u[hl] = 1;
      }
      push(v, u, m.index, end, isFrac ? { frac: true } : {});
    }
    /* "in a week", "an hour": one of that time unit, usable but not required */
    re = /\b(?:in|for|over|during|after|within|every|per)?\s*\b(?:a|an)\s+(second|minute|hour|day|week|month|year)\b/gi;
    while ((m = re.exec(seg))) {
      var at = m.index + m[0].search(/\b(?:a|an)\s/i);
      if (isClaimed(at) || isClaimed(m.index + m[0].length - 1)) continue;
      var ut = {}; ut[m[1].toLowerCase()] = 1;
      push(1, ut, at, m.index + m[0].length, { optional: true });
    }
    /* optional: a lone "1" in the question ("how much does one pen cost?") */
    if (isQ) out.forEach(function (o) { if (o.v === 1) o.optional = true; });
    out.sort(function (x, y) { return x.pos - y.pos; });
    return out;
  }

  function targetOf2(q, quants) {
    var ql = q.toLowerCase().replace(/[?]/g, ""), m, u;
    if (/\bhow (?:fast|quickly)\b|\b(?:average |top |its |their |the )?speed\b/.test(ql)) return { type: "dim", dim: "speed" };
    if ((m = ql.match(/\bhow (?:much|many) (?:does|do|is|will|would)\s+(?:one|a|an|each|1)\s+([a-z]+)\s+(?:cost|weigh|take|use|hold)/)) ||
        (m = ql.match(/\b(?:what is|what's) the (?:cost|price) of (?:one|a|an|each|1)\s+([a-z]+)/)) || (m = ql.match(/\bhow much (?:for|is) (?:one|a|an|each)\s+([a-z]+)/))) {
      u = { dollar: 1 }; u[ustem(m[1])] = -1; return { type: "unit", u: u };
    }
    if ((m = ql.match(/\bhow (?:many|much)(?: [a-z]+)? (?:does|do|will|would|can)?\s*(?:each|every|one)\s+([a-z]+)\s+(?:get|gets|receive|receives|pay|pays|earn|earns|have|has|eat|eats|take|takes|make|makes|need|needs|contribute|owe|owes|score|scores)\b/))) {
      return { type: "per", den: ustem(m[1]) };
    }
    if (/\bhow (?:many|much)\b[^?]*?\beach\s+(?:one\s+)?(?:get|gets|receive|receives|pay|pays|earn|earns|have|has|eat|eats|take|takes|owe|owes|contribute|contributes)\b/.test(ql)) return { type: "per", den: null };
    if ((m = ql.match(/\bhow (?:many|much)\s+([a-z]+)\s+per\s+([a-z]+)\b/)) && !NOUN_STOP.test(m[1])) {
      u = {}; u[ustem(m[1])] = 1; u[ustem(m[2])] = -1; return { type: "unit", u: u };
    }
    if ((m = ql.match(/\bhow (?:many|much)\s+([a-z]+)\b[^?]*?\b(?:in|on|per|for|to|at|into)\s+(?:each|every|one|a|an)\s+([a-z]+)\b/)) && !NOUN_STOP.test(m[1]) && m[2] !== m[1] && /\b(?:each|every)\b/.test(ql)) {
      u = {}; u[ustem(m[1])] = 1; u[ustem(m[2])] = -1; return { type: "unit", u: u };
    }
    if ((m = ql.match(/\bhow much\s+(?:is|are|does|do|will|would)?\s*(?:be\s+)?(?:each|every)\s+([a-z]+)\b/)) && !NOUN_STOP.test(m[1])) {
      u = { dollar: 1 }; u[ustem(m[1])] = -1; return { type: "unit", u: u };
    }
    if (/\bhow (?:far|much distance)\b|\bwhat (?:distance)\b/.test(ql)) return { type: "dim", dim: "length" };
    if (/\bhow long (?:does|will|would|did|is it going to|should)\b[^.]*?\b(?:take|last|need|ride|walk|run|drive|travel|wait)\b|\bhow long (?:will|would|does)\b/.test(ql)) return { type: "dim", dim: "time" };
    if (/\bhow long (?:is|are)\b|\bhow (?:wide|tall|high|deep)\b/.test(ql)) return { type: "dim", dim: "length" };
    if ((m = ql.match(/\bhow many\s+(?:more\s+|fewer\s+)?(.*)$/))) {
      var hu = headUnit("x" + m[1].replace(/^/, " "), 1);
      if (hu) { u = {}; u[ustem(hu)] = 1; return { type: "unit", u: u }; }
    }
    if (/\bhow much\b|\bwhat is the (?:total )?(?:cost|price)\b|\bhow much (?:change|money)\b/.test(ql) || /\bhow much\b/.test(ql)) {
      if (quants.some(function (x) { return x.u.dollar; }) || /\b(?:cost|pay|spend|earn|price|change|save|owe|money|bill|charge|fee|worth)\b/.test(ql)) return { type: "unit", u: { dollar: 1 } };
      return { type: "any" };
    }
    if (/\bwhat (?:is|are|was|were) (?:the |his |her |their |its )?(?:[a-z]+ )?(?:pay|earnings|income|salary|wages?|bill|profit|revenue|total cost|total price|fee|charge)\b/.test(ql)) return { type: "unit", u: { dollar: 1 } };
    if (/\bwhat is the (?:total|sum)\b|\bwhat (?:is|are) the (?:answer|result)\b|\bhow (?:much|many) in (?:all|total)\b/.test(ql)) return { type: "any", plain: true };
    return null;
  }

  function matchTarget(u, tgt) {
    var k = uKey(u), s = uSingle(u), ks = Object.keys(u);
    if (!tgt) return false;
    if (tgt.type === "any") { if (!ks.length) return false; var np = ks.filter(function (x) { return u[x] > 0; }), nq = ks.filter(function (x) { return u[x] < 0; }); return !u["?"] && ks.every(function (x) { return Math.abs(u[x]) === 1; }) && np.length <= 1 && nq.length <= (tgt.plain ? 0 : 1); }
    if (tgt.type === "unit") return k === uKey(tgt.u) || (s && uKey(tgt.u) === s + "^1");
    if (tgt.type === "per" && tgt.den === null) { var neg0 = ks.filter(function (x) { return u[x] === -1; }); return neg0.length === 1 && ks.length === 2 && !TIME_STEMS[neg0[0]]; }
    if (tgt.type === "per") return u[tgt.den] === -1 && ks.filter(function (x) { return u[x] > 0; }).length === 1 && ks.length === 2;
    if (tgt.type === "dim") {
      if (tgt.dim === "length") return !!(s && LEN_STEMS[s]);
      if (tgt.dim === "time") return !!(s && TIME_STEMS[s]);
      if (tgt.dim === "speed") { var pos = ks.filter(function (x) { return u[x] === 1; }), neg = ks.filter(function (x) { return u[x] === -1; }); return ks.length === 2 && pos.length === 1 && neg.length === 1 && LEN_STEMS[pos[0]] && TIME_STEMS[neg[0]]; }
    }
    return false;
  }

  function fmtDim(v, u, steps) {
    var ks = Object.keys(u).sort(), pos = ks.filter(function (x) { return u[x] > 0; }), neg = ks.filter(function (x) { return u[x] < 0; });
    var numTxt = pos.length ? pos.map(function (x) { return x === "dollar" ? "" : x; }).filter(Boolean) : [];
    var isMoney = u.dollar === 1;
    var core = isMoney ? money(v) : nice(v) + (pos.length === 1 ? " " + plural(pos[0], v) : (pos.length ? " " + numTxt.join(" ") : ""));
    if (isMoney && pos.length === 1) core = money(v);
    if (neg.length) core += " per " + neg.map(function (x) { return x; }).join(" per ");
    return core.trim();
  }

  function dims(S, ratedOnly) {
    var q = S.question;
    if (/\beach (?:brother|sister)\b/i.test(S.all) && /\b(?:brothers?|sisters?)\b/i.test(q)) return null;
    var tgtTextOK = /\bhow (?:many|much|far|fast|long|old|quickly)\b|\bwhat is (?:the|its|his|her|their) (?:total|sum|cost|price|average speed|speed|rate)\b|\baverage speed\b|\bwhat (?:is|are|was|were) (?:the |his |her |their |its )?(?:[a-z]+ )?(?:pay|earnings|income|salary|wages?|bill|profit|revenue|fee|charge)\b/i.test(q);
    if (!tgtTextOK) return null;
    var segs = S.givens.concat([q]), quants = [], g;
    for (g = 0; g < segs.length; g++) Array.prototype.push.apply(quants, quantitiesOf(segs[g], g, g === segs.length - 1, S.all));
    if (quants.length < 1 || quants.length > 7) return null;
    var tgt = targetOf2(q, quants);
    if (!tgt) return null;
    if (ratedOnly && !(tgt.type === "unit" && Object.keys(tgt.u).some(function (k) { return tgt.u[k] < 0; })) && !quants.some(function (x) { return x.rate || (x.frac && !/\b(?:left|remain\w*|rest|still)\b/.test(q.toLowerCase())); }) && !(tgt.type === "per" || tgt.type === "dim") && !(ATTR_ALIAS[(q.toLowerCase().match(/\bhow many ([a-z]+)\b/) || [])[1]] || ATTR[(q.toLowerCase().match(/\bhow many ([a-z]+)\b/) || [])[1]])) {
      var pure = quants.length === 1 && TIME_STEMS[uSingle(quants[0].u)] && tgt.type === "unit" && TIME_STEMS[uSingle(tgt.u)];
      if (!pure) return null;
    }
    var ql = q.toLowerCase(), allL = S.all.toLowerCase(), notes = [];
    /* attributes of kinds: legs of animals, sides of shapes ... */
    var attrKey = null, tm = ql.match(/\bhow many ([a-z]+)\b/);
    if (tm) { var ak = ATTR_ALIAS[tm[1]] || (ATTR[tm[1]] ? tm[1] : null); if (ak && ATTR[ak]) attrKey = ak; }
    if (attrKey) {
      var any = false;
      quants.forEach(function (x) {
        var s = uSingle(x.u);
        if (s && ATTR[attrKey][s] !== undefined && !x.rate) { notes.push(nice(x.v) + " " + plural(s, x.v) + " × " + ATTR[attrKey][s] + " " + plural(attrKey, 2) + " each"); x.v = x.v * ATTR[attrKey][s]; var nu = {}; nu[attrKey] = 1; x.u = nu; any = true; }
      });
      if (!any) return null;
    }
    /* wildcard rates ("each bus holds 15" / "14 candies each"): resolve their missing noun from the givens */
    quants.forEach(function (x) {
      if (x.wild) { var cand = quants.filter(function (y) { return y !== x && !y.rate && uSingle(y.u) && !y.u.dollar && y.g <= x.g; })[0] || quants.filter(function (y) { return y !== x && !y.rate && uSingle(y.u) && !y.u.dollar; })[0]; if (cand) { var nu = {}; nu[uSingle(cand.u)] = 1; var ent = Object.keys(x.u).filter(function (k) { return x.u[k] < 0; })[0]; nu[ent] = -1; x.u = nu; x.wild = false; } }
      if (x.eachNoun) {
        var prev = quants.filter(function (y) { return y !== x && !y.rate && uSingle(y.u) && !y.u.dollar && y.pos < x.pos && y.g === x.g; }).pop() || quants.filter(function (y) { return y !== x && !y.rate && uSingle(y.u) && !y.u.dollar && y.pos < x.pos; }).pop();
        if (prev) { var nu2 = {}; nu2[x.eachNoun] = 1; nu2[uSingle(prev.u)] = -1; x.u = nu2; }
      }
    });
    if (quants.some(function (x) { return x.u["?"] !== undefined || x.u._num; })) return null;
    if (quants.some(function (x) { return !x.optional && !x.frac && !Object.keys(x.u).length; })) return null;
    if (tgt.type === "per" && tgt.den === null) {
      var cnts = quants.filter(function (x) { return !x.rate && uSingle(x.u) && !x.u.dollar && !TIME_STEMS[uSingle(x.u)] && !LEN_STEMS[uSingle(x.u)]; });
      if (cnts.length !== 1) return null;
      tgt = { type: "per", den: uSingle(cnts[0].u) };
    }
    /* durations in a unit other than the rate's */
    var rateT = {};
    quants.forEach(function (x) { Object.keys(x.u).forEach(function (k) { if (x.u[k] < 0 && TIME_STEMS[k]) rateT[k] = 1; }); });
    var rts = Object.keys(rateT), tt = tgt.type === "unit" && uSingle(tgt.u) && TIME_STEMS[uSingle(tgt.u)] ? uSingle(tgt.u) : null;
    var askTm = ql.match(/\bper (hour|minute|second|day)\b|\bin (?:km|kilometers?|miles?|meters?|metres?|feet) per (hour|minute|second)\b/);
    var askT = (askTm && (askTm[1] || askTm[2])) || (/\b(?:km\/h|kph|mph)\b/.test(ql) ? "hour" : (/\bm\/s\b/.test(ql) ? "second" : null));
    var wantT = rts.length === 1 ? rts[0] : (tt || ((tgt.type === "dim" && tgt.dim === "speed") ? askT : null));
    if (wantT) quants.forEach(function (x) {
      var s = uSingle(x.u);
      if (s && TIME_STEMS[s] && s !== wantT) {
        var f = timeConv(s, wantT);
        if (f !== null) { notes.push("1 " + s + " = " + nice(f) + " " + plural(wantT, f)); x.v = x.v * f; var nu = {}; nu[wantT] = 1; x.u = nu; }
      }
    });
    var convDone = false;
    if (tgt.type === "unit" && uSingle(tgt.u)) {
      var tU = uSingle(tgt.u);
      Object.keys(CONV).forEach(function (cat) {
        if (CONV[cat][tU] === undefined) return;
        quants.forEach(function (x) {
          var su = uSingle(x.u);
          if (su && su !== tU && CONV[cat][su] !== undefined && !x.rate) {
            var fct = CONV[cat][su] / CONV[cat][tU];
            convDone = true; notes.push("1 " + su + " = " + nice(fct) + " " + plural(tU, fct)); x.v = x.v * fct; var nu2 = {}; nu2[tU] = 1; x.u = nu2;
          }
        });
      });
    }
    if (!rts.length && !tt && tgt.type === "dim" && tgt.dim === "time") {
      /* "how long ... " with durations in several units: bring to the smallest */
    }
    /* cue words */
    var subCue = /\b(?:left|remain\w*|change|difference|fewer|less|more than|gave|give|gives|spent|spends|spend|lost|loses|ate|eats|used|off|discount|slips?|drains?|how many more|how much more|farther|further|older|younger|take away|took|taken|minus|decrease|reduced|apart)\b/.test(allL);
    var totalCue = /\b(?:total|altogether|in all|together|combined|sum|both|opposite|apart|each other|all together|in total)\b/.test(allL);
    var classSub = false;
    if (tgt.type === "unit" && uSingle(tgt.u) && CLASS_OF[uSingle(tgt.u)]) {
      var cls = CLASS_OF[uSingle(tgt.u)];
      var inGiven = quants.some(function (x) { return uSingle(x.u) === uSingle(tgt.u); });
      if (!inGiven && quants.filter(function (x) { return uSingle(x.u) && CLASS_OF[uSingle(x.u)] === cls; }).length >= 2) classSub = true;
    }
    var cfg = { sub: subCue || classSub, total: totalCue, anyAdd: totalCue && tgt.type === "unit" && uSingle(tgt.u) && !TIME_STEMS[uSingle(tgt.u)] && uSingle(tgt.u) !== "dollar" };
    var items = quants;
    var n = items.length, full = (1 << n) - 1, tab = [], mask, i, k;
    var req = 0; items.forEach(function (x, ix) { if (!x.optional) req |= 1 << ix; });
    for (mask = 0; mask <= full; mask++) tab.push({});
    function put(mk, e) {
      var key = nice(e.v) + "|" + uKey(e.u), cur = tab[mk][key];
      if (!cur || e.cost < cur.cost || (e.cost === cur.cost && e.ops < cur.ops)) tab[mk][key] = e;
    }
    items.forEach(function (x, ix) { put(1 << ix, { v: x.v, u: x.u, ex: nice(x.v), ops: 0, mask: 1 << ix, grp: 1 << x.g, cost: 0, add: 0, subs: 0, div: 0, lo: ix, hi: ix }); });
    function combine(a, b, mk) {
      var v, e;
      var grp = a.grp | b.grp;
      var gapN = 0;
      if (a.hi < b.lo) gapN = popcount(((1 << b.lo) - (1 << (a.hi + 1))) & ~(a.mask | b.mask));
      else if (b.hi < a.lo) gapN = popcount(((1 << a.lo) - (1 << (b.hi + 1))) & ~(a.mask | b.mask));
      var base = { mask: mk, grp: grp, ops: a.ops + b.ops + 1, cost: a.cost + b.cost + 0.3 * gapN, add: a.add + b.add, subs: a.subs + b.subs, div: a.div + b.div, lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi) };
      /* product */
      e = Object.assign({}, base, { v: a.v * b.v, u: uMul(a.u, b.u), ex: "(" + a.ex + " × " + b.ex + ")" });
      if (isFinite(e.v) && smallExp(e.u)) put(mk, e);
      /* quotient, both ways */
      [[a, b], [b, a]].forEach(function (p) {
        var x = p[0], y = p[1];
        if (y.v === 0) return;
        var cross = popcount(x.grp) === 1 && popcount(y.grp) === 1 && x.grp !== y.grp ? 1 : 0;
        var f = Object.assign({}, base, { v: x.v / y.v, u: uMul(x.u, y.u, -1), ex: "(" + x.ex + " ÷ " + y.ex + ")", cost: base.cost + cross, div: base.div + 1 });
        if (isFinite(f.v) && smallExp(f.u)) put(mk, f);
      });
      /* sum */
      var sameU = uKey(a.u) === uKey(b.u);
      var genericAdd = cfg.anyAdd && uSingle(a.u) && uSingle(b.u) && !TIME_STEMS[uSingle(a.u)] && !LEN_STEMS[uSingle(a.u)] && uSingle(a.u) !== "dollar" && uSingle(b.u) !== "dollar";
      if (sameU || genericAdd) {
        var uu = sameU ? a.u : uSingle(a.u) ? (function () { var o = {}; o[uSingle(tgt.u)] = 1; return o; })() : a.u;
        put(mk, Object.assign({}, base, { v: a.v + b.v, u: uu, ex: "(" + a.ex + " + " + b.ex + ")", add: base.add + 1 }));
        if (cfg.sub || classSub) {
          if (a.v - b.v >= 0) put(mk, Object.assign({}, base, { v: a.v - b.v, u: uu, ex: "(" + a.ex + " − " + b.ex + ")", subs: base.subs + 1, cost: base.cost + (cfg.total ? 0.5 : 0) }));
          if (b.v - a.v >= 0) put(mk, Object.assign({}, base, { v: b.v - a.v, u: uu, ex: "(" + b.ex + " − " + a.ex + ")", subs: base.subs + 1, cost: base.cost + (cfg.total ? 0.5 : 0) }));
        }
      } else if (classSub && uSingle(a.u) && uSingle(b.u) && CLASS_OF[uSingle(a.u)] && CLASS_OF[uSingle(a.u)] === CLASS_OF[uSingle(b.u)]) {
        var tu = tgt.u;
        if (a.v - b.v >= 0 && !isNaN(a.v - b.v)) put(mk, Object.assign({}, base, { v: a.v - b.v, u: tu, ex: "(" + a.ex + " − " + b.ex + ")", subs: base.subs + 1 }));
        if (b.v - a.v >= 0) put(mk, Object.assign({}, base, { v: b.v - a.v, u: tu, ex: "(" + b.ex + " − " + a.ex + ")", subs: base.subs + 1 }));
      }
    }
    for (mask = 1; mask <= full; mask++) {
      if (popcount(mask) < 2) continue;
      for (var sub = (mask - 1) & mask; sub > 0; sub = (sub - 1) & mask) {
        var other = mask ^ sub;
        if (sub < other) continue;
        var A = Object.keys(tab[sub]), B = Object.keys(tab[other]);
        for (var ai = 0; ai < A.length; ai++) for (var bi = 0; bi < B.length; bi++) combine(tab[sub][A[ai]], tab[other][B[bi]], mask);
      }
      var ks = Object.keys(tab[mask]);
      if (ks.length > 300) { ks.sort(function (x, y) { return (tab[mask][x].cost * 10 + tab[mask][x].ops) - (tab[mask][y].cost * 10 + tab[mask][y].ops); }); ks.slice(300).forEach(function (kk) { delete tab[mask][kk]; }); }
    }
    var cands = [];
    function collect(reqMask, penalty) {
      for (mask = 1; mask <= full; mask++) {
        if ((mask & reqMask) !== reqMask) continue;
        Object.keys(tab[mask]).forEach(function (kk) {
          var e = tab[mask][kk];
          if (!matchTarget(e.u, tgt)) return;
          if (e.v < 0 || !isFinite(e.v)) return;
          var ucount = uSingle(e.u);
          var isCount = ucount && !TIME_STEMS[ucount] && !LEN_STEMS[ucount] && ucount !== "dollar" && ucount !== "percent";
          var value = e.v, ceil = false;
          if (isCount && Math.abs(value - Math.round(value)) > 1e-9) {
            if (/\b(?:need|needed|required|require|must|at least|enough|fit|fits|hold all|carry all|trips?|buses|boxes|cars|rooms|tables|packs?|packages?)\b/.test(allL) && e.div > 0) { value = Math.ceil(value - 1e-9); ceil = true; }
            else return;
          }
          cands.push({ e: e, value: value, ceil: ceil, score: e.cost * 10 + e.ops + penalty });
        });
      }
    }
    collect(req, 0);
    if (!cands.length) {
      /* a count that opens a sentence may be scenery ("Two trains leave a station ...") */
      var scenery = 0;
      items.forEach(function (x, ix) { if (!x.optional && !x.rate && x.pos < 6 && uSingle(x.u) && !x.u.dollar && !TIME_STEMS[uSingle(x.u)] && !LEN_STEMS[uSingle(x.u)]) scenery |= 1 << ix; });
      if (scenery) { collect(req & ~scenery, 5); }
    }
    if (!cands.length) return null;
    if (items.filter(function (x) { return !x.optional; }).length < 2 && (!notes.length || (!attrKey && !convDone && !/\b(?:in|into|to|per|equal|equals|make|makes|worth)\b/.test(ql)))) return null;
    cands.sort(function (x, y) { return x.score - y.score; });
    var best = cands[0], tied = cands.filter(function (c) { return Math.abs(c.score - best.score) < 1e-9 && Math.abs(c.value - best.value) > 1e-9; });
    if (tied.length) {
      /* prefer the reading that agrees with the cue words */
      var pref = cands.filter(function (c) { return Math.abs(c.score - best.score) < 1e-9; });
      var narrowed = pref.filter(function (c) { return cfg.sub && !totalCue ? c.e.subs > 0 : (totalCue ? c.e.subs === 0 : true); });
      if (items.some(function (x) { return x.frac && x.v > 0 && x.v < 1; }) && narrowed.length > 1) {
        var mults = narrowed.filter(function (c) { return c.e.div === 0; });
        if (mults.length) narrowed = mults;
      }
      if (cfg.sub && !totalCue && narrowed.length > 1) {
        var sameUnit = items.filter(function (x) { return !x.optional; }).every(function (x, ix, arr) { return uKey(x.u) === uKey(arr[0].u); });
        if (sameUnit && items.length >= 3) {
          var firstMinusRest = items[0].v - items.slice(1).reduce(function (a, x) { return a + x.v; }, 0);
          var hit0 = narrowed.filter(function (c) { return Math.abs(c.value - firstMinusRest) < 1e-9; });
          if (hit0.length) narrowed = hit0;
        }
      }
      if (cfg.sub && !totalCue && narrowed.length > 1) {
        var bestNet = Math.max.apply(null, narrowed.map(function (c) { return c.e.subs - c.e.add; }));
        narrowed = narrowed.filter(function (c) { return c.e.subs - c.e.add === bestNet; });
      }
      var vals = {}; narrowed.forEach(function (c) { vals[nice(c.value)] = c; });
      if (Object.keys(vals).length !== 1) return null;
      best = narrowed[0];
    }
    var step = best.e.ex.replace(/^\((.*)\)$/, "$1") + " = " + nice(best.e.v) + (best.ceil ? " → " + nice(best.value) + " (rounded up, since a part-filled one still has to exist)" : "");
    var res = result(best.value, "", notes.concat([step]), "dimensions", { text: fmtDim(best.value, best.e.u), confidence: 0.78 });
    return res;
  }

  /* ---- unknown sides from a perimeter or an area; perimeters of listed sides */
  var POLY = { triangle: 3, quadrilateral: 4, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10 };
  function geoInverse(S) {
    var t = S.all.toLowerCase(), q = geoQ(S.question), m;
    var ns = numbersIn(S.givens.join(" "));
    if (/\bsquare\b/.test(t) && !/\bsquare (?:feet|meters?|metres?|inches|units|miles|kilomet|centimet|yards)\b/.test(t) && ns.length === 1) {
      var pm2 = t.match(/\bperimeter\b[^0-9.]*?(\d+(?:\.\d+)?)/), am2 = t.match(/\barea\b[^0-9.]*?(\d+(?:\.\d+)?)/);
      if (pm2 && /\barea\b/.test(q)) { var sd2 = +pm2[1] / 4; return result(sd2 * sd2, "", ["side = " + pm2[1] + " ÷ 4 = " + nice(sd2), "area = " + nice(sd2) + "² = " + nice(sd2 * sd2)], "geometry"); }
      if (am2 && /\bperimeter\b/.test(q)) { var sq3 = Math.sqrt(+am2[1]); if (Number.isInteger(sq3)) return result(4 * sq3, "", ["side = √" + am2[1] + " = " + sq3, "perimeter = 4 × " + sq3], "geometry"); }
    }
    var wantM = q.match(/\b(length|width|breadth|side|height|base|radius|diameter)\b/);
    /* sides listed: "a triangle has sides 7, 8 and 9. What is its perimeter?" */
    if (/\bperimeter\b/.test(q) && /\bsides?\b/.test(t) && ns.length >= 3 && !/\b(?:each|every|regular|equal)\b/.test(t)) {
      var sum = ns.reduce(function (a, b) { return a + b.v; }, 0);
      return result(sum, "", [ns.map(function (n) { return nice(n.v); }).join(" + ") + " = " + nice(sum)], "geometry");
    }
    /* regular polygon: "a regular hexagon has sides of 5" */
    if (/\bperimeter\b/.test(q) && ns.length === 1) {
      var pm = t.match(/\b(triangle|square|pentagon|hexagon|heptagon|octagon|nonagon|decagon)\b/);
      if (pm && /\b(?:regular|each side|sides? (?:of|are|is|measures?)|equal sides)\b/.test(t)) return result(POLY[pm[1]] * ns[0].v, "", [POLY[pm[1]] + " × " + nice(ns[0].v)], "geometry");
    }
    if (!wantM) return null;
    var want = wantM[1] === "breadth" ? "width" : wantM[1];
    var per = t.match(/\bperimeter\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)/) || t.match(/(\d+(?:\.\d+)?)[a-z ]{0,12}\bperimeter\b/);
    var area = t.match(/\barea\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)/) || t.match(/(\d+(?:\.\d+)?)\s*(?:square|sq)[a-z ]*\barea\b/);
    var wid = t.match(/\bwidth\s*(?:of|is|=)?\s*(\d+(?:\.\d+)?)/) || t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?wide\b/);
    var len = t.match(/\blength\s*(?:of|is|=)?\s*(\d+(?:\.\d+)?)/) || t.match(/(\d+(?:\.\d+)?)\s*(?:[a-z]+\s+)?long\b/);
    var base = t.match(/\bbase\s*(?:of|is|=)?\s*(\d+(?:\.\d+)?)/);
    var isSq = /\bsquare\b/.test(t) && !/\bsquare (?:feet|meters?|metres?|inches|units|miles|kilomet|centimet|yards)\b/.test(t);
    var isTri = /\btriangle\b/.test(t), isCirc = /\bcircle|circular|circumference\b/.test(t);
    var unit = (t.match(/\d\s*(meters?|metres?|feet|foot|inches|inch|cm|centimeters?|km|miles?|yards?|units?)\b/) || [])[1];
    function out(v, how) { return result(v, unit && !/^units?$/.test(unit) ? unit : "", [how], "geometry"); }
    if (isCirc && !isTri) {
      var cm = t.match(/\bcircumference\s*(?:of|is|=)?\s*(\d+(?:\.\d+)?)/);
      if (cm && (want === "radius" || want === "diameter") && ns.length === 1) {
        var d = +cm[1] / Math.PI;
        return result(want === "diameter" ? d : d / 2, "", [want + " = circumference ÷ " + (want === "diameter" ? "π" : "2π")], "geometry", { text: nice((want === "diameter" ? +cm[1] : +cm[1] / 2)) + "/π (about " + nice(want === "diameter" ? d : d / 2) + ")" });
      }
      if (area && want === "radius" && ns.length === 1) { var r = Math.sqrt(+area[1] / Math.PI); return result(r, "", ["radius = √(area ÷ π)"], "geometry"); }
      return null;
    }
    if (isTri && area && base && want === "height" && ns.length === 2) { var h = 2 * +area[1] / +base[1]; return out(h, "2 × " + area[1] + " ÷ " + base[1] + " = " + nice(h)); }
    if (isTri && area && want === "base" && (m = t.match(/\bheight\s*(?:of|is|=)?\s*(\d+(?:\.\d+)?)/)) && ns.length === 2) { var b = 2 * +area[1] / +m[1]; return out(b, "2 × " + area[1] + " ÷ " + m[1] + " = " + nice(b)); }
    if (isSq && ns.length === 1 && (want === "side" || want === "length" || want === "width")) {
      if (per) { var sd = +per[1] / 4; return out(sd, per[1] + " ÷ 4 = " + nice(sd)); }
      if (area) { var sq = Math.sqrt(+area[1]); if (Number.isInteger(sq)) return out(sq, "√" + area[1] + " = " + sq); }
      return null;
    }
    if (ns.length === 2 && (want === "length" || want === "width")) {
      var known = want === "length" ? wid : len;
      if (known && per) { var o = +per[1] / 2 - +known[1]; return out(o, per[1] + " ÷ 2 − " + known[1] + " = " + nice(o)); }
      if (known && area) { var o2 = +area[1] / +known[1]; return out(o2, area[1] + " ÷ " + known[1] + " = " + nice(o2)); }
    }
    return null;
  }

  /* ---- chance, outcomes, deals */
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function fracText(n, d) {
    var g = gcd(n, d), a = n / g, b = d / g, dec = n / d;
    return a + "/" + b + (b === 1 ? "" : " (" + nice(Math.round(dec * 10000) / 10000) + ", or " + nice(Math.round(dec * 10000) / 100) + "%)");
  }
  function probability(S) {
    var q = S.question.toLowerCase(), a = S.all.toLowerCase(), m;
    var asksProb = /\bprobabilit|\bchance|\bodds\b|\blikel(?:y|ihood)\b/.test(q), asksCount = /\bhow many (?:possible |different )?(?:outcomes|ways|combinations|results)\b/.test(q);
    if (!asksProb && !asksCount) return null;
    if (/\b(?:without replacement|not replaced|second|twice in a row|then|both|two (?:cards|balls|marbles)|3 (?:cards|balls|marbles)|\d+ (?:cards|balls|marbles) are)\b/.test(a) && !/\bdice\b|\bdie\b|coin/.test(a)) return null;
    var tails = (a.match(/\b(\d+)\s+(?:fair\s+|standard\s+|regular\s+)?coins?\b/) || [])[1], coins = tails ? +tails : (/\bcoin/.test(a) ? 1 : 0);
    var dice = /\bdice\b/.test(a) ? ((a.match(/\b(\d+)\s+dice\b/) || [])[1] ? +a.match(/\b(\d+)\s+dice\b/)[1] : 2) : (/\bdie\b/.test(a) ? 1 : 0);
    var sides = (a.match(/\b(\d+)[- ]sided\b/) || [])[1]; sides = sides ? +sides : 6;
    if (asksCount) {
      if (dice) return result(Math.pow(sides, dice), "", [sides + "^" + dice + " = " + nice(Math.pow(sides, dice))], "chance", { text: nice(Math.pow(sides, dice)) + " outcomes" });
      if (coins) return result(Math.pow(2, coins), "", ["2^" + coins], "chance", { text: nice(Math.pow(2, coins)) + " outcomes" });
      return null;
    }
    if (dice === 1) {
      var faces = []; for (var f = 1; f <= sides; f++) faces.push(f);
      var test = null;
      if (/\beven\b/.test(q)) test = function (x) { return x % 2 === 0; };
      else if (/\bodd\b/.test(q)) test = function (x) { return x % 2 === 1; };
      else if (/\bprime\b/.test(q)) test = function (x) { if (x < 2) return false; for (var i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; };
      else if ((m = q.match(/\b(?:greater|more|higher|larger|bigger) than (\d+)/))) test = function (x) { return x > +m[1]; };
      else if ((m = q.match(/\b(?:less|fewer|lower|smaller) than (\d+)/))) test = function (x) { return x < +m[1]; };
      else if ((m = q.match(/\bat least (\d+)/))) test = function (x) { return x >= +m[1]; };
      else if ((m = q.match(/\bat most (\d+)/))) test = function (x) { return x <= +m[1]; };
      else if ((m = q.match(/\bmultiple of (\d+)/))) test = function (x) { return x % +m[1] === 0; };
      else if ((m = q.match(/\b(?:rolling|roll|getting|get|land(?:ing)? on|showing) (?:an? |the )?(?:number )?(\d+)\b/))) test = function (x) { return x === +m[1]; };
      if (!test) return null;
      var hit = faces.filter(test).length;
      return result(hit / sides, "", [hit + " of " + sides + " faces"], "chance", { text: fracText(hit, sides) });
    }
    if (dice === 2) {
      var pairs = [], x, y;
      for (x = 1; x <= sides; x++) for (y = 1; y <= sides; y++) pairs.push([x, y]);
      var tp = null;
      if ((m = q.match(/\bsum (?:of|is|equal(?:s)? to|=) (\d+)|\btotal (?:of|is) (\d+)|\badd(?:s|ing)? (?:up )?to (\d+)/))) { var k = +(m[1] || m[2] || m[3]); tp = function (p) { return p[0] + p[1] === k; }; }
      else if (/\b(?:doubles?|same number|a pair|matching)\b/.test(q)) tp = function (p) { return p[0] === p[1]; };
      else if ((m = q.match(/\bsum (?:greater|more|higher) than (\d+)/))) tp = function (p) { return p[0] + p[1] > +m[1]; };
      else if ((m = q.match(/\bsum (?:less|lower|smaller) than (\d+)/))) tp = function (p) { return p[0] + p[1] < +m[1]; };
      else if (/\bsum\b[^?]*\beven\b/.test(q)) tp = function (p) { return (p[0] + p[1]) % 2 === 0; };
      else if ((m = q.match(/\bboth (?:dice )?(?:show|land on|are|come up|roll)?\s*(?:a |an )?(\d+)/))) tp = function (p) { return p[0] === +m[1] && p[1] === +m[1]; };
      if (!tp) return null;
      var hit2 = pairs.filter(tp).length;
      return result(hit2 / pairs.length, "", [hit2 + " of " + pairs.length + " outcomes"], "chance", { text: fracText(hit2, pairs.length) });
    }
    if (coins) {
      if (/\b(?:all|every)\b[^?]*\b(?:heads|tails)\b|\b(?:heads|tails)\b[^?]*\b(?:every|all)\b|\b(?:two|three|\d+)\b[^?]*\b(?:heads|tails) in a row\b/.test(q) && coins >= 1) { return result(1 / Math.pow(2, coins), "", ["(1/2)^" + coins], "chance", { text: fracText(1, Math.pow(2, coins)) }); }
      if ((m = q.match(/\b(\d+)\s+(?:heads|tails)\b/)) && +m[1] === coins) return result(1 / Math.pow(2, coins), "", ["(1/2)^" + coins], "chance", { text: fracText(1, Math.pow(2, coins)) });
      if (coins === 1 && /\b(?:heads|tails)\b/.test(q)) return result(0.5, "", ["1 of 2 faces"], "chance", { text: fracText(1, 2) });
      return null;
    }
    if (/\bdeck\b|\bcards?\b/.test(a) && /\b52\b|\bdeck\b|standard/.test(a)) {
      var cnt = null;
      if (/\bace/.test(q) || /\bking/.test(q) || /\bqueen/.test(q) || /\bjack/.test(q) || /\bany (?:number|rank)/.test(q)) cnt = 4;
      if (/\bheart|\bspade|\bclub|\bdiamond|\bsuit/.test(q)) cnt = 13;
      if (/\bred\b|\bblack\b/.test(q)) cnt = 26;
      if (/\bface card|\bpicture card|\bcourt card/.test(q)) cnt = 12;
      if (cnt === null) return null;
      return result(cnt / 52, "", [cnt + " of 52 cards"], "chance", { text: fracText(cnt, 52) });
    }
    /* coloured things in a bag: "4 red and 6 blue marbles" */
    var pairsC = [], re = /(\d+)\s+([a-z]+)(?=\s*(?:,|and|\.|\s+[a-z]+s\b|$|\s+(?:marbles?|balls?|beads?|cubes?|cards?|sweets?|candies|candy|tokens?|pieces?|socks?|fruits?|apples?|oranges?|pens?|pencils?|buttons?|stickers?)))/g, mm;
    var givensText = S.givens.join(" ").toLowerCase();
    while ((mm = re.exec(givensText))) pairsC.push([+mm[1], mm[2]]);
    var allNums = numbersIn(S.givens.join(" ")).length;
    if (pairsC.length >= 2 && pairsC.length === allNums && numbersIn(S.question).length === 0) {
      var tot = pairsC.reduce(function (s, p) { return s + p[0]; }, 0);
      var named = pairsC.filter(function (p) { return new RegExp("\\b" + p[1] + "\\b").test(q); });
      if (named.length !== 1) return null;
      var good = /\bnot\b|\bisn't\b|\bother than\b/.test(q) ? tot - named[0][0] : named[0][0];
      return result(good / tot, "", [good + " of " + tot], "chance", { text: fracText(good, tot) });
    }
    return null;
  }

  /* ---- what fraction of a whole */
  function fractionAsk(S) {
    var q = S.question.toLowerCase(), a = S.all.toLowerCase(), m;
    if (!/\bwhat (?:fraction|part|portion)\b/.test(q)) return null;
    var ns = numbersIn(S.all);
    /* "what fraction of an hour is 15 minutes" */
    if ((m = q.match(/\bfraction of (?:an?|one|the) (second|minute|hour|day|week|month|year|dozen|meter|metre|kilometer|kilogram|liter|litre|pound|foot|yard|mile)\b/)) && ns.length === 1) {
      var pu = (a.match(/\d\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b/) || [])[1];
      if (pu && TIME_STEMS[ustem(pu)] && TIME_STEMS[m[1]]) {
        var f = timeConv(m[1], ustem(pu));
        if (f) return result(ns[0].v / f, "", [ns[0].v + " " + pu + " of " + nice(f) + " " + plural(ustem(pu), f)], "fraction", { text: fracText(ns[0].v, f) });
      }
      if (m[1] === "dozen") return result(ns[0].v / 12, "", [ns[0].v + " of 12"], "fraction", { text: fracText(ns[0].v, 12) });
      return null;
    }
    if (ns.length === 2 && ns.every(function (n) { return Number.isInteger(n.v) && !n.pct; })) {
      var W = Math.max(ns[0].v, ns[1].v), P = Math.min(ns[0].v, ns[1].v);
      if (W <= 0) return null;
      var rest = /\b(?:left|remain\w*|rest|not|uneaten|unused|unsold|still)\b/.test(q);
      var num = rest ? W - P : P;
      return result(num / W, "", [(rest ? W + " − " + P : P) + " out of " + W], "fraction", { text: fracText(num, W) });
    }
    return null;
  }

  /* ---- what is needed to reach an average, and series sums */
  function averageNeeded(S) {
    var q = S.question.toLowerCase(), a = S.all.toLowerCase(), m;
    if (!/\b(?:average|mean)\b/.test(a) || !/\b(?:need|must|have to|should|required|require|want|get)\b/.test(q + " " + a) || !/\b(?:next|last|final|fourth|fifth|sixth|another|remaining|new|one more|test|game|round)\b/.test(q)) return null;
    var tm = a.match(/\b(?:average|mean)(?:\s+(?:of|to|score of))?\s+(?:of\s+)?(\d+(?:\.\d+)?)/);
    if (!tm) return null;
    var tgt = +tm[1];
    var firstSent = S.givens[0] || "";
    var scores = numbersIn(firstSent).map(function (n) { return n.v; });
    if (scores.length < 3) return null;
    if (scores[scores.length - 1] === scores.length - 1) scores.pop();
    var k = scores.length, sum = scores.reduce(function (x, y) { return x + y; }, 0);
    var need = tgt * (k + 1) - sum;
    var cnt = numbersIn(S.all).length;
    if (cnt !== k + 2 && cnt !== k + 1) return null;
    return result(need, "", [tgt + " × " + (k + 1) + " = " + nice(tgt * (k + 1)), "− " + nice(sum) + " already scored = " + nice(need)], "statistics");
  }
  function series(S) {
    var q = S.question.toLowerCase(), m;
    if (!/\bsum\b|\btotal\b|\badd\b/.test(q)) return null;
    var kinds = { "even numbers?": function (i) { return 2 * i; }, "odd numbers?": function (i) { return 2 * i - 1; }, "(?:positive )?(?:integers?|whole numbers?|natural numbers?|numbers?|counting numbers?)": function (i) { return i; }, "(?:perfect )?squares?|square numbers": function (i) { return i * i; }, "(?:perfect )?cubes?|cube numbers": function (i) { return i * i * i; }, "prime numbers?|primes": null };
    if ((m = q.match(/\bsum of (?:the )?first (\d+) ([a-z ]+?)(?:\?|$| are| is)/))) {
      var n = +m[1], what = m[2].trim(), key = Object.keys(kinds).filter(function (k) { return new RegExp("^(?:" + k + ")$").test(what); })[0];
      if (!key || n > 100000) return null;
      var tot = 0, i;
      if (kinds[key] === null) { var c = 0, x = 2; while (c < n) { var isP = true; for (var d = 2; d * d <= x; d++) if (x % d === 0) { isP = false; break; } if (isP) { tot += x; c++; } x++; } }
      else for (i = 1; i <= n; i++) tot += kinds[key](i);
      return result(tot, "", ["sum of the first " + n + " " + what + " = " + tot], "series");
    }
    if ((m = q.match(/\bsum of (?:all )?(?:the )?(?:integers|numbers|whole numbers)?\s*from (\d+) to (\d+)/))) {
      var lo = +m[1], hi = +m[2]; if (hi < lo || hi - lo > 1e7) return null;
      var tt = (lo + hi) * (hi - lo + 1) / 2; return result(tt, "", ["(" + lo + " + " + hi + ") × " + (hi - lo + 1) + " ÷ 2 = " + tt], "series");
    }
    return null;
  }

  /* ---- a number puzzle: "twice a number plus 6 is 20", "I think of a number, add 9 and get 31" */
  function lin(a, b) { return { a: a, b: b }; }
  function numPuzzle(S) {
    var t = S.all.toLowerCase().replace(/\s+/g, " ");
    if (!/\b(?:number|it)\b/.test(t) || !/\bwhat(?:'s| is) (?:the|my|that|this|your) (?:number|original number)\b|\bfind the number\b|\bwhat number\b|\bwhich number\b|\bwhat was the number\b/.test(S.question.toLowerCase()) && !/\b(?:larger|smaller|greater|bigger|lesser) (?:number|one)\b|\bthe two numbers\b/.test(S.question.toLowerCase())) return null;
    var m, ql = S.question.toLowerCase();
    /* two numbers with a sum and a difference */
    if ((m = t.match(/\bsum of (?:two|2|the two|the 2) numbers is (\d+(?:\.\d+)?)[^.]*?\bdifference is (\d+(?:\.\d+)?)/)) || (m = t.match(/\b(?:two|2) numbers[^.]*?\bsum[^0-9.]*(\d+(?:\.\d+)?)[^.]*?\bdifference[^0-9.]*(\d+(?:\.\d+)?)/))) {
      var s = +m[1], d = +m[2], big = (s + d) / 2, small = (s - d) / 2;
      if (/\b(?:larger|greater|bigger|larger|bigger|greatest|biggest)\b/.test(ql)) return result(big, "", [(s + " + " + d) + " ÷ 2 = " + nice(big)], "puzzle");
      if (/\b(?:smaller|lesser|less|smallest)\b/.test(ql)) return result(small, "", [(s + " − " + d) + " ÷ 2 = " + nice(small)], "puzzle");
      return result(big + " and " + small, "", [], "puzzle", { text: nice(big) + " and " + nice(small) });
    }
    var sm = t.match(/(?:sum|total|add up to|adds up to|add to|adds to|together)[^0-9.]*(\d+(?:\.\d+)?)/);
    var km = t.match(/\bone (?:number |of them )?(?:is )?(twice|double|triple|thrice|half|(\d+(?:\.\d+)?) times)(?: as (?:much|big|large|many) as| of)? the other\b/);
    if (sm && km) {
      var K0 = km[2] ? +km[2] : { twice: 2, double: 2, triple: 3, thrice: 3, half: 0.5 }[km[1]], T0 = +sm[1];
      var small = T0 / (1 + K0), big = small * K0, hi = Math.max(small, big), lo = Math.min(small, big);
      if (/\b(?:larger|greater|bigger|greatest|biggest)\b/.test(ql)) return result(hi, "", [T0 + " \u00f7 (1 + " + nice(K0) + ") = " + nice(small)], "puzzle");
      if (/\b(?:smaller|lesser|least|smallest)\b/.test(ql)) return result(lo, "", [T0 + " \u00f7 (1 + " + nice(K0) + ") = " + nice(small)], "puzzle");
    }
    var X = lin(1, 0);
    function K(v) { return lin(0, v); }
    function add(p, r) { return lin(p.a + r.a, p.b + r.b); }
    function sc(p, f) { return lin(p.a * f, p.b * f); }
    var NUMRE = "(-?\\d+(?:\\.\\d+)?)";
    function ev(sx) {
      sx = sx.trim().replace(/^(?:the\s+)?/, "").replace(/[,.]+$/, "");
      var mm;
      if (/^(?:a|the|my|that|this|some|an unknown|x|n|it)(?: number| unknown)?$/.test(sx) || /^(?:the )?number$/.test(sx)) return X;
      if ((mm = sx.match(new RegExp("^" + NUMRE + "$")))) return K(+mm[1]);
      var parts;
      if ((parts = sx.match(/^(.+?)\s+(?:plus|added to|increased by|and)\s+(.+)$/))) { var l = ev(parts[1]), r = ev(parts[2]); return l && r ? add(l, r) : null; }
      if ((parts = sx.match(/^(.+?)\s+(?:minus|decreased by|reduced by|diminished by|less)\s+(.+)$/))) { var l2 = ev(parts[1]), r2 = ev(parts[2]); return l2 && r2 ? add(l2, sc(r2, -1)) : null; }
      if ((parts = sx.match(new RegExp("^" + NUMRE + "\\s+(?:more|greater|larger|higher|bigger|added to)(?: than)?\\s+(.+)$")))) { var e1 = ev(parts[2]); return e1 ? add(e1, K(+parts[1])) : null; }
      if ((parts = sx.match(new RegExp("^" + NUMRE + "\\s+(?:less|fewer|smaller|lower)\\s+than\\s+(.+)$")))) { var e2 = ev(parts[2]); return e2 ? add(e2, K(-parts[1])) : null; }
      if ((parts = sx.match(new RegExp("^" + NUMRE + "\\s+(?:times|multiplied by)\\s+(.+)$")))) { var e3 = ev(parts[2]); return e3 ? sc(e3, +parts[1]) : null; }
      if ((parts = sx.match(new RegExp("^(.+?)\\s+(?:times|multiplied by|divided by|over)\\s+" + NUMRE + "$")))) { var e4 = ev(parts[1]); var isDiv = /divided by|over/.test(sx); return e4 ? sc(e4, isDiv ? 1 / +parts[2] : +parts[2]) : null; }
      if ((parts = sx.match(/^(?:twice|double|two times)\s+(.+)$/))) { var e5 = ev(parts[1]); return e5 ? sc(e5, 2) : null; }
      if ((parts = sx.match(/^(?:triple|thrice|three times)\s+(.+)$/))) { var e6 = ev(parts[1]); return e6 ? sc(e6, 3) : null; }
      if ((parts = sx.match(/^(?:half|half of)\s+(.+)$/))) { var e7 = ev(parts[1]); return e7 ? sc(e7, 0.5) : null; }
      if ((parts = sx.match(/^(?:a |one )?(third|quarter|fifth|tenth) of\s+(.+)$/))) { var e8 = ev(parts[2]); return e8 ? sc(e8, 1 / { third: 3, quarter: 4, fifth: 5, tenth: 10 }[parts[1]]) : null; }
      if ((parts = sx.match(/^the sum of\s+(.+?)\s+and\s+(.+)$/))) { var l3 = ev(parts[1]), r3 = ev(parts[2]); return l3 && r3 ? add(l3, r3) : null; }
      if ((parts = sx.match(/^the difference of\s+(.+?)\s+and\s+(.+)$/))) { var l4 = ev(parts[1]), r4 = ev(parts[2]); return l4 && r4 ? add(l4, sc(r4, -1)) : null; }
      return null;
    }
    function finish(f, rhs, how) {
      if (!f || Math.abs(f.a) < 1e-12) return null;
      var x = (rhs - f.b) / f.a;
      return result(x, "", [how || "solving " + nice(f.a) + "x " + (f.b < 0 ? "− " + nice(-f.b) : "+ " + nice(f.b)) + " = " + nice(rhs) + " gives x = " + nice(x)], "puzzle");
    }
    var sents = sentences(S.all).concat([]).map(function (z) { return z.toLowerCase().replace(/[?!]+$/, "").replace(/\.$/, ""); });
    /* algebraic form: "<expression> (equals|is|gives|makes) <n>" */
    for (var i = 0; i < sents.length; i++) {
      var sx = sents[i];
      if ((m = sx.match(new RegExp("^(?:if )?(?:the )?(.*?\\b(?:number|it)\\b.*?)\\s*(?:,\\s*)?(?:is equal to|equals|gives|makes|results in|is|=|the result is|produces|comes to|yields|will be|would be)\\s+" + NUMRE + "$")))) {
        if (/^(?:what|which|find|how)\b/.test(m[1])) continue;
        var f = ev(m[1].replace(/^(?:what is )/, ""));
        if (f && f.a !== 0) return finish(f, +m[2]);
      }
    }
    /* procedural form: "I think of a number, double it, subtract 3 and get 17" */
    var joined = sents.join(". ");
    var pm = joined.match(/\b(?:think(?:ing)? of|pick(?:ed)?|choose|chose|have|start(?:ed)? with|take|had)\s+a\s+number\b[^.]*?[.,]\s*(.*?)\s*(?:,?\s*(?:and|then)\s+)?(?:get|got|end(?:s|ed)? up with|result(?:s|ed)? in|the result is|the answer is|obtain|arrive at|have|am left with|is left with|equals?)\s+(-?\d+(?:\.\d+)?)/) ||
             joined.match(/\ba number[^.]*?(?:,|\.)\s*(?:i\s+)?(.*?)\s*(?:,?\s*(?:and|then)\s+)?(?:get|got|end(?:s|ed)? up with|result(?:s|ed)? in|the result is|the answer is|obtain|arrive at)\s+(-?\d+(?:\.\d+)?)/);
    if (pm) {
      var ops = pm[1].split(/\s*(?:,|;|\bthen\b|\band\b)\s*/).map(function (z) { return z.replace(/^(?:i|we|you|then|next|now)\s+/, "").trim(); }).filter(Boolean);
      var cur = X, okp = true;
      ops.forEach(function (op) {
        var mo;
        if (!okp) return;
        if (/^(?:double|doubles)\b/.test(op)) cur = sc(cur, 2);
        else if (/^(?:triple|triples)\b/.test(op)) cur = sc(cur, 3);
        else if (/^(?:halve|halves|half)\b/.test(op)) cur = sc(cur, 0.5);
        else if ((mo = op.match(new RegExp("^(?:add|adds|plus)\\s+" + NUMRE)))) cur = add(cur, K(+mo[1]));
        else if ((mo = op.match(new RegExp("^(?:subtract|subtracts|minus|take away|takes away|remove|deduct)\\s+" + NUMRE)))) cur = add(cur, K(-mo[1]));
        else if ((mo = op.match(new RegExp("^(?:multiply|multiplies|times)(?: it)?(?: by)?\\s+" + NUMRE)))) cur = sc(cur, +mo[1]);
        else if ((mo = op.match(new RegExp("^(?:divide|divides)(?: it)?(?: by)?\\s+" + NUMRE)))) cur = sc(cur, 1 / +mo[1]);
        else okp = false;
      });
      if (okp && ops.length) return finish(cur, +pm[2]);
    }
    return null;
  }

  /* ---- percentage markups */
  function markup(S) {
    var a = S.all, m;
    if ((m = a.match(/\bmark(?:s|ed)?\s+(up|down)\s+(?:a |an |the )?(?:[a-z]+\s+)?\$?(\d+(?:\.\d+)?)(?:\s+dollars?)?\s*(?:[a-z]+\s+)?(?:item|product|price|shirt|toy|book|bag|phone|ticket|[a-z]+)?\s*by\s+(\d+(?:\.\d+)?)%/i)) && numbersIn(a).length === 2) {
      var up = /up/i.test(m[1]), v = +m[2] * (1 + (up ? 1 : -1) * +m[3] / 100);
      return result(v, "", [m[2] + " × (1 " + (up ? "+" : "−") + " " + m[3] + "/100) = " + nice(v)], "percent", { money: true });
    }
    return null;
  }


  /* ---- setups the generic quantity reader cannot see: goals, approach, reversals, circles, ranges, ages */
  function countOf(a, re) { var n = 0, m, r = new RegExp(re.source, "gi"); while ((m = r.exec(a))) n++; return n; }
  function savingsGoal(S) {
    var a = S.all, ql = S.question.toLowerCase(), mu = ql.match(/\bhow many (weeks?|months?|days?|years?)\b/);
    if (!mu || !/\b(?:until|before|till|to|can)\b[^?]*\b(?:buy|afford|reach|save|enough|get|have)\b/.test(ql)) return null;
    var money = [], re = /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)/g, m;
    while ((m = re.exec(a))) money.push({ v: parseFloat(m[1].replace(/,/g, "")), at: m.index, end: m.index + m[0].length });
    if (money.length !== 3 || numbersIn(a).length !== 3) return null;
    var rate = null, have = null, goal = null;
    money.forEach(function (x) {
      var after = a.slice(x.end, x.end + 24), before = a.slice(Math.max(0, x.at - 30), x.at);
      if (/^\s*(?:a|an|per|each|every|\/)\s*(?:week|month|day|year)/i.test(after) || /\b(?:saves?|earns?|adds?|puts? away|gets?|makes?)\s*$/i.test(before)) rate = rate || x;
      else if (/\b(?:has|have|had|already|saved|with|owns?|started with)\s*(?:saved\s*)?$/i.test(before)) have = have || x;
      else goal = goal || x;
    });
    if (!rate || !have || !goal || rate === have || have === goal) return null;
    var n = Math.ceil((goal.v - have.v) / rate.v);
    if (!(n >= 0)) return null;
    var u = mu[1].replace(/s$/, "");
    return result(n, plural(u, n), ["(" + goal.v + " − " + have.v + ") ÷ " + rate.v + " = " + nice((goal.v - have.v) / rate.v) + ", rounded up"], "goal");
  }
  function meeting(S) {
    var a = S.all, ql = S.question.toLowerCase();
    if (!/\b(?:toward|towards)\s+each other|\bapproach(?:ing)? each other|\bcome together\b/i.test(a) || !/\bhow (?:many|long)\b|\bwhen\b|\bafter how\b/.test(ql)) return null;
    var dm = a.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?|miles?|meters?|m)\b[^.?]*?\bapart\b/i) || a.match(/\bapart\b[^.?]*?(\d+(?:\.\d+)?)\s*(km|kilometers?|miles?|meters?|m)\b/i) || a.match(/\b(?:distance|gap)\b[^.?]*?(\d+(?:\.\d+)?)\s*(km|kilometers?|miles?|meters?|m)\b/i);
    var sm = a.match(/(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)\s*(km\/h|kph|mph|mi\/h|m\/s|miles per hour|kilometers per hour|km per hour|meters per second)/i);
    var v1, v2, su;
    if (sm) { v1 = +sm[1]; v2 = +sm[2]; su = sm[3].toLowerCase(); }
    else { var all = []; var r2 = /(\d+(?:\.\d+)?)\s*(km\/h|kph|mph|mi\/h|m\/s|miles per hour|kilometers per hour|km per hour|meters per second)/gi, mm; while ((mm = r2.exec(a))) all.push(mm); if (all.length !== 2) return null; v1 = +all[0][1]; v2 = +all[1][1]; su = all[1][2].toLowerCase(); }
    if (!dm) return null;
    if (numbersIn(a).some(function (n) { return n.v !== +dm[1] && n.v !== v1 && n.v !== v2 && n.v > 3; })) return null;
    var D = +dm[1], t = D / (v1 + v2), perSec = /m\/s|meters per second/.test(su);
    var mins = /\bminutes?\b/.test(ql), hrs = perSec ? t / 3600 : t;
    if (mins && !perSec) return result(t * 60, "minutes", [D + " ÷ (" + v1 + " + " + v2 + ") = " + nice(t) + " h = " + nice(t * 60) + " min"], "meeting");
    return result(t, perSec ? "seconds" : (t === 1 ? "hour" : "hours"), [D + " ÷ (" + v1 + " + " + v2 + ") = " + nice(t)], "meeting");
  }
  function reversePercent(S) {
    var a = S.all, ql = S.question.toLowerCase(), m;
    if (!/\b(?:original|regular|initial|before|starting|list|full|marked|old)\s+(?:price|cost|value|amount)|\bwhat was (?:the )?(?:price|cost)\b|\bhow much (?:did|was) (?:it|the \w+) cost before\b/.test(ql)) return null;
    m = a.match(/\$\s*(\d+(?:\.\d+)?)\s+after\s+(?:a |an |the )?(\d+(?:\.\d+)?)\s*%\s*(discount|decrease|reduction|markdown|off|increase|markup|tax|raise|rise|drop)/i);
    if (!m) return null;
    if (numbersIn(a).length !== 2) return null;
    var P = +m[1], r = +m[2] / 100, down = /discount|decrease|reduction|markdown|off|drop/i.test(m[3]);
    var orig = P / (down ? 1 - r : 1 + r);
    return result(orig, "", [P + " ÷ (1 " + (down ? "−" : "+") + " " + nice(r) + ") = " + nice(orig)], "percent", { money: true });
  }
  function circleCalc(S) {
    var a = S.all, ql = S.question.toLowerCase(), m;
    if (!/\b(?:circle|circular|wheel|pizza|coin|disc|disk)\b/i.test(a) || !/\b(circumference|area|perimeter)\b/.test(ql)) return null;
    var rm = a.match(/\bradius (?:of |is |= )?(\d+(?:\.\d+)?)/i), dm = a.match(/\bdiameter (?:of |is |= )?(\d+(?:\.\d+)?)/i);
    var pm = a.match(/\b(?:use|using|take|with|let)\s+(?:π|pi)?\s*(?:=|as|≈)?\s*(3\.14(?:159)?|22\/7|3\.1416)/i), pi = Math.PI, piTxt = "π";
    if (pm) { pi = /\//.test(pm[1]) ? 22 / 7 : +pm[1]; piTxt = pm[1]; }
    var r = rm ? +rm[1] : (dm ? +dm[1] / 2 : null);
    if (r === null) return null;
    var want = /circumference|perimeter/.test(ql) ? "c" : "a", v = want === "c" ? 2 * pi * r : pi * r * r;
    var given = 1 + (pm ? 1 : 0);
    if (numbersIn(a).length !== given) return null;
    var txt = pm ? nice(Math.round(v * 1e4) / 1e4) : "about " + nice(Math.round(v * 100) / 100);
    return result(v, "", [want === "c" ? "2 × " + piTxt + " × " + nice(r) + " = " + txt : piTxt + " × " + nice(r) + "² = " + txt], "circle", { text: txt });
  }
  function packPrice(S) {
    var a = S.all, ql = S.question.toLowerCase(), m = a.match(/\b(?:pack|box|bag|set|carton|bundle|case|crate|bottle|tray|roll|packet|dozen)\s+of\s+(\d+(?:\.\d+)?)\s+([a-z]+)\s+(?:costs?|is|sells? for|are|go for)\s+\$\s*(\d+(?:\.\d+)?)/i);
    if (!m || !/\b(?:one|each|a single|1|per|every|an?)\s+([a-z]+)/.test(ql) || !/\b(?:cost|price|how much)\b/.test(ql)) return null;
    if (numbersIn(S.givens.join(" ")).length !== 2) return null;
    var v = +m[3] / +m[1];
    return result(v, "", [m[3] + " ÷ " + m[1] + " = " + nice(v)], "price", { money: true });
  }
  function fencePen(S) {
    var a = S.all, ql = S.question.toLowerCase(), m = a.match(/\b(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?|feet|ft|yards?|km|cm)\s+of\s+(?:fence|fencing|rope|wire|string|border|edging|ribbon)\b/i);
    if (!m || !/\barea\b/.test(ql) || numbersIn(a).length !== 1) return null;
    var P = +m[1];
    if (/\bsquare\b/i.test(a)) { var side = P / 4; return result(side * side, "", ["side = " + P + " ÷ 4 = " + nice(side), "area = " + nice(side) + "² = " + nice(side * side)], "geometry"); }
    return null;
  }
  function basket(S) {
    var q = S.question, ql = q.toLowerCase();
    if (!/\b(?:total|how much|cost|pay|spend)\b/.test(ql) || !/\d/.test(q)) return null;
    var price = {}, re = /\b(?:an?|one|each|every)\s+([a-z]+)\s+(?:costs?|is|sells? for|is priced at)\s+\$\s*(\d+(?:\.\d+)?)/gi, m, np = 0;
    var givens = S.givens.join(" ");
    while ((m = re.exec(givens))) { price[ustem(m[1])] = +m[2]; np++; }
    if (np < 2 || numbersIn(givens).length !== np) return null;
    var terms = [], steps = [], rc = /(\d+(?:\.\d+)?)\s+([a-z]+)/gi, nq = numbersIn(q).length, used = 0;
    while ((m = rc.exec(q))) { var k = ustem(m[2]); if (price[k] === undefined) return null; terms.push(+m[1] * price[k]); steps.push(m[1] + " × " + price[k]); used++; }
    if (!used || used !== nq) return null;
    var tot = terms.reduce(function (x, y) { return x + y; }, 0);
    return result(tot, "", [steps.join(" + ") + " = " + nice(tot)], "price", { money: true });
  }
  function fuelRange(S) {
    var a = S.all, ql = S.question.toLowerCase();
    if (!/\bhow (?:far|many (?:km|kilometers|miles))\b/.test(ql) || !/\b(?:tank|fuel|gas|petrol|battery)\b/i.test(a)) return null;
    var cm = a.match(/(\d+(?:\.\d+)?)\s*(liters?|litres?|gallons?|l|kwh)\s*(?:per|every|for each|\/)\s*(\d+(?:\.\d+)?)\s*(km|kilometers?|miles?|mi)\b/i);
    if (!cm) return null;
    var rest = a.replace(cm[0], " "), tm = rest.match(/(\d+(?:\.\d+)?)\s*(?:liters?|litres?|gallons?|l|kwh)\b/i);
    if (!tm || numbersIn(a).length !== 3) return null;
    var d = +tm[1] / +cm[1] * +cm[3], u = /^mi/i.test(cm[4]) ? "miles" : "km";
    return result(d, u, [tm[1] + " ÷ " + cm[1] + " × " + cm[3] + " = " + nice(Math.round(d * 100) / 100)], "range", { text: nice(Math.round(d * 10) / 10) + " " + u });
  }
  function ageFuture(S) {
    var a = S.all, ql = S.question.toLowerCase(), m = a.match(/\b([A-Z][a-z]+) is (twice|double|three times|four times|half|\d+ times) as old as (?:(?:his|her|their|the) )?([A-Za-z]+)/);
    if (!m || !/\bhow old\b/.test(ql)) return null;
    var k = { twice: 2, double: 2, half: 0.5, "three times": 3, "four times": 4 }[m[2].toLowerCase()];
    if (k === undefined) k = parseFloat(m[2]);
    var tm = a.match(/\bin (\d+) years?\b/i), sm = a.match(/\b(?:sum|total) of (?:their|both|the|our) (?:two )?ages (?:will be|is|are|equals?|=)\s+(\d+)\b|\btogether (?:they|their ages) (?:are|is|will be|add up to)\s+(\d+)\b/i);
    if (!sm) return null;
    var tot = +(sm[1] || sm[2]), t = tm ? +tm[1] : 0, B = (tot - 2 * t) / (k + 1), A = k * B;
    var who = (S.question.match(/\bhow old (?:is|was|are) (?:the |his |her )?([A-Za-z]+)/i) || [])[1];
    if (!who) return null;
    who = who.toLowerCase();
    var val = who === m[1].toLowerCase() ? A : (who === m[3].toLowerCase() ? B : null);
    if (val === null || !(val >= 0)) return null;
    return result(val, "years old", ["(" + tot + " − 2×" + t + ") ÷ (" + nice(k) + " + 1) = " + nice(B) + " for " + m[3]], "age", { text: nice(val) + " years old" });
  }

  /* ---- facts about kinds: "how many sides does a hexagon have", interior angles */
  function shapeFacts(S) {
    var q = S.question.toLowerCase(), m;
    if (numbersIn(S.question).length) return null;
    if ((m = q.match(/\bhow many ([a-z]+) (?:does|do|has|have|did) (?:a |an |the |one )?([a-z]+?)s?(?: have| has)?\??$/)) || (m = q.match(/\bhow many ([a-z]+) (?:does|do) (?:a |an |the |one )?([a-z]+) have\b/))) {
      var attr = ATTR_ALIAS[m[1]] || m[1], kind = ustem(m[2]);
      if (ATTR[attr] && ATTR[attr][kind] !== undefined) { var n = ATTR[attr][kind]; return result(n, "", [kind + " → " + n + " " + plural(attr, n)], "fact", { text: n + " " + plural(attr, n) }); }
    }
    if ((m = q.match(/\b(?:sum of|total of)(?: all)? (?:the )?(?:interior )?angles (?:of|in) (?:a |an |the )?([a-z]+)/)) && POLY[ustem(m[1])] !== undefined) {
      var sides = POLY[ustem(m[1])], deg = (sides - 2) * 180;
      return result(deg, "", ["(" + sides + " − 2) × 180 = " + deg], "fact", { text: deg + " degrees" });
    }
    return null;
  }

  /* ---- two things, a total and a difference: a bat and a ball ... */
  function pairSystem(S) {
    var a = S.all, m, tm;
    var dm = a.match(/\b(?:the |a |an )?([a-z]+)\s+(?:costs?|is|weighs?|has|have|are)\s+(?:\$\s*)?(\d+(?:\.\d+)?)(?:\s+(?:dollars?|years?|kg|kilograms?|pounds?))?\s+(more|less|fewer|older|younger|heavier|lighter|taller|shorter|longer|greater)\s+than\s+(?:the |a |an )?([a-z]+)/i);
    if (!dm) return null;
    var big = /more|older|heavier|taller|longer|greater/i.test(dm[3]), D = +dm[2], X = ustem(dm[1]), Y = ustem(dm[4]);
    var rest = a.replace(dm[0], " ");
    tm = rest.match(/\b(?:together|in total|in all|altogether|total|combined|sum)\b[^0-9$]*\$?\s*(\d+(?:\.\d+)?)/i) || rest.match(/\$?\s*(\d+(?:\.\d+)?)\b[^.?!]*?\b(?:together|in total|in all|altogether|combined|total)\b/i);
    if (!tm || numbersIn(a).length !== 2) return null;
    var T = +tm[1];
    var ql = S.question.toLowerCase();
    var small = (T - (big ? D : -D)) / 2, large = small + (big ? D : -D);
    var Xv = big ? large : small, Yv = big ? small : large;
    var asked = new RegExp("\\b" + Y + "s?\\b").test(ql) ? "Y" : (new RegExp("\\b" + X + "s?\\b").test(ql) ? "X" : null);
    if (!asked) return null;
    var val = asked === "X" ? Xv : Yv;
    if (val < 0) return null;
    var isMoney = /\$|dollar/.test(a);
    return result(val, "", [X + " + " + Y + " = " + T, X + " − " + Y + " = " + (big ? "+" : "−") + D, "so " + (asked === "X" ? X : Y) + " = " + nice(val)], "puzzle", isMoney ? { money: true, text: val < 1 && val > 0 ? nice(Math.round(val * 100)) + " cents (" + money(val) + ")" : money(val) } : {});
  }


  /* ---- a fraction of a number: "what is 2/3 of 45", "three quarters of 80" */
  function fractionOfNumber(S) {
    var q = S.all.toLowerCase().replace(/[?]/g, ""), m;
    if (S.givens.length > 1) return null;
    var WORDF = { half: [1, 2], third: [1, 3], quarter: [1, 4], fourth: [1, 4], fifth: [1, 5], sixth: [1, 6], eighth: [1, 8], tenth: [1, 10], thirds: [1, 3], quarters: [1, 4], fifths: [1, 5] };
    if ((m = q.match(/\bwhat is (\d+)\s*\/\s*(\d+) of (\d+(?:\.\d+)?)\b/))) {
      var v = +m[1] / +m[2] * +m[3];
      return result(v, "", [m[1] + "/" + m[2] + " × " + m[3] + " = " + nice(v)], "fraction");
    }
    if ((m = q.match(/\bwhat is (?:(\d+)|an?|one) (half|third|quarter|fourth|fifth|sixth|eighth|tenth|thirds|quarters|fifths) of (\d+(?:\.\d+)?)\b/))) {
      var f = WORDF[m[2]], num = m[1] ? +m[1] : 1, v2 = num * f[0] / f[1] * +m[3];
      return result(v2, "", [num + "/" + f[1] + " × " + m[3] + " = " + nice(v2)], "fraction");
    }
    return null;
  }

  /* ---- the missing angle of a triangle or quadrilateral, complements and supplements */
  function angles(S) {
    var t = S.all.toLowerCase(), q = S.question.toLowerCase(), m;
    var ns = numbersIn(S.givens.join(" ")).filter(function (n) { return !/^(?:angles?|sides?|numbers?)$/.test(n.unit); });
    if (!/\bangles?\b/.test(t) || !/\b(?:missing|third|fourth|remaining|other|last|what is|find|how many degrees|how big)\b/.test(q)) return null;
    var total = /\btriangle\b/.test(t) ? 180 : (/\b(?:quadrilateral|rectangle|square|parallelogram|trapezoid|rhombus)\b/.test(t) ? 360 : (/\bpentagon\b/.test(t) ? 540 : (/\bhexagon\b/.test(t) ? 720 : null)));
    if (total !== null && ns.length >= 2) {
      var vals = ns.filter(function (n) { return n.v < total; }).map(function (n) { return n.v; });
      if (vals.length === ns.length) { var rest = total - vals.reduce(function (a, b) { return a + b; }, 0); if (rest > 0) return result(rest, "", [total + " − (" + vals.join(" + ") + ") = " + nice(rest)], "geometry", { text: nice(rest) + " degrees" }); }
    }
    if (ns.length === 1 && /\bcomplement(?:ary)?\b/.test(t)) return result(90 - ns[0].v, "", ["90 − " + nice(ns[0].v)], "geometry", { text: nice(90 - ns[0].v) + " degrees" });
    if (ns.length === 1 && /\bsupplement(?:ary)?\b/.test(t)) return result(180 - ns[0].v, "", ["180 − " + nice(ns[0].v)], "geometry", { text: nice(180 - ns[0].v) + " degrees" });
    return null;
  }
  /* ---- walking north and east: how far from the start */
  function displacement(S) {
    var t = S.all.toLowerCase(), q = S.question.toLowerCase();
    if (!/\bhow far\b[^?]*\b(?:from|away from|is (?:he|she|it|they) from)\b|\bstraight[- ]line distance\b|\bdistance (?:from|between) (?:the )?(?:start|starting|origin|home)\b/.test(q)) return null;
    var dx = 0, dy = 0, found = 0, re = /(\d+(?:\.\d+)?)\s*(?:km|kilometers?|miles?|meters?|metres?|m|blocks?|steps?|feet|ft|yards?)?\s*(?:to the\s+)?(north|south|east|west)\b/g, m;
    var usedNums = 0;
    while ((m = re.exec(t))) { var v = +m[1]; found++; usedNums++; if (m[2] === "north") dy += v; else if (m[2] === "south") dy -= v; else if (m[2] === "east") dx += v; else dx -= v; }
    if (found < 2 || usedNums !== numbersIn(S.all).length) return null;
    var d = Math.sqrt(dx * dx + dy * dy);
    return result(d, "", ["√(" + nice(dx) + "² + " + nice(dy) + "²) = " + nice(d)], "geometry");
  }
  /* ---- "a number" algebra phrases handled elsewhere; here: X more than / twice plus */
  function dimsRated(S) { return dims(S, true); }
  var READERS = [savingsGoal, basket, meeting, reversePercent, circleCalc, packPrice, fencePen, fuelRange, ageFuture, shapeFacts, angles, displacement, fractionOfNumber, pairSystem, geoInverse, geometry, probability, fractionAsk, averageNeeded, series, numPuzzle, statistics, clock, markup, prices, percent, rates, linear, dimsRated, narrative, dims];

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
    givens = elideUnits(givens, qsent.trim());
    return { all: t, givens: givens, question: qsent.trim() };
  }
  /* "Priya had 45 stickers and gave away 18": the amount after a transfer verb keeps the counted noun */
  function elideUnits(givens, question) {
    var qm = question.toLowerCase().match(/\bhow many (?:more |fewer |other )?([a-z]+)\b/);
    if (!qm || NOUN_STOP.test(qm[1])) return givens;
    var noun = qm[1], established = false, VERB = "(?:gave away|gave|give|gives|ate|eats|eat|sold|sells|sell|lost|loses|lose|used|uses|use|broke|breaks|donated|donates|threw away|throws away|returned|returns|dropped|drops|took|takes|take|picked|picks|bought|buys|buy|found|finds|received|receives|got|gets|made|makes|baked|bakes|spent|spends|added|adds|wasted|shared|handed out|handed|sent|sends|burned|burnt|lent|lends|donate|put|puts|placed|removed|removes)";
    var re = new RegExp("\\b(" + VERB + ")\\s+((?:[A-Za-z]+\\s+)?)(\\d+(?:\\.\\d+)?)(?=\\s*(?:$|[.,;]|\\s(?:and|to|but|then|while|from|away|off|out|more|so)\\b))", "gi");
    var nounRe = new RegExp("\\b\\d+(?:\\.\\d+)?\\s+(?:[a-z]+\\s+)?" + noun.replace(/s$/, "") + "(?:s|es)?\\b", "i");
    return givens.map(function (g) {
      var out = g;
      out = g.replace(re, function (all, v, mid, n, off) { return (!established && !nounRe.test(g.slice(0, off))) || /\$\s*$/.test(g.slice(0, off + all.length - n.length)) ? all : v + " " + mid + n + " " + noun; });
      if (nounRe.test(g)) established = true;
      return out;
    });
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

  root.C4LMStory = { solve: solve, parse: parse, numify: numify, sentences: sentences, clausesOf: clausesOf, _t: { quantitiesOf: quantitiesOf, targetOf2: targetOf2, dims: dims, narrative: narrative, readers: function () { return READERS; } } };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMStory;
})(typeof window !== "undefined" ? window : globalThis);
