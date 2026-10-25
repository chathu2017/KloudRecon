import * as React from 'react';
import { Download, FileCode2, FileImage, FileText, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Annotation } from './api';
import { downloadBlob, fileStem, toDrawio, toPdf, toPng, toSvg, type ExportInput } from './export';
import type { Layout } from './layout';
import type { OverlayResult } from './overlay';
import type { Scene } from './scene';

export function ExportMenu({
  graphTitle,
  scene,
  layout,
  overlay,
  showCost,
  security,
  notes,
  subtitle,
}: {
  graphTitle: string;
  scene: Scene;
  layout: Layout;
  overlay: OverlayResult | null;
  showCost: boolean;
  security: boolean;
  notes: Annotation[];
  subtitle: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const input: ExportInput = {
    title: graphTitle,
    subtitle,
    scene,
    layout,
    overlay,
    showCost,
    security,
    notes: notes.map((n) => ({ text: n.text, color: n.color, position: n.position })),
  };
  const run = async (kind: 'png' | 'svg' | 'pdf' | 'drawio') => {
    setBusy(true);
    try {
      const stem = fileStem(graphTitle);
      if (kind === 'svg') {
        const { svg } = await toSvg(input);
        downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${stem}.svg`);
      } else if (kind === 'png') {
        downloadBlob(await toPng(input, 2), `${stem}.png`);
      } else if (kind === 'pdf') {
        downloadBlob(await toPdf(input), `${stem}.pdf`);
      } else {
        const xml = await toDrawio(input);
        downloadBlob(new Blob([xml], { type: 'application/xml' }), `${stem}.drawio`);
      }
      toast.success('Diagram exported');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" loading={busy}>
          <Download aria-hidden /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Export this view</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void run('png')}>
          <FileImage aria-hidden /> PNG image (2x)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('svg')}>
          <FileCode2 aria-hidden /> SVG vector
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run('pdf')}>
          <FileText aria-hidden /> PDF document
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run('drawio')}>
          <Workflow aria-hidden /> draw.io (.drawio)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
