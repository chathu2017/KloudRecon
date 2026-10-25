import * as React from 'react';
import { BaseEdge, EdgeLabelRenderer, Handle, Position, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { AlertOctagon, AlertTriangle, ChevronDown, Globe2, Info, Minus, ShieldAlert, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { groupIconUrl, iconUrl } from './icons';
import type { Point } from './layout';
import type { NodeOverlay } from './overlay';
import type { SceneGroup, SceneNode } from './scene';
import { arrowHead, chipText, compactCost, DEFAULT_GROUP, edgeStyle, GROUP_STYLES, midpoint, roundedPath } from './styles';

export interface ResourceData extends Record<string, unknown> {
  node: SceneNode;
  overlay: NodeOverlay | undefined;
  showCost: boolean;
  currency: string;
}

export interface GroupData extends Record<string, unknown> {
  group: SceneGroup;
  onToggle: (id: string) => void;
  dimmed: boolean;
}

export interface NoteData extends Record<string, unknown> {
  text: string;
  color: string;
  editable: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
}

export interface RouteData extends Record<string, unknown> {
  points: Point[];
  kind: string;
  label: string;
  dimmed: boolean;
  emphasized: boolean;
  security: boolean;
  hovered: boolean;
  /** draw the link's own label all the time (detailed view) */
  showLabel?: boolean;
}

export type ResourceFlowNode = Node<ResourceData, 'resource'>;
export type GroupFlowNode = Node<GroupData, 'container'>;
export type NoteFlowNode = Node<NoteData, 'note'>;
export type RouteFlowEdge = Edge<RouteData, 'route'>;

const hidden = '!pointer-events-none !h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0';

/** Edges are drawn from ELK routes; React Flow still needs a handle on each end. */
function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} id="t" className={hidden} isConnectable={false} />
      <Handle type="source" position={Position.Right} id="s" className={hidden} isConnectable={false} />
    </>
  );
}

const SEV_ICON = { critical: AlertOctagon, high: AlertTriangle, medium: AlertTriangle, low: Info, info: Info } as const;
const SEV_CLASS: Record<string, string> = {
  critical: 'bg-critical text-on-critical',
  high: 'bg-high-soft text-high-strong ring-1 ring-inset ring-high',
  medium: 'bg-medium-soft text-medium-strong ring-1 ring-inset ring-medium',
  low: 'bg-low-soft text-low-strong ring-1 ring-inset ring-low',
  info: 'bg-info-soft text-info-strong ring-1 ring-inset ring-info',
};

