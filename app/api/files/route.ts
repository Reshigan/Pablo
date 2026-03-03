import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
  d1CreateFile,
  d1GetFilesBySession,
  d1GetFileByPath,
  d1UpdateFile,
} from '@/lib/db/d1-files';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const files = await d1GetFilesBySession(sessionId);
  return Response.json(files);
}

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

  const existing = await d1GetFileByPath(body.sessionId, body.path);
  if (existing) {
    const updated = await d1UpdateFile(existing.id, {
      content: body.content ?? existing.content,
      language: body.language ?? existing.language ?? undefined,
    });
    return Response.json(updated);
  }

  const file = await d1CreateFile({
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

  let fileId = body.id;
  if (!fileId && body.sessionId && body.path) {
    const found = await d1GetFileByPath(body.sessionId, body.path);
    if (found) fileId = found.id;
  }

  if (!fileId) {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  const updated = await d1UpdateFile(fileId, { content: body.content });

  if (!updated) {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  return Response.json(updated);
}
