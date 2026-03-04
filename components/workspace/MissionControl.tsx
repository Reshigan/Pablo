'use client';

/**
 * MissionControl — V10 6-Phase Orchestration Dashboard
 *
 * Shows the status of the 6-phase pipeline:
 *   Understand -> Design -> Build -> Quality -> Ship -> Verify
 *
 * Displays agent cards with real-time status, token usage, and file counts.
 */

import { useAgentStore, type OrchestrationPhase } from '@/stores/agent';

const PHASE_ORDER: OrchestrationPhase[] = ['understand', 'design', 'build', 'quality', 'ship', 'verify'];

const PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  understand: 'Understanding',
  design: 'Designing',
  build: 'Building',
  quality: 'Quality Check',
  ship: 'Shipping',
  verify: 'Verifying',
  done: 'Complete',
  failed: 'Failed',
};

const PHASE_COLORS: Record<string, string> = {
  idle: 'text-gray-400',
  understand: 'text-cyan-400',
  design: 'text-blue-400',
  build: 'text-yellow-400',
  quality: 'text-purple-400',
  ship: 'text-orange-400',
  verify: 'text-green-400',
  done: 'text-green-400',
  failed: 'text-red-400',
};

const AGENT_ICONS: Record<string, string> = {
  PMAgent: 'PM',
  ArchitectAgent: 'AR',
  DesignAgent: 'DS',
  DatabaseAgent: 'DB',
  FrontendAgent: 'FE',
  BackendAgent: 'BE',
  TestAgent: 'QA',
  SecurityAgent: 'SC',
  ReviewAgent: 'CR',
  DocsAgent: 'DC',
  InfraAgent: 'IF',
  OpsAgent: 'OP',
};

const STATUS_BG: Record<string, string> = {
  idle: 'border-gray-700 bg-gray-800/50',
  running: 'border-blue-500 bg-blue-500/10 animate-pulse',
  done: 'border-green-500/30 bg-green-500/5',
  failed: 'border-red-500/30 bg-red-500/5',
};

export function MissionControl() {
  const orchestration = useAgentStore(s => s.orchestration);

  if (orchestration.phase === 'idle' && orchestration.agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
        <div className="text-4xl mb-4">🎯</div>
        <h3 className="text-lg font-medium mb-2">Mission Control</h3>
        <p className="text-sm text-center max-w-md">
          Send a complex task in chat to activate the V10 orchestration pipeline.
          12 specialist agents will execute across 6 phases.
        </p>
        <p className="text-xs mt-4 text-gray-600">
          Try: &quot;Build a user auth system with login page, API routes, and tests&quot;
        </p>
        <div className="mt-6 grid grid-cols-6 gap-2">
          {PHASE_ORDER.map((p) => (
            <div key={p} className="text-center">
              <div className="text-[10px] text-gray-600 uppercase">{p}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const currentPhaseIdx = PHASE_ORDER.indexOf(orchestration.phase as OrchestrationPhase);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e] text-white overflow-auto">
      {/* Phase Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${PHASE_COLORS[orchestration.phase]}`}>
            {PHASE_LABELS[orchestration.phase]}
          </span>
          <span className="text-xs text-gray-400">
            {orchestration.agents.filter(a => a.status === 'done').length}/{orchestration.agents.length} agents done
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{orchestration.filesChanged} files</span>
          <span>{orchestration.totalTokens.toLocaleString()} tokens</span>
          <span>
            {orchestration.startedAt
              ? `${(((orchestration.completedAt || Date.now()) - orchestration.startedAt) / 1000).toFixed(1)}s`
              : '0s'}
          </span>
        </div>
      </div>

      {/* 6-Phase Progress Bar */}
      <div className="flex px-4 py-2 gap-1">
        {PHASE_ORDER.map((p, idx) => {
          const isActive = currentPhaseIdx >= idx;
          const isCurrent = orchestration.phase === p;

          return (
            <div key={p} className="flex-1 flex flex-col items-center">
              <div
                className={`h-1.5 w-full rounded ${
                  isActive
                    ? isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
                    : 'bg-gray-700'
                }`}
              />
              <span className={`text-[10px] mt-1 capitalize ${isActive ? 'text-gray-300' : 'text-gray-600'}`}>
                {p}
              </span>
            </div>
          );
        })}
      </div>

      {/* Security Veto Banner */}
      {orchestration.securityVeto.length > 0 && (
        <div className="mx-4 mb-2 p-3 rounded-lg bg-red-900/20 border border-red-700/30 text-sm text-red-300">
          <strong>Security Veto:</strong> {orchestration.securityVeto.join('; ')}
        </div>
      )}

      {/* Checkpoint Banner */}
      {orchestration.pendingCheckpoint && (
        <div className="mx-4 mb-2 p-3 rounded-lg bg-yellow-900/20 border border-yellow-700/30 text-sm text-yellow-300">
          <strong>Checkpoint:</strong> {orchestration.pendingCheckpoint}
        </div>
      )}

      {/* Agent Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {orchestration.agents.map((agent) => (
          <div
            key={agent.name}
            className={`rounded-lg border p-3 transition-all ${STATUS_BG[agent.status]}`}
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 bg-gray-700/50 rounded px-1.5 py-0.5">
                  {AGENT_ICONS[agent.name] || agent.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-medium truncate">{agent.name}</span>
              </div>
              <span className="text-[10px] text-gray-500 capitalize">{agent.phase}</span>
            </div>

            <div className="text-[11px] text-gray-400 mb-2">{agent.role}</div>

            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              {agent.filesCount > 0 && <span>{agent.filesCount} files</span>}
              {agent.tokensUsed > 0 && <span>{agent.tokensUsed.toLocaleString()} tok</span>}
              {agent.issues.length > 0 && (
                <span className="text-red-400">{agent.issues.length} issues</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {orchestration.summary && (
        <div className={`mx-4 mb-4 p-3 rounded-lg text-sm ${
          orchestration.phase === 'failed'
            ? 'bg-red-900/20 border border-red-700/30 text-red-300'
            : 'bg-green-900/20 border border-green-700/30 text-green-300'
        }`}>
          {orchestration.summary}
        </div>
      )}
    </div>
  );
}
