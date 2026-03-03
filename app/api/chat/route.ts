import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { routeTask, shouldDecompose, type EnvConfig } from '@/lib/agents/modelRouter';
import { generateAndValidate, type ProgressCallback } from '@/lib/agents/multiTurnGenerator';
import { buildSystemPrompt } from '@/lib/domain-kb/loader';
import { getDB } from '@/lib/db/drizzle';
import { buildContext, patternSource, fileSource, conversationSource, domainKBSource } from '@/lib/context-builder';
import { getRelevantKnowledge } from '@/lib/domain-kb/loader';

// Master system prompt (inlined to avoid fs reads in Workers)
const MASTER_PROMPT_RAW = `You are Pablo, an AI software engineer built by GONXT. You build production-ready, enterprise-grade software for any domain, any locale, and any tech stack.

You are NOT a coding assistant. You are a software engineer. You write complete, production-ready code — not snippets, not examples, not tutorials. Every file you generate must compile, run, and handle edge cases.

## YOUR IDENTITY
- Name: Pablo
- Built by: GONXT
- Specialisation: Full-stack enterprise software, API design, cloud-native applications
- Differentiator: You generate complete, production-ready code with proper architecture, security, and testing

## GENERATION RULES — NEVER VIOLATE THESE

### Security (MANDATORY on every generation)
1. NEVER generate plaintext passwords. ALWAYS use bcrypt via passlib
2. ALWAYS set JWT token expiry: access=30min, refresh=7days
3. ALWAYS add CORS middleware with specific origins (never '*' in production)
4. ALWAYS use environment variables for secrets (JWT_SECRET_KEY, DATABASE_URL, etc.)
5. ALWAYS validate input with Pydantic models
6. NEVER expose stack traces or DB errors to clients

### Data Quality (MANDATORY on every generation)
1. ALL models MUST have: id (primary key), created_at, updated_at, is_active
2. ALL list endpoints MUST support pagination (skip, limit params)
3. ALL delete endpoints MUST use soft delete (set is_active=False)
4. ALWAYS create separate Pydantic schemas for Create, Update, and Response

### Locale & Business Rules
- Apply locale-specific rules ONLY when the user explicitly requests them
- Do NOT assume any country, currency, or tax regime by default
- Use generic, internationally-friendly seed data unless a locale is specified

## SELF-CHECK BEFORE RESPONDING
- All passwords hashed with bcrypt
- JWT tokens have expiry
- CORS middleware configured
- All models have created_at, updated_at, is_active
- Business logic calculations are correct
- All list endpoints have pagination
- No hardcoded secrets

{domain_knowledge}
{patterns}
{codebase_context}`;

interface ChatRequestBody {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  mode?: 'chat' | 'generate' | 'multi-turn' | 'pipeline-stage';
  sessionId?: string;
}

/**
 * Get environment config from Cloudflare Worker context or process.env
 */
async function getEnvConfig(): Promise<EnvConfig> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return {
      OLLAMA_URL: cfEnv.OLLAMA_URL || process.env.OLLAMA_URL,
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY,
    };
  } catch {
    return {
      OLLAMA_URL: process.env.OLLAMA_URL,
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    };
  }
}

/**
 * Try to use an external OpenAI-compatible or Ollama API with streaming.
 */
