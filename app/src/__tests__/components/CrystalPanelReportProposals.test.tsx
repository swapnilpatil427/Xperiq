// Unit tests for the Phase 6 report-proposal dispatch extracted from CrystalPanel.
// resolveReportProposalAction maps view_report / trigger_manual_insight_run /
// generate_intelligence_report proposals to a concrete frontend intent.

import { describe, it, expect } from 'vitest';
import { resolveReportProposalAction } from '../../components/CrystalPanel';
import { ROUTES, toPath } from '../../constants/routes';
import type { ActionProposal } from '../../types';

function proposal(partial: Partial<ActionProposal>): ActionProposal {
  return {
    id: 'p1',
    type: 'view_report',
    priority: 'medium',
    title: 'T',
    description: 'D',
    params: {},
    requires_confirmation: true,
    ...partial,
  };
}

describe('resolveReportProposalAction', () => {
  it('view_report navigates to an explicit url when provided', () => {
    const intent = resolveReportProposalAction(
      proposal({ type: 'view_report', params: { url: '/app/surveys/s1/intelligence/reports/r1', report_id: 'r1' } }),
      's1',
    );
    expect(intent).toEqual({ kind: 'navigate', url: '/app/surveys/s1/intelligence/reports/r1' });
  });

  it('view_report builds the report route from survey + report id when no url', () => {
    const intent = resolveReportProposalAction(
      proposal({ type: 'view_report', params: { report_id: 'r1' } }),
      's1',
    );
    expect(intent).toEqual({
      kind: 'navigate',
      url: toPath(ROUTES.INSIGHT_REPORT, { surveyId: 's1', reportId: 'r1' }),
    });
  });

  it('view_report is a noop when url and report id are both missing', () => {
    const intent = resolveReportProposalAction(proposal({ type: 'view_report', params: {} }), 's1');
    expect(intent.kind).toBe('noop');
  });

  it('trigger_manual_insight_run opens the dialog with the requested mode', () => {
    expect(resolveReportProposalAction(
      proposal({ type: 'trigger_manual_insight_run', params: { mode: 'manual_quick' } }), 's1',
    )).toEqual({ kind: 'open_dialog', mode: 'quick' });

    expect(resolveReportProposalAction(
      proposal({ type: 'trigger_manual_insight_run', params: { mode: 'refresh' } }), 's1',
    )).toEqual({ kind: 'open_dialog', mode: 'refresh' });

    // default / unknown → expert
    expect(resolveReportProposalAction(
      proposal({ type: 'trigger_manual_insight_run', params: {} }), 's1',
    )).toEqual({ kind: 'open_dialog', mode: 'expert' });
  });

  it('generate_intelligence_report opens the dialog in expert mode', () => {
    expect(resolveReportProposalAction(
      proposal({ type: 'generate_intelligence_report', params: { estimated_credits: 5 } }), 's1',
    )).toEqual({ kind: 'open_dialog', mode: 'expert' });
  });

  it('returns a noop when a run proposal has no survey in scope', () => {
    const intent = resolveReportProposalAction(
      proposal({ type: 'generate_intelligence_report', params: {} }), undefined,
    );
    expect(intent.kind).toBe('noop');
  });
});
