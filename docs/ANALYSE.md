# H5P-Wizard v0.9.6 – Code-Review, Funktionsprüfung und Erweiterungsvorschläge

Stand: 16.10.2026 · Geprüfte Datei: `H5P-Wizard (V.0.9.6).html` (1 996 Zeilen, ~150 KB)

---

## 0. Kurzfazit

Der Wizard ist ein durchdachtes Werkzeug mit klarem 5-Schritte-Ablauf, guter didaktischer Steuerung
(Schulart-Profile, Bloom, Distraktor-Strategien, CEFR) und einem cleveren Template-Ansatz (echte .h5p-Pakete
als Vorlage → Bibliotheken müssen nicht nachgebaut werden). Die **Prompts für Lückentexte und Auswahlaufgaben
sind stark** (Positiv-/Negativbeispiele, Selbstprüfung der Distraktoren).

Die Prüfung hat aber **18 reproduzierbare Fehler** ergeben, davon mehrere, die Inhalte stillschweigend verlieren
oder unbrauchbare Pakete erzeugen:

| Schwere | Anzahl | Beispiele |
|---|---|---|
| Kritisch | 4 | Prompts für Accordion/Crossword/Timeline enthalten **weder Thema noch Basistext noch Anweisung**; Multiple Choice exportiert nur **die erste** von N Fragen; `sanitizeJSON` zerstört jede URL im JSON; hartkodierte Versionen in `h5p.json` passen nicht zu den Bibliotheken im Template |
| Hoch | 6 | True/False-Feedback geht verloren (eigenständig und im Quiz); Timeline-Epochen ohne Titel; Complex-Blanks-Option „answers“ ist kein gültiger Wert; versteckte Felder steuern Mengen („Exakt 5 Fragen“ bei True/False) |
| Mittel/Niedrig | 8+ | HTML wird nicht escaped (`3 < 5`), Dateiname mit Umlauten verstümmelt, veraltete Felder, Barrierefreiheit des Wizards selbst |

Alle Befunde sind durch einen automatisierten Test belegt (siehe Abschnitt 3); der Test liegt jetzt als
Werkzeug im Repo (`.claude/skills/h5p-wizard-dev/`).

---

## 1. Vorgehen

1. Vollständiges Code-Review der HTML-Datei (UI, Prompt-Generator, Packer, Cache).
2. Recherche der H5P-Spezifikation und Entwicklerrichtlinien; Abgleich mit dem **Quellcode des H5P-Cores**
   (`h5p-php-library/h5p.classes.php` – Validierung von `h5p.json` und `content.json`).
3. Abruf der aktuellen `library.json` und `semantics.json` von 38 Bibliotheken direkt aus den GitHub-Repos
   (h5p/…, otacke/…), Branches `release` und `master`.
4. **Headless-Browser-Test** (Playwright/Chromium): Wizard geladen, für alle 18 sichtbaren Typen Prompts erzeugt,
   12 Export-Fälle gepackt und die .h5p-Dateien gegen die echten `semantics.json` validiert.

**Einschränkung:** Die Templates auf `ws-lab.de` waren aus der Testumgebung nicht erreichbar (Proxy). Welche
Bibliotheksversionen dort tatsächlich liegen, konnte daher nicht geprüft werden; der Test arbeitet mit
synthetischen Templates. Mit `scripts/validate-h5p.py` lässt sich das lokal an den echten Dateien nachholen.

---

## 2. H5P-Codeprinzipien (Recherche) – und wie der Wizard sie erfüllt

