# DLens

Data Explorer für hierarchische und tabellarische Daten, gestaltet nach `Mokup.png` und `.agents/AGENTS.md`. Header und Seitentitel verwenden den Zusatz „Data Explorer“.

Das Tool heißt DLens. Vorhandene Einstellungen unter den bisherigen `tlens-`-Schlüsseln werden weiter eingelesen, solange noch kein entsprechender `dlens-`-Wert existiert. Jazz-Daten bleiben erhalten. Der bestehende Projektordner und historische Mockups werden nicht umbenannt.

## Datenarchitektur

Der lokale Datenpfad verwendet jetzt SQLite WASM mit OPFS in einem Web Worker. XML, CSV und JSON werden inkrementell eingelesen; YAML bleibt auf 5 MB begrenzt. Tabellen, rekursive Suche und Filter laufen über Repositories, die Oberfläche lädt Seiten und Details bedarfsgerecht. [Architekturentscheidungen und Grenzen](docs/data-architecture-decisions.md), [Migrationsstand](docs/data-architecture-migration.md) und [Prüfprotokoll](docs/data-architecture-validation.md) beschreiben Umsetzung und verbleibende Freigaben.

## Entwicklung starten

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

- Streaming-Import von JSON, CSV und XML; XML mit einer echten 2,2-GB-Datei geprüft. YAML bis 5 MB. Tabellen je Datenpfad; verschachtelte Werte bleiben erhalten.
- XML: wiederholte Elemente werden Tabellenzeilen, einfache Sammlungscontainer werden durchlaufen; auch einzelne Datensätze sind möglich. Verschachtelte Elemente bleiben erhalten, Attribute erhalten das Präfix `@`, direkter Text bei gemischten Inhalten den Schlüssel `#text`. Werte bleiben Text. Ungültiges XML und DTDs werden abgewiesen. Die Umwandlung dient der Datenanzeige; Kommentare, Verarbeitungsanweisungen und die Reihenfolge gemischter Text-/Elementinhalte werden nicht bewahrt.
- CSV-Defaults: erste Zeile als eindeutige Spaltenüberschriften; Komma, Semikolon oder Tabulator werden automatisch erkannt. Werte bleiben als Text erhalten, einschließlich führender Nullen. Anführungszeichen und mehrzeilige Felder werden unterstützt. Unter Einstellungen → Datenquellen sind Trennzeichen (auch Pipe), Textbegrenzungszeichen und Kopfzeile konfigurierbar; ohne Kopfzeile entstehen Column1, Column2 usw. Einstellungen gelten ab dem nächsten Import und lassen sich zurücksetzen.
- Suche über alle Werte, kombinierbare Feldfilter, Sortierung und Feldauswahl
- Gespeicherte Ansichten mit optionalen Filtern und Standardansicht
- Zeitstrahl mit Tagesauswahl und aktueller Zeit; Beginn auf die volle Stunde abgerundet, Ende auf die volle Stunde aufgerundet, ohne zusätzlichen Stundenabstand
- Deutsche/englische Oberfläche, Hell-/Dunkelmodus mit Systemmodus (prefers-color-scheme), manuellem Vorrang, sofortiger theme-color-Aktualisierung und localStorage-Wiederherstellung; Manifest enthält eine helle theme_color als Fallback
- Export der gefilterten Tabellen als JSON
- CSV-Export über den CSV-Button jeder Tabelle: gefilterte Zeilen, sichtbare Spalten und aktuelle Sortierung. Ohne sichtbare Spalten ist der Export deaktiviert. Verschachtelte Zellwerte werden als JSON-Text exportiert. Die CSV-Einstellungen gelten auch beim Export; „Automatisch“ verwendet Komma. Dateien enthalten UTF-8 BOM und CRLF-Zeilenenden. Sind Textbegrenzungszeichen deaktiviert, erfordern Werte mit Trennzeichen oder Zeilenumbrüchen deren Aktivierung.
- Lokaler SQLite-/OPFS-Speicher mit Fortschritt, Abbruch und atomarem Reimport. Die Jazz-Bedienelemente sind vorerst ausgeblendet; bestehende Daten bleiben erhalten.

