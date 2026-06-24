import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useAdminApi } from '../../hooks/useAdminApi';
import { useAppAuth } from '../../lib/auth';
import { PageHeader } from '../../components/PageHeader';
import { AdminCrystalNav } from '../../components/AdminCrystalNav';
import { Icon } from '../../components/Icon';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { BrandSignal, SignalType, SignalStatus, SignalSeverity } from '../../lib/adminApi';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

function typeVariant(type: SignalType): BadgeVariant {
  if (type === 'bug')              return 'destructive';
  if (type === 'feature_request')  return 'default';
  return 'secondary';
}

function severityVariant(sev: SignalSeverity): BadgeVariant {
  if (sev === 'critical') return 'destructive';
  if (sev === 'high')     return 'default';
  return 'secondary';
}

function statusVariant(status: SignalStatus): BadgeVariant {
  if (status === 'open')        return 'outline';
  if (status === 'in_progress') return 'secondary';
  return 'default';
}

function SkeletonRow() {
  return (
    <TableRow>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <TableCell key={i}><div className="skeleton h-4 rounded w-24" /></TableCell>
      ))}
    </TableRow>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminCrystalSignalsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('admin.crystal.signals.title'), t('admin.crystal.signals.subtitle'));

  const api = useAdminApi();
  const { orgId: rawOrgId } = useAppAuth();
  const orgId = rawOrgId ?? '';

  const [signals, setSignals] = useState<BrandSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | SignalType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SignalStatus>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBrandSignals(orgId, {
        type:   typeFilter   === 'all' ? undefined : typeFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit:  100,
      });
      setSignals(res.signals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load signals');
    } finally {
      setLoading(false);
    }
  }, [api, typeFilter, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function handleStatusUpdate(signal: BrandSignal, newStatus: SignalStatus) {
    try {
      await api.updateSignalStatus(orgId, signal.id, newStatus);
      setSignals((prev) =>
        prev.map((s) => (s.id === signal.id ? { ...s, status: newStatus } : s)),
      );
    } catch {
      // non-blocking
    }
  }

  const STATUSES: SignalStatus[] = ['open', 'in_progress', 'resolved'];

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('admin.crystal.signals.title') }]}
        title={t('admin.crystal.signals.title')}
        subtitle={t('admin.crystal.signals.subtitle')}
      />

      <AdminCrystalNav />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
        >
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.crystal.signals.typeAll')}</SelectItem>
            <SelectItem value="feature_request">{t('admin.crystal.signals.typeFeature')}</SelectItem>
            <SelectItem value="bug">{t('admin.crystal.signals.typeBug')}</SelectItem>
            <SelectItem value="complaint">{t('admin.crystal.signals.typeComplaint')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.crystal.signals.statusAll')}</SelectItem>
            <SelectItem value="open">{t('admin.crystal.signals.statusOpen')}</SelectItem>
            <SelectItem value="in_progress">{t('admin.crystal.signals.statusInProgress')}</SelectItem>
            <SelectItem value="resolved">{t('admin.crystal.signals.statusResolved')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
              <TableHead>{t('admin.crystal.signals.columns.title')}</TableHead>
              <TableHead>{t('admin.crystal.signals.columns.type')}</TableHead>
              <TableHead>{t('admin.crystal.signals.columns.severity')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.signals.columns.votes')}</TableHead>
              <TableHead>{t('admin.crystal.signals.columns.status')}</TableHead>
              <TableHead>{t('admin.crystal.signals.columns.created')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

            {!loading && signals.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-on-surface-variant">
                  <Icon name="inbox" size={32} className="mx-auto mb-2 opacity-40" />
                  <p>{t('admin.crystal.signals.empty')}</p>
                </TableCell>
              </TableRow>
            )}

            {!loading && signals.map((signal) => (
              <TableRow key={signal.id}>
                <TableCell className="font-medium text-sm max-w-xs truncate" title={signal.title}>
                  {signal.title}
                </TableCell>
                <TableCell>
                  <Badge variant={typeVariant(signal.type)}>
                    {signal.type.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={severityVariant(signal.severity)}>
                    {signal.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {signal.vote_count}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <Badge variant={statusVariant(signal.status)}>
                          {signal.status.replace('_', ' ')}
                        </Badge>
                        <Icon name="arrow_drop_down" size={14} className="ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {STATUSES.map((s) => {
                        const labelKey = s === 'open' ? 'admin.crystal.signals.statusOpen'
                          : s === 'in_progress' ? 'admin.crystal.signals.statusInProgress'
                          : 'admin.crystal.signals.statusResolved';
                        return (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => void handleStatusUpdate(signal, s)}
                          >
                            {t(labelKey)}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">
                  {new Date(signal.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  );
}
