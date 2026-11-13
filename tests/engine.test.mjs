// Behaviour spec for public/engine.js (node --test). Written before the engine (RED first).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  applyNetPrice,
  bs,
  buildStrategy,
  betaHedge,
  cashRequirement,
  comboRollups,
  legMark,
  positionGreeks,
  rollCombo,
  rollLeg,
  deltaHedge,
  examplePortfolio,
  gammaHedge,
  maxHorizon,
  netPremium,
  normCdf,
  parseLedger,
  serializeLedger,
  optimizeHedge,
  portfolioGreeks,
  riskStats,
  scenarioPnl,
  simulate,
  pnlPaths,
  defaultMarket,
} from "../public/engine.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);

test("Black-Scholes matches the textbook reference (S=K=100, r=4%, vol 20%, 1y)", () => {
  const c = bs({ S: 100, K: 100, T: 1, vol: 0.2, r: 0.04, right: "call" });
  near(c.price, 9.9251, 1e-3, "call price");
  near(c.delta, 0.6179, 1e-3, "call delta");
  const p = bs({ S: 100, K: 100, T: 1, vol: 0.2, r: 0.04, right: "put" });
  near(p.price, 9.9251 - 100 + 100 * Math.exp(-0.04), 1e-3, "put-call parity");
  near(p.delta, c.delta - 1, 1e-9, "put delta");
});

// ---------- independent checks (#7) ----------
test("#7 A: Black-Scholes reproduces Hull's textbook example (S=42, K=40, r=10%, vol 20%, T=0.5)", () => {
  const args = { S: 42, K: 40, T: 0.5, vol: 0.2, r: 0.1 };
  const c = bs({ ...args, right: "call" });
  near(c.d1, 0.7693, 5e-5, "d1");
  near(c.d2, 0.6278, 5e-5, "d2");
  near(c.price, 4.76, 0.005, "call");
  near(bs({ ...args, right: "put" }).price, 0.81, 0.005, "put");
});

test("#7 B: price and Greeks agree with QuantLib on 288 calls and puts (tests/fixtures/quantlib-bs.json)", () => {
  const { cases } = JSON.parse(readFileSync(new URL("./fixtures/quantlib-bs.json", import.meta.url)));
  assert.equal(cases.length, 288);
  // Reason: normCdf (A&S 26.2.17) is accurate to 7.5e-8, so price and delta can differ by about 1e-7 (price per $ of S);
  // gamma, vega and theta use the exact pdf. Measured maxima: price 1.3e-7 x S, delta 7.4e-8, gamma 4e-13.
  const tol = { price: (c) => 2e-7 * c.S, delta: () => 2e-7, gamma: () => 1e-10, vega: (c) => 1e-12 * c.S, theta: (c) => 1e-9 * c.S };
  for (const c of cases) {
    const g = bs({ S: c.S, K: c.K, T: c.days / 365, vol: c.vol, r: c.r, right: c.right });
    for (const k of Object.keys(tol)) near(g[k], c[k], tol[k](c), `${k} ${c.right} S=${c.S} K=${c.K} ${c.days}d vol=${c.vol} r=${c.r}`);
  }
});

test("#7 C: the worked example on the Method page shows what the engine computes", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const shown = [...html.matchAll(/data-check="([a-z]+)\.([a-zA-Z0-9]+)">([^<]+)</g)];
  assert.ok(shown.length >= 8, `found ${shown.length} checked values`);
  const args = { S: 42, K: 40, T: 0.5, vol: 0.2, r: 0.1 };
  const out = { call: bs({ ...args, right: "call" }), put: bs({ ...args, right: "put" }) };
  out.call.nd1 = normCdf(out.call.d1);
  out.call.nd2 = normCdf(out.call.d2);
  for (const [, side, key, text] of shown) {
    const decimals = (text.split(".")[1] ?? "").length;
    assert.equal(Number(text.replace("−", "-")).toFixed(decimals), out[side][key].toFixed(decimals), `${side}.${key}`);
  }
});

test("Greeks agree with finite differences", () => {
  const args = { S: 250, K: 260, T: 45 / 365, vol: 0.3, r: 0.04, right: "put" };
  const g = bs(args);
  const h = 0.01;
  near(g.gamma, (bs({ ...args, S: 250 + h }).delta - bs({ ...args, S: 250 - h }).delta) / (2 * h), 1e-4, "gamma");
  near(g.vega, (bs({ ...args, vol: 0.31 }).price - bs({ ...args, vol: 0.29 }).price) / 2, 1e-3, "vega per vol point");
  near(g.theta, bs({ ...args, T: 44 / 365 }).price - g.price, 2e-3, "theta per calendar day");
});

