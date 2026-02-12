import type { Request, Response, NextFunction } from 'express';

/**
 * Control plane authentication middleware.
 *
 * Uses a completely separate master API key from tenant keys.
 * Stored in SENDSIGN_CONTROL_API_KEY environment variable.
 * Gives full access to all tenants — operator-only.
 *
 * The control plane bypasses RLS — it needs to see all tenants' data.
 */
export function controlAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.headers['x-control-key'] as string | undefined;
  const controlKey = process.env.SENDSIGN_CONTROL_API_KEY;

  if (!controlKey) {
    res.status(500).json({
      success: false,
      error: 'Control plane not configured — SENDSIGN_CONTROL_API_KEY is not set',
    });
    return;
  }

  if (!key || key !== controlKey) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized — control plane key required',
    });
    return;
  }

  next();
}
