#!/usr/bin/env bash
# Hard-stop guard for the review loop. Call this BEFORE dispatching another
# "address findings" round. Increments the cycle counter and refuses to proceed
# past maxCycles — the deterministic backstop against an infinite A<->B loop.
#
# Exit codes:
#   0  -> ok to proceed; prints "cycle N/MAX"
#   3  -> limit reached; orchestrator MUST stop and escalate to the human
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cycle="$("$HERE/state.sh" incr-cycle)"
max="$("$HERE/state.sh" get maxCycles)"

if [ "$cycle" -gt "$max" ]; then
  echo "STOP: review cycle limit reached ($cycle > $max). Escalate to human." >&2
  exit 3
fi
echo "cycle $cycle/$max"
