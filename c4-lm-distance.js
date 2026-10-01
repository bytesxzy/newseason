/* Distances between places. How far one city or country is from another (great-circle, from a built-in table of coordinates),
 * how long the trip takes by plane, car, bike or on foot, which of two places is closer or farther, and the latitude and
 * longitude of a place. Everything is computed locally with the haversine formula; nothing is fetched.
 * solve(text) returns { answer, schema, confidence } or null. */
(function (root) {
  "use strict";

  /* name | latitude | longitude | landmass: A Afro-Eurasia, M the Americas, O Australia, I an island */
  var ROWS = [
    "new york|40.71|-74.01|M|nyc,new york city","los angeles|34.05|-118.24|M|la","chicago|41.88|-87.63|M","houston|29.76|-95.37|M","phoenix|33.45|-112.07|M","philadelphia|39.95|-75.17|M","san antonio|29.42|-98.49|M","san diego|32.72|-117.16|M","dallas|32.78|-96.8|M","san francisco|37.77|-122.42|M|sf","seattle|47.61|-122.33|M","denver|39.74|-104.99|M","washington dc|38.91|-77.04|M|washington,dc,washington d.c.","boston|42.36|-71.06|M","miami|25.76|-80.19|M","atlanta|33.75|-84.39|M","las vegas|36.17|-115.14|M","portland|45.52|-122.68|M","new orleans|29.95|-90.07|M","detroit|42.33|-83.05|M","minneapolis|44.98|-93.27|M","salt lake city|40.76|-111.89|M","orlando|28.54|-81.38|M","nashville|36.16|-86.78|M","austin|30.27|-97.74|M","sacramento|38.58|-121.49|M","tallahassee|30.44|-84.28|M","anchorage|61.22|-149.9|M","honolulu|21.31|-157.86|I|hawaii","toronto|43.65|-79.38|M","montreal|45.5|-73.57|M","vancouver|49.28|-123.12|M","ottawa|45.42|-75.7|M","calgary|51.05|-114.07|M","edmonton|53.55|-113.49|M","winnipeg|49.9|-97.14|M","quebec city|46.81|-71.21|M","mexico city|19.43|-99.13|M","guadalajara|20.66|-103.35|M","cancun|21.16|-86.85|M","havana|23.11|-82.37|I","kingston|18|-76.8|I","panama city|8.98|-79.52|M","san jose costa rica|9.93|-84.08|M","guatemala city|14.63|-90.51|M","reykjavik|64.15|-21.94|I",
    "bogota|4.71|-74.07|M","lima|-12.05|-77.04|M","caracas|10.48|-66.9|M","quito|-0.18|-78.47|M","la paz|-16.5|-68.15|M","santiago|-33.45|-70.67|M","buenos aires|-34.6|-58.38|M","montevideo|-34.9|-56.16|M","sao paulo|-23.55|-46.63|M","rio de janeiro|-22.91|-43.17|M|rio","brasilia|-15.79|-47.88|M","asuncion|-25.26|-57.58|M","cusco|-13.53|-71.97|M",
    "london|51.51|-0.13|A","paris|48.86|2.35|A","berlin|52.52|13.4|A","madrid|40.42|-3.7|A","rome|41.9|12.5|A","amsterdam|52.37|4.9|A","brussels|50.85|4.35|A","vienna|48.21|16.37|A","zurich|47.37|8.54|A","geneva|46.2|6.14|A","bern|46.95|7.45|A","stockholm|59.33|18.07|A","oslo|59.91|10.75|A","copenhagen|55.68|12.57|A","helsinki|60.17|24.94|A","prague|50.08|14.44|A","warsaw|52.23|21.01|A","budapest|47.5|19.04|A","athens|37.98|23.73|A","lisbon|38.72|-9.14|A","barcelona|41.39|2.17|A","milan|45.46|9.19|A","munich|48.14|11.58|A","edinburgh|55.95|-3.19|A","glasgow|55.86|-4.25|A","manchester|53.48|-2.24|A","birmingham|52.49|-1.89|A","liverpool|53.41|-2.99|A","cardiff|51.48|-3.18|A","dublin|53.35|-6.26|I","istanbul|41.01|28.98|A","ankara|39.93|32.86|A","moscow|55.76|37.62|A","st petersburg|59.93|30.34|A|saint petersburg","kyiv|50.45|30.52|A|kiev","bucharest|44.43|26.1|A","sofia|42.7|23.32|A","belgrade|44.79|20.45|A","zagreb|45.81|15.98|A","venice|45.44|12.32|A","florence|43.77|11.26|A","naples|40.85|14.27|A","hamburg|53.55|9.99|A","frankfurt|50.11|8.68|A","minsk|53.9|27.57|A","vilnius|54.69|25.28|A","riga|56.95|24.11|A","tallinn|59.44|24.75|A","valletta|35.9|14.51|I",
    "cairo|30.04|31.24|A","lagos|6.52|3.38|A","nairobi|-1.29|36.82|A","johannesburg|-26.2|28.05|A","cape town|-33.92|18.42|A","pretoria|-25.75|28.19|A","casablanca|33.57|-7.59|A","rabat|34.02|-6.84|A","marrakech|31.63|-8.01|A","addis ababa|9.03|38.74|A","accra|5.6|-0.19|A","dakar|14.72|-17.47|A","kinshasa|-4.44|15.27|A","algiers|36.75|3.06|A","tunis|36.81|10.18|A","dar es salaam|-6.79|39.21|A","dodoma|-6.16|35.75|A","khartoum|15.5|32.56|A","luanda|-8.84|13.23|A","kampala|0.35|32.58|A","tripoli|32.89|13.19|A","abuja|9.08|7.4|A","harare|-17.83|31.05|A","lusaka|-15.39|28.32|A","maputo|-25.97|32.57|A","antananarivo|-18.88|47.51|I","timbuktu|16.77|-3.01|A","zanzibar|-6.16|39.19|I",
    "dubai|25.2|55.27|A","abu dhabi|24.45|54.38|A","riyadh|24.71|46.68|A","mecca|21.39|39.86|A","doha|25.29|51.53|A","kuwait city|29.38|47.99|A","baghdad|33.31|44.36|A","tehran|35.69|51.39|A","jerusalem|31.77|35.21|A","tel aviv|32.09|34.78|A","beirut|33.89|35.5|A","amman|31.95|35.93|A","damascus|33.51|36.29|A","karachi|24.86|67|A","lahore|31.55|74.34|A","islamabad|33.69|73.05|A","delhi|28.61|77.21|A|new delhi","mumbai|19.08|72.88|A|bombay","kolkata|22.57|88.36|A|calcutta","bangalore|12.97|77.59|A|bengaluru","chennai|13.08|80.27|A","hyderabad|17.39|78.49|A","kathmandu|27.72|85.32|A","dhaka|23.81|90.41|A","colombo|6.93|79.86|I","kabul|34.53|69.17|A","tashkent|41.3|69.24|A","almaty|43.24|76.89|A","astana|51.17|71.43|A","bangkok|13.76|100.5|A","hanoi|21.03|105.85|A","ho chi minh city|10.82|106.63|A|saigon","jakarta|-6.21|106.85|I","singapore|1.35|103.82|I","kuala lumpur|3.14|101.69|A","manila|14.6|120.98|I","hong kong|22.32|114.17|A","taipei|25.03|121.57|I","shanghai|31.23|121.47|A","beijing|39.9|116.41|A","shenzhen|22.54|114.06|A","guangzhou|23.13|113.26|A","chengdu|30.57|104.07|A","tokyo|35.68|139.69|I","osaka|34.69|135.5|I","kyoto|35.01|135.77|I","seoul|37.57|126.98|A","pyongyang|39.04|125.76|A","ulaanbaatar|47.89|106.91|A","yangon|16.84|96.17|A","naypyidaw|19.76|96.07|A","phnom penh|11.56|104.92|A","vientiane|17.97|102.6|A","denpasar|-8.65|115.22|I|bali",
    "sydney|-33.87|151.21|O","melbourne|-37.81|144.96|O","brisbane|-27.47|153.03|O","perth|-31.95|115.86|O","adelaide|-34.93|138.6|O","darwin|-12.46|130.84|O","canberra|-35.28|149.13|O","hobart|-42.88|147.33|I","auckland|-36.85|174.76|I","wellington|-41.29|174.78|I","christchurch|-43.53|172.64|I","suva|-18.14|178.44|I","port moresby|-9.44|147.18|I","papeete|-17.54|-149.57|I|tahiti","guam|13.44|144.79|I","mcmurdo station|-77.85|166.67|I|mcmurdo","north pole|90|0|I","south pole|-90|0|I"
  ];
  /* a country stands for its capital, and the answer says so */
  var COUNTRY = {
    "united states": "washington dc", "usa": "washington dc", "us": "washington dc", "america": "washington dc", "the states": "washington dc", "united kingdom": "london", "uk": "london", "britain": "london", "great britain": "london", "england": "london", "scotland": "edinburgh", "wales": "cardiff", "ireland": "dublin", "canada": "ottawa", "mexico": "mexico city", "brazil": "brasilia", "argentina": "buenos aires", "chile": "santiago", "peru": "lima", "colombia": "bogota", "venezuela": "caracas", "ecuador": "quito", "bolivia": "la paz", "uruguay": "montevideo", "paraguay": "asuncion", "cuba": "havana", "jamaica": "kingston", "panama": "panama city", "costa rica": "san jose costa rica", "guatemala": "guatemala city", "iceland": "reykjavik",
    "norway": "oslo", "sweden": "stockholm", "finland": "helsinki", "denmark": "copenhagen", "germany": "berlin", "france": "paris", "spain": "madrid", "portugal": "lisbon", "italy": "rome", "netherlands": "amsterdam", "holland": "amsterdam", "belgium": "brussels", "switzerland": "bern", "austria": "vienna", "poland": "warsaw", "czech republic": "prague", "czechia": "prague", "hungary": "budapest", "greece": "athens", "turkey": "ankara", "russia": "moscow", "ukraine": "kyiv", "romania": "bucharest", "bulgaria": "sofia", "serbia": "belgrade", "croatia": "zagreb", "belarus": "minsk", "lithuania": "vilnius", "latvia": "riga", "estonia": "tallinn", "malta": "valletta",
    "egypt": "cairo", "nigeria": "abuja", "kenya": "nairobi", "ethiopia": "addis ababa", "ghana": "accra", "senegal": "dakar", "south africa": "pretoria", "morocco": "rabat", "algeria": "algiers", "tunisia": "tunis", "libya": "tripoli", "sudan": "khartoum", "angola": "luanda", "uganda": "kampala", "tanzania": "dodoma", "congo": "kinshasa", "zimbabwe": "harare", "zambia": "lusaka", "mozambique": "maputo", "madagascar": "antananarivo",
    "saudi arabia": "riyadh", "uae": "abu dhabi", "united arab emirates": "abu dhabi", "qatar": "doha", "kuwait": "kuwait city", "iraq": "baghdad", "iran": "tehran", "israel": "jerusalem", "lebanon": "beirut", "jordan": "amman", "syria": "damascus", "pakistan": "islamabad", "india": "delhi", "nepal": "kathmandu", "bangladesh": "dhaka", "sri lanka": "colombo", "afghanistan": "kabul", "uzbekistan": "tashkent", "kazakhstan": "astana", "thailand": "bangkok", "vietnam": "hanoi", "indonesia": "jakarta", "malaysia": "kuala lumpur", "philippines": "manila", "china": "beijing", "taiwan": "taipei", "japan": "tokyo", "south korea": "seoul", "korea": "seoul", "north korea": "pyongyang", "mongolia": "ulaanbaatar", "myanmar": "naypyidaw", "burma": "naypyidaw", "cambodia": "phnom penh", "laos": "vientiane",
    "australia": "canberra", "new zealand": "wellington", "fiji": "suva", "papua new guinea": "port moresby", "antarctica": "mcmurdo station"
  };
  var PLACE = {}, NAMES = [];
  ROWS.forEach(function (r) {
    var p = r.split("|"), rec = { name: p[0], lat: +p[1], lon: +p[2], land: p[3], country: false };
    PLACE[p[0]] = rec; NAMES.push(p[0]);
    if (p[4]) p[4].split(",").forEach(function (a) { PLACE[a] = rec; });
  });
  Object.keys(COUNTRY).forEach(function (c) { var cap = PLACE[COUNTRY[c]]; if (cap && !PLACE[c]) PLACE[c] = { name: cap.name, lat: cap.lat, lon: cap.lon, land: cap.land, country: c }; });
  var COUNTRY_NAMES = Object.keys(COUNTRY);

  var R_KM = 6371.0088, KM_MI = 0.621371;
  function rad(d) { return d * Math.PI / 180; }
  function haversine(a, b) {
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon), la1 = rad(a.lat), la2 = rad(b.lat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function nice(n) { var r = n >= 1000 ? Math.round(n / 10) * 10 : (n >= 100 ? Math.round(n / 5) * 5 : Math.round(n)); return r.toLocaleString("en-US"); }
  function both(km) { return nice(km) + " km (" + nice(km * KM_MI) + " miles)"; }
  function duration(h) {
    if (h < 1) return Math.max(1, Math.round(h * 60 / 5) * 5) + " minutes";
    if (h < 48) { var hh = Math.floor(h), mm = Math.round((h - hh) * 60 / 5) * 5; if (mm === 60) { hh++; mm = 0; } return hh + (hh === 1 ? " hour" : " hours") + (mm ? " " + mm + " minutes" : ""); }
    var d = h / 24; return d < 45 ? (Math.round(d * 10) / 10) + " days" : Math.round(d / 7 * 10) / 10 + " weeks";
  }
  function lev1(a, b) {                                   /* within one edit */
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    var s = a.length < b.length ? a : b, t = a.length < b.length ? b : a;
    return s.slice(i) === t.slice(i + 1);
  }
  function clean(x) {
    return String(x || "").toLowerCase().replace(/[.']/g, "").replace(/^(?:the (?:city|town|country|capital) of |the |city of |country of )/, "").replace(/^(?:city of |country of |to |from )/, "")
      .replace(/,\s*[a-z .]+$/, "").replace(/\s+(?:city|country)$/, function (m, off, s) { return /^(?:new york|mexico|kuwait|panama|guatemala|quebec|ho chi minh|salt lake)$/.test(s.slice(0, off)) ? m : ""; })
      .replace(/\s+/g, " ").trim();
  }
  function resolve(x) {
    var k = clean(x); if (!k) return null;
    if (PLACE[k]) return PLACE[k];
    if (k.length >= 5) {
      var hit = null, n = 0;
      Object.keys(PLACE).forEach(function (nm) { if (nm.length >= 5 && lev1(k, nm) && PLACE[nm] !== hit) { hit = PLACE[nm]; n++; } });
      if (n === 1) return hit;
    }
    return null;
  }
  function label(p, raw) {
    if (p.country) return titleCase(p.country);
    return titleCase(p.name);
  }
  var KEEP_UP = { dc: 1, uk: 1, usa: 1, uae: 1, nyc: 1 };
  function titleCase(s) { return s.replace(/\b[a-z]+/g, function (w, i) { return (w === "of" || w === "de") && i ? w : (KEEP_UP[w] ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)); }).replace(/\bSt\b/, "St."); }
  function capNote(a, b) {
    var cs = [];
    if (a.country) cs.push(titleCase(a.country) + " (" + titleCase(a.name) + ")");
    if (b.country) cs.push(titleCase(b.country) + " (" + titleCase(b.name) + ")");
    return cs.length ? " Countries are measured between their capitals." : "";
  }
  function sameSpot(a, b) { return a.name === b.name; }

  var MODES = {
    fly: { re: /\b(?:fly|flying|flight|plane|airplane|aeroplane|jet)\b/, verb: "flying", speed: 850, overhead: 0.5, road: 1.0, label: "A non-stop flight" },
    drive: { re: /\b(?:drive|driving|car|road trip|by road)\b/, verb: "driving", speed: 80, overhead: 0, road: 1.3, label: "Driving" },
    bike: { re: /\b(?:bike|biking|cycle|cycling|bicycle|ride a bike)\b/, verb: "cycling", speed: 15, overhead: 0, road: 1.3, label: "Cycling" },
    walk: { re: /\b(?:walk|walking|on foot|hike|hiking)\b/, verb: "walking", speed: 5, overhead: 0, road: 1.3, label: "Walking" },
    train: { re: /\b(?:train|rail)\b/, verb: "going by train", speed: 100, overhead: 0, road: 1.25, label: "A train" },
    run: { re: /\b(?:run|running|jog|jogging)\b/, verb: "running", speed: 10, overhead: 0, road: 1.3, label: "Running" }
  };
  function trip(a, b, mode) {
    var km = haversine(a, b), M = MODES[mode];
    if (mode !== "fly" && (a.land !== b.land || a.land === "I" || b.land === "I" || a.land === "O" && b.land === "O" && false)) {
      if (a.land !== b.land || a.land === "I") return "There is no road between " + label(a) + " and " + label(b) + " (they are not on the same landmass), so " + M.verb + " is not possible; they are about " + both(km) + " apart in a straight line." + (km > 300 ? " A flight takes roughly " + duration(km / 850 + 0.5) + "." : "");
    }
    var h = km * M.road / M.speed + M.overhead, slow = (mode === "walk" || mode === "bike" || mode === "run") && h > 16;
    if (slow) return M.label + " from " + label(a) + " to " + label(b) + " takes roughly " + duration(h / 8 * 24) + " at 8 hours a day (" + duration(h) + " of actual " + M.verb + "), for about " + both(km * M.road) + " of travel; the straight-line distance is " + both(km) + ". That is a rough estimate at about " + M.speed + " km/h.";
    return M.label + " from " + label(a) + " to " + label(b) + " takes roughly " + duration(h) + (mode === "fly" ? ", for a straight-line distance of " + both(km) + "." : ", for about " + both(km * M.road) + " of travel (the straight-line distance is " + both(km) + ").") +
      (mode === "fly" ? " That counts cruising at about 850 km/h plus half an hour for taking off and landing." : " That is a rough estimate at about " + M.speed + " km/h, with no stops.");
  }

  function pair(l) {                                      /* two place phrases out of the common question shapes */
    var m;
    if ((m = l.match(/^(?:how (?:far|long|far away|far apart)) (?:is|are) (?:it |the (?:distance|trip|journey|flight|drive) )?(?:from )?(.+?) (?:from|to|and|away from) (.+?)(?: away)?(?: apart)?$/)) ||
        (m = l.match(/^(?:how (?:far|many (?:miles|kilometers|kilometres|km|kms|meters|metres|feet|yards))) (?:is|are) (?:it )?(?:from )?(.+?) (?:from|to|and) (.+?)(?: away)?(?: apart)?$/)) ||
        (m = l.match(/^(?:how (?:far|many (?:miles|kilometers|kilometres|km|kms)))(?: away)?(?: is it)? (?:is |are )?(?:it )?from (.+?) to (.+)$/)) ||
        (m = l.match(/^(?:what(?:'s| is) )?(?:the )?(?:distance|how far|mileage|travel distance) (?:from|between) (.+?) (?:to|and) (.+)$/)) ||
        (m = l.match(/^(?:what(?:'s| is) )?(?:the )?distance (?:from )?(.+?) to (.+)$/)) ||
        (m = l.match(/^how many (?:miles|kilometers|kilometres|km) (?:is it |are there )?(?:between) (.+?) and (.+)$/)) ||
        (m = l.match(/^(?:what(?:'s| is) )?(?:the )?(.+?) to (.+?) distance$/))) return [m[1], m[2]];
    return null;
  }

  function solve(text) {
    var s = String(text || "").trim();
    if (!s || s.length > 160) return null;
    var l = s.toLowerCase().replace(/[?!.]+$/g, "").replace(/\s+/g, " ").replace(/^(?:hey|hi|please|ok|okay|so|um|can you tell me|could you tell me|tell me|i(?:'m| am) curious,?|i wonder|do you know|quick question,?)[, ]+/, "").trim();
    l = l.replace(/\bkilometres\b/g, "kilometers").replace(/\bmetres\b/g, "meters");
    var asMiles = /\bmiles?\b/.test(l), asKm = /\b(?:kilometers|kms?)\b/.test(l);
    l = l.replace(/\s+(?:in|using)\s+(?:miles|kilometers|km|kms)$/, "");
    if (/^how (?:far|many)/.test(l)) l = l.replace(/\s+by\s+(?:car|plane|air|road|train|bus|bike|bicycle|foot|boat|ship|sea)$/, "");
    var m, a, b, km, res = function (t, sch) { return { answer: t, schema: sch, confidence: 0.9 }; };

    /* trip duration by a mode of travel */
    var mode = null;
    for (var k in MODES) { if (MODES[k].re.test(l)) { mode = k; break; } }
    if (mode && /\b(?:how long|how many (?:hours|days|minutes)|how much time|time)\b/.test(l)) {
      m = l.match(/\bfrom (.+?) to (.+?)(?:\s+(?:by|on|in|with|using)\b.*)?$/) || l.match(/\bbetween (.+?) and (.+?)(?:\s+(?:by|on|in|with|using)\b.*)?$/) || l.match(/\b(?:to|in) (.+?) from (.+?)(?:\s+(?:by|on|in|with|using)\b.*)?$/);
      if (m) {
        var fromTo = /\bfrom (.+?) to /.test(l) || /\bbetween /.test(l);
        a = resolve(fromTo ? m[1] : m[2]); b = resolve(fromTo ? m[2] : m[1]);
        if (a && b && !sameSpot(a, b)) return res(trip(a, b, mode) + capNote(a, b), "distance:trip");
      }
    }

    /* how far apart */
    var p = pair(l);
    if (p) {
      a = resolve(p[0]); b = resolve(p[1]);
      if (a && b) {
        if (sameSpot(a, b)) return res(label(a) + " and " + label(b) + " are the same place, so the distance is zero.", "distance:same");
        km = haversine(a, b);
        var unit = asMiles ? "mi" : (asKm ? "km" : "");
        var body = unit === "mi" ? nice(km * KM_MI) + " miles (" + nice(km) + " km)" : both(km);
        var t = label(a) + " and " + label(b) + " are about " + body + " apart in a straight line";
        if (/\bfrom .+ to /.test(l)) t = "It is about " + body + " from " + label(a) + " to " + label(b) + " in a straight line";
        else if (/\bfrom\b/.test(l) && !/\bbetween\b/.test(l)) t = label(a) + " is about " + body + " from " + label(b) + " in a straight line";
        t += "." + (km > 500 ? " A non-stop flight takes roughly " + duration(km / 850 + 0.5) + "." : "") + capNote(a, b);
        return res(t, "distance:between");
      }
    }

    /* which is closer, which is farther */
    if ((m = l.match(/^(?:which|what)(?: (?:one|city|country|place|capital))? is (closer|nearer|farther|further) (?:to|from) (.+?),? (.+?),? or (.+)$/)) ||
        (m = l.match(/^(?:which|what)(?: (?:one|city|country|place|capital))? is (closer|nearer|farther|further) (?:to|from) (.+?),? (?:is it )?(.+?) or (.+)$/))) {
      var o = resolve(m[2]), c1 = resolve(m[3]), c2 = resolve(m[4]);
      if (o && c1 && c2) {
        var d1 = haversine(o, c1), d2 = haversine(o, c2), near = /^(?:closer|nearer)$/.test(m[1]);
        var win = (d1 < d2) === near ? [c1, d1, c2, d2] : [c2, d2, c1, d1];
        return res(label(win[0]) + " is " + (near ? "closer to " : "farther from ") + label(o) + " than " + label(win[2]) + " is: about " + both(win[1]) + " compared with " + both(win[3]) + ", in a straight line." + capNote(o, win[0]), "distance:compare");
      }
    }
    if ((m = l.match(/^(?:which|what)(?: (?:one|city|country|place|capital))? is (?:the )?(?:further|farther|more)? ?(north|south|east|west)(?:ern)?(?:er|most)?,? (.+?) or (.+)$/)) ||
        (m = l.match(/^(?:which|what)(?: (?:one|city|country|place|capital))? is (?:further|farther) (north|south|east|west),? (.+?) or (.+)$/))) {
      a = resolve(m[2]); b = resolve(m[3]);
      if (a && b && a !== b) {
        var dir = m[1], key = dir === "north" || dir === "south" ? "lat" : "lon", sign = dir === "north" || dir === "east" ? 1 : -1;
        var diff = (a[key] - b[key]) * sign;
        if (Math.abs(diff) < 0.05) return res(label(a) + " and " + label(b) + " are at about the same " + (key === "lat" ? "latitude" : "longitude") + ".", "distance:direction");
        var w = diff > 0 ? a : b, lo = diff > 0 ? b : a;
        return res(label(w) + " is farther " + dir + " than " + label(lo) + ": " + coord(w) + " against " + coord(lo) + ".", "distance:direction");
      }
    }

    /* coordinates, latitude, longitude, hemisphere */
    if ((m = l.match(/^(?:what(?:'s| is| are) )?(?:the )?(?:gps )?(?:coordinates|co-ordinates|latitude and longitude|lat and long|lat long|lat\/long|location)(?: coordinates)? (?:of|for) (.+?)(?:\?)?$/)) ||
        (m = l.match(/^(?:what(?:'s| is| are) )?(?:the )?(latitude|longitude|lat|long) (?:of|for) (.+)$/))) {
      var which = /^(latitude|longitude|lat|long)$/.test(m[1]) ? m[1] : "", pl = resolve(which ? m[2] : m[1]);
      if (pl && !(!which && /^location$/.test(""))) {
        if (/^lat/.test(which)) return res("The latitude of " + label(pl) + " is about " + latStr(pl) + "." + (pl.country ? " (That is its capital, " + titleCase(pl.name) + ".)" : ""), "distance:coord");
        if (/^long/.test(which)) return res("The longitude of " + label(pl) + " is about " + lonStr(pl) + "." + (pl.country ? " (That is its capital, " + titleCase(pl.name) + ".)" : ""), "distance:coord");
        return res(label(pl) + (pl.country ? " (its capital, " + titleCase(pl.name) + ")" : "") + " is at about " + coord(pl) + ".", "distance:coord");
      }
    }
    if ((m = l.match(/^(?:which|what) hemisphere is (.+?)(?: in| located in)?$/)) || (m = l.match(/^is (.+?) in the (northern|southern|eastern|western)(?: or (?:the )?(?:northern|southern|eastern|western))? hemisphere$/))) {
      var hp = resolve(m[1]);
      if (hp) return res(label(hp) + (hp.country ? " (its capital, " + titleCase(hp.name) + ")" : "") + " is in the " + (hp.lat > 0 ? "northern" : hp.lat < 0 ? "southern" : "equatorial") + " hemisphere (latitude " + latStr(hp) + ") and the " + (hp.lon >= 0 ? "eastern" : "western") + " hemisphere (longitude " + lonStr(hp) + ").", "distance:hemisphere");
    }
    return null;
  }
  function latStr(p) { return Math.abs(Math.round(p.lat * 10) / 10) + "° " + (p.lat >= 0 ? "N" : "S"); }
  function lonStr(p) { return Math.abs(Math.round(p.lon * 10) / 10) + "° " + (p.lon >= 0 ? "E" : "W"); }
  function coord(p) { return latStr(p) + ", " + lonStr(p); }

  root.C4LMDistance = { solve: solve, resolve: resolve, haversine: haversine, places: NAMES, countries: COUNTRY_NAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMDistance;
})(typeof window !== "undefined" ? window : globalThis);
