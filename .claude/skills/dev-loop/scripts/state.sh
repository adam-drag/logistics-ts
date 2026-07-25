#!/usr/bin/env bash
# dev-loop state machine store.
# All orchestration state lives in a file, never in the model's head — this is
# what makes "stop at cycle N" and phase tracking deterministic across context
# compactions and re-invocations.
#
# Usage:
#   state.sh init [--max N] [--agent NAME]   # snapshot baseline, reset to IDLE
#   state.sh show                            # pretty-print the whole state
#   state.sh get KEY                         # print one field
#   state.sh set KEY VALUE                   # set one field
#   state.sh incr-cycle                      # +1 the review cycle counter, print it
#   state.sh reset-cycle                     # cycle -> 0 (call when starting a new increment)
#
# `supervise.sh` re-reads two of these keys on every tick, so keep them current:
#   baseline    advance it on each approved increment (SKILL.md §5)
#   scopeGlobs  space-separated globs for THIS increment, set on each dispatch (§1)
set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
DIR="$REPO/.dev-loop"
FILE="$DIR/state.json"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# Temp file must live NEXT TO the target so `mv` is a same-filesystem atomic
# rename. `mktemp` defaults to /tmp, which is usually a different filesystem —
# there `mv` degrades to copy+unlink and supervise.sh, which now re-reads this
# file every tick, can observe a half-written state.json.
newtmp() { mktemp "$DIR/.state.XXXXXX"; }

cmd="${1:-show}"; shift || true

case "$cmd" in
  init)
    max=10; agent="implementer"
    while [ $# -gt 0 ]; do
      case "$1" in
        --max) max="$2"; shift 2 ;;
        --agent) agent="$2"; shift 2 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
      esac
    done
    mkdir -p "$DIR"
    baseline="$(git -C "$REPO" rev-parse HEAD)"
    jq -n --arg base "$baseline" --argjson max "$max" --arg agent "$agent" --arg t "$(now)" '{
      phase: "IDLE",
      cycle: 0,
      maxCycles: $max,
      baseline: $base,
      agentBName: $agent,
      increment: "",
      scopeGlobs: "",
      findingsOpen: false,
      startedAt: $t,
      updatedAt: $t
    }' > "$FILE"
    echo "initialized at $FILE (baseline ${baseline:0:8}, maxCycles $max)"
    ;;
  show)
    [ -f "$FILE" ] || { echo "no state — run: state.sh init" >&2; exit 1; }
    jq . "$FILE"
    ;;
  get)
    [ -f "$FILE" ] || { echo "no state — run: state.sh init" >&2; exit 1; }
    jq -r --arg k "$1" '.[$k]' "$FILE"
    ;;
  set)
    key="$1"; val="$2"
    tmp="$(newtmp)"
    # numbers/bools stay typed; everything else is a string
    if [[ "$val" =~ ^-?[0-9]+$ || "$val" == "true" || "$val" == "false" ]]; then
      jq --arg k "$key" --argjson v "$val" --arg t "$(now)" '.[$k]=$v | .updatedAt=$t' "$FILE" > "$tmp"
    else
      jq --arg k "$key" --arg v "$val" --arg t "$(now)" '.[$k]=$v | .updatedAt=$t' "$FILE" > "$tmp"
    fi
    mv "$tmp" "$FILE"
    ;;
  incr-cycle)
    tmp="$(newtmp)"
    jq --arg t "$(now)" '.cycle += 1 | .updatedAt=$t' "$FILE" > "$tmp"; mv "$tmp" "$FILE"
    jq -r '.cycle' "$FILE"
    ;;
  reset-cycle)
    tmp="$(newtmp)"
    jq --arg t "$(now)" '.cycle = 0 | .updatedAt=$t' "$FILE" > "$tmp"; mv "$tmp" "$FILE"
    ;;
  *)
    echo "usage: state.sh {init|show|get KEY|set KEY VALUE|incr-cycle|reset-cycle}" >&2
    exit 2
    ;;
esac
