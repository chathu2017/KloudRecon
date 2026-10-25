import {
  Database,
  Eye,
  FileLock2,
  KeyRound,
  Lock,
  ServerCog,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { PageIntro } from './marketing';
import { useReveal } from './useReveal';

const TILES = ['', 'tile-sky', 'tile-green'];

const PILLARS = [
  {
    icon: Eye,
    title: 'Read-only access',
    text: 'KloudRecon needs only the built-in Reader role. Reader cannot create, change or delete resources, and cannot read secrets, keys, app settings or data inside your services. If we detect write permissions on the app you connect, we tell you and explain why you should remove them.',
  },
  {
    icon: KeyRound,
    title: 'Secrets stay in Key Vault',
    text: 'The client secret you provide is stored only in Azure Key Vault and accessed with a managed identity. Our database keeps the secret name, never the value. After saving, the secret is write-only: it is never shown again and never written to logs.',
  },
  {
    icon: Database,
    title: 'Metadata, not your data',
    text: 'We collect resource metadata and configuration, metrics, and cost data. We never read data-plane content such as files, blobs, database rows, messages or secrets.',
  },
  {
    icon: UserCheck,
    title: 'Tenant isolation',
    text: 'Every query is scoped to your organization, and PostgreSQL row-level security enforces the same boundary a second time in the database. Automated tests check isolation on every change.',
  },
  {
    icon: Lock,
    title: 'Encryption and transport',
    text: 'All traffic uses HTTPS with HSTS. Data is stored on encrypted Azure managed disks and in Azure Storage with encryption at rest. The database accepts only local connections from the application host.',
  },
  {
    icon: ShieldCheck,
    title: 'Sign-in with Microsoft Entra',
    text: 'Accounts use Microsoft Entra External ID with email verification and multi-factor authentication. Every new organization is reviewed by our team before it can connect Azure.',
  },
  {
    icon: FileLock2,
    title: 'Audit trail',
    text: 'Sensitive actions — connections, secrets, roles, invitations, approvals and exports — are written to an audit log that your administrators can review.',
  },
  {
    icon: Trash2,
    title: 'Deletion on request',
    text: 'Deleting a connection deletes its secret and its data. Deleting your organization purges all of its data within 30 days.',
  },
  {
    icon: ServerCog,
    title: 'Secure engineering',
    text: 'Dependencies are scanned continuously, code is reviewed and analyzed before release, and every deployment is health-checked with automatic rollback.',
  },
];

const FRAMEWORKS = ['CIS Azure Foundations', 'MCSB', 'ISO/IEC 27001', 'NIST SP 800-53', 'PCI DSS', 'SOC 2', 'HIPAA'];

export function SecurityPage() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <>
      <PageIntro
        eyebrow="Security"
        title="Built so that connecting is never the risk"
        text="Read-only access, secrets in Azure Key Vault, no agents, and strict isolation between customers."
      />
      <div ref={ref} className="relative isolate overflow-hidden bg-surface">
        <div aria-hidden className="aurora -z-10 opacity-80" />
        <div className="mk-container py-16 sm:py-24">
          <div className="grid gap-5 md:grid-cols-2 lg:gap-6 xl:grid-cols-3">
            {PILLARS.map((p, i) => (
              <article
                key={p.title}
                className="reveal group glow-card hover-lift tile-accent rounded-xl border border-border bg-(image:--grad-tile) p-6 sm:p-8"
                style={{ '--reveal-delay': `${(i % 3) * 90}ms` } as React.CSSProperties}
              >
                <span className={cn('icon-tile icon-tile-lg', TILES[i % TILES.length])}>
                  <p.icon aria-hidden />
                </span>
                <h2 className="mt-6 font-sans text-[21px] font-semibold leading-7 tracking-[-0.015em]">{p.title}</h2>
                <p className="mt-3 text-md leading-7 text-muted">{p.text}</p>
              </article>
            ))}
          </div>
          <div className="reveal relative isolate mt-12 overflow-hidden rounded-2xl border border-map-border bg-map-bg p-7 text-map-text shadow-[var(--glow),var(--shadow-lg)] sm:mt-16 sm:p-12 lg:p-14">
            <div aria-hidden className="aurora aurora-dark -z-10" />
            <div className="grid gap-6 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-4">
                <span className="eyebrow text-map-brand">Compliance</span>
                <h2 className="display-2 mt-3">Compliance mapping</h2>
              </div>
              <div className="lg:col-span-8">
                <p className="text-[17px] leading-8 text-map-muted">
                  KloudRecon maps its checks to control IDs from frameworks such as CIS Microsoft Azure
                  Foundations, Microsoft Cloud Security Benchmark, ISO/IEC 27001, NIST SP 800-53, PCI DSS,
                  SOC 2 and HIPAA to help you prepare for audits. Mapping is not certification: KloudRecon
                  does not certify your environment.
                </p>
                <ul className="mt-7 flex flex-wrap gap-2.5" aria-label="Frameworks mapped to">
                  {FRAMEWORKS.map((f) => (
                    <li
                      key={f}
                      className="glass-dark rounded-full px-4 py-2 text-sm font-semibold transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-map-brand hover:shadow-[var(--glow-sm)]"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
