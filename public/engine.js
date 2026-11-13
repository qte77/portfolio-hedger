// engine.js — pricing, portfolio risk and hedging for Portfolio Hedger.
// Pure ES module: no DOM, no I/O. Imported by app.js in the browser and by tests/ under node.
//
// Conventions
//   vol / iv inputs in the market table and on legs are in vol POINTS (25 = 25%); bs() takes decimals.
//   days = calendar days to expiry as of the market date; scenarios move time forward by `days`.
//   delta and gamma are in share-equivalents of the underlying (an option contract = 100 shares,
//   an ES future = 50 x SPX, MES = 5 x SPX). vega is $ per 1 vol point, theta is $ per calendar day.

export const OPTION_MULT = 100;
export const FUTURE_MULT = { ES: 50, MES: 5 };

/** Illustrative quotes (not live data). spot, beta vs SPX, implied vol in points. */
export function defaultMarket() {
  return {
    r: 0.04,
    spotVol: 0, // IV points per 1% SPX move in the Monte Carlo (e.g. -1: IV up 1 point per 1% drop)
    quotes: {
      SPX: { spot: 6800, beta: 1, iv: 16, index: true },
      SPY: { spot: 680, beta: 1, iv: 16 },
      QQQ: { spot: 620, beta: 1.15, iv: 20 },
      AAPL: { spot: 260, beta: 1.15, iv: 26 },
      MSFT: { spot: 510, beta: 0.95, iv: 24 },
      NVDA: { spot: 200, beta: 1.7, iv: 45 },
      AMZN: { spot: 240, beta: 1.25, iv: 32 },
      TSLA: { spot: 450, beta: 2, iv: 55 },
      GOOGL: { spot: 290, beta: 1.1, iv: 28 },
      META: { spot: 750, beta: 1.3, iv: 34 },
    },
  };
}

// ---------- Black–Scholes ----------

const SQRT2PI = Math.sqrt(2 * Math.PI);
export const normPdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;

/** Standard normal CDF (Abramowitz & Stegun 26.2.17, |error| < 7.5e-8). */
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - normPdf(x) * poly;
  return x >= 0 ? p : 1 - p;
}

/**
 * European option price and Greeks per share.
 * @param {{S:number,K:number,T:number,vol:number,r:number,q?:number,right:"call"|"put"}} a  T in years, vol decimal
 * @returns {{price:number,delta:number,gamma:number,vega:number,theta:number,d1?:number,d2?:number}} vega per vol point,
 *   theta per day; d1 and d2 (the Method page's worked example) only before expiry
 */
export function bs({ S, K, T, vol, r, q = 0, right }) {
  const call = right === "call";
  if (T <= 0 || vol <= 0) {
    const price = call ? Math.max(0, S - K) : Math.max(0, K - S);
    const delta = call ? (S > K ? 1 : 0) : S < K ? -1 : 0;
    return { price, delta, gamma: 0, vega: 0, theta: 0 };
  }
  const sqT = Math.sqrt(T);
  const sd = vol * sqT;
  const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / sd;
  const d2 = d1 - sd;
  const dq = Math.exp(-q * T);
  const dr = Math.exp(-r * T);
  const pdf = normPdf(d1);
  const price = call
    ? S * dq * normCdf(d1) - K * dr * normCdf(d2)
    : K * dr * normCdf(-d2) - S * dq * normCdf(-d1);
  const delta = call ? dq * normCdf(d1) : dq * (normCdf(d1) - 1);
  const gamma = (dq * pdf) / (S * sd);
  const vega = (S * dq * pdf * sqT) / 100;
  const decay = (-S * dq * pdf * vol) / (2 * sqT);
  const thetaYear = call
    ? decay - r * K * dr * normCdf(d2) + q * S * dq * normCdf(d1)
    : decay + r * K * dr * normCdf(-d2) - q * S * dq * normCdf(-d1);
  return { price, delta, gamma, vega, theta: thetaYear / 365, d1, d2 };
}

// ---------- positions and valuation ----------
// equity: { kind:"equity", sym, qty, entry }
// option: { kind:"option", sym, right, strike, qty (contracts, signed), days, iv (points), entry (premium per share) }
// future: { kind:"future", sym:"SPX", root:"ES"|"MES", qty, entry (index level) }

/** Strike grid used when building strikes: 5 for index-level prices, 1 above $50, else 0.5. */
export const strikeStep = (spot) => (spot >= 1000 ? 5 : spot >= 50 ? 1 : 0.5);
export const roundStrike = (x, spot) => {
  const s = strikeStep(spot);
  return Math.max(s, Math.round(x / s) * s);
};

/** Underlying price under a scenario: explicit override, else spot moved by beta x market move. */
function spotUnder(sym, market, scen) {
  const q = market.quotes[sym];
  if (scen?.spots && scen.spots[sym] !== undefined) return scen.spots[sym];
  const move = scen?.move ?? 0;
  return Math.max(q.spot * (1 + q.beta * move), q.spot * 0.001);
}

function optionAt(p, S, market, days, ivShift) {
  return bs({
    S,
    K: p.strike,
    T: Math.max(p.days - days, 0) / 365,
    vol: Math.max(p.iv + ivShift, 1) / 100,
    r: market.r,
    right: p.right,
  });
}

/** P&L of one position vs its entry, at underlying price S, `days` forward, IV shifted by `ivShift` points. */
export function positionPnl(p, S, market, days = 0, ivShift = 0) {
  if (p.kind === "equity") return p.qty * (S - p.entry);
  if (p.kind === "future") return p.qty * FUTURE_MULT[p.root] * (S - p.entry);
  return p.qty * OPTION_MULT * (optionAt(p, S, market, days, ivShift).price - p.entry);
}

