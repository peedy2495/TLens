# Goal

Ready for implementation: constrain additional filter field/value choices to records matching the current search and all active filters, so users refine their current results.

# Constraints

- Preserve SQLite worker ownership, bounded result/value paging, nested-field semantics, equals/contains filters, dates/time pickers, language sorting, saved views, and all stored data. No schema migration or dependencies needed.
- Architecture: use Repository.where(q) to scope field discovery and value suggestions to matching records across the entire dataset (not just current table/path/row pages). Return these filter fields on QueryResult, separate from dataset-wide display-column metadata. Reuse the existing fields-to-record relation and generation constraint, as existing filtered table-column/date queries do.
- Include search text and every active filter, including an existing filter on the selected field. The unfinished filter value only narrows value suggestions, never the field list. Keep manual input/contains matching as documented; this task restricts available choices, not all possible manually typed searches.
- Source-wide settings, display-column configuration and time mappings must not become limited to current matches. No fallback to unfiltered choices when zero matches or while new choices load.
- Handle async requests: stale choices must not remain selectable/submittable during search/filter/source changes; preserve existing cancellation protection. Reset suggestion pagination when context changes (source, generation/revision, query, filters, field/value). Reconcile an unavailable selected field and clear its value after fresh results, without requery loops. At zero matches disable adding filters and offer existing clear/reset actions. Keep valid manual input when context remains unchanged.
- Legacy in-memory branch must derive choices from filterTables(legacyTables, query, filters), not all tables.
- Pre-existing working tree: .agents/AGENTS.md and README.md modified by workflow setup; root AGENTS.md and .agents/skills/opencode-executor/ untracked. Preserve all this content. This PLAN.md is Codex's handoff; do not edit executor scripts or orchestration rules. Effort: medium.

# Tasks

## 1. Regression tests and repository query

Files:
- src/lib/storage/repository.ts
- src/lib/ingestion/contracts.ts
- src/lib/storage/filter-options.test.ts (new focused tests; use migration.test.ts patterns for real SQLite WASM)

Changes:
- First demonstrate current suggestions include excluded fields/values with a failing regression test.
- Add matching filter fields to QueryResult in every return branch. Query unique recursive field names and field values over matching records, preserving limits, deduplication and sorting; avoid schema or ingestion changes.
- Cover AND filters and search, nested fields, zero results, filter removal restoring options, multiple table paths, more than one row/path page and paginated distinct values. Ensure unrelated source/generation values cannot leak.

Verification:
- npm test -- src/lib/storage/filter-options.test.ts

## 2. UI context and selection lifecycle

Files:
- src/components/App.tsx
- src/lib/data.ts and focused tests if a small shared helper makes state handling testable
- src/components/ tests only as useful with existing tooling

Changes:
- Consume matching filter fields and values, handle pending/stale query context and reset/reconcile selection/value paging as specified.
- Preserve field ascending and value descending natural language sort. Keep nested field paths. Do not alter source-wide display/settings metadata.
- Add meaningful tests for context changes/empty suggestions and in-memory filtering; use existing tools without adding dependencies. Report if interactive browser verification cannot be run.

Verification:
- Relevant focused tests, then npm test and npm run build (includes typecheck). No lint script exists.

## 3. Documentation

Files:
- README.md
- .agents/AGENTS.md (only Search and filters section)
- .agents/skills/data-ingestion-architecture/references/search-tables-views.md

Changes:
- Document choices from current search+filter matches, full-result rather than current-page scope, and manual input remaining supported. Preserve all other rules and workflow setup.

Verification:
- git diff --check; inspect scope and report exact test/build outcomes.

# Acceptance Criteria

- With Area=Stage 1 active, fields exclusive to excluded records and Stage 2-only values are absent; further choices come only from current matching records, including nested fields.
- Search and all active filters constrain both selectors; removing filters expands options again.
- Matching records outside displayed table/row pages contribute choices; value paging stays bounded and resets on context changes.
- Zero results show no unfiltered fallback; stale async suggestions cannot add a filter after context changes.
- Display/settings columns, existing data, manual filter entry, sorting and matching semantics remain intact.
- Focused regressions, full tests and build pass; documentation updated. Report blockers instead of changing architecture.
