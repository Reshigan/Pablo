import { create } from 'zustand';
import type { AgentPlan, AgentStep, AgentEvent } from '@/lib/agents/agentEngine';
import type { OrchestratorEvent } from '@/lib/agents/orchestrator';

export type AgentPhase = 'idle' | 'planning' | 'executing' | 'verifying' | 'fixing' | 'done' | 'failed';
export type OrchestrationPhase = 'idle' | 'planning' | 'executing' | 'merging' | 'verifying' | 'done' | 'failed';

export interface WorkerStatus {
  id: string;
  title: string;
  type: string;
  status: 'idle' | 'planning' | 'executing' | 'merging' | 'verifying' | 'done' | 'failed';
  assignedFiles: string[];
  tokensUsed: number;
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
  workers: WorkerStatus[];
  totalTokens: number;
  filesChanged: number;
  startedAt: number | null;
  completedAt: number | null;
  summary: string;
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
  workers: [],
  totalTokens: 0,
  filesChanged: 0,
  startedAt: null,
  completedAt: null,
  summary: '',
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
      // Cast to access dynamic properties on orchestrator events
      const ev = event as OrchestratorEvent & Record<string, unknown>;

      switch (ev.type) {
        case 'thinking':
          // Use thinking events to track orchestration phases
          if (typeof ev.content === 'string') {
            if (ev.content.includes('creating parallel execution plan')) {
              orch.phase = 'planning';
              if (!orch.startedAt) orch.startedAt = Date.now();
            } else if (ev.content.includes('Executing parallel group')) {
              orch.phase = 'executing';
            } else if (ev.content.includes('Merging results')) {
              orch.phase = 'merging';
            }
          }
          break;

        case 'plan_created': {
          orch.phase = 'executing';
          // Extract worker list from plan steps
          const plan = ev.plan as { steps?: Array<{ id: string; description: string }> };
          if (plan?.steps) {
            orch.workers = plan.steps.map((s) => ({
              id: s.id,
              title: s.description,
              type: 'generate',
              status: 'idle' as const,
              assignedFiles: [],
              tokensUsed: 0,
            }));
          }
          break;
        }

        case 'step_start': {
          const step = ev.step as { id?: string; description?: string };
          if (step?.id) {
            orch.workers = orch.workers.map((w) =>
              w.id === step.id ? { ...w, status: 'executing' as const } : w
            );
          }
          break;
        }

        case 'step_complete': {
          const stepDone = ev.step as { id?: string };
          if (stepDone?.id) {
            orch.workers = orch.workers.map((w) =>
              w.id === stepDone.id ? { ...w, status: 'done' as const } : w
            );
          }
          break;
        }

        case 'step_failed': {
          const stepFailed = ev.step as { id?: string };
          if (stepFailed?.id) {
            orch.workers = orch.workers.map((w) =>
              w.id === stepFailed.id ? { ...w, status: 'failed' as const } : w
            );
          }
          break;
        }

        case 'file_written':
          orch.filesChanged += 1;
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
