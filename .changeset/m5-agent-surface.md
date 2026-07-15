---
'logistics-ts': minor
---

M5 agent surface: ship the AI-agent consumption layer for the published
`logistics-ts` package.

- **Shipped skills** (in the package tarball, under `skills/`) — end-to-end
  recipes an agent can follow: `forecast-and-replenish` (load → bucketize →
  classify → autoForecast → safety stock → reorder point → issues) and
  `inventory-analysis` (ABC-XYZ, coverage/turnover, and the issue analyser via
  both `InventoryAnalyzer` and the pure functions).
- **`llms.txt`** at the repo root — an llmstxt.org entry point: what the library
  is, the API map, gotchas, and links to the docs/skills/examples.
- **Expanded `AGENTS.md`** — a "which function for which problem" decision table
  and the full gotchas list (zero-fill, unit agreement, cycle-service-level ≠
  fill rate, MAPE-at-zero, sample-vs-population std).
- **Consumer README** — install, a runnable quick-start, and an "For AI agents"
  section.
- **Runnable `examples/`** — `quickstart`, `forecast-and-replenish`, and
  `inventory-analysis`, driven by `generateExampleData()` (`pnpm example:*`),
  typechecked as part of `pnpm check`.

No library code changed; this is documentation, skills, and examples. The
`skills/` directory is included in the published tarball (already declared in
`files`).
