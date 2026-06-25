import { workflow } from '@novu/framework';
import { z } from 'zod';

export const surveyInviteWorkflow = workflow(
  'survey-invite',
  async ({ step, payload }) => {
    // Step 1: Send personalized email invite
    await step.email('send-email-invite', async (controls) => ({
      subject: controls.subject || `You're invited: ${payload.surveyTitle}`,
      body: payload.emailHtml || `
        <p>Hi ${payload.contactName || 'there'},</p>
        <p>${payload.customMessage || `We'd love your feedback on "${payload.surveyTitle}".`}</p>
        <p><a href="${payload.surveyUrl}" style="background:#2a4bd9;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">${controls.ctaLabel || 'Take Survey'}</a></p>
        <p style="color:#666;font-size:12px;">This survey takes approximately ${payload.estimatedMinutes || 3} minutes.</p>
      `,
    }), {
      controlSchema: z.object({
        subject: z.string().optional(),
        ctaLabel: z.string().optional().default('Take Survey'),
      }),
      skip: async () => !payload.surveyUrl,
    });

    // Step 2: Wait 3 days — if no response, send SMS reminder
    await step.delay('wait-for-response', async () => ({
      amount: payload.reminderDelayDays || 3,
      unit: 'days',
    }));

    // Step 3: SMS reminder (only if phone number available)
    await step.sms('sms-reminder', async () => ({
      body: `Reminder: "${payload.surveyTitle}" — Your feedback matters. ${payload.surveyUrl}`,
    }), {
      skip: async () => !payload.sendSmsReminder,
    });
  },
  {
    payloadSchema: z.object({
      surveyTitle: z.string(),
      surveyUrl: z.string().url(),
      contactName: z.string().optional(),
      customMessage: z.string().optional(),
      emailHtml: z.string().optional(),
      estimatedMinutes: z.number().optional(),
      reminderDelayDays: z.number().optional().default(3),
      sendSmsReminder: z.boolean().optional().default(false),
    }),
  }
);
