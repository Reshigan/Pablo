'use client';

import {
  Play,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  SkipForward,
  Clock,
  Zap,
  ChevronDown,
  ChevronRight,
  StopCircle,
  Cpu,
  FileCode2,
  Search,
  Shield,
  Wrench,
  Paperclip,
  X,
  FileText,
} from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import {
  usePipelineStore,
  PIPELINE_STAGES,
  type PipelineStage,
  type StageStatus,
  type PipelineRun,
} from '@/stores/pipeline';
import { useAgentStore, type AgentPhase, type AgentRunState } from '@/stores/agent';
import { useMetricsStore } from '@/stores/metrics';
import { useEditorStore } from '@/stores/editor';
import { useToastStore } from '@/stores/toast';
import { useLearningStore } from '@/stores/learning';
import { parseGeneratedFiles } from '@/lib/code-parser';
import { generateId } from '@/lib/db/queries';
import { getDB } from '@/lib/db/drizzle';

const STATUS_ICONS: Record<StageStatus, typeof Circle> = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  skipped: SkipForward,
};

const STATUS_COLORS: Record<StageStatus, string> = {
  pending: 'text-pablo-text-muted',
  running: 'text-pablo-gold',
  completed: 'text-pablo-green',
  failed: 'text-pablo-red',
  skipped: 'text-pablo-text-muted',
};

