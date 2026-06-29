// TopicChangeBar — Phase 0.5 (06_UX_DESIGN §15.3)
//
// The emerged / declining named-topic chip row. Read-only chips (cursor-default,
// opacity-75, no hover, <span> not <button>). Reused by the header and drawer
// surfaces. Rendered only when there are topic changes to show.

import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { relativeAgo } from './trajectory';
import type { CheckpointDelta } from '../../types';

const HOUSE_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export interface TopicChangeBarProps {
  delta: CheckpointDelta | null;
  /** Prior checkpoint number (for the "Since checkpoint #N" label). */
  prevCheckpoint?: number | null;
  /** ISO timestamp of the current checkpoint (for the label date). */
  createdAt?: string | null;
  /** When true, render as the inline bar (label + border card). Default true. */
  withLabel?: boolean;
  className?: string;
}

/** Read-only emerged chip (▲). */
function EmergedChip({ topic }: { topic: string }) {
  const { t } = useTranslation();
  return (
    <span className="rounded-full px-3 py-1 text-xs font-medium bg-emerald-950 text-emerald-500 cursor-default opacity-75 whitespace-nowrap">
      <span aria-hidden="true">▲ </span>
      <span className="sr-only">{t('surveyInsights.investigation.emerged')} </span>
      {topic}
    </span>
  );
}

/** Read-only declining chip (▼). */
function DecliningChip({ topic }: { topic: string }) {
  const { t } = useTranslation();
  return (
    <span className="rounded-full px-3 py-1 text-xs font-medium bg-rose-950 text-rose-500 cursor-default opacity-75 whitespace-nowrap line-through decoration-rose-500/50">
      <span aria-hidden="true">▼ </span>
      <span className="sr-only">{t('surveyInsights.investigation.declining')} </span>
      {topic}
    </span>
  );
}

export function TopicChangeBar({
  delta,
  prevCheckpoint,
  createdAt,
  withLabel = true,
  className,
}: TopicChangeBarProps) {
  const { t } = useTranslation();

  const emerged = delta?.topic_changes?.emerged ?? [];
  const resolved = delta?.topic_changes?.resolved ?? [];
  const total = emerged.length + resolved.length;
  if (total === 0) return null;

  const chips = (
    <div className="flex items-center gap-2 flex-wrap">
      {emerged.map((topicName) => (
        <EmergedChip key={`emerged-${topicName}`} topic={topicName} />
      ))}
      {resolved.map((topicName) => (
        <DecliningChip key={`resolved-${topicName}`} topic={topicName} />
      ))}
    </div>
  );

  if (!withLabel) {
    // Bare chip cluster (used inside the drawer where the label is separate).
    return (
      <div role="status" aria-live="polite" className={className}>
        {chips}
      </div>
    );
  }

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.35, ease: HOUSE_EASE }}
      className={
        'mt-4 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 ' +
        'flex flex-col md:flex-row md:items-center md:justify-between gap-3 ' +
        (className ?? '')
      }
    >
      <span className="text-xs text-zinc-400 font-medium whitespace-nowrap shrink-0">
        {t('surveyInsights.investigation.topicBarLabel', {
          checkpoint: prevCheckpoint ?? '—',
          date: relativeAgo(createdAt),
        })}
      </span>
      {chips}
    </motion.div>
  );
}
