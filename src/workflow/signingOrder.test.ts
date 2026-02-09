import { describe, it, expect } from 'vitest';
import {
  getNextSigners,
  canSignerSign,
  onSignerCompleted,
  evaluateRoutingRules,
} from './signingOrder.js';
import type { EnvelopeWithSigners, SignerInfo } from './signingOrder.js';

function makeEnvelope(
  signingOrder: string,
  signerStatuses: Array<{ id: string; order: number; status: string; signingGroup?: number | null }>,
): EnvelopeWithSigners {
  return {
    id: 'env-1',
    signingOrder,
    status: 'sent',
    signers: signerStatuses.map((s) => ({
      ...s,
      name: `Signer ${s.id}`,
      email: `${s.id}@test.com`,
      signingGroup: s.signingGroup ?? null,
    })),
  };
}

describe('getNextSigners', () => {
  it('returns all pending signers for parallel signing', () => {
    const envelope = makeEnvelope('parallel', [
      { id: 's1', order: 1, status: 'pending' },
      { id: 's2', order: 2, status: 'pending' },
      { id: 's3', order: 3, status: 'pending' },
    ]);

    const next = getNextSigners(envelope);
    expect(next).toHaveLength(3);
  });

  it('returns only the first pending signer for sequential signing', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'completed' },
      { id: 's2', order: 2, status: 'pending' },
      { id: 's3', order: 3, status: 'pending' },
    ]);

    const next = getNextSigners(envelope);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('s2');
  });

  it('returns empty when all signers are done', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'completed' },
      { id: 's2', order: 2, status: 'completed' },
    ]);

    const next = getNextSigners(envelope);
    expect(next).toHaveLength(0);
  });

  it('handles mixed signing with groups', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'completed', signingGroup: 1 },
      { id: 's2', order: 2, status: 'pending', signingGroup: 2 },
      { id: 's3', order: 2, status: 'pending', signingGroup: 2 },
      { id: 's4', order: 3, status: 'pending', signingGroup: 3 },
    ]);

    const next = getNextSigners(envelope);
    // Both s2 and s3 are in group 2 and should be next
    expect(next).toHaveLength(2);
    expect(next.map((s) => s.id).sort()).toEqual(['s2', 's3']);
  });
});

describe('canSignerSign', () => {
  it('returns true when signer is in the next group', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'completed' },
      { id: 's2', order: 2, status: 'pending' },
    ]);

    expect(canSignerSign(envelope.signers[1], envelope)).toBe(true);
  });

  it('returns false when it is not the signer turn (sequential)', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'pending' },
      { id: 's2', order: 2, status: 'pending' },
    ]);

    expect(canSignerSign(envelope.signers[1], envelope)).toBe(false);
  });

  it('returns false when envelope is not active', () => {
    const envelope = makeEnvelope('parallel', [
      { id: 's1', order: 1, status: 'pending' },
    ]);
    envelope.status = 'voided';

    expect(canSignerSign(envelope.signers[0], envelope)).toBe(false);
  });

  it('returns false when signer already completed', () => {
    const envelope = makeEnvelope('parallel', [
      { id: 's1', order: 1, status: 'completed' },
    ]);

    expect(canSignerSign(envelope.signers[0], envelope)).toBe(false);
  });
});

describe('onSignerCompleted', () => {
  it('returns isComplete when all signers are done', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'completed' },
      { id: 's2', order: 2, status: 'pending' },
    ]);

    const result = onSignerCompleted(envelope, 's2');
    expect(result.isComplete).toBe(true);
    expect(result.nextSigners).toHaveLength(0);
  });

  it('returns next signers when more remain', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'pending' },
      { id: 's2', order: 2, status: 'pending' },
      { id: 's3', order: 3, status: 'pending' },
    ]);

    const result = onSignerCompleted(envelope, 's1');
    expect(result.isComplete).toBe(false);
    expect(result.nextSigners).toHaveLength(1);
    expect(result.nextSigners[0].id).toBe('s2');
  });
});

describe('evaluateRoutingRules', () => {
  it('returns continue when no rules', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'completed' },
    ]);

    const result = evaluateRoutingRules(envelope, envelope.signers[0], {});
    expect(result.action).toBe('continue');
  });

  it('evaluates field_value rule', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'completed' },
    ]);
    envelope.routingRules = [
      {
        condition: 'field_value',
        fieldId: 'amount',
        operator: 'gt',
        value: '10000',
        action: 'add_signer',
        signerEmail: 'cfo@company.com',
      },
    ];

    const result = evaluateRoutingRules(envelope, envelope.signers[0], { amount: 15000 });
    expect(result.action).toBe('add_signer');
    expect(result.signerEmail).toBe('cfo@company.com');
  });

  it('evaluates signer_declined rule', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'declined' },
    ]);
    envelope.routingRules = [
      {
        condition: 'signer_declined',
        action: 'route_to',
        targetSignerOrder: 4,
      },
    ];

    const result = evaluateRoutingRules(envelope, envelope.signers[0], {});
    expect(result.action).toBe('route_to');
    expect(result.targetSignerOrder).toBe(4);
  });

  it('skips rule when field value does not match', () => {
    const envelope = makeEnvelope('sequential', [
      { id: 's1', order: 1, status: 'completed' },
    ]);
    envelope.routingRules = [
      {
        condition: 'field_value',
        fieldId: 'amount',
        operator: 'gt',
        value: '10000',
        action: 'add_signer',
        signerEmail: 'cfo@company.com',
      },
    ];

    const result = evaluateRoutingRules(envelope, envelope.signers[0], { amount: 500 });
    expect(result.action).toBe('continue');
  });
});
