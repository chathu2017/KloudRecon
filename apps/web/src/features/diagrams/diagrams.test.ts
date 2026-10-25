import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramGraph, DiagramOverlays } from './api';
import { buildPdf, toDrawio, toHex, type ExportInput } from './export';
import { FALLBACK_ICON, GROUP_ICONS, iconPath, RESOURCE_ICONS } from './icons';
import { reversedForLayout, toElk, type Layout } from './layout';
import { computeOverlays } from './overlay';
import { autoCollapse, buildScene, nodeIndex, type Scene } from './scene';
import { chipText, compactCost, roundedPath } from './styles';

afterEach(() => {
  vi.unstubAllGlobals();
});

// the official icon files shipped in public/ (keys only; nothing is loaded)
const ICON_FILES = new Set(Object.keys(import.meta.glob('/public/azure-icons/**/*.svg')).map((k) => k.replace('/public/azure-icons/', '')));
const VM = '/subscriptions/s1/resourcegroups/rg-app/providers/microsoft.compute/virtualmachines/vm-web';
const SQL = '/subscriptions/s1/resourcegroups/rg-app/providers/microsoft.sql/servers/sql-app';

const graph: DiagramGraph = {
  view: 'rg',
  title: 'Resource groups',
  description: '',
  direction: 'RIGHT',
  stats: {},
  groups: [
    { id: 'sub:s1', kind: 'subscription', label: 'Contoso-Prod', parent: null, sublabel: '', badges: [], arm_id: '/subscriptions/s1', attrs: {} },
    { id: 'rg:rg-app', kind: 'rg', label: 'rg-app', parent: 'sub:s1', sublabel: 'westeurope', badges: [], arm_id: null, attrs: {} },
  ],
  nodes: [
    { id: 'n:vm', type: 'microsoft.compute/virtualmachines', label: 'vm-web', parent: 'rg:rg-app', sublabel: 'D4s_v5', kind: 'resource', arm_id: VM, members: [], badges: [], attrs: {} },
    { id: 'n:sql', type: 'microsoft.sql/servers', label: 'sql-app', parent: 'rg:rg-app', sublabel: '', kind: 'resource', arm_id: SQL, members: [], badges: [], attrs: {} },
  ],
  edges: [{ id: 'e1', source: 'n:vm', target: 'n:sql', kind: 'data', label: 'SQL', attrs: {} }],
};

const overlays: DiagramOverlays = {
  cost: { [VM]: 420, [SQL]: 80 },
  findings: { [VM]: { high: 2, low: 1 } },
  exposure: { [VM]: { kind: 'vm', public_ip: '20.1.2.3', ports: [{ port: 22, service: 'SSH' }], severity: 'high' } },
  attack_paths: [
    {
      id: 'p1',
      title: 'Internet to SQL',
      severity: 'critical',
      score: 90,
      summary: '',
      steps: [
        { id: 'internet', kind: 'internet', label: 'Internet' },
        { id: VM, kind: 'resource', label: 'vm-web' },
        { id: SQL, kind: 'resource', label: 'sql-app' },
      ],
    },
  ] as DiagramOverlays['attack_paths'],
  changes: { added: [SQL], modified: [], removed: [], previous_scan_id: null },
};

const noOpts = { collapsed: new Set<string>(), expanded: new Set<string>(), focus: null, ghosts: false };

function layoutFor(scene: Scene): Layout {
  const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
  let x = 0;
  for (const g of scene.groups) boxes.set(g.id, { x: 0, y: 0, width: 600, height: 300 });
  for (const n of scene.nodes) {
    boxes.set(n.id, { x: 40 + x, y: 80, width: 152, height: 100 });
    x += 220;
  }
  const routes = new Map(scene.edges.map((e) => [e.id, [{ x: 192, y: 130 }, { x: 260, y: 130 }]]));
  return { boxes, absolute: boxes, routes, width: 600, height: 300, ms: 1 };
}