| Prinzip (Quelle: H5P-Spezifikation, Core-Code, Entwicklerleitfaden) | Wizard |
|---|---|
| **Paketformat:** ZIP mit `h5p.json` (Pflicht: `title` ≤ 255 Z., `language`, `mainLibrary`, `preloadedDependencies`, `embedTypes`), `content/content.json`, Bibliotheksordner `Machine-Major.Minor` | ✅ übernimmt `h5p.json` aus Template; ⚠️ `language` bleibt immer die des Templates |
| **`content.json` folgt exakt der `semantics.json`** der Bibliothek; unbekannte Felder werden ignoriert, ungültige select-Werte verworfen | ❌ mehrere falsche Feldnamen/Werte (TF-Feedback, Timeline-Epochen, `selectAlternatives`, `singleAnswer`) |
| **Gruppen mit genau einem Feld werden „flach“ gespeichert** (Core: `validateGroup`, `count(fields)==1`) | ✅ korrekt bei `overallFeedback`, `tip` |
| **Sub-Content:** `"library":"H5P.X a.b"` muss in den `options` der Eltern-Semantik stehen, sonst verwirft der Core den Inhalt; jede Sub-Content-Instanz braucht eine `subContentId` | ⚠️ Page/Accordion hartkodieren Versionen statt sie aus dem Template zu lesen |
| **Listen:** `max` kürzt der Core stillschweigend; `min` erzwingt nur der Editor | ⚠️ keine Prüfung im Wizard |
| **Versionierung:** Major/Minor = Inhaltsstruktur, Patch = Bugfix; Inhalte referenzieren nur Major.Minor; Upgrades über `upgrades.js` | ❌ `libPatches` überschreibt Major.Minor in `h5p.json`, ohne die passenden Bibliotheksordner mitzuliefern |
| **HTML-Felder** (`widget: html`) werden serverseitig gefiltert (erlaubte Tags); Text muss korrekt kodiert sein | ❌ kein Escaping |
| **Lizenz-/Metadaten** pro Inhalt und Sub-Content (`license`, `title`, `authors`) | ⚠️ immer `"U"` (undisclosed), Titel „Frage“/„Untitled Text“ |
| **Barrierefreiheit** – H5P verlangt WCAG 2.1 AA (Alt-Texte, Tastatur) | ❌ Bilder ohne `imageAltText`; Wizard selbst nur eingeschränkt tastaturbedienbar |
| **Lokalisierung:** UI-Texte über `l10n`-Felder in `content.json` | ❌ `content.json` wird neu aufgebaut → deutsche Labels des Templates gehen verloren, H5P zeigt englische Defaults („Check“, „Retry“) |
| **Isolation:** Inhalte sind eigenständig, keine globalen Abhängigkeiten | ✅ (Wizard erzeugt nur Daten) |

---

## 3. Funktionsprüfung (automatisierter Test)

Ausgeführt mit `.claude/skills/h5p-wizard-dev/scripts/e2e-harness.mjs` und `validate-h5p.py`:
**15 / 33 Prüfungen bestanden, 18 Fehler reproduziert, keine JavaScript-Laufzeitfehler.**

### 3.1 Prompts (18 Typen)

| Typ | Thema | Basistext | Anweisung | Bemerkung |
|---|:-:|:-:|:-:|---|
| Fill in the Blanks, Complex Blanks, Drag/Mark the Words, MC, Question Set, SCS, Dialog Cards, Flashcards, Sort, Summary, Page | ✅ | ✅ | ✅ | |
| True/False, Guess the Answer | ✅ | ✅ | ✅ | ❌ „Exakt 5 Fragen“ aus verstecktem Feld, obwohl Einzelaufgabe |
| Interactive Video | ❌ | ✅ | ❌ | |
| **Accordion, Crossword, Timeline** | ❌ | ❌ | ❌ | Prompt hat nur ~600 Zeichen: Format, sonst nichts – die KI weiß nicht, worum es geht |

### 3.2 Export / Mapping

| Fall | Ergebnis |
|---|---|
| Multiple Choice mit 3 Fragen | ❌ nur Frage 1 im Paket (der Prompt verlangt aber „Exakt 5 Fragen“) |
| True/False mit Feedback | ❌ JSON wird ungeprüft durchgereicht, Feedback in falschem Feld, `behaviour` fehlt |
| Lückentext mit `https://…` | ❌ Export-Button bleibt gesperrt („Unterminated string“) |
| HTML-Zeichen (`3 < 5`, `&`) | ❌ nicht kodiert |
| Timeline mit Epochen | ❌ `era[].text = {headline}` statt `era[].headline` → Epochen ohne Titel, Validator-ERROR |
| Complex Blanks, Auswahl „richtige Antworten aller Lücken“ | ❌ Wert `answers` – erlaubt sind `alternatives` \| `all` |
| Question Set mit TF-Feedback | ❌ Feedback verloren |
| Sort the Paragraphs | ❌ Pflichtfeld `taskDescription` fehlt |
| Page / Crossword | ❌ `h5p.json` verlangt H5P.Column 1.18 / Crossword 0.5, Paket enthält die Version des Templates |
| Dateiname „Test Übung“ | ❌ `Test--bung.h5p` |

