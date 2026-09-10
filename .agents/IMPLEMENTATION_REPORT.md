# Status

SUCCESS

# Implemented

- Local file reload: same ArrowPathIcon reload after trash for genuine local file datasets (incl. legacy), excluded for URL/connector/API/jazz.
- Dedicated hidden picker with independent pending target, cancel clearing, same-file reselection, pre-delete filename/genuine-path validation.
- Durable local source groupId on new imports (all YAML parts), preserved across reload; path identity where known; legacy unknown-path targets resolve to the selected row only; path-based reimport policy unchanged.
- In-app help paragraph and README (sources + YAML sections) explain fresh-selection local reload.
- Browser smoke adapted (actions-edge assertion, URL-row-scoped reload click) and extended with local reload fixture incl. restart and mismatch cases.

# Changed Files

- src/components/App.tsx
- src/lib/source-identity.ts
- src/lib/source-identity.test.ts
- src/lib/ingestion/contracts.ts
- src/lib/ingestion/service.ts
- src/lib/ingestion/replacement.test.ts
- scripts/check-storage-browser.mjs
- README.md

# Verification

- npx vitest run src/lib/source-identity.test.ts src/lib/ingestion/replacement.test.ts: passed (21 tests).
- npx vitest run: passed (18 files, 159 tests).
- npx astro check: passed (0 errors).
- npm run build: passed.
- DLENS_TEST_URL=http://127.0.0.1:4347 node scripts/check-storage-browser.mjs (own preview on port 4347 with DLENS_RELAY_ALLOW_LOOPBACK=1, isolated profile): passed, incl. local reload order/replace/restart/mismatch and URL reload.
- git diff --check: passed.
- Self-review against baseline and acceptance criteria: passed.

# Plan Deviations

- none

# Blockers

- none