test("At expiry an option is worth its intrinsic value", () => {
  const c = bs({ S: 110, K: 100, T: 0, vol: 0.2, r: 0.04, right: "call" });
  assert.equal(c.price, 10);
  assert.equal(c.delta, 1);
  assert.equal(bs({ S: 90, K: 100, T: 0, vol: 0.2, r: 0.04, right: "call" }).price, 0);
});

test("Strategy templates build priced legs with ordered strikes", () => {
  const m = defaultMarket();
  const ic = buildStrategy("Iron condor", { sym: "NVDA", spot: 200, width: 10, qty: 2, days: 30, iv: 45, r: m.r });
  assert.equal(ic.length, 4);
  assert.deepEqual(ic.map((l) => l.strike), [180, 190, 210, 220]);
  assert.deepEqual(ic.map((l) => l.qty), [2, -2, -2, 2]);
  const net = ic.reduce((s, l) => s + l.qty * l.entry, 0);
  assert.ok(net < 0, "iron condor is a net credit");
  const straddle = buildStrategy("Long straddle", { sym: "SPY", spot: 680, width: 10, qty: 1, days: 30, iv: 16, r: m.r });
  assert.ok(straddle.reduce((s, l) => s + l.qty * l.entry, 0) > 0, "long straddle is a net debit");
  assert.ok(ic.every((l) => l.days === 30 && l.iv === 45), "each leg keeps its own DTE and IV");
});

test("A fresh portfolio shows zero P&L with no move and no time passed", () => {
  const m = defaultMarket();
  near(scenarioPnl(examplePortfolio(m), m, { move: 0, ivShift: 0, days: 0 }), 0, 1e-6);
});

test("Delta hedge books shares that bring the underlying's delta to the target", () => {
  const m = defaultMarket();
  const book = examplePortfolio(m);
  const trades = deltaHedge(book, m, "AAPL", 0);
  assert.equal(trades[0].kind, "equity");
  const after = portfolioGreeks([...book, ...trades], m).bySym.AAPL.delta;
  assert.ok(Math.abs(after) <= 0.5, `AAPL delta after hedge ${after}`);
  assert.deepEqual(deltaHedge([...book, ...trades], m, "AAPL", 0), [], "no trade once delta rounds to the target");
});

test("Delta hedge on the SPX index books MES futures, not index shares", () => {
  const m = defaultMarket();
  const book = examplePortfolio(m);
  const trades = deltaHedge(book, m, "SPX", 0);
  assert.equal(trades[0].kind, "future");
  assert.equal(trades[0].root, "MES");
  assert.ok(Math.abs(portfolioGreeks([...book, ...trades], m).bySym.SPX.delta) <= 2.5);
});

test("Beta hedge with ES books a real futures position that offsets beta dollars", () => {
  const m = defaultMarket();
  const book = examplePortfolio(m);
  const before = portfolioGreeks(book, m).betaDollars;
  const trades = betaHedge(book, m, "ES", 0);
  assert.equal(trades[0].kind, "future");
  assert.equal(trades[0].root, "ES");
  const after = portfolioGreeks([...book, ...trades], m).betaDollars;
  assert.ok(Math.abs(after) <= (50 * m.quotes.SPX.spot) / 2 + 1, `beta dollars after ${after}`);
  assert.ok(Math.abs(after) < Math.abs(before));
  // a 1-point SPX rise pays qty x 50 on the futures leg
  const fut = { ...trades[0], qty: 1 };
  const m2 = structuredClone(m);
  m2.quotes.SPX.spot += 1;
  near(scenarioPnl([fut], m2, { move: 0, ivShift: 0, days: 0 }), 50, 1e-9);
});

test("Gamma hedge adds one ATM option position and shrinks gamma", () => {
  const m = defaultMarket();
  const book = examplePortfolio(m);
  const g0 = portfolioGreeks(book, m).bySym.QQQ.gamma;
  const trades = gammaHedge(book, m, "QQQ", { target: 0, days: 30, right: "call" });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].kind, "option");
  const g1 = portfolioGreeks([...book, ...trades], m).bySym.QQQ.gamma;
  assert.ok(Math.abs(g1) < Math.abs(g0), `gamma ${g0} -> ${g1}`);
});

