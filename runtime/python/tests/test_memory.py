from adelpha_runtime.memory import release_simulation_memory
from adelpha_runtime.studio import create_coil_app
from adelpha_runtime.paths import resolve_paths
from fastapi.testclient import TestClient


def test_release_simulation_memory_can_run_repeatedly():
    release_simulation_memory()
    release_simulation_memory()


def test_studio_post_still_answers_after_memory_release():
    client = TestClient(create_coil_app(resolve_paths()))
    missing = client.post("/simulate", json={"axis": "radial"})
    assert missing.status_code in {400, 503}
    assert client.get("/health").json()["service"] == "coil"