---

## 4. Aktualität der Bibliotheken

### 4.1 H5P-Bibliotheken (Abgleich mit GitHub, 16.10.2026)

„Wizard“ = Version, die der Code erwartet/hartkodiert. „release“ entspricht meist dem Hub-Stand, „master“ dem neuesten Entwicklungsstand.

| Bibliothek | Wizard | release | master | Bewertung |
|---|---|---|---|---|
| H5P.MultiChoice | 1.16 | 1.16.14 | 1.16.27 | ✅ aktuell (Feld `singleAnswer` ist veraltet → `behaviour.type`) |
| H5P.Blanks | 1.14 | 1.14.37 | 1.14.37 | ✅ |
| H5P.DragText | 1.10 | 1.10.52 | 1.10.52 | ✅ |
| H5P.MarkTheWords | 1.11 | 1.11.9 | 1.11.24 | ✅ |
| H5P.TrueFalse | 1.8 | 1.8.21 | 1.8.24 | ✅ |
| H5P.QuestionSet | 1.20 | 1.20.31 | **1.21**.14 | ⚠️ Minor-Sprung in Vorbereitung |
| H5P.SingleChoiceSet | 1.11 | 1.11.89 | 1.11.89 | ✅ |
| H5P.Summary | 1.10 | 1.10.21 | 1.10.32 | ✅ |
| **H5P.Column** | **1.18** (hartkodiert) | **1.22**.0 | 1.22.0 | ❌ veraltet und hartkodiert |
| H5P.Accordion | 1.0 | 1.0.33 | 1.0.47 | ✅ |
| **H5P.Crossword** | **0.5** (hartkodiert) | 0.5.5 | **0.7**.6 | ⚠️ |
| H5P.Timeline | 1.1 | 1.1.25 | 1.1.27 | ✅ |
| H5P.AdvancedBlanks | 1.2 | 1.2.7 | 1.2.7 | ✅ |
| H5P.InteractiveVideo | Template | 1.28.37 | 1.28.37 | Template prüfen |
| H5P.SortParagraphs | Template | 0.11.9 | 0.12.2 | Template prüfen |
| H5P.Dialogcards / Flashcards / GuessTheAnswer | Template | 1.9 / 1.7 / 1.5 | dito | Template prüfen |
| H5P.AdvancedText / H5P.Image | 1.1 | 1.1 | 1.1 | ✅ |

**Kernproblem ist nicht das Alter, sondern das Hartkodieren:** `libPatches` (Z. 1883) setzt in `h5p.json`
feste Major.Minor-Versionen für Page, Accordion, Crossword, Timeline, Complex Blanks; die Page-Bausteine
(Z. 1812–1833) schreiben feste Sub-Library-Strings. Stimmt das Template nicht exakt überein, lehnt die Plattform
den Upload ab („Missing required library“) oder verwirft Sub-Inhalte. → **Versionen immer aus dem Template lesen**
(`findLib()` existiert bereits und sollte überall genutzt werden).

### 4.2 JavaScript-Bibliotheken des Wizards

| Bibliothek | Eingebunden | Aktuell | Empfehlung |
|---|---|---|---|
| JSZip | `ws-lab.de/…/jszip.min.js` – Version unbekannt, kein SRI | 3.10.2 (09/2026) | gepinnte Version von cdnjs mit `integrity`, oder lokal einbetten |
| FileSaver.js | `ws-lab.de/…/FileSaver.min.js` | 2.0.5 (**11/2020, nicht mehr gepflegt**) | ersetzen durch 5 Zeilen nativen Code (`URL.createObjectURL` + `<a download>`) |
| Font Awesome | cdnjs 6.5.1 | 7.3.1 (07/2026), letzte 6.x: 6.7.2 | auf 6.7.2 heben (kein Breaking Change) oder v7 mit Icon-Prüfung; **Datenschutz**: CDN-Abruf überträgt IP-Adressen → für Schulen besser selbst hosten |

---

## 5. Fehlerliste mit Korrekturvorschlag

Zeilenangaben beziehen sich auf `H5P-Wizard (V.0.9.6).html`.

