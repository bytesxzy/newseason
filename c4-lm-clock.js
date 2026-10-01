/* World clock and holiday calendar. The time in other cities, the difference between two places, a time converted from one place
 * to another, the date of a holiday in any year, how many days are left until it, and its day of the week.
 *
 * Time zones come from the browser's own tz database (Intl), so daylight saving is handled by the platform. Holiday dates are
 * computed by rule (Easter by the Meeus algorithm; Thanksgiving, Mother's Day and the rest by weekday rules). Nothing is
 * fetched. solve(text, now) returns { answer, schema, confidence } or null. */
(function (root) {
  "use strict";

  var CITY = {
    "new york": "America/New_York", "nyc": "America/New_York", "new york city": "America/New_York", "boston": "America/New_York", "washington": "America/New_York", "washington dc": "America/New_York", "miami": "America/New_York", "atlanta": "America/New_York", "philadelphia": "America/New_York", "toronto": "America/Toronto", "montreal": "America/Toronto", "florida": "America/New_York",
    "chicago": "America/Chicago", "houston": "America/Chicago", "dallas": "America/Chicago", "texas": "America/Chicago", "new orleans": "America/Chicago", "mexico city": "America/Mexico_City", "mexico": "America/Mexico_City", "winnipeg": "America/Winnipeg",
    "denver": "America/Denver", "phoenix": "America/Phoenix", "salt lake city": "America/Denver", "calgary": "America/Edmonton", "edmonton": "America/Edmonton",
    "los angeles": "America/Los_Angeles", "la": "America/Los_Angeles", "san francisco": "America/Los_Angeles", "seattle": "America/Los_Angeles", "san diego": "America/Los_Angeles", "las vegas": "America/Los_Angeles", "vancouver": "America/Vancouver", "california": "America/Los_Angeles", "portland": "America/Los_Angeles",
    "anchorage": "America/Anchorage", "alaska": "America/Anchorage", "honolulu": "Pacific/Honolulu", "hawaii": "Pacific/Honolulu",
    "bogota": "America/Bogota", "lima": "America/Lima", "caracas": "America/Caracas", "santiago": "America/Santiago", "buenos aires": "America/Argentina/Buenos_Aires", "argentina": "America/Argentina/Buenos_Aires", "sao paulo": "America/Sao_Paulo", "rio de janeiro": "America/Sao_Paulo", "rio": "America/Sao_Paulo", "brazil": "America/Sao_Paulo", "havana": "America/Havana", "panama": "America/Panama", "jamaica": "America/Jamaica", "kingston": "America/Jamaica",
    "london": "Europe/London", "uk": "Europe/London", "united kingdom": "Europe/London", "england": "Europe/London", "scotland": "Europe/London", "edinburgh": "Europe/London", "manchester": "Europe/London", "dublin": "Europe/Dublin", "ireland": "Europe/Dublin", "lisbon": "Europe/Lisbon", "portugal": "Europe/Lisbon", "reykjavik": "Atlantic/Reykjavik", "iceland": "Atlantic/Reykjavik",
    "paris": "Europe/Paris", "france": "Europe/Paris", "berlin": "Europe/Berlin", "germany": "Europe/Berlin", "munich": "Europe/Berlin", "madrid": "Europe/Madrid", "spain": "Europe/Madrid", "barcelona": "Europe/Madrid", "rome": "Europe/Rome", "italy": "Europe/Rome", "milan": "Europe/Rome", "amsterdam": "Europe/Amsterdam", "netherlands": "Europe/Amsterdam", "brussels": "Europe/Brussels", "belgium": "Europe/Brussels", "vienna": "Europe/Vienna", "austria": "Europe/Vienna", "zurich": "Europe/Zurich", "switzerland": "Europe/Zurich", "geneva": "Europe/Zurich", "stockholm": "Europe/Stockholm", "sweden": "Europe/Stockholm", "oslo": "Europe/Oslo", "norway": "Europe/Oslo", "copenhagen": "Europe/Copenhagen", "denmark": "Europe/Copenhagen", "prague": "Europe/Prague", "warsaw": "Europe/Warsaw", "poland": "Europe/Warsaw", "budapest": "Europe/Budapest", "hungary": "Europe/Budapest", "belgrade": "Europe/Belgrade",
    "helsinki": "Europe/Helsinki", "finland": "Europe/Helsinki", "athens": "Europe/Athens", "greece": "Europe/Athens", "kyiv": "Europe/Kyiv", "kiev": "Europe/Kyiv", "ukraine": "Europe/Kyiv", "bucharest": "Europe/Bucharest", "romania": "Europe/Bucharest", "sofia": "Europe/Sofia", "istanbul": "Europe/Istanbul", "turkey": "Europe/Istanbul", "ankara": "Europe/Istanbul", "moscow": "Europe/Moscow", "russia": "Europe/Moscow", "st petersburg": "Europe/Moscow", "saint petersburg": "Europe/Moscow", "minsk": "Europe/Minsk",
    "cairo": "Africa/Cairo", "egypt": "Africa/Cairo", "lagos": "Africa/Lagos", "nigeria": "Africa/Lagos", "accra": "Africa/Accra", "ghana": "Africa/Accra", "nairobi": "Africa/Nairobi", "kenya": "Africa/Nairobi", "addis ababa": "Africa/Addis_Ababa", "ethiopia": "Africa/Addis_Ababa", "johannesburg": "Africa/Johannesburg", "south africa": "Africa/Johannesburg", "cape town": "Africa/Johannesburg", "casablanca": "Africa/Casablanca", "morocco": "Africa/Casablanca", "algiers": "Africa/Algiers", "tunis": "Africa/Tunis", "dakar": "Africa/Dakar", "kinshasa": "Africa/Kinshasa", "dar es salaam": "Africa/Dar_es_Salaam", "tanzania": "Africa/Dar_es_Salaam",
    "dubai": "Asia/Dubai", "uae": "Asia/Dubai", "abu dhabi": "Asia/Dubai", "riyadh": "Asia/Riyadh", "saudi arabia": "Asia/Riyadh", "mecca": "Asia/Riyadh", "doha": "Asia/Qatar", "qatar": "Asia/Qatar", "kuwait": "Asia/Kuwait", "baghdad": "Asia/Baghdad", "iraq": "Asia/Baghdad", "tehran": "Asia/Tehran", "iran": "Asia/Tehran", "jerusalem": "Asia/Jerusalem", "tel aviv": "Asia/Jerusalem", "israel": "Asia/Jerusalem", "beirut": "Asia/Beirut", "amman": "Asia/Amman",
    "karachi": "Asia/Karachi", "pakistan": "Asia/Karachi", "islamabad": "Asia/Karachi", "lahore": "Asia/Karachi", "delhi": "Asia/Kolkata", "new delhi": "Asia/Kolkata", "mumbai": "Asia/Kolkata", "bombay": "Asia/Kolkata", "kolkata": "Asia/Kolkata", "calcutta": "Asia/Kolkata", "bangalore": "Asia/Kolkata", "bengaluru": "Asia/Kolkata", "chennai": "Asia/Kolkata", "india": "Asia/Kolkata", "kathmandu": "Asia/Kathmandu", "nepal": "Asia/Kathmandu", "dhaka": "Asia/Dhaka", "bangladesh": "Asia/Dhaka", "colombo": "Asia/Colombo", "sri lanka": "Asia/Colombo", "kabul": "Asia/Kabul", "tashkent": "Asia/Tashkent", "almaty": "Asia/Almaty",
    "bangkok": "Asia/Bangkok", "thailand": "Asia/Bangkok", "hanoi": "Asia/Ho_Chi_Minh", "ho chi minh city": "Asia/Ho_Chi_Minh", "vietnam": "Asia/Ho_Chi_Minh", "jakarta": "Asia/Jakarta", "indonesia": "Asia/Jakarta", "singapore": "Asia/Singapore", "kuala lumpur": "Asia/Kuala_Lumpur", "malaysia": "Asia/Kuala_Lumpur", "manila": "Asia/Manila", "philippines": "Asia/Manila", "hong kong": "Asia/Hong_Kong", "macau": "Asia/Macau", "taipei": "Asia/Taipei", "taiwan": "Asia/Taipei", "shanghai": "Asia/Shanghai", "beijing": "Asia/Shanghai", "china": "Asia/Shanghai", "shenzhen": "Asia/Shanghai", "guangzhou": "Asia/Shanghai", "tokyo": "Asia/Tokyo", "japan": "Asia/Tokyo", "osaka": "Asia/Tokyo", "kyoto": "Asia/Tokyo", "seoul": "Asia/Seoul", "south korea": "Asia/Seoul", "korea": "Asia/Seoul", "pyongyang": "Asia/Pyongyang", "ulaanbaatar": "Asia/Ulaanbaatar", "mongolia": "Asia/Ulaanbaatar", "yangon": "Asia/Yangon", "myanmar": "Asia/Yangon",
    "sydney": "Australia/Sydney", "melbourne": "Australia/Melbourne", "canberra": "Australia/Sydney", "australia": "Australia/Sydney", "brisbane": "Australia/Brisbane", "perth": "Australia/Perth", "adelaide": "Australia/Adelaide", "darwin": "Australia/Darwin", "hobart": "Australia/Hobart",
    "auckland": "Pacific/Auckland", "new zealand": "Pacific/Auckland", "wellington": "Pacific/Auckland", "fiji": "Pacific/Fiji", "suva": "Pacific/Fiji", "guam": "Pacific/Guam", "tahiti": "Pacific/Tahiti", "samoa": "Pacific/Apia",
    "utc": "UTC", "gmt": "UTC", "greenwich": "Europe/London", "zulu": "UTC"
  };
  /* zone abbreviations point at a place that follows that zone, so daylight saving is applied for the date asked */
  var ABBR = {
    est: "America/New_York", edt: "America/New_York", eastern: "America/New_York", "eastern time": "America/New_York", et: "America/New_York",
    cst: "America/Chicago", cdt: "America/Chicago", central: "America/Chicago", "central time": "America/Chicago", ct: "America/Chicago",
    mst: "America/Denver", mdt: "America/Denver", mountain: "America/Denver", "mountain time": "America/Denver", mt: "America/Denver",
    pst: "America/Los_Angeles", pdt: "America/Los_Angeles", pacific: "America/Los_Angeles", "pacific time": "America/Los_Angeles", pt: "America/Los_Angeles",
    akst: "America/Anchorage", akdt: "America/Anchorage", hst: "Pacific/Honolulu",
    bst: "Europe/London", cet: "Europe/Paris", cest: "Europe/Paris", eet: "Europe/Athens", eest: "Europe/Athens", wet: "Europe/Lisbon", msk: "Europe/Moscow",
    ist: "Asia/Kolkata", jst: "Asia/Tokyo", kst: "Asia/Seoul", hkt: "Asia/Hong_Kong", sgt: "Asia/Singapore", pkt: "Asia/Karachi",
    aest: "Australia/Sydney", aedt: "Australia/Sydney", acst: "Australia/Adelaide", awst: "Australia/Perth", nzst: "Pacific/Auckland", nzdt: "Pacific/Auckland",
    utc: "UTC", gmt: "UTC", z: "UTC"
  };
  var LABEL = { "UTC": "UTC" };

  function title(s) { return s.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }).replace(/\bUk\b/, "UK").replace(/\bUae\b/, "UAE").replace(/\bUtc\b/, "UTC").replace(/\bGmt\b/, "GMT").replace(/\bLa\b/, "LA").replace(/\bNyc\b/, "NYC").replace(/\bDc\b/, "DC").replace(/\bSt\b/, "St"); }

  function resolve(name) {
    var k = String(name || "").toLowerCase().replace(/[.,!?]+$/g, "").replace(/\b(?:the|in|at|local|current)\b/g, " ").replace(/\s+time$/, "").replace(/\s+/g, " ").trim();
    var k2 = k.replace(/\s+(?:city|time zone|timezone)$/, "");
    if (CITY[k2]) return { tz: CITY[k2], name: title(k2), abbr: false };
    if (CITY[k]) return { tz: CITY[k], name: title(k), abbr: false };
    var kk = String(name || "").toLowerCase().replace(/[.,!?]+$/g, "").trim();
    if (ABBR[kk]) return { tz: ABBR[kk], name: kk.toUpperCase(), abbr: true };
    if (ABBR[k]) return { tz: ABBR[k], name: k.toUpperCase().replace(/ TIME$/, ""), abbr: true };
    var u = k.match(/^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/);
    if (u) { var off = (u[1] === "-" ? -1 : 1) * (+u[2] * 60 + (+u[3] || 0)); return { fixed: off, name: "UTC" + u[1] + (+u[2]) + (u[3] ? ":" + u[3] : ""), abbr: true }; }
    return null;
  }

  /* offset of a zone from UTC, in minutes, at an instant */
  function offsetAt(z, t) {
    if (z.fixed !== undefined) return z.fixed;
    var dtf = new Intl.DateTimeFormat("en-US", { timeZone: z.tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    var p = {}; dtf.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = +x.value; });
    var asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
    return Math.round((asUtc - Math.floor(t / 1000) * 1000) / 60000);
  }
  /* the instant at which a zone's wall clock shows Y-M-D h:m */
  function instantFor(z, Y, M, D, h, mi) {
    var guess = Date.UTC(Y, M - 1, D, h, mi), off = offsetAt(z, guess), t = guess - off * 60000, off2 = offsetAt(z, t);
    if (off2 !== off) t = guess - off2 * 60000;
    return t;
  }
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function wall(z, t) {
    var d = new Date(t + offsetAt(z, t) * 60000);
    return { Y: d.getUTCFullYear(), M: d.getUTCMonth(), D: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
  }
  function clock(w) { var h12 = w.h % 12 === 0 ? 12 : w.h % 12; return h12 + ":" + (w.mi < 10 ? "0" : "") + w.mi + " " + (w.h < 12 ? "AM" : "PM"); }
  function dateStr(w) { return DAYS[w.dow] + ", " + MONTHS[w.M] + " " + w.D + ", " + w.Y; }
  function utcLabel(z, t) {
    var o = offsetAt(z, t), sign = o < 0 ? "-" : "+", a = Math.abs(o), h = Math.floor(a / 60), m = a % 60;
    return "UTC" + sign + h + (m ? ":" + (m < 10 ? "0" : "") + m : "");
  }
  function shown(z) { return LABEL[z.tz] || z.name; }

  function parseTime(s) {
    s = String(s || "").toLowerCase().trim();
    if (/^noon$|^midday$/.test(s)) return { h: 12, mi: 0 };
    if (/^midnight$/.test(s)) return { h: 0, mi: 0 };
    var m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
    if (!m) return null;
    var h = +m[1], mi = +(m[2] || 0), ap = m[3] ? m[3].charAt(0) : "";
    if (mi > 59 || h > 24) return null;
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    if (!ap && h > 23) return null;
    return { h: h % 24, mi: mi };
  }
  var TIMEPAT = "(?:\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?|noon|midnight|midday)";

  function timeNow(zname, now) {
    var z = resolve(zname); if (!z) return null;
    var t = now.getTime(), w = wall(z, t);
    return "It is " + clock(w) + " on " + dateStr(w) + " in " + shown(z) + " (" + utcLabel(z, t) + ").";
  }
  function difference(an, bn, now) {
    var a = resolve(an), b = resolve(bn); if (!a || !b) return null;
    var t = now.getTime(), d = offsetAt(a, t) - offsetAt(b, t), h = Math.abs(d) / 60;
    var hs = (Math.floor(h) === h ? String(h) : (Math.round(h * 100) / 100)) + (h === 1 ? " hour" : " hours");
    if (d === 0) return shown(a) + " and " + shown(b) + " are on the same time right now.";
    return shown(a) + " is " + hs + " " + (d > 0 ? "ahead of" : "behind") + " " + shown(b) + " right now" + (a.abbr || b.abbr ? "" : ", allowing for daylight saving") + ".";
  }
  function convert(tm, fromName, toName, now) {
    var a = resolve(fromName), b = resolve(toName), T = parseTime(tm); if (!a || !b || !T) return null;
    var w0 = wall(a, now.getTime()), t = instantFor(a, w0.Y, w0.M + 1, w0.D, T.h, T.mi), w = wall(b, t), w1 = wall(a, t);
    var dayNote = w.D !== w1.D || w.M !== w1.M ? (Date.UTC(w.Y, w.M, w.D) > Date.UTC(w1.Y, w1.M, w1.D) ? " the next day" : " the previous day") : "";
    return clock(w1) + " in " + shown(a) + " is " + clock(w) + dayNote + " in " + shown(b) + " (" + DAYS[w.dow] + ", " + MONTHS[w.M] + " " + w.D + ").";
  }

  /* ---------------------------------------------------------------- holidays */
  function nthWeekday(Y, M, dow, n) {         /* n-th (1..) weekday of a month; n = -1 for the last one */
    if (n > 0) { var first = new Date(Date.UTC(Y, M, 1)).getUTCDay(); return Date.UTC(Y, M, 1 + ((dow - first + 7) % 7) + (n - 1) * 7); }
    var last = new Date(Date.UTC(Y, M + 1, 0)); return Date.UTC(Y, M, last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7));
  }
  function easter(Y) {
    var a = Y % 19, b = Math.floor(Y / 100), c = Y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return Date.UTC(Y, month - 1, day);
  }
  var DAYMS = 86400000;
  var CNY = { 2024: [1, 10], 2025: [0, 29], 2026: [1, 17], 2027: [1, 6], 2028: [0, 26], 2029: [1, 13], 2030: [1, 3], 2031: [0, 23], 2032: [1, 11] };
  /* name pattern -> [label, function(year) -> UTC ms, note] */
  var HOLIDAYS = [
    [/^(?:christmas|christmas day|xmas)$/, "Christmas Day", function (Y) { return Date.UTC(Y, 11, 25); }],
    [/^christmas eve$/, "Christmas Eve", function (Y) { return Date.UTC(Y, 11, 24); }],
    [/^boxing day$/, "Boxing Day", function (Y) { return Date.UTC(Y, 11, 26); }],
    [/^(?:new year'?s? day|new years day|new year)$/, "New Year's Day", function (Y) { return Date.UTC(Y, 0, 1); }],
    [/^new year'?s? eve$/, "New Year's Eve", function (Y) { return Date.UTC(Y, 11, 31); }],
    [/^valentine'?s?(?: day)?$/, "Valentine's Day", function (Y) { return Date.UTC(Y, 1, 14); }],
    [/^halloween$/, "Halloween", function (Y) { return Date.UTC(Y, 9, 31); }],
    [/^(?:independence day|fourth of july|4th of july|july 4th|july 4)$/, "Independence Day", function (Y) { return Date.UTC(Y, 6, 4); }],
    [/^st\.? patrick'?s?(?: day)?$|^saint patrick'?s?(?: day)?$/, "St Patrick's Day", function (Y) { return Date.UTC(Y, 2, 17); }],
    [/^april fools'?(?: day)?$/, "April Fools' Day", function (Y) { return Date.UTC(Y, 3, 1); }],
    [/^earth day$/, "Earth Day", function (Y) { return Date.UTC(Y, 3, 22); }],
    [/^may day$/, "May Day", function (Y) { return Date.UTC(Y, 4, 1); }],
    [/^cinco de mayo$/, "Cinco de Mayo", function (Y) { return Date.UTC(Y, 4, 5); }],
    [/^bastille day$/, "Bastille Day", function (Y) { return Date.UTC(Y, 6, 14); }],
    [/^veterans day$/, "Veterans Day", function (Y) { return Date.UTC(Y, 10, 11); }],
    [/^juneteenth$/, "Juneteenth", function (Y) { return Date.UTC(Y, 5, 19); }],
    [/^bonfire night$|^guy fawkes(?: night| day)?$/, "Bonfire Night", function (Y) { return Date.UTC(Y, 10, 5); }],
    [/^pi day$/, "Pi Day", function (Y) { return Date.UTC(Y, 2, 14); }],
    [/^star wars day$/, "Star Wars Day", function (Y) { return Date.UTC(Y, 4, 4); }],
    [/^thanksgiving(?: day)?(?: \(us\)| in the us| in the usa| in america)?$/, "Thanksgiving (US)", function (Y) { return nthWeekday(Y, 10, 4, 4); }],
    [/^(?:canadian thanksgiving|thanksgiving in canada|thanksgiving canada)$/, "Thanksgiving (Canada)", function (Y) { return nthWeekday(Y, 9, 1, 2); }],
    [/^mother'?s?(?: day)?$|^mothers day$/, "Mother's Day (US)", function (Y) { return nthWeekday(Y, 4, 0, 2); }],
    [/^father'?s?(?: day)?$|^fathers day$/, "Father's Day (US)", function (Y) { return nthWeekday(Y, 5, 0, 3); }],
    [/^memorial day$/, "Memorial Day", function (Y) { return nthWeekday(Y, 4, 1, -1); }],
    [/^labou?r day$/, "Labor Day (US)", function (Y) { return nthWeekday(Y, 8, 1, 1); }],
    [/^(?:mlk day|martin luther king(?: jr\.?)? day|martin luther king day)$/, "Martin Luther King Jr. Day", function (Y) { return nthWeekday(Y, 0, 1, 3); }],
    [/^presidents'? day$|^presidents day$/, "Presidents' Day", function (Y) { return nthWeekday(Y, 1, 1, 3); }],
    [/^(?:columbus day|indigenous peoples'? day)$/, "Columbus Day", function (Y) { return nthWeekday(Y, 9, 1, 2); }],
    [/^election day$/, "US Election Day", function (Y) { var d = new Date(nthWeekday(Y, 10, 1, 1)); return d.getTime() + DAYMS; }],
    [/^easter(?: sunday| day)?$/, "Easter Sunday", easter],
    [/^good friday$/, "Good Friday", function (Y) { return easter(Y) - 2 * DAYMS; }],
    [/^easter monday$/, "Easter Monday", function (Y) { return easter(Y) + DAYMS; }],
    [/^palm sunday$/, "Palm Sunday", function (Y) { return easter(Y) - 7 * DAYMS; }],
    [/^ash wednesday$/, "Ash Wednesday", function (Y) { return easter(Y) - 46 * DAYMS; }],
    [/^shrove tuesday$|^pancake day$|^mardi gras$/, "Shrove Tuesday (Mardi Gras)", function (Y) { return easter(Y) - 47 * DAYMS; }],
    [/^(?:ascension day|ascension)$/, "Ascension Day", function (Y) { return easter(Y) + 39 * DAYMS; }],
    [/^(?:pentecost|whit sunday|whitsun)$/, "Pentecost", function (Y) { return easter(Y) + 49 * DAYMS; }],
    [/^(?:chinese new year|lunar new year|spring festival)$/, "Chinese New Year", function (Y) { var c = CNY[Y]; return c ? Date.UTC(Y, c[0], c[1]) : null; }]
  ];
  function holidayFor(name) {
    var k = String(name || "").toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").replace(/[.?!]+$/, "").trim();
    for (var i = 0; i < HOLIDAYS.length; i++) if (HOLIDAYS[i][0].test(k)) return HOLIDAYS[i];
    return null;
  }
  function dayStr(ms) { var d = new Date(ms); return DAYS[d.getUTCDay()] + ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear(); }
  function nextOccurrence(h, now) {
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), Y = now.getFullYear();
    for (var y = Y; y <= Y + 3; y++) { var ms = h[2](y); if (ms !== null && ms >= today) return ms; }
    return null;
  }
  function daysWord(n) { return n + (n === 1 ? " day" : " days"); }

  function holidayWhen(name, year, now) {
    var h = holidayFor(name); if (!h) return null;
    if (year) {
      var ms = h[2](year); if (ms === null) return null;
      return h[1] + " in " + year + " is on " + dayStr(ms) + ".";
    }
    var nx = nextOccurrence(h, now); if (nx === null) return null;
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), n = Math.round((nx - today) / DAYMS);
    return (n === 0 ? h[1] + " is today, " : "The next " + h[1] + " is on ") + dayStr(nx) + (n === 0 ? "." : ", " + daysWord(n) + " from now.");
  }
  function holidayUntil(name, now) {
    var h = holidayFor(name); if (!h) return null;
    var nx = nextOccurrence(h, now); if (nx === null) return null;
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), n = Math.round((nx - today) / DAYMS);
    if (n === 0) return h[1] + " is today!";
    return "There " + (n === 1 ? "is " : "are ") + daysWord(n) + " until " + h[1] + ", which is on " + dayStr(nx) + ".";
  }
  function holidayWeekday(name, year, now) {
    var h = holidayFor(name); if (!h) return null;
    var Y = year || now.getFullYear(), ms = h[2](Y); if (ms === null) return null;
    return h[1] + " in " + Y + " falls on a " + DAYS[new Date(ms).getUTCDay()] + " (" + dayStr(ms) + ").";
  }

  function solve(text, nowArg) {
    var now = nowArg || new Date(), s = String(text || "").trim();
    if (!s || s.length > 200 || typeof Intl === "undefined") return null;
    var l = s.toLowerCase().replace(/[?!]+$/g, "").replace(/\s+/g, " ").replace(/^(?:hey|hi|please|ok|okay|so)[, ]+/, "").trim(), m, ans;
    var res = function (a, sch) { return a ? { answer: a, schema: sch, confidence: 0.9 } : null; };

    /* a time converted from one place to another */
    if ((m = l.match(new RegExp("^(?:if it(?:'s| is)|when it(?:'s| is)|when it is|if the time is)\\s+(" + TIMEPAT + ")\\s+(?:in|at)\\s+(.+?),?\\s+what(?:'s| is)? (?:the )?time (?:is it )?(?:there |over there )?in\\s+(.+)$"))) ||
        (m = l.match(new RegExp("^(?:what(?:'s| is)? )?(?:the )?time (?:is it )?in\\s+(.+?)\\s+when it(?:'s| is)\\s+(" + TIMEPAT + ")\\s+in\\s+(.+)$")))) {
      var swap = m[1] && !parseTime(m[1]);
      ans = swap ? convert(m[2], m[3], m[1], now) : convert(m[1], m[2], m[3], now);
      if (ans) return res(ans, "clock:convert");
    }
    if ((m = l.match(new RegExp("^(?:convert|change|translate)\\s+(" + TIMEPAT + ")\\s+(.+?)\\s+(?:to|into|in)\\s+(.+)$"))) ||
        (m = l.match(new RegExp("^(?:what(?:'s| is) )?(" + TIMEPAT + ")\\s+(.+?)\\s+(?:in|to)\\s+(.+?)(?:\\s+time)?$")))) {
      if (resolve(m[2]) && resolve(m[3])) { ans = convert(m[1], m[2], m[3], now); if (ans) return res(ans, "clock:convert"); }
    }
    /* the difference between two places */
    if ((m = l.match(/^(?:what(?:'s| is) )?the time difference (?:is )?(?:between|from)\s+(.+?)\s+(?:and|to)\s+(.+)$/)) ||
        (m = l.match(/^how (?:many hours|far|much) (?:ahead|behind|apart|different|earlier|later)\s+(?:is|are)\s+(.+?)\s+(?:of|from|than|to|and)\s+(.+)$/)) ||
        (m = l.match(/^how many hours (?:is|are)\s+(.+?)\s+(?:ahead of|behind|from|earlier than|later than)\s+(.+)$/)) ||
        (m = l.match(/^how many hours apart (?:are|is)\s+(.+?)\s+and\s+(.+)$/)) ||
        (m = l.match(/^(?:is|are)\s+(.+?)\s+ahead (?:of|from)\s+(.+)$/))) {
      ans = difference(m[1], m[2], now); if (ans) return res(ans, "clock:difference");
    }
    /* the time here, there */
    if ((m = l.match(/^(?:what(?:'s| is) )?(?:the )?(?:current |local )?time (?:is it )?(?:right now |now |currently |today )?(?:in|at|for)\s+(.+?)(?:\s+(?:right now|now|currently|today|at the moment))?$/)) ||
        (m = l.match(/^what time is it (?:right now |now )?(?:in|at)\s+(.+?)(?:\s+(?:right now|now|currently|today|at the moment))?$/)) ||
        (m = l.match(/^(?:current |local )?time (?:in|at)\s+(.+)$/)) ||
        (m = l.match(/^what(?:'s| is) it(?: right now| now)? (?:like )?in\s+(.+?)\s+(?:right )?now$/)) ||
        (m = l.match(/^what(?:'s| is) (?:the )?time (?:in|at)\s+(.+)$/))) {
      ans = timeNow(m[1], now); if (ans) return res(ans, "clock:now");
    }
    /* "How many days until 2030?" counts to the first of January */
    if ((m = l.match(/^how (?:many days|long)\s+(?:are there |is it |are left |is left )?(?:until|till|til|to)\s+(?:the year |the start of |the beginning of |year )?(\d{4})$/))) {
      var ty = +m[1], today0 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), tgt = Date.UTC(ty, 0, 1), dn = Math.round((tgt - today0) / DAYMS);
      if (dn > 0 && ty < 3000) return res("There are " + dn.toLocaleString("en-US") + " days until January 1, " + ty + " (about " + Math.round(dn / 36.525) / 10 + " years).", "clock:until-year");
    }
    /* holidays */
    var yr = l.match(/\b(1[5-9]\d\d|2\d\d\d)\b/), Y = yr ? +yr[1] : 0, nm;
    var stripYear = function (x) { return x.replace(/\b(?:in |for |of |during )?(?:the year )?(1[5-9]\d\d|2\d\d\d)\b/, "").replace(/\s+(?:in|for|of|during|this year|next year)$/, "").replace(/\s+/g, " ").trim(); };
    var rel = /\bnext year\b/.test(l) ? now.getFullYear() + 1 : (/\bthis year\b/.test(l) ? now.getFullYear() : 0);
    if ((m = l.match(/^(?:what|which) (?:day of the week|weekday|day) (?:is|will|does|falls? on|does it fall on)\s+(?:be\s+)?(?:the\s+)?(.+?)(?:\s+(?:fall )?(?:on|be))?$/)) ||
        (m = l.match(/^(?:what|which) (?:day of the week|weekday|day) (?:is|does)\s+(.+?)\s+(?:on|fall on|fall)$/))) {
      nm = stripYear(m[1]); ans = holidayWeekday(nm, Y || rel, now); if (ans) return res(ans, "clock:holiday-weekday");
    }
    if ((m = l.match(/^(?:how many days|how long|how much time|how many weeks|how many sleeps)\s+(?:are there |is there |is it |are left |is left )?(?:until|till|til|before|to|left until|left till|till the)\s+(?:the )?(.+)$/)) ||
        (m = l.match(/^(?:days|time)\s+(?:until|till|left until|to)\s+(?:the )?(.+)$/)) ||
        (m = l.match(/^(?:countdown to|count down to)\s+(?:the )?(.+)$/))) {
      nm = stripYear(m[1]); ans = holidayUntil(nm, now); if (ans) return res(ans, "clock:until");
    }
    if ((m = l.match(/^(?:when|what date|what day|which day|what is the date of|what(?:'s| is) the date for)\s+(?:is|does|will|falls|do we celebrate|do they celebrate)?\s*(?:the )?(.+?)(?:\s+(?:fall|falls|start|starts|begin|begins|happen|happens|take place))?(?:\s+(?:this year|next year))?$/)) ||
        (m = l.match(/^(?:what(?:'s| is) the date of|date of)\s+(?:the )?(.+)$/))) {
      nm = stripYear(m[1]).replace(/\s+(?:on|fall|falls)$/, ""); ans = holidayWhen(nm, Y || rel, now); if (ans) return res(ans, "clock:holiday");
    }
    return null;
  }

  root.C4LMClock = { solve: solve, resolve: resolve, holidayFor: holidayFor, easter: easter, offsetAt: offsetAt };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMClock;
})(typeof window !== "undefined" ? window : globalThis);
