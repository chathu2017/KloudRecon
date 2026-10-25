import * as React from 'react';
import { cn } from '@/lib/utils';

/** True when motion should be skipped: reduced-motion users, or no matchMedia (tests, SSR). */
function motionOff(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Counts a number up from 0 once per value (decision 0043: KPI count-up). Shows the final value
 * immediately under reduced motion. Layout-stable: tabular digits and a min-width in `ch` for the
 * final value while animating; screen readers only ever get the final value.
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration = 900,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  // progress 0..1 of the animation for the current value; 1 = done
  const [progress, setProgress] = React.useState(() => (motionOff() ? 1 : 0));
  React.useEffect(() => {
    if (motionOff()) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  const final = format(value);
  if (progress >= 1 || motionOff()) return <span className={cn('tabular', className)}>{final}</span>;
  const eased = 1 - (1 - progress) ** 3;
  return (
    <span className={cn('inline-block tabular', className)} style={{ minWidth: `${final.length}ch` }}>
      <span aria-hidden>{format(value * eased)}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

/** Small trend line for KPI cards. Decorative when `label` is not given. */
export function MiniSparkline({
  values,
  label,
  tone = 'brand',
  className,
}: {
  values: number[];
  label?: string;
  tone?: 'brand' | 'critical' | 'success' | 'muted';
  className?: string;
}) {
  const id = React.useId();
  if (values.length < 2) return null;
  const w = 88;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const color = {
    brand: 'text-brand',
    critical: 'text-critical',
    success: 'text-success',
    muted: 'text-subtle',
  }[tone];
  const last = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-7 w-[88px] shrink-0 overflow-visible', color, className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" />}
    </svg>
  );
}

/** Direction chip for a change between two scans; `goodWhen` says which direction is good. */
export function Delta({
  value,
  goodWhen = 'up',
  suffix = '',
  className,
}: {
  value: number | null | undefined;
  goodWhen?: 'up' | 'down' | 'neutral';
  suffix?: string;
  className?: string;
}) {
  if (value === null || value === undefined) return null;
  const up = value > 0;
  const flat = value === 0;
  const good = goodWhen === 'neutral' || flat ? null : (goodWhen === 'up') === up;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm px-1 font-mono text-[11px] font-medium tabular',
        good === null ? 'bg-surface-2 text-muted' : good ? 'bg-success-soft text-success-strong' : 'bg-critical-soft text-critical-strong',
        className,
      )}
    >
      <span aria-hidden>{flat ? '±' : up ? '▲' : '▼'}</span>
      <span className="sr-only">{flat ? 'no change' : up ? 'up' : 'down'} </span>
      {Math.abs(value).toLocaleString()}
      {suffix}
    </span>
  );
}