test("#19: delta hedge sized as a % of the holding hedges that share of its delta", () => {
  const m = defaultMarket();
  const book = [{ kind: "equity", sym: "AAPL", qty: 1000, entry: m.quotes.AAPL.spot }];
  const half = deltaHedge(book, m, "AAPL", 0, { pct: 50 });
  assert.deepEqual([half[0].kind, half[0].qty], ["equity", -500]);
  assert.deepEqual(deltaHedge(book, m, "AAPL", 0, { pct: 0 }), [], "0% hedges nothing");
  assert.equal(deltaHedge(book, m, "AAPL", 0, { pct: 100 })[0].qty, -1000, "100% brings delta to zero");
  assert.equal(deltaHedge(book, m, "AAPL", 250, { pct: 50 })[0].qty, -500, "the % wins over the target");
});

test("#19: gamma hedge sized by a premium budget buys the whole contracts it affords, at most the budget", () => {
  const m = defaultMarket();
  const book = examplePortfolio(m);
  const one = gammaHedge([], m, "QQQ", { target: 1e6, days: 30, right: "put" })[0].entry * 100;
  const trades = gammaHedge(book, m, "QQQ", { budget: 3.5 * one, days: 30, right: "put" });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].qty, 3, "floor(budget / cost of one contract)");
  assert.ok(netPremium(trades) <= 3.5 * one);
  assert.deepEqual(gammaHedge(book, m, "QQQ", { budget: one / 2, days: 30, right: "put" }), [], "below one contract: no trade");
  assert.equal(gammaHedge(book, m, "QQQ", { budget: 1e12, days: 30 })[0].capped, true, "a huge budget is capped too");
});

test("Risk stats: CVaR >= VaR, POP and a guarded Sortino", () => {
  const pnl = Float64Array.from({ length: 100 }, (_, i) => i - 20); // -20..79
  const s = riskStats(pnl);
  near(s.pop, 0.79, 1e-9, "POP");
  assert.ok(s.cvar95 >= s.var95, "CVaR >= VaR");
  near(s.cvar95, 18, 1e-9, "mean loss of the worst 5");
  assert.equal(riskStats(Float64Array.from([1, 2, 3])).sortino, Number.POSITIVE_INFINITY);
});

test("Monte Carlo is reproducible, beta-1 names co-move, and drifts at the risk-free rate", () => {
  const m = defaultMarket();
  const a = simulate(m, { paths: 4000, days: 30, seed: 7 });
  const b = simulate(m, { paths: 4000, days: 30, seed: 7 });
  assert.deepEqual(a.spots.SPY.slice(0, 5), b.spots.SPY.slice(0, 5));
  const rs = (s) => a.spots[s].map((x) => Math.log(x / m.quotes[s].spot));
  const x = rs("SPX");
  const y = rs("SPY");
  for (let i = 0; i < 20; i++) near(x[i], y[i], 1e-9, "SPX and SPY share the market factor");
  // SPY (16 vol): the standard error of the mean ratio is ~0.0007, so 0.0015 separates e^{rT} = 1.0033 from 1.
  const meanSpot = a.spots.SPY.reduce((s, v) => s + v, 0) / a.paths;
  near(meanSpot / m.quotes.SPY.spot, Math.exp((m.r * 30) / 365), 0.0015, "risk-neutral mean");
});

test("A fairly priced option has no expected Monte Carlo P&L at its expiry (same measure as pricing)", () => {
  const m = defaultMarket();
  const call = buildStrategy("Long call", { sym: "SPY", spot: 680, width: 10, qty: 1, days: 30, iv: 16, r: m.r });
  const pnl = pnlPaths(call, m, simulate(m, { paths: 60000, days: 30, seed: 5 }), 30);
  const s = riskStats(pnl);
  const sd = Math.sqrt(pnl.reduce((t, v) => t + (v - s.mean) ** 2, 0) / pnl.length);
  assert.ok(Math.abs(s.mean) < (4 * sd) / Math.sqrt(pnl.length), `mean P&L ${s.mean} is not ~0`);
});

