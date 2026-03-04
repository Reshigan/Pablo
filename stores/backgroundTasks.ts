/**
 * Feature 14: Background Agents
 * Track pipeline runs and other background tasks with progress indicators.
 */

import { create } from 'zustand';

export interface BackgroundTask {
  id: string;
  type: 'pipeline' | 'auto-fix' | 'deploy' | 'scan';
  label: string;
  status: 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  startedAt: number;
  completedAt?: number;
  result?: string;
}

interface BackgroundTaskState {
  tasks: BackgroundTask[];

  addTask: (task: Omit<BackgroundTask, 'startedAt'>) => void;
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void;
  removeTask: (id: string) => void;
  getRunningTasks: () => BackgroundTask[];
  clearCompleted: () => void;
}

export const useBackgroundTaskStore = create<BackgroundTaskState>((set, get) => ({
  tasks: [],

  addTask: (task) => {
    set((state) => ({
      tasks: [{ ...task, startedAt: Date.now() }, ...state.tasks],
    }));
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
  },

  getRunningTasks: () => {
    return get().tasks.filter((t) => t.status === 'running');
  },

  clearCompleted: () => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status === 'running'),
    }));
  },
}));
