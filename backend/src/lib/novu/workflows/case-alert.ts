import { workflow } from '@novu/framework';
import { z } from 'zod';

const SEVERITY_EMOJI: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

export const caseAlertWorkflow = workflow(
  'case-alert',
  async ({ step, payload }) => {
    const emoji = SEVERITY_EMOJI[payload.severity] ?? '⚪';

    await step.inApp('case-inapp', async () => ({
      subject: `${emoji} New ${payload.severity} case: ${payload.caseTitle}`,
      body: `Assigned to: ${payload.ownerLabel}${payload.surveyTitle ? ` | Survey: ${payload.surveyTitle}` : ''}`,
      redirect: { url: payload.caseUrl || '/app/cases' },
    }));

    await step.email('case-email', async (controls) => ({
      subject: controls.subject || `${emoji} New ${payload.severity} case: ${payload.caseTitle}`,
      body: `
        <p><strong>${emoji} New ${payload.severity} Case</strong></p>
        <p><strong>Title:</strong> ${payload.caseTitle}</p>
        <p><strong>Assigned to:</strong> ${payload.ownerLabel}</p>
        ${payload.surveyTitle ? `<p><strong>Survey:</strong> ${payload.surveyTitle}</p>` : ''}
        ${payload.driverRef ? `<p><strong>Driver:</strong> ${payload.driverRef}</p>` : ''}
        <p><a href="${payload.caseUrl || '/app/cases'}">View Case →</a></p>
      `,
    }), {
      controlSchema: z.object({ subject: z.string().optional() }),
      skip: async () => !payload.sendEmail,
    });

    await step.chat('case-slack', async () => ({
      body: `${emoji} *New ${payload.severity.charAt(0).toUpperCase() + payload.severity.slice(1)} Case: ${payload.caseTitle}*\n*Assigned to:* ${payload.ownerLabel}${payload.surveyTitle ? `\n*Survey:* ${payload.surveyTitle}` : ''}`,
    }), {
      skip: async () => !payload.sendToSlack,
    });
  },
  {
    payloadSchema: z.object({
      caseTitle: z.string(),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      ownerLabel: z.string(),
      surveyTitle: z.string().optional(),
      driverRef: z.string().optional(),
      caseUrl: z.string().optional(),
      sendEmail: z.boolean().optional().default(true),
      sendToSlack: z.boolean().optional().default(true),
    }),
  }
);
