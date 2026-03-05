import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { d1ListSecrets, d1UpsertSecret, d1DeleteSecret } from '@/lib/db/d1-secrets';
import { verifySessionOwnership } from '@/lib/db/ownership';

/**
 * GET /api/secrets?sessionId=xxx — List all secrets for a session
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  try {
    // SEC-01: verify session ownership
    await verifySessionOwnership(sessionId);

    const secrets = await d1ListSecrets(sessionId);
    return NextResponse.json({ secrets });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list secrets' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/secrets — Create or update a secret
 * Body: { sessionId, key, value }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { sessionId?: string; key?: string; value?: string };
    if (!body.sessionId || !body.key || body.value === undefined) {
      return NextResponse.json({ error: 'sessionId, key, and value required' }, { status: 400 });
    }

    // SEC-01: verify session ownership
    await verifySessionOwnership(body.sessionId);

    const secret = await d1UpsertSecret(body.sessionId, body.key, body.value);
    return NextResponse.json({ secret });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save secret' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/secrets?id=xxx — Delete a secret by ID
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const deleted = await d1DeleteSecret(id);
    return NextResponse.json({ deleted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete secret' },
      { status: 500 },
    );
  }
}
