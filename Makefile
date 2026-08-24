.PHONY: install docs docs-serve clean

install:
	uv sync --group docs
	npm install

docs:
	uv run --group docs zensical build --strict

docs-serve:
	uv run --group docs zensical serve

clean:
	rm -rf site .zensical dist
