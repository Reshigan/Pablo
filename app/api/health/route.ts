/**
 * GET /api/health — ARCH-02: Public health endpoint for uptime monitoring.
 * Returns 200 with service status. No auth required (excluded from middleware).
 */
export async function GET() {
  const status: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '10.0.0',
  };

  // Check D1 connectivity
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as Record<string, unknown>;
    if (env.DB) {
      const d1 = env.DB as { prepare: (sql: string) => { first: () => Promise<unknown> } };
      await d1.prepare('SELECT 1').first();
      status.d1 = 'connected';
    } else {
      status.d1 = 'no_binding';
    }
  } catch {
    status.d1 = 'unavailable';
  }

  // Check Ollama API key presence (not value)
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    status.ollama = (cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY) ? 'configured' : 'missing_key';
  } catch {
    status.ollama = process.env.OLLAMA_API_KEY ? 'configured' : 'missing_key';
  }

  return Response.json(status);
}
