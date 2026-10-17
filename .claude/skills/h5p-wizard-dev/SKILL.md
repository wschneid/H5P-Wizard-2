---
name: h5p-wizard-dev
description: Weiterentwicklung des H5P-Wizards (Single-File-HTML, das KI-Prompts erzeugt und KI-JSON zu .h5p-Paketen verpackt). Nutzen bei – Bibliotheksversionen prüfen/aktualisieren, neuen H5P-Inhaltstyp ergänzen, Prompts verbessern, Mapping-/Export-Fehler beheben, Release-QA. Steuert die Agenten h5p-library-scout, h5p-prompt-engineer, h5p-content-type-builder und h5p-qa-tester. Trigger auch bei "H5P", "Inhaltstyp", "content.json", "semantics", "Prompt für <Typ>", "Wizard testen".
---

# H5P-Wizard – Entwicklungs-Workflow

Der Wizard ist eine einzelne Datei `H5P-Wizard (V.x.y.z).html` im Repo-Root. Sie besteht aus
fünf Schritten (Grundlagen → Inhaltstyp → Didaktik → Prompt → Export). Kernfunktionen im `<script>`:

| Bereich | Funktion / Konstante | Zweck |
|---|---|---|
| Typ-Registry | `CONTENT_TYPES` (Alias `TEMPLATE_TYPES`) | einzige Typliste: Kachel, Bibliothek, Template-URL, `opts`, `count`, `hints`; `#typeGrid`, `typeToId`, `COUNT_FIELDS` werden daraus erzeugt |
| UI | `updateUI()` | blendet die `opts` des Typs laut Registry ein; nur Sonderfälle stehen im Code |
| Design | CSS-Variablen in `:root` / `:root[data-theme="dark"]` | keine festen Farben im HTML/JS – immer `var(--…)`; Standard dunkel |
| Prompt | `generatePrompt()` | baut den Master-Prompt je Typ |
| Packer | `sanitizeJSON`, `mapToH5PStructure()`, `packBtn`-Handler, `libPatches`, `findLib` | KI-JSON → `content/content.json` + `h5p.json` |
| Cache | IndexedDB `H5PWizardCache` | Templates (.h5p) |

**Einsatzszenario:** Wizard und Vorlagen liegen auf WordPress (ws-lab.de), die erzeugten Dateien werden in **Moodle**
hochgeladen – meist von Lehrkräften ohne Recht, Bibliotheken zu installieren. Jede verlangte Bibliotheksversion
muss daher in Moodle bereits installiert sein. Upload-Tests immer in Moodle mit Lehrkraft-Rolle.
Ab V.0.10.1 ist die Standard-Vorlagenquelle **eingebaut** (Daten zwischen `/* BUILTIN_TEMPLATES:START/END */`,
Paket ohne Bibliotheks-Code); Server-Vorlagen von ws-lab.de sind nur noch Option.

Analyse & Befundliste: `docs/ANALYSE.md` (Stand 2026-10). Phasen und Status: `docs/UMSETZUNGSPLAN.md`.
Lies beide vor größeren Änderungen. Neue Versionen entstehen als Kopie der letzten Datei mit neuer Nummer
(`H5P-Wizard (V.x.y.z).html`); ältere Versionen bleiben im Repo.

## Goldene Regeln (H5P-Prinzipien, gelten für jede Änderung)

1. **semantics.json ist das Gesetz.** Jedes Feld in `content.json` muss der Semantik der Bibliothek
   entsprechen (Name, Typ, select-Werte). Gruppen mit genau einem Feld werden „flach“ gespeichert.
   Unbekannte Felder werden ignoriert, ungültige Werte verworfen, `max` wird vom Core stillschweigend gekürzt.
2. **Versionen aus dem Template, nie hartkodiert.** Sub-Content-Strings (`"H5P.MultiChoice 1.16"`) müssen in den
   `options` der Eltern-Semantik stehen und in `h5p.json/preloadedDependencies` vorkommen; `h5p.json` darf keine
   Major.Minor verlangen, die nicht als Ordner im Paket liegt (oder sicher auf der Plattform installiert ist).
3. **HTML-Felder (`widget: html`) brauchen escaptes HTML** (`&lt;`, `&amp;`) und erlaubte Tags; Nicht-HTML-Felder
   bekommen reinen Text.
4. **Template-Inhalt mergen statt neu bauen** (l10n, behaviour, overallFeedback bleiben erhalten).
5. **Barrierefreiheit (WCAG 2.1 AA)** – Alt-Texte für Bilder, Tastaturbedienung im Wizard selbst.
6. **Prompt ↔ Packer ↔ Validator bilden einen Vertrag:** Jede Formatänderung im Prompt braucht die passende
   Mapping-Änderung und einen Testfall im E2E-Harness.

## Werkzeuge (in `scripts/`)

