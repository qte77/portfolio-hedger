# Requirements

What Portfolio Hedger is meant to do, in our own words. The project started from a short application description and a
v0 prototype; neither is kept here. What has shipped against these requirements is tracked in [`plans/`](plans/).

## Goal

One browser page where a user builds a book of option strategies, stocks and ETFs, sees the book's combined risk, tries
hedges, and sees how each hedge changes that risk. Every position and every hedge lives in one shared ledger, so a hedge
is a real position that every view picks up, not a number shown on one chart.

## Modules

1. **Dashboard.** Net delta, gamma and beta dollars, plus counts of option legs and stock/ETF positions, for the whole
   book. Adding or removing a position updates it.
2. **Stocks and ETFs.** Symbol, shares, entry price and a beta estimate. The example universe: SPX; SPY and QQQ; AAPL,
   MSFT, NVDA; AMZN, TSLA; GOOGL, META.
3. **Strategy builder.** Templates that expand into their individual legs: long call or put; bull and bear call and put
   spreads; iron condor and iron butterfly; long and short strangle and straddle; call butterfly. Inputs: underlying,
   spot, strike width, contracts, days to expiry and implied volatility. Legs are priced with Black–Scholes.
4. **Greeks.** Delta, gamma, vega and theta summed over the book, because strategies that are each delta-neutral can
   still add up to large gamma or vega.
5. **Hedging.**
   - Delta: the shares needed to move delta to a target.
   - Gamma: the at-the-money contracts needed to move gamma to a target; the new options also change delta, vega and
     theta, so the whole book is re-measured afterwards.
   - Beta: offset beta dollars (the sum of delta × price × beta) with ES or MES futures or SPY shares. Futures need
     their multiplier, margin and basis risk accounted for.
6. **Payoff chart.** P&L of the whole book across underlying moves: maximum profit and loss, breakevens, and stock and
   options together.
7. **Risk surface.** P&L, delta or gamma over price against volatility or time, repriced at each point.
8. **Risk metrics.** For the whole book: probability of profit, CVaR at 95% (the average loss in the worst 5% of
   outcomes), Sortino ratio and tail scenarios.
9. **Hedge optimizer.** Hedge quantities that trade off delta, gamma, beta and CVaR, within cash, risk, position-limit
   and cost constraints.

## Questions the finished tool answers

For a mixed book (for example SPY and QQQ shares, an AAPL call spread, an NVDA iron condor, an SPX put spread and a short
QQQ strangle):

1. What is the net delta?
2. How much gamma risk is there?
3. How much of the risk is broad market exposure?
4. How many ES or MES contracts reduce the SPX beta exposure?
5. What happens to delta after the gamma hedge?
6. Does a hedge improve or worsen CVaR?
7. What is the probability of profit for the whole book?
8. What happens in a 5%, 10% or 20% market fall?
9. How much cash does the book need?
10. Which hedge mix gives the best balance of risk reduction and cost?

## Priorities after v0

Correct futures accounting in P&L, Greeks and beta; correlated Monte Carlo across the index, ETFs and single stocks; a
cash account (debits, credits, collateral, assignment exposure, buying power); a joint hedge optimizer; a repriced 3D
surface; and validation against independent pricing.
