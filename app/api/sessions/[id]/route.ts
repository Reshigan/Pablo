import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDB } from '@/lib/db/drizzle';

/**
 * GET /api/sessions/:id - Get a single session with its messages
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const db = getDB();
  const found = db.getSession(id);
  if (!found) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  const messages = db.getMessagesBySession(id);
  const files = db.getFilesBySession(id);

  return Response.json({ ...found, messages, files });
}

/**
 * PATCH /api/sessions/:id - Update a session
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    title?: string;
    status?: 'active' | 'paused' | 'completed' | 'error';
  };

  const db = getDB();
  const updated = db.updateSession(id, body);
  if (!updated) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  return Response.json(updated);
}

/**
 * DELETE /api/sessions/:id - Delete a session
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const db = getDB();
  const deleted = db.deleteSession(id);
  if (!deleted) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
