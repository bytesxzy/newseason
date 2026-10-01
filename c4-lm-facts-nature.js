/* Nature, body, chemistry, space and mathematics facts, second wave. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];

  /* animals: name | class | diet | habitat/fact */
  [
    "blue whale|mammal|krill|the oceans, and it is the largest animal that has ever lived, up to about 30 metres long and 190 tonnes", "African elephant|mammal|plants|the African savanna and forest, and it is the largest land animal",
    "giraffe|mammal|leaves|the African savanna, and it is the tallest animal, up to about 5.5 metres tall", "cheetah|mammal|meat|the African savanna, and it is the fastest land animal, reaching about 110 kilometres per hour",
    "peregrine falcon|bird|birds|cliffs and cities worldwide, and it is the fastest animal, diving at over 300 kilometres per hour", "ostrich|bird|plants and insects|the African savanna, and it is the largest and heaviest living bird, which cannot fly",
    "bee hummingbird|bird|nectar|Cuba, and it is the smallest bird in the world", "emperor penguin|bird|fish|Antarctica, and it is the largest penguin", "albatross|bird|fish and squid|the southern oceans, and it has the longest wingspan of any bird", "bald eagle|bird|fish|North America, and it is the national bird of the United States",
    "Komodo dragon|reptile|meat|the islands of Indonesia, and it is the largest living lizard", "saltwater crocodile|reptile|meat|northern Australia and Southeast Asia, and it is the largest living reptile", "green anaconda|reptile|meat|South America, and it is the heaviest snake",
    "reticulated python|reptile|meat|Southeast Asia, and it is the longest snake", "king cobra|reptile|snakes|South and Southeast Asia, and it is the longest venomous snake", "Galapagos tortoise|reptile|plants|the Galapagos Islands, and it is the largest living tortoise and can live over a hundred years",
    "whale shark|fish|plankton|warm oceans, and it is the largest fish in the world", "great white shark|fish|seals and fish|coastal oceans worldwide, and it is the largest predatory fish", "sailfish|fish|fish|warm oceans, and it is among the fastest fish", "seahorse|fish|plankton|shallow seas, and the male carries the eggs",
    "giant squid|mollusc|fish|the deep ocean, and it is among the largest invertebrates", "octopus|mollusc|crabs and fish|the oceans, and it has eight arms, three hearts and blue blood", "honey bee|insect|nectar|worldwide, and it makes honey and pollinates flowers", "monarch butterfly|insect|nectar|North America, and it migrates thousands of kilometres",
    "ant|insect|varied foods|worldwide, and ants live in colonies with a queen", "dragonfly|insect|insects|near water, and it is one of the fastest insects", "giant panda|mammal|bamboo|the mountains of China", "polar bear|mammal|seals|the Arctic, and it is the largest land carnivore",
    "koala|mammal|eucalyptus leaves|eastern Australia, and it is a marsupial, not a bear", "kangaroo|mammal|grass|Australia, and it is a marsupial that carries its young in a pouch", "platypus|mammal|small water animals|eastern Australia, and it is a mammal that lays eggs",
    "bat|mammal|insects or fruit|worldwide, and it is the only mammal that can truly fly", "dolphin|mammal|fish|the oceans, and it is a highly intelligent marine mammal that uses echolocation", "orca|mammal|fish and seals|the oceans, and it is the largest dolphin", "sloth|mammal|leaves|Central and South America, and it is among the slowest mammals",
    "lion|mammal|meat|the African savanna, and it lives in groups called prides", "tiger|mammal|meat|Asia, and it is the largest wild cat", "gorilla|mammal|plants|Central Africa, and it is the largest primate", "chimpanzee|mammal|fruit and plants|African forests, and it is the closest living relative of humans along with the bonobo",
    "hippopotamus|mammal|grass|African rivers", "rhinoceros|mammal|plants|Africa and Asia, and it has one or two horns made of keratin", "wolf|mammal|meat|Northern Hemisphere forests and tundra, and it lives in packs and is the ancestor of the domestic dog", "camel|mammal|plants|deserts, and it stores fat in its hump",
    "frog|amphibian|insects|near water, and it lays eggs that hatch into tadpoles", "salamander|amphibian|insects|damp places", "spider|arachnid|insects|worldwide, and it has eight legs and spins silk", "scorpion|arachnid|insects|deserts, and it has a venomous stinger on its tail",
    "starfish|echinoderm|shellfish|the sea floor, and it has no brain and can regrow arms", "jellyfish|cnidarian|plankton|the oceans, and it has no brain, heart or bones", "coral|cnidarian|plankton|warm shallow seas, and coral reefs are built by tiny animals called polyps",
    "elephant seal|mammal|fish and squid|the Southern Ocean, and it is the largest seal", "walrus|mammal|clams|the Arctic, and it has long tusks", "owl|bird|small animals|worldwide, and it hunts at night", "pigeon|bird|seeds|cities worldwide, and it can find its way home over long distances",
    "flamingo|bird|shrimp and algae|lakes and lagoons, and its pink colour comes from its food", "parrot|bird|seeds and fruit|tropical regions, and many parrots can imitate human speech", "crow|bird|nearly anything|worldwide, and it is one of the most intelligent birds", "swan|bird|water plants|lakes and rivers",
    "kiwi|bird|insects and worms|New Zealand, and it is a flightless bird that is the national symbol of New Zealand", "hen|bird|grain and insects|farms worldwide, and a hen lays eggs", "cow|mammal|grass|farms worldwide, and it is kept for milk and meat", "sheep|mammal|grass|farms worldwide, and it is kept for wool and meat",
    "horse|mammal|grass|worldwide, and it has been used for riding and work for thousands of years", "dog|mammal|meat and other food|worldwide, and it is the oldest domesticated animal", "cat|mammal|meat|worldwide, and it is a popular pet"
  ].forEach(function (row) {
    var p = row.split("|");
    var art = /^[aeiou]/i.test(p[0]) ? "An " : "A ";
    out.push(art + p[0] + " is a " + p[1] + " that eats " + p[2] + ". It lives in " + p[3] + ".");
  });
  out.push("The largest mammal is the blue whale.");
  out.push("The largest animal in the world is the blue whale.");
  out.push("The largest land animal is the African elephant.");
  out.push("The largest bird is the ostrich.");
  out.push("The fastest land animal is the cheetah.");
  out.push("The fastest animal in the world is the peregrine falcon, in a dive.");
  out.push("The tallest animal is the giraffe.");
  out.push("The largest fish is the whale shark.");
  out.push("The largest reptile is the saltwater crocodile.");
  out.push("The largest living lizard is the Komodo dragon.");
  out.push("The largest primate is the gorilla.");
  out.push("The largest land carnivore is the polar bear.");
  out.push("The slowest mammal is the sloth.");
  out.push("The smallest bird is the bee hummingbird.");
  out.push("The only mammals that lay eggs are the platypus and the echidnas.");
  out.push("The only flying mammal is the bat.");
  out.push("Whales and dolphins are mammals, not fish, because they breathe air and nurse their young.");
  out.push("A whale is a mammal, not a fish.");
  out.push("A bat is a mammal, not a bird.");
  out.push("Spiders are arachnids, not insects, and have eight legs, while insects have six legs.");
  out.push("Insects have six legs and three body parts, spiders have eight legs, and crabs have ten legs.");
  out.push("A group of lions is called a pride, of wolves a pack, of fish a school, of birds a flock and of cows a herd.");
  out.push("A baby kangaroo is called a joey, a baby cat a kitten, a baby dog a puppy and a baby cow a calf.");
  out.push("Mammals are warm-blooded animals that have hair or fur and feed their young with milk.");
  out.push("Birds are warm-blooded animals with feathers, wings and beaks that lay eggs.");
  out.push("Reptiles are cold-blooded animals with scales, such as snakes, lizards and turtles.");
  out.push("Amphibians, such as frogs, live part of their lives in water and part on land.");
  out.push("Fish are cold-blooded animals that live in water and breathe with gills.");
  out.push("Insects are animals with six legs, such as ants, bees and butterflies.");
  out.push("Vertebrates are animals with a backbone, and invertebrates are animals without one.");
  out.push("Carnivores eat meat, herbivores eat plants and omnivores eat both.");
  out.push("Plants make their food by photosynthesis, using sunlight, water and carbon dioxide.");
  out.push("The process by which plants make food from sunlight is photosynthesis.");
  out.push("Plants take in carbon dioxide from the air and give out oxygen.");
  out.push("Plants release oxygen as a by-product of photosynthesis.");
  out.push("Chlorophyll is the green pigment in plants that captures sunlight for photosynthesis.");
  out.push("The roots of a plant take in water and minerals from the soil and anchor the plant.");
  out.push("Leaves change colour in autumn because the green chlorophyll breaks down and reveals yellow and orange pigments.");
  out.push("Bees collect nectar from flowers and pollinate plants as they go.");
  out.push("Seeds grow into new plants when they have water, warmth and soil.");
  out.push("The tallest tree species is the coast redwood, which can exceed 115 metres.");
  out.push("The oldest living trees are bristlecone pines, which can live for nearly 5,000 years.");
  out.push("The largest flower in the world is the Rafflesia arnoldii of Southeast Asia, and the largest flower cluster is the titan arum.");
  out.push("Bamboo is a grass, and some species grow almost a metre in a day.");
  out.push("Fungi, such as mushrooms and yeast, are not plants or animals but a separate kingdom of life.");
  out.push("A food chain shows who eats whom, starting with plants or algae, then herbivores, then carnivores.");
  out.push("Extinct animals include the dodo, the woolly mammoth and the dinosaurs.");
  out.push("Dinosaurs lived on Earth from about 230 million years ago until about 66 million years ago, when most of them became extinct.");
  out.push("Humans and dinosaurs never lived at the same time: the non-bird dinosaurs died out about 66 million years ago, and modern humans appeared only about 300,000 years ago.");
  out.push("Humans and dinosaurs never met: the non-bird dinosaurs died out about 66 million years ago, long before the first humans appeared, so there was no year when they first met.");
  out.push("Humans and dinosaurs did not live at the same time, so they never first met.");
  out.push("Dinosaurs went extinct about 66 million years ago, probably after a huge asteroid struck what is now Mexico.");
  out.push("Birds are the living descendants of small feathered dinosaurs.");
  out.push("Tyrannosaurus rex was one of the largest meat-eating dinosaurs and lived about 68 to 66 million years ago.");
  out.push("The first humans, Homo sapiens, appeared in Africa about 300,000 years ago.");
  out.push("Life on Earth began about 3.5 to 4 billion years ago, and the first life was single-celled microbes in the sea.");
  out.push("Chickens evolved from wild jungle fowl, and eggs were laid by egg-laying animals long before the first chicken, so the egg came first.");
  out.push("The egg came before the chicken: egg-laying animals existed hundreds of millions of years before chickens.");

  /* human body */
  out.push("The largest organ of the human body is the skin.");
  out.push("The skin is the largest organ in the human body, and the liver is the largest internal organ.");
  out.push("The smallest bone in the human body is the stapes in the middle ear, and the longest is the femur in the thigh.");
  out.push("The adult human body has 206 bones, and a baby is born with about 300.");
  out.push("An adult human normally has 32 teeth, and children have 20 baby teeth.");
  out.push("The human heart has four chambers: two atria and two ventricles.");
  out.push("The human heart beats about 100,000 times a day.");
  out.push("The human brain weighs about 1.4 kilograms and contains roughly 86 billion neurons.");
  out.push("The human body is about 60 percent water.");
  out.push("Normal human body temperature is about 37 degrees Celsius, or 98.6 degrees Fahrenheit.");
  out.push("The five senses are sight, hearing, smell, taste and touch.");
  out.push("The four main blood types are A, B, AB and O, and blood is also classified as Rh positive or negative.");
  out.push("Red blood cells carry oxygen, white blood cells fight infection and platelets help blood clot.");
  out.push("The lungs take oxygen from the air into the blood and remove carbon dioxide.");
  out.push("The stomach digests food with acid and enzymes, and the small intestine absorbs most nutrients.");
  out.push("The kidneys filter waste from the blood and make urine.");
  out.push("The liver cleans the blood, makes bile and stores energy.");
  out.push("The pancreas makes insulin, which controls blood sugar.");
  out.push("The strongest muscle in the body relative to its size is the masseter in the jaw, and the largest muscle is the gluteus maximus.");
  out.push("The human body has about 37 trillion cells.");
  out.push("Humans have 23 pairs of chromosomes, 46 in total.");
  out.push("DNA carries the genetic instructions for living things.");
  out.push("Vitamin D is made by the skin in sunlight and helps the body absorb calcium for strong bones.");
  out.push("Vitamin C, found in citrus fruits, prevents scurvy.");
  out.push("Vitamin A, found in carrots and liver, supports vision.");
  out.push("Vitamin K helps blood to clot, and vitamin B12 is found in meat, fish and dairy.");
  out.push("Calcium builds strong bones and teeth and is found in milk and cheese.");
  out.push("Iron in red meat and spinach helps the blood carry oxygen.");
  out.push("Protein builds and repairs muscles, carbohydrates give energy and fats store energy.");
  out.push("We need to sleep because sleep lets the body rest and repair, helps the brain store memories and clear waste, and keeps mood and health stable.");
  out.push("Adults need about seven to nine hours of sleep a night.");
  out.push("Living things need water because their cells depend on it for chemical reactions, to carry nutrients and to remove waste.");
  out.push("Humans can live for weeks without food but only a few days without water.");
  out.push("We breathe to bring oxygen into the body and remove carbon dioxide.");
  out.push("A fever is a rise in body temperature that often helps the body fight an infection.");
  out.push("Vaccines train the immune system to recognise a germ so it can fight it quickly.");
  out.push("Antibiotics kill bacteria but do not work against viruses.");
  out.push("Bacteria are single-celled organisms, and viruses are much smaller and need a host cell to reproduce.");
  out.push("The common cold is caused by viruses, and the flu is caused by influenza viruses.");
  out.push("Sneezing clears irritants from the nose, and hiccups are caused by a spasm of the diaphragm.");
  out.push("Goosebumps are tiny muscles pulling on hairs in the skin, a reflex to cold or fear.");
  out.push("Fingerprints are unique to each person and do not change.");

  /* chemistry and materials */
  out.push("The pH of pure water is 7, which is neutral.");
  out.push("The pH scale runs from 0 to 14: below 7 is acidic, 7 is neutral and above 7 is basic (alkaline).");
  out.push("Lemon juice is acidic with a pH of about 2, and bleach is basic with a pH of about 13.");
  out.push("Acids taste sour and turn litmus paper red, and bases feel slippery and turn litmus paper blue.");
  out.push("Pure water freezes at 0 degrees Celsius and boils at 100 degrees Celsius at sea level.");
  out.push("Water boils at 212 degrees Fahrenheit and freezes at 32 degrees Fahrenheit.");
  out.push("Ice floats because water expands as it freezes, making ice less dense than liquid water.");
  out.push("When ice is left in the sun, it melts into liquid water because it absorbs heat.");
  out.push("Heating a solid turns it into a liquid when it melts, and a liquid into a gas when it boils.");
  out.push("The three common states of matter are solid, liquid and gas, and plasma is a fourth state.");
  out.push("The noble gases are helium, neon, argon, krypton, xenon and radon, and they rarely react with other elements.");
  out.push("Table salt is sodium chloride, with the formula NaCl.");
  out.push("Water is H2O, carbon dioxide is CO2, methane is CH4, ammonia is NH3 and oxygen gas is O2.");
  out.push("The chemical formula of table sugar (sucrose) is C12H22O11, and of glucose is C6H12O6.");
  out.push("Baking soda is sodium bicarbonate, NaHCO3, and vinegar is a dilute solution of acetic acid.");
  out.push("Hydrogen peroxide is H2O2, ozone is O3 and sulfuric acid is H2SO4.");
  out.push("Rust is iron oxide, formed when iron reacts with oxygen and water.");
  out.push("The most abundant gas in Earth's atmosphere is nitrogen, at about 78 percent, followed by oxygen at about 21 percent.");
  out.push("The most abundant element in the universe is hydrogen, and the most abundant in Earth's crust is oxygen.");
  out.push("Gold's chemical symbol is Au, silver's is Ag, iron's is Fe and sodium's is Na.");
  out.push("The lightest element is hydrogen and the lightest metal is lithium.");
  out.push("The hardest natural substance is diamond, which is made of carbon.");
  out.push("Diamond and graphite are both made of carbon, but the atoms are arranged differently.");
  out.push("The most conductive metal is silver, followed by copper and gold.");
  out.push("Mercury is the only metal that is liquid at room temperature.");
  out.push("An atom consists of a nucleus of protons and neutrons surrounded by electrons.");
  out.push("Protons have a positive charge, electrons a negative charge and neutrons no charge.");
  out.push("The atomic number of an element is its number of protons.");
  out.push("A molecule is two or more atoms bonded together, and a compound contains atoms of different elements.");
  out.push("Metals conduct heat and electricity and are shiny, malleable and ductile.");
  out.push("A chemical reaction changes substances into new ones, such as iron rusting or wood burning.");
  out.push("Burning needs fuel, oxygen and heat, called the fire triangle.");
  out.push("Soap works because one end of its molecules attaches to water and the other to grease, lifting dirt away.");
  out.push("Steel is an alloy of iron and carbon, brass is copper and zinc, and bronze is copper and tin.");
  out.push("Glass is made mostly from sand, which is silicon dioxide, melted at high temperature.");
  out.push("Paper is made from wood pulp, and plastic is made from petroleum and other chemicals.");

  /* physics, earth and space additions */
  out.push("Light travels at about 299,792 kilometres per second in a vacuum, which is its speed.");
  out.push("The speed of light is about 300,000 kilometres per second, or 186,000 miles per second.");
  out.push("How fast does light travel? About 299,792 kilometres per second, fast enough to circle the Earth about seven times in one second.");
  out.push("Light takes about 8 minutes and 20 seconds to travel from the Sun to the Earth, and about 1.3 seconds from the Moon.");
  out.push("Sound travels at about 343 metres per second in air at room temperature, much slower than light, which is why thunder arrives after lightning.");
  out.push("Sound cannot travel through a vacuum because it needs a medium such as air or water.");
  out.push("Absolute zero is minus 273.15 degrees Celsius, the lowest possible temperature.");
  out.push("Gravity on Earth accelerates falling objects at about 9.8 metres per second squared.");
  out.push("Gravity keeps the planets in orbit around the Sun, and the Moon in orbit around the Earth.");
  out.push("The force that keeps planets in orbit around the Sun is gravity.");
  out.push("Newton's first law says an object stays at rest or in steady motion unless a force acts on it, the second law says force equals mass times acceleration, and the third says every action has an equal and opposite reaction.");
  out.push("Weight is the force of gravity on a mass, so an object weighs about one sixth as much on the Moon as on Earth.");
  out.push("Ohm's law says voltage equals current times resistance, V = IR.");
  out.push("Electric current is measured in amperes, voltage in volts, resistance in ohms and power in watts.");
  out.push("The unit of force is the newton, of energy the joule, of frequency the hertz and of pressure the pascal.");
  out.push("Energy cannot be created or destroyed, only changed from one form to another, which is the law of conservation of energy.");
  out.push("Renewable energy sources include solar, wind, hydro and geothermal power.");
  out.push("Fossil fuels are coal, oil and natural gas, formed from ancient plants and animals.");
  out.push("The visible light spectrum runs from red, orange, yellow, green, blue, indigo to violet, and a rainbow forms when sunlight is split by raindrops.");
  out.push("The primary colours of light are red, green and blue, and the primary colours of paint are red, yellow and blue.");
  out.push("The sky looks blue because air molecules scatter blue sunlight more than red light, which is called Rayleigh scattering.");
  out.push("Sunsets look red because the light travels through more air and the blue is scattered away.");
  out.push("The ocean is salty because rivers carry dissolved minerals from rocks into the sea, and the water evaporates and leaves the salt behind.");
  out.push("Tides are caused mainly by the gravitational pull of the Moon, with a smaller effect from the Sun.");
  out.push("Thunder is the sound of air expanding explosively when lightning heats it.");
  out.push("Lightning is a huge spark of static electricity between clouds or between a cloud and the ground.");
  out.push("The seasons happen because the Earth's axis is tilted about 23.5 degrees as it orbits the Sun.");
  out.push("Earth takes about 365.25 days to orbit the Sun and 24 hours to rotate once on its axis.");
  out.push("Weather is the state of the atmosphere at a particular place and time, such as rain or heat today, while climate is the average pattern of weather in a place over many years.");
  out.push("The difference between weather and climate is that weather is short-term and changes day to day, while climate is the long-term average of weather over decades.");
  out.push("The water cycle moves water by evaporation, condensation into clouds, precipitation as rain or snow, and run-off back to the sea.");
  out.push("Rain forms when water vapour condenses into droplets in clouds that grow heavy enough to fall.");
  out.push("Snow forms when water vapour freezes into ice crystals in cold clouds.");
  out.push("A hurricane is a huge rotating storm that forms over warm ocean water; in the Pacific it is called a typhoon.");
  out.push("A tornado is a violently rotating column of air that touches the ground.");
  out.push("Earthquakes happen when tectonic plates suddenly move along a fault, and their strength is measured on the Richter or moment magnitude scale.");
  out.push("Volcanoes erupt when molten rock, called magma, rises through the Earth's crust.");
  out.push("The Earth has four layers: the crust, the mantle, the outer core and the inner core.");
  out.push("The Earth is about 12,742 kilometres in diameter, about 40,075 kilometres around the equator, and about 4.54 billion years old.");
  out.push("About 71 percent of the Earth's surface is covered by water.");
  out.push("The Moon is about 384,400 kilometres from the Earth and takes about 27.3 days to orbit it.");
  out.push("The Moon has no atmosphere, and its gravity is about one sixth of Earth's.");
  out.push("The Sun is a star about 150 million kilometres from Earth, with a surface temperature of about 5,500 degrees Celsius.");
  out.push("The closest star to Earth is the Sun, and the next closest is Proxima Centauri, about 4.2 light years away.");
  out.push("The Milky Way is the galaxy that contains our solar system, with hundreds of billions of stars.");
  out.push("A light year is the distance light travels in one year, about 9.46 trillion kilometres.");
  out.push("The planets in order from the Sun are Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune.");
  out.push("The hottest planet is Venus, the largest is Jupiter, the smallest is Mercury and the planet with the most prominent rings is Saturn.");
  out.push("Mars is called the Red Planet because iron oxide dust covers its surface.");
  out.push("Pluto was reclassified as a dwarf planet in 2006.");
  out.push("A solar eclipse happens when the Moon passes between the Sun and the Earth, and a lunar eclipse when the Earth passes between the Sun and the Moon.");
  out.push("A black hole is a region of space where gravity is so strong that nothing, not even light, can escape.");
  out.push("The universe began with the Big Bang about 13.8 billion years ago.");
  out.push("The Hubble Space Telescope, launched in 1990, orbits Earth and has taken images of distant galaxies.");
  out.push("The International Space Station orbits the Earth about every 90 minutes.");
  out.push("Comets are balls of ice and dust that grow glowing tails when they near the Sun.");

  /* mathematics */
  out.push("Pi is the ratio of a circle's circumference to its diameter, about 3.14159, and it is an irrational number.");
  out.push("The value of pi is approximately 3.14159.");
  out.push("The constant e is approximately 2.71828 and is the base of natural logarithms.");
  out.push("The golden ratio is approximately 1.618.");
  out.push("The Pythagorean theorem says that in a right triangle the square of the hypotenuse equals the sum of the squares of the other two sides, a squared plus b squared equals c squared.");
  out.push("The area of a circle is pi times the radius squared, and its circumference is 2 times pi times the radius.");
  out.push("The area of a rectangle is length times width, and the area of a triangle is half the base times the height.");
  out.push("The quadratic formula gives the solutions of ax squared plus bx plus c equals zero as x = (-b plus or minus the square root of b squared minus 4ac) divided by 2a.");
  out.push("The angles of a triangle add up to 180 degrees, the angles of a quadrilateral to 360 degrees, of a pentagon to 540 degrees and of a hexagon to 720 degrees.");
  out.push("The sum of the interior angles of a polygon with n sides is (n minus 2) times 180 degrees.");
  out.push("A triangle has 3 sides, a quadrilateral 4, a pentagon 5, a hexagon 6, a heptagon 7, an octagon 8, a nonagon 9 and a decagon 10.");
  out.push("A cube has 6 faces, 12 edges and 8 vertices.");
  out.push("A rectangular prism has 6 faces, 12 edges and 8 vertices, and a triangular pyramid (tetrahedron) has 4 faces, 6 edges and 4 vertices.");
  out.push("A prime number is a whole number greater than 1 whose only factors are 1 and itself, and 2 is the only even prime.");
  out.push("The first ten prime numbers are 2, 3, 5, 7, 11, 13, 17, 19, 23 and 29.");
  out.push("There are infinitely many prime numbers, as Euclid proved, so there is no largest prime.");
  out.push("A perfect number equals the sum of its proper divisors; the first two are 6 and 28.");
  out.push("The Fibonacci sequence begins 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, where each number is the sum of the two before it.");
  out.push("The mean is the sum of the values divided by how many there are, the median is the middle value and the mode is the most frequent value.");
  out.push("A million is 1,000,000 or 10 to the power 6, a billion is 10 to the power 9, a trillion is 10 to the power 12, and a googol is 10 to the power 100.");
  out.push("Metric prefixes: kilo means a thousand, mega a million, giga a billion, milli a thousandth, micro a millionth and nano a billionth.");
  out.push("There are 100 centimetres in a metre, 1,000 metres in a kilometre, 1,000 grams in a kilogram and 1,000 millilitres in a litre.");
  out.push("There are 12 inches in a foot, 3 feet in a yard and 5,280 feet in a mile.");
  out.push("There are 16 ounces in a pound, 8 pints in a gallon and 4 quarts in a gallon.");
  out.push("There are 60 seconds in a minute, 60 minutes in an hour, 24 hours in a day and 7 days in a week.");
  out.push("There are 365 days in a year and 366 in a leap year, 12 months in a year and 52 weeks in a year.");
  out.push("A leap year occurs every four years, except century years not divisible by 400, and February then has 29 days.");
  out.push("The Roman numerals are I for 1, V for 5, X for 10, L for 50, C for 100, D for 500 and M for 1,000.");
  out.push("The binary number system uses only the digits 0 and 1; for example 5 is 101 and 13 is 1101 in binary.");
  out.push("The decimal value of the binary number 1101 is 13, and of 1010 is 10.");
  out.push("Hexadecimal is base 16, using the digits 0 to 9 and the letters A to F.");
  out.push("A right angle is 90 degrees, a straight angle is 180 degrees and a full turn is 360 degrees.");
  out.push("An acute angle is less than 90 degrees, an obtuse angle is between 90 and 180 degrees.");
  out.push("The diameter of a circle is twice its radius.");
  out.push("The square root of 2 is about 1.414, and the square root of 144 is 12.");
  out.push("A dozen is 12, a score is 20 and a gross is 144.");
  out.push("The probability of an event is a number from 0 to 1, and the probability of heads on a fair coin is one half.");
  out.push("A fair six-sided die has six equally likely outcomes, so the chance of rolling any given number is one sixth.");
  out.push("A standard deck of cards has 52 cards in four suits of 13: hearts, diamonds, clubs and spades.");

  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
