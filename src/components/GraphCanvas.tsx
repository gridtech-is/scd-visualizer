import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  MarkerType,
  type XYPosition,
  type Edge,
  type Node,
  type OnMove,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { EdgeModel, IedModel } from '../model/types';
import type { SelectedEntity } from '../state/uiStore';
import type { DiffDecorations } from '../diff/applyDiffDecorations';
import { Button } from './ui';

interface GraphCanvasProps {
  ieds: IedModel[];
  edges: EdgeModel[];
  focusIedId: string | null;
  selectedEntity: SelectedEntity;
  fitToken: number;
  diffDecorations?: DiffDecorations;
  layoutCacheKey?: string;
  filtersSnapshot?: Record<string, unknown>;
  onSelectNode: (iedName: string) => void;
  onSelectEdge: (edge: EdgeModel) => void;
}

type LayoutMode = 'bay' | 'radial' | 'force' | 'hierarchy' | 'dagre-lr' | 'dagre-tb';

const FIT_VIEW_OPTIONS = { duration: 260, padding: 0.24 };
const DEFAULT_EDGE_OPTIONS = { type: 'smoothstep' as const, markerEnd: { type: MarkerType.ArrowClosed } };

/** Stroke colours per protocol (aligned with PAC World / visualization best practice) */
export const PROTOCOL_STROKE: Record<'GOOSE' | 'SV' | 'REPORT', string> = {
  GOOSE: '#c41e1e',
  SV: '#fb923c', // matches --sv design token; the old near-black #1f2933 was invisible on the dark canvas
  REPORT: '#0e5ea8',
};
const EMPTY_NODE_TYPES = {};
const EMPTY_EDGE_TYPES = {};
const LOW_DETAIL_ZOOM = 0.7;
const LARGE_GRAPH_EDGE_THRESHOLD = 400; // was 900
const EDGE_LABEL_THRESHOLD = 200;       // was 300
const LOD_FALLBACK_EDGE_SAMPLE = 240;

