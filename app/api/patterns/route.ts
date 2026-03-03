import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { d1CreatePattern, d1GetPatterns } from '@/lib/db/d1-patterns';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type') ?? undefined;
  const patterns = await d1GetPatterns(type);
  return Response.json(patterns);
}

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

  const pattern = await d1CreatePattern({
    sessionId: body.sessionId ?? null,
    type: body.type,
    trigger: body.trigger,
    action: body.action,
    confidence: body.confidence ?? 0.5,
    metadata: body.metadata ?? null,
  });

  return Response.json(pattern, { status: 201 });
}
