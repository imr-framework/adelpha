"""Run the twin API with uvicorn: ``python -m dtam.api``."""

from __future__ import annotations

import os


def main() -> None:
    import uvicorn

    host = os.environ.get("DTAM_API_HOST", "127.0.0.1")
    port = int(os.environ.get("DTAM_API_PORT", "8080"))
    uvicorn.run(
        "dtam.api.app:create_app",
        factory=True,
        host=host,
        port=port,
        reload=os.environ.get("DTAM_API_RELOAD", "").lower() in {"1", "true", "yes"},
    )


if __name__ == "__main__":
    main()
