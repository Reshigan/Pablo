import { auth } from '@/lib/auth';

/**
 * GET /api/env-config — returns only the LLM config (OLLAMA_URL + OLLAMA_API_KEY).
 * SEC-01/SEC-05: replaces the old /api/env which exposed ALL env vars.
 * This endpoint is auth-gated and only returns what the client needs for
 * evaluate/fix modes that call LLM functions client-side.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return Response.json({
      OLLAMA_URL: cfEnv.OLLAMA_URL || process.env.OLLAMA_URL || 'https://api.ollama.ai/v1',
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY || '',
    });
  } catch {
    return Response.json({
      OLLAMA_URL: process.env.OLLAMA_URL || 'https://api.ollama.ai/v1',
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || '',
    });
  }
}
