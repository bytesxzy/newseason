/* World geography facts, second wave: rivers, mountains, deserts, lakes, seas,
 * islands, nicknames, provinces, currencies and languages. Tables are expanded
 * into sentences at load time; the sentences are the knowledge. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];

  /* river | length km | continent | detail */
  [
    "Nile|6,650|Africa|It flows north through Egypt into the Mediterranean Sea", "Amazon|6,400|South America|It flows east through Brazil into the Atlantic Ocean and carries more water than any other river",
    "Yangtze|6,300|Asia|It flows through China into the East China Sea", "Mississippi|3,730|North America|It flows south through the United States into the Gulf of Mexico",
    "Missouri|3,767|North America|It joins the Mississippi near St. Louis", "Yenisei|5,539|Asia|It flows north through Russia into the Arctic Ocean", "Yellow River|5,464|Asia|It flows through China into the Bohai Sea",
    "Ob|5,410|Asia|It flows through Russia", "Parana|4,880|South America|It flows through Brazil, Paraguay and Argentina", "Congo|4,700|Africa|It flows through Central Africa into the Atlantic Ocean",
    "Amur|4,444|Asia|It forms part of the border between Russia and China", "Lena|4,400|Asia|It flows through Siberia into the Arctic Ocean", "Mekong|4,350|Asia|It flows from China through Southeast Asia to the South China Sea",
    "Niger|4,180|Africa|It flows through West Africa into the Gulf of Guinea", "Murray|2,508|Oceania|It is the longest river in Australia", "Volga|3,531|Europe|It flows through Russia into the Caspian Sea",
    "Danube|2,850|Europe|It flows through ten countries into the Black Sea", "Ganges|2,525|Asia|It flows from the Himalayas across India and Bangladesh and is sacred in Hinduism", "Indus|3,180|Asia|It flows from Tibet through Pakistan to the Arabian Sea",
    "Euphrates|2,800|Asia|It flows through Turkey, Syria and Iraq", "Tigris|1,850|Asia|It flows through Turkey and Iraq", "Rhine|1,230|Europe|It flows from the Alps through Germany and the Netherlands into the North Sea",
    "Seine|777|Europe|It flows through Paris into the English Channel", "Thames|346|Europe|It flows through London into the North Sea", "Rio Grande|3,057|North America|It forms part of the border between the United States and Mexico",
    "Colorado River|2,330|North America|It carved the Grand Canyon", "Zambezi|2,574|Africa|It flows past Victoria Falls into the Indian Ocean", "Orinoco|2,250|South America|It flows through Venezuela and Colombia",
    "Loire|1,006|Europe|It is the longest river in France", "Elbe|1,094|Europe|It flows through the Czech Republic and Germany into the North Sea", "Dnieper|2,290|Europe|It flows through Russia, Belarus and Ukraine into the Black Sea",
    "St. Lawrence|3,058|North America|It drains the Great Lakes into the Atlantic Ocean", "Brahmaputra|2,900|Asia|It flows from Tibet through India and Bangladesh", "Irrawaddy|2,170|Asia|It is the main river of Myanmar",
    "Shannon|360|Europe|It is the longest river in Ireland", "Tagus|1,007|Europe|It is the longest river on the Iberian Peninsula", "Po|652|Europe|It is the longest river in Italy", "Vistula|1,047|Europe|It is the longest river in Poland",
    "Limpopo|1,750|Africa|It flows through South Africa, Botswana, Zimbabwe and Mozambique", "Orange River|2,200|Africa|It is the longest river in South Africa", "Jordan|251|Asia|It flows into the Dead Sea",
    "Rhone|813|Europe|It flows from Switzerland through France into the Mediterranean Sea", "Hudson|507|North America|It flows past New York City into the Atlantic Ocean", "Potomac|665|North America|It flows past Washington, D.C.",
    "Columbia River|2,000|North America|It flows through Canada and the northwestern United States into the Pacific Ocean", "Yukon|3,190|North America|It flows through Canada and Alaska into the Bering Sea", "Sao Francisco|2,914|South America|It is the longest river wholly within Brazil",
    "Magdalena|1,550|South America|It is the main river of Colombia", "Paraguay|2,621|South America|It flows through Brazil, Paraguay and Argentina", "Uruguay River|1,838|South America|It forms part of the border between Argentina and Uruguay"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push("The " + p[0] + " is a river in " + p[2] + ", about " + p[1] + " kilometres long. " + p[3] + ".");
    out.push("The length of the " + p[0] + " is about " + p[1] + " kilometres.");
  });
  out.push("The longest river in Africa is the Nile, at about 6,650 kilometres.");
  out.push("The Nile is the longest river in the world by most measures, at about 6,650 kilometres, although some measurements give the Amazon a longer course.");
  out.push("The longest river in South America is the Amazon, at about 6,400 kilometres, and it is also the largest river in the world by volume of water.");
  out.push("The longest river in Asia is the Yangtze, at about 6,300 kilometres.");
  out.push("The longest river in Europe is the Volga, at about 3,531 kilometres.");
  out.push("The longest river in North America is the Missouri, at about 3,767 kilometres, which joins the Mississippi.");
  out.push("The longest river in Australia is the Murray, at about 2,508 kilometres.");
  out.push("The longest river in the United Kingdom is the Severn, at about 354 kilometres, while the Thames is the longest river in England that lies wholly within it.");
  out.push("The Amazon rainforest, in the basin of the Amazon River, is the largest tropical rainforest in the world.");

  /* mountain | height m | where */
  [
    "Mount Everest|8,849|the Himalayas on the border of Nepal and China (Tibet)", "K2|8,611|the Karakoram range on the border of Pakistan and China", "Kangchenjunga|8,586|the Himalayas on the border of Nepal and India",
    "Lhotse|8,516|the Himalayas on the border of Nepal and China", "Makalu|8,485|the Himalayas on the border of Nepal and China", "Cho Oyu|8,188|the Himalayas on the border of Nepal and China",
    "Dhaulagiri|8,167|the Himalayas in Nepal", "Manaslu|8,163|the Himalayas in Nepal", "Nanga Parbat|8,126|the Himalayas in Pakistan", "Annapurna|8,091|the Himalayas in Nepal",
    "Kilimanjaro|5,895|Tanzania, and it is the highest mountain in Africa", "Mount Kenya|5,199|Kenya, and it is the second highest mountain in Africa", "Aconcagua|6,961|Argentina, and it is the highest mountain in South America",
    "Denali|6,190|Alaska, and it is the highest mountain in North America", "Mont Blanc|4,808|the Alps on the border of France and Italy, and it is the highest mountain in the Alps", "Mount Elbrus|5,642|the Caucasus in Russia, and it is the highest mountain in Europe",
    "Vinson Massif|4,892|Antarctica, and it is the highest mountain on that continent", "Puncak Jaya|4,884|Indonesia, and it is the highest mountain in Oceania", "Mount Kosciuszko|2,228|Australia, and it is the highest mountain on the Australian mainland",
    "Mount Fuji|3,776|Japan, and it is the highest mountain in Japan", "Matterhorn|4,478|the Alps on the border of Switzerland and Italy", "Ben Nevis|1,345|Scotland, and it is the highest mountain in the British Isles",
    "Mount Rainier|4,392|Washington State in the United States", "Mount Whitney|4,421|California, and it is the highest mountain in the contiguous United States", "Mount Olympus|2,917|Greece, and in myth it was the home of the Greek gods",
    "Mount Etna|3,357|Sicily, and it is the largest active volcano in Europe", "Mount Vesuvius|1,281|near Naples in Italy, and its eruption in 79 CE buried Pompeii", "Mauna Kea|4,207|Hawaii, and measured from the sea floor it is taller than Everest",
    "Mount Sinai|2,285|the Sinai Peninsula in Egypt", "Mount Ararat|5,137|Turkey, and it is the traditional resting place of Noah's Ark", "Mount St. Helens|2,549|Washington State, and it erupted in 1980",
    "Mount Kilimanjaro|5,895|Tanzania, and it is the highest free-standing mountain in the world", "Table Mountain|1,086|Cape Town in South Africa", "Mount Cook|3,724|New Zealand, and it is the highest mountain in New Zealand",
    "Mount Logan|5,959|Canada, and it is the highest mountain in Canada", "Chimborazo|6,263|Ecuador, and its summit is the farthest point from the centre of the Earth", "Mount Hood|3,429|Oregon in the United States",
    "Mount Pinatubo|1,486|the Philippines, and it erupted in 1991", "Krakatoa|813|Indonesia, and its 1883 eruption was one of the deadliest in history"
  ].forEach(function (row) {
    var p = row.split("|");
    var parts = p[2].split(", and "), loc = parts[0], remark = parts[1] ? parts[1].replace(/^it is /, "") : "";
    out.push(p[0] + " is a mountain in " + loc + ", " + p[1] + " metres high.");
    out.push("The height of " + p[0] + " is " + p[1] + " metres.");
    if (remark) out.push(p[0] + " is " + remark + ".");
  });
  out.push("The tallest mountain in the world is Mount Everest, at 8,849 metres above sea level.");
  out.push("The highest mountain in the world is Mount Everest, which is in the Himalayas on the border of Nepal and China.");
  out.push("The tallest mountain in Africa is Kilimanjaro, in Tanzania, at 5,895 metres.");
  out.push("The highest mountain in Africa is Mount Kilimanjaro in Tanzania.");
  out.push("The tallest mountain in South America is Aconcagua, in Argentina, at 6,961 metres.");
  out.push("The tallest mountain in North America is Denali, in Alaska, at 6,190 metres.");
  out.push("The tallest mountain in Europe is Mount Elbrus, in Russia, at 5,642 metres, while Mont Blanc is the highest in the Alps.");
  out.push("The tallest mountain in Asia is Mount Everest.");
  out.push("The tallest mountain in Antarctica is the Vinson Massif, at 4,892 metres.");
  out.push("The highest mountain in Australia is Mount Kosciuszko, at 2,228 metres.");
  out.push("Mount Everest was first climbed in 1953 by Edmund Hillary of New Zealand and Tenzing Norgay, a Sherpa of Nepal.");
  out.push("Edmund Hillary and Tenzing Norgay were the first people confirmed to reach the summit of Mount Everest, on 29 May 1953.");
  out.push("The Himalayas are the highest mountain range in the world, stretching across Nepal, India, Bhutan, China and Pakistan.");
  out.push("The Andes are the longest mountain range in the world, running about 7,000 kilometres down the west coast of South America.");
  out.push("The Alps are the main mountain range of Europe, running through France, Switzerland, Italy, Austria, Germany and Slovenia.");
  out.push("The Rocky Mountains stretch from Canada through the United States and are the major range of western North America.");
  out.push("The Ural Mountains form the traditional boundary between Europe and Asia.");
  out.push("The Appalachian Mountains run along the eastern side of North America.");

  /* deserts */
  [
    "Sahara|9.2 million|Africa|It is the largest hot desert in the world", "Gobi|1.3 million|Asia|It spans northern China and southern Mongolia", "Kalahari|900,000|Africa|It covers much of Botswana, Namibia and South Africa",
    "Arabian Desert|2.3 million|Asia|It covers most of the Arabian Peninsula", "Great Victoria Desert|424,000|Oceania|It is the largest desert in Australia", "Syrian Desert|500,000|Asia|It covers parts of Syria, Jordan, Iraq and Saudi Arabia",
    "Atacama|105,000|South America|It lies in northern Chile and is the driest non-polar place on Earth", "Namib|81,000|Africa|It runs along the coast of Namibia and is one of the oldest deserts in the world", "Thar|200,000|Asia|It lies across India and Pakistan",
    "Mojave|65,000|North America|It lies in southern California and Nevada and includes Death Valley", "Sonoran|260,000|North America|It covers parts of Arizona, California and Mexico", "Taklamakan|337,000|Asia|It lies in western China",
    "Patagonian Desert|673,000|South America|It covers much of Argentina and Chile and is the largest desert in the Americas"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push("The " + p[0] + " is a desert in " + p[2] + ", about " + p[1] + " square kilometres in area. " + p[3] + ".");
  });
  out.push("The largest desert in the world is Antarctica, a polar desert, and the largest hot desert is the Sahara.");
  out.push("The Sahara is the largest hot desert in the world and covers much of northern Africa.");
  out.push("The driest place on Earth outside the poles is the Atacama Desert in Chile.");
  out.push("The hottest place on Earth by recorded air temperature is Death Valley in California, which reached about 56.7 degrees Celsius in 1913.");
  out.push("The coldest recorded temperature on Earth was about minus 89.2 degrees Celsius at Vostok Station in Antarctica in 1983.");

  /* lakes, seas, oceans, islands */
  [
    "Caspian Sea|371,000|Asia and Europe|It is the largest lake in the world by area and is salty", "Lake Superior|82,100|North America|It is the largest of the Great Lakes and the largest freshwater lake by area",
    "Lake Victoria|68,800|Africa|It is the largest lake in Africa", "Lake Huron|59,600|North America|It is one of the Great Lakes", "Lake Michigan|58,000|North America|It is the only Great Lake wholly within the United States",
    "Lake Tanganyika|32,900|Africa|It is the longest freshwater lake in the world", "Lake Baikal|31,700|Asia|It is the deepest lake in the world and holds about one fifth of the world's fresh surface water", "Great Bear Lake|31,000|North America|It lies in northern Canada",
    "Lake Malawi|29,600|Africa|It lies between Malawi, Mozambique and Tanzania", "Great Slave Lake|28,600|North America|It lies in northern Canada", "Lake Erie|25,700|North America|It is one of the Great Lakes",
    "Lake Winnipeg|24,500|North America|It lies in Manitoba, Canada", "Lake Ontario|18,960|North America|It is the smallest of the Great Lakes by area", "Lake Titicaca|8,372|South America|It lies on the border of Peru and Bolivia and is the highest navigable lake in the world",
    "Dead Sea|605|Asia|It lies between Israel, Jordan and the West Bank, is the lowest land point on Earth and is far saltier than the ocean", "Lake Geneva|580|Europe|It lies on the border of Switzerland and France", "Lake Como|146|Europe|It is a lake in northern Italy",
    "Loch Ness|56|Europe|It is a deep lake in Scotland said to be home to a legendary monster"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push(p[0] + " is a lake in " + p[2] + ", about " + p[1] + " square kilometres in area. " + p[3] + ".");
  });
  out.push("The largest lake in the world is the Caspian Sea.");
  out.push("The deepest lake in the world is Lake Baikal in Russia, at about 1,642 metres deep.");
  out.push("The Great Lakes are Superior, Michigan, Huron, Erie and Ontario, on the border of the United States and Canada.");
  out.push("The largest ocean is the Pacific Ocean, which covers about one third of the Earth's surface.");
  out.push("The Pacific Ocean is the largest and deepest ocean in the world.");
  out.push("The five oceans are the Pacific, Atlantic, Indian, Southern (Antarctic) and Arctic.");
  out.push("The Atlantic Ocean is the second largest ocean, the Indian Ocean is the third largest, the Southern Ocean is the fourth and the Arctic Ocean is the smallest.");
  out.push("The deepest point in the ocean is the Challenger Deep in the Mariana Trench in the Pacific, about 10,935 metres deep.");
  out.push("The Mediterranean Sea lies between Europe, Africa and Asia.");
  out.push("The sea that lies between Europe and Africa is the Mediterranean Sea.");
  out.push("The Red Sea lies between Africa and Asia, and the Suez Canal connects it to the Mediterranean.");
  out.push("The Black Sea lies between Europe and Asia, bordered by Ukraine, Russia, Turkey, Bulgaria, Romania and Georgia.");
  out.push("The Baltic Sea lies in northern Europe, bordered by Sweden, Finland, Poland, Germany and the Baltic states.");
  out.push("The North Sea lies between Great Britain and the European mainland.");
  out.push("The Caribbean Sea lies between the Caribbean islands and Central and South America.");
  out.push("The Sea of Japan lies between Japan and the Asian mainland.");
  out.push("The Arabian Sea is part of the Indian Ocean between India and the Arabian Peninsula.");
  out.push("The South China Sea is a marginal sea of the Pacific bordered by China, Vietnam, the Philippines and Malaysia.");
  out.push("The Gulf of Mexico is a large ocean basin bordered by the United States, Mexico and Cuba.");
  out.push("The Strait of Gibraltar connects the Atlantic Ocean and the Mediterranean Sea between Spain and Morocco.");
  out.push("The Suez Canal connects the Mediterranean Sea to the Red Sea through Egypt and opened in 1869.");
  out.push("The Panama Canal connects the Atlantic and Pacific oceans across Panama and opened in 1914.");
  out.push("The English Channel separates England from France.");
  out.push("The Bosphorus is the strait through Istanbul that separates Europe from Asia.");
  /* island | area km2 | where */
  [
    "Greenland|2,166,000|North America, and it is the largest island in the world", "New Guinea|786,000|Oceania, and it is the second largest island", "Borneo|743,000|Southeast Asia, and it is the third largest island",
    "Madagascar|587,000|Africa, and it is the fourth largest island", "Baffin Island|507,000|Canada, and it is the largest island in Canada", "Sumatra|473,000|Indonesia", "Honshu|228,000|Japan, and it is the largest island of Japan",
    "Great Britain|209,000|Europe, and it is the largest island in Europe", "Victoria Island|217,000|Canada", "Ellesmere Island|196,000|Canada", "Sulawesi|174,000|Indonesia", "South Island|151,000|New Zealand, and it is the largest island of New Zealand",
    "Java|138,000|Indonesia, and it is the most populous island in the world", "North Island|114,000|New Zealand", "Cuba|110,000|the Caribbean, and it is the largest island in the Caribbean", "Newfoundland|108,000|Canada",
    "Luzon|110,000|the Philippines", "Iceland|103,000|the North Atlantic", "Mindanao|97,000|the Philippines", "Ireland|84,000|Europe", "Hokkaido|83,000|Japan", "Sri Lanka|65,600|South Asia", "Tasmania|68,000|Australia",
    "Sicily|25,700|Italy, and it is the largest island in the Mediterranean", "Sardinia|24,000|Italy", "Cyprus|9,250|the eastern Mediterranean", "Crete|8,300|Greece, and it is the largest Greek island", "Hawaii|10,400|the Pacific, the largest island of the Hawaiian chain",
    "Jamaica|10,900|the Caribbean", "Corsica|8,700|France", "Singapore|730|Southeast Asia, and it is a city-state", "Manhattan|59|New York City"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push(p[0] + " is an island in " + p[2] + ", about " + p[1] + " square kilometres in area.");
  });
  out.push("The largest island in the world is Greenland, which is a self-governing territory of Denmark.");
  out.push("Australia is sometimes called the largest island and sometimes the smallest continent.");
  out.push("The country made up of the most islands is Indonesia, with more than 17,000 islands.");

  /* waterfalls and other features */
  out.push("The tallest waterfall in the world is Angel Falls in Venezuela, at 979 metres.");
  out.push("Victoria Falls lies on the Zambezi River on the border of Zambia and Zimbabwe.");
  out.push("Niagara Falls lies on the border of the United States and Canada between Lake Erie and Lake Ontario.");
  out.push("Iguazu Falls lies on the border of Argentina and Brazil.");
  out.push("The Grand Canyon in Arizona was carved by the Colorado River and is about 446 kilometres long and up to 1,857 metres deep.");
  out.push("The Great Barrier Reef off the coast of Queensland, Australia, is the largest coral reef system in the world.");
  out.push("The Great Rift Valley is a long system of valleys running through East Africa and the Middle East.");
  out.push("Uluru, also called Ayers Rock, is a large sandstone rock in the middle of Australia and is sacred to the Aboriginal Anangu people.");
  out.push("The Amazon rainforest covers much of northern Brazil and is the largest tropical rainforest in the world.");
  out.push("The Serengeti is a vast grassland in Tanzania famous for the annual migration of wildebeest and zebra.");
  out.push("Siberia is the vast region of Russia that stretches across northern Asia.");
  out.push("The Sahara, Gobi and Arabian are among the largest deserts in the world.");
  out.push("Mount Vesuvius destroyed the Roman towns of Pompeii and Herculaneum when it erupted in 79 CE.");
  out.push("The Ring of Fire is a belt around the edge of the Pacific Ocean with many volcanoes and earthquakes.");
  out.push("The Pacific Ring of Fire has about 75 percent of the world's active volcanoes.");

  /* superlatives among countries and cities */
  out.push("The largest country in the world by area is Russia, at about 17 million square kilometres.");
  out.push("The second largest country in the world by area is Canada, followed by the United States and China.");
  out.push("The smallest country in the world is Vatican City, at about 0.44 square kilometres.");
  out.push("Vatican City is the smallest country in the world by both area and population.");
  out.push("The most populous country in the world is India, followed by China and the United States.");
  out.push("India became the most populous country in the world in 2023, overtaking China.");
  out.push("The least densely populated country in the world is Mongolia.");
  out.push("The most densely populated country is Monaco, and among larger countries Bangladesh is one of the most crowded.");
  out.push("The largest city in the world by metropolitan population is Tokyo, with more than 35 million people.");
  out.push("The largest city in the United States by population is New York City.");
  out.push("The largest city in Australia is Sydney, though the capital is Canberra.");
  out.push("The largest city in Canada is Toronto, though the capital is Ottawa.");
  out.push("The largest city in Brazil is Sao Paulo, though the capital is Brasilia.");
  out.push("The largest city in Turkey is Istanbul, though the capital is Ankara.");
  out.push("The largest city in Switzerland is Zurich, though the capital is Bern.");
  out.push("The largest city in India by population is Mumbai, and the capital is New Delhi.");
  out.push("Africa has 54 countries and is the continent with the most countries.");
  out.push("The largest continent by area and population is Asia.");
  out.push("The smallest continent by area is Australia (Oceania).");
  out.push("There are seven continents: Asia, Africa, North America, South America, Antarctica, Europe and Australia (Oceania).");
  out.push("The coldest continent is Antarctica.");
  out.push("The country with the longest coastline in the world is Canada.");
  out.push("Russia spans eleven time zones, the most of any country.");
  out.push("The country that is both in Europe and Asia and has Istanbul as its largest city is Turkey.");
  out.push("The only country that is also a continent is Australia.");
  out.push("The country shaped like a boot is Italy.");
  out.push("The country called the Land of the Rising Sun is Japan.");
  out.push("The country called the Land Down Under is Australia.");
  out.push("The country called the Land of Fire and Ice is Iceland.");
  out.push("The city called the City of Light is Paris.");
  out.push("The city called the Big Apple is New York City.");
  out.push("The city called the Eternal City is Rome.");
  out.push("The city called the Windy City is Chicago.");
  out.push("The city called the City of Canals is Venice.");
  out.push("The city called the Big Smoke is London.");
  out.push("The city called the Forbidden City is Beijing, because of the palace complex at its centre.");
  out.push("The country with the maple leaf on its flag is Canada.");
  out.push("The country whose flag is a red circle on a white background is Japan.");
  out.push("The country that gave the world the Olympic Games is Greece.");
  out.push("The country that is home to the pyramids of Giza is Egypt.");
  out.push("The country that is home to the Taj Mahal is India.");
  out.push("The country that is home to the Great Wall is China.");
  out.push("The country that is home to the Colosseum is Italy.");
  out.push("The country that is home to Machu Picchu is Peru.");
  out.push("The country that is home to the kangaroo is Australia.");
  out.push("The country that is home to the Eiffel Tower is France.");
  out.push("The country that is home to the Leaning Tower of Pisa is Italy.");
  out.push("The country that is home to Mount Fuji is Japan.");
  out.push("The country that is home to the Acropolis is Greece.");
  out.push("The country that is home to the Sydney Opera House is Australia.");
  out.push("The country that is home to the Statue of Liberty is the United States.");
  out.push("The country that is home to Petra is Jordan.");
  out.push("The country that is home to Angkor Wat is Cambodia.");
  out.push("The country that is home to Stonehenge is England in the United Kingdom.");
  out.push("The country that is home to Chichen Itza is Mexico.");
  out.push("The country that is home to Christ the Redeemer is Brazil.");
  out.push("The country that is home to the Brandenburg Gate is Germany.");
  out.push("The country that is home to Big Ben is the United Kingdom.");
  out.push("Marrakech is a city in Morocco known for its old medina and markets.");
  out.push("Kyoto is a city in Japan that was the imperial capital for over a thousand years.");
  out.push("Casablanca is the largest city in Morocco, while Rabat is the capital.");
  out.push("Timbuktu is a city in Mali, historically a centre of trade and Islamic learning.");
  out.push("Petra is an ancient city carved into rock in Jordan.");
  out.push("Machu Picchu is an Inca citadel high in the Andes of Peru.");
  out.push("The Louvre in Paris is the most visited museum in the world and holds the Mona Lisa.");

  /* Canadian provinces, Australian states, UK nations */
  [
    "Ontario|Toronto", "Quebec|Quebec City", "British Columbia|Victoria", "Alberta|Edmonton", "Manitoba|Winnipeg", "Saskatchewan|Regina", "Nova Scotia|Halifax", "New Brunswick|Fredericton",
    "Newfoundland and Labrador|St. John's", "Prince Edward Island|Charlottetown"
  ].forEach(function (r) { var p = r.split("|"); out.push("The capital of " + p[0] + ", a province of Canada, is " + p[1] + "."); });
  [
    "New South Wales|Sydney", "Victoria|Melbourne", "Queensland|Brisbane", "Western Australia|Perth", "South Australia|Adelaide", "Tasmania|Hobart"
  ].forEach(function (r) { var p = r.split("|"); out.push("The capital of " + p[0] + ", a state of Australia, is " + p[1] + "."); });
  out.push("The capital of England is London, of Scotland is Edinburgh, of Wales is Cardiff and of Northern Ireland is Belfast.");
  out.push("The United Kingdom is made up of England, Scotland, Wales and Northern Ireland.");
  out.push("Canada has ten provinces and three territories.");
  out.push("Australia has six states and two major mainland territories.");
  out.push("The United States has fifty states and its capital is Washington, D.C.");
  out.push("The first state of the United States to ratify the Constitution was Delaware, which is why it is called the First State.");
  out.push("The largest US state by area is Alaska and the smallest is Rhode Island.");
  out.push("The most populous US state is California.");

  /* country | currency | language */
  [
    "United States|the US dollar|English", "United Kingdom|the pound sterling|English", "Japan|the yen|Japanese", "China|the yuan (renminbi)|Mandarin Chinese", "India|the rupee|Hindi and English", "Germany|the euro|German",
    "France|the euro|French", "Italy|the euro|Italian", "Spain|the euro|Spanish", "Portugal|the euro|Portuguese", "Netherlands|the euro|Dutch", "Belgium|the euro|Dutch, French and German", "Austria|the euro|German",
    "Greece|the euro|Greek", "Ireland|the euro|English and Irish", "Finland|the euro|Finnish and Swedish", "Russia|the ruble|Russian", "Brazil|the real|Portuguese", "Argentina|the peso|Spanish", "Mexico|the peso|Spanish",
    "Canada|the Canadian dollar|English and French", "Australia|the Australian dollar|English", "New Zealand|the New Zealand dollar|English and Maori", "South Africa|the rand|eleven official languages including Zulu, Xhosa and Afrikaans",
    "Switzerland|the Swiss franc|German, French, Italian and Romansh", "Sweden|the krona|Swedish", "Norway|the krone|Norwegian", "Denmark|the krone|Danish", "Poland|the zloty|Polish", "Turkey|the lira|Turkish",
    "Egypt|the Egyptian pound|Arabic", "Saudi Arabia|the riyal|Arabic", "Israel|the shekel|Hebrew", "Iran|the rial|Persian (Farsi)", "Pakistan|the rupee|Urdu and English", "Bangladesh|the taka|Bengali",
    "Thailand|the baht|Thai", "Vietnam|the dong|Vietnamese", "Indonesia|the rupiah|Indonesian", "Malaysia|the ringgit|Malay", "Singapore|the Singapore dollar|English, Malay, Mandarin and Tamil", "Philippines|the peso|Filipino and English",
    "South Korea|the won|Korean", "North Korea|the won|Korean", "Nigeria|the naira|English", "Kenya|the shilling|Swahili and English", "Ethiopia|the birr|Amharic", "Morocco|the dirham|Arabic and Berber",
    "Chile|the peso|Spanish", "Colombia|the peso|Spanish", "Peru|the sol|Spanish and Quechua", "Venezuela|the bolivar|Spanish", "Cuba|the peso|Spanish", "Czech Republic|the koruna|Czech", "Hungary|the forint|Hungarian",
    "Romania|the leu|Romanian", "Ukraine|the hryvnia|Ukrainian", "Iceland|the krona|Icelandic", "Afghanistan|the afghani|Pashto and Dari", "Iraq|the dinar|Arabic and Kurdish", "United Arab Emirates|the dirham|Arabic",
    "Qatar|the riyal|Arabic", "Kuwait|the dinar|Arabic", "Jordan|the dinar|Arabic", "Lebanon|the pound|Arabic", "Sri Lanka|the rupee|Sinhala and Tamil", "Nepal|the rupee|Nepali", "Cambodia|the riel|Khmer", "Myanmar|the kyat|Burmese",
    "Mongolia|the tugrik|Mongolian", "Kazakhstan|the tenge|Kazakh and Russian", "Ghana|the cedi|English", "Tanzania|the shilling|Swahili and English", "Uganda|the shilling|English and Swahili", "Algeria|the dinar|Arabic and Berber",
    "Tunisia|the dinar|Arabic", "Libya|the dinar|Arabic", "Sudan|the pound|Arabic and English", "Senegal|the CFA franc|French", "Angola|the kwanza|Portuguese", "Mozambique|the metical|Portuguese", "Zimbabwe|the Zimbabwe dollar|English, Shona and Ndebele",
    "Uruguay|the peso|Spanish", "Paraguay|the guarani|Spanish and Guarani", "Bolivia|the boliviano|Spanish and indigenous languages", "Ecuador|the US dollar|Spanish", "Panama|the balboa and US dollar|Spanish", "Costa Rica|the colon|Spanish",
    "Jamaica|the Jamaican dollar|English", "Haiti|the gourde|French and Haitian Creole", "Dominican Republic|the peso|Spanish", "Croatia|the euro|Croatian", "Serbia|the dinar|Serbian", "Bulgaria|the lev|Bulgarian", "Slovakia|the euro|Slovak",
    "Slovenia|the euro|Slovene", "Estonia|the euro|Estonian", "Latvia|the euro|Latvian", "Lithuania|the euro|Lithuanian", "Luxembourg|the euro|Luxembourgish, French and German", "Malta|the euro|Maltese and English", "Cyprus|the euro|Greek and Turkish"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push("The currency of " + p[0] + " is " + p[1] + ".");
    out.push("The official language of " + p[0] + " is " + p[2] + ", and people there speak it.");
    out.push("People in " + p[0] + " speak " + p[2] + ".");
  });
  out.push("Spanish is spoken in Spain, Mexico, Argentina, Colombia and most of Central and South America.");
  out.push("Portuguese is the language of Brazil, Portugal, Angola and Mozambique.");
  out.push("Mandarin Chinese is the most spoken native language in the world, followed by Spanish and English.");
  out.push("English is the most widely spoken language in the world when native and second-language speakers are counted together.");
  out.push("Arabic is the official language of more than twenty countries, from Morocco to Iraq.");
  out.push("The euro is the currency used by most countries of the European Union.");
  out.push("The eurozone is the group of European Union countries that use the euro.");

  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
