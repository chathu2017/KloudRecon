import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { AiPanel, AiText, PointList, RefChips, type PointLike } from './components';

type Content = Record<string, unknown>;

function points(content: Content, key: string): PointLike[] {
  const v = content[key];
  return Array.isArray(v) ? (v as PointLike[]) : [];
}

function str(content: Content, key: string): string {
  const v = content[key];
  return typeof v === 'string' ? v : '';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 [overflow-wrap:anywhere]">
      <h4 className="mb-2 text-xs font-semibold text-muted">{title}</h4>
      {children}
    </section>
  );
}

/** Overview: executive summary of the latest scan. */
export function ExecutiveSummaryPanel() {
  return (
    <AiPanel kind="summary" title="Executive summary" description="What leadership needs to know from the latest scan.">
      {(gen) => {
        const c = gen.content ?? {};
        return (
          <div className="space-y-5">
            <div>
              <p className="font-display text-lg font-semibold leading-snug">
                <AiText text={str(c, 'headline')} refs={gen.refs} />
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                <AiText text={str(c, 'overview')} refs={gen.refs} />
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              <Section title="Top risks">
                <PointList items={points(c, 'risks')} refs={gen.refs} tone="critical" />
              </Section>
              <Section title="Savings">
                <PointList items={points(c, 'savings')} refs={gen.refs} tone="success" />
              </Section>
              <Section title="Next steps">
                <PointList items={points(c, 'next_steps')} refs={gen.refs} ordered />
              </Section>
            </div>
          </div>
        );
      }}
    </AiPanel>
  );
}

interface PathExplanation {
  ref: string;
  title: string;
  narrative: string;
  business_impact?: string;
  break_the_chain?: string;
}
interface FixStep {
  order: number;
  action: string;
  why?: string;
  refs?: string[];
  effort: string;
  risk_reduction: string;
}

/** Attack paths page: plain-language explanation and an ordered fix plan. */
export function SecurityAnalystPanel() {
  return (
    <AiPanel
      kind="analyst"
      title="AI Security Analyst"
      description="How each attack path works, and the fastest order to close them."
    >
      {(gen) => {
        const c = gen.content ?? {};
        const paths = (Array.isArray(c.paths) ? c.paths : []) as PathExplanation[];
        const plan = (Array.isArray(c.fix_plan) ? c.fix_plan : []) as FixStep[];
        return (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-muted">
              <AiText text={str(c, 'overview')} refs={gen.refs} />
            </p>
            {paths.length > 0 && (
              <Section title="Attack paths explained">
                <ul className="space-y-3">
                  {paths.map((p) => (
                    <li key={p.ref} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <RefChips ids={[p.ref]} refs={gen.refs} />
                        {p.title}
                      </div>
                      <p className="mt-1 text-muted">
                        <AiText text={p.narrative} refs={gen.refs} />
                      </p>
                      {p.business_impact && <p className="mt-1 text-muted">Impact: {p.business_impact}</p>}
                      {p.break_the_chain && (
                        <p className="mt-1">
                          <span className="font-medium">Break the chain: </span>
                          <AiText text={p.break_the_chain} refs={gen.refs} />
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section title="Fix plan">
              <ol className="space-y-2">
                {plan.map((s) => (
                  <li key={s.order} className="flex gap-3 text-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-fg">
                      {s.order}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">
                        <AiText text={s.action} refs={gen.refs} />
                      </span>
                      <RefChips ids={s.refs ?? []} refs={gen.refs} />
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {s.why}
                        <Badge>Effort {s.effort}</Badge>
                        <Badge tone={s.risk_reduction === 'high' ? 'danger' : 'neutral'}>
                          Risk reduction {s.risk_reduction}
                        </Badge>
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
            {points(c, 'toxic').length > 0 && (
              <Section title="Toxic combinations">
                <PointList items={points(c, 'toxic')} refs={gen.refs} tone="critical" />
              </Section>
            )}
          </div>
        );
      }}
    </AiPanel>
  );
}

interface ReviewItem extends PointLike {
  pillar: string;
  severity: string;
}

/** Diagrams / architecture document: Well-Architected review of one view. */
export function ArchitectureReviewPanel({ view }: { view: string }) {
  return (
    <AiPanel
      kind="architecture-review"
      params={{ view }}
      title="AI Architecture Review"
      description="Well-Architected review of this view: strengths, risks and improvements."
    >
      {(gen) => {
        const c = gen.content ?? {};
        const risks = (Array.isArray(c.risks) ? c.risks : []) as ReviewItem[];
        const improvements = (Array.isArray(c.improvements) ? c.improvements : []) as ReviewItem[];
        const tag = (i: ReviewItem) => ({ ...i, detail: `${i.detail ?? ''} (${i.pillar}, ${i.severity})`.trim() });
        return (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-muted">
              <AiText text={str(c, 'summary')} refs={gen.refs} />
            </p>
            <div className="grid gap-5 lg:grid-cols-3">
              <Section title="Strengths">
                <PointList items={points(c, 'strengths')} refs={gen.refs} tone="success" />
              </Section>
              <Section title="Risks">
                <PointList items={risks.map(tag)} refs={gen.refs} tone="critical" />
              </Section>
              <Section title="Improvements">
                <PointList items={improvements.map(tag)} refs={gen.refs} ordered />
              </Section>
            </div>
          </div>
        );
      }}
    </AiPanel>
  );
}

/** Finding detail: a remediation guide tailored to the rule and resource type. */
export function RemediationPanel({ findingId }: { findingId: string }) {
  return (
    <AiPanel
      kind="remediation"
      params={{ findingId }}
      title="AI remediation guide"
      description="Tailored to this finding type and resource type (shared by similar findings)."
      emptyLabel="Write a tailored fix"
    >
      {(gen) => {
        const c = gen.content ?? {};
        const steps = (Array.isArray(c.steps) ? c.steps : []) as string[];
        const caveats = (Array.isArray(c.caveats) ? c.caveats : []) as string[];
        const cli = str(c, 'cli');
        return (
          <div className="space-y-4 text-sm">
            <p className="text-muted">{str(c, 'summary')}</p>
            <ol className="list-decimal space-y-1.5 pl-5">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {cli && (
              <pre className="overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs">{cli}</pre>
            )}
            {str(c, 'verification') && (
              <p>
                <span className="font-medium">Verify: </span>
                {str(c, 'verification')}
              </p>
            )}
            {caveats.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-muted">
                {caveats.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </AiPanel>
  );
}
