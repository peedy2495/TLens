#!/usr/bin/env bash
set -euo pipefail

# This harness never calls the real OpenCode CLI or modifies the working tree.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
fixture="$(mktemp -d /tmp/dlens-executor-test.XXXXXXXX)"
trap 'rm -rf -- "$fixture"' EXIT
repo="$fixture/repo with spaces"
mkdir -p "$repo/.agents/skills/opencode-executor/scripts" "$fixture/bin"
cp "$script_dir/execute-plan.sh" "$repo/.agents/skills/opencode-executor/scripts/"
git init -q "$repo"
printf 'Project instructions\n' > "$repo/AGENTS.md"
printf 'Central instructions\n' > "$repo/.agents/AGENTS.md"
runner="$repo/.agents/skills/opencode-executor/scripts/execute-plan.sh"
bash_bin="$(command -v bash)"
cat > "$fixture/bin/opencode" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\0' "$PWD" "$@" >> "$EXECUTOR_TEST_CAPTURE"
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
expect_exit 66 "$bash_bin" "$runner" --check
[[ ! -e "$EXECUTOR_TEST_CAPTURE" ]]
printf '# Goal\nReady: fixture-only test.\n' > "$repo/PLAN.md"
expect_exit 0 "$bash_bin" "$runner" --check
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
[[ "${invocation[8]}" == *PLAN.md* ]]
: > "$EXECUTOR_TEST_CAPTURE"
export EXECUTOR_TEST_EXIT=42
expect_exit 42 "$bash_bin" "$runner" --effort high
mapfile -d '' -t invocation < "$EXECUTOR_TEST_CAPTURE"
[[ "${#invocation[@]}" == 9 && "${invocation[7]}" == high ]]

# A restricted PATH makes the missing-CLI case deterministic even on developer machines.
mkdir "$fixture/no-cli"
ln -s "$(command -v git)" "$fixture/no-cli/git"
ln -s "$(command -v dirname)" "$fixture/no-cli/dirname"
previous_path="$PATH"
export PATH="$fixture/no-cli"
expect_exit 69 "$bash_bin" "$runner" --check
export PATH="$previous_path"
printf '%s\n' 'PASS: arbitrary cwd/spaces, missing plan/CLI, check-only, fixed model, effort validation, xhigh gate, failure propagation and no retries (mock CLI only).'
