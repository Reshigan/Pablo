/**
 * POST /api/orchestrate — Multi-Agent Orchestration SSE endpoint
 *
 * Accepts a user message, decomposes into parallel tasks,
 * spawns worker agents, and streams events back via SSE.
 *
 * Request body:
 *   { message: string, existingFiles?: Record<string, string>, source?: string }
 *
 * Response: Server-Sent Events stream
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { runOrchestrator, type OrchestratorEvent } from '@/lib/agents/orchestrator';
import type { EnvConfig } from '@/lib/agents/modelRouter';

async function getEnvConfig(): Promise<EnvConfig> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return {
      OLLAMA_URL: cfEnv.OLLAMA_URL || 'https://ollama.com',
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || '',
    };
  } catch {
    return {
      OLLAMA_URL: process.env.OLLAMA_URL || 'https://ollama.com',
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || '',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await request.json() as {
      message: string;
      existingFiles?: Record<string, string>;
      source?: string;
    };

    if (!body.message) {
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    const env = await getEnvConfig();
    const existingFiles = new Map<string, string>(
      Object.entries(body.existingFiles || {})
    );

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: OrchestratorEvent) => {
          try {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            // Stream closed
          }
        };

        try {
          const result = await runOrchestrator(
            body.message,
            existingFiles,
            env,
            sendEvent,
          );

          // Send final summary
          sendEvent({
            type: 'done',
            summary: `Orchestration complete: ${result.files.length} files, ${result.totalTokens} tokens, ${(result.totalDurationMs / 1000).toFixed(1)}s`,
            filesChanged: result.files.map(f => f.path),
          } as OrchestratorEvent);
        } catch (error) {
          sendEvent({
            type: 'error',
            message: error instanceof Error ? error.message : 'Orchestration failed',
          } as OrchestratorEvent);
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
