"""JSON Schema for sequence parameter forms (Electron UI). Independent of Qt."""

from __future__ import annotations

from typing import Any, Dict

PARAM_META: Dict[str, Dict[str, Any]] = {
    "TE": {"title": "TE", "unit": "ms", "tab": "sequence", "minimum": 0},
    "TR": {"title": "TR", "unit": "ms", "tab": "sequence", "minimum": 0},
    "ETL": {"title": "ETL", "tab": "sequence", "minimum": 1},
    "NSA": {"title": "Averages", "tab": "sequence", "minimum": 1},
    "FA": {"title": "Flip angle", "unit": "deg", "tab": "sequence"},
    "flipangle": {"title": "Flip angle", "unit": "deg", "tab": "sequence"},
    "Orientation": {
        "title": "Orientation",
        "tab": "sequence",
        "enum": ["Axial", "Sagittal", "Coronal"],
    },
    "orientation": {
        "title": "Orientation",
        "tab": "sequence",
        "enum": ["Axial", "Sagittal", "Coronal"],
    },
    "Gradient": {
        "title": "Gradient",
        "tab": "sequence",
        "enum": ["x", "y", "z"],
    },
    "FOV": {"title": "FOV", "unit": "mm", "tab": "sequence", "minimum": 1},
    "Base_Resolution": {"title": "Base Resolution", "tab": "sequence", "minimum": 8},
    "baseresolution": {"title": "Base Resolution", "tab": "sequence", "minimum": 8},
    "Slices": {"title": "Slices", "tab": "sequence", "minimum": 1},
    "slices": {"title": "Slices", "tab": "sequence", "minimum": 1},
    "BW": {"title": "BW", "unit": "Hz", "tab": "sequence"},
    "Trajectory": {
        "title": "Trajectory",
        "tab": "sequence",
        "enum": ["Cartesian", "Radial"],
    },
    "trajectory": {
        "title": "Trajectory",
        "tab": "sequence",
        "enum": ["Cartesian", "Radial"],
    },
    "Ordering": {
        "title": "Ordering",
        "tab": "sequence",
        "enum": ["center_out", "linear_up", "linear_down"],
    },
    "ordering": {
        "title": "Ordering",
        "tab": "sequence",
        "enum": ["center_out", "linear_up", "linear_down"],
    },
    "PE_Ordering": {"title": "PE Ordering", "tab": "sequence"},
    "Plot_Timing": {"title": "Plot Sequence Timing", "tab": "sequence"},
    "ADC_samples": {"title": "ADC samples", "tab": "sequence", "minimum": 1},
    "ADC_duration": {"title": "ADC duration", "unit": "us", "tab": "sequence"},
    "debug_plot": {"title": "Debug plot", "tab": "other"},
    "view_traj": {"title": "View trajectory", "tab": "other"},
    "PF": {"title": "Partial Fourier", "tab": "processing"},
    "shim_x": {"title": "Shim X", "tab": "adjustments"},
    "shim_y": {"title": "Shim Y", "tab": "adjustments"},
    "shim_z": {"title": "Shim Z", "tab": "adjustments"},
}


def schema_for_defaults(defaults: dict) -> dict:
    properties: Dict[str, Any] = {}
    for key, value in defaults.items():
        meta = PARAM_META.get(key, {})
        prop: Dict[str, Any] = {
            "title": meta.get("title", key.replace("_", " ")),
            "default": value,
        }
        if "enum" in meta:
            prop["type"] = "string"
            prop["enum"] = meta["enum"]
        elif isinstance(value, bool):
            prop["type"] = "boolean"
        elif isinstance(value, int) and not isinstance(value, bool):
            prop["type"] = "integer"
        elif isinstance(value, float):
            prop["type"] = "number"
        else:
            prop["type"] = "string"
        if "unit" in meta:
            prop["unit"] = meta["unit"]
        if "minimum" in meta:
            prop["minimum"] = meta["minimum"]
        prop["tab"] = meta.get("tab", "sequence")
        properties[key] = prop
    return {
        "type": "object",
        "properties": properties,
        "additionalProperties": True,
    }
