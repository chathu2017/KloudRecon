import { LogOut, Moon, Shield, Sun, UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar } from '@/components/ui/misc';
import { useAuth, useMe } from '@/lib/auth/context';
import { titleCase } from '@/lib/format';
import { resolveTheme, useTheme } from '@/lib/theme';

export function UserMenu() {
  const { data: me } = useMe();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { preference, toggle } = useTheme();
  const name = me?.name || me?.email || 'Account';
  const role = me?.is_platform_owner ? 'Platform Owner' : titleCase(me?.user?.org_role ?? '');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-md p-1 hover:bg-surface-2"
        aria-label="Account menu"
      >
        <Avatar name={name} className="size-7" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-text">{name}</span>
          <span className="truncate font-normal">{me?.email}</span>
          {role && <span className="mt-1 font-normal text-brand-strong">{role}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            navigate(me?.is_platform_owner ? '/owner/profile' : '/app/settings/profile')
          }
        >
          <UserCircle /> Profile
        </DropdownMenuItem>
        {me?.is_platform_owner && (
          <DropdownMenuItem onSelect={() => navigate('/owner')}>
            <Shield /> Owner console
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={toggle}>
          {resolveTheme(preference) === 'dark' ? <Sun /> : <Moon />}
          {resolveTheme(preference) === 'dark' ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOut().then(() => navigate('/login'));
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
