import { create } from 'zustand';

export interface SessionMetrics {
  totalTokens: number;
  featuresBuilt: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  sessionStartedAt: number;
  modelCalls: Record<string, number>;
  pipelineStagesCompleted: Record<string, number>;
}

interface MetricsState extends SessionMetrics {
  // Actions
  addTokens: (count: number) => void;
  incrementFeatures: () => void;
  recordRequest: (success: boolean) => void;
  recordModelCall: (model: string) => void;
  recordPipelineStage: (stage: string) => void;
  getSessionDuration: () => number;
  getSuccessRate: () => number;
  reset: () => void;
}

const initialMetrics: SessionMetrics = {
  totalTokens: 0,
  featuresBuilt: 0,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  sessionStartedAt: Date.now(),
  modelCalls: {},
  pipelineStagesCompleted: {},
};

export const useMetricsStore = create<MetricsState>((set, get) => ({
  ...initialMetrics,

  addTokens: (count) =>
    set((state) => ({ totalTokens: state.totalTokens + count })),

  incrementFeatures: () =>
    set((state) => ({ featuresBuilt: state.featuresBuilt + 1 })),

  recordRequest: (success) =>
    set((state) => ({
      totalRequests: state.totalRequests + 1,
      successfulRequests: state.successfulRequests + (success ? 1 : 0),
      failedRequests: state.failedRequests + (success ? 0 : 1),
    })),

  recordModelCall: (model) =>
    set((state) => ({
      modelCalls: {
        ...state.modelCalls,
        [model]: (state.modelCalls[model] ?? 0) + 1,
      },
    })),

  recordPipelineStage: (stage) =>
    set((state) => ({
      pipelineStagesCompleted: {
        ...state.pipelineStagesCompleted,
        [stage]: (state.pipelineStagesCompleted[stage] ?? 0) + 1,
      },
    })),

  getSessionDuration: () => {
    return Date.now() - get().sessionStartedAt;
  },

  getSuccessRate: () => {
    const { totalRequests, successfulRequests } = get();
    if (totalRequests === 0) return 0;
    return Math.round((successfulRequests / totalRequests) * 100);
  },

  reset: () => set({ ...initialMetrics, sessionStartedAt: Date.now() }),
}));
