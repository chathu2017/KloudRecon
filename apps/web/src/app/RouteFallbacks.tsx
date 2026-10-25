import { RefreshCw, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { isRouteErrorResponse, Link, Outlet, useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FullPageSpinner } from './guards';

/** Suspense boundary for full-page (lazy) routes. */
export function Suspended() {
  return (
    <React.Suspense fallback={<FullPageSpinner />}>
      <Outlet />
    </React.Suspense>
  );
}

/** Suspense boundary inside the app shells, so the chrome stays while a page loads. */
export function InShell() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted" role="status">
          Loading…
        </div>
      }
    >
      <Outlet />
    </React.Suspense>
  );
}

/** A code chunk failed to load: usually a new release replaced the files this tab expects. */
function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|module script failed|Loading chunk|ChunkLoadError/i.test(message);
}

/**
 * Route error screen (instead of the router's developer message). Says what happened and what to
 * do; inside the app shells the navigation stays usable (`inShell`).
 */
export function RouteError({ inShell = false }: { inShell?: boolean }) {
  const error = useRouteError();
  const chunk = isChunkError(error);
  const title = chunk
    ? 'A new version of KloudRecon is available'
    : isRouteErrorResponse(error) && error.status === 404
      ? 'Page not found'
      : 'This page could not be shown';
  const text = chunk
    ? 'Reload the page to continue with the latest version.'
    : 'Reload the page to try again. If it keeps happening, go back to the start page.';
  return (
    <div
      role="alert"
      className={
        inShell
          ? 'flex min-h-[50vh] items-center justify-center py-12'
          : 'flex min-h-screen items-center justify-center bg-bg px-4 py-12'
      }
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
          {chunk ? <RefreshCw className="size-6" strokeWidth={1.5} aria-hidden /> : <TriangleAlert className="size-6" strokeWidth={1.5} aria-hidden />}
        </span>
        <h1 className="mt-5 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{text}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw /> Reload page
          </Button>
          <Button asChild variant="secondary">
            <Link to="/start" reloadDocument>
              Go to start
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
