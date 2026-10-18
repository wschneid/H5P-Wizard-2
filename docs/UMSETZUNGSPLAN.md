# Umsetzungsplan H5P-Wizard

Grundlage: [`docs/ANALYSE.md`](ANALYSE.md) (Befunde und Vorschläge, Stand 16.10.2026).
Ausgangsversion: **V.0.9.6.2** (= V.0.9.6 ohne „Eigene Bilder“ für Karten).

Jede Phase endet mit:
`e2e-harness.mjs` ohne FAIL · `validate-h5p.py` ohne ERROR · manueller Upload-Test in **Moodle** (Zielplattform) mit einem Konto in der **Lehrkraft-Rolle**.

**Einsatzszenario:** Der Wizard und die Vorlagen (.h5p) liegen auf WordPress (ws-lab.de); die erzeugten H5P-Dateien werden in **Moodle** hochgeladen.
Wichtig: Lehrkräfte ohne die Berechtigung `moodle/h5p:updatelibraries` (Standard: nur Manager/Admins) können eine H5P-Datei nur hochladen, wenn **alle** darin verlangten Bibliotheksversionen bereits in Moodle installiert sind. Die Versionen stammen aus den WordPress-Vorlagen – weichen sie von Moodles installierten Versionen ab, scheitert der Upload für Lehrkräfte, während er für Admins funktioniert. Deshalb mit Lehrkraft-Rolle testen.

| Phase | Version | Ziel | Status |
|---|---|---|---|
| 1 | **V.0.9.7** | Fehler beheben, die Inhalte verlieren oder ungültige Pakete erzeugen | ✅ umgesetzt, Upload-Test offen |
| 2 | **V.0.10** | Robuster Export: Template-Merge, Validierung, Korrektur-Prompt | ✅ umgesetzt, Upload-Test offen |
| 2a | **V.0.10.1** | Eingebaute Vorlagen ohne Server, Bibliotheksversionen für Moodle | ✅ umgesetzt, Upload-Test offen |
| 3 | **V.0.11** | Prompts überarbeiten (AFB/Operatoren, Aufbau, Differenzierung) | ✅ umgesetzt, Praxistest mit KIs offen |
| 4 | **V.0.12** | Neue Inhaltstypen (Essay, Find the Words, Page-/Quiz-Erweiterungen) | ✅ umgesetzt, Upload-Test offen |
| 5 | **V.1.0** | Typ-Registry, Interactive Book, Barrierefreiheit, Eingaben merken, Dark Mode (Standard) | ✅ umgesetzt, Upload-Test offen |
| 5a | **V.1.0.1** | Server-Vorlage ausgeblendet (immer eingebaut), Kopfleiste ohne Überlappung | ✅ umgesetzt |
| 6 | **V.1.1** | Neuer Inhaltstyp Course Presentation | ✅ umgesetzt, Upload-Test offen |
| 7 | **V.1.2** | Bundesland-Auswahl, Erklärungen zu den didaktischen Einstellungen, Szenario-Beschreibung | ✅ umgesetzt |
| 8 | **V.1.3** | Szenario „Selbstlernen“, Unterrichtsphase, Vorwissen, Kompetenzbezug; Informatik/Medienbildung (BW) | ✅ umgesetzt |
| 9 | **V.1.4** | Neue Inhaltstypen Bingo (mit Vorleseliste), Structure Strip (Schreibgerüst) und Speak the Words Set (Sprechaufgaben) | ✅ umgesetzt, Upload-Test offen |
| 10 | **V.1.5** | Lehrplanbezug Baden-Württemberg (G9, überarbeitete Fassungen), keine Genderformen | ✅ umgesetzt |

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
- [ ] Upload-Test der echten Templates von ws-lab.de (aus der Testumgebung nicht erreichbar): Dateien erzeugen und als Lehrkraft in Moodle hochladen. Nicht jeder Typ ist nötig – vorrangig die mit geändertem Packer: Page, Accordion, Crossword, Timeline, Complex Blanks (früher `libPatches`), MC/TF mit mehreren Fragen (benötigt Question-Set-Template mit MultiChoice **und** TrueFalse), Question Set, Interactive Video.
- [ ] Abgleich der Bibliotheksversionen: Moodle → Website-Administration → H5P → „H5P-Inhaltstypen verwalten“ mit den Versionen in den WordPress-Vorlagen vergleichen (Werkzeug: `python3 .claude/skills/h5p-wizard-dev/scripts/validate-h5p.py datei.h5p --libs` listet die verlangten Versionen). Bei Abweichungen entweder Moodle-Bibliotheken aktualisieren oder die Vorlagen aus Moodle exportieren (Inhaltsspeicher → Herunterladen) und auf WordPress ablegen.
- [ ] Prüfen, ob das Question-Set-Template `H5P.TrueFalse` enthält – sonst Template neu exportieren.

