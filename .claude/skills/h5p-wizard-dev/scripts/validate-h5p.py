#!/usr/bin/env python3
"""Validiert ein .h5p-Paket gegen die H5P-Spezifikation und die semantics.json der Bibliotheken.

Prüft:
  * h5p.json: Pflichtfelder und Formate (wie H5PValidator in h5p-php-library)
  * preloadedDependencies vs. mitgelieferte Bibliotheksordner (Machine-Major.Minor)
  * content/content.json rekursiv gegen die semantics.json der mainLibrary
    - Typfehler, ungültige select-Werte, fehlende Pflichtfelder, unbekannte Felder
    - Sub-Content: "library"-Strings müssen in den options der Semantik stehen,
      sonst verwirft der H5P-Core den Inhalt beim Anzeigen
    - Gruppen mit genau einem Feld werden (wie im Core) "flach" erwartet

Semantik-Quellen (in dieser Reihenfolge):
  1. semantics.json im Paket (<Machine>-<maj>.<min>/semantics.json)
  2. --semantics-dir DIR mit Dateien <MachineName>.json (siehe fetch-semantics.sh)

Aufruf:
  python3 -I validate-h5p.py paket.h5p [--semantics-dir DIR] [--json]
Exitcode 1 bei Fehlern (ERROR), 0 sonst (WARN wird nur gemeldet).
"""
import argparse
import json
import os
import re
import sys
import zipfile

H5P_REQUIRED = {
    "title": re.compile(r"^.{1,255}$", re.S),
    "language": re.compile(r"^[-a-zA-Z]{1,10}$"),
    "mainLibrary": re.compile(r"^[$a-z_][0-9a-z_.$]{1,254}$", re.I),
}
DEP_RE = {
    "machineName": re.compile(r"^[\w0-9\-.]{1,255}$", re.I),
    "majorVersion": re.compile(r"^[0-9]{1,5}$"),
    "minorVersion": re.compile(r"^[0-9]{1,5}$"),
}
LICENSES = {"CC BY", "CC BY-SA", "CC BY-ND", "CC BY-NC", "CC BY-NC-SA", "CC BY-NC-ND",
            "CC0 1.0", "GNU GPL", "PD", "ODC PDDL", "CC PDM", "U", "C"}
FILE_TYPES = {"image", "file", "video", "audio"}


class Report:
    def __init__(self):
        self.items = []

    def add(self, level, where, msg):
        self.items.append({"level": level, "path": where, "msg": msg})

    def error(self, where, msg):
        self.add("ERROR", where, msg)

    def warn(self, where, msg):
        self.add("WARN", where, msg)

    @property
    def errors(self):
        return [i for i in self.items if i["level"] == "ERROR"]


class SemanticsStore:
    def __init__(self, zf, semantics_dir):
        self.zf = zf
        self.dir = semantics_dir
        self.names = set(zf.namelist())
        self.cache = {}

    def get(self, machine, major=None, minor=None):
        key = (machine, major, minor)
        if key in self.cache:
            return self.cache[key]
        sem = None
        if major is not None:
            p = f"{machine}-{major}.{minor}/semantics.json"
            if p in self.names:
                sem = json.loads(self.zf.read(p).decode("utf-8"))
        if sem is None and self.dir:
            p = os.path.join(self.dir, machine + ".json")
            if os.path.isfile(p):
                with open(p, encoding="utf-8") as fh:
                    sem = json.load(fh)
        self.cache[key] = sem
        return sem


