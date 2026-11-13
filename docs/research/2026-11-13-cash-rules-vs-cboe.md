# Cash-account rules checked against exchange sources, 2026-11-13

Plan 0002 row 12(a): the cash-account rules in `cashRequirement` (`public/engine.js`) compared with what Cboe and FINRA
publish about cash accounts, in our own words.

**How it was checked, and its limit.** The Cboe Margin Manual PDF could not be opened from this machine, so each rule
was checked against the text of Cboe and FINRA pages as returned by a web search. A rule marked "agrees" is
consistent with those excerpts; it was not read against the full manual. Re-check against the manual itself before
relying on this for anything beyond education.

Sources:

- [Cboe Margin Manual (November 2021)](https://cdn.cboe.com/resources/membership/Margin_Manual.pdf), not opened here.
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
| A long leg that expires later than the short leg covers it | **unverified** | The excerpts describe spreads whose legs all expire together; whether a later-expiring long leg may cover a short in a cash account was not confirmed. The engine keeps its rule. |
| Short stock is not allowed | **unverified here** | A short sale belongs in a margin account under Regulation T, not in the options sources checked. |

What changed: one engine rule (spreads on underlyings other than SPX need a margin account), with its test, the
Positions note and the Method page's "Defined-risk spreads" item.
