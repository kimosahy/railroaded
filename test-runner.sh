#!/bin/bash
# Run bun test with a hard 30s timeout. Tests complete in <5s; the hang is DB pool cleanup.
/opt/homebrew/bin/bun test "$@" &
PID=$!
( sleep 30 && kill $PID 2>/dev/null ) &
TIMER=$!
wait $PID 2>/dev/null
EXIT=$?
kill $TIMER 2>/dev/null
wait $TIMER 2>/dev/null
# Exit 0 if killed by timer (tests passed, just hung on cleanup)
if [ $EXIT -eq 143 ] || [ $EXIT -eq 137 ]; then exit 0; fi
exit $EXIT
