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

function lineSeries(trace: PlotAxes): LineSeriesOption[] {
  const fill = trace.series.length === 1;
  return trace.series.map((series, index) => ({
    type: "line",
    name: series.name || trace.title || "signal",
    showSymbol: false,
    symbol: "none",
    large: (series.x?.length ?? 0) > 4000,
    clip: true,
    animation: false,
    lineStyle: {
      color: index === 0 ? PLOT_SIGNAL : PLOT_TICK,
      width: PLOT_LINEWIDTH,
      cap: "round",
      join: "round",
    },
    itemStyle: { color: PLOT_SIGNAL },
    areaStyle: fill ? { color: PLOT_FILL, opacity: 1 } : undefined,
    data: series.x.map((x, i) => [x, series.y[i] ?? null]),
    emphasis: { disabled: true },
  }));
}

export function buildScientificPlotOption(
  axes: PlotAxes[],
  compact = false,
  toolboxVisible = false,
  fullY = false,
): EChartsOption {
  const trace = axes[0];
  if (!trace) return {};
  const xSpan = Math.abs(trace.xmax - trace.xmin);
  const ySpan = Math.abs(trace.ymax - trace.ymin);
  const named = trace.series.some((s) => s.name);
  const hasTitle = Boolean(trace.title) && !compact;
  return {
    backgroundColor: PLOT_BG,
    animation: false,
    title: hasTitle
      ? {
          text: trace.title,
          left: "center",
          top: 6,
          textStyle: {
            color: PLOT_TITLE,
            fontSize: 15,
            fontWeight: 500,
            fontFamily: "inherit",
          },
        }
      : undefined,
    grid: {
      left: compact ? 6 : fullY ? 80 : 48,
      right: compact ? 6 : 16,
      top: compact ? 6 : hasTitle ? 34 : 12,
      bottom: compact ? 6 : 28,
      containLabel: false,
    },
    tooltip: compact
      ? { show: false }
      : {
          trigger: "axis",
          className: "ic-plot-tooltip",
          confine: true,
          renderMode: "html",
          backgroundColor: "#12141A",
          borderColor: PLOT_BORDER,
          borderWidth: 1,
          padding: [6, 8],
          textStyle: { color: PLOT_TITLE, fontSize: 11, fontFamily: "inherit" },
          extraCssText:
            "width:auto!important;height:auto!important;max-width:220px;box-shadow:none;border-radius:4px;pointer-events:none;white-space:nowrap;line-height:1.35;",
          axisPointer: {
            type: "cross",
            animation: false,
            lineStyle: { color: PLOT_TICK, width: 1, type: "dashed", opacity: 0.7 },
            crossStyle: { color: PLOT_TICK, width: 1, type: "dashed", opacity: 0.7 },
            label: { show: false },
          },
          formatter: (raw) => {
            const items = Array.isArray(raw) ? raw : [raw];
            const first = items[0] as { value?: unknown };
            const pair = Array.isArray(first?.value) ? first.value : [];
            const x = Number(pair[0]);
            const y = Number(pair[1]);
            const xLine = trace.xlabel ? `${trace.xlabel}: ${formatTooltipValue(x)}` : formatTooltipValue(x);
            const yLine = trace.ylabel ? `${trace.ylabel}: ${formatTooltipValue(y)}` : formatTooltipValue(y);
            return `${xLine}  ·  ${yLine}`;
          },
        },
    legend: named && !compact ? { show: true, textStyle: { color: PLOT_TICK }, top: 6, right: 28 } : { show: false },
    toolbox: compact
      ? { show: false }
      : {
          show: toolboxVisible,
          itemSize: 13,
          top: 6,
          right: 8,
          iconStyle: { borderColor: PLOT_TICK },
          emphasis: { iconStyle: { borderColor: PLOT_TITLE } },
          feature: {
            restore: { title: "Reset view" },
          },
        },
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
      nameTextStyle: { color: PLOT_TICK, fontSize: 11 },
      axisLine: { lineStyle: { color: PLOT_BORDER, width: 1 } },
      axisTick: { show: true, lineStyle: { color: PLOT_TICK, width: 1 } },
      axisLabel: {
        color: PLOT_TICK,
        fontSize: 11,
        hideOverlap: true,
        margin: 8,
        formatter: (value: number) => formatAxisTick(value, xSpan),
      },
      splitLine: { show: true, lineStyle: { color: PLOT_GRID, width: 1 } },
    },
    yAxis: {
      type: "value",
      min: trace.ymin,
      max: trace.ymax,
      name: compact ? undefined : trace.ylabel || undefined,
      nameTextStyle: { color: PLOT_TICK, fontSize: 11 },
      scale: false,
      axisLine: { lineStyle: { color: PLOT_BORDER, width: 1 } },
      axisTick: { show: true, lineStyle: { color: PLOT_TICK, width: 1 } },
      axisLabel: {
        color: PLOT_TICK,
        fontSize: 11,
        hideOverlap: true,
        margin: 8,
        formatter: (value: number) => formatYAxisTick(value, ySpan, fullY),
      },
      splitLine: { show: true, lineStyle: { color: PLOT_GRID, width: 1 } },
    },
    series: lineSeries(trace),
  };
}