def check_h5p_json(meta, names, rep):
    for key, rx in H5P_REQUIRED.items():
        val = meta.get(key)
        if not isinstance(val, str) or not rx.match(val):
            rep.error("h5p.json/" + key, f"fehlt oder ungültig: {val!r}")
    emb = meta.get("embedTypes")
    if not isinstance(emb, list) or not emb or any(e not in ("div", "iframe") for e in emb):
        rep.error("h5p.json/embedTypes", f"muss 'div' und/oder 'iframe' enthalten: {emb!r}")
    if "license" in meta and meta["license"] not in LICENSES:
        rep.error("h5p.json/license", f"unbekannte Lizenz {meta['license']!r}")
    deps = meta.get("preloadedDependencies")
    if not isinstance(deps, list) or not deps:
        rep.error("h5p.json/preloadedDependencies", "fehlt oder leer")
        return {}
    folders = {n.split("/", 1)[0] for n in names if "/" in n}
    seen = {}
    for i, d in enumerate(deps):
        where = f"h5p.json/preloadedDependencies[{i}]"
        for k, rx in DEP_RE.items():
            if not rx.match(str(d.get(k, ""))):
                rep.error(where, f"{k} ungültig: {d.get(k)!r}")
        m = d.get("machineName")
        ver = f"{d.get('majorVersion')}.{d.get('minorVersion')}"
        if m in seen and seen[m] != ver:
            rep.error(where, f"{m} doppelt mit verschiedenen Versionen ({seen[m]} / {ver})")
        seen[m] = ver
        folder = f"{m}-{ver}"
        if folder not in folders:
            same = sorted(f for f in folders if f.startswith(m + "-"))
            if same:
                rep.error(where, f"h5p.json verlangt {folder}, Paket enthält aber {', '.join(same)} "
                                 "(Versions-Mismatch – Upload scheitert, falls die Version nicht auf der Plattform installiert ist)")
            else:
                rep.warn(where, f"Bibliotheksordner {folder} nicht im Paket – muss auf der Zielplattform installiert sein")
    if meta.get("mainLibrary") and meta["mainLibrary"] not in seen:
        rep.error("h5p.json/mainLibrary", "mainLibrary fehlt in preloadedDependencies")
    return seen


def validate(value, field, where, store, rep, deps):
    t = field.get("type")
    optional = field.get("optional", False)
    if value is None:
        if not optional and t not in ("group",) and "default" not in field:
            rep.warn(where, "Pflichtfeld fehlt (H5P nutzt ggf. Default/leer)")
        return
    if t == "text":
        if not isinstance(value, str):
            rep.error(where, f"text erwartet, gefunden {type(value).__name__}")
        elif field.get("regexp"):
            rx = field["regexp"]
            if not re.search(rx.get("pattern", ""), value, re.I if "i" in rx.get("modifiers", "") else 0):
                rep.error(where, f"verletzt regexp {rx.get('pattern')}")
        if isinstance(value, str) and field.get("widget") != "html" and field.get("tags") is None and re.search(r"<\w+[^>]*>", value):
            rep.warn(where, "HTML-Tags in einem Nicht-HTML-Textfeld")
        if isinstance(value, str) and field.get("widget") == "html" and re.search(r"<(?!/?\w)", value):
            rep.warn(where, "unescaptes '<' in HTML-Feld (z. B. '3 < 5') – als &lt; kodieren")
    elif t == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            rep.error(where, f"number erwartet, gefunden {value!r}")
    elif t == "boolean":
        if not isinstance(value, bool):
            rep.error(where, f"boolean erwartet, gefunden {value!r}")
    elif t == "select":
        allowed = [o.get("value") for o in field.get("options", [])]
        vals = value if field.get("multiple") and isinstance(value, list) else [value]
        for v in vals:
            if v not in allowed:
                rep.error(where, f"Wert {v!r} nicht erlaubt (erlaubt: {allowed})")
    elif t == "list":
        if not isinstance(value, list):
            rep.error(where, "list erwartet")
            return
        # Der Core erzwingt "min" nicht (nur der Editor) und kürzt bei "max" stillschweigend.
        if "min" in field and len(value) < field["min"] and not (optional and len(value) == 0):
            rep.warn(where, f"Editor verlangt mind. {field['min']} Einträge, gefunden {len(value)}")
        if "max" in field and len(value) > field["max"]:
            rep.error(where, f"max. {field['max']} Einträge – der Core verwirft alles ab Eintrag {field['max'] + 1} (gefunden {len(value)})")
        for i, item in enumerate(value):
            validate(item, field["field"], f"{where}[{i}]", store, rep, deps)
    elif t == "group":
        sub = field.get("fields", [])
        if len(sub) == 1 and not field.get("isSubContent"):
            validate(value, sub[0], where, store, rep, deps)  # Core "flattened" Einfeld-Gruppen
            return
        if not isinstance(value, dict):
            rep.error(where, "group (Objekt) erwartet")
            return
        validate_fields(value, sub, where, store, rep, deps)
    elif t == "library":
        if not isinstance(value, dict):
            rep.error(where, "library-Objekt erwartet")
            return
        lib = value.get("library", "")
        opts = [o if isinstance(o, str) else o.get("name") for o in field.get("options", [])]
        if lib not in opts:
            rep.error(where, f"library {lib!r} nicht in erlaubten options – Core verwirft den Inhalt. Erlaubt: {opts}")
        m = lib.split(" ")[0]
        if m and m not in deps:
            rep.error(where, f"{m} fehlt in h5p.json/preloadedDependencies")
        if "subContentId" not in value:
            rep.warn(where, "subContentId fehlt")
        parts = lib.split(" ")
        if len(parts) == 2 and "." in parts[1]:
            maj, mnr = parts[1].split(".", 1)
            sem = store.get(parts[0], maj, mnr)
            if sem is None:
                rep.warn(where, f"keine Semantik für {lib} verfügbar – Inhalt nicht tief geprüft")
            elif isinstance(value.get("params"), dict):
                validate_fields(value["params"], sem, where + f"<{parts[0]}>", store, rep, deps)
    elif t in FILE_TYPES:
        items = value if isinstance(value, list) else [value]
        for i, f in enumerate(items):
            if not isinstance(f, dict) or "path" not in f:
                rep.error(f"{where}[{i}]", f"{t}: Objekt mit 'path' erwartet")


