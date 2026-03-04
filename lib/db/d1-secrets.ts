/**
 * D1-backed secrets CRUD operations.
 * Falls back gracefully if D1 is unavailable (local dev).
 */

import { getD1 } from './drizzle';
import { secrets } from './schema';
import { eq, and } from 'drizzle-orm';
import { generateId } from './queries';

export interface D1Secret {
  id: string;
  sessionId: string | null;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * List all secrets for a session from D1.
 */
export async function d1ListSecrets(sessionId: string): Promise<D1Secret[]> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1
      .select()
      .from(secrets)
      .where(eq(secrets.sessionId, sessionId));
    return rows as unknown as D1Secret[];
  }
  return [];
}

/**
 * Create or upsert a secret in D1.
 * If a secret with the same key+session exists, update it.
 */
export async function d1UpsertSecret(
  sessionId: string,
  key: string,
  value: string,
): Promise<D1Secret> {
  const d1 = await getD1();
  const now = new Date().toISOString();

  if (d1) {
    // Check if secret already exists for this session+key
    const existing = await d1
      .select()
      .from(secrets)
      .where(and(eq(secrets.sessionId, sessionId), eq(secrets.key, key)));

    if (existing.length > 0) {
      // Update existing
      await d1
        .update(secrets)
        .set({ value, updatedAt: now })
        .where(eq(secrets.id, existing[0].id));

      const updated = await d1
        .select()
        .from(secrets)
        .where(eq(secrets.id, existing[0].id));
      return updated[0] as unknown as D1Secret;
    }

    // Create new
    const id = generateId('sec');
    await d1.insert(secrets).values({
      id,
      sessionId,
      key,
      value,
      createdAt: now,
      updatedAt: now,
    });

    return { id, sessionId, key, value, createdAt: now, updatedAt: now };
  }

  // Fallback for local dev
  return {
    id: generateId('sec'),
    sessionId,
    key,
    value,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Delete a secret from D1 by ID.
 */
export async function d1DeleteSecret(id: string): Promise<boolean> {
  const d1 = await getD1();
  if (d1) {
    const existing = await d1
      .select({ id: secrets.id })
      .from(secrets)
      .where(eq(secrets.id, id));
    if (existing.length === 0) return false;
    await d1.delete(secrets).where(eq(secrets.id, id));
    return true;
  }
  return false;
}

/**
 * Delete all secrets for a session.
 */
export async function d1DeleteSessionSecrets(sessionId: string): Promise<number> {
  const d1 = await getD1();
  if (d1) {
    const existing = await d1
      .select({ id: secrets.id })
      .from(secrets)
      .where(eq(secrets.sessionId, sessionId));
    if (existing.length > 0) {
      await d1.delete(secrets).where(eq(secrets.sessionId, sessionId));
    }
    return existing.length;
  }
  return 0;
}
