/**
 * Pablo v5 Database Connection
 *
 * Local dev  → In-memory SQLite via the existing InMemoryStore (no native addons needed)
 * Workers    → Cloudflare D1 via Drizzle ORM
 *
 * The `getDB()` helper returns the singleton InMemoryStore instance.
 * When deployed to Cloudflare Workers with a D1 binding, `getDrizzleDB()`
 * can be used instead to get a real Drizzle instance.
 */

import { db as inMemoryDB } from './queries';

// Re-export the in-memory store as the default DB for local development.
// This keeps the codebase working without requiring native SQLite bindings
// (which don't work in Next.js 16 / Cloudflare Workers environment).
export function getDB() {
  return inMemoryDB;
}

/**
 * For Cloudflare Workers with D1 binding:
 * import { drizzle } from 'drizzle-orm/d1';
 * import * as schema from './schema';
 *
 * export function getDrizzleDB(d1: D1Database) {
 *   return drizzle(d1, { schema });
 * }
 */

export { inMemoryDB };
