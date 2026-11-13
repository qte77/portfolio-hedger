# Portfolio Hedger: local build/serve and Cloudflare Pages deploy (production only). `make` lists targets.
.DEFAULT_GOAL := help
.PHONY: help vendor lint test crosscheck reference build validate dev e2e deploy-check deploy

BRAND     ?= ../qte77/brand
PROJECT   ?= portfolio-hedger
PORT      ?= 8788
URL       ?= $(CURDIR)/dist
POLYFETCH ?= ../polyfetch-scrape
SHOTS     ?= $(CURDIR)/e2e-shots
# Python that runs scripts/e2e.py: polyfetch-scrape's environment here; CI passes a pinned patchright instead.
E2E_PY    ?= uv run --directory $(POLYFETCH) python
VENDOR    := public/vendor
# Pinned: wrangler >= ~4.150 hands `pages` commands over to Workers, which a Pages-only token cannot use.
WRANGLER  := npm exec --yes --package=wrangler@4.40.0 -- wrangler
# wrangler with the Cloudflare token/account from .env (see .env.example)
CF        := npm exec --yes --package=wrangler@4.40.0 --package=dotenv-cli@8 -- dotenv -e .env -- wrangler
BRANCH     = $(shell git branch --show-current)
# QuantLib, an independent pricing library, for the engine cross-check (#7 B); pinned so the fixture is reproducible.
QUANTLIB  := uv run --no-project --with QuantLib==1.44 python

help: ## List targets
	@awk -F':.*## ' '/^[a-z-]+:.*## /{printf "  %-9s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

vendor: ## Copy the qte77 ui-kit, fonts and logo from $(BRAND)
	mkdir -p $(VENDOR)/ui-kit $(VENDOR)/fonts/LICENSES $(VENDOR)/images
	cp $(BRAND)/ui-kit/eyerest.css $(BRAND)/ui-kit/fonts.css $(BRAND)/ui-kit/layout.css \
	   $(BRAND)/ui-kit/a11y.css $(BRAND)/ui-kit/theme.js $(VENDOR)/ui-kit/
	cp $(BRAND)/fonts/Inter-Regular.woff2 $(BRAND)/fonts/Inter-Bold.woff2 \
	   $(BRAND)/fonts/JetBrainsMono-Regular.woff2 $(BRAND)/fonts/JetBrainsMono-Bold.woff2 $(VENDOR)/fonts/
	cp $(BRAND)/fonts/LICENSES/OFL.txt $(VENDOR)/fonts/LICENSES/
	cp $(BRAND)/images/logo-mark.paths.dejavu.svg $(VENDOR)/images/logo-mark.svg
	echo "qte77/qte77 brand/ @ $$(git -C $(BRAND) rev-parse --short HEAD)" > $(VENDOR)/VENDOR.txt

lint: ## Lint our JS with Biome (recommended rules; vendor/ excluded)
	npm exec --yes --package=@biomejs/biome@1.9.4 -- biome lint public/engine.js public/app.js tests scripts

test: ## Run the engine unit tests
	node --test "tests/*.test.mjs"

build: ## Build dist/ (full HTML document + _headers)
	node scripts/build.mjs

crosscheck: ## Recompute the QuantLib reference values (uv) and compare them with tests/fixtures/quantlib-bs.json
	$(QUANTLIB) scripts/reference.py --check tests/fixtures/quantlib-bs.json

reference: ## Regenerate tests/fixtures/quantlib-bs.json from QuantLib (after changing the cases)
	$(QUANTLIB) scripts/reference.py tests/fixtures/quantlib-bs.json

validate: lint test crosscheck build ## Local gate = CI: lint, tests, QuantLib cross-check, build

dev: build ## Serve dist/ at http://localhost:$(PORT) with _headers applied
	$(WRANGLER) pages dev dist --port $(PORT)

e2e: ## Headless UI check of URL=$(URL) (a deployed URL, or a built dir served from disk); screenshots to $(SHOTS)
	$(E2E_PY) "$(CURDIR)/scripts/e2e.py" $(URL) $(SHOTS)

deploy-check: ## Refuse to deploy anything but a clean main that matches origin/main
	@test "$(BRANCH)" = main || { echo "deploy runs from main only"; exit 1; }
	@test -z "$$(git status --porcelain)" || { echo "deploy needs a clean working tree"; exit 1; }
	@git fetch -q origin main && test "$$(git rev-parse HEAD)" = "$$(git rev-parse origin/main)" || { echo "deploy needs main to match origin/main"; exit 1; }

deploy: deploy-check validate ## Deploy dist/ to production https://$(PROJECT).pages.dev, from a clean main only (needs .env)
	$(CF) pages deploy dist --project-name=$(PROJECT) --branch=main