## Bedienung und Einstellungen

Bei Anzeige des heutigen Tages markiert ein kleiner roter Pfeil mit senkrechter Linie die aktuelle Uhrzeit, sofern sie im angezeigten Zeitbereich liegt. Die Linie verläuft hinter den Datenbalken und reicht etwas unter die Datenzeilen; die Balken bleiben anklickbar.

Beim Laden, erneuten Importieren oder Wechseln einer Quelle wird der Zeitstrahl automatisch eingeblendet, wenn mindestens ein Datensatz ein gültiges Datum (`Date`) und gültige zugeordnete Start-/Endzeiten enthält. Andernfalls wird er ausgeblendet. Diese Erkennung überschreibt beim Laden die bisherige Sichtbarkeit; anschließend bleibt der manuelle Schalter nutzbar. Suche und Filter setzen ihn nicht zurück.

Auch das Feld „Dein Workspace ist leer“ akzeptiert Drag & Drop, solange keine Quelle ausgewählt ist. Es wird beim Darüberziehen hervorgehoben und verwendet dieselbe Formatprüfung wie die Datenquellenauswahl.

Eine Datei lässt sich direkt auf die Datenquellenauswahl ziehen; das Ziel wird beim Darüberziehen hervorgehoben. Unterstützt werden ausschließlich `.json`, `.yaml`, `.yml`, `.csv` und `.xml`, unabhängig von Groß-/Kleinschreibung. Andere Formate werden auch bei der normalen Dateiauswahl mit einem Hinweis abgewiesen. Bitte jeweils eine Datei ablegen; fehlgeschlagene Importe lassen die bisherige Quelle unverändert.

- Filter suchen auch in verschachtelten Objekten und Arrays: Eine PersonID im Personal eines Events findet das zugehörige Event. Die Feldauswahl ist aufsteigend sortiert; vorhandene Werte werden eindeutig und absteigend angeboten. Feld- und Wertvorschläge stammen aus den Datensätzen, die zur aktuellen Suche und allen aktiven Filtern passen (vollständiges Ergebnis, nicht nur die sichtbare Seite); freie Eingabe bleibt möglich, ohne Beispiel-Platzhalter. Beim Feldwechsel wird der Eingabewert geleert.
- Jede Tabelle wird unabhängig sortiert: aufsteigend → absteigend → unsortiert. Der aktive Richtungspfeil ist orange; unsortiert stellt die ursprüngliche Reihenfolge wieder her und ist der Startzustand.
- Das kompakte Suchfeld-Löschsymbol erscheint nur bei vorhandener Eingabe. Bei leerer Suche wird kein Ersatzsymbol angezeigt.
- **Allgemein:** Sprache.
- **Anzeige:** Zeitstrahl ein/aus (Default an), Start-/Endzeit-Felder und Einfärbung nach einer gewählten Spalte (Default Area). Gleiche Werte erhalten im Zeitstrahl und in der sichtbaren gewählten Spalte dieselbe Farbe. Die Legende folgt dem angezeigten Tag; fehlende Werte bleiben neutral.
- **Datenquellen:** CSV-Format, gespeicherte Datenbankprofile (PostgreSQL/MariaDB über Connector-Backend, NDJSON direkt; nur Name/Typ/URL gespeichert, Tokens und DB-Zugangsdaten nie), Datei-URL-Import, „Lokaler Datenspeicher“ mit Status und Löschaktionen.

CSV-Format, Zeitstrahl-Sichtbarkeit und Farbspalte werden im Browser gespeichert. Zeitfeld-Zuordnungen gelten pro Quelle und bleiben beim Wechsel zwischen geladenen Quellen erhalten; beim erneuten Dateiimport wird neu erkannt.

