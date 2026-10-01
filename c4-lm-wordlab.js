/* Word lab. Inflections (past tense, participles, plurals, comparatives), rhymes, pronunciation of tricky words, "is it a word?",
 * parts of speech, and example sentences for vocabulary words. Rules and tables only; nothing is fetched.
 * solve(text) returns { answer, schema, confidence } or null. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------ verbs */
  var IRR = {};
  ("be|was/were|been;have|had|had;do|did|done;go|went|gone;see|saw|seen;take|took|taken;give|gave|given;make|made|made;come|came|come;know|knew|known;get|got|gotten;say|said|said;" +
   "think|thought|thought;run|ran|run;eat|ate|eaten;drink|drank|drunk;write|wrote|written;read|read|read;speak|spoke|spoken;break|broke|broken;choose|chose|chosen;drive|drove|driven;" +
   "fly|flew|flown;grow|grew|grown;throw|threw|thrown;draw|drew|drawn;begin|began|begun;swim|swam|swum;sing|sang|sung;ring|rang|rung;sink|sank|sunk;shrink|shrank|shrunk;spring|sprang|sprung;" +
   "fall|fell|fallen;feel|felt|felt;find|found|found;keep|kept|kept;leave|left|left;lose|lost|lost;mean|meant|meant;meet|met|met;pay|paid|paid;put|put|put;sell|sold|sold;send|sent|sent;" +
   "sit|sat|sat;sleep|slept|slept;stand|stood|stood;teach|taught|taught;tell|told|told;understand|understood|understood;win|won|won;buy|bought|bought;bring|brought|brought;catch|caught|caught;" +
   "fight|fought|fought;hear|heard|heard;hold|held|held;build|built|built;spend|spent|spent;lend|lent|lent;bend|bent|bent;cut|cut|cut;hit|hit|hit;hurt|hurt|hurt;let|let|let;set|set|set;" +
   "shut|shut|shut;split|split|split;spread|spread|spread;bite|bit|bitten;hide|hid|hidden;ride|rode|ridden;rise|rose|risen;shake|shook|shaken;steal|stole|stolen;wake|woke|woken;wear|wore|worn;" +
   "tear|tore|torn;swear|swore|sworn;blow|blew|blown;freeze|froze|frozen;forget|forgot|forgotten;forgive|forgave|forgiven;lie|lay|lain;lay|laid|laid;lead|led|led;dig|dug|dug;feed|fed|fed;" +
   "flee|fled|fled;hang|hung|hung;seek|sought|sought;shoot|shot|shot;shine|shone|shone;slide|slid|slid;strike|struck|struck;sweep|swept|swept;swing|swung|swung;wind|wound|wound;" +
   "withdraw|withdrew|withdrawn;quit|quit|quit;bet|bet|bet;burst|burst|burst;cost|cost|cost;deal|dealt|dealt;dream|dreamed or dreamt|dreamed or dreamt;learn|learned or learnt|learned or learnt;" +
   "leap|leaped or leapt|leaped or leapt;light|lit|lit;mistake|mistook|mistaken;overcome|overcame|overcome;prove|proved|proved or proven;saw|sawed|sawn or sawed;shear|sheared|shorn;" +
   "sew|sewed|sewn or sewed;show|showed|shown;sow|sowed|sown;spin|spun|spun;stick|stuck|stuck;sting|stung|stung;stride|strode|stridden;string|strung|strung;thrust|thrust|thrust;" +
   "undo|undid|undone;upset|upset|upset;weave|wove|woven;weep|wept|wept;wring|wrung|wrung;become|became|become;beat|beat|beaten;bind|bound|bound;bleed|bled|bled;breed|bred|bred;" +
   "cling|clung|clung;creep|crept|crept;deal|dealt|dealt;forbid|forbade|forbidden;grind|ground|ground;kneel|knelt|knelt;overtake|overtook|overtaken;rebuild|rebuilt|rebuilt;rewrite|rewrote|rewritten;" +
   "slay|slew|slain;sneak|sneaked or snuck|sneaked or snuck;spit|spat|spat;swell|swelled|swollen;tread|trod|trodden;wed|wed|wed").split(";").forEach(function (r) { var p = r.split("|"); IRR[p[0]] = { past: p[1], pp: p[2] }; });
  var STRESS_END = /^(?:begin|prefer|refer|admit|permit|occur|control|forget|regret|submit|commit|omit|equip|compel|repel|expel|propel|rebel|excel|confer|defer|infer|transfer|deter|incur|recur|upset|beset|unplug|unwrap|outrun|overrun|rebut|acquit|patrol|enrol|enthral|forgot)$/;
  var VOW = "aeiou";
  function isV(c) { return VOW.indexOf(c) >= 0; }
  function syl(w) { var g = w.toLowerCase().replace(/e$/, "").match(/[aeiouy]+/g); return g ? g.length : 1; }
  function cvc(w) { return w.length >= 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(w) && !/[aeiou]{2}[^aeiou]$/.test(w) && (syl(w) === 1 || STRESS_END.test(w)); }
  function regPast(w) {
    if (/e$/.test(w)) return w + "d";
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ied";
    if (cvc(w)) return w + w.slice(-1) + "ed";
    if (/c$/.test(w) && /^(?:panic|picnic|mimic|traffic)$/.test(w)) return w + "ked";
    return w + "ed";
  }
  function regIng(w) {
    if (/ie$/.test(w)) return w.slice(0, -2) + "ying";
    if (/(?:ee|ye|oe)$/.test(w)) return w + "ing";
    if (/e$/.test(w) && w.length > 2) return w.slice(0, -1) + "ing";
    if (cvc(w)) return w + w.slice(-1) + "ing";
    if (/c$/.test(w) && /^(?:panic|picnic|mimic|traffic)$/.test(w)) return w + "king";
    return w + "ing";
  }
  function regS(w) {
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
    if (/(?:s|x|z|ch|sh|o)$/.test(w)) return w + "es";
    return w + "s";
  }
  function ingOf(w) { return w === "be" ? "being" : regIng(w); }

  /* ------------------------------------------------------------ nouns */
  var PL = {}, SG = {};
  ("man|men;woman|women;child|children;person|people;foot|feet;tooth|teeth;goose|geese;mouse|mice;louse|lice;ox|oxen;die|dice;penny|pennies or pence;" +
   "cactus|cacti or cactuses;fungus|fungi or funguses;nucleus|nuclei;radius|radii or radiuses;syllabus|syllabi or syllabuses;alumnus|alumni;stimulus|stimuli;focus|foci or focuses;" +
   "analysis|analyses;crisis|crises;thesis|theses;hypothesis|hypotheses;diagnosis|diagnoses;basis|bases;oasis|oases;axis|axes;parenthesis|parentheses;ellipsis|ellipses;emphasis|emphases;" +
   "criterion|criteria;phenomenon|phenomena;bacterium|bacteria;datum|data;medium|media or mediums;curriculum|curricula or curriculums;millennium|millennia or millenniums;" +
   "stadium|stadiums or stadia;appendix|appendices or appendixes;index|indices or indexes;matrix|matrices or matrixes;vertex|vertices or vertexes;formula|formulas or formulae;" +
   "antenna|antennas or antennae;larva|larvae;alga|algae;vertebra|vertebrae;fungus|fungi;genus|genera;corpus|corpora;opus|opera or opuses;sheep|sheep;fish|fish or fishes;deer|deer;" +
   "series|series;species|species;moose|moose;aircraft|aircraft;salmon|salmon;trout|trout;swine|swine;means|means;offspring|offspring;bison|bison;shrimp|shrimp or shrimps;" +
   "leaf|leaves;knife|knives;wolf|wolves;life|lives;wife|wives;half|halves;shelf|shelves;calf|calves;thief|thieves;loaf|loaves;scarf|scarves or scarfs;elf|elves;self|selves;" +
   "hoof|hooves or hoofs;wharf|wharves or wharfs;potato|potatoes;tomato|tomatoes;hero|heroes;echo|echoes;veto|vetoes;torpedo|torpedoes;volcano|volcanoes or volcanos;mosquito|mosquitoes or mosquitos;" +
   "tornado|tornadoes or tornados;buffalo|buffalo or buffaloes;mango|mangoes or mangos;cargo|cargoes or cargos;domino|dominoes;" +
   "brother-in-law|brothers-in-law;sister-in-law|sisters-in-law;mother-in-law|mothers-in-law;father-in-law|fathers-in-law;passerby|passersby;attorney general|attorneys general;" +
   "cherub|cherubim or cherubs;seraph|seraphim or seraphs;tooth fairy|tooth fairies;goose|geese;mongoose|mongooses;moose|moose;roof|roofs;chief|chiefs;belief|beliefs;cliff|cliffs;" +
   "photo|photos;piano|pianos;radio|radios;video|videos;zoo|zoos;kangaroo|kangaroos;bamboo|bamboos;studio|studios;stereo|stereos;memo|memos;logo|logos;kilo|kilos;solo|solos;" +
   "pizza|pizzas;quiz|quizzes;fez|fezzes;gas|gases;bus|buses;virus|viruses;status|statuses;bonus|bonuses;campus|campuses;census|censuses;chorus|choruses;circus|circuses;" +
   "octopus|octopuses or octopi;platypus|platypuses;hippopotamus|hippopotamuses or hippopotami;rhinoceros|rhinoceroses or rhinoceros;cactus|cacti or cactuses;" +
   "bureau|bureaus or bureaux;plateau|plateaus or plateaux;tableau|tableaux;chateau|chateaux or chateaus;beau|beaux or beaus;graffito|graffiti;paparazzo|paparazzi;" +
   "foot|feet;human|humans;german|germans;roman|romans;talisman|talismans;shaman|shamans;walkman|walkmans;stepchild|stepchildren;grandchild|grandchildren;schoolchild|schoolchildren;" +
   "policeman|policemen;fireman|firemen;businessman|businessmen;chairman|chairmen;fisherman|fishermen;postman|postmen;snowman|snowmen;sportsman|sportsmen;spokesman|spokesmen;" +
   "headmistress|headmistresses;mattress|mattresses;address|addresses;glass|glasses;class|classes;boss|bosses;dress|dresses;kiss|kisses;business|businesses;princess|princesses").split(";").forEach(function (r) {
    var p = r.split("|"); if (!PL[p[0]]) PL[p[0]] = p[1];
    p[1].split(" or ").forEach(function (f) { if (!SG[f]) SG[f] = p[0]; });
  });
  function regPlural(w) {
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
    if (/(?:s|x|z|ch|sh)$/.test(w)) return w + "es";
    if (/[^aeiou]o$/.test(w) && /^(?:potato|tomato|hero|echo|veto)$/.test(w)) return w + "es";
    if (/fe$/.test(w) && /^(?:knife|life|wife)$/.test(w)) return w.slice(0, -2) + "ves";
    return w + "s";
  }
  function regSingular(w) {
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
    if (/(?:ss|us|is)$/.test(w)) return w;
    if (/(?:s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
    if (/ves$/.test(w)) return w.slice(0, -3) + "f";
    if (/s$/.test(w) && w.length > 3) return w.slice(0, -1);
    return w;
  }

  /* ------------------------------------------------------------ adjectives */
  var CMP = { good: ["better", "best"], bad: ["worse", "worst"], well: ["better", "best"], far: ["farther or further", "farthest or furthest"], little: ["less or littler", "least or littlest"], much: ["more", "most"], many: ["more", "most"], old: ["older or elder", "oldest or eldest"], ill: ["worse", "worst"], late: ["later or latter", "latest or last"], near: ["nearer", "nearest or next"] };
  var TWO_ER = /^(?:clever|simple|narrow|quiet|gentle|common|handsome|polite|pleasant|cruel|stupid|angry|happy|easy|early|lucky|silly|funny|busy|heavy|tiny|pretty|ugly|dirty|tidy|noisy|lonely|friendly|lovely|healthy|wealthy|crazy|sunny|windy|cloudy|rainy|snowy|icy|messy|shiny|bumpy|hungry|thirsty|dusty|sleepy|speedy|tasty|funky|cozy|cosy|pale|wide|wise|nice|large|safe|brave|fine|rare|rude|ripe|tame|loose|close|strange|able|feeble|humble|noble|gentle)$/;
  function cmpForms(w) {
    if (CMP[w]) return CMP[w];
    if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + "ier", w.slice(0, -1) + "iest"];
    if (/e$/.test(w) && (syl(w) === 1 || TWO_ER.test(w))) return [w + "r", w + "st"];
    if (syl(w) === 1 || TWO_ER.test(w)) {
      var d = /[^aeiou][aeiou][^aeiouwxy]$/.test(w) && !/[aeiou]{2}[^aeiou]$/.test(w) && syl(w) === 1 ? w.slice(-1) : "";
      return [w + d + "er", w + d + "est"];
    }
    return ["more " + w, "most " + w];
  }

  /* ------------------------------------------------------------ rhymes */
  var FAM = [
    "cat bat hat mat rat sat fat flat chat brat pat vat splat that",
    "bed red head said fed led shed sled thread bread dead spread ahead instead",
    "day way say play stay may pay gray clay tray today away ray lay pray hay bay spray display okay they hey weigh sleigh",
    "see tree free me be he she key sea tea three bee knee agree degree fee flee plea tee spree",
    "night light right bright flight sight might tight fight white bite kite site write height quite polite delight invite",
    "make cake take lake shake bake wake break snake rake fake stake sake brake awake mistake",
    "rain train plane main pain brain chain gain lane vain drain explain remain reign grain strain",
    "ball call all fall wall tall small hall mall crawl shawl brawl stall install",
    "hand land band sand stand brand grand planned bland command demand expand",
    "sing ring king thing wing bring spring swing sting string cling fling wing",
    "go no so show know flow slow throw grow low toe snow row bow glow blow below although",
    "bone phone stone alone own tone zone throne cone drone loan moan groan shown known grown blown flown",
    "house mouse louse blouse grouse spouse",
    "shoe blue clue true glue two too who zoo new few view you do through flew grew knew crew chew drew stew screw",
    "tie lie die pie high sky fly my try why cry dry buy fry eye guy shy sly spy sigh reply supply apply deny",
    "book look cook hook took shook brook nook crook",
    "heart art part smart start cart chart dart apart depart",
    "moon soon spoon noon tune June balloon cartoon afternoon raccoon lagoon typhoon",
    "sun fun run one done gun bun won none ton begun sun stun spun shun",
    "hot not pot lot dot got shot spot knot plot slot cot trot rot forgot",
    "tell bell fell well sell smell shell spell yell cell dwell swell farewell",
    "bear care share dare fair hair pair chair stair air there where wear prayer square stare spare rare flare compare aware",
    "dog log frog fog hog jog blog clog bog",
    "dear near fear clear year hear tear ear beer cheer deer here peer pier steer sphere appear career",
    "bring sing wing king ring thing spring swing",
    "pig big dig fig wig twig jig rig gig",
    "boat coat goat float note vote wrote throat quote remote promote",
    "feet meet beat heat seat eat sweet treat street sheet greet fleet wheat cheat repeat complete",
    "fish dish wish swish squish",
    "bake fake lake sake",
    "hug bug rug mug jug dug tug plug snug shrug slug drug",
    "kind mind find blind behind wind(v) grind remind signed",
    "place face race space grace case base lace pace trace brace chase embrace",
    "bite kite right light night white fight sight",
    "fine line mine nine shine wine vine pine sign design divine decline combine define",
    "bow cow now how wow plow brow allow eyebrow",
    "ink pink sink drink think blink link wink stink shrink",
    "cold gold old hold told bold fold sold rolled scold mold behold",
    "bright flight",
    "free three tree",
    "late date gate wait great eight state plate weight hate crate straight skate fate rate mate",
    "tall small ball call fall wall hall",
    "ship trip chip slip drip grip flip skip whip zip tip lip hip clip dip strip equip",
    "walk talk chalk stalk balk",
    "sleep deep keep jeep weep peep creep sheep steep sweep cheap leap heap",
    "rose nose goes close those toes pose chose froze knows hose prose suppose compose expose",
    "bread head said red bed dead lead(metal) thread spread instead",
    "cow how now bow wow brow vow allow",
    "toy boy joy enjoy destroy annoy employ ahoy soy coy",
    "boil oil soil coil foil toil spoil royal",
    "hair bear care share dare fair pair chair stair air",
    "pen ten men hen when then again den glen",
    "cup up pup sup",
    "bank thank tank rank sank blank drank frank plank prank crank",
    "bump jump lump pump dump stump trump hump clump",
    "desk risk disk brisk whisk",
    "lamp camp damp stamp champ ramp cramp tramp",
    "wolf golf",
    "peach beach reach teach each speech preach bleach",
    "fox box socks rocks clocks locks blocks",
    "door more floor four pour core store roar shore score before ignore explore",
    "love dove glove above shove",
    "move groove prove improve approve remove",
    "word bird heard third absurd stirred",
    "cloud loud proud crowd allowed aloud",
    "snow glow flow below slow",
    "water daughter slaughter",
    "river liver giver shiver quiver deliver",
    "garden pardon harden",
    "winter splinter printer hinter",
    "summer drummer hummer plumber number slumber",
    "happy snappy sappy nappy scrappy",
    "funny sunny bunny money honey runny gunny",
    "easy breezy cheesy sneezy wheezy queasy greasy",
    "banana bandana savannah piranha",
    "cheese please freeze breeze trees knees seas keys",
    "mind kind find behind",
    "heal feel deal meal real wheel steel peel seal kneel reveal appeal",
    "mess guess less press dress yes bless chess stress success express process access",
    "fire wire tire hire higher liar choir desire entire inspire retire acquire",
    "hour power flower tower shower sour devour",
    "ice nice rice twice mice dice price slice spice advice device paradise",
    "war door more shore floor four",
    "ground sound found round around pound bound mound hound wound(v)",
    "luck duck truck stuck buck pluck struck cluck",
    "stop shop top hop drop crop pop mop chop flop prop",
    "pound sound found",
    "game name same flame fame frame blame shame came claim tame",
    "bell tell sell fell well",
    "bug hug mug",
    "side wide ride hide pride slide guide tide bride decide provide inside outside beside",
    "bright sight",
    "mail tail sail pale whale scale fail nail trail jail rail snail detail female"
  ];
  var NO_RHYME = { orange: "Nothing rhymes perfectly with orange. (\"Sporange\" is a rare botanical term that comes close.)", purple: "Nothing common rhymes with purple; \"hirple\" and \"curple\" are rare near-rhymes.", silver: "Nothing rhymes perfectly with silver; \"chilver\" is a rare word that does.", month: "Nothing rhymes with month; \"unth\" is the usual near-miss in rhyme puzzles.", ninth: "Nothing rhymes with ninth.", angel: "Angel has no perfect rhyme; \"change'll\" is the usual workaround.", circle: "Nothing common rhymes perfectly with circle; \"mercle\" and \"Turkel\" are near-misses.", wolf: "Wolf has almost no rhymes; \"Rudolf\" and \"gulf\" come closest.", pint: "Pint rhymes with \"pint\" only in spelling-twins like \"quint\"; no common word rhymes perfectly.", opus: "Opus has no common rhyme." };
  var FAMW = {}, FAMS = [];
  FAM.forEach(function (line) {
    var ws = line.split(" ").map(function (x) { return x.replace(/\(.*\)$/, ""); }), fam = { words: ws };
    FAMS.push(fam); ws.forEach(function (w) { (FAMW[w] = FAMW[w] || []).push(fam); });
  });
  function rimeOf(w) {
    var m = w.match(/([aeiouy]+[^aeiouy]*)e$/) && w.match(/([aeiouy]+[^aeiouy]+e)$/) ? w.match(/([aeiouy]+[^aeiouy]+e)$/) : w.match(/([aeiouy]+[^aeiouy]*)$/);
    return m ? m[1] : "";
  }
  function rhymesFor(w) {
    var got = [], seen = {}, add = function (x) { if (x !== w && !seen[x]) { seen[x] = 1; got.push(x); } };
    (FAMW[w] || []).forEach(function (f) { f.words.forEach(add); });
    if (got.length < 4) {                                   /* spelling endings over the curated words, then the word list */
      var r = rimeOf(w);
      if (r.length >= 2) {
        FAMS.forEach(function (f) { f.words.forEach(function (x) { if (x.length > r.length && x.slice(-r.length) === r && rimeOf(x) === r) add(x); }); });
        var LXR = root.C4LMLexicon && root.C4LMLexicon.raw;
        if (LXR && got.length < 5) Object.keys(LXR).forEach(function (x) { if (/^[a-z]+$/.test(x) && x.length <= 7 && x.length > r.length && x.slice(-r.length) === r && rimeOf(x) === r && (LXR[x] || []).some(function (s) { return /^(?:n|v|adj)$/.test(s.pos); })) add(x); });
      }
    }
    return got;
  }

  /* ------------------------------------------------------------ pronunciation */
  var PRON = {};
  ("quinoa|KEEN-wah;worcestershire|WUUS-ter-sheer;colonel|KUR-nul;february|FEB-roo-air-ee (many say FEB-yoo-air-ee);choir|KWIRE;epitome|ih-PIT-uh-mee;gnocchi|NYOH-kee;espresso|ess-PRESS-oh (not ex-press-o);" +
   "lieutenant|loo-TEN-ant in American English, lef-TEN-ant in British English;segue|SEG-way;hyperbole|hy-PUR-buh-lee;cache|CASH;mischievous|MIS-chuh-vus (three syllables);sixth|SIKSTH;" +
   "library|LY-brer-ee;nuclear|NOO-klee-er;pronunciation|pruh-NUN-see-AY-shun;yacht|YOT;tortoise|TOR-tus;edinburgh|ED-in-bruh;leicester|LES-ter;illinois|IL-ih-NOY;arkansas|AR-kun-saw;" +
   "beijing|bay-JING;tchaikovsky|chy-KOF-skee;nietzsche|NEE-chuh;goethe|GUR-tuh;cairo|KY-roh;mauritius|maw-RISH-us;lima|LEE-muh;peru|puh-ROO;qatar|KUH-tar or CUT-ter;" +
   "caribbean|kar-ih-BEE-un or kuh-RIB-ee-un;acai|ah-sah-EE;croissant|krwah-SAHN (or kruh-SAHNT in English);bouquet|boh-KAY;buffet|buh-FAY;ballet|bal-AY;fillet|FIL-ay or FIL-it;" +
   "quiche|KEESH;sushi|SOO-shee;pho|FUH;gyro|YEE-roh or JY-roh;paella|py-AY-yuh;chipotle|chih-POHT-lay;jalapeno|hah-luh-PAY-nyoh;bruschetta|broo-SKET-uh;prosciutto|proh-SHOO-toh;" +
   "scone|SKOHN or SKON (both are used);aunt|ANT or AWNT;often|OFF-en or OFF-ten;either|EE-ther or EYE-ther;tomato|tuh-MAY-toh or tuh-MAH-toh;caramel|KAIR-uh-mel or KAR-mel;pecan|pih-KAHN or PEE-kan;" +
   "schedule|SKED-yool in American English, SHED-yool in British English;vase|VAYS or VAHZ;herb|ERB in American English, HERB in British English;garage|guh-RAHZH or GAIR-ij;" +
   "ambulance|AM-byuh-lunss;anemone|uh-NEM-uh-nee;asterisk|AS-ter-isk;athlete|ATH-leet (two syllables);boatswain|BOH-sun;bury|BERR-ee;cemetery|SEM-uh-terr-ee;chaos|KAY-oss;" +
   "chimera|ky-MEER-uh;chocolate|CHOK-lit or CHOK-uh-lit;comfortable|KUMF-ter-bul or KUMF-tuh-bul;daughter|DAW-ter;debris|duh-BREE;deluge|DEL-yooj;draught|DRAFT;" +
   "drawer|DROR (the thing in a desk);epiphany|ih-PIF-uh-nee;espionage|ESS-pee-uh-nahzh;facade|fuh-SAHD;genre|ZHAHN-ruh;ghoul|GOOL;grocery|GROH-suh-ree;" +
   "height|HYTE;hierarchy|HY-er-ar-kee;hors d'oeuvre|or-DURV;hundred|HUN-drid;iron|EYE-urn;isle|EYEL;island|EYE-lund;jewelry|JOO-ul-ree;khaki|KAK-ee;" +
   "knight|NYTE;knife|NYFE;knowledge|NOL-ij;lasagna|luh-ZAHN-yuh;legend|LEJ-und;leopard|LEP-erd;liaison|lee-AY-zahn;lingerie|lahn-zhuh-RAY;" +
   "mayonnaise|MAY-uh-nayz;meme|MEEM;miniature|MIN-uh-cher or MIN-ih-a-cher;mortgage|MOR-gij;mpg|em-pee-JEE;niche|NITCH or NEESH;oasis|oh-AY-sis;" +
   "ophthalmologist|off-thal-MOL-uh-jist;origin|OR-ih-jin;ordinary|OR-dn-air-ee;paradigm|PAIR-uh-dyme;pharaoh|FAIR-oh;phlegm|FLEM;plumber|PLUM-er;" +
   "psychology|sy-KOL-uh-jee;pterodactyl|terr-uh-DAK-til;rendezvous|RON-day-voo;rhythm|RITH-um;salmon|SAM-un;sandwich|SAND-wich or SAN-wich;" +
   "sergeant|SAR-junt;sheikh|SHAYK or SHEEK;sixth|SIKSTH;subtle|SUT-l;suite|SWEET;synonym|SIN-uh-nim;thoroughly|THUR-oh-lee;" +
   "toward|TOR'd or tuh-WORD;vegetable|VEJ-tuh-bul or VEJ-uh-tuh-bul;victuals|VIT-ulz;wednesday|WENZ-day;whale|WAYL;wound|WOOND (an injury);" +
   "xerox|ZEER-oks;zeitgeist|ZYTE-gyste;gif|GIF (hard g) or JIF; both are widely used;linux|LIN-uks;nginx|engine-EKS;sql|ESS-kyoo-ELL or SEE-kwul;" +
   "bologna|buh-LOH-nee (the sausage);buenos aires|BWAY-nohss AIR-eez;barcelona|bar-suh-LOH-nuh;versailles|vair-SIGH;reykjavik|RAY-kya-veek;" +
   "eyjafjallajokull|AY-yah-fyat-luh-yer-kootl;kiribati|KEER-ih-bahss;uruguay|YOOR-uh-gway;sioux|SOO;seattle|see-AT-ul;tucson|TOO-sahn;" +
   "van gogh|van GOH in American English, van KHOKH in Dutch;michelangelo|my-kul-AN-juh-loh;renaissance|REN-uh-sahnss;da vinci|duh VIN-chee;monet|moh-NAY;" +
   "debut|day-BYOO;detour|DEE-toor;exit|EG-zit or EK-sit;forte|FORT (strength) or for-TAY (music);foyer|FOY-ur or FOY-ay;gauge|GAYJ;heir|AIR;honest|ON-ist;" +
   "hour|OWR;island|EYE-lund;receipt|rih-SEET;recipe|RESS-ih-pee;rural|ROOR-ul;sword|SORD;tsunami|tsoo-NAH-mee;utensil|yoo-TEN-sul;walk|WAWK;" +
   "acquire|uh-KWIRE;almond|AH-mund or AL-mund;apostrophe|uh-POSS-truh-fee;arctic|ARK-tik;bass|BAYSS (music) or BASS (fish);bicycle|BY-sih-kul;" +
   "buoy|BOO-ee or BOY;caribou|KAIR-ih-boo;cashmere|KAZH-meer;cavalry|KAV-ul-ree;chasm|KAZ-um;chrysanthemum|krih-SAN-thuh-mum;coup|KOO;" +
   "crescendo|kruh-SHEN-doh;cuisine|kwih-ZEEN;cynic|SIN-ik;diaphragm|DY-uh-fram;dilemma|dih-LEM-uh;eclectic|ih-KLEK-tik;" +
   "enunciate|ih-NUN-see-ayt;espresso|ess-PRESS-oh;exacerbate|ig-ZASS-er-bayt;facetious|fuh-SEE-shus;fajita|fuh-HEE-tuh;fiasco|fee-ASS-koh;" +
   "flaccid|FLAK-sid;forehead|FOR-id or FOR-hed;gouda|GOW-duh or GOO-duh;harass|huh-RASS or HAIR-uss;hyena|hy-EE-nuh;idyllic|eye-DIL-ik;" +
   "indict|in-DYTE;infamous|IN-fuh-mus;insouciant|in-SOO-see-unt;irrelevant|ih-REL-uh-vunt;karaoke|kair-ee-OH-kee;kindergarten|KIN-der-gar-tn;" +
   "lackadaisical|lak-uh-DAY-zih-kul;mnemonic|nih-MON-ik;moustache|MUSS-tash or muh-STASH;nauseous|NAW-shus;niche|NITCH;obey|oh-BAY;" +
   "onomatopoeia|on-uh-mat-uh-PEE-uh;opaque|oh-PAYK;ostensibly|oss-TEN-sih-blee;pajamas|puh-JAH-muz;pasta|PAH-stuh;pestle|PESS-ul;" +
   "potpourri|poh-poo-REE;quay|KEE;queue|KYOO;quixotic|kwik-SOT-ik;raspberry|RAZ-berr-ee;realtor|REE-ul-ter;rendezvous|RON-day-voo;" +
   "reservoir|REZ-er-vwar;sacrilegious|sak-rih-LIJ-us;sarsaparilla|sass-puh-RIL-uh;satyr|SAY-ter;schism|SKIZ-um or SIZ-um;sherbet|SHUR-bit;" +
   "silhouette|sil-oo-ET;sovereign|SOV-rin;spaghetti|spuh-GET-ee;squirrel|SKWUR-ul;statistics|stuh-TISS-tiks;suede|SWAYD;" +
   "synecdoche|sih-NEK-duh-kee;tarot|TAIR-oh;thyme|TIME;tour de force|toor duh FORSS;vacuum|VAK-yoom;valet|val-AY or VAL-it;" +
   "vehicle|VEE-uh-kul;victual|VIT-l;wheelbarrow|WEEL-bair-oh;wiki|WIK-ee;xylophone|ZY-luh-fohn;yoga|YOH-guh;zucchini|zoo-KEE-nee").split(";").forEach(function (r) { var i = r.indexOf("|"); PRON[r.slice(0, i)] = r.slice(i + 1); });

  /* ------------------------------------------------------------ misspellings and example sentences */
  var MISS = {};
  ("alot|a lot;recieve|receive;definately|definitely;seperate|separate;occured|occurred;untill|until;wich|which;accomodate|accommodate;adress|address;beleive|believe;buisness|business;calender|calendar;" +
   "cemetary|cemetery;collegue|colleague;concious|conscious;embarass|embarrass;enviroment|environment;existance|existence;foriegn|foreign;goverment|government;gaurd|guard;happend|happened;" +
   "harrass|harass;immediatly|immediately;independant|independent;knowlege|knowledge;liason|liaison;libary|library;maintainance|maintenance;millenium|millennium;neccessary|necessary;" +
   "noticable|noticeable;occassion|occasion;persistant|persistent;posession|possession;prefered|preferred;publically|publicly;realy|really;reccomend|recommend;refered|referred;relevent|relevant;" +
   "resistence|resistance;rythm|rhythm;succesful|successful;suprise|surprise;tommorow|tomorrow;truely|truly;vaccum|vacuum;wierd|weird;writting|writing;tounge|tongue;thier|their;teh|the;" +
   "accross|across;agressive|aggressive;apparant|apparent;arguement|argument;begining|beginning;catagory|category;comming|coming;commitee|committee;dissapoint|disappoint;excercise|exercise;" +
   "fourty|forty;freind|friend;grammer|grammar;gratefull|grateful;hieght|height;humourous|humorous;ignorence|ignorance;intresting|interesting;jewlery|jewelry;lenght|length;lisence|license;" +
   "mispell|misspell;nieghbor|neighbor;oppurtunity|opportunity;paralell|parallel;pasttime|pastime;percieve|perceive;playwrite|playwright;pronounciation|pronunciation;questionaire|questionnaire;" +
   "reciept|receipt;restaraunt|restaurant;sargent|sergeant;speach|speech;stong|strong;strenght|strength;temperture|temperature;threshhold|threshold;twelth|twelfth;wich|which;wellcome|welcome;" +
   "yeild|yield;irregardless|regardless (though \"irregardless\" is listed in dictionaries, it is considered nonstandard)").split(";").forEach(function (r) { var p = r.split("|"); MISS[p[0]] = p[1]; });
  var EX = {
    serendipity: "Finding my favourite book in a random box at a yard sale was pure serendipity.",
    ephemeral: "The beauty of the cherry blossoms is ephemeral; they are gone within a week.",
    ubiquitous: "Smartphones have become ubiquitous, and almost everyone carries one.",
    eloquent: "She gave an eloquent speech that moved the whole room.",
    pragmatic: "He took a pragmatic approach and chose the plan that would actually work.",
    resilient: "Children are often more resilient than adults expect.",
    nostalgia: "The old song filled her with nostalgia for her school days.",
    mundane: "Washing the dishes is a mundane task, but it needs doing.",
    ambivalent: "I feel ambivalent about moving; I want the change but I will miss my friends.",
    meticulous: "The watchmaker was meticulous, checking every tiny gear twice.",
    candid: "Thank you for being candid with me about the problems.",
    cynical: "After years of broken promises, he became cynical about politics.",
    diligent: "A diligent student, she finished her homework every night.",
    empathy: "A good nurse shows empathy for the people she cares for.",
    euphoria: "The team felt euphoria when the final whistle blew.",
    frugal: "She is frugal, so she saved money by cooking at home.",
    gregarious: "He is gregarious and loves meeting new people at parties.",
    hypocrite: "He is a hypocrite: he tells others to recycle but never does it himself.",
    melancholy: "A feeling of melancholy settled over her on the grey autumn evening.",
    obsolete: "Floppy disks are obsolete; nobody uses them any more.",
    paradox: "It is a paradox that the more choices we have, the harder it can be to choose.",
    sarcasm: "Her sarcasm was obvious when she said, \"Great weather,\" in the pouring rain.",
    tenacious: "The tenacious climber refused to give up, even in the storm.",
    utopia: "The author imagined a utopia where nobody went hungry.",
    whimsical: "The garden was full of whimsical statues of frogs wearing hats.",
    zealous: "A zealous fan, he had never missed a single home game.",
    benevolent: "The benevolent king gave food to the poor.",
    abundant: "Fruit was abundant in the valley, so no one went hungry.",
    adapt: "Animals must adapt to survive in a changing climate.",
    ambiguous: "The ending of the film was ambiguous, and people argued about what it meant.",
    anonymous: "The donation came from an anonymous giver who asked not to be named.",
    arbitrary: "The rule seemed arbitrary because nobody could explain the reason for it.",
    authentic: "This restaurant serves authentic Italian pizza made the traditional way.",
    cautious: "Be cautious when crossing the road at night.",
    concise: "Please keep your answer concise, in two or three sentences.",
    curious: "The curious cat peered into every box in the room.",
    deliberate: "It was a deliberate choice, not an accident.",
    diverse: "The city has a diverse population, with people from all over the world.",
    efficient: "An efficient engine wastes very little fuel.",
    enthusiastic: "The enthusiastic crowd cheered for the whole match.",
    fragile: "Pack the glasses carefully because they are fragile.",
    generous: "A generous neighbour gave us a basket of vegetables.",
    humble: "Despite winning the prize, she stayed humble and thanked her team.",
    innovative: "The company is known for innovative designs that nobody had tried before.",
    jealous: "He felt jealous when his friend got the part he wanted.",
    keen: "She is keen on gardening and spends every weekend outside.",
    logical: "It is logical to bring an umbrella when the sky is full of dark clouds.",
    modest: "He is modest about his talent and rarely talks about his awards.",
    nervous: "She felt nervous before her first day at the new school.",
    optimistic: "I am optimistic that tomorrow's weather will be better.",
    patient: "Be patient; good bread takes time to rise.",
    reliable: "A reliable friend always keeps their promises.",
    reluctant: "He was reluctant to leave the party so early.",
    sincere: "She gave a sincere apology and meant every word.",
    stubborn: "The stubborn donkey refused to move off the path.",
    thorough: "The doctor gave me a thorough check-up.",
    vivid: "I have vivid memories of that summer by the sea.",
    wise: "A wise person listens before speaking.",
    ostentatious: "The ostentatious mansion had gold taps in every bathroom.",
    ineffable: "The beauty of the view was ineffable; no words could describe it.",
    quixotic: "His plan to walk around the world in a month was charming but quixotic.",
    ephemera: "The attic was full of ephemera: old tickets, postcards and flyers.",
    ravenous: "After the long hike we were ravenous.",
    tranquil: "The lake was tranquil in the early morning.",
    elated: "She was elated when she read the exam results.",
    inevitable: "Change is inevitable, so we may as well prepare for it.",
    verbose: "His emails are so verbose that I need a summary of each one.",
    lucid: "The teacher gave a lucid explanation that made the topic clear.",
    ominous: "Dark ominous clouds rolled in before the storm.",
    perplexed: "He looked perplexed when he saw the instructions.",
    gullible: "She was so gullible that she believed the prank straight away.",
    impeccable: "His manners were impeccable.",
    jubilant: "The jubilant fans poured onto the pitch."
  };

  /* ------------------------------------------------------------ dispatch */
  function art(w) { return /^[aeiou]/.test(w) && !/^(?:uni|use|eu|one)/.test(w) ? "an" : "a"; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function res(a, sch) { return { answer: a, schema: sch, confidence: 0.9 }; }
  function clean(w) { return String(w || "").toLowerCase().replace(/^['"“‘]+|['"”’]+$/g, "").replace(/[.?!]+$/, "").trim(); }

  function inWordList(w) {
    var C = root.C4LMCore;
    if (PL[w] || SG[w] || IRR[w] || PRON[w]) return true;
    try { return !!(C && C.knownWord && C.knownWord(w)); } catch (e) { return false; }
  }
  function known(w) {
    var L = root.C4LMLexicon;
    if (L && L.lookup) { try { var r = L.lookup(w); if (r && r.senses && r.senses.length) return r; } catch (e) {} }
    return null;
  }

  function solve(text) {
    var s = String(text || "").trim();
    if (!s || s.length > 140) return null;
    var l = s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").replace(/^(?:hey|hi|please|ok|okay|so|can you tell me|could you tell me|tell me|do you know)[, ]+/, "").replace(/[?!.]+$/, "").trim();
    var m, w, f;
    var Q = "(?:the )?(?:word )?['\"]?([a-z][a-z' -]{0,40}?)['\"]?";

    /* past tense, participles */
    if ((m = l.match(new RegExp("^(?:what(?:'s| is) |what are )?(?:the )?(simple past|past tense|past participle|present participle|ing form|-ing form|third person(?: singular)?|s form)(?: form)? of " + Q + "$"))) ||
        (m = l.match(new RegExp("^what(?:'s| is) (?:the )?" + Q + " in (?:the )?(past tense|past participle|present participle)$"))) ||
        (m = l.match(new RegExp("^what(?:'s| is) (?:the )?(past tense|past participle|ing form) (?:form )?of " + Q + "$"))) ||
        (m = l.match(new RegExp("^how do you (?:say|write) " + Q + " in (?:the )?(past tense|past participle|present participle)$")))) {
      var kind, base;
      if (/^(?:simple past|past tense|past participle|present participle|ing form|-ing form|third person|s form)/.test(m[1])) { kind = m[1]; base = clean(m[2]); } else { kind = m[2]; base = clean(m[1]); }
      if (!/^[a-z]+$/.test(base)) return null;
      var verb = IRR[base] || null, isReg = !verb;
      if (/past tense|simple past/.test(kind)) { f = verb ? verb.past : regPast(base); return res("The past tense of " + base + " is " + f + (isReg ? ", formed by adding -ed" + (cvc(base) || /ied$/.test(f) ? " with a spelling change" : "") + "." : ", an irregular verb. (" + base + " – " + verb.past + " – " + verb.pp + ")."), "word:past"); }
      if (/past participle/.test(kind)) { f = verb ? verb.pp : regPast(base); return res("The past participle of " + base + " is " + f + (isReg ? ", the same as the regular past tense." : ", an irregular verb. (" + base + " – " + verb.past + " – " + verb.pp + ")."), "word:pp"); }
      if (/present participle|ing form/.test(kind)) return res("The -ing form (present participle) of " + base + " is " + ingOf(base) + ".", "word:ing");
      return res("The third-person singular form of " + base + " is " + (base === "be" ? "is" : base === "have" ? "has" : base === "do" ? "does" : base === "go" ? "goes" : regS(base)) + ".", "word:s");
    }
    /* "the past tense of X" asked as "X past tense" */
    if ((m = l.match(/^(?:what(?:'s| is) )?(?:the )?past tense (?:of )?['"]?([a-z]+)['"]?$/))) { base = m[1]; verb = IRR[base]; f = verb ? verb.past : regPast(base); return res("The past tense of " + base + " is " + f + ".", "word:past"); }
    /* verb forms of irregular verbs in full */
    if ((m = l.match(new RegExp("^(?:what are |give me |list )?(?:the )?(?:principal parts|forms|conjugations?|tenses) of " + Q + "$")))) {
      base = clean(m[1]); verb = IRR[base];
      if (verb) return res(base + " – " + verb.past + " – " + verb.pp + " (base, past tense, past participle), and the -ing form is " + ingOf(base) + ".", "word:forms");
      if (/^[a-z]+$/.test(base) && known(base)) return res(base + " is a regular verb: " + base + " – " + regPast(base) + " – " + regPast(base) + ", and the -ing form is " + ingOf(base) + ".", "word:forms");
    }
    if ((m = l.match(new RegExp("^is " + Q + " (?:a |an )?(regular|irregular) verb$")))) {
      base = clean(m[1]); var irr = !!IRR[base]; var want = m[2] === "irregular";
      return res(cap(base) + " is " + (irr ? "an irregular verb: " + base + " – " + IRR[base].past + " – " + IRR[base].pp + "." : "a regular verb: its past tense is " + regPast(base) + "."), "word:regular");
    }

    /* plurals and singulars */
    if ((m = l.match(new RegExp("^(?:what(?:'s| is) |what are )?(?:the )?plural (?:form )?of " + Q + "$"))) || (m = l.match(new RegExp("^how do you (?:say|write|make) " + Q + " (?:in the )?plural$"))) || (m = l.match(new RegExp("^what(?:'s| is) the plural of (?:the word )?" + Q + "$"))) || (m = l.match(new RegExp("^(?:make|pluralise|pluralize) " + Q + "(?: plural)?$")))) {
      w = clean(m[1]);
      if (!/^[a-z][a-z -]*$/.test(w)) return null;
      if (PL[w]) { var forms = PL[w]; return res("The plural of " + w + " is " + forms + (forms === w ? " (it doesn't change)" : (/ or /.test(forms) || forms === regPlural(w) ? "" : ", an irregular plural")) + ".", "word:plural"); }
      var pw = regPlural(w);
      return res("The plural of " + w + " is " + pw + ".", "word:plural");
    }
    if ((m = l.match(new RegExp("^(?:what(?:'s| is) |what are )?(?:the )?singular (?:form )?of " + Q + "$")))) {
      w = clean(m[1]);
      return res("The singular of " + w + " is " + (SG[w] || regSingular(w)) + ".", "word:singular");
    }

    /* comparatives and superlatives */
    if ((m = l.match(new RegExp("^(?:what(?:'s| is) )?(?:the )?(comparative|superlative)(?: form)? of " + Q + "$")))) {
      w = clean(m[2]); var cf = cmpForms(w);
      return res("The " + m[1] + " of " + w + " is " + (m[1] === "comparative" ? cf[0] : cf[1]) + ".", "word:comparative");
    }
    if ((m = l.match(new RegExp("^what(?:'s| is) (?:the )?(?:more|most) " + Q + "$"))) && false) return null;

    /* rhymes */
    if ((m = l.match(new RegExp("^(?:what|which|give me|name|tell me|list|find|think of)(?: are| is)?(?: some| a few| any| me)? (?:words? )?(?:that )?rhymes? with " + Q + "$"))) || (m = l.match(new RegExp("^(?:what|which)(?: words?)? rhymes? with " + Q + "$"))) ||
        (m = l.match(new RegExp("^(?:give me |name |tell me |find me |list )?(?:a |an |some |one |another )?(?:word|words|rhymes?)(?: that)? (?:rhymes?|rhyming)? ?(?:with|for) " + Q + "$"))) || (m = l.match(new RegExp("^(?:rhymes? (?:for|with)|words? rhyming with) " + Q + "$"))) || (m = l.match(new RegExp("^what (?:is|are) (?:a |some )?(?:rhymes?|words that rhyme) (?:for|with) " + Q + "$")))) {
      w = clean(m[1]);
      if (!/^[a-z]+$/.test(w)) return null;
      if (NO_RHYME[w]) return res(NO_RHYME[w], "word:rhyme");
      var rs = rhymesFor(w);
      if (!rs.length) return res("I couldn't find a good rhyme for " + w + ". Rhymes depend on sound, and I match mostly by spelling, so a rhyming dictionary will do better.", "word:rhyme");
      return res("Words that rhyme with " + w + ": " + rs.slice(0, 8).join(", ") + ".", "word:rhyme");
    }

    /* pronunciation */
    if ((m = l.match(new RegExp("^(?:how (?:do|would|should|can) (?:you|i|we|one) pronounce|how to pronounce|what(?:'s| is) the (?:correct )?pronunciation of|pronounce|how do you pronounce) " + Q + "$"))) ||
        (m = l.match(new RegExp("^how (?:is|are) " + Q + " (?:pronounced|said)$")))) {
      w = clean(m[1]).replace(/\s+/g, " ");
      if (PRON[w]) return res(cap(w) + " is pronounced " + PRON[w] + ".", "word:pronounce");
      if (/^[a-z' -]+$/.test(w) && !/ in /.test(w)) return res("I don't have a reliable pronunciation for " + w + ", and English spelling can mislead, so I'd rather not guess. A dictionary with audio will have it. I can tell you how many syllables it has if you ask.", "word:pronounce-unknown");
    }
    if ((m = l.match(new RegExp("^(?:how (?:do you|to) say|how do i say) " + Q + "$"))) && PRON[clean(m[1])]) return res(cap(clean(m[1])) + " is pronounced " + PRON[clean(m[1])] + ".", "word:pronounce");

    /* is it a word, is it spelled right */
    if ((m = l.match(new RegExp("^(?:is|was) " + Q + " (?:even )?(?:a|an) (?:real |actual |proper |valid )?word$"))) || (m = l.match(new RegExp("^(?:is|are) " + Q + " (?:spelled|spelt|written) (?:right|correctly)$"))) || (m = l.match(new RegExp("^is " + Q + " (?:the )?(?:right|correct) spelling$"))) || (m = l.match(new RegExp("^is " + Q + " (?:even )?(?:a )?(?:real|valid|actual|proper) word$")))) {
      w = clean(m[1]);
      if (!/^[a-z'-]+$/.test(w)) return null;
      if (MISS[w]) return res("No, \"" + w + "\" is a common misspelling. The correct form is \"" + MISS[w] + "\".", "word:isword");
      var kn = known(w);
      if (kn) return res("Yes, \"" + w + "\" is a word." + (kn.senses[0] && kn.senses[0].pos ? " It can be " + ({ n: "a noun", v: "a verb", adj: "an adjective", adv: "an adverb" }[kn.senses[0].pos] || "used in a sentence") + "." : ""), "word:isword");
      if (inWordList(w)) return res("Yes, \"" + w + "\" is a word.", "word:isword");
      return res("I don't recognise \"" + w + "\" as an English word, but my word list is limited, so a dictionary is the safer check.", "word:isword");
    }
    if ((m = l.match(/^(?:is it|which is (?:correct|right)[,:]?|which (?:spelling )?is (?:correct|right)[,:]?|what(?:'s| is) the (?:correct|right) spelling[,:]?)\s*['"]?([a-z'-]+)['"]?,? or ['"]?([a-z'-]+)['"]?$/))) {
      var a = m[1], b = m[2];
      if (MISS[a] && MISS[a].split(" ")[0] === b) return res("\"" + b + "\" is correct; \"" + a + "\" is a common misspelling.", "word:which");
      if (MISS[b] && MISS[b].split(" ")[0] === a) return res("\"" + a + "\" is correct; \"" + b + "\" is a common misspelling.", "word:which");
      var ka = !!known(a) || inWordList(a), kb = !!known(b) || inWordList(b);
      if (ka && !kb) return res("\"" + a + "\" is the word I recognise; I don't recognise \"" + b + "\".", "word:which");
      if (kb && !ka) return res("\"" + b + "\" is the word I recognise; I don't recognise \"" + a + "\".", "word:which");
    }
    if ((m = l.match(new RegExp("^(?:how do you spell|how to spell|spell) " + Q + " (?:correctly|right)$")))) {
      w = clean(m[1]); if (MISS[w]) return res("It is spelled " + MISS[w].split(" (")[0] + ".", "word:spell-fix");
    }

    /* part of speech */
    if ((m = l.match(new RegExp("^(?:what|which) (?:part of speech|word class|kind of word|type of word) is " + Q + "$"))) || (m = l.match(new RegExp("^is " + Q + " (?:a |an )?(noun|verb|adjective|adverb)(?: or (?:a |an )?(?:noun|verb|adjective|adverb))?$")))) {
      w = clean(m[1]);
      if (!/^[a-z-]+$/.test(w)) return null;
      var kk = known(w), names = { n: "noun", v: "verb", adj: "adjective", adv: "adverb", prep: "preposition", conj: "conjunction", pron: "pronoun", interj: "interjection", det: "determiner" };
      if (/^(?:the|a|an)$/.test(w)) return res(cap(w) + " is " + (w === "the" ? "the definite article" : "an indefinite article") + ", a kind of determiner.", "word:pos");
      var seen = [];
      if (kk) kk.senses.forEach(function (sn) { var nm = names[sn.pos]; if (nm && seen.indexOf(nm) < 0) seen.push(nm); });
      if (!seen.length && /ly$/.test(w) && w.length > 4) seen.push("adverb");
      if (!seen.length) return null;
      var listed = seen.map(function (x) { return art(x) + " " + x; });
      return res(cap(w) + (seen.length === 1 ? " is " + listed[0] + "." : " can be " + listed.slice(0, -1).join(", ") + " or " + listed[listed.length - 1] + ", depending on how it's used."), "word:pos");
    }

    /* example sentences */
    if ((m = l.match(new RegExp("^(?:use|put|make|write|give me|can you use) (?:the word |the term )?" + Q + " (?:in|into) (?:a|one|an|another) (?:sample )?sentence$"))) || (m = l.match(new RegExp("^(?:give me )?(?:a |an )?(?:example )?sentence (?:using|with|containing) (?:the word )?" + Q + "$"))) || (m = l.match(new RegExp("^(?:can you )?(?:show|give) me (?:how to use|an example of) " + Q + " in a sentence$")))) {
      w = clean(m[1]);
      if (EX[w]) return res(EX[w], "word:sentence");
      return res("I don't have a good example sentence for \"" + w + "\" yet. If you tell me what it means, I can help you build one.", "word:sentence-unknown");
    }
    return null;
  }

  root.C4LMWordlab = { solve: solve, regPast: regPast, regIng: regIng, regPlural: regPlural, cmpForms: cmpForms, rhymesFor: rhymesFor, irregularVerbs: IRR, pronunciations: PRON };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMWordlab;
})(typeof window !== "undefined" ? window : globalThis);
