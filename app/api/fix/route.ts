import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { runIncrementalPipeline, detectIncrementalMode } from '@/lib/agents/incrementalPipeline';
import type { EnvConfig } from '@/lib/agents/modelRouter';
import { checkRateLimit, getClientIP, rateLimitHeaders, RATE_LIMITS } from '@/lib/rateLimit';
import { loggers } from '@/lib/logger';

/**
 * POST /api/fix — Server-side incremental fix pipeline.
 * SEC-02: API key stays server-side; client never sees OLLAMA_API_KEY.
 */

const OLLAMA_CLOUD_URL = 'https://ollama.com/api';

async function getEnvConfig(): Promise<EnvConfig> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return {
      OLLAMA_URL: cfEnv.OLLAMA_URL || process.env.OLLAMA_URL || OLLAMA_CLOUD_URL,
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY,
    };
  } catch {
    return {
      OLLAMA_URL: process.env.OLLAMA_URL || OLLAMA_CLOUD_URL,
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    };
  }
}

interface FixRequestBody {
  description: string;
  files: Array<{ path: string; content: string; language: string }>;
  mode?: 'bug-fix' | 'add-feature' | 'refactor';
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ARCH-01: Rate limiting
  const clientIP = getClientIP(req.headers);
  const rl = checkRateLimit(`fix:${clientIP}`, RATE_LIMITS.chat);
  if (!rl.allowed) {
    loggers.fix.warn('Rate limit exceeded', { ip: clientIP });
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: FixRequestBody;
  try {
    body = await req.json() as FixRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.description || !Array.isArray(body.files) || body.files.length === 0) {
    return Response.json({ error: 'description and files array are required' }, { status: 400 });
  }

  const env = await getEnvConfig();
  const mode = body.mode || detectIncrementalMode(body.description);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await runIncrementalPipeline(
          body.description,
          mode,
          body.files,
          env,
          (progress) => sendSSE({ type: 'progress', ...progress }),
        );

        sendSSE({ type: 'result', result });
        sendSSE({ type: 'done' });
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Fix pipeline failed';
        sendSSE({ type: 'error', error: errorMsg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
