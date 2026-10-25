import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { AuditTable } from '@/features/owner/AuditPage';
import { api, unwrap } from '@/lib/api/client';

/** Organization audit log (admins and owners). */
export function OrgAuditPage() {
  const { data, isPending } = useQuery({
    queryKey: ['org', 'audit'],
    queryFn: () => unwrap(api.GET('/api/v1/org/audit-logs', { params: { query: { limit: 200 } } })),
  });
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Sensitive actions in your organization: roles, invitations, profile and approval events."
      />
      <Card className="overflow-hidden">
        <AuditTable rows={data ?? []} loading={isPending} />
      </Card>
    </>
  );
}
