# logistics-ts

> A modular TypeScript supply-chain intelligence toolkit — forecasting, safety
> stock, ABC/XYZ classification, and replenishment primitives for building MRP,
> ERP, WMS, and inventory applications. Dependency-light and AI-agent-friendly.

> [!WARNING]
> **Under active development — pre-1.0.** The public API is not yet stable.

## Why

Every company building an MRP/ERP/inventory app re-implements the same
supply-chain mathematics — safety stock, reorder points, EOQ, demand
classification, intermittent-demand forecasting. `logistics-ts` provides those
algorithms as small, well-typed, explainable, dependency-free packages so you
can stop maintaining them yourself.

Every result is **explainable**: instead of a bare number, functions return the
value alongside the method used, the inputs, and the reasoning — for humans and
for AI agents building on top of the library.

## Packages

| Package | Responsibility |
|---------|----------------|
| [`@logistics-ts/core`](packages/core) | Types, column store, data loading, shared numerics, the `Explained` result wrapper |
| [`@logistics-ts/forecasting`](packages/forecasting) | Moving average, exponential smoothing, Croston/SBA/TSB, auto method selection |
| [`@logistics-ts/classification`](packages/classification) | ABC, XYZ, FSN, ABC-XYZ matrix, demand-pattern (SBC) classification |
| [`@logistics-ts/inventory`](packages/inventory) | Safety stock, reorder point, EOQ, coverage, issue analysis |
| [`logistics-ts`](packages/logistics-ts) | Umbrella package that re-exports everything under namespaces |

Dependency direction is enforced in CI as a strict layered order — each package
may import only from lower layers:

```
core  →  classification  →  forecasting  →  inventory  →  logistics-ts
```

`core` has zero runtime dependencies; `forecasting`'s auto method selection
routes through `classification` (SBC demand patterns); `inventory`'s auto safety
stock builds on both.

## Development

Requires Node ≥ 20 and pnpm.

```bash
pnpm install
pnpm build        # build every package (tsup)
pnpm test         # run the vitest suite
pnpm typecheck    # tsc --noEmit per package
pnpm lint         # biome
pnpm deps:check   # enforce dependency direction (dependency-cruiser)
pnpm check        # all of the above
```

See [`AGENTS.md`](AGENTS.md) for the repository map and conventions.

## License

[MIT](LICENSE)
