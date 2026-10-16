# Umsetzungsplan H5P-Wizard

Grundlage: [`docs/ANALYSE.md`](ANALYSE.md) (Befunde und Vorschläge, Stand 16.10.2026).
Ausgangsversion: **V.0.9.6.2** (= V.0.9.6 ohne „Eigene Bilder“ für Karten).

Jede Phase endet mit:
`e2e-harness.mjs` ohne FAIL · `validate-h5p.py` ohne ERROR · manueller Upload-Test auf der Zielplattform (WordPress/Moodle).

| Phase | Version | Ziel | Status |
|---|---|---|---|
| 1 | **V.0.9.7** | Fehler beheben, die Inhalte verlieren oder ungültige Pakete erzeugen | ✅ umgesetzt, Upload-Test offen |
| 2 | V.0.10 | Robuster Export: Template-Merge, Validierung, Korrektur-Prompt | geplant |
| 3 | V.0.11 | Prompts überarbeiten (AFB/Operatoren, Aufbau, Differenzierung) | geplant |
| 4 | V.0.12 | Neue Inhaltstypen (Essay, Find the Words, Page-/Quiz-Erweiterungen) | geplant |
| 5 | V.1.0 | Architektur (Typ-Registry), Interactive Book, Barrierefreiheit, Offline/DSGVO | geplant |

---

## Phase 1 – V.0.9.7 „Bugfix“ ✅

| # | Befund (ANALYSE §5) | Umsetzung |
|---|---|---|
| 1 | Accordion/Crossword/Timeline/Video-Prompts ohne Thema, Basistext, Anweisung | gemeinsame Bausteine `inputBlock()`, `didaktikBlock()`, `closing` für **alle** Typen; Typ-spezifische Qualitätsregeln ergänzt |
| 2 | Multiple Choice exportiert nur die 1. Frage | Prompt verlangt immer `{"questions":[…]}`; bei >1 Frage wird automatisch ein **Question Set** gepackt (Hinweis im Status) |
| 3 | `sanitizeJSON` zerstört URLs (`//`) | `extractJSONText()` + `JSON.parse`; nur bei Fehler `repairJSON()` (Kommentare/Kommas **außerhalb** von Strings); Text vor/nach dem JSON wird ignoriert |
| 4 | Hartkodierte Versionen (`libPatches`, Page-/Accordion-Bausteine) | `alignTemplateDependencies()` liest die Bibliotheksordner des Templates; Sub-Libraries über `findLib()`; fehlende Bibliotheken → Hinweis statt stillem Fehler |
| 5 | True/False ohne Mapping | eigener Zweig `mapTrueFalse()`; mehrere Aussagen → Question Set |
| 6 | TF-Feedback geht verloren (Quiz, Page, Video) | `behaviour.feedbackOnCorrect/feedbackOnWrong` |
| 7 | Timeline-Epochen ohne Titel, Sprache fix `de` | `era[].headline`; Datumsformat wird normalisiert (`9.11.1989` → `1989,11,9`, `44 v. Chr.` → `-44`); Sprache nach Fach |
| 8 | Complex Blanks: ungültiger Wert `answers` | Option liefert `all` |
| 9 | Verstecktes Mengenfeld („Exakt 5 Fragen“ bei True/False, Guess the Answer …) | eigenes Feld `#opts-count` nur für MC, Quiz, SCS, True/False (Aussagen), Summary (Gruppen), Sort (Absätze) |
| 10 | Sort the Paragraphs ohne Mapping / Pflichtfeld | eigener Zweig mit `taskDescription`; Nummerierung wird entfernt; Prompt-Beispiel ohne „1. Ursache:“ (verriet die Lösung) und sachlich korrigiert |
| 11 | Kein HTML-Escaping | `escapeHtml()` für alle Felder mit `widget: html` |
| 13 | MC `singleAnswer` veraltet | `behaviour.type` (`auto`/`multi`) |
| 14/15 | Widersprüche im Prompt (Feedback-Beispiel, Testmodus vs. Feedback-Pflicht, Markdown vs. `*Wort*`, sichtbarer Zwischenschritt) | bereinigt; im Testmodus keine Begründungsfelder |
| 16 | Template-Fehler zeigte ewig „wird geladen…“ | Fehlermeldung + Button „Erneut versuchen“ |
| 17 | YouTube-Links (`/shorts/`, `/embed/`, nocookie), `h:mm:ss`, `videoId` | `parseYouTubeId()`, `parseTime()` erweitert, `videoId` aus dem JSON als Fallback; Feedback für Video-Fragen |
| 18 | Dateiname mit Umlauten | `toFileName()` (ä→ae …) |
| – | Quick Wins | Prompt-Vorschau (aufklappbar), Kopieren mit `await` + Fallback, `crypto.randomUUID()`, `h5p.json/language` nach Fach, Schulart-Artikel („am Gymnasium“), Quellentreue- und Faktentreue-Regel, ausgewogene True/False-Aussagen, Längen-Bias-Check bei Distraktoren |

