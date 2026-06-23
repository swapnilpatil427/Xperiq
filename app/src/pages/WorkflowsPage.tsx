import { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useWorkflows } from '../hooks/useWorkflows';
import { useApi } from '../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import type { WorkflowTemplate } from '../lib/api';
import type { Workflow, WorkflowCondition, WorkflowAction } from '../types';
import { GRADIENTS } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { PageHeader } from '../components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const WORKFLOW_VISUALS = {
  w1: {
    badgeBg: 'rgba(180,19,64,0.1)',  badgeColor: '#b41340',
    iconGradient: GRADIENTS.primaryLight, iconBg: 'rgba(42,75,217,0.08)',
    conditionColor: '#b41340', actionColor: '#00647c',
  },
  w2: {
    badgeBg: 'rgba(131,41,200,0.1)', badgeColor: '#8329c8',
    iconGradient: GRADIENTS.purple,  iconBg: 'rgba(131,41,200,0.08)',
    conditionColor: '#8329c8',       actionColor: '#2a4bd9',
  },
  w3: {
    badgeBg: 'rgba(217,119,6,0.1)',  badgeColor: '#d97706',
    iconGradient: GRADIENTS.warning, iconBg: 'rgba(217,119,6,0.08)',
    conditionColor: '#b41340',       actionColor: '#059669',
  },
};

const DEFAULT_VISUALS = {
  badgeBg: 'rgba(42,75,217,0.1)', badgeColor: '#2a4bd9',
  iconGradient: GRADIENTS.primaryLight, iconBg: 'rgba(42,75,217,0.08)',
  conditionColor: '#2a4bd9',      actionColor: '#8329c8',
};

function getVisuals(wf: Workflow) {
  return (WORKFLOW_VISUALS as Record<string, typeof DEFAULT_VISUALS>)[wf.id] || DEFAULT_VISUALS;
}

function formatCondition(wf: Workflow): { field: string; operator: string; value: string } {
  const cond: WorkflowCondition = wf.condition;
  return {
    field:    cond.field    ?? '',
    operator: cond.operator ?? '=',
    value:    cond.value != null ? String(cond.value) : '',
  };
}

function formatAction(wf: Workflow): string {
  const act: WorkflowAction = wf.action;
  const { type, config } = act;
  if (type === 'email')  return `Send Email to ${(config?.to as string | undefined) || 'team'}`;
  if (type === 'tag')    return `Tag as ${(config?.tag as string | undefined) || 'beta-cohort'}`;
  if (type === 'notify') return `Notify ${(config?.team as string | undefined) || 'team'}`;
  return type ?? '';
}

