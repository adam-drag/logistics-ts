---
'@logistics-ts/forecasting': minor
'@logistics-ts/core': minor
---

Add `trend()`: demand trend detection gated on both materiality and statistical significance.

`trend(series)` fits an OLS slope over the period index and returns an `Explained<Trend>` carrying the slope, its standard error, the t statistic and critical value, R², the slope as a fraction of the series level, and a `direction` of `increasing` / `decreasing` / `flat`.

A direction is reported only when the slope is **both** material and significant. Each gate alone produces a label that looks informative and is not:

- A raw slope is in units per period, so thresholding it is not comparable between items. A slope of 0.1 is nothing for an item averaging 5,000 a day and a doubling for one averaging 0.5. `trend` gates on the slope relative to the mean level, so the same shape gets the same label at any scale.
- Every real series has a nonzero fitted slope. Reporting its sign labels noise as a trend for about half of a flat catalogue, so the slope must also be distinguishable from zero.

Both gates are exposed on the result as `material` and `significant`, and both thresholds are options, so a caller can apply its own rule to the evidence without re-running the regression. `minRelativeSlope` defaults to 1% of the mean level per period and is documented as a convention rather than a derivation.

Also adds `tCriticalTwoTailed(degreesOfFreedom, confidenceLevel)` to `@logistics-ts/core`: two-tailed Student's t critical values at the 0.90, 0.95 and 0.99 levels. A 12-period series has 10 degrees of freedom, where the critical value is 2.228 against the normal's 1.960, so substituting `z` would understate the bar by 14%. Untabulated degrees of freedom round down, which is conservative in one direction only: the function never makes a borderline effect look significant when it is not.
