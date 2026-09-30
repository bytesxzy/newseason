/* Technology, computing and programming facts for the local fact library. */
(function (root) {
  "use strict";
  var F = root.C4LMFacts;
  if (!F) return;
  var out = [];

  /* acronym | expansion */
  ("CPU|central processing unit;GPU|graphics processing unit;RAM|random access memory;ROM|read-only memory;HTML|hypertext markup language;" +
   "CSS|cascading style sheets;HTTP|hypertext transfer protocol;HTTPS|hypertext transfer protocol secure;URL|uniform resource locator;SQL|structured query language;" +
   "USB|universal serial bus;BIOS|basic input/output system;LAN|local area network;WAN|wide area network;WiFi|wireless fidelity;DNS|domain name system;" +
   "IP|internet protocol;TCP|transmission control protocol;FTP|file transfer protocol;SSH|secure shell;VPN|virtual private network;ISP|internet service provider;" +
   "PDF|portable document format;JPEG|joint photographic experts group;GIF|graphics interchange format;PNG|portable network graphics;MP3|MPEG audio layer III;" +
   "JSON|JavaScript object notation;XML|extensible markup language;API|application programming interface;SDK|software development kit;IDE|integrated development environment;" +
   "OS|operating system;GUI|graphical user interface;CLI|command line interface;SSD|solid state drive;HDD|hard disk drive;PC|personal computer;" +
   "AI|artificial intelligence;ML|machine learning;LLM|large language model;IoT|internet of things;VR|virtual reality;AR|augmented reality;" +
   "GPS|global positioning system;NFC|near field communication;LED|light emitting diode;LCD|liquid crystal display;ASCII|American standard code for information interchange;" +
   "SMS|short message service;SMTP|simple mail transfer protocol;HTTP|hypertext transfer protocol;CAPTCHA|completely automated public Turing test to tell computers and humans apart;" +
   "PIN|personal identification number;ATM|automated teller machine;RFID|radio frequency identification;OCR|optical character recognition;" +
   "NASA|National Aeronautics and Space Administration;NATO|North Atlantic Treaty Organization;UNESCO|United Nations Educational, Scientific and Cultural Organization;" +
   "WHO|World Health Organization;UNICEF|United Nations Children's Fund;GDP|gross domestic product;CEO|chief executive officer;CFO|chief financial officer;" +
   "DNA|deoxyribonucleic acid;RNA|ribonucleic acid;ATP|adenosine triphosphate;NASA|National Aeronautics and Space Administration;FBI|Federal Bureau of Investigation;" +
   "CIA|Central Intelligence Agency;EU|European Union;UN|United Nations;USA|United States of America;UK|United Kingdom;UAE|United Arab Emirates;" +
   "IMF|International Monetary Fund;OPEC|Organization of the Petroleum Exporting Countries;WTO|World Trade Organization;NBA|National Basketball Association;" +
   "FIFA|Federation Internationale de Football Association;IQ|intelligence quotient;BMI|body mass index;MRI|magnetic resonance imaging;CT|computed tomography;" +
   "ICU|intensive care unit;AIDS|acquired immunodeficiency syndrome;HIV|human immunodeficiency virus;ASAP|as soon as possible;DIY|do it yourself;FAQ|frequently asked questions;" +
   "PhD|doctor of philosophy;AM|ante meridiem, meaning before noon;PM|post meridiem, meaning after noon;AD|anno Domini;BC|before Christ;CO2|carbon dioxide;" +
   "GMT|Greenwich Mean Time;UTC|coordinated universal time;SUV|sport utility vehicle;TV|television;UFO|unidentified flying object;VIP|very important person").split(";").forEach(function (row) {
    var p = row.split("|");
    out.push(p[0] + " stands for " + p[1] + ".");
    out.push("The acronym " + p[0] + " means " + p[1] + ".");
  });

  [
    "The central processing unit, or CPU, is the main processor of a computer that executes instructions.",
    "RAM is the fast temporary memory a computer uses for data in active use, and its contents are lost when power is off.",
    "A hard drive or solid state drive stores data permanently, even when the computer is off.",
    "A byte is 8 bits, and a bit is the smallest unit of data, either 0 or 1.",
    "A kilobyte is about 1,000 bytes, a megabyte about a million bytes, and a gigabyte about a billion bytes.",
    "Binary is the base-2 number system that computers use, with only the digits 0 and 1.",
    "The binary number 1010 equals 10 in decimal, and the binary number 1101 equals 13 in decimal.",
    "The hexadecimal number system is base 16 and uses the digits 0 to 9 and the letters A to F; 255 in decimal is FF in hexadecimal.",
    "An operating system, such as Windows, macOS or Linux, manages a computer's hardware and runs programs.",
    "Linus Torvalds created the Linux kernel in 1991.",
    "Bill Gates and Paul Allen founded Microsoft in 1975.",
    "Steve Jobs and Steve Wozniak founded Apple in 1976, together with Ronald Wayne.",
    "Larry Page and Sergey Brin founded Google in 1998.",
    "Jeff Bezos founded Amazon in 1994.",
    "Mark Zuckerberg founded Facebook in 2004, and the company is now named Meta.",
    "Elon Musk is the chief executive of Tesla and SpaceX.",
    "Tim Berners-Lee invented the World Wide Web in 1989 and the first web browser.",
    "The Internet is a global network of networks, and the World Wide Web is the system of linked pages that runs on it.",
    "ARPANET, created in the late 1960s by the United States, was the precursor to the Internet.",
    "A web browser, such as Chrome, Firefox or Safari, is a program for viewing web pages.",
    "HTML is the markup language used to structure web pages, and CSS is the language used to style web pages.",
    "JavaScript is a programming language that runs in web browsers and makes web pages interactive.",
    "Python is a popular general-purpose programming language created by Guido van Rossum and first released in 1991.",
    "Java is a programming language originally developed by James Gosling at Sun Microsystems.",
    "C is a programming language created by Dennis Ritchie at Bell Labs in the early 1970s.",
    "C++ was created by Bjarne Stroustrup as an extension of C.",
    "JavaScript was created by Brendan Eich in 1995.",
    "Ruby was created by Yukihiro Matsumoto, and PHP was created by Rasmus Lerdorf.",
    "SQL is the language used to query and manage data in relational databases.",
    "A database is an organised collection of data, and a relational database stores data in tables of rows and columns.",
    "Git is a version control system created by Linus Torvalds that tracks changes to code over time.",
    "Version control software like Git records the history of changes to files and lets teams collaborate.",
    "An algorithm is a finite sequence of well-defined steps for solving a problem or performing a computation.",
    "A compiler translates source code written in a programming language into machine code, and an interpreter executes code directly.",
    "An IP address is a numeric label that identifies a device on a network.",
    "A firewall is a security system that monitors and controls network traffic.",
    "Encryption scrambles data so that only someone with the right key can read it.",
    "A password manager stores strong passwords, and two-factor authentication adds a second step to proving your identity.",
    "Phishing is an attack that tricks people into revealing passwords or personal information, often through fake emails.",
    "Malware is malicious software such as viruses, worms and ransomware.",
    "Cloud computing delivers computing services such as storage and servers over the Internet.",
    "Machine learning is a branch of artificial intelligence in which systems learn patterns from data instead of being explicitly programmed.",
    "Artificial intelligence is the field of making machines that perform tasks that normally need human intelligence.",
    "A neural network is a computing model loosely inspired by the brain, made of layers of connected units.",
    "Alan Turing proposed the Turing test in 1950 as a way to judge whether a machine can exhibit intelligent behavior.",
    "Deep Blue, an IBM computer, defeated chess champion Garry Kasparov in 1997.",
    "AlphaGo, a program by DeepMind, defeated Go champion Lee Sedol in 2016.",
    "ChatGPT is a chatbot released by OpenAI in 2022.",
    "Blockchain is a distributed ledger of records linked by cryptography, and Bitcoin is a cryptocurrency created by Satoshi Nakamoto.",
    "Bitcoin was introduced in 2008 by the pseudonymous Satoshi Nakamoto and launched in 2009.",
    "A pixel is the smallest element of a digital image, and resolution is the number of pixels in an image.",
    "Moore's law is the observation that the number of transistors on a chip doubles about every two years.",
    "A transistor is a tiny electronic switch that is the building block of modern computers, invented in 1947 at Bell Labs.",
    "The first general-purpose electronic computer was ENIAC, completed in 1945.",
    "Smartphones, such as the iPhone introduced by Apple in 2007, combine a phone, a computer and a camera.",
    "GPS uses satellites to determine location, and it is operated by the United States.",
    "Wi-Fi is wireless networking technology, and Bluetooth is a short-range wireless standard.",
    "Email was invented in the early 1970s by Ray Tomlinson, who chose the at sign for addresses.",
    "A bug is an error in a program, and debugging is the process of finding and fixing bugs.",
    "Open source software is software whose source code is freely available to use and modify.",
    "A server is a computer that provides data or services to other computers, called clients.",
    "Bandwidth is the amount of data that can be transmitted over a connection in a given time.",
    "A megapixel is one million pixels, and a terabyte is about one trillion bytes.",
    "The QWERTY keyboard layout is named after the first six letters on the top row of letter keys.",
    "A variable is a named storage location in a program that holds a value.",
    "A function is a reusable block of code that performs a specific task, may take inputs and may return a value.",
    "An array is an ordered collection of elements that can be accessed by index.",
    "A list in Python is a mutable ordered collection, and a tuple is an immutable ordered collection.",
    "A dictionary or hash table stores key-value pairs and looks up values quickly by key.",
    "A loop repeats a block of code, such as a for loop or a while loop.",
    "A conditional, such as an if statement, runs code only when a condition is true.",
    "Recursion is a technique in which a function calls itself to solve a smaller version of a problem.",
    "Object-oriented programming organises code into objects that combine data and behavior, using classes.",
    "A class is a blueprint for creating objects, and an object is an instance of a class.",
    "An API, or application programming interface, lets software programs communicate with each other.",
    "A stack is a last-in, first-out data structure, and a queue is a first-in, first-out data structure.",
    "A linked list is a sequence of nodes where each node points to the next.",
    "A binary tree is a data structure in which each node has at most two children.",
    "Big O notation describes how the running time or memory of an algorithm grows with the size of its input.",
    "Binary search takes logarithmic time, O(log n), because it halves the search range each step.",
    "Quicksort has an average time complexity of O(n log n) and a worst case of O(n squared).",
    "Merge sort runs in O(n log n) time in the worst case and is a stable sort.",
    "Bubble sort is a simple sorting algorithm with O(n squared) time complexity.",
    "A null pointer is a pointer that points to nothing, and dereferencing it causes an error.",
    "In Python, print(\"Hello, world!\") prints the text Hello, world! to the screen.",
    "To print hello world in Python, write print(\"Hello, world!\").",
    "In Python, len() returns the number of items in an object, such as the length of a string or list.",
    "To reverse a string in Python, use slicing: s[::-1], or use ''.join(reversed(s)).",
    "To sort a list in Python, use the sort() method to sort in place or the sorted() function to return a new sorted list.",
    "To open a file in Python, use open('filename') and close it afterwards, or use a with statement: with open('file.txt') as f.",
    "In Python, a for loop such as for i in range(5) repeats the body five times with i from 0 to 4.",
    "In Python, a function is defined with the def keyword, for example def add(a, b): return a + b.",
    "A Python function that adds two numbers is def add(a, b): return a + b.",
    "A list comprehension is a concise way to create a list from an existing one in Python, for example [x*x for x in range(5)].",
    "In JavaScript, variables are declared with let, const or var.",
    "In JavaScript, == compares values with type conversion, and === compares both value and type strictly.",
    "JSON stands for JavaScript Object Notation and is a lightweight text format for data exchange.",
    "A SQL JOIN combines rows from two or more tables based on a related column.",
    "SELECT is the SQL command used to retrieve data from a database.",
    "A primary key uniquely identifies each row in a database table.",
    "Hashing turns data into a fixed-size value, and a hash table uses it for fast lookup.",
    "The command line is a text interface for giving commands to a computer.",
    "In Linux, ls lists files, cd changes directory, and pwd prints the working directory.",
    "Regular expressions are patterns used to match text.",
    "Unicode is a standard for encoding text from all writing systems, and UTF-8 is its most common encoding.",
    "The first programmer is often said to be Ada Lovelace, who wrote an algorithm for Babbage's Analytical Engine.",
    "Margaret Hamilton led the team that wrote the flight software for the Apollo missions.",
    "A robot is a machine that can carry out a series of actions automatically, and the word comes from the Czech writer Karel Capek.",
    "A drone is an unmanned aircraft, and a 3D printer builds objects layer by layer.",
    "An electric car runs on a battery and an electric motor instead of a gasoline engine.",
    "A solar panel converts sunlight into electricity, and a wind turbine converts wind into electricity.",
    "A nuclear power plant makes electricity from the heat of nuclear fission.",
    "A microwave oven heats food with microwaves, and a refrigerator keeps food cold and fresh.",
    "A thermometer measures temperature, a barometer measures air pressure, and a speedometer measures speed.",
    "A telescope magnifies distant objects, and a microscope magnifies tiny objects.",
    "A seismograph measures earthquakes, and an anemometer measures wind speed.",
    "A calculator performs arithmetic, and an abacus is an ancient counting tool."
  ].forEach(function (s) { out.push(s); });

  F.add(out);
})(typeof window !== "undefined" ? window : globalThis);