export function WorkflowsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('workflows.pageTitle'), t('workflows.pageSubtitle'));
  const { workflows, loading, createWorkflow, toggleWorkflow, deleteWorkflow, reload } = useWorkflows();
  const navigate = useNavigate();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newConditionIdx, setNewConditionIdx] = useState(0);
  const [newActionIdx, setNewActionIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const CONDITION_OPTIONS = t('workflows.conditionOptions') as unknown as { label: string }[];
  const ACTION_OPTIONS    = t('workflows.actionOptions') as unknown as { label: string }[];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createWorkflow({
        name: newName.trim(),
        condition: { field: CONDITION_OPTIONS[newConditionIdx].label },
        action:    { type:  ACTION_OPTIONS[newActionIdx].label },
      });
      setShowNewModal(false);
      setNewName('');
      setNewConditionIdx(0);
      setNewActionIdx(0);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
        <div className="max-w-7xl mx-auto w-full">
          <PageHeader
            crumbs={[{ label: t('nav.workflows'), icon: 'account_tree', path: ROUTES.WORKFLOWS }]}
            title={t('workflows.mainHeading')}
            subtitle={t('workflows.mainDescription')}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => navigate(ROUTES.WORKFLOW_BUILD)}>
                  <Icon name="account_tree" size={16} className="mr-1.5" />
                  {t('workflows.buildVisually')}
                </Button>
                <Button variant="outline" onClick={() => navigate(ROUTES.WORKFLOW_CANVAS)}>
                  <Icon name="schema" size={16} className="mr-1.5" />
                  {t('workflows.buildOnCanvas')}
                </Button>
                <Button
                  onClick={() => setShowNewModal(true)}
                  className="flex items-center gap-2 font-bold text-sm text-white rounded-xl px-5 py-2.5"
                  style={{ background: '#2a4bd9' }}
                >
                  <Icon name="add" size={18} />
                  {t('workflows.newWorkflowButton')}
                </Button>
              </div>
            }
          />

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { labelKey: 'workflows.stats.active',        value: workflows.filter((w) => w.status === 'active').length, color: '#059669', bg: '#d1fae5' },
              { labelKey: 'workflows.stats.triggersToday', value: workflows.reduce((a, w) => a + (w.trigger_count || 0), 0), color: '#2a4bd9', bg: '#e0e7ff' },
              { labelKey: 'workflows.stats.paused',        value: workflows.filter((w) => w.status === 'paused').length, color: '#d97706', bg: '#fef3c7' },
            ].map((stat) => (
              <Card key={stat.labelKey} className="p-4 rounded-2xl bg-white border-0"
                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
                <p className="label-caps mb-1">{t(stat.labelKey)}</p>
                <p className="text-3xl font-black font-headline" style={{ color: stat.color }}>
                  {stat.value}
                </p>
              </Card>
            ))}
          </div>

          {/* Pending approvals */}
          <PendingApprovals />

          {/* Pre-built templates */}
          <WorkflowTemplates onUse={reload} />

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin border-primary" />
            </div>
          )}

          {/* Workflow cards */}
          {!loading && (
            <div className="flex flex-col gap-5">
              {workflows.map((wf) => {
                const visuals = getVisuals(wf);
                const cond = formatCondition(wf);
                const actionLabel = formatAction(wf);
                const triggers = wf.trigger_count ?? 0;
                const iconName = 'bolt';
                const badge = wf.name || 'Workflow';

                return (
                  <Card
                    key={wf.id}
                    className="group relative overflow-hidden rounded-2xl p-1 transition-all duration-500 bg-white border-0 hover:-translate-y-1"
                    style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 40px 60px -10px rgba(44,47,49,0.08)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.04)'; }}
                  >
                    <div
                      className="flex flex-col md:flex-row items-center gap-6 p-6 md:p-8 rounded-2xl"
                      style={{ background: wf.status === 'paused' ? '#f9fafb' : '#ffffff' }}
                    >
                      <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                        <div className="absolute inset-0 rounded-3xl transition-transform duration-500"
                          style={{ background: visuals.iconBg, transform: 'rotate(6deg)' }} />
                        <div className="absolute inset-0 rounded-3xl"
                          style={{ background: visuals.iconBg, transform: 'rotate(-3deg)' }} />
                        <div className="relative z-10 flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg"
                          style={{ background: visuals.iconGradient, opacity: wf.status === 'paused' ? 0.6 : 1 }}>
                          <Icon name={iconName} fill={1} size={28} className="text-white" />
                        </div>
                      </div>

                      <div className="flex-1 space-y-2 text-center md:text-left">
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                          <Badge
                            variant="secondary"
                            className="px-2 py-1 text-[10px] font-bold rounded uppercase tracking-tight"
                            style={{ background: visuals.badgeBg, color: visuals.badgeColor }}
                          >
                            {badge}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{triggers} triggers</span>
                          {wf.status === 'paused' && (
                            <Badge variant="paused">{t('common.paused')}</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xl font-black font-headline">
                          <span className="text-muted-foreground font-medium text-sm">{t('common.if')}</span>
                          <span className="text-primary">{cond.field}</span>
                          {cond.operator && <span className="text-on-surface-variant text-sm">{cond.operator}</span>}
                          <span style={{ color: visuals.conditionColor }}>{cond.value}</span>
                          <span className="text-muted-foreground font-medium text-sm">{t('common.then')}</span>
                          <span style={{ color: visuals.actionColor }}>{actionLabel}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toggleWorkflow(wf.id)}
                          className="flex items-center gap-1.5 px-4 py-2.5 font-bold text-xs rounded-xl active:scale-95 font-headline text-on-surface bg-surface-container"
                          style={{ boxShadow: '0 4px 0 #c7c4d7' }}
                        >
                          <Icon name={wf.status === 'active' ? 'pause_circle' : 'play_circle'} size={16} />
                          {wf.status === 'active' ? t('workflows.controls.pause') : t('workflows.controls.resume')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex items-center gap-1.5 px-4 py-2.5 font-bold text-xs rounded-xl active:scale-95 font-headline text-on-surface bg-surface-container"
                          style={{ boxShadow: '0 4px 0 #c7c4d7' }}
                        >
                          <Icon name="edit" size={16} />
                          {t('workflows.controls.edit')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => deleteWorkflow(wf.id)}
                          className="p-2.5 rounded-xl active:scale-95"
                          style={{ background: 'rgba(180,19,64,0.06)', boxShadow: '0 4px 0 rgba(180,19,64,0.1)' }}
                        >
                          <Icon name="delete" size={18} className="text-error" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!loading && workflows.length === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-surface-container-low">
                <Icon name="account_tree" size={32} className="text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2 font-headline text-on-surface">
                {t('workflows.empty.heading')}
              </h3>
              <p className="text-sm mb-6 text-on-surface-variant">
                {t('workflows.empty.description')}
              </p>
              <Button
                onClick={() => setShowNewModal(true)}
                variant="gradient"
                className="px-6 py-3 text-white font-bold text-sm transition-all active:scale-95 font-headline rounded-xl"
              >
                {t('workflows.empty.cta')}
              </Button>
            </div>
          )}
        </div>

      {/* New Workflow Modal */}
      <Dialog
        open={showNewModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewModal(false);
            setNewName('');
            setNewConditionIdx(0);
            setNewActionIdx(0);
          }
        }}
      >
        <DialogContent className="w-full max-w-lg p-8 rounded-2xl bg-white" style={{ boxShadow: '0 40px 80px -20px rgba(0,0,0,0.25)' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold tracking-tighter font-headline text-on-surface">
              {t('workflows.modal.heading')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest mb-2 block text-on-surface-variant">
                {t('workflows.modal.nameLabel')}
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('workflows.modal.namePlaceholder')}
                className="w-full px-4 py-3 rounded-[10px] text-sm font-medium bg-surface-container-low text-on-surface border-0 focus-visible:ring-2 focus-visible:ring-primary"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest mb-2 block text-on-surface-variant">
                {t('workflows.modal.conditionLabel')}
              </Label>
              <Select
                value={String(newConditionIdx)}
                onValueChange={(val) => setNewConditionIdx(Number(val))}
              >
                <SelectTrigger className="w-full px-4 py-3 rounded-[10px] text-sm font-medium bg-surface-container-low text-on-surface border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map((c, i) => (
                    <SelectItem key={i} value={String(i)}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest mb-2 block text-on-surface-variant">
                {t('workflows.modal.actionLabel')}
              </Label>
              <Select
                value={String(newActionIdx)}
                onValueChange={(val) => setNewActionIdx(Number(val))}
              >
                <SelectTrigger className="w-full px-4 py-3 rounded-[10px] text-sm font-medium bg-surface-container-low text-on-surface border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((a, i) => (
                    <SelectItem key={i} value={String(i)}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-low">
              <p className="label-caps mb-2">{t('workflows.modal.previewLabel')}</p>
              <p className="text-sm font-bold font-headline text-on-surface">
                <span className="text-muted-foreground">{t('common.if')} </span>
                <span className="text-primary">{CONDITION_OPTIONS[newConditionIdx].label}</span>
                <span className="text-muted-foreground"> {t('common.then')} </span>
                <span className="text-secondary">{ACTION_OPTIONS[newActionIdx].label}</span>
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-3 mt-2">
            <Button
              variant="secondary"
              onClick={() => setShowNewModal(false)}
              className="flex-1 py-3 font-bold text-sm rounded-xl font-headline bg-surface-container text-on-surface"
            >
              {t('workflows.modal.cancelButton')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || saving}
              className="flex-1 py-3 font-bold text-sm text-white rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 font-headline"
              style={{
                background: newName.trim() ? GRADIENTS.primaryLight : '#dfe3e6',
                color: newName.trim() ? '#ffffff' : '#9a9d9f',
                boxShadow: newName.trim() ? '0 10px 20px -5px rgba(42,75,217,0.3)' : 'none',
                cursor: newName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? (
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin border-white" />
              ) : (
                <>
                  <Icon name="bolt" size={16} />
                  {t('workflows.modal.createButton')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Workflows paused awaiting human approval (flow.approval step).
function PendingApprovals() {
  const { t } = useTranslation();
  const api = useApi();
  const [approvals, setApprovals] = useState<Array<{ id: string; execution_id: string; workflow_name: string; requested_at: string }>>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.listWorkflowApprovals().then(({ approvals }) => setApprovals(approvals)).catch(() => {});
  }, [api]);

  if (approvals.length === 0) return null;

  async function decide(execId: string, decision: 'approve' | 'reject') {
    setBusy(execId);
    try { await api.decideApproval(execId, decision); setApprovals((p) => p.filter((a) => a.execution_id !== execId)); }
    catch { /* ignore */ }
    finally { setBusy(null); }
  }

  return (
    <div className="mb-8">
      <p className="label-caps mb-3">{t('workflows.approvals.heading')}</p>
      <div className="flex flex-col gap-2">
        {approvals.map((a) => (
          <Card key={a.id} className="p-4 rounded-2xl bg-white border-0 flex items-center gap-3" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <Icon name="approval" size={20} className="text-warning" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-on-surface truncate">{a.workflow_name}</p>
              <p className="text-xs text-on-surface-variant">{t('workflows.approvals.waiting')}</p>
            </div>
            <Button variant="outline" size="sm" disabled={busy === a.execution_id} onClick={() => decide(a.execution_id, 'approve')}>
              {t('workflows.approvals.approve')}
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy === a.execution_id} onClick={() => decide(a.execution_id, 'reject')}>
              {t('workflows.approvals.reject')}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Pre-built workflow templates — one-click to add a draft workflow.
function WorkflowTemplates({ onUse }: { onUse: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [usingSlug, setUsingSlug] = useState<string | null>(null);

  useEffect(() => {
    api.listWorkflowTemplates().then(({ templates }) => setTemplates(templates)).catch(() => {});
  }, [api]);

  if (templates.length === 0) return null;

  async function use(tpl: WorkflowTemplate) {
    setUsingSlug(tpl.slug);
    try { await api.createWorkflowFromTemplate(tpl); onUse(); }
    catch { /* ignore */ }
    finally { setUsingSlug(null); }
  }

  return (
    <div className="mb-8">
      <p className="label-caps mb-3">{t('workflows.templatesHeading')}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((tpl) => (
          <Card key={tpl.slug} className="p-4 rounded-2xl bg-white border-0" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-on-surface">{tpl.name}</p>
              {tpl.is_featured && <Badge variant="purple" className="text-[10px]">{t('workflows.featured')}</Badge>}
            </div>
            <p className="text-sm text-on-surface-variant mt-1 mb-3">{tpl.description}</p>
            <Button variant="outline" size="sm" onClick={() => use(tpl)} disabled={usingSlug === tpl.slug}>
              <Icon name="add" size={14} className="mr-1" />
              {usingSlug === tpl.slug ? t('workflows.adding') : t('workflows.useTemplate')}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
