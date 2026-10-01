/* Everyday money. Tips and splitting a bill, discounts, sales tax and VAT, price per item and best-value comparisons, loan
 * payments, compound interest, doubling time, wages (hourly to yearly), markup and margin, and fuel economy. Plain arithmetic
 * on the numbers in the question; nothing is fetched. solve(text) returns { answer, schema, confidence } or null. */
(function (root) {
  "use strict";

  var NUM = "(\\d[\\d,]*(?:\\.\\d+)?)";
  var CUR = "(?:dollars?|bucks|euros?|pounds?|usd|eur|gbp|quid|cents?)";
  function num(s) { return parseFloat(String(s).replace(/,/g, "")); }
  function sym(l) { return /[€]|\beuros?\b|\beur\b/.test(l) ? "€" : (/[£]|\bpounds?\b|\bquid\b|\bgbp\b/.test(l) && !/\bpounds? (?:of|per) (?:weight|flour|sugar|meat|beef)\b|\blbs?\b/.test(l) ? "£" : (/[$]|\bdollars?\b|\bbucks\b|\busd\b/.test(l) ? "$" : "")); }
  function fmt(v, sy) {
    var neg = v < 0; v = Math.abs(v);
    var r = Math.round(v * 100) / 100, whole = Math.abs(r - Math.round(r)) < 1e-9;
    var s = whole ? Math.round(r).toLocaleString("en-US") : r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? "-" : "") + (sy || "") + s;
  }
  function an(p) { return /^(?:8|11|18)(?!\d)/.test(String(p)) ? "An" : "A"; }
  function pct(v) { var r = Math.round(v * 100) / 100; return String(r); }
  function res(a, sch) { return { answer: a, schema: sch, confidence: 0.9 }; }
  function amounts(l) {                                   /* every number that is not a percent, a rate or a count of people */
    var t = l.replace(new RegExp(NUM + "\\s?(?:%|percent|per cent)", "g"), " "), out = [], m, re = new RegExp("[$£€]?\\s?" + NUM + "(?:\\s?(?:k\\b|thousand|million))?", "g");
    while ((m = re.exec(t))) {
      var v = num(m[1]), tail = m[0].toLowerCase();
      if (/k$/.test(tail)) v *= 1e3; else if (/thousand/.test(tail)) v *= 1e3; else if (/million/.test(tail)) v *= 1e6;
      out.push({ v: v, raw: m[0], idx: m.index, end: m.index + m[0].length });
    }
    return out;
  }
  function pcts(l) { var out = [], m, re = new RegExp(NUM + "\\s?(?:%|percent|per cent)", "g"); while ((m = re.exec(l))) out.push(num(m[1])); return out; }
  function people(l) {
    var m = l.match(/\b(?:among|between|amongst|with|for|by)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:people|persons|friends|of us|guests|diners|ways|colleagues|coworkers|kids|students)\b/) || l.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:people|friends|ways|of us|diners|guests)\b/) || l.match(/\bsplit\s+(?:it\s+)?(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+ways\b/) || l.match(/\b(?:between|among)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten|us)\b/);
    if (!m) return 0;
    var W = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, us: 0 };
    return /^\d+$/.test(m[1]) ? +m[1] : (W[m[1]] || 0);
  }
  function years(l, key) {                                 /* "for 3 years", "over 30 years", "10 months" */
    var m = l.match(/\b(?:for|over|in|after|within|across)\s+(?:a |an )?(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty)\s*[- ]?(years?|yrs?|months?|weeks?|days?)\b/) || l.match(/\b(\d+(?:\.\d+)?)[- ](years?|yrs?|months?)\b/);
    if (!m) return null;
    var W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
    var n = /^[\d.]+$/.test(m[1]) ? parseFloat(m[1]) : W[m[1]], u = m[2].charAt(0);
    return u === "y" ? { years: n, months: n * 12 } : (u === "m" ? { years: n / 12, months: n } : (u === "w" ? { years: n / 52, months: n * 12 / 52 } : { years: n / 365, months: n * 12 / 365 }));
  }

  var UNIT = { g: ["g", 1], gram: ["g", 1], grams: ["g", 1], kg: ["g", 1000], kilo: ["g", 1000], kilos: ["g", 1000], kilogram: ["g", 1000], kilograms: ["g", 1000], oz: ["g", 28.3495], ounce: ["g", 28.3495], ounces: ["g", 28.3495], lb: ["g", 453.592], lbs: ["g", 453.592], pound: ["g", 453.592], pounds: ["g", 453.592],
               ml: ["ml", 1], l: ["ml", 1000], liter: ["ml", 1000], liters: ["ml", 1000], litre: ["ml", 1000], litres: ["ml", 1000], cl: ["ml", 10], gallon: ["ml", 3785.41], gallons: ["ml", 3785.41], floz: ["ml", 29.5735],
               pack: ["item", 1], packs: ["item", 1], items: ["item", 1], count: ["item", 1], ct: ["item", 1], pieces: ["item", 1], roll: ["item", 1], rolls: ["item", 1], bottles: ["item", 1], cans: ["item", 1], eggs: ["item", 1], sheets: ["item", 1], bars: ["item", 1] };

  function solve(text) {
    var s = String(text || "").trim();
    if (!s || s.length > 220) return null;
    var l = s.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").replace(/,(?=\d{3}\b)/g, ",").replace(/^(?:hey|hi|please|ok|okay|so|um|can you tell me|could you tell me|tell me|quick question,?)[, ]+/, "").replace(/[?!.]+$/, "").trim();
    var sy = sym(l), m, A = amounts(l), P = pcts(l), n;
    var hasMoney = sy || /\b(?:price|cost|costs|bill|pay|paid|salary|wage|loan|mortgage|interest|save|savings|invest|earn|tip|tax|vat|discount|sale|off|sold|bought|margin|markup|profit|doubl\w*|increase|decrease|raise|reduce)\b/.test(l);
    if (!hasMoney && !/\b(?:mpg|l\/100|per liter|per gallon)\b/.test(l)) return null;

    /* fuel economy */
    if ((m = l.match(/(?:convert\s+)?(\d+(?:\.\d+)?)\s*(mpg|miles per gallon|l\/100\s?km|liters? per 100\s?km|litres? per 100\s?km|km\/l|km per liter|km per litre|kilometers per liter|kilometres per litre)\s*(?:to|in|into|as)\s*(mpg|miles per gallon|l\/100\s?km|liters? per 100\s?km|litres? per 100\s?km|km\/l|km per liter|km per litre|kilometers per liter|kilometres per litre)/)) ||
        (m = l.match(/(?:how many|what is|what's)\s+(?:is\s+)?(\d+(?:\.\d+)?)\s*(mpg|l\/100\s?km|liters? per 100\s?km|litres? per 100\s?km|km\/l)\s+in\s+(mpg|l\/100\s?km|km\/l|km per liter|km per litre)/))) {
      var kind = function (u) { return /mpg|miles per gallon/.test(u) ? "mpg" : (/100/.test(u) ? "l100" : "kml"); };
      var from = kind(m[2]), to = kind(m[3]), v = parseFloat(m[1]);
      if (from !== to && v > 0) {
        var l100 = from === "mpg" ? 235.215 / v : (from === "kml" ? 100 / v : v), out = to === "mpg" ? 235.215 / l100 : (to === "kml" ? 100 / l100 : l100);
        var nm = { mpg: "miles per gallon (US)", l100: "litres per 100 km", kml: "kilometres per litre" };
        return res(pct(v) + " " + { mpg: "mpg (US)", l100: "L/100 km", kml: "km/L" }[from] + " is about " + (Math.round(out * 100) / 100) + " " + nm[to] + ".", "money:fuel");
      }
    }
    if ((m = l.match(/(?:cost|price|how much).*?(?:drive|fuel|gas|petrol|gasoline|trip).*?(\d+(?:\.\d+)?)\s*(miles?|km|kilomet\w+)/)) && /\b(?:mpg|per gallon|per liter|per litre|l\/100)\b/.test(l) && A.length >= 3) {
      var dist = parseFloat(m[1]), isMi = /^mile/.test(m[2]);
      var mp = l.match(/(\d+(?:\.\d+)?)\s*mpg/), pg = l.match(/[$£€]?\s?(\d+(?:\.\d+)?)\s*(?:dollars?|euros?|pounds?)?\s*(?:per|a|\/)\s*(?:gallon|gal)/), pl = l.match(/[$£€]?\s?(\d+(?:\.\d+)?)\s*(?:dollars?|euros?|pounds?)?\s*(?:per|a|\/)\s*(?:liter|litre)/), lp = l.match(/(\d+(?:\.\d+)?)\s*(?:l|liters?|litres?)\s*(?:per|\/)\s*100\s?km/);
      if (mp && pg && isMi) { var cost = dist / parseFloat(mp[1]) * parseFloat(pg[1]); return res("It takes " + pct(dist / parseFloat(mp[1])) + " gallons, which costs about " + fmt(cost, sy || "$") + ".", "money:fuelcost"); }
      if (lp && pl && !isMi) { var lit = dist * parseFloat(lp[1]) / 100; return res("It takes " + pct(lit) + " litres, which costs about " + fmt(lit * parseFloat(pl[1]), sy) + ".", "money:fuelcost"); }
    }

    /* increase / decrease a number by a percent */
    if (P.length === 1 && A.length === 1 && (m = l.match(/\b(increase|raise|add|grow|boost|decrease|reduce|lower|cut|drop|subtract|take off|decline)\w*\s+(?:the\s+)?(?:number\s+|amount\s+|price\s+|value\s+)?(?:of\s+)?[$£€]?\s?\d[\d,.]*\s*(?:dollars?|euros?|pounds?)?\s*(?:by|with)\s+\d/)) && !/\b(?:tax|tip|discount|off)\b/.test(l)) {
      var up = /increase|raise|add|grow|boost/.test(m[1]), base = A[0].v, ch = base * P[0] / 100;
      return res(fmt(up ? base + ch : base - ch, sy) + " (" + fmt(base, sy) + (up ? " plus " : " minus ") + pct(P[0]) + "%, a change of " + fmt(ch, sy) + ").", "money:pctchange");
    }

    /* loan or mortgage payments */
    if (/\b(?:monthly|payment|payments|installments?|repay|repayment|emi)\b/.test(l) && /\b(?:loan|mortgage|borrow|borrowed|financ\w+|car loan|debt)\b/.test(l) && P.length >= 1 && A.length >= 1) {
      var yy = years(l); if (yy) {
        var principal = Math.max.apply(null, A.map(function (a) { return a.v; })), r = P[0] / 100 / 12, N = Math.round(yy.months);
        if (principal > 0 && N > 0) {
          var pay = r === 0 ? principal / N : principal * r / (1 - Math.pow(1 + r, -N)), total = pay * N;
          return res("The monthly payment is about " + fmt(pay, sy) + ". Over " + N + " months you would pay " + fmt(total, sy) + " in total, of which " + fmt(total - principal, sy) + " is interest. (Standard fixed-rate loan at " + pct(P[0]) + "% a year, interest charged monthly.)", "money:loan");
        }
      }
    }

    /* compound interest, growth of savings, doubling time */
    if (/\bdoubl\w+\b/.test(l) && P.length === 1 && /\b(?:how long|how many years|years)\b/.test(l)) {
      var rr = P[0] / 100; if (rr > 0) { var yrs = Math.log(2) / Math.log(1 + rr); return res("At " + pct(P[0]) + "% a year it takes about " + (Math.round(yrs * 10) / 10) + " years to double (the rule of 72 gives " + (Math.round(72 / P[0] * 10) / 10) + ")." , "money:double"); }
    }
    if (P.length === 1 && A.length >= 1 && /\b(?:compound\w*|invest\w*|savings?|deposit\w*|grows?|growth|interest)\b/.test(l) && !/\b(?:simple interest|tip|tax|discount|loan|mortgage)\b/.test(l)) {
      var y2 = years(l);
      if (y2 && (/compound/.test(l) || /\binvest|growth|grows|savings|deposit/.test(l))) {
        var freq = /monthly/.test(l) ? 12 : (/quarter/.test(l) ? 4 : (/semi[- ]?annual|twice a year/.test(l) ? 2 : (/daily|every day/.test(l) ? 365 : (/weekly/.test(l) ? 52 : 1))));
        var pr = A[0].v, fv = pr * Math.pow(1 + P[0] / 100 / freq, freq * y2.years);
        if (pr > 0 && isFinite(fv)) return res(fmt(pr, sy) + " at " + pct(P[0]) + "% a year" + (freq === 1 ? "" : " compounded " + ({ 12: "monthly", 4: "quarterly", 2: "twice a year", 365: "daily", 52: "weekly" }[freq])) + " grows to about " + fmt(fv, sy) + " after " + pct(y2.years) + " years, which is " + fmt(fv - pr, sy) + " of interest.", "money:compound");
      }
    }
    /* saving toward a goal */
    if ((m = l.match(/\b(?:save|saving|raise|put aside|set aside)\b.*?[$£€]?\s?(\d[\d,]*(?:\.\d+)?)\b.*?\b(?:in|over|within)\s+(\d+(?:\.\d+)?)\s+(years?|months?|weeks?)\b/)) && /how much|per|each|every|a (?:month|week)/.test(l)) {
      var goal = num(m[1]), k = parseFloat(m[2]), per = /^year/.test(m[3]) ? k * 12 : (/^month/.test(m[3]) ? k : k * 12 / 52), unitName = /per week|a week|each week|weekly/.test(l) ? "week" : "month";
      var cnt = unitName === "month" ? per : (/^week/.test(m[3]) ? k : k * 52);
      return res("You would need to save about " + fmt(goal / cnt, sy) + " a " + unitName + ".", "money:goal");
    }
    if ((m = l.match(/\bhow (?:long|many months|many weeks|many years)\b.*?(?:to )?(?:save|reach|get to|afford|buy)\b.*?[$£€]?\s?(\d[\d,]*(?:\.\d+)?)\b.*?\b(?:at|saving|if i save|by saving)\s*[$£€]?\s?(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|euros?|pounds?)?\s*(?:a|per|each|every|\/)\s*(month|week|year|day)/))) {
      var gl = num(m[1]), step = num(m[2]), cntN = Math.ceil(gl / step - 1e-9);
      return res("About " + cntN + " " + m[3] + (cntN === 1 ? "" : "s") + (m[3] === "month" && cntN >= 12 ? " (roughly " + (Math.round(cntN / 12 * 10) / 10) + " years)" : "") + ".", "money:goal");
    }

    /* wages */
    if ((m = l.match(/[$£€]?\s?(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|euros?|pounds?)?\s*(?:an|per|\/|each|a)\s*hour/)) && /\b(?:year|annual|annually|yearly|month|monthly|week|weekly|salary|per year|a year|how much (?:do|will|would) i (?:make|earn))\b/.test(l) && !/\bhours? (?:do|does|will|would)\b/.test(l) && !/\bwork(?:ed|s|ing)?\s+\d/.test(l) && !/\bfor\s+\d+\s*hours?\b/.test(l)) {
      var hr = num(m[1]), perYear = hr * 40 * 52;
      var asked = /month/.test(l) ? [perYear / 12, "a month"] : (/week/.test(l) ? [hr * 40, "a week"] : [perYear, "a year"]);
      return res("At " + fmt(hr, sy) + " an hour, a full-time job of 40 hours a week for 52 weeks pays about " + fmt(asked[0], sy) + " " + asked[1] + " before tax.", "money:wage");
    }
    if ((m = l.match(/[$£€]?\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:dollars?|euros?|pounds?)?\s*(?:a|per|\/|each)\s*(year|annum)/)) && /\b(?:hour|hourly|month|monthly|week|weekly|per hour|an hour|a month|a week)\b/.test(l) && /\b(?:how much|what|convert|is that|per|equal)\b/.test(l) && !/\bsave|loan|interest/.test(l)) {
      var yr = num(m[1]) * (m[2] ? 1000 : 1), want = /hour/.test(l.replace(m[0], "")) ? [yr / 2080, "an hour"] : (/month/.test(l.replace(m[0], "")) ? [yr / 12, "a month"] : [yr / 52, "a week"]);
      return res(fmt(yr, sy) + " a year is about " + fmt(want[0], sy) + " " + want[1] + " before tax" + (want[1] === "an hour" ? " (40 hours a week, 52 weeks a year)" : "") + ".", "money:wage");
    }

    /* markup and margin */
    if (A.length >= 2 && /\b(?:margin|markup|mark-up|profit)\b/.test(l) && (m = l.match(/(?:cost|costs|bought|paid|purchase|wholesale)\D{0,20}?[$£€]?\s?(\d[\d,]*(?:\.\d+)?)[\s\S]*?(?:sell|sells|sold|sale|selling|price|retail)\D{0,20}?[$£€]?\s?(\d[\d,]*(?:\.\d+)?)/))) {
      var cst = num(m[1]), sell = num(m[2]); if (cst > 0 && sell > 0) return res("Profit is " + fmt(sell - cst, sy) + ": a margin of " + pct((sell - cst) / sell * 100) + "% of the selling price and a markup of " + pct((sell - cst) / cst * 100) + "% over cost.", "money:margin");
    }

    /* tax and VAT */
    var taxM = P.length >= 1 && /\b(?:sales tax|tax|vat|gst)\b/.test(l) && !/\btip\b/.test(l);
    if (taxM && A.length >= 1) {
      var rate = P[0], amt = A[0].v;
      if (/\b(?:including|includes|inclusive|incl|with)\b.*\b(?:tax|vat|gst)\b.*\b(?:before|without|excluding|net|original|pre-tax|pretax|base)\b|\b(?:before|without|excluding|net|pre-tax|pretax)\b.*\b(?:tax|vat|gst)\b.*\b(?:including|includes|inclusive|incl)\b|\b(?:including|inclusive|incl)\b.*\b(?:what|how much)\b.*\b(?:before|without)\b|\b(?:price|total|cost)\b.*\b(?:including|incl|inclusive)\b.*\b(?:tax|vat|gst)\b.*\bwhat\b.*\b(?:before|without|excluding)/.test(l)) {
        var net = amt / (1 + rate / 100);
        return res("Before " + pct(rate) + "% tax the price was " + fmt(net, sy) + ", and the tax in it is " + fmt(amt - net, sy) + ".", "money:untax");
      }
      var tax = amt * rate / 100;
      return res(an(pct(rate)) + " " + pct(rate) + "% tax on " + fmt(amt, sy) + " is " + fmt(tax, sy) + ", so the total is " + fmt(amt + tax, sy) + ".", "money:tax");
    }

    /* tips and splitting the bill */
    var tipM = /\b(?:tip|tipping|gratuity)\b/.test(l), pp = people(l);
    if (tipM && A.length >= 1) {
      var bill = A[0].v, rate2 = P.length ? P[0] : (/\bgood service\b/.test(l) ? 20 : 0);
      if (rate2 > 0 && !pp) { var tp = bill * rate2 / 100; return res(an(pct(rate2)) + " " + pct(rate2) + "% tip on " + fmt(bill, sy) + " is " + fmt(tp, sy) + ", so the total comes to " + fmt(bill + tp, sy) + ".", "money:tip"); }
      if (rate2 > 0 && pp > 1) { var tp2 = bill * rate2 / 100, tot = bill + tp2; return res("With a " + pct(rate2) + "% tip (" + fmt(tp2, sy) + ") the total is " + fmt(tot, sy) + ", so each of the " + pp + " people pays " + fmt(tot / pp, sy) + ".", "money:tipsplit"); }
    }
    if (/\b(?:split|divide|share|shared|splitting|dividing|each (?:person|one) (?:pays|owes|gets)|per person|apiece|evenly|equally)\b/.test(l) && A.length >= 1 && pp > 1) {
      var tot2 = A[0].v;
      if (P.length && /\b(?:tip|tax|service)\b/.test(l)) { tot2 = tot2 * (1 + P[0] / 100); }
      return res(fmt(A[0].v, sy) + (tot2 !== A[0].v ? " plus " + pct(P[0]) + "% is " + fmt(tot2, sy) + ", and" : "") + " split " + pp + " ways is " + fmt(tot2 / pp, sy) + " each" + (Math.abs(tot2 / pp * 100 - Math.round(tot2 / pp * 100)) > 1e-6 ? " (rounded to the nearest cent)" : "") + ".", "money:split");
    }
    if (A.length >= 2 && /\b(?:split|divide|share)\b/.test(l) && (m = l.match(/\b(?:split|divide|share)\s+[$£€]?\s?(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|euros?|pounds?)?\s+(?:among|between|amongst|by|with)\s+(\d+)\b/))) {
      var nn = +m[2]; if (nn > 1) return res(fmt(num(m[1]), sy) + " split " + nn + " ways is " + fmt(num(m[1]) / nn, sy) + " each.", "money:split");
    }

    /* discounts */
    if (P.length >= 1 && /\b(?:off|discount|discounted|sale|markdown|reduced|reduction)\b/.test(l) && A.length >= 1 && !/\btax\b/.test(l)) {
      var rate3 = P[0], orig = A[0].v;
      if (/\b(?:original|regular|before|full) price\b.*\b(?:was|is)\b|\bafter\b.*\boff\b.*\b(?:original|before|regular)\b|\bwhat was the (?:original|regular|full) price\b|\boriginal price\b/.test(l) && /\bafter|now|sale price (?:is|of)|paid|costs? [$£€]?\d.*(?:after|with)|on sale for/.test(l) && !/\bwhat is the sale price\b/.test(l)) {
        var o2 = orig / (1 - rate3 / 100); return res("The original price was " + fmt(o2, sy) + " (" + fmt(orig, sy) + " is " + pct(100 - rate3) + "% of it, so you saved " + fmt(o2 - orig, sy) + ").", "money:unsale");
      }
      var save = orig * rate3 / 100;
      return res(pct(rate3) + "% off " + fmt(orig, sy) + " takes " + fmt(save, sy) + " off, so the price becomes " + fmt(orig - save, sy) + ".", "money:discount");
    }

    /* price per item, best value */
    if ((m = l.match(/(?:which|what)\s+(?:is\s+)?(?:the\s+)?(?:cheaper|better(?: (?:deal|value|buy))?|best(?: (?:deal|value|buy))?|more (?:economical|expensive)|a better deal|the better deal)[:,]?\s*(.+?)\s+(?:or|vs\.?|versus)\s+(.+)$/)) || (m = l.match(/(?:compare|which is cheaper)[:,]?\s*(.+?)\s+(?:or|vs\.?|versus|and)\s+(.+)$/))) {
      var unitOf = function (t) {
        var q = t.match(/(\d+(?:\.\d+)?)\s*(kg|kilos?|kilograms?|g|grams?|oz|ounces?|lbs?|pounds?|ml|l|liters?|litres?|cl|gallons?|packs?|items|count|ct|pieces|rolls?|bottles|cans|eggs|sheets|bars)\b(?:\s+\w+)?\s+(?:for|at|costs?|is|=)?\s*[$£€]?\s?(\d+(?:\.\d+)?)/) || t.match(/[$£€]\s?(\d+(?:\.\d+)?)\s+(?:for|per)\s+(\d+(?:\.\d+)?)\s*(kg|kilos?|g|grams?|oz|ounces?|lbs?|ml|l|liters?|litres?|packs?|items|count|ct|pieces|rolls?|bottles|cans|eggs|sheets|bars)\b/);
        if (!q) return null;
        var qty, un, price;
        if (/^[$£€]/.test(q[0])) { price = +q[1]; qty = +q[2]; un = q[3]; } else { qty = +q[1]; un = q[2]; price = +q[3]; }
        var u = UNIT[un]; if (!u || !qty || !price) return null;
        return { price: price, qty: qty * u[1], base: u[0], per: price / (qty * u[1]), text: t.trim() };
      };
      var ua = unitOf(m[1]), ub = unitOf(m[2]);
      if (ua && ub && ua.base === ub.base) {
        var cheaper = ua.per < ub.per ? ua : ub, dearer = cheaper === ua ? ub : ua, factor = ua.base === "g" ? 1000 : (ua.base === "ml" ? 1000 : 1), un2 = ua.base === "g" ? "kg" : (ua.base === "ml" ? "litre" : "item");
        if (Math.abs(ua.per - ub.per) < 1e-9) return res("They cost the same per " + un2 + ".", "money:unitprice");
        return res("\"" + cheaper.text + "\" is the better value at " + fmt(cheaper.per * factor, sy) + " per " + un2 + ", against " + fmt(dearer.per * factor, sy) + " per " + un2 + " for \"" + dearer.text + "\".", "money:unitprice");
      }
    }
    if ((m = l.match(/\b(?:pack|box|set|bundle|case|bag|carton|dozen|tray)\s+of\s+(\d+)\b.*?(?:cost|costs|is|for|priced at|sells for)\s*[$£€]?\s?(\d+(?:\.\d+)?)/)) && /\b(?:each|per|one|single|item|unit|piece|apiece|individual)\b/.test(l)) {
      var items = +m[1], pr2 = parseFloat(m[2]);
      if (items > 0) return res(fmt(pr2 / items, sy) + " each (" + fmt(pr2, sy) + " for " + items + ").", "money:perItem");
    }
    if ((m = l.match(/[$£€]?\s?(\d+(?:\.\d+)?)\s*(?:dollars?|euros?|pounds?)?\s+for\s+(\d+)\s+(?:items|pieces|units|apples|bananas|oranges|eggs|cans|bottles|rolls|packs|tickets|[a-z]+s)\b/)) && /\b(?:each|per|one|a piece|apiece|single)\b/.test(l)) {
      var c2 = parseFloat(m[1]), k2 = +m[2]; if (k2 > 1) return res(fmt(c2 / k2, sy) + " each (" + fmt(c2, sy) + " for " + k2 + ").", "money:perItem");
    }
    return null;
  }

  root.C4LMMoney = { solve: solve };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMMoney;
})(typeof window !== "undefined" ? window : globalThis);
