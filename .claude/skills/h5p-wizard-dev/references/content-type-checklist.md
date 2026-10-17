# Checkliste: neuen Inhaltstyp im Wizard ergänzen

Stand der Code-Struktur: V.1.0 (alles in einer HTML-Datei, Typ-Registry `CONTENT_TYPES`).

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
- [ ] `CONTENT_TYPES`-Eintrag: `value`, `id` (Kachel `t-<id>`), `label` (mit `<br>`), `icon`, `machine`, `defaultUrl` (leer = nur eingebaute Vorlage), `opts` (IDs der sichtbaren Optionen-Panels), ggf. `count` {label, unit} und `hints` – Kachel, `typeToId`, `COUNT_FIELDS` und Ein-/Ausblenden entstehen daraus
- [ ] Optionen-Panel `#opts-…` im HTML (mit `label for=…`, Farben nur als `var(--…)`)
- [ ] Bibliothek in `scripts/build-builtin-templates.py` (`MACHINES`) ergänzen und eingebaute Vorlagen neu erzeugen
- [ ] Mengenfelder: nur eigene, sichtbare Felder auswerten – keine versteckten Felder (`#question-count`) mitlesen
- [ ] `promptSpec()`: eigener `case` (what, amount, schema, didactics, example, wrong, checks) – Rolle, Auftrag, Quelle, Didaktik und Ausgabe ergänzt `generatePrompt()` automatisch; das `example` muss packbar sein
- [ ] `validateData()`: eigener `case` mit Fehlern (sperren) und Hinweisen; ggf. `AFB_ITEM_TYPES` ergänzen
- [ ] `mapToH5PStructure()`: eigener Zweig; Versionen über `findLib()`; HTML-Felder escapen; `subContentId` per `crypto.randomUUID()`
- [ ] falls Sub-Content: `library`-String muss in den `options` der Eltern-Semantik stehen
- [ ] `libPatches` **nicht** erweitern – Version aus Template übernehmen
- [ ] Hilfe-Modal/Typ-Beschreibung aktualisieren

## 4. Test
- [ ] Prompt im Harness geprüft (Thema/Anweisung/Basistext enthalten)
- [ ] Packfall im Harness `CASES` ergänzt
- [ ] `validate-h5p.py` ohne ERROR
- [ ] manueller Upload-Test in Moodle (Lehrkraft-Rolle) – Nutzer bitten
