import { create } from 'zustand';

export type PipelineStage = 'plan' | 'db' | 'api' | 'ui' | 'ux_validation' | 'tests' | 'execute' | 'review';
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StageResult {
  stage: PipelineStage;
  status: StageStatus;
  output: string;
  model?: string;
  tokens?: number;
  durationMs?: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineRun {
  id: string;
  featureDescription: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: PipelineStage | null;
  stages: StageResult[];
  totalTokens: number;
  totalDurationMs: number;
  createdAt: number;
  completedAt?: number;
}

export const PIPELINE_STAGES: { id: PipelineStage; label: string; description: string; model: string }[] = [
  { id: 'plan', label: 'Plan', description: 'Analyze requirements and create implementation plan', model: 'deepseek-r1' },
  { id: 'db', label: 'Database', description: 'Design schema and write migrations', model: 'qwen3-coder-next' },
  { id: 'api', label: 'API', description: 'Generate API routes and business logic', model: 'qwen3-coder-next' },
  { id: 'ui', label: 'UI', description: 'Build React components and pages', model: 'qwen3-coder-next' },
  { id: 'ux_validation', label: 'UX Validation', description: 'Verify UI/UX wiring, accessibility, and integration', model: 'deepseek-r1' },
  { id: 'tests', label: 'Tests', description: 'Write unit and integration tests', model: 'qwen3-coder-next' },
  { id: 'execute', label: 'Execute', description: 'Run tests and verify output', model: 'qwen3-coder-next' },
  { id: 'review', label: 'Review', description: 'AI code review and quality check', model: 'deepseek-r1' },
];

interface PipelineState {
  runs: PipelineRun[];
  activeRunId: string | null;

  // Actions
  startRun: (featureDescription: string) => string;
  updateStage: (runId: string, stage: PipelineStage, updates: Partial<StageResult>) => void;
  advanceStage: (runId: string) => void;
  completeRun: (runId: string, status: 'completed' | 'failed' | 'cancelled') => void;
  setActiveRun: (runId: string | null) => void;
  getActiveRun: () => PipelineRun | undefined;
}

let runCounter = 0;

export const usePipelineStore = create<PipelineState>((set, get) => ({
  runs: [],
  activeRunId: null,

  startRun: (featureDescription: string) => {
    runCounter += 1;
    const id = `run-${Date.now()}-${runCounter}`;
    const stages: StageResult[] = PIPELINE_STAGES.map((s) => ({
      stage: s.id,
      status: 'pending' as StageStatus,
      output: '',
    }));
    // Set first stage to running
    stages[0].status = 'running';
    stages[0].startedAt = Date.now();

    const run: PipelineRun = {
      id,
      featureDescription,
      status: 'running',
      currentStage: 'plan',
      stages,
      totalTokens: 0,
      totalDurationMs: 0,
      createdAt: Date.now(),
    };

    set((state) => ({
      runs: [run, ...state.runs],
      activeRunId: id,
    }));

    return id;
  },

  updateStage: (runId, stage, updates) =>
    set((state) => ({
      runs: state.runs.map((run) => {
        if (run.id !== runId) return run;
        return {
          ...run,
          stages: run.stages.map((s) =>
            s.stage === stage ? { ...s, ...updates } : s
          ),
          totalTokens: run.stages.reduce((sum, s) => sum + (s.stage === stage ? (updates.tokens ?? s.tokens ?? 0) : (s.tokens ?? 0)), 0),
        };
      }),
    })),

  advanceStage: (runId) =>
    set((state) => ({
      runs: state.runs.map((run) => {
        if (run.id !== runId || !run.currentStage) return run;
        const currentIdx = PIPELINE_STAGES.findIndex((s) => s.id === run.currentStage);
        if (currentIdx < 0 || currentIdx >= PIPELINE_STAGES.length - 1) return run;

        const nextStage = PIPELINE_STAGES[currentIdx + 1];
        const updatedStages = run.stages.map((s, i) => {
          if (i === currentIdx) {
            return { ...s, status: 'completed' as StageStatus, completedAt: Date.now() };
          }
          if (i === currentIdx + 1) {
            return { ...s, status: 'running' as StageStatus, startedAt: Date.now() };
          }
          return s;
        });

        return {
          ...run,
          currentStage: nextStage.id,
          stages: updatedStages,
        };
      }),
    })),

  completeRun: (runId, status) =>
    set((state) => ({
      runs: state.runs.map((run) => {
        if (run.id !== runId) return run;
        const completedAt = Date.now();
        return {
          ...run,
          status,
          currentStage: null,
          completedAt,
          totalDurationMs: completedAt - run.createdAt,
          stages: run.stages.map((s) =>
            s.status === 'running'
              ? { ...s, status: status === 'completed' ? 'completed' as StageStatus : status === 'cancelled' ? 'skipped' as StageStatus : 'failed' as StageStatus, completedAt }
              : s.status === 'pending'
              ? { ...s, status: 'skipped' as StageStatus }
              : s
          ),
        };
      }),
    })),

  setActiveRun: (runId) => set({ activeRunId: runId }),

  getActiveRun: () => {
    const { runs, activeRunId } = get();
    return runs.find((r) => r.id === activeRunId);
  },
}));
