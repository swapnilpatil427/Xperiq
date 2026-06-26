import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { usePermissions } from '../../lib/permissions';
import { useApi } from '../../hooks/useApi';
import { PageHeader } from '../../components/PageHeader';
import { SettingsUsersNav } from '../../components/SettingsUsersNav';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import type { AuditEvent } from '../../lib/api';

export function AuditLogPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('settings.audit.pageTitle'), t('settings.audit.pageSubtitle'));
  const { isAdmin } = usePermissions();
  const api = useApi();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { events } = await api.listAuditLogs({ event_type: eventType || undefined, limit: 100 });
      setEvents(events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    const h = setTimeout(load, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType]);

  async function exportCsv() {
    const csv = await api.exportAuditLogsCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit-log.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader title={t('settings.audit.pageTitle')} />
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
        crumbs={[{ label: t('nav.settings'), path: ROUTES.SETTINGS }, { label: t('settings.audit.pageTitle') }]}
        title={t('settings.audit.pageTitle')}
        subtitle={t('settings.audit.pageSubtitle')}
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Icon name="download" size={16} className="mr-1.5" />{t('settings.audit.exportCsv')}
          </Button>
        }
      />
      <SettingsUsersNav />

      <div className="mb-4 relative max-w-xs">
        <Icon name="filter_list" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <Input className="pl-9" placeholder={t('settings.audit.filterPlaceholder')}
          value={eventType} onChange={(e) => setEventType(e.target.value)} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>
      )}

      <motion.div className="rounded-xl border border-border overflow-hidden"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settings.audit.colTime')}</TableHead>
              <TableHead>{t('settings.audit.colEvent')}</TableHead>
              <TableHead>{t('settings.audit.colActor')}</TableHead>
              <TableHead>{t('settings.audit.colTarget')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-10 text-on-surface-variant">{t('common.loading')}</TableCell></TableRow>
            ) : events.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-10 text-on-surface-variant">{t('settings.audit.empty')}</TableCell></TableRow>
            ) : events.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-on-surface-variant whitespace-nowrap">{new Date(e.occurredAt).toLocaleString()}</TableCell>
                <TableCell><Badge variant="neutral" className="font-mono text-[11px]">{e.eventType}</Badge></TableCell>
                <TableCell>{e.actorName || e.actorUserId || (e.actorType === 'scim' ? 'SCIM' : e.actorType)}</TableCell>
                <TableCell>{e.targetName || e.targetResourceType || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  );
}