export default function GraphCanvas({
  ieds,
  edges,
  focusIedId,
  selectedEntity,
  fitToken,
  diffDecorations,
  layoutCacheKey,
  filtersSnapshot,
  onSelectNode,
  onSelectEdge,
}: GraphCanvasProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const missingSizeWarned = useRef(false);
  const [layout, setLayout] = useState<LayoutMode>('bay');
  const [lockViewport, setLockViewport] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const [manualPositions, setManualPositions] = useState<Record<string, XYPosition>>({});
  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
  const [layoutNonce, setLayoutNonce] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const layoutCacheRef = useRef<Map<string, Record<string, XYPosition>>>(new Map());

  const selectedIed = useMemo(() => {
    if (selectedEntity.type === 'ied') {
      return selectedEntity.id.replace('ied:', '');
    }
    return focusIedId;
  }, [selectedEntity, focusIedId]);

  const lowDetailMode = useMemo(
    () => viewport.zoom < LOW_DETAIL_ZOOM || edges.length > LARGE_GRAPH_EDGE_THRESHOLD,
    [viewport.zoom, edges.length],
  );

  const basePositions = useMemo(() => {
    const focus = focusIedId && ieds.some((i) => i.name === focusIedId) ? focusIedId : ieds[0]?.name;
    if (!focus) {
      return {};
    }

    const cacheKey = `${layoutCacheKey || 'default'}::${layout}::${focus}::n${ieds.length}::e${edges.length}`;
    const cached = layoutCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const computed = computeLayoutPositions(layout, ieds, edges, focus);
    layoutCacheRef.current.set(cacheKey, computed);
    return computed;
  }, [layoutCacheKey, layout, focusIedId, ieds, edges, layoutNonce]);

  const nodes: Node[] = useMemo(() => {
    const allNodes = buildNodes({
      ieds,
      selectedEntityId: selectedEntity.id,
      layout,
      basePositions,
      manualPositions,
      diffDecorations,
      lowDetail: lowDetailMode,
    });

    // Viewport culling: only render nodes within the visible viewport in low-detail mode
    // when there are many nodes (>30), to avoid rendering off-screen nodes
    if (!lowDetailMode || allNodes.length <= 30) {
      return allNodes;
    }

    // Compute visible area in graph-coordinate space
    // ReactFlow viewport: { x, y, zoom } where a graph point (gx, gy) is at screen (gx*zoom + x, gy*zoom + y)
    // So graph bounds for the screen are: gx in [(screenLeft - x)/zoom, (screenRight - x)/zoom]
    const { x: vpX, y: vpY, zoom: vpZoom } = viewport;
    const safeZoom = vpZoom > 0 ? vpZoom : 1;
    // Use containerSize for screen bounds (or fall back to reasonable defaults)
    const screenW = containerSize.width > 0 ? containerSize.width : 1200;
    const screenH = containerSize.height > 0 ? containerSize.height : 800;

    // Expand by 20% on each side to avoid pop-in
    const margin = 0.2;
    const gLeft = (-vpX / safeZoom) - (screenW * margin / safeZoom);
    const gRight = (screenW - vpX) / safeZoom + (screenW * margin / safeZoom);
    const gTop = (-vpY / safeZoom) - (screenH * margin / safeZoom);
    const gBottom = (screenH - vpY) / safeZoom + (screenH * margin / safeZoom);

    const focusNodeId = focusIedId ?? undefined;

    return allNodes.filter((node) => {
      // Always include the selected/focused node
      if (node.id === focusNodeId || node.id === selectedEntity.id.replace('ied:', '')) {
        return true;
      }
      // Always include bay nodes (they may be large and positioned far)
      if (node.id.startsWith('__bay:')) {
        return true;
      }
      const { x: nx, y: ny } = node.position;
      // Include nodes whose position (top-left corner, roughly) is within the expanded viewport
      return nx >= gLeft && nx <= gRight && ny >= gTop && ny <= gBottom;
    });
  }, [ieds, selectedEntity, layout, basePositions, manualPositions, diffDecorations, lowDetailMode, viewport, containerSize, focusIedId]);

  const renderedEdgeModels = useMemo(() => {
    if (!lowDetailMode) {
      return edges;
    }
    if (!selectedIed) {
      return [];
    }
    return edges.filter((edge) => edge.publisherIed === selectedIed || edge.subscriberIed === selectedIed);
  }, [edges, selectedIed, lowDetailMode]);

  const showEdgeLabels = useMemo(
    () => !lowDetailMode && renderedEdgeModels.length <= EDGE_LABEL_THRESHOLD,
    [lowDetailMode, renderedEdgeModels.length],
  );

  const graphEdges: Edge[] = useMemo(
    () =>
      renderedEdgeModels.map((edge) => {
        const style = edgeStyle(edge, diffDecorations?.edgeStatus[edge.key]) ?? {
          stroke: PROTOCOL_STROKE[edge.signalType],
          opacity: 1,
          strokeWidth: 2,
        };
        const strokeColor = (style.stroke ?? PROTOCOL_STROKE[edge.signalType]) as string;
        return {
          id: edge.key,
          source: edge.publisherIed,
          target: edge.subscriberIed,
          data: edge,
          label: showEdgeLabels ? edge.controlBlockName || edge.signalType : undefined,
          animated: edge.status !== 'resolved',
          style,
          markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
        };
      }),
    [renderedEdgeModels, showEdgeLabels, diffDecorations],
  );

  const safeNodes = useMemo(() => {
    let hadInvalidPositions = false;
    const sanitized = nodes.map((node, index) => {
      const x = Number(node.position?.x);
      const y = Number(node.position?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return node;
      }
      hadInvalidPositions = true;
      const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, nodes.length))));
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        ...node,
        position: { x: 140 + col * 210, y: 100 + row * 110 },
      };
    });
    return { nodes: sanitized, hadInvalidPositions };
  }, [nodes]);

  const edgesForRender = useMemo(() => {
    if (graphEdges.length > 0 || edges.length === 0) {
      return graphEdges;
    }
    if (!lowDetailMode) {
      return graphEdges;
    }
    return edges.slice(0, Math.min(LOD_FALLBACK_EDGE_SAMPLE, edges.length)).map((edge) => {
      const style = edgeStyle(edge, diffDecorations?.edgeStatus[edge.key]) ?? {
        stroke: PROTOCOL_STROKE[edge.signalType],
        opacity: 1,
        strokeWidth: 2,
      };
      const strokeColor = (style.stroke ?? PROTOCOL_STROKE[edge.signalType]) as string;
      return {
        id: edge.key,
        source: edge.publisherIed,
        target: edge.subscriberIed,
        data: edge,
        animated: edge.status !== 'resolved',
        style,
        markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
      };
    });
  }, [graphEdges, edges, lowDetailMode, diffDecorations]);

  const hasRenderableContainer = containerSize.width > 40 && containerSize.height > 40;

  const debugSnapshot = useMemo(
    () => ({
      graph: {
        visibleNodes: safeNodes.nodes.length,
        renderedEdges: renderedEdgeModels.length,
        renderedEdgesFinal: edgesForRender.length,
        totalEdgesInput: edges.length,
        lowDetailMode,
        layout,
        selectedIed,
        hadInvalidPositions: safeNodes.hadInvalidPositions,
      },
      container: containerSize,
      wrapperRect: wrapperRef.current?.getBoundingClientRect() || null,
      viewport: flow?.getViewport() || null,
      nodeDimensions: flow
        ? flow.getNodes().slice(0, 12).map((n) => ({
            id: n.id,
            x: n.position.x,
            y: n.position.y,
            width: n.width ?? null,
            height: n.height ?? null,
            hidden: Boolean(n.hidden),
          }))
        : [],
      filters: filtersSnapshot || null,
      nodeTypes: Object.keys(EMPTY_NODE_TYPES),
      edgeTypes: Object.keys(EMPTY_EDGE_TYPES),
    }),
    [
      safeNodes.nodes.length,
      renderedEdgeModels.length,
      edgesForRender.length,
      edges.length,
      lowDetailMode,
      layout,
      selectedIed,
      safeNodes.hadInvalidPositions,
      containerSize,
      flow,
      filtersSnapshot,
    ],
  );

  useEffect(() => {
    if (!flow || !hasRenderableContainer) {
      return;
    }
    const tryFit = (attempt = 0) => {
      const readyNodes = flow.getNodes().length;
      if (safeNodes.nodes.length > 0 && readyNodes === 0 && attempt < 8) {
        window.requestAnimationFrame(() => tryFit(attempt + 1));
        return;
      }
      void flow.fitView({ ...FIT_VIEW_OPTIONS, minZoom: 0.05, includeHiddenNodes: true });
      const currentVp = flow.getViewport();
      if (!Number.isFinite(currentVp.zoom) || currentVp.zoom <= 0.001) {
        flow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
      }
    };
    window.requestAnimationFrame(() => tryFit());
  }, [flow, fitToken, ieds.length, edges.length, safeNodes.nodes.length, hasRenderableContainer]);

  useEffect(() => {
    if (!flow || !hasRenderableContainer || safeNodes.nodes.length === 0) {
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      void flow.fitView({ ...FIT_VIEW_OPTIONS, minZoom: 0.05, includeHiddenNodes: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [flow, layout, safeNodes.nodes.length, edgesForRender.length, hasRenderableContainer]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
      if ((rect.width <= 40 || rect.height <= 40) && !missingSizeWarned.current) {
        missingSizeWarned.current = true;
        console.warn('[GraphCanvas] container size too small', { width: rect.width, height: rect.height });
      }
      if (rect.width > 40 && rect.height > 40) {
        missingSizeWarned.current = false;
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(() => update());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    setFlow(instance);
  }, []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id.startsWith('__bay:')) {
        return;
      }
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id.startsWith('__bay:')) {
        return;
      }
      const key = `${layout}:${node.id}`;
      setManualPositions((prev) => ({ ...prev, [key]: node.position }));
    },
    [layout],
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (edge.data) {
        onSelectEdge(edge.data as EdgeModel);
      }
    },
    [onSelectEdge],
  );

  const handleMove = useCallback<OnMove>((_event, vp) => {
    setViewport(vp);
  }, []);

  const handleComputeLayout = useCallback(() => {
    const prefix = `${layoutCacheKey || 'default'}::${layout}::`;
    for (const key of Array.from(layoutCacheRef.current.keys())) {
      if (key.startsWith(prefix)) {
        layoutCacheRef.current.delete(key);
      }
    }
    setLayoutNonce((n) => n + 1);
  }, [layoutCacheKey, layout]);

  const handleFitView = useCallback(() => {
    if (!flow) {
      return;
    }
    if (!hasRenderableContainer) {
      flow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
      return;
    }
    void flow.fitView({ ...FIT_VIEW_OPTIONS, minZoom: 0.05, includeHiddenNodes: true });
  }, [flow, hasRenderableContainer]);

  const handleToggleLock = useCallback(() => {
    setLockViewport((v) => !v);
  }, []);

  const handleDiagnostics = useCallback(() => {
    const payload = {
      ...debugSnapshot,
      timestamp: new Date().toISOString(),
    };
    (window as unknown as { __sclGraphDiagnostics?: unknown }).__sclGraphDiagnostics = payload;
    console.info('[GraphCanvas diagnostics]', payload);
  }, [debugSnapshot]);

  return (
    <section className="panel canvas-panel">
      <div className="canvas-toolbar">
        <div className="chip-group">
          <span className="chip">Focus: {focusIedId || 'none'}</span>
          <span className="chip">Nodes: {safeNodes.nodes.length}</span>
          <span className="chip">Edges rendered: {edgesForRender.length} / Total: {edges.length}</span>
          <span className="chip">LOD: {lowDetailMode ? 'ON' : 'OFF'} ({viewport.zoom.toFixed(2)})</span>
          {!showEdgeLabels ? <span className="chip">Edge labels: OFF</span> : <span className="chip">Edge labels: ON</span>}
          {lowDetailMode && graphEdges.length === 0 && edges.length > 0 ? <span className="chip">LOD fallback active</span> : null}
        </div>
        <div className="canvas-actions">
          <select className="input" value={layout} onChange={(e) => setLayout(e.target.value as LayoutMode)}>
            <option value="bay">Bay (from SCD)</option>
            <option value="radial">Radial</option>
            <option value="force">Force (stub)</option>
            <option value="hierarchy">Hierarchy</option>
            <option value="dagre-lr">Dagre (LR)</option>
            <option value="dagre-tb">Dagre (TB)</option>
          </select>
          <Button onClick={handleComputeLayout}>Compute layout</Button>
          <Button onClick={handleFitView}>Fit View</Button>
          <Button onClick={handleDiagnostics}>Diagnostics</Button>
          <Button variant={lockViewport ? 'primary' : 'default'} onClick={handleToggleLock}>
            {lockViewport ? 'Unlock View' : 'Lock View'}
          </Button>
        </div>
      </div>

      <div ref={wrapperRef} className="graph-canvas">
        {!hasRenderableContainer ? (
          <div className="graph-empty-state">
            <p className="hint">Canvas is not ready yet (container has no size).</p>
          </div>
        ) : safeNodes.nodes.length === 0 ? (
          <div className="graph-empty-state">
            <p className="hint">No visible nodes for current filters (or hidden by LOD).</p>
          </div>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={safeNodes.nodes}
              edges={edgesForRender}
              onInit={handleInit}
              onMove={handleMove}
              onNodeClick={handleNodeClick}
              onNodeDragStop={handleNodeDragStop}
              onEdgeClick={handleEdgeClick}
              nodeTypes={EMPTY_NODE_TYPES}
              edgeTypes={EMPTY_EDGE_TYPES}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              fitView
              fitViewOptions={{ ...FIT_VIEW_OPTIONS, minZoom: 0.05, includeHiddenNodes: true }}
              minZoom={0.01}
              maxZoom={2}
              zoomOnScroll={!lockViewport}
              panOnDrag={!lockViewport}
              panOnScroll={!lockViewport}
              zoomOnDoubleClick={!lockViewport}
              attributionPosition="bottom-left"
            >
              <Background gap={18} size={1} />
              <MiniMap position="bottom-right" zoomable pannable />
              <Controls />
            </ReactFlow>
            <div className="graph-legend" role="img" aria-label="Protocol legend: GOOSE red, SV orange, REPORT blue">
              <span className="graph-legend-item" style={{ ['--legend-color' as string]: PROTOCOL_STROKE.GOOSE }}>GOOSE</span>
              <span className="graph-legend-item" style={{ ['--legend-color' as string]: PROTOCOL_STROKE.SV }}>SV</span>
              <span className="graph-legend-item" style={{ ['--legend-color' as string]: PROTOCOL_STROKE.REPORT }}>REPORT</span>
            </div>
          </ReactFlowProvider>
        )}
      </div>
    </section>
  );
}

