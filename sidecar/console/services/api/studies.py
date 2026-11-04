"""Study Viewer backend: listing, path resolution, previews, and exports.

The Study Viewer reads scan folders while the acquisition and reconstruction
workers are moving them through the data tree (``acq_queue`` -> ``acq`` ->
``recon_queue`` -> ``recon`` -> ``complete`` / ``failure`` -> ``archive``).
Everything here is written to tolerate that: folders that vanish mid-read,
``scan.json`` files that are being rewritten, and paths held by the UI that
refer to a stage the scan has since left.
"""

from __future__ import annotations

import glob
import json
import math
import os
import re
import tempfile
import threading
import time
import zipfile
from pathlib import Path
from typing import Any, Iterable, Optional

from fastapi import HTTPException

import common.logger as logger

log = logger.get_logger()

SCAN_FILE = "scan.json"
SCAN_SEP = "#"
MAX_PREVIEW_PIXELS = 4096

# matplotlib's pyplot state is process-global and not thread safe; plot previews run in
# FastAPI's thread pool, so unpickling/rendering must be serialised.
_PLOT_LOCK = threading.Lock()


# --------------------------------------------------------------------------- roots / paths


def scan_roots() -> list[Path]:
    """Scan state folders in pipeline order (earliest stage first)."""
    from common.constants import mri4all_paths

    return [
        Path(p)
        for p in (
            mri4all_paths.DATA_QUEUE_ACQ,
            mri4all_paths.DATA_ACQ,
            mri4all_paths.DATA_QUEUE_RECON,
            mri4all_paths.DATA_RECON,
            mri4all_paths.DATA_COMPLETE,
            mri4all_paths.DATA_FAILURE,
            mri4all_paths.DATA_ARCHIVE,
        )
    ]


def _resolved(path: Path) -> Path:
    try:
        return path.expanduser().resolve()
    except (OSError, RuntimeError):
        return path.expanduser().absolute()


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def resolve_scan_folder(folder: str) -> Path:
    """Resolve a scan folder sent by the UI, following the scan if it has changed stage.

    The UI keeps the absolute path it was given when it listed the scan. If the pipeline has
    since moved the folder (for example recon -> complete), the same scan folder name is looked
    up in the other state folders instead of failing with 404.
    """
    if not folder or not str(folder).strip():
        raise HTTPException(400, "folder required")
    requested = _resolved(Path(str(folder)))
    roots = [_resolved(root) for root in scan_roots()]
    owner = next((root for root in roots if root != requested and _is_within(requested, root)), None)
    if owner is None:
        raise HTTPException(403, "Path not allowed")
    if requested.exists():
        return requested
    rel = requested.relative_to(owner)
    for root in reversed(roots):  # newest stage first
        candidate = root / rel
        if candidate.exists():
            return candidate
    raise HTTPException(404, "Scan folder not found")


def resolve_result_path(folder: str, file_path: str) -> Path:
    base = resolve_scan_folder(folder)
    rel = (file_path or "").replace("\\", "/").lstrip("/")
    target = _resolved(base / rel) if rel else base
    if target != base and not _is_within(target, base):
        raise HTTPException(403, "Path not allowed")
    return target


# --------------------------------------------------------------------------- listing


def _natural_key(path: Path) -> list[Any]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def _mtime(path: Path) -> float:
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


def _scan_dirs(root: Path) -> list[Path]:
    """Scan folders directly below ``root``; tolerant of folders moving while we look."""
    try:
        entries = list(root.iterdir())
    except OSError:
        return []
    found: list[tuple[float, Path]] = []
    for entry in entries:
        if SCAN_SEP not in entry.name:
            continue
        try:
            if not entry.is_dir():
                continue
        except OSError:
            continue
        found.append((_mtime(entry), entry))
    found.sort(key=lambda item: item[0], reverse=True)
    return [entry for _, entry in found]


def read_scan_json(folder: Path, attempts: int = 4, delay: float = 0.05) -> Optional[dict]:
    """Read ``scan.json``; retry briefly because other services rewrite it in place."""
    path = folder / SCAN_FILE
    for attempt in range(max(1, attempts)):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (OSError, ValueError):
            if attempt + 1 < attempts:
                time.sleep(delay)
            continue
        return raw if isinstance(raw, dict) else None
    return None


