# TLens

Bedienbarer Eventdaten-Prototyp nach `Mokup.png` und `AGENTS.md`.

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

- JSON-/YAML-Import (bis 5 MB), getrennte Tabellen je verschachteltem Array
- Suche über alle Werte, kombinierbare Spaltenfilter, Sortierung und Spaltenauswahl
- Gespeicherte Ansichten mit optionalen Filtern und Standardansicht
- Zeitstrahl mit Tagesauswahl, automatischem Bereich ± 1 Stunde und aktueller Zeit
- Deutsche/englische Oberfläche, Hell-/Dunkelmodus, responsive Darstellung
- Export der gefilterten Tabellen als JSON
- Echter lokaler Jazz-Speicher: In Einstellungen aktuelle Datei übernehmen, anschließend unter Datenbanken auswählen

Die App startet ohne ausgewählte Datenquelle und ohne automatisch geladene Demo-Daten. Neue Jazz-Konten werden leer angelegt. Bereits gespeicherte Jazz-Daten bleiben erhalten und werden nur nach expliziter Quellenauswahl angezeigt. Dateiimporte bleiben für die Sitzung verfügbar. Ansichten, Sprache und Theme werden im Browser gespeichert. In Jazz übernommene Daten bleiben über IndexedDB erhalten. Der Prototyp nutzt ein anonymes lokales Jazz-Konto ohne Netzwerk-Sync; Anmeldung, Gerätewechsel und produktive Sync-Konfiguration sind noch offen. SQLite, MariaDB und PostgreSQL sind gekennzeichnete zukünftige Adapter und noch nicht angeschlossen. Datenbankzugangsdaten dürfen später ausschließlich serverseitig verarbeitet werden.

## Festival-Datensatz

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

Zehn automatisierte Tests decken Import, kombinierte und exakte Event-ID-Filter, Tagesauswahl, ungültige Datums-/Zeitwerte, den Festivalplan samt Abhängigkeiten, hierarchische Detaildarstellung sowie Anlage und Schreiben eines leeren Jazz-Kontos ab. Eine interaktive Browserprüfung war in der Entwicklungsumgebung nicht möglich, weil kein Browser verbunden war.

`npm audit` meldet nach dem Jazz-Update noch drei betroffene Pakete (Astro, esbuild, sharp; zwei hoch, eines niedrig). Die angebotene vollständige Korrektur erfordert einen Wechsel auf eine neuere Astro-Hauptversion. Astro 5 bleibt entsprechend der Projektvorgabe erhalten. Die Demo wird statisch gebaut, verwendet keine Server Islands, dynamischen Astro-Attribute oder Bildverarbeitung. Vor produktivem Einsatz den Framework-Wechsel und die Meldungen erneut prüfen. Der Jazz-Client erzeugt außerdem ein großes JavaScript-Bundle; der Build weist darauf hin.

## Importformat

Arrays aus Objekten werden als Tabellen interpretiert. Für den Zeitstrahl heißen die Felder `Date` (YYYY-MM-DD), `Start` und `End` (HH:mm). Beliebige weitere Felder sind suchbar und als Spalten auswählbar. Verschachtelte Objekte und Arrays bleiben unverändert erhalten. Die Tabelle zeigt zunächst skalare Spalten; weitere Felder lassen sich über Anzeige einblenden. Ein Klick auf eine Tabellenzeile (oder Enter/Leertaste) öffnet den vollständigen Datensatz als aufklappbare Hierarchie, unabhängig von sichtbaren Spalten. Hat die Zeile eine EventID, wird zusätzlich ein exakter EventID-Filter gesetzt. Auch ein Klick auf den Zeitstrahl setzt diesen Filter; der Suchtext bleibt unverändert. Ein bestehender EventID-Filter wird ersetzt, andere Filter bleiben erhalten. Beispiel:

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
