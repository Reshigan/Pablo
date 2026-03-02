import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

interface ChatRequestBody {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * POST /api/chat - SSE streaming chat endpoint
 * Supports both Ollama API (local) and OpenAI-compatible API (cloud)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as ChatRequestBody;
  const { messages, model = 'deepseek-r1', temperature = 0.7, max_tokens = 4096 } = body;

  // API endpoint - supports Ollama local or OpenAI-compatible cloud APIs
  const apiUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const apiKey = process.env.OLLAMA_API_KEY || '';

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    reqHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  // Detect if this is an OpenAI-compatible endpoint (cloud) or Ollama (local)
  const isOpenAICompatible = apiUrl.includes('/v1') || apiUrl.includes('openai') || apiUrl.includes('pawan');

  try {
    let apiResponse: Response;

    if (isOpenAICompatible) {
      // OpenAI-compatible API (cloud endpoint)
      apiResponse = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature,
          max_tokens,
        }),
      });
    } else {
      // Ollama local API
      apiResponse = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: {
            temperature,
            top_p: 0.9,
            num_predict: max_tokens,
          },
        }),
      });
    }

    const ollamaResponse = apiResponse;

    if (!ollamaResponse.ok) {
      // If Ollama is not available, return a mock streaming response
      return createMockSSEResponse(model);
    }

    const reader = ollamaResponse.body?.getReader();
    if (!reader) {
      return createMockSSEResponse(model);
    }

    // Create SSE stream from Ollama response
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
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
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
  } catch {
    // Ollama not available - return mock response
    return createMockSSEResponse(model);
  }
}

/**
 * Creates a mock SSE response when Ollama is not available
 * This allows the UI to work during development
 */
function createMockSSEResponse(model: string): Response {
  const encoder = new TextEncoder();
  const mockResponse =
    "I'm Pablo's AI assistant. The Ollama backend is not currently connected. " +
    'To enable AI responses, start Ollama locally or configure OLLAMA_URL and OLLAMA_API_KEY ' +
    'environment variables to point to your Ollama Cloud instance.\n\n' +
    '**Setup:**\n' +
    '```bash\n# Local Ollama\ncurl -fsSL https://ollama.com/install.sh | sh\n' +
    'ollama pull deepseek-r1\nollama pull qwen3-coder-next\n```\n\n' +
    'Once connected, I can help you plan features, write code, debug issues, and more.';

  const words = mockResponse.split(' ');
  let wordIndex = 0;

  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        if (wordIndex >= words.length) {
          const doneData = JSON.stringify({ content: '', done: true, model });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          clearInterval(interval);
          return;
        }

        const word = words[wordIndex] + (wordIndex < words.length - 1 ? ' ' : '');
        const data = JSON.stringify({ content: word, done: false, model });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        wordIndex++;
      }, 30);
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
