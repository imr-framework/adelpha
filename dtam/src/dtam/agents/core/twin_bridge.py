"""Map DTAM twin SystemState / tool payloads into assessment observations."""

from __future__ import annotations

from typing import Any

from dtam.agents.core.models import (
    DigitalTwinObservation,
    EMIObservation,
    MagnetObservation,
    SensorReading,
    ThermalObservation,
)
from dtam.digital_twin.state.system_state import SystemState
from dtam.domain.value_objects.frequency import PROTON_GAMMA_OVER_TWO_PI_HZ_PER_T


def observation_from_system_state(
    state: SystemState,
    *,
    synthetic: bool = True,
) -> DigitalTwinObservation:
    """Convert a twin snapshot into a DigitalTwinObservation for run_assessment."""
    thermal = None
    if state.thermal is not None:
        t = state.thermal
        sensors = [
            SensorReading(
                channel=ch.channel_id or f"temp_{i}",
                value=ch.value,
                unit=ch.unit,
                timestamp=ch.timestamp,
                quality=ch.confidence,
            )
            for i, ch in enumerate(t.channels)
        ]
        room = t.room_temperature_c.value if t.room_temperature_c else None
        mean_m = (
            t.mean_magnet_temperature_c.value if t.mean_magnet_temperature_c else None
        )
        thermal = ThermalObservation(
            sensors=sensors,
            ambient_c=room,
            magnet_temperature_c=mean_m,
        )

    magnet = None
    if state.magnetic is not None:
        m = state.magnetic
        f0_mhz = m.resonant_frequency_mhz.value if m.resonant_frequency_mhz else None
        magnet = MagnetObservation(
            center_frequency_hz=(f0_mhz * 1e6) if f0_mhz is not None else None,
            nominal_field_t=m.nominal_b0_t,
            nucleus="1H",
        )

    emi = None
    if state.emi is not None:
        e = state.emi
        peak = e.peak_frequency_hz.value if e.peak_frequency_hz else None
        emi = EMIObservation(
            rms=e.rms_v.value if e.rms_v else None,
            dominant_frequencies_hz=[peak] if peak is not None else [],
            spectral_peaks_hz=[peak] if peak is not None else [],
        )

    # RF match metrics are not in SystemState yet (noise-floor only).
    return DigitalTwinObservation(
        timestamp=state.timestamp,
        scanner_state=state.mode.value if state.mode else None,
        thermal=thermal,
        magnet=magnet,
        emi=emi,
        correlation_id=state.correlation_id,
        synthetic=synthetic,
        metadata={
            "twin_version": state.twin_version,
            "notes": list(state.notes),
            "gamma_over_two_pi_hz_per_t": PROTON_GAMMA_OVER_TWO_PI_HZ_PER_T,
        },
    )


def observation_from_twin_tool_payload(
    payload: dict[str, Any],
) -> DigitalTwinObservation:
    """Accept estimate_twin_state / API-shaped dicts containing snapshot_json."""
    data = payload.get("data", payload)
    snapshot = data.get("snapshot_json")
    if snapshot is None:
        raise ValueError("Expected twin payload with data.snapshot_json")
    state = SystemState.model_validate(snapshot)
    return observation_from_system_state(state)
