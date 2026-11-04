import json
import os
import sys
import tempfile
import threading
import time
import types
import zipfile
from pathlib import Path

import pytest

os.environ.setdefault("MRI4ALL_BASE", tempfile.mkdtemp(prefix="mri4all-test-"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

np = pytest.importorskip("numpy")
pytest.importorskip("fastapi")

from fastapi import HTTPException  # noqa: E402

from services.api import studies  # noqa: E402


def _scan(root: Path, name: str, **overrides) -> Path:
    folder = root / name
    folder.mkdir(parents=True)
    task = {
        "id": f"id-{name}",
        "sequence": "se_1D",
        "protocol_name": "Spin echo",
        "scan_number": 1,
        "patient": {"first_name": "Ada", "last_name": "Lovelace", "mrn": "M1"},
        "exam": {"id": name.split("#")[0], "acc": "acc1", "registration_time": "2026-01-02T03:04:05.678"},
        "results": [],
        "journal": {"failed_at": ""},
    }
    task.update(overrides)
    (folder / "scan.json").write_text(json.dumps(task), encoding="utf-8")
    return folder


@pytest.fixture()
def roots(tmp_path, monkeypatch):
    names = ["acq_queue", "acq", "recon_queue", "recon", "complete", "failure", "archive"]
    paths = [tmp_path / n for n in names]
    for p in paths:
        p.mkdir()
    monkeypatch.setattr(studies, "scan_roots", lambda: paths)
    return paths


# ------------------------------------------------------------------ listing


def test_list_groups_scans_by_exam_and_sorts(roots):
    complete = roots[4]
    _scan(complete, "examA#scan_2", scan_number=2)
    _scan(complete, "examA#scan_1", scan_number=1)
    _scan(
        roots[6],
        "examB#scan_1",
        exam={"id": "examB", "acc": "b", "registration_time": "2027-01-01T00:00:00"},
    )
    exams = studies.list_studies()
    assert [e["id"] for e in exams] == ["examB", "examA"]
    assert [s["scan_number"] for s in exams[1]["scans"]] == [1, 2]
    assert exams[1]["patientName"] == "Lovelace, Ada"
    assert exams[1]["examTime"] == "2026-01-02 03:04:05"


def test_list_survives_unreadable_and_malformed_scans(roots):
    complete = roots[4]
    _scan(complete, "good#scan_1")
    bad = complete / "bad#scan_1"
    bad.mkdir()
    (bad / "scan.json").write_text('{"id": "x", "results": [', encoding="utf-8")
    (complete / "nofile#scan_1").mkdir()
    (complete / "stray.txt").write_text("x")
    _scan(
        complete,
        "odd#scan_7",
        scan_number="not a number",
        patient=None,
        exam=["nope"],
        results=[None, "x", {"file_path": None}, {"type": "PLOT", "name": "n", "file_path": "other/a.plot"}],
        protocol_name=None,
    )
    exams = studies.list_studies()
    ids = {e["id"] for e in exams}
    assert ids == {"good", "odd"}
    odd = next(e for e in exams if e["id"] == "odd")["scans"][0]
    assert odd["scan_number"] == 7
    assert odd["protocol_name"] == "unknown"
    assert odd["results"][0] == {"type": "dicom", "name": "", "file_path": ""}
    assert odd["results"][1]["type"] == "plot"
    assert all(isinstance(r["name"], str) and isinstance(r["file_path"], str) for r in odd["results"])


def test_list_output_is_json_safe_with_nan_parameters(roots):
    _scan(roots[4], "n#scan_1", parameters={"te": float("nan"), "tr": float("inf"), "ok": 1.5})
    payload = studies.list_studies()
    text = json.dumps(payload, allow_nan=False)
    assert '"ok": 1.5' in text
    assert payload[0]["scans"][0]["task"]["parameters"]["te"] is None


def test_list_later_stage_wins_when_scan_seen_twice(roots):
    _scan(roots[3], "x#scan_1", protocol_name="recon-state")
    _scan(roots[4], "x#scan_1", protocol_name="complete-state")
    (scan,) = studies.list_studies()[0]["scans"]
    assert scan["protocol_name"] == "complete-state"
    assert scan["path"].endswith(os.path.join("complete", "x#scan_1"))


def test_list_scan_ids_are_unique(roots):
    _scan(roots[4], "e#scan_1", id="dup", scan_number=1)
    _scan(roots[4], "e#scan_2", id="dup", scan_number=2)
    ids = [s["id"] for s in studies.list_studies()[0]["scans"]]
    assert len(set(ids)) == 2


def test_missing_roots_are_ignored(tmp_path):
    assert studies.list_studies([tmp_path / "nope"]) == []


def test_read_scan_json_waits_out_a_rewrite(tmp_path):
    scan = tmp_path / "e#scan_1"
    scan.mkdir()
    target = scan / "scan.json"
    target.write_text('{"id": ', encoding="utf-8")

    def finish():
        time.sleep(0.06)
        target.write_text('{"id": "ok"}', encoding="utf-8")

    thread = threading.Thread(target=finish)
    thread.start()
    try:
        assert studies.read_scan_json(scan, attempts=10, delay=0.03) == {"id": "ok"}
    finally:
        thread.join()


# ------------------------------------------------------------------ path resolution


def test_resolve_rejects_paths_outside_and_roots_themselves(roots, tmp_path):
    for bad in (str(tmp_path), str(roots[4]), str(tmp_path.parent), str(roots[4] / ".." / ".." / "etc")):
        with pytest.raises(HTTPException) as exc:
            studies.resolve_scan_folder(bad)
        assert exc.value.status_code == 403


def test_resolve_follows_a_scan_that_changed_stage(roots):
    stale = roots[3] / "e#scan_1"
    moved = _scan(roots[4], "e#scan_1")
    assert studies.resolve_scan_folder(str(stale)) == moved.resolve()
    (moved / "dicom").mkdir()
    assert studies.resolve_scan_folder(str(stale / "dicom")) == (moved / "dicom").resolve()


def test_resolve_reports_missing_scan(roots):
    with pytest.raises(HTTPException) as exc:
        studies.resolve_scan_folder(str(roots[4] / "gone#scan_1"))
    assert exc.value.status_code == 404


def test_result_path_cannot_escape_scan_folder(roots):
    folder = _scan(roots[4], "e#scan_1")
    sibling = _scan(roots[4], "e#scan_2")
    for rel in ("../e#scan_2/scan.json", "..", "/../e#scan_2"):
        with pytest.raises(HTTPException) as exc:
            studies.resolve_result_path(str(folder), rel)
        assert exc.value.status_code == 403
    assert studies.resolve_result_path(str(folder), "other\\a.plot") == (folder / "other" / "a.plot").resolve()
    assert sibling.exists()


# ------------------------------------------------------------------ export


def _series(folder: Path, count: int, prefix="series00100#"):
    (folder / "dicom").mkdir(exist_ok=True)
    for i in range(1, count + 1):
        (folder / "dicom" / f"{prefix}{i:05d}.dcm").write_bytes(b"d%d" % i)
    (folder / "dicom" / "series00200#00001.dcm").write_bytes(b"other")


def test_export_plain_file_is_returned_directly(roots):
    folder = _scan(roots[4], "e#scan_1")
    (folder / "other").mkdir()
    (folder / "other" / "adc.plot").write_bytes(b"plot")
    path, name, temporary = studies.prepare_export(str(folder), "other/adc.plot")
    assert (Path(path).read_bytes(), name, temporary) == (b"plot", "adc.plot", False)


def test_export_dicom_series_prefix_is_zipped(roots):
    folder = _scan(roots[4], "e#scan_1")
    _series(folder, 3)
    path, name, temporary = studies.prepare_export(str(folder), "dicom/series00100#")
    try:
        assert temporary and name == "series00100.zip"
        with zipfile.ZipFile(path) as archive:
            assert archive.namelist() == [f"series00100/series00100#{i:05d}.dcm" for i in (1, 2, 3)]
    finally:
        os.unlink(path)


def test_export_single_slice_series_is_returned_directly(roots):
    folder = _scan(roots[4], "e#scan_1")
    _series(folder, 1)
    path, name, temporary = studies.prepare_export(str(folder), "dicom/series00100#")
    assert (name, temporary) == ("series00100#00001.dcm", False)


def test_export_folder_zip_skips_symlinks(roots, tmp_path):
    folder = _scan(roots[4], "e#scan_1")
    _series(folder, 2)
    secret = tmp_path / "secret.txt"
    secret.write_text("secret")
    try:
        os.symlink(secret, folder / "dicom" / "link.txt")
    except OSError:
        pytest.skip("symlinks unavailable")
    path, name, temporary = studies.prepare_export(str(folder), "dicom")
    try:
        assert temporary and name == "dicom.zip"
        with zipfile.ZipFile(path) as archive:
            assert not [n for n in archive.namelist() if n.endswith("link.txt")]
            assert "dicom/series00100#00001.dcm" in archive.namelist()
    finally:
        os.unlink(path)


def test_export_missing_result_is_404(roots):
    folder = _scan(roots[4], "e#scan_1")
    with pytest.raises(HTTPException) as exc:
        studies.prepare_export(str(folder), "dicom/series00100#")
    assert exc.value.status_code == 404


def test_dicom_series_dir_requires_dicoms(roots):
    folder = _scan(roots[4], "e#scan_1")
    with pytest.raises(HTTPException):
        studies.dicom_series_dir(str(folder))
    _series(folder, 1)
    assert studies.dicom_series_dir(str(folder)) == (folder / "dicom").resolve()


# ------------------------------------------------------------------ DICOM loading


def test_dicom_files_sorted_naturally_and_prefix_is_literal(tmp_path):
    for name in ("s#10.dcm", "s#2.dcm", "s#1.dcm", "s[1]#1.dcm", "t#1.dcm"):
        (tmp_path / name).write_bytes(b"")
    assert [p.name for p in studies.dicom_files(tmp_path / "s#")] == ["s#1.dcm", "s#2.dcm", "s#10.dcm"]
    assert [p.name for p in studies.dicom_files(tmp_path / "s[1]#")] == ["s[1]#1.dcm"]
    assert studies.dicom_files(tmp_path / "missing" / "s#") == []


def _fake_pydicom(monkeypatch, pixel_array, **attrs):
    ds = types.SimpleNamespace(pixel_array=pixel_array, **attrs)
    module = types.ModuleType("pydicom")
    module.dcmread = lambda _path: ds
    monkeypatch.setitem(sys.modules, "pydicom", module)


def test_load_dicom_applies_rescale_and_cleans_non_finite(monkeypatch):
    raw = np.array([[0, 10], [20, 30]], dtype="uint16")
    _fake_pydicom(monkeypatch, raw, RescaleSlope=2, RescaleIntercept=-5)
    out = studies.load_dicom_array(Path("x.dcm"))
    assert out.dtype == np.float32
    np.testing.assert_allclose(out, [[-5, 15], [35, 55]])
    _fake_pydicom(monkeypatch, np.array([[np.nan, np.inf], [1.0, 2.0]], dtype="float32"))
    np.testing.assert_allclose(studies.load_dicom_array(Path("x.dcm")), [[0, 0], [1, 2]])


def test_load_dicom_handles_multiframe_rgb_and_monochrome1(monkeypatch):
    frames = np.stack([np.full((2, 3), 7, dtype="uint16"), np.full((2, 3), 9, dtype="uint16")])
    _fake_pydicom(monkeypatch, frames)
    assert studies.load_dicom_array(Path("x.dcm")).shape == (2, 3)
    rgb = np.zeros((2, 3, 3), dtype="uint8")
    rgb[..., 0] = 30
    _fake_pydicom(monkeypatch, rgb, SamplesPerPixel=3)
    np.testing.assert_allclose(studies.load_dicom_array(Path("x.dcm")), np.full((2, 3), 10.0))
    _fake_pydicom(monkeypatch, np.array([[0, 4]], dtype="uint16"), PhotometricInterpretation="MONOCHROME1")
    np.testing.assert_allclose(studies.load_dicom_array(Path("x.dcm")), [[4, 0]])


def test_window_stats_are_finite_for_flat_and_empty_images():
    flat = np.full((4, 4), 3.0, dtype="float32")
    data_min, data_max, vmin, vmax, hist = studies.dicom_window_stats(flat)
    assert (data_min, data_max, vmin, vmax) == (3.0, 3.0, 3.0, 3.0)
    assert hist.sum() == 0
    assert studies.dicom_window_stats(np.zeros(0, dtype="float32"))[0] == 0.0


def test_preview_reports_problems_instead_of_raising(roots):
    folder = _scan(roots[4], "e#scan_1")
    assert studies.build_preview(str(folder), "dicom/series1#", "dicom")["error"] == "No DICOM files found"
    assert studies.build_preview(str(folder), "", "unknown")["kind"] == "empty"
    with pytest.raises(HTTPException):
        studies.build_preview(str(folder), "../x", "dicom")


def test_preview_returns_slices_pixels_and_stack(roots, monkeypatch):
    pytest.importorskip("PIL")
    folder = _scan(roots[4], "e#scan_1")
    _series(folder, 3)
    _fake_pydicom(monkeypatch, np.arange(16, dtype="uint16").reshape(4, 4))
    single = studies.build_preview(str(folder), "dicom/series00100#", "dicom", index=9)
    assert (single["kind"], single["slices"], single["index"], single["error"]) == ("dicom", 3, 2, "")
    assert single["image"].startswith("data:image/png;base64,")
    assert (single["rows"], single["cols"], single["data_min"], single["data_max"]) == (4, 4, 0.0, 15.0)
    stacked = studies.build_preview(str(folder), "dicom/series00100#", "dicom", all_slices=True)
    assert [t["index"] for t in stacked["stack"]] == [0, 1, 2]
    assert stacked["image"] == ""


# ------------------------------------------------------------------ dcmsend command


def test_dcmsend_command_keeps_paths_with_spaces_and_omits_empty_aets():
    from common.config import DicomTarget
    from services.ui.dicomexport import _create_command

    target = DicomTarget(name="PACS", ip="10.0.0.5", port=0, aet_target="", aet_source="")
    command = _create_command(target, Path("/data/Application Support/scan/dicom"))
    assert command[:5] == ["dcmsend", "10.0.0.5", "104", "+sd", "/data/Application Support/scan/dicom"]
    assert "-aet" not in command and "-aec" not in command
    assert command[-5:] == ["-nuc", "+sp", "*.dcm", "-to", "60"]
    full = _create_command(
        DicomTarget(name="P", ip="h", port=11112, aet_target="REMOTE", aet_source="ADELPHA"), Path("/d")
    )
    assert full[full.index("-aet") + 1] == "ADELPHA"
    assert full[full.index("-aec") + 1] == "REMOTE"
