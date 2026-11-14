"""Full-page README screenshots of the live site, so no view is cut off.

Run: uv run --directory ../polyfetch-scrape python "$PWD/scripts/screenshots.py" "$PWD/docs/screenshots"
"""
import sys
from pathlib import Path

from polyfetch_scrape import render_session

BASE = "https://hedger.abizz.dev/?theme=dark"
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)


def shot(view, name, viewport=(1280, 800), prepare=None):
    with render_session(f"{BASE}#{view}", viewport=viewport, color_scheme="dark", wait_until="networkidle") as s:
        if prepare:
            prepare(s.page)
        # Reason: a click scrolls the page, and the sticky header then lands mid-image in a full-page shot.
        s.page.evaluate("() => window.scrollTo(0, 0)")
        s.page.wait_for_timeout(400)
        s.page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
    print(name)


def widen_ledger(page):
    # The ledger scrolls sideways inside the page column; let the column grow until every ledger column is visible.
    # The page's CSP blocks injected <style>; CSSOM changes from script are allowed.
    page.evaluate("""() => {
        document.documentElement.style.setProperty('--maxw', '100vw');
        document.querySelectorAll('.table-wrap').forEach((e) => { e.style.overflowX = 'visible'; });
    }""")
    page.wait_for_timeout(200)


def run_optimizer(page):
    page.locator('#opt-form button[type="submit"]').click()
    page.wait_for_function("() => !document.querySelector('#opt-out')?.textContent.includes('press')", timeout=60000)


for view in ("dashboard", "hedge", "risk", "surface"):
    shot(view, view)
shot("positions", "positions", viewport=(1600, 900), prepare=widen_ledger)
shot("optimizer", "optimizer", prepare=run_optimizer)
shot("dashboard", "phone-dashboard", viewport=(390, 844))
