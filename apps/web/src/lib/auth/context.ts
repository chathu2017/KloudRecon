import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { api, ApiError, unwrap, type Schemas } from '@/lib/api/client';
import type { AuthAdapter, SignInOptions } from './adapters';

export type Me = Schemas['MeOut'];

export interface AuthContextValue {
  adapter: AuthAdapter;
  ready: boolean;
  signedIn: boolean;
  signIn: (options?: SignInOptions) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const meQueryKey = ['me'] as const;

/** The signed-in account and its state (profile_incomplete, pending_approval, active...). */
export function useMe() {
  const { signedIn, ready, signOut } = useAuth();
  const query = useQuery({
    queryKey: meQueryKey,
    queryFn: () => unwrap(api.GET('/api/v1/me')),
    enabled: ready && signedIn,
    staleTime: 30_000,
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
  });
  const unauthorized = query.error instanceof ApiError && query.error.status === 401;
  React.useEffect(() => {
    if (unauthorized) void signOut();
  }, [unauthorized, signOut]);
  return query;
}
