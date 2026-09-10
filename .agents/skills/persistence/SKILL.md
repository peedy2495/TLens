---
name: persistence
description: SQLite WASM/OPFS, repository boundaries, schemas, migrations, data durability and storage quota. Load only for persistence-related work.
---

# Persistence

## Principles

- SQLite WASM/OPFS is the primary local structured persistence architecture where supported by the current implementation.
- Keep SQL and storage mechanics behind focused persistence/repository boundaries where practical.
- Preserve existing user data across schema, naming and storage migrations unless destructive behavior is explicit.
- Prefer transactional, idempotent and recoverable migrations. Do not delete the old representation before the new representation is confirmed usable.
- Handle storage/OPFS/SQLite/quota failures explicitly; avoid silent in-memory fallbacks that change durability semantics.
- Keep large imports bounded and transaction sizes reasonable.
- Use relational tables for stable/query-heavy structures, parent/child representation for arbitrary hierarchy, and JSON for flexible/source-specific attributes when that tradeoff fits the actual workload.
- Question existing persistence choices when a simpler, safer or more maintainable design meets the task.

Read only when relevant:

- `references/storage-model.md` for model/index/traceability considerations.
- `references/migration-and-quota.md` for migration, quota and original-file retention concerns.

Optional example: `examples/entity-schema.sql` when a concrete generic hierarchy schema example is useful.
