import { Info, RefreshCw, Sparkles } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { hasRole } from '@/components/layout/nav';
import { useMe } from '@/lib/auth/context';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useGenerate, useGeneration, type AiKind, type GenParams, type GenRef, type Generation } from './api';

const REF = /\[([A-Z]{1,2}\d{1,4})\]/g;

/** Text with citation markers ([F1]) turned into links to the cited finding / resource. */
export function AiText({ text, refs, className }: { text: string; refs: Record<string, GenRef>; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(REF)) {
    const ref = m[1] ?? '';
    const start = m.index;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(<Cite key={`${ref}-${start}`} id={ref} info={refs[ref]} />);
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}

export function Cite({ id, info }: { id: string; info: GenRef | undefined }) {
  if (!info) return null;
  return (
    <Link
      to={info.link}
      title={info.label}
      className="mx-0.5 inline-flex h-[18px] items-center rounded-[5px] border border-brand/30 bg-brand-soft px-1.5 align-text-top font-mono text-[10px] font-semibold text-brand-strong no-underline transition-colors duration-100 hover:border-brand hover:bg-brand hover:text-brand-fg"
    >
      {id}
    </Link>
  );
}

export function RefChips({ ids, refs }: { ids: string[]; refs: Record<string, GenRef> }) {
  if (!ids.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-0.5">
      {ids.map((id) => (
        <Cite key={id} id={id} info={refs[id]} />
      ))}
    </span>
  );
}

/** Frame for every AI panel: status, provenance, regenerate, and the grounded-data notice. */
export function AiPanel({
  kind,
  params,
  title,
  description,
  children,
  className,
  emptyLabel = 'Generate',
}: {
  kind: AiKind;
  params?: GenParams;
  title: string;
  description?: string;
  children: (gen: Generation) => React.ReactNode;
  className?: string;
  emptyLabel?: string;
}) {
  const { data, isPending } = useGeneration(kind, params);
  const generate = useGenerate(kind, params);
  const { data: me } = useMe();
  const canRun = hasRole(me?.user?.org_role, 'member');
  const busy = data?.status === 'pending' || generate.isPending;
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand-soft text-brand-strong [&_svg]:size-3.5 [&_svg]:stroke-[1.75]">
          <Sparkles className="size-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {title}
            {data?.source === 'fallback' ? <Badge>Standard</Badge> : <Badge tone="brand">AI</Badge>}
          </CardTitle>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        {canRun && data && data.status !== 'none' && (
          <Button
            variant="ghost"
            size="sm"
            loading={busy}
            onClick={() => generate.mutate(true)}
            aria-label={`Regenerate ${title}`}
          >
            {!busy && <RefreshCw />}
            Regenerate
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-32" />
        ) : !data || data.status === 'none' ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border-strong p-4 text-sm text-muted">
            <p>Not generated yet. Answers use only this organization&apos;s scan data and cite their sources.</p>
            {canRun && (
              <Button size="sm" loading={busy} onClick={() => generate.mutate(false)}>
                <Sparkles />
                {emptyLabel}
              </Button>
            )}
          </div>
        ) : data.status === 'pending' && !data.content ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="text-sm text-muted">Generating… this takes a few seconds.</p>
            <Skeleton className="h-24" />
          </div>
        ) : data.content ? (
          <>
            {data.notice && (
              <p className="mb-3 flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {data.notice}
              </p>
            )}
            {children(data)}
            <p className="mt-4 text-[11px] text-subtle">
              {data.source === 'ai' ? `Generated by ${data.model ?? 'AI'}` : 'Standard summary'}
              {data.updated_at ? ` · ${timeAgo(data.updated_at)}` : ''} · numbers come only from your scan data;
              verify before acting.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">The generation failed. Try again.</p>
        )}
      </CardContent>
    </Card>
  );
}

export interface PointLike {
  title: string;
  detail?: string;
  refs?: string[];
}

export function PointList({
  items,
  refs,
  tone,
  ordered = false,
}: {
  items: PointLike[];
  refs: Record<string, GenRef>;
  tone?: 'critical' | 'success' | 'brand';
  ordered?: boolean;
}) {
  if (!items.length) return <p className="text-sm text-subtle">None.</p>;
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className="space-y-2.5">
      {items.map((p, i) => (
        <li key={`${p.title}-${i}`} className="flex gap-2 text-sm">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
              tone === 'critical' && 'bg-critical-soft text-critical-strong',
              tone === 'success' && 'bg-success-soft text-success-strong',
              (!tone || tone === 'brand') && 'bg-brand-soft text-brand-strong',
            )}
          >
            {ordered ? i + 1 : '•'}
          </span>
          <span className="min-w-0">
            <span className="font-medium">
              <AiText text={p.title} refs={refs} />
            </span>
            <RefChips ids={p.refs ?? []} refs={refs} />
            {p.detail && (
              <span className="block text-muted">
                <AiText text={p.detail} refs={refs} />
              </span>
            )}
          </span>
        </li>
      ))}
    </List>
  );
}
