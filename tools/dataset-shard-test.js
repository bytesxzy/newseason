/* The sharded internal dataset (c4-dataset/manifest.json + shard_NNN.txt):
 * one logical dataset, loaded shard by shard through the same parser as the
 * single c4-dataset.txt. Each case boots the full page with its own files.
 *
 *   1 legacy c4-dataset.txt             6 invalid manifest
 *   2 several shards                    7 a shard near the size limit / over it
 *   3 duplicates across shards          8 entity and word records in different shards
 *   4 malformed lines in a shard        9 built-in facts keep precedence
 *   5 a shard the manifest lists but   10 answers unchanged when the records are
 *     that is missing                     the same, file or shards
 *  plus: the Python generator (valid, deterministic, never over the limits),
 *  the validator's exit codes, and book passages (answered only for a
 *  question that names the book).
 */
"use strict";
var RT = require("./lm-runtime.js"), fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var LD = require("../c4-local-dataset.js");
var pass = 0, fail = 0;
function ok(c, msg, extra) { if (c) pass++; else { fail++; console.log("  FAIL " + msg + (extra ? "  <- " + String(extra).slice(0, 200) : "")); } }
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "c4-shards-"));

/* a shard directory written the way the generator writes one */
function writeShards(name, shards, tweak) {
  var dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  var list = shards.map(function (lines, i) {
    var file = "shard_" + String(i).padStart(3, "0") + ".txt", data = "# shard " + i + "\n" + lines.map(function (l) { return l + "\n"; }).join("");
    fs.writeFileSync(path.join(dir, file), data);
    return { file: file, bytes: Buffer.byteLength(data), records: lines.filter(function (l) { return l.trim() && l.trim()[0] !== "#"; }).length };
  });
  var m = { version: 1, dataset_name: "test", format: "c4-record-v1", total_bytes: list.reduce(function (a, s) { return a + s.bytes; }, 0),
            total_records: list.reduce(function (a, s) { return a + s.records; }, 0), shard_count: list.length, shards: list };
  if (tweak) tweak(m, dir);
  fs.writeFileSync(path.join(dir, "manifest.json"), typeof m === "string" ? m : JSON.stringify(m, null, 1));
  return dir;
}
function boot(text, dir) {
  var win = RT.boot({ localDataset: text || "", localDatasetDir: dir || false });
  win.ROBOTS_CONFIG = Object.assign(win.ROBOTS_CONFIG || {}, { localDatasetQuiet: true });
  return win;
}
async function ask(win, q) { return (await RT.askOnce(win, q, 60000)).text; }

var A = [
  "entity: Zorbia | type: country | defn: Zorbia is a small island country. | capital: Zorb City | currency: the zorb | language: Zorbish",
  "entity: Quellia | type: country | defn: Quellia is a mountain country. | capital: Quell | currency: the quellar",
  "word: glimmerous | pos: adj | gloss: shining faintly and unsteadily | class: QUALITY"
];
var B = [
  "entity: Glimberry | type: fruit | defn: A glimberry is a small wild berry. | color: teal | aliases: glimberries",
  "entity: France | capital: Lyon | anthem: La Marseillaise",
  "word: sprocketeer | pos: n | gloss: a person who mends bicycle chains | class: PERSON"
];

