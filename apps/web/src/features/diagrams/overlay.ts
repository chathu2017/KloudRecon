import type { DiagramOverlays } from './api';
import { nodeIndex, type Scene } from './scene';

export type OverlayKey = 'security' | 'cost' | 'findings' | 'changes';

export interface NodeOverlay {
  cost?: number;
  costLevel?: number; // 0..5 on the sequential ramp
  findings?: { total: number; top: 'critical' | 'high' | 'medium' | 'low' | 'info'; counts: Record<string, number> };
  exposure?: { severity: string; ports: string[] };
  change?: 'added' | 'modified';
  onPath?: number; // step number on the selected attack path
  dimmed?: boolean;
  match?: boolean;
}

export interface PathLink {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface OverlayResult {
  nodes: Map<string, NodeOverlay>;
  pathLinks: PathLink[];
  pathNodes: Set<string>;
  costMax: number;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

export function computeOverlays(
  scene: Scene,
  overlays: DiagramOverlays | undefined,
  enabled: ReadonlySet<OverlayKey>,
  pathId: string | null,
  search: string,
): OverlayResult {
  const out = new Map<string, NodeOverlay>();
  const get = (id: string) => {
    let o = out.get(id);
    if (!o) {
      o = {};
      out.set(id, o);
    }
    return o;
  };
  const pathNodes = new Set<string>();
  const pathLinks: PathLink[] = [];
  let costMax = 0;
  if (overlays) {
    const costs: number[] = [];
    for (const n of scene.nodes) {
      const arms = n.armIds.map((a) => a.toLowerCase());
      if (enabled.has('cost')) {
        const total = arms.reduce((s, a) => s + (overlays.cost[a] ?? 0), 0);
        if (total > 0) {
          get(n.id).cost = total;
          costs.push(total);
        }
      }
      if (enabled.has('findings')) {
        const counts: Record<string, number> = {};
        for (const a of arms) for (const [sev, c] of Object.entries(overlays.findings[a] ?? {})) counts[sev] = (counts[sev] ?? 0) + c;
        const total = Object.values(counts).reduce((s, c) => s + c, 0);
        if (total > 0) {
          const top = SEVERITIES.find((s) => (counts[s] ?? 0) > 0) ?? 'info';
          get(n.id).findings = { total, top, counts };
        }
      }
      if (enabled.has('security')) {
        const exp = arms.map((a) => overlays.exposure[a]).find(Boolean);
        if (exp) {
          const ports = exp.ports
            .map((p) => {
              const port = p as { port?: number; service?: string };
              return port.service ? `${port.service} ${port.port ?? ''}`.trim() : String(port.port ?? '');
            })
            .filter(Boolean);
          get(n.id).exposure = { severity: exp.severity, ports: [...new Set(ports)].slice(0, 3) };
        }
      }
      if (enabled.has('changes')) {
        if (arms.some((a) => overlays.changes.added.includes(a))) get(n.id).change = 'added';
        else if (arms.some((a) => overlays.changes.modified.includes(a))) get(n.id).change = 'modified';
      }
    }
    // cost heat: quantiles so a few big resources do not wash out the rest
    if (costs.length) {
      const sorted = [...costs].sort((a, b) => a - b);
      costMax = sorted[sorted.length - 1] ?? 0;
      const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
      const cuts = [q(0.2), q(0.4), q(0.6), q(0.8), q(0.95)];
      for (const o of out.values()) {
        if (o.cost !== undefined) o.costLevel = cuts.filter((c) => (o.cost ?? 0) >= c).length;
      }
    }
    if (pathId) {
      const path = overlays.attack_paths.find((p) => p.id === pathId);
      const index = nodeIndex(scene);
      if (path) {
        let prev: string | null = null;
        let hops: string[] = [];
        let step = 0;
        for (const s of path.steps) {
          const id = s.kind === 'internet' ? 'external:internet' : index.get(s.id.toLowerCase());
          if (!id || !scene.nodes.some((n) => n.id === id)) {
            if (s.label) hops.push(s.label);
            continue;
          }
          step += 1;
          pathNodes.add(id);
          get(id).onPath = step;
          if (prev && prev !== id) {
            pathLinks.push({ id: `path:${prev}>${id}`, source: prev, target: id, label: hops.length ? `via ${hops.join(' → ')}` : '' });
          }
          prev = id;
          hops = [];
        }
        for (const n of scene.nodes) if (!pathNodes.has(n.id)) get(n.id).dimmed = true;
      }
    }
  }
  const q = search.trim().toLowerCase();
  if (q) {
    for (const n of scene.nodes) {
      if (n.label.toLowerCase().includes(q) || n.members?.some((m) => m.label.toLowerCase().includes(q))) get(n.id).match = true;
    }
  }
  return { nodes: out, pathLinks, pathNodes, costMax };
}
