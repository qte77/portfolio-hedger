# Portfolio Hedger

A browser-based options portfolio risk lab. Build a book of stocks, ETFs, option strategies and index futures, and see
its Greeks, beta-dollar exposure and stress P&L. Book delta, gamma and SPX-beta hedges as real positions, and compare
CVaR, probability of profit and Sortino from a correlated Monte Carlo. A joint optimizer searches futures and option
hedges together. It runs entirely in the browser. The quotes are illustrative examples, not live data. It is an
educational tool, not investment advice.

- **Live:** <https://hedger.abizz.dev> (Cloudflare Pages project `portfolio-hedger`, custom domain; production
  branch `main`, production deployments only). The project's `portfolio-hedger.pages.dev` address serves the same
  site.
- **Requirements:** [`docs/spec.md`](docs/spec.md), in our own words; what
  was corrected: [plan 0001](docs/plans/2026-10-31-0001-portfolio-hedger-v1.md) (closed); what is open:
  [plan 0002](docs/plans/2026-11-09-0002-portfolio-hedger-v2.md)

## Views and URL switches

| URL | What it does |
|---|---|
| `#dashboard` (default) | KPIs (beta dollars, gamma per 1% move, vega, theta, option premium, P&L vs model, cash needed and buying power), P&L across SPX moves, stress table, Greeks by underlying |
| `#positions` | The one ledger (edit quantity, entry, and each option leg's strike, days and IV; a strike or days change is a roll that records realized P&L; per-combo subtotals with a whole-combo roll, and a roll history; remove; collateral per position), a cash account card (account cash, ES/MES margin, cash needed, buying power left, assignment exposure), export and import of the whole book as JSON text (copy, paste back; works in the artifact, where downloads are blocked), add stock/ETF, add a single option leg as filled, editable market quotes, risk-free rate and spot-vol |
| `#builder` | 13 strategy templates priced as individual legs; edit any strike, and enter one fill price for the whole combo; preview, breakevens and payoff |
| `#hedge` | Delta, gamma and SPX beta (ES / MES / SPY) hedges with before/after and CVaR, booked into the ledger. Delta hedges can also be sized as a % of the holding, gamma hedges by a premium budget |
| `#risk` | Monte Carlo POP, VaR/CVaR 95, Sortino and a P&L histogram (horizon, paths, seed) |
| `#surface` | Repricing heatmap: SPX move × IV shift or days forward, for P&L, beta dollars or gamma |
| `#optimizer` | Joint hedge search (futures + ATM options) with weights, limits and costs |
| `#method` | Formulas, assumptions and what is not modelled |
| `?theme=system\|light\|dark` | Force a colour theme; otherwise a stored choice, then dark (the brand default for dashboards) |

The ledger and quotes are kept in this browser's `localStorage` (`portfolio-hedger:v1`). The theme choice is stored as
`qte77-theme`, shared with other qte77 pages.

## Run, check and deploy

`make` lists every target. Wrangler and Biome are pinned and run through `npm exec`; nothing is installed into the repo.

| Target | What it does |
|---|---|
| `make vendor` | Copy the qte77 brand ui-kit, fonts and logo from `BRAND=../qte77/brand` into `public/vendor/` (source commit in `VENDOR.txt`) |
| `make lint` | Biome lint (recommended rules) on our JS |
| `make test` | Engine unit tests (`node --test`), including the textbook example, the QuantLib fixture and the Method page's worked example |
| `make crosscheck` | Recompute the QuantLib reference values (`uv`, `QuantLib==1.44`) and compare them with `tests/fixtures/quantlib-bs.json` |
| `make reference` | Regenerate that fixture after changing its cases (`scripts/reference.py`) |
| `make build` | `dist/`: wraps the artifact page in a full document, inlines the favicon, writes `_headers` with a strict CSP |
| `make validate` | `lint` + `test` + `crosscheck` + `build`, the same as CI (needs `uv`) |
| `make dev` | Serve `dist/` at `http://localhost:8788` (`PORT=`) with wrangler, `_headers` applied |
| `make e2e` | Headless check of a deployed `URL=`, or by default the built `dist/` served from disk through request interception (no local server; `make build` first): 3 viewports × 2 themes, clicks, screenshots to `SHOTS=`; fails on uncaught script errors (read from `<html data-js-error>`, since patchright's console capture misses page-script errors), failed requests, overflow |
| `make deploy` | `validate`, then deploy `dist/` to production `PROJECT.pages.dev`; refuses to run unless on a clean `main` that matches `origin/main` |

Wrangler is pinned to 4.40.0: newer releases hand `pages` commands to Workers, which needs a Workers-scoped token.
The Pages project `portfolio-hedger` already exists; a new one is created with
`wrangler pages project create <name> --production-branch=main` at the same version.

`make e2e` uses the patchright Chromium from [`qte77/polyfetch-scrape`](https://github.com/qte77/polyfetch-scrape)
(`POLYFETCH=../polyfetch-scrape`); install it once with
`uv run --directory ../polyfetch-scrape patchright install chromium`. Set `PLAYWRIGHT_BROWSERS_PATH` if the browsers
live elsewhere (for example under `/tmp` when the root disk is full).

### Environment

Copy [`.env.example`](.env.example) to `.env` (gitignored). Only `make deploy` reads it.

| Variable | Used by | Permission |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `wrangler pages deploy` | Account token: Account · Cloudflare Pages · Edit |
| `CLOUDFLARE_ACCOUNT_ID` | same | not a secret |

| Make variable | Default |
|---|---|
| `BRAND` | `../qte77/brand` |
| `PROJECT` | `portfolio-hedger` |
| `PORT` | `8788` |
| `URL` | `$(CURDIR)/dist` |
| `POLYFETCH` | `../polyfetch-scrape` |
| `SHOTS` | `./e2e-shots` |

## Layout

```text
public/            the app, and the claude.ai artifact source (index.html has no <html>/<head>)
  engine.js        pricing, Greeks, scenarios, Monte Carlo, hedges, optimizer (pure ES module)
  app.js, app.css  UI: state, hash routing, SVG charts
  vendor/          qte77 brand ui-kit, fonts, logo (make vendor; not edited here)
tests/             engine behaviour spec (node --test)
scripts/           build.mjs (Pages build + CSP), e2e.py (headless UI check)
docs/              requirements (spec.md), research/, plans/
```

Design: the qte77 EyeRest tokens (`brand/DESIGN.md`), default variant, dark and light. Charts never use colour alone for
gain and loss: they also use the sign, the position against the zero line and labels (see qte77/qte77#152 and #213).

Changes: [`CHANGELOG.md`](CHANGELOG.md).

## Licence

[Apache License 2.0](LICENSE).

Issue and PR numbers such as #33 in `docs/` and `CHANGELOG.md` refer to the earlier development repository, not to
this one.
