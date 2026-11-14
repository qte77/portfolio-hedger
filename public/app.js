// app.js — Portfolio Hedger UI. All maths lives in engine.js; this file owns state, views and charts.
import {
  applyNetPrice,
  comboRollups,
  legMark,
  rollCombo,
  rollLeg,
  OPTION_MULT,
  FUTURE_MULT,
  MAX_GAMMA_CONTRACTS,
  NEAR_EXPIRY_DAYS,
  TEMPLATES,
  betaHedge,
  bs,
  buildStrategy,
  cashRequirement,
  defaultMarket,
  deltaHedge,
  examplePortfolio,
  gammaHedge,
  maxHorizon,
  netPremium,
  parseLedger,
  optimizeHedge,
  payoffCurve,
  pnlPaths,
  portfolioGreeks,
  positionGreeks,
  positionPnl,
  riskStats,
  roundStrike,
  scenarioPnl,
  serializeLedger,
  simulate,
  stressTable,
  strikeStep,
  surfaceGrid,
} from "./engine.js";
import { STORAGE_KEY, applyTheme, isThemeMode } from "./vendor/ui-kit/theme.js";

// ---------- theme: dark is the dashboard default unless the URL, a stored choice or the host says otherwise ----------
{
  const url = new URLSearchParams(location.search).get("theme");
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    /* storage blocked */
  }
  if (!isThemeMode(url) && !isThemeMode(stored)) applyTheme(window.__hostTheme || "dark", { persist: false });
}

// ---------- state ----------
const STORE = "portfolio-hedger:v1";
const $ = (id) => document.getElementById(id);
const HEDGE_GROUPS = new Set(["Delta hedge", "Gamma hedge", "Beta hedge", "Optimizer"]);

function freshState() {
  const market = defaultMarket();
  const s = { market, positions: [], nextId: 1, nextGid: 1 };
  addPositions(s, examplePortfolio(market));
  return s;
}

function addPositions(s, list) {
  const gids = new Map();
  for (const p of list) {
    const key = p.group ?? `single-${s.nextId}`;
    if (!gids.has(key)) gids.set(key, s.nextGid++);
    s.positions.push({ ...p, id: s.nextId++, gid: gids.get(key) });
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s?.market && Array.isArray(s.positions) ? s : null;
  } catch (_) {
    return null;
  }
}

const state = load() ?? freshState();
let version = 0;

function commit() {
  version += 1;
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch (_) {
    /* per-viewer convenience only */
  }
  render();
}

