import type { Point } from './layout';

/** Container and edge styles (all colors are diagram tokens from tokens.css) and edge geometry. */
export interface GroupStyle {
  border: string;
  bg: string;
  text: string;
  dashed: boolean;
  width: number;
}

export const GROUP_STYLES: Record<string, GroupStyle> = {
  region: { border: 'var(--dg-region-border)', bg: 'var(--dg-region-bg)', text: 'var(--text-muted)', dashed: true, width: 1.5 },
  subscription: { border: 'var(--dg-sub-border)', bg: 'var(--dg-sub-bg)', text: 'var(--dg-sub-text)', dashed: true, width: 1.5 },
  mg: { border: 'var(--dg-mg-border)', bg: 'transparent', text: 'var(--text)', dashed: false, width: 1.5 },
  vnet: { border: 'var(--dg-vnet-border)', bg: 'var(--dg-vnet-bg)', text: 'var(--dg-vnet-text)', dashed: false, width: 2 },
  subnet: { border: 'var(--dg-subnet-border)', bg: 'var(--dg-subnet-bg)', text: 'var(--text)', dashed: true, width: 1.25 },
  rg: { border: 'var(--dg-rg-border)', bg: 'var(--dg-rg-bg)', text: 'var(--text)', dashed: false, width: 1 },
  app: { border: 'var(--dg-app-border)', bg: 'var(--dg-app-bg)', text: 'var(--text)', dashed: false, width: 1.5 },
  machine: { border: 'var(--dg-machine-border)', bg: 'var(--dg-machine-bg)', text: 'var(--text)', dashed: false, width: 1.25 },
  tier: { border: 'var(--dg-tier-border)', bg: 'var(--dg-tier-bg)', text: 'var(--text)', dashed: false, width: 1 },
  category: { border: 'var(--dg-rg-border)', bg: 'var(--dg-rg-bg)', text: 'var(--text-muted)', dashed: false, width: 1 },
  aggregate: { border: 'var(--dg-node-border)', bg: 'transparent', text: 'var(--text-muted)', dashed: true, width: 1.25 },
};
export const DEFAULT_GROUP = GROUP_STYLES.rg as GroupStyle;

export interface EdgeStyle {
  color: string;
  width: number;
  dash?: string;
  arrows: 'end' | 'both' | 'none';
  label: string;
}

export const EDGE_STYLES: Record<string, EdgeStyle> = {
  peering: { color: 'var(--dg-peering)', width: 2.25, arrows: 'both', label: 'VNet peering' },
  connection: { color: 'var(--dg-connection)', width: 2.5, dash: '8 4', arrows: 'both', label: 'VPN / ExpressRoute' },
  'private-endpoint': { color: 'var(--dg-private)', width: 1.75, dash: '6 4', arrows: 'end', label: 'Private endpoint' },
  'vnet-integration': { color: 'var(--dg-private)', width: 1.75, dash: '2 3', arrows: 'end', label: 'VNet integration' },
  exposure: { color: 'var(--dg-edge-strong)', width: 1.75, arrows: 'end', label: 'Internet traffic' },
  route: { color: 'var(--dg-route)', width: 1.5, dash: '5 4', arrows: 'end', label: 'User-defined route' },
  dns: { color: 'var(--dg-edge)', width: 1.25, dash: '1 4', arrows: 'none', label: 'Private DNS link' },
  'rbac-grants': { color: 'var(--dg-rbac)', width: 1.5, dash: '4 3', arrows: 'end', label: 'RBAC grant' },
  'identity-uses': { color: 'var(--dg-rbac)', width: 1.25, dash: '1 3', arrows: 'end', label: 'Uses identity' },
  'lb-backend': { color: 'var(--dg-edge-strong)', width: 1.5, arrows: 'end', label: 'Load-balanced backend' },
  attached: { color: 'var(--dg-edge-strong)', width: 1.5, arrows: 'none', label: 'Attached to' },
  'nsg-attached': { color: 'var(--dg-nsg)', width: 1.5, dash: '3 3', arrows: 'end', label: 'Network security group' },
  dependency: { color: 'var(--dg-edge)', width: 1.25, arrows: 'end', label: 'Dependency' },
  contains: { color: 'var(--dg-edge)', width: 1.25, arrows: 'end', label: 'Contains' },
  path: { color: 'var(--dg-exposure)', width: 2.75, dash: '9 6', arrows: 'end', label: 'Attack path' },
};

const DEFAULT_EDGE: EdgeStyle = { color: 'var(--dg-edge)', width: 1.25, arrows: 'end', label: 'Dependency' };

export function styleFor(kind: string): EdgeStyle {
  return EDGE_STYLES[kind] ?? DEFAULT_EDGE;
}

export function edgeStyle(kind: string, security: boolean): EdgeStyle {
  const base = styleFor(kind);
  if (kind === 'exposure' && security) return { ...base, color: 'var(--dg-exposure)', width: 2.25 };
  return base;
}

/** Container badges shown as short chips ("NSG", "UDR → FW"); the full text is the tooltip. */
export function chipText(badge: string): string {
  if (badge.startsWith('NSG')) return 'NSG';
  if (badge.startsWith('UDR')) return badge.includes('→') ? 'UDR → FW' : 'UDR';
  return badge.length > 18 ? `${badge.slice(0, 17)}…` : badge;
}

export function compactCost(v: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** Orthogonal polyline with rounded corners. */
export function roundedPath(points: Point[], radius = 8): string {
  if (points.length < 2) return '';
  const first = points[0] as Point;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const cur = points[i] as Point;
    const next = points[i + 1];
    const prev = points[i - 1] as Point;
    if (!next) {
      d += ` L ${cur.x} ${cur.y}`;
      break;
    }
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = { x: cur.x - ((cur.x - prev.x) / inLen) * r, y: cur.y - ((cur.y - prev.y) / inLen) * r };
    const b = { x: cur.x + ((next.x - cur.x) / outLen) * r, y: cur.y + ((next.y - cur.y) / outLen) * r };
    d += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  return d;
}

export function arrowHead(from: Point, to: Point, size = 7): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const l = { x: to.x - size * Math.cos(angle - Math.PI / 7), y: to.y - size * Math.sin(angle - Math.PI / 7) };
  const r = { x: to.x - size * Math.cos(angle + Math.PI / 7), y: to.y - size * Math.sin(angle + Math.PI / 7) };
  return `M ${to.x} ${to.y} L ${l.x} ${l.y} L ${r.x} ${r.y} Z`;
}

/** The middle of the longest segment: where a label reads best. */
export function midpoint(points: Point[]): Point {
  let best = { len: -1, x: 0, y: 0 };
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best.len) best = { len, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return { x: best.x, y: best.y };
}

/** An orthogonal route between two boxes (used for attack-path links that have no ELK route). */
export function elbow(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): Point[] {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (Math.abs(bc.x - ac.x) >= Math.abs(bc.y - ac.y)) {
    const sx = bc.x > ac.x ? a.x + a.width : a.x;
    const tx = bc.x > ac.x ? b.x : b.x + b.width;
    const mx = (sx + tx) / 2;
    return [
      { x: sx, y: ac.y },
      { x: mx, y: ac.y },
      { x: mx, y: bc.y },
      { x: tx, y: bc.y },
    ];
  }
  const sy = bc.y > ac.y ? a.y + a.height : a.y;
  const ty = bc.y > ac.y ? b.y : b.y + b.height;
  const my = (sy + ty) / 2;
  return [
    { x: ac.x, y: sy },
    { x: ac.x, y: my },
    { x: bc.x, y: my },
    { x: bc.x, y: ty },
  ];
}
