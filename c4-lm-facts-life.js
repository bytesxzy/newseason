/* Everyday life, food, sport, music, language and technology, second wave. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];

  /* food: item | made from */
  [
    "Bread|flour, water, yeast and salt", "Guacamole|mashed avocado, usually with lime, onion, tomato and salt", "Hummus|chickpeas, tahini, lemon juice and garlic", "Pizza|a dough base of flour and yeast topped with tomato sauce and cheese",
    "Pasta|durum wheat flour and water or eggs", "Cheese|milk that has been curdled and aged", "Butter|churned cream", "Yogurt|milk fermented by bacteria", "Chocolate|cacao beans, sugar and often milk", "Coffee|roasted coffee beans",
    "Tea|the dried leaves of the tea plant", "Wine|fermented grapes", "Beer|fermented barley malt, hops, yeast and water", "Honey|nectar collected and transformed by bees", "Sushi|vinegared rice with raw fish, seaweed or vegetables", "Tofu|curdled soy milk pressed into blocks",
    "Ketchup|tomatoes, vinegar and sugar", "Mayonnaise|egg yolks, oil and vinegar or lemon juice", "Salsa|chopped tomatoes, onions, chilies and lime", "Kimchi|fermented cabbage and chilies", "Omelette|beaten eggs cooked in a pan", "Paella|rice, saffron, vegetables and meat or seafood",
    "Porridge|oats cooked in water or milk", "Cereal|processed grains such as corn, wheat or oats", "Popcorn|corn kernels that burst when heated", "Ice cream|frozen cream, milk and sugar", "Jam|fruit boiled with sugar", "Pancakes|a batter of flour, eggs and milk fried in a pan",
    "Tortillas|corn or wheat flour flatbreads", "Falafel|ground chickpeas fried into balls", "Curry|meat or vegetables cooked in a spiced sauce", "Soup|ingredients simmered in liquid", "Cake|flour, sugar, eggs and butter baked in an oven", "Cookies|flour, butter, sugar and often chocolate chips, baked",
    "Vinegar|fermented alcohol such as wine or cider", "Flour|ground wheat or other grain", "Sugar|sugar cane or sugar beet", "Olive oil|pressed olives", "Maple syrup|the boiled sap of maple trees", "Cider|pressed and fermented apples", "Lemonade|lemon juice, sugar and water",
    "Pesto|basil, pine nuts, garlic, cheese and olive oil", "Gazpacho|a cold soup of raw tomatoes and vegetables", "Ramen|wheat noodles in a flavoured broth", "Burrito|a tortilla wrapped around beans, rice, meat and cheese", "Croissant|a flaky pastry of laminated yeast dough and butter"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push(p[0] + " is made from " + p[1] + ".");
    out.push("The main ingredient of " + p[0].toLowerCase() + " is " + p[1].split(/,| and /)[0] + ".");
    out.push("What is " + p[0].toLowerCase() + " made of? It is made from " + p[1] + ".");
  });
  out.push("The main ingredient in guacamole is avocado.");
  out.push("The main ingredient of bread is flour.");
  out.push("The main ingredient of hummus is chickpeas.");
  out.push("The main ingredient of chocolate is cacao.");
  out.push("The main ingredient of cheese is milk.");
  out.push("Avocado is the main ingredient of guacamole.");
  out.push("Flour, made from ground wheat, is the main ingredient of bread.");
  out.push("Yeast makes bread dough rise by producing carbon dioxide gas.");
  out.push("Pizza was invented in Naples, Italy, and pasta is a staple of Italian cooking.");
  out.push("Sushi is a traditional Japanese dish, and kimchi is a traditional Korean dish.");
  out.push("Croissants are associated with France, tacos with Mexico, curry with India and paella with Spain.");
  out.push("Fruits such as apples, bananas and oranges grow on plants and contain seeds, while vegetables like carrots and spinach are other parts of plants.");
  out.push("A tomato is botanically a fruit, though it is used as a vegetable in cooking.");
  out.push("Potatoes, carrots and onions are vegetables that grow underground, and beans are legumes.");
  out.push("Eggs, meat, fish and beans are good sources of protein.");
  out.push("Milk, cheese and yogurt are dairy products made from the milk of cows and other animals.");
  out.push("Honey never spoils if it is kept sealed, because it has very little water.");
  out.push("Salt preserves food and adds flavour, and sugar adds sweetness.");
  out.push("Cooking food kills many germs and makes some food easier to digest.");
  out.push("A balanced diet includes fruit, vegetables, grains, protein and dairy in the right amounts.");
  out.push("Vegetarians do not eat meat, and vegans do not eat any animal products.");

  /* household objects: object | use */
  [
    "umbrella|keep you dry from the rain or shade you from the sun", "scissors|cut paper, cloth and other thin materials", "key|lock and unlock a door", "clock|tell the time", "calendar|keep track of dates", "compass|find the direction of north", "thermometer|measure temperature",
    "ruler|measure length and draw straight lines", "pencil|write and draw", "eraser|rub out pencil marks", "map|show where places are and how to get there", "telephone|talk to someone far away", "refrigerator|keep food cold so it stays fresh", "oven|bake and roast food",
    "broom|sweep the floor", "towel|dry your body or dishes", "soap|wash away dirt and germs", "toothbrush|clean your teeth", "mirror|see your reflection", "lamp|give light", "blanket|keep you warm in bed", "pillow|support your head while you sleep", "bucket|carry water or other liquids",
    "hammer|drive nails into wood", "screwdriver|turn screws", "needle|sew cloth", "glasses|help you see more clearly", "watch|tell the time on your wrist", "backpack|carry books and belongings", "wallet|hold money and cards", "fork|pick up food and eat", "spoon|eat soup and stir",
    "knife|cut food", "plate|serve food on", "cup|drink from", "kettle|boil water", "toaster|brown slices of bread", "washing machine|wash clothes", "vacuum cleaner|suck dust from floors and carpets", "bicycle|travel by pedalling",
    "camera|take photographs", "microphone|pick up sound and make it louder or record it", "headphones|listen to sound privately", "battery|store electrical energy to power devices", "flashlight|give light in the dark", "candle|give light by burning wax", "stapler|fasten sheets of paper together",
    "envelope|hold a letter for posting", "stamp|show postage has been paid on a letter", "lock|keep a door or box secured", "fan|move air to cool you down", "heater|warm a room", "air conditioner|cool the air in a building", "ladder|reach high places", "shovel|dig holes", "rake|gather leaves", "axe|chop wood"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push("You use " + (/^[aeiou]/.test(p[0]) ? "an " : "a ") + p[0] + " to " + p[1] + ".");
    out.push((/^[aeiou]/.test(p[0]) ? "An " : "A ") + p[0] + " is used to " + p[1] + ".");
  });

  /* sport */
  out.push("A soccer team has 11 players on the field, including the goalkeeper.");
  out.push("There are eleven players on each side in soccer, so 22 on the field in total.");
  out.push("A basketball team has five players on the court, a baseball team has nine players in the field, and a cricket team has eleven players.");
  out.push("A volleyball team has six players on the court, an ice hockey team has six including the goalkeeper, and a rugby union team has fifteen players.");
  out.push("American football has eleven players per team on the field, and an Australian rules football team has eighteen.");
  out.push("A tennis match is played between two players in singles or four in doubles.");
  out.push("A soccer match lasts 90 minutes, in two halves of 45 minutes.");
  out.push("A basketball game has four quarters of 12 minutes in the NBA.");
  out.push("In baseball a team gets three outs per half-inning, and a game has nine innings.");
  out.push("A marathon is 42.195 kilometres, or 26.2 miles, long.");
  out.push("The length of a marathon is 42.195 kilometres, which is about 26 miles and 385 yards.");
  out.push("The marathon is named after the run of a Greek messenger from Marathon to Athens.");
  out.push("An Olympic swimming pool is 50 metres long, and an Olympic running track is 400 metres around.");
  out.push("A football (soccer) pitch is about 100 to 110 metres long, and a basketball hoop is 10 feet (3.05 metres) high.");
  out.push("A golf course typically has 18 holes, and a standard par for a hole is 3, 4 or 5.");
  out.push("A chess board has 64 squares, and each player starts with 16 pieces.");
  out.push("In chess the pieces are the king, queen, rooks, bishops, knights and pawns.");
  out.push("The ancient Olympic Games began in 776 BCE, and the modern Olympics began in Athens in 1896.");
  out.push("The Summer Olympics are held every four years, and the FIFA World Cup is also held every four years.");
  out.push("The Olympic rings are five interlocking rings in blue, yellow, black, green and red.");
  out.push("The FIFA World Cup was first held in 1930 in Uruguay, and Uruguay won it.");
  out.push("Brazil has won the FIFA World Cup five times, more than any other country; Germany and Italy have won it four times each.");
  out.push("Argentina won the 2022 FIFA World Cup in Qatar, beating France on penalties.");
  out.push("France won the 2018 FIFA World Cup in Russia, and Spain won the 2010 World Cup in South Africa.");
  out.push("The 2026 FIFA World Cup will be hosted by the United States, Canada and Mexico.");
  out.push("The 2024 Summer Olympics were held in Paris, the 2020 Games (held in 2021) in Tokyo, the 2016 Games in Rio de Janeiro and the 2012 Games in London.");
  out.push("The 2008 Summer Olympics were held in Beijing, the 2004 Games in Athens, the 2000 Games in Sydney and the 1996 Games in Atlanta.");
  out.push("Wimbledon in London is the oldest tennis tournament and is played on grass courts.");
  out.push("The four tennis Grand Slams are the Australian Open, French Open, Wimbledon and US Open.");
  out.push("Usain Bolt of Jamaica holds the 100 metres world record of 9.58 seconds.");
  out.push("Michael Phelps has won the most Olympic gold medals, 23 in swimming.");
  out.push("The Tour de France is a famous cycling race held every July in France.");
  out.push("Cricket is the national sport of many countries, including England, India and Australia, and is played with a bat and ball.");
  out.push("Baseball's top league is Major League Baseball, and the World Series decides the champion.");
  out.push("The Super Bowl is the championship game of the National Football League.");
  out.push("Sumo wrestling is a traditional sport of Japan, and judo and karate also come from Japan.");

  /* music */
  out.push("A standard piano has 88 keys: 52 white and 36 black.");
  out.push("The instrument with black and white keys is the piano.");
  out.push("The piano is a keyboard instrument with black and white keys that hammers strike strings.");
  out.push("A standard guitar has six strings, a violin has four, a cello has four, a bass guitar usually has four, and a concert harp has 47.");
  out.push("The violin, viola, cello and double bass are the string instruments of the orchestra.");
  out.push("The flute, oboe, clarinet and bassoon are woodwind instruments, and the trumpet, trombone, French horn and tuba are brass instruments.");
  out.push("Drums, xylophones and timpani are percussion instruments.");
  out.push("An orchestra has four sections: strings, woodwinds, brass and percussion.");
  out.push("The musical notes are named A, B, C, D, E, F and G, and the do-re-mi scale is do, re, mi, fa, sol, la, ti.");
  out.push("A symphony is a long piece of music for an orchestra, usually in four movements.");
  out.push("Jazz began in New Orleans in the early twentieth century, and rock and roll became popular in the 1950s.");
  out.push("The Beatles were an English band formed in Liverpool in 1960 with John Lennon, Paul McCartney, George Harrison and Ringo Starr.");
  out.push("The Four Seasons is a set of four violin concertos by Antonio Vivaldi, composed around 1720.");
  out.push("Mozart wrote The Magic Flute, Beethoven wrote the Ninth Symphony with its Ode to Joy, and Bach wrote the Brandenburg Concertos.");
  out.push("Tchaikovsky composed the ballets Swan Lake, The Sleeping Beauty and The Nutcracker.");
  out.push("Elvis Presley was called the King of Rock and Roll, and Michael Jackson was called the King of Pop.");
  out.push("A choir is a group of singers, and a soprano is the highest female singing voice, a bass the lowest male voice.");
  out.push("Tempo is the speed of music, and a beat is the basic unit of musical time.");

  /* books and arts additions */
  out.push("Les Miserables is a novel by Victor Hugo, published in 1862.");
  out.push("Victor Hugo wrote Les Miserables and The Hunchback of Notre-Dame.");
  out.push("The author of Les Miserables is Victor Hugo.");
  out.push("The Odyssey was written by the ancient Greek poet Homer.");
  out.push("Pride and Prejudice was written by Jane Austen and published in 1813.");
  out.push("Hamlet was written by William Shakespeare around 1600.");
  out.push("The Mona Lisa was painted by Leonardo da Vinci and hangs in the Louvre in Paris.");
  out.push("The ceiling of the Sistine Chapel was painted by Michelangelo between 1508 and 1512.");
  out.push("Starry Night was painted by Vincent van Gogh in 1889.");
  out.push("The Scream was painted by Edvard Munch, and The Persistence of Memory by Salvador Dali.");
  out.push("The Great Gatsby was written by F. Scott Fitzgerald, and To Kill a Mockingbird by Harper Lee.");
  out.push("Harry Potter was written by J. K. Rowling, and The Lord of the Rings by J. R. R. Tolkien.");
  out.push("Romeo and Juliet, Macbeth, Othello and A Midsummer Night's Dream are plays by Shakespeare.");
  out.push("A haiku is a Japanese poem of three lines with five, seven and five syllables.");
  out.push("A sonnet is a poem of fourteen lines, and a limerick is a funny five-line poem.");
  out.push("A novel is a long work of fiction, a biography tells the story of a person's life and an autobiography is written by the person themselves.");
  out.push("The Oxford English Dictionary is the main historical dictionary of the English language.");
  out.push("Fairy tales include Cinderella, Snow White, Sleeping Beauty and Hansel and Gretel, many collected by the Brothers Grimm.");

  /* language: words, prefixes, suffixes */
  [
    "benevolent|kind, well-meaning and generous", "ephemeral|lasting only a very short time", "ubiquitous|present or found everywhere", "meticulous|showing great attention to detail", "eloquent|fluent and persuasive in speaking or writing",
    "frugal|careful about spending money", "reluctant|unwilling and hesitant", "ambiguous|open to more than one meaning", "candid|honest and straightforward", "diligent|hard-working and careful", "resilient|able to recover quickly from difficulties",
    "gregarious|fond of company and sociable", "obsolete|no longer produced or used", "pragmatic|dealing with things in a practical, sensible way", "serene|calm, peaceful and untroubled", "vivid|bright and clear in the mind or the eye", "zealous|having great energy or enthusiasm",
    "altruistic|unselfishly concerned for the welfare of others", "arduous|involving great effort and difficulty", "conspicuous|easily seen and noticeable", "empathy|the ability to understand and share another person's feelings", "hypothesis|a proposed explanation to be tested",
    "metaphor|a figure of speech that describes one thing as being another", "simile|a figure of speech comparing two things using like or as", "synonym|a word with the same or nearly the same meaning as another", "antonym|a word with the opposite meaning of another",
    "nostalgia|a wistful longing for the past", "paradox|a statement that seems contradictory but may be true", "irony|a contrast between what is said or expected and what actually happens", "democracy|government by the people, through voting", "inflation|a general rise in prices over time",
    "photosynthesis|the process by which plants turn sunlight, water and carbon dioxide into food and oxygen", "ecosystem|a community of living things and their environment", "biodiversity|the variety of living things in a place", "habitat|the natural home of an animal or plant",
    "migration|the seasonal movement of animals or people from one place to another", "gravity|the force that pulls objects toward each other", "evaporation|the change of a liquid into a vapour below its boiling point", "erosion|the wearing away of rock and soil by wind and water"
  ].forEach(function (row) {
    var p = row.split("|");
    out.push("The word " + p[0] + " means " + p[1] + ".");
    out.push(p[0].charAt(0).toUpperCase() + p[0].slice(1) + " means " + p[1] + ".");
  });
  out.push("The prefix un- means not or the opposite of, as in unhappy, which means not happy.");
  out.push("The prefix re- means again, as in rewrite, which means write again.");
  out.push("The prefix pre- means before, as in preview, and the prefix post- means after, as in postpone.");
  out.push("The prefix dis- means not or apart, as in disagree, and the prefix mis- means wrongly, as in misspell.");
  out.push("The prefix in- or im- means not, as in impossible, and the prefix non- means not, as in nonsense.");
  out.push("The prefix anti- means against, as in antifreeze, and the prefix inter- means between, as in international.");
  out.push("The prefix sub- means under, as in submarine, and the prefix super- means above or beyond, as in superhuman.");
  out.push("The prefix trans- means across, as in transport, and the prefix bi- means two, as in bicycle.");
  out.push("The prefix tri- means three, as in triangle, and the prefix semi- means half, as in semicircle.");
  out.push("The prefix micro- means very small, as in microscope, and the prefix mega- means very large, as in megaphone.");
  out.push("The suffix -less means without, as in hopeless, and the suffix -ful means full of, as in joyful.");
  out.push("The suffix -able means able to be, as in readable, and the suffix -ness turns an adjective into a noun, as in kindness.");
  out.push("The suffix -er means a person who does something, as in teacher, and the suffix -ly turns an adjective into an adverb, as in quickly.");
  out.push("The opposite of ancient is modern, and the opposite of hot is cold.");
  out.push("The opposite of big is small, of up is down, of fast is slow, of happy is sad and of light is dark.");
  out.push("A synonym for happy is joyful, cheerful or glad, and a synonym for big is large or huge.");
  out.push("A synonym for smart is clever or intelligent, and a synonym for fast is quick or rapid.");
  out.push("An umbrella protects you from rain, and a coat keeps you warm in cold weather.");
  out.push("The plural of mouse is mice, of child is children, of foot is feet, of tooth is teeth, of man is men and of woman is women.");
  out.push("The plural of goose is geese, of sheep is sheep, of fish is fish, of leaf is leaves and of person is people.");
  out.push("The past tense of run is ran, of go is went, of eat is ate, of see is saw, of be is was or were and of have is had.");
  out.push("The past tense of write is wrote, of take is took, of give is gave, of buy is bought, of think is thought and of bring is brought.");
  out.push("A noun names a person, place or thing; a verb is an action word; an adjective describes a noun; and an adverb describes a verb.");
  out.push("A pronoun replaces a noun, a preposition shows position or relation, and a conjunction joins words or clauses.");
  out.push("There are 26 letters in the English alphabet, five of them vowels (a, e, i, o, u), and the rest are consonants.");
  out.push("The longest word in the English dictionary commonly cited is pneumonoultramicroscopicsilicovolcanoconiosis.");
  out.push("A palindrome reads the same backwards as forwards, such as level, radar and racecar.");
  out.push("An anagram is a word made by rearranging the letters of another word, such as listen and silent.");

  /* technology additions */
  out.push("RAM stands for random access memory, the fast temporary memory a computer uses for running programs.");
  out.push("ROM stands for read-only memory, and a hard drive or SSD stores data permanently.");
  out.push("The brain of a computer is the central processing unit, or CPU.");
  out.push("The programming language with a snake as its logo is Python.");
  out.push("The Python programming language is named after the comedy group Monty Python, not the snake, though its logo shows two snakes.");
  out.push("The Linux operating system has a penguin called Tux as its mascot.");
  out.push("The company that makes the iPhone is Apple, which also makes the Mac and the iPad.");
  out.push("Android is the mobile operating system developed by Google, and iOS is Apple's mobile operating system.");
  out.push("Windows is the operating system made by Microsoft, and macOS is the operating system for Apple's Mac computers.");
  out.push("Google makes the Chrome browser and the Android system, and Microsoft makes the Edge browser.");
  out.push("A byte is eight bits, a kilobyte is about a thousand bytes, a megabyte a million, a gigabyte a billion and a terabyte a trillion.");
  out.push("The internet is a global network of computers, and the World Wide Web is the system of linked pages that runs on it.");
  out.push("Wi-Fi lets devices connect to a network wirelessly, and Bluetooth connects devices over short distances.");
  out.push("A search engine such as Google finds web pages that match what you type.");
  out.push("An email address has a username, the @ symbol and a domain name, like name@example.com.");
  out.push("A password manager stores strong passwords, and two-factor authentication adds a second check when you log in.");
  out.push("Phishing is a scam that tricks people into giving away passwords or money by pretending to be a trusted sender.");
  out.push("Artificial intelligence is the field of making computers do tasks that normally need human intelligence, such as understanding language or recognising images.");
  out.push("Machine learning is a way of building programs that learn patterns from data instead of following only fixed rules.");
  out.push("A robot is a machine that can carry out tasks automatically, often guided by a computer program.");
  out.push("A blockchain is a shared digital ledger of transactions made of linked blocks that are hard to alter, and Bitcoin is a cryptocurrency that uses one.");
  out.push("Cloud computing means using servers on the internet to store data and run programs instead of your own computer.");
  out.push("A pixel is the smallest dot of a digital image, and resolution is the number of pixels in the image.");
  out.push("The first email was sent by Ray Tomlinson in 1971, and the first website went online in 1991.");
  out.push("The first general-purpose electronic computer was ENIAC, completed in 1945 in the United States.");
  out.push("Moore's law is the observation that the number of transistors on a chip doubles about every two years.");

  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
