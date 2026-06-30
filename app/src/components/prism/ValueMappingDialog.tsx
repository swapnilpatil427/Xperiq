import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import type { ValueRule } from '../../types/prism';

interface ValueMappingDialogProps {
  open: boolean;
  sourceField: string;
  rule: ValueRule | null;
  onClose: () => void;
  onSave: (rule: ValueRule) => void;
}

export function ValueMappingDialog({ open, sourceField, rule, onClose, onSave }: ValueMappingDialogProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ValueRule['kind']>(rule?.kind ?? 'rescale');
  const [inMin, setInMin] = useState<string>(rule?.in_min?.toString() ?? '');
  const [inMax, setInMax] = useState<string>(rule?.in_max?.toString() ?? '');
  const [outMin, setOutMin] = useState<string>(rule?.out_min?.toString() ?? '');
  const [outMax, setOutMax] = useState<string>(rule?.out_max?.toString() ?? '');
  const [pairs, setPairs] = useState<Array<{ from: string; to: string }>>(
    rule?.map ? Object.entries(rule.map).map(([from, to]) => ({ from, to })) : [{ from: '', to: '' }],
  );

  function handleSave() {
    const num = (v: string) => (v === '' ? undefined : Number(v));
    if (kind === 'rescale') {
      onSave({ kind, in_min: num(inMin), in_max: num(inMax), out_min: num(outMin), out_max: num(outMax) });
    } else if (kind === 'map') {
      const map: Record<string, string> = {};
      pairs.forEach((p) => { if (p.from) map[p.from] = p.to; });
      onSave({ kind, map });
    } else {
      onSave({ kind: 'verbatim' });
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('prism.valueDialog.title', { field: sourceField })}</DialogTitle>
          <DialogDescription>{t('prism.valueDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="px-7 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('prism.valueDialog.ruleKind')}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ValueRule['kind'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rescale">{t('prism.valueDialog.kindRescale')}</SelectItem>
                <SelectItem value="map">{t('prism.valueDialog.kindMap')}</SelectItem>
                <SelectItem value="verbatim">{t('prism.valueDialog.kindVerbatim')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === 'rescale' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('prism.valueDialog.inMin')}</Label>
                <Input type="number" value={inMin} onChange={(e) => setInMin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('prism.valueDialog.inMax')}</Label>
                <Input type="number" value={inMax} onChange={(e) => setInMax(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('prism.valueDialog.outMin')}</Label>
                <Input type="number" value={outMin} onChange={(e) => setOutMin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('prism.valueDialog.outMax')}</Label>
                <Input type="number" value={outMax} onChange={(e) => setOutMax(e.target.value)} />
              </div>
            </div>
          )}

          {kind === 'map' && (
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder={t('prism.valueDialog.mapFrom')}
                    value={p.from}
                    onChange={(e) => setPairs((prev) => prev.map((x, j) => j === i ? { ...x, from: e.target.value } : x))}
                  />
                  <Icon name="arrow_forward" size={14} className="text-on-surface-variant shrink-0" />
                  <Input
                    placeholder={t('prism.valueDialog.mapTo')}
                    value={p.to}
                    onChange={(e) => setPairs((prev) => prev.map((x, j) => j === i ? { ...x, to: e.target.value } : x))}
                  />
                </div>
              ))}
              <Button variant="ghost" size="sm" className="rounded-lg gap-1.5" onClick={() => setPairs((prev) => [...prev, { from: '', to: '' }])}>
                <Icon name="add" size={14} />{t('prism.valueDialog.addRow')}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="rounded-xl">{t('prism.valueDialog.cancel')}</Button>
          <Button variant="default" onClick={handleSave} className="rounded-xl">{t('prism.valueDialog.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