def json_safe(value: Any) -> Any:
    """Replace NaN/Infinity (valid in Python JSON, rejected by the HTTP encoder) with ``None``."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return value


def _text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


def _dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _scan_number(raw: dict, folder_name: str) -> int:
    try:
        return int(raw.get("scan_number"))
    except (TypeError, ValueError):
        pass
    match = re.search(r"(\d+)\s*$", folder_name)
    return int(match.group(1)) if match else 0


def normalize_results(value: Any) -> list[dict]:
    """Result entries with the string fields the UI reads (``type``, ``name``, ``file_path``)."""
    if not isinstance(value, list):
        return []
    out: list[dict] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        entry = dict(item)
        entry["type"] = (_text(item.get("type")) or "dicom").lower()
        entry["name"] = _text(item.get("name"))
        entry["file_path"] = _text(item.get("file_path"))
        out.append(entry)
    return out


def _exam_time(exam: dict) -> str:
    return _text(exam.get("registration_time")).replace("T", " ").split(".")[0]


def list_studies(roots: Optional[Iterable[Path]] = None) -> list[dict]:
    """Exams (newest first) with their scans, across every pipeline stage and the archive."""
    scans: dict[str, tuple[Path, dict]] = {}
    for root in roots if roots is not None else scan_roots():
        for scan_dir in _scan_dirs(Path(root)):
            raw = read_scan_json(scan_dir)
            if raw is None:
                log.warning("Study list: unreadable %s in %s", SCAN_FILE, scan_dir)
                continue
            # Later stages replace earlier ones: a scan seen twice was moved while we listed.
            scans[scan_dir.name] = (scan_dir, raw)

    exams: dict[str, dict] = {}
    used_ids: set[str] = set()
    for name, (scan_dir, raw) in scans.items():
        try:
            exam_meta = _dict(raw.get("exam"))
            patient = _dict(raw.get("patient"))
            exam_id = _text(exam_meta.get("id")) or name.split(SCAN_SEP, 1)[0]
            patient_name = f"{_text(patient.get('last_name'))}, {_text(patient.get('first_name'))}"
            scan_id = _text(raw.get("id")) or name
            if scan_id in used_ids:
                scan_id = name
            used_ids.add(scan_id)
            payload = {
                "id": scan_id,
                "folder": name,
                "path": str(scan_dir),
                "protocol_name": _text(raw.get("protocol_name")) or "unknown",
                "scan_number": _scan_number(raw, name),
                "sequence": _text(raw.get("sequence")),
                "failed": bool(_dict(raw.get("journal")).get("failed_at")),
                "results": normalize_results(raw.get("results")),
                "task": json_safe(raw),
            }
            exam = exams.get(exam_id)
            if exam is None:
                exam = exams[exam_id] = {
                    "id": exam_id,
                    "acc": "",
                    "patientName": "",
                    "mrn": "",
                    "examTime": "",
                    "scans": [],
                }
            for key, value in (
                ("acc", _text(exam_meta.get("acc"))),
                ("patientName", patient_name if patient_name != ", " else ""),
                ("mrn", _text(patient.get("mrn"))),
                ("examTime", _exam_time(exam_meta)),
            ):
                if not exam[key] and value:
                    exam[key] = value
            exam["scans"].append(payload)
        except Exception:
            log.exception("Study list: skipping malformed scan %s", scan_dir)
    result = list(exams.values())
    for exam in result:
        exam["scans"].sort(key=lambda s: s["scan_number"])
    result.sort(key=lambda e: e["examTime"], reverse=True)
    return result


# --------------------------------------------------------------------------- DICOM preview


def dicom_files(target: Path) -> list[Path]:
    """DICOM slices for a result path: a file, a folder, or a ``series#`` name prefix."""
    if target.is_file():
        return [target]
    if target.is_dir():
        return sorted((p for p in target.glob("*.dcm") if p.is_file()), key=_natural_key)
    parent = target.parent
    if not parent.is_dir():
        return []
    pattern = glob.escape(target.name) + "*.dcm"
    return sorted((p for p in parent.glob(pattern) if p.is_file()), key=_natural_key)


