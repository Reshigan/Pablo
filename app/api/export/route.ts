import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDB } from '@/lib/db/drizzle';

/**
 * GET /api/export?sessionId=xxx - Export all session files as a downloadable zip
 *
 * Since we can't use native Node.js 'archiver' in Cloudflare Workers,
 * we build a simple zip-like bundle as a JSON manifest + files,
 * or use the browser-side JSZip approach.
 *
 * This endpoint returns the file tree as JSON. The client-side
 * uses JSZip to create the actual zip file for download.
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
  const dbSession = db.getSession(sessionId);
  if (!dbSession) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  const files = db.getFilesBySession(sessionId);

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
}