---

## Phase 2 – V.0.10 „Robuster Export“ ✅

| # | Vorhaben | Umsetzung |
|---|---|---|
| 1 | **Template-Merge** | `mergeTemplateContent()`: Die generierten Inhalte werden in die `content.json` des Templates eingefügt. Erhalten bleiben Beschriftungen (UI, l10n, texts), Einstellungen (`behaviour`, `endGame` …) und Pflichtfelder – auch in Teilinhalten von Quiz, Page und Video (Abgleich über die Bibliothek). **Nie** übernommen werden Medien und Beispielinhalte des Templates (`media`, `title`, `description`, `introPage`, `poolSize`, Lesezeichen, Video-Endbildschirme …). |
| 2 | **Inhaltsprüfung + Vorschau** | `validateData()` prüft jeden Typ beim Einfügen: z. B. „Frage 2: keine Antwort mit correct: true“, „Lücken im Text (4) und blanks (3) stimmen nicht überein“, „Hinweis enthält das Lösungswort“. Vorschau: „5 Fragen erkannt → wird als Question Set verpackt“. **Fehler sperren den Export**, Hinweise nicht. Falscher Inhaltstyp wird erkannt. |
| 3 | **Korrektur-Prompt** | Button „Korrektur-Prompt kopieren“: Fehler- und Hinweisliste + Bitte um vollständiges, korrigiertes JSON (bei Syntaxfehlern mit konkreten Tipps). |
| 4 | **Template-Cache** | Button „Templates aktualisieren“ (mit Ergebnis „x aktualisiert / alle aktuell / y nicht erreichbar“), wöchentliche Prüfung im Hintergrund (Prüfsumme statt Versionsnummer), Anzeige „Stand TT.MM.JJJJ“. Ein gecachtes Template bleibt nutzbar, wenn der Server nicht erreichbar ist. |
| 5 | **JS-Bibliotheken** | JSZip 3.10.1 **eingebettet** (offiziell aus npm; keine Abhängigkeit von ws-lab.de/Libs, offline nutzbar). FileSaver entfernt → nativer Download. Font Awesome 6.5.1 → 6.7.2. |
| 6 | **Lizenz & Metadaten** | Auswahl Lizenz (CC BY / BY-SA / BY-NC / BY-NC-SA / BY-ND 4.0, CC0, ©) und Autor:in → `h5p.json` und alle Teilinhalte; Autor-/Quellangaben des Templates werden entfernt; Auswahl wird im Browser gemerkt. Quizfragen tragen ihren Fragetext als Titel. |
| 7 | **Interactive Video** | Optionale Zusammenfassung am Videoende (H5P.Summary, 3 Aussagegruppen) – Checkbox in Schritt 3, Prompt und Packer. |

**Testergebnis V.0.10:** E2E 69/69 bestanden; alle 23 Testpakete ohne Validator-Fehler. Gegenprobe: gegen V.0.9.7 schlagen genau die 10 neuen Phase-2-Tests fehl.

**Offen in Phase 2:**
- [ ] Upload-Test mit den echten Templates – insbesondere prüfen, dass die **deutschen Beschriftungen** ankommen und keine Beispielinhalte der Templates auftauchen.
- [ ] Font Awesome selbst hosten (DSGVO): Dateien von fontawesome.com nach `ws-lab.de/wp-content/uploads/…` legen und den `<link>` umstellen – braucht Zugriff auf den Server. Die Prüfsumme (SRI) für cdnjs konnte aus der Testumgebung nicht verifiziert werden.
- [ ] Interactive Video: Positionen/Größe der Fragen – nur mit echter Darstellung in Moodle sinnvoll zu justieren (x/y in %, Breite/Höhe in em); bisher x = y = 50 %.
- [ ] Die WordPress-Bibliotheksablage `ws-lab.de/wp-content/uploads/2026/Libs/` (jszip, FileSaver) wird nicht mehr benötigt.

## Zwischenschritt – V.0.10.1 „Eingebaute Vorlagen“ ✅

Anlass: „Template konnte nicht geladen werden“ – der Wizard war vom Abruf der Vorlagen auf ws-lab.de abhängig.

