import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useApi } from '../../hooks/useApi';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import type { NotificationPreference } from '../../lib/api';

// The notification types we expose toggles for (subset of the full taxonomy).
const TYPES: Array<{ type: string; group: string }> = [
  { type: 'survey.milestone', group: 'survey' },
  { type: 'survey.expiring_critical', group: 'survey' },
  { type: 'survey.quota_reached', group: 'survey' },
  { type: 'score.nps_drop', group: 'score' },
  { type: 'score.nps_rise', group: 'score' },
  { type: 'score.csat_drop', group: 'score' },
  { type: 'crystal.insight_ready', group: 'crystal' },
  { type: 'crystal.anomaly_detected', group: 'crystal' },
  { type: 'crystal.prediction_alert', group: 'crystal' },
  { type: 'system.pipeline_error', group: 'system' },
  { type: 'system.credits_low', group: 'system' },
];

type PrefMap = Record<string, NotificationPreference>;

function defaultPref(type: string): NotificationPreference {
  return { notificationType: type, inAppEnabled: true, emailEnabled: false, slackEnabled: false };
}

export function NotificationPreferencesPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('notificationPrefs.pageTitle'), t('notificationPrefs.pageSubtitle'));
  const api = useApi();
  const [prefs, setPrefs] = useState<PrefMap>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [digest, setDigest] = useState<{ total: number; byPriority: Record<string, number> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ preferences }, dg] = await Promise.all([
        api.getNotificationPreferences(),
        api.getNotificationDigest('week').catch(() => null),
      ]);
      const map: PrefMap = {};
      for (const ty of TYPES) map[ty.type] = defaultPref(ty.type);
      for (const p of preferences) map[p.notificationType] = { ...defaultPref(p.notificationType), ...p };
      setPrefs(map);
      if (dg) setDigest({ total: dg.total, byPriority: dg.byPriority });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  function toggle(type: string, channel: 'inAppEnabled' | 'emailEnabled' | 'slackEnabled', value: boolean) {
    setPrefs((prev) => ({ ...prev, [type]: { ...(prev[type] || defaultPref(type)), [channel]: value } }));
  }

  async function save() {
    setError(null);
    try {
      await api.updateNotificationPreferences(Object.values(prefs));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    }
  }

  return (
    <div className="max-w-5xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.settings'), path: ROUTES.SETTINGS }, { label: t('notificationPrefs.pageTitle') }]}
        title={t('notificationPrefs.pageTitle')}
        subtitle={t('notificationPrefs.pageSubtitle')}
        actions={<Button onClick={save}>{saved ? t('notificationPrefs.saved') : t('common.save')}</Button>}
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {digest && (
            <Card className="p-4 mb-4 flex flex-wrap items-center gap-4">
              <Icon name="summarize" size={20} className="text-primary" />
              <span className="text-sm font-medium text-on-surface">
                {t('notificationPrefs.digestSummary', { total: digest.total })}
              </span>
              <div className="flex gap-3 text-xs text-on-surface-variant ml-auto">
                {digest.byPriority.critical ? <span className="text-destructive">{digest.byPriority.critical} critical</span> : null}
                {digest.byPriority.warning ? <span className="text-warning">{digest.byPriority.warning} warning</span> : null}
                {digest.byPriority.info ? <span>{digest.byPriority.info} info</span> : null}
              </div>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-5 py-3 border-b border-border text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              <span>{t('notificationPrefs.colType')}</span>
              <span className="text-center w-16">{t('notificationPrefs.inApp')}</span>
              <span className="text-center w-16">{t('notificationPrefs.email')}</span>
              <span className="text-center w-16">{t('notificationPrefs.slack')}</span>
            </div>
            {TYPES.map(({ type }) => {
              const p = prefs[type] || defaultPref(type);
              return (
                <div key={type} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-5 py-3 border-b border-border/60 items-center">
                  <code className="text-sm text-on-surface">{type}</code>
                  <div className="w-16 flex justify-center">
                    <Switch checked={p.inAppEnabled} onCheckedChange={(v) => toggle(type, 'inAppEnabled', v)} />
                  </div>
                  <div className="w-16 flex justify-center">
                    <Switch checked={p.emailEnabled} onCheckedChange={(v) => toggle(type, 'emailEnabled', v)} />
                  </div>
                  <div className="w-16 flex justify-center">
                    <Switch checked={p.slackEnabled} onCheckedChange={(v) => toggle(type, 'slackEnabled', v)} />
                  </div>
                </div>
              );
            })}
          </Card>
          <p className="text-xs text-on-surface-variant mt-3 flex items-center gap-1.5">
            <Icon name="info" size={14} />
            {t('notificationPrefs.channelNote')}
          </p>
        </motion.div>
      )}
    </div>
  );
}