def load_dicom_array(path: Path):
    """One DICOM slice as a finite 2D float32 array in stored-value units (rescale applied)."""
    import numpy as np
    import pydicom

    ds = pydicom.dcmread(str(path))
    arr = np.asarray(ds.pixel_array)
    samples = int(getattr(ds, "SamplesPerPixel", 1) or 1)
    rgb = False
    if samples > 1 and arr.ndim >= 3:
        # (rows, cols, samples) -- or (frames, rows, cols, samples) for multi-frame colour.
        if arr.ndim == 4:
            arr = arr[0]
        arr = arr[..., :3].astype("float32").mean(axis=-1)
        rgb = True
    elif arr.ndim == 3:
        arr = arr[0]  # multi-frame: first frame
    arr = arr.astype("float32")
    if not rgb:
        try:
            slope = float(getattr(ds, "RescaleSlope", 1) or 1)
            intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
        except (TypeError, ValueError):
            slope, intercept = 1.0, 0.0
        if slope != 1.0 or intercept != 0.0:
            arr = arr * np.float32(slope) + np.float32(intercept)
        if str(getattr(ds, "PhotometricInterpretation", "")).upper() == "MONOCHROME1" and arr.size:
            arr = (np.float32(arr.max()) + np.float32(arr.min())) - arr
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    if arr.ndim != 2:
        raise ValueError(f"unsupported pixel data shape {tuple(arr.shape)}")
    return arr.astype("float32", copy=False)


def encode_f32le(arr) -> str:
    import base64

    import numpy as np

    return base64.b64encode(np.ascontiguousarray(arr, dtype="<f4").tobytes()).decode("ascii")


def png_data_url(image) -> str:
    import base64
    from io import BytesIO

    buf = BytesIO()
    image.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def dicom_window_stats(arr):
    import numpy as np

    if arr.size == 0:
        return 0.0, 0.0, 0.0, 0.0, np.zeros(64, dtype=np.int64)
    data_min = float(np.min(arr))
    data_max = float(np.max(arr))
    if not np.isfinite(data_min) or not np.isfinite(data_max):
        data_min = 0.0
        data_max = 0.0
    lo, hi = np.percentile(arr, (1.0, 99.0))
    vmin = float(lo)
    vmax = float(hi)
    if not np.isfinite(vmin) or not np.isfinite(vmax) or vmax <= vmin:
        vmin = data_min
        vmax = data_max
    if data_max > data_min:
        hist, _ = np.histogram(arr, bins=64, range=(data_min, data_max))
    else:
        hist = np.zeros(64, dtype=np.int64)
    return data_min, data_max, vmin, vmax, hist


def _load_slice(path: Path):
    try:
        return load_dicom_array(path)
    except Exception as exc:
        raise ValueError(f"Could not read {path.name}: {exc}") from exc


def _empty_preview(error: str = "") -> dict:
    return {
        "kind": "empty",
        "slices": 0,
        "index": 0,
        "vmin": 0,
        "vmax": 0,
        "data_min": 0,
        "data_max": 0,
        "rows": 0,
        "cols": 0,
        "pixels": "",
        "histogram": [],
        "image": "",
        "stack": [],
        "series": None,
        "error": error,
    }


def _clamp_px(value: int) -> int:
    return max(0, min(int(value or 0), MAX_PREVIEW_PIXELS))


def _dicom_preview(target: Path, index: int, width: int, height: int, all_slices: bool) -> dict:
    files = dicom_files(target)
    if not files:
        return _empty_preview("No DICOM files found")
    import numpy as np
    from PIL import Image

    idx = max(0, min(int(index), len(files) - 1))
    stack: list[dict] = []
    if all_slices and len(files) > 1:
        arrays = [_load_slice(path) for path in files]
        flat = np.concatenate([a.ravel() for a in arrays])
        data_min, data_max, vmin, vmax, hist = dicom_window_stats(flat)
        for i, arr in enumerate(arrays):
            stack.append(
                {"index": i, "rows": int(arr.shape[0]), "cols": int(arr.shape[1]), "pixels": encode_f32le(arr)}
            )
        arr = arrays[idx]
    else:
        arr = _load_slice(files[idx])
        data_min, data_max, vmin, vmax, hist = dicom_window_stats(arr)

    image_url = ""
    if not all_slices:
        if vmax > vmin:
            scaled = ((arr - vmin) / (vmax - vmin) * 255.0).clip(0, 255).astype("uint8")
        else:
            scaled = np.zeros(arr.shape, dtype="uint8")
        image = Image.fromarray(scaled)
        width, height = _clamp_px(width), _clamp_px(height)
        if width > 0 and height > 0:
            iw, ih = image.size
            if iw > 0 and ih > 0:
                fit = min(float(width) / iw, float(height) / ih)
                tw = min(MAX_PREVIEW_PIXELS, max(iw, int(round(iw * fit))))
                th = min(MAX_PREVIEW_PIXELS, max(ih, int(round(ih * fit))))
                resample = getattr(getattr(Image, "Resampling", Image), "BILINEAR", Image.BILINEAR)
                image = image.resize((tw, th), resample)
        image_url = png_data_url(image)
    return {
        "kind": "dicom",
        "slices": len(files),
        "index": idx,
        "vmin": vmin,
        "vmax": vmax,
        "data_min": data_min,
        "data_max": data_max,
        "rows": int(arr.shape[0]),
        "cols": int(arr.shape[1]),
        "pixels": encode_f32le(arr),
        "histogram": hist.tolist(),
        "image": image_url,
        "stack": stack,
        "series": None,
        "error": "",
    }


