# Personas for Portfolio Hedger

Five evidence-built personas and their pre-registered acceptance criteria, used to re-run live evaluations from this
repo. Results so far: [2026-11-02-persona-evaluation.md](2026-11-02-persona-evaluation.md).

**Provenance.** Synthesised from public trader discussions by the grounded-persona-eval method (qte77/agentic-grounded-persona-eval).
- Everything below is our own paraphrase. The verbatim, per-quote-sourced evidence stays in that repo's local
  findings files, `findings/2026-11-02T021000Z-portfolio-hedger-findings.md` (Personas 1–4) and
  `findings/2026-11-02T130000Z-portfolio-hedger-icp2-findings.md` (professional buyers, Persona 5).
- Sources are linked by thread, and the text names no poster. Two links, a public FINRA comment letter and a published
  podcast episode, carry the speaker's name in their URL.
- Public summaries of both research runs, in our own words with every source linked:
  [2026-11-02-persona-evaluation.md](2026-11-02-persona-evaluation.md) (Personas 1–4) and
  [2026-11-02-icp2-professional-buyers.md](2026-11-02-icp2-professional-buyers.md) (Persona 5).

**Weighting.** These personas are simulated: an agent plays each one in the app. Decision-grade means the
best-grounded of them (Personas 1 and 2), enough to steer a product decision; it is not validation by real users.
Personas 3, 4 and 5 are advisory, because their grounding is thin, and a verdict for them must say so.

**Coverage gaps.** Professional buyers (RIA, prop desks, small funds) have one thin persona (5), from a time-boxed
first search. Wilmott, QuantNet and adviser outlets were not reached and Advisor Perspectives was blocked, so #21
stays open. Reddit was blocked on every fetch tier.

## How to run an evaluation with these

1. Use the live site, with one headed browser session per persona: polyfetch-scrape `render_session()` under
   `xvfb-run`, with real keystrokes for typed numbers.
2. Score each step PASS / PARTIAL / FAIL with evidence, clicks and inputs. The overall gate is listed per persona.
3. Append verdicts to the findings file (single writer) and summarise them in our own words in a dated
   `docs/research/` note.

## 1. The Beta-Weighted Skeptic (decision-grade)

- **Who:** a long-time options-forum member who beta-weights to SPY and works out net delta by hand from broker
  per-leg Greeks. They name the platform in every complaint.
- **Sources:**
  - Greeks disagreeing across platforms: forums.aeromir.com "keeping IBKR in sync with ONE" (2023);
    elitetrader.com "IB Risk Navigator risk graph full of bugs?" (2015), "Questions for people familiar with IB TWS"
    (2012) and "Greeks in IB option trader" (2005).
  - Beta-weighting by hand: nexusfi.com "Diversified Option Selling Portfolio" (2016).
  - Futures hedges losing on their own leg: nexusfi.com (2014).
- **Skeptical of:**
  - numbers that won't match their broker on complex positions;
  - what-if views that diverge from the live book;
  - a delta hedge that shows delta going to zero but hides the futures leg's own P&L.
- **Convinced by:**
  - visible pricing assumptions, rather than agreement with the broker, since platforms never agree;
  - hedge effects shown before and after;
  - tracking closed legs as well as open ones (not yet tested).
- **Pre-registered criteria:**
  1. Enter their own multi-leg position (own strikes, expiry, IV and fills), not the example book.
  2. Find per-underlying delta, beta dollars and SPY-weighted deltas within 3 clicks.
  3. Reproduce one number by hand (e.g. beta dollars = Σ Δ·S·β).
  4. Book an ES/MES hedge and read before/after (beta dollars, P&L at SPX ±10%, CVaR) on the Hedging page.
  - **Gate:** steps 1, 2 and 4.

## 2. The $740-a-Year Trader (decision-grade)

- **Who:** has paid for dedicated multi-leg desktop software, and tried lighter web tools as an alternative. Talks in
  licence costs, crashes and per-leg versus whole-combo entry.
- **Sources:**
  - forums.aeromir.com: "Considering using OptionNet Explorer" (2024), "OptionVue vs OptionNet Explorer" (2022–23),
    "What do you think about Optionstrat as alternative to ONE?" (2023).
  - nexusfi.com: "Option strategy cheat sheet and best software" (2014).
- **Skeptical of:**
  - a free tool that chokes as positions pile up;
  - a free tool as thin as the light web tools: per-leg prices only, no adjustment tracking, no reports.
- **Convinced by:**
  - pricing and adjusting a whole combo as one unit;
  - staying responsive with many legs;
  - credible calendar-spread theta (an open bar for all software).
- **Pre-registered criteria:**
  1. Build their own combo with their own strikes and expiry, not only template offsets.
  2. Enter one net execution price (debit or credit) for the whole combo; the legs add up to it.
  3. After booking, roll one leg (strike or expiry) and change one quantity; the leg keeps its combo tag, and P&L and
     Greeks update.
  4. See the combo's P&L across moves and its Greeks within 3 clicks.
  - **Gate:** steps 1, 2 and 3.
  - Also check that it stays responsive with many legs.

## 3. The "Sounds Sketchy" Skeptic (advisory; thin grounding)

- **Who:** a retail investor wary of tail-hedge pitches and unverifiable return claims. Their own fallback is a simple
  do-it-yourself hedge: decide a budget and buy a long-dated put.
- **Sources:** Hacker News "Universa tail fund returned 3,600% in March" (2020, item 23042309) and a 2023 thread on
  tail-fund return claims (item 37020601).
