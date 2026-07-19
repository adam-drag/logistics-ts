#!/usr/bin/env bash
# dev-loop supervisor — the "peek every 30s" watchdog, inverted.
#
# We do NOT read Agent B's transcript (that would overflow context and is
# expensive). Instead we watch cheap EXTERNAL signals of B's work — the git
# working tree — and emit ONE line per actionable event. Designed to be run as
# the `command` of a persistent Monitor: each printed line becomes one chat
# notification; silence means "still healthy, nothing to report".
#
# Tripwires:
#   STUCK           working tree unchanged for > STALL_SECS (default 300s)
#   RESUMED         activity returned after a STUCK episode
#   RUNAWAY_DIFF    changed-line count crossed DIFF_BUDGET (default 800)
#   SCOPE_VIOLATION a changed file is outside SCOPE_GLOBS (only if that env is set)
#
# Env knobs (all optional):
#   POLL_SECS=30  STALL_SECS=300  DIFF_BUDGET=800  SCOPE_GLOBS="packages/foo/** src/bar/**"
set -uo pipefail

REPO="$(git rev-parse --show-toplevel)"
# Re-read on EVERY tick, never cache. A caches the baseline forward as each
# increment is approved (see SKILL.md §5), so a value read once at startup goes
# stale the moment the first increment lands — the tripwires then measure the
# whole milestone instead of the current increment and fire cumulative false
# positives. That is exactly the bug the per-increment baseline was meant to
# kill; fixing the producer without the consumer left it alive with an
# identical symptom. (Observed M8 inc3: supervisor held M8's starting commit
# and reported 1102 changed lines for a 385-line increment.)
read_baseline() { jq -r '.baseline // "HEAD"' "$REPO/.dev-loop/state.json" 2>/dev/null || echo HEAD; }
BASELINE="$(read_baseline)"
# Scope is per-INCREMENT and changes as the loop advances (inc1 may touch one
# package, inc3 the umbrella and .changeset/ too), so it has to be re-read for
# the same reason the baseline does. Prefer state.json (`state.sh set scopeGlobs
# "..."`, updated per increment); fall back to the SCOPE_GLOBS env var for a
# one-shot run. Caching this at launch flags legitimately in-scope files for
# every increment after the first. (Observed M8 inc3.)
read_scope() {
  local s; s="$(jq -r '.scopeGlobs // empty' "$REPO/.dev-loop/state.json" 2>/dev/null)"
  [ -n "$s" ] && { printf '%s' "$s"; return; }
  printf '%s' "${SCOPE_GLOBS:-}"
}
POLL_SECS="${POLL_SECS:-30}"
STALL_SECS="${STALL_SECS:-300}"
DIFF_BUDGET="${DIFF_BUDGET:-800}"
SCOPE_GLOBS="${SCOPE_GLOBS:-}"

sig() { git -C "$REPO" status --porcelain=v1; git -C "$REPO" diff --stat "$BASELINE" 2>/dev/null; }
# Line/file counts must include brand-new UNTRACKED files — plain `git diff`
# omits them, which would let a large all-new-files increment slip past the
# RUNAWAY_DIFF budget and hide new files from SCOPE_VIOLATION.
changed_lines() {
  local tracked untracked=0 f
  tracked="$(git -C "$REPO" diff --numstat "$BASELINE" 2>/dev/null | awk '{a+=$1; d+=$2} END{print (a+d)+0}')"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    untracked=$(( untracked + $(wc -l < "$REPO/$f" 2>/dev/null || echo 0) ))
  done < <(git -C "$REPO" ls-files --others --exclude-standard 2>/dev/null)
  echo $(( ${tracked:-0} + untracked ))
}
changed_files() {
  { git -C "$REPO" diff --name-only "$BASELINE" 2>/dev/null
    git -C "$REPO" ls-files --others --exclude-standard 2>/dev/null; } | sort -u
}

last_sig="$(sig | sha1sum | cut -d' ' -f1)"
last_change=$(date +%s)
stuck_emitted=0
runaway_emitted=0
declare -A scope_emitted

# Turn a space-separated glob list into a case pattern check.
#
# `set -f` is REQUIRED and load-bearing: without it the unquoted $SCOPE_GLOBS in
# the `for` undergoes pathname expansion, so a pattern like 'packages/foo/**' is
# expanded by the shell against the filesystem BEFORE it is ever used as a
# pattern — leaving $g holding concrete top-level paths that no nested file can
# match. Every file in a subdirectory then reports SCOPE_VIOLATION. (Observed:
# an entire M7 increment's files, all genuinely in scope, flagged one by one.)
# With globbing off, the entries stay patterns; note `case` matching lets `*`
# cross `/`, so 'packages/foo/**' correctly matches 'packages/foo/a/b.ts'.
in_scope() {
  local f="$1" g rc=1
  [ -z "$SCOPE_GLOBS" ] && return 0
  set -f
  for g in $SCOPE_GLOBS; do
    # shellcheck disable=SC2254
    case "$f" in $g) rc=0; break ;; esac
  done
  set +f
  return $rc
}

while true; do
  # A new increment resets the frame of reference: re-point at the advanced
  # baseline and clear the latches, or a RUNAWAY_DIFF/SCOPE_VIOLATION emitted
  # for the PREVIOUS increment stays suppressed (or stale) through this one.
  new_baseline="$(read_baseline)"
  if [ "$new_baseline" != "$BASELINE" ]; then
    BASELINE="$new_baseline"
    runaway_emitted=0
    unset scope_emitted; declare -A scope_emitted
    last_sig="$(sig | sha1sum | cut -d' ' -f1)"
    last_change=$(date +%s)
  fi
  # Scope can widen mid-increment too (a brief may add the umbrella or
  # .changeset/), so refresh it every tick and re-arm the per-file latches when
  # it changes — a file flagged under the old scope may be legitimate now.
  new_scope="$(read_scope)"
  if [ "$new_scope" != "${SCOPE_GLOBS:-}" ]; then
    SCOPE_GLOBS="$new_scope"
    unset scope_emitted; declare -A scope_emitted
  fi

  cur_sig="$(sig | sha1sum | cut -d' ' -f1)"
  nows=$(date +%s)

  if [ "$cur_sig" != "$last_sig" ]; then
    if [ "$stuck_emitted" -eq 1 ]; then
      echo "RESUMED: working tree activity resumed after stall"
      stuck_emitted=0
    fi
    last_sig="$cur_sig"; last_change=$nows
  else
    idle=$(( nows - last_change ))
    if [ "$idle" -ge "$STALL_SECS" ] && [ "$stuck_emitted" -eq 0 ]; then
      echo "STUCK: no working-tree change for ${idle}s (threshold ${STALL_SECS}s) — Agent B may be blocked or spinning"
      stuck_emitted=1
    fi
  fi

  lines="$(changed_lines)"
  if [ "${lines:-0}" -gt "$DIFF_BUDGET" ] && [ "$runaway_emitted" -eq 0 ]; then
    echo "RUNAWAY_DIFF: ${lines} changed lines exceeds budget ${DIFF_BUDGET} — increment may be too large; consider splitting"
    runaway_emitted=1
  fi

  if [ -n "$SCOPE_GLOBS" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if ! in_scope "$f" && [ -z "${scope_emitted[$f]:-}" ]; then
        echo "SCOPE_VIOLATION: $f is outside declared scope ($SCOPE_GLOBS)"
        scope_emitted[$f]=1
      fi
    done < <(changed_files)
  fi

  sleep "$POLL_SECS"
done
