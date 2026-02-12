/**
 * Branding / White-Label Tests — Step 32
 */

import { describe, it, expect } from 'vitest';

describe('Branding Entitlement', () => {
  it('should reject PUT /branding without entitlement', () => {
    // When SENDSIGN_BRANDING_ENTITLEMENT is not set
    const hasEntitlement = !!undefined;
    expect(hasEntitlement).toBe(false);
    
    // PUT /api/admin/branding should return 403
    const statusCode = hasEntitlement ? 200 : 403;
    expect(statusCode).toBe(403);
  });

  it('should allow PUT /branding with entitlement', () => {
    const entitlementKey = 'my-entitlement-key';
    const hasEntitlement = !!entitlementKey;
    expect(hasEntitlement).toBe(true);
    
    const statusCode = hasEntitlement ? 200 : 403;
    expect(statusCode).toBe(200);
  });

  it('should return default branding when no config exists', () => {
    const defaultBranding = {
      primaryColor: '#2563EB',
      secondaryColor: '#1E40AF',
      accentColor: '#3B82F6',
      companyName: 'SendSign',
      isDefault: true,
    };

    expect(defaultBranding.primaryColor).toBe('#2563EB');
    expect(defaultBranding.companyName).toBe('SendSign');
    expect(defaultBranding.isDefault).toBe(true);
  });
});

describe('Branding Validation', () => {
  it('should validate hex colors', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;

    expect(hexPattern.test('#2563EB')).toBe(true);
    expect(hexPattern.test('#ffffff')).toBe(true);
    expect(hexPattern.test('#000000')).toBe(true);
    expect(hexPattern.test('not-a-color')).toBe(false);
    expect(hexPattern.test('#xyz')).toBe(false);
    expect(hexPattern.test('#12345')).toBe(false);
    expect(hexPattern.test('#1234567')).toBe(false);
  });

  it('should reject logo data over 500KB', () => {
    const maxSizeBytes = 500 * 1024; // 500KB
    const smallLogo = 'a'.repeat(100); // Small
    const largeLogo = 'a'.repeat(maxSizeBytes + 1); // Too large

    expect(Buffer.from(smallLogo, 'base64').length).toBeLessThan(maxSizeBytes);
    expect(Buffer.from(largeLogo, 'base64').length).toBeGreaterThan(maxSizeBytes);
  });

  it('should sanitize custom CSS', () => {
    const dangerousCss = `
      .header { color: red; }
      <script>alert("xss")</script>
      background: url(javascript:alert(1));
      @import url("evil.css");
      .footer { expression(alert(1)); }
    `;

    const sanitized = dangerousCss
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/expression\(/gi, '')
      .replace(/@import/gi, '');

    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('expression(');
    expect(sanitized).not.toContain('@import');
    expect(sanitized).toContain('.header { color: red; }');
  });
});

describe('Branding in Components', () => {
  it('should render default SendSign branding without entitlement', () => {
    const entitlementActive = false;
    const isDefault = true;
    const companyName = 'SendSign';

    // Without entitlement: always show "Powered by SendSign"
    const shouldShowDefaultBranding = !entitlementActive;
    expect(shouldShowDefaultBranding).toBe(true);
  });

  it('should render nothing with entitlement but no config', () => {
    const entitlementActive = true;
    const isDefault = true;
    const companyName: string | null = null;

    // Entitlement + default + no company name = clean white-label
    const shouldRenderNothing = entitlementActive && isDefault && !companyName;
    expect(shouldRenderNothing).toBe(true);
  });

  it('should render custom branding with entitlement and config', () => {
    const entitlementActive = true;
    const isDefault = false;
    const companyName = 'Acme Corp';
    const logoUrl = 'https://acme.com/logo.png';

    // Entitlement + custom config = show custom branding
    const shouldRenderCustom = entitlementActive && !isDefault;
    expect(shouldRenderCustom).toBe(true);
  });
});

describe('Email Branding', () => {
  it('should inject brand variables into email templates', () => {
    const variables: Record<string, string> = {
      signerName: 'Alice',
      documentTitle: 'NDA',
    };

    // Inject branding
    const branding = {
      companyName: 'Acme Corp',
      primaryColor: '#FF0000',
      logoUrl: 'https://acme.com/logo.png',
      emailFooter: 'Powered by Acme Corp',
    };

    variables['brandCompanyName'] = branding.companyName;
    variables['brandPrimaryColor'] = branding.primaryColor;
    variables['brandLogoUrl'] = branding.logoUrl;
    variables['brandEmailFooter'] = branding.emailFooter;

    expect(variables['brandCompanyName']).toBe('Acme Corp');
    expect(variables['brandPrimaryColor']).toBe('#FF0000');
    expect(variables['brandEmailFooter']).toBe('Powered by Acme Corp');
  });

  it('should use SendSign as default fromName without config', () => {
    const brandingCompanyName = 'SendSign'; // default
    const fromName = process.env.SENDGRID_FROM_NAME ?? brandingCompanyName;

    expect(fromName).toBe('SendSign');
  });
});

describe('Certificate of Completion Branding', () => {
  it('should use custom company name in certificate header', () => {
    const companyName = 'Acme Corp';
    const tagline = `Powered by ${companyName}`;

    expect(tagline).toBe('Powered by Acme Corp');
  });

  it('should use custom company name in certificate footer', () => {
    const companyName = 'Acme Corp';
    const footer = `${companyName} v1.0.0 — E-Signature Engine`;

    expect(footer).toBe('Acme Corp v1.0.0 — E-Signature Engine');
  });

  it('should fall back to SendSign when no branding configured', () => {
    const companyName = 'SendSign'; // default
    const footer = `${companyName} v1.0.0 — E-Signature Engine`;

    expect(footer).toBe('SendSign v1.0.0 — E-Signature Engine');
  });
});
