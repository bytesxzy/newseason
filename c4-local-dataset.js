/* CELL4 internal dataset: c4-dataset.txt, hooked into the whole stack.
 *
 * The file is plain text, one record per line ("key: value | key: value").
 * It is read once at start-up -- over HTTP next to the page in a browser,
 * through the test runtime's file bridge under Node -- validated line by
 * line, and each accepted record is handed to the module that owns that
 * kind of knowledge:
 *   entity:  -> c4-lm-kb.js (facts, relations, definitions; every layer
 *               that resolves an entity -- answers, comparisons, magnitude,
 *               decisions, analogies, cross-referencing -- reads the KB)
 *            -> the LM's document index (retrieval by description)
 *   word:    -> c4-lm-lexicon.js (word senses, compositional reading)
 * Attribute questions in c4-lm-crossref.js consult the same entries.
 *
 * Zero poisoning: size caps; a line must parse into known record types and
 * well-formed keys; values may not carry markup or control characters; an
 * entry for something already known may only fill gaps, never overwrite a
 * built-in fact (disagreements are reported in report()). Every accepted
 * entry keeps its provenance ("internal dataset").
 * Local only; nothing here calls a model or an API.
 */
(function (root) {
  "use strict";
  var MAX_BYTES = 5 * 1024 * 1024, MAX_RECORDS = 20000, MAX_VALUE = 600;
  /* The limits apply to ONE file. The single file (c4-dataset.txt) keeps
     its limits; the sharded dataset (c4-dataset/manifest.json + shards) is
     one logical dataset whose every shard is a complete file of the same
     format, each held a little under the single-file limits. The combined
     dataset has no record cap of its own. */
  var LEGACY = { bytes: MAX_BYTES, records: MAX_RECORDS, unit: "chars" };
  var SHARD = { bytes: Math.floor(4.75 * 1024 * 1024), records: 19500, unit: "bytes" };
  var FORMAT = "c4-record-v1";
  var POS = { n: "n", noun: "n", v: "v", verb: "v", adj: "adj", adjective: "adj", adv: "adv", adverb: "adv" };
  var state = { loaded: false, loading: null, text: "", seen: Object.create(null), report: freshReport() };
  function freshReport() {
    return { lines: 0, entities: 0, merged: 0, words: 0, quarantined: [], conflicts: [], source: "",
             mode: "none", conflictCount: 0, quarantinedCount: 0, shards: 0, shardErrors: [], records: 0, loaded: 0, duplicates: 0, bytes: 0, passages: 0, books: 0, ms: 0 };
  }
  /* UTF-8 length without an encoder copy of the text */
  function utf8Bytes(t) {
    var n = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c < 0x80) n++; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < t.length) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  /* a record's identity, whatever file or shard it is in: its type, and its
     fields in any order, spacing normalised -- two 32-bit hashes */
  var imul = Math.imul;          /* a local: global lookups are slow in sandboxed runtimes */
  function fingerprint(fields, order) {
    var keys = order.length > 1 ? order.slice(1).sort() : [], parts = [order[0], order[0] + "\u0002" + norm(fields[order[0]])];
    for (var k = 0; k < keys.length; k++) parts.push(keys[k] + "\u0002" + norm(fields[keys[k]]));
    var canon = parts.join("\u0001"), h1 = 0x811c9dc5 | 0, h2 = 0x9747b28c | 0, n = canon.length;
    for (var i = 0; i < n; i++) {
      var c = canon.charCodeAt(i);
      h1 = imul(h1 ^ c, 16777619);
      h2 = imul(h2 ^ c, 1540483477); h2 ^= h2 >>> 15;
    }
    return (h1 >>> 0).toString(36) + ":" + (h2 >>> 0).toString(36) + ":" + n;
  }
  /* spacing normalised only where there is something to normalise */
  var ODD_SPACE = /\s\s|[^\S ]/;
  function norm(v) { v = String(v); return ODD_SPACE.test(v) ? v.replace(/\s+/g, " ") : v; }

  function parse(text, limits) {
    limits = limits || LEGACY;
    var out = { entities: [], words: [], quarantined: [], records: 0 };
    if (typeof text !== "string") return out;
    var size = limits.unit === "bytes" ? utf8Bytes(text) : text.length;
    if (size > limits.bytes) { out.quarantined.push({ line: 0, why: "file larger than " + limits.bytes + " bytes; not read" }); out.tooLarge = true; return out; }
    var lines = text.split(/\r?\n/), n = 0;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].trim();
      if (!raw || raw.charAt(0) === "#") continue;
      if (++n > limits.records) { out.quarantined.push({ line: i + 1, why: "record cap reached" }); out.overCap = true; break; }
      out.records = n;
      var why = null, fields = {}, order = [];
      if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) why = "markup or control characters";
      else raw.split(/\s+\|\s+/).forEach(function (part) {
        if (why) return;
        var m = part.match(/^([a-z][a-z_ ]{0,30}?)\s*:\s*(.+)$/i);
        if (!m) { why = "not a key: value field (" + part.slice(0, 40) + ")"; return; }
        var k = m[1].toLowerCase().replace(/\s+/g, "_"), v = m[2].trim();
        if (v.length > MAX_VALUE) { why = "value too long for " + k; return; }
        if (k in fields) { why = "field repeated: " + k; return; }
        fields[k] = v; order.push(k);
      });
      if (!why && order[0] === "entity") {
        var rel = {}, e = { name: fields.entity, type: (fields.type || "concept").toLowerCase(), defn: fields.defn || fields.definition || "",
                            aliases: fields.aliases ? fields.aliases.split(/\s*,\s*/).filter(Boolean) : [], rel: rel };
        order.slice(1).forEach(function (k) { if (!/^(?:type|defn|definition|aliases)$/.test(k)) rel[k] = fields[k]; });
        if (!/^[\w][\w .,'()&-]{0,80}$/.test(e.name)) why = "entity name not usable";
        else if (e.defn && !/[.!?]$/.test(e.defn)) e.defn += ".";
        if (!why && !e.defn && !Object.keys(rel).length) why = "entity has no definition and no attributes";
        if (!why) { e.fp = fingerprint(fields, order); out.entities.push(e); }
      } else if (!why && order[0] === "word") {
        var w = { word: fields.word.toLowerCase(), pos: POS[(fields.pos || "n").toLowerCase()], gloss: fields.gloss || fields.meaning || "", cls: (fields["class"] || "").toUpperCase() };
        if (!/^[a-z][a-z' -]{0,40}$/.test(w.word)) why = "headword not usable";
        else if (!w.pos) why = "unknown part of speech";
        else if (!w.gloss) why = "word has no gloss";
        if (!why) { w.fp = fingerprint(fields, order); out.words.push(w); }
      } else if (!why) why = "unknown record type (start the line with entity: or word:)";
      if (why) out.quarantined.push({ line: i + 1, why: why });
    }
    return out;
  }

  /* hand each record to the module that owns it. Called once per file or
     shard; counts accumulate, and a record already taken from any file or
     shard (the same fields, in any order) is counted as a duplicate. */
  function kbText(d) { var e = d.entity; return [e.defn, e.aliases.join(" "), e.rel.cause, e.rel.purpose, e.rel.part].filter(Boolean).join(" "); }
  function ingest(parsed, source, file) {
    var KB = root.C4LMKB, LX = root.C4LMLexicon, LM = root.C4LM, docs = [], r = state.report, seen = state.seen;
    r.source = source || "c4-dataset.txt";
    parsed.entities.forEach(function (e) {
      if (e.fp && seen[e.fp]) { r.duplicates++; return; }
      if (e.fp) seen[e.fp] = 1;
      r.loaded++;
      /* a passage of a book is text to quote, not a thing to know about: it
         goes to the library (read only when a question names its book) */
      if (e.type === "passage") { library.add(e); r.passages++; return; }
      if (e.type === "book") library.book(e);
      if (!KB || !KB.add) return;
      var res = KB.add(e, "internal dataset");
      if (res.added) {
        r.entities++;
        docs.push({ title: e.name, scope: "kb", source: "internal dataset", authority: 0.8, entity: res.entity, textOf: kbText });
      } else if (res.merged.length) r.merged++;
      /* every disagreement is counted; the first thousand are kept word for word */
      res.conflicts.forEach(function (c) { r.conflictCount++; if (r.conflicts.length < 1000) r.conflicts.push(e.name + " — " + c); });
    });
    parsed.words.forEach(function (w) {
      if (w.fp && seen[w.fp]) { r.duplicates++; return; }
      if (w.fp) seen[w.fp] = 1;
      r.loaded++;
      if (LX && LX.learn) { LX.learn(w.word, [{ pos: w.pos, gloss: w.gloss, cls: w.cls }]); r.words++; }
    });
    if (docs.length && LM && LM.addDocuments) { try { LM.addDocuments(docs); } catch (e) {} }
    parsed.quarantined.forEach(function (q) { if (file) q.file = file; r.quarantinedCount++; if (r.quarantined.length < 10000) r.quarantined.push(q); });
    r.records += parsed.records || 0;
    r.lines += parsed.entities.length + parsed.words.length + parsed.quarantined.length;
    r.books = library.count();
  }

  /* ---------------------------------------------------------- library
     Books arrive as ordinary entity records: one "type: book" record (title,
     author) and "type: passage" records ("<Title>, passage N | type:
     passage | defn: <text> | book: <Title>"). Passages are text to quote,
     not facts: they never enter the knowledge base or the general index, so
     no book can surface in an answer to a question that did not name it.
     A question that names a held book is answered from that book only,
     with the passage quoted and cited; its index is built the first time
     the book is asked about. */
  var library = (function () {
    var books = Object.create(null), order = [];
    function core() { return root.C4LMCore || null; }
    function flat(s) { var C = core(); return C ? C.flatten(s) : String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
    function bookOf(title) {
      var k = flat(title);
      if (!k) return null;
      if (!books[k]) { books[k] = { key: k, title: String(title), author: "", passages: [], index: null }; order.push(k); }
      return books[k];
    }
    var META = /^(?:what|who|whom|whose|which|when|where|why|how|does|do|did|is|are|was|were|be|been|the|a|an|in|of|from|on|at|to|for|by|with|and|or|book|novel|story|tale|play|poem|text|tell|me|about|say|says|said|happen|happens|happened|chapter|passage|author|wrote|write|written|published|character|characters|mention|mentions|mentioned|describe|describes|described|part|there|it|its|this|that|anything|something|find|quote|show|give)$/;
    var CUE = /\b(?:book|novel|story|tale|play|poem|text|in|from)\s+(?:the\s+)?$/;
    function find(text) {
      var q = " " + flat(text) + " ", raw = String(text || ""), best = null;
      for (var i = 0; i < order.length; i++) {
        var b = books[order[i]];
        if (!b.passages.length || b.key.length < 4) continue;
        var at = q.indexOf(" " + b.key + " ");
        if (at < 0) continue;
        /* a one-word title is also an ordinary word or name: it counts only
           when the question calls it a book or reads "in <Title>", written
           with its capital */
        if (b.key.indexOf(" ") < 0) {
          if (!CUE.test(q.slice(0, at + 1).trim() + " ")) continue;
          if (!new RegExp("\\b" + b.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(raw)) continue;
        }
        if (!best || b.key.length > best.key.length) best = b;
      }
      return best;
    }
    /* what the question asks about the book: its words, less the title
       itself (once) and the words that only frame the question */
    function residual(text, b) {
      var C = core(), q = " " + flat(text) + " ", at = q.indexOf(" " + b.key + " ");
      if (at >= 0) q = q.slice(0, at) + " " + q.slice(at + b.key.length + 1);
      var ws = q.split(" ").map(function (w) { return w.replace(/s$/, function (x, o, all) { return /'s$/.test(all) ? "" : x; }); });
      return ws.filter(function (w, i) { return w.length > 1 && !META.test(w) && !(C && C.STOP && C.STOP[w]) && ws.indexOf(w) === i; });
    }
    function indexOf(b) {
      if (b.index) return b.index;
      var C = core(), post = Object.create(null);
      b.passages.forEach(function (p, i) {
        var seen = Object.create(null);
        (C ? C.indexTokens(p.text).map(C.stem) : flat(p.text).split(" ")).forEach(function (t) { if (!seen[t]) { seen[t] = 1; (post[t] || (post[t] = [])).push(i); } });
      });
      return (b.index = post);
    }
    function sentences(t) { return String(t).split(/(?<=[.!?]["'”’)]?)\s+(?=["'“‘(]?[A-Z])/).filter(function (x) { return x.trim(); }); }
    function answer(text) {
      var b = find(text);
      if (!b) return null;
      /* "which is longer, X or <Title>?" compares things; passages don't */
      if (/\b(?:which|who)\b[^?]*,[^?]*\bor\b|\bcompare\b|\bdifference between\b/i.test(text)) return null;
      var res = residual(text, b);
      if (!res.length) return null;          /* "who wrote X?" is the knowledge base's */
      var C = core(), stems = res.map(function (w) { return C ? C.stem(w) : w; }).filter(function (t, i, a) { return a.indexOf(t) === i; });
      var post = indexOf(b), N = b.passages.length, need = stems.length <= 2 ? stems.length : Math.round(stems.length * 2 / 3), score = Object.create(null), hit = Object.create(null);
      stems.forEach(function (t) {
        var pl = post[t];
        if (!pl) return;
        var idf = Math.log(1 + N / pl.length);
        pl.forEach(function (i) { score[i] = (score[i] || 0) + idf; hit[i] = (hit[i] || 0) + 1; });
      });
      var best = -1, mentions = 0;
      Object.keys(hit).forEach(function (k) {
        var i = +k;
        if (hit[i] < need) return;
        mentions++;
        if (best < 0 || score[i] > score[best] + 1e-9 || (Math.abs(score[i] - score[best]) < 1e-9 && i < best)) best = i;
      });
      var by = b.author ? " by " + b.author : "";
      if (best < 0) {
        return { text: "I have " + b.title + by + " in the internal dataset, but none of its passages mention " + res.join(" and ") + ".",
                 route: "library", entity: b.title, confidence: 0.6, insufficient: true, library: true, sources: [b.title + " (internal dataset)"] };
      }
      var p = b.passages[best], ss = sentences(p.text), pick = 0, cov = -1;
      ss.forEach(function (sn, i) {
        var f = " " + (C ? C.indexTokens(sn).map(C.stem).join(" ") : flat(sn)) + " ", c = 0;
        stems.forEach(function (t) { if (f.indexOf(" " + t + " ") >= 0) c++; });
        if (c > cov) { cov = c; pick = i; }
      });
      var quote = ss[pick] || p.text;
      if (quote.length < 80 && ss[pick + 1]) quote += " " + ss[pick + 1];
      quote = quote.replace(/\s+/g, " ").trim();
      return { text: "In " + b.title + by + ": “" + quote + "” (passage " + p.n + (mentions > 1 ? "; " + mentions + " passages mention it" : "") + ").",
               route: "library", entity: b.title, confidence: 0.8, library: true, sources: [b.title + " (internal dataset)"] };
    }
    return {
      add: function (e) {
        var title = e.rel.book || String(e.name).replace(/,?\s+passage\s+\d+$/i, "");
        var b = bookOf(title);
        if (!b) return;
        var n = (String(e.name).match(/passage\s+(\d+)$/i) || [])[1];
        b.passages.push({ n: n ? +n : b.passages.length + 1, text: e.defn });
        if (e.rel.author && !b.author) b.author = e.rel.author;
        b.index = null;
      },
      book: function (e) { var b = bookOf(e.name); if (b && e.rel.author && !b.author) b.author = e.rel.author; },
      count: function () { return order.filter(function (k) { return books[k].passages.length; }).length; },
      titles: function () { return order.filter(function (k) { return books[k].passages.length; }).map(function (k) { return books[k].title; }); },
      wants: function (text) { var b = find(text); return !!(b && residual(text, b).length); },
      answer: answer
    };
  })();

  /* ---------------------------------------------------------- sources
     The single file and the shard directory are both read through a source:
     a runtime-provided reader (the Node test runtime, a packaged app) or
     HTTP next to the page. Configuration (ROBOTS_CONFIG):
       localDataset:    "c4-dataset.txt" (default) | another path | false
       localDatasetDir: "c4-dataset" (default)      | another path | false
       localDatasetQuiet: true to skip the start-up summary line */
  function config() {
    var cfg = root.ROBOTS_CONFIG || {};
    return { file: cfg.localDataset === false ? null : (typeof cfg.localDataset === "string" ? cfg.localDataset : "c4-dataset.txt"),
             dir: cfg.localDatasetDir === false ? null : String(cfg.localDatasetDir || "c4-dataset").replace(/\/+$/, ""),
             quiet: !!cfg.localDatasetQuiet };
  }
  function fetchText(url) {
    if (typeof root.fetch === "function") {
      return root.fetch(url).then(function (res) { return res.ok ? res.text() : null; }).catch(function () { return xhr(url); });
    }
    return xhr(url);
  }
  function xhr(url) {
    return new Promise(function (resolve) {
      try {
        if (typeof root.XMLHttpRequest !== "function") return resolve(null);
        var x = new root.XMLHttpRequest();
        x.open("GET", url, true);
        x.onload = function () { resolve(x.status === 200 || (x.status === 0 && x.responseText) ? String(x.responseText || "") : null); };
        x.onerror = function () { resolve(null); };
        x.send();
      } catch (e) { resolve(null); }
    });
  }
  function readFile(cfg) {
    if (typeof root.C4LocalDatasetText === "string") return Promise.resolve(root.C4LocalDatasetText);
    if (!cfg.file) return Promise.resolve("");
    return fetchText(cfg.file).then(function (t) { return t || ""; });
  }
  /* the shard directory: a runtime reader (C4LocalDatasetDir = {manifest(),
     read(file)}) or HTTP; null when there is none */
  function readDir(cfg, what) {
    var R = root.C4LocalDatasetDir;
    if (R && typeof R.read === "function") {
      try { return Promise.resolve(what === null ? R.manifest() : R.read(what)); } catch (e) { return Promise.resolve(null); }
    }
    if (!cfg.dir) return Promise.resolve(null);
    return fetchText(cfg.dir + "/" + (what === null ? "manifest.json" : what));
  }

  /* ---------------------------------------------------------- manifest */
  var SHARD_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.txt$/;
  function checkManifest(text) {
    var m, errors = [];
    try { m = JSON.parse(text); } catch (e) { return { ok: false, errors: ["manifest.json is not valid JSON (" + e.message + ")"] }; }
    if (!m || typeof m !== "object") return { ok: false, errors: ["manifest.json is not an object"] };
    if (m.version !== 1) errors.push("unsupported version " + JSON.stringify(m.version) + " (expected 1)");
    if (m.format !== FORMAT) errors.push("format must be \"" + FORMAT + "\"");
    if (!Array.isArray(m.shards) || !m.shards.length) errors.push("shards must be a non-empty list");
    var files = Object.create(null), bytes = 0, records = 0;
    (Array.isArray(m.shards) ? m.shards : []).forEach(function (sh, i) {
      if (!sh || typeof sh !== "object") { errors.push("shard " + i + " is not an object"); return; }
      if (typeof sh.file !== "string" || !SHARD_FILE.test(sh.file) || sh.file.indexOf("..") >= 0) errors.push("shard " + i + ": file name not allowed (" + String(sh.file).slice(0, 60) + ")");
      else if (files[sh.file]) errors.push("shard " + i + ": " + sh.file + " listed twice");
      else files[sh.file] = 1;
      if (!(Number.isInteger(sh.bytes) && sh.bytes >= 0 && sh.bytes <= SHARD.bytes)) errors.push("shard " + i + ": bytes must be an integer from 0 to " + SHARD.bytes);
      if (!(Number.isInteger(sh.records) && sh.records >= 0 && sh.records <= SHARD.records)) errors.push("shard " + i + ": records must be an integer from 0 to " + SHARD.records);
      bytes += sh.bytes || 0; records += sh.records || 0;
    });
    if (m.shard_count !== undefined && m.shard_count !== (m.shards || []).length) errors.push("shard_count " + m.shard_count + " but " + (m.shards || []).length + " shards listed");
    if (m.total_bytes !== undefined && m.total_bytes !== bytes) errors.push("total_bytes " + m.total_bytes + " but the shards add up to " + bytes);
    if (m.total_records !== undefined && m.total_records !== records) errors.push("total_records " + m.total_records + " but the shards add up to " + records);
    return { ok: !errors.length, errors: errors, manifest: m };
  }

  /* one shard: read, checked against the manifest, parsed by the same
     parser under the shard limits, ingested, and its text let go. A shard
     that cannot be used is reported and skipped; the others still load. */
  function loadShard(cfg, sh) {
    var r = state.report;
    return readDir(cfg, sh.file).then(function (text) {
      if (typeof text !== "string" || (!text && sh.bytes)) { r.shardErrors.push({ file: sh.file, why: "missing or unreadable" }); return; }
      var b = utf8Bytes(text);
      if (b !== sh.bytes) { r.shardErrors.push({ file: sh.file, why: "size " + b + " bytes differs from the manifest (" + sh.bytes + "); shard skipped" }); return; }
      var p = parse(text, SHARD);
      if (p.tooLarge || p.overCap) { r.shardErrors.push({ file: sh.file, why: p.quarantined[p.quarantined.length - 1].why + "; shard skipped" }); return; }
      if (p.records !== sh.records) r.shardErrors.push({ file: sh.file, why: "holds " + p.records + " records, the manifest says " + sh.records + " (loaded anyway)", warning: true });
      r.bytes += b;
      ingest(p, "c4-dataset/", sh.file);
      r.shards++;
    }, function (e) { r.shardErrors.push({ file: sh.file, why: "read failed: " + (e && e.message || e) }); });
  }
  function pause() { return new Promise(function (res) { if (typeof root.setTimeout === "function") root.setTimeout(res, 0); else res(); }); }
  function loadAll() {
    var cfg = config(), r = state.report, t0 = Date.now();
    /* 1. the single file, exactly as before */
    return readFile(cfg).then(function (text) {
      state.text = text || "";
      if (state.text) { r.mode = "file"; r.bytes += utf8Bytes(state.text); }
      ingest(parse(state.text, LEGACY), "c4-dataset.txt");
      /* 2. the shard directory, in the manifest's order */
      return readDir(cfg, null);
    }).then(function (mtext) {
      if (typeof mtext !== "string" || !mtext.trim()) return;
      var chk = checkManifest(mtext);
      if (!chk.ok) { chk.errors.forEach(function (e) { r.shardErrors.push({ file: "manifest.json", why: e }); }); return; }
      r.mode = r.mode === "file" ? "file+sharded" : "sharded";
      r.manifest = { shards: chk.manifest.shards.length, records: chk.manifest.total_records, bytes: chk.manifest.total_bytes, name: chk.manifest.dataset_name || "" };
      /* one shard at a time, handing control back between shards so the
         page (and a waiting question) stays responsive */
      return chk.manifest.shards.reduce(function (p, sh) { return p.then(function () { return loadShard(cfg, sh); }).then(pause); }, Promise.resolve());
    }).then(function () {
      r.ms = Date.now() - t0;
      /* record identities are only needed while files are being merged; a
         large dataset's table is let go (later runtime loads still merge by
         entity name in the knowledge base) */
      if (r.loaded > 50000) state.seen = Object.create(null);
      summary(cfg);
    });
  }
  function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function summary(cfg) {
    var r = state.report, con = root.console;
    if (cfg.quiet || !con || !con.log || r.mode === "none" && !r.shardErrors.length) return;
    con.log("CELL4 dataset:\n  mode: " + r.mode + (r.shards || r.manifest ? "\n  shards: " + r.shards + (r.manifest ? " of " + r.manifest.shards : "") : "") +
            "\n  records: " + fmtN(r.records) + "\n  size: " + (Math.round(r.bytes / 104857.6) / 10) + " MB\n  loaded: " + fmtN(r.loaded) +
            " (" + fmtN(r.entities) + " new entities, " + fmtN(r.merged) + " merged, " + fmtN(r.words) + " words, " + fmtN(r.passages) + " book passages in " + r.books + " books)" +
            "\n  quarantined: " + fmtN(r.quarantinedCount) + "\n  duplicates: " + fmtN(r.duplicates) + "\n  conflicts: " + fmtN(r.conflictCount) + "\n  time: " + r.ms + " ms");
    r.shardErrors.forEach(function (e) { (e.warning ? con.log : (con.warn || con.log)).call(con, "CELL4 dataset " + (e.warning ? "warning" : "error") + ": " + e.file + ": " + e.why); });
  }

  var LD = {
    parse: parse,
    checkManifest: checkManifest,
    limits: { file: LEGACY, shard: SHARD, format: FORMAT, maxValue: MAX_VALUE },
    utf8Bytes: utf8Bytes,
    ready: function () {
      if (state.loaded) return Promise.resolve(state.report);
      if (state.loading) return state.loading;
      state.loading = loadAll().then(function () { state.loaded = true; state.loading = null; return state.report; },
        function (e) { state.report.shardErrors.push({ file: "", why: "loading stopped: " + (e && e.message || e) }); state.loaded = true; state.loading = null; return state.report; });
      return state.loading;
    },
    /* ready, or the given time has passed -- whichever comes first */
    readyWithin: function (ms) {
      var p = LD.ready();
      if (state.loaded || typeof root.setTimeout !== "function") return p;
      return Promise.race([p, new Promise(function (res) { root.setTimeout(function () { res(state.report); }, ms); })]);
    },
    loaded: function () { return state.loaded; },
    report: function () { return state.report; },
    /* add records at runtime (same validation, same routing) */
    load: function (text, source) { var p = parse(String(text || "")); ingest(p, source || "runtime"); return state.report; },
    library: library
  };
  root.C4LocalDataset = LD;
  /* in a page, start reading at load, not at the first question */
  if (root.document && (root.ROBOTS_CONFIG || {}).localDatasetPreload !== false && typeof root.setTimeout === "function") root.setTimeout(function () { LD.ready(); }, 0);
  if (typeof module !== "undefined" && module.exports) module.exports = LD;
})(typeof window !== "undefined" ? window : globalThis);