describe('icon mapping', () => {
  it('points every mapped type at an official icon file that exists', () => {
    const files = new Set([FALLBACK_ICON, ...Object.values(RESOURCE_ICONS), ...Object.values(GROUP_ICONS)]);
    expect(ICON_FILES.size).toBeGreaterThan(500);
    const missing = [...files].filter((f) => !ICON_FILES.has(f));
    expect(missing).toEqual([]);
  });

  it('falls back to the generic icon for unknown types', () => {
    expect(iconPath('microsoft.unknown/things')).toBe(FALLBACK_ICON);
    expect(iconPath('Microsoft.Compute/virtualMachines')).toBe(RESOURCE_ICONS['microsoft.compute/virtualmachines']);
  });
});

describe('scene', () => {
  it('keeps containers, nodes and edges and indexes ARM ids', () => {
    const scene = buildScene(graph, overlays, noOpts);
    expect(scene.groups.map((g) => g.id)).toEqual(['sub:s1', 'rg:rg-app']);
    expect(scene.nodes).toHaveLength(2);
    expect(scene.edges).toHaveLength(1);
    expect(nodeIndex(scene).get(VM)).toBe('n:vm');
  });

  it('replaces a collapsed container with one summary node and reroutes nothing inside it', () => {
    const scene = buildScene(graph, overlays, { ...noOpts, collapsed: new Set(['rg:rg-app']) });
    const collapsed = scene.nodes.filter((n) => n.kind === 'collapsed');
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.count).toBe(2);
    expect(scene.edges).toHaveLength(0);
  });

  it('auto-collapses only very large views', () => {
    expect(autoCollapse(graph).size).toBe(0);
    const [first] = graph.nodes;
    if (!first) throw new Error('fixture has nodes');
    const many = { ...graph, nodes: Array.from({ length: 401 }, (_, i) => ({ ...first, id: `n${i}` })) };
    expect(autoCollapse(many)).toEqual(new Set(['rg:rg-app']));
  });
});

describe('overlays', () => {
  const scene = buildScene(graph, overlays, noOpts);

  it('adds cost heat, findings, exposure and changes', () => {
    const r = computeOverlays(scene, overlays, new Set(['cost', 'findings', 'security', 'changes']), null, '');
    const vm = r.nodes.get('n:vm');
    expect(vm?.cost).toBe(420);
    expect(r.costMax).toBe(420);
    expect(vm?.costLevel).toBeGreaterThan(r.nodes.get('n:sql')?.costLevel ?? 0);
    expect(vm?.findings).toMatchObject({ total: 3, top: 'high' });
    expect(vm?.exposure?.ports).toEqual(['SSH 22']);
    expect(r.nodes.get('n:sql')?.change).toBe('added');
  });

  it('numbers attack path steps and dims everything else', () => {
    const withInternet: Scene = {
      ...scene,
      nodes: [...scene.nodes, { id: 'external:internet', type: 'external/internet', label: 'Internet', sublabel: '', kind: 'external', parent: null, armIds: [], badges: [], count: 1 }],
    };
    const r = computeOverlays(withInternet, overlays, new Set(), 'p1', '');
    expect(r.nodes.get('external:internet')?.onPath).toBe(1);
    expect(r.nodes.get('n:vm')?.onPath).toBe(2);
    expect(r.nodes.get('n:sql')?.onPath).toBe(3);
    expect(r.pathLinks.map((l) => l.target)).toEqual(['n:vm', 'n:sql']);
  });
});

describe('exports', () => {
  it('writes draw.io XML with nested containers, icons and waypoints', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<svg xmlns="http://www.w3.org/2000/svg"/>'))));
    const scene = buildScene(graph, overlays, noOpts);
    const input: ExportInput = { title: 'Resource groups', subtitle: 'Contoso', scene, layout: layoutFor(scene), overlay: null, showCost: false, security: false, notes: [] };
    const xml = await toDrawio(input);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.querySelector('mxfile diagram mxGraphModel root')).not.toBeNull();
    const cells = [...doc.getElementsByTagName('mxCell')];
    const rg = cells.find((c) => c.getAttribute('value')?.includes('rg-app'));
    const sub = cells.find((c) => c.getAttribute('value')?.includes('Contoso-Prod'));
    expect(rg?.getAttribute('parent')).toBe(sub?.getAttribute('id'));
    expect(cells.some((c) => c.getAttribute('style')?.includes('image=data:image/svg+xml,'))).toBe(true);
    expect(cells.filter((c) => c.getAttribute('edge') === '1').length).toBeGreaterThanOrEqual(1);
  });

  it('builds a one-page PDF with a valid cross-reference table', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = buildPdf(jpeg, 800, 400, 'Net (prod)');
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Title (Net prod)');
    expect(text).toContain('/MediaBox [0 0 400.00 200.00]');
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it('converts theme colours to hex for draw.io', () => {
    expect(toHex('#ABC')).toEqual({ hex: '#aabbcc', opacity: 1 });
    expect(toHex('rgb(31 94 255 / 0.5)')).toEqual({ hex: '#1f5eff', opacity: 0.5 });
    expect(toHex('transparent').opacity).toBe(0);
  });
});

