from __future__ import annotations

import logging
import shutil
from adelpha_runtime.paths import RuntimePaths

log = logging.getLogger("adelpha.runtime.first_run")


def initialize_user_data(paths: RuntimePaths) -> None:
    """Copy bundled editable defaults into the user data directory once."""
    paths.ensure()
    marker = paths.data_dir / ".adelpha-initialized"
    mri_base = paths.data_dir / "mri4all"
    for folder in (mri_base / "config", mri_base / "data", mri_base / "logs"):
        folder.mkdir(parents=True, exist_ok=True)

    if paths.dtam_configs and paths.dtam_configs.is_dir():
        dest = paths.config_dir / "dtam"
        if not dest.exists():
            shutil.copytree(paths.dtam_configs, dest, dirs_exist_ok=True)
            log.info("copied DTAM default configs to %s", dest)

    if not marker.exists():
        marker.write_text("1\n", encoding="utf-8")
        log.info("first-run initialization complete data_dir=%s", paths.data_dir)
