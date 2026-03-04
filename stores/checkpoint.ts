/**
 * Feature 10: Checkpoints & Rollback
 * Save project state at any point. Rollback if it fails.
 */

import { create } from 'zustand';

export interface Checkpoint {
  id: string;
  label: string;
  timestamp: number;
  files: Array<{ path: string; content: string; language: string }>;
  pipelineRunId?: string;
  parentCheckpointId?: string;
}

interface CheckpointState {
  checkpoints: Checkpoint[];
  activeCheckpointId: string | null;

  createCheckpoint: (label: string, files?: Array<{ path: string; content: string; language: string }>) => string;
  restoreCheckpoint: (id: string) => Checkpoint | null;
  branchFromCheckpoint: (id: string, label: string) => string;
  deleteCheckpoint: (id: string) => void;
  getCheckpoint: (id: string) => Checkpoint | undefined;
}

let cpCounter = 0;

export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  checkpoints: [],
  activeCheckpointId: null,

  createCheckpoint: (label, files) => {
    cpCounter += 1;
    const id = `cp-${Date.now()}-${cpCounter}`;

    // If no files provided, grab from editor store
    const checkpointFiles = files || (() => {
      try {
        const { useEditorStore } = require('@/stores/editor') as typeof import('@/stores/editor');
        return useEditorStore.getState().tabs.map((t) => ({
          path: t.path,
          content: t.content,
          language: t.language,
        }));
      } catch {
        return [];
      }
    })();

    const checkpoint: Checkpoint = {
      id,
      label,
      timestamp: Date.now(),
      files: checkpointFiles,
      parentCheckpointId: get().activeCheckpointId || undefined,
    };

    set((state) => ({
      checkpoints: [checkpoint, ...state.checkpoints],
      activeCheckpointId: id,
    }));

    return id;
  },

  restoreCheckpoint: (id) => {
    const checkpoint = get().checkpoints.find((c) => c.id === id);
    if (!checkpoint) return null;

    set({ activeCheckpointId: id });
    return checkpoint;
  },

  branchFromCheckpoint: (id, label) => {
    const source = get().checkpoints.find((c) => c.id === id);
    if (!source) return '';

    cpCounter += 1;
    const newId = `cp-${Date.now()}-${cpCounter}`;
    const branched: Checkpoint = {
      id: newId,
      label,
      timestamp: Date.now(),
      files: [...source.files],
      parentCheckpointId: id,
    };

    set((state) => ({
      checkpoints: [branched, ...state.checkpoints],
      activeCheckpointId: newId,
    }));

    return newId;
  },

  deleteCheckpoint: (id) => {
    set((state) => ({
      checkpoints: state.checkpoints.filter((c) => c.id !== id),
      activeCheckpointId:
        state.activeCheckpointId === id ? null : state.activeCheckpointId,
    }));
  },

  getCheckpoint: (id) => {
    return get().checkpoints.find((c) => c.id === id);
  },
}));
