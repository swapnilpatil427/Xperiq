import { useTranslation } from '../../../lib/i18n';
import { useCrystalPanel } from '../../../contexts/crystalPanel';
import { Icon } from '../../Icon';
import { Button } from '@/components/ui/button';
import type { DashboardSummary } from '../../../lib/api';

interface CrystalNarrativeWidgetProps {
  summary: DashboardSummary | null;
}

const SENTIMENT_ACCENT: Record<string, string> = {
  positive: 'var(--color-success, #10b981)',
  negative: 'var(--color-destructive, #ef4444)',
  neutral: 'var(--color-primary)',
};

/**
 * Crystal AI narrative card. Extracted from the original DashboardPage executive
 * layout — the dashboard "writes its own story".
 */
export function CrystalNarrativeWidget({ summary }: CrystalNarrativeWidgetProps) {
  const { t } = useTranslation();
  const { openCrystal } = useCrystalPanel();

  if (!summary) {
    return <div className="skeleton h-24 rounded-xl" />;
  }

  const accent = SENTIMENT_ACCENT[summary.narrative.sentiment] || SENTIMENT_ACCENT.neutral;

  return (
    <div className="relative" style={{ borderLeft: `3px solid ${accent}`, paddingLeft: '1rem' }}>
      <div className="flex items-start gap-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
        >
          ◆
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-headline font-bold text-lg text-on-surface">{summary.narrative.headline}</h2>
            <span className="text-[10px] uppercase tracking-wide text-on-surface-variant/70 font-semibold">{t('dashboard.crystalBrief')}</span>
          </div>
          {summary.narrative.paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">{p}</p>
          ))}
          <Button variant="outline" size="sm" className="mt-3" onClick={() => openCrystal(t('dashboard.askCrystalSeed'))}>
            <Icon name="auto_awesome" size={14} className="mr-1.5" />
            {t('dashboard.askCrystal')}
          </Button>
        </div>
      </div>
    </div>
  );
}
