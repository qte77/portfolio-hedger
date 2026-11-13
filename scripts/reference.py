"""Black-Scholes reference values from QuantLib, an independent library, for the engine cross-check (#7 B).

    uv run --no-project --with QuantLib==1.44 python scripts/reference.py tests/fixtures/quantlib-bs.json
    uv run --no-project --with QuantLib==1.44 python scripts/reference.py --check tests/fixtures/quantlib-bs.json

Writes (or, with --check, recomputes and compares) the fixture that tests/engine.test.mjs checks bs() against.
Units are converted to the engine's: vega per 1 vol point (QuantLib: per 1.00 of vol, so / 100) and theta per
calendar day (QuantLib: per year, so / 365). T = days / 365 (Actual/365 Fixed), continuous compounding, no dividends.
"""

import itertools
import json
import sys

import QuantLib as ql

TODAY = ql.Date(2, 11, 2026)
DC = ql.Actual365Fixed()


def reference(S: float, K: float, days: int, vol: float, r: float, right: str) -> dict:
    ql.Settings.instance().evaluationDate = TODAY
    payoff = ql.PlainVanillaPayoff(ql.Option.Call if right == "call" else ql.Option.Put, K)
    option = ql.VanillaOption(payoff, ql.EuropeanExercise(TODAY + days))
    process = ql.BlackScholesMertonProcess(
        ql.QuoteHandle(ql.SimpleQuote(S)),
        ql.YieldTermStructureHandle(ql.FlatForward(TODAY, 0.0, DC, ql.Continuous)),
        ql.YieldTermStructureHandle(ql.FlatForward(TODAY, r, DC, ql.Continuous)),
        ql.BlackVolTermStructureHandle(ql.BlackConstantVol(TODAY, ql.NullCalendar(), vol, DC)),
    )
    option.setPricingEngine(ql.AnalyticEuropeanEngine(process))
    return {
        "price": option.NPV(),
        "delta": option.delta(),
        "gamma": option.gamma(),
        "vega": option.vega() / 100,
        "theta": option.theta() / 365,
    }


def cases() -> list[dict]:
    out = []
    for S, m, days, vol, r, right in itertools.product(
        (42, 100, 680), (0.9, 1.0, 1.1), (7, 30, 182, 365), (0.16, 0.45), (0.04, 0.10), ("call", "put")
    ):
        args = {"S": S, "K": round(S * m, 2), "days": days, "vol": vol, "r": r, "right": right}
        out.append({**args, **{k: float(f"{v:.12g}") for k, v in reference(**args).items()}})
    return out


if __name__ == "__main__":
    data = {"source": f"QuantLib {ql.__version__} AnalyticEuropeanEngine", "cases": cases()}
    if sys.argv[1] == "--check":
        with open(sys.argv[2]) as fh:
            stored = json.load(fh)["cases"]
        bad = [
            (a, k)
            for a, b in zip(stored, data["cases"], strict=True)
            for k in ("price", "delta", "gamma", "vega", "theta")
            if abs(a[k] - b[k]) > 1e-9 * max(1.0, abs(b[k]))
        ]
        print(f"{len(stored)} cases, {len(bad)} differ from QuantLib {ql.__version__}")
        sys.exit(1 if bad else 0)
    with open(sys.argv[1], "w") as fh:
        json.dump(data, fh, indent=0)
        fh.write("\n")
