# Status: Completed (SUCCESS, see .agents/IMPLEMENTATION_REPORT.md)

# Goal

Completed: finished the existing DLens PWA implementation and prove installation flow,
offline local operations and explicit safe updates with meaningful production-browser
regressions. The interrupted legacy executor supplied no final report. Preserve its
valid implementation and the user's subsequent commits/changes. Finish with Muse
self-review and a compact .agents/IMPLEMENTATION_REPORT.md under the new workflow.

# Continuation State

- Task 1 lifecycle/UI changes and build already passed in the previous run.
- Browser test now reaches offline field filtering. It types Stage then immediately
  clicks a disabled submit while the 150ms query/debounce is refreshing suggestions.
  In the test wait for .filter-form button.primary:not(:disabled) before clicking;
  preserve the production freshness guard. Also target the actual filter-chip remove
  button when resetting, not a generic .chip container. Inspect the existing App markup.
- The last run stopped when trying Write /tmp/pwa-debug.mjs, which OpenCode rejects
  as an external directory. No need for external writes: ALL debug files and screenshots
  MUST stay in the already authorized artifacts/pwa-check directory. Never request /tmp
  or another external_directory, change permission settings or loosen test assertions.
- Complete remaining browser checks, ordinary fixes, documentation, self-review and
  final report. Do not repeat completed analysis/tasks or unrelated successful checks.
  Preserve previous changes. Report precise results even if a tool fails.

# Current Architecture

- Astro 5 static root page src/pages/index.astro hydrates WorkspaceApp in
  src/components/App.tsx. That component owns language (de/en), working for import/
  deletion, StorageClient and OPFS worker lifetime. It calls usePwa(working) and
  renders PwaSettings in General plus .pwa-update-banner in the main workspace.
- src/lib/pwa.ts exports BeforeInstallPromptEvent, PwaState, usePwa and
  detectInstalled. The hook captures install events, dynamically registers
  virtual:pwa-register, stores an update callback and guards it with workingRef.
  detectInstalled currently exists only for trivial tests; use it in real detection.
- src/components/PwaSettings.tsx renders installation, offline and update status.
  It currently claims no pending update after Later, despite retaining the action.
  Offline status contains unnecessary worker/database implementation details.
- astro.config.mjs already uses @vite-pwa/astro 1.2.0, vite-plugin-pwa 1.3.0 and
  workbox-window 7.4.1. GenerateSW prompt, no forced activation, production only,
  root manifest and root navigation fallback. It precaches emitted JS/CSS/WASM
  plus icons. vercel.json has revalidation headers; scripts/generate-pwa-icons.mjs
  reproducibly creates existing PNGs. Do not redesign or replace these.
- SQLite StorageClient -> dedicated worker -> Repository -> OPFS already handles
  persistence, imports, query/filter, and a one-window Web Lock. No changes needed.
- scripts/check-pwa-browser.mjs starts a loopback dist server and isolated Chrome,
  imports fixtures, reloads offline, changes served SW suffix for a waiting update,
  and records screenshots. Its install/working-guard checks are currently tautologies,
  not real behavior checks; Later is optional and failures can be skipped. Browser
  launch occurs before try/finally, risking an open server on launch failure.
- Existing baseline includes prior filter fixes and a new workflow maintained by
  Codex. Follow .agents/AGENTS.md and do not edit workflow scripts/rules/templates.

# Constraints

- Use Node 22, Muse Spark 1.3 Contributor, medium. Never delegate recursively.
- Baseline at resumption: modified .agents/AGENTS.md, .gitignore, README.md,
  package.json, src/components/App.tsx, src/pages/index.astro, src/styles.css;
  untracked docs/pwa.md, public/, scripts/check-pwa-browser.mjs,
  src/components/PwaSettings.tsx, src/lib/pwa.test.ts, src/lib/pwa.ts.
  Codex then changed AGENTS.md, PLAN.md (routing note), README workflow section,
  .agents/AGENTS.md workflow section, executor skill/scripts/templates and created
  this canonical plan. Preserve all those changes. git status is authoritative for
  any additional user changes. No stash/reset/clean/commit/push/deploy.
- Reference analysis is complete: /home/Peedy/Projects/alkalye uses Astro PWA and
  explicit update notifications. Do not request any external-directory access.
