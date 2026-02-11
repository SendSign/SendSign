import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/connection.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// ─── Config ──────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || process.env.API_KEY || 'change-this-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const BCRYPT_ROUNDS = 12;

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
  const [newUser] = await db
    .insert(users)
    .values({
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

  if (!user.passwordHash) {
    // User exists from SSO or API key but never set a password
    throw new Error('This account uses SSO. Please sign in with your identity provider.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid email or password');
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
    [user] = await db
      .insert(users)
      .values({
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
