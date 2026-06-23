// Pure helpers that translate the reactflow canvas (nodes + edges) into the
// engine's workflow graph format. Kept separate from the page so the
// serialization — the part that must be correct — is unit-testable without
// rendering reactflow in jsdom.
import type { Node, Edge } from 'reactflow';

export interface CanvasNodeData {
  kind: 'trigger' | 'condition' | 'action';
  triggerType?: string;
  action?: string;
  field?: string;
  op?: string;
  value?: string;
  [k: string]: unknown;
}

export interface EngineNode {
  id: string;
  type: string;
  trigger?: string;
  action?: string;
  config?: Record<string, unknown>;
  conditions?: { operator: string; rules: Array<{ field?: string; op?: string; value: unknown }> };
}

export interface EngineEdge {
  from: string;
  to: string;
  branch?: 'true' | 'false';
}

// Numbers stay numbers so engine comparisons (gte/lte/between) work.
function coerce(v: unknown): unknown {
  if (v == null || v === '') return v;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

// A condition node's outgoing edge is labeled by the source handle it leaves from.
function branchOf(edge: Edge): 'true' | 'false' | undefined {
  const fromData = (edge.data as { branch?: string } | undefined)?.branch;
  const handle = edge.sourceHandle;
  const b = fromData || handle;
  return b === 'true' || b === 'false' ? b : undefined;
}

export function serializeCanvas(nodes: Node<CanvasNodeData>[], edges: Edge[]): { nodes: EngineNode[]; edges: EngineEdge[] } {
  const engineNodes: EngineNode[] = nodes.map((n) => {
    const d = n.data;
    if (d.kind === 'trigger') return { id: n.id, type: 'trigger', trigger: d.triggerType };
    if (d.kind === 'condition') {
      return { id: n.id, type: 'condition', conditions: { operator: 'AND', rules: [{ field: d.field, op: d.op, value: coerce(d.value) }] } };
    }
    return { id: n.id, type: 'action', action: d.action, config: {} };
  });

  const engineEdges: EngineEdge[] = edges.map((e) => {
    const branch = branchOf(e);
    return branch ? { from: e.source, to: e.target, branch } : { from: e.source, to: e.target };
  });

  return { nodes: engineNodes, edges: engineEdges };
}

// The trigger type drives the workflow's `trigger_type` column (which trigger bus
// it subscribes to). Falls back to the first node's trigger if unlabeled.
export function triggerTypeOf(nodes: Node<CanvasNodeData>[]): string | undefined {
  const trigger = nodes.find((n) => n.data.kind === 'trigger');
  return trigger?.data.triggerType;
}

// Whether the graph has at least one branch — i.e. the engine will run it in graph mode.
export function hasBranches(edges: Edge[]): boolean {
  return edges.some((e) => branchOf(e) != null);
}
