/* CELL4 programming how-to and concept answers.
 *
 * "How do I read a file in Python?", "What does len do?", "What is the
 * difference between a list and a tuple?", "What is the time complexity of
 * quicksort?", "What does git commit do?" -- idiom and concept questions whose
 * answer is a short, correct snippet or definition. Each entry is a concept
 * with per-language idioms; a question reaches an entry by what it is about,
 * not by its wording, and the language named in the question (or a default)
 * picks the idiom. Code construction proper ("write a function that ...") is
 * handled by c4-lm-code.js, which verifies the program it emits.
 *
 * Local only: no network, no model service.
 */
(function (root) {
  "use strict";

  var LANGS = {
    python: /\bpython3?\b|\bpy\b/, javascript: /\bjavascript\b|\bjs\b|\bnode(?:js)?\b|\bes6\b/, typescript: /\btypescript\b|\bts\b/, java: /\bjava\b(?!script)/, c: /\bin c\b(?!\+\+|#)|\bc language\b|\bc programming\b/,
    cpp: /\bc\+\+|\bcpp\b/, go: /\bgolang\b|\bin go\b|\bgo language\b/, rust: /\brust\b/, ruby: /\bruby\b/, php: /\bphp\b/, bash: /\bbash\b|\bshell\b|\bterminal\b|\bcommand line\b/, sql: /\bsql\b|\bmysql\b|\bpostgres\w*\b|\bsqlite\b/, csharp: /\bc#|\bcsharp\b/, swift: /\bswift\b/, html: /\bhtml5?\b/, css: /\bcss3?\b|\bstylesheet\b/, kotlin: /\bkotlin\b/
  };
  var NAMES = { python: "Python", javascript: "JavaScript", typescript: "TypeScript", java: "Java", c: "C", cpp: "C++", go: "Go", rust: "Rust", ruby: "Ruby", php: "PHP", bash: "Bash", sql: "SQL", csharp: "C#", swift: "Swift", kotlin: "Kotlin", html: "HTML", css: "CSS" };
  function langOf(l) { for (var k in LANGS) if (LANGS[k].test(l)) return k; return ""; }
  function fence(lang, code) { return "```" + (lang === "cpp" ? "cpp" : lang === "csharp" ? "csharp" : lang) + "\n" + code + "\n```"; }

  /* ------------------------------------------------------------- idioms */
  var HOWTO = [
    { id: "csv", pri: 60, m: /\bcsv\b/, code: { python: 'import csv\n\nwith open("data.csv", newline="") as f:\n    for row in csv.reader(f):\n        print(row)', javascript: 'const text = require("fs").readFileSync("data.csv", "utf8");\nconst rows = text.trim().split("\\n").map(line => line.split(","));' }, text: "csv.reader yields each row as a list of strings." },
    { id: "install-package", pri: 40, m: /\b(?:install|add)\b[^?]*\b(?:package|library|module|dependency)\b|\bpip install\b|\bnpm install\b/, code: { python: "pip install requests", javascript: "npm install express", bash: "pip install requests" }, text: "Python packages come from pip and JavaScript packages from npm." },
    { id: "print", m: /^how (?:do|can|would) (?:i|you) (?:print|output|display)(?: something| text| a message)?(?: in [a-z+#]+)?$|\b(?:print|output|display|show|write)\b[^?]*\b(?:hello,? world|a message|text|a string|something|to the (?:console|screen|terminal)|on the screen)\b|\bhello,? world\b/,
      code: { python: 'print("Hello, World!")', javascript: 'console.log("Hello, World!");', typescript: 'console.log("Hello, World!");', java: 'System.out.println("Hello, World!");', c: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, World!\\n");\n    return 0;\n}', cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n}', go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}', rust: 'fn main() {\n    println!("Hello, World!");\n}', ruby: 'puts "Hello, World!"', php: '<?php\necho "Hello, World!";', bash: 'echo "Hello, World!"', csharp: 'Console.WriteLine("Hello, World!");', swift: 'print("Hello, World!")', kotlin: 'println("Hello, World!")' },
      text: "Printing sends text to the console." },
    { id: "variable", m: /\b(?:declare|define|create|make|initiali[sz]e|set up|assign)\b[^?]*\bvariables?\b/,
      code: { python: 'count = 10\nname = "Ada"', javascript: 'let count = 10;\nconst name = "Ada";', typescript: 'let count: number = 10;\nconst name: string = "Ada";', java: 'int count = 10;\nString name = "Ada";', c: 'int count = 10;\nchar name[] = "Ada";', cpp: 'int count = 10;\nstd::string name = "Ada";', go: 'count := 10\nvar name string = "Ada"', rust: 'let count = 10;\nlet mut total = 0;', ruby: 'count = 10\nname = "Ada"', php: '$count = 10;\n$name = "Ada";', bash: 'count=10\nname="Ada"', csharp: 'int count = 10;\nstring name = "Ada";', swift: 'var count = 10\nlet name = "Ada"', kotlin: 'var count = 10\nval name = "Ada"' },
      text: { javascript: "Use let for a value that will change and const for one that will not; var is the older form with function scope.", python: "Python needs no keyword: assigning to a name creates the variable, and its type comes from the value.", _: "A variable is declared by giving a name a value." } },
    { id: "list-create", m: /\b(?:create|make|declare|define|initiali[sz]e|write|build)\b[^?]*\b(?:list|array)s?\b/, not: /\bempty\b.*\bdict|\bsql\b/,
      code: { python: 'numbers = [1, 2, 3]\nnumbers.append(4)', javascript: 'const numbers = [1, 2, 3];\nnumbers.push(4);', typescript: 'const numbers: number[] = [1, 2, 3];', java: 'int[] numbers = {1, 2, 3};\nList<Integer> list = new ArrayList<>(List.of(1, 2, 3));', c: 'int numbers[] = {1, 2, 3};', cpp: 'std::vector<int> numbers = {1, 2, 3};', go: 'numbers := []int{1, 2, 3}\nnumbers = append(numbers, 4)', rust: 'let mut numbers = vec![1, 2, 3];\nnumbers.push(4);', ruby: 'numbers = [1, 2, 3]\nnumbers << 4', php: '$numbers = [1, 2, 3];' },
      text: { python: "A list is written with square brackets; append adds an item at the end.", javascript: "An array literal uses square brackets; push adds an item at the end.", _: "A list or array holds an ordered sequence of items." } },
    { id: "append", m: /\b(?:append|add|push|insert)\b[^?]*\b(?:to|into|onto|at the end of)\b[^?]*\b(?:array|list)\b/, not: /\bsql\b/,
      code: { python: 'items = [1, 2]\nitems.append(3)        # add at the end\nitems.insert(0, 0)     # add at an index', javascript: 'const items = [1, 2];\nitems.push(3);       // add at the end\nitems.unshift(0);    // add at the start', java: 'List<Integer> items = new ArrayList<>();\nitems.add(3);', go: 'items = append(items, 3)', ruby: 'items << 3', php: '$items[] = 3;', rust: 'items.push(3);', csharp: 'items.Add(3);' },
      text: { javascript: "push adds to the end of an array and returns the new length.", python: "append adds one item to the end of a list.", _: "Appending adds an item at the end of the list." } },
    { id: "loop-items", m: /\b(?:loop|iterate|go through|walk through|traverse|cycle)\b[^?]*\b(?:over|through)?\s*(?:an? |the |each (?:item|element) (?:in|of) )?(?:list|array|items|elements|collection)\b/,
      code: { python: 'for item in items:\n    print(item)', javascript: 'for (const item of items) {\n  console.log(item);\n}\n// or: items.forEach(item => console.log(item));', typescript: 'for (const item of items) {\n  console.log(item);\n}', java: 'for (int item : items) {\n    System.out.println(item);\n}', go: 'for _, item := range items {\n    fmt.Println(item)\n}', rust: 'for item in &items {\n    println!("{}", item);\n}', ruby: 'items.each { |item| puts item }', php: 'foreach ($items as $item) {\n    echo $item;\n}', c: 'for (int i = 0; i < n; i++) {\n    printf("%d\\n", items[i]);\n}', cpp: 'for (int item : items) {\n    std::cout << item << "\\n";\n}', csharp: 'foreach (var item in items) {\n    Console.WriteLine(item);\n}' },
      text: "A for-each loop visits every element once, in order." },
    { id: "loop-count", m: /\b(?:for loop|loop|repeat|count)\b[^?]*\b(?:\d+ times|from \d+ to \d+|\d+ to \d+|n times|a number of times|range)\b|\bprints? the numbers\b|\bfor loop\b/,
      code: { python: 'for i in range(1, 6):\n    print(i)', javascript: 'for (let i = 1; i <= 5; i++) {\n  console.log(i);\n}', java: 'for (int i = 1; i <= 5; i++) {\n    System.out.println(i);\n}', c: 'for (int i = 1; i <= 5; i++) {\n    printf("%d\\n", i);\n}', go: 'for i := 1; i <= 5; i++ {\n    fmt.Println(i)\n}', ruby: '(1..5).each { |i| puts i }', rust: 'for i in 1..=5 {\n    println!("{}", i);\n}' },
      text: { python: "range(1, 6) produces 1 through 5: the end is excluded.", _: "The loop starts at 1, tests the condition before each pass and adds one afterwards." } },
    { id: "while", m: /\bwhile loop\b|\bloop while\b|\bwhile\b[^?]*\b(?:condition|true)\b/,
      code: { python: 'n = 0\nwhile n < 5:\n    print(n)\n    n += 1', javascript: 'let n = 0;\nwhile (n < 5) {\n  console.log(n);\n  n++;\n}', java: 'int n = 0;\nwhile (n < 5) {\n    System.out.println(n);\n    n++;\n}', c: 'int n = 0;\nwhile (n < 5) {\n    printf("%d\\n", n);\n    n++;\n}', go: 'n := 0\nfor n < 5 {\n    fmt.Println(n)\n    n++\n}' },
      text: "A while loop repeats its body for as long as the condition stays true." },
    { id: "if", m: /\b(?:write|use|make|create|do)\b[^?]*\bif(?:[- ]else)? (?:statement|condition)\b|\bhow (?:do|can) (?:i|you)\b[^?]*\bif\b[^?]*\belse\b/,
      code: { python: 'if x > 0:\n    print("positive")\nelif x == 0:\n    print("zero")\nelse:\n    print("negative")', javascript: 'if (x > 0) {\n  console.log("positive");\n} else if (x === 0) {\n  console.log("zero");\n} else {\n  console.log("negative");\n}', java: 'if (x > 0) {\n    System.out.println("positive");\n} else {\n    System.out.println("not positive");\n}', c: 'if (x > 0) {\n    printf("positive\\n");\n} else {\n    printf("not positive\\n");\n}', go: 'if x > 0 {\n    fmt.Println("positive")\n} else {\n    fmt.Println("not positive")\n}' },
      text: "The branch whose condition is true runs; the else branch runs when none is." },
    { id: "function", m: /\b(?:define|create|write|make|declare)\b[^?]*\b(?:a )?function\b(?![^?]*\b(?:that|which|to|for)\b)/,
      code: { python: 'def add(a, b):\n    return a + b', javascript: 'function add(a, b) {\n  return a + b;\n}\n// or: const add = (a, b) => a + b;', typescript: 'function add(a: number, b: number): number {\n  return a + b;\n}', java: 'static int add(int a, int b) {\n    return a + b;\n}', c: 'int add(int a, int b) {\n    return a + b;\n}', go: 'func add(a, b int) int {\n    return a + b\n}', rust: 'fn add(a: i32, b: i32) -> i32 {\n    a + b\n}', ruby: 'def add(a, b)\n  a + b\nend', php: 'function add($a, $b) {\n    return $a + $b;\n}' },
      text: "A function has a name, parameters and a body that returns a result." },
    { id: "read-file", m: /\b(?:read|open|load)\b[^?]*\b(?:a |the |text )?file\b/,
      code: { python: 'with open("data.txt", "r", encoding="utf-8") as f:\n    text = f.read()', javascript: 'const fs = require("fs");\nconst text = fs.readFileSync("data.txt", "utf8");', typescript: 'import { readFileSync } from "fs";\nconst text = readFileSync("data.txt", "utf8");', java: 'String text = Files.readString(Path.of("data.txt"));', go: 'data, err := os.ReadFile("data.txt")\nif err != nil {\n    log.Fatal(err)\n}\ntext := string(data)', rust: 'let text = std::fs::read_to_string("data.txt")?;', ruby: 'text = File.read("data.txt")', php: '$text = file_get_contents("data.txt");', bash: 'cat data.txt', c: 'FILE *f = fopen("data.txt", "r");\nchar line[256];\nwhile (fgets(line, sizeof line, f)) {\n    printf("%s", line);\n}\nfclose(f);' },
      text: { python: "The with statement closes the file for you, even if an error occurs.", _: "Opening a file gives access to its contents; read it, then make sure it is closed." } },
    { id: "write-file", m: /\b(?:write|save|append)\b[^?]*\b(?:to |into )?(?:a |the )?file\b/, not: /\bread\b/,
      code: { python: 'with open("out.txt", "w", encoding="utf-8") as f:\n    f.write("hello")', javascript: 'const fs = require("fs");\nfs.writeFileSync("out.txt", "hello");', java: 'Files.writeString(Path.of("out.txt"), "hello");', go: 'err := os.WriteFile("out.txt", []byte("hello"), 0644)', ruby: 'File.write("out.txt", "hello")', php: 'file_put_contents("out.txt", "hello");', bash: 'echo "hello" > out.txt' },
      text: "Mode \"w\" truncates an existing file; use \"a\" to append instead." },
    { id: "sort", m: /\bsort\b[^?]*\b(?:list|array|items|numbers|strings|elements|dictionary|dict)\b/,
      code: { python: 'items = [3, 1, 2]\nsorted_items = sorted(items)        # new list\nitems.sort(reverse=True)            # in place, descending', javascript: 'const items = [3, 1, 2];\nconst sorted = [...items].sort((a, b) => a - b);', java: 'Arrays.sort(items);', go: 'sort.Ints(items)', ruby: 'items.sort', rust: 'items.sort();', c: 'qsort(items, n, sizeof(int), compare);', php: 'sort($items);' },
      text: { javascript: "Without the comparator, sort compares items as strings, so 10 would come before 9.", python: "sorted returns a new list; list.sort sorts in place and returns None.", _: "Sorting arranges the items in order." } },
    { id: "reverse-list", m: /\brevers\w*\b[^?]*\b(?:list|array)\b/,
      code: { python: 'items = [1, 2, 3]\nitems.reverse()          # in place\nbackwards = items[::-1]  # a reversed copy\nbackwards = list(reversed(items))', javascript: 'const backwards = [...items].reverse();', java: 'Collections.reverse(list);', go: 'for i, j := 0, len(a)-1; i < j; i, j = i+1, j-1 {\n    a[i], a[j] = a[j], a[i]\n}', ruby: 'items.reverse' },
      text: { python: "Slicing with a step of -1 walks the list from the end to the start and leaves the original untouched.", _: "Reversing produces the items in the opposite order." } },
    { id: "reverse-string", m: /\brevers\w*\b[^?]*\bstring\b|\bstring\b[^?]*\brevers/,
      code: { python: 'text = "hello"\nreversed_text = text[::-1]', javascript: 'const reversed = [...text].reverse().join("");', java: 'new StringBuilder(text).reverse().toString()', go: 'runes := []rune(s)\nfor i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {\n    runes[i], runes[j] = runes[j], runes[i]\n}\nreversed := string(runes)', ruby: 'text.reverse' },
      text: { python: "The slice [::-1] steps backwards through the whole string.", _: "The characters are taken in the opposite order." } },
    { id: "dict", m: /\b(?:create|make|declare|define|use)\b[^?]*\b(?:dictionary|dict|hash ?map|map|object with keys|associative array)\b/,
      code: { python: 'person = {"name": "Ada", "age": 36}\nperson["city"] = "London"\nprint(person["name"])', javascript: 'const person = { name: "Ada", age: 36 };\nperson.city = "London";\nconsole.log(person.name);', java: 'Map<String, Integer> ages = new HashMap<>();\nages.put("Ada", 36);', go: 'ages := map[string]int{"Ada": 36}', ruby: 'person = { name: "Ada", age: 36 }', php: '$person = ["name" => "Ada", "age" => 36];' },
      text: "A dictionary (map) stores values under keys, so lookups do not depend on position." },
    { id: "class", m: /\b(?:define|create|write|make|declare)\b[^?]*\bclass\b/,
      code: { python: 'class Dog:\n    def __init__(self, name):\n        self.name = name\n\n    def bark(self):\n        return f"{self.name} says woof"', javascript: 'class Dog {\n  constructor(name) {\n    this.name = name;\n  }\n  bark() {\n    return `${this.name} says woof`;\n  }\n}', java: 'public class Dog {\n    private final String name;\n    public Dog(String name) { this.name = name; }\n    public String bark() { return name + " says woof"; }\n}', ruby: 'class Dog\n  def initialize(name)\n    @name = name\n  end\n\n  def bark\n    "#{@name} says woof"\n  end\nend', go: 'type Dog struct {\n    Name string\n}\n\nfunc (d Dog) Bark() string {\n    return d.Name + " says woof"\n}' },
      text: "A class bundles data (fields) with the functions that work on it (methods)." },
    { id: "try", m: /\b(?:handle|catch)\b[^?]*\b(?:exception|error)s?\b|\btry[- ](?:except|catch)\b/,
      code: { python: 'try:\n    value = int(text)\nexcept ValueError:\n    value = 0', javascript: 'try {\n  const data = JSON.parse(text);\n} catch (err) {\n  console.error(err.message);\n}', java: 'try {\n    int n = Integer.parseInt(text);\n} catch (NumberFormatException e) {\n    n = 0;\n}', go: 'value, err := strconv.Atoi(text)\nif err != nil {\n    value = 0\n}', ruby: 'begin\n  Integer(text)\nrescue ArgumentError\n  0\nend' },
      text: "Code that may fail goes in the try block; the handler runs only if it does." },
    { id: "import", m: /\b(?:import|include|use)\b[^?]*\b(?:a )?(?:module|library|package|file|header)\b/,
      code: { python: 'import math\nfrom os import path', javascript: 'import fs from "fs";            // ES module\nconst fs2 = require("fs");     // CommonJS', java: 'import java.util.List;', c: '#include <stdio.h>', go: 'import "fmt"', rust: 'use std::collections::HashMap;', ruby: 'require "json"' },
      text: "Importing makes the names defined elsewhere available in this file." },
    { id: "comment", m: /\b(?:write|add|make|put)\b[^?]*\bcomments?\b|\bhow (?:do|can) (?:i|you)\b[^?]*\bcomment\b/,
      code: { python: '# a single-line comment\n"""a docstring / multi-line string"""', javascript: '// single-line comment\n/* multi-line\n   comment */', java: '// single-line\n/* multi-line */', c: '// single-line\n/* multi-line */', sql: '-- single-line comment\n/* multi-line */', bash: '# comment', ruby: '# comment', go: '// comment', rust: '// comment', php: '// comment\n# also a comment' },
      text: "Comments are ignored by the program and exist for readers." },
    { id: "lambda", m: /\b(?:lambda|anonymous function|arrow function|inline function)\b/,
      code: { python: 'square = lambda x: x * x\nprint(square(4))', javascript: 'const square = x => x * x;\nconsole.log(square(4));', java: 'Function<Integer, Integer> square = x -> x * x;', ruby: 'square = ->(x) { x * x }', go: 'square := func(x int) int { return x * x }' },
      text: "A lambda is a small unnamed function written inline." },
    { id: "comprehension", m: /\blist comprehension\b|\bcomprehension\b/, lang: "python",
      code: { python: 'squares = [x * x for x in range(10)]\nevens = [x for x in range(10) if x % 2 == 0]' },
      text: "A list comprehension builds a new list from a loop in one expression, with an optional if filter." },
    { id: "input", m: /\b(?:read|get|take|ask for)\b[^?]*\b(?:user )?input\b|\binput from (?:the )?user\b/,
      code: { python: 'name = input("Your name: ")', javascript: 'const readline = require("readline");\nconst rl = readline.createInterface({ input: process.stdin, output: process.stdout });\nrl.question("Your name: ", name => { console.log(name); rl.close(); });', java: 'Scanner in = new Scanner(System.in);\nString name = in.nextLine();', c: 'char name[50];\nscanf("%49s", name);', go: 'reader := bufio.NewReader(os.Stdin)\nname, _ := reader.ReadString(\'\\n\')', ruby: 'name = gets.chomp' },
      text: "input returns what the user typed as a string; convert it with int() or float() when you need a number." },
    { id: "format-string", m: /\b(?:format|interpolate|embed)\b[^?]*\bstring\b|\bf-?string\b|\bstring (?:formatting|interpolation)\b|\btemplate (?:string|literal)s?\b/,
      code: { python: 'name = "Ada"\nprint(f"Hello, {name}!")', javascript: 'const name = "Ada";\nconsole.log(`Hello, ${name}!`);', java: 'String s = String.format("Hello, %s!", name);', go: 's := fmt.Sprintf("Hello, %s!", name)', ruby: 'puts "Hello, #{name}!"', rust: 'let s = format!("Hello, {}!", name);' },
      text: "Interpolation puts the value of an expression into the text." },
    { id: "random", m: /\brandom\b[^?]*\b(?:number|integer|value|choice|element)\b|\bgenerate\b[^?]*\brandom\b/,
      code: { python: 'import random\nn = random.randint(1, 10)   # 1..10 inclusive\nx = random.random()         # 0.0 <= x < 1.0', javascript: 'const n = Math.floor(Math.random() * 10) + 1;   // 1..10', java: 'int n = new Random().nextInt(10) + 1;', go: 'n := rand.Intn(10) + 1', ruby: 'n = rand(1..10)', c: 'int n = rand() % 10 + 1;' },
      text: "Random numbers come from a pseudo-random generator; scale and shift the result to the range you need." },
    { id: "date", m: /\b(?:current|today'?s?|now) (?:date|time)\b|\b(?:get|print|show)\b[^?]*\b(?:current )?(?:date|time|datetime)\b/,
      code: { python: 'from datetime import datetime\nnow = datetime.now()\nprint(now.strftime("%Y-%m-%d %H:%M:%S"))', javascript: 'const now = new Date();\nconsole.log(now.toISOString());', java: 'LocalDateTime now = LocalDateTime.now();', go: 'now := time.Now()', ruby: 'puts Time.now', bash: 'date' },
      text: "The clock is read from the system; format it for display." },
    { id: "json", m: /\b(?:parse|read|decode|load|encode|dump|serialize|stringify|convert)\b[^?]*\bjson\b/,
      code: { python: 'import json\ndata = json.loads(text)      # string -> object\ntext = json.dumps(data)      # object -> string', javascript: 'const data = JSON.parse(text);       // string -> object\nconst text2 = JSON.stringify(data);   // object -> string', java: 'ObjectMapper mapper = new ObjectMapper();\nMap<?, ?> data = mapper.readValue(text, Map.class);', go: 'var data map[string]any\nerr := json.Unmarshal([]byte(text), &data)', ruby: 'data = JSON.parse(text)' },
      text: "Parsing turns JSON text into native objects; serializing does the reverse." },
    { id: "convert-type", m: /\b(?:convert|cast|change|turn|parse)\b[^?]*\b(?:string|str|text)\b[^?]*\b(?:to |into )?(?:an? )?(?:int|integer|number|float)\b|\bstring to (?:int|integer|number|float)\b/,
      code: { python: 'n = int("42")\nx = float("3.14")', javascript: 'const n = parseInt("42", 10);\nconst x = parseFloat("3.14");\nconst m = Number("42");', java: 'int n = Integer.parseInt("42");\ndouble x = Double.parseDouble("3.14");', go: 'n, err := strconv.Atoi("42")', ruby: '"42".to_i' },
      text: "Conversion functions raise or return NaN on text that is not a number, so validate input first." },
    { id: "length", m: /\b(?:length|len|size|number of (?:items|elements|characters))\b[^?]*\b(?:of )?(?:a |an |the )?(?:list|array|string|dictionary|collection)\b|\bhow (?:do|can) (?:i|you)\b[^?]*\b(?:get|find)\b[^?]*\b(?:length|size)\b/,
      code: { python: 'len(items)', javascript: 'items.length', java: 'items.length   // array\nlist.size()    // List', go: 'len(items)', ruby: 'items.length', c: 'strlen(text)   // strings\nsizeof(arr) / sizeof(arr[0])   // arrays', rust: 'items.len()' },
      text: { python: "len returns the number of items in a sequence or collection (the number of characters for a string).", _: "The length is the number of elements." } },
    { id: "unique", m: /\b(?:remove|get|find)\b[^?]*\bduplicates?\b|\bunique (?:values|items|elements)\b/,
      code: { python: 'unique = list(dict.fromkeys(items))   # keeps order\nunique_set = set(items)               # unordered', javascript: 'const unique = [...new Set(items)];', java: 'List<Integer> unique = items.stream().distinct().toList();' },
      text: "A set keeps one copy of each value." },
    { id: "slice", m: /\bslic\w*\b[^?]*\b(?:list|array|string)\b/,
      code: { python: 'items[1:3]    # elements 1 and 2\nitems[:2]     # first two\nitems[-2:]    # last two', javascript: 'items.slice(1, 3)   // elements 1 and 2\nitems.slice(-2)     // last two' },
      text: "A slice takes the start index (included) up to the end index (excluded)." },
    { id: "contains", m: /\b(?:check|test|see|find out)\b[^?]*\b(?:if|whether)\b[^?]*\b(?:contains?|includes?|has|in)\b[^?]*\b(?:list|array|string|substring|item|element)\b/,
      code: { python: '"a" in "banana"       # string contains\n3 in [1, 2, 3]        # list contains', javascript: '"banana".includes("a")\n[1, 2, 3].includes(3)', java: '"banana".contains("a")', go: 'strings.Contains("banana", "a")', ruby: '"banana".include?("a")' },
      text: "Membership tests return true or false." },
    { id: "remove-item", m: /\b(?:remove|delete)\b[^?]*\b(?:item|element|value)\b[^?]*\b(?:from )?(?:a |the )?(?:list|array)\b/,
      code: { python: 'items.remove(3)      # first occurrence of the value\ndel items[0]        # by index\nitems.pop()         # last item', javascript: 'items.splice(index, 1);        // by index\nconst rest = items.filter(x => x !== 3);   // by value' },
      text: "Removing by value and removing by position are different operations." },
    { id: "sleep", m: /\b(?:sleep|wait|pause|delay)\b[^?]*\b(?:seconds?|ms|milliseconds?)\b|\bhow (?:do|can) (?:i|you)\b[^?]*\b(?:sleep|pause|wait)\b/,
      code: { python: 'import time\ntime.sleep(2)   # seconds', javascript: 'await new Promise(resolve => setTimeout(resolve, 2000));   // milliseconds', java: 'Thread.sleep(2000);', go: 'time.Sleep(2 * time.Second)', bash: 'sleep 2', ruby: 'sleep 2' },
      text: "Sleeping pauses the program for the given time." },
    { id: "regex", m: /\bregular expressions?\b|\bregex\b/, m2: /\b(?:how|use|match|write|find|search)\b/,
      code: { python: 'import re\nre.findall(r"\\d+", "a1b22")   # [\'1\', \'22\']', javascript: '"a1b22".match(/\\d+/g)   // ["1", "22"]' },
      text: "A regular expression describes a pattern of characters to search for." },
    { id: "http", m: /\b(?:make|send|do)\b[^?]*\b(?:http|api|get|post)\b[^?]*\brequest\b|\bhttp request\b/,
      code: { python: 'import urllib.request, json\nwith urllib.request.urlopen("https://example.com/api") as r:\n    data = json.load(r)', javascript: 'const response = await fetch("https://example.com/api");\nconst data = await response.json();', go: 'resp, err := http.Get("https://example.com/api")', bash: 'curl -s https://example.com/api' },
      text: "A GET request asks a server for data; check the status before using the body." },
    /* SQL */
    { id: "sql-select", m: /\bselect\b[^?]*\b(?:all|every)\b[^?]*\b(?:rows|records|columns|from)\b|\bget all\b[^?]*\bfrom (?:a |the )?table\b/, lang: "sql",
      code: { sql: 'SELECT * FROM users;\nSELECT name, email FROM users WHERE age > 30 ORDER BY name LIMIT 10;' }, text: "SELECT chooses columns, FROM names the table, WHERE filters rows, ORDER BY sorts and LIMIT caps the count." },
    { id: "sql-join", m: /\bjoin\b[^?]*\btables?\b|\bsql join\b|\binner join\b/, lang: "sql",
      code: { sql: 'SELECT o.id, c.name\nFROM orders o\nJOIN customers c ON c.id = o.customer_id;' }, text: "A JOIN combines rows from two tables where the ON condition holds. INNER keeps matching rows only; LEFT also keeps unmatched rows from the left table." },
    { id: "sql-insert", m: /\binsert\b[^?]*\b(?:row|record|into)\b/, lang: "sql", code: { sql: "INSERT INTO users (name, age) VALUES ('Ada', 36);" }, text: "INSERT adds a new row." },
    { id: "sql-update", m: /\bupdate\b[^?]*\b(?:row|record|table|value)\b/, lang: "sql", code: { sql: "UPDATE users SET age = 37 WHERE name = 'Ada';" }, text: "UPDATE changes existing rows; without WHERE it changes every row." },
    { id: "sql-delete", m: /\bdelete\b[^?]*\b(?:row|record|from)\b/, lang: "sql", code: { sql: "DELETE FROM users WHERE id = 5;" }, text: "DELETE removes rows; without WHERE it removes all of them." },
    { id: "sql-create", m: /\bcreate\b[^?]*\btable\b/, lang: "sql", code: { sql: "CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  age INTEGER\n);" }, text: "CREATE TABLE defines the columns and their types." },
    /* git */
    { id: "git-commit", m: /\bgit commit\b|\bcommit (?:my |the )?(?:changes|code)\b/, lang: "git", code: { bash: 'git add .\ngit commit -m "Describe the change"' }, text: "git commit records a snapshot of the staged changes in the repository's history, with a message describing it." },
    { id: "git-push", m: /\bgit push\b|\bpush (?:my |the )?(?:changes|commits|code)\b/, lang: "git", code: { bash: "git push origin main" }, text: "git push uploads your local commits to a remote repository." },
    { id: "git-pull", m: /\bgit pull\b/, lang: "git", code: { bash: "git pull origin main" }, text: "git pull fetches new commits from the remote and merges them into your current branch." },
    { id: "git-clone", m: /\bgit clone\b|\bclone (?:a |the )?(?:repo|repository)\b/, lang: "git", code: { bash: "git clone https://example.com/project.git" }, text: "git clone copies a remote repository, with its whole history, to your machine." },
    { id: "git-branch", m: /\bgit branch\b|\b(?:create|make|new) (?:a )?(?:git )?branch\b|\bgit checkout -b\b|\bgit switch\b/, lang: "git", code: { bash: "git switch -c feature-name   # create and switch\ngit branch                  # list branches" }, text: "A branch is an independent line of development; git branch lists or creates them." },
    { id: "git-merge", m: /\bgit merge\b|\bmerge (?:a |the )?branch\b/, lang: "git", code: { bash: "git switch main\ngit merge feature-name" }, text: "git merge combines the history of another branch into the current one." },
    { id: "git-status", m: /\bgit status\b/, lang: "git", code: { bash: "git status" }, text: "git status shows which files are modified, staged or untracked." },
    { id: "git-add", m: /\bgit add\b|\bstage (?:my |the )?(?:changes|files)\b/, lang: "git", code: { bash: "git add file.txt   # one file\ngit add .          # everything" }, text: "git add stages changes so the next commit includes them." },
    { id: "git-log", m: /\bgit log\b|\bcommit history\b/, lang: "git", code: { bash: "git log --oneline" }, text: "git log lists the commits that led to the current state." },
    { id: "git-undo", m: /\bundo (?:the |my )?last commit\b|\bgit reset\b|\bgit revert\b/, lang: "git", code: { bash: "git reset --soft HEAD~1   # undo, keep changes staged\ngit revert HEAD           # new commit that undoes it" }, text: "reset moves the branch back (rewriting history); revert adds a new commit that cancels an old one, which is safe for shared branches." },
    { id: "git-stash", m: /\bgit stash\b/, lang: "git", code: { bash: "git stash\ngit stash pop" }, text: "git stash shelves uncommitted changes so you can return to a clean working tree." },
    { id: "git-diff", m: /\bgit diff\b/, lang: "git", code: { bash: "git diff" }, text: "git diff shows the lines changed but not yet staged." },
    { id: "git-rebase", m: /\bgit rebase\b|\brebase (?:a |my )?branch\b/, lang: "git", code: { bash: "git rebase main" }, text: "git rebase replays your commits on top of another branch, giving a linear history." },
    { id: "git-checkout", m: /\bswitch (?:to )?(?:a |another |an existing )?branch\b|\bgit (?:checkout|switch)\b/, lang: "git", code: { bash: "git switch feature\ngit checkout feature   # older form" }, text: "git switch (or git checkout) changes the branch you are working on." },
    { id: "concat-string", m: /\b(?:concatenate|concat|join|combine|append|add)\b[^?]*\b(?:two |2 |the |some )?strings?\b|\bstring concatenation\b/, not: /\bsql\b/,
      code: { python: 'full = first + " " + last\nfull = f"{first} {last}"', javascript: 'const full = first + " " + last;\nconst full2 = `${first} ${last}`;', typescript: 'const full = `${first} ${last}`;', java: 'String full = first + " " + last;\nString full2 = first.concat(" ").concat(last);', c: 'strcat(dest, src);   /* dest must have room */', cpp: 'std::string full = first + " " + last;', csharp: 'string full = first + " " + last;\nstring full2 = $"{first} {last}";', go: 'full := first + " " + last', rust: 'let full = format!("{} {}", first, last);' },
      text: { java: "The + operator joins strings; concat is the method form, and StringBuilder is better inside loops.", python: "+ joins strings; an f-string is usually clearer when mixing in values.", _: "Concatenation joins strings end to end." } },
    { id: "split-string", m: /\bsplit\b[^?]*\bstring\b|\bstring\b[^?]*\bsplit\b|\bsplit (?:a )?(?:sentence|text|line)\b/,
      code: { python: 'parts = "a,b,c".split(",")', javascript: 'const parts = "a,b,c".split(",");', java: 'String[] parts = "a,b,c".split(",");', csharp: 'string[] parts = "a,b,c".Split(\',\');', go: 'parts := strings.Split("a,b,c", ",")', rust: 'let parts: Vec<&str> = "a,b,c".split(\',\').collect();' },
      text: "split cuts a string at each separator and returns the pieces." },
    { id: "join-list", m: /\bjoin\b[^?]*\b(?:list|array|elements|items)\b[^?]*\b(?:into|to|as)\b[^?]*\bstring\b|\bjoin (?:a )?(?:list|array)\b/,
      code: { python: '", ".join(["a", "b", "c"])', javascript: '["a", "b", "c"].join(", ")', java: 'String.join(", ", List.of("a", "b", "c"))', go: 'strings.Join([]string{"a", "b", "c"}, ", ")' },
      text: "join glues the items together with a separator between them." },
    { id: "upper-lower", m: /\b(?:uppercase|upper case|lowercase|lower case|capitali[sz]e|change case)\b[^?]*\bstring\b|\bconvert (?:a |the )?string to (?:upper|lower)case\b|\bstring to (?:upper|lower)case\b/,
      code: { python: 's.upper()\ns.lower()', javascript: 's.toUpperCase();\ns.toLowerCase();', java: 's.toUpperCase();\ns.toLowerCase();', csharp: 's.ToUpper();\ns.ToLower();', go: 'strings.ToUpper(s)\nstrings.ToLower(s)' },
      text: "Strings are immutable in most languages, so these return a new string." },
    { id: "trim", m: /\b(?:trim|strip|remove (?:the )?(?:leading|trailing )?(?:white ?space|spaces))\b[^?]*\bstring\b|\btrim (?:a )?string\b/,
      code: { python: 's.strip()', javascript: 's.trim();', java: 's.trim();   // or s.strip()', csharp: 's.Trim();', go: 'strings.TrimSpace(s)' }, text: "trim removes whitespace from both ends." },
    { id: "ternary", m: /\bternary\b|\bone[- ]line if\b|\binline if\b|\bconditional expression\b/,
      code: { python: 'result = "yes" if x > 0 else "no"', javascript: 'const result = x > 0 ? "yes" : "no";', java: 'String result = x > 0 ? "yes" : "no";', c: 'const char *result = x > 0 ? "yes" : "no";', csharp: 'string result = x > 0 ? "yes" : "no";' },
      text: "A conditional expression picks one of two values in a single line." },
    { id: "switch", m: /\bswitch (?:statement|case)\b|\bwrite a switch\b|\bmatch statement\b/,
      code: { javascript: 'switch (day) {\n  case "Sat":\n  case "Sun":\n    console.log("weekend");\n    break;\n  default:\n    console.log("weekday");\n}', java: 'switch (day) {\n    case "Sat", "Sun" -> System.out.println("weekend");\n    default -> System.out.println("weekday");\n}', python: 'match day:\n    case "Sat" | "Sun":\n        print("weekend")\n    case _:\n        print("weekday")' },
      text: "A switch picks a branch by the value of one expression; break stops the fall-through in the older C-style form." },
    { id: "swap", m: /\bswap\b[^?]*\b(?:two )?(?:variables|values|numbers)\b/,
      code: { python: 'a, b = b, a', javascript: '[a, b] = [b, a];', java: 'int tmp = a;\na = b;\nb = tmp;', c: 'int tmp = a;\na = b;\nb = tmp;', go: 'a, b = b, a' }, text: "Python, JavaScript and Go can swap in one statement; the others use a temporary variable." },
    { id: "sum-list", m: /\b(?:sum|total|add up)\b[^?]*\b(?:list|array|numbers|elements)\b/, not: /\bwrite a\b/,
      code: { python: 'total = sum(numbers)', javascript: 'const total = numbers.reduce((a, b) => a + b, 0);', java: 'int total = Arrays.stream(numbers).sum();', csharp: 'int total = numbers.Sum();', go: 'total := 0\nfor _, n := range numbers {\n    total += n\n}' }, text: "Sum the elements with a built-in or a running total." },
    { id: "max-list", m: /\b(?:max|maximum|largest|biggest|smallest|minimum|min)\b[^?]*\b(?:in|of|from)\b[^?]*\b(?:list|array)\b/, not: /\bwrite a\b/,
      code: { python: 'largest = max(numbers)\nsmallest = min(numbers)', javascript: 'const largest = Math.max(...numbers);\nconst smallest = Math.min(...numbers);', java: 'int largest = Arrays.stream(numbers).max().getAsInt();', csharp: 'int largest = numbers.Max();' }, text: "Built-ins find the largest or smallest element." },
    { id: "async", m: /\basync(?:hronous)?\b[^?]*\b(?:await|function|call|code)\b|\bawait\b|\bpromises?\b/,
      code: { javascript: 'async function load(url) {\n  const res = await fetch(url);\n  return res.json();\n}', python: 'import asyncio\n\nasync def main():\n    await asyncio.sleep(1)\n\nasyncio.run(main())' },
      text: "async marks a function that can await a pending result without blocking the rest of the program." },
    { id: "map-filter", m: /\b(?:map|filter|reduce)\b[^?]*\b(?:list|array)\b|\bhigher[- ]order\b/,
      code: { javascript: 'const doubled = nums.map(n => n * 2);\nconst evens = nums.filter(n => n % 2 === 0);\nconst total = nums.reduce((a, b) => a + b, 0);', python: 'doubled = [n * 2 for n in nums]\nevens = [n for n in nums if n % 2 == 0]\ntotal = sum(nums)' },
      text: "map transforms every item, filter keeps some of them, reduce folds them into one value." },
    { id: "enumerate", m: /\b(?:loop|iterate|go)\b[^?]*\b(?:with|and)\b[^?]*\b(?:index|position|counter)\b|\benumerate\b/,
      code: { python: 'for i, item in enumerate(items):\n    print(i, item)', javascript: 'items.forEach((item, i) => console.log(i, item));', java: 'for (int i = 0; i < items.size(); i++) {\n    System.out.println(i + " " + items.get(i));\n}' }, text: "enumerate gives the index and the item together." },
    { id: "file-exists", m: /\b(?:check|test|see)\b[^?]*\bfile\b[^?]*\bexists?\b|\bfile exists\b/,
      code: { python: 'import os\nos.path.exists("data.txt")', javascript: 'const fs = require("fs");\nfs.existsSync("data.txt");', java: 'new java.io.File("data.txt").exists();', go: '_, err := os.Stat("data.txt")\nexists := err == nil' }, text: "Check for the path before reading, or handle the error when opening." },
    { id: "html-list", m: /\b(?:html|web ?page)\b[^?]*\blists?\b|\blists?\b[^?]*\b(?:in|with|using) html\b/, lang: "html", code: { html: '<ul>\n  <li>Apples</li>\n  <li>Bananas</li>\n</ul>\n\n<ol>\n  <li>First</li>\n  <li>Second</li>\n</ol>' }, text: "ul makes a bulleted list and ol a numbered one; each item goes in an li element." },
    { id: "html-link", m: /\b(?:link|hyperlink|anchor)\b[^?]*\bhtml\b|\bhtml\b[^?]*\b(?:link|hyperlink)\b/, lang: "html", code: { html: '<a href="https://example.com">Visit the site</a>' }, text: "The a element with an href attribute makes a link." },
    { id: "html-image", m: /\b(?:image|picture|img)\b[^?]*\bhtml\b|\bhtml\b[^?]*\b(?:image|picture|img)\b/, lang: "html", code: { html: '<img src="photo.jpg" alt="A short description">' }, text: "The img element shows an image; alt text describes it for screen readers." },
    { id: "html-table", m: /\btable\b[^?]*\bhtml\b|\bhtml\b[^?]*\btable\b/, lang: "html", code: { html: '<table>\n  <tr><th>Name</th><th>Age</th></tr>\n  <tr><td>Ada</td><td>36</td></tr>\n</table>' }, text: "tr is a row, th a header cell and td a data cell." },
    { id: "html-form", m: /\bform\b[^?]*\bhtml\b|\bhtml\b[^?]*\b(?:form|input)\b/, lang: "html", code: { html: '<form action="/submit" method="post">\n  <label for="name">Name</label>\n  <input id="name" name="name" type="text">\n  <button type="submit">Send</button>\n</form>' }, text: "A form groups inputs and sends them to the action URL when submitted." },
    { id: "css-center", m: /\bcent(?:er|re)\b[^?]*\b(?:div|element|box|item|content|text|image)\b|\bcss\b[^?]*\bcent(?:er|re)/, lang: "css", code: { css: '.parent {\n  display: flex;\n  justify-content: center;   /* horizontal */\n  align-items: center;       /* vertical */\n}\n\n/* centre text only */\np { text-align: center; }' }, text: "Flexbox on the parent centres its child both ways; text-align centres inline text." },
    { id: "css-color", m: /\b(?:change|set|make)\b[^?]*\b(?:colou?r|background)\b[^?]*\bcss\b|\bcss\b[^?]*\b(?:colou?r|background)\b/, lang: "css", code: { css: 'p {\n  color: blue;\n  background-color: #f0f0f0;\n}' }, text: "color sets the text colour and background-color sets the fill." },
    { id: "css-class", m: /\bcss\b[^?]*\b(?:class|selector|id)\b|\bselect\b[^?]*\b(?:class|element)\b[^?]*\bcss\b/, lang: "css", code: { css: '.card { padding: 1rem; }        /* <div class="card"> */\n#header { font-size: 2rem; }  /* <h1 id="header"> */\np { margin: 0; }                /* every <p> */' }, text: "A dot selects a class, a hash selects an id, and a bare name selects every element of that type." },
    { id: "css-flex", m: /\bflex(?:box)?\b|\bcss grid\b|\bgrid layout\b/, lang: "css", code: { css: '.row {\n  display: flex;\n  gap: 1rem;\n}\n\n.grid {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 1rem;\n}' }, text: "Flexbox lays items out in one direction; grid lays them out in rows and columns." },
    { id: "css-media", m: /\bmedia quer(?:y|ies)\b|\bresponsive\b[^?]*\b(?:css|design|layout)\b/, lang: "css", code: { css: '@media (max-width: 600px) {\n  .sidebar { display: none; }\n}' }, text: "A media query applies its rules only when the screen matches the condition." },
    { id: "js-dom", m: /\b(?:get|find|select|change|update|set)\b[^?]*\b(?:element|text|html)\b[^?]*\b(?:by id|dom|document)\b|\bgetelementbyid\b|\bquerySelector\b|\bchange the text of\b/, code: { javascript: 'const title = document.getElementById("title");\ntitle.textContent = "Hello";\n\nconst box = document.querySelector(".box");' }, text: "getElementById and querySelector find an element so you can change it." },
    { id: "js-event", m: /\b(?:click|button)\b[^?]*\b(?:event|listener|handler)\b|\baddEventListener\b|\bevent listener\b/, code: { javascript: 'button.addEventListener("click", () => {\n  console.log("clicked");\n});' }, text: "addEventListener runs a function whenever the event happens." },
    { id: "env-var", m: /\benvironment variables?\b|\benv var\b/,
      code: { python: 'import os\nvalue = os.environ.get("HOME")', javascript: 'const value = process.env.HOME;', java: 'String value = System.getenv("HOME");', go: 'value := os.Getenv("HOME")', bash: 'echo "$HOME"' }, text: "Environment variables are read from the process environment." }
  ];

  /* ---------------------------------------------------- concept answers */
  var CONCEPTS = [
    { m: /\b(?:difference between|differences between|compare|vs\.?|versus)\b[^?]*\b(?:let|const|var)\b[^?]*\b(?:let|const|var)\b|\b(?:let|const|var) (?:vs\.?|versus|and|or) (?:let|const|var)\b/, a: "In JavaScript, const declares a binding that cannot be reassigned and let declares one that can; both are block-scoped. var is the older form: it is function-scoped, hoisted and can be redeclared. Prefer const by default and let when the value must change." },
    { m: /\b(?:what is|explain)\b[^?]*\binheritance\b/, a: "Inheritance lets a class reuse and extend another class: the subclass gets the parent's fields and methods and can add to them or override them." },
    { m: /\b(?:what is|explain)\b[^?]*\bpolymorphism\b/, a: "Polymorphism lets different types be used through the same interface, so the same call can behave differently depending on the object it is made on." },
    { m: /\b(?:what is|explain)\b[^?]*\bencapsulation\b/, a: "Encapsulation bundles data with the methods that work on it and hides the internal details behind a public interface." },
    { m: /\bwhat is (?:a |an )?(?:software |web )?framework\b/, a: "A framework is a reusable structure of code that provides the skeleton of an application and calls your code at set points; examples are Django, React and Spring. A library, by contrast, is code that you call." },
    { m: /\b(?:difference between|differences between)\b[^?]*\b(?:library|libraries)\b[^?]*\bframework|\bframework\b[^?]*\blibrar/, a: "You call a library, but a framework calls you: a library is a set of functions you use when you want, while a framework sets the structure of the application and runs your code inside it." },
    { m: /\b(?:difference between|differences between)\b[^?]*\bget\b[^?]*\bpost\b/, a: "GET asks a server for data and puts its parameters in the URL, so it should not change anything; POST sends data in the request body to create or change something." },
    { m: /\b(?:difference between|differences between)\b[^?]*\bram\b[^?]*\brom\b/, a: "RAM is fast, temporary memory that holds what is running and is cleared when power is off; ROM is permanent memory that keeps its contents without power and holds startup instructions." },
    { m: /\b(?:difference between|differences between)\b[^?]*\bstack\b[^?]*\bheap\b/, a: "The stack holds function call frames and local variables and is managed automatically; the heap holds dynamically allocated memory that lives until it is freed or garbage-collected." },
    { m: /\b(?:difference between|differences between)\b[^?]*\btcp\b[^?]*\budp\b/, a: "TCP is reliable and ordered, setting up a connection and retransmitting lost data; UDP is connectionless and faster but gives no guarantee of delivery or order." },
    { m: /\bwhat is (?:the )?debugging\b|\bwhat is debugging\b|\bwhat does debugging mean\b/, a: "Debugging is finding and fixing the cause of a bug in a program, usually by reproducing the problem, narrowing it down with logs, breakpoints or tests, and then correcting the code." },
    { m: /\bwhat is (?:a |an )?unit tests?\b/, a: "A unit test is a small automated test that checks one piece of code, such as a function, in isolation." },
    { m: /\bwhat is agile\b|\bwhat is scrum\b/, a: "Agile is an approach to software development that works in short iterations, delivers working software often and adapts to feedback; Scrum and Kanban are common methods." },
    { m: /\bwhat does ip stand for\b|\bwhat is ip\b|\bip stands for\b/, a: "IP stands for Internet Protocol, the set of rules for addressing and routing data across networks." },
    { m: /\bwhat does (?:tcp) stand for\b/, a: "TCP stands for Transmission Control Protocol." },
    { m: /\bwhat does (?:api) stand for\b/, a: "API stands for Application Programming Interface." },
    { m: /\bwhat does (?:gpu) stand for\b/, a: "GPU stands for Graphics Processing Unit." },
    { m: /\bwhat does (?:http) stand for\b/, a: "HTTP stands for HyperText Transfer Protocol." },
    { m: /\bwhat does (?:the )?len(?:gth)?(?: function)? do\b|\bwhat is (?:the )?len(?: function)?\b/, a: "len returns the number of items in a sequence or collection — the number of characters in a string, elements in a list, keys in a dictionary." },
    { m: /\bwhat does (?:the )?print(?: function| statement)? do\b/, a: "print writes its argument to the console (standard output)." },
    { m: /\bwhat does (?:the )?range(?: function)? do\b/, a: "range(a, b) produces the integers from a up to but not including b; range(n) starts at 0." },
    { m: /\bwhat does (?:the )?(?:type|typeof)(?: function| operator)? do\b/, a: "It reports the type of a value (for example int, string or list)." },
    { m: /\bwhat does (?:the )?(?:input)(?: function)? do\b/, a: "input reads a line of text typed by the user and returns it as a string." },
    { m: /\bwhat does (?:the )?(?:append)(?: method| function)? do\b/, a: "append adds one item to the end of a list." },
    { m: /\bwhat does (?:the )?(?:strip|trim)(?: method| function)? do\b/, a: "It removes whitespace from the start and end of a string." },
    { m: /\bwhat does (?:the )?(?:split)(?: method| function)? do\b/, a: "split breaks a string into a list of pieces at a separator." },
    { m: /\bwhat does (?:the )?(?:join)(?: method| function)? do\b/, a: "join glues a list of strings into one string with a separator between them." },
    { m: /\bwhat does (?:the )?(?:map)(?: method| function)? do\b/, a: "map applies a function to every element and returns the results." },
    { m: /\bwhat does (?:the )?(?:filter)(?: method| function)? do\b/, a: "filter keeps only the elements for which a test function returns true." },
    { m: /\bwhat does (?:the )?(?:reduce)(?: method| function)? do\b/, a: "reduce folds a list into a single value by combining the elements one at a time." },
    { m: /\bwhat does (?:the )?break(?: statement| keyword)?(?: do)?\b|\bwhat is (?:the )?break(?: statement| keyword)\b/, a: "break ends the loop immediately, and the program continues with the first statement after the loop." },
    { m: /\bwhat does (?:the )?continue(?: statement| keyword)?(?: do)?\b/, a: "continue skips the rest of the current pass through a loop and jumps to the next iteration." },
    { m: /\bwhat does (?:the )?pass(?: statement| keyword)?(?: do)?\b/, a: "In Python, pass does nothing — it is a placeholder for a block that must exist but has no code yet." },
    { m: /\bwhat is (?:a )?primary key\b/, a: "A primary key is a column (or set of columns) whose value uniquely identifies each row in a table; it cannot be null or repeated." },
    { m: /\bwhat is (?:a )?foreign key\b/, a: "A foreign key is a column that refers to the primary key of another table, linking the two tables." },
    { m: /\bwhat is (?:a )?(?:pointer)\b/, a: "A pointer is a variable that holds the memory address of another value instead of the value itself." },
    { m: /\bwhat is (?:a )?(?:compiler)\b/, a: "A compiler translates source code written in a programming language into machine code (or another language) before the program runs." },
    { m: /\bwhat is (?:an? )?(?:interpreter)\b/, a: "An interpreter reads and executes a program's source code step by step instead of translating it all in advance." },
    { m: /\bwhat does (?:the )?(?:return)(?: statement| keyword)? do\b/, a: "return ends a function and hands a value back to the caller." },
    { m: /\bwhat does (?:the )?(?:import)(?: statement| keyword)? do\b/, a: "import makes code defined in another module available in this file." },
    { m: /\bwhat does (?:the )?(?:console\.log) do\b/, a: "console.log prints a value to the JavaScript console." },
    { m: /\bwhat does (?:the )?(?:null|none) (?:value )?mean\b/, a: "It is a value that stands for \"no value\" — an intentionally empty reference." },
    { m: /\bwhat is (?:the )?difference between (?:==|equals) and (?:===|identity)\b|\b== and ===\b|\bdifference between == and ===/, a: "== compares after converting types (loose equality), so 0 == \"0\" is true; === compares value and type with no conversion (strict equality), so 0 === \"0\" is false. Prefer === in JavaScript." },
    { m: /\bdifference between (?:a )?list and (?:a )?tuple\b|\blist vs\.? tuple\b|\btuple vs\.? list\b/, a: "A list is mutable — you can add, remove and change items — while a tuple is immutable: once created it cannot change. Tuples are written with parentheses, lists with square brackets, and tuples can be used as dictionary keys." },
    { m: /\bdifference between (?:a )?list and (?:a )?set\b/, a: "A list is ordered and allows duplicates; a set is unordered and holds each value once, with fast membership tests." },
    { m: /\bdifference between (?:an? )?array and (?:a )?(?:linked list)\b/, a: "An array stores items contiguously, so indexing is O(1) but inserting in the middle is O(n); a linked list chains nodes by pointers, so inserting is O(1) once you hold the node but reaching the k-th item is O(n)." },
    { m: /\bdifference between (?:a )?stack and (?:a )?queue\b/, a: "A stack is last-in, first-out (the most recent item leaves first); a queue is first-in, first-out (the oldest item leaves first)." },
    { m: /\bdifference between (?:let|var|const)\b|\blet vs\.? (?:var|const)\b|\bvar vs\.? let\b/, a: "var is function-scoped and can be redeclared; let is block-scoped and reassignable; const is block-scoped and cannot be reassigned." },
    { m: /\bdifference between (?:null|none) and (?:undefined|zero|0)\b/, a: "null is an intentional \"no value\"; undefined means a variable was declared but never assigned. Both are different from 0 or an empty string." },
    { m: /\bdifference between (?:a )?compiler and (?:an )?interpreter\b|\bcompiled (?:vs\.?|versus|or) interpreted\b/, a: "A compiler translates the whole program into machine code before it runs; an interpreter executes the source step by step as it reads it." },
    { m: /\bdifference between git and github\b|\bgit vs\.? github\b/, a: "Git is the version-control tool that tracks changes on your computer; GitHub is a website that hosts Git repositories so people can share and collaborate." },
    { m: /\bdifference between (?:sql )?(?:inner|left|right|full)? ?join\b/, a: "INNER JOIN keeps only rows that match in both tables; LEFT JOIN keeps all rows from the left table, with NULLs where the right has no match; RIGHT JOIN is the mirror image; FULL JOIN keeps all rows from both." },
    { m: /\bdifference between (?:a )?function and (?:a )?method\b/, a: "A method is a function that belongs to an object or class and is called on it; a plain function stands on its own." },
    { m: /\bdifference between (?:a )?(?:class) and (?:an )?object\b/, a: "A class is the blueprint; an object is one instance built from it." },
    { m: /\bdifference between (?:a )?(?:mutable) and (?:an )?(?:immutable)|\bmutable (?:vs\.?|versus) immutable\b/, a: "A mutable value can be changed in place; an immutable one cannot — changing it means creating a new value." },
    { m: /\bwhat is (?:a |an )?(?:function)(?: in programming)?\b[?]?$/, a: "A function is a named, reusable block of code that takes inputs (parameters), does some work and can return a result." },
    { m: /\bwhat is (?:a |an )?(?:variable)(?: in programming)?[?]?$/, a: "A variable is a named place in memory that stores a value your program can read and change." },
    { m: /\bwhat is (?:a |an )?(?:if statement|if-else statement|conditional)\b/, a: "An if statement runs a block of code only when a condition is true; an else branch runs when it is false, so the program can decide between paths." },
    { m: /\bwhat is (?:a |an )?(?:loop)(?: in programming)?[?]?$|\bwhat is (?:a )?(?:for|while) loop\b/, a: "A loop repeats a block of code — for a set number of times (for loop) or while a condition holds (while loop)." },
    { m: /\bwhat is recursion\b|\bwhat is (?:a )?recursive function\b/, a: "Recursion is when a function calls itself on a smaller version of the problem until it reaches a base case that stops the calls — for example factorial(n) = n × factorial(n−1), with factorial(0) = 1." },
    { m: /\bwhat is (?:an? )?(?:array)(?: in programming)?[?]?$/, a: "An array is an ordered collection of elements stored under numbered positions (indexes), usually starting at 0." },
    { m: /\bwhat is (?:a )?(?:hash table|hash ?map|dictionary)\b/, a: "A hash table stores key-value pairs; a hash function turns each key into an index, so lookups, inserts and deletes take O(1) time on average." },
    { m: /\bwhat is (?:an )?(?:api)\b|\bwhat does api stand for\b/, a: "An API (Application Programming Interface) is a defined way for one piece of software to request data or actions from another — for example a web service that answers HTTP requests." },
    { m: /\bwhat is (?:a )?(?:class)(?: in programming)?[?]?$/, a: "A class is a blueprint that defines the data (fields) and behaviour (methods) of a kind of object; objects are created from it." },
    { m: /\bwhat is (?:an )?(?:object)(?: in programming)?[?]?$/, a: "An object bundles data and the functions that act on it; it is an instance of a class." },
    { m: /\bwhat is (?:an? )?algorithm\b/, a: "An algorithm is a finite, step-by-step procedure for solving a problem or computing a result." },
    { m: /\bwhat is big[- ]?o(?: notation)?\b|\bwhat is time complexity\b/, a: "Big O notation describes how an algorithm's running time or memory grows as the input size n grows, keeping only the dominant term — for example O(1) constant, O(log n), O(n), O(n log n), O(n²). It is an upper bound that ignores constant factors." },
    { m: /\bwhat is (?:a )?(?:sql )?join\b/, a: "A SQL JOIN combines rows from two tables based on a related column, such as customer_id, so related data can be queried together." },
    { m: /\bwhat does json stand for\b|\bwhat is json\b/, a: "JSON stands for JavaScript Object Notation — a lightweight text format for data made of objects (key-value pairs) and arrays." },
    { m: /\bwhat does html stand for\b/, a: "HTML stands for HyperText Markup Language." },
    { m: /\bwhat does css stand for\b/, a: "CSS stands for Cascading Style Sheets." },
    { m: /\bwhat does sql stand for\b/, a: "SQL stands for Structured Query Language." },
    { m: /\bwhat does (?:http) stand for\b/, a: "HTTP stands for HyperText Transfer Protocol." },
    { m: /\bwhat does (?:url) stand for\b/, a: "URL stands for Uniform Resource Locator." },
    { m: /\bwhat does (?:ram) stand for\b/, a: "RAM stands for Random Access Memory." },
    { m: /\bwhat does (?:cpu) stand for\b/, a: "CPU stands for Central Processing Unit." },
    { m: /\bwhat does (?:gpu) stand for\b/, a: "GPU stands for Graphics Processing Unit." },
    { m: /\bwhat does (?:usb) stand for\b/, a: "USB stands for Universal Serial Bus." },
    { m: /\bwhat does (?:ide) stand for\b/, a: "IDE stands for Integrated Development Environment." },
    { m: /\bwhat does (?:dns) stand for\b/, a: "DNS stands for Domain Name System." },
    { m: /\bwhat does (?:ai) stand for\b/, a: "AI stands for Artificial Intelligence." },
    { m: /\bwhat does (?:pdf) stand for\b/, a: "PDF stands for Portable Document Format." },
    { m: /\bwhat does (?:gps) stand for\b/, a: "GPS stands for Global Positioning System." },
    { m: /\bwhat does (?:wifi|wi-fi) stand for\b/, a: "Wi-Fi is a brand name rather than an acronym; it is commonly (and loosely) read as \"wireless fidelity\"." },
    { m: /\bwhat does git commit do\b|\bwhat is a git commit\b/, a: "git commit records a snapshot of the staged changes in the repository's history, with a message describing it." },
    { m: /\bwhat is (?:a )?(?:git )?(?:repository|repo)\b/, a: "A repository is a project folder together with its full history of changes, tracked by version control such as Git." },
    { m: /\bwhat is version control\b/, a: "Version control records every change to a set of files so you can see history, compare versions, undo mistakes and collaborate without overwriting each other's work. Git is the most widely used system." },
    { m: /\bwhat is (?:a )?(?:binary search)\b/, a: "Binary search finds a value in a sorted list by repeatedly comparing with the middle element and discarding the half that cannot contain it, taking O(log n) steps." },
    { m: /\bwhat is (?:a )?(?:stack)(?: in programming| data structure)?[?]?$/, a: "A stack is a last-in, first-out collection: you push items on top and pop the most recent one off." },
    { m: /\bwhat is (?:a )?(?:queue)(?: in programming| data structure)?[?]?$/, a: "A queue is a first-in, first-out collection: items are added at the back and removed from the front." },
    { m: /\bwhat is (?:a )?(?:linked list)\b/, a: "A linked list is a sequence of nodes where each node holds a value and a pointer to the next node." },
    { m: /\bwhat is (?:a )?(?:database)\b/, a: "A database is an organised collection of data stored so it can be queried, updated and managed efficiently." },
    { m: /\bwhat is (?:a )?(?:framework)\b/, a: "A framework is a reusable structure of code that provides the skeleton of an application and calls your code at defined points." },
    { m: /\bwhat is (?:a )?(?:bug)\b(?: in programming| in software)?/, a: "A bug is a flaw in a program that makes it behave incorrectly or unexpectedly." },
    { m: /\bwhat is debugging\b/, a: "Debugging is finding and fixing the causes of incorrect behaviour in a program." },
    { m: /\bwhat is (?:a )?(?:string)(?: in programming)?[?]?$/, a: "A string is a sequence of characters used to represent text." },
    { m: /\bwhat is (?:a )?(?:boolean)\b/, a: "A boolean is a value that is either true or false." },
    { m: /\bwhat is (?:an )?(?:integer)(?: in programming)?[?]?$/, a: "An integer is a whole number with no fractional part, such as −3, 0 or 42." }
  ];

  var COMPLEXITY = {
    quicksort: ["O(n log n) on average, O(n²) in the worst case (a bad pivot choice), O(log n) extra space", "n log n"],
    "quick sort": ["O(n log n) on average, O(n²) in the worst case (a bad pivot choice), O(log n) extra space", "n log n"],
    mergesort: ["O(n log n) in every case, with O(n) extra space", "n log n"],
    "merge sort": ["O(n log n) in every case, with O(n) extra space", "n log n"],
    heapsort: ["O(n log n) in every case, in place", "n log n"],
    "heap sort": ["O(n log n) in every case, in place", "n log n"],
    "bubble sort": ["O(n²) on average and in the worst case; O(n) if the input is already sorted and you stop early", "n²"],
    "insertion sort": ["O(n²) on average and worst case; O(n) when nearly sorted", "n²"],
    "selection sort": ["O(n²) in every case", "n²"],
    "binary search": ["O(log n), because each step halves the remaining range (the list must be sorted)", "log n"],
    "linear search": ["O(n): in the worst case every element is checked", "n"],
    "hash table": ["O(1) on average for lookup, insert and delete; O(n) in the worst case when many keys collide", "1"],
    "hash map": ["O(1) on average for lookup, insert and delete; O(n) in the worst case when many keys collide", "1"],
    "dictionary lookup": ["O(1) on average", "1"],
    "array access": ["O(1) by index", "1"],
    "linked list": ["O(1) to insert after a known node, O(n) to find the k-th element", "n"],
    bfs: ["O(V + E) for a graph with V vertices and E edges", "V + E"],
    "breadth-first search": ["O(V + E) for a graph with V vertices and E edges", "V + E"],
    dfs: ["O(V + E) for a graph with V vertices and E edges", "V + E"],
    "depth-first search": ["O(V + E) for a graph with V vertices and E edges", "V + E"],
    dijkstra: ["O((V + E) log V) with a binary heap", "log V"],
    "dijkstra's algorithm": ["O((V + E) log V) with a binary heap", "log V"]
  };

  function complexity(l) {
    if (!/\b(?:time complexity|big[- ]?o|complexity|how fast|running time|runtime)\b/.test(l)) return null;
    var keys = Object.keys(COMPLEXITY).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) if (l.indexOf(keys[i]) >= 0) {
      var avg = /\baverage\b/.test(l) && /O\(n log n\) on average/.test(COMPLEXITY[keys[i]][0]);
      return { answer: "The time complexity of " + keys[i] + " is " + COMPLEXITY[keys[i]][0] + ".", schema: "complexity" };
    }
    return null;
  }

  function solve(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 300) return null;
    var l = t.toLowerCase().replace(/[?!.]+$/, "");
    if (!/\b(?:if statement|if-else|conditional|statement|data structure|pointer|keyword|operator|python|javascript|js|java|code|coding|program(?:ming)?|function|variable|loop|array|list|string|algorithm|recursion|class|object|sql|git|html|css|json|api|bug|compile|compiler|syntax|database|stack|queue|hash|tuple|set|dictionary|binary|big[- ]?o|complexity|len|print|node|typescript|ruby|php|golang|rust|bash|shell|regex|http|lambda|import|method|repository|repo|commit|branch|framework|library|libraries|ram|rom|debugging|debug|unit test|agile|scrum|ip|tcp|udp|heap|inheritance|polymorphism|encapsulation|csv|package|pip|npm|let|const|var|get|post|c\+\+|dom|css|flexbox|responsive)\b/.test(l) && !/c\+\+/.test(l)) return null;
    var cx = complexity(l);
    if (cx) return { answer: cx.answer, steps: [], schema: cx.schema, confidence: 0.9 };
    var lang = langOf(l);
    /* concept definitions, differences and "what does X do" */
    for (var i = 0; i < CONCEPTS.length; i++) {
      if (CONCEPTS[i].m.test(l)) return { answer: CONCEPTS[i].a, steps: [], schema: "concept", confidence: 0.9 };
    }
    /* "what does git X do" and similar: the entry's own text */
    if (/^(?:what (?:does|is|do)|explain|describe|tell me about)\b/.test(l)) {
      for (var gi = 0; gi < HOWTO.length; gi++) if (HOWTO[gi].lang === "git" && HOWTO[gi].m.test(l)) return { answer: HOWTO[gi].text + "\n" + fence("bash", HOWTO[gi].code.bash), steps: [], schema: "howto", confidence: 0.88, language: "bash" };
    }
    /* "how do I ..." idioms */
    if (!/\b(?:how|write|show|give|create|make|use|declare|define|read|open|print|sort|loop|iterate|get|convert|parse|handle|reverse|remove|find|check)\b/.test(l)) return null;
    if (/\bwrite\b[^?]*\b(?:function|program|script|method|loop|snippet|query)\b[^?]*\b(?:that|which|to|for)\b/.test(l) && !/\bhello,? world\b/.test(l)) return null; /* construction requests belong to the code builder */
    var best = null, bestLen = 0;
    HOWTO.forEach(function (h) {
      var m = l.match(h.m);
      if (!m || (h.not && h.not.test(l)) || (h.m2 && !h.m2.test(l))) return;
      /* an idiom written for the language the question names beats a general one */
      var len = m[0].length + (h.pri || 0) + (lang && (h.lang === lang || (h.code && h.code[lang])) ? 100 : 0) + (h.lang === "html" || h.lang === "css" ? (lang === h.lang ? 100 : -1000) : 0);
      if (len > bestLen) { best = h; bestLen = len; }
    });
    if (!best) return null;
    var useLang = lang;
    if (best.lang === "sql") useLang = "sql";
    else if (best.lang === "git") useLang = "bash";
    else if (best.lang === "html" || best.lang === "css") useLang = best.lang;
    else if (best.lang && !lang) useLang = best.lang;
    if (!useLang) useLang = best.code.python ? "python" : Object.keys(best.code)[0];
    var snippet = best.code[useLang];
    var shown = useLang;
    if (!snippet) {
      if (lang) return null; /* the language was named and this idiom is not known for it */
      snippet = best.code.python || best.code.javascript; shown = best.code.python ? "python" : "javascript";
    }
    var expl = typeof best.text === "object" ? (best.text[useLang] || best.text._ || "") : best.text;
    var head = NAMES[shown === "bash" && best.lang === "git" ? "bash" : shown] || shown;
    var intro = best.lang === "git" ? "" : (lang ? "In " + head + ":\n" : "In " + head + " (other languages are similar):\n");
    return { answer: intro + fence(shown, snippet) + (expl ? "\n" + expl : ""), steps: [], schema: "howto", confidence: 0.88, language: shown };
  }

  root.C4LMHowTo = { solve: solve, entries: function () { return HOWTO.length + CONCEPTS.length; } };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMHowTo;
})(typeof window !== "undefined" ? window : globalThis);
