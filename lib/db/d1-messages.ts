/**
 * D1-backed message CRUD operations.
 * Falls back gracefully if D1 is unavailable (local dev).
 */
import { getD1 } from './drizzle';
import { messages } from './schema';
import { eq, asc } from 'drizzle-orm';
import { generateId } from './queries';

export interface D1Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  tokens: number | null;
  durationMs: number | null;
  createdAt: string;
}

export async function d1CreateMessage(data: {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string | null;
  tokens?: number | null;
  durationMs?: number | null;
}): Promise<D1Message> {
  const id = generateId('msg');
  const now = new Date().toISOString();
  const d1 = await getD1();

  if (d1) {
    await d1.insert(messages).values({
      id,
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      model: data.model ?? null,
      tokens: data.tokens ?? null,
      durationMs: data.durationMs ?? null,
      createdAt: now,
    });
    const rows = await d1.select().from(messages).where(eq(messages.id, id));
    if (rows.length > 0) return rows[0] as unknown as D1Message;
  }

  return {
    id,
    sessionId: data.sessionId,
    role: data.role,
    content: data.content,
    model: data.model ?? null,
    tokens: data.tokens ?? null,
    durationMs: data.durationMs ?? null,
    createdAt: now,
  };
}

export async function d1GetMessagesBySession(sessionId: string): Promise<D1Message[]> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt));
    return rows as unknown as D1Message[];
  }
  return [];
}