function buildNodes(input: {
  ieds: IedModel[];
  selectedEntityId: string;
  layout: LayoutMode;
  basePositions: Record<string, XYPosition>;
  manualPositions: Record<string, XYPosition>;
  diffDecorations?: DiffDecorations;
  lowDetail: boolean;
}): Node[] {
  const nodes: Node[] = [];

  if (input.layout === 'bay') {
    const bays = new Set<string>();
    for (const ied of input.ieds) {
      bays.add(ied.bayNames[0] || 'Unassigned');
    }
    for (const bay of bays) {
      const bayId = `__bay:${bay}`;
      const bayPos = input.basePositions[bayId] || { x: 0, y: 0 };
      nodes.push({
        id: bayId,
        position: bayPos,
        draggable: false,
        selectable: false,
        data: { label: `Bay: ${bay}` },
        style: {
          width: 220,
          textAlign: 'center',
          border: '1px dashed #b8c4cf',
          background: '#f7fafc',
          fontWeight: 600,
        },
      });
    }
  }

  for (const ied of input.ieds) {
    const base = input.basePositions[ied.name] || { x: 0, y: 0 };
    const manual = input.manualPositions[`${input.layout}:${ied.name}`];
    const label = ied.name;

    nodes.push({
      id: ied.name,
      position: manual || base,
      data: { label },
      style: nodeStyle(
        ied.name,
        input.selectedEntityId,
        input.diffDecorations?.nodeStatus[ied.name],
      ),
    });
  }

  return nodes;
}