Bei künftigen Änderungen werden README.md (Bedienung und Implementierungsstand) und .agents/AGENTS.md (Anforderungen und Entwicklungsregeln) gemeinsam gepflegt.

### Agentischer Entwicklungsworkflow

Root `AGENTS.md` verweist auf die zentralen Regeln in `.agents/AGENTS.md`.
Codex/Astra untersucht vor nicht-trivialen Aufgaben die relevanten Module, Patterns,
Tests, APIs und Typen und schreibt einen detaillierten [`.agents/PLAN.md`](.agents/PLAN.md).
Der Plan legt konkrete Dateien, Funktionen, Schnittstellen, Daten- und Kontrollflüsse,
Zustände, Fehler, Persistenz, verbotene Alternativen, Tests und Akzeptanzkriterien fest.
Eindeutigkeit und korrekte Architektur haben Vorrang vor kurzen Planungsprompts.

OpenCode/Muse Spark 1.3 Contributor implementiert diesen verbindlichen Plan,
behebt normale Compiler-/Typ-/Testfehler, führt die Prüfungen und einen vollständigen
Self-Review durch. Danach schreibt es den kompakten `.agents/IMPLEMENTATION_REPORT.md`:

- `SUCCESS`: alles umgesetzt und geprüft, keine offenen Blocker. Codex liest nur
  Status, Abweichungen und Blocker und meldet den Abschluss; kein automatischer
  zweiter Diff-Review, erneutes Lesen der Dateien oder Wiederholen der Tests.
- `PARTIAL`: Codex entscheidet anhand des Reports über gezielte Nacharbeit oder Neuplanung.
- `BLOCKED`: Codex untersucht nur den konkreten Blocker, ergänzt den Plan und delegiert erneut.

Fehlende Architekturentscheidungen darf Muse nicht selbst ersetzen. Ungeplante
Abstraktionen, API-Änderungen und angrenzende Refactorings sind nicht erlaubt.
Triviale Änderungen, Dokumentation und Workflow-Pflege erledigt Codex direkt.
Bestehende Änderungen bleiben erhalten; keine automatischen Stashes/Resets.

Vorlagen: [detaillierter Plan](.agents/skills/opencode-executor/references/plan-template.md)
und [kurzer Report](.agents/skills/opencode-executor/references/implementation-report-template.md).
Der [Executor-Skill](.agents/skills/opencode-executor/SKILL.md) beschreibt die Übergabe.
Root `PLAN.md` ist nur ein Verweis und wird nicht ausgeführt. Start nach abgeschlossener Planung:

```bash
bash .agents/skills/opencode-executor/scripts/execute-plan.sh
```

Das Script wechselt selbst ins Repository und funktioniert auch mit absolutem Pfad
von einem anderen Arbeitsverzeichnis. Es verwendet fest
`opencode/muse-spark-1.3-contributor-free`, Agent `build`, standardmäßig `--variant medium`:

```bash
opencode run --agent build --model "$model" --variant "$effort" "$prompt" </dev/null
```

Der kompakte Executor-Prompt verweist auf die Dateien, statt ihren Inhalt zu kopieren.
`--effort minimal|low|medium|high` folgt den zentralen Routing-Regeln; Abweichungen
von medium stehen im Plan. `--effort xhigh --allow-xhigh` erfordert eine ausdrückliche
Nutzeranweisung. Kein automatischer Modellwechsel, Retry oder pauschales Auto-Approval.

Vor jedem echten Lauf ersetzt das Script den alten Report durch einen ausstehenden
`BLOCKED`-Report. So kann ein alter Erfolg nicht einen abgebrochenen Lauf verdecken.
Ein neuer Report muss alle sieben Abschnitte enthalten. Ein `SUCCESS` mit gemeldeten
Abweichungen oder Blockern geht zur gezielten Einordnung an Codex zurück.

Sichere Setup-Prüfungen ohne Modellaufruf:

```bash
bash -n .agents/skills/opencode-executor/scripts/execute-plan.sh
bash .agents/skills/opencode-executor/scripts/test-executor.sh
bash .agents/skills/opencode-executor/scripts/execute-plan.sh --check
```

`--check` verlangt ein lesbares, nicht leeres `.agents/PLAN.md`, prüft lokale
Voraussetzungen und verändert den Report nicht. Der isolierte Test nutzt nur eine
CLI-Attrappe und prüft Pfade mit Leerzeichen, fremdes Arbeitsverzeichnis, feste
Modellwahl/Effort, Report-Status, veraltete/fehlende Reports und Fehlerweitergabe.
CLI-Fehlercodes werden unverändert weitergereicht. Nach CLI-Exit 0 gilt:
0 = sauberer SUCCESS, 2 = PARTIAL oder SUCCESS mit Abweichungen/Blockern,
3 = BLOCKED, 65 = fehlender/ungültiger Report. Vorprüfungen: 64 = Argumente,
66 = Dateien/Repository, 69 = CLI/Tool fehlt. Exit 0 ersetzt nicht das Lesen des Reports.

Die CLI-Schnittstelle wurde lokal mit OpenCode 1.18.30 eingerichtet: `run`,
`--model`, `--variant`, Positionsprompt und Agent `build`. Die Contributor-ID trägt
lokal den Anzeigenamen „Muse Spark 1.3 Free“. Normale Läufe wiederholen die
Modellsuche nicht. Setup-Tests beweisen weder Anmeldung noch Live-Verfügbarkeit;
der Executor erweitert keine Berechtigungen. Die Einsparung entsteht vor allem
nach der gründlichen Planung durch klare Umsetzung und den entfallenden Zweitreview.

Die App startet ohne ausgewählte Datenquelle und ohne automatisch geladene Demo-Daten. Neue Dateiimporte bleiben jetzt über Sitzungen hinweg in SQLite verfügbar; diese Änderung ersetzt die frühere Sitzungsaufbewahrung. Ein erneuter Import desselben Dateinamens aktiviert den neuen Stand erst nach vollständigem Erfolg. Fehler oder Abbruch erhalten den bisherigen Stand. Originaldateien werden nicht zusätzlich kopiert. Ein ausgewählter SQLite-Datensatz lässt sich in den Einstellungen löschen.

OPFS und Web Locks müssen im Browser verfügbar sein. Ein zentraler Worker hält die Datenbank exklusiv; ein zweiter Tab zeigt eine Sperrmeldung. Ohne OPFS erfolgt kein stiller Wechsel zu flüchtigem Speicher. Der Browser entscheidet über Speicherquota und die Gewährung dauerhafter Speicherung; die Einstellungen zeigen den Status und erlauben eine Persistenzanfrage.

Bestehende Jazz-Daten bleiben unangetastet. Jazz-Quellenauswahl, Konfiguration und Übernahme sind vorerst ausgeblendet; bereits nach SQLite übernommene Quellen bleiben nutzbar. Teilen, Anmeldung und geräteübergreifende Synchronisierung sind für später vorgesehen. Ansichten und kleine UI-Einstellungen bleiben mit `tlens-`-Fallback im Browser.

Tabellen laden bis zu 100 Zeilen und zeigen Gesamtzahlen sowie Navigation; bis zu 20 Tabellen erscheinen pro Seite. Große Detailbäume laden ihre Kinder beim Öffnen. Timeline und Wertvorschläge sind ebenfalls seitenweise zugänglich. Die CSV-Ausgabe enthält weiterhin alle gefilterten Zeilen der gewählten Tabelle, nicht nur die aktuelle Seite. Große Exporte schreiben inkrementell in den Dateispeicherdialog; ohne diese Browser-API gilt eine Exportgrenze von 20 MiB. Einzelwerte, Tiefe und projizierte Zeilen haben explizite [Ressourcengrenzen](docs/data-architecture-decisions.md).

## API- und Datenbankquellen