### Kritisch
1. **Prompts ohne Inhalt** – Accordion/Crossword/Timeline (Z. 1281–1302) und Interactive Video (Z. 1303–1313)
   kehren früh zurück, bevor Thema, Basistext, Anweisung und Didaktik angehängt werden.
   → Gemeinsamen Block „Kontext + Didaktik + Anweisung“ als Funktion auslagern und in allen Zweigen nutzen.
2. **Multiple Choice = nur eine Frage** (Z. 1741–1748: `qArray[0]`), Prompt verlangt N Fragen (Z. 1319) und zeigt
   ein Einzelobjekt als Beispiel. → Bei >1 Frage automatisch als Question Set (nur MC) oder Column verpacken,
   oder Mengenfeld für MC ausblenden.
3. **`sanitizeJSON`** (Z. 1594) löscht alles ab `//` – also jede URL und jeden Text mit „//“.
   → Erst `JSON.parse` des Codeblock-Inhalts versuchen; nur bei Fehler reparieren (Kommentare nur außerhalb von
   Strings entfernen, typografische Anführungszeichen ersetzen, trailing commas).
4. **Versions-Mismatch** durch `libPatches` (Z. 1883–1895) und hartkodierte Sub-Libraries (Z. 1812–1841).
   → Versionen aus `h5pMeta.preloadedDependencies` lesen, `libPatches` entfernen; fehlt eine Bibliothek im
   Template, klare Fehlermeldung statt stiller Ergänzung.

### Hoch
5. **True/False eigenständig**: kein Mapping-Zweig – das KI-JSON wird unverändert zu `content.json`.
   → Zweig ergänzen: `question` (HTML), `correct` als String, `behaviour.feedbackOnCorrect/feedbackOnWrong`.
6. **TF-Feedback im Question Set** (Z. 1657): `feedback:{onCorrect,onWrong}` existiert nicht → `behaviour.feedbackOnWrong`.
   Gleiches fehlt in Page-TF (Z. 1819) und Interactive-Video-TF (Z. 1686); MC im Video ignoriert `feedback`.
7. **Timeline-Epochen** (Z. 1852): `text:{headline}` → `headline`; Fallback `era:[{text:''}]` entfernen;
   `language:'de'` nach Fach setzen (en/fr/es).
8. **Complex Blanks** (Z. 442): Optionswert `answers` → `all`.
9. **Versteckte Felder steuern den Prompt** (Z. 1319): `#question-count` (Standard 5) wird auch bei True/False,
   Guess the Answer, Sort, Summary gelesen, obwohl das Feld dort unsichtbar ist. → Mengen typbezogen.
10. **Sort the Paragraphs** hat keinen Mapping-Zweig: Pflichtfeld `taskDescription` fehlt, Absätze nicht als HTML.

### Mittel
11. **Kein HTML-Escaping** von KI-Texten in HTML-Feldern (`<`, `>`, `&` – relevant in Mathe/Informatik).
12. **`content.json` wird komplett neu gebaut** → l10n/Labels und Einstellungen des (deutschen) Templates gehen
    verloren. → Template-`content.json` laden und generierte Felder **hineinmergen**.
13. **MC `behaviour.singleAnswer`** (Z. 1746, 1654) ist veraltet → `behaviour.type: 'single'|'multi'`.
14. **Feedback-Beispiel im MC-Prompt** setzt `"chosenFeedback":"Korrekt!"` auch bei falschen Antworten (Z. 1444),
    der Packer liest das Feld gar nicht.
15. **Testmodus vs. Feedback-Pflicht:** Testmodus sagt „Kein Feedback“, MC/TF-Abschnitte verlangen gleichzeitig
    Pflicht-Feedback → widersprüchlicher Prompt.
16. **Template-Fehlerstatus** (Z. 912–915): schlägt der Download fehl, steht dauerhaft „Template wird geladen…“.
    Templates im IndexedDB-Cache werden nie aktualisiert. → Fehler anzeigen, „Templates neu laden“-Button,
    Cache mit Version/ETag.
17. **Interactive Video:** YouTube-Regex (Z. 1304) erkennt `/shorts/`, `/embed/`, `youtube-nocookie` nicht;
    `parseTime` (Z. 1598) kein `h:mm:ss`; alle Interaktionen bei x=50/y=50 ohne Breite/Höhe (überlagern sich);
    das vom Prompt angeforderte `videoId` wird nicht genutzt.
18. **Dateiname** (Z. 1917): Umlaute → `-`. → transliterieren (ä→ae …).

