import ReactEChartsCoreModule from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, TreemapChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { cn } from '@/lib/utils';

// echarts-for-react ships CommonJS: under Vite the default import can be the module object.
const ReactEChartsCore =
  (ReactEChartsCoreModule as unknown as { default?: typeof ReactEChartsCoreModule }).default ??
  ReactEChartsCoreModule;

echarts.use([
  BarChart,
  LineChart,
  TreemapChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  VisualMapComponent,
  DataZoomComponent,
  SVGRenderer,
]);

export function EChart({
  option,
  height = 280,
  className,
  ariaLabel,
  onEvents,
}: {
  option: EChartsCoreOption;
  height?: number;
  className?: string;
  ariaLabel: string;
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  return (
    <div role="img" aria-label={ariaLabel} className={cn('w-full', className)}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        opts={{ renderer: 'svg' }}
        style={{ height, width: '100%' }}
        onEvents={onEvents}
      />
    </div>
  );
}
