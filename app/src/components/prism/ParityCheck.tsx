import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { cn } from '@/lib/utils';
import type { ParityEntry } from '../../types/prism';

export type MetricMethod = 'match_source' | 'prism';

interface ParityCheckProps {
  entries: ParityEntry[];
  /** chosen method per metric — required for any mismatch before proceeding */
  methods: Record<string, MetricMethod>;
  onChooseMethod: (metric: string, method: MetricMethod) => void;
}

/** True when every mismatched metric has had a method chosen (acknowledge-to-proceed). */
export function parityAcknowledged(entries: ParityEntry[], methods: Record<string, MetricMethod>): boolean {
  return entries.every((e) => e.match || methods[e.metric] != null);
}

function fmt(v: number | null): string {
  return v == null ? '—' : String(v);
}

export function ParityCheck({ entries, methods, onChooseMethod }: ParityCheckProps) {
  const { t } = useTranslation();
  const { openCrystal } = useCrystalPanel();
  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('prism.parity.colMetric')}</TableHead>
            <TableHead scope="col">{t('prism.parity.colSource')}</TableHead>
            <TableHead scope="col">{t('prism.parity.colPrism')}</TableHead>
            <TableHead scope="col">{t('prism.parity.colStatus')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => {
            const chosen = methods[e.metric];
            const resolved = e.match || chosen != null;
            return (
              <TableRow key={e.metric}>
                <TableCell className="font-semibold uppercase text-xs tracking-wide">{e.metric}</TableCell>
                <TableCell className="tabular-nums">{fmt(e.source_value)}</TableCell>
                <TableCell className="tabular-nums">{fmt(e.prism_computed)}</TableCell>
                <TableCell>
                  {e.match ? (
                    <span className="inline-flex items-center gap-1 text-success text-sm font-semibold">
                      <Icon name="check_circle" size={14} fill={1} />{t('prism.parity.match')}
                    </span>
                  ) : (
                    <div className="space-y-1.5">
                      <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', resolved ? 'text-on-surface-variant' : 'text-warning')}>
                        <Icon name={resolved ? 'check' : 'warning'} size={14} />
                        {e.delta != null ? `${e.delta > 0 ? '+' : ''}${e.delta}` : t('prism.parity.mismatch')}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant={chosen === 'match_source' ? 'default' : 'outline'}
                          size="sm"
                          className="rounded-lg h-7 text-xs"
                          onClick={() => onChooseMethod(e.metric, 'match_source')}
                        >
                          {t('prism.review.parityMatchSource')}
                        </Button>
                        <Button
                          variant={chosen === 'prism' ? 'default' : 'outline'}
                          size="sm"
                          className="rounded-lg h-7 text-xs"
                          onClick={() => onChooseMethod(e.metric, 'prism')}
                        >
                          {t('prism.review.parityKeepPrism')}
                        </Button>
                        {e.explanation && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                            onClick={() => openCrystal(e.explanation)}
                            title={e.explanation}
                          >
                            <Icon name="help" size={12} />{t('prism.review.parityExplainer')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
