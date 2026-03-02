import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { routeTask, shouldDecompose, type EnvConfig } from '@/lib/agents/modelRouter';
import { generateAndValidate, type ProgressCallback } from '@/lib/agents/multiTurnGenerator';
import { buildSystemPrompt } from '@/lib/domain-kb/loader';

// Master system prompt (inlined to avoid fs reads in Workers)
const MASTER_PROMPT_RAW = `You are Pablo, an AI software engineer built by GONXT (a division of Vanta X, South Africa). You build production-ready, enterprise-grade software with a specialisation in South African business systems.

You are NOT a coding assistant. You are a software engineer. You write complete, production-ready code — not snippets, not examples, not tutorials. Every file you generate must compile, run, and handle edge cases.

## YOUR IDENTITY
- Name: Pablo
- Built by: GONXT / Vanta X (Pty) Ltd
- Specialisation: South African enterprise software, SAP integrations, renewable energy systems
- Differentiator: You understand SA business rules (VAT, B-BBEE, POPIA, SARS) that no other AI tool knows

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

### South African Specifics (MANDATORY when context is SA)
1. Currency is ZAR (South African Rand). Format: R 1,234.56
2. VAT is 15%. Formula: vat = quantity * unit_price * 0.15 (NEVER vat = quantity * 0.15)
3. Include B-BBEE fields on Company/Supplier models
4. Include POPIA consent fields on Person/Customer models
5. Use SA-specific seed data (Thabo, Naledi, Sipho — NOT John Doe, Jane Smith)
6. Phone format: +27 XX XXX XXXX

### Commission & Sales Pipeline
1. Pipeline stages: lead_qualified -> discovery -> proposal -> negotiation -> verbal_agreement -> contract_sent -> closed_won -> closed_lost
2. Each stage has auto-probability: 10% -> 20% -> 40% -> 60% -> 80% -> 90% -> 100% -> 0%
3. Commission: 5% on deals <= R500K, 7% R500K-R2M, 10% above R2M

## SELF-CHECK BEFORE RESPONDING
- All passwords hashed with bcrypt
- JWT tokens have expiry
- CORS middleware configured
- All models have created_at, updated_at, is_active
- VAT formula: quantity * unit_price * 0.15 (NOT quantity * 0.15)
- Seed data uses SA names
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
  mode?: 'chat' | 'generate' | 'multi-turn';
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
      CLOUDFLARE_ACCOUNT_ID: cfEnv.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: cfEnv.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN,
      OLLAMA_URL: cfEnv.OLLAMA_URL || process.env.OLLAMA_URL,
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY,
    };
  } catch {
    return {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
      OLLAMA_URL: process.env.OLLAMA_URL,
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
    };
  }
}

/**
 * Try to use Cloudflare Workers AI directly via the AI binding.
 * This is the fastest path for Workers AI models.
 */
async function tryWorkersAIBinding(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number,
  max_tokens: number
): Promise<Response | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const ai = (ctx.env as Record<string, unknown>).AI;
    if (!ai) return null;

    const aiBinding = ai as {
      run: (
        model: string,
        input: Record<string, unknown>,
        options?: Record<string, unknown>
      ) => Promise<ReadableStream | string>;
    };

    const result = await aiBinding.run(model, {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
      max_tokens,
      stream: true,
    });

    // Workers AI with stream:true returns a ReadableStream of SSE events
    if (result instanceof ReadableStream) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let buffer = '';

      const outputStream = new ReadableStream({
        async start(controller) {
          const reader = result.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const text = decoder.decode(value, { stream: true });
              const allLines = (buffer + text).split('\n');
              buffer = allLines.pop() ?? '';

              for (const line of allLines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]') {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content: '', done: true, model })}\n\n`)
                  );
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  controller.close();
                  return;
                }
                try {
                  const chunk = JSON.parse(data) as { response?: string };
                  const content = chunk.response ?? '';
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content, done: false, model })}\n\n`)
                  );
                } catch {
                  // Skip malformed JSON
                }
              }
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: '', done: true, model })}\n\n`)
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(outputStream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }

    // Non-streaming fallback (string response)
    const responseText = typeof result === 'string' ? result : JSON.stringify(result);
    const encoder = new TextEncoder();
    const outputStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: responseText, done: false, model })}\n\n`)
        );
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: '', done: true, model })}\n\n`)
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(outputStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch {
    // Workers AI not available (local dev or binding not configured)
    return null;
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
    apiUrl.includes('/v1') || apiUrl.includes('openai') || apiUrl.includes('pawan');

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
  env: EnvConfig
): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (content: string, done: boolean, metadata?: Record<string, unknown>) => {
        const data = JSON.stringify({ content, done, model: 'multi-turn-pipeline', ...metadata });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        // Build system prompt with domain knowledge
        const systemPrompt = buildSystemPrompt(userMessage, MASTER_PROMPT_RAW);

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
 * Handle standard streaming chat with smart model routing and domain KB injection
 */
async function handleSmartChat(
  messages: Array<{ role: string; content: string }>,
  userMessage: string,
  env: EnvConfig
): Promise<Response> {
  // Route task to best model
  const route = routeTask(userMessage);
  const model = route.primary;

  // Build system prompt with domain knowledge
  const systemPrompt = buildSystemPrompt(userMessage, MASTER_PROMPT_RAW);

  // Replace the system message with our enhanced prompt
  const enhancedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter(m => m.role !== 'system'),
  ];

  // Try Workers AI binding first (fastest for Workers AI models)
  if (model.provider === 'workers_ai') {
    const bindingResponse = await tryWorkersAIBinding(
      enhancedMessages,
      model.model,
      model.temperature,
      model.max_tokens
    );
    if (bindingResponse) return bindingResponse;
  }

  // Try external API (Ollama Cloud)
  const externalResponse = await tryExternalAPIStreaming(
    enhancedMessages,
    model.model,
    model.temperature,
    model.max_tokens,
    env
  );
  if (externalResponse) return externalResponse;

  // Fallback: try Workers AI with Llama 3.1 8B (always available)
  const fallbackResponse = await tryWorkersAIBinding(
    enhancedMessages,
    '@cf/meta/llama-3.1-8b-instruct',
    0.7,
    4096
  );
  if (fallbackResponse) return fallbackResponse;

  // Last resort: mock response
  return createMockSSEResponse(model.model);
}

/**
 * POST /api/chat - SSE streaming chat endpoint
 *
 * Upgraded pipeline:
 * 1. Task classification (plan/generate/review/fix/explain/chat)
 * 2. Model routing (R1 for reasoning, 70B for code, Flash for chat)
 * 3. Domain KB injection (SA business rules, VAT, B-BBEE, POPIA)
 * 4. For complex tasks: multi-turn 7-step generation pipeline
 * 5. Post-generation validation (16 checks across 5 categories)
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

  // Determine mode: explicit override, or auto-detect
  const effectiveMode = mode || (shouldDecompose(lastUserMessage) ? 'multi-turn' : 'chat');

  if (effectiveMode === 'multi-turn') {
    return handleMultiTurnGeneration(lastUserMessage, env);
  }

  // Standard chat with smart routing + domain KB
  return handleSmartChat(messages, lastUserMessage, env);
}

/**
 * GET /api/chat/info - Returns current routing info
 */
export async function GET() {
  return Response.json({
    version: '2.0',
    engine: 'Pablo AI Engine v2 - SA Enterprise Specialist',
    features: [
      'Smart model routing (R1 reasoning + 70B code gen + Flash chat)',
      'Domain knowledge injection (SA business rules)',
      'Multi-turn 7-step generation pipeline',
      'Post-generation validation (16 automated checks)',
      'Auto-fix loop (up to 3 iterations)',
    ],
    models: {
      reasoning: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      code_generation: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      fast_chat: '@cf/zai-org/glm-4.7-flash',
    },
  });
}

/**
 * Creates a mock SSE response when no AI backend is available
 */
function createMockSSEResponse(model: string): Response {
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
