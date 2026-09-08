# Architecture

## Target architecture

```text
UI
│
├── source selection
├── source configuration
├── mapping configuration
├── import controls
├── progress/errors
└── data views
        │
        ▼
Ingestion Service
        │
        ▼
Connector Layer
├── File Connectors
│   ├── YAML
│   ├── JSON
│   ├── XML
│   └── CSV
│
├── Database Connectors        ← later
│   ├── PostgreSQL
│   ├── MySQL/MariaDB
│   ├── SQL Server
│   └── others
│
└── API Connectors             ← later
    ├── REST
    ├── GraphQL
    ├── NDJSON/HTTP streaming
    └── WebSocket
        │
        ▼
Parser / Source Adapter
        │
        ▼
Normalizer
        │
        ▼
Mapper
        │
        ▼
Domain Tables / Generic Entity Tree
        │
        ▼
Repository Layer
        │
        ▼
SQLite WASM
        │
        ▼
OPFS
```

## Responsibility boundaries

Keep these responsibilities separate:

```text
Connector
= where the data comes from

Parser
= how the source format is read

Normalizer
= how technical values are normalized

Mapper
= how source data maps to the domain model

Repository
= how domain data is persisted/queryable

SQLite/OPFS
= concrete local persistence
```

Do not put source-specific parsing logic into repositories, and do not put
business mapping logic into connectors.

## Ingestion lifecycle

A typical import should follow:

```text
start
→ open connector
→ inspect/preview source if needed
→ read batch
→ parse
→ normalize
→ map
→ write transaction
→ report progress
→ next batch
→ complete
→ close connector
```

Cancellation and error propagation must work across the entire chain.

## Import and dataset model

Imports should be explicit domain objects.

Example conceptual model:

```text
Dataset
- id
- name
- source_type
- created_at

Import
- id
- dataset_id
- source_type
- source_name
- status
- started_at
- completed_at
- processed_records
- imported_records
- error_count
- import_version
```

Imported rows/entities should remain attributable to a dataset/import/source.

Support clearly defined modes such as:

- New
- Append
- Update
- Replace
- Upsert
- Re-import

Failed or cancelled imports must be identifiable and safely removable or rolled
back according to the application's chosen semantics.

## Repository layer

The UI and connector code should not issue arbitrary SQL directly.

Typical repositories may include:

- `DatasetRepository`
- `ImportRepository`
- `EntityRepository`
- `ProjectRepository`
- `SourceRepository`

Repositories should expose domain-oriented operations, for example:

```ts
getDataset(id)
createDataset(input)
deleteDataset(id)

createImport(input)
updateImportStatus(id, status)

getEntity(id)
getChildren(id)
getParent(id)
getDescendants(id)
getAncestors(id)
saveEntity(entity)
saveEntityBatch(entities)
```

## Source registry

Prefer a registry rather than hard-coding source types in many UI locations.

```ts
connectorRegistry.register("xml", XmlConnector);
connectorRegistry.register("csv", CsvConnector);
connectorRegistry.register("json", JsonConnector);
connectorRegistry.register("yaml", YamlConnector);
```

Future examples:

```ts
connectorRegistry.register("postgres", PostgresConnector);
connectorRegistry.register("mysql", MySqlConnector);
connectorRegistry.register("rest", RestConnector);
```
