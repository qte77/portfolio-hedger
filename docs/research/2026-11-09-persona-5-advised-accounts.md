# Persona 5 live run, 2026-11-09

One live evaluation of [Persona 5, the Advised-Accounts Manager](personas.md#5-the-advised-accounts-manager-advisory-thin-grounding),
scored against the criteria committed before the run. The persona is **advisory**: its grounding is thin (two sources
that state a professional role, one time-boxed search, #21), so this result informs the backlog but does not decide
it.

## Run

- <https://portfolio-hedger.pages.dev> at `main` d3623af (#36), desktop 1280×900, one patchright Chromium session via
  polyfetch-scrape. Headless, not headed under `xvfb-run` as the run notes in `personas.md` say: our default here,
  since no local servers run on this machine.
- No script errors, failed requests or HTTP errors. The clipboard was blocked under automation; the page fell back
  to selecting the text, as designed.
- Book: example cleared; 400 AAPL, 300 MSFT and 100 TSLA shares; one long SPX 6300 put, 30 days; account cash
  $500,000.

## Results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Client-style book, cash needed and buying power | PASS | Cash account card and Dashboard tile agree: $302,501 needed, $197,499 left |
| 2 | Index hedge sized by a one-sentence rule | PASS | "Offset half the beta dollars with MES": the $328.3k tile gave a $164,000 target; the card proposed and booked 5 MES. Beta dollars fell to $158.3k and P&L at SPX −10% went from −$15.0k to +$2,049; both check by hand |
| 3 | Model basis, and a higher beta in a crash | PARTIAL | Pricing is clearly a model (Black–Scholes, worked example, QuantLib check). Beta is not called an estimate in one place: that it is an editable assumption only shows in the Market card caption and the "Not modelled" list. Raising AAPL's beta from 1.15 to 1.50 turned the hedged −10% result from +$2,049 to −$1,591, a $3,640 shortfall that checks by hand |
| 4 | Something to show the client | FAIL (not gated) | Nothing keeps the rule, the hedge and its outcome together. The ledger JSON has positions, history, quotes and cash only; the Booked hedges table has no target; the before/after numbers are gone once the hedge is booked |
| 5 | Drift since booking (hypothesis) | observed indirectly | After SPX fell 10%, beta dollars moved to −$192.8k and the beta card, still holding the $164,000 target, proposed buying 12 MES. Nothing labels this as drift from a rule |

**Gate (1, 2, 3): not passed in full**, two PASS and one PARTIAL. No app bugs: every figure checked by hand.

## What the persona said (paraphrased)

- The numbers reconcile by hand, which builds trust.
- "Target beta dollars" is the amount left over, not the amount to offset, so applying a "hedge half" rule means
  doing the subtraction yourself.
- After booking, the before/after table disappears and has to be found again on the Dashboard.
- Would use it to work out and sanity-check a hedge, not yet to produce something for the client's file.

## What it changes

- Evidence for the hedge-policy issue (plan 0002 row 7): a named sizing rule, kept with the hedge, and a client
  summary of rule, hedge and outcome (criterion 4), with drift from the rule shown (criterion 5).
- Criterion 3: the Method page could say once, plainly, that betas are inputs and estimates, and point to the Market
  card. Recorded in the same issue rather than built now.
