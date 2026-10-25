import type { Me } from '@/lib/auth/context';

export type AccountState = Me['state'];

/** Where an account in a given state belongs. */
export function homeFor(me: Pick<Me, 'state' | 'is_platform_owner'>): string {
  switch (me.state) {
    case 'profile_incomplete':
      return '/onboarding';
    case 'pending_approval':
      return '/under-review';
    case 'rejected':
    case 'suspended':
      return '/rejected';
    case 'active':
      return me.is_platform_owner ? '/owner' : '/app';
  }
}
