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

  // Find existing sessions for this user — always let them choose
  const userId = session.user?.email || session.user?.name;
  if (userId) {
    try {
      const sessions = await d1ListSessions(userId);
      // Any existing sessions → always show picker (let the user choose)
      if (sessions.length > 0) {
        redirect('/session/pick');
        return;
      }
    } catch {
      // If D1 is unavailable, still show the picker — it fetches sessions
      // client-side via /api/sessions and can handle errors gracefully.
      // Previously this fell through to /session/new, which created a new
      // session on every login when D1 was slow/unavailable on mobile.
      redirect('/session/pick');
      return;
    }
  }

  // Truly new user with zero sessions → create first session
  redirect('/session/new');
}
