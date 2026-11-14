# Changelog

All notable changes are listed here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

### Fixed (ledger flag label)

- The ledger showed "undefined" next to spreads on SPY, QQQ or single stocks: the flag added for spreads that need a margin account had no label. It now reads "needs margin account" (warning style), and an unlabelled flag falls back to its own name. e2e checks that the ledger never shows "undefined". Found while retaking the README screenshots.

### Changed (open source)

- README screenshots show each view in full (nothing cut off), Positions with every ledger column, and the Optimizer with a result; `scripts/screenshots.py` retakes them.
- README order: what, how, why, further reading, licence; seven screenshots of the live site in collapsible sections (`docs/screenshots/`), with how to retake them in `CONTRIBUTING.md`.
- README rewritten to be short: what the app does, why, how to use it, how to run it, further reading. Build, test, deploy and layout details moved to the new `CONTRIBUTING.md`.
- The project is public at <https://github.com/qte77/portfolio-hedger>, starting from this tree as one commit.
- Apache-2.0 `LICENSE`. `docs/spec.md` states the requirements in our own words; the received description and the v0 prototype are no longer in the repository. Links to private repositories and to the private artifact are gone.
- Method page: a link to open a feedback issue (template in `.github/ISSUE_TEMPLATE/`).

### Changed (cash account checked against exchange rules, row 12)

- Spreads on SPY, QQQ or single stocks are flagged as needing a margin account: exchange rules allow spreads in a cash account only when built from European-style, cash-settled index options (SPX here). They are still shown at their maximum loss. Engine test first (43 tests). The check, rule by rule, is in `docs/research/2026-11-13-cash-rules-vs-cboe.md`.
- Method page: the European-vs-American gap measured with the example SPY and AAPL quotes, and a line that betas are estimates that can rise in a crash.
- A feedback issue template (`.github/ISSUE_TEMPLATE/feedback.yml`).

### Changed (custom domain)

- The live site is <https://hedger.abizz.dev>, a custom domain on the same Cloudflare Pages project. `portfolio-hedger.pages.dev` and its per-deploy addresses redirect to it (301).

### Changed (persona results labelled as simulated)

- `docs/research/`: the personas are agent-simulated, and "decision-grade" means the best-grounded of them, not validation by real users. The persona-evaluation note no longer says real-book entry is "validated".

### Changed (code health)

- `cashRequirement` in `public/engine.js` is split into small helpers (entry cash, pairing with long legs, cover by shares or cash, max-loss cap, assignment), with no change in behaviour: the 42 engine tests pass unchanged. CodeFactor rated the single function too complex.

### Fixed (Dashboard, futures margin)

- The Dashboard's "Cash needed" tile says "futures margin not set, counted as $0" when the book holds futures and no initial margin is entered, as the Positions card already did. Before, the tile showed a cash need that left the futures out without saying so. e2e checks it.

### Added (pricing decision on the Method page)

- Method → "European, not American": why every option is priced as European with no dividends, and what that costs, measured with QuantLib (an American put is worth about 1% more at the money with 30 days left, about 8% more deep in the money with six months left; a 1.5% dividend yield moves a 30-day at-the-money price by about 3%). "Not modelled" lists American exercise and dividends.

### Changed (deploy guard, e2e in CI)

- `make deploy` also refuses to run from a dirty working tree or a `main` that differs from `origin/main` (new `deploy-check` target). It still runs `validate` first.
- CI has a second job that builds `dist/` and runs the headless UI check (`scripts/e2e.py`) with a pinned patchright Chromium. It is non-blocking while it proves stable; `make e2e` stays the local gate. `E2E_PY` sets the Python that runs the check.
- `e2e-shots/` is gitignored.

### Changed (ledger on a phone)

- The ledger scrolls sideways on a phone, as before; the Instrument column now stays in view while it does, so each row stays readable. Checked at 390 px: after a 400 px scroll the Instrument cells don't move and the Qty and Entry columns come into view.

