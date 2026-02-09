import { describe, it, expect } from 'vitest';
import { PLAN_TIERS, getPlanTier } from './planEnforcement.js';

describe('Plan Tier Enforcement', () => {
  describe('PLAN_TIERS', () => {
    it('should define free, pro, and enterprise tiers', () => {
      expect(PLAN_TIERS.free).toBeDefined();
      expect(PLAN_TIERS.pro).toBeDefined();
      expect(PLAN_TIERS.enterprise).toBeDefined();
    });

    it('free tier should have 5 envelopes/month', () => {
      expect(PLAN_TIERS.free.envelopeLimit).toBe(5);
    });

    it('pro tier should have 100 envelopes/month', () => {
      expect(PLAN_TIERS.pro.envelopeLimit).toBe(100);
    });

    it('enterprise tier should have unlimited envelopes', () => {
      expect(PLAN_TIERS.enterprise.envelopeLimit).toBeNull();
    });

    it('free tier should only support simple verification', () => {
      expect(PLAN_TIERS.free.verificationLevels).toEqual(['simple']);
    });

    it('pro tier should support simple and advanced verification', () => {
      expect(PLAN_TIERS.pro.verificationLevels).toContain('simple');
      expect(PLAN_TIERS.pro.verificationLevels).toContain('advanced');
    });

    it('enterprise tier should support all verification levels', () => {
      expect(PLAN_TIERS.enterprise.verificationLevels).toContain('simple');
      expect(PLAN_TIERS.enterprise.verificationLevels).toContain('advanced');
      expect(PLAN_TIERS.enterprise.verificationLevels).toContain('qualified');
    });

    it('free tier should not have integrations', () => {
      expect(PLAN_TIERS.free.integrationsEnabled).toBe(false);
    });

    it('pro and enterprise should have integrations', () => {
      expect(PLAN_TIERS.pro.integrationsEnabled).toBe(true);
      expect(PLAN_TIERS.enterprise.integrationsEnabled).toBe(true);
    });

    it('only enterprise should have SSO', () => {
      expect(PLAN_TIERS.free.ssoEnabled).toBe(false);
      expect(PLAN_TIERS.pro.ssoEnabled).toBe(false);
      expect(PLAN_TIERS.enterprise.ssoEnabled).toBe(true);
    });
  });

  describe('getPlanTier', () => {
    it('should return enterprise for null org (single-tenant)', () => {
      const tier = getPlanTier(null);
      expect(tier.name).toBe('Enterprise');
      expect(tier.envelopeLimit).toBeNull();
    });

    it('should return correct tier for org', () => {
      const freeTier = getPlanTier({
        id: '1',
        name: 'Test',
        slug: 'test',
        plan: 'free',
        envelopeLimit: 5,
        envelopesUsed: 0,
        settings: {},
      });
      expect(freeTier.name).toBe('Free');

      const proTier = getPlanTier({
        id: '2',
        name: 'Test Pro',
        slug: 'test-pro',
        plan: 'pro',
        envelopeLimit: 100,
        envelopesUsed: 0,
        settings: {},
      });
      expect(proTier.name).toBe('Pro');
    });

    it('should default to free for unknown plan', () => {
      const tier = getPlanTier({
        id: '1',
        name: 'Test',
        slug: 'test',
        plan: 'nonexistent',
        envelopeLimit: null,
        envelopesUsed: 0,
        settings: {},
      });
      expect(tier.name).toBe('Free');
    });
  });
});
