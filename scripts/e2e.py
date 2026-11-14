"""Headless e2e check of Portfolio Hedger with polyfetch-scrape's patchright Chromium.

Usage (from the repo root; see `make e2e`):
    uv run --directory ../polyfetch-scrape python "$PWD/scripts/e2e.py" URL|DIST_DIR [OUT_DIR]

URL is a deployed site. DIST_DIR (e.g. the built `dist`) is served straight from disk through request
interception, with the `/*` headers from its `_headers` file (so the CSP applies): no local server runs.

Visits every view on a phone (portrait and landscape) and a desktop viewport, in dark and light themes. It clicks
the tabs, theme toggle, hedge "Book" buttons, the optimizer and the strategy/surface controls, and saves a
screenshot of each view. It fails on uncaught script errors, failed requests or HTTP >= 400, horizontal page
overflow, content spilling out of a card, or a missing chart.

Script errors are read from <html data-js-error>, which the page's inline guard sets: under patchright,
page.on("console") / page.on("pageerror") only see browser-generated messages, never page-script errors
(see polyfetch-scrape USING.md). The console/pageerror listeners stay as a browser/network signal.
"""

import mimetypes
import sys
from pathlib import Path

from patchright.sync_api import sync_playwright

TARGET = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "dist"
DIST = None if TARGET.startswith("http") else Path(TARGET).resolve()
URL = "https://app.test" if DIST else TARGET  # https: a secure origin, so COOP applies
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e-shots")
OUT.mkdir(parents=True, exist_ok=True)

VIEWS = ["dashboard", "positions", "builder", "hedge", "risk", "surface", "optimizer", "method"]
CHARTS = {"dashboard": "#payoff svg", "builder": "#st-payoff svg", "risk": "#histogram svg", "surface": "#surface svg"}
DEVICES = {
    "phone": {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "device_scale_factor": 2},
    "phone-landscape": {"viewport": {"width": 844, "height": 390}, "is_mobile": True, "has_touch": True, "device_scale_factor": 2},
    "desktop": {"viewport": {"width": 1280, "height": 900}},
}

problems: list[str] = []


def dist_headers() -> dict[str, str]:
    """Headers of the `/*` block in DIST/_headers (Cloudflare Pages format)."""
    out: dict[str, str] = {}
    block = None
    for line in (DIST / "_headers").read_text().splitlines():
        if line and not line[0].isspace():
            block = line.strip()
        elif block == "/*" and ":" in line:
            k, v = line.strip().split(":", 1)
            out[k.strip()] = v.strip()
    return out


def serve_dist(route) -> None:
    path = route.request.url.split("://", 1)[1].partition("/")[2].split("?")[0].split("#")[0] or "index.html"
    f = DIST / path
    if not f.is_file():
        route.fulfill(status=404, body="")
        return
    kind = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    route.fulfill(status=200, body=f.read_bytes(), headers={**HEADERS, "Content-Type": kind})


HEADERS = dist_headers() if DIST else {}


def check(cond: bool, msg: str) -> None:
    if not cond:
        problems.append(msg)


