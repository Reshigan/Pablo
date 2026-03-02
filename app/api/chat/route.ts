import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

interface ChatRequestBody {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Try to use Cloudflare Workers AI directly via the AI binding.
 * Returns a streaming SSE Response, or null if Workers AI is unavailable.
 */
async function tryWorkersAI(
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

    const cfModel = '@cf/meta/llama-3.1-8b-instruct';
    const result = await aiBinding.run(cfModel, {
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
                    encoder.encode(`data: ${JSON.stringify({ content: '', done: true, model: cfModel })}\n\n`)
                  );
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  controller.close();
                  return;
                }
                try {
                  const chunk = JSON.parse(data) as { response?: string };
                  const content = chunk.response ?? '';
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content, done: false, model: cfModel })}\n\n`)
                  );
                } catch {
                  // Skip malformed JSON
                }
              }
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: '', done: true, model: cfModel })}\n\n`)
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
          encoder.encode(`data: ${JSON.stringify({ content: responseText, done: false, model: cfModel })}\n\n`)
        );
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: '', done: true, model: cfModel })}\n\n`)
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
 * Try to use an external OpenAI-compatible or Ollama API.
 * Returns a streaming SSE Response, or null if the API is unavailable.
 */
async function tryExternalAPI(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature: number,
  max_tokens: number
): Promise<Response | null> {
  const apiUrl = process.env.OLLAMA_URL || '';
  const apiKey = process.env.OLLAMA_API_KEY || '';

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
                  const chunk = JSON.parse(line);
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
 * POST /api/chat - SSE streaming chat endpoint
 * Priority: 1. Cloudflare Workers AI (free, no API key needed)
 *           2. External Ollama/OpenAI API (if configured)
 *           3. Mock fallback response
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as ChatRequestBody;
  const { messages, model = 'deepseek-r1', temperature = 0.7, max_tokens = 4096 } = body;

  // 1. Try Cloudflare Workers AI first (free, built-in)
  const workersAIResponse = await tryWorkersAI(messages, model, temperature, max_tokens);
  if (workersAIResponse) return workersAIResponse;

  // 2. Try external Ollama/OpenAI API
  const externalResponse = await tryExternalAPI(messages, model, temperature, max_tokens);
  if (externalResponse) return externalResponse;

  // 3. Fallback to mock response
  return createMockSSEResponse(model);
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