function computeLayoutPositions(
  layout: LayoutMode,
  ieds: IedModel[],
  edges: EdgeModel[],
  focus: string,
): Record<string, XYPosition> {
  if (layout === 'hierarchy') {
    return hierarchyPositions(ieds, edges, focus);
  }
  if (layout === 'bay') {
    return bayPositions(ieds);
  }
  if (layout === 'dagre-lr' || layout === 'dagre-tb') {
    return dagreLikePositions(ieds, edges, focus, layout === 'dagre-lr' ? 'LR' : 'TB');
  }
  return radialPositions(ieds, edges, focus);
}

function bayPositions(ieds: IedModel[]): Record<string, XYPosition> {
  const buckets = new Map<string, IedModel[]>();
  for (const ied of ieds) {
    const bay = ied.bayNames[0] || 'Unassigned';
    if (!buckets.has(bay)) {
      buckets.set(bay, []);
    }
    buckets.get(bay)!.push(ied);
  }

  const bays = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b));
  const positions: Record<string, XYPosition> = {};
  bays.forEach((bay, bayIndex) => {
    const x = 160 + bayIndex * 280;
    positions[`__bay:${bay}`] = { x, y: 20 };
    const items = buckets.get(bay) || [];
    items.forEach((ied, idx) => {
      positions[ied.name] = { x, y: 90 + idx * 120 };
    });
  });

  return positions;
}