def run(browser, device: str, theme: str) -> None:
    ctx = browser.new_context(**DEVICES[device])
    if DIST:
        ctx.route(f"{URL}/**", serve_dist)
    page = ctx.new_page()
    tag = f"{device}/{theme}"
    page.on("console", lambda m: m.type == "error" and problems.append(f"{tag} console: {m.text}"))
    page.on("pageerror", lambda e: problems.append(f"{tag} pageerror: {e}"))
    page.on("requestfailed", lambda r: problems.append(f"{tag} request failed: {r.url} {r.failure}"))
    page.on("response", lambda r: r.status >= 400 and problems.append(f"{tag} HTTP {r.status}: {r.url}"))

    page.goto(f"{URL}/?theme={theme}#dashboard", wait_until="networkidle")
    check(page.get_attribute("html", "data-theme") == theme, f"{tag}: data-theme is not {theme}")
    check(page.locator("#kpis .stat-tile").count() == 8, f"{tag}: dashboard has no 8 KPI tiles")

    for view in VIEWS:
        page.locator(f'.tabs a[href="#{view}"]').click()
        page.wait_for_timeout(250)
        check(page.locator(f"#view-{view}").is_visible(), f"{tag}: #{view} not visible after tab click")
        shown = page.evaluate("[...document.querySelectorAll('.view')].filter(v => v.offsetParent !== null).length")
        check(shown == 1, f"{tag}: #{view} shows {shown} views at once")
        if view in CHARTS:
            check(page.locator(CHARTS[view]).count() == 1, f"{tag}: #{view} chart missing")
        overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        check(overflow <= 1, f"{tag}: #{view} overflows horizontally by {overflow}px")
        spill = page.evaluate(
            "[...document.querySelectorAll('.view:not([hidden]) .card')]"
            ".filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.querySelector('h2')?.textContent ?? '?')"
        )
        check(not spill, f"{tag}: #{view} content spills out of cards: {spill}")
        # patchright cannot see page-script console errors; the page records them on <html data-js-error>.
        js_error = page.get_attribute("html", "data-js-error")
        check(js_error is None, f"{tag}: #{view} script error: {js_error}")
        page.screenshot(path=str(OUT / f"{device}-{theme}-{view}.png"), full_page=True)

    # interactions (desktop dark only, to keep the run short)
    if device == "desktop" and theme == "dark":
        page.locator('.tabs a[href="#builder"]').click()
        page.select_option("#st-name", "Short strangle")
        page.select_option("#st-sym", "TSLA")
        page.wait_for_timeout(200)
        check("Short" in page.inner_text("#st-preview"), "builder preview did not update")
        page.locator('#strategy-form button[type="submit"]').click()
        page.wait_for_timeout(200)
        check("TSLA" in page.inner_text("#ledger"), "strategy legs not booked into the ledger")

        # Cash account (#3): the book's collateral is shown per position, and buying power appears once cash is set.
        check(page.locator("#ledger td", has_text="$").count() > 0, "ledger has no collateral column")
        # Every flag tag has a label: an unmapped engine flag once showed as "undefined".
        check("undefined" not in page.inner_text("#ledger"), "ledger shows an unlabelled flag (\"undefined\")")
        check("needs margin account" in page.inner_text("#ledger"), "spreads off SPX are not flagged as needing a margin account")
        page.fill("#acct-cash", "500000")
        page.locator("#acct-cash").dispatch_event("change")
        page.wait_for_timeout(200)
        check("Buying power left" in page.inner_text("#cash-summary") and "set account cash" not in page.inner_text("#cash-summary"), "buying power not shown after setting account cash")
        check(page.locator("#assignment").count() == 1, "assignment exposure missing")

        # Export / import (#17): a bad paste explains itself; export, clear, import gives the same ledger back.
        page.fill("#ledger-json", "{not json")
        page.click("#import-ledger")
        check("not valid JSON" in page.inner_text("#io-msg"), "bad import shows no clear error")
        rows = page.locator("#ledger tbody tr").count()
        page.click("#export-ledger")
        page.wait_for_timeout(200)
        exported = page.input_value("#ledger-json")
        check('"portfolio-hedger-ledger"' in exported, "export did not fill the box")
        page.click("#clear-book")
        page.click("#clear-book")
        page.wait_for_timeout(200)
        check(page.locator("#ledger tbody tr").count() == 0, "ledger not cleared")
        page.fill("#ledger-json", exported)
        page.click("#import-ledger")
        page.click("#import-ledger")
        page.wait_for_timeout(300)
        check(page.locator("#ledger tbody tr").count() == rows, f"import gave {page.locator('#ledger tbody tr').count()} rows, expected {rows}")
        check(page.input_value("#acct-cash") == "500000", "import lost the account cash")

        # A leg added to an existing combo joins it (one more ledger row, no new combo); "New combo" makes one.
        page.select_option("#leg-sym", "QQQ")
        page.wait_for_timeout(100)
        combos = page.locator("#leg-combo option").count()
        check(combos > 1, "no QQQ combo offered to join")
        rows = page.locator("#ledger tbody tr").count()
        page.select_option("#leg-combo", index=1)
        page.locator('#leg-form button[type="submit"]').click()
        page.wait_for_timeout(200)
        check(page.locator("#leg-combo option").count() == combos, "a leg added to a combo started a new combo")
        check(page.locator("#ledger tbody tr").count() > rows, "the joined leg is not in the ledger")
        page.select_option("#leg-combo", "")
        page.locator('#leg-form button[type="submit"]').click()
        page.wait_for_timeout(200)
        check(page.locator("#leg-combo option").count() == combos + 1, "New combo did not start a combo")

        page.locator('.tabs a[href="#hedge"]').click()
        page.select_option("#bh-inst", "ES")
        page.wait_for_timeout(200)
        before = page.locator("#hedge-log tbody tr").count()
        page.locator('#bh-out [data-book="beta"]').click()
        page.wait_for_timeout(300)
        check(page.locator("#hedge-log tbody tr").count() == before + 1, "beta hedge not booked")
        # After booking, the card shows a note (at the target, or the leftover under one contract) and no Book button.
        check(page.locator('#bh-out [data-book="beta"]').count() == 0, "beta hedge still proposes a trade after booking")
        # The Dashboard's Cash needed tile says when futures count as $0 because no initial margin is set.
        page.locator('.tabs a[href="#dashboard"]').click()
        page.wait_for_timeout(200)
        check("futures margin not set" in page.inner_text("#kpis"), "Cash needed tile does not warn that futures margin is unset")
        page.locator('.tabs a[href="#hedge"]').click()
        page.wait_for_timeout(200)

        # #19: size the delta hedge as a % of the holding and the gamma hedge by a premium budget.
        page.fill("#dh-pct", "50")
        page.wait_for_timeout(200)
        check(page.locator("#dh-target").is_disabled(), "a % of the holding did not replace the delta target")
        check(page.locator("#dh-out .trade").count() > 0, "a 50% delta hedge proposed no trade")
        page.fill("#gh-budget", "1")
        page.wait_for_timeout(200)
        check("one contract" in page.inner_text("#gh-out"), "a $1 budget did not say it buys no contract")
        page.fill("#gh-budget", "5000")
        page.wait_for_timeout(200)
        paid = page.inner_text("#gh-out .note b")
        check(paid.startswith("pay $") and float(paid[5:].replace(",", "")) <= 5000, f"premium {paid!r} is over the $5,000 budget")
        page.fill("#gh-budget", "")
        page.fill("#dh-pct", "")

        page.locator('.tabs a[href="#optimizer"]').click()
        page.locator('#opt-form button[type="submit"]').click()
        page.wait_for_selector("#opt-out .diff", timeout=15000)

        page.locator('.tabs a[href="#surface"]').click()
        page.select_option("#sf-metric", "beta")
        page.select_option("#sf-axis", "days")
        page.wait_for_timeout(200)
        check(page.locator("#surface svg g[data-r]").count() == 7 * 17, "surface grid is not 7 x 17")

        page.locator('.tabs a[href="#risk"]').click()
        # The tallest bin: an edge bin can hold one path and be under a pixel high, too thin to hover.
        tallest = page.evaluate("[...document.querySelectorAll('#histogram rect[data-i]')].reduce((b, r, i, all) => +r.getAttribute('height') > +all[b].getAttribute('height') ? i : b, 0)")
        page.locator("#histogram rect[data-i]").nth(tallest).hover()
        check(page.locator("#tip").is_visible(), "histogram tooltip did not show")

        page.locator("#theme-toggle").click()
        page.wait_for_timeout(100)
        check(page.get_attribute("html", "data-theme") != "dark", "theme toggle did not change the theme")
        js_error = page.get_attribute("html", "data-js-error")
        check(js_error is None, f"script error after interactions: {js_error}")
        page.screenshot(path=str(OUT / "desktop-after-interactions.png"), full_page=True)
    ctx.close()


with sync_playwright() as p:
    # Containers often ship a tiny /dev/shm, which crashes the renderer on large screenshots.
    browser = p.chromium.launch(args=["--disable-dev-shm-usage", "--disable-gpu"])
    for device in DEVICES:
        for theme in ("dark", "light"):
            run(browser, device, theme)
    browser.close()

print(f"screenshots: {OUT.resolve()}")
if problems:
    print(f"FAIL ({len(problems)}):")
    for line in problems:
        print(" -", line)
    sys.exit(1)
print("PASS: no console errors, failed requests, overflow or missing charts")
