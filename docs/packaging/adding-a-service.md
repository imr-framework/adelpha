# Adding a Python integration

The desktop app must not learn how each service is launched. Register it in
the supervisor.

1. Add the module and **pin** dependencies in `dtam/pyproject.toml` or
   `runtime/python/requirements-runtime.txt` (numpy 2 compatible).
2. Register a `ServiceDef` in
   `runtime/python/adelpha_runtime/registry.py`:
   - unique `id`
   - `required` / `start` (`always` vs `lazy`)
   - `mount_factory` (in-process ASGI) **or** `child_factory` (isolated process)
   - health path, restart policy, version, description
3. If it is HTTP, mount it under `/api/<id>/` in
   `runtime/python/adelpha_runtime/gateway.py` or reverse-proxy an internal
   port. Do not expose a new fixed port to the frontend.
4. Declare PyInstaller datas / hiddenimports in
   `runtime/python/adelpha-python-runtime.spec`.
5. Add tests in `runtime/python/tests/` (startup, health, failure, cleanup).
6. Rebuild the sidecar **on each OS/arch** (`make sidecar`).
7. Produce installers (`make dist-current` / CI matrix).

The React client should keep using `/api/<name>` on the injected supervisor
base URL plus the session token.
