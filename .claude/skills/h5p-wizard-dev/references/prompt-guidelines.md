# Leitlinien für die KI-Prompts des Wizards

Ziel: Ein Prompt, den jedes gängige Modell (ChatGPT, Gemini, Claude, telli, fobizz …) zuverlässig in
**parsebares JSON** und **didaktisch brauchbares Material** übersetzt.

## Aufbau (feste Reihenfolge)
1. **Rolle & Kontext** – Fachlehrkraft für {Fach}, {Schulart} (korrekter Artikel: „am Gymnasium“, „an der Realschule“),
   Klasse {n}, Bildungsplan Baden-Württemberg 2016 (Schularten deuten auf BW).
2. **Auftrag** – Thema + Anweisung der Lehrkraft **oben**, nicht erst am Ende.
3. **Quelle** – Basistext in `"""…"""`. Regel: *Wenn ein Basistext vorliegt, nur Inhalte verwenden, die sich daraus belegen lassen.*
4. **Didaktik** – Niveau, Anforderungsbereich (AFB I–III / Operatoren), Sprachniveau, Lernzieltyp, Feedback-Stil.
5. **Ausgabe-Vertrag** – JSON-Schema (Feldliste mit Typen, Pflicht/optional, exakte Anzahl), ein ✅-Beispiel, max. 3 ❌-Beispiele.
6. **Selbstprüfung** – kurze Checkliste, die das Modell *still* abarbeitet.
7. **Ausgabe** – „Antworte ausschließlich mit einem einzigen ```json-Codeblock.“

## Regeln
- **Keine Widersprüche**: „Kein Markdown im JSON“ ausdrücklich von der Lücken-Syntax `*Wort*` abgrenzen.
- **Kein sichtbares Chain-of-Thought** neben „nur JSON“. Wenn Zwischenschritte gewünscht sind (Fehlvorstellungen),
  als JSON-Feld `"_planung"` anfordern – der Packer ignoriert Felder mit `_`-Präfix.
- **Mengen nur aus sichtbaren, typeigenen Feldern**; Einzelaufgaben (True/False, Guess the Answer) ohne „Exakt N Fragen“
  – oder als Liste erzeugen und im Packer in ein Question Set/Column verpacken.
- **Zielsprache** für alle schülersichtbaren Texte inkl. Feedback; Anweisung an die KI bleibt deutsch.
- **Geschlechtergerechte, diskriminierungsfreie Sprache**, diverse Namen/Beispiele; „Schülerinnen und Schüler“.
- **Faktentreue**: keine erfundenen Zahlen/Zitate; bei Unsicherheit weglassen. Jahreszahlen/Fachbegriffe prüfen.
- **Positionsbias vermeiden**: Bei MC die richtige Antwort nicht immer zuerst (H5P mischt zwar, aber das KI-Modell
  formuliert sonst die richtige Antwort oft länger/präziser) – „Alle Optionen ähnlich lang und gleich präzise“.
- **True/False**: ausgewogenes Verhältnis wahr/falsch vorgeben (z. B. 40–60 %).
- **Barrierefreiheit**: kurze Sätze, keine Info nur über Farbe/Bild; Alt-Texte, wenn Bilder vorkommen.
- **Länge**: Prompt so kurz wie möglich; Regeln, die für den Typ irrelevant sind, weglassen.

## Korrektur-Schleife
Wenn `JSON.parse` oder die Schema-Prüfung im Export scheitert, soll der Wizard einen **Korrektur-Prompt**
erzeugen: „Dein JSON hat folgende Fehler: … Gib das vollständige, korrigierte JSON erneut aus.“
