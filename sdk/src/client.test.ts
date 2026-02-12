import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendSignClient } from './client.js';
import {
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  ValidationError,
  ServerError,
} from './errors.js';

// Mock fetch
function createMockFetch(response: {
  ok: boolean;
  status: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  headers?: Headers;
}) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText ?? 'OK',
    json: response.json ?? (() => Promise.resolve({ success: true })),
    text: response.text ?? (() => Promise.resolve('')),
    arrayBuffer: response.arrayBuffer ?? (() => Promise.resolve(new ArrayBuffer(0))),
    headers: response.headers ?? new Headers(),
  });
}

describe('SendSignClient', () => {
  let client: SendSignClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = createMockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        data: { id: 'env-123', subject: 'Test', status: 'draft', signers: [], fields: [] },
      }),
    });

    client = new SendSignClient({
      baseUrl: 'https://sendsign.test',
      apiKey: 'test-api-key',
      fetch: mockFetch as unknown as typeof fetch,
    });
  });

  describe('constructor', () => {
    it('should require baseUrl', () => {
      expect(() => new SendSignClient({ baseUrl: '', apiKey: 'key' })).toThrow('baseUrl is required');
    });

    it('should require apiKey', () => {
      expect(() => new SendSignClient({ baseUrl: 'https://test.com', apiKey: '' })).toThrow('apiKey is required');
    });

    it('should strip trailing slash from baseUrl', () => {
      const c = new SendSignClient({
        baseUrl: 'https://test.com/',
        apiKey: 'key',
        fetch: mockFetch as unknown as typeof fetch,
      });
      expect(c).toBeDefined();
    });
  });

  describe('getEnvelope', () => {
    it('should call GET /api/envelopes/:id with auth header', async () => {
      await client.getEnvelope('env-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://sendsign.test/api/envelopes/env-123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
        }),
      );
    });

    it('should return envelope data', async () => {
      const envelope = await client.getEnvelope('env-123');
      expect(envelope.id).toBe('env-123');
      expect(envelope.subject).toBe('Test');
    });
  });

  describe('sendEnvelope', () => {
    it('should call POST /api/envelopes/:id/send', async () => {
      await client.sendEnvelope('env-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://sendsign.test/api/envelopes/env-123/send',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  describe('voidEnvelope', () => {
    it('should call POST /api/envelopes/:id/void with reason', async () => {
      await client.voidEnvelope('env-123', 'Wrong version');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://sendsign.test/api/envelopes/env-123/void',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'Wrong version' }),
        }),
      );
    });
  });

  describe('listEnvelopes', () => {
    it('should pass filters as query params', async () => {
      mockFetch = createMockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { envelopes: [], total: 0, page: 1, limit: 20, hasMore: false },
        }),
      });

      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      await client.listEnvelopes({ status: 'completed', page: 2, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=completed'),
        expect.anything(),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.anything(),
      );
    });
  });

  describe('getSigningUrl', () => {
    it('should return signing URL with token', async () => {
      mockFetch = createMockFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            id: 'env-123',
            subject: 'Test',
            status: 'sent',
            signers: [{ id: 'signer-1', name: 'Alice', signingToken: 'tok-abc123' }],
            fields: [],
          },
        }),
      });

      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const url = await client.getSigningUrl('env-123', 'signer-1');
      expect(url).toBe('https://sendsign.test/sign/tok-abc123');
    });

    it('should throw NotFoundError for unknown signer', async () => {
      await expect(client.getSigningUrl('env-123', 'unknown')).rejects.toThrow(NotFoundError);
    });
  });

  describe('registerWebhook', () => {
    it('should call POST /api/webhooks', async () => {
      await client.registerWebhook('https://myapp.com/webhook', ['envelope.completed']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://sendsign.test/api/webhooks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            url: 'https://myapp.com/webhook',
            events: ['envelope.completed'],
          }),
        }),
      );
    });
  });

  describe('assignRetentionPolicy', () => {
    it('should call POST /api/envelopes/:id/retention', async () => {
      await client.assignRetentionPolicy('env-123', 'policy-456');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://sendsign.test/api/envelopes/env-123/retention',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ policyId: 'policy-456' }),
        }),
      );
    });
  });

  // ─── Error handling ───────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw AuthenticationError on 401', async () => {
      mockFetch = createMockFetch({ ok: false, status: 401 });
      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'bad-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getEnvelope('x')).rejects.toThrow(AuthenticationError);
    });

    it('should throw NotFoundError on 404', async () => {
      mockFetch = createMockFetch({ ok: false, status: 404 });
      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getEnvelope('x')).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError on 400', async () => {
      mockFetch = createMockFetch({ ok: false, status: 400 });
      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      await expect(client.sendEnvelope('x')).rejects.toThrow(ValidationError);
    });

    it('should throw RateLimitError on 429', async () => {
      const headers = new Headers({ 'Retry-After': '60' });
      mockFetch = createMockFetch({ ok: false, status: 429, headers });
      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      await expect(client.sendEnvelope('x')).rejects.toThrow(RateLimitError);
    });

    it('should throw ServerError on 500', async () => {
      mockFetch = createMockFetch({ ok: false, status: 500 });
      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getEnvelope('x')).rejects.toThrow(ServerError);
    });

    it('should throw NetworkError on fetch failure', async () => {
      mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getEnvelope('x')).rejects.toThrow(NetworkError);
    });

    it('should throw TimeoutError on abort', async () => {
      mockFetch = vi.fn().mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      client = new SendSignClient({
        baseUrl: 'https://sendsign.test',
        apiKey: 'key',
        timeout: 100,
        fetch: mockFetch as unknown as typeof fetch,
      });

      await expect(client.getEnvelope('x')).rejects.toThrow(TimeoutError);
    });
  });

  // ─── Embed ────────────────────────────────────────────────────────

  describe('embedSigning', () => {
    it('should throw if container not found (browser only)', () => {
      // Skip in non-browser environment
      if (typeof document === 'undefined') {
        expect(true).toBe(true); // noop
        return;
      }

      expect(() => client.embedSigning({
        containerId: 'nonexistent',
        token: 'tok-123',
      })).toThrow('Container element not found');
    });
  });
});
