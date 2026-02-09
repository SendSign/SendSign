import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../db/connection.js';
import { ssoConfigurations } from '../db/schema.js';
import {
  getSSOConfig,
  upsertSSOConfig,
  deleteSSOConfig,
  isSSOEnabled,
  detectOrganizationFromEmail,
  extractDomain,
} from './ssoConfig.js';

describe('ssoConfig', () => {
  const db = getDb();

  beforeEach(async () => {
    // Clean up SSO configs
    await db.delete(ssoConfigurations);
  });

  describe('upsertSSOConfig', () => {
    it('should create a new SSO config', async () => {
      const config = await upsertSSOConfig(
        'org-test',
        'saml',
        {
          entryPoint: 'https://idp.example.com/sso',
          issuer: 'coseal',
          cert: 'mock-cert',
          allowedDomains: ['example.com'],
        },
        true,
      );

      expect(config.id).toBeTruthy();
      expect(config.organizationId).toBe('org-test');
      expect(config.providerType).toBe('saml');
      expect(config.enabled).toBe(true);
    });

    it('should update existing SSO config', async () => {
      // Create
      const created = await upsertSSOConfig('org-update', 'saml', { test: 'v1' }, true);

      // Update
      const updated = await upsertSSOConfig('org-update', 'oidc', { test: 'v2' }, false);

      expect(updated.id).toBe(created.id);
      expect(updated.providerType).toBe('oidc');
      expect(updated.enabled).toBe(false);
      expect((updated.config as Record<string, unknown>).test).toBe('v2');
    });
  });

  describe('getSSOConfig', () => {
    it('should retrieve SSO config by organization ID', async () => {
      await upsertSSOConfig('org-get', 'saml', { test: true }, true);

      const config = await getSSOConfig('org-get');
      expect(config).toBeTruthy();
      expect(config?.organizationId).toBe('org-get');
    });

    it('should return null for non-existent config', async () => {
      const config = await getSSOConfig('nonexistent');
      expect(config).toBeNull();
    });
  });

  describe('deleteSSOConfig', () => {
    it('should delete SSO config', async () => {
      await upsertSSOConfig('org-delete', 'saml', {}, true);

      await deleteSSOConfig('org-delete');

      const config = await getSSOConfig('org-delete');
      expect(config).toBeNull();
    });
  });

  describe('isSSOEnabled', () => {
    it('should return true for enabled config', async () => {
      await upsertSSOConfig('org-enabled', 'saml', {}, true);

      const enabled = await isSSOEnabled('org-enabled');
      expect(enabled).toBe(true);
    });

    it('should return false for disabled config', async () => {
      await upsertSSOConfig('org-disabled', 'saml', {}, false);

      const enabled = await isSSOEnabled('org-disabled');
      expect(enabled).toBe(false);
    });

    it('should return false for non-existent config', async () => {
      const enabled = await isSSOEnabled('nonexistent');
      expect(enabled).toBe(false);
    });
  });

  describe('detectOrganizationFromEmail', () => {
    it('should detect organization from email domain', async () => {
      await upsertSSOConfig('org-acme', 'saml', {
        allowedDomains: ['acme.com', 'acme.co.uk'],
      }, true);

      const orgId = await detectOrganizationFromEmail('alice@acme.com');
      expect(orgId).toBe('org-acme');
    });

    it('should return null for unmatched domain', async () => {
      await upsertSSOConfig('org-acme', 'saml', {
        allowedDomains: ['acme.com'],
      }, true);

      const orgId = await detectOrganizationFromEmail('alice@other.com');
      expect(orgId).toBeNull();
    });

    it('should return null for malformed email', async () => {
      const orgId = await detectOrganizationFromEmail('not-an-email');
      expect(orgId).toBeNull();
    });

    it('should ignore disabled SSO configs', async () => {
      await upsertSSOConfig('org-disabled', 'saml', {
        allowedDomains: ['disabled.com'],
      }, false);

      const orgId = await detectOrganizationFromEmail('user@disabled.com');
      expect(orgId).toBeNull();
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from valid email', () => {
      expect(extractDomain('user@example.com')).toBe('example.com');
      expect(extractDomain('alice@company.co.uk')).toBe('company.co.uk');
    });

    it('should return null for invalid email', () => {
      expect(extractDomain('not-an-email')).toBeNull();
      expect(extractDomain('missing-at-sign.com')).toBeNull();
    });
  });
});
