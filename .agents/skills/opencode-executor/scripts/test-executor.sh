#!/usr/bin/env bash
set -euo pipefail

# Only isolated fixtures and a fake CLI; never call Muse or alter user work.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
fixture="$(mktemp -d /tmp/dlens-executor-test.XXXXXXXX)"
trap 'rm -rf -- "$fixture"' EXIT
repo="$fixture/repo with spaces"
mkdir -p "$repo/.agents/skills/opencode-executor/scripts" "$repo/.agents/skills/opencode-executor/references" "$fixture/bin"
cp "$script_dir/execute-plan.sh" "$repo/.agents/skills/opencode-executor/scripts/"
cp "$script_dir/../references/implementation-report-template.md" "$repo/.agents/skills/opencode-executor/references/"
git init -q "$repo"
runner="$repo/.agents/skills/opencode-executor/scripts/execute-plan.sh"
bash_bin="$(command -v bash)"
cat > "$fixture/bin/opencode" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$PWD" "$@" >> "$EXECUTOR_TEST_CAPTURE"
case "${EXECUTOR_TEST_REPORT:-SUCCESS}" in
  absent) rm -f .agents/IMPLEMENTATION_REPORT.md ;;
  unchanged) : ;;
  malformed) printf '# Status\n\nSUCCESS\n' > .agents/IMPLEMENTATION_REPORT.md ;;
  *)
    cat > .agents/IMPLEMENTATION_REPORT.md <<REPORT
# Status

${EXECUTOR_TEST_REPORT:-SUCCESS}

# Implemented

- Fixture task.

# Changed Files

- fixture.txt

# Verification

- Fixture check: passed; self-review: passed.

# Plan Deviations

${EXECUTOR_TEST_DEVIATIONS:-- none}

# Blockers

${EXECUTOR_TEST_BLOCKERS:-- none}
REPORT
    ;;
esac
exit "${EXECUTOR_TEST_EXIT:-0}"
MOCK
chmod +x "$fixture/bin/opencode"
export EXECUTOR_TEST_CAPTURE="$fixture/invocations"
export PATH="$fixture/bin:$PATH"
cd /tmp
expect_exit() {
  local expected="$1" actual=0
  shift
  "$@" > "$fixture/output" 2>&1 || actual=$?
  if [[ "$actual" != "$expected" ]]; then
    cat "$fixture/output" >&2
    printf 'Expected exit %s, got %s\n' "$expected" "$actual" >&2
    exit 1
  fi
}
expect_exit 0 "$bash_bin" "$runner" --help
# Root PLAN.md alone is deliberately not sufficient.
printf '# Goal\nReady: obsolete root fixture.\n' > "$repo/PLAN.md"
expect_exit 66 "$bash_bin" "$runner" --check
[[ ! -e "$EXECUTOR_TEST_CAPTURE" ]]
printf '# Goal\nReady: fixture-only test.\n' > "$repo/.agents/PLAN.md"
printf 'Existing report must survive --check.\n' > "$repo/.agents/IMPLEMENTATION_REPORT.md"
cp "$repo/.agents/IMPLEMENTATION_REPORT.md" "$fixture/original-report"
expect_exit 0 "$bash_bin" "$runner" --check
cmp "$repo/.agents/IMPLEMENTATION_REPORT.md" "$fixture/original-report"
[[ ! -e "$EXECUTOR_TEST_CAPTURE" ]]
expect_exit 64 "$bash_bin" "$runner" --effort
expect_exit 64 "$bash_bin" "$runner" --effort default
expect_exit 64 "$bash_bin" "$runner" --model other/model
expect_exit 64 "$bash_bin" "$runner" --effort xhigh
expect_exit 0 "$bash_bin" "$runner" --check --effort xhigh --allow-xhigh
[[ ! -e "$EXECUTOR_TEST_CAPTURE" ]]
expect_exit 0 "$bash_bin" "$runner"
mapfile -d '' -t invocation < "$EXECUTOR_TEST_CAPTURE"
[[ "${#invocation[@]}" == 9 ]]
[[ "${invocation[0]}" == "$repo" && "${invocation[1]}" == run ]]
[[ "${invocation[2]}" == --agent && "${invocation[3]}" == build ]]
[[ "${invocation[4]}" == --model && "${invocation[5]}" == opencode/muse-spark-1.3-contributor-free ]]
[[ "${invocation[6]}" == --variant && "${invocation[7]}" == medium ]]
[[ "${invocation[8]}" == *'.agents/PLAN.md'* && "${invocation[8]}" == *'.agents/IMPLEMENTATION_REPORT.md'* && "${invocation[8]}" != *'Read AGENTS.md, .agents/AGENTS.md'* ]]
# Old SUCCESS must not survive a run which fails to produce a report.
export EXECUTOR_TEST_REPORT=unchanged
expect_exit 3 "$bash_bin" "$runner"
for mode in absent malformed INVALID; do
  export EXECUTOR_TEST_REPORT="$mode"
  expect_exit 65 "$bash_bin" "$runner"
done
export EXECUTOR_TEST_REPORT=PARTIAL
expect_exit 2 "$bash_bin" "$runner"
export EXECUTOR_TEST_REPORT=BLOCKED
expect_exit 3 "$bash_bin" "$runner"
export EXECUTOR_TEST_REPORT=SUCCESS
export EXECUTOR_TEST_DEVIATIONS='- Changed an unspecified API.'
expect_exit 2 "$bash_bin" "$runner"
unset EXECUTOR_TEST_DEVIATIONS
export EXECUTOR_TEST_BLOCKERS='- Missing verification.'
expect_exit 2 "$bash_bin" "$runner"
unset EXECUTOR_TEST_BLOCKERS
: > "$EXECUTOR_TEST_CAPTURE"
export EXECUTOR_TEST_EXIT=42
expect_exit 42 "$bash_bin" "$runner" --effort high
mapfile -d '' -t invocation < "$EXECUTOR_TEST_CAPTURE"
[[ "${#invocation[@]}" == 9 && "${invocation[7]}" == high ]]
mkdir "$fixture/no-cli"
ln -s "$(command -v git)" "$fixture/no-cli/git"
ln -s "$(command -v dirname)" "$fixture/no-cli/dirname"
previous_path="$PATH"
export PATH="$fixture/no-cli"
expect_exit 69 "$bash_bin" "$runner" --check
export PATH="$previous_path"
printf '%s\n' 'PASS: focused canonical plan, no AGENTS prerequisite/context, arbitrary cwd/spaces, check-only preservation, fixed model/effort, xhigh gate, current reports, SUCCESS/PARTIAL/BLOCKED, malformed reports, deviation/blocker triage and CLI failure propagation without retries (mock only).'