def _plot_preview(target: Path, width: int, height: int, scale: float) -> dict:
    import base64
    import pickle

    if not target.is_file():
        return _empty_preview("Plot file not found")
    with _PLOT_LOCK:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from common.plotting import extract_figure_series, render_figure_png

        with open(target, "rb") as handle:
            fig = pickle.load(handle)
        try:
            payload = extract_figure_series(fig)
            png = b"" if payload else render_figure_png(fig, width_px=width, height_px=height, scale=scale)
        finally:
            try:
                plt.close(fig)
            except Exception:
                pass
    base = {"kind": "plot", "slices": 1, "index": 0, "vmin": 0, "vmax": 0, "histogram": [], "error": ""}
    if payload:
        return {**base, "image": "", "series": payload}
    return {**base, "image": "data:image/png;base64," + base64.b64encode(png).decode("ascii"), "series": None}


def build_preview(
    folder: str,
    file_path: str = "",
    result_type: str = "",
    index: int = 0,
    width: int = 0,
    height: int = 0,
    scale: float = 1.0,
    all_slices: bool = False,
) -> dict:
    """Preview payload for a DICOM series or pickled plot; render errors are returned, not raised."""
    kind = (result_type or "").lower()
    target = resolve_result_path(folder, file_path)
    try:
        if kind == "dicom":
            return _dicom_preview(target, index, width, height, all_slices)
        if kind == "plot":
            return _plot_preview(target, _clamp_px(width), _clamp_px(height), scale)
        return _empty_preview("Nothing to display")
    except Exception as exc:
        log.exception("Study preview failed for %s", target)
        return _empty_preview(str(exc) or exc.__class__.__name__)


# --------------------------------------------------------------------------- export / send


def _zip_to_temp(entries: Iterable[tuple[Path, str]]) -> str:
    handle = tempfile.NamedTemporaryFile(prefix="adelpha-study-", suffix=".zip", delete=False)
    handle.close()
    try:
        with zipfile.ZipFile(handle.name, "w", zipfile.ZIP_DEFLATED) as archive:
            for source, arcname in entries:
                try:
                    archive.write(source, arcname)
                except OSError:
                    log.warning("Study export: skipped unreadable %s", source)
    except Exception:
        os.unlink(handle.name)
        raise
    return handle.name


def _dir_entries(directory: Path) -> Iterable[tuple[Path, str]]:
    anchor = directory.parent
    for current, _dirs, names in os.walk(directory, followlinks=False):
        for name in sorted(names):
            item = Path(current) / name
            if item.is_symlink() or not item.is_file():
                continue
            yield item, item.relative_to(anchor).as_posix()


def prepare_export(folder: str, file_path: str = "") -> tuple[str, str, bool]:
    """Return ``(path, download_name, is_temporary)`` for the selected result.

    Files download as-is. Folders and ``series#`` result prefixes (how DICOM series are
    referenced) are bundled into a zip so the whole result can be exported.
    """
    target = resolve_result_path(folder, file_path)
    if target.is_file():
        return str(target), target.name, False
    if target.is_dir():
        return _zip_to_temp(_dir_entries(target)), f"{target.name}.zip", True
    parent = target.parent
    matches: list[Path] = []
    if parent.is_dir():
        matches = sorted((p for p in parent.glob(glob.escape(target.name) + "*") if p.is_file()), key=_natural_key)
    if not matches:
        raise HTTPException(404, "File not found")
    if len(matches) == 1:
        return str(matches[0]), matches[0].name, False
    stem = target.name.rstrip(SCAN_SEP).strip() or "export"
    entries = [(p, f"{stem}/{p.name}") for p in matches]
    return _zip_to_temp(entries), f"{stem}.zip", True


def dicom_series_dir(folder: str) -> Path:
    """The ``dicom`` folder of a scan, validated for sending."""
    base = resolve_scan_folder(folder)
    series = base / "dicom"
    if not series.is_dir() or not any(series.glob("*.dcm")):
        raise HTTPException(404, "No DICOM files in this scan")
    return series
