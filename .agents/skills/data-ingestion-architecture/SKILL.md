---
name: data-ingestion-architecture
description: >
  Use this skill when modifying persistence, imports, connectors, hierarchical
  data handling, SQLite WASM, OPFS, workers, large-file processing, or future
  database/API source integrations.
---

# Data Ingestion Architecture

## Goal

Maintain and extend the application's data architecture around this pipeline:

```text
Source
→ Connector
→ Parser
→ Normalizer
→ Mapper
→ Domain Tables / Generic Entity Tree
→ Repository
→ SQLite WASM
→ OPFS
```

The application currently supports YAML, JSON, XML, and CSV files. It must also
be designed so that future database and API connectors can be added without
rewriting the ingestion or persistence layers.

A concrete large-file requirement is XML input of approximately 2.2 GB.
Such files must never be loaded fully into memory.

## Core rules

1. Do not use `localStorage` for domain data.
2. Use `localStorage` only for small UI preferences and similarly tiny settings.
3. Use SQLite via WebAssembly as the primary local database for structured,
   relational, and queryable domain data.
4. Persist SQLite via OPFS where supported.
5. Run SQLite and heavy parsing/import work outside the main UI thread,
   preferably in a dedicated Web Worker.
6. Never load multi-GB files fully into RAM.
7. XML and large CSV/JSON imports must use streaming or another bounded-memory
   incremental approach.
8. Preserve hierarchical data using the hybrid storage model:
   - known, frequently queried structures → relational tables
   - arbitrary hierarchy → `id + parent_id + position`
   - dynamic/source-specific attributes → JSON
9. Keep connectors independent from business/domain mapping.
10. Keep SQL behind repositories or another data-access abstraction.
11. Build imports around batches, transactions, cancellation, progress, and
    backpressure.
12. New source types must integrate through the same connector abstraction.

## Before changing code

Inspect the existing project before large changes:

- all `localStorage` usage
- current domain/data models
- YAML/JSON/XML/CSV import logic
- parsers and parsing libraries
- worker usage
- service/repository layers
- search/filter/query code
- export logic
- state management
- tests
- framework and build tooling

Reuse sound existing patterns and dependencies where reasonable. Avoid a full
rewrite unless it is genuinely required.

## Large-file rule

For large XML files, do not use:

```js
await file.text()
```

and do not build a full DOM with:

```js
new DOMParser()
```

Required conceptual pipeline:

```text
File.stream()
→ Worker
→ Streaming/SAX parser
→ bounded parser state
→ records/batches
→ normalizer
→ mapper
→ SQLite transaction
→ commit
```

The design must be capable of processing at least a 2.2 GB XML file without
holding the complete source document or full parsed tree in RAM.

## Persistence principle

Use this rule when deciding how to persist data:

```text
known, frequently queried structure
→ relational tables

arbitrary hierarchy
→ id + parent_id + position

dynamic attributes
→ JSON

source traceability
→ dataset_id + import_id + source_path
```

## Existing DLens product requirements

Architecture work must preserve the existing DLens product requirements unless
a task explicitly changes them.

The structured baseline is split across:

- `references/product-and-workflow.md`
- `references/existing-import-export.md`
- `references/search-tables-views.md`
- `references/timeline-field-mapping.md`
- `references/settings-design-technology.md`
- `references/festival-demo-data.md`
- `references/migration-compatibility.md`

The complete user-supplied baseline is retained verbatim in:

- `references/legacy-agents-baseline.md`

When existing and target architecture differ, follow
`references/migration-compatibility.md`: treat existing behavior as the product
baseline and migrate deliberately without silent regressions or destructive
data loss.

## Detailed references

Read the relevant reference before modifying that area:

- `references/architecture.md`
- `references/storage-model.md`
- `references/connector-contracts.md`
- `references/file-formats.md`
- `references/workers-and-streaming.md`
- `references/future-connectors.md`
- `references/migrations-and-quota.md`
- `references/security.md`
- `references/testing.md`
- `references/product-and-workflow.md`
- `references/existing-import-export.md`
- `references/search-tables-views.md`
- `references/timeline-field-mapping.md`
- `references/settings-design-technology.md`
- `references/festival-demo-data.md`
- `references/migration-compatibility.md`
- `references/legacy-agents-baseline.md`

## Expected end state

The application should:

- continue supporting YAML, JSON, XML, and CSV
- process at least 2.2 GB XML inputs incrementally
- avoid loading large sources completely into RAM
- store relational data efficiently in SQLite
- preserve arbitrary JSON/XML/YAML hierarchies
- use JSON attributes for flexible source-specific fields
- persist SQLite through OPFS where appropriate
- keep expensive work out of the UI thread
- support progress and cancellation
- handle backpressure and bounded queues
- migrate existing domain data safely away from `localStorage`
- provide a clean path for PostgreSQL, MySQL, SQL Server, APIs, and other
  future sources
