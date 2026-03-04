import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { d1GetMessagesBySession, d1CreateMessage } from '@/lib/db/d1-messages';
import { d1GetSession } from '@/lib/db/d1-sessions';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await params;
    const messages = await d1GetMessagesBySession(id);
    return Response.json(messages);
  } catch (err) {
    console.error('[GET /api/sessions/:id/messages]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as {
      role: 'user' | 'assistant' | 'system';
      content: string;
      model?: string;
      tokens?: number;
      durationMs?: number;
    };

    const found = await d1GetSession(id);
    if (!found) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    const message = await d1CreateMessage({
      sessionId: id,
      role: body.role,
      content: body.content,
      model: body.model ?? null,
      tokens: body.tokens ?? null,
      durationMs: body.durationMs ?? null,
    });

    return Response.json(message, { status: 201 });
  } catch (err) {
    console.error('[POST /api/sessions/:id/messages]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
