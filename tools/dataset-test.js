/* The reference dataset's chunked caller and its poisoning defences
 * (c4-dataset.js), exercised end to end:
 *   - a local copy is read in bounded chunks and every file hash-verified
 *   - a mirror served over HTTP Range requests (206) loads identically; a
 *     server that ignores Range (200) still works; a server that answers
 *     the wrong range is refused
 *   - one flipped byte in a file rejects the whole file
 *   - a record whose self-address, word count or pointer fields do not
 *     check out is quarantined, never used
 *   - a pointer to a record that does not exist is not followed
 *   - things a user asserts in conversation never become dataset facts
 * Needs data/wordnet (node tools/dataset-fetch.js).
 */
"use strict";
var fs = require("fs"), path = require("path");
var DIR = path.join(__dirname, "..", "data", "wordnet");
if (!fs.existsSync(path.join(DIR, "manifest.json"))) { console.log("dataset-test: SKIPPED -- run `node tools/dataset-fetch.js` first"); process.exit(0); }
var DS = require("../c4-dataset.js"), RT = require("./lm-runtime.js");
var manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8"));
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("  FAIL " + msg); } }
function local(tamper) {
  return { size: function (n) { return fs.statSync(path.join(DIR, n)).size; },
           read: function (n, pos, len) { var b = Buffer.alloc(len), fd = fs.openSync(path.join(DIR, n), "r"); var k = fs.readSync(fd, b, 0, len, pos); fs.closeSync(fd); if (tamper) tamper(n, pos, b); return b.slice(0, k).toString("latin1"); } };
}
/* an HTTP mirror over the same files: honours Range (206), or ignores it
   (200), or lies about the range */
function mirror(mode) {
  return function (url, opts) {
    var name = url.split("/").pop(), buf = fs.readFileSync(path.join(DIR, name));
    var m = String(opts && opts.headers && opts.headers.Range || "").match(/bytes=(\d+)-(\d+)/);
    function res(status, body, cr) {
      return Promise.resolve({ status: status, headers: { get: function (h) { return /content-range/i.test(h) ? cr : null; } },
                               arrayBuffer: function () { return Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.length)); } });
    }
    if (mode === "norange" || !m) return res(200, buf, null);
    var a = +m[1], b = Math.min(+m[2], buf.length - 1);
    if (mode === "liar") a = a + 7;
    return res(206, buf.slice(a, b + 1), "bytes " + a + "-" + b + "/" + buf.length);
  };
}

(async function () {
  /* local, chunked, verified */
  var c1 = new DS.ChunkedCaller({ local: local(), chunkSize: 256 * 1024 }), w1 = await new DS.WordNet().load(c1, manifest);
  ok(w1.ready && c1.stats.files === 8, "local copy loads, 8 files");
  ok(c1.stats.requests >= Math.ceil(manifest.files["data.noun"].bytes / (256 * 1024)), "read in bounded chunks (" + c1.stats.requests + " chunk reads)");
  var k = w1.senses("ketchup", "noun")[0];
  ok(k && /tomatoes/.test(k.syn.def), "a validated record reads back");

  /* HTTP mirror with Range */
  var c2 = new DS.ChunkedCaller({ fetch: mirror("range"), base: "https://mirror.example/dict/", chunkSize: 1024 * 1024 }), w2 = await new DS.WordNet().load(c2, manifest);
  ok(w2.ready && w2.senses("puppy", "noun")[0].syn.def === w1.senses("puppy", "noun")[0].syn.def, "Range-request mirror loads the same data");
  var c3 = new DS.ChunkedCaller({ fetch: mirror("norange"), base: "https://mirror.example/dict/" }), w3 = await new DS.WordNet().load(c3, manifest);
  ok(w3.ready, "a server that ignores Range still loads (and is still verified)");
  var liar = null;
  try { await new DS.WordNet().load(new DS.ChunkedCaller({ fetch: mirror("liar"), base: "https://mirror.example/dict/", retries: 0 }), manifest); } catch (e) { liar = e.message; }
  ok(/wrong range/.test(liar || ""), "a server that answers the wrong range is refused");

  /* one flipped byte anywhere rejects the file */
  var poisoned = null;
  try {
    await new DS.WordNet().load(new DS.ChunkedCaller({ local: local(function (n, pos, b) { if (n === "data.noun" && pos === 0) b[5000] = b[5000] === 97 ? 98 : 97; }) }), manifest);
  } catch (e) { poisoned = e.message; }
  ok(/integrity check failed/.test(poisoned || ""), "a tampered file is rejected whole (" + poisoned + ")");

  /* record-level validation */
  var txt = w1.text["data.noun"], off = k.syn.offset, line = txt.slice(off, txt.indexOf("\n", off) + 1);
  function probe(mut) { var t = txt.slice(0, off) + mut(line) + txt.slice(off + line.length); return DS.parseRecord(t, off, "noun"); }
  ok(!!probe(function (l) { return l; }), "an intact record parses");
  ok(!probe(function (l) { return "0" + l.slice(1, 7) + "9" + l.slice(8); }), "a record claiming another address is quarantined");
  ok(!probe(function (l) { return l.replace(/ n 04 /, " n 05 "); }), "a record with the wrong word count is quarantined");
  ok(!probe(function (l) { return l.replace(/ @ 07826883 n /, " @ 0782688X n "); }), "a malformed pointer is quarantined");
  ok(!probe(function (l) { return l.replace(/ n 04 /, " q 04 "); }), "an impossible part of speech is quarantined");

  /* a dangling pointer is not followed */
  var fake = { pos: "n", offset: 0, words: ["x"], def: "", ptrs: [{ sym: "@", offset: 99999999, pos: "n" }] };
  ok(w1.follow(fake, "@").length === 0 && w1.quarantine.pointers === 1, "a pointer to a missing record is not followed");

  /* conversation cannot poison the dataset */
  var win = RT.boot({});
  await RT.askOnce(win, "Blue, Peach = Water, Sand", 20000);
  var water = await RT.askOnce(win, "What color is water?", 20000);
  ok(!/\bwater is blue\b|is blue:/i.test(water.text) && /pair/i.test(water.text), "a user's pairing stays the user's (" + water.text.slice(0, 90) + ")");
  var again = win.C4Dataset.wordnet.senses("water", "noun")[0].syn.def;
  ok(!/blue/.test(again), "the dataset record is unchanged");

  console.log("dataset-test: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error("dataset-test crashed: " + e.stack); process.exit(1); });