test("Simulated volatility matches the IV even when beta x market vol exceeds it", () => {
  const m = defaultMarket();
  m.quotes.SPY.iv = 10; // beta 1 x SPX IV 16 > 10
  const sim = simulate(m, { paths: 40000, days: 30, seed: 3 });
  const r = Array.from(sim.spots.SPY, (v) => Math.log(v / 680));
  const mu = r.reduce((t, v) => t + v, 0) / r.length;
  const vol = Math.sqrt(r.reduce((t, v) => t + (v - mu) ** 2, 0) / r.length / (30 / 365));
  near(vol, 0.1, 0.004, "annualised simulated vol");
});

test("Spot-vol: with IV rising as SPX falls, a down move helps long vega and hurts short vega", () => {
  const m = defaultMarket();
  const legs = (name) => buildStrategy(name, { sym: "SPY", spot: 680, width: 10, qty: 1, days: 30, iv: 16, r: m.r });
  // One hand-built path: SPX and SPY 5% lower after 5 days.
  const sim = { paths: 1, days: 5, spots: { SPY: Float64Array.of(646), SPX: Float64Array.of(6460) }, market: Float64Array.of(Math.log(0.95)) };
  const pnl = (book, spotVol) => pnlPaths(book, { ...m, spotVol }, sim)[0];
  assert.ok(pnl(legs("Long straddle"), -1) > pnl(legs("Long straddle"), 0), "long vega gains from the vol rise");
  assert.ok(pnl(legs("Short straddle"), -1) < pnl(legs("Short straddle"), 0), "short vega loses from the vol rise");
});

test("Spot-vol of zero leaves the simulation unchanged and the market factor is exposed", () => {
  const m = defaultMarket();
  const a = simulate(m, { paths: 500, days: 30, seed: 9 });
  const b = simulate({ ...m, spotVol: 0 }, { paths: 500, days: 30, seed: 9 });
  assert.deepEqual(a.spots.NVDA, b.spots.NVDA);
  assert.equal(a.market.length, 500);
  for (let i = 0; i < 5; i++) near(Math.log(a.spots.SPX[i] / 6800), a.market[i] + ((m.r - 0.5 * 0.16 ** 2) * 30) / 365, 1e-9, "SPX = market factor + drift");
});

test("Risk horizon is capped at the nearest option expiry (expired legs can't be repriced on later spots)", () => {
  const m = defaultMarket();
  const book = examplePortfolio(m); // option legs expire in 30 days
  assert.equal(maxHorizon(book, 60), 30);
  assert.equal(maxHorizon(book, 10), 10);
  assert.equal(maxHorizon([{ kind: "equity", sym: "SPY", qty: 1, entry: 680 }], 90), 90, "no options, no cap");
  assert.equal(maxHorizon(book, 0), 1, "at least one day");
});

test("Optimizer caps its own horizon at the nearest expiry, including its hedge option", () => {
  const m = defaultMarket();
  const r = optimizeHedge(examplePortfolio(m), m, { paths: 300, days: 60, optDays: 20 });
  assert.equal(r.options.days, 20);
});

test("Net combo price: one price for the whole combo is spread across the legs", () => {
  const m = defaultMarket();
  const ic = buildStrategy("Iron condor", { sym: "NVDA", spot: 200, width: 10, qty: 2, days: 30, iv: 45, r: m.r });
  const filled = applyNetPrice(ic, -1.8, 2); // 1.80 credit per condor, 2 condors
  near(filled.reduce((s, l) => s + l.qty * l.entry, 0), -3.6, 1e-9, "legs sum to the combo price x contracts");
  assert.ok(filled.every((l, i) => l.entry > 0 && l.strike === ic[i].strike), "entries stay positive, strikes unchanged");
  assert.throws(() => applyNetPrice(ic, 1.8, 2), /credit/, "a debit for a credit structure is rejected");
});

test("Rolling a leg realizes its P&L at the model mark and opens the new leg at the model mark", () => {
  const m = defaultMarket();
  const [leg] = buildStrategy("Long put", { sym: "SPY", spot: 680, width: 10, qty: 3, days: 30, iv: 16, r: m.r });
  const old = { ...leg, entry: leg.entry - 2, gid: 7, group: "Long put SPY" }; // bought 2.00 cheaper than model
  const { leg: next, record } = rollLeg(old, { strike: 670, days: 60 }, m, "2026-11-02");
  near(record.realized, 3 * 100 * 2, 1e-9, "realized = qty x 100 x (old mark - entry)");
  assert.equal(next.strike, 670);
  assert.equal(next.days, 60);
  assert.equal(next.gid, 7, "keeps the combo");
  near(next.entry, legMark(next, m), 1e-12, "new leg opens at its model mark");
  assert.deepEqual([record.gid, record.from.strike, record.to.strike, record.at], [7, 680, 670, "2026-11-02"]);
});