Unter Einstellungen → Datenquellen lassen sich Datenbankprofile über „Datenbank hinzufügen +“ anlegen (Name, Typ, URL; Zugangsdaten bleiben im Backend, Tokens nur transient). Der Import erfolgt über „Daten importieren“: „Datei auswählen“, „Web Source“ (angezeigt wird der heruntergeladene Dateiname; Hover zeigt die gespeicherte Quell-URL) sowie Connector- dann Quellenauswahl (Backend: /schema-Tabellen; NDJSON: konfigurierte Quelle; angezeigt als „Connector · Quelle“). Ein Reimport löscht die bisherigen Datensätze dieser Quelle (lokal: voller Pfad; URL: kanonische URL; Connector: stabile ID plus Quelle; YAML-Teile eingeschlossen) vollständig vor dem Neuladen und aktualisiert die Auswahl auch bei Fehler/Abbruch. Browser geben keinen absoluten Dateipfad preis: Ohne optionale Pfadangabe wird jeder lokale Import als neue Quelle angelegt und gleiche Dateinamen werden nie zusammengeführt. Lokale Quellen tragen zusätzlich ein Nachladen-Symbol (wie URL-Quellen, nach dem Papierkorb): Wo der Browser den Dateizugriff für die laufende Sitzung behält, liest es die Datei automatisch frisch ein und ersetzt genau diese Quelle (einschließlich aller YAML-Teile) – auch ohne Pfad. Sonst öffnet sich die Dateiauswahl; die frisch gewählte Datei muss denselben Dateinamen tragen. Die Zugriffsrechte gelten nur für die Sitzung und gehen beim Neuladen der Seite verloren. Eine abweichende Auswahl, ein abgebrochener Dialog oder ein Lesefehler lässt die Daten unverändert.

Unter Einstellungen → Datenquellen kann zusätzlich ein HTTPS-NDJSON-Endpunkt importiert werden; HTTP ist ausschließlich für localhost erlaubt. Ein optionales Zugriffstoken gilt nur für den laufenden Import und wird nicht gespeichert. Datei- und HTTP-Connector verwenden denselben Importservice. Datenbankpasswörter gehören ausschließlich ins separate Backend.

### Datei-URL-Import und Relay

Der URL-Import (Enter oder Download-Symbol im Eingabefeld) versucht zuerst den direkten Browser-Download mit Streaming; CORS-fähige Quellen – auch große – laufen ohne Server. URLs müssen nicht auf eine Dateiendung enden: Das Format folgt dem vom Server geladenen Dateinamen (Content-Disposition, sonst finale URL). Schlägt der direkte Zugriff fehl (fehlende CORS-Header, Netzwerkfehler), nutzt DLens den eigenen Same-Origin-Relay `GET /api/import-url?url=…`. Die Quellenliste zeigt URL-Importe mit Papierkorb und Nachladen-Symbol (in dieser Reihenfolge rechts); Nachladen verwendet die gespeicherte kanonische URL, ersetzt alle Datensätze dieser URL-Identität (einschließlich YAML-Teile) und funktioniert auch nach einem Neustart. Abbrüche und Fehler erhalten den bisherigen Bestand.

Der Relay (`server/import-relay.mjs`, geteilt von `api/import-url.mjs` für Vercel und dem Astro-Dev-/Preview-Middleware) streamt öffentliche http(s)-Dateien ohne Cookies/Auth-Weiterleitung und ohne Upstream-Header-Passthrough (außer sanitiertem Content-Type, sicher aufgebautem `Content-Disposition: attachment` mit geladenem Dateinamen, `Cache-Control: no-store`). SSRF-Schutz: nur http(s), keine URL-Credentials, nur öffentlich routbare Ziele (kein Loopback/privat/link-local/reserviert, inkl. gemappter IPv6-Adressen und Metadaten-Endpunkten); DNS-Auflösung und Socket-Ziel teilen sich einen validierenden Pfad, jeder Redirect wird erneut geprüft (max. 5), Upstream-Timeout 25 s, explizite Größenbegrenzung 256 MiB (kein stilles Abschneiden). Fehlerantworten bleiben bewusst knapp. Auf Vercel gilt zusätzlich das Funktions-Zeitlimit (`maxDuration: 25`); sehr große Relay-Importe können dort abbrechen – CORS-fähige Großdateien bleiben deshalb bewusst auf dem direkten Pfad. Statische Hosts ohne Funktions-Support bieten nur den Direktimport; der Fehlerhinweis nennt diesen Ausweg.