/** Model price of one unit now: option per share (Black–Scholes on today's quotes), else the underlying spot. */
export function legMark(p, market) {
  const S = market.quotes[p.sym].spot;
  return p.kind === "option" ? optionAt(p, S, market, 0, 0).price : S;
}

/**
 * Roll an option leg in place: close it at its model mark (realizing qty x 100 x (mark - entry)) and open the
 * changed leg (new strike and/or days) at its own model mark, keeping its combo (gid, group). Returns the new leg
 * and a history record. Model marks stand in for fills; the user can then edit Entry to the real fill.
 */
export function rollLeg(leg, changes, market, at = new Date().toISOString().slice(0, 10)) {
  const realized = leg.qty * OPTION_MULT * (legMark(leg, market) - leg.entry);
  const next = { ...leg, ...changes };
  next.entry = legMark(next, market);
  return {
    leg: next,
    record: { gid: leg.gid, group: leg.group, at, from: { strike: leg.strike, days: leg.days }, to: { strike: next.strike, days: next.days }, realized },
  };
}

/**
 * Roll every option leg of one combo (gid) at once: shift strikes by `strikeShift` (rounded to the strike grid)
 * and/or set `days`. Each changed leg goes through rollLeg, so each gets its own history record. Returns a new
 * positions array and the records; legs that would not change are left as they are.
 */
export function rollCombo(positions, gid, { strikeShift = 0, days }, market, at) {
  const records = [];
  const next = positions.map((p) => {
    if (p.gid !== gid || p.kind !== "option") return p;
    const spot = market.quotes[p.sym].spot;
    const changes = {};
    if (strikeShift) changes.strike = roundStrike(p.strike + strikeShift, spot);
    if (Number.isFinite(days) && days >= 0 && days !== p.days) changes.days = Math.round(days);
    if (!Object.keys(changes).length || (changes.strike === p.strike && changes.days === undefined)) return p;
    const { leg, record } = rollLeg(p, changes, market, at);
    records.push(record);
    return leg;
  });
  return { positions: next, records };
}

/** Per-combo (gid) subtotals: legs, net entry and mark in dollars, unrealized and realized P&L, Greeks. */
export function comboRollups(positions, market, history = []) {
  const byGid = new Map();
  for (const p of positions) {
    const r = byGid.get(p.gid) ?? { gid: p.gid, group: p.group, legs: 0, netEntry: 0, netMark: 0, unrealized: 0, realized: 0, delta: 0, gamma: 0, vega: 0, theta: 0 };
    const mult = p.kind === "option" ? OPTION_MULT : p.kind === "future" ? FUTURE_MULT[p.root] : 1;
    const g = positionGreeks(p, market);
    r.legs += 1;
    r.netEntry += p.qty * mult * p.entry;
    r.netMark += p.qty * mult * legMark(p, market);
    r.unrealized += positionPnl(p, market.quotes[p.sym].spot, market);
    r.delta += g.delta;
    r.gamma += g.gamma;
    r.vega += g.vega;
    r.theta += g.theta;
    byGid.set(p.gid, r);
  }
  for (const h of history) {
    const r = byGid.get(h.gid);
    if (r) r.realized += h.realized;
  }
  return [...byGid.values()];
}

/** Portfolio P&L for a deterministic scenario {move (fraction, beta-scaled per name), ivShift (points), days}. */
export function scenarioPnl(positions, market, scen = {}) {
  let total = 0;
  for (const p of positions) total += positionPnl(p, spotUnder(p.sym, market, scen), market, scen.days ?? 0, scen.ivShift ?? 0);
  return total;
}

/** Greeks of one position in share-equivalents and dollars. */
export function positionGreeks(p, market, scen = {}) {
  const S = spotUnder(p.sym, market, scen);
  if (p.kind === "equity") return { delta: p.qty, gamma: 0, vega: 0, theta: 0, S };
  if (p.kind === "future") return { delta: p.qty * FUTURE_MULT[p.root], gamma: 0, vega: 0, theta: 0, S };
  const g = optionAt(p, S, market, scen.days ?? 0, scen.ivShift ?? 0);
  const n = p.qty * OPTION_MULT;
  return { delta: n * g.delta, gamma: n * g.gamma, vega: n * g.vega, theta: n * g.theta, S };
}

/**
 * Aggregate Greeks. betaDollars = Σ Δ·S·β; gamma1pct = Σ ½·Γ·(S·β·1%)², the convexity P&L of a 1% SPX move.
 * Delta is only additive within one underlying, so it is reported per symbol.
 */
export function portfolioGreeks(positions, market, scen = {}) {
  const bySym = {};
  const tot = { betaDollars: 0, dollarDelta: 0, gamma1pct: 0, vega: 0, theta: 0 };
  const counts = { option: 0, equity: 0, future: 0 };
  for (const p of positions) {
    counts[p.kind] += 1;
    const g = positionGreeks(p, market, scen);
    const b = market.quotes[p.sym].beta;
    if (!bySym[p.sym]) bySym[p.sym] = { delta: 0, gamma: 0, vega: 0, theta: 0, dollarDelta: 0, betaDollars: 0, gamma1pct: 0 };
    const s = bySym[p.sym];
    s.delta += g.delta;
    s.gamma += g.gamma;
    s.vega += g.vega;
    s.theta += g.theta;
    s.dollarDelta += g.delta * g.S;
    s.betaDollars += g.delta * g.S * b;
    s.gamma1pct += 0.5 * g.gamma * (g.S * b * 0.01) ** 2;
  }
  for (const s of Object.values(bySym)) {
    tot.betaDollars += s.betaDollars;
    tot.dollarDelta += s.dollarDelta;
    tot.gamma1pct += s.gamma1pct;
    tot.vega += s.vega;
    tot.theta += s.theta;
  }
  const spx = market.quotes.SPX.spot;
  return { ...tot, bySym, counts, esEquivalent: tot.betaDollars / (FUTURE_MULT.ES * spx) };
}

