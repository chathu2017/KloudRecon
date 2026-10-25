import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { setTokenGetter } from '@/lib/api/client';
import { createAuthAdapter, type AuthAdapter, type SignInOptions } from './adapters';
import { AuthContext } from './context';

export function AuthProvider({
  children,
  adapter: injected,
}: {
  children: React.ReactNode;
  adapter?: AuthAdapter;
}) {
  const [adapter] = React.useState<AuthAdapter>(() => injected ?? createAuthAdapter());
  const [ready, setReady] = React.useState(false);
  const [signedIn, setSignedIn] = React.useState(false);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    setTokenGetter(() => adapter.getToken());
    let cancelled = false;
    adapter
      .init()
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setSignedIn(adapter.isSignedIn());
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const signIn = React.useCallback(
    async (options?: SignInOptions) => {
      await adapter.signIn(options);
      queryClient.clear();
      setSignedIn(adapter.isSignedIn());
    },
    [adapter, queryClient],
  );

  const signOut = React.useCallback(async () => {
    queryClient.clear();
    setSignedIn(false);
    await adapter.signOut();
  }, [adapter, queryClient]);

  const value = React.useMemo(
    () => ({ adapter, ready, signedIn, signIn, signOut }),
    [adapter, ready, signedIn, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
