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

  // Parse snapshot from JSON if stored as string
  let snapshot = null;
  if (found.snapshot) {
    try {
      snapshot = typeof found.snapshot === 'string' ? JSON.parse(found.snapshot) : found.snapshot;
    } catch { /* invalid JSON, ignore */ }
  }

  return Response.json({ ...found, snapshot, messages, files });
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
    repoFullName?: string | null;
    repoBranch?: string;
    snapshot?: Record<string, unknown>;
  };

  const db = getDB();
  // Serialize snapshot to JSON string for storage
  const updatePayload: Record<string, unknown> = {};
  if (body.title !== undefined) updatePayload.title = body.title;
  if (body.status !== undefined) updatePayload.status = body.status;
  if (body.repoFullName !== undefined) updatePayload.repoUrl = body.repoFullName;
  if (body.repoBranch !== undefined) updatePayload.repoBranch = body.repoBranch;
  if (body.snapshot !== undefined) updatePayload.snapshot = JSON.stringify(body.snapshot);

  const updated = db.updateSession(id, updatePayload);
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
