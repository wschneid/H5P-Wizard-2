# Checkliste: neuen Inhaltstyp im Wizard ergänzen

Stand der Code-Struktur: v0.9.6 (alles in einer HTML-Datei). Wird die empfohlene Typ-Registry
(siehe `docs/ANALYSE.md`, Abschnitt Architektur) umgesetzt, schrumpft diese Liste auf einen Registry-Eintrag.

## 1. Recherche (Ergebnis von h5p-library-scout)
- [ ] Machine-Name, aktuelle Major.Minor (Hub/release **und** master), Repo
- [ ] Pflichtfelder (nicht `optional`, ohne `default`) inkl. HTML-/Text-Widget je Feld
- [ ] Sub-Libraries (Feldtyp `library`) mit erlaubten `options`
- [ ] select-Felder mit erlaubten Werten
- [ ] Felder für Bilder/Medien und Alt-Texte
- [ ] l10n-/Label-Felder (für deutsche Oberfläche)

## 2. Template
- [ ] Beispielinhalt im H5P-Editor (WordPress/Moodle) mit **deutschen Labels** anlegen und als .h5p exportieren
- [ ] auf ws-lab.de hochladen, URL notieren
- [ ] Versionen im Template mit Recherche abgleichen

## 3. Code (HTML-Datei)
- [ ] Radio-Button in `#typeGrid` (eindeutige `id="t-…"`, Font-Awesome-Icon, `tpl-badge`)
- [ ] `TEMPLATE_TYPES`-Eintrag (`value`, `file`, `icon`, `label`, `defaultUrl`)
- [ ] `typeToId`-Eintrag
- [ ] Optionen-Panel `#opts-…` im HTML + Ein-/Ausblenden in `updateUI()` (Liste der zu versteckenden IDs ergänzen!)
- [ ] Mengenfelder: nur eigene, sichtbare Felder auswerten – keine versteckten Felder (`#question-count`) mitlesen
- [ ] `generatePrompt()`: eigener Abschnitt **mit** Thema, Basistext, Anweisung, Didaktik-Block (nicht früh `return`en ohne diese)
- [ ] `mapToH5PStructure()`: eigener Zweig; Versionen über `findLib()`; HTML-Felder escapen; `subContentId` per `crypto.randomUUID()`
- [ ] falls Sub-Content: `library`-String muss in den `options` der Eltern-Semantik stehen
- [ ] `libPatches` **nicht** erweitern – Version aus Template übernehmen
- [ ] Hilfe-Modal/Typ-Beschreibung aktualisieren

## 4. Test
- [ ] Prompt im Harness geprüft (Thema/Anweisung/Basistext enthalten)
- [ ] Packfall im Harness `CASES` ergänzt
- [ ] `validate-h5p.py` ohne ERROR
- [ ] manueller Upload-Test auf der Zielplattform (WordPress H5P-Plugin / Moodle) – Nutzer bitten