/** Net premium: positive = debit paid, negative = credit received. */
export function netPremium(positions) {
  return positions.filter((p) => p.kind === "option").reduce((s, p) => s + p.qty * OPTION_MULT * p.entry, 0);
}

// ---------- cash account (spec Q9) ----------

/** Days to expiry at or below which a short leg is listed as an assignment exposure, whatever its moneyness. */
export const NEAR_EXPIRY_DAYS = 7;

const intrinsic = (right, strike, S) => (right === "call" ? Math.max(0, S - strike) : Math.max(0, strike - S));

/**
 * Cash a cash account needs to hold the book. Per position: `paid` (stock and long options, at entry), `received`
 * (short option premium), `collateral` (cash held against short options or futures) and `need` = paid - received +
 * collateral. Rules:
 *   short put    cash-secured: strike x 100 per contract
 *   short call   covered by a long call in the same combo (same underlying, same or later expiry), else by 100
 *                shares of the underlying per contract (shares cover one call only), else flagged "naked-call"
 *   spread       a short leg covered by a long leg holds the width x 100 ("spread"); a one-expiry combo then holds
 *                no more than its maximum loss at expiry, so an iron condor holds one side, a butterfly nothing.
 *                Spreads not on SPX are also flagged "spread-margin-account": exchange rules allow spreads in a cash
 *                account only when built from European-style, cash-settled index options
 *   future       |qty| x settings.futuresMargin[root] if set ("futures-margin-unset" otherwise); always flagged
 *                "futures-account", since futures need a futures-enabled margin account
 *   short stock  flagged "short-stock" and given no cash figure: a cash account can't sell short
 * A flagged "naked-call" or "short-stock" position never lowers the need: its premium does not count as cash.
 * `assignment` lists short legs in the money or within `nearDays` of expiry, with the cash (puts) or shares (calls)
 * that assignment would need. `buyingPower` = settings.cash - total need, or null when no cash is set.
 */
export function cashRequirement(positions, market, settings = {}) {
  const nearDays = settings.nearDays ?? NEAR_EXPIRY_DAYS;
  const out = positions.map((p) => ({ id: p.id, paid: 0, received: 0, collateral: 0, need: 0, flags: [] }));
  const shares = {};
  const combos = new Map();
  positions.forEach((p, i) => {
    entryCash(p, out[i], settings, shares);
    if (p.kind !== "option" || !p.qty) return;
    const key = p.gid ?? `leg-${i}`;
    if (!combos.has(key)) combos.set(key, []);
    combos.get(key).push(i);
  });
  for (const idx of combos.values()) comboCollateral(idx, positions, out, shares);

  const total = { paid: 0, received: 0, collateral: 0, need: 0 };
  for (const r of out) {
    // Reason: a position a cash account can't hold (short stock, an uncovered call) gets no cash figure of its own, and
    // its premium must not free buying power: a call spread entered as two separate legs would otherwise read as cash in.
    const raw = r.paid - r.received + r.collateral;
    r.need = notAllowedInCash(r) ? Math.max(0, raw) : raw;
    for (const k of Object.keys(total)) total[k] += r[k];
  }
  const cash = Number.isFinite(settings.cash) ? settings.cash : null;
  return {
    positions: out,
    total,
    notAllowed: out.filter(notAllowedInCash).length,
    cash,
    buyingPower: cash === null ? null : cash - total.need,
    assignment: assignmentExposure(positions, market, nearDays),
  };
}

const notAllowedInCash = (r) => r.flags.includes("naked-call") || r.flags.includes("short-stock");

/** What a position pays, receives or holds on its own, before any pairing; long shares are pooled to cover calls. */
function entryCash(p, r, settings, shares) {
  if (p.kind === "equity") {
    if (p.qty > 0) {
      r.paid = p.qty * p.entry;
      shares[p.sym] = (shares[p.sym] ?? 0) + p.qty;
    } else if (p.qty < 0) r.flags.push("short-stock");
  } else if (p.kind === "future") {
    const m = Number(settings.futuresMargin?.[p.root]);
    r.flags.push("futures-account");
    if (m > 0) r.collateral = Math.abs(p.qty) * m;
    else r.flags.push("futures-margin-unset");
  } else if (p.qty > 0) r.paid = p.qty * OPTION_MULT * p.entry;
  else if (p.qty < 0) r.received = -p.qty * OPTION_MULT * p.entry;
}

/** Collateral for the short legs of one combo: pair each with long legs, then shares, then cap at the max loss. */
function comboCollateral(idx, positions, out, shares) {
  // Contracts of each long leg still free to cover a short leg.
  const free = new Map(idx.filter((i) => positions[i].qty > 0).map((i) => [i, positions[i].qty]));
  const excluded = new Map(); // short call contracts covered by shares or not covered at all: outside the max-loss cap
  const shorts = idx.filter((i) => positions[i].qty < 0);
  for (const i of shorts) {
    const left = pairWithLongs(positions, i, out[i], free);
    if (!left) continue;
    const excludedQty = coverAlone(positions[i], out[i], left, shares);
    if (excludedQty) excluded.set(i, excludedQty);
  }
  capAtMaxLoss(idx, shorts, positions, out, excluded);
}

