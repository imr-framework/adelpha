"""Layered YAML configuration loader."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from dtam.config.models import (
    AppConfig,
    EnvironmentConfig,
    RuntimeSettings,
    ScannerProfile,
)
from dtam.config.paths import resolve_config_root
from dtam.core.exceptions import ConfigurationError
from dtam.domain.modes import OperationalMode


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge ``override`` into a copy of ``base``."""
    result = dict(base)
    for key, value in override.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise ConfigurationError(
            f"Missing configuration file: {path}",
            context={"path": str(path)},
        )
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ConfigurationError(
            f"Configuration root must be a mapping: {path}",
            context={"path": str(path), "type": type(data).__name__},
        )
    return data


def _load_optional_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    return load_yaml(path)


def load_app_config(config_root: Path) -> AppConfig:
    raw = _load_optional_yaml(config_root / "app.yaml")
    logging_raw = _load_optional_yaml(config_root / "logging.yaml")
    if logging_raw:
        raw = deep_merge(raw, {"logging": logging_raw})
    return AppConfig.model_validate(raw)


def load_environment_config(config_root: Path, environment: str) -> EnvironmentConfig:
    path = config_root / "environments" / f"{environment}.yaml"
    raw = _load_optional_yaml(path)
    if "environment" not in raw:
        raw = {**raw, "environment": environment}
    return EnvironmentConfig.model_validate(raw)


def load_scanner_profile(
    config_root: Path,
    scanner_id: str,
    *,
    include_base: bool = True,
) -> ScannerProfile:
    profiles_dir = config_root / "scanner_profiles"
    specific = load_yaml(profiles_dir / f"{scanner_id}.yaml")

    merged: dict[str, Any] = {}
    if include_base:
        base_path = profiles_dir / "base.yaml"
        if base_path.is_file():
            merged = load_yaml(base_path)

    # Support optional `extends: base` or nested `scanner:` wrappers.
    extends = specific.pop("extends", None)
    if extends and include_base:
        extends_path = profiles_dir / f"{extends}.yaml"
        if extends_path.is_file():
            merged = deep_merge(merged, load_yaml(extends_path))

    if "scanner" in specific and isinstance(specific["scanner"], dict):
        body = dict(specific)
        scanner_block = body.pop("scanner")
        capabilities = body.pop("capabilities", scanner_block.get("capabilities"))
        merged_body = deep_merge(scanner_block, body)
        if capabilities is not None:
            merged_body["capabilities"] = capabilities
        specific = merged_body

    merged = deep_merge(merged, specific)
    if "id" not in merged:
        merged["id"] = scanner_id
    return ScannerProfile.model_validate(merged)


def load_runtime_settings(
    *,
    scanner_id: str | None = None,
    environment: str | None = None,
    mode: OperationalMode | None = None,
    config_root: Path | str | None = None,
) -> RuntimeSettings:
    """
    Load layered configuration:

    app → environment → scanner profile → runtime overrides
    """
    root = resolve_config_root(config_root)
    app = load_app_config(root)
    env_name = environment or app.environment
    env = load_environment_config(root, env_name)

    effective_scanner_id = (
        scanner_id or env.default_scanner_id or app.default_scanner_id
    )
    scanner = load_scanner_profile(root, effective_scanner_id)

    effective_mode = mode or env.mode or app.default_mode

    app_data = app.model_dump()
    if env.logging is not None:
        app_data["logging"] = env.logging.model_dump()
    app_data["environment"] = env_name
    if env.default_scanner_id:
        app_data["default_scanner_id"] = env.default_scanner_id
    app_data["default_mode"] = effective_mode
    resolved_app = AppConfig.model_validate(app_data)

    return RuntimeSettings(
        app=resolved_app,
        scanner=scanner,
        mode=effective_mode,
        config_root=str(root),
    )
