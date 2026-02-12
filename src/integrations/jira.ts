/**
 * Jira integration for SendSign.
 * Creates or updates Jira tickets when envelopes reach milestones.
 */

import type { SendSignIntegration } from './types.js';
import type { Envelope } from '../db/schema.js';
import { downloadDocument } from '../storage/documentStore.js';

export class JiraIntegration implements SendSignIntegration {
  readonly name = 'jira';
  readonly displayName = 'Jira';
  readonly description = 'Create Jira tickets and attach completed documents';

  private jiraUrl?: string;
  private email?: string;
  private apiToken?: string;
  private projectKey?: string;

  async initialize(config: Record<string, string>): Promise<void> {
    const { JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = config;

    if (!JIRA_URL) {
      throw new Error('JIRA_URL is required (e.g., "https://yourcompany.atlassian.net")');
    }

    if (!JIRA_EMAIL || !JIRA_API_TOKEN) {
      throw new Error('JIRA_EMAIL and JIRA_API_TOKEN are required for authentication');
    }

    if (!JIRA_PROJECT_KEY) {
      throw new Error('JIRA_PROJECT_KEY is required (e.g., "SIGN")');
    }

    this.jiraUrl = JIRA_URL.replace(/\/$/, '');
    this.email = JIRA_EMAIL;
    this.apiToken = JIRA_API_TOKEN;
    this.projectKey = JIRA_PROJECT_KEY;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.jiraUrl || !this.email || !this.apiToken) {
        throw new Error('Jira integration not initialized');
      }

      // Test by getting user info
      const response = await this.makeRequest('GET', '/rest/api/3/myself');

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
      }

      return { success: true, message: 'Successfully connected to Jira' };
    } catch (error) {
      return {
        success: false,
        message: `Jira connection failed: ${(error as Error).message}`,
      };
    }
  }

  async onEnvelopeSent(envelope: Envelope): Promise<void> {
    try {
      // Create a Jira ticket when envelope is sent
      const issue = await this.createIssue({
        summary: `Document sent for signature: ${envelope.subject}`,
        description: `A document has been sent for signature.\n\n*Subject:* ${envelope.subject}\n*Envelope ID:* ${envelope.id}\n*Signers:* ${envelope.signers?.length ?? 0}\n*Status:* Sent`,
        issueType: 'Task',
      });

      console.log(`✓ Created Jira ticket ${issue.key} for envelope ${envelope.id}`);
    } catch (error) {
      console.error(`Failed to create Jira ticket:`, error);
      // Don't throw — integrations should not break the signing flow
    }
  }

  async onEnvelopeCompleted(envelope: Envelope): Promise<void> {
    try {
      // Search for existing ticket
      const tickets = await this.searchIssues(`project = ${this.projectKey} AND text ~ "${envelope.id}"`);

      if (tickets.length > 0) {
        // Update existing ticket
        const issueKey = tickets[0].key;

        // Add comment
        await this.addComment(
          issueKey,
          `✅ Document has been fully signed and completed.\n\n*Envelope ID:* ${envelope.id}\n*Completed:* ${new Date(envelope.completedAt!).toLocaleString()}`,
        );

        // Attach sealed document if available
        if (envelope.sealedKey) {
          const documentBuffer = await downloadDocument(envelope.sealedKey);
          const filename = `${envelope.subject.replace(/[^a-z0-9\s-]/gi, '_')}_signed.pdf`;

          await this.addAttachment(issueKey, documentBuffer, filename);
          console.log(`✓ Attached sealed document to Jira ticket ${issueKey}`);
        }

        // Try to transition to "Done" status
        await this.transitionIssue(issueKey, 'Done');
      } else {
        // Create new ticket for completed envelope
        const issue = await this.createIssue({
          summary: `Document signed: ${envelope.subject}`,
          description: `A document has been fully signed.\n\n*Subject:* ${envelope.subject}\n*Envelope ID:* ${envelope.id}\n*Completed:* ${new Date(envelope.completedAt!).toLocaleString()}`,
          issueType: 'Task',
        });

        console.log(`✓ Created Jira ticket ${issue.key} for completed envelope ${envelope.id}`);
      }
    } catch (error) {
      console.error(`Failed to update Jira:`, error);
      // Don't throw — integrations should not break the signing flow
    }
  }

  async onSignerCompleted(
    signer: { id: string; name: string; email: string },
    envelope: Envelope,
  ): Promise<void> {
    try {
      // Search for existing ticket
      const tickets = await this.searchIssues(`project = ${this.projectKey} AND text ~ "${envelope.id}"`);

      if (tickets.length > 0) {
        // Add comment about signer completion
        const issueKey = tickets[0].key;
        await this.addComment(
          issueKey,
          `✍️ Signer completed: *${signer.name}* (${signer.email})`,
        );
      }
    } catch (error) {
      console.error(`Failed to update Jira:`, error);
      // Don't throw — integrations should not break the signing flow
    }
  }

  // ─── Helper methods ─────────────────────────────────────────────

  private async makeRequest(method: string, path: string, body?: unknown): Promise<Response> {
    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');

    return fetch(`${this.jiraUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async createIssue(data: {
    summary: string;
    description: string;
    issueType: string;
  }): Promise<{ key: string; id: string }> {
    const response = await this.makeRequest('POST', '/rest/api/3/issue', {
      fields: {
        project: { key: this.projectKey },
        summary: data.summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: data.description }],
            },
          ],
        },
        issuetype: { name: data.issueType },
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create Jira issue: ${response.status} ${text}`);
    }

    return response.json();
  }

  private async searchIssues(jql: string): Promise<Array<{ key: string; id: string }>> {
    const response = await this.makeRequest(
      'GET',
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=1`,
    );

    if (!response.ok) {
      throw new Error(`Jira search failed: ${response.status}`);
    }

    const data = await response.json();
    return data.issues || [];
  }

  private async addComment(issueKey: string, text: string): Promise<void> {
    const response = await this.makeRequest('POST', `/rest/api/3/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text }],
          },
        ],
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to add Jira comment: ${response.status}`);
    }
  }

  private async addAttachment(
    issueKey: string,
    fileBuffer: Buffer,
    filename: string,
  ): Promise<void> {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename, contentType: 'application/pdf' });

    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');

    const response = await fetch(`${this.jiraUrl}/rest/api/3/issue/${issueKey}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'X-Atlassian-Token': 'no-check',
        ...formData.getHeaders(),
      },
      body: formData as any,
    });

    if (!response.ok) {
      throw new Error(`Failed to attach file to Jira: ${response.status}`);
    }
  }

  private async transitionIssue(issueKey: string, status: string): Promise<void> {
    // Get available transitions
    const transitionsResponse = await this.makeRequest('GET', `/rest/api/3/issue/${issueKey}/transitions`);

    if (!transitionsResponse.ok) return;

    const { transitions } = await transitionsResponse.json();
    const transition = transitions.find((t: any) => t.to.name === status || t.name === status);

    if (transition) {
      await this.makeRequest('POST', `/rest/api/3/issue/${issueKey}/transitions`, {
        transition: { id: transition.id },
      });
    }
  }
}
