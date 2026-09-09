# Datenarchitektur: Entscheidungen und Prüfkriterien

Stand: 8. September 2026. Ergänzung zum Migrationsplan.

## SQLite und Browser

SQLite WASM 3.53.4-build1, offizielles npm-Paket, läuft in einem dedizierten Worker. `opfs-sahpool` erhält ein festes Verzeichnis `/dlens-sqlite-v1`. Eine Web-Lock-Sperre erlaubt einen Datenbankbesitzer pro Origin. Weitere Tabs erhalten eine verständliche Meldung. Es gibt keinen stillen RAM-Fallback und keinen Zugriff auf Jazz-Dateien durch SQLite.

SAHPool wurde für den einzelnen Worker gewählt: keine COOP/COEP-Header nötig, transaktionale Stapelverarbeitung. `opfs` und `opfs-wl` sind Alternativen für konkurrierende Verbindungen; deren zusätzliche Koordination wird derzeit nicht benötigt. Referenz: [SQLite Persistent Storage](https://sqlite.org/wasm/doc/trunk/persistence.md). WASM wird lokal mit Vite ausgeliefert, nicht von einem CDN geladen.

Technische Voraussetzung: OPFS-SyncAccessHandles im Worker und Web Locks. Automatisch geprüft wird das installierte Chrome; Firefox und Safari sind vor einer Browserfreigabe zusätzlich praktisch zu prüfen. Nicht verfügbare oder gesperrte Speicherung wird gemeldet.

## Daten und Aufbewahrung

Neue Importe bleiben als explizit auswählbare Datensätze in SQLite erhalten. Dies ersetzt bewusst die bisherige reine Sitzungsaufbewahrung von Dateien. Die App wählt beim Start weiterhin keine Quelle aus. Quellen werden mit UUID identifiziert; erneuter Import desselben Dateinamens ersetzt dessen Generation erst nach Erfolg. Originaldateien werden nicht kopiert. Nutzer können einen ausgewählten SQLite-Datensatz in den Einstellungen löschen.

Entitäten speichern Hierarchie, Quellpfad und Reihenfolge. Logische Datensätze bilden eine begrenzte JSON-Projektion für die kompatible Suche und Tabellenanzeige; rekursive Feldwerte werden gesondert indexiert. Diese Projektionen verursachen zusätzlichen Speicherbedarf, verhindern aber wiederholtes Rekonstruieren für jede Abfrage. Die vorläufige Speicherabschätzung beträgt das Vierfache der Quelldatei; Quota-Fehler während des Imports bleiben möglich und werden behandelt. SQLite-Seitencache: 16 MiB. Unvollständige Generationen werden beim Wiederanlauf entfernt.

## Grenzen

- Ein Lese-Chunk: höchstens 64 KiB; Transaktionen beim Einlesen: ungefähr 4 MiB Eingabedaten.
- Einzelne Werte: 1 Mi Zeichen; Feld-/Elementnamen: 1.024 Zeichen; Hierarchietiefe: 128.
- Projizierte Zeile: höchstens 2 MiB UTF-8 und 10.000 Hierarchieknoten/Kinder.
- YAML: weiterhin 5.000.000 Bytes, begrenzte Aliasexpansion, keine unbekannten Tags.
- Tabellen: 100 Zeilen pro Seite, zusätzlich Bytebudget; höchstens 20 Tabellen pro Ansicht. Keine still abgeschnittenen Zeilen: Folgeseiten beginnen hinter der letzten gelieferten Zeile.
- Feldnamen: höchstens 1.000 pro Dataset. Filterwerte: 100 pro Seite. Kalender: höchstens 10.000 gefilterte Tage; Farben: höchstens 1.000 pro Tag. Überschreitungen ergeben einen expliziten Hinweis.
- Export: Streaming in einen Browser-Dateispeicherdialog; ohne diese API maximal 20 MiB als Blob. Jede Exportnachricht muss bestätigt werden, bevor der Worker weitere Daten liest.

Die Grenzen gelten auch für ungewöhnliche einzelne Datensätze in großen Dateien. Die Großdateianforderung ist keine Zusage, einen einzelnen mehrere GB großen Textwert als Tabellenzelle darzustellen.

## Lasttest-Abnahme

Vor dem 2,2-GB-Lauf festgelegte Grenzen: gesamter Chrome-Prozessbaum unter 2 GiB summiertem RSS; Wachstum gegenüber dem 100-MB-Lauf höchstens 256 MiB. Summiertes RSS zählt gemeinsam genutzte Seiten mehrfach und ist daher ein konservatives Prozessmaß, kein reines JavaScript-Heapmaß. Zusätzlich müssen Quellbytezahl, Zeilenzahl, vollständige Persistenz und auf 100 Zeilen begrenzte Abfrage stimmen. Importabbruch wird separat geprüft; Ziel unter zwei Sekunden an regulären Chunk-/Batch-Grenzen. Einzelne SQLite-Operationen können diesen Wert überschreiten und sind gesondert zu messen.

Skripte: `scripts/check-storage-browser.mjs` und `scripts/benchmark-storage.mjs`. Testprofile, Dateien und Messwerte werden ausschließlich unter dem ignorierten Verzeichnis `artifacts/` erzeugt. Die Browser-Lastprüfung benötigt einen lokalen Vite-Server; sie ist kein veröffentlichter Produkt-Endpunkt.

## Parser und Kompatibilität

JSON verwendet einen inkrementellen Tokenizer und eine eigene begrenzte Strukturzustandsmaschine. XML verwendet SAX-Ereignisse und bestimmt Zeilengrenzen nach dem Einlesen anhand persistierter Geschwister. Die Bibliothek `saxes` ist archiviert; sie wurde wegen ihrer strikten XML-/Namespace-Prüfung gewählt und wird durch eigene Grenzfalltests abgesichert. Ein späterer Ersatz muss denselben Vergleichstest bestehen. Referenzen: [saxes](https://github.com/lddubeau/saxes), [streamparser-json](https://github.com/juanjoDiaz/streamparser-json).

CSV wird an logischen Datensatzgrenzen verarbeitet und verwendet den bisherigen Parser für Feldsemantik und Validierung. Kleine JSON/YAML-Referenzdaten, XML-Wrapper, CDATA, Attribute, CSV-Optionen, verschachtelte Filter und Locale-Sortierung werden gegen die bestehende Semantik geprüft.

## Separates Connector-Backend

PostgreSQL 16 und MariaDB 11 wurden mit isolierten Testcontainern geprüft. Der Server verwendet Cursor/Streams, reine Lesekonten, freigegebene Tabellennamen und Bearer-Authentifizierung. Datenbank-Zugangsdaten bleiben ausschließlich serverseitig; das Browser-Zugriffstoken wird nach dem Import verworfen. Treiberreferenzen: [node-postgres](https://node-postgres.com/features/queries), [mysql2](https://sidorares.github.io/node-mysql2/docs/documentation).

Die bisherigen 2-MiB-/10.000-Knoten-Grenzen bei der Datensatzprojektion sind im interaktiven Import bestätigbare Intervalle. Der Worker wartet außerhalb einer Transaktion auf die Antwort und wiederholt den zurückgerollten Projektionsbatch mit der nächsten Schwelle. Ab dem zweiten Intervall ist das Abschalten weiterer Warnungen für den aktuellen Import möglich. Ohne Bestätigungshandler bleibt die erste Grenze verbindlich.
