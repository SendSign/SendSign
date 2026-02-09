/**
 * Box integration for CoSeal.
 * Auto-uploads completed sealed documents to Box.
 */

import type { CoSealIntegration } from './types.js';
import type { Envelope } from '../db/schema.js';
import { downloadDocument } from '../storage/documentStore.js';

export class BoxIntegration implements CoSealIntegration {
  readonly name = 'box';
  readonly displayName = 'Box';
  readonly description = 'Automatically upload completed documents to Box';

  private client?: any;
  private folderId?: string;

  async initialize(config: Record<string, string>): Promise<void> {
    const { BOX_CLIENT_ID, BOX_CLIENT_SECRET, BOX_ACCESS_TOKEN, BOX_FOLDER_ID } = config;

    if (!BOX_CLIENT_ID || !BOX_CLIENT_SECRET || !BOX_ACCESS_TOKEN) {
      throw new Error('BOX_CLIENT_ID, BOX_CLIENT_SECRET, and BOX_ACCESS_TOKEN are required');
    }

    if (!BOX_FOLDER_ID) {
      throw new Error('BOX_FOLDER_ID is required — specify the Box folder to upload documents to');
    }

    this.folderId = BOX_FOLDER_ID;

    // Initialize Box SDK (lazy import)
    const BoxSDK = (await import('box-node-sdk')).default;
    const sdk = new BoxSDK({
      clientID: BOX_CLIENT_ID,
      clientSecret: BOX_CLIENT_SECRET,
    });

    // Use provided access token (in production, implement OAuth refresh flow)
    this.client = sdk.getBasicClient(BOX_ACCESS_TOKEN);
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.client || !this.folderId) {
        throw new Error('Box integration not initialized');
      }

      // Test by getting folder info
      await this.client.folders.get(this.folderId);

      return { success: true, message: 'Successfully connected to Box' };
    } catch (error) {
      return {
        success: false,
        message: `Box connection failed: ${(error as Error).message}`,
      };
    }
  }

  async onEnvelopeCompleted(envelope: Envelope): Promise<void> {
    try {
      if (!this.client || !this.folderId) {
        throw new Error('Box integration not initialized');
      }

      // Download sealed document
      if (!envelope.sealedKey) {
        console.warn(`Envelope ${envelope.id} has no sealed document to upload`);
        return;
      }

      const documentBuffer = await downloadDocument(envelope.sealedKey);

      // Generate filename
      const filename = `${envelope.subject.replace(/[^a-z0-9\s-]/gi, '_')}_signed_${envelope.id.slice(0, 8)}.pdf`;

      // Upload to Box
      const { PassThrough } = await import('stream');
      const bufferStream = new PassThrough();
      bufferStream.end(documentBuffer);

      await this.client.files.uploadFile(this.folderId, filename, bufferStream);

      console.log(`✓ Uploaded ${filename} to Box folder ${this.folderId}`);
    } catch (error) {
      console.error(`Failed to upload to Box:`, error);
      // Don't throw — integrations should not break the signing flow
    }
  }
}
