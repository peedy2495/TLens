# Migrationsplan zur neuen Datenarchitektur

Stand: 8. September 2026. Der folgende Plan bleibt als Arbeitsgrundlage erhalten. Der lokale SQLite-/OPFS-Pfad, Streaming-Dateiimporte, Worker-Abfragen, Detailseiten, Export und Jazz-Übernahme sind inzwischen implementiert. Der HTTP-Connector und das optionale PostgreSQL-/MariaDB-Backend sind vorhanden. Details: [Architekturentscheidungen](data-architecture-decisions.md) und [Prüfprotokoll](data-architecture-validation.md).

## Umsetzungsstand

| Etappe | Stand |
| --- | --- |
| 0: Baseline und Entscheidungen | Bestehende Tests erhalten; Browser-/VFS-Entscheidung und Ressourcenlimits dokumentiert. Chrome geprüft; Firefox/Safari-Freigabe offen. |
| 1: Schnittstellen | Connector-Registry, Parser, gemeinsamer Ingestion-Service, Repository und Worker-Aufträge umgesetzt. |
| 2: SQLite/OPFS | Schema-Versionen, exklusive Tab-Sperre, Importgenerationen, Recovery und Persistenz umgesetzt und geprüft. |
| 3: Abfragen/UI | Tabellen, Timeline und Vorschläge paginiert; SQL hinter Repository; Details laden Kinder bedarfsgerecht. |
| 4: Streaming | XML, CSV und JSON inkrementell; YAML sicher begrenzt. Weitere JSON/XML-Strukturen und Chunkgrenzen getestet. |
| 5: Großdateien/Export | Echter 2,2-GB-Import, Browserneustart und vollständiger 2,19-GB-Export bestanden; Ressourcenlimits dokumentiert. |
| 6: Jazz | Explizite idempotente Übernahme, atomarer Fingerprint und Erhalt der Originaldaten implementiert. SQLite ist der neue Standard. |
| 7: Remote | NDJSON-End-to-End geprüft; PostgreSQL-/MariaDB-Streamingadapter vorhanden. PostgreSQL 16 und MariaDB 11 isoliert geprüft; produktive Konfiguration, weitere Adapter und zusätzliche Importmodi bleiben offen. |

Die ursprüngliche Bestandsaufnahme und die Etappen unten beschreiben den Ausgangspunkt und die Abnahmekriterien, nicht mehr den aktuellen Implementierungsstand.

## Grundlage und Ausgangslage

Die neuen Vorgaben liegen im geprüften Workspace unter [`.agents/skills/data-ingestion-architecture`](../.agents/skills/data-ingestion-architecture/SKILL.md), einschließlich der Referenzen und Kompatibilitätsmatrix. Ein Verzeichnis `./.skills` existiert hier derzeit nicht. Die bisherigen Produktanforderungen in [AGENTS.md](../AGENTS.md) bleiben die Verhaltensbaseline; ausdrücklich geplante Architekturänderungen werden schrittweise umgesetzt.

| Bereich | Im Code vorhanden | Erforderliche Änderung |
| --- | --- | --- |
| Import | `App.tsx`: 5.000.000-Byte-Limit, `file.text()`, vollständiges Parsing im UI-Thread | Ingestion-Service, Worker, begrenzte Batches, Fortschritt und Abbruch |
| Dateiformate | `xml.ts`: DOMParser; `csv.ts`: vollständiger String und Zeilenarrays; JSON/YAML: vollständiges Parsing | Inkrementelles XML/CSV/großes JSON; explizite sichere YAML-Grenzen |
| Datenmodell | `data.ts`: `Table[]` mit vollständigen, verschachtelten `Row[]` | Dataset-/Import-Identitäten, hybrider Speicher, logische Tabellenprojektionen |
| Persistenz | `jazz.ts`: Workspace mit einem JSON-String; App liest/schreibt den gesamten Tabellenbestand | SQLite WASM über Repositories, OPFS, versionierte Migration |
| Browserpräferenzen | `localStorage`: Sprache, Theme, Ansichten, CSV-Optionen, Datenbankname, Timeline/Farbwahl | Kleine Einstellungen dürfen bleiben; `tlens-`-Fallback erhalten |
| Abfragen | `filterTables`, Feld-/Wertvorschläge, Sortierung und Timeline verarbeiten vollständige Arrays | Abfragen und Aggregationen im Worker; begrenzte Ergebnisse für React |
| Details und Export | Vollständiger `RecordTree`; JSON/CSV erzeugen vollständige Strings/Blobs | Kinder bedarfsgerecht laden; Exporte stapelweise lesen und schreiben |
| Infrastruktur | Kein eigener Import-/SQLite-Worker, kein Repository; bestehende Vitest-Tests | Browserintegration, Speicher-/Abbruchtests, reproduzierbarer Großdateitest |