function radialPositions(ieds: IedModel[], edges: EdgeModel[], focus: string): Record<string, XYPosition> {
  const centerX = 560;
  const centerY = 320;
  const focusNeighbors = new Set<string>();

  for (const edge of edges) {
    if (edge.publisherIed === focus) {
      focusNeighbors.add(edge.subscriberIed);
    }
    if (edge.subscriberIed === focus) {
      focusNeighbors.add(edge.publisherIed);
    }
  }

  const near = ieds.filter((ied) => ied.name !== focus && focusNeighbors.has(ied.name));
  const far = ieds.filter((ied) => ied.name !== focus && !focusNeighbors.has(ied.name));

  const positions: Record<string, XYPosition> = {
    [focus]: { x: centerX, y: centerY },
  };

  near.forEach((ied, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(near.length, 1);
    positions[ied.name] = {
      x: centerX + Math.cos(angle) * 220,
      y: centerY + Math.sin(angle) * 220,
    };
  });

  far.forEach((ied, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(far.length, 1);
    positions[ied.name] = {
      x: centerX + Math.cos(angle) * 410,
      y: centerY + Math.sin(angle) * 410,
    };
  });

  return positions;
}

function hierarchyPositions(ieds: IedModel[], edges: EdgeModel[], focus: string): Record<string, XYPosition> {
  const levels = new Map<string, number>([[focus, 0]]);
  const queue = [focus];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const level = levels.get(current) || 0;

    for (const edge of edges) {
      if (edge.publisherIed !== current) {
        continue;
      }
      if (!levels.has(edge.subscriberIed)) {
        levels.set(edge.subscriberIed, level + 1);
        queue.push(edge.subscriberIed);
      }
    }
  }

  const buckets = new Map<number, string[]>();
  for (const ied of ieds) {
    const level = levels.get(ied.name) ?? 3;
    if (!buckets.has(level)) {
      buckets.set(level, []);
    }
    buckets.get(level)!.push(ied.name);
  }

  const positions: Record<string, XYPosition> = {};
  for (const [level, names] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    names.forEach((name, index) => {
      positions[name] = { x: 220 + level * 260, y: 120 + index * 130 };
    });
  }

  return positions;
}

