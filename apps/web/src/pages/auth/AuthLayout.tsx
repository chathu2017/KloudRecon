import { Check } from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { cn } from '@/lib/utils';

const POINTS = [
  'Read-only access. We never need write permissions.',
  'Your client secret lives only in Azure Key Vault.',
  'No agents to install. Connect in about three minutes.',
];

/** Split layout for sign-in, sign-up, onboarding and account status pages. */
export function AuthLayout({
  children,
  aside = true,
}: {
  children: React.ReactNode;
  aside?: boolean;
}) {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {aside && (
        <aside className="relative isolate m-3 hidden overflow-hidden rounded-2xl bg-map-bg text-map-text lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
          {/* background animation: a drifting wash and a slow radar sweep (the logo's motif) */}
          <div aria-hidden className="aurora aurora-dark -z-10" />
          <div aria-hidden className="radar -z-10">
            <span className="radar-blip left-[30%] top-[38%]" />
            <span className="radar-blip left-[58%] top-[24%] [animation-delay:1.6s]" />
            <span className="radar-blip left-[44%] top-[66%] [animation-delay:3.1s]" />
          </div>
          <Link to="/" className="w-fit" aria-label="KloudRecon home">
            <Logo size="xl" className="text-map-text [&_.logo-suffix]:text-map-muted [&_path]:fill-map-brand" />
          </Link>
          <div className="max-w-lg">
            <p aria-hidden className="brand-mega">
              KloudRecon
            </p>
            <h2 className="display-2 mt-5 text-[34px] leading-[1.15]">Recon your Azure. Secure it. Optimize it.</h2>
            <p className="lede mt-5 text-map-muted">
              Inventory, architecture diagrams, security posture, compliance mapping and FinOps in
              one read-only view of your Azure estate.
            </p>
            <ul className="mt-8 space-y-3.5">
              {POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-md">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-map-brand text-map-brand-fg">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-map-muted">KloudRecon by KloudSchool</p>
        </aside>
      )}
      <div className="relative isolate flex flex-col overflow-hidden">
        <div aria-hidden className="aurora -z-10 opacity-60" />
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <Link to="/" className={aside ? 'lg:invisible' : undefined}>
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 pt-4 sm:px-6">
          <div className={cn('w-full', aside ? 'glass max-w-[480px] rounded-2xl p-6 sm:p-9' : 'max-w-md')}>{children}</div>
        </div>
      </div>
    </div>
  );
}
