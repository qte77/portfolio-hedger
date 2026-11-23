# Plan 0005: Portfolio Hedger brand chart colours

## Status (read this first)

- **Arc goal:** take the brand's re-stepped chart colours into the app (plan 0004 row 6, unblocked when
  qte77/qte77#213 closed through qte77/qte77#239), retake the README screenshots, and keep the hedge-policy row
  deferred. Plan 0004 is closed; its deferred rows moved here.
- **Starting point (2026-11-23):** `main` at 5c0172f (#27). Live at <https://hedger.abizz.dev>, artifact copy at
  v24. `public/vendor/` is from qte77/qte77 `brand/` at 4744c23 (see `public/vendor/VENDOR.txt`). No open
  code-scanning, Dependabot or secret-scanning alerts.
- **Shipped before this arc:** plans 0001–0004 (see each plan's status); after 0004 closed: #24 `make dev` documented
  as an optional preview, #25 exact pins for wrangler and dotenv-cli, #26 docs-only PRs skip the `ci` workflow, #27
  ruff on `scripts/*.py`.
- **Next, in order:** row 1, then deploy and republish, then row 2 (it photographs the live site). Row 3 waits for
  its gate.
- **Loop per item:** [CONTRIBUTING.md](../../CONTRIBUTING.md#workflow). `make validate` before every push; `make e2e`
  for UI changes. After a merge that changes `public/`: `make deploy` from a clean `main`, check the live site with
  `URL=https://hedger.abizz.dev make e2e`, republish the artifact from `public/`. Strike the row in the PR that
  ships it.
- **Owner gates:** row 3. If the owner pauses the session, record the pause point here before stopping.
- **Watch-outs:**
  - Vendor from a checkout of qte77/qte77 at its `main` (pass `BRAND=<that checkout>/brand`). A local qte77
    checkout may sit on another branch, and `make vendor` copies whatever is checked out.
  - `VENDOR.txt` records the brand commit; check it names the commit you meant.
  - The brand change re-steps the `--data-*` colours only; the app reads them through CSS variables, so no app
    code should need to change. Look at gains, losses and warnings in both themes in the e2e screenshots.
  - A docs-only PR skips `ci` (validate, e2e): run `make validate` locally first. Row 2 is docs-only.
  - CodeFactor is the one required check. If its run hangs on an up-to-date branch, the owner re-runs it from
    CodeFactor; don't push empty commits to nudge it.

## Source map

The general map of the app, engine, scripts and CI is in
[plan 0004's source map](2026-11-22-0004-portfolio-hedger-maintenance.md#source-map). For this arc:

| What | Where |
|---|---|
| Vendoring | `Makefile` target `vendor` (copies `ui-kit/{eyerest,fonts,layout,a11y}.css`, `ui-kit/theme.js`, four fonts, the font licence and the logo from `$(BRAND)`; writes `public/vendor/VENDOR.txt`) |
| Brand change | qte77/qte77#239 (merge e5a72e24, 2026-11-22): `brand/ui-kit/eyerest.css` re-steps `--data-alt`, `--data-caution`, `--data-negative`, `--data-positive` in both schemes; contrast tested upstream in `tests/test_brand_contrast.py` |
| Where the app uses them | `public/app.css`: `.pos`/`.neg` text (:178-179), chart gain/loss fills (:207-208), legend swatches (:220-221), `.tag.warn` (:253), danger hover (:158); `public/app.js:328` picks `--data-positive`/`--data-negative` for a tone |
| UI check | `scripts/e2e.py` (3 viewports × 2 themes, screenshots to `e2e-shots/`) |
| README images | `scripts/screenshots.py` (dark theme, live site) → `assets/screenshots/`; how-to in [CONTRIBUTING.md](../../CONTRIBUTING.md#readme-screenshots) |
| Hedge policy | issue #5; `docs/research/2026-11-22-target-retail-traders.md` (why it stays advisory) |

## Remaining work

The only list of open work in this plan. Strike a row in the PR that ships it.

| # | Item | Gate | Done when | State |
|---|---|---|---|---|
| 1 | ~~Brand chart colours (plan 0004 row 6)~~ | agent | `make vendor` from qte77/qte77 `main`; `VENDOR.txt` names that commit; `make validate` and `make e2e` pass; gains, losses and warnings checked in both themes in the screenshots; then deployed, live e2e passes, artifact republished | shipped (#29); vendored from qte77/qte77 1cf2918 |
| 2 | README screenshots show the new colours | agent | after row 1 is live: `scripts/screenshots.py` retaken into `assets/screenshots/`, images looked at | open |
| 3 | Hedge policy (#5, advisory; plan 0004 row 7) | owner | validated first (a persona re-run against #5's criteria, or real adviser feedback); then the owner picks which parts to build | deferred (owner, 2026-11-22). Gate: a real request, e.g. through the feedback form; the target is retail traders (#21), so this stays advisory |
