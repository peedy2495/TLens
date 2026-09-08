# Migration Compatibility Matrix

This document reconciles the existing DLens requirements with the target
data-ingestion architecture.

| Area | Current baseline | Target | Migration rule |
|---|---|---|---|
| Local domain persistence | Jazz | SQLite WASM + OPFS | Do not destroy existing Jazz data. Add explicit migration/transition logic. |
| Browser preferences | `tlens-` legacy + newer naming | `dlens-` | Read legacy values as fallback when new key is absent. |
| File-size limit | documented up to 5 MB | large files, including ~2.2 GB XML | Replace small-file architectural limit where technically applicable; keep validation UX coherent. |
| XML parser | browser XML parser / DOM-oriented | streaming/SAX for large XML | Preserve data conversion semantics while replacing whole-file parsing for large inputs. |
| JSON/YAML table behavior | arrays of objects become tables per data path | hybrid relational/entity-tree persistence | Preserve user-visible table/data-path semantics independently of internal storage. |
| CSV | detailed parser/export rules | streaming connector | Preserve all CSV semantics while making implementation incremental. |
| Database sources | Jazz current; MariaDB/PostgreSQL/SQLite targets not connected | extensible connector architecture | Add future adapters behind a shared connector contract. |
| UI/search/timeline | existing behavior | unchanged unless explicitly requested | Architecture work must not regress product behavior. |

## Important implementation principle

Internal persistence changes must not be allowed to silently alter:

- source selection
- import validation
- conversion semantics
- recursive search/filtering
- table grouping by data path
- sorting
- saved views
- timeline mapping and visibility
- CSV export behavior
- settings structure
- product naming/design requirements

When a migration requires changed behavior, document the change explicitly in
README/root AGENTS and tests.
