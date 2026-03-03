/**
 * D1-backed file CRUD operations.
 * Falls back gracefully if D1 is unavailable (local dev).
 */
import { getD1 } from './drizzle';
import { files } from './schema';
import { eq, and, asc } from 'drizzle-orm';
import { generateId } from './queries';

export interface D1File {
  id: string;
  sessionId: string;
  path: string;
  name: string;
  content: string;
  language: string | null;
  isDirectory: boolean;
  parentPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function d1CreateFile(data: {
  sessionId: string;
  path: string;
  name: string;
  content?: string;
  language?: string;
  isDirectory?: boolean;
  parentPath?: string | null;
}): Promise<D1File> {
  const id = generateId('file');
  const now = new Date().toISOString();
  const d1 = await getD1();

  if (d1) {
    await d1.insert(files).values({
      id,
      sessionId: data.sessionId,
      path: data.path,
      name: data.name,
      content: data.content ?? '',
      language: data.language ?? 'plaintext',
      isDirectory: data.isDirectory ?? false,
      parentPath: data.parentPath ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const rows = await d1.select().from(files).where(eq(files.id, id));
    if (rows.length > 0) return rows[0] as unknown as D1File;
  }

  return {
    id,
    sessionId: data.sessionId,
    path: data.path,
    name: data.name,
    content: data.content ?? '',
    language: data.language ?? 'plaintext',
    isDirectory: data.isDirectory ?? false,
    parentPath: data.parentPath ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function d1GetFilesBySession(sessionId: string): Promise<D1File[]> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1
      .select()
      .from(files)
      .where(eq(files.sessionId, sessionId))
      .orderBy(asc(files.path));
    return rows as unknown as D1File[];
  }
  return [];
}

export async function d1GetFileByPath(sessionId: string, path: string): Promise<D1File | null> {
  const d1 = await getD1();
  if (d1) {
    const rows = await d1
      .select()
      .from(files)
      .where(and(eq(files.sessionId, sessionId), eq(files.path, path)));
    return rows.length > 0 ? (rows[0] as unknown as D1File) : null;
  }
  return null;
}

export async function d1UpdateFile(
  id: string,
  updates: { content?: string; language?: string }
): Promise<D1File | null> {
  const d1 = await getD1();
  if (d1) {
    const setValues: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (updates.content !== undefined) setValues.content = updates.content;
    if (updates.language !== undefined) setValues.language = updates.language;
    await d1.update(files).set(setValues).where(eq(files.id, id));
    const rows = await d1.select().from(files).where(eq(files.id, id));
    return rows.length > 0 ? (rows[0] as unknown as D1File) : null;
  }
  return null;
}

export async function d1DeleteFile(id: string): Promise<boolean> {
  const d1 = await getD1();
  if (d1) {
    const existing = await d1.select({ id: files.id }).from(files).where(eq(files.id, id));
    if (existing.length === 0) return false;
    await d1.delete(files).where(eq(files.id, id));
    return true;
  }
  return false;
}