test("Combo rollups sum their legs and add realized P&L from roll history", () => {
  const m = defaultMarket();
  const legs = buildStrategy("Iron condor", { sym: "NVDA", spot: 200, width: 10, qty: 2, days: 30, iv: 45, r: m.r }).map((l) => ({ ...l, gid: 3, group: "Iron condor NVDA" }));
  const book = [{ kind: "equity", sym: "SPY", qty: 10, entry: 670, gid: 1 }, ...legs];
  const [eq, ic] = comboRollups(book, m, [{ gid: 3, realized: 125 }, { gid: 3, realized: -25 }]);
  assert.equal(eq.legs, 1);
  near(eq.unrealized, 10 * (680 - 670), 1e-9, "stock P&L");
  assert.equal(ic.legs, 4);
  near(ic.realized, 100, 1e-9, "sum of roll records for the combo");
  near(ic.netEntry, legs.reduce((s, l) => s + l.qty * 100 * l.entry, 0), 1e-9, "net entry in dollars");
  near(ic.delta, legs.reduce((s, l) => s + positionGreeks(l, m).delta, 0), 1e-9, "delta sums the legs");
});

test("Whole-combo roll shifts every option leg of one combo and records each leg", () => {
  const m = defaultMarket();
  const ic = buildStrategy("Iron condor", { sym: "SPY", spot: 680, width: 10, qty: 1, days: 30, iv: 16, r: m.r }).map((l, i) => ({ ...l, id: i + 1, gid: 5, group: "Iron condor SPY" }));
  const other = { kind: "equity", sym: "QQQ", qty: 10, entry: 620, id: 9, gid: 6 };
  const { positions, records } = rollCombo([...ic, other], 5, { strikeShift: 10, days: 45 }, m, "2026-11-02");
  const rolled = positions.filter((p) => p.gid === 5);
  assert.deepEqual(rolled.map((l) => l.strike), ic.map((l) => l.strike + 10), "every strike shifted by 10");
  assert.ok(rolled.every((l) => l.days === 45 && l.group === "Iron condor SPY"), "new expiry, same combo");
  assert.equal(records.length, 4, "one history record per leg");
  near(records.reduce((s, r) => s + r.realized, 0), ic.reduce((s, l) => s + l.qty * 100 * (legMark(l, m) - l.entry), 0), 1e-9, "realized sums the legs");
  assert.deepEqual(positions.find((p) => p.gid === 6), other, "other combos untouched");
  assert.deepEqual(rollCombo([...ic], 5, { strikeShift: 0 }, m).records, [], "no change, no records");
});

// ---------- cash account (#3) ----------
const opt = (sym, right, strike, qty, entry, extra = {}) => ({ kind: "option", sym, right, strike, qty, days: 30, iv: 20, entry, ...extra });
/** Lowest P&L at expiry of a one-expiry option combo, premium included: the structure's maximum loss when negated. */
const expiryMin = (legs) => {
  const pts = [0, ...legs.map((l) => l.strike)];
  const pay = (S) => legs.reduce((t, l) => t + l.qty * 100 * ((l.right === "call" ? Math.max(0, S - l.strike) : Math.max(0, l.strike - S)) - l.entry), 0);
  return Math.min(...pts.map(pay));
};

test("Cash account: a position that is not allowed never adds buying power (a call spread entered leg by leg)", () => {
  const m = defaultMarket();
  const short = opt("QQQ", "call", 500, -1, 5, { gid: 1 });
  const long = opt("QQQ", "call", 510, 1, 2, { gid: 2 });
  const apart = cashRequirement([short, long], m, { cash: 100000 });
  assert.ok(apart.positions[0].flags.includes("naked-call"));
  near(apart.positions[0].need, 0, 1e-9, "the uncovered short call's premium does not count as cash");
  near(apart.total.need, 200, 1e-9, "only the long call is paid");
  assert.ok(apart.buyingPower <= 100000, `buying power ${apart.buyingPower} above the account cash`);
  const together = cashRequirement([short, { ...long, gid: 1 }], m, { cash: 100000 });
  near(together.total.need, 10 * 100 - 300, 1e-9, "one combo: width x 100 - net credit");
});

