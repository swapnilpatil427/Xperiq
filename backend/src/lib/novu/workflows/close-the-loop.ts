import { workflow } from '@novu/framework';
import { z } from 'zod';

export const closeTheLoopWorkflow = workflow(
  'close-the-loop',
  async ({ step, payload }) => {
    await step.email('close-loop-email', async (controls) => ({
      subject: controls.subject || `We hear you, ${payload.contactName || 'valued customer'}`,
      body: payload.emailHtml || `
        <p>Hi ${payload.contactName || 'there'},</p>
        <p>Thank you for your recent feedback. ${payload.acknowledgment || 'We take your input seriously and wanted to follow up.'}</p>
        ${payload.actionTaken ? `<p><strong>What we've done:</strong> ${payload.actionTaken}</p>` : ''}
        ${payload.ctaUrl ? `<p><a href="${payload.ctaUrl}" style="background:#059669;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">${controls.ctaLabel || 'Learn More'}</a></p>` : ''}
        <p>Best regards,<br>${payload.senderName || 'The Team'}</p>
      `,
    }), {
      controlSchema: z.object({
        subject: z.string().optional(),
        ctaLabel: z.string().optional().default('Learn More'),
      }),
    });

    await step.inApp('close-loop-inapp', async () => ({
      subject: `Follow-up from ${payload.senderName || 'your team'}`,
      body: payload.acknowledgment || 'We\'ve reviewed your feedback and wanted to update you.',
      avatar: payload.senderAvatar,
      redirect: { url: payload.ctaUrl || '/app' },
    }));
  },
  {
    payloadSchema: z.object({
      contactName: z.string().optional(),
      acknowledgment: z.string().optional(),
      actionTaken: z.string().optional(),
      ctaUrl: z.string().url().optional(),
      senderName: z.string().optional(),
      senderAvatar: z.string().optional(),
      emailHtml: z.string().optional(),
    }),
  }
);
