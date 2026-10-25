import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { Tooltip } from '@/components/ui/misc';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { hasRole, type NavItem, type NavSection } from './nav';

export interface SidebarProps {
  sections: NavSection[];
  orgRole?: string | null;
  badges?: Partial<Record<NonNullable<NavItem['badgeKey']>, number>>;
  footer?: React.ReactNode;
  homePath: string;
  onNavigate?: () => void;
  forceExpanded?: boolean;
}

function Item({
  item,
  collapsed,
  badge,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  badge?: number | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const Icon = item.icon;
  const base =
    'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-[background-color,color,box-shadow,transform] duration-200 pointer-coarse:h-11 [&_svg]:stroke-[1.7] [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-110';

  if (item.soon) {
    const content = (
      <div
        aria-disabled
        className={cn(base, 'cursor-default text-subtle', collapsed && 'justify-center px-0')}
      >
        <Icon className="size-[18px] shrink-0" aria-hidden />
        {!collapsed && (
          <>
            <span className="truncate">{item.label}</span>
            <span className="ml-auto rounded-full bg-surface-2 px-1.5 text-[11px] text-subtle">
              Soon
            </span>
          </>
        )}
      </div>
    );
    return collapsed ? (
      <Tooltip content={`${item.label} — coming soon`} side="right">
        {content}
      </Tooltip>
    ) : (
      content
    );
  }

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/app' || item.to === '/owner'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          base,
          isActive
            ? 'nav-key font-semibold text-key-fg [&_svg]:text-key-fg'
            : 'text-muted hover:bg-surface-2 hover:text-text',
          collapsed && 'justify-center px-0',
        )
      }
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-fg tabular group-aria-[current=page]:bg-key-fg group-aria-[current=page]:text-[var(--key-lower)]">
          {badge}
        </span>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function Sidebar({
  sections,
  orgRole,
  badges,
  footer,
  homePath,
  onNavigate,
  forceExpanded = false,
}: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar } = useUi();
  const collapsed = sidebarCollapsed && !forceExpanded;

  return (
    // A midnight panel in both themes: the subtree reads the dark tokens (like the marketing bands).
    <div
      data-theme="dark"
      className={cn('flex h-full flex-col overflow-hidden text-text', forceExpanded ? 'border-r border-border bg-surface' : 'panel-3d rounded-2xl')}
    >
      <div className={cn('flex h-16 items-center px-5', collapsed && 'justify-center px-0')}>
        <NavLink to={homePath} aria-label="KloudRecon home" onClick={onNavigate}>
          <Logo compact={collapsed} suffix={false} />
        </NavLink>
      </div>
      <nav aria-label="Main" className="nav-fade flex-1 space-y-5 overflow-y-auto px-3 pb-8 pt-2">
        {sections.map((section, idx) => (
          <div key={section.title ?? idx}>
            {section.title && !collapsed && (
              <div className="mb-1.5 px-3 text-xs font-semibold text-subtle">
                {section.title}
              </div>
            )}
            <ul className="space-y-1">
              {section.items
                .filter((item) => !item.minRole || hasRole(orgRole, item.minRole))
                .map((item) => (
                  <li key={item.to}>
                    <Item
                      item={item}
                      collapsed={collapsed}
                      badge={item.badgeKey ? badges?.[item.badgeKey] : undefined}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer && !collapsed && <div className="border-t border-border p-3">{footer}</div>}
      {!forceExpanded && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-11 items-center justify-center gap-2 border-t border-border text-xs font-medium text-muted hover:bg-surface-2 hover:text-text"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      )}
    </div>
  );
}
