import * as React from 'react';
import { cn } from '@/lib/utils';
import { CountUp } from './primitives';

/**
 * KloudRecon Score gauge: a 270° instrument dial with ticks every 10 points; the arc fills once on
 * mount and the number counts up (static under reduced motion). Tone follows the grade bands.
 */
export function ScoreRing({
  score,
  label,
  size = 148,
  stroke = 10,
  className,
}: {
  score: number | null | undefined;
  label?: React.ReactNode;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const [drawn, setDrawn] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const r = (size - stroke) / 2 - 6;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const value = Math.max(0, Math.min(100, score ?? 0));
  const tone =
    score === null || score === undefined
      ? 'text-subtle'
      : value >= 90
        ? 'text-success'
        : value >= 75
          ? 'text-brand'
          : value >= 60
            ? 'text-medium'
            : value >= 40
              ? 'text-high'
              : 'text-critical';
  const mid = size / 2;
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = ((135 + i * 27) * Math.PI) / 180;
    const r1 = r + stroke / 2 + 3;
    const r2 = r1 + (i % 5 === 0 ? 6 : 3.5);
    return { x1: mid + r1 * Math.cos(a), y1: mid + r1 * Math.sin(a), x2: mid + r2 * Math.cos(a), y2: mid + r2 * Math.sin(a) };
  });
  return (
    <div className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score ?? 'not available'} of 100`}>
        {ticks.map((t, i) => (
          <line key={i} {...t} className="stroke-border-strong" strokeWidth={1.25} strokeLinecap="round" />
        ))}
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-surface-3"
          strokeDasharray={`${arc} ${c}`}
          transform={`rotate(135 ${mid} ${mid})`}
        />
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          className={cn('transition-[stroke-dasharray] duration-1000 ease-out', tone)}
          strokeDasharray={`${drawn ? (arc * value) / 100 : 0} ${c}`}
          transform={`rotate(135 ${mid} ${mid})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span className="font-mono text-[36px] font-medium leading-none tracking-[-0.03em] tabular">
          {score === null || score === undefined ? '—' : <CountUp value={score} />}
        </span>
        {label && <span className="mt-1.5 text-xs font-medium text-muted">{label}</span>}
      </div>
    </div>
  );
}

/** Horizontal meter for a 0-100 value. */
export function Meter({ value, className }: { value: number | null | undefined; className?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const tone = value === null || value === undefined ? 'bg-surface-3' : v >= 90 ? 'bg-success' : v >= 75 ? 'bg-brand' : v >= 60 ? 'bg-medium' : v >= 40 ? 'bg-high' : 'bg-critical';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)} aria-hidden>
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${v}%` }} />
    </div>
  );
}

export interface StackSeries {
  key: string;
  label: string;
  className: string; // a bg-* token class
}

/** Stacked vertical bars (e.g. open findings by severity per scan). */
export function StackedBars({
  data,
  series,
  labelKey,
  height = 140,
  ariaLabel,
}: {
  data: Record<string, unknown>[];
  series: StackSeries[];
  labelKey: string;
  height?: number;
  ariaLabel: string;
}) {
  const totals = data.map((d) => series.reduce((s, x) => s + Number(d[x.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  if (!data.length) return <p className="text-sm text-muted">No data yet.</p>;
  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${String(d[labelKey])}: ${totals[i] ?? 0}`}>
            {series.map((s) => {
              const v = Number(d[s.key] ?? 0);
              if (!v) return null;
              return <div key={s.key} className={cn('w-full first:rounded-t-sm', s.className)} style={{ height: `${(v / max) * 100}%` }} />;
            })}
            <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-text px-1.5 py-0.5 text-[10px] text-bg tabular group-hover:block">
              {totals[i]}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 truncate text-center text-[10px] text-subtle tabular">
            {String(d[labelKey])}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className={cn('size-2 rounded-sm', s.className)} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A simple line chart for scores over time (0-100), in the reference style: teal line over a soft
 * teal fill. It grows to fill its container's height (min 96px), so cards never leave a gap.
 */
export function LineChart({
  values,
  labels,
  height = 96,
  ariaLabel,
  className,
}: {
  values: (number | null)[];
  labels?: string[];
  height?: number;
  ariaLabel: string;
  className?: string;
}) {
  const id = React.useId();
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <p className="text-sm text-muted">A trend appears after two scans.</p>;
  const w = 320;
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v: number) => height - 8 - (v / 100) * (height - 16);
  const line = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <div className={cn('flex min-h-24 flex-col', className)}>
      <svg viewBox={`0 0 ${w} ${height}`} className="min-h-24 w-full flex-1" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-fill)" />
            <stop offset="1" stopColor="var(--chart-fill-end)" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((g) => (
          <line key={g} x1={0} x2={w} y1={y(g)} y2={y(g)} className="stroke-border" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        <polyline points={`${x(pts[0]?.i ?? 0)},${height} ${line} ${x(last?.i ?? 0)},${height}`} fill={`url(#${id})`} stroke="none" />
        <polyline points={line} fill="none" stroke="var(--chart-1)" strokeWidth={2.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labels && (
        <div className="mt-2 flex justify-between text-[11px] text-muted tabular">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

/** Horizontal bar list with labels and counts. */
export function BarRows({ rows, className }: { rows: { key: string; label: React.ReactNode; value: number; tone?: string }[]; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className={cn('space-y-2', className)}>
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="tabular text-muted">{r.value.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div className={cn('h-full rounded-full', r.tone ?? 'bg-brand')} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
