import { create } from 'zustand';
import type { AgentPlan, AgentStep, AgentEvent } from '@/lib/agents/agentEngine';
import type { OrchestratorEvent } from '@/lib/agents/orchestrator';

export type AgentPhase = 'idle' | 'planning' | 'executing' | 'verifying' | 'fixing' | 'done' | 'failed';
export type OrchestrationPhase = 'idle' | 'understand' | 'design' | 'build' | 'quality' | 'ship' | 'verify' | 'done' | 'failed';

export interface AgentStatus {
  name: string;
  role: string;
  phase: OrchestrationPhase;
  status: 'idle' | 'running' | 'done' | 'failed';
  filesCount: number;
  tokensUsed: number;
  issues: string[];
  durationMs?: number;
}

export interface AgentFile {
  path: string;
  content: string;
  language: string;
}

export interface AgentRunState {
  id: string;
  message: string;
  phase: AgentPhase;
  plan: AgentPlan | null;
  currentStepIndex: number;
  steps: AgentStep[];
  files: AgentFile[];
  events: AgentEvent[];
  thinkingText: string;
  verificationPassed: boolean | null;
  verificationIssues: string[];
  fixAttempt: number;
  maxFixAttempts: number;
  summary: string;
  error: string | null;
  tokensUsed: number;
  durationMs: number;
  startedAt: number;
  completedAt: number | null;
}

export interface OrchestrationState {
  phase: OrchestrationPhase;
  agents: AgentStatus[];
  totalTokens: number;
  filesChanged: number;
  startedAt: number | null;
  completedAt: number | null;
  summary: string;
  pendingCheckpoint: string | null;
  clarifyingQuestions: string[];
  securityVeto: string[];
}

interface AgentState {
  runs: AgentRunState[];
  activeRunId: string | null;
  isRunning: boolean;

  // Orchestration state
  orchestration: OrchestrationState;

  // Actions
  startRun: (message: string) => string;
  processEvent: (runId: string, event: AgentEvent) => void;
  completeRun: (runId: string) => void;
  failRun: (runId: string, error: string) => void;
  setActiveRun: (runId: string | null) => void;
  getActiveRun: () => AgentRunState | undefined;
  clearRuns: () => void;

  // Orchestration actions
  processOrchestratorEvent: (event: OrchestratorEvent) => void;
  resetOrchestration: () => void;
}

let runCounter = 0;

const INITIAL_ORCHESTRATION: OrchestrationState = {
  phase: 'idle',
  agents: [],
  totalTokens: 0,
  filesChanged: 0,
  startedAt: null,
  completedAt: null,
  summary: '',
  pendingCheckpoint: null,
  clarifyingQuestions: [],
  securityVeto: [],
};

