import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { usePermissions } from '../../lib/permissions';
import { useApi } from '../../hooks/useApi';
import { PageHeader } from '../../components/PageHeader';
import { SettingsUsersNav } from '../../components/SettingsUsersNav';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { SeatBreakdown } from '../../lib/api';

export function SeatsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('settings.seats.pageTitle'), t('settings.seats.pageSubtitle'));
  const { isAdmin } = usePermissions();
  const api = useApi();
  const [data, setData] = useState<SeatBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    api.getSeatBreakdown()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load seats'))
      .finally(() => setLoading(false));
  }, [isAdmin, api]);

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader title={t('settings.seats.pageTitle')} />
        <div className="rounded-xl border border-border p-8 text-center text-on-surface-variant">
          <Icon name="lock" size={32} className="mx-auto mb-3 opacity-50" />
          {t('settings.userDirectory.accessDenied')}
        </div>
      </div>
    );
  }

  const unlimited = data?.seatLimit == null;
  const pct = data && data.seatLimit ? Math.min(100, (data.billableSeats / data.seatLimit) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.settings'), path: ROUTES.SETTINGS }, { label: t('settings.seats.pageTitle') }]}
        title={t('settings.seats.pageTitle')}
        subtitle={t('settings.seats.pageSubtitle')}
      />
      <SettingsUsersNav />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>
      )}

      {loading || !data ? (
        <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>
      ) : (
        <motion.div className="space-y-6"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-on-surface-variant">{t('settings.seats.planLabel')}</p>
                <p className="text-2xl font-bold text-on-surface capitalize">{data.planTier}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-on-surface-variant">{t('settings.seats.usageLabel')}</p>
                <p className="text-2xl font-bold text-on-surface">
                  {data.billableSeats}{unlimited ? '' : ` / ${data.seatLimit}`}
                </p>
              </div>
            </div>
            {!unlimited && <Progress value={pct} className="h-2" />}
            {unlimited && <Badge variant="purple">{t('settings.seats.unlimited')}</Badge>}
            {data.gracePeriodEnd && (
              <p className="text-sm text-warning mt-3">
                <Icon name="warning" size={14} className="inline mr-1" />
                {t('settings.seats.graceWarning', { date: new Date(data.gracePeriodEnd).toLocaleDateString() })}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-on-surface mb-3">{t('settings.seats.byRoleTitle')}</h3>
            <div className="divide-y divide-border">
              {data.byRole.map((r) => (
                <div key={r.roleName} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="font-medium text-on-surface flex-1">{r.roleName}</span>
                  <span className="text-on-surface-variant">{t('settings.seats.weight', { weight: r.seatWeight })}</span>
                  <span className="text-on-surface-variant w-24 text-right">
                    {t('settings.seats.activeUsers', { count: r.activeUsers })}
                  </span>
                  <span className="font-semibold text-on-surface w-16 text-right">{r.billable}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
