/**
 * POST /api/review — AI PR Review endpoint
 *
 * Accepts a diff string, returns structured review comments.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { reviewPR } from '@/lib/agents/prReview';
import type { EnvConfig } from '@/lib/agents/modelRouter';
import { checkRateLimit, getClientIP, rateLimitHeaders, RATE_LIMITS } from '@/lib/rateLimit';
import { checkBodySize, BODY_SIZE_LIMITS } from '@/lib/apiGuard';
import { loggers } from '@/lib/logger';

async function getEnvConfig(): Promise<EnvConfig> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return {
      OLLAMA_URL: cfEnv.OLLAMA_URL || 'https://ollama.com/api',
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || '',
    };
  } catch {
    return {
      OLLAMA_URL: process.env.OLLAMA_URL || 'https://ollama.com/api',
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || '',
    };
  }
}

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
      loggers.evaluate.warn('Review rate limit exceeded', { ip: clientIP });
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
