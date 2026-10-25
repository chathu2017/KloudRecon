import * as React from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Crosshair,
  DollarSign,
  FileText,
  GitCompareArrows,
  Layers,
  Loader2,
  Maximize,
  Minimize,
  Route as RouteIcon,
  Search,
  ShieldAlert,
  ShieldCheck,
  StickyNote,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { typeInfo } from '@/features/inventory/types';
import { useMe } from '@/lib/auth/context';
import { hasRole } from '@/components/layout/nav';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { useAnnotations, useDeleteAnnotation, useDiagram, useSaveAnnotation, useTimeline, VIEWS, type AnnotationIn, type ViewName } from './api';
import { GroupNode, NoteNode, ResourceNode, RouteEdge, type GroupData, type NoteData, type ResourceData, type RouteData } from './canvas';
import { ExportMenu } from './ExportMenu';
import { layoutScene, type Layout } from './layout';
import { Legend } from './Legend';
import { computeOverlays, type OverlayKey } from './overlay';
import { autoCollapse, buildScene, type Scene, type SceneNode } from './scene';
import { compactCost, elbow } from './styles';

const nodeTypes = { resource: ResourceNode, container: GroupNode, note: NoteNode };
const edgeTypes = { route: RouteEdge };
const OVERLAYS: { key: OverlayKey; label: string; icon: typeof ShieldAlert }[] = [
  { key: 'security', label: 'Security', icon: ShieldAlert },
  { key: 'findings', label: 'Findings', icon: ShieldCheck },
  { key: 'cost', label: 'Cost', icon: DollarSign },
  { key: 'changes', label: 'Changes', icon: GitCompareArrows },
];
const NOTE_W = 180;
const NOTE_H = 110;

interface Hover {
  node: SceneNode;
  x: number;
  y: number;
}

function depthOf(id: string, parent: Map<string, string | null>): number {
  let d = 0;
  let p = parent.get(id) ?? null;
  while (p) {
    d += 1;
    p = parent.get(p) ?? null;
  }
  return d;
}

