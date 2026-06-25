import { workflow } from '@novu/framework';
import { z } from 'zod';

export const responseAlertWorkflow = workflow(
  'response-alert',
  async ({ step, payload }) => {
    await step.inApp('response-inapp-alert', async () => ({
      subject: `New ${payload.responseType || 'response'} on "${payload.surveyTitle}"`,
      body: payload.alertSummary || `Score: ${payload.score} — ${payload.sentiment}`,
      redirect: { url: payload.responseUrl || '/app' },
    }));

    await step.chat('response-slack-alert', async () => ({
      body: `🔔 *New ${payload.responseType || 'Response'}*\n*Survey:* ${payload.surveyTitle}\n*Score:* ${payload.score}\n*Sentiment:* ${payload.sentiment}\n${payload.verbatim ? `*Verbatim:* "${payload.verbatim.slice(0, 200)}"` : ''}\n<${payload.responseUrl}|View Response>`,
    }), {
      skip: async () => !payload.sendToSlack,
    });
  },
  {
    payloadSchema: z.object({
      surveyTitle: z.string(),
      responseType: z.string().optional(),
      score: z.number().optional(),
      sentiment: z.string().optional(),
      alertSummary: z.string().optional(),
      verbatim: z.string().optional(),
      responseUrl: z.string().url().optional(),
      sendToSlack: z.boolean().optional().default(true),
    }),
  }
);
