# Portfolio Hedger

**See what your whole options book is exposed to, then hedge it and watch the risk change.**

[![CI](https://github.com/qte77/portfolio-hedger/actions/workflows/ci.yml/badge.svg)](https://github.com/qte77/portfolio-hedger/actions/workflows/ci.yml)
[![Licence: Apache-2.0](https://img.shields.io/badge/licence-Apache--2.0-blue.svg)](LICENSE)

**Try it: <https://hedger.abizz.dev>.** It runs entirely in your browser, with nothing to install and no account.
The quotes are editable examples, not live data. It is an educational tool, not investment advice.

## What it does

- **One ledger** for stocks, ETFs, single option legs, multi-leg strategies (13 templates) and ES/MES futures.
- **Whole-book risk:** Greeks, beta dollars, P&L across SPX moves, a stress table, a repricing surface, and Monte Carlo
  probability of profit, CVaR and Sortino.
- **Hedges that become positions:** delta, gamma and SPX-beta hedges (ES, MES or SPY) are booked into the ledger,
  with before/after shown first. A joint optimizer searches futures and option hedges together.
- **Cash account:** what the book needs in cash, buying power left, and assignment exposure.
- **Your data stays local:** the book lives in this browser's storage; export and import it as JSON.

## Why

A book of several strategies can look neutral leg by leg and still carry a large combined gamma, vega or market
exposure. Portfolio Hedger prices every leg, adds the exposures up across the whole book, and treats each hedge as a
real position, so every view shows its effect, side effects and cost. The method, assumptions and limits are on the
app's **Method** page.

## How to use it

1. Open <https://hedger.abizz.dev>; the example book loads.
2. **Positions:** select **Clear ledger** and enter your own stocks and option legs, or use **Strategy builder**
   templates.
3. **Dashboard:** read the book's exposures.
4. **Hedging:** size a delta, gamma or beta hedge, check the before/after, and book it.
5. **Risk**, **Surface** and **Optimizer:** stress the result.

Views are hash routes (`#dashboard`, `#positions`, `#builder`, `#hedge`, `#risk`, `#surface`, `#optimizer`, `#method`);
`?theme=light|dark|system` sets the theme.

## Run it locally

```sh
make validate   # lint, engine tests, QuantLib cross-check, build into dist/ (same as CI)
make e2e        # headless UI check of the built dist/
```

Needs Node and [`uv`](https://docs.astral.sh/uv/). Every target, variable and the deploy setup are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Further reading

- [CONTRIBUTING.md](CONTRIBUTING.md): build, test, deploy, layout, conventions.
- [docs/spec.md](docs/spec.md): the requirements.
- [docs/plans/](docs/plans/): what shipped and what is open.
- [docs/research/](docs/research/): persona evaluations and checks against primary sources.
- [CHANGELOG.md](CHANGELOG.md): changes.
- Feedback: [open an issue](https://github.com/qte77/portfolio-hedger/issues/new/choose).

## Licence

[Apache License 2.0](LICENSE).
