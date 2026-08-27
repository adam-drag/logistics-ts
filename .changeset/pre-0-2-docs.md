---
'@logistics-ts/classification': patch
'@logistics-ts/core': patch
---

## `@example` on every public export

Twenty exported functions carried TSDoc without a runnable `@example`, against
the library's own rule that agents read these `.d.ts` blocks directly: `xyz`,
`fsn`, `bucketize`, `loadDemand`/`loadStock`/`loadLeadTimes`, `nelderMead`, the
`normalPdf`/`normalCdf`/`normalLossFunction` trio, the whole `epoch-day` family
and the descriptive-statistics family.

Every value in the new examples was produced by running the code, and each is now
pinned by a doctest (`doctest.test.ts` in `core` and `classification`), so an
example that drifts from the implementation fails CI rather than misleading a
reader. Documentation only — no behaviour changed.
