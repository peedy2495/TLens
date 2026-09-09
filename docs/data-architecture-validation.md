# Prüfprotokoll der Datenmigration

Stand: 8. September 2026. Geprüft im lokalen Workspace, nicht auf einem veröffentlichten Deployment.

## Automatisierte und Browserprüfungen

- Insgesamt 52 automatisierte Tests bestehen; die bisherigen 21 Tests bleiben erhalten.
- Zusätzliche Tests decken SQLite-Repositories, atomare Generationen, Wiederanlauf, Migrationsfingerprints, JSON-/XML-/CSV-Chunkgrenzen, YAML-Sicherheit, Hierarchie, rekursive Filter, natürliche Sortierung, vollständigen CSV-Export, Seiten und HTTP-Connectoren ab.
- `npm test` unter Node.js 22 und `npm run build` bestanden. Der bekannte Hinweis auf das große Jazz-Client-Bundle bleibt bestehen.
- Headless-Chrome 152: Import über die echte Oberfläche, OPFS-Wiederladen, Quellenauswahl, zweiter Tab mit Sperrmeldung, Importabbruch unter zwei Sekunden und authentifizierter HTTP-Import bestanden. Das kontrollierte Backend weist fehlende Tokens, fremde Origins und nicht freigegebene Tabellen ab.
- Der große Export wurde zusätzlich mit einem absichtlich fehlschlagenden Ziel geprüft: Abbruch gibt die Worker-Auftragswarteschlange wieder frei; weitere Abfragen funktionieren.

## Datenbankadapter

`scripts/check-database-connectors.mjs` hat den vollständigen Backend-Leseweg gegen **PostgreSQL 16** und **MariaDB 11** geprüft: reine Lesekonten, führende Nullen, unveränderte Datumswerte, authentifizierte NDJSON-Antworten sowie Abbruch vor und während des Verbindungsaufbaus. Ein dabei gefundener MariaDB-Abbruchfehler wurde korrigiert; die Wiederholung bestand. Die Testcontainer verwendeten lokale Zufallsports und wurden anschließend entfernt. Vorhandene Container und Datenbanken wurden nicht verändert.

## Reale XML-Lastprüfung

Die Datei wurde inkrementell erzeugt und enthält einen `Records`-Container mit wiederholten `Record`-Elementen, ID und einem jeweils 8.192 Zeichen langen Textwert. Der Import liest die tatsächlich erzeugte Datei über `File.stream()`; es handelt sich nicht nur um einen simulierten Bytezähler.

| Messung | 100-MB-Vergleich | 2,2-GB-Abnahme |
| --- | ---: | ---: |
| Tatsächliche Quellgröße | 100.004.555 Bytes | 2.200.000.898 Bytes |
| Importierte Datensätze | 12.135 | 266.958 |
| Importzeit | 71,00 s vor letzter Pfadoptimierung | 470,41 s |
| Spitzen-RSS des gesamten Chrome-Prozessbaums | 1.182.744.576 Bytes | 1.338.814.464 Bytes |
| An React gelieferte Tabellenzeilen | 100 | 100 |
| Vollständige Trefferzahl | 12.135 | 266.958 |

Das RSS-Wachstum beträgt rund 149 MiB bei etwa 22-facher Eingabegröße. Beide vor dem Großlauf festgelegten Kriterien wurden erfüllt: unter 2 GiB Gesamt-RSS und höchstens 256 MiB Wachstum. RSS umfasst Browserprozesse und zählt gemeinsam genutzte Seiten mehrfach; es ist keine reine JavaScript-Heapmessung.

Nach dem Großimport wurde Chrome beendet und dieselbe OPFS-Datenbank erneut geöffnet. Alle 266.958 Datensätze blieben verfügbar. Die erste unfiltrierte Abfrage benötigte nach Optimierung der Metadaten-/Timeline-Abfragen 2,83 Sekunden (zuvor 24,73 Sekunden).

Der vollständige JSON-Export erzeugte **2.193.860.884 Bytes mit allen 266.958 Datensätzen** in **85,15 Sekunden**. Das Schreibziel bestätigte jeden Chunk vor dem nächsten Leseabschnitt. Die Ausgabe wurde beim Schreiben gezählt; sie wurde nicht vollständig mit `JSON.parse` in den Arbeitsspeicher geladen.

Browser: `HeadlessChrome/152.0.0.0`, Linux x86_64. Node.js: 22.23.2. SQLite WASM: 3.53.4-build1. Rechner-/Browserlast beeinflusst die Laufzeiten; sie sind keine allgemeinen Leistungszusagen.

Rohmessungen entstehen unter `artifacts/storage-benchmark/`. Die rund 12 GB erzeugten Großdateien und zugehörigen Browserprofile wurden nach der Abnahme entfernt; Messprotokolle und Screenshots bleiben erhalten. `navigator.storage.estimate()` lieferte in verschiedenen Läufen verzögert bzw. wechselnd aktualisierte Nutzungswerte; für die logische Datenbankgröße zeigt die Anwendung deshalb zusätzlich SQLite-Seitenzahl × Seitengröße. Quota ist weiterhin eine Browserabschätzung, keine zugesicherte freie Dateisystemkapazität.

## Noch offene Freigaben

- Firefox und Safari sind noch nicht praktisch geprüft. Es gibt keine pauschale Browserfreigabe.
- Produktive Datenbankzugänge und das Deployment des Connector-Backends müssen für die jeweilige Umgebung konfiguriert werden. Die Treiber selbst sind gegen isolierte PostgreSQL-16- und MariaDB-11-Server geprüft.
- Die 2,2-GB-Abnahme betrifft die beschriebene Datensatzstruktur. Andere Großdateistrukturen müssen die dokumentierten Einzelwert-, Zeilen- und Tiefengrenzen einhalten. Kleine Tests decken weitere XML-Formen, Namespaces und verschachtelte Werte ab.
- Abbruch erfolgt an Chunk-/Batch-Grenzen. Während einer einzelnen synchronen SQLite-Abfrage oder Pfadprojektion kann die Antwort länger dauern; harte Echtzeitabbruchgarantien gibt es nicht.
- Append, Update, Upsert, zusätzliche SQL-Server/Oracle-Adapter und Anmeldung/Synchronisierung sind weiterhin spätere Erweiterungen. Für New sowie Re-import/Replace ist der vollständige lokale Pfad implementiert.

## Ergänzung: Löschfunktionen (9. September 2026)

53 automatisierte Tests und der Produktions-Build bestanden. Der neue Repository-Test prüft Einzel-Löschung, Metadaten, Transaktions-Rollback bei Fehlern, veraltete Generationen, leere Quellen und vollständiges Zurücksetzen. Der Chrome-Browsertest prüft abgelehnte und bestätigte Einzel-Löschung, Bestand nach Neuladen, Löschen einer Quelle, Reset und anschließenden Neuimport. Browserprüfungen verwenden nun ein eigenes Profil pro Lauf.