| Vorhaben | Umsetzung |
|---|---|
| Vorlagen ohne Server | Neue Standard-Einstellung **„Eingebaut – ohne Bibliotheks-Code“**: Das Paket enthält nur `h5p.json` + `content.json`. Beschriftungen und Standardeinstellungen (Deutsch; bei Fach Englisch englisch) für 20 Bibliotheken sind eingebettet (36 KB), automatisch erzeugt aus den offiziellen `semantics.json` + `language/de.json` (`scripts/build-builtin-templates.py`). Keine Downloads, keine Ladefehler. |
| Passend zu Moodle | Lehrkräfte können ohnehin nur Inhalte mit bereits installierten Bibliotheken hochladen – mitgelieferter Bibliotheks-Code nützt ihnen nichts. |
| Bibliotheksversionen | Bereich „Vorlagen & Bibliotheksversionen“: Tabelle aller Versionen mit Quelle; **„Versionen aus H5P-Datei übernehmen“** (z. B. ein aus Moodle heruntergeladener Inhalt) oder von Hand ändern. Reihenfolge: eigene Angabe > Versionen aus früher geladenen Server-Vorlagen > Standard. Nach dem Export: „Benötigt in Moodle: …“. |
| Server-Vorlagen bleiben wählbar | „Vom Server (ws-lab.de) – mit Bibliotheks-Code“ funktioniert wie in V.0.10 (inkl. „Templates aktualisieren“). |

**Testergebnis V.0.10.1:** E2E 73/73 (inkl. Test ohne erreichbaren Server); alle Pakete ohne Validator-Fehler.

**Offen:**
- [ ] In Moodle einen vorhandenen H5P-Inhalt je genutztem Inhaltstyp herunterladen und über „Versionen aus H5P-Datei übernehmen“ einlesen – dann stimmen die Versionen exakt. Standardwerte stammen aus dem GitHub-Release-Stand und können von Moodles installierten Versionen abweichen.
- [ ] Upload-Test in Moodle (Lehrkraft-Rolle) mit eingebauten Vorlagen.

## Phase 3 – V.0.11 „Prompts“ ✅

| # | Vorhaben | Umsetzung |
|---|---|---|
| 1 | **Einheitlicher Aufbau** | Neuer Generator (`promptSettings` → `promptSpec` je Typ → `generatePrompt`). Alle 18 Typen: **1. Rolle → 2. Auftrag → 3. Quelle → 4. Didaktik → 5. Ausgabeformat → 6. Selbstprüfung (still) → 7. Ausgabe**. Anweisung der Lehrkraft steht oben im Auftrag. Jeder Typ hat ein vollständiges ✅-Beispiel mit echtem Inhalt („zeigt nur das Format“) und höchstens zwei ❌-Fehlerbilder. |
| 2 | **Anforderungsbereiche** | Bloom ersetzt durch **AFB I–III mit BW-Operatoren** oder „gemischt 40/40/20“. Lernziel-Typ schlägt einen AFB vor. Bei Fragetypen kennzeichnet die KI jede Frage mit `"afb"`; die Vorschau zeigt die Verteilung („AFB I/II/III: 2/2/1“). |
| 3 | **Nur passende Regeln** | Lücken-Syntax, Distraktor-Regeln, Feedback-Pflicht usw. erscheinen nur bei Typen, für die sie gelten. Prompts für Auswahltypen sind ca. 20–30 % kürzer; Prompts, die vorher zu dünn waren (Page, Accordion), sind ausführlicher. |
| 4 | **Drei Niveaus** | Checkbox „In drei Niveaus erstellen“: Die KI liefert `{"niveaus":{"basis":…,"standard":…,"experte":…}}` (Basis AFB I, Standard I–II, Experte II–III). Prüfung je Niveau; Export als drei Dateien („Titel (Basis)“ …) oder einzeln wählbar. |
| 5 | **Leitperspektiven BW** | Optional BNE, BTV, PG, BO, MB, VB – „wo fachlich passend, keine erzwungenen Bezüge“. |
| 6 | **Vertragstest** | Der E2E-Test liest aus jedem erzeugten Prompt das ✅-Beispiel und packt es: 18/18 packbar, ohne Validator-Fehler. |
| – | Weitere Korrekturen | Geschlechtergerechte Sprache und vielfältige Lebenswelten als feste Regel; Flashcards: eintippbare Kurzantworten; Mark the Words: eindeutige Kategorie; Guess the Answer: leeres, falsch strukturiertes Bildfeld entfernt (bestand seit V.0.9.6; setzte unnötig H5P.Image voraus). |

**Testergebnis V.0.11:** E2E 114/114; 45 Testpakete ohne Validator-Fehler.

**Offen:**
- [ ] Praxistest der neuen Prompts mit den an der Schule genutzten KIs (z. B. telli, fobizz, ChatGPT): je 2–3 Typen erzeugen, JSON einfügen, Vorschau und Korrektur-Prompt beobachten. Besonders: Werden `"afb"`-Kennzeichnungen und die Struktur `"niveaus"` zuverlässig eingehalten?
- [ ] Upload-Test in Moodle (Lehrkraft-Rolle), u. a. eine Datei je Niveau.

## Phase 4 – V.0.12 „Neue Inhaltstypen“ ✅

