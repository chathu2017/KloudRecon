import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowUp,
  ArrowUpRight,
  Coins,
  Database,
  GitCompareArrows,
  History,
  Loader2,
  type LucideIcon,
  MessageSquarePlus,
  Route,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Kbd, Tooltip } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, getAccessToken, unwrap, type Schemas } from '@/lib/api/client';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { AiText } from './components';
import type { GenRef } from './api';

type ChatMessage = Schemas['ChatMessageOut'];

const TOOL_LABEL: Record<string, string> = {
  search_resources: 'Searching resources',
  get_resource: 'Reading the resource',
  get_costs: 'Reading costs',
  get_forecast: 'Reading the forecast',
  list_findings: 'Reading findings',
  get_attack_paths: 'Reading attack paths',
  get_compliance: 'Reading compliance',
  get_diagram_summary: 'Reading the architecture',
  get_scores: 'Reading scores',
  get_changes: 'Reading changes',
};

const SUGGESTIONS: { q: string; hint: string; icon: LucideIcon; tile: string }[] = [
  { q: 'What should we fix first?', hint: 'Top risks, ranked by impact', icon: ShieldAlert, tile: 'tile-amber' },
  { q: 'Which resources are the most expensive?', hint: 'Cost by resource for this month', icon: Coins, tile: 'tile-green' },
  { q: 'Explain our attack paths', hint: 'How an attacker could reach your data', icon: Route, tile: '' },
  { q: 'What changed this week?', hint: 'Added, removed and modified resources', icon: GitCompareArrows, tile: 'tile-sky' },
  { q: 'How compliant are we with CIS?', hint: 'Passing and failing controls', icon: ShieldCheck, tile: 'tile-green' },
];

/** Select value for "no session yet" (Radix does not allow an empty item value). */
const NEW = 'new';

