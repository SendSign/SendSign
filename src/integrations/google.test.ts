import { describe, it, expect } from 'vitest';
import { GoogleDriveIntegration } from './google.js';

describe('GoogleDriveIntegration', () => {
  let integration: GoogleDriveIntegration;

  beforeEach(() => {
    integration = new GoogleDriveIntegration();
  });

  it('should have correct metadata', () => {
    expect(integration.name).toBe('google');
    expect(integration.displayName).toBe('Google Drive');
    expect(integration.description).toContain('Google Drive');
  });

  it('should require GOOGLE_SERVICE_ACCOUNT_KEY_PATH', async () => {
    await expect(integration.initialize({})).rejects.toThrow('GOOGLE_SERVICE_ACCOUNT_KEY_PATH');
  });

  it('should require GOOGLE_DRIVE_FOLDER_ID', async () => {
    await expect(integration.initialize({
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
    })).rejects.toThrow('GOOGLE_DRIVE_FOLDER_ID');
  });

  // Note: Full Google Drive tests require a service account and real folder
  // Integration tests should use a test Google Drive account
});