/** Covers short leg i with free long legs (same underlying and right, expiring no earlier; narrowest first). */
function pairWithLongs(positions, i, r, free) {
  const s = positions[i];
  let left = -s.qty;
  const width = (l) => (s.right === "call" ? Math.max(0, l.strike - s.strike) : Math.max(0, s.strike - l.strike));
  const cands = [...free.keys()].filter((j) => {
    const l = positions[j];
    return l.sym === s.sym && l.right === s.right && l.days >= s.days;
  });
  cands.sort((a, b) => width(positions[a]) - width(positions[b]));
  for (const j of cands) {
    const take = Math.min(left, free.get(j));
    if (!take) continue;
    free.set(j, free.get(j) - take);
    r.collateral += take * width(positions[j]) * OPTION_MULT;
    left -= take;
    flagSpread(r, s.sym);
  }
  return left;
}

/** Underlyings whose options are European-style and cash-settled: the only spreads exchange rules allow in a cash account. */
const CASH_ACCOUNT_SPREAD_SYMS = new Set(["SPX"]);

function flagSpread(r, sym) {
  if (!r.flags.includes("spread")) r.flags.push("spread");
  if (!CASH_ACCOUNT_SPREAD_SYMS.has(sym) && !r.flags.includes("spread-margin-account")) r.flags.push("spread-margin-account");
}

/** Contracts no long leg covers: a put is cash-secured; a call is covered by shares, else naked. Returns the call
 * contracts to leave out of the max-loss cap (0 for a put). */
function coverAlone(s, r, left, shares) {
  if (s.right === "put") {
    r.collateral += left * s.strike * OPTION_MULT;
    return 0;
  }
  const covered = Math.min(left, Math.floor((shares[s.sym] ?? 0) / OPTION_MULT));
  if (covered) {
    shares[s.sym] -= covered * OPTION_MULT;
    r.flags.push("covered");
  }
  if (left > covered) r.flags.push("naked-call");
  return left;
}

function capAtMaxLoss(idx, shorts, positions, out, excluded) {
  // Reason: pairing leg by leg charges both wings of an iron condor, but only one can finish in the money. With one
  // underlying and one expiry, the intrinsic payoff is piecewise linear with no net short calls left, so its minimum
  // over S = 0 and the strikes is the structure's worst case; scale the pairing collateral down to it.
  const legs = idx.map((i) => ({ ...positions[i], qty: positions[i].qty + (excluded.get(i) ?? 0) })).filter((l) => l.qty);
  const charged = shorts.reduce((t, i) => t + out[i].collateral, 0);
  if (charged <= 0 || new Set(legs.map((l) => `${l.sym}|${l.days}`)).size !== 1) return;
  const points = [0, ...legs.map((l) => l.strike)];
  const worst = Math.min(...points.map((S) => legs.reduce((t, l) => t + l.qty * OPTION_MULT * intrinsic(l.right, l.strike, S), 0)));
  const cap = Math.max(0, -worst);
  if (cap < charged) for (const i of shorts) out[i].collateral *= cap / charged;
}

/** Short legs in the money or within nearDays of expiry, with the cash (puts) or shares (calls) assignment needs. */
function assignmentExposure(positions, market, nearDays) {
  const assignment = [];
  positions.forEach((p, i) => {
    if (p.kind !== "option" || p.qty >= 0) return;
    const S = market.quotes[p.sym].spot;
    const itm = intrinsic(p.right, p.strike, S) > 0;
    if (!itm && p.days > nearDays) return;
    const n = -p.qty * OPTION_MULT;
    assignment.push({ id: p.id, index: i, sym: p.sym, right: p.right, strike: p.strike, days: p.days, contracts: -p.qty, itm, cash: p.right === "put" ? n * p.strike : 0, shares: p.right === "call" ? n : 0 });
  });
  return assignment;
}

// ---------- ledger export/import (#17) ----------

export const LEDGER_FORMAT = "portfolio-hedger-ledger";
export const LEDGER_VERSION = 1;
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** Combo ids renumbered 1..n in order of first appearance (positions, then roll history), so equal books export alike. */
function renumber(positions, history) {
  const map = new Map();
  const gidOf = (g, fallback) => {
    const key = g ?? fallback;
    if (!map.has(key)) map.set(key, map.size + 1);
    return map.get(key);
  };
  return {
    positions: positions.map((p, i) => ({ ...p, gid: gidOf(p.gid, `position-${i}`) })),
    history: history.map((h, i) => ({ ...h, gid: gidOf(h.gid, `roll-${i}`) })),
  };
}

const POSITION_FIELDS = { equity: ["sym", "qty", "entry"], option: ["sym", "right", "strike", "qty", "days", "iv", "entry"], future: ["sym", "root", "qty", "entry"] };
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
function cleanPosition(p) {
  return { kind: p.kind, ...pick(p, POSITION_FIELDS[p.kind]), gid: p.gid, ...pick(p, ["group"]) };
}
function cleanMarket(m) {
  const quotes = Object.fromEntries(Object.entries(m.quotes).map(([s, q]) => [s, { spot: q.spot, beta: q.beta, iv: q.iv, ...(q.index ? { index: true } : {}) }]));
  return { r: m.r, spotVol: Number(m.spotVol) || 0, quotes };
}
function cleanAccount(a = {}) {
  return { cash: a.cash ?? null, futuresMargin: { ES: a.futuresMargin?.ES ?? null, MES: a.futuresMargin?.MES ?? null } };
}

/**
 * The whole book as JSON text: positions (with strike, days, IV, entry, combo id and tag), roll history, quotes and
 * cash settings. Ids are left out (the importing app assigns its own) and combos are renumbered 1..n.
 */
