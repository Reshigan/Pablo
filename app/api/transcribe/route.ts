/**
 * POST /api/transcribe — Speech-to-text via Cloudflare Workers AI (Whisper)
 *
 * Accepts audio blob, returns transcribed text.
 * Uses @cf/openai/whisper-tiny-en or whisper-large-v3-turbo
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    if (!audioFile) {
      return Response.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const audioBuffer = await audioFile.arrayBuffer();

    // Try Cloudflare Workers AI Whisper
    try {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const ctx = await getCloudflareContext({ async: true });
      const ai = (ctx.env as Record<string, unknown>).AI;

      if (ai) {
        const result = await (ai as { run: (model: string, input: Record<string, unknown>) => Promise<{ text?: string }> }).run(
          '@cf/openai/whisper-tiny-en',
          { audio: [...new Uint8Array(audioBuffer)] },
        );

        return Response.json({ text: result.text || '' });
      }
    } catch {
      // Not on Workers AI, fall through
    }

    // Fallback: return error
    return Response.json(
      { error: 'Speech-to-text not available. Requires Cloudflare Workers AI.' },
      { status: 503 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 },
    );
  }
}