test("Cash account: stock and long options are paid in full at their entry", () => {
  const m = defaultMarket();
  const c = cashRequirement([{ kind: "equity", sym: "SPY", qty: 100, entry: 600 }, opt("SPY", "call", 700, 2, 5)], m);
  near(c.positions[0].paid, 60000, 1e-9, "100 shares x 600");
  near(c.positions[1].paid, 2 * 100 * 5, 1e-9, "2 contracts x 100 x 5.00");
  near(c.total.need, 61000, 1e-9, "total cash needed");
  assert.deepEqual(c.positions.flatMap((p) => p.flags), [], "nothing to flag");
});

test("Cash account: a short put is cash-secured, less the premium received", () => {
  const c = cashRequirement([opt("SPY", "put", 600, -2, 4)], defaultMarket());
  const p = c.positions[0];
  near(p.collateral, 600 * 100 * 2, 1e-9, "strike x 100 x contracts");
  near(p.received, 800, 1e-9, "premium received");
  near(p.need, 600 * 100 * 2 - 800, 1e-9, "the cash it needs");
});

test("Cash account: short calls need shares; shares cover only one combo, the rest is not allowed", () => {
  const m = defaultMarket();
  const book = [
    { kind: "equity", sym: "AAPL", qty: 150, entry: 250, gid: 1 },
    opt("AAPL", "call", 280, -1, 3, { gid: 2 }),
    opt("AAPL", "call", 290, -1, 2, { gid: 3 }),
  ];
  const c = cashRequirement(book, m);
  assert.ok(c.positions[1].flags.includes("covered"), "the first call is covered by 100 shares");
  near(c.positions[1].collateral, 0, 1e-9, "covered: no collateral");
  assert.ok(c.positions[2].flags.includes("naked-call"), "50 shares left cannot cover the second call");
  assert.equal(c.notAllowed, 1);
});

test("Cash account: a vertical credit spread holds its maximum loss (width x 100 - net credit)", () => {
  const legs = [opt("SPY", "put", 600, -1, 6, { gid: 4 }), opt("SPY", "put", 590, 1, 4, { gid: 4 })];
  const c = cashRequirement(legs, defaultMarket());
  near(c.positions[0].collateral, 10 * 100, 1e-9, "width x 100");
  assert.ok(c.positions[0].flags.includes("spread"), "spread treatment is a stated assumption");
  near(c.total.need, 1000 - 200, 1e-9, "width x 100 - net credit");
  near(c.total.need, -expiryMin(legs), 1e-9, "= the maximum loss at expiry");
});

test("Cash account: only spreads of European-style, cash-settled index options (SPX) fit a cash account", () => {
  const spread = (sym, k) => [opt(sym, "put", k, -1, 6, { gid: 8 }), opt(sym, "put", k - 10, 1, 4, { gid: 8 })];
  const spx = cashRequirement(spread("SPX", 6800), defaultMarket()).positions[0];
  assert.ok(spx.flags.includes("spread") && !spx.flags.includes("spread-margin-account"), "an SPX spread may be held in a cash account");
  const spy = cashRequirement(spread("SPY", 600), defaultMarket());
  assert.ok(spy.positions[0].flags.includes("spread-margin-account"), "an SPY (American-style) spread needs a margin account");
  near(spy.positions[0].collateral, 10 * 100, 1e-9, "still shown at its maximum loss");
  assert.equal(spy.notAllowed, 0, "flagged, not counted as not allowed");
});

test("Cash account: an iron condor holds the maximum loss of the whole structure, not both sides", () => {
  const m = defaultMarket();
  const ic = buildStrategy("Iron condor", { sym: "NVDA", spot: 200, width: 10, qty: 2, days: 30, iv: 45, r: m.r }).map((l) => ({ ...l, gid: 5 }));
  const c = cashRequirement(ic, m);
  near(c.total.need, -expiryMin(ic), 1e-6, "max loss = one side's width x 100 x 2 - net credit");
  near(c.total.collateral, 10 * 100 * 2, 1e-6, "one side's width, not two");
  const fly = buildStrategy("Call butterfly", { sym: "SPY", spot: 680, width: 10, qty: 1, days: 30, iv: 16, r: m.r }).map((l) => ({ ...l, gid: 6 }));
  const f = cashRequirement(fly, m);
  near(f.total.collateral, 0, 1e-9, "a long butterfly risks only its debit");
  near(f.total.need, -expiryMin(fly), 1e-6);
});