export const useAgentStore = create<AgentState>((set, get) => ({
  runs: [],
  activeRunId: null,
  isRunning: false,
  orchestration: { ...INITIAL_ORCHESTRATION },

  startRun: (message: string) => {
    runCounter += 1;
    const id = `agent-${Date.now()}-${runCounter}`;
    const run: AgentRunState = {
      id,
      message,
      phase: 'planning',
      plan: null,
      currentStepIndex: 0,
      steps: [],
      files: [],
      events: [],
      thinkingText: 'Creating execution plan...',
      verificationPassed: null,
      verificationIssues: [],
      fixAttempt: 0,
      maxFixAttempts: 5,
      summary: '',
      error: null,
      tokensUsed: 0,
      durationMs: 0,
      startedAt: Date.now(),
      completedAt: null,
    };

    set((state) => ({
      runs: [run, ...state.runs],
      activeRunId: id,
      isRunning: true,
    }));

    return id;
  },

  processEvent: (runId: string, event: AgentEvent) => {
    set((state) => ({
      runs: state.runs.map((run) => {
        if (run.id !== runId) return run;

        const updated = { ...run, events: [...run.events, event] };

        switch (event.type) {
          case 'plan_created':
            updated.plan = event.plan;
            updated.steps = event.plan.steps;
            updated.phase = 'executing';
            updated.thinkingText = '';
            break;

          case 'step_start':
            updated.currentStepIndex = event.index;
            updated.steps = updated.steps.map((s, i) =>
              i === event.index ? { ...s, status: 'running' } : s
            );
            updated.thinkingText = event.step.description;
            break;

          case 'step_complete':
            updated.steps = updated.steps.map((s, i) =>
              i === event.index ? { ...event.step, status: 'done' } : s
            );
            updated.thinkingText = '';
            break;

          case 'step_failed':
            updated.steps = updated.steps.map((s, i) =>
              i === event.index ? { ...event.step, status: 'failed', error: event.error } : s
            );
            updated.thinkingText = '';
            break;

          case 'thinking':
            updated.thinkingText = event.content;
            break;

          case 'output':
            // General output — append to thinking text
            updated.thinkingText = event.content;
            break;

          case 'file_written':
            updated.files = [
              ...updated.files.filter((f) => f.path !== event.path),
              { path: event.path, content: event.content, language: event.language },
            ];
            break;

          case 'file_edited':
            updated.files = [
              ...updated.files.filter((f) => f.path !== event.path),
              { path: event.path, content: event.newContent, language: 'plaintext' },
            ];
            break;

          case 'verification_start':
            updated.phase = 'verifying';
            updated.thinkingText = event.description;
            break;

          case 'verification_result':
            updated.verificationPassed = event.passed;
            updated.verificationIssues = event.issues;
            if (!event.passed) {
              updated.phase = 'fixing';
            }
            break;

          case 'fix_attempt':
            updated.phase = 'fixing';
            updated.fixAttempt = event.attempt;
            updated.maxFixAttempts = event.maxAttempts;
            updated.thinkingText = `Auto-fix attempt ${event.attempt}/${event.maxAttempts}`;
            break;

          case 'step_action':
            // Action events (commit, create_pr, deploy) — store for client-side execution
            updated.thinkingText = `Executing ${event.action}...`;
            break;

          case 'done':
            updated.phase = 'done';
            updated.summary = event.summary;
            updated.completedAt = Date.now();
            updated.durationMs = Date.now() - updated.startedAt;
            break;

          case 'error':
            updated.phase = 'failed';
            updated.error = event.message;
            updated.completedAt = Date.now();
            updated.durationMs = Date.now() - updated.startedAt;
            break;
        }

        // Update token count from plan if available
        if (updated.plan) {
          updated.tokensUsed = updated.plan.totalTokensUsed;
        }

        return updated;
      }),
    }));
  },

  completeRun: (runId: string) => {
    set((state) => ({
      runs: state.runs.map((run) =>
        run.id === runId
          ? { ...run, phase: 'done' as AgentPhase, completedAt: Date.now(), durationMs: Date.now() - run.startedAt }
          : run
      ),
      isRunning: false,
    }));
  },

  failRun: (runId: string, error: string) => {
    set((state) => ({
      runs: state.runs.map((run) =>
        run.id === runId
          ? { ...run, phase: 'failed' as AgentPhase, error, completedAt: Date.now(), durationMs: Date.now() - run.startedAt }
          : run
      ),
      isRunning: false,
    }));
  },

  setActiveRun: (runId: string | null) => set({ activeRunId: runId }),

  getActiveRun: () => {
    const { runs, activeRunId } = get();
    return runs.find((r) => r.id === activeRunId);
  },

  clearRuns: () => set({ runs: [], activeRunId: null, isRunning: false }),

  processOrchestratorEvent: (event: OrchestratorEvent) => {
    set((state) => {
      const orch = { ...state.orchestration };
      const ev = event as OrchestratorEvent & Record<string, unknown>;

      switch (ev.type) {
        case 'phase_start': {
          const phase = ev.phase as OrchestrationPhase;
          orch.phase = phase;
          if (!orch.startedAt) orch.startedAt = Date.now();
          // Add agents for this phase
          const agentNames = ev.agents as string[] || [];
          for (const name of agentNames) {
            if (!orch.agents.find(a => a.name === name)) {
              orch.agents = [...orch.agents, {
                name, role: name.replace('Agent', ''), phase,
                status: 'idle', filesCount: 0, tokensUsed: 0, issues: [],
              }];
            }
          }
          break;
        }

        case 'phase_complete': {
          orch.totalTokens = (ev.tokensUsed as number) || orch.totalTokens;
          break;
        }

        case 'agent_start': {
          const agentName = ev.agent as string;
          const role = ev.role as string;
          orch.agents = orch.agents.map(a =>
            a.name === agentName ? { ...a, status: 'running' as const, role } : a
          );
          // If agent not yet in list, add it
          if (!orch.agents.find(a => a.name === agentName)) {
            orch.agents = [...orch.agents, {
              name: agentName, role, phase: orch.phase,
              status: 'running', filesCount: 0, tokensUsed: 0, issues: [],
            }];
          }
          break;
        }

        case 'agent_complete': {
          const name = ev.agent as string;
          orch.agents = orch.agents.map(a =>
            a.name === name ? {
              ...a, status: 'done' as const,
              filesCount: (ev.filesCount as number) || 0,
              tokensUsed: (ev.tokensUsed as number) || 0,
              issues: (ev.issues as string[]) || [],
            } : a
          );
          break;
        }

        case 'checkpoint': {
          orch.pendingCheckpoint = ev.name as string;
          break;
        }

        case 'security_veto': {
          orch.securityVeto = (ev.issues as string[]) || [];
          break;
        }

        case 'cost_gate': {
          orch.summary = `Cost gate: ${ev.totalTokens} tokens exceeds budget of ${ev.budget}`;
          break;
        }

        case 'file_written':
          orch.filesChanged += 1;
          break;

        case 'thinking':
          // General thinking events — no phase change needed
          break;

        case 'done':
          orch.phase = 'done';
          orch.completedAt = Date.now();
          if (typeof ev.summary === 'string') {
            orch.summary = ev.summary;
          }
          break;

        case 'error':
          orch.phase = 'failed';
          orch.completedAt = Date.now();
          if (typeof ev.message === 'string') {
            orch.summary = ev.message;
          }
          break;
      }

      return { orchestration: orch };
    });
  },

  resetOrchestration: () => set({ orchestration: { ...INITIAL_ORCHESTRATION } }),
}));
