import { lightThemePalette, appliedConsoleTheme, type ConsoleTheme } from "./consoleTheme";
import type { EChartsOption, LineSeriesOption } from "echarts";
import type { PlotAxes } from "./mri/api";

export const PLOT_SIGNAL = "#E0A526";
export const PLOT_FILL = "rgba(224, 165, 38, 0.08)";
export const PLOT_BG = "#090A0D";
export const PLOT_BORDER = "#363A43";
export const PLOT_GRID = "rgba(35, 38, 45, 0.58)";
export const PLOT_TICK = "#9CA3AF";
export const PLOT_TITLE = "#E5E7EB";
export const PLOT_LINEWIDTH = 1.75;

export function scientificPlotColors(theme: ConsoleTheme) {
  const palette = lightThemePalette(theme);
  return palette ? {
    signal: palette.accent, fill: palette["accent-soft"], bg: palette.surface,
    border: palette.border, grid: palette.border, tick: palette.muted,
    title: palette.text, tooltip: palette.surface,
  } : {
    signal: PLOT_SIGNAL, fill: PLOT_FILL, bg: PLOT_BG, border: PLOT_BORDER,
    grid: PLOT_GRID, tick: PLOT_TICK, title: PLOT_TITLE, tooltip: "#12141A",
  };
}
type PlotColors = ReturnType<typeof scientificPlotColors>;

function tickPlaces(value: number, span: number, maxPlaces: number): number {
  const step = Math.abs(span) / 4 || Math.abs(value);
  return Math.max(0, Math.min(maxPlaces, Math.ceil(-Math.log10(step))));
}

function expMantissaDigits(value: number, span: number): number {
  const abs = Math.abs(value) || 1;
  const step = Math.abs(span) / 4 || abs;
  const relative = step / abs;
  if (relative >= 0.15) return 0;
  if (relative >= 0.04) return 1;
  return 2;
}

/** Compact scientific notation: 6e-3, 1e-4, 3.7e-4 — no padded mantissa or exponent. */
export function formatExponential(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const [mant, exp] = value.toExponential(fractionDigits).split("e");
  const trimmed = mant.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return `${trimmed}e${Number(exp)}`;
}

export function formatAxisTick(value: number, span: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return span < 0.01 ? (span < 0.001 ? "0.0000" : "0.000") : "0";
  const places = tickPlaces(value, span, 6);
  if (Math.abs(value) >= 1e-6 && Math.abs(value) < 1e6) {
    return value.toFixed(places);
  }
  return formatExponential(value);
}

/** Compact y ticks use scientific notation when more than two decimal places are needed. */
export function formatYAxisTick(value: number, span: number, full = false): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return full && span < 0.01 ? (span < 0.001 ? "0.0000" : "0.000") : "0";
  const places = tickPlaces(value, span, full ? 10 : 6);
  if (!full && places > 2) return formatExponential(value, expMantissaDigits(value, span));
  if (full || (Math.abs(value) >= 1e-6 && Math.abs(value) < 1e6)) {
    return value.toFixed(places);
  }
  return formatExponential(value, expMantissaDigits(value, span));
}

function formatTooltipValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e-6 && abs < 1e6) {
    const places = Math.max(0, Math.min(8, 6 - Math.floor(Math.log10(abs))));
    return value.toFixed(places).replace(/\.?0+$/, "") || "0";
  }
  return String(value);
}

function lineData(series: PlotAxes["series"][number]): LineSeriesOption["data"] {
  return series.x.map((x, i) => {
    const y = series.y[i];
    if (x == null || y == null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
      return "-";
    }
    return [x, y];
  });
}

function lineSeries(trace: PlotAxes, colors: PlotColors, xAxisIndex = 0, yAxisIndex = 0): LineSeriesOption[] {
  const fill = trace.series.length === 1;
  return trace.series.map((series, index) => ({
    type: "line",
    name: series.name || trace.ylabel || trace.title || "signal",
    xAxisIndex,
    yAxisIndex,
    showSymbol: false,
    symbol: "none",
    large: (series.x?.length ?? 0) > 4000,
    clip: true,
    animation: false,
    lineStyle: {
      color: index === 0 ? colors.signal : colors.tick,
      width: PLOT_LINEWIDTH,
      cap: "round",
      join: "round",
    },
    itemStyle: { color: colors.signal },
    areaStyle: fill ? { color: colors.fill, opacity: 1, origin: 0 } : undefined,
    data: lineData(series),
    emphasis: { disabled: true },
  }));
}

