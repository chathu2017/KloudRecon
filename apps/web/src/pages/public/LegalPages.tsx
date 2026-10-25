import {
  ArrowUpRight,
  Ban,
  Bot,
  CalendarDays,
  Clock,
  Eye,
  FileText,
  KeyRound,
  type LucideIcon,
  Scale,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Diagonals, Eyebrow } from './marketing';

const UPDATED = '1 October 2026';

const TILES = ['', 'tile-sky', 'tile-green', 'tile-amber'];

interface Highlight {
  icon: LucideIcon;
  title: string;
  text: string;
}

interface LegalSection {
  id: string;
  title: string;
  /** One plain sentence: what this section means for the reader. */
  short: string;
  body: React.ReactNode;
}

interface LegalDoc {
  title: string;
  intro: string;
  minutes: number;
  seal: LucideIcon;
  highlights: Highlight[];
  sections: LegalSection[];
  other: { to: string; label: string };
}

/** Marks the section nearest the top of the viewport, for the table of contents. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = React.useState(ids[0] ?? '');
  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '-96px 0px -55% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/** Decorative: three sheets stacked in isometric view; they fan apart on hover. */
function DocumentStack({ seal: Seal }: { seal: LucideIcon }) {
  return (
    <div aria-hidden className="float-a hidden lg:block">
      <div className="doc-scene">
        <div className="doc-stack">
          <div className="doc-sheet doc-sheet-shadow" />
          <div className="doc-sheet doc-sheet-1" />
          <div className="doc-sheet doc-sheet-2" />
          <div className="doc-sheet doc-sheet-3 flex flex-col p-5">
            <span className="h-2.5 w-20 rounded-full bg-brand" />
            <span className="mt-5 h-2 w-full rounded-full bg-surface-3" />
            <span className="mt-2.5 h-2 w-11/12 rounded-full bg-surface-3" />
            <span className="mt-2.5 h-2 w-4/5 rounded-full bg-surface-3" />
            <span className="mt-6 h-2 w-full rounded-full bg-brand-tint" />
            <span className="mt-2.5 h-2 w-3/4 rounded-full bg-brand-tint" />
            <span className="mt-6 h-2 w-full rounded-full bg-surface-3" />
            <span className="mt-2.5 h-2 w-2/3 rounded-full bg-surface-3" />
            <span className="doc-seal mt-auto flex size-12 items-center justify-center self-end rounded-full">
              <Seal className="size-6" strokeWidth={1.8} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegalPage({ doc }: { doc: LegalDoc }) {
  const ids = React.useMemo(() => doc.sections.map((s) => s.id), [doc.sections]);
  const active = useActiveSection(ids);
  return (
    <>
      <section className="relative isolate overflow-hidden bg-bg">
        <div aria-hidden className="aurora aurora-fade-top -z-10" />
        <Diagonals className="inset-y-0 right-0 -z-10 hidden h-full w-[46%] md:block" />
        <div className="mk-container flex items-center justify-between gap-10 pb-14 pt-14 sm:pb-16 sm:pt-20">
          <div className="min-w-0">
            <Eyebrow>Legal</Eyebrow>
            <h1 className="display-1 text-gradient mt-4 pb-1">{doc.title}</h1>
            <p className="lede mt-5 text-muted">{doc.intro}</p>
            <ul className="mt-7 flex flex-wrap gap-2.5 text-sm font-medium text-text">
              <li className="glass flex items-center gap-2 rounded-full px-3.5 py-2">
                <CalendarDays aria-hidden className="size-4 text-brand-strong" />
                Last updated {UPDATED}
              </li>
              <li className="glass flex items-center gap-2 rounded-full px-3.5 py-2">
                <Clock aria-hidden className="size-4 text-brand-strong" />
                About {doc.minutes} minutes to read
              </li>
              <li className="glass flex items-center gap-2 rounded-full px-3.5 py-2">
                <FileText aria-hidden className="size-4 text-brand-strong" />
                {doc.sections.length} sections
              </li>
            </ul>
          </div>
          <DocumentStack seal={doc.seal} />
        </div>
      </section>

      <div className="relative isolate bg-surface">
        <div aria-hidden className="aurora -z-10 opacity-70" />
        <div className="mk-container py-14 sm:py-20">
          <h2 className="display-3">The short version</h2>
          <p className="mt-2 max-w-[60ch] text-md text-muted">
            A summary to help you find your way. The full text below is what applies.
          </p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {doc.highlights.map((h, i) => (
              <li key={h.title} className="slab slab-tilt group p-6">
                <span className={cn('icon-tile', TILES[i % TILES.length])}>
                  <h.icon aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em]">{h.title}</h3>
                <p className="mt-2 text-md leading-6 text-muted">{h.text}</p>
              </li>
            ))}
          </ul>

          <div className="mt-14 grid gap-8 lg:mt-20 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-12">
            <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
              <div className="slab p-4">
                <p className="px-2.5 pb-2 text-sm font-semibold text-text">On this page</p>
                <ol className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-1">
                  {doc.sections.map((s, i) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} aria-current={active === s.id} className="legal-toc-link">
                        <span className="w-5 shrink-0 text-xs tabular-nums">{i + 1}</span>
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>

            <div className="grid min-w-0 gap-5">
              {doc.sections.map((s, i) => (
                <section
                  key={s.id}
                  id={s.id}
                  aria-labelledby={`${s.id}-title`}
                  className="surface-card scroll-mt-24 p-6 sm:p-8"
                >
                  <div className="flex items-center gap-4">
                    <span aria-hidden className="legal-num">
                      {i + 1}
                    </span>
                    <h2 id={`${s.id}-title`} className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl">
                      {s.title}
                    </h2>
                  </div>
                  <p className="mt-5 rounded-lg bg-brand-soft px-4 py-3 text-md leading-6 text-text">
                    <span className="font-semibold text-brand-strong">In short: </span>
                    {s.short}
                  </p>
                  <div className="legal-body mt-5">{s.body}</div>
                </section>
              ))}

              <div className="relative isolate mt-6 overflow-hidden rounded-2xl border border-map-border bg-map-bg p-7 text-map-text shadow-[var(--glow),var(--shadow-lg)] sm:p-10">
                <div aria-hidden className="aurora aurora-dark -z-10" />
                <h2 className="display-3">Questions about this document?</h2>
                <p className="mt-3 max-w-[56ch] text-md leading-7 text-map-muted">
                  Contact KloudSchool through kloudschool.com and we will answer in plain language.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild variant="inverse" size="lg">
                    <a href="https://kloudschool.com" target="_blank" rel="noreferrer">
                      Contact KloudSchool
                      <ArrowUpRight aria-hidden />
                    </a>
                  </Button>
                  <Button asChild variant="inverse" size="lg">
                    <Link to={doc.other.to}>{doc.other.label}</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const TERMS: LegalDoc = {
  title: 'Terms of Service',
  intro:
    'The agreement between your organization and KloudSchool for using KloudRecon for Azure: what you can expect from us and what we ask of you.',
  minutes: 7,
  seal: Scale,
  other: { to: '/privacy', label: 'Read the Privacy Policy' },
  highlights: [
    {
      icon: Eye,
      title: 'Read-only by design',
      text: 'KloudRecon reads your Azure with the Reader role. It never needs write access and cannot change your resources.',
    },
    {
      icon: UserCheck,
      title: 'Reviewed accounts',
      text: 'We review every new organization before it can connect Azure, and may approve or decline a registration.',
    },
    {
      icon: Bot,
      title: 'Guidance, not a guarantee',
      text: 'Findings, cost estimates and AI text support your decisions. Compliance mapping is not certification.',
    },
    {
      icon: Trash2,
      title: 'Leave when you want',
      text: 'Delete your organization at any time. Its data is purged within 30 days.',
    },
  ],
  sections: [
    {
      id: 'who-we-are',
      title: 'Who we are and what these Terms cover',
      short: 'Using KloudRecon means your organization accepts these Terms.',
      body: (
        <>
          <p>
            KloudRecon for Azure (“KloudRecon”, “the Service”) is provided by KloudSchool (“we”,
            “us”). These Terms apply to the website, the web application and the reports and
            exports it produces.
          </p>
          <p>
            By creating an account or using the Service you accept these Terms for yourself and for
            the organization you represent, and you confirm that you are allowed to do so. If you do
            not accept them, do not use the Service.
          </p>
        </>
      ),
    },
    {
      id: 'accounts',
      title: 'Accounts and approval',
      short: 'Give accurate details, keep your mailbox secure, and look after the people you invite.',
      body: (
        <>
          <p>
            You must provide accurate registration details and keep them up to date. We review new
            organizations and may approve or decline any registration.
          </p>
          <ul>
            <li>
              You sign in with a one-time code sent to your email address, or with a Google or
              Microsoft account where that option is offered. Anyone who controls your mailbox can
              sign in as you, so keep it secure.
            </li>
            <li>
              You are responsible for activity under your account and for the users you invite to
              your organization, including the roles you give them.
            </li>
            <li>Tell us promptly if you believe an account has been used without permission.</li>
            <li>The Service is for business use by people aged 18 or older.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'azure-connection',
      title: 'Your Azure connection',
      short: 'You grant read-only access to the scopes you choose, and you can revoke it at any time.',
      body: (
        <ul>
          <li>
            You grant KloudRecon read-only access (the Reader role, and optional read-only Microsoft
            Graph permissions) to the Azure scopes you choose.
          </li>
          <li>You confirm you are authorized to grant this access for those scopes.</li>
          <li>KloudRecon never needs write permissions. You should not grant them.</li>
          <li>
            Scans call Microsoft Azure APIs on your behalf. Microsoft’s own terms and limits apply
            to your Azure subscriptions.
          </li>
          <li>
            You can revoke access at any time by deleting the app registration or its role
            assignments, or by deleting the connection in KloudRecon.
          </li>
        </ul>
      ),
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      short: 'Use KloudRecon only on environments you are allowed to assess, and do not abuse the Service.',
      body: (
        <>
          <p>You may not use the Service to:</p>
          <ul>
            <li>access or assess environments you are not authorized to assess;</li>
            <li>interfere with the Service, its security controls or other customers;</li>
            <li>bypass plan limits, rate limits or access controls;</li>
            <li>reverse engineer the Service or copy it to build a competing product;</li>
            <li>resell or share access outside your organization without our written agreement;</li>
            <li>break any law that applies to you.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'plans',
      title: 'Plans, trials and payment',
      short: 'Trials end on their own. Paid plans renew monthly until you cancel.',
      body: (
        <>
          <p>
            Plans, prices and limits are shown on our{' '}
            <Link to="/pricing">pricing page</Link> and may change with notice. A trial lasts 14
            days and ends automatically; you are not charged unless you choose a paid plan.
          </p>
          <ul>
            <li>Paid plans renew monthly until you cancel. Cancelling stops the next renewal.</li>
            <li>
              Where card payment is offered, it is handled by our payment provider. We do not store
              card numbers.
            </li>
            <li>
              If a payment fails or a trial ends, your account may be limited to read-only access
              after a grace period. Your data stays available to read during that time.
            </li>
            <li>Prices do not include taxes that apply in your country, unless stated.</li>
            <li>
              Fees already paid are not refunded, unless the law requires it or we agree otherwise
              in writing.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'findings',
      title: 'Findings, recommendations and AI output',
      short: 'KloudRecon informs your decisions. You decide what to change in your environment.',
      body: (
        <>
          <p>
            KloudRecon provides analysis to help you make decisions. Findings, scores, cost
            estimates, forecasts, diagrams and AI-generated text may be incomplete or inaccurate.
            They are not legal, audit, financial or professional advice.
          </p>
          <ul>
            <li>
              Compliance mappings relate our checks to control IDs of public frameworks. They are{' '}
              <strong>not</strong> certifications and do not replace an audit.
            </li>
            <li>
              Savings and cost figures are estimates based on Azure cost and price data at the time
              of a scan.
            </li>
            <li>
              Remediation steps and scripts are suggestions. Review and test them before use; you
              are responsible for changes you make to your environment.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'your-data',
      title: 'Your data and confidentiality',
      short: 'Your data stays yours. We use it only to run the Service for you.',
      body: (
        <>
          <p>
            You keep ownership of your data. You grant us the rights needed to operate, secure and
            support the Service for you. How we handle personal data and Azure metadata is described
            in the <Link to="/privacy">Privacy Policy</Link>.
          </p>
          <p>
            We treat what we learn about your Azure environment as confidential. We do not sell it
            and do not share it, except with the service providers named in the Privacy Policy or
            when the law requires it.
          </p>
        </>
      ),
    },
    {
      id: 'our-ip',
      title: 'Our intellectual property',
      short: 'We own KloudRecon. You get a right to use it while your plan is active.',
      body: (
        <>
          <p>
            The Service, including its software, rules catalog, wording, design and reports
            templates, belongs to KloudSchool. While your account is active you may use the Service
            and its reports and exports for your organization’s own business purposes.
          </p>
          <p>
            Microsoft, Azure and other product names belong to their owners. If you send us
            feedback, we may use it to improve the Service without owing you anything for it.
          </p>
        </>
      ),
    },
    {
      id: 'integrations',
      title: 'Integrations and third-party services',
      short: 'When you turn on an integration, data goes where you send it.',
      body: (
        <p>
          You can connect KloudRecon to other tools, such as Microsoft Teams, Slack, Jira, Azure
          DevOps, email and webhooks. When you do, the Service sends the alerts, tickets or reports
          you configure to those destinations. You are responsible for those destinations and for
          your agreements with their providers.
        </p>
      ),
    },
    {
      id: 'availability',
      title: 'Availability and changes to the Service',
      short: 'We work to keep the Service available and secure, without promising zero downtime.',
      body: (
        <p>
          We work to keep the Service available and secure but do not guarantee uninterrupted
          operation, except where a separate service level agreement applies. Scans depend on
          Microsoft Azure APIs, which can be slow, limited or unavailable. We may improve, change or
          retire features over time and will tell you in advance about changes that remove something
          you rely on.
        </p>
      ),
    },
    {
      id: 'termination',
      title: 'Suspension and termination',
      short: 'You can leave at any time. We can suspend accounts that break these Terms.',
      body: (
        <>
          <p>
            You may stop using the Service and delete your organization at any time in settings.
            After deletion, your data is purged within 30 days.
          </p>
          <p>
            We may suspend or end accounts that breach these Terms, put the Service or other
            customers at risk, or stay unpaid. Where we reasonably can, we will warn you first and
            give you time to fix the problem.
          </p>
        </>
      ),
    },
    {
      id: 'liability',
      title: 'Warranties and liability',
      short: 'The Service is provided “as is”, and our liability is capped.',
      body: (
        <>
          <p>
            To the extent permitted by law, the Service is provided “as is” and “as available”,
            without warranties of any kind.
          </p>
          <ul>
            <li>
              Our total liability for all claims about the Service is limited to the fees you paid
              in the twelve months before the claim.
            </li>
            <li>
              We are not liable for indirect or consequential losses, such as lost profit, lost data
              or business interruption.
            </li>
            <li>Nothing in these Terms limits liability that cannot be limited by law.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to these Terms',
      short: 'We will tell you before important changes take effect.',
      body: (
        <p>
          We may update these Terms. The date at the top shows the latest version. For changes that
          affect your rights, we will notify organization owners by email or in the application
          before the change takes effect. Using the Service after that date means you accept the
          updated Terms.
        </p>
      ),
    },
    {
      id: 'law',
      title: 'Governing law',
      short: 'The law of KloudSchool’s home country applies, unless your local law says otherwise.',
      body: (
        <p>
          These Terms are governed by the laws of the country where KloudSchool is established.
          Rights that the law of your own country gives you and that cannot be waived stay in
          place. We will first try to resolve any dispute with you directly and in good faith.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      short: 'Reach us through kloudschool.com.',
      body: (
        <p>
          Questions about these Terms can be sent to KloudSchool through{' '}
          <a href="https://kloudschool.com" target="_blank" rel="noreferrer">
            kloudschool.com
          </a>
          .
        </p>
      ),
    },
  ],
};

const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  intro:
    'What KloudRecon collects when you connect Azure, what it never touches, where the data lives and how you stay in control of it.',
  minutes: 8,
  seal: ShieldCheck,
  other: { to: '/terms', label: 'Read the Terms of Service' },
  highlights: [
    {
      icon: Eye,
      title: 'Metadata, not your data',
      text: 'We read configuration, metrics and cost data. Never files, blobs, database rows, messages, secrets or keys.',
    },
    {
      icon: KeyRound,
      title: 'Secrets stay in Key Vault',
      text: 'Your client secret is stored only in Azure Key Vault. It is never shown again and never written to logs.',
    },
    {
      icon: Ban,
      title: 'Never sold, no ad tracking',
      text: 'We do not sell your data, and the Service uses no advertising or cross-site tracking cookies.',
    },
    {
      icon: Trash2,
      title: 'You can delete it',
      text: 'Deleting a connection removes its secret and data. Deleting your organization purges everything within 30 days.',
    },
  ],
  sections: [
    {
      id: 'summary',
      title: 'Summary',
      short: 'KloudRecon reads how your Azure is set up, not what is stored inside it.',
      body: (
        <p>
          KloudRecon collects <strong>metadata, configuration, metrics and cost data</strong> from
          the Azure scopes you connect. We <strong>never</strong> read data-plane content such as
          files, blobs, database rows, messages, secrets or keys.
        </p>
      ),
    },
    {
      id: 'responsible',
      title: 'Who is responsible',
      short: 'KloudSchool runs the Service. Your organization decides which Azure scopes it sees.',
      body: (
        <>
          <p>
            KloudRecon for Azure is provided by KloudSchool. For account data, such as your name and
            email address, KloudSchool decides how the data is used and is responsible for it.
          </p>
          <p>
            For data collected from your Azure environment, we act on behalf of your organization:
            your organization decides what to connect, and we process that data only to provide the
            Service to it.
          </p>
        </>
      ),
    },
    {
      id: 'collect',
      title: 'What we collect',
      short: 'Account details, Azure metadata from the scopes you connect, and the logs needed to run a secure service.',
      body: (
        <ul>
          <li>
            <strong>Account data:</strong> name, email, company, country, job title, phone
            (optional), company size, industry (optional) and your stated use case.
          </li>
          <li>
            <strong>Sign-in data:</strong> the one-time codes we email you, the time of each
            sign-in and technical details such as IP address and browser. If you sign in with
            Google or Microsoft, we receive your name and email address from that provider.
          </li>
          <li>
            <strong>Azure metadata:</strong> resource inventory and properties, relationships, role
            assignments, Activity Log entries, Defender, Advisor and Policy results, metrics and
            cost data.
          </li>
          <li>
            <strong>Optional identity data:</strong> with the Identity tier, Entra ID directory
            metadata such as users, groups, app registrations and policy settings.
          </li>
          <li>
            <strong>Billing data:</strong> your plan, plan changes and payment status. Card details
            are handled by the payment provider and never reach our systems.
          </li>
          <li>
            <strong>Content you add:</strong> notes, exceptions, diagram annotations, alert rules,
            report branding and the questions you ask the AI analyst.
          </li>
          <li>
            <strong>Usage and security logs:</strong> audit events and technical logs, with secrets
            and tokens removed.
          </li>
        </ul>
      ),
    },
    {
      id: 'never',
      title: 'What we never collect',
      short: 'The Reader role cannot open your data, and we do not ask for more.',
      body: (
        <ul>
          <li>Files, blobs, database rows, queue messages or any other content inside your services.</li>
          <li>Key Vault secrets, keys, certificates, connection strings or application settings.</li>
          <li>Passwords of your Azure users.</li>
          <li>Anything from Azure scopes you have not connected.</li>
        </ul>
      ),
    },
    {
      id: 'use',
      title: 'How we use it',
      short: 'To run the Service for you, keep it secure and send the emails you expect.',
      body: (
        <>
          <ul>
            <li>To run scans and show you inventory, findings, diagrams, costs and reports.</li>
            <li>To review registrations, operate and secure the Service, and provide support.</li>
            <li>
              To send account emails: sign-in codes, approvals, invitations, and the alerts and
              scheduled reports you choose.
            </li>
            <li>To manage plans, trials and billing.</li>
          </ul>
          <p>
            We rely on our contract with your organization, on our legitimate interest in running a
            secure service, and on your consent where the law requires it. We do not use your data
            for advertising.
          </p>
        </>
      ),
    },
    {
      id: 'ai',
      title: 'AI features',
      short: 'AI runs on Azure OpenAI in our own subscription and is not used to train models.',
      body: (
        <p>
          The AI analyst, summaries and remediation text send only the minimum needed data to Azure
          OpenAI in our own Azure subscription. That data is not used to train models. AI answers
          are built from the facts of your scans and checked against them, but they can still be
          wrong; treat them as a starting point.
        </p>
      ),
    },
    {
      id: 'cookies',
      title: 'Cookies and browser storage',
      short: 'Only what is needed to keep you signed in and remember your settings.',
      body: (
        <ul>
          <li>
            Your browser stores your session and preferences, such as the light or dark theme and
            dismissed announcements.
          </li>
          <li>
            A short-lived cookie is set while you sign in with Google or Microsoft, to protect that
            sign-in.
          </li>
          <li>We use no advertising cookies and no cross-site tracking.</li>
        </ul>
      ),
    },
    {
      id: 'storage',
      title: 'Where it is stored and how it is protected',
      short: 'In Microsoft Azure, encrypted, and separated per customer.',
      body: (
        <>
          <p>
            Data is stored in Microsoft Azure in the region we operate, which may be outside your
            country. Your client secret is stored only in Azure Key Vault.
          </p>
          <ul>
            <li>Traffic is encrypted with HTTPS, and stored data is encrypted at rest.</li>
            <li>
              Every query is scoped to your organization, and the database enforces the same
              boundary a second time with row-level security.
            </li>
            <li>
              Access to production systems is limited to authorized KloudSchool staff and is logged.
            </li>
          </ul>
          <p>
            More detail is on the <Link to="/security">Security page</Link>.
          </p>
        </>
      ),
    },
    {
      id: 'sharing',
      title: 'Sharing and service providers',
      short: 'We do not sell your data. A small set of providers helps us run the Service.',
      body: (
        <>
          <p>We do not sell your data. We share it only with:</p>
          <ul>
            <li>
              <strong>Microsoft Azure</strong>, for hosting, Key Vault, storage, email delivery
              (Azure Communication Services), Azure OpenAI and monitoring.
            </li>
            <li>
              <strong>A payment provider</strong> (Stripe or Paddle), when you pay for a plan by
              card.
            </li>
            <li>
              <strong>Google or Microsoft</strong>, when you choose to sign in with one of them.
            </li>
            <li>
              <strong>Destinations you configure</strong>, such as Microsoft Teams, Slack, Jira,
              Azure DevOps or a webhook, which receive the alerts, tickets and reports you set up.
            </li>
            <li>Authorities, when the law requires it.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'retention',
      title: 'Retention and deletion',
      short: 'Data is kept while your organization is active and removed when you delete it.',
      body: (
        <ul>
          <li>
            Scan data is kept while your organization is active and according to your plan’s
            history limits.
          </li>
          <li>Deleting a connection deletes its secret and its data.</li>
          <li>Deleting your organization purges all its data within 30 days.</li>
          <li>Backups expire on their own schedule after that.</li>
        </ul>
      ),
    },
    {
      id: 'rights',
      title: 'Your rights',
      short: 'You can see, correct, export or delete your personal data.',
      body: (
        <>
          <p>
            You can access, correct, export or delete your personal data, and object to or restrict
            how we use it, as far as the law in your country provides. Organization owners can
            delete their organization in settings.
          </p>
          <p>
            To use these rights, contact us through{' '}
            <a href="https://kloudschool.com" target="_blank" rel="noreferrer">
              kloudschool.com
            </a>
            . If your request is about data from an Azure environment, we may refer you to the
            organization that connected it. You can also complain to your local data protection
            authority.
          </p>
        </>
      ),
    },
    {
      id: 'children',
      title: 'Children',
      short: 'KloudRecon is a business service and is not meant for children.',
      body: (
        <p>
          The Service is for business use by adults. We do not knowingly collect personal data from
          children. If you believe a child has given us personal data, contact us and we will
          delete it.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      short: 'We will tell you before important changes take effect.',
      body: (
        <p>
          We may update this policy. The date at the top shows the latest version. For changes that
          affect how we use your personal data, we will notify organization owners by email or in
          the application before the change takes effect.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      short: 'Reach us through kloudschool.com.',
      body: (
        <p>
          Questions about privacy can be sent to KloudSchool through{' '}
          <a href="https://kloudschool.com" target="_blank" rel="noreferrer">
            kloudschool.com
          </a>
          . The <Link to="/terms">Terms of Service</Link> describe the rest of our agreement with
          you.
        </p>
      ),
    },
  ],
};

export function TermsPage() {
  return <LegalPage doc={TERMS} />;
}

export function PrivacyPage() {
  return <LegalPage doc={PRIVACY} />;
}
