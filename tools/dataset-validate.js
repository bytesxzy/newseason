/* Validate the CELL4 internal dataset: the sharded directory (manifest.json
 * + shards) or a single c4-dataset.txt. Records are checked by the loader's
 * own parser (c4-local-dataset.js parse), so the validator and the loader
 * can never disagree about what is a valid line.
 *
 *   node tools/dataset-validate.js [c4-dataset | c4-dataset.txt] [--strict] [--json FILE]
 *
 * Exit 1 when the dataset is structurally invalid: an unreadable or invalid
 * manifest, a missing shard, a shard whose size or checksum differs from the
 * manifest, a shard over the per-shard limits. Malformed lines, duplicates
 * and unknown word classes are reported (the loader quarantines or skips
 * them); --strict makes malformed lines and duplicates fail the run too.
 */
"use strict";
var fs = require("fs"), path = require("path"), crypto = require("crypto");
var LD = require("../c4-local-dataset.js");
var CLASSES = null;
try { CLASSES = require("../c4-lm-lexicon.js").CLASSES || null; } catch (e) { CLASSES = null; }

var args = process.argv.slice(2), strict = args.indexOf("--strict") >= 0;
var ji = args.indexOf("--json"), jsonOut = ji >= 0 ? args[ji + 1] : "";
var target = args.filter(function (a, i) { return a.charAt(0) !== "-" && !(ji >= 0 && i === ji + 1); })[0] ||
             (fs.existsSync(path.join(__dirname, "..", "c4-dataset", "manifest.json")) ? path.join(__dirname, "..", "c4-dataset") : path.join(__dirname, "..", "c4-dataset.txt"));

var rep = { target: target, mode: "", structural: [], shards: [], records: 0, entities: 0, words: 0, passages: 0, books: 0,
            bytes: 0, quarantined: [], quarantinedCount: 0, byReason: {}, duplicates: 0, duplicateExamples: [], classWarnings: 0, warnings: [] };
var seen = Object.create(null);

function checkText(text, file, limits) {
  var p = LD.parse(text, limits);
  if (p.tooLarge || p.overCap) { rep.structural.push(file + ": " + p.quarantined[p.quarantined.length - 1].why); return p; }
  p.quarantined.forEach(function (q) {
    rep.quarantinedCount++;
    rep.byReason[q.why.replace(/\s*\(.*$/, "")] = (rep.byReason[q.why.replace(/\s*\(.*$/, "")] || 0) + 1;
    if (rep.quarantined.length < 200) rep.quarantined.push({ file: file, line: q.line, why: q.why });
  });
  p.entities.forEach(function (e) {
    if (seen[e.fp]) { rep.duplicates++; if (rep.duplicateExamples.length < 20) rep.duplicateExamples.push(file + ": " + e.name + " (first in " + seen[e.fp] + ")"); return; }
    seen[e.fp] = file;
    if (e.type === "passage") rep.passages++; else rep.entities++;
    if (e.type === "book") rep.books++;
  });
  p.words.forEach(function (w) {
    if (seen[w.fp]) { rep.duplicates++; if (rep.duplicateExamples.length < 20) rep.duplicateExamples.push(file + ": word " + w.word + " (first in " + seen[w.fp] + ")"); return; }
    seen[w.fp] = file;
    rep.words++;
    if (CLASSES && w.cls && !CLASSES[w.cls]) { rep.classWarnings++; if (rep.warnings.length < 50) rep.warnings.push(file + ": word " + w.word + ": unknown class " + w.cls + " (read as ABSTRACT)"); }
  });
  rep.records += p.records;
  return p;
}

if (!fs.existsSync(target)) { rep.structural.push(target + " does not exist"); }
else if (fs.statSync(target).isDirectory()) {
  rep.mode = "sharded";
  var mpath = path.join(target, "manifest.json");
  if (!fs.existsSync(mpath)) rep.structural.push("manifest.json is missing");
  else {
    var chk = LD.checkManifest(fs.readFileSync(mpath, "utf8"));
    if (!chk.ok) rep.structural = rep.structural.concat(chk.errors.map(function (e) { return "manifest: " + e; }));
    if (chk.manifest && Array.isArray(chk.manifest.shards)) {
      chk.manifest.shards.forEach(function (sh) {
        var f = path.join(target, path.basename(String(sh.file || ""))), row = { file: sh.file, ok: true };
        rep.shards.push(row);
        if (!sh.file || !fs.existsSync(f)) { row.ok = false; rep.structural.push(sh.file + ": listed in the manifest but missing"); return; }
        var buf = fs.readFileSync(f);
        row.bytes = buf.length;
        rep.bytes += buf.length;
        if (buf.length !== sh.bytes) { row.ok = false; rep.structural.push(sh.file + ": " + buf.length + " bytes, the manifest says " + sh.bytes); }
        if (buf.length > LD.limits.shard.bytes) { row.ok = false; rep.structural.push(sh.file + ": larger than the per-shard limit of " + LD.limits.shard.bytes + " bytes"); }
        if (sh.sha256 && crypto.createHash("sha256").update(buf).digest("hex") !== sh.sha256) { row.ok = false; rep.structural.push(sh.file + ": checksum differs from the manifest"); }
        var p = checkText(buf.toString("utf8"), sh.file, LD.limits.shard);
        row.records = p.records;
        if (p.records !== sh.records) { row.ok = false; rep.structural.push(sh.file + ": " + p.records + " records, the manifest says " + sh.records); }
        if (!p.records) rep.warnings.push(sh.file + ": holds no records");
      });
      /* files in the directory the manifest does not list are never loaded */
      fs.readdirSync(target).filter(function (f) { return /\.txt$/.test(f) && !chk.manifest.shards.some(function (s) { return s.file === f; }); })
        .forEach(function (f) { rep.warnings.push(f + ": not listed in manifest.json, so it is not loaded"); });
    }
  }
} else {
  rep.mode = "file";
  var text = fs.readFileSync(target, "utf8");
  rep.bytes = Buffer.byteLength(text, "utf8");
  checkText(text, path.basename(target), LD.limits.file);
}

var bad = rep.structural.length > 0 || (strict && (rep.quarantinedCount > 0 || rep.duplicates > 0));
console.log("CELL4 dataset validation: " + target + "\n  mode: " + rep.mode + (rep.mode === "sharded" ? "\n  shards: " + rep.shards.length : "") +
  "\n  records: " + rep.records + "  (entities " + rep.entities + ", words " + rep.words + ", book passages " + rep.passages + ", books " + rep.books + ")" +
  "\n  size: " + (rep.bytes / 1048576).toFixed(1) + " MB" +
  "\n  malformed lines: " + rep.quarantinedCount + (rep.quarantinedCount ? "  " + JSON.stringify(rep.byReason) : "") +
  "\n  duplicates: " + rep.duplicates + "\n  unknown word classes: " + rep.classWarnings);
rep.structural.forEach(function (s) { console.log("  INVALID " + s); });
rep.quarantined.slice(0, 15).forEach(function (q) { console.log("  line " + q.file + ":" + q.line + " " + q.why); });
rep.warnings.slice(0, 15).forEach(function (w) { console.log("  warning " + w); });
console.log(bad ? "  RESULT: invalid" : "  RESULT: valid");
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rep, null, 1) + "\n");
process.exit(bad ? 1 : 0);
