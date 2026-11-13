# Plan 0001: Portfolio Hedger v1 (correct + enhance the v0 prototype, publish, deploy)

## Status: closed 2026-11-09

- **Arc goal (achieved):** turn the v0 prototype (requirements: `docs/spec.md`) into a mathematically
  consistent, tested options risk and hedging app on the qte77 EyeRest brand, published as a claude.ai artifact and
  deployed to Cloudflare Pages at <https://portfolio-hedger.pages.dev>.
- **Shipped:** the initial import, #1, #2, #10, #11, #12, #15, #16, #22–#25, #27, #28, #30 and #31 (see the table
  below and [CHANGELOG.md](../../CHANGELOG.md)). At close, `main` was dd64e94 (#31); Pages and the claude.ai artifact (v11)
  both served it.
- **Open work moved to [plan 0002](2026-11-09-0002-portfolio-hedger-v2.md):** rows 8, 11, 15 and the open part of
  row 18. Start there; this plan is kept as the record of v1.

## Source map

| What | Where |
|---|---|
| Pricing, Greeks, scenarios, Monte Carlo, hedges, optimizer | `public/engine.js` (pure ES module): `bs`, `portfolioGreeks`, `scenarioPnl`, `simulate`, `pnlPaths`, `riskStats`, `deltaHedge`, `gammaHedge`, `betaHedge`, `optimizeHedge`, `stressTable`, `payoffCurve`, `surfaceGrid`, `buildStrategy`, `examplePortfolio` |
| Engine behaviour spec | `tests/engine.test.mjs` (`node --test`) |
| UI: state, routing (`#dashboard` … `#method`), charts | `public/app.js`, `public/app.css`, `public/index.html` (artifact fragment: no `<html>/<head>`) |
| Brand (vendored, not edited) | `public/vendor/` ← `make vendor` from `../qte77/brand` (`ui-kit/eyerest.css`, `fonts.css`, `layout.css`, `a11y.css`, `theme.js`, woff2 fonts, logo); source commit in `public/vendor/VENDOR.txt` |
| Pages build + CSP | `scripts/build.mjs` → `dist/` (wraps the page, writes `_headers` with a hash for the inline theme guard) |
| Headless check | `scripts/e2e.py` (polyfetch-scrape's patchright Chromium; console errors fail the run) |
| CI | `.github/workflows/ci.yml` (`make lint test build`) |
| Requirements | `docs/spec.md` |

## Corrections to v0 (what was wrong)

1. Duplicate `id="greeks"`. The Greeks view overwrote its own section, heading included.
2. `dte`/`iv` were globals overwritten by each new strategy, which repriced every leg. Each leg now keeps its own.
3. Premiums used the typed spot but Greeks and P&L used a fixed price table. One editable market table now feeds both.
4. The stock form's beta was stored and never used. Beta now comes from the market table.
5. ES/MES "hedges" were logged but never booked. They are now futures positions with 50× / 5× multipliers in P&L, delta and beta.
6. No vega or theta. Both are computed and aggregated now.
7. POP, CVaR and Sortino were taken over a uniform −40%…+40% grid, which is not a probability. They now come from a
   seeded one-factor Monte Carlo. Sortino is guarded when there are no losses (v0 divided by zero).
8. The surface was hard-coded to SPY at 680 with an arbitrary scale. It is now a full-book repricing heatmap.
9. The "optimizer" only clamped a delta hedge. It is now a joint search over futures and options on beta, gamma, vega, CVaR and cost.
10. The charts had no axes or labels, and the delta hedge on SPX bought index "shares". SPX now hedges with MES.

## Remaining work

| # | Item | Gate | Done when | State |
|---|---|---|---|---|
| 1 | ~~Engine + tests (BS, Greeks, futures, MC, hedges, optimizer)~~ | agent | `make test` green | shipped: initial import on `main` |
| 2 | ~~UI on EyeRest tokens, 8 views, charts with tooltips~~ | agent | e2e: no overflow, one view at a time, 3 viewports × 2 themes; screenshots reviewed | shipped: initial import |
| 3 | ~~Pages build + strict CSP `_headers`~~ | agent | `make build` emits `dist/` with `_headers`; page loads under that CSP | shipped: initial import |
| 4 | ~~claude.ai artifact~~ | agent | published and in sync with `main`; URL in README | shipped: republished with each release (v11 after #31) |
| 5 | ~~GitHub repo + PRs~~ | owner | repo exists; CI green; branches deleted | shipped: #1 |
| 6 | ~~Pages project~~ | owner (token) | project `portfolio-hedger` exists | shipped 2026-10-31 (wrangler 4.40.0; 4.156 delegates to Workers) |
| 7 | ~~Deploy `portfolio-hedger.pages.dev`~~ | agent | `make deploy` from `main`; `make e2e URL=https://portfolio-hedger.pages.dev` passes | shipped 2026-10-31: live, e2e green |
| 8 | Cash requirement, buying power, assignment exposure | agent | spec Q9 answered in UI with documented formulas | moved: plan 0002 (#3, re-scoped 2026-11-02 to a cash account, no margin model needed) |
| 9 | ~~Live quotes~~ | data | a provider + key chosen; quotes refresh without code edits | not planned: #4 closed 2026-11-02 (no live data; #17 export/import is the lighter entry path) |
| 10 | ~~IV dynamics in Monte Carlo~~ (spot-vol assumption; a by-strike skew stays out of scope) | agent | spot-vol param; tests for vol-shock P&L; Method page | shipped: closes #5 |
| 11 | Brand data-arc fixes adopted upstream | owner | qte77/qte77#152 / #213 resolved; re-run `make vendor` | moved: plan 0002 (owner, brand repo) |
| 12 | ~~GitHub issues for rows 8–10, 14–15~~ | agent | one issue per row, linked here | shipped: #3–#7 |
| 13 | ~~Adversarial review fixes~~ (risk-neutral MC drift, IV-consistent loading, optimizer weight clamp, gamma cap, ES granularity note, e2e script-error sentinel) | agent | 16 engine tests green; Method page states the assumptions | shipped: #2, deployed |
| 14 | ~~Persona evaluation (agentic-grounded-persona-eval, `config/target-portfolio-hedger.md`)~~ | agent | §Research passes `verify_sourcing.py`; §Personas; §Verdicts + cross-persona synthesis | shipped: 4 personas run; summary in docs/research; closes #6; follow-ups #17–#21 |
| 15 | Benchmark numbers against an independent tool | agent (A–C) / owner (D) | engine agrees with a textbook and an independent library within a stated tolerance | moved: plan 0002 (#7: A textbook test, B library cross-check, C worked example are agent work; D thinkorswim needs the owner's account) |
| 16 | ~~Second adversarial review~~ (horizon capped at nearest expiry, spot-vol disclosed as unpriced, optimizer objective label) | agent | 19 engine tests; Method page and captions state the limits | shipped: #11 (follow-up #12) |
| 17 | ~~Real-book entry and hedge-effect UX~~ (from personas 1–3 and an independent review) | agent | option-leg form; per-leg strike/days/IV; combo fill; SPY-weighted delta; P&L ±10% and premium on hedges | shipped: #15, #16; validated live by Persona 4 |
| 18 | Follow-ups from the persona evaluation | agent / owner | see issues #17–#21, #26, #29 | split: shipped #18 and #26 (#28), #20 (#27), #29 (#31); moved to plan 0002: #17, #19, #21 |
