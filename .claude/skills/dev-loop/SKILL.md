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

This is the logistics-ts port. The git model is **commit-per-increment**: Agent B
leaves work in the working tree, review is against `git diff <baseline>`, and **A
commits each APPROVED increment on the feature branch and advances the baseline**.
A never pushes and never opens a PR — that stays the human's call.

> **Why not pure local-diff (this skill's original design)?** With a baseline
> frozen at loop start, every later review re-reads all prior increments: by
> increment 5 of M7 the reviewer would have re-read ~2,700 lines to review ~400,
> and both supervisor tripwires (`RUNAWAY_DIFF`, scope) measure cumulative work
> and start crying wolf after increment 1. Committing each approved increment
> fixes all of it at once, and yields clean per-increment history for the eventual
> PR. Squash at merge if you want a single commit.

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

### 5. Increment approved → commit and advance the baseline
This step is what keeps every later review cheap and honest. On approval:
```bash
git add -A && git commit   # message: what shipped + how it was VERIFIED
NEW=$(git rev-parse HEAD)
scripts/state.sh set baseline "$NEW"
scripts/state.sh reset-cycle
```
Then mark the todo done. Write the commit body to record the *evidence* (reference
values reproduced, property tests added, deviations and why) — future readers get
the reasoning, not just the change.

**Then run the learning checkpoint — this is a required step, not an optional one.**
Ask whether any `self-improve` learning signal fired during this increment: were you
wrong about something you put in the brief? Did the reviewer catch something the
checklist should have? Did a green gate sit over a real defect? Did you produce a
false positive, verify in the wrong environment, or deviate from documented process
and turn out right? If yes, capture it **now**, while the context is live — patch
the artifact that would have prevented it (`lt-review` for a review gap, this skill
for an orchestration gap, `self-improve` for a code anti-pattern), and verify the
patched rule actually catches the original defect. Waiting until the human asks
"did you learn anything?" means the checkpoint already failed; in M7 that happened
twice, and both times there was real material waiting.

- If todos remain: pick the next, go to step 1. **Reuse the named B when the next
  increment builds on this one's code** (it knows the helpers it just wrote — worth
  more than a clean context); spawn fresh for genuinely unrelated work.
- If none remain: stop the supervisor Monitor (TaskStop), run the full `pnpm check`
  **yourself** as a final gate, and give the human a summary + `git log --oneline
  origin/main..HEAD` + `git diff --stat origin/main`. **Do not push or open a PR** —
  ask. Confirm a changeset exists for consumer-visible changes.

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

## Operating lessons (learned running M7 — these cost real cycles)

**A adjudicates findings; it does not relay them.** The reviewer lacks your context
and its severities are advisory. In M7 it flagged a missing changeset as Major that
*you* had deliberately deferred to a later increment — and separately offered "filter
the input **or** reword the doc" where the right answer was neither (the repo's
fail-fast invariant demanded a thrown error). Decide, then send B a directive with
your reasoning. Downgrade what's deferred by design; upgrade what the repo's
invariants say is worse than the reviewer judged. Blind relaying wastes cycles and
ships worse code.

**Brief the reviewer with this increment's specific risks, not just "review it."**
Generic review finds generic issues. Name what you're worried about — "this DP
optimises one cost expression and reports another; prove they're equivalent for all
inputs, not just the goldens" — and say which claims to re-derive independently. The
sharpest M7 findings all came from a named risk, never from the generic sweep.

**Ask "would this test fail on the bug I care about?"** M7's optimality test asserted
`WW ≤ lotForLot`. It passed, it looked like an optimality guard, and it guarded
nothing: the heuristics are far from optimal, so a broken DP still beats them
comfortably. A test that exists and passes can still protect nothing — that's harder
to spot than a missing test and no build will ever flag it.

**A blocked command is a stop, not a guess.** Instruct B: if a tool call is rejected,
report `needs_human` with what it *did* observe — never report a `pnpm check` status
it didn't see. When it escalates, **run the command yourself** rather than bouncing
it to the human; you usually can. (B did exactly this in M7 and it was right.)

**Invite B to correct the brief.** Your dispatch will contain errors. In M7 B caught
a wrong module path *and* a swapped argument order in the fixture generator I'd
specified — either would have produced a plausible-but-wrong golden. Tell B to verify
your claims against the source and report corrections.

**Never bless a time-bound artifact as "still accurate."** I told B the changeset
wording "stays accurate"; it went stale one increment later when new exports landed.
Instead: re-read the changeset (and any doc making claims about the export surface)
against the code on **every** increment.

**Require self-verification of the tests themselves.** Ask B to mutation-test its own
work (introduce the plausible bug, confirm tests fail, revert). And have it *verify
the revert landed* — an M7 `cp` revert failed silently on an interactive prompt and
briefly left a deliberate bug in the tree.

**Test in the shell the script actually runs under.** A shebang-`bash` script tested
from a zsh prompt gives meaningless results — zsh doesn't word-split unquoted
expansions and its `*` doesn't cross `/`. Use `bash <<'BASH' … BASH`.

**Supervisor expectations.** `STUCK` fires whenever the tree is static — which
includes every review phase and every time B is composing a report; it is usually
benign, so peek (`git diff --stat`) before acting. If the supervisor produces only
false positives, turn it off rather than train yourself to ignore it: B's completion
notification is the real signal.

## Hard rules
- Never let A write the feature code — delegate everything buildable to B.
- Commit each **approved** increment and advance the baseline (§5). Never push and
  never open a PR — ask the human.
- Never trust in-head cycle counts — always `guard-cycle.sh` before re-dispatch.
- Never barrel past `needs_human` / exit-3 — those are stops, not speed bumps.
- Never approve on a green build alone — the reviewer must independently verify a
  numeric value and check `@example` accuracy against the tests.
- Never accept a status B did not observe, and never assert one yourself.
- Prefer many small increments over one big one, even at the cost of more loops.
