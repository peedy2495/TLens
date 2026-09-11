# Status

SUCCESS

# Implemented

- Record trees (in-memory and storage-backed) offer right-click / Shift+F10 / ContextMenu-key "Als Filter hinzufügen" / "Add as filter" on every scalar and container, with Escape closing only the menu and viewport-clamped dismissal.
- Scalar filters apply as path-scoped typed exact matches (null, "", false, 0 distinguished); containers apply as path existence filters; dotted/slashed keys and array indices addressed by explicit segments; duplicates rejected; chips show path plus value/existence; detail closes on apply.
- Timeline detaches via header WindowIcon into a popup window (portal, copied styles/theme/language/title, full controls incl. pagination), stays synchronized, returns inline on child close; settings navigation cannot strand it; single storage owner kept.
- Split intent persists in localStorage; child close clears it while app reload/close retains it with a localized restore action; blocked popups keep a usable inline chart with feedback.
- Documented filter/split/popup behavior in README; added path-filter unit tests; verified with unit suite, production build, storage/settings browser checks, and a focused new-feature browser pass.

# Changed Files

- src/lib/data.ts, src/components/App.tsx, src/components/RecordTree.tsx, src/components/StoredRecordTree.tsx, src/styles.css, README.md, .agents/PLAN.md (marked Completed)
- src/components/RecordFilterMenu.tsx, src/lib/record-filter.test.ts

# Verification

- `npx vitest run` — passed (20 files, 168 tests).
- `npm run build` (Node 22, DLENS_VITE_CACHE override) — passed.
- `node scripts/check-storage-browser.mjs` vs production preview — passed.
- `node scripts/check-settings-browser.mjs` vs production preview — passed.
- Focused production browser pass (nested fixture: scalar/exists context filters, chips, row filtering, menu Escape, detach/sync/child-close/reload-restore) — passed.
- `git diff --check` — passed.
- Self-review — passed.

# Plan Deviations

- none

# Blockers

- none
