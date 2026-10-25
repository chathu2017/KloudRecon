import { Laptop, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHydrated } from '@/lib/hooks';
import { useTheme, type ThemePreference } from '@/lib/theme';

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const hydrated = useHydrated();
  const trigger = (
    <Button variant="ghost" size="icon-sm" aria-label="Change theme">
      {/* CSS decides the icon, so the markup is the same in both themes (prerendered pages) */}
      <Moon className="hidden page-dark:block" />
      <Sun className="page-dark:hidden" />
    </Button>
  );
  // The menu's generated ids cannot match prerendered HTML: plain button until hydrated.
  if (!hydrated) return trigger;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Laptop /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
