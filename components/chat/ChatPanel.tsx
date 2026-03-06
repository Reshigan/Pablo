'use client';

import { Trash2, Bot, Loader2, AlertTriangle, RotateCw } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chat';
import { useToastStore, toastError } from '@/stores/toast';
import { useEditorStore } from '@/stores/editor';
import { useAgentStore } from '@/stores/agent';
import { parseGeneratedFiles } from '@/lib/code-parser';
import { generateId } from '@/lib/db/queries';
import { getDB } from '@/lib/db/drizzle';
import type { AgentEvent } from '@/lib/agents/agentEngine';
import { useRepoStore } from '@/stores/repo';
import { useUIStore } from '@/stores/ui';
import { useSessionStore } from '@/stores/session';
import { EvaluationReport } from './EvaluationReport';
import type { EvaluationResult, EvaluationIssue } from '@/lib/agents/repoEvaluator';

// Extracted sub-components (Task 29)
import { ChatInput, type ChatMode } from './ChatInput';
import { MessageBubble } from './MessageBubble';
import { AgentEventStream } from './AgentEventStream';

interface PipelineProgress {
  active: boolean;
  currentStep: string;
  status: string;
  validationScore: number | null;
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
        I use Devstral-2 for reasoning and code generation, and GPT-OSS for fast tasks.
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
    removeMessage,
    appendToMessage,
    updateMessage,
    setStreaming,
    setError,
    addTokens,
    clearMessages,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [detectedIntent, setDetectedIntent] = useState<'chat' | 'build' | 'evaluate' | 'fix'>('chat');
  const [manualMode, setManualMode] = useState<'auto' | 'chat' | 'build' | 'evaluate' | 'fix'>('auto');
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [attachments, setAttachments] = useState<Array<{ name: string; content: string; type: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pipeline, setPipeline] = useState<PipelineProgress>({
    active: false,
    currentStep: '',
    status: '',
    validationScore: null,
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { startRun, processEvent, completeRun, failRun, isRunning: agentRunning, processOrchestratorEvent, resetOrchestration } = useAgentStore();
  const { selectedRepo, selectedBranch } = useRepoStore();
  const { setActiveWorkspaceTab } = useUIStore();
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

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
                case 'step_action': {
                  // Execute client-side actions (commit, create_pr, deploy)
                  const actionPayload = event.payload as Record<string, unknown>;
                  streamContent += `> Executing **${event.action}**...\n`;
                  try {
                    if (event.action === 'commit') {
                      const commitFiles = actionPayload.files as Array<{ path: string; content: string }> | undefined;
                      const commitMsg = (actionPayload.message as string) || 'Auto-commit from Pablo';
                      if (commitFiles && commitFiles.length > 0) {
                        const commitRepo = (actionPayload.repo as string) || '';
                        const commitResp = await fetch('/api/deploy', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ files: commitFiles, project_name: commitMsg, repo: commitRepo }),
                        });
                        streamContent += commitResp.ok
                          ? `  Committed ${commitFiles.length} files\n\n`
                          : `  Commit failed: ${commitResp.status}\n\n`;
                      }
                    } else if (event.action === 'create_pr') {
                      const prTitle = (actionPayload.title as string) || 'PR from Pablo';
                      const prBody = (actionPayload.body as string) || '';
                      const head = (actionPayload.head as string) || '';
                      const base = (actionPayload.base as string) || 'main';
                      const prRepo = (actionPayload.repo as string) || '';
                      const prResp = await fetch('/api/github/pull-request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: prTitle, body: prBody, head, base, repo: prRepo }),
                      });
                      if (prResp.ok) {
                        const prData = (await prResp.json()) as { url?: string; number?: number };
                        streamContent += `  PR #${prData.number} created: ${prData.url}\n\n`;
                      } else {
                        streamContent += `  PR creation failed: ${prResp.status}\n\n`;
                      }
                    } else if (event.action === 'deploy') {
                      streamContent += `  Deploy target: ${actionPayload.target || 'production'} (queued)\n\n`;
                    }
                  } catch (actionErr) {
                    streamContent += `  Action failed: ${actionErr instanceof Error ? actionErr.message : 'Unknown error'}\n\n`;
                  }
                  break;
                }
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

      // Attachments and routing are already handled by handleSubmit before calling sendMessage
      const fullContent = content.trim();

      // Reset pipeline state from any previous multi-turn run
      setPipeline({ active: false, currentStep: '', status: '', validationScore: null });

      // Add user message
      addMessage({ role: 'user', content: fullContent });

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
      // Fix #23: Truncate conversation history to prevent oversized requests
      const MAX_HISTORY_MESSAGES = 40; // keep last 40 messages (~20 turns)
      const MAX_MESSAGE_CHARS = 12000; // truncate individual messages to 12k chars
      const currentMessages = useChatStore.getState().messages;
      const recentMessages = currentMessages
        .filter((m) => m.id !== assistantId)
        .slice(-MAX_HISTORY_MESSAGES);
      const apiMessages = [
        {
          role: 'system' as const,
          content:
            'You are Pablo, an AI coding assistant inside an IDE. Help the user build features, debug code, and explain concepts. Be concise and use markdown for code blocks.',
        },
        ...recentMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.length > MAX_MESSAGE_CHARS
            ? m.content.slice(0, MAX_MESSAGE_CHARS) + '\n\n[...truncated]'
            : m.content,
        })),
      ];

      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      try {
        const controller = new AbortController();
        abortRef.current = controller;
        // Timeout: abort after 60 seconds with a clear message
        timeoutId = setTimeout(() => {
          controller.abort();
        }, 60000);

        const currentSessionId = useSessionStore.getState().currentSessionId;

        // Read user-configured Ollama endpoint from Settings (localStorage)
        let ollamaUrl: string | undefined;
        try {
          const stored = localStorage.getItem('pablo-settings-ollamaEndpoint');
          if (stored) ollamaUrl = JSON.parse(stored) as string;
        } catch { /* ignore */ }

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            model: 'devstral-2:123b',
            temperature: 0.7,
            sessionId: currentSessionId || undefined,
            ollamaUrl: ollamaUrl || undefined,
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

            let parsed: {
              content?: string;
              done?: boolean;
              eval_count?: number;
              model?: string;
              step?: string;
              status?: string;
              error?: string;
            };
            try {
              parsed = JSON.parse(data);
            } catch {
              continue; // Skip malformed SSE data
            }

            // Detect server-side stream errors (e.g. Ollama Cloud connection dropped)
            if (parsed.error) {
              if (parsed.error === 'no_backend') {
                setError('No AI backend configured');
                updateMessage(assistantId, {
                  isStreaming: false,
                  content: [
                    '### No AI Backend Configured\n',
                    'Pablo needs an AI backend to generate responses. To fix this:\n',
                    '1. Open **Settings** (gear icon in sidebar)',
                    '2. Go to the **AI Models** tab',
                    '3. Enter your **Ollama Cloud** endpoint and API key',
                    '4. Or set `OLLAMA_URL` and `OLLAMA_API_KEY` as Cloudflare Worker secrets\n',
                    '> Need an API key? Visit [ollama.com](https://ollama.com) to get started.',
                  ].join('\n'),
                });
                streamDone = true;
                break;
              }
              throw new Error(`Stream error: ${parsed.error}`);
            }

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
                // Task 25: Store token count and model on assistant message
                updateMessage(assistantId, { tokens: parsed.eval_count, model: parsed.model });
              }
              // Reset pipeline state when done
              setPipeline(prev => prev.active ? { ...prev, active: false } : prev);
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
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (err instanceof Error && err.name === 'AbortError') {
          updateMessage(assistantId, {
            isStreaming: false,
            content:
              (useChatStore.getState().messages.find((m) => m.id === assistantId)
                ?.content ?? '') + '\n\n*[Generation stopped]*',
          });
        } else {
          const rawMsg = err instanceof Error ? err.message : 'Unknown error';
          const userMessage =
            rawMsg === 'Load failed' || rawMsg === 'Failed to fetch'
              ? 'Could not connect to AI backend. Check that OLLAMA_URL and OLLAMA_API_KEY are configured.'
              : rawMsg;
          setError(userMessage);
          toastError('Chat Error', userMessage);
          updateMessage(assistantId, {
            isStreaming: false,
            content: `Error: ${userMessage}`,
          });
        }
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [
      messages,
      isStreaming,
      attachments,
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
    let msg = input.trim();
    const rawMsg = msg; // Save raw input before attachments for routing decisions
    const autoIntent = detectIntentFromInput(msg);
    const intent = manualMode === 'auto' ? autoIntent : manualMode;
    setInput('');
    setDetectedIntent('chat');

    // Include attachments in message content for all routing paths
    if (attachments.length > 0) {
      const attachmentText = attachments
        .map((att) => `\n\n--- Attached: ${att.name} ---\n${att.content}`)
        .join('');
      msg += attachmentText;
      setAttachments([]);
    }

    // Route by selected/detected intent, then check for orchestration on build/chat
    // Use rawMsg (without attachments) for shouldOrchestrate to avoid false positives from code content
    if (intent === 'evaluate') {
      handleEvaluate(msg);
    } else if (intent === 'fix') {
      handleFix(msg);
    } else if (shouldOrchestrate(rawMsg)) {
      // Complex multi-domain tasks (3+ requirement indicators) use multi-agent orchestration
      sendOrchestratedMessage(msg);
    } else if (intent === 'build') {
      // Build intent uses agent mode for full pipeline
      sendAgentMessage(msg);
    } else {
      sendMessage(msg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Phase: Document upload — support all file types including binary (PDF, DOCX, images)
  const BINARY_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff']);

  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isBinary = BINARY_EXTS.has(ext) || file.type.startsWith('image/') || file.type === 'application/pdf';

      if (isBinary) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          setAttachments((prev) => [...prev, {
            name: file.name,
            content: `[Binary file: ${file.name} (${(file.size / 1024).toFixed(1)}KB, type: ${file.type})]\n\n${base64}`,
            type: file.type || `application/${ext}`,
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          setAttachments((prev) => [...prev, { name: file.name, content: text, type: file.type || `text/${ext}` }]);
        };
        reader.readAsText(file);
      }
    });
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Check if a message should use multi-agent orchestration
   * (complex multi-domain tasks with 3+ requirement indicators)
   */
  const shouldOrchestrate = useCallback((text: string): boolean => {
    const indicators = [
      /auth/i, /crud/i, /dashboard/i, /api/i, /database/i,
      /login/i, /register/i, /pipeline/i, /report/i, /export/i,
      /import/i, /notification/i, /email/i, /payment/i, /invoice/i,
      /search/i, /filter/i, /sort/i, /upload/i, /admin/i,
    ];
    return indicators.filter(p => p.test(text)).length >= 3;
  }, []);

  /**
   * Send message through the Multi-Agent Orchestrator
   */
  const sendOrchestratedMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      resetOrchestration();
      addMessage({ role: 'user', content: content.trim() });
      const assistantId = addMessage({ role: 'assistant', content: '', isStreaming: true });
      setStreaming(true);
      setError(null);
      setActiveWorkspaceTab('mission-control');

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const editorState = useEditorStore.getState();
        const existingFiles: Record<string, string> = {};
        for (const tab of editorState.tabs) {
          if (tab.content && tab.path) {
            existingFiles[tab.path] = tab.content;
          }
        }

        const response = await fetch('/api/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content.trim(),
            existingFiles,
          }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`Orchestrator API error: ${response.status}`);
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
              const event = JSON.parse(data);
              processOrchestratorEvent(event);

              // Build message content from events
              if (event.type === 'thinking' && event.content) {
                streamContent += `> ${event.content}\n`;
              } else if (event.type === 'file_written') {
                streamContent += `### ${event.path}\n\`\`\`${event.language}\n${event.content}\n\`\`\`\n\n`;
              } else if (event.type === 'done') {
                streamContent += `\n---\n\n**${event.summary}**\n`;
              } else if (event.type === 'error') {
                streamContent += `\n**Error:** ${event.message}\n`;
              }

              updateMessage(assistantId, { content: streamContent });
            } catch {
              // Skip unparseable events
            }
          }
        }

        updateMessage(assistantId, { isStreaming: false });

        // Parse generated files and open as diffs
        const finalContent = useChatStore.getState().messages.find((m) => m.id === assistantId)?.content ?? '';
        const parsedFiles = parseGeneratedFiles(finalContent);
        if (parsedFiles.length > 0) {
          const edStore = useEditorStore.getState();
          for (const file of parsedFiles) {
            const fileId = generateId('orch');
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
            title: 'Orchestration Complete',
            message: `${parsedFiles.length} file(s) ready for review in Diff tab`,
            duration: 5000,
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          updateMessage(assistantId, {
            isStreaming: false,
            content: (useChatStore.getState().messages.find((m) => m.id === assistantId)?.content ?? '') + '\n\n*[Orchestration stopped]*',
          });
        } else {
          const errorMsg = err instanceof Error ? err.message : 'Orchestration failed';
          setError(errorMsg);
          updateMessage(assistantId, { isStreaming: false, content: `Error: ${errorMsg}` });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, addMessage, updateMessage, setStreaming, setError, processOrchestratorEvent, resetOrchestration, setActiveWorkspaceTab]
  );

  /**
   * Voice-to-text: record audio and transcribe via /api/transcribe
   */
  const toggleVoiceRecording = useCallback(async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          if (res.ok) {
            const { text } = await res.json() as { text: string };
            if (text) setInput(prev => prev + (prev ? ' ' : '') + text);
          }
        } catch {
          // Transcription failed silently
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      // Microphone access denied
    }
  }, [isRecording]);

  /**
   * Detect user intent from input to auto-suggest mode
   */
  const detectIntentFromInput = useCallback((text: string): 'chat' | 'build' | 'evaluate' | 'fix' => {
    const lower = text.toLowerCase();
    // Evaluate patterns
    if (/\b(evaluate|audit|scan|health|review\s+repo|analyze\s+repo|check\s+quality)\b/.test(lower)) {
      return 'evaluate';
    }
    // Fix patterns
    if (/\b(fix|bug|error|crash|broken|not\s+work|fail|patch|debug|repair)\b/.test(lower)) {
      return 'fix';
    }
    // Build patterns
    if (/\b(build|create|generate|implement|make|scaffold|new\s+app|new\s+project)\b/.test(lower)) {
      return 'build';
    }
    return 'chat';
  }, []);

  /**
   * Handle Evaluate mode: load repo files → run evaluateRepo → show report
   */
  const handleEvaluate = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      addMessage({ role: 'user', content: content || 'Evaluate repository' });
      const assistantId = addMessage({ role: 'assistant', content: '', isStreaming: true });
      setStreaming(true);
      setError(null);
      setEvaluationResult(null);

      try {
        // Step 1: Load repo files
        const repoName = selectedRepo?.full_name;
        const branch = selectedBranch || 'main';

        if (!repoName) {
          throw new Error('No repository selected. Please select a repo from the Git panel first.');
        }

        updateMessage(assistantId, { content: 'Loading repository files...' });

        const { loadRepoFilesViaAPI } = await import('@/lib/agents/repoLoader');
        const files = await loadRepoFilesViaAPI(repoName, branch, {
          maxFiles: 50,
          onProgress: (msg) => updateMessage(assistantId, { content: msg }),
        });

        if (files.length === 0) {
          throw new Error('No files loaded from repository. Check that the repo has accessible files.');
        }

        // Step 2: Run evaluation via server-side API (SEC-02: API key stays server-side)
        updateMessage(assistantId, { content: `Evaluating ${files.length} files...` });

        const evalRes = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        });

        if (!evalRes.ok) {
          throw new Error(`Evaluation request failed: ${evalRes.status}`);
        }

        const reader = evalRes.body?.getReader();
        if (!reader) throw new Error('No response stream from evaluate API');

        const decoder = new TextDecoder();
        let evalBuffer = '';
        let result: EvaluationResult | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          evalBuffer += decoder.decode(value, { stream: true });
          const lines = evalBuffer.split('\n');
          evalBuffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let isServerError = false;
            try {
              const evt = JSON.parse(line.slice(6)) as { type: string; message?: string; result?: EvaluationResult; error?: string };
              if (evt.type === 'progress' && evt.message) {
                updateMessage(assistantId, { content: evt.message });
              } else if (evt.type === 'result' && evt.result) {
                result = evt.result;
              } else if (evt.type === 'error') {
                isServerError = true;
                throw new Error(evt.error || 'Evaluation failed');
              }
            } catch (e) {
              if (isServerError) throw e;
              // JSON parse error — skip malformed SSE line
            }
          }
        }

        if (!result) throw new Error('No evaluation result received');

        setEvaluationResult(result);
        updateMessage(assistantId, {
          content: `Repository evaluation complete. Health score: **${result.healthScore}/100**`,
          isStreaming: false,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Evaluation failed';
        setError(errorMsg);
        updateMessage(assistantId, { isStreaming: false, content: `Error: ${errorMsg}` });
      } finally {
        setStreaming(false);
      }
    },
    [isStreaming, selectedRepo, selectedBranch, addMessage, updateMessage, setStreaming, setError],
  );

  /**
   * Handle Fix mode: detect mode → load repo files → run incrementalPipeline → create diffs
   */
  const handleFix = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      addMessage({ role: 'user', content: content.trim() });
      const assistantId = addMessage({ role: 'assistant', content: '', isStreaming: true });
      setStreaming(true);
      setError(null);

      try {
        const repoName = selectedRepo?.full_name;
        const branch = selectedBranch || 'main';

        if (!repoName) {
          throw new Error('No repository selected. Please select a repo from the Git panel first.');
        }

        // Step 1: Load repo files
        updateMessage(assistantId, { content: 'Loading repository files...' });

        const { loadRepoFilesViaAPI } = await import('@/lib/agents/repoLoader');
        const files = await loadRepoFilesViaAPI(repoName, branch, {
          maxFiles: 50,
          onProgress: (msg) => updateMessage(assistantId, { content: msg }),
        });

        if (files.length === 0) {
          throw new Error('No files loaded from repository.');
        }

        // Step 2: Run fix pipeline via server-side API (SEC-02: API key stays server-side)
        updateMessage(assistantId, { content: `Running fix pipeline on ${files.length} files...` });

        const fixRes = await fetch('/api/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: content.trim(), files }),
        });

        if (!fixRes.ok) {
          throw new Error(`Fix request failed: ${fixRes.status}`);
        }

        const fixReader = fixRes.body?.getReader();
        if (!fixReader) throw new Error('No response stream from fix API');

        const fixDecoder = new TextDecoder();
        let fixBuffer = '';
        interface FixResultShape { mode: string; description: string; edits: Array<{ path: string; oldContent: string; newContent: string; description: string }>; newFiles: Array<{ path: string; content: string; language: string; description: string }>; explanation: string; relevantFiles: string[] }
        let result: FixResultShape | null = null;

        while (true) {
          const { done, value } = await fixReader.read();
          if (done) break;
          fixBuffer += fixDecoder.decode(value, { stream: true });
          const lines = fixBuffer.split('\n');
          fixBuffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let isServerError = false;
            try {
              const evt = JSON.parse(line.slice(6)) as { type: string; stage?: string; message?: string; progress?: number; result?: FixResultShape; error?: string };
              if (evt.type === 'progress' && evt.stage && evt.message) {
                updateMessage(assistantId, {
                  content: `[${evt.stage}] ${evt.message} (${evt.progress ?? 0}%)`,
                });
              } else if (evt.type === 'result' && evt.result) {
                result = evt.result;
              } else if (evt.type === 'error') {
                isServerError = true;
                throw new Error(evt.error || 'Fix pipeline failed');
              }
            } catch (e) {
              if (isServerError) throw e;
              // JSON parse error — skip malformed SSE line
            }
          }
        }

        if (!result) throw new Error('No fix result received');

        // Step 3: Create diffs in the editor
        const editorStore = useEditorStore.getState();

        for (const edit of result.edits) {
          const fileId = `fix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          editorStore.addDiff({
            fileId,
            filename: edit.path,
            language: files.find((f) => f.path === edit.path)?.language || 'plaintext',
            oldContent: edit.oldContent,
            newContent: edit.newContent,
          });
        }

        for (const newFile of result.newFiles) {
          const fileId = `fix-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          editorStore.addDiff({
            fileId,
            filename: newFile.path,
            language: newFile.language,
            oldContent: '',
            newContent: newFile.content,
          });
        }

        // Switch to diff tab if there are changes
        if (result.edits.length > 0 || result.newFiles.length > 0) {
          setActiveWorkspaceTab('diff');
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Changes Ready',
            message: `${result.edits.length} edit(s), ${result.newFiles.length} new file(s) — review in Diff tab`,
            duration: 5000,
          });
        }

        updateMessage(assistantId, {
          content: result.explanation || `Applied ${result.edits.length} edit(s) and created ${result.newFiles.length} new file(s).`,
          isStreaming: false,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Fix pipeline failed';
        setError(errorMsg);
        updateMessage(assistantId, { isStreaming: false, content: `Error: ${errorMsg}` });
      } finally {
        setStreaming(false);
      }
    },
    [isStreaming, selectedRepo, selectedBranch, addMessage, updateMessage, setStreaming, setError, setActiveWorkspaceTab],
  );

  /**
   * Handle "Fix This" button from EvaluationReport
   */
  const handleFixIssue = useCallback(
    (issue: EvaluationIssue) => {
      setDetectedIntent('fix');
      const fixPrompt = `Fix: ${issue.title} in ${issue.file}${issue.line ? `:${issue.line}` : ''}\n${issue.description}${issue.suggestedFix ? `\nSuggested fix: ${issue.suggestedFix}` : ''}`;
      setInput(fixPrompt);
      inputRef.current?.focus();
    },
    [],
  );


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

      {/* Error banner with retry */}
      {error && (
        <div className="shrink-0 border-b border-pablo-red/20 bg-pablo-red/10 px-3 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle size={12} className="shrink-0 text-pablo-red" />
              <p className="font-ui text-xs text-pablo-red truncate">
                {error.includes('fetch') || error.includes('connect')
                  ? 'Could not reach AI backend. Check your connection and try again.'
                  : error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                const lastUserMsg = messages.filter(m => m.role === 'user').pop();
                if (lastUserMsg) {
                  const lastUserIdx = messages.findIndex(m => m.id === lastUserMsg.id);
                  const failedAssistant = messages.slice(lastUserIdx + 1).find(m => m.role === 'assistant');
                  if (failedAssistant) removeMessage(failedAssistant.id);
                  removeMessage(lastUserMsg.id);
                  const intent = manualMode === 'auto' ? detectIntentFromInput(lastUserMsg.content) : manualMode;
                  if (intent === 'evaluate') handleEvaluate(lastUserMsg.content);
                  else if (intent === 'fix') handleFix(lastUserMsg.content);
                  else if (shouldOrchestrate(lastUserMsg.content)) sendOrchestratedMessage(lastUserMsg.content);
                  else if (intent === 'build') sendAgentMessage(lastUserMsg.content);
                  else sendMessage(lastUserMsg.content);
                }
              }}
              className="flex shrink-0 items-center gap-1 rounded bg-pablo-red/20 px-2 py-0.5 font-ui text-[10px] text-pablo-red transition-colors hover:bg-pablo-red/30"
            >
              <RotateCw size={10} />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Agent event stream (pipeline progress + validation score) */}
      <AgentEventStream pipeline={pipeline} />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <ChatEmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {evaluationResult && (
              <div className="animate-slide-in">
                <EvaluationReport result={evaluationResult} onFixIssue={handleFixIssue} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area (extracted sub-component) */}
      <ChatInput
        input={input}
        setInput={setInput}
        manualMode={manualMode}
        setManualMode={setManualMode}
        detectedIntent={detectedIntent}
        setDetectedIntent={setDetectedIntent}
        attachments={attachments}
        setAttachments={setAttachments}
        isStreaming={isStreaming}
        isRecording={isRecording}
        onSubmit={handleSubmit}
        onStop={handleStop}
        onToggleVoice={toggleVoiceRecording}
        detectIntentFromInput={detectIntentFromInput}
        inputRef={inputRef}
      />
    </div>
  );
}