function Canvas() {
  const { data: me } = useMe();
  const canEdit = hasRole(me?.user?.org_role, 'member');
  const globalAsOf = useUi((s) => s.asOfScanId);
  const [view, setViewState] = React.useState<ViewName>(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    return (VIEWS.find((x) => x.key === v)?.key ?? 'network');
  });
  const [tag, setTagState] = React.useState('app');
  const [scanId, setScanIdState] = React.useState<string | undefined>(globalAsOf ?? undefined);
  const [enabled, setEnabled] = React.useState<Set<OverlayKey>>(() => new Set(['findings']));
  const [pathId, setPathId] = React.useState<string | null>(() => new URLSearchParams(window.location.search).get('path'));
  // user choices per data set; the automatic collapse applies until the user changes something
  const [collapsedBy, setCollapsedBy] = React.useState<{ key: string; set: Set<string> } | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [focus, setFocus] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [hover, setHover] = React.useState<Hover | null>(null);
  const [hoverEdge, setHoverEdge] = React.useState<string | null>(null);
  const [layout, setLayout] = React.useState<{ scene: Scene; layout: Layout } | null>(null);
  const [layoutError, setLayoutError] = React.useState<string | null>(null);
  const [presenting, setPresenting] = React.useState(false);
  const [showLegend, setShowLegend] = React.useState(true);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const [, openResource] = useResourceParam();
  const flow = useReactFlow();
  const t0 = React.useRef(0);
  const hoverTimer = React.useRef<number | null>(null);

  const { data, isPending, isError, isFetching } = useDiagram(view, scanId, tag);
  const timeline = useTimeline();
  const notes = useAnnotations(view);
  const saveNote = useSaveAnnotation(view);
  const deleteNote = useDeleteAnnotation(view);

  // switching view, scan or tag starts from a clean slate
  const resetFor = () => {
    setExpanded(new Set());
    setFocus(null);
  };
  React.useEffect(() => {
    t0.current = performance.now();
  }, [view, scanId, tag]);
  const setView = (v: ViewName) => {
    resetFor();
    setViewState(v);
  };
  const setTag = (t: string) => {
    resetFor();
    setTagState(t);
  };
  const setScanId = (id: string | undefined) => {
    resetFor();
    setScanIdState(id);
  };
  const dataKey = data ? `${data.graph.view}|${data.scan_id}` : '';
  const collapsed = React.useMemo(
    () => (collapsedBy?.key === dataKey ? collapsedBy.set : data ? autoCollapse(data.graph) : new Set<string>()),
    [collapsedBy, dataKey, data],
  );
  const setCollapsed = (update: (prev: Set<string>) => Set<string>) => setCollapsedBy({ key: dataKey, set: update(collapsed) });

  const scene = React.useMemo(
    () => (data ? buildScene(data.graph, data.overlays, { collapsed, expanded, focus, ghosts: enabled.has('changes') }) : null),
    [data, collapsed, expanded, focus, enabled],
  );

  React.useEffect(() => {
    if (!scene) return;
    let cancelled = false;
    layoutScene(scene)
      .then((l) => {
        if (cancelled) return;
        setLayoutError(null);
        setLayout({ scene, layout: l });
        if (import.meta.env.DEV || window.location.search.includes('debug=1')) (window as unknown as { __krDiagram?: unknown }).__krDiagram = { scene, layout: l };
      })
      .catch((e: unknown) => {
        if (!cancelled) setLayoutError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  const overlay = React.useMemo(
    () => (layout ? computeOverlays(layout.scene, data?.overlays, enabled, pathId, search) : null),
    [layout, data?.overlays, enabled, pathId, search],
  );

  const toggleGroup = React.useCallback((id: string) => {
    if (expanded.has(id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [expanded, collapsed, dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const { nodes, edges } = React.useMemo(() => {
    if (!layout || !overlay) return { nodes: [] as Node[], edges: [] as Edge[] };
    const { scene: sc, layout: l } = layout;
    const parent = new Map<string, string | null>();
    for (const g of sc.groups) parent.set(g.id, g.parent);
    for (const n of sc.nodes) parent.set(n.id, n.parent);
    const pathActive = overlay.pathNodes.size > 0;
    const groupNodes: Node[] = sc.groups
      .filter((g) => l.boxes.has(g.id))
      .sort((a, b) => depthOf(a.id, parent) - depthOf(b.id, parent))
      .map((g) => {
        const b = l.boxes.get(g.id);
        return {
          id: g.id,
          type: 'container',
          position: { x: b?.x ?? 0, y: b?.y ?? 0 },
          parentId: g.parent ?? undefined,
          width: b?.width,
          height: b?.height,
          style: { width: b?.width, height: b?.height },
          data: { group: g, onToggle: toggleGroup, dimmed: false } satisfies GroupData,
          draggable: false,
          selectable: false,
          zIndex: -10 + depthOf(g.id, parent),
        };
      });
    const resNodes: Node[] = sc.nodes
      .filter((n) => l.boxes.has(n.id))
      .map((n) => {
        const b = l.boxes.get(n.id);
        return {
          id: n.id,
          type: 'resource',
          position: { x: b?.x ?? 0, y: b?.y ?? 0 },
          parentId: n.parent ?? undefined,
          width: b?.width,
          height: b?.height,
          style: { width: b?.width, height: b?.height },
          data: { node: n, overlay: overlay.nodes.get(n.id), showCost: enabled.has('cost'), currency: 'USD' } satisfies ResourceData,
          draggable: false,
          zIndex: 10,
        };
      });
    const noteNodes: Node[] = (notes.data ?? []).map((a) => ({
      id: `note:${a.id}`,
      type: 'note',
      position: { x: a.position.x ?? 0, y: a.position.y ?? 0 },
      width: NOTE_W,
      height: NOTE_H,
      style: { width: NOTE_W, height: NOTE_H },
      data: {
        text: a.text,
        color: a.color,
        editable: canEdit,
        onSave: (text: string) => saveNote.mutate({ id: a.id, body: { view, text, color: a.color as AnnotationIn['color'], position: a.position, node_ref: a.node_ref } }),
        onDelete: () => deleteNote.mutate(a.id),
      } satisfies NoteData,
      draggable: canEdit,
      zIndex: 50,
    }));
    const flowEdges: Edge[] = sc.edges
      .filter((e) => l.routes.has(e.id))
      .map((e) => {
        const onPath = overlay.pathNodes.has(e.source) && overlay.pathNodes.has(e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: 's',
          targetHandle: 't',
          type: 'route',
          zIndex: 5,
          data: {
            points: l.routes.get(e.id) ?? [],
            kind: e.kind,
            label: e.label,
            dimmed: pathActive && !onPath,
            emphasized: onPath || (enabled.has('security') && e.kind === 'exposure'),
            security: enabled.has('security'),
            hovered: hoverEdge === e.id,
            showLabel: sc.labels === true,
          } satisfies RouteData,
        };
      });
    for (const link of overlay.pathLinks) {
      const a = l.absolute.get(link.source);
      const b = l.absolute.get(link.target);
      if (!a || !b) continue;
      flowEdges.push({
        id: link.id,
        source: link.source,
        target: link.target,
        sourceHandle: 's',
        targetHandle: 't',
        type: 'route',
        zIndex: 20,
        data: { points: elbow(a, b), kind: 'path', label: link.label, dimmed: false, emphasized: true, security: true, hovered: hoverEdge === link.id } satisfies RouteData,
      });
    }
    return { nodes: [...groupNodes, ...resNodes, ...noteNodes], edges: flowEdges };
  }, [layout, overlay, enabled, notes.data, canEdit, view, toggleGroup, hoverEdge, saveNote, deleteNote]);

  // fit after every new layout; report the time from request to picture
  const legendVisible = showLegend && !presenting;
  const [renderMs, setRenderMs] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!layout) return;
    const id = window.requestAnimationFrame(() => {
      // keep the bottom-left legend clear of the drawing
      const side = legendVisible ? '260px' : '4%';
      void flow.fitView({ padding: { top: '4%', right: '4%', bottom: '4%', left: side }, duration: 0 });
      setRenderMs(Math.round(performance.now() - t0.current));
    });
    return () => window.cancelAnimationFrame(id);
  }, [layout, flow, legendVisible]);

  // bring the selected attack path into view
  React.useEffect(() => {
    if (!overlay || overlay.pathNodes.size === 0) return;
    const boxes = [...overlay.pathNodes].map((n) => layout?.layout.absolute.get(n)).filter((b) => b !== undefined);
    if (!boxes.length) return;
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const w = Math.max(...boxes.map((b) => b.x + b.width)) - x;
    const h = Math.max(...boxes.map((b) => b.y + b.height)) - y;
    const id = window.setTimeout(() => void flow.fitBounds({ x, y, width: w, height: h }, { padding: 0.3, duration: 500 }), 120);
    return () => window.clearTimeout(id);
  }, [pathId, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  // zoom to the first search match
  React.useEffect(() => {
    if (!layout || !overlay || !search.trim()) return;
    const match = [...overlay.nodes.entries()].find(([, o]) => o.match)?.[0];
    const box = match ? layout.layout.absolute.get(match) : undefined;
    if (box) void flow.setCenter(box.x + box.width / 2, box.y + box.height / 2, { zoom: 1.1, duration: 400 });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // presentation mode = fullscreen without controls
  React.useEffect(() => {
    const onChange = () => setPresenting(document.fullscreenElement === wrapper.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const togglePresentation = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapper.current?.requestFullscreen().catch(() => setPresenting((p) => !p));
  };

  const onNodeClick = (_: React.MouseEvent, n: Node) => {
    if (n.type === 'note') return;
    const sn = (n.data as ResourceData | undefined)?.node;
    if (!sn) return;
    if (sn.kind === 'aggregate') setExpanded((prev) => new Set(prev).add(sn.id));
    else if (sn.kind === 'collapsed') toggleGroup(sn.id);
    else if ((sn.kind === 'resource' || sn.kind === 'member') && sn.armIds[0]) openResource(sn.armIds[0]);
  };

  const addNote = () => {
    const rect = wrapper.current?.getBoundingClientRect();
    const center = flow.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 });
    saveNote.mutate({ body: { view, text: 'New note', color: 'yellow', position: { x: center.x - NOTE_W / 2, y: center.y - NOTE_H / 2 }, node_ref: null } });
  };

  const paths = data?.overlays.attack_paths ?? [];
  const tl = timeline.data ?? [];
  const tlIndex = scanId ? tl.findIndex((t) => t.scan_id === scanId) : tl.length - 1;
  const current = data?.graph;
  const busy = isFetching || (scene !== null && layout?.scene !== scene && !layoutError);
  const hoverOverlay = hover && overlay ? overlay.nodes.get(hover.node.id) : undefined;

  return (
    <div className={cn('flex flex-col', presenting ? 'h-screen bg-bg' : 'h-[calc(100dvh-7.5rem)] min-h-[640px]')} ref={wrapper}>
      {!presenting && (
        <div className="mb-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Diagram view" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  role="tab"
                  type="button"
                  aria-selected={view === v.key}
                  onClick={() => setView(v.key)}
                  className={cn('h-8 rounded-md px-3 text-sm font-medium text-muted hover:text-text', view === v.key && 'bg-surface text-text shadow-sm')}
                >
                  {v.short}
                </button>
              ))}
            </div>
            {view === 'application' && (
              <label className="flex items-center gap-2 text-sm text-muted">
                Group by tag
                <NativeSelect className="h-8 w-36" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
                  {(data?.tags ?? ['app']).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link to={scanId ? `/app/diagrams/document?scan=${scanId}` : '/app/diagrams/document'}>
                  <FileText aria-hidden />
                  <span className="sm:hidden">Document</span>
                  <span className="hidden sm:inline">Architecture document</span>
                </Link>
              </Button>
              {layout && current && (
                <ExportMenu
                  graphTitle={current.title}
                  subtitle={`Scan #${data.scan_sequence} · ${formatDate(data.scan_started_at ?? null)} · ${current.description}`}
                  scene={layout.scene}
                  layout={layout.layout}
                  overlay={overlay}
                  showCost={enabled.has('cost')}
                  security={enabled.has('security')}
                  notes={notes.data ?? []}
                />
              )}
              <Button variant="secondary" size="sm" onClick={togglePresentation}>
                <Maximize aria-hidden /> Present
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-subtle" aria-hidden />
              <Input className="h-8 w-56 pl-8" placeholder="Find a resource" aria-label="Find a resource" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Overlays">
              {OVERLAYS.map((o) => {
                const on = enabled.has(o.key);
                const Icon = o.icon;
                return (
                  <Button
                    key={o.key}
                    size="sm"
                    variant={on ? 'subtle' : 'ghost'}
                    aria-pressed={on}
                    onClick={() =>
                      setEnabled((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.key)) next.delete(o.key);
                        else next.add(o.key);
                        return next;
                      })
                    }
                  >
                    <Icon aria-hidden /> {o.label}
                  </Button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              <RouteIcon className="size-4" aria-hidden />
              <NativeSelect className="h-8 w-64" value={pathId ?? ''} onChange={(e) => setPathId(e.target.value || null)} aria-label="Attack path">
                <option value="">Attack path: none</option>
                {paths.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.severity.toUpperCase()} · {p.title}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {focus && (
              <Badge tone="brand" className="gap-1.5 py-1">
                <Crosshair aria-hidden /> Focused on {layout?.scene.nodes.find((n) => n.id === focus)?.label ?? 'node'}
                <button type="button" aria-label="Clear focus" onClick={() => setFocus(null)}>
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={addNote} className="ml-auto">
                <StickyNote aria-hidden /> Add note
              </Button>
            )}
            <Button size="sm" variant="ghost" aria-pressed={showLegend} onClick={() => setShowLegend((v) => !v)} className={cn(!canEdit && 'ml-auto')}>
              <Layers aria-hidden /> Legend
            </Button>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border" style={{ background: 'var(--dg-canvas)' }}>
        {isPending ? (
          <Skeleton className="h-full w-full" />
        ) : isError ? (
          <div className="p-8">
            <EmptyState icon={<Layers />} title="No diagram yet" description="Diagrams are built from a finished scan." />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesConnectable={false}
            elementsSelectable
            onlyRenderVisibleElements={nodes.length > 300}
            minZoom={0.05}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={(e, n) => {
              const sn = (n.data as ResourceData | undefined)?.node;
              const rect = wrapper.current?.getBoundingClientRect();
              if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
              if (sn && rect) setHover({ node: sn, x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onNodeMouseLeave={() => {
              hoverTimer.current = window.setTimeout(() => setHover(null), 220);
            }}
            onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)}
            onEdgeMouseLeave={() => setHoverEdge(null)}
            onNodeDragStop={(_, n) => {
              if (n.type !== 'note') return;
              const a = notes.data?.find((x) => `note:${x.id}` === n.id);
              if (a) saveNote.mutate({ id: a.id, body: { view, text: a.text, color: a.color as AnnotationIn['color'], position: { x: n.position.x, y: n.position.y }, node_ref: a.node_ref } });
            }}
            aria-label={`${current?.title ?? 'Architecture'} diagram`}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--dg-grid)" />
            {!presenting && <Controls showInteractive={false} position="bottom-right" />}
            {!presenting && (
              <MiniMap
                pannable
                zoomable
                position="top-right"
                maskColor="var(--overlay)"
                // nodeColor sets the fill attribute (a class loses to React Flow's inline default)
                nodeColor={(n) => (n.type === 'container' ? 'var(--surface-3)' : n.type === 'note' ? 'var(--medium)' : 'var(--brand)')}
                bgColor="var(--surface)"
                nodeStrokeWidth={0}
                className="!rounded-md !border !border-border"
              />
            )}
            {showLegend && !presenting && layout && (
              <Panel position="bottom-left">
                <Legend scene={layout.scene} enabled={enabled} pathActive={Boolean(pathId)} costMax={overlay?.costMax ?? 0} />
              </Panel>
            )}
            {presenting && (
              <Panel position="top-right">
                <Button size="sm" variant="secondary" onClick={togglePresentation}>
                  <Minimize aria-hidden /> Exit
                </Button>
              </Panel>
            )}
            {presenting && current && (
              <Panel position="top-left">
                <div className="rounded-lg bg-surface/90 px-3 py-2 shadow-md">
                  <div className="font-display text-lg font-semibold">{current.title}</div>
                  <div className="text-xs text-muted">Contoso · scan #{data.scan_sequence}</div>
                </div>
              </Panel>
            )}
          </ReactFlow>
        )}
        {busy && (
          <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted shadow-sm">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Laying out…
          </div>
        )}
        {layoutError && <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-critical-soft px-3 py-1 text-sm text-critical-strong">Layout failed: {layoutError}</div>}
        {hover && !presenting && (
          <HoverCard
            hover={hover}
            overlay={hoverOverlay}
            currency="USD"
            onFocus={(id) => {
              setFocus(id);
              setHover(null);
            }}
            canFocus={hover.node.kind !== 'external'}
            onEnter={() => {
              if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
            }}
            onLeave={() => setHover(null)}
          />
        )}
        {pathId && overlay && (
          <div className="absolute right-3 top-44 w-72 rounded-xl border border-border bg-surface/95 p-3 text-sm shadow-md">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold">Attack path</span>
              <button type="button" aria-label="Clear attack path" onClick={() => setPathId(null)}>
                <X className="size-4 text-muted" />
              </button>
            </div>
            <p className="text-xs text-muted">{paths.find((p) => p.id === pathId)?.summary}</p>
            <ol className="mt-2 space-y-1 text-xs">
              {paths
                .find((p) => p.id === pathId)
                ?.steps.map((s, i) => (
                  <li key={`${s.id}-${i}`} className="flex gap-2">
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-critical-soft text-[10px] font-semibold text-critical-strong">{i + 1}</span>
                    <span>
                      <span className="font-medium">{s.label}</span>
                      {s.detail ? <span className="text-muted"> · {s.detail}</span> : null}
                    </span>
                  </li>
                ))}
            </ol>
          </div>
        )}
      </div>

      {!presenting && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          {tl.length > 1 && (
            <label className="flex min-w-72 flex-1 items-center gap-3">
              <span className="shrink-0 font-medium text-text">Timeline</span>
              <input
                type="range"
                min={0}
                max={tl.length - 1}
                value={tlIndex < 0 ? tl.length - 1 : tlIndex}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setScanId(i === tl.length - 1 ? undefined : tl[i]?.scan_id);
                }}
                className="w-full accent-[var(--brand)]"
                aria-label="Scan timeline"
              />
              <span className="w-56 shrink-0 tabular">
                Scan #{data?.scan_sequence} · {formatDate(data?.scan_started_at ?? null)}
                {tlIndex >= 0 && tlIndex < tl.length - 1 ? ' (past)' : ' (latest)'}
              </span>
            </label>
          )}
          {current && (
            <span className="tabular">
              {layout?.scene.nodes.length ?? 0} nodes · {layout?.scene.edges.length ?? 0} links
              {renderMs !== null && ` · drawn in ${(renderMs / 1000).toFixed(2)} s (layout ${((layout?.layout.ms ?? 0) / 1000).toFixed(2)} s)`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function HoverCard({
  hover,
  overlay,
  currency,
  onFocus,
  canFocus,
  onEnter,
  onLeave,
}: {
  onEnter: () => void;
  onLeave: () => void;
  hover: Hover;
  overlay: ReturnType<typeof computeOverlays>['nodes'] extends Map<string, infer V> ? V | undefined : never;
  currency: string;
  onFocus: (id: string) => void;
  canFocus: boolean;
}) {
  const n = hover.node;
  const info = typeInfo(n.type);
  const left = Math.min(hover.x + 16, (window.innerWidth || 1200) - 340);
  return (
    <div
      className="pointer-events-auto absolute z-30 w-72 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg"
      style={{ left, top: Math.max(8, hover.y - 20) }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="font-semibold">{n.label}</div>
      <div className="text-xs text-muted">
        {n.kind === 'external' ? 'Outside Azure' : info.label}
        {n.sublabel ? ` · ${n.sublabel}` : ''}
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        {overlay?.cost !== undefined && (
          <div className="flex justify-between">
            <dt className="text-muted">Cost (30 days)</dt>
            <dd className="tabular">{compactCost(overlay.cost, currency)}</dd>
          </div>
        )}
        {overlay?.findings && (
          <div className="flex justify-between">
            <dt className="text-muted">Open findings</dt>
            <dd className="tabular">
              {overlay.findings.total} ({overlay.findings.top} highest)
            </dd>
          </div>
        )}
        {overlay?.exposure && (
          <div className="flex justify-between">
            <dt className="text-muted">Internet exposure</dt>
            <dd className="text-critical-strong">{overlay.exposure.ports.join(', ') || overlay.exposure.severity}</dd>
          </div>
        )}
        {n.badges.map((b) => (
          <div key={b} className="text-muted">
            {b}
          </div>
        ))}
      </dl>
      {n.members && (
        <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto border-t border-border pt-2 text-xs">
          {n.members.slice(0, 12).map((m) => (
            <li key={m.id} className="flex justify-between gap-2">
              <span className="truncate">{m.label}</span>
              <span className="shrink-0 text-muted">{m.sublabel}</span>
            </li>
          ))}
          {n.members.length > 12 && <li className="text-muted">+{n.members.length - 12} more</li>}
        </ul>
      )}
      <div className="mt-2 flex gap-3 border-t border-border pt-2 text-xs">
        {n.kind === 'aggregate' && <span className="text-muted">Click to expand</span>}
        {(n.kind === 'resource' || n.kind === 'member') && <span className="text-muted">Click for details</span>}
        {canFocus && (
          <button type="button" className="ml-auto inline-flex items-center gap-1 text-brand-strong hover:underline" onClick={() => onFocus(n.id)}>
            <Crosshair className="size-3" /> Focus
          </button>
        )}
      </div>
    </div>
  );
}

export function DiagramPage() {
  return (
    <>
      <PageHeader
        title="Architecture diagrams"
        description="Generated from what is deployed: eight views with the official Azure icons, live overlays and a timeline across scans."
      />
      <ReactFlowProvider>
        <Canvas />
      </ReactFlowProvider>
      <ResourceDrawer />
    </>
  );
}
