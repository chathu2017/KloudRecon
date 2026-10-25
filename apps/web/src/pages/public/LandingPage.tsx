import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  FileText,
  Minus,
  Network,
  Route,
  ShieldCheck,
  TrendingDown,
  X,
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AzureLogo, SkyCloud } from '@/components/brand/AzureIcons';
import { LogoGlyph } from '@/components/brand/Logo';
import { Button, type ButtonProps } from '@/components/ui/button';
import { api, errorMessage, unwrap } from '@/lib/api/client';
import { startDemo } from '@/lib/auth/adapters';
import { cn } from '@/lib/utils';
import { Diagonals, Eyebrow, SectionHeader } from './marketing';
import { PricingCards } from './PricingPage';
import { useReveal } from './useReveal';

// ---- content (wording unchanged in meaning) -------------------------------------------------------

const STEPS = [
  {
    title: 'Connect',
    text: 'Create an app registration with the Reader role and paste three values. About three minutes, no agents.',
  },
  {
    title: 'Scan',
    text: 'KloudRecon reads inventory, relationships, RBAC, Defender, Advisor, Policy, metrics and cost data.',
  },
  {
    title: 'Act',
    text: 'Fix the risks that matter first, cut waste, and share audit-ready reports with your team.',
  },
];

interface Feature {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
  bullets: string[];
  tile: string;
}

const FEATURES: Feature[] = [
  {
    icon: ShieldCheck,
    tile: '',
    title: 'Security posture',
    text: 'Real internet exposure from NSG and load balancer rules, attack paths to sensitive data, identity analysis and 220+ configuration checks.',
    bullets: [
      'Attack paths and blast radius',
      'Mapped to CIS, MCSB, ISO 27001, NIST, PCI, SOC 2, HIPAA',
      'Remediation in Portal, CLI, PowerShell, Bicep, Terraform',
    ],
  },
  {
    icon: Network,
    tile: 'tile-sky',
    title: 'Architecture diagrams',
    text: 'Reference-quality diagrams with the official Azure icons, generated from what is really deployed.',
    bullets: [
      'Network, hub-and-spoke, workload and data-flow views',
      'Security, cost and change overlays',
      'Export to PNG, SVG, PDF and draw.io',
    ],
  },
  {
    icon: TrendingDown,
    tile: 'tile-green',
    title: 'Cost optimization',
    text: 'Actual and amortized cost, forecasts with confidence bands, anomalies with root cause, and rightsizing from real metrics.',
    bullets: ['Waste finder and commitment advice', 'What-if simulator with retail prices', 'Showback by tag, team or cost center'],
  },
];

const MORE = [
  {
    icon: FileText,
    tile: 'tile-amber',
    title: 'Audit-ready reports',
    text: 'Executive one-pagers, full assessments, compliance packs and architecture documents as polished PDFs. White-label for consultants, scheduled email delivery and evidence export per control.',
  },
  {
    icon: Bot,
    tile: 'tile-sky',
    title: 'AI analyst',
    text: 'Ask questions about your environment in plain language. Answers cite the resources and findings they are based on. Read-only by design.',
  },
];

const TRUST = ['Reader role only', 'No agents', 'Secrets in Azure Key Vault', '14-day trial'];

const STATS = [
  { value: '~3 min', label: 'to connect Azure read-only' },
  { value: '8', label: 'frameworks mapped, from CIS to Well-Architected' },
  { value: '7', label: 'report types, from one-pager to full assessment' },
];

type Mark = boolean | 'partial';
const COMPARE: { row: string; kr: Mark; portal: Mark; sheets: Mark }[] = [
  { row: 'Inventory across all subscriptions with change history', kr: true, portal: 'partial', sheets: false },
  { row: 'Attack paths and real internet exposure', kr: true, portal: 'partial', sheets: false },
  { row: 'Compliance mapping with evidence export', kr: true, portal: 'partial', sheets: 'partial' },
  { row: 'Architecture diagrams with official icons', kr: true, portal: false, sheets: false },
  { row: 'Cost forecast, anomalies and rightsizing', kr: true, portal: 'partial', sheets: 'partial' },
  { row: 'One prioritized backlog of risks and savings', kr: true, portal: false, sheets: 'partial' },
  { row: 'Client-ready PDF reports in minutes', kr: true, portal: false, sheets: false },
];
const COLUMNS = [
  ['kr', 'KloudRecon'],
  ['portal', 'Azure Portal alone'],
  ['sheets', 'Spreadsheets & scripts'],
] as const;