- Preserve manifest id/start_url/scope '/', standalone/any orientation, DLens name,
  #f97316/#f6f8fa colors, regular 192/512, maskable512, touch180 icons and one link.
- Cache only app shell, built workers/WASM and icons/generated manifest; no runtime
  caching, user/demo data, tokens or HTTP responses. Remote import needs network.
- Preserve database generation/rollback/one-window semantics and existing API types.
  No schema changes, new persistence, dependencies, abstraction layers or refactors.
- No forced skipWaiting/clientsClaim. Explicit user update may send SKIP_WAITING
  via plugin API; automatic reload/activation is forbidden while an old tab stays.
- Existing full-suite failures: missing public/demo/weitklang-festival-2027.json and
  two pipeline tests hitting 5s timeouts. Run full suite once and report exact result.
  These previously observed failures are accepted baseline exceptions ONLY if still
  the same; do not fix or hide them. All PWA checks/build must pass for SUCCESS.

# Design Decisions

## 1. Retain the existing PWA hook and component boundary

Chosen: PwaState and usePwa stay mounted in WorkspaceApp; PwaSettings is presentational.
Keep signatures usePwa(working:boolean):PwaState and PwaSettings({language,working,pwa}).
Use React state for render changes and refs for synchronous one-shot/working guards.
Reason: protects import lifecycle and avoids transient settings mounts losing events.
Do not use a context/provider, separate app store, another toast library or a custom SW.

## 2. Truthful persistent offline readiness and deferred update status

Chosen: onOfflineReady marks ready on first successful install. On subsequent
loads, onRegisteredSW inspects registration.active (state activated) and marks ready;
if installation is pending, use the existing ready promise/activation signal with
cancelled cleanup to mark ready only for an activated registration in this scope.
A successfully activated SW has completed the precache; navigator.onLine alone does
not imply readiness. Do not set ready merely on registerSW invocation. No new storage key.
Later hides only banner; settings say an update is available, even when deferred.
User copy says DLens is available offline, without worker/database-runtime details.

## 3. One-shot installation and localized failure presentation

Chosen: store the deferred event in a ref as well as state. requestInstall takes and
clears the ref/state before await so double activation cannot reuse it. Ignore a new
install prompt when already installed; appinstalled clears both and marks installed.
Use detectInstalled(displayStandalone,navigatorStandalone) in the real isStandalone
function; retain safe SSR and older matchMedia listener handling. Keep exported types.
Keep installError/swError as string fields for compatibility, but assign fixed error
codes 'install', 'registration' or 'update' and translate them in PwaSettings; do not
render raw exception messages. Console diagnostics optional, no credentials.

## 4. Behavior tests use real UI and service worker, no production test hooks

Chosen: existing Puppeteer test and loopback server; manipulate only test fixtures,
synthetic browser events and served SW response suffix. Assertions must fail when the
production callback/guard is removed. Native OS install is not claimed by simulation.
Hold a real import at the existing large-record warning dialog to make working true
without slow timing guesses; that existing warning is part of the product behavior.

# File Changes

## src/lib/pwa.ts

Current role: installation state and SW callbacks/lifecycle.
Required changes:
- Keep existing public interfaces/signatures. Add a deferred event ref and clear it
  before await in requestInstall and on appinstalled. Handle accepted/dismissed/rejected
  paths without double prompt. canInstall remains false while event consumed/installed.
- Use detectInstalled in isStandalone (not a test-only duplicate).
- Add onRegisteredSW readiness for already activated registration; cover pending
  initial activation without premature readiness and guard all async callbacks on cleanup.
- Preserve workingRef.current guard at start of applyUpdate, update callback and Later.
- Set error codes described above, clear previous relevant error when retrying.
Do not: add storage keys, export test-only production hooks or change SW strategy.

## src/components/PwaSettings.tsx

Current role: General settings PWA controls.
Required changes:
- Pending/deferred update copy depends on updateAvailable, not !updateDeferred.
- DE/EN ready text: 'DLens ist offline verfügbar.' / 'DLens is available offline.'
- Not-ready text explains one online load/cache completion; manual install guidance
  qualified by browser support. Installed state preserved.
- Render localized actionable install/registration/update error sentences, not codes.
- Update action disabled while working and remains available after Later.
Do not: auto-prompt installation or auto-update.

## src/components/App.tsx and src/styles.css

