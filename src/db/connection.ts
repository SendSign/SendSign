import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

let pool: pg.Pool | undefined;

/**
 * Get or create the PostgreSQL connection pool.
 */
export function getPool(connectionString?: string): pg.Pool {
  if (!pool) {
    const url = connectionString ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Provide it as an environment variable or pass a connection string.',
      );
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

/**
 * Get the Drizzle ORM instance, connected to PostgreSQL.
 * Uses the existing pool or creates one from DATABASE_URL.
 */
export function getDb(connectionString?: string) {
  return drizzle(getPool(connectionString), { schema });
}

export type Database = ReturnType<typeof getDb>;

/**
 * Close the database connection pool gracefully.
 */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
