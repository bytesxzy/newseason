/* People and their dates: "X lived from A to B and was ...". One sentence each, so a question about
 * the person reaches it, and so a question that asks a person to do something that had not been
 * invented in their lifetime can be recognised and declined. Local only. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];
  /* name | born | died | what they were */
  [
    "Socrates|470 BCE|399 BCE|a Greek philosopher", "Plato|428 BCE|348 BCE|a Greek philosopher and a student of Socrates", "Aristotle|384 BCE|322 BCE|a Greek philosopher and the teacher of Alexander the Great",
    "Alexander the Great|356 BCE|323 BCE|the king of Macedon who conquered the Persian Empire", "Julius Caesar|100 BCE|44 BCE|a Roman general and dictator", "Cleopatra|69 BCE|30 BCE|the last active ruler of Ptolemaic Egypt",
    "Confucius|551 BCE|479 BCE|a Chinese philosopher and teacher", "Archimedes|287 BCE|212 BCE|a Greek mathematician and inventor", "Pythagoras|570 BCE|495 BCE|a Greek philosopher and mathematician", "Hippocrates|460 BCE|370 BCE|a Greek physician called the father of medicine",
    "Augustus|63 BCE|14 CE|the first Roman emperor", "Constantine the Great|272|337|a Roman emperor who moved the capital to Constantinople", "Muhammad|570|632|the founder of Islam", "Charlemagne|748|814|the king of the Franks and the first Holy Roman Emperor",
    "Genghis Khan|1162|1227|the founder of the Mongol Empire", "Marco Polo|1254|1324|a Venetian merchant who travelled to China", "Dante Alighieri|1265|1321|an Italian poet who wrote the Divine Comedy", "Joan of Arc|1412|1431|a French heroine who led armies against the English",
    "Christopher Columbus|1451|1506|an Italian navigator who sailed across the Atlantic for Spain", "Leonardo da Vinci|1452|1519|an Italian painter, inventor and scientist who painted the Mona Lisa", "Vasco da Gama|1469|1524|a Portuguese explorer who reached India by sea",
    "Nicolaus Copernicus|1473|1543|a Polish astronomer who proposed that the Earth orbits the Sun", "Michelangelo|1475|1564|an Italian sculptor and painter who painted the Sistine Chapel ceiling", "Ferdinand Magellan|1480|1521|a Portuguese explorer whose expedition first sailed around the world",
    "Martin Luther|1483|1546|a German monk who began the Protestant Reformation", "Henry VIII|1491|1547|the king of England who broke with the Roman Catholic Church", "Elizabeth I|1533|1603|the queen of England during the defeat of the Spanish Armada",
    "Miguel de Cervantes|1547|1616|a Spanish writer who wrote Don Quixote", "Galileo Galilei|1564|1642|an Italian astronomer who built telescopes and supported the Sun-centred model", "Johannes Kepler|1571|1630|a German astronomer who described the laws of planetary motion",
    "Rembrandt|1606|1669|a Dutch painter of the Golden Age", "Louis XIV|1638|1715|the Sun King of France", "Isaac Newton|1643|1727|an English physicist and mathematician who described gravity and the laws of motion", "Peter the Great|1672|1725|the tsar who modernised Russia",
    "Antonio Vivaldi|1678|1741|an Italian composer who wrote The Four Seasons", "Johann Sebastian Bach|1685|1750|a German composer of the Baroque period", "George Frideric Handel|1685|1759|a German-born composer who wrote Messiah",
    "Voltaire|1694|1778|a French writer and philosopher of the Enlightenment", "Carl Linnaeus|1707|1778|a Swedish botanist who created the system of naming species", "Benjamin Franklin|1706|1790|an American statesman, writer and scientist",
    "James Cook|1728|1779|a British explorer who mapped the Pacific", "Catherine the Great|1729|1796|the empress of Russia", "George Washington|1732|1799|the first president of the United States", "Antoine Lavoisier|1743|1794|a French chemist who named oxygen",
    "Thomas Jefferson|1743|1826|the third president of the United States and the main author of the Declaration of Independence", "Johann Wolfgang von Goethe|1749|1832|a German poet and writer", "Marie Antoinette|1755|1793|the queen of France during the French Revolution",
    "Wolfgang Amadeus Mozart|1756|1791|an Austrian composer", "Napoleon Bonaparte|1769|1821|the Emperor of the French", "Ludwig van Beethoven|1770|1827|a German composer", "Jane Austen|1775|1817|an English novelist who wrote Pride and Prejudice",
    "Simon Bolivar|1783|1830|a South American leader who helped win independence from Spain", "Michael Faraday|1791|1867|an English scientist who discovered electromagnetic induction", "Charles Babbage|1791|1871|an English mathematician who designed early mechanical computers",
    "Franz Schubert|1797|1828|an Austrian composer", "Victor Hugo|1802|1885|a French novelist who wrote Les Miserables", "Isambard Kingdom Brunel|1806|1859|a British engineer who built bridges, ships and railways", "Frederic Chopin|1810|1849|a Polish composer and pianist",
    "Abraham Lincoln|1809|1865|the sixteenth president of the United States", "Charles Darwin|1809|1882|an English naturalist who proposed evolution by natural selection", "Edgar Allan Poe|1809|1849|an American writer of mystery and horror stories",
    "Charles Dickens|1812|1870|an English novelist who wrote Oliver Twist and A Christmas Carol", "Giuseppe Verdi|1813|1901|an Italian opera composer", "Richard Wagner|1813|1883|a German opera composer", "Ada Lovelace|1815|1852|an English mathematician who wrote the first computer program",
    "Karl Marx|1818|1883|a German philosopher who wrote The Communist Manifesto", "Queen Victoria|1819|1901|the queen of the United Kingdom for over sixty years", "Florence Nightingale|1820|1910|a British nurse who founded modern nursing",
    "Fyodor Dostoevsky|1821|1881|a Russian novelist who wrote Crime and Punishment", "Louis Pasteur|1822|1895|a French chemist who developed vaccines and pasteurisation", "Gregor Mendel|1822|1884|an Austrian monk who founded the study of genetics",
    "Leo Tolstoy|1828|1910|a Russian novelist who wrote War and Peace", "Emily Dickinson|1830|1886|an American poet", "Johannes Brahms|1833|1897|a German composer", "Dmitri Mendeleev|1834|1907|a Russian chemist who created the periodic table",
    "Mark Twain|1835|1910|an American writer who wrote Tom Sawyer and Huckleberry Finn", "Andrew Carnegie|1835|1919|a Scottish-American steel industrialist and philanthropist", "Claude Monet|1840|1926|a French painter and founder of Impressionism",
    "Pyotr Tchaikovsky|1840|1893|a Russian composer who wrote Swan Lake", "Thomas Edison|1847|1931|an American inventor of the phonograph and a practical electric light bulb", "Alexander Graham Bell|1847|1922|a Scottish-born inventor of the telephone",
    "Vincent van Gogh|1853|1890|a Dutch painter who painted The Starry Night", "Oscar Wilde|1854|1900|an Irish writer and playwright", "Nikola Tesla|1856|1943|a Serbian-American inventor who worked on alternating current", "Sigmund Freud|1856|1939|an Austrian founder of psychoanalysis",
    "Claude Debussy|1862|1918|a French composer", "Henry Ford|1863|1947|an American industrialist who made cars affordable with the assembly line", "Marie Curie|1867|1934|a Polish-French physicist and chemist who discovered polonium and radium",
    "Wilbur Wright|1867|1912|an American aviation pioneer who, with his brother, made the first powered flight", "Orville Wright|1871|1948|an American aviation pioneer who, with his brother, made the first powered flight", "Mahatma Gandhi|1869|1948|the leader of India's non-violent independence movement",
    "Guglielmo Marconi|1874|1937|an Italian inventor who developed radio communication", "Winston Churchill|1874|1965|the British prime minister during most of World War II", "Albert Einstein|1879|1955|a German-born physicist who developed the theory of relativity",
    "Joseph Stalin|1878|1953|the leader of the Soviet Union", "Alexander Fleming|1881|1955|a Scottish scientist who discovered penicillin", "Pablo Picasso|1881|1973|a Spanish painter who co-founded Cubism", "Franklin D. Roosevelt|1882|1945|the thirty-second president of the United States",
    "Franz Kafka|1883|1924|a Czech-born writer who wrote The Trial and The Metamorphosis", "Edwin Hubble|1889|1953|an American astronomer who showed that the universe is expanding", "Adolf Hitler|1889|1945|the leader of Nazi Germany", "Charlie Chaplin|1889|1977|an English comic actor and filmmaker",
    "Ernest Hemingway|1899|1961|an American novelist who wrote The Old Man and the Sea", "Walt Disney|1901|1966|an American animator and founder of the Disney company", "Frida Kahlo|1907|1954|a Mexican painter known for her self-portraits",
    "Alan Turing|1912|1954|a British mathematician and a founder of computer science", "Rosa Parks|1913|2005|an American civil rights activist", "John F. Kennedy|1917|1963|the thirty-fifth president of the United States", "Nelson Mandela|1918|2013|the first Black president of South Africa",
    "Mother Teresa|1910|1997|an Albanian-born nun who cared for the poor in Calcutta", "Elvis Presley|1935|1977|an American singer called the King of Rock and Roll", "Martin Luther King Jr.|1929|1968|an American civil rights leader", "Anne Frank|1929|1945|a Jewish girl whose diary described hiding from the Nazis in Amsterdam",
    "Stephen Hawking|1942|2018|a British physicist who wrote A Brief History of Time", "Steve Jobs|1955|2011|an American co-founder of Apple"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push(p[0] + " lived from " + p[1] + " to " + p[2] + " and was " + p[3] + ".");
  });

  /* builders and creators of places and works, which questions ask for by "which civilization built ..." */
  out.push("The Inca civilization built Machu Picchu in the Andes of Peru in the fifteenth century.");
  out.push("The Maya civilization built Chichen Itza on the Yucatan Peninsula of Mexico.");
  out.push("The ancient Egyptians built the pyramids of Giza as tombs for their pharaohs.");
  out.push("The ancient Romans built the Colosseum in Rome, which opened in 80 CE.");
  out.push("The ancient Greeks built the Parthenon on the Acropolis in Athens.");
  out.push("The Aztecs built their capital Tenochtitlan on an island in a lake, where Mexico City now stands.");
  out.push("The Mughal emperor Shah Jahan built the Taj Mahal in Agra, India, as a tomb for his wife Mumtaz Mahal.");
  out.push("The Khmer Empire built Angkor Wat in Cambodia in the twelfth century.");
  out.push("The Nabataeans carved the city of Petra into the rock in what is now Jordan.");
  out.push("Several Chinese dynasties built and rebuilt the Great Wall of China over many centuries to defend against invaders.");
  out.push("The Moai statues of Easter Island were carved by the Rapa Nui people.");
  out.push("Stonehenge is a prehistoric stone circle in England built in stages from about 3000 BCE.");
  out.push("The Eiffel Tower was built by the engineer Gustave Eiffel's company for the 1889 World's Fair in Paris.");
  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
