"""Exercise the actual upload → process → status → downloadable results contract."""
import io
import json
from pathlib import Path
import time
import zipfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from adelpha_runtime.fem import register_fem_routes

ROOT = Path(__file__).resolve().parents[3]

@pytest.fixture
def client(tmp_path):
    app = FastAPI()
    register_fem_routes(app, ROOT, tmp_path)
    return TestClient(app)


def test_invalid_upload_and_unknown_job(client):
    assert client.post('/fem/uploads?filename=bad.txt', content=b'bad').status_code == 400
    assert client.post('/fem/uploads?filename=empty.step', content=b'').status_code == 400
    assert client.get('/fem/jobs/' + 'a' * 32).status_code == 404
    assert client.post('/fem/jobs', json={"upload_id": "../../etc"}).status_code == 404


def test_real_step_simulation(client, tmp_path):
    import os
    if os.environ.get('FEM_INTEGRATION') != '1':
        pytest.skip('Set FEM_INTEGRATION=1; requires Gmsh and Elmer')
    from simulation.fem.meshgen import gmsh_session
    step = tmp_path / 'sphere.step'
    with gmsh_session() as g:
        g.model.occ.addSphere(0, 0, 0, .01)
        g.model.occ.synchronize()
        g.write(str(step))
    upload = client.post('/fem/uploads?filename=sphere.step', content=step.read_bytes())
    assert upload.status_code == 200, upload.text
    geometry = upload.json()
    assert len(geometry['solids']) == 1
    config = dict(materials={"pm": {"relative_permeability": 1.05, "remanence": [0, 0, 1.2]}},
                  regions=[{"name": "magnet", "solids": [1], "material": "pm"}],
                  mesh={"size": .003, "air_size": .012, "air_padding": .03, "transition": .01})
    bad = client.post('/fem/jobs', json={"upload_id": geometry['id'], "config": {**config, "solver": {"elmer_solver": "/bin/sh"}}})
    assert bad.status_code == 400
    started = client.post('/fem/jobs', json={"upload_id": geometry['id'], "config": config})
    assert started.status_code == 202, started.text
    identifier = started.json()['id']
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        job = client.get(f'/fem/jobs/{identifier}').json()
        if job['status'] in ('completed', 'failed'):
            break
        time.sleep(.1)
    assert job['status'] == 'completed', job
    assert job['mesh']['tetrahedra'] > 0
    assert job['mesh_available']
    preview = client.get(f'/fem/jobs/{identifier}/mesh')
    assert preview.status_code == 200
    mesh = preview.json()
    assert mesh['available'] and mesh['units'] == 'm'
    assert {group['name'] for group in mesh['groups']} == {'air', 'magnet'}
    vertex_count = len(mesh['vertices']) // 3
    assert vertex_count > 0
    for group in mesh['groups']:
        assert len(group['triangles']) > 0 and len(group['triangles']) % 3 == 0
        assert all(0 <= i < vertex_count for i in group['triangles'])
    assert mesh['triangles'] == sum(len(g['triangles']) // 3 for g in mesh['groups'])
    fields_response = client.get(f'/fem/jobs/{identifier}/fields')
    assert fields_response.status_code == 200, fields_response.text
    fields = fields_response.json()
    assert fields['units'] == 'm'
    assert set(fields['fields']) == {'B', 'H', 'A'}
    assert all(len(v['values']) == len(fields['points']) for v in fields['fields'].values())
    assert sum(len(g['tetrahedra']) // 4 for g in fields['groups']) == job['mesh']['tetrahedra']
    # Result bodies keep their own interface nodes; never map by Gmsh node order.
    assert {g['name'] for g in fields['groups']} == {'magnet', 'air'}
    archive = client.get(f'/fem/jobs/{identifier}/download')
    assert archive.status_code == 200
    with zipfile.ZipFile(io.BytesIO(archive.content)) as bundle:
        assert any(name.endswith('.vtu') for name in bundle.namelist())
        assert 'output/elmersolver.log' in bundle.namelist()


def test_legacy_assembly_fem_is_rejected(isolated_data):
    from adelpha_runtime.paths import resolve_paths
    from adelpha_runtime.studio import create_magnet_app
    client = TestClient(create_magnet_app(resolve_paths()))
    response = client.post('/simulate', json={"study": "fem", "example_id": "example-halbach-8"})
    assert response.status_code == 400
    assert 'imported STEP file' in response.json()['detail']


def test_saved_step_can_be_reopened_after_runtime_restart(tmp_path):
    identifier = "b" * 32
    upload = tmp_path / "fem" / "uploads" / identifier
    upload.mkdir(parents=True)
    (upload / "geometry.step").write_bytes(b"ISO-10303-21; saved fixture")
    app = FastAPI()
    register_fem_routes(app, ROOT, tmp_path)
    client = TestClient(app)
    response = client.get(f"/fem/uploads/{identifier}/file")
    assert response.status_code == 200
    assert response.content == b"ISO-10303-21; saved fixture"
    assert client.get("/fem/uploads/not-an-id/file").status_code == 404
    assert client.get("/fem/uploads/" + "c" * 32 + "/file").status_code == 404
