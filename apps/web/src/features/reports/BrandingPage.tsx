import { ImageUp, Lock } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { hasRole } from '@/components/layout/nav';
import { useMe } from '@/lib/auth/context';
import { useBranding, useSaveBranding, type Branding } from './api';

const MAX_LOGO = 512 * 1024;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

export function BrandingPage() {
  const { data, isPending } = useBranding();
  return (
    <>
      <PageHeader
        title="Report branding"
        description="Your logo, colour and consultant name on the cover of every PDF report."
      />
      {isPending || !data ? <Skeleton className="h-72" /> : <BrandingForm key={JSON.stringify(data)} data={data} />}
    </>
  );
}

function BrandingForm({ data }: { data: Branding }) {
  const save = useSaveBranding();
  const { data: me } = useMe();
  const canEdit = hasRole(me?.user?.org_role, 'admin');
  const [company, setCompany] = React.useState(data.company_name);
  const [color, setColor] = React.useState(data.primary_color);
  const [preparedBy, setPreparedBy] = React.useState(data.prepared_by);
  const locked = !data.white_label;
  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return toast.error('Use a PNG or JPEG image.');
    if (file.size > MAX_LOGO) return toast.error('The logo must be 512 KB or smaller.');
    save.mutate({ logo_data_url: await readFile(file), remove_logo: false });
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cover and colours {locked && <Badge><Lock aria-hidden />Pro</Badge>}
          </CardTitle>
          <CardDescription>
            {locked
              ? 'White-label branding (logo, colour, "Prepared by") is part of the Pro plan. Trial reports carry a watermark.'
              : 'Applies to new reports. The KloudRecon mark is removed from the cover when you set "Prepared by".'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({
                company_name: company,
                remove_logo: false,
                ...(locked ? {} : { primary_color: color, prepared_by: preparedBy }),
              });
            }}
          >
            <label className="block text-sm font-medium">
              Company name on the cover
              <Input className="mt-1" value={company} maxLength={120} disabled={!canEdit} onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Prepared by
              <Input className="mt-1" value={preparedBy} maxLength={120} disabled={!canEdit || locked} onChange={(e) => setPreparedBy(e.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Accent colour
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Accent colour"
                  value={color}
                  disabled={!canEdit || locked}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-surface"
                />
                <Input className="w-32 font-mono" value={color} disabled={!canEdit || locked} onChange={(e) => setColor(e.target.value)} />
              </span>
            </label>
            {canEdit && (
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>PNG or JPEG, up to 512 KB. Shown on the report cover.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-2">
            {data.logo_data_url ? (
              <img src={data.logo_data_url} alt="Current logo" className="max-h-20 max-w-full object-contain" />
            ) : (
              <span className="text-xs text-subtle">No logo</span>
            )}
          </div>
          {canEdit && !locked && (
            <div className="flex gap-2">
              <Button asChild variant="secondary" size="sm">
                <label className="cursor-pointer">
                  <ImageUp />
                  Upload
                  <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => void onLogo(e.target.files?.[0])} />
                </label>
              </Button>
              {data.has_logo && (
                <Button variant="ghost" size="sm" onClick={() => save.mutate({ remove_logo: true })}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