function StageItem({
  stage,
  stageInfo,
  isExpanded,
  onToggle,
}: {
  stage: { stage: PipelineStage; status: StageStatus; output: string; durationMs?: number; tokens?: number; model?: string };
  stageInfo: { label: string; description: string; model: string };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = STATUS_ICONS[stage.status];
  const color = STATUS_COLORS[stage.status];

  // Show a live preview snippet of what the stage is doing (first 120 chars)
  const previewText = stage.output
    ? stage.output.replace(/```[\s\S]*?```/g, '[code block]').replace(/\n+/g, ' ').trim().slice(0, 120)
    : '';

  return (
    <div className="border-b border-pablo-border last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-pablo-hover"
      >
        <Icon
          size={16}
          className={`shrink-0 ${color} ${stage.status === 'running' ? 'animate-spin' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-ui text-xs font-medium text-pablo-text">{stageInfo.label}</span>
            {stage.model && (
              <span className="rounded bg-pablo-active px-1 font-code text-[9px] text-pablo-text-muted">
                {stage.model}
              </span>
            )}
          </div>
          <p className="font-ui text-[10px] text-pablo-text-muted">{stageInfo.description}</p>
          {/* Inline preview — always visible when there is output */}
          {previewText && !isExpanded && (
            <p className={`mt-0.5 font-code text-[10px] leading-snug truncate ${
              stage.status === 'running' ? 'text-pablo-gold/70' : 'text-pablo-text-dim'
            }`}>
              {stage.status === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-pablo-gold animate-pulse mr-1 align-middle" />}
              {previewText}{stage.output.length > 120 ? '...' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {stage.durationMs !== undefined && (
            <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
              <Clock size={10} />
              {(stage.durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {stage.tokens !== undefined && stage.tokens > 0 && (
            <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
              <Zap size={10} />
              {stage.tokens}
            </span>
          )}
          {stage.output ? (
            isExpanded ? (
              <ChevronDown size={12} className="text-pablo-text-muted" />
            ) : (
              <ChevronRight size={12} className="text-pablo-text-muted" />
            )
          ) : null}
        </div>
      </button>
      {isExpanded && stage.output && (
        <div className="border-t border-pablo-border bg-pablo-bg px-3 py-2">
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-code text-[11px] text-pablo-text-dim leading-relaxed">
            {stage.output}
          </pre>
        </div>
      )}
    </div>
  );
}

function RunCard({ run, onCancel }: { run: PipelineRun; onCancel?: () => void }) {
  const [expandedStages, setExpandedStages] = useState<Set<PipelineStage>>(new Set());

  const toggleStage = useCallback((stage: PipelineStage) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }, []);

  const completedCount = run.stages.filter((s) => s.status === 'completed').length;
  const progress = (completedCount / run.stages.length) * 100;

  return (
    <div className="rounded-lg border border-pablo-border bg-pablo-panel overflow-hidden">
      {/* Run header */}
      <div className="flex items-start gap-2 border-b border-pablo-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="font-ui text-xs font-medium text-pablo-text">{run.featureDescription}</p>
          <div className="mt-1 flex items-center gap-3">
            <span className={`font-ui text-[10px] font-medium ${
              run.status === 'running' ? 'text-pablo-gold' :
              run.status === 'completed' ? 'text-pablo-green' :
              run.status === 'failed' ? 'text-pablo-red' : 'text-pablo-text-muted'
            }`}>
              {run.status.toUpperCase()}
            </span>
            <span className="font-code text-[10px] text-pablo-text-muted">
              {completedCount}/{run.stages.length} stages
            </span>
            {run.totalTokens > 0 && (
              <span className="font-code text-[10px] text-pablo-text-muted">
                {run.totalTokens} tokens
              </span>
            )}
          </div>
        </div>
        {run.status === 'running' && (
          <button
            onClick={() => onCancel?.()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-pablo-red transition-colors hover:bg-pablo-red/10"
            aria-label="Cancel run"
          >
            <StopCircle size={14} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-pablo-active">
        <div
          className={`h-full transition-all duration-500 ${
            run.status === 'running' ? 'bg-pablo-gold' :
            run.status === 'completed' ? 'bg-pablo-green' :
            run.status === 'failed' ? 'bg-pablo-red' : 'bg-pablo-text-muted'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stages */}
      <div>
        {run.stages.map((stage) => {
          const stageInfo = PIPELINE_STAGES.find((s) => s.id === stage.stage);
          if (!stageInfo) return null;
          return (
            <StageItem
              key={stage.stage}
              stage={stage}
              stageInfo={stageInfo}
              isExpanded={expandedStages.has(stage.stage)}
              onToggle={() => toggleStage(stage.stage)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Max time (ms) for a single pipeline stage before aborting */
const STAGE_TIMEOUT_MS = 180_000;
/** Max time (ms) to wait for the very first SSE token (models need time to process long prompts) */
const FIRST_TOKEN_TIMEOUT_MS = 90_000;
/** Max inactivity (ms) — if no SSE data arrives for this long AFTER the first token, abort */
const STREAM_IDLE_TIMEOUT_MS = 60_000;
/** Max chars kept per previous-stage summary to prevent prompt bloat */
const MAX_PREV_OUTPUT_CHARS = 800;
/** Number of retries per stage before marking as failed */
const MAX_STAGE_RETRIES = 1;

/**
 * Truncate a stage output to keep prompts manageable.
 * Keeps the first portion and a tail so the model sees both start and end.
 */
function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return text.slice(0, half) + '\n\n... (truncated) ...\n\n' + text.slice(-half);
}

/** Build a focused prompt for each pipeline stage */
function buildStagePrompt(
  featureDescription: string,
  stage: { id: PipelineStage; label: string; description: string },
  previousOutputs: string[],
): string {
  const trimmedPrevious = previousOutputs.map(o => truncateOutput(o, MAX_PREV_OUTPUT_CHARS));

  // Stage-specific instructions so the model focuses on the right thing
  const stageInstructions: Record<PipelineStage, string> = {
    plan: 'Create a concise implementation plan. List the files to create, their purpose, and key design decisions. Do NOT write code yet.',
    db: 'Generate the database schema / models. Include all tables, columns, types, relationships, and indexes. Output complete, runnable code.',
    api: 'Generate the API routes and business logic services. Include all endpoints, request/response schemas, authentication, and error handling. Output complete, runnable code.',
    ui: 'Generate the frontend UI components and pages. Include layouts, forms, tables, and navigation. Output complete, runnable code.',
    ux_validation: `Perform a thorough UI/UX validation of all generated code from previous stages. Check and report on:
1. **Wiring completeness**: Every button, form, and link must be connected to a real handler/API call — no placeholder onClick={() => {}}, no TODO handlers, no console.log stubs.
2. **State management**: All UI state (loading, error, success, empty) must be handled. Forms must show validation errors. Lists must show empty states.
3. **Accessibility**: Check for aria-labels, keyboard navigation, focus management, color contrast, and screen reader support.
4. **Responsive design**: Verify mobile/tablet/desktop layouts work. No overflow or hidden content.
5. **Error handling**: Every fetch/API call must have try/catch with user-visible error feedback. No silent failures.
6. **Navigation flow**: All routes, links, and redirects must be wired. Back buttons, breadcrumbs, and page transitions must work.
7. **Data flow**: Props, context, and store subscriptions must be correctly typed and connected end-to-end.
Output a structured report with PASS/FAIL per check, and for each FAIL provide the exact code fix needed.`,
    tests: 'Generate unit and integration tests for the API and business logic. Output complete, runnable test files.',
    execute: 'Generate any remaining configuration files: requirements.txt / package.json, Dockerfile, .env.example, README, and a seed data script. Output complete files.',
    review: 'Review all previous stage outputs for bugs, missing features, security issues, and code quality problems. List each issue with severity and a fix suggestion.',
  };

  const parts = [
    `Feature: ${featureDescription}`,
    `\nYour task (${stage.label}): ${stageInstructions[stage.id]}`,
    '\nOutput format: For any code, respond with markdown code blocks that include filenames.',
  ];

  if (trimmedPrevious.length > 0) {
    parts.push(`\nContext from previous stages:\n${trimmedPrevious.join('\n---\n')}`);
  }

  return parts.join('\n');
}

async function runStageWithChat(
  featureDescription: string,
  stage: { id: PipelineStage; label: string; description: string; model: string },
  previousOutputs: string[],
  abortSignal: AbortSignal,
): Promise<{ output: string; tokens: number }> {
  const prompt = buildStagePrompt(featureDescription, stage, previousOutputs);

  // Create a per-stage abort that fires on timeout OR user cancel
  const stageAbort = new AbortController();
  const stageTimer = setTimeout(() => stageAbort.abort(), STAGE_TIMEOUT_MS);
  // Forward user cancel to stage abort
  const onUserAbort = () => stageAbort.abort();
  abortSignal.addEventListener('abort', onUserAbort, { once: true });

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        mode: 'pipeline-stage',
        model: stage.model,
      }),
      signal: stageAbort.signal,
    });

    if (!response.ok) throw new Error(`Chat API error: ${response.status}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let output = '';
    let tokens = 0;
    let buffer = '';
    let receivedFirstToken = false;

    // Two-phase idle timeout:
    // Phase 1: wait up to FIRST_TOKEN_TIMEOUT_MS for the first token (model is processing prompt)
    // Phase 2: after first token, wait up to STREAM_IDLE_TIMEOUT_MS between chunks
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      const timeout = receivedFirstToken ? STREAM_IDLE_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS;
      idleTimer = setTimeout(() => stageAbort.abort(), timeout);
    };
    resetIdleTimer();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload) as { content?: string; tokens?: number; eval_count?: number };
            if (parsed.content) {
              output += parsed.content;
              if (!receivedFirstToken) {
                receivedFirstToken = true;
                resetIdleTimer(); // switch to shorter idle timeout now that tokens are flowing
              }
            }
            if (parsed.eval_count) tokens = parsed.eval_count;
            else if (parsed.tokens) tokens = parsed.tokens;
          } catch {
            // skip unparseable
          }
        }
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
    }

    return { output: output || '(No output generated)', tokens };
  } finally {
    clearTimeout(stageTimer);
    abortSignal.removeEventListener('abort', onUserAbort);
  }
}

/** Wrapper that retries a stage up to MAX_STAGE_RETRIES times */
async function runStageWithRetry(
  featureDescription: string,
  stage: { id: PipelineStage; label: string; description: string; model: string },
  previousOutputs: string[],
  abortSignal: AbortSignal,
): Promise<{ output: string; tokens: number }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_STAGE_RETRIES; attempt++) {
    if (abortSignal.aborted) throw new Error('Aborted');
    try {
      return await runStageWithChat(featureDescription, stage, previousOutputs, abortSignal);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (abortSignal.aborted) throw lastError;
      // Wait briefly before retry
      if (attempt < MAX_STAGE_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  throw lastError ?? new Error('Stage failed after retries');
}

// ─── Agent Run Card (Plan → Execute → Verify → Fix) ──────────────────

const AGENT_PHASE_ICONS: Record<AgentPhase, typeof Circle> = {
  idle: Circle,
  planning: Search,
  executing: FileCode2,
  verifying: Shield,
  fixing: Wrench,
  done: CheckCircle2,
  failed: XCircle,
};

const AGENT_PHASE_COLORS: Record<AgentPhase, string> = {
  idle: 'text-pablo-text-muted',
  planning: 'text-pablo-blue',
  executing: 'text-pablo-gold',
  verifying: 'text-purple-400',
  fixing: 'text-orange-400',
  done: 'text-pablo-green',
  failed: 'text-pablo-red',
};

const AGENT_PHASE_LABELS: Record<AgentPhase, string> = {
  idle: 'Idle',
  planning: 'Planning',
  executing: 'Executing',
  verifying: 'Verifying',
  fixing: 'Auto-Fixing',
  done: 'Complete',
  failed: 'Failed',
};

function AgentRunCard({ run }: { run: AgentRunState }) {
  const [expanded, setExpanded] = useState(true);
  const PhaseIcon = AGENT_PHASE_ICONS[run.phase];
  const phaseColor = AGENT_PHASE_COLORS[run.phase];
  const completedSteps = run.steps.filter((s) => s.status === 'done').length;
  const totalSteps = run.steps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className="rounded-lg border border-pablo-border bg-pablo-panel overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2 border-b border-pablo-border px-3 py-2 text-left hover:bg-pablo-hover transition-colors"
      >
        <Cpu size={14} className="shrink-0 mt-0.5 text-pablo-gold" />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-xs font-medium text-pablo-text truncate">{run.message}</p>
          <div className="mt-1 flex items-center gap-3">
            <span className={`flex items-center gap-1 font-ui text-[10px] font-medium ${phaseColor}`}>
              <PhaseIcon size={10} className={run.phase === 'planning' || run.phase === 'executing' || run.phase === 'verifying' || run.phase === 'fixing' ? 'animate-spin' : ''} />
              {AGENT_PHASE_LABELS[run.phase]}
            </span>
            {totalSteps > 0 && (
              <span className="font-code text-[10px] text-pablo-text-muted">
                {completedSteps}/{totalSteps} steps
              </span>
            )}
            {run.tokensUsed > 0 && (
              <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
                <Zap size={10} />{run.tokensUsed}
              </span>
            )}
            {run.durationMs > 0 && (
              <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
                <Clock size={10} />{(run.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronDown size={12} className="text-pablo-text-muted mt-1" /> : <ChevronRight size={12} className="text-pablo-text-muted mt-1" />}
      </button>

      {/* Progress bar */}
      <div className="h-1 w-full bg-pablo-active">
        <div
          className={`h-full transition-all duration-500 ${
            run.phase === 'done' ? 'bg-pablo-green' :
            run.phase === 'failed' ? 'bg-pablo-red' :
            'bg-pablo-gold'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      {expanded && run.steps.length > 0 && (
        <div className="max-h-60 overflow-y-auto">
          {run.steps.map((step, i) => {
            const stepColor = step.status === 'done' ? 'text-pablo-green' :
              step.status === 'running' ? 'text-pablo-gold' :
              step.status === 'failed' ? 'text-pablo-red' : 'text-pablo-text-muted';
            const StepIcon = step.status === 'done' ? CheckCircle2 :
              step.status === 'running' ? Loader2 :
              step.status === 'failed' ? XCircle : Circle;

            return (
              <div key={step.id} className="flex items-center gap-2 border-b border-pablo-border last:border-b-0 px-3 py-1.5">
                <StepIcon size={12} className={`shrink-0 ${stepColor} ${step.status === 'running' ? 'animate-spin' : ''}`} />
                <span className="font-ui text-[10px] text-pablo-text-dim flex-1 truncate">
                  <span className="font-medium text-pablo-text-muted">{step.type}</span>{' '}
                  {step.description}
                </span>
                <span className="font-code text-[9px] text-pablo-text-muted">
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Thinking indicator */}
      {run.thinkingText && (
        <div className="border-t border-pablo-border bg-pablo-bg px-3 py-1.5">
          <p className="font-ui text-[10px] text-pablo-text-muted italic truncate">
            {run.thinkingText}
          </p>
        </div>
      )}

      {/* Verification result */}
      {run.verificationPassed !== null && (
        <div className={`border-t px-3 py-1.5 ${
          run.verificationPassed ? 'border-pablo-green/20 bg-pablo-green/5' : 'border-pablo-red/20 bg-pablo-red/5'
        }`}>
          <div className="flex items-center gap-1.5">
            {run.verificationPassed ? (
              <CheckCircle2 size={12} className="text-pablo-green" />
            ) : (
              <XCircle size={12} className="text-pablo-red" />
            )}
            <span className={`font-ui text-[10px] font-medium ${
              run.verificationPassed ? 'text-pablo-green' : 'text-pablo-red'
            }`}>
              Verification {run.verificationPassed ? 'Passed' : 'Failed'}
            </span>
            {run.fixAttempt > 0 && (
              <span className="font-code text-[9px] text-pablo-text-muted">
                (fix attempt {run.fixAttempt}/{run.maxFixAttempts})
              </span>
            )}
          </div>
          {run.verificationIssues.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {run.verificationIssues.slice(0, 5).map((issue, i) => (
                <li key={i} className="font-code text-[9px] text-pablo-text-muted truncate">- {issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Files generated */}
      {run.files.length > 0 && (
        <div className="border-t border-pablo-border px-3 py-1.5">
          <p className="font-ui text-[10px] font-medium text-pablo-text-muted mb-1">{run.files.length} files generated</p>
          {run.files.map((f) => (
            <div key={f.path} className="flex items-center gap-1.5 py-0.5">
              <FileCode2 size={10} className="text-pablo-gold shrink-0" />
              <span className="font-code text-[9px] text-pablo-text-dim truncate">{f.path}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {run.summary && (
        <div className="border-t border-pablo-border bg-pablo-bg px-3 py-1.5">
          <p className="font-ui text-[10px] text-pablo-text-dim">{run.summary}</p>
        </div>
      )}

      {/* Error */}
      {run.error && (
        <div className="border-t border-pablo-red/20 bg-pablo-red/5 px-3 py-1.5">
          <p className="font-ui text-[10px] text-pablo-red">{run.error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main PipelineView ────────────────────────────────────────────────

export function PipelineView() {
  const { runs, startRun, updateStage, advanceStage, completeRun } = usePipelineStore();
  const agentStore = useAgentStore();
  const [featureInput, setFeatureInput] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; content: string; type: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStart = useCallback(async () => {
    if (!featureInput.trim() || isBuilding) return;
    let description = featureInput.trim();
    // Include attached documents in the feature description
    if (attachments.length > 0) {
      const attachmentText = attachments
        .map((att) => `\n\n--- Attached: ${att.name} ---\n${att.content}`)
        .join('');
      description += attachmentText;
      setAttachments([]);
    }
    const runId = startRun(description);
    setFeatureInput('');
    setIsBuilding(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const previousOutputs: string[] = [];

    try {
      for (let i = 0; i < PIPELINE_STAGES.length; i++) {
        if (controller.signal.aborted) break;
        const stage = PIPELINE_STAGES[i];

        if (i > 0) advanceStage(runId);
        updateStage(runId, stage.id, { status: 'running', startedAt: Date.now() });

        try {
          const startTime = Date.now();
          const result = await runStageWithRetry(description, stage, previousOutputs, controller.signal);
          const durationMs = Date.now() - startTime;

          updateStage(runId, stage.id, {
            status: 'completed',
            output: result.output,
            tokens: result.tokens,
            durationMs,
            model: stage.model,
            completedAt: Date.now(),
          });

          useMetricsStore.getState().addTokens(result.tokens);
          useMetricsStore.getState().recordRequest(true);
          useMetricsStore.getState().recordModelCall(stage.model);
          useMetricsStore.getState().recordPipelineStage(stage.id);

          previousOutputs.push(`## ${stage.label}\n${result.output}`);
        } catch (stageError) {
          if (controller.signal.aborted) break;
          const errorMsg = stageError instanceof Error ? stageError.message : 'Stage failed';
          const isTimeout = errorMsg.includes('abort') || errorMsg.includes('timeout');
          updateStage(runId, stage.id, {
            status: 'failed',
            output: isTimeout
              ? `Stage timed out after ${STAGE_TIMEOUT_MS / 1000}s (API may be slow — skipping to next stage)`
              : errorMsg,
            completedAt: Date.now(),
          });
          useMetricsStore.getState().recordRequest(false);
          // Continue to next stage instead of killing the entire pipeline
          previousOutputs.push(`## ${stage.label}\n(failed: ${isTimeout ? 'timeout' : 'error'})`);
          continue;
        }
      }

      if (!controller.signal.aborted) {
        // Determine final status: 'completed' if at least one stage succeeded
        const currentRun = usePipelineStore.getState().runs.find(r => r.id === runId);
        const anyCompleted = currentRun?.stages.some(s => s.status === 'completed') ?? false;
        completeRun(runId, anyCompleted ? 'completed' : 'failed');
        if (anyCompleted) useMetricsStore.getState().incrementFeatures();

        // AI → Editor bridge: parse generated files from all stage outputs
        // Creates diffs for review (accept/reject) instead of directly opening
        const completedRun = usePipelineStore.getState().runs.find(r => r.id === runId);
        if (completedRun) {
          const allOutput = completedRun.stages
            .filter(s => s.output && s.status === 'completed')
            .map(s => s.output)
            .join('\n\n');
          const parsedFiles = parseGeneratedFiles(allOutput);
          if (parsedFiles.length > 0) {
            const editorStore = useEditorStore.getState();

            // Create diffs for each generated file (AI-Apply Diff system)
            for (const file of parsedFiles) {
              const fileId = generateId('diff');
              const existingTab = editorStore.tabs.find(t => t.path === file.filename);
              editorStore.addDiff({
                fileId,
                filename: file.filename,
                language: file.language,
                oldContent: existingTab?.content ?? '',
                newContent: file.content,
              });
            }

            useToastStore.getState().addToast({
              type: 'success',
              title: 'Pipeline Complete',
              message: `${parsedFiles.length} file(s) ready for review in Diff tab`,
              duration: 5000,
            });

            // Auto-capture patterns from generated code (Self-Learning)
            try {
              const learningStore = useLearningStore.getState();
              for (const file of parsedFiles) {
                const baseTags = [file.language, 'pipeline-generated'];
                // Extract architecture patterns from generated code
                if (file.filename.includes('api/') || file.filename.includes('route')) {
                  learningStore.addPattern({
                    type: 'architecture',
                    trigger: `API route: ${file.filename}`,
                    action: `Generated ${file.language} API route with ${file.content.split('\n').length} lines`,
                    confidence: 0.6,
                    tags: [...baseTags, 'api'],
                    context: description,
                  });
                }
                if (file.filename.includes('schema') || file.filename.includes('migration') || file.filename.includes('.sql')) {
                  learningStore.addPattern({
                    type: 'code_pattern',
                    trigger: `DB schema: ${file.filename}`,
                    action: `Generated ${file.language} database schema`,
                    confidence: 0.6,
                    tags: [...baseTags, 'database'],
                    context: description,
                  });
                }
                if (file.filename.includes('test') || file.filename.includes('spec')) {
                  learningStore.addPattern({
                    type: 'code_pattern',
                    trigger: `Test: ${file.filename}`,
                    action: `Generated test file in ${file.language}`,
                    confidence: 0.6,
                    tags: [...baseTags, 'tests'],
                    context: description,
                  });
                }
              }
            } catch {
              // Non-blocking
            }
          }

          // Persist pipeline run to DB
          try {
            const db = getDB();
            db.createPipelineRun({
              id: runId,
              sessionId: 'default',
              featureDescription: description,
              status: 'completed',
              currentStage: 'review',
              totalTokens: completedRun.totalTokens,
              totalDurationMs: completedRun.totalDurationMs,
            });
          } catch {
            // Non-blocking
          }
        }
      }
    } catch {
      completeRun(runId, 'failed');
    } finally {
      setIsBuilding(false);
      abortRef.current = null;
    }
  }, [featureInput, isBuilding, attachments, startRun, updateStage, advanceStage, completeRun]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleStart();
      }
    },
    [handleStart]
  );

  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setAttachments((prev) => [...prev, { name: file.name, content: text, type: file.type }]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="flex h-full flex-col bg-pablo-panel">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-pablo-border px-3">
        <span className="font-ui text-xs font-semibold uppercase tracking-wider text-pablo-text-dim">
          Feature Factory
        </span>
        <span className="font-ui text-[10px] text-pablo-text-muted">
          {runs.length} runs
        </span>
      </div>

      {/* Feature input */}
      <div className="shrink-0 border-b border-pablo-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={featureInput}
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a feature to build (e.g., 'Add user authentication with JWT')..."
            className="min-h-[48px] max-h-24 flex-1 resize-none rounded-lg border border-pablo-border bg-pablo-input px-3 py-2 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            rows={2}
          />
          <div className="flex flex-col gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.xml,.yaml,.yml,.toml,.ts,.tsx,.js,.jsx,.py,.html,.css,.sql,.env,.sh,.rs,.go,.java,.rb,.php,.swift,.kt,.c,.cpp,.h,.pdf,.doc,.docx"
              onChange={handleFileAttach}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-pablo-border transition-colors ${
                attachments.length > 0
                  ? 'text-pablo-gold border-pablo-gold/30 bg-pablo-gold/5'
                  : 'text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim'
              }`}
              title="Attach document"
              aria-label="Attach document"
            >
              <Paperclip size={14} />
            </button>
            <button
              onClick={handleStart}
              disabled={!featureInput.trim() || isBuilding}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-pablo-gold px-3 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isBuilding ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {isBuilding ? 'Building...' : 'Build'}
            </button>
          </div>
        </div>
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {attachments.map((att, i) => (
              <span
                key={`${att.name}-${i}`}
                className="flex items-center gap-1 rounded-md bg-pablo-gold/10 px-2 py-0.5 font-ui text-[10px] text-pablo-gold"
              >
                <FileText size={10} />
                {att.name}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 rounded-full hover:bg-pablo-gold/20"
                  aria-label={`Remove ${att.name}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-ui text-[10px] text-pablo-text-muted">{PIPELINE_STAGES.length}-Stage Pipeline:</span>
          <div className="flex items-center gap-1">
            {PIPELINE_STAGES.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1">
                <span className="font-ui text-[10px] text-pablo-gold">{s.label}</span>
                {i < PIPELINE_STAGES.length - 1 && (
                  <span className="text-pablo-text-muted">&rarr;</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Runs */}
      {agentStore.runs.length > 0 && (
        <div className="shrink-0 border-b border-pablo-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={12} className="text-pablo-gold" />
            <span className="font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-gold">Agent Runs</span>
            <span className="font-ui text-[10px] text-pablo-text-muted">Plan → Execute → Verify → Fix</span>
          </div>
          <div className="flex flex-col gap-2">
            {agentStore.runs.map((run) => (
              <AgentRunCard key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Runs list */}
      <div className="flex-1 overflow-y-auto p-3">
        {runs.length === 0 && agentStore.runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-gold/10">
              <Play size={24} className="text-pablo-gold" />
            </div>
            <p className="font-ui text-xs font-medium text-pablo-text-dim">
              Feature Factory Pipeline
            </p>
            <p className="max-w-xs font-ui text-[11px] text-pablo-text-muted leading-relaxed">
              Describe a feature and Pablo will plan, implement, test, and review it
              automatically through an 8-stage pipeline.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                onCancel={run.status === 'running' ? () => {
                  abortRef.current?.abort();
                  completeRun(run.id, 'cancelled');
                } : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
