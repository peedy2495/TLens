# Connector Contracts

## Goal

All sources should expose a consistent bounded-memory reading model so the
downstream ingestion pipeline does not care whether data originates from XML,
CSV, JSON, PostgreSQL, or an HTTP API.

## Conceptual interfaces

Adapt names/types to the project's language and architecture.

```ts
interface DataBatch<T = unknown> {
  records: T[];
  processedBytes?: number;
  totalBytes?: number;
  processedRecords?: number;
  done: boolean;
}

interface ConnectorCapabilities {
  streaming: boolean;
  cancellable: boolean;
  knownTotalSize: boolean;
  schemaDiscovery: boolean;
  preview: boolean;
  resumable: boolean;
}

interface Connector<T = unknown> {
  readonly capabilities: ConnectorCapabilities;

  open(signal?: AbortSignal): Promise<void>;

  read(
    options?: ReadOptions
  ): AsyncIterable<DataBatch<T>>;

  close(): Promise<void>;
}
```

## Required behavior

Connectors should support where applicable:

- incremental reads
- `AsyncIterable`, streams, or equivalent backpressure-aware primitives
- cancellation
- cleanup
- source-specific error conversion
- progress metadata
- preview
- schema discovery

## Backpressure

Never allow a fast source parser to produce an unbounded number of records
while persistence is slower.

Prefer:

```text
Connector
↓
bounded batch
↓
Normalizer
↓
Mapper
↓
SQLite transaction
↓
commit
↓
next batch
```

Avoid:

```text
Parser
→ millions of records in one array
→ database later
```

## Normalized record concept

A neutral internal record can look like:

```ts
interface DataRecord {
  sourceId: string;
  datasetId: string;

  entityType?: string;
  externalId?: string;
  parentExternalId?: string;

  fields: Record<string, unknown>;

  metadata?: {
    sourcePath?: string;
    rowNumber?: number;
    lineNumber?: number;
    position?: number;
  };
}
```

If the existing application already has a suitable domain representation, reuse
it instead of introducing redundant abstractions.

## Mapping

Do not hard-code domain mappings inside connectors.

Example:

```text
XML customer
CSV customer
JSON customer
PostgreSQL customer
       ↓
    Mapper
       ↓
internal Customer
```

## Preview

Where useful, provide a generic preview capability such as:

```ts
connector.preview({ limit: 100 })
```

This can power UI previews of:

- fields
- columns
- types
- sample values
- hierarchy

## Schema discovery

Design for optional source schema discovery.

For files this may be heuristic.

For future database connectors it may expose:

- catalogs/databases
- schemas
- tables
- views
- columns
- types
- keys
