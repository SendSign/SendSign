/**
 * Slack integration for SendSign.
 * Sends notifications to a Slack channel when envelope events occur.
 */

import type { SendSignIntegration } from './types.js';
import type { Envelope } from '../db/schema.js';

export class SlackIntegration implements SendSignIntegration {
  readonly name = 'slack';
  readonly displayName = 'Slack';
  readonly description = 'Send notifications to Slack when documents are signed';

  private webhookUrl?: string;

  async initialize(config: Record<string, string>): Promise<void> {
    this.webhookUrl = config.SLACK_WEBHOOK_URL;

    if (!this.webhookUrl) {
      throw new Error('SLACK_WEBHOOK_URL is required for Slack integration');
    }

    // Validate webhook URL format
    if (!this.webhookUrl.startsWith('https://hooks.slack.com/')) {
      throw new Error('Invalid Slack webhook URL format');
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.sendMessage({
        text: '✅ SendSign integration test successful!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*SendSign Integration Test*\n\nYour Slack integration is working correctly! You\'ll receive notifications here when documents are sent, signed, and completed.',
            },
          },
        ],
      });

      return { success: true, message: 'Test message sent to Slack successfully' };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send test message: ${(error as Error).message}`,
      };
    }
  }

  async onEnvelopeSent(envelope: Envelope): Promise<void> {
    const signerCount = envelope.signers?.length ?? 0;
    const signerNames = envelope.signers?.slice(0, 3).map((s: any) => s.name).join(', ') ?? '';
    const moreSigners = signerCount > 3 ? ` +${signerCount - 3} more` : '';

    await this.sendMessage({
      text: `📤 Document sent for signature: ${envelope.subject}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📤 Document Sent for Signature*\n\n*Subject:* ${envelope.subject}\n*Signers:* ${signerNames}${moreSigners} (${signerCount} total)\n*Status:* Awaiting signatures`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Envelope ID: \`${envelope.id}\` • Sent at ${new Date(envelope.sentAt!).toLocaleString()}`,
            },
          ],
        },
      ],
    });
  }

  async onEnvelopeCompleted(envelope: Envelope): Promise<void> {
    const signerCount = envelope.signers?.length ?? 0;

    await this.sendMessage({
      text: `✅ Document fully signed: ${envelope.subject}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*✅ Document Fully Signed*\n\n*Subject:* ${envelope.subject}\n*Signers:* ${signerCount} signers completed\n*Status:* Completed`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Envelope ID: \`${envelope.id}\` • Completed at ${new Date(envelope.completedAt!).toLocaleString()}`,
            },
          ],
        },
      ],
    });
  }

  async onEnvelopeVoided(envelope: Envelope): Promise<void> {
    await this.sendMessage({
      text: `🚫 Document voided: ${envelope.subject}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚫 Document Voided*\n\n*Subject:* ${envelope.subject}\n*Status:* Voided`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Envelope ID: \`${envelope.id}\``,
            },
          ],
        },
      ],
    });
  }

  async onSignerCompleted(
    signer: { id: string; name: string; email: string },
    envelope: Envelope,
  ): Promise<void> {
    const signerCount = envelope.signers?.length ?? 0;
    const completedCount = envelope.signers?.filter((s: any) => s.status === 'completed').length ?? 0;

    await this.sendMessage({
      text: `✍️ ${signer.name} signed: ${envelope.subject}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*✍️ Signer Completed*\n\n*Document:* ${envelope.subject}\n*Signer:* ${signer.name}\n*Progress:* ${completedCount} of ${signerCount} signers completed`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Envelope ID: \`${envelope.id}\``,
            },
          ],
        },
      ],
    });
  }

  private async sendMessage(message: unknown): Promise<void> {
    if (!this.webhookUrl) {
      throw new Error('Slack integration not initialized');
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Slack API error: ${response.status} ${text}`);
    }
  }
}