### Niedrig / Code-Hygiene
- `uuidv4()` mit `Math.random` → `crypto.randomUUID()`.
- `navigator.clipboard.writeText` ohne `await`/Fehlerbehandlung (Erfolgsmeldung auch bei Fehlschlag, z. B. `file://` in Firefox).
- Dateinamen der Bilder ungefiltert in `innerHTML` (Z. 712, 1965).
- Toter Code: `updateCacheSummary()`, `dbDelete`, `saveWpUrls`, `setWpUrl`, CSS für `.tpl-manager`, `.wp-*`,
  `.upload-zone`, `.preview-box`; Essay-Typ nur per CSS versteckt (Z. 170).
- Bilder werden in Originalgröße eingepackt → per Canvas auf z. B. 1600 px begrenzen.
- Dialog Cards/Flashcards: `imageAltText`, `title`/`description` fehlen (Flashcards: `description` ist Pflicht).
- Summary-Intro fest deutsch („Fasse zusammen:“), auch bei Fremdsprachen.
- `h5p.json/language` nicht an Fach angepasst; Lizenz immer „U“ → Lizenzauswahl (z. B. CC BY-SA 4.0) anbieten.

---

## 6. Verbesserungsvorschläge zum Code

### 6.1 Architektur: Typ-Registry statt verteilter `if`-Ketten
Heute ist jeder Typ an 6–8 Stellen verankert (Radio-HTML, `TEMPLATE_TYPES`, `typeToId`, `updateUI`, zwei Listen in
`generatePrompt`, `mapToH5PStructure`, `libPatches`). Vorschlag – ein Objekt pro Typ:

```js
const CONTENT_TYPES = {
  'True False': {
    id: 'tf', icon: 'fa-scale-balanced', machineName: 'H5P.TrueFalse',
    template: WP_BASE + 'true-false-question-34806.h5p',
    options: ['feedback', 'testMode'],                  // welche UI-Blöcke sichtbar sind
    schema: { question: 'string', correct: ['true', 'false'], feedback: 'string?' },
    prompt: ctx => [...],                                // nur typ-spezifischer Teil
    map: (data, ctx) => ({ question: html(data.question), correct: String(data.correct),
      behaviour: { ...ctx.behaviour, feedbackOnCorrect: data.feedback, feedbackOnWrong: data.feedback } }),
  },
  // …
};
```
Vorteile: neue Typen = ein Eintrag; `schema` dient zugleich Prompt-Beschreibung **und** Validierung im Export.

### 6.2 Robuster Export
- **JSON-Extraktion:** ersten ```json-Block bzw. erstes balanciertes `{…}` nehmen, dann parsen.
- **Schema-Prüfung** nach dem Parsen mit verständlichen Meldungen („Frage 3: ‚correct‘ muss "true"/"false" sein“).
- **Korrektur-Prompt-Button:** Fehlerliste + Bitte um korrigiertes JSON in die Zwischenablage → schließt den Kreis zur KI.
- **Vorschau** der erkannten Inhalte (Anzahl Fragen, erste Frage) vor dem Download.
- **Template-Merge** (siehe Fehler 12) und **Versionen aus Template** (Fehler 4).

### 6.3 Bedienung
- Prompt zusätzlich in einem editierbaren Textfeld anzeigen (das CSS `.preview-box` existiert bereits).
- Formularzustand in `localStorage` merken; „Vorlagen“ (Presets) für wiederkehrende Einstellungen.
- Direktlinks „In ChatGPT/Claude/Gemini öffnen“ mit vorausgefülltem Prompt, wo der Anbieter das per URL unterstützt.
- Optional: API-Modus (eigener Schlüssel bzw. schulische Instanz wie telli), der Prompt → JSON → .h5p in einem Schritt erledigt.

### 6.4 Barrierefreiheit des Wizards
- Typ-Kacheln: `input { display:none }` (Z. 72) macht die Radios **unerreichbar per Tastatur** → visuell verstecken
  (`.sr-only`-Muster) statt `display:none`.
- Fach-Auswahl (Custom Select): keine ARIA-Rollen (`listbox`/`option`), keine Pfeiltasten → natives `<select>` mit
  `<optgroup>` genügt.
- Fortschrittsschritte als `<button>`; Hilfe-Dialog als `<dialog>` (Esc, Fokusfalle); Drag-&-Drop der Page-Bausteine
  zusätzlich mit Hoch/Runter-Buttons.
- Kontrast: Hinweistexte `#94a3b8` auf Weiß ≈ 2,6:1 (WCAG verlangt 4,5:1).

