/* Fun and chance: jokes, fun facts, riddles, quotes, tongue twisters, a word of the day, a quiz that marks your answers,
   rock-paper-scissors, coin flips, dice, random numbers and picks. Everything is a local list or a local roll. No outside service. */
(function (root) {
  "use strict";

  var JOKES = [
    "Why don't scientists trust atoms? Because they make up everything.",
    "Why did the scarecrow win an award? He was outstanding in his field.",
    "What do you call a fake noodle? An impasta.",
    "Why was the math book sad? It had too many problems.",
    "I told my computer I needed a break, and now it won't stop sending me vacation ads.",
    "What do you call cheese that isn't yours? Nacho cheese.",
    "Why did the bicycle fall over? It was two tired.",
    "What do you call a bear with no teeth? A gummy bear.",
    "Why can't you give Elsa a balloon? Because she will let it go.",
    "What did the ocean say to the beach? Nothing, it just waved.",
    "Why do programmers prefer dark mode? Because light attracts bugs.",
    "How many programmers does it take to change a light bulb? None, that's a hardware problem.",
    "Why did the computer go to the doctor? It had a virus.",
    "What's a computer's favourite snack? Microchips.",
    "Why was the broom late? It over-swept.",
    "What do you call a sleeping dinosaur? A dino-snore.",
    "Why did the golfer bring two pairs of trousers? In case he got a hole in one.",
    "What do you call a boomerang that doesn't come back? A stick.",
    "I used to hate facial hair, but then it grew on me.",
    "I'm reading a book about anti-gravity. It's impossible to put down.",
    "Why don't eggs tell jokes? They'd crack each other up.",
    "What did one wall say to the other? I'll meet you at the corner.",
    "What do you call a fish wearing a bowtie? Sofishticated.",
    "Why did the tomato turn red? Because it saw the salad dressing.",
    "What's orange and sounds like a parrot? A carrot.",
    "Why did the student eat his homework? The teacher said it was a piece of cake.",
    "How does a penguin build its house? Igloos it together.",
    "What do you get when you cross a snowman with a vampire? Frostbite.",
    "Why is Peter Pan always flying? Because he neverlands.",
    "I would tell you a construction joke, but I'm still working on it.",
    "What did zero say to eight? Nice belt.",
    "Why is six afraid of seven? Because seven eight nine.",
    "Why did the coffee file a police report? It got mugged.",
    "What do you call a factory that makes okay products? A satisfactory.",
    "Parallel lines have so much in common. It's a shame they'll never meet.",
    "Why do cows wear bells? Because their horns don't work.",
    "What did the grape do when it got stepped on? It let out a little wine.",
    "Why did the music teacher need a ladder? To reach the high notes.",
    "What is a pirate's favourite letter? You might think R, but it's the C.",
    "Why did the invisible man turn down the job offer? He couldn't see himself doing it."
  ];

  var FACTS = [
    "Honey never spoils: edible honey has been found in ancient Egyptian tombs.",
    "A day on Venus is longer than its year, because it rotates so slowly.",
    "Octopuses have three hearts and blue blood.",
    "Bananas are berries, but strawberries are not.",
    "There are more possible ways to shuffle a deck of 52 cards than there are atoms on Earth.",
    "Sharks have been around longer than trees.",
    "The Eiffel Tower grows about 15 centimetres taller in summer because heat expands the iron.",
    "Wombats produce cube-shaped droppings.",
    "Lightning is about five times hotter than the surface of the Sun.",
    "A group of flamingos is called a flamboyance.",
    "The shortest war in history, between Britain and Zanzibar in 1896, lasted under 45 minutes.",
    "Sound travels about four times faster in water than in air.",
    "Antarctica is the driest continent, even though it holds most of the world's fresh water as ice.",
    "A group of crows is called a murder, and a group of owls is called a parliament.",
    "There are more trees on Earth than stars in the Milky Way.",
    "The Great Wall of China cannot be seen from the Moon with the naked eye, despite the popular myth.",
    "Light from the Sun takes about eight minutes and twenty seconds to reach Earth.",
    "An adult human has 206 bones, but a baby is born with around 300 that fuse together as it grows.",
    "The human brain uses about a fifth of the body's energy even though it is only about two percent of its weight.",
    "Hummingbirds are the only birds that can fly backwards.",
    "Cats have a third eyelid, which helps keep their eyes moist and protected.",
    "Dolphins sleep with half their brain at a time, so they can keep breathing.",
    "Venus is the hottest planet in the solar system, even though Mercury is closer to the Sun.",
    "Jupiter's Great Red Spot is a storm wider than Earth that has been raging for centuries.",
    "Saturn is so light for its size that it would float in water, if you could find a bathtub big enough.",
    "Sunsets on Mars look blue.",
    "The first email was sent in 1971 by Ray Tomlinson, who also chose the @ sign for addresses.",
    "The first computer bug was a real moth, found in a Harvard computer in 1947.",
    "Oxford University is older than the Aztec Empire: teaching there began around 1096, and Tenochtitlan was founded in 1325.",
    "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.",
    "Nintendo began in 1889 as a company that made playing cards.",
    "The unicorn is the national animal of Scotland.",
    "Canada has more lakes than any other country.",
    "Russia spans eleven time zones.",
    "Vatican City is the smallest country in the world, at about 0.44 square kilometres.",
    "Australia is wider than the Moon: about 4,000 kilometres across, against the Moon's 3,474.",
    "The Dead Sea shore is the lowest point on land, more than 400 metres below sea level.",
    "Mount Everest is the highest mountain above sea level, but the summit of Chimborazo in Ecuador is the farthest point from the centre of the Earth.",
    "The Moon is drifting away from Earth by about 3.8 centimetres every year.",
    "A honeybee makes only about a twelfth of a teaspoon of honey in its whole life.",
    "Butterflies taste with their feet.",
    "Crocodiles cannot stick out their tongues.",
    "Flamingos are pink because of the pigments in the food they eat.",
    "Koalas have fingerprints that are very hard to tell apart from human ones.",
    "The word robot comes from the Czech word robota, meaning forced labour, and was first used in the 1920 play R.U.R.",
    "The word quarantine comes from the Italian for forty days.",
    "The dot over a lowercase i or j is called a tittle.",
    "Typewriter is the longest word you can type using only the top row of a keyboard.",
    "The letter e is the most common letter in English.",
    "A day has 86,400 seconds.",
    "A googol is the number 1 followed by 100 zeros.",
    "Zero is the only number that cannot be written in Roman numerals.",
    "Multiplying 111,111,111 by itself gives 12,345,678,987,654,321.",
    "Pi Day is celebrated on March 14, because the date is 3/14 and pi begins 3.14.",
    "Water expands when it freezes, which is why ice floats and pipes can burst in winter.",
    "Diamonds and the graphite in a pencil are both made of pure carbon.",
    "Helium is the second most common element in the universe, after hydrogen.",
    "Only two elements are liquid at room temperature: mercury and bromine.",
    "Earth is the only planet in the solar system not named after a god.",
    "The Sun contains about 99.8 percent of all the mass in the solar system.",
    "The International Space Station circles the Earth about every 90 minutes.",
    "Astronauts can grow a few centimetres taller in space because their spines stretch without gravity.",
    "Footprints left on the Moon could last for millions of years, because there is no wind or water to erase them.",
    "Peanuts are not true nuts: they are legumes, related to peas and beans.",
    "Apples float because about a quarter of their volume is air.",
    "Carrots were originally purple, and orange ones were bred later.",
    "A pineapple takes about two years to grow.",
    "A tomato is botanically a fruit.",
    "Coffee beans are the seeds of a fruit called a coffee cherry.",
    "Potatoes were first grown in the Andes of South America.",
    "Some snails can stay dormant for up to three years when conditions are dry.",
    "Sloths can slow their heart rate and hold their breath for up to forty minutes.",
    "A teaspoon of neutron star material would weigh billions of tonnes.",
    "Your body is made of tens of trillions of cells.",
    "Humans are about 99.9 percent genetically identical to each other.",
    "The Pacific Ocean covers about a third of the Earth's surface.",
    "An octopus can squeeze through any gap larger than its beak.",
    "A fluffy cumulus cloud can weigh around 500,000 kilograms, yet it floats because that weight is spread over a huge volume of air.",
    "Bats are the only mammals that can truly fly.",
    "The heart of a shrimp is in its head.",
    "A rainbow is really a full circle; from the ground we only see the upper arc.",
    "Wood frogs can freeze solid in winter and thaw out alive in spring.",
    "Venus spins backwards compared with most planets, and Uranus rolls around the Sun tilted on its side.",
    "On Mars a day is about 24 hours and 37 minutes long.",
    "Paper was invented in China, around 2,000 years ago.",
    "The Amazon rainforest is home to about one in ten of the world's known species.",
    "The tallest tree on record, a coast redwood, is more than 115 metres tall.",
    "There are more possible chess games than atoms in the observable universe.",
    "A bolt of lightning can heat the air around it to about 30,000 degrees Celsius.",
    "Elephants are the largest land animals and can recognise themselves in a mirror.",
    "A cheetah can go from standing still to 100 kilometres per hour in about three seconds.",
    "The blue whale is the largest animal that has ever lived, at up to about 30 metres long.",
    "Mount Everest grows by a few millimetres a year because the Indian plate is still pushing into Asia.",
    "Human hair grows about a centimetre a month."
  ];

  var RIDDLES = [
    ["What has keys but can't open locks?", "piano|keyboard", "A piano.", "You can play it."],
    ["What has hands but can't clap?", "clock|watch", "A clock.", "It tells you something every hour."],
    ["What gets wetter the more it dries?", "towel", "A towel.", "You use it after a bath."],
    ["What can you catch but not throw?", "cold", "A cold.", "It makes you sneeze."],
    ["I speak without a mouth and hear without ears. What am I?", "echo", "An echo.", "You find me in canyons and empty halls."],
    ["What has a head and a tail but no body?", "coin", "A coin.", "You can flip it."],
    ["The more you take, the more you leave behind. What am I?", "footstep|footsteps|steps", "Footsteps.", "Think about walking."],
    ["What has many teeth but cannot bite?", "comb", "A comb.", "You use it on your hair."],
    ["What goes up but never comes down?", "age|your age", "Your age.", "Everyone has one, and it only grows."],
    ["What has one eye but cannot see?", "needle", "A needle.", "It is used for sewing."],
    ["What runs but never walks, and has a mouth but never talks?", "river", "A river.", "It flows to the sea."],
    ["What can travel around the world while staying in a corner?", "stamp", "A stamp.", "It goes on an envelope."],
    ["What has words but never speaks?", "book", "A book.", "You read it."],
    ["What belongs to you but is used more by others?", "name|your name", "Your name.", "People call you by it."],
    ["What building has the most stories?", "library", "A library.", "You borrow things from it."],
    ["What is full of holes but still holds water?", "sponge", "A sponge.", "You find it in the kitchen or bath."],
    ["What can fill a room but takes up no space?", "light", "Light.", "Turn it on in the dark."],
    ["What comes once in a minute, twice in a moment, but never in a thousand years?", "m|letter m|the letter m", "The letter M.", "Look at the spelling."],
    ["If you have me, you want to share me; if you share me, you no longer have me. What am I?", "secret", "A secret.", "Keep it quiet."],
    ["What has a neck but no head?", "bottle", "A bottle.", "You drink from it."],
    ["What is always in front of you but cannot be seen?", "future|the future", "The future.", "It has not happened yet."],
    ["I'm tall when I'm young and short when I'm old. What am I?", "candle", "A candle.", "I give light as I burn."],
    ["Which month has 28 days?", "all|every|all of them|each", "All of them.", "Think carefully about the question."],
    ["What is so fragile that saying its name breaks it?", "silence", "Silence.", "It is the absence of sound."],
    ["What walks on four legs in the morning, two at noon and three in the evening?", "man|human|person|humans|people", "A human: a crawling baby, a walking adult and an old person with a stick.", "It is the riddle of the Sphinx."],
    ["Forward I am heavy, but backward I am not. What am I?", "ton", "A ton.", "Read it the other way round."],
    ["Which weighs more, a kilogram of feathers or a kilogram of bricks?", "same|neither|equal|both|they weigh the same", "Neither: a kilogram is a kilogram.", "Look at the units."],
    ["What starts with T, ends with T, and has T in it?", "teapot|tea pot", "A teapot.", "It holds a hot drink."],
    ["What has a thumb and four fingers but is not alive?", "glove", "A glove.", "You wear it in winter."],
    ["What has a ring but no finger?", "telephone|phone", "A telephone.", "It rings when someone calls."],
    ["What can you break without ever touching it?", "promise|a promise|silence", "A promise.", "You make it with your word."],
    ["What gets bigger the more you take away?", "hole|a hole", "A hole.", "Dig and see."],
    ["What goes through cities and fields but never moves?", "road|a road|path", "A road.", "Cars drive along it."],
    ["What has four wheels and flies?", "garbage truck|rubbish truck|garbage bin|bin truck", "A garbage truck, because of the flies.", "Think of a bin lorry."],
    ["What begins with an E but only contains one letter?", "envelope", "An envelope.", "It carries a letter."],
    ["What word is spelled wrong in every dictionary?", "wrong", "The word wrong.", "Read the question again."],
    ["The more of me there is, the less you see. What am I?", "darkness|dark|fog", "Darkness.", "Lights help against me."]
  ];

  var QUOTES = [
    ["The only thing we have to fear is fear itself.", "Franklin D. Roosevelt, 1933"],
    ["I think, therefore I am.", "René Descartes"],
    ["The unexamined life is not worth living.", "Socrates, as written by Plato"],
    ["To be, or not to be, that is the question.", "William Shakespeare, Hamlet"],
    ["All the world's a stage, and all the men and women merely players.", "William Shakespeare, As You Like It"],
    ["Imagination is more important than knowledge.", "Albert Einstein"],
    ["The only way to do great work is to love what you do.", "Steve Jobs, 2005"],
    ["I have a dream.", "Martin Luther King Jr., 1963"],
    ["Injustice anywhere is a threat to justice everywhere.", "Martin Luther King Jr., Letter from Birmingham Jail"],
    ["Ask not what your country can do for you; ask what you can do for your country.", "John F. Kennedy, 1961"],
    ["That's one small step for man, one giant leap for mankind.", "Neil Armstrong, 1969"],
    ["Float like a butterfly, sting like a bee.", "Muhammad Ali"],
    ["Knowledge is power.", "Francis Bacon"],
    ["I came, I saw, I conquered.", "Julius Caesar"],
    ["Not all those who wander are lost.", "J. R. R. Tolkien, The Fellowship of the Ring"],
    ["Education is the most powerful weapon which you can use to change the world.", "Nelson Mandela, 2003"],
    ["I am the master of my fate, I am the captain of my soul.", "William Ernest Henley, Invictus"],
    ["A journey of a thousand miles begins with a single step.", "Lao Tzu"],
    ["Know thyself.", "Inscription at the Temple of Apollo at Delphi"],
    ["We shall never surrender.", "Winston Churchill, 1940"],
    ["Genius is one percent inspiration and ninety-nine percent perspiration.", "Thomas Edison"],
    ["If I have seen further, it is by standing on the shoulders of giants.", "Isaac Newton, 1675"],
    ["Speak softly and carry a big stick.", "Theodore Roosevelt"],
    ["Give me liberty, or give me death!", "Patrick Henry, 1775"],
    ["Government of the people, by the people, for the people, shall not perish from the earth.", "Abraham Lincoln, Gettysburg Address"],
    ["The best way to predict the future is to invent it.", "Alan Kay"],
    ["Talk is cheap. Show me the code.", "Linus Torvalds"],
    ["Premature optimization is the root of all evil.", "Donald Knuth"],
    ["Programs must be written for people to read, and only incidentally for machines to execute.", "Harold Abelson and Gerald Sussman, Structure and Interpretation of Computer Programs"],
    ["The perfect is the enemy of the good.", "Voltaire"],
    ["The pen is mightier than the sword.", "Edward Bulwer-Lytton, 1839"],
    ["It was the best of times, it was the worst of times.", "Charles Dickens, A Tale of Two Cities"],
    ["Call me Ishmael.", "Herman Melville, Moby-Dick"],
    ["All animals are equal, but some animals are more equal than others.", "George Orwell, Animal Farm"],
    ["I can resist everything except temptation.", "Oscar Wilde, Lady Windermere's Fan"],
    ["The cosmos is all that is or ever was or ever will be.", "Carl Sagan, Cosmos"],
    ["We are a way for the cosmos to know itself.", "Carl Sagan, Cosmos"],
    ["The Earth is the cradle of humanity, but one cannot live in the cradle forever.", "Konstantin Tsiolkovsky"],
    ["Stay hungry, stay foolish.", "Stewart Brand's Whole Earth Catalog, quoted by Steve Jobs in 2005"],
    ["The only thing I know is that I know nothing.", "Socrates, as usually paraphrased"],
    ["Well-behaved women seldom make history.", "Laurel Thatcher Ulrich, 1976"],
    ["Courage is not the absence of fear, but the triumph over it.", "Nelson Mandela, Long Walk to Freedom"],
    ["Be kind, for everyone you meet is fighting a hard battle.", "often attributed to Ian Maclaren"],
    ["Fall seven times, stand up eight.", "Japanese proverb"],
    ["Where there is a will, there is a way.", "English proverb"],
    ["Slow and steady wins the race.", "Aesop, The Tortoise and the Hare"],
    ["The best time to plant a tree was twenty years ago. The second best time is now.", "proverb of uncertain origin"]
  ];

  var TWISTERS = [
    "She sells seashells by the seashore.",
    "Peter Piper picked a peck of pickled peppers.",
    "How much wood would a woodchuck chuck if a woodchuck could chuck wood?",
    "Red lorry, yellow lorry.",
    "Unique New York, unique New York, you know you need unique New York.",
    "Betty Botter bought some butter, but she said the butter's bitter.",
    "I scream, you scream, we all scream for ice cream.",
    "Six slippery snails slid slowly seaward.",
    "A proper copper coffee pot.",
    "Fuzzy Wuzzy was a bear, Fuzzy Wuzzy had no hair.",
    "Which witch switched the Swiss wristwatches?",
    "Three free throws.",
    "The sixth sick sheikh's sixth sheep's sick.",
    "Rubber baby buggy bumpers.",
    "Toy boat, toy boat, toy boat.",
    "Irish wristwatch, Swiss wristwatch.",
    "Fresh fried fish, fish fresh fried, fried fish fresh, fish fried fresh.",
    "Eleven benevolent elephants.",
    "Lesser leather never weathered wetter weather better.",
    "Pad kid poured curd pulled cod."
  ];

  var WORDS = [
    ["serendipity", "a pleasant discovery made by accident", "Finding that old photo while looking for a pen was pure serendipity."],
    ["ephemeral", "lasting for a very short time", "The beauty of cherry blossom is ephemeral."],
    ["ubiquitous", "found everywhere", "Smartphones have become ubiquitous."],
    ["petrichor", "the pleasant smell of rain falling on dry ground", "She loved the petrichor after the first storm of summer."],
    ["mellifluous", "sweet and smooth to hear", "He spoke in a mellifluous voice."],
    ["laconic", "using very few words", "His laconic reply was simply: no."],
    ["ineffable", "too great or strange to be put into words", "The view from the summit was ineffable."],
    ["ebullient", "cheerful and full of energy", "She was ebullient after the win."],
    ["equanimity", "calmness and composure, especially in difficulty", "He took the bad news with equanimity."],
    ["gregarious", "fond of company, sociable", "A gregarious host, she knew everyone at the party."],
    ["halcyon", "calm and peaceful, often used of a happy past", "They remembered the halcyon days of childhood summers."],
    ["magnanimous", "generous and forgiving, especially to a rival", "The winner was magnanimous in victory."],
    ["nebulous", "vague, unclear or hazy", "The plan was still nebulous."],
    ["quintessential", "being the most perfect example of something", "Rain is the quintessential English weather."],
    ["sanguine", "optimistic, especially in a difficult situation", "She remained sanguine about their chances."],
    ["taciturn", "reserved and saying little", "The taciturn farmer nodded and walked on."],
    ["wanderlust", "a strong desire to travel", "Her wanderlust took her to six continents."],
    ["zeitgeist", "the spirit or mood of a particular time", "The film captured the zeitgeist of the 1960s."],
    ["quixotic", "idealistic in a way that is not realistic", "Their quixotic plan was to row across the ocean."],
    ["perspicacious", "having a sharp mind and good judgement", "A perspicacious reader will spot the clues."],
    ["surreptitious", "done secretly to avoid being noticed", "He took a surreptitious glance at his phone."],
    ["pernicious", "having a harmful effect, especially in a gradual way", "The pernicious rumour slowly ruined his reputation."],
    ["lugubrious", "looking or sounding sad and dismal", "He gave a lugubrious sigh."],
    ["panacea", "a solution or remedy for all problems", "There is no panacea for poverty."],
    ["obfuscate", "to make something unclear or hard to understand", "Don't obfuscate the issue with jargon."],
    ["resilient", "able to recover quickly from difficulties", "Children can be remarkably resilient."],
    ["eloquent", "fluent and persuasive in speech or writing", "She gave an eloquent speech."],
    ["juxtapose", "to place things side by side to compare or contrast them", "The exhibition juxtaposes old and new photographs."],
    ["melancholy", "a deep, thoughtful sadness", "A gentle melancholy settled over the evening."],
    ["tenacious", "holding firmly to something, not giving up", "A tenacious reporter, she kept digging."],
    ["verbose", "using more words than needed", "His verbose report ran to fifty pages."],
    ["cacophony", "a harsh mixture of loud sounds", "A cacophony of horns filled the street."],
    ["conundrum", "a confusing problem or puzzle", "How to cut costs without cutting jobs was a real conundrum."],
    ["epiphany", "a sudden moment of understanding", "She had an epiphany in the shower."],
    ["limerence", "the state of being intensely infatuated with another person", "Limerence can feel overwhelming."],
    ["sonorous", "having a deep, rich and full sound", "He read in a sonorous voice."],
    ["mercurial", "changing mood or mind quickly and unpredictably", "Her mercurial temper kept everyone guessing."],
    ["inscrutable", "impossible to understand or interpret", "His expression was inscrutable."],
    ["ennui", "a feeling of weariness and boredom", "Ennui set in during the long afternoon."],
    ["alacrity", "brisk and cheerful readiness", "He accepted the invitation with alacrity."]
  ];

  var WYR = [
    "Would you rather be able to fly or be invisible?",
    "Would you rather always know what time it is or always know the weather?",
    "Would you rather live by the sea or in the mountains?",
    "Would you rather have a pause button or a rewind button for your life?",
    "Would you rather be able to speak every language or play every instrument?",
    "Would you rather never have to sleep or never have to eat?",
    "Would you rather travel to the past or to the future?",
    "Would you rather have a pet dragon or a pet unicorn?",
    "Would you rather live without music or without movies?",
    "Would you rather be the best player on a losing team or the worst player on a winning team?",
    "Would you rather explore deep space or the deep sea?",
    "Would you rather have summer all year or winter all year?"
  ];

  var BALL = ["It is certain.", "It is decidedly so.", "Without a doubt.", "Yes, definitely.", "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.", "Yes.", "Signs point to yes.",
    "Reply hazy, try again.", "Ask again later.", "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.", "Don't count on it.", "My reply is no.", "My sources say no.", "Outlook not so good.", "Very doubtful."];

  var PICKS = {
    animal: "dog cat horse elephant tiger dolphin penguin eagle octopus giraffe kangaroo owl fox rabbit whale panda wolf bear zebra turtle".split(" "),
    colour: "red orange yellow green blue purple pink brown black white grey turquoise crimson gold silver".split(" "),
    fruit: "apple banana orange mango pear grape strawberry pineapple peach cherry kiwi lemon watermelon plum".split(" "),
    vegetable: "carrot potato tomato broccoli onion spinach cucumber pepper pea cabbage lettuce cauliflower".split(" "),
    planet: "Mercury Venus Earth Mars Jupiter Saturn Uranus Neptune".split(" "),
    continent: "Africa Antarctica Asia Australia Europe North-America South-America".split(" "),
    ocean: "Pacific Atlantic Indian Southern Arctic".split(" "),
    sport: "football basketball tennis cricket swimming rugby golf baseball athletics cycling volleyball hockey".split(" "),
    instrument: "piano guitar violin drums flute trumpet cello saxophone harp clarinet".split(" "),
    language: "English Spanish French German Mandarin Hindi Arabic Portuguese Russian Japanese Italian Swahili".split(" "),
    food: "pizza pasta sushi curry tacos salad soup burgers noodles pancakes dumplings falafel".split(" "),
    name: "Alex Sam Maya Noah Priya Omar Lena Jonas Aiko Mateo Zara Leo Nina Kofi".split(" "),
    country: ["France", "Japan", "Brazil", "Kenya", "Canada", "India", "Norway", "Peru", "Egypt", "Australia", "Mexico", "Italy", "Thailand", "Chile", "Morocco", "Vietnam", "Ireland", "Turkey", "Argentina", "Ghana"],
    city: ["Paris", "Tokyo", "Cairo", "Lima", "Toronto", "Mumbai", "Nairobi", "Sydney", "Oslo", "Lisbon", "Seoul", "Istanbul", "Mexico City", "Buenos Aires", "Bangkok", "Dublin"],
    letter: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
    word: "river lantern marble whisper compass harvest ember meadow velvet orbit thunder quartz anchor willow".split(" "),
    element: "hydrogen helium carbon nitrogen oxygen sodium iron copper silver gold neon calcium".split(" "),
    season: "spring summer autumn winter".split(" "),
    day: "Monday Tuesday Wednesday Thursday Friday Saturday Sunday".split(" "),
    month: "January February March April May June July August September October November December".split(" ")
  };

  /* category | question | accepted answers (separated by |) | answer shown */
  var QUIZ = [
    ["geography", "What is the capital of Australia?", "canberra", "Canberra"],
    ["geography", "What is the largest ocean on Earth?", "pacific", "The Pacific Ocean"],
    ["geography", "Which is the longest river in Africa?", "nile", "The Nile"],
    ["geography", "What is the capital of Canada?", "ottawa", "Ottawa"],
    ["geography", "Which country has the most people?", "india", "India (it passed China in 2023)"],
    ["geography", "What is the smallest country in the world?", "vatican|vatican city", "Vatican City"],
    ["geography", "On which continent is Egypt?", "africa", "Africa"],
    ["geography", "What is the tallest mountain above sea level?", "everest|mount everest", "Mount Everest"],
    ["geography", "What is the capital of Japan?", "tokyo", "Tokyo"],
    ["geography", "Which desert is the largest hot desert?", "sahara", "The Sahara"],
    ["geography", "What is the capital of Brazil?", "brasilia", "Brasília"],
    ["geography", "Which sea lies between Europe and Africa?", "mediterranean", "The Mediterranean"],
    ["geography", "What is the capital of Egypt?", "cairo", "Cairo"],
    ["geography", "Which country is shaped like a boot?", "italy", "Italy"],
    ["geography", "What is the longest river in South America?", "amazon", "The Amazon"],
    ["geography", "What is the capital of Spain?", "madrid", "Madrid"],
    ["geography", "Which is the largest country by area?", "russia", "Russia"],
    ["geography", "What is the capital of Turkey?", "ankara", "Ankara"],
    ["geography", "Which continent is the coldest?", "antarctica", "Antarctica"],
    ["geography", "What is the capital of Kenya?", "nairobi", "Nairobi"],
    ["science", "What gas do plants take in from the air?", "carbon dioxide|co2", "Carbon dioxide"],
    ["science", "What is the chemical symbol for gold?", "au", "Au"],
    ["science", "How many planets are in the solar system?", "8|eight", "Eight"],
    ["science", "What is the closest planet to the Sun?", "mercury", "Mercury"],
    ["science", "What is H2O more commonly called?", "water", "Water"],
    ["science", "What is the hardest natural substance?", "diamond", "Diamond"],
    ["science", "What force keeps us on the ground?", "gravity", "Gravity"],
    ["science", "How many bones does an adult human have?", "206", "206"],
    ["science", "What is the largest planet in the solar system?", "jupiter", "Jupiter"],
    ["science", "What is the chemical symbol for sodium?", "na", "Na"],
    ["science", "What do bees collect from flowers to make honey?", "nectar", "Nectar"],
    ["science", "What is the centre of an atom called?", "nucleus", "The nucleus"],
    ["science", "Which organ pumps blood around the body?", "heart", "The heart"],
    ["science", "What is the boiling point of water in degrees Celsius at sea level?", "100", "100 degrees Celsius"],
    ["science", "What is the study of living things called?", "biology", "Biology"],
    ["science", "Which planet is known as the Red Planet?", "mars", "Mars"],
    ["science", "What is the speed of light, roughly, in kilometres per second?", "300000|300,000|299792|299,792", "Roughly 300,000 kilometres per second"],
    ["science", "What is the most abundant gas in Earth's atmosphere?", "nitrogen", "Nitrogen"],
    ["science", "What type of animal is a dolphin?", "mammal", "A mammal"],
    ["science", "What is the chemical symbol for iron?", "fe", "Fe"],
    ["science", "What do we call a baby frog?", "tadpole", "A tadpole"],
    ["history", "Who was the first President of the United States?", "washington|george washington", "George Washington"],
    ["history", "In which year did World War II end?", "1945", "1945"],
    ["history", "Which ancient civilisation built the pyramids at Giza?", "egypt|egyptians|ancient egyptians", "The ancient Egyptians"],
    ["history", "Who was the first person to walk on the Moon?", "armstrong|neil armstrong", "Neil Armstrong"],
    ["history", "In which year did the Berlin Wall fall?", "1989", "1989"],
    ["history", "Who painted the Mona Lisa?", "leonardo|da vinci|leonardo da vinci", "Leonardo da Vinci"],
    ["history", "Julius Caesar was a leader of which ancient civilisation?", "roman|rome|romans|ancient rome", "Ancient Rome"],
    ["history", "In which year did the Titanic sink?", "1912", "1912"],
    ["history", "Who wrote the play Romeo and Juliet?", "shakespeare|william shakespeare", "William Shakespeare"],
    ["history", "Which country gave the Statue of Liberty to the United States?", "france", "France"],
    ["history", "In which year did Columbus first reach the Americas?", "1492", "1492"],
    ["history", "Who was the first woman to win a Nobel Prize?", "curie|marie curie", "Marie Curie"],
    ["history", "Which war was fought between the North and South of the United States?", "civil war|american civil war", "The American Civil War"],
    ["language", "What is the plural of mouse?", "mice", "Mice"],
    ["language", "What is the opposite of ancient?", "modern|new", "Modern"],
    ["language", "How many letters are in the English alphabet?", "26|twenty six|twenty-six", "26"],
    ["language", "What do you call a word that means the same as another word?", "synonym", "A synonym"],
    ["language", "What is the past tense of the verb to run?", "ran", "Ran"],
    ["language", "How do you say thank you in Spanish?", "gracias", "Gracias"],
    ["language", "How do you say hello in French?", "bonjour|salut", "Bonjour"],
    ["language", "What do you call a word that names a person, place or thing?", "noun", "A noun"],
    ["math", "What is 12 times 12?", "144", "144"],
    ["math", "What is the square root of 81?", "9|nine", "9"],
    ["math", "How many sides does a hexagon have?", "6|six", "Six"],
    ["math", "What is 15 percent of 200?", "30|thirty", "30"],
    ["math", "What is the next prime number after 7?", "11|eleven", "11"],
    ["math", "How many degrees are in a right angle?", "90|ninety", "90"],
    ["math", "What is 7 times 8?", "56|fifty six|fifty-six", "56"],
    ["math", "What do you call a triangle with all sides equal?", "equilateral", "Equilateral"],
    ["math", "How many minutes are in two hours?", "120|one hundred twenty", "120"],
    ["math", "What is half of 250?", "125", "125"],
    ["general", "How many days are in a leap year?", "366", "366"],
    ["general", "How many strings does a standard guitar have?", "6|six", "Six"],
    ["general", "What colour do you get by mixing blue and yellow?", "green", "Green"],
    ["general", "How many players are on a football (soccer) team on the pitch?", "11|eleven", "Eleven"],
    ["general", "What is the largest mammal?", "blue whale|whale", "The blue whale"],
    ["general", "Which animal is known as the king of the jungle?", "lion", "The lion"],
    ["general", "How many continents are there?", "7|seven", "Seven"],
    ["general", "What is the fastest land animal?", "cheetah", "The cheetah"],
    ["general", "What is the main ingredient in guacamole?", "avocado", "Avocado"],
    ["general", "In which sport do you score a try?", "rugby", "Rugby"],
    ["general", "How many hours are in a day?", "24|twenty four|twenty-four", "24"],
    ["general", "What is the tallest animal?", "giraffe", "The giraffe"],
    ["general", "Which instrument has black and white keys?", "piano", "The piano"],
    ["general", "How many colours are in a rainbow?", "7|seven", "Seven"],
    ["general", "What is the currency of Japan?", "yen", "The yen"],
    ["general", "Which planet do we live on?", "earth", "Earth"],
    ["general", "What do you call a group of lions?", "pride", "A pride"],
    ["general", "What is the currency of the United Kingdom?", "pound|pounds|pound sterling|sterling", "The pound sterling"],
    ["general", "Which fruit is dried to make raisins?", "grape|grapes", "Grapes"],
    ["general", "What is the main language spoken in Brazil?", "portuguese", "Portuguese"]
  ];

  var QCATS = ["geography", "science", "history", "language", "math", "general"];

  function pickIx(S, key, n) {
    var bag = S.bags[key];
    if (!bag || !bag.length) {
      bag = []; for (var i = 0; i < n; i++) bag.push(i);
      for (var j = n - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)), t = bag[j]; bag[j] = bag[k]; bag[k] = t; }
      if (S.lastPick[key] === bag[bag.length - 1] && n > 1) bag.unshift(bag.pop());
      S.bags[key] = bag;
    }
    var v = bag.pop(); S.lastPick[key] = v; return v;
  }
  function norm(s) {
    return " " + String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s-]+/g, " ").replace(/\b(?:the|a|an|its|it is|its the|i think|maybe|probably|is|was|are|of|um|uh|well)\b/g, " ").replace(/\s+/g, " ").trim() + " ";
  }
  function matches(user, accepted) {
    var u = norm(user);
    return accepted.split("|").some(function (a) {
      var n = norm(a).trim();
      return n && (u.trim() === n || u.indexOf(" " + n + " ") >= 0);
    });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function end(s) { s = String(s).trim(); return /[.!?]$/.test(s) ? s : s + "."; }
  function plural(word) {
    if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
    if (/(?:s|x|ch|sh)$/.test(word)) return word + "es";
    return word + "s";
  }

  function init(S) {
    if (!S.fun) S.fun = { bags: {}, lastPick: {}, last: "", pending: null, score: { right: 0, asked: 0 } };
    return S.fun;
  }

  function askQuiz(F, cat) {
    var idxs = [];
    QUIZ.forEach(function (q, i) { if (!cat || q[0] === cat) idxs.push(i); });
    if (!idxs.length) idxs = QUIZ.map(function (q, i) { return i; });
    var n = pickIx(F, "quiz:" + (cat || "all"), idxs.length), q = QUIZ[idxs[n]];
    F.pending = { type: "quiz", q: q, tries: 0, cat: cat || "" };
    F.quizCat = cat || "";
    F.last = "quiz";
    return "Question " + (F.score.asked + 1) + " (" + q[0] + "): " + q[1];
  }

  function factAbout(topic) {
    var FX = root.C4LMFacts;
    if (!FX || !topic) return null;
    var r = null;
    try { r = FX.answer(topic, { min: 0.6, top: 12 }); } catch (e) { r = null; }
    var all = (r && r.all) || (r ? [r] : []);
    var good = all.filter(function (c) { return c.coverage >= 0.99 && c.text.length > 35 && c.text.length < 230 && !/^Simply put/.test(c.text); });
    if (!good.length) return null;
    return good[Math.floor(Math.random() * Math.min(good.length, 5))].text;
  }

  function parseDice(l) {
    var m;
    if ((m = l.match(/^(?:roll|throw|cast)\s+(?:me\s+)?(?:a |the |an? |some |my )?(?:(\d+)\s*)?(?:die|dice)$/))) return [+(m[1] || 1), 6];
    if ((m = l.match(/^(?:roll|throw|cast)\s+(?:me\s+)?(?:a |an? |the )?(\d+)?\s*d\s*(\d+)$/))) return [+(m[1] || 1), +m[2]];
    if ((m = l.match(/^(?:roll|throw|cast)\s+(?:me\s+)?(?:a |an? |the )?(\d+)?[- ]?sided (?:die|dice)$/))) return [1, +m[1]];
    if (/^(?:dice roll|roll)$/.test(l)) return [1, 6];
    return null;
  }
  function rollDice(n, sides) {
    var rolls = [], sum = 0;
    for (var i = 0; i < n; i++) { var v = 1 + Math.floor(Math.random() * sides); rolls.push(v); sum += v; }
    return { rolls: rolls, sum: sum };
  }

  function reply(said, S) {
    var F = init(S), l = String(said || "").toLowerCase().replace(/[!.?]+$/g, "").replace(/\s+/g, " ").replace(/^(?:hey|hi|hello|ok|okay|so|well|um|please|can you|could you|would you(?! rather))[, ]+/, "").trim();
    if (!l || l.length > 90) return null;
    var prev = F.last; F.last = "";
    var m, ANOTHER = /^(?:another(?: one| please)?|one more|again|more|next(?: one| question| riddle)?|tell me another(?: one)?|give me another(?: one)?|another please|got another|do you have another|hit me again|go again)$/;

    /* an open riddle, quiz question or game: the next thing said is probably an answer to it */
    var P = F.pending;
    if (P) {
      var GIVEUP = /^(?:i give up|give up|i surrender|i don'?t know|dunno|idk|no idea|pass|skip|reveal|reveal it|tell me|tell me the answer|what'?s the answer|what is the answer|the answer|answer|answer please|show me the answer|show answer|what was it|no clue|i have no idea)$/;
      var HINT = /^(?:hint|a hint|give me a hint|another hint|clue|a clue|give me a clue|any hints|can i have a hint|help)$/;
      if (P.type === "rps") {
        var mv = l.match(/\b(rock|paper|scissors)\b/);
        if (mv) {
          var mine = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)], you = mv[1], beats = { rock: "scissors", paper: "rock", scissors: "paper" }, out;
          out = mine === you ? "We both chose " + you + ". A draw!" : (beats[you] === mine ? "I chose " + mine + ". You win — " + you + " beats " + mine + "." : "I chose " + mine + ". I win — " + mine + " beats " + you + ".");
          F.pending = null; F.last = "rps";
          return { text: out + " Say \"again\" to play another round.", kind: "rps" };
        }
        if (/^(?:stop|quit|exit|no|cancel|never mind|nevermind)$/.test(l)) { F.pending = null; return { text: "Okay, game over.", kind: "" }; }
      } else if (P.type === "riddle" || P.type === "quiz") {
        var R = P.q, accepted = P.type === "riddle" ? R[1] : R[2], shown = P.type === "riddle" ? R[2] : R[3];
        if (GIVEUP.test(l)) {
          F.pending = null; F.last = P.type;
          if (P.type === "quiz") F.score.asked++;
          return { text: "The answer is: " + end(shown) + (P.type === "riddle" ? " Want another riddle?" : " Say \"next\" for another question."), kind: P.type };
        }
        if (HINT.test(l)) {
          var hint = P.type === "riddle" ? R[3] : "It starts with \"" + shown.replace(/^(?:The|A|An)\s+/, "").charAt(0).toUpperCase() + "\" and has " + shown.replace(/^(?:The|A|An)\s+/, "").replace(/\s*\(.*$/, "").length + " letters.";
          F.last = P.type;
          return { text: "Hint: " + hint, kind: P.type, keep: true };
        }
        /* a request for something else ("quiz me", "tell me a joke", "roll a die") closes the open item and is answered on its own */
        if (/^(?:tell me|give me|quiz me|test me|trivia|riddle|joke|quote|inspire me|motivate me|roll|flip|toss|pick|choose|magic|8[- ]?ball|word of the day|teach me|would you rather|play|let'?s play|ask me|fun fact|my score|score|another|next|surprise me|dad joke|random|rock|got any|do you know|i want|i'?d like|share)\b/.test(l) && !matches(l, accepted)) {
          F.pending = null; F.last = prev;
          return reply(said, S);
        }
        var fresh = /\?$/.test(String(said || "").trim()) || /^(?:what|who|where|when|why|how|which|tell|give|show|explain|define|calculate|compute|write|translate|list|name|can|could|do|does|is|are|will)\b/.test(l) || l.split(" ").length > 8;
        if (!fresh || matches(l, accepted)) {
          if (matches(l, accepted)) {
            F.pending = null; F.last = P.type;
            if (P.type === "quiz") { F.score.right++; F.score.asked++; return { text: "Correct! " + end(shown) + " That's " + F.score.right + " out of " + F.score.asked + ". Say \"next\" for another question.", kind: "quiz" }; }
            return { text: "Yes \u2014 " + shown.replace(/\.$/, "") + ". Well done! Want another riddle?", kind: "riddle" };
          }
          P.tries++;
          if (P.type === "quiz") {
            F.pending = null; F.last = "quiz"; F.score.asked++;
            return { text: "Not quite. The answer is: " + end(shown) + " That's " + F.score.right + " out of " + F.score.asked + ". Say \"next\" for another question.", kind: "quiz" };
          }
          if (P.tries >= 3) { F.pending = null; F.last = "riddle"; return { text: "Not quite. The answer is: " + shown + " Want another riddle?", kind: "riddle" }; }
          F.last = "riddle";
          return { text: "Not quite. Try again, ask for a hint, or say \"give up\".", kind: "riddle", keep: true };
        }
        F.pending = null;                     /* a fresh question closes the game */
      }
    }

    /* jokes and fun facts */
    if (/^(?:tell me|tell|say|give me|got|do you (?:know|have)(?: any)?|know any|share)\s+(?:me\s+)?(?:a |an |another |some |any |one )?(?:good |funny |clean |random |silly |dad |bad |new |short |kid |cheesy |corny )*(?:jokes?|puns?|one[- ]?liners?)$|^(?:make me laugh|tell me something funny|say something funny|i need a laugh|joke|joke please|crack a joke|cheer me up|dad joke|a joke)$/.test(l) || (prev === "joke" && ANOTHER.test(l))) {
      F.last = "joke"; return { text: JOKES[pickIx(F, "joke", JOKES.length)], kind: "joke" };
    }
    if (/^(?:tell me|give me|share|say|got|do you have|i want|i'?d like)\s+(?:me\s+)?(?:a |an |some |any |another |one )?(?:random |fun |interesting |cool |surprising |neat |good |amazing |weird |strange |little )*(?:fact|facts|trivia|piece of trivia)$|^(?:fun|random|interesting|cool) fact$|^surprise me$|^(?:fact|facts|fun facts)$|^did you know$|^teach me something(?: new)?$|^tell me something(?: interesting| new| cool)?$|^say something interesting$/.test(l) || (prev === "fact" && ANOTHER.test(l))) {
      F.last = "fact"; return { text: FACTS[pickIx(F, "fact", FACTS.length)], kind: "fact" };
    }
    if ((m = l.match(/^(?:tell me|give me|share|say|got|do you know|i want|i'?d like)\s+(?:me\s+)?(?:a |an |some |any |another |one )?(?:random |fun |interesting |cool |surprising |neat |good |amazing |weird |strange |little )*(?:fact|facts|trivia)\s+(?:about|on|of|regarding)\s+(?:the |a |an )?(.+)$|^(?:fun |interesting |random )?facts? (?:about|on) (?:the |a |an )?(.+)$|^(?:something|anything) (?:interesting|fun|cool) (?:about|on) (?:the |a |an )?(.+)$/))) {
      var topic = (m[1] || m[2] || m[3] || "").trim();
      var pool = FACTS.filter(function (f) { return new RegExp("\\b" + topic.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/s$/, "") + "(?:s|es)?\\b", "i").test(f); });
      if (pool.length) { F.last = "fact"; return { text: pool[Math.floor(Math.random() * pool.length)], kind: "factabout" }; }
      var got = factAbout(topic);
      if (got) { F.last = "fact"; return { text: got, kind: "factabout" }; }
      return { text: "I don't have a good fact about " + topic + " to hand. Ask me a question about it, or say \"fun fact\" for a random one.", kind: "" };
    }

    /* riddles, quiz, games */
    if (/^(?:tell me|give me|ask me|got|do you (?:know|have)(?: any)?|know any|share|let'?s have|i want|i'?d like)\s+(?:me\s+)?(?:a |an |another |some |any |one )?(?:good |hard |easy |tricky |fun |new |classic )*riddles?$|^riddle(?: me this)?$|^(?:a )?riddle(?: please)?$/.test(l) || (prev === "riddle" && ANOTHER.test(l))) {
      var ri = pickIx(F, "riddle", RIDDLES.length); F.pending = { type: "riddle", q: RIDDLES[ri], tries: 0 }; F.last = "riddle";
      return { text: RIDDLES[ri][0] + " (Say \"hint\" or \"give up\" if you're stuck.)", kind: "riddle" };
    }
    if ((m = l.match(/^(?:quiz me|test me|trivia|trivia time|ask me (?:a )?(?:trivia )?question|ask me something|give me (?:a )?(?:trivia |quiz )?question|trivia question|quiz question|let'?s play (?:a )?(?:trivia|quiz)(?: game)?|play (?:a )?(?:trivia|quiz)(?: game)?|start (?:a )?(?:trivia |quiz)(?: game)?|(?:give me|ask me) (?:a )?(?:random )?(?:quiz|trivia)|quiz|test my knowledge|i want to play a quiz|i'?m ready for a quiz)(?: (?:on|about|in) ([a-z]+))?$/)) || (prev === "quiz" && ANOTHER.test(l))) {
      var want = m && m[1] ? { geography: "geography", science: "science", history: "history", language: "language", languages: "language", english: "language", math: "math", maths: "math", mathematics: "math", general: "general", maps: "geography", countries: "geography" }[m[1]] : "";
      if (m && m[1] && !want) return { text: "I can quiz you on geography, science, history, language, math or general knowledge — which would you like?", kind: "" };
      return { text: askQuiz(F, want || (prev === "quiz" && F.quizCat) || ""), kind: "quiz" };
    }
    if (/^(?:my score|score|what'?s my score|what is my score|how am i doing|how many (?:have i got|did i get|have i got) right|quiz score)$/.test(l) && F.score.asked) {
      F.last = prev; return { text: "You have " + F.score.right + " right out of " + F.score.asked + " so far" + (F.score.right === F.score.asked ? " — a perfect run!" : "."), kind: "score" };
    }
    if (/^(?:let'?s play |play |i want to play |start )?(?:a game of )?rock,? paper,? scissors(?: game)?$|^rps$|^let'?s play a game$|^play a game$|^want to play a game$/.test(l)) {
      F.pending = { type: "rps" }; F.last = "rps";
      return { text: /rock|rps/.test(l) ? "Rock, paper, scissors \u2014 pick one!" : "Happy to. Let's start with rock, paper, scissors \u2014 pick one! (Or say \"quiz me\" for trivia, or \"riddle\" for a riddle.)", kind: "rps" };
    }
    if (prev === "rps" && ANOTHER.test(l)) { F.pending = { type: "rps" }; F.last = "rps"; return { text: "Rock, paper, scissors — pick one!", kind: "rps" }; }
    if (/^(?:would you rather|give me a would you rather|ask me a would you rather|would you rather question|play would you rather)$/.test(l) || (prev === "wyr" && ANOTHER.test(l))) {
      F.last = "wyr"; return { text: WYR[pickIx(F, "wyr", WYR.length)], kind: "wyr" };
    }

    /* quotes, twisters, words */
    if ((m = l.match(/^(?:give me|tell me|share|say|got|i need|i want|show me|read me|i'?d like)\s+(?:me\s+)?(?:a |an |another |one |some |the )?(?:famous |good |inspiring |inspirational |motivational |wise |random |nice |short |great |new |beautiful |deep |philosophical )*quotes?(?: of the day)?(?:\s+(?:about|on|by|from)\s+(.+))?$|^(?:quote|quote of the day|inspire me|motivate me|say something (?:inspiring|wise|motivational|deep|profound)|inspirational quote|motivational quote|a quote)$/)) || (prev === "quote" && ANOTHER.test(l))) {
      var qpool = QUOTES, who = m && m[1] ? m[1].toLowerCase() : "";
      if (who) { qpool = QUOTES.filter(function (q) { return (q[0] + " " + q[1]).toLowerCase().indexOf(who.replace(/s$/, "")) >= 0; }); if (!qpool.length) return { text: "I don't have a quote on that to hand. Say \"give me a quote\" for one from my collection.", kind: "" }; }
      var qq = qpool[who ? Math.floor(Math.random() * qpool.length) : pickIx(F, "quote", QUOTES.length)];
      F.last = "quote"; return { text: "“" + qq[0] + "” — " + qq[1], kind: "quote" };
    }
    if (/^(?:tell me|give me|say|got|share|i want|do you know)\s+(?:me\s+)?(?:a |an |another |one |some )?(?:good |hard |tricky |fun |famous )*tongue[- ]?twisters?$|^tongue[- ]?twister$/.test(l) || (prev === "twister" && ANOTHER.test(l))) {
      F.last = "twister"; return { text: TWISTERS[pickIx(F, "twister", TWISTERS.length)] + " Try saying that three times fast.", kind: "twister" };
    }
    if ((m = l.match(/^(?:give me |tell me |what'?s |what is )?(?:a |the )?(word of the day|new word|new word of the day)$|^teach me a (?:new )?word$|^(?:give me|tell me) a (?:new |fancy |interesting |rare |good )?word$|^(?:a )?(?:fancy|interesting|rare|new) word$/)) || (prev === "word" && ANOTHER.test(l))) {
      var ofDay = m && /of the day/.test(m[0]);
      var wi = ofDay ? Math.floor(Date.now() / 86400000) % WORDS.length : pickIx(F, "word", WORDS.length), w = WORDS[wi];
      F.last = "word"; return { text: cap(w[0]) + ": " + w[1] + ". Example: " + w[2], kind: "word" };
    }

    /* chance */
    if (/^(?:flip|toss|spin)\s+(?:a |the |me a |an? )?coin$|^heads or tails$|^coin (?:flip|toss)$|^(?:flip|toss) it$/.test(l) || (prev === "coin" && ANOTHER.test(l))) {
      F.last = "coin"; return { text: Math.random() < 0.5 ? "Heads." : "Tails.", kind: "coin" };
    }
    var dd = parseDice(l);
    if (dd || (prev === "dice" && ANOTHER.test(l))) {
      var n = dd ? dd[0] : (F.lastDice || [1, 6])[0], sides = dd ? dd[1] : (F.lastDice || [1, 6])[1];
      if (n < 1 || n > 20 || sides < 2 || sides > 1000) return { text: "I can roll between 1 and 20 dice with 2 to 1000 sides.", kind: "" };
      F.lastDice = [n, sides]; F.last = "dice";
      var rr = rollDice(n, sides);
      return { text: n === 1 ? "You rolled a " + rr.sum + "." : "You rolled " + rr.rolls.join(", ") + " \u2014 a total of " + rr.sum + ".", kind: "dice" };
    }
    if ((m = l.match(/^(?:pick|choose|give me|generate|say|think of|name|select|roll|draw)\s+(?:me\s+)?(?:a |an |any )?(?:random\s+)?(?:whole\s+)?(?:number|integer|int)(?:\s+(?:between|from)\s+(-?\d+)\s+(?:and|to|-)\s+(-?\d+))?(?:\s+(?:please|for me))?$|^random\s+(?:whole\s+)?number(?:\s+(?:between|from)\s+(-?\d+)\s+(?:and|to|-)\s+(-?\d+))?$|^(?:pick|choose)\s+(?:a |one )?number\s+(?:from|between)\s+(-?\d+)\s+(?:and|to|-)\s+(-?\d+)$|^(?:pick|choose|think of) a number$/)) || (prev === "number" && ANOTHER.test(l))) {
      var lo = 1, hi = 100;
      if (m) { var a1 = m[1] || m[3] || m[5], b1 = m[2] || m[4] || m[6]; if (a1 != null && b1 != null) { lo = +a1; hi = +b1; } }
      else if (F.lastRange) { lo = F.lastRange[0]; hi = F.lastRange[1]; }
      if (lo > hi) { var tmp = lo; lo = hi; hi = tmp; }
      F.lastRange = [lo, hi]; F.last = "number";
      return { text: String(lo + Math.floor(Math.random() * (hi - lo + 1))) + (m && m[0] && !/between|from|to/.test(m[0]) ? " (a number from 1 to 100)." : "."), kind: "number" };
    }
    if ((m = l.match(/^(?:pick|choose|give me|generate|say|name|select|suggest|think of)\s+(?:me\s+)?(?:a |an |any |one )?(?:random\s+)?(animal|colou?r|fruit|vegetable|planet|continent|ocean|sport|instrument|language|food|name|country|city|letter|word|element|season|day|month|day of the week|month of the year)(?:\s+(?:please|for me|at random))?$|^random\s+(animal|colou?r|fruit|vegetable|planet|continent|ocean|sport|instrument|language|food|name|country|city|letter|word|element|season|day|month)$/)) || (/^(?:pick|choose|give me|name) another$/.test(l) && F.lastCat)) {
      var cat = (m && (m[1] || m[2])) || F.lastCat; cat = cat.replace("colour", "colour").replace("color", "colour").replace("day of the week", "day").replace("month of the year", "month");
      var bank = PICKS[cat];
      if (bank) { F.lastCat = cat; F.last = "pick"; var item = bank[pickIx(F, "pick:" + cat, bank.length)].replace(/-/g, " "); return { text: (cat === "letter" ? "The letter " + item : item) + ".", kind: "pick" }; }
    }
    if ((m = l.match(/^(?:pick|choose|select|decide|randomly (?:pick|choose))(?: one)?(?: of| between| from| for me)?:?\s+(.+?)(?:\s+for me)?$/)) && /,|\sor\s|\sand\s/.test(m[1])) {
      var opts = m[1].split(/\s*(?:,|\bor\b|\band\b)\s*/).map(function (x) { return x.replace(/^(?:the|a|an)\s+/, "").trim(); }).filter(Boolean);
      if (opts.length >= 2 && opts.length <= 12 && !opts.every(function (x) { return /^-?\d+$/.test(x); })) {
        F.last = "choose";
        return { text: "I pick " + opts[Math.floor(Math.random() * opts.length)] + ".", kind: "choose" };
      }
    }
    if (/^(?:ask the |shake the |consult the |use the |play )?(?:magic )?8[- ]?ball\b/.test(l) || /^magic eight ball\b/.test(l) || (prev === "ball" && ANOTHER.test(l))) {
      F.last = "ball"; return { text: BALL[pickIx(F, "ball", BALL.length)], kind: "ball" };
    }
    return null;
  }

  root.C4LMFun = { reply: reply, banks: { JOKES: JOKES, FACTS: FACTS, RIDDLES: RIDDLES, QUOTES: QUOTES, TWISTERS: TWISTERS, WORDS: WORDS, QUIZ: QUIZ, WYR: WYR, PICKS: PICKS } };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMFun;
})(typeof window !== "undefined" ? window : globalThis);