/** Minimal, safe Markdown: paragraphs, bullet lists, **bold**, _italic_ and citations. */
export function ChatMarkdown({ text, refs }: { text: string; refs: Record<string, GenRef> }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const inline = (s: string, key: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|(?<![\w@.#])_[^_\s][^_]*_(?![\w@.#]))/g);
    return (
      <React.Fragment key={key}>
        {parts.map((p, i) =>
          p.startsWith('**') && p.endsWith('**') ? (
            <strong key={i}>
              <AiText text={p.slice(2, -2)} refs={refs} />
            </strong>
          ) : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? (
            <em key={i} className="text-muted">
              <AiText text={p.slice(1, -1)} refs={refs} />
            </em>
          ) : (
            <AiText key={i} text={p} refs={refs} />
          ),
        )}
      </React.Fragment>
    );
  };
  const flush = (key: string) => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-1 pl-5">
        {items.map((l, i) => (
          <li key={i}>{inline(l, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
  };
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1] ?? '');
      return;
    }
    flush(`ul-${i}`);
    if (line.trim()) blocks.push(<p key={`p-${i}`}>{inline(line, `p-${i}`)}</p>);
  });
  flush('ul-end');
  return <div className="space-y-1.5 text-sm leading-6">{blocks}</div>;
}

interface Live {
  text: string;
  tools: string[];
}

export function ChatPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const location = useLocation();
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [input, setInput] = React.useState('');
  const [live, setLive] = React.useState<Live | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  const sessions = useQuery({
    queryKey: ['ai', 'chat', 'sessions'],
    queryFn: () => unwrap(api.GET('/api/v1/ai/chat/sessions')),
    enabled: open,
  });
  const detail = useQuery({
    queryKey: ['ai', 'chat', 'session', sessionId],
    queryFn: () =>
      unwrap(api.GET('/api/v1/ai/chat/sessions/{session_id}', { params: { path: { session_id: sessionId ?? '' } } })),
    enabled: open && !!sessionId,
  });
  const messages: ChatMessage[] = detail.data?.messages ?? [];

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, live?.text, pending]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || live) return;
    setInput('');
    let sid = sessionId;
    try {
      if (!sid) {
        const created = await unwrap(api.POST('/api/v1/ai/chat/sessions'));
        sid = created.id;
        setSessionId(sid);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start a chat.');
      return;
    }
    setPending(text);
    setLive({ text: '', tools: [] });
    const token = await getAccessToken();
    const controller = new AbortController();
    try {
      await fetchEventSource(`${env.apiBaseUrl}/api/v1/ai/chat/sessions/${sid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: text, page: location.pathname }),
        signal: controller.signal,
        openWhenHidden: true,
        async onopen(res) {
          if (res.ok) return;
          let message = 'The question could not be sent.';
          try {
            const body = (await res.json()) as { error?: { message?: string } };
            message = body.error?.message ?? message;
          } catch {
            /* not JSON */
          }
          throw new Error(message);
        },
        onmessage(ev) {
          if (!ev.data) return;
          const data = JSON.parse(ev.data) as { type: string; text?: string; name?: string; message?: string };
          if (data.type === 'delta' && data.text) setLive((l) => (l ? { ...l, text: l.text + (data.text ?? '') } : l));
          else if (data.type === 'tool' && data.name) setLive((l) => (l ? { ...l, tools: [...l.tools, data.name ?? ''] } : l));
          else if (data.type === 'error') toast.error(data.message ?? 'The answer could not be completed.');
        },
        onerror(err) {
          throw err instanceof Error ? err : new Error('The answer could not be completed.');
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The answer could not be completed.');
    } finally {
      controller.abort();
      await qc.invalidateQueries({ queryKey: ['ai', 'chat'] });
      await qc.invalidateQueries({ queryKey: ['ai', 'usage'] });
      setLive(null);
      setPending(null);
    }
  };

  const remove = async () => {
    if (!sessionId) return;
    await unwrap(api.DELETE('/api/v1/ai/chat/sessions/{session_id}', { params: { path: { session_id: sessionId } } }));
    setSessionId(null);
    void qc.invalidateQueries({ queryKey: ['ai', 'chat'] });
  };

  const empty = !messages.length && !pending;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-[kr-fade_200ms_var(--ease-out)]" />
        <DialogPrimitive.Content className="chat-panel fixed inset-y-2 right-2 z-50 flex w-[calc(100%-1rem)] max-w-[560px] flex-col overflow-hidden rounded-2xl focus:outline-none data-[state=open]:animate-[kr-slide-in-right_260ms_var(--ease-out)] sm:inset-y-3 sm:right-3">
          <div aria-hidden className="aurora chat-aurora -z-10" />
          <header className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
            <AssistantMark size="lg" />
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="flex items-center gap-2 font-display text-lg font-semibold leading-6 tracking-[-0.015em]">
                Ask KloudRecon
                <span className="rounded-full bg-success-soft px-2 py-px text-[11px] font-semibold text-success-strong">
                  Read-only
                </span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 truncate text-sm text-muted">
                Answers from your latest scan, with links to the sources.
              </DialogPrimitive.Description>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {!empty && (
                <Tooltip content="New conversation">
                  <Button size="icon-sm" variant="ghost" aria-label="New conversation" onClick={() => setSessionId(null)}>
                    <MessageSquarePlus />
                  </Button>
                </Tooltip>
              )}
              {sessionId && (
                <Tooltip content="Delete conversation">
                  <Button size="icon-sm" variant="ghost" aria-label="Delete conversation" onClick={() => void remove()}>
                    <Trash2 />
                  </Button>
                </Tooltip>
              )}
              <DialogPrimitive.Close asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Close">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </header>

          {!!sessions.data?.length && (
            <div className="flex items-center gap-2 px-4 pb-3 sm:px-5">
              <History className="size-4 shrink-0 text-subtle" aria-hidden />
              <Select value={sessionId ?? NEW} onValueChange={(v) => setSessionId(v === NEW ? null : v)}>
                <SelectTrigger aria-label="Conversation" className="h-9 min-w-0 flex-1 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value={NEW}>New conversation</SelectItem>
                  {sessions.data.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="chat-scroll min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-border px-4 py-5 sm:px-5" aria-live="polite">
            {empty && (
              <div className="animate-[kr-fade-up_260ms_var(--ease-out)]">
                <p className="font-display text-2xl font-semibold leading-8 tracking-[-0.025em]">What do you want to know?</p>
                <p className="mt-1.5 text-md text-muted">Ask in your own words, or start with one of these.</p>
                <ul className="mt-5 grid gap-2.5">
                  {SUGGESTIONS.map(({ q, hint, icon: Icon, tile }) => (
                    <li key={q}>
                      <button type="button" onClick={() => void send(q)} className="chat-suggest group">
                        <span className={cn('icon-tile icon-tile-sm', tile)}>
                          <Icon aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold text-text">{q}</span>
                          <span className="block truncate text-xs text-muted">{hint}</span>
                        </span>
                        <ArrowUpRight
                          className="size-4 shrink-0 text-subtle transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-strong"
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.role === 'assistant' ? <ChatMarkdown text={m.content} refs={m.citations} /> : m.content}
                {m.role === 'assistant' && m.tools.length > 0 && <ToolsUsed tools={m.tools} />}
              </Bubble>
            ))}
            {pending && <Bubble role="user">{pending}</Bubble>}
            {live && (
              <Bubble role="assistant">
                {live.text ? (
                  <ChatMarkdown text={live.text} refs={{}} />
                ) : (
                  <span className="flex items-center gap-2.5 text-sm text-muted">
                    <span className="chat-dots" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                    {live.tools.length ? `${TOOL_LABEL[live.tools.at(-1) ?? ''] ?? 'Working'}…` : 'Thinking…'}
                  </span>
                )}
                {live.tools.length > 0 && <ToolsUsed tools={live.tools} />}
              </Bubble>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="px-3 pb-3 pt-2 sm:px-4 sm:pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <div className="chat-composer flex items-end gap-2 rounded-2xl p-2 pl-3.5">
              <Textarea
                aria-label="Ask a question"
                placeholder="Ask about resources, risks, costs, compliance…"
                className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-0 py-2 text-[14px] shadow-none [field-sizing:content] hover:border-0 focus-visible:ring-0"
                rows={1}
                maxLength={2000}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
              />
              <Button type="submit" size="icon" className="size-10 rounded-xl" aria-label="Send" disabled={!input.trim() || !!live}>
                {live ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[11px] text-subtle">
              <span>AI answers can be wrong; numbers come from your scan data and each source is linked.</span>
              <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
                <Kbd>↵</Kbd> to send
              </span>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The assistant's mark: a lit key with the spark. */
function AssistantMark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span
      className={cn(
        'num-key flex shrink-0 items-center justify-center',
        size === 'lg' ? 'size-10 rounded-xl [&_svg]:size-5' : 'size-7 rounded-lg [&_svg]:size-3.5',
      )}
      aria-hidden
    >
      <Sparkles />
    </span>
  );
}

function Bubble({ role, children }: { role: string; children: React.ReactNode }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end animate-[kr-fade-up_200ms_var(--ease-out)]">
        <div className="chat-user max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] font-medium leading-6 [overflow-wrap:anywhere]">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 animate-[kr-fade-up_200ms_var(--ease-out)]">
      <AssistantMark />
      <div className="card-3d min-w-0 flex-1 rounded-2xl rounded-tl-md px-4 py-3 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

function ToolsUsed({ tools }: { tools: string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-[11px] text-muted" aria-label="Data used">
      <li className="flex items-center gap-1 text-subtle">
        <Database className="size-3" aria-hidden /> From
      </li>
      {[...new Set(tools)].map((t) => (
        <li key={t} className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">
          {TOOL_LABEL[t]?.replace(/^Reading (the )?|^Searching /, '') ?? t}
        </li>
      ))}
    </ul>
  );
}

/** Top-bar button that opens the chat (plan 14.4). */
export function AskButton() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => setOpen(true)} aria-keyshortcuts="Control+J" aria-label="Ask KloudRecon">
        <Sparkles />
        <span className="hidden sm:inline">Ask KloudRecon</span>
      </Button>
      <ChatPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