### Fixed (cash account, legs entered one at a time)

- An uncovered short call, or short stock, no longer adds buying power: its premium does not count as cash. Before, a call spread entered as two separate legs read as cash in (on $100,000: buying power $100,300 instead of $99,300).
- Add option leg has a "Combo" choice: add the second leg of a spread to the first one's combo, so the cash account pairs them as one spread. Method page updated.
- Engine test first (42 tests pass); e2e checks that a leg joins an existing combo and that "New combo" starts one.

### Added (hedge sizing in dollars or %, #19)

- Hedging: the delta card takes "Or hedge % of the holding" (50 hedges half of the underlying's current delta), and the gamma card takes "Or premium budget ($)" (as many whole ATM contracts as the budget pays for at the model price). When filled in, either one replaces the Greek target, which greys out. A budget below one contract says so instead of proposing a trade.
- Engine: `deltaHedge(..., { pct })` and `gammaHedge(..., { budget })`, test first (41 tests pass). Method page: "Hedge sizing".
- e2e: a 50% delta hedge proposes a trade; a $1 budget buys nothing; a $5,000 budget's premium stays within $5,000.

### Added (ledger export/import, #17)

- Positions → "Export and import": "Copy ledger as JSON" puts the whole book (positions with strike, days, IV, entry and combo tags; roll history; quotes; cash settings) in a text box and on the clipboard. If the clipboard is blocked, as it can be in the claude.ai artifact, the text is selected for Ctrl+C. Pasting it back and pressing "Import from the box" twice replaces the book.
- Engine: `serializeLedger` and `parseLedger`, test first (39 tests pass). The round trip is lossless; two combos with the same tag stay two combos (ids are renumbered 1..n and the roll history moves with them); bad input says what is wrong and where (for example "Can't import position 2: strike must be a number above 0").
- e2e: a bad paste shows its error, and export → clear → import returns the same ledger and cash settings.
- Import accepts only plain ticker symbols in the quotes (capital letters, digits, "." or "-", up to 10) and requires SPX and SPY; a position's symbol must be one of the quotes' own keys. Symbols are also HTML-escaped wherever the page shows them. Found by an automated security review: a pasted ledger could otherwise put markup into the page.

### Added (independent checks, #7 A–C)

- A: an engine test reproduces Hull's textbook example (S=42, K=40, r=10%, σ=20%, T=0.5: d1 0.7693, d2 0.6278, call 4.76, put 0.81).
- B: `scripts/reference.py` computes price, delta, gamma, vega and theta with QuantLib 1.44 (an independent library) for 288 calls and puts, converted to the engine's units, into `tests/fixtures/quantlib-bs.json`. An engine test checks `bs()` against it (largest differences: price 1.3e-7 × S, delta 7.4e-8, from the normal CDF approximation), and `make crosscheck` (in `make validate` and CI, via `uv`) recomputes the fixture with QuantLib and compares.
- C: the Method page shows the textbook example step by step; a test fails if any number on the page differs from what the engine computes. `bs()` now also returns `d1` and `d2`.

### Added (cash account, #3)

- Cash account (requirements Q9: how much cash the book needs): `cashRequirement` in the engine, test first (33 tests pass). Stock and long options are paid in full; short puts are cash-secured; short calls are covered by a long call in the combo or by shares, else flagged "not allowed"; defined-risk combos hold at most their maximum loss at expiry (an iron condor holds one side); futures margin is an editable per-contract figure with no default; short stock is flagged.
- Dashboard tile "Cash needed" with buying power left against an editable account cash figure.
- Ledger column "Collateral" (hover for paid, received and cash needed), with flags. A Cash account card on Positions: account cash, ES/MES initial margin, totals, and assignment exposure (short legs in the money or within 7 days of expiry, with the cash or shares assignment needs).
- Method page: a "Cash account" section states every rule; margin accounts and early-exercise probability stay under "Not modelled".

### Changed

- `make e2e` serves the built `dist/` from disk by default (request interception with the `_headers` CSP; no local server), or checks a deployed `URL=`. It now expects 8 KPI tiles, checks the cash card, hovers the tallest histogram bin (an edge bin can be under a pixel high) and checks that a booked beta hedge leaves no Book button (the old "Already at the target" text check failed whenever a leftover under one contract was shown).

### Added (from the persona 2 re-run, #26 and #18)

- Per-combo subtotal rows in the ledger: net entry, net mark, P&L vs model, delta, and realized P&L from rolls (`comboRollups`).
- A roll records realized P&L: changing a leg's strike or days closes the old leg at its model mark (`rollLeg`), and the new leg opens at its model mark (edit Entry to your real fill). The trade is written to a roll history table under the ledger.
- Dashboard tile "P&L vs model": open plus realized from rolls. The parts are rounded before summing, so the total shown always equals the parts shown (the roll check found a $1 gap).
- Engine: `legMark`, `rollLeg`, `comboRollups`. Tests first; 23 pass.
- Whole-combo roll (#29): each combo's subtotal row has "Roll combo" (shift all strikes by N and/or set new days). Every leg is rolled and recorded in the roll history (`rollCombo`, test first; 24 pass).

### Added (from the persona evaluation and an independent review)

- Enter a real book: an "Add option leg" form (strike, days, IV, contracts, optional fill). Each option leg's strike, days and IV are editable in the ledger, so a roll keeps the leg's combo tag.
- Strategy builder: edit any leg's strike, and enter one fill price (credit or debit) for the whole combo. `applyNetPrice()` spreads it across the legs by their model prices. Test first.
- Dashboard: SPY-weighted deltas next to beta dollars.
- Hedging: each proposal shows P&L at SPX ±10% before and after, next to its Book button.

### Fixed

- The stress table's "Share of beta $" shows "—" when the book is nearly beta-flat, instead of hundreds of percent.
- Booking a hedge right after typing a Target or Days value did nothing: the card re-rendered on `change`, which fires on blur, and replaced the button under the click. The cards now update on `input`. Found by the persona 3 live evaluation.
- Each hedge proposal shows its option premium ("pay"/"receive") on one line before booking.
- The Dashboard tile "Net premium" is now "Option premium" with "paid at entry: a cost, not a return" (or "received at entry: not yet profit"), so it no longer reads like a return (Persona 4).
- Ledger columns read "Mark (model)" and "P&L vs model", and the caption says Mark is a model price, so a real fill that shows an instant paper gain or loss is explained (Persona 2 re-run).
- Persona 1 re-run polish: each ledger delta shows its unrounded value on hover, so a hand check can be exact. A hedge card already at its target keeps a disabled "Book hedge" button instead of collapsing. The leftover-beta note no longer recommends MES while MES is selected.

### Fixed (independent review)

- The Hedging view's before/after CVaR used a fixed 30-day horizon with no expiry cap, so a leg or gamma-hedge option under 30 days was valued after it expired. It now uses `maxHorizon` on the book with the hedge included, the same horizon for both sides, and the label shows the days.
- `optimizeHedge` caps its own horizon at the nearest expiry, the hedge option included, instead of relying on the caller. Test first.
- "Probability of profit" is labelled "POP (risk-neutral)". The Hedging page says its CVaR measures tail reduction, not whether the hedge leg itself makes money.

### Fixed (second adversarial review)

- The Risk and Optimizer horizons are capped at the nearest option expiry (`maxHorizon`). Before, a horizon past expiry valued expired legs on the later spot: a 10-day call evaluated at 60 days showed about 800× its mean P&L.
- Spot-vol is disclosed as unpriced. Entry prices don't include it, so mean P&L, POP and CVaR lean toward long-vega books once it is non-zero (long ATM straddle, 5 days, spot-vol −5: mean about +$172 instead of about $0). The Method page, Market card, risk caption and optimizer note now say so.
- The optimizer's objective row reads "lower is better" instead of claiming "1 = unhedged". The unhedged value is the sum of the active weights (2.75 with the defaults).

### Added

- Spot-vol assumption for the Monte Carlo and optimizer (#5). "IV change per 1% SPX move" in the Market card, stored as `market.spotVol` (default 0, IV fixed), shifts every option's IV with each path's market move. `simulate()` now also returns each path's market factor shock (`market`).

### Fixed (from an adversarial review of the engine and docs)

- Monte Carlo now drifts at the risk-free rate, the same measure Black–Scholes prices with. Before, the zero drift made a fairly priced long ATM call show about −$113 expected P&L per contract and a depressed POP.
- Simulated volatility matches each name's IV even when β × SPX IV exceeds it. The market loading is capped at IV ÷ SPX IV; before, SPY at IV 10 simulated at about 16%.
- `optimizeHedge` treats negative weights as zero. Before, a negative CVaR weight drove CVaR from about $37k to over $2M while the objective still "improved".
- The gamma hedge caps at 10,000 contracts and says so.
- When a whole ES/MES contract is coarser than the remaining beta-dollar gap, the beta hedge says so and points to MES or SPY. Before, it said "Already at the target".
- `make e2e` now catches uncaught page-script errors through `<html data-js-error>`. patchright's console capture only sees browser-generated errors, so the earlier "no console errors" result did not cover page scripts.
- Method page: states the risk-neutral drift, the loading cap, that the 1% gamma figure is a quadratic approximation, and that negative weights count as zero.

## [0.1.0] - 2026-10-31

### Added

- `public/engine.js`: Black–Scholes with delta, gamma, vega and theta. Each leg keeps its own expiry and IV. ES/MES futures are booked as positions with 50× / 5× multipliers. Also: beta dollars, gamma per 1% move, stress table, a seeded one-factor Monte Carlo (POP, VaR/CVaR 95, Sortino), delta/gamma/beta hedges and a joint futures + options hedge optimizer.
- `tests/engine.test.mjs`: 12 behaviour tests (textbook BS reference, finite-difference Greeks, hedges, Monte Carlo, optimizer).
- UI with 8 hash-routed views (`#dashboard` … `#method`) on the qte77 EyeRest tokens, with dark and light themes, `?theme=`, SVG charts with tooltips, and a ledger saved per browser.
- `Makefile` targets `vendor`, `lint`, `test`, `build`, `validate`, `dev`, `e2e`, `deploy` (production only, from `main`; wrangler pinned to 4.40.0); `.env.example` for the Cloudflare token.
- Live at <https://portfolio-hedger.pages.dev>.
- `scripts/build.mjs`: Pages build with a strict CSP (hash for the one inline script, no inline styles).
- `scripts/e2e.py`: headless check on 3 viewports × 2 themes. It fails on console errors, failed requests, overflow or a missing chart.
- CI (`.github/workflows/ci.yml`): lint, tests, build.
- Docs: `docs/spec.md` (requirements), plan `docs/plans/2026-10-31-0001-portfolio-hedger-v1.md`.

### Fixed (versus the v0 prototype)

- The Greeks view overwrote itself because of a duplicate `id="greeks"`.
- Global DTE/IV repriced every leg with the last strategy's inputs. Each leg now keeps its own.
- Greeks and P&L ignored the typed spot and the stock beta. One editable market table now feeds every calculation.
- ES/MES beta hedges were logged but never booked. They are now real futures positions.
- POP, CVaR and Sortino came from a uniform price grid. They now come from a probability-weighted Monte Carlo, and Sortino no longer divides by zero.
- The surface was hard-coded to SPY at 680. The "optimizer" only clamped a delta hedge. SPX delta hedges bought index "shares".
