/* Advice and recommendations. Things to watch, read, play and listen to; how to get better at a skill; everyday life advice;
 * letters and messages to adapt; simple plans (a workout, a running programme, a study week, a budget, a trip). Banks and rules
 * that the people who built this wrote down; nothing is fetched. solve(text, env) returns { answer, schema, confidence } or null.
 * env.fact(question) may return a short fact from the fact library, used to enrich a trip plan. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------ recommendations */
  var R = {
    movie: {
      _: ["The Shawshank Redemption (1994), a drama about hope and friendship in prison", "Spirited Away (2001), a Studio Ghibli fantasy about a girl in a world of spirits", "Back to the Future (1985), a time-travel comedy adventure", "The Princess Bride (1987), a funny fairy-tale adventure", "Inception (2010), a mind-bending heist set inside dreams", "Parasite (2019), a sharp thriller about two families in South Korea", "Toy Story (1995), the first fully computer-animated feature film", "Casablanca (1942), a classic wartime romance", "The Lord of the Rings: The Fellowship of the Ring (2001), an epic fantasy quest", "Groundhog Day (1993), a comedy about a day that keeps repeating", "Interstellar (2014), a space epic about saving humanity", "Coco (2017), a moving animated film about family and music"],
      comedy: ["Groundhog Day (1993)", "Airplane! (1980)", "Monty Python and the Holy Grail (1975)", "The Princess Bride (1987)", "Bridesmaids (2011)", "Superbad (2007)", "Paddington 2 (2017)", "Some Like It Hot (1959)"],
      drama: ["The Shawshank Redemption (1994)", "Forrest Gump (1994)", "12 Angry Men (1957)", "Schindler's List (1993)", "The Godfather (1972)", "Good Will Hunting (1997)", "Moonlight (2016)"],
      scifi: ["Blade Runner (1982)", "The Matrix (1999)", "Interstellar (2014)", "Arrival (2016)", "Alien (1979)", "Star Wars (1977)", "Back to the Future (1985)", "Ex Machina (2014)", "WALL-E (2008)"],
      horror: ["Psycho (1960)", "The Shining (1980)", "Alien (1979)", "Get Out (2017)", "A Quiet Place (2018)", "Jaws (1975)", "The Exorcist (1973)"],
      animated: ["Spirited Away (2001)", "Toy Story (1995)", "Finding Nemo (2003)", "Up (2009)", "Coco (2017)", "The Lion King (1994)", "My Neighbor Totoro (1988)", "Inside Out (2015)", "Spider-Man: Into the Spider-Verse (2018)"],
      action: ["Die Hard (1988)", "Mad Max: Fury Road (2015)", "The Dark Knight (2008)", "Gladiator (2000)", "Raiders of the Lost Ark (1981)", "John Wick (2014)", "Terminator 2: Judgment Day (1991)"],
      romance: ["Pride and Prejudice (2005)", "Casablanca (1942)", "When Harry Met Sally (1989)", "Before Sunrise (1995)", "The Princess Bride (1987)", "Roman Holiday (1953)", "La La Land (2016)"],
      thriller: ["Se7en (1995)", "Rear Window (1954)", "The Silence of the Lambs (1991)", "Gone Girl (2014)", "Knives Out (2019)", "Parasite (2019)", "Memento (2000)"],
      family: ["Paddington (2014)", "The Princess Bride (1987)", "Toy Story (1995)", "Finding Nemo (2003)", "Matilda (1996)", "The Sound of Music (1965)", "E.T. the Extra-Terrestrial (1982)", "How to Train Your Dragon (2010)"],
      classic: ["Casablanca (1942)", "Citizen Kane (1941)", "It's a Wonderful Life (1946)", "Singin' in the Rain (1952)", "Rear Window (1954)", "Some Like It Hot (1959)", "The Godfather (1972)", "12 Angry Men (1957)"],
      documentary: ["Free Solo (2018)", "March of the Penguins (2005)", "My Octopus Teacher (2020)", "Man on Wire (2008)", "20 Feet from Stardom (2013)", "Won't You Be My Neighbor? (2018)"]
    },
    book: {
      _: ["To Kill a Mockingbird by Harper Lee, a classic about justice and growing up", "The Hobbit by J.R.R. Tolkien, a fantasy adventure", "Pride and Prejudice by Jane Austen, a witty romance", "1984 by George Orwell, a chilling look at a surveillance state", "The Hitchhiker's Guide to the Galaxy by Douglas Adams, a funny science-fiction romp", "Dune by Frank Herbert, an epic of politics and survival on a desert planet", "Sapiens by Yuval Noah Harari, a sweeping history of humankind", "The Martian by Andy Weir, a gripping tale of survival on Mars", "Man's Search for Meaning by Viktor Frankl, on finding purpose", "Atomic Habits by James Clear, a practical book on building habits", "The Alchemist by Paulo Coelho, a short fable about following your dreams"],
      fiction: ["To Kill a Mockingbird by Harper Lee", "The Great Gatsby by F. Scott Fitzgerald", "Pride and Prejudice by Jane Austen", "One Hundred Years of Solitude by Gabriel Garcia Marquez", "The Kite Runner by Khaled Hosseini", "Life of Pi by Yann Martel", "Beloved by Toni Morrison", "Things Fall Apart by Chinua Achebe"],
      fantasy: ["The Hobbit by J.R.R. Tolkien", "A Wizard of Earthsea by Ursula K. Le Guin", "Harry Potter and the Philosopher's Stone by J.K. Rowling", "The Name of the Wind by Patrick Rothfuss", "The Lion, the Witch and the Wardrobe by C.S. Lewis", "Mistborn: The Final Empire by Brandon Sanderson", "Good Omens by Terry Pratchett and Neil Gaiman"],
      scifi: ["Dune by Frank Herbert", "The Hitchhiker's Guide to the Galaxy by Douglas Adams", "Ender's Game by Orson Scott Card", "Neuromancer by William Gibson", "The Left Hand of Darkness by Ursula K. Le Guin", "The Martian by Andy Weir", "Foundation by Isaac Asimov", "Project Hail Mary by Andy Weir"],
      mystery: ["And Then There Were None by Agatha Christie", "Murder on the Orient Express by Agatha Christie", "The Hound of the Baskervilles by Arthur Conan Doyle", "Gone Girl by Gillian Flynn", "The Girl with the Dragon Tattoo by Stieg Larsson", "The Big Sleep by Raymond Chandler"],
      classic: ["Pride and Prejudice by Jane Austen", "Jane Eyre by Charlotte Bronte", "Frankenstein by Mary Shelley", "Great Expectations by Charles Dickens", "Moby-Dick by Herman Melville", "Crime and Punishment by Fyodor Dostoevsky", "The Count of Monte Cristo by Alexandre Dumas"],
      nonfiction: ["Sapiens by Yuval Noah Harari", "A Brief History of Time by Stephen Hawking", "Educated by Tara Westover", "Born a Crime by Trevor Noah", "Guns, Germs, and Steel by Jared Diamond", "The Diary of a Young Girl by Anne Frank", "Cosmos by Carl Sagan", "Thinking, Fast and Slow by Daniel Kahneman"],
      selfhelp: ["Atomic Habits by James Clear", "Man's Search for Meaning by Viktor Frankl", "How to Win Friends and Influence People by Dale Carnegie", "The 7 Habits of Highly Effective People by Stephen Covey", "Deep Work by Cal Newport", "Mindset by Carol Dweck"],
      history: ["Sapiens by Yuval Noah Harari", "Guns, Germs, and Steel by Jared Diamond", "A People's History of the United States by Howard Zinn", "The Guns of August by Barbara Tuchman", "SPQR by Mary Beard", "The Silk Roads by Peter Frankopan"],
      kids: ["Charlotte's Web by E.B. White", "Matilda by Roald Dahl", "The Very Hungry Caterpillar by Eric Carle", "Where the Wild Things Are by Maurice Sendak", "The Gruffalo by Julia Donaldson", "Winnie-the-Pooh by A.A. Milne", "Harry Potter and the Philosopher's Stone by J.K. Rowling", "The Giving Tree by Shel Silverstein"],
      ya: ["The Hunger Games by Suzanne Collins", "The Giver by Lois Lowry", "The Fault in Our Stars by John Green", "Percy Jackson and the Lightning Thief by Rick Riordan", "The Hate U Give by Angie Thomas", "Divergent by Veronica Roth"],
      romance: ["Pride and Prejudice by Jane Austen", "Jane Eyre by Charlotte Bronte", "Outlander by Diana Gabaldon", "The Notebook by Nicholas Sparks", "Me Before You by Jojo Moyes", "Beach Read by Emily Henry"],
      horror: ["Frankenstein by Mary Shelley", "Dracula by Bram Stoker", "The Shining by Stephen King", "Rebecca by Daphne du Maurier", "The Haunting of Hill House by Shirley Jackson", "Pet Sematary by Stephen King"],
      poetry: ["Leaves of Grass by Walt Whitman", "Milk and Honey by Rupi Kaur", "The Waste Land by T.S. Eliot", "Selected poems by Emily Dickinson", "Ariel by Sylvia Plath", "Citizen: An American Lyric by Claudia Rankine"],
      biography: ["Born a Crime by Trevor Noah", "Educated by Tara Westover", "The Diary of a Young Girl by Anne Frank", "Long Walk to Freedom by Nelson Mandela", "I Know Why the Caged Bird Sings by Maya Angelou", "Steve Jobs by Walter Isaacson"]
    },
    show: {
      _: ["Planet Earth (2006), a stunning nature documentary series narrated by David Attenborough", "The Office (US), a mockumentary comedy about a paper company", "Avatar: The Last Airbender, an animated adventure that works for all ages", "Sherlock (2010), a modern take on Sherlock Holmes", "Breaking Bad, a gripping drama about a chemistry teacher turned drug maker", "Parks and Recreation, a warm comedy about local government", "Stranger Things, a sci-fi horror series set in the 1980s", "Fawlty Towers, a classic British sitcom", "Ted Lasso, a feel-good comedy about an American football coach in English soccer"],
      comedy: ["The Office (US)", "Parks and Recreation", "Fawlty Towers", "Friends", "Brooklyn Nine-Nine", "Ted Lasso", "Arrested Development", "Schitt's Creek", "Seinfeld"],
      drama: ["Breaking Bad", "The Wire", "Mad Men", "The Crown", "Succession", "The Sopranos", "Downton Abbey", "Chernobyl"],
      scifi: ["Black Mirror", "Stranger Things", "Doctor Who", "The Expanse", "Star Trek: The Next Generation", "Battlestar Galactica", "Severance"],
      documentary: ["Planet Earth", "Cosmos", "Blue Planet II", "The Last Dance", "Our Planet", "The Civil War by Ken Burns"],
      kids: ["Bluey", "Avatar: The Last Airbender", "Sesame Street", "Peppa Pig", "Daniel Tiger's Neighborhood", "Gravity Falls", "Phineas and Ferb"],
      animated: ["Avatar: The Last Airbender", "Bluey", "The Simpsons", "Gravity Falls", "Rick and Morty", "Arcane", "BoJack Horseman"],
      mystery: ["Sherlock", "Broadchurch", "Agatha Christie's Poirot", "Line of Duty", "Only Murders in the Building", "True Detective"],
      fantasy: ["Game of Thrones", "The Witcher", "Avatar: The Last Airbender", "His Dark Materials", "Good Omens", "The Dragon Prince"]
    },
    music: {
      _: ["Abbey Road by The Beatles", "The Dark Side of the Moon by Pink Floyd", "Thriller by Michael Jackson", "Rumours by Fleetwood Mac", "Kind of Blue by Miles Davis", "Nevermind by Nirvana", "Lemonade by Beyonce", "A Night at the Opera by Queen", "Songs in the Key of Life by Stevie Wonder", "Legend by Bob Marley and the Wailers", "Random Access Memories by Daft Punk"],
      classical: ["The Four Seasons by Vivaldi", "Symphony No. 9 by Beethoven", "Piano Concerto No. 21 by Mozart", "The Planets by Holst", "Clair de Lune by Debussy", "Brandenburg Concertos by Bach", "Swan Lake by Tchaikovsky"],
      jazz: ["Kind of Blue by Miles Davis", "A Love Supreme by John Coltrane", "Time Out by The Dave Brubeck Quartet", "Ella and Louis by Ella Fitzgerald and Louis Armstrong", "Take Five by Dave Brubeck"],
      rock: ["Led Zeppelin IV by Led Zeppelin", "Abbey Road by The Beatles", "Nevermind by Nirvana", "The Dark Side of the Moon by Pink Floyd", "A Night at the Opera by Queen", "Rumours by Fleetwood Mac", "Back in Black by AC/DC"],
      pop: ["Thriller by Michael Jackson", "1989 by Taylor Swift", "21 by Adele", "Lemonade by Beyonce", "Purple Rain by Prince", "Future Nostalgia by Dua Lipa", "Like a Prayer by Madonna"],
      hiphop: ["good kid, m.A.A.d city by Kendrick Lamar", "The Marshall Mathers LP by Eminem", "Illmatic by Nas", "The Miseducation of Lauryn Hill by Lauryn Hill", "The Chronic by Dr. Dre", "To Pimp a Butterfly by Kendrick Lamar"],
      country: ["Red Headed Stranger by Willie Nelson", "Coal Miner's Daughter by Loretta Lynn", "Folsom Prison Blues by Johnny Cash", "Jolene by Dolly Parton", "Golden Hour by Kacey Musgraves"],
      relax: ["Ambient 1: Music for Airports by Brian Eno", "Clair de Lune by Debussy", "Gymnopedies by Erik Satie", "Kind of Blue by Miles Davis", "Weightless by Marconi Union", "Spiegel im Spiegel by Arvo Part"],
      study: ["Brain.fm-style instrumental focus playlists", "Gymnopedies by Erik Satie", "Ambient 1: Music for Airports by Brian Eno", "Lo-fi beats playlists", "Violin Concerto in A minor by Bach", "Kind of Blue by Miles Davis"],
      workout: ["Eye of the Tiger by Survivor", "Lose Yourself by Eminem", "Stronger by Kanye West", "Don't Stop Me Now by Queen", "Can't Hold Us by Macklemore and Ryan Lewis", "Till I Collapse by Eminem", "Levitating by Dua Lipa"]
    },
    game: {
      _: ["The Legend of Zelda: Breath of the Wild, a huge open-world adventure", "Minecraft, a creative sandbox for building and exploring", "Stardew Valley, a relaxing farming game", "Portal 2, a clever puzzle game with great humour", "Tetris, the classic falling-blocks puzzle", "Celeste, a heartfelt platformer about climbing a mountain", "Mario Kart, a fun racing game to play with friends", "Hades, a fast, stylish action game with a great story"],
      board: ["Catan", "Ticket to Ride", "Carcassonne", "Pandemic", "Codenames", "Azul", "Wingspan", "Dixit", "Splendor", "King of Tokyo"],
      card: ["Uno", "Exploding Kittens", "Gin rummy", "Hearts", "Spades", "Euchre", "Cards Against Humanity (for adults)", "Dominion", "Skip-Bo"],
      video: ["The Legend of Zelda: Breath of the Wild", "Minecraft", "Stardew Valley", "Portal 2", "Celeste", "Hades", "Super Mario Odyssey", "Animal Crossing: New Horizons", "Tetris"],
      party: ["Codenames", "Charades", "Jackbox Party Pack", "Just Dance", "Mario Kart", "Telestrations", "Taboo", "Exploding Kittens", "Cards Against Humanity (for adults)"],
      puzzle: ["Portal 2", "Tetris", "The Witness", "Baba Is You", "Monument Valley", "Sudoku", "Wordle", "Crosswords"],
      kids: ["Minecraft", "Super Mario Odyssey", "Animal Crossing: New Horizons", "Mario Kart", "Uno", "Candy Land", "Chutes and Ladders", "Spot It"],
      coop: ["Pandemic", "Overcooked", "It Takes Two", "Minecraft", "Forbidden Island", "Portal 2 (co-op mode)"]
    },
    podcast: {
      _: ["Radiolab, curious stories about science and ideas", "99% Invisible, about the hidden design of everyday things", "Stuff You Should Know, friendly explainers on all sorts of topics", "This American Life, true stories on a theme each week", "Freakonomics Radio, economics applied to everyday life", "Planet Money, how the economy works, told as stories", "TED Talks Daily, short talks on big ideas", "Hardcore History by Dan Carlin, long and gripping history", "Serial, a season-long true crime investigation"]
    },
    anime: {
      _: ["Spirited Away, a Studio Ghibli classic", "My Neighbor Totoro, a gentle family film", "Fullmetal Alchemist: Brotherhood, an adventure with a strong story", "Death Note, a tense psychological thriller", "Cowboy Bebop, a stylish space western", "Attack on Titan, a dark action epic", "Demon Slayer, beautifully animated action", "One Piece, a long adventure about pirates", "Your Name, a romantic fantasy film"]
    },
    hobby: {
      _: ["drawing or sketching", "gardening, even on a windowsill", "journaling", "hiking", "learning a musical instrument", "photography", "baking", "chess", "learning to code", "birdwatching", "knitting or crocheting", "learning a language", "woodworking", "cooking cuisines from different countries", "running or cycling", "volunteering", "pottery", "reading clubs", "stargazing", "board games"]
    },
    sport: {
      _: ["swimming, which is easy on the joints and works the whole body", "running, which needs only a pair of shoes", "cycling", "tennis or badminton", "basketball", "football (soccer)", "climbing, indoors at first", "yoga for flexibility and calm", "martial arts such as judo or karate", "rowing", "table tennis, which is quick to learn", "hiking or trail walking"]
    },
    skill: {
      _: ["basic first aid", "touch typing", "cooking five dependable meals", "public speaking", "a second language", "basic coding", "personal budgeting", "swimming", "basic home or bike repair", "writing clearly", "mental maths", "meditation"]
    },
    activity: {
      _: ["a walk in a park or along a river", "cooking a new recipe", "a visit to a museum, gallery or library", "a picnic if the weather is nice", "a board-game or movie night with friends", "a hike or a bike ride", "a farmers' market and a long lunch", "learning something new, such as a craft or an instrument", "a clear-out of one cupboard followed by a treat", "a day trip to a nearby town you have never visited", "volunteering for a few hours", "a call with a friend you have not talked to for a while"]
    }
  };
  var SYN_M = { film: "movie", movies: "movie", films: "movie", flick: "movie", novel: "book", novels: "book", books: "book", read: "book", reading: "book", series: "show", shows: "show", "tv show": "show", "tv series": "show", television: "show", netflix: "show", song: "music", songs: "music", album: "music", albums: "music", band: "music", artist: "music", singer: "music", playlist: "music", games: "game", "video game": "game", podcasts: "podcast", cartoon: "anime", animes: "anime", activities: "activity", things: "activity", hobbies: "hobby", pastime: "hobby", pastimes: "hobby", sports: "sport", skills: "skill" };
  var GENRES = [
    ["scifi", /\b(?:sci[- ]?fi|science fiction|space|futuristic)\b/], ["fantasy", /\bfantasy|magic|wizard|dragons?\b/], ["horror", /\bhorror|scary|spooky|creepy\b/], ["comedy", /\bcomed(?:y|ies)|funny|humou?r|laugh\b/],
    ["drama", /\bdrama|serious|emotional\b/], ["romance", /\bromance|romantic|love story|rom-?com\b/], ["thriller", /\bthriller|suspense|tense\b/], ["mystery", /\bmystery|detective|whodunn?it|crime\b/],
    ["action", /\baction|adventure\b/], ["animated", /\banimat\w+|cartoon\b/], ["classic", /\bclassics?|old\b/], ["family", /\bfamily|all ages\b/], ["kids", /\bkids?|children|child|toddler|young\b/], ["documentary", /\bdocumentar\w+|nature|real[- ]life\b/],
    ["nonfiction", /\bnon[- ]?fiction|true story|factual\b/], ["selfhelp", /\bself[- ]?help|motivat\w+|personal growth|productiv\w+\b/], ["history", /\bhistor\w+\b/], ["biography", /\bbiograph\w+|memoir|autobiograph\w+\b/], ["poetry", /\bpoet\w+|poems?\b/],
    ["ya", /\bya\b|young adult|teen\w*/], ["fiction", /\bfiction|novel\b/], ["classical", /\bclassical|orchestra|symphon\w+\b/], ["jazz", /\bjazz\b/], ["rock", /\brock\b/], ["pop", /\bpop\b/], ["hiphop", /\bhip[- ]?hop|rap\b/], ["country", /\bcountry\b/],
    ["relax", /\brelax\w*|calm|chill|sleep\w*|unwind\b/], ["study", /\bstudy\w*|focus\w*|concentrat\w+|homework\b/], ["workout", /\bworkout|gym|running|exercise\b/], ["board", /\bboard game/], ["card", /\bcard game/], ["video", /\bvideo game|console|pc game/],
    ["party", /\bparty|group|friends\b/], ["puzzle", /\bpuzzle|brain\b/], ["coop", /\bco-?op|cooperative|together\b/]
  ];
  var lastRec = { key: "", idx: -1 };
  function pickFrom(bank, key, startFrom) {
    var i = startFrom == null ? (bank.length ? (Math.floor(Math.random() * bank.length)) : 0) : startFrom % bank.length;
    lastRec = { key: key, idx: i };
    return bank[i];
  }

  /* ------------------------------------------------------------ skills and life advice */
  var SKILL = {
    chess: "play regularly, ideally against slightly stronger opponents; review each game to find your mistakes; solve a few tactics puzzles every day; learn a couple of solid openings and the basic endgames; and study games played by strong players",
    drawing: "draw a little every day; start with simple shapes and real objects in front of you; learn the basics of proportion, perspective and shading; copy from good references; and keep a sketchbook so you can see your progress",
    painting: "paint a little often; learn colour mixing and values (light and dark) before details; copy master studies; try one medium at a time; and step back often to judge the whole picture",
    guitar: "practise a little every day instead of rarely for a long time; learn the basic open chords and switch between them slowly; use a metronome; learn songs you love; and record yourself to hear what needs work",
    piano: "practise a little every day; start with each hand alone and play slowly; learn scales and chords; use a metronome; learn pieces you love; and keep your wrists and shoulders relaxed",
    singing: "warm up before you sing; breathe low from the diaphragm; match pitch with a piano or tuner app; record yourself; drink water; and take a few lessons to avoid bad habits",
    drums: "learn the basic grooves and rudiments on a practice pad; use a metronome; start slowly and speed up; play along to songs; and keep your grip relaxed",
    writing: "write a little every day; read widely; finish drafts before you edit; cut words that do no work; read your work aloud; and ask others for honest feedback",
    running: "build up gradually with run-walk intervals; run three times a week at an easy pace where you could still talk; add one longer run; rest between runs; wear proper shoes; and add some strength work",
    swimming: "work on relaxed breathing out underwater; practise kick drills with a board; swim regularly with long, smooth strokes; film your stroke or take a few lessons; and build distance gradually",
    cooking: "learn basic knife skills; cook simple recipes again and again until they are easy; read the whole recipe first; taste and season as you go; and try one new technique a week",
    baking: "weigh ingredients with a scale; follow recipes exactly at first; check your oven with a thermometer; learn what each ingredient does; keep notes; and be patient with dough and cooling",
    photography: "learn exposure (aperture, shutter speed and ISO); use the rule of thirds and leading lines; shoot in good light, especially early morning and late afternoon; take photos every day; and review and edit your best ones",
    coding: "build small projects regularly; read other people's code; solve practice problems; learn to debug step by step; stick with one language until you are comfortable; and use version control such as Git",
    programming: "build small projects regularly; read other people's code; solve practice problems; learn to debug step by step; stick with one language until you are comfortable; and use version control such as Git",
    maths: "practise problems daily; understand why a method works, not just how; review your mistakes; make sure the basics are solid before moving on; and explain solutions to someone else",
    languages: "study a little every day; start speaking and listening early; learn the most common words first; use spaced-repetition flashcards; talk with native speakers; and watch or read things you enjoy in the language",
    typing: "learn touch typing with your fingers on the home row; aim for accuracy first and speed second; practise for 15 minutes a day with a typing tutor; and avoid looking at the keys",
    reading: "read every day, even for 15 minutes; choose books you enjoy; keep a book with you; turn off notifications while reading; and take notes on what you want to remember",
    basketball: "dribble with both hands; shoot free throws every day with good form; work on footwork; play pickup games; and watch how good players move without the ball",
    soccer: "work on your first touch; pass against a wall with both feet; build fitness; play small-sided games; and watch how good players find space",
    football: "work on your first touch; pass against a wall with both feet; build fitness; play small-sided games; and watch how good players find space",
    tennis: "work on footwork and a ready position; practise consistent groundstrokes before power; rehearse your serve; play practice matches; and take a few lessons to fix technique early",
    golf: "work on your grip, stance and tempo; spend most practice time on the short game and putting, where most shots are; take lessons; and learn to manage the course",
    cycling: "ride regularly and build distance gradually; spin an easy gear at a steady rhythm; learn basic bike handling and maintenance; and ride with others to learn from them",
    yoga: "practise regularly in a beginner class or with a good video; focus on your breath; never force a pose; use props such as blocks; and be patient with flexibility",
    meditation: "start with five minutes a day; sit comfortably and follow your breath; when your mind wanders, gently bring it back without judging; use a guided app at first; and keep a regular time",
    speaking: "know your material; practise out loud; slow down; make eye contact; use pauses; and start with a strong opening",
    negotiating: "prepare your goal and your walk-away point; research the other side; listen more than you talk; ask questions; and look for options that help both sides",
    leadership: "listen first; set clear goals; give credit and specific feedback; lead by example; delegate and trust people; and own your mistakes",
    management: "set clear expectations; give regular, specific feedback; meet one-to-one; delegate; and remove obstacles for your team",
    studying: "space your study over several days; test yourself with practice questions; explain topics aloud; take regular short breaks; sleep well; and teach what you learn to someone else",
    interviews: "research the company; prepare stories using the situation, task, action and result format; practise common questions aloud; prepare questions of your own; and arrive early",
    organisation: "give everything a home; sort once into keep, donate and discard; use a single calendar and to-do list; spend ten minutes tidying each day; and review your week every Sunday",
    "time management": "list your priorities each morning; schedule focused blocks for important work; estimate how long tasks take; batch similar tasks; say no to low-value requests; and review your week",
    cooking: "learn basic knife skills; cook simple recipes again and again until they are easy; read the whole recipe first; taste and season as you go; and try one new technique a week",
    gardening: "start with easy plants; learn your light and soil; water deeply but less often; compost; keep notes on what works; and start small",
    skateboarding: "start with balance and pushing; wear a helmet and pads; learn to fall safely; practise basic tricks over and over; and skate with others",
    dancing: "practise basic steps slowly; use a mirror or video; count the beat; take a beginner class; and relax and have fun",
    sudoku: "look for cells with only one possible number; scan rows, columns and boxes systematically; use pencil marks; and learn pairs and pointing techniques",
    crosswords: "start with the clues you are sure of; use crossing letters; learn common crossword words; and look for clue patterns such as question marks for wordplay",
    trivia: "read widely and often; learn about a few topics deeply; use flashcards; and review what you get wrong",
    poker: "play fewer hands and play them aggressively; learn the odds; watch your position at the table; manage your bankroll; and review your hands",
    skiing: "take lessons; learn to stop and turn before speed; keep your weight forward; use the right equipment; and ski within your limits",
    surfing: "learn to read waves; practise popping up on land; start on a big soft board; paddle fitness matters; and surf with others for safety",
    karate: "train regularly under a good instructor; focus on basics; practise slowly with good form; and be patient",
    math: "practise problems daily; understand why a method works, not just how; review your mistakes; make sure the basics are solid before moving on; and explain solutions to someone else"
  };
  var SKILL_ALIAS = { language: "languages", code: "coding", "learn to code": "coding", python: "coding", javascript: "coding", math: "maths", mathematics: "maths", "speed reading": "reading", english: "languages", spanish: "languages", french: "languages", german: "languages", japanese: "languages", chinese: "languages", "a language": "languages", "public speaking": "speaking", presentations: "speaking", presentation: "speaking", speeches: "speaking", "negotiation": "negotiating", "leading": "leadership", "lead": "leadership", exams: "studying", exam: "studying", study: "studying", interview: "interviews", "job interviews": "interviews", organized: "organisation", organised: "organisation", organization: "organisation", organisation: "organisation", declutter: "organisation", "time-management": "time management", "football (soccer)": "soccer", bike: "cycling", biking: "cycling", sing: "singing", draw: "drawing", paint: "painting", write: "writing", "creative writing": "writing", essays: "writing", cook: "cooking", bake: "baking", swim: "swimming", run: "running", jog: "running", "photos": "photography", photos: "photography", "dance": "dancing", "ski": "skiing", "surf": "surfing", "martial arts": "karate", garden: "gardening", "the guitar": "guitar", "the piano": "piano", "the drums": "drums", "the violin": "violin", violin: "violin", ukulele: "guitar", bass: "guitar", cello: "violin", flute: "piano", saxophone: "piano" };
  SKILL.violin = "practise a little every day; start with open strings and good bow technique; use a tuner and a metronome; play scales slowly in tune; and take lessons, since small posture habits are hard to fix later";
  SKILL.science = "ask why things work; do simple experiments; read widely; learn the maths that sits underneath; and explain what you learn to someone else";
  SKILL.history = "read stories as well as dates; connect events with cause and effect; use timelines and maps; and ask whose voice is missing from the account";

  var LIFE = [
    [/\b(?:productive|productivity|get more done|get things done|efficient)\b/, "To be more productive, pick the one or two most important tasks each day, work in focused blocks of 25 to 50 minutes with short breaks, switch off notifications, plan tomorrow tonight, and protect your sleep."],
    [/\b(?:confident|confidence|self[- ]esteem|believe in myself)\b/, "To build confidence, set small goals and achieve them, prepare well, practise the skills you worry about, challenge harsh self-talk, stand tall, and notice your progress."],
    [/\b(?:happier|happiness|be happy|more happy|feel better|cheer up)\b/, "To be happier, keep regular sleep, exercise and time outside, spend time with people you care about, do things that matter to you, write down three good things each day, and limit doomscrolling."],
    [/\b(?:wake up early|get up early|wake early|morning person|early riser|get up earlier|wake up earlier)\b/, "To wake up earlier, move your bedtime earlier by 15 minutes at a time, keep the same schedule every day, get bright light soon after waking, avoid screens and caffeine late in the day, and put the alarm across the room."],
    [/\b(?:overthinking|over-thinking|overthink|stop worrying|worry less|ruminat\w+)\b/, "To stop overthinking, notice the loop and name it, write the worry down with one next step, set a short daily worry time, do something physical or absorbing, and remember that you cannot predict everything."],
    [/\b(?:motivat\w+|stay motivated|keep going|lack of motivation|find motivation)\b/, "To stay motivated, set a clear goal, break it into small steps, make the first step tiny, track progress where you can see it, reward yourself, and find someone to keep you accountable."],
    [/\b(?:ask (?:someone|somebody|a girl|a guy|him|her|my crush) out|ask out|a date with someone|get a date|approach (?:a girl|a guy)|talk to (?:a girl|a guy|my crush)|flirt)\b/, "To ask someone out, choose a relaxed moment, be direct and kind (\"I'd love to take you to dinner. Would you like to?\"), suggest a simple plan, accept a no gracefully, and be yourself."],
    [/\b(?:say no|saying no|turn down|decline (?:an invitation|politely)|set boundaries|boundaries)\b/, "To say no politely, be clear and brief, thank them, give a short reason if you like (you do not owe one), offer an alternative only if you want to, and do not over-apologise."],
    [/\b(?:make (?:a )?decisions?|decide|decision[- ]making|can'?t decide|choose between)\b/, "To make a decision, define what matters most, list the options, weigh them against your priorities, set a deadline, sleep on big ones, and remember that a good decision now usually beats a perfect one never."],
    [/\b(?:good listener|listen better|listening skills|be a better listener)\b/, "To be a good listener, give your full attention, do not interrupt, ask open questions, repeat back what you heard, and hold back advice until you are asked."],
    [/\b(?:remember names|remembering names|forget names)\b/, "To remember names, repeat the name when you hear it, use it in the conversation, link it to an image or feature, and write it down afterwards."],
    [/\b(?:read more|reading habit|read more books)\b/, "To read more, keep a book with you, read for 15 minutes at a set time, choose books you enjoy, put your phone in another room, and let yourself quit books you dislike."],
    [/\b(?:drink more water|stay hydrated|hydrate|more water)\b/, "To drink more water, keep a bottle with you, set reminders, drink a glass with each meal, add lemon or fruit for flavour, and eat water-rich foods such as cucumber and oranges."],
    [/\b(?:anxious|anxiety|panic|calm down|nervous|calm myself|relax)\b/, "To calm anxiety in the moment, slow your breathing (in for four, out for six), ground yourself with the 5-4-3-2-1 senses exercise, move your body, and talk to someone you trust. If it is frequent or overwhelming, a doctor or counsellor can help."],
    [/\b(?:lonely|loneliness|feel alone|no friends)\b/, "To feel less lonely, reach out to one person today, join a group around something you enjoy, volunteer, build small routines with other people, and be patient with new friendships. If the feeling is heavy and lasting, talk to a doctor or counsellor."],
    [/\b(?:eat healthier|eat healthy|healthy eating|healthier diet|eat better|eat well)\b/, "To eat healthier, build meals around vegetables, whole grains, lean protein and healthy fats, cook at home more, limit sugary drinks and ultra-processed snacks, and eat slowly and mindfully."],
    [/\b(?:start (?:a )?(?:small )?business|open a business|become an entrepreneur|launch a startup|start a company)\b/, "To start a business, find a problem people will pay to solve, test the idea cheaply with real customers, write a simple plan, handle the legal and tax basics, keep costs low, and start small."],
    [/\b(?:start (?:a )?blog|write a blog|begin blogging)\b/, "To start a blog, pick a topic you can write about for a long time, choose a simple platform, write a few posts before launching, post on a regular schedule, and share your work with people who care about the topic."],
    [/\b(?:start (?:a )?podcast)\b/, "To start a podcast, pick a clear topic and audience, get a decent microphone, plan your first few episodes, record in a quiet room, edit lightly, and publish on a podcast host that sends to the main apps."],
    [/\b(?:learn to code|learn coding|learn programming|become a programmer|learn python|learn javascript)\b/, "To learn to code, pick one beginner-friendly language such as Python or JavaScript, follow a structured course, build small projects, read other people's code, and practise a little every day."],
    [/\b(?:buy a car|buying a car|buy a used car|purchase a car)\b/, "To buy a car, set a total budget, decide what you need, research reliability and running costs, check the history of a used car, test drive more than one, get an independent inspection, and compare finance offers before you sign."],
    [/\b(?:move house|moving house|move out|moving out|relocate|moving day|moving checklist)\b/, "To move house, declutter first, book movers or a van early, pack room by room and label boxes, pack an essentials box, redirect your mail and update your address, and clean the old place before you hand back the keys."],
    [/\b(?:get a job|find a job|job hunt|job search|get hired|land a job)\b/, "To find a job, update your resume and online profiles, tell people you are looking, apply to roles that fit, tailor each application, prepare for interviews, and follow up politely."],
    [/\b(?:make money online|earn money online|work from home)\b/, "To earn money online, sell a skill you have (writing, design, programming, tutoring), try freelance platforms, sell crafts or second-hand items, and avoid anything that asks you to pay up front for a promise of easy money."],
    [/\b(?:make (?:a )?good first impression|first impressions)\b/, "To make a good first impression, arrive on time, smile and make eye contact, offer a firm handshake or friendly greeting, listen, show interest in the other person, and dress for the occasion."],
    [/\b(?:small talk|make conversation|start a conversation|talk to strangers|conversation skills)\b/, "To make small talk, start with something shared (the place, the weather, the event), ask open questions, listen for something to follow up on, share a little about yourself, and it is fine to end it politely."],
    [/\b(?:get over (?:a )?(?:breakup|break-up)|heartbreak|broken heart|after a breakup)\b/, "To get through a breakup, let yourself feel it, lean on friends and family, keep routines like sleep and exercise, limit contact for a while, do things you enjoy, and give it time. If it feels too heavy, talk to a counsellor."],
    [/\b(?:deal with (?:a )?(?:difficult|toxic|rude) (?:people|person|boss|coworker|colleague)|difficult people|annoying coworker|bad boss)\b/, "To deal with a difficult person, stay calm, be clear and specific about the behaviour that bothers you, set boundaries, keep a record at work, and involve a manager or HR if it continues."],
    [/\b(?:burnout|burned out|burnt out|too much work)\b/, "To recover from burnout, rest properly, cut back what you can, set firm work boundaries, move and sleep well, spend time on things you enjoy, and talk to your manager or a doctor if it continues."],
    [/\b(?:learn faster|learn quickly|learn better|study smarter)\b/, "To learn faster, test yourself instead of rereading, space your practice over days, mix related topics, explain ideas aloud, sleep well, and apply what you learn right away."],
    [/\b(?:improve (?:my )?(?:attention span)|concentrate (?:better|more)|focus (?:better|more)|stay focused|improve focus|better focus)\b/, "To focus better, work on one thing at a time, silence notifications, use a timer for 25 minutes of work and then a short break, keep your phone out of reach, and sleep, eat and move regularly."],
    [/\b(?:stress|stressed|deal with stress|cope with stress|handle stress|reduce stress|manage stress)\b/, "To manage stress, break problems into small steps, move your body, sleep well, take short breaks, breathe slowly, talk to someone, and cut back on what you can. If it feels too much, a doctor or counsellor can help."]
  ];

  /* ------------------------------------------------------------ letters and messages */
  var LETTER = [
    [/\bthank[- ]?you (?:note|letter|card|message|email|e-mail|text)\b|\bthank (?:someone|my \w+|him|her|them) (?:for|in writing)\b/, "Dear [Name],\n\nThank you so much for [the gift / your help / your time]. [One specific sentence about what it meant or how you will use it.] I really appreciate your kindness.\n\nWarm regards,\n[Your name]"],
    [/\bapolog(?:y|ise|ize) (?:note|letter|message|email|text)\b|\bwrite an apology\b|\bsay sorry in writing\b/, "Dear [Name],\n\nI am sorry for [what happened]. I understand it [affected you in this way], and I take responsibility for my part. [What you will do to make it right or prevent it happening again.]\n\nThank you for listening.\n\n[Your name]"],
    [/\bresignation (?:letter|email|notice)\b|\bquit my job\b|\bresign\b/, "Dear [Manager's name],\n\nPlease accept this letter as notice of my resignation from my position as [job title], effective [last day, usually two weeks from now]. Thank you for the opportunities I have had here. I will do everything I can to make the handover smooth.\n\nSincerely,\n[Your name]"],
    [/\bcomplaint (?:letter|email|message)\b|\bcomplain to\b|\bwrite a complaint\b/, "Dear [Company / Name],\n\nI am writing to complain about [product / service] that I [bought / received] on [date]. [Describe what went wrong, briefly and factually.] I would like [a refund / a replacement / a fix]. Please reply by [date].\n\nSincerely,\n[Your name and order number]"],
    [/\binvitation\b|\binvite (?:someone|people|friends)\b/, "You are invited!\n\n[Event] on [date] at [time], at [place]. [One line about dress, food or what to bring.] Please let me know by [date] if you can come.\n\n[Your name]"],
    [/\bcondolence\b|\bsympathy (?:note|card|message)\b|\bsorry for your loss\b/, "Dear [Name],\n\nI was so sorry to hear about the loss of [name]. [A kind memory or a quality you admired.] I am thinking of you and your family, and I am here if you need anything.\n\nWith love,\n[Your name]"],
    [/\bcongratulat(?:ion|ions|e)\b (?:note|message|email|card)|\bcongratulate\b/, "Dear [Name],\n\nCongratulations on [the achievement]! You have worked hard for this and you deserve it. I am so happy for you.\n\nBest wishes,\n[Your name]"],
    [/\bbirthday (?:message|wish|wishes|card|note|text)\b/, "Happy birthday, [Name]! I hope your day is filled with good food, good company and plenty of cake. Thank you for being such a great [friend / sister / colleague]. Here is to another wonderful year!"],
    [/\bfollow[- ]?up (?:email|message)\b|\bafter (?:an |the )?interview\b.*\b(?:thank|email)\b|\bthank[- ]you email after\b/, "Subject: Thank you, [Job title] interview\n\nDear [Name],\n\nThank you for taking the time to talk with me about the [job title] role. I enjoyed learning about [something specific from the conversation], and it made me even more interested in joining [company]. Please let me know if I can provide anything else.\n\nBest regards,\n[Your name]"],
    [/\b(?:time off|day off|leave|vacation) (?:request|email|letter)\b|\brequest (?:time off|leave|a day off)\b/, "Subject: Time off request, [dates]\n\nHi [Manager's name],\n\nI would like to request time off from [start date] to [end date]. I will make sure my work is covered or finished before I leave, and I am happy to talk through the details.\n\nThank you,\n[Your name]"],
    [/\bout[- ]of[- ]office\b|\bauto[- ]?reply\b/, "Subject: Out of office\n\nThank you for your message. I am out of the office from [date] to [date] with limited access to email. For urgent matters please contact [name] at [email]. I will reply when I am back.\n\nBest regards,\n[Your name]"],
    [/\bintroduc(?:e|tion) (?:email|message|myself)\b|\bcold email\b/, "Subject: [Short, specific subject]\n\nHi [Name],\n\nMy name is [Your name] and I [one line about who you are]. I am reaching out because [reason that matters to them]. Would you be open to [a short call / a reply / a quick question]? Thank you for your time.\n\nBest,\n[Your name]"],
    [/\bmeeting (?:request|invite|email)\b|\bschedule a meeting\b|\bask for a meeting\b/, "Subject: Meeting request, [topic]\n\nHi [Name],\n\nCould we meet for [20-30 minutes] to talk about [topic]? I am free on [two or three options]. Let me know what suits you and I will send an invitation.\n\nThanks,\n[Your name]"],
    [/\brecommendation (?:letter|request)\b|\bask for a (?:reference|recommendation)\b/, "Subject: Request for a recommendation\n\nDear [Name],\n\nI hope you are well. I am applying for [position / programme], and I would be grateful if you could write a recommendation. I would be happy to send my resume and a short summary of what we worked on. The deadline is [date]. Thank you so much.\n\nBest regards,\n[Your name]"],
    [/\bget[- ]well (?:message|card|note)\b|\bfeel better soon\b/, "Dear [Name],\n\nI was sorry to hear you have been unwell. I am thinking of you and hope you feel better soon. Please let me know if I can bring you anything or help in any way.\n\nWith love,\n[Your name]"],
    [/\bwedding (?:toast|speech)\b|\bbest man speech\b/, "Good evening, everyone. I am [name], [relationship] to [the couple]. I have known [name] for [time], and from the moment [they] met [partner], I could see [something specific]. [One short, kind story.] So please raise your glasses to [names]: may your life together be full of love, laughter and good company. Cheers!"]
  ];

  /* ------------------------------------------------------------ plans */
  var PLAN = [
    [/\b(?:beginner |starter |simple |basic )?(?:workout|exercise|fitness|gym|training) (?:plan|routine|schedule|programme|program)\b|\bplan (?:a |my )?(?:workout|exercise routine)\b|\bworkout routine\b/, "A simple beginner plan, three days a week with a rest day between:\nDay 1: 10 minutes brisk walk to warm up, then 2 rounds of 10 squats, 8 push-ups (on knees if needed), 20-second plank and 10 lunges each side.\nDay 2: rest or a 30-minute walk.\nDay 3: 20 minutes of easy jogging or cycling, then stretching.\nDay 4: rest.\nDay 5: repeat Day 1 and add one more round.\nIncrease a little each week, drink water, and stop if anything hurts. If you have a health condition, check with a doctor first."],
    [/\b(?:5k|couch to 5k|running|run|jogging) (?:plan|programme|program|schedule|training)\b|\btrain for (?:a |my first )?5k\b|\bstart running plan\b/, "A gentle run-walk plan, three days a week for eight weeks:\nWeeks 1-2: run 1 minute, walk 2 minutes, repeat for 20 minutes.\nWeeks 3-4: run 3 minutes, walk 2 minutes, repeat for 25 minutes.\nWeeks 5-6: run 5 minutes, walk 1 minute, repeat for 30 minutes.\nWeeks 7-8: run 20 to 30 minutes without stopping.\nGo slowly enough to talk, rest between sessions, and wear proper shoes."],
    [/\bstudy (?:plan|schedule|timetable|routine)\b|\bplan (?:my )?(?:study|revision)\b|\brevision (?:plan|timetable)\b/, "A simple study week:\n1. List every subject or topic and the exam date.\n2. Give the hardest topics the most time, in the hours when you focus best.\n3. Study in blocks of 25 to 45 minutes with 5-10 minute breaks.\n4. Mix: new material, practice questions and review.\n5. Review last week's notes every weekend and test yourself.\n6. Leave one evening free and sleep at least 7 hours."],
    [/\bmeal (?:plan|prep|planning)\b|\bweekly meal\b|\bplan (?:my |the )?meals\b/, "A simple meal-planning method:\n1. Pick 4 dinners for the week and choose one that makes leftovers.\n2. Write a shopping list from those recipes and check what you already have.\n3. Prep on one day: cook a grain (rice or pasta), roast vegetables, wash salad and cook a protein.\n4. Plan easy breakfasts (oats, eggs, yogurt) and lunches (leftovers or sandwiches).\n5. Keep one 'flex' night for eating out or using up leftovers."],
    [/\bbudget (?:plan|template)\b|\bmake (?:a |my )?budget\b|\bcreate (?:a |my )?budget\b|\bplan (?:my |a )?budget\b/, "A simple budget (the 50/30/20 rule):\n1. Work out your monthly take-home income.\n2. Spend about 50% on needs (rent, bills, groceries, transport).\n3. About 30% on wants (eating out, hobbies, shopping).\n4. Save or pay off debt with about 20%.\n5. Track spending for a month, adjust the percentages to fit your life, and build an emergency fund of three to six months of expenses."],
    [/\b(?:morning|evening|daily|bedtime|night) routine\b|\bplan (?:my )?(?:day|morning)\b/, "A simple routine to adapt:\nMorning: wake at the same time, drink water, get light and move for 5 to 10 minutes, eat something, and decide your top three tasks for the day.\nDaytime: work in focused blocks with breaks, eat lunch away from your screen, and take a short walk.\nEvening: stop screens an hour before bed, prepare tomorrow's clothes and tasks, and go to bed at the same time each night."],
    [/\b(?:30[- ]day|thirty[- ]day|one month|monthly) challenge\b/, "A 30-day challenge that tends to work: pick one small daily action (10 minutes of walking, writing, stretching or practising a skill), put it in a fixed time slot, mark each day on a calendar, never skip two days in a row, and review at the end of the month."],
    [/\bparty (?:plan|planning)\b|\bplan (?:a |my |the )?(?:party|birthday|dinner party|baby shower|surprise)\b/, "A simple way to plan a party:\n1. Pick the date, budget and guest list.\n2. Choose a place and a simple theme.\n3. Send invitations two to three weeks ahead and ask for replies.\n4. Plan food and drink (and check allergies), plus one or two activities or a playlist.\n5. Shop and prepare the day before.\n6. On the day, set up early so you can enjoy it."]
  ];
  function tripPlan(dest, env) {
    var d = dest.replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\b(Of|The|And)\b/g, function (w) { return w.toLowerCase(); });
    var facts = [];
    if (env && typeof env.fact === "function") {
      ["What is the capital of " + d + "?", "What language is spoken in " + d + "?", "What currency does " + d + " use?"].forEach(function (q) { try { var f = env.fact(q); if (f && f.length < 160) facts.push(f); } catch (e) {} });
    }
    return "A simple way to plan a trip to " + d + ":\n1. Decide when to go and for how long, and set a total budget.\n2. Check passport validity, visa and health requirements early.\n3. Book flights and a place to stay, ideally with free cancellation.\n4. List the three or four things you most want to see and group them by area to save travel time.\n5. Plan getting around (trains, buses, taxis or a rental) and how you will pay (cards, cash, local currency).\n6. Look at the weather for your dates and pack light, with copies of your documents and travel insurance.\n7. Leave some free time for surprises." + (facts.length ? "\nA few basics: " + facts.join(" ") : "");
  }

  /* ------------------------------------------------------------ helpers and dispatch */
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function res(a, sch, conf) { return { answer: a, schema: sch, confidence: conf || 0.84 }; }
  function skillKey(x) {
    x = String(x || "").toLowerCase().replace(/^(?:the |a |an |my |at |in |to |with |your |some )+/, "").replace(/[^a-z' -]/g, "").trim();
    if (SKILL[x]) return x;
    if (SKILL_ALIAS[x]) return SKILL_ALIAS[x];
    var w = x.split(" ");
    for (var i = 0; i < w.length; i++) { if (SKILL[w[i]]) return w[i]; if (SKILL_ALIAS[w[i]]) return SKILL_ALIAS[w[i]]; }
    return "";
  }

  function recommend(l) {
    var m = l.match(/\b(?:recommend|suggest|any good|got any|know any|what(?:'s| is) a good|what(?:'s| is) (?:something )?good to|what should i (?:watch|read|play|listen to)|something to (?:watch|read|play|listen to)|good (?:movie|film|book|show|series|game|podcast|anime|album)s?|(?:movie|film|book|show|game|podcast|anime|album|song|music)s? (?:to|for|recommendations?|suggestions?))\b/);
    if (!m && !/\b(?:movie|film|book|novel|show|series|podcast|anime|game|album|music|song)s?\b.*\b(?:recommendation|suggestion|recommend|suggest)s?\b/.test(l)) return null;
    var medium = "", mm = l.match(/\b(movies?|films?|flicks?|books?|novels?|reads?|shows?|series|tv shows?|tv series|television|netflix|podcasts?|anime|animes|cartoons?|games?|video games?|board games?|card games?|albums?|songs?|music|bands?|artists?|singers?|playlists?|activities|things to do|hobby|hobbies|pastimes?|sports?|skills?)\b/);
    if (mm) { var w = mm[1].replace(/s$/, ""); medium = SYN_M[mm[1]] || SYN_M[w] || w; }
    if (/\bwatch\b/.test(l) && !medium) medium = /\banime\b/.test(l) ? "anime" : "movie";
    if (/\bread\b/.test(l) && !medium) medium = "book";
    if (/\bplay\b/.test(l) && !medium) medium = "game";
    if (/\blisten\b/.test(l) && !medium) medium = "music";
    if (/\bboard game/.test(l)) medium = "game"; if (/\bcard game/.test(l)) medium = "game"; if (/\bvideo game/.test(l)) medium = "game";
    if (!R[medium]) return null;
    var genre = "_", gm = GENRES;
    for (var i = 0; i < gm.length; i++) if (gm[i][1].test(l) && R[medium][gm[i][0]]) { genre = gm[i][0]; break; }
    var bank = R[medium][genre], key = medium + ":" + genre;
    var n = (l.match(/\b(\d+|two|three|four|five)\b/) || [])[1]; var N = n ? ({ two: 2, three: 3, four: 4, five: 5 }[n] || +n) : 1; N = Math.max(1, Math.min(N, 5));
    var firstIdx = Math.floor(Math.random() * bank.length), items = [];
    for (var k = 0; k < N; k++) items.push(bank[(firstIdx + k) % bank.length]);
    lastRec = { key: key, idx: (firstIdx + N - 1) % bank.length };
    var label = { movie: "movie", book: "book", show: "show", music: "listen", game: "game", podcast: "podcast", anime: "anime", activity: "idea", hobby: "hobby", sport: "sport", skill: "skill" }[medium];
    if (N === 1) return res("How about " + items[0] + "? Say \"another\" if you would like a different " + label + ".", "advice:recommend");
    return res("A few suggestions:\n" + items.map(function (x, q) { return (q + 1) + ". " + cap(x); }).join("\n"), "advice:recommend");
  }

  function solve(text, env) {
    var s = String(text || "").trim();
    if (!s || s.length > 200) return null;
    var l = s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").replace(/^(?:hey|hi|hello|please|ok|okay|so|um|well|can you|could you|would you|can you please|i need to know|i was wondering|do you have any|do you know)[, ]+/, "").replace(/[?!.]+$/, "").trim();
    var m;

    /* "another" / "something else" after a recommendation */
    if (lastRec.key && /^(?:another(?: one)?|give me another|one more|something else|next(?: one)?|different one|more|show me another|any others?|what else)$/.test(l)) {
      var parts = lastRec.key.split(":"), bank = R[parts[0]] && R[parts[0]][parts[1]];
      if (bank) { var j = (lastRec.idx + 1 + Math.floor(Math.random() * 2)) % bank.length; lastRec.idx = j; return res("How about " + bank[j] + "?", "advice:recommend"); }
    }

    /* recommendations */
    var rc = recommend(l); if (rc) return rc;

    /* what to do */
    if (/^(?:what should i do (?:this |on the |today|tonight|tomorrow|with my free time|when i(?:'m| am) bored)|what can i do (?:this |on the )?(?:weekend|today|tonight)|any (?:ideas|suggestions) for (?:the |this )?weekend|something fun to do|things to do (?:this |on the )?weekend|i need something to do|what to do (?:this |on the )?weekend|plans for the weekend)/.test(l)) {
      var A = R.activity._, i0 = Math.floor(Math.random() * A.length);
      return res("A few ideas: " + [A[i0], A[(i0 + 3) % A.length], A[(i0 + 7) % A.length]].join("; ") + ". Want more ideas, or something specific such as indoors, outdoors, cheap or with friends?", "advice:activities");
    }

    /* names */
    if ((m = l.match(/^(?:what should i|what can i|help me|how should i|any ideas to|i need to|ideas to) (?:name|call) (?:my |our |the |a )?(?:new )?(dog|puppy|cat|kitten|pet|fish|goldfish|hamster|rabbit|bird|parrot|horse|turtle|baby|son|daughter|boy|girl|company|business|startup|band|team|blog|channel|character|boat|car)$/))) {
      var kindN = m[1], pools = {
        dog: ["Buddy", "Luna", "Max", "Bella", "Milo", "Daisy", "Charlie", "Rosie", "Rocky", "Ziggy"], puppy: null, cat: ["Luna", "Milo", "Oliver", "Willow", "Simba", "Pepper", "Mochi", "Shadow", "Ginger", "Cleo"], kitten: null, pet: ["Buddy", "Luna", "Biscuit", "Pepper", "Mochi", "Ziggy", "Olive", "Nova"],
        fish: ["Bubbles", "Finn", "Nemo", "Goldie", "Splash", "Sushi", "Marlin", "Coral"], hamster: ["Peanut", "Nibbles", "Pumpkin", "Biscuit", "Cocoa", "Hazel", "Cheeky"], rabbit: ["Clover", "Thumper", "Biscuit", "Peter", "Hazel", "Bun-Bun"], bird: ["Kiwi", "Sunny", "Tweety", "Mango", "Pip", "Rio"], parrot: ["Kiwi", "Mango", "Rio", "Captain", "Sunny", "Polly"], horse: ["Spirit", "Shadow", "Maverick", "Willow", "Apollo", "Bella"], turtle: ["Shelly", "Franklin", "Speedy", "Squirt", "Crush", "Leo"],
        baby: ["Olivia", "Noah", "Amelia", "Liam", "Sophia", "Elijah", "Isla", "Lucas", "Harper", "Mason"], company: ["Bright Harbor", "North Star Studio", "Willow & Wren", "Bluebird Labs", "Maple Lane Co.", "Quill & Compass", "Evergreen Works"], band: ["The Night Owls", "Blue Horizon", "The Quiet Storm", "Paper Tigers", "Neon Echo", "The Wild Cards"], team: ["The Night Owls", "Thunder Bolts", "Paper Tigers", "The Wild Cards", "Silver Foxes", "Copper Hearts"],
        blog: ["The Daily Spark", "Small Steps", "Notes from the Margin", "Open Window", "The Curious Corner"], channel: ["The Curious Corner", "Open Window", "Small Steps", "Bright Idea", "The Daily Spark"], character: ["Elara", "Jasper", "Mira", "Caspian", "Tessa", "Rowan", "Nolan", "Sable"], boat: ["Sea Breeze", "Wanderer", "Blue Heron", "Salty Dog", "Serenity", "Odyssey"], car: ["Bumblebee", "Herbie", "Lightning", "Ruby", "Old Faithful", "Zoom"]
      };
      pools.puppy = pools.dog; pools.kitten = pools.cat; pools.son = pools.boy = pools.daughter = pools.girl = pools.baby; pools.startup = pools.business = pools.company;
      var pool = pools[kindN].slice(), st = Math.floor(Math.random() * pool.length), pk = [];
      for (var q = 0; q < 4; q++) pk.push(pool[(st + q) % pool.length]);
      return res("Some ideas: " + pk.join(", ") + ". Tell me a little about " + (/baby|son|daughter|boy|girl/.test(kindN) ? "the style you like" : "its personality or colour") + " and I can narrow it down.", "advice:names");
    }

    /* get better at / learn a skill */
    if ((m = l.match(/^(?:how (?:do|can|could|should|would) (?:i|you|we|one) (?:get|become|be|grow|go from)(?: much| a lot| a bit| even)? (?:better|good|great|decent|skilled|an expert|improved|proficient|more skilled) (?:at|in|with|on)|how (?:do|can|could|should) (?:i|you|we|one) (?:improve|practise|practice|train|work on|level up|master|boost) (?:at |my |your |in |with |on )?|how to (?:get|become|be) (?:better|good|great|decent) (?:at|in|with)|how to (?:improve|practise|practice|master) (?:my |your |at |in )?|tips (?:for|on) (?:getting better at|improving|improving my|learning|learning to|playing|mastering)|tips to (?:improve|get better at)|advice (?:for|on) (?:getting better at|improving|learning)|ways to (?:improve|get better at|get good at)|help me (?:get|become) better at|how (?:do|can) i (?:learn|learn to|learn how to|start|start playing|start learning|pick up|get started with|get started in|begin|begin learning|get into)|how to (?:learn|learn to|start|pick up|get into|get started with)|best way to (?:learn|learn to|get better at|improve at|practice|practise)|how to be a (?:better|good|great) )\s*(.+)$/))) {
      var sk = skillKey(m[1]);
      if (sk && SKILL[sk]) return res((/\b(?:learn|start|pick up|get into|get started|begin|started)\b/.test(m[0]) && !/better|improve|master|practi[sc]e/.test(m[0]) ? "To learn " : "To get better at ") + sk + ", " + SKILL[sk] + ".", "advice:skill", 0.82);
      var raw = m[1].replace(/^(?:a |an |the |my |your |being |becoming )/, "").trim();
      if (/(?:^|\b)(?:writer|speaker|cook|runner|leader|listener|player|reader|dancer|singer|artist|driver|learner|student|friend|partner|parent|swimmer|cyclist|thinker|communicator|manager|teacher|negotiator)$/.test(raw)) {
        var noun = raw.match(/(writer|speaker|cook|runner|leader|listener|player|reader|dancer|singer|artist|driver|learner|student|friend|partner|parent|swimmer|cyclist|thinker|communicator|manager|teacher|negotiator)$/)[1];
        var map = { writer: "writing", speaker: "speaking", cook: "cooking", runner: "running", leader: "leadership", listener: null, reader: "reading", dancer: "dancing", singer: "singing", artist: "drawing", swimmer: "swimming", cyclist: "cycling", learner: null, student: "studying", manager: "management", negotiator: "negotiating", communicator: "speaking" };
        if (map[noun] && SKILL[map[noun]]) return res("To become a better " + noun + ", " + SKILL[map[noun]] + ".", "advice:skill", 0.82);
        if (noun === "listener") return res(LIFE[9][1], "advice:life", 0.82);
      }
    }
    if ((m = l.match(/^how (?:do|can|could|should|would|to)\s*(?:i|you|we|one)?\s*(?:become|be|get to be|grow into) (?:a |an )?(?:much |a lot |far |even )?(?:better|good|great) ([a-z]+)$/))) {
      var nm0 = m[1], mp0 = { writer: "writing", speaker: "speaking", cook: "cooking", runner: "running", leader: "leadership", reader: "reading", dancer: "dancing", singer: "singing", artist: "drawing", swimmer: "swimming", cyclist: "cycling", student: "studying", manager: "management", negotiator: "negotiating", communicator: "speaking", programmer: "coding", coder: "coding", photographer: "photography", guitarist: "guitar", pianist: "piano", drummer: "drums", golfer: "golf", driver: null, listener: null, parent: null, friend: null };
      if (nm0 === "listener") return res(LIFE[9][1], "advice:life", 0.82);
      if (mp0[nm0] && SKILL[mp0[nm0]]) return res("To become a better " + nm0 + ", " + SKILL[mp0[nm0]] + ".", "advice:skill", 0.82);
    }
    if ((m = l.match(/^how (?:do|can|should|would) (?:i|you|we|one) (?:get|become|be) (?:better|good|great) (?:at|in) (.+)$/)) || (m = l.match(/^how (?:do|can) i get better at (.+)$/))) {
      var gk = skillKey(m[1]);
      if (!gk) {
        var thing = m[1].replace(/^(?:a |an |the |my |your |being |becoming )/, "").trim();
        if (thing && thing.split(" ").length <= 4 && /^[a-z' -]+$/.test(thing)) return res("To get better at " + thing + ": practise a little every day instead of rarely for long, focus on the part you find hardest, get feedback from someone more experienced, study how experts do it, and keep a record of your progress. (I don't have specific tips for " + thing + " yet.)", "advice:skill-generic", 0.6);
      }
    }

    /* letters and messages */
    if (/\b(?:write|draft|compose|help me write|help me with|need|make|create|give me|show me|can you write)\b/.test(l) || /^(?:a |an )?(?:template|example)\b/.test(l)) {
      for (var li = 0; li < LETTER.length; li++) if (LETTER[li][0].test(l) && !/\b(?:poem|song|story|essay|code|program|script|haiku|limerick)\b/.test(l)) return res(LETTER[li][1] + "\n\n(Fill in the brackets and adjust the tone to the person.)", "advice:letter", 0.8);
    }
    /* plans */
    if ((m = l.match(/^(?:can you |could you )?(?:help me )?(?:plan|organi[sz]e|put together|set up|create|make|build|design|give me|i(?:'d| would) like|i want) (?:me )?(?:a |an |my |the )?(?:trip|vacation|holiday|visit|getaway|journey|itinerary|travel plan|travel|vacation plan)(?: plan| itinerary)?(?: (?:to|for|in|around)(?: the)? (.+))?$/)) || (m = l.match(/^(?:i(?:'m| am) )?(?:going|travelling|traveling|planning to go|planning a trip|visiting|heading) (?:on a trip )?(?:to|in) (.+?)(?: (?:soon|next \w+|this \w+|in \w+))?(?:,? (?:can you )?(?:help|any tips|what should i).*)?$/)) || (m = l.match(/^(?:help me )?plan (?:a |my )?(?:trip|vacation|holiday) to (.+)$/))) {
      var dest = (m[1] || "").replace(/^(?:visit |go to |travel to )/, "").replace(/[^a-z' -]/g, "").trim();
      if (m[1] === undefined || dest) {
        if (dest && dest.split(" ").length <= 4) return res(tripPlan(dest, env), "advice:trip", 0.78);
        if (!dest) return res("Happy to help plan a trip. Tell me where you'd like to go and for how long, and I'll give you a checklist; a rough budget and what you enjoy (food, nature, history, relaxing) helps too.", "advice:trip", 0.7);
      }
    }
    for (var pi = 0; pi < PLAN.length; pi++) if (PLAN[pi][0].test(l) && /\b(?:plan|routine|schedule|programme|program|challenge|prep|planning|template|timetable|budget|give me|make|create|build|help me|design|how do i|how to)\b/.test(l)) return res(PLAN[pi][1], "advice:plan", 0.8);

    /* life advice: only when the question is clearly asking how */
    if (/^(?:how (?:do|can|could|should|would|to)|what(?:'s| is) (?:the )?(?:best )?(?:way|tip|tips|advice)|tips (?:for|on|to)|advice (?:for|on)|ways to|any (?:tips|advice)|help me|i(?:'m| am) (?:struggling|having trouble|trying) |i want to|i need to|how come|what can i do)/.test(l) || /^(?:i(?:'m| am) )?(?:so |really |very |feeling )?(?:stressed|anxious|nervous|lonely|unmotivated|overwhelmed|burned out|burnt out|unproductive)/.test(l)) {
      for (var xi = 0; xi < LIFE.length; xi++) if (LIFE[xi][0].test(l)) return res(LIFE[xi][1], "advice:life", 0.8);
    }
    return null;
  }

  root.C4LMAdvice = { solve: solve, skills: SKILL, recs: R, active: function () { return !!lastRec.key; } };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMAdvice;
})(typeof window !== "undefined" ? window : globalThis);