| # | Vorhaben | Umsetzung |
|---|---|---|
| 1 | **Essay** (H5P.Essay 1.5) | Neuer Typ „Essay (Freitext)“: Aufgabenstellung mit Operator, Schreibimpuls, Schlüsselwörter mit Alternativen, Punkten und Feedback (Treffer/fehlt), Musterlösung; Optionen: Anzahl Schlüsselwörter, erwartete Antwortlänge (setzt Mindest-/Höchstlänge). Prüfung warnt bei fehlenden Schlüsselwörtern/Musterlösung. |
| 2 | **Find the Words** (H5P.FindTheWords 1.4) | Neuer Typ „Suchsel“: Wörter werden in Großbuchstaben umgewandelt, Umlaute ersetzt, Leerzeichen entfernt; Füllbuchstaben enthalten alle Buchstaben der Wörter (nichts fällt auf); Option „nur waagerecht und senkrecht“. Deutsche Beschriftungen von Hand ergänzt (keine offizielle Sprachdatei). |
| 3 | **Page: 6 neue Bausteine** | Drag the Words, Mark the Words, Freitext (Essay), Lernkarten, Denkfrage, Accordion – mit eigenen Optionen; Umsetzung identisch mit den gleichnamigen Inhaltstypen (ein Mapping). Page hat jetzt 13 Bausteine. |
| 4 | **Question Set + Essay** | Neuer Fragetyp `essay` im Quiz. |
| 5 | **Interactive Video** | Zusätzliche Interaktionen wählbar: Lückentext, Drag the Words, Text-Einblendung (Merksatz, H5P.Text). |
| – | Eingebaute Vorlagen | Erweitert um H5P.Essay, H5P.FindTheWords, H5P.Text (23 Bibliotheken, 39 KB). Neue Typen haben keine Server-Vorlage und nutzen auch im Server-Modus die eingebaute Vorlage. |
| – | Aufgeräumt | Mark the Words bekam ein unnötiges leeres Feld `distractors`. |

**Testergebnis V.0.12:** E2E 130/130 (inkl. Vertragstests für Video mit allen Interaktionen, Quiz mit Essay, Page mit allen 13 Bausteinen); 55 Testpakete ohne Validator-Fehler.

**Offen:**
- [ ] In Moodle prüfen, ob **H5P.Essay 1.5** und **H5P.FindTheWords 1.4** installiert sind (Website-Administration → H5P → H5P-Inhaltstypen verwalten) – sonst über den H5P-Hub nachinstallieren lassen. Für Text-Einblendungen im Video wird **H5P.Text 1.1** benötigt (meist mit Interactive Video installiert).
- [ ] Upload-Test in Moodle (Lehrkraft-Rolle): Essay, Find the Words, Page mit neuen Bausteinen, Video mit Lückentext.

## Phase 5 – V.1.0 „Architektur, Barrierefreiheit, Dark Mode“ ✅

| # | Vorhaben | Umsetzung |
|---|---|---|
| 1 | **Typ-Registry** | `CONTENT_TYPES` ist die einzige Liste der Inhaltstypen: Kachel (Beschriftung, Icon), Bibliothek, Server-Vorlage, sichtbare Optionen (`opts`), Mengenfeld (`count`), Tipps (`hints`). Die Typ-Kacheln, `typeToId`, `COUNT_FIELDS` und das Ein-/Ausblenden in `updateUI()` werden daraus erzeugt. Neuer Typ = Registry-Eintrag + je ein Fall in `promptSpec`, `validateData`, `mapToH5PStructure`. |
| 2 | **Interactive Book** (H5P.InteractiveBook 1.15) | Neuer Typ: 2–10 Kapitel, jedes eine Seite aus den gewählten Page-Bausteinen (H5P.Column), optional Deckblatt mit Kurzbeschreibung; Inhaltsverzeichnis, Fortschrittsanzeige und Zusammenfassung sind eingeschaltet. Prompt, Prüfung (je Kapitel wie bei Page) und Packer nutzen den Page-Code mit. Eingebaute Vorlage ergänzt (24 Bibliotheken). |
| 3 | **Barrierefreiheit** | Fach als normales Auswahlfeld; Typ-Kacheln per Tab und Pfeiltasten wählbar (sichtbarer Fokus); Fortschrittsschritte per Enter/Leertaste mit `aria-current`; Hilfe als Dialog (Escape schließt, Fokus kehrt zurück); alle Formularfelder beschriftet; Statusmeldungen werden vorgelesen (`aria-live`); Page-Bausteine auch per ▲/▼ verschiebbar; bessere Kontraste bei grauen Texten; reduzierte Animationen, wenn im System eingestellt. |
| 4 | **Eingaben merken** | Die Angaben aus Schritt 1–4 (inkl. Reihenfolge der Bausteine) bleiben nach dem Neuladen erhalten – nur in diesem Browser. Basistext und KI-JSON werden nicht gespeichert. Knopf „Gespeicherte Eingaben löschen“ im Fuß. |
| 5 | **Dark Mode als Standard** | Alle Farben laufen über Design-Variablen (hell/dunkel); dunkles Design ist voreingestellt, der Schalter ☀/☾ oben rechts wechselt und merkt sich die Wahl. Ungenutztes CSS und JavaScript entfernt. |

