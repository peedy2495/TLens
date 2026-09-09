#!/usr/bin/env bash
set -euo pipefail

# Verified with OpenCode 1.18.30; never replace this with a runtime fallback.
readonly model='opencode/muse-spark-1.3-contributor-free'
effort='medium'
check_only=false
allow_xhigh=false

fail() { printf 'Executor: %s\n' "$2" >&2; exit "$1"; }
usage() {
  printf '%s\n' 'Usage: execute-plan.sh [--check] [--effort minimal|low|medium|high|xhigh] [--allow-xhigh]' \
    'Runs the completed root PLAN.md with the fixed Muse Contributor model.' \
    '--check validates local prerequisites only; it never starts OpenCode.' \
    '--allow-xhigh requires an explicit user request; record it in PLAN.md.'
}
while (($#)); do
  case "$1" in
    --check) check_only=true; shift ;;
    --effort) (($# >= 2)) || fail 64 '--effort requires a value'; effort="$2"; shift 2 ;;
    --allow-xhigh) allow_xhigh=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail 64 "Unknown argument: $1" ;;
  esac
done
case "$effort" in minimal|low|medium|high|xhigh) ;; *) fail 64 "Unsupported effort: $effort" ;; esac
if [[ "$effort" == xhigh && "$allow_xhigh" != true ]]; then
  fail 64 'xhigh requires an explicit user request and --allow-xhigh'
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/../../../.." && pwd -P)"
cd -- "$repo_root"
command -v git >/dev/null 2>&1 || fail 69 'git is not available on PATH'
git_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 66 'Executor is not inside a Git repository'
[[ "$(cd -- "$git_root" && pwd -P)" == "$repo_root" ]] || fail 66 'Script layout does not resolve to the repository root'
for required in AGENTS.md .agents/AGENTS.md PLAN.md; do
  [[ -f "$required" && -r "$required" && -s "$required" ]] || fail 66 "Missing, empty or unreadable $repo_root/$required"
done
command -v opencode >/dev/null 2>&1 || fail 69 'opencode is not available on PATH; no implementation fallback will run'
printf 'Repository: %s\nModel: %s\nEffort: %s\n' "$repo_root" "$model" "$effort"
git status --short
if [[ "$check_only" == true ]]; then
  printf '%s\n' 'Local prerequisites OK. No model call made; credentials and service availability are untested.'
  exit 0
fi
prompt='Read AGENTS.md, .agents/AGENTS.md and PLAN.md. You are the OpenCode implementation executor, not the Codex planner. Implement the current ready PLAN.md; stop if it is stale or completed.
Follow the plan and relevant existing skills, project patterns and utilities. Do not redesign architecture, introduce unrelated abstractions/refactors, or modify files outside the plan scope. Preserve pre-existing user edits. Work through tasks systematically, add/update appropriate tests, run relevant project checks and fix ordinary compile, typecheck, lint and test failures yourself.
Do not invoke another agent/executor, switch model, commit, push, deploy or change permissions. Do not request interactive clarification; return a blocker when input is needed.
If the plan is contradictory, technically impossible, or needs an unspecified architecture/API/data-model/design decision: STOP. Do not invent architecture. Report what is blocked, why, and which planning decision is required. Stop and report unavailable tools, model or permissions without a fallback.
Finish with a concise outcome (completed or blocked), changed files, acceptance criteria results, checks with outcomes and remaining blockers. Do not dump full files or reasoning.'
status=0
opencode run --agent build --model "$model" --variant "$effort" "$prompt" </dev/null || status=$?
printf '\nExecutor finished with exit code %s. Review status and changes:\n' "$status"
git status --short || true
if ((status != 0)); then
  printf 'Executor: OpenCode failed (exit %s). Inspect its error above; no retry or model fallback was attempted.\n' "$status" >&2
fi
exit "$status"
