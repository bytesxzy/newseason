/* History, inventions and people, second wave. Each line is a sentence that
 * stands on its own, so a question can reach it by any of the things it says. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];

  /* dated events: clause | year | aside */
  [
    "The Great Pyramid of Giza was built for the pharaoh Khufu|around 2560 BCE|", "The first ancient Olympic Games were held at Olympia in Greece|776 BCE|", "Rome was traditionally founded|753 BCE|",
    "The Battle of Marathon, a Greek victory over Persia, was fought|490 BCE|", "Socrates was put to death in Athens|399 BCE|", "Alexander the Great died in Babylon|323 BCE|", "Julius Caesar was assassinated in Rome|44 BCE|on the Ides of March",
    "Augustus became the first Roman emperor|27 BCE|", "Mount Vesuvius erupted and buried Pompeii and Herculaneum|79 CE|", "The Western Roman Empire fell when Romulus Augustulus was deposed|476 CE|",
    "Muhammad's journey from Mecca to Medina, the Hijra, took place|622 CE|and marks the start of the Islamic calendar", "Charlemagne was crowned emperor by the pope|800 CE|", "The Norman conquest of England began with the Battle of Hastings|1066|when William of Normandy defeated King Harold",
    "The First Crusade began|1096|", "Genghis Khan founded the Mongol Empire|1206|", "Magna Carta was sealed by King John of England|1215|", "Marco Polo returned to Venice from China|1295|", "The Black Death began to sweep through Europe|1347|and killed about a third of the population",
    "Joan of Arc was burned at the stake|1431|", "Johannes Gutenberg developed the printing press with movable type in Europe|around 1440|", "Constantinople fell to the Ottoman Turks|1453|ending the Byzantine Empire",
    "Christopher Columbus reached the Americas|1492|", "Vasco da Gama reached India by sea|1498|", "Martin Luther posted his Ninety-five Theses, beginning the Protestant Reformation|1517|", "Magellan's expedition began the first voyage around the world|1519|and completed it in 1522",
    "Hernan Cortes conquered the Aztec Empire|1521|", "Francisco Pizarro conquered the Inca Empire|1533|", "Copernicus published his theory that the Earth orbits the Sun|1543|", "The English fleet defeated the Spanish Armada|1588|",
    "Jamestown, the first permanent English settlement in America, was founded|1607|", "The Pilgrims arrived on the Mayflower at Plymouth|1620|", "Galileo was tried by the Inquisition|1633|", "The Thirty Years' War ended with the Peace of Westphalia|1648|",
    "King Charles I of England was executed|1649|", "The Great Fire of London destroyed much of the city|1666|", "Isaac Newton published the Principia, setting out the laws of motion and gravity|1687|", "The Glorious Revolution made William and Mary monarchs of England|1688|",
    "Peter the Great founded Saint Petersburg|1703|", "England and Scotland were united by the Act of Union|1707|", "James Watt patented his improved steam engine|1769|", "Captain James Cook began his first voyage to the Pacific|1768|",
    "Adam Smith published The Wealth of Nations|1776|", "The United States Declaration of Independence was adopted on 4 July|1776|", "The American Revolutionary War ended with the Treaty of Paris|1783|", "The United States Constitution was signed|1787|",
    "George Washington became the first president of the United States|1789|", "The French Revolution began with the storming of the Bastille on 14 July|1789|", "King Louis XVI of France was executed|1793|", "Napoleon Bonaparte seized power in France|1799|",
    "The United States bought the Louisiana Territory from France|1803|", "Napoleon crowned himself Emperor of the French|1804|", "The Battle of Trafalgar was won by Admiral Nelson|1805|", "Napoleon invaded Russia|1812|", "Napoleon was defeated at the Battle of Waterloo|1815|",
    "Mexico won independence from Spain|1821|", "Brazil declared independence from Portugal|1822|", "The first public steam railway, the Stockton and Darlington, opened in England|1825|", "Slavery was abolished throughout the British Empire|1833|",
    "Queen Victoria came to the throne|1837|", "The Irish Potato Famine began|1845|", "Karl Marx and Friedrich Engels published The Communist Manifesto|1848|", "The California Gold Rush began|1848|", "Charles Darwin published On the Origin of Species|1859|",
    "The American Civil War began with the attack on Fort Sumter|1861|", "President Lincoln issued the Emancipation Proclamation|1863|", "The Battle of Gettysburg was fought|1863|", "Abraham Lincoln was assassinated by John Wilkes Booth|1865|",
    "The American Civil War ended with the surrender of the Confederacy at Appomattox|1865|", "The Suez Canal opened|1869|", "The first US transcontinental railroad was completed|1869|", "Dmitri Mendeleev published his periodic table|1869|",
    "Germany was unified under Prussian leadership|1871|", "Alexander Graham Bell patented the telephone|1876|", "Thomas Edison demonstrated a practical electric light bulb|1879|", "Karl Benz built the first practical petrol-powered automobile|1885|",
    "The Statue of Liberty was dedicated in New York Harbor|1886|", "The Eiffel Tower was completed for the Paris World's Fair|1889|", "The first modern Olympic Games were held in Athens|1896|", "Marie and Pierre Curie discovered polonium and radium|1898|",
    "The Wright brothers made the first powered airplane flight at Kitty Hawk|1903|", "Albert Einstein published his special theory of relativity|1905|", "The Titanic sank after hitting an iceberg on its maiden voyage|1912|", "The Panama Canal opened|1914|",
    "World War I began after the assassination of Archduke Franz Ferdinand in Sarajevo|1914|", "The Russian Revolution brought the Bolsheviks to power|1917|", "World War I ended with the armistice on 11 November|1918|", "The Treaty of Versailles was signed|1919|",
    "American women gained the right to vote with the 19th Amendment|1920|", "The Soviet Union was formed|1922|", "Howard Carter discovered the tomb of Tutankhamun|1922|", "Charles Lindbergh flew solo across the Atlantic|1927|", "Alexander Fleming discovered penicillin|1928|",
    "The Wall Street Crash began the Great Depression|1929|", "Adolf Hitler became chancellor of Germany|1933|", "The Spanish Civil War began|1936|", "World War II began when Germany invaded Poland on 1 September|1939|",
    "Japan attacked Pearl Harbor on 7 December, bringing the United States into World War II|1941|", "The Battle of Stalingrad turned the tide of the war on the Eastern Front|1942|", "The Allied D-Day landings in Normandy took place on 6 June|1944|",
    "Victory in Europe was declared on 8 May|1945|", "Atomic bombs were dropped on Hiroshima and Nagasaki|1945|", "World War II ended when Japan surrendered|1945|", "The United Nations was founded|1945|", "India and Pakistan gained independence from Britain|1947|",
    "The state of Israel was founded|1948|", "The Universal Declaration of Human Rights was adopted|1948|", "NATO was founded|1949|", "The People's Republic of China was proclaimed by Mao Zedong|1949|", "The Korean War began when North Korea invaded South Korea|1950|",
    "Queen Elizabeth II came to the throne|1952|", "Watson and Crick described the double helix structure of DNA|1953|", "Edmund Hillary and Tenzing Norgay reached the summit of Mount Everest|1953|", "The Supreme Court ruled in Brown v. Board of Education|1954|",
    "The Soviet Union launched Sputnik, the first artificial satellite|1957|", "Yuri Gagarin became the first human in space|1961|", "The Berlin Wall was built|1961|", "The Cuban Missile Crisis brought the United States and Soviet Union close to nuclear war|1962|",
    "President John F. Kennedy was assassinated in Dallas|1963|", "Martin Luther King Jr. delivered his I Have a Dream speech|1963|", "The Civil Rights Act was signed into law in the United States|1964|", "Martin Luther King Jr. was assassinated in Memphis|1968|",
    "Neil Armstrong and Buzz Aldrin landed on the Moon with Apollo 11 on 20 July|1969|", "President Richard Nixon resigned because of the Watergate scandal|1974|", "The Vietnam War ended when Saigon fell|1975|", "Apple was founded by Steve Jobs, Steve Wozniak and Ronald Wayne|1976|",
    "The Iranian Revolution overthrew the Shah|1979|", "Margaret Thatcher became the first woman prime minister of the United Kingdom|1979|", "The Falklands War was fought between Britain and Argentina|1982|", "The Chernobyl nuclear disaster occurred|1986|",
    "The Space Shuttle Challenger exploded after launch|1986|", "The Berlin Wall fell on 9 November|1989|", "Tim Berners-Lee proposed the World Wide Web|1989|", "Nelson Mandela was released from prison|1990|", "East and West Germany were reunified|1990|",
    "The Soviet Union was dissolved|1991|", "Nelson Mandela became the first Black president of South Africa|1994|", "Dolly the sheep, the first cloned mammal, was born|1996|", "Hong Kong was handed over from Britain to China|1997|", "Google was founded|1998|",
    "The euro was introduced as a currency|1999|", "Wikipedia was launched|2001|", "The September 11 attacks struck the World Trade Center and the Pentagon|2001|", "Euro notes and coins entered circulation|2002|", "The Human Genome Project was completed|2003|",
    "Facebook was launched|2004|", "YouTube was founded|2005|", "Apple released the first iPhone|2007|", "The global financial crisis began|2008|", "Barack Obama was elected the first Black president of the United States|2008|", "The Fukushima nuclear accident followed a huge earthquake and tsunami in Japan|2011|",
    "The Higgs boson was discovered at CERN|2012|", "The United Kingdom voted to leave the European Union in the Brexit referendum|2016|", "The World Health Organization declared COVID-19 a pandemic|2020|", "Russia launched a full-scale invasion of Ukraine|2022|",
    "Queen Elizabeth II died after a reign of seventy years|2022|", "King Charles III was crowned|2023|"
  ].forEach(function (row) {
    var p = row.split("|"), dm = p[0].match(/^(.*?) on (\d{1,2} [A-Z][a-z]+)(.*)$/);
    if (dm) out.push(dm[1] + dm[3] + " in " + p[1] + ", on " + dm[2] + (p[2] ? ", " + p[2] : "") + ".");
    else out.push(p[0] + " in " + p[1] + (p[2] ? ", " + p[2] : "") + ".");
  });
  out.push("The Berlin Wall fell in 1989, ending the division of East and West Berlin, and Germany was reunified the next year.");
  out.push("In 1989 the Berlin Wall came down.");
  out.push("The year the Berlin Wall fell was 1989.");
  out.push("The Berlin Wall divided East Berlin from West Berlin from 1961 until 1989.");
  out.push("World War II lasted from 1939 to 1945, and World War I lasted from 1914 to 1918.");
  out.push("World War I was fought from 1914 to 1918 between the Allied Powers and the Central Powers.");
  out.push("World War II was fought from 1939 to 1945 between the Allies and the Axis powers of Germany, Italy and Japan.");
  out.push("The American Civil War, fought from 1861 to 1865 between the Northern states (the Union) and the Southern states (the Confederacy), ended slavery in the United States.");
  out.push("The war fought between the North and the South of the United States was the American Civil War.");
  out.push("The Union, or the North, defeated the Confederacy, or the South, in the American Civil War.");
  out.push("The American Revolutionary War was fought from 1775 to 1783 between Britain and its thirteen American colonies.");
  out.push("The Cold War was a long period of tension between the United States and the Soviet Union from about 1947 to 1991, without direct fighting between them.");
  out.push("The Hundred Years' War was fought between England and France from 1337 to 1453.");
  out.push("The Wars of the Roses were fought in England between the houses of Lancaster and York from 1455 to 1487.");
  out.push("The Napoleonic Wars were fought between France and a series of European coalitions from 1803 to 1815.");
  out.push("The Vietnam War was fought from 1955 to 1975 between communist North Vietnam and South Vietnam, which was backed by the United States.");
  out.push("The Korean War was fought from 1950 to 1953 between North Korea, backed by China and the Soviet Union, and South Korea, backed by the United Nations and the United States.");
  out.push("The Crimean War was fought from 1853 to 1856 between Russia and an alliance of Britain, France and the Ottoman Empire.");
  out.push("The Peloponnesian War was fought between Athens and Sparta from 431 to 404 BCE.");
  out.push("The Punic Wars were fought between Rome and Carthage.");
  out.push("The Gulf War of 1991 was fought after Iraq invaded Kuwait.");
  out.push("The Renaissance was a period of renewed interest in art and learning that began in Italy in the 14th century.");
  out.push("The Industrial Revolution began in Britain in the late 18th century and moved production from hand tools to machines and factories.");
  out.push("The Enlightenment was an 18th-century movement that stressed reason, science and individual rights.");
  out.push("The Reformation was the 16th-century movement that split Western Christianity and produced Protestant churches.");
  out.push("The Middle Ages lasted from about 500 to 1500 in Europe.");
  out.push("The Roman Empire at its greatest extent, around 117 CE, ruled the whole Mediterranean world.");
  out.push("The Ottoman Empire lasted from about 1299 until 1922.");
  out.push("The Byzantine Empire was the eastern continuation of the Roman Empire, with its capital at Constantinople, and it lasted until 1453.");
  out.push("The Aztec Empire was based at Tenochtitlan, the site of modern Mexico City, and the Inca Empire was centred on Cusco in Peru.");
  out.push("The ancient Egyptians built pyramids as tombs for their pharaohs and wrote in hieroglyphs.");
  out.push("The ancient Greeks invented democracy in Athens and held the first Olympic Games.");
  out.push("The Mayan civilization of Central America built cities with stepped pyramids and developed an advanced calendar.");
  out.push("The Silk Road was a network of trade routes linking China with the Mediterranean.");
  out.push("The Great Wall of China was built over many centuries, mostly to protect against invasions from the north.");
  out.push("The Rosetta Stone, found in 1799, let scholars decipher Egyptian hieroglyphs.");
  out.push("The Cold War ended with the fall of the Berlin Wall in 1989 and the collapse of the Soviet Union in 1991.");
  out.push("The first humans to fly were the Montgolfier brothers in a hot-air balloon in 1783, and the first powered flight was by the Wright brothers in 1903.");

  /* invention | inventor or discoverer | year */
  [
    "telephone|Alexander Graham Bell|1876", "light bulb|Thomas Edison|1879", "airplane|the Wright brothers|1903", "radio|Guglielmo Marconi|1895", "penicillin|Alexander Fleming|1928", "printing press|Johannes Gutenberg|around 1440",
    "steam engine|James Watt (improving on Thomas Newcomen's design)|1769", "dynamite|Alfred Nobel|1867", "vaccination|Edward Jenner|1796", "X-rays|Wilhelm Rontgen|1895", "radioactivity|Henri Becquerel|1896", "electromagnetic induction|Michael Faraday|1831",
    "telegraph|Samuel Morse|1837", "phonograph|Thomas Edison|1877", "cotton gin|Eli Whitney|1793", "sewing machine|Elias Howe|1846", "the electric battery|Alessandro Volta|1800", "the periodic table|Dmitri Mendeleev|1869", "the theory of evolution by natural selection|Charles Darwin|1859",
    "the laws of motion and universal gravitation|Isaac Newton|1687", "the theory of general relativity|Albert Einstein|1915", "the double helix structure of DNA|James Watson and Francis Crick|1953", "the World Wide Web|Tim Berners-Lee|1989", "the first programmable computer design, the Analytical Engine|Charles Babbage|1837",
    "the transistor|John Bardeen, Walter Brattain and William Shockley|1947", "the integrated circuit|Jack Kilby and Robert Noyce|1958", "the polio vaccine|Jonas Salk|1955", "the pasteurisation process|Louis Pasteur|1860s", "the safety razor|King Camp Gillette|1901", "the zipper|Whitcomb Judson|1893",
    "the helicopter|Igor Sikorsky|1939", "the jet engine|Frank Whittle|1930", "the television|John Logie Baird|1926", "the telescope in astronomy|Galileo Galilei|1609", "the microscope|Antonie van Leeuwenhoek|1670s", "the thermometer|Daniel Fahrenheit|1714",
    "the lightning rod|Benjamin Franklin|1752", "the bifocal lens|Benjamin Franklin|1780s", "the bicycle with pedals|Kirkpatrick Macmillan|1839", "the assembly line for cars|Henry Ford|1913", "the first email program|Ray Tomlinson|1971", "the graphical web browser Mosaic|Marc Andreessen and Eric Bina|1993",
    "the Linux kernel|Linus Torvalds|1991", "the Python language|Guido van Rossum|1991", "the C language|Dennis Ritchie|1972", "the Java language|James Gosling|1995", "the JavaScript language|Brendan Eich|1995", "the first mechanical calculator|Blaise Pascal|1642",
    "calculus|Isaac Newton and Gottfried Leibniz independently|1600s", "the discovery of the electron|J. J. Thomson|1897", "the discovery of the neutron|James Chadwick|1932", "the nucleus of the atom|Ernest Rutherford|1911", "the quantum theory of energy|Max Planck|1900",
    "the discovery of insulin|Frederick Banting and Charles Best|1921", "the theory of continental drift|Alfred Wegener|1912", "the heliocentric model of the solar system|Nicolaus Copernicus|1543", "the laws of planetary motion|Johannes Kepler|1609",
    "the fax machine|Alexander Bain|1843", "the revolver|Samuel Colt|1836", "the parachute design|Leonardo da Vinci sketched one and Louis-Sebastien Lenormand demonstrated one|1783", "the first practical submarine|Cornelius Drebbel|1620", "the barometer|Evangelista Torricelli|1643",
    "the wheel|Mesopotamians|around 3500 BCE", "paper|the Chinese, traditionally credited to Cai Lun|around 105 CE", "gunpowder|the Chinese|around the 9th century", "the compass|the Chinese|around the 11th century", "the mechanical clock|medieval European craftsmen|around the 13th century"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push(p[0].charAt(0).toUpperCase() + p[0].slice(1) + " was invented or discovered by " + p[1] + " in " + p[2] + ".");
    out.push("The inventor of " + p[0] + " was " + p[1] + ".");
    out.push("Who invented " + p[0] + "? It was " + p[1] + ", in " + p[2] + ".");
  });
  out.push("Alexander Graham Bell invented the telephone.");
  out.push("Thomas Edison invented the practical electric light bulb, the phonograph and many other devices.");
  out.push("The Wright brothers, Orville and Wilbur, invented the airplane.");
  out.push("Johannes Gutenberg invented the printing press.");
  out.push("Alexander Fleming discovered penicillin, the first antibiotic, in 1928.");
  out.push("Isaac Newton discovered the laws of motion and gravity.");
  out.push("Albert Einstein developed the theory of relativity.");
  out.push("Charles Darwin developed the theory of evolution by natural selection.");
  out.push("Marie Curie discovered the elements polonium and radium.");
  out.push("Louis Pasteur developed pasteurisation and vaccines for rabies and anthrax.");
  out.push("Gregor Mendel, an Austrian monk, founded the study of genetics through his experiments on pea plants.");
  out.push("Galileo Galilei used the telescope to discover the moons of Jupiter.");
  out.push("Nikola Tesla developed the alternating current electrical system.");
  out.push("Tim Berners-Lee invented the World Wide Web.");
  out.push("Bill Gates and Paul Allen founded Microsoft in 1975.");
  out.push("Steve Jobs, Steve Wozniak and Ronald Wayne founded Apple in 1976.");
  out.push("Larry Page and Sergey Brin founded Google in 1998.");
  out.push("Jeff Bezos founded Amazon in 1994.");
  out.push("Mark Zuckerberg founded Facebook in 2004.");
  out.push("Elon Musk founded SpaceX in 2002 and helped found Tesla.");
  out.push("Henry Ford founded the Ford Motor Company and introduced the moving assembly line.");
  out.push("Walt Disney co-founded the Disney company and created Mickey Mouse.");
  out.push("The first person to reach the South Pole was Roald Amundsen in 1911.");
  out.push("The first person to fly solo across the Atlantic Ocean was Charles Lindbergh in 1927.");
  out.push("The first woman to fly solo across the Atlantic was Amelia Earhart in 1932.");
  out.push("The first person in space was Yuri Gagarin of the Soviet Union in 1961.");
  out.push("The first woman in space was Valentina Tereshkova of the Soviet Union in 1963.");
  out.push("The first American in space was Alan Shepard in 1961, and the first American to orbit the Earth was John Glenn in 1962.");
  out.push("The first person to walk on the Moon was Neil Armstrong on 20 July 1969, followed by Buzz Aldrin.");
  out.push("Neil Armstrong was the first person to walk on the Moon.");
  out.push("The first artificial satellite was Sputnik 1, launched by the Soviet Union in 1957.");
  out.push("The first person to sail around the world was part of Magellan's expedition; Juan Sebastian Elcano completed the voyage in 1522.");
  out.push("Edmund Hillary and Tenzing Norgay were the first to climb Mount Everest.");
  out.push("Christopher Columbus sailed from Spain and reached the Americas in 1492.");
  out.push("Vasco da Gama was the first European to reach India by sea.");
  out.push("James Cook explored the Pacific and was the first European to map the east coast of Australia.");
  out.push("Leif Erikson, a Norse explorer, reached North America around the year 1000.");
  out.push("Marco Polo travelled from Venice to China in the 13th century.");
  out.push("Ferdinand Magellan led the first expedition to sail around the world.");
  out.push("Roald Amundsen led the first expedition to reach the South Pole, beating Robert Falcon Scott by about a month.");
  out.push("The first president of the United States was George Washington.");
  out.push("The sixteenth president of the United States was Abraham Lincoln, who led the Union during the Civil War.");
  out.push("The first woman to win a Nobel Prize was Marie Curie, in Physics in 1903.");
  out.push("Marie Curie is the only person to win Nobel Prizes in two different sciences, Physics in 1903 and Chemistry in 1911.");
  out.push("Albert Einstein won the Nobel Prize in Physics in 1921 for his explanation of the photoelectric effect.");
  out.push("Alexander Fleming, Howard Florey and Ernst Chain shared the Nobel Prize in Medicine in 1945 for penicillin.");
  out.push("Nelson Mandela and F. W. de Klerk shared the Nobel Peace Prize in 1993.");
  out.push("Malala Yousafzai became the youngest Nobel Prize winner, at 17, when she won the Peace Prize in 2014.");
  out.push("Barack Obama won the Nobel Peace Prize in 2009.");
  out.push("Martin Luther King Jr. won the Nobel Peace Prize in 1964.");
  out.push("Mother Teresa won the Nobel Peace Prize in 1979.");
  out.push("Winston Churchill won the Nobel Prize in Literature in 1953.");
  out.push("Ernest Hemingway won the Nobel Prize in Literature in 1954.");
  out.push("Bob Dylan won the Nobel Prize in Literature in 2016.");
  out.push("Rabindranath Tagore was the first non-European to win the Nobel Prize in Literature, in 1913.");
  out.push("The Nobel Prizes were established by the will of Alfred Nobel, the inventor of dynamite, and are awarded in Stockholm and Oslo.");
  out.push("The Nobel Prize categories are Physics, Chemistry, Medicine, Literature, Peace and Economic Sciences.");
  out.push("The Pulitzer Prize is awarded for achievements in journalism, literature and music.");
  out.push("The Oscars are the Academy Awards for achievement in film.");
  out.push("The Fields Medal is the highest honour in mathematics and is awarded every four years.");
  out.push("The Turing Award is the highest honour in computer science.");

  /* people: name | born | died | known for */
  [
    "Leonardo da Vinci|1452|1519|the Mona Lisa, The Last Supper and notebooks full of inventions", "Michelangelo|1475|1564|painting the ceiling of the Sistine Chapel and sculpting David", "Galileo Galilei|1564|1642|pioneering the use of the telescope in astronomy",
    "William Shakespeare|1564|1616|writing plays such as Hamlet, Macbeth and Romeo and Juliet", "Isaac Newton|1643|1727|the laws of motion and universal gravitation", "Wolfgang Amadeus Mozart|1756|1791|composing symphonies, operas and concertos",
    "Ludwig van Beethoven|1770|1827|composing nine symphonies despite becoming deaf", "Johann Sebastian Bach|1685|1750|baroque music such as the Brandenburg Concertos", "Napoleon Bonaparte|1769|1821|becoming Emperor of the French and conquering much of Europe",
    "George Washington|1732|1799|leading the American army and serving as the first US president", "Abraham Lincoln|1809|1865|leading the United States through the Civil War and ending slavery", "Charles Darwin|1809|1882|the theory of evolution by natural selection",
    "Queen Victoria|1819|1901|reigning over the British Empire from 1837 to 1901", "Karl Marx|1818|1883|writing The Communist Manifesto and Das Kapital", "Vincent van Gogh|1853|1890|paintings such as Starry Night and Sunflowers",
    "Pablo Picasso|1881|1973|co-founding Cubism and painting Guernica", "Albert Einstein|1879|1955|the theory of relativity and the equation E = mc squared", "Marie Curie|1867|1934|pioneering research on radioactivity",
    "Mahatma Gandhi|1869|1948|leading India's nonviolent struggle for independence", "Winston Churchill|1874|1965|leading Britain through World War II", "Mohandas Gandhi|1869|1948|nonviolent resistance", "Nikola Tesla|1856|1943|alternating current electricity",
    "Thomas Edison|1847|1931|inventing the practical light bulb and the phonograph", "Alexander Graham Bell|1847|1922|inventing the telephone", "Sigmund Freud|1856|1939|founding psychoanalysis", "Mother Teresa|1910|1997|caring for the poor in Kolkata",
    "Nelson Mandela|1918|2013|fighting apartheid and becoming South Africa's first Black president", "Martin Luther King Jr.|1929|1968|leading the American civil rights movement", "Cleopatra|69 BCE|30 BCE|ruling Egypt as its last active pharaoh",
    "Julius Caesar|100 BCE|44 BCE|conquering Gaul and becoming dictator of Rome", "Alexander the Great|356 BCE|323 BCE|building an empire from Greece to India", "Genghis Khan|1162|1227|founding the Mongol Empire", "Socrates|470 BCE|399 BCE|founding Western philosophy through questioning",
    "Plato|428 BCE|348 BCE|writing The Republic and founding the Academy", "Aristotle|384 BCE|322 BCE|studying logic, biology and politics and tutoring Alexander the Great", "Confucius|551 BCE|479 BCE|teaching ethics and good government in China",
    "Muhammad|570 CE|632 CE|founding Islam", "Joan of Arc|1412|1431|leading French armies against the English", "Christopher Columbus|1451|1506|sailing to the Americas in 1492", "Elizabeth I|1533|1603|ruling England during its Golden Age",
    "Louis Pasteur|1822|1895|pasteurisation and vaccines", "Florence Nightingale|1820|1910|founding modern nursing", "Frida Kahlo|1907|1954|self-portraits and Mexican folk art", "Walt Disney|1901|1966|animation and theme parks",
    "Stephen Hawking|1942|2018|work on black holes and the book A Brief History of Time", "Rosa Parks|1913|2005|refusing to give up her bus seat in Montgomery in 1955", "Anne Frank|1929|1945|the diary she kept while hiding from the Nazis in Amsterdam",
    "Mozart|1756|1791|child prodigy and composer of The Magic Flute", "Elvis Presley|1935|1977|rock and roll, nicknamed the King", "John Lennon|1940|1980|co-founding the Beatles", "Michael Jackson|1958|2009|pop music, including the album Thriller",
    "Muhammad Ali|1942|2016|being three times world heavyweight boxing champion", "Pele|1940|2022|winning three World Cups with Brazil", "Steve Jobs|1955|2011|co-founding Apple", "Ada Lovelace|1815|1852|writing what is considered the first computer program",
    "Alan Turing|1912|1954|breaking the Enigma code and founding computer science", "Isaac Asimov|1920|1992|science fiction such as the Foundation series and the three laws of robotics", "Jane Austen|1775|1817|novels such as Pride and Prejudice",
    "Charles Dickens|1812|1870|novels such as Oliver Twist and A Christmas Carol", "Mark Twain|1835|1910|The Adventures of Tom Sawyer and Huckleberry Finn", "Leo Tolstoy|1828|1910|War and Peace and Anna Karenina", "Homer|8th century BCE|unknown|the epic poems the Iliad and the Odyssey",
    "Dante Alighieri|1265|1321|The Divine Comedy", "Miguel de Cervantes|1547|1616|Don Quixote", "Victor Hugo|1802|1885|Les Miserables and The Hunchback of Notre-Dame", "Fyodor Dostoevsky|1821|1881|Crime and Punishment and The Brothers Karamazov",
    "Mary Shelley|1797|1851|writing Frankenstein", "Edgar Allan Poe|1809|1849|The Raven and detective fiction", "J. R. R. Tolkien|1892|1973|The Hobbit and The Lord of the Rings", "Agatha Christie|1890|1976|detective novels featuring Hercule Poirot and Miss Marple",
    "Ernest Hemingway|1899|1961|The Old Man and the Sea", "George Orwell|1903|1950|Animal Farm and Nineteen Eighty-Four", "Maya Angelou|1928|2014|the memoir I Know Why the Caged Bird Sings", "Albert Camus|1913|1960|The Stranger",
    "Sun Tzu|544 BCE|496 BCE|writing The Art of War", "Charlemagne|748|814|uniting much of Western Europe as emperor", "Henry VIII|1491|1547|breaking with the Catholic Church and marrying six times", "Catherine the Great|1729|1796|ruling Russia and expanding its empire",
    "Peter the Great|1672|1725|modernising Russia and founding Saint Petersburg", "Simon Bolivar|1783|1830|leading South American independence movements", "Napoleon III|1808|1873|ruling France as emperor", "Otto von Bismarck|1815|1898|unifying Germany",
    "Vladimir Lenin|1870|1924|leading the Bolshevik Revolution", "Joseph Stalin|1878|1953|ruling the Soviet Union", "Mao Zedong|1893|1976|leading the Chinese Communist revolution", "Adolf Hitler|1889|1945|leading Nazi Germany",
    "Franklin D. Roosevelt|1882|1945|the New Deal and leading the United States in World War II", "John F. Kennedy|1917|1963|being the 35th US president until his assassination", "Margaret Thatcher|1925|2013|being Britain's first woman prime minister", "Queen Elizabeth II|1926|2022|reigning for seventy years",
    "Barack Obama|1961|alive|being the 44th US president", "Pythagoras|570 BCE|495 BCE|the Pythagorean theorem", "Archimedes|287 BCE|212 BCE|the principle of buoyancy and the lever", "Euclid|300 BCE|265 BCE|writing Elements, the foundation of geometry",
    "Hippocrates|460 BCE|370 BCE|being called the father of medicine", "Ptolemy|100 CE|170 CE|his Earth-centred model of the universe", "Nicolaus Copernicus|1473|1543|proposing that the Earth orbits the Sun", "Johannes Kepler|1571|1630|the laws of planetary motion",
    "Rene Descartes|1596|1650|saying I think, therefore I am", "Carl Linnaeus|1707|1778|the system of naming species in two parts", "Michael Faraday|1791|1867|electromagnetism and electrochemistry", "James Clerk Maxwell|1831|1879|the equations of electromagnetism",
    "Dmitri Mendeleev|1834|1907|creating the periodic table", "Gregor Mendel|1822|1884|founding genetics with pea plants", "Ernest Rutherford|1871|1937|discovering the nucleus of the atom", "Niels Bohr|1885|1962|the model of the atom with electron shells",
    "Richard Feynman|1918|1988|quantum electrodynamics and teaching physics", "Rachel Carson|1907|1964|writing Silent Spring, which helped launch the environmental movement", "Jane Goodall|1934|alive|studying chimpanzees in Tanzania",
    "Jacques Cousteau|1910|1997|exploring the oceans", "Neil Armstrong|1930|2012|being the first person on the Moon", "Yuri Gagarin|1934|1968|being the first human in space", "Amelia Earhart|1897|1937|flying solo across the Atlantic and disappearing over the Pacific"
  ].forEach(function (row) {
    var p = row.split("|");
    var life = /alive/.test(p[2]) ? "was born in " + p[1] : "lived from " + p[1] + " to " + p[2];
    out.push(p[0] + " " + life + " and is known for " + p[3] + ".");
    if (!/alive|unknown/.test(p[2])) out.push(p[0] + " died in " + p[2] + ".");
    out.push(p[0] + " was born in " + p[1] + ".");
  });

  /* religion, mythology, holidays */
  out.push("Christianity is based on the teachings of Jesus Christ and its holy book is the Bible.");
  out.push("Islam is based on the teachings of the Prophet Muhammad and its holy book is the Quran.");
  out.push("Judaism is one of the oldest monotheistic religions and its holy book is the Torah.");
  out.push("Hinduism is an ancient religion of India whose texts include the Vedas and the Bhagavad Gita.");
  out.push("Buddhism was founded by Siddhartha Gautama, the Buddha, in India around the 5th century BCE.");
  out.push("Sikhism was founded by Guru Nanak in the Punjab region in the 15th century.");
  out.push("Christmas is celebrated on 25 December, Easter falls on a Sunday in spring, and Halloween is on 31 October.");
  out.push("Thanksgiving is celebrated on the fourth Thursday of November in the United States.");
  out.push("Independence Day in the United States is celebrated on 4 July.");
  out.push("Valentine's Day is celebrated on 14 February and St. Patrick's Day on 17 March.");
  out.push("New Year's Day is 1 January.");
  out.push("Diwali is the Hindu festival of lights, Eid al-Fitr ends the Muslim fast of Ramadan, and Hanukkah is the Jewish festival of lights.");
  out.push("Ramadan is the Muslim holy month in which Muslims fast from dawn to sunset.");
  out.push("Lunar New Year is celebrated in China and many other East Asian countries in January or February.");
  out.push("Zeus is the king of the gods in Greek mythology, Hera is his wife, Poseidon rules the sea, Hades rules the underworld and Athena is goddess of wisdom.");
  out.push("In Roman mythology Jupiter is the king of the gods, Juno is his wife, Neptune rules the sea and Mars is the god of war.");
  out.push("Thor is the Norse god of thunder and Odin is the chief of the Norse gods.");
  out.push("Ra was the ancient Egyptian sun god and Anubis the god of mummification and the dead.");
  out.push("The twelve labours were tasks performed by the Greek hero Hercules.");
  out.push("The Trojan Horse was a wooden horse used by the Greeks to enter and capture Troy.");
  out.push("The Minotaur was a monster, half man and half bull, that lived in the Labyrinth on Crete.");

  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
