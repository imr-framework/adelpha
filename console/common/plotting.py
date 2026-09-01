"""Shared Adelpha scientific-plot theme.

Colors match Imaging Console CSS tokens (`--ic-plot-*` in `src/styles.css`).
This module restyles figure chrome only: backgrounds, spines, grid, typography,
and line/fill appearance. It must not change titles, axis labels, tick values,
limits, scale types, or plotted data.
"""

from __future__ import annotations

from io import BytesIO
from typing import Any

# Keep in sync with `.imaging-console` plot tokens in src/styles.css.
PLOT_BG = "#090A0D"
PLOT_BORDER = "#363A43"
PLOT_GRID = "#23262D"
PLOT_GRID_ALPHA = 0.58
PLOT_TICK = "#9CA3AF"
PLOT_TITLE = "#E5E7EB"
PLOT_SIGNAL = "#E0A526"
PLOT_LINEWIDTH = 1.75
PLOT_FILL_ALPHA = 0.08
PLOT_TITLE_SIZE = 15
PLOT_TICK_SIZE = 9
_FILL_GID = "adelpha-signal-fill"


def set_plotting_defaults() -> None:
    import matplotlib.pyplot as plt

    plt.rcParams.update(
        {
            "figure.facecolor": PLOT_BG,
            "axes.facecolor": PLOT_BG,
            "savefig.facecolor": PLOT_BG,
            "axes.edgecolor": PLOT_BORDER,
            "axes.linewidth": 0.8,
            "axes.grid": True,
            "grid.color": PLOT_GRID,
            "grid.alpha": PLOT_GRID_ALPHA,
            "grid.linewidth": 0.65,
            "xtick.color": PLOT_TICK,
            "ytick.color": PLOT_TICK,
            "xtick.labelsize": PLOT_TICK_SIZE,
            "ytick.labelsize": PLOT_TICK_SIZE,
            "text.color": PLOT_TITLE,
            "axes.labelcolor": PLOT_TICK,
            "axes.titlecolor": PLOT_TITLE,
            "axes.titlesize": PLOT_TITLE_SIZE,
            "axes.titleweight": 500,
            "axes.titlelocation": "left",
            "axes.titlepad": 10,
            "lines.linewidth": PLOT_LINEWIDTH,
            "lines.antialiased": True,
            "figure.autolayout": False,
        }
    )
    colors = plt.rcParams["axes.prop_cycle"].by_key()["color"]
    plt.rcParams["axes.prop_cycle"] = plt.cycler(color=[PLOT_SIGNAL] + [c for c in colors if c.lower() != PLOT_SIGNAL.lower()])


def apply_plot_theme(fig: Any) -> None:
    """Restyle an existing figure without altering its scientific content."""
    from matplotlib.collections import PolyCollection
    from matplotlib.lines import Line2D

    fig.patch.set_facecolor(PLOT_BG)
    fig.patch.set_edgecolor("none")
    suptitle = getattr(fig, "_suptitle", None)
    if suptitle is not None and suptitle.get_text():
        suptitle.set_fontsize(PLOT_TITLE_SIZE)
        suptitle.set_fontweight(500)
        suptitle.set_color(PLOT_TITLE)
    for ax in getattr(fig, "axes", []):
        xlim = ax.get_xlim()
        ylim = ax.get_ylim()
        if getattr(ax, "name", "") == "3d":
            _style_axes_chrome(ax)
            ax.set_xlim(xlim)
            ax.set_ylim(ylim)
            continue
        _style_axes_chrome(ax)
        for line in ax.get_lines():
            if not isinstance(line, Line2D):
                continue
            line.set_color(PLOT_SIGNAL)
            line.set_linewidth(PLOT_LINEWIDTH)
            line.set_antialiased(True)
            line.set_solid_capstyle("round")
            line.set_solid_joinstyle("round")
        _restyle_or_add_signal_fill(ax, PolyCollection)
        ax.set_xlim(xlim)
        ax.set_ylim(ylim)


def _style_axes_chrome(ax: Any) -> None:
    ax.set_facecolor(PLOT_BG)
    for spine in ax.spines.values():
        spine.set_color(PLOT_BORDER)
        spine.set_linewidth(0.8)
    title_text = ax.get_title(loc="center") or ax.get_title(loc="left") or ax.get_title(loc="right")
    if title_text:
        ax.set_title("", loc="center")
        ax.set_title("", loc="right")
        ax.set_title(
            title_text,
            loc="left",
            fontsize=PLOT_TITLE_SIZE,
            fontweight=500,
            color=PLOT_TITLE,
            pad=10,
        )
    ax.tick_params(
        axis="both",
        which="both",
        color=PLOT_TICK,
        labelcolor=PLOT_TICK,
        labelsize=PLOT_TICK_SIZE,
        width=0.8,
    )
    ax.xaxis.label.set_color(PLOT_TICK)
    ax.yaxis.label.set_color(PLOT_TICK)
    try:
        ax.grid(True, which="major", color=PLOT_GRID, alpha=PLOT_GRID_ALPHA, linewidth=0.65)
        ax.set_axisbelow(True)
    except Exception:
        pass
    legend = ax.get_legend()
    if legend is not None:
        legend.get_frame().set_facecolor(PLOT_BG)
        legend.get_frame().set_edgecolor(PLOT_BORDER)
        for text in legend.get_texts():
            text.set_color(PLOT_TICK)