export function serializeLedger({ positions, history = [], market, account }) {
  const n = renumber(positions, history);
  return JSON.stringify(
    {
      format: LEDGER_FORMAT,
      version: LEDGER_VERSION,
      positions: n.positions.map(cleanPosition),
      history: n.history.map((h) => ({ gid: h.gid, ...pick(h, ["group"]), at: h.at, from: { strike: h.from.strike, days: h.from.days }, to: { strike: h.to.strike, days: h.to.days }, realized: h.realized })),
      market: cleanMarket(market),
      account: cleanAccount(account),
    },
    null,
    1,
  );
}

/**
 * Parse and check exported ledger text. Returns { positions, history, market, account } with combos renumbered 1..n
 * (two combos with the same tag stay apart). Throws an Error that says what is wrong and where.
 */
export function parseLedger(text, fallbackMarket = defaultMarket()) {
  let o;
  try {
    o = JSON.parse(text);
  } catch (e) {
    throw new Error(`This is not valid JSON (${e.message}).`);
  }
  if (o?.format !== LEDGER_FORMAT) throw new Error(`This is not a Portfolio Hedger ledger: it has no "format": "${LEDGER_FORMAT}".`);
  if (o.version !== LEDGER_VERSION) throw new Error(`Ledger version ${o.version} is not supported; this app reads version ${LEDGER_VERSION}.`);
  if (!Array.isArray(o.positions)) throw new Error(`The ledger has no "positions" list.`);
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const market = o.market === undefined ? fallbackMarket : o.market;
  if (!(market && typeof market.quotes === "object" && num(market.r) && Object.values(market.quotes).every((q) => num(q?.spot) && q.spot > 0 && num(q.beta) && num(q.iv) && q.iv > 0))) {
    throw new Error(`The quotes ("market") need a rate r and, for each symbol, a spot above 0, a beta and an IV above 0.`);
  }
  // Reason: symbols are rendered into the page, so only plain tickers pass (no markup); hedges need SPX and SPY.
  const badSym = Object.keys(market.quotes).find((k) => !TICKER.test(k));
  if (badSym !== undefined) throw new Error(`The quotes have a symbol that is not a plain ticker (capital letters, digits, "." or "-", up to 10): ${JSON.stringify(badSym.slice(0, 40))}.`);
  for (const need of ["SPX", "SPY"]) if (!Object.hasOwn(market.quotes, need)) throw new Error(`The quotes must include ${need}.`);
  const rules = {
    sym: (v) => (typeof v === "string" && Object.hasOwn(market.quotes, v) ? null : `symbol ${String(v).slice(0, 40)} is not in the quotes`),
    qty: (v) => (Number.isInteger(v) && v !== 0 ? null : "qty must be a whole number other than 0"),
    entry: (v) => (num(v) && v >= 0 ? null : "entry must be a number of 0 or more"),
    right: (v) => (v === "call" || v === "put" ? null : `right must be "call" or "put"`),
    strike: (v) => (num(v) && v > 0 ? null : "strike must be a number above 0"),
    days: (v) => (Number.isInteger(v) && v >= 0 ? null : "days must be a whole number of 0 or more"),
    iv: (v) => (num(v) && v >= 1 ? null : "iv must be a number of 1 or more (vol points)"),
    root: (v) => (v === "ES" || v === "MES" ? null : "root must be ES or MES"),
  };
  o.positions.forEach((p, i) => {
    const where = `Can't import position ${i + 1}`;
    if (!POSITION_FIELDS[p?.kind]) throw new Error(`${where}: kind must be "equity", "option" or "future".`);
    for (const f of POSITION_FIELDS[p.kind]) {
      const err = rules[f](p[f]);
      if (err) throw new Error(`${where}: ${err}.`);
    }
    if (p.kind === "future" && p.sym !== "SPX") throw new Error(`${where}: futures are on SPX.`);
    if (p.group !== undefined && typeof p.group !== "string") throw new Error(`${where}: group must be text.`);
  });
  const history = o.history ?? [];
  if (!Array.isArray(history)) throw new Error(`"history" must be a list.`);
  history.forEach((h, i) => {
    const leg = (x) => num(x?.strike) && Number.isInteger(x?.days);
    if (!(num(h?.realized) && leg(h.from) && leg(h.to) && typeof h.at === "string")) throw new Error(`Can't import roll ${i + 1}: it needs a date, from/to strike and days, and a realized number.`);
  });
  const n = renumber(o.positions.map(cleanPosition), history);
  return {
    positions: n.positions,
    history: n.history.map((h) => ({ gid: h.gid, ...pick(h, ["group"]), at: h.at, from: { strike: h.from.strike, days: h.from.days }, to: { strike: h.to.strike, days: h.to.days }, realized: h.realized })),
    market: cleanMarket(market),
    account: cleanAccount(o.account),
  };
}

// ---------- strategies ----------

/** [right, sign, strike offset in widths] per leg. */
export const TEMPLATES = {
  "Long call": [["call", 1, 0]],
  "Long put": [["put", 1, 0]],
  "Bull call spread": [["call", 1, 0], ["call", -1, 1]],
  "Bear call spread": [["call", -1, 0], ["call", 1, 1]],
  "Bull put spread": [["put", -1, 0], ["put", 1, -1]],
  "Bear put spread": [["put", 1, 0], ["put", -1, -1]],
  "Iron condor": [["put", 1, -2], ["put", -1, -1], ["call", -1, 1], ["call", 1, 2]],
  "Iron butterfly": [["put", 1, -1], ["put", -1, 0], ["call", -1, 0], ["call", 1, 1]],
  "Long strangle": [["put", 1, -1], ["call", 1, 1]],
  "Short strangle": [["put", -1, -1], ["call", -1, 1]],
  "Long straddle": [["put", 1, 0], ["call", 1, 0]],
  "Short straddle": [["put", -1, 0], ["call", -1, 0]],
  "Call butterfly": [["call", 1, -1], ["call", -2, 0], ["call", 1, 1]],
};

