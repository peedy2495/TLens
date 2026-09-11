# Status

SUCCESS

# Implemented

- Localized date-picker tooltip via existing IconButton in timeline date navigation (covers detached timeline).
- Flat/tree toggle for Anzeige visible fields using ArrowDownOnSquareStackIcon / ArrowUpOnSquareStackIcon, flat by default.
- Source-wide field hierarchy with collapsible branches and shared name-based selection; legacy Jazz tables derived locally.
- New `structure` storage request backed by a bounded path/name-only query, refreshed on source/generation changes with stale-response guard.
- Animated branch expansion/mode switch with reduced-motion, keyboard and theme-safe styling.

# Changed Files

- src/components/App.tsx, src/styles.css, src/lib/field-tree.ts, src/lib/storage/repository.ts, src/lib/storage/worker.ts, src/lib/ingestion/contracts.ts
- src/lib/field-tree.test.ts, src/lib/storage/field-structure.test.ts, scripts/check-columns-browser.mjs

# Verification

- `npx vitest run src/lib/field-tree.test.ts src/lib/storage/field-structure.test.ts src/lib/storage/filter-options.test.ts src/lib/data.test.ts` — passed (25 tests).
- `node scripts/check-columns-browser.mjs` (against dev server) — passed.
- `npx astro check` — passed (0 errors); `npm run build` — passed; `git diff --check` — passed.
- Self-review — passed.

# Plan Deviations

- none

# Blockers

- none
