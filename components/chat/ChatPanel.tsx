'use client';

import { Send, Paperclip, StopCircle, Trash2, Bot, User, Loader2, CheckCircle2, AlertTriangle, Copy, Check, Cpu } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '@/stores/chat';
import { useToastStore } from '@/stores/toast';
import { useEditorStore } from '@/stores/editor';
import { useAgentStore } from '@/stores/agent';
import { parseGeneratedFiles } from '@/lib/code-parser';
import { generateId } from '@/lib/db/queries';
import type { AgentEvent } from '@/lib/agents/agentEngine';

interface PipelineProgress {
  active: boolean;
  currentStep: string;
  status: string;
  validationScore: number | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button onClick={handleCopy} className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim" aria-label="Copy code">
      {copied ? <Check size={12} className="text-pablo-green" /> : <Copy size={12} />}
    </button>
  );
}

function ChatEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-gold-bg">
        <Bot size={24} className="text-pablo-gold" />
      </div>
      <p className="font-ui text-sm font-medium text-pablo-text-dim">
        Pablo AI Assistant
      </p>
      <p className="font-ui text-xs text-pablo-text-muted">
        Describe a feature, paste an error, or ask me to generate code.
        I use DeepSeek-R1 for reasoning and Qwen3-Coder for implementation.
      </p>
    </div>
  );
}