/** Legs of a template, priced with Black–Scholes at `spot`; each leg keeps its own days and iv. */
export function buildStrategy(name, { sym, spot, width, qty, days, iv, r }) {
  const atm = roundStrike(spot, spot);
  return TEMPLATES[name].map(([right, sign, off]) => {
    const strike = roundStrike(atm + off * width, spot);
    const entry = bs({ S: spot, K: strike, T: days / 365, vol: iv / 100, r, right }).price;
    return { kind: "option", sym, right, strike, qty: qty * sign, days, iv, entry, group: name };
  });
}

/**
 * Apply one execution price to a whole combo. `price` is per one combo, per share, signed like a fill
 * (debit > 0, credit < 0); `contracts` is how many combos. Every leg's entry is scaled by the same factor,
 * so the legs keep their relative theoretical prices and their sum equals price x contracts.
 */
export function applyNetPrice(legs, price, contracts) {
  const theo = legs.reduce((s, l) => s + l.qty * l.entry, 0);
  const target = price * contracts;
  if (Math.abs(theo) < 1e-9) throw new Error("this combo has no net theoretical price to scale");
  const k = target / theo;
  if (!(k > 0)) throw new Error(theo < 0 ? "this combo is a credit: enter the price as a credit" : "this combo is a debit: enter the price as a debit");
  return legs.map((l) => ({ ...l, entry: l.entry * k }));
}

/** The example book from the spec: index ETFs plus five option structures. */
export function examplePortfolio(market) {
  const q = market.quotes;
  const leg = (name, sym, width, qty) =>
    buildStrategy(name, { sym, spot: q[sym].spot, width, qty, days: 30, iv: q[sym].iv, r: market.r });
  return [
    { kind: "equity", sym: "SPY", qty: 400, entry: q.SPY.spot },
    { kind: "equity", sym: "QQQ", qty: 200, entry: q.QQQ.spot },
    ...leg("Bull call spread", "AAPL", 10, 2),
    ...leg("Iron condor", "NVDA", 10, 2),
    ...leg("Bear put spread", "SPX", 100, 1),
    ...leg("Short strangle", "QQQ", 20, 1),
  ];
}

// ---------- hedges (each returns positions to book; never edits the input) ----------

/**
 * Shares (or MES futures for the SPX index) that move the symbol's delta to `target`.
 * With `pct`, hedge that share of the symbol's current delta instead (50 = half of the holding); it wins over `target`.
 */
export function deltaHedge(positions, market, sym, target = 0, { pct } = {}) {
  const d = portfolioGreeks(positions, market).bySym[sym]?.delta ?? 0;
  const goal = Number.isFinite(pct) ? d * (1 - pct / 100) : target;
  const q = market.quotes[sym];
  if (q.index) {
    const n = Math.round((goal - d) / FUTURE_MULT.MES);
    return n ? [{ kind: "future", sym, root: "MES", qty: n, entry: q.spot, group: "Delta hedge" }] : [];
  }
  const n = Math.round(goal - d);
  return n ? [{ kind: "equity", sym, qty: n, entry: q.spot, group: "Delta hedge" }] : [];
}

/** Largest gamma-hedge trade proposed, in contracts; larger targets are capped (and flagged by `capped`). */
export const MAX_GAMMA_CONTRACTS = 10000;

/**
 * ATM options on `sym` that move its gamma to `target`. Changes delta too: follow with deltaHedge.
 * With `budget` (dollars of premium), buy as many whole contracts as it pays for instead; it wins over `target`.
 */
export function gammaHedge(positions, market, sym, { target = 0, days = 30, right = "call", budget } = {}) {
  const g = portfolioGreeks(positions, market).bySym[sym]?.gamma ?? 0;
  const q = market.quotes[sym];
  const strike = roundStrike(q.spot, q.spot);
  const one = bs({ S: q.spot, K: strike, T: days / 365, vol: q.iv / 100, r: market.r, right });
  const perContract = one.gamma * OPTION_MULT;
  if (!perContract) return [];
  const byBudget = Number.isFinite(budget) && one.price > 0;
  const raw = byBudget ? Math.max(0, Math.floor(budget / (one.price * OPTION_MULT))) : Math.round((target - g) / perContract);
  const n = Math.max(-MAX_GAMMA_CONTRACTS, Math.min(MAX_GAMMA_CONTRACTS, raw));
  if (n !== raw) return [{ kind: "option", sym, right, strike, qty: n, days, iv: q.iv, entry: one.price, group: "Gamma hedge", capped: true }];
  return n ? [{ kind: "option", sym, right, strike, qty: n, days, iv: q.iv, entry: one.price, group: "Gamma hedge" }] : [];
}

/** ES / MES futures or SPY shares that move portfolio beta dollars to `target`. */
export function betaHedge(positions, market, instrument, target = 0) {
  const b = portfolioGreeks(positions, market).betaDollars;
  const q = market.quotes;
  if (instrument === "SPY") {
    const n = Math.round((target - b) / (q.SPY.spot * q.SPY.beta));
    return n ? [{ kind: "equity", sym: "SPY", qty: n, entry: q.SPY.spot, group: "Beta hedge" }] : [];
  }
  const unit = FUTURE_MULT[instrument] * q.SPX.spot * q.SPX.beta;
  const n = Math.round((target - b) / unit);
  return n ? [{ kind: "future", sym: "SPX", root: instrument, qty: n, entry: q.SPX.spot, group: "Beta hedge" }] : [];
}

