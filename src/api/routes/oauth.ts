/**
 * OAuth authentication routes for Google and GitHub.
 * 
 * Flow:
 * 1. User clicks "Continue with Google/GitHub" → /app/auth/google or /app/auth/github
 * 2. Redirects to provider for authorization
 * 3. Provider redirects back to /app/auth/{provider}/callback
 * 4. Find or create tenant + user
 * 5. Set session and redirect to /app/dashboard
 */

import { Router } from 'express';
import passport from 'passport';
import { handleOAuthCallback, isOAuthEnabled } from '../../auth/oauthStrategies.js';
import { generateSessionToken } from '../../auth/authService.js';

const router = Router();

// ─── Google OAuth ───────────────────────────────────────────────────

router.get('/google', (req, res, next) => {
  if (!isOAuthEnabled('google')) {
    return res.status(503).json({
      success: false,
      error: 'Google OAuth not configured',
      message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
    });
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/app/login?error=google_auth_failed' }),
  async (req, res) => {
    try {
      const profile = req.user as any;

      // Auto-provision or find existing tenant
      const result = await handleOAuthCallback(profile);

      // Generate JWT session token
      const token = generateSessionToken({
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
        organizationId: result.user.organizationId,
      });

      // Set session cookie
      res.cookie('sendsign_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      // Redirect to dashboard
      const welcomeParam = result.isNewUser ? '?welcome=true' : '';
      res.redirect(`/app/dashboard${welcomeParam}`);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect('/app/login?error=auth_failed');
    }
  }
);

// ─── GitHub OAuth ───────────────────────────────────────────────────

router.get('/github', (req, res, next) => {
  if (!isOAuthEnabled('github')) {
    return res.status(503).json({
      success: false,
      error: 'GitHub OAuth not configured',
      message: 'Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.',
    });
  }

  passport.authenticate('github', {
    scope: ['user:email'],
  })(req, res, next);
});

router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/app/login?error=github_auth_failed' }),
  async (req, res) => {
    try {
      const profile = req.user as any;

      // Auto-provision or find existing tenant
      const result = await handleOAuthCallback(profile);

      // Generate JWT session token
      const token = generateSessionToken({
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
        organizationId: result.user.organizationId,
      });

      // Set session cookie
      res.cookie('sendsign_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      // Redirect to dashboard
      const welcomeParam = result.isNewUser ? '?welcome=true' : '';
      res.redirect(`/app/dashboard${welcomeParam}`);
    } catch (error) {
      console.error('GitHub OAuth callback error:', error);
      res.redirect('/app/login?error=auth_failed');
    }
  }
);

// ─── OAuth Status Endpoint ──────────────────────────────────────────

/**
 * GET /app/auth/oauth-status
 * Returns which OAuth providers are enabled.
 * Used by the frontend to show/hide OAuth buttons.
 */
router.get('/oauth-status', (req, res) => {
  res.json({
    success: true,
    data: {
      google: isOAuthEnabled('google'),
      github: isOAuthEnabled('github'),
    },
  });
});

export default router;
