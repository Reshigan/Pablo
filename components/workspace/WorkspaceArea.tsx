'use client';

import { Code2 } from 'lucide-react';
import { WorkspaceTabs } from './WorkspaceTabs';
import { useUIStore } from '@/stores/ui';

function EditorPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
      <Code2 size={48} className="text-pablo-text-muted" />
      <p className="font-ui text-sm text-pablo-text-dim">No file open</p>
      <p className="font-ui text-xs text-pablo-text-muted">
        Open a file from the sidebar or ask Pablo to generate code
      </p>
    </div>
  );
}

function DiffPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
      <p className="font-ui text-sm text-pablo-text-dim">No diff to display</p>
    </div>
  );
}

function DBDesignerPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
      <p className="font-ui text-sm text-pablo-text-dim">Database Designer</p>
      <p className="font-ui text-xs text-pablo-text-muted">Coming in Phase 7</p>
    </div>
  );
}

function APITesterPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
      <p className="font-ui text-sm text-pablo-text-dim">API Tester</p>
      <p className="font-ui text-xs text-pablo-text-muted">Coming in Phase 7</p>
    </div>
  );
}

function PreviewPlaceholder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
      <p className="font-ui text-sm text-pablo-text-dim">Live Preview</p>
      <p className="font-ui text-xs text-pablo-text-muted">Coming in Phase 7</p>
    </div>
  );
}

export function WorkspaceArea() {
  const { activeWorkspaceTab } = useUIStore();

  const panels = {
    editor: EditorPlaceholder,
    diff: DiffPlaceholder,
    'db-designer': DBDesignerPlaceholder,
    'api-tester': APITesterPlaceholder,
    preview: PreviewPlaceholder,
  };

  const ActivePanel = panels[activeWorkspaceTab];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-pablo-bg">
      <WorkspaceTabs />
      <ActivePanel />
    </div>
  );
}
