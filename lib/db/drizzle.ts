/**
 * Pablo v5 Database Connection
 *
 * Local dev  → In-memory SQLite via the existing InMemoryStore (no native addons needed)
 * Workers    → Cloudflare D1 via Drizzle ORM
 *
 * `getDB()` returns the InMemoryStore for backward compat.
 * `getD1()` returns a Drizzle D1 instance when running inside Cloudflare Workers.
 */

import { db as inMemoryDB } from './queries';

// Re-export the in-memory store as the default DB for local development.
// This keeps the codebase working without requiring native SQLite bindings
// (which don't work in Next.js 16 / Cloudflare Workers environment).
export function getDB() {
  return inMemoryDB;
}

/**
 * Get a Drizzle ORM instance backed by Cloudflare D1.
 * Returns null when running outside Cloudflare Workers (local dev).
 */
export async function getD1(): Promise<ReturnType<typeof import('drizzle-orm/d1').drizzle> | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as Record<string, unknown>;
    const d1 = env.DB;
    if (!d1) {
      const msg = `[getD1] DB binding not found. Available bindings: ${Object.keys(env).join(', ')}`;
      console.error(msg);
      // REL-02: throw in production instead of silent fallback
      if (env.ENVIRONMENT === 'production') throw new Error(msg);
      return null;
    }

    const { drizzle } = await import('drizzle-orm/d1');
    const schema = await import('./schema');
    return drizzle(d1 as unknown as Parameters<typeof drizzle>[0], { schema });
  } catch (err) {
    console.error('[getD1] Failed to get D1:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Execute raw SQL against D1 (for migrations).
 * Returns false if D1 is not available.
 */
export async function execD1SQL(sql: string): Promise<boolean> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as Record<string, unknown>;
    const d1 = env.DB as { exec: (sql: string) => Promise<unknown> } | undefined;
    if (!d1) {
      console.error('[execD1SQL] DB binding not found. Available bindings:', Object.keys(env).join(', '));
      return false;
    }
    await d1.exec(sql);
    return true;
  } catch (err) {
    console.error('[execD1SQL] Failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export { inMemoryDB };
