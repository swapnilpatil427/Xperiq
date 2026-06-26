import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { Icon } from '../Icon';
import { Button } from '@/components/ui/button';
import type { QueuedDoc, PipelineStatus } from '../../lib/api';

// ── Status colour map ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<PipelineStatus, { bg: string; text: string; border: string }> = {
  queued:              { bg: 'rgba(148,163,184,0.1)', text: '#64748b', border: 'rgba(148,163,184,0.3)' },
  extracting:          { bg: 'rgba(99,102,241,0.1)',  text: '#6366f1', border: 'rgba(99,102,241,0.3)' },
  drafting:            { bg: 'rgba(99,102,241,0.1)',  text: '#6366f1', border: 'rgba(99,102,241,0.3)' },
  quality_check:       { bg: 'rgba(245,158,11,0.1)',  text: '#d97706', border: 'rgba(245,158,11,0.3)' },
  auto_approved:       { bg: 'rgba(34,197,94,0.1)',   text: '#16a34a', border: 'rgba(34,197,94,0.3)' },
  pending_review:      { bg: 'rgba(245,158,11,0.1)',  text: '#d97706', border: 'rgba(245,158,11,0.3)' },
  requires_annotation: { bg: 'rgba(239,68,68,0.1)',   text: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  rejected:            { bg: 'rgba(239,68,68,0.1)',   text: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  publishing:          { bg: 'rgba(59,130,246,0.1)',  text: '#2563eb', border: 'rgba(59,130,246,0.3)' },
  live:                { bg: 'rgba(34,197,94,0.1)',   text: '#16a34a', border: 'rgba(34,197,94,0.3)' },
  stale:               { bg: 'rgba(148,163,184,0.1)', text: '#64748b', border: 'rgba(148,163,184,0.3)' },
};

// ── Quality score badge colour ────────────────────────────────────────────────

function qualityBadgeStyle(score: number): { bg: string; text: string; border: string } {
  if (score >= 0.90) return { bg: 'rgba(34,197,94,0.12)',  text: '#16a34a', border: 'rgba(34,197,94,0.3)' };
  if (score >= 0.75) return { bg: 'rgba(234,179,8,0.12)',  text: '#ca8a04', border: 'rgba(234,179,8,0.3)' };
  if (score >= 0.65) return { bg: 'rgba(249,115,22,0.12)', text: '#ea580c', border: 'rgba(249,115,22,0.3)' };
  return                    { bg: 'rgba(239,68,68,0.12)',  text: '#dc2626', border: 'rgba(239,68,68,0.3)' };
}

// ── Countdown helpers ─────────────────────────────────────────────────────────

function msUntil(iso: string): number {
  return new Date(iso).getTime() - Date.now();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PipelineQueueRowProps {
  doc: QueuedDoc;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PipelineQueueRow({ doc, onApprove, onReject, onEdit }: PipelineQueueRowProps) {
  const { t } = useTranslation();

  // Countdown timer — refreshes every 30 s
  const [countdown, setCountdown] = useState<string>(() => {
    if (!doc.autoApproveDeadline) return '';
    const ms = msUntil(doc.autoApproveDeadline);
    return ms > 0 ? formatCountdown(ms) : '';
  });

  useEffect(() => {
    if (!doc.autoApproveDeadline) return;

    const tick = () => {
      const ms = msUntil(doc.autoApproveDeadline as string);
      setCountdown(ms > 0 ? formatCountdown(ms) : '');
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [doc.autoApproveDeadline]);

  const statusColor  = STATUS_COLORS[doc.status];
  const qualityStyle = qualityBadgeStyle(doc.qualityScore);

  const pillBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: '18px',
    border: '1px solid',
    whiteSpace: 'nowrap',
  };

  return (
    <tr
      style={{
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        verticalAlign: 'middle',
      }}
    >
      {/* Column 1 — Title + docKey */}
      <td style={{ padding: '10px 12px', minWidth: 200 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-on-surface)' }}>
          {doc.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-on-surface-muted, #94a3b8)', marginTop: 2 }}>
          {doc.docKey}
        </div>
      </td>

      {/* Column 2 — Quality score badge */}
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <span
          style={{
            ...pillBase,
            background: qualityStyle.bg,
            color: qualityStyle.text,
            borderColor: qualityStyle.border,
          }}
        >
          {Math.round(doc.qualityScore * 100)}
        </span>
      </td>

      {/* Column 3 — Status pill */}
      <td style={{ padding: '10px 12px' }}>
        <span
          style={{
            ...pillBase,
            background: statusColor.bg,
            color: statusColor.text,
            borderColor: statusColor.border,
            textTransform: 'capitalize',
          }}
        >
          {doc.status.replace(/_/g, ' ')}
        </span>
      </td>

      {/* Column 4 — Countdown */}
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#d97706', whiteSpace: 'nowrap' }}>
        {countdown
          ? t('admin.docPipeline.autoApprovesIn', { time: countdown })
          : null}
      </td>

      {/* Column 5 — Human-edited indicator */}
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        {doc.humanEdited && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: '#6366f1',
              fontWeight: 500,
            }}
            title={t('admin.docPipeline.humanEdited')}
          >
            <Icon name="lock" size={14} />
            <span className="hidden md:inline">{t('admin.docPipeline.humanEdited')}</span>
          </span>
        )}
      </td>

      {/* Column 6 — Action buttons */}
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <Button
            variant="success"
            size="sm"
            onClick={() => onApprove(doc.id)}
            style={{ gap: 4 }}
          >
            <Icon name="check_circle" size={14} />
            {t('admin.docPipeline.approveDoc')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(doc.id)}
            style={{ gap: 4 }}
          >
            <Icon name="edit" size={14} />
            {t('admin.docPipeline.editDoc')}
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => onReject(doc.id)}
            style={{ gap: 4 }}
          >
            <Icon name="cancel" size={14} />
            {t('admin.docPipeline.rejectDoc')}
          </Button>
        </div>
      </td>
    </tr>
  );
}
