# DLens

Data Explorer für hierarchische und tabellarische Daten, gestaltet nach `Mokup.png` und `AGENTS.md`. Header und Seitentitel verwenden den Zusatz „Data Explorer“.

Das Tool heißt DLens. Vorhandene Einstellungen unter den bisherigen `tlens-`-Schlüsseln werden weiter eingelesen, solange noch kein entsprechender `dlens-`-Wert existiert. Jazz-Daten bleiben erhalten. Der bestehende Projektordner und historische Mockups werden nicht umbenannt.

## Starten

Node.js 22 verwenden.

```sh
npm install
npm run dev
```

Die Entwicklungsadresse wird im Terminal angezeigt (standardmäßig http://localhost:4321).

```sh
npm test
npm run build
npm run preview
```

## Funktionen

- JSON-/YAML-/CSV-/XML-Import (bis 5 MB), getrennte Tabellen je verschachteltem Array
- XML: wiederholte Elemente werden Tabellenzeilen, einfache Sammlungscontainer werden durchlaufen; auch einzelne Datensätze sind möglich. Verschachtelte Elemente bleiben erhalten, Attribute erhalten das Präfix `@`, direkter Text bei gemischten Inhalten den Schlüssel `#text`. Werte bleiben Text. Ungültiges XML und DTDs werden abgewiesen. Die Umwandlung dient der Datenanzeige; Kommentare, Verarbeitungsanweisungen und die Reihenfolge gemischter Text-/Elementinhalte werden nicht bewahrt.
- CSV-Defaults: erste Zeile als eindeutige Spaltenüberschriften; Komma, Semikolon oder Tabulator werden automatisch erkannt. Werte bleiben als Text erhalten, einschließlich führender Nullen. Anführungszeichen und mehrzeilige Felder werden unterstützt. Unter Einstellungen → Datenquellen sind Trennzeichen (auch Pipe), Textbegrenzungszeichen und Kopfzeile konfigurierbar; ohne Kopfzeile entstehen Column1, Column2 usw. Einstellungen gelten ab dem nächsten Import und lassen sich zurücksetzen.
- Suche über alle Werte, kombinierbare Spaltenfilter, Sortierung und Spaltenauswahl
- Gespeicherte Ansichten mit optionalen Filtern und Standardansicht
- Zeitstrahl mit Tagesauswahl und aktueller Zeit; Beginn auf die volle Stunde abgerundet, Ende auf die volle Stunde aufgerundet, ohne zusätzlichen Stundenabstand
- Deutsche/englische Oberfläche, Hell-/Dunkelmodus, responsive Darstellung
- Export der gefilterten Tabellen als JSON
- CSV-Export über den CSV-Button jeder Tabelle: gefilterte Zeilen, sichtbare Spalten und aktuelle Sortierung. Ohne sichtbare Spalten ist der Export deaktiviert. Verschachtelte Zellwerte werden als JSON-Text exportiert. Die CSV-Einstellungen gelten auch beim Export; „Automatisch“ verwendet Komma. Dateien enthalten UTF-8 BOM und CRLF-Zeilenenden. Sind Textbegrenzungszeichen deaktiviert, erfordern Werte mit Trennzeichen oder Zeilenumbrüchen deren Aktivierung.
- Echter lokaler Jazz-Speicher: In Einstellungen aktuelle Datei übernehmen, anschließend unter Datenbanken auswählen

## Bedienung und Einstellungen

Bei Anzeige des heutigen Tages markiert ein kleiner roter Pfeil mit senkrechter Linie die aktuelle Uhrzeit, sofern sie im angezeigten Zeitbereich liegt. Die Linie verläuft hinter den Datenbalken und reicht etwas unter die Datenzeilen; die Balken bleiben anklickbar.

Beim Laden, erneuten Importieren oder Wechseln einer Quelle wird der Zeitstrahl automatisch eingeblendet, wenn mindestens ein Datensatz ein gültiges Datum (`Date`) und gültige zugeordnete Start-/Endzeiten enthält. Andernfalls wird er ausgeblendet. Diese Erkennung überschreibt beim Laden die bisherige Sichtbarkeit; anschließend bleibt der manuelle Schalter nutzbar. Suche und Filter setzen ihn nicht zurück.

Auch das Feld „Dein Workspace ist leer“ akzeptiert Drag & Drop, solange keine Quelle ausgewählt ist. Es wird beim Darüberziehen hervorgehoben und verwendet dieselbe Formatprüfung wie die Datenquellenauswahl.

Eine Datei lässt sich direkt auf die Datenquellenauswahl ziehen; das Ziel wird beim Darüberziehen hervorgehoben. Unterstützt werden ausschließlich `.json`, `.yaml`, `.yml`, `.csv` und `.xml`, unabhängig von Groß-/Kleinschreibung. Andere Formate werden auch bei der normalen Dateiauswahl mit einem Hinweis abgewiesen. Bitte jeweils eine Datei ablegen; fehlgeschlagene Importe lassen die bisherige Quelle unverändert.

- Filter suchen auch in verschachtelten Objekten und Arrays: Eine PersonID im Personal eines Events findet das zugehörige Event. Die Feldauswahl ist aufsteigend sortiert; vorhandene Werte werden eindeutig und absteigend angeboten. Freie Eingabe bleibt möglich, ohne Beispiel-Platzhalter. Beim Feldwechsel wird der Eingabewert geleert.
- Jede Tabelle wird unabhängig sortiert: aufsteigend → absteigend → unsortiert. Der aktive Richtungspfeil ist orange; unsortiert stellt die ursprüngliche Reihenfolge wieder her und ist der Startzustand.
- Das kompakte Suchfeld-Löschsymbol erscheint nur bei vorhandener Eingabe. Bei leerer Suche wird kein Ersatzsymbol angezeigt.
- **Allgemein:** Sprache.
- **Anzeige:** Zeitstrahl ein/aus (Default an), Start-/Endzeit-Felder und Einfärbung nach einer gewählten Spalte (Default Area). Gleiche Werte erhalten im Zeitstrahl und in der sichtbaren gewählten Spalte dieselbe Farbe. Die Legende folgt dem angezeigten Tag; fehlende Werte bleiben neutral.
- **Datenquellen:** CSV-Format und Jazz-Konfiguration.

CSV-Format, Zeitstrahl-Sichtbarkeit und Farbspalte werden im Browser gespeichert. Zeitfeld-Zuordnungen gelten pro Quelle und bleiben beim Wechsel zwischen geladenen Quellen erhalten; beim erneuten Dateiimport wird neu erkannt.

Bei künftigen Änderungen werden README.md (Bedienung und Implementierungsstand) und AGENTS.md (Anforderungen und Entwicklungsregeln) gemeinsam gepflegt.

Die App startet ohne ausgewählte Datenquelle und ohne automatisch geladene Demo-Daten. Neue Jazz-Konten werden leer angelegt. Bereits gespeicherte Jazz-Daten bleiben erhalten und werden nur nach expliziter Quellenauswahl angezeigt. Dateiimporte bleiben für die Sitzung verfügbar. Ansichten, Sprache und Theme werden im Browser gespeichert. In Jazz übernommene Daten bleiben über IndexedDB erhalten. Der Prototyp nutzt ein anonymes lokales Jazz-Konto ohne Netzwerk-Sync; Anmeldung, Gerätewechsel und produktive Sync-Konfiguration sind noch offen. SQLite, MariaDB und PostgreSQL sind gekennzeichnete zukünftige Adapter und noch nicht angeschlossen. Datenbankzugangsdaten dürfen später ausschließlich serverseitig verarbeitet werden.

## Festival-Datensatz

Die zusätzliche [Version mit Tag 2 am 8. September 2026](public/demo/weitklang-festival-tag2-2026-09-08.json) verschiebt ausschließlich die Datumsangaben auf Aufbau 6. September, Festivaltage 7.–10. September und Abbau 11. September 2026. Namen, IDs und alle übrigen Inhalte bleiben unverändert. Diese feste Datumsvariante kann über Dateiimport oder Drag & Drop geladen werden; sie passt sich nicht automatisch an spätere Tage an.

[weitklang-festival-2027.json](public/demo/weitklang-festival-2027.json) ist ein separat ladbarer, vollständig fiktiver Datensatz:

- 16. Juni 2027: Aufbautag (11 Events)
- 17.–20. Juni 2027: vier Festivaltage (48 Events, davon acht Auftritte auf zwei Bühnen)
- 21. Juni 2027: Abbautag (8 Events)
- Sechs Logistikmitarbeitende, zehn Technikmitarbeitende, acht Bands mit insgesamt 32 Musikern
- Inventar für Logistik, Stromversorgung, Bühnen, Ton, Licht, Rigging und vollständige Instrumenten-/Backline-Sets der Bands
- Eventdatensätze mit Verantwortlichen, vollständigen zugeordneten Personen und Equipment-Objekten, Arbeitsschritten mit IDs und Event-Abhängigkeiten

Über **Festival-Datensatz laden** im leeren Workspace oder in der Quellenauswahl öffnen. Alternativ die JSON-Datei herunterladen und über den Dateiimport laden. Es wird nichts automatisch beim Start geladen. Die Daten sind mit `node scripts/generate-festival.mjs` reproduzierbar. Die IDs der katalogisierten Ressourcen bleiben auch in den eingebetteten Eventdaten erhalten.

## Stack und Deployment

Astro 5 (Vite), React 19, TanStack Router, Tailwind CSS 4, Base UI Dialog und Heroicons Outline. Die Oberfläche verwendet eigene abgerundete Komponenten im Stil des Mockups; ein vollständiges shadcn/base-lyra-Komponentenset ist nicht installiert. Die Jazz-Integration folgt der lokalen Alkalye-Referenz und verwendet die korrigierte Version 0.20.19. Keine externen Schrift- oder Bilddienste.

Für Vercel das GitHub-Repository importieren: Framework `Astro`, Build `npm run build`, Ausgabeverzeichnis `dist`. `vercel.json` enthält diese Einstellungen. Keine Umgebungsvariablen nötig. Ein Deployment wurde nicht durchgeführt.

## Prüfstand

21 automatisierte Tests decken Import einschließlich CSV-Formatoptionen und fehlerhafter CSV-Daten, CSV-Export mit Spaltenauswahl und Maskierung, rekursive Filter und Wertvorschläge, exakte Event-ID-Filter, Zeitfelderkennung, automatische Zeitstrahl-Sichtbarkeit und manuelle Zuordnung, Tagesauswahl, ungültige Datums-/Zeitwerte, den Festivalplan samt Abhängigkeiten, hierarchische Detaildarstellung sowie Anlage und Schreiben eines leeren Jazz-Kontos ab. Die letzte Ausführung und der Produktions-Build waren erfolgreich. Eine interaktive Browserprüfung war in der Entwicklungsumgebung nicht möglich, weil kein Browser verbunden war.

`npm audit` meldet nach dem Jazz-Update noch drei betroffene Pakete (Astro, esbuild, sharp; zwei hoch, eines niedrig). Die angebotene vollständige Korrektur erfordert einen Wechsel auf eine neuere Astro-Hauptversion. Astro 5 bleibt entsprechend der Projektvorgabe erhalten. Die Demo wird statisch gebaut, verwendet keine Server Islands, dynamischen Astro-Attribute oder Bildverarbeitung. Vor produktivem Einsatz den Framework-Wechsel und die Meldungen erneut prüfen. Der Jazz-Client erzeugt außerdem ein großes JavaScript-Bundle; der Build weist darauf hin.

## Importformat

XML-Beispiel: `<Events><Event><EventID>001</EventID><Date>2027-06-17</Date><Start>09:00</Start><End>10:00</End></Event></Events>`. Daraus entsteht eine Event-Tabelle mit den entsprechenden Spalten. Attribute wie `id="001"` erscheinen dagegen als `@id`. Der XML-Importer wurde zusätzlich mit lokalem Headless-Chrome auf einzelne und wiederholte Datensätze, verschachtelte Personen, Attribute, Entities, CDATA und fehlerhafte Dokumente geprüft.

Arrays aus Objekten werden als Tabellen interpretiert. Der Zeitstrahl verwendet `Date` (YYYY-MM-DD) und die in den Einstellungen gewählten Start-/Endzeit-Felder (HH:mm). Übliche Namen wie `Start`, `start_time`, `Startzeit`, `Beginn`, `beginning`, `End`, `Endzeit`, `Ende`, `stop` und `finish` werden automatisch erkannt, unabhängig von Groß-/Kleinschreibung sowie Leerzeichen, Unterstrichen und Bindestrichen. Ohne Treffer bleibt die jeweilige Zuordnung leer und muss manuell vorgenommen werden. `Start` und `End` bleiben gültige Standardnamen. Beliebige weitere Felder sind suchbar und als Spalten auswählbar. Verschachtelte Objekte und Arrays bleiben unverändert erhalten. Die Tabelle zeigt zunächst skalare Spalten; weitere Felder lassen sich über Anzeige einblenden. Ein Klick auf eine Tabellenzeile (oder Enter/Leertaste) öffnet den vollständigen Datensatz als aufklappbare Hierarchie, unabhängig von sichtbaren Spalten. Hat die Zeile eine EventID, wird zusätzlich ein exakter EventID-Filter gesetzt. Auch ein Klick auf den Zeitstrahl setzt diesen Filter; der Suchtext bleibt unverändert. Ein bestehender EventID-Filter wird ersetzt, andere Filter bleiben erhalten. Beispiel:

```json
{
  "Events": {
    "Main Stage": [
      {
        "EventID": "Opening",
        "Date": "2026-09-07",
        "Start": "18:00",
        "End": "19:00",
        "Area": "Stage 1"
      }
    ]
  }
}
```

## Lizenzen

Projekt: MIT (siehe LICENSE). Heroicons: MIT. Die verwendeten Open-Source-Pakete behalten ihre jeweiligen Lizenzen; npm installiert die zugehörigen Lizenzdateien. Keine Stockbilder oder proprietären Designressourcen.
