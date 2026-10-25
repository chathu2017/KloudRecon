import type { DiagramGraph, DiagramOverlays } from './api';

/**
 * The scene is what gets laid out and drawn: the API graph after the user's choices —
 * collapsed containers, expanded aggregates, focus on one node, and ghosts of removed resources.
 */
export interface SceneGroup {
  id: string;
  kind: string;
  label: string;
  sublabel: string;
  badges: string[];
  parent: string | null;
  armId: string | null;
  childCount: number;
}

export type SceneNodeKind = 'resource' | 'aggregate' | 'external' | 'ghost' | 'collapsed' | 'member';

export interface SceneNode {
  id: string;
  type: string;
  label: string;
  sublabel: string;
  kind: SceneNodeKind;
  parent: string | null;
  armIds: string[];
  badges: string[];
  count: number;
  groupKind?: string;
  members?: { id: string; label: string; sublabel: string }[];
  resourceKind?: string;
}

export interface SceneEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
}

export interface Scene {
  /** link labels are always drawn (the detailed "KloudRecon Draw" view) instead of on hover */
  labels?: boolean;
  direction: string;
  groups: SceneGroup[];
  nodes: SceneNode[];
  edges: SceneEdge[];
}

export interface SceneOptions {
  collapsed: ReadonlySet<string>;
  expanded: ReadonlySet<string>;
  focus: string | null;
  ghosts: boolean;
}

export const AUTO_COLLAPSE_NODES = 400;

/** Containers to collapse on first load of a very large view (plan: > 400 nodes). */
export function autoCollapse(graph: DiagramGraph): Set<string> {
  if (graph.nodes.length <= AUTO_COLLAPSE_NODES) return new Set();
  return new Set(graph.groups.filter((g) => g.kind === 'rg' || g.kind === 'vnet').map((g) => g.id));
}

export function buildScene(graph: DiagramGraph, overlays: DiagramOverlays | undefined, opts: SceneOptions): Scene {
  const parentOf = new Map<string, string | null>();
  for (const g of graph.groups) parentOf.set(g.id, g.parent ?? null);
  for (const n of graph.nodes) parentOf.set(n.id, n.parent ?? null);

  // the outermost collapsed ancestor that hides an element (or null when visible)
  const hiddenBy = (id: string): string | null => {
    let cur = parentOf.get(id) ?? null;
    let found: string | null = null;
    while (cur) {
      if (opts.collapsed.has(cur)) found = cur;
      cur = parentOf.get(cur) ?? null;
    }
    return found;
  };

  const groups: SceneGroup[] = [];
  const nodes: SceneNode[] = [];
  const childCount = new Map<string, number>();
  for (const n of graph.nodes) {
    let p = n.parent ?? null;
    while (p) {
      childCount.set(p, (childCount.get(p) ?? 0) + Math.max(1, n.members.length));
      p = parentOf.get(p) ?? null;
    }
  }

  for (const g of graph.groups) {
    if (hiddenBy(g.id)) continue;
    if (opts.collapsed.has(g.id)) {
      nodes.push({
        id: g.id,
        type: g.kind,
        label: g.label,
        sublabel: `${childCount.get(g.id) ?? 0} resources`,
        kind: 'collapsed',
        parent: g.parent ?? null,
        armIds: [],
        badges: g.badges,
        count: childCount.get(g.id) ?? 0,
        groupKind: g.kind,
      });
      continue;
    }
    groups.push({
      id: g.id,
      kind: g.kind,
      label: g.label,
      sublabel: g.sublabel,
      badges: g.badges,
      parent: g.parent ?? null,
      armId: g.arm_id ?? null,
      childCount: childCount.get(g.id) ?? 0,
    });
  }

  for (const n of graph.nodes) {
    if (hiddenBy(n.id)) continue;
    const resourceKind = typeof n.attrs.kind === 'string' ? n.attrs.kind : undefined;
    if (n.kind === 'aggregate' && opts.expanded.has(n.id)) {
      groups.push({
        id: n.id,
        kind: 'aggregate',
        label: n.label,
        sublabel: `${n.members.length} resources`,
        badges: [],
        parent: n.parent ?? null,
        armId: null,
        childCount: n.members.length,
      });
      for (const m of n.members) {
        nodes.push({
          id: m.id,
          type: n.type,
          label: m.label,
          sublabel: m.sublabel,
          kind: 'member',
          parent: n.id,
          armIds: [m.id],
          badges: [],
          count: 1,
        });
      }
      continue;
    }
    nodes.push({
      id: n.id,
      type: n.type,
      label: n.label,
      sublabel: n.sublabel,
      kind: n.kind === 'aggregate' ? 'aggregate' : n.kind === 'external' ? 'external' : 'resource',
      parent: n.parent ?? null,
      armIds: n.members.length ? n.members.map((m) => m.id) : n.arm_id ? [n.arm_id] : [],
      badges: n.badges,
      count: n.members.length || 1,
      members: n.members.length ? n.members : undefined,
      resourceKind,
    });
  }

  const visible = new Set([...groups.map((g) => g.id), ...nodes.map((n) => n.id)]);
  if (opts.ghosts && overlays) {
    for (const ghost of overlays.changes.removed) {
      const parent = ghost.parent && visible.has(ghost.parent) ? ghost.parent : null;
      nodes.push({
        id: ghost.id,
        type: ghost.type,
        label: ghost.label,
        sublabel: 'removed',
        kind: 'ghost',
        parent,
        armIds: ghost.arm_ids,
        badges: [],
        count: ghost.arm_ids.length,
      });
      visible.add(ghost.id);
    }
  }

  // re-point edges at the visible stand-in (collapsed container) and drop duplicates
  const standIn = (id: string): string | null => {
    if (visible.has(id)) return hiddenBy(id) ?? id;
    const by = hiddenBy(id);
    return by && visible.has(by) ? by : null;
  };
  const seen = new Set<string>();
  const edges: SceneEdge[] = [];
  for (const e of graph.edges) {
    const s = standIn(e.source);
    const t = standIn(e.target);
    if (!s || !t || s === t) continue;
    const key = `${e.kind}|${s}|${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ id: key, source: s, target: t, kind: e.kind, label: e.label });
  }

  let scene: Scene = { labels: graph.view === 'draw', direction: graph.direction, groups, nodes, edges };
  if (opts.focus) scene = focusScene(scene, opts.focus);
  return scene;
}

/** Keep one node, its direct neighbours and the containers around them. */
export function focusScene(scene: Scene, focus: string): Scene {
  const keep = new Set<string>([focus]);
  for (const e of scene.edges) {
    if (e.source === focus) keep.add(e.target);
    if (e.target === focus) keep.add(e.source);
  }
  const parent = new Map<string, string | null>();
  for (const g of scene.groups) parent.set(g.id, g.parent);
  for (const n of scene.nodes) parent.set(n.id, n.parent);
  const groupsKept = new Set<string>();
  for (const id of [...keep]) {
    let p = parent.get(id) ?? null;
    while (p) {
      groupsKept.add(p);
      p = parent.get(p) ?? null;
    }
  }
  return {
    labels: scene.labels,
    direction: scene.direction,
    groups: scene.groups.filter((g) => groupsKept.has(g.id) || keep.has(g.id)),
    nodes: scene.nodes.filter((n) => keep.has(n.id)),
    edges: scene.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}

/** Map an ARM ID (from overlays or attack paths) to the scene node that shows it. */
export function nodeIndex(scene: Scene): Map<string, string> {
  const index = new Map<string, string>();
  for (const n of scene.nodes) for (const arm of n.armIds) index.set(arm.toLowerCase(), n.id);
  return index;
}
