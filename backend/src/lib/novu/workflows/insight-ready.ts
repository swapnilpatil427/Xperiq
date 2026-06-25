import { workflow } from '@novu/framework';
import { z } from 'zod';

export const insightReadyWorkflow = workflow(
  'insight-ready',
  async ({ step, payload }) => {
    await step.inApp('insight-inapp', async () => ({
      subject: `Crystal insights ready for "${payload.surveyTitle}"`,
      body: payload.narrativeSummary || `${payload.insightCount} insights generated. Top driver: ${payload.topDriver}`,
      redirect: { url: payload.insightsUrl || '/app' },
    }));

    await step.email('insight-email', async (controls) => ({
      subject: controls.subject || `Crystal insights ready — ${payload.surveyTitle}`,
      body: `
        <p><strong>✨ Crystal has finished analyzing "${payload.surveyTitle}"</strong></p>
        ${payload.narrativeSummary ? `<p>${payload.narrativeSummary}</p>` : ''}
        <p><strong>${payload.insightCount} insights</strong> generated across ${payload.responseCount} responses.</p>
        ${payload.topDriver ? `<p><strong>Top driver:</strong> ${payload.topDriver}</p>` : ''}
        <p><a href="${payload.insightsUrl || '/app'}" style="background:#2a4bd9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">View Insights →</a></p>
      `,
    }), {
      controlSchema: z.object({ subject: z.string().optional() }),
      skip: async () => !payload.sendEmail,
    });
  },
  {
    payloadSchema: z.object({
      surveyTitle: z.string(),
      insightCount: z.number(),
      responseCount: z.number().optional(),
      narrativeSummary: z.string().optional(),
      topDriver: z.string().optional(),
      insightsUrl: z.string().url().optional(),
      sendEmail: z.boolean().optional().default(true),
    }),
  }
);
