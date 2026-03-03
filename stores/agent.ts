import { create } from 'zustand';
import type { AgentPlan, AgentStep, AgentEvent } from '@/lib/agents/agentEngine';

export type AgentPhase = 'idle' | 'planning' | 'executing' | 'verifying' | 'fixing' | 'done' | 'failed';

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

interface AgentState {
  runs: AgentRunState[];
  activeRunId: string | null;
  isRunning: boolean;

  // Actions
  startRun: (message: string) => string;
  processEvent: (runId: string, event: AgentEvent) => void;
  completeRun: (runId: string) => void;
  failRun: (runId: string, error: string) => void;
  setActiveRun: (runId: string | null) => void;
  getActiveRun: () => AgentRunState | undefined;
  clearRuns: () => void;
}

let runCounter = 0;

export const useAgentStore = create<AgentState>((set, get) => ({
  runs: [],
  activeRunId: null,
  isRunning: false,

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
}));
