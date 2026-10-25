import { z } from 'zod';
import type { ConnectionCreate } from './api';
import type { TierKey } from './content';

export const GUID = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9-]{1,63})+$/i;

/** Client-side mirror of the API validation (the API re-validates everything). */
export const connectionSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the connection a name.').max(100),
    tenant_id: z
      .string()
      .trim()
      .refine((v) => GUID.test(v) || DOMAIN.test(v), 'Enter the Directory (tenant) ID (a GUID).'),
    client_id: z.string().trim().regex(GUID, 'Enter the Application (client) ID (a GUID).'),
    client_secret: z
      .string()
      .trim()
      .min(8, 'Paste the client secret Value.')
      .max(1024)
      .refine(
        (v) => !GUID.test(v),
        'This looks like the secret ID. Copy the secret Value instead (shown once, right after you create it).',
      ),
    secret_expires_on: z.string().optional(),
    scope_type: z.enum(['all', 'subscriptions', 'management_group']),
    subscription_ids: z.string().optional(),
    management_group_id: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope_type === 'subscriptions') {
      const ids = splitIds(v.subscription_ids ?? '');
      if (!ids.length || ids.some((id) => !GUID.test(id)))
        ctx.addIssue({
          code: 'custom',
          path: ['subscription_ids'],
          message: 'Enter one or more subscription IDs (GUIDs), one per line.',
        });
    }
    if (v.scope_type === 'management_group' && !v.management_group_id)
      ctx.addIssue({
        code: 'custom',
        path: ['management_group_id'],
        message: 'Enter the management group ID.',
      });
  });
export type ConnectionFormValues = z.infer<typeof connectionSchema>;

export function splitIds(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toCreateBody(
  values: ConnectionFormValues,
  tiers: Record<TierKey, boolean>,
): ConnectionCreate {
  return {
    name: values.name,
    tenant_id: values.tenant_id,
    client_id: values.client_id,
    client_secret: values.client_secret,
    secret_expires_on: values.secret_expires_on || null,
    scope: {
      type: values.scope_type,
      subscription_ids:
        values.scope_type === 'subscriptions' ? splitIds(values.subscription_ids ?? '') : [],
      management_group_id:
        values.scope_type === 'management_group' ? (values.management_group_id ?? null) : null,
    },
    tiers: { core: true, identity: tiers.identity, commitments: tiers.commitments },
  };
}
