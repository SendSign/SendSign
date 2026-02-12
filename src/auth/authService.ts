import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/connection.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// ─── Config ──────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || process.env.API_KEY || 'change-this-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const BCRYPT_ROUNDS = 12;

// Account lockout settings
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// Password complexity requirements
const PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false, // relaxed for usability; enable for stricter orgs
};

// ─── Types ──────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string | null;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    organizationId: string | null;
  };
  token: string;
}

// ─── Password ────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password complexity.
 */
export function validatePasswordComplexity(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < PASSWORD_RULES.minLength) {
    errors.push(`Password must be at least ${PASSWORD_RULES.minLength} characters`);
  }
  if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (PASSWORD_RULES.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (PASSWORD_RULES.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
}

// ─── JWT ─────────────────────────────────────────────────────────────

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// ─── Register ────────────────────────────────────────────────────────

export async function registerUser(
  email: string,
  password: string,
  name: string,
  organizationId?: string,
): Promise<AuthResult> {
  // Enforce password complexity on the backend
  const complexity = validatePasswordComplexity(password);
  if (!complexity.valid) {
    throw new Error(complexity.errors.join('. '));
  }

  const db = getDb();

  // Check if user already exists
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    if (existing.passwordHash) {
      throw new Error('An account with this email already exists');
    }
    // User exists from auto-creation (API key auth) but has no password — set it
    const passwordHash = await hashPassword(password);
    const [updated] = await db
      .update(users)
      .set({
        passwordHash,
        name: name || existing.name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();

    const token = signJwt({
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      organizationId: updated.organizationId,
    });

    return {
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        organizationId: updated.organizationId,
      },
      token,
    };
  }

  // Create new user
  const passwordHash = await hashPassword(password);
  
  // Lookup tenantId from organization or use default
  const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  let tenantId = DEFAULT_TENANT_ID;
  if (organizationId) {
    const [org] = await db
      .select({ tenantId: organizations.tenantId })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    tenantId = org?.tenantId || DEFAULT_TENANT_ID;
  }
  
  const [newUser] = await db
    .insert(users)
    .values({
      tenantId,
      email: email.toLowerCase(),
      name,
      passwordHash,
      role: 'sender',
      organizationId: organizationId || null,
      isActive: true,
    })
    .returning();

  const token = signJwt({
    userId: newUser.id,
    email: newUser.email,
    role: newUser.role,
    organizationId: newUser.organizationId,
  });

  return {
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      organizationId: newUser.organizationId,
    },
    token,
  };
}

// ─── Login ───────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    throw new Error('Invalid email or password');
  }

  if (!user.isActive) {
    throw new Error('Account has been deactivated');
  }

  // Account lockout check
  if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
    const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    throw new Error(`Account is temporarily locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
  }

  if (!user.passwordHash) {
    throw new Error('This account uses SSO. Please sign in with your identity provider.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    // Increment failed attempts
    const newFailedCount = (user.failedLoginAttempts ?? 0) + 1;
    const updates: Record<string, unknown> = {
      failedLoginAttempts: newFailedCount,
      lastFailedAt: new Date(),
    };

    // Lock account if too many failed attempts
    if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
    }

    await db.update(users).set(updates).where(eq(users.id, user.id));

    const attemptsLeft = MAX_FAILED_ATTEMPTS - newFailedCount;
    if (attemptsLeft > 0) {
      throw new Error(`Invalid email or password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`);
    } else {
      throw new Error(`Account locked for ${LOCKOUT_DURATION_MINUTES} minutes due to too many failed attempts.`);
    }
  }

  // Successful login — reset lockout counters
  await db.update(users).set({
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastFailedAt: null,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));

  const token = signJwt({
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    },
    token,
  };
}

// ─── SSO Login (issue JWT for SSO-authenticated user) ────────────────

export async function ssoLogin(
  email: string,
  name: string | null,
  ssoSubject: string,
  organizationId: string,
): Promise<AuthResult> {
  const db = getDb();

  // Look up by SSO subject or email
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.ssoSubject, ssoSubject))
    .limit(1);

  if (!user) {
    [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
  }

  if (user) {
    // Update SSO subject if not set
    if (!user.ssoSubject) {
      await db.update(users).set({ ssoSubject, updatedAt: new Date() }).where(eq(users.id, user.id));
    }
  } else {
    // Auto-create user from SSO
    // Lookup tenantId from organization or use default
    const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    let tenantId = DEFAULT_TENANT_ID;
    if (organizationId) {
      const [org] = await db
        .select({ tenantId: organizations.tenantId })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      tenantId = org?.tenantId || DEFAULT_TENANT_ID;
    }
    
    [user] = await db
      .insert(users)
      .values({
        tenantId,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        ssoSubject,
        organizationId,
        role: 'sender',
        isActive: true,
      })
      .returning();
  }

  if (!user.isActive) {
    throw new Error('Account has been deactivated');
  }

  const token = signJwt({
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    },
    token,
  };
}
