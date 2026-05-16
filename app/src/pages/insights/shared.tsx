// Shared primitives for the four Insights variants.
// Each variant uses these to render trust signals consistently:
// - CitationChip       — clickable [rXXX] inline reference
// - ConfidenceChip     — color-coded confidence label
// - CIBar              — visual confidence interval
// - LayerBadge         — descriptive | diagnostic | predictive | prescriptive
// - GlassCard / GlassCardDark — surface wrappers
// TODO: i18n keys for all visible strings once locales/en.js extension is done.

import React from 'react';
import { Icon } from '../../components/Icon';

// ── Citation chip ────────────────────────────────────────────────────────────
export function CitationChip({ id, dark = false, title }: { id: string; dark?: boolean; title?: string }) {
  return (
    <button
      type="button"
      className={
        'inline-flex items-center px-1.5 mx-0.5 rounded-full text-[10px] font-bold transition-colors cursor-pointer ' +
        (dark
          ? 'bg-white/15 text-[#d299ff] hover:bg-white/25'
          : 'bg-primary/10 text-primary hover:bg-primary/20')
      }
      title={title ?? `Open quote ${id}`}
    >
      [{id}]
    </button>
  );
}

// ── Confidence chip ──────────────────────────────────────────────────────────
export function ConfidenceChip({ value, dark = false }: { value: number; dark?: boolean }) {
  const tier =
    value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low';
  const cls =
    tier === 'high'
      ? dark
        ? 'bg-green-400/20 text-green-300'
        : 'bg-green-100 text-green-700'
      : tier === 'mid'
        ? dark
          ? 'bg-amber-400/20 text-amber-300'
          : 'bg-amber-100 text-amber-700'
        : dark
          ? 'bg-white/15 text-white/70'
          : 'bg-muted text-muted-foreground';
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide ${cls}`}>
      CONF {value}
    </span>
  );
}

// ── CI Bar (visual confidence interval) ──────────────────────────────────────
export function CIBar({ position, width = 100, dark = false }: { position: number; width?: number; dark?: boolean }) {
  return (
    <div
      className="relative rounded-full"
      style={{
        width,
        height: 6,
        background: dark
          ? 'linear-gradient(90deg, rgba(135,154,255,0.15), rgba(135,154,255,0.4), rgba(135,154,255,0.15))'
          : 'linear-gradient(90deg, rgba(42,75,217,0.15), rgba(42,75,217,0.4), rgba(42,75,217,0.15))',
      }}
    >
      <div
        className="absolute"
        style={{
          left: `${position}%`,
          top: -3,
          width: 2,
          height: 12,
          background: dark ? '#d299ff' : '#2a4bd9',
        }}
      />
    </div>
  );
}

// ── Layer badge ──────────────────────────────────────────────────────────────
export type InsightLayer = 'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive';

const LAYER_META: Record<InsightLayer, { label: string; color: string; bg: string; ringColor: string }> = {
  descriptive: { label: 'Descriptive', color: 'text-blue-700', bg: 'bg-blue-100', ringColor: '#2a4bd9' },
  diagnostic: { label: 'Diagnostic', color: 'text-tertiary', bg: 'bg-tertiary/10', ringColor: '#8329c8' },
  predictive: { label: 'Predictive', color: 'text-amber-700', bg: 'bg-amber-100', ringColor: '#d97706' },
  prescriptive: { label: 'Prescriptive', color: 'text-green-700', bg: 'bg-green-100', ringColor: '#059669' },
};

export function LayerBadge({ layer, icon, dark = false }: { layer: InsightLayer; icon?: string; dark?: boolean }) {
  const m = LAYER_META[layer];
  return (
    <div className="flex items-center gap-2">
      {icon && (
        <Icon
          name={icon}
          size={16}
          style={{ color: dark ? '#d299ff' : m.ringColor }}
        />
      )}
      <span
        className={
          'text-[10px] font-black uppercase tracking-[0.18em] ' +
          (dark ? 'text-white/80' : m.color)
        }
        style={dark ? undefined : { color: m.ringColor }}
      >
        {m.label}
      </span>
    </div>
  );
}

// ── Glass card wrappers ─────────────────────────────────────────────────────
export function GlassCard({
  className = '',
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`glass-card-premium rounded-2xl ${className}`}
      style={{
        boxShadow: '0 4px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
        border: '1px solid rgba(255,255,255,0.6)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function GlassCardDark({
  className = '',
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: '#f2f1ff',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Live pulse dot ──────────────────────────────────────────────────────────
export function LiveDot({ color = '#059669', size = 6 }: { color?: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        animation: 'pulse-glow 2.5s ease-in-out infinite',
      }}
    />
  );
}
