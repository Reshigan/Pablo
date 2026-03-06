/**
 * Inline AI Autocomplete — Feature 7
 * Registers a Monaco InlineCompletionProvider that suggests code completions
 * using the Ollama Cloud API (fast model: gpt-oss:20b).
 * Press Tab to accept, Escape or keep typing to dismiss.
 */

import type { Monaco } from '@monaco-editor/react';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRequestId = 0;

/**
 * Parse a streamed SSE response and collect the full text.
 */
async function parseStreamedResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let result = '';

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // Handle SSE format: lines starting with "data: "
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as { content?: string; choices?: Array<{ delta?: { content?: string } }> };
          const content = parsed.content ?? parsed.choices?.[0]?.delta?.content;
          if (content) result += content;
        } catch {
          // Skip unparseable JSON chunks
        }
      }
    }
  }

  return result;
}

export function registerInlineCompletion(monaco: Monaco) {
  type ITextModel = Parameters<Parameters<typeof monaco.languages.registerInlineCompletionsProvider>[1]['provideInlineCompletions']>[0];
  type IPosition = Parameters<Parameters<typeof monaco.languages.registerInlineCompletionsProvider>[1]['provideInlineCompletions']>[1];
  type ICancellationToken = Parameters<Parameters<typeof monaco.languages.registerInlineCompletionsProvider>[1]['provideInlineCompletions']>[3];

  monaco.languages.registerInlineCompletionsProvider('*', {
    provideInlineCompletions: async (model: ITextModel, position: IPosition, _context: unknown, token: ICancellationToken) => {
      // Cancel any pending debounce
      if (debounceTimer) clearTimeout(debounceTimer);

      const requestId = ++lastRequestId;

      return new Promise((resolve) => {
        debounceTimer = setTimeout(async () => {
          // If a newer request came in, abandon this one
          if (requestId !== lastRequestId || token.isCancellationRequested) {
            resolve({ items: [] });
            return;
          }

          try {
            // Get context: 50 lines before cursor, 10 lines after
            const textBefore = model.getValueInRange({
              startLineNumber: Math.max(1, position.lineNumber - 50),
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });

            const textAfter = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 10),
              endColumn: model.getLineMaxColumn(
                Math.min(model.getLineCount(), position.lineNumber + 10)
              ),
            });

            // Skip if very little context
            if (textBefore.trim().length < 10) {
              resolve({ items: [] });
              return;
            }

            const language = model.getLanguageId();

            const controller = new AbortController();
            // Cancel on token cancellation
            if (token.isCancellationRequested) {
              resolve({ items: [] });
              return;
            }

            // 3 second timeout for autocomplete — must be fast
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{
                  role: 'user',
                  content: `Complete this ${language} code. Return ONLY the completion (1-5 lines), no explanation, no markdown fences.

CODE BEFORE CURSOR:
${textBefore}
<CURSOR_HERE>
CODE AFTER CURSOR:
${textAfter}`,
                }],
                mode: 'pipeline-stage',
                model: 'gpt-oss:20b',
                max_tokens: 200,
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok || token.isCancellationRequested || requestId !== lastRequestId) {
              resolve({ items: [] });
              return;
            }

            const completion = await parseStreamedResponse(response);
            const cleaned = completion
              .replace(/^```\w*\n?/, '')
              .replace(/\n?```$/, '')
              .trim();

            if (cleaned && requestId === lastRequestId) {
              resolve({
                items: [{
                  insertText: cleaned,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                }],
              });
            } else {
              resolve({ items: [] });
            }
          } catch {
            resolve({ items: [] });
          }
        }, 600); // 600ms debounce
      });
    },

    freeInlineCompletions: () => {
      // No cleanup needed
    },
  });
}
