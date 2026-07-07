#!/bin/bash
# Per-file test runner with real failure propagation.
#
# Why not one `bun test` run: with every file in a single process, shared
# module state (game-manager singletons, timers) makes the suite hang
# mid-run, and the old 30s kill-and-exit-0 wrapper reported that hang as
# success while silently skipping every file after the hang point
# (2026-07-07 finish audit). Running each file in its own process makes
# every file provably run to completion; a per-file timeout turns a hang
# into a named failure instead of a green build.
#
# Usage:
#   ./test-runner.sh                               # run every tests/*.test.ts
#   ./test-runner.sh tests/foo.test.ts [args...]   # pass through to bun test

set -u
BUN="${BUN_PATH:-$(command -v bun || echo "$HOME/.bun/bin/bun")}"
FILE_TIMEOUT="${TEST_FILE_TIMEOUT:-90}"

run_with_timeout() {
  local timeout_s=$1; shift
  "$@" &
  local pid=$!
  ( sleep "$timeout_s"; kill -9 "$pid" 2>/dev/null ) &
  local timer=$!
  wait "$pid" 2>/dev/null
  local exit=$?
  kill "$timer" 2>/dev/null
  wait "$timer" 2>/dev/null
  return $exit
}

# Pass-through mode: explicit file/args given
if [ $# -gt 0 ]; then
  run_with_timeout "$FILE_TIMEOUT" "$BUN" test "$@"
  exit $?
fi

pass=0
failed=()
hung=()
logdir=$(mktemp -d)
trap 'rm -rf "$logdir"' EXIT

for f in tests/*.test.ts; do
  log="$logdir/$(basename "$f").log"
  if run_with_timeout "$FILE_TIMEOUT" "$BUN" test "$f" >"$log" 2>&1; then
    pass=$((pass + 1))
  else
    exit_code=$?
    echo "──── $f (exit $exit_code) ────"
    cat "$log"
    if [ "$exit_code" -ge 137 ]; then
      hung+=("$f")
    else
      failed+=("$f")
    fi
  fi
done

echo
echo "test-runner: $pass file(s) passed, ${#failed[@]} failed, ${#hung[@]} hung/timed out"
[ ${#failed[@]} -gt 0 ] && printf '  FAILED: %s\n' "${failed[@]}"
[ ${#hung[@]} -gt 0 ] && printf '  HUNG:   %s\n' "${hung[@]}"

[ ${#failed[@]} -eq 0 ] && [ ${#hung[@]} -eq 0 ]