test("Cash account: a long leg that expires before the short leg does not cover it", () => {
  const legs = [opt("SPY", "put", 600, -1, 6, { gid: 7 }), opt("SPY", "put", 590, 1, 2, { gid: 7, days: 10 })];
  const c = cashRequirement(legs, defaultMarket());
  near(c.positions[0].collateral, 600 * 100, 1e-9, "cash-secured, as if alone");
  const rolled = cashRequirement([legs[0], { ...legs[1], days: 60 }], defaultMarket());
  near(rolled.positions[0].collateral, 10 * 100, 1e-9, "a later-expiring long leg covers it");
});

test("Cash account: futures need a futures-enabled account and an editable initial margin", () => {
  const fut = { kind: "future", sym: "SPX", root: "MES", qty: -3, entry: 6800 };
  const unset = cashRequirement([fut], defaultMarket());
  assert.deepEqual(unset.positions[0].flags.sort(), ["futures-account", "futures-margin-unset"]);
  near(unset.total.need, 0, 1e-9, "no margin figure is assumed");
  const set = cashRequirement([fut], defaultMarket(), { futuresMargin: { MES: 2500 } });
  near(set.positions[0].collateral, 3 * 2500, 1e-9, "contracts x margin per contract");
  assert.deepEqual(set.positions[0].flags, ["futures-account"]);
});

test("Cash account: short stock is not allowed; buying power is account cash minus the need", () => {
  const book = [{ kind: "equity", sym: "QQQ", qty: -10, entry: 620 }, { kind: "equity", sym: "SPY", qty: 10, entry: 600 }];
  const c = cashRequirement(book, defaultMarket(), { cash: 10000 });
  assert.deepEqual(c.positions[0].flags, ["short-stock"]);
  near(c.positions[0].need, 0, 1e-9, "no cash figure for a position the account can't hold");
  near(c.buyingPower, 10000 - 6000, 1e-9);
  assert.equal(cashRequirement(book, defaultMarket()).buyingPower, null, "no account cash, no buying power");
});

test("Cash account: short legs in the money or near expiry are listed with what assignment needs", () => {
  const m = defaultMarket(); // SPY 680, AAPL 260
  const book = [
    opt("SPY", "put", 700, -2, 25, { id: 1 }), // ITM short put
    opt("AAPL", "call", 300, -1, 1, { id: 2, days: 3 }), // OTM but 3 days left
    opt("SPY", "put", 600, -1, 1, { id: 3 }), // OTM, 30 days: not listed
    opt("SPY", "call", 600, 1, 85, { id: 4 }), // long ITM: not listed
  ];
  const a = cashRequirement(book, m, { nearDays: 7 }).assignment;
  assert.deepEqual(a.map((x) => x.id), [1, 2]);
  near(a[0].cash, 700 * 100 * 2, 1e-9, "a put assignment buys 200 shares at 700");
  assert.equal(a[0].itm, true);
  assert.equal(a[1].shares, 100, "a call assignment delivers 100 shares");
  assert.equal(a[1].itm, false);
});

// ---------- ledger export/import (#17) ----------
function sampleLedger() {
  const m = defaultMarket();
  m.quotes.SPY.spot = 690; // an edited quote travels with the export
  const ic = (gid) => buildStrategy("Iron condor", { sym: "SPY", spot: 680, width: 10, qty: 1, days: 30, iv: 16, r: m.r }).map((l, i) => ({ ...l, id: gid * 10 + i, gid, group: "Iron condor SPY" }));
  const positions = [
    { kind: "equity", sym: "QQQ", qty: 25, entry: 612.34, id: 1, gid: 1 },
    ...ic(2),
    ...ic(3).map((l) => (l.right === "call" ? { ...l, strike: l.strike + 5, days: 44, iv: 17.5 } : l)),
    { kind: "future", sym: "SPX", root: "MES", qty: -2, entry: 6801.25, id: 40, gid: 4, group: "Beta hedge" },
  ];
  const history = [{ gid: 3, group: "Iron condor SPY", at: "2026-11-02", from: { strike: 690, days: 30 }, to: { strike: 695, days: 44 }, realized: -42.5 }];
  return { positions, history, market: m, account: { cash: 250000, futuresMargin: { ES: null, MES: 2500 } } };
}

