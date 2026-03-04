'use client';

/**
 * Feature 10: Checkpoints & Rollback
 * Timeline UI in sidebar showing project state history.
 */

import { Clock, RotateCcw, GitBranch, Trash2, Save } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useCheckpointStore, type Checkpoint } from '@/stores/checkpoint';
import { useEditorStore } from '@/stores/editor';
import { useActivityStore } from '@/stores/activity';
import { toast } from '@/stores/toast';

export function CheckpointPanel() {
  const { checkpoints, activeCheckpointId, createCheckpoint, restoreCheckpoint, branchFromCheckpoint, deleteCheckpoint } = useCheckpointStore();
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = useCallback(() => {
    if (!newLabel.trim()) return;
    const tabs = useEditorStore.getState().tabs;
    const files = tabs.map((t) => ({ path: t.path, content: t.content, language: t.language }));
    const id = createCheckpoint(newLabel.trim(), files);
    useActivityStore.getState().addEntry('checkpoint_created', `Checkpoint: ${newLabel.trim()}`);
    toast('Checkpoint saved', newLabel.trim());
    setNewLabel('');
    setShowCreate(false);
  }, [newLabel, createCheckpoint]);

  const handleRestore = useCallback((cp: Checkpoint) => {
    const restored = restoreCheckpoint(cp.id);
    if (!restored) return;

    const editorStore = useEditorStore.getState();
    // Clear existing tabs and load checkpoint files
    for (const tab of editorStore.tabs) {
      editorStore.closeTab(tab.id);
    }
    for (const file of restored.files) {
      editorStore.openFile({
        id: `cp-${cp.id}-${file.path}`,
        path: file.path,
        name: file.path.split('/').pop() || file.path,
        language: file.language,
        content: file.content,
      });
    }
    useActivityStore.getState().addEntry('checkpoint_restored', `Restored: ${cp.label}`);
    toast('Checkpoint restored', cp.label);
  }, [restoreCheckpoint]);

  const handleBranch = useCallback((cp: Checkpoint) => {
    const label = `Branch from: ${cp.label}`;
    branchFromCheckpoint(cp.id, label);
    toast('Branched checkpoint', label);
  }, [branchFromCheckpoint]);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pablo-border px-3 py-2 shrink-0">
        <span className="font-ui text-xs font-medium text-pablo-text">Checkpoints</span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex h-5 items-center gap-1 rounded bg-pablo-gold/10 px-2 font-ui text-[10px] text-pablo-gold transition-colors hover:bg-pablo-gold/20"
        >
          <Save size={10} />
          Save
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border-b border-pablo-border px-3 py-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Checkpoint name..."
            className="mb-1.5 w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={!newLabel.trim()}
            className="w-full rounded bg-pablo-gold px-2 py-1 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30"
          >
            Save Checkpoint
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {checkpoints.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Clock size={24} className="text-pablo-text-muted" />
            <p className="font-ui text-xs text-pablo-text-muted">No checkpoints yet</p>
            <p className="font-ui text-[10px] text-pablo-text-muted">Save checkpoints to track your project history</p>
          </div>
        ) : (
          <div className="py-1">
            {checkpoints.map((cp, idx) => (
              <div
                key={cp.id}
                className={`group relative border-b border-pablo-border/50 px-3 py-2 transition-colors hover:bg-pablo-hover ${
                  cp.id === activeCheckpointId ? 'bg-pablo-gold/5 border-l-2 border-l-pablo-gold' : ''
                }`}
              >
                {/* Timeline connector */}
                {idx < checkpoints.length - 1 && (
                  <div className="absolute left-5 top-8 h-full w-px bg-pablo-border" />
                )}

                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    cp.id === activeCheckpointId ? 'bg-pablo-gold' : 'bg-pablo-text-muted'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-ui text-xs font-medium text-pablo-text truncate">{cp.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-code text-[10px] text-pablo-text-muted">{formatTime(cp.timestamp)}</span>
                      <span className="font-code text-[10px] text-pablo-text-muted">{cp.files.length} files</span>
                    </div>
                  </div>
                </div>

                {/* Actions — visible on hover */}
                <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleRestore(cp)}
                    className="flex h-5 items-center gap-1 rounded bg-pablo-active px-1.5 font-ui text-[10px] text-pablo-text-dim transition-colors hover:bg-pablo-hover"
                    title="Restore this checkpoint"
                  >
                    <RotateCcw size={10} />
                    Restore
                  </button>
                  <button
                    onClick={() => handleBranch(cp)}
                    className="flex h-5 items-center gap-1 rounded bg-pablo-active px-1.5 font-ui text-[10px] text-pablo-text-dim transition-colors hover:bg-pablo-hover"
                    title="Branch from this checkpoint"
                  >
                    <GitBranch size={10} />
                    Branch
                  </button>
                  <button
                    onClick={() => deleteCheckpoint(cp.id)}
                    className="flex h-5 items-center gap-1 rounded px-1.5 font-ui text-[10px] text-pablo-red transition-colors hover:bg-pablo-red/10"
                    title="Delete checkpoint"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
