/**
 * Single Sign-On (SSO) provider implementations for enterprise authentication.
 *
 * Supports:
 * - SAML 2.0 (via @node-saml/passport-saml)
 * - OpenID Connect (via openid-client)
 */

import { SAML, SamlConfig, Profile } from '@node-saml/passport-saml';
import { Issuer, Client, generators } from 'openid-client';

// ─── Types ──────────────────────────────────────────────────────────

export interface SSOUser {
  email: string;
  name: string;
  organizationId: string;
  attributes?: Record<string, unknown>;
}

export interface SSOProvider {
  /** Provider type */
  readonly type: 'saml' | 'oidc';

  /** Initiate SSO login - returns redirect URL to IdP */
  initiateLogin(returnUrl: string): Promise<string>;

  /** Handle callback from IdP - validate and return user info */
  handleCallback(payload: unknown): Promise<SSOUser>;

  /** Get Service Provider metadata (for SAML) */
  getMetadata?(): string;
}

// ─── SAML Provider ──────────────────────────────────────────────────

export interface SAMLConfiguration {
  entryPoint: string;          // IdP SSO endpoint
  issuer: string;              // SP entity ID
  callbackUrl: string;         // SP ACS endpoint
  cert: string;                // IdP certificate (PEM)
  privateKey?: string;         // SP private key (optional)
  organizationId: string;
}

export class SAMLProvider implements SSOProvider {
  readonly type = 'saml' as const;
  private saml: SAML;
  private config: SAMLConfiguration;

  constructor(config: SAMLConfiguration) {
    this.config = config;

    const samlConfig: SamlConfig = {
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      callbackUrl: config.callbackUrl,
      cert: config.cert,
      privateKey: config.privateKey,
      signatureAlgorithm: 'sha256',
      identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      wantAssertionsSigned: true,
      acceptedClockSkewMs: 5000,
    };

    this.saml = new SAML(samlConfig);
  }

  async initiateLogin(returnUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.saml.getAuthorizeUrl(
        { RelayState: returnUrl },
        {},
        (err, loginUrl) => {
          if (err) {
            reject(err);
          } else {
            resolve(loginUrl ?? '');
          }
        },
      );
    });
  }

  async handleCallback(samlResponse: string): Promise<SSOUser> {
    return new Promise((resolve, reject) => {
      this.saml.validatePostResponse(
        { SAMLResponse: samlResponse },
        (err, profile) => {
          if (err) {
            reject(new Error(`SAML validation failed: ${err.message}`));
          } else if (!profile) {
            reject(new Error('No profile returned from SAML assertion'));
          } else {
            const samlProfile = profile as Profile;
            resolve({
              email: samlProfile.email ?? samlProfile.nameID ?? '',
              name: samlProfile.displayName ?? samlProfile.nameID ?? 'Unknown',
              organizationId: this.config.organizationId,
              attributes: samlProfile.attributes,
            });
          }
        },
      );
    });
  }

  getMetadata(): string {
    return this.saml.generateServiceProviderMetadata(
      this.config.privateKey ? undefined : null,
      this.config.cert ? undefined : null,
    );
  }
}

// ─── OIDC Provider ──────────────────────────────────────────────────

export interface OIDCConfiguration {
  issuerUrl: string;           // OIDC provider URL
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  organizationId: string;
}

export class OIDCProvider implements SSOProvider {
  readonly type = 'oidc' as const;
  private config: OIDCConfiguration;
  private client: Client | null = null;
  private codeVerifier: string | null = null;

  constructor(config: OIDCConfiguration) {
    this.config = config;
  }

  private async getClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    const issuer = await Issuer.discover(this.config.issuerUrl);
    this.client = new issuer.Client({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uris: [this.config.callbackUrl],
      response_types: ['code'],
    });

    return this.client;
  }

  async initiateLogin(returnUrl: string): Promise<string> {
    const client = await this.getClient();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    // Store code verifier for callback
    this.codeVerifier = codeVerifier;

    const authUrl = client.authorizationUrl({
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: returnUrl,
    });

    return authUrl;
  }

  async handleCallback(params: { code: string; state: string }): Promise<SSOUser> {
    const client = await this.getClient();

    if (!this.codeVerifier) {
      throw new Error('No code verifier found for OIDC callback');
    }

    const tokenSet = await client.callback(this.config.callbackUrl, params, {
      code_verifier: this.codeVerifier,
      state: params.state,
    });

    const claims = tokenSet.claims();

    return {
      email: claims.email ?? '',
      name: claims.name ?? claims.preferred_username ?? 'Unknown',
      organizationId: this.config.organizationId,
      attributes: claims,
    };
  }
}

// ─── Factory ────────────────────────────────────────────────────────

export function createSSOProvider(
  type: 'saml' | 'oidc',
  config: SAMLConfiguration | OIDCConfiguration,
): SSOProvider {
  if (type === 'saml') {
    return new SAMLProvider(config as SAMLConfiguration);
  } else {
    return new OIDCProvider(config as OIDCConfiguration);
  }
}