Es wurde keine Speicherung importierter Nutzdaten in `localStorage` gefunden. Die reale Bestandsmigration betrifft Jazz. Ein zusätzlicher Legacy-Importer für `localStorage` wird nur für nachgewiesene alte Nutzdatenformate benötigt.

## Ziel und verbindliche Leitentscheidungen

```text
React UI: Auswahl, Einstellungen, Importstatus, begrenzte Ansichten
    ↕ typisierte Worker-Aufträge und Ergebnisse
Ingestion-/Query-Service im Worker
    Quelle → Connector → Parser → Normalizer → Mapper
    → Repositories → SQLite WASM → OPFS
```

1. SQLite wird der primäre lokale Nutzdatenspeicher. Jazz bleibt während der Migration zugänglich und wird weder gelöscht noch neu angelegt.
2. Connectoren kümmern sich um den Zugang, Parser um das Format, Mapper um die fachliche Zuordnung. SQL bleibt hinter Repositories. Zunächst genügt ein zentraler Worker; zusätzliche Worker folgen nur bei nachgewiesenem Bedarf.
3. Bekannte, häufig abgefragte Strukturen erhalten relationale Projektionen. Beliebige Hierarchien erhalten stabile IDs, `parent_id`, `position`, Knotentyp und Herkunft; dynamische Attribute werden als JSON abgelegt. Große Teilbäume dürfen nicht zusätzlich als vollständige JSON-Werte dupliziert werden.
4. Tabellen je Datenpfad bleiben eine Darstellung des Speichers. Es entsteht nicht automatisch eine physische SQL-Tabelle für jedes verschachtelte Array.
5. Neuimporte werden in einer unsichtbaren Importgeneration stapelweise gespeichert. Erst nach erfolgreicher Validierung wird diese atomar aktiviert. Fehler oder Abbruch lassen die bisherige Quelle unverändert; unvollständige Generationen werden bereinigt. Eine einzige Transaktion über 2,2 GB ist nicht vorgesehen.
6. UI-Zustand enthält IDs, Metadaten und begrenzte Seiten. Auch Filtervorschläge, Timeline und Detailansicht dürfen keine vollständigen großen Datenbestände nach React holen.
7. Quelldateien werden direkt gelesen und nicht automatisch zusätzlich nach OPFS kopiert. Dauerhafte importierte Datensätze und bisher sitzungsgebundene Dateien müssen sichtbar unterschieden werden; die genaue Aufbewahrungsregel wird vor der Umschaltung festgelegt. Die App startet weiterhin ohne ausgewählte Quelle.

## Etappen und Abnahmekriterien

### 0 — Verhalten und Architekturentscheidungen absichern

**Arbeit:** Bestehende Tests mit Node.js 22 ausführen und um relevante Vergleichsfälle ergänzen. Die alten Parser und Filter dienen für kleine Fixtures als Referenz. Browser-Zielmatrix, Sitzungs-/Aufbewahrungsregeln, Speicherbudgets und Importmodi in kurzen Architekturentscheidungen festhalten. SQLite-WASM-/VFS- und Parser-Kandidaten anhand aktueller offizieller Dokumentation und eines Browser-Spikes prüfen; insbesondere `opfs-sahpool`, `opfs` und `opfs-wl` hinsichtlich Locking, mehreren Tabs, Headeranforderungen und Deployment vergleichen. Noch keine Bibliothek verbindlich auswählen.

