# Goal

Ready for implementation: make DLens an installable, offline-capable Progressive Web App following ../alkalye.

# Constraints

- Node 22, Astro 5/React, medium effort. Codex already inspected reference /home/Peedy/Projects/alkalye/astro.config.ts and /home/Peedy/Projects/alkalye/src/app/lib/pwa.tsx and fully specified the adaptation below. Executor needs no external-directory access: implement from this completed plan and local files only. The previous executor incorrectly resolved the reference as /home/Peedy/alkalye and was denied before implementation; do not request that path or change permissions. Preserve branding/routes/data; no sharing, editor features or unrelated dependencies.
- Baseline modified: .agents/AGENTS.md, .agents/skills/data-ingestion-architecture/references/search-tables-views.md, PLAN.md, README.md, src/components/App.tsx, src/lib/data.test.ts, src/lib/data.ts, src/lib/ingestion/contracts.ts, src/lib/storage/repository.ts. Untracked: src/lib/storage/filter-options.test.ts, demo/weitklang-festival-2027.json. No staged changes. Preserve all. NEVER stash/reset/clean even to test a baseline. No commit/push/deploy. Baseline diff /tmp/tlens-before-pwa.diff; previous completed plan /tmp/tlens-filter-plan-completed.md.
- Known baseline: 17 focused tests/build passed; full suite fails on missing public/demo/weitklang-festival-2027.json and two pipeline timeouts. Report separately; do not repair unrelated data/tests. At handoff a concurrent user edit removed public/ from .gitignore (confirmed before executor edits). Preserve this latest user change; public assets are now versionable. Do not restore a public/ ignore rule.
- Technology decision: @vite-pwa/astro ^1.2.0, vite-plugin-pwa ^1.2.0 and workbox-window ^7.4.0 as needed for virtual registration, same MIT family as reference. Use compatible published versions; no Astro upgrade. Astro integration handles final HTML better than a raw Vite plugin; handwritten SW adds unnecessary lifecycle/cache code. Official sources: https://vite-pwa-org.netlify.app/frameworks/astro and https://vite-pwa-org.netlify.app/guide/prompt-for-update.html .
- Flow: production build -> generated manifest + Workbox GenerateSW precache -> React registration/install/update -> existing StorageClient/SQLite worker/OPFS. No storage/schema/ingestion changes. Precache ONLY index.html, _astro/**/*.{js,css,wasm,woff,woff2}, favicon.svg and icons/*.png, with 5 MiB per-file ceiling (current largest JS 1.3 MiB). No runtime caching, demos, user files, credentials or HTTP/API responses. Include every emitted worker and WASM dependency for offline cold starts.
- Manifest id/start_url/scope '/', standalone, orientation any, DLens/Data Explorer description, orange #f97316 theme, #f6f8fa background. Single generated manifest/link. Navigation fallback index.html ONLY for root / with optional query, never API/arbitrary paths. Production SW only, dev disabled.
- registerType prompt, no forced skipWaiting/clientsClaim/auto reload. User-triggered update disabled AND guarded while working (import/delete/migration); Later defers. Existing Web Lock ownership stays intact. SW naturally activates after all old windows close. Errors must not break ordinary app use. Offline readiness must reflect successful caching, not merely navigator.onLine.

# Tasks

## 1. Build, manifest and icons

Files:
- package.json, package-lock.json, astro.config.mjs, src/pages/index.astro, src/env.d.ts if needed, .gitignore, vercel.json
- public/favicon.svg, public/icons/dlens-192.png, public/icons/dlens-512.png, public/icons/dlens-maskable-512.png, public/icons/apple-touch-icon.png
- scripts/generate-pwa-icons.mjs if needed

Changes:
- Install PWA dependencies and configure settled policy. Use virtual:pwa-info manifest link and touch/mobile metadata. Register through React virtual:pwa-register dynamic import within effect (reference pattern), no duplicate injection.
- Original DLens D icons matching existing rounded orange mark: code-native SVG rasterized with existing sharp (Astro dependency) or browser, no image AI or copied Alkalye images. PNG sizes 192/512/180, maskable opaque background with foreground inside central safe zone. Keep reproducible source/script.
- Preserve the user's just-removed public/ ignore rule; assets are now normally versionable. Do not add public ignore rules or move/change demo data.
- Preserve Vercel settings, add scoped no-cache response headers for /sw.js, /manifest.webmanifest and root HTML. No deployment.

Verification:
- npm run build including typecheck; inspect manifest/link/icons and SW precache includes workers/WASM, excludes domain/demo/API data.

## 2. Installation and update UI

Files:
- src/lib/pwa.ts (or tsx), src/components/PwaSettings.tsx, src/components/App.tsx, src/styles.css
- src/lib/pwa.test.ts if meaningful non-UI helpers need coverage

Changes:
- Hook stays mounted in WorkspaceApp; UI in General settings takes language/working. Capture beforeinstallprompt on mount, invoke only from click, consume after use, clear on appinstalled. Detect standalone including navigator.standalone and display-mode changes. Clean listeners.
- Show Install DLens when prompt exists; otherwise compact browser-menu/Share -> Add to Home Screen or Safari macOS Add to Dock guidance qualified by support. Installed state when standalone. No unsolicited install popup.
- Truthful offline-ready/error status in settings. DE/EN nonmodal update notice in main workspace with Update/reload and Later. Later hides notice while keeping update available in settings. Handler guard + disabled while working. Contained localized registration/install/update errors; no extra toast dependencies. Rounded light/dark/mobile styles and existing Heroicons if needed.

Verification:
- Production browser checks below cover lifecycle. Synthetic installation flow tests must not be described as native OS installation.

## 3. Browser regression and docs

Files:
- scripts/check-pwa-browser.mjs, package.json (test:pwa), README.md, .agents/AGENTS.md (PWA requirements only), docs/pwa.md if useful

Changes:
- npm run test:pwa uses existing puppeteer-core/Chrome, isolated profile and loopback static dist server. Correct JS/WASM/manifest MIME, reject traversal, close browser/server in finally. Allow browser executable override. Artifacts only artifacts/pwa-check; never use real profiles/data.
- Assert manifest/icon dimensions/single link and CDP installability where supported. Wait for real SW ready/control. Import tiny JSON fixture through UI, verify rows, disable HTTP cache, go offline and reload/reopen, select persisted source and verify rows/search/filter. Exercise offline local import. Inspect WASM/workers cached and no domain/API data. Assert non-root API navigation cannot fall back to index.
- Real update regression: after initial activation serve generated SW with changed test-only suffix; registration.update(); assert waiting and no automatic reload; Later then settings action; explicit update reload preserves OPFS records. Exercise working guard through UI where feasible, no production test hooks. Synthetic beforeinstallprompt consumption/appinstalled/standalone flow tests; distinguish native install. Save desktop/mobile settings screenshots.
- Run npm test, npm run build, npm run test:pwa, git diff --check. Report baseline failures separately, no large benchmark. If tools/permissions prevent browser run, report exact command/blocker for Codex escalation.
- Document installation, first online load/cache readiness, offline local operations, remote network need, explicit update, browser/HTTPS or localhost requirement, existing OPFS/one-window constraint. Do not promise cross-device sync or universal/shared storage across installation platforms. Preserve existing docs and requirements, document static Vercel and production check command.

Verification:
- Commands above and final diff/new-files review.

# Acceptance Criteria

- Single root-scope DLens manifest, valid regular/maskable/touch icons and production SW; install/manual guidance and installed-state handling.
- Offline cold reload after online preparation opens persisted local records and supports local import/search/filter. All JS/WASM workers precached; domain stores unchanged, connector network-only.
- Real update waits for explicit action; defer works, update guarded during working and OPFS survives reload.
- DE/EN, light/dark, desktop/mobile usable; ordinary dev unaffected.
- Build, PWA browser regression and diff check pass. Full test results distinguish baseline failures. Preserve prior changes and report exact evidence/blockers.
