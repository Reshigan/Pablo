/**
 * POST /api/orchestrate — V10 Multi-Agent Orchestration SSE endpoint
 *
 * Runs the 6-phase pipeline (Understand → Design → Build → Quality → Ship → Verify)
 * with 12 specialist agents and streams events back via SSE.
 *
 * Request body:
 *   { message: string, existingFiles?: Record<string, string>, sessionId?: string,
 *     autoApprove?: boolean, phases?: string[], source?: string }
 *
 * Response: Server-Sent Events stream
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
  runOrchestration,
  type OrchestratorEvent,
  type OrchestrationPhase,
} from '@/lib/agents/orchestrator';
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

const ALL_PHASES: OrchestrationPhase[] = ['understand', 'design', 'build', 'quality', 'ship', 'verify'];

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await request.json() as {
      message: string;
      existingFiles?: Record<string, string>;
      sessionId?: string;
      autoApprove?: boolean;
      phases?: string[];
      source?: string;
    };

    if (!body.message) {
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    const env = await getEnvConfig();
    const existingFiles = new Map<string, string>(
      Object.entries(body.existingFiles || {})
    );

    const phases = (body.phases || ALL_PHASES).filter(
      (p): p is OrchestrationPhase => ALL_PHASES.includes(p as OrchestrationPhase)
    );

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: OrchestratorEvent) => {
          try {
            // Serialize — Maps are not JSON-serializable, so convert to plain objects
            const serializable = { ...event } as Record<string, unknown>;
            const data = JSON.stringify(serializable);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            // Stream closed
          }
        };

        try {
          await runOrchestration(
            body.message,
            { existingFiles, repoFullName: undefined, branch: undefined },
            env,
            {
              autoApprove: body.autoApprove ?? true,
              maxTotalTokens: 500_000,
              phases,
              sessionId: body.sessionId || `sse-${Date.now()}`,
            },
            sendEvent,
          );
          // runOrchestration already emits 'done' event via sendEvent callback
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
