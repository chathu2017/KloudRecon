import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type Billing = Schemas['BillingOut'];
export type PlanOption = Schemas['PlanOption'];
export type UsageItem = Schemas['UsageItem'];

export const billingKey = ['billing'] as const;

export function useBilling(enabled = true) {
  return useQuery({
    queryKey: billingKey,
    queryFn: () => unwrap(api.GET('/api/v1/billing')),
    enabled,
    staleTime: 60_000,
  });
}

/** Stripe/Paddle: go to the hosted checkout or customer portal. */
export function useCheckout() {
  return useMutation({
    mutationFn: (planCode: string) => unwrap(api.POST('/api/v1/billing/checkout', { body: { plan_code: planCode } })),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function usePortal() {
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/billing/portal')),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Manual billing: ask KloudSchool to change the plan. */
export function useUpgradeRequest() {
  return useMutation({
    mutationFn: (body: { plan_code: string; message?: string }) =>
      unwrap(api.POST('/api/v1/billing/upgrade-request', { body: { message: '', ...body } })),
    onSuccess: () => toast.success('Request sent. KloudSchool will get back to you shortly.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
