# Contributing

How to build, test and deploy Portfolio Hedger. What the app is: [README.md](README.md). Rules for coding agents:
[AGENTS.md](AGENTS.md). Open work: the newest plan in [docs/plans/](docs/plans/).

## Workflow

1. Branch by topic; commits by topic (`feat`, `fix`, `test`, `docs`, `chore`).
2. Engine changes are test-first in `tests/engine.test.mjs`; UI wiring is covered by `make e2e`.
3. Before pushing: `make validate`. For UI changes also `make build` and `make e2e`, and look at the screenshots.
4. Open a PR; it is squash-merged once CI (validate, e2e, CodeFactor) passes.
5. Deploy from `main` after the merge: `make deploy`.

## Make targets

`make` lists every target. Wrangler and Biome are pinned and run through `npm exec`; nothing is installed into the repo.

| Target | What it does |
|---|---|
| `make vendor` | Copy the qte77 brand ui-kit, fonts and logo from `BRAND` into `public/vendor/` (source commit in `VENDOR.txt`) |
| `make lint` | Biome lint (recommended rules) on our JS |
| `make test` | Engine unit tests (`node --test`): the textbook example, the QuantLib fixture and the Method page's worked example |
| `make crosscheck` | Recompute the QuantLib reference values (`uv`, `QuantLib==1.44`) and compare them with `tests/fixtures/quantlib-bs.json` |
| `make reference` | Regenerate that fixture after changing its cases (`scripts/reference.py`) |
| `make build` | `dist/`: wraps the page in a full document, inlines the favicon, writes `_headers` with a strict CSP |
| `make validate` | `lint` + `test` + `crosscheck` + `build`, the same as CI |
| `make dev` | Serve `dist/` with wrangler at `http://localhost:$(PORT)`, `_headers` applied |
| `make e2e` | Headless check of a deployed `URL=`, or by default of `dist/` served from disk (no server): 3 viewports × 2 themes, clicks, screenshots to `SHOTS`; fails on script errors, failed requests and overflow |
| `make deploy` | `validate`, then deploy `dist/` to the Pages project `PROJECT`; refuses to run unless on a clean `main` that matches `origin/main` |

| Make variable | Default |
|---|---|
| `BRAND` | `../qte77/brand` |
| `PROJECT` | `portfolio-hedger` |
| `PORT` | `8788` |
| `URL` | `$(CURDIR)/dist` |
| `POLYFETCH` | `../polyfetch-scrape` |
| `SHOTS` | `./e2e-shots` |

`make e2e` uses the patchright Chromium from [qte77/polyfetch-scrape](https://github.com/qte77/polyfetch-scrape),
checked out next to this repo; install it once with `uv run --directory ../polyfetch-scrape patchright install
chromium`. Set `PLAYWRIGHT_BROWSERS_PATH` if the browsers live elsewhere.

## Deploy

Copy [`.env.example`](.env.example) to `.env` (gitignored). Only `make deploy` reads it.

| Variable | Permission |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Account token: Account · Cloudflare Pages · Edit |
| `CLOUDFLARE_ACCOUNT_ID` | not a secret |

Wrangler is pinned to 4.40.0: newer releases hand `pages` commands to Workers, which needs a Workers-scoped token.
Production is the Pages project `portfolio-hedger` behind the custom domain <https://hedger.abizz.dev>; its
`*.pages.dev` addresses redirect there (301).

## Layout

```text
public/            the app, and the claude.ai artifact source (index.html has no <html>/<head>)
  engine.js        pricing, Greeks, scenarios, Monte Carlo, hedges, optimizer, cash account (pure ES module)
  app.js, app.css  UI: state, hash routing, SVG charts
  vendor/          qte77 brand ui-kit, fonts, logo (make vendor; not edited here)
tests/             engine behaviour spec (node --test) and the QuantLib fixture
scripts/           build.mjs (build + CSP), e2e.py (headless UI check), reference.py (QuantLib)
docs/              spec.md (requirements), plans/, research/
```

- **State:** the ledger and quotes are kept in the browser's `localStorage` (`portfolio-hedger:v1`); the theme choice
  is `qte77-theme`, shared with other qte77 pages.
- **Design:** the qte77 EyeRest tokens, dark and light. Charts never use colour alone for gain and loss; they also
  use the sign, the position against the zero line and labels (see qte77/qte77#152 and #213).
- **History:** issue and PR numbers such as #33 in `docs/` and `CHANGELOG.md` refer to the earlier development
  repository, not to this one.