**V.1.0.1:** Die Auswahl „Vom Server (ws-lab.de) – mit Bibliotheks-Code“ ist für Nutzer:innen ausgeblendet; der Wizard nutzt immer die eingebauten Vorlagen, eine früher gespeicherte Server-Wahl wird zurückgesetzt. Für Entwicklung und Tests bleibt sie über `?vorlagen=server` erreichbar. Außerdem überdeckt der Design-Schalter nicht mehr den Fortschrittsschritt 5. E2E 145/145, 57 Pakete ohne Validator-Fehler.

**Testergebnis V.1.0:** E2E 144/144 (neu: Interactive Book, Tastaturbedienung, Hilfe-Dialog, Beschriftungen, Design-Umschalter, gespeicherte Eingaben); 57 Testpakete ohne Validator-Fehler.

**Offen:**
- [ ] In Moodle prüfen, ob **H5P.InteractiveBook 1.15** installiert ist. Wichtig: Das Buch verlangt genau die Column-Version, die zu seiner Version gehört (1.15 → H5P.Column 1.22). Am sichersten: ein Buch aus Moodle herunterladen und über „Versionen aus H5P-Datei übernehmen“ einlesen.
- [ ] Upload-Test in Moodle (Lehrkraft-Rolle): Interactive Book mit Deckblatt.
- [ ] Font Awesome selbst hosten (DSGVO) – braucht Zugriff auf den Server.

**Später:** Branching Scenario, Dictation (Sprachausgabe), Memory. (Structure Strip: umgesetzt in V.1.4.)

## V.1.1 „Course Presentation“ ✅

| Vorhaben | Umsetzung |
|---|---|
| **Course Presentation** (H5P.CoursePresentation 1.27) | Neuer Typ: Präsentation mit 3–20 Folien. Jede Folie hat eine Überschrift (zugleich Eintrag im Folienverzeichnis) und Stichpunkte (werden als Aufzählung dargestellt); auf Aufgabenfolien steht zusätzlich eine Aufgabe. Wählbar: Multiple Choice, Wahr/Falsch, Lückentext, Drag the Words, Mark the Words, Single Choice Set, Summary, Lernkarten – genau die Typen, die Course Presentation als Folienelement erlaubt. Die Aufgaben nutzen dieselbe Umsetzung wie die Page-Bausteine. Optional Ergebnisfolie am Ende. Layout: Überschrift oben; Text und Aufgabe nebeneinander bzw. volle Breite. |
| Prompt | Stichpunkte statt Fließtext (max. 60 Wörter pro Folie), Titelfolie mit Leitfrage, Aufgaben verteilt und nur zum Stoff der Folien davor; Aufgabenformate als Varianten A, B, C … |
| Prüfung | Je Folie Überschrift, Text oder Aufgabe; Aufgabentyp muss auf Folien erlaubt sein; Aufgaben werden wie Page-Bausteine geprüft; Hinweis bei abweichender Folienzahl oder zu viel Text. |
| Eingebaute Vorlage | 25 Bibliotheken; fehlende deutsche Beschriftungen von Course Presentation („Folien“, „Ergebnisse“ …) von Hand ergänzt. |

**Testergebnis V.1.1:** E2E 152/152 (neu: Prompt-Vertragstest, Präsentation mit Text/Aufgabe/Aufzählung, alle 8 Aufgabentypen auf Folien); 61 Testpakete ohne Validator-Fehler.

**Offen:**
- [ ] In Moodle prüfen, ob **H5P.CoursePresentation 1.27** installiert ist (sonst Version über „Versionen aus H5P-Datei übernehmen“ anpassen).
- [ ] Upload-Test in Moodle (Lehrkraft-Rolle): Darstellung der Folien (Textgröße, Platz für Aufgaben).

## V.1.2 „Didaktische Einstellungen“ ✅

