# Storage Model

## Storage roles

Use:

- `localStorage` only for small preferences/settings
- SQLite WASM for primary structured/domain persistence
- OPFS as the SQLite persistence backend where supported
- IndexedDB only where it is clearly useful as a browser-native metadata/cache
  mechanism, not as the primary relational store

## SQLite + OPFS

SQLite should preferably run inside a worker.

Evaluate the available OPFS VFS options against the actual browser and
concurrency requirements, including:

- `opfs-sahpool`
- `opfs`
- `opfs-wl`

Consider:

- batch-import performance
- concurrency needs
- multi-tab behavior
- browser requirements
- COOP/COEP requirements
- stability and operational complexity

For one central database worker plus large batch imports, `opfs-sahpool` is a
strong candidate if its concurrency model fits the application.

## Hybrid relational/hierarchical model

Do not flatten every nested JSON/XML/YAML document into a large number of
tables.

Use three complementary strategies.

### 1. Relational domain tables

Use normal relational tables for stable, known, frequently queried structures.

Examples:

```text
customers
- id
- name

orders
- id
- customer_id

order_items
- id
- order_id
- product_id
- quantity
```

Prefer normal columns when fields are frequently:

- filtered
- sorted
- grouped
- joined
- aggregated
- indexed

### 2. Generic hierarchy

Use a generic entity tree for arbitrary or dynamic hierarchy.

Conceptual schema:

```sql
CREATE TABLE entities (
    id INTEGER PRIMARY KEY,
    dataset_id INTEGER NOT NULL,
    import_id INTEGER,
    parent_id INTEGER,
    position INTEGER,
    entity_type TEXT,
    external_id TEXT,
    name TEXT,
    attributes JSON,
    source_path TEXT,

    FOREIGN KEY(parent_id)
        REFERENCES entities(id)
);
```

This must support structures such as:

```text
root
├── child A
│   ├── child A1
│   └── child A2
└── child B
```

`position` or an equivalent field should preserve sibling/array order when
order is semantically relevant.

### 3. JSON attributes

Use JSON columns for:

- dynamic fields
- source-specific properties
- optional metadata
- unstable schema fragments
- rarely queried values

Do not hide heavily queried fields only inside JSON when they should be indexed
or joined relationally.

## Hierarchy queries

Support at least:

- direct children
- direct parent
- descendants
- ancestors
- path to root
- optional depth
- deterministic sibling ordering

Example recursive query:

```sql
WITH RECURSIVE tree AS (
    SELECT *
    FROM entities
    WHERE id = ?

    UNION ALL

    SELECT e.*
    FROM entities e
    JOIN tree t
      ON e.parent_id = t.id
)
SELECT * FROM tree;
```

## Indexes

At minimum evaluate:

```sql
CREATE INDEX idx_entities_parent
    ON entities(parent_id);

CREATE INDEX idx_entities_dataset
    ON entities(dataset_id);

CREATE INDEX idx_entities_type
    ON entities(entity_type);

CREATE INDEX idx_entities_external
    ON entities(external_id);
```

Avoid unnecessary over-indexing.

## Source traceability

Where useful, retain source provenance such as:

- source id
- dataset id
- import id
- row number
- line number
- original key
- source path

Example source paths:

```text
/customer/orders/3/items/2
```

```text
customers[5].orders[2]
```

This should make import errors and persisted entities traceable back to the
source.
