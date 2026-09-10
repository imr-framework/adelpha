"""JSON Schema for sequence parameter forms in the Adelpha Imaging Console.

Sequence authors declare inputs in Python. The React UI renders them from this
schema — no TypeScript and no Qt ``.ui`` file required.

Two ways to add a field:

1. Class attributes named ``param_<Name>`` (shown on the SEQUENCE tab by default).
2. ``param(...)`` for label, unit, tab, min/max, and dropdown choices.

Known names such as ``TE`` / ``TR`` still pick up units from ``PARAM_META``.
Per-sequence ``param(...)`` or ``parameter_ui`` overlays win when they conflict.
"""

from __future__ import annotations

from types import FunctionType
from typing import Any, Dict, Iterable, List, Mapping, Optional

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

VALID_TABS = ("sequence", "adjustments", "system", "processing", "other")
TAB_ALIASES = {
    "adjust": "adjustments",
    "adjustment": "adjustments",
    "seq": "sequence",
    "proc": "processing",
}


def normalize_tab(tab: Optional[str]) -> str:
    raw = (tab or "sequence").strip().lower()
    mapped = TAB_ALIASES.get(raw, raw)
    return mapped if mapped in VALID_TABS else "sequence"


_UNSET = object()


class Param:
    """Descriptor for a pulse-sequence input that the Imaging Console can render."""

    def __init__(
        self,
        default: Any,
        *,
        title: Optional[str] = None,
        unit: Optional[str] = None,
        tab: Any = _UNSET,
        minimum: Optional[float] = None,
        maximum: Optional[float] = None,
        enum: Optional[Iterable[str]] = None,
        description: Optional[str] = None,
        step: Optional[float] = None,
    ) -> None:
        self.default = default
        self.title = title
        self.unit = unit
        self._tab_explicit = tab is not _UNSET
        self.tab = normalize_tab("sequence" if tab is _UNSET else tab)
        self.minimum = minimum
        self.maximum = maximum
        self.enum = list(enum) if enum is not None else None
        self.description = description
        self.step = step
        self.public_name = ""
        self.attr_name = ""
        self._storage = ""

    def __set_name__(self, owner: type, name: str) -> None:
        if not name.startswith("param_"):
            raise TypeError(
                f"{owner.__name__}.{name} uses param() but is not named param_<Field>. "
                "The Imaging Console maps param_TE → the TE input."
            )
        self.attr_name = name
        self.public_name = name[len("param_") :]
        self._storage = f"_seq_{name}"

    def __get__(self, obj: Any, objtype: Optional[type] = None) -> Any:
        if obj is None:
            return self
        return getattr(obj, self._storage, self.default)

    def __set__(self, obj: Any, value: Any) -> None:
        object.__setattr__(obj, self._storage, value)

    def to_meta(self) -> Dict[str, Any]:
        meta: Dict[str, Any] = {}
        if self._tab_explicit:
            meta["tab"] = self.tab
        if self.title:
            meta["title"] = self.title
        if self.unit:
            meta["unit"] = self.unit
        if self.minimum is not None:
            meta["minimum"] = self.minimum
        if self.maximum is not None:
            meta["maximum"] = self.maximum
        if self.enum:
            meta["enum"] = list(self.enum)
        if self.description:
            meta["description"] = self.description
        if self.step is not None:
            meta["step"] = self.step
        return meta


def param(
    default: Any,
    *,
    title: Optional[str] = None,
    unit: Optional[str] = None,
    tab: str = "sequence",
    minimum: Optional[float] = None,
    maximum: Optional[float] = None,
    enum: Optional[Iterable[str]] = None,
    description: Optional[str] = None,
    step: Optional[float] = None,
) -> Param:
    """Declare a console input. Use as ``param_TE = param(10, unit="ms")``."""
    return Param(
        default,
        title=title,
        unit=unit,
        tab=tab,
        minimum=minimum,
        maximum=maximum,
        enum=enum,
        description=description,
        step=step,
    )


def _is_param_method(value: Any) -> bool:
    return isinstance(value, (classmethod, staticmethod, property, FunctionType))


def collect_param_specs(cls: type) -> Dict[str, Param]:
    """Public name → Param spec for every ``param_*`` field on ``cls``."""
    specs: Dict[str, Param] = {}
    skip = {"object", "Generic", "SequenceBase", "PulseqSequence"}
    for klass in reversed(cls.__mro__):
        if klass.__name__ in skip:
            continue
        for name, value in klass.__dict__.items():
            if not name.startswith("param_") or _is_param_method(value):
                continue
            public = name[len("param_") :]
            if isinstance(value, Param):
                if not value.public_name:
                    value.public_name = public
                    value.attr_name = name
                specs[public] = value
            else:
                wrapped = Param(value)
                wrapped.public_name = public
                wrapped.attr_name = name
                specs[public] = wrapped
    return specs


def ui_meta_for_class(cls: type) -> Dict[str, Dict[str, Any]]:
    extra: Dict[str, Dict[str, Any]] = {}
    for public, spec in collect_param_specs(cls).items():
        extra[public] = spec.to_meta()
    overlay = getattr(cls, "parameter_ui", None)
    if isinstance(overlay, Mapping):
        for key, value in overlay.items():
            if not isinstance(value, Mapping):
                continue
            merged = {**extra.get(key, {}), **dict(value)}
            if "tab" in merged:
                merged["tab"] = normalize_tab(str(merged["tab"]))
            extra[key] = merged
    return extra


def attr_name_for(public: str, spec: Param) -> str:
    return spec.attr_name or f"param_{public}"


def coerce_param_value(default: Any, value: Any) -> Any:
    if value is None:
        return default
    if isinstance(default, bool):
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "yes", "on")
        return bool(value)
    if isinstance(default, int) and not isinstance(default, bool):
        return int(value)
    if isinstance(default, float):
        return float(value)
    return value


def schema_for_defaults(
    defaults: dict,
    extra_meta: Optional[Mapping[str, Mapping[str, Any]]] = None,
) -> dict:
    extra = extra_meta or {}
    properties: Dict[str, Any] = {}
    keys: List[str] = list(defaults.keys())
    for key in extra:
        if key not in keys and "default" in extra[key]:
            keys.append(key)
            defaults = {**defaults, key: extra[key]["default"]}
    for key in keys:
        value = defaults[key]
        meta = {**PARAM_META.get(key, {}), **dict(extra.get(key, {}))}
        if "tab" in meta:
            meta["tab"] = normalize_tab(str(meta["tab"]))
        prop: Dict[str, Any] = {
            "title": meta.get("title", key.replace("_", " ")),
            "default": value,
        }
        if "enum" in meta:
            prop["type"] = "string"
            prop["enum"] = list(meta["enum"])
        elif isinstance(value, bool):
            prop["type"] = "boolean"
        elif isinstance(value, int) and not isinstance(value, bool):
            prop["type"] = "integer"
        elif isinstance(value, float):
            prop["type"] = "number"
        else:
            prop["type"] = "string"
        for field in ("unit", "minimum", "maximum", "description", "step"):
            if field in meta and meta[field] is not None:
                prop[field] = meta[field]
        prop["tab"] = meta.get("tab", "sequence")
        properties[key] = prop
    return {
        "type": "object",
        "properties": properties,
        "additionalProperties": True,
    }
