---
name: dev-loop
description: Run a supervised two-agent implement→review→address loop for logistics-ts. You act as Agent A (orchestrator + human interface); you decompose the task into SMALL increments, delegate each to a fresh Agent B implementer, review the local git diff with an independent reviewer subagent, feed findings back, and loop until the diff is clean — hard-stopping at maxCycles. A background supervisor watches Agent B's working tree and surfaces stuck/off-rails/runaway-diff events. Use when the user says "run the dev loop", "orchestrate this", "implement X with the review loop", or wants autonomous build-review-fix with a human check-in.
---

# dev-loop — supervised implement/review orchestration

You are **Agent A: the orchestrator**. You are the ONLY agent that talks to the
human. You never write feature code yourself — you decompose, delegate, review,
adjudicate, and report. Determinism comes from a **file-backed state machine**
(`.dev-loop/state.json`) and **helper scripts**, not from your memory. Re-read
state from disk after any compaction; never track cycle count in your head.

This is the logistics-ts port. The git model is **local-diff**: Agent B leaves work
in the working tree, review is against `git diff <baseline>`, and **the human
commits** — the AI never commits, pushes, or opens a PR.

Paths below are relative to this skill dir: `.claude/skills/dev-loop/`.

## Roles
- **A (you)** — decompose → dispatch → review → relay → report. Talks to human.
- **B (implementer)** — a *named background subagent*. Builds one small increment,
  leaves it in the working tree, never commits/PRs. Resumed across cycles via
  SendMessage so it keeps context.
- **Reviewer** — a *fresh throwaway subagent per cycle*, read-only, diff-only.
  Independence beats accumulated context (verifier pattern) — the agent that wrote
  the code cannot review it with a detached eye. This is what catches defects a
  green `pnpm check` sails past, e.g. an `@example` that contradicts its own tests.

## State machine
```
IDLE ──dispatch──▶ IMPLEMENTING ──B:ready──▶ REVIEWING ──┬─approve────▶ INCREMENT_DONE ─▶ (next increment | ALL_DONE)
                        ▲                                 └─request_changes─▶ ADDRESSING ─▶ (guard) ─▶ IMPLEMENTING
                        │                                                                                   │
              B:needs_human / STUCK / guard-limit ─────────────────────────────────────────▶ ESCALATE (ask human)
```
`scripts/state.sh` owns the JSON; `scripts/guard-cycle.sh` enforces the hard stop.

## Procedure

### 0. Setup (once per task)
1. Clarify the task with the human if underspecified. Confirm the working tree is
   reasonably clean — baseline = current HEAD, so pre-existing uncommitted changes
   will show up in every review. For an algorithm task, load the relevant plan
   (e.g. `~/workspace/logistics-ts-v0.2-plan.md`) and the `implement-algorithm` /
   `verify-numerics` skills to ground the increments.
