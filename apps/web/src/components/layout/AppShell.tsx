import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu } from 'lucide-react';
import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/misc';
import { installSpotlight } from '@/lib/spotlight';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { CommandPalette, CommandTrigger } from './CommandPalette';
import type { NavItem, NavSection } from './nav';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export interface AppShellProps {
  sections: NavSection[];
  homePath: string;
  orgRole?: string | null;
  /** Left of the search box in the top bar, e.g. the organization name. */
  context?: React.ReactNode;
  /** Right side of the top bar, before theme + user menu (e.g. notifications bell). */
  actions?: React.ReactNode;
  /** Full-width notice under the top bar (trial, read-only view...). */
  banner?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  badges?: Partial<Record<NonNullable<NavItem['badgeKey']>, number>>;
  children?: React.ReactNode;
}

export function AppShell({
  sections,
  homePath,
  orgRole,
  context,
  actions,
  banner,
  sidebarFooter,
  badges,
  children,
}: AppShellProps) {
  const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useUi();
  React.useEffect(installSpotlight, []);

  return (
    <TooltipProvider>
      <div className="app-desk relative isolate flex min-h-screen">
        <div aria-hidden className="aurora aurora-app -z-10" />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 py-3 pl-3 transition-[width] duration-200 lg:block',
            sidebarCollapsed ? 'w-[4.75rem]' : 'w-[17rem]',
          )}
        >
          <Sidebar
            sections={sections}
            homePath={homePath}
            orgRole={orgRole ?? null}
            badges={badges ?? {}}
            footer={sidebarFooter}
          />
        </aside>

        <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-[kr-fade_200ms_var(--ease-out)] lg:hidden" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-lg focus:outline-none data-[state=open]:animate-[kr-slide-in-left_250ms_var(--ease-out)] lg:hidden">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <Sidebar
                sections={sections}
                homePath={homePath}
                orgRole={orgRole ?? null}
                badges={badges ?? {}}
                footer={sidebarFooter}
                onNavigate={() => setMobileNavOpen(false)}
                forceExpanded
              />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="topbar-fade sticky top-0 z-30 px-3 pt-3 sm:px-4 lg:px-8">
            <div className="topbar-3d flex h-14 items-center gap-2 rounded-2xl px-2.5 sm:gap-3 sm:px-4">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu />
            </Button>
            {context && <div className="hidden min-w-0 items-center md:flex">{context}</div>}
            <div className="flex min-w-0 flex-1 justify-center">
              <CommandTrigger />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              <ThemeToggle />
              <UserMenu />
            </div>
            </div>
          </header>
          <div className="banner-slot px-3 sm:px-4 lg:px-8">{banner}</div>
          <main
            id="main"
            className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          >
            {children ?? <Outlet />}
          </main>
        </div>
        <CommandPalette
          sections={sections}
          orgRole={orgRole ?? null}
          searchResources={homePath === '/app'}
        />
      </div>
    </TooltipProvider>
  );
}
