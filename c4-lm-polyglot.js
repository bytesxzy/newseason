/* A little Spanish, French, German, Italian and Portuguese. Greetings and small talk are answered in the language they came in;
 * simple questions (capitals, "what is", "who was", "where is", sums) are read into English, answered by the same engine, and the
 * answer for a capital is put back into the language. Anything else says, in the language, that the knowledge is mostly English.
 * No translation service: the tables below are the whole of it. reply(text) returns null for English. */
(function (root) {
  "use strict";

  /* words that mark a language and are not English words */
  var MARK = {
    es: "qué cuál cuáles quién quiénes cómo dónde cuándo cuántos cuántas cuánto por porque para con una unos unas del los las está están soy eres somos tengo tienes quiero puedes puedo hola gracias adiós buenos buenas días tardes noches ayuda favor también pero muy mucho nombre llamas capital".split(" "),
    fr: "font fait quel quelle quels quelles qui où quand comment pourquoi combien est-ce qu'est-ce c'est je tu nous vous suis êtes sont avec pour dans une des les du bonjour salut merci revoir bonsoir bonne nuit s'il plaît très aussi mais".split(" "),
    de: "was wer wo wann wie warum welche welcher welches ist sind ich du wir ihr sie nicht und der die das ein eine mit für von zu hallo danke bitte tschüss guten morgen abend nacht sehr auch aber heißt hauptstadt".split(" "),
    it: "che cosa chi dove quando perché quanto quanti quale quali è sono io tu noi voi con una uno gli del della ciao grazie prego arrivederci buongiorno buonasera buonanotte molto anche ma capitale".split(" "),
    pt: "tudo o que quem onde quando como porque quanto quantos qual quais é são eu você nós com para uma uns umas dos das olá obrigado obrigada tchau bom dia boa tarde noite muito também mas capital".split(" ")
  };
  /* markers that are also English words and must not count */
  var EN_OVERLAP = /^(?:a|an|as|in|me|no|on|so|to|the|and|are|is|was|die|war|bin|hat|rat|art|bar|ball|land|kind|hand|come|capital|use|do|will|can|gift|bad|hell|boot|rock|mist|rose|fast|ten|date|mine|via|will|man|alt|bei|rot|chat|pain|sale|pour|lap|mal|but|an|fin|coin|sein|net)$/;

  var STOPEN = /\b(?:the|what|is|are|who|where|when|how|why|which|of|and|to|in|do|does|you|your|can|tell|me|a|an|that|this|with|for)\b/gi;

  function words(t) { return String(t).toLowerCase().replace(/[¿¡?!.,;:()"“”]/g, " ").split(/\s+/).filter(Boolean); }
  function detect(text) {
    var t = String(text || ""), ws = words(t);
    if (!ws.length) return null;
    var best = null, bestN = 0, en = (t.match(STOPEN) || []).length;
    Object.keys(MARK).forEach(function (lg) {
      var n = 0;
      var seenW = {};
      ws.forEach(function (w) { if (MARK[lg].indexOf(w) >= 0 && !EN_OVERLAP.test(w) && !seenW[w]) { seenW[w] = 1; n++; } });
      if (/[¿¡]/.test(t) && lg === "es") n += 2;
      if (/[ñ]/.test(t) && lg === "es") n += 1;
      if (/[ãõ]/.test(t) && lg === "pt") n += 2;
      if (/[ß]/.test(t) && lg === "de") n += 2;
      if (/\b(?:qu'|c'est|d'|l'|j'|n')/i.test(t) && lg === "fr") n += 2;
      if (n > bestN) { bestN = n; best = lg; }
    });
    if (!best) return null;
    return bestN >= 2 && bestN >= en ? best : (bestN >= 1 && en === 0 && ws.length <= 8 ? best : null);
  }

  /* ------------------------------------------------------------ small talk */
  var SMALL = {
    es: [
      [/^(?:hola|buenas|hey|qué tal|que tal)$/, "¡Hola! ¿En qué puedo ayudarte?"],
      [/^buenos días$/, "¡Buenos días! ¿En qué puedo ayudarte?"], [/^buenas tardes$/, "¡Buenas tardes! ¿En qué puedo ayudarte?"], [/^buenas noches$/, "¡Buenas noches! Que descanses."],
      [/^(?:cómo estás|como estas|cómo está usted|qué tal estás|cómo te va)$/, "Estoy bien, gracias. Soy un programa, pero estoy listo para ayudar. ¿Qué necesitas?"],
      [/^(?:gracias|muchas gracias|mil gracias)$/, "¡De nada! ¿Algo más?"],
      [/^(?:adiós|adios|hasta luego|hasta pronto|chao|nos vemos)$/, "¡Adiós! Que tengas un buen día."],
      [/^(?:cómo te llamas|como te llamas|cuál es tu nombre)$/, "Soy CELL4, un sistema de lenguaje que funciona de forma local en esta página."],
      [/^(?:qué puedes hacer|qué sabes hacer)$/, "Puedo responder preguntas, hacer cuentas, resolver problemas y charlar. Mi conocimiento está sobre todo en inglés."],
      [/^(?:qué hora es|que hora es)$/, "@time"], [/^(?:cuéntame un chiste|dime un chiste)$/, "¿Qué le dice un cero a un ocho? Bonito cinturón."],
      [/^(?:te quiero|eres genial|eres muy inteligente)$/, "¡Gracias, qué amable!"], [/^(?:perdón|perdon|lo siento)$/, "No pasa nada."]
    ],
    fr: [
      [/^(?:bonjour|salut|coucou|bonsoir)$/, "Bonjour ! Comment puis-je vous aider ?"],
      [/^(?:comment ça va|comment ca va|ça va|ca va|comment allez-vous|comment vas-tu)$/, "Je vais bien, merci. Je suis un programme, mais je suis prêt à aider. Que voulez-vous savoir ?"],
      [/^(?:merci|merci beaucoup)$/, "Je vous en prie ! Autre chose ?"],
      [/^(?:au revoir|à bientôt|a bientot|à plus|salut à plus)$/, "Au revoir ! Bonne journée."], [/^bonne nuit$/, "Bonne nuit ! Dormez bien."],
      [/^(?:comment tu t'appelles|comment vous appelez-vous|quel est ton nom)$/, "Je m'appelle CELL4, un système de langage qui fonctionne en local dans cette page."],
      [/^(?:quelle heure est-il|quelle heure est il)$/, "@time"], [/^(?:raconte-moi une blague|dis-moi une blague)$/, "Que dit zéro à huit ? Belle ceinture !"],
      [/^(?:excuse-moi|pardon|désolé)$/, "Aucun problème."]
    ],
    de: [
      [/^(?:hallo|hi|servus|moin|grüß dich|grüß gott)$/, "Hallo! Wie kann ich helfen?"], [/^guten morgen$/, "Guten Morgen! Wie kann ich helfen?"], [/^guten tag$/, "Guten Tag! Wie kann ich helfen?"],
      [/^guten abend$/, "Guten Abend! Wie kann ich helfen?"], [/^gute nacht$/, "Gute Nacht! Schlaf gut."],
      [/^(?:wie geht's|wie geht es dir|wie geht es ihnen|wie geht's dir)$/, "Mir geht es gut, danke. Ich bin ein Programm, aber bereit zu helfen. Was möchten Sie wissen?"],
      [/^(?:danke|danke schön|vielen dank|dankeschön)$/, "Gern geschehen! Noch etwas?"], [/^(?:tschüss|tschüs|auf wiedersehen|bis bald|bis später)$/, "Tschüss! Einen schönen Tag noch."],
      [/^(?:wie heißt du|wie heißen sie|wie ist dein name)$/, "Ich bin CELL4, ein Sprachsystem, das lokal auf dieser Seite läuft."],
      [/^(?:wie spät ist es|wie viel uhr ist es)$/, "@time"], [/^(?:erzähl mir einen witz|sag mir einen witz)$/, "Was sagt die Null zur Acht? Schöner Gürtel!"], [/^(?:entschuldigung|tut mir leid)$/, "Kein Problem."]
    ],
    it: [
      [/^(?:ciao|salve|buongiorno|buonasera)$/, "Ciao! Come posso aiutarti?"], [/^buonanotte$/, "Buonanotte! Dormi bene."],
      [/^(?:come stai|come va|come sta)$/, "Sto bene, grazie. Sono un programma, ma sono pronto ad aiutare. Cosa vuoi sapere?"],
      [/^(?:grazie|grazie mille|molte grazie)$/, "Prego! Altro?"], [/^(?:arrivederci|a presto|ci vediamo|addio)$/, "Arrivederci! Buona giornata."],
      [/^(?:come ti chiami|qual è il tuo nome)$/, "Sono CELL4, un sistema linguistico che funziona in locale in questa pagina."], [/^(?:che ore sono|che ora è)$/, "@time"],
      [/^(?:raccontami una barzelletta)$/, "Che cosa dice lo zero all'otto? Bella cintura!"], [/^(?:scusa|scusi|mi dispiace)$/, "Nessun problema."]
    ],
    pt: [
      [/^(?:olá|ola|oi|e aí)$/, "Olá! Como posso ajudar?"], [/^bom dia$/, "Bom dia! Como posso ajudar?"], [/^boa tarde$/, "Boa tarde! Como posso ajudar?"], [/^boa noite$/, "Boa noite! Durma bem."],
      [/^(?:tudo bem|como vai|como você está|como voce esta|como está)$/, "Estou bem, obrigado. Sou um programa, mas estou pronto para ajudar. O que você quer saber?"],
      [/^(?:obrigado|obrigada|muito obrigado|muito obrigada)$/, "De nada! Mais alguma coisa?"], [/^(?:tchau|adeus|até logo|até mais|até breve)$/, "Tchau! Tenha um bom dia."],
      [/^(?:como você se chama|qual é o seu nome|qual o seu nome)$/, "Sou o CELL4, um sistema de linguagem que roda localmente nesta página."], [/^(?:que horas são|que horas sao)$/, "@time"],
      [/^(?:conte-me uma piada|me conte uma piada)$/, "O que o zero disse para o oito? Belo cinto!"], [/^(?:desculpa|desculpe|me desculpe)$/, "Sem problema."]
    ]
  };
  function smallKey(lg, text) {
    var l = String(text).toLowerCase().replace(/[¿¡?!.,]+/g, "").replace(/\s+/g, " ").trim();
    return SMALL[lg].some(function (r) { return r[0].test(l); });
  }

  /* ------------------------------------------------------------ countries and capitals */
  /* English | es | fr | de | it | pt */
  var COUNTRY = ("France|Francia|France|Frankreich|Francia|França;Germany|Alemania|Allemagne|Deutschland|Germania|Alemanha;Spain|España|Espagne|Spanien|Spagna|Espanha;Italy|Italia|Italie|Italien|Italia|Itália;" +
    "United Kingdom|Reino Unido|Royaume-Uni|Vereinigtes Königreich|Regno Unito|Reino Unido;United States|Estados Unidos|États-Unis|Vereinigte Staaten|Stati Uniti|Estados Unidos;Portugal|Portugal|Portugal|Portugal|Portogallo|Portugal;" +
    "Mexico|México|Mexique|Mexiko|Messico|México;Brazil|Brasil|Brésil|Brasilien|Brasile|Brasil;Argentina|Argentina|Argentine|Argentinien|Argentina|Argentina;China|China|Chine|China|Cina|China;Japan|Japón|Japon|Japan|Giappone|Japão;" +
    "Russia|Rusia|Russie|Russland|Russia|Rússia;India|India|Inde|Indien|India|Índia;Canada|Canadá|Canada|Kanada|Canada|Canadá;Australia|Australia|Australie|Australien|Australia|Austrália;Egypt|Egipto|Égypte|Ägypten|Egitto|Egito;" +
    "Greece|Grecia|Grèce|Griechenland|Grecia|Grécia;Turkey|Turquía|Turquie|Türkei|Turchia|Turquia;Netherlands|Países Bajos|Pays-Bas|Niederlande|Paesi Bassi|Países Baixos;Belgium|Bélgica|Belgique|Belgien|Belgio|Bélgica;" +
    "Switzerland|Suiza|Suisse|Schweiz|Svizzera|Suíça;Austria|Austria|Autriche|Österreich|Austria|Áustria;Sweden|Suecia|Suède|Schweden|Svezia|Suécia;Norway|Noruega|Norvège|Norwegen|Norvegia|Noruega;Denmark|Dinamarca|Danemark|Dänemark|Danimarca|Dinamarca;" +
    "Poland|Polonia|Pologne|Polen|Polonia|Polônia;Ireland|Irlanda|Irlande|Irland|Irlanda|Irlanda;South Africa|Sudáfrica|Afrique du Sud|Südafrika|Sudafrica|África do Sul;Chile|Chile|Chili|Chile|Cile|Chile;Colombia|Colombia|Colombie|Kolumbien|Colombia|Colômbia;" +
    "Peru|Perú|Pérou|Peru|Perù|Peru;Cuba|Cuba|Cuba|Kuba|Cuba|Cuba;Morocco|Marruecos|Maroc|Marokko|Marocco|Marrocos;Kenya|Kenia|Kenya|Kenia|Kenya|Quênia;Nigeria|Nigeria|Nigéria|Nigeria|Nigeria|Nigéria;Ukraine|Ucrania|Ukraine|Ukraine|Ucraina|Ucrânia;" +
    "South Korea|Corea del Sur|Corée du Sud|Südkorea|Corea del Sud|Coreia do Sul;Thailand|Tailandia|Thaïlande|Thailand|Tailandia|Tailândia;Vietnam|Vietnam|Viêt Nam|Vietnam|Vietnam|Vietnã;Indonesia|Indonesia|Indonésie|Indonesien|Indonesia|Indonésia;" +
    "Israel|Israel|Israël|Israel|Israele|Israel;Saudi Arabia|Arabia Saudita|Arabie saoudite|Saudi-Arabien|Arabia Saudita|Arábia Saudita;Finland|Finlandia|Finlande|Finnland|Finlandia|Finlândia;Hungary|Hungría|Hongrie|Ungarn|Ungheria|Hungria;" +
    "Czech Republic|República Checa|République tchèque|Tschechien|Repubblica Ceca|República Tcheca;Romania|Rumania|Roumanie|Rumänien|Romania|Romênia;Iran|Irán|Iran|Iran|Iran|Irã;Iraq|Irak|Irak|Irak|Iraq|Iraque;Venezuela|Venezuela|Venezuela|Venezuela|Venezuela|Venezuela;" +
    "New Zealand|Nueva Zelanda|Nouvelle-Zélande|Neuseeland|Nuova Zelanda|Nova Zelândia;Philippines|Filipinas|Philippines|Philippinen|Filippine|Filipinas;Pakistan|Pakistán|Pakistan|Pakistan|Pakistan|Paquistão").split(";").map(function (r) { var p = r.split("|"); return { en: p[0], es: p[1], fr: p[2], de: p[3], it: p[4], pt: p[5] }; });
  /* capital in English | es | fr | de | it | pt */
  var CAPITAL = ("Paris|París|Paris|Paris|Parigi|Paris;Berlin|Berlín|Berlin|Berlin|Berlino|Berlim;Madrid|Madrid|Madrid|Madrid|Madrid|Madri;Rome|Roma|Rome|Rom|Roma|Roma;London|Londres|Londres|London|Londra|Londres;Washington, D.C.|Washington D. C.|Washington|Washington, D.C.|Washington|Washington, D.C.;" +
    "Lisbon|Lisboa|Lisbonne|Lissabon|Lisbona|Lisboa;Mexico City|Ciudad de México|Mexico|Mexiko-Stadt|Città del Messico|Cidade do México;Brasilia|Brasilia|Brasilia|Brasília|Brasilia|Brasília;Buenos Aires|Buenos Aires|Buenos Aires|Buenos Aires|Buenos Aires|Buenos Aires;" +
    "Beijing|Pekín|Pékin|Peking|Pechino|Pequim;Tokyo|Tokio|Tokyo|Tokio|Tokyo|Tóquio;Moscow|Moscú|Moscou|Moskau|Mosca|Moscou;New Delhi|Nueva Delhi|New Delhi|Neu-Delhi|Nuova Delhi|Nova Délhi;Ottawa|Ottawa|Ottawa|Ottawa|Ottawa|Ottawa;Canberra|Canberra|Canberra|Canberra|Canberra|Camberra;" +
    "Cairo|El Cairo|Le Caire|Kairo|Il Cairo|Cairo;Athens|Atenas|Athènes|Athen|Atene|Atenas;Ankara|Ankara|Ankara|Ankara|Ankara|Ancara;Amsterdam|Ámsterdam|Amsterdam|Amsterdam|Amsterdam|Amsterdã;Brussels|Bruselas|Bruxelles|Brüssel|Bruxelles|Bruxelas;" +
    "Bern|Berna|Berne|Bern|Berna|Berna;Vienna|Viena|Vienne|Wien|Vienna|Viena;Stockholm|Estocolmo|Stockholm|Stockholm|Stoccolma|Estocolmo;Oslo|Oslo|Oslo|Oslo|Oslo|Oslo;Copenhagen|Copenhague|Copenhague|Kopenhagen|Copenaghen|Copenhague;" +
    "Warsaw|Varsovia|Varsovie|Warschau|Varsavia|Varsóvia;Dublin|Dublín|Dublin|Dublin|Dublino|Dublin;Pretoria|Pretoria|Pretoria|Pretoria|Pretoria|Pretória;Santiago|Santiago|Santiago|Santiago|Santiago|Santiago;Bogota|Bogotá|Bogota|Bogotá|Bogotà|Bogotá;" +
    "Lima|Lima|Lima|Lima|Lima|Lima;Havana|La Habana|La Havane|Havanna|L'Avana|Havana;Rabat|Rabat|Rabat|Rabat|Rabat|Rabat;Nairobi|Nairobi|Nairobi|Nairobi|Nairobi|Nairóbi;Abuja|Abuya|Abuja|Abuja|Abuja|Abuja;Kyiv|Kiev|Kiev|Kiew|Kiev|Kiev;" +
    "Seoul|Seúl|Séoul|Seoul|Seul|Seul;Bangkok|Bangkok|Bangkok|Bangkok|Bangkok|Bangkok;Hanoi|Hanói|Hanoï|Hanoi|Hanoi|Hanói;Jakarta|Yakarta|Jakarta|Jakarta|Giacarta|Jacarta;Jerusalem|Jerusalén|Jérusalem|Jerusalem|Gerusalemme|Jerusalém;" +
    "Riyadh|Riad|Riyad|Riad|Riyad|Riade;Helsinki|Helsinki|Helsinki|Helsinki|Helsinki|Helsinque;Budapest|Budapest|Budapest|Budapest|Budapest|Budapeste;Prague|Praga|Prague|Prag|Praga|Praga;Bucharest|Bucarest|Bucarest|Bukarest|Bucarest|Bucareste;" +
    "Tehran|Teherán|Téhéran|Teheran|Teheran|Teerã;Baghdad|Bagdad|Bagdad|Bagdad|Baghdad|Bagdá;Caracas|Caracas|Caracas|Caracas|Caracas|Caracas;Wellington|Wellington|Wellington|Wellington|Wellington|Wellington;Manila|Manila|Manille|Manila|Manila|Manila;Islamabad|Islamabad|Islamabad|Islamabad|Islamabad|Islamabad").split(";").map(function (r) { var p = r.split("|"); return { en: p[0], es: p[1], fr: p[2], de: p[3], it: p[4], pt: p[5] }; });

  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9' -]/g, "").trim(); }
  function countryToEnglish(lg, name) {
    var n = norm(name).replace(/^(?:el|la|los|las|le|les|der|die|das|il|lo|gli|o|a|os|as)\s+/, "").replace(/^l'/, "");
    for (var i = 0; i < COUNTRY.length; i++) if (norm(COUNTRY[i][lg]) === n || norm(COUNTRY[i].en) === n) return COUNTRY[i].en;
    if (lg === "es" && /^(?:eeuu|ee uu|ee\.uu\.)$/.test(n)) return "United States";
    if (/^(?:usa|u s a|us)$/.test(n)) return "United States";
    if (lg === "es" && n === "holanda") return "Netherlands";
    return name.replace(/^(?:el|la|los|las|le|les|der|die|das|il|lo|gli|o|a|os|as)\s+/i, "").replace(/^l'/i, "").replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function countryName(lg, en) { for (var i = 0; i < COUNTRY.length; i++) if (COUNTRY[i].en === en) return COUNTRY[i][lg]; return en; }
  function cityName(lg, en) { for (var i = 0; i < CAPITAL.length; i++) if (CAPITAL[i].en === en) return CAPITAL[i][lg]; return en; }

  /* ------------------------------------------------------------ question frames, read into English */
  var OP = {
    es: { "más": "plus", "mas": "plus", "menos": "minus", "por": "times", "multiplicado por": "times", "entre": "divided by", "dividido por": "divided by", "dividido entre": "divided by" },
    fr: { "plus": "plus", "moins": "minus", "fois": "times", "multiplié par": "times", "divisé par": "divided by" },
    de: { "plus": "plus", "minus": "minus", "mal": "times", "geteilt durch": "divided by", "durch": "divided by" },
    it: { "più": "plus", "piu": "plus", "meno": "minus", "per": "times", "diviso": "divided by", "diviso per": "divided by" },
    pt: { "mais": "plus", "menos": "minus", "vezes": "times", "multiplicado por": "times", "dividido por": "divided by", "dividido": "divided by" }
  };
  var CAPQ = {
    es: [/^(?:cuál|cual) es la capital de (.+)$/, /^(?:cuál|cual) es la capital del? (.+)$/, /^(?:dónde|donde) está la capital de (.+)$/],
    fr: [/^(?:quelle|quel) est la capitale (?:de la |de l'|du |des |de )?(.+)$/, /^la capitale (?:de la |de l'|du |des |de )?(.+)$/],
    de: [/^was ist die hauptstadt (?:von|der|des) (.+)$/, /^wie heißt die hauptstadt (?:von|der|des) (.+)$/, /^welche stadt ist die hauptstadt (?:von|der|des) (.+)$/],
    it: [/^(?:qual è|qual e) la capitale (?:dell'|della |del |degli |dei |di )?(.+)$/, /^qual'è la capitale (?:dell'|della |del |di )?(.+)$/],
    pt: [/^(?:qual é|qual e) a capital (?:da |do |de |dos |das )?(.+)$/, /^qual a capital (?:da |do |de )?(.+)$/]
  };
  var WHATQ = {
    es: [[/^(?:qué|que) (?:es|son) (?:un |una |el |la |los |las )?(.+)$/, "what"], [/^(?:quién|quien) (?:fue|es|era|son) (.+)$/, "who"], [/^(?:dónde|donde) (?:está|queda|están) (?:el |la |los |las )?(.+)$/, "where"], [/^(?:cuándo|cuando) (?:nació|murió|fue) (.+)$/, "when"], [/^(?:quién|quien) (?:escribió|pintó|inventó|descubrió|compuso) (.+)$/, "author"]],
    fr: [[/^(?:qu'est-ce que|qu'est ce que|qu'est-ce qu'|c'est quoi) (?:un |une |le |la |les |l')?(.+)$/, "what"], [/^qui (?:est|était|etait|sont) (.+)$/, "who"], [/^où (?:est|se trouve|sont) (?:le |la |les |l')?(.+)$/, "where"], [/^qui a (?:écrit|peint|inventé|découvert|composé) (.+)$/, "author"]],
    de: [[/^was (?:ist|sind) (?:ein |eine |der |die |das )?(.+)$/, "what"], [/^wer (?:war|ist|waren|sind) (.+)$/, "who"], [/^wo (?:ist|liegt|sind) (?:der |die |das )?(.+)$/, "where"], [/^wer hat (.+) (?:geschrieben|gemalt|erfunden|entdeckt|komponiert)$/, "author"]],
    it: [[/^(?:che cos'è|che cosa è|cos'è|che cosa sono|cosa sono|che cos'e|cos'e) (?:un |una |il |la |lo |l')?(.+)$/, "what"], [/^chi (?:è|era|e|sono|erano) (.+)$/, "who"], [/^dov'è (?:il |la |lo |l')?(.+)$/, "where"], [/^dove (?:si trova|è|sono) (?:il |la |lo |l')?(.+)$/, "where"], [/^chi ha (?:scritto|dipinto|inventato|scoperto|composto) (.+)$/, "author"]],
    pt: [[/^(?:o que é|o que e|o que são) (?:um |uma |o |a |os |as )?(.+)$/, "what"], [/^quem (?:foi|é|era|são) (.+)$/, "who"], [/^onde (?:fica|está|ficam|estão) (?:o |a |os |as )?(.+)$/, "where"], [/^quem (?:escreveu|pintou|inventou|descobriu|compôs) (.+)$/, "author"]]
  };
  var VERBS = { escribió: "wrote", pintó: "painted", inventó: "invented", descubrió: "discovered", compuso: "composed", "écrit": "wrote", peint: "painted", "inventé": "invented", "découvert": "discovered", geschrieben: "wrote", gemalt: "painted", erfunden: "invented", entdeckt: "discovered", scritto: "wrote", dipinto: "painted", inventato: "invented", scoperto: "discovered", escreveu: "wrote", pintou: "painted", inventou: "invented", descobriu: "discovered" };

  function titleName(s) {
    return String(s).replace(/\S+/g, function (w, i) {
      return /^(?:da|de|di|del|della|von|van|der|den|la|le|du|des|dos|das|y|e|of|el)$/i.test(w) && i > 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  function toEnglish(lg, text) {
    var l = String(text).toLowerCase().replace(/[¿¡?!.]+/g, " ").replace(/\s+/g, " ").trim().replace(/^(?:por favor|s'il vous plaît|s'il te plaît|bitte|per favore|por favor),?\s*/, ""), m, i;
    /* sums read the same in every language */
    var sum = l.match(/^(?:cuánto|cuanto|cuánto es|cuanto es|combien font|combien fait|combien est|wie viel ist|wieviel ist|wie viel ergibt|quanto fa|quanto è|quanto e|quanto é|quanto e|quanto são|quanto sao|cuánto da|cuanto da)\s+(-?\d+(?:[.,]\d+)?)\s+(.+?)\s+(-?\d+(?:[.,]\d+)?)$/);
    if (sum) {
      var ops = OP[lg], opw = sum[2].trim();
      if (ops[opw]) return { question: "What is " + sum[1].replace(",", ".") + " " + ops[opw] + " " + sum[3].replace(",", ".") + "?", kind: "sum" };
    }
    for (i = 0; i < CAPQ[lg].length; i++) if ((m = l.match(CAPQ[lg][i]))) { var c = countryToEnglish(lg, m[1].replace(/\s+/g, " ").trim()); return { question: "What is the capital of " + c + "?", kind: "capital", country: c }; }
    for (i = 0; i < WHATQ[lg].length; i++) if ((m = l.match(WHATQ[lg][i][0]))) {
      var kindWord = WHATQ[lg][i][1], subj = m[m.length - 1].trim(), en = titleName(countryToEnglish(lg, subj));
      if (kindWord === "author") {
        var vm = l.match(/(escribió|pintó|inventó|descubrió|compuso|écrit|peint|inventé|découvert|geschrieben|gemalt|erfunden|entdeckt|scritto|dipinto|inventato|scoperto|escreveu|pintou|inventou|descobriu)/), vb = vm ? VERBS[vm[1]] : "wrote";
        return { question: "Who " + vb + " " + en + "?", kind: "who" };
      }
      if (kindWord === "when") return { question: "When was " + en + " born?", kind: "when" };
      if (kindWord === "who") return { question: "Who was " + en + "?", kind: "who" };
      if (kindWord === "where") return { question: "Where is " + en + "?", kind: "where" };
      return { question: "What is " + en + "?", kind: "what", raw: en };
    }
    return null;
  }

  var SORRY = {
    es: "Entiendo que escribes en español, pero mi conocimiento está sobre todo en inglés. Puedo responder a saludos, a preguntas sencillas como «¿Cuál es la capital de Francia?» y a cuentas. ¿Puedes preguntármelo en inglés?",
    fr: "Je comprends que vous écrivez en français, mais mes connaissances sont surtout en anglais. Je peux répondre aux salutations, à des questions simples comme « Quelle est la capitale de l'Allemagne ? » et aux calculs. Pouvez-vous poser la question en anglais ?",
    de: "Ich verstehe, dass Sie auf Deutsch schreiben, aber mein Wissen ist überwiegend englisch. Ich kann Begrüßungen, einfache Fragen wie „Was ist die Hauptstadt von Spanien?“ und Rechenaufgaben beantworten. Können Sie die Frage auf Englisch stellen?",
    it: "Capisco che scrivi in italiano, ma le mie conoscenze sono soprattutto in inglese. Posso rispondere ai saluti, a domande semplici come «Qual è la capitale della Francia?» e ai calcoli. Puoi chiedermelo in inglese?",
    pt: "Entendo que você escreve em português, mas meu conhecimento é principalmente em inglês. Posso responder a cumprimentos, a perguntas simples como «Qual é a capital da França?» e a contas. Pode perguntar em inglês?"
  };
  var NOTE = { es: "(Respondo en inglés.)", fr: "(Je réponds en anglais.)", de: "(Ich antworte auf Englisch.)", it: "(Rispondo in inglese.)", pt: "(Respondo em inglês.)" };
  /* "of France" in each language: the article follows the country's gender and number */
  var FEM = {
    fr: "France Allemagne Espagne Italie Chine Inde Russie Argentine Australie Grèce Turquie Belgique Suisse Autriche Suède Norvège Pologne Irlande Colombie Ukraine Thaïlande Indonésie Hongrie Finlande Roumanie Egypte Égypte Corée du Sud Afrique du Sud Nouvelle-Zélande Arabie saoudite République tchèque Cuba Venezuela",
    it: "Francia Germania Spagna Italia Cina India Russia Argentina Australia Grecia Turchia Svizzera Austria Svezia Norvegia Polonia Irlanda Colombia Ucraina Thailandia Indonesia Ungheria Finlandia Romania Corea del Sud Sudafrica Nuova Zelanda Arabia Saudita Repubblica Ceca Cuba Venezuela",
    pt: "França Alemanha Espanha Itália China Índia Rússia Argentina Austrália Grécia Turquia Bélgica Suíça Áustria Suécia Noruega Polônia Irlanda Colômbia Ucrânia Tailândia Indonésia Hungria Finlândia Romênia Coreia do Sul África do Sul Nova Zelândia Arábia Saudita República Tcheca Cuba Venezuela Dinamarca Nigéria"
  };
  var PLURAL = { fr: "États-Unis Pays-Bas Philippines", it: "Stati Uniti Paesi Bassi Filippine", pt: "Estados Unidos Países Baixos Filipinas", es: "Países Bajos" };
  function inList(list, name) { return (" " + list + " ").indexOf(" " + name + " ") >= 0; }
  function ofCountry(lg, name) {
    var vowel = /^[AEIOUÀÂÉÈÊÎÔÛÁÍÓÚÄÖÜ]/i.test(name);
    if (lg === "de") return "von " + name;
    if (lg === "es") return name === "Reino Unido" ? "del Reino Unido" : (inList(PLURAL.es, name) ? "de los " + name : (name === "India" ? "de la India" : "de " + name));
    if (lg === "fr") return inList(PLURAL.fr, name) ? "des " + name : (vowel ? "d'" + name : (inList(FEM.fr, name) ? "de la " + name : "du " + name));
    if (lg === "it") return inList(PLURAL.it, name) ? (name === "Stati Uniti" ? "degli " : "dei ") + name : (vowel ? "dell'" + name : (inList(FEM.it, name) ? "della " + name : "del " + name));
    if (lg === "pt") return name === "Portugal" || name === "Israel" ? "de " + name : (/Estados Unidos|Países Baixos/.test(name) ? "dos " + name : (/Filipinas/.test(name) ? "das " + name : (inList(FEM.pt, name) ? "da " + name : "do " + name)));
    return "of " + name;
  }
  var CAPSENT = {
    es: function (c, k) { return "La capital " + c + " es " + k + "."; }, fr: function (c, k) { return "La capitale " + c + " est " + k + "."; },
    de: function (c, k) { return "Die Hauptstadt " + c + " ist " + k + "."; }, it: function (c, k) { return "La capitale " + c + " è " + k + "."; },
    pt: function (c, k) { return "A capital " + c + " é " + k + "."; }
  };
  var TIMESENT = { es: "Son las ", fr: "Il est ", de: "Es ist ", it: "Sono le ", pt: "São " };
  function timeLine(lg, now) {
    var d = now || new Date(), hh = String(d.getHours()).length < 2 ? "0" + d.getHours() : d.getHours(), mm = String(d.getMinutes()).length < 2 ? "0" + d.getMinutes() : d.getMinutes();
    return TIMESENT[lg] + hh + ":" + mm + (lg === "de" ? " Uhr." : ".");
  }

  /* what the page needs: a plan for this message */
  function reply(text, now) {
    var t = String(text || "").trim();
    if (!t || t.length > 200) return null;
    var lg = detect(t); if (!lg) return null;
    var l = t.toLowerCase().replace(/[¿¡?!.,]+/g, "").replace(/\s+/g, " ").trim(), i;
    var l2 = l.replace(/^(?:hola|buenas|hey|bonjour|salut|hallo|hi|ciao|olá|ola|oi)\s+/, "");
    for (i = 0; i < SMALL[lg].length; i++) if (SMALL[lg][i][0].test(l) || SMALL[lg][i][0].test(l2)) return { lang: lg, kind: "small", text: SMALL[lg][i][1] === "@time" ? timeLine(lg, now) : SMALL[lg][i][1] };
    var e = toEnglish(lg, t);
    if (e) { e.lang = lg; return e; }
    return { lang: lg, kind: "sorry", text: SORRY[lg] };
  }
  /* put an English answer to a capital question back into the language */
  function localiseCapital(lg, country, englishAnswer) {
    var city = null, m;
    if ((m = englishAnswer.match(/^(.+?) is the capital of /))) city = m[1];
    else if ((m = englishAnswer.match(/capital is (.+?)(?:\.(?=\s+[A-Z])|\.?$)/))) city = m[1];
    else if ((m = englishAnswer.match(/has (.+?) as its capital/))) city = m[1];
    else if ((m = englishAnswer.match(/capital of .+? is (.+?)(?:\.(?=\s+[A-Z])|\.?$|, which|, and)/))) city = m[1];
    if (!city) return null;
    return CAPSENT[lg](ofCountry(lg, countryName(lg, country)), (cityName(lg, city) !== city ? cityName(lg, city) : cityName(lg, city.replace(/\.$/, ""))));
  }

  root.C4LMPolyglot = { detect: detect, reply: reply, toEnglish: toEnglish, localiseCapital: localiseCapital, NOTE: NOTE };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMPolyglot;
})(typeof window !== "undefined" ? window : globalThis);
