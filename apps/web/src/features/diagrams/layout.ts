import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { Scene } from './scene';

/**
 * ELK layered layout with orthogonal edge routing across the whole container hierarchy
 * (INCLUDE_CHILDREN), computed in a web worker. Inside containers, children that are not
 * connected would all land in one layer (a single tall column), so invisible "grid" edges chain
 * them into balanced rows; they shape the layout and are never drawn.
 */
export const NODE_W = 152;
export const NODE_H = 100;
export const COLLAPSED_W = 188;
export const HEADER = 50;
export const PAD = 20;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  /** positions relative to the parent container */
  boxes: Map<string, Box>;
  /** absolute positions */
  absolute: Map<string, Box>;
  /** absolute edge routes */
  routes: Map<string, Point[]>;
  width: number;
  height: number;
  ms: number;
}

const KIND_ORDER: Record<string, number> = {
  external: 0,
  collapsed: 1,
  resource: 2,
  aggregate: 2,
  member: 2,
  ghost: 3,
};

function columns(n: number, containerKind: string, detailed = false, boxes = 0): number {
  if (detailed) {
    // machine boxes are wide (public IP, NIC, VM, disks in a row): stack them, keep the rest narrow
    if (containerKind === 'subnet') return boxes > 0 ? 1 : Math.min(3, n);
    if (containerKind === 'vnet' || containerKind === 'subscription') return Math.min(2, n);
    return Math.min(4, Math.ceil(Math.sqrt(n * 1.3)));
  }
  if (n <= 3) return n;
  if (containerKind === 'vnet') return Math.min(3, Math.ceil(Math.sqrt(n)));
  if (containerKind === 'region' || containerKind === 'subscription') return Math.min(3, Math.ceil(Math.sqrt(n)));
  return Math.min(5, Math.ceil(Math.sqrt(n * 1.6)));
}

/**
 * The detailed view reads left to right: Internet, then the virtual networks, then the resource
 * groups, then on-premises. A link that points the other way (an NSG in a resource group that
 * filters a NIC) is handed to ELK reversed, so containers do not stretch across the whole drawing;
 * its route is turned back afterwards and its arrow keeps the real direction.
 */
export function reversedForLayout(scene: Scene): Set<string> {
  const flipped = new Set<string>();
  if (!scene.labels) return flipped;
  const parent = new Map<string, string | null>();
  const kind = new Map<string, string>();
  for (const g of scene.groups) {
    parent.set(g.id, g.parent);
    kind.set(g.id, g.kind);
  }
  const rank = new Map<string, number>();
  for (const n of scene.nodes) {
    parent.set(n.id, n.parent);
    if (n.kind === 'external') rank.set(n.id, n.type === 'external/internet' ? 0 : 3);
  }
  const rankOf = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    let cur: string | null = id;
    let r = 2;
    while (cur) {
      if (kind.get(cur) === 'vnet') {
        r = 1;
        break;
      }
      cur = parent.get(cur) ?? null;
    }
    rank.set(id, r);
    return r;
  };
  for (const e of scene.edges) if (rankOf(e.source) > rankOf(e.target)) flipped.add(e.id);
  return flipped;
}

