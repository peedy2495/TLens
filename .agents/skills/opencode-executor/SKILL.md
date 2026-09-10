---
name: opencode-executor
description: Delegate non-trivial implementation to OpenCode/Muse from a focused .agents/PLAN.md and consume its compact report. Do not use for trivial edits, planning-only work, or workflow maintenance.
---

# OpenCode executor

Use delegated execution when implementation is substantial enough to benefit from a separate executor. Prefer direct Codex implementation for trivial/local edits where delegation would add more planning and context than value.

## Before execution

- Resolve only material uncertainty needed for a safe handoff. Do not explore unrelated repository areas.
- Inspect relevant implementation, current diffs/user work, and only the task skills selected by `.agents/AGENTS.md` routing.
- Preserve user edits; never stash, reset or clean them automatically.
- Write `.agents/PLAN.md` using `references/plan-template.md`.
- Default to a focused plan. Add optional architecture detail only when interfaces, persistence semantics, multiple subsystems, concurrency/security boundaries, or migration behavior require it.
- In the plan, list the exact task skills/references Muse may read. Do not pass global agent files merely as background context.
- Never execute a stale/completed plan. Root `PLAN.md` is not executor input.

## Execute

Run `bash .agents/skills/opencode-executor/scripts/execute-plan.sh` from the repository root (or use its absolute path). Default effort is medium. `--effort minimal|low|medium|high|xhigh` overrides require justification in the plan; xhigh also requires explicit user authorization and `--allow-xhigh`.

Muse owns implementation, ordinary failure repair, relevant verification and a self-review of its actual changes against the plan. Do not run a second executor against the same worktree.

The executor is intentionally narrow. It builds one deterministic handoff prompt in this order: stable executor contract, stable report format, task skills/references sorted by path, then the changing `.agents/PLAN.md`. This keeps reusable context before task-local context and avoids model-side file-reading turns. Project `AGENTS.md` auto-discovery is disabled for the delegated OpenCode process because Codex has already routed the applicable instructions. Global OpenCode instructions may still apply.

The script pins the configured model/build and does not auto-approve permissions, retry, switch models, commit, push or deploy. Tool/model/permission failure is a blocker, not permission to use a fallback.

## After execution

Read `.agents/IMPLEMENTATION_REPORT.md` and executor outcome first.

- `SUCCESS` with no deviations/blockers and executor success: report completion. Do not automatically reread the full diff or rerun checks.
- `PARTIAL`: inspect only the unresolved area, then correct directly or produce a targeted revised plan.
- `BLOCKED`: resolve only the named missing decision/blocker before another delegation. Do not retry an identical blocker or escalate effort automatically.
- Missing/invalid report, nonzero CLI exit, or `SUCCESS` containing deviations/blockers: do not claim success; investigate only the reported gap.
- A broader review is appropriate only when the user requests it or the risk warrants it.

## Workflow maintenance

Maintain/test this workflow directly with Codex rather than through a feature delegation. `scripts/test-executor.sh` uses an isolated Git fixture and fake CLI. `execute-plan.sh --check` validates local prerequisites without a model call or report mutation.