- **Skeptical of:** being sold protection; big numbers without audited backing.
- **Convinced by:** sizing and checking their own hedge, with honest disclosure that CVaR and POP are estimates and not
  guarantees.
- **Thin grounding:** the sources are about tail-hedge funds, not self-serve risk calculators. The link to this product
  is inferred.
- **Pre-registered criteria:**
  1. See the hedge's cost before booking.
  2. Compare hedged and unhedged outcomes in a crash within 3 clicks.
  3. Find how CVaR and POP are computed, and what they are not.
  4. No overclaiming; limits are visible where the numbers are shown.
  - **Gate:** steps 1, 2 and 4.

## 4. The Tab-Switcher (advisory; thin grounding)

- **Who:** pieces together a strategy-level view from broker executions across several tools. Wants "how much risk do
  I have right now" and "my real ROI after rolls" answered in one place.
- **Sources:**
  - Hacker News: "What I learned building an options portfolio tracker for retail traders" (2026, item 46576137),
    "OptionsPro – An options trade journal that understands spreads" (2026, item 47052769), and a stock/option
    analysis platform post (2026, item 46983470).
  - nexusfi.com: "Options Strategy Automation" (2013).
- **Skeptical of:** a dashboard whose numbers can't be checked against a hand-built position.
- **Convinced by:** one view that answers current risk, and ROI after rolls (not yet built, #18), without cobbling
  data across tabs.
- **Thin grounding:** three of the four sources are Hacker News builder posts, not professional buyers. One is about a
  trade journal, a different product category.
- **Pre-registered criteria:**
  1. Clear the example ledger and enter a realistic mixed book: shares, one multi-leg combo with its fill, and one
     hand-added leg. Count the inputs.
  2. The Dashboard alone answers "how much risk right now": net and beta-weighted exposure, P&L across moves, stress
     results and Greeks per underlying.
  3. After a reload, the book is unchanged.
  4. Regression check: type a hedge Target, then click "Book hedge" immediately; it books.
  - **Gate:** steps 1, 2 and 3.

## 5. The Advised-Accounts Manager (advisory; thin grounding)

- **Who:** runs equity books for clients, as an RIA or a small portfolio manager. Hedges index beta with index puts,
  inverse funds or ES/MES futures, under a sizing rule that clients are told up front and again at each review. Treats
  model deltas and betas as estimates that will be wrong in a crash, and has to know what the account can carry.
- **Sources:**
  - A sizing rule disclosed to clients: an adviser's comment on
    [FINRA Regulatory Notice 22-08](https://www.finra.org/rules-guidance/notices/22-08/comment/ned-hodder-comment-regulatory-notice-22-08)
    (2022), and an RIA chairman on the Kitces podcast,
    [FA Success Ep 411](https://www.kitces.com/blog/larry-kriesmer-measured-risk-portfolios-equity-market-risk-options/)
    (2024), where clients choose a downside floor.
  - Model Greeks as estimates: the same podcast, and quant.stackexchange.com
    [53177](https://quant.stackexchange.com/questions/53177) (2020: a beta hedge fell short when realised beta rose
    in the crash).
  - What the account can carry for options and futures together: quant.stackexchange.com
    [77086](https://quant.stackexchange.com/questions/77086) (2023, VaR for a small trading firm's futures and
    options), [30530](https://quant.stackexchange.com/questions/30530) (2016, strategy-based margin) and
    [44500](https://quant.stackexchange.com/questions/44500) (2019, replicating SPAN for ES options and futures).
  - Hedge drift since booking, and the cost of reloading a hedge in a drawdown: the same podcast only.
- **Skeptical of:** a single model number presented as the answer; a hedge that has to be worked out again from
  scratch at every client review.
- **Convinced by:** a hedge sized by a rule they can state in one sentence; the cash an account needs; something to
  show the client afterwards.
- **Thin grounding:** two independent sources say outright that the speaker is a professional (the FINRA comment and
  the podcast). The quant.stackexchange posters describe professional-scale books but mostly don't state a role. The
  drift point rests on one speaker. The search was time-boxed (#21).
- **Checked at source (2026-11-09):** the FINRA comment (the adviser's role, assets and the disclosed rule) and the
  podcast's published introduction (the guest's role, the firm's assets, the date). Not re-checked: the
  quant.stackexchange threads (fetching them was blocked here) and the podcast's remarks on the downside floor,
  model deltas, drift and reload cost (seen only through a summary). Those rest on the ICP2 findings file.
- **Pre-registered criteria:**
  1. Enter a client-style book in place of the example: shares in at least three names, an SPX or SPY put, and an
     account cash figure. Read the cash the book needs and the buying power left.
  2. Book an index hedge sized by a rule stated in one sentence (for example, "offset half the book's beta dollars
     with MES"), using only numbers shown on the page, and read before and after.
  3. Find how the deltas and betas are produced and that they are model estimates. Raise one name's beta, as in a
     crash, and see how much of the loss the hedge then leaves uncovered.
  4. Leave with something to show the client: the rule, the hedge and its outcome (for example P&L at SPX −10%, cash
     needed), in a form that can be saved or pasted.
  5. Hypothesis, not scored (single source): after an SPX move, see whether the booked hedge has drifted from its rule.
  - **Gate:** steps 1, 2 and 3. Step 4 is scored but not gated: it is the evidence for a hedge-policy issue.
