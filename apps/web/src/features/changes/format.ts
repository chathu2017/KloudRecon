import type { Change } from '@/features/inventory/api';

/** "Microsoft.Network/networkSecurityGroups/securityRules/write" → "securityRules · write". */
export function operationLabel(operation: string | null | undefined): string {
  if (!operation) return '';
  const parts = operation.split('/');
  const verb = parts.pop() ?? '';
  const noun = parts.pop() ?? '';
  return verb === 'action' ? `${parts.pop() ?? noun} · ${noun}` : `${noun} · ${verb}`;
}

export function changeFields(change: Change): { path: string; before: unknown; after: unknown }[] {
  const fields = change.diff.fields;
  return Array.isArray(fields)
    ? (fields as { path: string; before: unknown; after: unknown }[])
    : [];
}
