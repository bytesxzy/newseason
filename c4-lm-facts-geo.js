/* Geography facts for the local fact library (c4-lm-facts.js).
 * Tables are expanded into sentences at load time; the sentences are the
 * knowledge, the tables are only a compact way to write them down. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];

  /* name | capital | continent */
  var COUNTRIES = (
    "Afghanistan|Kabul|Asia;Albania|Tirana|Europe;Algeria|Algiers|Africa;Andorra|Andorra la Vella|Europe;Angola|Luanda|Africa;" +
    "Antigua and Barbuda|Saint John's|North America;Argentina|Buenos Aires|South America;Armenia|Yerevan|Asia;Australia|Canberra|Oceania;" +
    "Austria|Vienna|Europe;Azerbaijan|Baku|Asia;Bahamas|Nassau|North America;Bahrain|Manama|Asia;Bangladesh|Dhaka|Asia;Barbados|Bridgetown|North America;" +
    "Belarus|Minsk|Europe;Belgium|Brussels|Europe;Belize|Belmopan|North America;Benin|Porto-Novo|Africa;Bhutan|Thimphu|Asia;Bolivia|Sucre|South America;" +
    "Bosnia and Herzegovina|Sarajevo|Europe;Botswana|Gaborone|Africa;Brazil|Brasilia|South America;Brunei|Bandar Seri Begawan|Asia;Bulgaria|Sofia|Europe;" +
    "Burkina Faso|Ouagadougou|Africa;Burundi|Gitega|Africa;Cambodia|Phnom Penh|Asia;Cameroon|Yaounde|Africa;Canada|Ottawa|North America;" +
    "Cape Verde|Praia|Africa;Central African Republic|Bangui|Africa;Chad|N'Djamena|Africa;Chile|Santiago|South America;China|Beijing|Asia;" +
    "Colombia|Bogota|South America;Comoros|Moroni|Africa;Costa Rica|San Jose|North America;Croatia|Zagreb|Europe;Cuba|Havana|North America;" +
    "Cyprus|Nicosia|Europe;Czech Republic|Prague|Europe;Democratic Republic of the Congo|Kinshasa|Africa;Denmark|Copenhagen|Europe;Djibouti|Djibouti|Africa;" +
    "Dominica|Roseau|North America;Dominican Republic|Santo Domingo|North America;Ecuador|Quito|South America;Egypt|Cairo|Africa;" +
    "El Salvador|San Salvador|North America;Equatorial Guinea|Malabo|Africa;Eritrea|Asmara|Africa;Estonia|Tallinn|Europe;Eswatini|Mbabane|Africa;" +
    "Ethiopia|Addis Ababa|Africa;Fiji|Suva|Oceania;Finland|Helsinki|Europe;France|Paris|Europe;Gabon|Libreville|Africa;Gambia|Banjul|Africa;" +
    "Georgia|Tbilisi|Asia;Germany|Berlin|Europe;Ghana|Accra|Africa;Greece|Athens|Europe;Grenada|Saint George's|North America;Guatemala|Guatemala City|North America;" +
    "Guinea|Conakry|Africa;Guinea-Bissau|Bissau|Africa;Guyana|Georgetown|South America;Haiti|Port-au-Prince|North America;Honduras|Tegucigalpa|North America;" +
    "Hungary|Budapest|Europe;Iceland|Reykjavik|Europe;India|New Delhi|Asia;Indonesia|Jakarta|Asia;Iran|Tehran|Asia;Iraq|Baghdad|Asia;" +
    "Ireland|Dublin|Europe;Israel|Jerusalem|Asia;Italy|Rome|Europe;Ivory Coast|Yamoussoukro|Africa;Jamaica|Kingston|North America;Japan|Tokyo|Asia;" +
    "Jordan|Amman|Asia;Kazakhstan|Astana|Asia;Kenya|Nairobi|Africa;Kiribati|Tarawa|Oceania;Kosovo|Pristina|Europe;Kuwait|Kuwait City|Asia;" +
    "Kyrgyzstan|Bishkek|Asia;Laos|Vientiane|Asia;Latvia|Riga|Europe;Lebanon|Beirut|Asia;Lesotho|Maseru|Africa;Liberia|Monrovia|Africa;" +
    "Libya|Tripoli|Africa;Liechtenstein|Vaduz|Europe;Lithuania|Vilnius|Europe;Luxembourg|Luxembourg|Europe;Madagascar|Antananarivo|Africa;" +
    "Malawi|Lilongwe|Africa;Malaysia|Kuala Lumpur|Asia;Maldives|Male|Asia;Mali|Bamako|Africa;Malta|Valletta|Europe;Marshall Islands|Majuro|Oceania;" +
    "Mauritania|Nouakchott|Africa;Mauritius|Port Louis|Africa;Mexico|Mexico City|North America;Micronesia|Palikir|Oceania;Moldova|Chisinau|Europe;" +
    "Monaco|Monaco|Europe;Mongolia|Ulaanbaatar|Asia;Montenegro|Podgorica|Europe;Morocco|Rabat|Africa;Mozambique|Maputo|Africa;Myanmar|Naypyidaw|Asia;" +
    "Namibia|Windhoek|Africa;Nauru|Yaren|Oceania;Nepal|Kathmandu|Asia;Netherlands|Amsterdam|Europe;New Zealand|Wellington|Oceania;Nicaragua|Managua|North America;" +
    "Niger|Niamey|Africa;Nigeria|Abuja|Africa;North Korea|Pyongyang|Asia;North Macedonia|Skopje|Europe;Norway|Oslo|Europe;Oman|Muscat|Asia;" +
    "Pakistan|Islamabad|Asia;Palau|Ngerulmud|Oceania;Panama|Panama City|North America;Papua New Guinea|Port Moresby|Oceania;Paraguay|Asuncion|South America;" +
    "Peru|Lima|South America;Philippines|Manila|Asia;Poland|Warsaw|Europe;Portugal|Lisbon|Europe;Qatar|Doha|Asia;Republic of the Congo|Brazzaville|Africa;" +
    "Romania|Bucharest|Europe;Russia|Moscow|Europe and Asia;Rwanda|Kigali|Africa;Saint Kitts and Nevis|Basseterre|North America;Saint Lucia|Castries|North America;" +
    "Samoa|Apia|Oceania;San Marino|San Marino|Europe;Sao Tome and Principe|Sao Tome|Africa;Saudi Arabia|Riyadh|Asia;Senegal|Dakar|Africa;" +
    "Serbia|Belgrade|Europe;Seychelles|Victoria|Africa;Sierra Leone|Freetown|Africa;Singapore|Singapore|Asia;Slovakia|Bratislava|Europe;" +
    "Slovenia|Ljubljana|Europe;Solomon Islands|Honiara|Oceania;Somalia|Mogadishu|Africa;South Africa|Pretoria|Africa;South Korea|Seoul|Asia;" +
    "South Sudan|Juba|Africa;Spain|Madrid|Europe;Sri Lanka|Colombo|Asia;Sudan|Khartoum|Africa;Suriname|Paramaribo|South America;Sweden|Stockholm|Europe;" +
    "Switzerland|Bern|Europe;Syria|Damascus|Asia;Taiwan|Taipei|Asia;Tajikistan|Dushanbe|Asia;Tanzania|Dodoma|Africa;Thailand|Bangkok|Asia;" +
    "Timor-Leste|Dili|Asia;Togo|Lome|Africa;Tonga|Nuku'alofa|Oceania;Trinidad and Tobago|Port of Spain|North America;Tunisia|Tunis|Africa;" +
    "Turkey|Ankara|Asia;Turkmenistan|Ashgabat|Asia;Tuvalu|Funafuti|Oceania;Uganda|Kampala|Africa;Ukraine|Kyiv|Europe;United Arab Emirates|Abu Dhabi|Asia;" +
    "United Kingdom|London|Europe;United States|Washington, D.C.|North America;Uruguay|Montevideo|South America;Uzbekistan|Tashkent|Asia;" +
    "Vanuatu|Port Vila|Oceania;Vatican City|Vatican City|Europe;Venezuela|Caracas|South America;Vietnam|Hanoi|Asia;Yemen|Sanaa|Asia;" +
    "Zambia|Lusaka|Africa;Zimbabwe|Harare|Africa"
  ).split(";");
  F.registry = F.registry || {};
  F.registry.country = COUNTRIES.map(function (r) { return r.split("|")[0]; }).filter(Boolean);
  COUNTRIES.forEach(function (row) {
    var p = row.split("|"), n = p[0], c = p[1], k = p[2], d = c.replace(/\.$/, "");
    var tn = /^(?:United States|United Kingdom|United Arab Emirates|Netherlands|Philippines|Bahamas|Gambia|Czech Republic|Central African Republic|Maldives|Seychelles|Comoros|Marshall Islands|Solomon Islands|Democratic Republic of the Congo|Republic of the Congo)$/.test(n) ? "the " + n : n;
    out.push("The capital of " + tn + " is " + c.replace(/\.$/, "") + ".");
    out.push(tn.replace(/^the /, "The ") + " is a country in " + k + ".");
    out.push("The country of " + tn + " is located on the continent of " + k + ".");
    out.push("What is the capital city of " + tn + "? It is " + d + ".");
  });

  /* state | capital */
  ("Alabama|Montgomery;Alaska|Juneau;Arizona|Phoenix;Arkansas|Little Rock;California|Sacramento;Colorado|Denver;Connecticut|Hartford;Delaware|Dover;" +
   "Florida|Tallahassee;Georgia|Atlanta;Hawaii|Honolulu;Idaho|Boise;Illinois|Springfield;Indiana|Indianapolis;Iowa|Des Moines;Kansas|Topeka;" +
   "Kentucky|Frankfort;Louisiana|Baton Rouge;Maine|Augusta;Maryland|Annapolis;Massachusetts|Boston;Michigan|Lansing;Minnesota|Saint Paul;" +
   "Mississippi|Jackson;Missouri|Jefferson City;Montana|Helena;Nebraska|Lincoln;Nevada|Carson City;New Hampshire|Concord;New Jersey|Trenton;" +
   "New Mexico|Santa Fe;New York|Albany;North Carolina|Raleigh;North Dakota|Bismarck;Ohio|Columbus;Oklahoma|Oklahoma City;Oregon|Salem;" +
   "Pennsylvania|Harrisburg;Rhode Island|Providence;South Carolina|Columbia;South Dakota|Pierre;Tennessee|Nashville;Texas|Austin;Utah|Salt Lake City;" +
   "Vermont|Montpelier;Virginia|Richmond;Washington|Olympia;West Virginia|Charleston;Wisconsin|Madison;Wyoming|Cheyenne").split(";").forEach(function (row) {
    var p = row.split("|");
    out.push("The capital of the state of " + p[0] + " is " + p[1] + ".");
  });
  ("Ontario|Toronto;Quebec|Quebec City;British Columbia|Victoria;Alberta|Edmonton;Manitoba|Winnipeg;Saskatchewan|Regina;Nova Scotia|Halifax;" +
   "New Brunswick|Fredericton;Newfoundland and Labrador|St. John's;Prince Edward Island|Charlottetown").split(";").forEach(function (row) {
    var p = row.split("|");
    out.push("The capital of the Canadian province of " + p[0] + " is " + p[1] + ".");
  });
  ("New South Wales|Sydney;Victoria|Melbourne;Queensland|Brisbane;Western Australia|Perth;South Australia|Adelaide;Tasmania|Hobart").split(";").forEach(function (row) {
    var p = row.split("|");
    out.push("The capital of the Australian state of " + p[0] + " is " + p[1] + ".");
  });
  out.push("Sydney is the largest city in Australia, but the capital of Australia is Canberra.");
  out.push("Istanbul is the largest city in Turkey, but the capital of Turkey is Ankara.");
  out.push("New York City is the largest city in the United States, but the capital of the United States is Washington, D.C.");
  out.push("Toronto is the largest city in Canada, but the capital of Canada is Ottawa.");
  out.push("Rio de Janeiro and Sao Paulo are larger than the capital of Brazil, which is Brasilia.");

  [
    /* superlatives and records */
    "Russia is the largest country in the world by area.",
    "The Vatican City is the smallest country in the world by area.",
    "Canada is the second largest country in the world by area.",
    "China and India are the two most populous countries in the world; India has overtaken China as the most populous.",
    "The Pacific Ocean is the largest and deepest ocean on Earth.",
    "The Atlantic Ocean is the second largest ocean on Earth.",
    "The Arctic Ocean is the smallest and shallowest of the world's five oceans.",
    "The five oceans of the world are the Pacific, Atlantic, Indian, Southern and Arctic.",
    "Mount Everest is the highest mountain above sea level, on the border of Nepal and China.",
    "Mauna Kea in Hawaii is the tallest mountain on Earth when measured from its base on the ocean floor.",
    "K2 is the second highest mountain in the world.",
    "The Nile and the Amazon are the two longest rivers in the world; the Nile is traditionally considered the longest.",
    "The Nile is the longest river in Africa and flows north into the Mediterranean Sea.",
    "The Amazon River carries more water than any other river and flows through South America.",
    "The Yangtze is the longest river in Asia and flows through China.",
    "The Mississippi River is the longest river in the United States' main river system and flows to the Gulf of Mexico.",
    "The Sahara is the largest hot desert in the world, covering much of North Africa.",
    "Antarctica is the largest desert in the world by area because it receives very little precipitation.",
    "The Gobi Desert lies in Mongolia and northern China.",
    "The Atacama Desert in Chile is one of the driest places on Earth.",
    "Lake Baikal in Russia is the deepest lake in the world.",
    "Lake Superior is the largest of the Great Lakes by area.",
    "The Caspian Sea is the largest inland body of water in the world.",
    "The Dead Sea, bordering Israel and Jordan, is the lowest land point on Earth and is very salty.",
    "The Mariana Trench in the western Pacific is the deepest known part of the world's oceans.",
    "Angel Falls in Venezuela is the tallest uninterrupted waterfall in the world.",
    "Victoria Falls lies on the border of Zambia and Zimbabwe.",
    "Niagara Falls lies on the border between Canada and the United States.",
    "Greenland is the largest island in the world that is not a continent.",
    "Australia is the smallest continent and the largest island, and it is also a country.",
    "Asia is the largest continent by both area and population.",
    "Antarctica is the coldest, driest and windiest continent and has no permanent population.",
    "Africa is the second largest continent and contains 54 countries.",
    "There are seven continents: Asia, Africa, North America, South America, Antarctica, Europe and Australia (Oceania).",
    "Europe is the continent that contains countries such as France, Germany, Italy and Spain.",
    "The Mediterranean Sea lies between Europe and Africa.",
    "The Red Sea separates Africa from the Arabian Peninsula.",
    "The English Channel separates England from France.",
    "The Strait of Gibraltar connects the Atlantic Ocean and the Mediterranean Sea between Spain and Morocco.",
    "The Suez Canal in Egypt connects the Mediterranean Sea to the Red Sea.",
    "The Panama Canal connects the Atlantic Ocean and the Pacific Ocean across Panama.",
    "The Himalayas are the highest mountain range in the world and lie between India and Tibet.",
    "The Andes are the longest mountain range in the world and run along the west coast of South America.",
    "The Alps are a major mountain range in Europe, running through France, Switzerland, Italy and Austria.",
    "The Rocky Mountains are a major mountain range in western North America.",
    "Mount Kilimanjaro, in Tanzania, is the highest mountain in Africa.",
    "Mont Blanc is the highest mountain in the Alps and in Western Europe.",
    "Denali in Alaska is the highest mountain in North America.",
    "Aconcagua in Argentina is the highest mountain in South America.",
    "Mount Fuji is the highest mountain in Japan.",
    "The Seine is the river that flows through Paris.",
    "The Thames is the river that flows through London.",
    "The Danube flows through Vienna, Budapest and Belgrade and is Europe's second longest river.",
    "The Rhine is a major river flowing through Switzerland, Germany and the Netherlands.",
    "The Tiber is the river that flows through Rome.",
    "The Ganges is a sacred river in India that flows through Varanasi.",
    "The Volga is the longest river in Europe and flows through Russia.",
    "The Congo River is the deepest river in the world and flows through central Africa.",
    "The Jordan River flows into the Dead Sea.",
    "The Tigris and Euphrates rivers flow through Iraq and Mesopotamia.",
    "The Hudson River flows past New York City.",
    "The Colorado River carved the Grand Canyon in Arizona.",
    "The Grand Canyon in Arizona is a huge gorge carved by the Colorado River.",
    "Hawaii is an archipelago of volcanic islands in the Pacific Ocean and is a US state.",
    "Madagascar is the largest island in Africa and lies in the Indian Ocean.",
    "Borneo is the largest island in Asia.",
    "Great Britain is the largest island in Europe.",
    "Iceland is an island country in the North Atlantic known for volcanoes and geysers.",
    "Cuba is the largest island in the Caribbean.",
    "Tokyo is the capital of Japan and one of the most populous cities in the world.",
    "Paris is the capital of France and is known for the Eiffel Tower.",
    "London is the capital of the United Kingdom and lies on the River Thames.",
    "Rome is the capital of Italy and was the center of the Roman Empire.",
    "Cairo is the capital of Egypt and lies on the Nile.",
    "Moscow is the capital of Russia.",
    "Beijing is the capital of China.",
    "Sydney is famous for its Opera House and Harbour Bridge.",
    "Istanbul is the city that spans both Europe and Asia across the Bosphorus.",
    "Venice is an Italian city built on canals.",
    "Kyoto was the imperial capital of Japan for over a thousand years.",
    "Marrakech is a major city in Morocco.",
    "Casablanca is the largest city in Morocco.",
    "Mumbai is the largest city in India by population and the center of its film industry.",
    "Timbuktu is a historic city in Mali.",
    "Dubai is the largest city of the United Arab Emirates.",
    "Rio de Janeiro is a coastal city in Brazil famous for its carnival and Christ the Redeemer statue.",
    "Machu Picchu is an ancient Inca city high in the Andes of Peru.",
    "Petra is an ancient rock-cut city in Jordan.",
    "Angkor Wat is a huge temple complex in Cambodia.",
    "The Taj Mahal is a white marble mausoleum in Agra, India, built by Shah Jahan for his wife Mumtaz Mahal.",
    "The Great Wall of China is a series of fortifications built across northern China over many centuries.",
    "The Colosseum is an ancient amphitheatre in Rome built by the Roman Empire.",
    "The Parthenon is an ancient temple to Athena on the Acropolis in Athens, Greece.",
    "The pyramids of Giza were built by the ancient Egyptians as tombs for pharaohs.",
    "The Great Pyramid of Giza is the oldest of the Seven Wonders of the Ancient World and the only one still largely standing.",
    "Stonehenge is a prehistoric stone circle in England.",
    "The Statue of Liberty stands in New York Harbor and was a gift from France to the United States.",
    "Big Ben is the nickname of the great bell of the clock tower at the Palace of Westminster in London.",
    "The Louvre in Paris is the most visited art museum in the world and holds the Mona Lisa.",
    "The Eiffel Tower in Paris was completed in 1889 and designed by the engineering firm of Gustave Eiffel.",
    "The Sagrada Familia is a basilica in Barcelona designed by Antoni Gaudi.",
    "The Kremlin is a fortified complex in the center of Moscow.",
    "The Brandenburg Gate is a famous monument in Berlin.",
    "Christ the Redeemer is a statue overlooking Rio de Janeiro in Brazil.",
    "The Burj Khalifa in Dubai is the tallest building in the world.",
    "The Sydney Opera House is a famous performing arts centre in Sydney, Australia.",
    "The Panama Canal was completed in 1914.",
    "The United Kingdom is made up of England, Scotland, Wales and Northern Ireland.",
    "England's capital is London, Scotland's capital is Edinburgh, Wales's capital is Cardiff and Northern Ireland's capital is Belfast.",
    "The Netherlands is also called Holland, and its capital is Amsterdam, although the government sits in The Hague.",
    "Switzerland has four national languages: German, French, Italian and Romansh.",
    "Canada has two official languages, English and French.",
    "The official language of Brazil is Portuguese, and the official language of most other South American countries is Spanish.",
    "People in Austria speak German, and people in Belgium speak Dutch, French and German.",
    "Mandarin Chinese is the most widely spoken native language in the world.",
    "Spanish is the official language of Mexico, Spain, Argentina and most of Central America.",
    "The official language of Japan is Japanese, and the currency of Japan is the yen.",
    "The currency of the United Kingdom is the pound sterling.",
    "The euro is the currency of most countries of the European Union, including France, Germany, Italy and Spain.",
    "The currency of the United States is the US dollar, and the currency of India is the rupee.",
    "The currency of China is the yuan, also called the renminbi.",
    "The currency of Switzerland is the Swiss franc, and the currency of Russia is the rouble.",
    "The equator is an imaginary line around the middle of Earth at 0 degrees latitude, dividing it into the Northern and Southern Hemispheres.",
    "The prime meridian at 0 degrees longitude passes through Greenwich in London.",
    "The Tropic of Cancer and the Tropic of Capricorn mark the northern and southern limits of the tropics.",
    "The Arctic Circle and the Antarctic Circle mark the polar regions.",
    "The Earth is divided into time zones; Greenwich Mean Time is the time at the prime meridian.",
    "The Amazon rainforest is the largest tropical rainforest in the world and lies mostly in Brazil.",
    "The Great Barrier Reef off the coast of Queensland, Australia, is the largest coral reef system in the world.",
    "The Serengeti is a large grassland ecosystem in Tanzania and Kenya famous for the wildebeest migration.",
    "Yellowstone was the first national park in the United States, established in 1872.",
    "The Ring of Fire is a belt of volcanoes and earthquakes around the edge of the Pacific Ocean.",
    "Mount Vesuvius is the volcano that buried Pompeii in 79 AD.",
    "Krakatoa is a volcano in Indonesia that erupted violently in 1883.",
    "Earthquakes happen when tectonic plates suddenly shift along faults in Earth's crust.",
    "A peninsula is a piece of land surrounded by water on three sides.",
    "An island is a piece of land completely surrounded by water.",
    "A delta is a landform where a river splits into branches and meets the sea.",
    "A glacier is a large slow-moving mass of ice.",
    "Latitude measures distance north or south of the equator, and longitude measures distance east or west of the prime meridian.",
    "Africa has 54 recognised countries, and Europe has about 44 to 50 depending on how transcontinental countries are counted.",
    "Nigeria is the most populous country in Africa.",
    "Ethiopia is the only African country that was never colonised for long, apart from a brief Italian occupation.",
    "Brazil is the largest country in South America and the fifth largest in the world.",
    "Australia is both a country and a continent.",
    "Greenland is an autonomous territory of Denmark.",
    "Hong Kong is a special administrative region of China.",
    "Singapore is a city-state in Southeast Asia."
  ].forEach(function (s) { out.push(s); });

  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