export function ResourceNode({ data }: NodeProps<ResourceFlowNode>) {
  const { node, overlay: o, showCost, currency } = data;
  const external = node.kind === 'external';
  const ghost = node.kind === 'ghost';
  const collapsed = node.kind === 'collapsed';
  const internet = external && node.type === 'external/internet';
  const icon = collapsed ? groupIconUrl(node.groupKind ?? '') : internet ? null : iconUrl(node.type, node.resourceKind);
  const ring = o?.onPath
    ? 'var(--dg-exposure)'
    : o?.exposure
      ? 'var(--dg-exposure)'
      : o?.change === 'added'
        ? 'var(--success)'
        : o?.change === 'modified'
          ? 'var(--medium)'
          : o?.match
            ? 'var(--brand)'
            : undefined;
  const heat = showCost && o?.costLevel !== undefined ? `var(--seq-${Math.min(6, o.costLevel + 1)})` : undefined;
  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col items-center px-2 pt-2.5 text-center shadow-sm transition-[opacity,box-shadow] duration-200',
        internet ? 'rounded-[48px]' : 'rounded-[10px]',
        o?.dimmed && 'opacity-[var(--dg-dim)]',
        ghost && 'opacity-55',
        o?.onPath && 'shadow-[0_0_0_4px_color-mix(in_srgb,var(--critical)_18%,transparent)]',
      )}
      style={{
        background: external ? 'var(--surface-2)' : 'var(--dg-node)',
        border: `${ring ? 2 : 1}px ${ghost || collapsed ? 'dashed' : 'solid'} ${ring ?? 'var(--dg-node-border)'}`,
      }}
      data-testid={`dg-node-${node.kind}`}
    >
      <Handles />
      {icon ? (
        <img src={icon} alt="" width={40} height={40} draggable={false} className={cn('size-10 shrink-0 select-none', ghost && 'grayscale')} />
      ) : (
        <span className="flex shrink-0 items-center text-muted [&_svg]:size-5 [&_svg]:stroke-[1.5]">
          <Globe2 className="size-6" aria-hidden />
        </span>
      )}
      <div className="mt-1 line-clamp-2 w-full break-words text-[12.5px] font-medium leading-[15px] text-text" title={node.label}>
        {node.label}
      </div>
      <div className="w-full truncate text-[11px] leading-4 text-muted" title={node.sublabel}>
        {ghost ? 'Removed since the previous scan' : node.sublabel}
      </div>
      {(node.kind === 'aggregate' || collapsed) && (
        <span className="absolute -right-2 -top-2 rounded-full border border-border bg-surface px-1.5 text-[11px] font-semibold tabular text-text shadow-sm">
          ×{node.count}
        </span>
      )}
      {o?.findings && !o.onPath && (
        <span
          className={cn(
            'absolute -left-2 -top-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10.5px] font-semibold tabular shadow-sm',
            SEV_CLASS[o.findings.top],
          )}
          title={`${o.findings.total} open finding(s), highest ${o.findings.top}`}
        >
          {React.createElement(SEV_ICON[o.findings.top], { className: 'size-3', 'aria-hidden': true })}
          {o.findings.total}
          <span className="sr-only">{o.findings.top} findings</span>
        </span>
      )}
      {o?.onPath && (
        <span className="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full bg-critical text-[11px] font-semibold text-on-critical">
          {o.onPath}
        </span>
      )}
      {o?.exposure && (
        <div className="absolute -bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1">
          {o.exposure.ports.map((p) => (
            <span key={p} className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-critical px-1.5 text-[10px] font-semibold text-on-critical">
              <ShieldAlert className="size-2.5" aria-hidden />
              {p}
            </span>
          ))}
        </div>
      )}
      {o?.change && (
        <span
          className={cn(
            'absolute -right-2 bottom-5 rounded-full px-1.5 text-[10px] font-semibold shadow-sm',
            o.change === 'added' ? 'bg-success-soft text-success-strong ring-1 ring-inset ring-success' : 'bg-medium-soft text-medium-strong ring-1 ring-inset ring-medium',
          )}
        >
          {o.change === 'added' ? 'New' : 'Changed'}
        </span>
      )}
      {heat && <div className="absolute inset-x-0 bottom-0 h-[5px] overflow-hidden rounded-b-[9px]" style={{ background: heat }} aria-hidden />}
      {showCost && o?.cost !== undefined && (
        <span className="absolute -top-2.5 right-3 rounded-full border border-border bg-surface px-1.5 text-[10px] font-medium tabular text-muted shadow-sm">
          {compactCost(o.cost, currency)}/mo
        </span>
      )}
      {node.badges.some((b) => b.startsWith('Public IP')) && !o?.exposure && (
        <span className="absolute left-1.5 top-1.5 text-subtle" title={node.badges.find((b) => b.startsWith('Public IP'))}>
          <Globe2 className="size-3.5" aria-label="Public IP" />
        </span>
      )}
    </div>
  );
}

