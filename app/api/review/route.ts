/**
 * POST /api/review — AI PR Review endpoint
 *
 * Accepts a diff string, returns structured review comments.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { reviewPR } from '@/lib/agents/prReview';
import { getEnvConfig } from '@/lib/env';
import { checkRateLimit, getClientIP, rateLimitHeaders, RATE_LIMITS } from '@/lib/rateLimit';
import { checkBodySize, BODY_SIZE_LIMITS } from '@/lib/apiGuard';
import { createLogger } from '@/lib/logger';

const log = createLogger('review-route');

// getEnvConfig imported from @/lib/env

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    // ARCH-05: Body size guard
    const sizeErr = checkBodySize(request.headers, BODY_SIZE_LIMITS.code);
    if (sizeErr) return sizeErr;

    // ARCH-01: Rate limiting
    const clientIP = getClientIP(request.headers);
    const rl = checkRateLimit(`review:${clientIP}`, RATE_LIMITS.chat);
    if (!rl.allowed) {
      log.warn('Review rate limit exceeded', { ip: clientIP });
      return Response.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json() as {
      diff: string;
      repo?: string;
      prNumber?: number;
    };

    if (!body.diff) {
      return Response.json({ error: 'diff is required' }, { status: 400 });
    }

    const env = await getEnvConfig();
    const result = await reviewPR(body.diff, env);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Review failed' },
      { status: 500 },
    );
  }
}
