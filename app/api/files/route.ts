import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDB } from '@/lib/db/drizzle';

/**
 * GET /api/files?sessionId=xxx - List files for a session
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const db = getDB();
  const files = db.getFilesBySession(sessionId);
  return Response.json(files);
}

/**
 * POST /api/files - Create or update a file
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as {
    sessionId: string;
    path: string;
    name: string;
    content?: string;
    language?: string;
    isDirectory?: boolean;
    parentPath?: string;
  };

  if (!body.sessionId || !body.path || !body.name) {
    return Response.json(
      { error: 'sessionId, path, and name are required' },
      { status: 400 }
    );
  }

  const db = getDB();

  // Check if file already exists at this path - update it instead
  const existing = db.getFileByPath(body.sessionId, body.path);
  if (existing) {
    const updated = db.updateFile(existing.id, {
      content: body.content ?? existing.content,
      language: body.language ?? existing.language,
    });
    return Response.json(updated);
  }

  const file = db.createFile({
    sessionId: body.sessionId,
    path: body.path,
    name: body.name,
    content: body.content ?? '',
    language: body.language ?? 'plaintext',
    isDirectory: body.isDirectory ?? false,
    parentPath: body.parentPath ?? null,
  });

  return Response.json(file, { status: 201 });
}

/**
 * PATCH /api/files - Update file content (for save)
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    sessionId?: string;
    path?: string;
    content: string;
  };

  const db = getDB();

  // Find by id or by sessionId+path
  let fileId = body.id;
  if (!fileId && body.sessionId && body.path) {
    const found = db.getFileByPath(body.sessionId, body.path);
    if (found) fileId = found.id;
  }

  if (!fileId) {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  const updated = db.updateFile(fileId, { content: body.content });
  if (!updated) {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  return Response.json(updated);
}