Lokal gilt dasselbe Standardverhalten; nur für Loopback-Fixture-Tests (Browser-Smoke) hebt `DLENS_RELAY_ALLOW_LOOPBACK=1` beim Dev-/Preview-Server ausschließlich die Loopback-Sperre auf. Niemals in deployed Umgebungen setzen.

`npm run connector` startet das optionale Node.js-Backend für PostgreSQL oder MariaDB/MySQL. Es benötigt serverseitig:

- `DLENS_CONNECTOR_DATABASE_URL`: PostgreSQL- oder `mysql://`-Verbindungs-URL mit einem reinen Lesekonto.
- `DLENS_CONNECTOR_TOKEN`: Zugriffstoken mit mindestens 24 Zeichen.
- `DLENS_CONNECTOR_ORIGIN`: exakt erlaubte DLens-Origin, beispielsweise `http://localhost:4321`.
- `DLENS_CONNECTOR_TABLES`: freigegebene Tabellen, kommasepariert; optional `schema.table`.
- Optional `DLENS_CONNECTOR_HOST` (Default `127.0.0.1`) und `DLENS_CONNECTOR_PORT` (Default `8787`).

`GET /schema` liefert die freigegebenen Tabellennamen; `GET /records?table=events` liefert NDJSON. Beide benötigen `Authorization: Bearer …`. Der Server akzeptiert keine freien SQL-Abfragen, beschränkt gleichzeitige Streams und gibt Treiberfehler nicht an Clients weiter. Für entfernten Betrieb ist ein HTTPS-Reverse-Proxy erforderlich. Das Backend ist nicht Teil des statischen Vercel-Deployments. Der gemeinsame HTTP-Weg ist im Browser geprüft; die Treiber wurden zusätzlich gegen isolierte PostgreSQL-16- und MariaDB-11-Testdatenbanken mit Lesekonten, Text-/Datumserhalt und Verbindungsabbruch geprüft. SQL Server/Oracle sowie Append/Update/Upsert bleiben spätere Erweiterungen.

## Festival-Datensatz

Die zusätzliche [Version mit Tag 2 am 8. September 2026](public/demo/weitklang-festival-tag2-2026-09-08.json) verschiebt ausschließlich die Datumsangaben auf Aufbau 6. September, Festivaltage 7.–10. September und Abbau 11. September 2026. Namen, IDs und alle übrigen Inhalte bleiben unverändert. Diese feste Datumsvariante kann über Dateiimport oder Drag & Drop geladen werden; sie passt sich nicht automatisch an spätere Tage an.

[weitklang-festival-2027.json](public/demo/weitklang-festival-2027.json) ist ein separat ladbarer, vollständig fiktiver Datensatz:

- 16. Juni 2027: Aufbautag (11 Events)
- 17.–20. Juni 2027: vier Festivaltage (48 Events, davon acht Auftritte auf zwei Bühnen)
- 21. Juni 2027: Abbautag (8 Events)
- Sechs Logistikmitarbeitende, zehn Technikmitarbeitende, acht Bands mit insgesamt 32 Musikern
- Inventar für Logistik, Stromversorgung, Bühnen, Ton, Licht, Rigging und vollständige Instrumenten-/Backline-Sets der Bands
- Eventdatensätze mit Verantwortlichen, vollständigen zugeordneten Personen und Equipment-Objekten, Arbeitsschritten mit IDs und Event-Abhängigkeiten