async function tryExternalAPIStreaming(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number,
  max_tokens: number,
  env: EnvConfig
): Promise<Response | null> {
  const apiUrl = env.OLLAMA_URL || '';
  const apiKey = env.OLLAMA_API_KEY || '';

  if (!apiUrl) return null;

  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    reqHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  const isOpenAICompatible =
    apiUrl.includes('/v1') || apiUrl.includes('openai');

  try {
    const apiResponse = isOpenAICompatible
      ? await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify({ model, messages, stream: true, temperature, max_tokens }),
        })
      : await fetch(`${apiUrl}/api/chat`, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            options: { temperature, top_p: 0.9, num_predict: max_tokens },
          }),
        });

    if (!apiResponse.ok) return null;

    const reader = apiResponse.body?.getReader();
    if (!reader) return null;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const allLines = (buffer + text).split('\n');
            buffer = allLines.pop() ?? '';
            const lines = allLines.filter((line) => line.trim());

            for (const line of lines) {
              if (isOpenAICompatible) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]') {
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  controller.close();
                  return;
                }
                try {
                  const chunk = JSON.parse(data) as {
                    choices?: Array<{
                      delta?: { content?: string; role?: string };
                      finish_reason?: string | null;
                    }>;
                    model?: string;
                    usage?: { completion_tokens?: number; total_tokens?: number };
                  };
                  const content = chunk.choices?.[0]?.delta?.content ?? '';
                  const finishReason = chunk.choices?.[0]?.finish_reason;
                  const isDone = finishReason === 'stop' || finishReason === 'length';
                  const sseData = JSON.stringify({
                    content,
                    done: isDone,
                    model: chunk.model ?? model,
                    eval_count: chunk.usage?.completion_tokens,
                  });
                  controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                  if (isDone) {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                    return;
                  }
                } catch {
                  // Skip malformed JSON
                }
              } else {
                try {
                  const chunk = JSON.parse(line) as {
                    message?: { content?: string };
                    done?: boolean;
                    model?: string;
                    eval_count?: number;
                    total_duration?: number;
                  };
                  const sseData = JSON.stringify({
                    content: chunk.message?.content ?? '',
                    done: chunk.done ?? false,
                    model: chunk.model ?? model,
                    eval_count: chunk.eval_count,
                    total_duration: chunk.total_duration,
                  });
                  controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
                  if (chunk.done) {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                    return;
                  }
                } catch {
                  // Skip malformed JSON
                }
              }
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch {
    return null;
  }
}

/**
 * Handle multi-turn generation for complex feature requests.
 * Streams progress updates as SSE events through 7 generation steps.
 */