export function toElk(scene: Scene): ElkNode {
  const kids = new Map<string, string[]>();
  const kindOf = new Map<string, string>();
  const labelOf = new Map<string, string>();
  const groupKind = new Map<string, string>();
  for (const g of scene.groups) {
    kids.set(g.parent ?? '', [...(kids.get(g.parent ?? '') ?? []), g.id]);
    groupKind.set(g.id, g.kind);
    labelOf.set(g.id, g.label);
  }
  for (const n of scene.nodes) {
    kids.set(n.parent ?? '', [...(kids.get(n.parent ?? '') ?? []), n.id]);
    kindOf.set(n.id, n.kind);
    labelOf.set(n.id, n.label);
  }
  const connected = new Set<string>();
  for (const e of scene.edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const helpers: ElkExtendedEdge[] = [];
  const order = (id: string) => (groupKind.has(id) ? 5 : (KIND_ORDER[kindOf.get(id) ?? 'resource'] ?? 2));

  const build = (id: string): ElkNode => {
    if (groupKind.has(id)) {
      const children = [...(kids.get(id) ?? [])].sort(
        (a, b) => order(a) - order(b) || (labelOf.get(a) ?? '').localeCompare(labelOf.get(b) ?? ''),
      );
      // chain unconnected leaves (and sub-containers) into a grid
      const free = children.filter((c) => !connected.has(c) || groupKind.has(c));
      const cols = columns(free.length, groupKind.get(id) ?? '', scene.labels === true, free.filter((c) => groupKind.has(c)).length);
      for (let i = 0; i + 1 < free.length; i += 1) {
        if (cols > 1 && i % cols !== cols - 1) {
          helpers.push({ id: `h:${free[i]}>${free[i + 1]}`, sources: [free[i] ?? ''], targets: [free[i + 1] ?? ''] });
        }
      }
      return {
        id,
        layoutOptions: {
          'elk.padding': `[top=${HEADER},left=${PAD},bottom=${PAD},right=${PAD}]`,
          'elk.nodeSize.constraints': 'MINIMUM_SIZE',
          'elk.nodeSize.minimum': '(220,96)',
          // spacing is not inherited by containers: labelled links need the room inside them too
          ...(scene.labels
            ? { 'elk.layered.spacing.nodeNodeBetweenLayers': groupKind.get(id) === 'machine' ? '92' : '56', 'elk.spacing.nodeNode': '24' }
            : {}),
        },
        children: children.map(build),
      };
    }
    const kind = kindOf.get(id);
    return { id, width: kind === 'collapsed' ? COLLAPSED_W : NODE_W, height: NODE_H };
  };

  const root = [...(kids.get('') ?? [])].sort((a, b) => order(a) - order(b));
  const flipped = reversedForLayout(scene);
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': scene.direction === 'DOWN' ? 'DOWN' : 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      // labelled links need room for their text between the layers
      'elk.layered.spacing.nodeNodeBetweenLayers': scene.labels ? '72' : '64',
      'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.edgeNodeBetweenLayers': '22',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.spacing.edgeNode': '18',
      'elk.spacing.edgeEdge': '12',
      'elk.spacing.componentComponent': '48',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.thoroughness': '12',
      'elk.json.edgeCoords': 'ROOT',
    },
    children: root.map(build),
    edges: [
      ...scene.edges.map((e) =>
        flipped.has(e.id) ? { id: e.id, sources: [e.target], targets: [e.source] } : { id: e.id, sources: [e.source], targets: [e.target] },
      ),
      ...helpers,
    ],
  };
}

let elk: { layout: (g: ElkNode) => Promise<ElkNode> } | null = null;

/** ELK's own worker script as a classic web worker (keeps the UI responsive during layout);
 *  the bundled build runs in-thread where workers do not exist (tests). */
async function runElk(graph: ElkNode): Promise<ElkNode> {
  if (!elk) {
    if (typeof Worker === 'undefined') {
      const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
      elk = new ELK();
    } else {
      const [{ default: ElkApi }, { default: workerUrl }] = await Promise.all([
        import('elkjs/lib/elk-api'),
        import('elkjs/lib/elk-worker.min.js?url'),
      ]);
      elk = new ElkApi({ workerFactory: () => new Worker(workerUrl) });
    }
  }
  return elk.layout(graph);
}

export async function layoutScene(scene: Scene): Promise<Layout> {
  const t0 = performance.now();
  const out = await runElk(toElk(scene));
  const boxes = new Map<string, Box>();
  const absolute = new Map<string, Box>();
  const walk = (n: ElkNode, ox: number, oy: number) => {
    for (const c of n.children ?? []) {
      const box = { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? NODE_W, height: c.height ?? NODE_H };
      boxes.set(c.id, box);
      absolute.set(c.id, { ...box, x: ox + box.x, y: oy + box.y });
      walk(c, ox + box.x, oy + box.y);
    }
  };
  walk(out, 0, 0);
  const routes = new Map<string, Point[]>();
  const flipped = reversedForLayout(scene);
  for (const e of out.edges ?? []) {
    if (e.id.startsWith('h:')) continue;
    const pts: Point[] = [];
    for (const s of (e).sections ?? []) {
      pts.push(s.startPoint, ...(s.bendPoints ?? []), s.endPoint);
    }
    if (pts.length >= 2) routes.set(e.id, flipped.has(e.id) ? pts.reverse() : pts);
  }
  return { boxes, absolute, routes, width: out.width ?? 0, height: out.height ?? 0, ms: Math.round(performance.now() - t0) };
}
