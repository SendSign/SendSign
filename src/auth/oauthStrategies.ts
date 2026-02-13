/**
 * OAuth 2.0 authentication strategies for Google and GitHub.
 * Uses Passport.js for authentication flow.
 * 
 * OAuth is optional — if credentials are not configured, strategies are not registered.
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { autoProvisionTenant } from '../control/services/autoProvisionService.js';

export interface OAuthProfile {
  provider: 'google' | 'github';
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

/**
 * Initialize OAuth strategies if credentials are configured.
 * Call this during app startup.
 */
export function initializeOAuth(): void {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  const baseUrl = process.env.SENDSIGN_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';

  // Google OAuth
  if (googleClientId && googleClientSecret && 
      googleClientId !== 'your_google_client_id' && 
      googleClientSecret !== 'your_google_client_secret') {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: `${baseUrl}/app/auth/google/callback`,
          scope: ['profile', 'email'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // Extract email from profile
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email provided by Google'));
            }

            const oauthProfile: OAuthProfile = {
              provider: 'google',
              id: profile.id,
              email,
              name: profile.displayName || email.split('@')[0],
              avatarUrl: profile.photos?.[0]?.value,
            };

            return done(null, oauthProfile);
          } catch (error) {
            return done(error as Error);
          }
        }
      )
    );
    console.log('✓ Google OAuth enabled');
  } else {
    console.log('⚠️  Google OAuth not configured — GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set');
  }

  // GitHub OAuth
  if (githubClientId && githubClientSecret &&
      githubClientId !== 'your_github_client_id' &&
      githubClientSecret !== 'your_github_client_secret') {
    passport.use(
      new GitHubStrategy(
        {
          clientID: githubClientId,
          clientSecret: githubClientSecret,
          callbackURL: `${baseUrl}/app/auth/github/callback`,
          scope: ['user:email'],
        },
        async (accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            // Extract email from profile (GitHub can have multiple emails)
            const email = profile.emails?.find((e: any) => e.primary)?.value || profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email provided by GitHub'));
            }

            const oauthProfile: OAuthProfile = {
              provider: 'github',
              id: profile.id,
              email,
              name: profile.displayName || profile.username || email.split('@')[0],
              avatarUrl: profile.photos?.[0]?.value || profile.avatar_url,
            };

            return done(null, oauthProfile);
          } catch (error) {
            return done(error as Error);
          }
        }
      )
    );
    console.log('✓ GitHub OAuth enabled');
  } else {
    console.log('⚠️  GitHub OAuth not configured — GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET not set');
  }

  // Passport serialization (store only user ID in session)
  passport.serializeUser((user: any, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: any, done) => {
    done(null, user);
  });
}

/**
 * Check if OAuth is enabled for a provider.
 */
export function isOAuthEnabled(provider: 'google' | 'github'): boolean {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    return !!(clientId && clientSecret && 
              clientId !== 'your_google_client_id' && 
              clientSecret !== 'your_google_client_secret');
  }

  if (provider === 'github') {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    return !!(clientId && clientSecret &&
              clientId !== 'your_github_client_id' &&
              clientSecret !== 'your_github_client_secret');
  }

  return false;
}

/**
 * Handle OAuth callback by finding or creating tenant + user.
 */
export async function handleOAuthCallback(profile: OAuthProfile): Promise<{
  tenant: any;
  user: any;
  apiKey: string;
  isNewUser: boolean;
}> {
  return await autoProvisionTenant({
    email: profile.email,
    name: profile.name,
    oauthProvider: profile.provider,
    oauthId: profile.id,
    avatarUrl: profile.avatarUrl,
  });
}
