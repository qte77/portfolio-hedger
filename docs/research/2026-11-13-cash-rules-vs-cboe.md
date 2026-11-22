# Cash-account rules checked against exchange sources, 2026-11-13

Plan 0002 row 12(a): the cash-account rules in `cashRequirement` (`public/engine.js`) compared with what Cboe and FINRA
publish about cash accounts, in our own words.

**How it was checked, and its limit.** On 2026-11-22 the Cboe Margin Manual PDF was fetched and read as text
(63 PDF pages; page numbers below are the manual's printed ones, which are the PDF page minus one). The first pass on
2026-11-13 could not open it and used Cboe and FINRA pages from a web search; the rows marked "agrees" below still rest
on those pages and on the manual's cash-account columns where cited. The copy read carries no edition date, so it may
differ from the November 2021 edition named in the link. This is an education-grade check by a non-lawyer, not
compliance advice. Broker rules can be stricter than the exchange's.

Sources:

- [Cboe Margin Manual (November 2021)](https://cdn.cboe.com/resources/membership/Margin_Manual.pdf), read in full on 2026-11-22 for the
  cash-account columns (spread table p. 9, short underlying tables pp. 6 and 12).
- [Cboe: strategy-based margin](https://www.cboe.com/us/options/strategy_based_margin), cash-account spreads.
- [FINRA Notice to Members 01-11](https://www.finra.org/rules-guidance/notices/01-11), the 2001 change that let
  certain spreads into the cash account.
- [SR-CBOE-2019-069](https://cdn.cboe.com/resources/regulation/rule_filings/approved/2019/SR-CBOE-2019-069.pdf), rule
  text on covered short options in a cash account.

| Rule in the engine | Result | Notes |
|---|---|---|
| Short put is cash-secured: strike × 100 per contract | agrees | A short put counts as covered in a cash account when the account holds cash (or equivalents) of at least the total exercise price, or an escrow agreement (SR-CBOE-2019-069). |
| Short call is covered by 100 shares of the underlying per contract | agrees | Holding the underlying is the first listed cover for a short call in a cash account (same filing). |
| A short call with no cover is not allowed | agrees | Only covered short options are eligible for the cash account. |
| A short leg covered by a long leg (a spread) may be held in the cash account | **differs, fixed** | Exchange rules let spreads into a cash account only when they are made of European-style, cash-settled index options (Cboe page; FINRA 01-11). Of the app's underlyings that is SPX only. Spreads on SPY, QQQ or single stocks now carry a `spread-margin-account` flag and a Positions note that they need a margin account; they are still shown at their maximum loss. Engine test first. |
| An eligible spread holds its maximum loss: width × 100 minus the net credit; a debit spread is paid in full | agrees | Cash covering the maximum risk less the net credit for a credit spread; the net debit paid in full for a debit spread (Cboe page). |
| An iron condor holds one side's width; a long butterfly only its debit | agrees, by the rule above | Follows from "maximum risk"; the excerpts name butterflies and boxes, not iron condors. |
| A long leg that expires later than the short leg covers it | **differs, fixed** | The manual's cash-account column for spreads (p. 9) allows only European-style, cash-settled index options "all of which expire at the same time"; its footnote 4 (p. 9) warns that in a calendar spread of European options the long cannot be exercised if the short is assigned. The margin-account spread conditions (p. 9) do let the short expire on or before the long, so a calendar or diagonal needs a margin account. The engine still pairs a later-expiring long with a short and shows its width as collateral, but now flags the spread `spread-margin-account`. Engine test first. |
| Short stock is not allowed | **agrees** | Regulation T 220.8(a) lists what a cash account may do: sales only of securities held or promised to be deposited, and covered options; short sales are in 220.12(c), which sets a 150% requirement for the margin account. The Cboe tables for options on a short underlying (pp. 6 and 12) say "Not permitted" in the cash-account column. The engine flags short stock `short-stock` and counts it as not allowed. |

What changed: two engine rules, each with its test: spreads on underlyings other than SPX need a margin account
(2026-11-13), and so do spreads whose long leg expires later than the short (2026-11-22).