export function GroupNode({ data }: NodeProps<GroupFlowNode>) {
  const { group: g, onToggle, dimmed } = data;
  const s = GROUP_STYLES[g.kind] ?? DEFAULT_GROUP;
  const icon = groupIconUrl(g.kind);
  const role = g.badges.find((b) => b === 'Hub' || b === 'Spoke');
  const cidr = /\d+\.\d+\.\d+\.\d+/.test(g.sublabel);
  return (
    <div
      className={cn('h-full w-full rounded-[12px] transition-opacity', dimmed && 'opacity-50')}
      style={{ border: `${s.width}px ${s.dashed ? 'dashed' : 'solid'} ${s.border}`, background: s.bg }}
      data-testid={`dg-group-${g.kind}`}
    >
      <Handles />
      <div className="flex h-[44px] items-center gap-2 px-3">
        {g.kind !== 'aggregate' && icon && <img src={icon} alt="" width={18} height={18} draggable={false} className="size-[18px] shrink-0" />}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold" style={{ color: s.text }} title={g.label}>
              {g.label}
            </span>
            {role && (
              <span className="shrink-0 rounded px-1 text-[10px] font-semibold" style={{ color: s.text, border: `1px solid ${s.border}` }}>
                {role}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn('min-w-0 truncate text-[11px] text-muted', cidr && 'font-mono text-[10.5px]')} title={g.sublabel}>
              {g.sublabel}
            </span>
            {g.badges
              .filter((b) => b !== role)
              .slice(0, 2)
              .map((b) => (
                <span key={b} className="shrink-0 rounded bg-surface-2 px-1 py-px text-[9.5px] font-medium text-muted" title={b}>
                  {chipText(b)}
                </span>
              ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="nodrag nopan rounded p-0.5 text-subtle hover:bg-surface-2 hover:text-text"
            aria-label={`Collapse ${g.label}`}
            title={g.kind === 'aggregate' ? 'Back to one node' : 'Collapse'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(g.id);
            }}
          >
            {g.kind === 'aggregate' ? <Minus className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

const NOTE_BG: Record<string, string> = {
  yellow: 'var(--medium-soft)',
  blue: 'var(--brand-soft)',
  green: 'var(--success-soft)',
  pink: 'var(--high-soft)',
};

export function NoteNode({ data, selected }: NodeProps<NoteFlowNode>) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const text = draft ?? data.text;
  const setText = setDraft;
  return (
    <div
      className={cn('flex h-full w-full flex-col rounded-md border border-border p-2', selected && 'ring-2 ring-brand')}
      style={{ background: NOTE_BG[data.color] ?? NOTE_BG.yellow, borderLeft: '3px solid var(--border-strong)' }}
    >
      <textarea
        className="nodrag nowheel h-full w-full resize-none bg-transparent text-[12.5px] leading-snug text-text outline-none"
        value={text}
        readOnly={!data.editable}
        aria-label="Note"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text.trim() && text !== data.text) data.onSave(text.trim());
          setDraft(null);
        }}
      />
      {data.editable && (
        <button type="button" className="nodrag self-end rounded p-0.5 text-muted hover:text-critical-strong" aria-label="Delete note" onClick={data.onDelete}>
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function RouteEdge({ id, data }: EdgeProps<RouteFlowEdge>) {
  if (!data || data.points.length < 2) return null;
  const pts = data.points;
  const s = edgeStyle(data.kind, data.security);
  const d = roundedPath(pts);
  const last = pts[pts.length - 1] as Point;
  const beforeLast = pts[pts.length - 2] as Point;
  const first = pts[0] as Point;
  const second = pts[1] as Point;
  const opacity = data.dimmed ? 0.15 : 1;
  const width = data.emphasized || data.hovered ? s.width + 1 : s.width;
  const mid = midpoint(pts);
  const text = data.label || s.label;
  const plate = data.showLabel && data.label && !data.hovered && data.kind !== 'path' ? (data.label.length > 26 ? `${data.label.slice(0, 25)}…` : data.label) : '';
  const plateW = plate.length * 5.6 + 10;
  return (
    <>
      <BaseEdge
        id={id}
        path={d}
        interactionWidth={16}
        style={{ stroke: s.color, strokeWidth: width, strokeDasharray: s.dash, opacity, fill: 'none', transition: 'opacity 150ms' }}
        className={data.kind === 'path' ? 'dg-path-edge' : undefined}
      />
      {s.arrows !== 'none' && <path d={arrowHead(beforeLast, last)} fill={s.color} opacity={opacity} />}
      {s.arrows === 'both' && <path d={arrowHead(second, first)} fill={s.color} opacity={opacity} />}
      {plate && (
        // drawn in the edge's own SVG so the plate sits on top of the line
        <g opacity={data.dimmed ? 0.2 : 1} pointerEvents="none">
          <rect x={mid.x - plateW / 2} y={mid.y - 8} width={plateW} height={16} rx={4} fill="var(--surface)" stroke="var(--border)" />
          <text x={mid.x} y={mid.y + 3.5} fontSize={10} fontWeight={500} textAnchor="middle" fill="var(--text-muted)">
            {plate}
          </text>
        </g>
      )}
      {(data.hovered || (data.kind === 'path' && data.label)) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute z-10 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-text shadow-md"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
