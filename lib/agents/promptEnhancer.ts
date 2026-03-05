/**
 * Feature 9: Prompt Enhancer
 * Rewrites vague user prompts into detailed software specifications
 * before running through the pipeline.
 *
 * IMPORTANT: This runs BEFORE pipeline stages start, so it must have a
 * strict timeout to avoid blocking the entire pipeline indefinitely.
 */

/** Maximum time to wait for prompt enhancement before falling back (ms) */
const ENHANCE_TIMEOUT_MS = 15_000;

interface EnvConfig {
  ollamaUrl?: string;
  ollamaApiKey?: string;
}

export async function enhancePrompt(vaguePrompt: string, env?: EnvConfig): Promise<string> {
  const systemPrompt = `You are a requirements analyst. Rewrite the user's vague request into a detailed software specification. Include:
- Specific UI components (sidebar, header, cards, tables, forms, modals)
- Data models (entities, relationships, fields with types)
- API endpoints (method, path, request/response)
- Authentication approach
- Key user flows
Keep it under 500 words. Output ONLY the enhanced specification, no preamble.`;

  // Use AbortController with timeout so enhancement never blocks the pipeline
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENHANCE_TIMEOUT_MS);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: vaguePrompt },
        ],
        mode: 'pipeline-stage',
        model: 'deepseek-v3.2',
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return vaguePrompt; // Fallback to original
    }

    // Parse SSE stream
    const reader = res.body?.getReader();
    if (!reader) return vaguePrompt;

    const decoder = new TextDecoder();
    let enhanced = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data) as { content?: string; done?: boolean; thinking?: boolean };
            // Only append non-thinking content (thinking tokens are internal reasoning)
            if (parsed.content && !parsed.thinking) {
              enhanced += parsed.content;
            }
          } catch {
            // Not JSON, might be raw text
            if (data && data !== '[DONE]') enhanced += data;
          }
        }
      }
    }

    return enhanced.trim() || vaguePrompt;
  } catch {
    return vaguePrompt; // Fallback on error (including timeout abort)
  } finally {
    clearTimeout(timer);
  }
}
