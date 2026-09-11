# Status: Completed

# Goal

Ready: Record details opened from tables offer a right-click action “Als Filter hinzufügen” / “Add as filter” for every scalar key/value and hierarchical node. Charts (currently timeline) can move into an actual separate browser window via a top-right Window icon with tooltip, stay interactive and synchronized, return inline when that window is closed, and remember active splitting across app restart. Codex will commit and push only after successful execution; executor does not perform Git delivery.

# Relevant Instructions

- `.agents/skills/ui/SKILL.md`
- `.agents/skills/persistence/SKILL.md`

# Context

- Clean working tree at handoff. Current code includes auto-expanded StoredRecordTree and Escape focus correction; preserve these.
- src/components/App.tsx owns shared data/query/filter state, record Dialog, timeline JSX (only implemented chart), pagination, settings, language and theme. Stable WorkspaceApp owns storage worker; do not create a second workspace/OPFS writer in child windows.
- src/components/RecordTree.tsx renders in-memory recursive details; StoredRecordTree.tsx recursively requests paginated children from StorageClient. Both currently start expanded.
- src/lib/data.ts Filter currently {column,value,operator?:contains|equals}; valuesForColumn recursively matches key names. Storage repository delegates matching through dlens_match; inspect actual shared ingestion/query matching to ensure both backends have identical new semantics. Saved views carry filters.
- Existing Base UI Dialog and Heroicons, current CSS are design reference. Reuse available context-menu primitives if installed; do not add dependencies without concrete need.
- Node22: PATH="$PWD/node_modules/node/bin:$PATH". For build use DLENS_VITE_CACHE=/tmp/dlens-theme-vite (default cache permissions can fail). Preview supports --port. Browser scripts use isolated profiles; tests requiring loopback URL import need DLENS_RELAY_ALLOW_LOOPBACK=1 preview.
- GitHub auth was missing in earlier pushes; not an implementation blocker, Codex will attempt user-authorized push afterward.

# Implementation

1. Record filtering: expose a context action on every scalar key/value and container summary in both trees. Stop bubbling so the exact clicked branch is selected; support context-menu keyboard trigger (Shift+F10/ContextMenu), Escape, dismissal and viewport positioning. Child menu Escape must not close record dialog. Existing expand/collapse remains functional.
2. Apply scalar filters as exact typed value matches (including null, empty string, false and zero), container nodes as existence filters. Carry explicit path segments relative to record root so identical field names in distinct branches, dotted/slashed keys, and array indices target the selected location correctly. Extend Filter backward-compatibly; existing contains/equals filters and saved views retain semantics. Do not fetch/stringify full subtrees to create node filters. Apply through existing filter state, AND with prior filters, show meaningful removable chips with path and value/existence label; avoid identical duplicate additions. Close detail after applying so filtered table is visible. Preserve record-relative paths for both backend and in-memory data.
3. Implement a focused detachable chart component/hook; use window.open with popup/window sizing features and a React portal (or comparably small shared-state approach). Keep one storage owner. A separate document should carry required styles/fonts/theme/language/title and interactive chart/date/pagination controls. Move whole timeline including pagination and controls; show it once. Use Heroicons WindowIcon at header top-right with localized tooltip/aria-label. Preserve inline layout and chart behavior otherwise. Child-window close returns chart inline promptly, no stale handles or timers, no duplicate windows; updates/filters/source changes remain synchronized. Settings open/close must not accidentally lose split state or strand child window.
4. Persist per-chart split preference via existing localStorage preference pattern; do not persist DOM/window references or user data. Distinguish deliberate child-window close (clear split preference) from parent app unload/reload/close (retain split preference and safely close orphan child). On app startup attempt restoration when viable; browsers may block automatic popups, so retain split intent and provide a localized, visible user-gesture restore action with chart still accessible inline. A failed initial manual detach must leave usable inline chart and clear feedback. Never claim browser can be forced to honor window versus tab preference; request popup-style window using features. Reopen only one named window per app instance/chart; avoid cross-tab ownership conflicts.
5. Document material user behavior (record filter semantics, split persistence and popup-blocker restoration) in appropriate existing docs. Add focused regressions that meaningfully cover behavior, not implementation mirrors.

# Verification

1. Focused unit/repository tests for path-specific scalar exact and node existence filtering: nested objects/arrays, duplicate keys in different branches, special-key escaping, false/0/null/empty string, legacy contains/equals and saved-filter compatibility.
2. Focused production browser regression: import nested fixture, open record (all nodes open), right-click scalar and node, choose action, verify chips and actual matching rows; manual collapse and context-menu keyboard/Escape behavior. Cover both trees as practical.
3. Production browser regression: detach timeline to a distinct popup target with copied styles and interactive controls, main chart absent, filter/date updates sync; close child restores inline; reload/restart preserves intent; blocked popup leaves inline content plus working restore action; app close cleans child without clearing intent. Reduced motion/settings navigation and existing chart event filtering remain functional. Test child-close detection even while main is hidden if feasible. Use isolated profiles, don't kill unrelated processes.
4. Run production build and relevant unit suite (full vitest acceptable due filter contract sharing); run existing settings and storage browser checks if affected. Repair ordinary failures in this same run. git diff --check; self-review actual changes against plan.
5. Write compact final report with actual outcomes, deviations/blockers. Mark plan completed only on real success. No routine Codex second review/test pass.

# Acceptance Criteria

- [ ] Every record scalar pair and hierarchical container has functional localized context filtering; path semantics and empty values correct.
- [ ] Timeline detaches with Window icon, stays synchronized and returns when closed.
- [ ] Active splitting survives app close/reopen with honest popup-blocker recovery and no duplicate OPFS ownership.
- [ ] Existing data, filters, expanded hierarchy, settings animation/history and focus behavior preserved.
- [ ] Requested verification passes; report records status and remaining issues accurately.

# Out of Scope

- New chart types, storage migration, unrelated UI redesign, Git commits/push by executor, agent instruction changes.
