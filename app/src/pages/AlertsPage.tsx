import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useApi } from '../hooks/useApi';
import { useAlerts } from '../hooks/useAlerts';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { AlertSeverity, AlertTypeDef } from '../lib/api';

const SEVERITY_VARIANT: Record<AlertSeverity, 'destructive' | 'warning' | 'default' | 'success'> = {
  critical: 'destructive', warning: 'warning', info: 'default', success: 'success',
};

export function AlertsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('alerts.pageTitle'), t('alerts.pageSubtitle'));
  const { events, rules, loading, error, act, createRule, deleteRule } = useAlerts();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        title={t('alerts.pageTitle')}
        subtitle={t('alerts.pageSubtitle')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Icon name="add" size={16} className="mr-1.5" />{t('alerts.createRule')}
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>
      )}

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">{t('alerts.tabEvents')} {events.length ? `(${events.length})` : ''}</TabsTrigger>
          <TabsTrigger value="rules">{t('alerts.tabRules')}</TabsTrigger>
          <TabsTrigger value="subs">{t('alerts.tabSubscriptions')}</TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          {loading ? (
            <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-border p-10 text-center text-on-surface-variant">
              <Icon name="notifications_active" size={32} className="mx-auto mb-3 opacity-50" />
              {t('alerts.noActive')}
            </div>
          ) : (
            <motion.div className="space-y-3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              {events.map((e) => (
                <Card key={e.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge variant={SEVERITY_VARIANT[e.severity]} className="mt-0.5 capitalize">{e.severity}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-on-surface">{e.title}</p>
                      <p className="text-sm text-on-surface-variant mt-0.5">{e.crystalNarration || e.description}</p>
                      <p className="text-xs text-on-surface-variant/70 mt-1">
                        {e.alertType} · {new Date(e.triggeredAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => act(e.id, 'acknowledge')}>{t('alerts.acknowledge')}</Button>
                      <Button variant="ghost" size="sm" onClick={() => act(e.id, 'snooze', 24)}>{t('alerts.snooze')}</Button>
                      <Button variant="ghost" size="sm" onClick={() => act(e.id, 'resolve')}>{t('alerts.resolve')}</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </motion.div>
          )}
        </TabsContent>

        <TabsContent value="rules">
          {rules.length === 0 ? (
            <div className="rounded-xl border border-border p-10 text-center text-on-surface-variant">{t('alerts.noRules')}</div>
          ) : (
            <div className="rounded-xl border border-border divide-y divide-border">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Badge variant={SEVERITY_VARIANT[r.severity]} className="capitalize">{r.severity}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-on-surface">{r.name}</p>
                    <p className="text-xs text-on-surface-variant">{r.alertType}{r.surveyId ? '' : ` · ${t('alerts.orgWide')}`}</p>
                  </div>
                  {!r.isActive && <Badge variant="neutral">{t('alerts.inactive')}</Badge>}
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteRule(r.id)}>
                    <Icon name="delete" size={15} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="subs">
          <SubscriptionsTab />
        </TabsContent>
      </Tabs>

      <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createRule} />
    </div>
  );
}