const FAQ = [
  {
    q: 'What access does KloudRecon need?',
    a: 'Only the built-in Reader role on the subscriptions or management group you choose. Optional read-only Microsoft Graph permissions unlock Entra ID posture. We never need write permissions, and we warn you if we detect them.',
  },
  {
    q: 'Can KloudRecon read my data, secrets or keys?',
    a: 'No. Reader cannot read secrets, keys, app settings or data inside your services. KloudRecon collects metadata, configuration, metrics and cost only.',
  },
  {
    q: 'Where is my client secret stored?',
    a: 'Only in Azure Key Vault, accessed with a managed identity. Our database stores the secret name, never the value, and the value is never shown again after you save it.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No agents and no scripts. You create one app registration in the Azure Portal or Cloud Shell, and KloudRecon does the rest.',
  },
  {
    q: 'Why is my new account "under review"?',
    a: 'We review every new organization to keep the platform safe for everyone. Most accounts are approved within one business day, and you get an email as soon as it happens.',
  },
  {
    q: 'Is KloudRecon certified for compliance frameworks?',
    a: 'KloudRecon maps its checks to framework control IDs to help you prepare. It does not certify you. Certification is done by accredited auditors.',
  },
];

// ---- building blocks ---------------------------------------------------------------------------

const delay = (ms: number) => ({ '--reveal-delay': `${ms}ms` }) as React.CSSProperties;

/** Colored marks of the comparison: gradient check, amber "partly", soft red "no". */
function MarkIcon({ value, wave, small = false }: { value: Mark; wave?: number; small?: boolean }) {
  const box = cn('mx-auto flex shrink-0 items-center justify-center rounded-full', small ? 'size-5' : 'size-8');
  const icon = small ? 'size-3' : 'size-4';
  if (value === true)
    return (
      <span
        className={cn(box, 'cmp-pop bg-brand bg-(image:--grad-brand) text-brand-fg shadow-[var(--glow-sm)]', wave !== undefined && 'cmp-wave')}
        style={wave !== undefined ? ({ '--i': wave } as React.CSSProperties) : undefined}
      >
        <Check className={icon} strokeWidth={3} aria-label="Yes" />
      </span>
    );
  if (value === 'partial')
    return (
      <span className={cn(box, 'cmp-pop bg-medium-soft text-medium-strong')}>
        <Minus className={icon} strokeWidth={2.75} aria-label="Partly" />
      </span>
    );
  return (
    <span className={cn(box, 'cmp-pop bg-critical-soft text-critical-strong')}>
      <X className={icon} strokeWidth={2.5} aria-label="No" />
    </span>
  );
}