// ---------- scenarios ----------

/** Deterministic stress rows at today's date (instant shock). */
export function stressTable(positions, market) {
  const rows = [
    ["SPX −20%", -0.2, 0],
    ["SPX −10%, IV +10", -0.1, 10],
    ["SPX −10%", -0.1, 0],
    ["SPX −5%", -0.05, 0],
    ["SPX +5%", 0.05, 0],
    ["SPX +10%", 0.1, 0],
  ];
  return rows.map(([label, move, ivShift]) => ({ label, move, ivShift, pnl: scenarioPnl(positions, market, { move, ivShift }) }));
}

/** P&L across beta-scaled market moves, `days` forward. */
export function payoffCurve(positions, market, { from = -0.3, to = 0.3, n = 121, days = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const move = from + ((to - from) * i) / (n - 1);
    return { move, pnl: scenarioPnl(positions, market, { move, days }) };
  });
}

/** Metric grid: rows = y values (IV shift in points, or days forward), cols = market moves. */
export function surfaceGrid(positions, market, { moves, ys, axis = "iv", metric = "pnl" }) {
  return ys.map((y) =>
    moves.map((move) => {
      const scen = axis === "iv" ? { move, ivShift: y, days: 0 } : { move, ivShift: 0, days: y };
      if (metric === "pnl") return scenarioPnl(positions, market, scen);
      const g = portfolioGreeks(positions, market, scen);
      return metric === "beta" ? g.betaDollars : g.gamma1pct;
    }),
  );
}

// ---------- Monte Carlo (one-factor, beta-correlated) ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/**
 * Simulated spot prices `days` ahead, under the same risk-neutral measure bs() prices with: every
 * name drifts at the risk-free rate, so a fairly priced option has zero expected P&L.
 * Market factor vol = SPX IV; each name's log return is loading x market + idiosyncratic noise, with
 * total vol equal to its IV. The loading is the name's beta, capped at IV / market vol when
 * beta x market vol would exceed the IV (the name then moves fully with the market at its own vol).
 */