**Wichtig:** `toTables` stoppt aktuell beim gefundenen Array von Objekten; es erzeugt nicht zusätzlich Tabellen für jedes Array innerhalb dieser Zeilen. Filter finden rekursiv Feldnamen, keine eigenständige Pfadabfragesprache. Suche und Sortierung verwenden JavaScript-String-/Locale-Semantik. Diese Details mit Fixtures festschreiben, bevor SQL sie ersetzt.

**Abnahme:** Dokumentierte Browser-/VFS-Entscheidung, bestandene Baseline und definierte Semantik für XML, CSV, verschachtelte Filter, Quellwechsel, Ansichten und Timeline. Fehlende OPFS-Unterstützung wird sichtbar behandelt; kein stiller Wechsel zu vermeintlich dauerhafter RAM-Speicherung.

### 1 — Datenzugriff aus der Oberfläche lösen

**Arbeit:** `SourceRegistry`, Connector-Vertrag mit Fähigkeiten und `open/read/close`, Parser-/Normalizer-/Mapper-Verträge sowie Dataset-, Import- und Query-Repository-Schnittstellen einführen. Bestehende Speicher- und Parserlogik zunächst über Adapter weiterverwenden. `App.tsx` ruft Services auf; Dateiauswahl, Drop-Zonen und Demo verwenden denselben Importweg.

**Ergebnisse:** Typisierte Fehler mit Quellposition; Dataset-/Import-IDs statt Dateiname als technische Identität; Worker-Protokoll mit Auftrags-ID, Fortschritt, Abbruch und Fehlerantwort. Abbruchsignale über explizite Nachrichten weiterreichen; veraltete Abfrageantworten nach Quell-/Filterwechsel verwerfen.

**Abnahme:** Bisherige Funktionen bleiben mit dem vorhandenen Backend nutzbar. Ein kontrollierbarer Mock-Connector prüft Lifecycle, Fehler, Cleanup und Backpressure unabhängig vom Dateiformat.

### 2 — SQLite und OPFS als vertikalen Durchstich einführen

**Arbeit:** Worker starten, WASM laden, gewähltes VFS anbinden und Schema versionieren. Tabellen für Quellen, Datasets, Importgenerationen und Entitäten anlegen; logische Tabellenpfade und Herkunft erhalten. Objekt, Array, Skalar, `null`, leere Container und Reihenfolge eindeutig abbilden. Indizes für Dataset, Elternbezug, Position und relevante Such-/Domänenfelder anhand der Abfragen auswählen.

**Arbeit:** Zunächst kleine Fixture-Datasets per Batch schreiben und über Repository-Abfragen wieder lesen. Migrationen, Worker-Neustart und unterbrochene Imports behandeln. Für mehrere Tabs einen eindeutigen Schreibbesitzer bzw. eine kontrollierte Sperrantwort implementieren. Speicherabschätzung und Persistenzstatus anzeigen; Quota auch während Transaktionen behandeln.

**Abnahme:** Daten überleben Browserneustart; CRUD, Hierarchierekonstruktion, Transaktionen, Schema-Upgrades, Absturzbereinigung und Tab-Konflikte sind im Browser geprüft. Keine Regression am bestehenden Jazz-Speicher.

### 3 — Abfragen und Darstellung skalierbar machen

**Arbeit:** Seitenweise Tabellenabfragen mit stabiler Reihenfolge, gefilterten Gesamtzahlen und Spaltenmetadaten implementieren. Rekursive Feldfilter müssen auf die enthaltende Tabellenzeile zurückgeführt und mit UND kombiniert werden. Parametrisierte Abfragen und kontrollierte Feldauflösung verwenden. Teilstringsuche, exakte EventID sowie Unicode-/Locale- und natürliche Sortierung gegen die Baseline prüfen; Volltextsuche allein ist kein gleichwertiger Ersatz für `includes`.

