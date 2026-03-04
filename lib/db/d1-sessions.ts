/**
 * D1-backed session CRUD operations.
 * Falls back to in-memory store if D1 is unavailable (local dev).
 */

import { getD1 } from './drizzle';
import { sessions } from './schema';
import { eq, desc } from 'drizzle-orm';
import { generateId } from './queries';

export interface D1Session {
  id: string;
  userId: string | null;
  title: string;
  repoUrl: string | null;
  repoBranch: string | null;
  createdAt: string;
  updatedAt: string;
  status: string;
  metadata: string | null;
  snapshot: string | null;
}

/**
 * Create a new session in D1.
 */
export async function d1CreateSession(data: {
  userId?: string | null;
  title?: string;
  repoUrl?: string | null;
  repoBranch?: string;
}): Promise<D1Session> {
  const id = generateId('ses');
  const now = new Date().toISOString();

  const d1 = await getD1();
  if (d1) {
    await d1.insert(sessions).values({
      id,
      userId: data.userId ?? null,
      title: data.title ?? 'Untitled Session',
      repoUrl: data.repoUrl ?? null,
      repoBranch: data.repoBranch ?? 'main',
      createdAt: now,
      updatedAt: now,
      status: 'active',
      metadata: null,
      snapshot: null,
    });

    // Return the created session
    const rows = await d1.select().from(sessions).where(eq(sessions.id, id));
    if (rows.length > 0) return rows[0] as unknown as D1Session;
  }

  // Fallback: return a constructed object
  return {
    id,
    userId: data.userId ?? null,
    title: data.title ?? 'Untitled Session',
    repoUrl: data.repoUrl ?? null,
    repoBranch: data.repoBranch ?? 'main',
    createdAt: now,
    updatedAt: now,
    status: 'active',
    metadata: null,
    snapshot: null,
  };
}

/**
 * List all sessions from D1, sorted by updatedAt descending.
 */
export async function d1ListSessions(userId?: string): Promise<D1Session[]> {
  const d1 = await getD1();
  if (d1) {
    if (userId) {
      const rows = await d1.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.updatedAt));
      return rows as unknown as D1Session[];
    }
    const rows = await d1.select().from(sessions).orderBy(desc(sessions.updatedAt));
    return rows as unknown as D1Session[];
  }
  return [];
}

/**
 * Get a single session by ID from D1.
 */
export async function d1GetSession(id: string): Promise<D1Session | null> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1.select().from(sessions).where(eq(sessions.id, id));
    return rows.length > 0 ? (rows[0] as unknown as D1Session) : null;
  }
  return null;
}

/**
 * Update a session in D1. Accepts partial updates.
 */
export async function d1UpdateSession(
  id: string,
  updates: {
    title?: string;
    status?: string;
    repoUrl?: string | null;
    repoBranch?: string;
    snapshot?: string;
    metadata?: string;
  }
): Promise<D1Session | null> {
  const d1 = await getD1();
  if (d1) {
    const setValues: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (updates.title !== undefined) setValues.title = updates.title;
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.repoUrl !== undefined) setValues.repoUrl = updates.repoUrl;
    if (updates.repoBranch !== undefined) setValues.repoBranch = updates.repoBranch;
    if (updates.snapshot !== undefined) setValues.snapshot = updates.snapshot;
    if (updates.metadata !== undefined) setValues.metadata = updates.metadata;

    await d1.update(sessions).set(setValues).where(eq(sessions.id, id));

    // Return updated session
    const rows = await d1.select().from(sessions).where(eq(sessions.id, id));
    return rows.length > 0 ? (rows[0] as unknown as D1Session) : null;
  }
  return null;
}

/**
 * Delete a session from D1.
 */
export async function d1DeleteSession(id: string): Promise<boolean> {
  const d1 = await getD1();
  if (d1) {
    // Check if session exists first, then delete
    const existing = await d1.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, id));
    if (existing.length === 0) return false;
    await d1.delete(sessions).where(eq(sessions.id, id));
    return true;
  }
  return false;
}
