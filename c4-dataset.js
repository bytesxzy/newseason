/* CELL4 reference dataset: a chunk-sized caller and a validating reader for
 * Princeton WordNet 3.1 (the open lexical database: 117k synsets, their
 * definitions, and typed links -- kind-of, part-of, opposite-of, similar-to,
 * attribute-of ...). Nothing here is an answer table: the dataset is read,
 * checked, and indexed; c4-lm-crossref.js reasons over it.
 *
 * Chunked calling
 *   Every file is fetched in bounded chunks (default 512 KB): HTTP Range
 *   requests in the browser (any static mirror, default jsDelivr's copy of
 *   the npm package), positioned reads of a local copy under Node
 *   (tools/dataset-fetch.js puts one in data/wordnet/). Retries with
 *   backoff, a per-file and a total byte cap, progress callbacks, and
 *   request / byte counters for the page to show.
 *
 * Zero poisoning
 *   1. file level  -- each file's SHA-256 must equal the pinned manifest
 *      (c4-dataset-manifest.js, written by the fetch tool from a copy
 *      verified against the npm registry's sha512); a mismatch rejects the
 *      whole file, so a tampered or truncated mirror is never used;
 *   2. record level -- every data line must carry its own byte offset (the
 *      WordNet format's built-in self-address), a legal part of speech, a
 *      word count and pointer count that match what follows, and legal
 *      pointer fields; a line that fails is quarantined, not repaired;
 *   3. link level  -- a pointer is followed only if its target exists and
 *      itself validates;
 *   4. provenance  -- dataset facts, knowledge-base facts and things a user
 *      says in conversation are kept apart; nothing a user says is written
 *      into the dataset.
 *
 * Local only, deterministic, no model, no API key.
 */
