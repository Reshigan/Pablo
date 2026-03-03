/**
 * D1-backed pattern CRUD operations (self-learning persistence).
 * Falls back gracefully if D1 is unavailable (local dev).
 */
import { getD1 } from './drizzle';
import { patterns } from './schema';
import { eq, desc } from 'drizzle-orm';
import { generateId } from './queries';

export type PatternType = 'code_pattern' | 'error_fix' | 'architecture' | 'convention' | 'shortcut';

export interface D1Pattern {
  id: string;
  sessionId: string | null;
  type: PatternType;
  trigger: string;
  action: string;
  confidence: number;
  usageCount: number;
  lastUsedAt: string | null;
  metadata: string | null;
  createdAt: string;
}

export async function d1CreatePattern(data: {
  sessionId?: string | null;
  type: PatternType;
  trigger: string;
  action: string;
  confidence?: number;
  metadata?: string | null;
}): Promise<D1Pattern> {
  const id = generateId('pat');
  const now = new Date().toISOString();
  const d1 = await getD1();

  if (d1) {
    await d1.insert(patterns).values({
      id,
      sessionId: data.sessionId ?? null,
      type: data.type,
      trigger: data.trigger,
      action: data.action,
      confidence: data.confidence ?? 0.5,
      usageCount: 0,
      lastUsedAt: null,
      metadata: data.metadata ?? null,
      createdAt: now,
    });
    const rows = await d1.select().from(patterns).where(eq(patterns.id, id));
    if (rows.length > 0) return rows[0] as unknown as D1Pattern;
  }

  return {
    id,
    sessionId: data.sessionId ?? null,
    type: data.type,
    trigger: data.trigger,
    action: data.action,
    confidence: data.confidence ?? 0.5,
    usageCount: 0,
    lastUsedAt: null,
    metadata: data.metadata ?? null,
    createdAt: now,
  };
}

export async function d1GetPatterns(type?: string): Promise<D1Pattern[]> {
  const d1 = await getD1();
  if (d1) {
    if (type) {
      const rows = await d1
        .select()
        .from(patterns)
        .where(eq(patterns.type, type as PatternType))
        .orderBy(desc(patterns.confidence));
      return rows as unknown as D1Pattern[];
    }
    const rows = await d1.select().from(patterns).orderBy(desc(patterns.confidence));
    return rows as unknown as D1Pattern[];
  }
  return [];
}

export async function d1UpdatePattern(
  id: string,
  updates: { confidence?: number; usageCount?: number; lastUsedAt?: string }
): Promise<D1Pattern | null> {
  const d1 = await getD1();
  if (d1) {
    const setValues: Record<string, unknown> = {};
    if (updates.confidence !== undefined) setValues.confidence = updates.confidence;
    if (updates.usageCount !== undefined) setValues.usageCount = updates.usageCount;
    if (updates.lastUsedAt !== undefined) setValues.lastUsedAt = updates.lastUsedAt;
    if (Object.keys(setValues).length > 0) {
      await d1.update(patterns).set(setValues).where(eq(patterns.id, id));
    }
    const rows = await d1.select().from(patterns).where(eq(patterns.id, id));
    return rows.length > 0 ? (rows[0] as unknown as D1Pattern) : null;
  }
  return null;
}