test("Ledger export/import round trip is lossless and keeps two same-named combos apart", () => {
  const s = sampleLedger();
  const back = parseLedger(serializeLedger(s));
  const strip = (ps) => ps.map(({ id, ...p }) => p);
  assert.deepEqual(strip(back.positions), strip(s.positions), "strike, days, IV, entry, combo tags");
  assert.deepEqual(back.history, s.history, "roll history");
  assert.deepEqual(back.market, s.market, "quotes, rate and spot-vol");
  assert.deepEqual(back.account, s.account, "cash settings");
  assert.equal(new Set(back.positions.filter((p) => p.group === "Iron condor SPY").map((p) => p.gid)).size, 2, "two condors stay two combos");
  assert.equal(serializeLedger(back), serializeLedger(s), "exporting the import gives the same text");
});

test("Ledger import renumbers combos 1..n and moves the roll history with them", () => {
  const s = sampleLedger();
  const shifted = { ...s, positions: s.positions.map((p) => ({ ...p, gid: p.gid + 100 })), history: s.history.map((h) => ({ ...h, gid: h.gid + 100 })) };
  const back = parseLedger(serializeLedger(shifted));
  assert.deepEqual([...new Set(back.positions.map((p) => p.gid))], [1, 2, 3, 4]);
  assert.equal(back.history[0].gid, 3, "the roll stays on the combo it was recorded on");
});

test("Ledger import rejects bad input with a clear message", () => {
  const ok = JSON.parse(serializeLedger(sampleLedger()));
  const bad = (mutate) => {
    const o = structuredClone(ok);
    mutate(o);
    return JSON.stringify(o);
  };
  assert.throws(() => parseLedger("{not json"), /not valid JSON/);
  assert.throws(() => parseLedger(JSON.stringify({ hello: 1 })), /not a Portfolio Hedger ledger/);
  assert.throws(() => parseLedger(bad((o) => {
    o.version = 99;
  })), /version 99/);
  assert.throws(() => parseLedger(bad((o) => {
    o.positions[1].strike = -5;
  })), /position 2.*strike/);
  assert.throws(() => parseLedger(bad((o) => {
    o.positions[0].sym = "XYZ";
  })), /position 1.*XYZ/);
  assert.throws(() => parseLedger(bad((o) => {
    o.positions[1].right = "straddle";
  })), /position 2.*right/);
  assert.throws(() => parseLedger(bad((o) => {
    o.positions[9].root = "NQ";
  })), /position 10.*root/);
  assert.throws(() => parseLedger(bad((o) => {
    o.history[0].realized = "lots";
  })), /roll 1/);
  // Imported symbols reach the page, so only plain tickers pass; SPX and SPY must stay (the app hedges with them).
  assert.throws(() => parseLedger(bad((o) => {
    o.market.quotes['<img src=x onerror="alert(1)">'] = { spot: 1, beta: 1, iv: 20 };
  })), /symbol/);
  assert.throws(() => parseLedger(bad((o) => {
    o.positions[0].sym = "toString";
  })), /position 1.*toString/);
  assert.throws(() => parseLedger(bad((o) => {
    o.market.quotes = Object.fromEntries(Object.entries(o.market.quotes).filter(([k]) => k !== "SPX"));
  })), /SPX/);
});

test("Optimizer treats negative weights as zero", () => {
  const m = defaultMarket();
  const r = optimizeHedge(examplePortfolio(m), m, { paths: 500, weights: { beta: 0, gamma: 0, vega: 0, cvar: -1, cost: 0 } });
  assert.deepEqual(r.x, [0, 0]);
});

test("Gamma hedge is capped at a sane contract count", () => {
  const m = defaultMarket();
  const t = gammaHedge(examplePortfolio(m), m, "QQQ", { target: 1e6, days: 3650, right: "call" });
  assert.ok(Math.abs(t[0].qty) <= 10000, `qty ${t[0].qty}`);
});

test("Joint optimizer never ends worse than doing nothing", () => {
  const m = defaultMarket();
  const book = examplePortfolio(m);
  const r = optimizeHedge(book, m, { paths: 1500, days: 30, seed: 3 });
  assert.ok(r.after.objective <= r.before.objective + 1e-12);
  assert.ok(Math.abs(r.after.betaDollars) < Math.abs(r.before.betaDollars));
  const pnl = pnlPaths([...book, ...r.trades], m, simulate(m, { paths: 1500, days: 30, seed: 3 }), 30);
  near(riskStats(pnl).cvar95, r.after.cvar95, 1e-6, "reported CVaR matches a fresh revaluation");
});