describe('styles', () => {
  it('shortens container badges and costs', () => {
    expect(chipText('NSG nsg-web (12 rules)')).toBe('NSG');
    expect(chipText('UDR → fw-hub')).toBe('UDR → FW');
    expect(compactCost(12500, 'USD')).toMatch(/12\.5k|13k/i);
  });

  it('draws rounded orthogonal paths', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    expect(d.startsWith('M 0 0') || d.startsWith('M0 0') || d.startsWith('M0,0')).toBe(true);
    expect(d).toMatch(/Q|A/);
  });
});

describe('KloudRecon Draw (detailed view)', () => {
  const NIC = '/subscriptions/s1/resourcegroups/rg-app/providers/microsoft.network/networkinterfaces/nic-web';
  const NSG = '/subscriptions/s1/resourcegroups/rg-app/providers/microsoft.network/networksecuritygroups/nsg-web';
  const draw: DiagramGraph = {
    ...graph,
    view: 'draw',
    groups: [
      ...graph.groups,
      { id: 'vnet:v1', kind: 'vnet', label: 'vnet-app', parent: 'sub:s1', sublabel: '', badges: [], arm_id: null, attrs: {} },
      { id: 'vm:vm-web', kind: 'machine', label: 'vm-web', parent: 'vnet:v1', sublabel: '', badges: [], arm_id: VM, attrs: {} },
    ],
    nodes: [
      { id: VM, type: 'microsoft.compute/virtualmachines', label: 'vm-web', parent: 'vm:vm-web', sublabel: '', kind: 'resource', arm_id: VM, members: [], badges: [], attrs: {} },
      { id: NIC, type: 'microsoft.network/networkinterfaces', label: 'nic-web', parent: 'vm:vm-web', sublabel: '10.0.0.4', kind: 'resource', arm_id: NIC, members: [], badges: [], attrs: {} },
      { id: NSG, type: 'microsoft.network/networksecuritygroups', label: 'nsg-web', parent: 'rg:rg-app', sublabel: '2 rules', kind: 'resource', arm_id: NSG, members: [], badges: [], attrs: {} },
    ],
    edges: [
      { id: 'a', source: NIC, target: VM, kind: 'attached', label: '10.0.0.4', attrs: {} },
      { id: 'b', source: NSG, target: NIC, kind: 'nsg-attached', label: 'filters NIC', attrs: {} },
    ],
  };

  it('labels links and has an icon for every part', () => {
    const scene = buildScene(draw, undefined, noOpts);
    expect(scene.labels).toBe(true);
    expect(buildScene(graph, undefined, noOpts).labels).toBe(false);
    expect(ICON_FILES.has(GROUP_ICONS.machine ?? '')).toBe(true);
    for (const t of ['microsoft.network/networkinterfaces', 'microsoft.compute/disks', 'microsoft.network/publicipaddresses']) {
      expect(iconPath(t)).not.toBe(FALLBACK_ICON);
    }
  });

  it('lays out network before resource groups without changing the link direction', () => {
    const scene = buildScene(draw, undefined, noOpts);
    const flipped = reversedForLayout(scene);
    const nsgEdge = scene.edges.find((e) => e.kind === 'nsg-attached');
    expect([...flipped]).toEqual([nsgEdge?.id]);
    const elkEdge = toElk(scene).edges?.find((e) => e.id === nsgEdge?.id);
    expect(elkEdge?.sources).toEqual([NIC]);
    expect(nsgEdge?.source).toBe(NSG);
    // other views are laid out exactly as before
    expect(reversedForLayout(buildScene(graph, undefined, noOpts)).size).toBe(0);
  });
});
