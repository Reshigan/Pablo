import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDB } from '@/lib/db/drizzle';

/**
 * GET /api/sessions/:id/messages - Get all messages for a session
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
  const messages = db.getMessagesBySession(id);
  return Response.json(messages);
}

/**
 * POST /api/sessions/:id/messages - Create a message in a session
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    role: 'user' | 'assistant' | 'system';
    content: string;
    model?: string;
    tokens?: number;
    durationMs?: number;
  };

  const db = getDB();

  // Verify session exists
  const found = db.getSession(id);
  if (!found) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  const message = db.createMessage({
    sessionId: id,
    role: body.role,
    content: body.content,
    model: body.model ?? null,
    tokens: body.tokens ?? null,
    durationMs: body.durationMs ?? null,
  });

  return Response.json(message, { status: 201 });
}
