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
      // Sessions are returned ordered by updated_at DESC
      const lastActive = sessions.find((s) => s.status === 'active');
      if (lastActive) {
        redirect(`/session/${lastActive.id}`);
        return;
      }
    } catch {
      // If D1 is unavailable, fall through to create new session
    }
  }

  // No active sessions found — create a new one
  redirect('/session/new');
}
