import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { type EnvConfig } from '@/lib/agents/modelRouter';
import {
  runAgentLoop,
  type AgentContext,
  type AgentEvent,
} from '@/lib/agents/agentEngine';
import { getRelevantPatterns, extractPatterns, savePatterns } from '@/lib/agents/memorySystem';
import { formatPatternsForPrompt } from '@/lib/agents/memorySystem';
import { checkRateLimit, getClientIP, rateLimitHeaders, RATE_LIMITS } from '@/lib/rateLimit';
import { checkBodySize, BODY_SIZE_LIMITS } from '@/lib/apiGuard';
import { createLogger } from '@/lib/logger';

const log = createLogger('agent-route');

/**
 * Get environment config from Cloudflare Worker context or process.env
 */
async function getEnvConfig(): Promise<EnvConfig> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return {
      OLLAMA_URL: cfEnv.OLLAMA_URL || process.env.OLLAMA_URL || 'https://ollama.com/api',
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY,
    };
  } catch {
    return {
      OLLAMA_URL: process.env.OLLAMA_URL || 'https://ollama.com/api',
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    };
  }
}

interface AgentRequestBody {
  message: string;
  openFiles?: Array<{ path: string; content: string; language: string }>;
  repo?: string;
  branch?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  fileTree?: string[];
}

/**
 * POST /api/agent — Run the agentic loop (plan → execute → verify → fix)
 *
 * Streams AgentEvent objects as SSE for real-time UI updates.
 * The frontend uses these events to show:
 *   - Plan creation with step list
 *   - Step-by-step execution progress
 *   - Generated files
 *   - Verification results
 *   - Auto-fix attempts
 *   - Final summary
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ARCH-05: Body size guard
  const sizeErr = checkBodySize(request.headers, BODY_SIZE_LIMITS.code);
  if (sizeErr) return sizeErr;

  // ARCH-01: Rate limiting
  const clientIP = getClientIP(request.headers);
  const rl = checkRateLimit(`agent:${clientIP}`, RATE_LIMITS.chat);
  if (!rl.allowed) {
    log.warn('Agent rate limit exceeded', { ip: clientIP });
    return Response.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = (await request.json()) as AgentRequestBody;
  const { message, openFiles, repo, branch, conversationHistory, fileTree } = body;

  if (!message) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  const env = await getEnvConfig();

  // Build agent context
  const relevantPatterns = getRelevantPatterns(message, 10);
  const patternContext = formatPatternsForPrompt(relevantPatterns);

  const context: AgentContext = {
    userMessage: message + (patternContext ? `\n\n${patternContext}` : ''),
    openFiles: openFiles || [],
    repo,
    branch,
    conversationHistory: conversationHistory || [],
    patterns: relevantPatterns.map((p) => ({
      trigger: p.trigger,
      action: p.action,
      confidence: p.confidence,
    })),
    fileTree: fileTree || [],
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: AgentEvent) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        const { plan, allFiles } = await runAgentLoop(context, env, sendEvent);

        // Learn from generated code
        if (allFiles.length > 0) {
          try {
            for (const file of allFiles) {
              const patterns = extractPatterns(message, file.content, file.language);
              if (patterns.length > 0) {
                await savePatterns(patterns);
              }
            }
          } catch (patternErr) {
            log.warn('Pattern extraction failed (non-blocking)', { error: patternErr instanceof Error ? patternErr.message : String(patternErr) });
          }
        }

        // Send final summary
        const filesChangedCount = allFiles.length;
        const totalLines = allFiles.reduce((sum, f) => sum + f.content.split('\n').length, 0);
        sendEvent({
          type: 'done',
          summary: `Agent completed: ${plan.steps.filter((s) => s.status === 'done').length}/${plan.steps.length} steps, ${filesChangedCount} files (${totalLines} lines), ${plan.totalTokensUsed} tokens in ${(plan.totalDurationMs / 1000).toFixed(1)}s`,
          filesChanged: allFiles.map((f) => f.path),
        });

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Agent loop failed';
        sendEvent({ type: 'error', message: errorMsg });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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

/**
 * GET /api/agent — Returns agent engine info
 */
export async function GET() {
  return Response.json({
    version: '1.0',
    engine: 'Pablo Agent Engine — Devin-Pattern Agentic Loop',
    capabilities: [
      'Plan → Execute → Verify → Fix cycle',
      'Task decomposition into atomic steps',
      'Context analysis and relevant file discovery',
      'Self-healing: auto-detect and fix errors iteratively',
      'Multi-file generation with dependency tracking',
      'Code review: static analysis + LLM-powered review',
      'Memory/Learning: pattern capture from accepted code',
      'Tool system: file ops, search, grep, glob, git',
    ],
    models: {
      planner: 'qwen3:32b (Ollama Cloud)',
      coder: 'qwen2.5-coder:32b (Ollama Cloud)',
      fast: 'qwen2.5:72b (Ollama Cloud)',
    },
    step_types: [
      'plan', 'read_file', 'write_file', 'edit_file', 'search',
      'shell', 'generate', 'review', 'fix', 'commit', 'create_pr',
      'deploy', 'ask_user', 'done',
    ],
  });
}