function CreateRuleDialog({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (data: { alertType: string; name: string; severity: AlertSeverity; thresholdConfig: Record<string, unknown> }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [types, setTypes] = useState<AlertTypeDef[]>([]);
  const [alertType, setAlertType] = useState('S-01');
  const [name, setName] = useState('');
  const [severity, setSeverity] = useState<AlertSeverity>('critical');
  const [minDrop, setMinDrop] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.listAlertTypes().then(({ types }) => setTypes(types)).catch(() => {});
  }, [open, api]);

  const selected = types.find((ty) => ty.code === alertType);
  // Group catalog by category for the picker; live-evaluator types first.
  const grouped = types.reduce<Record<string, AlertTypeDef[]>>((acc, ty) => {
    (acc[ty.categoryName] = acc[ty.categoryName] || []).push(ty);
    return acc;
  }, {});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const thresholdConfig = alertType === 'S-01'
        ? { minDrop: Number(minDrop), windowDays: 7 }
        : (selected?.thresholds || {});
      await onCreate({ alertType, name: name || selected?.name || alertType, severity, thresholdConfig });
      setName('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('alerts.createError'));
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t('alerts.createRule')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="alert-type">{t('alerts.typeLabel')}</Label>
            <Select value={alertType} onValueChange={(v) => { setAlertType(v); const s = types.find((ty) => ty.code === v); if (s) setSeverity(s.severity); }}>
              <SelectTrigger id="alert-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(grouped).map(([cat, list]) => (
                  list.map((ty) => (
                    <SelectItem key={ty.code} value={ty.code}>
                      {ty.code} · {ty.name}{ty.evaluator === true ? '' : ' (planned)'}
                    </SelectItem>
                  ))
                ))}
              </SelectContent>
            </Select>
            {selected && <p className="text-xs text-on-surface-variant">{selected.categoryName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alert-name">{t('alerts.nameLabel')}</Label>
            <Input id="alert-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={selected?.name || t('alerts.namePlaceholder')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alert-sev">{t('alerts.severityLabel')}</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as AlertSeverity)}>
                <SelectTrigger id="alert-sev"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['critical', 'warning', 'info', 'success'] as AlertSeverity[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {alertType === 'S-01' && (
              <div className="space-y-1.5">
                <Label htmlFor="alert-mindrop">{t('alerts.minDropLabel')}</Label>
                <Input id="alert-mindrop" type="number" value={minDrop} onChange={(e) => setMinDrop(e.target.value)} />
              </div>
            )}
          </div>
          {selected && selected.evaluator !== true && (
            <p className="text-xs text-warning flex items-center gap-1.5">
              <Icon name="info" size={13} />{t('alerts.plannedNote')}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={submitting}>{submitting ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionsTab() {
  const { t } = useTranslation();
  const api = useApi();
  const [types, setTypes] = useState<AlertTypeDef[]>([]);
  const [subs, setSubs] = useState<Record<string, { inApp: boolean; email: boolean; slack: boolean }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listAlertTypes(), api.getAlertSubscriptions()])
      .then(([{ types }, { subscriptions }]) => {
        setTypes(types);
        const map: Record<string, { inApp: boolean; email: boolean; slack: boolean }> = {};
        for (const s of subscriptions) map[s.alertType] = { inApp: s.inAppEnabled, email: s.emailEnabled, slack: s.slackEnabled };
        setSubs(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api]);

  function toggle(code: string, channel: 'inApp' | 'email' | 'slack', value: boolean) {
    const cur = subs[code] || { inApp: true, email: false, slack: false };
    const next = { ...cur, [channel]: value };
    setSubs((p) => ({ ...p, [code]: next }));
    api.updateAlertSubscription({
      alertType: code, inAppEnabled: next.inApp, emailEnabled: next.email, slackEnabled: next.slack,
    }).catch(() => {});
  }

  if (loading) return <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-5 py-3 border-b border-border text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
        <span>{t('alerts.subType')}</span>
        <span className="w-14 text-center">{t('alerts.inApp')}</span>
        <span className="w-14 text-center">{t('alerts.email')}</span>
        <span className="w-14 text-center">{t('alerts.slack')}</span>
      </div>
      {types.map((ty) => {
        const s = subs[ty.code] || { inApp: true, email: false, slack: false };
        return (
          <div key={ty.code} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-5 py-2.5 border-b border-border/60 items-center">
            <span className="text-sm text-on-surface truncate">{ty.code} · {ty.name}</span>
            <div className="w-14 flex justify-center"><Switch checked={s.inApp} onCheckedChange={(v) => toggle(ty.code, 'inApp', v)} /></div>
            <div className="w-14 flex justify-center"><Switch checked={s.email} onCheckedChange={(v) => toggle(ty.code, 'email', v)} /></div>
            <div className="w-14 flex justify-center"><Switch checked={s.slack} onCheckedChange={(v) => toggle(ty.code, 'slack', v)} /></div>
          </div>
        );
      })}
    </Card>
  );
}