(async function () {
  /* 1. the single file still loads, with its own limits */
  var w1 = boot(A.concat(B).join("\n"));
  ok(/Zorb City/.test(await ask(w1, "What is the capital of Zorbia?")), "1 legacy c4-dataset.txt answers");
  var r1 = w1.C4LocalDataset.report();
  ok(r1.mode === "file" && r1.loaded === 6 && r1.entities === 3, "1 legacy mode and counts (" + r1.mode + ", " + r1.loaded + ")");
  ok(LD.parse(new Array(20002).join("word: a | gloss: b\n")).quarantined.some(function (q) { return /record cap/.test(q.why); }), "1 the single file keeps its 20,000-record cap");

  /* 2 + 8. several shards, entity and word records spread over them */
  var d2 = writeShards("multi", [A, B]);
  var w2 = boot("", d2);
  ok(/Zorb City/.test(await ask(w2, "What is the capital of Zorbia?")), "2 a fact from shard 0");
  ok(/teal/.test(await ask(w2, "What color is a glimberry?")), "2 a fact from shard 1");
  ok(/shining faintly/.test(await ask(w2, "What does glimmerous mean?")), "8 a word record from shard 0");
  ok(/bicycle chains/.test(await ask(w2, "What does sprocketeer mean?")), "8 a word record from shard 1");
  ok(/Quellia → Quell\b/.test(await ask(w2, "France, Japan = Paris, Tokyo. Quellia = ?")), "2 an example-pair pattern reaches a shard entry");
  var r2 = w2.C4LocalDataset.report();
  ok(r2.mode === "sharded" && r2.shards === 2 && r2.loaded === 6 && !r2.shardErrors.length, "2 sharded mode, both shards, all records");

  /* 3. the same record in two shards (fields in another order, other spacing) is one record */
  var dup = "entity: Zorbia | capital: Zorb City | type: country | currency: the zorb | language: Zorbish | defn: Zorbia is a small  island country.";
  var d3 = writeShards("dups", [A, [dup, A[2]].concat(B)]);
  var w3 = boot("", d3);
  await ask(w3, "hello");
  var r3 = w3.C4LocalDataset.report();
  ok(r3.duplicates === 2 && r3.loaded === 6, "3 duplicates across shards are recognised (" + r3.duplicates + " duplicates, " + r3.loaded + " loaded)");

  /* 4. malformed lines in a shard are quarantined exactly as in the file; the rest loads */
  var bad = ["entity: <script>x</script> | defn: bad", "this line is not a record", "word: blorp | pos: zz | gloss: nothing",
             "entity: Longname | defn: " + new Array(700).join("x"), "entity: Emptything | type: thing"];
  var d4 = writeShards("malformed", [A, bad.concat(B)]);
  var w4 = boot("", d4);
  ok(/teal/.test(await ask(w4, "What color is a glimberry?")), "4 good lines of a shard with bad ones still load");
  var r4 = w4.C4LocalDataset.report();
  ok(r4.quarantined.length === 5 && r4.quarantined.every(function (q) { return q.file === "shard_001.txt"; }), "4 five bad lines quarantined, with their shard (" + r4.quarantined.map(function (q) { return q.why; }).join("; ") + ")");
  var lp = LD.parse(bad.join("\n")), sp = LD.parse(bad.join("\n"), LD.limits.shard);
  ok(JSON.stringify(lp.quarantined.map(function (q) { return q.why; })) === JSON.stringify(sp.quarantined.map(function (q) { return q.why; })), "4 a shard line is judged exactly like a file line");

  /* 5. a shard the manifest lists but that is not there */
  var d5 = writeShards("missing", [A, B], function (m, dir) { fs.unlinkSync(path.join(dir, "shard_001.txt")); });
  var w5 = boot("", d5);
  ok(/Zorb City/.test(await ask(w5, "What is the capital of Zorbia?")), "5 the other shards still answer");
  var r5 = w5.C4LocalDataset.report();
  ok(r5.shardErrors.some(function (e) { return e.file === "shard_001.txt" && /missing/.test(e.why); }) && r5.shards === 1, "5 the missing shard is reported, not fatal");

  /* 6. an invalid manifest: reported, nothing from the directory, everything else works */
  var d6 = writeShards("badmanifest", [A], function (m, dir) { fs.writeFileSync(path.join(dir, "x"), ""); });
  fs.writeFileSync(path.join(d6, "manifest.json"), "{ not json");
  var w6 = boot(B.join("\n"), d6);
  ok(/teal/.test(await ask(w6, "What color is a glimberry?")), "6 the single file still loads beside a broken manifest");
  ok(/Paris/.test(await ask(w6, "What is the capital of France?")), "6 built-in knowledge unaffected");
  ok(w6.C4LocalDataset.report().shardErrors.some(function (e) { return /not valid JSON/.test(e.why); }), "6 the broken manifest is reported");
  ok(!LD.checkManifest(JSON.stringify({ version: 2, format: "c4-record-v1", shards: [{ file: "../x.txt", bytes: 1, records: 1 }] })).ok, "6 a bad version and a path outside the directory are refused");
  ok(!LD.checkManifest(JSON.stringify({ version: 1, format: "c4-record-v1", total_records: 9, shards: [{ file: "a.txt", bytes: 1, records: 1 }] })).ok, "6 totals that do not add up are refused");

  /* 7. a shard near the limit loads; one over it (or not matching the manifest) is skipped */
  var line = "entity: Filler 0 | type: thing | defn: " + new Array(400).join("f") + ".", near = [], i = 0;
  var target = LD.limits.shard.bytes - 2000;
  for (var sz = 12; sz + line.length + 12 < target; i++) { var l = line.replace("Filler 0", "Filler " + i); near.push(l); sz += Buffer.byteLength(l) + 1; }
  var d7 = writeShards("near", [A, near]);
  var w7 = boot("", d7);
  await ask(w7, "hello");
  var r7 = w7.C4LocalDataset.report(), sh7 = JSON.parse(fs.readFileSync(path.join(d7, "manifest.json"))).shards[1];
  ok(sh7.bytes > LD.limits.shard.bytes - 5000 && r7.shards === 2 && r7.loaded === 3 + near.length, "7 a shard of " + sh7.bytes + " bytes (limit " + LD.limits.shard.bytes + ") loads");
  var d7b = writeShards("over", [A, B], function (m, dir) { fs.appendFileSync(path.join(dir, "shard_001.txt"), new Array(LD.limits.shard.bytes + 10).join("#") + "\n"); });
  var w7b = boot("", d7b);
  ok(/Zorb City/.test(await ask(w7b, "What is the capital of Zorbia?")), "7 the good shard loads beside an oversized one");
  ok(w7b.C4LocalDataset.report().shardErrors.some(function (e) { return e.file === "shard_001.txt" && /differs from the manifest/.test(e.why); }), "7 the oversized shard is skipped and reported");
  ok(LD.parse(new Array(LD.limits.shard.bytes + 2).join("#"), LD.limits.shard).tooLarge, "7 the parser refuses a shard over the byte limit");

  /* 9. built-in facts keep precedence over any shard */
  ok(/Paris/.test(await ask(w2, "What is the capital of France?")) && !/Lyon/.test(await ask(w2, "What is the capital of France?")), "9 a built-in fact is never overwritten by a shard");
  ok(r2.conflicts.some(function (c) { return /France/.test(c) && /Lyon/.test(c); }) && r2.conflictCount === 1, "9 the disagreement is reported");
  ok(w2.C4LMKB.resolve("France", { strict: true })[0].entity.rel.anthem === "La Marseillaise", "9 a missing attribute is still filled in");

  /* 10. the same records answer the same, from one file or from shards; unrelated
     records change nothing about ordinary questions */
  var QS = ["What is the capital of Zorbia?", "What color is a glimberry?", "What does glimmerous mean?", "What is the capital of France?",
            "What is photosynthesis?", "Who wrote Hamlet?", "What is 15% of 80?", "Which is bigger, Jupiter or Earth?"];
  var wf = boot(A.concat(B).join("\n")), ws = boot("", d2), w0 = boot(""), same = true, diffs = [];
  for (var q = 0; q < QS.length; q++) {
    wf.C4LM.seed && wf.C4LM.seed(1); ws.C4LM.seed && ws.C4LM.seed(1);
    var af = await ask(wf, QS[q]), as = await ask(ws, QS[q]);
    if (af !== as) { same = false; diffs.push(QS[q] + ": " + af + " | " + as); }
  }
  ok(same, "10 file and shards give the same answers", diffs.join(" // "));
  var plain = ["What is photosynthesis?", "Who wrote Hamlet?", "What is 15% of 80?", "Which is bigger, Jupiter or Earth?", "What is the capital of Japan?"];
  var wz = boot("", writeShards("unrelated", [A]));
  for (var k = 0; k < plain.length; k++) {
    w0.C4LM.seed && w0.C4LM.seed(1); wz.C4LM.seed && wz.C4LM.seed(1);
    var a0 = await ask(w0, plain[k]), az = await ask(wz, plain[k]);
    ok(a0 === az, "10 unchanged with unrelated records: " + plain[k], a0 + " | " + az);
  }

  /* books: quoted only for a question that names the book */
  var book = ["entity: The Grey Whale | type: book | defn: The Grey Whale is a book by Ann Example. | author: Ann Example",
              "entity: The Grey Whale, passage 1 | type: passage | defn: Captain Orrin stood on the deck of the Pelican and watched the grey whale rise beside the ship. | book: The Grey Whale",
              "entity: The Grey Whale, passage 2 | type: passage | defn: Mira the cook said that the whale had followed them since the harbour at Kest. | book: The Grey Whale",
              "entity: Emma | type: book | defn: Emma is a book by Jane Doe. | author: Jane Doe",
              "entity: Emma, passage 1 | type: passage | defn: The orchard behind the rectory was full of pears that autumn. | book: Emma"];
  var wb = boot("", writeShards("books", [A, book]));
  ok(/Mira the cook/.test(await ask(wb, "In The Grey Whale, who is Mira?")), "a question naming a book is answered from its passage");
  ok(/Ann Example/.test(await ask(wb, "Who wrote The Grey Whale?")), "the book's author comes from its book record");
  var off1 = await ask(wb, "Who is Mira?"), off2 = await ask(wb, "Tell me about whales"), off3 = await ask(wb, "Emma has three pears. She eats one. How many pears does Emma have?");
  ok(!/Grey Whale|harbour|Pelican/.test(off1 + off2), "book text never answers a question that does not name the book", off1 + " | " + off2);
  ok(/\b2\b/.test(off3) && !/orchard|rectory/.test(off3), "a one-word title (Emma) is not read into an ordinary sentence", off3);
  ok(/orchard/.test(await ask(wb, "In the novel Emma, what grows behind the rectory?")), "a one-word title counts when the question calls it a book");
  ok(/none of its passages mention/.test(await ask(wb, "In The Grey Whale, what is a unicorn?")), "a book that does not say something is not made to say it");
  ok(wb.C4LMKB.resolve("The Grey Whale, passage 1", { strict: true }).length === 0, "passages are not knowledge-base entities");

  /* the generator and the validator */
  var py = cp.spawnSync("python3", ["--version"]);
  if (py.status === 0) {
    var inDir = path.join(TMP, "gen-in"), bookDir = path.join(TMP, "gen-books");
    fs.mkdirSync(inDir); fs.mkdirSync(bookDir);
    fs.writeFileSync(path.join(inDir, "a.txt"), A.concat(bad).join("\n") + "\n");
    fs.writeFileSync(path.join(inDir, "b.txt"), B.concat([A[0]]).join("\n") + "\n");
    var paras = [];
    for (var pi = 0; pi < 400; pi++) paras.push("Paragraph " + pi + " tells how the keeper of the lighthouse counted " + pi + " ships. He wrote each one down in a blue book.");
    fs.writeFileSync(path.join(bookDir, "light.txt"), "Title: The Lighthouse Log\nAuthor: Sam Writer\n\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\n" + paras.join("\n\n") + "\n\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\n");
    var gen = function (out) { return cp.spawnSync("python3", [path.join(__dirname, "c4_dataset_build.py"), inDir, "--books", bookDir, "--out", out, "--shard-bytes", "6000", "--shard-records", "30"], { encoding: "utf8" }); };
    var g1 = gen(path.join(TMP, "gen1")), g2 = gen(path.join(TMP, "gen2"));
    ok(g1.status === 0, "the generator runs", g1.stderr);
    var m1 = JSON.parse(fs.readFileSync(path.join(TMP, "gen1", "manifest.json"))), m2 = JSON.parse(fs.readFileSync(path.join(TMP, "gen2", "manifest.json")));
    ok(JSON.stringify(m1) === JSON.stringify(m2), "the generator is deterministic (same shards, same checksums)");
    ok(m1.shard_count > 3 && m1.shards.every(function (s) { return s.bytes <= 6000 && s.records <= 30; }), "no shard exceeds its limits (" + m1.shard_count + " shards)");
    var rep = JSON.parse(fs.readFileSync(path.join(TMP, "gen1", "build-report.json")));
    ok(rep.quarantined.length === 5 && rep.duplicates === 1, "the generator validates and de-duplicates (" + rep.quarantined.length + " bad, " + rep.duplicates + " duplicate)");
    var v1 = cp.spawnSync("node", [path.join(__dirname, "dataset-validate.js"), path.join(TMP, "gen1")], { encoding: "utf8" });
    ok(v1.status === 0 && /RESULT: valid/.test(v1.stdout), "the validator accepts the generated dataset", v1.stdout);
    var wg = boot("", path.join(TMP, "gen1"));
    ok(/teal/.test(await ask(wg, "What color is a glimberry?")), "the generated shards load and answer");
    ok(/lighthouse|ships/i.test(await ask(wg, "In The Lighthouse Log, how many ships did the keeper count in paragraph 7?")), "a generated book answers a question that names it");
    var rg = wg.C4LocalDataset.report();
    ok(rg.quarantinedCount === 0 && !rg.shardErrors.length && rg.shards === m1.shard_count, "every generated record passes the loader's own parser");
    fs.appendFileSync(path.join(TMP, "gen1", m1.shards[1].file), "entity: Late | defn: added by hand.\n");
    var v2 = cp.spawnSync("node", [path.join(__dirname, "dataset-validate.js"), path.join(TMP, "gen1")], { encoding: "utf8" });
    ok(v2.status === 1 && /INVALID/.test(v2.stdout), "the validator fails a shard changed after the manifest was written");
    fs.unlinkSync(path.join(TMP, "gen1", m1.shards[2].file));
    var v3 = cp.spawnSync("node", [path.join(__dirname, "dataset-validate.js"), path.join(TMP, "gen1")], { encoding: "utf8" });
    ok(v3.status === 1 && /missing/.test(v3.stdout), "the validator fails a missing shard");
  } else console.log("  (python3 not found: generator checks skipped)");

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("dataset-shard-test: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e.stack); process.exit(1); });