**Arbeit:** Feldwerte seitenweise anbieten, manuelle Eingabe erhalten. Detailbäume laden Kinder beim Aufklappen. Timeline-Tagesauswahl, Min/Max, Gültigkeitsprüfung und Legende im Worker berechnen; viele Tagesereignisse über begrenzte Ansichten zugänglich machen. Sichtbare Spalten aus allen gefilterten Treffern bestimmen, nicht nur aus der aktuellen Seite. Mapping-/Farbwahl und Quellreihenfolge erhalten.

**Abnahme:** Auf einem großen synthetischen SQLite-Dataset bleiben Ergebnisnachrichten, UI-Speicher und gerenderte Zeilen begrenzt. Suche, Sortierung, Timeline und Details stimmen bei Referenzdaten mit dem bisherigen Verhalten überein.

### 4 — Streaming-Ingestion implementieren

**Reihenfolge:** CSV als einfacheren Durchstich umstellen, danach XML als kritisches Großdateiformat, danach großes JSON. YAML zunächst mit sicherem Parser und dokumentierter Größen-/Komplexitätsgrenze im Worker belassen.

**Arbeit:** `File.stream()` im Worker inkrementell dekodieren und parsen. Batches nach Bytebudget und Datensatzanzahl begrenzen; nach Commit erst weiter produzieren. Auch einzelne riesige Textwerte, Datensätze und tiefe Hierarchien begrenzen oder segmentiert speichern. Ein SAX-Parser allein garantiert noch keinen begrenzten Speicherverbrauch.

**XML:** `@`-Attribute, `#text`, CDATA, Namen/Namespaces, Textwerte, Wrapper- und Wiederholungsregeln erhalten. Die Entscheidung, ob Geschwister eine Tabelle bilden, gegebenenfalls anhand persistierter Knoten nachziehen; nicht alle Geschwister puffern. DTDs und externe Ressourcen ablehnen, auch bei über Chunks verteilten Deklarationen. Encoding und Chunkgrenzen testen.

**CSV/JSON:** Alle bestehenden CSV-Optionen, Headerprüfungen, BOM, Textwerte und mehrzeiligen Felder erhalten. Große JSON-Arrays und Hierarchien inkrementell verarbeiten. NDJSON/JSON Lines zunächst als Parserfähigkeit testen; neue Dateiendungen erst mit ausdrücklich dokumentierter Erweiterung der Formatvalidierung freigeben.

**Abnahme:** Abbruch und fehlerhafte letzte Chunks veröffentlichen keine Teilimporte. Fortschritt unterscheidet gelesene Bytes von bestätigten Datensätzen. Die 5-MB-Grenze wird erst je Format angehoben, wenn dessen vollständiger Import-/Abfragepfad geprüft ist.

### 5 — Großdatei-Betrieb und Exporte absichern

**Arbeit:** JSON- und CSV-Export lesen einen konsistenten Dataset-/Abfragestand seitenweise und schreiben inkrementell in ein unterstütztes Downloadziel. CSV erhält Filter, sichtbare Spalten, Sortierung, BOM und CRLF. Browser ohne geeignetes Streamingziel erhalten einen klar begrenzten Kleinexport; kein unbegrenztes Sammeln in einem Blob. Temporäre Exportdateien und fehlgeschlagene Exporte werden bereinigt.

**Arbeit:** Speicherplatzabschätzung berücksichtigt Datenbank, Indizes, temporäre Daten sowie alte und neue Importgenerationen. Quota-Abbruch, Worker-Ende, Tab-Schließen und Wiederanlauf testen. Originaldateien bleiben ohne zusätzliche Produktanforderung unkopiert.

**Abnahme:** Reproduzierbarer Test mit einer tatsächlich mindestens 2,2 GB großen XML-Datei auf dokumentiertem Browser und Rechner. Dateiform, Bytegröße, Datensatzanzahl, Laufzeit, Durchsatz, Datenbankgröße, Spitzen-RAM und Abbruchlatenz protokollieren. Zusätzlich proportionale kleinere Dateien und andere Hierarchieformen testen: Speicher darf nicht mit der gesamten Quelldatei wachsen. Konkrete Grenzwerte werden in Etappe 0 festgelegt, nicht erst nach der Messung. Simulierte Streams ergänzen diesen Nachweis, ersetzen ihn aber nicht.

