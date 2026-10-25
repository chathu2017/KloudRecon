import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
        <Compass className="size-7" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="eyebrow mt-6">Error 404</p>
      <h1 className="display-2 mt-2">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        The page you are looking for does not exist or was moved.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  );
}