| Vorhaben | Umsetzung |
|---|---|
| **Bundesland** | Neue Auswahl in Schritt 1 (Standard: Baden-Württemberg). Steuert die Schularten des Landes (z. B. Mittelschule in Bayern, Berufskolleg in NRW, Stadtteilschule in Hamburg), die Fächer (BW-Fächer wie BNT, AES, NWT nur in BW; sonst z. B. Naturwissenschaften, Politik/Sozialkunde, Arbeitslehre/WAT) und die Rolle im Prompt („… am Gymnasium in Nordrhein-Westfalen (Kernlehrpläne)“). Außerhalb von BW heißen die Leitperspektiven „Querschnittsthema“ (zusätzlich Demokratiebildung). Sprachprofil und Artikel („am/an der“) gelten für alle Schulformen. |
| **Erklärungen** | Knopf ⓘ neben jeder didaktischen Einstellung (Anforderungsniveau, Sprachniveau, Anforderungsbereich, Distraktoren, falsche Wörter, Feedback, Tipps, Lernziel, Leitperspektive/Querschnittsthema, Szenario, Bundesland). Klick öffnet die Erklärung darunter, Escape schließt; per Tastatur und Screenreader bedienbar (kein Hover-Tooltip, der auf Tablets nicht funktioniert). |
| **Szenario** | Unter der Auswahl steht, was der Modus bewirkt (Übungsmodus: Wiederholen, Lösungen, Erklärungen zu falschen Antworten; Testmodus: ohne Hilfen, Hinweise zu Moodle-Bewertung und Versuchen). Im Testmodus ist „Hilfestellungen (Tipps)“ gesperrt – vorher widersprach die Einstellung der Prompt-Regel „keine Tipps“. |

**Testergebnis V.1.2:** E2E 157/157 (neu: Bundesland im Prompt, Schularten/Fächer NRW, Erklär-Knöpfe, Szenario); 61 Testpakete ohne Validator-Fehler.

**Offen:**
- [ ] Schularten und Lehrplan-Bezeichnungen der Länder von Lehrkräften aus den Ländern gegenlesen lassen.

### Weitere Vorschläge für die didaktischen Einstellungen (noch nicht umgesetzt)

1. **Voreinstellungen (Presets)** – ein Klick setzt passende Werte: „Einstieg/Vorwissen aktivieren“ (AFB I, Feedback motivierend), „Üben“ (gemischt, Tipps, Lösungen), „Lernkontrolle“ (Testmodus, AFB gemischt, keine Tipps), „Hausaufgabe“.
2. ~~**Drittes Szenario „Selbstlernen“**~~ – umgesetzt in V.1.3.
3. **Sprachsensibler Unterricht** – Option „Einfache Sprache / sprachsensibel“: Wortspeicher mit Fachbegriffen im Aufgabentext, Satzanfänge, Verzicht auf Nebensätze; unabhängig vom Anforderungsniveau.
4. ~~**Vorwissen und Unterrichtsphase**~~ – umgesetzt in V.1.3.
5. ~~**Kompetenzbezug**~~ – umgesetzt in V.1.3.
6. **Zeitrahmen** – „ca. 10 / 20 / 45 Minuten“; die KI wählt den Umfang passend (ersetzt Zahlenfelder für Laien).
7. **Gruppierung der Einstellungen** in drei aufklappbare Bereiche: *Niveau* (Anforderungsniveau, AFB, Sprachniveau, drei Niveaus), *Rückmeldung* (Feedback, Stil, Tipps, Szenario), *Bezug* (Lernziel, Querschnittsthema, Kompetenz) – weniger Überforderung beim ersten Besuch.
8. **Österreich und Schweiz** – Auswahl um AT/CH erweitern (Schulformen, Lehrplan 21, Klassenbezeichnungen).

## V.1.3 „Didaktik erweitert“ ✅

| Vorhaben | Umsetzung |
|---|---|
| **Szenario „Selbstlernen“** | Drittes Szenario für Lernen ohne Lehrkraft (Hausaufgabe, Vertretung): Wiederholen und Lösung anzeigen wie im Übungsmodus; „Feedback anzeigen“ und – bei Lückentexten – „Tipps“ werden eingeschaltet; der Prompt verlangt zu jeder Antwort, auch zu richtigen, eine kurze Begründung und Tipps als Denkanstoß ohne Lösung. |
| **Unterrichtsphase** | Einstieg, Erarbeitung, Sicherung, Wiederholung – je Phase eine eigene Anweisung im Prompt (z. B. Sicherung: keine neuen Inhalte; Wiederholung: vermischte Abrufaufgaben). |
| **Kompetenz aus dem Lehrplan** | Optionales Freitextfeld; der Prompt richtet Aufgaben und Rückmeldungen auf diese Kompetenz aus. |
| **Vorwissen der Klasse** | Optionales Freitextfeld; der Prompt verlangt, daran anzuknüpfen und nichts darüber hinaus vorauszusetzen. |
| **Fächer BW** | IMP entfernt (gibt es nicht mehr), dafür „Informatik/Medienbildung“. |
| **Genauere Erklärungen** | Alle Erklärtexte machen deutlich: Der Wizard ruft keine KI auf – Erklärungen, Tipps und Rückmeldungen verlangt der Prompt beim Erstellen; danach stehen sie fest in der H5P-Datei. |

