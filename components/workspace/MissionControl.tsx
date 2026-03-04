'use client';

/**
 * MissionControl — Multi-Agent Worker Status Grid
 *
 * Shows the status of all orchestration workers:
 *   - Planning → Executing → Merging → Verifying → Done phases
 *   - Individual worker cards with title, status, files, duration
 */

import { useState, useEffect, useCallback } from 'react';

interface WorkerStatus {
  id: string;
  title: string;
  type: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  files: string[];
  durationMs?: number;
}

interface OrchestrationState {
  phase: 'idle' | 'planning' | 'executing' | 'merging' | 'verifying' | 'done' | 'failed';
  workers: WorkerStatus[];
  totalFiles: number;
  totalTokens: number;
  totalDurationMs: number;
  summary?: string;
}

const PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  planning: 'Planning...',
  executing: 'Executing Workers',
  merging: 'Merging Results',
  verifying: 'Verifying Build',
  done: 'Complete',
  failed: 'Failed',
};

const PHASE_COLORS: Record<string, string> = {
  idle: 'text-gray-400',
  planning: 'text-yellow-400',
  executing: 'text-blue-400',
  merging: 'text-purple-400',
  verifying: 'text-orange-400',
  done: 'text-green-400',
  failed: 'text-red-400',
};

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  complete: '✅',
  failed: '❌',
};

export function MissionControl() {
  const [state, setState] = useState<OrchestrationState>({
    phase: 'idle',
    workers: [],
    totalFiles: 0,
    totalTokens: 0,
    totalDurationMs: 0,
  });

  const handleEvent = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'orchestration:update') {
      setState(event.data.state as OrchestrationState);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleEvent);
    return () => window.removeEventListener('message', handleEvent);
  }, [handleEvent]);

  if (state.phase === 'idle' && state.workers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <div className="text-4xl mb-4">🎯</div>
        <h3 className="text-lg font-medium mb-2">Mission Control</h3>
        <p className="text-sm text-center max-w-md">
          Send a complex multi-domain task in chat to activate the multi-agent orchestrator.
          Workers will appear here as they execute in parallel.
        </p>
        <p className="text-xs mt-4 text-gray-600">
          Try: &quot;Build a user auth system with login page, API routes, and tests&quot;
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] text-white overflow-auto">
      {/* Phase Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${PHASE_COLORS[state.phase]}`}>
            {PHASE_LABELS[state.phase]}
          </span>
          {state.phase === 'executing' && (
            <span className="text-xs text-gray-400">
              {state.workers.filter(w => w.status === 'complete').length}/{state.workers.length} workers done
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{state.totalFiles} files</span>
          <span>{state.totalTokens.toLocaleString()} tokens</span>
          <span>{(state.totalDurationMs / 1000).toFixed(1)}s</span>
        </div>
      </div>

      {/* Phase Progress Bar */}
      <div className="flex px-4 py-2 gap-1">
        {['planning', 'executing', 'merging', 'verifying', 'done'].map((p) => {
          const phases = ['planning', 'executing', 'merging', 'verifying', 'done'];
          const currentIdx = phases.indexOf(state.phase);
          const stepIdx = phases.indexOf(p);
          const isActive = stepIdx <= currentIdx;
          const isCurrent = p === state.phase;

          return (
            <div key={p} className="flex-1 flex flex-col items-center">
              <div
                className={`h-1 w-full rounded ${
                  isActive
                    ? isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
                    : 'bg-gray-700'
                }`}
              />
              <span className={`text-[10px] mt-1 ${isActive ? 'text-gray-300' : 'text-gray-600'}`}>
                {p}
              </span>
            </div>
          );
        })}
      </div>

      {/* Worker Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {state.workers.map((worker) => (
          <div
            key={worker.id}
            className={`rounded-lg border p-3 transition-all ${
              worker.status === 'running'
                ? 'border-blue-500 bg-blue-500/10'
                : worker.status === 'complete'
                ? 'border-green-500/30 bg-green-500/5'
                : worker.status === 'failed'
                ? 'border-red-500/30 bg-red-500/5'
                : 'border-gray-700 bg-gray-800/50'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>{STATUS_ICONS[worker.status]}</span>
                <span className="text-sm font-medium truncate">{worker.title}</span>
              </div>
              <span className="text-[10px] text-gray-500 uppercase">{worker.type}</span>
            </div>

            {worker.files.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {worker.files.slice(0, 4).map((f) => (
                  <div key={f} className="text-[11px] text-gray-400 truncate font-mono">
                    {f}
                  </div>
                ))}
                {worker.files.length > 4 && (
                  <div className="text-[10px] text-gray-500">
                    +{worker.files.length - 4} more
                  </div>
                )}
              </div>
            )}

            {worker.durationMs !== undefined && (
              <div className="mt-2 text-[10px] text-gray-500">
                {(worker.durationMs / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {state.summary && (
        <div className="mx-4 mb-4 p-3 rounded-lg bg-green-900/20 border border-green-700/30 text-sm text-green-300">
          {state.summary}
        </div>
      )}
    </div>
  );
}
