/**
 * Feature 21: Activity Feed / Change Log
 * Timeline of everything that happened in a session.
 */

import { create } from 'zustand';

export type ActivityType =
  | 'pipeline_started'
  | 'pipeline_completed'
  | 'pipeline_failed'
  | 'files_generated'
  | 'diff_accepted'
  | 'diff_rejected'
  | 'deploy_started'
  | 'deploy_completed'
  | 'deploy_failed'
  | 'error_detected'
  | 'error_fixed'
  | 'manual_edit'
  | 'git_commit'
  | 'checkpoint_created'
  | 'checkpoint_restored'
  | 'scan_completed'
  | 'prompt_enhanced'
  | 'ai_review';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  message: string;
  metadata?: Record<string, string | number>;
  timestamp: number;
}

interface ActivityState {
  entries: ActivityEntry[];

  addEntry: (type: ActivityType, message: string, metadata?: Record<string, string | number>) => void;
  clearEntries: () => void;
  getRecentEntries: (count: number) => ActivityEntry[];
}

let activityCounter = 0;

export const useActivityStore = create<ActivityState>((set, get) => ({
  entries: [],

  addEntry: (type, message, metadata) => {
    activityCounter += 1;
    const entry: ActivityEntry = {
      id: `act-${Date.now()}-${activityCounter}`,
      type,
      message,
      metadata,
      timestamp: Date.now(),
    };
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, 200), // Keep last 200 entries
    }));
  },

  clearEntries: () => set({ entries: [] }),

  getRecentEntries: (count) => {
    return get().entries.slice(0, count);
  },
}));
