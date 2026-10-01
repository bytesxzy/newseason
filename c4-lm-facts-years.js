/* A timeline: what happened in notable years, so "What happened in 1066?" has an answer. Local only. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];
  /* year | what happened */
  ("776 BCE|the first recorded ancient Olympic Games were held in Olympia, Greece;753 BCE|Rome was traditionally founded, according to Roman legend;" +
   "44 BCE|Julius Caesar was assassinated in Rome on the Ides of March;476|the last Western Roman emperor, Romulus Augustulus, was deposed, which is taken as the end of the Western Roman Empire;" +
   "800|Charlemagne was crowned emperor by the Pope on Christmas Day;1066|William the Conqueror of Normandy defeated King Harold at the Battle of Hastings and became King of England;" +
   "1095|Pope Urban II called for the First Crusade;1215|King John of England sealed the Magna Carta;1271|Marco Polo set out from Venice on his journey to China;" +
   "1347|the Black Death reached Europe and killed a third or more of its people over the next few years;1440|Johannes Gutenberg developed the printing press with movable type in Europe, around this time;" +
   "1453|Constantinople fell to the Ottoman Turks, ending the Byzantine Empire;1492|Christopher Columbus reached the Americas, and Spain completed the reconquest of Granada;" +
   "1517|Martin Luther published his 95 Theses, which started the Protestant Reformation;1519|Ferdinand Magellan set out on the voyage that would be the first to sail around the world;" +
   "1543|Copernicus published his sun-centred model of the universe;1588|the English fleet defeated the Spanish Armada;1607|Jamestown, the first permanent English settlement in America, was founded;" +
   "1620|the Mayflower brought the Pilgrims to Plymouth, Massachusetts;1666|the Great Fire of London destroyed much of the city;1687|Isaac Newton published his Principia, setting out the laws of motion and gravity;" +
   "1776|the United States declared its independence from Britain on 4 July;1789|the French Revolution began with the storming of the Bastille, and George Washington became the first US president;" +
   "1804|Napoleon crowned himself Emperor of the French, and Haiti declared independence;1815|Napoleon was defeated at the Battle of Waterloo;1825|the first public steam railway opened in England;" +
   "1837|Queen Victoria became queen of the United Kingdom;1859|Charles Darwin published On the Origin of Species;1861|the American Civil War began;1865|the American Civil War ended and Abraham Lincoln was assassinated;" +
   "1876|Alexander Graham Bell patented the telephone;1879|Thomas Edison demonstrated a practical electric light bulb;1885|Karl Benz built the first practical petrol-powered car;" +
   "1903|the Wright brothers made the first powered aeroplane flight at Kitty Hawk;1905|Albert Einstein published his special theory of relativity;1912|the Titanic sank on its first voyage;" +
   "1914|World War I began, after the assassination of Archduke Franz Ferdinand;1917|the Russian Revolution took place, and the United States entered World War I;" +
   "1918|World War I ended on 11 November, and the Spanish flu pandemic began to spread;1928|Alexander Fleming discovered penicillin;1929|the Wall Street Crash began the Great Depression;" +
   "1933|Adolf Hitler became chancellor of Germany;1939|World War II began when Germany invaded Poland;1941|Japan attacked Pearl Harbor and the United States entered World War II;" +
   "1944|the Allies landed in Normandy on D-Day, 6 June;1945|World War II ended, atomic bombs were dropped on Hiroshima and Nagasaki, and the United Nations was founded;" +
   "1947|India and Pakistan became independent from Britain;1948|the state of Israel was founded and the Universal Declaration of Human Rights was adopted;" +
   "1949|NATO was founded and the People's Republic of China was proclaimed;1953|Watson and Crick described the structure of DNA, and Edmund Hillary and Tenzing Norgay first climbed Mount Everest;" +
   "1957|the Soviet Union launched Sputnik, the first artificial satellite;1961|Yuri Gagarin became the first human in space and the Berlin Wall was built;1962|the Cuban Missile Crisis brought the world close to nuclear war;" +
   "1963|President John F. Kennedy was assassinated and Martin Luther King Jr. gave his I Have a Dream speech;1964|the US Civil Rights Act outlawed discrimination;" +
   "1969|Neil Armstrong and Buzz Aldrin walked on the Moon on 20 July, and the first message was sent over ARPANET, the ancestor of the internet;1981|IBM launched its Personal Computer;" +
   "1989|the Berlin Wall fell on 9 November, and Tim Berners-Lee proposed the World Wide Web;1990|Nelson Mandela was freed from prison, Germany was reunified and the Hubble Space Telescope was launched;" +
   "1991|the Soviet Union dissolved;1994|Nelson Mandela became president of South Africa after the first democratic elections;1997|Hong Kong returned to Chinese rule and Dolly the sheep, the first cloned mammal, was announced;" +
   "1998|Google was founded;2001|the 9/11 attacks took place in the United States and Wikipedia was launched;2003|the Human Genome Project was completed;2004|Facebook was launched;" +
   "2005|YouTube was launched;2007|Apple launched the first iPhone;2008|a global financial crisis began;2012|scientists at CERN announced the discovery of the Higgs boson;" +
   "2016|the United Kingdom voted to leave the European Union in the Brexit referendum;2019|the first image of a black hole was published, and the COVID-19 virus emerged in China;" +
   "2020|the World Health Organization declared COVID-19 a pandemic").split(";").forEach(function (row) {
    var i = row.indexOf("|"); if (i < 0) return;
    var y = row.slice(0, i), what = row.slice(i + 1);
    out.push("In " + y + ", " + what + ".");
  });
  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
