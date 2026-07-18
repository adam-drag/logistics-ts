# /// script
# requires-python = ">=3.12"
# dependencies = ["statsforecast>=2.0", "statsmodels>=0.14", "numpy", "stockpyl>=0.0.14"]
# ///
"""Generates the checked-in golden fixtures for @logistics-ts/forecasting and
@logistics-ts/planning.

Run with:  uv run fixtures/generate.py
Outputs:   fixtures/forecasting.json  (consumed by packages/forecasting/src/golden.test.ts)
           fixtures/lot-sizing.json   (consumed by packages/planning/src/lot-sizing/golden.test.ts)

References and why each is comparable to the TS implementation:

- statsforecast (Nixtla) CrostonClassic / CrostonSBA: smooths the non-zero demand
  sizes and the inter-demand intervals by SES initialised at the first element,
  with alpha fixed at 0.1 — the same recursion and initialisation convention as
  packages/forecasting/src/croston-base.ts, so values must match to float precision.
- statsforecast TSB: smooths the 0/1 demand indicator over EVERY period starting
  from p = d_0, and the non-zero sizes by SES from the first size. The TS tsb()
  follows the same convention.
- statsforecast SimpleExponentialSmoothing(alpha): SES initialised at y_0 — same
  as ses() with a supplied alpha.
- statsmodels Holt / ExponentialSmoothing with initialization_method="known" and
  fixed smoothing parameters: pins the Holt and Holt-Winters recursions given the
  SAME initial states the TS code derives. For Holt the TS code consumes y_0/y_1
  for initialisation (l=y_0, b=y_1-y_0) and starts updating at t=1, so the
  statsmodels model is fed series[1:] with those known initial states — its t=0
  update then corresponds to the TS t=1 update. (statsforecast is not used here:
  its Holt/HW are ETS models with MLE-optimised initial states, which is not the
  same estimator and cannot be compared at fixed parameters.)

- stockpyl (Snyder) wagner_whitin: the DP-optimal dynamic lot-sizing solution,
  which reproduces Snyder & Shen, Fundamentals of Supply Chain Theory 2e,
  Example 3.9. stockpyl charges holding on END-OF-PERIOD inventory, the same
  convention as packages/planning/src/lot-sizing/cost.ts, so the total cost must
  match exactly. NOTE the signature is wagner_whitin(num_periods, holding_cost,
  fixed_cost, demand) — holding cost comes BEFORE fixed cost — and its output
  lists are 1-INDEXED with a placeholder at element 0, so order_quantities[t]
  is the order for period t and maps to our 0-indexed period t-1.
"""

import json
from pathlib import Path

import numpy as np
from statsforecast.models import (
    TSB,
    CrostonClassic,
    CrostonSBA,
    SimpleExponentialSmoothing,
)
from statsmodels.tsa.holtwinters import ExponentialSmoothing, Holt
from stockpyl.wagner_whitin import wagner_whitin

OUT = Path(__file__).parent / "forecasting.json"
OUT_LOT_SIZING = Path(__file__).parent / "lot-sizing.json"

# Deterministic demand-like series (no RNG so the file never churns).
INTERMITTENT_A = [0, 5, 0, 0, 7, 0, 0, 0, 3, 4, 0, 6, 0, 0, 2, 0]  # starts with zeros
INTERMITTENT_B = [4, 0, 0, 6, 0, 2, 0, 0, 0, 5, 1, 0, 3, 0, 0, 8]  # starts with demand
SMOOTH = [112, 118, 132, 129, 121, 135, 148, 148, 136, 119, 104, 118]  # fpp3 airpass head
TREND = [17, 21, 19, 23, 18, 16, 20, 18, 22, 20, 15, 22, 24, 21, 26, 25]


def sf_point(model, y):
    """One-step point forecast from a statsforecast model."""
    return float(model.forecast(y=np.asarray(y, dtype=np.float64), h=1)["mean"][0])


def holt_fixture(y, alpha, beta, phi=None, horizon=3):
    """statsmodels Holt fed y[1:] with known init l=y0, b=y1-y0 (see module doc)."""
    damped = phi is not None
    model = Holt(
        np.asarray(y[1:], dtype=np.float64),
        damped_trend=damped,
        initialization_method="known",
        initial_level=float(y[0]),
        initial_trend=float(y[1] - y[0]),
    )
    kwargs = dict(smoothing_level=alpha, smoothing_trend=beta, optimized=False)
    if damped:
        kwargs["damping_trend"] = phi
    fit = model.fit(**kwargs)
    fc = fit.forecast(horizon)
    return {
        "series": y,
        "alpha": alpha,
        "beta": beta,
        **({"phi": phi} if damped else {}),
        "horizon": horizon,
        "expected": [float(v) for v in fc],
    }