Die JSON-Datei über den regulären Dateiimport oder Drag & Drop laden. Eine eigene Demo-Ladeaktion gibt es in der Oberfläche nicht. Es wird nichts automatisch beim Start geladen. Die Daten sind mit `node scripts/generate-festival.mjs` reproduzierbar. Die IDs der katalogisierten Ressourcen bleiben auch in den eingebetteten Eventdaten erhalten.

## Stack und Deployment

Astro 5 (Vite), React 19, TanStack Router, Tailwind CSS 4, Base UI Dialog und Heroicons Outline. Die Oberfläche verwendet eigene abgerundete Komponenten im Stil des Mockups; ein vollständiges shadcn/base-lyra-Komponentenset ist nicht installiert. Die Jazz-Integration folgt der lokalen Alkalye-Referenz und verwendet die korrigierte Version 0.20.19. Keine externen Schrift- oder Bilddienste.

Für Vercel das GitHub-Repository importieren: Framework `Astro`, Build `npm run build`, Ausgabeverzeichnis `dist`. `vercel.json` enthält diese Einstellungen plus No-Cache-Header für `/sw.js`, `/manifest.webmanifest` und `/`. Keine Umgebungsvariablen nötig. Ein Deployment wurde nicht durchgeführt. Statisches Deployment; Details unter [PWA](docs/pwa.md).

## PWA (Installierbar, offlinefähig)

DLens ist als Progressive Web App installierbar. Der Produktionsbuild erzeugt Manifest und Service Worker (Workbox GenerateSW) und cacht ausschließlich App-Shell, `_astro`-JS/CSS/WASM/Fonts, Favicon und Icons. Installation und Update-Verhalten stehen in Einstellungen → Allgemein; Updates erfordern eine explizite Bestätigung und sind während Import/Löschen gesperrt. Offline funktionieren lokale Imports, Suche und Filter nach einmaligem Online-Laden; Remote-Quellen brauchen Netz. Voraussetzung: Browser mit Service Worker/OPFS über HTTPS oder localhost. Prüfung: `npm run test:pwa`. Details unter [docs/pwa.md](docs/pwa.md).

## Prüfstand

Die ursprünglichen 21 Tests bleiben erhalten; zusätzliche Tests prüfen SQLite, Importgenerationen, Chunkgrenzen, XML-/CSV-/JSON-/YAML-Grenzfälle, paginierte Abfragen, Detailbäume und den HTTP-Connector. `npm test` und `npm run build` laufen mit Node.js 22. Das [Prüfprotokoll](docs/data-architecture-validation.md) enthält die aktuelle Abnahme.

Für Browserprüfungen den lokalen Server starten und `DLENS_TEST_URL=http://127.0.0.1:4321 npm run test:browser` ausführen. `npm run test:large` erzeugt standardmäßig eine mindestens 2,2 GB große XML-Datei; Größe und URL lassen sich über `DLENS_BENCH_BYTES` und `DLENS_TEST_URL` konfigurieren. Die Skripte verwenden den lokal installierten Chrome und erzeugen isolierte Testprofile unter `artifacts/`. `DLENS_VITE_CACHE` erlaubt bei geteilten Entwicklungsumgebungen einen eigenen Vite-Cache.

Der Build weist weiterhin auf das große Jazz-Client-Bundle hin. Abhängigkeiten und Audit-Status vor einem produktiven Release erneut prüfen; der Framework-Stand bleibt gemäß Projektvorgabe Astro 5.

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

### Importierte Daten löschen

In der Detailansicht einer Tabellenzeile entfernt **Datensatz löschen** diese Zeile einschließlich ihrer verschachtelten Daten. In Einstellungen → Datenquellen entfernt **Ausgewählte Quelle löschen** einen gesamten Import; **Alle importierten Daten löschen** setzt den SQLite-Datenbestand einschließlich Importhistorie und Migrationsmarkierungen zurück und gibt Datenbankplatz frei. Jede Aktion verlangt eine Bestätigung. Jazz-Originaldaten, Originaldateien und Anzeigeeinstellungen bleiben erhalten. Die technische Jazz-Übernahme bleibt erhalten, ist derzeit aber nicht in der Oberfläche zugänglich.

