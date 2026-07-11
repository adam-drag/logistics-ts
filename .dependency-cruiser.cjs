/**
 * Enforces the layered dependency order from plans/v0.1.md.
 *
 * Layers, most stable first — a package may import only from LOWER layers:
 *
 *   0  core            (zero runtime dependencies)
 *   1  classification  -> core
 *   2  forecasting     -> core, classification        (autoForecast routes via SBC)
 *   3  inventory       -> core, classification, forecasting
 *   4  logistics-ts    -> all of the above (umbrella)
 *
 * Any import that points "up" a layer (or sideways into a same-layer sibling)
 * is forbidden, as is any cycle. This keeps the graph a DAG with a single
 * stable direction of dependency.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies break the layered architecture.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-is-a-leaf',
      severity: 'error',
      comment: 'core (layer 0) must not depend on any sibling package.',
      from: { path: 'packages/core/src' },
      to: { path: 'packages/(classification|forecasting|inventory|logistics-ts)/src' },
    },
    {
      name: 'classification-only-uses-core',
      severity: 'error',
      comment: 'classification (layer 1) may depend only on core.',
      from: { path: 'packages/classification/src' },
      to: { path: 'packages/(forecasting|inventory|logistics-ts)/src' },
    },
    {
      name: 'forecasting-stays-below-inventory',
      severity: 'error',
      comment: 'forecasting (layer 2) may depend only on core and classification.',
      from: { path: 'packages/forecasting/src' },
      to: { path: 'packages/(inventory|logistics-ts)/src' },
    },
    {
      name: 'inventory-below-umbrella',
      severity: 'error',
      comment: 'inventory (layer 3) must not depend on the umbrella package.',
      from: { path: 'packages/inventory/src' },
      to: { path: 'packages/logistics-ts/src' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
    },
  },
}
