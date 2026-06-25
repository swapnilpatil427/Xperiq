import { workflow } from '@novu/framework';
import { z } from 'zod';

export const slaBreachWorkflow = workflow(
  'sla-breach',
  async ({ step, payload }) => {
    await step.inApp('sla-inapp', async () => ({
      subject: `⏰ SLA breach: ${payload.caseTitle}`,
      body: `${payload.tier} SLA breached by ${payload.overdueBy}. Escalated to ${payload.escalatedTo}.`,
      redirect: { url: payload.caseUrl || '/app/cases' },
    }));

    await step.sms('sla-sms', async () => ({
      body: `⏰ SLA BREACH — Case: "${payload.caseTitle}" (${payload.tier}). Escalated to ${payload.escalatedTo}. ${payload.caseUrl}`,
    }), {
      skip: async () => !payload.sendSms,
    });

    await step.chat('sla-slack', async () => ({
      body: `⏰ *SLA Breach — ${payload.tier}*\n*Case:* ${payload.caseTitle}\n*Overdue by:* ${payload.overdueBy}\n*Escalated to:* ${payload.escalatedTo}\n<${payload.caseUrl}|View Case>`,
    }), {
      skip: async () => !payload.sendToSlack,
    });
  },
  {
    payloadSchema: z.object({
      caseTitle: z.string(),
      tier: z.string(),
      overdueBy: z.string(),
      escalatedTo: z.string(),
      caseUrl: z.string().optional(),
      sendSms: z.boolean().optional().default(false),
      sendToSlack: z.boolean().optional().default(true),
    }),
  }
);