function dagreLikePositions(
  ieds: IedModel[],
  edges: EdgeModel[],
  focus: string,
  direction: 'LR' | 'TB',
): Record<string, XYPosition> {
  const levels = new Map<string, number>([[focus, 0]]);
  const indegree = new Map<string, number>();
  const out = new Map<string, Set<string>>();

  for (const ied of ieds) {
    indegree.set(ied.name, 0);
    out.set(ied.name, new Set());
  }
  for (const edge of edges) {
    out.get(edge.publisherIed)?.add(edge.subscriberIed);
    indegree.set(edge.subscriberIed, (indegree.get(edge.subscriberIed) || 0) + 1);
  }

  const queue = [focus, ...ieds.filter((i) => i.name !== focus && (indegree.get(i.name) || 0) === 0).map((i) => i.name)];
  const seen = new Set<string>(queue);

  while (queue.length > 0) {
    const node = queue.shift()!;
    const level = levels.get(node) || 0;
    for (const next of out.get(node) || []) {
      const existing = levels.get(next);
      const targetLevel = level + 1;
      if (existing === undefined || existing < targetLevel) {
        levels.set(next, targetLevel);
      }
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  for (const ied of ieds) {
    if (!levels.has(ied.name)) {
      levels.set(ied.name, 0);
    }
  }

  const layer = new Map<number, string[]>();
  for (const ied of ieds) {
    const lvl = levels.get(ied.name) || 0;
    if (!layer.has(lvl)) {
      layer.set(lvl, []);
    }
    layer.get(lvl)!.push(ied.name);
  }

  const positions: Record<string, XYPosition> = {};
  const levelsSorted = Array.from(layer.entries()).sort((a, b) => a[0] - b[0]);
  for (const [lvl, names] of levelsSorted) {
    names.sort((a, b) => a.localeCompare(b));
    names.forEach((name, idx) => {
      positions[name] =
        direction === 'LR'
          ? { x: 180 + lvl * 280, y: 90 + idx * 120 }
          : { x: 180 + idx * 240, y: 90 + lvl * 150 };
    });
  }

  return positions;
}

function nodeStyle(
  iedName: string,
  selectedEntityId: string,
  diffState?: 'added' | 'modified' | 'removed',
): Node['style'] {
  const base: Node['style'] = {
    whiteSpace: 'pre-line',
    lineHeight: 1.2,
    minWidth: 158,
    padding: '8px 10px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
    color: '#10212d',
    boxShadow: '0 1px 4px rgba(16, 33, 45, 0.08)',
  };
  if (diffState === 'added') {
    return {
      ...base,
      border: '2px solid #b91c1c',
      background: '#fee2e2',
      color: '#7f1d1d',
    };
  }
  if (diffState === 'modified') {
    return {
      ...base,
      border: '2px solid #d97706',
      background: '#ffedd5',
      color: '#9a3412',
    };
  }
  if (diffState === 'removed') {
    return {
      ...base,
      border: '1px solid #94a3b8',
      background: '#e2e8f0',
      color: '#334155',
      textDecoration: 'line-through',
    };
  }
  return {
    ...base,
    border: selectedEntityId === `ied:${iedName}` ? '2px solid #0f74d1' : '1px solid #adc5dd',
    background: '#f7fbff',
  };
}

function edgeStyle(
  edge: EdgeModel,
  diffState?: 'added' | 'modified' | 'removed',
): Edge['style'] {
  if (diffState === 'added') {
    return { stroke: '#b91c1c', strokeWidth: 2.6, opacity: 1 };
  }
  if (diffState === 'modified') {
    return { stroke: '#d97706', strokeWidth: 2.4, opacity: 1 };
  }
  if (diffState === 'removed') {
    return { stroke: '#64748b', strokeWidth: 1.8, opacity: 0.8, strokeDasharray: '4 3' };
  }
  return {
    stroke: PROTOCOL_STROKE[edge.signalType],
    opacity: edge.status === 'unresolved' ? 0.65 : 1,
    strokeWidth: edge.status === 'resolved' ? 2.2 : 1.4,
  };
}
