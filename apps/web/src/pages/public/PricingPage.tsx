import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { api, unwrap } from '@/lib/api/client';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Diagonals, PageIntro } from './marketing';

interface PlanCard {
  code: string;
  name: string;
  description: string;
  price: string | null;
  currency: string;
}

/** Defaults from plan Section 18, used if the API is unreachable. */
const FALLBACK: PlanCard[] = [
  { code: 'trial', name: 'Trial', description: 'Free for 14 days.', price: '0', currency: 'USD' },
  {
    code: 'starter',
    name: 'Starter',
    description: 'For small teams running one Azure environment.',
    price: '10',
    currency: 'USD',
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'For consultants and growing cloud teams.',
    price: '49',
    currency: 'USD',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited scale and SLA.',
    price: null,
    currency: 'USD',
  },
];

const INCLUDED: Record<string, string[]> = {
  trial: [
    '1 Azure connection',
    '3 subscriptions',
    '3 scans per day',
    '50 AI messages',
    'Reports with watermark',
  ],
  starter: [
    '1 Azure connection',
    '5 subscriptions',
    'Daily scan',
    '200 AI messages',
    'All reports',
    '1 compliance framework',
  ],
  pro: [
    '5 Azure connections',
    '50 subscriptions',
    'All compliance frameworks',
    'Custom rules & webhooks',
    'White-label & scheduled reports',
    '1,000 AI messages',
  ],
  enterprise: [
    'Unlimited connections',
    'Consultant multi-tenant',
    'SSO (roadmap)',
    'SLA and priority support',
  ],
};

const MAX_ITEMS = Math.max(...Object.values(INCLUDED).map((items) => items.length));

/**
 * Plan cards on one CSS subgrid: name, description, price, every feature row and the button line
 * up across all plans (equal heights, CTAs aligned at the bottom).
 */
export function PricingCards() {
  const { data } = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: () => unwrap(api.GET('/api/v1/public/plans')),
    staleTime: 300_000,
    retry: false,
  });
  const plans: PlanCard[] = data?.length
    ? data.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        price: p.price_monthly,
        currency: p.currency,
      }))
    : FALLBACK;
  const rows = 3 + MAX_ITEMS + 1; // name, description, price, features, button

  return (
    <div className="grid gap-x-5 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const featured = plan.code === 'pro';
        const custom = plan.price === null;
        const items = INCLUDED[plan.code] ?? [];
        return (
          <div
            key={plan.code}
            style={{ gridRow: `span ${rows}` }}
            className={cn(
              'hover-lift glow-card relative isolate grid grid-rows-subgrid gap-y-0 overflow-hidden rounded-xl p-7',
              featured
                ? 'bg-brand bg-(image:--grad-brand) text-brand-fg shadow-[var(--glow)]'
                : 'border border-border bg-(image:--grad-tile)',
            )}
          >
            {featured && <Diagonals tone="brand" className="inset-0 -z-10 h-full w-full" />}
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-2xl font-medium tracking-[-0.02em]">{plan.name}</h3>
              {featured && (
                <span className="rounded-full border border-brand-fg/40 px-2.5 py-0.5 text-xs font-semibold">
                  Most popular
                </span>
              )}
            </div>
            <p className={cn('mt-2 text-sm leading-6', featured ? 'text-brand-fg' : 'text-muted')}>{plan.description}</p>
            <div className="mb-6 mt-7 flex items-baseline gap-1">
              <span className="text-[40px] font-medium leading-[44px] tracking-[-0.035em] tabular">
                {custom ? 'Custom' : formatMoney(plan.price, plan.currency)}
              </span>
              {!custom && <span className={cn('text-sm', featured ? 'text-brand-fg' : 'text-muted')}>/month</span>}
            </div>
            {Array.from({ length: MAX_ITEMS }, (_, i) => items[i]).map((item, i) =>
              item ? (
                <div
                  key={item}
                  className={cn('flex items-start gap-2.5 border-t py-2.5 text-sm', featured ? 'border-brand-fg/20' : 'border-border')}
                >
                  <Check
                    className={cn('mt-0.5 size-4 shrink-0', featured ? 'text-brand-fg' : 'text-brand-strong')}
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  {item}
                </div>
              ) : (
                <div key={`empty-${i}`} aria-hidden className={cn('border-t', featured ? 'border-brand-fg/20' : 'border-border')} />
              ),
            )}
            <div className="flex items-end pt-7">
              <Button
                asChild
                size="lg"
                variant={featured ? 'secondary' : 'outline'}
                className={cn('btn-arrow w-full justify-between', featured && 'border-transparent bg-surface text-brand-strong hover:bg-brand-soft')}
              >
                <Link to="/signup">
                  {custom ? 'Contact us' : plan.code === 'trial' ? 'Start free trial' : 'Get started'}
                  <ArrowUpRight />
                </Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PricingPage() {
  return (
    <>
      <PageIntro
        eyebrow="Pricing"
        title="Plans for every Azure estate"
        text="Every plan is read-only and includes security checks, inventory and cost insights. Prices in USD, billed monthly."
      />
      <div className="bg-surface">
        <div className="mk-container py-16 sm:py-20">
          <PricingCards />
          <p className="mt-10 max-w-2xl text-sm leading-6 text-muted">
            New accounts are reviewed by our team before activation. The plan is confirmed when your
            account is approved.
          </p>
        </div>
      </div>
    </>
  );
}
