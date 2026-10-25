import { useQuery } from '@tanstack/react-query';
import { Boxes, LogOut, Moon, Search, Sun } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/misc';
import { api, unwrap } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/context';
import { useDebounced } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { useUi } from '@/lib/ui-store';
import { hasRole, type NavSection } from './nav';

/** Ctrl/Cmd+K: jump to any page, find a resource (customer workspace) or run an action. */
export function CommandPalette({
  sections,
  orgRole,
  searchResources = false,
}: {
  sections: NavSection[];
  orgRole?: string | null;
  searchResources?: boolean;
}) {
  const { commandOpen, setCommandOpen } = useUi();
  const [search, setSearch] = React.useState('');
  const term = useDebounced(search.trim(), 250);
  const { data: resources } = useQuery({
    queryKey: ['inventory', 'palette', term],
    queryFn: () =>
      unwrap(api.GET('/api/v1/resources', { params: { query: { q: term, limit: 8 } } })),
    enabled: searchResources && commandOpen && term.length >= 2,
    staleTime: 30_000,
  });
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const toggleTheme = useTheme((s) => s.toggle);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(!useUi.getState().commandOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [setCommandOpen]);

  const run = (fn: () => void) => {
    setCommandOpen(false);
    fn();
  };

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent className="top-[16vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0" hideClose>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command loop>
          <CommandInput
            placeholder={
              searchResources ? 'Search resources, pages and actions…' : 'Search pages and actions…'
            }
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            {searchResources && term.length >= 2 && (resources?.items.length ?? 0) > 0 && (
              <CommandGroup heading="Resources">
                {resources?.items.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`${search} ${r.name} ${r.arm_id}`}
                    onSelect={() =>
                      run(
                        () =>
                          void navigate(`/app/inventory?resource=${encodeURIComponent(r.arm_id)}`),
                      )
                    }
                  >
                    <Boxes />
                    <span className="truncate">{r.name}</span>
                    <span className="ml-auto truncate text-xs text-muted">{r.resource_group}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {sections.map((section, idx) => {
              const items = section.items.filter(
                (i) => !i.soon && (!i.minRole || hasRole(orgRole, i.minRole)),
              );
              if (items.length === 0) return null;
              return (
                <CommandGroup key={section.title ?? idx} heading={section.title ?? 'Navigate'}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.to}
                      value={`${section.title ?? ''} ${item.label}`}
                      onSelect={() => run(() => void navigate(item.to))}
                    >
                      <item.icon />
                      {item.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            <CommandGroup heading="Actions">
              <CommandItem value="toggle theme dark light" onSelect={() => run(toggleTheme)}>
                <Sun className="dark:hidden" />
                <Moon className="hidden dark:block" />
                Toggle light / dark
              </CommandItem>
              <CommandItem
                value="sign out logout"
                onSelect={() => run(() => void signOut().then(() => navigate('/login')))}
              >
                <LogOut />
                Sign out
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="flex items-center gap-4 border-t border-border bg-surface-2 px-4 py-2 text-xs text-muted" aria-hidden>
            <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> Move</span>
            <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> Open</span>
            <span className="ml-auto flex items-center gap-1.5"><Kbd>Esc</Kbd> Close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandTrigger() {
  const setCommandOpen = useUi((s) => s.setCommandOpen);
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
  return (
    <button
      type="button"
      onClick={() => setCommandOpen(true)}
      aria-label="Search resources and pages"
      className="flex size-9 items-center justify-center gap-2 well rounded-xl border border-border text-sm text-subtle transition-colors duration-150 hover:border-brand/50 hover:text-muted pointer-coarse:size-11 sm:w-full sm:max-w-80 sm:justify-start sm:px-3"
    >
      <Search className="size-4" aria-hidden />
      <span className="hidden flex-1 truncate text-left sm:inline" aria-hidden>Search…</span>
      <Kbd className="hidden sm:inline-flex">{isMac ? '⌘' : 'Ctrl'}</Kbd>
      <Kbd className="hidden sm:inline-flex">K</Kbd>
    </button>
  );
}