def validate_fields(obj, fields, where, store, rep, deps):
    known = set()
    for f in fields:
        name = f.get("name")
        known.add(name)
        validate(obj.get(name), f, f"{where}/{name}", store, rep, deps)
    for k in obj:
        if k not in known and k not in ("subContentId", "metadata"):
            rep.warn(f"{where}/{k}", "Feld nicht in semantics.json – wird ignoriert")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("package")
    ap.add_argument("--semantics-dir")
    ap.add_argument("--json", action="store_true", help="Bericht als JSON ausgeben")
    ap.add_argument("--libs", action="store_true",
                    help="nur die verlangten Bibliotheksversionen auflisten (zum Abgleich mit Moodle)")
    a = ap.parse_args()

    if a.libs:
        with zipfile.ZipFile(a.package) as zf:
            meta = json.loads(zf.read("h5p.json").decode("utf-8"))
        for d in sorted(meta.get("preloadedDependencies", []), key=lambda d: d.get("machineName", "")):
            print(f"{d.get('machineName')} {d.get('majorVersion')}.{d.get('minorVersion')}")
        return 0

    rep = Report()
    with zipfile.ZipFile(a.package) as zf:
        names = zf.namelist()
        if "h5p.json" not in names:
            rep.error("h5p.json", "fehlt")
        if "content/content.json" not in names:
            rep.error("content/content.json", "fehlt")
        if rep.errors:
            return finish(rep, a.json)
        meta = json.loads(zf.read("h5p.json").decode("utf-8"))
        deps = check_h5p_json(meta, names, rep)
        content = json.loads(zf.read("content/content.json").decode("utf-8"))
        main_lib = meta.get("mainLibrary")
        ver = deps.get(main_lib, "")
        maj, _, mnr = ver.partition(".")
        store = SemanticsStore(zf, a.semantics_dir)
        sem = store.get(main_lib, maj or None, mnr or None)
        if sem is None:
            rep.warn("content.json", f"keine Semantik für {main_lib} – nur h5p.json geprüft")
        else:
            validate_fields(content, sem, "content", store, rep, deps)
        for n in names:
            if n.startswith("content/") and not n.endswith("/") and n != "content/content.json":
                ref = n[len("content/"):]
                if ref not in json.dumps(content):
                    rep.warn(n, "Datei im Paket, aber nicht in content.json referenziert")
    return finish(rep, a.json)


def finish(rep, as_json):
    if as_json:
        print(json.dumps(rep.items, ensure_ascii=False, indent=2))
    else:
        for i in rep.items:
            print(f"{i['level']:5} {i['path']}: {i['msg']}")
        print(f"\n{len(rep.errors)} Fehler, {len(rep.items) - len(rep.errors)} Warnungen")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