### 6 — Jazz-Bestand übernehmen und SQLite zum Standard machen

**Arbeit:** Bestehendes Jazz-Konto über die vorhandene Integration öffnen. `Workspace.data` validieren und in eine neue SQLite-Generation importieren. Jazz-Konto-/Quellidentität, Inhaltsversion bzw. Fingerprint und Migrationsversion speichern, damit Wiederholungen idempotent sind. Zeilen, Pfade, Werte und Hierarchien vor Aktivierung vergleichen. Der vorhandene JSON-String ist eine Legacy-Ausnahme; zusätzliche vollständige Kopien möglichst vermeiden.

**Arbeit:** Eine explizite Übernahme mit verständlichem Ergebnis anbieten. Jazz-Daten auch nach Erfolg erhalten; erneutes Öffnen des alten Bestands bleibt bis zum abgeschlossenen Übergang möglich. Keine dauerhaften parallelen Schreibpfade für dieselben Datasets einführen. Kleine Präferenzen und Ansichten einschließlich `tlens-`-Fallback erhalten. Ein etwaiger `localStorage`-Nutzdatenimport darf nur bekannte, validierte Altformate verarbeiten.

**Abnahme:** Leeres, gültiges, beschädigtes und bereits migriertes Jazz-Konto sowie Fehler während der Übernahme geprüft. Wiederholung erzeugt keine Duplikate. SQLite wird erst nach Etappen 3–5 und erfolgreicher Migrationsprüfung zum Standard; Jazz-Code wird erst entfernt, wenn der Bestandszugang geklärt ist.

### 7 — Spätere Datenbank- und API-Quellen anschließen

**Arbeit:** Zuerst einen paginierten/streamenden API-Connector als Nachweis des gemeinsamen Vertrags integrieren. PostgreSQL und MariaDB/MySQL anschließend über ein separates Connector-Backend; SQL Server/Oracle nach Bedarf. Zugangsdaten bleiben serverseitig. Backend liefert begrenzte Batches, Schema und Herkunft, ohne DLens-Mapping einzubauen. Hosting, Authentifizierung, Limits und Abbruch müssen für dieses Backend gesondert geplant werden; die vorhandene statische Vercel-Konfiguration stellt es nicht bereit.

**Importmodi:** Zunächst New und atomarer Re-import/Replace. Append, Update und Upsert danach mit expliziter Schlüssel-, Konflikt- und Löschsemantik; keine stillschweigende Zuordnung anhand beliebiger Feldnamen.

**Abnahme:** Eine Remote-Quelle durchläuft dieselben Mapper, Repositories, Fortschritts-/Abbruchpfade und Datenansichten wie Dateien. Neue Quellen erfordern keine Änderung am Speicher- oder UI-Datenmodell.

## Reihenfolge und Freigaben

Kritischer Pfad: **0 → 1 → 2 → 3 → 4 → 5 → 6**. Etappe 7 folgt auf dem stabilen Vertrag und ist keine Voraussetzung für große lokale XML-Dateien. Parser-Spikes können früher stattfinden; die allgemeine Großdateifreigabe bleibt an den gesamten Datenpfad gebunden.

Jede Etappe wird in reviewbare Änderungen mit eigenen Abnahmekriterien zerlegt. Relevante Tests laufen mit `npm test`, Anwendungsänderungen zusätzlich mit `npm run build` unter Node.js 22. Browserprüfungen sind für OPFS, Worker, Streaming, Downloads und Wiederanlauf erforderlich. README, Root-AGENTS und strukturierte Architekturvorgaben werden zusammen gepflegt, wobei Ziel und implementierter Stand getrennt bleiben.

**Nächste Freigaben:** Weitere Zielbrowser prüfen und produktive Datenbankquellen konfigurieren; zusätzliche Importmodi erst nach Festlegung von Schlüsseln und Konfliktregeln ergänzen.
