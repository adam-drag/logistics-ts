# dev-loop

A Claude Code skill that automates the **human → implement → review → address**
cycle into a supervised **two-agent loop**, so a human defines a task once and gets
back a reviewed, clean local diff — with check-ins along the way and a hard stop
before anything runs away. This is the **logistics-ts** port (local-diff model).

## The idea

The manual loop we used to run (and did, by hand, for M6 fill-rate):

> human defines task → AI implements → human pushes → AI reviews → human asks AI to
> address findings → repeat until no findings.

`dev-loop` collapses that into:

> **human defines task → Agent A orchestrates.** A decomposes the task into small
> increments and delegates each to **Agent B**. B builds it in the working tree. An
> independent reviewer checks the local `git diff`. A relays findings to B. The
> review loop repeats until the diff is clean (hard stop at 10 cycles), then A hands
> the human a clean diff to commit.

A background **supervisor** watches B's working tree and pings the human only when
something is actionable (stuck / runaway diff / out of scope).

## Roles

| Role | Who | Does | Talks to human? |
|------|-----|------|-----------------|
| **A — orchestrator** | your main Claude Code session | decompose → dispatch → review → adjudicate → report | ✅ only A |
| **B — implementer** | a *named background subagent* | builds ONE small increment, leaves it in the working tree | ❌ |
| **Reviewer** | a *fresh subagent per cycle*, read-only | reviews the local diff, returns findings | ❌ |

Separating "build" from "review" is the whole point — an agent that wrote the code
can't review it with a detached eye (the *verifier pattern*). The reviewer is
spawned fresh and diff-only each cycle so its judgment stays independent. In this
library that independence is what catches an `@example` whose numbers disagree with
the code's own passing tests — a defect a green `pnpm check` cannot see.

## Design decisions (and why)

- **Review the local `git diff`, not a PR.** No commits, no pushes, no `gh`. Git
  stays the human's job; the AI never touches history. Baseline = HEAD when the loop
  starts; the reviewer reads `git diff <baseline>`.
- **Small increments are mandatory, not a nicety.** For this library the natural
  unit is one export + its cited tests (one lot-sizing rule, not the whole family).
  Small bounded tasks produce cleaner code and fewer hallucinations, and — critically
  — a *killed* small task is cheap. There is no soft mid-task interrupt in the
  harness; correcting B means stopping and re-dispatching, so you want the in-flight
  unit tiny.
- **State lives in a file, not the model's head.** `.dev-loop/state.json` holds
  phase, cycle count, baseline, and the current increment. A script
  (`guard-cycle.sh`) enforces the hard stop, so a context compaction can't make the
  loop forget where it is or run forever.
- **Supervision is inverted.** We never read B's transcript to "peek" (that overflows
  context and is expensive). Instead a `Monitor` watches cheap external signals — the
  git working tree — and emits one event per problem. Silence means healthy.
- **What can't be automated is escalated, not faked.** Semantic "is B doing something
  dumb?" judgment is unreliable mid-flight, so it's concentrated at the review gate.
  Anything only a human can decide (`needs_human`, a stuck agent, the cycle limit, an
  unresolved plan open-decision) stops the loop and asks.

## logistics-ts specifics

The scripts are repo-agnostic; the **templates** carry this library's standards:
- Every domain result returns `Explained<T>`; TSDoc with formula + citation +
  `@example` on every export; the layering law (`core` is a zero-dep leaf); no `any`;
  strict flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Numeric correctness is the review's top priority.** The reviewer independently
  recomputes a worked value against an authoritative reference (textbook,
  statsforecast/stockpyl fixture, z-table) and verifies every `@example` matches the
  code and its tests, requiring a doctest guard for load-bearing example numbers.
- Definition of done for any increment: the full `pnpm check` (lint + typecheck +
  build + test + deps:check) is green, plus a changeset for consumer-visible changes.
- B invokes `implement-algorithm` / `verify-numerics`; the reviewer invokes
  `code-review` / `verify-numerics`.

## How to use it

In a Claude Code session, from the repo root:

```
Use the dev-loop skill to implement <your task>.
```

Agent A will (per `SKILL.md`):

1. Clarify the task and check the working tree is clean-ish.
2. Decompose into small increments (shown as a todo list).
3. `scripts/state.sh init` and start the supervisor Monitor.
4. For each increment: dispatch B → B builds + runs `pnpm check` → review the diff →
   send findings back to B → loop until approved or the cycle guard trips.
5. Hand you a clean `git diff` to review and commit yourself.

You'll get check-ins in three flavors: *nothing to do* (one line), *auto-handled*
(1–5 sentences, no action needed), or *needs you* (clearly flagged with the decision
required).

## Files

```
dev-loop/
├── SKILL.md               # the orchestrator protocol (state machine + procedure)
├── README.md              # this file
├── scripts/
│   ├── state.sh           # .dev-loop/state.json read/write (phase, cycle, baseline)
│   ├── guard-cycle.sh     # increments cycle, exit 3 at the hard limit
│   └── supervise.sh       # working-tree watchdog; run as a persistent Monitor command
└── templates/
    ├── implement.md       # Agent B initial dispatch (fill the {{SLOTS}})
    ├── address.md         # Agent B "address findings" resume message
    └── review.md          # fresh reviewer subagent prompt (diff-only)
```

## Tuning

Env knobs for `supervise.sh` (set inline in the Monitor command):

| Var | Default | Meaning |
|-----|---------|---------|
| `POLL_SECS` | 30 | how often the watchdog checks the tree |
| `STALL_SECS` | 300 | no tree change for this long → `STUCK` |
| `DIFF_BUDGET` | 800 | changed lines above this → `RUNAWAY_DIFF` |
| `SCOPE_GLOBS` | _(unset)_ | space-separated globs; a changed file outside them → `SCOPE_VIOLATION` |

Cycle limit: `state.sh init --max N` (default 10).

## Requirements & limitations

- Needs `git`, `jq`, and `bash`. `.dev-loop/` is gitignored (scratch state).
- Assumes a roughly clean working tree at start — pre-existing uncommitted edits are
  included in the baseline diff and will show up in every review.
- **No mid-task interrupt exists**: A can't gently steer a running B; it can only
  stop + re-dispatch. Keep increments small so that's cheap.
- **Mid-flight semantic supervision is intentionally shallow** — only structural
  tripwires (stall, size, scope). Deep "is this the right approach?" and numeric
  correctness judgment happen at the review gate, not every 30s.
- Each spawned agent starts cold; the orchestrator carries the shared context and
  re-hydrates B via SendMessage. More agents = more token cost — that's the price of
  independent review.
