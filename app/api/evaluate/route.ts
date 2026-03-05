import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { evaluateRepo } from '@/lib/agents/repoEvaluator';
import type { EnvConfig } from '@/lib/agents/modelRouter';

/**
 * POST /api/evaluate — Server-side repo evaluation.
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

interface EvaluateRequestBody {
  files: Array<{ path: string; content: string; language: string }>;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: EvaluateRequestBody;
  try {
    body = await req.json() as EvaluateRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.files) || body.files.length === 0) {
    return Response.json({ error: 'files array is required' }, { status: 400 });
  }

  const env = await getEnvConfig();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await evaluateRepo(
          body.files,
          env,
          (msg) => sendSSE({ type: 'progress', message: msg }),
        );

        sendSSE({ type: 'result', result });
        sendSSE({ type: 'done' });
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Evaluation failed';
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
