import { useEffect, useRef } from "react";
import { init, use } from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ECharts } from "echarts/core";
import type { PlotAxes } from "./mri/api";
import { buildScientificPlotOption } from "./scientificPlotTheme";

use([
  LineChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  AxisPointerComponent,
  DataZoomComponent,
  ToolboxComponent,
  LegendComponent,
  CanvasRenderer,
]);

function fitChart(chart: ECharts, el: HTMLElement) {
  const { width, height } = el.getBoundingClientRect();
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (w < 2 || h < 2) return;
  chart.resize({ width: w, height: h, silent: true });
}

export function ScientificPlot({
  axes,
  compact = false,
  fullY = false,
}: {
  axes: PlotAxes[];
  compact?: boolean;
  fullY?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const axesRef = useRef(axes);
  const compactRef = useRef(compact);
  const fullYRef = useRef(fullY);
  axesRef.current = axes;
  compactRef.current = compact;
  fullYRef.current = fullY;
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const chart = init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(
      buildScientificPlotOption(axesRef.current, compactRef.current, !compactRef.current, fullYRef.current),
      { notMerge: true },
    );
    fitChart(chart, el);
    const onDoubleClick = () => {
      chart.dispatchAction({ type: "restore" });
    };
    el.addEventListener("dblclick", onDoubleClick);
    const ro = new ResizeObserver(() => fitChart(chart, el));
    ro.observe(el);
    const onWin = () => fitChart(chart, el);
    window.addEventListener("resize", onWin);
    return () => {
      el.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("resize", onWin);
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);
  useEffect(() => {
    const chart = chartRef.current;
    const el = hostRef.current;
    if (!chart || !el) return;
    chart.setOption(buildScientificPlotOption(axes, compact, !compact, fullY), { notMerge: true });
    fitChart(chart, el);
  }, [axes, compact, fullY]);
  return <div ref={hostRef} className={`ic-scientific-plot${compact ? " is-compact" : ""}`} />;
}
