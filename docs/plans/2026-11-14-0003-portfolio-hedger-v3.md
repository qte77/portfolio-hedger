# Plan 0003: Portfolio Hedger v3 (public repository)

## Status (read this first)

- **Arc goal:** keep the public app correct and maintained, and settle what plan 0002 left open: two unverified
  cash-account rules, the deferred broker benchmark and brand colours, and the advisory hedge-policy and research
  items. Plan 0002 is closed; its open rows moved here.
- **Starting point (2026-11-14):** `main` at 48a549f (#7) in <https://github.com/qte77/portfolio-hedger>. Live at
  <https://hedger.abizz.dev> (Cloudflare Pages project `portfolio-hedger`; its `*.pages.dev` addresses redirect there
  with a 301). The claude.ai artifact copy is at v21.
- **Shipped in this arc:** #1 public import, #2 plan note, #6 pages.dev redirect recorded, #7 concise README and
  `CONTRIBUTING.md`; this plan opened in #8.
- **Next:** row 1 once the Cboe Margin Manual can be read (agent). Rows 2–5 are owner rows, each with a recommended
  default; row 5's default and, once validated, row 4 become agent work when the owner says go.
- **Loop per item:** see [CONTRIBUTING.md](../../CONTRIBUTING.md#workflow). After a merge that changes `public/`:
  `make deploy` from `main`, then republish the artifact from `public/`. Strike the row in the PR that ships it.
- **Parallel work (subagents in worktrees):**
  - Every agent row runs in its own git worktree with its own branch and PR (a subagent with worktree isolation, or
    `git worktree add ../portfolio-hedger-wt-<topic> -b <branch> main`). Never two rows in one checkout.
  - Rows touching different files can run at the same time. Row 1 touches `public/engine.js`, `tests/engine.test.mjs`
    and `docs/research/2026-11-13-cash-rules-vs-cboe.md`; row 5 only `docs/research/`; row 4 would touch
    `public/engine.js`, `public/app.js` and `public/index.html`, so it does not run alongside row 1.
  - Every PR also edits this plan's table and `CHANGELOG.md`: each PR strikes only its own row, and the PR merged
    second rebases on `main` first.
  - One subagent at a time runs `make e2e`: Chromium needs the memory. The main session merges, deploys once after
    the last `public/` change, and removes each worktree and branch after its merge.
- **Owner gates:** the `owner` rows in the table. Decide-by-default: each carries a recommended default.
- **Watch-outs:**
  - CodeFactor is a required check and fails on complex functions: keep functions small (`cashRequirement` was split
    into helpers for this).
  - Wrangler stays pinned at 4.40.0: the Pages token has no Workers scope, and newer wrangler hands `pages` commands
    to Workers.
  - Chromium sometimes crashes under memory pressure ("Target crashed"): rerun `make e2e` once before debugging.
  - `public/index.html` is also the artifact source: a fragment with exactly one inline script and no `style=`.
  - Issue and PR numbers in plans 0001 and 0002, the research notes and older CHANGELOG entries refer to the earlier
    development repository; numbers in this plan refer to this repository.

## Source map

| What | Where |
|---|---|
| Pricing and Greeks | `public/engine.js`: `bs` (Black–Scholes, A&S 26.2.17 normal CDF), `normCdf`, `normPdf`; unit conventions in the file header |
| Positions and valuation | `engine.js`: `positionPnl`, `legMark`, `positionGreeks`, `portfolioGreeks`, `netPremium`, `scenarioPnl` |
| Combos and rolls | `engine.js`: `buildStrategy`, `TEMPLATES`, `applyNetPrice`, `rollLeg`, `rollCombo`, `comboRollups` |
| Cash account | `engine.js`: `cashRequirement` and its helpers `entryCash`, `comboCollateral`, `pairWithLongs`, `coverAlone`, `capAtMaxLoss`, `assignmentExposure`; rules checked in `docs/research/2026-11-13-cash-rules-vs-cboe.md` |
| Hedges, scenarios, risk | `engine.js`: `deltaHedge`, `gammaHedge`, `betaHedge`, `stressTable`, `payoffCurve`, `surfaceGrid`, `simulate`, `pnlPaths`, `riskStats`, `optimizeHedge` |
| Engine behaviour spec | `tests/engine.test.mjs` (`node --test`); QuantLib fixture `tests/fixtures/quantlib-bs.json` |
| UI | `public/app.js` (state in `localStorage` `portfolio-hedger:v1`; `render*` per view; routing in `VIEWS`), `public/index.html` (Method page is `#view-method`) |
| Build, checks, CI | `scripts/build.mjs` (CSP), `scripts/e2e.py`, `scripts/reference.py`, `.github/workflows/ci.yml`; targets in [CONTRIBUTING.md](../../CONTRIBUTING.md) |
| Requirements and research | `docs/spec.md`; `docs/research/` (personas, persona runs, professional buyers, cash rules vs Cboe) |
| Issues | #3 broker benchmark, #4 research gap, #5 hedge policy (advisory) |

## Remaining work

The only list of open work in this plan. Strike a row in the PR that ships it.

| # | Item | Phase | Gate | Done when | State |
|---|---|---|---|---|---|
| 1 | Two unverified cash-account rules | A | data | the Cboe Margin Manual itself (not search excerpts) is read for whether a later-expiring long leg may cover a short in a cash account, and a Regulation T source for short stock; the note in `docs/research/2026-11-13-cash-rules-vs-cboe.md` is updated; if a rule differs, an engine test first, then the fix | open: the manual PDF could not be opened from the dev machine (moved from plan 0002 row 12) |
| 2 | Broker-platform benchmark (#3) | B | owner | the example book rebuilt in thinkorswim or similar; Greeks and beta dollars agree within a stated tolerance; result in `docs/` | deferred (owner, 2026-11-13; plan 0002 row 10). Default: time-box to 1 hour on SPX legs and beta-weighted delta, or drop |
| 3 | Brand chart colours | B | owner | qte77/qte77#152 and #213 resolved upstream; `make vendor` re-run here | deferred (owner, 2026-11-11; plan 0002 row 11): revisit when either closes |
| 4 | Hedge policy (#5, advisory) | B | owner | validated first (a persona re-run against #5's criteria, or real adviser feedback); then the owner picks which parts to build | open. Default: wait for a real signal through the feedback form |
| 5 | Research gap (#4) | B | owner | one option chosen and its result recorded in `docs/research/` | open. Default: narrow the target to retail traders and record the gap |
