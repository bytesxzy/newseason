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
  var POS = { n: "n", noun: "n", v: "v", verb: "v", adj: "adj", adjective: "adj", adv: "adv", adverb: "adv" };
  var state = { loaded: false, loading: null, text: "", report: { lines: 0, entities: 0, merged: 0, words: 0, quarantined: [], conflicts: [], source: "" } };

  function parse(text) {
    var out = { entities: [], words: [], quarantined: [] };
    if (typeof text !== "string") return out;
    if (text.length > MAX_BYTES) { out.quarantined.push({ line: 0, why: "file larger than " + MAX_BYTES + " bytes; not read" }); return out; }
    var lines = text.split(/\r?\n/), n = 0;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].trim();
      if (!raw || raw.charAt(0) === "#") continue;
      if (++n > MAX_RECORDS) { out.quarantined.push({ line: i + 1, why: "record cap reached" }); break; }
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
        if (!why) out.entities.push(e);
      } else if (!why && order[0] === "word") {
        var w = { word: fields.word.toLowerCase(), pos: POS[(fields.pos || "n").toLowerCase()], gloss: fields.gloss || fields.meaning || "", cls: (fields["class"] || "").toUpperCase() };
        if (!/^[a-z][a-z' -]{0,40}$/.test(w.word)) why = "headword not usable";
        else if (!w.pos) why = "unknown part of speech";
        else if (!w.gloss) why = "word has no gloss";
        if (!why) out.words.push(w);
      } else if (!why) why = "unknown record type (start the line with entity: or word:)";
      if (why) out.quarantined.push({ line: i + 1, why: why });
    }
    return out;
  }

  /* hand each record to the module that owns it */
  function ingest(parsed, source) {
    var KB = root.C4LMKB, LX = root.C4LMLexicon, LM = root.C4LM, docs = [], r = state.report;
    r.source = source || "c4-dataset.txt";
    parsed.entities.forEach(function (e) {
      if (!KB || !KB.add) return;
      var res = KB.add(e, "internal dataset");
      if (res.added) {
        r.entities++;
        docs.push({ title: e.name, scope: "kb", source: "internal dataset", authority: 0.8, entity: res.entity,
                    text: [e.defn, e.aliases.join(" "), e.rel.cause, e.rel.purpose, e.rel.part].filter(Boolean).join(" ") });
      } else if (res.merged.length) r.merged++;
      res.conflicts.forEach(function (c) { r.conflicts.push(e.name + " — " + c); });
    });
    parsed.words.forEach(function (w) {
      if (LX && LX.learn) { LX.learn(w.word, [{ pos: w.pos, gloss: w.gloss, cls: w.cls }]); r.words++; }
    });
    if (docs.length && LM && LM.addDocuments) { try { LM.addDocuments(docs); } catch (e) {} }
    r.quarantined = r.quarantined.concat(parsed.quarantined);
    r.lines = parsed.entities.length + parsed.words.length + parsed.quarantined.length;
  }

  function fetchText() {
    if (typeof root.C4LocalDatasetText === "string") return Promise.resolve(root.C4LocalDatasetText);
    var cfg = root.ROBOTS_CONFIG || {}, url = cfg.localDataset || "c4-dataset.txt";
    if (cfg.localDataset === false) return Promise.resolve("");
    if (typeof root.fetch === "function") {
      return root.fetch(url).then(function (res) { return res.ok ? res.text() : ""; }).catch(function () { return xhr(url); });
    }
    return xhr(url);
  }
  function xhr(url) {
    return new Promise(function (resolve) {
      try {
        if (typeof root.XMLHttpRequest !== "function") return resolve("");
        var x = new root.XMLHttpRequest();
        x.open("GET", url, true);
        x.onload = function () { resolve(x.status === 200 || x.status === 0 ? String(x.responseText || "") : ""); };
        x.onerror = function () { resolve(""); };
        x.send();
      } catch (e) { resolve(""); }
    });
  }

  var LD = {
    parse: parse,
    ready: function () {
      if (state.loaded) return Promise.resolve(state.report);
      if (state.loading) return state.loading;
      state.loading = fetchText().then(function (text) {
        state.text = text || "";
        ingest(parse(state.text), "c4-dataset.txt");
        state.loaded = true; state.loading = null;
        return state.report;
      }, function () { state.loaded = true; state.loading = null; return state.report; });
      return state.loading;
    },
    loaded: function () { return state.loaded; },
    report: function () { return state.report; },
    /* add records at runtime (same validation, same routing) */
    load: function (text, source) { var p = parse(String(text || "")); ingest(p, source || "runtime"); return state.report; }
  };
  root.C4LocalDataset = LD;
  if (typeof module !== "undefined" && module.exports) module.exports = LD;
})(typeof window !== "undefined" ? window : globalThis);
