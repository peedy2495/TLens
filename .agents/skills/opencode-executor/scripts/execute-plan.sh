#!/usr/bin/env bash
set -euo pipefail

# Verified with OpenCode 1.18.30; never replace this with a runtime fallback.
readonly model='opencode/muse-spark-1.3-contributor-free'
readonly plan='.agents/PLAN.md'
readonly report='.agents/IMPLEMENTATION_REPORT.md'
effort='medium'
check_only=false
allow_xhigh=false

fail() { printf 'Executor: %s\n' "$2" >&2; exit "$1"; }
usage() {
  printf '%s\n' 'Usage: execute-plan.sh [--check] [--effort minimal|low|medium|high|xhigh] [--allow-xhigh]' \
    'Runs the detailed .agents/PLAN.md with the fixed Muse Contributor model.' \
    '--check validates local prerequisites only; no model call or report write.' \
    '--allow-xhigh requires an explicit user request recorded in .agents/PLAN.md.'
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
for required in AGENTS.md .agents/AGENTS.md "$plan"; do
  [[ -f "$required" && -r "$required" && -s "$required" ]] || fail 66 "Missing, empty or unreadable $repo_root/$required"
done
command -v opencode >/dev/null 2>&1 || fail 69 'opencode is not available on PATH; no implementation fallback will run'
command -v awk >/dev/null 2>&1 || fail 69 'awk is required for report validation'
printf 'Repository: %s\nPlan: %s\nModel: %s\nEffort: %s\n' "$repo_root" "$plan" "$model" "$effort"
if [[ "$check_only" == true ]]; then
  printf '%s\n' 'Local prerequisites OK. No model call or report write; credentials and service availability are untested.'
  exit 0
fi
# Do not allow a previous run's SUCCESS to survive a failed/aborted invocation.
cat > "$report" <<'REPORT'
# Status

BLOCKED

# Implemented

- Executor started; Muse has not written the current report.

# Changed Files

- Not yet reported.

# Verification

- Not yet reported.

# Plan Deviations

- none

# Blockers

- Current invocation has not produced an implementation report.
REPORT
prompt='Read AGENTS.md, .agents/AGENTS.md and .agents/PLAN.md. You are the implementation executor, not the planner. Treat the current ready .agents/PLAN.md as binding; if stale/completed, write BLOCKED and stop.
Implement tasks and verification in the specified order, using the named utilities, symbols, types, interfaces and boundaries. Preserve the recorded dirty/staged/untracked baseline. Do not stash, reset or clean user work. Choose only unspecified local details and small technical adjustments within the prescribed architecture; fix ordinary compile/type/lint/test failures autonomously.
Do not change architecture, unauthorized public APIs, introduce unplanned abstractions, expand scope, refactor adjacent areas, reinterpret requirements or implement alternative designs. A necessary missing decision with multiple materially different solutions means BLOCKED: identify the exact decision and stop. No recursive delegation, other agents, model switches, commit, push, deployment or permission changes. Report unavailable tools/model/permissions without fallback. Do not ask interactive clarification.
After implementation and checks, self-review your complete diff, staged/new files and actual test results against the baseline and each acceptance criterion, including correctness, security, architecture, scope and preserved behavior. Repair ordinary issues yourself. Do not claim skipped/failed checks passed.
Overwrite .agents/IMPLEMENTATION_REPORT.md using .agents/skills/opencode-executor/references/implementation-report-template.md: Status (SUCCESS/PARTIAL/BLOCKED), Implemented, Changed Files, Verification, Plan Deviations, Blockers. Keep it short: exact outcomes and paths, no full diffs, long explanations or repeated plan. Explicitly record every deviation. SUCCESS requires completed work, required checks, acceptance and self-review; PARTIAL means work/checks remain; BLOCKED means a precise missing decision or execution blocker. Mark .agents/PLAN.md completed on SUCCESS. Finish with only the report status and path; Codex reads the report and does not repeat successful self-review.'
status=0
opencode run --agent build --model "$model" --variant "$effort" "$prompt" </dev/null || status=$?
printf '\nExecutor CLI exit: %s. Report: %s\n' "$status" "$report"
if ((status != 0)); then
  printf 'Executor: OpenCode failed; no retry or model fallback. Inspect the error and report, not a second full code review.\n' >&2
  exit "$status"
fi
[[ -f "$report" && -s "$report" ]] || fail 65 'Current implementation report is missing or empty'
section() {
  awk -v heading="# $1" '
    /^# / { active = ($0 == heading); next }
    active && NF { sub(/\r$/, ""); print }
  ' "$report"
}
for heading in Status Implemented 'Changed Files' Verification 'Plan Deviations' Blockers; do
  count="$(awk -v heading="# $heading" '$0 == heading { n++ } END { print n+0 }' "$report")"
  [[ "$count" == 1 && -n "$(section "$heading")" ]] || fail 65 "Malformed report section: $heading"
done
report_status="$(section Status)"
case "$report_status" in
  SUCCESS)
    if [[ "$(section 'Plan Deviations')" != '- none' || "$(section Blockers)" != '- none' ]]; then
      fail 2 'SUCCESS contains deviations or blockers; Codex must triage the report'
    fi
    printf '%s\n' 'SUCCESS: read the compact report and report completion; no automatic second review or test rerun.'
    ;;
  PARTIAL) fail 2 'PARTIAL: Codex must choose targeted correction or replanning from the report' ;;
  BLOCKED) fail 3 'BLOCKED: Codex must resolve the reported decision or execution blocker' ;;
  *) fail 65 'Invalid report status; expected SUCCESS, PARTIAL or BLOCKED' ;;
esac