Current role: existing hook host, notice and settings layout.
Required changes:
- Preserve existing PWA hook integration and all filter work. Change only PWA notice
  wiring/layout if tests expose a concrete defect. Banner Update disabled while working,
  Later calls deferUpdate; General action uses same applyUpdate.
- Preserve responsive rounded dark/light styles; no unrelated reformat or redesign.

## scripts/check-pwa-browser.mjs

Current role: standalone production test runner.
Required changes:
- Move browser launch into try/finally with nullable browser; close server on all
  launch/test failures. Keep loopback binding, isolated profile, browser override,
  correct MIME, traversal bounds and ignored artifact paths.
- Wait for real ready/controller with bounded waitForFunction, not an evaluate call
  incorrectly passing {timeout} as a function argument. Fail clearly if dist SW absent.
- Assert offline-ready UI after controlled reload, not just initial installation.
- After offline reload/reselect, search pwa-001, verify one matching row then clear;
  add a field filter Area=Stage via actual filter UI, verify pwa-001 and no pwa-002,
  remove/reset it, verify two rows; offline import second fixture and verify exact ID.
- Keep HTTP cache disabled for offline checks. Inspect cache URLs after import too,
  reject API/demo/fixture URLs. Navigate a separate page offline to /api/records and
  assert app shell not rendered; close it promptly (no extra OPFS owner).
- After changing served SW suffix, require waiting worker AND visible .pwa-update-banner.
  Assert sentinel persists before action; Later MUST exist/click and hide banner.
  Open settings; assert pending update copy and enabled action after defer.
- Exercise working update guard before applying: close settings, import JSON fixture
  {Items:Array(31000).fill(0)} through file picker and wait .import-warning. The banner
  can be shown via a new update notification if needed; instead prefer open General
  before starting import then keep its update action mounted. Assert update button
  disabled while warning/import active and forced DOM click does not navigate, using
  sentinel. Cancel import via existing 'Import abbrechen', assert working settles and
  update re-enables; no production hooks or fixed disabled-is-boolean assertions.
  If existing modal focus requires it, page.evaluate may invoke the real DOM click.
- Click enabled Update, await real navigation, reselect exact persisted fixture and
  assert exact row values, not a source filename/body substring. No .catch ignoring
  failed required checks. Do not clear SW suffix to downgrade during this test.
- Replace fake promptFlow with new Event('beforeinstallprompt'), Object.defineProperties
  for prompt/userChoice on THAT event, dispatch, open settings, click actual Install
  DLens, assert prompt call counter exactly1 and control disappears after consumption.
  Exercise dismissed/rejected path then appinstalled -> installed copy. Use injected
  navigator.standalone before a fresh page load or CDP display-mode emulation to prove
  installed detection. No returning hardcoded true in test result.
- Save screenshots with dialog confirmed open at 1280x900 and 390x844; additionally
  assert DE/EN strings by switching existing language select and no horizontal overflow.
  Existing dark preference may be set before load to capture dark/mobile; no new UI.

## src/lib/pwa.test.ts

Required changes: retain useful installed detection tests now that helper is used
in production; browser tests prove callbacks. Do not add tests mirroring constants.

## README.md and docs/pwa.md

Required changes: align PWA status/behavior/tests with actual results. Preserve new
workflow text. Explain first-load readiness, local offline data, remote network,
HTTPS/localhost/OPFS, one-window ownership and installation storage variability.
Document skipped native OS installation separately from synthetic flow.

# New Files

None required for implementation. Muse must write .agents/IMPLEMENTATION_REPORT.md
from references/implementation-report-template.md after checks/self-review. Existing
untracked PWA files/icons are part of the baseline, not permission to discard them.

# Data Flow

1. WorkspaceApp passes working to usePwa; hook keeps latest value in workingRef.
2. Browser event delivers a one-shot install event -> ref/state -> General button.
3. Click synchronously consumes event -> native prompt -> outcome/error -> UI state.
4. Production registration -> activated SW readiness / waiting-update notification.
5. Later hides banner only; explicit Update consults workingRef before plugin callback.
6. Accepted update reloads app; unchanged StorageClient reacquires lock and reads OPFS.

# Error Handling

- Registration/dynamic import failure -> swError='registration', localized UI, app usable.
- Prompt failure -> installError='install', event consumed, future event allows retry.
- Update failure -> swError='update', no forced reload, action can be retried.
- Working true -> applyUpdate returns without side effect; no error, button disabled.
- Cancel/unmount -> cleanup listeners/cancel async state updates; preserve domain data.
- Test launch/failure -> finally closes browser and server, nonzero exit; no false PASS.