// ---------- formatting ----------
const MINUS = "−";
const sign = (v) => (v < 0 ? MINUS : "");
function money(v, { compact = true, plus = false } = {}) {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "—";
  const a = Math.abs(v);
  let body;
  if (compact && a >= 1e6) body = `${(a / 1e6).toFixed(2)}M`;
  else if (compact && a >= 1e4) body = `${(a / 1e3).toFixed(1)}k`;
  else body = a.toLocaleString("en-US", { maximumFractionDigits: a < 100 ? 2 : 0 });
  return `${v < 0 ? MINUS : plus && v > 0 ? "+" : ""}$${body}`;
}
function num(v, d = 2, plus = false) {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "—";
  const body = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${v < 0 ? MINUS : plus && v > 0 ? "+" : ""}${body}`;
}
const pct = (v, d = 1) => `${num(v * 100, d, true)}%`;
const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const syms = () => Object.keys(state.market.quotes);
const tradeable = () => syms().filter((s) => !state.market.quotes[s].index);

function describe(p) {
  if (p.kind === "equity") return `${p.sym} shares`;
  if (p.kind === "future") return `${p.root} future (${FUTURE_MULT[p.root]} × SPX)`;
  return `${p.sym} ${num(p.strike, p.strike % 1 ? 1 : 0)} ${p.right} · ${p.days}d · IV ${num(p.iv, 1)}`;
}
function tradeText(p) {
  const side = p.qty > 0 ? "Buy" : "Sell";
  const n = Math.abs(p.qty).toLocaleString("en-US");
  if (p.kind === "equity") return `${side} ${n} ${p.sym} at ${money(p.entry, { compact: false })}`;
  if (p.kind === "future") return `${side} ${n} ${p.root} at ${num(p.entry, 0)}`;
  return `${side} ${n} ${p.sym} ${num(p.strike, 0)} ${p.right}${Math.abs(p.qty) > 1 ? "s" : ""} (${p.days}d) at ${money(p.entry, { compact: false })}`;
}
const markOf = (p) => legMark(p, state.market);

// ---------- cash account (#3): settings live on the state, so older saved states load with the defaults ----------
function account() {
  state.account ??= { cash: null, futuresMargin: { ES: null, MES: null } };
  return state.account;
}
const cashOf = () => cashRequirement(state.positions, state.market, account());
const FLAG_TEXT = {
  "naked-call": "not allowed: uncovered call",
  "short-stock": "not allowed: short stock",
  covered: "covered by shares",
  spread: "spread",
  "futures-account": "futures account",
  "futures-margin-unset": "margin not set",
  "spread-margin-account": "needs margin account",
};
const WARN_FLAGS = new Set(["naked-call", "short-stock", "spread-margin-account"]);
// Reason: an engine flag without a label here must still read as itself, never as "undefined".
const flagTags = (flags) => flags.map((f) => `<span class="tag${WARN_FLAGS.has(f) ? " warn" : ""}">${FLAG_TEXT[f] ?? f}</span>`).join(" ");

// ---------- shared UI helpers ----------
const table = (head, rows, numCols = []) =>
  `<div class="table-wrap"><table><thead><tr>${head
    .map((h, i) => `<th scope="col"${numCols.includes(i) ? ' class="num"' : ""}>${h}</th>`)
    .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

function tiles(el, items) {
  el.innerHTML = items
    .map(
      ([label, value, sub, tone]) =>
        `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-num ${tone ?? ""}">${value}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ""}</div>`,
    )
    .join("");
}

function fillSelect(el, values, selected, labels) {
  const cur = selected ?? el.value;
  el.innerHTML = values.map((v, i) => `<option value="${esc(v)}">${esc(labels ? labels[i] : v)}</option>`).join("");
  if (values.includes(cur)) el.value = cur;
}

const tip = $("tip");
function showTip(html, ev) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
function hideTip() {
  tip.hidden = true;
}

// ---------- charts (plain SVG, sized to the container so text stays at real pixel sizes) ----------
function niceTicks(min, max, count = 5) {
  const [lo, hi] = min === max ? [min - 1, max + 1] : [min, max];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function size(el, h = 300) {
  const w = Math.max(280, Math.floor(el.clientWidth || 600));
  return { w, h: w < 480 ? Math.round(h * 0.8) : h };
}

/** Line chart with one x scale and one y scale, a zero line, crosshair tooltip and end labels. */
function lineChart(el, { series, xFmt, yFmt, xTitle, height = 300, markers = [] }) {
  const { w, h } = size(el, height);
  const m = { l: 64, r: 16, t: 12, b: 40 };
  const xs = series[0].pts.map((p) => p.x);
  const ys = series.flatMap((s) => s.pts.map((p) => p.y)).concat([0]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const padY = (y1 - y0 || 1) * 0.08;
  y0 -= padY;
  y1 += padY;
  const X = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (w - m.l - m.r);
  const Y = (v) => h - m.b - ((v - y0) / (y1 - y0 || 1)) * (h - m.t - m.b);
  const yt = niceTicks(y0, y1, h < 260 ? 4 : 5);
  const xt = niceTicks(x0, x1, w < 480 ? 4 : 6);
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
  el.innerHTML = `
    <div class="legend">${series.map((s) => `<span><i class="${s.legend}"></i>${esc(s.name)}</span>`).join("")}</div>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(series.map((s) => s.name).join(" and "))} by ${esc(xTitle)}">
      <g class="grid">${yt.map((v) => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join("")}</g>
      ${yt.map((v) => `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`).join("")}
      ${xt.map((v) => `<text x="${X(v)}" y="${h - m.b + 18}" text-anchor="middle">${xFmt(v)}</text>`).join("")}
      <text x="${(m.l + w - m.r) / 2}" y="${h - 4}" text-anchor="middle">${esc(xTitle)}</text>
      <line class="zero" x1="${m.l}" x2="${w - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>
      ${markers.map((mk) => `<line class="marker" x1="${X(mk.x)}" x2="${X(mk.x)}" y1="${m.t}" y2="${h - m.b}"/><text x="${X(mk.x) + 4}" y="${m.t + 12}" class="lbl-strong">${esc(mk.label)}</text>`).join("")}
      ${series.map((s) => `<path class="${s.cls}" d="${path(s.pts)}"/>`).join("")}
      <line class="cross" id="${el.id}-x" x1="0" x2="0" y1="${m.t}" y2="${h - m.b}" visibility="hidden"/>
      ${series.map((s, i) => `<circle class="${s.dot}" id="${el.id}-d${i}" r="5" cx="0" cy="0" visibility="hidden"/>`).join("")}
      <rect class="hit" x="${m.l}" y="${m.t}" width="${w - m.l - m.r}" height="${h - m.t - m.b}"/>
    </svg>`;
  const hit = el.querySelector(".hit");
  const cross = el.querySelector(`#${el.id}-x`);
  const move = (ev) => {
    const box = el.querySelector("svg").getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * w;
    const xv = x0 + ((px - m.l) / (w - m.l - m.r)) * (x1 - x0);
    const i = Math.max(0, Math.min(xs.length - 1, Math.round(((xv - x0) / (x1 - x0)) * (xs.length - 1))));
    cross.setAttribute("x1", X(xs[i]));
    cross.setAttribute("x2", X(xs[i]));
    cross.setAttribute("visibility", "visible");
    series.forEach((s, k) => {
      const d = el.querySelector(`#${el.id}-d${k}`);
      d.setAttribute("cx", X(s.pts[i].x));
      d.setAttribute("cy", Y(s.pts[i].y));
      d.setAttribute("visibility", "visible");
    });
    showTip(`${xFmt(xs[i], true)}<br>${series.map((s) => `${esc(s.name)}: <b>${yFmt(s.pts[i].y, true)}</b>`).join("<br>")}`, ev);
  };
  const leave = () => {
    cross.setAttribute("visibility", "hidden");
    series.forEach((_, k) => el.querySelector(`#${el.id}-d${k}`).setAttribute("visibility", "hidden"));
    hideTip();
  };
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", leave);
}

function histogram(el, pnl, stats) {
  const { w, h } = size(el, 280);
  const m = { l: 56, r: 16, t: 20, b: 40 };
  const bins = w < 480 ? 24 : 40;
  const lo = stats.min;
  const hi = stats.max;
  const step = (hi - lo || 1) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of pnl) counts[Math.min(bins - 1, Math.floor((v - lo) / step))] += 1;
  const maxC = Math.max(...counts);
  const X = (v) => m.l + ((v - lo) / (hi - lo || 1)) * (w - m.l - m.r);
  const Y = (c) => h - m.b - (c / maxC) * (h - m.t - m.b);
  const bw = (w - m.l - m.r) / bins;
  const n = pnl.length;
  const yt = niceTicks(0, (maxC / n) * 100, 4);
  const xt = niceTicks(lo, hi, w < 480 ? 4 : 6);
  const bars = counts
    .map((c, i) => {
      const a = lo + i * step;
      const mid = a + step / 2;
      const y = Y(c);
      const tone = mid < 0 ? "loss" : "gain";
      return `<rect class="${tone}" x="${(X(a) + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${(h - m.b - y).toFixed(1)}" rx="2" data-i="${i}"/>`;
    })
    .join("");
  const varX = -stats.var95;
  el.innerHTML = `
    <div class="legend"><span><i class="sw loss"></i>Loss paths</span><span><i class="sw gain"></i>Gain paths</span></div>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Histogram of simulated P&L">
      <g class="grid">${yt.map((v) => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y((v / 100) * n)}" y2="${Y((v / 100) * n)}"/>`).join("")}</g>
      ${yt.map((v) => `<text x="${m.l - 8}" y="${Y((v / 100) * n) + 4}" text-anchor="end">${num(v, v % 1 ? 1 : 0)}%</text>`).join("")}
      ${xt.map((v) => `<text x="${X(v)}" y="${h - m.b + 18}" text-anchor="middle">${money(v)}</text>`).join("")}
      <text x="${(m.l + w - m.r) / 2}" y="${h - 4}" text-anchor="middle">P&amp;L at the horizon (share of paths per bin)</text>
      ${bars}
      ${lo < 0 && hi > 0 ? `<line class="zero" x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${h - m.b}"/>` : ""}
      ${varX > lo ? `<line class="marker" x1="${X(varX)}" x2="${X(varX)}" y1="${m.t - 8}" y2="${h - m.b}"/><text class="lbl-strong" x="${X(varX) + 4}" y="${m.t + 4}">VaR 95</text>` : ""}
    </svg>`;
  for (const r of el.querySelectorAll("rect[data-i]")) {
    const i = Number(r.dataset.i);
    const show = (ev) =>
      showTip(`${money(lo + i * step)} to ${money(lo + (i + 1) * step)}<br><b>${num((counts[i] / n) * 100, 1)}%</b> of paths (${counts[i]})`, ev);
    r.addEventListener("pointermove", show);
    r.addEventListener("pointerdown", show);
    r.addEventListener("pointerleave", hideTip);
  }
}

function heatmap(el, { grid, moves, ys, yFmt, vFmt, title }) {
  const { w } = size(el, 0);
  const narrow = w < 560;
  const m = { l: narrow ? 44 : 64, r: 8, t: 8, b: 44 };
  const cols = moves.length;
  const cw = (w - m.l - m.r) / cols;
  const ch = narrow ? 30 : 36;
  const h = m.t + ys.length * ch + m.b;
  const maxAbs = Math.max(1e-9, ...grid.flat().map(Math.abs));
  const every = narrow ? 4 : 2;
  const cells = grid
    .map((row, r) =>
      row
        .map((v, c) => {
          const share = Math.round((Math.abs(v) / maxAbs) * 85);
          const tone = v >= 0 ? "--data-positive" : "--data-negative";
          const x = m.l + c * cw;
          const y = m.t + r * ch;
          const text = cw > 40 ? `<text class="cell-txt" x="${x + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle">${vFmt(v)}</text>` : "";
          return `<g data-r="${r}" data-c="${c}"><rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="2" data-tone="${tone}" data-share="${share}"/>${text}</g>`;
        })
        .join(""),
    )
    .join("");
  el.innerHTML = `
    <div class="legend"><span><i class="sw loss"></i>Loss</span><span><i class="sw gain"></i>Gain</span><span>Strongest cell: ${vFmt(maxAbs)} (absolute)</span></div>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
      ${cells}
      ${ys.map((y, r) => `<text x="${m.l - 8}" y="${m.t + r * ch + ch / 2 + 4}" text-anchor="end">${yFmt(y)}</text>`).join("")}
      ${moves.map((mv, c) => (c % every === 0 || c === cols - 1 ? `<text x="${m.l + c * cw + cw / 2}" y="${m.t + ys.length * ch + 18}" text-anchor="middle">${pct(mv, 0)}</text>` : "")).join("")}
      <text x="${(m.l + w - m.r) / 2}" y="${h - 4}" text-anchor="middle">SPX move (each name moves by its beta)</text>
    </svg>`;
  // Fill through CSSOM, not a style attribute, so the strict CSP (style-src 'self') holds.
  for (const rect of el.querySelectorAll("rect[data-tone]")) {
    rect.style.fill = `color-mix(in oklab, var(${rect.dataset.tone}) ${rect.dataset.share}%, var(--surface))`;
  }
  for (const g of el.querySelectorAll("g[data-r]")) {
    const r = Number(g.dataset.r);
    const c = Number(g.dataset.c);
    const show = (ev) => showTip(`SPX ${pct(moves[c], 1)} · ${yFmt(ys[r], true)}<br><b>${vFmt(grid[r][c], true)}</b>`, ev);
    g.addEventListener("pointermove", show);
    g.addEventListener("pointerdown", show);
    g.addEventListener("pointerleave", hideTip);
  }
}

// ---------- cached risk numbers (recomputed only when the book or quotes change) ----------
const cache = new Map();
function cached(key, fn) {
  const k = `${version}|${key}`;
  if (!cache.has(k)) {
    if (cache.size > 40) cache.clear();
    cache.set(k, fn());
  }
  return cache.get(k);
}
const QUICK = { paths: 1000, days: 30, seed: 11 };
/** CVaR 95 on a shared quick simulation; `days` must already be capped by maxHorizon for both sides of a comparison. */
function quickCvar(positions, days) {
  const sim = cached(`quick-sim|${days}`, () => simulate(state.market, { ...QUICK, days }));
  return riskStats(pnlPaths(positions, state.market, sim, days)).cvar95;
}
function nearestExpiry(positions) {
  const d = positions.filter((p) => p.kind === "option").map((p) => p.days);
  return d.length ? Math.min(...d) : 0;
}

// ---------- views ----------
function renderDashboard() {
  const { market, positions } = state;
  const g = portfolioGreeks(positions, market);
  const prem = netPremium(positions);
  tiles($("kpis"), [
    [
      "Beta dollars",
      money(g.betaDollars),
      `≈ ${num(g.betaDollars / market.quotes.SPY.spot, 0)} SPY-weighted deltas · ${num(g.esEquivalent, 2)} ES contracts`,
    ],
    ["Gamma, 1% SPX move", money(g.gamma1pct, { plus: true }), "½·Γ·(1% move)²: convexity P&L of a 1% move either way", cls(g.gamma1pct)],
    ["Vega", money(g.vega, { plus: true }), "per 1 vol point, all names"],
    ["Theta", money(g.theta, { plus: true }), "per calendar day", cls(g.theta)],
    ["Option premium", money(Math.abs(prem)), prem > 0 ? "paid at entry: a cost, not a return" : prem < 0 ? "received at entry: not yet profit" : "no options"],
    (() => {
      const unrealized = positions.reduce((t, p) => t + positionPnl(p, market.quotes[p.sym].spot, market), 0);
      const realized = (state.history ?? []).reduce((t, h) => t + h.realized, 0);
      const [open, done] = [Math.round(unrealized), Math.round(realized)];
      return ["P&L vs model", money(open + done, { plus: true }), `open ${money(open, { plus: true })} · realized from rolls ${money(done, { plus: true })}`, cls(open + done)];
    })(),
    (() => {
      const c = cashOf();
      const bits = [c.buyingPower === null ? "set account cash on Positions for buying power" : `buying power left ${money(c.buyingPower, { plus: true })} of ${money(c.cash)}`];
      if (c.notAllowed) bits.push(`${c.notAllowed} not allowed in a cash account`);
      if (c.positions.some((p) => p.flags.includes("futures-margin-unset"))) bits.push("futures margin not set, counted as $0");
      return ["Cash needed", money(c.total.need), bits.join(" · "), c.buyingPower !== null && c.buyingPower < 0 ? "neg" : ""];
    })(),
    ["Positions", String(positions.length), `${g.counts.option} option legs · ${g.counts.equity} stock/ETF · ${g.counts.future} futures`],
  ]);

  const dte = nearestExpiry(positions);
  const now = payoffCurve(positions, market, { days: 0 });
  const series = [{ name: "Today", cls: "s-now", dot: "dot-now", legend: "now", pts: now.map((p) => ({ x: p.move, y: p.pnl })) }];
  if (dte > 0)
    series.push({
      name: `At nearest expiry (${dte}d)`,
      cls: "s-hz",
      dot: "dot-hz",
      legend: "hz",
      pts: payoffCurve(positions, market, { days: dte }).map((p) => ({ x: p.move, y: p.pnl })),
    });
  lineChart($("payoff"), {
    series,
    xTitle: "SPX move",
    xFmt: (v, long) => (long ? `SPX ${pct(v, 1)} (${num(market.quotes.SPX.spot * (1 + v), 0)})` : pct(v, 0)),
    yFmt: (v) => money(v),
  });

  // A share of beta dollars is meaningless once the book is (nearly) beta-flat: show "—" below 5% of gross $ delta.
  const grossDollarDelta = Object.values(g.bySym).reduce((t, v) => t + Math.abs(v.dollarDelta), 0);
  const shareOk = Math.abs(g.betaDollars) >= 0.05 * grossDollarDelta && Math.abs(g.betaDollars) > 0;
  $("stress").innerHTML = table(
    ["Scenario", "P&L", "Share of beta $"],
    stressTable(positions, market).map(
      (r) =>
        `<tr><td>${esc(r.label)}</td><td class="num ${cls(r.pnl)}">${money(r.pnl, { plus: true })}</td><td class="num">${shareOk ? pct(r.pnl / Math.abs(g.betaDollars), 1) : "—"}</td></tr>`,
    ),
    [1, 2],
  );

  const rows = Object.entries(g.bySym).map(
    ([s, v]) =>
      `<tr><td>${esc(s)}</td><td class="num">${num(market.quotes[s].spot, 2)}</td><td class="num">${num(v.delta, 1)}</td><td class="num">${money(v.dollarDelta)}</td><td class="num">${money(v.betaDollars)}</td><td class="num">${num(v.gamma, 3)}</td><td class="num">${money(v.vega)}</td><td class="num ${cls(v.theta)}">${money(v.theta)}</td></tr>`,
  );
  $("greeks-table").innerHTML = rows.length
    ? table(["Underlying", "Spot", "Delta", "$ delta", "Beta $", "Gamma", "Vega", "Theta/day"], rows, [1, 2, 3, 4, 5, 6, 7])
    : `<p class="caption">The ledger is empty. Add positions on the Positions or Strategy builder tab.</p>`;
}

function renderPositions() {
  const { market, positions } = state;
  const history = state.history ?? [];
  const rollups = new Map(comboRollups(positions, market, history).map((r) => [r.gid, r]));
  const cash = cashOf();
  const comboCollateral = (gid) => positions.reduce((t, p, i) => t + (p.gid === gid ? cash.positions[i].collateral : 0), 0);
  // Subtotal row after each combo with 2+ legs, or with rolls recorded.
  const subtotal = (gid) => {
    const r = rollups.get(gid);
    if (!r || (r.legs < 2 && !r.realized)) return "";
    // Whole-combo roll: shift every option leg's strikes and/or set a new expiry in one step.
    const hasOptions = positions.some((p) => p.gid === gid && p.kind === "option");
    const roll = hasOptions
      ? `<span class="combo-roll">Roll combo: strikes <input type="number" step="1" value="0" data-roll-shift="${gid}" aria-label="Shift all strikes of ${esc(r.group ?? "combo")} by"> days <input type="number" step="1" min="0" placeholder="same" data-roll-days="${gid}" aria-label="New days to expiry for ${esc(r.group ?? "combo")}"> <button type="button" class="ghost" data-roll="${gid}">Roll</button></span>`
      : "";
    return `<tr class="subtotal"><td>${esc(r.group ?? "Combo")} subtotal <span class="tag">${r.legs} legs</span></td>
      <td colspan="4" class="num">${roll}${r.realized ? ` realized from rolls <b class="${cls(r.realized)}">${money(r.realized, { plus: true })}</b>` : ""}</td>
      <td class="num">${money(r.netEntry, { compact: false })}</td><td class="num">${money(r.netMark, { compact: false })}</td>
      <td class="num ${cls(r.unrealized)}">${money(r.unrealized, { plus: true })}</td><td class="num">${num(r.delta, 1)}</td><td class="num">${money(comboCollateral(gid), { compact: false })}</td><td></td></tr>`;
  };
  let last = null;
  const rows = positions.map((p, i) => {
    const g = positionGreeks(p, market);
    const c = cash.positions[i];
    const pl = positionPnl(p, market.quotes[p.sym].spot, market);
    const start = last !== null && p.gid !== last ? " group-start" : "";
    last = p.gid;
    const endOfGroup = positions[i + 1]?.gid !== p.gid;
    const tag = p.group ? `<span class="tag">${esc(p.group)}</span>` : "";
    const name = p.kind === "option" ? `${p.sym} ${p.right}` : describe(p);
    // Strike, days and IV are editable per option leg, so a real fill or a roll keeps the leg's combo tag.
    const optField = (field, step, value) =>
      p.kind === "option"
        ? `<td class="num"><input type="number" step="${step}" value="${value}" data-id="${p.id}" data-field="${field}" aria-label="${field} for ${esc(describe(p))}"></td>`
        : `<td class="num">—</td>`;
    return `<tr class="${start}">
      <td>${esc(name)} ${tag}</td>
      ${optField("strike", 0.5, p.strike)}
      ${optField("days", 1, p.days)}
      ${optField("iv", 0.5, p.iv)}
      <td class="num"><input type="number" step="1" value="${p.qty}" data-id="${p.id}" data-field="qty" aria-label="Quantity for ${esc(describe(p))}"></td>
      <td class="num"><input type="number" step="0.01" value="${+p.entry.toFixed(2)}" data-id="${p.id}" data-field="entry" aria-label="Entry for ${esc(describe(p))}"></td>
      <td class="num">${num(markOf(p), 2)}</td>
      <td class="num ${cls(pl)}">${money(pl, { plus: true })}</td>
      <td class="num" title="Unrounded: ${g.delta}">${num(g.delta, 1)}</td>
      <td class="num" title="${esc(`paid ${money(c.paid, { compact: false })} · received ${money(c.received, { compact: false })} · collateral ${money(c.collateral, { compact: false })} · cash needed ${money(c.need, { compact: false })}`)}">${c.collateral || c.flags.length ? `${money(c.collateral, { compact: false })} ${flagTags(c.flags)}` : "—"}</td>
      <td><button type="button" class="ghost danger" data-remove="${p.id}" aria-label="Remove ${esc(describe(p))}">Remove</button></td></tr>${endOfGroup ? subtotal(p.gid) : ""}`;
  });
  const rolls = history.length
    ? `<h3 class="subhead">Roll history</h3>${table(
        ["Date", "Combo", "From", "To", "Realized"],
        history.map(
          (h) =>
            `<tr><td>${esc(h.at)}</td><td>${esc(h.group ?? "Single leg")}</td><td class="num">${num(h.from.strike, 1)} · ${h.from.days}d</td><td class="num">${num(h.to.strike, 1)} · ${h.to.days}d</td><td class="num ${cls(h.realized)}">${money(h.realized, { plus: true, compact: false })}</td></tr>`,
        ),
        [2, 3, 4],
      )}`
    : "";
  $("ledger").innerHTML = positions.length
    ? `${table(["Instrument", "Strike", "Days", "IV", "Qty", "Entry", "Mark (model)", "P&L vs model", "Delta", "Collateral", ""], rows, [1, 2, 3, 4, 5, 6, 7, 8, 9])}
       <p class="caption">Mark is the Black–Scholes price on the example quotes, not a market quote, so a real fill can show a paper gain or loss at once. Changing a strike or days rolls the leg: the old leg's P&L is realized at its model mark and recorded on the combo, and the new leg opens at its model mark (edit Entry to your real fill). Deltas are rounded per row; totals use unrounded values. Collateral is the cash a cash account holds against the position (hover for paid, received and cash needed); the rules are on the Method page.</p>${rolls}`
    : `<p class="caption">No positions. Load the example book, or add stocks, strategies, option legs or hedges.</p>`;

  $("market").innerHTML = table(
    ["Symbol", "Spot", "Beta", "IV"],
    syms().map((s) => {
      const q = market.quotes[s];
      return `<tr><td>${esc(s)}${q.index ? ' <span class="tag">index</span>' : ""}</td>
        <td class="num"><input type="number" step="0.01" min="0.01" value="${q.spot}" data-sym="${esc(s)}" data-q="spot" aria-label="${esc(s)} spot"></td>
        <td class="num"><input type="number" step="0.05" value="${q.beta}" data-sym="${esc(s)}" data-q="beta" aria-label="${esc(s)} beta" ${s === "SPX" ? "disabled" : ""}></td>
        <td class="num"><input type="number" step="0.5" min="1" value="${q.iv}" data-sym="${esc(s)}" data-q="iv" aria-label="${esc(s)} implied volatility"></td></tr>`;
    }),
    [1, 2, 3],
  );
  if (document.activeElement !== $("rate")) $("rate").value = +(market.r * 100).toFixed(4);
  if (document.activeElement !== $("spotvol")) $("spotvol").value = Number(market.spotVol) || 0;
  fillSelect($("stock-sym"), tradeable());
  fillSelect($("leg-sym"), syms(), $("leg-sym").value || "SPY");
  fillLegCombos();
  if (!$("leg-strike").value) syncLegDefaults();
  if (!$("stock-entry").value) $("stock-entry").value = market.quotes[$("stock-sym").value].spot;
  renderCash(cash);
}

function renderCash(c) {
  const a = account();
  for (const [id, v] of [["acct-cash", a.cash], ["margin-es", a.futuresMargin.ES], ["margin-mes", a.futuresMargin.MES]]) {
    if (document.activeElement !== $(id)) $(id).value = v ?? "";
  }
  const t = c.total;
  const row = (label, v, tone = "") => `<span>${label}</span><span class="v ${tone}">${v}</span>`;
  const notes = [];
  if (c.notAllowed) notes.push(`${c.notAllowed} position${c.notAllowed > 1 ? "s are" : " is"} not allowed in a cash account (an uncovered short call or short stock) and add${c.notAllowed > 1 ? "" : "s"} no collateral here.`);
  if (c.positions.some((p) => p.flags.includes("futures-account"))) notes.push("Futures need a futures-enabled margin account, not a cash account.");
  if (c.positions.some((p) => p.flags.includes("futures-margin-unset"))) notes.push("Futures initial margin is not set, so it counts as $0. Enter your broker's figure.");
  if (c.positions.some((p) => p.flags.includes("spread"))) notes.push("Spreads hold their maximum loss, which assumes your broker allows spreads in this account.");
  if (c.positions.some((p) => p.flags.includes("spread-margin-account"))) notes.push("Spreads on SPY, QQQ or single stocks need a margin account: exchange rules allow spreads in a cash account only when built from European-style, cash-settled index options such as SPX.");
  $("cash-summary").innerHTML = `<div class="cash-sum">
      ${row("Paid (stock and long options, at entry)", money(t.paid, { compact: false }))}
      ${row("Premium received (short options)", money(-t.received, { compact: false }))}
      ${row("Collateral held", money(t.collateral, { compact: false }))}
      ${row("<b>Cash needed</b>", `<b>${money(t.need, { compact: false })}</b>`)}
      ${row("Buying power left", c.buyingPower === null ? "set account cash" : money(c.buyingPower, { compact: false, plus: true }), cls(c.buyingPower ?? 0))}
    </div>${notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}`;
  const P = state.positions;
  $("assignment").innerHTML = c.assignment.length
    ? table(
        ["Short leg", "Days", "Why listed", "Assignment needs"],
        c.assignment.map(
          (x) =>
            `<tr><td>${esc(describe(P[x.index]))} × ${x.contracts}</td><td class="num">${x.days}</td><td>${x.itm ? "in the money" : "near expiry"}</td><td class="num">${x.right === "put" ? `${money(x.cash, { compact: false })} cash for ${x.contracts * OPTION_MULT} shares` : `${x.shares.toLocaleString("en-US")} ${esc(x.sym)} shares to deliver`}</td></tr>`,
        ),
        [1, 3],
      )
    : `<p class="caption">No short leg is in the money or within ${NEAR_EXPIRY_DAYS} days of expiry.</p>`;
}

function strategyInputs() {
  return {
    name: $("st-name").value,
    sym: $("st-sym").value,
    spot: Number($("st-spot").value),
    width: Number($("st-width").value),
    qty: Math.max(1, Math.round(Number($("st-qty").value) || 1)),
    days: Math.max(1, Math.round(Number($("st-days").value) || 30)),
    iv: Number($("st-iv").value),
  };
}
function syncStrategyDefaults() {
  const q = state.market.quotes[$("st-sym").value];
  $("st-spot").value = q.spot;
  $("st-iv").value = q.iv;
  $("st-width").value = Math.max(strikeStep(q.spot), roundStrike(q.spot * 0.025, q.spot));
}
// Strike edits in the preview, by leg index; they reset when the template, underlying, spot or width change.
let strikeOverrides = { key: "", strikes: {} };
/** The builder's legs: template strikes, any per-leg strike edits (repriced), then the user's fill if given. */
function builderLegs(s) {
  const key = [s.name, s.sym, s.spot, s.width].join("|");
  if (strikeOverrides.key !== key) strikeOverrides = { key, strikes: {} };
  const legs = buildStrategy(s.name, { ...s, r: state.market.r }).map((l, i) => {
    const K = strikeOverrides.strikes[i];
    if (!(K > 0)) return l;
    const entry = bs({ S: s.spot, K, T: s.days / 365, vol: s.iv / 100, r: state.market.r, right: l.right }).price;
    return { ...l, strike: K, entry };
  });
  const fill = Number($("st-net").value);
  if (!(fill > 0)) return { legs, msg: "" };
  const signed = $("st-net-side").value === "credit" ? -fill : fill;
  try {
    return { legs: applyNetPrice(legs, signed, s.qty), msg: `Entries scaled so the legs add up to your ${$("st-net-side").value} of ${money(fill, { compact: false })} per combo.` };
  } catch (e) {
    return { legs, msg: `Fill not applied: ${e.message}.`, error: true };
  }
}
function renderBuilder() {
  fillSelect($("st-name"), Object.keys(TEMPLATES), $("st-name").value || "Iron condor");
  fillSelect($("st-sym"), syms(), $("st-sym").value || "SPY");
  if (!$("st-spot").value) syncStrategyDefaults();
  const s = strategyInputs();
  if (!(s.spot > 0 && s.width > 0 && s.iv > 0)) {
    $("st-preview").innerHTML = `<p class="caption">Enter a positive spot, strike width and IV.</p>`;
    $("st-payoff").innerHTML = "";
    return;
  }
  const { legs, msg } = builderLegs(s);
  $("st-msg").textContent = msg;
  const net = legs.reduce((t, l) => t + l.qty * OPTION_MULT * l.entry, 0);
  // Preview prices the new legs alone against the entered spot, moving the underlying 1:1.
  const local = structuredClone(state.market);
  local.quotes[s.sym] = { ...local.quotes[s.sym], spot: s.spot, beta: 1 };
  const atExp = payoffCurve(legs, local, { from: -0.25, to: 0.25, n: 101, days: s.days });
  const today = payoffCurve(legs, local, { from: -0.25, to: 0.25, n: 101, days: 0 });
  const best = Math.max(...atExp.map((p) => p.pnl));
  const worst = Math.min(...atExp.map((p) => p.pnl));
  const breakevens = [];
  for (let i = 1; i < atExp.length; i++) {
    const [a, b] = [atExp[i - 1], atExp[i]];
    if ((a.pnl < 0) !== (b.pnl < 0)) breakevens.push(s.spot * (1 + a.move + ((b.move - a.move) * -a.pnl) / (b.pnl - a.pnl)));
  }
  $("st-preview").innerHTML = `${table(
    ["Leg", "Strike", "Contracts", "Premium"],
    legs.map(
      (l, i) =>
        `<tr><td>${l.qty > 0 ? "Long" : "Short"} ${l.right}</td><td class="num"><input type="number" step="0.5" min="0.5" value="${l.strike}" data-leg="${i}" aria-label="Strike of leg ${i + 1}"></td><td class="num">${num(l.qty, 0, true)}</td><td class="num">${money(l.entry, { compact: false })}</td></tr>`,
    ),
    [1, 2, 3],
  )}
  <div class="diff">
    <span class="h">${net >= 0 ? "Net debit" : "Net credit"}</span><span class="v">${money(Math.abs(net), { compact: false })}</span><span></span>
    <span class="h">Best at expiry (±25%)</span><span class="v pos">${money(best, { plus: true })}</span><span></span>
    <span class="h">Worst at expiry (±25%)</span><span class="v neg">${money(worst, { plus: true })}</span><span></span>
    <span class="h">Breakevens</span><span class="v">${breakevens.length ? breakevens.map((b) => num(b, 2)).join(", ") : "—"}</span><span></span>
  </div>`;
  lineChart($("st-payoff"), {
    series: [
      { name: "Today", cls: "s-now", dot: "dot-now", legend: "now", pts: today.map((p) => ({ x: p.move, y: p.pnl })) },
      { name: `At expiry (${s.days}d)`, cls: "s-hz", dot: "dot-hz", legend: "hz", pts: atExp.map((p) => ({ x: p.move, y: p.pnl })) },
    ],
    height: 240,
    xTitle: `${s.sym} price`,
    xFmt: (v) => num(s.spot * (1 + v), s.spot >= 1000 ? 0 : 0),
    yFmt: (v) => money(v),
  });
}

function diffBlock(rows) {
  return `<div class="diff"><span class="h"></span><span class="h v">Before</span><span class="h v">After</span>${rows
    .map(([label, a, b, f]) => `<span>${label}</span><span class="v">${f(a)}</span><span class="v ${label.startsWith("CVaR") ? (b < a ? "pos" : b > a ? "neg" : "") : ""}">${f(b)}</span>`)
    .join("")}</div>`;
}
function proposal(el, trades, rowsFn, kind, emptyNote = "Already at the target. No trade needed.") {
  if (!trades.length) {
    // Keep the button in place, disabled, so the card doesn't look like the input vanished.
    el.innerHTML = `<div class="proposal"><p class="note">${esc(emptyNote)}</p><div><button type="button" class="btn-primary" disabled>Book hedge</button></div></div>`;
    return;
  }
  const after = [...state.positions, ...trades];
  const capped = trades.some((t) => t.capped)
    ? `<p class="note">Capped at ${MAX_GAMMA_CONTRACTS.toLocaleString("en-US")} contracts; the target is not reachable with one sane trade.</p>`
    : "";
  // The cash the hedge costs up front, in one line: option premium (futures need no premium; shares are an exchange).
  const premium = netPremium(trades);
  const cost = premium
    ? `<p class="note">Option premium: <b>${premium > 0 ? "pay" : "receive"} ${money(Math.abs(premium), { compact: false })}</b> at model prices.</p>`
    : "";
  el.innerHTML = `<div class="proposal">${trades.map((t) => `<div class="trade">${esc(tradeText(t))}</div>`).join("")}
    ${cost}
    ${capped}
    ${diffBlock(rowsFn(state.positions, after))}
    <div><button type="button" class="btn-primary" data-book="${kind}">Book hedge</button></div></div>`;
}
// What the hedge does to the book in a ±10% SPX move today, shown next to the button that books it.
const moveRows = (b, a) =>
  [-0.1, 0.1].map((move) => [
    `P&L if SPX ${pct(move, 0)}`,
    scenarioPnl(b, state.market, { move }),
    scenarioPnl(a, state.market, { move }),
    (v) => money(v, { plus: true }),
  ]);
// One horizon for both sides, capped at the nearest expiry of the book with the hedge included.
const cvarRow = (b, a) => {
  const days = maxHorizon(a, QUICK.days);
  return [`CVaR 95, ${days}d`, quickCvar(b, days), quickCvar(a, days), (v) => money(v)];
};
// An optional sizing input: undefined when empty, so the Greek target applies (#19).
const optional = (id) => ($(id).value.trim() === "" ? undefined : Number($(id).value));
function hedgeTrades(kind) {
  const { market, positions } = state;
  if (kind === "delta") return deltaHedge(positions, market, $("dh-sym").value, Number($("dh-target").value) || 0, { pct: optional("dh-pct") });
  if (kind === "gamma") {
    const sym = $("gh-sym").value;
    const g = gammaHedge(positions, market, sym, {
      target: Number($("gh-target").value) || 0,
      days: Math.max(1, Math.round(Number($("gh-days").value) || 30)),
      right: $("gh-right").value,
      budget: optional("gh-budget"),
    });
    if (!g.length || !$("gh-redelta").checked) return g;
    return [...g, ...deltaHedge([...positions, ...g], market, sym, 0)];
  }
  return betaHedge(positions, market, $("bh-inst").value, Number($("bh-target").value) || 0);
}
function renderHedge() {
  const { market } = state;
  fillSelect($("dh-sym"), syms(), $("dh-sym").value || "QQQ");
  fillSelect($("gh-sym"), syms(), $("gh-sym").value || "QQQ");
  const by = (ps, s) => portfolioGreeks(ps, market).bySym[s] ?? { delta: 0, gamma: 0, vega: 0 };
  const gs = (ps) => portfolioGreeks(ps, market);
  const dsym = $("dh-sym").value;
  // A filled-in % or budget replaces the Greek target; grey the target out so that is visible.
  $("dh-target").disabled = Number.isFinite(optional("dh-pct"));
  $("gh-target").disabled = Number.isFinite(optional("gh-budget"));
  proposal($("dh-out"), hedgeTrades("delta"), (b, a) => [
    [`${dsym} delta`, by(b, dsym).delta, by(a, dsym).delta, (v) => num(v, 1)],
    ["Beta dollars", gs(b).betaDollars, gs(a).betaDollars, (v) => money(v)],
    ...moveRows(b, a),
    cvarRow(b, a),
  ], "delta");
  const gsym = $("gh-sym").value;
  proposal($("gh-out"), hedgeTrades("gamma"), (b, a) => [
    [`${gsym} gamma`, by(b, gsym).gamma, by(a, gsym).gamma, (v) => num(v, 3)],
    [`${gsym} delta`, by(b, gsym).delta, by(a, gsym).delta, (v) => num(v, 1)],
    ["Vega", gs(b).vega, gs(a).vega, (v) => money(v)],
    ["Theta/day", gs(b).theta, gs(a).theta, (v) => money(v)],
    ...moveRows(b, a),
    cvarRow(b, a),
  ], "gamma", Number.isFinite(optional("gh-budget")) ? "The budget doesn't pay for one contract at the model price." : undefined);
  // A whole ES contract can be coarser than the gap; say so instead of claiming the target is met.
  const inst = $("bh-inst").value;
  const gap = (Number($("bh-target").value) || 0) - gs(state.positions).betaDollars;
  const unit = inst === "SPY" ? market.quotes.SPY.spot * market.quotes.SPY.beta : FUTURE_MULT[inst] * market.quotes.SPX.spot;
  const coarse =
    Math.abs(gap) >= 1
      ? `${money(Math.abs(gap))} of beta dollars are left: less than half of one ${inst === "SPY" ? "SPY share" : `${inst} contract`} (${money(unit)}). ${{ ES: "Use MES or SPY for a finer hedge.", MES: "Use SPY for a finer hedge." }[inst] ?? ""}`.trim()
      : undefined;
  proposal($("bh-out"), hedgeTrades("beta"), (b, a) => [
    ["Beta dollars", gs(b).betaDollars, gs(a).betaDollars, (v) => money(v)],
    ["ES equivalent", gs(b).esEquivalent, gs(a).esEquivalent, (v) => num(v, 2)],
    ...moveRows(b, a),
    cvarRow(b, a),
  ], "beta", coarse);

  const booked = state.positions.filter((p) => HEDGE_GROUPS.has(p.group));
  $("hedge-log").innerHTML = booked.length
    ? table(
        ["Hedge", "Position", "Qty", "Entry", ""],
        booked.map(
          (p) => `<tr><td><span class="tag">${esc(p.group)}</span></td><td>${esc(describe(p))}</td><td class="num">${num(p.qty, 0, true)}</td><td class="num">${num(p.entry, 2)}</td><td><button type="button" class="ghost danger" data-remove="${p.id}">Remove</button></td></tr>`,
        ),
        [2, 3],
      )
    : `<p class="caption">No hedges booked yet.</p>`;
}

function renderRisk() {
  const asked = Math.max(1, Math.round(Number($("rk-days").value) || 30));
  const days = maxHorizon(state.positions, asked);
  const paths = Number($("rk-paths").value);
  const seed = Math.round(Number($("rk-seed").value) || 1);
  const { pnl, stats } = cached(`risk|${days}|${paths}|${seed}`, () => {
    const sim = simulate(state.market, { paths, days, seed });
    const p = pnlPaths(state.positions, state.market, sim, days);
    return { pnl: p, stats: riskStats(p) };
  });
  tiles($("risk-kpis"), [
    ["POP (risk-neutral)", pct(stats.pop, 1).replace("+", ""), "share of simulated paths with a gain, not a forecast"],
    ["Mean P&L", money(stats.mean, { plus: true }), `over ${days} days`, cls(stats.mean)],
    ["VaR 95", money(stats.var95), "loss exceeded on 5% of paths"],
    ["CVaR 95", money(stats.cvar95), "average loss over the worst 5%"],
    ["Sortino", Number.isFinite(stats.sortino) ? num(stats.sortino, 2) : "no losses", "mean ÷ downside deviation, target 0"],
    ["Worst path", money(stats.min, { plus: true }), `best ${money(stats.max, { plus: true })}`, cls(stats.min)],
  ]);
  const sv = Number(state.market.spotVol) || 0;
  $("risk-caption").textContent = [
    `${paths.toLocaleString("en-US")} paths, ${days} days ahead, seed ${seed}.`,
    days < asked ? `Horizon capped at the nearest option expiry (${days} days): legs can't be repriced after they expire.` : "",
    `Risk-neutral: prices drift at the risk-free rate, as in the option pricing. Market factor vol = SPX IV (${state.market.quotes.SPX.iv} points).`,
    sv
      ? `IV change per 1% SPX move: ${num(sv, 2, true)} points. Entry prices don't include this assumption, so mean P&L, POP and CVaR lean toward long-vega books. Treat them as a stress view, not a fair-value expectation.`
      : "IV held fixed.",
  ]
    .filter(Boolean)
    .join(" ");
  histogram($("histogram"), pnl, stats);
}

function renderSurface() {
  const metric = $("sf-metric").value;
  const axis = $("sf-axis").value;
  const moves = Array.from({ length: 17 }, (_, i) => -0.2 + i * 0.025);
  const dte = nearestExpiry(state.positions) || 30;
  const ys = axis === "iv" ? [20, 15, 10, 5, 0, -5, -10] : Array.from({ length: 7 }, (_, i) => Math.round((dte * i) / 6));
  const grid = cached(`surf|${metric}|${axis}`, () => surfaceGrid(state.positions, state.market, { moves, ys, axis, metric }));
  heatmap($("surface"), {
    grid,
    moves,
    ys,
    title: `${$("sf-metric").selectedOptions[0].text} by SPX move and ${axis === "iv" ? "IV shift" : "days forward"}`,
    yFmt: (y, long) => (axis === "iv" ? `${long ? "IV " : ""}${num(y, 0, true)}${long ? " pts" : ""}` : `${long ? "day " : "d"}${y}`),
    vFmt: (v) => money(v, { plus: true }),
  });
}

let optResult = null;
function renderOptimizer() {
  fillSelect($("op-sym"), tradeable(), $("op-sym").value || "SPY");
  if (!optResult) return;
  if (optResult.version !== version) {
    $("opt-out").innerHTML = `<p class="caption">The ledger or quotes changed since the last run. Press “Find hedge” again.</p>`;
    return;
  }
  const { before: b, after: a, trades, evaluations, options: o } = optResult.r;
  const rows = [
    ["Beta dollars", b.betaDollars, a.betaDollars, (v) => money(v)],
    ["Gamma, 1% move", b.gamma1pct, a.gamma1pct, (v) => money(v)],
    ["Vega", b.vega, a.vega, (v) => money(v)],
    ["Theta/day", b.theta, a.theta, (v) => money(v)],
    [`CVaR 95, ${o.days}d`, b.cvar95, a.cvar95, (v) => money(v)],
    ["POP (risk-neutral)", b.pop, a.pop, (v) => pct(v, 1).replace("+", "")],
    ["Trading cost", b.cost, a.cost, (v) => money(v)],
    ["Objective (lower is better)", b.objective, a.objective, (v) => num(v, 3)],
  ];
  $("opt-out").innerHTML = `<div class="proposal">
    ${trades.length ? trades.map((t) => `<div class="trade">${esc(tradeText(t))}</div>`).join("") : `<p class="note">No trade improves the objective with these weights.</p>`}
    ${diffBlock(rows)}
    <p class="note">${evaluations} candidates scored on ${o.paths.toLocaleString("en-US")} shared paths over ${o.days} days. The objective sums each weighted term relative to the unhedged book, so the unhedged value equals the sum of the active weights.${Number(state.market.spotVol) ? " Spot-vol is set, so CVaR and POP here include the unpriced IV assumption (see Method)." : ""}</p>
    ${trades.length ? `<div><button type="button" class="btn-primary" data-book="optimizer">Book these trades</button></div>` : ""}
  </div>`;
}

// ---------- routing ----------
const VIEWS = { dashboard: renderDashboard, positions: renderPositions, builder: renderBuilder, hedge: renderHedge, risk: renderRisk, surface: renderSurface, optimizer: renderOptimizer, method: () => {} };
const current = () => (VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "dashboard");

function render() {
  const v = current();
  for (const s of document.querySelectorAll(".view")) s.hidden = s.id !== `view-${v}`;
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.getAttribute("href") === `#${v}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  hideTip();
  VIEWS[v]();
}

// ---------- events ----------
window.addEventListener("hashchange", () => {
  render();
  window.scrollTo({ top: 0 });
});
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

document.addEventListener("click", (ev) => {
  const rm = ev.target.closest("[data-remove]");
  if (rm) {
    const id = Number(rm.dataset.remove);
    state.positions = state.positions.filter((p) => p.id !== id);
    commit();
    return;
  }
  const rollBtn = ev.target.closest("[data-roll]");
  if (rollBtn) {
    const gid = Number(rollBtn.dataset.roll);
    const shift = Number(document.querySelector(`[data-roll-shift="${gid}"]`)?.value) || 0;
    const daysRaw = document.querySelector(`[data-roll-days="${gid}"]`)?.value.trim();
    const days = daysRaw ? Math.round(Number(daysRaw)) : undefined;
    const { positions, records } = rollCombo(state.positions, gid, { strikeShift: shift, days }, state.market);
    if (!records.length) return;
    state.positions = positions;
    state.history = [...(state.history ?? []), ...records];
    commit();
    return;
  }
  const book = ev.target.closest("[data-book]");
  if (book) {
    const kind = book.dataset.book;
    const trades = kind === "optimizer" ? optResult?.r.trades ?? [] : hedgeTrades(kind);
    addPositions(state, trades);
    optResult = null;
    commit();
  }
});

$("reset-example").addEventListener("click", () => {
  const market = state.market;
  state.positions = [];
  state.history = [];
  addPositions(state, examplePortfolio(market));
  commit();
});
let clearArmed = 0;
$("clear-book").addEventListener("click", () => {
  const note = $("clear-confirm");
  if (Date.now() - clearArmed < 5000) {
    state.positions = [];
    state.history = [];
    clearArmed = 0;
    note.hidden = true;
    commit();
    return;
  }
  clearArmed = Date.now();
  note.textContent = `Press “Clear ledger” again within 5 seconds to remove all ${state.positions.length} positions.`;
  note.hidden = false;
});

// ---------- export / import (#17): text in a box, so it works where downloads and the clipboard are blocked ----------
const ioMsg = (text, bad = false) => {
  $("io-msg").textContent = text;
  $("io-msg").classList.toggle("neg", bad);
};
$("export-ledger").addEventListener("click", async () => {
  const box = $("ledger-json");
  box.value = serializeLedger({ positions: state.positions, history: state.history ?? [], market: state.market, account: account() });
  box.focus();
  box.select();
  const what = `${state.positions.length} positions and ${(state.history ?? []).length} rolls`;
  try {
    await navigator.clipboard.writeText(box.value);
    ioMsg(`Copied ${what} to the clipboard. The JSON is also in the box.`);
  } catch (_) {
    ioMsg(`The clipboard is blocked here, so the JSON for ${what} is selected in the box: press Ctrl+C (⌘C on a Mac) to copy it.`);
  }
});
let importArmed = 0;
$("import-ledger").addEventListener("click", () => {
  let parsed;
  try {
    parsed = parseLedger($("ledger-json").value, state.market);
  } catch (e) {
    importArmed = 0;
    ioMsg(e.message, true);
    return;
  }
  if (Date.now() - importArmed >= 5000) {
    importArmed = Date.now();
    ioMsg(`Ready: ${parsed.positions.length} positions and ${parsed.history.length} rolls. Press “Import from the box” again within 5 seconds to replace the ${state.positions.length} positions here.`);
    return;
  }
  importArmed = 0;
  state.positions = parsed.positions.map((p, i) => ({ ...p, id: i + 1 }));
  state.nextId = state.positions.length + 1;
  state.nextGid = Math.max(0, ...state.positions.map((p) => p.gid), ...parsed.history.map((h) => h.gid)) + 1;
  state.history = parsed.history;
  state.market = parsed.market;
  state.account = parsed.account;
  commit();
  ioMsg(`Imported ${parsed.positions.length} positions and ${parsed.history.length} rolls.`);
});

$("ledger").addEventListener("change", (ev) => {
  const t = ev.target;
  if (!t.dataset.id) return;
  const p = state.positions.find((x) => x.id === Number(t.dataset.id));
  const v = Number(t.value);
  const f = t.dataset.field;
  const valid = { qty: true, entry: v >= 0, strike: v > 0, days: v >= 0, iv: v >= 1 };
  if (!p || !Number.isFinite(v) || !valid[f]) return;
  const value = f === "qty" || f === "days" ? Math.round(v) : v;
  if (p.kind === "option" && (f === "strike" || f === "days") && value !== p[f]) {
    // A strike or expiry change is a roll: realize the old leg at its model mark and record it on the combo.
    const { leg, record } = rollLeg(p, { [f]: value }, state.market);
    Object.assign(p, leg);
    state.history = [...(state.history ?? []), record];
  } else {
    p[f] = value;
  }
  commit();
});
$("market").addEventListener("change", (ev) => {
  const t = ev.target;
  const v = Number(t.value);
  if (!t.dataset.sym || !Number.isFinite(v) || (t.dataset.q !== "beta" && v <= 0)) return;
  state.market.quotes[t.dataset.sym][t.dataset.q] = v;
  commit();
});
$("rate").addEventListener("change", () => {
  const v = Number($("rate").value);
  if (Number.isFinite(v) && v >= 0) {
    state.market.r = v / 100;
    commit();
  }
});
$("cash-form").addEventListener("change", (ev) => {
  const t = ev.target;
  const raw = t.value.trim();
  const v = raw === "" ? null : Number(raw);
  if (v !== null && !(Number.isFinite(v) && v >= 0)) return;
  const a = account();
  if (t.id === "acct-cash") a.cash = v;
  else if (t.id === "margin-es") a.futuresMargin.ES = v;
  else if (t.id === "margin-mes") a.futuresMargin.MES = v;
  else return;
  commit();
});
$("cash-form").addEventListener("submit", (ev) => ev.preventDefault());
$("spotvol").addEventListener("change", () => {
  const v = Number($("spotvol").value);
  if (Number.isFinite(v) && Math.abs(v) <= 10) {
    state.market.spotVol = v;
    commit();
  }
});
$("stock-sym").addEventListener("change", () => {
  $("stock-entry").value = state.market.quotes[$("stock-sym").value].spot;
});
$("stock-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const qty = Math.round(Number($("stock-qty").value));
  const entry = Number($("stock-entry").value);
  if (!qty || !(entry > 0)) return;
  addPositions(state, [{ kind: "equity", sym: $("stock-sym").value, qty, entry }]);
  commit();
});

function syncLegDefaults() {
  const q = state.market.quotes[$("leg-sym").value];
  $("leg-strike").value = roundStrike(q.spot, q.spot);
  $("leg-iv").value = q.iv;
}
// Option combos on the leg's underlying that a new leg can join, so a spread entered one leg at a time is one combo.
function fillLegCombos() {
  const firsts = new Map();
  for (const p of state.positions) if (p.kind === "option" && p.sym === $("leg-sym").value && !firsts.has(p.gid)) firsts.set(p.gid, p);
  const combos = [...firsts.values()];
  fillSelect($("leg-combo"), ["", ...combos.map((p) => String(p.gid))], undefined, ["New combo", ...combos.map((p) => `${p.group ? `${p.group}: ` : ""}${describe(p)}`)]);
}
$("leg-sym").addEventListener("change", () => {
  syncLegDefaults();
  fillLegCombos();
});
$("leg-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const sym = $("leg-sym").value;
  const right = $("leg-right").value;
  const strike = Number($("leg-strike").value);
  const days = Math.round(Number($("leg-days").value));
  const iv = Number($("leg-iv").value);
  const qty = Math.round(Number($("leg-qty").value));
  if (!(strike > 0) || !(days >= 0) || !(iv >= 1) || !qty) return;
  const typed = $("leg-entry").value.trim();
  const model = bs({ S: state.market.quotes[sym].spot, K: strike, T: days / 365, vol: iv / 100, r: state.market.r, right }).price;
  const entry = typed === "" ? model : Number(typed);
  if (!(entry >= 0)) return;
  const leg = { kind: "option", sym, right, strike, qty, days, iv, entry };
  const gid = Number($("leg-combo").value);
  const combo = gid ? state.positions.find((p) => p.gid === gid) : undefined;
  if (combo) state.positions.push({ ...leg, ...(combo.group ? { group: combo.group } : {}), id: state.nextId++, gid });
  else addPositions(state, [leg]);
  $("leg-entry").value = "";
  commit();
});

$("st-sym").addEventListener("change", () => {
  syncStrategyDefaults();
  renderBuilder();
});
$("strategy-form").addEventListener("input", (ev) => {
  if (ev.target.id !== "st-sym") renderBuilder();
});
$("st-preview").addEventListener("change", (ev) => {
  const i = ev.target.dataset.leg;
  const K = Number(ev.target.value);
  if (i === undefined || !(K > 0)) return;
  strikeOverrides.strikes[Number(i)] = K;
  renderBuilder();
});
$("strategy-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const s = strategyInputs();
  if (!(s.spot > 0 && s.width > 0 && s.iv > 0)) return;
  const { legs: built, error } = builderLegs(s);
  if (error) return; // the message under the form says why the fill was not applied
  const legs = built.map((l) => ({ ...l, group: `${s.name} ${s.sym}` }));
  strikeOverrides = { key: "", strikes: {} };
  $("st-net").value = "";
  addPositions(state, legs);
  location.hash = "#positions";
  commit();
});

// Re-render on `input`, not `change`: `change` fires on blur, i.e. when the user presses "Book hedge" right after
// typing, and the re-render would replace the button under the click (found by the persona 3 live evaluation).
for (const id of ["dh-sym", "dh-target", "dh-pct", "gh-sym", "gh-target", "gh-budget", "gh-days", "gh-right", "gh-redelta", "bh-inst", "bh-target"]) $(id).addEventListener("input", renderHedge);
$("risk-form").addEventListener("change", renderRisk);
$("risk-form").addEventListener("submit", (ev) => ev.preventDefault());
$("surface-form").addEventListener("change", renderSurface);

$("opt-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const n = (id, d) => (Number.isFinite(Number($(id).value)) ? Number($(id).value) : d);
  const optDays = Math.max(1, Math.round(n("op-days", 30)));
  const r = optimizeHedge(state.positions, state.market, {
    days: n("op-days-h", 30), // optimizeHedge caps this at the nearest expiry, hedge option included
    futRoot: $("op-fut").value,
    optSym: $("op-sym").value,
    optRight: $("op-right").value,
    optDays,
    limits: { fut: Math.max(0, Math.round(n("op-lf", 400))), opt: Math.max(0, Math.round(n("op-lo", 200))) },
    weights: { beta: n("op-wb", 1), gamma: n("op-wg", 0.5), vega: n("op-wv", 0.25), cvar: n("op-wc", 1), cost: n("op-wcost", 0.25) },
    costs: { fut: n("op-cf", 2), opt: n("op-co", 5) },
  });
  optResult = { r, version };
  renderOptimizer();
});

render();
