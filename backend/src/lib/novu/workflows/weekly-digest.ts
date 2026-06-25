import { workflow } from '@novu/framework';
import { z } from 'zod';

export const weeklyDigestWorkflow = workflow(
  'weekly-digest',
  async ({ step, payload }) => {
    await step.email('weekly-digest-email', async (controls) => ({
      subject: controls.subject || `Your weekly XM digest — ${payload.weekLabel}`,
      body: `
        <h2 style="color:#1a1a2e;">Weekly XM Digest — ${payload.weekLabel}</h2>
        ${payload.narrativeHtml || `
          <p><strong>${payload.totalResponses} new responses</strong> across ${payload.activeSurveys} surveys.</p>
          ${payload.npsChange !== undefined ? `<p>NPS: <strong>${payload.npsScore}</strong> (${payload.npsChange > 0 ? '+' : ''}${payload.npsChange} vs last week)</p>` : ''}
          ${payload.topInsight ? `<p><strong>Key insight:</strong> ${payload.topInsight}</p>` : ''}
          ${payload.openCases ? `<p><strong>Open cases:</strong> ${payload.openCases}</p>` : ''}
        `}
        <p><a href="${payload.dashboardUrl || '/app'}" style="background:#2a4bd9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Open Dashboard →</a></p>
        <p style="color:#999;font-size:11px;">To unsubscribe from weekly digests, update your notification preferences.</p>
      `,
    }), {
      controlSchema: z.object({
        subject: z.string().optional(),
      }),
    });
  },
  {
    payloadSchema: z.object({
      weekLabel: z.string(),
      totalResponses: z.number(),
      activeSurveys: z.number().optional(),
      npsScore: z.number().optional(),
      npsChange: z.number().optional(),
      topInsight: z.string().optional(),
      openCases: z.number().optional(),
      narrativeHtml: z.string().optional(),
      dashboardUrl: z.string().url().optional(),
    }),
  }
);
