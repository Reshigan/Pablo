import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDB } from '@/lib/db/drizzle';

/**
 * GET /api/sessions - List all sessions
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = getDB();
  const sessions = db.listSessions();
  return Response.json(sessions);
}

/**
 * POST /api/sessions - Create a new session
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    repoUrl?: string;
    repoBranch?: string;
  };

  const db = getDB();
  const newSession = db.createSession({
    title: body.title ?? 'Untitled Session',
    repoUrl: body.repoUrl ?? null,
    repoBranch: body.repoBranch ?? 'main',
  });

  return Response.json(newSession, { status: 201 });
}
