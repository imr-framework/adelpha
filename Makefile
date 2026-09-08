.PHONY: install docs docs-serve clean clean-packaging tauri-dev sidecar dist-current dmg test-runtime

install:
	uv sync --group docs
	npm install
	$(MAKE) install-python-runtime

install-python-runtime:
	@if [ ! -x runtime/python/.venv/bin/python ]; then python3 -m venv runtime/python/.venv; fi
	runtime/python/.venv/bin/pip install -e "./runtime/python[dev]"
	@if [ -x dtam/.venv/bin/python ]; then uv pip install --python dtam/.venv/bin/python -e "./runtime/python[dev]"; fi
	@if [ -f dtam/pyproject.toml ]; then \
	  echo "Installing DTAM into the Python runtime venv…"; \
	  runtime/python/.venv/bin/pip install -e "./dtam" \
	    || echo "warning: could not install DTAM into runtime/python/.venv (Python $$(runtime/python/.venv/bin/python -c 'import sys; print(sys.version.split()[0])')). tauri-dev will use dtam/.venv when present."; \
	fi

docs:
	uv run --group docs zensical build --strict

docs-serve:
	uv run --group docs zensical serve

tauri-dev:
	npm run tauri:dev

sidecar:
	python3 runtime/python/build_sidecar.py

dist-current: sidecar
	@if [ -n "$$TAURI_SIGNING_PRIVATE_KEY" ]; then \
	  CI=true npm run tauri:build || $(MAKE) dmg; \
	elif [ -f src-tauri/updater.key ]; then \
	  echo "Signing updater artifacts from src-tauri/updater.key"; \
	  TAURI_SIGNING_PRIVATE_KEY="$$(cat src-tauri/updater.key)" \
	  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$${TAURI_SIGNING_PRIVATE_KEY_PASSWORD-}" \
	    CI=true npm run tauri:build || $(MAKE) dmg; \
	else \
	  echo "No updater signing key; building without updater artifacts."; \
	  CI=true npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}' || $(MAKE) dmg; \
	fi

# Plain hdiutil wrapper for when create-dmg's Finder AppleScript fails.
# Requires a previously bundled .app (tauri build still produces it before DMG).
dmg:
	bash packaging/macos/make_dmg.sh
	bash packaging/updater/make_macos_updater_artifact.sh

test-runtime:
	@if [ ! -x runtime/python/.venv/bin/pytest ]; then python3 -m venv runtime/python/.venv && runtime/python/.venv/bin/pip install -e "./runtime/python[dev]"; fi
	runtime/python/.venv/bin/pytest runtime/python/tests -q

clean:
	rm -rf site .zensical dist

clean-packaging:
	rm -rf dist packaging/sidecar/dist packaging/sidecar/build src-tauri/target src-tauri/resources/python-runtime
