import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState,
  Handle, Position, type Node, type Edge, type Connection, type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { ROUTES } from '../constants/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { serializeCanvas, triggerTypeOf, type CanvasNodeData } from '../lib/workflowCanvas';

interface Trigger { type: string; label: string; category: string }
interface ActionDef { action: string; label: string; category: string; live: boolean | string }

// Free-form branching workflow canvas. Drag nodes, connect them, and fan a
// condition out into true/false branches — the engine runs these in graph mode.
export function WorkflowCanvasPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('workflows.canvas.title'));
  const api = useApi();
  const navigate = useNavigate();

  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [actionDefs, setActionDefs] = useState<ActionDef[]>([]);
  const [operators, setOperators] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Patch a node's data field (used by the inline selects inside each node).
  const patchNode = useCallback((id: string, patch: Partial<CanvasNodeData>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, [setNodes]);

  useEffect(() => {
    api.getWorkflowRegistry().then((r) => {
      const trs = r.triggers as Trigger[];
      setTriggers(trs);
      setActionDefs(r.actions as ActionDef[]);
      setOperators(r.conditionOperators);
      // Seed a trigger node so the canvas isn't empty.
      setNodes([{
        id: 'trigger', type: 'wfTrigger', position: { x: 80, y: 160 },
        data: { kind: 'trigger', triggerType: trs[0]?.type, options: trs, patch: patchNode },
      } as Node<CanvasNodeData>]);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const onConnect = useCallback((c: Connection) => {
    // Edges leaving a condition's true/false handle carry that branch label.
    const branch = c.sourceHandle === 'true' || c.sourceHandle === 'false' ? c.sourceHandle : undefined;
    setEdges((es) => addEdge({
      ...c, animated: true,
      label: branch, data: branch ? { branch } : undefined,
      style: branch === 'false' ? { stroke: '#ef4444' } : branch === 'true' ? { stroke: '#059669' } : undefined,
    }, es));
  }, [setEdges]);

  let seq = nodes.length;
  const addCondition = () => setNodes((ns) => [...ns, {
    id: `cond_${seq++}`, type: 'wfCondition', position: { x: 360, y: 80 + ns.length * 30 },
    data: { kind: 'condition', field: 'nps', op: 'lte', value: '6', options: operators, patch: patchNode },
  } as Node<CanvasNodeData>]);

  const addAction = () => setNodes((ns) => [...ns, {
    id: `action_${seq++}`, type: 'wfAction', position: { x: 660, y: 80 + ns.length * 30 },
    data: { kind: 'action', action: actionDefs[0]?.action || 'notify.in_app', options: actionDefs, patch: patchNode },
  } as Node<CanvasNodeData>]);

  async function save() {
    const triggerType = triggerTypeOf(nodes as Node<CanvasNodeData>[]);
    if (!name.trim() || !triggerType || nodes.filter((n) => n.data.kind === 'action').length === 0) {
      setError(t('workflows.builder.incomplete'));
      return;
    }
    setSaving(true); setError(null);
    const serialized = serializeCanvas(nodes as Node<CanvasNodeData>[], edges as Edge[]);
    try {
      await api.createGraphWorkflow({ name, triggerType, nodes: serialized.nodes, edges: serialized.edges, status: 'draft' });
      navigate(ROUTES.WORKFLOWS);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workflows.builder.saveError'));
    } finally { setSaving(false); }
  }

  const nodeTypes = useMemo(() => ({ wfTrigger: TriggerNode, wfCondition: ConditionNode, wfAction: ActionNode }), []);

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.workflows'), path: ROUTES.WORKFLOWS }, { label: t('workflows.canvas.title') }]}
        title={t('workflows.canvas.title')}
        subtitle={t('workflows.canvas.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('workflows.builder.namePlaceholder')} className="w-56" />
            <Button variant="outline" onClick={addCondition}><Icon name="filter_alt" size={14} className="mr-1" />{t('workflows.canvas.addCondition')}</Button>
            <Button variant="outline" onClick={addAction}><Icon name="play_arrow" size={14} className="mr-1" />{t('workflows.canvas.addAction')}</Button>
            <Button onClick={save} disabled={saving}>{saving ? t('common.saving') : t('workflows.builder.save')}</Button>
          </div>
        }
      />
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <div style={{ height: '70vh' }} className="rounded-2xl border border-border overflow-hidden bg-surface-variant/20">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={nodeTypes} fitView
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

// ── Custom nodes ────────────────────────────────────────────────────────────────
const SHELL = 'rounded-xl bg-white shadow-md border border-border px-3 py-2 text-sm min-w-[180px]';

function TriggerNode({ id, data }: NodeProps<CanvasNodeData & { options?: Trigger[]; patch?: (id: string, p: Partial<CanvasNodeData>) => void }>) {
  const { t } = useTranslation();
  return (
    <div className={SHELL} style={{ borderTop: '3px solid #2a4bd9' }}>
      <div className="flex items-center gap-1.5 mb-1 font-semibold text-on-surface"><Icon name="bolt" size={14} className="text-primary" />{t('workflows.canvas.trigger')}</div>
      <select className="w-full text-xs border border-border rounded px-1.5 py-1 bg-transparent" value={data.triggerType}
        onChange={(e) => data.patch?.(id, { triggerType: e.target.value })}>
        {(data.options || []).map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}
      </select>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConditionNode({ id, data }: NodeProps<CanvasNodeData & { options?: string[]; patch?: (id: string, p: Partial<CanvasNodeData>) => void }>) {
  const { t } = useTranslation();
  return (
    <div className={SHELL} style={{ borderTop: '3px solid #d97706' }}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1.5 mb-1 font-semibold text-on-surface"><Icon name="filter_alt" size={14} className="text-warning" />{t('workflows.canvas.condition')}</div>
      <div className="flex items-center gap-1">
        <Input className="h-7 text-xs flex-1" value={data.field || ''} onChange={(e) => data.patch?.(id, { field: e.target.value })} />
        <select className="text-xs border border-border rounded px-1 py-1 bg-transparent" value={data.op}
          onChange={(e) => data.patch?.(id, { op: e.target.value })}>
          {(data.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <Input className="h-7 text-xs w-12" value={data.value || ''} onChange={(e) => data.patch?.(id, { value: e.target.value })} />
      </div>
      <div className="flex justify-between text-[10px] mt-1.5"><span className="text-success">{t('workflows.canvas.true')}</span><span className="text-destructive">{t('workflows.canvas.false')}</span></div>
      <Handle id="true" type="source" position={Position.Bottom} style={{ left: '25%', background: '#059669' }} />
      <Handle id="false" type="source" position={Position.Bottom} style={{ left: '75%', background: '#ef4444' }} />
    </div>
  );
}

function ActionNode({ id, data }: NodeProps<CanvasNodeData & { options?: ActionDef[]; patch?: (id: string, p: Partial<CanvasNodeData>) => void }>) {
  const { t } = useTranslation();
  return (
    <div className={SHELL} style={{ borderTop: '3px solid #059669' }}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1.5 mb-1 font-semibold text-on-surface"><Icon name="play_arrow" size={14} className="text-success" />{t('workflows.canvas.action')}</div>
      <select className="w-full text-xs border border-border rounded px-1.5 py-1 bg-transparent" value={data.action}
        onChange={(e) => data.patch?.(id, { action: e.target.value })}>
        {(data.options || []).map((o) => <option key={o.action} value={o.action}>{o.label}{o.live === true ? '' : o.live === 'env' ? ' ⚙' : ' (stub)'}</option>)}
      </select>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
