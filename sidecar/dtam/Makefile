.PHONY: install sync web api agents-api twin-api assess test lint format typecheck check docs docs-serve vendor-halbach tree clean

PACKAGE := dtam

install:
	uv sync

sync:
	uv sync --all-groups

web:
	uv run adk web src --port 8001 \
		--allow_origins http://localhost:3000 \
		--allow_origins http://127.0.0.1:3000 \
		--allow_origins http://localhost:5173 \
		--allow_origins http://127.0.0.1:5173

api:
	uv run adk api_server src

agents-api:
	uv run adk api_server src --port 8001 \
		--allow_origins http://localhost:3000 \
		--allow_origins http://127.0.0.1:3000 \
		--allow_origins http://localhost:5173 \
		--allow_origins http://127.0.0.1:5173

twin-api:
	uv run python -m dtam.api

assess:
	uv run python -m dtam.agents.main --from-twin --json

test:
	uv run pytest tests -q

coverage:
	uv run pytest tests \
		--cov=$(PACKAGE) \
		--cov-report=term-missing \
		--cov-report=html

lint:
	uv run ruff check src tests

format:
	uv run ruff format src tests
	uv run ruff check src tests --fix

typecheck:
	uv run mypy src

check: lint typecheck test

docs:
	uv run zensical build --strict

docs-serve:
	uv run zensical serve

vendor-halbach:
	@mkdir -p third_party
	@if [ -f third_party/HalbachMRIDesigner/HalbachMRIDesigner.py ]; then \
		echo "HalbachMRIDesigner already present at third_party/HalbachMRIDesigner"; \
	else \
		git clone --depth 1 https://github.com/menkueclab/HalbachMRIDesigner.git third_party/HalbachMRIDesigner; \
	fi

tree:
	find . -maxdepth 4 \
		-not -path "./.git/*" \
		-not -path "./.venv/*" | sort

clean:
	find . -type d -name "__pycache__" -prune -exec rm -rf {} +
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage build dist site .zensical