### 6.5 Datenschutz / Sicherheit
- Externe Abrufe (cdnjs, ws-lab.de) offenlegen oder alles in die Datei einbetten → offline-fähig, DSGVO-freundlich.
- `<script>`-Ressourcen mit `integrity` + `crossorigin`.
- Hinweis im Prompt-Schritt: keine personenbezogenen Schülerdaten in KI-Prompts.

---

## 7. Weitere Inhaltstypen

Bewertet nach: Kann eine KI den Inhalt rein textbasiert erzeugen? Unterrichtsnutzen? Aufwand im Wizard?

| Inhaltstyp | Bibliothek (Stand) | KI-geeignet | Nutzen | Aufwand | Empfehlung |
|---|---|:-:|:-:|:-:|---|
| **Essay** (Freitext mit Schlüsselwörtern, Musterlösung) | H5P.Essay 1.5/1.6 | ★★★ | ★★★ | gering – Kachel existiert bereits (per CSS versteckt), Mapping + Template fehlen | **sofort** |
| **Find the Words** (Suchsel) | H5P.FindTheWords 1.4 | ★★★ | ★★ | sehr gering (nur Wortliste) | **sofort** |
| **Interactive Book** (Kapitel aus Page-Bausteinen) | H5P.InteractiveBook 1.15 | ★★★ | ★★★ | mittel – Page-Mapping wiederverwendbar | **hoch** |
| **Page erweitern** um Drag/Mark the Words, Dialog Cards, Accordion, Guess the Answer, Table, Essay | Column 1.22 erlaubt all diese | ★★★ | ★★★ | gering je Baustein | **hoch** |
| **Question Set erweitern** um Essay | QuestionSet erlaubt H5P.Essay | ★★★ | ★★ | gering | hoch |
| **Interactive Video erweitern** (Blanks, Drag Text, SCS, Summary, Text-Einblendungen, Lesezeichen, Abschluss-Summary) | IV 1.28 | ★★★ | ★★★ | mittel | hoch |
| **Branching Scenario** (Fallbeispiele, Dilemmata – Ethik, Gemeinschaftskunde, Berufliche Schule) | H5P.BranchingScenario 1.11 | ★★☆ | ★★★ | hoch (Graph-Struktur) | mittel |
| **Structure Strip** (Schreibgerüst: Einleitung/Hauptteil/Schluss mit Hinweisen) | H5P.StructureStrip 1.0/1.1 | ★★★ | ★★ (Deutsch, Fremdsprachen) | gering | mittel |
| **Documentation Tool / Questionnaire** (Reflexion, Lerntagebuch, Exit-Ticket) | 1.8 / 1.3 | ★★★ | ★★ | gering | mittel |
| **Dictation** (Diktat) | H5P.Dictation 1.3/1.4 | ★☆☆ (braucht Audio) | ★★★ (Sprachen, DaZ) | mittel – Audio per TTS im Browser erzeugbar | später |
| **Memory Game** | H5P.MemoryGame 1.3 | ★☆☆ (braucht Bilder) | ★★ | mittel – Bild-Upload existiert schon | später |
| **Chart** (Diagramm aus Daten) | H5P.Chart 1.2 | ★★☆ | ★ | gering | optional |
| **Course Presentation** | 1.27 | ★☆☆ (Layout/Koordinaten) | ★★ | hoch | eher nicht |
| Image Hotspots, Drag and Drop, Image Pairing/Sequencing, Speak the Words | – | ✗ (Bild-/Koordinatenarbeit bzw. nur Chrome) | – | – | nicht sinnvoll |

---

## 8. Verbesserung der Prompts

