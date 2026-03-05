'use client';

/**
 * AgentRunCard — Displays an agent run (Plan -> Execute -> Verify -> Fix).
 * Extracted from PipelineView.tsx (Task 28).
 */

import { useState } from 'react';
import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  ChevronDown,
  ChevronRight,
  Cpu,
  FileCode2,
  Search,
  Shield,
  Wrench,
} from 'lucide-react';
import type { AgentPhase, AgentRunState } from '@/stores/agent';

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

export function AgentRunCard({ run }: { run: AgentRunState }) {
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
