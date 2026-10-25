import { describe, expect, it } from 'vitest';
import css from './tokens.css?raw';

/** WCAG 2.1 contrast of every text/background pair the UI uses, in both themes (decisions 0041, 0043 and 0044). */

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)) vars[m[1] ?? ''] = m[2] ?? '';
  return vars;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(':root');
const dark = { ...light, ...block("[data-theme='dark']") };

// [text token, background token, minimum ratio]
const PAIRS: [string, string, number][] = [
  ...['bg', 'surface', 'surface-2'].flatMap((bg) =>
    ['text', 'text-muted', 'text-subtle'].map((fg): [string, string, number] => [fg, bg, 4.5]),
  ),
  ['brand-fg', 'brand', 4.5],
  ['brand-fg', 'brand-hover', 4.5],
  // the sky-blue end of the brand gradient (buttons, the featured plan)
  ['brand-fg', 'brand-2', 4.5],
  ['brand-2', 'surface', 3],
  ['on-critical', 'critical', 4.5],
  ['brand-strong', 'surface', 4.5],
  ['brand-strong', 'bg', 4.5],
  ['brand-strong', 'surface-2', 4.5],
  ['accent-strong', 'accent-soft', 4.5],
  ['accent-strong', 'surface', 4.5],
  ['brand-strong', 'brand-soft', 4.5],
  ['text', 'brand-soft', 4.5],
  ['ink-fg', 'ink', 4.5],
  ['ink-fg', 'ink-hover', 4.5],
  // the petrol bands (how it works, CTA box, featured plan): dark in both themes
  ['map-text', 'map-bg', 4.5],
  ['map-text', 'map-surface', 4.5],
  ['map-muted', 'map-bg', 4.5],
  ['map-muted', 'map-surface', 4.5],
  ['map-brand-fg', 'map-brand', 4.5],
  ['map-brand', 'map-bg', 4.5],
  ['map-brand', 'map-surface', 4.5],
  // white text on the brand fill (the featured plan tile)
  ['brand-fg', 'brand', 4.5],
  ...['brand', 'critical', 'high', 'medium', 'low', 'info', 'success'].flatMap((k): [string, string, number][] => [
    [`${k}-strong`, `${k}-soft`, 4.5],
    [`${k}-strong`, 'surface', 4.5],
  ]),
  // non-text: icons, bars and chart series against the surface (WCAG 1.4.11)
  ...['critical', 'high', 'medium', 'success', 'brand', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7'].map(
    (k): [string, string, number] => [k, 'surface', 3],
  ),
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_name, vars) => {
  it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    const a = vars[fg];
    const b = vars[bg];
    expect(a, `--${fg} is defined`).toBeDefined();
    expect(b, `--${bg} is defined`).toBeDefined();
    expect(contrast(a ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
  });
});