| Skript | Aufruf | Zweck |
|---|---|---|
| `fetch-semantics.sh` | `scripts/fetch-semantics.sh --versions` / `scripts/fetch-semantics.sh <DIR> [Machine…]` | Versionen (release/master) bzw. semantics.json von GitHub |
| `validate-h5p.py` | `python3 -I scripts/validate-h5p.py paket.h5p --semantics-dir <DIR>` | Paket gegen Spezifikation + Semantik prüfen |
| `build-builtin-templates.py` | `python3 -I scripts/build-builtin-templates.py --sem <DIR> --lang <LANGDIR> --html "<Wizard>.html"` | Eingebaute Vorlagen (Beschriftungen de/en + Standardversionen) neu erzeugen; `<LANGDIR>/<Machine>.de.json` = `language/de.json` des Repos. Nach Versions-/Bibliotheksupdates ausführen. |
| `e2e-harness.mjs` | `npm i --prefix <OUT> jszip@3 file-saver@2` dann `node scripts/e2e-harness.mjs --html "<Wizard>.html" --out <OUT>` | Headless-Test aller Prompts + Export-Regressionsfälle |

`<DIR>`/`<OUT>` immer im Scratchpad anlegen, nicht im Repo. Die Bibliotheks-Registry liegt in
`references/libraries.json` (Machine-Name → GitHub-Repo, geprüfte Versionen).

## Agenten

| Agent | Rolle | Schreibt Code? |
|---|---|---|
| `h5p-library-scout` | Versionen + Semantik recherchieren, Feld-Mapping-Tabelle liefern | nein |
| `h5p-prompt-engineer` | Prompt-Abschnitt eines Typs entwerfen/überarbeiten, Beispiel-JSON liefern | nur Prompt-Code |
| `h5p-content-type-builder` | Typ/Fix im Wizard implementieren (UI, Prompt, Mapping, Registry) | ja |
| `h5p-qa-tester` | E2E-Harness + Validator ausführen, Regressionstest ergänzen, Bericht | nur Tests |

## Workflows

### A) Bibliotheken prüfen / aktualisieren
1. `h5p-library-scout` (eine Instanz reicht) mit: „Vergleiche `references/libraries.json` und die Versionen im Wizard
   (`findLib`-Defaults, Page-Hardcodes, `libPatches`) mit dem aktuellen GitHub-Stand; liste Semantik-Änderungen zwischen den Versionen.“
2. Ergebnis gegen die Template-Dateien auf ws-lab.de abgleichen (Templates bestimmen die real mitgelieferten Versionen;
   falls ws-lab.de nicht erreichbar ist, den Nutzer bitten, die Templates ins Scratchpad zu legen).
3. `h5p-content-type-builder`: Hardcodes durch Template-Ableitung ersetzen, `libraries.json` aktualisieren.
4. `h5p-qa-tester`: Harness + Validator.

### B) Neuen Inhaltstyp ergänzen
1. **Parallel** starten (ein Nachrichtenblock, zwei Agent-Aufrufe):
   - `h5p-library-scout`: Semantik + aktuelle Version + Pflichtfelder + Sub-Libraries des Typs.
   - `h5p-prompt-engineer`: vereinfachtes KI-JSON-Format + Prompt-Abschnitt nach `references/prompt-guidelines.md`.
2. `h5p-content-type-builder` mit beiden Ergebnissen; folgt `references/content-type-checklist.md`.
3. `h5p-qa-tester`: neuen Testfall im Harness anlegen, Paket validieren.
4. Template-Hinweis an den Nutzer: Für den neuen Typ muss ein Beispiel-.h5p auf ws-lab.de hochgeladen werden
   (URL in `TEMPLATE_TYPES.defaultUrl`).

### C) Prompts verbessern
1. `h5p-prompt-engineer` je Typ-Gruppe (Lückentexte | Auswahlaufgaben | Karten | Container) – bei mehreren Gruppen parallel.
2. Ergebnis: geänderte Prompt-Bausteine + 1 Beispiel-JSON, das der Packer verarbeiten kann.
3. `h5p-qa-tester`: Harness (Prompt enthält Thema/Anweisung/Basistext? keine widersprüchlichen Regeln?) + Beispiel-JSON packen.

### D) Bug beheben
1. `h5p-qa-tester`: Fehler im Harness reproduzieren (Testfall mit `known:true` → nach Fix `known` entfernen).
2. `h5p-content-type-builder`: minimaler Fix.
3. `h5p-qa-tester`: Harness mit `--strict` für die betroffenen Fälle, Validator.

## Abschluss jeder Änderung
- Versionsnummer im Dateinamen **nicht** stillschweigend ändern – beim Nutzer nachfragen (Dateiname = Release).
- Harness ohne neue Fehler, Validator ohne ERROR für die betroffenen Typen.
- `docs/ANALYSE.md`: erledigte Punkte abhaken.
