/* CELL4 thesaurus: opposites and near-synonyms.
 *
 * Pairs and groups of common words, used for "what is the opposite of X?",
 * "another word for X", "give me a synonym for X". A word that is not here is
 * not answered (no guessing). Local only.
 */
(function (root) {
  "use strict";

  /* a / b pairs, both directions */
  var ANT = ("hot|cold;big|small;large|small;tall|short;long|short;wide|narrow;thick|thin;heavy|light;fast|slow;quick|slow;early|late;young|old;new|old;ancient|modern;happy|sad;glad|sorry;" +
    "love|hate;like|dislike;good|bad;best|worst;better|worse;right|wrong;true|false;yes|no;up|down;above|below;over|under;in|out;inside|outside;on|off;open|closed;begin|end;start|finish;" +
    "first|last;front|back;left|right;north|south;east|west;day|night;morning|evening;light|dark;bright|dim;loud|quiet;noisy|quiet;hard|soft;hard|easy;difficult|easy;rough|smooth;sharp|dull;" +
    "clean|dirty;wet|dry;full|empty;rich|poor;strong|weak;brave|cowardly;brave|timid;kind|cruel;generous|selfish;honest|dishonest;polite|rude;calm|angry;friend|enemy;win|lose;victory|defeat;" +
    "buy|sell;give|take;push|pull;come|go;arrive|leave;enter|exit;rise|fall;ascend|descend;increase|decrease;add|subtract;more|less;most|least;many|few;much|little;all|none;always|never;" +
    "often|rarely;before|after;past|future;present|absent;alive|dead;awake|asleep;remember|forget;ask|answer;question|answer;accept|reject;agree|disagree;allow|forbid;create|destroy;build|destroy;" +
    "found|lost;find|lose;safe|dangerous;simple|complex;simple|complicated;cheap|expensive;possible|impossible;visible|invisible;legal|illegal;polite|impolite;positive|negative;optimistic|pessimistic;" +
    "expand|contract;inflate|deflate;attack|defend;guilty|innocent;maximum|minimum;major|minor;public|private;sweet|sour;sweet|bitter;fat|thin;tight|loose;deep|shallow;high|low;near|far;close|distant;" +
    "stop|go;stop|start;shut|open;lock|unlock;tie|untie;dress|undress;appear|disappear;employ|fire;hire|fire;king|queen;man|woman;boy|girl;father|mother;brother|sister;uncle|aunt;son|daughter;" +
    "husband|wife;male|female;he|she;his|hers;summer|winter;spring|autumn;land|sea;sunrise|sunset;fresh|stale;gentle|rough;patient|impatient;proud|humble;famous|unknown;genuine|fake;real|fake;" +
    "include|exclude;import|export;inhale|exhale;introvert|extrovert;lend|borrow;minority|majority;natural|artificial;permanent|temporary;rural|urban;urban|rural;success|failure;strength|weakness;" +
    "tame|wild;terrible|wonderful;thick|thin;together|apart;toward|away;victory|loss;waste|save;war|peace;wise|foolish;youth|age;zero|infinity").split(";").map(function (p) { return p.split("|"); });

  /* groups of near-synonyms */
  var SYN = ("happy|joyful|cheerful|glad|delighted|content|pleased;sad|unhappy|sorrowful|gloomy|miserable|downcast;big|large|huge|enormous|giant|massive|vast;small|little|tiny|miniature|petite|compact;" +
    "fast|quick|rapid|swift|speedy|brisk;slow|sluggish|leisurely|unhurried;smart|clever|intelligent|bright|brilliant|wise;stupid|foolish|silly|dense;pretty|beautiful|lovely|attractive|gorgeous;" +
    "ugly|unattractive|hideous|unsightly;begin|start|commence|launch|initiate;end|finish|conclude|complete|terminate;look|see|gaze|glance|stare|observe|watch;walk|stroll|stride|march|wander;" +
    "run|sprint|dash|jog|race;talk|speak|chat|converse|say;say|state|declare|announce|remark;shout|yell|scream|cry|holler;angry|mad|furious|irate|cross|annoyed;scared|afraid|frightened|terrified|fearful;" +
    "brave|courageous|bold|fearless|valiant|heroic;tired|exhausted|weary|fatigued|drained;hungry|starving|famished|ravenous;rich|wealthy|affluent|prosperous|well-off;poor|needy|penniless|destitute;" +
    "hard|difficult|tough|challenging|demanding;easy|simple|effortless|straightforward;strange|odd|weird|unusual|peculiar|curious;old|ancient|aged|elderly|antique;new|fresh|novel|modern|recent;" +
    "kind|gentle|caring|considerate|generous|thoughtful;mean|cruel|unkind|nasty|spiteful;good|fine|excellent|great|superb|wonderful;bad|poor|awful|terrible|dreadful|lousy;important|vital|crucial|essential|significant;" +
    "tell|inform|notify|advise;ask|inquire|question|query;answer|reply|respond|retort;help|assist|aid|support;buy|purchase|acquire|obtain;get|obtain|receive|gain|acquire;give|donate|present|grant|offer;" +
    "show|display|exhibit|reveal|demonstrate;hide|conceal|cover|mask;fix|repair|mend|restore;break|smash|shatter|crack|fracture;make|create|build|construct|produce|form;think|ponder|consider|reflect|contemplate;" +
    "idea|notion|concept|thought;problem|issue|difficulty|trouble|challenge;trip|journey|voyage|excursion|tour;house|home|dwelling|residence;car|automobile|vehicle;job|work|occupation|profession|career;" +
    "friend|pal|buddy|companion|mate;enemy|foe|rival|opponent|adversary;boss|manager|supervisor|chief|head;error|mistake|blunder|fault|slip;shy|timid|bashful|reserved|diffident;lazy|idle|sluggish|indolent;" +
    "calm|peaceful|tranquil|serene|placid;noisy|loud|boisterous|rowdy;quiet|silent|hushed|soundless;clean|spotless|immaculate|pure;dirty|filthy|grimy|soiled|unclean;wet|damp|moist|soaked|soggy;" +
    "dry|arid|parched|dehydrated;cold|chilly|cool|freezing|frigid;hot|warm|scorching|boiling|heated;brave|plucky|gallant;keen|eager|enthusiastic|avid;enough|sufficient|adequate|ample;" +
    "rubbish|trash|garbage|waste|litter;kid|child|youngster|youth;mom|mother|mama|mum;dad|father|papa;crazy|insane|mad|mental;huge|gigantic|colossal|immense;stop|halt|cease|quit|pause;" +
    "leave|depart|exit|go;arrive|reach|come;choose|select|pick|elect;cut|slice|chop|trim;join|connect|link|unite|attach;pull|drag|tug|haul;throw|toss|hurl|fling;jump|leap|hop|spring|bound;" +
    "big|great|grand;little|wee|minor;end|finale|close;shine|gleam|glow|sparkle|glitter;smell|scent|odor|aroma;taste|flavor|savor;choice|option|alternative;chance|opportunity|possibility;" +
    "danger|peril|hazard|risk|threat;safe|secure|protected;freedom|liberty|independence;brief|short|concise;clear|obvious|plain|evident|apparent;extra|additional|more|spare;fake|false|phony|counterfeit;" +
    "real|genuine|authentic|actual;look|appearance|aspect;rule|regulation|law|principle;purpose|aim|goal|objective|target").split(";").map(function (g) { return g.split("|"); });

  function lower(w) { return String(w || "").toLowerCase().trim(); }
  function variants(w) {
    w = lower(w);
    var out = [w];
    if (/ies$/.test(w)) out.push(w.slice(0, -3) + "y");
    if (/(?:ches|shes|sses|xes)$/.test(w)) out.push(w.slice(0, -2));
    if (/s$/.test(w)) out.push(w.slice(0, -1));
    if (/ed$/.test(w)) { out.push(w.slice(0, -2)); out.push(w.slice(0, -1)); }
    if (/ing$/.test(w)) { out.push(w.slice(0, -3)); out.push(w.slice(0, -3) + "e"); }
    if (/ly$/.test(w)) out.push(w.slice(0, -2));
    return out;
  }
  function opposites(word) {
    var vs = variants(word), found = [];
    ANT.forEach(function (p) {
      vs.forEach(function (v) { if (p[0] === v && found.indexOf(p[1]) < 0) found.push(p[1]); else if (p[1] === v && found.indexOf(p[0]) < 0) found.push(p[0]); });
    });
    return found;
  }
  function synonyms(word) {
    var vs = variants(word), found = [];
    SYN.forEach(function (g) {
      vs.forEach(function (v) { if (g.indexOf(v) >= 0) g.forEach(function (w) { if (w !== v && found.indexOf(w) < 0) found.push(w); }); });
    });
    return found;
  }

  root.C4LMThesaurus = { opposites: opposites, synonyms: synonyms, size: function () { return ANT.length + SYN.length; } };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMThesaurus;
})(typeof window !== "undefined" ? window : globalThis);