export function ChatPanel() {
  const {
    messages,
    isStreaming,
    error,
    addMessage,
    appendToMessage,
    updateMessage,
    setStreaming,
    setError,
    addTokens,
    clearMessages,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [agentMode, setAgentMode] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineProgress>({
    active: false,
    currentStep: '',
    status: '',
    validationScore: null,
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { startRun, processEvent, completeRun, failRun, isRunning: agentRunning } = useAgentStore();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Send message through the Agent Engine (plan -> execute -> verify -> fix)
   */
  const sendAgentMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming || agentRunning) return;

      addMessage({ role: 'user', content: content.trim() });
      const assistantId = addMessage({ role: 'assistant', content: '', isStreaming: true });
      setStreaming(true);
      setError(null);

      const runId = startRun(content.trim());

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        // Get open files from editor for context
        const editorState = useEditorStore.getState();
        const openFiles = editorState.tabs.map((t) => ({
          path: t.path || t.name,
          content: t.content || '',
          language: t.language || 'plaintext',
        }));

        const conversationHistory = useChatStore.getState().messages
          .filter((m) => m.id !== assistantId)
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content.trim(),
            openFiles,
            conversationHistory,
          }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`Agent API error: ${response.status}`);
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let streamContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') break;

            try {
              const event = JSON.parse(data) as AgentEvent;
              processEvent(runId, event);

              // Build assistant message from agent events
              switch (event.type) {
                case 'plan_created':
                  streamContent += `## Agent Plan\n\n${event.plan.steps.map((s, i) => `${i + 1}. **${s.type}**: ${s.description}`).join('\n')}\n\n`;
                  break;
                case 'step_start':
                  streamContent += `### Step ${event.index + 1}: ${event.step.description}\n`;
                  break;
                case 'step_complete':
                  streamContent += `  Done\n\n`;
                  break;
                case 'step_failed':
                  streamContent += `  Failed: ${event.error}\n\n`;
                  break;
                case 'thinking':
                  streamContent += `> ${event.content}\n`;
                  break;
                case 'file_written':
                  streamContent += `### ${event.path}\n\`\`\`${event.language}\n${event.content}\n\`\`\`\n\n`;
                  break;
                case 'verification_result':
                  streamContent += `## Verification: ${event.passed ? 'PASSED' : 'NEEDS FIXES'}\n`;
                  if (event.issues.length > 0) {
                    streamContent += event.issues.map((i) => `- ${i}`).join('\n') + '\n';
                  }
                  streamContent += '\n';
                  break;
                case 'fix_attempt':
                  streamContent += `## Auto-Fix (attempt ${event.attempt}/${event.maxAttempts})\n\n`;
                  break;
                case 'done':
                  streamContent += `\n---\n\n**${event.summary}**\n`;
                  break;
                case 'error':
                  streamContent += `\n**Error:** ${event.message}\n`;
                  break;
              }

              appendToMessage(assistantId, '');
              // Update the full content at once
              updateMessage(assistantId, { content: streamContent });
            } catch {
              // Skip unparseable events
            }
          }
        }

        updateMessage(assistantId, { isStreaming: false });
        completeRun(runId);

        // Parse generated files from agent output and open as diffs
        const finalContent = useChatStore.getState().messages.find((m) => m.id === assistantId)?.content ?? '';
        const parsedFiles = parseGeneratedFiles(finalContent);
        if (parsedFiles.length > 0) {
          const edStore = useEditorStore.getState();
          for (const file of parsedFiles) {
            const fileId = generateId('agent');
            const existingTab = edStore.tabs.find((t) => t.path === file.filename);
            edStore.addDiff({
              fileId,
              filename: file.filename,
              language: file.language,
              oldContent: existingTab?.content ?? '',
              newContent: file.content,
            });
          }
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Agent Complete',
            message: `${parsedFiles.length} file(s) ready for review in Diff tab`,
            duration: 5000,
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          updateMessage(assistantId, {
            isStreaming: false,
            content: (useChatStore.getState().messages.find((m) => m.id === assistantId)?.content ?? '') + '\n\n*[Agent stopped]*',
          });
        } else {
          const errorMsg = err instanceof Error ? err.message : 'Agent failed';
          setError(errorMsg);
          updateMessage(assistantId, { isStreaming: false, content: `Error: ${errorMsg}` });
          failRun(runId, errorMsg);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, agentRunning, addMessage, appendToMessage, updateMessage, setStreaming, setError, startRun, processEvent, completeRun, failRun]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      // If agent mode is on, route through agent engine
      if (agentMode) {
        return sendAgentMessage(content);
      }

      // Reset pipeline state from any previous multi-turn run
      setPipeline({ active: false, currentStep: '', status: '', validationScore: null });

      // Add user message
      addMessage({ role: 'user', content: content.trim() });

      // Create assistant message placeholder
      const assistantId = addMessage({
        role: 'assistant',
        content: '',
        isStreaming: true,
      });

      setStreaming(true);
      setError(null);

      // Build messages array for API using latest store state
      // (avoids stale closure after addMessage calls above)
      const currentMessages = useChatStore.getState().messages;
      const apiMessages = [
        {
          role: 'system' as const,
          content:
            'You are Pablo, an AI coding assistant inside an IDE. Help the user build features, debug code, and explain concepts. Be concise and use markdown for code blocks.',
        },
        ...currentMessages
          .filter((m) => m.id !== assistantId)
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
      ];

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            model: 'deepseek-r1',
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        let streamDone = false;
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              streamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(data) as {
                content?: string;
                done?: boolean;
                eval_count?: number;
                model?: string;
                step?: string;
                status?: string;
              };

              // Track multi-turn pipeline progress
              if (parsed.model === 'multi-turn-pipeline') {
                if (parsed.step && parsed.status) {
                  setPipeline(prev => ({
                    ...prev,
                    active: true,
                    currentStep: parsed.step || prev.currentStep,
                    status: parsed.status || prev.status,
                  }));
                }
                // Extract validation score from content
                if (parsed.content?.includes('**Score:**')) {
                  const scoreMatch = parsed.content.match(/\*\*Score:\*\*\s*(\d+)/);
                  if (scoreMatch) {
                    setPipeline(prev => ({ ...prev, validationScore: parseInt(scoreMatch[1], 10) }));
                  }
                }
              }

              if (parsed.content) {
                appendToMessage(assistantId, parsed.content);
              }
              if (parsed.done) {
                if (parsed.eval_count) {
                  addTokens(parsed.eval_count);
                }
                // Reset pipeline state when done
                setPipeline(prev => prev.active ? { ...prev, active: false } : prev);
              }
            } catch {
              // Skip malformed SSE data
            }
          }
        }

        updateMessage(assistantId, { isStreaming: false });

        // AI → Editor bridge: parse generated files and open them as tabs
        const finalContent = useChatStore.getState().messages.find(m => m.id === assistantId)?.content ?? '';
        const parsedFiles = parseGeneratedFiles(finalContent);
        if (parsedFiles.length > 0) {
          const editorStore = useEditorStore.getState();
          const { addToast } = useToastStore.getState();
          for (const file of parsedFiles) {
            editorStore.openFile({
              id: generateId('gen'),
              path: file.filename,
              name: file.filename.split('/').pop() || file.filename,
              language: file.language,
              content: file.content,
            });
          }
          addToast({
            type: 'success',
            title: 'Files Generated',
            message: `${parsedFiles.length} file(s) opened in editor`,
            duration: 4000,
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          updateMessage(assistantId, {
            isStreaming: false,
            content:
              (useChatStore.getState().messages.find((m) => m.id === assistantId)
                ?.content ?? '') + '\n\n*[Generation stopped]*',
          });
        } else {
          const errorMsg =
            err instanceof Error ? err.message : 'Unknown error';
          setError(errorMsg);
          updateMessage(assistantId, {
            isStreaming: false,
            content: `Error: ${errorMsg}`,
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [
      messages,
      isStreaming,
      agentMode,
      addMessage,
      appendToMessage,
      updateMessage,
      setStreaming,
      setError,
      addTokens,
      sendAgentMessage,
    ]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const msg = input;
    setInput('');
    sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-full flex-col bg-pablo-panel">
      {/* Chat header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-pablo-border px-3">
        <span className="font-ui text-xs font-semibold uppercase tracking-wider text-pablo-text-dim">
          Chat
        </span>
        <div className="flex items-center gap-2">
          <span className="font-ui text-[10px] text-pablo-text-muted">
            {messages.length} messages
          </span>
          {messages.length > 0 && (
            <button
              onClick={() => { clearMessages(); setPipeline({ active: false, currentStep: '', status: '', validationScore: null }); }}
              className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
              aria-label="Clear chat"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 border-b border-pablo-red/20 bg-pablo-red/10 px-3 py-1.5">
          <p className="font-ui text-xs text-pablo-red">{error}</p>
        </div>
      )}

      {/* Pipeline progress indicator */}
      {pipeline.active && (
        <div className="shrink-0 border-b border-pablo-gold/20 bg-pablo-gold/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-pablo-gold" />
            <span className="font-ui text-xs font-medium text-pablo-gold">
              Multi-Turn Pipeline
            </span>
            {pipeline.currentStep && (
              <span className="font-ui text-xs text-pablo-text-dim">
                — {pipeline.currentStep}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Validation score badge (shown after pipeline completes) */}
      {!pipeline.active && pipeline.validationScore !== null && (
        <div className="shrink-0 border-b border-pablo-border px-3 py-1.5">
          <div className="flex items-center gap-2">
            {pipeline.validationScore >= 90 ? (
              <CheckCircle2 size={14} className="text-green-400" />
            ) : (
              <AlertTriangle size={14} className="text-yellow-400" />
            )}
            <span className="font-ui text-xs text-pablo-text-dim">
              Validation Score: <span className={`font-semibold ${pipeline.validationScore >= 90 ? 'text-green-400' : pipeline.validationScore >= 70 ? 'text-yellow-400' : 'text-pablo-red'}`}>{pipeline.validationScore}/100</span>
            </span>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <ChatEmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 animate-slide-in ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pablo-gold-bg">
                    <Bot size={14} className="text-pablo-gold" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 font-ui text-sm ${
                    msg.role === 'user'
                      ? 'bg-pablo-gold-bg border border-pablo-gold/20 text-pablo-text'
                      : 'bg-pablo-hover text-pablo-text'
                  }`}
                >
                    <div className="prose-pablo break-words">
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              const isInline = !match && !String(children).includes('\n');
                              if (isInline) {
                                return <code className="rounded bg-pablo-active px-1 py-0.5 font-code text-xs text-pablo-gold" {...props}>{children}</code>;
                              }
                              return (
                                <div className="group relative my-2">
                                  <div className="flex items-center justify-between rounded-t-md bg-pablo-active px-3 py-1">
                                    <span className="font-code text-[10px] text-pablo-text-muted">{match?.[1] || 'code'}</span>
                                    <CopyButton text={String(children).replace(/\n$/, '')} />
                                  </div>
                                  <pre className="overflow-x-auto rounded-b-md bg-[#0d1117] p-3 font-code text-xs leading-relaxed text-pablo-text-dim"><code className={className} {...props}>{children}</code></pre>
                                </div>
                              );
                            },
                            p({ children }) { return <p className="mb-2 last:mb-0">{children}</p>; },
                            ul({ children }) { return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>; },
                            ol({ children }) { return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>; },
                            li({ children }) { return <li className="text-pablo-text-dim">{children}</li>; },
                            h1({ children }) { return <h1 className="mb-2 text-base font-bold text-pablo-text">{children}</h1>; },
                            h2({ children }) { return <h2 className="mb-2 text-sm font-bold text-pablo-text">{children}</h2>; },
                            h3({ children }) { return <h3 className="mb-1 text-sm font-semibold text-pablo-text">{children}</h3>; },
                            strong({ children }) { return <strong className="font-semibold text-pablo-text">{children}</strong>; },
                            a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-pablo-blue underline hover:text-pablo-blue/80">{children}</a>; },
                            blockquote({ children }) { return <blockquote className="my-2 border-l-2 border-pablo-gold/50 pl-3 text-pablo-text-muted italic">{children}</blockquote>; },
                            table({ children }) { return <table className="my-2 w-full border-collapse text-xs">{children}</table>; },
                            th({ children }) { return <th className="border border-pablo-border bg-pablo-active px-2 py-1 text-left font-semibold text-pablo-text-dim">{children}</th>; },
                            td({ children }) { return <td className="border border-pablo-border px-2 py-1 text-pablo-text-dim">{children}</td>; },
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                      {msg.isStreaming && (
                        <span className="inline-block h-3 w-1.5 animate-pulse-gold bg-pablo-gold ml-0.5" />
                      )}
                    </div>
                </div>
                {msg.role === 'user' && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pablo-active">
                    <User size={14} className="text-pablo-text-dim" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-pablo-border p-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex items-end gap-2 rounded-lg border border-pablo-border bg-pablo-input px-3 py-2 focus-within:border-pablo-gold/50">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to build..."
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent font-ui text-sm text-pablo-text outline-none placeholder:text-pablo-text-muted"
              rows={1}
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md text-pablo-text-muted transition-colors duration-150 hover:bg-pablo-hover hover:text-pablo-text-dim"
                aria-label="Attach file"
              >
                <Paperclip size={14} />
              </button>
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-pablo-red transition-colors duration-150 hover:bg-pablo-red/10"
                  aria-label="Stop generation"
                >
                  <StopCircle size={16} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-pablo-gold text-pablo-bg transition-colors duration-150 hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-ui text-[10px] text-pablo-text-muted">
              Enter to send, Shift+Enter for new line
            </span>
            <button
              type="button"
              onClick={() => setAgentMode(!agentMode)}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-ui text-[10px] transition-colors ${
                agentMode
                  ? 'bg-pablo-gold/20 text-pablo-gold border border-pablo-gold/30'
                  : 'text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim'
              }`}
              title={agentMode ? 'Agent Mode ON: plan → execute → verify → fix' : 'Enable Agent Mode for complex tasks'}
            >
              <Cpu size={10} />
              {agentMode ? 'Agent ON' : 'Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
