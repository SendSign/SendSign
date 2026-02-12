/**
 * Microsoft 365 / SharePoint integration for SendSign.
 * Auto-uploads completed sealed documents to OneDrive or SharePoint.
 */

import type { SendSignIntegration } from './types.js';
import type { Envelope } from '../db/schema.js';
import { downloadDocument } from '../storage/documentStore.js';

export class Microsoft365Integration implements SendSignIntegration {
  readonly name = 'microsoft365';
  readonly displayName = 'Microsoft 365';
  readonly description = 'Automatically upload completed documents to OneDrive or SharePoint';

  private tenantId?: string;
  private clientId?: string;
  private clientSecret?: string;
  private driveId?: string;
  private folderId?: string;
  private accessToken?: string;

  async initialize(config: Record<string, string>): Promise<void> {
    const {
      MS365_TENANT_ID,
      MS365_CLIENT_ID,
      MS365_CLIENT_SECRET,
      MS365_DRIVE_ID,
      MS365_FOLDER_ID,
    } = config;

    if (!MS365_TENANT_ID || !MS365_CLIENT_ID || !MS365_CLIENT_SECRET) {
      throw new Error('MS365_TENANT_ID, MS365_CLIENT_ID, and MS365_CLIENT_SECRET are required');
    }

    if (!MS365_DRIVE_ID) {
      throw new Error('MS365_DRIVE_ID is required (OneDrive or SharePoint drive ID)');
    }

    this.tenantId = MS365_TENANT_ID;
    this.clientId = MS365_CLIENT_ID;
    this.clientSecret = MS365_CLIENT_SECRET;
    this.driveId = MS365_DRIVE_ID;
    this.folderId = MS365_FOLDER_ID || 'root'; // Default to root folder

    // Get access token
    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams({
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`Failed to get MS365 access token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.accessToken || !this.driveId) {
        throw new Error('Microsoft 365 integration not initialized');
      }

      // Test by getting drive info
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${this.driveId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Microsoft Graph API error: ${response.status} ${response.statusText}`);
      }

      return { success: true, message: 'Successfully connected to Microsoft 365' };
    } catch (error) {
      return {
        success: false,
        message: `Microsoft 365 connection failed: ${(error as Error).message}`,
      };
    }
  }

  async onEnvelopeCompleted(envelope: Envelope): Promise<void> {
    try {
      if (!this.accessToken || !this.driveId) {
        throw new Error('Microsoft 365 integration not initialized');
      }

      // Download sealed document
      if (!envelope.sealedKey) {
        console.warn(`Envelope ${envelope.id} has no sealed document to upload`);
        return;
      }

      const documentBuffer = await downloadDocument(envelope.sealedKey);

      // Generate filename
      const filename = `${envelope.subject.replace(/[^a-z0-9\s-]/gi, '_')}_signed_${envelope.id.slice(0, 8)}.pdf`;

      // Upload to Microsoft 365 using simple upload API (for files < 4MB)
      const uploadUrl = this.folderId === 'root'
        ? `https://graph.microsoft.com/v1.0/drives/${this.driveId}/root:/${filename}:/content`
        : `https://graph.microsoft.com/v1.0/drives/${this.driveId}/items/${this.folderId}:/${filename}:/content`;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/pdf',
        },
        body: documentBuffer,
      });

      if (!response.ok) {
        throw new Error(`Microsoft 365 upload failed: ${response.status} ${response.statusText}`);
      }

      console.log(`✓ Uploaded ${filename} to Microsoft 365 drive ${this.driveId}`);
    } catch (error) {
      console.error(`Failed to upload to Microsoft 365:`, error);
      // Don't throw — integrations should not break the signing flow
    }
  }
}
