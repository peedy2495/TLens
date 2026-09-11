# Status: Completed

# Goal
Add Timeline date-picker tooltip and toggleable hierarchical field selection under Anzeige (Visible fields), with smooth size animation.
# Relevant Instructions
- `.agents/skills/ui/SKILL.md`
- `.agents/skills/persistence/SKILL.md`
# Context
App.tsx calendar button in date-navigation lacks tooltip (reuse IconButton). panel === "columns" renders flat allColumns checkboxes. Selected columns are names, not paths. allColumns is source-wide but result.tables is filtered/paginated: cannot provide complete hierarchy. Repository entities/records/fields in src/lib/storage/repository.ts and contracts in src/lib/ingestion/contracts.ts support stored sources; inspect client/worker as needed. Legacy Jazz tables must work too. Preserve untracked UI Mokup 1.odg, do not read it as design reference. English comments, Node 22, no dependencies or unrelated changes.
# Implementation
1. Localized calendar tooltip using existing IconButton, also detached timeline.
2. Flat default; accessible localized toggle uses ArrowDownOnSquareStackIcon to enter tree view and ArrowUpOnSquareStackIcon to return to flat.
3. Tree puts available fields into actual source hierarchy with collapsible branches. Same-named fields at every depth/branch share existing name-based selection. Preserve selection when switching views; do not change filtering to path matching. Flat sources usable.
4. Obtain complete source-wide hierarchy independent of filters/pagination through existing storage boundaries, efficiently without fetching all record values. Refresh on source/generation changes and prevent stale structure. Avoid migrations if possible.
5. Smoothly animate allocated space on tree branch expansion/collapse and switching mode; respect reduced motion, keyboard accessibility, responsive and theme patterns.
# Verification
1. Focused regression tests for hierarchy grouping, duplicate names at different depths, complete structure independent of filtered/paginated records and flat sources as appropriate.
2. Add/run focused tracked browser regression using existing harness patterns: tooltip, toggle icons, branch expansion/collapse, same-name checkbox synchronization, retained selection across toggles, animated sizing and reduced motion where feasible.
3. Focused tests, build/typecheck, git diff --check; repair routine failures within this run and self-review acceptance. Avoid unrelated broad suites.
# Acceptance Criteria
- [ ] Localized date-picker tooltip.
- [ ] Requested icons toggle flat/tree available-field views.
- [ ] Accurate hierarchy and shared name-based selection across branches/depths.
- [ ] Smooth expansion/contraction with reduced-motion support.
- [ ] Relevant checks pass, compact .agents/IMPLEMENTATION_REPORT.md reports actual status/checks/blockers.
# Out of Scope
No commits/pushes, unrelated redesign, ingestion changes or path-specific filtering.
