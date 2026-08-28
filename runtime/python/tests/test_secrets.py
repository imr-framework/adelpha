from __future__ import annotations

from adelpha_runtime.paths import RuntimePaths, resolve_paths
from adelpha_runtime.secrets import apply_google_api_key, parse_dotenv_value


def test_parse_dotenv_value_variants():
    text = """
# comment
export GOOGLE_API_KEY="abc-123"
OTHER=nope
"""
    assert parse_dotenv_value(text, "GOOGLE_API_KEY") == "abc-123"
    assert parse_dotenv_value("GOOGLE_API_KEY=plain\n", "GOOGLE_API_KEY") == "plain"
    assert parse_dotenv_value("GOOGLE_API_KEY='quoted'\n", "GOOGLE_API_KEY") == "quoted"
    assert parse_dotenv_value("# GOOGLE_API_KEY=hidden\n", "GOOGLE_API_KEY") is None


def test_apply_google_api_key_from_config_file(isolated_data, monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    paths = resolve_paths()
    (paths.config_dir / "google_api_key").write_text("cfg-key-value\n", encoding="utf-8")
    assert apply_google_api_key(paths) is True
    assert paths.config_dir.joinpath("google_api_key").read_text(encoding="utf-8").strip() == "cfg-key-value"
    # Value is in env; do not assert the string in logs — just that it was applied.
    import os

    assert os.environ.get("GOOGLE_API_KEY") == "cfg-key-value"


def test_apply_google_api_key_from_dotenv(tmp_path, monkeypatch, isolated_data):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    dtam_src = tmp_path / "dtam" / "src"
    dtam_src.mkdir(parents=True)
    (dtam_src.parent / ".env").write_text("GOOGLE_API_KEY=from-dotenv\n", encoding="utf-8")
    paths = resolve_paths()
    patched = RuntimePaths(
        data_dir=paths.data_dir,
        config_dir=paths.config_dir,
        cache_dir=paths.cache_dir,
        log_dir=paths.log_dir,
        temp_dir=paths.temp_dir,
        resource_dir=paths.resource_dir,
        dtam_src=dtam_src,
        dtam_configs=paths.dtam_configs,
        console_root=paths.console_root,
    )
    assert apply_google_api_key(patched) is True
    import os

    assert os.environ.get("GOOGLE_API_KEY") == "from-dotenv"
