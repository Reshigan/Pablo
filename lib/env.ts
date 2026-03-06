// lib/env.ts — Single source of truth for environment configuration
// EVERY route that needs Ollama config MUST import from here
export interface EnvConfig {
  OLLAMA_URL: string;
  OLLAMA_API_KEY: string | undefined;
}

/** Canonical Ollama Cloud URL — the /v1 suffix is REQUIRED for OpenAI-compatible endpoints */
export const OLLAMA_CLOUD_URL = 'https://api.ollama.ai/v1';

/**
 * Get environment config from Cloudflare Worker context or process.env.
 * This is the ONLY function that should read Ollama config.
 * All API routes must import and call this instead of having their own copy.
 */
export async function getEnvConfig(): Promise<EnvConfig> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return {
      OLLAMA_URL: cfEnv.OLLAMA_URL || process.env.OLLAMA_URL || OLLAMA_CLOUD_URL,
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY,
    };
  } catch {
    console.warn('[getEnvConfig] CF context unavailable, using process.env');
    return {
      OLLAMA_URL: process.env.OLLAMA_URL || OLLAMA_CLOUD_URL,
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    };
  }
}
