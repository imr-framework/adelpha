"""Unit tests for thermal→B0 physics models."""

from __future__ import annotations

import pytest

from dtam.digital_twin.models import ResonantFrequencyModel, ThermalToB0Model


def test_thermal_to_b0_linear_coupling() -> None:
    model = ThermalToB0Model()
    delta_b0 = model.delta_b0_tesla(2.0)
    assert delta_b0 == pytest.approx(2.0 * model.params.alpha_t_tesla_per_c)
    b0 = model.b0_tesla(0.048, 2.0)
    assert b0 == pytest.approx(0.048 + delta_b0)


def test_resonant_frequency_matches_gamma() -> None:
    model = ResonantFrequencyModel()
    f0_hz = model.frequency_hz(0.048)
    assert f0_hz == pytest.approx(42_577_478.92 * 0.048)
    assert model.frequency_mhz(0.048) == pytest.approx(f0_hz / 1e6)
