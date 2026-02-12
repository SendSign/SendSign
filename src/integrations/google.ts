/**
 * Google Drive integration for SendSign.
 * Auto-uploads completed sealed documents to Google Drive.
 */

import type { SendSignIntegration } from './types.js';
import type { Envelope } from '../db/schema.js';
import { downloadDocument } from '../storage/documentStore.js';

export class GoogleDriveIntegration implements SendSignIntegration {
  readonly name = 'google';
  readonly displayName = 'Google Drive';
  readonly description = 'Automatically upload completed documents to Google Drive';

  private drive?: any;
  private folderId?: string;

  async initialize(config: Record<string, string>): Promise<void> {
    const { GOOGLE_SERVICE_ACCOUNT_KEY_PATH, GOOGLE_DRIVE_FOLDER_ID } = config;

    if (!GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required');
    }

    if (!GOOGLE_DRIVE_FOLDER_ID) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID is required');
    }

    this.folderId = GOOGLE_DRIVE_FOLDER_ID;

    // Load service account credentials (lazy import)
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      keyFile: GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    this.drive = google.drive({ version: 'v3', auth });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.drive || !this.folderId) {
        throw new Error('Google Drive integration not initialized');
      }

      // Test by getting folder metadata
      await this.drive.files.get({
        fileId: this.folderId,
        fields: 'id, name',
      });

      return { success: true, message: 'Successfully connected to Google Drive' };
    } catch (error) {
      return {
        success: false,
        message: `Google Drive connection failed: ${(error as Error).message}`,
      };
    }
  }

  async onEnvelopeCompleted(envelope: Envelope): Promise<void> {
    try {
      if (!this.drive || !this.folderId) {
        throw new Error('Google Drive integration not initialized');
      }

      // Download sealed document
      if (!envelope.sealedKey) {
        console.warn(`Envelope ${envelope.id} has no sealed document to upload`);
        return;
      }

      const documentBuffer = await downloadDocument(envelope.sealedKey);

      // Generate filename
      const filename = `${envelope.subject.replace(/[^a-z0-9\s-]/gi, '_')}_signed_${envelope.id.slice(0, 8)}.pdf`;

      // Convert buffer to stream
      const { Readable } = await import('stream');
      const bufferStream = Readable.from(documentBuffer);

      // Upload to Google Drive
      await this.drive.files.create({
        requestBody: {
          name: filename,
          parents: [this.folderId],
          mimeType: 'application/pdf',
        },
        media: {
          mimeType: 'application/pdf',
          body: bufferStream,
        },
        fields: 'id, name',
      });

      console.log(`✓ Uploaded ${filename} to Google Drive folder ${this.folderId}`);
    } catch (error) {
      console.error(`Failed to upload to Google Drive:`, error);
      // Don't throw — integrations should not break the signing flow
    }
  }
}
