# Persona evaluation, 2026-11-02

Summary in our own words of a grounded-persona evaluation of Portfolio Hedger, run with
[qte77/agentic-grounded-persona-eval](https://github.com/qte77/agentic-grounded-persona-eval). The raw evidence (verbatim
sourced quotes, persona cards, full verdicts) stays in that repo's local findings file,
`findings/2026-11-02T021000Z-portfolio-hedger-findings.md`. It is gitignored there, so it is not reproduced here; the
sources are linked below instead.

## Method

1. **Research:** public discussions where options traders talk about portfolio risk and tools. Six patterns came out,
   each backed by several independent sourced quotes, and `verify_sourcing.py` passed.
2. **Personas:** four personas built only from that evidence. Two are flagged as thinly grounded.
3. **Live evaluation:** one headed browser session per persona against https://portfolio-hedger.pages.dev. Pass/fail
   criteria were written before each run, and the persona's first task was its "shortest path to success".

Source coverage:
- **Worked:** the Hacker News API; the trader forums [forums.aeromir.com](https://forums.aeromir.com),
  [nexusfi.com](https://nexusfi.com) (via polyfetch) and [elitetrader.com](https://www.elitetrader.com).
- **Blocked on every tier:** Reddit.

## Research patterns (paraphrased)

1. Traders don't trust any single platform's Greeks. Broker risk tools (e.g. IBKR Risk Navigator) are described as
   buggy, and platforms disagree.
2. Net delta and beta-weighting are everyday vocabulary, but people compute them by hand.
3. Dedicated multi-leg desktop tools are expensive (around $650–740 a year) and reported to strain or crash with
   complex books.
4. Lighter web tools are easy to start with, but can't price or adjust a whole combo at once.
5. Retail investors see tail-risk hedging as out of reach or oversold.
6. Retail traders build or buy their own tracker because nothing models a multi-leg portfolio cleanly. These sources
   are skewed toward builders.

## Personas and results

Full persona definitions and their pre-registered criteria, for re-runs: [personas.md](personas.md).

The personas are simulated: an agent plays each one in the app. Personas 1 and 2 are decision-grade, the
best-grounded of them; Personas 3 and 4 are advisory because their grounding is thin. None of this is validation by
real users.

| Persona | First task | Build tested | Result |
|---|---|---|---|
| 1. Beta-Weighted Skeptic | Check net and beta-weighted exposure by hand, book an ES/MES hedge | #11 | Qualified yes. Exposure and the hand check pass. Entering their own position was not measured. |
| 2. $740-a-Year Trader | Build their own combo, enter one fill price for it, adjust a leg | #11 | **FAIL:** no per-leg strikes, no combo fill, a roll lost the combo tag. Very stable at 26 legs. |
| 3. "Sounds Sketchy" Skeptic | Size a hedge, sanity-check CVaR/POP | #12 | PARTIAL. Crash check, disclosures and no overclaiming pass; the hedge's cost was not shown before booking. Found the hedge-booking bug. |
| 4. Tab-Switcher | Enter a mixed real book, answer "how much risk right now" in one view | #15/#16 | **PASS:** entry, one view, persistence, and the booking regression check. ROI after rolls is unanswered. |

## What it changed

| Finding | Shipped |
|---|---|
| Users couldn't enter their own book (Personas 1–2, and an independent review) | #15: option-leg form; per-leg strike, days and IV; editable builder strikes; one fill price per combo |
| They think in SPY-weighted deltas (Persona 1) | #15: SPY-weighted deltas on the Dashboard |
| A hedge's effect and cost were a tab away (Personas 1 and 3) | #15/#16: P&L at SPX ±10% and the premium on every hedge proposal |
| Booking right after typing a target did nothing (Persona 3) | #16: hedge cards update on input |
| "Share of beta $" blew up near beta-flat (Persona 1) | #15: shows "—" |

## Re-runs on the current build (#20)

Both decision-grade personas were re-run with their original pre-registered criteria after #15, #16 and #23. Both now
pass their gates: entering a real book passes the checks of our two best-grounded simulated personas. Real users
have not tested it.

| Persona | First run | Re-run |
|---|---|---|
| 1. Beta-Weighted Skeptic | Qualified yes; entering their own position unmeasured, hedge effect a tab away | **PASS** on all 4 steps: own SPY shares and SPX spread entered leg by leg, exact hand check, MES hedge effects on the card |
| 2. $740-a-Year Trader | **FAIL**: no own strikes, no combo fill, a roll lost the tag | **PASS** (gate 1–3): asymmetric condor, a $1.85 credit spread across the legs, a roll and a quantity change keep the tag |

Re-run polish shipped: #24 (exact deltas on hover, steadier hedge card, hint copy) and the "Mark (model)" ledger label.
New: #26 (per-combo rollup).

## Follow-ups

- Shipped: #26 per-combo rollup and #18 realized P&L and roll history (both #28), #29 whole-combo roll (#31), the
  "Net premium" tile relabelled as a cost (#23), and #17 ledger export and import (Persona 4; independent review).
- Professional buyers (ICP2): a second, time-boxed search, summarised in
  [2026-11-02-icp2-professional-buyers.md](2026-11-02-icp2-professional-buyers.md).
- Persona 5 (Advised-Accounts Manager, advisory) added and run once on 2026-11-09:
  [2026-11-09-persona-5-advised-accounts.md](2026-11-09-persona-5-advised-accounts.md). Gate partly met (2 PASS, 1 PARTIAL).
- Open, tracked in [plan 0002](../plans/2026-11-09-0002-portfolio-hedger-v2.md): #19 dollar-based hedge sizing (Persona 3; advisory), #21 professional buyers and Reddit research
  gap.
