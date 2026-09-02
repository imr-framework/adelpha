"""Sequence catalog for the API. Uses SequenceBase when the MRI4ALL env is available."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from common.parameter_schema import schema_for_defaults
import common.logger as logger

from services.api.models import SequenceInfo, ValidateResponse

log = logger.get_logger()

FALLBACK: List[SequenceInfo] = [
    SequenceInfo(
        id="rf_se",
        name="RF Spin-Echo",
        description="Acquisition of a single spin-echo without switching any gradients",
        defaults={
            "TE": 10,
            "TR": 250,
            "NSA": 1,
            "ADC_samples": 512,
            "ADC_duration": 5120,
            "debug_plot": True,
        },
    ),
    SequenceInfo(
        id="tse_3D",
        name="3D Turbo Spin-Echo",
        description="volumetric 3D TSE acquisition with Cartesian sampling",
        defaults={
            "TE": 15,
            "TR": 1000,
            "ETL": 8,
            "NSA": 1,
            "Orientation": "Axial",
            "FOV": 15,
            "Base_Resolution": 32,
            "Slices": 8,
            "BW": 32000,
            "Trajectory": "Cartesian",
            "Ordering": "center_out",
            "Plot_Timing": False,
        },
    ),
    SequenceInfo(
        id="tse_2D",
        name="2D Turbo Spin-Echo",
        description="",
        defaults={"TE": 70, "TR": 250},
    ),
    SequenceInfo(
        id="gre_3D",
        name="3D Gradient Echo",
        description="Volumetric 3D GRE acquisition with Cartesian sampling",
        defaults={
            "TE": 0,
            "TR": 1000,
            "NSA": 1,
            "orientation": "Axial",
            "FOV": 15,
            "baseresolution": 32,
            "slices": 8,
            "BW": 32000,
            "trajectory": "Cartesian",
            "ordering": "linear_up",
            "FA": 20,
        },
    ),
    SequenceInfo(
        id="se_2D",
        name="2D Spin-Echo",
        defaults={
            "TE": 20,
            "TR": 3000,
            "NSA": 1,
            "FOV": 20,
            "Orientation": "Axial",
            "Base_Resolution": 96,
            "BW": 32000,
            "Trajectory": "Cartesian",
            "PE_Ordering": "Center_out",
            "PF": 1,
            "view_traj": True,
        },
    ),
    SequenceInfo(
        id="FID",
        name="FID",
        defaults={"FA": 90, "ADC_samples": 4096, "ADC_duration": 6400},
    ),
    SequenceInfo(
        id="noisescan",
        name="Noise scan",
        defaults={
            "TE": 70,
            "TR": 250,
            "NSA": 1,
            "ADC_samples": 4096,
            "ADC_duration": 6400,
            "debug_plot": True,
        },
    ),
    SequenceInfo(
        id="adj_frequency",
        name="Adjust frequency",
        adjustment=True,
        defaults={},
    ),
    SequenceInfo(
        id="adj_shim_amplitude",
        name="Adjust shim",
        adjustment=True,
        defaults={},
    ),
]


def _with_schema(info: SequenceInfo) -> SequenceInfo:
    info.parameter_schema = schema_for_defaults(info.defaults)
    return info


for _item in FALLBACK:
    _with_schema(_item)

_registry_cache: Optional[List[SequenceInfo]] = None
_tried_registry = False


def _from_registry() -> Optional[List[SequenceInfo]]:
    global _registry_cache, _tried_registry
    if _tried_registry:
        return _registry_cache
    _tried_registry = True
    try:
        from common.qtcompat import configure_headless

        configure_headless()
        from sequences import SequenceBase

        items: List[SequenceInfo] = []
        for key in SequenceBase.installed_sequences():
            cls = SequenceBase.get_sequence(key)
            defaults = cls.get_default_parameters()
            schema = (
                cls.get_parameter_schema()
                if hasattr(cls, "get_parameter_schema")
                else schema_for_defaults(defaults)
            )
            items.append(
                SequenceInfo(
                    id=key,
                    name=cls.get_readable_name(),
                    description=cls.get_description() if hasattr(cls, "get_description") else "",
                    adjustment=key.startswith("adj_") or key.startswith("prescan_"),
                    defaults=defaults,
                    parameter_schema=schema,
                )
            )
        _registry_cache = items
        log.info("Sequence registry loaded")
    except Exception as exc:
        log.warning("Sequence registry unavailable — using fallback catalog (%s)", exc)
        _registry_cache = None
    return _registry_cache


def list_sequences(include_adjustments: bool = False) -> List[SequenceInfo]:
    items = _from_registry() or FALLBACK
    if include_adjustments:
        return items
    return [s for s in items if not s.adjustment]


def get_sequence_info(sequence_id: str) -> Optional[SequenceInfo]:
    for item in (_from_registry() or FALLBACK):
        if item.id == sequence_id:
            return item
    return None


def validate_parameters(sequence_id: str, parameters: Dict[str, Any], scan_task: Any) -> ValidateResponse:
    info = get_sequence_info(sequence_id)
    if info is None:
        return ValidateResponse(ok=False, problems=[f"Unknown sequence {sequence_id}"])

    try:
        from sequences import SequenceBase

        if sequence_id in SequenceBase.installed_sequences():
            instance = SequenceBase.get_sequence(sequence_id)()
            merged = {**instance.get_default_parameters(), **parameters}
            ok = instance.set_parameters(merged, scan_task)
            problems = instance.get_problems() if hasattr(instance, "get_problems") else []
            if not ok and not problems:
                problems = ["Invalid parameters"]
            return ValidateResponse(ok=bool(ok), problems=list(problems))
    except Exception as exc:
        log.info("Registry validate unavailable (%s); using schema checks", exc)

    problems: List[str] = []
    te = parameters.get("TE")
    tr = parameters.get("TR")
    try:
        if te is not None and tr is not None and float(te) > float(tr):
            problems.append("TE cannot be longer than TR")
    except (TypeError, ValueError):
        problems.append("TE/TR must be numeric")
    return ValidateResponse(ok=len(problems) == 0, problems=problems)


def registry_loaded() -> bool:
    return _from_registry() is not None


def reset_registry_cache() -> None:
    global _registry_cache, _tried_registry
    _registry_cache = None
    _tried_registry = False
