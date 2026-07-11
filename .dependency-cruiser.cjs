/**
 * Enforces the dependency direction from plans/v0.1.md:
 *
 *   core  <-  inventory, classification, forecasting
 *   inventory  ->  forecasting        (one-way, allowed)
 *   logistics-ts (umbrella)  ->  all
 *
 * Forbidden: anything importing back into inventory/classification, and any
 * cycles. core must stay dependency-free (leaf of the graph).
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
      comment: '@logistics-ts/core must not depend on any sibling package.',
      from: { path: 'packages/core/src' },
      to: { path: 'packages/(inventory|classification|forecasting|logistics-ts)/src' },
    },
    {
      name: 'no-imports-into-inventory',
      severity: 'error',
      comment: 'Only the umbrella package may depend on inventory.',
      from: { path: 'packages/(classification|forecasting)/src' },
      to: { path: 'packages/inventory/src' },
    },
    {
      name: 'no-imports-into-classification',
      severity: 'error',
      comment: 'classification is a leaf consumed by inventory/umbrella only.',
      from: { path: 'packages/(forecasting)/src' },
      to: { path: 'packages/classification/src' },
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