def _restyle_or_add_signal_fill(ax: Any, poly_cls: type) -> None:
    if getattr(ax, "images", None):
        return
    existing = [c for c in ax.collections if getattr(c, "get_gid", lambda: None)() == _FILL_GID]
    if existing:
        for coll in existing:
            coll.set_facecolor(PLOT_SIGNAL)
            coll.set_edgecolor("none")
            coll.set_alpha(PLOT_FILL_ALPHA)
        return
    opaque_fills = [c for c in ax.collections if isinstance(c, poly_cls)]
    if opaque_fills:
        for coll in opaque_fills:
            coll.set_facecolor(PLOT_SIGNAL)
            coll.set_edgecolor("none")
            coll.set_alpha(PLOT_FILL_ALPHA)
            try:
                coll.set_gid(_FILL_GID)
            except Exception:
                pass
        return
    lines = [line for line in ax.get_lines() if line.get_linestyle() not in ("None", "none")]
    if len(lines) != 1:
        return
    line = lines[0]
    xdata, ydata = line.get_data()
    if getattr(xdata, "__len__", lambda: 0)() < 2:
        return
    coll = ax.fill_between(
        xdata,
        ydata,
        0,
        color=PLOT_SIGNAL,
        alpha=PLOT_FILL_ALPHA,
        linewidth=0,
        zorder=max(line.get_zorder() - 1, 0),
        gid=_FILL_GID,
    )
    coll.set_gid(_FILL_GID)


def render_figure_png(fig: Any, width_px: int = 0, height_px: int = 0, scale: float = 1.0) -> bytes:
    """Rasterize `fig` to PNG using the shared theme. Data and labels are unchanged."""
    apply_plot_theme(fig)
    dpi = 110.0
    try:
        scale = min(max(float(scale), 1.0), 2.5)
    except (TypeError, ValueError):
        scale = 1.0
    width_px = int(width_px or 0)
    height_px = int(height_px or 0)
    if width_px >= 120 and height_px >= 80:
        fig.set_size_inches(width_px / dpi, height_px / dpi, forward=True)
    try:
        fig.tight_layout(pad=0.25, h_pad=0.2, w_pad=0.2)
    except Exception:
        try:
            fig.subplots_adjust(left=0.12, right=0.995, top=0.88, bottom=0.14)
        except Exception:
            pass
    buf = BytesIO()
    fig.savefig(
        buf,
        format="png",
        dpi=dpi * scale,
        facecolor=fig.get_facecolor(),
        edgecolor="none",
    )
    return buf.getvalue()


def _json_floats(values: Any) -> list[float | None]:
    import numpy as np

    out: list[float | None] = []
    for value in np.asarray(values, dtype=float).ravel():
        if np.isfinite(value):
            out.append(float(value))
        else:
            out.append(None)
    return out


def extract_figure_series(fig: Any) -> dict[str, Any] | None:
    """Return line-plot arrays and existing labels. Does not alter data or titles."""
    axes_payload: list[dict[str, Any]] = []
    for ax in getattr(fig, "axes", []):
        if getattr(ax, "name", "") == "3d":
            return None
        if getattr(ax, "images", None):
            return None
        lines = [line for line in ax.get_lines() if line.get_linestyle() not in ("None", "none")]
        if len(lines) < 1:
            continue
        title = ax.get_title(loc="center") or ax.get_title(loc="left") or ax.get_title(loc="right")
        series = []
        for line in lines:
            xdata, ydata = line.get_data()
            label = line.get_label() or ""
            if label.startswith("_"):
                label = ""
            series.append(
                {
                    "name": label,
                    "x": _json_floats(xdata),
                    "y": _json_floats(ydata),
                }
            )
        if not series or len(series[0]["x"]) < 2:
            continue
        xmin, xmax = ax.get_xlim()
        ymin, ymax = ax.get_ylim()
        axes_payload.append(
            {
                "title": title or "",
                "xlabel": ax.get_xlabel() or "",
                "ylabel": ax.get_ylabel() or "",
                "xmin": float(xmin),
                "xmax": float(xmax),
                "ymin": float(ymin),
                "ymax": float(ymax),
                "series": series,
            }
        )
    if not axes_payload:
        return None
    return {"axes": axes_payload}
