---
name: opencode-executor
description: Delegate a completed repository PLAN.md to OpenCode with Muse Spark 1.3 Contributor, then review its changes and checks. Use for non-trivial planned implementation, not planning, trivial edits or setup-only validation.
---

# OpenCode executor

Follow the roles, effort routing and failure policy in `../../AGENTS.md`.

## Before execution

- Root `PLAN.md` exists, is current and actionable; Codex has completed planning
  and resolved architectural decisions. Use [the template](references/plan-template.md)
  only when preparing a plan, not to overwrite an existing one.
- This is an authorized non-trivial implementation, not setup validation.
- Capture and understand `git status --short`, `git diff` and `git diff --cached`;
  inspect relevant untracked files. Record the baseline in the plan/handoff.
  Preserve user edits; do not stash, reset or clean them automatically.

## Execute

Run `bash .agents/skills/opencode-executor/scripts/execute-plan.sh` from the root,
or call the script by absolute path from any directory. Default effort is medium.
Supported overrides: `--effort minimal|low|medium|high|xhigh`; justify in PLAN.md.
`xhigh` additionally requires `--allow-xhigh`, only after an explicit user request.

Wait for the process to finish using the host's process/session tools, with concise
progress updates when needed. Do not interactively duplicate its implementation.
Do not launch a second executor against the same worktree while one is running.
The prompt assigns Muse implementation ownership, project checks and ordinary
failure repair; architectural blockers return to Codex.

The script pins the verified contributor model and `build` agent. It does not
auto-approve permissions, share sessions, continue an unrelated session or retry
with another model. Respect execution-environment approvals. A denied permission
or unavailable model is a concrete blocker, not permission to bypass restrictions
or silently implement in Codex. CLI exit failures propagate; a successful exit
alone does not prove acceptance or rule out a blocker in the final report.

## Review

1. Inspect final output and checks, then `git status --short`, `git diff`,
   `git diff --cached` and relevant new files against the baseline.
2. Review relevant tests and applicable typecheck/lint evidence using existing
   project commands. Execute missing checks or rerun when justified.
3. Check each task and acceptance criterion in `PLAN.md`. Report changed files,
   check outcomes and any remaining limitations concisely.
4. Delegate ordinary implementation corrections with targeted feedback in PLAN.md.
   For architecture/planning blockers, Codex resolves the missing decision first
   and updates the plan before a new run. No automatic model or effort escalation.

## Setup-only validation

`bash -n scripts/execute-plan.sh` checks syntax. `execute-plan.sh --check` validates
paths, required files and CLI presence without invoking OpenCode; it deliberately
fails if PLAN.md is missing. `scripts/test-executor.sh` uses an isolated temporary
Git repo and a fake CLI to test invocation and failure handling without a model call.
The actual CLI/model/variant evidence is in the repository README. Rediscover via
`opencode --help`, `opencode run --help` and `opencode models opencode --verbose`
only on setup/repair. Never use a real implementation run just to test installation.
