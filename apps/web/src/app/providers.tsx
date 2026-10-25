import { MsalProvider } from '@azure/msal-react';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { Toaster } from 'sonner';
import { EntraAuthAdapter, type AuthAdapter, createAuthAdapter } from '@/lib/auth/adapters';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { resolveTheme, useTheme, watchSystemTheme } from '@/lib/theme';
import { makeQueryClient } from './query-client';

function ThemedToaster() {
  const preference = useTheme((s) => s.preference);
  return (
    <Toaster
      theme={resolveTheme(preference)}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: '!bg-surface !text-text !border-border !shadow-md',
          description: '!text-muted',
        },
      }}
    />
  );
}

export function AppProviders({
  children,
  queryClient,
  adapter,
}: {
  children: React.ReactNode;
  queryClient?: QueryClient;
  adapter?: AuthAdapter;
}) {
  const [client] = React.useState(() => queryClient ?? makeQueryClient());
  const [auth] = React.useState(() => adapter ?? createAuthAdapter());
  React.useEffect(() => watchSystemTheme(), []);
  // Marks the app as interactive (prerendered public pages are static HTML until then); E2E
  // tests wait for it before clicking (e2e/helpers.ts `waitForApp`).
  React.useEffect(() => {
    document.documentElement.dataset.ready = 'true';
  }, []);

  const tree = (
    <QueryClientProvider client={client}>
      <AuthProvider adapter={auth}>
        {children}
        <ThemedToaster />
      </AuthProvider>
    </QueryClientProvider>
  );
  // Entra mode: expose MSAL to msal-react hooks as well.
  return auth instanceof EntraAuthAdapter ? (
    <MsalProvider instance={auth.msal}>{tree}</MsalProvider>
  ) : (
    tree
  );
}
