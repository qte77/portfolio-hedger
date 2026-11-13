# Plan 0002: Portfolio Hedger v2 (cash account, independent checks, ledger export)

## Status (read this first)

- **Arc goal:** answer requirements Q9 (how much cash the book needs) for a cash account, check the
  pricing engine against independent references, and give the ledger a lossless export and import. Then run the
  remaining persona and advisory items. Plan 0001 (v1) is closed; its open rows moved here.
- **Starting point (2026-11-09):** `main` at dd64e94 (#31). <https://portfolio-hedger.pages.dev> and the claude.ai artifact
  (v11) both served #31; the artifact version is bumped with each deploy (v12 after #33, v13 after #34, v14 after #35, v15 after #36, v16 after #41, v17 after #44, v18 after #48, v19 after #51, v20 after #54).
- **Shipped in this arc:** #32 (closed plan 0001, opened this plan); #3 cash account (row 1, #33; artifact v12); #7 A–C independent checks (rows 2–4, #34; artifact v13); #17 ledger export/import (row 5, #35; artifact v14); #36 import security fix (plain ticker symbols only,
  symbols escaped in the page; found by an automated security review of #35; artifact v15). Persona 5 card and live run (row 6, #39); hedge-policy issue #40 (row 7); #19 hedge sizing by % or premium budget (row 8, #41; artifact v16). From a second-opinion review: cash pairing for legs entered one at a time (row 14, #43), a sticky Instrument column on a phone (row 15, #44), a deploy guard and e2e in CI (rows 16–17, #45). The European-vs-American pricing decision on the Method page (row 19, #48). The Dashboard warns when futures margin is unset (row 21, #51). Persona results labelled as simulated (row 22, #52). Row 12 (a)–(c) in #54 (live and artifact v20). The public repository is <https://github.com/qte77/portfolio-hedger>, started from a cleaned copy of this tree (row 20, #55). Since 2026-11-13 the live site is <https://hedger.abizz.dev> (custom domain on the Pages project, added by the owner; #53).
- **Next:** every agent row has shipped. The open rows of the [remaining-work table](#remaining-work) are owner rows
  for one sitting (Phase B), each with a recommended default; row 23 is how the old pages.dev address is hidden.
- **Loop per item:** branch by topic → tests first for engine work (`tests/engine.test.mjs`) → `make validate` (the
  same gate as CI) → for UI changes `make build` + `make e2e`, then look at the screenshots → commit by topic → PR →
  squash-merge when CI is green → `make deploy` from `main` → republish the artifact from `public/` → strike the row
  in the same PR that ships it → delete the branch locally and remotely.
- **Owner gates:** listed as `owner` rows in the table. Decide-by-default: each carries a recommended default.
- **Commands:** `make` lists the targets: `vendor`, `lint`, `test`, `build`, `validate`, `dev`, `e2e`, `deploy`.
- **Watch-outs:**
  - Wrangler stays pinned at 4.40.0. The Pages token (`CLOUDFLARE_API_TOKEN` in `.env`, Pages · Edit) has no Workers
    scope, and newer wrangler hands `pages` commands to Workers.
  - Memory in the container is tight. Chromium sometimes crashes ("Target crashed"): rerun `make e2e` once before
    debugging. Send long command output to a file and read the tail.
  - CI also runs e2e on `dist/`, non-blocking for now. `make e2e` stays the gate on UI wiring, so run it for every UI change. No local servers: it
    serves the built `dist/` from disk by default (`make build` first), or checks `URL=https://hedger.abizz.dev`.
  - `public/index.html` is also the artifact source: a fragment with exactly one inline script and no `style=`.
  - The brand data colours have known clashes (qte77/qte77#152, #213). Charts also use sign, position and labels.
  - The persona findings files are gitignored in `../agentic-grounded-persona-eval/findings/` and exist only on this
    machine (`2026-11-02T021000Z-portfolio-hedger-findings.md`, `2026-11-02T130000Z-portfolio-hedger-icp2-findings.md`).
    Their public summaries, in our own words, are in `docs/research/` (row 9).

## Source map

| What | Where |
|---|---|
| Pricing and Greeks | `public/engine.js`: `bs` (Black–Scholes, A&S 26.2.17 normal CDF), `normCdf`, `normPdf`. Conventions in the file header: IV in vol points, vega per vol point, theta per calendar day, delta/gamma in share-equivalents |
| Positions and valuation | `engine.js`: `positionPnl`, `legMark`, `positionGreeks`, `portfolioGreeks`, `netPremium`, `scenarioPnl` |
| Combos and rolls | `engine.js`: `buildStrategy`, `TEMPLATES`, `applyNetPrice`, `rollLeg`, `rollCombo`, `comboRollups` |
| Hedges, scenarios, risk | `engine.js`: `deltaHedge`, `gammaHedge`, `betaHedge`, `stressTable`, `payoffCurve`, `surfaceGrid`, `simulate`, `maxHorizon`, `pnlPaths`, `riskStats`, `optimizeHedge` |
| Engine behaviour spec | `tests/engine.test.mjs` (`node --test`) |
| UI state | `public/app.js`: `state` = `{ market, positions, history, nextId, nextGid }` in `localStorage` key `portfolio-hedger:v1`; `freshState`, `addPositions` (assigns `id` and a `gid` per `group`), `load`, `commit` |
| UI views | `app.js`: `renderDashboard` (KPI tiles via `tiles`), `renderPositions` (ledger, combo subtotals, roll history, market card), `renderBuilder`, `renderHedge`, `renderRisk`, `renderSurface`, `renderOptimizer`; routing in `VIEWS` |
| Page and Method text | `public/index.html` (artifact fragment); Method page is `#view-method` |
| Build and CSP | `scripts/build.mjs` → `dist/` (wraps the page, hashes the inline script into `_headers`) |
| Headless UI check | `scripts/e2e.py` (polyfetch-scrape patchright Chromium; 3 viewports × 2 themes; interactions on desktop dark) |
| CI | `.github/workflows/ci.yml` (`make validate`; actions pinned to full SHAs) |
| Research | `docs/research/2026-11-02-persona-evaluation.md` (results), `docs/research/personas.md` (persona cards and pre-registered criteria) |
| Requirements | `docs/spec.md` (our own words; Q9 = cash requirement) |
| Issues | #3 cash-only accounting (rules in the 2026-11-02 comment), #7 independent benchmark, #17 export/import, #19 dollar hedge sizing, #21 research gap |
| Textbook reference for #7 A | Hull, *Options, Futures, and Other Derivatives*: the S=42, K=40, r=10%, σ=20%, T=0.5 example (call 4.76, put 0.81) |

## Approach notes

- **#3 cash account:** a cash account, not a margin model. Stock and long options are paid in full, short puts are
  cash-secured, short calls must be covered by shares, defined-risk spreads hold their maximum loss, futures margin is
  an editable assumption with no default figure, and short legs that are in the money or near expiry are listed with
  the cash or shares that assignment needs. The engine function is `cashRequirement(positions, market, settings)`.
- **#7 A–C:** A pins `bs` to the textbook example. B checks `bs` against an independent library (QuantLib) on a grid
  of cases, with the unit conventions converted explicitly (QuantLib vega per 1.0 vol and theta per year). C shows the
  textbook example step by step on the Method page, and a test fails if the page and the engine disagree. D (a broker
  platform such as thinkorswim) needs the owner's account.
- **#17 export/import:** JSON copied out and pasted back, lossless for strike, days, IV, entry, combo tags and roll
  history; no download needed, because downloads are blocked in the claude.ai artifact.

## Remaining work

The only list of open work in this plan. Strike a row in the PR that ships it.

| # | Item | Phase | Gate | Done when | State |
|---|---|---|---|---|---|
| 1 | ~~#3 cash-only accounting~~ | A | agent | engine `cashRequirement` built test-first (per-position and total cash used, collateral, flags, buying power left against an editable account cash figure); Dashboard tile; collateral per position in the ledger; every rule on the Method page | shipped: #33 (closes #3) |
| 2 | ~~#7 A: textbook test~~ | A | agent | an engine test reproduces Hull's S=42 example (call 4.76, put 0.81) within 0.005 | shipped: #34 |
| 3 | ~~#7 B: independent library cross-check~~ | A | agent | price and Greeks agree with QuantLib on a grid of calls and puts within a stated tolerance, checked in CI and in `make validate` | shipped: #34 (QuantLib 1.44, 288 cases) |
| 4 | ~~#7 C: worked example on the Method page~~ | A | agent | the textbook example shown step by step (d1, d2, N(d1), N(d2), prices), with a test that fails if the page and the engine disagree | shipped: #34 |
| 5 | ~~#17 ledger export/import~~ | A | agent | copy out as JSON and paste back in; lossless round trip (strike, days, IV, entry, combo tags, roll history); clear error on invalid input; works in the artifact | shipped: #35 (closes #17), hardened in #36 |
| 6 | ~~Professional persona "Advised-Accounts Manager"~~ | A | agent | a thin persona card with pre-registered criteria in `docs/research/personas.md`, grounded in the ICP2 findings, plus one live run recorded in `docs/research/` | shipped: #39 (gate 2 PASS, 1 PARTIAL; advisory) |
| 7 | ~~Hedge-policy band and client summary (advisory)~~ | A | agent | a GitHub issue opened from the ICP2 pattern (pre-set hedge sizing rules reported to clients), marked advisory: validate before building | shipped: #40 opened (advisory) |
| 8 | ~~#19 dollar or % hedge sizing (advisory)~~ | A | agent | per #19: delta and gamma cards accept a premium budget or a % of a holding; validated with a persona or user test before expanding | shipped: #41 (closes #19); validation before expanding stays advisory |
| 9 | ~~Findings backup~~ | B | owner | a generalized public record of both research runs in `docs/research/`, in our own words with every source linked (`2026-11-02-persona-evaluation.md`, `2026-11-02-icp2-professional-buyers.md`); verbatim quotes stay out of the repo, which will go public. A private copy of the raw files is optional and not tracked here | shipped: #47 |
| 10 | #7 D: broker-platform benchmark (optional) | B | owner | the example book rebuilt in thinkorswim (or similar); Greeks and beta dollars agree within a stated tolerance; result in `docs/` | deferred (owner, 2026-11-13) |
| 11 | Brand chart colours | B | owner | qte77/qte77#152 and #213 resolved upstream; `make vendor` re-run here | deferred (owner, 2026-11-11): both stay open upstream; out of the owner sitting; revisit when either closes |
| 12 | ~~Professional evidence~~, #21 and #40 (merged; was rows 12 and 13) | B | owner | no real advisers or traders are available, so: (a) check the engine against primary sources instead of personas (cash-account rules against Cboe and FINRA sources; the European-vs-American price gap for SPY and AAPL with QuantLib); (b) a feedback issue template and a link from the app; (c) from #40, only the one-line "betas are estimates" Method note. Owner 2026-11-13: do (a) to (c) | shipped: #54 did (a), (b)'s template and (c), #55 the in-app feedback link; `docs/research/2026-11-13-cash-rules-vs-cboe.md` (spreads off SPX need a margin account: fixed; two rules unverified; the manual itself not opened). |
| 14 | ~~Legs entered one at a time: cash pairing~~ | A | agent | a call spread entered as two legs never adds buying power (test); a leg can join an existing combo from Add option leg (e2e) | shipped: #43 |
| 15 | ~~Wider ledger with the Collateral column~~ | A | agent | no page overflow (e2e); on a phone the Instrument column stays in view while the ledger scrolls sideways | shipped: #44 |
| 16 | ~~`make deploy` re-runs validate~~ | A | agent | validate stays (the local tree is what ships); deploy also refuses a dirty tree or a `main` that differs from `origin/main` | shipped: #45 |
| 17 | ~~e2e not in CI~~ | A | agent | a CI job runs `make build e2e` on `dist/` with a pinned patchright, non-blocking until it proves stable | shipped: #45 |
| 18 | ~~Pre-public audit report~~ | A | agent | a report (no history rewrite) on the full git history and the issues: secrets and `.env`, verbatim external text, third-party material, names and handles; each finding with a proposed fix for the owner | shipped: #49. 2026-11-11, all 45 commits and every issue and PR: no secret values (`.env` never committed; `.env.example` has empty values; every author address is GitHub's noreply); no quoted external text; the vendored fonts carry their OFL licence. Owner items moved to row 20; the personas page no longer claims to name posters |
| 19 | ~~Pricing decision on the Method page~~ | A | agent | the European-vs-American decision, its reasons and its measured cost (QuantLib) on the Method page; "Not modelled" lists American exercise and dividends | shipped: #48 |
| 20 | ~~Before going public~~ | B | owner | owner 2026-11-13: a fresh public repository instead of publishing this one; nothing private in any file or in its history. The received description and v0 prototype are replaced by `docs/spec.md` in our own words; links to private repositories and to the private artifact, and the review agent's name, are removed; `LICENSE` is Apache-2.0 | shipped: #55; the public repository starts from this tree as one commit |
| 21 | ~~Dashboard warns when futures margin is unset~~ | A | agent | the "Cash needed" tile says when futures count as $0 because no initial margin is set, as the Positions card already does (`public/app.js` cash tile); e2e checks it. From the 2026-11-11 second-opinion review | shipped: #51 |
| 22 | ~~Persona results labelled as simulated~~ | A | agent | `docs/research/2026-11-02-persona-evaluation.md` no longer says real-book entry is "validated at decision grade"; "decision-grade" in `personas.md` reads as the strongest of our simulated personas, not user validation. Same review | shipped: #52 |
| 23 | Hide `portfolio-hedger.pages.dev` | B | owner | the project's pages.dev host answers with a 301 to <https://hedger.abizz.dev>: an account-level Bulk Redirect (source `portfolio-hedger.pages.dev`, status 301, preserve path and query, subpath matching, include subdomains, which also covers the per-deploy `<hash>.portfolio-hedger.pages.dev` URLs). Checked with `make e2e URL=https://portfolio-hedger.pages.dev`, which then lands on the custom domain. Default: do it. Current docs point at the custom domain; dated records keep the old address | open |
