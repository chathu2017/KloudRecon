import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared marketing building blocks (decision 0044, "Reference" style): the small uppercase teal
 * eyebrow, section headers, and the large diagonal shapes used behind the hero, page intros and
 * the featured plan. Markup never depends on the theme or on loaded data (prerendered pages).
 */

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('eyebrow', className)}>{children}</span>;
}

export function SectionHeader({
  eyebrow,
  title,
  text,
  align = 'left',
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  text?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div className={cn('reveal', align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="display-2 mt-3">{title}</h2>
      {text && <p className={cn('lede mt-4 text-muted', align === 'center' && 'mx-auto')}>{text}</p>}
    </div>
  );
}

/**
 * Large, quiet diagonal bands (the reference's geometric decoration). Decorative only; `tone`
 * picks the token pair: page backgrounds use `--shape`, the teal plan tile `--shape-on-brand`.
 */
export function Diagonals({ className, tone = 'page' }: { className?: string; tone?: 'page' | 'brand' }) {
  const fill = tone === 'brand' ? 'var(--shape-on-brand)' : 'var(--shape)';
  const strong = tone === 'brand' ? 'var(--shape-on-brand)' : 'var(--shape-strong)';
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 600 600"
      preserveAspectRatio="xMaxYMid slice"
      className={cn('pointer-events-none absolute', className)}
    >
      <path d="M330 0h170L230 600H60Z" fill={fill} />
      <path d="M520 0h80v130L330 600H200Z" fill={strong} />
      <path d="M600 260v340H440Z" fill={fill} />
    </svg>
  );
}

/** Intro band for secondary marketing pages (pricing, security): light, left-aligned. */
export function PageIntro({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-bg">
      <div aria-hidden className="aurora aurora-fade-top -z-10" />
      <Diagonals className="inset-y-0 right-0 -z-10 hidden h-full w-[46%] md:block" />
      <div className="mk-container pb-16 pt-14 sm:pb-20 sm:pt-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display-1 text-gradient mt-4 max-w-[18ch] pb-1">{title}</h1>
        <p className="lede mt-5 text-muted">{text}</p>
        {children}
      </div>
    </section>
  );
}
