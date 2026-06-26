import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import type { QualityBreakdown } from '../../lib/api';

// ── Props ─────────────────────────────────────────────────────────────────────

interface QualityScoreBreakdownProps {
  score: number;        // 0.0 – 1.0
  breakdown: QualityBreakdown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 0.90) return '#16a34a';   // green
  if (s >= 0.75) return '#eab308';   // yellow
  if (s >= 0.65) return '#d97706';   // orange
  return '#dc2626';                  // red
}

// Format a criterion key as a display label (capitalize first letter).
function criterionLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// ── Ring geometry ─────────────────────────────────────────────────────────────

const CX = 60;
const CY = 60;
const R  = 50;
const STROKE_WIDTH = 10;
const CIRCUMFERENCE = 2 * Math.PI * R;   // ≈ 314.159

// Convert a 0–1 score position on the ring to SVG (x1,y1,x2,y2) for a tick.
// The ring starts at the top (−90°) and goes clockwise.
function tickCoords(
  threshold: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const angleDeg = threshold * 360 - 90;   // start from top
  const angleRad = (angleDeg * Math.PI) / 180;

  const innerR = R - STROKE_WIDTH / 2 - 2;
  const outerR = R + STROKE_WIDTH / 2 + 2;

  return {
    x1: CX + innerR * Math.cos(angleRad),
    y1: CY + innerR * Math.sin(angleRad),
    x2: CX + outerR * Math.cos(angleRad),
    y2: CY + outerR * Math.sin(angleRad),
  };
}

const THRESHOLDS = [0.65, 0.75, 0.90];

// ── Criterion row component ───────────────────────────────────────────────────

interface CriterionRowProps {
  label: string;
  value: number;
}

function CriterionRow({ label, value }: CriterionRowProps) {
  const color = scoreColor(value);
  const pct   = Math.round(value * 100);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      {/* Label */}
      <span
        style={{
          fontSize: 12,
          color: 'var(--color-on-surface-muted, #64748b)',
          width: 100,
          flexShrink: 0,
        }}
      >
        {label}
      </span>

      {/* Mini progress bar */}
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 999,
          background: 'rgba(0,0,0,0.07)',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: '100%',
            borderRadius: 999,
            background: color,
          }}
        />
      </div>

      {/* Percentage */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color,
          width: 36,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function QualityScoreBreakdown({ score, breakdown }: QualityScoreBreakdownProps) {
  const { t } = useTranslation();

  const ringColor     = scoreColor(score);
  const dashOffset    = CIRCUMFERENCE * (1 - score);
  const scorePct      = Math.round(score * 100);

  const criteria: Array<{ key: keyof QualityBreakdown; value: number }> = [
    { key: 'accuracy',      value: breakdown.accuracy },
    { key: 'completeness',  value: breakdown.completeness },
    { key: 'clarity',       value: breakdown.clarity },
    { key: 'searchability', value: breakdown.searchability },
    { key: 'actionability', value: breakdown.actionability },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {/* ── SVG ring ── */}
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <svg width={120} height={120} viewBox="0 0 120 120">
          {/* Background track */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={STROKE_WIDTH}
          />

          {/* Animated score arc */}
          <motion.circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: `${CX}px ${CY}px`, transform: 'rotate(-90deg)' }}
          />

          {/* Threshold tick marks */}
          {THRESHOLDS.map((threshold) => {
            const { x1, y1, x2, y2 } = tickCoords(threshold);
            return (
              <line
                key={threshold}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="white"
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Centre score text */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: ringColor, lineHeight: 1 }}>
            {scorePct}
          </span>
          <span style={{ fontSize: 10, color: 'var(--color-on-surface-muted, #94a3b8)', marginTop: 2 }}>
            {t('admin.docPipeline.qualityScore')}
          </span>
        </div>
      </div>

      {/* ── Criterion rows ── */}
      <div style={{ width: '100%' }}>
        {criteria.map(({ key, value }) => {
          const rawLabel = t(`admin.docPipeline.criteria.${key}`);
          // Fall back to capitalised key name if the translation key is missing (returns the key itself)
          const label = rawLabel.includes('.') ? criterionLabel(key) : rawLabel;
          return <CriterionRow key={key} label={label} value={value} />;
        })}
      </div>
    </div>
  );
}
