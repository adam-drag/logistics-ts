# logistics-ts — Research Findings (2026-07-11)

Synthesis of three research streams: competitive landscape, data-layer feasibility, algorithm scope + AI-agent distribution. Companion to `concept.md`.

---

## Verdict

**The gap is real and clean.** No npm package implements safety stock, reorder point, EOQ, ABC/XYZ, Croston/SBA/TSB, or replenishment recommendations. The niche keyword space on npm is literally empty. The concept is buildable dependency-free, and the AI-agent distribution thesis has real (if directional) supporting evidence.

Two significant corrections to the concept as written:

1. **DuckDB should NOT be the core** — make it an optional adapter (details below).
2. **The MVP scope in the ChatGPT refinement is right, but the algorithm list can be tightened further** — everything needed is implementable in pure TS, no WASM, no native deps.

---

## 1. Competitive landscape

### JS/TS ecosystem: essentially empty

| Package | What | Status |
|---|---|---|
| [`arima`](https://github.com/zemlyansky/arima) | ARIMA/SARIMA via WASM | ~21k downloads/week — proves demand for forecasting in Node; forecasting only, no inventory math |
| `timeseries-analysis`, `nostradamus`, `holtwinters` | Old Holt-Winters/AR ports | All dead (last publishes 2012–2016) |
| [`@classytic/flow`](https://www.npmjs.com/package/@classytic/flow) | Inventory *ledger* for MongoDB (moves, lots, FIFO/FEFO) | New (Apr 2026), 208 dl/wk — transactional, no analytics. **Complementary, not competitive** — confirms someone else sees the same audience |
| `simple-statistics` | General stats | Healthy, useful primitive, not a competitor |

No npm package implements Croston/intermittent-demand forecasting at all.

### Python prior art (the design references)

- **[statsforecast](https://github.com/Nixtla/statsforecast)** (Nixtla, very active) — best-in-class API: uniform `fit/predict` over a model list, built-in cross-validation. Its intermittent-demand roster (Croston Classic/Optimized/SBA, ADIDA, IMAPA, TSB) is the feature checklist.
- **[stockpyl](https://github.com/LarrySnyder/stockpyl)** (Lehigh Univ., active) — closest conceptual model for the inventory half: textbook-aligned function-per-model (EOQ variants, newsvendor, (r,Q)/(s,S), multi-echelon).
- **[supplychainpy](https://github.com/KevinFasusi/supplychainpy)** — **the cautionary tale**. Almost exactly the logistics-ts scope (safety stock, EOQ, ABC/XYZ, replenishment recs), 324 stars, abandoned since 2022, install broken. Proof of demand for the exact bundle; died partly from scope creep (tried to also be a Flask dashboard).

### Commercial

No developer-facing "safety stock as an API" exists. Nixtla TimeGPT is forecasting-only (Python/R SDKs). Amazon Forecast was shut to new customers in 2024. Inventory-optimization SaaS (Lokad, Netstock, EazyStock, ToolsGroup) all sell end-user planning apps with ERP connectors, not libraries/APIs.

### Risks

- Addressable audience = Node/TS backend devs building ERP/e-commerce/MRP tooling (Shopify apps, Medusa, custom MRP SaaS) — real but niche.
- The real competitor is internal company code (as the concept already notes).

---

## 2. Data layer: don't hard-depend on DuckDB

### Why not

- `@duckdb/node-api` (the correct modern binding — old `duckdb` npm is deprecated and had a Sept 2025 malware incident) pulls a **~71 MB platform binary**.
- It can't serve the browser anyway — `@duckdb/duckdb-wasm` is a separate package with a different API (~10 MB gzipped wasm, 2–4 GB memory ceiling).
- Lambda: pushes consumers toward the 250 MB unzipped limit; established fix is a Lambda layer, which only the *consumer* can arrange.
- Native `.node` resolution friction in monorepos/bundlers (pnpm symlinks, Next.js, esbuild externals).

### Why you don't need it in core

The workloads are a **fixed, known set of aggregations** (demand per SKU/period, lead-time stats, cumulative-value ranking, CV²) — not ad-hoc SQL. At the realistic scale (10k–5M rows), a hand-rolled columnar core over `Float64Array` + dictionary-encoded string keys runs single-pass aggregations in well under a second in V8, with zero dependencies, identical in Node/browser/edge/Lambda.

### Recommended architecture (drizzle-orm driver model)

```
logistics-ts (core)          — zero runtime deps; typed-array column store;
                               column-mapping loader (arrays-of-objects, columnar, Arrow-ish)
@logistics-ts/duckdb         — peer-deps @duckdb/node-api; heavy ingestion
                               (multi-GB Parquet/CSV, SQL pre-agg), >5M-row escape hatch
@logistics-ts/duckdb-wasm    — same seam for browser (APIs differ, must be separate)
CSV/Parquet without DuckDB   — hyparquet/hyparquet-writer (zero-dep, ~10 KB gz) covers
                               most "load my sales file" cases with no native code
```

Define a tiny `TableSource` ingestion interface in core; if Arrow interchange is wanted, [`flechette`](https://github.com/uwdata/flechette) (~14 KB gz) over `apache-arrow` (5.4 MB, tree-shaking issues). Avoid `danfo.js` (stalled) and `nodejs-polars` (~116 MB binary) as deps.

Result: `npm i logistics-ts` is kilobytes and works everywhere; the 71 MB engine is opt-in.

---

## 3. Algorithm scope (MVP)

All implementable dependency-free in TS — each method is <~100 lines of arithmetic.

### Inventory

- **Safety stock as a family of named formulas**, not one function:
  1. Demand-variability only: `SS = Z·σD·√L`
  2. Lead-time-variability only: `SS = Z·D̄·σLT`
  3. **Combined "King formula"**: `SS = Z·√(L̄·σD² + D̄²·σLT²)` — what most companies actually use
  4. Heuristics: max-minus-average, %-of-lead-time-demand
  - Z-score via inverse-normal-CDF (Acklam approximation, ~20 lines, dep-free)
  - Doc caveat (and v1.1 differentiator): cycle service level ≠ fill rate; a fill-rate solver via the unit normal loss function is something most tools skip
- **Reorder point**: `ROP = D̄·L̄ + SS`; plus order-up-to / min-max
- **EOQ**: Harris/Wilson + quantity-discount and EPQ variants (all closed-form)
- **Classification**: ABC (configurable Pareto cutoffs, return cumulative share), XYZ (CV cutoffs 0.5/1.0, configurable), FSN, and the 9-cell ABC-XYZ matrix **with policy hints per cell** (AX → automate + low SS; CZ → make-to-order)
- **Coverage**: days-of-inventory, forecast-walk coverage, turnover, DIO

### Forecasting

Include: MA, SES, Holt (+ damped trend), Holt-Winters additive+multiplicative (param fit via Nelder-Mead, ~80 lines dep-free), Croston, **SBA** (recommended default for intermittent), **TSB** (obsolescence-aware), classical seasonal decomposition. **Exclude ARIMA from MVP** (estimation-heavy; say so explicitly — or later follow `arima`'s WASM-port approach).

### Auto method selection — the concept's "killer feature" is a solved recipe

**Syntetos-Boylan-Croston (SBC) classification**: compute ADI (avg inter-demand interval) and CV² of nonzero demand sizes; cutoffs **ADI = 1.32, CV² = 0.49** → Smooth / Erratic / Intermittent / Lumpy quadrants → route smooth to ES family (with seasonality test), intermittent/lumpy to SBA (or TSB under obsolescence). Offer Kostenko-Hyndman's improved nonlinear boundary as an alternate classifier — easy credibility win. Pair with rolling-origin backtesting minimizing **MASE** (the correct scale-free metric) — that's what Nixtla's "auto" actually does.

**Metrics to ship**: MAE, RMSE, MAPE (zero-demand warning), sMAPE, MASE, bias/tracking signal.

### Citations for algorithm trust (put in TSDoc of each export)

Silver-Pyke-Thomas *Inventory and Production Management in Supply Chains* 4e (2017); Hyndman & Athanasopoulos [fpp3](https://otexts.com/fpp3/) (free online); Croston (1972); Syntetos & Boylan (2005) — SBA; Syntetos, Boylan & Croston (2005) — ADI/CV² quadrants; Teunter-Syntetos-Babai (2011) — TSB; Kostenko & Hyndman (2006); King (2011, APICS) — safety stock; Harris (1913) — EOQ; Hyndman & Koehler (2006) — MASE.

---

## 4. AI-agent distribution: real, with concrete conventions

Ranked by leverage:

1. **Rich TSDoc + strict types** — agents read `.d.ts` in `node_modules` directly. Formula, units, constraints, citation, `@example` in every export's TSDoc. Zero infra cost, #1 lever.
2. **Ship agent skills inside the npm package** — `skills/<name>/SKILL.md`, consumed via [antfu/skills-npm](https://github.com/antfu/skills-npm) or [vercel-labs/skills](https://github.com/vercel-labs/skills) (`npx skills add`); format is now cross-agent (Claude Code, Cursor, Codex, Gemini CLI). E.g. a "forecast-and-replenish" skill: how to classify demand, pick a method, compute ROP with this library. Highest-leverage novel channel.
3. **Submit to [Context7](https://github.com/upstash/context7)** (104k+ libraries indexed) — how agents pull version-specific docs mid-session; free, arguably more impactful than running your own MCP server.
4. **AGENTS.md** in repo root — API map, "which function for which problem", gotchas ("MAPE undefined at zero demand — use MASE").
5. **llms.txt** on the docs site — fetched by Cursor/Windsurf/Claude Code when pointed at docs; cheap, do it. (No crawler auto-discovers it yet.)
6. **Own MCP server** — v2, not MVP. Useful for non-coding agents running `forecast`/`classify_skus` on CSVs.

Evidence the channel is real: Netlify's "Agent Experience" thesis with reported agent-driven signups; [arXiv 2503.17181](https://arxiv.org/html/2503.17181v2) shows LLMs systematically pick libraries by learned reputation — meaning a new library must win via **in-context signals** (skills, Context7, types) rather than training-data presence, which is exactly the plan above. Honest gap: no audited "% of npm installs initiated by agents" data exists; evidence is directional.

Exemplars: Mastra, Vercel AI SDK, Cloudflare `agents`, Netlify's `recipes ai-context` CLI pattern (worth copying as `npx logistics-ts init-agent-context`).

Also from the concept, validated as high-value for agents: **`generateExampleManufacturingData()`** — synthetic datasets let agents build demos instantly.

---

## 5. Recommended MVP

**Packages** (v0.1): `@logistics-ts/core` (types, column store, loader) + `@logistics-ts/inventory` + `@logistics-ts/classification` + `@logistics-ts/forecasting` (needed by auto-safety-stock — hard to cut) . Defer: procurement, analytics, DuckDB adapters.

**Modules**: `safetyStock` (4 methods + z util), `reorderPoint`, `eoq`, `classify` (ABC/XYZ/FSN/matrix/SBC), `forecast` (MA/SES/Holt/HW/Croston/SBA/TSB/auto), `metrics`, `coverage`, `generateExampleData`.

**API shape**: the ChatGPT refinement's dataset-instance direction is right (no hidden module state), and statsforecast/stockpyl confirm it — but keep functions pure and tree-shakeable underneath; the `InventoryAnalyzer` class is a thin convenience wrapper over pure functions.

**Explanations in outputs** (method chosen, why, inputs used) — validated as a differentiator; no competitor does it and agents consume it directly.

**What to avoid** (supplychainpy's death): no bundled dashboard/UI, no ERP connectors, no becoming an app. Chart-friendly data output yes; charts no.
