#!/usr/bin/env python3
"""Build the sharded CELL4 internal dataset.

    python3 tools/c4_dataset_build.py [INPUT ...] [--books DIR ...] [--out c4-dataset]

INPUT      CELL4 record files (or directories of *.txt record files) in the
           existing syntax, one record per line:
             entity: <name> | type: <type> | defn: <text> | aliases: a, b | <attr>: <value>
             word: <headword> | pos: n|v|adj|adv | gloss: <text> | class: <CLASS>
           Lines starting with # are comments. c4-dataset.txt is a valid input.
--books    directories of plain-text books (*.txt, e.g. Project Gutenberg).
           Each book becomes ordinary entity records in the same syntax: one
             entity: <Title> | type: book | defn: <Title> is a book by <Author>. | author: <Author>
           and its text as passages of at most 600 characters, split at
           sentence boundaries:
             entity: <Title>, passage <N> | type: passage | defn: <text> | book: <Title>
           The language stack quotes passages only for a question that names
           the book; they never enter the knowledge base.

Output (deterministic -- the same inputs give byte-identical shards):
  <out>/shard_000.txt ... shard_NNN.txt  valid CELL4 files, each at most
                                          --shard-bytes and --shard-records
  <out>/manifest.json                     written last
  <out>/build-report.json                 quarantined lines, duplicates

Every record is validated with the same rules as c4-local-dataset.js before
it is written; records are de-duplicated across all inputs (the same type
and fields, in any order); a record is never split across shards; input
order is kept (files sorted by path), so the first statement of a fact wins,
as it does in the loader. Stdlib only.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata

FORMAT = "c4-record-v1"
SHARD_BYTES = int(4.75 * 1024 * 1024)       # 4,980,736 -- under the loader's per-shard limit
SHARD_RECORDS = 19500
MAX_VALUE = 600
TOTAL_BYTES = 250 * 1024 * 1024
POS = {"n": "n", "noun": "n", "v": "v", "verb": "v", "adj": "adj", "adjective": "adj", "adv": "adv", "adverb": "adv"}
CLASSES = {"PERSON", "GROUP", "PLACE", "ARTIFACT", "SUBSTANCE", "ORGANISM", "BODY", "ACTIVITY", "PROCESS", "EVENT",
           "STATE", "PROPERTY", "ABSTRACT", "FIELD", "COMMUNICATION", "MEASURE", "TIME", "ACTION", "QUALITY", "MANNER"}

# --- the loader's rules (c4-local-dataset.js parse), one for one ---------------
BAD_CHARS = re.compile(r"[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
FIELD_SPLIT = re.compile(r"\s+\|\s+")
FIELD = re.compile(r"^([a-z][a-z_ ]{0,30}?)\s*:\s*(.+)$", re.I)
ENTITY_NAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_ .,'()&-]{0,80}$")     # JS \w is ASCII
HEADWORD = re.compile(r"^[a-z][a-z' -]{0,40}$")


def validate(raw):
    """(kind, fields, order, why, warning) for one trimmed, non-comment line."""
    if BAD_CHARS.search(raw):
        return None, None, None, "markup or control characters", None
    fields, order = {}, []
    for part in FIELD_SPLIT.split(raw):
        m = FIELD.match(part)
        if not m:
            return None, None, None, "not a key: value field (" + part[:40] + ")", None
        k, v = re.sub(r"\s+", "_", m.group(1).lower()), m.group(2).strip()
        if len(v) > MAX_VALUE:
            return None, None, None, "value too long for " + k, None
        if k in fields:
            return None, None, None, "field repeated: " + k, None
        fields[k] = v
        order.append(k)
    if order[0] == "entity":
        if not ENTITY_NAME.match(fields["entity"]):
            return None, None, None, "entity name not usable", None
        rel = [k for k in order[1:] if k not in ("type", "defn", "definition", "aliases")]
        if not (fields.get("defn") or fields.get("definition")) and not rel:
            return None, None, None, "entity has no definition and no attributes", None
        return "entity", fields, order, None, None
    if order[0] == "word":
        if not HEADWORD.match(fields["word"].lower()):
            return None, None, None, "headword not usable", None
        if POS.get((fields.get("pos") or "n").lower()) is None:
            return None, None, None, "unknown part of speech", None
        if not (fields.get("gloss") or fields.get("meaning")):
            return None, None, None, "word has no gloss", None
        cls = (fields.get("class") or "").upper()
        warn = "unknown word class " + cls + " (read as ABSTRACT)" if cls and cls not in CLASSES else None
        return "word", fields, order, None, warn
    return None, None, None, "unknown record type (start the line with entity: or word:)", None


def fingerprint(fields, order):
    """The loader's record identity: type, then the fields in sorted order."""
    return order[0] + "\x01" + "\x01".join(k + "\x02" + re.sub(r"\s+", " ", fields[k]) for k in sorted(order))


