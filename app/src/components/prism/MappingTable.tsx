import { useMemo, useState } from 'react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Icon } from '../Icon';
import { ConfidenceChip, confidenceLevel } from './ConfidenceChip';
import { ValueMappingDialog } from './ValueMappingDialog';
import { useTranslation } from '../../lib/i18n';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { cn } from '@/lib/utils';
import type { FieldMapping, ValueRule } from '../../types/prism';

const TARGET_OPTIONS = [
  'embedded_data', 'nps_question', 'csat_question', 'ces_question', 'rating',
  'long_text', 'short_text', 'single_select', 'multi_select', 'date', 'number', 'preserve',
];

interface MappingTableProps {
  mappings: FieldMapping[];
  onChange: (mappings: FieldMapping[]) => void;
}

/**
 * AI-suggested field mapping reconciliation table (Crystal proposes, you confirm).
 * Unmapped fields default to "Keep as embedded data" (lossless). Editing a target
 * uses shadcn Select; value rules open the ValueMappingDialog. Bulk-confirm applies
 * all high-confidence suggestions at once.
 */
export function MappingTable({ mappings, onChange }: MappingTableProps) {
  const { t } = useTranslation();
  const { openCrystal } = useCrystalPanel();
  const [valueDialogFor, setValueDialogFor] = useState<number | null>(null);

  const total = mappings.length;
  const done = useMemo(
    () => mappings.filter((m) => confidenceLevel(m.confidence) === 'high').length,
    [mappings],
  );

  function updateRow(index: number, patch: Partial<FieldMapping>) {
    onChange(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function handleBulkConfirm() {
    // High-confidence rows keep their AI target; the act of confirming bumps them
    // to a deterministic origin so the diff treats them as user-approved.
    onChange(mappings.map((m) =>
      confidenceLevel(m.confidence) === 'high' ? { ...m, origin: 'deterministic' as const } : m,
    ));
  }

  function saveValueRule(index: number, rule: ValueRule) {
    updateRow(index, { value_rules: [rule] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          {t('prism.map.suggested', { done, total })}
          <span className="ml-3 inline-flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1"><Icon name="check_circle" size={12} className="text-success" fill={1} />{t('prism.map.legendHigh')}</span>
            <span className="inline-flex items-center gap-1"><Icon name="adjust" size={12} className="text-warning" />{t('prism.map.legendReview')}</span>
            <span className="inline-flex items-center gap-1"><Icon name="radio_button_unchecked" size={12} className="text-muted-foreground" />{t('prism.map.legendUnmapped')}</span>
          </span>
        </p>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={handleBulkConfirm}>
          <Icon name="done_all" size={14} />{t('prism.map.bulkConfirm')}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('prism.map.colSource')}</TableHead>
            <TableHead scope="col">{t('prism.map.colTarget')}</TableHead>
            <TableHead scope="col" className="text-right">{t('prism.map.colConfidence')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((m, i) => {
            const level = confidenceLevel(m.confidence);
            const isUnmapped = m.target === 'embedded_data' && level === 'low';
            const scaleRule = m.value_rules?.find((r) => r.kind === 'rescale');
            return (
              <TableRow key={`${m.source_field}-${i}`}>
                <TableCell className="align-top">
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon
                      name={level === 'high' ? 'check_circle' : level === 'review' ? 'adjust' : 'radio_button_unchecked'}
                      size={14}
                      fill={level === 'high' ? 1 : 0}
                      className={cn('mt-0.5 shrink-0', level === 'high' ? 'text-success' : level === 'review' ? 'text-warning' : 'text-muted-foreground')}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-on-surface truncate">{m.source_field}</p>
                      {m.source_type && <p className="text-[11px] text-on-surface-variant">{m.source_type}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Select value={m.target} onValueChange={(v) => updateRow(i, { target: v })}>
                    <SelectTrigger className="h-9 max-w-[16rem]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TARGET_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{t(`prism.map.targetOptions.${opt}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isUnmapped && (
                    <p className="text-[11px] text-on-surface-variant mt-1">({t('prism.map.preserved')})</p>
                  )}
                  {m.metric && scaleRule && (
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
                        <Icon name="warning" size={12} />
                        {t('prism.map.scaleWarning', {
                          from: `${scaleRule.in_min ?? '?'}–${scaleRule.in_max ?? '?'}`,
                          to: `${scaleRule.out_min ?? '?'}–${scaleRule.out_max ?? '?'}`,
                        })}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-primary hover:underline"
                        onClick={() => setValueDialogFor(i)}
                      >
                        {t('prism.map.editRule')}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                        onClick={() => openCrystal(t('prism.map.askCrystalScale', {
                          field: m.source_field,
                          from: `${scaleRule.in_min ?? '?'}–${scaleRule.in_max ?? '?'}`,
                          to: `${scaleRule.out_min ?? '?'}–${scaleRule.out_max ?? '?'}`,
                          metric: (m.metric ?? '').toUpperCase(),
                        }))}
                      >
                        <Icon name="auto_awesome" size={12} />{t('prism.map.askCrystal')}
                      </button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top text-right">
                  <ConfidenceChip confidence={m.confidence} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {valueDialogFor !== null && (
        <ValueMappingDialog
          open
          sourceField={mappings[valueDialogFor]?.source_field ?? ''}
          rule={mappings[valueDialogFor]?.value_rules?.[0] ?? null}
          onClose={() => setValueDialogFor(null)}
          onSave={(rule) => saveValueRule(valueDialogFor, rule)}
        />
      )}
    </div>
  );
}
