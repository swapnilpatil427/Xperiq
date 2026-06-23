// Dashboard narrative builder — "Crystal writes the story" (the dashboard's
// headline differentiator). Produces a 2-3 paragraph plain-English briefing from
// the org's KPIs + period-over-period deltas. Deterministic (testable, free); an
// LLM pass can enrich `headline`/`paragraphs` later behind the same shape.

export interface NarrativeKpis {
  nps?: number | null;
  npsDelta?: number | null;
  csat?: number | null;
  csatDelta?: number | null;
  responses?: number | null;
  responsesDelta?: number | null;
  activeSurveys?: number | null;
}

export interface NarrativeExtra {
  topMover?: { title: string; npsDelta?: number | null } | null;
  period?: string;
}

export interface NarrativeResult {
  headline: string;
  paragraphs: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
}

function arrow(delta: number | null | undefined): string {
  if (delta == null) return '';
  if (delta > 0) return `up ${Math.abs(round(delta))}`;
  if (delta < 0) return `down ${Math.abs(round(delta))}`;
  return 'flat';
}

function round(n: number): number { return Math.round(n * 10) / 10; }

/**
 * @param kpis  { nps, npsDelta, csat, csatDelta, responses, responsesDelta, activeSurveys }
 * @param extra { topMover?, period? }
 */
export function buildNarrative(kpis: NarrativeKpis, extra: NarrativeExtra = {}): NarrativeResult {
  const period = extra.period || 'the last 30 days';
  const paragraphs: string[] = [];

  // Para 1 — the headline movement.
  if (kpis.nps != null) {
    const dir = kpis.npsDelta == null ? 'held steady'
      : kpis.npsDelta > 0 ? `rose to ${round(kpis.nps)} (${arrow(kpis.npsDelta)} points)`
      : kpis.npsDelta < 0 ? `slipped to ${round(kpis.nps)} (${arrow(kpis.npsDelta)} points)`
      : `held at ${round(kpis.nps)}`;
    paragraphs.push(`Over ${period}, organization-wide NPS ${dir}.`);
  } else {
    paragraphs.push(`Over ${period}, your portfolio collected ${kpis.responses || 0} responses across ${kpis.activeSurveys || 0} active surveys.`);
  }

  // Para 2 — volume + engagement.
  const volBits: string[] = [];
  if (kpis.responses != null) {
    volBits.push(`${kpis.responses} responses came in`
      + (kpis.responsesDelta != null ? ` (${arrow(kpis.responsesDelta)} vs. the prior period)` : ''));
  }
  if (kpis.csat != null) {
    volBits.push(`CSAT is ${round(kpis.csat)}`
      + (kpis.csatDelta ? ` (${arrow(kpis.csatDelta)})` : ''));
  }
  if (volBits.length) paragraphs.push(volBits.join('; ') + '.');

  // Para 3 — top mover / where to look.
  if (extra.topMover && extra.topMover.title) {
    const m = extra.topMover;
    paragraphs.push(
      `The biggest mover was "${m.title}"`
      + (m.npsDelta != null ? `, where NPS moved ${arrow(m.npsDelta)} points` : '')
      + `. Worth a closer look.`
    );
  }

  const sentiment: 'positive' | 'negative' | 'neutral' =
    (kpis.npsDelta ?? 0) > 0 ? 'positive' : (kpis.npsDelta ?? 0) < 0 ? 'negative' : 'neutral';
  const headline = (kpis.npsDelta ?? 0) > 0
    ? 'Momentum is positive'
    : (kpis.npsDelta ?? 0) < 0 ? 'Attention needed' : 'Holding steady';

  return { headline, paragraphs, sentiment };
}
