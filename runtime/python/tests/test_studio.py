from adelpha_runtime.paths import resolve_paths, sidecar_root
from adelpha_runtime.studio import _feature_sim, create_coil_app, create_magnet_app, create_rf_app, create_shim_app
from fastapi.testclient import TestClient


def test_python_projects_live_in_sidecar():
    root = sidecar_root()
    assert root.name == "sidecar"
    assert (root / "coil" / "sim.py").is_file()
    paths = resolve_paths()
    assert paths.dtam_src is not None
    assert paths.dtam_src.parent.name == "dtam"
    assert paths.dtam_src.parent.parent.name == "sidecar"
    assert paths.console_root is not None
    assert paths.console_root.name == "console"


def test_coil_and_shim_apps_are_not_the_console():
    paths = resolve_paths()
    coil = TestClient(create_coil_app(paths))
    rfcoil = TestClient(create_rf_app(paths))
    shim = TestClient(create_shim_app(paths))
    magnet = TestClient(create_magnet_app(paths))
    assert coil.get("/health").json() == {"status": "ok", "service": "coil"}
    assert rfcoil.get("/health").json() == {"status": "ok", "service": "rf"}
    assert shim.get("/health").json() == {"status": "ok", "service": "shim"}
    assert magnet.get("/health").json() == {"status": "ok", "service": "magnet"}
    bad_axis = coil.post("/simulate", json={"axis": "q"})
    assert bad_axis.status_code in {400, 503}
    bad = magnet.post("/halbach", json={"inner_radius_mm": "wide"})
    assert bad.status_code == 400
    array = magnet.post("/halbach", json={"rings": 1, "magnets": 8, "outer_ring": False})
    assert array.status_code == 200
    assert array.json()["magnet_count"] == 8
    stl = magnet.post("/halbach/export", json={"rings": 1, "magnets": 8, "outer_ring": False, "target": "ring", "format": "stl"})
    assert stl.status_code == 200
    assert stl.json()["filename"] == "halbach-slice-00.stl"


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
    assert _feature_sim(empty, "rfcoil").name == "sim.py"
    assert _feature_sim(empty, "magnet").name == "sim.py"
    assert _feature_sim(empty, "halbach").name == "sim.py"