(function (root) {
  "use strict";

  var FILES = ["index.noun", "data.noun", "index.adj", "data.adj", "index.verb", "data.verb", "index.adv", "data.adv"];
  var DEFAULT_BASE = "https://cdn.jsdelivr.net/npm/wordnet-db@3.1.14/dict/";
  var POS_FILE = { n: "noun", v: "verb", a: "adj", s: "adj", r: "adv" };
  var PTR = /^(?:!|@|@i|~|~i|#m|#s|#p|%m|%s|%p|=|\+|;c|-c|;r|-r|;u|-u|\*|>|&|<|\\|\^|\$)$/;

  /* ------------------------------------------------------------ SHA-256
     Pure JS over a byte string (each char code 0-255), so the same check
     runs in a browser and in Node's sandbox. */
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(bytes) {
    var n = bytes.length, words = ((n + 9 + 63) >> 6) << 4, W = new Int32Array(64), H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    function word(i) {          /* big-endian word i of the padded message */
      if (i === words - 2) return Math.floor(n / 0x20000000) | 0;
      if (i === words - 1) return ((n * 8) % 4294967296) | 0;
      var v = 0;
      for (var b = 0; b < 4; b++) {
        var p = i * 4 + b;
        v = (v << 8) | (p < n ? bytes.charCodeAt(p) & 255 : p === n ? 0x80 : 0);
      }
      return v;
    }
    for (var blk = 0; blk < words; blk += 16) {
      for (var t = 0; t < 16; t++) W[t] = word(blk + t);
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        W[t] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[t - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + W[t - 16] | 0;
      }
      var a = H[0], b2 = H[1], c2 = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[t] + W[t] | 0;
        var t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b2) ^ (a & c2) ^ (b2 & c2)) | 0;
        h = g; g = f; f = e; e = d + t1 | 0; d = c2; c2 = b2; b2 = a; a = t1 + t2 | 0;
      }
      H[0] = H[0] + a | 0; H[1] = H[1] + b2 | 0; H[2] = H[2] + c2 | 0; H[3] = H[3] + d | 0;
      H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
    }
    return H.map(function (v) { return ("00000000" + (v >>> 0).toString(16)).slice(-8); }).join("");
  }
  function bytesToString(u8) {
    var out = [], step = 8192;
    for (var i = 0; i < u8.length; i += step) out.push(String.fromCharCode.apply(null, u8.subarray(i, i + step)));
    return out.join("");
  }

  /* ----------------------------------------------------- chunked caller */
  function ChunkedCaller(opts) {
    opts = opts || {};
    this.local = opts.local || null;           /* { size(name), read(name, pos, len) } */
    this.base = opts.base || DEFAULT_BASE;
    this.fetch = opts.fetch || (typeof root.fetch === "function" ? root.fetch.bind(root) : null);
    this.chunkSize = Math.max(4096, Math.min(opts.chunkSize || 512 * 1024, 4 * 1024 * 1024));
    this.maxFileBytes = opts.maxFileBytes || 24 * 1024 * 1024;
    this.maxTotalBytes = opts.maxTotalBytes || 40 * 1024 * 1024;
    this.retries = opts.retries === undefined ? 3 : opts.retries;
    this.stats = { requests: 0, bytes: 0, retries: 0, files: 0 };
  }
  ChunkedCaller.prototype.file = function (name, onChunk) {
    var self = this;
    if (self.local) {
      var size = self.local.size(name);
      if (!(size > 0) || size > self.maxFileBytes) return Promise.reject(new Error(name + ": size " + size + " outside the allowed range"));
      var parts = [];
      for (var pos = 0; pos < size; pos += self.chunkSize) {
        var s = self.local.read(name, pos, Math.min(self.chunkSize, size - pos));
        self.stats.requests++; self.stats.bytes += s.length;
        if (self.stats.bytes > self.maxTotalBytes) return Promise.reject(new Error("dataset exceeds the total byte cap"));
        parts.push(s);
        if (onChunk) onChunk(name, pos + s.length, size);
      }
      self.stats.files++;
      return Promise.resolve(parts.join(""));
    }
    if (!self.fetch) return Promise.reject(new Error("no fetch available for " + name));
    var url = self.base + name, chunks = [], got = 0;
    function one(start, attempt) {
      var end = start + self.chunkSize - 1;
      self.stats.requests++;
      return self.fetch(url, { headers: { Range: "bytes=" + start + "-" + end } }).then(function (res) {
        if (res.status !== 206 && res.status !== 200) throw new Error(name + ": HTTP " + res.status);
        return res.arrayBuffer().then(function (buf) {
          var u8 = new Uint8Array(buf), total = null;
          if (res.status === 206) {
            var cr = String(res.headers && res.headers.get ? res.headers.get("content-range") || "" : ""), m = cr.match(/bytes\s+(\d+)-(\d+)\/(\d+)/);
            if (m && +m[1] !== start) throw new Error(name + ": server answered the wrong range");
            total = m ? +m[3] : null;
          } else { total = u8.length; if (start > 0) u8 = u8.subarray(start); }
          if (total && total > self.maxFileBytes) throw new Error(name + ": file larger than allowed");
          got += u8.length; self.stats.bytes += u8.length;
          if (self.stats.bytes > self.maxTotalBytes) throw new Error("dataset exceeds the total byte cap");
          chunks.push(bytesToString(u8));
          if (onChunk) onChunk(name, got, total || got);
          if (res.status === 206 && total && start + u8.length < total && u8.length > 0) return one(start + u8.length, 0);
          return null;
        });
      }).catch(function (e) {
        if (attempt >= self.retries || /wrong range|larger than|byte cap/.test(e.message)) throw e;
        self.stats.retries++;
        return new Promise(function (r) { setTimeout(r, 250 * Math.pow(2, attempt)); }).then(function () { return one(start, attempt + 1); });
      });
    }
    return one(0, 0).then(function () { self.stats.files++; return chunks.join(""); });
  };

  /* --------------------------------------------------- record validation */
  function parseRecord(text, offset, file) {
    var line = text.slice(offset, text.indexOf("\n", offset) < 0 ? text.length : text.indexOf("\n", offset));
    var bar = line.indexOf(" | ");
    if (bar < 0) return null;
    var f = line.slice(0, bar).trim().split(/\s+/), gloss = line.slice(bar + 3).trim(), i = 0;
    if (f[i] !== ("00000000" + offset).slice(-8)) return null;                    /* self-address */
    i += 2;
    var pos = f[i++];
    if (!POS_FILE[pos] || POS_FILE[pos] !== file) return null;
    var wc = parseInt(f[i++], 16);
    if (!(wc > 0) || wc > 200) return null;
    var words = [];
    for (var w = 0; w < wc; w++) {
      var lemma = f[i++], lex = f[i++];
      if (!lemma || !/^[0-9a-f]$/i.test(lex || "")) return null;
      words.push(lemma.replace(/\((?:a|p|ip)\)$/, "").replace(/_/g, " "));
    }
    var pc = parseInt(f[i++], 10);
    if (isNaN(pc) || pc < 0 || pc > 999) return null;
    var ptrs = [];
    for (var p = 0; p < pc; p++) {
      var sym = f[i++], off = f[i++], tpos = f[i++], st = f[i++];
      if (!PTR.test(sym || "") || !/^\d{8}$/.test(off || "") || !POS_FILE[tpos] || !/^[0-9a-f]{4}$/i.test(st || "")) return null;
      ptrs.push({ sym: sym, offset: +off, pos: tpos === "s" ? "a" : tpos, src: parseInt(st.slice(0, 2), 16), tgt: parseInt(st.slice(2), 16) });
    }
    if (pos === "v" && i < f.length) {
      var fc = parseInt(f[i++], 10);
      if (isNaN(fc) || f.length - i !== fc * 3) return null;
    } else if (i !== f.length) return null;
    /* definition(s) without the quoted examples */
    var def = gloss.replace(/;?\s*"[^"]*"/g, "").replace(/\s*;\s*$/, "").trim();
    return { offset: offset, pos: pos === "s" ? "a" : pos, satellite: pos === "s", words: words, ptrs: ptrs, gloss: gloss, def: def };
  }

  /* ------------------------------------------------------------ WordNet */
  function WordNet() {
    this.text = {}; this.index = {}; this.cache = {}; this.inverted = {};
    this.quarantine = { records: 0, files: [], pointers: 0 };
    this.ready = false; this.source = "";
  }
  WordNet.prototype.load = function (caller, manifest, onProgress) {
    var self = this;
    return FILES.reduce(function (p, name) {
      return p.then(function () {
        return caller.file(name, onProgress).then(function (txt) {
          var want = manifest && manifest.files && manifest.files[name];
          if (!want) throw new Error(name + ": not in the pinned manifest");
          if (txt.length !== want.bytes || sha256(txt) !== want.sha256) { self.quarantine.files.push(name); throw new Error(name + ": integrity check failed; file rejected"); }
          self.text[name] = txt;
        });
      });
    }, Promise.resolve()).then(function () {
      ["noun", "adj", "verb", "adv"].forEach(function (p) { self.index[p] = parseIndex(self.text["index." + p]); });
      self.ready = true;
      self.source = manifest.source || "WordNet 3.1";
      return self;
    });
  };
  function parseIndex(txt) {
    var map = Object.create(null), lines = txt.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l || l.charAt(0) === " ") continue;
      var f = l.trim().split(/\s+/), cnt = +f[2], pc = +f[3];
      var offs = f.slice(6 + pc, 6 + pc + cnt).filter(function (o) { return /^\d{8}$/.test(o); }).map(Number);
      if (!offs.length) continue;
      map[f[0]] = { offsets: offs, tagsense: +f[5 + pc] || 0 };
    }
    return map;
  }
  /* one validated synset by part of speech and byte offset */
  WordNet.prototype.synset = function (pos, offset) {
    var file = POS_FILE[pos], key = file + ":" + offset;
    if (key in this.cache) return this.cache[key];
    var txt = this.text["data." + file], rec = txt && offset < txt.length ? parseRecord(txt, offset, file) : null;
    if (!rec && txt) this.quarantine.records++;
    return (this.cache[key] = rec);
  };
  /* base forms by English inflection, confirmed by the index */
  var RULES = { noun: [["ies", "y"], ["ves", "f"], ["ves", "fe"], ["ses", "s"], ["xes", "x"], ["zes", "z"], ["ches", "ch"], ["shes", "sh"], ["men", "man"], ["oes", "o"], ["s", ""]],
                verb: [["ies", "y"], ["es", "e"], ["es", ""], ["ed", "e"], ["ed", ""], ["ing", "e"], ["ing", ""], ["s", ""]],
                adj: [["er", ""], ["est", ""], ["er", "e"], ["est", "e"], ["ier", "y"], ["iest", "y"]], adv: [] };
  WordNet.prototype.lemmas = function (word, file) {
    var w = String(word).toLowerCase().trim().replace(/\s+/g, "_"), idx = this.index[file], out = [];
    if (!idx) return out;
    if (idx[w]) out.push(w);
    RULES[file].forEach(function (r) { if (w.length > r[0].length + 1 && w.slice(-r[0].length) === r[0]) { var b = w.slice(0, -r[0].length) + r[1]; if (idx[b] && out.indexOf(b) < 0) out.push(b); } });
    return out;
  };
  /* senses of a word, most frequent first (index order is sense order) */
  WordNet.prototype.senses = function (word, file) {
    var self = this, out = [];
    (file ? [file] : ["noun", "adj", "verb", "adv"]).forEach(function (fl) {
      self.lemmas(word, fl).forEach(function (l) {
        self.index[fl][l].offsets.forEach(function (o, rank) {
          var s = self.synset(fl === "adj" ? "a" : fl.charAt(0), o);
          if (s) out.push({ syn: s, rank: rank, lemma: l, tagsense: self.index[fl][l].tagsense });
        });
      });
    });
    return out;
  };
  /* follow a pointer, only to a target that exists and validates */
  WordNet.prototype.follow = function (s, sym) {
    var self = this, out = [];
    s.ptrs.forEach(function (p) {
      if (p.sym !== sym) return;
      var t = self.synset(p.pos, p.offset);
      if (t) out.push(t); else self.quarantine.pointers++;
    });
    return out;
  };
  /* every synset below s (kind-of closure), bounded */
  WordNet.prototype.below = function (s, limit) {
    var seen = Object.create(null), out = [], q = [s];
    limit = limit || 5000;
    while (q.length && out.length < limit) {
      var x = q.shift(), k = x.pos + x.offset;
      if (seen[k]) continue;
      seen[k] = 1; out.push(x);
      this.follow(x, "~").concat(this.follow(x, "~i")).forEach(function (c) { q.push(c); });
    }
    return out;
  };
  WordNet.prototype.above = function (s, depth) {
    var out = [], frontier = [s], d = 0, seen = Object.create(null);
    while (frontier.length && d < (depth || 20)) {
      var next = [];
      frontier.forEach(function (x) { this.follow(x, "@").concat(this.follow(x, "@i")).forEach(function (p) { if (!seen[p.pos + p.offset]) { seen[p.pos + p.offset] = 1; out.push({ syn: p, depth: d + 1 }); next.push(p); } }); }, this);
      frontier = next; d++;
    }
    return out;
  };
  /* tokens of a definition: hyphenated compounds stay whole ("yellow-
     flowered" does not say a thing is yellow) */
  function tokens(def) { return String(def).toLowerCase().replace(/[^a-z0-9'\- ]+/g, " ").split(/\s+/).filter(Boolean); }
  /* inverted index over definitions (built once, by a chunk-by-chunk pass
     over the data file; quarantined lines never enter it) */
  WordNet.prototype.mentioning = function (word, file) {
    file = file || "noun";
    if (!this.inverted[file]) {
      var inv = Object.create(null), txt = this.text["data." + file], pos = 0, n = txt.length;
      while (pos < n) {
        var nl = txt.indexOf("\n", pos); if (nl < 0) nl = n;
        if (txt.charCodeAt(pos) !== 32) {
          var rec = this.synset(file === "adj" ? "a" : file.charAt(0), pos);
          if (rec) {
            var seenT = Object.create(null);
            tokens(rec.def).forEach(function (t) { if (!seenT[t]) { seenT[t] = 1; (inv[t] = inv[t] || []).push(rec.offset); } });
          }
        }
        pos = nl + 1;
      }
      this.inverted[file] = inv;
    }
    return this.inverted[file][String(word).toLowerCase()] || [];
  };

  /* adjectives whose own record links (=) to an attribute noun: the values
     of that attribute as the dataset itself states them ("colorless" =
     color), built once from the validated adjective file */
  WordNet.prototype.attributeValues = function (nounOffset) {
    if (!this.attrIndex) {
      var idx = Object.create(null), txt = this.text["data.adj"], pos = 0, n = txt.length;
      while (pos < n) {
        var nl = txt.indexOf("\n", pos); if (nl < 0) nl = n;
        if (txt.charCodeAt(pos) !== 32) {
          var rec = this.synset("a", pos);
          if (rec) rec.ptrs.forEach(function (p) { if (p.sym === "=" && p.pos === "n") (idx[p.offset] = idx[p.offset] || []).push(rec); });
        }
        pos = nl + 1;
      }
      this.attrIndex = idx;
    }
    return this.attrIndex[nounOffset] || [];
  };

  /* ------------------------------------------------------------ loading */
  var DS = { wordnet: null, caller: null, error: null, loading: null, sha256: sha256, parseRecord: parseRecord, tokens: tokens, ChunkedCaller: ChunkedCaller, WordNet: WordNet };
  DS.available = function () { return !!(DS.wordnet && DS.wordnet.ready); };
  DS.ready = function (onProgress) {
    if (DS.available()) return Promise.resolve(DS.wordnet);
    if (DS.loading) return DS.loading;
    var local = root.C4DatasetLocal || null, manifest = (local && local.manifest) || root.C4DatasetManifest || null;
    var cfg = root.ROBOTS_CONFIG || {};
    if (!manifest) { DS.error = "no pinned dataset manifest"; return Promise.resolve(null); }
    if (!local && cfg.dataset === false) { DS.error = "dataset disabled"; return Promise.resolve(null); }
    DS.caller = new ChunkedCaller({ local: local, base: cfg.datasetBase || DEFAULT_BASE, chunkSize: cfg.datasetChunk });
    var wn = new WordNet();
    DS.loading = wn.load(DS.caller, manifest, onProgress).then(function (w) { DS.wordnet = w; DS.loading = null; return w; },
      function (e) { DS.error = e.message; DS.loading = null; return null; });
    return DS.loading;
  };
  root.C4Dataset = DS;
  if (typeof module !== "undefined" && module.exports) module.exports = DS;
})(typeof window !== "undefined" ? window : globalThis);