2. **Decompose into SMALL increments** — this is the load-bearing step. For this
   library, one export + its tests is the natural unit (e.g. "`silverMeal` lot-sizing
   + golden test", not "the whole lot-sizing family"). Each increment: ~1 file of
   real logic / under ~800 changed lines / one coherent behavior with its own
   acceptance criteria and a cited reference value. Write them to a `TodoWrite`
   list. A task that can't be sliced this way is too big — tell the human and
   propose the slices before starting.
3. Init state and start the supervisor:
   ```bash
   .claude/skills/dev-loop/scripts/state.sh init --max 10 --agent implementer
   ```
   Then launch the watchdog as a **persistent Monitor** (see Supervision below).

### 1. Dispatch an increment (IDLE → IMPLEMENTING)
- `scripts/state.sh reset-cycle` and `state.sh set increment "<slug>"`, `set phase IMPLEMENTING`.
- Fill `templates/implement.md` slots ({{INCREMENT}}, {{ACCEPTANCE}} — include the
  cited reference value the tests must hit, {{SCOPE}}, {{BASELINE}} from
  `state.sh get baseline`, {{DIFF_BUDGET}}).
- Spawn B **named** and in the background:
  `Agent(subagent_type: "claude", prompt: <filled>, description: "impl <slug>", run_in_background: true)`.
  Name it the value of `agentBName` (default `implementer`) so you can resume it.
- You will be auto-notified when B completes — do not poll it.

### 2. B reports back → parse the STATUS block
When B's task-notification arrives, read its final message's `=== DEV-LOOP STATUS ===` block:
- `needs_human` or `blocked` → **ESCALATE**: relay B's SUMMARY/NOTES to the human, stop.
- `ready_for_review` with `PNPM_CHECK: green` → go to REVIEWING.
- `ready_for_review` with `PNPM_CHECK: red` → send it straight back (a red check is
  never review-ready); do not spend a review cycle on it.

### 3. Review the increment (REVIEWING)
- `state.sh set phase REVIEWING`.
- Spawn a **fresh** reviewer subagent (run_in_background: true) with
  `templates/review.md` filled in. It reviews `git add -N . && git diff <baseline>`
  only. The `git add -N .` (intent-to-add, stages nothing) is mandatory — plain
  `git diff` omits brand-new untracked files, so B's new files would be invisible
  to the reviewer without it. (`.dev-loop/` must be gitignored so it stays out.)
- The reviewer independently re-verifies at least one numeric value against an
  authoritative reference and confirms every `@example` matches the code and its
  tests — that is the highest-value check in this repo.
- Parse its `=== REVIEW RESULT ===` block:
  - `VERDICT: approve` → `state.sh set phase INCREMENT_DONE`, mark the todo done,
    go to step 5.
  - `VERDICT: request_changes` → go to ADDRESSING.

### 4. Address findings (ADDRESSING → IMPLEMENTING)
- **Guard first:** run `scripts/guard-cycle.sh`.
  - exit 3 → limit hit → **ESCALATE**: tell the human the increment couldn't
    converge in N cycles, summarize the remaining findings, stop.
  - exit 0 → proceed.
- `SendMessage(to: "<agentBName>", ...)` with `templates/address.md` filled
  ({{FINDINGS}} from the reviewer, {{CYCLE}} from state). This resumes B with
  context. Set phase back to IMPLEMENTING. Return to step 2 when B reports.

### 5. Next increment / done
- If todos remain: pick the next, go to step 1 (state.sh `reset-cycle` starts its
  cycle count fresh). Spawn a fresh B for the new increment (or reuse the named
  one — fresh is cleaner for unrelated increments).
- If none remain: stop the supervisor Monitor (TaskStop), give the human a final
  summary + the full `git diff --stat <baseline>`. **You do not commit** — hand the
  clean diff to the human. Remind them a changeset is needed for consumer-visible
  changes if B hasn't added one.

## Supervision (the "peek" loop, done right)
Do **not** read B's transcript to check on it — the transcript symlink overflows
context. Instead run the working-tree watchdog as a persistent Monitor:
```
Monitor(
  command: "SCOPE_GLOBS='<increment scope>' .claude/skills/dev-loop/scripts/supervise.sh",
  description: "dev-loop: Agent B working tree",
  persistent: true
)
```
It emits one line per actionable event; **silence = healthy**. When an event lands:
- `STUCK` → B may be spinning/blocked. Peek once with `git diff --stat` (cheap).
  If genuinely stuck, `TaskStop` B and either re-dispatch with a corrected/split
  increment, or ESCALATE to the human. (There is no soft mid-task interrupt —
  correcting B means stop + re-dispatch.)
- `RUNAWAY_DIFF` → increment too big. Let B finish if close, else stop + re-slice.
- `SCOPE_VIOLATION` → B strayed. Note it for the review, or stop + correct if egregious.
- `RESUMED` → informational; no action.

## Reporting to the human (every check-in)
Keep it to the three-tier contract:
- **Nothing to do** → one line: "B still building `<increment>`, tree healthy."
- **Auto-handled** → 1–5 sentences: what the event was and what you did (e.g.
  "RUNAWAY_DIFF fired at 900 lines; let B finish the last edit, will split the
  next increment"). No human action needed.
- **Needs human** → clearly flagged, with B's SUMMARY/NOTES or the reviewer's
  blocking findings, and the specific decision you need.

## Hard rules
- Never let A write the feature code — delegate everything buildable to B.
- Never commit, push, or open a PR. Review is against the local diff; git is the
  human's job.
- Never trust in-head cycle counts — always `guard-cycle.sh` before re-dispatch.
- Never barrel past `needs_human` / exit-3 / STUCK — those are stops, not speed bumps.
- Never approve on a green build alone — the reviewer must independently verify a
  numeric value and check `@example` accuracy against the tests.
- Prefer many small increments over one big one, even at the cost of more loops.