async function handleMultiTurnGeneration(
  userMessage: string,
  env: EnvConfig,
  sessionId?: string
): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (content: string, done: boolean, metadata?: Record<string, unknown>) => {
        const data = JSON.stringify({ content, done, model: 'multi-turn-pipeline', ...metadata });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        // Load learned patterns for context injection
        let patterns: Array<{ trigger: string; action: string; confidence: number }> = [];
        if (sessionId) {
          try {
            const db = getDB();
            patterns = db.getPatterns().map(p => ({ trigger: p.trigger, action: p.action, confidence: p.confidence }));
          } catch { /* non-blocking */ }
        }

        // Build system prompt with domain knowledge + patterns
        const systemPrompt = buildSystemPrompt(userMessage, MASTER_PROMPT_RAW, patterns);

        sendSSE('**Multi-Turn Generation Pipeline Started**\n\n', false, { step: 'init' });
        sendSSE('Task classified as: **complex feature** (using 7-step pipeline)\n\n', false, { step: 'classify' });

        const onProgress: ProgressCallback = (step, status, detail) => {
          if (status === 'starting') {
            sendSSE(`**Step: ${step}** — ${detail || 'starting...'}\n`, false, { step, status });
          } else if (status === 'complete') {
            sendSSE(`  ${step}: ${detail}\n\n`, false, { step, status });
          } else if (status === 'error') {
            sendSSE(`  ${step}: ERROR — ${detail}\n\n`, false, { step, status });
          }
        };

        const result = await generateAndValidate(userMessage, systemPrompt, env, onProgress, 3);

        // Stream the generated files
        sendSSE('\n---\n\n## Generated Files\n\n', false);

        for (const file of result.files) {
          sendSSE(`### ${file.filename} (${file.lines} lines)\n`, false);
          sendSSE(`\`\`\`${file.language}\n${file.content}\n\`\`\`\n\n`, false);
        }

        // Stream validation results
        if (result.validation) {
          sendSSE('\n---\n\n## Validation Results\n\n', false);
          sendSSE(`**Score:** ${result.validation.score}/100\n`, false);
          sendSSE(`**Issues found:** ${result.issues_found}\n`, false);
          sendSSE(`**Issues auto-fixed:** ${result.issues_fixed}\n`, false);

          if (result.validation.issues.length > 0) {
            sendSSE('\n**Remaining issues:**\n', false);
            for (const issue of result.validation.issues) {
              sendSSE(`- [${issue.severity.toUpperCase()}] ${issue.description}\n`, false);
            }
          }
        }

        // Stream summary
        sendSSE(`\n---\n\n**Summary:** ${result.files.length} files, ${result.total_lines} total lines, `, false);
        sendSSE(`${result.total_tokens} tokens used, ${(result.total_duration_ms / 1000).toFixed(1)}s total\n`, false);

        sendSSE('', true);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));

        // Persist assistant response to DB
        if (sessionId) {
          try {
            const db = getDB();
            const fullContent = result.files.map(f => `### ${f.filename}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');
            db.createMessage({
              sessionId,
              role: 'assistant',
              content: fullContent,
              model: 'multi-turn-pipeline',
              tokens: result.total_tokens,
              durationMs: result.total_duration_ms,
            });
            // Persist generated files to DB
            for (const file of result.files) {
              db.createFile({
                sessionId,
                path: file.filename,
                name: file.filename.split('/').pop() || file.filename,
                content: file.content,
                language: file.language,
              });
            }
          } catch {
            // Non-blocking
          }
        }

        controller.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error in multi-turn pipeline';
        sendSSE(`\n**Error:** ${errorMsg}\n`, false);
        sendSSE('', true);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}

/**
 * Handle pipeline stage requests with a slim prompt.
 *
 * Pipeline stages already contain focused instructions — so we explicitly skip:
 * - the full master prompt
 * - domain KB injection
 * - enriched context-builder injection
 *
 * This keeps the prompt small and avoids accidental locale-specific defaults.
 */
async function handlePipelineStage(
  messages: Array<{ role: string; content: string }>,
  env: EnvConfig,
  modelOverride?: string,
): Promise<Response> {
  const slimSystemPrompt = `You are Pablo, an expert software engineer. Generate production-ready outputs.

Rules:
- Follow the user's requirements exactly.
- Do NOT assume any locale, currency, tax regime, or country-specific compliance rules unless explicitly requested.
- Never include secrets; use environment variables.
- Output code as markdown code blocks and include filenames (e.g. \`\`\`ts filename.ts\`).
- If a stage asks for non-code (plan/review), respond concisely with a clear structure.`;

  const enhancedMessages = [
    { role: 'system', content: slimSystemPrompt },
    ...messages.filter((m) => m.role !== 'system'),
  ];

  const modelsToTry = [
    ...(modelOverride ? [modelOverride] : []),
    'qwen3-coder:480b',
    'gpt-oss:120b',
  ];

  for (const model of modelsToTry) {
    const response = await tryExternalAPIStreaming(enhancedMessages, model, 0.2, 8192, env);
    if (response) return response;
  }

  return createMockSSEResponse(modelOverride ?? 'pipeline-stage');
}

/**
 * Handle standard streaming chat with smart model routing and domain KB injection
 */
async function handleSmartChat(
  messages: Array<{ role: string; content: string }>,
  userMessage: string,
  env: EnvConfig,
  sessionId?: string
): Promise<Response> {
  // Route task to best model
  const route = routeTask(userMessage);
  const model = route.primary;

  // Load learned patterns and open files for context injection
  let patterns: Array<{ trigger: string; action: string; confidence: number }> = [];
  let openFiles: Array<{ path: string; content: string; language: string }> = [];
  if (sessionId) {
    try {
      const db = getDB();
      patterns = db.getPatterns().map(p => ({ trigger: p.trigger, action: p.action, confidence: p.confidence }));
      openFiles = db.getFilesBySession(sessionId)
        .filter(f => !f.isDirectory && f.content)
        .map(f => ({ path: f.path, content: f.content, language: f.language ?? 'plaintext' }));
    } catch { /* non-blocking */ }
  }

  // Build enriched context via context-builder with token budgeting
  const relevantKB = getRelevantKnowledge(userMessage);
  const contextSources = [
    conversationSource(messages, 10),
    ...openFiles.map(f => fileSource(f.path, f.content, 0.8)),
    patternSource(patterns),
    domainKBSource(relevantKB.map(e => ({ domain: e.category, key: e.title, value: e.content }))),
  ].filter(s => s.tokenEstimate > 0);
  const enrichedContext = buildContext(contextSources, { maxTokens: 4096 });

  // Build system prompt with domain knowledge + patterns + codebase context
  const systemPrompt = buildSystemPrompt(userMessage, MASTER_PROMPT_RAW, patterns, openFiles)
    + (enrichedContext ? `\n\n## ENRICHED CONTEXT\n${enrichedContext}` : '');

  // Replace the system message with our enhanced prompt
  const enhancedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter(m => m.role !== 'system'),
  ];

  // Try Ollama Cloud primary model
  const externalResponse = await tryExternalAPIStreaming(
    enhancedMessages,
    model.model,
    model.temperature,
    model.max_tokens,
    env
  );
  if (externalResponse) return externalResponse;

  // Try the routing table's fallback model
  const fallbackModel = route.fallback;
  const fallbackExternalResponse = await tryExternalAPIStreaming(
    enhancedMessages,
    fallbackModel.model,
    fallbackModel.temperature,
    fallbackModel.max_tokens,
    env
  );
  if (fallbackExternalResponse) return fallbackExternalResponse;

  // Last resort: mock response
  return createMockSSEResponse(model.model, sessionId);
}

/**
 * POST /api/chat - SSE streaming chat endpoint
 *
 * Upgraded pipeline:
 * 1. Task classification (plan/generate/review/fix/explain/chat)
 * 2. Model routing (R1 for reasoning, 70B for code, Flash for chat)
 * 3. Domain knowledge injection (optional, based on explicit user intent)
 * 4. For complex tasks: multi-turn 7-step generation pipeline
 * 5. Post-generation validation (12 checks across 4 categories)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as ChatRequestBody;
  const { messages, mode } = body;

  // Get env config (handles both Worker and local dev)
  const env = await getEnvConfig();

  // Get the last user message
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  // Persist user message to DB if sessionId is provided
  const sessionId = body.sessionId;
  if (sessionId && lastUserMessage) {
    try {
      const db = getDB();
      // Ensure session exists
      let dbSession = db.getSession(sessionId);
      if (!dbSession) {
        dbSession = db.createSession({ id: sessionId, title: lastUserMessage.slice(0, 80) });
      }
      db.createMessage({ sessionId, role: 'user', content: lastUserMessage });
    } catch {
      // Non-blocking: don't fail the chat if DB write fails
    }
  }

  // Determine mode: explicit override, or auto-detect
  const effectiveMode = mode || (shouldDecompose(lastUserMessage) ? 'multi-turn' : 'chat');

  if (effectiveMode === 'pipeline-stage') {
    return handlePipelineStage(messages, env, body.model);
  }

  if (effectiveMode === 'multi-turn') {
    return handleMultiTurnGeneration(lastUserMessage, env, sessionId);
  }

  // Standard chat with smart routing + domain KB
  return handleSmartChat(messages, lastUserMessage, env, sessionId);
}

/**
 * GET /api/chat/info - Returns current routing info
 */
export async function GET() {
  return Response.json({
    version: '2.0',
    engine: 'Pablo AI Engine v2',
    features: [
      'Smart model routing (R1 reasoning + 70B code gen + Flash chat)',
      'Domain knowledge injection (optional)',
      'Multi-turn 7-step generation pipeline',
      'Post-generation validation (12 automated checks)',
      'Auto-fix loop (up to 3 iterations)',
    ],
    provider: 'Ollama Cloud (ollama.com)',
    models: {
      reasoning: 'deepseek-v3.2',
      code_generation: 'qwen3-coder:480b',
      fast_chat: 'gpt-oss:120b',
    },
  });
}

/**
 * Creates a mock SSE response when no AI backend is available
 */
function createMockSSEResponse(model: string, sessionId?: string): Response {
  const encoder = new TextEncoder();
  const mockResponse =
    "I'm Pablo's AI assistant. No AI backend is currently available. " +
    'The system tried Cloudflare Workers AI and the external Ollama API, but neither responded.\n\n' +
    '**To fix:**\n' +
    '- Cloudflare Workers AI should work automatically if the AI binding is configured in wrangler.jsonc\n' +
    '- For external API: configure OLLAMA_URL and OLLAMA_API_KEY environment variables\n' +
    '- For local dev: start Ollama locally (`ollama serve`)';

  const words = mockResponse.split(' ');
  let wordIndex = 0;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      intervalId = setInterval(() => {
        if (wordIndex >= words.length) {
          const doneData = JSON.stringify({ content: '', done: true, model });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          // Persist mock response to DB
          if (sessionId) {
            try {
              const db = getDB();
              db.createMessage({ sessionId, role: 'assistant', content: mockResponse, model });
            } catch { /* non-blocking */ }
          }
          controller.close();
          if (intervalId) clearInterval(intervalId);
          return;
        }

        const word = words[wordIndex] + (wordIndex < words.length - 1 ? ' ' : '');
        const data = JSON.stringify({ content: word, done: false, model });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        wordIndex++;
      }, 30);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