**Testergebnis V.1.3:** E2E 161/161 (neu: Selbstlernen schaltet Feedback/Tipps ein und ergänzt den Prompt, Wiederholen/Lösungen im Paket, Phase/Kompetenz/Vorwissen im Prompt, BW-Fächer); 62 Testpakete ohne Validator-Fehler.

## V.1.4 „Bingo, Structure Strip, Speak the Words Set“ ✅

Anlass: Prüfung, welche weiteren Inhaltstypen sich sinnvoll integrieren lassen (Bewertung in [`ANALYSE.md` §7](ANALYSE.md#7-weitere-inhaltstypen)).

| Vorhaben | Umsetzung |
|---|---|
| **Bingo** (H5P.Bingo 0.3, otacke) | Begriffe-Bingo für die Klasse: Die KI liefert Begriffe für die Felder und zu jedem Begriff einen Hinweis zum Vorlesen. Optionen: Spielfeld 3 × 3 / 4 × 4 / 5 × 5, Anzahl Begriffe (mehr Begriffe als Felder → jede:r bekommt ein anderes Spielfeld), Art der Hinweise (Umschreibung → Fachbegriff, Frage → Antwort, Rechenaufgabe → Ergebnis, deutsches Wort → Wort in der Fremdsprache), Joker in der Mitte. Nach dem Export gibt es den Knopf **„Vorleseliste herunterladen“** (Textdatei mit nummerierten Hinweisen zum Abhaken, Lösungen und alphabetischer Begriffsliste). Prüfung: mind. 3 Begriffe (sonst gesperrt); Hinweise zu weniger Begriffen als Feldern, doppelten Begriffen, sehr langen Begriffen, fehlenden Hinweisen und Hinweisen, die den Begriff enthalten. |
| **Structure Strip** (H5P.StructureStrip 1.0/1.1, otacke) | Schreibgerüst: Schreibauftrag und 2–8 Abschnitte, je Abschnitt Titel, 2–4 Hinweise (Leitfragen und Formulierungshilfen, als Aufzählung) und Gewicht (relative Länge). Optionen: Textsorte (frei, z. B. Erörterung, Versuchsprotokoll), Anzahl Abschnitte, erwartete Textlänge (setzt Mindest-/Höchstlänge in Zeichen), Rückmeldung zur Länge schon beim Schreiben. Farben der Abschnitte aus der Palette des H5P-Editors mit dunkler Schrift (Kontrast > 7:1). H5P prüft nur das Längenverhältnis der Abschnitte, nicht den Inhalt. |
| **Speak the Words Set** (H5P.SpeakTheWordsSet 1.3 mit H5P.SpeakTheWords 1.5) | Sprechaufgaben: Lernende sprechen die Antwort ins Mikrofon, H5P vergleicht das Erkannte (ohne Groß-/Kleinschreibung und Punkte) mit den erlaubten Antworten. Aufgabenarten: Begriff sprechen (Fremdsprache: Übersetzung; Deutsch: Begriff zu einer Umschreibung), Vorlesen (Aussprache), kurze Antwort. Sprache der Spracherkennung nach Fach (Englisch → en-GB, Französisch → fr-FR, Spanisch → es-ES, sonst de-DE) oder von Hand. Der Prompt verlangt kurze Antworten ohne Satzzeichen und alle gleichwertigen Varianten (mit/ohne Artikel, I'm/I am, Zahl als Ziffer und Wort); der Packer entfernt übrige Satzzeichen, weil die Spracherkennung keine liefert. Hinweis im Wizard: Datenschutz (Aufnahme geht an den Browser-Hersteller) und keine Unterstützung in Firefox. |
| Eingebaute Vorlagen | 29 Bibliotheken (54 KB); deutsche Beschriftungen aller neuen Typen aus den offiziellen Sprachdateien. Die Beschriftungen der bisherigen 25 Bibliotheken sind unverändert. |

**Testergebnis V.1.4:** E2E 181/181 (neu: Prompt-Vertragstests der drei Typen, Bingo mit Joker/Feldgröße/HTML-Escaping, Bingo als reine Wortliste, Sperre bei zu wenigen Begriffen, Download und Inhalt der Vorleseliste, Structure Strip mit Hinweislisten/Gewichten/Länge/Rückmeldemodus, Speak the Words Set mit Satzzeichen-Bereinigung, Sprache nach Fach und Sperre ohne Antworten); 71 Testpakete ohne Validator-Fehler.

**Offen:**
- [ ] In Moodle prüfen, ob **H5P.Bingo 0.3** und **H5P.StructureStrip** installiert sind (Website-Administration → H5P → H5P-Inhaltstypen verwalten). Bingo hat auf GitHub keinen Release-Zweig (Version 0.x) – ob es über den H5P-Hub angeboten wird, konnte aus der Testumgebung nicht geprüft werden (h5p.org nicht erreichbar). Fehlt es, muss die Administration die Bibliothek einmalig hochladen. Structure Strip: Standard ist 1.0 (GitHub-Release); ist in Moodle 1.1 installiert, die Version über „Versionen aus H5P-Datei übernehmen“ oder von Hand anpassen.
- [ ] Upload-Test in Moodle (Lehrkraft-Rolle): Bingo 4 × 4 mit 20 Begriffen (Darstellung langer Begriffe auf dem Tablet), Structure Strip mit 4 Abschnitten, Speak the Words Set in Chrome, Edge und Safari/iPad (Mikrofonfreigabe im Moodle-iframe, Erkennungsqualität).
- [ ] Datenschutz Speak the Words: Einsatz mit der/dem Datenschutzbeauftragten der Schule klären (Sprachaufnahmen gehen an Google/Microsoft/Apple).

## V.1.5 „Lehrplanbezug BW, Sprache“ ✅

Dateiname V.1.5; im Fuß des Wizards steht auf Wunsch **V.1.0**.

| Vorhaben | Umsetzung |
|---|---|
| **Bildungsplan BW** | Statt fest „Bildungsplan 2016“ nennt die Rolle im Prompt den gültigen Plan je Schulart, Fach und Klasse (`lehrplan()`): **Gymnasium** – seit 2025/26 wieder neunjährig, aufwachsend ab Klasse 5 und 6; Klassen im G9 erhalten „Bildungsplan 2016 des Gymnasiums, Fachplan … in der überarbeiteten Fassung V3.0 von 2026, neunjähriges Gymnasium (G9)“ – laut [bildungsplaene-bw.de](https://www.bildungsplaene-bw.de/,Lde/30823695) gelten die V3.0-Fachpläne seit 1. August 2026 für die Klassen 5–7 (bestätigt für Deutsch, Mathematik, Englisch, Biologie, Chemie, Physik, Geographie, Geschichte, Bildende Kunst; andere Fächer: „Fachplan in der aktuell gültigen Fassung“) plus die Anweisung, nur vorauszusetzen, was nach dem G9-Plan bis zur Vorklasse behandelt wurde (die Inhalte sind auf mehr Schuljahre verteilt). Höhere Klassen: „Bildungsplan 2016 für das achtjährige Gymnasium (G8, auslaufend)“. Die Grenze wächst automatisch mit dem Schuljahr (Wechsel am 1. August; 2026/27: G9 bis Klasse 7). **Grundschule** und **Sekundarstufe I** (Werkreal-, Realschule, Gemeinschaftsschule): Deutsch und Mathematik „in der überarbeiteten Fassung von 2024“; Sek I „Gemeinsamer Bildungsplan der Sekundarstufe I 2016 in der aktuell gültigen Fassung“. Berufliche Schulen und SBBZ mit eigener Bezeichnung. |
| **Leitperspektive LDW** | In BW heißt die frühere Leitperspektive Medienbildung (MB) in den V3.0-Plänen „Leben und Lernen in der digitalen Welt“ (LDW). Auswahl und Prompt nutzen LDW; eine gespeicherte Auswahl „MB“ wird beim Laden auf LDW umgestellt. Andere Länder behalten „Medienbildung“. |
| **Keine Genderformen** | Oberfläche: „Autor“ statt „Autor:in“, „Jeder Schüler“ statt „Jede:r“. Prompt: Regel „Geschlechtergerechte Sprache“ ersetzt durch „Keine Genderformen … generisches Maskulinum“; Selbstprüfung „Kann ein Schüler …“. |

**Testergebnis V.1.5:** E2E 188/188 (neu: Gymnasium Klasse 5 = G9 mit Fachplan V3.0 und Hinweis zur Stoffverteilung, Fach ohne V3.0, Leitperspektive LDW, Klasse 8 = G8 im Schuljahr 2026/27, Grundschule Deutsch und Sek I Mathematik in der Fassung von 2024, keine Genderformen in Prompt und Oberfläche); 71 Testpakete ohne Validator-Fehler.

**Offen:**
- [ ] Stand der Fachpläne regelmäßig prüfen (bildungsplaene-bw.de → Inkrafttreten) und `GYM_V3_FAECHER` ergänzen (z. B. Französisch, Latein, Musik, Sport, Religion, Ethik – V3.0 aus der Testumgebung nicht bestätigt); Informatik und Medienbildung ist für 2027 angekündigt; zu Gemeinschaftskunde, NIT (Naturwissenschaft, Informatik und Technik) und WBS läuft die Anhörung bis 2. Dezember 2026. Ein neues Fach NIT wäre dann in die Fächerliste aufzunehmen.
- [ ] Schulen mit G8-Zug: Der Wizard nimmt für Klassen im G9-Bereich immer G9 an; bei Bedarf eine Auswahl G8/G9 ergänzen.
