/**
 * Egnyte integration for CoSeal.
 * Auto-uploads completed sealed documents to Egnyte.
 */

import FormData from 'form-data';
import type { CoSealIntegration } from './types.js';
import type { Envelope } from '../db/schema.js';
import { downloadDocument } from '../storage/documentStore.js';

export class EgnyteIntegration implements CoSealIntegration {
  readonly name = 'egnyte';
  readonly displayName = 'Egnyte';
  readonly description = 'Automatically upload completed documents to Egnyte';

  private domain?: string;
  private accessToken?: string;
  private folderPath?: string;

  async initialize(config: Record<string, string>): Promise<void> {
    const { EGNYTE_DOMAIN, EGNYTE_ACCESS_TOKEN, EGNYTE_FOLDER_PATH } = config;

    if (!EGNYTE_DOMAIN) {
      throw new Error('EGNYTE_DOMAIN is required (e.g., "mycompany")');
    }

    if (!EGNYTE_ACCESS_TOKEN) {
      throw new Error('EGNYTE_ACCESS_TOKEN is required');
    }

    if (!EGNYTE_FOLDER_PATH) {
      throw new Error('EGNYTE_FOLDER_PATH is required (e.g., "/Shared/Signatures")');
    }

    this.domain = EGNYTE_DOMAIN;
    this.accessToken = EGNYTE_ACCESS_TOKEN;
    this.folderPath = EGNYTE_FOLDER_PATH;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.domain || !this.accessToken || !this.folderPath) {
        throw new Error('Egnyte integration not initialized');
      }

      // Test by checking folder existence
      const response = await fetch(
        `https://${this.domain}.egnyte.com/pubapi/v1/fs${this.folderPath}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Egnyte API error: ${response.status} ${response.statusText}`);
      }

      return { success: true, message: 'Successfully connected to Egnyte' };
    } catch (error) {
      return {
        success: false,
        message: `Egnyte connection failed: ${(error as Error).message}`,
      };
    }
  }

  async onEnvelopeCompleted(envelope: Envelope): Promise<void> {
    try {
      if (!this.domain || !this.accessToken || !this.folderPath) {
        throw new Error('Egnyte integration not initialized');
      }

      // Download sealed document
      if (!envelope.sealedKey) {
        console.warn(`Envelope ${envelope.id} has no sealed document to upload`);
        return;
      }

      const documentBuffer = await downloadDocument(envelope.sealedKey);

      // Generate filename
      const filename = `${envelope.subject.replace(/[^a-z0-9\s-]/gi, '_')}_signed_${envelope.id.slice(0, 8)}.pdf`;
      const uploadPath = `${this.folderPath}/${filename}`;

      // Upload to Egnyte
      const formData = new FormData();
      formData.append('file', documentBuffer, {
        filename,
        contentType: 'application/pdf',
      });

      const response = await fetch(
        `https://${this.domain}.egnyte.com/pubapi/v1/fs-content${uploadPath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            ...formData.getHeaders(),
          },
          body: formData as any,
        },
      );

      if (!response.ok) {
        throw new Error(`Egnyte upload failed: ${response.status} ${response.statusText}`);
      }

      console.log(`✓ Uploaded ${filename} to Egnyte: ${uploadPath}`);
    } catch (error) {
      console.error(`Failed to upload to Egnyte:`, error);
      // Don't throw — integrations should not break the signing flow
    }
  }
}
