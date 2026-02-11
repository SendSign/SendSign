/**
 * CSRF protection middleware.
 *
 * Strategy: Double-submit cookie pattern.
 * - On GET /api/auth/csrf-token, a random token is set as a cookie AND returned in JSON.
 * - On state-changing requests (POST, PUT, DELETE), the X-CSRF-Token header must match
 *   the csrf_token cookie.
 *
 * API key and JWT Bearer requests bypass CSRF (they are not cookie-based auth).
 * Signing ceremony routes also bypass (token-based, not session-based).
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically random CSRF token.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * CSRF validation middleware.
 * Skips validation for:
 *   - GET, HEAD, OPTIONS requests (safe methods)
 *   - Requests with Authorization: Bearer header (API key or JWT — not vulnerable to CSRF)
 *   - Signing ceremony routes (token-auth based)
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methods don't need CSRF protection
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    next();
    return;
  }

  // Bearer token auth is not vulnerable to CSRF (browser doesn't auto-attach it)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // If there's no cookie-based session, CSRF isn't relevant
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  if (!cookieToken) {
    next();
    return;
  }

  // Validate the CSRF token from the header matches the cookie
  const headerToken = req.headers[CSRF_HEADER];
  if (!headerToken || headerToken !== cookieToken) {
    res.status(403).json({
      success: false,
      error: 'CSRF token validation failed',
    });
    return;
  }

  next();
}

/**
 * Route handler to issue a fresh CSRF token.
 * GET /api/auth/csrf-token
 */
export function csrfTokenHandler(req: Request, res: Response): void {
  const token = generateCsrfToken();

  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // Frontend JS needs to read it
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });

  res.json({ success: true, data: { csrfToken: token } });
}
