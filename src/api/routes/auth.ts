import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { registerUser, loginUser, verifyJwt } from '../../auth/authService.js';
import { getDb } from '../../db/connection.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

// ─── POST /api/auth/register ─────────────────────────────────────────

router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const result = await registerUser(req.body.email, req.body.password, req.body.name);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(400).json({ success: false, error: message });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────

router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const result = await loginUser(req.body.email, req.body.password);
    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    res.status(401).json({ success: false, error: message });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  // Extract JWT from Authorization header
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  try {
    const db = getDb();
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        organizationId: users.organizationId,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'Account not found or deactivated' });
      return;
    }

    res.json({ success: true, data: { user } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

export default router;
