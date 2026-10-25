import * as React from 'react';
import type { EChartsCoreOption } from 'echarts/core';

/**
 * Categorical order for the palette (decisions 0043, 0044): brand teal first, then hues that
 * alternate warm/cool so neighbours stay apart for color-vision deficiencies (teal, blue, amber,
 * violet, rose, green, sky, slate). Colors always follow the entity (a series keeps its slot when
 * others are filtered out); charts with several series also differ by line style or labels.
 */
const SERIES_TOKENS = [1, 2, 3, 4, 6, 5, 7, 8].map((n) => `--chart-${n}`);
const FONT_TEXT = "'Manrope', 'Manrope Fallback', 'Segoe UI', sans-serif";
const FONT_MONO = "'JetBrains Mono', 'JetBrains Fallback', Consolas, monospace";
const SEQ_TOKENS = [1, 2, 3, 4, 5, 6].map((n) => `--seq-${n}`);

export interface ChartTheme {
  mode: 'light' | 'dark';
  series: string[];
  seq: string[];
  text: string;
  muted: string;
  subtle: string;
  border: string;
  surface: string;
  surface2: string;
  band: string;
  /** top and bottom of the soft fill under a line (reference chart style) */
  fill: string;
  fillEnd: string;
  brand: string;
  critical: string;
  success: string;
  medium: string;
}

function cssVar(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim();
}

function readTheme(): ChartTheme {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return {
    mode: root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
    series: SERIES_TOKENS.map((t) => cssVar(style, t)),
    seq: SEQ_TOKENS.map((t) => cssVar(style, t)),
    text: cssVar(style, '--text'),
    muted: cssVar(style, '--text-muted'),
    subtle: cssVar(style, '--text-subtle'),
    border: cssVar(style, '--border'),
    surface: cssVar(style, '--surface'),
    surface2: cssVar(style, '--surface-2'),
    band: cssVar(style, '--band'),
    fill: cssVar(style, '--chart-fill'),
    fillEnd: cssVar(style, '--chart-fill-end'),
    brand: cssVar(style, '--brand'),
    critical: cssVar(style, '--critical'),
    success: cssVar(style, '--success'),
    medium: cssVar(style, '--medium'),
  };
}

/** Chart colors from the design tokens; re-read whenever the theme attribute changes. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = React.useState<ChartTheme>(readTheme);
  React.useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/** The soft teal fill under a single line: a vertical gradient that fades to nothing. */
export function softFill(t: ChartTheme) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: t.fill },
      { offset: 1, color: t.fillEnd },
    ],
  };
}

/** Axis, grid and tooltip styling shared by every chart. */
export function baseOption(t: ChartTheme): EChartsCoreOption {
  const axisLabel = {
    color: t.muted,
    fontSize: 11,
    fontFamily: FONT_TEXT,
  };
  return {
    color: t.series,
    textStyle: { fontFamily: FONT_TEXT, color: t.text },
    animationDuration: 500,
    animationEasing: 'cubicOut',
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: t.text, fontSize: 12, fontFamily: FONT_TEXT },
      extraCssText: 'box-shadow: var(--shadow-md); border-radius: 12px; font-variant-numeric: tabular-nums;',
      axisPointer: { lineStyle: { color: t.subtle, type: 'dashed' }, crossStyle: { color: t.subtle } },
    },
    // Legend is opt-in (show: true) for charts with two or more series.
    legend: {
      show: false,
      textStyle: { color: t.muted, fontSize: 12 },
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      type: 'scroll',
      pageTextStyle: { color: t.muted },
    },
    xAxis: {
      axisLine: { lineStyle: { color: t.border } },
      axisTick: { show: false },
      axisLabel,
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      // values are numbers: JetBrains Mono, tabular
      axisLabel: { ...axisLabel, fontFamily: FONT_MONO },
      splitLine: { lineStyle: { color: t.border, type: [3, 5] } },
    },
  };
}

/** Compact currency for axes and labels: $38.8k, $1.2M. */
export function compactMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function money(value: number | null | undefined, currency = 'USD', digits = 0): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  });
}