**Testergebnis V.0.9.7:** E2E 58/58 bestanden (V.0.9.6: 15/33); alle 18 Testpakete ohne Validator-Fehler.

**Offen in Phase 1:**
- [ ] Upload-Test der echten Templates von ws-lab.de (aus der Testumgebung nicht erreichbar): für jeden Typ eine Datei erzeugen und in WordPress hochladen. Besonders prüfen: Page, Accordion, Crossword, Timeline, Complex Blanks (früher `libPatches`) sowie MC/TF mit mehreren Fragen (benötigt Question-Set-Template mit MultiChoice **und** TrueFalse).
- [ ] Prüfen, ob das Question-Set-Template `H5P.TrueFalse` enthält – sonst Template neu exportieren.

---

## Phase 2 – V.0.10 „Robuster Export“

1. **Template-Merge:** `content/content.json` des Templates laden und die generierten Felder hineinmergen → deutsche Beschriftungen (l10n), Standard-Einstellungen und Pflichtfelder (`endGame.showAnimations` …) bleiben erhalten.
2. **Schema-Prüfung nach dem Parsen** je Typ mit verständlichen Meldungen („Frage 3: ‚correct‘ fehlt“) und Vorschau (Anzahl erkannter Fragen).
3. **Korrektur-Prompt-Button:** Fehlerliste + „Gib das vollständige, korrigierte JSON aus“ in die Zwischenablage.
4. **Template-Cache:** Button „Templates aktualisieren“, Versions-/ETag-Prüfung.
5. **JS-Bibliotheken:** JSZip gepinnt mit SRI (oder eingebettet), FileSaver durch nativen Download ersetzen, Font Awesome 6.7.2 (selbst gehostet).
6. **Lizenz & Metadaten:** Lizenzauswahl (z. B. CC BY-SA 4.0), Autor:in, sinnvolle Sub-Content-Titel.
7. Interactive Video: Positionen/Größe der Interaktionen, Abschluss-Summary.

## Phase 3 – V.0.11 „Prompts“

1. Aufbau nach `references/prompt-guidelines.md`: Rolle → Auftrag → Quelle → Didaktik → Schema → Beispiel → stille Selbstprüfung.
2. **Anforderungsbereiche I–III + Operatoren** (BW) neben/anstelle von Bloom; Verteilung vorgeben.
3. Typ-spezifische Regeln nur dort, wo sie gelten (kürzere Prompts für kleinere Modelle in telli/fobizz).
4. Option „3 Niveaus“ (Basis/Standard/Experte) in einem Durchgang.
5. Optional: Leitperspektiven BW als Kontext.
6. Prompt-Regressionstest: Beispiel-JSON je Typ aus dem Prompt muss packbar sein.

## Phase 4 – V.0.12 „Neue Inhaltstypen“

Reihenfolge nach Nutzen/Aufwand (ANALYSE §7): Essay → Find the Words → Page-Bausteine (Drag/Mark the Words, Dialog Cards, Accordion, Guess the Answer, Essay) → Question Set + Essay → Interactive Video mit weiteren Interaktionen.
Je Typ: Workflow B des Skills (`h5p-library-scout` + `h5p-prompt-engineer` parallel → `h5p-content-type-builder` → `h5p-qa-tester`), Template auf ws-lab.de bereitstellen.

## Phase 5 – V.1.0

Typ-Registry (`CONTENT_TYPES`), Interactive Book, Tastaturbedienung/ARIA (Typ-Kacheln, Fach-Auswahl, Dialog), Kontraste, Formularzustand speichern, optional Offline-Einzeldatei; später Branching Scenario, Structure Strip, Dictation (TTS), Memory.