# --- books ----------------------------------------------------------------------
def ascii_fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")


def clean_value(s):
    """Text made safe for a field value: one line, no markup or control
    characters, no field separator, within the value limit."""
    s = s.replace("—", " - ").replace("–", "-")
    s = s.replace("<", "(").replace(">", ")").replace("|", "/")
    s = re.sub(r"[\x00-\x1f\x7f]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_name(s, room):
    s = ascii_fold(s)
    s = re.sub(r"[^A-Za-z0-9_ .,'()&-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" .,-&'")
    s = s[:room].rstrip(" .,-&'")
    return s if s and re.match(r"^[A-Za-z0-9_]", s) else ""


GUT_START = re.compile(r"^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG.*$", re.I | re.M)
GUT_END = re.compile(r"^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG.*$", re.I | re.M)
SENT = re.compile(r"(?:(?<=[.!?])|(?<=[.!?][\"'\u201d\u2019)]))\s+(?=[\"'\u201c\u2018(]?[A-Z0-9])")


def book_records(path):
    """Records for one plain-text book, in reading order."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read().replace("﻿", "")
    head = text[:6000]
    tm = re.search(r"^Title:\s*(.+)$", head, re.M)
    am = re.search(r"^Author:\s*(.+)$", head, re.M)
    s, e = GUT_START.search(text), GUT_END.search(text)
    body = text[s.end():e.start()] if s and e and e.start() > s.end() else (text[s.end():] if s else text)
    title_raw = tm.group(1).strip() if tm else os.path.splitext(os.path.basename(path))[0].replace("_", " ")
    title = clean_name(title_raw, 60)
    if not title:
        return [], "no usable title"
    author = clean_value(am.group(1)) if am else ""
    recs = []
    if author:
        recs.append("entity: %s | type: book | defn: %s is a book by %s. | author: %s" % (title, title, author, author))
    else:
        recs.append("entity: %s | type: book | defn: %s is a book." % (title, title))
    # paragraphs -> sentences -> passages of at most the value limit
    paras = [clean_value(p) for p in re.split(r"\n\s*\n", body)]
    n, cur = 0, ""

    def flush():
        nonlocal n, cur
        if cur and len(cur.split()) < 3:          # headings and page marks are not passages
            cur = ""
        if cur:
            n += 1
            recs.append("entity: %s, passage %d | type: passage | defn: %s | book: %s" % (title, n, cur, title))
            cur = ""

    for p in paras:
        if len(p) < 2:
            continue
        for sent in SENT.split(p):
            while len(sent) > MAX_VALUE:              # an over-long sentence is cut at a space
                cut = sent.rfind(" ", 0, MAX_VALUE)
                if cut <= 0:
                    cut = MAX_VALUE
                flush()
                cur = sent[:cut].strip()
                flush()
                sent = sent[cut:].strip()
            if cur and len(cur) + 1 + len(sent) > MAX_VALUE:
                flush()
            cur = (cur + " " + sent).strip() if cur else sent
        flush()                                       # a passage never spans paragraphs
    return recs, None


# --- inputs ---------------------------------------------------------------------
def files_under(p, ext=".txt"):
    if os.path.isfile(p):
        return [p]
    out = []
    for root, dirs, files in os.walk(p):
        dirs.sort()
        for f in sorted(files):
            if f.lower().endswith(ext):
                out.append(os.path.join(root, f))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build the sharded CELL4 internal dataset (c4-record-v1).")
    ap.add_argument("inputs", nargs="*", help="CELL4 record files or directories of them (e.g. c4-dataset.txt)")
    ap.add_argument("--books", action="append", default=[], help="directory (or file) of plain-text books; repeatable")
    ap.add_argument("--out", default="c4-dataset", help="output directory (default: c4-dataset)")
    ap.add_argument("--name", default="CELL4", help="dataset_name in the manifest")
    ap.add_argument("--shard-bytes", type=int, default=SHARD_BYTES, help="max UTF-8 bytes per shard (default %d)" % SHARD_BYTES)
    ap.add_argument("--shard-records", type=int, default=SHARD_RECORDS, help="max records per shard (default %d)" % SHARD_RECORDS)
    ap.add_argument("--max-total-bytes", type=int, default=TOTAL_BYTES,
                    help="stop adding records past this many bytes in total (default 250 MiB; 0 = no cap)")
    a = ap.parse_args(argv)
    if a.shard_bytes > SHARD_BYTES or a.shard_records > SHARD_RECORDS:
        ap.error("shard limits may not exceed %d bytes / %d records (the loader rejects larger shards)" % (SHARD_BYTES, SHARD_RECORDS))

    seen, records, report = set(), [], {"inputs": [], "books": [], "quarantined": [], "duplicates": 0, "warnings": [], "skipped_for_size": 0}
    total = 0

    def take(line, where):
        nonlocal total
        raw = line.strip().lstrip("\ufeff").strip()     # JS trim() drops a BOM too
        if not raw or raw.startswith("#"):
            return
        kind, fields, order, why, warn = validate(raw)
        if why:
            if len(report["quarantined"]) < 10000:
                report["quarantined"].append({"where": where, "why": why, "line": raw[:120]})
            else:
                report["quarantined_more"] = report.get("quarantined_more", 0) + 1
            return
        fp = fingerprint(fields, order)
        if fp in seen:
            report["duplicates"] += 1
            return
        size = len(raw.encode("utf-8")) + 1
        if a.max_total_bytes and total + size > a.max_total_bytes:
            report["skipped_for_size"] += 1
            return
        if warn and len(report["warnings"]) < 10000:
            report["warnings"].append({"where": where, "why": warn})
        seen.add(fp)
        records.append(raw)
        total += size

    for inp in a.inputs:
        for path in files_under(inp):
            report["inputs"].append(path)
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                for i, line in enumerate(f, 1):
                    take(line, "%s:%d" % (path, i))
    for d in a.books:
        for path in files_under(d):
            recs, why = book_records(path)
            report["books"].append({"file": path, "records": len(recs), "skipped": why})
            for j, r in enumerate(recs, 1):
                take(r, "%s#%d" % (path, j))

    if not records:
        print("nothing to write: no valid records in the inputs", file=sys.stderr)
        return 1

    # shards, in record order; a record is never split
    os.makedirs(a.out, exist_ok=True)
    for f in os.listdir(a.out):
        if re.match(r"^shard_\d+\.txt$", f) or f == "manifest.json":
            os.remove(os.path.join(a.out, f))
    shards, buf, nbytes = [], [], 0

    def header(i):
        return "# CELL4 internal dataset shard %03d (%s)\n" % (i, FORMAT)

    def write():
        nonlocal buf, nbytes
        name = "shard_%03d.txt" % len(shards)
        data = (header(len(shards)) + "".join(r + "\n" for r in buf)).encode("utf-8")
        with open(os.path.join(a.out, name), "wb") as f:
            f.write(data)
        shards.append({"file": name, "bytes": len(data), "records": len(buf), "sha256": hashlib.sha256(data).hexdigest()})
        buf, nbytes = [], 0

    for r in records:
        size = len(r.encode("utf-8")) + 1
        if buf and (nbytes + size + len(header(len(shards)).encode()) > a.shard_bytes or len(buf) + 1 > a.shard_records):
            write()
        buf.append(r)
        nbytes += size
    if buf:
        write()

    manifest = {"version": 1, "dataset_name": a.name, "format": FORMAT,
                "total_bytes": sum(s["bytes"] for s in shards), "total_records": sum(s["records"] for s in shards),
                "shard_count": len(shards), "limits": {"shard_bytes": a.shard_bytes, "shard_records": a.shard_records},
                "shards": shards}
    with open(os.path.join(a.out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    report["shards"] = len(shards)
    report["records"] = manifest["total_records"]
    report["bytes"] = manifest["total_bytes"]
    with open(os.path.join(a.out, "build-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print("CELL4 dataset built: %s\n  shards: %d\n  records: %s\n  size: %.1f MB\n  quarantined: %d\n  duplicates: %d%s" % (
        a.out, len(shards), format(manifest["total_records"], ","), manifest["total_bytes"] / 1048576.0,
        len(report["quarantined"]) + report.get("quarantined_more", 0), report["duplicates"],
        "\n  not added (total size cap): %d" % report["skipped_for_size"] if report["skipped_for_size"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
