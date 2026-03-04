import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { d1CreateSession, d1ListSessions } from '@/lib/db/d1-sessions';

/**
 * GET /api/sessions - List all sessions
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // SEC-03: scope sessions to authenticated user
    const userId = session.user?.email || session.user?.name || undefined;
    const sessions = await d1ListSessions(userId);
    return Response.json(sessions);
  } catch (err) {
    console.error('Failed to list sessions:', err);
    return Response.json([], { status: 200 });
  }
}

/**
 * POST /api/sessions - Create a new session
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      repoUrl?: string;
      repoBranch?: string;
    };

    // SEC-03: scope new session to authenticated user
    const userId = session.user?.email || session.user?.name || null;
    const newSession = await d1CreateSession({
      userId,
      title: body.title ?? 'Untitled Session',
      repoUrl: body.repoUrl ?? null,
      repoBranch: body.repoBranch ?? 'main',
    });

    return Response.json(newSession, { status: 201 });
  } catch (err) {
    console.error('Failed to create session:', err);
    return Response.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