/** Public "View live demo": a read-only session into the Contoso Demo organization. */
function LiveDemoButton({ variant = 'link', size, className }: Pick<ButtonProps, 'variant' | 'size' | 'className'>) {
  const { data, isPending } = useQuery({
    queryKey: ['public', 'demo'],
    queryFn: () => unwrap(api.GET('/api/v1/public/demo')),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [busy, setBusy] = React.useState(false);
  // Shown while availability loads, so the prerendered page (which captures that state) and the
  // first client render match; hidden only once the API says the demo is off.
  if (!isPending && !data?.available) return null;
  return (
    <Button
      variant={variant}
      size={size}
      className={cn('btn-arrow', className)}
      loading={busy}
      onClick={() => {
        setBusy(true);
        startDemo().catch((e: unknown) => {
          setBusy(false);
          toast.error(errorMessage(e));
        });
      }}
    >
      View live demo <ArrowUpRight />
    </Button>
  );
}

/** Email joined with the trial button: continues to sign-up with the address filled in. */
function TrialForm() {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  return (
    <form
      className="glass flex w-full max-w-md items-center gap-1.5 rounded-xl p-1.5 transition-[border-color,box-shadow] duration-200 focus-within:border-brand focus-within:shadow-[var(--glow)]"
      onSubmit={(e) => {
        e.preventDefault();
        const value = email.trim();
        void navigate(value ? `/signup?email=${encodeURIComponent(value)}` : '/signup');
      }}
    >
      <label htmlFor="hero-email" className="sr-only">
        Work email
      </label>
      <input
        id="hero-email"
        type="email"
        autoComplete="email"
        placeholder="Your work email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-text outline-none placeholder:text-subtle pointer-coarse:h-11"
      />
      <Button type="submit" className="btn-arrow h-10 shrink-0 px-4">
        Start free trial <ArrowUpRight />
      </Button>
    </form>
  );
}

const SAMPLE_FINDINGS = [
  { title: 'Remote Desktop (RDP) is open to the internet', tone: 'critical', label: 'Critical' },
  { title: 'Anonymous public read access to blobs is allowed', tone: 'high', label: 'High' },
  { title: 'Key vault can be purged permanently', tone: 'medium', label: 'Medium' },
] as const;

const TONE: Record<(typeof SAMPLE_FINDINGS)[number]['tone'], string> = {
  critical: 'bg-critical',
  high: 'bg-high',
  medium: 'bg-medium',
};

/**
 * The hero's floating product cards, built in HTML/CSS (no screenshots): a score card with a few
 * findings, overlapped by the teal risk card. Example data styled like the Contoso Demo.
 */
function HeroCards() {
  return (
    <div
      role="img"
      aria-label="Example scan: KloudRecon Score 78, grade B, with 7 critical risks and 3 attack paths"
      className="relative mx-auto w-full max-w-[540px] pr-[12%] pt-14 sm:pt-16 lg:mx-0 lg:ml-auto"
    >
      <div aria-hidden className="glass float-a relative rounded-2xl p-5 shadow-[var(--glass-edge),var(--shadow-float)] sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-text shadow-[var(--glass-edge)]">
            <LogoGlyph className="size-[22px]" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold">Contoso Demo</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <AzureLogo className="size-3" /> Example scan
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">KloudRecon Score</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-[32px] font-medium leading-none tracking-[-0.03em] tabular sm:text-[40px]">
              78<span className="ml-1 text-sm font-normal tracking-normal text-muted">/100</span>
            </p>
            <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-strong">Grade B</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-[78%] rounded-full bg-brand bg-(image:--grad-brand)" />
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          {SAMPLE_FINDINGS.map((f) => (
            <li key={f.title} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
              <span className={cn('size-2 shrink-0 rounded-full', TONE[f.tone], f.tone === 'critical' && 'pulse-dot')} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">{f.title}</span>
              <span className="hidden shrink-0 text-[11px] text-muted sm:inline">{f.label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex h-11 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-ink-fg">Scan now</div>
      </div>

      <div aria-hidden className="float-b absolute right-0 top-0 w-[52%] overflow-hidden rounded-2xl bg-brand bg-(image:--grad-brand) text-brand-fg shadow-[var(--glow),var(--shadow-float)]">
        <div className="relative px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5 sm:pt-4">
          <Diagonals tone="brand" className="inset-0 h-full w-full" />
          <p className="relative text-[11px] font-medium sm:text-xs">Critical risks</p>
          <p className="relative mt-1 text-[28px] font-medium leading-none tracking-[-0.03em] tabular sm:text-[40px]">7</p>
        </div>
        <div className="flex items-center justify-between gap-2 bg-map-bg px-4 py-3 text-map-text sm:px-5">
          <span className="text-xs font-semibold sm:text-sm">3 attack paths</span>
          <Route className="size-4 shrink-0 text-map-brand" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

/** Reference-style trend chart (teal line, soft teal fill), drawn as inline SVG. Sample data: cumulative savings. */
function TrendChart() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const ys = [128, 112, 118, 92, 84, 64];
  const xs = months.map((_, i) => 12 + i * 91.2);
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i]}`).join(' ');
  const gradientId = 'kr-trend-fill';
  return (
    <svg viewBox="0 0 480 170" className="h-auto w-full" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--chart-fill)" />
          <stop offset="1" stopColor="var(--chart-fill-end)" />
        </linearGradient>
      </defs>
      {[40, 80, 120].map((y) => (
        <line key={y} x1="12" x2="468" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 5" />
      ))}
      <path className="chart-breathe" d={`${line} L${xs[xs.length - 1]} 150 L${xs[0]} 150 Z`} fill={`url(#${gradientId})`} />
      <path d={line} pathLength={1} className="draw-line" fill="none" stroke="var(--chart-1)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      {/* a light runs along the line, then the latest point pulses; loops */}
      <path d={line} pathLength={1} className="chart-comet" fill="none" stroke="var(--sky)" strokeOpacity="0.25" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d={line} pathLength={1} className="chart-comet" fill="none" stroke="var(--sky)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="chart-ping" cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="4.5" fill="none" stroke="var(--chart-1)" strokeWidth="1.5" />
      <circle className="chart-ping chart-ping-2" cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="4.5" fill="none" stroke="var(--sky)" strokeWidth="1.5" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="4.5" fill="var(--surface)" stroke="var(--chart-1)" strokeWidth="2.25" />
      {months.map((m, i) => (
        <text key={m} x={xs[i]} y="166" textAnchor="middle" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-sans)">
          {m}
        </text>
      ))}
    </svg>
  );
}

// ---- page --------------------------------------------------------------------------------------

function Hero() {
  return (
    <section className="intro relative isolate overflow-hidden bg-bg">
      <div aria-hidden className="aurora aurora-fade-top -z-10" />
      <Diagonals className="inset-y-0 right-0 -z-10 h-full w-full opacity-70 sm:w-[70%] lg:w-[52%] lg:opacity-100" />
      <div className="mk-container grid grid-cols-[minmax(0,1fr)] items-center gap-12 pb-40 pt-12 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:pb-48 lg:pt-20">
        <div>
          <p className="glass mb-6 inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3.5 text-sm font-semibold text-muted">
            <span className="flex size-7 items-center justify-center rounded-full bg-surface shadow-[var(--shadow-sm)]">
              <AzureLogo className="size-4" />
            </span>
            Built for Microsoft Azure
          </p>
          <h1 className="display-1 text-gradient max-w-[13ch] pb-1">
            <span className="block">Recon your Azure.</span> <span className="block">Secure it.</span>{' '}
            <span className="block">Optimize it.</span>
          </h1>
          <p className="lede mt-6 max-w-[46ch] text-muted">
            Connect Azure read-only in about three minutes. Get a full inventory, architecture
            diagrams, attack paths, compliance mapping and cost savings in one place.
          </p>
          <div className="mt-8">
            <TrialForm />
            <LiveDemoButton className="mt-3 text-sm" />
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-muted" aria-label="Trial terms">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft shadow-[var(--glass-edge)]" aria-hidden>
                  <Check className="size-3.5 text-brand-strong" strokeWidth={2.5} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="motion-safe:animate-[kr-fade-up_500ms_var(--ease-out)_200ms_both]">
          <HeroCards />
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="bg-surface">
      <Hero />

      {/* Platform: the white card overlapping the hero's bottom edge */}
      <section id="features" className="relative z-10 scroll-mt-24">
        <div className="mk-container -mt-28 lg:-mt-32">
          <div className="reveal relative isolate overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-lg)] sm:p-10 lg:p-12">
            <div aria-hidden className="aurora -z-10 opacity-70" />
            <div className="grid gap-5 md:grid-cols-2 md:items-center md:gap-12">
              <div>
                <Eyebrow>Platform</Eyebrow>
                <h2 className="display-2 mt-3 max-w-[16ch]">Everything you need to understand Azure</h2>
              </div>
              <p className="max-w-md text-[18px] leading-8 text-muted md:justify-self-end">
                Security, architecture and cost in one consistent, read-only view.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3 lg:mt-12 lg:gap-6">
              {FEATURES.map(({ icon: Icon, title, text, bullets, tile }, i) => (
                <article
                  key={title}
                  className="reveal group glow-card hover-lift tile-accent rounded-xl border border-border bg-(image:--grad-tile) p-5 sm:p-6 lg:p-8"
                  style={delay(i * 90)}
                >
                  <span className={cn('icon-tile icon-tile-lg', tile)}>
                    <Icon aria-hidden />
                  </span>
                  <h3 className="mt-6 text-[22px] font-semibold leading-7 tracking-[-0.015em]">{title}</h3>
                  <p className="mt-3 text-md leading-7 text-muted">{text}</p>
                  <ul className="mt-5 space-y-3 border-t border-border pt-5">
                    {bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-md leading-6">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft" aria-hidden>
                          <Check className="size-3 text-brand-strong" strokeWidth={3} />
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2 lg:mt-6 lg:gap-6">
              {MORE.map(({ icon: Icon, title, text, tile }, i) => (
                <article
                  key={title}
                  className="reveal group glow-card hover-lift tile-accent flex flex-col gap-4 rounded-xl border border-border bg-(image:--grad-tile) p-5 sm:flex-row sm:gap-5 sm:p-6 lg:p-8"
                  style={delay(i * 90)}
                >
                  <span className={cn('icon-tile icon-tile-lg', tile)}>
                    <Icon aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">{title}</h3>
                    <p className="mt-2 text-md leading-7 text-muted">{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why KloudRecon: bento */}
      <section className="mk-container mk-section">
        <SectionHeader align="center" eyebrow="Why KloudRecon" title="Deep checks, safe access, clear costs" />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <article className="reveal hover-lift glow-card flex min-h-[260px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-(image:--grad-tile) p-8 sm:p-10">
            <p className="text-gradient-number w-fit text-[64px] font-medium leading-none tracking-[-0.04em] text-brand-strong tabular sm:text-[76px]">220+</p>
            <div className="mt-10">
              <h3 className="display-3 max-w-[18ch]">Security and configuration checks</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                Mapped to CIS, MCSB, ISO 27001, NIST, PCI, SOC 2, HIPAA.
              </p>
            </div>
          </article>
          <article className="reveal hover-lift glow-card flex min-h-[260px] flex-col justify-between overflow-hidden rounded-xl border border-border bg-(image:--grad-tile) p-8 sm:p-10" style={delay(80)}>
            <h3 className="display-3 max-w-[20ch]">Connect Azure read-only in about three minutes</h3>
            <div className="mt-8">
              <div className="flex items-start justify-center gap-4 sm:gap-6" aria-hidden>
                <div className="flex w-24 flex-col items-center gap-3">
                  <span className="relative flex size-16 items-center justify-center rounded-2xl border border-border bg-surface shadow-[var(--glass-edge),var(--shadow-card)]">
                    <SkyCloud className="absolute -right-4 -top-4 size-9 drop-shadow-sm" />
                    <AzureLogo className="size-8" />
                  </span>
                  <span className="text-xs font-medium text-muted">Your Azure</span>
                </div>
                <span className="relative mt-8 h-px w-14 bg-border-strong sm:w-24 sm:[--flow-distance:90px]">
                  <span className="flow-dot absolute -top-[3px] left-0 size-[7px] rounded-full bg-brand" />
                  <span className="flow-dot absolute -top-[3px] left-0 size-[7px] rounded-full bg-sky [animation-delay:1.2s]" />
                </span>
                <div className="flex w-24 flex-col items-center gap-3">
                  <span className="flex size-16 items-center justify-center rounded-full bg-ink text-ink-fg shadow-[var(--glow)]">
                    <LogoGlyph className="size-8" />
                  </span>
                  <span className="text-xs font-medium text-muted">KloudRecon</span>
                </div>
              </div>
              <p className="mt-6 text-center text-sm text-muted">
                Read-only, Reader role. No agents.{' '}
                <Link to="/security" className="font-semibold text-brand-strong underline-offset-4 hover:underline">
                  Security overview
                </Link>
              </p>
            </div>
          </article>
          <article className="reveal hover-lift glow-card grid overflow-hidden rounded-xl border border-border bg-(image:--grad-tile) md:col-span-2 md:grid-cols-[1fr_1.45fr]" style={delay(160)}>
            <div className="flex flex-col justify-center p-8 sm:p-10">
              <h3 className="display-3">FinOps that finds money</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
                Actual and amortized cost, forecasts with confidence bands, anomalies with root cause,
                and rightsizing from real metrics.
              </p>
            </div>
            <div className="px-6 pt-2 sm:px-10 md:pt-10">
              <div className="rounded-t-xl border border-b-0 border-border bg-surface px-5 pb-2 pt-5 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted">Savings tracker</p>
                    <p className="mt-1 text-lg font-semibold">Realized savings</p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">Sample data</span>
                </div>
                <div className="mt-3">
                  <TrendChart />
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* How it works: the petrol band */}
      <section className="relative isolate overflow-hidden bg-map-bg text-map-text">
        <div aria-hidden className="aurora aurora-dark -z-10" />
        <div className="mk-container mk-section">
          <div className="reveal max-w-2xl">
            <Eyebrow className="text-map-brand">How it works</Eyebrow>
            <h2 className="display-2 mt-3">Connect, scan, act</h2>
            <p className="lede mt-4 text-map-muted">From zero to a prioritized action plan without installing anything.</p>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="reveal glass-dark hover-lift rounded-xl p-7 sm:p-8" style={delay(i * 80)}>
                <span
                  aria-hidden
                  className="block text-[80px] font-medium leading-none tracking-[-0.04em] text-transparent [-webkit-text-stroke:1.5px_var(--map-muted)] [mask-image:linear-gradient(to_bottom,black_35%,transparent_95%)]"
                >
                  {i + 1}
                </span>
                <h3 className="mt-8 text-lg font-semibold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-map-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Who it is for, with true numbers */}
      <section className="mk-container mk-section">
        <SectionHeader
          align="center"
          eyebrow="Built for"
          title="Built for the people who answer for Azure"
          text="Consultants and MSPs, IT and cloud managers, security leads, and FinOps and finance teams."
        />
        <dl className="reveal mx-auto mt-12 grid max-w-4xl gap-10 text-center sm:grid-cols-3 sm:gap-6">
          {STATS.map((s) => (
            <div key={s.label}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-gradient-number mx-auto w-fit pb-1 text-[44px] font-medium leading-none tracking-[-0.04em] tabular sm:text-[56px]">{s.value}</dd>
              <dd className="mx-auto mt-3 max-w-[22ch] text-sm leading-6 text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Comparison */}
      <section className="mk-container pb-18 lg:pb-28">
        <SectionHeader eyebrow="Compare" title="More than the portal, less than a project" />
        <div className="reveal glow-card mt-10 hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)] md:block">
          <table className="w-full table-fixed text-[16px] leading-6">
            <caption className="caption-bottom border-t border-border bg-surface-2/60 px-6 py-4 text-left text-sm text-muted lg:px-8">
              <span className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <span className="flex items-center gap-2">
                  <MarkIcon value small /> included
                </span>
                <span className="flex items-center gap-2">
                  <MarkIcon value="partial" small /> partly, with extra work
                </span>
                <span className="flex items-center gap-2">
                  <MarkIcon value={false} small /> not available
                </span>
              </span>
            </caption>
            <colgroup>
              <col />
              <col className="w-36 lg:w-52" />
              <col className="w-32 lg:w-48" />
              <col className="w-36 lg:w-52" />
            </colgroup>
            <thead>
              <tr className="text-sm lg:text-[15px]">
                <th scope="col" className="px-6 py-5 text-left font-semibold text-muted lg:px-8">Capability</th>
                {COLUMNS.map(([key, label]) =>
                  key === 'kr' ? (
                    <th
                      key={key}
                      scope="col"
                      className="relative overflow-hidden bg-brand bg-(image:--grad-brand) px-4 py-5 text-center text-md font-semibold text-brand-fg lg:text-[17px]"
                    >
                      <span aria-hidden className="cmp-sheen" />
                      <span className="relative inline-flex items-center gap-2">
                        <LogoGlyph className="size-5 [&_path]:fill-current" />
                        {label}
                      </span>
                    </th>
                  ) : (
                    <th key={key} scope="col" className="px-4 py-5 text-center font-semibold text-muted">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((c, i) => (
                <tr key={c.row} className="cmp-row group/row border-t border-border" style={{ '--i': i } as React.CSSProperties}>
                  <th scope="row" className="px-6 py-[18px] text-left font-medium transition-colors duration-200 group-hover/row:bg-brand-soft/50 lg:px-8">
                    <span className="block transition-transform duration-200 group-hover/row:translate-x-1.5">{c.row}</span>
                  </th>
                  {COLUMNS.map(([key]) => (
                    <td
                      key={key}
                      className={cn(
                        'px-4 py-[18px] transition-colors duration-200',
                        key === 'kr' ? 'bg-brand-soft/70 group-hover/row:bg-brand-tint/70' : 'group-hover/row:bg-brand-soft/50',
                      )}
                    >
                      <MarkIcon value={c[key]} wave={key === 'kr' ? i : undefined} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* phones: one card per capability */}
        <ul className="reveal mt-8 space-y-4 md:hidden" aria-label="Comparison">
          {COMPARE.map((c, i) => (
            <li
              key={c.row}
              className="cmp-row overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
              style={{ '--i': i } as React.CSSProperties}
            >
              <p className="px-5 pb-3 pt-5 text-[16px] font-semibold leading-6">{c.row}</p>
              <dl className="px-3 pb-3">
                {COLUMNS.map(([key, label]) => (
                  <div
                    key={key}
                    className={cn(
                      'flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 text-md',
                      key === 'kr' && 'bg-brand-soft',
                    )}
                  >
                    <dt className={key === 'kr' ? 'flex items-center gap-2 font-semibold text-brand-strong' : 'text-muted'}>
                      {key === 'kr' && <LogoGlyph className="size-4" />}
                      {label}
                    </dt>
                    <dd className="w-8">
                      <MarkIcon value={c[key]} wave={key === 'kr' ? i : undefined} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 border-t border-border">
        <div className="mk-container mk-section">
          <SectionHeader
            align="center"
            eyebrow="Choose a plan"
            title="Simple plans that start small"
            text="Start with a free 14-day trial. Upgrade when you are ready."
          />
          <div className="reveal mt-12">
            <PricingCards />
          </div>
        </div>
      </section>

      {/* FAQ: heading left, accordion right */}
      <section id="faq" className="scroll-mt-24 bg-bg">
        <div className="mk-container mk-section grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="reveal lg:col-span-4">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="display-2 mt-3">Questions, answered</h2>
            <p className="mt-4 text-md leading-7 text-muted">
              Access, data and approval, in short. The{' '}
              <Link to="/security" className="font-semibold text-brand-strong underline underline-offset-4">
                security overview
              </Link>{' '}
              has the details.
            </p>
          </div>
          <div className="reveal space-y-3 lg:col-span-8">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group glow-card rounded-xl border border-border bg-surface shadow-[var(--shadow-card)] open:border-brand/40 open:shadow-[var(--glow)]"
              >
                <summary className="flex min-h-14 list-none items-center justify-between gap-4 px-5 py-4 text-md font-semibold sm:px-6 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown
                    className="size-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 group-open:text-brand-strong"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-5 pr-12 text-sm leading-6 text-muted sm:px-6 sm:pr-14">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final call to action: the dark rounded box */}
      <section className="mk-container py-16 sm:py-20 lg:py-24">
        <div className="reveal relative isolate overflow-hidden rounded-2xl border border-map-border bg-map-bg px-7 py-12 text-map-text shadow-[var(--glow),var(--shadow-lg)] sm:px-12 sm:py-14 lg:px-16 lg:py-16">
          <div aria-hidden className="aurora aurora-dark -z-10" />
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <Eyebrow className="text-map-brand">Get started</Eyebrow>
              <h2 className="display-2 mt-3 max-w-[16ch]">See your Azure clearly this week.</h2>
              <p className="mt-4 max-w-md text-md leading-7 text-map-muted">
                Start with a free 14-day trial. Upgrade when you are ready.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Button asChild size="lg" className="btn-arrow">
                <Link to="/signup">
                  Get started <ArrowUpRight />
                </Link>
              </Button>
              <LiveDemoButton variant="inverse" size="lg" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
