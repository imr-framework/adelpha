import os
import sys

import matplotlib

matplotlib.use("Agg")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from matplotlib.colors import to_hex
from matplotlib.figure import Figure

from common.plotting import (
    PLOT_FILL_ALPHA,
    PLOT_LINEWIDTH,
    PLOT_SIGNAL,
    _FILL_GID,
    apply_plot_theme,
    extract_figure_series,
    render_figure_png,
    set_plotting_defaults,
)


def _adc_figure():
    fig = Figure()
    ax = fig.add_subplot(111)
    y = np.array([0.12, 0.48, 0.21, 1.37, 0.09], dtype=float)
    ax.plot(y)
    ax.set_title("ADC Signal")
    ax.set_xlabel("")
    ax.set_xlim(-0.2, 4.2)
    ax.set_ylim(0.0, 2.0)
    return fig, ax, y


def test_theme_preserves_mri4all_title_data_and_limits():
    fig, ax, y = _adc_figure()
    xlabel = ax.get_xlabel()
    ylabel = ax.get_ylabel()
    xticks = list(ax.get_xticks())
    apply_plot_theme(fig)
    xdata, ydata = ax.get_lines()[0].get_data()
    np.testing.assert_allclose(ydata, y)
    np.testing.assert_allclose(xdata, np.arange(len(y), dtype=float))
    assert ax.get_title(loc="left") == "ADC Signal"
    assert ax.get_title(loc="center") == ""
    assert ax.get_xlabel() == xlabel
    assert ax.get_ylabel() == ylabel
    np.testing.assert_allclose(ax.get_xlim(), (-0.2, 4.2))
    np.testing.assert_allclose(ax.get_ylim(), (0.0, 2.0))
    np.testing.assert_allclose(ax.get_xticks(), xticks)


def test_theme_uses_amber_line_and_translucent_fill():
    fig, ax, _ = _adc_figure()
    apply_plot_theme(fig)
    line = ax.get_lines()[0]
    assert to_hex(line.get_color()).lower() == PLOT_SIGNAL.lower()
    assert line.get_linewidth() == PLOT_LINEWIDTH
    fills = [c for c in ax.collections if c.get_gid() == _FILL_GID]
    assert len(fills) == 1
    assert abs(fills[0].get_alpha() - PLOT_FILL_ALPHA) < 1e-6
    apply_plot_theme(fig)
    assert len([c for c in ax.collections if c.get_gid() == _FILL_GID]) == 1


def test_theme_does_not_fill_image_axes():
    fig = Figure()
    ax = fig.add_subplot(111)
    ax.set_title("FFT of Signal - Grad_x")
    ax.imshow(np.arange(16).reshape(4, 4), cmap="gray")
    apply_plot_theme(fig)
    assert ax.get_title(loc="left") == "FFT of Signal - Grad_x"
    assert ax.images
    assert not [c for c in ax.collections if c.get_gid() == _FILL_GID]


def test_render_figure_png_and_defaults():
    set_plotting_defaults()
    fig, _, _ = _adc_figure()
    png = render_figure_png(fig, width_px=640, height_px=400, scale=1.0)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(png) > 200


def test_extract_figure_series_preserves_title_and_samples():
    fig, _, y = _adc_figure()
    payload = extract_figure_series(fig)
    assert payload is not None
    axis = payload["axes"][0]
    assert axis["title"] == "ADC Signal"
    assert axis["xlabel"] == ""
    assert axis["ylabel"] == ""
    np.testing.assert_allclose(axis["series"][0]["y"], y)
    np.testing.assert_allclose(axis["xmin"], -0.2)
    np.testing.assert_allclose(axis["ymax"], 2.0)
    assert extract_figure_series(fig)["axes"][0]["title"] == "ADC Signal"


def test_extract_skips_image_axes():
    fig = Figure()
    ax = fig.add_subplot(111)
    ax.set_title("k-space")
    ax.imshow(np.arange(16).reshape(4, 4), cmap="gray")
    assert extract_figure_series(fig) is None
