import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackIntegration } from './slack.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('SlackIntegration', () => {
  let integration: SlackIntegration;

  beforeEach(() => {
    integration = new SlackIntegration();
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('ok'),
    });
  });

  it('should have correct metadata', () => {
    expect(integration.name).toBe('slack');
    expect(integration.displayName).toBe('Slack');
    expect(integration.description).toContain('Slack');
  });

  it('should require SLACK_WEBHOOK_URL', async () => {
    await expect(integration.initialize({})).rejects.toThrow('SLACK_WEBHOOK_URL is required');
  });

  it('should validate webhook URL format', async () => {
    await expect(integration.initialize({
      SLACK_WEBHOOK_URL: 'https://invalid.com/webhook',
    })).rejects.toThrow('Invalid Slack webhook URL');
  });

  it('should initialize with valid config', async () => {
    await integration.initialize({
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T00000000/B00000000/XXXX',
    });

    expect(integration).toBeDefined();
  });

  it('should test connection successfully', async () => {
    await integration.initialize({
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T00000000/B00000000/XXXX',
    });

    const result = await integration.testConnection!();
    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should send notification on envelope sent', async () => {
    await integration.initialize({
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T00000000/B00000000/XXXX',
    });

    await integration.onEnvelopeSent!({
      id: 'env-123',
      subject: 'Test NDA',
      sentAt: new Date(),
      signers: [{ name: 'Alice' }, { name: 'Bob' }],
    } as any);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('hooks.slack.com'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Test NDA'),
      }),
    );
  });

  it('should send notification on envelope completed', async () => {
    await integration.initialize({
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T00000000/B00000000/XXXX',
    });

    await integration.onEnvelopeCompleted!({
      id: 'env-123',
      subject: 'Test Agreement',
      completedAt: new Date(),
      signers: [{ name: 'Alice' }, { name: 'Bob' }],
    } as any);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('hooks.slack.com'),
      expect.objectContaining({
        body: expect.stringContaining('Fully Signed'),
      }),
    );
  });
});
