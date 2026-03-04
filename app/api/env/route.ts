import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * GET /api/env - Returns environment config for client-side agent operations
 * (Evaluate/Fix modes need OLLAMA_URL and OLLAMA_API_KEY)
 */

const OLLAMA_CLOUD_URL = 'https://ollama.com';

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return NextResponse.json({
      OLLAMA_URL: cfEnv.OLLAMA_URL || process.env.OLLAMA_URL || OLLAMA_CLOUD_URL,
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY || '',
    });
  } catch {
    return NextResponse.json({
      OLLAMA_URL: process.env.OLLAMA_URL || OLLAMA_CLOUD_URL,
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || '',
    });
  }
}
