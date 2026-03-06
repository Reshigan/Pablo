import { auth } from '@/lib/auth';

/**
 * GET /api/env-config — returns LLM config with API key masked.
 * SEC-02: Never expose raw API keys to the client. Returns a boolean
 * `hasApiKey` flag instead of the actual key value.
 * The client only needs OLLAMA_URL for display; all LLM calls go through
 * server-side routes that read the key from env directly.
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
    const apiKey = cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY || '';
    return Response.json({
      OLLAMA_URL: cfEnv.OLLAMA_URL || process.env.OLLAMA_URL || 'https://api.ollama.ai/v1',
      hasApiKey: apiKey.length > 0,
    });
  } catch {
    const apiKey = process.env.OLLAMA_API_KEY || '';
    return Response.json({
      OLLAMA_URL: process.env.OLLAMA_URL || 'https://api.ollama.ai/v1',
      hasApiKey: apiKey.length > 0,
    });
  }
}
