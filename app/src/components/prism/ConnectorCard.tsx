import { motion } from 'framer-motion';
import { Icon } from '../Icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTranslation } from '../../lib/i18n';
import type { ConnectorMeta } from '../../types/prism';

const rise = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

/** Map a connector's legal posture → the ToS chip shown on review sources. */
function tosChipKey(meta: ConnectorMeta): string | null {
  switch (meta.legalPosture?.basis) {
    case 'public_api_licensed': return 'prism.tos.officialApi';
    case 'display_only':        return 'prism.tos.displayOnly';
    case 'first_party_owned':   return null; // files / owned data — no chip needed
    default:                    return null;
  }
}

interface ConnectorCardProps {
  meta: ConnectorMeta;
  onConnect: (meta: ConnectorMeta) => void;
}

export function ConnectorCard({ meta, onConnect }: ConnectorCardProps) {
  const { t } = useTranslation();
  const capabilityHint = meta.capabilities
    .slice(0, 3)
    .map((c) => t(`prism.capability.${c}`))
    .join(' · ');
  const chipKey = meta.group === 'reviews' ? tosChipKey(meta) : null;
  const initial = meta.label.charAt(0).toUpperCase();

  return (
    <motion.div variants={rise}>
      <Card
        className="card-tilt p-4 flex flex-col gap-3 h-full transition-shadow hover:shadow-lg"
        style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-black font-headline text-base"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm font-headline text-on-surface truncate">{meta.label}</h3>
            <p className="text-[11px] text-on-surface-variant truncate mt-0.5">{capabilityHint}</p>
          </div>
        </div>

        {chipKey && (
          <span className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container text-on-surface-variant">
            <Icon name="verified_user" size={11} className="text-primary" fill={1} />
            {t(chipKey)}
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          className={cn('rounded-xl font-semibold mt-auto')}
          onClick={() => onConnect(meta)}
        >
          <Icon name="link" size={14} />
          {t('prism.gallery.connect')}
        </Button>
      </Card>
    </motion.div>
  );
}