export function simulate(market, { paths = 2000, days = 30, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  const h = days / 365;
  const sm = market.quotes.SPX.iv / 100;
  const syms = Object.keys(market.quotes);
  const spots = Object.fromEntries(syms.map((s) => [s, new Float64Array(paths)]));
  const param = syms.map((s) => {
    const { spot, beta, iv } = market.quotes[s];
    const vol = iv / 100;
    const loading = sm > 0 ? Math.sign(beta) * Math.min(Math.abs(beta), vol / sm) : 0;
    const idio = Math.max(vol * vol - loading * loading * sm * sm, 0);
    // Reason: the drift term makes E[S_T] = S·e^{rT}, matching bs(); -½σ²h is the Itô correction.
    const drift = (market.r - 0.5 * (loading * loading * sm * sm + idio)) * h;
    return { s, spot, beta: loading, idioSd: Math.sqrt(idio * h), drift };
  });
  const mSd = sm * Math.sqrt(h);
  const marketShock = new Float64Array(paths); // the market factor's log-return shock per path (no drift)
  for (let i = 0; i < paths; i++) {
    const m = mSd * gaussian(rand);
    marketShock[i] = m;
    for (const p of param) spots[p.s][i] = p.spot * Math.exp(p.beta * m + p.idioSd * gaussian(rand) + p.drift);
  }
  return { paths, days, spots, market: marketShock };
}

/**
 * Longest sound risk horizon for a book: the requested days, capped at the nearest option expiry (at least 1).
 * Past a leg's expiry, pnlPaths would value it on the horizon's spot instead of the spot at its own expiry.
 */
export function maxHorizon(positions, days) {
  const expiries = positions.filter((p) => p.kind === "option").map((p) => p.days);
  const cap = expiries.length ? Math.min(...expiries) : Number.POSITIVE_INFINITY;
  return Math.max(1, Math.min(Math.round(days) || 1, cap));
}

/**
 * P&L per simulated path, options repriced with the time left after `days` (keep days <= maxHorizon).
 * market.spotVol (IV points per 1% SPX move, default 0) shifts every option's IV with the path's market move:
 * -1 means IV rises 1 point for each 1% the market falls. It is an editable assumption, not a fitted surface.
 */
export function pnlPaths(positions, market, sim, days = sim.days) {
  const out = new Float64Array(sim.paths);
  const spotVol = Number(market.spotVol) || 0;
  const ivShift = (i) => (spotVol && sim.market ? spotVol * 100 * (Math.exp(sim.market[i]) - 1) : 0);
  for (const p of positions) {
    const col = sim.spots[p.sym];
    for (let i = 0; i < sim.paths; i++) out[i] += positionPnl(p, col[i], market, days, p.kind === "option" ? ivShift(i) : 0);
  }
  return out;
}

/** POP, VaR/CVaR 95 (as positive losses), mean, and a horizon Sortino with target 0 (no annualising). */
export function riskStats(pnl) {
  const n = pnl.length;
  const sorted = Float64Array.from(pnl).sort();
  const k = Math.max(1, Math.round(0.05 * n));
  let tail = 0;
  for (let i = 0; i < k; i++) tail += sorted[i];
  let sum = 0;
  let down = 0;
  let wins = 0;
  for (const x of pnl) {
    sum += x;
    if (x > 0) wins += 1;
    if (x < 0) down += x * x;
  }
  const mean = sum / n;
  const downsideDev = Math.sqrt(down / n);
  return {
    mean,
    pop: wins / n,
    var95: -sorted[k - 1],
    cvar95: -tail / k,
    downsideDev,
    sortino: downsideDev === 0 ? Number.POSITIVE_INFINITY : mean / downsideDev,
    min: sorted[0],
    max: sorted[n - 1],
  };
}

// ---------- joint hedge optimizer ----------

export const DEFAULT_OPT = {
  paths: 2000,
  days: 30,
  seed: 1,
  futRoot: "MES",
  optSym: "SPY",
  optRight: "put",
  optDays: 30,
  limits: { fut: 400, opt: 200 },
  weights: { beta: 1, gamma: 0.5, vega: 0.25, cvar: 1, cost: 0.25 },
  costs: { fut: 2, opt: 5 },
};

/**
 * Integer coordinate search over two hedge instruments (index futures, ATM options) minimising
 *   w_β·|β$|/|β$₀| + w_Γ·|Γ1%|/|Γ1%₀| + w_V·|vega|/|vega₀| + w_C·CVaR/|CVaR₀| + w_cost·cost/|CVaR₀|
 * Each term is relative to the unhedged book, so 1.0 means "as before". Greeks and per-path P&L are
 * linear in the hedge quantities, so every candidate is scored from precomputed unit vectors on the
 * same simulated paths (common random numbers).
 */
export function optimizeHedge(positions, market, opts = {}) {
  const o = {
    ...DEFAULT_OPT,
    ...opts,
    limits: { ...DEFAULT_OPT.limits, ...opts.limits },
    weights: { ...DEFAULT_OPT.weights, ...opts.weights },
    costs: { ...DEFAULT_OPT.costs, ...opts.costs },
  };
  // Reason: a negative weight would reward more risk, so "never worse than doing nothing" holds only for w >= 0.
  for (const k of Object.keys(o.weights)) o.weights[k] = Math.max(0, Number(o.weights[k]) || 0);
  // The horizon can't pass the nearest expiry of the book or of the hedge option itself.
  o.days = maxHorizon([...positions, { kind: "option", days: o.optDays }], o.days);
  const q = market.quotes;
  const strike = roundStrike(q[o.optSym].spot, q[o.optSym].spot);
  const optEntry = bs({ S: q[o.optSym].spot, K: strike, T: o.optDays / 365, vol: q[o.optSym].iv / 100, r: market.r, right: o.optRight }).price;
  const make = [
    (n) => ({ kind: "future", sym: "SPX", root: o.futRoot, qty: n, entry: q.SPX.spot, group: "Optimizer" }),
    (n) => ({ kind: "option", sym: o.optSym, right: o.optRight, strike, qty: n, days: o.optDays, iv: q[o.optSym].iv, entry: optEntry, group: "Optimizer" }),
  ];
  const limits = [o.limits.fut, o.limits.opt];
  const costs = [o.costs.fut, o.costs.opt];

  const sim = simulate(market, { paths: o.paths, days: o.days, seed: o.seed });
  const base = pnlPaths(positions, market, sim, o.days);
  const units = make.map((f) => pnlPaths([f(1)], market, sim, o.days));
  const g0 = portfolioGreeks(positions, market);
  const gu = make.map((f) => portfolioGreeks([f(1)], market));
  const pnl = new Float64Array(o.paths);

  const metrics = (x) => {
    pnl.set(base);
    x.forEach((n, k) => {
      if (n) for (let i = 0; i < o.paths; i++) pnl[i] += n * units[k][i];
    });
    const stats = riskStats(pnl);
    const lin = (key) => g0[key] + x.reduce((s, n, k) => s + n * gu[k][key], 0);
    return {
      betaDollars: lin("betaDollars"),
      gamma1pct: lin("gamma1pct"),
      vega: lin("vega"),
      theta: lin("theta"),
      cvar95: stats.cvar95,
      pop: stats.pop,
      mean: stats.mean,
      cost: x.reduce((s, n, k) => s + Math.abs(n) * costs[k], 0),
    };
  };
  const m0 = metrics([0, 0]);
  const scale = {
    beta: Math.max(Math.abs(m0.betaDollars), 1000),
    gamma: Math.max(Math.abs(m0.gamma1pct), 1),
    vega: Math.max(Math.abs(m0.vega), 1),
    cvar: Math.max(Math.abs(m0.cvar95), 1),
  };
  const w = o.weights;
  const score = (m) =>
    (w.beta * Math.abs(m.betaDollars)) / scale.beta +
    (w.gamma * Math.abs(m.gamma1pct)) / scale.gamma +
    (w.vega * Math.abs(m.vega)) / scale.vega +
    (w.cvar * m.cvar95) / scale.cvar +
    (w.cost * m.cost) / scale.cvar;

  let x = [0, 0];
  let best = score(m0);
  let evaluations = 1;
  const top = Math.max(...limits);
  for (let step = 2 ** Math.floor(Math.log2(Math.max(1, top / 4))); step >= 1; step = Math.floor(step / 2)) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let k = 0; k < x.length; k++) {
        for (const dir of [1, -1]) {
          const cand = [...x];
          cand[k] = Math.max(-limits[k], Math.min(limits[k], cand[k] + dir * step));
          if (cand[k] === x[k]) continue;
          const s = score(metrics(cand));
          evaluations += 1;
          if (s < best - 1e-12) {
            best = s;
            x = cand;
            improved = true;
          }
        }
      }
    }
  }
  const after = metrics(x);
  return {
    x,
    trades: x.flatMap((n, k) => (n ? [make[k](n)] : [])),
    before: { ...m0, objective: score(m0) },
    after: { ...after, objective: best },
    evaluations,
    options: o,
  };
}
