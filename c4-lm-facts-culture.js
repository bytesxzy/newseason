/* Literature, art, music and film facts for the local fact library. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];

  /* work | author | year */
  ("Hamlet|William Shakespeare|around 1600;Macbeth|William Shakespeare|around 1606;Romeo and Juliet|William Shakespeare|around 1595;Othello|William Shakespeare|around 1604;" +
   "King Lear|William Shakespeare|around 1606;A Midsummer Night's Dream|William Shakespeare|around 1595;The Tempest|William Shakespeare|around 1611;" +
   "Pride and Prejudice|Jane Austen|1813;Emma|Jane Austen|1815;Sense and Sensibility|Jane Austen|1811;Persuasion|Jane Austen|1817;" +
   "Jane Eyre|Charlotte Bronte|1847;Wuthering Heights|Emily Bronte|1847;Great Expectations|Charles Dickens|1861;Oliver Twist|Charles Dickens|1838;" +
   "A Tale of Two Cities|Charles Dickens|1859;A Christmas Carol|Charles Dickens|1843;David Copperfield|Charles Dickens|1850;" +
   "1984|George Orwell|1949;Nineteen Eighty-Four|George Orwell|1949;Animal Farm|George Orwell|1945;Brave New World|Aldous Huxley|1932;" +
   "Moby-Dick|Herman Melville|1851;The Great Gatsby|F. Scott Fitzgerald|1925;To Kill a Mockingbird|Harper Lee|1960;The Catcher in the Rye|J. D. Salinger|1951;" +
   "The Adventures of Tom Sawyer|Mark Twain|1876;Adventures of Huckleberry Finn|Mark Twain|1884;The Scarlet Letter|Nathaniel Hawthorne|1850;" +
   "Little Women|Louisa May Alcott|1868;The Grapes of Wrath|John Steinbeck|1939;Of Mice and Men|John Steinbeck|1937;The Old Man and the Sea|Ernest Hemingway|1952;" +
   "A Farewell to Arms|Ernest Hemingway|1929;For Whom the Bell Tolls|Ernest Hemingway|1940;Frankenstein|Mary Shelley|1818;Dracula|Bram Stoker|1897;" +
   "The Strange Case of Dr Jekyll and Mr Hyde|Robert Louis Stevenson|1886;Treasure Island|Robert Louis Stevenson|1883;The Hobbit|J. R. R. Tolkien|1937;" +
   "The Lord of the Rings|J. R. R. Tolkien|1954;The Chronicles of Narnia|C. S. Lewis|1950;Alice's Adventures in Wonderland|Lewis Carroll|1865;" +
   "Through the Looking-Glass|Lewis Carroll|1871;Peter Pan|J. M. Barrie|1911;The Jungle Book|Rudyard Kipling|1894;Harry Potter and the Philosopher's Stone|J. K. Rowling|1997;" +
   "The Picture of Dorian Gray|Oscar Wilde|1890;The Importance of Being Earnest|Oscar Wilde|1895;Ulysses|James Joyce|1922;Dubliners|James Joyce|1914;" +
   "Mrs Dalloway|Virginia Woolf|1925;To the Lighthouse|Virginia Woolf|1927;Lord of the Flies|William Golding|1954;Fahrenheit 451|Ray Bradbury|1953;" +
   "Catch-22|Joseph Heller|1961;One Hundred Years of Solitude|Gabriel Garcia Marquez|1967;Love in the Time of Cholera|Gabriel Garcia Marquez|1985;" +
   "Don Quixote|Miguel de Cervantes|1605;The Divine Comedy|Dante Alighieri|around 1320;The Inferno|Dante Alighieri|around 1314;" +
   "The Canterbury Tales|Geoffrey Chaucer|around 1400;Paradise Lost|John Milton|1667;Beowulf|an unknown Anglo-Saxon poet|around 1000;" +
   "The Odyssey|Homer|around 700 BC;The Iliad|Homer|around 750 BC;The Aeneid|Virgil|19 BC;Metamorphoses|Ovid|AD 8;" +
   "Les Miserables|Victor Hugo|1862;The Hunchback of Notre-Dame|Victor Hugo|1831;The Count of Monte Cristo|Alexandre Dumas|1844;The Three Musketeers|Alexandre Dumas|1844;" +
   "Madame Bovary|Gustave Flaubert|1857;In Search of Lost Time|Marcel Proust|1913;The Stranger|Albert Camus|1942;The Little Prince|Antoine de Saint-Exupery|1943;" +
   "War and Peace|Leo Tolstoy|1869;Anna Karenina|Leo Tolstoy|1877;Crime and Punishment|Fyodor Dostoevsky|1866;The Brothers Karamazov|Fyodor Dostoevsky|1880;" +
   "The Idiot|Fyodor Dostoevsky|1869;Dead Souls|Nikolai Gogol|1842;Doctor Zhivago|Boris Pasternak|1957;The Master and Margarita|Mikhail Bulgakov|1967;" +
   "Faust|Johann Wolfgang von Goethe|1808;The Metamorphosis|Franz Kafka|1915;The Trial|Franz Kafka|1925;Siddhartha|Hermann Hesse|1922;" +
   "The Tale of Genji|Murasaki Shikibu|around 1010;The Arabian Nights|various anonymous authors|around 1500;Things Fall Apart|Chinua Achebe|1958;" +
   "The Color Purple|Alice Walker|1982;Beloved|Toni Morrison|1987;Invisible Man|Ralph Ellison|1952;The Handmaid's Tale|Margaret Atwood|1985;" +
   "Dune|Frank Herbert|1965;The Hitchhiker's Guide to the Galaxy|Douglas Adams|1979;Foundation|Isaac Asimov|1951;Neuromancer|William Gibson|1984;" +
   "The Call of the Wild|Jack London|1903;Walden|Henry David Thoreau|1854;Leaves of Grass|Walt Whitman|1855;The Raven|Edgar Allan Poe|1845;" +
   "The Waste Land|T. S. Eliot|1922;The Road Not Taken|Robert Frost|1916;Gulliver's Travels|Jonathan Swift|1726;Robinson Crusoe|Daniel Defoe|1719;" +
   "Candide|Voltaire|1759;The Social Contract|Jean-Jacques Rousseau|1762;Leviathan|Thomas Hobbes|1651;The Prince|Niccolo Machiavelli|1532;" +
   "The Republic|Plato|around 375 BC;Utopia|Thomas More|1516;On the Origin of Species|Charles Darwin|1859;A Brief History of Time|Stephen Hawking|1988;" +
   "The Wealth of Nations|Adam Smith|1776;The Communist Manifesto|Karl Marx and Friedrich Engels|1848;The Art of War|Sun Tzu|around 500 BC;" +
   "Charlotte's Web|E. B. White|1952;Where the Wild Things Are|Maurice Sendak|1963;The Cat in the Hat|Dr. Seuss|1957;Matilda|Roald Dahl|1988;" +
   "Charlie and the Chocolate Factory|Roald Dahl|1964;The Hunger Games|Suzanne Collins|2008;Twilight|Stephenie Meyer|2005;The Da Vinci Code|Dan Brown|2003").split(";").forEach(function (row) {
    var p = row.split("|");
    out.push(p[1] + " wrote " + p[0] + " in " + p[2] + ".");
    out.push(p[0] + " is a book written by the author " + p[1] + ".");
  });
  out.push("Shakespeare is widely regarded as the greatest writer in the English language.");
  out.push("William Shakespeare wrote Hamlet, Macbeth, Othello and King Lear, which are tragedies.");
  out.push("Harry Potter and the Philosopher's Stone was the first of the Harry Potter novels by J. K. Rowling.");
  out.push("J. K. Rowling wrote the Harry Potter books.");
  out.push("The Iliad and the Odyssey are two ancient Greek epic poems attributed to Homer.");
  out.push("Agatha Christie wrote detective novels such as Murder on the Orient Express and created the detective Hercule Poirot.");
  out.push("Arthur Conan Doyle created the detective Sherlock Holmes.");
  out.push("Sherlock Holmes is a fictional detective created by Arthur Conan Doyle who lives at 221B Baker Street.");
  out.push("Edgar Allan Poe wrote The Raven and The Tell-Tale Heart and is credited with inventing the detective story.");
  out.push("Mark Twain is the pen name of Samuel Clemens.");
  out.push("George Orwell is the pen name of Eric Blair.");
  out.push("Jules Verne wrote Twenty Thousand Leagues Under the Sea and Around the World in Eighty Days.");
  out.push("H. G. Wells wrote The Time Machine and The War of the Worlds.");
  out.push("Hans Christian Andersen wrote fairy tales such as The Little Mermaid and The Ugly Duckling.");
  out.push("The Brothers Grimm collected fairy tales such as Cinderella, Hansel and Gretel and Snow White.");
  out.push("Aesop is credited with fables such as The Tortoise and the Hare.");
  out.push("Nobel Prize in Literature winners include Ernest Hemingway, Gabriel Garcia Marquez, Toni Morrison and Bob Dylan.");
  out.push("A haiku is a Japanese poem of three lines with five, seven and five syllables.");
  out.push("A sonnet is a poem of fourteen lines, and Shakespeare wrote 154 sonnets.");
  out.push("A novel is a long work of fictional prose, and a novella is a shorter one.");
  out.push("An epic is a long narrative poem about heroic deeds, like the Odyssey.");
  out.push("A protagonist is the main character of a story, and an antagonist opposes the protagonist.");
  out.push("An autobiography is a book a person writes about their own life, and a biography is written by someone else.");

  /* painting | painter */
  ("Mona Lisa|Leonardo da Vinci|1503;The Last Supper|Leonardo da Vinci|1498;The Starry Night|Vincent van Gogh|1889;Sunflowers|Vincent van Gogh|1888;" +
   "The Persistence of Memory|Salvador Dali|1931;Guernica|Pablo Picasso|1937;Les Demoiselles d'Avignon|Pablo Picasso|1907;The Scream|Edvard Munch|1893;" +
   "The Birth of Venus|Sandro Botticelli|1485;Primavera|Sandro Botticelli|1482;The Creation of Adam|Michelangelo|1512;The School of Athens|Raphael|1511;" +
   "Girl with a Pearl Earring|Johannes Vermeer|1665;The Night Watch|Rembrandt|1642;The Kiss|Gustav Klimt|1908;American Gothic|Grant Wood|1930;" +
   "Water Lilies|Claude Monet|1906;Impression, Sunrise|Claude Monet|1872;Bal du moulin de la Galette|Pierre-Auguste Renoir|1876;" +
   "A Sunday Afternoon on the Island of La Grande Jatte|Georges Seurat|1886;The Garden of Earthly Delights|Hieronymus Bosch|around 1500;" +
   "Las Meninas|Diego Velazquez|1656;The Third of May 1808|Francisco Goya|1814;Liberty Leading the People|Eugene Delacroix|1830;" +
   "The Great Wave off Kanagawa|Hokusai|around 1831;Nighthawks|Edward Hopper|1942;Campbell's Soup Cans|Andy Warhol|1962;" +
   "Composition with Red, Blue and Yellow|Piet Mondrian|1930;The Arnolfini Portrait|Jan van Eyck|1434;Whistler's Mother|James McNeill Whistler|1871;" +
   "The Hay Wain|John Constable|1821;Wanderer above the Sea of Fog|Caspar David Friedrich|1818;The Son of Man|Rene Magritte|1964;" +
   "The Treachery of Images|Rene Magritte|1929;Self-Portrait with Thorn Necklace|Frida Kahlo|1940;The Two Fridas|Frida Kahlo|1939").split(";").forEach(function (row) {
    var p = row.split("|");
    out.push(p[1] + " painted " + p[0] + " in " + p[2] + ".");
    out.push(p[0] + " is a painting by the artist " + p[1] + ".");
  });
  out.push("Leonardo da Vinci painted the Mona Lisa, which hangs in the Louvre in Paris.");
  out.push("Michelangelo sculpted the statue of David and the Pieta, and painted the ceiling of the Sistine Chapel.");
  out.push("Michelangelo sculpted the marble statue of David between 1501 and 1504.");
  out.push("Auguste Rodin sculpted The Thinker and The Kiss.");
  out.push("Donatello was an Italian Renaissance sculptor who made a bronze David.");
  out.push("Gian Lorenzo Bernini was a Baroque sculptor and architect who carved Apollo and Daphne.");
  out.push("The Statue of Liberty was sculpted by Frederic Auguste Bartholdi.");
  out.push("Impressionism was a 19th-century art movement led by Monet, Renoir and Degas.");
  out.push("Cubism was founded by Pablo Picasso and Georges Braque in the early 20th century.");
  out.push("Surrealism was an art movement led by Salvador Dali and Rene Magritte that explored dreams and the unconscious.");
  out.push("Pablo Picasso was a Spanish painter who co-founded Cubism and painted Guernica.");
  out.push("Vincent van Gogh was a Dutch post-impressionist painter who painted The Starry Night and Sunflowers.");
  out.push("Claude Monet was a French impressionist painter known for his Water Lilies series.");
  out.push("Frida Kahlo was a Mexican painter known for her self-portraits.");
  out.push("Andy Warhol was a leader of pop art and painted Campbell's Soup Cans.");
  out.push("The primary colors of pigment are red, yellow and blue, and mixing red and blue makes purple.");
  out.push("The primary colors of light are red, green and blue, and mixing blue and yellow paint makes green.");
  out.push("Mixing red and yellow makes orange, and mixing blue and yellow makes green.");

  /* composer | work */
  ("Ludwig van Beethoven|Symphony No. 9, which includes the Ode to Joy;Ludwig van Beethoven|the Fifth Symphony and Moonlight Sonata;Wolfgang Amadeus Mozart|The Magic Flute and Don Giovanni;" +
   "Wolfgang Amadeus Mozart|The Marriage of Figaro;Johann Sebastian Bach|the Brandenburg Concertos and the Mass in B minor;Antonio Vivaldi|The Four Seasons;" +
   "Pyotr Ilyich Tchaikovsky|Swan Lake, The Nutcracker and the 1812 Overture;Frederic Chopin|nocturnes, waltzes and polonaises for piano;" +
   "Franz Schubert|the Unfinished Symphony and the song cycle Winterreise;Johannes Brahms|the Hungarian Dances and four symphonies;" +
   "Claude Debussy|Clair de Lune and La Mer;Igor Stravinsky|The Rite of Spring and The Firebird;Giuseppe Verdi|the operas La Traviata and Aida;" +
   "Giacomo Puccini|the operas La Boheme, Tosca and Madama Butterfly;Richard Wagner|the Ring Cycle operas;George Frideric Handel|the oratorio Messiah;" +
   "Joseph Haydn|the Surprise Symphony and the Creation;Gustav Mahler|nine large symphonies;Sergei Rachmaninoff|Piano Concerto No. 2;" +
   "George Gershwin|Rhapsody in Blue;Aaron Copland|Appalachian Spring;Leonard Bernstein|West Side Story;Edvard Grieg|Peer Gynt;" +
   "Modest Mussorgsky|Pictures at an Exhibition;Gioachino Rossini|The Barber of Seville;Georges Bizet|the opera Carmen;Camille Saint-Saens|The Carnival of the Animals").split(";").forEach(function (row) {
    var p = row.split("|");
    out.push(p[0] + " composed " + p[1] + ".");
  });
  out.push("Beethoven composed the Ninth Symphony, which contains the Ode to Joy choral finale, even though he was almost completely deaf.");
  out.push("Antonio Vivaldi composed The Four Seasons, four violin concertos.");
  out.push("Mozart composed more than 600 works, including 41 symphonies, and was a child prodigy from Salzburg.");
  out.push("Johann Sebastian Bach was a German composer of the Baroque period.");
  out.push("The Beatles were an English rock band formed in Liverpool with John Lennon, Paul McCartney, George Harrison and Ringo Starr.");
  out.push("Elvis Presley is called the King of Rock and Roll.");
  out.push("Michael Jackson's album Thriller is the best-selling album of all time.");
  out.push("Louis Armstrong was a jazz trumpeter, and Duke Ellington was a jazz composer and bandleader.");
  out.push("Bob Dylan won the Nobel Prize in Literature in 2016.");
  out.push("An orchestra has four sections: strings, woodwinds, brass and percussion.");
  out.push("A piano has 88 keys, and a standard guitar has six strings, and a violin has four strings.");
  out.push("The musical notes are named A, B, C, D, E, F and G.");
  out.push("Forte means loud and piano means soft in music.");
  out.push("A symphony is a large work for orchestra, usually in four movements, and an opera is a drama set to music.");
  out.push("Hamilton is a musical by Lin-Manuel Miranda about Alexander Hamilton.");
  out.push("The Lion King is a Disney animated film released in 1994.");

  /* film */
  ("Citizen Kane|Orson Welles|1941;Psycho|Alfred Hitchcock|1960;Vertigo|Alfred Hitchcock|1958;Jaws|Steven Spielberg|1975;E.T. the Extra-Terrestrial|Steven Spielberg|1982;" +
   "Schindler's List|Steven Spielberg|1993;Jurassic Park|Steven Spielberg|1993;Star Wars|George Lucas|1977;Titanic|James Cameron|1997;Avatar|James Cameron|2009;" +
   "The Godfather|Francis Ford Coppola|1972;Apocalypse Now|Francis Ford Coppola|1979;Pulp Fiction|Quentin Tarantino|1994;Inception|Christopher Nolan|2010;" +
   "The Dark Knight|Christopher Nolan|2008;Oppenheimer|Christopher Nolan|2023;Gone with the Wind|Victor Fleming|1939;The Wizard of Oz|Victor Fleming|1939;" +
   "Casablanca|Michael Curtiz|1942;2001: A Space Odyssey|Stanley Kubrick|1968;The Shining|Stanley Kubrick|1980;Seven Samurai|Akira Kurosawa|1954;" +
   "Spirited Away|Hayao Miyazaki|2001;My Neighbor Totoro|Hayao Miyazaki|1988;Parasite|Bong Joon-ho|2019;Forrest Gump|Robert Zemeckis|1994;" +
   "Back to the Future|Robert Zemeckis|1985;Toy Story|John Lasseter|1995;Snow White and the Seven Dwarfs|Walt Disney|1937").split(";").forEach(function (row) {
    var p = row.split("|");
    out.push(p[1] + " directed the film " + p[0] + " in " + p[2] + ".");
  });
  out.push("Walt Disney created Mickey Mouse and founded the Walt Disney Company with his brother Roy.");
  out.push("The Academy Awards, also called the Oscars, honor achievements in film.");
  out.push("Hollywood is a district of Los Angeles, California, and the center of the American film industry.");
  out.push("Bollywood is the Hindi-language film industry based in Mumbai.");

  /* architecture and landmarks by creator */
  out.push("Gustave Eiffel's company designed and built the Eiffel Tower for the 1889 World's Fair in Paris.");
  out.push("Antoni Gaudi designed the Sagrada Familia in Barcelona.");
  out.push("Frank Lloyd Wright designed Fallingwater and the Guggenheim Museum in New York.");
  out.push("Christopher Wren designed St Paul's Cathedral in London after the Great Fire of 1666.");
  out.push("Filippo Brunelleschi designed the dome of Florence Cathedral.");
  out.push("Michelangelo designed the dome of St. Peter's Basilica in the Vatican.");
  out.push("The Taj Mahal was built by the Mughal emperor Shah Jahan in memory of his wife Mumtaz Mahal, between 1632 and 1653.");
  out.push("The Colosseum in Rome was built by the Flavian emperors Vespasian and Titus.");
  out.push("Gothic cathedrals such as Notre-Dame de Paris feature pointed arches, ribbed vaults and flying buttresses.");
  out.push("The Louvre is the world's most visited museum and was once a royal palace.");
  out.push("The Guggenheim Museum in Bilbao was designed by Frank Gehry.");
  out.push("The Bauhaus was a German school of design founded by Walter Gropius in 1919.");

  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
