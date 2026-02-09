import { describe, it, expect } from 'vitest';
import { BoxIntegration } from './box.js';

describe('BoxIntegration', () => {
  let integration: BoxIntegration;

  beforeEach(() => {
    integration = new BoxIntegration();
  });

  it('should have correct metadata', () => {
    expect(integration.name).toBe('box');
    expect(integration.displayName).toBe('Box');
    expect(integration.description).toContain('Box');
  });

  it('should require BOX_CLIENT_ID', async () => {
    await expect(integration.initialize({})).rejects.toThrow('BOX_CLIENT_ID');
  });

  it('should require BOX_FOLDER_ID', async () => {
    await expect(integration.initialize({
      BOX_CLIENT_ID: 'id',
      BOX_CLIENT_SECRET: 'secret',
      BOX_ACCESS_TOKEN: 'token',
    })).rejects.toThrow('BOX_FOLDER_ID');
  });

  // Note: Full Box SDK tests require mocking the Box SDK
  // Integration tests should use a real Box sandbox account
});
