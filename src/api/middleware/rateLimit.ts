import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for API routes: 100 requests/minute per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10),
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for signing ceremony routes: 20 requests/minute per IP.
 * Prevents brute-force token guessing.
 */
export const signingRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 20,
  message: { success: false, error: 'Too many signing attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