### 8.1 Gefundene Schwächen
1. **Fehlender Kontext** bei Accordion, Crossword, Timeline, Interactive Video (s. o.).
2. **Reihenfolge:** Die Anweisung der Lehrkraft steht ganz am Ende („### 6. ANWEISUNG“). Modelle gewichten den
   Anfang stärker → Auftrag nach oben, Format nach unten.
3. **Widersprüche:** „KEIN MARKDOWN IM JSON“ vs. Lücken-Syntax `*Wort*`; „Zweischrittiger Ansatz – nenne zunächst
   Fehlvorstellungen“ vs. „Nur JSON, kein Text davor/danach“; Testmodus „kein Feedback“ vs. „Feedback-Pflicht“.
4. **Quellentreue fehlt:** Bei eingefügtem Basistext gibt es keine Regel, *nur* daraus belegbare Inhalte zu verwenden →
   Halluzinationsrisiko.
5. **Grammatik:** „an der Gymnasium“, „an der Berufliche Schule“ – Artikel je Schulart hinterlegen.
6. **Typen ohne Didaktik:** Dialog Cards/Flashcards (Kartenlänge, eine Information pro Karte), Summary (Qualität der
   Falschaussagen fehlt außerhalb von Page), Crossword (Hinweis darf Lösungswort nicht enthalten, keine Leerzeichen,
   Wortlänge), Guess the Answer (Impuls statt Faktenfrage), Timeline (Datumsformat `YYYY` / `YYYY,MM,DD`, v. Chr. als negative Zahl).
7. **Bloom ↔ deutsche Praxis:** Lehrkräfte in BW arbeiten mit **Anforderungsbereichen I–III und Operatoren**
   (nennen, beschreiben, erklären, beurteilen …). Bloom-Stufen „Bewerten/Erschaffen“ fehlen ganz.
8. **Positions-/Längen-Bias:** keine Regel, dass alle Optionen ähnlich lang und gleich präzise sind (Modelle machen die
   richtige Antwort oft länger). True/False ohne Vorgabe zum Verhältnis wahr/falsch (außer Page).
9. **Sprache:** „Schüler“ → „Schülerinnen und Schüler“; diverse Namen/Beispiele; Feedback in Zielsprache.

### 8.2 Neuer Prompt-Aufbau (Beispiel Accordion, gekürzt)

```text
# ROLLE
Du bist erfahrene Lehrkraft für Biologie am Gymnasium (Baden-Württemberg, Bildungsplan 2016) und erstellst
Material für Klasse 8.

# AUFTRAG
Thema: Photosynthese
Anweisung der Lehrkraft: Erkläre die Teilschritte so, dass die Klasse sie selbstständig nachlesen kann.

# QUELLE
"""…Basistext…"""
Verwende ausschließlich Inhalte, die sich aus der Quelle belegen lassen. Erfinde keine Zahlen oder Zitate.

# DIDAKTIK
- Anforderungsbereich I–II (Operatoren: nennen, beschreiben, erklären)
- Sprache: komplexere Strukturen erlaubt; Fachbegriffe beim ersten Auftreten kurz erklären
- Schülersichtbare Texte auf Deutsch, geschlechtergerecht

# AUSGABEFORMAT (verbindlich)
{"panels":[{"title":"string, max. 8 Wörter","text":"string, 60–120 Wörter, Absätze mit \n"}]}
- genau 5 Einträge in "panels"
- kein HTML, keine Markdown-Formatierung
✅ {"panels":[{"title":"Was ist Photosynthese?","text":"Pflanzen …"}]}

# SELBSTPRÜFUNG (still, nicht ausgeben)
- Jeder Abschnitt behandelt genau einen Aspekt, keine Wiederholungen
- Alle Fakten durch die Quelle gedeckt

Antworte ausschließlich mit einem einzigen ```json-Codeblock.
```

### 8.3 Weitere Prompt-Ideen
- **Lösungsplanung als JSON-Feld:** `"_planung": {"fehlvorstellungen": [...]}` statt sichtbarem Zwischentext; der Packer
  ignoriert `_`-Felder → Distraktor-Qualität bleibt, JSON bleibt sauber.
- **Differenzierung in einem Durchgang:** Option „3 Niveaus“ (Basis/Standard/Experte) → drei Pakete oder ein Question Set
  mit Pool (`poolSize`).
- **Leitperspektiven BW** (BNE, BTV, PG, BO, MB, VB) optional als Kontext-Dropdown.
- **Operatorenliste** statt bzw. neben Bloom; AFB-Verteilung vorgeben (z. B. 40/40/20).
- **Korrektur-Prompt** (siehe 6.2).
- Prompts typbezogen kürzen: Regeln, die für den Typ irrelevant sind, weglassen (spart Tokens, erhöht Treffsicherheit
  kleinerer Modelle wie in telli/fobizz).

Die vollständigen Leitlinien stehen in `.claude/skills/h5p-wizard-dev/references/prompt-guidelines.md`.

---

## 9. Skill und Agenten

Neu im Repo:

```
.claude/
├── agents/
│   ├── h5p-library-scout.md         – recherchiert Versionen + semantics.json (nur lesend)
│   ├── h5p-prompt-engineer.md       – überarbeitet Prompts, liefert Beispiel-JSON
│   ├── h5p-content-type-builder.md  – implementiert Typen/Fixes in der HTML-Datei
│   └── h5p-qa-tester.md             – E2E-Test + Paket-Validierung, Regressionstests
└── skills/h5p-wizard-dev/
    ├── SKILL.md                     – Regeln + Workflows A–D (wer wann, was parallel)
    ├── references/
    │   ├── libraries.json           – Machine-Name → Repo, geprüfte Versionen
    │   ├── content-type-checklist.md
    │   └── prompt-guidelines.md
    └── scripts/
        ├── fetch-semantics.sh       – Versionen/Semantik von GitHub
        ├── validate-h5p.py          – .h5p gegen Spezifikation + Semantik prüfen
        └── e2e-harness.mjs          – Headless-Test aller Prompts + Export-Fälle
```

Verwendung in Claude Code: `/h5p-wizard-dev` bzw. Aufträge wie „Ergänze Find the Words“ oder „Teste den Wizard“.
Die bekannten Fehler sind im Harness als `known` markiert; nach einem Fix wird `known` entfernt, damit der Fall
künftig als Regression zählt.

`validate-h5p.py` lässt sich auch unabhängig nutzen, z. B. um die echten Templates von ws-lab.de oder fertige
Exporte zu prüfen:

```bash
.claude/skills/h5p-wizard-dev/scripts/fetch-semantics.sh /tmp/sem
python3 .claude/skills/h5p-wizard-dev/scripts/validate-h5p.py mein-export.h5p --semantics-dir /tmp/sem
```

---

## 10. Vorgeschlagene Reihenfolge

| Phase | Inhalt | Aufwand |
|---|---|---|
| **v0.9.7 – Bugfix** | Fehler 1–10 (Prompts mit Kontext, MC-Mehrfachfragen, sanitizeJSON, Versionen aus Template, TF/Timeline/Complex-Blanks/Sort-Mapping, Mengenfelder) | 1–2 Tage |
| **v0.10 – Robustheit** | Template-Merge (deutsche Labels), HTML-Escaping, Schema-Validierung + Korrektur-Prompt, Template-Cache-Update, JS-Bibliotheken pinnen/ersetzen, Tastaturbedienung | 2–3 Tage |
| **v0.11 – Neue Typen** | Essay, Find the Words, Page-Bausteine erweitern, Question Set + Essay | 2 Tage |
| **v1.0 – Ausbau** | Typ-Registry-Refactoring, Interactive Book, erweitertes Interactive Video, überarbeitete Prompts (AFB/Operatoren) | 1 Woche |
| später | Branching Scenario, Structure Strip, Dictation (TTS), Memory | – |

---

## Quellen

- [H5P Guides – Spezifikation](https://h5p.org/documentation/developers/h5p-specification)
- [H5P – Package Definition (h5p.json)](https://h5p.org/node/599)
- [H5P – Best practice](https://h5p.org/node/584)
- [H5P – Content Type Development](https://h5p.org/node/2691)
- [H5P – Rolle von preloadedDependencies](https://h5p.org/node/27379)
- [H5P – Hello world / Paket manuell erstellen](https://h5p.org/node/2896)
- [h5p-php-library (H5P-Core, Validierung)](https://github.com/h5p/h5p-php-library/blob/master/h5p.classes.php)
- GitHub-Repos der Bibliotheken: siehe `.claude/skills/h5p-wizard-dev/references/libraries.json`
- [H5P Smart Import (H5P.com, KI-Erzeugung)](https://help.h5p.com/hc/en-us/articles/11700800414237-Smart-Import-Step-by-Step-Tutorial)
- [Font Awesome – Versionen](https://endoflife.date/font-awesome)
- npm-Registry: jszip 3.10.2, file-saver 2.0.5, @fortawesome/fontawesome-free 7.3.1 (abgerufen 16.10.2026)
