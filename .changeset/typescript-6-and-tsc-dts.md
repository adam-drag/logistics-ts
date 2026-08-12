---
'@logistics-ts/classification': patch
'@logistics-ts/forecasting': patch
'@logistics-ts/inventory': patch
'@logistics-ts/planning': patch
'@logistics-ts/core': patch
'logistics-ts': patch
---

Build on TypeScript 6 and generate declarations with `tsc` instead of `tsup`.

No API change. The published type surface is identical, but its layout changes:
`dist/index.d.ts` is now an entry point that re-exports a tree of sibling `.d.ts`
files, where it was previously a single bundled file. Every declaration still
ships (`files: ["dist"]`), and `exports.types` still points at
`./dist/index.d.ts`, so resolution is unchanged for consumers.

The reason is that `tsup`'s declaration step vendors `rollup-plugin-dts`, which
reaches into the TypeScript compiler's JavaScript API and fails on TypeScript 6
and 7. `tsc --emitDeclarationOnly` has no such coupling, so declaration
generation now uses the same compiler that typechecks the code.