# Edge Cases

- First online install versus subsequent offline cold reload readiness.
- Double install click; dismissed prompt; rejected prompt; appinstalled; iOS standalone.
- Waiting update deferred, then import warning/cancellation before explicit update.
- Multiple windows retain existing lock error, not a new memory fallback.
- API/non-root offline navigation must fail rather than serve cached app shell.
- Existing full-test baseline failures remain disclosed, no unrelated fixes.

# Implementation Tasks

## 1. Complete lifecycle and truthful UI
Files: src/lib/pwa.ts, src/components/PwaSettings.tsx, src/lib/pwa.test.ts.
Exact changes: implement named callback/ref/error/readiness decisions above; preserve
hook signature and update guard; correct Later/status text.
Expected result: persistent truthful state and one-shot installation without new stores.
Verification: npm test -- src/lib/pwa.test.ts; npm run build.
Dependencies: none.

## 2. Replace weak browser checks and prove offline/update behavior
Files: scripts/check-pwa-browser.mjs; only PWA App/styles changes for actual defects.
Exact changes: lifecycle cleanup, strict UI-driven checks, real waiting update/import
warning, offline filter/import and installation event tests specified above.
Expected result: removal of a product handler/guard makes the relevant test fail.
Verification: npm run test:pwa against production dist; inspect saved screenshots.
Dependencies: Task 1.

## 3. Documentation, verification and self-review
Files: README.md PWA section, docs/pwa.md, .agents/IMPLEMENTATION_REPORT.md, this plan.
Exact changes: update actual behavior/check outcomes, self-review baseline diff and
new files, report status. No workflow edits. Mark plan completed only on SUCCESS.
Expected result: concise trustworthy report, no second full Codex review needed.
Verification: commands below and each acceptance criterion.
Dependencies: Tasks 1-2.

# Tests

## Existing tests to update

src/lib/pwa.test.ts: installed detection maps real runtime helper.
scripts/check-pwa-browser.mjs: replace hardcoded-success install/guard sections.

## New test cases

1. Online cache preparation -> offline reload -> General says ready and persisted
   fixture searchable/filterable; second local import works without network.
2. Waiting worker -> Later -> General still says pending; no reload; import warning
   disables update and forced click leaves sentinel; cancel -> explicit update ->
   navigation with original OPFS record IDs preserved.
3. Synthetic event bound to real prompt callback -> user clicks Install -> counter1;
   repeated click cannot reuse event; failure localized; appinstalled/standalone show installed.
4. API offline navigation -> no DLens shell; cache inspection contains no fixture/API data.
5. Browser startup failure -> server closed and nonzero exit; no hung test process.
6. DE/EN and desktop/mobile settings rendered with no horizontal overflow.

# Verification Commands

Run in this order (do not mask failures with tail/pipes):
1. npm test -- src/lib/pwa.test.ts
2. npm run build
3. npm run test:pwa
4. npm test (previously named baseline exceptions only; report exact failed tests)
5. git diff --check
6. Muse self-review complete diff/staged/new files against baseline and acceptance;
   inspect screenshots, fix ordinary defects, rerun only affected checks after changes.

# Acceptance Criteria

- [ ] Existing manifest/icons/production-only SW/root cache scope preserved.
- [ ] Offline readiness truthful after initial and subsequent controlled loads.
- [ ] Offline reloaded OPFS records searchable/filterable and local import succeeds.
- [ ] Real waiting update deferred, guarded during actual working, explicitly applied
      with persisted data preserved; no hardcoded-success or optional required assertions.
- [ ] Real installation callback via synthetic event is one-shot, failure localized,
      appinstalled and standalone reflected; native OS install not falsely claimed.
- [ ] Desktop/mobile, light/dark, DE/EN settings verified; API/fixture data not cached.
- [ ] Build/PWA tests/diff-check pass; full suite records accepted baseline exceptions.
- [ ] Muse self-review complete, compact report current with exact status and deviations.

# Out of Scope

New SW strategy, storage/schema changes, data migration, framework upgrade, dependency
security overhaul, native OS installation automation, deployment, workflow edits,
unrelated filter refactoring or repair of pre-existing festival/pipeline tests.
