import { Card } from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import type { ReconReport } from '../../types/prism';

interface ReconciliationPanelProps {
  report: ReconReport;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return (
    <Icon
      name={ok ? 'check_circle' : 'error'}
      size={15}
      fill={ok ? 1 : 0}
      className={ok ? 'text-success' : 'text-warning'}
    />
  );
}

/** Signed reconciliation report shown on the Done screen (the audit artifact). */
export function ReconciliationPanel({ report }: ReconciliationPanelProps) {
  const { t } = useTranslation();
  const npsParity = report.metric_parity.find((p) => p.metric.toLowerCase() === 'nps');

  return (
    <Card className="p-5 space-y-4">
      <h3 className="text-sm font-extrabold font-headline text-on-surface">{t('prism.done.reconciliation')}</h3>

      <Table>
        <TableHeader className="sr-only">
          <TableRow>
            <TableHead scope="col">{t('prism.done.responsesRow')}</TableHead>
            <TableHead scope="col">{t('prism.parity.colSource')}</TableHead>
            <TableHead scope="col">{t('prism.parity.colPrism')}</TableHead>
            <TableHead scope="col">{t('prism.parity.colStatus')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-semibold">{t('prism.done.responsesRow')}</TableCell>
            <TableCell className="tabular-nums">{report.counts.source.toLocaleString()}</TableCell>
            <TableCell className="tabular-nums">{report.counts.prism.toLocaleString()}</TableCell>
            <TableCell><StatusIcon ok={report.counts.match} /></TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-semibold">{t('prism.done.checksumRow')}</TableCell>
            <TableCell colSpan={2} className="text-on-surface-variant text-sm">
              {report.checksum.match ? t('prism.done.checksumMatch') : t('prism.done.checksumMismatch')}
            </TableCell>
            <TableCell><StatusIcon ok={report.checksum.match} /></TableCell>
          </TableRow>
          {npsParity && (
            <TableRow>
              <TableCell className="font-semibold">{t('prism.done.npsRow')}</TableCell>
              <TableCell className="tabular-nums">{npsParity.source_value ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{npsParity.prism_computed ?? '—'}</TableCell>
              <TableCell><StatusIcon ok={npsParity.match} /></TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <p className="text-sm flex items-center gap-1.5 font-medium" style={{ color: report.tier1_pass ? 'var(--color-success, #059669)' : '#d97706' }}>
        <Icon name={report.tier1_pass ? 'verified' : 'warning'} size={15} fill={report.tier1_pass ? 1 : 0} />
        {report.tier1_pass ? t('prism.done.tier1Pass') : t('prism.done.tier1Fail')}
      </p>

      {report.report_url && (
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5"
          asChild
        >
          <a href={report.report_url} target="_blank" rel="noopener noreferrer">
            <Icon name="download" size={14} />{t('prism.done.downloadReport')}
          </a>
        </Button>
      )}
    </Card>
  );
}
