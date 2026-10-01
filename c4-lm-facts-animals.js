/* Animals by the numbers: how much they weigh, how big they are, how long they live and how fast they move. Rounded, typical figures. Local only. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];
  function art(w) { return /^[aeiou]/i.test(w) ? "an " : "a "; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  /* name | plural | weight | size | lifespan | speed (verb:amount) */
  [
    "elephant|elephants|4,000 to 6,000 kilograms for an adult African elephant, which makes it the heaviest land animal|about 3 to 3.5 metres tall at the shoulder|60 to 70 years|run:about 40 km/h",
    "blue whale|blue whales|100 to 190 tonnes, the heaviest animal that has ever lived|up to about 30 metres long|80 to 90 years|swim:up to about 50 km/h in short bursts",
    "giraffe|giraffes|800 to 1,200 kilograms|4.3 to 5.5 metres tall, the tallest animal|20 to 25 years in the wild|run:about 55 km/h",
    "lion|lions|150 to 250 kilograms for a male|1.7 to 2.5 metres long, not counting the tail|10 to 14 years in the wild|run:about 80 km/h in short bursts",
    "tiger|tigers|100 to 300 kilograms|2.5 to 3.3 metres long including the tail|10 to 15 years in the wild|run:about 65 km/h",
    "cheetah|cheetahs|21 to 72 kilograms|1.1 to 1.5 metres long, not counting the tail|10 to 12 years in the wild|run:about 100 km/h, making it the fastest land animal",
    "polar bear|polar bears|350 to 700 kilograms for a male|2.4 to 3 metres long|about 25 years|run:about 40 km/h",
    "gorilla|gorillas|140 to 200 kilograms for a male|about 1.7 metres tall when standing|35 to 40 years in the wild|",
    "hippopotamus|hippopotamuses|1,300 to 3,000 kilograms||about 40 years|run:about 30 km/h over short distances",
    "rhinoceros|rhinoceroses|1,800 to 2,700 kilograms for a white rhino||about 40 years|run:about 50 km/h",
    "horse|horses|380 to 550 kilograms|1.4 to 1.8 metres tall at the shoulder|25 to 30 years|run:about 55 km/h at a gallop, and the fastest recorded is near 88 km/h",
    "dog|dogs|from about 1 kilogram for a tiny breed to more than 80 kilograms for a giant one||10 to 13 years on average, and small breeds usually live longer|run:up to about 70 km/h for a greyhound",
    "cat|cats|3.5 to 5 kilograms for a typical house cat||12 to 18 years|run:about 48 km/h",
    "rabbit|rabbits|1 to 2.5 kilograms||8 to 12 years as a pet|run:about 50 km/h",
    "mouse|mice|about 20 to 30 grams||1 to 3 years|",
    "hamster|hamsters|about 100 to 150 grams for a Syrian hamster||2 to 3 years|",
    "ostrich|ostriches|100 to 150 kilograms, the heaviest bird|2.1 to 2.8 metres tall, the tallest bird|30 to 40 years|run:about 70 km/h, the fastest of any bird on land",
    "peregrine falcon|peregrine falcons|0.6 to 1.5 kilograms|about 35 to 50 centimetres long|up to about 15 years|fly:over 300 km/h in a dive, the fastest speed of any animal",
    "hummingbird|hummingbirds|about 2 to 20 grams|||fly:up to about 50 km/h",
    "emperor penguin|emperor penguins|22 to 45 kilograms|about 1.1 to 1.3 metres tall|15 to 20 years in the wild|",
    "great white shark|great white sharks|about 650 to 1,100 kilograms for most adults|4 to 6 metres long|up to about 70 years|swim:about 56 km/h in short bursts",
    "whale shark|whale sharks|about 20 tonnes|up to about 12 metres long, the largest fish|70 to 100 years|",
    "dolphin|dolphins|150 to 300 kilograms for a bottlenose dolphin|2 to 4 metres long|40 to 60 years|swim:about 35 km/h",
    "orca|orcas|3,000 to 6,000 kilograms for a male|6 to 8 metres long|50 to 80 years for a female|swim:about 55 km/h",
    "sloth|sloths|4 to 8 kilograms||20 to 40 years|move:about 0.25 km/h on the ground",
    "snail|snails|||2 to 5 years for a garden snail|crawl:about 1 millimetre per second, which is roughly 0.003 km/h",
    "tortoise|tortoises|up to about 400 kilograms for a giant tortoise||100 to 150 years or more for a giant tortoise|walk:about 0.3 km/h",
    "turtle|turtles|||50 to 80 years for a sea turtle|",
    "crocodile|crocodiles|up to about 1,000 kilograms for a saltwater crocodile|up to about 6 metres long|50 to 70 years|swim:about 30 km/h in short bursts",
    "komodo dragon|komodo dragons|about 70 kilograms|up to about 3 metres long, the largest living lizard|about 30 years in the wild|run:about 20 km/h",
    "camel|camels|400 to 700 kilograms|about 1.8 to 2.1 metres tall at the shoulder|40 to 50 years|run:up to about 65 km/h in short bursts",
    "kangaroo|kangaroos|up to about 90 kilograms for a large red kangaroo|up to about 1.5 metres tall|about 20 years in the wild|hop:up to about 70 km/h",
    "wolf|wolves|30 to 60 kilograms||6 to 8 years in the wild|run:up to about 60 km/h in short bursts",
    "fox|foxes|3 to 11 kilograms for a red fox||2 to 5 years in the wild|run:about 50 km/h",
    "bear|bears|180 to 500 kilograms for a brown bear||20 to 25 years|run:about 50 km/h",
    "cow|cows|500 to 800 kilograms||about 20 years|",
    "pig|pigs|100 to 300 kilograms for a domestic pig||10 to 15 years|",
    "sheep|sheep|45 to 100 kilograms||10 to 12 years|",
    "goat|goats|20 to 140 kilograms depending on the breed||15 to 18 years|",
    "chicken|chickens|1.5 to 4 kilograms||5 to 10 years|",
    "parrot|parrots|||up to 50 to 60 years for a large macaw|",
    "eagle|eagles|3 to 6 kilograms for a bald eagle||about 20 years in the wild|",
    "owl|owls|||about 10 years in the wild, and more in captivity|",
    "bat|bats|||20 years or more for some species|",
    "squirrel|squirrels|||5 to 10 years|",
    "bee|bees|||about six weeks for a summer worker bee, and up to five years for a queen|fly:about 25 km/h",
    "ant|ants|||a few weeks to a year for a worker, and up to 30 years for a queen|",
    "butterfly|butterflies|||a few weeks for most adults, and several months for migrating monarchs|fly:about 20 km/h",
    "mayfly|mayflies|||a day or less as an adult|",
    "fruit fly|fruit flies|||about 40 to 50 days|",
    "goldfish|goldfish|||10 to 15 years with good care, and some live more than 30|",
    "guinea pig|guinea pigs|0.7 to 1.2 kilograms||5 to 8 years|",
    "hedgehog|hedgehogs|0.4 to 1.2 kilograms||2 to 5 years in the wild, and up to 7 in captivity|",
    "rat|rats|0.2 to 0.5 kilograms||2 to 3 years|",
    "frog|frogs|||4 to 15 years depending on the species|",
    "spider|spiders|||1 to 2 years for most spiders, and up to 20 to 30 years for a tarantula|",
    "salmon|salmon|||3 to 7 years|swim:about 10 km/h, or up to about 35 km/h in short bursts",
    "duck|ducks|||5 to 10 years|fly:about 50 to 80 km/h",
    "pigeon|pigeons|||3 to 5 years in the wild, and up to 15 in captivity|fly:about 80 km/h",
    "swan|swans|||up to about 20 years in the wild|fly:about 50 to 70 km/h",
    "crow|crows|||7 to 8 years in the wild, and up to 20 in captivity|",
    "seal|seals|||25 to 30 years|swim:up to about 35 km/h",
    "walrus|walruses|1,000 to 1,700 kilograms for a male||about 40 years|",
    "manatee|manatees|400 to 600 kilograms||up to about 60 years|",
    "greenland shark|greenland sharks||up to about 5 metres long|250 to 500 years, the longest of any vertebrate|",
    "bowhead whale|bowhead whales|||over 200 years|",
    "ocean quahog|ocean quahogs|||more than 500 years, one of the longest-lived animals known|",
    "human|humans|||about 73 years on average worldwide, and the longest confirmed was 122 years|run:up to about 45 km/h for the fastest sprinter, Usain Bolt"
  ].forEach(function (row) {
    var p = row.split("|"), nm = p[0], pl = p[1], w = p[2], sz = p[3], life = p[4], sp = p[5], A = art(nm), T = cap(A) + nm;
    if (w) {
      out.push(T + " weighs " + w + ".");
      out.push("The weight of " + A + nm + " is " + w + ".");
    }
    if (sz) {
      out.push(T + " is " + sz + ".");
    }
    if (life) {
      out.push(T + " lives " + life.replace(/^about |^up to /, function (m0) { return m0; }) + ".");
      out.push("The lifespan of " + A + nm + " is " + life + ".");
    }
    if (sp) {
      var v = sp.split(":")[0], amt = sp.slice(sp.indexOf(":") + 1);
      out.push(T + " can " + v + " at " + amt + ".");
    }
  });
  out.push("The oldest animal known is the ocean quahog, a clam that can live for more than 500 years, and the longest-lived vertebrate is the Greenland shark.");
  out.push("The fastest land animal is the cheetah, the fastest bird is the peregrine falcon in a dive, and the fastest fish is the sailfish at about 110 km/h.");
  out.push("The heaviest land animal is the African elephant, and the heaviest animal ever is the blue whale.");
  out.push("The largest living lizard is the Komodo dragon, the largest fish is the whale shark, and the largest bird is the ostrich.");
  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
