# Migration, Quota, and Persistence

## localStorage migration

Existing domain data in `localStorage` must be migrated safely.

Migration must:

- detect legacy data
- validate it
- import it into SQLite
- be idempotent
- preserve the old data until the new transaction is confirmed successful
- avoid destructive cleanup on failure
- be versioned so it is not repeatedly re-run

## Quota

Before large imports, estimate browser storage:

```js
navigator.storage.estimate()
```

If available and appropriate, request persistent storage:

```js
navigator.storage.persist()
```

Do not assume that persistence will always be granted.

Handle clearly:

- quota exhaustion
- OPFS errors
- SQLite errors
- low disk/storage conditions

## Original large files

Do not automatically duplicate a selected 2.2 GB file into OPFS.

Prefer:

```text
selected File
↓
stream
↓
worker/parser
↓
SQLite
```

Only persist an original source file in OPFS if the product explicitly needs a
durable copy.

Avoid unnecessary storage growth such as:

```text
2.2 GB source
+
2.2 GB OPFS copy
+
derived SQLite database
```
