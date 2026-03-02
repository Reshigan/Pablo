import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDB } from '@/lib/db/drizzle';

/**
 * GET /api/patterns - List learned patterns
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type') ?? undefined;
  const db = getDB();
  const patterns = db.getPatterns(type);
  return Response.json(patterns);
}

/**
 * POST /api/patterns - Create a new pattern (auto-extracted or manual)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

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

  const db = getDB();
  const pattern = db.createPattern({
    sessionId: body.sessionId ?? null,
    type: body.type,
    trigger: body.trigger,
    action: body.action,
    confidence: body.confidence ?? 0.5,
    metadata: body.metadata ?? null,
  });

  return Response.json(pattern, { status: 201 });
}