function tooltipConfig(axes: PlotAxes[], colors: PlotColors): EChartsOption["tooltip"] {
  return {
    trigger: "axis",
    className: "ic-plot-tooltip",
    confine: true,
    renderMode: "html",
    backgroundColor: colors.tooltip,
    borderColor: colors.border,
    borderWidth: 1,
    padding: [6, 8],
    textStyle: { color: colors.title, fontSize: 11, fontFamily: "inherit" },
    extraCssText:
      "width:auto!important;height:auto!important;max-width:220px;box-shadow:none;border-radius:4px;pointer-events:none;white-space:nowrap;line-height:1.35;",
    axisPointer: {
      type: "cross",
      animation: false,
      lineStyle: { color: colors.tick, width: 1, type: "dashed", opacity: 0.7 },
      crossStyle: { color: colors.tick, width: 1, type: "dashed", opacity: 0.7 },
      label: { show: false },
    },
    formatter: (raw) => {
      const items = Array.isArray(raw) ? raw : [raw];
      const first = items[0] as { value?: unknown; axisIndex?: number };
      const pair = Array.isArray(first?.value) ? first.value : [];
      const x = Number(pair[0]);
      const y = Number(pair[1]);
      const panel = axes[Number(first?.axisIndex ?? 0)] ?? axes[0];
      const xLine = panel?.xlabel ? `${panel.xlabel}: ${formatTooltipValue(x)}` : formatTooltipValue(x);
      const yLine = panel?.ylabel ? `${panel.ylabel}: ${formatTooltipValue(y)}` : formatTooltipValue(y);
      return `${xLine}  ·  ${yLine}`;
    },
  };
}

function toolboxConfig(visible: boolean, colors: PlotColors): EChartsOption["toolbox"] {
  return {
    show: visible,
    itemSize: 13,
    top: 6,
    right: 8,
    iconStyle: { borderColor: colors.tick },
    emphasis: { iconStyle: { borderColor: colors.title } },
    feature: {
      restore: { title: "Reset view" },
    },
  };
}

function buildStackedPlotOption(axes: PlotAxes[], toolboxVisible: boolean, fullY: boolean, colors: PlotColors): EChartsOption {
  const n = axes.length;
  const hasTitle = Boolean(axes[0]?.title);
  const xMin = Math.min(...axes.map((trace) => trace.xmin));
  const xMax = Math.max(...axes.map((trace) => trace.xmax));
  const xSpan = Math.abs(xMax - xMin);
  const header = hasTitle ? 0.05 : 0.02;
  const footer = 0.16;
  const gap = 0.012;
  const height = (1 - header - footer - gap * (n - 1)) / n;
  const xlabel = [...axes].reverse().find((trace) => trace.xlabel)?.xlabel || "";
  return {
    backgroundColor: colors.bg,
    animation: false,
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    title: hasTitle
      ? {
          text: axes[0].title,
          left: "center",
          top: 4,
          textStyle: {
            color: colors.title,
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "inherit",
          },
        }
      : undefined,
    grid: axes.map((_, i) => ({
      left: fullY ? 88 : 78,
      right: 16,
      top: `${(header + i * (height + gap)) * 100}%`,
      height: `${height * 100}%`,
      containLabel: false,
    })),
    tooltip: tooltipConfig(axes, colors),
    legend: { show: false },
    toolbox: toolboxConfig(toolboxVisible, colors),
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: axes.map((_, i) => i),
        filterMode: "none",
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        throttle: 16,
      },
    ],
    xAxis: axes.map((_, i) => ({
      type: "value" as const,
      gridIndex: i,
      min: xMin,
      max: xMax,
      name: i === n - 1 ? xlabel || undefined : undefined,
      nameLocation: "middle" as const,
      nameGap: xlabel ? 18 : 0,
      nameTextStyle: { color: colors.tick, fontSize: 11 },
      axisLine: { lineStyle: { color: colors.border, width: 1 } },
      axisTick: { show: i === n - 1, lineStyle: { color: colors.tick, width: 1 } },
      axisLabel: {
        show: i === n - 1,
        color: colors.tick,
        fontSize: 11,
        hideOverlap: true,
        margin: 8,
        formatter: (value: number) => formatAxisTick(value, xSpan),
      },
      splitLine: { show: true, lineStyle: { color: colors.grid, width: 1 } },
    })),
    yAxis: axes.map((trace, i) => {
      const ySpan = Math.abs(trace.ymax - trace.ymin);
      return {
        type: "value" as const,
        gridIndex: i,
        min: trace.ymin,
        max: trace.ymax,
        name: trace.ylabel || undefined,
        nameLocation: "middle" as const,
        nameGap: 48,
        nameRotate: 90,
        nameTextStyle: { color: colors.tick, fontSize: 11, padding: [0, 0, 0, 0] },
        scale: false,
        axisLine: { lineStyle: { color: colors.border, width: 1 } },
        axisTick: { show: true, lineStyle: { color: colors.tick, width: 1 } },
        axisLabel: {
          color: colors.tick,
          fontSize: 11,
          hideOverlap: true,
          margin: 8,
          formatter: (value: number) => formatYAxisTick(value, ySpan, fullY),
        },
        splitLine: { show: true, lineStyle: { color: colors.grid, width: 1 } },
      };
    }),
    series: axes.flatMap((trace, i) => lineSeries(trace, colors, i, i)),
  };
}

