import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { usePermissions } from '../../lib/permissions';
import { useGroups } from '../../hooks/useGroups';
import { PageHeader } from '../../components/PageHeader';
import { SettingsUsersNav } from '../../components/SettingsUsersNav';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { GroupType, DynamicRule, DynamicRuleSet } from '../../lib/api';

const GROUP_TYPE_VARIANT: Record<GroupType, 'default' | 'purple' | 'secondary'> = {
  static: 'default', dynamic: 'purple', scim_synced: 'secondary',
};
const RULE_FIELDS = ['department_name', 'job_title', 'location', 'cost_center', 'is_active'];
const RULE_OPS = ['eq', 'neq', 'contains', 'starts_with', 'in', 'not_in'];

export function GroupsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('settings.groups.pageTitle'), t('settings.groups.pageSubtitle'));
  const { isAdmin } = usePermissions();
  const { groups, loading, error, createGroup, deleteGroup } = useGroups();
  const [createOpen, setCreateOpen] = useState(false);

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader title={t('settings.groups.pageTitle')} />
        <div className="rounded-xl border border-border p-8 text-center text-on-surface-variant">
          <Icon name="lock" size={32} className="mx-auto mb-3 opacity-50" />
          {t('settings.userDirectory.accessDenied')}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.settings'), path: ROUTES.SETTINGS }, { label: t('settings.groups.pageTitle') }]}
        title={t('settings.groups.pageTitle')}
        subtitle={t('settings.groups.pageSubtitle')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Icon name="add" size={16} className="mr-1.5" />
            {t('settings.groups.createButton')}
          </Button>
        }
      />
      <SettingsUsersNav />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center text-on-surface-variant">
          {t('settings.groups.empty')}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {groups.map((g) => (
            <Card key={g.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-on-surface truncate">{g.name}</h3>
                  {g.description && <p className="text-sm text-on-surface-variant mt-0.5 truncate">{g.description}</p>}
                </div>
                <Badge variant={GROUP_TYPE_VARIANT[g.groupType]}>{t(`settings.groups.types.${g.groupType}`)}</Badge>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-on-surface-variant">
                  {t('settings.groups.memberCount', { count: g.memberCount })}
                </span>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                  onClick={() => deleteGroup(g.id)}>
                  <Icon name="delete" size={15} />
                </Button>
              </div>
            </Card>
          ))}
        </motion.div>
      )}

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createGroup} />
    </div>
  );
}

function CreateGroupDialog({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (data: { name: string; description?: string | null; groupType: GroupType; dynamicRules?: DynamicRuleSet }) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [groupType, setGroupType] = useState<GroupType>('static');
  const [rules, setRules] = useState<DynamicRule[]>([{ field: 'department_name', op: 'contains', value: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRule(i: number, patch: Partial<DynamicRule>) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      await onCreate({
        name,
        groupType,
        dynamicRules: groupType === 'dynamic'
          ? { operator: 'AND', rules: rules.filter((r) => r.value !== '') }
          : undefined,
      });
      setName(''); setGroupType('static'); setRules([{ field: 'department_name', op: 'contains', value: '' }]);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.groups.createError'));
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('settings.groups.createTitle')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">{t('settings.groups.nameLabel')}</Label>
            <Input id="group-name" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.groups.namePlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-type">{t('settings.groups.typeLabel')}</Label>
            <Select value={groupType} onValueChange={(v) => setGroupType(v as GroupType)}>
              <SelectTrigger id="group-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="static">{t('settings.groups.types.static')}</SelectItem>
                <SelectItem value="dynamic">{t('settings.groups.types.dynamic')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {groupType === 'dynamic' && (
            <div className="space-y-2">
              <Label>{t('settings.groups.rulesLabel')}</Label>
              {rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={rule.field} onValueChange={(v) => updateRule(i, { field: v })}>
                    <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RULE_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={rule.op} onValueChange={(v) => updateRule(i, { op: v })}>
                    <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RULE_OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="flex-1 h-9" value={String(rule.value ?? '')}
                    onChange={(e) => updateRule(i, { value: e.target.value })}
                    placeholder={t('settings.groups.valuePlaceholder')} />
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm"
                onClick={() => setRules((p) => [...p, { field: 'department_name', op: 'contains', value: '' }])}>
                <Icon name="add" size={14} className="mr-1" />{t('settings.groups.addRule')}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={submitting || !name}>{submitting ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
