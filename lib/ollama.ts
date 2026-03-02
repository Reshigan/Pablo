/**
 * Ollama Cloud API client for Pablo v5
 * Supports dual-model routing: DeepSeek-R1 (reasoning) + Qwen3-Coder-Next (coding)
 */

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaGenerateOptions {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

export type ModelRole = 'reasoning' | 'coding';

const MODEL_MAP: Record<ModelRole, string> = {
  reasoning: 'deepseek-r1',
  coding: 'qwen3-coder-next',
};

export function getModelForRole(role: ModelRole): string {
  return MODEL_MAP[role];
}

/**
 * Creates an Ollama API client
 */
export function createOllamaClient(baseUrl: string, apiKey?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return {
    /**
     * Send a chat completion request (non-streaming)
     */
    async chat(options: OllamaGenerateOptions): Promise<OllamaStreamChunk> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            top_p: options.top_p ?? 0.9,
            num_predict: options.max_tokens ?? 4096,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<OllamaStreamChunk>;
    },

    /**
     * Send a streaming chat completion request
     * Returns a ReadableStream of chunks
     */
    async chatStream(options: OllamaGenerateOptions): Promise<ReadableStream<OllamaStreamChunk>> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          stream: true,
          options: {
            temperature: options.temperature ?? 0.7,
            top_p: options.top_p ?? 0.9,
            num_predict: options.max_tokens ?? 4096,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();

      return new ReadableStream<OllamaStreamChunk>({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            try {
              const chunk = JSON.parse(line) as OllamaStreamChunk;
              controller.enqueue(chunk);
              if (chunk.done) {
                controller.close();
                return;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        },
      });
    },

    /**
     * List available models
     */
    async listModels(): Promise<{ models: Array<{ name: string; size: number }> }> {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<{ models: Array<{ name: string; size: number }> }>;
    },
  };
}
