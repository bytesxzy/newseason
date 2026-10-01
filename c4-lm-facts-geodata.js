/* Sizes and head counts: country areas, US state areas and populations, and big-city populations. Figures are rounded and approximate. Local only. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];
  function n(x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function mil(m) { return m >= 100 ? "about " + Math.round(m) + " million" : (m >= 10 ? "about " + Math.round(m) + " million" : (m >= 1 ? "about " + (Math.round(m * 10) / 10) + " million" : "about " + Math.round(m * 1000) + " thousand")); }
  var THE = /^(?:United States|United Kingdom|United Arab Emirates|Netherlands|Philippines|Bahamas|Czech Republic|Democratic Republic of the Congo|Maldives)$/;

  /* country | area in square kilometres */
  ("Afghanistan|652864;Albania|28748;Algeria|2381741;Angola|1246700;Argentina|2780400;Armenia|29743;Australia|7692024;Austria|83879;Azerbaijan|86600;Bangladesh|147570;Belarus|207600;" +
   "Belgium|30528;Bolivia|1098581;Bosnia and Herzegovina|51197;Botswana|581730;Brazil|8515767;Bulgaria|110879;Cambodia|181035;Cameroon|475442;Canada|9984670;Chad|1284000;Chile|756102;" +
   "China|9596961;Colombia|1141748;Costa Rica|51100;Croatia|56594;Cuba|109884;Cyprus|9251;Czech Republic|78865;Democratic Republic of the Congo|2344858;Denmark|43094;Dominican Republic|48671;" +
   "Ecuador|283561;Egypt|1002450;El Salvador|21041;Estonia|45339;Ethiopia|1104300;Finland|338424;France|551695;Germany|357022;Ghana|238533;Greece|131957;Guatemala|108889;Haiti|27750;" +
   "Honduras|112492;Hungary|93028;Iceland|103000;India|3287263;Indonesia|1904569;Iran|1648195;Iraq|438317;Ireland|70273;Israel|22072;Italy|301340;Jamaica|10991;Japan|377975;Jordan|89342;" +
   "Kazakhstan|2724900;Kenya|580367;Kuwait|17818;Laos|236800;Latvia|64589;Lebanon|10452;Libya|1759540;Lithuania|65300;Luxembourg|2586;Madagascar|587041;Malaysia|330803;Mali|1240192;" +
   "Mexico|1964375;Mongolia|1564116;Morocco|446550;Mozambique|801590;Myanmar|676578;Namibia|825615;Nepal|147181;Netherlands|41543;New Zealand|268021;Nicaragua|130373;Niger|1267000;" +
   "Nigeria|923768;North Korea|120538;Norway|385207;Oman|309500;Pakistan|881913;Panama|75417;Papua New Guinea|462840;Paraguay|406752;Peru|1285216;Philippines|300000;Poland|312696;" +
   "Portugal|92212;Qatar|11586;Romania|238397;Russia|17098246;Saudi Arabia|2149690;Senegal|196722;Serbia|88361;Singapore|733;Slovakia|49035;Slovenia|20273;Somalia|637657;South Africa|1221037;" +
   "South Korea|100210;South Sudan|644329;Spain|505990;Sri Lanka|65610;Sudan|1861484;Sweden|450295;Switzerland|41285;Syria|185180;Taiwan|36193;Tanzania|945087;Thailand|513120;Tunisia|163610;" +
   "Turkey|783562;Uganda|241550;Ukraine|603550;United Arab Emirates|83600;United Kingdom|243610;United States|9833517;Uruguay|176215;Uzbekistan|447400;Venezuela|916445;Vietnam|331212;" +
   "Yemen|527968;Zambia|752612;Zimbabwe|390757;Malta|316;Maldives|298;Bahamas|13943;Liechtenstein|160;San Marino|61;Monaco|2;Vatican City|0.44").split(";").forEach(function (row) {
    var p = row.split("|"), nm = p[0], a = +p[1], tn = THE.test(nm) ? "the " + nm : nm, T = tn.charAt(0).toUpperCase() + tn.slice(1);
    var sz = a < 10 ? (a < 1 ? "about " + a + " square kilometres" : "about " + a + " square kilometres") : "about " + n(a) + " square kilometres";
    out.push("The area of " + tn + " is " + sz + ".");
    out.push(T + " covers " + sz + ", so it is " + (a > 3000000 ? "one of the largest countries in the world" : (a > 500000 ? "a large country" : (a > 50000 ? "a medium-sized country" : "a small country"))) + ".");
  });
  out.push("Russia is the largest country in the world by area, followed by Canada, the United States and China.");
  out.push("Vatican City is the smallest country in the world, at about 0.44 square kilometres, followed by Monaco and San Marino.");
  out.push("The largest country in Africa by area is Algeria, followed by the Democratic Republic of the Congo and Sudan.");
  out.push("The largest country in South America is Brazil, which covers about 8.5 million square kilometres.");
  out.push("The largest country in Europe is Russia, and the largest country entirely within Europe is Ukraine.");
  out.push("The largest country in Asia is Russia if you count its Asian part, or China and India for the largest countries wholly in Asia.");
  out.push("The largest country in North America is Canada, which covers about 10 million square kilometres.");
  out.push("The largest country in Oceania is Australia, which covers about 7.7 million square kilometres.");
  out.push("The smallest country in Africa is Seychelles, and the smallest country on the mainland of Africa is the Gambia.");
  out.push("The smallest country in Europe is Vatican City, and the smallest in Asia is the Maldives.");

  /* state | area in square kilometres | area in square miles | population in millions (2020 census) */
  var STATES = ("Alaska|1723337|665384|0.73;Texas|695662|268596|29.1;California|423970|163696|39.5;Montana|380831|147040|1.08;New Mexico|314917|121590|2.12;Arizona|295234|113990|7.15;Nevada|286380|110572|3.1;" +
   "Colorado|269601|104094|5.77;Oregon|254799|98379|4.24;Wyoming|253335|97813|0.58;Michigan|250487|96714|10.1;Minnesota|225163|86936|5.7;Utah|219882|84897|3.27;Idaho|216443|83569|1.84;" +
   "Kansas|213100|82278|2.94;Nebraska|200330|77348|1.96;South Dakota|199729|77116|0.89;Washington|184661|71298|7.71;North Dakota|183108|70698|0.78;Oklahoma|181037|69899|3.96;" +
   "Missouri|180540|69707|6.15;Florida|170312|65758|21.5;Wisconsin|169635|65496|5.89;Georgia|153910|59425|10.7;Illinois|149995|57914|12.8;Iowa|145746|56273|3.19;New York|141297|54555|20.2;" +
   "North Carolina|139391|53819|10.4;Arkansas|137732|53179|3.01;Alabama|135767|52420|5.02;Louisiana|135659|52378|4.66;Mississippi|125438|48432|2.96;Pennsylvania|119280|46054|13.0;" +
   "Ohio|116098|44826|11.8;Virginia|110787|42775|8.63;Tennessee|109153|42144|6.91;Kentucky|104656|40408|4.51;Indiana|94326|36420|6.79;Maine|91633|35380|1.36;South Carolina|82933|32020|5.12;" +
   "West Virginia|62756|24230|1.79;Maryland|32131|12406|6.18;Hawaii|28313|10932|1.46;Massachusetts|27336|10554|7.03;Vermont|24906|9616|0.64;New Hampshire|24214|9349|1.38;" +
   "New Jersey|22591|8723|9.29;Connecticut|14357|5543|3.61;Delaware|6446|2489|0.99;Rhode Island|4001|1545|1.10").split(";");
  STATES.forEach(function (row) {
    var p = row.split("|"), nm = p[0], km = +p[1], mi = +p[2], pop = +p[3];
    out.push("The area of " + nm + " is about " + n(km) + " square kilometres, or " + n(mi) + " square miles.");
    out.push(nm + " covers about " + n(km) + " square kilometres (" + n(mi) + " square miles), so it is " + (km > 400000 ? "one of the largest US states" : (km > 150000 ? "a large US state" : (km > 50000 ? "a medium-sized US state" : "a small US state"))) + ".");
    out.push("The population of " + nm + " is " + mil(pop) + " people, according to the 2020 US census.");
  });
  out.push("The largest US state by area is Alaska, followed by Texas and California, and the smallest is Rhode Island.");
  out.push("The most populous US state is California, followed by Texas, Florida and New York, and the least populous is Wyoming.");
  out.push("Texas is bigger than France: Texas covers about 696,000 square kilometres and France about 552,000.");
  out.push("Alaska is more than twice the size of Texas, and it covers about 1.7 million square kilometres.");
  out.push("The state of Rhode Island is the smallest US state, at about 4,000 square kilometres, and it is smaller than most counties in the western United States.");

  /* city | population | kind of figure */
  ("Tokyo|about 14 million|the city proper, and the Greater Tokyo area has about 37 million;Delhi|about 33 million|the whole Delhi urban area;Shanghai|about 25 million|the city;Beijing|about 21 million|the city;" +
   "Mumbai|about 12.5 million|the city, and about 21 million in the wider metropolitan area;Sao Paulo|about 12 million|the city, and about 22 million in the wider metropolitan area;" +
   "Mexico City|about 9 million|the city, and about 22 million in the wider metropolitan area;Cairo|about 10 million|the city, and about 21 million in Greater Cairo;" +
   "Dhaka|about 10 million|the city, and more than 20 million in the wider area;Osaka|about 2.7 million|the city, and about 19 million in the wider area;New York City|about 8.3 million|the city, and about 20 million in the metropolitan area;" +
   "Karachi|about 16 million|the city;Buenos Aires|about 3 million|the city, and about 15 million in Greater Buenos Aires;Istanbul|about 15.5 million|the city;Lagos|more than 15 million|the metropolitan area;" +
   "Los Angeles|about 3.9 million|the city, and about 13 million in the metropolitan area;Paris|about 2.1 million|the city, and about 12 million in the metropolitan area;London|about 9 million|Greater London;" +
   "Moscow|about 12.6 million|the city;Jakarta|about 10.6 million|the city, and more than 30 million in the wider area;Seoul|about 9.4 million|the city;Bangkok|about 10.5 million|the city;" +
   "Lima|about 10 million|the metropolitan area;Chicago|about 2.7 million|the city;Toronto|about 2.8 million|the city;Sydney|about 5.3 million|Greater Sydney;Berlin|about 3.7 million|the city;" +
   "Madrid|about 3.3 million|the city;Rome|about 2.8 million|the city;Nairobi|about 4.4 million|the city;Johannesburg|about 5.6 million|the city;Singapore|about 5.9 million|the city-state;" +
   "Hong Kong|about 7.5 million|the territory;Kyiv|about 3 million|the city;Vienna|about 2 million|the city;Amsterdam|about 0.9 million|the city;Dublin|about 0.55 million|the city;" +
   "Mumbai|about 12.5 million|the city;Cape Town|about 4.7 million|the city;Rio de Janeiro|about 6.7 million|the city;Santiago|about 6.8 million|the metropolitan area;Bogota|about 7.9 million|the city;" +
   "Tehran|about 9 million|the city;Baghdad|about 8 million|the city;Riyadh|about 7.5 million|the city;Manila|about 1.8 million|the city proper, and about 14 million in Metro Manila;" +
   "Kolkata|about 4.5 million|the city, and about 15 million in the wider area;Chennai|about 7 million|the city;Bangalore|about 8.4 million|the city;Lahore|about 13 million|the city;" +
   "Shenzhen|about 17 million|the city;Guangzhou|about 18 million|the city;Chengdu|about 21 million|the city;Washington, D.C.|about 0.7 million|the city;Houston|about 2.3 million|the city;" +
   "Philadelphia|about 1.6 million|the city;Boston|about 0.65 million|the city;San Francisco|about 0.8 million|the city;Miami|about 0.45 million|the city;Vancouver|about 0.7 million|the city;" +
   "Montreal|about 1.8 million|the city;Melbourne|about 5 million|Greater Melbourne;Auckland|about 1.7 million|the urban area;Athens|about 0.64 million|the city;Lisbon|about 0.55 million|the city;" +
   "Barcelona|about 1.6 million|the city;Munich|about 1.5 million|the city;Milan|about 1.4 million|the city;Warsaw|about 1.8 million|the city;Prague|about 1.3 million|the city;" +
   "Budapest|about 1.7 million|the city;Stockholm|about 1 million|the city;Oslo|about 0.7 million|the city;Copenhagen|about 0.65 million|the city;Helsinki|about 0.65 million|the city;" +
   "Brussels|about 1.2 million|the city region;Zurich|about 0.42 million|the city;Edinburgh|about 0.53 million|the city;Manchester|about 0.55 million|the city;Casablanca|about 3.4 million|the city;" +
   "Addis Ababa|about 3.5 million|the city;Accra|about 2.5 million|the city;Dar es Salaam|about 5 million|the city;Kinshasa|about 15 million|the city;Luanda|about 9 million|the city").split(";").forEach(function (row) {
    var p = row.split("|"); if (p.length < 3) return;
    var city = p[0], pop = p[1], kind = p[2];
    out.push("The population of " + city + " is " + pop + (/^about|^more/.test(pop) ? "" : "") + " people (" + kind + ").");
  });
  out.push("The largest city in the world by metropolitan population is Tokyo, with about 37 million people, followed by Delhi and Shanghai.");
  out.push("The largest city in Europe by population is Istanbul if you count its European and Asian sides, and Moscow is the largest wholly in Europe.");
  out.push("The largest city in Africa is Cairo, with about 21 million people in the wider area, with Lagos and Kinshasa close behind.");
  out.push("The largest city in South America is Sao Paulo, with about 22 million people in the wider area.");
  out.push("The largest city in North America is Mexico City by metropolitan area, with about 22 million people, followed by New York.");
  out.push("The largest city in Australia is Sydney, followed by Melbourne.");
  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
