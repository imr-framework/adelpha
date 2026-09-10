Placeholder so `resources/python-runtime/` exists for the Tauri build script.

`make sidecar` fills this directory with the frozen PyInstaller runtime.
In `make tauri-dev` it stays empty — the supervisor runs from
`runtime/python/.venv` (see `resolve_dev_python` in `src-tauri/src/runtime.rs`).
