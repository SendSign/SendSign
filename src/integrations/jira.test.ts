import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraIntegration } from './jira.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('JiraIntegration', () => {
  let integration: JiraIntegration;

  beforeEach(() => {
    integration = new JiraIntegration();
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    });
  });

  it('should have correct metadata', () => {
    expect(integration.name).toBe('jira');
    expect(integration.displayName).toBe('Jira');
    expect(integration.description).toContain('Jira');
  });

  it('should require JIRA_URL', async () => {
    await expect(integration.initialize({})).rejects.toThrow('JIRA_URL is required');
  });

  it('should require authentication credentials', async () => {
    await expect(integration.initialize({
      JIRA_URL: 'https://company.atlassian.net',
    })).rejects.toThrow('JIRA_EMAIL and JIRA_API_TOKEN are required');
  });

  it('should require JIRA_PROJECT_KEY', async () => {
    await expect(integration.initialize({
      JIRA_URL: 'https://company.atlassian.net',
      JIRA_EMAIL: 'user@company.com',
      JIRA_API_TOKEN: 'token',
    })).rejects.toThrow('JIRA_PROJECT_KEY');
  });

  it('should initialize with valid config', async () => {
    await integration.initialize({
      JIRA_URL: 'https://company.atlassian.net',
      JIRA_EMAIL: 'user@company.com',
      JIRA_API_TOKEN: 'token',
      JIRA_PROJECT_KEY: 'SIGN',
    });

    expect(integration).toBeDefined();
  });

  it('should test connection', async () => {
    await integration.initialize({
      JIRA_URL: 'https://company.atlassian.net',
      JIRA_EMAIL: 'user@company.com',
      JIRA_API_TOKEN: 'token',
      JIRA_PROJECT_KEY: 'SIGN',
    });

    const result = await integration.testConnection!();
    expect(result.success).toBe(true);
  });

  // Note: Full Jira integration tests require a Jira instance
  // Use Jira Cloud sandbox for integration testing
});