export function buildScientificPlotOption(
  axes: PlotAxes[],
  compact = false,
  toolboxVisible = false,
  fullY = false,
  theme: ConsoleTheme = appliedConsoleTheme(),
): EChartsOption {
  const colors = scientificPlotColors(theme);
  const trace = axes[0];
  if (!trace) return {};
  if (!compact && axes.length > 1) return buildStackedPlotOption(axes, toolboxVisible, fullY, colors);
  const xSpan = Math.abs(trace.xmax - trace.xmin);
  const ySpan = Math.abs(trace.ymax - trace.ymin);
  const named = trace.series.some((s) => {
    const name = s.name?.trim();
    return Boolean(name) && name !== trace.title && name !== trace.ylabel;
  });
  const hasTitle = Boolean(trace.title) && !compact;
  const yName = Boolean(!compact && trace.ylabel);
  const xName = Boolean(!compact && trace.xlabel);
  return {
    backgroundColor: colors.bg,
    animation: false,
    title: hasTitle
      ? {
          text: trace.title,
          left: "center",
          top: 6,
          textStyle: {
            color: colors.title,
            fontSize: 15,
            fontWeight: 500,
            fontFamily: "inherit",
          },
        }
      : undefined,
    grid: {
      left: compact ? 6 : fullY ? (yName ? 96 : 80) : yName ? 68 : 48,
      right: compact ? 6 : 16,
      top: compact ? 6 : hasTitle ? 34 : 12,
      bottom: compact ? 6 : xName ? 36 : 28,
      containLabel: false,
    },
    tooltip: compact ? { show: false } : tooltipConfig([trace], colors),
    legend: named && !compact ? { show: true, textStyle: { color: colors.tick }, top: 6, right: 28 } : { show: false },
    toolbox: compact ? { show: false } : toolboxConfig(toolboxVisible, colors),
    dataZoom: compact
      ? []
      : [
          { type: "inside", filterMode: "none", zoomOnMouseWheel: true, moveOnMouseMove: true, throttle: 16 },
        ],
    xAxis: {
      type: "value",
      min: trace.xmin,
      max: trace.xmax,
      name: compact ? undefined : trace.xlabel || undefined,
      nameLocation: "middle",
      nameGap: trace.xlabel ? 22 : 0,
      nameTextStyle: { color: colors.tick, fontSize: 11 },
      axisLine: { lineStyle: { color: colors.border, width: 1 } },
      axisTick: { show: true, lineStyle: { color: colors.tick, width: 1 } },
      axisLabel: {
        color: colors.tick,
        fontSize: 11,
        hideOverlap: true,
        margin: 8,
        formatter: (value: number) => formatAxisTick(value, xSpan),
      },
      splitLine: { show: true, lineStyle: { color: colors.grid, width: 1 } },
    },
    yAxis: {
      type: "value",
      min: trace.ymin,
      max: trace.ymax,
      name: yName ? trace.ylabel : undefined,
      nameLocation: "middle",
      nameGap: yName ? (fullY ? 72 : 52) : 0,
      nameRotate: 90,
      nameTextStyle: { color: colors.tick, fontSize: 11, align: "center", verticalAlign: "middle" },
      scale: false,
      axisLine: { lineStyle: { color: colors.border, width: 1 } },
      axisTick: { show: true, lineStyle: { color: colors.tick, width: 1 } },
      axisLabel: {
        color: colors.tick,
        fontSize: 11,
        hideOverlap: true,
        margin: 8,
        formatter: (value: number) => formatYAxisTick(value, ySpan, fullY),
      },
      splitLine: { show: true, lineStyle: { color: colors.grid, width: 1 } },
    },
    series: lineSeries(trace, colors),
  };
}
