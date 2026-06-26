import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useAdminApi } from '../../hooks/useAdminApi';
import { PageHeader } from '../../components/PageHeader';
import { AdminCrystalNav } from '../../components/AdminCrystalNav';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { DlqEntry } from '../../lib/adminApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <TableCell key={i}><div className="skeleton h-4 rounded w-20" /></TableCell>
      ))}
    </TableRow>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminCrystalDlqPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('admin.crystal.dlq.title'), t('admin.crystal.dlq.subtitle'));

  const api = useAdminApi();

  const [entries, setEntries] = useState<DlqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replayDialogOpen, setReplayDialogOpen] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [replayedCount, setReplayedCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDlqEntries();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load DLQ entries');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function handleReplayAll() {
    setReplaying(true);
    try {
      const result = await api.replayDlq();
      setReplayedCount(result.replayed);
      await load();
    } finally {
      setReplaying(false);
      setReplayDialogOpen(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('admin.crystal.dlq.title') }]}
        title={t('admin.crystal.dlq.title')}
        subtitle={t('admin.crystal.dlq.subtitle')}
        actions={
          entries.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReplayDialogOpen(true)}
            >
              <Icon name="replay" size={16} className="mr-1.5" />
              {t('admin.crystal.dlq.replayAll')}
            </Button>
          )
        }
      />

      <AdminCrystalNav />

      {/* Replay success banner */}
      {replayedCount !== null && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-success/30 bg-success/5 p-3 mb-4 text-sm flex items-center gap-2"
        >
          <Icon name="check_circle" size={16} className="text-success" />
          {t('admin.crystal.dlq.replayed', { n: replayedCount })}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2"
            onClick={() => setReplayedCount(null)}
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </Button>
        </motion.div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-border overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.crystal.dlq.columns.surveyId')}</TableHead>
              <TableHead>{t('admin.crystal.dlq.columns.orgId')}</TableHead>
              <TableHead>{t('admin.crystal.dlq.columns.tier')}</TableHead>
              <TableHead>{t('admin.crystal.dlq.columns.error')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.dlq.columns.retries')}</TableHead>
              <TableHead>{t('admin.crystal.dlq.columns.failedAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}

            {!loading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-on-surface-variant">
                  <Icon name="check_circle" size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">{t('admin.crystal.dlq.empty')}</p>
                </TableCell>
              </TableRow>
            )}

            {!loading && entries.map((entry: DlqEntry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono text-xs">{entry.survey_id}</TableCell>
                <TableCell className="font-mono text-xs">{entry.org_id}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{entry.tier}</Badge>
                </TableCell>
                <TableCell className="text-xs text-destructive max-w-xs truncate" title={entry.error}>
                  {entry.error}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {entry.retry_count}
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">
                  {new Date(entry.failed_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </motion.div>

      {/* Replay confirmation dialog */}
      <Dialog open={replayDialogOpen} onOpenChange={setReplayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.crystal.dlq.replayAll')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            {t('admin.crystal.dlq.replayConfirm', { n: entries.length })}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplayDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleReplayAll()} disabled={replaying}>
              {replaying ? 'Replaying…' : t('admin.crystal.dlq.replayAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
