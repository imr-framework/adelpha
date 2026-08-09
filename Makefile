.PHONY: install docs docs-serve clean

install:
	uv sync --group docs
	npm install

docs:
	uv run zensical build --strict

docs-serve:
	uv run zensical serve

clean:
	rm -rf site .zensical dist
