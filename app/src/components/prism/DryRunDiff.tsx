import { Card } from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Icon } from '../Icon';
import { ParityCheck, type MetricMethod } from './ParityCheck';
import { useTranslation } from '../../lib/i18n';
import type { DryRunReport } from '../../types/prism';

interface DryRunDiffProps {
  report: DryRunReport;
  methods: Record<string, MetricMethod>;
  onChooseMethod: (metric: string, method: MetricMethod) => void;
  onResolveConflicts?: () => void;
}

function StatLine({ icon, iconClass, children }: { icon: string; iconClass: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-on-surface">
      <Icon name={icon} size={16} className={`mt-0.5 shrink-0 ${iconClass}`} />
      <span>{children}</span>
    </li>
  );
}

/**
 * The trust hero (§4.5). Renders the dry-run diff: nothing has been written.
 * Shows create/update/skip/conflict counts, metric parity (with acknowledge-to-
 * proceed), timestamp continuity, and a sample preview table.
 */
export function DryRunDiff({ report, methods, onChooseMethod, onResolveConflicts }: DryRunDiffProps) {
  const { t } = useTranslation();
  const { summary, metric_parity, unmapped_fields, timestamp_continuity, sample } = report;
  const mapped = unmapped_fields.filter((f) => f.action !== 'embedded_data').length;
  const preserved = unmapped_fields.length - mapped;
  const gaps = timestamp_continuity.gaps?.length ?? 0;
  const sampleCols = sample && sample.length > 0 ? Object.keys(sample[0]) : [];

  return (
    <div className="space-y-5">
      {/* "Nothing imported yet" reassurance banner */}
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{ background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 18%, transparent)' }}
      >
        <Icon name="visibility" size={20} className="text-primary shrink-0" />
        <p className="text-sm font-medium text-on-surface">{t('prism.review.nothingYet')}</p>
      </div>

      {/* What will happen */}
      <Card className="p-5">
        <h3 className="text-sm font-extrabold font-headline text-on-surface mb-3">{t('prism.review.willHappen')}</h3>
        <ul className="space-y-2">
          <StatLine icon="add_circle" iconClass="text-success">{t('prism.review.created', { count: summary.create.toLocaleString() })}</StatLine>
          <StatLine icon="edit" iconClass="text-primary">{t('prism.review.updated', { count: summary.update.toLocaleString() })}</StatLine>
          {summary.conflict > 0 && (
            <li className="flex items-start gap-2.5 text-sm text-on-surface">
              <Icon name="error" size={16} className="mt-0.5 shrink-0 text-warning" />
              <span className="flex flex-wrap items-center gap-2">
                {t('prism.review.conflicts', { count: summary.conflict })}
                {onResolveConflicts && (
                  <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={onResolveConflicts}>
                    {t('prism.review.resolve')} ▸
                  </button>
                )}
              </span>
            </li>
          )}
          <StatLine icon="hexagon" iconClass="text-on-surface-variant">{t('prism.review.mapped', { mapped, preserved })}</StatLine>
          <StatLine icon="schedule" iconClass="text-on-surface-variant">
            {t('prism.review.historyPreserved', {
              earliest: timestamp_continuity.earliest || '—',
              latest: timestamp_continuity.latest || '—',
            })}{' '}
            {gaps === 0 ? t('prism.review.historyNoGaps') : t('prism.review.historyGaps', { count: gaps })}
          </StatLine>
        </ul>
      </Card>

      {/* Metric parity */}
      {metric_parity.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-extrabold font-headline text-on-surface mb-3">{t('prism.review.parity')}</h3>
          <ParityCheck entries={metric_parity} methods={methods} onChooseMethod={onChooseMethod} />
        </Card>
      )}

      {/* Sample preview */}
      {sampleCols.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-extrabold font-headline text-on-surface mb-3">
            {t('prism.review.sampleTitle', { count: sample!.length })}
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                {sampleCols.map((c) => <TableHead key={c} scope="col">{c}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sample!.map((row, i) => (
                <TableRow key={i}>
                  {sampleCols.map((c) => (
                    <TableCell key={c} className="truncate max-w-[16rem]">{String(row[c] ?? '')}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
