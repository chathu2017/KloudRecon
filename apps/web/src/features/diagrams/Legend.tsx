import { AlertOctagon, ShieldAlert } from 'lucide-react';
import type { OverlayKey } from './overlay';
import type { Scene } from './scene';
import { compactCost, DEFAULT_GROUP, GROUP_STYLES, styleFor, type EdgeStyle } from './styles';

const GROUP_LABEL: Record<string, string> = {
  region: 'Region',
  subscription: 'Subscription',
  mg: 'Management group',
  vnet: 'Virtual network',
  subnet: 'Subnet',
  rg: 'Resource group',
  machine: 'Virtual machine with its parts',
  app: 'Application',
  tier: 'Tier',
  category: 'Category',
  aggregate: 'Expanded group',
};

function Line({ style }: { style: EdgeStyle }) {
  return (
    <svg width="34" height="10" aria-hidden className="shrink-0">
      <line x1="2" y1="5" x2="26" y2="5" stroke={style.color} strokeWidth={style.width} strokeDasharray={style.dash} />
      {style.arrows !== 'none' && <path d="M 32 5 L 25 1.5 L 25 8.5 Z" fill={style.color} />}
      {style.arrows === 'both' && <path d="M 1 5 L 8 1.5 L 8 8.5 Z" fill={style.color} />}
    </svg>
  );
}

/** Only what the current view uses: containers, link kinds and active overlays. */
export function Legend({ scene, enabled, pathActive, costMax }: { scene: Scene; enabled: ReadonlySet<OverlayKey>; pathActive: boolean; costMax: number }) {
  const groups = [...new Set(scene.groups.map((g) => g.kind))];
  const kinds = [...new Set(scene.edges.map((e) => e.kind))];
  return (
    <div className="max-h-[42vh] w-60 overflow-auto rounded-xl border border-border bg-surface/95 p-3 text-xs shadow-md">
      {groups.length > 0 && (
        <>
          <div className="mb-1.5 font-semibold text-text">Containers</div>
          <ul className="mb-3 space-y-1">
            {groups.map((k) => {
              const s = GROUP_STYLES[k] ?? DEFAULT_GROUP;
              return (
                <li key={k} className="flex items-center gap-2 text-muted">
                  <span
                    className="inline-block h-3 w-6 shrink-0 rounded-sm"
                    style={{ border: `${Math.max(1, s.width)}px ${s.dashed ? 'dashed' : 'solid'} ${s.border}`, background: s.bg }}
                  />
                  {GROUP_LABEL[k] ?? k}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {kinds.length > 0 && (
        <>
          <div className="mb-1.5 font-semibold text-text">Links</div>
          <ul className="mb-3 space-y-1">
            {kinds.map((k) => {
              const s = styleFor(k);
              const shown = k === 'exposure' && enabled.has('security') ? { ...s, color: 'var(--dg-exposure)' } : s;
              return (
                <li key={k} className="flex items-center gap-2 text-muted">
                  <Line style={shown} />
                  {s.label}
                </li>
              );
            })}
            {pathActive && (
              <li className="flex items-center gap-2 text-muted">
                <Line style={styleFor('path')} />
                Attack path step
              </li>
            )}
          </ul>
        </>
      )}
      {(enabled.size > 0 || pathActive) && <div className="mb-1.5 font-semibold text-text">Overlays</div>}
      <ul className="space-y-1.5 text-muted">
        {enabled.has('security') && (
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5 rounded-full bg-critical px-1.5 text-[10px] font-semibold text-on-critical">
              <ShieldAlert className="size-2.5" aria-hidden /> RDP 3389
            </span>
            Reachable from the internet
          </li>
        )}
        {enabled.has('findings') && (
          <li className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5 rounded-full bg-critical px-1.5 text-[10px] font-semibold text-on-critical">
              <AlertOctagon className="size-2.5" aria-hidden /> 3
            </span>
            Open findings (highest severity)
          </li>
        )}
        {enabled.has('cost') && (
          <li>
            <div className="mb-1">Cost, last 30 days</div>
            <div className="flex h-2 overflow-hidden rounded-full">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <span key={n} className="flex-1" style={{ background: `var(--seq-${n})` }} />
              ))}
            </div>
            <div className="mt-0.5 flex justify-between tabular">
              <span>low</span>
              <span>{costMax ? compactCost(costMax, 'USD') : 'high'}</span>
            </div>
          </li>
        )}
        {enabled.has('changes') && (
          <li className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-success-soft px-1.5 text-[10px] font-semibold text-success-strong ring-1 ring-inset ring-success">New</span>
            <span className="rounded-full bg-medium-soft px-1.5 text-[10px] font-semibold text-medium-strong ring-1 ring-inset ring-medium">Changed</span>
            <span className="rounded border border-dashed border-border-strong px-1.5 text-[10px]">Removed</span>
            since the previous scan
          </li>
        )}
      </ul>
    </div>
  );
}
