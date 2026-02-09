/**
 * RBAC Middleware Tests — Step 27
 */

import { describe, it, expect, vi } from 'vitest';
import { requireRole, requireOwnership, requirePermission, PERMISSIONS } from './rbac.js';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedUser } from './rbac.js';

function createMockReq(user?: AuthenticatedUser, params?: Record<string, string>): Partial<Request> {
  return {
    user,
    params: params ?? {},
  };
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis() as any,
    json: vi.fn().mockReturnThis() as any,
  };
  return res;
}

describe('requireRole', () => {
  it('should return 401 if no user on request', () => {
    const middleware = requireRole('admin');
    const req = createMockReq(undefined);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Authentication required' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if user is deactivated', () => {
    const middleware = requireRole('admin');
    const user: AuthenticatedUser = {
      id: 'u1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      organizationId: null,
      isActive: false,
    };
    const req = createMockReq(user);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('deactivated') }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if user role is not in allowed list', () => {
    const middleware = requireRole('admin');
    const user: AuthenticatedUser = {
      id: 'u1',
      email: 'viewer@example.com',
      name: 'Viewer',
      role: 'viewer',
      organizationId: null,
      isActive: true,
    };
    const req = createMockReq(user);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if role matches', () => {
    const middleware = requireRole('admin', 'sender');
    const user: AuthenticatedUser = {
      id: 'u1',
      email: 'sender@example.com',
      name: 'Sender',
      role: 'sender',
      organizationId: null,
      isActive: true,
    };
    const req = createMockReq(user);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should accept admin role for any permission', () => {
    const middleware = requireRole('admin', 'sender');
    const user: AuthenticatedUser = {
      id: 'u1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      organizationId: null,
      isActive: true,
    };
    const req = createMockReq(user);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('viewer cannot create envelopes', () => {
    const middleware = requireRole('admin', 'sender');
    const user: AuthenticatedUser = {
      id: 'u1',
      email: 'viewer@example.com',
      name: 'Viewer',
      role: 'viewer',
      organizationId: null,
      isActive: true,
    };
    const req = createMockReq(user);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requirePermission', () => {
  it('should use PERMISSIONS matrix to determine allowed roles', () => {
    // configureSSO is admin-only
    const middleware = requirePermission('configureSSO');
    const sender: AuthenticatedUser = {
      id: 'u1',
      email: 'sender@example.com',
      name: 'Sender',
      role: 'sender',
      organizationId: null,
      isActive: true,
    };
    const req = createMockReq(sender);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('admin should pass configureSSO permission', () => {
    const middleware = requirePermission('configureSSO');
    const admin: AuthenticatedUser = {
      id: 'u1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      organizationId: null,
      isActive: true,
    };
    const req = createMockReq(admin);
    const res = createMockRes();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
  });
});

describe('PERMISSIONS matrix', () => {
  it('should define admin-only permissions', () => {
    expect(PERMISSIONS.manageUsers).toEqual(['admin']);
    expect(PERMISSIONS.configureSSO).toEqual(['admin']);
    expect(PERMISSIONS.manageWebhooks).toEqual(['admin']);
    expect(PERMISSIONS.manageRetention).toEqual(['admin']);
    expect(PERMISSIONS.lockTemplates).toEqual(['admin']);
  });

  it('should allow sender to create envelopes', () => {
    expect(PERMISSIONS.createEnvelope).toContain('sender');
    expect(PERMISSIONS.createEnvelope).toContain('admin');
  });

  it('should allow viewer to see analytics', () => {
    expect(PERMISSIONS.viewAnalytics).toContain('viewer');
    expect(PERMISSIONS.viewAnalytics).toContain('admin');
    expect(PERMISSIONS.viewAnalytics).toContain('sender');
  });

  it('should not allow viewer to create envelopes', () => {
    expect(PERMISSIONS.createEnvelope).not.toContain('viewer');
  });
});
