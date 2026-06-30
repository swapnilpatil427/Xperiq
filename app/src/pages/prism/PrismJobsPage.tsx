import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { PageHeader } from '../../components/PageHeader';
import { usePrismConnections } from '../../hooks/usePrismConnections';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useTranslation } from '../../lib/i18n';
import { ROUTES, toPath } from '../../constants/routes';
import type { PrismJob, PrismJobStatus } from '../../types/prism';

type BadgeVariant = 'live' | 'success' | 'warning' | 'destructive' | 'neutral' | 'default';
const STATUS_VARIANT: Record<PrismJobStatus, BadgeVariant> = {
  queued: 'neutral', running: 'live', awaiting_input: 'warning', paused: 'warning',
  complete: 'success', partial: 'warning', failed: 'destructive',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function PrismJobsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useSetPageTitle(t('prism.jobs.title'), t('prism.jobs.subtitle'));

  const { connections, jobs, loading, error } = usePrismConnections();
  const connectionLabel = (job: PrismJob) =>
    connections.find((c) => c.id === job.connection_id)?.label ?? job.connection_id;

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('prism.title'), icon: 'auto_awesome_motion', path: ROUTES.PRISM }, { label: t('prism.jobs.title') }]}
        title={t('prism.jobs.title')}
        subtitle={t('prism.jobs.subtitle')}
        actions={
          <Button variant="gradient" size="sm" className="rounded-xl gap-1.5" onClick={() => navigate(ROUTES.PRISM)}>
            <Icon name="add" size={16} />{t('prism.jobs.newImport')}
          </Button>
        }
      />

      {loading ? (
        <div className="skeleton h-64 rounded-2xl" />
      ) : error && jobs.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t('prism.jobs.loadError')}</p>
      ) : jobs.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }}>
            <Icon name="cloud_download" size={28} className="text-primary" />
          </div>
          <h2 className="text-xl font-extrabold font-headline text-on-surface mb-2">{t('prism.jobs.empty')}</h2>
          <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-6">{t('prism.jobs.emptyBody')}</p>
          <Button variant="default" className="rounded-xl gap-1.5" onClick={() => navigate(ROUTES.PRISM)}>
            <Icon name="add" size={16} />{t('prism.jobs.newImport')}
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('prism.jobs.colSource')}</TableHead>
              <TableHead scope="col">{t('prism.jobs.colKind')}</TableHead>
              <TableHead scope="col">{t('prism.jobs.colStage')}</TableHead>
              <TableHead scope="col">{t('prism.jobs.colStatus')}</TableHead>
              <TableHead scope="col" className="text-right">{t('prism.jobs.colCount')}</TableHead>
              <TableHead scope="col">{t('prism.jobs.colUpdated')}</TableHead>
              <TableHead scope="col" className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(toPath(ROUTES.PRISM_JOB, { jobId: job.id }))}>
                <TableCell className="font-semibold text-on-surface">{connectionLabel(job)}</TableCell>
                <TableCell className="text-on-surface-variant">{t(`prism.kind.${job.kind}`)}</TableCell>
                <TableCell className="text-on-surface-variant">{t(`prism.stage.${job.stage}`)}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[job.status]}>{t(`prism.status.${job.status}`)}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{(job.counts.loaded ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-on-surface-variant text-sm">{timeAgo(job.updated_at)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="rounded-lg gap-1" onClick={(e) => { e.stopPropagation(); navigate(toPath(ROUTES.PRISM_JOB, { jobId: job.id })); }}>
                    {t('prism.jobs.open')}<Icon name="chevron_right" size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
