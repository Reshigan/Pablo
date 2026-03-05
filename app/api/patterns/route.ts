import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { d1CreatePattern, d1GetPatterns } from '@/lib/db/d1-patterns';
import { verifySessionOwnership } from '@/lib/db/ownership';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const type = request.nextUrl.searchParams.get('type') ?? undefined;
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    // SEC-01: verify session ownership if sessionId is provided
    if (sessionId) {
      await verifySessionOwnership(sessionId);
    }

    const patterns = await d1GetPatterns(type);
    return Response.json(patterns);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[GET /api/patterns]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      sessionId?: string;
      type: 'code_pattern' | 'error_fix' | 'architecture' | 'convention' | 'shortcut';
      trigger: string;
      action: string;
      confidence?: number;
      metadata?: string;
    };

    if (!body.type || !body.trigger || !body.action) {
      return Response.json(
        { error: 'type, trigger, and action are required' },
        { status: 400 }
      );
    }

    // SEC-01: verify session ownership if sessionId is provided
    if (body.sessionId) {
      await verifySessionOwnership(body.sessionId);
    }

    const pattern = await d1CreatePattern({
      sessionId: body.sessionId ?? null,
      type: body.type,
      trigger: body.trigger,
      action: body.action,
      confidence: body.confidence ?? 0.5,
      metadata: body.metadata ?? null,
    });

    return Response.json(pattern, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[POST /api/patterns]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