def hw_fixture(y, m, mode, alpha, beta, gamma, horizon):
    """statsmodels ExponentialSmoothing with the TS code's own heuristic init.

    horizon must stay < m: at h ≡ 0 (mod m) statsmodels overwrites the last
    computed seasonal state before building the forecast tail
    (model.py: ``s[nobs + m - 1:] = [s[(nobs - 1) + j % m] ...]``), i.e. it uses
    a one-update-stale seasonal index there, while fpp3 §8.4 (and the TS code,
    and R's forecast::hw) uses the latest states. The full one-step fitted path
    is also emitted — the two implementations agree on it exactly, which pins
    the whole recursion, not just three forecast points.
    """
    assert horizon < m, "keep horizon < m; statsmodels diverges from fpp3 at h ≡ 0 (mod m)"
    y = np.asarray(y, dtype=np.float64)
    first = y[:m].mean()
    second = y[m : 2 * m].mean()
    seasonal0 = (y[:m] / first) if mode == "mul" else (y[:m] - first)
    model = ExponentialSmoothing(
        y,
        trend="add",
        seasonal=mode,
        seasonal_periods=m,
        initialization_method="known",
        initial_level=float(first),
        initial_trend=float((second - first) / m),
        initial_seasonal=seasonal0,
    )
    fit = model.fit(
        smoothing_level=alpha, smoothing_trend=beta, smoothing_seasonal=gamma, optimized=False
    )
    return {
        "series": [float(v) for v in y],
        "seasonLength": m,
        "mode": "multiplicative" if mode == "mul" else "additive",
        "alpha": alpha,
        "beta": beta,
        "gamma": gamma,
        "horizon": horizon,
        "expected": [float(v) for v in fit.forecast(horizon)],
        # One-step fitted values; the TS code defines fitted only from t = m
        # (the first season is consumed by initialisation), so the test compares
        # indices m..T-1.
        "fitted": [float(v) for v in fit.fittedvalues],
    }


# A 12-point period-4 seasonal series with trend and noise-free-ish variation.
HW_SERIES = [22, 34, 45, 29, 27, 39, 52, 33, 31, 45, 58, 39]

fixtures = {
    "_meta": {
        "generator": "fixtures/generate.py",
        "references": {
            "statsforecast": "2.x (CrostonClassic, CrostonSBA, TSB, SimpleExponentialSmoothing)",
            "statsmodels": "0.14 (Holt, ExponentialSmoothing; initialization_method='known')",
        },
    },
    "croston": [
        {"series": s, "alpha": 0.1, "expected": sf_point(CrostonClassic(), s)}
        for s in (INTERMITTENT_A, INTERMITTENT_B)
    ],
    "sba": [
        {"series": s, "alpha": 0.1, "expected": sf_point(CrostonSBA(), s)}
        for s in (INTERMITTENT_A, INTERMITTENT_B)
    ],
    "tsb": [
        {
            "series": s,
            "alphaDemand": ad,
            "alphaProbability": ap,
            "expected": sf_point(TSB(alpha_d=ad, alpha_p=ap), s),
        }
        for s in (INTERMITTENT_A, INTERMITTENT_B)
        for ad, ap in ((0.1, 0.1), (0.3, 0.2))
    ],
    "ses": [
        {
            "series": s,
            "alpha": a,
            "expected": sf_point(SimpleExponentialSmoothing(alpha=a), s),
        }
        for s, a in ((SMOOTH, 0.3), (TREND, 0.5))
    ],
    "holt": [
        holt_fixture(TREND, alpha=0.4, beta=0.3),
        holt_fixture(TREND, alpha=0.4, beta=0.3, phi=0.9),
    ],
    "holtWinters": [
        hw_fixture(HW_SERIES, 4, "add", 0.3, 0.1, 0.2, horizon=3),
        hw_fixture(HW_SERIES, 4, "mul", 0.3, 0.1, 0.2, horizon=3),
    ],
}

OUT.write_text(json.dumps(fixtures, indent=2) + "\n")
print(f"wrote {OUT}")


# --- @logistics-ts/planning: Wagner-Whitin DP-optimal lot sizing ------------

# (name, demand, setup/fixed cost, holding cost per unit per period)
WW_CASES = [
    # Snyder & Shen, Fundamentals of Supply Chain Theory 2e, Example 3.9.
    ("FoSCT 2e Example 3.9", [90, 120, 80, 70], 500, 2),
    # Intermittent demand: exercises zero-demand periods inside a covered run.
    ("intermittent demand with zero periods", [10, 0, 20, 5, 40, 0, 15], 100, 1),
    # Flat demand: exercises runs of equal size.
    ("flat demand", [50, 50, 50, 50, 50], 300, 2),
]


def ww_fixture(name, demand, setup_cost, holding_cost):
    """Runs stockpyl's WW DP and translates its 1-indexed output to our 0-indexed API."""
    quantities, cost, _theta, _s = wagner_whitin(
        len(demand), holding_cost, setup_cost, demand
    )
    # quantities is 1-indexed with a placeholder at element 0: period t (1-based)
    # maps to our period t-1 (0-based). Only positive orders are planned receipts.
    orders = [
        {"period": t - 1, "quantity": int(quantities[t])}
        for t in range(1, len(demand) + 1)
        if quantities[t] > 0
    ]
    return {
        "name": name,
        "demand": demand,
        "setupCost": setup_cost,
        "holdingCostPerUnitPerPeriod": holding_cost,
        "expected": {"orders": orders, "totalCost": float(cost)},
    }


lot_sizing_fixtures = {
    "wagnerWhitin": [ww_fixture(*case) for case in WW_CASES],
}

OUT_LOT_SIZING.write_text(json.dumps(lot_sizing_fixtures, indent=2) + "\n")
print(f"wrote {OUT_LOT_SIZING}")
