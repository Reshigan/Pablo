import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { d1ListSessions } from '@/lib/db/d1-sessions';

/**
 * Root page — after login, resume the most recent active session.
 * Only creates a new session if there are no existing active sessions.
 */
export default async function Home() {
  const session = await auth();
  if (!session) {
    redirect('/login');
    return;
  }

  // Find the most recent active session for this user
  const userId = session.user?.email || session.user?.name;
  if (userId) {
    try {
      const sessions = await d1ListSessions(userId);
      // If exactly one active session, go straight to it (fast path)
      const activeSessions = sessions.filter((s) => s.status === 'active');
      if (activeSessions.length === 1) {
        redirect(`/session/${activeSessions[0].id}`);
        return;
      }
      // Multiple active sessions OR only completed sessions → show picker
      if (sessions.length > 0) {
        redirect('/session/pick');
        return;
      }
    } catch {
      // If D1 is unavailable, fall through to create new session
    }
  }

  // Truly new user with zero sessions → create first session
  redirect('/session/new');
}
