import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { ROUTES } from '../constants/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface Trigger { type: string; label: string; category: string }
interface ActionDef { action: string; label: string; category: string; live: boolean | string }
interface Rule { field: string; op: string; value: string }
interface ActionNode { action: string }

// A linear node sequence: trigger → conditions → ordered actions. Matches the
// engine's linear execution model. (Free-form branching canvas is a later add.)
export function WorkflowBuilderPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('workflows.builder.title'));
  const api = useApi();
  const navigate = useNavigate();

  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [actionDefs, setActionDefs] = useState<ActionDef[]>([]);
  const [operators, setOperators] = useState<string[]>([]);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [actions, setActions] = useState<ActionNode[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkflowRegistry().then((r) => {
      setTriggers(r.triggers as Trigger[]);
      setActionDefs(r.actions as ActionDef[]);
      setOperators(r.conditionOperators);
      if (!triggerType && (r.triggers as Trigger[])[0]) setTriggerType((r.triggers as Trigger[])[0].type);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function save() {
    if (!name.trim() || !triggerType || actions.length === 0) {
      setError(t('workflows.builder.incomplete'));
      return;
    }
    setSaving(true); setError(null);
    const nodes = [
      { id: 'trigger', type: 'trigger', trigger: triggerType },
      ...(rules.length ? [{ id: 'cond', type: 'condition', conditions: { operator: 'AND', rules: rules.filter((r) => r.field && r.value) } }] : []),
      ...actions.map((a, i) => ({ id: `action_${i}`, type: 'action', action: a.action, config: {} })),
    ];
    const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
    try {
      await api.createGraphWorkflow({ name, triggerType, nodes, edges, status: 'draft' });
      navigate(ROUTES.WORKFLOWS);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workflows.builder.saveError'));
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.workflows'), path: ROUTES.WORKFLOWS }, { label: t('workflows.builder.title') }]}
        title={t('workflows.builder.title')}
        subtitle={t('workflows.builder.subtitle')}
        actions={<Button onClick={save} disabled={saving}>{saving ? t('common.saving') : t('workflows.builder.save')}</Button>}
      />

      <motion.div className="space-y-4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>

        <Card className="p-5 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wf-name">{t('workflows.builder.nameLabel')}</Label>
            <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('workflows.builder.namePlaceholder')} />
          </div>
        </Card>

        {/* Trigger node */}
        <NodeCard step={1} color="#2a4bd9" icon="bolt" title={t('workflows.builder.whenTrigger')}>
          <Select value={triggerType} onValueChange={setTriggerType}>
            <SelectTrigger><SelectValue placeholder={t('workflows.builder.pickTrigger')} /></SelectTrigger>
            <SelectContent>
              {triggers.map((tr) => <SelectItem key={tr.type} value={tr.type}>{tr.category} · {tr.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </NodeCard>

        {/* Condition node */}
        <NodeCard step={2} color="#d97706" icon="filter_alt" title={t('workflows.builder.ifConditions')}>
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <Input className="flex-1" placeholder="field (e.g. nps)" value={r.field} onChange={(e) => setRules((p) => p.map((x, idx) => idx === i ? { ...x, field: e.target.value } : x))} />
              <Select value={r.op} onValueChange={(v) => setRules((p) => p.map((x, idx) => idx === i ? { ...x, op: v } : x))}>
                <SelectTrigger className="w-28"><SelectValue placeholder="op" /></SelectTrigger>
                <SelectContent>{operators.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="flex-1" placeholder="value" value={r.value} onChange={(e) => setRules((p) => p.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))} />
              <Button variant="ghost" size="sm" onClick={() => setRules((p) => p.filter((_, idx) => idx !== i))}><Icon name="close" size={14} /></Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setRules((p) => [...p, { field: 'nps', op: 'lte', value: '6' }])}>
            <Icon name="add" size={14} className="mr-1" />{t('workflows.builder.addCondition')}
          </Button>
        </NodeCard>

        {/* Action nodes */}
        <NodeCard step={3} color="#059669" icon="play_arrow" title={t('workflows.builder.thenActions')}>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <Badge variant="success" className="text-[10px]">{i + 1}</Badge>
              <Select value={a.action} onValueChange={(v) => setActions((p) => p.map((x, idx) => idx === i ? { action: v } : x))}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {actionDefs.map((ad) => <SelectItem key={ad.action} value={ad.action}>{ad.label}{ad.live === true ? '' : ' (stub)'}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setActions((p) => p.filter((_, idx) => idx !== i))}><Icon name="close" size={14} /></Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setActions((p) => [...p, { action: actionDefs[0]?.action || 'notify.in_app' }])}>
            <Icon name="add" size={14} className="mr-1" />{t('workflows.builder.addAction')}
          </Button>
        </NodeCard>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </motion.div>
    </div>
  );
}

function NodeCard({ step, color, icon, title, children }: {
  step: number; color: string; icon: string; title: string; children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: color }}>
          <Icon name={icon} size={16} />
        </span>
        <span className="text-xs font-bold text-on-surface-variant">{step}</span>
        <h3 className="font-semibold text-on-surface">{title}</h3>
      </div>
      {children}
    </Card>
  );
}
