import { describe, it, expect } from 'vitest';
import { serializeCanvas, triggerTypeOf, hasBranches } from '../../lib/workflowCanvas';
import type { Node, Edge } from 'reactflow';
import type { CanvasNodeData } from '../../lib/workflowCanvas';

const nodes: Node<CanvasNodeData>[] = [
  { id: 'trigger', type: 'wfTrigger', position: { x: 0, y: 0 }, data: { kind: 'trigger', triggerType: 'survey.response_filtered' } },
  { id: 'cond_1', type: 'wfCondition', position: { x: 0, y: 0 }, data: { kind: 'condition', field: 'nps', op: 'lte', value: '6' } },
  { id: 'action_2', type: 'wfAction', position: { x: 0, y: 0 }, data: { kind: 'action', action: 'notify.slack' } },
  { id: 'action_3', type: 'wfAction', position: { x: 0, y: 0 }, data: { kind: 'action', action: 'notify.in_app' } },
];

const edges: Edge[] = [
  { id: 'e1', source: 'trigger', target: 'cond_1' },
  { id: 'e2', source: 'cond_1', target: 'action_2', sourceHandle: 'true', data: { branch: 'true' } },
  { id: 'e3', source: 'cond_1', target: 'action_3', sourceHandle: 'false', data: { branch: 'false' } },
];

describe('serializeCanvas', () => {
  it('maps canvas nodes to the engine node format', () => {
    const { nodes: out } = serializeCanvas(nodes, edges);
    expect(out[0]).toEqual({ id: 'trigger', type: 'trigger', trigger: 'survey.response_filtered' });
    expect(out[1]).toEqual({ id: 'cond_1', type: 'condition', conditions: { operator: 'AND', rules: [{ field: 'nps', op: 'lte', value: 6 }] } });
    expect(out[2]).toEqual({ id: 'action_2', type: 'action', action: 'notify.slack', config: {} });
  });

  it('coerces numeric condition values but leaves strings alone', () => {
    const strNodes: Node<CanvasNodeData>[] = [
      { id: 'c', type: 'wfCondition', position: { x: 0, y: 0 }, data: { kind: 'condition', field: 'sentiment', op: 'eq', value: 'negative' } },
    ];
    const { nodes: out } = serializeCanvas(strNodes, []);
    expect(out[0].conditions?.rules[0].value).toBe('negative');
  });

  it('labels condition branches on the edges', () => {
    const { edges: out } = serializeCanvas(nodes, edges);
    expect(out).toContainEqual({ from: 'trigger', to: 'cond_1' });
    expect(out).toContainEqual({ from: 'cond_1', to: 'action_2', branch: 'true' });
    expect(out).toContainEqual({ from: 'cond_1', to: 'action_3', branch: 'false' });
  });

  it('derives branch from sourceHandle when edge data is absent', () => {
    const { edges: out } = serializeCanvas(nodes, [
      { id: 'x', source: 'cond_1', target: 'action_2', sourceHandle: 'true' },
    ]);
    expect(out[0]).toEqual({ from: 'cond_1', to: 'action_2', branch: 'true' });
  });

  it('triggerTypeOf finds the trigger node type, hasBranches detects branching', () => {
    expect(triggerTypeOf(nodes)).toBe('survey.response_filtered');
    expect(hasBranches(edges)).toBe(true);
    expect(hasBranches([{ id: 'e', source: 'a', target: 'b' }])).toBe(false);
  });
});
