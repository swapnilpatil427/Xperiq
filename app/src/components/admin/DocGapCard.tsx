import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { Icon } from '../Icon';
import { Button } from '@/components/ui/button';
import type { DocGap } from '../../lib/api';

// ── Props ─────────────────────────────────────────────────────────────────────

interface DocGapCardProps {
  gap: DocGap;
  onResolve: (id: string, resolution: 'doc_created' | 'linked' | 'wont_fix') => void;
  onCreateDoc: (gap: DocGap) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeAge(iso: string): string {
  const diffMs   = Date.now() - new Date(iso).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHrs  = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs  / 24);
  const diffWks  = Math.floor(diffDays / 7);

  if (diffWks  > 1) return `${diffWks} weeks ago`;
  if (diffWks === 1) return '1 week ago';
  if (diffDays > 1) return `${diffDays} days ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffHrs  > 1) return `${diffHrs} hours ago`;
  if (diffHrs === 1) return '1 hour ago';
  if (diffMins > 1) return `${diffMins} minutes ago`;
  return 'just now';
}

const RESOLUTION_LABELS: Record<NonNullable<DocGap['resolution']>, string> = {
  doc_created: 'Doc created',
  linked:      'Linked',
  wont_fix:    "Won't fix",
};

const RESOLUTION_COLORS: Record<NonNullable<DocGap['resolution']>, { bg: string; text: string; border: string }> = {
  doc_created: { bg: 'rgba(34,197,94,0.1)',   text: '#16a34a', border: 'rgba(34,197,94,0.3)' },
  linked:      { bg: 'rgba(59,130,246,0.1)',  text: '#2563eb', border: 'rgba(59,130,246,0.3)' },
  wont_fix:    { bg: 'rgba(148,163,184,0.1)', text: '#64748b', border: 'rgba(148,163,184,0.3)' },
};

const FEEDBACK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  not_answered:   { bg: 'rgba(239,68,68,0.1)',   text: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  poor_answer:    { bg: 'rgba(245,158,11,0.1)',  text: '#d97706', border: 'rgba(245,158,11,0.3)' },
  missing_doc:    { bg: 'rgba(99,102,241,0.1)',  text: '#6366f1', border: 'rgba(99,102,241,0.3)' },
  outdated:       { bg: 'rgba(245,158,11,0.1)',  text: '#d97706', border: 'rgba(245,158,11,0.3)' },
};

function feedbackBadgeStyle(feedbackType: string) {
  return (
    FEEDBACK_COLORS[feedbackType] ?? {
      bg:     'rgba(148,163,184,0.1)',
      text:   '#64748b',
      border: 'rgba(148,163,184,0.3)',
    }
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DocGapCard({ gap, onResolve, onCreateDoc }: DocGapCardProps) {
  const { t } = useTranslation();

  const isResolved = gap.resolvedAt !== null && gap.resolution !== null;
  const age        = relativeAge(gap.lastSeenAt);
  const highVolume = gap.occurrenceCount > 5;
  const fbStyle    = feedbackBadgeStyle(gap.feedbackType);

  const pillBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: '18px',
    border: '1px solid',
    whiteSpace: 'nowrap',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        backdropFilter: 'blur(24px)',
        background: 'rgba(255,255,255,0.72)',
        border: '1px solid rgba(255,255,255,0.5)',
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Query text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-on-surface)',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            {gap.query}
          </p>

          {/* Crystal intent */}
          {gap.crystalIntent && (
            <p
              style={{
                fontSize: 12,
                fontStyle: 'italic',
                color: 'var(--color-on-surface-muted, #94a3b8)',
                margin: '4px 0 0',
                lineHeight: 1.4,
              }}
            >
              {gap.crystalIntent}
            </p>
          )}
        </div>

        {/* Resolution badge (shown when resolved) */}
        {isResolved && gap.resolution && (
          <span
            style={{
              ...pillBase,
              background: RESOLUTION_COLORS[gap.resolution].bg,
              color:      RESOLUTION_COLORS[gap.resolution].text,
              borderColor: RESOLUTION_COLORS[gap.resolution].border,
              flexShrink: 0,
            }}
          >
            <Icon name="check_circle" size={11} style={{ marginRight: 2 }} />
            {RESOLUTION_LABELS[gap.resolution]}
          </span>
        )}
      </div>

      {/* ── Meta row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Feedback type badge */}
        <span
          style={{
            ...pillBase,
            background: fbStyle.bg,
            color:      fbStyle.text,
            borderColor: fbStyle.border,
          }}
        >
          {gap.feedbackType.replace(/_/g, ' ')}
        </span>

        {/* Occurrence count */}
        <span
          style={{
            fontSize: 12,
            fontWeight: highVolume ? 700 : 400,
            color: highVolume ? '#dc2626' : 'var(--color-on-surface-muted, #94a3b8)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Icon
            name="forum"
            size={13}
            style={{ opacity: 0.7 }}
          />
          {`Asked ${gap.occurrenceCount} time${gap.occurrenceCount === 1 ? '' : 's'}`}
        </span>

        {/* Age */}
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-on-surface-muted, #94a3b8)',
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {age}
        </span>
      </div>

      {/* ── Action buttons (only when unresolved) ── */}
      {!isResolved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          <Button
            variant="default"
            size="sm"
            onClick={() => onCreateDoc(gap)}
            style={{ gap: 4 }}
          >
            <Icon name="add_circle" size={14} />
            {t('admin.docPipeline.createDocFromGap')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve(gap.id, 'linked')}
            style={{ gap: 4 }}
          >
            <Icon name="link" size={14} />
            {t('admin.docPipeline.linkExisting')}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onResolve(gap.id, 'wont_fix')}
            style={{ gap: 4, color: 'var(--color-on-surface-muted, #94a3b8)' }}
          >
            <Icon name="do_not_disturb" size={14} />
            {t('admin.docPipeline.wontFix')}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
