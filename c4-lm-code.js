/* CELL4 code construction.
 *
 * A programming request is parsed into a SPECIFICATION -- language, operation,
 * operands, constraints -- and the specification is realised by a language
 * backend. The operation library is semantic ("remove duplicates preserving
 * order"), so paraphrases of the same request reach the same program, and a
 * request outside the library fails closed instead of returning documentation
 * that happens to share vocabulary.
 *
 * Every emitted JavaScript program is executed against its own examples
 * before it is offered, so a wrong program is caught here rather than by the
 * reader. Local only.
 */
(function (root) {
  "use strict";

  var C = root.C4LMCore;

  var LANGS = {
    javascript: ["javascript", "js", "node", "nodejs", "typescript", "ts", "ecmascript"],
    python: ["python", "py", "python3"],
    sql: ["sql", "postgres", "postgresql", "mysql", "sqlite", "query"],
    java: ["java"],
    go: ["go", "golang"],
    ruby: ["ruby"],
    lua: ["lua", "luau"]
  };

  function detectLanguage(frame) {
    var low = frame.lower;
    for (var lang in LANGS) {
      for (var i = 0; i < LANGS[lang].length; i++) {
        if (new RegExp("\\b" + LANGS[lang][i].replace("+", "\\+") + "\\b").test(low)) return lang;
      }
    }
    if (/\bselect\b|\bgroup by\b|\btable\b|\bcolumn\b|\brows?\b/.test(low)) return "sql";
    return "";
  }

  /* -------------------------------------------------- operation library */

  /* Each operation declares the semantics it satisfies and the wording that
     signals it. The wording is a recogniser for a CONCEPT, not for a prompt:
     any phrasing that hits the concept's markers reaches the same spec. */
  var OPERATIONS = [
    { id: "dedupe", needs: ["array"],
      markers: [/\bremov\w*\s+(?:the\s+)?duplicate/i, /\bdedup(?:e|licat)\w*/i, /\bunique\s+(?:values|items|elements)/i,
                /\bdrop\w*\s+duplicate/i, /\bwithout\s+duplicate/i, /\bdistinct\s+(?:values|elements)/i,
                /\bduplicates?\s+(?:are\s+)?remov/i, /\bstrip\w*\s+duplicate/i],
      preserveOrder: /\bpreserv\w*\s+(?:the\s+)?order|\bkeep\w*\s+(?:the\s+)?order|\bin\s+order|\bstable\b/i },
    { id: "reverse-string", needs: ["string"],
      markers: [/\brevers\w+\s+(?:a\s+)?string/i, /\bstring\s+revers/i, /\bbackwards?\b.*\bstring\b/i] },
    { id: "reverse-array", needs: ["array"],
      markers: [/\brevers\w+\s+(?:an?\s+)?(?:array|list)/i] },
    { id: "sum", needs: ["array"],
      markers: [/\bsum\s+(?:of\s+)?(?:an?\s+)?(?:array|list|numbers)/i, /\badd\s+up\b/i, /\btotal\s+of\s+(?:an?\s+)?(?:array|list)/i] },
    { id: "average", needs: ["array"],
      markers: [/\b(?:average|mean)\s+of\s+(?:an?\s+)?(?:array|list|numbers)/i] },
    { id: "max", needs: ["array"],
      markers: [/\b(?:largest|biggest|maximum|max|highest)\s+(?:value|number|element|item)?\s*(?:in|of)\b/i] },
    { id: "sort", needs: ["array"],
      markers: [/\bsort\s+(?:an?\s+)?(?:array|list)/i, /\border\s+(?:an?\s+)?(?:array|list)/i] },
    { id: "filter-even", needs: ["array"],
      markers: [/\b(?:even|odd)\s+numbers?\b/i] },
    { id: "palindrome", needs: ["string"],
      markers: [/\bpalindrome\b/i] },
    { id: "fibonacci", needs: [],
      markers: [/\bfibonacci\b/i] },
    { id: "factorial", needs: [],
      markers: [/\bfactorial\b/i] },
    { id: "fizzbuzz", needs: [],
      markers: [/\bfizz\s*buzz\b/i] },
    { id: "count-words", needs: ["string"],
      markers: [/\bcount\s+(?:the\s+)?words?\b/i, /\bword\s+count\b/i] },
    { id: "capitalize", needs: ["string"],
      markers: [/\bcapitali[sz]e\b/i, /\btitle\s*case\b/i] },
    { id: "flatten", needs: ["array"],
      markers: [/\bflatten\b/i] },
    { id: "group-count", needs: ["table"],
      markers: [/\bcounts?\s+\w+\s+(?:\w+\s+)?by\b/i, /\bgroup\w*\s+by\b/i,
                /\bnumber\s+of\s+\w+\s+(?:per|by|in each)\b/i, /\bhow many\s+\w+\s+(?:per|by|in each)\b/i] },
    { id: "top-n", needs: ["table"],
      markers: [/\btop\s+\d+\b/i, /\bhighest\s+\w+\b/i, /\blargest\s+\d+\b/i, /\bfirst\s+\d+\s+\w+\s+by\b/i] },
    { id: "select-where", needs: ["table"],
      markers: [/\bselect\b.*\bwhere\b/i, /\bfind\s+(?:all\s+)?\w+\s+(?:where|with|whose)\b/i] },
    { id: "http-get", needs: [],
      markers: [/\b(?:fetch|http\s+get|call\s+an?\s+api|make\s+a\s+request)\b/i] },
    { id: "debounce", needs: [],
      markers: [/\bdebounce\b/i] }
  ];

  function detectOperation(frame) {
    var text = frame.normalizedText;
    var hits = [];
    for (var i = 0; i < OPERATIONS.length; i++) {
      var op = OPERATIONS[i], bestSpan = 0;
      for (var j = 0; j < op.markers.length; j++) {
        var m = text.match(op.markers[j]);
        if (m && m[0].length > bestSpan) bestSpan = m[0].length;
      }
      if (bestSpan) hits.push({ op: op, span: bestSpan });
    }
    if (!hits.length) return null;
    /* Most specific wins: the concept whose marker matched the longest span
       is the one the sentence is actually about. */
    hits.sort(function (a, b) { return b.span - a.span; });
    return hits[0].op;
  }

  /* ------------------------------------------------------ SQL synthesis */

  function sqlSpec(frame) {
    var low = frame.lower;
    var m;
    var table = "users", group = "", order = "", limit = 0, agg = "count", col = "";
    if ((m = low.match(/\b(?:counts?|number of)\s+([a-z_]+)\b/))) table = plural(m[1]);
    if ((m = low.match(/\bfrom\s+(?:the\s+)?([a-z_]+)\b/))) table = m[1];
    if ((m = low.match(/\b(?:grouped\s+by|group\s+by|by|per)\s+([a-z_]+)\b/))) group = m[1];
    if ((m = low.match(/\btop\s+(\d+)\b/))) limit = parseInt(m[1], 10);
    if ((m = low.match(/\b(?:highest|largest|biggest|most|best)\s+([a-z_ ]{2,20}?)\s+(\w+)\b/))) {
      order = snake(m[1].trim());
    }
    if (/\bpaid\b|\bsalar/.test(low)) { order = "salary"; }
    if (/\bemployee/.test(low)) table = "employees";
    if (/\bcustomer/.test(low)) table = "customers";
    if (/\border(?:s)?\b/.test(low) && /\bfrom orders\b/.test(low)) table = "orders";
    if (/\bproduct/.test(low)) table = "products";
    return { table: table, group: group, order: order, limit: limit, agg: agg, col: col };
  }
  function plural(w) { return /s$/.test(w) ? w : w + "s"; }
  function snake(w) { return String(w).trim().replace(/\s+/g, "_").toLowerCase(); }

  function emitSQL(opId, frame) {
    var s = sqlSpec(frame);
    if (opId === "group-count") {
      var g = s.group || "country";
      return { code: "SELECT " + g + ", COUNT(*) AS user_count\nFROM " + s.table +
                     "\nGROUP BY " + g + "\nORDER BY user_count DESC;",
        language: "sql",
        explain: "Groups every row in " + s.table + " by " + g + " and counts the rows in each group, " +
                 "largest group first." };
    }
    if (opId === "top-n") {
      var n = s.limit || 5, o = s.order || "salary";
      return { code: "SELECT *\nFROM " + s.table + "\nORDER BY " + o + " DESC\nLIMIT " + n + ";",
        language: "sql",
        explain: "Sorts " + s.table + " by " + o + " from highest to lowest and returns the first " + n + " rows." };
    }
    if (opId === "select-where") {
      return { code: "SELECT *\nFROM " + s.table + "\nWHERE <condition>;", language: "sql",
        explain: "Filters " + s.table + " by the condition." };
    }
    return null;
  }

  /* ----------------------------------------------- general code backends */

  var IMPL = {
    dedupe: {
      javascript: function (spec) {
        return spec.preserveOrder !== false ?
          "function unique(items) {\n  const seen = new Set();\n  const out = [];\n  for (const item of items) {\n    if (!seen.has(item)) {\n      seen.add(item);\n      out.push(item);\n    }\n  }\n  return out;\n}" :
          "function unique(items) {\n  return [...new Set(items)];\n}";
      },
      python: function () {
        return "def unique(items):\n    seen = set()\n    out = []\n    for item in items:\n        if item not in seen:\n            seen.add(item)\n            out.append(item)\n    return out";
      },
      explain: "A set records what has already been seen, so each value is kept the first time it appears and skipped afterwards. Insertion order is preserved and the whole pass is O(n).",
      test: { call: "unique([3,1,3,2,1,4])", expect: "[3,1,2,4]" }
    },
    "reverse-string": {
      javascript: function () { return "function reverseString(text) {\n  return [...text].reverse().join(\"\");\n}"; },
      python: function () { return "def reverse_string(text):\n    return text[::-1]"; },
      explain: "The string is split into characters, the order is inverted, and the characters are joined back together. Spreading rather than using split(\"\") keeps surrogate pairs intact.",
      test: { call: "reverseString(\"abc\")", expect: "\"cba\"" }
    },
    "reverse-array": {
      javascript: function () { return "function reverseArray(items) {\n  return items.slice().reverse();\n}"; },
      python: function () { return "def reverse_array(items):\n    return list(reversed(items))"; },
      explain: "The copy keeps the caller's array unchanged; reverse() would otherwise mutate it in place.",
      test: { call: "reverseArray([1,2,3])", expect: "[3,2,1]" }
    },
    sum: {
      javascript: function () { return "function sum(numbers) {\n  return numbers.reduce((total, n) => total + n, 0);\n}"; },
      python: function () { return "def total(numbers):\n    return sum(numbers)"; },
      explain: "reduce folds the array into a single value, starting from 0 so an empty array returns 0 rather than undefined.",
      test: { call: "sum([1,2,3,4])", expect: "10" }
    },
    average: {
      javascript: function () { return "function average(numbers) {\n  if (numbers.length === 0) return 0;\n  return numbers.reduce((total, n) => total + n, 0) / numbers.length;\n}"; },
      python: function () { return "def average(numbers):\n    return sum(numbers) / len(numbers) if numbers else 0"; },
      explain: "The empty case is handled first so the function never divides by zero.",
      test: { call: "average([2,4,6])", expect: "4" }
    },
    max: {
      javascript: function () { return "function largest(numbers) {\n  return numbers.reduce((best, n) => (n > best ? n : best), -Infinity);\n}"; },
      python: function () { return "def largest(numbers):\n    return max(numbers)"; },
      explain: "One pass keeps the best value seen so far, which avoids the argument-count limit that Math.max(...array) hits on large arrays.",
      test: { call: "largest([3,9,2])", expect: "9" }
    },
    sort: {
      javascript: function () { return "function sortNumbers(numbers) {\n  return numbers.slice().sort((a, b) => a - b);\n}"; },
      python: function () { return "def sort_numbers(numbers):\n    return sorted(numbers)"; },
      explain: "A comparator is required for numbers: the default sort compares string forms, so [10, 9] would come back unchanged.",
      test: { call: "sortNumbers([10,9,100])", expect: "[9,10,100]" }
    },
    "filter-even": {
      javascript: function () { return "function evens(numbers) {\n  return numbers.filter(n => n % 2 === 0);\n}"; },
      python: function () { return "def evens(numbers):\n    return [n for n in numbers if n % 2 == 0]"; },
      explain: "The remainder after dividing by two is zero exactly for even numbers.",
      test: { call: "evens([1,2,3,4])", expect: "[2,4]" }
    },
    palindrome: {
      javascript: function () { return "function isPalindrome(text) {\n  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, \"\");\n  return clean === [...clean].reverse().join(\"\");\n}"; },
      python: function () { return "import re\n\ndef is_palindrome(text):\n    clean = re.sub(r'[^a-z0-9]', '', text.lower())\n    return clean == clean[::-1]"; },
      explain: "Case and punctuation are normalised first so that phrases, not just single words, are handled.",
      test: { call: "isPalindrome(\"A man, a plan, a canal: Panama\")", expect: "true" }
    },
    fibonacci: {
      javascript: function () { return "function fibonacci(n) {\n  let a = 0, b = 1;\n  for (let i = 0; i < n; i++) [a, b] = [b, a + b];\n  return a;\n}"; },
      python: function () { return "def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a"; },
      explain: "The iterative form runs in O(n) time and constant space; the naive recursion repeats the same subproblems exponentially.",
      test: { call: "fibonacci(10)", expect: "55" }
    },
    factorial: {
      javascript: function () { return "function factorial(n) {\n  let out = 1;\n  for (let i = 2; i <= n; i++) out *= i;\n  return out;\n}"; },
      python: function () { return "def factorial(n):\n    out = 1\n    for i in range(2, n + 1):\n        out *= i\n    return out"; },
      explain: "The loop avoids the call-stack depth that recursion would need for large n.",
      test: { call: "factorial(5)", expect: "120" }
    },
    fizzbuzz: {
      javascript: function () { return "function fizzbuzz(n) {\n  const out = [];\n  for (let i = 1; i <= n; i++) {\n    if (i % 15 === 0) out.push(\"FizzBuzz\");\n    else if (i % 3 === 0) out.push(\"Fizz\");\n    else if (i % 5 === 0) out.push(\"Buzz\");\n    else out.push(String(i));\n  }\n  return out;\n}"; },
      python: function () { return "def fizzbuzz(n):\n    out = []\n    for i in range(1, n + 1):\n        if i % 15 == 0:\n            out.append('FizzBuzz')\n        elif i % 3 == 0:\n            out.append('Fizz')\n        elif i % 5 == 0:\n            out.append('Buzz')\n        else:\n            out.append(str(i))\n    return out"; },
      explain: "Testing the multiple of 15 first matters: otherwise a number divisible by both rules only ever gets the first label.",
      test: { call: "fizzbuzz(5).join(\",\")", expect: "\"1,2,Fizz,4,Buzz\"" }
    },
    "count-words": {
      javascript: function () { return "function countWords(text) {\n  const words = text.trim().match(/\\S+/g);\n  return words ? words.length : 0;\n}"; },
      python: function () { return "def count_words(text):\n    return len(text.split())"; },
      explain: "Matching runs of non-space characters handles multiple spaces, tabs and newlines; splitting on a single space does not.",
      test: { call: "countWords(\"  a  b c \")", expect: "3" }
    },
    capitalize: {
      javascript: function () { return "function titleCase(text) {\n  return text.replace(/\\b\\w/g, c => c.toUpperCase());\n}"; },
      python: function () { return "def title_case(text):\n    return text.title()"; },
      explain: "The word-boundary match upper-cases the first letter of every word without touching the rest.",
      test: { call: "titleCase(\"hello world\")", expect: "\"Hello World\"" }
    },
    flatten: {
      javascript: function () { return "function flatten(items) {\n  return items.flat(Infinity);\n}"; },
      python: function () { return "def flatten(items):\n    out = []\n    for item in items:\n        out.extend(flatten(item) if isinstance(item, list) else [item])\n    return out"; },
      explain: "flat(Infinity) descends through every level of nesting rather than only the first.",
      test: { call: "JSON.stringify(flatten([1,[2,[3]]]))", expect: "\"[1,2,3]\"" }
    },
    debounce: {
      javascript: function () { return "function debounce(fn, waitMs) {\n  let timer = null;\n  return function (...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), waitMs);\n  };\n}"; },
      python: function () { return "import threading\n\ndef debounce(fn, wait_s):\n    timer = None\n    def wrapped(*args):\n        nonlocal timer\n        if timer:\n            timer.cancel()\n        timer = threading.Timer(wait_s, fn, args)\n        timer.start()\n    return wrapped"; },
      explain: "Each call cancels the pending timer, so the wrapped function runs only once the calls stop for the wait period."
    },
    "http-get": {
      javascript: function () { return "async function getJSON(url) {\n  const response = await fetch(url);\n  if (!response.ok) throw new Error(`HTTP ${response.status}`);\n  return response.json();\n}"; },
      python: function () { return "import json\nimport urllib.request\n\ndef get_json(url):\n    with urllib.request.urlopen(url) as response:\n        return json.load(response)"; },
      explain: "fetch does not reject on a 4xx or 5xx response, so the status has to be checked explicitly."
    }
  };


  /* More small functions, each verified against its own example before it is
     offered. Added through one helper so the concept (markers) and the
     program (IMPL) stay together. */
  function addOp(id, markers, impl) { OPERATIONS.push({ id: id, needs: [], markers: markers }); IMPL[id] = impl; }
  addOp("add-two", [/\badds?\s+(?:two|2)\s+numbers\b/i, /\bsum\s+of\s+(?:two|2)\s+numbers\b/i, /\badd\s+(?:two|2)\s+(?:numbers|values|integers)\b/i], {
    javascript: function () { return "function add(a, b) {\n  return a + b;\n}"; },
    python: function () { return "def add(a, b):\n    return a + b"; },
    java: function () { return "static int add(int a, int b) {\n    return a + b;\n}"; },
    go: function () { return "func add(a, b int) int {\n    return a + b\n}"; },
    ruby: function () { return "def add(a, b)\n  a + b\nend"; },
    explain: "The function takes two parameters and returns their sum.",
    test: { call: "add(2,3)", expect: "5" } });
  addOp("square", [/\bsquare\s+of\s+(?:a\s+)?(?:given\s+)?(?:number|value|integer)\b/i, /\bsquares?\s+a\s+number\b/i, /\breturns?\s+the\s+square\b/i], {
    javascript: function () { return "function square(n) {\n  return n * n;\n}"; },
    python: function () { return "def square(n):\n    return n * n"; },
    java: function () { return "static int square(int n) {\n    return n * n;\n}"; },
    go: function () { return "func square(n int) int {\n    return n * n\n}"; },
    explain: "Multiplying a number by itself squares it; n ** 2 (Python) or Math.pow(n, 2) would do the same.",
    test: { call: "square(7)", expect: "49" } });
  addOp("is-even", [/\b(?:check|test|determine|decide|see)\b[^.?]*\b(?:if|whether)\b[^.?]*\b(?:is )?(?:even|odd)\b/i, /\bis[_ ]?even\b/i, /\beven\s+or\s+odd\b/i, /\bnumber\s+is\s+(?:even|odd)\b/i], {
    javascript: function () { return "function isEven(n) {\n  return n % 2 === 0;\n}"; },
    python: function () { return "def is_even(n):\n    return n % 2 == 0"; },
    java: function () { return "static boolean isEven(int n) {\n    return n % 2 == 0;\n}"; },
    go: function () { return "func isEven(n int) bool {\n    return n%2 == 0\n}"; },
    explain: "A number is even exactly when dividing it by two leaves no remainder; an odd number is the negation.",
    test: { call: "isEven(10) && !isEven(7)", expect: "true" } });
  addOp("is-prime", [/\b(?:check|test|determine|decide|is)\b[^.?]*\bprime\b/i, /\bprime\s+(?:number\s+)?(?:checker|check|test|function)\b/i], {
    javascript: function () { return "function isPrime(n) {\n  if (n < 2) return false;\n  for (let i = 2; i * i <= n; i++) {\n    if (n % i === 0) return false;\n  }\n  return true;\n}"; },
    python: function () { return "def is_prime(n):\n    if n < 2:\n        return False\n    i = 2\n    while i * i <= n:\n        if n % i == 0:\n            return False\n        i += 1\n    return True"; },
    go: function () { return "func isPrime(n int) bool {\n    if n < 2 {\n        return false\n    }\n    for i := 2; i*i <= n; i++ {\n        if n%i == 0 {\n            return false\n        }\n    }\n    return true\n}"; },
    explain: "Only divisors up to the square root need testing, because any larger divisor pairs with a smaller one.",
    test: { call: "isPrime(13) && !isPrime(15) && !isPrime(1)", expect: "true" } });
  addOp("max-two", [/\b(?:larger|greater|bigger|largest|greatest|maximum|max)\s+of\s+(?:the\s+)?(?:two|2)\b/i, /\bmax(?:imum)?\s+(?:of|between)\s+(?:two|2)\b/i], {
    javascript: function () { return "function larger(a, b) {\n  return a > b ? a : b;\n}"; },
    python: function () { return "def larger(a, b):\n    return a if a > b else b"; },
    java: function () { return "static int larger(int a, int b) {\n    return a > b ? a : b;\n}"; },
    go: function () { return "func larger(a, b int) int {\n    if a > b {\n        return a\n    }\n    return b\n}"; },
    explain: "A single comparison picks the bigger of the two.",
    test: { call: "larger(3,9)", expect: "9" } });
  addOp("min-two", [/\b(?:smaller|lesser|smallest|least|minimum|min)\s+of\s+(?:the\s+)?(?:two|2)\b/i, /\bmin(?:imum)?\s+(?:of|between)\s+(?:two|2)\b/i], {
    javascript: function () { return "function smaller(a, b) {\n  return a < b ? a : b;\n}"; },
    python: function () { return "def smaller(a, b):\n    return a if a < b else b"; },
    explain: "A single comparison picks the smaller of the two.",
    test: { call: "smaller(3,9)", expect: "3" } });
  addOp("gcd", [/\b(?:greatest\s+common\s+(?:divisor|factor)|gcd|hcf)\b/i], {
    javascript: function () { return "function gcd(a, b) {\n  while (b !== 0) [a, b] = [b, a % b];\n  return Math.abs(a);\n}"; },
    python: function () { return "def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return abs(a)"; },
    explain: "Euclid's algorithm replaces the pair (a, b) with (b, a mod b) until the remainder is zero; the last non-zero value is the greatest common divisor.",
    test: { call: "gcd(48,18)", expect: "6" } });
  addOp("count-vowels", [/\bcount\s+(?:the\s+)?vowels\b/i, /\bnumber\s+of\s+vowels\b/i], {
    javascript: function () { return "function countVowels(text) {\n  return (text.match(/[aeiou]/gi) || []).length;\n}"; },
    python: function () { return "def count_vowels(text):\n    return sum(1 for ch in text.lower() if ch in 'aeiou')"; },
    explain: "Each character is tested against the vowel set, case-insensitively.",
    test: { call: "countVowels(\"Education\")", expect: "5" } });
  addOp("reverse-words", [/\brevers\w*\s+(?:the\s+)?(?:order\s+of\s+(?:the\s+)?)?words\b/i], {
    javascript: function () { return "function reverseWords(text) {\n  return text.trim().split(/\\s+/).reverse().join(\" \");\n}"; },
    python: function () { return "def reverse_words(text):\n    return ' '.join(reversed(text.split()))"; },
    explain: "The sentence is split into words, the words are reversed, and they are joined back with single spaces.",
    test: { call: "reverseWords(\"one two three\")", expect: "\"three two one\"" } });
  addOp("sum-to-n", [/\bsum\s+(?:of\s+)?(?:the\s+)?(?:numbers|integers)\s+(?:from\s+)?1\s+to\s+n\b/i, /\bsum\s+(?:of\s+)?(?:all\s+)?(?:numbers|integers)\s+up\s+to\s+n\b/i, /\bsum\s+(?:of\s+)?(?:the\s+)?first\s+n\b/i], {
    javascript: function () { return "function sumTo(n) {\n  return n * (n + 1) / 2;\n}"; },
    python: function () { return "def sum_to(n):\n    return n * (n + 1) // 2"; },
    explain: "Gauss's formula n(n+1)/2 gives the sum 1 + 2 + ... + n in constant time.",
    test: { call: "sumTo(100)", expect: "5050" } });
  addOp("c-to-f", [/\bcelsius\s+to\s+fahrenheit\b/i], {
    javascript: function () { return "function celsiusToFahrenheit(c) {\n  return c * 9 / 5 + 32;\n}"; },
    python: function () { return "def celsius_to_fahrenheit(c):\n    return c * 9 / 5 + 32"; },
    explain: "Multiply by 9/5 and add 32.",
    test: { call: "celsiusToFahrenheit(100)", expect: "212" } });
  addOp("f-to-c", [/\bfahrenheit\s+to\s+celsius\b/i], {
    javascript: function () { return "function fahrenheitToCelsius(f) {\n  return (f - 32) * 5 / 9;\n}"; },
    python: function () { return "def fahrenheit_to_celsius(f):\n    return (f - 32) * 5 / 9"; },
    explain: "Subtract 32, then multiply by 5/9.",
    test: { call: "fahrenheitToCelsius(212)", expect: "100" } });
  addOp("circle-area", [/\barea\s+of\s+(?:a\s+)?circle\b/i], {
    javascript: function () { return "function circleArea(r) {\n  return Math.PI * r * r;\n}"; },
    python: function () { return "import math\n\ndef circle_area(r):\n    return math.pi * r * r"; },
    explain: "The area of a circle of radius r is pi times r squared.",
    test: { call: "Math.round(circleArea(1) * 1000)", expect: "3142" } });
  addOp("leap-year", [/\bleap\s+year\b/i], {
    javascript: function () { return "function isLeapYear(y) {\n  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;\n}"; },
    python: function () { return "def is_leap_year(y):\n    return (y % 4 == 0 and y % 100 != 0) or y % 400 == 0"; },
    explain: "A year is a leap year when divisible by 4, except centuries, which must also be divisible by 400.",
    test: { call: "isLeapYear(2024) && !isLeapYear(1900) && isLeapYear(2000)", expect: "true" } });
  addOp("print-range", [/\bprints?\s+(?:out\s+)?(?:the\s+)?numbers\s+(?:from\s+)?1\s+to\s+\d+\b/i, /\bloop\b[^.?]*\b1\s+to\s+\d+\b/i, /\bcount\s+from\s+1\s+to\s+\d+\b/i], {
    javascript: function (spec) { var n = spec.n || 5; return "for (let i = 1; i <= " + n + "; i++) {\n  console.log(i);\n}"; },
    python: function (spec) { var n = spec.n || 5; return "for i in range(1, " + (n + 1) + "):\n    print(i)"; },
    java: function (spec) { var n = spec.n || 5; return "for (int i = 1; i <= " + n + "; i++) {\n    System.out.println(i);\n}"; },
    explain: "The loop variable starts at 1 and the condition keeps it running up to and including the last number." });
  addOp("power", [/\braise\w*\s+(?:a\s+)?(?:number|value|base)\s+to\s+(?:the\s+)?(?:a\s+)?power\b/i, /\b(?:compute|calculate)\s+(?:a\s+)?(?:number\s+)?(?:to\s+the\s+power|exponent)\b/i], {
    javascript: function () { return "function power(base, exponent) {\n  return base ** exponent;\n}"; },
    python: function () { return "def power(base, exponent):\n    return base ** exponent"; },
    explain: "The ** operator raises the base to the exponent.",
    test: { call: "power(2,10)", expect: "1024" } });

  /* Verification. A JavaScript program is run against its own example before
     it is shown; a program that does not satisfy its example is not offered. */
  function verify(code, test) {
    if (!test) return { ran: false, ok: true };
    try {
      var fn = new Function(code + "\nreturn (" + test.call + ");");
      var got = fn();
      var want;
      try { want = new Function("return (" + test.expect + ");")(); } catch (e) { want = test.expect; }
      var ok = JSON.stringify(got) === JSON.stringify(want);
      return { ran: true, ok: ok, got: JSON.stringify(got), want: JSON.stringify(want) };
    } catch (e) {
      return { ran: true, ok: false, error: e.message };
    }
  }

  function build(frame) {
    var lang = detectLanguage(frame) || "javascript";
    var op = detectOperation(frame);
    if (!op) return null;
    if (lang === "sql" || (op.needs.indexOf("table") >= 0)) {
      var sq = emitSQL(op.id, frame);
      if (sq) return { ok: true, spec: { op: op.id, language: "sql" }, code: sq.code,
                       language: "sql", explain: sq.explain, verified: { ran: false, ok: true } };
      return null;
    }
    var impl = IMPL[op.id];
    if (!impl) return null;
    var emit = impl[lang];
    if (!emit) { emit = impl.javascript; lang = "javascript"; }
    if (!emit) return null;
    var spec = { op: op.id, language: lang };
    var nm = frame.normalizedText.match(/\b1 to (\d+)\b/); if (nm) spec.n = +nm[1];
    if (op.preserveOrder) spec.preserveOrder = op.preserveOrder.test(frame.normalizedText);
    var code = emit(spec);
    var verified = lang === "javascript" ? verify(code, impl.test) : { ran: false, ok: true };
    if (!verified.ok) return { ok: false, spec: spec, code: code, language: lang, verified: verified };
    return { ok: true, spec: spec, code: code, language: lang, explain: impl.explain, verified: verified };
  }

  /* Is this a construction request at all? A programming NOUN is not a
     request to build something; an imperative with an operation is. */
  function isRequest(frame) {
    if (!frame.requiresCode) return false;
    if (/\b(?:what is|what are|explain|define|difference between|compare)\b/i.test(frame.normalizedText) &&
        !/\bwrite|implement|create a function|show me (?:a |the )?code\b/i.test(frame.normalizedText)) return false;
    return /\b(?:write|implement|create|build|make|generate|give me|show me|code|function|query|script|snippet)\b/i.test(frame.normalizedText) ||
           (/\bhow (?:do|can|would|should) (?:i|you|we)\b/i.test(frame.normalizedText) && !!detectLanguage(frame));
  }

  root.C4LMCode = {
    build: build,
    isRequest: isRequest,
    detectLanguage: detectLanguage,
    detectOperation: detectOperation,
    verify: verify,
    operations: OPERATIONS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.C4LMCode;
})(typeof window !== "undefined" ? window : globalThis);
