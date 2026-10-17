#!/usr/bin/env python3
"""Erzeugt die eingebauten Vorlagen des Wizards: Standard-Parameter (Beschriftungen, Einstellungen)
je Bibliothek auf Deutsch und Englisch sowie Standard-Versionen. Ergebnis wird zwischen den Markern
/* BUILTIN_TEMPLATES:START */ und /* BUILTIN_TEMPLATES:END */ in die Wizard-HTML geschrieben.

Quellen (vorher mit fetch-semantics.sh bzw. fetch-language.sh holen):
  SEMDIR/<Machine>.json        semantics.json
  LANGDIR/<Machine>.de.json    language/de.json der Bibliothek

Aufruf:
  python3 -I build-builtin-templates.py --sem SEMDIR --lang LANGDIR --html "H5P-Wizard (V.x).html"
  (ohne --html: JSON auf stdout)

Regeln wie im H5P-Editor beim Anlegen neuer Inhalte:
  * nur Felder mit "default" (Beschriftungen, Verhalten) sowie Ja/Nein-Felder (ohne Default = false);
    keine Inhalte, Listen, Medien, Sub-Libraries
  * Gruppen mit genau einem Feld werden flach gespeichert
  * deutsche Texte aus language/de.json (Positionsabgleich mit semantics.json), sonst Englisch
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REGISTRY = os.path.join(HERE, "..", "references", "libraries.json")

# Bibliotheken, die der Wizard als Haupt- oder Teilinhalt erzeugt
MACHINES = [
    "H5P.Blanks", "H5P.AdvancedBlanks", "H5P.DragText", "H5P.MarkTheWords", "H5P.MultiChoice",
    "H5P.QuestionSet", "H5P.SingleChoiceSet", "H5P.TrueFalse", "H5P.Dialogcards", "H5P.Flashcards",
    "H5P.SortParagraphs", "H5P.GuessTheAnswer", "H5P.Summary", "H5P.InteractiveVideo", "H5P.Column",
    "H5P.Accordion", "H5P.Crossword", "H5P.Timeline", "H5P.AdvancedText", "H5P.Image",
    "H5P.Essay", "H5P.FindTheWords", "H5P.Text",
]
# Bibliotheken ohne offizielle deutsche Sprachdatei: Übersetzung von Hand (Platzhalter wie @found unverändert)
MANUAL_DE = {
    "H5P.FindTheWords": {
        "taskDescription": "Finde die Wörter im Buchstabengitter.",
        "l10n": {"check": "Überprüfen", "tryAgain": "Wiederholen", "showSolution": "Lösung anzeigen",
                 "found": "@found von @totalWords gefunden", "timeSpent": "Benötigte Zeit",
                 "score": "Du hast @score von @total Punkten erreicht", "wordListHeader": "Finde die Wörter"},
    },
}
FILE_TYPES = {"image", "file", "video", "audio"}


def value(field, tr):
    t = field.get("type")
    if t in ("library", "list") or t in FILE_TYPES:
        return None
    if t == "group":
        sub = field.get("fields", [])
        tsub = (tr or {}).get("fields", [])
        if len(sub) == 1 and not field.get("isSubContent"):
            return value(sub[0], tsub[0] if tsub else {})
        o = defaults(sub, tsub)
        return o or None
    if "default" not in field:
        # Der H5P-Editor speichert Ja/Nein-Felder ohne Standardwert als false
        return False if t == "boolean" else None
    if t == "text" and isinstance(tr, dict) and isinstance(tr.get("default"), str):
        return tr["default"]
    return field["default"]


def defaults(fields, tr_fields):
    out = {}
    for i, f in enumerate(fields):
        tr = tr_fields[i] if tr_fields and i < len(tr_fields) else {}
        if isinstance(tr, dict) and tr.get("name") not in (None, f.get("name")):
            tr = {}  # Sprachdatei passt nicht zur Semantik -> Englisch
        v = value(f, tr)
        if v is not None:
            out[f["name"]] = v
    return out


def default_versions():
    reg = json.load(open(REGISTRY, encoding="utf-8"))["libraries"]
    out = {}
    for m in MACHINES:
        e = reg.get(m, {})
        v = e.get("release") or e.get("master")
        if not v:
            raise SystemExit(f"keine Version für {m} in libraries.json")
        out[m] = ".".join(v.split(".")[:2])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sem", required=True)
    ap.add_argument("--lang", required=True)
    ap.add_argument("--html")
    a = ap.parse_args()

    labels = {"de": {}, "en": {}}
    for m in MACHINES:
        sem = json.load(open(os.path.join(a.sem, m + ".json"), encoding="utf-8"))
        labels["en"][m] = defaults(sem, [])
        p = os.path.join(a.lang, m + ".de.json")
        try:
            de = json.load(open(p, encoding="utf-8")).get("semantics", []) if os.path.exists(p) else []
        except (ValueError, AttributeError):
            print(f"WARN: Sprachdatei für {m} unlesbar – Englisch", file=sys.stderr)
            de = []
        if not de and m not in MANUAL_DE:
            print(f"WARN: keine deutsche Sprachdatei für {m}", file=sys.stderr)
        labels["de"][m] = defaults(sem, de)
        for k, v in MANUAL_DE.get(m, {}).items():
            labels["de"][m][k] = {**labels["de"][m].get(k, {}), **v} if isinstance(v, dict) else v

    data = {"versions": default_versions(), "labels": labels}
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if not a.html:
        print(js)
        return
    html = open(a.html, encoding="utf-8").read()
    block = "/* BUILTIN_TEMPLATES:START */\nconst BUILTIN_TEMPLATES = " + js + ";\n/* BUILTIN_TEMPLATES:END */"
    new, n = re.subn(r"/\* BUILTIN_TEMPLATES:START \*/.*?/\* BUILTIN_TEMPLATES:END \*/", lambda _: block, html, flags=re.S)
    if n != 1:
        raise SystemExit("Marker BUILTIN_TEMPLATES nicht (genau einmal) gefunden")
    open(a.html, "w", encoding="utf-8").write(new)
    print(f"OK: {len(MACHINES)} Bibliotheken, {len(js) // 1024} KB eingebaut")


if __name__ == "__main__":
    main()
