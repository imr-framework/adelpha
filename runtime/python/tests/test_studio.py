from adelpha_runtime.paths import resolve_paths
from adelpha_runtime.studio import _feature_sim, create_coil_app, create_magnet_app, create_shim_app
from fastapi.testclient import TestClient


def test_coil_and_shim_apps_are_not_the_console():
    paths = resolve_paths()
    coil = TestClient(create_coil_app(paths))
    shim = TestClient(create_shim_app(paths))
    magnet = TestClient(create_magnet_app(paths))
    assert coil.get("/health").json() == {"status": "ok", "service": "coil"}
    assert shim.get("/health").json() == {"status": "ok", "service": "shim"}
    assert magnet.get("/health").json() == {"status": "ok", "service": "magnet"}
    missing = coil.post("/simulate", json={"axis": "y"})
    assert missing.status_code in {400, 503}
    empty = magnet.post("/simulate", json={"study": "magnet", "parts": []})
    assert empty.status_code == 400


def test_feature_sim_finds_the_repo_when_resource_dir_is_empty(tmp_path):
    paths = resolve_paths()
    empty = paths.__class__(
        data_dir=paths.data_dir,
        config_dir=paths.config_dir,
        cache_dir=paths.cache_dir,
        log_dir=paths.log_dir,
        temp_dir=paths.temp_dir,
        resource_dir=tmp_path,
        dtam_src=paths.dtam_src,
        dtam_configs=paths.dtam_configs,
        console_root=paths.console_root,
    )
    assert _feature_sim(empty, "shim").name == "sim.py"
    assert _feature_sim(empty, "coil").name == "sim.py"
    assert _feature_sim(empty, "magnet").name == "sim.py"
