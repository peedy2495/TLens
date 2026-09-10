---
name: opencode-executor
description: Delegate a detailed .agents/PLAN.md to OpenCode with Muse Spark 1.3 Contributor, then route its compact implementation report. Use for non-trivial planned implementation, not planning, trivial edits or workflow setup/maintenance.
---

# OpenCode executor

Follow roles, detailed planning, self-review, reporting and effort policy in
`../../AGENTS.md`. Spend Codex reasoning before handoff; do not duplicate Muse's
successful implementation review.

## Before execution

- Analyze relevant rules/skills, modules, patterns, tests, APIs and types. Capture
  and understand status, unstaged/staged diffs and relevant untracked files.
  Preserve all user edits; never stash, reset or clean them automatically.
- Write a current, actionable `.agents/PLAN.md` with the
  [detailed plan template](references/plan-template.md). Resolve material design
  decisions; specify files, symbols, interfaces, state/error/persistence behavior,
  flows, prohibited alternatives, exact tasks, tests and acceptance criteria.
- Never execute a stale/completed plan. Root `PLAN.md` is not executor input.
- Existing task authorization suffices; do not ask for another routine approval.

## Execute

Run `bash .agents/skills/opencode-executor/scripts/execute-plan.sh` from the root,
or use its absolute path. Default medium. Overrides
`--effort minimal|low|medium|high|xhigh` require justification in `.agents/PLAN.md`;
xhigh also requires explicit user authorization and `--allow-xhigh`.

Wait for completion with concise progress updates. Do not duplicate implementation
or run another executor against the same worktree. Muse owns implementation,
ordinary failure repair, checks, complete self-review against the baseline and
acceptance criteria, and the compact
[implementation report](references/implementation-report-template.md).

The script pins Contributor/build, does not auto-approve permissions, share
sessions, retry or switch model. A permission/model/tool failure is a concrete
blocker, not permission to bypass restrictions or implement through a fallback.
Before a live run it replaces the prior report with a pending BLOCKED report so
an old SUCCESS cannot be accepted. --check does not mutate a report or call Muse.

## After execution

Read `.agents/IMPLEMENTATION_REPORT.md` and the executor outcome only first.

- SUCCESS + no deviations/blockers + executor success: briefly report completion.
  Do not automatically inspect the full diff, reread changed files, rerun checks
  or reanalyze the repository. Mark the plan completed as a bookkeeping edit.
- PARTIAL: determine from the report whether targeted correction or replanning is
  needed. Inspect only the unresolved area and delegate a concrete revised plan.
- BLOCKED: analyze only the named blocker, resolve the missing decision in the
  plan, then delegate. No repeated identical blocker retries or effort escalation.
- Missing/invalid report, nonzero CLI exit or SUCCESS with deviations/blockers:
  do not claim success. Investigate only the reported gap. Explicit user requests
  for review can authorize a broader review.

## Setup and validation

Workflow setup/maintenance is handled directly by Codex. Do not use a feature run
as a setup test. `bash -n scripts/execute-plan.sh` checks syntax;
`scripts/test-executor.sh` uses only an isolated Git fixture and fake CLI.
`execute-plan.sh --check` requires `.agents/PLAN.md`, validates local prerequisites
without calling a model or overwriting the report. It does not validate credentials.

Exit codes: CLI failures propagate unchanged; after CLI exit 0 the report gate
returns 0 for clean SUCCESS, 2 for PARTIAL or SUCCESS requiring deviation/blocker
triage, 3 for BLOCKED and 65 for missing/malformed report. Preconditions retain
64 (arguments), 66 (files/repository) and 69 (CLI/tool unavailable).
