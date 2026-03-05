/**
 * Session ownership verification — SEC-01
 * Ensures authenticated users can only access their own sessions.
 */

import { auth } from '@/lib/auth';
import { d1GetSession } from '@/lib/db/d1-sessions';

/**
 * Verify the authenticated user owns the given session.
 * Returns the userId if valid, throws Response if not.
 */
export async function verifySessionOwnership(sessionId: string): Promise<string> {
  const session = await auth();
  if (!session) {
    throw new Response('Unauthorized', { status: 401 });
  }

  const userId = session.user?.email || session.user?.name;
  if (!userId) {
    throw new Response(JSON.stringify({ error: 'No user identity' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const dbSession = await d1GetSession(sessionId);
  if (!dbSession || dbSession.userId !== userId) {
    throw new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return userId;
}
