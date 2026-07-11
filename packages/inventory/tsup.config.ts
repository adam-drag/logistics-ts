import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  // Keep sibling packages external — never bundle one @logistics-ts package
  // into another; they are declared as runtime dependencies instead.
  external: [/^@logistics-ts\//],
})
