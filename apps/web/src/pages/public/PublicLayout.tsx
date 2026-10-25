import { ArrowUpRight, Globe, Menu, X } from 'lucide-react';
import * as React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/context';
import { installSpotlight } from '@/lib/spotlight';
import { cn } from '@/lib/utils';

const LINKS = [
  { to: '/#features', label: 'Product' },
  { to: '/security', label: 'Security' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/#faq', label: 'FAQ' },
];

const FOOTER: { title: string; links: { to: string; label: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { to: '/#features', label: 'Features' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/security', label: 'Security & trust' },
      { to: '/#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Company',
    links: [{ to: 'https://kloudschool.com', label: 'KloudSchool', external: true }],
  },
  {
    title: 'Legal',
    links: [
      { to: '/terms', label: 'Terms of Service' },
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/privacy', label: 'Data handling' },
    ],
  },
];

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden focusable="false">
      <path d="M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM3.2 8.6h3.5V21H3.2V8.6Zm5.9 0h3.35v1.7h.05c.47-.88 1.6-1.95 3.4-1.95 3.6 0 4.3 2.3 4.3 5.4V21h-3.5v-6.4c0-1.5-.03-3.2-1.9-3.2s-2.2 1.4-2.2 3.1V21H9.1V8.6Z" />
    </svg>
  );
}

/** Footer "Follow us". The LinkedIn address is assumed (decision 0046): confirm before go-live. */
const SOCIAL = [
  { href: 'https://kloudschool.com', label: 'KloudSchool website', icon: Globe },
  { href: 'https://www.linkedin.com/company/kloudschool', label: 'KloudSchool on LinkedIn', icon: LinkedInIcon },
];

function ScrollToHash() {
  const { pathname, hash } = useLocation();
  React.useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
  return null;
}

export function PublicLayout() {
  const { signedIn } = useAuth();
  const location = useLocation();
  // The menu belongs to one location: navigating closes it without an effect.
  const [openAt, setOpenAt] = React.useState<string | null>(null);
  const open = openAt === location.key;
  const setOpen = (fn: (o: boolean) => boolean) => setOpenAt(fn(open) ? location.key : null);
  // The header sits on the hero without a line; the line appears once the page scrolls.
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(installSpotlight, []);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <ScrollToHash />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header
        className={cn(
          'sticky top-0 z-40 border-b bg-bg/80 backdrop-blur-xl backdrop-saturate-150 transition-[border-color,box-shadow] duration-200',
          scrolled || open ? 'border-border shadow-[var(--shadow-card)]' : 'border-transparent',
        )}
      >
        <div className="mk-container flex h-16 items-center gap-3 md:h-[72px] lg:gap-6">
          <Link to="/" aria-label="KloudRecon home" className="shrink-0">
            <Logo size="lg" className="md:max-lg:[&_.logo-suffix]:hidden" />
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center justify-center lg:gap-1 md:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={cn('nav-underline rounded-md px-3 py-2.5 text-sm font-medium lg:text-[15px] text-muted transition-colors duration-150 hover:text-text', !l.to.includes('#') && 'nav-page')}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:ml-0 md:flex">
            <ThemeToggle />
            {signedIn ? (
              <Button asChild>
                <Link to="/start">Open app</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" className="h-10">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild className="h-10">
                  <Link to="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        <div id="mobile-menu" className={cn('border-t border-border bg-bg md:hidden', !open && 'hidden')}>
          <nav className="mk-container flex flex-col gap-1 py-4" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex min-h-11 items-center rounded-md px-3 text-md font-medium hover:bg-surface-2"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {signedIn ? (
                <Button asChild className="col-span-2">
                  <Link to="/start">Open app</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline">
                    <Link to="/login">Sign in</Link>
                  </Button>
                  <Button asChild>
                    <Link to="/signup">Get started</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>
      {/* data-page-root: scripts/prerender.mjs adds the Suspense markers here for hydration */}
      <main id="main" className="flex-1" data-page-root>
        <React.Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted" role="status">
              Loading…
            </div>
          }
        >
          <Outlet />
        </React.Suspense>
      </main>
      <footer className="relative isolate overflow-hidden border-t border-border bg-bg">
        <div aria-hidden className="aurora -z-10" />
        <div className="mk-container py-12 sm:py-16">
          <div className="glass rounded-2xl px-6 py-10 sm:px-10 sm:py-12 lg:px-14">
            <div className="grid gap-10 sm:grid-cols-3 lg:grid-cols-[1.7fr_1fr_1fr_1fr] lg:gap-12">
              <div className="sm:col-span-3 lg:col-span-1">
                <Link to="/" aria-label="KloudRecon home" className="group/logo inline-block">
                  <Logo
                    size="xl"
                    className="transition-transform duration-300 ease-out group-hover/logo:-translate-y-0.5 [&_svg]:transition-transform [&_svg]:duration-500 group-hover/logo:[&_svg]:rotate-90"
                  />
                </Link>
                <p className="mt-5 max-w-sm text-md leading-7 text-muted">
                  Recon your Azure. Secure it. Optimize it. Read-only inventory, security posture,
                  architecture diagrams and FinOps for Azure.
                </p>
                <div className="mt-7">
                  <h2 className="font-sans text-sm font-semibold tracking-normal text-text">Follow us</h2>
                  <div className="mt-3 flex gap-3">
                    {SOCIAL.map(({ href, label, icon: Icon }) => (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${label} (opens in a new tab)`}
                        className="social-link flex size-12 items-center justify-center rounded-full bg-surface"
                      >
                        <Icon className="relative size-5" aria-hidden />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
              {FOOTER.map((col) => (
                <div key={col.title}>
                  <h2 className="font-sans text-md font-semibold tracking-normal text-text">{col.title}</h2>
                  <ul className="mt-4 space-y-1 text-md text-muted">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        {l.external ? (
                          <a href={l.to} target="_blank" rel="noreferrer" className="footer-link">
                            {l.label}
                            <ArrowUpRight className="size-4" aria-hidden />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        ) : (
                          <Link to={l.to} className="footer-link">
                            {l.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <span className="shrink-0">© {new Date().getFullYear()} KloudSchool. KloudRecon by KloudSchool.</span>
              <span className="lg:text-right">
                Microsoft, Azure and Entra are trademarks of the Microsoft group of companies.
                KloudRecon is an independent product.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
