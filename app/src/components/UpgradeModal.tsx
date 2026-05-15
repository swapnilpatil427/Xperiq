import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Icon } from './Icon';
import { useTranslation } from '../lib/i18n';
import type { PlanTier } from '../lib/features';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  requiredPlan: PlanTier;
  featureName: string;
}

const PLAN_DETAILS: Record<string, { label: string; color: string; price: string }> = {
  starter:    { label: 'Starter',    color: '#2a4bd9', price: '$49/mo' },
  business:   { label: 'Business',   color: '#8329c8', price: '$149/mo' },
  enterprise: { label: 'Enterprise', color: '#059669', price: 'Custom' },
};

export function UpgradeModal({ open, onClose, requiredPlan, featureName }: UpgradeModalProps) {
  const { t } = useTranslation();
  const plan = PLAN_DETAILS[requiredPlan] ?? PLAN_DETAILS.business;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
        <div
          className="p-6 text-white text-center"
          style={{ background: `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)` }}
        >
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
            <Icon name="auto_awesome" size={28} fill={1} className="text-white" />
          </div>
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-white text-xl font-headline font-bold">
              {t('upgrade.title', { plan: plan.label })}
            </DialogTitle>
            <DialogDescription className="text-white/80 text-sm">
              {t('upgrade.featureLocked', { feature: featureName })}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            {['upgrade.benefit1', 'upgrade.benefit2', 'upgrade.benefit3'].map((key) => (
              <div key={key} className="flex items-center gap-2 text-sm text-on-surface">
                <Icon name="check_circle" size={16} style={{ color: plan.color }} fill={1} />
                <span>{t(key)}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1 rounded-xl font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)` }}
              onClick={onClose}
            >
              {t('upgrade.cta', { price: plan.price })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