Im Quellenauswahlmenü löscht der Papierkorb ganz rechts den jeweiligen Import nach Bestätigung. Beim Löschen einer anderen Quelle bleibt die aktuelle Auswahl erhalten.

Der Header zeigt weder einen Prototyp-Hinweis noch eine Benutzerattrappe.

### KYAML-Import

`.kyaml`-Dateien können über Dateiauswahl und Drag & Drop importiert werden (auch mit großgeschriebener Endung). KYAML wird als YAML-kompatibles Format durch den vorhandenen sicheren YAML-Parser verarbeitet: Kommentare, Flow-Objekte/-Arrays und abschließende Kommas werden unterstützt. Es gelten dieselbe Grenze von 5.000.000 Bytes und dieselben Sicherheitslimits wie für YAML. Eine strikte KYAML-Stilprüfung und KYAML-Export sind nicht enthalten. Referenz: https://kubernetes.io/docs/reference/encodings/kyaml/

YAML-/YML-/KYAML-Dateien dürfen mehrere durch YAML-Dokumentmarker (`---`, optional `...`) getrennte Dokumente enthalten. Jedes Dokument wird als eigene Quelle gespeichert: `datei.yaml · Teil 1`, `datei.yaml · Teil 2` (bei englischer Importsprache `Part 1`, `Part 2`). Bei nur einem Dokument bleibt der Dateiname ohne Zusatz. Nach dem Import ist der erste Teil ausgewählt. Die gesamte Datei bleibt auf 5.000.000 Bytes und 1.000 Dokumente begrenzt; leere oder nicht tabellarisch darstellbare Dokumente führen zu einem Fehler. Alle Teile werden atomar freigegeben. Reimport ersetzt Teile nach Dateiname und Nummer, unabhängig von der Importsprache, und entfernt überzählige alte Teile. Das Nachladen-Symbol einer lokalen Quelle ersetzt die gesamte Gruppe der frisch gewählten Datei; gleichnamige, getrennt importierte Quellen bleiben erhalten.

**Speicher zurücksetzen:** „Alle importierten Daten löschen“ ist auch ohne sichtbare Quellen verfügbar (während einer laufenden Verarbeitung gesperrt). Nach Bestätigung schließt der Worker SQLite, leert ausschließlich den DLens-SQLite-Dateipool und erstellt eine neue Datenbank. Damit werden auch Reste fehlgeschlagener Imports entfernt. Jazz und Browserpräferenzen bleiben erhalten.

JSON-/YAML-/KYAML-Dokumente ohne Arrays von Objekten werden als eine Tabellenzeile mit dem vollständigen Wurzelobjekt angezeigt. Verschachtelte Inhalte bleiben in der Detailansicht und für die Suche erhalten.

### Warnschwellen beim Import

Überschreitet eine Tabellenzeile einschließlich ihrer Hierarchie 2 MiB oder 10.000 Knoten, pausiert der Import zur Bestätigung. „Fortsetzen“ erhöht beide Schwellen auf 4 MiB/20.000 Knoten, danach auf 6 MiB/30.000 usw. Ab der zweiten Warnung kann man weitere Warnungen für diesen Import abschalten. „Import abbrechen“ verwirft die laufende Importgeneration und erhält einen zuvor importierten Bestand. Andere Parser-, Feld- und Anzeigegrenzen sowie tatsächliche Speichergrenzen bleiben bestehen.

`npm run preview` startet den Produktionsbuild inklusive URL-Import-Endpunkt auf `127.0.0.1:4321` (optional `-- --port 4345`). Ein reiner statischer Dateiserver stellt diesen Endpunkt nicht bereit.
