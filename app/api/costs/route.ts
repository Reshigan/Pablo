/**
 * GET /api/costs — Get cost summary dashboard data
 * POST /api/costs — Log an LLM call (internal use)
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { d1GetCostSummary, d1LogLLMCall } from '@/lib/db/d1-costs';
import { verifySessionOwnership } from '@/lib/db/ownership';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
    const summary = await d1GetCostSummary(days);

    return Response.json(summary);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const body = await request.json() as {
      sessionId?: string;
      model: string;
      tokensIn: number;
      tokensOut: number;
      durationMs: number;
      costUsd?: number;
      source?: string;
    };

    if (!body.model) {
      return Response.json({ error: 'model is required' }, { status: 400 });
    }

    // SEC-01: verify session ownership if sessionId is provided
    if (body.sessionId) {
      await verifySessionOwnership(body.sessionId);
    }

    await d1LogLLMCall({
      sessionId: body.sessionId,
      model: body.model,
      tokensIn: body.tokensIn || 0,
      tokensOut: body.tokensOut || 0,
      durationMs: body.durationMs || 0,
      costUsd: body.costUsd || 0,
      source: body.source || 'manual',
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
