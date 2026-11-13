# Professional buyers (ICP2): research summary, 2026-11-02

A summary, in our own words, of a time-boxed (about 30 minutes) search for what professional buyers say in public:
small portfolio managers, registered investment advisers (RIAs), prop traders and small funds who hedge equity beta
with index futures or puts. It was run with
[qte77/agentic-grounded-persona-eval](https://github.com/qte77/agentic-grounded-persona-eval) as an addendum to the
[first evaluation](2026-11-02-persona-evaluation.md), whose sources were mostly retail traders. The raw notes, with
verbatim quotes, stay outside this repo; they are not needed to follow or re-check anything below, because every
source is linked.

It produced [Persona 5](personas.md#5-the-advised-accounts-manager-advisory-thin-grounding) and its
[live run](2026-11-09-persona-5-advised-accounts.md).

## Sources

- **Reached:** quant.stackexchange.com (through the Stack Exchange API), a Kitces.com podcast transcript, a public
  comment letter on FINRA's site, and one Elite Trader thread (a retail voice, so not used).
- **Blocked:** Advisor Perspectives (a bot challenge) and Reddit (blocked on every tier, as in the first run).
- **Not reached in the time box:** Wilmott, QuantNet, ThinkAdvisor, Financial Planning. Hacker News searches found
  only individual traders.
- **Re-checked at source on 2026-11-09:** the FINRA comment and the podcast page's introduction. The
  quant.stackexchange threads could not be fetched again from here.

## Patterns

1. **Hedges are sized by a rule that clients are told about.** An adviser managing over $90 million of client assets
   describes a fixed rule for buying inverse funds, with a stop, that is explained to clients at the start and at
   each review ([FINRA Notice 22-08 comment](https://www.finra.org/rules-guidance/notices/22-08/comment/ned-hodder-comment-regulatory-notice-22-08)).
   An RIA overseeing $350 million lets each client choose a downside floor, which sets how much goes to Treasuries
   and how much to options ([Kitces, FA Success Ep 411](https://www.kitces.com/blog/larry-kriesmer-measured-risk-portfolios-equity-market-risk-options/), 2024).
   Two independent sources that state a professional role.
2. **Model Greeks are estimates, and beta changes in a crash.** The same RIA calls model deltas an educated guess,
   not a promise (podcast). A manager hedging a global equity book with index futures saw realised beta rise in the
   2020 crash, so the hedge fell short ([quant.stackexchange 53177](https://quant.stackexchange.com/questions/53177)).
   One stated professional, one plausible.
3. **What the account can carry is a real, often self-built problem.** A small trading firm needs value at risk for a book of
   futures and options ([77086](https://quant.stackexchange.com/questions/77086)); others look for strategy-based
   margin rules in code ([30530](https://quant.stackexchange.com/questions/30530)) or try to replicate exchange margin
   for E-mini options and futures ([44500](https://quant.stackexchange.com/questions/44500)). One stated
   professional, two plausible.
4. **A hedge drifts, and reloading it in a drawdown is expensive** (one speaker only, the podcast): an options sleeve
   grows as deltas rise, and options cost more after a fall.

## What it meant for the product

- Pattern 3 was a gap: nothing showed what the book needs in cash. The cash account (#3, shipped in #33) answers it
  for a cash account; margin accounts are still not modelled.
- Pattern 1 is the main open gap: a sizing rule kept with the hedge and shown to the client (#40, advisory).
- Pattern 2: the Method page discloses the pricing basis; it should also say that betas are inputs and estimates (#40).
- Pattern 4 stays a hypothesis.

## Verdict on the evidence

Enough for one advisory persona, not a decision-grade one: only Pattern 1 has two independent sources that state a
professional role, and the likeliest professional venues were not reached. #21 tracks the gap.
