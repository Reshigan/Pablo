/**
 * GET /api/health — ARCH-02: Public health endpoint for uptime monitoring.
 * Returns 200 with service status. No auth required (excluded from middleware).
 */
import { OLLAMA_CLOUD_URL } from '@/lib/env';

const START_TIME = Date.now();

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export async function GET() {
  const now = Date.now();
  const uptimeMs = now - START_TIME;

  const status: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '10.0.0',
    uptime: {
      ms: uptimeMs,
      human: formatUptime(uptimeMs),
    },
    runtime: typeof globalThis.caches !== 'undefined' ? 'cloudflare-workers' : 'node',
  };

  // Check D1 connectivity with latency
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as Record<string, unknown>;
    if (env.DB) {
      const d1 = env.DB as { prepare: (sql: string) => { first: () => Promise<unknown> } };
      const d1Start = Date.now();
      await d1.prepare('SELECT 1').first();
      status.d1 = { status: 'connected', latencyMs: Date.now() - d1Start };
    } else {
      status.d1 = { status: 'no_binding' };
    }
  } catch {
    status.d1 = { status: 'unavailable' };
  }

  // Check Ollama API key presence (not value)
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    const hasKey = !!(cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY);
    const ollamaUrl = cfEnv.OLLAMA_URL || process.env.OLLAMA_URL || OLLAMA_CLOUD_URL;
    status.ollama = { status: hasKey ? 'configured' : 'missing_key', url: ollamaUrl };
  } catch {
    const hasKey = !!process.env.OLLAMA_API_KEY;
    status.ollama = { status: hasKey ? 'configured' : 'missing_key', url: process.env.OLLAMA_URL || OLLAMA_CLOUD_URL };
  }

  // Check GitHub OAuth configuration
  status.github = {
    oauth: (process.env.GITHUB_CLIENT_ID || process.env.AUTH_GITHUB_ID) ? 'configured' : 'missing',
  };

  return Response.json(status, {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}
