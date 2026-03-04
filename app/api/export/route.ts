import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { d1GetSession } from '@/lib/db/d1-sessions';
import { d1GetFilesBySession } from '@/lib/db/d1-files';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return Response.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const dbSession = await d1GetSession(sessionId);
    if (!dbSession) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    const files = await d1GetFilesBySession(sessionId);

    return Response.json({
      session: {
        id: dbSession.id,
        title: dbSession.title,
      },
      files: files
        .filter(f => !f.isDirectory)
        .map(f => ({
          path: f.path,
          name: f.name,
          content: f.content,
          language: f.language,
        })),
      exportedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /api/export]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
