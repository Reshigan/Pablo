'use client';

import { Code2 } from 'lucide-react';
import { WorkspaceTabs } from './WorkspaceTabs';
import { FileTabs } from './FileTabs';
import { CodeEditor } from './CodeEditor';
import { DiffViewer } from './DiffViewer';
import { DBDesigner } from './DBDesigner';
import { APITester } from './APITester';
import { LivePreview } from './LivePreview';
import { PipelineView } from '@/components/pipeline/PipelineView';
import { useUIStore } from '@/stores/ui';
import { useEditorStore } from '@/stores/editor';

function EditorPanel() {
  const { tabs, activeTabId } = useEditorStore();
  const hasOpenFile = tabs.length > 0 && activeTabId !== null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FileTabs />
      {hasOpenFile ? (
        <CodeEditor />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
          <Code2 size={48} className="text-pablo-text-muted" />
          <p className="font-ui text-sm text-pablo-text-dim">No file open</p>
          <p className="font-ui text-xs text-pablo-text-muted">
            Open a file from the sidebar or ask Pablo to generate code
          </p>
        </div>
      )}
    </div>
  );
}

export function WorkspaceArea() {
  const { activeWorkspaceTab } = useUIStore();

  const panels = {
    editor: EditorPanel,
    diff: DiffViewer,
    'db-designer': DBDesigner,
    'api-tester': APITester,
    preview: LivePreview,
    pipeline: PipelineView,
  };

  const ActivePanel = panels[activeWorkspaceTab];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-pablo-bg">
      <WorkspaceTabs />
      <ActivePanel />
    </div>
  );
}
