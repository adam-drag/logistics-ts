---
'logistics-ts': patch
---

Pin the transitive `js-yaml` used by the release tooling to `^4.3.1`, clearing
CVE-2026-59870 (quadratic CPU consumption in `!!omap` resolution). Development
dependency only — it is reached through `@changesets/cli` and never ships to
consumers, since every published package has zero runtime dependencies.
