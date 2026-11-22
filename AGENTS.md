# Agent instructions

Commands, make targets and the PR workflow: [CONTRIBUTING.md](CONTRIBUTING.md).

- Start from the newest plan in `docs/plans/`: its opening status lists what shipped, what is next and the owner
  gates; its remaining-work table is the only list of open work.
- Gate before any push: `make validate` (lint, tests, build, the same as CI). For UI changes, also run `make e2e` (it serves
  the built `dist/` from disk; no local server), and look at the screenshots.
- Engine changes are test-first (`tests/engine.test.mjs`); UI wiring is covered by `make e2e`.
- `public/vendor/` is copied from `../qte77/brand` by `make vendor`. Change the brand there, never here.
- `public/index.html` is also the claude.ai artifact source: keep it a fragment (no `<html>/<head>`), with exactly one
  inline script (the build hashes it into the CSP) and no inline `style=` attributes.
- Deploy only from `main` after the PR is merged: `make deploy`.
