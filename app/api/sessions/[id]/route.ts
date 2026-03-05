import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { d1GetSession, d1UpdateSession, d1DeleteSession } from '@/lib/db/d1-sessions';
import { verifySessionOwnership } from '@/lib/db/ownership';

/**
 * GET /api/sessions/:id - Get a single session with full snapshot
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

  try {
    // SEC-01: verify session ownership
    await verifySessionOwnership(id);

    const found = await d1GetSession(id);
    if (!found) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse snapshot from JSON string
    let snapshot = null;
    if (found.snapshot) {
      try {
        snapshot = typeof found.snapshot === 'string' ? JSON.parse(found.snapshot) : found.snapshot;
      } catch { /* invalid JSON, ignore */ }
    }

    return Response.json({ ...found, snapshot });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('Failed to get session:', err);
    return Response.json({ error: 'Failed to get session' }, { status: 500 });
  }
}

/**
 * POST /api/sessions/:id - Save snapshot via sendBeacon (always POST).
 * navigator.sendBeacon() only sends POST requests, not PATCH.
 * This endpoint handles the snapshot save from beforeunload.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // sendBeacon sends cookies, so auth() should work
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    // SEC-01: verify session ownership
    await verifySessionOwnership(id);

    // Parse body — sendBeacon sends as Blob with type application/json
    const body = await request.json() as { snapshot?: Record<string, unknown> };

    if (body.snapshot) {
      await d1UpdateSession(id, {
        snapshot: JSON.stringify(body.snapshot),
      });
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('Failed to save session snapshot (sendBeacon):', err);
    return new Response('Failed', { status: 500 });
  }
}

/**
 * PATCH /api/sessions/:id - Update a session (title, status, repo, snapshot)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    // SEC-01: verify session ownership
    await verifySessionOwnership(id);
    const body = (await request.json()) as {
      title?: string;
      status?: 'active' | 'paused' | 'completed' | 'error';
      repoFullName?: string | null;
      repoBranch?: string;
      snapshot?: Record<string, unknown>;
    };

    const updates: Record<string, string | null | undefined> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.status !== undefined) updates.status = body.status;
    if (body.repoFullName !== undefined) updates.repoUrl = body.repoFullName;
    if (body.repoBranch !== undefined) updates.repoBranch = body.repoBranch;
    if (body.snapshot !== undefined) updates.snapshot = JSON.stringify(body.snapshot);

    const updated = await d1UpdateSession(id, updates);
    if (!updated) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    return Response.json(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('Failed to update session:', err);
    return Response.json({ error: 'Failed to update session' }, { status: 500 });
  }
}

/**
 * DELETE /api/sessions/:id - Delete a session
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    // SEC-01: verify session ownership
    await verifySessionOwnership(id);
    const deleted = await d1DeleteSession(id);
    if (!deleted) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('Failed to delete session:', err);
    return Response.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
